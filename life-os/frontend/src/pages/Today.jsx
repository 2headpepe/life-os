import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Clock3, HeartPulse, Layers3, ListTodo, RefreshCw } from 'lucide-react'
import { habits, memories, tree as treeApi } from '../api'
import { computeHabitScore, TrackInput } from './Habits'
import { useRecoveryMode } from '../context/RecoveryModeContext'
import Surface from '../components/ui/Surface'
import { Button } from '../components/ui/Button'
import { entityPath, nodePath } from '../utils/entityLinks'

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
  return (definitions?.categories || []).flatMap(category => category.habits || []).filter(habit =>
    habit.active && (!habit.paused_until || habit.paused_until < today) && (!habit.active_until || habit.active_until >= today),
  )
}

function personalLeaves(nodes) {
  const parents = new Set(nodes.filter(node => node.parent_id).map(node => node.parent_id))
  return nodes.filter(node => !parents.has(node.id) && (node.work_context || 'personal') === 'personal' && node.status !== 'done' && node.status !== 'dropped' && node.status !== 'someday' && !node.calendar_id)
}

function attentionFor(tasks, today, recoveryMode) {
  const visible = recoveryMode ? tasks.filter(task => task.core) : tasks
  const overdue = visible.filter(task => task.due && task.due < today && (task.status === 'scheduled' || task.status === 'undefined' || !task.status))
  const inProgress = visible.filter(task => task.status === 'in_progress')
  const scheduledToday = visible.filter(task => task.status === 'scheduled' && task.due === today)
  const task = overdue[0] || inProgress[0] || scheduledToday[0] || null
  return { task, kind: task && (overdue.includes(task) ? 'overdue' : inProgress.includes(task) ? 'in_progress' : 'today'), hidden: recoveryMode ? tasks.length - visible.length : 0 }
}

function AttentionCard({ attention, nodes }) {
  const copy = {
    overdue: ['Просрочено', 'У этой задачи прошёл срок', CircleAlert, 'text-red-600 dark:text-red-400'],
    in_progress: ['В работе', 'Задача уже начата', Clock3, 'text-amber-600 dark:text-amber-400'],
    today: ['Запланировано на сегодня', 'Задача с датой сегодня', CalendarDays, 'text-blue-600 dark:text-blue-400'],
  }
  if (!attention.task) return <Surface className="today-attention p-6 sm:p-8" aria-labelledby="attention-heading"><div className="flex gap-3"><CheckCircle2 size={22} className="text-green-600 dark:text-green-400 mt-0.5" /><div><h2 id="attention-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100">Нет задач, требующих внимания</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Можно открыть общий список, если хочешь спланировать день.</p><Link to="/pool" className="inline-flex mt-4 items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Все задачи <ChevronRight size={15} /></Link></div></div></Surface>
  const [title, detail, Icon, color] = copy[attention.kind]
  const taskHref = nodePath(nodes, attention.task)
  return <Surface className="today-attention p-6 sm:p-8" aria-labelledby="attention-heading"><div className="flex gap-3"><Icon size={22} className={`${color} mt-0.5 flex-shrink-0`} /><div className="min-w-0"><p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Требует внимания</p><p className={`mt-1 text-sm font-medium ${color}`}>{title}</p><h2 id="attention-heading" className="mt-2 text-xl font-semibold text-gray-900 dark:text-gray-100 break-words">{attention.task.title}</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detail}</p><div className="mt-5 flex flex-wrap gap-4 items-center"><Link to={taskHref || '/goals'} className="ds-button ds-button--primary">Открыть задачу</Link><Link to="/pool" className="today-secondary-link inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Все задачи <ChevronRight size={15} /></Link></div></div></div></Surface>
}

