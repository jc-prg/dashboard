'use strict'

const fs = require('fs')
const yaml = require('js-yaml')

const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/items.yml'

const MANAGEMENT_ACTIONS = {
  'ssh-server': ['reboot'],
  'ssh-compose': ['restart'],
}

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
  const parsed = yaml.load(raw)
  const items = parsed?.items || []

  const mapped = items.map((item, i) => {
    if (!item.id) throw new Error(`Item at index ${i} missing required field: id`)
    if (!item.name) throw new Error(`Item "${item.id}" missing required field: name`)
    if (!item.url && item.management?.type !== 'ssh-server') throw new Error(`Item "${item.id}" missing required field: url`)

    const mgmt = item.management || null
    if (mgmt) {
      const allowed = Object.keys(MANAGEMENT_ACTIONS)
      if (!allowed.includes(mgmt.type)) {
        throw new Error(`Item "${item.id}" unknown management.type: "${mgmt.type}". Must be one of: ${allowed.join(', ')}`)
      }
      if (mgmt.type === 'ssh-compose') {
        if (!mgmt.server_id) throw new Error(`Item "${item.id}" ssh-compose management missing required field: server_id`)
        if (!mgmt.compose_dir) throw new Error(`Item "${item.id}" ssh-compose management missing required field: compose_dir`)
      } else {
        if (!mgmt.host) throw new Error(`Item "${item.id}" management missing required field: host`)
        if (!mgmt.user) throw new Error(`Item "${item.id}" management missing required field: user`)
        if (!mgmt.ssh_key) throw new Error(`Item "${item.id}" management missing required field: ssh_key`)
      }
    }

    return {
      id: item.id,
      name: item.name,
      category: item.category || 'project',
      description: item.description || '',
      url: item.url || null,
      health_check: item.health_check || null,
      tags: item.tags || [],
      management: mgmt,
      actions: mgmt ? MANAGEMENT_ACTIONS[mgmt.type] : [],
    }
  })

  // Validate ssh-compose server_id cross-references
  for (const item of mapped) {
    if (item.management?.type === 'ssh-compose') {
      const server = mapped.find(i => i.id === item.management.server_id)
      if (!server) {
        throw new Error(`Item "${item.id}" references unknown server_id: "${item.management.server_id}"`)
      }
      if (server.management?.type !== 'ssh-server') {
        throw new Error(`Item "${item.id}" references "${item.management.server_id}" which does not have ssh-server management`)
      }
    }
  }

  return mapped
}

module.exports = { loadConfig, MANAGEMENT_ACTIONS }
