import api from './index';

export const getProfile = () => api.get('/employee/profile').then((r) => r.data);
export const patchProfile = (body) => api.patch('/employee/profile', body).then((r) => r.data);
export const getLoans = () => api.get('/employee/loans').then((r) => r.data);
export const getLoan = (loanId) => api.get(`/employee/loans/${loanId}`).then((r) => r.data);
export const createLoan = () => api.post('/employee/loans').then((r) => r.data);
export const updateLoan = (loanId, data) => api.patch(`/employee/loans/${loanId}`, data).then((r) => r.data);
export const uploadRegistryDocument = (loanId, formData) =>
  api.post(`/employee/loans/${loanId}/registry-document`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
export const submitLoan = (loanId) => api.post(`/employee/loans/${loanId}/submit`).then((r) => r.data);
export const getLoanPdf = (loanId) => api.get(`/employee/loans/${loanId}/pdf`).then((r) => r.data);

export const getLoanMediaPreview = (loanId) =>
  api.get(`/employee/loans/${loanId}/media-preview`).then((r) => r.data);

export const uploadPropertyPhotos = (loanId, formData) =>
  api.post(`/employee/loans/${loanId}/upload-photo`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const uploadVideo = (loanId, formData) =>
  api.post(`/employee/loans/${loanId}/upload-video`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const submitAgreement = (loanId, formData) =>
  api.post(`/employee/loans/${loanId}/agreement`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const markOwnerNotInterested = (loanId) =>
  api.post(`/employee/loans/${loanId}/owner-not-interested`).then((r) => r.data);
export const getEmiThisMonth = () => api.get('/employee/emi-this-month').then((r) => r.data);
export const getRecoveryAgents = () => api.get('/employee/recovery-agents').then((r) => r.data);
export const assignRecoveryAgent = (loanId, recoveryAgentId) =>
  api.post(`/employee/loans/${loanId}/assign-recovery-agent`, { recoveryAgentId }).then((r) => r.data);
export const sendQrToAgent = (loanId) => api.post(`/employee/loans/${loanId}/send-qr-to-agent`).then((r) => r.data);
