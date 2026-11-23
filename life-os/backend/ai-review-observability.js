import fs from 'fs/promises'
import path from 'path'
import { buildUsageAnalysis, readSignalRegistry } from './ai-usage-analysis.js'

const AXES = ['design_review', 'analytics', 'tests', 'delivery']
const AXIS_STATES = new Set(['not_reviewed', 'partial', 'needs_verification', 'covered'])
const TRAFFIC_CLASSES = ['ordinary_use', 'observational_audit', 'automated_test', 'unknown']
const OUTCOME_CATEGORIES = ['task_progress', 'habit_progress', 'goal_progress', 'capture_saved', 'feed_action', 'review_decision']
const EVENT_TYPES = new Set(['screen_view', 'screen_exit', 'screen_rendered', 'api_write_succeeded', 'api_write_failed', 'ui_action'])
const MAX_WINDOWS = 24
const MAX_EVENT_DAYS = 31
const MAX_EVENT_GROUPS = 240
const SAFE_EVENT_VALUE = /^[a-z0-9_:/.-]{1,120}$/i

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return fallback }
}

async function readJsonl(file) {
  try {
    return (await fs.readFile(file, 'utf8')).split('\n').filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line)] } catch { return [] }
    })
  } catch (error) {
    return error.code === 'ENOENT' ? null : []
  }
}

function number(value) { return Number.isFinite(value) && value >= 0 ? value : 0 }
function validDay(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) }
function validWindow(window) { return validDay(window?.from) && validDay(window?.to) && window.from <= window.to }
function safeState(value) { return AXIS_STATES.has(value) ? value : 'needs_verification' }
function safeText(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('/') || value.includes('\\')) return null
  return value.slice(0, 180)
}
function safeTrafficClass(value) { return TRAFFIC_CLASSES.includes(value) ? value : 'unknown' }
function safeOutcome(value) { return OUTCOME_CATEGORIES.includes(value) ? value : null }
function safeEventValue(value) { return typeof value === 'string' && SAFE_EVENT_VALUE.test(value) ? value : null }
function safeRoute(value) {
  const candidate = safeEventValue(value)
  if (!candidate || !candidate.startsWith('/')) return 'unknown'
  const firstSegment = candidate.split('/').filter(Boolean)[0]
  return firstSegment ? `/${firstSegment}` : '/'
}

function declaredZones(manifest) {
  return [
    ...(manifest?.surfaces || []).filter(item => item.status === 'active').map(item => ({ ...item, kind: 'surface' })),
    ...(manifest?.reviewable_blocks || []).map(item => ({ ...item, kind: 'block' })),
    ...(manifest?.journeys || []).map(item => ({ ...item, kind: 'journey' })),
  ]
}

function coverageAxis(value) {
  return {
    state: safeState(value?.state),
    freshness: safeText(value?.freshness) || 'needs_verification',
    reason: safeText(value?.limit),
  }
}

function summarizeAxes(zones, registryMatchesManifest) {
  return Object.fromEntries(AXES.map(axis => {
    const states = Object.fromEntries([...AXIS_STATES].map(state => [state, 0]))
    for (const zone of zones) states[zone.axes[axis].state]++
    return [axis, {
      states,
      registered: zones.length,
      reviewed_in_registry: states.covered + states.partial,
      confirmed: registryMatchesManifest ? states.covered : 0,
    }]
  }))
}

function buildCoverage(manifest, registry) {
  const currentZones = declaredZones(manifest)
  const byId = new Map((registry?.zones || []).filter(zone => typeof zone?.id === 'string').map(zone => [zone.id, zone]))
  const revision = Number.isInteger(manifest?.revision) ? manifest.revision : null
  const registryRevision = Number.isInteger(registry?.manifest_revision) ? registry.manifest_revision : null
  const registryMatchesManifest = revision !== null && registryRevision === revision && currentZones.length === byId.size
  const zones = currentZones.map(zone => {
    const source = byId.get(zone.id)
    const noRegistryZone = !source
    return {
      id: zone.id,
      kind: zone.kind,
      label: zone.route || zone.id,
      purpose: safeText(zone.purpose),
      axes: Object.fromEntries(AXES.map(axis => [axis, noRegistryZone
        ? { state: 'needs_verification', freshness: 'needs_verification', reason: 'Зона отсутствует в снимке реестра.' }
        : coverageAxis(source.axes?.[axis])
      ])),
    }
  })
  const mismatchReason = !registryMatchesManifest
    ? 'Снимок покрытия не совпадает с текущим manifest и требует повторной проверки.'
    : null
  return {
    state: mismatchReason ? 'needs_verification' : 'available',
    reason: mismatchReason,
    manifest: {
      revision,
      updated_at: validDay(manifest?.updated_at) ? manifest.updated_at : null,
      freshness: safeText(manifest?.freshness?.state) || 'needs_verification',
    },
    registry: {
      manifest_revision: registryRevision,
      generated_at: typeof registry?.generated_at === 'string' ? registry.generated_at : null,
      matches_manifest: registryMatchesManifest,
    },
    axes: summarizeAxes(zones, registryMatchesManifest),
    zones,
  }
}

