/**
 * 许可证运维接口鉴权：Header X-Admin-Key = LICENSE_ADMIN_SECRET
 * 用于 admin/codes、admin/fulfill、admin/status
 */
const { createApiError } = require('../utils/apiError')

function adminAuthMiddleware(req, _res, next) {
  const configured = String(process.env.LICENSE_ADMIN_SECRET || '').trim()
  if (!configured) {
    return next(createApiError('Admin 密钥未配置', 503))
  }
  const provided = String(req.get('X-Admin-Key') || '').trim()
  if (!provided || provided !== configured) {
    return next(createApiError('未授权', 401))
  }
  return next()
}

module.exports = adminAuthMiddleware
