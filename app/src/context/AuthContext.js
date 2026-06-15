import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { setAuthToken, registerSessionInvalidHandler } from '../api';
import { fetchCurrentUser } from '../api/authApi';

const defaultAuthState = {
  user: null,
  token: null,
  loading: true,
  justCompletedSetup: false,
  sessionMessage: null,
  signIn: async () => {},
  signOut: async () => {},
  refreshUser: async () => {},
  completeFirstLogin: async () => {},
  clearJustCompletedSetup: () => {},
  clearSessionMessage: () => {},
};

const AuthContext = createContext(defaultAuthState);

function normalizeStoredUser(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  return {
    ...raw,
    isFirstLogin: raw.isFirstLogin === true,
  };
}

function isAccountInvalidError(err) {
  const status = err?.response?.status;
  const data = err?.response?.data;
  if (status !== 401) return false;
  const code = data?.code;
  if (
    code === 'ACCOUNT_REMOVED'
    || code === 'ACCOUNT_INACTIVE'
    || code === 'INVALID_TOKEN'
  ) {
    return true;
  }
  const msg = String(data?.message || '').toLowerCase();
  return msg.includes('no longer exists') || msg.includes('inactive');
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [justCompletedSetup, setJustCompletedSetup] = useState(false);
  const [sessionMessage, setSessionMessage] = useState(null);
  const signingOutRef = useRef(false);

  const clearStoredSession = useCallback(async () => {
    await Promise.all([
      SecureStore.deleteItemAsync('accessToken'),
      SecureStore.deleteItemAsync('user'),
    ]);
    setAuthToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const forceSignOut = useCallback(async (message) => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    try {
      await clearStoredSession();
      if (message) {
        setSessionMessage(message);
      }
    } finally {
      signingOutRef.current = false;
    }
  }, [clearStoredSession]);

  useEffect(() => {
    registerSessionInvalidHandler((message) => {
      void forceSignOut(message);
    });
  }, [forceSignOut]);

  useEffect(() => {
    (async () => {
      try {
        const [stored, storedUser] = await Promise.all([
          SecureStore.getItemAsync('accessToken'),
          SecureStore.getItemAsync('user'),
        ]);
        if (stored && storedUser) {
          setAuthToken(stored);
          setToken(stored);
          let userData = normalizeStoredUser(JSON.parse(storedUser));
          setUser(userData);
          try {
            const data = await fetchCurrentUser();
            if (data?.user) {
              userData = normalizeStoredUser({ ...userData, ...data.user });
              await SecureStore.setItemAsync('user', JSON.stringify(userData));
              setUser(userData);
            }
          } catch (err) {
            if (isAccountInvalidError(err)) {
              await clearStoredSession();
              setSessionMessage(
                err.response?.data?.message || 'Your session has ended. Please sign in again.',
              );
            }
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, [clearStoredSession]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' || !token) return;
      fetchCurrentUser().catch((err) => {
        if (isAccountInvalidError(err)) {
          void forceSignOut(
            err.response?.data?.message || 'Your session has ended. Please sign in again.',
          );
        }
      });
    });
    return () => sub.remove();
  }, [token, forceSignOut]);

  const signIn = async (accessToken, userData) => {
    setSessionMessage(null);
    setJustCompletedSetup(false);
    const normalized = normalizeStoredUser(userData);
    await Promise.all([
      SecureStore.setItemAsync('accessToken', accessToken),
      SecureStore.setItemAsync('user', JSON.stringify(normalized)),
    ]);
    setAuthToken(accessToken);
    setToken(accessToken);
    setUser(normalized);
  };

  const signOut = async () => {
    setSessionMessage(null);
    await clearStoredSession();
  };

  const refreshUser = useCallback(async (updates) => {
    let updated;
    setUser((prev) => {
      const base = prev || {};
      updated =
        updates && typeof updates === 'object' && updates.userId
          ? { ...base, ...updates }
          : { ...base, ...updates };
      if ('isFirstLogin' in updated) {
        updated.isFirstLogin = updated.isFirstLogin === true;
      }
      return updated;
    });
    await SecureStore.setItemAsync('user', JSON.stringify(updated));
  }, []);

  const completeFirstLogin = useCallback(async (serverUser) => {
    setJustCompletedSetup(true);
    let updated;
    setUser((prev) => {
      updated = normalizeStoredUser({
        ...(prev || {}),
        ...(serverUser && typeof serverUser === 'object' ? serverUser : {}),
        role: serverUser?.role || prev?.role,
        isFirstLogin: false,
      });
      return updated;
    });
    if (updated) {
      await SecureStore.setItemAsync('user', JSON.stringify(updated));
    }
  }, []);

  const clearJustCompletedSetup = useCallback(() => {
    setJustCompletedSetup(false);
  }, []);

  const clearSessionMessage = useCallback(() => {
    setSessionMessage(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        justCompletedSetup,
        sessionMessage,
        signIn,
        signOut,
        refreshUser,
        completeFirstLogin,
        clearJustCompletedSetup,
        clearSessionMessage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext) ?? defaultAuthState;
