'use strict'

const { isIntranet, isDeviceTokenValid } = require('../twoFactor')

function twoFactorMiddleware() {
  return function (req, res, next) {
    // Auth routes handle their own logic — never block them
    if (req.path.startsWith('/api/auth/')) return next()
    // Intranet access bypasses 2FA
    if (isIntranet(req.ip)) return next()
    // Validate device token from cookie
    if (isDeviceTokenValid(req.cookies?.['2fa_token'])) return next()
    return res.status(403).json({ error: '2FA_REQUIRED' })
  }
}

module.exports = { twoFactorMiddleware }
