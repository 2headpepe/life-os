import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plannerMeta } from './plannerSignals.js'

test('priority labels work across personal statuses and do not expose legacy follow-up dates', () => {
  const base = { status: 'in_progress', planner: { lane: 'focus', follow_up_on: '2026-11-19' } }
  assert.equal(plannerMeta(base).followUpOn, null)
  assert.equal(plannerMeta({ ...base, planner: { ...base.planner, lane: 'next' } }).followUpOn, null)
  assert.equal(plannerMeta({ ...base, planner: { ...base.planner, lane: 'waiting' } }).followUpOn, null)
  assert.equal(plannerMeta({ ...base, status: 'scheduled' }).label, 'Сегодня')
  assert.equal(plannerMeta({ ...base, status: 'someday' }).label, 'Сегодня')
})
