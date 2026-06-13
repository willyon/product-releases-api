const zhMessages = require('./zh')
const enMessages = require('./en')

function getI18nMessage(messageCode, lang = 'zh', params) {
  const safeParams = params || {}
  const messages = lang === 'en' ? enMessages : zhMessages
  let messageTemplate = messages[messageCode] || messages.SERVER_ERROR || 'Unknown response'

  Object.entries(safeParams).forEach(([key, value]) => {
    messageTemplate = messageTemplate.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value))
  })

  return messageTemplate
}

module.exports = getI18nMessage
