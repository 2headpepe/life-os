import { useEffect, useState } from 'react'
import { AlertCircle, CalendarClock, Check, ChevronDown, ChevronRight, Loader2, NotebookPen, Pin, Sparkles, X } from 'lucide-react'
import { focus as focusApi } from '../api'
import sleepRoomScene from '../focus-sleep-scene.jpg'

const TONE_CLASS = {
  success: 'border-emerald-200/70 bg-emerald-50/55 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-950/70 dark:bg-emerald-950/15 dark:text-emerald-200 dark:hover:bg-emerald-950/25',
  caution: 'border-amber-200/70 bg-amber-50/55 text-amber-900 hover:bg-amber-50 dark:border-amber-950/70 dark:bg-amber-950/15 dark:text-amber-100 dark:hover:bg-amber-950/25',
  neutral: 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800',
}

const SCENE_ASSETS = {
  'sleep-room': sleepRoomScene,
}

function dayLabel(plan) {
  return `день ${plan.day} из ${plan.total_days}`
}

function HabitSection({ section, onAction, pending }) {
  const done = section.completed
  return (
    <button
      type="button"
      onClick={() => onAction(section.id, 'toggle')}
      disabled={pending}
      aria-pressed={done}
      className={`group flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-all duration-200 disabled:opacity-55 ${done
        ? 'border-emerald-200/70 bg-emerald-50/55 dark:border-emerald-950/55 dark:bg-emerald-950/10'
        : 'border-gray-200 bg-gray-50/80 hover:border-gray-300 hover:bg-gray-50 dark:border-slate-700/70 dark:bg-white/[0.025] dark:hover:border-slate-600 dark:hover:bg-white/[0.04]'}`}
    >
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition-all ${done
        ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm dark:border-emerald-800 dark:bg-emerald-800'
        : 'border-gray-300 bg-white text-transparent group-hover:border-emerald-400 dark:border-gray-600 dark:bg-gray-900'}`}>
        {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} strokeWidth={2.6} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">{section.title}</span>
        {section.detail && <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">{section.detail}</span>}
      </span>
      <ChevronRight size={16} className="text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600" />
    </button>
  )
}

function StateCheckin({ section, onAction, pending }) {
  return (
    <div className="flex flex-wrap gap-2 overflow-hidden" aria-label={section.title}>
      {(section.options || []).map(option => {
        const selected = section.value === option.id
        const caution = option.tone === 'caution'
        return (
          <button
            type="button"
            key={option.id}
            onClick={() => onAction(section.id, 'record_state', { value: option.id })}
            disabled={pending}
            aria-pressed={selected}
            className={`min-w-[150px] flex-1 min-h-[44px] rounded-lg border px-2.5 py-2 text-left transition-all duration-200 disabled:opacity-55 ${TONE_CLASS[option.tone] || TONE_CLASS.neutral} ${selected ? (caution ? 'border-amber-300/80 bg-amber-50/70 dark:border-amber-900/80 dark:bg-amber-950/30' : 'border-emerald-300/80 bg-emerald-50/70 dark:border-emerald-900/80 dark:bg-emerald-950/30') : ''}`}
          >
            <span className="block text-sm font-semibold tracking-tight">{pending && selected ? 'Сохраняю…' : option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function NoteCapture({ section, onAction, pending }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const save = async () => {
    if (!text.trim()) return
    await onAction(section.id, 'record_note', { text: text.trim() })
    setText('')
    setOpen(false)
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-left text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <span className="grid h-6 w-6 place-items-center rounded-md bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"><NotebookPen size={14} /></span>
        <span className="min-w-0 flex-1 text-sm font-semibold tracking-tight">{section.title}</span>
        <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-violet-100 bg-violet-50/30 p-2.5 dark:border-violet-900/50 dark:bg-violet-950/15">
          <textarea
            autoFocus
            value={text}
            onChange={event => setText(event.target.value)}
            onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') save() }}
            placeholder={section.detail || 'Что произошло или что хочется разобрать?'}
            className="min-h-[82px] w-full resize-y rounded-lg border border-violet-100 bg-white p-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-violet-200 dark:border-violet-900/70 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-600 dark:focus:ring-violet-800"
          />
          <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] text-violet-700/70 dark:text-violet-300/65">⌘ Enter — сохранить в записи дня</span><button type="button" onClick={save} disabled={!text.trim() || pending} className="rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-500 dark:hover:bg-violet-400">{pending ? 'Сохраняю…' : 'Сохранить'}</button></div>
        </div>
      )}
    </div>
  )
}

function AnalysisSection({ section }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-sky-700 transition-colors hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/25">
        <span className="font-semibold">Учтено</span><span className="flex-1 text-sky-900/70 dark:text-sky-100/70">План на завтра</span><ChevronRight size={14} className="shrink-0" />
      </button>
      {open && <div role="dialog" aria-modal="true" aria-label="Как учтена заметка" className="fixed inset-0 z-50 flex items-stretch bg-gray-950/55 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"><div className="flex h-full w-full flex-col bg-white dark:bg-gray-950 sm:h-auto sm:max-w-xl sm:rounded-2xl sm:border sm:border-gray-200 sm:shadow-2xl dark:sm:border-gray-800"><header className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800"><span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300"><Sparkles size={16} /></span><div className="min-w-0 flex-1"><h3 className="font-semibold tracking-tight">Как учтена твоя заметка</h3><p className="text-xs text-gray-400">{section.updated}</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-100" aria-label="Закрыть"><X size={18} /></button></header><div className="space-y-4 p-5 text-sm leading-6 text-gray-700 dark:text-gray-300"><div><p className="font-semibold text-gray-900 dark:text-gray-100">Наблюдение</p><p className="mt-1">{section.observation}</p></div><div><p className="font-semibold text-gray-900 dark:text-gray-100">Почему это важно</p><p className="mt-1">{section.reasoning}</p></div><div className="rounded-xl bg-sky-50 p-3 text-sky-950 dark:bg-sky-950/30 dark:text-sky-100"><p className="font-semibold">Что меняется завтра</p><p className="mt-1">{section.next_action}</p></div></div></div></div>}
    </>
  )
}

function DailyFocus({ section, compact = false }) {
  if (compact) {
    return <div className="sr-only"><h2>{section.title}</h2><p>{section.motivation}</p></div>
  }
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold tracking-[-0.03em] text-gray-900 dark:text-gray-100">{section.title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{section.motivation}</p>
    </div>
  )
}

function DailyScene({ section, date, day, dailyFocus, actions = [], utilities = [], notes = [], analysis, onAction, pending, open, onOpen, onClose }) {
  useEffect(() => {
    if (!open) return undefined
    const close = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open, onClose])
  const image = SCENE_ASSETS[section.asset_id]
  if (!image) return null
  const traces = actions.flatMap(action => {
    if (action.type === 'habit' && action.completed) return [{ id: action.id, label: action.title }]
    if (action.type === 'state_checkin' && action.value) {
      const option = action.options?.find(item => item.id === action.value)
      return option ? [{ id: action.id, label: option.label }] : []
    }
    return []
  })
  const todaysNotes = notes.filter(note => note.date === date)
  if (todaysNotes.length) traces.push({ id: 'note', label: todaysNotes.length === 1 ? 'Сохранена заметка' : `Сохранено заметок: ${todaysNotes.length}` })
  return (
    <>
      <button type="button" onClick={onOpen} className="group relative block h-52 w-full overflow-hidden bg-slate-950 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-inset sm:h-64" aria-label="Открыть сцену дня">
        <img src={image} alt={section.alt || ''} className="h-full w-full object-cover object-center opacity-90 transition-transform duration-500 motion-safe:group-hover:scale-[1.015]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07101e] via-slate-950/30 to-slate-950/5" aria-hidden="true" />
        <span className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-4 py-3 text-white"><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">{day}</span><span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">{section.eyebrow || 'Сцена дня'}<Sparkles size={13} className="text-amber-200/90" aria-hidden="true" /></span></span>
        <span className="absolute inset-x-0 bottom-0 px-4 py-4 text-white">
          <span className="block text-xl font-semibold tracking-[-0.035em] sm:text-2xl">{dailyFocus?.title || section.caption}</span>
          <span className="mt-1 block max-w-xl text-sm leading-snug text-white/85">{section.caption}</span>
        </span>
      </button>
      {open && <div role="dialog" aria-modal="true" aria-label="Сцена дня" className="fixed inset-0 z-[100] overflow-y-auto bg-gray-950/60 p-0 backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:p-6">
        <section className="min-h-full w-full bg-white dark:bg-gray-950 sm:min-h-0 sm:max-w-2xl sm:overflow-hidden sm:rounded-3xl sm:border sm:border-gray-200 sm:shadow-2xl dark:sm:border-gray-800">
          <div className="relative h-[42svh] min-h-64 max-h-[460px] bg-slate-950"><img src={image} alt="" className="h-full w-full object-cover object-center" /><div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/10 to-transparent" aria-hidden="true" /><div className="absolute inset-x-0 bottom-0 p-5 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">{day} · {section.eyebrow || 'Сцена дня'}</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">{dailyFocus?.title || section.caption}</h2><p className="mt-2 max-w-lg text-sm leading-relaxed text-white/85">{section.caption}</p></div><button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-full bg-black/25 p-2.5 text-white backdrop-blur-sm transition-colors hover:bg-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Закрыть сцену дня"><X size={19} /></button></div>
          <div className="space-y-5 p-5 sm:p-6">
            {dailyFocus?.motivation && <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{dailyFocus.motivation}</p>}
            <div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-gray-400">След дня</p>{traces.length ? <ul className="mt-2 space-y-2">{traces.map(trace => <li key={trace.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"><span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"><Check size={12} strokeWidth={3} /></span>{trace.label}</li>)}</ul> : <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Пока здесь пусто. Это не оценка — просто пространство, в котором можно заметить день.</p>}</div>
            {utilities.length > 0 && <div className="border-t border-gray-100 pt-4 dark:border-gray-800"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.13em] text-gray-400">Оставить след</p>{utilities.map(item => <ActionSection key={item.id} section={item} onAction={onAction} pending={pending === item.id} />)}</div>}
            {analysis?.next_action && <aside className="rounded-2xl bg-sky-50 p-3.5 text-sm leading-6 text-sky-950 dark:bg-sky-950/30 dark:text-sky-100"><p className="font-semibold">Направление дальше</p><p className="mt-1 text-sky-900/85 dark:text-sky-100/85">{analysis.next_action}</p></aside>}
          </div>
        </section>
      </div>}
    </>
  )
}

function ActionSection({ section, onAction, pending }) {
  const Renderer = SECTION_RENDERERS[section.type]
  return Renderer ? <Renderer section={section} onAction={onAction} pending={pending} /> : null
}

function focusDateLabel(date) {
  return date ? new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : ''
}

function FocusNotes({ notes }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return undefined
    const close = event => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])
  if (!notes?.length) return null
  const latest = notes[0]
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800/60 dark:hover:text-gray-200">
        <NotebookPen size={14} className="shrink-0 text-violet-500" />
        <span className="min-w-0 flex-1 truncate"><span className="font-semibold">Заметки · {notes.length}</span><span className="text-gray-400"> — {latest.text}</span></span>
        <span className="shrink-0 text-[11px] text-violet-600 dark:text-violet-300">Открыть</span>
      </button>
      {open && <div role="dialog" aria-modal="true" aria-label="Заметки фокус-плана" className="fixed inset-0 z-50 flex items-stretch bg-gray-950/55 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
        <div className="flex h-full w-full flex-col bg-white dark:bg-gray-950 sm:h-[min(720px,90vh)] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-gray-200 sm:shadow-2xl dark:sm:border-gray-800">
          <header className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800"><span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300"><NotebookPen size={16} /></span><div className="min-w-0 flex-1"><h3 className="font-semibold tracking-tight">Заметки фокус-плана</h3><p className="text-xs text-gray-400">{notes.length} {notes.length === 1 ? 'запись' : 'записи'} · без автоматических выводов</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-100" aria-label="Закрыть заметки"><X size={18} /></button></header>
          <div className="flex-1 space-y-3 overflow-y-auto p-5">{notes.map(note => <article key={note.id} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-900/60"><time className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">{focusDateLabel(note.date)}</time><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-800 dark:text-gray-200">{note.text}</p></article>)}</div>
        </div>
      </div>}
    </>
  )
}

function CheckpointSection({ section, onAction, pending }) {
  const node = section.node
  if (!node || node.status === 'done') return null
  const due = node.due ? new Date(`${node.due}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : 'скоро'
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/70 px-2.5 py-2 dark:border-gray-800 dark:bg-gray-800/35">
      <CalendarClock size={14} className="shrink-0 text-gray-400" />
      <span className="min-w-0 flex-1 text-xs text-gray-600 dark:text-gray-300"><span className="font-semibold">{section.title}</span><span className="text-gray-400"> · {due}</span></span>
      {node.due && node.due <= new Date().toISOString().slice(0, 10) && <button type="button" onClick={() => onAction(section.id, 'complete')} disabled={pending} className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-gray-500 hover:bg-white hover:text-gray-900 disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-gray-100">Готово</button>}
    </div>
  )
}

const SECTION_RENDERERS = {
  habit: HabitSection,
  state_checkin: StateCheckin,
  note_capture: NoteCapture,
  analysis: AnalysisSection,
  daily_focus: DailyFocus,
  daily_scene: DailyScene,
  checkpoint: CheckpointSection,
}

export default function FocusCard({ focus, onChange }) {
  const [plan, setPlan] = useState(focus)
  const [pending, setPending] = useState(null)
  const [error, setError] = useState(null)
  const [sceneOpen, setSceneOpen] = useState(false)
  useEffect(() => setPlan(focus), [focus])
  const sections = plan?.sections || []
  const dailyFocus = sections.find(section => section.type === 'daily_focus')
  const dailyScene = sections.find(section => section.type === 'daily_scene')

  useEffect(() => {
    if (!dailyScene) return undefined
    const openScene = () => setSceneOpen(true)
    window.addEventListener('life-os:open-focus-scene', openScene)
    return () => window.removeEventListener('life-os:open-focus-scene', openScene)
  }, [dailyScene])
  const actionSections = dailyFocus?.actions?.length
    ? dailyFocus.actions
    : sections.filter(section => section.type === 'habit' || section.type === 'state_checkin')
  const utilitySections = dailyFocus?.utilities?.length
    ? dailyFocus.utilities
    : sections.filter(section => section.type === 'note_capture')
  const contextSections = sections.filter(section => section.type === 'analysis')
  const actionComplete = section => (section.type === 'habit' ? section.completed : section.type === 'state_checkin' ? Boolean(section.value) : false)
  const primaryAction = dailyScene ? actionSections.find(section => !actionComplete(section)) : null
  const feedActions = dailyScene ? (primaryAction ? [primaryAction] : []) : actionSections

  if (!plan) return null
  const act = async (componentId, action, payload = {}) => {
    setError(null)
    setPending(componentId)
    try {
      const next = await focusApi.action(componentId, action, payload)
      setPlan(next)
      onChange?.(next)
    } catch (err) {
      setError(err.message || 'Не удалось сохранить')
    } finally {
      setPending(null)
    }
  }

  return (
    <section className="snap-none scroll-mt-2" aria-label="Закреплённый фокус">
      <article className="feed-focus-card overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)] dark:border-slate-700/80 dark:bg-[#07101e] dark:shadow-[0_20px_52px_rgba(0,0,0,0.24)]">
        {!dailyScene && <header className="flex items-center gap-2 px-4 pt-4"><span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/55 dark:text-emerald-300"><Pin size={14} /></span><span className="text-[10px] font-bold uppercase tracking-[0.11em] text-gray-400">фокус на сегодня</span><span className="ml-auto text-xs text-gray-400">{dayLabel(plan)}</span></header>}
        {dailyScene && <DailyScene section={dailyScene} date={plan.date} day={dayLabel(plan)} dailyFocus={dailyFocus} actions={actionSections} utilities={utilitySections} notes={plan.notes} analysis={contextSections[0]} onAction={act} pending={pending} open={sceneOpen} onOpen={() => setSceneOpen(true)} onClose={() => setSceneOpen(false)} />}
        <div className={dailyScene ? 'p-6 pt-5 sm:p-7 sm:pt-6' : 'p-4 pt-3'}>
          {dailyFocus && <DailyFocus section={dailyFocus} compact={Boolean(dailyScene)} />}
          {feedActions.length > 0 && <div className="grid gap-3">{feedActions.map(section => <ActionSection key={section.id} section={section} onAction={act} pending={pending === section.id} />)}</div>}
          {dailyScene ? <button type="button" onClick={() => setSceneOpen(true)} className="mt-3 flex min-h-[40px] w-full items-center justify-between rounded-xl px-2 text-left text-xs font-semibold text-gray-500 transition-colors hover:bg-black/[0.025] hover:text-gray-700 dark:text-slate-400 dark:hover:bg-white/[0.035] dark:hover:text-slate-200"><span>{primaryAction ? 'Остальные действия и запись — в сцене дня' : 'День отмечен · открыть сцену и оставить мысль'}</span><ChevronRight size={15} /></button> : <><div className="mt-2 grid gap-2">{utilitySections.map(section => <ActionSection key={section.id} section={section} onAction={act} pending={pending === section.id} />)}</div>{contextSections.length > 0 && <div className="mt-1">{contextSections.map(section => <AnalysisSection key={section.id} section={section} />)}</div>}<FocusNotes notes={plan.notes} />{plan.insight && <aside className="mt-2 flex gap-2 rounded-lg px-2 py-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400"><Sparkles size={13} className="mt-0.5 shrink-0 text-violet-500" /><span><span className="font-semibold text-gray-600 dark:text-gray-300">{plan.insight.label}.</span> {plan.insight.text}</span></aside>}</>}
          {error && <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"><AlertCircle size={13} />{error}</p>}
        </div>
      </article>
    </section>
  )
}
