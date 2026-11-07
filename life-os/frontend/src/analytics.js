const ENDPOINT = '/api/analytics/events'
const MIN_MEANINGFUL_DWELL_MS = 15_000
const state = { sessionId: null, currentView: null, queue: [], flushTimer: null }
const TRAFFIC_CLASSES = new Set(['ordinary_use', 'observational_audit', 'automated_test', 'unknown'])
const OUTCOME_CATEGORIES = new Set(['task_progress', 'habit_progress', 'goal_progress', 'capture_saved', 'feed_action', 'review_decision'])

function randomId(prefix) { return `${prefix}-${crypto.randomUUID().replaceAll('-', '')}` }

export function analyticsSessionId() {
  if (state.sessionId) return state.sessionId
  try {
    state.sessionId = sessionStorage.getItem('life-os:analytics:session')
    if (!state.sessionId) { state.sessionId = randomId('session'); sessionStorage.setItem('life-os:analytics:session', state.sessionId) }
  } catch { state.sessionId = 'unknown' }
  return state.sessionId
}

export function analyticsTrafficClass() {
  const declared = globalThis.__LIFE_OS_ANALYTICS_TRAFFIC_CLASS__
  return TRAFFIC_CLASSES.has(declared) ? declared : 'ordinary_use'
}

export function operationName(path) {
  return String(path || '').split('?')[0].split('/').filter(Boolean)
    .map(segment => /[-\d]/.test(segment) && segment.length >= 8 ? ':id' : segment).join('/')
}

export function track(type, properties = {}) {
  state.queue.push({ id: randomId('event'), type, occurred_at: new Date().toISOString(), session_id: analyticsSessionId(), properties: { ...properties, traffic_class: analyticsTrafficClass() } })
  if (state.queue.length >= 10) flush()
  else if (!state.flushTimer) state.flushTimer = window.setTimeout(flush, 1200)
}

export function flush() {
  if (state.flushTimer) { window.clearTimeout(state.flushTimer); state.flushTimer = null }
  const events = state.queue.splice(0)
  if (!events.length || typeof fetch !== 'function') return
  const body = JSON.stringify({ events })
  if (navigator.sendBeacon && typeof Blob !== 'undefined') { navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' })); return }
  fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
}

function closeCurrentView() {
  const view = state.currentView
  if (!view) return
  const dwell = Date.now() - view.startedAt
  track('screen_exit', { route: view.route, dwell_ms: dwell, had_mutation: view.hadMutation })
  if (dwell < MIN_MEANINGFUL_DWELL_MS && !view.hadMutation) track('ui_action', { route: view.route, feature: 'screen', action: 'short_visit', outcome: 'no_action' })
  state.currentView = null
}

export function trackScreen(route) {
  closeCurrentView()
  state.currentView = { route, startedAt: Date.now(), hadMutation: false }
  track('screen_view', { route })
  window.setTimeout(() => track('screen_rendered', { route }), 0)
}

export function trackMutation(method, path, outcome, outcomeCategory = null) {
  if (state.currentView) state.currentView.hadMutation ||= outcome === 'success'
  const categoryKey = outcome === 'success' ? 'outcome_category' : 'attempted_outcome_category'
  track(outcome === 'success' ? 'api_write_succeeded' : 'api_write_failed', {
    route: state.currentView?.route || 'unknown', feature: 'api', action: method.toLowerCase(), operation: operationName(path), outcome,
    ...(OUTCOME_CATEGORIES.has(outcomeCategory) ? { [categoryKey]: outcomeCategory } : {}),
  })
}

export function trackUiAction(feature, action, outcome = 'success', outcomeCategory = null) {
  const categoryKey = outcome === 'success' ? 'outcome_category' : 'attempted_outcome_category'
  track('ui_action', { route: state.currentView?.route || 'unknown', feature, action, outcome, ...(OUTCOME_CATEGORIES.has(outcomeCategory) ? { [categoryKey]: outcomeCategory } : {}) })
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { closeCurrentView(); flush() })
