const STYLES = {
  all:     { active: 'bg-gray-900 text-white',   inactive: 'text-gray-600 hover:bg-gray-100' },
  project: { active: 'bg-blue-600 text-white',   inactive: 'text-blue-600 hover:bg-blue-50' },
  server:  { active: 'bg-purple-600 text-white', inactive: 'text-purple-600 hover:bg-purple-50' },
  tool:    { active: 'bg-amber-500 text-white',  inactive: 'text-amber-600 hover:bg-amber-50' },
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
