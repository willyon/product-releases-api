const getI18nMessage = require('../i18n/getI18nMessage')
const { SUCCESS_CODES } = require('../constants/messageCodes')

const responseHandler = (req, res, next) => {
  req.userLanguage = req.get('X-Accept-Language') || 'zh'

  res.sendResponse = ({ messageCode = SUCCESS_CODES.REQUEST_COMPLETED, data = null, httpStatus = 200, details } = {}) => {
    const message = getI18nMessage(messageCode, req.userLanguage, details)
    const safeStatus = Number.isInteger(httpStatus) ? httpStatus : 200
    const payload = {
      status: 'success',
      messageType: 'success',
      messageCode,
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
