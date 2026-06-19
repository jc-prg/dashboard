'use strict'

const { loadConfig } = require('./config')

// In-memory status cache: { [itemId]: { status, statusCode, latencyMs, checkedAt } }
const statusCache = {}

async function checkItem(item, timeoutMs) {
  const url = item.health_check || item.url
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    clearTimeout(timer)
    return {
      status: res.status < 400 ? 'online' : 'offline',
      statusCode: res.status,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
    }
  } catch {
    return {
      status: 'offline',
      statusCode: null,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
    }
  }
}

async function runAllChecks(timeoutMs) {
  let items
  try {
    items = loadConfig()
  } catch (err) {
    console.error('[healthcheck] Failed to load config, skipping cycle:', err.message)
    return
  }
  await Promise.all(
    items.map(async (item) => {
      statusCache[item.id] = await checkItem(item, timeoutMs)
    })
  )
}

function getStatus(id) {
  return statusCache[id] || { status: 'unknown', statusCode: null, latencyMs: null, checkedAt: null }
}

function startHealthCheckScheduler(intervalMs, timeoutMs) {
  // Run immediately on startup, then on every interval
  runAllChecks(timeoutMs)
  setInterval(() => runAllChecks(timeoutMs), intervalMs)
}

module.exports = { startHealthCheckScheduler, getStatus, checkItem }
