import api from './index';

export const getAllUsers = () =>
  api.get('/superadmin/users').then((r) => {
    const users = r.data || [];
    return {
      admins: users.filter((u) => u.role === 'admin'),
      employees: users.filter((u) => u.role === 'employee'),
    };
  });

export const getAllLoans = () => api.get('/superadmin/loans').then((r) => r.data);
