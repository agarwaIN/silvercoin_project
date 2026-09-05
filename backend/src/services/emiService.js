const db = require('./mongoService');

/**
 * Adds months to a date string while respecting end of month.
 * @param {string|Date} dateStr 
 * @param {number} monthsToAdd 
 * @returns {string} YYYY-MM-DD
 */
function addMonths(dateStr, monthsToAdd) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    d.setTime(Date.now());
  }
  const originalDate = d.getDate();
  const targetMonth = d.getMonth() + monthsToAdd;
  d.setMonth(targetMonth);
  if (d.getDate() < originalDate) {
    d.setDate(0);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Ensures EMI repayment schedule exists for a loan.
 * If not present, generates monthly EMIs for the tenure.
 * @param {Object} loan 
 * @returns {Promise<Array>} List of EMI objects
 */
async function ensureEmiSchedule(loan) {
  if (!loan || !loan.loanId) return [];

  const existing = await db.listEmiByLoan(loan.loanId);
  if (existing && existing.length > 0) {
    return existing;
  }

  const tenure = parseInt(loan.tenureMonths || loan.repaymentMonths, 10);
  const emiAmount = Number(loan.emiAmount || 0);

  if (!tenure || tenure <= 0 || !emiAmount || emiAmount <= 0) {
    return [];
  }

  // Determine loan start date
  let startDate = loan.loanStartDate;
  if (!startDate && loan.disbursements && loan.disbursements.length > 0 && loan.disbursements[0].date) {
    startDate = loan.disbursements[0].date;
  }
  if (!startDate) {
    startDate = loan.createdAt || new Date().toISOString();
  }

  const regularEmi = Math.round(emiAmount);
  const totalRepayable = Number(loan.totalRepayable) || (regularEmi * tenure);
  const lastEmi = totalRepayable - (regularEmi * (tenure - 1));

  const generatedEmis = [];
  for (let i = 0; i < tenure; i++) {
    const isLast = (i === tenure - 1);
    const dueDate = addMonths(startDate, i + 1);
    const amount = isLast ? Math.max(0, lastEmi) : regularEmi;
    const paymentId = `${loan.loanId}-EMI-${String(i + 1).padStart(2, '0')}`;

    const emi = {
      paymentId,
      loanId: loan.loanId,
      dueDate,
      amount,
      paidAmount: 0,
      penaltyAmount: 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    try {
      await db.createEmiPayment(emi);
      generatedEmis.push(emi);
    } catch (err) {
      console.warn(`Could not create EMI ${paymentId}:`, err.message);
    }
  }

  return generatedEmis;
}

/**
 * Reschedules remaining unpaid EMIs when an EMI change is approved.
 * @param {Object} loan 
 * @param {Object} newTerms 
 */
async function rescheduleEmis(loan, newTerms) {
  const currentEmis = await db.listEmiByLoan(loan.loanId);
  const paidEmis = currentEmis.filter(e => e.status === 'paid');
  const unpaidEmis = currentEmis.filter(e => e.status !== 'paid');

  // Remove unpaid EMIs
  for (const emi of unpaidEmis) {
    try {
      await db.deleteEmiPayment(emi.paymentId);
    } catch (err) {
      console.warn(`Could not delete EMI ${emi.paymentId}:`, err.message);
    }
  }

  const newTenure = parseInt(newTerms.tenureMonths, 10) || 0;
  const remainingTenure = Math.max(1, newTenure - paidEmis.length);
  const newEmiAmount = Math.round(Number(newTerms.emiAmount || 0));

  // Next base date from last paid EMI or now
  let baseDate = new Date().toISOString().slice(0, 10);
  if (paidEmis.length > 0) {
    baseDate = paidEmis[paidEmis.length - 1].dueDate;
  }

  const updatedEmis = [];
  for (let i = 0; i < remainingTenure; i++) {
    const emiIndex = paidEmis.length + i + 1;
    const paymentId = `${loan.loanId}-EMI-${String(emiIndex).padStart(2, '0')}`;
    const dueDate = addMonths(baseDate, i + 1);

    const emi = {
      paymentId,
      loanId: loan.loanId,
      dueDate,
      amount: newEmiAmount,
      paidAmount: 0,
      penaltyAmount: 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    try {
      await db.createEmiPayment(emi);
      updatedEmis.push(emi);
    } catch (err) {
      console.warn(`Could not create rescheduled EMI ${paymentId}:`, err.message);
    }
  }

  return [...paidEmis, ...updatedEmis];
}

/**
 * Marks all pending EMIs as closed/paid upon loan foreclosure.
 * @param {string} loanId 
 */
async function closeEmisForForeclosure(loanId) {
  const emis = await db.listEmiByLoan(loanId);
  for (const emi of emis) {
    if (emi.status !== 'paid') {
      await db.updateEmiPayment(emi.paymentId, {
        status: 'paid',
        paidAmount: emi.amount,
        paidDate: new Date().toISOString(),
        note: 'Foreclosed / Settled'
      });
    }
  }
}

module.exports = {
  addMonths,
  ensureEmiSchedule,
  rescheduleEmis,
  closeEmisForForeclosure,
};
