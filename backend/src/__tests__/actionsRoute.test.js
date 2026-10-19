'use strict'

jest.mock('../config')
jest.mock('../actions', () => ({
  ...jest.requireActual('../actions'),
  executeAction: jest.fn(),
}))
jest.mock('../auditLog')

const express = require('express')
const request = require('supertest')
const { loadConfig } = require('../config')
const { executeAction } = require('../actions')
const actionsRouter = require('../routes/actions')

const server = { id: 'srv', name: 'Server', management: { type: 'ssh-server', host: '10.0.0.1', user: 'admin', ssh_key: '/k' } }
const app = { id: 'app', name: 'App', management: { type: 'ssh-compose', server_id: 'srv', compose_dir: '/opt/app' } }

const api = express()
api.use('/api/items', actionsRouter)

beforeEach(() => {
  loadConfig.mockReturnValue([server, app])
  executeAction.mockReset()
})

async function waitForJob(jobId) {
  for (let i = 0; i < 50; i++) {
    const res = await request(api).get(`/api/items/app/action-jobs/${jobId}`)
    if (res.body.status !== 'running') return res
    await new Promise(r => setTimeout(r, 10))
  }
  throw new Error('job did not finish')
}

describe('POST /:id/action/:action', () => {
  it('returns 202 with a running job immediately, before the action has finished', async () => {
    let finish
    executeAction.mockReturnValue(new Promise(r => { finish = r }))
    const res = await request(api).post('/api/items/app/action/start')
    expect(res.status).toBe(202)
    expect(res.body).toMatchObject({ id: 'app', action: 'start', status: 'running' })

    const pending = await request(api).get(`/api/items/app/action-jobs/${res.body.jobId}`)
    expect(pending.body.status).toBe('running')

    finish({ success: true, output: 'started' })
    const done = await waitForJob(res.body.jobId)
    expect(done.body).toMatchObject({ status: 'done', success: true, output: 'started' })
  })

  it('reports failures through the job with paths stripped', async () => {
    executeAction.mockRejectedValue(new Error("ENOENT, open '/app/config/secrets/key'"))
    const res = await request(api).post('/api/items/app/action/stop')
    const done = await waitForJob(res.body.jobId)
    expect(done.body).toMatchObject({ status: 'done', success: false })
    expect(done.body.error).not.toMatch(/secrets/)
  })

  it('rejects actions not available for the management type synchronously', async () => {
    const res = await request(api).post('/api/items/app/action/reboot')
    expect(res.status).toBe(400)
    expect(executeAction).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown job', async () => {
    const res = await request(api).get('/api/items/app/action-jobs/nope')
    expect(res.status).toBe(404)
  })
})
