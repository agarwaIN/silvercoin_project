const { getNextLoanSeq } = require('./mongoService');

async function generateLoanId() {
  const seq = await getNextLoanSeq('placeholder');
  return `LN-${seq}`;
}

module.exports = { generateLoanId };
