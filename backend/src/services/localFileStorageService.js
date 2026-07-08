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
  const token = jwt.sign({ key, type: 'file_access' }, process.env.JWT_SECRET, { expiresIn });
  const port = process.env.PORT || 8000;
  const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod';
  const renderUrl = process.env.RENDER_EXTERNAL_URL || (isProd ? 'https://silvercoin-project.onrender.com' : null);
  const host = process.env.PUBLIC_ORIGIN || renderUrl || `http://localhost:${port}`;
  return `${host.replace(/\/+$/, '')}/api/files/download?key=${encodeURIComponent(key)}&token=${token}`;
}

module.exports = {
  uploadBuffer,
  getPresignedUrl,
  openDownloadStream,
};
