const { ERROR_CODES } = require('../constants/messageCodes')

class CustomError extends Error {
  constructor({
    httpStatus = 500,
    messageCode = ERROR_CODES.SERVER_ERROR,
    messageType = 'error',
    details,
    public: publicFields,
    message
  } = {}) {
    super(message)
    this.httpStatus = httpStatus
    this.messageCode = messageCode
    this.messageType = messageType
    if (details !== undefined) this.details = details
    if (publicFields !== undefined) this.public = publicFields
    Error.captureStackTrace(this, this.constructor)
  }
}

module.exports = CustomError
