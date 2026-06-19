import StatusBadge from './StatusBadge'
import ActionButton from './ActionButton'
import DeleteButton from './DeleteButton'

const HEADER_BG = {
  project: 'bg-blue-100',
  server: 'bg-purple-100',
  tool: 'bg-amber-100',
}

export default function ItemCard({ item, onAction, onEdit, onDelete }) {
  const headerBg = HEADER_BG[item.category] ?? 'bg-gray-100'

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col hover:shadow-sm transition-shadow">
      {/* Colored header */}
      <div className={`${headerBg} px-4 py-3 flex items-center justify-between gap-2`}>
        <span className="font-medium text-gray-900 text-sm truncate">{item.name}</span>
        <StatusBadge status={item.status} />
      </div>

      {/* Body */}
      <div className="px-4 py-3 flex flex-col gap-3 flex-1">
        {/* Description */}
        {item.description && (
          <p className="text-xs text-gray-500 leading-relaxed">{item.description}</p>
        )}

        {/* Tags */}
        {item.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
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
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Open →
            </a>
          )}

          {item.actions?.map((action) => (
            <ActionButton key={action} item={item} action={action} onAction={onAction} />
          ))}

          {/* Spacer pushes edit/delete to the right */}
          <span className="flex-1" />

          <button
            onClick={() => onEdit(item)}
            title="Edit item"
            className="text-gray-400 hover:text-gray-700 transition-colors text-sm leading-none"
          >
            ✎
          </button>
          <DeleteButton item={item} onDelete={onDelete} />
        </div>
      </div>
    </div>
  )
}
