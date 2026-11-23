import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, X, Target, GripVertical, MoreHorizontal, Clock3, Power } from 'lucide-react'
import { habits, tree as treeApi } from '../api'
import { useRecoveryMode } from '../context/RecoveryModeContext'
import { computeHabitScore, habitIsDone, inTimeWindow } from '../utils/habitScoring'
import { addLocalDays, localDay, localWeekStart } from '../utils/calendarDay'
import { HabitDynamics } from './Stats'
import { directEntityId } from '../utils/entityLinks'
import HabitInfo from '../components/HabitInfo'
import TrackInput from '../components/HabitTrackInput'
import { moveHabitToCategory, orderedFoundationHabits, orderedHabits, reorderFoundationHabits, reorderHabitsInCategory } from '../utils/habitOrdering'

export { computeHabitScore, habitIsDone, inTimeWindow } from '../utils/habitScoring'

const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function addDays(dateStr, n) {
  return addLocalDays(dateStr, n)
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('ru-RU', {
    weekday: 'short', day: 'numeric', month: 'short'
  })
}

function getWeekStart(dateStr) {
  return localWeekStart(dateStr)
}

function getWeekDates(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
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
    if (value === undefined || value === null) return <div className={empty} />
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
    for (const h of orderedHabits(c.habits || [])) {
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

function HabitActionsMenu({ habit, onGoal, onPause, onDisable }) {
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)

  useEffect(() => {
    if (!open) return undefined
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const menuWidth = 224
      setPosition({
        top: rect.bottom + 8,
        left: Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12)),
      })
    }
    const closeOnOutsidePointer = event => {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false)
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('mousedown', closeOnOutsidePointer)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('mousedown', closeOnOutsidePointer)
    }
  }, [open])

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }
  const act = action => {
    action()
    close()
  }

  return <>
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen(value => !value)}
      onKeyDown={event => { if (event.key === 'Escape') close() }}
      aria-label={`Действия с привычкой «${habit.label}»`}
      aria-expanded={open}
      aria-haspopup="menu"
      className="habit-actions-trigger"
    ><MoreHorizontal size={18} /></button>
    {open && position && createPortal(
      <div ref={menuRef} role="menu" aria-label={`Действия с привычкой «${habit.label}»`} onKeyDown={event => { if (event.key === 'Escape') close() }} className="habit-actions-menu" style={position}>
        <div className="habit-actions-menu__label">Управление привычкой</div>
        <button type="button" role="menuitem" onClick={() => act(onGoal)}><Target size={16} /><span>Связать с задачей или целью</span></button>
        <button type="button" role="menuitem" onClick={() => act(onPause)}><Clock3 size={16} /><span>Поставить на паузу</span></button>
        <div className="habit-actions-menu__divider" />
        <button type="button" role="menuitem" className="habit-actions-menu__danger" onClick={() => act(onDisable)}><Power size={16} /><span>Выключить</span></button>
      </div>,
      document.body,
    )}
  </>
}

// ─── Main ──────────────────────────────────────────────────────────

