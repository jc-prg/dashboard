import { useState } from 'react'
import { useItems } from '../hooks/useItems'
import { useConnectionStatus } from '../hooks/useConnectionStatus'
import ItemCard from './ItemCard'
import CategoryFilter from './CategoryFilter'
import FilterMenu from './FilterMenu'
import HeaderMenu from './HeaderMenu'
import ItemFormModal from './ItemFormModal'
import AuditLogModal from './AuditLogModal'

const CATEGORIES = ['all', 'project', 'server', 'tool']

export default function Dashboard({ token, onLogout, isDark, toggleDark }) {
  const [category, setCategory] = useState('all')
  const [filters, setFilters] = useState({ onlineOnly: false })
  const [modal, setModal] = useState(null) // null | { item: null } | { item: <item> }
  const [showLog, setShowLog] = useState(false)

  function setFilter(key, value) { setFilters(f => ({ ...f, [key]: value })) }

  const isOnline = useConnectionStatus(token)

  const {
    items, loading, error, refresh,
    triggerAction, createItem, updateItem, deleteItem,
  } = useItems(token, onLogout)

  const filtered = (category === 'all' ? items : items.filter((i) => i.category === category))
    .filter((i) => !filters.onlineOnly || i.status === 'online')
    .slice().sort((a, b) => a.name.localeCompare(b.name))

  function openAdd() { setModal({ item: null }) }
  function openEdit(item) { setModal({ item }) }
  function closeModal() { setModal(null) }

  async function handleSave(body) {
    if (modal.item) {
      await updateItem(modal.item.id, body)
    } else {
      await createItem(body)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {!isOnline && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-md">
          <span className="inline-block h-2 w-2 rounded-full bg-white opacity-80 animate-pulse" />
          Backend unreachable — retrying…
        </div>
      )}
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">jc://dashboard/</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleDark}
            title="Toggle theme"
            className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white px-1.5 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-base"
          >
            {isDark ? '☀' : '☾'}
          </button>
          <button
            onClick={refresh}
            title="Refresh"
            className="text-lg text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            ↻
          </button>
          <HeaderMenu onAddItem={openAdd} onShowLog={() => setShowLog(true)} onLogout={onLogout} />
        </div>
      </header>

      <main className="px-6 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 flex-wrap">
          <CategoryFilter categories={CATEGORIES} active={category} onChange={setCategory} />
          <FilterMenu filters={filters} onChange={setFilter} />
        </div>

        {loading && (
          <p className="text-gray-400 dark:text-gray-500 mt-10 text-center text-sm">Loading…</p>
        )}
        {error && (
          <p className="text-red-500 mt-10 text-center text-sm">Error: {error}</p>
        )}

        {!loading && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onAction={triggerAction}
                onEdit={openEdit}
                onDelete={deleteItem}
              />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && !error && (
          <div className="mt-10 text-center">
            <p className="text-gray-400 dark:text-gray-500 text-sm">No items in this category.</p>
            {category === 'all' && (
              <button
                onClick={openAdd}
                className="mt-3 text-sm text-blue-600 hover:text-blue-800"
              >
                Add your first item →
              </button>
            )}
          </div>
        )}
      </main>

      {modal !== null && (
        <ItemFormModal
          item={modal.item}
          servers={items.filter(i => i.category === 'server')}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}

      {showLog && (
        <AuditLogModal token={token} onClose={() => setShowLog(false)} />
      )}
    </div>
  )
}
