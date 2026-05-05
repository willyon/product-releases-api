require('dotenv').config()

const express = require('express')
const cors = require('cors')
const { ensureSchemaInitialized } = require('./src/db/ensureSchema')
const { closeDb } = require('./src/db/getDb')

const { responseHandler } = require('./src/middlewares/responseHandler')
const { errorHandler } = require('./src/middlewares/errorHandler')
const statsRoutes = require('./src/routes/statsRoutes')
const authRoutes = require('./src/routes/authRoutes')

ensureSchemaInitialized()

const app = express()
/** 默认 3091，避免与本机 Docker 映射的 3090 冲突；容器内由环境变量 PORT=3090 覆盖 */
const PORT = process.env.PORT || 3091
const HOST = process.env.HOST || '127.0.0.1'

const parseOrigins = () => {
  const raw = process.env.STATS_CORS_ORIGINS || ''
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// 开发态：仅放行 product-releases-app（Vite 默认见 product-releases-app/vite.config.js）
const DEV_DEFAULT_ORIGINS = new Set(['http://127.0.0.1:5174', 'http://localhost:5174'])

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
            const allowed = parseOrigins()
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
    allowedHeaders: ['Content-Type', 'Authorization']
  })
)

app.use(express.json())

app.use(responseHandler)

app.use('/api/auth', authRoutes)
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
