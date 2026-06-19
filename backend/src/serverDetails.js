'use strict'

const { runSshCommand } = require('./ssh')

const DETAILS_TTL_MS = 5 * 60 * 1000

// Cache: { [itemId]: { totalStorage, availStorage, cpuUsage, memUsed, memTotal, startedAt, fetchedAt, os } }
const detailsCache = {}

function buildLinuxCommand() {
  return [
    "df -h / | awk 'NR==2{printf \"TOTAL_STORAGE:%s\\nAVAIL_STORAGE:%s\\n\",$2,$4}'",
    "awk '/^cpu /{u=$2+$4;t=$2+$3+$4+$5;printf \"CPU:%.1f\\n\",(t>0)?u/t*100:0}' /proc/stat",
    "free -m | awk '/^Mem/{printf \"MEM_USED:%dMB\\nMEM_TOTAL:%dMB\\n\",$3,$2}'",
    "uptime -s | awk '{print \"STARTED:\"$0}'",
  ].join('; ')
}

function buildWindowsCommand() {
  const ps = [
    '$d=Get-PSDrive C',
    '$free=[math]::Round($d.Free/1GB,1)',
    '$used=[math]::Round($d.Used/1GB,1)',
    'Write-Host ("TOTAL_STORAGE:"+($used+$free)+"GB")',
    'Write-Host ("AVAIL_STORAGE:"+$free+"GB")',
    '$cpu=(Get-WmiObject Win32_Processor|Measure-Object LoadPercentage -Average).Average',
    'Write-Host ("CPU:"+$cpu)',
    '$os=Get-WmiObject Win32_OperatingSystem',
    '$mt=[math]::Round($os.TotalVisibleMemorySize/1024)',
    '$mf=[math]::Round($os.FreePhysicalMemory/1024)',
    'Write-Host ("MEM_USED:"+($mt-$mf)+"MB")',
    'Write-Host ("MEM_TOTAL:"+$mt+"MB")',
    'Write-Host ("STARTED:"+$os.ConvertToDateTime($os.LastBootUpTime))',
  ].join('; ')
  return `powershell -NoProfile -Command "${ps}"`
}

function parseOutput(stdout) {
  const kv = {}
  for (const line of stdout.split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    kv[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return {
    totalStorage: kv.TOTAL_STORAGE || null,
    availStorage: kv.AVAIL_STORAGE || null,
    cpuUsage: kv.CPU != null ? `${parseFloat(kv.CPU).toFixed(1)}%` : null,
    memUsed: kv.MEM_USED || null,
    memTotal: kv.MEM_TOTAL || null,
    startedAt: kv.STARTED || null,
  }
}

async function fetchServerDetails(item) {
  const cached = detailsCache[item.id]
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < DETAILS_TTL_MS) {
    return cached
  }

  const mgmt = item.management
  const os = mgmt.os || 'linux'
  const command = os === 'windows' ? buildWindowsCommand() : buildLinuxCommand()

  const sshResult = await runSshCommand({
    host: mgmt.host,
    port: mgmt.port || 22,
    user: mgmt.user,
    keyPath: mgmt.ssh_key,
    command,
    timeoutMs: 15000,
  })

  const data = {
    ...parseOutput(sshResult.stdout),
    fetchedAt: new Date().toISOString(),
    os,
  }

  detailsCache[item.id] = data
  return data
}

module.exports = { fetchServerDetails }
