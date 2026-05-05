/**
 * 统一成功响应（字段形态参考 xiaoxiao-album-api，精简无 i18n）
 */
const responseHandler = (req, res, next) => {
  res.sendResponse = ({ data = null, httpStatus = 200, message = 'ok' } = {}) => {
    const safeStatus = Number.isInteger(httpStatus) ? httpStatus : 200
    const payload = {
      status: 'success',
      messageType: 'success',
      message
    }
    if (data !== null && data !== undefined) {
      payload.data = data
    }
    res.status(safeStatus).json(payload)
  }
  next()
}

module.exports = { responseHandler }
