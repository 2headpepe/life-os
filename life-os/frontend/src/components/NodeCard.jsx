import { useState } from 'react'
import { Circle, Clock, CircleDot, CheckCircle2, CircleDashed, CircleMinus, Lock, Sparkles, Repeat } from 'lucide-react'
import { tree as treeApi } from '../api'
import { openInConsole } from '../utils/openInConsole'

function formatDue(dueStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueStr + 'T00:00:00')
  const diff = Math.round((due - today) / 86400000)
  if (diff === 0) return 'сегодня'
  if (diff === 1) return 'завтра'
  if (diff === -1) return 'вчера'
  if (diff > 1 && diff < 7) return due.toLocaleDateString('ru-RU', { weekday: 'short' })
  return due.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

const STATUS_CFG = {
  undefined:   { Icon: Circle,       cls: 'text-red-400',   label: 'Не определено' },
  scheduled:   { Icon: Clock,        cls: 'text-blue-400',  label: 'Запланировано' },
  in_progress: { Icon: CircleDot,    cls: 'text-amber-400', label: 'В работе' },
  done:        { Icon: CheckCircle2, cls: 'text-green-400', label: 'Готово' },
  someday:     { Icon: CircleDashed, cls: 'text-gray-400',  label: 'Когда-нибудь' },
  dropped:     { Icon: CircleMinus,  cls: 'text-gray-300',  label: 'Отменено' },
}

const ACTIVE_STATUSES = ['undefined', 'scheduled', 'in_progress', 'done', 'someday', 'dropped']

const RECURRENCE_OPTS = [[null, 'Нет'], ['daily', 'День'], ['weekly', 'Неделя'], ['monthly', 'Месяц']]
const RECURRENCE_LABELS = { daily: 'каждый день', weekly: 'каждую неделю', monthly: 'каждый месяц' }

