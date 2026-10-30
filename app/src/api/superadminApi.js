import api from './index';
import { normalizeLoanStatus } from '../utils/loanSearch';

export const getAllUsers = () =>
  api.get('/superadmin/users').then((r) => {
    const users = r.data || [];
    return {
      admins: users.filter((u) => u.role === 'admin'),
      employees: users.filter((u) => u.role === 'employee'),
      all: users,
    };
  });

export const getAllLoans = () => api.get('/superadmin/loans').then((r) => (Array.isArray(r.data) ? r.data.map(normalizeLoanStatus) : r.data));

export const getLoan = (loanId) => api.get(`/superadmin/loans/${loanId}`).then((r) => normalizeLoanStatus(r.data));

export const createAdmin = (data) => api.post('/superadmin/create-user', { ...data, role: 'admin' }).then((r) => r.data);

export const deactivateUser = (userId) => api.patch(`/superadmin/users/${userId}/deactivate`).then((r) => r.data);

export const activateUser = (userId) => api.patch(`/superadmin/users/${userId}/activate`).then((r) => r.data);

export const deleteUser = (userId) => api.delete(`/superadmin/users/${userId}`).then((r) => r.data);

export const getMediaPreview = (loanId) => api.get(`/superadmin/loans/${loanId}/media-preview`).then((r) => r.data);
export const updateLoanDates = (loanId, data) => api.post(`/superadmin/loans/${loanId}/update-dates`, data).then((r) => r.data);
export const deletePropertyDocument = (loanId, payload = {}) =>
  api.post(`/superadmin/loans/${loanId}/delete-document`, payload).then((r) => r.data);


