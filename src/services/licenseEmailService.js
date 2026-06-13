/** 163 等 SMTP：试用验证码、Pro 激活码邮件。配置见 .env EMAIL_* */
const nodemailer = require('nodemailer')
const CustomError = require('../errors/customError')
const { ERROR_CODES: EC } = require('../constants/messageCodes')
const {
  TRIAL_DAYS,
  DEVICE_LIMIT,
  VERIFICATION_TTL_MINUTES,
  formatVerificationTtl
} = require('../config/licenseConfig')

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

async function sendTrialVerificationEmail({ email, code }) {
  const ttlLabel = formatVerificationTtl(VERIFICATION_TTL_MINUTES)
  await sendMail({
    to: email,
    subject: `笑笑相册 Pro 试用验证码（${TRIAL_DAYS} 天）`,
    text: [
      `您正在开启笑笑相册 ${TRIAL_DAYS} 天 Pro 试用。`,
      '',
      `试用验证码（6 位）：${code}`,
      '',
      `验证码有效期 ${ttlLabel}。若非本人操作，请忽略此邮件。`,
      '',
      '此邮件由系统自动发送，请勿直接回复。'
    ].join('\n'),
    html: `
    <p>您正在开启笑笑相册 <strong>${TRIAL_DAYS} 天 Pro 试用</strong>。</p>
    <p>试用验证码（6 位）：</p>
    <p style="font-size:24px;font-weight:700;letter-spacing:0.2em;">${code}</p>
    <p>验证码有效期 <strong>${ttlLabel}</strong>。若非本人操作，请忽略此邮件。</p>
    <p style="color:#666;font-size:13px;">此邮件由系统自动发送，请勿直接回复。</p>
  `
  })
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
      '3. 邮箱须与试用或付款备注邮箱一致',
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
      <li>邮箱须与试用或付款备注邮箱一致</li>
    </ol>
    <p style="color:#666;font-size:13px;">付款确认后不予退款。Pro 授权可绑定 ${DEVICE_LIMIT} 台设备。</p>
    <p style="color:#666;font-size:13px;">此邮件由系统自动发送，请勿直接回复。</p>
  `
  })
}

module.exports = {
  sendTrialVerificationEmail,
  sendProActivationEmail
}
