import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'

const readStats = () => fs.readFile(path.resolve('src/pages/Stats.jsx'), 'utf8')

test('Stats has a terminal retry state when definitions are unavailable', async () => {
  const stats = await readStats()
  assert.match(stats, /habits\.definitions\(\)[\s\S]*?\.catch\(\(\) =>/)
  assert.match(stats, /setDefinitionsState\('error'\)/)
  assert.match(stats, /Не удалось загрузить список привычек/)
  assert.match(stats, /Повторить/)
  assert.match(stats, /setDefinitionsReload\(v => v \+ 1\)/)
})

test('Habit Dynamics has a terminal empty state when no habits are active', async () => {
  const stats = await readStats()
  assert.match(stats, /setDefinitionsState\(active\.length \? 'ready' : 'empty'\)/)
  assert.match(stats, /if \(!active\.length\) setLoading\(false\)/)
  assert.match(stats, /Нет активных привычек/)
  assert.match(stats, /Открыть трекинг/)
})

test('Stats keeps available data and makes rejected daily logs explicit', async () => {
  const stats = await readStats()
  assert.match(stats, /const failed = results\.filter\(result => result\.status === 'rejected'\)\.length/)
  assert.match(stats, /setFailedLogCount\(failed\)/)
  assert.match(stats, /failedLogCount === days/)
  assert.match(stats, /Часть статистики недоступна/)
  assert.match(stats, /results\[i\]\.status === 'fulfilled' \? results\[i\]\.value\?\.habits \|\| \{\} : \{\}/)
})

test('Stats leaves existing score, streak and return-speed calculations in place', async () => {
  const stats = await readStats()
  assert.match(stats, /function calcStreak/)
  assert.match(stats, /function calcMaxStreak/)
  assert.match(stats, /function calcReturnSpeed/)
  assert.match(stats, /computeHabitScore\(defs, data\)/)
})

test('legacy Stats route redirects into the Habit Dynamics surface', async () => {
  const stats = await readStats()
  assert.match(stats, /export function HabitDynamics/)
  assert.match(stats, /<Navigate to="\/habits\?tab=dynamics" replace/)
})
