/**
 * 业务层统一抛错：errorHandler 读取 err.httpStatus 返回对应 HTTP 状态。
 * 需要附带额外字段时：err.public = { ... }（如重复 fulfill 时返回已有激活码）
 */
function createApiError(message, httpStatus = 400) {
  const err = new Error(message)
  err.httpStatus = httpStatus
  return err
}

module.exports = { createApiError }
