import { useState, useEffect, useCallback } from 'react'
import { Check, X, Target } from 'lucide-react'
import { habits, tree as treeApi } from '../api'

const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('ru-RU', {
    weekday: 'short', day: 'numeric', month: 'short'
  })
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return d.toISOString().slice(0, 10)
}

function getWeekDates(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

export function inTimeWindow(tw, value) {
  if (!value || !tw) return false
  const crosses = tw.end <= tw.start
  if (crosses) return value >= tw.start || value <= tw.end
  return value >= tw.start && value <= tw.end
}

export function habitIsDone(habit, value) {
  if (habit.kind === 'toggle') return value === true
  if (habit.kind === 'counter') {
    const n = typeof value === 'number' ? value : 0
    return habit.target === 0 ? n === 0 : n >= habit.target
  }
  if (habit.kind === 'cycle') return Boolean(value) && (habit.cycle_scores?.[value] || 0) >= (habit.max_score || 1)
  if (habit.kind === 'time_window') return inTimeWindow(habit.time_window, value)
  if (habit.kind === 'bp') return Array.isArray(value) && value.length > 0
  return false
}

export function computeHabitScore(allHabits, log) {
  let score = 0
  for (const h of allHabits) {
    const v = log[h.id]
    if (h.kind === 'toggle' && v === true) score += h.max_score || 1
    else if (h.kind === 'counter') {
      const n = typeof v === 'number' ? v : 0
      if (h.target === 0) score += n === 0 ? (h.max_score || 2) : n === 1 ? 1 : 0
      else score += n >= h.target ? (h.max_score || 2) : n > 0 ? 1 : 0
    } else if (h.kind === 'cycle') {
      score += h.cycle_scores?.[v] || 0
    } else if (h.kind === 'time_window') {
      if (!v) score += 0
      else if (inTimeWindow(h.time_window, v)) score += h.max_score || 2
      else score += 1
    } else if (h.kind === 'bp') {
      score += Array.isArray(v) && v.length > 0 ? (h.max_score || 1) : 0
    }
  }
  return score
}

// ─── Tracking tab: full-size inputs ────────────────────────────────

export const CYCLE_COLORS = {
  none: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
  no_toxicity: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-200',
  positive: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border-blue-200',
  deep: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 border-purple-200',
  light: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200',
  heavy: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border-red-200',
  over: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border-red-200',
  within: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-200',
  partial: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200',
  done: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-200',
  nothing_needed: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700',
  bronze: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200',
  silver: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600',
  gold: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 border-yellow-200',
  nothing: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800',
  petting: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  sex: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
}

function TrackToggle({ value, onChange }) {
  const next = (value === undefined || value === null) ? true : value === true ? false : null
  return (
    <button
      onClick={() => onChange(next)}
      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all
        ${value === true  ? 'bg-green-400 dark:bg-green-500 text-white'
        : value === false ? 'bg-red-400 dark:bg-red-500 text-white'
        :                   'border-2 border-gray-300 dark:border-gray-600 text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'}`}
    >
      {value === true ? <Check size={14} /> : value === false ? <X size={14} /> : <span className="text-[11px] leading-none select-none">—</span>}
    </button>
  )
}

function TrackCounter({ habit, value, onChange }) {
  const v = typeof value === 'number' ? value : 0
  const color = habit.target === 0
    ? (v === 0 ? 'text-green-500' : v === 1 ? 'text-amber-500' : 'text-red-500')
    : (v >= habit.target ? 'text-green-500' : v > 0 ? 'text-amber-500' : 'text-gray-400')
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(0, v - 1))}
        disabled={v === 0}
        className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 flex items-center justify-center"
      >−</button>
      <span className={`text-lg font-semibold w-8 text-center ${color}`}>{v}</span>
      <button
        onClick={() => onChange(v + 1)}
        className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center"
      >+</button>
      {habit.target > 0 && <span className="text-xs text-gray-400">/ {habit.target}</span>}
    </div>
  )
}

function TrackCycle({ habit, value, onChange }) {
  const cycle = habit.cycle || []
  const currentIdx = cycle.indexOf(value)
  const handleClick = () => onChange(cycle[(currentIdx + 1) % cycle.length])
  const label = value ? (habit.cycle_labels?.[value] || value) : 'Не отмечено'
  const colorClass = value ? (CYCLE_COLORS[value] || 'bg-gray-100 text-gray-600 border-gray-200') : 'bg-gray-50 dark:bg-gray-900 text-gray-400 border-gray-200 dark:border-gray-700'
  return (
    <button
      onClick={handleClick}
      className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-opacity hover:opacity-75 ${colorClass}`}
    >{label}</button>
  )
}

