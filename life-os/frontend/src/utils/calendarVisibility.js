const LS_HIDDEN = 'life-os-hidden-calendars'
const LS_FILTERS = 'life-os-cal-filters'

export function loadHidden() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_HIDDEN) || '[]')) }
  catch { return new Set() }
}
export function saveHidden(set) { localStorage.setItem(LS_HIDDEN, JSON.stringify([...set])) }

export function loadFilters() {
  try { return JSON.parse(localStorage.getItem(LS_FILTERS) || '{}') }
  catch { return {} }
}
export function saveFilters(obj) { localStorage.setItem(LS_FILTERS, JSON.stringify(obj)) }

export function calendarNodeVisible(node, hidden, filters) {
  if (!node.calendar_id) return true
  return !hidden.has(node.calendar_id) && (filters[node.calendar_id] !== 'watched' || node.watched)
}
