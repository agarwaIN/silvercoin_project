const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const jwt = require('jsonwebtoken');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const BUCKET = process.env.AWS_S3_BUCKET || 'silvercoin-media-897021975250';
const REGION = process.env.AWS_REGION || 'ap-south-1';

// Local disk fallback directory (where older files reside on the EC2 server)
const LOCAL_ROOT = path.join(__dirname, '../../uploads');

function normalizeKey(key) {
  if (!key || typeof key !== 'string') return '';
  return key.replace(/\\/g, '/').replace(/^\/+/, '');
}

function absLocalPath(key) {
  const safe = normalizeKey(key);
  if (!safe) throw new Error('Invalid file key');
  const full = path.resolve(LOCAL_ROOT, safe);
  if (!full.startsWith(`${LOCAL_ROOT}${path.sep}`) && full !== LOCAL_ROOT) {
    throw new Error('Invalid file key');
  }
  return full;
}

function getContentType(keyOrExt) {
  const ext = path.extname(keyOrExt).toLowerCase();
  const byExt = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v',
    '.3gp': 'video/3gpp',
    '.avi': 'video/x-msvideo',
  };
  return byExt[ext] || 'application/octet-stream';
}

let cachedS3Client = null;
function getS3Client() {
  if (!cachedS3Client) {
    const options = {
      region: REGION,
    };
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      options.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID.trim(),
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY.trim(),
      };
      if (process.env.AWS_SESSION_TOKEN) {
        options.credentials.sessionToken = process.env.AWS_SESSION_TOKEN.trim();
      }
    }
    cachedS3Client = new S3Client(options);
  }
  return cachedS3Client;
}

/**
 * Uploads a file buffer directly to S3.
 * Zero bytes are stored on the EC2 server hard disk, preventing ENOSPC errors.
 */
async function uploadBuffer(key, buffer) {
  const cleanKey = normalizeKey(key);
  if (!cleanKey) throw new Error('Invalid file key');

  const client = getS3Client();
  const contentType = getContentType(cleanKey);

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: cleanKey,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return cleanKey;
  } catch (err) {
    console.error(`S3 upload failed for ${cleanKey}:`, err.message);
    // If S3 credentials fail, attempt local emergency fallback
    try {
      const filePath = absLocalPath(cleanKey);
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      await fsp.writeFile(filePath, buffer);
      console.warn(`Saved ${cleanKey} to local fallback disk`);
      return cleanKey;
    } catch (localErr) {
      throw new Error(`Upload failed: ${err.message}`);
    }
  }
}

/**
 * Generates an ultra-fast direct AWS S3 presigned URL with SigV4.
 * High-speed video streaming and image rendering served directly from S3.
 */
async function getPresignedUrl(key, expiresIn = 86400) {
  if (!key) return null;
  if (typeof key !== 'string') {
    if (typeof key === 'object' && key.uri && typeof key.uri === 'string') {
      key = key.uri;
    } else {
      return null;
    }
  }
  if (
    key.startsWith('http://') ||
    key.startsWith('https://') ||
    key.startsWith('data:') ||
    key.startsWith('file://')
  ) {
    return key;
  }

  const cleanKey = normalizeKey(key);
  if (!cleanKey) return null;

  // Generate direct S3 Presigned URL
  try {
    const client = getS3Client();
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: cleanKey,
    });
    const url = await getSignedUrl(client, command, { expiresIn });
    return url;
  } catch (err) {
    console.warn(`S3 signed URL error for ${cleanKey}, using fallback:`, err.message);
    return getLocalDownloadUrl(cleanKey, expiresIn);
  }
}

function getLocalDownloadUrl(key, expiresIn = 3600) {
  try {
    const secret = process.env.JWT_SECRET || 'silvercoin_secret_key_default';
    const token = jwt.sign({ key, type: 'file_access' }, secret, { expiresIn });

    let host =
      process.env.PUBLIC_ORIGIN ||
      process.env.APP_PUBLIC_ORIGIN ||
      'http://13.200.237.51:5000';
    if (host.includes('13.200.237.51') && !host.includes(':5000') && !host.startsWith('https://')) {
      host = `${host}:5000`;
    }
    return `${host.replace(/\/+$/, '')}/api/files/download?key=${encodeURIComponent(key)}&token=${token}`;
  } catch {
    return null;
  }
}

/**
 * Retrieves file metadata from S3, with fallback to local disk.
 */
async function getFileInfo(key) {
  const cleanKey = normalizeKey(key);
  const client = getS3Client();

  // Try S3 first
  try {
    const head = await client.send(
      new HeadObjectCommand({
        Bucket: BUCKET,
        Key: cleanKey,
      })
    );
    return {
      size: head.ContentLength,
      contentType: head.ContentType || getContentType(cleanKey),
      source: 's3',
    };
  } catch (s3Err) {
    // If not in S3, check local disk fallback
    try {
      const localPath = absLocalPath(cleanKey);
      await fsp.access(localPath);
      const stat = await fsp.stat(localPath);
      return {
        filePath: localPath,
        size: stat.size,
        contentType: getContentType(localPath),
        source: 'local',
      };
    } catch {
      throw new Error('File not found');
    }
  }
}

/**
 * Opens a download stream supporting HTTP range requests for video playback.
 */
async function openDownloadStream(key, rangeOptions = null) {
  const cleanKey = normalizeKey(key);
  const client = getS3Client();

  // Try S3 first
  try {
    const params = {
      Bucket: BUCKET,
      Key: cleanKey,
    };
    if (rangeOptions) {
      params.Range = `bytes=${rangeOptions.start}-${rangeOptions.end}`;
    }
    const res = await client.send(new GetObjectCommand(params));
    return {
      stream: res.Body,
      contentType: res.ContentType || getContentType(cleanKey),
      size: res.ContentLength,
    };
  } catch (s3Err) {
    // Local disk fallback
    try {
      const localPath = absLocalPath(cleanKey);
      const stat = await fsp.stat(localPath);
      const streamOptions = rangeOptions
        ? { start: rangeOptions.start, end: rangeOptions.end }
        : undefined;
      return {
        stream: fs.createReadStream(localPath, streamOptions),
        contentType: getContentType(localPath),
        size: stat.size,
        filePath: localPath,
      };
    } catch {
      throw new Error('File not found');
    }
  }
}

/**
 * Deletes a file from S3 and cleans up any local copy.
 */
async function deleteFile(key) {
  if (!key || typeof key !== 'string') return;
  const cleanKey = normalizeKey(key);

  const client = getS3Client();
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: cleanKey,
      })
    );
  } catch (err) {
    // Silently continue
  }

  // Also remove from local disk if it was stored there
  try {
    const localPath = absLocalPath(cleanKey);
    await fsp.unlink(localPath);
  } catch {}
}

module.exports = {
  uploadBuffer,
  getPresignedUrl,
  openDownloadStream,
  getFileInfo,
  deleteFile,
  BUCKET,
  REGION,
};