function sourceCoverage(value) {
  const expected = Array.isArray(value?.expected_source_refs) ? value.expected_source_refs.length : 0
  const available = Array.isArray(value?.available_source_refs) ? value.available_source_refs.length : 0
  const missing = Array.isArray(value?.missing_source_refs) ? value.missing_source_refs.length : 0
  return { expected, available, missing }
}

function normalizeTraffic(traffic) {
  return Object.fromEntries(TRAFFIC_CLASSES.map(name => [name, Object.fromEntries([
    'events', 'views', 'exits', 'writes_succeeded', 'writes_failed', 'no_action_exits', 'short_visits', 'outcome_succeeded', 'outcome_failed',
  ].map(key => [key, number(traffic?.[name]?.[key])]))]))
}

function normalizeOutcomes(outcomes) {
  return Object.fromEntries(OUTCOME_CATEGORIES.map(category => [category, Object.fromEntries(TRAFFIC_CLASSES.map(traffic => [traffic, {
    succeeded: number(outcomes?.[category]?.[traffic]?.succeeded),
    failed: number(outcomes?.[category]?.[traffic]?.failed),
  }]))]))
}

function aggregateId(aggregate) {
  return typeof aggregate?.id === 'string' && /^life-os-analytics:\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/.test(aggregate.id)
    ? aggregate.id
    : null
}

function normalizeAggregate(aggregate) {
  if (!aggregateId(aggregate) || !validWindow(aggregate.window)) return null
  const coverage = sourceCoverage(aggregate.source_coverage)
  const output = {
    id: aggregate.id,
    window: { from: aggregate.window.from, to: aggregate.window.to },
    generated_at: typeof aggregate.generated_at === 'string' ? aggregate.generated_at : null,
    aggregation_rule_version: number(aggregate.aggregation_rule_version),
    source_event_count: number(aggregate.source_event_count),
    source_coverage: coverage,
    state: coverage.missing ? 'partial' : coverage.available ? 'available' : 'no_data',
    traffic: normalizeTraffic(aggregate.traffic),
    outcomes: normalizeOutcomes(aggregate.outcomes),
    evidence_gap_count: Array.isArray(aggregate.evidence_gaps) ? aggregate.evidence_gaps.length : 0,
  }
  const availableDays = (aggregate.source_coverage?.available_source_refs || []).flatMap(ref => {
    const match = typeof ref === 'string' && ref.match(/^ops\/life-os-analytics\/events\/(\d{4}-\d{2}-\d{2})\.jsonl$/)
    return match ? [match[1]] : []
  })
  Object.defineProperty(output, '_event_days', { value: availableDays, enumerable: false })
  return output
}

async function availableAggregates(root) {
  const directory = path.join(root, 'ops', 'life-os-analytics', 'aggregates')
  let entries = []
  try { entries = await fs.readdir(directory, { withFileTypes: true }) } catch { return [] }
  const names = entries.filter(entry => entry.isFile() && /^\d{4}-\d{2}-\d{2}(?:_to_\d{4}-\d{2}-\d{2})?\.json$/.test(entry.name)).map(entry => entry.name)
  const aggregates = await Promise.all(names.map(async name => normalizeAggregate(await readJson(path.join(directory, name)))))
  return aggregates.filter(Boolean).sort((left, right) => right.window.to.localeCompare(left.window.to) || right.window.from.localeCompare(left.window.from)).slice(0, MAX_WINDOWS)
}

function sourceDays(aggregate) {
  if (!validWindow(aggregate?.window)) return []
  return Array.isArray(aggregate?._event_days) ? aggregate._event_days : []
}

