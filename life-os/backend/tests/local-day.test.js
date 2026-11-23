import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localDay } from '../local-day.js'

test('server dates use the local day at the UTC boundary', () => {
  const previous = process.env.TZ
  process.env.TZ = 'Asia/Tomsk'
  try {
    assert.equal(localDay(new Date('2026-11-22T18:00:00Z')), '2026-11-23')
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})
