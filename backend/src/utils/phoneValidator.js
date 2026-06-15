const { body } = require('express-validator');
const { normalizeMobileToE164 } = require('./phone');

function mobileField(field = 'mobile') {
  return body(field).custom((value, { req }) => {
    const r = normalizeMobileToE164(value);
    if (!r.ok) throw new Error(r.error);
    req.body[field] = r.e164;
    return true;
  });
}

module.exports = { mobileField };
