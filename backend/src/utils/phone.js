

function normalizeMobileToE164(input) {
  if (input == null || input === '') {
    return { ok: false, error: 'Mobile is required' };
  }
  const s = String(input).trim().replace(/[\s-]/g, '');
  if (!s) return { ok: false, error: 'Mobile is required' };
  if (/^\+[1-9]\d{6,14}$/.test(s)) return { ok: true, e164: s };
  if (/^[6-9]\d{9}$/.test(s)) return { ok: true, e164: `+91${s}` };
  return {
    ok: false,
    error:
      'Enter a 10-digit mobile number, or international format starting with + and country code.',
  };
}

module.exports = { normalizeMobileToE164 };
