const { getNextLoanSeq } = require('./mongoService');

async function generateAppId() {
  const seq = await getNextLoanSeq('app');
  return `APP-${seq}`;
}

async function generateDisplayLoanId() {
  const seq = await getNextLoanSeq('loan');
  return `SL-${seq}`;
}

module.exports = { generateAppId, generateDisplayLoanId };