function TrackTimeWindow({ habit, value, onChange }) {
  const tw = habit.time_window
  const ok = inTimeWindow(tw, value)
  const color = value ? (ok ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400') : ''
  return (
    <div className="flex items-center gap-2">
      <input
        type="time"
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
        className={`text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 outline-none cursor-pointer ${color}`}
      />
      {tw && <span className="text-xs text-gray-400">{tw.start}–{tw.end}</span>}
    </div>
  )
}

function TrackBP({ value, onChange }) {
  const readings = Array.isArray(value) ? value : []
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ time: '', sys: '', dia: '', pulse: '' })

  const addReading = () => {
    if (!form.sys || !form.dia) return
    const r = {
      time: form.time || new Date().toTimeString().slice(0, 5),
      sys: Number(form.sys),
      dia: Number(form.dia),
      ...(form.pulse ? { pulse: Number(form.pulse) } : {}),
    }
    onChange([...readings, r])
    setForm({ time: '', sys: '', dia: '', pulse: '' })
    setAdding(false)
  }

  const remove = (i) => onChange(readings.filter((_, idx) => idx !== i))

  return (
    <div className="flex flex-col gap-1.5 items-start">
      {readings.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-400 tabular-nums w-10">{r.time}</span>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{r.sys}/{r.dia}</span>
          {r.pulse && <span className="text-xs text-gray-400">пульс {r.pulse}</span>}
          <button onClick={() => remove(i)} className="text-gray-300 hover:text-red-400 transition-colors"><X size={10} /></button>
        </div>
      ))}
      {adding ? (
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          <input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
            className="text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-1 w-[72px] outline-none" />
          <input type="number" placeholder="сист" value={form.sys} onChange={e => setForm(f => ({ ...f, sys: e.target.value }))}
            className="text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-1 w-14 outline-none" />
          <span className="text-gray-400 text-xs">/</span>
          <input type="number" placeholder="диаст" value={form.dia} onChange={e => setForm(f => ({ ...f, dia: e.target.value }))}
            className="text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-1 w-14 outline-none" />
          <input type="number" placeholder="пульс" value={form.pulse} onChange={e => setForm(f => ({ ...f, pulse: e.target.value }))}
            className="text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-1 w-14 outline-none" />
          <button onClick={addReading} disabled={!form.sys || !form.dia}
            className="text-xs text-blue-500 hover:text-blue-600 disabled:opacity-40 font-medium">OK</button>
          <button onClick={() => { setAdding(false); setForm({ time: '', sys: '', dia: '', pulse: '' }) }}
            className="text-xs text-gray-400 hover:text-gray-500"><X size={10} /></button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="text-xs text-blue-400 hover:text-blue-500 transition-colors">+ измерение</button>
      )}
    </div>
  )
}

export function TrackInput({ habit, value, onChange, editable }) {
  if (!editable) return <span className="text-xs text-gray-300 dark:text-gray-700">—</span>
  if (habit.kind === 'toggle')      return <TrackToggle value={value} onChange={onChange} />
  if (habit.kind === 'counter')     return <TrackCounter habit={habit} value={value} onChange={onChange} />
  if (habit.kind === 'cycle')       return <TrackCycle habit={habit} value={value} onChange={onChange} />
  if (habit.kind === 'time_window') return <TrackTimeWindow habit={habit} value={value} onChange={onChange} />
  if (habit.kind === 'bp')          return <TrackBP value={value} onChange={onChange} />
  return null
}

