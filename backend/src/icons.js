'use strict'

const fs = require('fs')
const { isSafeUrl } = require('./healthcheck')

const ICON_CACHE_FILE = process.env.ICON_CACHE_FILE || '/app/config/state/icon-cache.json'

const MAX_HTML_BYTES = 1024 * 1024
const MAX_ICON_BYTES = 1024 * 1024  // PWA app icons (512×512 PNG) are often several hundred KB
const MAX_REDIRECTS = 3
const CACHE_TTL_MS = 6 * 60 * 60 * 1000     // found icons: 6h
const MISS_TTL_MS = 30 * 60 * 1000          // no icon / error: retry after 30min

// In-memory icon cache: { [itemId]: { url, dataUri, expiresAt } }
const iconCache = {}
const inflight = {}

// Last successfully loaded icon per item, persisted so it survives restarts and
// stays available while the app is offline: { [itemId]: { url, dataUri, fetchedAt } }
let lastKnown = loadLastKnown()

function loadLastKnown() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ICON_CACHE_FILE, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function saveLastKnown() {
  try {
    fs.writeFileSync(ICON_CACHE_FILE, JSON.stringify(lastKnown), 'utf8')
  } catch (err) {
    console.error('[icons] Failed to write icon cache:', err.message)
  }
}

function sameOrigin(a, b) {
  try { return new URL(a).origin === new URL(b).origin } catch { return false }
}

// Stored icon for the item, if it was loaded from the same site
function storedIcon(item) {
  const entry = lastKnown[item.id]
  return entry && sameOrigin(entry.url, item.url) ? entry.dataUri : null
}

// Fetch with manual redirect handling so every hop is checked against SSRF rules
async function safeFetch(url, timeoutMs) {
  let current = url
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!isSafeUrl(current)) throw new Error('Blocked URL')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(current, { signal: controller.signal, redirect: 'manual' })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location'), current).href
        continue
      }
      const body = await readLimited(res, MAX_HTML_BYTES)
      return { res, body, finalUrl: current }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error('Too many redirects')
}

async function readLimited(res, maxBytes) {
  if (!res.body) return Buffer.alloc(0)
  const chunks = []
  let total = 0
  for await (const chunk of res.body) {
    total += chunk.length
    if (total > maxBytes) throw new Error('Response too large')
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function parseAttrs(tag) {
  const attrs = {}
  const re = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  let m
  while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4]
  return attrs
}

const ICON_RELS = ['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed']
const MAX_CANDIDATES = 8

// Return candidate icon URLs from the page's <link rel="icon"> / <link rel="apple-touch-icon"> tags.
// Ordered by declared size as a hint; the final choice is made on the real image dimensions.
function findIconLinks(html, baseUrl) {
  const candidates = []
  // Quoted attribute values may contain ">" (e.g. inline data:image/svg+xml icons)
  const tags = html.match(/<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) || []
  for (const tag of tags) {
    const { rel, href, sizes } = parseAttrs(tag)
    if (!rel || !href) continue
    if (!rel.toLowerCase().split(/\s+/).some(r => ICON_RELS.includes(r))) continue
    const declared = /\bany\b/i.test(sizes || '') || /\.svg(\?|$)/i.test(href) || /^data:image\/svg/i.test(href)
      ? Infinity
      : Math.max(0, ...(sizes || '').split(/\s+/).map(s => parseInt(s, 10) || 0))
    try {
      const url = /^data:/i.test(href.trim()) ? href.trim() : new URL(href.trim(), baseUrl).href
      candidates.push({ url, declared })
    } catch { /* invalid href */ }
  }
  candidates.sort((a, b) => b.declared - a.declared)
  return [...new Set(candidates.map(c => c.url))]
}

// Detect image type from magic bytes (favicon.ico is often served with a generic content-type)
function sniffImageType(buf, headerType) {
  if (buf.length >= 4 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return 'image/x-icon'
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 6 && buf.slice(0, 3).toString() === 'GIF') return 'image/gif'
  if (buf.length >= 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp'
  const head = buf.slice(0, 512).toString('utf8').trimStart()
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg\b/i.test(head) || (headerType === 'image/svg+xml' && /<svg\b/i.test(head))) return 'image/svg+xml'
  return null
}

// Quality of an image = its smaller pixel dimension (SVG scales without loss → Infinity, unknown → 0)
function imageQuality(buf, type) {
  try {
    switch (type) {
      case 'image/svg+xml': return Infinity
      case 'image/png': return Math.min(buf.readUInt32BE(16), buf.readUInt32BE(20))
      case 'image/gif': return Math.min(buf.readUInt16LE(6), buf.readUInt16LE(8))
      case 'image/x-icon': {
        // ICO directory: one 16-byte entry per contained image, width/height 0 means 256
        let best = 0
        for (let i = 0; i < buf.readUInt16LE(4); i++) {
          const o = 6 + i * 16
          best = Math.max(best, Math.min(buf[o] || 256, buf[o + 1] || 256))
        }
        return best
      }
      case 'image/jpeg': {
        let i = 2
        while (i + 9 < buf.length && buf[i] === 0xff) {
          const marker = buf[i + 1]
          if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            return Math.min(buf.readUInt16BE(i + 5), buf.readUInt16BE(i + 7))
          }
          i += 2 + buf.readUInt16BE(i + 2)
        }
        return 0
      }
      case 'image/webp': {
        const chunk = buf.slice(12, 16).toString()
        if (chunk === 'VP8 ') return Math.min(buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff)
        if (chunk === 'VP8L') {
          const b = buf.readUInt32LE(21)
          return Math.min((b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1)
        }
        if (chunk === 'VP8X') return Math.min(1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3))
        return 0
      }
      default: return 0
    }
  } catch {
    return 0
  }
}

