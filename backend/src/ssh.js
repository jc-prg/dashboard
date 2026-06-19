'use strict'

const { Client } = require('ssh2')
const fs = require('fs')

function runSshCommand({ host, port = 22, user, keyPath, command, timeoutMs = 8000 }) {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    let settled = false

    const settle = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { conn.end() } catch {}
      fn(value)
    }

    const timer = setTimeout(() => {
      try { conn.destroy() } catch {}
      settle(reject, new Error('SSH connection timeout'))
    }, timeoutMs)

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) return settle(reject, err)

          let stdout = ''
          let stderr = ''

          stream
            .on('close', (code) => settle(resolve, { stdout: stdout.trim(), stderr: stderr.trim(), code }))
            .on('data', (data) => { stdout += data })
            .stderr.on('data', (data) => { stderr += data })
        })
      })
      .on('error', (err) => settle(reject, err))
      .connect({
        host,
        port: Number(port),
        username: user,
        privateKey: fs.readFileSync(keyPath),
        readyTimeout: timeoutMs,
      })
  })
}

module.exports = { runSshCommand }