// ─── History tab: compact dot grid ────────────────────────────────

const DOT_COLORS = {
  none: 'bg-green-400', no_toxicity: 'bg-green-300',
  positive: 'bg-blue-400', deep: 'bg-purple-400',
  light: 'bg-amber-300', heavy: 'bg-red-400',
  over: 'bg-red-400', within: 'bg-green-400',
  partial: 'bg-amber-300', done: 'bg-green-400',
  nothing_needed: 'bg-gray-300 dark:bg-gray-600',
  bronze: 'bg-amber-500', silver: 'bg-gray-400', gold: 'bg-yellow-400',
  nothing: 'bg-gray-300 dark:bg-gray-600',
  petting: 'bg-pink-300', sex: 'bg-pink-500',
}

function HistDot({ habit, value }) {
  const empty = 'w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-800'
  if (habit.kind === 'toggle') {
    const color = value === true ? 'bg-green-400' : value === false ? 'bg-red-300 dark:bg-red-500/60' : 'bg-gray-100 dark:bg-gray-800'
    return <div className={`w-4 h-4 rounded-full ${color}`} />
  }
  if (habit.kind === 'counter') {
    const v = typeof value === 'number' ? value : 0
    const isGood = habit.target === 0 ? v === 0 : v >= habit.target
    const isBad = habit.target === 0 ? v >= 2 : v === 0
    const color = !v && habit.target > 0 ? 'bg-gray-100 dark:bg-gray-800'
      : isGood ? 'bg-green-400' : isBad ? 'bg-red-300' : 'bg-amber-300'
    return <div className={`w-4 h-4 rounded-full ${color}`} title={String(v)} />
  }
  if (habit.kind === 'cycle') {
    if (!value) return <div className={empty} />
    return <div className={`w-4 h-4 rounded-full ${DOT_COLORS[value] || 'bg-gray-300'}`} title={habit.cycle_labels?.[value] || value} />
  }
  if (habit.kind === 'time_window') {
    const ok = inTimeWindow(habit.time_window, value)
    const color = !value ? 'bg-gray-100 dark:bg-gray-800' : ok ? 'bg-green-400' : 'bg-amber-300'
    return <div className={`w-4 h-4 rounded-full ${color}`} title={value || '—'} />
  }
  if (habit.kind === 'bp') {
    const has = Array.isArray(value) && value.length > 0
    const tip = has ? value.map(r => `${r.time} ${r.sys}/${r.dia}${r.pulse ? ` пульс ${r.pulse}` : ''}`).join('; ') : '—'
    return <div className={`w-4 h-4 rounded-full ${has ? 'bg-green-400' : 'bg-gray-100 dark:bg-gray-800'}`} title={tip} />
  }
  return <div className={empty} />
}

// ─── Gaps view ─────────────────────────────────────────────────────

