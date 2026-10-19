'use strict'

const { findIconLinks, sniffImageType, getIcon, imageQuality, discoverIcon } = require('../icons')

describe('findIconLinks', () => {
  it('collects icon and apple-touch-icon links, resolves relative hrefs, skips other rels', () => {
    const html = `
      <link rel="stylesheet" href="/style.css">
      <link rel="mask-icon" href="/mask.svg">
      <link rel="icon" href="/favicon-32.png" sizes="32x32">
      <link href='touch.png' rel='apple-touch-icon' sizes="180x180">
    `
    expect(findIconLinks(html, 'http://app.local/sub/page')).toEqual([
      'http://app.local/sub/touch.png',
      'http://app.local/favicon-32.png',
    ])
  })

  it('handles "shortcut icon" and multiple sizes values, svg first', () => {
    const html = '<link rel="shortcut icon" href="/a.ico" sizes="16x16 48x48"><link rel="icon" href="/b.png" sizes="32x32"><link rel="icon" href="/c.svg">'
    expect(findIconLinks(html, 'http://x/')).toEqual(['http://x/c.svg', 'http://x/a.ico', 'http://x/b.png'])
  })

  it('handles inline data: icons containing ">" inside the quoted href', () => {
    const html = `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><text>🔄</text></svg>" /><link rel="stylesheet" href="/x.css">`
    expect(findIconLinks(html, 'http://x/')).toEqual([
      "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><text>🔄</text></svg>",
    ])
  })

  it('returns empty list when no icon links exist', () => {
    expect(findIconLinks('<html><head></head></html>', 'http://x/')).toEqual([])
  })
})

// Minimal image headers with given dimensions
function png(w, h, pad = 0) {
  const b = Buffer.alloc(33 + pad)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b)
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20)
  return b
}
function ico(...sizes) {
  const b = Buffer.alloc(6 + sizes.length * 16)
  b.writeUInt16LE(1, 2); b.writeUInt16LE(sizes.length, 4)
  sizes.forEach((s, i) => { b[6 + i * 16] = s % 256; b[7 + i * 16] = s % 256 })
  return b
}

describe('imageQuality', () => {
  it('reads real pixel sizes', () => {
    expect(imageQuality(png(180, 180), 'image/png')).toBe(180)
    expect(imageQuality(ico(16, 32, 256), 'image/x-icon')).toBe(256)
    expect(imageQuality(Buffer.from('<svg/>'), 'image/svg+xml')).toBe(Infinity)
    expect(imageQuality(Buffer.alloc(3), 'image/png')).toBe(0)
  })
})

describe('discoverIcon picks the best quality', () => {
  let realFetch
  beforeEach(() => { realFetch = global.fetch })
  afterEach(() => { global.fetch = realFetch })

  function serve(files) {
    global.fetch = jest.fn(async (url) => {
      const f = files[new URL(url).pathname]
      if (!f) return new Response('not found', { status: 404 })
      return new Response(f.body, { status: 200, headers: { 'content-type': f.type } })
    })
  }

  it('prefers the larger image regardless of rel or declared sizes', async () => {
    serve({
      '/': { type: 'text/html', body: '<link rel="apple-touch-icon" href="/touch.png"><link rel="icon" href="/big.png" sizes="16x16">' },
      '/touch.png': { type: 'image/png', body: png(180, 180) },
      '/big.png': { type: 'image/png', body: png(512, 512) },
      '/favicon.ico': { type: 'image/x-icon', body: ico(16, 32) },
    })
    const uri = await discoverIcon('http://app.local/', 1000)
    expect(Buffer.from(uri.split(',')[1], 'base64').readUInt32BE(16)).toBe(512)
  })

  it('prefers svg over raster and supports inline data: icons', async () => {
    serve({
      '/': { type: 'text/html', body: `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>">` },
      '/favicon.ico': { type: 'image/x-icon', body: ico(256) },
    })
    expect(await discoverIcon('http://app.local/', 1000)).toMatch(/^data:image\/svg\+xml;base64,/)
  })

  it('falls back to /favicon.ico and picks the smaller file on equal quality', async () => {
    serve({
      '/': { type: 'text/html', body: '<link rel="icon" href="/a.png">' },
      '/a.png': { type: 'image/png', body: png(32, 32, 500) },
      '/favicon.ico': { type: 'application/octet-stream', body: png(32, 32) },
    })
    const uri = await discoverIcon('http://app.local/', 1000)
    expect(Buffer.from(uri.split(',')[1], 'base64').length).toBe(33)
  })
})