export default function Habits() {
  const location = useLocation()
  const navigate = useNavigate()
  const todayStr = localDay()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') === 'dynamics' ? 'dynamics' : 'track'
  const [tab, setTabState] = useState(initialTab)
  const setTab = (next) => {
    setTabState(next)
    setSearchParams(next === 'track' ? {} : { tab: next })
  }

  useEffect(() => {
    const requested = searchParams.get('tab')
    if (requested === 'dynamics' && tab !== 'dynamics') setTabState('dynamics')
    if (!requested && tab === 'dynamics') setTabState('track')
  }, [searchParams, tab])
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
  const [recoveryExpanded, setRecoveryExpanded] = useState(new Set())
  const toggleCatRecovery = (cat) => setRecoveryExpanded(prev => {
    const next = new Set(prev); next.has(cat) ? next.delete(cat) : next.add(cat); return next
  })
  const { isRecoveryMode } = useRecoveryMode()
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
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [savingHabit, setSavingHabit] = useState(false)
  const [pauseTarget, setPauseTarget] = useState(null)
  const [pauseDate, setPauseDate] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [draggedHabit, setDraggedHabit] = useState(null)
  const [dragOverCategoryId, setDragOverCategoryId] = useState(null)
  const [addForm, setAddForm] = useState({ label: '', categoryId: '', kind: 'toggle', target: '' })
  const habitId = directEntityId(location.pathname, 'habits')

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
    }).catch(() => { setLoadError('Не удалось загрузить привычки.'); setLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!defs.length) return
    habits.log(trackDate).then(data => {
      const log = data?.habits || {}
      setDayLog(log)
      setDayScore(computeHabitScore(defs, log))
      setSaveError('')
    }).catch(() => { setSaveError('Не удалось загрузить отметки за выбранный день.') })
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

  useEffect(() => {
    const habit = defs.find(candidate => candidate.id === habitId)
    if (!habit) return
    setTab('track')
    setCollapsedCats(previous => {
      const next = new Set(previous)
      next.delete(habit.category)
      return next
    })
    setRecoveryExpanded(previous => new Set(previous).add(habit.category))
    requestAnimationFrame(() => document.querySelector(`[data-entity-id="${CSS.escape(habitId)}"]`)?.scrollIntoView({ block: 'center' }))
  }, [defs, habitId]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveDefs = async (updated) => {
    try {
      await habits.saveDefinitions({ categories: updated })
      applyDefs(updated)
      setSaveError('')
    } catch (error) {
      setSaveError(error.message || 'Не удалось сохранить привычки.')
      throw error
    }
  }

  // A habit can link to any personal task or goal in the tree.
  const nodeById = Object.fromEntries(treeNodes.map(n => [n.id, n]))
  const linkedNodes = treeNodes.filter(n => n.parent_id && (n.work_context || 'personal') === 'personal')
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

  const disableHabit = async (habitId) => {
    const updated = rawCategories.map(category => ({
      ...category,
      habits: category.habits.map(habit => habit.id === habitId ? { ...habit, active: false } : habit),
    }))
    await saveDefs(updated)
  }

  const setFoundation = (categories, habitId, foundation) => {
    const foundationCount = categories.flatMap(category => category.habits || []).filter(habit => habit.foundation).length
    return categories.map(c => ({
      ...c, habits: c.habits.map(h => h.id === habitId
        ? { ...h, foundation, ...(foundation ? { foundation_order: foundationCount } : {}) }
        : h)
    }))
  }

  const dropIntoFoundation = async () => {
    if (!draggedHabit || draggedHabit.scope === 'foundation') return
    await saveDefs(setFoundation(rawCategories, draggedHabit.id, true))
    setDraggedHabit(null)
    setDragOverCategoryId(null)
  }

  const dropFoundationIntoCategory = async (categoryId) => {
    if (!draggedHabit) return
    const withoutFoundation = setFoundation(rawCategories, draggedHabit.id, false)
    const updated = draggedHabit.categoryId === categoryId
      ? withoutFoundation
      : moveHabitToCategory(withoutFoundation, draggedHabit.id, categoryId)
    await saveDefs(updated)
  }

  const reorderCategory = async (categoryId, sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return
    await saveDefs(reorderHabitsInCategory(rawCategories, categoryId, sourceId, targetId))
  }

  const reorderFoundation = async (sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return
    await saveDefs(reorderFoundationHabits(rawCategories, sourceId, targetId))
  }

  const moveCategory = async (habitId, categoryId) => {
    const current = rawCategories.find(category => category.habits?.some(habit => habit.id === habitId))
    if (!current || current.id === categoryId) return
    await saveDefs(moveHabitToCategory(rawCategories, habitId, categoryId))
  }

  const dropIntoCategory = async (categoryId, targetHabitId = null) => {
    if (!draggedHabit) return
    if (draggedHabit.scope === 'foundation') {
      await dropFoundationIntoCategory(categoryId)
    } else if (draggedHabit.categoryId === categoryId) {
      if (targetHabitId) await reorderCategory(categoryId, draggedHabit.id, targetHabitId)
    } else {
      await moveCategory(draggedHabit.id, categoryId)
    }
    setDraggedHabit(null)
    setDragOverCategoryId(null)
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
    if (savingHabit) return
    setSavingHabit(true)
    const previousLog = dayLog
    const previousScore = dayScore
    const updatedLog = { ...dayLog, [habitId]: value }
    setDayLog(updatedLog)
    const score = computeHabitScore(defs, updatedLog)
    setDayScore(score)
    try {
      await habits.saveLog(trackDate, { date: trackDate, habits: updatedLog, score, notes: '' }, 'habit_progress')
      setSaveError('')
    } catch (error) {
      setDayLog(previousLog)
      setDayScore(previousScore)
      setSaveError(error.message || 'Не удалось сохранить отметку.')
      setSavingHabit(false)
      return
    }
    setSavingHabit(false)
    const weekDates = getWeekDates(histWeekStart)
    if (weekDates.includes(trackDate)) {
      setWeekLogs(prev => ({ ...prev, [trackDate]: updatedLog }))
      setWeekScores(prev => ({ ...prev, [trackDate]: score }))
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Загрузка...</div>
  if (loadError) return <div role="alert" className="mx-auto max-w-2xl px-6 py-8 text-sm text-rose-600">{loadError} <button type="button" className="underline" onClick={() => window.location.reload()}>Повторить</button></div>

  const isToday = trackDate === todayStr
  const pct = maxTotal > 0 ? dayScore / maxTotal : 0
  const scoreColor = pct >= 0.8 ? 'text-green-500' : pct >= 0.5 ? 'text-amber-500' : 'text-gray-500'
  const barColor = pct >= 0.8 ? 'bg-green-400' : pct >= 0.5 ? 'bg-amber-400' : 'bg-gray-300 dark:bg-gray-600'
  const histWeekDates = getWeekDates(histWeekStart)

  return (
    <div className="habits-page max-w-2xl mx-auto py-8 px-6">
      {saveError && <p role="alert" className="mb-4 text-sm text-rose-600">{saveError}</p>}
      <div className="habits-header">
        <div><p className="habits-kicker">Life OS · ежедневный ритм</p><h1>Привычки</h1></div>
        {/* Tabs */}
        <div className="habits-tabs flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
        {[['track', 'Трекинг'], ['history', 'История'], ['dynamics', 'Динамика'], ['gaps', 'Пропуски']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all
              ${tab === id ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                           : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >{label}</button>
        ))}
        </div>
      </div>

      {/* ─── TRACKING TAB ─── */}
      {tab === 'track' && (
        <>
          <div className="habits-date-nav flex items-center gap-3 mb-5">
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
          <div className="habits-score flex items-center gap-3 mb-6 px-4 py-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
            <div className="flex-1">
              <div className="habits-score-label">Ритм дня</div>
              <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct * 100}%` }} />
              </div>
            </div>
            <span className={`text-lg font-semibold tabular-nums ${scoreColor}`}>{dayScore}</span>
            <span className="text-sm text-gray-400">/ {maxTotal}</span>
          </div>

          {/* Habits grouped by category */}
          <div className="space-y-2">
            {defs.length === 0 && <div className="rounded-2xl border border-dashed border-gray-200 px-5 py-8 text-center dark:border-gray-700"><p className="text-sm font-medium text-gray-700 dark:text-gray-200">Привычек пока нет</p><p className="mt-1 text-xs text-gray-400">Добавь первую вручную в настройках привычек или вернись в setup за предложениями.</p></div>}
            {/* Foundation section — always at top */}
            {(() => {
              const foundationHabits = orderedFoundationHabits(defs.filter(h => h.foundation))
              const foundationDone = foundationHabits.filter(h => habitIsDone(h, dayLog[h.id])).length
              const allDone = foundationHabits.length > 0 && foundationDone === foundationHabits.length
              return (
                <div className={`habits-foundation card overflow-hidden border-2 ${allDone ? 'border-green-200 dark:border-green-800' : 'border-amber-200 dark:border-amber-800/60'}`}>
                  <div
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => { event.preventDefault(); dropIntoFoundation() }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-amber-50/50 dark:bg-amber-900/10 border-b border-amber-100 dark:border-amber-800/40"
                  >
                    <span className="text-amber-500 dark:text-amber-400">◈</span>
                    <span className="flex-1 text-left text-amber-600 dark:text-amber-400">Фундамент</span>
                    <span className={`normal-case tracking-normal tabular-nums font-medium ${allDone ? 'text-green-500' : 'text-amber-500'}`}>{foundationDone}/{foundationHabits.length}</span>
                  </div>
                  {foundationHabits.length === 0 && (
                    <div
                      onDragOver={event => event.preventDefault()}
                      onDrop={event => { event.preventDefault(); dropIntoFoundation() }}
                      className="px-4 py-5 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                      Перетащите сюда привычку из категории, чтобы добавить её в фундамент.
                    </div>
                  )}
                  {foundationHabits.map((h, idx) => (
                    <div
                      key={h.id}
                      data-entity-id={h.id}
                      draggable
                      onDragStart={() => setDraggedHabit({ id: h.id, scope: 'foundation', categoryId: h.categoryId })}
                      onDragOver={event => event.preventDefault()}
                      onDrop={event => { event.preventDefault(); if (draggedHabit?.scope === 'foundation') reorderFoundation(draggedHabit.id, h.id); else dropIntoFoundation(); setDraggedHabit(null); setDragOverCategoryId(null) }}
                      onDragEnd={() => { setDraggedHabit(null); setDragOverCategoryId(null) }}
                      className={`flex items-center gap-4 px-4 py-3 ${h.id === habitId ? 'ring-2 ring-inset ring-blue-400 dark:ring-blue-500' : ''} ${idx < foundationHabits.length - 1 ? 'border-b border-gray-50 dark:border-gray-800/50' : ''}`}
                    >
                      <GripVertical size={15} aria-hidden="true" className="shrink-0 cursor-grab text-gray-300 dark:text-gray-600" />
                      <HabitInfo habit={h} nodes={treeNodes} />
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <fieldset disabled={savingHabit} className="contents"><TrackInput habit={h} value={dayLog[h.id]} onChange={(val) => updateHabit(h.id, val)} editable={trackDate <= todayStr} /></fieldset>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Non-foundation categories */}
            {Object.entries(grouped)
              .map(([cat, catHabits]) => {
                const nonFoundationHabits = catHabits.filter(h => !h.foundation)
                if (!nonFoundationHabits.length) return null
                const collapsed = isRecoveryMode ? !recoveryExpanded.has(cat) : collapsedCats.has(cat)
                const toggleFn = isRecoveryMode ? () => toggleCatRecovery(cat) : () => toggleCat(cat)
                const catDone = nonFoundationHabits.filter(h => habitIsDone(h, dayLog[h.id])).length
                return (
              <div key={cat} className={`habits-category card overflow-hidden ${dragOverCategoryId === catHabits[0].categoryId ? 'ring-2 ring-inset ring-blue-400 dark:ring-blue-500' : ''}`}>
                <button
                  onClick={toggleFn}
                  onDragOver={event => { event.preventDefault(); setDragOverCategoryId(catHabits[0].categoryId) }}
                  onDragLeave={() => setDragOverCategoryId(null)}
                  onDrop={event => { event.preventDefault(); dropIntoCategory(catHabits[0].categoryId) }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/50 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <span className={`text-gray-300 dark:text-gray-600 transition-transform ${collapsed ? '' : 'rotate-90'}`}>›</span>
                  <span className="flex-1 text-left">{cat}</span>
                  <span className="normal-case tracking-normal tabular-nums text-gray-400">{catDone}/{nonFoundationHabits.length}</span>
                </button>
                {!collapsed && nonFoundationHabits.map((h, idx) => (
                  <div
                    key={h.id}
                    data-entity-id={h.id}
                    draggable
                    onDragStart={() => setDraggedHabit({ id: h.id, scope: cat, categoryId: h.categoryId })}
                    onDragOver={event => { event.preventDefault(); setDragOverCategoryId(h.categoryId) }}
                    onDragLeave={() => setDragOverCategoryId(null)}
                    onDrop={event => { event.preventDefault(); dropIntoCategory(h.categoryId, h.id) }}
                    onDragEnd={() => { setDraggedHabit(null); setDragOverCategoryId(null) }}
                    className={`flex items-center gap-4 px-4 py-3 ${h.id === habitId ? 'ring-2 ring-inset ring-blue-400 dark:ring-blue-500' : ''}
                      ${idx < nonFoundationHabits.length - 1 ? 'border-b border-gray-50 dark:border-gray-800/50' : ''}`}
                  >
                    <GripVertical size={15} aria-hidden="true" className="shrink-0 cursor-grab text-gray-300 dark:text-gray-600" />
                    <div className="min-w-0 flex-1">
                      <HabitInfo habit={h} nodes={treeNodes} showLinked={goalPickerFor !== h.id} />
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
                      {goalPickerFor === h.id && (
                        <div className="flex items-center gap-2 mt-2">
                          <select
                            value={h.node_id || ''}
                            onChange={e => setHabitGoal(h.id, e.target.value)}
                            className="text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 outline-none max-w-[240px]"
                          >
                            <option value="">— без связи —</option>
                            {linkedNodes.map(n => (
                              <option key={n.id} value={n.id}>{n.parent_id ? `${rootTitleOf(n.id)} › ${n.title}` : n.title}</option>
                            ))}
                          </select>
                          <button onClick={() => setGoalPickerFor(null)} className="flex items-center justify-center text-gray-400 hover:text-gray-500"><X size={12} /></button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <fieldset disabled={savingHabit} className="contents"><TrackInput
                        habit={h}
                        value={dayLog[h.id]}
                        onChange={(val) => updateHabit(h.id, val)}
                        editable={trackDate <= todayStr}
                      /></fieldset>
                      <HabitActionsMenu
                        habit={h}
                        onGoal={() => setGoalPickerFor(h.id)}
                        onPause={() => { setPauseTarget(h.id); setPauseDate(addDays(todayStr, 7)) }}
                        onDisable={() => disableHabit(h.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
              )
            }).filter(Boolean)}
          </div>

          {/* Paused habits */}
          {pausedHabits.length > 0 && (
            <div className="habits-paused mt-4">
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
            className="habits-add mt-4 w-full py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl transition-colors"
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

          <div className="habits-history card overflow-x-auto">
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

      {/* ─── DYNAMICS TAB ─── */}
      {tab === 'dynamics' && <HabitDynamics embedded onOpenTracking={() => setTab('track')} />}

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
