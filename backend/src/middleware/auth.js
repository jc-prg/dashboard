'use strict'

const basicAuth = require('express-basic-auth')

function authMiddleware() {
  const password = process.env.DASHBOARD_PASSWORD

  if (!password) {
    throw new Error('DASHBOARD_PASSWORD environment variable is required')
  }

  return basicAuth({
    authorizer: (_username, pwd) => basicAuth.safeCompare(pwd, password),
    unauthorizedResponse: { error: 'Unauthorized' },
  })
}

module.exports = { authMiddleware }
