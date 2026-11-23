import { plannerLane, plannerRank } from './plannerSignals.js'
import { localDay } from './calendarDay.js'
export { localDay } from './calendarDay.js'

const STARTABLE = new Set(['undefined', 'scheduled', 'in_progress'])
const INACTIVE = new Set(['done', 'dropped', 'someday', 'waiting_for_review'])

export function isOverdueTask(task, today) {
  return Boolean(task?.due && task.due < today && !['done', 'dropped', 'someday'].includes(task.status))
}

export function overdueTasks(tasks, today) {
  return tasks.filter(task => isOverdueTask(task, today))
    .sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title, 'ru'))
}

function dateTime(day, time) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN
  if (time != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN
  const value = new Date(day + 'T' + (time || '00:00') + ':00')
  return localDay(value) === day ? value.getTime() : NaN
}

function reasonToWait(task, byId, today, now) {
  if (task.available_from > today) return 'Доступно с ' + task.available_from
  if (task.is_blocked || task.blocked_by?.some(id => byId.get(id)?.status !== 'done')) return 'Ожидает завершения зависимости'
  if (task.due && task.date_kind !== 'deadline') {
    if (task.due > today) return 'Запись в календаре на ' + task.due
    const assigned = dateTime(task.due, task.time)
    if (!Number.isFinite(assigned)) return 'Требуется уточнить дату и время'
    if (assigned > now) return 'Запись в календаре на ' + task.due + (task.time ? ' в ' + task.time : '')
    if (task.due < today) return 'Прошедшую дату нужно разобрать'
  }
  return null
}

function rankFor(task, today) {
  const lane = plannerLane(task)
  if (lane === 'focus') return 0
  if (lane === 'next') return 1
  if (lane === 'waiting') return 2
  if (task.date_kind === 'scheduled' && task.due === today) return 3
  if (task.status === 'in_progress') return 4
  return 5
}

export function selectNextSteps({ nodes, queue, events = [], now, recovery = false, allowedIds, calendarVisible = () => true }) {
  const today = localDay(now)
  const parents = new Set(nodes.map(node => node.parent_id))
  const byId = new Map(nodes.map(node => [node.id, node]))
  const plannerById = new Map(queue.map(node => [node.id, node.planner]))
  const steps = []
  const tasks = []
  const waitingReasons = new Map()
  const appointments = []
  let hidden = 0
  let nextChangeAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()

  function addAppointment(item, date, source, kind) {
    if (!date) return
    const at = dateTime(date, item.time)
    if (!Number.isFinite(at)) return
    // A start without an end remains current for its displayed minute.
    const minutes = source === 'event' && Number.isFinite(item.duration_min) && item.duration_min > 0 ? item.duration_min : 1
    const end = at + minutes * 60000
    if (item.time ? end <= now : date < today) return
    if (at > now) nextChangeAt = Math.min(nextChangeAt, at)
    if (item.time && at <= now) nextChangeAt = Math.min(nextChangeAt, end)
    appointments.push({ item, date, source, kind, at, current: Boolean(item.time && at <= now) })
  }

  // A personal step must lead to an existing personal branch.
  function hasPersonalPath(node) {
    const seen = new Set()
    let current = node
    while (current) {
      if ((current.work_context || 'personal') !== 'personal' || seen.has(current.id)) return false
      if (!current.parent_id) return true
      seen.add(current.id)
      current = byId.get(current.parent_id)
    }
    return false
  }

  for (const node of nodes) {
    if (!node.parent_id || parents.has(node.id) || !hasPersonalPath(node) || ['done', 'dropped'].includes(node.status) ||
        (node.status === 'someday' && !plannerById.has(node.id))) continue
    if (allowedIds && !allowedIds.has(node.id)) continue
    if (recovery && !node.core) { hidden++; continue }
    if (node.calendar_id && !calendarVisible(node)) continue
    const task = { ...node, planner: plannerById.get(node.id) }
    if (task.status !== 'waiting_for_review') addAppointment(task, task.due, 'node', task.date_kind || 'dated')
    // Calendar-linked tasks stay obligations; an explicit manual priority also
    // makes them eligible for the main task without removing that obligation.
    if (task.calendar_id && !plannerLane(task)) continue
    tasks.push(task)
    if (!STARTABLE.has(task.status || 'undefined') && !(task.status === 'someday' && task.planner)) continue
    const reason = reasonToWait(task, byId, today, now)
    if (reason) waitingReasons.set(task.id, reason)
    else steps.push(task)
  }
  for (const event of events) {
    const linkedTask = event.type === 'work_block' && byId.get(event.task_id)
    if (INACTIVE.has(event.status) || (event.work_context || 'personal') !== 'personal' || (recovery && !event.core && !linkedTask?.core)) continue
    addAppointment(event, event.date, 'event', event.type === 'deadline' ? 'deadline' : 'scheduled')
  }

  steps.sort((a, b) => rankFor(a, today) - rankFor(b, today)
    || plannerRank(a) - plannerRank(b)
    || a.title.localeCompare(b.title, 'ru') || a.id.localeCompare(b.id))
  appointments.sort((a, b) => Number(b.current) - Number(a.current) || a.date.localeCompare(b.date)
    || Number(Boolean(b.item.time)) - Number(Boolean(a.item.time)) || a.at - b.at || a.item.id.localeCompare(b.item.id))
  const first = steps[0]
  const held = tasks.filter(task => {
    if (!waitingReasons.has(task.id)) return false
    if (!first) return true
    const lane = plannerLane(task)
    if (lane !== 'focus' && lane !== 'next') return false
    if (lane === plannerLane(first)) return plannerRank(task) < plannerRank(first)
    return rankFor(task, today) < rankFor(first, today)
  }).sort((a, b) => rankFor(a, today) - rankFor(b, today) || plannerRank(a) - plannerRank(b))[0]
  const kind = { focus: 'now', next: 'next', waiting: 'later' }[plannerLane(first)] || 'available'
  return { task: first, kind, steps, tasks, held, waitingReasons, obligation: appointments[0], appointments, nextChangeAt, hidden }
}
