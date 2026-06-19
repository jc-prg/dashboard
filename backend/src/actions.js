'use strict'

const path = require('path')
const { runSshCommand } = require('./ssh')
const { isLocalHost, runLocalCommand } = require('./localExec')

const SSH_CONNECT_TIMEOUT_MS = parseInt(process.env.SSH_CONNECT_TIMEOUT_MS || '8000', 10)

const ALLOWED_ACTIONS = {
  'ssh-server': ['reboot'],
  'ssh-compose': ['restart'],
}

function buildCommand(mgmt, action) {
  if (mgmt.type === 'ssh-server' && action === 'reboot') {
    return 'sudo reboot'
  }
  if (mgmt.type === 'ssh-compose' && action === 'restart') {
    const base = `cd ${mgmt.compose_dir} && docker compose restart`
    return mgmt.compose_service ? `${base} ${mgmt.compose_service}` : base
  }
  throw new Error(`No command mapping for type="${mgmt.type}" action="${action}"`)
}

/**
 * Build a command that can run locally (without SSH).
 * For ssh-compose: uses `docker compose -p <project>` so no compose file path is needed.
 */
function buildLocalCommand(mgmt, action) {
  if (mgmt.type === 'ssh-server' && action === 'reboot') {
    return 'sudo reboot'
  }
  if (mgmt.type === 'ssh-compose' && action === 'restart') {
    const project = path.basename(mgmt.compose_dir)
    const base = `docker compose -p ${project} restart`
    return mgmt.compose_service ? `${base} ${mgmt.compose_service}` : base
  }
  throw new Error(`No command mapping for type="${mgmt.type}" action="${action}"`)
}

function validateAction(item, action) {
  if (!item.management) {
    const err = new Error('No management configured for this item')
    err.statusCode = 400
    throw err
  }
  const allowed = ALLOWED_ACTIONS[item.management.type] || []
  if (!allowed.includes(action)) {
    const err = new Error(`Action "${action}" is not available for management type "${item.management.type}"`)
    err.statusCode = 400
    throw err
  }
}

async function executeAction(item, action, allItems) {
  validateAction(item, action)
  const { management: mgmt } = item
  const command = buildCommand(mgmt, action)

  let sshCreds
  if (mgmt.type === 'ssh-compose') {
    const server = allItems.find(i => i.id === mgmt.server_id)
    if (!server?.management) {
      const err = new Error(`Referenced server "${mgmt.server_id}" not found or has no management configured`)
      err.statusCode = 400
      throw err
    }
    sshCreds = {
      host: server.management.host,
      port: server.management.port || 22,
      user: server.management.user,
      keyPath: server.management.ssh_key,
    }
  } else {
    sshCreds = {
      host: mgmt.host,
      port: mgmt.port || 22,
      user: mgmt.user,
      keyPath: mgmt.ssh_key,
    }
  }

  let result
  if (isLocalHost(sshCreds.host)) {
    const localCmd = buildLocalCommand(mgmt, action)
    result = await runLocalCommand(localCmd)
  } else {
    const command = buildCommand(mgmt, action)
    result = await runSshCommand({ ...sshCreds, command, timeoutMs: SSH_CONNECT_TIMEOUT_MS })
  }

  return {
    success: result.code === 0,
    output: result.stdout || result.stderr,
  }
}

module.exports = { executeAction, validateAction, buildCommand }
