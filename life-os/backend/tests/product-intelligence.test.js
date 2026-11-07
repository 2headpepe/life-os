import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { productIntelligenceStore } from '../product-intelligence.js'

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-pi-'))
  const dir = path.join(root, 'ops/product-intelligence')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'opportunities.jsonl'), `${JSON.stringify({ id: 'opp:one', title: 'Improve onboarding', summary: 'A verified gap', source_refs: ['coverage:onboarding'], created_at: '2026-01-01T00:00:00Z' })}\n`)
  return root
}

test('read model keeps only data-free review records', async () => {
  const root = await fixture()
  const model = await productIntelligenceStore(root).readModel()
  assert.equal(model.boundary, 'data-free')
  assert.equal(model.opportunities[0].title, 'Improve onboarding')
  assert.doesNotMatch(JSON.stringify(model.opportunities), /ai-sessions|transcript|raw_archive/)
})

test('select creates a draft initiative and records a user action', async () => {
  const root = await fixture()
  const store = productIntelligenceStore(root)
  const result = await store.action({ action: 'select', target_ref: 'opp:one' })
  assert.equal(result.initiative.state, 'draft')
  assert.equal(result.initiative.opportunity_id, 'opp:one')
  assert.equal((await store.readModel()).initiatives.length, 1)
})

test('priority endpoints accept only a checksum, never source text', async () => {
  const root = await fixture()
  const store = productIntelligenceStore(root)
  await assert.rejects(store.priority('shown', { candidate_set_checksum: 'not-a-checksum' }), /Invalid candidate/)
  const record = await store.priority('shown', { candidate_set_checksum: 'a'.repeat(64) })
  assert.equal(record.action, 'shown')
  assert.equal(record.candidate_set_checksum.length, 64)
})
