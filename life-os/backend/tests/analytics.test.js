import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { appendAnalyticsEvents, sanitizeAnalyticsEvent } from '../analytics.js'

test('analytics removes personal text while retaining allowed product facts', () => {
  const event = sanitizeAnalyticsEvent({
    id: 'event-12345678', type: 'api_write_succeeded', session_id: 'session-12345678',
    occurred_at: '2026-10-27T00:00:00.000Z',
    properties: { route: '/inbox', action: 'post', operation: 'inbox', text: 'private thought', title: 'also private', dwell_ms: 1200 },
  }, '2026-10-27T00:00:01.000Z')
  assert.deepEqual(event.properties, { route: '/inbox', action: 'post', operation: 'inbox', dwell_ms: 1200 })
  assert.equal(event.schema_version, 2)
})

test('analytics accepts only declared traffic and outcome enums', () => {
  const event = sanitizeAnalyticsEvent({ type: 'api_write_succeeded', properties: {
    traffic_class: 'automated_test', outcome_category: 'capture_saved', attempted_outcome_category: 'task_progress',
    unknown: 'discard', title: 'private',
  } })
  assert.deepEqual(event.properties, { traffic_class: 'automated_test', outcome_category: 'capture_saved', attempted_outcome_category: 'task_progress' })
  const invalid = sanitizeAnalyticsEvent({ type: 'api_write_succeeded', properties: { traffic_class: 'person_123', outcome_category: 'made_up' } })
  assert.deepEqual(invalid.properties, {})
})

test('analytics accepts a bounded batch and stores rows by event day', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-analytics-'))
  const result = await appendAnalyticsEvents({ rootDir, receivedAt: '2026-10-27T00:00:00.000Z', events: [
    { type: 'screen_view', session_id: 'session-12345678', occurred_at: '2026-10-26T23:59:00.000Z', properties: { route: '/today' } },
    { type: 'unknown', session_id: 'session-12345678', properties: {} },
  ] })
  assert.deepEqual(result, { accepted: 1, rejected: 1 })
  const written = await fs.readFile(path.join(rootDir, 'events', '2026-10-26.jsonl'), 'utf8')
  assert.equal(JSON.parse(written).type, 'screen_view')
})

test('analytics rejects an empty or oversized batch', async () => {
  await assert.rejects(() => appendAnalyticsEvents({ rootDir: os.tmpdir(), events: [] }), /expected 1 to 50/)
})
