import { useState, useEffect, useLayoutEffect, useCallback, useRef, Fragment } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Circle, Clock, CircleDot, CheckCircle2, CircleDashed, CircleMinus, Lock,
         ChevronDown, ChevronRight, Sparkles, Plus, X, AlignJustify } from 'lucide-react'
import { tree as treeApi, habits as habitsApi, productIntelligence } from '../api'
import { openInConsole } from '../utils/openInConsole'
import { legacyNodePath, nodeLineage, nodePath, resolveNodePath } from '../utils/entityLinks'

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

function parentPath(nodes, nodeId) {
  const byId = Object.fromEntries(nodes.map(node => [node.id, node]))
  const path = []
  let node = byId[nodeId]
  while (node) {
    path.unshift(node.id)
    node = node.parent_id ? byId[node.parent_id] : null
  }
  return path.slice(0, -1)
}

// ── Config ───────────────────────────────────────────────────────────────────

const PRESET_COLORS = ['#3B82F6','#22C55E','#EF4444','#06B6D4','#EC4899','#EAB308','#F97316','#14B8A6','#A855F7','#6B7280']

const STATUS_CFG = {
  undefined:   { Icon: Circle,       cls: 'text-red-400',   label: 'Не определено' },
  scheduled:   { Icon: Clock,        cls: 'text-blue-400',  label: 'Запланировано' },
  needs_grooming: { Icon: Sparkles,  cls: 'text-violet-400', label: 'Требует проработки' },
  backlog:     { Icon: CircleDashed, cls: 'text-slate-400', label: 'Бэклог' },
  ready:       { Icon: Circle,       cls: 'text-cyan-500', label: 'Готово к старту' },
  in_progress: { Icon: CircleDot,    cls: 'text-amber-400', label: 'В работе' },
  waiting_for_review: { Icon: Clock, cls: 'text-fuchsia-500', label: 'На проверке' },
  done:        { Icon: CheckCircle2, cls: 'text-green-400', label: 'Готово' },
  someday:     { Icon: CircleDashed, cls: 'text-gray-400',  label: 'Когда-нибудь' },
  dropped:     { Icon: CircleMinus,  cls: 'text-gray-300',  label: 'Отменено' },
}

const LEAF_STATUSES = ['undefined', 'needs_grooming', 'backlog', 'ready', 'scheduled', 'in_progress', 'waiting_for_review', 'done', 'someday', 'dropped']
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
      className="goals-overview-card group bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 overflow-hidden transition-colors cursor-pointer"
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

// ── Delivery preparation ────────────────────────────────────────────────────

const HANDOFF_FIELDS = [
  ['target_role', 'Кому передать работу', 'Какая роль или компетенция нужна'],
  ['requested_result', 'Ожидаемый результат', 'Что именно должно быть готово'],
  ['scope', 'Границы работы', 'Что входит в эту задачу'],
  ['non_goals', 'Не делать', 'Что сознательно остаётся за пределами'],
  ['output_format', 'Формат результата', 'Например: проверенный список, изменение интерфейса, отчёт'],
  ['verifier_role', 'Кто проверит', 'Роль независимого проверяющего'],
]

function contractDraft(contract = {}) {
  const lines = value => Array.isArray(value) ? value : value ? [String(value)] : []
  return {
    target_role: contract.target_role || '',
    requested_result: contract.requested_result || '',
    input_refs: lines(contract.input_refs).join('\n'),
    scope: contract.scope || '',
    non_goals: contract.non_goals || '',
    output_format: contract.output_format || '',
    acceptance_criteria: lines(contract.acceptance_criteria).join('\n'),
    verifier_role: contract.verifier_role || '',
  }
}