function GapsView({ defs, todayStr, onJump }) {
  const [logs, setLogs] = useState({})
  const [loading, setLoading] = useState(true)
  const dates = Array.from({ length: 14 }, (_, i) => addDays(todayStr, -(13 - i)))

  useEffect(() => {
    Promise.allSettled(dates.map(d => habits.log(d))).then(results => {
      const m = {}
      dates.forEach((d, i) => {
        m[d] = results[i].status === 'fulfilled' ? (results[i].value?.habits || {}) : {}
      })
      setLogs(m)
      setLoading(false)
    })
  }, []) // eslint-disable-line

  const trackable = defs.filter(h => !(h.kind === 'counter' && h.target === 0))

  const getMissing = (log) => trackable.filter(h => {
    const v = log[h.id]
    const empty = h.kind === 'toggle'  ? (v === undefined || v === null)
                : h.kind === 'counter' ? !(typeof v === 'number' && v > 0)
                : h.kind === 'bp'      ? !(Array.isArray(v) && v.length > 0)
                : !v
    return empty && !h.optional
  })

  if (loading) return <div className="text-sm text-center text-gray-400 py-8">Загрузка...</div>

  const rows = [...dates].reverse()
    .map(d => ({ d, missing: getMissing(logs[d] || {}) }))
    .filter(r => r.missing.length > 0)

  if (!rows.length) return (
    <div className="flex flex-col items-center gap-3 py-12 text-gray-400">
      <Check size={28} className="text-green-400" />
      <div className="text-sm">Всё отмечено за последние 14 дней</div>
    </div>
  )

  return (
    <div className="space-y-3">
      {rows.map(({ d, missing }) => {
        const isToday = d === todayStr
        const dayLabel = isToday
          ? 'Сегодня'
          : new Date(d + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })
        return (
          <div key={d} className="card overflow-hidden">
            <button
              onClick={() => onJump(d)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors border-b border-gray-100 dark:border-gray-800"
            >
              <span className={`text-sm font-semibold capitalize ${isToday ? 'text-blue-500' : 'text-gray-700 dark:text-gray-300'}`}>
                {dayLabel}
              </span>
              <span className="text-xs text-amber-500 font-medium">{missing.length} не отмечено →</span>
            </button>
            <div className="px-4 py-3 flex flex-wrap gap-1.5">
              {missing.map(h => (
                <span key={h.id} className="text-xs px-2 py-0.5 rounded-md bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                  {h.label}
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────

function buildDefs(categories, todayStr) {
  const allActive = [], paused = []
  for (const c of categories) {
    for (const h of (c.habits || [])) {
      if (!h.active) continue
      if (h.active_until && h.active_until < todayStr) continue
      const enriched = { ...h, category: c.label, categoryId: c.id }
      if (h.paused_until && h.paused_until >= todayStr) paused.push(enriched)
      else allActive.push(enriched)
    }
  }
  const grouped = {}
  for (const h of allActive) {
    if (!grouped[h.category]) grouped[h.category] = []
    grouped[h.category].push(h)
  }
  return { allActive, paused, grouped, maxTotal: allActive.reduce((s, x) => s + (x.max_score || 1), 0) }
}

// ─── Main ──────────────────────────────────────────────────────────

export default function Habits() {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [tab, setTab] = useState('track')
  const [treeNodes, setTreeNodes] = useState([])
  const [goalPickerFor, setGoalPickerFor] = useState(null)
  const [collapsedCats, setCollapsedCats] = useState(
    () => new Set(JSON.parse(localStorage.getItem('habitCollapsedCats') || '[]'))
  )
  const toggleCat = (cat) => setCollapsedCats(prev => {
    const next = new Set(prev)
    next.has(cat) ? next.delete(cat) : next.add(cat)
    localStorage.setItem('habitCollapsedCats', JSON.stringify([...next]))
    return next
  })
  const [trackDate, setTrackDate] = useState(todayStr)
  const [histWeekStart, setHistWeekStart] = useState(getWeekStart(todayStr))

  const [rawCategories, setRawCategories] = useState([])
  const [defs, setDefs] = useState([])
  const [grouped, setGrouped] = useState({})
  const [maxTotal, setMaxTotal] = useState(0)
  const [pausedHabits, setPausedHabits] = useState([])

  const [dayLog, setDayLog] = useState({})
  const [dayScore, setDayScore] = useState(0)

  const [weekLogs, setWeekLogs] = useState({})
  const [weekScores, setWeekScores] = useState({})

  const [loading, setLoading] = useState(true)
  const [pauseTarget, setPauseTarget] = useState(null)
  const [pauseDate, setPauseDate] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ label: '', categoryId: '', kind: 'toggle', target: '' })

  const applyDefs = (categories) => {
    setRawCategories(categories)
    const { allActive, paused, grouped: g, maxTotal: mt } = buildDefs(categories, todayStr)
    setDefs(allActive)
    setPausedHabits(paused)
    setGrouped(g)
    setMaxTotal(mt)
  }

  useEffect(() => {
    Promise.all([habits.definitions(), treeApi.all()]).then(([h, nodes]) => {
      applyDefs(h.categories || [])
      setTreeNodes(nodes || [])
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!defs.length) return
    habits.log(trackDate).then(data => {
      const log = data?.habits || {}
      setDayLog(log)
      setDayScore(computeHabitScore(defs, log))
    }).catch(() => { setDayLog({}); setDayScore(0) })
  }, [trackDate, defs])

  useEffect(() => {
    if (!defs.length) return
    const weekDates = getWeekDates(histWeekStart)
    Promise.allSettled(weekDates.map(d => habits.log(d))).then(results => {
      const logsMap = {}, scoresMap = {}
      weekDates.forEach((d, i) => {
        const data = results[i].status === 'fulfilled' ? results[i].value?.habits || {} : {}
        logsMap[d] = data
        scoresMap[d] = results[i].status === 'fulfilled' && results[i].value?.score != null
          ? results[i].value.score : computeHabitScore(defs, data)
      })
      setWeekLogs(logsMap)
      setWeekScores(scoresMap)
    })
  }, [histWeekStart, defs])

  const saveDefs = async (updated) => {
    await habits.saveDefinitions({ categories: updated })
    applyDefs(updated)
  }

  // Habit → goal link. Goals = non-leaf tree nodes (containers/domains).
  const nodeById = Object.fromEntries(treeNodes.map(n => [n.id, n]))
  const parentIds = new Set(treeNodes.map(n => n.parent_id).filter(Boolean))
  const goalNodes = treeNodes.filter(n => parentIds.has(n.id))
  const rootTitleOf = (id) => {
    let n = nodeById[id], guard = 0
    while (n && n.parent_id && guard++ < 20) n = nodeById[n.parent_id]
    return n?.title || ''
  }
  const setHabitGoal = async (habitId, nodeId) => {
    const updated = rawCategories.map(c => ({
      ...c, habits: c.habits.map(h => h.id === habitId ? { ...h, node_id: nodeId || null } : h),
    }))
    await saveDefs(updated)
    setGoalPickerFor(null)
  }

  const pauseHabit = async () => {
    if (!pauseTarget || !pauseDate) return
    const updated = rawCategories.map(c => ({
      ...c, habits: c.habits.map(h => h.id === pauseTarget ? { ...h, paused_until: pauseDate } : h)
    }))
    await saveDefs(updated)
    setPauseTarget(null)
    setPauseDate('')
  }

  const unpauseHabit = async (habitId) => {
    const updated = rawCategories.map(c => ({
      ...c, habits: c.habits.map(h => h.id === habitId ? { ...h, paused_until: null } : h)
    }))
    await saveDefs(updated)
  }

  const submitAddHabit = async () => {
    const { label, categoryId, kind, target } = addForm
    if (!label.trim()) return
    const slug = label.trim().toLowerCase().replace(/[^a-zа-яё0-9]/gi, '_').slice(0, 20)
    const newHabit = {
      id: `${categoryId || 'custom'}_${slug}_${Date.now()}`,
      label: label.trim(),
      kind: kind || 'toggle',
      max_score: kind === 'counter' ? 2 : 1,
      active: true,
      ...(kind === 'counter' ? { target: target !== '' ? Number(target) : 1 } : {}),
    }
    const updated = rawCategories.map(c =>
      c.id === categoryId ? { ...c, habits: [...c.habits, newHabit] } : c
    )
    await saveDefs(updated)
    setShowAddModal(false)
    setAddForm({ label: '', categoryId: rawCategories[0]?.id || '', kind: 'toggle', target: '' })
  }

  const updateHabit = async (habitId, value) => {
    const updatedLog = { ...dayLog, [habitId]: value }
    setDayLog(updatedLog)
    const score = computeHabitScore(defs, updatedLog)
    setDayScore(score)
    await habits.saveLog(trackDate, { date: trackDate, habits: updatedLog, score, notes: '' })
    const weekDates = getWeekDates(histWeekStart)
    if (weekDates.includes(trackDate)) {
      setWeekLogs(prev => ({ ...prev, [trackDate]: updatedLog }))
      setWeekScores(prev => ({ ...prev, [trackDate]: score }))
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Загрузка...</div>

  const isToday = trackDate === todayStr
  const pct = maxTotal > 0 ? dayScore / maxTotal : 0
  const scoreColor = pct >= 0.8 ? 'text-green-500' : pct >= 0.5 ? 'text-amber-500' : 'text-gray-500'
  const barColor = pct >= 0.8 ? 'bg-green-400' : pct >= 0.5 ? 'bg-amber-400' : 'bg-gray-300 dark:bg-gray-600'
  const histWeekDates = getWeekDates(histWeekStart)

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
        {[['track', 'Трекинг'], ['history', 'История'], ['gaps', 'Пропуски']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all
              ${tab === id ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                           : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >{label}</button>
        ))}
      </div>

      {/* ─── TRACKING TAB ─── */}
      {tab === 'track' && (
        <>
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={() => setTrackDate(d => addDays(d, -1))}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >‹</button>
            <div className="flex-1 text-center">
              <span className="text-base font-semibold text-gray-900 dark:text-gray-100 capitalize">
                {formatDate(trackDate)}
              </span>
              {!isToday && (
                <button onClick={() => setTrackDate(todayStr)} className="ml-2 text-xs text-blue-500 hover:text-blue-600">
                  → Сегодня
                </button>
              )}
            </div>
            <button
              onClick={() => setTrackDate(d => addDays(d, 1))}
              disabled={trackDate >= todayStr}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-30"
            >›</button>
          </div>

          {/* Score bar */}
          <div className="flex items-center gap-3 mb-6 px-4 py-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
            <div className="flex-1">
              <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct * 100}%` }} />
              </div>
            </div>
            <span className={`text-lg font-semibold tabular-nums ${scoreColor}`}>{dayScore}</span>
            <span className="text-sm text-gray-400">/ {maxTotal}</span>
          </div>

          {/* Habits grouped by category */}
          <div className="space-y-2">
            {Object.entries(grouped).map(([cat, catHabits]) => {
              const collapsed = collapsedCats.has(cat)
              const catDone = catHabits.filter(h => habitIsDone(h, dayLog[h.id])).length
              return (
              <div key={cat} className="card overflow-hidden">
                <button
                  onClick={() => toggleCat(cat)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/50 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <span className={`text-gray-300 dark:text-gray-600 transition-transform ${collapsed ? '' : 'rotate-90'}`}>›</span>
                  <span className="flex-1 text-left">{cat}</span>
                  <span className="normal-case tracking-normal tabular-nums text-gray-400">{catDone}/{catHabits.length}</span>
                </button>
                {!collapsed && catHabits.map((h, idx) => (
                  <div
                    key={h.id}
                    className={`flex items-center gap-4 px-4 py-3
                      ${idx < catHabits.length - 1 ? 'border-b border-gray-50 dark:border-gray-800/50' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-800 dark:text-gray-200 font-medium">{h.label}</div>
                      {h.detail && <div className="text-xs text-gray-400 mt-0.5">{h.detail}</div>}
                      {pauseTarget === h.id && (
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="date"
                            value={pauseDate}
                            min={addDays(todayStr, 1)}
                            onChange={e => setPauseDate(e.target.value)}
                            className="text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 outline-none"
                          />
                          <button onClick={pauseHabit} disabled={!pauseDate} className="text-xs text-amber-500 hover:text-amber-600 disabled:opacity-40 font-medium">Пауза</button>
                          <button onClick={() => { setPauseTarget(null); setPauseDate('') }} className="flex items-center justify-center text-gray-400 hover:text-gray-500"><X size={12} /></button>
                        </div>
                      )}
                      {h.node_id && nodeById[h.node_id] && goalPickerFor !== h.id && (
                        <button onClick={() => setGoalPickerFor(h.id)}
                          className="flex items-center gap-1 mt-1 text-xs text-blue-500 hover:text-blue-600">
                          <Target size={11} /> {nodeById[h.node_id].title}
                        </button>
                      )}
                      {goalPickerFor === h.id && (
                        <div className="flex items-center gap-2 mt-2">
                          <select
                            value={h.node_id || ''}
                            onChange={e => setHabitGoal(h.id, e.target.value)}
                            className="text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 outline-none max-w-[240px]"
                          >
                            <option value="">— без цели —</option>
                            {goalNodes.map(n => (
                              <option key={n.id} value={n.id}>{n.parent_id ? `${rootTitleOf(n.id)} › ${n.title}` : n.title}</option>
                            ))}
                          </select>
                          <button onClick={() => setGoalPickerFor(null)} className="flex items-center justify-center text-gray-400 hover:text-gray-500"><X size={12} /></button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <TrackInput
                        habit={h}
                        value={dayLog[h.id]}
                        onChange={(val) => updateHabit(h.id, val)}
                        editable={trackDate <= todayStr}
                      />
                      <button
                        onClick={() => setGoalPickerFor(goalPickerFor === h.id ? null : h.id)}
                        title="Привязать к цели"
                        className={`transition-colors text-xs leading-none ${h.node_id ? 'text-blue-400 hover:text-blue-500' : 'text-gray-300 dark:text-gray-700 hover:text-blue-400'}`}
                      ><Target size={13} /></button>
                      <button
                        onClick={() => { setPauseTarget(h.id); setPauseDate(addDays(todayStr, 7)) }}
                        title="Поставить на паузу"
                        className="text-gray-300 dark:text-gray-700 hover:text-amber-400 transition-colors text-xs leading-none"
                      >⏸</button>
                    </div>
                  </div>
                ))}
              </div>
            )})}
          </div>

          {/* Paused habits */}
          {pausedHabits.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 px-1">На паузе</div>
              <div className="card overflow-hidden">
                {pausedHabits.map((h, idx) => (
                  <div key={h.id} className={`flex items-center gap-3 px-4 py-2.5 ${idx < pausedHabits.length - 1 ? 'border-b border-gray-50 dark:border-gray-800/50' : ''}`}>
                    <div className="flex-1 text-sm text-gray-400">{h.label}</div>
                    <div className="text-xs text-gray-400">до {h.paused_until}</div>
                    <button onClick={() => unpauseHabit(h.id)} className="text-xs text-blue-500 hover:text-blue-600 ml-2">Снять</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add habit */}
          <button
            onClick={() => { setAddForm(f => ({ ...f, categoryId: rawCategories[0]?.id || '' })); setShowAddModal(true) }}
            className="mt-4 w-full py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl transition-colors"
          >+ Добавить привычку</button>
        </>
      )}

      {/* ─── HISTORY TAB ─── */}
      {tab === 'history' && (
        <>
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={() => setHistWeekStart(d => addDays(d, -7))}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >‹</button>
            <div className="flex-1 text-center text-sm font-medium text-gray-700 dark:text-gray-300">
              {histWeekDates[0].slice(5).replace('-', '.')} – {histWeekDates[6].slice(5).replace('-', '.')}
            </div>
            <button
              onClick={() => setHistWeekStart(d => addDays(d, 7))}
              disabled={addDays(histWeekStart, 7) > todayStr}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-30"
            >›</button>
          </div>

          {/* Color legend */}
          <div className="flex flex-wrap gap-3 mb-3 px-1">
            {[
              { color: 'bg-green-400', label: 'Выполнено' },
              { color: 'bg-amber-300', label: 'Частично' },
              { color: 'bg-red-300', label: 'Провал' },
              { color: 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700', label: 'Нет данных' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-full ${color}`} />
                <span className="text-xs text-gray-400">{label}</span>
              </div>
            ))}
          </div>

          <div className="card overflow-x-auto">
            {/* Day headers — click to jump to Трекинг for that day */}
            <div className="grid border-b border-gray-100 dark:border-gray-800" style={{ gridTemplateColumns: '1fr repeat(7, 48px)' }}>
              <div className="px-4 py-2" />
              {histWeekDates.map((d, i) => {
                const isFuture = d > todayStr
                return (
                  <button
                    key={d}
                    onClick={() => { if (!isFuture) { setTrackDate(d); setTab('track') } }}
                    disabled={isFuture}
                    className={`py-2 text-center transition-colors rounded
                      ${isFuture ? 'opacity-30 cursor-default' : 'hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer'}
                      ${d === todayStr ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}`}
                  >
                    <div className="text-xs font-medium">{DAYS_SHORT[i]}</div>
                    <div className="text-xs">{d.slice(8)}</div>
                  </button>
                )
              })}
            </div>

            {/* Score summary row */}
            <div className="grid border-b border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-900/20" style={{ gridTemplateColumns: '1fr repeat(7, 48px)' }}>
              <div className="px-4 py-2 text-xs text-gray-400 italic flex items-center">Итого</div>
              {histWeekDates.map(d => {
                const isFuture = d > todayStr
                const score = weekScores[d] || 0
                const p = maxTotal > 0 ? score / maxTotal : 0
                const color = p >= 0.8 ? 'text-green-500' : p >= 0.5 ? 'text-amber-500' : 'text-gray-400'
                return (
                  <div key={d} className="py-2 flex items-center justify-center">
                    {!isFuture && <span className={`text-xs font-medium ${color}`}>{score}</span>}
                  </div>
                )
              })}
            </div>

            {/* Habit rows grouped by category */}
            {Object.entries(grouped).map(([cat, catHabits]) => (
              <div key={cat}>
                <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/30 dark:bg-gray-900/20 border-b border-gray-50 dark:border-gray-800/50">
                  {cat}
                </div>
                {catHabits.map(h => (
                  <div
                    key={h.id}
                    className="grid items-center border-b border-gray-50 dark:border-gray-800/30 hover:bg-gray-50/30 dark:hover:bg-gray-900/10"
                    style={{ gridTemplateColumns: '1fr repeat(7, 48px)' }}
                  >
                    <div className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 truncate">{h.label}</div>
                    {histWeekDates.map(d => (
                      <div key={d} className="flex items-center justify-center py-2.5">
                        {d > todayStr
                          ? <div className="w-4 h-4 rounded-full bg-gray-50 dark:bg-gray-800/30" />
                          : <HistDot habit={h} value={weekLogs[d]?.[h.id]} />
                        }
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ─── GAPS TAB ─── */}
      {tab === 'gaps' && (
        <GapsView
          defs={defs}
          todayStr={todayStr}
          onJump={d => { setTrackDate(d); setTab('track') }}
        />
      )}

      {/* Add habit modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="absolute inset-0 bg-black/30 dark:bg-black/50" />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Новая привычка</div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Название"
                value={addForm.label}
                onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))}
                autoFocus
                className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 outline-none focus:border-blue-400"
              />
              <select
                value={addForm.categoryId}
                onChange={e => setAddForm(f => ({ ...f, categoryId: e.target.value }))}
                className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 outline-none"
              >
                {rawCategories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <select
                value={addForm.kind}
                onChange={e => setAddForm(f => ({ ...f, kind: e.target.value, target: '' }))}
                className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 outline-none"
              >
                <option value="toggle">Да/Нет</option>
                <option value="counter">Счётчик</option>
                <option value="time_window">Время</option>
              </select>
              {addForm.kind === 'counter' && (
                <input
                  type="number"
                  placeholder="Цель (0 = не допускать)"
                  value={addForm.target}
                  onChange={e => setAddForm(f => ({ ...f, target: e.target.value }))}
                  className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 outline-none"
                />
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-2 text-sm text-gray-400 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">Отмена</button>
              <button
                onClick={submitAddHabit}
                disabled={!addForm.label.trim()}
                className="flex-1 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-40 rounded-xl transition-colors"
              >Добавить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
