import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { events, planner, tree } from '../api'
import { localDay } from '../utils/activeWork'
import { entityPath, nodePath } from '../utils/entityLinks'
import { plannerLane } from '../utils/plannerSignals'
import { ChevronDown, Ellipsis, ListTodo, CalendarDays } from 'lucide-react'

const buttonClass = 'btn btn-ghost text-xs'
const smallTime = timestamp => new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const slotTime = timestamp => new Date(timestamp).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function tomorrow(now) {
  return localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
}

function useWrite(onRefresh) {
  const lock = useRef(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  async function write(operation, success) {
    if (lock.current) return
    lock.current = true
    setPending(true)
    setMessage('')
    try {
      const result = await operation()
      if (!result || result.error) throw new Error(result?.error || 'Не удалось сохранить изменение.')
      setMessage(success)
      return result
    } catch (error) {
      setMessage(error.message || 'Не удалось сохранить изменение.')
      return null
    } finally {
      try { await onRefresh() }
      finally { lock.current = false; setPending(false) }
    }
  }
  return { write, pending, message }
}

export function TaskResultActions({ task, now, option, step, schedule, onRefresh }) {
  const { write, pending, message } = useWrite(onRefresh)
  const [open, setOpen] = useState(false)
  const id = useId()
  const trigger = useRef(null)
  const popover = useRef(null)
  function closeActions() {
    popover.current?.hidePopover()
    trigger.current?.focus()
  }
  function toggleActions() {
    const panel = popover.current
    if (panel.matches(':popover-open')) return closeActions()
    panel.showPopover()
    const anchor = trigger.current.getBoundingClientRect()
    const rect = panel.getBoundingClientRect()
    const below = innerHeight - anchor.bottom - 8
    const above = anchor.top - 8
    const flip = below < rect.height && above > below
    panel.style.maxHeight = Math.max(48, flip ? above - 6 : below - 6) + 'px'
    panel.style.top = (flip ? anchor.top - panel.offsetHeight - 6 : anchor.bottom + 6) + 'px'
    panel.style.left = Math.max(8, Math.min(innerWidth - rect.width - 8, anchor.right - rect.width)) + 'px'
    panel.querySelector('button:not(:disabled), a[href]')?.focus()
  }
  useEffect(() => {
    const panel = popover.current
    function sync() {
      const visible = panel.matches(':popover-open')
      setOpen(visible)
      if (!visible) panel.style.maxHeight = ''
    }
    function dismiss(event) {
      if (event.target instanceof Node && panel.contains(event.target)) return
      if (panel.matches(':popover-open')) panel.hidePopover()
    }
    panel.addEventListener('toggle', sync)
    window.addEventListener('resize', dismiss)
    document.addEventListener('scroll', dismiss, true)
    return () => {
      panel.removeEventListener('toggle', sync)
      window.removeEventListener('resize', dismiss)
      document.removeEventListener('scroll', dismiss, true)
    }
  }, [])
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const bookable = [step, option].filter(item => item?.minutes > 0 && item.minutes <= 1440 &&
    schedule.complete && !schedule.uncertain && !schedule.active && item.fits !== false &&
    schedule.begin + item.minutes * 60000 <= midnight)
  const nextDay = tomorrow(now)
  const lane = plannerLane(task)
  return <>
    <button type="button" aria-label={'Действия · ' + (option?.title || task.title)} aria-expanded={open}
      ref={trigger} popovertarget={id} aria-controls={id} onClick={event => { event.preventDefault(); toggleActions() }} title="Действия с задачей" className="today-action-toggle">
      <Ellipsis size={20} aria-hidden="true" />
    </button>
    <div id={id} popover="auto" ref={popover} role="group" aria-label="Действия с задачей" className="today-action-panel"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); closeActions() }
        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
        event.preventDefault()
        const items = Array.from(event.currentTarget.querySelectorAll('button:not(:disabled), a[href]'))
        const index = items.indexOf(document.activeElement)
        items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
      }}
      onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) event.currentTarget.hidePopover()
      }}>
    <div className="grid gap-1" onClick={event => { if (event.target.closest('button:not([data-stay-open]), a')) closeActions() }}>
      {step && <button disabled={pending} className={buttonClass} onClick={() => write(() => tree.update(task.id, { first_step: null }), 'Первый шаг выполнен.')}>Первый шаг выполнен</button>}
      <button disabled={pending} className={buttonClass} onClick={() => write(() => tree.update(task.id, { status: 'done', complete_leaf_only: true }), 'Задача завершена.')}>Завершить задачу</button>
      {task.status !== 'in_progress' && <button disabled={pending} className={buttonClass} onClick={() => write(() => tree.update(task.id, { status: 'in_progress' }), 'Задача в работе.')}>Начать работу</button>}
      {lane !== 'focus' && <button disabled={pending} className={buttonClass} onClick={() => write(() => planner.updateTask(task.id, { lane: 'focus' }), 'Приоритет на сегодня сохранён.')}>Приоритет: сегодня</button>}
      {lane !== 'waiting' && <button disabled={pending} className={buttonClass} onClick={() => write(() => planner.updateTask(task.id, { lane: 'waiting' }), 'Приоритет «Позже» сохранён.')}>Приоритет: позже</button>}
      <button disabled={pending} className={buttonClass} onClick={() => write(() => tree.update(task.id, { available_from: nextDay }), 'Отложено до завтра.')}>Отложить до завтра</button>
    </div>
    {bookable.map(item => <SaveInterval key={item.firstStep ? 'step' : 'task'} task={task} title={item.title}
      label={item.firstStep ? 'Выделить время на шаг' : 'Выделить время на задачу'} slot={{ start: schedule.begin, minutes: item.minutes }} onRefresh={onRefresh} />)}
    </div>
    {message && <p role="status" className="col-span-full text-xs">{message}</p>}
  </>
}