function decodeDataUri(uri) {
  const m = /^data:([^,]*?)(;base64)?,(.*)$/is.exec(uri)
  if (!m) return null
  if (m[2]) return { type: m[1].toLowerCase(), body: Buffer.from(m[3], 'base64') }
  let text = m[3]
  try { text = decodeURIComponent(text) } catch { /* keep raw */ }
  return { type: m[1].toLowerCase(), body: Buffer.from(text, 'utf8') }
}

// Load one icon candidate → { dataUri, quality, bytes } or null
async function loadIcon(iconUrl, timeoutMs) {
  let body, headerType
  if (iconUrl.startsWith('data:')) {
    const decoded = decodeDataUri(iconUrl)
    if (!decoded) return null
    body = decoded.body
    headerType = decoded.type.split(';')[0].trim()
  } else {
    const fetched = await safeFetch(iconUrl, timeoutMs)
    if (!fetched.res.ok) return null
    body = fetched.body
    headerType = (fetched.res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  }
  if (body.length === 0 || body.length > MAX_ICON_BYTES) return null
  const type = sniffImageType(body, headerType)
  if (!type) return null
  return { dataUri: `data:${type};base64,${body.toString('base64')}`, quality: imageQuality(body, type), bytes: body.length }
}

// Load all candidates and pick the highest-resolution one (smaller file wins a tie)
async function discoverIcon(pageUrl, timeoutMs) {
  const candidates = []
  try {
    const { res, body, finalUrl } = await safeFetch(pageUrl, timeoutMs)
    const type = res.headers.get('content-type') || ''
    if (type.includes('html')) candidates.push(...findIconLinks(body.toString('utf8'), finalUrl))
    candidates.push(new URL('/favicon.ico', finalUrl).href)
  } catch (err) {
    // Host unreachable → /favicon.ico would only time out again
    if (err.name === 'AbortError' || err.cause?.code) return null
    candidates.push(new URL('/favicon.ico', pageUrl).href)
  }
  const loaded = await Promise.all(
    [...new Set(candidates)].slice(0, MAX_CANDIDATES).map(url => loadIcon(url, timeoutMs).catch(() => null))
  )
  const best = loaded.filter(Boolean).sort((a, b) => b.quality - a.quality || a.bytes - b.bytes)[0]
  return best ? best.dataUri : null
}

// Pages to search for an icon: the item URL, then the root of the health-check host.
// The health check often uses an address the backend can reach when the public URL is not
// (e.g. url http://localhost:3000/ on a laptop, health_check http://laptop:3000/).
function iconSources(item) {
  const sources = []
  if (item.url && isSafeUrl(item.url)) sources.push(item.url)
  if (item.health_check && isSafeUrl(item.health_check)) {
    try {
      const root = new URL('/', item.health_check).href
      if (!sources.some(s => sameOrigin(s, root))) sources.push(root)
    } catch { /* invalid health_check */ }
  }
  return sources
}

async function discoverItemIcon(item, timeoutMs) {
  for (const source of iconSources(item)) {
    const dataUri = await discoverIcon(source, timeoutMs).catch(() => null)
    if (dataUri) return dataUri
  }
  return null
}

function refreshIcon(item, timeoutMs) {
  if (!inflight[item.id]) {
    inflight[item.id] = discoverItemIcon(item, timeoutMs)
      .catch(() => null)
      .then((dataUri) => {
        iconCache[item.id] = { url: item.url, healthCheck: item.health_check, dataUri, expiresAt: Date.now() + (dataUri ? CACHE_TTL_MS : MISS_TTL_MS) }
        if (dataUri) {
          const prev = lastKnown[item.id]
          if (!prev || prev.dataUri !== dataUri || prev.url !== item.url) {
            lastKnown[item.id] = { url: item.url, dataUri, fetchedAt: new Date().toISOString() }
            saveLastKnown()
          }
          return dataUri
        }
        // App offline or no icon found — fall back to the last one that loaded
        return storedIcon(item)
      })
      .finally(() => { delete inflight[item.id] })
  }
  return inflight[item.id]
}

// Returns a data URI for the item's app icon / favicon, or null.
// A stored icon is returned immediately while a refresh runs in the background.
async function getIcon(item, timeoutMs) {
  if (item.icon_emoji || !item.url || iconSources(item).length === 0) return null
  const cached = iconCache[item.id]
  if (cached && cached.url === item.url && cached.healthCheck === item.health_check && cached.expiresAt > Date.now()) {
    return cached.dataUri || storedIcon(item)
  }
  const refresh = refreshIcon(item, timeoutMs)
  return storedIcon(item) || refresh
}

// Drop stored icons of items that no longer exist
function pruneIcons(itemIds) {
  const keep = new Set(itemIds)
  const stale = Object.keys(lastKnown).filter(id => !keep.has(id))
  if (stale.length === 0) return
  stale.forEach(id => { delete lastKnown[id]; delete iconCache[id] })
  saveLastKnown()
}

module.exports = { getIcon, pruneIcons, findIconLinks, sniffImageType, imageQuality, discoverIcon }
