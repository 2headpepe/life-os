import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { readAiReviewObservability } from '../ai-review-observability.js'
import { buildUsageAnalysis, validateSignalRegistry } from '../ai-usage-analysis.js'

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-observability-'))
  const directories = [
    'life-os',
    'ops/product-intelligence/design-reviews',
    'ops/life-os-analytics/aggregates',
    'ops/life-os-analytics/events',
  ]
  await Promise.all(directories.map(directory => fs.mkdir(path.join(root, directory), { recursive: true })))
  await fs.writeFile(path.join(root, 'life-os/design-surface-manifest.json'), JSON.stringify({
    revision: 4,
    updated_at: '2026-11-20',
    freshness: { state: 'current_at_creation' },
    surfaces: [{ id: 'feed', status: 'active', route: '/', purpose: 'Daily orientation.' }],
    reviewable_blocks: [{ id: 'feed.focus', parent_id: 'feed', purpose: 'Focus state.' }],
    journeys: [],
  }))
  await fs.writeFile(path.join(root, 'ops/product-intelligence/design-reviews/coverage-registry.json'), JSON.stringify({
    manifest_revision: 1,
    generated_at: '2026-10-30T00:00:00.000Z',
    zones: [{ id: 'feed', axes: {
      design_review: { state: 'covered', freshness: 'current_at_creation' },
      analytics: { state: 'partial', freshness: 'unknown' },
      tests: { state: 'needs_verification', freshness: 'unknown' },
      delivery: { state: 'not_reviewed', freshness: 'unknown' },
    } }],
  }))
  await fs.writeFile(path.join(root, 'ops/life-os-analytics/signal-registry.json'), JSON.stringify({
    schema_version: 1, id: 'life-os-analytics-signal-registry', manifest_ref: 'life-os/design-surface-manifest.json', manifest_revision: 4,
    functions: [{ id: 'screen_view', label: 'Открытие экрана', surface_ids: ['*'], signature: { type: 'screen_view' } }], flows: [],
  }))
  const aggregate = {
    id: 'life-os-analytics:2026-11-18:2026-11-18',
    window: { from: '2026-11-18', to: '2026-11-18' },
    generated_at: '2026-11-19T00:00:00.000Z',
    aggregation_rule_version: 2,
    source_event_count: 2,
    source_coverage: {
      expected_source_refs: ['ops/life-os-analytics/events/2026-11-18.jsonl'],
      available_source_refs: ['ops/life-os-analytics/events/2026-11-18.jsonl'],
      missing_source_refs: [],
    },
    traffic: { ordinary_use: { events: 2, views: 2 }, observational_audit: {}, automated_test: {}, unknown: {} },
    outcomes: { task_progress: { ordinary_use: { succeeded: 1 } } },
    evidence_gaps: [],
  }
  await fs.writeFile(path.join(root, 'ops/life-os-analytics/aggregates/2026-11-18.json'), JSON.stringify(aggregate))
  const event = {
    id: 'event-secret', session_id: 'session-secret', occurred_at: '2026-11-18T09:30:00.000Z', type: 'screen_view',
    properties: { route: '/ai-reviews/private-id', traffic_class: 'ordinary_use', outcome_category: 'task_progress', text: 'private message' },
  }
  await fs.writeFile(path.join(root, 'ops/life-os-analytics/events/2026-11-18.jsonl'), `${JSON.stringify(event)}\n${JSON.stringify({ ...event, id: 'event-secret-2', occurred_at: '2026-11-18T10:30:00.000Z' })}\n`)
  return root
}

test('coverage never upgrades an outdated registry to current confirmed coverage', async () => {
  const model = await readAiReviewObservability(await fixture())
  assert.equal(model.coverage.state, 'needs_verification')
  assert.equal(model.coverage.registry.matches_manifest, false)
  assert.equal(model.coverage.axes.design_review.confirmed, 0)
  assert.equal(model.coverage.zones.find(zone => zone.id === 'feed.focus').axes.design_review.state, 'needs_verification')
})

test('repeated events collapse into a safe grouped signal without identifiers or raw payloads', async () => {
  const model = await readAiReviewObservability(await fixture(), 'life-os-analytics:2026-11-18:2026-11-18')
  const [event] = model.analytics.events.groups
  assert.deepEqual(event, {
    type: 'screen_view',
    route: '/ai-reviews',
    traffic_class: 'ordinary_use',
    outcome_category: 'task_progress',
    outcome_state: 'succeeded',
    count: 2,
    first_observed_at: '2026-11-18T09:30:00.000Z',
    last_observed_at: '2026-11-18T10:30:00.000Z',
  })
  assert.equal(model.usage.by_traffic.ordinary_use.surfaces.length, 1)
  assert.doesNotMatch(JSON.stringify(model), /event-secret|session-secret|private message|private-id|ops\/life-os-analytics\/events/)
})

test('registry rejects a function bound to an unknown manifest identity', () => {
  assert.throws(() => validateSignalRegistry({
    schema_version: 1, id: 'life-os-analytics-signal-registry', manifest_ref: 'life-os/design-surface-manifest.json', manifest_revision: 4,
    functions: [{ id: 'invalid', label: 'Invalid', surface_ids: ['missing'], signature: { type: 'screen_view' }], flows: [],
  }, { surfaces: [{ id: 'feed', status: 'active', route: '/' }], journeys: [] }), /invalid function surface identity/)
})

test('usage analysis distinguishes no observation, missing source, and direct write failure', () => {
  const manifest = { revision: 4, surfaces: [{ id: 'feed', status: 'active', route: '/', outcome_refs: [] }], journeys: [] }
  const registry = { functions: [{ id: 'save', label: 'Сохранение', surface_ids: ['*'], signature: { type: 'api_write_succeeded', feature: 'api' } }], flows: [] }
  const fullEmpty = buildUsageAnalysis({ manifest, registryState: 'available', registry, aggregate: { state: 'available' }, eventGroups: [] })
  assert.equal(fullEmpty.surfaces[0].health, 'not_observed')
  const missingSource = buildUsageAnalysis({ manifest, registryState: 'available', registry, aggregate: { state: 'partial' }, eventGroups: [] })
  assert.equal(missingSource.surfaces[0].health, 'source_missing')
  const failure = buildUsageAnalysis({ manifest, registryState: 'available', registry, aggregate: { state: 'available' }, eventGroups: [{ type: 'api_write_failed', route: '/', feature: 'api', traffic_class: 'ordinary_use', count: 1 }] })
  assert.equal(failure.surfaces[0].health, 'error_observed')
})
