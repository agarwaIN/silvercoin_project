const PASSWORD_MIN = 6;
const PASSWORD_MAX = 32;

const PASSWORD_REGEX = /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{}|;:,.?]{6,32}$/;

const TEMP_PASSWORD_LENGTH = 10;
const TEMP_PASSWORD_CHARS =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';

function isValidPassword(value) {
  if (typeof value !== 'string') return false;
  return PASSWORD_REGEX.test(value);
}

function generateTempPassword(len = TEMP_PASSWORD_LENGTH) {
  const n = Math.min(Math.max(len, PASSWORD_MIN), PASSWORD_MAX);
  return Array.from({ length: n }, () =>
    TEMP_PASSWORD_CHARS[Math.floor(Math.random() * TEMP_PASSWORD_CHARS.length)],
  ).join('');
}

module.exports = {
  PASSWORD_MIN,
  PASSWORD_MAX,
  PASSWORD_REGEX,
  isValidPassword,
  generateTempPassword,
};
