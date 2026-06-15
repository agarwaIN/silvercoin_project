const PASSWORD_MIN = 6;
const PASSWORD_MAX = 32;
const PASSWORD_REGEX = /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{}|;:,.?]{6,32}$/;

export function validatePassword(value) {
  if (typeof value !== 'string') {
    return { ok: false, error: `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.` };
  }
  if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) {
    return { ok: false, error: `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.` };
  }
  if (!PASSWORD_REGEX.test(value)) {
    return {
      ok: false,
      error:
        'Use only letters, numbers, and allowed symbols (!@#$%^&*()_+-=[]{}|;:,.?).',
    };
  }
  return { ok: true };
}

export { PASSWORD_MIN, PASSWORD_MAX };
