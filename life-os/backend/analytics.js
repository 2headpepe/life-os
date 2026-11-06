import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
export const ANALYTICS_EVENT_TYPES = new Set(['screen_view', 'screen_exit', 'screen_rendered', 'api_write_succeeded', 'api_write_failed', 'ui_action'])
const SAFE_KEYS = new Set(['route', 'feature', 'action', 'operation', 'outcome', 'reason', 'dwell_ms', 'had_mutation', 'screen_state', 'count', 'traffic_class', 'outcome_category', 'attempted_outcome_category'])
const FORBIDDEN_KEYS = /(text|body|note|query|message|prompt|content|title|description|value)/i
const SAFE_VALUE = /^[a-z0-9_:/.-]{1,120}$/i
const TRAFFIC_CLASSES = new Set(['ordinary_use', 'observational_audit', 'automated_test', 'unknown'])
const OUTCOME_CATEGORIES = new Set(['task_progress', 'habit_progress', 'goal_progress', 'capture_saved', 'feed_action', 'review_decision'])
function dayOf(timestamp) { return new Date(timestamp).toISOString().slice(0, 10) }
function safeProperty(key, value) {
  if (!SAFE_KEYS.has(key) || FORBIDDEN_KEYS.test(key)) return undefined
  if (key === 'traffic_class') return typeof value === 'string' && TRAFFIC_CLASSES.has(value) ? value : undefined
  if (key === 'outcome_category' || key === 'attempted_outcome_category') return typeof value === 'string' && OUTCOME_CATEGORIES.has(value) ? value : undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86_400_000) return Math.round(value)
  if (typeof value === 'string' && SAFE_VALUE.test(value)) return value
  return undefined
}
export function sanitizeAnalyticsEvent(input, receivedAt = new Date().toISOString()) {
  if (!input || typeof input !== 'object' || !ANALYTICS_EVENT_TYPES.has(input.type)) return null
  const occurredAt = typeof input.occurred_at === 'string' && !Number.isNaN(Date.parse(input.occurred_at)) ? new Date(input.occurred_at).toISOString() : receivedAt
  const properties = {}
  for (const [key, value] of Object.entries(input.properties || {})) { const safe = safeProperty(key, value); if (safe !== undefined) properties[key] = safe }
  return { id: typeof input.id === 'string' && /^[a-z0-9_-]{8,80}$/i.test(input.id) ? input.id : `analytics-${crypto.randomUUID()}`, schema_version: 2, type: input.type, occurred_at: occurredAt, received_at: receivedAt, session_id: typeof input.session_id === 'string' && /^[a-z0-9_-]{8,80}$/i.test(input.session_id) ? input.session_id : 'unknown', properties }
}
export function analyticsFileFor(rootDir, timestamp) { return path.join(rootDir, 'events', `${dayOf(timestamp)}.jsonl`) }
export async function appendAnalyticsEvents({ rootDir, events, receivedAt = new Date().toISOString() }) {
  if (!Array.isArray(events) || events.length === 0 || events.length > 50) throw new Error('expected 1 to 50 analytics events')
  const accepted = events.map(event => sanitizeAnalyticsEvent(event, receivedAt)).filter(Boolean)
  if (accepted.length === 0) throw new Error('no valid analytics events')
  const grouped = Map.groupBy(accepted, event => analyticsFileFor(rootDir, event.occurred_at))
  await Promise.all([...grouped].map(async ([file, rows]) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.appendFile(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf-8') }))
  return { accepted: accepted.length, rejected: events.length - accepted.length }
}
