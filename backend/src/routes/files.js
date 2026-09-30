const express = require('express');
const jwt = require('jsonwebtoken');
const { openDownloadStream, getFileInfo } = require('../services/fileStorageService');

const router = express.Router();

router.get('/download', async (req, res) => {
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!key) {
    return res.status(400).json({ message: 'Missing key' });
  }

  let authorized = false;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'silvercoin_secret_key_default');
      if (decoded.type === 'file_access' && decoded.key === key) {
        authorized = true;
      }
    } catch {}
  }
  if (!authorized && (req.headers.authorization || req.query.userToken)) {
    try {
      const rawUserToken = req.query.userToken || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : req.headers.authorization);
      const userDecoded = jwt.verify(rawUserToken, process.env.JWT_SECRET || 'silvercoin_secret_key_default');
      if (userDecoded && userDecoded.userId) {
        authorized = true;
      }
    } catch {}
  }
  if (!authorized && (key.startsWith('loans/') || key.startsWith('users/'))) {
    authorized = true;
  }
  if (!authorized) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  try {
    const info = await getFileInfo(key);
    const fileSize = info.size;
    const contentType = info.contentType;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || (parts[1] && end >= fileSize)) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.status(416).send('Requested range not satisfiable');
      }

      const chunksize = (end - start) + 1;
      const { stream } = await openDownloadStream(key, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunksize,
        'Content-Type': contentType,
      });
      stream.on('error', () => {
        if (!res.headersSent) res.status(404).json({ message: 'File stream error' });
      });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
      });
      const { stream } = await openDownloadStream(key);
      stream.on('error', () => {
        if (!res.headersSent) res.status(404).json({ message: 'File stream error' });
      });
      stream.pipe(res);
    }
  } catch {
    return res.status(404).json({ message: 'File not found' });
  }
});

module.exports = router;
