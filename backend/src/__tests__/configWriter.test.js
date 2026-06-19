'use strict'

jest.mock('fs')
const fs = require('fs')
const yaml = require('js-yaml')

const { addItem, updateItem, deleteItem, generateId, slugify, validate } = require('../configWriter')

const SECRETS_PREFIX = '/app/config/secrets/'

function setItems(items) {
  fs.readFileSync.mockReturnValue(yaml.dump({ items }))
}

function getWrittenItems() {
  const calls = fs.writeFileSync.mock.calls
  if (!calls.length) return null
  return yaml.load(calls[calls.length - 1][1]).items
}

beforeEach(() => {
  jest.clearAllMocks()
  setItems([])
})

// ─── slugify ──────────────────────────────────────────────────────────────────

describe('slugify', () => {
  it('lowercases and trims', () => {
    expect(slugify('  Hello World  ')).toBe('hello-world')
  })

  it('replaces special chars with hyphens', () => {
    expect(slugify('Foo & Bar!')).toBe('foo-bar')
  })

  it('strips leading/trailing hyphens', () => {
    expect(slugify('--foo--')).toBe('foo')
  })

  it('collapses multiple separators', () => {
    expect(slugify('a   b')).toBe('a-b')
  })
})

// ─── generateId ───────────────────────────────────────────────────────────────

describe('generateId', () => {
  it('returns slugified name when id is free', () => {
    expect(generateId('My App', [])).toBe('my-app')
  })

  it('appends -2 when base id is taken', () => {
    expect(generateId('My App', ['my-app'])).toBe('my-app-2')
  })

  it('increments suffix until free', () => {
    expect(generateId('My App', ['my-app', 'my-app-2', 'my-app-3'])).toBe('my-app-4')
  })
})

// ─── validate ─────────────────────────────────────────────────────────────────

describe('validate', () => {
  const validBase = { name: 'App', url: 'http://app' }

  it('returns null for valid basic item', () => {
    expect(validate(validBase)).toBeNull()
  })

  it('requires name', () => {
    expect(validate({ url: 'http://app' })).toHaveProperty('name')
  })

  it('rejects whitespace-only name', () => {
    expect(validate({ name: '   ', url: 'http://app' })).toHaveProperty('name')
  })

  it('requires url for non-ssh-server items', () => {
    expect(validate({ name: 'App' })).toHaveProperty('url')
  })

  it('does not require url for ssh-server items', () => {
    const data = {
      name: 'Server',
      management: { type: 'ssh-server', host: 'h', user: 'u', ssh_key: `${SECRETS_PREFIX}key` },
    }
    expect(validate(data)).toBeNull()
  })

  it('rejects invalid category', () => {
    expect(validate({ ...validBase, category: 'invalid' })).toHaveProperty('category')
  })

  it('accepts valid categories', () => {
    for (const cat of ['project', 'server', 'tool']) {
      expect(validate({ ...validBase, category: cat })).toBeNull()
    }
  })

  it('rejects id with invalid characters', () => {
    expect(validate({ ...validBase, id: 'My App!' })).toHaveProperty('id')
  })

  it('accepts valid id', () => {
    expect(validate({ ...validBase, id: 'my-app-2' })).toBeNull()
  })

  it('rejects unknown management type', () => {
    const errors = validate({ ...validBase, management: { type: 'ftp' } })
    expect(errors['management.type']).toBeDefined()
  })

  it('requires server_id for ssh-compose', () => {
    const errors = validate({ ...validBase, management: { type: 'ssh-compose', compose_dir: '/app' } })
    expect(errors['management.server_id']).toBeDefined()
  })

  it('requires compose_dir for ssh-compose', () => {
    const errors = validate({ ...validBase, management: { type: 'ssh-compose', server_id: 'srv' } })
    expect(errors['management.compose_dir']).toBeDefined()
  })

  it('requires host/user/ssh_key for ssh-server', () => {
    const errors = validate({ name: 'Server', management: { type: 'ssh-server' } })
    expect(errors['management.host']).toBeDefined()
    expect(errors['management.user']).toBeDefined()
    expect(errors['management.ssh_key']).toBeDefined()
  })

  it('requires ssh_key to start with secrets prefix', () => {
    const errors = validate({ name: 'Server', management: { type: 'ssh-server', host: 'h', user: 'u', ssh_key: 'badpath' } })
    expect(errors['management.ssh_key']).toBeDefined()
  })

  it('accepts ssh_key with correct prefix', () => {
    const errors = validate({ name: 'Server', management: { type: 'ssh-server', host: 'h', user: 'u', ssh_key: `${SECRETS_PREFIX}mykey` } })
    expect(errors).toBeNull()
  })
})

