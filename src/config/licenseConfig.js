/** 许可证 env 默认值（trial / Pro 发码 / 验证码 TTL） */
const isDev = process.env.NODE_ENV === 'development'

const TRIAL_DAYS = Number(process.env.LICENSE_TRIAL_DAYS || 14)
const DEVICE_LIMIT = Number(process.env.LICENSE_DEVICE_LIMIT || 2)
const SEND_CODE_COOLDOWN_SECONDS = Number(
  process.env.LICENSE_SEND_CODE_COOLDOWN_SECONDS ?? (isDev ? 0 : 60)
)
const VERIFICATION_TTL_MINUTES = Number(
  process.env.LICENSE_VERIFICATION_TTL_MINUTES ?? (isDev ? 1440 : 10)
)

function formatVerificationTtl(minutes) {
  if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440} 天`
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} 小时`
  return `${minutes} 分钟`
}

module.exports = {
  TRIAL_DAYS,
  DEVICE_LIMIT,
  SEND_CODE_COOLDOWN_SECONDS,
  VERIFICATION_TTL_MINUTES,
  formatVerificationTtl
}
