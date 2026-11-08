import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPriorityCandidates, priorityPacket } from '../priority-loop.js'

const registry = { zones: [
  { id: 'stable', kind: 'route', axes: { design_review: { state: 'current', source_refs: ['safe'] } } },
  { id: 'partial', kind: 'route', axes: { design_review: { state: 'partial', source_refs: ['record'] } } },
  { id: 'journey', kind: 'journey', axes: { tests: { state: 'not_reviewed', source_refs: [] } } },
] }

test('ranks declared evidence gaps deterministically without assigning task priority', () => {
  const candidates = buildPriorityCandidates(registry)
  assert.deepEqual(candidates.map(item => item.zone_id), ['journey', 'partial'])
  assert.equal(candidates[0].score, 65)
  assert.equal(candidates.length, 2)
})

test('returns only a draft reminder and an explicit no-write boundary', () => {
  const packet = priorityPacket(registry)
  assert.equal(packet.state, 'awaiting_user_decision')
  assert.equal(packet.reminder.state, 'draft')
  assert.match(packet.limits.join(' '), /not task priority/)
})

test('changes the candidate set identity when its evidence changes', () => {
  const first = priorityPacket(registry).candidate_set_checksum
  const changed = structuredClone(registry)
  changed.zones[1].axes.design_review.source_refs = ['new-record']
  assert.notEqual(priorityPacket(changed).candidate_set_checksum, first)
})
