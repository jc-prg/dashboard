import StatusBadge from './StatusBadge'
import ActionButton from './ActionButton'
import DeleteButton from './DeleteButton'

const HEADER_BG = {
  project: 'bg-blue-100 dark:bg-blue-950',
  server: 'bg-purple-100 dark:bg-purple-950',
  tool: 'bg-amber-100 dark:bg-amber-950',
}

export default function ItemCard({ item, onAction, onEdit, onDelete, onDetails, onItemDetails }) {
  const headerBg = HEADER_BG[item.category] ?? 'bg-gray-100'

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col hover:shadow-sm transition-shadow">
      {/* Colored header */}
      <div className={`${headerBg} px-4 py-3 flex items-center justify-between gap-2`}>
        <span className="font-medium text-gray-900 dark:text-white text-sm truncate">{item.name}</span>
        <span className="sm:hidden"><StatusBadge status={item.status} compact /></span>
        <span className="hidden sm:inline-flex"><StatusBadge status={item.status} /></span>
      </div>

      {/* Mobile-only compact footer */}
      <div className="sm:hidden px-3 py-2 flex gap-2">
        <button
          onClick={() => onItemDetails(item)}
          className="flex-1 text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-600 dark:text-gray-300 hover:border-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          Details
        </button>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-600 dark:text-gray-300 hover:border-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Open
          </a>
        )}
      </div>

      {/* Desktop body */}
      <div className="hidden sm:flex px-4 py-3 flex-col gap-3 flex-1">
        {/* Description */}
        {item.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{item.description}</p>
        )}

        {/* Tags */}
        {item.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <span key={tag} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer: link + SSH actions + edit/delete */}
        <div className="flex items-center gap-2 mt-auto pt-1 flex-wrap">
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
            >
              Open →
            </a>
          )}

          {item.managementInfo?.type === 'ssh-server' && (
            <button
              onClick={() => onDetails(item)}
              className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-0.5 text-gray-600 dark:text-gray-300 hover:border-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Details
            </button>
          )}

          {item.actions?.map((action) => (
            <ActionButton key={action} item={item} action={action} onAction={onAction} />
          ))}

          {/* Spacer pushes edit/delete to the right */}
          <span className="flex-1" />

          <button
            onClick={() => onEdit(item)}
            title="Edit item"
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors text-sm leading-none"
          >
            ✎
          </button>
          <DeleteButton item={item} onDelete={onDelete} />
        </div>
      </div>
    </div>
  )
}
