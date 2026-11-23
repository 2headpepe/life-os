import assert from 'node:assert/strict'
import { test } from 'node:test'
import { api, habits, tree } from './api.js'
import { flush } from './analytics.js'

test('API errors reject while missing daily logs stay empty, and outcome reaches analytics', async () => {
  const previousFetch = globalThis.fetch
  const previousWindow = globalThis.window
  const previousNavigator = globalThis.navigator
  const sent = []
  globalThis.window = { setTimeout: () => 0, clearTimeout: () => {}, dispatchEvent: () => {} }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    sendBeacon: (_url, body) => { sent.push(body); return true },
  } })
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    assert.deepEqual(await habits.log('2026-11-23'), { date: '2026-11-23', habits: {} })
    await assert.rejects(api.get('/content/habits/definitions.json'), /not found/)

    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'write failed' }), { status: 500 })
    await assert.rejects(habits.saveLog('2026-11-23', { habits: {} }, 'habit_progress'), /write failed/)

    globalThis.fetch = async () => new Response(JSON.stringify({ id: 'task-1' }), { status: 200 })
    await tree.update('task-1', { status: 'done' }, 'task_progress')
    flush()
    const events = (await Promise.all(sent.map(blob => blob.text()))).flatMap(text => JSON.parse(text).events)
    assert.ok(events.some(event => event.type === 'api_write_failed' && event.properties.attempted_outcome_category === 'habit_progress'))
    assert.ok(events.some(event => event.type === 'api_write_succeeded' && event.properties.outcome_category === 'task_progress'))
  } finally {
    globalThis.fetch = previousFetch
    globalThis.window = previousWindow
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previousNavigator })
  }
})
