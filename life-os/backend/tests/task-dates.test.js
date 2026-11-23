import assert from 'node:assert/strict'
import { test } from 'node:test'
import { taskDateError } from '../task-dates.js'

test('explicit schedule and deadline require a real calendar date', () => {
  for (const date_kind of ['scheduled', 'deadline']) {
    assert.equal(taskDateError({ date_kind, due: '2028-02-29' }), null)
    assert.ok(taskDateError({ date_kind, due: '2026-02-29' }))
    assert.ok(taskDateError({ date_kind }))
    assert.equal(taskDateError({ date_kind }, { due: '2026-11-23' }), null)
  }
  assert.ok(taskDateError({ due: '2026-11-23', date_kind: 'guess' }))
})

test('availability can be set and cleared independently of due and planner lane', () => {
  const queued = { status: 'in_progress', planner: { lane: 'next', rank: 1 } }
  assert.equal(taskDateError({ available_from: '2026-11-23' }, queued), null)
  assert.equal(taskDateError({ available_from: null }, queued), null)
  assert.ok(taskDateError({ available_from: '2026-11-31' }, queued))
})

test('editing old records or clearing a date does not require a migration', () => {
  assert.equal(taskDateError({ title: 'Изменено' }, { due: 'old value' }), null)
  assert.equal(taskDateError({ date_kind: null }, { due: '2026-11-23' }), null)
  assert.equal(taskDateError({ due: null }, { date_kind: 'deadline' }), null)
})

test('explicit appointments reject broken time on creation and edit', () => {
  const appointment = { due: '2026-11-23', date_kind: 'scheduled' }
  for (const time of ['bad', '24:00', '19:60', 19]) {
    assert.ok(taskDateError({ ...appointment, time }))
    assert.ok(taskDateError({ time }, appointment))
  }
  assert.equal(taskDateError({ ...appointment, time: '00:00' }), null)
  assert.equal(taskDateError({ time: null }, appointment), null)
})

test('task effort accepts optional estimates and an independently actionable first step', () => {
  assert.equal(taskDateError({ estimate_min: 60, remaining_min: 30, first_step: { title: 'Собрать цифры', estimate_min: 10 } }), null)
  assert.equal(taskDateError({ estimate_min: null, first_step: null }), null)
  assert.equal(taskDateError({ first_step: { title: 'Позвонить' } }), null)
  for (const value of [-1, 0, 1.5, '10', false, Infinity]) {
    assert.ok(taskDateError({ estimate_min: value }))
    assert.ok(taskDateError({ remaining_min: value }))
    assert.ok(taskDateError({ first_step: { title: 'Шаг', estimate_min: value } }))
  }
  assert.ok(taskDateError({ first_step: { title: '  ' } }))
})
