'use strict'

const fs = require('fs')
const crypto = require('crypto')

/**
 * If RESET_PWD=1, generates a new random password, writes it to the .env file
 * (updating DASHBOARD_PASSWORD and setting RESET_PWD=0), and updates process.env
 * so the new password is active immediately without a restart.
 */
function maybeResetPassword() {
  if (process.env.RESET_PWD !== '1') return

  const envFile = process.env.ENV_FILE || '/app/.env'

  if (!fs.existsSync(envFile)) {
    console.warn(`RESET_PWD=1 set but env file not found at ${envFile} — skipping reset`)
    return
  }

  const newPassword = crypto.randomBytes(16).toString('hex')

  let content = fs.readFileSync(envFile, 'utf8')

  // Update DASHBOARD_PASSWORD
  if (/^DASHBOARD_PASSWORD=.*/m.test(content)) {
    content = content.replace(/^DASHBOARD_PASSWORD=.*/m, `DASHBOARD_PASSWORD=${newPassword}`)
  } else {
    content += `\nDASHBOARD_PASSWORD=${newPassword}`
  }

  // Clear RESET_PWD flag
  if (/^RESET_PWD=.*/m.test(content)) {
    content = content.replace(/^RESET_PWD=.*/m, 'RESET_PWD=0')
  } else {
    content += '\nRESET_PWD=0'
  }

  fs.writeFileSync(envFile, content, 'utf8')

  process.env.DASHBOARD_PASSWORD = newPassword
  process.env.RESET_PWD = '0'

  console.log('='.repeat(60))
  console.log('PASSWORD RESET')
  console.log(`New password: ${newPassword}`)
  console.log('='.repeat(60))
}

module.exports = { maybeResetPassword }
