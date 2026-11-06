import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertEligibleExecutor, assertEligibleVerifier } from '../agent-registry.js'

const registry = { agents: [
  { id: 'executor', status: 'active', roles: ['Исполнитель delivery'], can_verify: false },
  { id: 'verifier', status: 'active', roles: ['Независимый проверяющий'], can_verify: true },
  { id: 'inactive', status: 'suspended', roles: ['Независимый проверяющий'], can_verify: true },
] }

test('execution and verification require different active registered agents', () => {
  assert.doesNotThrow(() => assertEligibleExecutor(registry, 'executor', 'Исполнитель delivery'))
  assert.doesNotThrow(() => assertEligibleVerifier(registry, 'verifier', 'executor'))
  assert.throws(() => assertEligibleVerifier(registry, 'executor', 'executor'), /not approved|independent/)
  assert.throws(() => assertEligibleVerifier(registry, 'inactive', 'executor'), /unavailable/)
})
