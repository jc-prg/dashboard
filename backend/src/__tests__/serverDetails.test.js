'use strict'

jest.mock('../ssh')
jest.mock('../config')
jest.mock('../healthcheck')

const { computeWarnings, getWarnings, fetchServerDetails, isDue } = require('../serverDetails')
const { runSshCommand } = require('../ssh')

const details = {
  storageList: [
    { mount: '/', value: '92%|40G' },
    { mount: '/data', value: '50%|1.2T' },
    { mount: '/boot', value: '99%|200M' },
  ],
}

function server(storage_warnings) {
  return { id: 'srv', management: { type: 'ssh-server', host: 'h', user: 'u', ssh_key: 'k', storage_warnings } }
}

describe('computeWarnings', () => {
  it('warns when usage reaches the threshold', () => {
    const warnings = computeWarnings(server([{ mount: '/', percent: 92 }]), details)
    expect(warnings).toEqual([
      expect.objectContaining({ type: 'storage', mount: '/', usedPercent: 92, threshold: 92 }),
    ])
  })

  it('does not warn below the threshold', () => {
    expect(computeWarnings(server([{ mount: '/data', percent: 80 }]), details)).toEqual([])
  })

  it('ignores mounts without a threshold', () => {
    // /boot is at 99% but has no definition
    expect(computeWarnings(server([{ mount: '/', percent: 95 }]), details)).toEqual([])
  })

  it('ignores thresholds for mounts the server does not report', () => {
    expect(computeWarnings(server([{ mount: '/missing', percent: 1 }]), details)).toEqual([])
  })

  it('returns nothing without details or thresholds', () => {
    expect(computeWarnings(server([{ mount: '/', percent: 50 }]), undefined)).toEqual([])
    expect(computeWarnings(server(undefined), details)).toEqual([])
  })
})

describe('getWarnings', () => {
  it('uses cached details and current thresholds', async () => {
    runSshCommand.mockResolvedValue({ stdout: 'STORAGE:/=91%|10G\n' })
    await fetchServerDetails(server([]))
    expect(getWarnings(server([{ mount: '/', percent: 90 }]))).toHaveLength(1)
    expect(getWarnings(server([{ mount: '/', percent: 95 }]))).toHaveLength(0)
  })

  it('returns nothing for non-server items', () => {
    expect(getWarnings({ id: 'x', management: { type: 'ssh-compose' } })).toEqual([])
  })
})

describe('cpu and memory warnings', () => {
  const usage = { cpuUsage: '85.4%', memUsed: '7000MB', memTotal: '8000MB', storageList: [] }
  const withMgmt = (extra) => ({ id: 'srv', management: { type: 'ssh-server', ...extra } })

  it('warns on high CPU usage', () => {
    expect(computeWarnings(withMgmt({ cpu_warning: 80 }), usage)).toEqual([
      expect.objectContaining({ type: 'cpu', usedPercent: 85, threshold: 80 }),
    ])
  })

  it('warns on high memory usage', () => {
    // 7000 / 8000 = 88%
    expect(computeWarnings(withMgmt({ memory_warning: 88 }), usage)).toEqual([
      expect.objectContaining({ type: 'memory', usedPercent: 88, threshold: 88 }),
    ])
  })

  it('does not warn below thresholds or without thresholds', () => {
    expect(computeWarnings(withMgmt({ cpu_warning: 90, memory_warning: 95 }), usage)).toEqual([])
    expect(computeWarnings(withMgmt({}), usage)).toEqual([])
  })

  it('ignores missing values', () => {
    expect(computeWarnings(withMgmt({ cpu_warning: 1, memory_warning: 1 }), { storageList: [] })).toEqual([])
  })
})

describe('isDue', () => {
  it('uses check_interval, defaulting to 60s', async () => {
    runSshCommand.mockResolvedValue({ stdout: '' })
    const item = { id: 'due', management: { type: 'ssh-server' } }
    expect(isDue(item)).toBe(true)
    await fetchServerDetails(item)
    const now = Date.now()
    expect(isDue(item, now + 30_000)).toBe(false)
    expect(isDue(item, now + 61_000)).toBe(true)
    const slow = { id: 'due', management: { type: 'ssh-server', check_interval: 300 } }
    expect(isDue(slow, now + 61_000)).toBe(false)
  })
})
