const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const jwt = require('jsonwebtoken');

const ROOT = path.join(__dirname, '../../uploads');

function absPath(key) {
  const safe = String(key).replace(/^\/+/, '');
  const full = path.resolve(ROOT, safe);
  if (!full.startsWith(`${ROOT}${path.sep}`) && full !== ROOT) {
    throw new Error('Invalid file key');
  }
  return full;
}

async function uploadBuffer(key, buffer) {
  const filePath = absPath(key);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, buffer);
  return key;
}

async function openDownloadStream(key) {
  const filePath = absPath(key);
  try {
    await fsp.access(filePath);
  } catch {
    throw new Error('File not found');
  }
  const ext = path.extname(filePath).toLowerCase();
  const byExt = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
  };
  return {
    stream: fs.createReadStream(filePath),
    contentType: byExt[ext] || 'application/octet-stream',
  };
}

async function getPresignedUrl(key, expiresIn = 3600) {
  const secret = process.env.JWT_SECRET || 'silvercoin_secret_key_default';
  const token = jwt.sign(
    { key, type: 'file_access' },
    secret,
    { expiresIn }
  );

  const host = process.env.PUBLIC_ORIGIN || process.env.APP_PUBLIC_ORIGIN || 'http://13.200.237.51';

  return `${host.replace(/\/+$/, '')}/api/files/download?key=${encodeURIComponent(key)}&token=${token}`;
}

module.exports = {
  uploadBuffer,
  getPresignedUrl,
  openDownloadStream,
};