// ─── addItem ──────────────────────────────────────────────────────────────────

describe('addItem', () => {
  it('adds a basic item and returns it', () => {
    const item = addItem({ name: 'App', url: 'http://app' })
    expect(item).toMatchObject({ id: 'app', name: 'App', url: 'http://app', category: 'project' })
    expect(getWrittenItems()).toHaveLength(1)
  })

  it('generates id from name when not provided', () => {
    const item = addItem({ name: 'My Service', url: 'http://svc' })
    expect(item.id).toBe('my-service')
  })

  it('uses provided id when given', () => {
    const item = addItem({ id: 'custom-id', name: 'App', url: 'http://app' })
    expect(item.id).toBe('custom-id')
  })

  it('throws 409 when id already exists', () => {
    setItems([{ id: 'app', name: 'Existing', url: 'http://app' }])
    const err = (() => { try { addItem({ id: 'app', name: 'New', url: 'http://new' }) } catch (e) { return e } })()
    expect(err.statusCode).toBe(409)
  })

  it('throws 400 with fields on validation failure', () => {
    const err = (() => { try { addItem({}) } catch (e) { return e } })()
    expect(err.statusCode).toBe(400)
    expect(err.fields).toHaveProperty('name')
  })

  it('appends to existing items', () => {
    setItems([{ id: 'existing', name: 'Existing', url: 'http://e' }])
    addItem({ name: 'New', url: 'http://new' })
    expect(getWrittenItems()).toHaveLength(2)
  })

  it('strips optional empty fields', () => {
    const item = addItem({ name: 'App', url: 'http://app', description: '', health_check: '' })
    expect(item).not.toHaveProperty('description')
    expect(item).not.toHaveProperty('health_check')
  })

  it('throws 400 when ssh-compose server_id not found', () => {
    const err = (() => {
      try {
        addItem({ name: 'App', url: 'http://app', management: { type: 'ssh-compose', server_id: 'ghost', compose_dir: '/app' } })
      } catch (e) { return e }
    })()
    expect(err.statusCode).toBe(400)
    expect(err.fields['management.server_id']).toBeDefined()
  })
})

// ─── updateItem ───────────────────────────────────────────────────────────────

describe('updateItem', () => {
  beforeEach(() => {
    setItems([{ id: 'app', name: 'App', url: 'http://app', category: 'project' }])
  })

  it('updates an existing item', () => {
    const item = updateItem('app', { name: 'Updated App', url: 'http://updated' })
    expect(item).toMatchObject({ id: 'app', name: 'Updated App', url: 'http://updated' })
  })

  it('overwrites the item in the yaml', () => {
    updateItem('app', { name: 'Updated', url: 'http://updated' })
    const written = getWrittenItems()
    expect(written).toHaveLength(1)
    expect(written[0].name).toBe('Updated')
  })

  it('throws 404 when item not found', () => {
    const err = (() => { try { updateItem('ghost', { name: 'X', url: 'http://x' }) } catch (e) { return e } })()
    expect(err.statusCode).toBe(404)
  })

  it('throws 400 when attempting to change id', () => {
    const err = (() => { try { updateItem('app', { id: 'new-id', name: 'App', url: 'http://app' }) } catch (e) { return e } })()
    expect(err.statusCode).toBe(400)
    expect(err.message).toMatch(/cannot be changed/i)
  })

  it('throws 400 on validation failure', () => {
    const err = (() => { try { updateItem('app', { name: '' }) } catch (e) { return e } })()
    expect(err.statusCode).toBe(400)
  })
})

// ─── deleteItem ───────────────────────────────────────────────────────────────

describe('deleteItem', () => {
  beforeEach(() => {
    setItems([
      { id: 'app', name: 'App', url: 'http://app' },
      { id: 'other', name: 'Other', url: 'http://other' },
    ])
  })

  it('removes the item from the yaml', () => {
    deleteItem('app')
    const written = getWrittenItems()
    expect(written).toHaveLength(1)
    expect(written[0].id).toBe('other')
  })

  it('throws 404 when item not found', () => {
    const err = (() => { try { deleteItem('ghost') } catch (e) { return e } })()
    expect(err.statusCode).toBe(404)
  })
})
