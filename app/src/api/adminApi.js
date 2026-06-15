import api from './index';

export const getEmployees = () => api.get('/admin/employees').then((r) => r.data);
export const createEmployee = (data) => api.post('/admin/create-employee', data).then((r) => r.data);
export const deactivateEmployee = (userId) => api.patch(`/admin/employees/${userId}/deactivate`).then((r) => r.data);
export const getLoans = () => api.get('/admin/loans').then((r) => r.data);
export const getLoan = (loanId) => api.get(`/admin/loans/${loanId}`).then((r) => r.data);
export const getLoanMediaPreview = (loanId) =>
  api.get(`/admin/loans/${loanId}/media-preview`).then((r) => r.data);
export const initialApproveLoan = (loanId, data) => api.post(`/admin/loans/${loanId}/initial-approve`, data).then((r) => r.data);
export const approveLoan = (loanId, loanStartDate) => api.post(`/admin/loans/${loanId}/approve`, { loanStartDate }).then((r) => r.data);
export const rejectLoan = (loanId, reason) => api.post(`/admin/loans/${loanId}/reject`, { reason }).then((r) => r.data);
export const sendQr = (loanId) => api.post(`/admin/loans/${loanId}/send-qr`).then((r) => r.data);
export const getRecovery = () => api.get('/admin/recovery').then((r) => r.data);
export const markEmiPaid = (loanId, paymentId) =>
  api.post(`/admin/loans/${loanId}/mark-emi-paid`, { paymentId }).then((r) => r.data);
export const rejectEmiProof = (loanId, paymentId) =>
  api.post(`/admin/loans/${loanId}/reject-proof`, { paymentId }).then((r) => r.data);
export const getProfile = () => api.get('/admin/profile').then((r) => r.data);
export const patchProfile = (body) => api.patch('/admin/profile', body).then((r) => r.data);
export const uploadOrganizationLogo = (formData) =>
  api.post('/admin/profile/organization-logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
export const getEmiThisMonth = () => api.get('/admin/emi-this-month').then((r) => r.data);
export const getRecoveryAgents = () => api.get('/admin/recovery-agents').then((r) => r.data);
export const createRecoveryAgent = (data) => api.post('/admin/create-recovery-agent', data).then((r) => r.data);
export const assignRecoveryAgent = (loanId, recoveryAgentId) =>
  api.post(`/admin/loans/${loanId}/assign-recovery-agent`, { recoveryAgentId }).then((r) => r.data);
export const sendQrToAgent = (loanId) => api.post(`/admin/loans/${loanId}/send-qr-to-agent`).then((r) => r.data);