function safeEvent(row) {
  if (!row || typeof row !== 'object' || !EVENT_TYPES.has(row.type)) return null
  const occurredAt = typeof row.occurred_at === 'string' && Number.isFinite(Date.parse(row.occurred_at)) ? row.occurred_at : null
  if (!occurredAt) return null
  const properties = row.properties && typeof row.properties === 'object' ? row.properties : {}
  const success = safeOutcome(properties.outcome_category)
  const attempted = safeOutcome(properties.attempted_outcome_category)
  const feature = safeEventValue(properties.feature)
  const action = safeEventValue(properties.action)
  const operation = safeEventValue(properties.operation)
  return {
    occurred_at: occurredAt,
    type: row.type,
    route: safeRoute(properties.route),
    ...(feature ? { feature } : {}),
    ...(action ? { action } : {}),
    ...(operation ? { operation } : {}),
    traffic_class: safeTrafficClass(properties.traffic_class),
    outcome_category: success || attempted,
    outcome_state: success ? 'succeeded' : attempted ? 'attempted' : null,
  }
}

function eventGroupKey(event) {
  return [
    event.type, event.route, event.feature || '', event.action || '', event.operation || '',
    event.traffic_class, event.outcome_category || '', event.outcome_state || '',
  ].join('\u0001')
}

function groupEvents(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = eventGroupKey(row)
    const current = groups.get(key)
    if (current) {
      current.count++
      if (row.occurred_at < current.first_observed_at) current.first_observed_at = row.occurred_at
      if (row.occurred_at > current.last_observed_at) current.last_observed_at = row.occurred_at
      continue
    }
    const { occurred_at, ...signal } = row
    groups.set(key, { ...signal, count: 1, first_observed_at: occurred_at, last_observed_at: occurred_at })
  }
  return [...groups.values()]
    .sort((left, right) => right.last_observed_at.localeCompare(left.last_observed_at) || right.count - left.count)
    .slice(0, MAX_EVENT_GROUPS)
}

async function readEvents(root, aggregate) {
  if (!aggregate) return { state: 'no_data', groups: [], total: 0, loaded_days: 0, missing_days: 0 }
  const days = sourceDays(aggregate)
  if (!days.length) return { state: aggregate.state, groups: [], total: 0, loaded_days: 0, missing_days: aggregate.source_coverage.missing }
  if (days.length > MAX_EVENT_DAYS) return { state: 'needs_verification', groups: [], total: 0, loaded_days: 0, missing_days: 0, reason: 'Выбранный период длиннее допустимого окна событий.' }
  const rootDir = path.join(root, 'ops', 'life-os-analytics', 'events')
  const rowsByDay = await Promise.all(days.map(day => readJsonl(path.join(rootDir, `${day}.jsonl`))))
  const missingDays = rowsByDay.filter(rows => rows === null).length
  const allRows = rowsByDay.flatMap(rows => rows || []).map(safeEvent).filter(Boolean)
  const groups = groupEvents(allRows)
  return {
    state: missingDays || aggregate.source_coverage.missing ? 'partial' : allRows.length ? 'available' : 'no_data',
    groups,
    total: allRows.length,
    group_total: groups.length,
    loaded_days: days.length - missingDays,
    missing_days: missingDays + aggregate.source_coverage.missing,
  }
}

export async function readAiReviewObservability(root, requestedWindowId = null) {
  const [manifest, registry, aggregates] = await Promise.all([
    readJson(path.join(root, 'life-os', 'design-surface-manifest.json'), {}),
    readJson(path.join(root, 'ops', 'product-intelligence', 'design-reviews', 'coverage-registry.json'), {}),
    availableAggregates(root),
  ])
  const selected = aggregates.find(aggregate => aggregate.id === requestedWindowId) || aggregates[0] || null
  const [events, signalRegistry] = await Promise.all([
    readEvents(root, selected),
    readSignalRegistry(root, manifest),
  ])
  return {
    coverage: buildCoverage(manifest, registry),
    analytics: {
      available_windows: aggregates.map(({ traffic, outcomes, ...window }) => window),
      selected,
      events,
    },
    usage: buildUsageAnalysis({
      manifest,
      registryState: signalRegistry.state,
      registry: signalRegistry.registry,
      aggregate: selected,
      eventGroups: events.groups,
    }),
  }
}
