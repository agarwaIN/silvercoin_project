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

  try {
    const existing = await db.listEmiByLoan(loan.loanId);
    if (existing && existing.length > 0) {
      return existing;
    }

    const tenure = parseInt(loan.tenureMonths || loan.repaymentMonths, 10);
    const emiAmount = Number(loan.emiAmount || 0);

    if (!tenure || isNaN(tenure) || tenure <= 0 || tenure > 360 || !emiAmount || isNaN(emiAmount) || emiAmount <= 0) {
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
  } catch (err) {
    console.error('Error generating EMI schedule in ensureEmiSchedule:', err);
    return [];
  }
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

/**
 * Builds loan-level recovery items (one clean card per loan).
 * @param {Array} loans 
 * @returns {Promise<Array>}
 */
async function buildLoanRecoveryItems(loans) {
  const recoveryItems = [];
  const todayStr = new Date().toISOString().slice(0, 10);

  for (const loan of loans) {
    if (!['active', 'approved'].includes(loan.status)) continue;
    const emis = await ensureEmiSchedule(loan);
    if (!emis || emis.length === 0) continue;

    const unpaidEmis = emis.filter(e => e.status !== 'paid');
    if (unpaidEmis.length === 0) {
      if (loan.status !== 'completed') {
        await db.updateLoan(loan.loanId, { status: 'completed' });
      }
      continue;
    }

    // Sort unpaid EMIs by dueDate ascending
    unpaidEmis.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    // Overdue EMIs (due before today)
    const overdueEmis = unpaidEmis.filter(e => e.dueDate < todayStr);
    const todayEmis = unpaidEmis.filter(e => e.dueDate === todayStr);

    // Oldest unpaid EMI is the current target installment
    const currentEmi = unpaidEmis[0];
    // Calculate overdue days for current EMI
    let daysOverdue = 0;
    if (currentEmi.dueDate < todayStr) {
      const diffMs = new Date(todayStr) - new Date(currentEmi.dueDate);
      daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    // Apply penalty calculation if overdue beyond 3-day grace period
    if (daysOverdue > 3) {
      const penaltyRate = Number(loan.penaltyRate) || 0.1; // 0.1% per day default
      const calcPenalty = Math.round(Number(currentEmi.amount || 0) * (penaltyRate / 100) * daysOverdue);
      if (calcPenalty > Number(currentEmi.penaltyAmount || 0)) {
        currentEmi.penaltyAmount = calcPenalty;
        db.updateEmiPayment(currentEmi.paymentId, { penaltyAmount: calcPenalty, status: 'overdue' }).catch(() => {});
      }
    }

    // Recompute currentDue with any updated penalty
    const finalCurrentDue = (Number(currentEmi.amount || 0) + Number(currentEmi.penaltyAmount || 0)) - Number(currentEmi.paidAmount || 0);

    // Total overdue amount across all overdue installments
    const totalOverdue = overdueEmis.reduce((sum, e) => {
      const d = (Number(e.amount || 0) + Number(e.penaltyAmount || 0)) - Number(e.paidAmount || 0);
      return sum + Math.max(0, d);
    }, 0);

    // Total remaining balance to be recovered on the loan
    const totalRemainingDue = unpaidEmis.reduce((sum, e) => {
      const d = (Number(e.amount || 0) + Number(e.penaltyAmount || 0)) - Number(e.paidAmount || 0);
      return sum + Math.max(0, d);
    }, 0);

    const paidCount = emis.filter(e => e.status === 'paid').length;
    const totalCount = emis.length;

    let recoveryStatus = overdueEmis.length > 0 ? 'overdue' : 'upcoming';

    // Sort all EMIs to find opening date and monthly cycle
    const allEmisSorted = [...emis].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const firstEmi = allEmisSorted[0];
    const emiOpeningDate = firstEmi ? firstEmi.dueDate : null;

    // Disbursement date
    const disbursementDate = (loan.disbursements && loan.disbursements.length > 0 && loan.disbursements[0].date)
      ? loan.disbursements[0].date
      : loan.loanStartDate || (firstEmi ? firstEmi.dueDate : null);

    // Monthly recurring EMI due day (e.g. 4 for 4th of month)
    const targetDateForDay = currentEmi.dueDate || (firstEmi ? firstEmi.dueDate : '');
    const dueDayNumber = targetDateForDay ? parseInt(targetDateForDay.slice(8, 10), 10) : null;

    // Last paid installment info
    const paidEmis = emis.filter(e => e.status === 'paid').sort((a, b) => new Date(b.paidDate || b.dueDate) - new Date(a.paidDate || a.dueDate));
    const lastPaidDate = paidEmis.length > 0 ? (paidEmis[0].paidDate ? paidEmis[0].paidDate.slice(0, 10) : paidEmis[0].dueDate) : null;
    const lastPaidAmount = paidEmis.length > 0 ? Number(paidEmis[0].paidAmount || paidEmis[0].amount || 0) : 0;

    // Calculate advance payments: EMIs paid ahead of today
    const futurePaidEmis = emis.filter(e => e.status === 'paid' && e.dueDate > todayStr);
    const advancePaidSum = futurePaidEmis.reduce((sum, e) => sum + Number(e.paidAmount || e.amount || 0), 0);
    const advanceEmisCount = futurePaidEmis.length;

    // Also check if current upcoming EMI has any partial payment made ahead
    const partialAdvance = (currentEmi && currentEmi.dueDate > todayStr) ? Number(currentEmi.paidAmount || 0) : 0;
    const totalAdvanceAmount = advancePaidSum + partialAdvance;
    const isAdvancePaid = totalAdvanceAmount > 0;

    // Check if current EMI has a part payment
    const currentEmiPaid = Number(currentEmi.paidAmount || 0);
    const isPartiallyPaid = currentEmi.status === 'partial' || (currentEmiPaid > 0 && currentEmi.status !== 'paid');
    const partialPaidAmount = isPartiallyPaid ? currentEmiPaid : 0;

    // Upcoming EMI date (the date of the next installment to be paid)
    const upcomingEmiDate = currentEmi ? currentEmi.dueDate : null;

    recoveryItems.push({
      loanId: loan.loanId,
      displayLoanId: loan.displayLoanId || loan.applicationNumber || loan.loanId,
      borrowerName: loan.ownerName || 'Borrower',
      borrowerMobile: loan.ownerMobile || '',
      borrowerAddress: loan.ownerAddress || loan.propertyAddress || '',
      employeeId: loan.employeeId,

      // Target EMI for payment collection
      paymentId: currentEmi.paymentId,
      dueDate: currentEmi.dueDate,
      amount: Number(currentEmi.amount || 0),
      penaltyAmount: Number(currentEmi.penaltyAmount || 0),
      dueAmount: Math.max(0, finalCurrentDue),
      currentEmiStatus: currentEmi.status || 'pending',
      daysOverdue,

      // Part payment details
      isPartiallyPaid,
      partialPaidAmount,

      // Advance payment details
      isAdvancePaid,
      totalAdvanceAmount,
      advanceEmisCount,
      upcomingEmiDate,

      // Disbursement, EMI opening date, and monthly payment cycle
      disbursementDate,
      emiOpeningDate,
      dueDayNumber,
      lastPaidDate,
      lastPaidAmount,

      // Loan-level recovery metrics
      totalOverdue,
      totalRemainingDue,
      overdueCount: overdueEmis.length,
      paidCount,
      totalCount,
      recoveryStatus,
    });
  }

  // Sort priority: overdue first, then upcoming by dueDate
  recoveryItems.sort((a, b) => {
    const priority = { overdue: 1, upcoming: 2, today: 2 };
    if (priority[a.recoveryStatus] !== priority[b.recoveryStatus]) {
      return priority[a.recoveryStatus] - priority[b.recoveryStatus];
    }
    return new Date(a.dueDate) - new Date(b.dueDate);
  });

  return recoveryItems;
}

/**
 * Records an EMI payment with smart cascading across unpaid installments.
 * Supports partial payment, full payment, and advance multi-installment payments.
 * Strictly enforces mandatory and unique UTR/Transaction numbers for UPI and Bank payments.
 * @param {string} loanId 
 * @param {string} initialPaymentId 
 * @param {number} amount 
 * @param {string} userId 
 * @param {Object} paymentDetails 
 */
async function recordLoanPayment(loanId, initialPaymentId, amount, userId, paymentDetails = {}) {
  let remainingAmount = Number(amount);
  if (isNaN(remainingAmount) || remainingAmount <= 0) {
    throw new Error('Invalid payment amount');
  }

  const mode = (paymentDetails.paymentMode || paymentDetails.payMode || 'Cash').trim();
  const rawTxnRef = (paymentDetails.transactionRef || paymentDetails.txnRef || '').trim();

  // If payment mode is UPI or Bank, transaction reference is mandatory and must be unique
  if (['upi', 'bank'].includes(mode.toLowerCase())) {
    if (!rawTxnRef) {
      throw new Error('Transaction / UTR reference number is mandatory for UPI and Bank payments.');
    }
    const existing = await db.findEmiByTxnRef(rawTxnRef);
    if (existing) {
      throw new Error(`Duplicate payment prevented: A payment with reference "${rawTxnRef}" has already been recorded in the system.`);
    }
  }

  const emis = await db.listEmiByLoan(loanId);
  if (!emis || emis.length === 0) {
    throw new Error('No EMI schedule found for this loan');
  }

  const unpaidEmis = emis
    .filter(e => e.status !== 'paid')
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  if (unpaidEmis.length === 0) {
    throw new Error('All EMIs are already fully paid');
  }

  let startIndex = 0;
  if (initialPaymentId) {
    const idx = unpaidEmis.findIndex(e => e.paymentId === initialPaymentId);
    if (idx !== -1) startIndex = idx;
  }

  const updatedPayments = [];

  for (let i = startIndex; i < unpaidEmis.length && remainingAmount > 0; i++) {
    const emi = unpaidEmis[i];
    const totalRequired = Number(emi.amount || 0) + Number(emi.penaltyAmount || 0);
    const currentPaid = Number(emi.paidAmount || 0);
    const needed = Math.max(0, totalRequired - currentPaid);

    const payForThisEmi = Math.min(remainingAmount, needed);
    const newPaidAmount = currentPaid + payForThisEmi;
    remainingAmount -= payForThisEmi;

    const newStatus = newPaidAmount >= totalRequired ? 'paid' : 'partial';

    await db.updateEmiPayment(emi.paymentId, {
      paidAmount: newPaidAmount,
      status: newStatus,
      paidDate: new Date().toISOString(),
      markedBy: userId,
      paymentMode: mode,
      transactionRef: rawTxnRef || null,
      txnRef: rawTxnRef || null,
    });

    updatedPayments.push({
      paymentId: emi.paymentId,
      paidAmount: newPaidAmount,
      status: newStatus,
      paymentMode: mode,
      transactionRef: rawTxnRef || null,
    });
  }

  // If excess payment remains after all subsequent EMIs
  if (remainingAmount > 0 && unpaidEmis.length > 0) {
    const lastEmi = unpaidEmis[unpaidEmis.length - 1];
    const newPaid = Number(lastEmi.paidAmount || 0) + remainingAmount;
    await db.updateEmiPayment(lastEmi.paymentId, {
      paidAmount: newPaid,
      status: 'paid',
      paidDate: new Date().toISOString(),
      markedBy: userId,
      paymentMode: mode,
      transactionRef: rawTxnRef || null,
      txnRef: rawTxnRef || null,
    });
  }

  // Check if loan is fully paid
  const refreshedEmis = await db.listEmiByLoan(loanId);
  const allPaid = refreshedEmis.every(e => e.status === 'paid');
  if (allPaid) {
    await db.updateLoan(loanId, { status: 'completed' });
  }

  return { success: true, updatedPayments };
}

module.exports = {
  addMonths,
  ensureEmiSchedule,
  rescheduleEmis,
  closeEmisForForeclosure,
  buildLoanRecoveryItems,
  recordLoanPayment,
};
