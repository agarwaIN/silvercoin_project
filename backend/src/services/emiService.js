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

  // EMI schedule must NOT be created or visible unless and until the admin completely approves the loan terms
  const isApproved = ['approved', 'active', 'completed', 'foreclosed'].includes(loan.status);
  if (!isApproved) {
    try {
      const existing = await db.listEmiByLoan(loan.loanId);
      if (existing && existing.length > 0) {
        for (const emi of existing) {
          if (emi.status !== 'paid') {
            await db.deleteEmiPayment(emi.paymentId).catch(() => {});
          }
        }
      }
    } catch (e) {}
    return [];
  }

  try {
    let tenure = parseInt(loan.tenureMonths || loan.repaymentMonths || loan.tenure, 10);
    if (!tenure || isNaN(tenure) || tenure <= 0 || tenure > 360) {
      tenure = 12;
    }

    const principal = Number(loan.approvedAmount || loan.loanAmount || 0);
    const interestRate = Number(loan.interestRate || 2.15);

    // Calculate approved total interest, total repayable, and regular EMI based on approved loan terms
    let calculatedTotalInterest = 0;
    let calculatedTotalRepayable = 0;
    let calculatedEmi = 0;

    if (principal > 0 && tenure > 0) {
      calculatedTotalInterest = Math.round(principal * (interestRate / 100) * tenure);
      calculatedTotalRepayable = principal + calculatedTotalInterest;
      calculatedEmi = Math.round(calculatedTotalRepayable / tenure);
    }

    // Determine target monthly EMI according to approved terms:
    // If loan.emiAmount matches the approved rate calculation within 5 rupees, use it.
    // If a discrepancy exists (e.g. stale preliminary 2.15% rate = 14783 vs approved 2.099% = 14630),
    // strictly use the calculated approved EMI!
    let emiAmount = calculatedEmi;
    if (loan.emiAmount && Number(loan.emiAmount) > 0) {
      const explicitEmi = Number(loan.emiAmount);
      if (calculatedEmi > 0 && Math.abs(explicitEmi - calculatedEmi) <= 5) {
        emiAmount = Math.round(explicitEmi);
      } else if (calculatedEmi > 0) {
        emiAmount = calculatedEmi;
      } else {
        emiAmount = Math.round(explicitEmi);
      }
    }

    const targetTotalRepayable = (loan.totalRepayable && Number(loan.totalRepayable) > 0 && Math.abs(Number(loan.totalRepayable) - calculatedTotalRepayable) <= (tenure * 2))
      ? Number(loan.totalRepayable)
      : calculatedTotalRepayable;

    const targetTotalInterest = (loan.totalInterest && Number(loan.totalInterest) > 0 && Math.abs(Number(loan.totalInterest) - calculatedTotalInterest) <= (tenure * 2))
      ? Number(loan.totalInterest)
      : calculatedTotalInterest;

    // Persist aligned terms to loan record in DB if any discrepancy exists
    if (principal > 0 && (Number(loan.emiAmount) !== emiAmount || Number(loan.totalRepayable) !== targetTotalRepayable)) {
      loan.emiAmount = emiAmount;
      loan.totalInterest = targetTotalInterest;
      loan.totalRepayable = targetTotalRepayable;
      loan.tenureMonths = tenure;
      loan.interestRate = interestRate;
      db.updateLoan(loan.loanId, {
        tenureMonths: tenure,
        emiAmount,
        interestRate,
        totalInterest: targetTotalInterest,
        totalRepayable: targetTotalRepayable,
      }).catch(() => {});
    }

    const existing = await db.listEmiByLoan(loan.loanId);
    if (existing && existing.length > 0) {
      // 1. Reconcile and fix any erroneous penalties or statuses for EMIs paid on time
      let modified = false;
      for (const emi of existing) {
        if (Number(emi.paidAmount || 0) > 0 && emi.paidDate) {
          const paidDateStr = String(emi.paidDate).slice(0, 10);
          const dueDateStr = emi.dueDate ? String(emi.dueDate).slice(0, 10) : '';
          if (dueDateStr) {
            const paidD = new Date(paidDateStr);
            const dueD = new Date(dueDateStr);
            const daysLate = Math.max(0, Math.floor((paidD - dueD) / (1000 * 60 * 60 * 24)));
            if (daysLate <= 3 && Number(emi.penaltyAmount || 0) > 0) {
              emi.penaltyAmount = 0;
              if (Number(emi.paidAmount) >= Number(emi.amount)) {
                emi.status = 'paid';
              }
              await db.updateEmiPayment(emi.paymentId, { penaltyAmount: 0, status: emi.status }).catch(() => {});
              modified = true;
            }
          }
        }
      }
      if (modified) {
        const allPaid = existing.every(e => e.status === 'paid');
        if (allPaid && loan.status !== 'completed') {
          await db.updateLoan(loan.loanId, { status: 'completed' }).catch(() => {});
        }
      }

      // 2. Reconcile unpaid EMIs with approved loan terms
      if (emiAmount > 0 && tenure > 0) {
        const sortedExisting = [...existing].sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
        const paidEmis = sortedExisting.filter(e => e.status === 'paid');
        const unpaidEmis = sortedExisting.filter(e => e.status !== 'paid');

        if (paidEmis.length === 0) {
          // If no EMIs have been paid yet, but existing count does not match the approved tenure
          if (sortedExisting.length !== tenure) {
            for (const emi of sortedExisting) {
              await db.deleteEmiPayment(emi.paymentId).catch(() => {});
            }
            // Proceed to generate fresh schedule below!
          } else {
            // Count matches tenure: reconcile amounts and due dates to approved terms
            const regularEmi = Math.round(emiAmount);
            const totalRepayable = targetTotalRepayable || (regularEmi * tenure);
            const lastEmi = totalRepayable - (regularEmi * (tenure - 1));

            const rawStartDate = loan.emiStartDate || loan.loanStartDate;
            const parsedStartDate = rawStartDate ? (parseDateInput(rawStartDate) || rawStartDate) : null;

            for (let i = 0; i < unpaidEmis.length; i++) {
              const emi = unpaidEmis[i];
              const isLast = (i === tenure - 1);
              const expectedAmount = isLast ? Math.max(0, lastEmi) : regularEmi;

              const updates = {};
              if (Number(emi.amount) !== expectedAmount) {
                emi.amount = expectedAmount;
                updates.amount = expectedAmount;
              }

              if (parsedStartDate) {
                const expectedDueDate = (i === 0) ? parsedStartDate : addMonths(parsedStartDate, i);
                if (emi.dueDate !== expectedDueDate) {
                  emi.dueDate = expectedDueDate;
                  updates.dueDate = expectedDueDate;
                }
              }

              if (Object.keys(updates).length > 0) {
                await db.updateEmiPayment(emi.paymentId, updates).catch(err => {
                  console.warn(`Could not sync EMI ${emi.paymentId}:`, err.message);
                });
              }
            }
            return sortedExisting;
          }
        } else if (unpaidEmis.length > 0) {
          // Some EMIs already paid:
          const remainingTenure = Math.max(1, tenure - paidEmis.length);
          if (unpaidEmis.length !== remainingTenure) {
            return await rescheduleEmis(loan, { tenureMonths: tenure, emiAmount, totalRepayable: targetTotalRepayable });
          } else {
            const regularEmi = Math.round(emiAmount);
            const totalRepayable = targetTotalRepayable || 0;
            const paidSum = paidEmis.reduce((s, e) => s + Number(e.paidAmount || e.amount || 0), 0);
            const remainingRepayable = totalRepayable > 0 ? Math.max(0, totalRepayable - paidSum) : (regularEmi * unpaidEmis.length);
            const lastEmi = remainingRepayable - (regularEmi * (unpaidEmis.length - 1));

            for (let i = 0; i < unpaidEmis.length; i++) {
              const emi = unpaidEmis[i];
              const isLast = (i === unpaidEmis.length - 1);
              const expectedAmount = (isLast && totalRepayable > 0) ? Math.max(0, lastEmi) : regularEmi;

              if (Number(emi.amount) !== expectedAmount) {
                emi.amount = expectedAmount;
                await db.updateEmiPayment(emi.paymentId, { amount: expectedAmount }).catch(err => {
                  console.warn(`Could not sync unpaid EMI ${emi.paymentId}:`, err.message);
                });
              }
            }
            return sortedExisting;
          }
        } else {
          return sortedExisting;
        }
      } else {
        return existing;
      }
    }

    if (!emiAmount || isNaN(emiAmount) || emiAmount <= 0) {
      return [];
    }

    // Determine loan start date
    let rawStartDate = loan.emiStartDate || loan.loanStartDate;
    if (!rawStartDate && loan.disbursements && loan.disbursements.length > 0 && loan.disbursements[0].date) {
      rawStartDate = loan.disbursements[0].date;
    }
    if (!rawStartDate && loan.disbursementDate) {
      rawStartDate = loan.disbursementDate;
    }
    if (!rawStartDate) {
      rawStartDate = loan.createdAt || new Date().toISOString();
    }
    const startDate = parseDateInput(rawStartDate) || rawStartDate;

    const regularEmi = Math.round(emiAmount);
    const totalRepayable = Number(loan.totalRepayable) || (regularEmi * tenure);
    const lastEmi = totalRepayable - (regularEmi * (tenure - 1));

    const generatedEmis = [];
    for (let i = 0; i < tenure; i++) {
      const isLast = (i === tenure - 1);
      const dueDate = (loan.emiStartDate || loan.loanStartDate)
        ? (i === 0 ? startDate : addMonths(startDate, i))
        : addMonths(startDate, i + 1);
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

      generatedEmis.push(emi);
    }

    await Promise.all(
      generatedEmis.map(emi =>
        db.createEmiPayment(emi).catch(err => {
          console.warn(`Could not create EMI ${emi.paymentId}:`, err.message);
        })
      )
    );

    return generatedEmis;
  } catch (err) {
    console.error('Error generating EMI schedule in ensureEmiSchedule:', err);
    return [];
  }
}

