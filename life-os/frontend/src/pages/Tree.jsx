import { useState, useEffect, useLayoutEffect, useCallback, useRef, Fragment } from 'react'
import { Circle, Clock, CircleDot, CheckCircle2, CircleDashed, CircleMinus, Lock,
         ChevronDown, ChevronRight, Sparkles, Plus, X, AlignJustify } from 'lucide-react'
import { tree as treeApi, habits as habitsApi } from '../api'
import { openInConsole } from '../utils/openInConsole'

// ── Utilities ────────────────────────────────────────────────────────────────

function formatDue(dueStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(dueStr + 'T00:00:00')
  const diff = Math.round((due - today) / 86400000)
  if (diff === 0) return 'сегодня'
  if (diff === 1) return 'завтра'
  if (diff === -1) return 'вчера'
  if (diff > 1 && diff < 7) return due.toLocaleDateString('ru-RU', { weekday: 'short' })
  return dueStr.slice(5).replace('-', '.')
}

function buildTree(nodes) {
  const map = {}
  nodes.forEach(n => (map[n.id] = { ...n, children: [] }))
  const roots = []
  nodes.forEach(n => {
    if (n.parent_id && map[n.parent_id]) map[n.parent_id].children.push(map[n.id])
    else if (!n.parent_id) roots.push(map[n.id])
  })
  function propagateColor(node, color) {
    node.root_color = color
    node.children.forEach(c => propagateColor(c, color))
  }
  const sort = node => {
    node.children.sort((a, b) => {
      const at = a.status === 'done' || a.status === 'dropped'
      const bt = b.status === 'done' || b.status === 'dropped'
      if (at && !bt) return 1; if (!at && bt) return -1
      return (a.created || '').localeCompare(b.created || '')
    })
    node.children.forEach(sort)
  }
  roots.forEach(r => { propagateColor(r, r.color || '#6B7280'); sort(r) })
  return roots
}

function leafStats(node, nodesMap) {
  if (node.status === 'done' || node.status === 'dropped') {
    return { total: 1, done: 1, undef: 0 }
  }
  if (node.children.length === 0) {
    const blocked = (node.blocked_by?.length > 0) &&
      node.blocked_by.some(bid => nodesMap[bid]?.status !== 'done')
    return {
      total: 1,
      done: 0,
      undef: !blocked && (node.status === 'undefined' || !node.status) ? 1 : 0,
    }
  }
  return node.children.reduce(
    (acc, c) => { const s = leafStats(c, nodesMap); return { total: acc.total + s.total, done: acc.done + s.done, undef: acc.undef + s.undef } },
    { total: 0, done: 0, undef: 0 }
  )
}

function findInTree(nodeList, id) {
  for (const n of nodeList) {
    if (n.id === id) return n
    const found = findInTree(n.children, id)
    if (found) return found
  }
  return null
}

function collectOpenLeaves(node) {
  if (node.children.length === 0) return node.status !== 'done' && node.status !== 'dropped' ? [node] : []
  return node.children.flatMap(collectOpenLeaves)
}

// ── Config ───────────────────────────────────────────────────────────────────

const PRESET_COLORS = ['#3B82F6','#22C55E','#EF4444','#06B6D4','#EC4899','#EAB308','#F97316','#14B8A6','#A855F7','#6B7280']

const STATUS_CFG = {
  undefined:   { Icon: Circle,       cls: 'text-red-400',   label: 'Не определено' },
  scheduled:   { Icon: Clock,        cls: 'text-blue-400',  label: 'Запланировано' },
  in_progress: { Icon: CircleDot,    cls: 'text-amber-400', label: 'В работе' },
  done:        { Icon: CheckCircle2, cls: 'text-green-400', label: 'Готово' },
  someday:     { Icon: CircleDashed, cls: 'text-gray-400',  label: 'Когда-нибудь' },
  dropped:     { Icon: CircleMinus,  cls: 'text-gray-300',  label: 'Отменено' },
}

const LEAF_STATUSES = ['undefined', 'scheduled', 'in_progress', 'done', 'someday', 'dropped']
const NODE_STATUSES = ['done', 'someday', 'dropped']

// ── Shared sub-components ────────────────────────────────────────────────────

function useClickOutside(ref, handler) {
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) handler() }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [ref, handler])
}

