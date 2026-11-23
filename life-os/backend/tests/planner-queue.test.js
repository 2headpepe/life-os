import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPlannerCandidate, migratePlannerState, nextPlannerRank, patchPlanner, plannerQueue, plannerRoots, plannerTaskFromCommit, reorderPlannerTasks } from '../planner-queue.js'

const roots = [
  { id: 'root-work', title: 'Работа', parent_id: null, work_context: 'personal', color: '#123456' },
  { id: 'root-delivery', title: 'Delivery', parent_id: null, work_context: 'delivery' },
]

function planner(lane, rank, extra = {}) {
  return { lane, rank, urgency: 'unknown', follow_up_on: null, priority_note: null, ...extra }
}

test('priority queue keeps order independently of personal task status', () => {
  const nodes = [
    ...roots,
    { id: 'container', title: 'Контейнер', parent_id: 'root-work' },
    { id: 'inactive', title: 'Не начато', parent_id: 'root-work' },
    { id: 'now-two', title: 'Второе', parent_id: 'root-work', status: 'in_progress', planner: planner('focus', 2048) },
    { id: 'now-one', title: 'Первое', parent_id: 'root-work', status: 'in_progress', planner: planner('focus', 1024) },
    { id: 'next', title: 'Следующее', parent_id: 'root-work', status: 'in_progress', planner: planner('next', 1024) },
    { id: 'waiting', title: 'Ждём', parent_id: 'root-work', status: 'in_progress', planner: planner('waiting', 1024) },
    { id: 'review', title: 'На проверке', parent_id: 'root-work', status: 'waiting_for_review', planner: planner('now', 0) },
    { id: 'someday', title: 'Потом', parent_id: 'root-work', status: 'someday', planner: planner('next', 2048) },
    { id: 'calendar', title: 'Календарь', parent_id: 'root-work', status: 'scheduled', calendar_id: 'calendar-1', planner: planner('waiting', 2048) },
    { id: 'delivery', title: 'Не личное', parent_id: 'root-delivery', work_context: 'delivery', planner: planner('now', 0) },
  ]

  assert.deepEqual(plannerRoots(nodes), [{ id: 'root-work', title: 'Работа', color: '#123456' }])
  assert.deepEqual(plannerQueue(nodes).map(node => node.id), ['now-one', 'now-two', 'next', 'someday', 'waiting', 'calendar'])
  assert.equal(isPlannerCandidate(nodes.find(node => node.id === 'inactive'), nodes), true)
  assert.equal(isPlannerCandidate(nodes.find(node => node.id === 'now-one'), nodes), true)
  assert.equal(isPlannerCandidate(nodes.find(node => node.id === 'review'), nodes), false)
  assert.equal(nextPlannerRank(nodes, 'focus'), 3072)
})

test('planner commit creates a prioritized personal task without starting work', () => {
  const node = plannerTaskFromCommit({
    title: '  Согласовать смету  ',
    parent_id: 'root-work',
    outcome: 'Есть подтверждённая сумма',
    planner: { lane: 'waiting', urgency: 'urgent', follow_up_on: '2026-11-17', priority_note: 'Ждём ответ клиента' },
  }, { nodes: roots, id: 'node-new', today: '2026-11-16' })

  assert.equal(node.title, 'Согласовать смету')
  assert.equal(node.parent_id, 'root-work')
  assert.equal(node.status, 'undefined')
  assert.deepEqual(node.planner, planner('waiting', 1024, { urgency: 'urgent', follow_up_on: '2026-11-17', priority_note: 'Ждём ответ клиента' }))
  assert.throws(() => plannerTaskFromCommit({ title: 'x', parent_id: 'root-delivery' }, { nodes: roots, id: 'x', today: '2026-11-16' }), /personal root/)
})

test('planner patch and reorder cannot smuggle fields or lose an active lane member', () => {
  const nodes = [
    ...roots,
    { id: 'one', title: 'Один', parent_id: 'root-work', status: 'in_progress', planner: planner('focus', 1024) },
    { id: 'two', title: 'Два', parent_id: 'root-work', status: 'in_progress', planner: planner('focus', 2048) },
  ]
  assert.deepEqual(patchPlanner(null, { lane: 'waiting', follow_up_on: '2026-11-20' }, { fallbackRank: 2048 }), planner('waiting', 2048, { follow_up_on: '2026-11-20' }))
  assert.throws(() => patchPlanner(nodes[2].planner, { status: 'done' }), /not supported/)
  assert.throws(() => reorderPlannerTasks(nodes, { lane: 'focus', ordered_ids: ['one'] }), /every task/)
  const reordered = reorderPlannerTasks(nodes, { lane: 'focus', ordered_ids: ['two', 'one'] })
  assert.deepEqual(plannerQueue(reordered).map(node => [node.id, node.planner.rank]), [['two', 1024], ['one', 2048]])
})

test('planner migration preserves active status and maps previous lane names', () => {
  const nodes = [
    ...roots,
    { id: 'legacy-focus', title: 'Было в фокусе', parent_id: 'root-work', status: 'in_progress', planner: planner('focus', 1024) },
    { id: 'legacy-dated', title: 'Была в работе с датой', parent_id: 'root-work', status: 'in_progress', due: '2026-11-20' },
    { id: 'later', title: 'Later', parent_id: 'root-work', planner: planner('later', 1024) },
    { id: 'someday', title: 'Когда-нибудь', parent_id: 'root-work', status: 'someday', planner: planner('focus', 1024) },
  ]
  const migrated = migratePlannerState(nodes)
  const byId = new Map(migrated.nodes.map(node => [node.id, node]))

  assert.equal(migrated.changed, true)
  assert.equal(migrated.nodes.length, nodes.length)
  assert.equal(byId.get('legacy-focus').planner.lane, 'focus')
  assert.equal(byId.get('legacy-focus').status, 'in_progress')
  assert.equal(byId.get('legacy-dated').status, 'in_progress')
  assert.equal(byId.get('later').planner, null)
  assert.equal(byId.get('someday').planner.lane, 'focus')
})
