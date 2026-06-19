import { useState } from 'react'
import { useItems } from '../hooks/useItems'
import ItemCard from './ItemCard'
import CategoryFilter from './CategoryFilter'
import ItemFormModal from './ItemFormModal'

const CATEGORIES = ['all', 'project', 'server', 'tool']

export default function Dashboard({ token, onLogout }) {
  const [category, setCategory] = useState('all')
  const [modal, setModal] = useState(null) // null | { item: null } | { item: <item> }

  const {
    items, loading, error, refresh,
    triggerAction, createItem, updateItem, deleteItem,
  } = useItems(token, onLogout)

  const filtered = (category === 'all' ? items : items.filter((i) => i.category === category))
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">jc://dashboard/</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={refresh}
            title="Refresh"
            className="text-lg text-gray-500 hover:text-gray-800 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors"
          >
            ↻
          </button>
          <button
            onClick={openAdd}
            className="text-sm bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 transition-colors"
          >
            + Add item
          </button>
          <button
            onClick={onLogout}
            className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="px-6 py-6 max-w-7xl mx-auto">
        <CategoryFilter categories={CATEGORIES} active={category} onChange={setCategory} />

        {loading && (
          <p className="text-gray-400 mt-10 text-center text-sm">Loading…</p>
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
            <p className="text-gray-400 text-sm">No items in this category.</p>
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
    </div>
  )
}
