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
        <div className="absolute bottom-full right-0 mb-2 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 w-52">
          <p className="text-xs text-gray-700 dark:text-gray-300 mb-1 leading-snug">
            Delete <strong>{item.name}</strong>?
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">This removes it from items.yml.</p>
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              className="text-xs bg-red-600 text-white rounded px-2 py-1 hover:bg-red-700"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-xs border border-gray-300 dark:border-gray-600 dark:text-gray-300 rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
