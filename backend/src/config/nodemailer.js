function getEmailHealthStatus() {
  return { delivery: 'stub', smtp: 'stub' };
}

module.exports = {
  getEmailHealthStatus,
  hasSmtpConfig: () => false,
  wantsEmailDelivery: () => false,
  verifySmtpConnection: async () => ({ ok: true }),
};
