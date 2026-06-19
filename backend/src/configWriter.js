'use strict'

const fs = require('fs')
const yaml = require('js-yaml')

const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/items.yml'
const SECRETS_PREFIX = '/app/config/secrets/'

const ALLOWED_CATEGORIES = ['project', 'server', 'tool']
const ALLOWED_MANAGEMENT_TYPES = ['ssh-server', 'ssh-compose']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function generateId(name, existingIds) {
  const base = slugify(name)
  if (!existingIds.includes(base)) return base
  let i = 2
  while (existingIds.includes(`${base}-${i}`)) i++
  return `${base}-${i}`
}

function readItems() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
  return yaml.load(raw)?.items || []
}

function writeItems(items) {
  const content = yaml.dump({ items }, { lineWidth: 120 })
  fs.writeFileSync(CONFIG_PATH, content, 'utf8')
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validate(data) {
  const errors = {}

  if (!data.name || !String(data.name).trim()) errors.name = 'required'
  if (!data.url || !String(data.url).trim()) errors.url = 'required'

  if (data.category && !ALLOWED_CATEGORIES.includes(data.category)) {
    errors.category = `must be one of: ${ALLOWED_CATEGORIES.join(', ')}`
  }
  if (data.id && !/^[a-z0-9-]+$/.test(data.id)) {
    errors.id = 'must contain only lowercase letters, numbers, and hyphens'
  }

  const mgmt = data.management
  if (mgmt) {
    if (!ALLOWED_MANAGEMENT_TYPES.includes(mgmt.type)) {
      errors['management.type'] = `must be one of: ${ALLOWED_MANAGEMENT_TYPES.join(', ')}`
    } else if (mgmt.type === 'ssh-compose') {
      if (!mgmt.server_id) errors['management.server_id'] = 'required'
      if (!mgmt.compose_dir) errors['management.compose_dir'] = 'required for ssh-compose'
    } else {
      if (!mgmt.host) errors['management.host'] = 'required'
      if (!mgmt.user) errors['management.user'] = 'required'
      if (!mgmt.ssh_key) {
        errors['management.ssh_key'] = 'required'
      } else if (!String(mgmt.ssh_key).startsWith(SECRETS_PREFIX)) {
        errors['management.ssh_key'] = `must start with ${SECRETS_PREFIX}`
      }
    }
  }

  return Object.keys(errors).length ? errors : null
}

// ─── Build a clean item object ────────────────────────────────────────────────

function buildItem(data, id) {
  const item = {
    id,
    name: data.name.trim(),
    category: data.category || 'project',
    url: data.url.trim(),
  }

  if (data.description?.trim()) item.description = data.description.trim()
  if (data.health_check?.trim()) item.health_check = data.health_check.trim()

  const tags = (data.tags || []).map(t => String(t).trim()).filter(Boolean)
  if (tags.length) item.tags = tags

  const mgmt = data.management
  if (mgmt) {
    if (mgmt.type === 'ssh-compose') {
      item.management = {
        type: 'ssh-compose',
        server_id: mgmt.server_id,
        compose_dir: mgmt.compose_dir,
      }
      if (mgmt.compose_service?.trim()) {
        item.management.compose_service = mgmt.compose_service.trim()
      }
    } else {
      item.management = {
        type: mgmt.type,
        host: mgmt.host,
        port: mgmt.port ? Number(mgmt.port) : 22,
        user: mgmt.user,
        ssh_key: mgmt.ssh_key,
      }
    }
  }

  return item
}

// ─── Server reference check ───────────────────────────────────────────────────

function checkServerRef(data, existing) {
  if (data.management?.type === 'ssh-compose' && data.management.server_id) {
    const server = existing.find(i => i.id === data.management.server_id)
    if (!server) {
      const err = new Error(`Server "${data.management.server_id}" not found`)
      err.statusCode = 400
      err.fields = { 'management.server_id': 'referenced server not found' }
      throw err
    }
    if (server.management?.type !== 'ssh-server') {
      const err = new Error(`Item "${data.management.server_id}" does not have ssh-server management`)
      err.statusCode = 400
      err.fields = { 'management.server_id': 'referenced item must have ssh-server management' }
      throw err
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

function addItem(data) {
  const errors = validate(data)
  if (errors) {
    const err = new Error('Validation failed')
    err.statusCode = 400
    err.fields = errors
    throw err
  }

  const existing = readItems()
  checkServerRef(data, existing)
  const existingIds = existing.map(i => i.id)
  const id = data.id || generateId(data.name, existingIds)

  if (existingIds.includes(id)) {
    const err = new Error(`ID "${id}" already exists`)
    err.statusCode = 409
    throw err
  }

  const item = buildItem(data, id)
  writeItems([...existing, item])
  return item
}

function updateItem(id, data) {
  if (data.id && data.id !== id) {
    const err = new Error('Item ID cannot be changed')
    err.statusCode = 400
    throw err
  }

  const errors = validate(data)
  if (errors) {
    const err = new Error('Validation failed')
    err.statusCode = 400
    err.fields = errors
    throw err
  }

  const existing = readItems()
  checkServerRef(data, existing)
  const idx = existing.findIndex(i => i.id === id)
  if (idx === -1) {
    const err = new Error('Item not found')
    err.statusCode = 404
    throw err
  }

  const item = buildItem(data, id)
  const updated = [...existing]
  updated[idx] = item
  writeItems(updated)
  return item
}

function deleteItem(id) {
  const existing = readItems()
  const idx = existing.findIndex(i => i.id === id)
  if (idx === -1) {
    const err = new Error('Item not found')
    err.statusCode = 404
    throw err
  }
  writeItems(existing.filter(i => i.id !== id))
}

module.exports = { addItem, updateItem, deleteItem, generateId, slugify, validate }
