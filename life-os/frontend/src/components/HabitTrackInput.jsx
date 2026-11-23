import { useState } from "react"
import { Check, X } from "lucide-react"
import { inTimeWindow } from "../utils/habitScoring"

// ─── Tracking tab: full-size inputs ────────────────────────────────

const CYCLE_COLORS = {
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
      className={`habit-track-toggle w-8 h-8 rounded-full flex items-center justify-center transition-all
        ${value === true  ? 'bg-green-400 dark:bg-green-500 text-white'
        : value === false ? 'bg-red-400 dark:bg-red-500 text-white'
        :                   'border-2 border-gray-300 dark:border-gray-600 text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'}`}
    >
      {value === true ? <Check size={14} /> : value === false ? <X size={14} /> : <span className="text-[11px] leading-none select-none">—</span>}
    </button>
  )
}

function TrackCounter({ habit, value, onChange }) {
  const isNull = value === undefined || value === null
  const v = isNull ? 0 : (typeof value === 'number' ? value : 0)
  const color = isNull ? 'text-gray-400'
    : habit.target === 0
      ? (v === 0 ? 'text-green-500' : v === 1 ? 'text-amber-500' : 'text-red-500')
      : (v >= habit.target ? 'text-green-500' : v > 0 ? 'text-amber-500' : 'text-gray-400')
  return (
    <div className="habit-counter flex items-center gap-2">
      <button
        onClick={() => onChange(isNull ? null : v === 0 ? null : v - 1)}
        disabled={isNull}
        className="habit-track-step w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 flex items-center justify-center"
      >−</button>
      <span className={`habit-counter__value text-lg font-semibold w-8 text-center ${color}`}>{isNull ? '—' : v}</span>
      <button
        onClick={() => onChange(isNull ? 0 : v + 1)}
        className="habit-track-step w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center"
      >+</button>
      {habit.target > 0 && !isNull && <span className="text-xs text-gray-400">/ {habit.target}</span>}
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
      className={`habit-track-cycle px-4 py-1.5 rounded-lg border text-sm font-medium transition-opacity hover:opacity-75 ${colorClass}`}
    >{label}</button>
  )
}

function TrackTimeWindow({ habit, value, onChange }) {
  const tw = habit.time_window
  const ok = inTimeWindow(tw, value)
  const color = value ? (ok ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400') : ''
  return (
    <div className="habit-time-window flex items-center gap-2">
      <input
        type="time"
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
        className={`habit-time-input text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 outline-none cursor-pointer ${color}`}
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
            className="habit-bp-input text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-1 w-[72px] outline-none" />
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

export default function TrackInput({ habit, value, onChange, editable }) {
  if (!editable) return <span className="text-xs text-gray-300 dark:text-gray-700">—</span>
  if (habit.kind === 'toggle')      return <TrackToggle value={value} onChange={onChange} />
  if (habit.kind === 'counter')     return <TrackCounter habit={habit} value={value} onChange={onChange} />
  if (habit.kind === 'cycle')       return <TrackCycle habit={habit} value={value} onChange={onChange} />
  if (habit.kind === 'time_window') return <TrackTimeWindow habit={habit} value={value} onChange={onChange} />
  if (habit.kind === 'bp')          return <TrackBP value={value} onChange={onChange} />
  return null
}