/**
 * Updates due dates of unpaid EMIs when EMI start date is changed.
 * @param {string} loanId 
 * @param {string} newEmiStartDate YYYY-MM-DD
 */
async function updateEmiScheduleDates(loanId, newEmiStartDate) {
  if (!loanId || !newEmiStartDate) return;
  try {
    const currentEmis = await db.listEmiByLoan(loanId);
    if (!currentEmis || currentEmis.length === 0) return;

    const paidEmis = currentEmis.filter(e => e.status === 'paid');
    const unpaidEmis = currentEmis.filter(e => e.status !== 'paid');

    for (let i = 0; i < unpaidEmis.length; i++) {
      const emi = unpaidEmis[i];
      const monthOffset = paidEmis.length === 0 ? i : (paidEmis.length + i);
      const newDueDate = monthOffset === 0 ? newEmiStartDate : addMonths(newEmiStartDate, monthOffset);
      await db.updateEmiPayment(emi.paymentId, { dueDate: newDueDate });
    }
  } catch (err) {
    console.error('Error updating EMI schedule dates:', err);
  }
}


/**
 * Reschedules remaining unpaid EMIs when an EMI change is approved.
 * @param {Object} loan 
 * @param {Object} newTerms 
 */
async function rescheduleEmis(loan, newTerms) {
  const currentEmis = await db.listEmiByLoan(loan.loanId);
  const paidEmis = (currentEmis || []).filter(e => e.status === 'paid').sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
  const unpaidEmis = (currentEmis || []).filter(e => e.status !== 'paid');

  // Remove unpaid EMIs
  for (const emi of unpaidEmis) {
    try {
      await db.deleteEmiPayment(emi.paymentId);
    } catch (err) {
      console.warn(`Could not delete EMI ${emi.paymentId}:`, err.message);
    }
  }

  const newTenure = parseInt(newTerms.tenureMonths || loan.tenureMonths, 10) || 0;
  const remainingTenure = Math.max(1, newTenure - paidEmis.length);
  const newEmiAmount = Math.round(Number(newTerms.emiAmount || loan.emiAmount || 0));

  let baseDate = null;
  let useStartOffset = false;
  if (paidEmis.length > 0) {
    baseDate = paidEmis[paidEmis.length - 1].dueDate;
  } else {
    const rawStart = loan.emiStartDate || loan.loanStartDate || loan.disbursementDate || newTerms.emiStartDate || new Date().toISOString().slice(0, 10);
    baseDate = parseDateInput(rawStart) || rawStart;
    useStartOffset = Boolean(loan.emiStartDate || newTerms.emiStartDate);
  }

  const totalRepayable = Number(newTerms.totalRepayable || loan.totalRepayable || 0);
  const paidSum = paidEmis.reduce((s, e) => s + Number(e.paidAmount || e.amount || 0), 0);
  const remainingRepayable = totalRepayable > 0 ? Math.max(0, totalRepayable - paidSum) : (newEmiAmount * remainingTenure);
  const lastEmi = remainingRepayable - (newEmiAmount * (remainingTenure - 1));

  const updatedEmis = [];
  for (let i = 0; i < remainingTenure; i++) {
    const emiIndex = paidEmis.length + i + 1;
    const paymentId = `${loan.loanId}-EMI-${String(emiIndex).padStart(2, '0')}`;
    let dueDate;
    if (paidEmis.length === 0 && useStartOffset) {
      dueDate = (i === 0) ? baseDate : addMonths(baseDate, i);
    } else {
      dueDate = addMonths(baseDate, i + 1);
    }

    const isLast = (i === remainingTenure - 1);
    const amount = (isLast && totalRepayable > 0) ? Math.max(0, lastEmi) : newEmiAmount;

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
      updatedEmis.push(emi);
    } catch (err) {
      console.warn(`Could not create rescheduled EMI ${paymentId}:`, err.message);
    }
  }

  return [...paidEmis, ...updatedEmis];
}

