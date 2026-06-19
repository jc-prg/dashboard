import { useState } from 'react'

export default function ActionButton({ item, action, onAction }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null) // { msg, error }

  function showToast(msg, isError = false) {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleConfirm() {
    setConfirming(false)
    setLoading(true)
    try {
      const result = await onAction(item.id, action)
      if (result.success) {
        showToast(`${action} succeeded`)
      } else {
        showToast(result.output || result.error || `${action} failed`, true)
      }
    } catch (err) {
      showToast(err.message || 'Unexpected error', true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setConfirming(true)}
        disabled={loading}
        className="capitalize text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-0.5 text-gray-600 dark:text-gray-300 hover:border-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-40 transition-colors"
      >
        {loading ? '…' : action}
      </button>

      {/* Confirmation popover */}
      {confirming && (
        <div className="absolute bottom-full left-0 mb-2 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 w-44">
          <p className="text-xs text-gray-700 dark:text-gray-300 mb-2 leading-snug">
            {action} <strong>{item.name}</strong>?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              className="text-xs bg-red-600 text-white rounded px-2 py-1 hover:bg-red-700"
            >
              Confirm
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

      {/* Toast notification */}
      {toast && (
        <div
          className={`absolute bottom-full left-0 mb-2 z-20 text-xs px-2 py-1 rounded shadow whitespace-nowrap ${
            toast.isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}
