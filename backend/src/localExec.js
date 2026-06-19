'use strict'

const { exec } = require('child_process')
const os = require('os')

const LOCAL_EXEC_TIMEOUT_MS = parseInt(process.env.LOCAL_EXEC_TIMEOUT_MS || '15000', 10)

/**
 * Returns true if `host` refers to this machine.
 * Checks localhost aliases, network interface IPs, and LOCAL_HOST_IPS env var.
 */
function isLocalHost(host) {
  if (!host) return false
  if (['localhost', '127.0.0.1', '::1'].includes(host)) return true

  const envIps = (process.env.LOCAL_HOST_IPS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  if (envIps.includes(host)) return true

  const nets = os.networkInterfaces()
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.address === host) return true
    }
  }

  return false
}

/**
 * Run a shell command locally and return { stdout, stderr, code }.
 */
function runLocalCommand(command) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Local command timeout'))
    }, LOCAL_EXEC_TIMEOUT_MS)

    exec(command, { timeout: LOCAL_EXEC_TIMEOUT_MS }, (err, stdout, stderr) => {
      clearTimeout(timer)
      if (err && err.killed) return reject(new Error('Local command timeout'))
      resolve({
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim(),
        code: err ? (err.code ?? 1) : 0,
      })
    })
  })
}

module.exports = { isLocalHost, runLocalCommand }
