import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ListTodo, Target, Inbox } from 'lucide-react'
import { search as searchApi } from '../api'
import { useSpheres } from '../SpheresContext'

const TYPE_ICON = { task: ListTodo, goal: Target, inbox: Inbox }
const TYPE_LABEL = { task: 'Задача', goal: 'Цель', inbox: 'Inbox' }
const TYPE_ROUTE = { task: '/pool', goal: '/goals', inbox: '/inbox' }

export default function GlobalSearch({ open, onClose }) {
  const { SPHERE_COLORS, SPHERE_LABELS } = useSpheres()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const ref = useRef()
  const navigate = useNavigate()

  useEffect(() => {
    if (open) { setQuery(''); setResults([]); setSelected(0); setTimeout(() => ref.current?.focus(), 50) }
  }, [open])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
      if (!open) return
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      if (e.key === 'Enter' && results[selected]) { navigate(TYPE_ROUTE[results[selected].type]); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, results, selected])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    setLoading(true)
    const t = setTimeout(() => {
      searchApi.query(query).then(data => { setResults(data.results || []); setSelected(0); setLoading(false) })
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/30 dark:bg-black/60 z-50 flex items-start justify-center pt-24" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <Search size={16} className="text-gray-400 flex-shrink-0" />
          <input
            ref={ref}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Поиск по задачам, целям, inbox..."
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none placeholder-gray-400"
          />
          {loading && <span className="text-xs text-gray-400">...</span>}
          <kbd className="text-xs text-gray-300 dark:text-gray-600">Esc</kbd>
        </div>

        {/* Results */}
        {results.length > 0 ? (
          <div className="max-h-[360px] overflow-y-auto py-2">
            {results.map((r, i) => {
              const color = SPHERE_COLORS[r.sphere] || '#6B7280'
              const Icon = TYPE_ICON[r.type]
              return (
                <button
                  key={r.id}
                  onClick={() => { navigate(TYPE_ROUTE[r.type]); onClose() }}
                  className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selected ? 'bg-gray-50 dark:bg-gray-800' : 'hover:bg-gray-50/50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  {Icon && <Icon size={14} className="flex-shrink-0 mt-0.5" style={{ color }} />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800 dark:text-gray-200 truncate">{r.title}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-gray-400">{TYPE_LABEL[r.type]}</span>
                      {r.sphere && <span className="text-xs text-gray-300 dark:text-gray-600">· {SPHERE_LABELS[r.sphere]}</span>}
                      {r.sub && <span className="text-xs text-gray-400 truncate">· {r.sub}</span>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : query && !loading ? (
          <div className="py-8 text-center text-sm text-gray-400">Ничего не найдено</div>
        ) : !query ? (
          <div className="py-6 text-center text-xs text-gray-400">Начни вводить для поиска</div>
        ) : null}

        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex justify-between text-xs text-gray-300 dark:text-gray-600">
            <span>↑↓ навигация</span>
            <span>Enter — перейти</span>
          </div>
        )}
      </div>
    </div>
  )
}
