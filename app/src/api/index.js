import axios from 'axios';
import { resolveApiBaseUrlForApp, logDevApiBaseIfChanged } from './resolveApiBaseUrl';

const api = axios.create({
  timeout: 120_000,
});

let _token = null;
let _devBaseUrl = null;
let _onSessionInvalid = null;

const AUTH_ATTEMPT_PATHS = [
  '/auth/login',
  '/auth/verify-otp',
  '/auth/resend-otp',
  '/auth/forgot-password',
];

function isAuthAttempt(url) {
  if (!url) return false;
  return AUTH_ATTEMPT_PATHS.some((path) => url.includes(path));
}

function isSessionInvalidResponse(status, data) {
  if (status !== 401) return false;
  const code = data?.code;
  if (
    code === 'ACCOUNT_REMOVED'
    || code === 'ACCOUNT_INACTIVE'
    || code === 'INVALID_TOKEN'
    || code === 'NO_TOKEN'
  ) {
    return true;
  }
  const msg = String(data?.message || '').toLowerCase();
  return msg.includes('no longer exists') || msg.includes('inactive');
}

export function registerSessionInvalidHandler(handler) {
  _onSessionInvalid = handler;
}

export function setAuthToken(token) {
  _token = token;
}

function applyBaseUrl(config) {
  if (__DEV__) {
    const next = resolveApiBaseUrlForApp();
    if (next !== _devBaseUrl) {
      _devBaseUrl = next;
      logDevApiBaseIfChanged(next);
    }
    config.baseURL = _devBaseUrl || undefined;
  } else if (!config.baseURL) {
    config.baseURL = resolveApiBaseUrlForApp() || undefined;
  }
  return config;
}

api.interceptors.request.use((config) => {
  applyBaseUrl(config);
  if (_token) config.headers.Authorization = `Bearer ${_token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data;
    const url = error.config?.url || '';
    if (_token && !isAuthAttempt(url) && isSessionInvalidResponse(status, data)) {
      const message = data?.message || 'Your session has ended. Please sign in again.';
      void _onSessionInvalid?.(message);
    }
    return Promise.reject(error);
  },
);

export default api;
