'use strict'

const MAX_ENTRIES = 500

const log = []

/**
 * Append an audit log entry.
 * @param {object} entry
 * @param {string} entry.type        - 'action' | 'create' | 'update' | 'delete'
 * @param {string} entry.itemId
 * @param {string} entry.itemName
 * @param {string} [entry.action]    - for type 'action': the SSH action name
 * @param {boolean} entry.success
 * @param {string} [entry.output]    - stdout from SSH action
 * @param {string} [entry.error]     - error message on failure
 */
function append(entry) {
  log.push({ ...entry, timestamp: new Date().toISOString() })
  if (log.length > MAX_ENTRIES) log.shift()
}

function getLog() {
  return log.slice().reverse() // newest first
}

module.exports = { append, getLog }
