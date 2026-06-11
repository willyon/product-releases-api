/**
 * product-releases-api 入口。
 *
 * 同一进程、同一端口同时提供：
 * - /api/stats/*   下载站访问/下载统计 + 统计页管理员登录
 * - /api/license/* 桌面端试用/Pro 激活（license.bingbingcloud.com 反代到此）
 *
 * CORS 分两套：stats 给浏览器；license 额外放行无 Origin（Electron）。
 */
require('dotenv').config()

const express = require('express')
const cors = require('cors')
const { closeDb } = require('./src/db/getDb')

const { responseHandler } = require('./src/middlewares/responseHandler')
const { errorHandler } = require('./src/middlewares/errorHandler')
const statsRoutes = require('./src/routes/statsRoutes')
const licenseRoutes = require('./src/routes/licenseRoutes')

const app = express()
const PORT = process.env.PORT || 3091
const HOST = process.env.HOST || '127.0.0.1'

const parseOrigins = (raw) =>
  String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const DEV_DEFAULT_ORIGINS = new Set(['http://127.0.0.1:5174', 'http://localhost:5174'])

// 下载站 product-releases-app 使用的 CORS
app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'development'
        ? (origin, callback) => {
            if (!origin || DEV_DEFAULT_ORIGINS.has(origin)) {
              callback(null, true)
            } else {
              callback(null, false)
            }
          }
        : (origin, callback) => {
            const allowed = parseOrigins(process.env.STATS_CORS_ORIGINS)
            if (allowed.length === 0) {
              callback(null, false)
              return
            }
            if (!origin || allowed.includes(origin)) {
              callback(null, true)
            } else {
              callback(null, false)
            }
          },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key']
  })
)

app.use(express.json())
app.use(responseHandler)

// 桌面端许可证 API；无 Origin 时放行（Electron fetch）
app.use(
  '/api/license',
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true)
        return
      }
      const allowed = parseOrigins(process.env.LICENSE_CORS_ORIGINS)
      if (allowed.length === 0 || allowed.includes(origin)) {
        callback(null, true)
        return
      }
      callback(null, false)
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Admin-Key']
  }),
  licenseRoutes
)

app.use('/api/stats', statsRoutes)

app.use(errorHandler)

const server = app.listen(PORT, HOST, () => {
  console.log(`product-releases-api 已启动：http://${HOST}:${PORT}`)
})

let stopping = false
function shutdown() {
  if (stopping) return
  stopping = true
  server.close(() => {
    try {
      closeDb()
    } catch (e) {
      console.warn('closeDb', e)
    }
    process.exit(0)
  })
}
;['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, shutdown))
