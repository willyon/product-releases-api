const express = require('express')
const asyncHandler = require('../utils/asyncHandler')
const { createSession } = require('../controllers/authController')

const router = express.Router()

router.post('/session', asyncHandler(createSession))

module.exports = router
