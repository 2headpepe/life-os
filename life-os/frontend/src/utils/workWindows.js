import { localDay } from './activeWork.js'

const MINUTE = 60000
const validMinutes = value => Number.isSafeInteger(value) && value > 0

function minutesInNote(notes) {
  if (typeof notes !== 'string') return null
  const unitMinutes = { мин: 1, минут: 1, минуты: 1, минута: 1, ч: 60, час: 60, часа: 60, часов: 60 }
  for (const line of notes.toLowerCase().split('\n')) {
    const match = line.match(/^\s*(?:оценка|длительность)\s*:\s*(\d+)\s*(минуты?|минут|минута|мин|часов|часа?|ч)\.?\s*$/u)
    if (match && validMinutes(Number(match[1]))) return Number(match[1]) * unitMinutes[match[2]]
  }
  return null
}

function nextDate(day, cadence) {
  const value = new Date(day + 'T12:00:00')
  if (cadence === 'monthly') value.setMonth(value.getMonth() + 1)
  else value.setDate(value.getDate() + (cadence === 'daily' ? 1 : 7))
  return localDay(value)
}

function taskEstimate(task, nodes) {
  if (validMinutes(task.remaining_min)) return { minutes: task.remaining_min, source: 'остаток' }
  if (validMinutes(task.estimate_min)) return { minutes: task.estimate_min, source: 'оценка задачи' }
  if (task.due && ['daily', 'weekly', 'monthly'].includes(task.recurrence)) {
    const previous = nodes.filter(node => node.status === 'done' && node.due && node.parent_id === task.parent_id &&
      node.title === task.title && node.recurrence === task.recurrence && nextDate(node.due, node.recurrence) === task.due)
    if (previous.length === 1 && validMinutes(previous[0].estimate_min)) {
      return { minutes: previous[0].estimate_min, source: 'оценка прошлого повторения' }
    }
  }
  const minutes = minutesInNote(task.notes)
  return minutes ? { minutes, source: 'оценка из заметки' } : { minutes: null, source: 'без оценки' }
}

export function workChoices(steps, nodes, schedule) {
  const groups = { quick: [], longer: [], unknown: [] }
  function add(task, title, estimate, firstStep) {
    const option = { task, title, firstStep, ...estimate }
    if (!estimate.minutes) {
      const quick = /^(?:отправить готов(?:ый файл|ое письмо)|подтвердить встречу|быстр(?:ое|ая|ый) |коротк(?:ая|ий|ое) )/iu
      const longer = /^(?:разобраться|изучить|подготовить отч[её]т)(?:\s|$)/iu
      if (quick.test(title)) groups.quick.push({ ...option, qualitative: true })
      else if (longer.test(title)) groups.longer.push({ ...option, qualitative: true })
      else groups.unknown.push(option)
      return
    }
    option.fits = schedule.freeMinutes == null ? null : estimate.minutes <= schedule.freeMinutes
    groups[estimate.minutes <= 20 ? 'quick' : 'longer'].push(option)
  }
  for (const task of steps) {
    if (task.first_step?.title) add(task, task.first_step.title, {
      minutes: validMinutes(task.first_step.estimate_min) ? task.first_step.estimate_min : null,
      source: 'первый шаг',
    }, true)
    add(task, task.title, taskEstimate(task, nodes), false)
  }
  for (const items of Object.values(groups)) items.sort((a, b) => Number(b.fits === true) - Number(a.fits === true))
  return groups
}

function timestamp(date, time) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN
  const value = new Date(date + 'T' + time + ':00')
  return localDay(value) === date ? value.getTime() : NaN
}

const nextDay = day => {
  const next = new Date(day + 'T00:00:00')
  next.setDate(next.getDate() + 1)
  return next.getTime()
}

