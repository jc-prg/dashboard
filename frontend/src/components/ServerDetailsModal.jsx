import { useState, useEffect, useCallback } from 'react'
import WarningBadge, { WarningList } from './WarningBadge'

const DEFAULT_CHECK_INTERVAL_S = 60

function Row({ label, value, warn, title }) {
  return (
    <div title={title} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`text-xs font-medium ${warn ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
        {value ?? <span className="text-gray-400 dark:text-gray-600">—</span>}
      </span>
    </div>
  )
}

export default function ServerDetailsModal({ item, token, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastFetched, setLastFetched] = useState(null)
  const mgmt = item.managementInfo
  const thresholds = mgmt?.storageWarnings ?? []
  const refreshMs = (mgmt?.checkInterval || DEFAULT_CHECK_INTERVAL_S) * 1000
  const warningOf = (type) => data?.warnings?.find(w => w.type === type)
  const withBadge = (warning, text) => text == null ? null : (
    <span className="inline-flex items-center gap-1">{warning && <WarningBadge warnings={[warning]} size={12} />}{text}</span>
  )

  const fetchDetails = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/items/${item.id}/details`, {
        headers: { Authorization: `Basic ${token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setData(json)
      setLastFetched(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [item.id, token])

  useEffect(() => {
    fetchDetails()
    const id = setInterval(fetchDetails, refreshMs)
    return () => clearInterval(id)
  }, [fetchDetails, refreshMs])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{item.name}</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Server details</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 min-h-[160px] flex flex-col justify-center">
          {loading && !data && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center">Fetching…</p>
          )}
          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}
          {data && (
            <div>
              <WarningList warnings={data.warnings} className="pb-2" />
              {data.distro && <Row label="OS" value={data.distro} />}
              {data.kernel && <Row label="Kernel" value={data.kernel} />}
              {data.storageList?.map(({ mount, value }) => {
                const [pct, used, total] = value.split('|')
                const threshold = thresholds.find(t => t.mount === mount)
                const warning = data.warnings?.find(w => w.type === 'storage' && w.mount === mount)
                return (
                  <Row
                    key={mount}
                    label={`Storage usage ${mount}${threshold ? ` (warn ≥ ${threshold.percent}%)` : ''}`}
                    value={<span className="inline-flex items-center gap-1">{warning && <WarningBadge warnings={[warning]} size={12} />}{`${pct} (${used})`}</span>}
                    warn={!!warning}
                    title={total ? `${used} / ${total} used` : undefined}
                  />
                )
              })}
              <Row
                label={`CPU usage${mgmt?.cpuWarning ? ` (warn ≥ ${mgmt.cpuWarning}%)` : ''}`}
                value={withBadge(warningOf('cpu'), data.cpuUsage)}
                warn={!!warningOf('cpu')}
              />
              <Row
                label={`Memory usage${mgmt?.memoryWarning ? ` (warn ≥ ${mgmt.memoryWarning}%)` : ''}`}
                value={data.memUsed && data.memTotal
                  ? withBadge(warningOf('memory'), `${Math.round(parseInt(data.memUsed) / parseInt(data.memTotal) * 100)}% (${data.memUsed})`)
                  : null}
                warn={!!warningOf('memory')}
              />
              <Row label="Started" value={data.startedAt} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {loading && data ? 'Refreshing…' : lastFetched ? `Updated ${lastFetched.toLocaleTimeString()}` : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDetails}
              disabled={loading}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white disabled:opacity-40 transition-colors"
              title="Refresh now"
            >
              ↻
            </button>
            <button
              onClick={onClose}
              className="text-sm border border-gray-300 dark:border-gray-600 dark:text-gray-300 rounded px-4 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
