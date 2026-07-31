const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./mongoService');
const { sendLoginOtpEmail } = require('./emailService');
const twilio = require('twilio');

const PURPOSE_LOGIN = 'login';
const PURPOSE_CHANGE_PASSWORD = 'change_password';
const PURPOSE_FORGOT_PASSWORD = 'forgot_password';

const twilioClient = process.env.TWILIO_ACCOUNT_SID 
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) 
  : null;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function formatMobile(mobile) {
  if (!mobile) return null;
  const defaultCountryCode = process.env.DEFAULT_COUNTRY_CODE || '+91';
  return mobile.startsWith('+') ? mobile : `${defaultCountryCode}${mobile}`;
}

async function createSession({ userId, purpose, mobile, email }) {
  const sessionId = uuidv4();
  const formattedMobile = formatMobile(mobile);
  let devOtp = null;
  let otpHash = null;

  if (formattedMobile && twilioClient && verifyServiceSid) {
    try {
      await twilioClient.verify.v2.services(verifyServiceSid)
        .verifications.create({ to: formattedMobile, channel: 'sms' });
      console.log(`[otp] Sent Twilio Verify SMS to ${formattedMobile} for ${purpose}`);
    } catch (err) {
      console.error('[otp] Twilio SMS error:', err);
    }
  } else {
    devOtp = generateOtp();
    otpHash = await bcrypt.hash(devOtp, 10);
    console.log(`[otp] ${purpose} code for ${email || userId}: ${devOtp}`);
    if (email) await sendLoginOtpEmail(email, devOtp);
  }

  const session = {
    sessionId,
    userId,
    purpose,
    otpHash,
    mobile: formattedMobile || null,
    email: email || null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
  await db.createOtpSession(session);
  return { sessionId, otp: devOtp };
}

async function verifySessionOtp(sessionId, otp) {
  const session = await db.getOtpSession(sessionId);
  if (!session) return { ok: false, message: 'Invalid or expired session' };
  
  if (new Date(session.expiresAt) < new Date()) {
    await db.deleteOtpSession(sessionId);
    return { ok: false, message: 'Code expired' };
  }

  let isValid = false;

  if (session.mobile && twilioClient && !session.otpHash) {
    try {
      const verificationCheck = await twilioClient.verify.v2.services(verifyServiceSid)
        .verificationChecks.create({ to: session.mobile, code: otp });
      if (verificationCheck.status === 'approved') {
        isValid = true;
      }
    } catch (err) {
      console.error('[otp] Twilio verify error:', err.message);
    }
  } else if (session.otpHash) {
    isValid = await bcrypt.compare(String(otp), session.otpHash);
  }

  if (!isValid) return { ok: false, message: 'Invalid code' };

  await db.deleteOtpSession(sessionId);
  return { ok: true, session };
}

async function startLoginOtp(user) {
  const { sessionId, otp } = await createSession({
    userId: user.userId,
    purpose: PURPOSE_LOGIN,
    mobile: user.mobile,
    email: user.email,
  });
  return { sessionId, message: 'Enter the verification code.', devOtp: otp };
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
  const { sessionId, otp } = await createSession({
    userId: user.userId,
    purpose: PURPOSE_CHANGE_PASSWORD,
    mobile: user.mobile,
    email: user.email,
  });
  return { sessionId, devOtp: otp };
}

async function startForgotPasswordOtp(user) {
  const { sessionId, otp } = await createSession({
    userId: user.userId,
    purpose: PURPOSE_FORGOT_PASSWORD,
    mobile: user.mobile,
    email: user.email,
  });
  return { sessionId, devOtp: otp };
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