function StatusPicker({ current, isLeaf, onSelect, onClose }) {
  const ref = useRef(null)
  const [openUp, setOpenUp] = useState(false)
  const [visible, setVisible] = useState(false)
  useClickOutside(ref, onClose)
  useLayoutEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      if (rect.bottom > window.innerHeight - 8) setOpenUp(true)
      setVisible(true)
    }
  }, [])
  return (
    <div ref={ref} className={`absolute left-0 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-1 min-w-[168px] ${openUp ? 'bottom-7' : 'top-7'} ${visible ? '' : 'invisible'}`}>
      {(isLeaf ? LEAF_STATUSES : NODE_STATUSES).map(s => {
        const { Icon, cls, label } = STATUS_CFG[s]
        return (
          <button key={s} onClick={() => { onSelect(s); onClose() }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50 dark:hover:bg-gray-800 text-left ${s === current ? 'font-semibold' : ''}`}>
            <Icon size={12} className={cls} />
            <span className="text-gray-700 dark:text-gray-300">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

function AddChildInput({ onAdd, onCancel, placeholder = 'Название...' }) {
  const [title, setTitle] = useState('')
  return (
    <div className="flex gap-2 items-center" onClick={e => e.stopPropagation()}>
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && title.trim()) onAdd(title.trim()); if (e.key === 'Escape') onCancel() }}
        placeholder={placeholder}
        className="flex-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 outline-none text-gray-700 dark:text-gray-300"
      />
      <button onClick={() => title.trim() && onAdd(title.trim())}
        className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 flex-shrink-0">+</button>
      <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X size={14} /></button>
    </div>
  )
}

function EditField({ value, onSave, placeholder, multiline, className = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const ref = useRef()
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  useEffect(() => { if (!editing) setDraft(value || '') }, [value, editing])
  const commit = () => { setEditing(false); if (draft !== (value || '')) onSave(draft || null) }
  const cancel = () => { setEditing(false); setDraft(value || '') }
  if (!editing) return (
    <span onClick={() => setEditing(true)}
      className={`cursor-text hover:bg-gray-50 dark:hover:bg-gray-800/60 rounded px-0.5 -mx-0.5 transition-colors whitespace-pre-wrap ${!value ? 'text-gray-300 dark:text-gray-600 italic' : ''} ${className}`}>
      {value || placeholder}
    </span>
  )
  if (multiline) return (
    <textarea ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Escape') cancel() }}
      placeholder={placeholder} rows={2}
      className={`w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 outline-none resize-none text-xs ${className}`}
    />
  )
  return (
    <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
      placeholder={placeholder}
      className={`w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1 outline-none text-xs ${className}`}
    />
  )
}

function UnlockToast({ items, onDismiss, leaving }) {
  return (
    <div className={`flex items-start gap-3 bg-white dark:bg-gray-900 border border-green-200 dark:border-green-700 rounded-2xl shadow-xl px-4 py-3 max-w-[280px] ${leaving ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}>
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center text-base mt-0.5">🔓</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">
          {items.length === 1 ? 'Задача разблокирована' : `${items.length} задачи разблокированы`}
        </div>
        {items.map(item => <div key={item.id} className="text-xs text-gray-700 dark:text-gray-300 truncate">{item.title}</div>)}
      </div>
      <button onClick={onDismiss} className="flex-shrink-0 text-gray-300 hover:text-gray-500 text-base leading-none mt-0.5">×</button>
    </div>
  )
}

// ── Overview card (sphere level) ─────────────────────────────────────────────

function OverviewCard({ node, nodesMap, onEnter, onUpdate }) {
  const [showColors, setShowColors] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(node.title)
  const color = node.color || '#6B7280'
  const stats = leafStats(node, nodesMap)
  const pct = stats.total > 0 ? Math.round(stats.done / stats.total * 100) : 0

  const handleTitleSave = async () => {
    const v = titleDraft.trim()
    if (v && v !== node.title) await treeApi.update(node.id, { title: v })
    setEditingTitle(false)
    onUpdate()
  }

  return (
    <div
      className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 overflow-hidden transition-colors cursor-pointer"
      onClick={() => !editingTitle && !showColors && onEnter(node.id)}
    >
      <div className="flex">
        <div className="w-1 flex-shrink-0" style={{ backgroundColor: color }} />
        <div className="flex-1 px-5 py-4 min-w-0">
          <div className="flex items-center gap-3">
            {/* Color dot */}
            <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowColors(v => !v)}
                className="w-3 h-3 rounded-full hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 dark:hover:ring-gray-600"
                style={{ backgroundColor: color }} />
              {showColors && (
                <div className="absolute left-0 top-5 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-2 flex flex-wrap gap-1.5 w-28">
                  {PRESET_COLORS.map(c => (
                    <button key={c}
                      onClick={() => { treeApi.update(node.id, { color: c }); setShowColors(false); onUpdate() }}
                      className="w-5 h-5 rounded-full hover:ring-2 hover:ring-offset-1 hover:ring-gray-400"
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              )}
            </div>

            {/* Title */}
            <div className="flex-1 min-w-0">
              {editingTitle ? (
                <input autoFocus value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={e => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') { setEditingTitle(false); setTitleDraft(node.title) } }}
                  className="w-full text-base font-semibold bg-transparent border-b border-gray-300 dark:border-gray-600 outline-none text-gray-900 dark:text-gray-100"
                />
              ) : (
                <span className="font-semibold text-base text-gray-900 dark:text-gray-100 truncate block"
                  onDoubleClick={e => { e.stopPropagation(); setEditingTitle(true) }}>
                  {node.title}
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {stats.undef > 0 && <span className="text-xs text-red-400 font-medium">{stats.undef} ⚠</span>}
              {stats.total > 0 && (
                <>
                  <div className="w-24 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-xs text-gray-400 tabular-nums">{stats.done}/{stats.total}</span>
                </>
              )}
              <ChevronRight size={15} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
            </div>
          </div>

          {node.outcome && (
            <p className="text-xs text-gray-400 mt-1.5 italic truncate">→ {node.outcome}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Outliner row (inside drill-down) ─────────────────────────────────────────

function OutlinerRow({ node, depth, rootColor, nodesMap, allNodes, onUpdate, onUnblock, onZoom, hideDone }) {
  const [expanded, setExpanded] = useState(depth === 0)
  const [adding, setAdding] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [editingTitle, setEditTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(node.title)
  const [editingDue, setEditingDue] = useState(false)
  const [editingReviewBy, setEditingReviewBy] = useState(false)

  const isLeaf = node.children.length === 0
  const isDone = node.status === 'done'
  const isDropped = node.status === 'dropped'
  if (hideDone && (isDone || isDropped)) return null
  const isSomeday = node.status === 'someday'
  const isBlocked = isLeaf && (node.blocked_by?.length > 0) &&
    node.blocked_by.some(bid => nodesMap[bid]?.status !== 'done')
  const stats = leafStats(node, nodesMap)
  const pct = stats.total > 0 ? Math.round(stats.done / stats.total * 100) : 0
  const today = new Date().toISOString().slice(0, 10)
  const isOverdue = node.due && node.due < today
  const _statusCfg = STATUS_CFG[node.status || 'undefined'] || STATUS_CFG.undefined
  const statusCls = (!isLeaf && (!node.status || node.status === 'undefined') && stats.undef === 0) ? 'text-gray-300 dark:text-gray-600' : _statusCfg.cls
  const StatusIcon = _statusCfg.Icon

  const handleStatus = async s => {
    if (s === 'done') {
      const newlyUnblocked = allNodes.filter(n =>
        n.id !== node.id &&
        (n.blocked_by || []).includes(node.id) &&
        (n.blocked_by || []).every(bid => bid === node.id || nodesMap[bid]?.status === 'done')
      )
      if (newlyUnblocked.length > 0) onUnblock(newlyUnblocked)
    }
    await treeApi.update(node.id, { status: s })
    if (s === 'scheduled') setEditingDue(true)
    if (s === 'someday') setEditingReviewBy(true)
    onUpdate()
  }

  const handleTitleSave = async () => {
    const v = titleDraft.trim()
    if (v && v !== node.title) await treeApi.update(node.id, { title: v })
    setEditTitle(false)
    onUpdate()
  }

  const handleDueSave = async val => {
    await treeApi.update(node.id, { due: val || null })
    setEditingDue(false)
    onUpdate()
  }

  const handleDelete = async e => {
    e.stopPropagation()
    const label = node.children.length > 0 ? `"${node.title}" и ${node.children.length} подузлов` : `"${node.title}"`
    if (!window.confirm(`Удалить ${label}?`)) return
    await treeApi.delete(node.id)
    onUpdate()
  }

  const consolePrompt = (() => {
    const lines = [`Цель: "${node.title}"`]
    if (node.outcome) lines.push(`Результат: ${node.outcome}`)
    if (node.notes) lines.push(`Заметки: ${node.notes}`)
    const leaves = collectOpenLeaves(node)
    const undef = leaves.filter(l => !l.status || l.status === 'undefined')
    const active = leaves.filter(l => l.status === 'in_progress' || l.status === 'scheduled')
    if (undef.length) lines.push(`Не определено (${undef.length}): ${undef.map(l => l.title).join(', ')}`)
    if (active.length) lines.push(`В работе (${active.length}): ${active.map(l => l.title).join(', ')}`)
    lines.push('\nПроверь декомпозицию: все ли важные аспекты цели покрыты?')
    return lines.join('\n')
  })()

  const pl = 12 + depth * 20

  return (
    <div className={isDone || isDropped ? 'opacity-40' : ''}>
      <div
        className={`group flex items-center gap-1.5 py-1.5 rounded-lg transition-colors ${
          isLeaf && (node.status === 'undefined' || !node.status) && !isBlocked
            ? 'hover:bg-red-50/50 dark:hover:bg-red-950/10'
            : 'hover:bg-gray-50 dark:hover:bg-gray-900/40'
        }`}
        style={{ paddingLeft: pl, paddingRight: 8 }}
      >
        {/* Status icon */}
        <div className="relative flex-shrink-0">
          {isLeaf && isBlocked
            ? <Lock size={13} className="text-gray-400" />
            : (
              <button onClick={e => { e.stopPropagation(); setShowStatus(v => !v) }}
                className={`flex items-center justify-center ${statusCls}`}>
                <StatusIcon size={13} />
              </button>
            )
          }
          {showStatus && (
            <StatusPicker current={node.status} isLeaf={isLeaf} onSelect={handleStatus} onClose={() => setShowStatus(false)} />
          )}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input autoFocus value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={e => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') { setEditTitle(false); setTitleDraft(node.title) } }}
              onClick={e => e.stopPropagation()}
              className="w-full text-sm bg-transparent border-b border-gray-300 dark:border-gray-600 outline-none text-gray-800 dark:text-gray-200"
            />
          ) : (
            <span
              onClick={!isLeaf ? () => setExpanded(v => !v) : undefined}
              onDoubleClick={() => { setEditTitle(true); setTitleDraft(node.title) }}
              className={`text-sm block truncate ${!isLeaf ? 'cursor-pointer' : ''} ${
                depth === 0 ? 'font-medium text-gray-800 dark:text-gray-200'
                : isSomeday ? 'italic text-gray-400 dark:text-gray-600'
                : 'text-gray-600 dark:text-gray-400'
              } ${isDone ? 'line-through' : ''}`}
            >
              {node.title}
            </span>
          )}
        </div>

        {/* Right: progress or date */}
        {!isLeaf && stats.total > 0 && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {stats.undef > 0 && <span className="text-[11px] text-red-400">{stats.undef}⚠</span>}
            <div className="w-14 h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: rootColor }} />
            </div>
            <span className="text-[11px] text-gray-400 tabular-nums w-8 text-right">{stats.done}/{stats.total}</span>
          </div>
        )}

        {isLeaf && !isSomeday && (
          <div className="flex-shrink-0">
            {editingDue ? (
              <input autoFocus type="date" defaultValue={node.due || ''}
                onBlur={e => handleDueSave(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleDueSave(e.target.value); if (e.key === 'Escape') setEditingDue(false) }}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded px-1 py-0.5 bg-white dark:bg-gray-900 outline-none"
              />
            ) : node.due ? (
              <button onClick={e => { e.stopPropagation(); setEditingDue(true) }}
                className={`text-xs tabular-nums ${isOverdue ? 'text-red-400' : 'text-gray-400'} hover:text-blue-500`}>
                {formatDue(node.due)}
              </button>
            ) : node.status === 'scheduled' ? (
              <button onClick={e => { e.stopPropagation(); setEditingDue(true) }} className="text-xs text-blue-400 hover:text-blue-500">
                + дата
              </button>
            ) : null}
          </div>
        )}

        {isLeaf && isSomeday && (
          <div className="flex-shrink-0">
            {editingReviewBy ? (
              <input autoFocus type="date" defaultValue={node.review_by || ''}
                onBlur={async e => { await treeApi.update(node.id, { review_by: e.target.value || null }); setEditingReviewBy(false); onUpdate() }}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingReviewBy(false) }}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded px-1 py-0.5 bg-white dark:bg-gray-900 outline-none"
              />
            ) : node.review_by ? (
              <button onClick={e => { e.stopPropagation(); setEditingReviewBy(true) }} className="text-xs text-gray-400 hover:text-purple-500 tabular-nums">↻ {formatDue(node.review_by)}</button>
            ) : (
              <button onClick={e => { e.stopPropagation(); setEditingReviewBy(true) }} className="text-xs text-gray-300 dark:text-gray-600 hover:text-purple-400">↻ дата</button>
            )}
          </div>
        )}

        {/* Expand chevron for non-leaf */}
        {!isLeaf && (
          <button onClick={() => setExpanded(v => !v)}
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-300 dark:text-gray-600 hover:text-gray-500 rounded">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        )}

        {/* Hover actions */}
        <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0 ml-1">
          {!isLeaf && (
            <button onClick={e => { e.stopPropagation(); onZoom(node.id) }} title="Войти"
              className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-indigo-400 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
              <ChevronRight size={12} />
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); setShowDetail(v => !v) }} title="Детали"
            className={`w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 ${showDetail ? 'text-blue-400' : 'text-gray-300 hover:text-gray-500'}`}>
            <AlignJustify size={12} />
          </button>
          <button onClick={e => { e.stopPropagation(); setAdding(true); setExpanded(true) }} title="Добавить"
            className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-gray-600 dark:hover:text-gray-400 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <Plus size={12} />
          </button>
          <button onClick={e => { e.stopPropagation(); openInConsole(consolePrompt) }} title="Claude"
            className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-blue-400 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <Sparkles size={12} />
          </button>
          <button onClick={handleDelete} title="Удалить"
            className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Detail panel */}
      {showDetail && (
        <div className="mb-1 px-3 py-2.5 bg-gray-50 dark:bg-gray-900/60 rounded-lg border border-gray-100 dark:border-gray-800 space-y-2"
          style={{ marginLeft: pl + 20, marginRight: 8 }}>
          <div>
            <div className="text-xs text-gray-400 mb-0.5">Результат</div>
            <EditField value={node.outcome}
              onSave={v => { treeApi.update(node.id, { outcome: v }); onUpdate() }}
              placeholder="Что будет, когда сделано..."
              className="text-xs text-gray-600 dark:text-gray-400"
            />
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-0.5">Заметки</div>
            <EditField value={node.notes}
              onSave={v => { treeApi.update(node.id, { notes: v }); onUpdate() }}
              placeholder="Контекст, детали..."
              multiline
              className="text-xs text-gray-600 dark:text-gray-400"
            />
          </div>
        </div>
      )}

      {/* Children */}
      {expanded && (
        <div>
          {node.children.map(child => (
            <OutlinerRow key={child.id} node={child} depth={depth + 1} rootColor={rootColor}
              nodesMap={nodesMap} allNodes={allNodes} onUpdate={onUpdate}
              onUnblock={onUnblock} onZoom={onZoom} hideDone={hideDone} />
          ))}
          {adding && (
            <div style={{ paddingLeft: pl + 20, paddingRight: 8 }} className="py-1">
              <AddChildInput onAdd={async title => {
                await treeApi.add({ title, parent_id: node.id, status: 'undefined' })
                setAdding(false)
                onUpdate()
              }} onCancel={() => setAdding(false)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Tree component ───────────────────────────────────────────────────────

export default function Tree() {
  const [nodes, setNodes] = useState([])
  const [habitList, setHabitList] = useState([])
  const [loading, setLoading] = useState(true)
  const [focusPath, setFocusPath] = useState([])
  const [toasts, setToasts] = useState([])
  const [addingRoot, setAddRoot] = useState(false)
  const [addingAtBottom, setAddingAtBottom] = useState(false)
  const [hideDone, setHideDone] = useState(true)

  const addToast = useCallback(items => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, items, leaving: false }])
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t))
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 250)
    }, 3500)
  }, [])

  const dismissToast = useCallback(id => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 250)
  }, [])

  const load = useCallback(async () => {
    const [data, defs] = await Promise.all([treeApi.all(), habitsApi.definitions()])
    setNodes(data)
    setHabitList((defs.categories || []).flatMap(c => c.habits || []).filter(h => h.node_id))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const nodesMap = Object.fromEntries(nodes.map(n => [n.id, n]))
  const roots = buildTree(nodes)

  const focusNodeId = focusPath[focusPath.length - 1] || null
  const focusNode = focusNodeId ? findInTree(roots, focusNodeId) : null
  const displayNodes = focusNode ? focusNode.children : roots
  const rootColor = focusNode?.root_color || '#6B7280'
  const breadcrumb = focusPath.map(id => nodesMap[id]).filter(Boolean)

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Загрузка...</div>

  return (
    <>
      <div className="max-w-3xl mx-auto py-8 px-6">

        {/* Header / Breadcrumb */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="min-w-0">
          {focusPath.length === 0 ? (
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Цели</h1>
          ) : (
            <nav className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => setFocusPath([])}
                className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                Цели
              </button>
              {breadcrumb.map((n, i) => (
                <Fragment key={n.id}>
                  <span className="text-gray-300 dark:text-gray-600 text-sm select-none">/</span>
                  {i < breadcrumb.length - 1 ? (
                    <button onClick={() => setFocusPath(focusPath.slice(0, i + 1))}
                      className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                      {n.title}
                    </button>
                  ) : (
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{n.title}</span>
                  )}
                </Fragment>
              ))}
            </nav>
          )}
          </div>
          <button
            onClick={() => setHideDone(v => !v)}
            className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-lg transition-colors ${
              hideDone
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
            }`}
          >
            {hideDone ? 'показать выполненные' : 'скрыть выполненные'}
          </button>
        </div>

        {/* Depth warning — trees get unwieldy past ~6 levels */}
        {focusPath.length >= 6 && (
          <div className="mb-4 flex items-center gap-1.5 text-xs text-amber-500">
            <span>⚠</span>
            <span>Глубина {focusPath.length} уровней — ветка усложняется, возможно стоит упростить.</span>
          </div>
        )}

        {/* Overview */}
        {focusPath.length === 0 && (
          <div className="space-y-3">
            {roots.map(root => (
              <OverviewCard key={root.id} node={root} nodesMap={nodesMap}
                onEnter={id => setFocusPath([id])} onUpdate={load} />
            ))}
            {addingRoot ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 px-4 py-3">
                <AddChildInput placeholder="Название области (Здоровье, Финансы...)..." onAdd={async title => {
                  await treeApi.add({ title, parent_id: null, status: null, color: '#6B7280' })
                  setAddRoot(false)
                  load()
                }} onCancel={() => setAddRoot(false)} />
              </div>
            ) : (
              <button onClick={() => setAddRoot(true)}
                className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors px-1 py-1">
                + новая область
              </button>
            )}
          </div>
        )}

        {/* Drill-down */}
        {focusPath.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
            {/* Focus node header */}
            {focusNode && (() => {
              const s = leafStats(focusNode, nodesMap)
              const pct = s.total > 0 ? Math.round(s.done / s.total * 100) : 0
              return (
                <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: rootColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-base text-gray-900 dark:text-gray-100 truncate">{focusNode.title}</div>
                    {focusNode.outcome && (
                      <div className="text-xs text-gray-400 mt-0.5 italic truncate">→ {focusNode.outcome}</div>
                    )}
                    {(() => {
                      const driving = habitList.filter(h => h.node_id === focusNode.id)
                      return driving.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          <span className="text-[10px] uppercase tracking-wider text-gray-400">привычки</span>
                          {driving.map(h => (
                            <span key={h.id} className="text-xs px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-500">{h.label}</span>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                  {s.total > 0 && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {s.undef > 0 && <span className="text-xs text-red-400">{s.undef} ⚠</span>}
                      <div className="w-24 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: rootColor }} />
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums">{s.done}/{s.total}</span>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Outliner */}
            <div className="py-1">
              {displayNodes.length === 0 && !addingAtBottom && (
                <p className="text-sm text-gray-400 px-5 py-4">Нет элементов</p>
              )}
              {displayNodes.map(node => (
                <OutlinerRow key={node.id} node={node} depth={0} rootColor={rootColor}
                  nodesMap={nodesMap} allNodes={nodes} onUpdate={load}
                  onUnblock={addToast} onZoom={id => setFocusPath(prev => [...prev, id])}
                  hideDone={hideDone} />
              ))}
              {addingAtBottom ? (
                <div className="px-4 py-2">
                  <AddChildInput onAdd={async title => {
                    await treeApi.add({ title, parent_id: focusNodeId, status: 'undefined' })
                    setAddingAtBottom(false)
                    load()
                  }} onCancel={() => setAddingAtBottom(false)} />
                </div>
              ) : (
                <button onClick={() => setAddingAtBottom(true)}
                  className="w-full text-left text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-5 py-2.5 transition-colors">
                  + добавить
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end">
          {toasts.map(t => (
            <UnlockToast key={t.id} items={t.items} leaving={t.leaving} onDismiss={() => dismissToast(t.id)} />
          ))}
        </div>
      )}
    </>
  )
}
