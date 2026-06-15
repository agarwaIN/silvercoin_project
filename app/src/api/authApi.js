import api from './index';

export const login = (mobile, password) =>
  api.post('/auth/login', { mobile, password }).then((r) => r.data);

export const verifyOtp = (sessionId, otp) =>
  api.post('/auth/verify-otp', { sessionId, otp }).then((r) => r.data);

export const resendOtp = (sessionId) =>
  api.post('/auth/resend-otp', { sessionId }).then((r) => r.data);

export const requestChangePasswordOtp = () =>
  api.post('/auth/change-password/request-otp').then((r) => r.data);

export const changePassword = (sessionId, otp, newPassword, confirmPassword) =>
  api.post('/auth/change-password', { sessionId, otp, newPassword, confirmPassword }).then((r) => r.data);

export const fetchCurrentUser = () =>
  api.get('/auth/me').then((r) => r.data);

export const resendChangePasswordOtp = (sessionId) =>
  api.post('/auth/change-password/resend-otp', { sessionId }).then((r) => r.data);

export const requestForgotPasswordOtp = (mobile) =>
  api.post('/auth/forgot-password/request', { mobile }).then((r) => r.data);

export const confirmForgotPassword = (sessionId, otp, newPassword, confirmPassword) =>
  api.post('/auth/forgot-password/confirm', { sessionId, otp, newPassword, confirmPassword }).then((r) => r.data);

export const resendForgotPasswordOtp = (sessionId) =>
  api.post('/auth/forgot-password/resend-otp', { sessionId }).then((r) => r.data);
