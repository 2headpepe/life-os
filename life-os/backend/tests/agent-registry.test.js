import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertEligibleCoordinator, assertEligibleExecutor, assertEligibleVerifier } from '../agent-registry.js'

const registry = { agents: [
  { id: 'executor', status: 'active', roles: ['Исполнитель delivery'], can_verify: false },
  { id: 'verifier', status: 'active', roles: ['Независимый проверяющий'], can_verify: true },
  { id: 'coordinator', status: 'active', roles: ['Координатор AI-сессии'], can_verify: false },
  { id: 'proposed-coordinator', status: 'proposed', roles: ['Координатор AI-сессии'], can_verify: false },
  { id: 'suspended-coordinator', status: 'suspended', roles: ['Координатор AI-сессии'], can_verify: false },
  { id: 'retired-coordinator', status: 'retired', roles: ['Координатор AI-сессии'], can_verify: false },
] }

test('only an active coordinator can manage a delivery session', () => {
  assert.doesNotThrow(() => assertEligibleCoordinator(registry, 'coordinator'))
  assert.throws(() => assertEligibleCoordinator(registry, 'proposed-coordinator'), /unavailable/)
  assert.throws(() => assertEligibleCoordinator(registry, 'suspended-coordinator'), /unavailable/)
  assert.throws(() => assertEligibleCoordinator(registry, 'retired-coordinator'), /unavailable/)
  assert.throws(() => assertEligibleCoordinator(registry, 'executor'), /does not match/)
})

test('delivery requires an active executor matching the requested role', () => {
  assert.doesNotThrow(() => assertEligibleExecutor(registry, 'executor', 'Исполнитель delivery'))
  assert.throws(() => assertEligibleExecutor(registry, 'missing', 'Исполнитель delivery'), /unavailable/)
  assert.throws(() => assertEligibleExecutor(registry, 'executor', 'Аналитик'), /does not match/)
})

test('verification requires a distinct active verifier', () => {
  assert.doesNotThrow(() => assertEligibleVerifier(registry, 'verifier', 'executor'))
  assert.throws(() => assertEligibleVerifier(registry, 'executor', 'executor'), /not approved|independent/)
})
