import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { tree as treeApi } from '../api'
import NodeCard from '../components/NodeCard'
import { SlidersHorizontal, X } from 'lucide-react'
import { filterAndRank, parseWorkView, workViewSearch } from '../utils/workControlPlane'

const STATUS_TABS = [
  { id: 'all',         label: 'Все' },
  { id: 'undefined',   label: 'Не определено' },
  { id: 'scheduled',   label: 'Запланировано' },
  { id: 'in_progress', label: 'В работе' },
  { id: 'blocked',     label: 'Ждём' },
  { id: 'someday',     label: 'Когда-нибудь' },
]

const GROUP_OPTIONS = [
  { id: 'domain', label: 'По домену' },
  { id: 'status', label: 'По статусу' },
  { id: 'flat',   label: 'Плоский список' },
]

const STATUS_LABELS = {
  undefined:   '⚠ Не определено',
  scheduled:   '◷ Запланировано',
  in_progress: '◑ В работе',
  blocked:     '⏸ Ждём',
  someday:     '◌ Когда-нибудь',
}

const KANBAN_COLUMNS = [
  { id: 'undefined',   label: 'Не определено', color: '#EF4444' },
  { id: 'in_progress', label: 'В работе',       color: '#3B82F6' },
  { id: 'blocked',     label: 'Ждём',           color: '#F59E0B' },
  { id: 'scheduled',   label: 'Запланировано',  color: '#8B5CF6' },
  { id: 'someday',     label: 'Когда-нибудь',   color: '#6B7280' },
]

function ListGroup({ label, color, items, onUpdate }) {
  if (items.length === 0) return null
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        {color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
        <div className="section-title">{label} · {items.length}</div>
      </div>
      <div>
        {items.map(n => <NodeCard key={n.id} node={n} onUpdate={onUpdate} />)}
      </div>
    </div>
  )
}

function KanbanColumn({ id, label, color, items, onUpdate }) {
  return (
    <div className="flex-shrink-0 w-72">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
          {label}
        </span>
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-600 font-medium">
          {items.length}
        </span>
      </div>
      <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-2 min-h-24 flex flex-col gap-2">
        {items.length === 0 ? (
          <div className="text-xs text-gray-300 dark:text-gray-600 text-center py-4">пусто</div>
        ) : (
          items.map(n => <NodeCard key={n.id} node={n} onUpdate={onUpdate} row />)
        )}
      </div>
    </div>
  )
}

function KanbanBoard({ items, onUpdate }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6">
      {KANBAN_COLUMNS.map(col => (
        <KanbanColumn
          key={col.id}
          {...col}
          items={items.filter(n => col.id === 'blocked' ? n.is_blocked : !n.is_blocked && (n.status || 'undefined') === col.id)}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  )
}

function IconList() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="3" width="13" height="1.5" rx="0.75" fill="currentColor"/>
      <rect x="1" y="7" width="13" height="1.5" rx="0.75" fill="currentColor"/>
      <rect x="1" y="11" width="13" height="1.5" rx="0.75" fill="currentColor"/>
    </svg>
  )
}

function IconKanban() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="3.5" height="13" rx="1" fill="currentColor"/>
      <rect x="5.75" y="1" width="3.5" height="9" rx="1" fill="currentColor"/>
      <rect x="10.5" y="1" width="3.5" height="11" rx="1" fill="currentColor"/>
    </svg>
  )
}

