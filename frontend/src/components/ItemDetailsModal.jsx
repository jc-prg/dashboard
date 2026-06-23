import StatusBadge from './StatusBadge'
import ActionButton from './ActionButton'

function Row({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0 gap-4">
      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
      <span className="text-xs font-medium text-gray-900 dark:text-white text-right break-all">{value}</span>
    </div>
  )
}

const CATEGORY_LABELS = { project: 'Project', server: 'Server', tool: 'Tool' }
const MGMT_TYPE_LABELS = { 'ssh-server': 'SSH Server', 'ssh-compose': 'SSH Compose' }

export default function ItemDetailsModal({ item, onAction, onEdit, onClose }) {
  const mgmt = item.managementInfo

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white truncate">{item.name}</h2>
            <StatusBadge status={item.status} />
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none ml-2 shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-2 overflow-y-auto flex-1">
          <Row label="Category" value={CATEGORY_LABELS[item.category] ?? item.category} />
          {item.description && <Row label="Description" value={item.description} />}
          {item.url && (
            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 gap-4">
              <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">URL</span>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline text-right break-all"
              >
                {item.url}
              </a>
            </div>
          )}
          {item.healthCheck && <Row label="Health check" value={item.healthCheck} />}
          {item.tags?.length > 0 && (
            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 gap-4">
              <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Tags</span>
              <div className="flex flex-wrap gap-1 justify-end">
                {item.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          {item.actions?.length > 0 && (
            <Row label="Actions" value={item.actions.join(', ')} />
          )}
          {mgmt && (
            <>
              <Row label="Management" value={MGMT_TYPE_LABELS[mgmt.type] ?? mgmt.type} />
              {mgmt.type === 'ssh-server' && (
                <>
                  <Row label="Host" value={mgmt.host} />
                  <Row label="Port" value={mgmt.port !== 22 ? mgmt.port : null} />
                  <Row label="User" value={mgmt.user} />
                  <Row label="OS" value={mgmt.os} />
                </>
              )}
              {mgmt.type === 'ssh-compose' && (
                <>
                  <Row label="Server ID" value={mgmt.serverId} />
                  <Row label="Compose dir" value={mgmt.composeDir} />
                  {mgmt.composeService && <Row label="Service" value={mgmt.composeService} />}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
          {item.actions?.map((action) => (
            <ActionButton key={action} item={item} action={action} onAction={onAction} />
          ))}
          <button
            onClick={() => { onClose(); onEdit(item) }}
            className="text-sm border border-gray-300 dark:border-gray-600 dark:text-gray-300 rounded px-4 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onClose}
            className="text-sm border border-gray-300 dark:border-gray-600 dark:text-gray-300 rounded px-4 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
