module.exports = function (api) {
  api.cache(true);
  const presetOpts = {};

  if (process.env.NODE_ENV !== 'production') {
    presetOpts.enableReactFastRefresh = true;
  }
  return {
    presets: [['babel-preset-expo', presetOpts]],
  };
};
