import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Check, Circle, X, Minus, AlertTriangle, CalendarRange } from 'lucide-react'
import { tree as treeApi, habits, inbox } from '../api'
import NodeCard from '../components/NodeCard'
import { computeHabitScore, TrackInput, inTimeWindow, CYCLE_COLORS } from './Habits'
import PageOnboarding from '../components/PageOnboarding'

const PC = {
  green: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
  gray:  'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600',
  amber: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  red:   'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800',
}

const PILL_ICON = {
  check:  <Check size={10} />,
  circle: <Circle size={10} />,
  minus:  <Minus size={10} />,
  x:      <X size={10} />,
}

function getPillState(habit, value) {
  if (habit.kind === 'toggle') {
    if (value === true)  return { icon: 'check',  colorClass: PC.green, suffix: null }
    if (value === false) return { icon: 'x',      colorClass: PC.red,   suffix: null }
    return { icon: 'circle', colorClass: PC.gray, suffix: null }
  }

  if (habit.kind === 'counter') {
    const n = typeof value === 'number' ? value : 0
    if (habit.target === 0) {
      if (n === 0) return { icon: 'check', colorClass: PC.green, suffix: null }
      if (n === 1) return { icon: 'minus', colorClass: PC.amber, suffix: '1' }
      return { icon: 'x', colorClass: PC.red, suffix: String(n) }
    }
    const target = habit.target || 1
    if (n === 0) return { icon: 'circle', colorClass: PC.gray, suffix: null }
    if (n >= target) return { icon: 'check', colorClass: PC.green, suffix: `${n}/${target}` }
    return { icon: 'minus', colorClass: PC.amber, suffix: `${n}/${target}` }
  }

  if (habit.kind === 'cycle') {
    if (!value) return { icon: 'circle', colorClass: PC.gray, suffix: null }
    const score = habit.cycle_scores?.[value] || 0
    const maxScore = habit.max_score || 1
    const cycleLabel = habit.cycle_labels?.[value] || value
    const icon = score >= maxScore ? 'check' : score > 0 ? 'minus' : 'x'
    return { icon, colorClass: CYCLE_COLORS[value] || PC.green, suffix: cycleLabel }
  }

  if (habit.kind === 'time_window') {
    if (!value) return { icon: 'circle', colorClass: PC.gray, suffix: null }
    const inWin = inTimeWindow(habit.time_window, value)
    return { icon: inWin ? 'check' : 'minus', colorClass: inWin ? PC.green : PC.amber, suffix: value }
  }

  return { icon: 'circle', colorClass: PC.gray, suffix: null }
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function ringStroke(pct) {
  return pct >= 0.8 ? '#4ade80' : pct >= 0.5 ? '#fbbf24' : '#d1d5db'
}

function Ring({ pct, size, strokeWidth, children }) {
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.min(1, Math.max(0, pct || 0)))
  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} className="dark:stroke-gray-700" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={ringStroke(pct)} strokeWidth={strokeWidth}
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      {children && <div className="relative z-10 flex flex-col items-center leading-none">{children}</div>}
    </div>
  )
}

function SectionHeader({ title, count, link }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50 dark:border-gray-800/60">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex-1">{title}</span>
      {count > 0 && (
        <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full tabular-nums">{count}</span>
      )}
      {link && (
        <Link to={link.to} className="text-xs text-gray-300 dark:text-gray-600 hover:text-gray-500 transition-colors">
          {link.label} →
        </Link>
      )}
    </div>
  )
}

const START_H = 0
const END_H = 24
const HOUR_H = 52

function parseHour(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h + (m || 0) / 60
}

