'use strict'

const { Router } = require('express')
const { loadConfig, MANAGEMENT_ACTIONS } = require('../config')
const { getStatus } = require('../healthcheck')
const { addItem, updateItem, deleteItem } = require('../configWriter')

const SECRETS_PREFIX = '/app/config/secrets/'

const router = Router()

// Expose management fields for the edit form, split by type.
function managementInfo(mgmt) {
  if (!mgmt) return null
  if (mgmt.type === 'ssh-compose') {
    return {
      type: mgmt.type,
      serverId: mgmt.server_id,
      composeDir: mgmt.compose_dir || '',
      composeService: mgmt.compose_service || '',
    }
  }
  return {
    type: mgmt.type,
    host: mgmt.host,
    port: mgmt.port || 22,
    user: mgmt.user,
    sshKey: mgmt.ssh_key ? mgmt.ssh_key.replace(SECRETS_PREFIX, '') : '',
  }
}

function toResponse(item) {
  const s = getStatus(item.id)
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    description: item.description || '',
    url: item.url,
    healthCheck: item.health_check || '',
    tags: item.tags || [],
    actions: item.actions,
    managementInfo: managementInfo(item.management),
    status: s.status,
    statusCode: s.statusCode,
    latencyMs: s.latencyMs,
    checkedAt: s.checkedAt,
  }
}

// Enrich a raw item (returned by configWriter) with actions + status for the response.
function enrichRaw(raw) {
  const actions = raw.management ? (MANAGEMENT_ACTIONS[raw.management.type] || []) : []
  return toResponse({ ...raw, actions })
}

function handleWriteError(err, res) {
  const status = err.statusCode || 500
  const body = { error: err.message }
  if (err.fields) body.fields = err.fields
  res.status(status).json(body)
}

// ─── Read ─────────────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  try {
    res.json(loadConfig().map(toResponse))
  } catch (err) {
    res.status(500).json({ error: `Config error: ${err.message}` })
  }
})

router.get('/:id/status', (req, res) => {
  try {
    const item = loadConfig().find(i => i.id === req.params.id)
    if (!item) return res.status(404).json({ error: 'Item not found' })
    res.json(toResponse(item))
  } catch (err) {
    res.status(500).json({ error: `Config error: ${err.message}` })
  }
})

// ─── Write ────────────────────────────────────────────────────────────────────

router.post('/', (req, res) => {
  try {
    res.status(201).json(enrichRaw(addItem(req.body)))
  } catch (err) {
    handleWriteError(err, res)
  }
})

router.put('/:id', (req, res) => {
  try {
    res.json(enrichRaw(updateItem(req.params.id, req.body)))
  } catch (err) {
    handleWriteError(err, res)
  }
})

router.delete('/:id', (req, res) => {
  try {
    deleteItem(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    handleWriteError(err, res)
  }
})

module.exports = router