function ContextStrip({ memory, memoryState, score, maxScore, tomorrowCount }) {
  const yesterday = memoryState === 'unavailable' ? 'Вчера: данные недоступны' : memory ? 'Вчера: есть запись' : 'Вчера: нет записи'
  const items = [[yesterday, '/memories'], [`Привычки: ${maxScore ? `${score} из ${maxScore}` : 'нет активных'}`, '/habits'], [`Завтра: ${tomorrowCount ? `${tomorrowCount} ${tomorrowCount === 1 ? 'дело' : 'дела'}` : 'ничего не запланировано'}`, '/calendar']]
  return <Surface className="today-context divide-y divide-gray-100 dark:divide-gray-800 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label="Краткий контекст дня">{items.map(([label, to]) => <Link key={to} to={to} className="flex items-center justify-between gap-2 px-4 py-3.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/40"><span>{label}</span><ChevronRight size={16} /></Link>)}</Surface>
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

export default function Today() {
  const today = dateString(); const yesterday = addDays(today, -1); const tomorrow = addDays(today, 1)
  const { isRecoveryMode, toggleRecoveryMode } = useRecoveryMode()
  const [nodes, setNodes] = useState([]); const [habitDefs, setHabitDefs] = useState([]); const [habitLog, setHabitLog] = useState({}); const [memory, setMemory] = useState(null); const [memoryState, setMemoryState] = useState('loading'); const [loading, setLoading] = useState(true); const [error, setError] = useState(null); const [expanded, setExpanded] = useState({}); const [savingHabit, setSavingHabit] = useState(false)
  const load = useCallback(async () => { setLoading(true); setError(null); const [treeResult, definitionsResult, logResult, memoryResult] = await Promise.allSettled([treeApi.all(), habits.definitions(), habits.log(today), memories.all(yesterday)]); if (treeResult.status !== 'fulfilled') { setError('Не удалось загрузить задачи. Попробуй обновить страницу.'); setLoading(false); return } setNodes(treeResult.value || []); setHabitDefs(definitionsResult.status === 'fulfilled' ? activeHabits(definitionsResult.value, today) : []); setHabitLog(logResult.status === 'fulfilled' ? logResult.value?.habits || {} : {}); if (memoryResult.status === 'fulfilled') { setMemory(memoryResult.value?.[0] || null); setMemoryState('ready') } else { setMemory(null); setMemoryState('unavailable') } setLoading(false) }, [today, yesterday])
  useEffect(() => { load() }, [load])
  const tasks = useMemo(() => personalLeaves(nodes), [nodes]); const attention = useMemo(() => attentionFor(tasks, today, isRecoveryMode), [tasks, today, isRecoveryMode]); const visibleHabits = useMemo(() => isRecoveryMode ? habitDefs.filter(habit => habit.foundation) : habitDefs, [habitDefs, isRecoveryMode]); const maxScore = visibleHabits.reduce((total, habit) => total + (habit.max_score || 1), 0); const score = computeHabitScore(visibleHabits, habitLog); const quickHabit = visibleHabits.find(habit => habit.kind === 'toggle') || visibleHabits[0] || null; const tomorrowCount = tasks.filter(task => task.status === 'scheduled' && task.due === tomorrow).length
  const saveHabit = async (habitId, value) => { const next = { ...habitLog, [habitId]: value }; setHabitLog(next); setSavingHabit(true); try { await habits.saveLog(today, { date: today, habits: next, score: computeHabitScore(visibleHabits, next), notes: '' }, 'habit_progress') } catch { setHabitLog(habitLog) } finally { setSavingHabit(false) } }
  const toggle = key => setExpanded(current => ({ ...current, [key]: !current[key] }))
  if (loading) return <div className="px-8 py-8 space-y-4" aria-busy="true" aria-live="polite"><div className="h-14 w-56 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" /><div className="h-64 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" /><div className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" /></div>
  if (error) return <div className="px-8 py-8 max-w-2xl" aria-live="polite"><Surface className="p-6 flex gap-3"><AlertCircle className="text-red-600 dark:text-red-400 mt-0.5" /><div><h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Сегодня</h1><p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{error}</p><Button type="button" onClick={load} variant="primary" className="mt-4 inline-flex items-center gap-2"><RefreshCw size={15} />Обновить</Button></div></Surface></div>
  return <main className="today-page mx-auto w-full max-w-5xl px-5 sm:px-8 py-8 pb-12"><header className="today-header mb-6"><p className="today-kicker">Life OS · дневной обзор</p><h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Сегодня</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400 capitalize">{formatDate(today)} · Статус жизни</p></header>{isRecoveryMode && <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"><HeartPulse size={17} className="mt-0.5 flex-shrink-0" /><p className="flex-1"><span className="font-medium">Режим восстановления.</span> Показаны только задачи и привычки с отметкой «Ядро» или фундамент.</p><button type="button" onClick={() => toggleRecoveryMode(false)} className="text-sm font-medium underline underline-offset-2">Выйти</button></div>}{attention.hidden > 0 && <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">В режиме восстановления скрыто задач: {attention.hidden}.</p>}<div className="space-y-4"><AttentionCard attention={attention} nodes={nodes} /><ContextStrip memory={memory} memoryState={memoryState} score={score} maxScore={maxScore} tomorrowCount={tomorrowCount} />{quickHabit && <Surface className="today-habit p-4 sm:flex sm:items-center sm:justify-between gap-4" aria-labelledby="habit-heading"><div><h2 id="habit-heading" className="text-base font-semibold text-gray-900 dark:text-gray-100">Привычка дня</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{quickHabit.label}</p></div><div className="mt-3 sm:mt-0 flex items-center gap-4"><TrackInput habit={quickHabit} value={habitLog[quickHabit.id]} onChange={value => saveHabit(quickHabit.id, value)} editable={!savingHabit} /><Link to={entityPath.habit(quickHabit.id)} className="today-secondary-link text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">К привычке</Link></div></Surface>}<section aria-labelledby="details-heading" className="pt-4"><h2 id="details-heading" className="today-details-heading mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Подробнее</h2><div className="space-y-3"><Detail id="life-status-spheres" title="Сферы" Icon={Layers3} open={Boolean(expanded.spheres)} onToggle={() => toggle('spheres')}><SphereDetails nodes={nodes} tasks={tasks} today={today} /></Detail><Detail id="life-status-yesterday" title="Вчера" Icon={ListTodo} open={Boolean(expanded.yesterday)} onToggle={() => toggle('yesterday')}><YesterdayDetails memory={memory} state={memoryState} /></Detail><Detail id="life-status-upcoming" title="Ближайшие 3 дня" Icon={CalendarDays} open={Boolean(expanded.upcoming)} onToggle={() => toggle('upcoming')}><UpcomingDetails tasks={tasks} today={today} /></Detail></div><p className="mt-5 text-sm text-gray-500 dark:text-gray-400">Подробное планирование — <Link to="/calendar" className="today-secondary-link font-medium text-blue-600 dark:text-blue-400 hover:underline">в календаре</Link>.</p></section></div></main>
}
