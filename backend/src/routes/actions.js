'use strict'

const { Router } = require('express')
const crypto = require('crypto')
const { loadConfig } = require('../config')
const { executeAction, validateAction } = require('../actions')
const { append } = require('../auditLog')

// Strip absolute filesystem paths from error messages before sending to client
// e.g. "ENOENT: no such file or directory, open '/app/config/secrets/key'" → "[path]"
function sanitizeError(msg) {
  return (msg || 'Unknown error').replace(/\/[^\s'",]*/g, '[path]')
}

const ALLOWED_ACTIONS = ['start', 'stop', 'restart', 'reboot']

const router = Router()

// Actions can run for minutes (image pulls, slow container shutdowns), longer than any
// proxy keeps a request open. So the POST only starts a job and returns 202; the client
// polls GET /:id/action-jobs/:jobId until the job is no longer "running".
const JOB_RETENTION_MS = 15 * 60 * 1000
const jobs = new Map()

function finishJob(job, fields) {
  Object.assign(job, fields, { finishedAt: new Date().toISOString() })
  setTimeout(() => jobs.delete(job.jobId), JOB_RETENTION_MS).unref()
}

function publicJob(job) {
  const { jobId, id, action, status, success, output, error, startedAt, finishedAt } = job
  return { jobId, id, action, status, success, output, error, startedAt, executedAt: finishedAt }
}

router.post('/:id/action/:action', (req, res) => {
  const { id, action } = req.params

  if (!ALLOWED_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `Unknown action "${action}"` })
  }

  let item, allItems
  try {
    allItems = loadConfig()
    item = allItems.find(i => i.id === id)
  } catch (err) {
    return res.status(500).json({ error: `Config error: ${err.message}` })
  }

  if (!item) return res.status(404).json({ error: 'Item not found' })

  try {
    validateAction(item, action)
  } catch (err) {
    return res.status(400).json({ id, action, success: false, error: sanitizeError(err.message) })
  }

  const job = { jobId: crypto.randomUUID(), id, action, status: 'running', startedAt: new Date().toISOString() }
  jobs.set(job.jobId, job)

  executeAction(item, action, allItems)
    .then(result => {
      // L3: output is returned to the caller but not stored in the audit log
      append({ type: 'action', itemId: id, itemName: item.name, action, success: result.success })
      finishJob(job, { status: 'done', success: result.success, output: result.output })
    })
    .catch(err => {
      // L1: strip filesystem paths from error messages before sending to client
      const safeError = sanitizeError(err.message)
      append({ type: 'action', itemId: id, itemName: item.name, action, success: false, error: safeError })
      finishJob(job, { status: 'done', success: false, error: safeError })
    })

  res.status(202).json(publicJob(job))
})

router.get('/:id/action-jobs/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId)
  if (!job || job.id !== req.params.id) return res.status(404).json({ error: 'Job not found' })
  res.json(publicJob(job))
})

module.exports = router
