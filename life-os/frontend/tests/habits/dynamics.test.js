import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'

const read = file => fs.readFile(path.resolve(file), 'utf8')

test('Habits presents Dynamics as an in-section tab without a sidebar destination', async () => {
  const [habits, sidebar] = await Promise.all([
    read('src/pages/Habits.jsx'),
    read('src/components/Sidebar.jsx'),
  ])
  assert.match(habits, /\['dynamics', 'Динамика'\]/)
  assert.match(habits, /tab === 'dynamics' && <HabitDynamics embedded/)
  assert.doesNotMatch(sidebar, /to:\s*'\/stats'/)
})

test('legacy dynamics link opens the integrated tab', async () => {
  const habits = await read('src/pages/Habits.jsx')
  assert.match(habits, /useSearchParams/)
  assert.match(habits, /searchParams\.get\('tab'\) === 'dynamics'/)
})
