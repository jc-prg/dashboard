'use strict'

const fs = require('fs')

const MAX_ENTRIES = 500
const LOG_FILE = process.env.AUDIT_LOG_FILE || '/app/config/audit.log'

// In-memory log — populated from file on startup, capped at MAX_ENTRIES
const log = []

function loadFromFile() {
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8').trim()
    if (!content) return
    for (const line of content.split('\n').filter(Boolean).slice(-MAX_ENTRIES)) {
      try { log.push(JSON.parse(line)) } catch {}
    }
  } catch {
    // File missing or unreadable on first run — that's fine
  }
}

loadFromFile()

function append(entry) {
  const full = { ...entry, timestamp: new Date().toISOString() }
  log.push(full)
  if (log.length > MAX_ENTRIES) log.shift()
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(full) + '\n')
  } catch (err) {
    console.error('[auditLog] Failed to write log file:', err.message)
  }
}

function getLog() {
  return log.slice().reverse() // newest first
}

module.exports = { append, getLog }
