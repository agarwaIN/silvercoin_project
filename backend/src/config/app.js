const PRODUCTION_PUBLIC_ORIGIN = (
  process.env.PUBLIC_ORIGIN
  || process.env.APP_PUBLIC_ORIGIN
  || ''
).replace(/\/+$/, '');

module.exports = {
  PRODUCTION_PUBLIC_ORIGIN,
};
