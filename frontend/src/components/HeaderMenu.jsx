import { useState, useRef, useEffect } from 'react'

function MenuIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

export default function HeaderMenu({ onAddItem, onShowLog, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function action(fn) {
    setOpen(false)
    fn()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Menu"
        className={`flex items-center px-1.5 py-1 rounded transition-colors ${
          open
            ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
      >
        <MenuIcon />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
          <button
            onClick={() => action(onAddItem)}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            + Add item
          </button>
          <button
            onClick={() => action(onShowLog)}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Action log
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
          <button
            onClick={() => action(onLogout)}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
