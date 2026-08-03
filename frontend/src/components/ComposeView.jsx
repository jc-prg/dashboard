import { useState, useEffect, useRef } from 'react'

function StatusDot({ status }) {
  const color =
    status === 'online' ? 'bg-green-500' :
    status === 'offline' ? 'bg-red-500' :
    status === 'srv-off' ? 'bg-amber-400' :
    'bg-gray-400 dark:bg-gray-500'
  const label = status === 'srv-off' ? 'Srv Off' : status
  return <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${color}`} title={label} />
}

function Spinner() {
  return (
    <svg className="animate-spin w-3.5 h-3.5 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

export default function ComposeView({ items, onAction, onClose }) {
  const allComposeItems = items
    .filter(i => i.managementInfo?.type === 'ssh-compose')
    .slice().sort((a, b) => a.name.localeCompare(b.name))

  const composeItems = allComposeItems.filter(i => i.status !== 'srv-off')

  // Group srv-off items by server ID for the footer summary
  const srvOffByServer = allComposeItems
    .filter(i => i.status === 'srv-off')
    .reduce((acc, i) => {
      const sid = i.managementInfo.serverId
      if (!acc[sid]) acc[sid] = []
      acc[sid].push(i)
      return acc
    }, {})
  const offlineServers = Object.entries(srvOffByServer).map(([sid, srvItems]) => {
    const server = items.find(i => i.id === sid)
    return { id: sid, name: server?.name ?? sid, count: srvItems.length }
  })

  // pending[id] = action string while in flight, null/undefined otherwise
  const [pending, setPending] = useState({})
  // optimistic[id] = expected status ('online'|'offline') after toggle, until real status confirms
  const [optimistic, setOptimistic] = useState({})
  // error[id] = true while showing error indicator (5s after failure)
  const [errors, setErrors] = useState({})
  const errorTimers = useRef({})

  // Cleanup timers on unmount
  useEffect(() => {
    return () => Object.values(errorTimers.current).forEach(clearTimeout)
  }, [])

  // Clear optimistic state for items whose real status has caught up
  useEffect(() => {
    setOptimistic(prev => {
      const next = { ...prev }
      let changed = false
      for (const item of items) {
        if (next[item.id] && next[item.id] === item.status) {
          delete next[item.id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [items])

  async function handle(id, action) {
    if (pending[id]) return
    if (action === 'start' || action === 'stop') {
      setOptimistic(o => ({ ...o, [id]: action === 'start' ? 'online' : 'offline' }))
    }
    setPending(p => ({ ...p, [id]: action }))
    try {
      await onAction(id, action)
    } catch {
      // Revert optimistic state so toggle snaps back
      setOptimistic(o => { const n = { ...o }; delete n[id]; return n })
      // Show error indicator for 5s
      setErrors(e => ({ ...e, [id]: true }))
      clearTimeout(errorTimers.current[id])
      errorTimers.current[id] = setTimeout(() => {
        setErrors(e => { const n = { ...e }; delete n[id]; return n })
      }, 5000)
    } finally {
      setPending(p => ({ ...p, [id]: null }))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-xl flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Control center</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {allComposeItems.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-10">
              No compose items configured.
            </p>
          ) : composeItems.length === 0 && offlineServers.length > 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-6">
              All items are unavailable — servers offline.
            </p>
          ) : (
            composeItems.map(item => {
              const isOptimistic = !!optimistic[item.id]
              const effectiveStatus = optimistic[item.id] ?? item.status
              const isOnline = effectiveStatus === 'online'
              const isBusy = !!pending[item.id]
              const hasError = !!errors[item.id]

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0"
                >
                  {/* Status dot */}
                  <StatusDot status={item.status} />

                  {/* Name + link */}
                  <span className="flex-1 flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {item.name}
                    </span>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={item.url}
                        className="flex-shrink-0 border border-gray-300 dark:border-gray-600 rounded p-1 text-gray-500 dark:text-gray-400 hover:border-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center justify-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    )}
                  </span>

                  {/* Pending / error indicator */}
                  <span className="w-20 flex items-center justify-end gap-1.5 text-xs">
                    {hasError ? (
                      <>
                        <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="15" y1="9" x2="9" y2="15" />
                          <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                        <span className="text-red-500">Error</span>
                      </>
                    ) : isBusy ? (
                      <>
                        <Spinner />
                        <span className="capitalize text-gray-400 dark:text-gray-500">{pending[item.id]}…</span>
                      </>
                    ) : null}
                  </span>

                  {/* Start / Stop toggle */}
                  <button
                    onClick={() => handle(item.id, isOnline ? 'stop' : 'start')}
                    disabled={isBusy}
                    title={isOnline ? 'Stop' : 'Start'}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-40 focus:outline-none ${
                      isOptimistic
                        ? 'bg-yellow-400'
                        : isOnline ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        isOnline ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>

                  {/* Restart button */}
                  <button
                    onClick={() => handle(item.id, 'restart')}
                    disabled={isBusy}
                    title="Restart"
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-40 transition-colors flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10" />
                      <path d="M3.51 15a9 9 0 1 0 .49-3.51" />
                    </svg>
                  </button>
                </div>
              )
            })
          )}

          {/* Offline server summary */}
          {offlineServers.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-2">
              {offlineServers.map(({ id, name, count }) => (
                <div key={id} className="flex items-center gap-2.5 py-1.5">
                  <StatusDot status="offline" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-300">{name}</span>
                    {' '}— {count} item{count !== 1 ? 's' : ''} unavailable
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
