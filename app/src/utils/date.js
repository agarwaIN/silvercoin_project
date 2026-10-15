/**
 * Formats any date input (ISO string, YYYY-MM-DD, DD/MM/YYYY, Date object, timestamp) to DD-MM-YYYY.
 *
 * @param {string|number|Date} val
 * @param {string} [separator='-']
 * @returns {string} Formatted date string in DD-MM-YYYY format.
 */
export function formatDate(val, separator = '-') {
  if (!val) return '';

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return '';

    // Match DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (dmyMatch) {
      const d = dmyMatch[1].padStart(2, '0');
      const m = dmyMatch[2].padStart(2, '0');
      const y = dmyMatch[3];
      return `${d}${separator}${m}${separator}${y}`;
    }

    // Match YYYY-MM-DD or YYYY/MM/DD (with optional trailing timestamp or time)
    const ymdMatch = trimmed.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})(?:[T\s].*)?$/);
    if (ymdMatch) {
      const [, y, m, d] = ymdMatch;
      return `${d.padStart(2, '0')}${separator}${m.padStart(2, '0')}${separator}${y}`;
    }
  }

  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) {
      return String(val);
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}${separator}${month}${separator}${year}`;
  } catch {
    return String(val);
  }
}

/**
 * Safely parses any date string (DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, ISO string) into a local Date object.
 * Avoids UTC timezone shifts.
 * 
 * @param {string|number|Date} val
 * @returns {Date}
 */
export function parseDateSafe(val) {
  if (!val) return new Date();
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? new Date() : val;
  }
  const s = String(val).trim();
  if (!s) return new Date();

  // Check DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Check YYYY-MM-DD
  const ymdMatch = s.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  try {
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date() : d;
  } catch {
    return new Date();
  }
}

/**
 * Formats a Date object or day/month/year numbers into DD-MM-YYYY string.
 */
export function formatToDDMMYYYY(dateOrYear, maybeMonth, maybeDay, separator = '-') {
  if (dateOrYear instanceof Date) {
    const d = String(dateOrYear.getDate()).padStart(2, '0');
    const m = String(dateOrYear.getMonth() + 1).padStart(2, '0');
    const y = dateOrYear.getFullYear();
    return `${d}${separator}${m}${separator}${y}`;
  }
  if (typeof dateOrYear === 'number' && maybeMonth !== undefined && maybeDay !== undefined) {
    const y = dateOrYear;
    const m = String(maybeMonth + 1).padStart(2, '0');
    const d = String(maybeDay).padStart(2, '0');
    return `${d}${separator}${m}${separator}${y}`;
  }
  return formatDate(dateOrYear, separator);
}

/**
 * Returns today's date in DD-MM-YYYY format.
 */
export function getTodayFormatted(separator = '-') {
  return formatDate(new Date(), separator);
}

/**
 * Formats any date input into DD-MM-YYYY, hh:mm AM/PM format.
 *
 * @param {string|number|Date} val
 * @param {string} [separator='-']
 * @returns {string} Formatted date & time string.
 */
export function formatDateTime(val, separator = '-') {
  if (!val) return '';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = String(hours).padStart(2, '0');
    return `${day}${separator}${month}${separator}${year}, ${strHours}:${minutes} ${ampm}`;
  } catch {
    return String(val);
  }
}

/**
 * Resolves submission or creation date/time info for a loan with robust fallbacks.
 *
 * @param {object} loan
 * @returns {{ time: string|null, label: string }}
 */
export function getLoanSubmissionInfo(loan) {
  if (!loan) return { time: null, label: 'Submitted On' };
  const isDraft = loan.status === 'draft';
  const time = loan.submittedAt
    || loan.submissionDate
    || (isDraft ? loan.createdAt : (loan.status === 'submitted' ? (loan.updatedAt || loan.createdAt) : (loan.createdAt || loan.updatedAt)))
    || null;
  const label = (isDraft && !loan.submittedAt) ? 'Created On' : 'Submitted On';
  return { time, label };
}

/**
 * Resolves the numeric submission timestamp (in ms) for any loan.
 */
export function getLoanSubmissionTimestamp(loan) {
  if (!loan) return 0;
  const rawTime = loan.submittedAt || loan.submissionDate;
  if (rawTime) {
    const t = new Date(rawTime).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (loan.status === 'draft') {
    const t = new Date(loan.createdAt || loan.updatedAt || 0).getTime();
    return isNaN(t) ? 0 : t;
  }
  if (loan.status === 'submitted' && loan.updatedAt) {
    const t = new Date(loan.updatedAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  const cTime = new Date(loan.createdAt || 0).getTime();
  if (!isNaN(cTime) && cTime > 0) return cTime;
  const uTime = new Date(loan.updatedAt || 0).getTime();
  return isNaN(uTime) ? 0 : uTime;
}

/**
 * Extracts numeric sequence from APP-X or SL-X for tie-breaking.
 */
export function getLoanNumericSeq(loan) {
  if (!loan) return 0;
  const str = String(loan.applicationNumber || loan.displayLoanId || loan.loanId || '');
  const m = str.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

/**
 * Sorts loans for Admin so that the most latest submitted loans appear at the top of the list,
 * strictly by submission timestamp descending, and not according to app ID or loan ID.
 */
export function sortLoansByLatestSubmitted(items) {
  if (!Array.isArray(items)) return [];
  return [...items].sort((a, b) => {
    const bTime = getLoanSubmissionTimestamp(b);
    const aTime = getLoanSubmissionTimestamp(a);
    if (bTime !== aTime) {
      return bTime - aTime;
    }
    const bAlt = new Date(b.createdAt || b.updatedAt || 0).getTime();
    const aAlt = new Date(a.createdAt || a.updatedAt || 0).getTime();
    if (bAlt !== aAlt) {
      return bAlt - aAlt;
    }
    return getLoanNumericSeq(b) - getLoanNumericSeq(a);
  });
}

