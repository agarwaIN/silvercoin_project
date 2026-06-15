async function noop() {
  return { ok: true };
}

module.exports = {
  sendCredentials: noop,
  sendLoginOtpEmail: noop,
  sendLoanSubmittedEmail: noop,
  sendLoanApprovedEmail: noop,
  sendLoanRejectedEmail: noop,
  sendEmiReminderEmail: noop,
  sendQrToEmployeeEmail: noop,
  sendQrToAgentEmail: noop,
  sendRecoveryAgentAssignedEmail: noop,
  sendEmiProofUploadedEmail: noop,
};
