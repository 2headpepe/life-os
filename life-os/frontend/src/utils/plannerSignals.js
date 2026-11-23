export const PLANNER_LANES = {
  focus: { label: 'Сегодня', className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200' },
  next: { label: 'Следующая', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' },
  waiting: { label: 'Позже', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
}

export function plannerLane(node) {
  if (!['undefined', 'scheduled', 'in_progress', 'someday'].includes(node?.status || 'undefined')) return null
  const lane = node?.planner?.lane
  return PLANNER_LANES[lane] ? lane : null
}

export function plannerRank(node) {
  return Number.isSafeInteger(node?.planner?.rank) ? node.planner.rank : Number.MAX_SAFE_INTEGER
}

export function plannerFollowUpDue(node, today) {
  return false
}

export function plannerLabel(node) {
  const lane = plannerLane(node)
  if (!lane) return null
  return PLANNER_LANES[lane].label
}

export function plannerMeta(node) {
  const lane = plannerLane(node)
  if (!lane) return null
  return {
    lane,
    label: PLANNER_LANES[lane].label,
    className: PLANNER_LANES[lane].className,
    urgency: node?.planner?.urgency || 'unknown',
    followUpOn: null,
    priorityNote: node?.planner?.priority_note || null,
  }
}
