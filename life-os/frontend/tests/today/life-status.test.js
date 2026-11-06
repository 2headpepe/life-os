import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'

const readToday = () => fs.readFile(path.resolve('src/pages/Today.jsx'), 'utf8')

test('Life Status keeps the factual attention order and personal boundary', async () => {
  const today = await readToday()
  assert.match(today, /work_context \|\| 'personal'\) === 'personal'/)
  assert.match(today, /const task = overdue\[0\] \|\| inProgress\[0\] \|\| scheduledToday\[0\] \|\| null/)
  assert.match(today, /task\.core/)
})

test('Life Status is a minimal briefing rather than the former task workspace', async () => {
  const today = await readToday()
  assert.match(today, /Требует внимания/)
  assert.match(today, /Привычка дня/)
  assert.match(today, /Ближайшие 3 дня/)
  assert.doesNotMatch(today, /DayTimeline/)
  assert.doesNotMatch(today, /NodeCard/)
  assert.doesNotMatch(today, /inbox\.all/)
})

test('Life Status details are keyboard-accessible and disclose source limits', async () => {
  const today = await readToday()
  assert.match(today, /aria-expanded=\{open\}/)
  assert.match(today, /aria-controls=\{id\}/)
  assert.match(today, /Автоматическая сводка опирается на изменения задач/)
  assert.match(today, /Привычки не распределяются по сферам/)
  assert.match(today, /state === 'unavailable'/)
})