function DeliveryTaskDialog({ node, nodesMap, onUpdate, initialView = 'prepare', onClose }) {
  const [contract, setContract] = useState(() => contractDraft(node.handoff_contract))
  const [dependency, setDependency] = useState({ title: '', outcome: '' })
  const [existingDependencies, setExistingDependencies] = useState([])
  const [selectedExistingDependency, setSelectedExistingDependency] = useState('')
  const [execution, setExecution] = useState(() => ({
    actor: node.execution?.actor || 'life-os-delivery-executor',
    verifier: node.verification?.verified_by || 'life-os-independent-verifier',
    evidence: (node.verification?.evidence_refs || []).join('\n'),
    note: node.verification?.note || '',
  }))
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [loadingExistingDependencies, setLoadingExistingDependencies] = useState(false)
  const [linkingExistingDependency, setLinkingExistingDependency] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [message, setMessage] = useState(null)
  const [activeView, setActiveView] = useState(initialView)

  useEffect(() => setContract(contractDraft(node.handoff_contract)), [node.handoff_contract])
  useEffect(() => setExecution({
    actor: node.execution?.actor || 'life-os-delivery-executor',
    verifier: node.verification?.verified_by || 'life-os-independent-verifier',
    evidence: (node.verification?.evidence_refs || []).join('\n'),
    note: node.verification?.note || '',
  }), [node.execution, node.verification])

  useEffect(() => {
    let cancelled = false
    if (activeView !== 'dependency') return undefined
    setLoadingExistingDependencies(true)
    treeApi.eligibleExistingDependencies(node.id)
      .then(result => {
        if (!cancelled) {
          setExistingDependencies(result.candidates || [])
          setSelectedExistingDependency('')
        }
      })
      .catch(error => {
        if (!cancelled) setMessage({ type: 'error', text: error.message || 'Не удалось загрузить доступные зависимости.' })
      })
      .finally(() => { if (!cancelled) setLoadingExistingDependencies(false) })
    return () => { cancelled = true }
  }, [activeView, node.id])

  const blockers = (node.blocked_by || []).map(id => nodesMap[id]).filter(Boolean)
  const setField = (field, value) => setContract(current => ({ ...current, [field]: value }))
  const lines = value => value.split('\n').map(line => line.trim()).filter(Boolean)

  const saveContract = async e => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      await treeApi.saveHandoff(node.id, {
        ...contract,
        input_refs: lines(contract.input_refs),
        acceptance_criteria: lines(contract.acceptance_criteria),
      })
      setMessage({ type: 'success', text: 'Подготовка сохранена. Задача теперь находится в очереди.' })
      await onUpdate()
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Не удалось сохранить подготовку.' })
    } finally {
      setSaving(false)
    }
  }

  const createDependency = async e => {
    e.preventDefault()
    setCreating(true)
    setMessage(null)
    try {
      await treeApi.createDependency(node.id, dependency)
      setDependency({ title: '', outcome: '' })
      setMessage({ type: 'success', text: 'Зависимая задача создана и теперь блокирует эту работу.' })
      await onUpdate()
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Не удалось создать зависимую задачу.' })
    } finally {
      setCreating(false)
    }
  }

  const linkExistingDependency = async e => {
    e.preventDefault()
    if (!selectedExistingDependency) return
    setLinkingExistingDependency(true)
    setMessage(null)
    try {
      const result = await treeApi.linkExistingDependency(node.id, selectedExistingDependency)
      setMessage({ type: 'success', text: result.idempotent ? 'Эта зависимость уже была связана.' : 'Существующая задача теперь блокирует эту работу.' })
      setSelectedExistingDependency('')
      await onUpdate()
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Не удалось связать существующую зависимость.' })
    } finally {
      setLinkingExistingDependency(false)
    }
  }

  const transition = async status => {
    setTransitioning(true)
    setMessage(null)
    try {
      const executionPatch = status === 'in_progress' || status === 'waiting_for_review'
        ? {
            actor: execution.actor.trim(),
            started_at: node.execution?.started_at || new Date().toISOString(),
            handed_off_at: status === 'waiting_for_review' ? new Date().toISOString() : node.execution?.handed_off_at || null,
          }
        : undefined
      await treeApi.update(node.id, { status, ...(executionPatch ? { execution: executionPatch } : {}) }, 'task_progress')
      setMessage({ type: 'success', text: status === 'in_progress' ? 'Исполнитель назначен, задача начата.' : status === 'waiting_for_review' ? 'Работа передана на независимую проверку.' : 'Статус задачи обновлён.' })
      await onUpdate()
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Не удалось изменить статус delivery-задачи.' })
    } finally {
      setTransitioning(false)
    }
  }

  const verify = async state => {
    setTransitioning(true)
    setMessage(null)
    try {
      const evidence_refs = lines(execution.evidence)
      await treeApi.verify(node.id, {
        state,
        verified_by: execution.verifier.trim(),
        evidence_refs,
        note: execution.note.trim(),
      })
      setMessage({ type: 'success', text: state === 'passed' ? 'Независимая проверка пройдена.' : 'Проверка вернула задачу в бэклог.' })
      await onUpdate()
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Не удалось записать verdict проверяющего.' })
    } finally {
      setTransitioning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/30 p-4 backdrop-blur-[1px]" role="presentation" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Подготовка delivery-задачи" onMouseDown={e => e.stopPropagation()} className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white/95 px-5 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{node.title}</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Сначала зафиксируйте понятный результат и границы, затем создавайте то, без чего нельзя продолжить.</p>
          </div>
          <button onClick={onClose} aria-label="Закрыть" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"><X size={16} /></button>
        </header>
        <div className="space-y-4 px-5 py-4">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            <button type="button" onClick={() => setActiveView('prepare')} className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${activeView === 'prepare' ? 'bg-white text-violet-700 shadow-sm dark:bg-gray-900 dark:text-violet-300' : 'text-gray-500'}`}>Подготовка</button>
            <button type="button" onClick={() => setActiveView('dependency')} className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${activeView === 'dependency' ? 'bg-white text-violet-700 shadow-sm dark:bg-gray-900 dark:text-violet-300' : 'text-gray-500'}`}>Зависимая задача</button>
            <button type="button" onClick={() => setActiveView('execution')} className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${activeView === 'execution' ? 'bg-white text-violet-700 shadow-sm dark:bg-gray-900 dark:text-violet-300' : 'text-gray-500'}`}>Исполнение</button>
          </div>

          {activeView === 'prepare' && <>
      <div>
        <div className="text-xs font-semibold text-violet-700 dark:text-violet-300">Подготовка задачи</div>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Заполните договор передачи до начала работы: он делает результат и границы понятными всем участникам.</p>
      </div>

      <div className="rounded-lg border border-gray-100 bg-white/70 px-2.5 py-2 dark:border-gray-800 dark:bg-gray-900/40">
        <div className="text-xs font-medium text-gray-600 dark:text-gray-300">Что блокирует</div>
        {blockers.length ? (
          <ul className="mt-1.5 space-y-1" aria-label="Блокирующие задачи">
            {blockers.map(blocker => (
              <li key={blocker.id} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                <Lock size={11} className="text-gray-400" />
                <span className="truncate">{blocker.title}</span>
                <span className="ml-auto shrink-0 text-gray-400">{STATUS_CFG[blocker.status]?.label || blocker.status}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-xs text-gray-400">Нет незавершённых зависимостей.</p>}
      </div>

      <form className="space-y-2" onSubmit={saveContract}>
        {HANDOFF_FIELDS.map(([field, label, placeholder]) => (
          <label key={field} className="block">
            <span className="mb-0.5 block text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
            <input value={contract[field]} onChange={e => setField(field, e.target.value)} placeholder={placeholder}
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none placeholder:text-gray-300 focus:border-violet-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" />
          </label>
        ))}
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-gray-500 dark:text-gray-400">Входные материалы</span>
          <textarea value={contract.input_refs} onChange={e => setField('input_refs', e.target.value)} placeholder="Одна ссылка или путь в каждой строке" rows={2}
            className="w-full resize-y rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none placeholder:text-gray-300 focus:border-violet-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-gray-500 dark:text-gray-400">Как проверить результат</span>
          <textarea value={contract.acceptance_criteria} onChange={e => setField('acceptance_criteria', e.target.value)} placeholder="Один проверяемый критерий в каждой строке" rows={2}
            className="w-full resize-y rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none placeholder:text-gray-300 focus:border-violet-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" />
        </label>
        <button type="submit" disabled={saving} className="rounded-md bg-violet-700 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? 'Сохраняю…' : 'Сохранить подготовку'}
        </button>
      </form>
          </>}

      {activeView === 'dependency' && <form className="pt-1" onSubmit={createDependency}>
        <div className="text-xs font-medium text-gray-700 dark:text-gray-200">Создать зависимую задачу</div>
        <p className="mt-0.5 text-[11px] text-gray-400">Создайте только конкретный результат, без которого нельзя продолжить эту работу.</p>
        <label className="mt-2 block">
          <span className="sr-only">Название зависимой задачи</span>
          <input required value={dependency.title} onChange={e => setDependency(current => ({ ...current, title: e.target.value }))} placeholder="Что нужно сделать"
            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none placeholder:text-gray-300 focus:border-violet-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" />
        </label>
        <label className="mt-2 block">
          <span className="sr-only">Ожидаемый результат зависимой задачи</span>
          <textarea required value={dependency.outcome} onChange={e => setDependency(current => ({ ...current, outcome: e.target.value }))} placeholder="Какой результат нужен, чтобы снять блокировку" rows={2}
            className="w-full resize-y rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none placeholder:text-gray-300 focus:border-violet-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" />
        </label>
        <button type="submit" disabled={creating} className="mt-2 rounded-md border border-violet-200 px-2.5 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-900/30">
          {creating ? 'Создаю…' : 'Создать зависимую задачу'}
        </button>
      </form>}

      {activeView === 'dependency' && <form className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800" onSubmit={linkExistingDependency}>
        <div className="text-xs font-medium text-gray-700 dark:text-gray-200">Связать существующую задачу</div>
        <p className="mt-0.5 text-[11px] text-gray-400">Показываются только delivery-задачи той же approved initiative, которые не создают цикл.</p>
        <label className="mt-2 block">
          <span className="sr-only">Существующая зависимость</span>
          <select value={selectedExistingDependency} onChange={e => setSelectedExistingDependency(e.target.value)} disabled={loadingExistingDependencies || linkingExistingDependency || existingDependencies.length === 0}
            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-violet-400 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="">{loadingExistingDependencies ? 'Загружаю…' : existingDependencies.length ? 'Выберите задачу' : 'Нет подходящих задач'}</option>
            {existingDependencies.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title} · {STATUS_CFG[candidate.status]?.label || candidate.status}</option>)}
          </select>
        </label>
        <button type="submit" disabled={!selectedExistingDependency || linkingExistingDependency} className="mt-2 rounded-md border border-violet-200 px-2.5 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-900/30">
          {linkingExistingDependency ? 'Связываю…' : 'Связать задачу'}
        </button>
      </form>}

      {activeView === 'execution' && <section className="space-y-3" aria-label="Исполнение и независимая проверка">
        <div>
          <div className="text-xs font-semibold text-violet-700 dark:text-violet-300">Исполнение и проверка</div>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Управление доступно только через lifecycle: договор → исполнитель → review → независимый verdict.</p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white/70 p-2.5 text-xs dark:border-gray-800 dark:bg-gray-900/40">
          <div className="flex justify-between gap-3"><span className="text-gray-500">Договор</span><span className={node.handoff_contract ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>{node.handoff_contract ? 'заполнен' : 'нужно заполнить'}</span></div>
          <div className="mt-1 flex justify-between gap-3"><span className="text-gray-500">Статус</span><span>{STATUS_CFG[node.status]?.label || node.status}</span></div>
          <div className="mt-1 flex justify-between gap-3"><span className="text-gray-500">Блокировки</span><span>{blockers.length ? `${blockers.length} незавершённых` : 'нет'}</span></div>
        </div>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-gray-500 dark:text-gray-400">Исполнитель</span>
          <input value={execution.actor} onChange={e => setExecution(current => ({ ...current, actor: e.target.value }))} disabled={node.status === 'done'} className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-violet-400 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" />
        </label>
        {node.status === 'backlog' && <button type="button" disabled={transitioning || !node.handoff_contract || blockers.length > 0} onClick={() => transition('ready')} className="rounded-md bg-violet-700 px-2.5 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">Подготовить к старту</button>}
        {['backlog', 'ready', 'scheduled'].includes(node.status) && <button type="button" disabled={transitioning || !node.handoff_contract || blockers.length > 0 || !execution.actor.trim()} onClick={() => transition('in_progress')} className="ml-2 rounded-md bg-violet-700 px-2.5 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">Начать работу</button>}
        {node.status === 'in_progress' && <button type="button" disabled={transitioning || !execution.actor.trim()} onClick={() => transition('waiting_for_review')} className="rounded-md bg-fuchsia-700 px-2.5 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">Передать на проверку</button>}
        {node.status === 'waiting_for_review' && <div className="space-y-2 border-t border-gray-100 pt-3 dark:border-gray-800">
          <label className="block"><span className="mb-0.5 block text-[11px] text-gray-500 dark:text-gray-400">Независимый проверяющий</span><input value={execution.verifier} onChange={e => setExecution(current => ({ ...current, verifier: e.target.value }))} className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-violet-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" /></label>
          <label className="block"><span className="mb-0.5 block text-[11px] text-gray-500 dark:text-gray-400">Evidence refs</span><textarea value={execution.evidence} onChange={e => setExecution(current => ({ ...current, evidence: e.target.value }))} rows={2} placeholder="Одна ссылка или путь в каждой строке" className="w-full resize-y rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-violet-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" /></label>
          <label className="block"><span className="mb-0.5 block text-[11px] text-gray-500 dark:text-gray-400">Комментарий проверяющего</span><textarea value={execution.note} onChange={e => setExecution(current => ({ ...current, note: e.target.value }))} rows={2} className="w-full resize-y rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-violet-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" /></label>
          <button type="button" disabled={transitioning || !execution.verifier.trim() || !lines(execution.evidence).length} onClick={() => verify('passed')} className="rounded-md bg-green-700 px-2.5 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">Подтвердить проверку</button>
          <button type="button" disabled={transitioning || !execution.verifier.trim() || !lines(execution.evidence).length} onClick={() => verify('failed')} className="ml-2 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:text-red-300">Вернуть в бэклог</button>
        </div>}
      </section>}

      {message && <p aria-live="polite" className={`text-xs ${message.type === 'error' ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>{message.text}</p>}
        </div>
      </section>
    </div>
  )
}

