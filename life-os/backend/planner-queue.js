import { isBlocked, workContext } from './task-lifecycle.js'

export const PLANNER_LANES = ['focus', 'next', 'waiting']
export const PLANNER_URGENCY = ['unknown', 'normal', 'urgent']
export const PLANNER_RANK_STEP = 1024

const LANE_INDEX = new Map(PLANNER_LANES.map((lane, index) => [lane, index]))
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
function nonEmptyString(value, field, { limit = 240, required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw new Error(`${field} is required`)
    return null
  }
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  const trimmed = value.trim()
  if (!trimmed && required) throw new Error(`${field} is required`)
  if (!trimmed) return null
  if (trimmed.length > limit) throw new Error(`${field} is too long`)
  return trimmed
}

function allowedValue(value, values, field) {
  if (value == null) return null
  if (!values.includes(value)) throw new Error(`unknown ${field}`)
  return value
}

function optionalDate(value) {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) throw new Error('follow_up_on must be YYYY-MM-DD')
  return value
}

function optionalRank(value, fallback) {
  if (value == null) return fallback
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('rank must be a non-negative integer')
  return value
}

export function isPlannerTask(node) {
  return Boolean(
    node?.parent_id &&
    workContext(node) === 'personal' &&
    node.status === 'in_progress' &&
    node.planner &&
    typeof node.planner === 'object' &&
    PLANNER_LANES.includes(node.planner.lane),
  )
}

export function isPlannerCandidate(node, nodes) {
  const parentIds = new Set(nodes.map(item => item.parent_id).filter(Boolean))
  return Boolean(
    node?.parent_id &&
    !parentIds.has(node.id) &&
    workContext(node) === 'personal' &&
    node.status === 'in_progress' &&
    !node.calendar_id,
  )
}

export function plannerLaneFor(node) {
  return isPlannerTask(node) && PLANNER_LANES.includes(node.planner.lane)
    ? node.planner.lane
    : null
}

export function normalizePlanner(input = {}, { fallbackRank = PLANNER_RANK_STEP } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('planner must be an object')
  const lane = input.lane == null ? 'next' : allowedValue(input.lane, PLANNER_LANES, 'planner lane')
  const urgency = input.urgency == null ? 'unknown' : allowedValue(input.urgency, PLANNER_URGENCY, 'planner urgency')
  return {
    lane,
    rank: optionalRank(input.rank, fallbackRank),
    urgency,
    follow_up_on: optionalDate(input.follow_up_on),
    priority_note: nonEmptyString(input.priority_note, 'priority_note'),
  }
}

export function patchPlanner(current, input = {}, { fallbackRank = PLANNER_RANK_STEP } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('planner must be an object')
  const unexpected = Object.keys(input).filter(key => !['lane', 'rank', 'urgency', 'follow_up_on', 'priority_note'].includes(key))
  if (unexpected.length) throw new Error(`planner fields are not supported: ${unexpected.join(', ')}`)
  return normalizePlanner({ ...current, ...input }, { fallbackRank: current?.rank ?? fallbackRank })
}

export function plannerRoots(nodes) {
  return nodes
    .filter(node => node.parent_id === null && node.id.startsWith('root-') && workContext(node) === 'personal')
    .map(node => ({ id: node.id, title: node.title, color: node.color || '#6B7280' }))
    .sort((left, right) => left.title.localeCompare(right.title, 'ru'))
}

export function plannerQueue(nodes) {
  const byId = new Map(nodes.map(node => [node.id, node]))
  return nodes
    .filter(node => isPlannerCandidate(node, nodes) && isPlannerTask(node))
    .map(node => {
      let current = node
      let root = null
      while (current?.parent_id) {
        current = byId.get(current.parent_id)
        if (!current) break
        if (!current.parent_id) root = current
      }
      return {
        ...node,
        planner_lane: plannerLaneFor(node),
        planner_rank: node.planner.rank,
        is_blocked: isBlocked(node, byId),
        root_id: root?.id || null,
        root_title: root?.title || null,
        root_color: root?.color || '#6B7280',
      }
    })
    .sort((left, right) => {
      const laneDifference = LANE_INDEX.get(left.planner_lane) - LANE_INDEX.get(right.planner_lane)
      if (laneDifference) return laneDifference
      const rankDifference = (left.planner_rank ?? Number.MAX_SAFE_INTEGER) - (right.planner_rank ?? Number.MAX_SAFE_INTEGER)
      if (rankDifference) return rankDifference
      return left.title.localeCompare(right.title, 'ru') || left.id.localeCompare(right.id)
    })
}

