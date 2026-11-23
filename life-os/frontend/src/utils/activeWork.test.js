import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localDay, overdueTasks, selectNextSteps } from './activeWork.js'

const root = { id: 'root', title: 'Личное', parent_id: null }
const leaf = (id, fields = {}) => ({ id, title: id, parent_id: root.id, ...fields })
const friday = '2026-11-20'
const monday = '2026-11-23'
const now = new Date(2026, 10, 20, 18, 35)
const run = (leaves, options = {}) => selectNextSteps({ nodes: [root, ...leaves], queue: leaves, now, ...options })
const queued = (id, lane, rank, fields) => leaf(id, { status: 'in_progress', planner: { lane, rank }, ...fields })

test('tomorrow’s scheduled review stays in the calendar, a deadline can be started early', () => {
  const review = leaf('review', { date_kind: 'scheduled', due: '2026-11-21', status: 'scheduled' })
  const report = leaf('report', { date_kind: 'deadline', due: monday, status: 'scheduled' })
  const result = run([review, report, leaf('work')])
  assert.deepEqual(result.steps.map(task => task.id), ['report', 'work'])
  assert.equal(result.obligation.item.id, 'review')
})

test('availability overrides Next rank until local midnight without changing the queue', () => {
  const first = queued('first', 'next', 1, { available_from: monday })
  const second = queued('second', 'next', 2)
  const result = run([first, second])
  assert.equal(result.task.id, 'second')
  assert.equal(result.held.id, 'first')
  assert.match(result.waitingReasons.get('first'), /2026-11-23/)
  assert.equal(run([first, second], { now: new Date(2026, 10, 23) }).task.id, 'first')
  assert.equal(first.planner.rank, 1)
})

test('manual priority does not require a task to be in progress', () => {
  const today = leaf('today', { status: 'scheduled', date_kind: 'deadline', due: monday, planner: { lane: 'focus', rank: 1 } })
  const working = queued('working', 'next', 1)
  const result = run([working, today])
  assert.equal(result.task.id, 'today')
  assert.equal(result.kind, 'now')
  assert.equal(today.status, 'scheduled')
})

test('a prioritized someday task can surface without changing its status', () => {
  const postponed = leaf('postponed', { status: 'someday', planner: { lane: 'focus', rank: 1 } })
  const result = run([postponed, leaf('ordinary')])
  assert.equal(result.task.id, 'postponed')
  assert.equal(postponed.status, 'someday')
})

test('a timed calendar event coexists with focus and refreshes at start and end', () => {
  const focus = queued('focus', 'focus', 1)
  const events = [{ id: 'call', title: 'созвон', date: friday, time: '19:00', duration_min: 30 }]
  const before = run([focus], { events })
  assert.equal(before.nextChangeAt, new Date(2026, 10, 20, 19).getTime())
  assert.equal(before.obligation.current, false)
  for (const minute of [0, 15]) {
    const during = run([focus], { events, now: new Date(2026, 10, 20, 19, minute) })
    assert.equal(during.task.id, focus.id)
    assert.equal(during.obligation.current, true)
    assert.equal(during.obligation.source, 'event')
    assert.equal(during.nextChangeAt, new Date(2026, 10, 20, 19, 30).getTime())
  }
  assert.equal(run([focus], { events, now: new Date(2026, 10, 20, 19, 30) }).obligation, undefined)
})

test('distant commitments, ambiguous legacy dates and invalid times never create early availability', () => {
  const result = run([leaf('future', { due: '2026-12-20', status: 'scheduled' })])
  assert.equal(result.task, undefined)
  assert.equal(result.obligation.kind, 'dated')
  assert.equal(result.obligation.date, '2026-12-20')
  assert.equal(localDay(new Date(result.nextChangeAt)), '2026-11-21')
  for (const due of [friday, '2026-11-21']) assert.equal(run([leaf('broken', { due, time: 'bad' })]).task, undefined)
})

test('a lower priority does not bypass an unfinished dependency', () => {
  const waiting = queued('wait', 'waiting', 1, { planner: { lane: 'waiting', rank: 1, follow_up_on: '2026-11-18' }, blocked_by: ['dependency'] })
  const result = run([waiting, leaf('dependency')])
  assert.equal(result.task.id, 'dependency')
  assert.equal(result.waitingReasons.get('wait'), 'Ожидает завершения зависимости')
  assert.deepEqual(waiting.blocked_by, ['dependency'])
})

test('recovery filters, open blockers and review status preserve eligibility and overdue review', () => {
  const leaves = [
    leaf('parent', { core: true }), leaf('child', { parent_id: 'parent', core: true }),
    leaf('blocked', { core: true, blocked_by: ['absent'] }), leaf('optional'),
    leaf('closed', { core: true, status: 'done' }),
    leaf('review', { core: true, status: 'waiting_for_review', due: '2026-11-19' }),
  ]
  const result = run(leaves, { recovery: true })
  assert.deepEqual(result.steps.map(task => task.id), ['child'])
  assert.deepEqual(overdueTasks(result.tasks, friday).map(task => task.id), ['review'])
  assert.equal(result.hidden, 1)
})

test('delivery ancestors, orphaned and cyclic paths do not leak into personal actions or schedule', () => {
  const result = run([
    leaf('system', { work_context: 'system_improvement' }), leaf('system-child', { parent_id: 'system' }),
    leaf('delivery', { work_context: 'delivery' }), leaf('legacy', { parent_id: 'delivery', due: friday }),
    leaf('a', { parent_id: 'b' }), leaf('b', { parent_id: 'a' }), leaf('cycle-child', { parent_id: 'a' }),
    leaf('orphan', { parent_id: 'missing' }),
  ])
  assert.equal(result.task, undefined)
  assert.equal(result.obligation, undefined)
})

test('hidden calendar-layer nodes stay hidden and visible calendar items stay out of the backlog', () => {
  const visible = leaf('visible', { due: monday, calendar_id: 'personal' })
  const hidden = leaf('hidden', { due: friday, calendar_id: 'layer' })
  const result = run([visible, hidden], { calendarVisible: node => node.calendar_id === 'personal' })
  assert.equal(result.task, undefined)
  assert.equal(result.obligation.item.id, visible.id)
  assert.equal(result.obligation.source, 'node')
})

test('a visible calendar task with Today priority is both the main task and an obligation', () => {
  const prioritized = leaf('prioritized', {
    due: friday, date_kind: 'scheduled', calendar_id: 'personal', status: 'scheduled',
    planner: { lane: 'focus', rank: 1 },
  })
  const ordinary = leaf('ordinary')
  const visible = run([prioritized, ordinary], { calendarVisible: () => true })
  assert.equal(visible.task.id, prioritized.id)
  assert.equal(visible.obligation.item.id, prioritized.id)
  assert.deepEqual(visible.steps.map(task => task.id), [prioritized.id, ordinary.id])
  const hidden = run([prioritized, ordinary], { calendarVisible: () => false })
  assert.equal(hidden.task.id, ordinary.id)
  assert.equal(hidden.obligation, undefined)
})

test('timed tasks become actionable at their local appointment and open dependencies remain binding', () => {
  const call = leaf('call', { due: friday, time: '19:00', date_kind: 'scheduled' })
  assert.equal(run([call]).task, undefined)
  assert.equal(run([call], { now: new Date(2026, 10, 20, 19) }).task.id, 'call')
  const task = queued('blocked', 'focus', 1, { blocked_by: ['req'] })
  const req = leaf('req')
  assert.equal(run([task, req]).task.id, 'req')
  assert.equal(run([task, { ...req, status: 'done' }]).task.id, 'blocked')
})
