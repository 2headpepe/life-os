// Only validate explicit date semantics. Older nodes can be read or edited in place.
function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function taskDateError(patch, previous = {}) {
  const validMinutes = value => value == null || (Number.isSafeInteger(value) && value > 0)
  if (!validMinutes(patch.estimate_min) || !validMinutes(patch.remaining_min)) return 'estimate and remaining work must be positive whole minutes'
  if (patch.first_step != null) {
    const step = patch.first_step
    if (typeof step.title !== 'string' || !step.title.trim() || step.title.length > 240 || !validMinutes(step.estimate_min)) {
      return 'first_step requires a title and an optional estimate in minutes'
    }
  }
  if (patch.available_from != null && !isCalendarDate(patch.available_from)) return 'available_from must be a valid date'
  if (patch.date_kind != null && !['scheduled', 'deadline'].includes(patch.date_kind)) return 'unknown date_kind'
  const due = Object.hasOwn(patch, 'due') ? patch.due : previous.due
  const kind = Object.hasOwn(patch, 'date_kind') ? patch.date_kind : previous.date_kind
  if (kind && (Object.hasOwn(patch, 'date_kind') || patch.due != null) && !isCalendarDate(due)) return 'date_kind requires a valid due date'
  const time = Object.hasOwn(patch, 'time') ? patch.time : previous.time
  const editsAppointment = Object.hasOwn(patch, 'time') || Object.hasOwn(patch, 'date_kind') || patch.due != null
  if (kind && due && editsAppointment && time != null && (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    return 'time must be HH:MM'
  }
  return null
}
