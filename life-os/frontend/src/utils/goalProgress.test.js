import assert from 'node:assert/strict'
import { test } from 'node:test'
import { goalProgressLabel, leafStats } from './goalProgress.js'

const leaf = (id, status) => ({ id, status, children: [] })

test('counts real leaves and excludes cancelled work from the denominator', () => {
  const root = { status: 'done', children: [leaf('done', 'done'), leaf('active', 'scheduled'), leaf('cancelled', 'dropped')] }
  const result = leafStats(root)
  assert.deepEqual(result, { total: 2, done: 1, dropped: 1, undef: 0 })
  assert.equal(goalProgressLabel(result), 'Выполнена 1 из 2 · 1 отменена')
})

test('completed parent does not replace its descendant leaves', () => {
  const root = { children: [{ status: 'done', children: [leaf('one', 'done'), leaf('two', 'done')] }, leaf('three', 'scheduled')] }
  assert.equal(goalProgressLabel(leafStats(root)), 'Выполнено 2 из 3')
})

test('all cancelled leaves have no progress fraction', () => {
  const root = { children: [leaf('one', 'dropped'), leaf('two', 'dropped'), leaf('three', 'dropped')] }
  assert.equal(goalProgressLabel(leafStats(root)), '3 отменены')
})
