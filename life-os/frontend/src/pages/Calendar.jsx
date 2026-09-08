import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { events as eventsApi, tree as treeApi, sync as syncApi, calendars as calendarsApi } from '../api'

const LS_HIDDEN = 'life-os-hidden-calendars'
const LS_FILTERS = 'life-os-cal-filters'

function loadHidden() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_HIDDEN) || '[]')) }
  catch { return new Set() }
}
function saveHidden(set) { localStorage.setItem(LS_HIDDEN, JSON.stringify([...set])) }

function loadFilters() {
  try { return JSON.parse(localStorage.getItem(LS_FILTERS) || '{}') }
  catch { return {} }
}
function saveFilters(obj) { localStorage.setItem(LS_FILTERS, JSON.stringify(obj)) }

// ─── Event form ────────────────────────────────────────────────────

function EventForm({ date, time, onSave, onCancel }) {
  const [title, setTitle] = useState('')
  const [t, setT] = useState(time || '')
  const [type, setType] = useState('event')
  const ref = (el) => el?.focus()
  const save = async () => {
    if (!title.trim()) return
    await eventsApi.add({ title: title.trim(), date, time: t || null, type })
    onSave()
  }
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-5 w-80" onClick={e => e.stopPropagation()}>
        <div className="text-xs text-gray-400 mb-3">Новое событие · {date}</div>
        <input ref={ref} value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel() }}
          placeholder="Название..." className="w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none mb-2 text-gray-900 dark:text-gray-100" />
        <div className="flex gap-2 mb-3">
          <input type="time" value={t} onChange={e => setT(e.target.value)}
            className="flex-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 outline-none text-gray-700 dark:text-gray-300" />
          <select value={type} onChange={e => setType(e.target.value)}
            className="flex-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 outline-none text-gray-700 dark:text-gray-300">
            <option value="event">Событие</option>
            <option value="deadline">Дедлайн</option>
            <option value="meeting">Встреча</option>
          </select>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="btn btn-ghost text-xs">Отмена</button>
          <button onClick={save} disabled={!title.trim()} className="btn btn-primary text-xs">Создать</button>
        </div>
      </div>
    </div>
  )
}

// ─── Calendar edit modal ───────────────────────────────────────────

function CalEditModal({ cal, onSave, onCancel, onDelete }) {
  const [title, setTitle] = useState(cal?.title || '')
  const [color, setColor] = useState(cal?.color || '#F97316')
  const [syncToGcal, setSyncToGcal] = useState(cal?.sync_to_gcal ?? false)
  const [gcalCalendars, setGcalCalendars] = useState([])
  const [gcalId, setGcalId] = useState(cal?.gcal_calendar_id || 'primary')
  const isNew = !cal?.id

  useEffect(() => {
    if (syncToGcal) syncApi.calendars().then(setGcalCalendars).catch(() => {})
  }, [syncToGcal])

  const save = () => { if (!title.trim()) return; onSave({ ...cal, title: title.trim(), color, sync_to_gcal: syncToGcal, gcal_calendar_id: gcalId }) }
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-5 w-80" onClick={e => e.stopPropagation()}>
        <div className="text-xs text-gray-400 mb-3">{isNew ? 'Новый календарь' : 'Редактировать календарь'}</div>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel() }}
          placeholder="Название..." className="w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none mb-3 text-gray-900 dark:text-gray-100" />
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-400">Цвет:</span>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
          <span className="text-xs text-gray-400">{color}</span>
        </div>
        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <input type="checkbox" checked={syncToGcal} onChange={e => setSyncToGcal(e.target.checked)} className="rounded" />
          <span className="text-xs text-gray-600 dark:text-gray-400">Синхронизация с Google Calendar</span>
        </label>
        {syncToGcal && gcalCalendars.length > 0 && (
          <div className="mb-3">
            <span className="text-xs text-gray-400">Календарь GCal:</span>
            <select value={gcalId} onChange={e => setGcalId(e.target.value)}
              className="w-full text-xs mt-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 outline-none text-gray-700 dark:text-gray-300">
              {gcalCalendars.map(c => <option key={c.id} value={c.id}>{c.summary}{c.primary ? ' (основной)' : ''}</option>)}
            </select>
          </div>
        )}
        <div className="flex gap-2 justify-between">
          {!isNew && <button onClick={() => onDelete(cal)} className="btn btn-ghost text-xs text-red-500 hover:text-red-700">Удалить</button>}
          <div className="flex gap-2 ml-auto">
            <button onClick={onCancel} className="btn btn-ghost text-xs">Отмена</button>
            <button onClick={save} disabled={!title.trim()} className="btn btn-primary text-xs">{isNew ? 'Создать' : 'Сохранить'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Constants ──────────────────────────────────────────────────────

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const DOW = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function dateStr(date) {
  const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
function addDays(dateStr, n) { const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
function getWeekDates(pivot) {
  const d = new Date(pivot + 'T12:00:00'); const dow = (d.getDay() + 6) % 7
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() - dow + i); return dateStr(x) })
}
function getMonthDays(year, month) {
  const first = new Date(year, month, 1); const last = new Date(year, month + 1, 0); const startDow = (first.getDay() + 6) % 7
  const days = []; for (let i = 0; i < startDow; i++) days.push(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d))
  return days
}

