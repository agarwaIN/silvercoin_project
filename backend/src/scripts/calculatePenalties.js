const db = require('../services/mongoService');

// Grace period in days (BR-06)
const GRACE_PERIOD_DAYS = 3;

async function calculatePenalties() {
  console.log('Starting penalty calculation job...');
  const loans = await db.listAllLoans();
  const activeLoans = loans.filter(l => l.status === 'active' || (Array.isArray(l.disbursements) && l.disbursements.length > 0));

  let processedCount = 0;
  let penaltyCount = 0;

  for (const loan of activeLoans) {
    const emis = await db.listEmiByLoan(loan.loanId);
    
    for (const emi of emis) {
      if (emi.status === 'paid') continue;

      const dueDate = new Date(emi.dueDate);
      const now = new Date();
      const diffTime = Math.abs(now - dueDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // If overdue beyond grace period
      if (now > dueDate && diffDays > GRACE_PERIOD_DAYS) {
        // Calculate penalty (e.g., based on loan.penaltyRate or a flat fee)
        // If penaltyRate is a daily percentage, we can calculate it:
        // penalty = EMI amount * (penaltyRate / 100) * diffDays
        
        const penaltyRate = loan.penaltyRate || 0.1; // Default 0.1% per day
        const baseAmount = Math.max(0, Number(emi.amount || 0) - Number(emi.paidAmount || 0));
        if (baseAmount <= 0) continue;
        const penaltyAmount = Math.round(baseAmount * (penaltyRate / 100) * diffDays);

        // Only update if penalty changed significantly (to avoid unnecessary writes)
        if (penaltyAmount > (emi.penaltyAmount || 0)) {
          const newStatus = Number(emi.paidAmount || 0) > 0 ? 'partial' : 'overdue';
          await db.updateEmiPayment(emi.paymentId, {
            penaltyAmount,
            status: newStatus
          });
          penaltyCount++;
        }
      }
      processedCount++;
    }
  }

  console.log(`Penalty calculation finished. Processed ${processedCount} EMIs. Applied penalties to ${penaltyCount} EMIs.`);
}

// If run directly
if (require.main === module) {
  calculatePenalties().then(() => process.exit(0)).catch(err => {
    console.error('Error calculating penalties:', err);
    process.exit(1);
  });
}

module.exports = { calculatePenalties };