function SaveInterval({ task, title, slot, onRefresh, label = 'Сохранить интервал' }) {
  const request = useRef(null)
  const { write, pending, message } = useWrite(onRefresh)
  const [savedId, setSavedId] = useState(null)
  const start = new Date(slot.start)
  const key = JSON.stringify([task.id, title, slot.start, slot.minutes])
  async function save() {
    if (request.current?.key !== key) request.current = { key, id: 'block-' + crypto.randomUUID() }
    const result = await events.add({
      type: 'work_block', task_id: task.id, title, date: localDay(start),
      time: smallTime(start), duration_min: slot.minutes, id: request.current.id, verify_window: true,
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    if (result?.id && !result.error) setSavedId({ key, id: result.id })
    return result
  }
  return <div className="mt-2">
    {savedId?.key === key
      ? <Link className="text-xs text-blue-600 underline" to={entityPath.calendarEvent(savedId.id)}>Открыть интервал</Link>
      : <button className={buttonClass} disabled={pending} onClick={() => write(save, 'Рабочий интервал сохранён.')}>
        {label} · {slotTime(start)} · {slot.minutes} мин
      </button>}
    {message && <p role="status" className="text-xs">{message}</p>}
  </div>
}

function windowText(schedule) {
  if (!schedule.complete) return 'События календаря не загрузились. Длительность дел видна, свободный промежуток уточнить не удалось.'
  if (schedule.active) return schedule.active.end
    ? 'В календаре занято до ' + smallTime(schedule.active.end) + '.'
    : 'В календаре есть назначение без времени окончания.'
  if (schedule.uncertain) return 'Для части записей неизвестно время. Длительность дел показана отдельно.'
  if (schedule.next) return 'До «' + schedule.next.title + '» — ' + schedule.freeMinutes + ' мин.'
  return 'Сегодня впереди нет встреч с указанным временем.'
}

export function DeadlineInfo({ row, schedule, onRefresh }) {
  const { task, deadline, remaining, reserved, missing, knownHorizon, slot, segments, reason } = row
  const date = new Date(task.due + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  return <div className="today-deadline">
      <p className="flex items-center gap-2"><CalendarDays size={15} aria-hidden="true" />До {date} {task.time}{remaining > 0 && ' · осталось около ' + remaining + ' мин'}</p>
      {reason && <p className="text-xs text-amber-700">{reason}</p>}
      {reserved > 0 && <p className="text-xs">В календаре на эту задачу уже выделено {reserved} мин.</p>}
      {missing > 0 && <p className="text-xs">{knownHorizon
        ? 'До срока по расписанию не помещается ещё ' + missing + ' мин.'
        : 'Для ещё ' + missing + ' мин не найден подтверждённый промежуток.'}</p>}
      {slot && <p className="text-xs">
        {missing > 0 ? 'Можно выделить ' + slot.minutes + ' мин с ' + slotTime(slot.start) + '.'
          : 'По известным промежуткам начать стоит к ' + slotTime(slot.start) + '.'}
        {(segments > 1 || missing > 0 || reserved > 0) && ' Такой план подходит, если задачу можно делать частями.'}
      </p>}
      {slot ? <SaveInterval task={task} title={task.title} slot={slot} onRefresh={onRefresh} />
        : remaining > 0 && !reserved && !reason && !(missing > 0) && <p className="text-xs text-gray-500">
          {!schedule.complete ? 'Расписание неполно.' : deadline <= schedule.begin ? 'Срок уже наступил.' : 'Подходящий интервал по расписанию определить не удалось.'}
        </p>}
  </div>
}

export function FirstStep({ step }) {
  if (!step) return null
  return <div className="today-first-step">
    <p className="text-xs font-medium">Первый шаг{step.minutes ? ' · ≈ ' + step.minutes + ' мин' : ''}</p>
    <p className="mt-1 text-sm font-medium">{step.title}</p>
    {step.fits != null && <p className="text-xs">{step.fits ? 'Помещается до следующего события' : 'Дольше свободного промежутка'}</p>}
  </div>
}

function WorkOption({ option, step, deadline, nodes, schedule, now, onRefresh }) {
  const { task, title, minutes, fits } = option
  return <li className="today-option grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 text-sm">
    <div>
      <Link to={nodePath(nodes, task) || '/goals'} className="break-words font-semibold hover:underline">{title}</Link>
      {minutes > 0 && <p className="text-xs">Около {minutes} мин · {option.source}</p>}
      {fits != null && <p className="text-xs">{fits ? 'Помещается до следующего события' : 'Дольше свободного промежутка'}</p>}
    </div>
    <TaskResultActions task={task} now={now} option={option} step={step} schedule={schedule} onRefresh={onRefresh} />
    <div className="col-span-full">
      <FirstStep step={step} />
      {deadline && <DeadlineInfo row={deadline} schedule={schedule} onRefresh={onRefresh} />}
    </div>
  </li>
}

export default function TodayWorkOptions({ attention, choices, deadlines, nodes, now, schedule, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState({})
  const options = Object.values(choices).flat()
  const steps = new Map(options.filter(item => item.firstStep).map(item => [item.task.id, item]))
  const wholeTasks = new Map(options.filter(item => !item.firstStep).map(item => [item.task.id, item]))
  const alternatives = Object.fromEntries(Object.entries(choices).map(([key, group]) =>
    [key, group.filter(item => item.task.id !== attention.task?.id && (item.firstStep || !steps.has(item.task.id)))]))
  const tabs = schedule.freeMinutes > 60 ? ['longer', 'quick', 'unknown'] : ['quick', 'longer', 'unknown']
  const labels = { quick: 'Быстро', longer: 'Подольше', unknown: 'Без оценки' }
  const hasChoices = tabs.some(key => alternatives[key].length)
  const choiceCount = new Set(Object.values(alternatives).flat().map(item => item.task.id)).size
  const hasEstimates = Object.values(alternatives).flat().some(option => option.minutes)
  const visibleOptions = key => expanded[key] || alternatives[key].length <= 5
    ? alternatives[key] : alternatives[key].slice(0, 3)
  const visibleIds = new Set(open ? tabs.flatMap(key =>
    visibleOptions(key).map(item => item.task.id)) : [])
  const separateDeadlines = deadlines.filter(row => row.task.id !== attention.task?.id && !visibleIds.has(row.task.id))
  return <section className="border-t border-gray-500/20">
    <h2 id="work-options-heading"><button type="button" className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-gray-500/10 sm:px-6" aria-expanded={open}
      aria-controls="today-work-choices" onClick={() => setOpen(!open)}>{hasChoices ? `Другие доступные дела · ${choiceCount}` : 'Других доступных дел нет'}<ChevronDown size={18} aria-hidden="true" className={open ? 'rotate-180' : ''} /></button></h2>
    {open && <div id="today-work-choices" className="px-4 pb-4 sm:px-6">
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{hasChoices ? windowText(schedule) : 'Других доступных дел сейчас нет.'}</p>
      {hasChoices && !hasEstimates && <p className="mt-1 text-xs text-gray-500">Для этих задач длительность не указана</p>}
      <div className="mt-3 space-y-3">
        {tabs.filter(key => alternatives[key].length).map(key => <section key={key}>
          <h3 className={!hasEstimates && key === 'unknown' ? 'sr-only' : 'text-sm font-semibold'}>{key !== 'unknown' && alternatives[key].every(option => !option.minutes) ? labels[key] + ' · по формулировке' : labels[key]}</h3>
          <ul className="today-option-list mt-2">{visibleOptions(key).map(option =>
            <WorkOption key={option.task.id} option={wholeTasks.get(option.task.id)} step={steps.get(option.task.id)} deadline={deadlines.find(row => row.task.id === option.task.id)}
              nodes={nodes} schedule={schedule} now={now} onRefresh={onRefresh} />)}</ul>
          {!expanded[key] && alternatives[key].length > 5 && <button className={buttonClass}
            onClick={() => setExpanded(current => ({ ...current, [key]: true }))}>Показать ещё {alternatives[key].length - 3} · {labels[key]}</button>}
        </section>)}
      </div>
      <Link className="mt-3 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4" to="/pool?status=someday">
        Посмотреть идеи из «Когда-нибудь»
      </Link>
    </div>}
    {separateDeadlines.length > 0 && <div className="today-deadlines px-4 py-4 sm:px-6">
      <h3 className="text-sm font-semibold">Ближайшие сроки</h3>
      <ul className="today-deadline-list mt-3">{separateDeadlines.map(row => <li className="today-deadline-item" key={row.task.id}>
        <Link to={nodePath(nodes, row.task) || '/goals'} className="today-deadline-title text-sm font-medium hover:underline">{row.task.title}</Link>
        <DeadlineInfo row={row} schedule={schedule} onRefresh={onRefresh} />
      </li>)}</ul>
    </div>}
    <div className="today-options-footer px-4 py-3 sm:px-6"><Link className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400" to="/pool">
      <ListTodo size={16} aria-hidden="true" />Все задачи <ChevronDown size={15} aria-hidden="true" className="-rotate-90" />
    </Link></div>
  </section>
}
