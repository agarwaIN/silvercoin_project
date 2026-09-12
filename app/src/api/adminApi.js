import api from './index';

export const getEmployees = () => api.get('/admin/employees').then((r) => r.data);
export const createEmployee = (data) => api.post('/admin/create-employee', data).then((r) => r.data);
export const updateEmployeeAccessRights = (userId, accessRights) =>
  api.patch(`/admin/employees/${userId}/access-rights`, { accessRights }).then((r) => r.data);
export const deactivateEmployee = (userId) => api.patch(`/admin/employees/${userId}/deactivate`).then((r) => r.data);
export const deleteEmployee = (userId) => api.delete(`/admin/employees/${userId}`).then((r) => r.data);
export const getLoans = () => api.get('/admin/loans').then((r) => r.data);
export const getLoan = (loanId) => api.get(`/admin/loans/${loanId}`).then((r) => r.data);
export const getLoanMediaPreview = (loanId) =>
  api.get(`/admin/loans/${loanId}/media-preview`).then((r) => r.data);
export const uploadRegistryDocument = (loanId, formData, meta = {}) => {
  const params = [];
  if (meta.docType) params.push(`docType=${encodeURIComponent(meta.docType)}`);
  if (meta.name) params.push(`name=${encodeURIComponent(meta.name)}`);
  if (meta.date) params.push(`date=${encodeURIComponent(meta.date)}`);
  const qs = params.length > 0 ? `?${params.join('&')}` : '';
  return api.post(`/admin/loans/${loanId}/registry-document${qs}`, formData).then((r) => r.data);
};
export const initialApproveLoan = (loanId, data) => api.post(`/admin/loans/${loanId}/initial-approve`, data).then((r) => r.data);
export const approveLoan = (loanId, data) => api.post(`/admin/loans/${loanId}/approve`, data).then((r) => r.data);
export const rejectLoan = (loanId, reason) => api.post(`/admin/loans/${loanId}/reject`, { reason }).then((r) => r.data);
export const sendQr = (loanId) => api.post(`/admin/loans/${loanId}/send-qr`).then((r) => r.data);
export const getRecovery = () => api.get('/admin/recovery').then((r) => r.data);
export const markEmiPaid = (loanId, paymentId) =>
  api.post(`/admin/loans/${loanId}/mark-emi-paid`, { paymentId }).then((r) => r.data);
export const payEmi = (loanId, paymentId, amount, paymentMode = 'Cash', txnRef = '') =>
  api.post(`/admin/loans/${loanId}/pay-emi`, { paymentId, amount, paymentMode, transactionRef: txnRef, txnRef }).then((r) => r.data);
export const rejectEmiProof = (loanId, paymentId) =>
  api.post(`/admin/loans/${loanId}/reject-proof`, { paymentId }).then((r) => r.data);
export const getProfile = () => api.get('/admin/profile').then((r) => r.data);
export const patchProfile = (body) => api.patch('/admin/profile', body).then((r) => r.data);
export const uploadOrganizationLogo = (formData) =>
  api.post('/admin/profile/organization-logo', formData).then((r) => r.data);
export const getEmiThisMonth = () => api.get('/admin/emi-this-month').then((r) => r.data);
export const getRecoveryAgents = () => api.get('/admin/recovery-agents').then((r) => r.data);
export const createRecoveryAgent = (data) => api.post('/admin/create-recovery-agent', data).then((r) => r.data);
export const assignRecoveryAgent = (loanId, recoveryAgentId) =>
  api.post(`/admin/loans/${loanId}/assign-recovery-agent`, { recoveryAgentId }).then((r) => r.data);
export const sendQrToAgent = (loanId) => api.post(`/admin/loans/${loanId}/send-qr-to-agent`).then((r) => r.data);
export const approveEmiChange = (loanId) => api.post(`/admin/loans/${loanId}/approve-emi-change`).then((r) => r.data);
export const rejectEmiChange = (loanId) => api.post(`/admin/loans/${loanId}/reject-emi-change`).then((r) => r.data);
export const getAdminReports = () => api.get('/admin/reports').then((r) => r.data);
export const processLoan = (loanId, data) => api.post(`/admin/loans/${loanId}/process`, data).then((r) => r.data);
export const returnLoan = (loanId, reason) => api.post(`/admin/loans/${loanId}/return`, { reason }).then((r) => r.data);
export const disburseLoan = (loanId, data) => api.post(`/admin/loans/${loanId}/disburse`, data).then((r) => r.data);
export const approveForeclosure = (loanId) => api.post(`/admin/loans/${loanId}/approve-foreclosure`).then((r) => r.data);