// ─── Item chip ──────────────────────────────────────────────────────

function ItemChip({ item, calColor, onToggleWatched, compact }) {
  const color = item._kind === 'event' ? '#F59E0B' : (calColor || item.root_color || '#6B7280')
  const hasCal = !!item.calendar_id
  const isWatched = item.watched !== false
  const cls = compact ? 'text-[10px] py-px pl-1 pr-0.5 min-w-[24px]' : 'text-xs py-0.5 pl-1.5 pr-1'
  const timeStr = item._kind === 'event' && item.time ? `${item.time.slice(0,5)} ` : ''
  const full = timeStr + item.title + (item.notes ? ` · ${item.notes}` : '')
  const chipRef = useRef(null)
  const [tip, setTip] = useState(null)

  const show = () => {
    if (!chipRef.current) return
    const r = chipRef.current.getBoundingClientRect()
    setTip({ left: r.left, top: r.top, height: r.height })
  }

  const chipClass = `${cls} rounded truncate mb-0.5 flex items-center gap-0.5 whitespace-nowrap bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border`

  return (
    <>
      <div ref={chipRef} onMouseEnter={show} onMouseLeave={() => setTip(null)}
        className={`${cls} rounded truncate mb-0.5 flex items-center gap-0.5 whitespace-nowrap bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border group`}
        style={{ borderLeft: `3px solid ${color}`, border: `1px solid ${color}30` }} title={full}>
        {hasCal && (
          <span onClick={e => { e.stopPropagation(); onToggleWatched?.(item) }}
            className="cursor-pointer flex-shrink-0 leading-none hover:scale-110 transition-transform"
            title={isWatched ? 'Убрать из избранного' : 'В избранное'}>
            {isWatched ? '⭐' : '☆'}
          </span>
        )}
        <span className="truncate flex-1">
          {timeStr}{item.title}
        </span>
      </div>
      {tip && createPortal(
        <div className={`${compact ? 'text-[10px] py-px pl-1 pr-0.5' : 'text-xs py-0.5 pl-1.5 pr-1'} fixed z-[9999] rounded shadow-lg whitespace-nowrap max-w-[360px] truncate pointer-events-none flex items-center bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border`}
          style={{ left: tip.left, top: tip.top, height: tip.height, borderLeft: `3px solid ${color}`, border: `1px solid ${color}30` }}>
          {hasCal && <span className="flex-shrink-0 leading-none">{isWatched ? '⭐' : '☆'}</span>}
          <span className="truncate flex-1 ml-0.5">{full}</span>
        </div>,
        document.body
      )}
    </>
  )
}



// ─── Month view ─────────────────────────────────────────────────────

