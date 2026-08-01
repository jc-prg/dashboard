import { useState } from 'react'

function StatusDot({ status }) {
  const color =
    status === 'online' ? 'bg-green-500' :
    status === 'offline' ? 'bg-red-500' :
    'bg-gray-400 dark:bg-gray-500'
  return <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${color}`} title={status} />
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
  const composeItems = items
    .filter(i => i.managementInfo?.type === 'ssh-compose')
    .slice().sort((a, b) => a.name.localeCompare(b.name))

  // pending[id] = action string while in flight, null/undefined otherwise
  const [pending, setPending] = useState({})

  async function handle(id, action) {
    if (pending[id]) return
    setPending(p => ({ ...p, [id]: action }))
    try {
      await onAction(id, action)
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
          {composeItems.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-10">
              No compose items configured.
            </p>
          ) : (
            composeItems.map(item => {
              const isOnline = item.status === 'online'
              const isBusy = !!pending[item.id]

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
                        className="flex-shrink-0 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    )}
                  </span>

                  {/* Pending indicator */}
                  <span className="w-20 flex items-center justify-end gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                    {isBusy && (
                      <>
                        <Spinner />
                        <span className="capitalize">{pending[item.id]}…</span>
                      </>
                    )}
                  </span>

                  {/* Start / Stop toggle */}
                  <button
                    onClick={() => handle(item.id, isOnline ? 'stop' : 'start')}
                    disabled={isBusy}
                    title={isOnline ? 'Stop' : 'Start'}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-40 focus:outline-none ${
                      isOnline ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
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
                    className="text-base text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-40 transition-colors px-1 leading-none"
                  >
                    ↻
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
