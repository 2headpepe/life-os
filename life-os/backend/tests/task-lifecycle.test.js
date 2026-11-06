import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertDeliveryTransition, blockersFor, handoffIsComplete, hasDependencyCycle, inboundDependencyReferences, isBlocked } from '../task-lifecycle.js'

const handoff = {
  target_role: 'Исполнитель delivery', requested_result: 'Проверенный результат', input_refs: ['ops/product-intelligence/evidence.json'],
  scope: 'Один поток', non_goals: 'Без расширения scope', output_format: 'markdown',
  acceptance_criteria: ['Есть проверка'], verifier_role: 'Независимый проверяющий',
}

test('blocked is derived from unfinished or missing dependencies', () => {
  const source = { id: 'source', blocked_by: ['dep', 'missing'] }
  const byId = new Map([['dep', { id: 'dep', title: 'Dependency', status: 'backlog' }]])
  assert.equal(isBlocked(source, byId), true)
  assert.deepEqual(blockersFor(source, byId).at(-1), { id: 'missing', title: 'Missing dependency', status: 'needs_verification', missing: true })
})

test('delivery transition requires a complete handoff and independent verification', () => {
  const grooming = { work_context: 'delivery', status: 'needs_grooming' }
  assert.throws(() => assertDeliveryTransition(grooming, 'backlog'), /complete handoff/)
  assert.doesNotThrow(() => assertDeliveryTransition(grooming, 'backlog', { handoff_contract: handoff }))
  const review = { work_context: 'delivery', status: 'waiting_for_review', execution: { actor: 'executor' } }
  assert.throws(() => assertDeliveryTransition(review, 'done', { verification: { state: 'passed', evidence_refs: ['ops/check'] } }), /independent/)
  assert.doesNotThrow(() => assertDeliveryTransition(review, 'done', { verification: { state: 'passed', evidence_refs: ['ops/check'], verified_by: 'verifier' } }))
})

test('cycles and referenced dependency deletion are rejected', () => {
  const nodes = [{ id: 'a', blocked_by: ['b'] }, { id: 'b', blocked_by: [] }]
  assert.equal(hasDependencyCycle(nodes, 'b', 'a'), true)
  assert.deepEqual(inboundDependencyReferences(nodes, new Set(['b'])), [{ source_id: 'a', dependency_id: 'b' }])
  assert.equal(handoffIsComplete({ ...handoff, input_refs: [] }), false)
})
