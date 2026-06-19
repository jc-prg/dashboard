import StatusBadge from './StatusBadge'
import ActionButton from './ActionButton'
import DeleteButton from './DeleteButton'

const CATEGORY_COLORS = {
  project: 'bg-blue-100 text-blue-700',
  server: 'bg-purple-100 text-purple-700',
  tool: 'bg-amber-100 text-amber-700',
}

export default function ItemCard({ item, onAction, onEdit, onDelete }) {
  const badgeColor = CATEGORY_COLORS[item.category] ?? 'bg-gray-100 text-gray-600'

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="font-medium text-gray-900 text-sm truncate">{item.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full w-fit font-medium capitalize ${badgeColor}`}>
            {item.category}
          </span>
        </div>
        <StatusBadge status={item.status} />
      </div>

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
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          Open →
        </a>

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
  )
}
