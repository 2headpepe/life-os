import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addLocalDays, localDay, localWeekStart } from './calendarDay.js'

test('habit day follows local calendar time across the UTC boundary', () => {
  const previous = process.env.TZ
  process.env.TZ = 'Asia/Tomsk'
  try {
    const instant = new Date('2026-11-22T18:00:00Z')
    assert.equal(localDay(instant), '2026-11-23')
    assert.equal(addLocalDays('2026-11-23', -1), '2026-11-22')
    assert.equal(localWeekStart('2026-11-26'), '2026-11-23')
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})
