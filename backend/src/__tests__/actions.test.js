'use strict'

jest.mock('../ssh')
const { runSshCommand } = require('../ssh')
const { buildCommand, validateAction, executeAction } = require('../actions')

const sshServerItem = {
  id: 'srv',
  name: 'Server',
  management: { type: 'ssh-server', host: '10.0.0.1', port: 22, user: 'admin', ssh_key: '/app/config/secrets/key' },
  actions: ['reboot'],
}

const sshComposeItem = {
  id: 'app',
  name: 'App',
  url: 'http://app',
  management: { type: 'ssh-compose', server_id: 'srv', compose_dir: '/opt/app' },
  actions: ['restart'],
}

const sshComposeWithService = {
  ...sshComposeItem,
  id: 'web',
  management: { ...sshComposeItem.management, compose_service: 'web' },
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── buildCommand ─────────────────────────────────────────────────────────────

describe('buildCommand', () => {
  it('returns sudo reboot for ssh-server reboot', () => {
    expect(buildCommand(sshServerItem.management, 'reboot')).toBe('sudo reboot')
  })

  it('returns docker compose restart for ssh-compose restart without service', () => {
    const cmd = buildCommand(sshComposeItem.management, 'restart')
    expect(cmd).toBe('cd /opt/app && docker compose restart')
  })

  it('appends service name for ssh-compose with compose_service', () => {
    const cmd = buildCommand(sshComposeWithService.management, 'restart')
    expect(cmd).toBe('cd /opt/app && docker compose restart web')
  })

  it('throws for unknown type/action combo', () => {
    expect(() => buildCommand({ type: 'ssh-server' }, 'restart')).toThrow()
  })
})

// ─── validateAction ───────────────────────────────────────────────────────────

describe('validateAction', () => {
  it('does not throw for valid ssh-server reboot', () => {
    expect(() => validateAction(sshServerItem, 'reboot')).not.toThrow()
  })

  it('does not throw for valid ssh-compose restart', () => {
    expect(() => validateAction(sshComposeItem, 'restart')).not.toThrow()
  })

  it('throws 400 when item has no management', () => {
    const item = { id: 'plain', name: 'Plain', management: null }
    const err = (() => { try { validateAction(item, 'reboot') } catch (e) { return e } })()
    expect(err.statusCode).toBe(400)
    expect(err.message).toMatch(/no management/i)
  })

  it('throws 400 when action is not allowed for type', () => {
    const err = (() => { try { validateAction(sshComposeItem, 'reboot') } catch (e) { return e } })()
    expect(err.statusCode).toBe(400)
    expect(err.message).toMatch(/not available/i)
  })
})

// ─── executeAction ────────────────────────────────────────────────────────────

describe('executeAction', () => {
  it('executes reboot on ssh-server and returns success', async () => {
    runSshCommand.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    const result = await executeAction(sshServerItem, 'reboot', [sshServerItem])
    expect(result).toEqual({ success: true, output: '' })
    expect(runSshCommand).toHaveBeenCalledWith(expect.objectContaining({
      host: '10.0.0.1',
      user: 'admin',
      command: 'sudo reboot',
    }))
  })

  it('executes restart on ssh-compose using server credentials', async () => {
    runSshCommand.mockResolvedValue({ code: 0, stdout: 'done', stderr: '' })
    const result = await executeAction(sshComposeItem, 'restart', [sshServerItem, sshComposeItem])
    expect(result).toEqual({ success: true, output: 'done' })
    expect(runSshCommand).toHaveBeenCalledWith(expect.objectContaining({
      host: '10.0.0.1',
      command: 'cd /opt/app && docker compose restart',
    }))
  })

  it('returns success: false when command exits with non-zero code', async () => {
    runSshCommand.mockResolvedValue({ code: 1, stdout: '', stderr: 'Permission denied' })
    const result = await executeAction(sshServerItem, 'reboot', [sshServerItem])
    expect(result.success).toBe(false)
    expect(result.output).toBe('Permission denied')
  })

  it('prefers stdout over stderr for output', async () => {
    runSshCommand.mockResolvedValue({ code: 0, stdout: 'ok', stderr: 'warn' })
    const result = await executeAction(sshServerItem, 'reboot', [sshServerItem])
    expect(result.output).toBe('ok')
  })

  it('throws 400 when ssh-compose referenced server not found', async () => {
    const err = await executeAction(sshComposeItem, 'restart', [sshComposeItem]).catch(e => e)
    expect(err.statusCode).toBe(400)
    expect(err.message).toMatch(/not found/i)
  })
})
