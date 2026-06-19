'use strict'

const basicAuth = require('express-basic-auth')

function authMiddleware() {
  const user = process.env.DASHBOARD_USER
  const password = process.env.DASHBOARD_PASSWORD

  if (!user || !password) {
    throw new Error('DASHBOARD_USER and DASHBOARD_PASSWORD environment variables are required')
  }

  return basicAuth({
    users: { [user]: password },
    unauthorizedResponse: { error: 'Unauthorized' },
  })
}

module.exports = { authMiddleware }
