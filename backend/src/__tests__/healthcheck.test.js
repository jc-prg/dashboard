'use strict'

// We test the exported checkItem and getStatus functions.
// runAllChecks/startHealthCheckScheduler involve config I/O and timers, so we skip those.

const { checkItem, getStatus } = require('../healthcheck')

global.fetch = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

// ─── getStatus ────────────────────────────────────────────────────────────────

describe('getStatus', () => {
  it('returns unknown status for an uncached item', () => {
    expect(getStatus('never-checked')).toEqual({
      status: 'unknown',
      statusCode: null,
      latencyMs: null,
      checkedAt: null,
    })
  })
})

// ─── checkItem (URL-based) ────────────────────────────────────────────────────

describe('checkItem — URL checks', () => {
  const item = { id: 'svc', url: 'http://svc.local', health_check: null }

  it('returns online for a 2xx response', async () => {
    global.fetch.mockResolvedValue({ status: 200 })
    const result = await checkItem(item, 3000)
    expect(result.status).toBe('online')
    expect(result.statusCode).toBe(200)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('returns offline for a 4xx response', async () => {
    global.fetch.mockResolvedValue({ status: 404 })
    const result = await checkItem(item, 3000)
    expect(result.status).toBe('offline')
    expect(result.statusCode).toBe(404)
  })

  it('returns offline for a 5xx response', async () => {
    global.fetch.mockResolvedValue({ status: 503 })
    const result = await checkItem(item, 3000)
    expect(result.status).toBe('offline')
  })

  it('returns offline when fetch throws (network error)', async () => {
    global.fetch.mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await checkItem(item, 3000)
    expect(result.status).toBe('offline')
    expect(result.statusCode).toBeNull()
  })

  it('prefers health_check url over item url', async () => {
    global.fetch.mockResolvedValue({ status: 200 })
    await checkItem({ ...item, health_check: 'http://health.local/ping' }, 3000)
    expect(global.fetch).toHaveBeenCalledWith('http://health.local/ping', expect.any(Object))
  })
})

// ─── checkItem (no URL) ───────────────────────────────────────────────────────

describe('checkItem — no URL', () => {
  it('returns unknown when item has no url and no management', async () => {
    const result = await checkItem({ id: 'plain', url: null, health_check: null, management: null }, 3000)
    expect(result.status).toBe('unknown')
    expect(result.statusCode).toBeNull()
    expect(result.latencyMs).toBeNull()
  })
})
