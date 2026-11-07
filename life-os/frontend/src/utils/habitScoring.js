export function inTimeWindow(tw, value) {
  if (!value || !tw) return false
  const crosses = tw.end <= tw.start
  if (crosses) return value >= tw.start || value <= tw.end
  return value >= tw.start && value <= tw.end
}

export function habitIsDone(habit, value) {
  if (value === undefined || value === null) return false
  if (habit.kind === 'toggle') return value === true
  if (habit.kind === 'counter') {
    const n = typeof value === 'number' ? value : 0
    return habit.target === 0 ? n === 0 : n >= habit.target
  }
  if (habit.kind === 'cycle') return Boolean(value) && (habit.cycle_scores?.[value] || 0) >= (habit.max_score || 1)
  if (habit.kind === 'time_window') return inTimeWindow(habit.time_window, value)
  if (habit.kind === 'bp') return Array.isArray(value) && value.length > 0
  return false
}

export function computeHabitScore(allHabits, log) {
  let score = 0
  for (const h of allHabits) {
    const v = log[h.id]
    if (h.kind === 'toggle' && v === true) score += h.max_score || 1
    else if (h.kind === 'counter') {
      if (v !== undefined && v !== null) {
        const n = typeof v === 'number' ? v : 0
        if (h.target === 0) score += n === 0 ? (h.max_score || 2) : n === 1 ? 1 : 0
        else score += n >= h.target ? (h.max_score || 2) : n > 0 ? 1 : 0
      }
    } else if (h.kind === 'cycle') score += h.cycle_scores?.[v] || 0
    else if (h.kind === 'time_window') {
      if (v && inTimeWindow(h.time_window, v)) score += h.max_score || 2
      else if (v) score += 1
    } else if (h.kind === 'bp') score += Array.isArray(v) && v.length > 0 ? (h.max_score || 1) : 0
  }
  return score
}
