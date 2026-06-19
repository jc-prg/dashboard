const STYLES = {
  all:     { active: 'bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white',   inactive: 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700' },
  project: { active: 'bg-blue-600 text-white',   inactive: 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950' },
  server:  { active: 'bg-purple-600 text-white', inactive: 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950' },
  tool:    { active: 'bg-amber-500 text-white',  inactive: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950' },
}

export default function CategoryFilter({ categories, active, onChange }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {categories.map((cat) => {
        const s = STYLES[cat] ?? STYLES.all
        return (
          <button
            key={cat}
            onClick={() => onChange(cat)}
            className={`capitalize text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
              active === cat ? s.active : s.inactive
            }`}
          >
            {cat}
          </button>
        )
      })}
    </div>
  )
}