export function nextPlannerRank(nodes, lane) {
  const ranks = nodes
    .filter(node => isPlannerCandidate(node, nodes) && isPlannerTask(node) && node.planner.lane === lane)
    .map(node => node.planner.rank)
  return ranks.length ? Math.max(...ranks) + PLANNER_RANK_STEP : PLANNER_RANK_STEP
}

export function plannerTaskFromCommit(input, { nodes, id, today }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('task is required')
  const title = nonEmptyString(input.title, 'title', { required: true })
  const parentId = nonEmptyString(input.parent_id, 'parent_id', { required: true })
  const parent = nodes.find(node => node.id === parentId)
  if (!parent || parent.parent_id !== null || !parent.id.startsWith('root-') || workContext(parent) !== 'personal') {
    throw new Error('parent_id must be an existing personal root')
  }
  const requestedPlanner = input.planner || {}
  const lane = requestedPlanner.lane || 'next'
  const planner = normalizePlanner(requestedPlanner, { fallbackRank: nextPlannerRank(nodes, lane) })
  return {
    id,
    title,
    outcome: nonEmptyString(input.outcome, 'outcome', { limit: 1_000 }),
    parent_id: parent.id,
    calendar_id: null,
    watched: false,
    color: null,
    status: 'in_progress',
    due: null,
    notes: nonEmptyString(input.notes, 'notes', { limit: 2_000 }),
    recurrence: null,
    planner,
    created: today,
    updated: today,
  }
}

// One-time compatibility migration for previous planner lane names. Active
// personal work is explicitly marked `in_progress`; reads stay read-only and
// the caller decides when to persist the result.
export function migratePlannerState(nodes) {
  let changed = false
  const migrated = nodes.map(node => {
    if (!node.planner) return node
    const isPersonalLeaf = node.parent_id && workContext(node) === 'personal' && !node.calendar_id
    const canRestoreActiveWork = isPersonalLeaf && !['waiting_for_review', 'done', 'dropped', 'someday'].includes(node.status)
    if (node.planner.lane === 'now' && canRestoreActiveWork) {
      changed = true
      return { ...node, status: 'in_progress', planner: { ...node.planner, lane: 'focus' } }
    }
    if (!isPlannerCandidate(node, nodes)) {
      changed = true
      return { ...node, planner: null }
    }
    if (!PLANNER_LANES.includes(node.planner.lane)) {
      changed = true
      return { ...node, planner: null }
    }
    return node
  })
  return { nodes: migrated, changed }
}

export function reorderPlannerTasks(nodes, { lane, ordered_ids: orderedIds } = {}) {
  if (!PLANNER_LANES.includes(lane)) throw new Error('unknown planner lane')
  if (!Array.isArray(orderedIds) || !orderedIds.length || orderedIds.some(id => typeof id !== 'string')) {
    throw new Error('ordered_ids must be a non-empty list of task ids')
  }
  if (new Set(orderedIds).size !== orderedIds.length) throw new Error('ordered_ids must not repeat a task')
  const currentIds = plannerQueue(nodes)
    .filter(node => node.planner_lane === lane)
    .map(node => node.id)
  if (currentIds.length !== orderedIds.length || currentIds.some(id => !orderedIds.includes(id))) {
    throw new Error('ordered_ids must contain every task in the selected lane')
  }
  const rankById = new Map(orderedIds.map((id, index) => [id, PLANNER_RANK_STEP * (index + 1)]))
  return nodes.map(node => rankById.has(node.id)
    ? { ...node, planner: { ...node.planner, lane, rank: rankById.get(node.id) } }
    : node)
}
