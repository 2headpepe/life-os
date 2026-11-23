import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { contentPath, writableContent } from '../content-path.js'

test('content access stays inside the vault and writes only habit files', () => {
  const vault = path.resolve('/tmp/life-os-content-test')
  assert.equal(contentPath(vault, 'habits/log/2026-11-23.json'), path.join(vault, 'habits/log/2026-11-23.json'))
  for (const escape of ['../private.json', 'habits/../../private.json', '/etc/passwd', 'habits\\..\\private.json', 'habits//log.json']) {
    assert.equal(contentPath(vault, escape), null, escape)
  }
  assert.equal(writableContent('habits/definitions.json'), true)
  assert.equal(writableContent('habits/log/2026-11-23.json'), true)
  assert.equal(writableContent('tree/nodes.json'), false)
  assert.equal(writableContent('habits/log/not-a-day.json'), false)
})
