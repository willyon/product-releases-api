/** 许可证 env 默认值（trial / Pro） */
const TRIAL_DAYS = Number(process.env.LICENSE_TRIAL_DAYS || 14)
const DEVICE_LIMIT = Number(process.env.LICENSE_DEVICE_LIMIT || 2)

module.exports = {
  TRIAL_DAYS,
  DEVICE_LIMIT
}