function DirectInitiativeDialog({ onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', goal: '', scope: '', expected_effect: '', effect_window: '', user_direction: '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const update = (field, value) => setForm(current => ({ ...current, [field]: value }))
  const submit = async event => {
    event.preventDefault()
    if (Object.values(form).some(value => !value.trim())) {
      setError('Заполните все шесть полей: initiative требует явного направления, границ и окна проверки.')
      return
    }
    setSaving(true); setError(null)
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]))
      const result = await productIntelligence.createInitiative(payload)
      onCreated(result.initiative)
    } catch (requestError) {
      setError(requestError.message || 'Не удалось создать delivery initiative.')
    } finally {
      setSaving(false)
    }
  }
  const fields = [['title', 'Название', 'Коротко назовите initiative'], ['goal', 'Цель', 'Какую пользовательскую цель решаем'], ['scope', 'Границы', 'Что входит и что пока не входит'], ['expected_effect', 'Ожидаемый эффект', 'Какой результат ожидаем'], ['effect_window', 'Окно проверки', 'Когда проверим результат'], ['user_direction', 'Ваше направление', 'Явное направление пользователя']]
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/30 p-4 backdrop-blur-[1px]" role="presentation" onMouseDown={onClose}>
    <form onSubmit={submit} onMouseDown={event => event.stopPropagation()} className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Новая delivery initiative</h2><p className="mt-1 text-xs leading-5 text-gray-500">Создание фиксирует ваше направление и границы. Оно не создаёт work item, расписание или автоматизацию.</p></div><button type="button" onClick={onClose} aria-label="Закрыть" className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button></div>
      <div className="mt-5 space-y-4">{fields.map(([field, label, placeholder]) => <label key={field} className="block text-sm font-medium text-gray-700 dark:text-gray-200">{label}<textarea value={form[field]} onChange={event => update(field, event.target.value)} placeholder={placeholder} className="mt-1 min-h-20 w-full rounded-lg border border-gray-300 bg-white p-2 text-sm font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>)}</div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Отмена</button><button type="submit" disabled={saving} className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Создаю…' : 'Создать initiative'}</button></div>
    </form>
  </div>
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
  const [deliveryDialog, setDeliveryDialog] = useState(null)

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
    await treeApi.update(node.id, { status: s }, !isLeaf ? 'goal_progress' : (s === 'done' ? 'task_progress' : null))
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
              <button onClick={e => { e.stopPropagation(); node.work_context === 'delivery' ? setDeliveryDialog('execution') : setShowStatus(v => !v) }}
                className={`flex items-center justify-center ${statusCls}`}>
                <StatusIcon size={13} />
              </button>
            )
          }
          {showStatus && node.work_context !== 'delivery' && (
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
          <button onClick={e => { e.stopPropagation(); openInConsole(consolePrompt) }} title="Открыть в AI-консоли"
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
          {node.work_context === 'delivery' && isLeaf && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-violet-100 bg-violet-50/40 px-2.5 py-2 dark:border-violet-900/50 dark:bg-violet-950/10">
              <div className="min-w-0 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-violet-700 dark:text-violet-300">Delivery</span>
                <span className="ml-1">{STATUS_CFG[node.status]?.label || node.status} · {node.handoff_contract ? 'договор заполнен' : 'договор не заполнен'}</span>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button onClick={() => setDeliveryDialog('prepare')} className="rounded-md bg-white px-2 py-1 text-xs text-violet-700 shadow-sm hover:bg-violet-100 dark:bg-gray-900 dark:text-violet-300 dark:hover:bg-violet-900/30">Открыть</button>
                <button onClick={() => setDeliveryDialog('dependency')} className="rounded-md border border-violet-200 px-2 py-1 text-xs text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-900/30">Зависимость</button>
                <button onClick={() => setDeliveryDialog('execution')} className="rounded-md border border-violet-200 px-2 py-1 text-xs text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-900/30">Исполнение</button>
              </div>
            </div>
          )}
        </div>
      )}

      {deliveryDialog && (
        <DeliveryTaskDialog node={node} nodesMap={nodesMap} onUpdate={onUpdate} initialView={deliveryDialog} onClose={() => setDeliveryDialog(null)} />
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
  const location = useLocation()
  const navigate = useNavigate()
  const [nodes, setNodes] = useState([])
  const [habitList, setHabitList] = useState([])
  const [loading, setLoading] = useState(true)
  const [focusPath, setFocusPath] = useState([])
  const [toasts, setToasts] = useState([])
  const [addingRoot, setAddRoot] = useState(false)
  const [addingAtBottom, setAddingAtBottom] = useState(false)
  const [hideDone, setHideDone] = useState(true)
  const initialParams = new URLSearchParams(location.search)
  const [context, setContext] = useState(() => initialParams.get('context') === 'delivery' ? 'delivery' : 'personal')
  const [showInitiativeForm, setShowInitiativeForm] = useState(() => initialParams.get('create') === 'initiative')
  const [initiativeCreated, setInitiativeCreated] = useState(null)
  const [routeState, setRouteState] = useState('overview')

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

  useEffect(() => {
    if (!nodes.length) return
    const legacyPath = legacyNodePath(nodes, location.search)
    if (location.pathname === '/goals' && legacyPath) {
      navigate(legacyPath, { replace: true })
      return
    }

    const resolved = resolveNodePath(nodes, location.pathname)
    setRouteState(resolved.state)
    if (resolved.state === 'found') {
      setContext(resolved.node.work_context || 'personal')
      setFocusPath((nodeLineage(nodes, resolved.node) || []).map(node => node.id))
      return
    }

    setFocusPath([])
    const requestedContext = new URLSearchParams(location.search).get('context')
    if (requestedContext === 'personal' || requestedContext === 'delivery') setContext(requestedContext)
  }, [nodes, location.pathname, location.search, navigate])

  const setContextInUrl = nextContext => {
    const params = new URLSearchParams(location.search)
    params.set('context', nextContext)
    params.delete('root')
    params.delete('task')
    setContext(nextContext)
    setFocusPath([])
    navigate({ pathname: '/goals', search: `?${params.toString()}` })
  }

  const openNode = id => {
    const path = nodePath(nodes, id)
    if (path) navigate(path)
  }

  const nodesMap = Object.fromEntries(nodes.map(n => [n.id, n]))
  const roots = buildTree(nodes).filter(root => (root.work_context || 'personal') === context)

  const focusNodeId = focusPath[focusPath.length - 1] || null
  const focusNode = focusNodeId ? findInTree(roots, focusNodeId) : null
  const displayNodes = focusNode ? focusNode.children : roots
  const rootColor = focusNode?.root_color || '#6B7280'
  const breadcrumb = focusPath.map(id => nodesMap[id]).filter(Boolean)

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Загрузка...</div>

  return (
    <>
      <div className="goals-page max-w-3xl mx-auto py-8 px-6">

        {/* Header / Breadcrumb */}
        <div className="goals-header mb-6 flex items-center justify-between gap-4">
          <div className="min-w-0">
          {focusPath.length === 0 ? (
            <div><p className="goals-kicker">Life OS · карта направлений</p><h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Цели</h1></div>
          ) : (
            <nav className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => navigate('/goals')}
                className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                Цели
              </button>
              {breadcrumb.map((n, i) => (
                <Fragment key={n.id}>
                  <span className="text-gray-300 dark:text-gray-600 text-sm select-none">/</span>
                  {i < breadcrumb.length - 1 ? (
                    <button onClick={() => openNode(n.id)}
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
          {focusPath.length === 0 && <div className="goals-switcher flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
            {[['personal', 'Личное'], ['delivery', 'Delivery']].map(([id, label]) => <button key={id} onClick={() => setContextInUrl(id)} className={`px-2.5 py-1.5 ${context === id ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-500'}`}>{label}</button>)}
          </div>}
          {context === 'delivery' && focusPath.length === 0 && <button onClick={() => setShowInitiativeForm(true)} className="rounded-lg bg-violet-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-800">+ initiative</button>}
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

        {(routeState === 'not_found' || routeState === 'invalid') && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            Этот путь не соответствует существующему узлу дерева. Он не был заменён другой задачей.
          </div>
        )}

        {/* Overview */}
        {focusPath.length === 0 && routeState !== 'not_found' && routeState !== 'invalid' && (
          <div className="goals-overview space-y-3">
            {roots.map(root => (
              <OverviewCard key={root.id} node={root} nodesMap={nodesMap}
                onEnter={openNode} onUpdate={load} />
            ))}
            {context === 'personal' && (addingRoot ? (
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
            ))}
          </div>
        )}

        {/* Drill-down */}
        {focusPath.length > 0 && (
          <div className="goals-drill bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
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
                  onUnblock={addToast} onZoom={openNode}
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
      {showInitiativeForm && <DirectInitiativeDialog onClose={() => setShowInitiativeForm(false)} onCreated={initiative => { setInitiativeCreated(initiative); setShowInitiativeForm(false) }} />}
      {initiativeCreated && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-emerald-700 px-4 py-3 text-sm text-white shadow-xl">Initiative «{initiativeCreated.title}» создана. Work item не создавалась автоматически. <a href="/ai-reviews" className="ml-2 font-semibold underline">Открыть AI Reviews</a></div>}
    </>
  )
}
