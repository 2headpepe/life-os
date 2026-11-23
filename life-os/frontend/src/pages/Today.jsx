import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowUpRight, CalendarDays, ChevronDown, ChevronRight, CircleAlert, GripVertical, HeartPulse, Layers3, ListTodo, RefreshCw } from 'lucide-react'
import { events as calendarEvents, habits, memories, planner as plannerApi, tree as treeApi } from '../api'
import { computeHabitScore } from '../utils/habitScoring'
import TrackInput from '../components/HabitTrackInput'
import { useRecoveryMode } from '../context/RecoveryModeContext'
import Surface from '../components/ui/Surface'
import { Button } from '../components/ui/Button'
import { entityPath, nodePath } from '../utils/entityLinks'
import { localDay, selectNextSteps } from '../utils/activeWork'
import { addLocalDays } from '../utils/calendarDay'
import { calendarNodeVisible, loadFilters, loadHidden } from '../utils/calendarVisibility'
import TodayWorkOptions, { DeadlineInfo, FirstStep, TaskResultActions } from '../components/TodayWorkOptions'
import HabitInfo from '../components/HabitInfo'
import { calendarCapacity, deadlineGuidance, workChoices } from '../utils/workWindows'
import { usePlanningRefresh } from '../utils/usePlanningRefresh'
import { plannerLane, plannerMeta, plannerRank } from '../utils/plannerSignals'
import { orderedFoundationHabits, orderedHabits, reorderFoundationHabits } from '../utils/habitOrdering'

const addDays = addLocalDays

const formatDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
const formatShortDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })

function activeHabits(definitions, today) {
  return (definitions?.categories || []).flatMap(category => orderedHabits(category.habits || [])).filter(habit =>
    habit.active && (!habit.paused_until || habit.paused_until < today) && (!habit.active_until || habit.active_until >= today),
  )
}

function AttentionCard({ attention, nodes, partial, now, schedule, option, step, deadline, onRefresh }) {
  const { task, held, obligation, waitingReasons } = attention
  const sameAsObligation = id => obligation?.source === 'node' && obligation.item.id === id
  const labels = { now: 'Приоритет на сегодня', next: 'Следующая по приоритету', later: 'Позже по приоритету', available: 'Можно взять сейчас' }
  const planner = task && plannerMeta(task)
  return <section className={`${task ? 'today-primary' : 'today-primary-empty'} px-4 py-4 sm:px-6 sm:py-5`} aria-labelledby="attention-heading">
    {task ? <>
      <p className="today-primary-label">{labels[attention.kind]}</p>
      <div className="mt-2">
        <h2 id="attention-heading" className="break-words text-xl font-semibold sm:text-2xl">
          <Link to={nodePath(nodes, task) || '/goals'} className="hover:underline">{task.title}</Link>
        </h2>
      </div>
      {option?.minutes > 0 && <p className="text-sm text-gray-500">Около {option.minutes} мин · {option.source}{option.fits != null && (option.fits ? ' · помещается до следующего события' : ' · дольше свободного промежутка')}</p>}
      <FirstStep step={step} />
      {deadline && <DeadlineInfo row={deadline} schedule={schedule} onRefresh={onRefresh} />}
      {!deadline && sameAsObligation(task.id) && <p className="text-sm">{obligationLabel(obligation)} · {formatShortDate(obligation.date)} {task.time}</p>}
      {planner?.followUpOn && <p className="text-xs">Вернуться {planner.followUpOn}</p>}
      {planner?.urgency === 'urgent' && <p className="text-sm text-rose-600">Срочно</p>}
      {planner?.priorityNote && <p className="text-sm">{planner.priorityNote}</p>}
      <div className="today-primary-actions">
        <Link to={nodePath(nodes, task) || '/goals'} className="ds-button ds-button--primary inline-flex min-h-11 items-center gap-2">Открыть задачу <ArrowUpRight size={16} aria-hidden="true" /></Link>
        <TaskResultActions key={task.id} task={task} now={now} option={option} step={step} schedule={schedule} onRefresh={onRefresh} />
      </div>
    </> : <h2 id="attention-heading" className="text-lg font-semibold">{partial ? 'Данные о следующем шаге неполны' : 'Сейчас нет доступных действий'}</h2>}
    {held && !sameAsObligation(held.id) && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
      {held.title} · {waitingReasons.get(held.id)}
    </p>}
    {!task && <Link to="/pool?view=queue" className="mt-2 inline-flex text-sm hover:underline">Открыть очередь</Link>}
  </section>
}

