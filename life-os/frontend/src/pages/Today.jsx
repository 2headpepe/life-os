import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Clock3, GripVertical, HeartPulse, Layers3, ListTodo, RefreshCw } from 'lucide-react'
import { habits, memories, planner as plannerApi, tree as treeApi } from '../api'
import { computeHabitScore, TrackInput } from './Habits'
import { useRecoveryMode } from '../context/RecoveryModeContext'
import Surface from '../components/ui/Surface'
import { Button } from '../components/ui/Button'
import { entityPath, nodePath } from '../utils/entityLinks'
import { overdueTasks, starterBacklog } from '../utils/activeWork'
import { plannerFollowUpDue, plannerLane, plannerMeta, plannerRank } from '../utils/plannerSignals'
import { orderedFoundationHabits, orderedHabits, reorderFoundationHabits } from '../utils/habitOrdering'

const dateString = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const addDays = (date, offset) => {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + offset)
  return value.toISOString().slice(0, 10)
}

const formatDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
const formatShortDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })

function activeHabits(definitions, today) {
  return (definitions?.categories || []).flatMap(category => orderedHabits(category.habits || [])).filter(habit =>
    habit.active && (!habit.paused_until || habit.paused_until < today) && (!habit.active_until || habit.active_until >= today),
  )
}

function personalLeaves(nodes) {
  const parents = new Set(nodes.filter(node => node.parent_id).map(node => node.parent_id))
  return nodes.filter(node => !parents.has(node.id) && (node.work_context || 'personal') === 'personal' && node.status !== 'done' && node.status !== 'dropped' && node.status !== 'someday' && !node.calendar_id)
}

function attentionFor(tasks, today, recoveryMode) {
  const visible = recoveryMode ? tasks.filter(task => task.core) : tasks
  const now = visible.filter(task => plannerLane(task) === 'focus').sort((left, right) => plannerRank(left) - plannerRank(right))
  const followUps = visible.filter(task => plannerFollowUpDue(task, today)).sort((left, right) => left.planner.follow_up_on.localeCompare(right.planner.follow_up_on) || plannerRank(left) - plannerRank(right))
  const next = visible.filter(task => plannerLane(task) === 'next').sort((left, right) => plannerRank(left) - plannerRank(right))
  const task = now[0] || followUps[0] || next[0] || null
  const kind = !task ? null
    : now.includes(task) ? 'now'
      : followUps.includes(task) ? 'follow_up'
        : 'next'
  return { task, kind, hidden: recoveryMode ? tasks.length - visible.length : 0 }
}

