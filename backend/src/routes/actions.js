'use strict'

const { Router } = require('express')
const { loadConfig } = require('../config')
const { executeAction } = require('../actions')
const { append } = require('../auditLog')

// Strip absolute filesystem paths from error messages before sending to client
// e.g. "ENOENT: no such file or directory, open '/app/config/secrets/key'" → "[path]"
function sanitizeError(msg) {
  return (msg || 'Unknown error').replace(/\/[^\s'",]*/g, '[path]')
}

const ALLOWED_ACTIONS = ['start', 'stop', 'restart', 'reboot']

const router = Router()

router.post('/:id/action/:action', async (req, res) => {
  const { id, action } = req.params

  if (!ALLOWED_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `Unknown action "${action}"` })
  }

  let item, allItems
  try {
    allItems = loadConfig()
    item = allItems.find(i => i.id === id)
  } catch (err) {
    return res.status(500).json({ error: `Config error: ${err.message}` })
  }

  if (!item) return res.status(404).json({ error: 'Item not found' })

  try {
    const result = await executeAction(item, action, allItems)
    // L3: output is returned to the caller but not stored in the audit log
    append({ type: 'action', itemId: id, itemName: item.name, action, success: result.success })
    res.json({ id, action, success: result.success, output: result.output, executedAt: new Date().toISOString() })
  } catch (err) {
    // L1: strip filesystem paths from error messages before sending to client
    const safeError = sanitizeError(err.message)
    append({ type: 'action', itemId: id, itemName: item.name, action, success: false, error: safeError })
    const status = err.statusCode === 400 ? 400 : 502
    res.status(status).json({ id, action, success: false, error: safeError, executedAt: new Date().toISOString() })
  }
})

module.exports = router
