'use strict'

const net = require('net')
const { loadConfig } = require('./config')

// Block loopback and link-local addresses to prevent SSRF
// (cloud metadata endpoints like 169.254.169.254, backend loopback on 127.x)
function isSafeUrl(urlStr) {
  let parsed
  try { parsed = new URL(urlStr) } catch { return false }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false
  const h = parsed.hostname.replace(/^\[|\]$/g, '') // strip IPv6 brackets
  if (h === 'localhost' || h === '::1' || h === '::ffff:127.0.0.1') return false
  if (/^127\./.test(h)) return false      // loopback
  if (/^169\.254\./.test(h)) return false // link-local / cloud metadata (IMDS)
  return true
}

// In-memory status cache: { [itemId]: { status, statusCode, latencyMs, checkedAt } }
const statusCache = {}

async function tcpPing(host, port, timeoutMs) {
  const start = Date.now()
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (status) => {
      socket.destroy()
      resolve({ status, statusCode: null, latencyMs: Date.now() - start, checkedAt: new Date().toISOString() })
    }
    socket.setTimeout(timeoutMs)
    socket.on('connect', () => done('online'))
    socket.on('timeout', () => done('offline'))
    socket.on('error', () => done('offline'))
    socket.connect(port, host)
  })
}

async function checkItem(item, timeoutMs) {
  const url = item.health_check || item.url
  if (url && !isSafeUrl(url)) {
    console.warn(`[healthcheck] Blocked SSRF attempt for item "${item.id}": ${url}`)
    return { status: 'unknown', statusCode: null, latencyMs: null, checkedAt: new Date().toISOString() }
  }
  if (!url) {
    if (item.management?.type === 'ssh-server') {
      return tcpPing(item.management.host, item.management.port || 22, timeoutMs)
    }
    return { status: 'unknown', statusCode: null, latencyMs: null, checkedAt: new Date().toISOString() }
  }
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { signal: controller.signal, redirect: 'manual' })
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

async function checkAndCacheItem(item) {
  const timeoutMs = parseInt(process.env.REQUEST_TIMEOUT_MS || '5000', 10)
  const result = await checkItem(item, timeoutMs)
  statusCache[item.id] = result
  return result
}

function startHealthCheckScheduler(intervalMs, timeoutMs) {
  // Run immediately on startup, then on every interval
  runAllChecks(timeoutMs)
  setInterval(() => runAllChecks(timeoutMs), intervalMs)
}

module.exports = { startHealthCheckScheduler, getStatus, checkItem, checkAndCacheItem, runAllChecks }
