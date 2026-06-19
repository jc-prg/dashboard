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

      {/* Confirmation modal */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white capitalize">{action}</h2>
              <button
                onClick={() => setConfirming(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <div className="px-4 py-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {action} <strong className="text-gray-900 dark:text-white">{item.name}</strong>?
              </p>
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
                className="text-sm bg-red-600 text-white rounded px-4 py-1.5 hover:bg-red-700 transition-colors"
              >
                Confirm
              </button>
            </div>
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
