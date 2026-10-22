// Amber warning triangle; the tooltip lists all active warnings of an item.
export default function WarningBadge({ warnings, size = 14 }) {
  if (!warnings?.length) return null
  const text = warnings.map(w => w.message).join('\n')
  return (
    <span title={text} aria-label={text} className="inline-flex shrink-0 text-amber-500 dark:text-amber-400">
      <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </span>
  )
}

// Inline list of warning messages, e.g. inside a card body or modal
export function WarningList({ warnings, className = '' }) {
  if (!warnings?.length) return null
  return (
    <ul className={`flex flex-col gap-1 ${className}`}>
      {warnings.map(w => (
        <li key={`${w.type}:${w.mount}`} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded px-2 py-1">
          <WarningBadge warnings={[w]} size={12} />
          <span>{w.message}</span>
        </li>
      ))}
    </ul>
  )
}
