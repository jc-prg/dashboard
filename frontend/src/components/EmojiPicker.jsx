import { useState, useEffect, useMemo } from 'react'

// Emoji grid with search and group tabs. Data is loaded lazily to keep the main bundle small.
export default function EmojiPicker({ value, onChange }) {
  const [groups, setGroups] = useState(null)
  const [query, setQuery] = useState('')
  const [activeGroup, setActiveGroup] = useState(0)

  useEffect(() => {
    let cancelled = false
    import('../data/emojis').then(m => { if (!cancelled) setGroups(m.EMOJI_GROUPS) })
    return () => { cancelled = true }
  }, [])

  const visible = useMemo(() => {
    if (!groups) return []
    const q = query.trim().toLowerCase()
    if (!q) return groups[activeGroup]?.emojis ?? []
    return groups.flatMap(g => g.emojis).filter(([, name]) => name.includes(q))
  }, [groups, query, activeGroup])

  if (!groups) {
    return <p className="text-xs text-gray-400 dark:text-gray-500 py-2">Loading emojis…</p>
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-2">
        <input
          className="w-full border border-gray-300 dark:border-gray-600 rounded px-2.5 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search emojis (English), e.g. rocket"
        />
        {!query.trim() && (
          <div className="flex gap-1 overflow-x-auto">
            {groups.map((g, i) => (
              <button
                key={g.name}
                type="button"
                title={g.name}
                onClick={() => setActiveGroup(i)}
                className={`text-lg leading-none px-1.5 py-1 rounded shrink-0 transition-colors ${
                  i === activeGroup ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {g.emojis[0]?.[0]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="h-48 overflow-y-auto p-2 grid grid-cols-8 sm:grid-cols-10 gap-0.5 content-start">
        {visible.map(([emoji, name]) => (
          <button
            key={emoji}
            type="button"
            title={name}
            onClick={() => onChange(emoji)}
            className={`text-xl leading-none aspect-square flex items-center justify-center rounded transition-colors ${
              emoji === value ? 'bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {emoji}
          </button>
        ))}
        {visible.length === 0 && (
          <p className="col-span-full text-xs text-gray-400 dark:text-gray-500 text-center py-4">No emojis found.</p>
        )}
      </div>
    </div>
  )
}