function AttentionCard({ attention, nodes, starterTasks, overdueCount, today }) {
  const copy = {
    now: ['Сейчас в работе', 'Первое место в активной очереди', ListTodo, 'text-violet-600 dark:text-violet-400'],
    follow_up: ['Пора вернуться', 'Наступила дата фоллоуапа', Clock3, 'text-amber-600 dark:text-amber-400'],
    next: ['Следующая в очереди', 'Ручная очередь подсказывает следующий шаг', ListTodo, 'text-sky-600 dark:text-sky-400'],
  }
  if (!attention.task) return <Surface className="today-attention p-6 sm:p-8" aria-labelledby="attention-heading"><div className="flex gap-3"><CheckCircle2 size={22} className="text-violet-600 dark:text-violet-400 mt-0.5" /><div className="min-w-0 flex-1"><h2 id="attention-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100">Старт активной работы</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Сейчас ничего не назначено. Ниже — варианты по статусу и сроку, а не автоматический приоритет.{overdueCount ? ` Просроченных задач: ${overdueCount}; они отмечены отдельно.` : ''}</p>{starterTasks.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-3">{starterTasks.map(task => <Link key={task.id} to={`/pool?view=queue&task=${encodeURIComponent(task.id)}#backlog-${task.id}`} className={`rounded-xl border px-3 py-2 text-left transition-colors hover:border-violet-300 hover:bg-violet-50/50 dark:hover:border-violet-700 dark:hover:bg-violet-950/20 ${task.due && task.due < today ? 'border-amber-300 dark:border-amber-800' : 'border-gray-200 dark:border-gray-700'}`}><span className="block text-sm font-medium text-gray-800 dark:text-gray-100">{task.title}</span>{task.due && <span className={`mt-1 block text-xs ${task.due < today ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400 dark:text-gray-500'}`}>{task.due < today ? `Просрочено · ${formatShortDate(task.due)}` : `Срок · ${formatShortDate(task.due)}`}</span>}</Link>)}</div>}<Link to="/pool?view=queue#start-backlog" className="inline-flex mt-4 items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Открыть очередь и выбрать <ChevronRight size={15} /></Link></div></div></Surface>
  const [title, detail, Icon, color] = copy[attention.kind]
  const taskHref = nodePath(nodes, attention.task)
  const planner = plannerMeta(attention.task)
  return <Surface className="today-attention p-6 sm:p-8" aria-labelledby="attention-heading"><div className="flex gap-3"><Icon size={22} className={`${color} mt-0.5 flex-shrink-0`} /><div className="min-w-0"><p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Требует внимания</p><p className={`mt-1 text-sm font-medium ${color}`}>{title}</p><h2 id="attention-heading" className="mt-2 text-xl font-semibold text-gray-900 dark:text-gray-100 break-words">{attention.task.title}</h2><div className="mt-2 flex flex-wrap gap-1.5">{planner && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${planner.className}`}>{planner.label}</span>}{planner?.urgency === 'urgent' && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">срочно</span>}{planner?.followUpOn && <span className="text-xs text-gray-400 dark:text-gray-500">вернуться {planner.followUpOn}</span>}</div><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detail}</p>{planner?.priorityNote && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{planner.priorityNote}</p>}<div className="mt-5 flex flex-wrap gap-4 items-center"><Link to={taskHref || '/goals'} className="ds-button ds-button--primary">Открыть задачу</Link><Link to="/pool" className="today-secondary-link inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Все задачи <ChevronRight size={15} /></Link></div></div></div></Surface>
}

function OverdueNotice({ tasks, nodes, today }) {
  const [open, setOpen] = useState(false)
  const overdue = tasks.filter(task => task.due && task.due < today).sort((left, right) => left.due.localeCompare(right.due))
  if (!overdue.length) return null
  return <><button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-left text-sm font-medium text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/20 dark:text-amber-100"><CircleAlert size={18} />Есть просроченные задачи · {overdue.length}</button>{open && <div role="dialog" aria-modal="true" aria-label="Просроченные задачи" onClick={() => setOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><div onClick={event => event.stopPropagation()} className="max-h-[75vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Просроченные задачи</h2><button type="button" onClick={() => setOpen(false)} className="text-sm">Закрыть</button></div><ul className="mt-4 space-y-2">{overdue.map(task => <li key={task.id}><Link onClick={() => setOpen(false)} to={nodePath(nodes, task) || '/goals'} className="text-blue-600 hover:underline dark:text-blue-400">{task.title}</Link></li>)}</ul><Link to="/pool" className="mt-5 inline-flex text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">Открыть планирование <ChevronRight size={15} /></Link></div></div>}</>
}

function ContextStrip({ memory, memoryState, tomorrowCount }) {
  const yesterday = memoryState === 'unavailable' ? 'Вчера: данные недоступны' : memory ? 'Вчера: есть запись' : 'Вчера: нет записи'
  const items = [[yesterday, '/memories'], [`Завтра: ${tomorrowCount ? `${tomorrowCount} ${tomorrowCount === 1 ? 'дело' : 'дела'}` : 'ничего не запланировано'}`, '/calendar']]
  return <Surface className="today-context divide-y divide-gray-100 dark:divide-gray-800 sm:grid sm:grid-cols-2 sm:divide-x sm:divide-y-0" aria-label="Краткий контекст дня">{items.map(([label, to]) => <Link key={to} to={to} className="flex items-center justify-between gap-2 px-4 py-3.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/40"><span>{label}</span><ChevronRight size={16} /></Link>)}</Surface>
}

function Detail({ id, title, Icon, open, onToggle, children }) {
  return <Surface className="today-detail overflow-hidden"><h2><button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id} className="w-full flex items-center gap-3 px-4 py-4 text-left text-base font-semibold text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"><Icon size={18} className="text-gray-500 dark:text-gray-400" /><span className="flex-1">{title}</span><ChevronDown size={18} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} /></button></h2>{open && <div id={id} className="border-t border-gray-100 dark:border-gray-800 px-4 py-4">{children}</div>}</Surface>
}

function SphereDetails({ nodes, tasks, today }) {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const roots = nodes.filter(node => !node.parent_id && (node.work_context || 'personal') === 'personal')
  const rootFor = task => { let current = task; const seen = new Set(); while (current?.parent_id && !seen.has(current.id)) { seen.add(current.id); current = byId.get(current.parent_id) } return current?.parent_id === null ? current : null }
  const rows = roots.map(root => ({ root, tasks: tasks.filter(task => rootFor(task)?.id === root.id) })).filter(row => row.tasks.length)
  const unassigned = tasks.filter(task => !rootFor(task))
  if (!rows.length && !unassigned.length) return <p className="text-sm text-gray-500 dark:text-gray-400">Нет личных задач, которые можно показать по сферам.</p>
  return <div className="space-y-2">{rows.map(({ root, tasks: ownTasks }) => <div key={root.id} className="flex justify-between gap-3 text-sm"><span className="font-medium text-gray-800 dark:text-gray-200">{root.title}</span><span className="text-right text-gray-500 dark:text-gray-400">{ownTasks.length} {ownTasks.length === 1 ? 'задача' : 'задачи'} · обновлено {ownTasks.map(task => task.updated).sort().at(-1) || today}</span></div>)}{unassigned.length > 0 && <div className="flex justify-between gap-3 text-sm"><span className="font-medium text-gray-800 dark:text-gray-200">Без сферы</span><span className="text-gray-500 dark:text-gray-400">{unassigned.length} {unassigned.length === 1 ? 'задача' : 'задачи'}</span></div>}<p className="pt-2 text-xs text-gray-400 dark:text-gray-500">Источник: личные задачи. Привычки не распределяются по сферам.</p></div>
}

function YesterdayDetails({ memory, state }) {
  if (state === 'unavailable') return <p className="text-sm text-amber-700 dark:text-amber-300">Запись за вчера сейчас недоступна. Это не означает, что её нет.</p>
  if (!memory) return <p className="text-sm text-gray-500 dark:text-gray-400">Записи за вчера нет.</p>
  return <div className="space-y-2"><p className="text-sm text-gray-700 dark:text-gray-300">Есть запись за вчера{memory.auto ? ' (автоматическая сводка)' : ''}.</p>{memory.auto && <p className="text-xs text-gray-400 dark:text-gray-500">Автоматическая сводка опирается на изменения задач, а не на неизменяемое время завершения.</p>}<Link to="/memories" className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Открыть память <ChevronRight size={15} /></Link></div>
}

function UpcomingDetails({ tasks, today }) {
  return <div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map(offset => { const date = addDays(today, offset); const dayTasks = tasks.filter(task => task.status === 'scheduled' && task.due === date).slice(0, 2); return <div key={date}><p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{formatShortDate(date)}</p>{dayTasks.length ? <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300">{dayTasks.map(task => <li key={task.id} className="truncate">• {task.title}</li>)}</ul> : <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">Нет дел</p>}</div> })}<Link to="/calendar" className="sm:col-span-3 inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Открыть календарь <ChevronRight size={15} /></Link></div>
}

function PlannerDetails({ tasks, today, nodes }) {
  const now = tasks.filter(task => plannerLane(task) === 'focus').sort((left, right) => plannerRank(left) - plannerRank(right)).slice(0, 3)
  const next = tasks.filter(task => plannerLane(task) === 'next').sort((left, right) => plannerRank(left) - plannerRank(right)).slice(0, 3)
  const followUps = tasks.filter(task => plannerFollowUpDue(task, today)).sort((left, right) => left.planner.follow_up_on.localeCompare(right.planner.follow_up_on)).slice(0, 3)
  const rows = [
    ['Сейчас', now, 'text-violet-600 dark:text-violet-400'],
    ['Вернуться', followUps, 'text-amber-600 dark:text-amber-400'],
    ['Следующая', next, 'text-sky-600 dark:text-sky-400'],
  ].filter(([, ownTasks]) => ownTasks.length)
  if (!rows.length) return <p className="text-sm text-gray-500 dark:text-gray-400">В активной очереди пока нет задач. Добавь их через карточку задачи в списке.</p>
  return <div className="space-y-4">{rows.map(([label, ownTasks, color]) => <section key={label}><h3 className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</h3><ul className="mt-1.5 space-y-2">{ownTasks.map(task => <li key={task.id} className="text-sm"><div className="flex items-start justify-between gap-3"><Link to={nodePath(nodes, task) || '/goals'} className="min-w-0 text-gray-700 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400">{task.title}</Link>{task.planner?.follow_up_on && <span className="shrink-0 text-xs text-gray-400">{task.planner.follow_up_on}</span>}</div>{task.planner?.priority_note && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{task.planner.priority_note}</p>}</li>)}</ul></section>)}<Link to="/pool" className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Открыть активную очередь <ChevronRight size={15} /></Link></div>
}

function TodayHabits({ habits: foundationHabits, habitLog, saveHabit, savingHabit, draggedFoundation, setDraggedFoundation, reorderFoundation, open, onToggle }) {
  return <Surface className="today-habits overflow-hidden border-2 border-blue-200/80 shadow-sm dark:border-blue-800/70" aria-labelledby="habit-heading">
    <div className={`flex items-center gap-3 bg-blue-50/60 px-4 py-3 dark:bg-blue-950/20 ${open ? 'border-b border-blue-100 dark:border-blue-900/60' : ''}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls="today-habits-list" className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <h2 id="habit-heading" className="text-base font-semibold text-gray-900 dark:text-gray-100">Привычки</h2>
        <p className="mt-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">Основные</p>
      </button>
      <Link to="/habits" className="shrink-0 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">Все привычки</Link>
      <button type="button" onClick={onToggle} aria-label={open ? 'Скрыть привычки' : 'Показать привычки'} aria-expanded={open} aria-controls="today-habits-list" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><ChevronDown size={18} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} /></button>
    </div>
    {open && <div id="today-habits-list">{foundationHabits.map((habit, index) => <div key={habit.id} draggable onDragStart={() => setDraggedFoundation(habit.id)} onDragOver={event => event.preventDefault()} onDrop={() => { reorderFoundation(draggedFoundation, habit.id); setDraggedFoundation(null) }} onDragEnd={() => setDraggedFoundation(null)} className={`flex items-center gap-3 px-4 py-3 ${index < foundationHabits.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}><GripVertical size={16} aria-hidden="true" className="shrink-0 cursor-grab text-gray-300 dark:text-gray-600" /><div className="min-w-0 flex-1"><Link to={entityPath.habit(habit.id)} className="text-sm font-medium text-gray-800 hover:text-blue-600 dark:text-gray-200 dark:hover:text-blue-400">{habit.label}</Link>{habit.detail && <p className="mt-0.5 text-xs text-gray-400">{habit.detail}</p>}</div><TrackInput habit={habit} value={habitLog[habit.id]} onChange={value => saveHabit(habit.id, value)} editable={!savingHabit} /></div>)}</div>}
  </Surface>
}

export default function Today() {
  const today = dateString(); const yesterday = addDays(today, -1); const tomorrow = addDays(today, 1)
  const { isRecoveryMode, toggleRecoveryMode } = useRecoveryMode()
  const [nodes, setNodes] = useState([]); const [plannerTasks, setPlannerTasks] = useState([]); const [habitDefs, setHabitDefs] = useState([]); const [habitCategories, setHabitCategories] = useState([]); const [habitLog, setHabitLog] = useState({}); const [memory, setMemory] = useState(null); const [memoryState, setMemoryState] = useState('loading'); const [loading, setLoading] = useState(true); const [error, setError] = useState(null); const [expanded, setExpanded] = useState({}); const [savingHabit, setSavingHabit] = useState(false); const [draggedFoundation, setDraggedFoundation] = useState(null)
  const load = useCallback(async () => { setLoading(true); setError(null); const [treeResult, plannerResult, definitionsResult, logResult, memoryResult] = await Promise.allSettled([treeApi.all(), plannerApi.queue(), habits.definitions(), habits.log(today), memories.all(yesterday)]); if (treeResult.status !== 'fulfilled') { setError('Не удалось загрузить задачи. Попробуй обновить страницу.'); setLoading(false); return } setNodes(treeResult.value || []); setPlannerTasks(plannerResult.status === 'fulfilled' ? plannerResult.value?.tasks || [] : []); const categories = definitionsResult.status === 'fulfilled' ? definitionsResult.value?.categories || [] : []; setHabitCategories(categories); setHabitDefs(activeHabits({ categories }, today)); setHabitLog(logResult.status === 'fulfilled' ? logResult.value?.habits || {} : {}); if (memoryResult.status === 'fulfilled') { setMemory(memoryResult.value?.[0] || null); setMemoryState('ready') } else { setMemory(null); setMemoryState('unavailable') } setLoading(false) }, [today, yesterday])
  useEffect(() => { load() }, [load])
  const plannerById = useMemo(() => new Map(plannerTasks.map(task => [task.id, task.planner])), [plannerTasks]); const tasks = useMemo(() => personalLeaves(nodes).map(task => plannerById.has(task.id) ? { ...task, planner: plannerById.get(task.id) } : task), [nodes, plannerById]); const attention = useMemo(() => attentionFor(tasks, today, isRecoveryMode), [tasks, today, isRecoveryMode]); const todayOverdue = useMemo(() => overdueTasks(tasks, today), [tasks, today]); const starterTasks = useMemo(() => starterBacklog(tasks, today, { excludeIds: new Set(plannerTasks.map(task => task.id)) }), [tasks, today, plannerTasks]); const visibleHabits = useMemo(() => isRecoveryMode ? habitDefs.filter(habit => habit.foundation) : habitDefs, [habitDefs, isRecoveryMode]); const foundationHabits = useMemo(() => orderedFoundationHabits(habitDefs.filter(habit => habit.foundation)), [habitDefs]); const maxScore = visibleHabits.reduce((total, habit) => total + (habit.max_score || 1), 0); const score = computeHabitScore(visibleHabits, habitLog); const tomorrowCount = tasks.filter(task => task.status === 'scheduled' && task.due === tomorrow).length
  const saveHabit = async (habitId, value) => { const next = { ...habitLog, [habitId]: value }; setHabitLog(next); setSavingHabit(true); try { await habits.saveLog(today, { date: today, habits: next, score: computeHabitScore(visibleHabits, next), notes: '' }, 'habit_progress') } catch { setHabitLog(habitLog) } finally { setSavingHabit(false) } }
  const reorderFoundation = async (sourceId, targetId) => { if (!sourceId || sourceId === targetId) return; const categories = reorderFoundationHabits(habitCategories, sourceId, targetId); await habits.saveDefinitions({ categories }); setHabitCategories(categories); setHabitDefs(activeHabits({ categories }, today)) }
  const toggle = key => setExpanded(current => ({ ...current, [key]: !current[key] }))
  if (loading) return <div className="px-8 py-8 space-y-4" aria-busy="true" aria-live="polite"><div className="h-14 w-56 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" /><div className="h-64 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" /><div className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" /></div>
  if (error) return <div className="px-8 py-8 max-w-2xl" aria-live="polite"><Surface className="p-6 flex gap-3"><AlertCircle className="text-red-600 dark:text-red-400 mt-0.5" /><div><h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Сегодня</h1><p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{error}</p><Button type="button" onClick={load} variant="primary" className="mt-4 inline-flex items-center gap-2"><RefreshCw size={15} />Обновить</Button></div></Surface></div>
  return <main className="today-page mx-auto w-full max-w-5xl px-5 sm:px-8 py-8 pb-12"><header className="today-header mb-6"><p className="today-kicker">Life OS · дневной обзор</p><h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Сегодня</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400 capitalize">{formatDate(today)} · Статус жизни</p></header>{isRecoveryMode && <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"><HeartPulse size={17} className="mt-0.5 flex-shrink-0" /><p className="flex-1"><span className="font-medium">Режим восстановления.</span> Показаны только задачи и привычки с отметкой «Ядро» или фундамент.</p><button type="button" onClick={() => toggleRecoveryMode(false)} className="text-sm font-medium underline underline-offset-2">Выйти</button></div>}{attention.hidden > 0 && <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">В режиме восстановления скрыто задач: {attention.hidden}.</p>}<div className="space-y-4"><AttentionCard attention={attention} nodes={nodes} starterTasks={starterTasks} overdueCount={todayOverdue.length} today={today} /><OverdueNotice tasks={tasks} nodes={nodes} today={today} /><ContextStrip memory={memory} memoryState={memoryState} tomorrowCount={tomorrowCount} />{foundationHabits.length > 0 && <TodayHabits habits={foundationHabits} habitLog={habitLog} saveHabit={saveHabit} savingHabit={savingHabit} draggedFoundation={draggedFoundation} setDraggedFoundation={setDraggedFoundation} reorderFoundation={reorderFoundation} open={expanded.habits !== false} onToggle={() => setExpanded(current => ({ ...current, habits: current.habits !== false ? false : true }))} />}<section aria-labelledby="details-heading" className="pt-4"><h2 id="details-heading" className="today-details-heading mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Подробнее</h2><div className="space-y-3"><Detail id="life-status-planner" title="Ручная очередь" Icon={ListTodo} open={Boolean(expanded.planner)} onToggle={() => toggle('planner')}><PlannerDetails tasks={tasks} today={today} nodes={nodes} /></Detail><Detail id="life-status-spheres" title="Сферы" Icon={Layers3} open={Boolean(expanded.spheres)} onToggle={() => toggle('spheres')}><SphereDetails nodes={nodes} tasks={tasks} today={today} /></Detail><Detail id="life-status-yesterday" title="Вчера" Icon={ListTodo} open={Boolean(expanded.yesterday)} onToggle={() => toggle('yesterday')}><YesterdayDetails memory={memory} state={memoryState} /></Detail><Detail id="life-status-upcoming" title="Ближайшие 3 дня" Icon={CalendarDays} open={Boolean(expanded.upcoming)} onToggle={() => toggle('upcoming')}><UpcomingDetails tasks={tasks} today={today} /></Detail></div><p className="mt-5 text-sm text-gray-500 dark:text-gray-400">Подробное планирование — <Link to="/calendar" className="today-secondary-link font-medium text-blue-600 dark:text-blue-400 hover:underline">в календаре</Link>.</p></section></div></main>
}
