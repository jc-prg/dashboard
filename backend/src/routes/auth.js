'use strict'

const { Router } = require('express')
const router = Router()

// Credentials are validated by the auth middleware before reaching this handler
router.get('/check', (req, res) => {
  res.json({ ok: true, user: req.auth.user })
})

module.exports = router
