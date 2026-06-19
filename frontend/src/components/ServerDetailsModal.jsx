import { useState, useEffect, useCallback } from 'react'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-xs font-medium text-gray-900 dark:text-white">
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
    const id = setInterval(fetchDetails, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchDetails])

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
              <Row label="Total storage" value={data.totalStorage} />
              <Row label="Available storage" value={data.availStorage} />
              <Row label="CPU usage" value={data.cpuUsage} />
              <Row
                label="Memory usage"
                value={data.memUsed && data.memTotal ? `${data.memUsed} / ${data.memTotal}` : null}
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