/**
 * Calculates foreclosure breakdown according to foreclosure date and EMIs paid.
 * @param {Object} loan 
 * @param {string} foreclosureDateStr 
 * @returns {Promise<Object>}
 */
async function calculateForeclosureDetails(loan, foreclosureDateStr = null) {
  if (!loan) return null;

  const totalPrincipal = Number(loan.approvedAmount || loan.loanAmount || 0);
  const tenure = parseInt(loan.tenureMonths || loan.tenure || 12, 10) || 12;
  const interestRate = Number(loan.interestRate || 2.15); // Monthly %
  const penaltyRate = Number(loan.penaltyRate || 0); // %

  const toTimestamp = (d) => {
    if (!d) return 0;
    const parsed = parseDateInput(d);
    return parsed ? new Date(parsed).getTime() : 0;
  };

  const emis = await db.listEmiByLoan(loan.loanId);
  const sortedEmis = [...(emis || [])].sort((a, b) => toTimestamp(a.dueDate) - toTimestamp(b.dueDate));

  const paidEmis = sortedEmis.filter(e => e.status === 'paid');
  const paidCount = paidEmis.length;
  const unpaidCount = Math.max(0, tenure - paidCount);

  // 1. Outstanding Principal: (P / T) * unpaidCount
  const principalPerMonth = totalPrincipal / tenure;
  const outstandingPrincipal = Math.max(0, Math.round(principalPerMonth * unpaidCount));

  // 2. Determine loan start date and last covered date
  let rawStartDate = loan.loanStartDate || loan.emiStartDate || loan.disbursementDate || loan.createdAt;
  if (loan.disbursements && loan.disbursements.length > 0 && loan.disbursements[0].date) {
    rawStartDate = loan.disbursements[0].date;
  }
  const startDateStr = parseDateInput(rawStartDate) || String(rawStartDate).slice(0, 10);
  const startDate = new Date(startDateStr);

  // Target foreclosure date
  const effectiveCloseStr = parseDateInput(foreclosureDateStr) || new Date().toISOString().slice(0, 10);
  const closeDate = new Date(effectiveCloseStr);

  // Last covered date: due date of the last paid EMI, or loan start date
  let lastCoveredDateStr = startDateStr;
  if (paidEmis.length > 0) {
    const lastPaid = paidEmis[paidEmis.length - 1];
    lastCoveredDateStr = parseDateInput(lastPaid.dueDate) || String(lastPaid.dueDate).slice(0, 10);
  }
  const lastCoveredDate = new Date(lastCoveredDateStr);

  // Days elapsed between lastCoveredDate and closeDate
  const diffMs = closeDate.getTime() - lastCoveredDate.getTime();
  const daysElapsed = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  // Accrued interest on outstanding principal up to foreclosure date:
  // Monthly interest = outstandingPrincipal * (interestRate / 100)
  // Daily interest = Monthly interest / 30
  // Interest = Daily interest * daysElapsed
  const monthlyInterest = outstandingPrincipal * (interestRate / 100);
  const dailyInterest = monthlyInterest / 30;
  const accruedInterest = Math.max(0, Math.round(dailyInterest * daysElapsed));

  // 3. Months elapsed from loan start date to check 6-month rule
  const totalDaysSinceStart = Math.max(0, Math.floor((closeDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
  const monthsElapsed = Number((totalDaysSinceStart / 30.4375).toFixed(1));
  const isBeforeSixMonths = monthsElapsed < 6.0;

  // Suggested penalty if before 6 months
  let suggestedPenalty = 0;
  if (isBeforeSixMonths && penaltyRate > 0) {
    suggestedPenalty = Math.round(outstandingPrincipal * (penaltyRate / 100));
  }

  const totalSettlement = outstandingPrincipal + accruedInterest + suggestedPenalty;

  return {
    loanId: loan.loanId,
    totalPrincipal,
    tenure,
    interestRate,
    penaltyRate,
    paidEmiCount: paidCount,
    unpaidEmiCount: unpaidCount,
    outstandingPrincipal,
    startDate: startDateStr,
    foreclosureDate: effectiveCloseStr,
    lastCoveredDate: lastCoveredDateStr,
    daysElapsed,
    monthlyInterest: Math.round(monthlyInterest),
    dailyInterest: Number(dailyInterest.toFixed(2)),
    accruedInterest,
    totalDaysSinceStart,
    monthsElapsed,
    isBeforeSixMonths,
    suggestedPenalty,
    totalSettlement,
  };
}

/**
 * Marks all pending EMIs as foreclosed upon loan foreclosure.
 * @param {string} loanId 
 * @param {string} foreclosureDate 
 * @param {string} reason 
 */
async function closeEmisForForeclosure(loanId, foreclosureDate = null, reason = '') {
  const emis = await db.listEmiByLoan(loanId);
  const dateStr = foreclosureDate || new Date().toISOString().slice(0, 10);
  for (const emi of emis) {
    if (emi.status !== 'paid') {
      await db.updateEmiPayment(emi.paymentId, {
        status: 'foreclosed',
        paidAmount: 0,
        paidDate: dateStr,
        penaltyAmount: 0,
        note: `Loan Foreclosed on ${dateStr}${reason ? ` (${reason})` : ''}`
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
  const todayStr = new Date().toISOString().slice(0, 10);
  const eligibleLoans = (loans || []).filter(loan => {
    const isDisbursed = Array.isArray(loan.disbursements) && loan.disbursements.length > 0;
    if (!['active', 'approved', 'disbursed'].includes(loan.status) && !isDisbursed) return false;
    if (loan.status === 'completed') return false;
    return true;
  });

  const items = await Promise.all(eligibleLoans.map(async (loan) => {
    try {
      const emis = await ensureEmiSchedule(loan);
      if (!emis || emis.length === 0) return null;

      // Self-heal and clear unwarranted penalties on EMIs paid within grace period
      for (const emi of emis) {
        if (Number(emi.paidAmount || 0) > 0 && emi.paidDate) {
          const paidDateStr = String(emi.paidDate).slice(0, 10);
          const dueDateStr = emi.dueDate ? String(emi.dueDate).slice(0, 10) : '';
          if (dueDateStr) {
            const daysLate = Math.max(0, Math.floor((new Date(paidDateStr) - new Date(dueDateStr)) / (1000 * 60 * 60 * 24)));
            if (daysLate <= 3 && Number(emi.penaltyAmount || 0) > 0) {
              emi.penaltyAmount = 0;
              if (Number(emi.paidAmount) >= Number(emi.amount)) {
                emi.status = 'paid';
              }
              db.updateEmiPayment(emi.paymentId, { penaltyAmount: 0, status: emi.status }).catch(() => {});
            }
          }
        }
      }

      const unpaidEmis = emis.filter(e => e.status !== 'paid');
      if (unpaidEmis.length === 0) {
        if (loan.status !== 'completed') {
          db.updateLoan(loan.loanId, { status: 'completed' }).catch(() => {});
        }
        return null;
      }

      // Sort unpaid EMIs by dueDate ascending
      unpaidEmis.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

      // Overdue EMIs (due before today and not fully paid)
      const overdueEmis = unpaidEmis.filter(e => e.dueDate < todayStr && (Number(e.paidAmount || 0) < Number(e.amount || 0)));

      // Oldest unpaid EMI is the current target installment
      const currentEmi = unpaidEmis[0];
      let daysOverdue = 0;
      if (currentEmi.dueDate < todayStr) {
        const diffMs = new Date(todayStr) - new Date(currentEmi.dueDate);
        daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }

      // Apply penalty calculation if overdue beyond 3-day grace period on unpaid balance
      const unpaidPrincipal = Math.max(0, Number(currentEmi.amount || 0) - Number(currentEmi.paidAmount || 0));
      if (daysOverdue > 3 && unpaidPrincipal > 0) {
        const penaltyRate = Number(loan.penaltyRate) || 0.1; // 0.1% per day default
        const calcPenalty = Math.round(unpaidPrincipal * (penaltyRate / 100) * daysOverdue);
        if (calcPenalty > Number(currentEmi.penaltyAmount || 0)) {
          currentEmi.penaltyAmount = calcPenalty;
          db.updateEmiPayment(currentEmi.paymentId, { penaltyAmount: calcPenalty, status: 'overdue' }).catch(() => {});
        }
      } else if (daysOverdue <= 3 || unpaidPrincipal === 0) {
        if (Number(currentEmi.penaltyAmount || 0) > 0 && Number(currentEmi.paidAmount || 0) >= Number(currentEmi.amount || 0)) {
          currentEmi.penaltyAmount = 0;
          db.updateEmiPayment(currentEmi.paymentId, { penaltyAmount: 0 }).catch(() => {});
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

      return {
        loanId: loan.loanId,
        displayLoanId: loan.displayLoanId || loan.applicationNumber || loan.loanId,
        borrowerName: loan.ownerName || 'Borrower',
        borrowerMobile: loan.ownerMobile || '',
        borrowerAadhaar: loan.aadhaar || loan.borrowerAadhaar || loan.aadhaarNumber || '',
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

        // Loan terms & approved values
        approvedAmount: Number(loan.approvedAmount || loan.loanAmount || 0),
        loanAmount: Number(loan.loanAmount || loan.approvedAmount || 0),
        tenureMonths: Number(loan.tenureMonths || totalCount || 0),
        emiAmount: Number(loan.emiAmount || (currentEmi ? currentEmi.amount : 0)),
        totalRepayable: Number(loan.totalRepayable || 0),

        // Loan-level recovery metrics
        totalOverdue,
        totalRemainingDue,
        overdueCount: overdueEmis.length,
        paidCount,
        totalCount,
        recoveryStatus,
        emis: allEmisSorted,
      };
    } catch (err) {
      console.warn(`Error building recovery for loan ${loan.loanId}:`, err.message);
      return null;
    }
  }));

  const recoveryItems = items.filter(Boolean);

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
 * Parse date string to YYYY-MM-DD
 */
function parseDateInput(str) {
  if (!str) return null;
  let s = String(str).trim();
  if (!s) return null;
  if (s.includes('T')) s = s.split('T')[0];
  const ddmmyyyyMatch = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (ddmmyyyyMatch) {
    const day = String(ddmmyyyyMatch[1]).padStart(2, '0');
    const month = String(ddmmyyyyMatch[2]).padStart(2, '0');
    const year = ddmmyyyyMatch[3];
    return `${year}-${month}-${day}`;
  }
  const yyyymmddMatch = s.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if (yyyymmddMatch) {
    const year = yyyymmddMatch[1];
    const month = String(yyyymmddMatch[2]).padStart(2, '0');
    const day = String(yyyymmddMatch[3]).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return null;
}

/**
 * Record a payment towards loan EMIs (supports waterfall allocation).
 * Enforces mandatory, unique receipt/transaction numbers across all payment modes.
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

  // Receipt / Reference number is MANDATORY for all payment modes (Cash, UPI, Bank)
  if (!rawTxnRef) {
    throw new Error('Receipt / Reference number is mandatory.');
  }

  // Prevent duplicate transaction / receipt numbers across all payments and disbursements
  const isDuplicate = db.findTransactionRefExists
    ? await db.findTransactionRefExists(rawTxnRef)
    : await db.findEmiByTxnRef(rawTxnRef);
  if (isDuplicate) {
    throw new Error(`Duplicate transaction prevented: Receipt / Transaction reference "${rawTxnRef}" has already been recorded in the system.`);
  }

  // Determine payment received date
  const rawDateInput = paymentDetails.paymentDate || paymentDetails.date || paymentDetails.paidDate;
  let effectivePaidDate = new Date().toISOString();
  if (rawDateInput) {
    const parsed = parseDateInput(rawDateInput);
    if (parsed) {
      effectivePaidDate = new Date(`${parsed}T12:00:00.000Z`).toISOString();
    }
  }

  const loan = await db.getLoanById(loanId);
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

    // Determine overdue penalty based on the actual collection date (effectivePaidDate)
    const paidDateOnly = effectivePaidDate.slice(0, 10);
    const dueDateOnly = emi.dueDate ? String(emi.dueDate).slice(0, 10) : '';
    let daysLate = 0;
    if (dueDateOnly && paidDateOnly > dueDateOnly) {
      daysLate = Math.max(0, Math.floor((new Date(paidDateOnly) - new Date(dueDateOnly)) / (1000 * 60 * 60 * 24)));
    }

    let applicablePenalty = 0;
    const unpaidPrincipal = Math.max(0, Number(emi.amount || 0) - Number(emi.paidAmount || 0));
    if (daysLate > 3 && unpaidPrincipal > 0) {
      const penaltyRate = Number(loan?.penaltyRate || 0.1);
      applicablePenalty = Math.round(unpaidPrincipal * (penaltyRate / 100) * daysLate);
    } else {
      applicablePenalty = 0;
    }

    const totalRequired = Number(emi.amount || 0) + applicablePenalty;
    const currentPaid = Number(emi.paidAmount || 0);
    const needed = Math.max(0, totalRequired - currentPaid);

    const payForThisEmi = Math.min(remainingAmount, needed);
    const newPaidAmount = currentPaid + payForThisEmi;
    remainingAmount -= payForThisEmi;

    const newStatus = newPaidAmount >= totalRequired ? 'paid' : (newPaidAmount > 0 ? 'partial' : 'pending');

    // Build installment list maintaining complete itemized ledger history of partial payments
    const existingPayments = Array.isArray(emi.payments) ? [...emi.payments] : [];
    if (existingPayments.length === 0 && currentPaid > 0 && (emi.transactionRef || emi.txnRef)) {
      existingPayments.push({
        paymentInstallmentId: `${emi.paymentId}-P1`,
        amount: currentPaid,
        paymentMode: emi.paymentMode || 'Cash',
        transactionRef: emi.transactionRef || emi.txnRef || '',
        paidDate: emi.paidDate || emi.updatedAt || emi.createdAt,
        markedBy: emi.markedBy || null,
        createdAt: emi.paidDate || new Date().toISOString(),
      });
    }

    const newInstallment = {
      paymentInstallmentId: `${emi.paymentId}-P${existingPayments.length + 1}`,
      amount: payForThisEmi,
      paymentMode: mode,
      transactionRef: rawTxnRef,
      paidDate: effectivePaidDate,
      markedBy: userId,
      createdAt: new Date().toISOString(),
    };
    existingPayments.push(newInstallment);

    await db.updateEmiPayment(emi.paymentId, {
      paidAmount: newPaidAmount,
      penaltyAmount: applicablePenalty,
      status: newStatus,
      paidDate: effectivePaidDate,
      markedBy: userId,
      paymentMode: mode,
      transactionRef: rawTxnRef,
      txnRef: rawTxnRef,
      payments: existingPayments,
    });

    updatedPayments.push({
      paymentId: emi.paymentId,
      paidAmount: newPaidAmount,
      penaltyAmount: applicablePenalty,
      status: newStatus,
      paymentMode: mode,
      transactionRef: rawTxnRef,
      paidDate: effectivePaidDate,
      payments: existingPayments,
    });
  }

  // If excess payment remains after all subsequent EMIs
  if (remainingAmount > 0 && unpaidEmis.length > 0) {
    const lastEmi = unpaidEmis[unpaidEmis.length - 1];
    const newPaid = Number(lastEmi.paidAmount || 0) + remainingAmount;
    const lastPayments = Array.isArray(lastEmi.payments) ? [...lastEmi.payments] : [];
    lastPayments.push({
      paymentInstallmentId: `${lastEmi.paymentId}-P${lastPayments.length + 1}`,
      amount: remainingAmount,
      paymentMode: mode,
      transactionRef: rawTxnRef,
      paidDate: effectivePaidDate,
      markedBy: userId,
      createdAt: new Date().toISOString(),
    });

    await db.updateEmiPayment(lastEmi.paymentId, {
      paidAmount: newPaid,
      status: 'paid',
      paidDate: effectivePaidDate,
      markedBy: userId,
      paymentMode: mode,
      transactionRef: rawTxnRef,
      txnRef: rawTxnRef,
      payments: lastPayments,
    });
  }

  // Mark first EMI as collected on the loan record
  try {
    await db.updateLoan(loanId, { firstEmiCollected: true });
  } catch (err) {
    console.warn('Could not set firstEmiCollected on loan:', err.message);
  }

  // Check if loan is fully paid
  const refreshedEmis = await db.listEmiByLoan(loanId);
  const allPaid = refreshedEmis.every(e => e.status === 'paid');
  if (allPaid) {
    await db.updateLoan(loanId, { status: 'completed' });
  }

  return {
    success: true,
    updatedPayments,
    emi: {
      paymentId: initialPaymentId,
      amount: Number(amount),
      paymentMode: mode,
      transactionRef: rawTxnRef,
      paidDate: effectivePaidDate,
    },
  };
}

/**
 * Checks if the first EMI (or any EMI) has already been collected on a loan.
 * Returns true if loan has firstEmiCollected flag or any paid/partial EMI exists.
 * @param {string} loanId 
 * @returns {Promise<boolean>}
 */
async function hasFirstEmiBeenCollected(loanId) {
  if (!loanId) return false;
  try {
    const loan = await db.getLoanById(loanId);
    if (loan && loan.firstEmiCollected) return true;
    const emis = await db.listEmiByLoan(loanId);
    if (!emis || emis.length === 0) return false;
    return emis.some(e => e.status === 'paid' || e.status === 'partial' || Number(e.paidAmount || 0) > 0);
  } catch (err) {
    console.error('Error checking hasFirstEmiBeenCollected:', err);
    return false;
  }
}

module.exports = {
  addMonths,
  ensureEmiSchedule,
  updateEmiScheduleDates,
  rescheduleEmis,
  closeEmisForForeclosure,
  buildLoanRecoveryItems,
  recordLoanPayment,
  hasFirstEmiBeenCollected,
  calculateForeclosureDetails,
};
