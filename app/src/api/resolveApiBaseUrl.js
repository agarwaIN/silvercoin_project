import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { DEV_API_PORT, PRODUCTION_API_ORIGIN } from '../config/api';

export function normalizeApiBaseUrl(raw) {
  if (raw == null || String(raw).trim() === '') return '';
  let s = String(raw).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) {
    s = `http://${s}`;
  }
  let url;
  try {
    url = new URL(s);
  } catch {
    return String(raw).trim().replace(/\/+$/, '');
  }
  const path = (url.pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/') {
    url.pathname = '/api';
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

function metroLanHost() {
  const hostUri =
    Constants.expoConfig?.hostUri
    ?? Constants.expoGoConfig?.debuggerHost
    ?? Constants.manifest2?.extra?.expoGo?.debuggerHost
    ?? Constants.manifest?.debuggerHost;

  if (!hostUri || typeof hostUri !== 'string') return null;
  const host = hostUri.split(':')[0]?.trim();
  return host || null;
}

export function resolveDevApiOrigin() {
  const port = DEV_API_PORT;
  const lan = metroLanHost();
  if (lan && lan !== 'localhost' && lan !== '127.0.0.1') {
    return `http://${lan}:${port}`;
  }
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${port}`;
  }
  return `http://localhost:${port}`;
}

let _loggedDevBase = '';

export function logDevApiBaseIfChanged(base) {
  if (!__DEV__ || !base || base === _loggedDevBase) return;
  _loggedDevBase = base;
}

export function resolveApiBaseUrlForApp() {
  if (!__DEV__) {
    const origin = PRODUCTION_API_ORIGIN.replace(/\/+$/, '');
    return normalizeApiBaseUrl(`${origin}/api`);
  }

  const origin = resolveDevApiOrigin();
  return normalizeApiBaseUrl(`${origin}/api`);
}
