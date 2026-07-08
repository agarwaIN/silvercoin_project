const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../services/mongoService');
const {
  startLoginOtp,
  verifyLoginOtp,
  resendLoginOtp,
  resendOtp,
  startChangePasswordOtp,
  startForgotPasswordOtp,
  verifyPasswordOtp,
  canChangePassword,
  PURPOSE_CHANGE_PASSWORD,
  PURPOSE_FORGOT_PASSWORD,
} = require('../services/otpService');
const { verifyToken } = require('../middleware/auth');
const { normalizeMobileToE164 } = require('../utils/phone');
const { isValidPassword } = require('../utils/password');

const router = express.Router();

function issueAccessToken(user) {
  return jwt.sign(
    { userId: user.userId, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN },
  );
}

function buildUserPayload(user) {
  const userPayload = {
    userId: user.userId,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    isFirstLogin: user.role === 'superadmin' ? false : user.isFirstLogin === true,
  };
  if (user.role === 'admin') {
    userPayload.hasOrganizationLogo = !!(user.organizationLogoKey);
  }
  return userPayload;
}

async function findActiveUserByMobile(mobileInput) {
  const normalized = normalizeMobileToE164(mobileInput);
  if (!normalized.ok) return { user: null, error: normalized.error };
  const user = await db.getUserByMobile(normalized.e164);
  if (!user || !user.isActive) return { user: null, error: null };
  if (!user.passwordHash || typeof user.passwordHash !== 'string') {
    return { user: null, error: null };
  }
  return { user, error: null };
}

function validatePasswordPair(newPassword, confirmPassword, res) {
  if (!isValidPassword(newPassword)) {
    res.status(400).json({
      message:
        'Password must be 6–32 characters and use only letters, numbers, and allowed symbols (!@#$%^&*()_+-=[]{}|;:,.?).',
    });
    return false;
  }
  if (newPassword !== confirmPassword) {
    res.status(400).json({ message: 'Passwords do not match' });
    return false;
  }
  return true;
}

function notImplemented(res) {
  return res.status(501).json({ message: 'Not implemented yet' });
}

