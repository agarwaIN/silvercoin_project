import api from './index';

export const notificationApi = {
  getNotifications: async (params = {}) => {
    const res = await api.get('/notifications', { params });
    return res.data;
  },

  getUnreadCount: async () => {
    const res = await api.get('/notifications/unread-count');
    return res.data;
  },

  markAsRead: async (notificationId) => {
    const res = await api.patch(`/notifications/${notificationId}/read`);
    return res.data;
  },

  markAllAsRead: async () => {
    const res = await api.patch('/notifications/read-all');
    return res.data;
  },
};

export default notificationApi;
