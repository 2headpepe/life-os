import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterAndRank, parseWorkView, workViewSearch } from './workControlPlane.js'

const nodes = [
  { id: 'one', title: 'Отчёт', root_id: 'root-work', status: 'someday' },
  { id: 'two', title: 'Отчёт сегодня', root_id: 'root-work', status: 'scheduled' },
  { id: 'three', title: 'Отчёт', root_id: 'root-home', status: 'someday' },
]

test('status counts use the same other filters and survive URL round trip', () => {
  const view = parseWorkView('?root=root-work&q=%D0%9E%D1%82%D1%87%D1%91%D1%82&status=someday')
  assert.deepEqual(filterAndRank(nodes, view).map(node => node.id), ['one'])
  assert.equal(filterAndRank(nodes, { ...view, statuses: [] }).length, 2)
  const cleared = { ...view, statuses: [] }
  assert.deepEqual(parseWorkView('?' + workViewSearch(cleared)), cleared)
})

test('zero matches retains the selected status and clear action remains possible', () => {
  const view = parseWorkView('?root=root-work&q=missing&status=someday')
  assert.equal(filterAndRank(nodes, view).length, 0)
  assert.deepEqual(view.statuses, ['someday'])
})

test('derived blocked tab uses constraint without a stored blocked status', () => {
  const view = parseWorkView('?blocked=true')
  const blocked = { id: 'blocked', title: 'Ждём зависимости', root_id: 'root-work', status: 'scheduled', is_blocked: true }
  assert.deepEqual(filterAndRank([...nodes, blocked], view).map(node => node.id), ['blocked'])
  assert.equal(filterAndRank([...nodes, blocked], { ...view, blocked: null }).length, 4)
})
