/**
 * 云端许可证 API 路由。
 */
const express = require('express')
const asyncHandler = require('../utils/asyncHandler')
const licenseController = require('../controllers/licenseController')
const createJwtAuthMiddleware = require('../middlewares/jwtAuthMiddleware')

const router = express.Router()
const licenseAdminAuth = createJwtAuthMiddleware({ typ: 'product-releases-license-admin' })

router.post('/trial/send-code', asyncHandler(licenseController.sendTrialCode))
router.post('/trial/activate', asyncHandler(licenseController.activateTrial))
router.post('/pro/redeem', asyncHandler(licenseController.redeemPro))
router.post('/admin/session', asyncHandler(licenseController.createLicenseAdminSession))

const adminRouter = express.Router()
adminRouter.use(licenseAdminAuth)
adminRouter.get('/overview', asyncHandler(licenseController.getAdminOverview))
adminRouter.patch('/recipients/device-limit', asyncHandler(licenseController.setRecipientDeviceLimit))
adminRouter.post('/codes', asyncHandler(licenseController.generateProCodes))
adminRouter.post('/fulfill', asyncHandler(licenseController.fulfillOrder))
router.use('/admin', adminRouter)

module.exports = router
