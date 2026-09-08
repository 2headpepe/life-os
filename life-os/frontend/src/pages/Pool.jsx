import { useState, useEffect } from 'react'
import { tree as treeApi } from '../api'
import NodeCard from '../components/NodeCard'

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
          items={items.filter(n => (n.status || 'undefined') === col.id)}
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
  const [allLeaves, setAllLeaves] = useState([])
  const [roots, setRoots]         = useState([])
  const [group, setGroup]         = useState('domain')
  const [filterRoot, setFilterRoot] = useState(null)
  const [statusTab, setStatusTab]   = useState('all')
  const [view, setView]             = useState('list')
  const [loading, setLoading]       = useState(true)

  const load = async () => {
    const [leaves, nodes] = await Promise.all([treeApi.leaves(), treeApi.all()])
    setAllLeaves(leaves.filter(n => n.status !== 'done' && n.status !== 'dropped' && !n.calendar_id))
    setRoots(nodes.filter(n => !n.parent_id))
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (rootFilter) setFilterRoot(rootFilter) }, [rootFilter])

  const byDomain = filterRoot
    ? allLeaves.filter(n => n.root_id === filterRoot)
    : allLeaves

  const active = statusTab === 'all'
    ? byDomain
    : byDomain.filter(n => (n.status || 'undefined') === statusTab)

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
    <div className={view === 'kanban' ? 'py-8 px-6' : 'max-w-3xl mx-auto py-8 px-6'}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Задачи</h1>
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
              onClick={() => setView('kanban')}
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
          {/* Group select (list only) */}
          {view === 'list' && (
            <select
              value={group}
              onChange={e => setGroup(e.target.value)}
              className="text-xs px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 outline-none cursor-pointer"
            >
              {GROUP_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Domain filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <button
          onClick={() => setFilterRoot(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            !filterRoot ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'
          }`}
        >
          Все ({allLeaves.length})
        </button>
        {roots.map(root => {
          const count = allLeaves.filter(n => n.root_id === root.id).length
          if (count === 0) return null
          const isActive = filterRoot === root.id
          return (
            <button
              key={root.id}
              onClick={() => setFilterRoot(isActive ? null : root.id)}
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

      {/* Status filter tabs (list only) */}
      {view === 'list' && (
        <div className="flex gap-1 mb-6 border-b border-gray-100 dark:border-gray-800">
          {STATUS_TABS.map(tab => {
            const count = tab.id === 'all'
              ? byDomain.length
              : byDomain.filter(n => (n.status || 'undefined') === tab.id).length
            if (tab.id !== 'all' && count === 0) return null
            return (
              <button
                key={tab.id}
                onClick={() => setStatusTab(tab.id)}
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
        renderGroups()
      )}
    </div>
  )
}
