'use strict'

const fs = require('fs')

const SETTINGS_FILE = process.env.SETTINGS_FILE || '/app/config/state/settings.json'

// Allowed UI settings with their defaults and validators
const SCHEMA = {
  iconMode: { default: false, valid: v => typeof v === 'boolean' },
}

function defaults() {
  return Object.fromEntries(Object.entries(SCHEMA).map(([k, s]) => [k, s.default]))
}

function readSettings() {
  try {
    const stored = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
    const result = defaults()
    for (const key of Object.keys(SCHEMA)) {
      if (stored && SCHEMA[key].valid(stored[key])) result[key] = stored[key]
    }
    return result
  } catch {
    return defaults()
  }
}

// Merge a partial update into the stored settings; unknown keys or invalid values are rejected
function updateSettings(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    const err = new Error('Expected a JSON object')
    err.statusCode = 400
    throw err
  }
  const fields = {}
  for (const [key, value] of Object.entries(patch)) {
    if (!SCHEMA[key]) fields[key] = 'unknown setting'
    else if (!SCHEMA[key].valid(value)) fields[key] = 'invalid value'
  }
  if (Object.keys(fields).length) {
    const err = new Error('Validation failed')
    err.statusCode = 400
    err.fields = fields
    throw err
  }
  const updated = { ...readSettings(), ...patch }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf8')
  return updated
}

module.exports = { readSettings, updateSettings }