function DayTimeline({ allTasks, focusTasks, onScheduleTask, onRemoveTime }) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [calDate, setCalDate] = useState(todayStr)
  const [dragOverHour, setDragOverHour] = useState(null)
  const scrollRef = useRef()

  const isCalToday = calDate === todayStr
  const now = new Date()
  const nowH = now.getHours() + now.getMinutes() / 60

  useEffect(() => {
    if (!isCalToday || !scrollRef.current) return
    const offset = Math.max(0, (nowH - START_H - 1.5) / (END_H - START_H))
    scrollRef.current.scrollTop = offset * (END_H - START_H + 1) * HOUR_H
  }, [isCalToday]) // eslint-disable-line react-hooks/exhaustive-deps

  const hours = Array.from({ length: END_H - START_H + 1 }, (_, i) => i + START_H)

  const timedTasks = allTasks.filter(t => t.due === calDate && t.time && t.status !== 'done' && t.status !== 'dropped')
  const untimedTasks = allTasks.filter(t => t.due === calDate && !t.time && t.status !== 'done' && t.status !== 'dropped')
  const positioned = timedTasks
    .map(t => ({ ...t, startH: parseHour(t.time) }))
    .filter(t => t.startH != null && t.startH >= START_H && t.startH < END_H)

  const calLabel = isCalToday
    ? 'Сегодня'
    : calDate === addDays(todayStr, 1)
      ? 'Завтра'
      : new Date(calDate + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })

  const handleDrop = (e, h) => {
    e.preventDefault()
    setDragOverHour(null)
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId) onScheduleTask(taskId, h, calDate)
  }

  return (
    <div className="flex-1 min-h-0 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden">
      {/* Timeline header with independent day navigation */}
      <div className="flex items-center gap-1 px-3 py-2.5 border-b border-gray-50 dark:border-gray-800/60 flex-shrink-0">
        <button onClick={() => setCalDate(d => addDays(d, -1))} className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-base leading-none">‹</button>
        <span className="flex-1 text-center text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {calLabel}
        </span>
        <button onClick={() => setCalDate(d => addDays(d, 1))} className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-base leading-none">›</button>
      </div>

      {/* Untimed tasks for this day */}
      {untimedTasks.length > 0 && (
        <div className="flex-shrink-0 border-b border-gray-50 dark:border-gray-800 px-2 py-1.5 flex flex-wrap gap-1">
          {untimedTasks.map(t => (
            <div
              key={t.id}
              draggable
              onDragStart={e => { e.dataTransfer.setData('taskId', t.id); e.dataTransfer.effectAllowed = 'move' }}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 cursor-grab active:cursor-grabbing truncate max-w-[160px]"
              title={t.title}
            >
              <span className="truncate">{t.title}</span>
            </div>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        <div className="relative select-none" style={{ height: (END_H - START_H + 1) * HOUR_H }}>

          {hours.map(h => (
            <div
              key={h}
              className={`absolute left-0 right-0 flex transition-colors ${dragOverHour === h ? 'bg-indigo-50/70 dark:bg-indigo-900/20' : ''}`}
              style={{ top: (h - START_H) * HOUR_H, height: HOUR_H }}
              onDragOver={e => { e.preventDefault(); setDragOverHour(h) }}
              onDragLeave={() => setDragOverHour(null)}
              onDrop={e => handleDrop(e, h)}
              onClick={() => {}}
            >
              {/* Hour label — centered on the border line */}
              <div className="w-14 flex-shrink-0 pr-3 text-right self-start" style={{ marginTop: -8 }}>
                <span className="text-[10px] text-gray-300 dark:text-gray-700 tabular-nums leading-none">{h}:00</span>
              </div>

              {/* Slot area */}
              <div className="flex-1 border-t border-gray-50 dark:border-gray-800/70 relative hover:bg-gray-50/40 dark:hover:bg-gray-800/20 cursor-pointer transition-colors">

                {/* Timed tasks */}
                {positioned
                  .filter(t => Math.floor(t.startH) === h)
                  .map((t, i) => (
                    <div
                      key={t.id}
                      className="absolute left-1 right-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/25 border border-indigo-200 dark:border-indigo-700/40 px-2 py-1 overflow-hidden cursor-pointer"
                      style={{ top: Math.round((t.startH - h) * HOUR_H) + 2 + i * 2, height: HOUR_H - 8 }}
                      onClick={e => { e.stopPropagation(); onRemoveTime(t.id) }}
                      title="Нажми чтобы убрать время"
                    >
                      <p className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300 truncate leading-tight">{t.title}</p>
                      <p className="text-[9px] text-indigo-400/70">{t.time?.slice(0, 5)}</p>
                    </div>
                  ))
                }
              </div>
            </div>
          ))}

          {/* Current time indicator */}
          {isCalToday && nowH >= START_H && nowH <= END_H && (
            <div
              className="absolute left-0 right-0 pointer-events-none z-10"
              style={{ top: (nowH - START_H) * HOUR_H }}
            >
              <div className="flex items-center">
                <div className="w-14 flex-shrink-0" />
                <div className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0 -ml-1" />
                <div className="flex-1 border-t border-red-400" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drag hint */}
      <div className="flex-shrink-0 border-t border-gray-50 dark:border-gray-800 px-3 py-2">
        <p className="text-[9px] text-gray-300 dark:text-gray-600 uppercase tracking-wider">
          {focusTasks.length > 0 ? 'Перетащи задачу из фокуса на нужное время' : 'Нет задач в фокусе'}
        </p>
      </div>
    </div>
  )
}

export default function Today() {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(todayStr)
  const [showTimeline, setShowTimeline] = useState(() => localStorage.getItem('todayTimeline') === '1')
  const toggleTimeline = () => setShowTimeline(v => { localStorage.setItem('todayTimeline', v ? '0' : '1'); return !v })
  const isToday = date === todayStr

  const [allTasks, setAllTasks] = useState([])
  const [habitDefs, setHabitDefs] = useState([])
  const [habitLog, setHabitLog] = useState({})
  const [last6Logs, setLast6Logs] = useState({})
  const [inboxData, setInboxData] = useState([])
  const [selectedHabit, setSelectedHabit] = useState(null)
  const [loading, setLoading] = useState(true)

  const last6Days = Array.from({ length: 6 }, (_, i) => addDays(date, -(6 - i)))

  useEffect(() => {
    Promise.all([treeApi.leaves(), habits.definitions(), inbox.all()])
      .then(([leaves, h, ib]) => {
        setAllTasks(leaves.filter(x => x.status !== 'done' && x.status !== 'dropped' && x.status !== 'someday' && !x.calendar_id))
        const active = (h.categories || []).flatMap(c =>
          c.habits.filter(x =>
            x.active &&
            (!x.paused_until || x.paused_until < todayStr) &&
            (!x.active_until || x.active_until >= todayStr)
          )
        )
        setHabitDefs(active)
        setInboxData(ib.items || [])
        setLoading(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    habits.log(date).then(data => setHabitLog(data?.habits || {})).catch(() => setHabitLog({}))
  }, [date])

  useEffect(() => {
    if (!habitDefs.length) return
    Promise.allSettled(last6Days.map(d => habits.log(d))).then(results => {
      const m = {}
      last6Days.forEach((d, i) => {
        m[d] = results[i].status === 'fulfilled' ? results[i].value?.habits || {} : {}
      })
      setLast6Logs(m)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, habitDefs.length])

  const updateHabitLog = async (habitId, value) => {
    const updatedLog = { ...habitLog, [habitId]: value }
    setHabitLog(updatedLog)
    const score = computeHabitScore(habitDefs, updatedLog)
    await habits.saveLog(date, { date, habits: updatedLog, score, notes: '' })
  }

  const reload = () => {
    treeApi.leaves().then(leaves =>
      setAllTasks(leaves.filter(x => x.status !== 'done' && x.status !== 'dropped' && x.status !== 'someday' && !x.calendar_id))
    )
    inbox.all().then(ib => setInboxData(ib.items || []))
  }

  // Data slices
  const timedTasks = allTasks.filter(t => t.due === date && t.time && t.status !== 'done')
  const overdueTasks = allTasks.filter(t => t.due && t.due < date && (t.status === 'scheduled' || t.status === 'undefined' || !t.status))
  const scheduledToday = allTasks.filter(t => t.due === date && !t.time && t.status !== 'in_progress')
  const inProgressTasks = allTasks.filter(t => t.status === 'in_progress')
  const focusTasks = [...overdueTasks, ...scheduledToday, ...inProgressTasks]
  const upcomingTasks = allTasks
    .filter(t => {
      if (focusTasks.find(u => u.id === t.id)) return false
      if (timedTasks.find(u => u.id === t.id)) return false
      return t.status === 'scheduled' && t.due > date
    })
    .sort((a, b) => (a.due || 'z').localeCompare(b.due || 'z'))
    .slice(0, 8)
  const undefCount = allTasks.filter(t => (!t.status || t.status === 'undefined') && !t.is_blocked).length

  // Habits
  const habitTotal = habitDefs.length
  const habitScore = computeHabitScore(habitDefs, habitLog)
  const habitMaxScore = habitDefs.reduce((s, h) => s + (h.max_score || 1), 0)
  const habitPct = habitMaxScore > 0 ? habitScore / habitMaxScore : 0

  // Greeting
  const summaryParts = []
  const focusCount = overdueTasks.length + scheduledToday.length + inProgressTasks.length
  if (focusCount > 0) summaryParts.push(`${focusCount} задач`)
  if (habitTotal > 0) summaryParts.push(`${habitScore}/${habitMaxScore} привычек`)
  if (timedTasks.length > 0) summaryParts.push(`${timedTasks.length} в расписании`)

  if (loading) {
    return (
      <div className="flex gap-6 px-8 py-8">
        <div className="flex-1 space-y-4">
          {[80, 200, 160].map((h, i) => (
            <div key={i} className="rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" style={{ height: h }} />
          ))}
          <div className="grid grid-cols-2 gap-4">
            {[140, 120].map((h, i) => (
              <div key={i} className="rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" style={{ height: h }} />
            ))}
          </div>
        </div>
        {showTimeline && (
          <div className="w-80 flex-shrink-0 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" style={{ height: '80vh' }} />
        )}
      </div>
    )
  }

  return (
    <>
      <div style={{ height: 'calc(100vh - 3rem)' }} className="flex flex-col overflow-hidden">
        <PageOnboarding pageId="today" />
        {/* Greeting */}
        <div className="flex-shrink-0 flex items-start justify-between gap-4 px-8 pt-8 pb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 capitalize leading-tight">
              {formatDate(date)}
            </h1>
            {summaryParts.length > 0 && (
              <p className="text-sm text-gray-400 mt-1">{summaryParts.join(' · ')}</p>
            )}
            {!isToday && (
              <button onClick={() => setDate(todayStr)} className="text-xs text-blue-500 hover:text-blue-600 mt-1">
                → Сегодня
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-1">
            <button onClick={toggleTimeline}
              title={showTimeline ? 'Скрыть расписание' : 'Показать расписание'}
              className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                showTimeline
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}>
              <CalendarRange size={13} />
              Расписание
            </button>
            <div className="flex items-center gap-1">
              <button onClick={() => setDate(d => addDays(d, -1))}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-base">‹</button>
              <button onClick={() => setDate(d => addDays(d, 1))} disabled={date >= todayStr}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-base disabled:opacity-20">›</button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 px-8 pb-8 flex gap-6">

          {/* LEFT — main content */}
          <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="space-y-4 pb-4">

            {/* Focus */}
            {focusTasks.length > 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <SectionHeader title="Фокус" count={focusTasks.length} />
                <div className="px-2 py-2">
                  {overdueTasks.length > 0 && (
                    <div className="mb-1">
                      <div className="px-2 py-1 text-[10px] font-semibold text-red-400 uppercase tracking-wider">
                        Просрочено · {overdueTasks.length}
                      </div>
                      <div className="space-y-0.5">
                        {overdueTasks.map(t => <NodeCard key={t.id} node={t} onUpdate={reload} row draggable />)}
                      </div>
                    </div>
                  )}
                  {scheduledToday.length > 0 && (
                    <div className={`mb-1 ${overdueTasks.length > 0 ? 'mt-2 pt-2 border-t border-gray-50 dark:border-gray-800/60' : ''}`}>
                      <div className="px-2 py-1 text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
                        Сегодня · {scheduledToday.length}
                      </div>
                      <div className="space-y-0.5">
                        {scheduledToday.map(t => <NodeCard key={t.id} node={t} onUpdate={reload} row draggable />)}
                      </div>
                    </div>
                  )}
                  {inProgressTasks.length > 0 && (
                    <div className={`${(overdueTasks.length > 0 || scheduledToday.length > 0) ? 'mt-2 pt-2 border-t border-gray-50 dark:border-gray-800/60' : ''}`}>
                      <div className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${inProgressTasks.length > 3 ? 'text-red-400' : 'text-amber-400'}`}>
                        В работе · {inProgressTasks.length}
                        {inProgressTasks.length > 3 && (
                          <span className="ml-1.5 normal-case tracking-normal text-red-400/90 font-normal">— слишком много, выбери 3 главные</span>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        {inProgressTasks.map(t => <NodeCard key={t.id} node={t} onUpdate={reload} row draggable />)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 px-6 py-6 text-center text-sm text-gray-400">
                Нет срочных задач
              </div>
            )}

            {/* Habits */}
            {habitDefs.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <SectionHeader title="Привычки" link={{ to: '/habits', label: 'Все' }} />
                <div className="px-4 py-3">
                  <div className="flex items-end gap-4 mb-4">
                    <Ring pct={habitPct} size={64} strokeWidth={6}>
                      <span className="text-base font-bold text-gray-900 dark:text-gray-100 leading-none">{habitScore}</span>
                      <span className="text-[9px] text-gray-400 leading-none">/{habitMaxScore}</span>
                    </Ring>
                    <div className="flex gap-3">
                      {last6Days.map(d => {
                        const log = last6Logs[d] || {}
                        const score = computeHabitScore(habitDefs, log)
                        const pct = habitMaxScore > 0 ? score / habitMaxScore : 0
                        const dayNum = d.slice(8)
                        const dayName = new Date(d + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'short' }).slice(0, 2)
                        return (
                          <div key={d} className="flex flex-col items-center gap-0.5">
                            <Ring pct={pct} size={26} strokeWidth={3} />
                            <span className="text-[9px] font-medium text-gray-500 leading-none">{dayNum}</span>
                            <span className="text-[8px] text-gray-300 dark:text-gray-600 leading-none capitalize">{dayName}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {habitDefs.map(h => {
                      const { icon, colorClass, suffix } = getPillState(h, habitLog[h.id])
                      return (
                        <button
                          key={h.id}
                          onClick={() => date <= todayStr && setSelectedHabit(h)}
                          disabled={date > todayStr}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all border ${colorClass}`}
                        >
                          {PILL_ICON[icon]}
                          <span>{h.label}</span>
                          {suffix && <span className="opacity-60 font-normal">· {suffix}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Upcoming + Inbox */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <SectionHeader title="Ближайшие" link={{ to: '/pool', label: 'Все' }} />
                <div className="px-2 py-2">
                  {upcomingTasks.length === 0 ? (
                    <p className="text-sm text-gray-400 px-2 py-1">Нет запланированных</p>
                  ) : (
                    <div className="space-y-0.5">
                      {upcomingTasks.map(t => <NodeCard key={t.id} node={t} onUpdate={reload} row />)}
                    </div>
                  )}
                  {undefCount > 0 && (
                    <Link to="/goals" className="flex items-center gap-1.5 mt-2 pt-2 mx-2 border-t border-gray-50 dark:border-gray-800 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                      <AlertTriangle size={11} className="text-amber-400" />
                      {undefCount} без решения
                    </Link>
                  )}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <SectionHeader title="Входящие" count={inboxData.length} link={{ to: '/inbox', label: 'Открыть' }} />
                <div className="px-4 py-3">
                  {inboxData.length === 0 ? (
                    <p className="text-sm text-gray-400">Пусто</p>
                  ) : (
                    <div className="space-y-2">
                      {inboxData.slice(0, 6).map(item => (
                        <div key={item.id} className="flex items-start gap-2 group">
                          <p className="flex-1 text-xs text-gray-600 dark:text-gray-400 leading-relaxed min-w-0">{item.text}</p>
                          <button onClick={() => inbox.delete(item.id).then(reload)}
                            className="text-gray-200 dark:text-gray-700 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100 mt-0.5">
                            <X size={12} /></button>
                        </div>
                      ))}
                      {inboxData.length > 6 && (
                        <p className="text-xs text-gray-300 dark:text-gray-600">+{inboxData.length - 6} ещё</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* RIGHT — timeline, on-demand via the Расписание toggle */}
          {showTimeline && (
          <div className="w-80 flex-shrink-0 flex flex-col">
            <DayTimeline
              allTasks={allTasks}
              focusTasks={focusTasks}
              onScheduleTask={async (taskId, hour, calDate) => {
                const timeStr = `${String(hour).padStart(2, '0')}:00`
                await treeApi.update(taskId, { time: timeStr, due: calDate })
                reload()
              }}
              onRemoveTime={async (taskId) => {
                await treeApi.update(taskId, { time: null })
                reload()
              }}
            />
          </div>
          )}
        </div>
      </div>


      {/* Habit modal */}
      {selectedHabit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedHabit(null)}>
          <div className="absolute inset-0 bg-black/20 dark:bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-gray-100 dark:border-gray-800" onClick={e => e.stopPropagation()}>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">{selectedHabit.label}</div>
            {selectedHabit.detail && <div className="text-xs text-gray-400 mb-5">{selectedHabit.detail}</div>}
            <div className="flex items-center justify-center py-3">
              <TrackInput
                habit={selectedHabit}
                value={habitLog[selectedHabit.id]}
                onChange={val => updateHabitLog(selectedHabit.id, val)}
                editable={date <= todayStr}
              />
            </div>
            <button onClick={() => setSelectedHabit(null)} className="w-full mt-4 py-2 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              Готово
            </button>
          </div>
        </div>
      )}
    </>
  )
}
