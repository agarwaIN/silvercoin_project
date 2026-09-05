/**
 * Formats any date input (ISO string, YYYY-MM-DD, Date object, timestamp) to DD/MM/YYYY.
 *
 * @param {string|number|Date} val
 * @returns {string} Formatted date string in DD/MM/YYYY format.
 */
export function formatDate(val) {
  if (!val) return '';

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return '';

    // If already in DD/MM/YYYY, return it
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      return trimmed;
    }

    // Match YYYY-MM-DD or YYYY-M-D (with optional trailing timestamp or time)
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (ymdMatch) {
      const [, y, m, d] = ymdMatch;
      // If it doesn't have time portion, avoid timezone shifts by parsing directly
      if (!trimmed.includes('T') && !trimmed.includes(':')) {
        return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
      }
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
    return `${day}/${month}/${year}`;
  } catch {
    return String(val);
  }
}

/**
 * Returns today's date in DD/MM/YYYY format.
 */
export function getTodayFormatted() {
  return formatDate(new Date());
}
