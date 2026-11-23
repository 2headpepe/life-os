export function localDay(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

export function addLocalDays(day, offset) {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + offset)
  return localDay(date)
}

export function localWeekStart(day) {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() - (date.getDay() + 6) % 7)
  return localDay(date)
}