function MonthView({ year, month, allEvents, allTasks, today, onNewEvent, calMap, onToggleWatched }) {
  const days = getMonthDays(year, month)
  return (
    <div className="card">
      <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800">
        {DOW.map(d => <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date, i) => {
          if (!date) return <div key={i} className="min-h-[80px] border-b border-r border-gray-50 dark:border-gray-800/50 bg-gray-50/50 dark:bg-gray-900/20" />
          const ds = dateStr(date); const isToday = ds === today
          const evs = allEvents.filter(e => e.date === ds)
          const tasks = allTasks.filter(t => t.due === ds)
          const items = [...evs.map(e => ({ ...e, _kind: 'event' })), ...tasks.map(t => ({ ...t, _kind: 'task' }))]
          return (
            <div key={i} onClick={() => onNewEvent?.({ date: ds })}
              className="min-h-[80px] border-b border-r border-gray-50 dark:border-gray-800/50 p-1.5 hover:bg-gray-50/50 dark:hover:bg-gray-900/20 cursor-pointer">
              <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${isToday ? 'bg-blue-500 text-white' : 'text-gray-500 dark:text-gray-400'}`}>{date.getDate()}</div>
              {items.map((item, j) => (
                <ItemChip key={j} item={item} calColor={item.calendar_id ? calMap[item.calendar_id]?.color : null} onToggleWatched={onToggleWatched} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week / Day view ────────────────────────────────────────────────

function HourGrid({ dates, allEvents, allTasks, today, onNewEvent, calMap, onToggleWatched }) {
  const getTimeItems = (d) => {
    const evs = [...allEvents.filter(e => e.date === d && e.time), ...allTasks.filter(t => t.due === d && t.time)]
    const allDay = [
      ...allEvents.filter(e => e.date === d && !e.time).map(e => ({ ...e, _kind: 'event' })),
      ...allTasks.filter(t => t.due === d && !t.time).map(t => ({ ...t, _kind: 'task' })),
    ]
    return { evs, allDay }
  }
  const getHourItems = (d, hour) => [
    ...allEvents.filter(e => e.date === d && e.time && parseInt(e.time.slice(0,2),10) === hour),
    ...allTasks.filter(t => t.due === d && t.time && parseInt(t.time.slice(0,2),10) === hour),
  ]

  return (
    <div className="card flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Day headers */}
      <div className="grid border-b border-gray-100 dark:border-gray-800" style={{ gridTemplateColumns: `48px repeat(${dates.length}, minmax(0, 1fr))` }}>
        <div className="py-2 px-2 text-xs text-gray-300" />
        {dates.map((d, i) => {
          const isToday = d === today
          return (
            <div key={d} className={`py-2 text-center border-l border-gray-100 dark:border-gray-800 ${isToday ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}>
              <div className={`text-xs font-medium ${isToday ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}`}>{DOW[i]}</div>
              <div className={`text-lg font-semibold ${isToday ? 'text-blue-500' : 'text-gray-700 dark:text-gray-300'}`}>{d.slice(8)}</div>
            </div>
          )
        })}
      </div>
      {/* All-day row */}
      <div className="grid border-b border-gray-200 dark:border-gray-700" style={{ gridTemplateColumns: `48px repeat(${dates.length}, minmax(0, 1fr))` }}>
        <div className="px-2 py-1 text-xs text-gray-300 dark:text-gray-600 flex items-start pt-1.5">весь</div>
        {dates.map(d => {
          const { allDay } = getTimeItems(d)
          return (
            <div key={d} className="p-0.5 border-l border-gray-100 dark:border-gray-800 max-h-[72px] overflow-y-auto">
              {allDay.map((item, j) => (
                <ItemChip key={j} item={item} compact calColor={item.calendar_id ? calMap[item.calendar_id]?.color : null} onToggleWatched={onToggleWatched} />
              ))}
            </div>
          )
        })}
      </div>
      {/* Hour grid — fills remaining space exactly, no scroll */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {HOURS.map(hour => (
          <div key={hour} className={`grid ${hour % 3 === 0 ? 'border-t border-gray-200 dark:border-gray-700' : 'border-t border-gray-100 dark:border-gray-800'}`}
            style={{ gridTemplateColumns: `48px repeat(${dates.length}, minmax(0, 1fr))`, height: `${100/24}%` }}>
            <div className="px-2 text-xs text-gray-300 dark:text-gray-600 pt-0.5 text-right">
              {hour % 3 === 0 ? `${String(hour).padStart(2,'0')}:00` : ''}
            </div>
            {dates.map(d => {
              const items = getHourItems(d, hour); const isToday = d === today
              const calColor = items[0]?.calendar_id ? calMap[items[0].calendar_id]?.color : null
              return (
                <div key={d} onClick={() => items.length === 0 && onNewEvent?.({ date: d, time: `${String(hour).padStart(2,'0')}:00` })}
                  className={`p-px border-l border-gray-100 dark:border-gray-800 ${isToday ? 'bg-blue-50/20 dark:bg-blue-950/10' : ''} ${items.length === 0 ? 'hover:bg-gray-50/50 dark:hover:bg-gray-900/20 cursor-pointer' : ''}`}>
                  {items.map((ev, j) => (
                    <ItemChip key={j} item={{ ...ev, _kind: 'task' }} calColor={ev.calendar_id ? calMap[ev.calendar_id]?.color : null} onToggleWatched={onToggleWatched} />
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────

export default function Calendar() {
  const [allEvents, setAllEvents] = useState([])
  const [allTasks, setAllTasks] = useState([])
  const [calendars, setCalendars] = useState([])
  const [view, setView] = useState('month')
  const [newEvent, setNewEvent] = useState(null)
  const [gcalStatus, setGcalStatus] = useState(null)
  const [hiddenCalendars, setHiddenCalendars] = useState(loadHidden)
  const [calFilters, setCalFilters] = useState(loadFilters)
  const [editCal, setEditCal] = useState(null)

  const calMap = Object.fromEntries(calendars.map(c => [c.id, c]))

  const todayDate = new Date()
  const today = dateStr(todayDate)
  const [pivot, setPivot] = useState(today)
  const [year, setYear] = useState(todayDate.getFullYear())
  const [month, setMonth] = useState(todayDate.getMonth())

  const syncToGCal = async () => {
    setGcalStatus('syncing')
    try { const res = await syncApi.push(); setGcalStatus(res.error ? 'error' : 'done') }
    catch { setGcalStatus('error') }
    setTimeout(() => setGcalStatus(null), 3000)
  }

  const loadAll = () => Promise.all([eventsApi.all(), treeApi.leaves(), calendarsApi.all()]).then(([e, leaves, cals]) => {
    setAllEvents(e.events || [])
    setAllTasks(leaves.filter(x => x.due && x.status !== 'done' && x.status !== 'dropped'))
    setCalendars(cals || [])
  })

  useEffect(() => { loadAll() }, [])

  const toggleCal = (id) => { const next = new Set(hiddenCalendars); if (next.has(id)) next.delete(id); else next.add(id); setHiddenCalendars(next); saveHidden(next) }
  const toggleFilter = (id) => { const next = { ...calFilters }; next[id] = next[id] === 'watched' ? 'all' : 'watched'; setCalFilters(next); saveFilters(next) }

  const toggleWatched = async (item) => {
    const next = !(item.watched !== false)
    // Optimistic: update local state immediately
    setAllTasks(prev => prev.map(t => t.id === item.id ? { ...t, watched: next } : t))
    await treeApi.update(item.id, { watched: next })
  }

  const saveCal = async (cal) => {
    if (cal.id) await calendarsApi.update(cal.id, { title: cal.title, color: cal.color, sync_to_gcal: cal.sync_to_gcal, gcal_calendar_id: cal.gcal_calendar_id })
    else await calendarsApi.add({ title: cal.title, color: cal.color, sync_to_gcal: cal.sync_to_gcal, gcal_calendar_id: cal.gcal_calendar_id })
    setEditCal(null); loadAll()
  }

  const deleteCal = async (cal) => {
    const res = await calendarsApi.delete(cal.id)
    if (res.error) { alert(res.error); return }
    setEditCal(null); loadAll()
  }

  const visibleTasks = allTasks.filter(t => {
    if (t.calendar_id) {
      if (hiddenCalendars.has(t.calendar_id)) return false
      if (calFilters[t.calendar_id] === 'watched' && !t.watched) return false
    }
    return true
  })

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y-1) } else setMonth(m => m-1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y+1) } else setMonth(m => m+1) }
  const weekDates = getWeekDates(pivot)

  return (
    <div className="py-4 px-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2 flex-shrink-0">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Календарь</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={syncToGCal} disabled={gcalStatus === 'syncing'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors">
            {gcalStatus === 'syncing' ? '⏳ Синхронизация...' : gcalStatus === 'done' ? '✅ Готово' : gcalStatus === 'error' ? '❌ Ошибка' : '📅 Sync GCal'}
          </button>
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {[['day','День'],['week','Неделя'],['month','Месяц']].map(([id, label]) => (
              <button key={id} onClick={() => setView(id)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === id ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>{label}</button>
            ))}
          </div>
          {view === 'month' && (
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="btn btn-ghost">‹</button>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[120px] text-center">{MONTH_NAMES[month]} {year}</span>
              <button onClick={nextMonth} className="btn btn-ghost">›</button>
            </div>
          )}
          {(view === 'week' || view === 'day') && (
            <div className="flex items-center gap-2">
              <button onClick={() => setPivot(d => addDays(d, view === 'day' ? -1 : -7))} className="btn btn-ghost">‹</button>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[140px] text-center">
                {view === 'day' ? new Date(pivot + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }) : `${weekDates[0].slice(5).replace('-','.')} – ${weekDates[6].slice(5).replace('-','.')}`}
              </span>
              <button onClick={() => setPivot(d => addDays(d, view === 'day' ? 1 : 7))} className="btn btn-ghost">›</button>
              {pivot !== today && <button onClick={() => setPivot(today)} className="text-xs text-blue-500 hover:text-blue-600">Сегодня</button>}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex gap-3">
        {/* Calendar panel */}
        <div className="card p-3 min-w-[190px] max-w-[210px] flex-shrink-0 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Календари</span>
            <button onClick={() => setEditCal({})} className="text-lg leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Добавить">+</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {calendars.map(cal => {
              const mode = calFilters[cal.id] || 'all'
              return (
                <div key={cal.id} className="flex items-center gap-2 py-1.5">
                  <input type="checkbox" checked={!hiddenCalendars.has(cal.id)} onChange={() => toggleCal(cal.id)}
                    className="rounded cursor-pointer flex-shrink-0" style={{ accentColor: cal.color }} />
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cal.color }} />
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1 cursor-pointer"
                    onClick={() => setEditCal(cal)}>{cal.title}</span>
                  {cal.sync_to_gcal && <span className="text-xs flex-shrink-0" title="GCal">📅</span>}
                  <select value={mode} onChange={() => toggleFilter(cal.id)}
                    className="text-xs bg-transparent border-none text-gray-400 cursor-pointer outline-none flex-shrink-0">
                    <option value="all">Все</option>
                    <option value="watched">Избр.</option>
                  </select>
                </div>
              )
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            {calendars.filter(c => !hiddenCalendars.has(c.id)).map(cal => (
              <div key={cal.id} className="flex items-center gap-1.5 text-xs text-gray-400 py-0.5">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: cal.color }} />
                <span className="truncate">{cal.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Views */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          {view === 'month' && <div className="flex-1 min-h-0 overflow-auto"><MonthView year={year} month={month} allEvents={allEvents} allTasks={visibleTasks} today={today} onNewEvent={setNewEvent} calMap={calMap} onToggleWatched={toggleWatched} /></div>}
          {view === 'week' && <HourGrid dates={weekDates} allEvents={allEvents} allTasks={visibleTasks} today={today} onNewEvent={setNewEvent} calMap={calMap} onToggleWatched={toggleWatched} />}
          {view === 'day' && <HourGrid dates={[pivot]} allEvents={allEvents} allTasks={visibleTasks} today={today} onNewEvent={setNewEvent} calMap={calMap} onToggleWatched={toggleWatched} />}
          {newEvent && <EventForm date={newEvent.date} time={newEvent.time} onSave={() => { setNewEvent(null); loadAll() }} onCancel={() => setNewEvent(null)} />}
          {editCal && <CalEditModal cal={editCal} onSave={saveCal} onCancel={() => setEditCal(null)} onDelete={deleteCal} />}
        </div>
      </div>
    </div>
  )
}
