'use strict'

const express = require('express')
const cookieParser = require('cookie-parser')
const rateLimit = require('express-rate-limit')
const { maybeResetPassword } = require('./resetPassword')
const { authMiddleware } = require('./middleware/auth')
const { twoFactorMiddleware } = require('./middleware/twoFactor')
const { startHealthCheckScheduler, runAllChecks } = require('./healthcheck')
const { loadConfig } = require('./config')
const authRouter = require('./routes/auth')
const itemsRouter = require('./routes/items')
const actionsRouter = require('./routes/actions')
const { getLog } = require('./auditLog')

maybeResetPassword()

const PORT = parseInt(process.env.PORT || '3001', 10)
const CHECK_INTERVAL_SECONDS = parseInt(process.env.CHECK_INTERVAL_SECONDS || '60', 10)
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '5000', 10)

// Fail fast if credentials are not configured
let auth
try {
  auth = authMiddleware()
} catch (err) {
  console.error(`ERROR: ${err.message}`)
  process.exit(1)
}

// Validate config file is readable on startup
try {
  loadConfig()
} catch (err) {
  console.error(`ERROR: Failed to load config: ${err.message}`)
  process.exit(1)
}

// Rate limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
})

// Tight limit on 2FA email sending to prevent inbox spam
const twoFaSendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification code requests, please try again later' },
})

const app = express()
app.set('trust proxy', 1) // trust only the nearest proxy (nginx); prevents X-Forwarded-For spoofing
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

app.use(apiLimiter)            // 1. Rate limiting — before auth to cover brute force
app.use(auth)                  // 2. Basic auth (password) — all routes
app.use('/api/auth/2fa/send', twoFaSendLimiter) // 3. Extra tight limit for 2FA email
app.use(twoFactorMiddleware()) // 4. 2FA check — skips /api/auth/2fa/* automatically

app.use('/api/auth', authRouter)
app.use('/api/items', itemsRouter)
app.use('/api/items', actionsRouter)

app.get('/api/audit-log', (req, res) => {
  res.json(getLog())
})

app.get('/api/config', (req, res) => {
  try {
    const items = loadConfig().map(item => {
      if (!item.management) return item
      return { ...item, management: { ...item.management, ssh_key: '[redacted]' } }
    })
    res.json(items)
  } catch (err) {
    res.status(500).json({ error: `Config error: ${err.message}` })
  }
})

app.post('/api/healthcheck/run', async (req, res) => {
  await runAllChecks(REQUEST_TIMEOUT_MS)
  res.json({ ok: true })
})

startHealthCheckScheduler(CHECK_INTERVAL_SECONDS * 1000, REQUEST_TIMEOUT_MS)

app.listen(PORT, () => {
  console.log(`Dashboard backend listening on port ${PORT}`)
  console.log(`Health checks every ${CHECK_INTERVAL_SECONDS}s`)
})

module.exports = app
