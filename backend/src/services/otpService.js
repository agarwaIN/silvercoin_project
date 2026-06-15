const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./mongoService');
const { sendLoginOtpEmail } = require('./emailService');

const PURPOSE_LOGIN = 'login';
const PURPOSE_CHANGE_PASSWORD = 'change_password';
const PURPOSE_FORGOT_PASSWORD = 'forgot_password';

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function createSession({ userId, purpose, mobile, email }) {
  const otp = generateOtp();
  const sessionId = uuidv4();
  const session = {
    sessionId,
    userId,
    purpose,
    otpHash: await bcrypt.hash(otp, 10),
    mobile: mobile || null,
    email: email || null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
  await db.createOtpSession(session);
  console.log(`[otp] ${purpose} code for ${mobile || email || userId}: ${otp}`);
  if (email) await sendLoginOtpEmail(email, otp);
  return { sessionId, otp };
}

async function verifySessionOtp(sessionId, otp) {
  const session = await db.getOtpSession(sessionId);
  if (!session) return { ok: false, message: 'Invalid or expired session' };
  if (new Date(session.expiresAt) < new Date()) {
    await db.deleteOtpSession(sessionId);
    return { ok: false, message: 'Code expired' };
  }
  const match = await bcrypt.compare(String(otp), session.otpHash);
  if (!match) return { ok: false, message: 'Invalid code' };
  await db.deleteOtpSession(sessionId);
  return { ok: true, session };
}

async function startLoginOtp(user) {
  const { sessionId } = await createSession({
    userId: user.userId,
    purpose: PURPOSE_LOGIN,
    mobile: user.mobile,
    email: user.email,
  });
  return { sessionId, message: 'Enter the verification code.' };
}

async function verifyLoginOtp(sessionId, otp) {
  const result = await verifySessionOtp(sessionId, otp);
  if (!result.ok) return result;
  const user = await db.getUserById(result.session.userId);
  if (!user || !user.isActive) return { ok: false, message: 'Account unavailable' };
  return { ok: true, user };
}

async function resendLoginOtp(sessionId) {
  const old = await db.getOtpSession(sessionId);
  if (!old || old.purpose !== PURPOSE_LOGIN) {
    return { ok: false, message: 'Invalid session' };
  }
  await db.deleteOtpSession(sessionId);
  const user = await db.getUserById(old.userId);
  if (!user) return { ok: false, message: 'User not found' };
  return startLoginOtp(user);
}

async function resendOtp(sessionId, purpose = PURPOSE_LOGIN) {
  const old = await db.getOtpSession(sessionId);
  if (!old || old.purpose !== purpose) {
    return { ok: false, message: 'Invalid session' };
  }
  await db.deleteOtpSession(sessionId);
  const user = await db.getUserById(old.userId);
  if (!user) return { ok: false, message: 'User not found' };
  if (purpose === PURPOSE_LOGIN) return startLoginOtp(user);
  if (purpose === PURPOSE_CHANGE_PASSWORD) return startChangePasswordOtp(user);
  if (purpose === PURPOSE_FORGOT_PASSWORD) return startForgotPasswordOtp(user);
  return { ok: false, message: 'Invalid session' };
}

async function startChangePasswordOtp(user) {
  const { sessionId } = await createSession({
    userId: user.userId,
    purpose: PURPOSE_CHANGE_PASSWORD,
    mobile: user.mobile,
    email: user.email,
  });
  return { sessionId };
}

async function startForgotPasswordOtp(user) {
  const { sessionId } = await createSession({
    userId: user.userId,
    purpose: PURPOSE_FORGOT_PASSWORD,
    mobile: user.mobile,
    email: user.email,
  });
  return { sessionId };
}

async function verifyPasswordOtp(sessionId, otp, purpose) {
  const session = await db.getOtpSession(sessionId);
  if (!session || session.purpose !== purpose) {
    return { ok: false, message: 'Invalid or expired session' };
  }
  const result = await verifySessionOtp(sessionId, otp);
  if (!result.ok) return result;
  const user = await db.getUserById(result.session.userId);
  if (!user) return { ok: false, message: 'User not found' };
  return { ok: true, user };
}

function canChangePassword(user) {
  return user.role !== 'superadmin';
}

module.exports = {
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
};
