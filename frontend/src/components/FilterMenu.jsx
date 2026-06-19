import { useState, useRef, useEffect } from 'react'

function FilterIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

export default function FilterMenu({ filters, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const activeCount = Object.values(filters).filter(Boolean).length

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative ml-auto" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Filters"
        className={`relative flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
          activeCount > 0
            ? 'bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
      >
        <FilterIcon />
        {activeCount > 0 && (
          <span className="text-xs font-bold">{activeCount}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
          <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={filters.onlineOnly}
              onChange={e => onChange('onlineOnly', e.target.checked)}
              className="accent-green-600"
            />
            Online only
          </label>
        </div>
      )}
    </div>
  )
}
