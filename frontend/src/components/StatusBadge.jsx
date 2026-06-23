const COLORS = {
  online: 'bg-green-500',
  offline: 'bg-red-500',
  unknown: 'bg-gray-400',
}

export default function StatusBadge({ status, compact = false }) {
  const color = COLORS[status] ?? COLORS.unknown
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <span
        className={`inline-block w-2 h-2 rounded-full ${color}`}
        role="img"
        aria-label={status}
      />
      {!compact && (
        <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{status}</span>
      )}
    </span>
  )
}
