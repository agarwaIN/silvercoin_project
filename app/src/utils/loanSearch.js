
export function getEffectiveLoanStatus(loan) {
  if (!loan) return 'draft';
  if (loan.isForeclosed || loan.foreclosureDetails || loan.status === 'foreclosed') return 'foreclosed';
  if (loan.status === 'completed') return 'completed';
  if (loan.status === 'rejected') return 'rejected';
  if (loan.status === 'returned') return 'returned';
  if (
    loan.status === 'active' ||
    (Array.isArray(loan.disbursements) && loan.disbursements.length > 0) ||
    Boolean(loan.disbursementDate)
  ) {
    return 'active';
  }
  return loan.status || 'draft';
}

export function isLoanActive(loan) {
  return getEffectiveLoanStatus(loan) === 'active';
}

export function isLoanApproved(loan) {
  return getEffectiveLoanStatus(loan) === 'approved';
}

export function normalizeLoanStatus(loan) {
  if (!loan || typeof loan !== 'object') return loan;
  const effectiveStatus = getEffectiveLoanStatus(loan);
  if (loan.status !== effectiveStatus) {
    return { ...loan, status: effectiveStatus };
  }
  return loan;
}

export function loanMatchesSearch(loan, rawQuery) {
  if (!loan) return false;
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return true;

  // 1. Check Owner / Borrower Name
  const name = String(loan.ownerName || loan.borrowerName || '').toLowerCase();
  if (name.includes(q)) return true;

  // 2. Check Loan Identifiers
  const loanId = String(loan.loanId || '').toLowerCase();
  const displayId = String(loan.displayLoanId || '').toLowerCase();
  const appId = String(loan.applicationNumber || '').toLowerCase();
  const officialId = String(loan.officialLoanId || '').toLowerCase();
  if (loanId.includes(q) || displayId.includes(q) || appId.includes(q) || officialId.includes(q)) {
    return true;
  }

  // 3. Check Mobile Number
  const mobile = String(loan.ownerMobile || loan.borrowerMobile || '').replace(/\D/g, '');
  const queryDigits = q.replace(/\D/g, '');
  if (queryDigits && mobile.includes(queryDigits)) {
    return true;
  }

  // 4. Check Aadhaar Number (Full 12 digits or Last 4 digits)
  const aadhaar = String(
    loan.aadhaar ||
    loan.borrowerAadhaar ||
    loan.aadhaarNumber ||
    loan.ownerAadhaar ||
    (loan.borrowerDetails && loan.borrowerDetails.aadhaar) ||
    ''
  );
  const aadhaarDigits = aadhaar.replace(/\D/g, '');

  if (aadhaarDigits) {
    // If the query contains 4 or more digits
    if (queryDigits.length >= 4) {
      // Exact match with the last 4 digits of Aadhaar card
      if (aadhaarDigits.slice(-4) === queryDigits) return true;
      // Ends with the searched digits
      if (aadhaarDigits.endsWith(queryDigits)) return true;
      // Substring match of digits
      if (aadhaarDigits.includes(queryDigits)) return true;
    }
    // String matching on formatted aadhaar
    if (aadhaar.toLowerCase().includes(q)) return true;
  }

  return false;
}
