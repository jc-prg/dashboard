'use strict'

const { runSshCommand } = require('./ssh')
const { loadConfig } = require('./config')
const { getStatus } = require('./healthcheck')

const DEFAULT_CHECK_INTERVAL_S = 60
const SCHEDULER_TICK_MS = 5000

// Cache: { [itemId]: { storageList, cpuUsage, memUsed, memTotal, startedAt, fetchedAt, os } }
const detailsCache = {}

function buildLinuxCommand() {
  return [
    "awk -F= '/^PRETTY_NAME/{gsub(/\"/,\"\",$2); print \"DISTRO:\"$2}' /etc/os-release",
    'echo "KERNEL:$(uname -r)"',
    // All real mounts: exclude virtual/pseudo filesystems, output STORAGE:<mount>=<pct%>|<used>|<total>
    "df -h | awk 'NR>1 && $1 !~ /^(tmpfs|devtmpfs|udev|none|overlay|shm|cgroupfs|squashfs)/ && $6 ~ /^\\//{printf \"STORAGE:%s=%s|%s|%s\\n\",$6,$5,$3,$2}'",
    // Current CPU usage: two samples of /proc/stat one second apart (user..steal, idle = idle+iowait)
    "{ head -1 /proc/stat; sleep 1; head -1 /proc/stat; } | awk '{t=0;for(i=2;i<=9;i++)t+=$i; if(NR==1){t1=t;i1=$5+$6}else{t2=t;i2=$5+$6}} END{d=t2-t1;printf \"CPU:%.1f\\n\",(d>0)?(d-(i2-i1))/d*100:0}'",
    "awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{printf \"MEM_USED:%dMB\\nMEM_TOTAL:%dMB\\n\",int((t-a)/1024),int(t/1024)}' /proc/meminfo",
    "b=$(awk '/^btime/{print $2}' /proc/stat); echo \"STARTED:$(date -d @$b '+%Y-%m-%d %H:%M:%S' 2>/dev/null || awk -v b=$b 'BEGIN{print strftime(\"%Y-%m-%d %H:%M:%S\",b)}')\"",
  ].join('; ')
}

