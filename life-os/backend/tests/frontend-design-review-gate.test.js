import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'

const contractPath = path.resolve(import.meta.dirname, '../../../docs/life-os-frontend-design-review-gate.md')
const readContract = () => fs.readFile(contractPath, 'utf8')

test('frontend design gate defines scope, independent decision, and evidence by risk', async () => {
  const contract = await readContract()
  for (const value of ['route or navigation', 'loading, error, or empty state', 'keyboard/focus checks on desktop and a narrow viewport', 'reviewer different from its executor', '`pass` or `fail`']) {
    assert.match(contract, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(contract, /Backend-only work, test-only work.*exempt/s)
})

test('frontend design gate forbids automatic exceptions and constrains emergencies', async () => {
  const contract = await readContract()
  assert.match(contract, /Only the user may approve an exception/)
  assert.match(contract, /No code path, agent, task field, or timeout may grant an exception implicitly/)
  assert.match(contract, /rollback or the minimum hotfix/)
  assert.match(contract, /within 24 hours/)
  assert.match(contract, /cannot add a feature or redesign/)
})
