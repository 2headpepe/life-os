import { useState, useEffect } from 'react'
import { Star, Check, X } from 'lucide-react'
import { lists as listsApi, people as peopleApi, tree as treeApi } from '../api'

const STATUS_LABELS = { want: 'Хочу', in_progress: 'Смотрю', done: 'Готово', dropped: 'Брошено' }

function ListItem({ item, listId, onUpdate, highlighted, people }) {
  const [expanded, setExpanded] = useState(false)
  const [rating, setRating] = useState(item.rating || 0)
  const [showPeoplePicker, setShowPeoplePicker] = useState(false)

  const markDone = async (e) => {
    e.stopPropagation()
    await listsApi.update(listId, item.id, { status: 'done' })
    onUpdate()
  }

  const drop = async (e) => {
    e.stopPropagation()
    await listsApi.update(listId, item.id, { status: 'dropped' })
    onUpdate()
  }

  const schedule = async (e) => {
    e.stopPropagation()
    await treeApi.add({
      title: item.title,
      notes: `Из списка: ${listId}`,
      parent_id: 'root-leisure',
      status: 'undefined',
    })
    onUpdate()
  }

  const saveRating = async (r) => {
    setRating(r)
    await listsApi.update(listId, item.id, { rating: r })
  }

  const togglePerson = async (e, personId) => {
    e.stopPropagation()
    const current = item.with || []
    const next = current.includes(personId)
      ? current.filter(id => id !== personId)
      : [...current, personId]
    await listsApi.update(listId, item.id, { with: next })
    onUpdate()
  }

  const withPeople = (item.with || []).map(id => people.find(p => p.id === id)).filter(Boolean)

  return (
    <div
      className={`card p-4 cursor-pointer transition-all ${highlighted ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''} ${item.status !== 'want' ? 'opacity-60' : ''}`}
      onClick={() => setExpanded(v => !v)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.title}</div>
          {item.year && <div className="text-xs text-gray-400 mt-0.5">{item.year}</div>}
          <div className="flex gap-1 mt-1 flex-wrap">
            {item.tags?.filter(t => !['from-list'].includes(t)).map(t => (
              <span key={t} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded-md">{t}</span>
            ))}
            {withPeople.map(p => (
              <span key={p.id} className="text-xs bg-purple-50 dark:bg-purple-950 text-purple-500 dark:text-purple-400 px-1.5 py-0.5 rounded-md">с {p.name}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {item.status === 'done' && item.rating > 0 && (
            <span className="flex gap-px text-amber-400">{Array.from({ length: item.rating }).map((_, i) => <Star key={i} size={10} fill="currentColor" />)}</span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            item.status === 'done' ? 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400'
            : item.status === 'dropped' ? 'bg-gray-100 dark:bg-gray-800 text-gray-400'
            : item.status === 'in_progress' ? 'bg-amber-50 dark:bg-amber-950 text-amber-500'
            : 'bg-blue-50 dark:bg-blue-950 text-blue-500'
          }`}>{STATUS_LABELS[item.status] || item.status}</span>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          {item.note && <p className="text-xs text-gray-400 mb-2">{item.note}</p>}

          {/* With people */}
          <div className="mb-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-gray-400">С кем:</span>
              {withPeople.map(p => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-0.5 text-xs bg-purple-50 dark:bg-purple-950 text-purple-500 dark:text-purple-400 px-1.5 py-0.5 rounded-md"
                >
                  {p.name}
                  <button onClick={e => togglePerson(e, p.id)} className="hover:text-purple-700 dark:hover:text-purple-200 ml-0.5"><X size={10} /></button>
                </span>
              ))}
              <button
                onClick={e => { e.stopPropagation(); setShowPeoplePicker(v => !v) }}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1.5 py-0.5 rounded-md border border-dashed border-gray-200 dark:border-gray-700"
              >+ добавить</button>
            </div>
            {showPeoplePicker && (
              <div className="mt-2 flex gap-1 flex-wrap">
                {people.filter(p => !(item.with || []).includes(p.id)).map(p => (
                  <button
                    key={p.id}
                    onClick={e => { togglePerson(e, p.id); setShowPeoplePicker(false) }}
                    className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-md hover:bg-purple-50 dark:hover:bg-purple-950 hover:text-purple-500"
                  >{p.name}</button>
                ))}
              </div>
            )}
          </div>

          {(item.status === 'want' || item.status === 'in_progress') && (
            <div className="flex gap-2 flex-wrap">
              {item.status === 'want' && (
                <button onClick={async e => { e.stopPropagation(); await listsApi.update(listId, item.id, { status: 'in_progress' }); onUpdate() }} className="btn btn-ghost text-xs text-amber-500">▶ Начал</button>
              )}
              {item.status === 'want' && (
                <button onClick={schedule} className="btn btn-ghost text-xs">+ В pool</button>
              )}
              <button onClick={markDone} className="btn btn-ghost text-xs text-green-600 dark:text-green-400 flex items-center gap-1"><Check size={12} /> Готово</button>
              <button onClick={drop} className="btn btn-ghost text-xs text-gray-400">Пропустить</button>
            </div>
          )}

          {item.status === 'done' && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs text-gray-400 mr-1">Оценка:</span>
              {[1, 2, 3, 4, 5].map(r => (
                <button
                  key={r}
                  onClick={e => { e.stopPropagation(); saveRating(r) }}
                  className={`transition-colors ${r <= rating ? 'text-amber-400' : 'text-gray-200 dark:text-gray-700 hover:text-amber-300'}`}
                ><Star size={16} fill={r <= rating ? 'currentColor' : 'none'} /></button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Lists() {
  const [collections, setCollections] = useState([])
  const [collectionCounts, setCollectionCounts] = useState({})
  const [active, setActive] = useState('films')
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('want')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [highlighted, setHighlighted] = useState(null)
  const [sort, setSort] = useState('added')
  const [people, setPeople] = useState([])
  const [withFilter, setWithFilter] = useState(null)

  const refreshCounts = async (cols) => {
    const entries = await Promise.all(
      cols.map(c => listsApi.get(c.id).then(d => [c.id, (d.items || []).filter(i => i.status === 'want').length]))
    )
    setCollectionCounts(Object.fromEntries(entries))
  }

  useEffect(() => {
    listsApi.index().then(async idx => {
      const cols = idx.collections || []
      setCollections(cols)
      refreshCounts(cols)
    })
    peopleApi.all().then(p => setPeople(Array.isArray(p) ? p : [])).catch(() => {})
  }, [])

  const loadItems = async (listId) => {
    setLoading(true)
    const data = await listsApi.get(listId)
    setItems(data.items || [])
    setCollectionCounts(prev => ({ ...prev, [listId]: (data.items || []).filter(i => i.status === 'want').length }))
    setLoading(false)
  }

  useEffect(() => { loadItems(active) }, [active])

  const addItem = async () => {
    if (!newTitle.trim()) return
    await listsApi.add(active, { title: newTitle.trim() })
    setNewTitle('')
    setAdding(false)
    loadItems(active)
  }

  const randomPick = () => {
    const wantItems = items.filter(i => i.status === 'want')
    if (wantItems.length === 0) return
    const pick = wantItems[Math.floor(Math.random() * wantItems.length)]
    setHighlighted(pick.id)
    setFilter('want')
    setTimeout(() => setHighlighted(null), 3000)
  }

  const counts = Object.fromEntries(
    Object.keys(STATUS_LABELS).map(k => [k, items.filter(i => i.status === k).length])
  )

  const inProgressCount = counts['in_progress'] || 0

  const SORT_OPTIONS = [
    { id: 'added', label: 'По дате' },
    { id: 'title', label: 'По названию' },
    { id: 'year', label: 'По году' },
    ...(filter === 'done' ? [{ id: 'rating', label: 'По оценке' }] : []),
  ]

  const filtered = items
    .filter(i => i.status === filter)
    .filter(i => !withFilter || (i.with || []).includes(withFilter))
    .sort((a, b) => {
      if (sort === 'added') return new Date(b.added || 0) - new Date(a.added || 0)
      if (sort === 'title') return (a.title || '').localeCompare(b.title || '', 'ru')
      if (sort === 'year') return (b.year || 0) - (a.year || 0)
      if (sort === 'rating') return (b.rating || 0) - (a.rating || 0)
      return 0
    })

  const sortedCollections = [...collections].sort((a, b) => {
    const ca = collectionCounts[a.id] ?? 0
    const cb = collectionCounts[b.id] ?? 0
    if (ca === 0 && cb > 0) return 1
    if (cb === 0 && ca > 0) return -1
    return 0
  })

  // People who have at least one item in the current list
  const activePeople = people.filter(p =>
    items.some(i => (i.with || []).includes(p.id))
  )

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Списки</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={randomPick}
            title="Случайный выбор"
            className="btn btn-ghost text-sm"
          >🎲</button>
          <button onClick={() => setAdding(v => !v)} className="btn btn-ghost text-sm">+ Добавить</button>
        </div>
      </div>

      {/* Collection tabs */}
      <div className="flex gap-1 mb-5 flex-wrap">
        {sortedCollections.map(c => {
          const isEmpty = (collectionCounts[c.id] ?? 0) === 0 && c.id !== active
          return (
            <button
              key={c.id}
              onClick={() => { setActive(c.id); setFilter('want'); setHighlighted(null); setWithFilter(null) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active === c.id
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : isEmpty
                    ? 'text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {c.icon && <span className="mr-1">{c.icon}</span>}{c.label}
            </button>
          )
        })}
      </div>

      {/* People filter */}
      {activePeople.length > 0 && (
        <div className="flex gap-1 mb-3 flex-wrap">
          {activePeople.map(p => (
            <button
              key={p.id}
              onClick={() => setWithFilter(withFilter === p.id ? null : p.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                withFilter === p.id
                  ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                  : 'text-gray-400 hover:text-purple-500 dark:hover:text-purple-400'
              }`}
            >с {p.name}</button>
          ))}
        </div>
      )}

      {/* Status filter with counts */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <button
              key={k}
              onClick={() => { setFilter(k); setSort('added') }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                filter === k ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              {v} {counts[k] > 0 && <span className="text-gray-400">{counts[k]}</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {SORT_OPTIONS.map(o => (
            <button
              key={o.id}
              onClick={() => setSort(o.id)}
              className={`px-2 py-1 rounded-lg text-xs transition-colors ${
                sort === o.id ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400'
              }`}
            >{o.label}</button>
          ))}
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <div className="card p-3 mb-4 flex gap-2">
          <input
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            placeholder="Название..."
            className="flex-1 bg-transparent text-sm outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
          <button onClick={addItem} className="btn btn-primary text-xs">Добавить</button>
          <button onClick={() => setAdding(false)} className="btn btn-ghost text-xs">Отмена</button>
        </div>
      )}

      {loading
        ? <p className="text-sm text-gray-400">Загрузка...</p>
        : filtered.length === 0
          ? <p className="text-sm text-gray-400">Пусто</p>
          : (
            <div className="grid gap-2">
              {filtered.map(item => (
                <ListItem
                  key={item.id}
                  item={item}
                  listId={active}
                  onUpdate={() => loadItems(active)}
                  highlighted={highlighted === item.id}
                  people={people}
                />
              ))}
            </div>
          )
      }
    </div>
  )
}
