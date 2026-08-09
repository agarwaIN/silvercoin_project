const { v4: uuidv4 } = require('uuid');
const db = require('../services/mongoService');

// Middleware to log changes
const auditLog = async (req, res, next) => {
  // Capture the original send method to hook into the response
  const originalSend = res.json;

  res.json = async function (body) {
    res.json = originalSend;

    // Only log successful modifications (POST, PATCH, PUT, DELETE)
    if (req.method !== 'GET' && res.statusCode >= 200 && res.statusCode < 300) {
      try {
        const log = {
          logId: uuidv4(),
          userId: req.user ? req.user.userId : 'system',
          role: req.user ? req.user.role : 'system',
          method: req.method,
          url: req.originalUrl,
          body: req.body, // In production, sensitive fields should be redacted
          params: req.params,
          timestamp: new Date().toISOString(),
          ip: req.ip,
          userAgent: req.get('User-Agent')
        };
        await db.createAuditLog(log);
      } catch (err) {
        console.error('Audit Log Error:', err);
      }
    }
    
    return res.json(body);
  };

  next();
};

module.exports = { auditLog };
