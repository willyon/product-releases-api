/** 163 等 SMTP：Pro 激活码邮件。配置见 .env EMAIL_* */
const nodemailer = require('nodemailer')
const CustomError = require('../errors/customError')
const { ERROR_CODES: EC } = require('../constants/messageCodes')
const { DEVICE_LIMIT } = require('../config/licenseConfig')

function assertEmailConfigured() {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new CustomError({ httpStatus: 503, messageCode: EC.EMAIL_NOT_CONFIGURED })
  }
}

function createTransporter() {
  assertEmailConfigured()
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT || 465),
    secure: String(process.env.EMAIL_SECURE ?? 'true') !== 'false',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  })
}

function getFromAddress() {
  const productTitle = process.env.LICENSE_PRODUCT_TITLE || '笑笑相册'
  return `${productTitle} <${process.env.EMAIL_USER}>`
}

async function sendMail({ to, subject, text, html }) {
  const transporter = createTransporter()
  try {
    await transporter.sendMail({
      from: getFromAddress(),
      to,
      subject,
      text,
      html
    })
  } catch (error) {
    throw new CustomError({
      httpStatus: 502,
      messageCode: EC.EMAIL_SEND_FAILED,
      message: error?.message
    })
  }
}

async function sendProActivationEmail({ email, activationCode }) {
  await sendMail({
    to: email,
    subject: '笑笑相册 Pro 激活码',
    text: [
      '感谢购买笑笑相册 Pro。',
      '',
      `Pro 激活码：${activationCode}`,
      '',
      '激活步骤：',
      '1. 打开笑笑相册',
      '2. 进入 版本与激活 → 输入 Pro 激活码',
      '',
      `付款确认后不予退款。Pro 授权可绑定 ${DEVICE_LIMIT} 台设备。`,
      '',
      '此邮件由系统自动发送，请勿直接回复。'
    ].join('\n'),
    html: `
    <p>感谢购买笑笑相册 Pro。</p>
    <p style="font-size:22px;font-weight:700;letter-spacing:0.08em;">${activationCode}</p>
    <p><strong>激活步骤：</strong></p>
    <ol>
      <li>打开笑笑相册</li>
      <li>进入 <strong>版本与激活</strong> → 输入 Pro 激活码</li>
    </ol>
    <p style="color:#666;font-size:13px;">付款确认后不予退款。Pro 授权可绑定 ${DEVICE_LIMIT} 台设备。</p>
    <p style="color:#666;font-size:13px;">此邮件由系统自动发送，请勿直接回复。</p>
  `
  })
}

module.exports = {
  sendProActivationEmail
}
