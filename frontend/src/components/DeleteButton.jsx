import { useState } from 'react'

export default function DeleteButton({ item, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleConfirm() {
    setLoading(true)
    try {
      await onDelete(item.id)
    } catch (err) {
      setError(err.message || 'Delete failed')
      setLoading(false)
    }
    // If successful, the item unmounts so no need to reset state
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setError(null); setConfirming(true) }}
        disabled={loading}
        title="Delete item"
        className="text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors text-sm leading-none"
      >
        {loading ? '…' : '✕'}
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Delete item</h2>
              <button
                onClick={() => setConfirming(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <div className="px-4 py-4 flex flex-col gap-1">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Delete <strong className="text-gray-900 dark:text-white">{item.name}</strong>?
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">This removes it from items.yml.</p>
              {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setConfirming(false)}
                className="text-sm border border-gray-300 dark:border-gray-600 dark:text-gray-300 rounded px-4 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="text-sm bg-red-600 text-white rounded px-4 py-1.5 hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
