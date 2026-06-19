'use strict'

const { Router } = require('express')
const { loadConfig, MANAGEMENT_ACTIONS } = require('../config')
const { getStatus } = require('../healthcheck')
const { addItem, updateItem, deleteItem } = require('../configWriter')
const { append } = require('../auditLog')
const { fetchServerDetails } = require('../serverDetails')

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
    os: mgmt.os || 'linux',
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

router.get('/:id/details', async (req, res) => {
  try {
    const item = loadConfig().find(i => i.id === req.params.id)
    if (!item) return res.status(404).json({ error: 'Item not found' })
    if (item.management?.type !== 'ssh-server') {
      return res.status(400).json({ error: 'Details are only available for ssh-server items' })
    }
    const details = await fetchServerDetails(item)
    res.json(details)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Write ────────────────────────────────────────────────────────────────────

router.post('/', (req, res) => {
  try {
    const item = enrichRaw(addItem(req.body))
    append({ type: 'create', itemId: item.id, itemName: item.name, success: true })
    res.status(201).json(item)
  } catch (err) {
    append({ type: 'create', itemId: null, itemName: req.body.name || '?', success: false, error: err.message })
    handleWriteError(err, res)
  }
})

router.put('/:id', (req, res) => {
  try {
    const item = enrichRaw(updateItem(req.params.id, req.body))
    append({ type: 'update', itemId: item.id, itemName: item.name, success: true })
    res.json(item)
  } catch (err) {
    append({ type: 'update', itemId: req.params.id, itemName: req.body.name || '?', success: false, error: err.message })
    handleWriteError(err, res)
  }
})

router.delete('/:id', (req, res) => {
  try {
    // Load name before deleting
    const existing = loadConfig().find(i => i.id === req.params.id)
    deleteItem(req.params.id)
    append({ type: 'delete', itemId: req.params.id, itemName: existing ? existing.name : req.params.id, success: true })
    res.json({ ok: true })
  } catch (err) {
    append({ type: 'delete', itemId: req.params.id, itemName: req.params.id, success: false, error: err.message })
    handleWriteError(err, res)
  }
})

module.exports = router