function ExpandedDetail({ node, status, onStatus, onDueSave, onTimeSave, onRecurrenceSave, onDelete, onConsole, compact = false }) {
  const [editingDue, setEditingDue] = useState(false)
  const [editingTime, setEditingTime] = useState(false)

  return (
    <div className={`space-y-3 ${compact ? '' : 'mt-3 pt-3 border-t border-gray-100 dark:border-gray-800'}`} onClick={e => e.stopPropagation()}>
      {node.notes && <p className="text-xs text-gray-500 dark:text-gray-400">{node.notes}</p>}
      {node.outcome && <p className="text-xs text-blue-500 dark:text-blue-400 italic">→ {node.outcome}</p>}

      <div className="flex items-center gap-1.5 flex-wrap">
        {ACTIVE_STATUSES.map(s => {
          const { Icon: SIcon, cls } = STATUS_CFG[s]
          return (
            <button
              key={s}
              onClick={() => onStatus(s)}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
                status === s
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <SIcon size={12} className={status === s ? '' : cls} />
              {STATUS_CFG[s].label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        {/* Due date */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Дата:</span>
          {editingDue ? (
            <input
              autoFocus
              type="date"
              defaultValue={node.due || ''}
              onBlur={e => { onDueSave(e.target.value); setEditingDue(false) }}
              onKeyDown={e => { if (e.key === 'Enter') { onDueSave(e.target.value); setEditingDue(false) } if (e.key === 'Escape') setEditingDue(false) }}
              className="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 outline-none"
            />
          ) : (
            <button onClick={() => setEditingDue(true)} className={`text-xs ${node.due ? 'text-blue-500 hover:text-blue-600' : 'text-gray-400 hover:text-blue-500'}`}>
              {node.due ? formatDue(node.due) : '+ дата'}
            </button>
          )}
        </div>

        {/* Time */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Время:</span>
          {editingTime ? (
            <input
              autoFocus
              type="time"
              defaultValue={node.time || ''}
              onBlur={e => { onTimeSave(e.target.value); setEditingTime(false) }}
              onKeyDown={e => { if (e.key === 'Enter') { onTimeSave(e.target.value); setEditingTime(false) } if (e.key === 'Escape') setEditingTime(false) }}
              className="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 outline-none"
            />
          ) : (
            <button onClick={() => setEditingTime(true)} className={`text-xs ${node.time ? 'text-indigo-500 hover:text-indigo-600' : 'text-gray-400 hover:text-indigo-500'}`}>
              {node.time || '+ время'}
            </button>
          )}
        </div>

        {/* Recurrence */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Повтор:</span>
          <div className="flex items-center gap-1">
            {RECURRENCE_OPTS.map(([val, label]) => (
              <button
                key={val ?? 'none'}
                onClick={() => onRecurrenceSave(val)}
                className={`text-xs px-2 py-0.5 rounded-lg transition-colors ${
                  (node.recurrence || null) === val
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onConsole}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Sparkles size={12} />
          Claude
        </button>
        <button onClick={onDelete} className="text-xs px-2.5 py-1 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
          Удалить
        </button>
      </div>
    </div>
  )
}

export default function NodeCard({ node, onUpdate, row = false, draggable: isDraggable = false }) {
  const [expanded, setExpanded] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(node.title)

  const color = node.root_color || '#6B7280'
  const status = node.status || 'undefined'
  const cfg = STATUS_CFG[status] || STATUS_CFG.undefined
  const today = new Date().toISOString().slice(0, 10)
  const isOverdue = node.due && node.due < today && status !== 'done'
  const isBlocked = node.is_blocked

  const handleDone = async (e) => {
    e.stopPropagation()
    setCompleting(true)
    await treeApi.update(node.id, { status: 'done' })
    onUpdate?.()
  }
  const handleStatus = async (s) => { await treeApi.update(node.id, { status: s }); onUpdate?.() }
  const handleDueSave = async (val) => {
    await treeApi.update(node.id, { due: val || null, status: val ? 'scheduled' : node.status })
    onUpdate?.()
  }
  const handleTimeSave = async (val) => {
    await treeApi.update(node.id, { time: val || null })
    onUpdate?.()
  }
  const handleRecurrenceSave = async (val) => {
    await treeApi.update(node.id, { recurrence: val })
    onUpdate?.()
  }
  const handleTitleSave = async () => {
    const v = titleDraft.trim()
    if (v && v !== node.title) await treeApi.update(node.id, { title: v })
    setEditingTitle(false)
  }
  const handleDelete = async (e) => {
    e.stopPropagation()
    if (!window.confirm(`Удалить "${node.title}"?`)) return
    await treeApi.delete(node.id)
    onUpdate?.()
  }

  const consoleCtx = `Задача: "${node.title}"\nДомен: ${node.root_title}${node.path?.length ? `\nПуть: ${node.path.join(' › ')}` : ''}${node.due ? `\nДедлайн: ${node.due}` : ''}${node.time ? `\nВремя: ${node.time}` : ''}${node.notes ? `\nЗаметки: ${node.notes}` : ''}`

  if (node.status === 'done' || node.status === 'dropped') return null

  const expandedDetail = (
    <ExpandedDetail
      node={node} status={status}
      onStatus={handleStatus}
      onDueSave={handleDueSave}
      onTimeSave={handleTimeSave}
      onRecurrenceSave={handleRecurrenceSave}
      onDelete={handleDelete}
      onConsole={() => openInConsole(consoleCtx)}
      compact={row}
    />
  )

  if (row) {
    return (
      <div
        className={`rounded-xl transition-colors ${expanded ? 'bg-gray-50 dark:bg-gray-800/40' : ''}`}
        draggable={isDraggable}
        onDragStart={isDraggable ? (e) => { e.dataTransfer.setData('taskId', node.id); e.dataTransfer.effectAllowed = 'move' } : undefined}
      >
        <div
          className={`group flex items-center gap-2 px-2 py-1.5 rounded-xl cursor-pointer ${expanded ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'} ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
          onClick={() => !editingTitle && setExpanded(v => !v)}
        >
          <div className="flex-shrink-0">
            {isBlocked ? <Lock size={13} className="text-gray-400" /> : <cfg.Icon size={13} className={cfg.cls} />}
          </div>

          {editingTitle ? (
            <input
              autoFocus value={titleDraft}
              onClick={e => e.stopPropagation()}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={e => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') { setTitleDraft(node.title); setEditingTitle(false) } }}
              className="flex-1 text-sm bg-transparent border-b border-gray-300 dark:border-gray-600 outline-none text-gray-900 dark:text-gray-100"
            />
          ) : (
            <span
              className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate"
              onDoubleClick={e => { e.stopPropagation(); setEditingTitle(true) }}
            >
              {node.title}
            </span>
          )}

          {node.recurrence && (
            <Repeat size={11} className="text-gray-400 flex-shrink-0" title={RECURRENCE_LABELS[node.recurrence]} />
          )}
          {node.time && (
            <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">{node.time.slice(0, 5)}</span>
          )}
          {node.due && (
            <span className={`text-xs flex-shrink-0 font-medium ${isOverdue ? 'text-red-400' : 'text-amber-400'}`}>
              {formatDue(node.due)}
            </span>
          )}

          <button
            onClick={handleDone} disabled={completing}
            className="flex-shrink-0 w-4 h-4 rounded-full border border-gray-300 dark:border-gray-600 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors opacity-0 group-hover:opacity-100"
            title="Выполнено"
          />
        </div>

        {expanded && <div className="px-3 pb-3">{expandedDetail}</div>}
      </div>
    )
  }

  return (
    <div className="card cursor-pointer mb-2 overflow-hidden" onClick={() => !editingTitle && setExpanded(v => !v)}>
      <div className="flex items-stretch">
        <div className="w-1 flex-shrink-0 rounded-l-xl" style={{ backgroundColor: color }} />
        <div className="flex-1 px-4 py-3 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {isBlocked ? (
                <div className="group/lock flex items-center gap-1 flex-shrink-0 cursor-default">
                  <Lock size={14} className="text-gray-400" />
                  {node.blockers?.some(b => b.status !== 'done') && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded px-1.5 py-0.5 whitespace-nowrap overflow-hidden max-w-0 opacity-0 group-hover/lock:max-w-[200px] group-hover/lock:opacity-100 transition-all duration-150">
                      {node.blockers.filter(b => b.status !== 'done').map(b => b.title).join(', ')}
                    </span>
                  )}
                </div>
              ) : (
                <cfg.Icon size={14} className={`flex-shrink-0 ${cfg.cls}`} />
              )}
              {editingTitle ? (
                <input
                  autoFocus value={titleDraft}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={e => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') { setTitleDraft(node.title); setEditingTitle(false) } }}
                  className="flex-1 text-sm font-medium bg-transparent border-b border-gray-300 dark:border-gray-600 outline-none text-gray-900 dark:text-gray-100"
                />
              ) : (
                <span
                  className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug truncate"
                  onDoubleClick={e => { e.stopPropagation(); setEditingTitle(true) }}
                >
                  {node.title}
                </span>
              )}
            </div>
            <button
              onClick={handleDone} disabled={completing}
              className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
              title="Выполнено"
            />
          </div>

          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {node.path?.length > 0 && (
              <span className="text-xs text-gray-400 truncate">{node.path.join(' › ')}</span>
            )}
            {node.time && (
              <span className="text-xs text-indigo-400 ml-auto flex-shrink-0">{node.time.slice(0, 5)}</span>
            )}
            {node.due && (
              <span className={`text-xs font-medium ${node.time ? '' : 'ml-auto'} flex-shrink-0 ${isOverdue ? 'text-red-500' : 'text-amber-500'}`}>
                · {formatDue(node.due)}
              </span>
            )}
            {node.recurrence && (
              <Repeat size={11} className={`text-gray-400 flex-shrink-0 ${!node.time && !node.due ? 'ml-auto' : 'ml-1'}`} title={RECURRENCE_LABELS[node.recurrence]} />
            )}
          </div>

          {expanded && expandedDetail}
        </div>
      </div>
    </div>
  )
}
