import { useEffect, useState } from 'react'

const TYPE_LABELS = {
  action: 'Action',
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
}

const TYPE_COLORS = {
  action: 'text-blue-600 dark:text-blue-400',
  create: 'text-green-600 dark:text-green-400',
  update: 'text-yellow-600 dark:text-yellow-400',
  delete: 'text-red-600 dark:text-red-400',
}

function formatTime(iso) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function EntryRow({ entry }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = entry.output || entry.error

  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-0">
      <button
        onClick={() => hasDetail && setExpanded(e => !e)}
        className={`w-full text-left px-4 py-2.5 flex items-start gap-3 ${hasDetail ? 'hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer' : 'cursor-default'}`}
      >
        <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap mt-0.5 w-36 shrink-0">
          {formatTime(entry.timestamp)}
        </span>
        <span className={`text-xs font-medium w-16 shrink-0 mt-0.5 ${TYPE_COLORS[entry.type] || 'text-gray-500'}`}>
          {TYPE_LABELS[entry.type] || entry.type}
        </span>
        <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 text-left">
          <span className="font-medium">{entry.itemName}</span>
          {entry.action && <span className="text-gray-500 dark:text-gray-400"> &mdash; {entry.action}</span>}
        </span>
        <span className={`text-xs font-medium shrink-0 mt-0.5 ${entry.success ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          {entry.success ? 'OK' : 'FAIL'}
        </span>
        {hasDetail && (
          <span className="text-gray-400 dark:text-gray-500 text-xs mt-0.5 shrink-0">{expanded ? '▲' : '▼'}</span>
        )}
      </button>
      {expanded && hasDetail && (
        <pre className="mx-4 mb-2 px-3 py-2 bg-gray-100 dark:bg-gray-900 text-xs text-gray-700 dark:text-gray-300 rounded overflow-x-auto whitespace-pre-wrap break-words">
          {entry.output || entry.error}
        </pre>
      )}
    </div>
  )
}

export default function AuditLogModal({ token, onClose }) {
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/audit-log', { headers: { Authorization: `Basic ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setEntries)
      .catch(err => setError(err.message))
  }, [token])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Action log</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {entries === null && !error && (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-10">Loading…</p>
          )}
          {error && (
            <p className="text-center text-sm text-red-500 py-10">Error: {error}</p>
          )}
          {entries && entries.length === 0 && (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-10">No actions recorded yet.</p>
          )}
          {entries && entries.length > 0 && entries.map((entry, i) => (
            <EntryRow key={i} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  )
}
