'use strict'

const express = require('express')
const { authMiddleware } = require('./middleware/auth')
const { startHealthCheckScheduler } = require('./healthcheck')
const { loadConfig } = require('./config')
const authRouter = require('./routes/auth')
const itemsRouter = require('./routes/items')
const actionsRouter = require('./routes/actions')

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

const app = express()
app.use(express.json())
app.use(auth)

app.use('/api/auth', authRouter)
app.use('/api/items', itemsRouter)
app.use('/api/items', actionsRouter)

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

startHealthCheckScheduler(CHECK_INTERVAL_SECONDS * 1000, REQUEST_TIMEOUT_MS)

app.listen(PORT, () => {
  console.log(`Dashboard backend listening on port ${PORT}`)
  console.log(`Health checks every ${CHECK_INTERVAL_SECONDS}s`)
})

module.exports = app