// Read occupied time independently from Today visibility: recovery hides choices,
// but an actual meeting still bounds the available interval.
export function calendarCapacity(nodes, events, now, complete) {
  const intervals = []
  const uncertainDays = new Set()
  const begin = Math.ceil(now.getTime() / MINUTE) * MINUTE
  const today = localDay(now)
  function include(item, date, explicitAppointment, event) {
    if (!date || ['done', 'dropped', 'someday', 'cancelled'].includes(item.status)) return
    const at = timestamp(date, item.time)
    if (!Number.isFinite(at)) {
      // An unclocked task assigned to a day does not reserve that entire day.
      if (event || item.time) uncertainDays.add(date)
      return
    }
    if (!explicitAppointment) {
      // A legacy date might be a deadline. Treat its clock as a boundary
      // without assuming availability after it.
      intervals.push({ start: at, end: null, title: item.title })
      return
    }
    const minutes = item.duration_min
    intervals.push({ start: at, end: validMinutes(minutes) ? at + minutes * MINUTE : null,
      taskId: item.type === 'work_block' ? item.task_id : null, title: item.title })
  }
  for (const item of events) {
    if (item.type !== 'deadline') include(item, item.date, true, true)
  }
  const parents = new Set(nodes.map(item => item.parent_id))
  for (const node of nodes) {
    if (!node.parent_id || parents.has(node.id) || !node.due || node.date_kind === 'deadline') continue
    if (node.calendar_id && !node.watched && node.date_kind !== 'scheduled') continue
    if (!node.calendar_id && node.work_context === 'delivery' && node.date_kind !== 'scheduled') continue
    include(node, node.due, node.date_kind === 'scheduled' || Boolean(node.calendar_id), false)
  }
  intervals.sort((a, b) => a.start - b.start)
  let active = null
  for (const interval of intervals) {
    const until = interval.end ?? nextDay(localDay(new Date(interval.start)))
    if (until <= +now) continue
    if (interval.start > (active?.until ?? +now)) break
    const uncertainEnd = !interval.end || (active && !active.end)
    const end = Math.max(active?.until ?? 0, until)
    active = { until: end, end: uncertainEnd ? null : end }
  }
  const next = intervals.find(interval => interval.start > +now && localDay(new Date(interval.start)) === today)
  const uncertain = !complete || uncertainDays.has(today) || Boolean(active && !active.end)
  const freeMinutes = uncertain ? null : active ? 0 : next ? Math.max(0, Math.floor((next.start - begin) / MINUTE)) : null
  return { intervals, uncertainDays, complete, active, next, freeMinutes, uncertain, begin }
}

function deadlineTime(task) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(task.due)) return NaN
  return task.time ? timestamp(task.due, task.time) : nextDay(task.due)
}

function knownWindows(schedule, task, deadline) {
  const { begin, intervals, uncertainDays } = schedule
  const today = localDay(new Date(begin))
  const days = new Set([today, task.due])
  for (const item of intervals) {
    if (item.start < deadline && (item.end ?? nextDay(localDay(new Date(item.start)))) > begin) {
      days.add(localDay(new Date(item.start)))
      if (item.end) days.add(localDay(new Date(item.end)))
    }
  }
  const windows = []
  let reserved = 0
  for (const date of [...days].sort()) {
    if (date < today || date > task.due || uncertainDays.has(date)) continue
    const dayStart = timestamp(date, '00:00')
    const dayEnd = Math.min(nextDay(date), deadline)
    // Do not invent a working day for tomorrow or across an unbounded night.
    let cursor = date === today ? begin : null
    const starts = new Set()
    const ends = new Set()
    const periods = []
    for (const interval of intervals) {
      const end = interval.end ?? nextDay(localDay(new Date(interval.start)))
      const start = Math.max(dayStart, begin, interval.start)
      const stop = Math.min(dayEnd, end)
      if (start >= stop) continue
      starts.add(start)
      ends.add(stop)
      periods.push({ start, stop, owned: Boolean(interval.taskId === task.id && interval.end) })
    }
    const points = [...new Set([...starts, ...ends])].sort((a, b) => a - b)
    for (let index = 0; index < points.length; index++) {
      const at = points[index]
      if (cursor != null && cursor < at) windows.push({ start: cursor, end: at })
      const end = points[index + 1]
      const occupying = periods.filter(period => period.start <= at && period.stop > at)
      if (!occupying.length) { cursor = at; continue }
      if (occupying.every(period => period.owned)) reserved += Math.floor((end - at) / MINUTE)
      cursor = end
    }
    if (date === task.due && task.time && cursor != null && cursor < deadline) windows.push({ start: cursor, end: deadline })
  }
  return { windows, reserved }
}

export function deadlineGuidance(steps, schedule, waitingReasons = new Map()) {
  return steps.filter(task => task.date_kind === 'deadline' && task.due && ['undefined', 'scheduled', 'in_progress'].includes(task.status || 'undefined')).map(task => {
    const deadline = deadlineTime(task)
    const reason = waitingReasons.get(task.id) || null
    const facts = { task, deadline, remaining: task.remaining_min, reason }
    if (reason) return facts
    if (!validMinutes(task.remaining_min) || !schedule.complete || !(deadline > schedule.begin)) return facts
    const { windows, reserved } = knownWindows(schedule, task, deadline)
    let needed = Math.max(0, task.remaining_min - reserved)
    const segments = []
    for (const window of windows.reverse()) {
      const minutes = Math.min(needed, Math.floor((window.end - window.start) / MINUTE))
      if (minutes <= 0) continue
      segments.push({ start: window.end - minutes * MINUTE, minutes })
      needed -= minutes
      if (!needed) break
    }
    const today = localDay(new Date(schedule.begin))
    const knownHorizon = task.due === today && Boolean(task.time) && !schedule.uncertainDays.has(today) &&
      !schedule.intervals.some(interval => !interval.end && interval.start < deadline && localDay(new Date(interval.start)) === today)
    const missing = knownHorizon || segments.length || reserved ? needed : null
    return { ...facts, reserved, missing, knownHorizon, slot: segments.at(-1), segments: segments.length }
  }).sort((a, b) => a.deadline - b.deadline)
}
