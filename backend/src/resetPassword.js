'use strict'

const fs = require('fs')
const crypto = require('crypto')

const NEW_PASSWORD_FILE = '/app/config/.new-password'

/**
 * If RESET_PWD=1, generates a new random password, activates it immediately
 * in process.env, and writes it to config/.new-password.
 *
 * The .env file is NOT modified — update DASHBOARD_PASSWORD there manually,
 * then set RESET_PWD=0 and restart.
 *
 * Read the new password:  docker compose exec backend cat /app/config/.new-password
 */
function maybeResetPassword() {
  if (process.env.RESET_PWD !== '1') return

  const newPassword = crypto.randomBytes(16).toString('hex')

  process.env.DASHBOARD_PASSWORD = newPassword
  process.env.RESET_PWD = '0'

  try {
    fs.writeFileSync(NEW_PASSWORD_FILE, newPassword + '\n', { mode: 0o600 })
  } catch (err) {
    console.warn(`[resetPassword] Could not write password file: ${err.message}`)
  }

  console.log('='.repeat(60))
  console.log('PASSWORD RESET')
  console.log(`New password: ${newPassword}`)
  console.log(`Also saved to: ${NEW_PASSWORD_FILE}`)
  console.log('Update DASHBOARD_PASSWORD in .env, set RESET_PWD=0, restart.')
  console.log('='.repeat(60))
}

module.exports = { maybeResetPassword }
