export default function CategoryFilter({ categories, active, onChange }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={`capitalize text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
            active === cat
              ? 'bg-gray-900 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}
