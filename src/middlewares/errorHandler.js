const getI18nMessage = require('../i18n/getI18nMessage')
const CustomError = require('../errors/customError')
const { ERROR_CODES } = require('../constants/messageCodes')

function mapToKnownCustomError(err) {
  if (err && err.type === 'entity.parse.failed') {
    return new CustomError({
      message: err?.message,
      httpStatus: 400,
      messageCode: ERROR_CODES.INVALID_PARAMETERS,
      messageType: 'warning',
      details: { reason: 'invalid_json' }
    })
  }
  return null
}

function errorHandler(err, req, res, _next) {
  if (!(err instanceof CustomError)) {
    const mapped = mapToKnownCustomError(err)
    err =
      mapped ||
      new CustomError({
        httpStatus: 500,
        messageCode: ERROR_CODES.SERVER_ERROR,
        message: err?.message,
        messageType: 'error'
      })
  }

  const lang = req.userLanguage || 'zh'
  const { httpStatus, messageCode, messageType, public: publicFields, details } = err
  const safeStatus = Number.isInteger(httpStatus) && httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500
  const safeCode = messageCode || ERROR_CODES.SERVER_ERROR
  const messageText = getI18nMessage(safeCode, lang, { ...details, ...publicFields })

  console.error(`[${req.method}] ${req.path}`, `[${safeCode}]`, err.message || messageText, err.stack || '')

  const payload = {
    status: 'error',
    messageType: messageType || 'error',
    messageCode: safeCode,
    message: messageText
  }
  if (publicFields && typeof publicFields === 'object') {
    payload.data = publicFields
  }

  res.status(safeStatus).json(payload)
}

module.exports = { errorHandler }