export default function Pool({ sphere: rootFilter }) {
  const location = useLocation()
  const navigate = useNavigate()
  const initialView = parseWorkView(location.search)
  const [allLeaves, setAllLeaves] = useState([])
  const [roots, setRoots]         = useState([])
  const [group, setGroup]         = useState(initialView.sort === 'suggested' ? 'flat' : 'domain')
  const [viewState, setViewState] = useState(initialView)
  const [view, setView]             = useState('list')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [loading, setLoading]       = useState(true)

  const load = async () => {
    const [leaves, nodes] = await Promise.all([treeApi.leaves(), treeApi.all()])
    setAllLeaves(leaves.filter(n => n.status !== 'done' && n.status !== 'dropped' && !n.calendar_id))
    setRoots(nodes.filter(n => !n.parent_id && (n.work_context || 'personal') === viewState.context))
    setLoading(false)
  }

  useEffect(() => { load() }, [viewState.context])
  useEffect(() => {
    const next = parseWorkView(location.search)
    setViewState(next)
  }, [location.search])
  useEffect(() => {
    const search = workViewSearch(viewState)
    if (search !== location.search.slice(1)) navigate({ pathname: '/pool', search: search ? `?${search}` : '' }, { replace: true })
  }, [viewState, location.search, navigate])
  useEffect(() => { if (rootFilter) setViewState(current => ({ ...current, roots: [rootFilter] })) }, [rootFilter])

  const contextLeaves = allLeaves.filter(n => (n.work_context || 'personal') === viewState.context)
  const active = filterAndRank(contextLeaves, viewState)
  const byDomain = active
  const statusTab = viewState.statuses[0] || 'all'
  const filterRoot = viewState.roots[0] || null
  const updateView = patch => setViewState(current => ({ ...current, ...patch }))

  const renderGroups = () => {
    if (group === 'domain') {
      return roots.map(root => (
        <ListGroup
          key={root.id}
          label={root.title}
          color={root.color}
          items={active.filter(n => n.root_id === root.id)}
          onUpdate={load}
        />
      ))
    }
    if (group === 'status') {
      return Object.entries(STATUS_LABELS).map(([s, label]) => (
        <ListGroup
          key={s}
          label={label}
          items={active.filter(n => (n.status || 'undefined') === s)}
          onUpdate={load}
        />
      ))
    }
    return (
      <div>
        {active.map(n => <NodeCard key={n.id} node={n} onUpdate={load} />)}
      </div>
    )
  }

  return (
    <div className={`pool-page ${view === 'kanban' ? 'py-8 px-6' : 'max-w-3xl mx-auto py-8 px-6'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div><p className="pool-kicker">Life OS · рабочий поток</p><h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Задачи</h1></div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={`px-2.5 py-1.5 transition-colors ${
                view === 'list'
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-white dark:bg-gray-900 text-gray-400 hover:text-gray-600'
              }`}
              title="Список"
            >
              <IconList />
            </button>
            <button
            onClick={() => { setView('kanban'); setFiltersOpen(false) }}
              className={`px-2.5 py-1.5 transition-colors border-l border-gray-200 dark:border-gray-700 ${
                view === 'kanban'
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-white dark:bg-gray-900 text-gray-400 hover:text-gray-600'
              }`}
              title="Канбан"
            >
              <IconKanban />
            </button>
          </div>
          {view === 'list' && <button onClick={() => setFiltersOpen(v => !v)} aria-expanded={filtersOpen} className={`pool-filter-button ${filtersOpen ? 'is-open' : ''}`}><SlidersHorizontal size={14} />Фильтры{statusTab !== 'all' && <span>•</span>}</button>}
        </div>
      </div>

      {/* Domain filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <button
          onClick={() => updateView({ roots: [] })}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            !filterRoot ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'
          }`}
        >
          Все ({contextLeaves.length})
        </button>
        {roots.map(root => {
          const count = contextLeaves.filter(n => n.root_id === root.id).length
          if (count === 0) return null
          const isActive = filterRoot === root.id
          return (
            <button
              key={root.id}
              onClick={() => updateView({ roots: isActive ? [] : [root.id] })}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                isActive ? 'text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'
              }`}
              style={isActive ? { backgroundColor: root.color } : {}}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isActive ? 'white' : root.color }} />
              {root.title} {count}
            </button>
          )
        })}
      </div>

      {filtersOpen && <div className="pool-filter-panel space-y-2">{view === 'list' && <label>Группировка<select value={group} onChange={e => setGroup(e.target.value)}>{GROUP_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>}<label className="block text-xs text-gray-500">Контекст<select value={viewState.context} onChange={e => updateView({ context: e.target.value, roots: [], statuses: [], task: '' })}><option value="personal">Личное</option><option value="delivery">Delivery</option></select></label><label className="block text-xs text-gray-500">Поиск<input value={viewState.q} onChange={e => updateView({ q: e.target.value })} className="ml-2 rounded border px-1" /></label>{viewState.context === 'delivery' && <><label className="block text-xs text-gray-500">Исполнитель<input value={viewState.owner} onChange={e => updateView({ owner: e.target.value })} className="ml-2 rounded border px-1" /></label><label className="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={viewState.ready} onChange={e => updateView({ ready: e.target.checked })} />Только готовые</label><label className="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={viewState.sort === 'suggested'} onChange={e => updateView({ sort: e.target.checked ? 'suggested' : 'default' })} />Рекомендованный порядок</label></>}<button onClick={() => updateView({ ...parseWorkView(''), context: viewState.context })}><X size={13} />Сбросить</button></div>}
      {/* Status filter tabs are secondary controls, revealed with Filters. */}
      {view === 'list' && filtersOpen && (
        <div className="flex gap-1 mb-6 border-b border-gray-100 dark:border-gray-800">
          {STATUS_TABS.map(tab => {
            const count = tab.id === 'all'
              ? byDomain.length
              : tab.id === 'blocked' ? byDomain.filter(n => n.is_blocked).length : byDomain.filter(n => (n.status || 'undefined') === tab.id).length
            if (tab.id !== 'all' && count === 0) return null
            return (
              <button
                key={tab.id}
                onClick={() => updateView({ statuses: tab.id === 'all' ? [] : [tab.id], blocked: tab.id === 'blocked' ? true : null })}
                className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  statusTab === tab.id
                    ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                {tab.label}
                {count > 0 && <span className="ml-1.5 text-[10px] opacity-60">{count}</span>}
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Загрузка...</p>
      ) : view === 'kanban' ? (
        <KanbanBoard items={byDomain} onUpdate={load} />
      ) : active.length === 0 ? (
        <p className="text-sm text-gray-400">Нет задач</p>
      ) : (
        <>{viewState.context === 'delivery' && viewState.sort === 'suggested' && <div className="mb-4 rounded-xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-xs text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100"><b>Рекомендованный порядок</b><p className="mt-1">Это read-only подсказка: порядок объясняется готовностью, handoff и совпадением с запросом. Она не выбирает и не изменяет задачи.</p></div>}{viewState.task && <div className="mb-4 text-xs text-gray-500">Текущая задача сессии: {active.find(node => node.id === viewState.task)?.title || 'не входит в эту выборку'}. В URL может быть только одна такая задача.</div>}{renderGroups()}</>
      )}
    </div>
  )
}
