'use strict';

function wrapAsync(fn) {
  if (typeof fn !== 'function') return fn;
  if (fn.length > 3) return fn;
  return function asyncWrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function patchRouter(router) {
  if (!router?.stack) return router;
  router.stack.forEach((layer) => {
    if (layer.route) {
      layer.route.stack.forEach((s) => {
        s.handle = wrapAsync(s.handle);
      });
    } else if (layer.name === 'router' && layer.handle?.stack) {
      patchRouter(layer.handle);
    } else if (layer.handle) {
      layer.handle = wrapAsync(layer.handle);
    }
  });
  return router;
}

module.exports = { patchRouter, wrapAsync };
