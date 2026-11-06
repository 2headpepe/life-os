import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { appendAnalyticsEvents, sanitizeAnalyticsEvent } from '../analytics.js'

test('analytics keeps only declared non-textual properties', () => {
  const event = sanitizeAnalyticsEvent({ type: 'api_write_succeeded', properties: { route: '/inbox', action: 'post', text: 'private', title: 'private', prompt: 'private', dwell_ms: 12 } })
  assert.deepEqual(event.properties, { route: '/inbox', action: 'post', dwell_ms: 12 })
})

test('analytics writes an accepted bounded event batch by date', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-analytics-'))
  const result = await appendAnalyticsEvents({ rootDir, receivedAt: '2026-11-06T00:00:00.000Z', events: [{ type: 'screen_view', occurred_at: '2026-11-05T20:00:00.000Z', properties: { route: '/today' } }] })
  assert.deepEqual(result, { accepted: 1, rejected: 0 })
  assert.equal(JSON.parse(await fs.readFile(path.join(rootDir, 'events', '2026-11-05.jsonl'), 'utf8')).properties.route, '/today')
})
