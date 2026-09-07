import api from './index';

export const getAllUsers = () =>
  api.get('/superadmin/users').then((r) => {
    const users = r.data || [];
    return {
      admins: users.filter((u) => u.role === 'admin'),
      employees: users.filter((u) => u.role === 'employee'),
      all: users,
    };
  });

export const getAllLoans = () => api.get('/superadmin/loans').then((r) => r.data);

export const getLoan = (loanId) => api.get(`/superadmin/loans/${loanId}`).then((r) => r.data);

export const createAdmin = (data) => api.post('/superadmin/create-user', { ...data, role: 'admin' }).then((r) => r.data);

export const deactivateUser = (userId) => api.patch(`/superadmin/users/${userId}/deactivate`).then((r) => r.data);

export const activateUser = (userId) => api.patch(`/superadmin/users/${userId}/activate`).then((r) => r.data);

export const deleteUser = (userId) => api.delete(`/superadmin/users/${userId}`).then((r) => r.data);

export const getMediaPreview = (loanId) => api.get(`/superadmin/loans/${loanId}/media-preview`).then((r) => r.data);

