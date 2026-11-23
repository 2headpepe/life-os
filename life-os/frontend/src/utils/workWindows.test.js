import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectNextSteps } from './activeWork.js'
import { calendarCapacity, deadlineGuidance, workChoices } from './workWindows.js'

const day = '2026-11-20'
const at = (time, date = day) => new Date(date + 'T' + time + ':00')
const task = (id, fields = {}) => ({ id, title: id, parent_id: 'root', ...fields })
const event = (id, time, duration, date = day) => ({ id, title: id, date, time, duration_min: duration, type: 'meeting' })
const capacity = (events = [], time = '18:35', complete = true, nodes = []) => calendarCapacity(nodes, events, at(time), complete)
const byId = (items, id) => items.find(item => item.task.id === id)
const deadline = (remaining, overrides = {}) => task('report', { due: day, time: '20:00', date_kind: 'deadline', remaining_min: remaining, ...overrides })

test('25 min to call: show the short step and the hour-long alternative without promising both fit', () => {
  const schedule = capacity([event('call', '19:00', 30)])
  const report = task('report', { estimate_min: 60, first_step: { title: 'Проверить цифры', estimate_min: 15 } })
  const choices = workChoices([report, task('x')], [], schedule)
  assert.equal(schedule.freeMinutes, 25)
  assert.equal(choices.quick[0].title, 'Проверить цифры')
  assert.equal(choices.quick[0].fits, true)
  assert.equal(choices.longer[0].fits, false)
  assert.equal(choices.unknown[0].fits, undefined)
})

test('at most 20 minutes is quick; an explicit note and a unique previous occurrence show their sources', () => {
  const current = task('current', { recurrence: 'weekly', title: 'Разбор', due: day })
  const previous = task('old', { ...current, id: 'old', due: '2026-11-13', status: 'done', estimate_min: 22 })
  const tasks = [current, task('note', { notes: 'Вечером\nОценка: 20 минут' }), task('vague', { notes: 'Позвонить через 15 минут' }),
    task('hour', { notes: 'Длительность: 1 час' }), task('explicit', { estimate_min: 40, remaining_min: 5 })]
  const result = workChoices(tasks, [previous], capacity())
  assert.equal(byId(result.longer, 'current').source, 'оценка прошлого повторения')
  assert.equal(byId(result.longer, 'hour').minutes, 60)
  assert.equal(byId(result.quick, 'note').source, 'оценка из заметки')
  assert.equal(byId(result.quick, 'explicit').minutes, 5)
  assert.equal(byId(result.unknown, 'vague').minutes, null)
  assert.equal(workChoices([current], [previous, { ...previous, id: 'duplicate' }], capacity()).unknown.length, 1)
})

test('qualitative labels never acquire a duration or a fit promise', () => {
  const groups = workChoices([task('Подтвердить встречу'), task('Изучить материалы'), task('Ответить')], [], capacity())
  for (const key of ['quick', 'longer']) {
    assert.equal(groups[key][0].qualitative, true)
    assert.equal(groups[key][0].minutes, null)
    assert.equal(groups[key][0].fits, undefined)
  }
  assert.equal(groups.unknown[0].title, 'Ответить')
})

test('active and overlapping appointments bound occupancy independently of recovery filters', () => {
  const events = [event('one', '18:00', 60), event('two', '18:30', 90), event('other', '22:00', 15)]
  assert.equal(capacity(events).active.end, +at('20:00'))
  assert.equal(capacity(events).freeMinutes, 0)
  assert.equal(capacity([...events, event('unknown', '19:55', null)]).active.end, null)
  assert.equal(capacity([], '18:35', true, [task('appointment', { date_kind: 'scheduled', due: day, time: '19:00', core: false })]).freeMinutes, 25)
  assert.equal(capacity([], '18:35', true, [deadline(10)]).freeMinutes, null)
})

test('backward calculation uses several bounded windows and respects time of deadline', () => {
  const report = deadline(45)
  const schedule = capacity([event('call', '19:00', 30)])
  const row = deadlineGuidance([report], schedule)[0]
  assert.equal(row.missing, 0)
  assert.equal(row.segments, 2)
  assert.deepEqual(row.slot, { start: +at('18:45'), minutes: 15 })
  const earliest = deadlineGuidance([deadline(60)], schedule)[0]
  assert.equal(earliest.missing, 5)
  assert.deepEqual(earliest.slot, { start: +at('18:35'), minutes: 25 })
})

test('assigned blocks are counted once and collisions never count as work already allocated', () => {
  const report = deadline(30)
  const block = { ...event('saved', '19:30', 30), type: 'work_block', task_id: report.id }
  const other = event('collision', '19:30', 5)
  let row = deadlineGuidance([report], capacity([block, { ...block, id: 'duplicate' }]))[0]
  assert.equal(row.reserved, 30)
  assert.equal(row.slot, undefined)
  row = deadlineGuidance([report], capacity([block, other]))[0]
  assert.equal(row.reserved, 25)
  assert.deepEqual(row.slot, { start: +at('19:25'), minutes: 5 })
})

test('a Monday deadline can use a known Friday gap but never synthesizes a weekend of availability', () => {
  const report = deadline(10, { due: '2026-11-23', time: null })
  const row = deadlineGuidance([report], capacity([event('call', '19:00', 20)]))[0]
  assert.deepEqual(row.slot, { start: +at('18:50'), minutes: 10 })
  assert.equal(deadlineGuidance([report], capacity())[0].slot, undefined)
})

test('missing calendar, estimates, work readiness or known free time leave only deadline facts', () => {
  const report = deadline(30)
  assert.equal(deadlineGuidance([report], capacity([], '18:35', false))[0].slot, undefined)
  assert.equal(deadlineGuidance([deadline(null)], capacity())[0].slot, undefined)
  assert.equal(deadlineGuidance([report], capacity(), new Map([['report', 'Зависимость']]))[0].slot, undefined)
  assert.equal(deadlineGuidance([report], capacity([event('meeting', '17:00', null)]))[0].slot, undefined)
  assert.equal(capacity([event('undated-time', null, null)]).uncertain, true)
})

test('recovery keeps a saved interval linked to a core task visible', () => {
  const core = task('core', { core: true })
  const nodes = [core, { id: 'root', parent_id: null }]
  const work = { ...event('saved', '19:00', 20), type: 'work_block', task_id: core.id }
  const selection = selectNextSteps({ nodes, queue: [], events: [work], recovery: true, now: at('18:35') })
  assert.equal(selection.obligation.item.id, 'saved')
})

test('unknown capacity is distinct from a known zero-capacity horizon', () => {
  const report = deadline(30, { due: '2026-11-23', time: null })
  assert.equal(deadlineGuidance([report], capacity())[0].missing, null)
  assert.equal(deadlineGuidance([deadline(30)], capacity([event('undated', null, null)]))[0].missing, null)
  const full = deadlineGuidance([deadline(30)], capacity([event('meeting', '18:35', 85)]))[0]
  assert.equal(full.missing, 30)
  assert.equal(full.knownHorizon, true)
  assert.equal(full.slot, undefined)
})