router.post('/login', [
  body('mobile').trim().notEmpty(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const normalized = normalizeMobileToE164(req.body.mobile);
  if (!normalized.ok) return res.status(400).json({ message: normalized.error });

  const user = await db.getUserByMobile(normalized.e164);
  if (!user) return res.status(404).json({ message: 'No account found with this mobile number.' });
  if (!user.isActive) return res.status(403).json({ message: 'This account is inactive. Contact your administrator.' });
  if (!user.passwordHash) return res.status(401).json({ message: 'Incorrect password.' });

  const match = await bcrypt.compare(req.body.password, user.passwordHash);
  if (!match) return res.status(401).json({ message: 'Incorrect password.' });

  const otpSession = await startLoginOtp(user);
  res.json({
    otpRequired: true,
    message: 'Enter the verification code.',
    ...otpSession,
  });
});

router.post('/verify-otp', [
  body('sessionId').trim().notEmpty(),
  body('otp').trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const result = await verifyLoginOtp(req.body.sessionId, req.body.otp);
  if (!result.ok) return res.status(401).json({ message: result.message });

  if (result.user.role === 'superadmin' && result.user.isFirstLogin) {
    await db.updateUser(result.user.userId, { isFirstLogin: false });
    result.user.isFirstLogin = false;
  }

  res.json({
    accessToken: issueAccessToken(result.user),
    user: buildUserPayload(result.user),
  });
});

router.post('/resend-otp', [body('sessionId').trim().notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const result = await resendLoginOtp(req.body.sessionId);
  if (!result.ok) return res.status(400).json({ message: result.message });
  res.json({ message: 'Enter the verification code.', sessionId: result.sessionId });
});

router.post('/forgot-password/request', [body('mobile').trim().notEmpty()], async (req, res) => {
  const { user, error: mobileError } = await findActiveUserByMobile(req.body.mobile);
  if (mobileError) return res.status(400).json({ message: mobileError });
  if (!user) return res.status(404).json({ message: 'No account found with this mobile number.' });
  if (user.role === 'superadmin') {
    return res.status(403).json({ message: 'Password reset is not available for this account.' });
  }

  const otpSession = await startForgotPasswordOtp(user);
  res.json({ message: 'Enter the verification code.', ...otpSession });
});

router.post('/forgot-password/confirm', [
  body('sessionId').trim().notEmpty(),
  body('otp').trim().notEmpty(),
  body('newPassword').notEmpty(),
  body('confirmPassword').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { sessionId, otp, newPassword, confirmPassword } = req.body;
  if (!validatePasswordPair(newPassword, confirmPassword, res)) return;

  const result = await verifyPasswordOtp(sessionId, otp, PURPOSE_FORGOT_PASSWORD);
  if (!result.ok) return res.status(401).json({ message: result.message });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.updateUser(result.user.userId, { passwordHash, isFirstLogin: false });
  res.json({ message: 'Password reset successfully. You can sign in now.' });
});

router.post('/forgot-password/resend-otp', [body('sessionId').trim().notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const result = await resendOtp(req.body.sessionId, PURPOSE_FORGOT_PASSWORD);
  if (!result.ok) return res.status(400).json({ message: result.message });
  res.json({ message: 'Enter the verification code.', sessionId: result.sessionId });
});

router.post('/change-password/request-otp', verifyToken, async (req, res) => {
  const user = await db.getUserById(req.user.userId);
  if (!user || !user.isActive) return res.status(404).json({ message: 'Account not found' });
  if (user.role === 'superadmin') {
    return res.status(403).json({ message: 'Superadmin password cannot be changed in the app.' });
  }
  if (!canChangePassword(user)) {
    return res.status(400).json({ message: 'No mobile number on file. Contact your administrator.' });
  }

  const otpSession = await startChangePasswordOtp(user);
  res.json({ message: 'Enter the verification code.', ...otpSession });
});

router.post('/change-password', verifyToken, [
  body('sessionId').optional({ checkFalsy: true }).trim(),
  body('otp').optional({ checkFalsy: true }).trim(),
  body('newPassword').notEmpty(),
  body('confirmPassword').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { sessionId, otp, newPassword, confirmPassword } = req.body;
  if (!validatePasswordPair(newPassword, confirmPassword, res)) return;

  const user = await db.getUserById(req.user.userId);
  if (!user || !user.isActive) return res.status(404).json({ message: 'User not found' });

  if (user.isFirstLogin) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.updateUser(user.userId, { passwordHash, isFirstLogin: false });
    return res.json({ message: 'Password updated successfully.' });
  }

  if (!sessionId || !otp) {
    return res.status(400).json({ message: 'Verification code is required.' });
  }

  const result = await verifyPasswordOtp(sessionId, otp, PURPOSE_CHANGE_PASSWORD);
  if (!result.ok) return res.status(401).json({ message: result.message });
  if (result.user.userId !== user.userId) return res.status(403).json({ message: 'Unauthorized' });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.updateUser(user.userId, { passwordHash, isFirstLogin: false });
  res.json({ message: 'Password updated successfully.' });
});

router.post('/change-password/resend-otp', verifyToken, [body('sessionId').trim().notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const result = await resendOtp(req.body.sessionId, PURPOSE_CHANGE_PASSWORD);
  if (!result.ok) return res.status(400).json({ message: result.message });
  res.json({ message: 'Enter the verification code.', sessionId: result.sessionId });
});

router.get('/me', verifyToken, async (req, res) => {
  const user = await db.getUserById(req.user.userId);
  if (!user || !user.isActive) {
    return res.status(401).json({ code: 'ACCOUNT_REMOVED', message: 'Your account no longer exists.' });
  }
  res.json(buildUserPayload(user));
});

module.exports = router;