function obligationLabel(entry) {
  if (entry.kind === 'deadline') return 'Ближайший срок'
  if (entry.current) return 'Сейчас по расписанию'
  return 'Ближайшее в календаре'
}

function Obligation({ entry, nodes, calendarUnavailable, waitingReason }) {
  if (!entry && !calendarUnavailable) return null
  return (
    <aside className="today-obligation text-sm" aria-label="Календарный контекст">
      {entry && <>
        <h2 className="today-obligation-heading"><CalendarDays size={17} aria-hidden="true" />{obligationLabel(entry)}</h2>
        <Link className="today-obligation-link" to={entry.source === 'event' ? entityPath.calendarEvent(entry.item.id) : nodePath(nodes, entry.item) || '/calendar'}>
          <span className="today-obligation-time">{formatShortDate(entry.date)}{entry.item.time ? ` · ${entry.item.time}` : ''}</span>
          <span className="today-obligation-title">{entry.item.title}</span>
        </Link>
        {waitingReason && !waitingReason.startsWith('Запись в календаре на ') && <p className="mt-1 text-xs">{waitingReason}</p>}
      </>}
      {calendarUnavailable && <p role="status" className="today-obligation-warning">Не удалось загрузить события календаря. Расписание может быть неполным.</p>}
    </aside>
  )
}

