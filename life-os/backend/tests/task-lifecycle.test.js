import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertDeliveryTransition, blockersFor, handoffIsComplete, hasDependencyCycle, inboundDependencyReferences, isBlocked } from '../task-lifecycle.js'

const handoff = {
  target_role: 'analyst', requested_result: 'validated summary', input_refs: ['ops/evidence.json'],
  scope: 'one flow', non_goals: 'no implementation', output_format: 'markdown',
  acceptance_criteria: ['covers source'], verifier_role: 'reviewer',
}

test('blocked is derived only from unfinished blocked_by dependencies', () => {
  const dependency = { id: 'dep', status: 'needs_grooming' }
  const source = { id: 'source', blocked_by: ['dep'] }
  assert.equal(isBlocked(source, new Map([[dependency.id, dependency]])), true)
  dependency.status = 'done'
  assert.equal(isBlocked(source, new Map([[dependency.id, dependency]])), false)
})
test('missing dependency stays blocked and is visible for recovery', () => {
  const source = { id: 'source', blocked_by: ['missing'] }
  const nodes = new Map([[source.id, source]])
  assert.equal(isBlocked(source, nodes), true)
  assert.deepEqual(blockersFor(source, nodes), [{ id: 'missing', title: 'Missing dependency', status: 'needs_verification', missing: true }])
})

test('referenced dependencies cannot be deleted without deleting their sources', () => {
  const source = { id: 'source', blocked_by: ['dependency'] }
  const dependency = { id: 'dependency', blocked_by: [] }
  assert.deepEqual(inboundDependencyReferences([source, dependency], new Set(['dependency'])), [
    { source_id: 'source', dependency_id: 'dependency' },
  ])
  assert.deepEqual(inboundDependencyReferences([source, dependency], new Set(['source', 'dependency'])), [])
})

test('handoff needs every required structured field', () => {
  assert.equal(handoffIsComplete(handoff), true)
  assert.equal(handoffIsComplete({ ...handoff, acceptance_criteria: [] }), false)
})

test('delivery work cannot leave grooming or complete without verification', () => {
  const grooming = { work_context: 'delivery', status: 'needs_grooming' }
  assert.throws(() => assertDeliveryTransition(grooming, 'backlog'), /complete handoff/)
  assert.doesNotThrow(() => assertDeliveryTransition(grooming, 'backlog', { handoff_contract: handoff }))
  const review = { work_context: 'delivery', status: 'waiting_for_review', execution: { actor: 'executor' } }
  assert.throws(() => assertDeliveryTransition(review, 'done'), /passed verification/)
  assert.doesNotThrow(() => assertDeliveryTransition(review, 'done', { verification: { state: 'passed', evidence_refs: ['ops/check.json'], verified_by: 'verifier' } }))
})

test('dependency cycles are rejected', () => {
  const nodes = [{ id: 'a', blocked_by: ['b'] }, { id: 'b', blocked_by: [] }]
  assert.equal(hasDependencyCycle(nodes, 'b', 'a'), true)
  assert.equal(hasDependencyCycle(nodes, 'a', 'b'), false)
})
