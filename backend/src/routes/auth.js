'use strict'

const { Router } = require('express')
const router = Router()
const {
  isIntranet, isDeviceTokenValid,
  generateChallenge, verifyChallenge,
  generateDeviceToken, sendCodeEmail,
} = require('../twoFactor')

// Credentials are validated by the auth middleware before reaching this handler
router.get('/check', (req, res) => {
  const twoFactorRequired = !isIntranet(req.ip) && !isDeviceTokenValid(req.cookies?.['2fa_token'])
  res.json({ ok: true, twoFactorRequired })
})

// Send a 2FA code to the configured email address
router.post('/2fa/send', async (req, res) => {
  try {
    const { challengeId, code } = generateChallenge()
    await sendCodeEmail(code)
    res.json({ challengeId })
  } catch (err) {
    res.status(500).json({ error: `Failed to send code: ${err.message}` })
  }
})

// Verify the submitted code and set an HttpOnly device-token cookie on success
router.post('/2fa/verify', (req, res) => {
  const { challengeId, code } = req.body || {}
  if (!challengeId || !code) {
    return res.status(400).json({ error: 'Missing challengeId or code' })
  }
  if (!verifyChallenge(challengeId, String(code))) {
    return res.status(401).json({ error: 'Invalid or expired code' })
  }
  const { token, days } = generateDeviceToken()
  res.cookie('2fa_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure, // true when behind TLS proxy (requires trust proxy in index.js)
    maxAge: days * 86400 * 1000,
  })
  res.json({ ok: true })
})

module.exports = router
