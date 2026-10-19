import StatusBadge from './StatusBadge'
import ActionButton from './ActionButton'

// Fallback when an item has neither emoji nor favicon: first letter on the category color
const FALLBACK_BG = {
  project: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  server: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  tool: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
}

const STATUS_LABEL = {
  online: 'Online',
  offline: 'Offline',
  unknown: 'Unknown',
  'srv-off': 'Server offline',
}

function BigIcon({ item, icon }) {
  if (item.iconEmoji) {
    return <span className="text-5xl leading-none select-none" aria-hidden="true">{item.iconEmoji}</span>
  }
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        className={`w-14 h-14 object-contain rounded-lg ${item.iconInvertDark ? 'dark:invert' : ''}`}
      />
    )
  }
  const letter = item.name.replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase() || '?'
  return (
    <span className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-semibold ${FALLBACK_BG[item.category] ?? 'bg-gray-100 text-gray-600'}`}>
      {letter}
    </span>
  )
}

const BUTTON_CLASS = 'border border-gray-300 dark:border-gray-600 rounded p-1 text-gray-500 dark:text-gray-400 hover:border-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center justify-center'

export default function IconCard({ item, icon, onAction, onEdit, onDetails }) {
  const iconBlock = <BigIcon item={item} icon={icon} />

  return (
    <div className="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 pt-4 flex flex-col items-center gap-2 hover:shadow-sm transition-shadow">
      {/* Online status in the corner */}
      <span className="absolute top-2 right-2" title={STATUS_LABEL[item.status] ?? item.status}>
        <StatusBadge status={item.status} compact />
      </span>

      {/* Large icon — clicking it opens the app */}
      {item.url ? (
        <a href={item.url} target="_blank" rel="noopener noreferrer" title={`Open ${item.name}`} className="h-16 mb-2 flex items-center justify-center">
          {iconBlock}
        </a>
      ) : (
        <span className="h-16 mb-2 flex items-center justify-center">{iconBlock}</span>
      )}

      <span className="w-full text-center text-xs font-medium text-gray-900 dark:text-white truncate" title={item.name}>
        {item.name}
      </span>

      {/* Open, details, SSH actions, edit */}
      <div className="flex flex-wrap items-center justify-center gap-1">
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" title="Open" className={BUTTON_CLASS}>
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        )}
        {item.managementInfo?.type === 'ssh-server' && (
          <button onClick={() => onDetails(item)} title="Server details" className={BUTTON_CLASS}>
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
        )}
        {item.actions?.map((action) => (
          <ActionButton key={action} item={item} action={action} onAction={onAction} />
        ))}
        <button onClick={() => onEdit(item)} title="Edit item" className={BUTTON_CLASS}>
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
