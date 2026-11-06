import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterAndRank, parseWorkView, workViewSearch } from '../../src/utils/workControlPlane.js'
import fs from 'node:fs/promises'
import path from 'node:path'

test('work views preserve a canonical repeatable URL grammar', () => {
  const view = parseWorkView('?status=ready&root=b&root=a&context=delivery&sort=suggested&blocked=false&q=review&task=n1')
  assert.deepEqual(view.roots, ['a', 'b'])
  assert.equal(workViewSearch(view), 'context=delivery&root=a&root=b&status=ready&blocked=false&q=review&sort=suggested&task=n1')
})

test('suggested order is read-only and explains readiness', () => {
  const nodes = [
    { id: 'blocked', title: 'Blocked', work_context: 'delivery', status: 'ready', is_blocked: true, handoff_contract: {} },
    { id: 'ready', title: 'Ready', work_context: 'delivery', status: 'ready', is_blocked: false, handoff_contract: { target_role: 'x', requested_result: 'x', input_refs: ['x'], scope: 'x', non_goals: 'x', output_format: 'x', acceptance_criteria: 'x', verifier_role: 'x' } },
  ]
  const result = filterAndRank(nodes, { ...parseWorkView('?context=delivery&sort=suggested'), roots: [], statuses: [], owner: '', q: '', task: '' })
  assert.equal(result[0].id, 'ready')
  assert.deepEqual(result[0].suggestion.reasons, ['готова к старту'])
  assert.equal(result[1].suggestion.readiness.ready, false)
})

test('Pool and Goals consume URL-scoped delivery views without an automatic task action', async () => {
  const read = file => fs.readFile(path.resolve(file), 'utf8')
  const [pool, goals] = await Promise.all([read('src/pages/Pool.jsx'), read('src/pages/Tree.jsx')])
  assert.match(pool, /workViewSearch\(viewState\)/)
  assert.match(pool, /Рекомендованный порядок/)
  assert.match(pool, /не выбирает и не изменяет задачи/)
  assert.match(goals, /params\.get\('task'\) \|\| params\.get\('root'\)/)
  assert.match(goals, /setContextInUrl/)
})
