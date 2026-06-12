/**
 * 下载站统计 API 路由。
 */
const express = require('express')
const asyncHandler = require('../utils/asyncHandler')
const createJwtAuthMiddleware = require('../middlewares/jwtAuthMiddleware')
const statsController = require('../controllers/statsController')

const router = express.Router()
const statsAuth = createJwtAuthMiddleware({
  typ: 'product-releases-stats',
  unauthMessage: '登录已过期或令牌无效'
})

router.post('/page-view', asyncHandler(statsController.recordPageView))
router.post('/download', asyncHandler(statsController.recordDownload))
router.get('/counts', statsAuth, asyncHandler(statsController.getStats))
router.post('/admin/session', asyncHandler(statsController.createStatsSession))
router.get('/admin/all', statsAuth, asyncHandler(statsController.getAllStats))

module.exports = router
