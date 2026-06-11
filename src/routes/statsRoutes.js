/**
 * 下载站统计 API 路由。
 *
 * 公开：page-view / download（body 带 productKey，如 xiaoxiao-photos）
 * 受保护：counts / admin/all 需 Bearer JWT（统计页登录后）
 */
const express = require('express')
const asyncHandler = require('../utils/asyncHandler')
const authMiddleware = require('../middlewares/authMiddleware')
const statsController = require('../controllers/statsController')

const router = express.Router()

router.post('/page-view', asyncHandler(statsController.recordPageView))
router.post('/download', asyncHandler(statsController.recordDownload))
router.get('/counts', authMiddleware, asyncHandler(statsController.getStats))
router.post('/admin/session', asyncHandler(statsController.createStatsSession))
router.get('/admin/all', authMiddleware, asyncHandler(statsController.getAllStats))

module.exports = router
