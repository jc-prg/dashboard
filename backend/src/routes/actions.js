'use strict'

const { Router } = require('express')
const { loadConfig } = require('../config')
const { executeAction } = require('../actions')
const { append } = require('../auditLog')

const ALLOWED_ACTIONS = ['restart', 'reboot']

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
    append({ type: 'action', itemId: id, itemName: item.name, action, success: result.success, output: result.output })
    res.json({ id, action, success: result.success, output: result.output, executedAt: new Date().toISOString() })
  } catch (err) {
    append({ type: 'action', itemId: id, itemName: item.name, action, success: false, error: err.message })
    const status = err.statusCode === 400 ? 400 : 502
    res.status(status).json({ id, action, success: false, error: err.message, executedAt: new Date().toISOString() })
  }
})

module.exports = router
