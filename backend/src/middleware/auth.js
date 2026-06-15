const jwt = require('jsonwebtoken');
const { getUserById } = require('../services/mongoService');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided', code: 'NO_TOKEN' });
  }
  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token', code: 'INVALID_TOKEN' });
  }

  if (!decoded?.userId) {
    return res.status(401).json({ message: 'Invalid or expired token', code: 'INVALID_TOKEN' });
  }

  const user = await getUserById(decoded.userId);
  if (!user) {
    return res.status(401).json({
      message: 'This account no longer exists. Please sign in again.',
      code: 'ACCOUNT_REMOVED',
    });
  }
  if (user.isActive === false) {
    return res.status(401).json({
      message: 'This account is inactive. Contact your administrator.',
      code: 'ACCOUNT_INACTIVE',
    });
  }

  req.user = {
    userId: user.userId,
    role: user.role,
    name: user.name,
    email: user.email,
  };
  next();
};

module.exports = {
  verifyToken,
};