function OverdueNotice({ tasks, nodes, today }) {
  const [open, setOpen] = useState(false)
  const closeButton = useRef(null)
  const opener = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    closeButton.current?.focus()
    const closeOnEscape = event => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => { window.removeEventListener('keydown', closeOnEscape); opener.current?.focus() }
  }, [open])
  const overdue = tasks.filter(task => task.due && task.due < today).sort((left, right) => left.due.localeCompare(right.due))
  if (!overdue.length) return null
  return <><button ref={opener} type="button" onClick={() => setOpen(true)} className="today-overdue flex w-full items-center gap-2 rounded-xl border px-4 py-2.5 text-left text-sm font-medium"><CircleAlert size={18} aria-hidden="true" />Есть просроченные задачи · {overdue.length}</button>{open && <div role="dialog" aria-modal="true" aria-label="Просроченные задачи" onClick={() => setOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><div onClick={event => event.stopPropagation()} className="max-h-[75vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Просроченные задачи</h2><button ref={closeButton} type="button" onClick={() => setOpen(false)} className="text-sm">Закрыть</button></div><ul className="mt-4 space-y-2">{overdue.map(task => <li key={task.id}><Link onClick={() => setOpen(false)} to={nodePath(nodes, task) || '/goals'} className="text-blue-600 hover:underline dark:text-blue-400">{task.title}</Link></li>)}</ul><Link to="/pool" className="mt-5 inline-flex text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">Открыть планирование <ChevronRight size={15} /></Link></div></div>}</>
}

function ContextStrip({ memory, memoryState, tomorrowCount, calendarUnavailable }) {
  const yesterday = memoryState === 'unavailable' ? 'Вчера: данные недоступны' : memory ? 'Вчера: есть запись' : 'Вчера: нет записи'
  const tomorrowLabel = tomorrowCount ? 'Записей на завтра: ' + tomorrowCount : 'Завтра ничего не запланировано'
  const items = [[yesterday, '/memories'], [calendarUnavailable ? 'Завтра: расписание неполно' : tomorrowLabel, '/calendar']]
  return <nav className="today-context" aria-label="Краткий контекст дня">{items.map(([label, to]) => <Link key={to} to={to} className="today-context-link"><span>{label}</span><ChevronRight size={15} aria-hidden="true" /></Link>)}</nav>
}

function Detail({ id, title, Icon, open, onToggle, children }) {
  return <Surface className="today-detail overflow-hidden"><h2><button type="button" onClick={onToggle} aria-expanded={open} aria-controls={open ? id : undefined} className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"><Icon size={17} className="text-gray-500 dark:text-gray-400" /><span className="flex-1">{title}</span><ChevronDown size={17} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} /></button></h2>{open && <div id={id} className="border-t border-gray-100 dark:border-gray-800 px-4 py-4">{children}</div>}</Surface>
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

function UpcomingDetails({ appointments, today, calendarUnavailable }) {
  return (
    <div className="grid gap-3">
      {[1, 2, 3].map(offset => {
        const day = addDays(today, offset)
        const entries = appointments.filter(entry => entry.date === day).slice(0, 2)
        return <div key={day} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
          <p className="text-xs font-semibold uppercase text-gray-500">{formatShortDate(day)}</p>
          {entries.length ? <ul className="min-w-0 space-y-1 text-sm">{entries.map(({ item, source }) =>
            <li key={source + item.id} className="truncate">{item.time} {item.title}</li>)}</ul>
            : <p className="text-sm text-gray-500">{calendarUnavailable ? 'Расписание неполно' : 'Нет дел'}</p>}
        </div>
      })}
      <Link to="/calendar" className="text-sm font-medium text-blue-600 hover:underline">Открыть календарь</Link>
    </div>
  )
}

function PlannerDetails({ tasks, nodes, waitingReasons, unavailable }) {
  const rows = [
    ['Сегодня', 'focus', 'text-violet-600 dark:text-violet-400'],
    ['Следующая', 'next', 'text-sky-600 dark:text-sky-400'],
    ['Позже', 'waiting', 'text-amber-600 dark:text-amber-400'],
  ].map(([label, lane, color]) => ({
    label, color,
    tasks: tasks.filter(task => plannerLane(task) === lane)
      .sort((left, right) => plannerRank(left) - plannerRank(right)).slice(0, 3),
  })).filter(row => row.tasks.length)
  if (unavailable) return <p role="status" className="text-sm text-amber-700">Приоритеты недоступны. Попробуй обновить страницу.</p>
  return <div className="space-y-4">
    {rows.map(row => <section key={row.label}>
      <h3 className={`text-xs font-semibold uppercase tracking-wide ${row.color}`}>{row.label}</h3>
      <ul className="mt-1.5 space-y-2">{row.tasks.map(task => <li key={task.id} className="text-sm">
        <div className="flex items-start justify-between gap-3">
          <Link to={nodePath(nodes, task) || '/goals'} className="min-w-0 text-gray-700 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400">{task.title}</Link>
          <span className="shrink-0 text-xs text-gray-400">{task.status === 'in_progress' ? 'В работе' : task.status === 'someday' ? 'Когда-нибудь' : task.status === 'scheduled' ? 'Запланировано' : 'Не определено'}</span>
        </div>
        {waitingReasons.has(task.id) && <p className="mt-0.5 text-xs text-amber-700">{waitingReasons.get(task.id)}</p>}
        {task.planner?.priority_note && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{task.planner.priority_note}</p>}
      </li>)}</ul>
    </section>)}
    {!rows.length && <p className="text-sm text-gray-500 dark:text-gray-400">Приоритеты пока не заданы. Расставь задачи на доске.</p>}
    <Link to="/pool?view=queue" className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Открыть приоритеты <ChevronRight size={15} /></Link>
  </div>
}

function TodayHabits({ habits: foundationHabits, nodes, habitLog, habitError, saveHabit, savingHabit, draggedFoundation, setDraggedFoundation, reorderFoundation, open, onToggle }) {
  return <Surface className="today-habits overflow-hidden" aria-labelledby="habit-heading">
    <div className={`flex items-center gap-3 px-4 py-3 ${open ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls="today-habits-list" className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <h2 id="habit-heading" className="text-base font-semibold text-gray-900 dark:text-gray-100">Привычки</h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Основные · {foundationHabits.length}</p>
      </button>
      <Link to="/habits" className="shrink-0 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">Все привычки</Link>
      <button type="button" onClick={onToggle} aria-label={open ? 'Скрыть привычки' : 'Показать привычки'} aria-expanded={open} aria-controls="today-habits-list" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><ChevronDown size={18} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} /></button>
    </div>
    {open && <div id="today-habits-list">{foundationHabits.map((habit, index) => <div key={habit.id} draggable onDragStart={() => setDraggedFoundation(habit.id)} onDragOver={event => event.preventDefault()} onDrop={() => { reorderFoundation(draggedFoundation, habit.id); setDraggedFoundation(null) }} onDragEnd={() => setDraggedFoundation(null)} className={`flex items-center gap-3 px-4 py-2.5 ${index < foundationHabits.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}><GripVertical size={16} aria-hidden="true" className="shrink-0 cursor-grab text-gray-300 dark:text-gray-600" /><HabitInfo habit={habit} nodes={nodes} /><fieldset disabled={savingHabit} className="contents"><TrackInput habit={habit} value={habitLog[habit.id]} onChange={value => saveHabit(habit.id, value)} editable /></fieldset></div>)}</div>}
    {habitError && <p role="alert" className="px-4 py-2 text-xs text-rose-600">{habitError}</p>}
  </Surface>
}

