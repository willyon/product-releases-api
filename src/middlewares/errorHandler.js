function errorHandler(err, req, res, _next) {
  const status = Number.isInteger(err.httpStatus)
    ? err.httpStatus
    : Number.isInteger(err.status)
      ? err.status
      : 500
  const safeStatus = status >= 400 && status < 600 ? status : 500
  const msg = typeof err.message === 'string' && err.message ? err.message : 'Internal Server Error'

  console.error(`[${req.method}] ${req.path}`, msg, err.stack || '')

  res.status(safeStatus).json({
    status: 'error',
    messageType: 'error',
    message: safeStatus === 500 ? '服务器内部错误' : msg
  })
}

module.exports = { errorHandler }
