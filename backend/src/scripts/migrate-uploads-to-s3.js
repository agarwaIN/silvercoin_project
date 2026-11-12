const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');

require('dotenv').config();

const BUCKET = process.env.AWS_S3_BUCKET || 'silvercoin-media-897021975250';
const REGION = process.env.AWS_REGION || 'ap-south-1';
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

const shouldDeleteLocal = process.argv.includes('--delete-local');

function getS3Client() {
  const options = { region: REGION };
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    options.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID.trim(),
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY.trim(),
    };
  }
  return new S3Client(options);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const byExt = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
  };
  return byExt[ext] || 'application/octet-stream';
}

async function getAllFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = await fsp.readdir(dirPath, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);
    if (file.isDirectory()) {
      await getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  }

  return arrayOfFiles;
}

async function migrate() {
  console.log(`\n======================================================`);
  console.log(`Starting S3 Migration -> Bucket: ${BUCKET} (${REGION})`);
  console.log(`Source uploads folder: ${UPLOADS_DIR}`);
  console.log(`Delete local files after upload: ${shouldDeleteLocal ? 'YES' : 'NO'}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(UPLOADS_DIR)) {
    console.log('No local uploads directory found. Nothing to migrate.');
    return;
  }

  const allFiles = await getAllFiles(UPLOADS_DIR);
  console.log(`Found ${allFiles.length} file(s) to migrate.\n`);

  if (allFiles.length === 0) {
    console.log('Zero files found in uploads directory.');
    return;
  }

  const client = getS3Client();
  let uploadedCount = 0;
  let alreadyExistsCount = 0;
  let errorCount = 0;
  let totalBytes = 0;

  for (let i = 0; i < allFiles.length; i++) {
    const filePath = allFiles[i];
    const relKey = path.relative(UPLOADS_DIR, filePath).replace(/\\/g, '/');
    const stat = await fsp.stat(filePath);
    const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);

    try {
      // Check if already in S3
      let existsInS3 = false;
      try {
        await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: relKey }));
        existsInS3 = true;
      } catch (e) {
        existsInS3 = false;
      }

      if (existsInS3) {
        console.log(`[${i + 1}/${allFiles.length}] Already in S3: ${relKey} (${sizeMb} MB)`);
        alreadyExistsCount++;
      } else {
        const fileBuffer = await fsp.readFile(filePath);
        await client.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: relKey,
            Body: fileBuffer,
            ContentType: getContentType(filePath),
          })
        );
        console.log(`[${i + 1}/${allFiles.length}] Uploaded: ${relKey} (${sizeMb} MB)`);
        uploadedCount++;
        totalBytes += stat.size;
      }

      if (shouldDeleteLocal) {
        await fsp.unlink(filePath);
        console.log(`   Deleted local copy of ${relKey} to free space.`);
      }
    } catch (err) {
      console.error(`[${i + 1}/${allFiles.length}] FAILED: ${relKey}:`, err.message);
      errorCount++;
    }
  }

  const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
  console.log(`\n======================================================`);
  console.log(`Migration Complete!`);
  console.log(`Uploaded to S3: ${uploadedCount} file(s) (~${totalMb} MB)`);
  console.log(`Already existed in S3: ${alreadyExistsCount} file(s)`);
  console.log(`Failed: ${errorCount} file(s)`);
  console.log(`======================================================\n`);

  if (!shouldDeleteLocal && uploadedCount > 0) {
    console.log(`NOTE: Local files were kept. To free up disk space on your server, run:`);
    console.log(`node src/scripts/migrate-uploads-to-s3.js --delete-local\n`);
  }
}

migrate().catch((err) => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});