function buildWindowsCommand() {
  const ps = [
    // All drives with available space, output STORAGE:<root>=<pct%>|<used>GB|<total>GB
    'Get-PSDrive -PSProvider FileSystem | Where-Object {$_.Free -ne $null} | ForEach-Object { $f=[math]::Round($_.Free/1GB,1); $u=[math]::Round($_.Used/1GB,1); $tot=$f+$u; $pct=if($tot -gt 0){[math]::Round($u/$tot*100)}else{0}; Write-Host ("STORAGE:"+$_.Root+"="+$pct+"%|"+$u+"GB|"+$tot+"GB") }',
    '$cpu=(Get-WmiObject Win32_Processor|Measure-Object LoadPercentage -Average).Average',
    'Write-Host ("CPU:"+$cpu)',
    '$os=Get-WmiObject Win32_OperatingSystem',
    'Write-Host ("DISTRO:"+$os.Caption)',
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
  const storageList = []
  for (const line of stdout.split('\n')) {
    // STORAGE:<mount>=<pct%>|<used>|<total>  (handled before generic split to support paths with colons)
    if (line.startsWith('STORAGE:')) {
      const rest = line.slice(8)
      const eqIdx = rest.indexOf('=')
      if (eqIdx !== -1) {
        storageList.push({ mount: rest.slice(0, eqIdx).trim(), value: rest.slice(eqIdx + 1).trim() })
      }
      continue
    }
    const idx = line.indexOf(':')
    if (idx === -1) continue
    kv[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return {
    distro: kv.DISTRO || null,
    kernel: kv.KERNEL || null,
    storageList,
    cpuUsage: kv.CPU != null ? `${parseFloat(kv.CPU).toFixed(1)}%` : null,
    memUsed: kv.MEM_USED || null,
    memTotal: kv.MEM_TOTAL || null,
    startedAt: kv.STARTED || null,
  }
}

function checkIntervalMs(item) {
  return (item.management?.check_interval || DEFAULT_CHECK_INTERVAL_S) * 1000
}

async function fetchServerDetails(item, { force = false } = {}) {
  const cached = detailsCache[item.id]
  if (!force && cached && Date.now() - new Date(cached.fetchedAt).getTime() < checkIntervalMs(item)) {
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

// ─── Warnings ────────────────────────────────────────────────────────────────

function memoryPercent(details) {
  const used = parseInt(details.memUsed, 10)
  const total = parseInt(details.memTotal, 10)
  return used >= 0 && total > 0 ? Math.round(used / total * 100) : NaN
}

// Compare current usage against the thresholds in management (cpu_warning, memory_warning,
// storage_warnings per mount). Unset thresholds and mounts the server doesn't report never warn.
function computeWarnings(item, details) {
  const mgmt = item.management
  if (!details || !mgmt) return []
  const warnings = []

  const cpu = parseFloat(details.cpuUsage)
  if (typeof mgmt.cpu_warning === 'number' && cpu >= mgmt.cpu_warning) {
    const usedPercent = Math.round(cpu)
    warnings.push({
      type: 'cpu',
      usedPercent,
      threshold: mgmt.cpu_warning,
      message: `High CPU usage: ${usedPercent}% (warning at ${mgmt.cpu_warning}%)`,
    })
  }

  const mem = memoryPercent(details)
  if (typeof mgmt.memory_warning === 'number' && mem >= mgmt.memory_warning) {
    warnings.push({
      type: 'memory',
      usedPercent: mem,
      threshold: mgmt.memory_warning,
      message: `High memory usage: ${mem}% (warning at ${mgmt.memory_warning}%)`,
    })
  }

  const thresholds = Array.isArray(mgmt.storage_warnings) ? mgmt.storage_warnings : []
  for (const { mount, percent } of thresholds) {
    if (typeof percent !== 'number') continue
    const entry = details.storageList?.find(s => s.mount === mount)
    if (!entry) continue
    const usedPercent = parseInt(entry.value, 10)
    if (Number.isNaN(usedPercent) || usedPercent < percent) continue
    warnings.push({
      type: 'storage',
      mount,
      usedPercent,
      threshold: percent,
      message: `Low storage on ${mount}: ${usedPercent}% used (warning at ${percent}%)`,
    })
  }
  return warnings
}

// Warnings from the last known details (no SSH call). Thresholds are read from the
// current item, so edits take effect immediately.
function getWarnings(item) {
  if (item.management?.type !== 'ssh-server') return []
  return computeWarnings(item, detailsCache[item.id])
}

function needsWarningPoll(item) {
  const mgmt = item.management
  if (mgmt?.type !== 'ssh-server') return false
  return typeof mgmt.cpu_warning === 'number' || typeof mgmt.memory_warning === 'number' ||
    mgmt.storage_warnings?.length > 0
}

// Item ids with an SSH fetch in progress, so slow servers aren't queried twice at once
const inFlight = new Set()

// Refresh details for one item in the background; failures keep the last known data.
async function refreshDetails(item) {
  if (inFlight.has(item.id)) return
  inFlight.add(item.id)
  try {
    await fetchServerDetails(item, { force: true })
  } catch (err) {
    console.warn(`[serverDetails] Failed to fetch details for "${item.id}": ${err.message}`)
  } finally {
    inFlight.delete(item.id)
  }
}

function isDue(item, now = Date.now()) {
  const cached = detailsCache[item.id]
  if (!cached) return true
  return now - new Date(cached.fetchedAt).getTime() >= checkIntervalMs(item)
}

async function pollWarningServers() {
  let items
  try {
    items = loadConfig()
  } catch (err) {
    console.error('[serverDetails] Failed to load config, skipping cycle:', err.message)
    return
  }
  await Promise.all(
    items
      .filter(needsWarningPoll)
      .filter(item => getStatus(item.id).status !== 'offline')
      .filter(item => isDue(item))
      .map(refreshDetails)
  )
}

// Ticks frequently; each server is re-checked once its own check_interval has elapsed.
function startWarningScheduler() {
  pollWarningServers()
  setInterval(pollWarningServers, SCHEDULER_TICK_MS)
}

module.exports = {
  fetchServerDetails,
  computeWarnings,
  getWarnings,
  needsWarningPoll,
  refreshDetails,
  isDue,
  DEFAULT_CHECK_INTERVAL_S,
  startWarningScheduler,
}
