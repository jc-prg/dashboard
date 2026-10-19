'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

let dir, settings

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-'))
  process.env.SETTINGS_FILE = path.join(dir, 'settings.json')
  jest.isolateModules(() => { settings = require('../settings') })
})

afterEach(() => {
  delete process.env.SETTINGS_FILE
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('settings', () => {
  it('returns defaults when the file is missing or invalid', () => {
    expect(settings.readSettings()).toEqual({ iconMode: false })
    fs.writeFileSync(process.env.SETTINGS_FILE, 'not json')
    expect(settings.readSettings()).toEqual({ iconMode: false })
  })

  it('persists updates', () => {
    expect(settings.updateSettings({ iconMode: true })).toEqual({ iconMode: true })
    expect(JSON.parse(fs.readFileSync(process.env.SETTINGS_FILE, 'utf8'))).toEqual({ iconMode: true })
    expect(settings.readSettings()).toEqual({ iconMode: true })
  })

  it('ignores invalid stored values', () => {
    fs.writeFileSync(process.env.SETTINGS_FILE, JSON.stringify({ iconMode: 'yes', other: 1 }))
    expect(settings.readSettings()).toEqual({ iconMode: false })
  })

  it('rejects unknown keys and invalid values without writing', () => {
    expect(() => settings.updateSettings({ iconMode: 'yes' })).toThrow('Validation failed')
    expect(() => settings.updateSettings({ evil: true })).toThrow('Validation failed')
    expect(() => settings.updateSettings(null)).toThrow('Expected a JSON object')
    expect(fs.existsSync(process.env.SETTINGS_FILE)).toBe(false)
  })
})
