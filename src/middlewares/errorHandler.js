/** 全局错误中间件：createApiError 抛出的 err.httpStatus → JSON 响应 */
function errorHandler(err, req, res, _next) {
  const status = Number.isInteger(err.httpStatus)
    ? err.httpStatus
    : Number.isInteger(err.status)
      ? err.status
      : 500
  const safeStatus = status >= 400 && status < 600 ? status : 500
  const msg = typeof err.message === 'string' && err.message ? err.message : 'Internal Server Error'

  console.error(`[${req.method}] ${req.path}`, msg, err.stack || '')

  const payload = {
    status: 'error',
    messageType: 'error',
    message: safeStatus === 500 ? '服务器内部错误' : msg
  }
  if (err.public && typeof err.public === 'object') {
    payload.data = err.public
  }

  res.status(safeStatus).json(payload)
}

module.exports = { errorHandler }
