const express = require('express');
const jwt = require('jsonwebtoken');
const { openDownloadStream } = require('../services/fileStorageService');

const router = express.Router();

router.get('/download', async (req, res) => {
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!key || !token) {
    return res.status(400).json({ message: 'Missing key or token' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
  if (decoded.type !== 'file_access' || decoded.key !== key) {
    return res.status(403).json({ message: 'Invalid file token' });
  }

  try {
    const { stream, contentType } = await openDownloadStream(key);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ message: 'File not found' });
    });
    stream.pipe(res);
  } catch {
    return res.status(404).json({ message: 'File not found' });
  }
});

module.exports = router;
