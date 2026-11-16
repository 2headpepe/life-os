const STARTABLE_STATUSES = new Set(['undefined', 'scheduled', 'in_progress'])

function statusOf(task) {
  return task.status || 'undefined'
}

export function isOverdueTask(task, today) {
  return Boolean(task?.due && task.due < today && !['done', 'dropped', 'someday'].includes(statusOf(task)))
}

export function overdueTasks(tasks, today) {
  return tasks
    .filter(task => isOverdueTask(task, today))
    .sort((left, right) => left.due.localeCompare(right.due) || String(left.title).localeCompare(String(right.title), 'ru'))
}

function starterRank(task, today) {
  if (statusOf(task) === 'in_progress') return 0
  if (isOverdueTask(task, today)) return 1
  if (task.due === today) return 2
  if (statusOf(task) === 'scheduled') return 3
  if (statusOf(task) === 'undefined') return 4
  return 5
}

// These are suggestions for starting or resuming work, not an automatic
// priority decision. Callers pass active queue IDs to avoid duplicating cards.
export function starterBacklog(tasks, today, { excludeIds = new Set(), limit = 3 } = {}) {
  const available = tasks.filter(task => !excludeIds.has(task.id))
  const startable = available.filter(task => STARTABLE_STATUSES.has(statusOf(task)))
  const deferred = available.filter(task => !STARTABLE_STATUSES.has(statusOf(task)))
  return [...startable, ...deferred]
    .sort((left, right) => starterRank(left, today) - starterRank(right, today) || String(left.due || '9999-12-31').localeCompare(String(right.due || '9999-12-31')) || String(left.title).localeCompare(String(right.title), 'ru'))
    .slice(0, limit)
}
