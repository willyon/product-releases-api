const express = require('express')
const asyncHandler = require('../utils/asyncHandler')
const authMiddleware = require('../middlewares/authMiddleware')
const statsController = require('../controllers/statsController')

const router = express.Router()

router.get('/', authMiddleware, asyncHandler(statsController.getStats))
router.get('/all', authMiddleware, asyncHandler(statsController.getAllStats))
router.post('/page-view', asyncHandler(statsController.recordPageView))
router.post('/download', asyncHandler(statsController.recordDownload))

module.exports = router