export default function Today() {
  const [now, setNow] = useState(() => new Date())
  const today = localDay(now); const yesterday = addDays(today, -1); const tomorrow = addDays(today, 1)
  const { isRecoveryMode, toggleRecoveryMode } = useRecoveryMode()
  const [nodes, setNodes] = useState([]); const [plannerTasks, setPlannerTasks] = useState([]); const [habitDefs, setHabitDefs] = useState([]); const [habitCategories, setHabitCategories] = useState([]); const [habitLog, setHabitLog] = useState({}); const [memory, setMemory] = useState(null); const [memoryState, setMemoryState] = useState('loading'); const [loading, setLoading] = useState(true); const [error, setError] = useState(null); const [expanded, setExpanded] = useState({}); const [savingHabit, setSavingHabit] = useState(false); const [draggedFoundation, setDraggedFoundation] = useState(null)
  const [events, setEvents] = useState([])
  const [queueUnavailable, setQueueUnavailable] = useState(false)
  const [calendarUnavailable, setCalendarUnavailable] = useState(false)
  const [habitError, setHabitError] = useState('')
  const revision = useRef(0)
  const load = useCallback(async () => {
    const request = ++revision.current
    const [treeResult, queueResult, eventResult, definitionsResult, logResult, memoryResult] = await Promise.allSettled([
      treeApi.all(), plannerApi.queue(), calendarEvents.all(), habits.definitions(), habits.log(today), memories.all(yesterday),
    ])
    if (request !== revision.current) return
    setLoading(false)
    if (!Array.isArray(treeResult.value)) {
      setError('Не удалось загрузить задачи. Попробуй обновить страницу.')
      return
    }
    setError(null)
    setNodes(treeResult.value)
    const queue = queueResult.value?.tasks
    setPlannerTasks(Array.isArray(queue) ? queue : [])
    setQueueUnavailable(!Array.isArray(queue))
    const items = eventResult.value?.events
    setEvents(Array.isArray(items) ? items : [])
    setCalendarUnavailable(!Array.isArray(items))
    const categories = definitionsResult.value?.categories || []
    setHabitCategories(categories)
    setHabitDefs(activeHabits({ categories }, today))
    setHabitLog(logResult.value?.habits || {})
    setMemory(memoryResult.value?.[0] || null)
    setMemoryState(memoryResult.status === 'fulfilled' && !memoryResult.value?.error ? 'ready' : 'unavailable')
  }, [today, yesterday])
  useEffect(() => { load(); return () => { revision.current++ } }, [load])
  const attention = useMemo(() => {
    const hidden = loadHidden()
    const filters = loadFilters()
    return selectNextSteps({
      nodes, queue: queueUnavailable ? nodes : plannerTasks, events, now, recovery: isRecoveryMode,
      calendarVisible: node => calendarNodeVisible(node, hidden, filters),
    })
  }, [nodes, plannerTasks, queueUnavailable, events, now, isRecoveryMode])
  const schedule = useMemo(() => calendarCapacity(nodes, events, now, !calendarUnavailable), [nodes, events, now, calendarUnavailable])
  const nextMinute = (Math.floor(now.getTime() / 60000) + 1) * 60000
  usePlanningRefresh(Math.min(attention.nextChangeAt, nextMinute), setNow, load)
  const { tasks } = attention
  const obligation = attention.obligation
  const calendarEntry = obligation?.source === 'node' && obligation.item.id === attention.task?.id ? null : obligation
  const calendarWait = obligation?.source === 'node' && obligation.item.id === attention.held?.id
    ? attention.waitingReasons.get(obligation.item.id) : null
  const choices = workChoices(attention.steps, nodes, schedule)
  const primaryOption = Object.values(choices).flat().find(option => !option.firstStep && option.task.id === attention.task?.id)
  const primaryStep = Object.values(choices).flat().find(option => option.firstStep && option.task.id === attention.task?.id)
  const deadlines = deadlineGuidance(tasks, schedule, attention.waitingReasons)
  const visibleHabits = useMemo(() => isRecoveryMode ? habitDefs.filter(habit => habit.foundation) : habitDefs, [habitDefs, isRecoveryMode]); const foundationHabits = useMemo(() => orderedFoundationHabits(habitDefs.filter(habit => habit.foundation)), [habitDefs]); const maxScore = visibleHabits.reduce((total, habit) => total + (habit.max_score || 1), 0); const score = computeHabitScore(visibleHabits, habitLog); const tomorrowCount = attention.appointments.filter(entry => entry.date === tomorrow).length
  const saveHabit = async (habitId, value) => { if (savingHabit) return; const next = { ...habitLog, [habitId]: value }; setHabitLog(next); setSavingHabit(true); setHabitError(''); try { await habits.saveLog(today, { date: today, habits: next, score: computeHabitScore(visibleHabits, next), notes: '' }, 'habit_progress') } catch { setHabitLog(habitLog); setHabitError('Не удалось сохранить привычку. Попробуй ещё раз.') } finally { setSavingHabit(false) } }
  const reorderFoundation = async (sourceId, targetId) => { if (!sourceId || sourceId === targetId) return; const categories = reorderFoundationHabits(habitCategories, sourceId, targetId); try { await habits.saveDefinitions({ categories }); setHabitCategories(categories); setHabitDefs(activeHabits({ categories }, today)); setHabitError('') } catch { setHabitError('Не удалось сохранить порядок привычек.') } }
  const toggle = key => setExpanded(current => ({ ...current, [key]: !current[key] }))
  if (loading) return <div className="px-8 py-8 space-y-4" aria-busy="true" aria-live="polite"><div className="h-14 w-56 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" /><div className="h-64 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" /><div className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" /></div>
  if (error) return <div className="px-8 py-8 max-w-2xl" aria-live="polite"><Surface className="p-6 flex gap-3"><AlertCircle className="text-red-600 dark:text-red-400 mt-0.5" /><div><h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Сегодня</h1><p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{error}</p><Button type="button" onClick={load} variant="primary" className="mt-4 inline-flex items-center gap-2"><RefreshCw size={15} />Обновить</Button></div></Surface></div>
  return <main className="today-page mx-auto w-full max-w-5xl px-5 sm:px-8 py-5 sm:py-6 pb-12"><header className="today-header mb-4"><h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Сегодня</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400 capitalize">{formatDate(today)}</p></header>{isRecoveryMode && <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"><HeartPulse size={17} className="mt-0.5 flex-shrink-0" /><p className="flex-1"><span className="font-medium">Режим восстановления.</span> Показаны только задачи и привычки с отметкой «Ядро» или фундамент.</p><button type="button" onClick={() => toggleRecoveryMode(false)} className="text-sm font-medium underline underline-offset-2">Выйти</button></div>}{attention.hidden > 0 && <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">В режиме восстановления скрыто задач: {attention.hidden}.</p>}<div className="space-y-3">{queueUnavailable && <p role="status" className="text-sm text-amber-700">Не удалось обновить ручную очередь. Показаны данные из дерева задач.</p>}<Surface as="div" className="today-attention min-w-0 overflow-hidden">
    <div className={calendarEntry || calendarUnavailable ? 'today-focus-top today-focus-top--with-calendar' : 'today-focus-top'}>
      <AttentionCard attention={attention} nodes={nodes} partial={queueUnavailable || calendarUnavailable} now={now} schedule={schedule} option={primaryOption} step={primaryStep} deadline={deadlines.find(row => row.task.id === attention.task?.id)} onRefresh={load} />
      <Obligation entry={calendarEntry} waitingReason={calendarWait} nodes={nodes} calendarUnavailable={calendarUnavailable} />
    </div>
    <TodayWorkOptions attention={attention} choices={choices} deadlines={deadlines} nodes={nodes} now={now} schedule={schedule} onRefresh={load} />
  </Surface><OverdueNotice tasks={tasks} nodes={nodes} today={today} />{foundationHabits.length > 0 && <TodayHabits habits={foundationHabits} nodes={nodes} habitLog={habitLog} habitError={habitError} saveHabit={saveHabit} savingHabit={savingHabit} draggedFoundation={draggedFoundation} setDraggedFoundation={setDraggedFoundation} reorderFoundation={reorderFoundation} open={expanded.habits !== false} onToggle={() => setExpanded(current => ({ ...current, habits: current.habits !== false ? false : true }))} />}<ContextStrip memory={memory} memoryState={memoryState} tomorrowCount={tomorrowCount} calendarUnavailable={calendarUnavailable} /><section aria-labelledby="details-heading" className="pt-2"><h2 id="details-heading" className="today-details-heading mb-3 text-base font-semibold text-gray-900 dark:text-gray-100">Подробнее</h2><div className="today-details-grid"><Detail id="life-status-planner" title="Приоритеты задач" Icon={ListTodo} open={Boolean(expanded.planner)} onToggle={() => toggle('planner')}><PlannerDetails tasks={plannerTasks} nodes={nodes} waitingReasons={attention.waitingReasons} unavailable={queueUnavailable} /></Detail><Detail id="life-status-upcoming" title="Ближайшие 3 дня" Icon={CalendarDays} open={Boolean(expanded.upcoming)} onToggle={() => toggle('upcoming')}><UpcomingDetails appointments={attention.appointments} today={today} calendarUnavailable={calendarUnavailable} /></Detail><Detail id="life-status-spheres" title="Сферы" Icon={Layers3} open={Boolean(expanded.spheres)} onToggle={() => toggle('spheres')}><SphereDetails nodes={nodes} tasks={tasks} today={today} /></Detail><Detail id="life-status-yesterday" title="Вчера" Icon={ListTodo} open={Boolean(expanded.yesterday)} onToggle={() => toggle('yesterday')}><YesterdayDetails memory={memory} state={memoryState} /></Detail></div></section></div></main>
}
