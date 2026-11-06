import assert from 'node:assert/strict'
import { test } from 'node:test'
import { publicReview } from '../review-sanitizer.js'

test('public AI review schema never exposes arbitrary private-like strings', () => {
  const view = publicReview({
    id: 'review:1', state: 'личная медицинская заметка', classification: 'private',
    created_at: 'not-a-date', limits: ['я сказал секрет'], prompt: 'secret prompt',
    text: 'private text', body: 'private body', source_path: '<absolute-path>',
    evidence_refs: ['evidence:42', '<absolute-path>'], source_hashes: ['a'.repeat(64)],
  })
  assert.deepEqual(view, {
    id: 'review:1', schema_version: 1, state: 'draft', classification: null,
    created_at: null, updated_at: null, reviewed_at: null,
    evidence_refs: ['evidence:42'], source_hashes: ['a'.repeat(64)],
  })
  assert.equal(JSON.stringify(view).includes('private'), false)
})
