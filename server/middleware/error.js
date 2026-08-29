function isPgErrorCode(code) {
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code);
}

export function errorHandler(err, _req, res, _next) {
  console.error(err);
  const status = Number(err.status) || 500;
  const expose = status < 500 && Boolean(err.status) && !isPgErrorCode(err.code);
  const payload = {
    message: expose ? err.message || 'Request failed' : 'Something went wrong. Try again.',
  };
  if (expose && err.code && !isPgErrorCode(err.code)) payload.code = err.code;
  res.status(status).json(payload);
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
