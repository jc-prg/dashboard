'use strict'

const { runSshCommand } = require('./ssh')

const DETAILS_TTL_MS = 5 * 60 * 1000

// Cache: { [itemId]: { storageList, cpuUsage, memUsed, memTotal, startedAt, fetchedAt, os } }
const detailsCache = {}

function buildLinuxCommand() {
  return [
    "awk -F= '/^PRETTY_NAME/{gsub(/\"/,\"\",$2); print \"DISTRO:\"$2}' /etc/os-release",
    // All real mounts: exclude virtual/pseudo filesystems, output STORAGE:<mount>=<pct%>|<used>
    "df -h | awk 'NR>1 && $1 !~ /^(tmpfs|devtmpfs|udev|none|overlay|shm|cgroupfs|squashfs)/ && $6 ~ /^\\//{printf \"STORAGE:%s=%s|%s\\n\",$6,$5,$3}'",
    "awk '/^cpu /{u=$2+$4;t=$2+$3+$4+$5;printf \"CPU:%.1f\\n\",(t>0)?u/t*100:0}' /proc/stat",
    "awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{printf \"MEM_USED:%dMB\\nMEM_TOTAL:%dMB\\n\",int((t-a)/1024),int(t/1024)}' /proc/meminfo",
    "b=$(awk '/^btime/{print $2}' /proc/stat); echo \"STARTED:$(date -d @$b '+%Y-%m-%d %H:%M:%S' 2>/dev/null || awk -v b=$b 'BEGIN{print strftime(\"%Y-%m-%d %H:%M:%S\",b)}')\"",
  ].join('; ')
}

function buildWindowsCommand() {
  const ps = [
    // All drives with available space, output STORAGE:<root>=<pct%>|<used>GB
    'Get-PSDrive -PSProvider FileSystem | Where-Object {$_.Free -ne $null} | ForEach-Object { $f=[math]::Round($_.Free/1GB,1); $u=[math]::Round($_.Used/1GB,1); $tot=$f+$u; $pct=if($tot -gt 0){[math]::Round($u/$tot*100)}else{0}; Write-Host ("STORAGE:"+$_.Root+"="+$pct+"%|"+$u+"GB") }',
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
    // STORAGE:<mount>=<pct%>|<used>  (handled before generic split to support paths with colons)
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
    storageList,
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
