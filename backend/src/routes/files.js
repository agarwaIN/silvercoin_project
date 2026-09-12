const express = require('express');
const jwt = require('jsonwebtoken');
const { openDownloadStream } = require('../services/fileStorageService');

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
