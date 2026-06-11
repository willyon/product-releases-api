/**
 * 云端许可证 API 路由（桌面端 + 运维 Admin）。
 *
 * 用户侧：试用发码/激活、Pro 兑换
 * Admin（X-Admin-Key）：批量生成激活码、确认到账发码、查询邮箱状态
 */
const express = require('express')
const asyncHandler = require('../utils/asyncHandler')
const licenseController = require('../controllers/licenseController')
const adminAuthMiddleware = require('../middlewares/adminAuthMiddleware')

const router = express.Router()

router.post('/trial/send-code', asyncHandler(licenseController.sendTrialCode))
router.post('/trial/activate', asyncHandler(licenseController.activateTrial))
router.post('/pro/redeem', asyncHandler(licenseController.redeemPro))
router.get('/admin/status', adminAuthMiddleware, asyncHandler(licenseController.getLicenseStatus))

router.post('/admin/codes', adminAuthMiddleware, asyncHandler(licenseController.generateProCodes))
router.post('/admin/fulfill', adminAuthMiddleware, asyncHandler(licenseController.fulfillOrder))

module.exports = router