describe('sniffImageType', () => {
  it('detects ico, png and svg', () => {
    expect(sniffImageType(Buffer.from([0, 0, 1, 0, 1, 0]), '')).toBe('image/x-icon')
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), '')).toBe('image/png')
    expect(sniffImageType(Buffer.from('<?xml version="1.0"?><svg xmlns="..."></svg>'), '')).toBe('image/svg+xml')
  })

  it('rejects html served as an icon', () => {
    expect(sniffImageType(Buffer.from('<!doctype html><html>'), 'text/html')).toBeNull()
  })
})

describe('getIcon', () => {
  it('returns null for items without a safe url', async () => {
    expect(await getIcon({ id: 'a', url: null }, 1000)).toBeNull()
    expect(await getIcon({ id: 'b', url: 'http://127.0.0.1/' }, 1000)).toBeNull()
  })
})

describe('persistent icon cache', () => {
  const fs = require('fs')
  const os = require('os')
  const path = require('path')
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
  let dir, realFetch

  function loadIcons() {
    let mod
    jest.isolateModules(() => { mod = require('../icons') })
    return mod
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-'))
    process.env.ICON_CACHE_FILE = path.join(dir, 'icon-cache.json')
    realFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = realFetch
    delete process.env.ICON_CACHE_FILE
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('stores a loaded icon and serves it after restart while the app is offline', async () => {
    global.fetch = jest.fn(async (url) => new Response(url.endsWith('/favicon.ico') ? PNG : '<html></html>', {
      status: 200,
      headers: { 'content-type': url.endsWith('/favicon.ico') ? 'image/png' : 'text/html' },
    }))
    const item = { id: 'app', url: 'http://app.local/' }
    const online = await loadIcons().getIcon(item, 1000)
    expect(online).toMatch(/^data:image\/png;base64,/)
    expect(JSON.parse(fs.readFileSync(process.env.ICON_CACHE_FILE, 'utf8')).app.dataUri).toBe(online)

    // "Restart" with the app offline
    global.fetch = jest.fn(async () => { throw new Error('ECONNREFUSED') })
    expect(await loadIcons().getIcon(item, 1000)).toBe(online)
  })

  it('does not reuse a stored icon when the item points to another site', async () => {
    fs.writeFileSync(process.env.ICON_CACHE_FILE, JSON.stringify({ app: { url: 'http://old.local/', dataUri: 'data:image/png;base64,AA' } }))
    global.fetch = jest.fn(async () => { throw new Error('offline') })
    expect(await loadIcons().getIcon({ id: 'app', url: 'http://new.local/' }, 1000)).toBeNull()
  })

  it('prunes icons of deleted items', () => {
    fs.writeFileSync(process.env.ICON_CACHE_FILE, JSON.stringify({ a: { url: 'http://a/', dataUri: 'x' }, b: { url: 'http://b/', dataUri: 'y' } }))
    loadIcons().pruneIcons(['a'])
    expect(Object.keys(JSON.parse(fs.readFileSync(process.env.ICON_CACHE_FILE, 'utf8')))).toEqual(['a'])
  })
})

describe('health_check fallback', () => {
  let realFetch
  beforeEach(() => { realFetch = global.fetch })
  afterEach(() => { global.fetch = realFetch })

  it('uses the health-check host when the item url is blocked or unreachable', async () => {
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 0, 0, 0, 64])
    global.fetch = jest.fn(async (url) => {
      const u = new URL(url)
      if (u.host !== 'laptop:3000') throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
      if (u.pathname === '/') return new Response('<link rel="icon" href="/i.png">', { headers: { 'content-type': 'text/html' } })
      if (u.pathname === '/i.png') return new Response(PNG, { headers: { 'content-type': 'image/png' } })
      return new Response('', { status: 404 })
    })
    const { getIcon: get } = (() => { let m; jest.isolateModules(() => { m = require('../icons') }); return m })()
    const item = { id: 'kanban-dev', url: 'http://localhost:3000/', health_check: 'http://laptop:3000/api/health' }
    expect(await get(item, 1000)).toMatch(/^data:image\/png;base64,/)
    expect(global.fetch.mock.calls.map(c => c[0])).not.toContain('http://localhost:3000/')
  })
})
