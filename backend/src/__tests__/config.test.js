'use strict'

jest.mock('fs')
const fs = require('fs')
const yaml = require('js-yaml')

function setItems(items) {
  fs.readFileSync.mockReturnValue(yaml.dump({ items }))
}

// Re-require after mocking so the module picks up the mocked fs
const { loadConfig } = require('../config')

beforeEach(() => {
  jest.clearAllMocks()
})

describe('loadConfig', () => {
  it('returns empty array when items list is empty', () => {
    setItems([])
    expect(loadConfig()).toEqual([])
  })

  it('returns empty array when yaml has no items key', () => {
    fs.readFileSync.mockReturnValue(yaml.dump({}))
    expect(loadConfig()).toEqual([])
  })

  it('parses a minimal item with defaults', () => {
    setItems([{ id: 'foo', name: 'Foo', url: 'http://foo.com' }])
    const [item] = loadConfig()
    expect(item).toMatchObject({
      id: 'foo',
      name: 'Foo',
      url: 'http://foo.com',
      category: 'project',
      description: '',
      tags: [],
      actions: [],
      management: null,
    })
  })

  it('preserves category, description, tags', () => {
    setItems([{ id: 'foo', name: 'Foo', url: 'http://foo', category: 'tool', description: 'desc', tags: ['a', 'b'] }])
    const [item] = loadConfig()
    expect(item.category).toBe('tool')
    expect(item.description).toBe('desc')
    expect(item.tags).toEqual(['a', 'b'])
  })

  it('throws when item is missing id', () => {
    setItems([{ name: 'Foo', url: 'http://foo' }])
    expect(() => loadConfig()).toThrow('missing required field: id')
  })

  it('throws when item is missing name', () => {
    setItems([{ id: 'foo', url: 'http://foo' }])
    expect(() => loadConfig()).toThrow('missing required field: name')
  })

  it('throws when non-ssh-server item is missing url', () => {
    setItems([{ id: 'foo', name: 'Foo' }])
    expect(() => loadConfig()).toThrow('missing required field: url')
  })

  it('allows ssh-server item without url', () => {
    setItems([{ id: 'srv', name: 'Server', management: { type: 'ssh-server', host: 'h', user: 'u', ssh_key: 'k' } }])
    expect(() => loadConfig()).not.toThrow()
  })

  it('throws for unknown management type', () => {
    setItems([{ id: 'foo', name: 'Foo', url: 'http://foo', management: { type: 'ftp' } }])
    expect(() => loadConfig()).toThrow('unknown management.type')
  })

  it('throws when ssh-server management is missing host', () => {
    setItems([{ id: 'srv', name: 'Server', management: { type: 'ssh-server', user: 'u', ssh_key: 'k' } }])
    expect(() => loadConfig()).toThrow('missing required field: host')
  })

  it('throws when ssh-server management is missing user', () => {
    setItems([{ id: 'srv', name: 'Server', management: { type: 'ssh-server', host: 'h', ssh_key: 'k' } }])
    expect(() => loadConfig()).toThrow('missing required field: user')
  })

  it('throws when ssh-server management is missing ssh_key', () => {
    setItems([{ id: 'srv', name: 'Server', management: { type: 'ssh-server', host: 'h', user: 'u' } }])
    expect(() => loadConfig()).toThrow('missing required field: ssh_key')
  })

  it('throws when ssh-compose management is missing server_id', () => {
    setItems([{ id: 'app', name: 'App', url: 'http://app', management: { type: 'ssh-compose', compose_dir: '/app' } }])
    expect(() => loadConfig()).toThrow('missing required field: server_id')
  })

  it('throws when ssh-compose management is missing compose_dir', () => {
    setItems([{ id: 'app', name: 'App', url: 'http://app', management: { type: 'ssh-compose', server_id: 'srv' } }])
    expect(() => loadConfig()).toThrow('missing required field: compose_dir')
  })

  it('throws when ssh-compose references an unknown server_id', () => {
    setItems([
      { id: 'app', name: 'App', url: 'http://app', management: { type: 'ssh-compose', server_id: 'ghost', compose_dir: '/app' } },
    ])
    expect(() => loadConfig()).toThrow('unknown server_id')
  })

  it('throws when ssh-compose references an item that is not ssh-server', () => {
    setItems([
      { id: 'other', name: 'Other', url: 'http://other' },
      { id: 'app', name: 'App', url: 'http://app', management: { type: 'ssh-compose', server_id: 'other', compose_dir: '/app' } },
    ])
    expect(() => loadConfig()).toThrow('does not have ssh-server management')
  })

  it('assigns reboot action to ssh-server items', () => {
    setItems([{ id: 'srv', name: 'Server', management: { type: 'ssh-server', host: 'h', user: 'u', ssh_key: 'k' } }])
    expect(loadConfig()[0].actions).toEqual(['reboot'])
  })

  it('assigns restart action to ssh-compose items', () => {
    setItems([
      { id: 'srv', name: 'Server', management: { type: 'ssh-server', host: 'h', user: 'u', ssh_key: 'k' } },
      { id: 'app', name: 'App', url: 'http://app', management: { type: 'ssh-compose', server_id: 'srv', compose_dir: '/app' } },
    ])
    expect(loadConfig()[1].actions).toEqual(['restart'])
  })
})
