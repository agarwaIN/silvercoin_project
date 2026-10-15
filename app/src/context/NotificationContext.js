import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import notificationApi from '../api/notificationApi';

const defaultContext = {
  notifications: [],
  unreadCount: 0,
  loading: false,
  refreshing: false,
  fetchNotifications: async () => {},
  fetchUnreadCount: async () => {},
  markAsRead: async () => {},
  markAllAsRead: async () => {},
};

const NotificationContext = createContext(defaultContext);

export function NotificationProvider({ children }) {
  const { user, token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isFetchingRef = useRef(false);

  const fetchUnreadCount = useCallback(async () => {
    if (!token || !user) return;
    try {
      const data = await notificationApi.getUnreadCount();
      if (typeof data?.unreadCount === 'number') {
        setUnreadCount(data.unreadCount);
      }
    } catch (err) {
      // Non-fatal, suppress background polling error
    }
  }, [token, user]);

  const fetchNotifications = useCallback(async (isPullToRefresh = false) => {
    if (!token || !user) return;
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (isPullToRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await notificationApi.getNotifications();
      const list = Array.isArray(data?.notifications) ? data.notifications : [];
      setNotifications(list);
      if (typeof data?.unreadCount === 'number') {
        setUnreadCount(data.unreadCount);
      } else {
        const unread = list.filter(n => !n.isRead).length;
        setUnreadCount(unread);
      }
    } catch (err) {
      console.warn('[NotificationContext] Failed to load notifications:', err?.message || err);
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFetchingRef.current = false;
    }
  }, [token, user]);

  const markAsRead = useCallback(async (notificationId) => {
    if (!notificationId) return;
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.notificationId === notificationId ? { ...n, isRead: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      const data = await notificationApi.markAsRead(notificationId);
      if (typeof data?.unreadCount === 'number') {
        setUnreadCount(data.unreadCount);
      }
    } catch (err) {
      console.warn('[NotificationContext] Failed to mark as read:', err?.message || err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      const data = await notificationApi.markAllAsRead();
      if (typeof data?.unreadCount === 'number') {
        setUnreadCount(data.unreadCount);
      }
    } catch (err) {
      console.warn('[NotificationContext] Failed to mark all as read:', err?.message || err);
    }
  }, []);

  // Poll notifications periodically when user is logged in
  useEffect(() => {
    if (!token || !user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    fetchNotifications();

    const interval = setInterval(() => {
      fetchUnreadCount();
    }, 20000);

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        fetchUnreadCount();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [token, user, fetchNotifications, fetchUnreadCount]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        refreshing,
        fetchNotifications,
        fetchUnreadCount,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}

export default NotificationContext;
