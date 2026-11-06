import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { operationName } from '../../src/analytics.js'

test('operation names never expose dynamic entity identifiers', () => {
  assert.equal(operationName('/tree/node-private-123?debug=yes'), 'tree/:id')
  assert.equal(operationName('/feed/reactions'), 'feed/reactions')
})

test('every application route is covered by route-level analytics', async () => {
  const app = await fs.readFile(path.resolve('src/App.jsx'), 'utf8')
  const routes = [...app.matchAll(/<Route path="([^"]+)"/g)].map(match => match[1])
  assert.ok(routes.length >= 14, 'expected all known Life OS routes')
  assert.match(app, /trackScreen\(location\.pathname\)/)
})

test('all API mutations use the shared tracked request helper', async () => {
  const api = await fs.readFile(path.resolve('src/api.js'), 'utf8')
  assert.match(api, /trackMutation/)
  assert.doesNotMatch(api, /fetch\(`\/api\/(?:tree|inbox|events|calendars|memories)\/\$\{id\}`/)
})

test('local-only interactions have explicit safe action events', async () => {
  const recovery = await fs.readFile(path.resolve('src/context/RecoveryModeContext.jsx'), 'utf8')
  const search = await fs.readFile(path.resolve('src/components/GlobalSearch.jsx'), 'utf8')
  assert.match(recovery, /trackUiAction\('recovery_mode'/)
  assert.match(search, /trackUiAction\('global_search'/)
})

test('every meaningful outcome category has an explicit producer', async () => {
  const read = file => fs.readFile(path.resolve(file), 'utf8')
  const [nodeCard, tree, today, habits, capture, feed, reviews] = await Promise.all([
    read('src/components/NodeCard.jsx'), read('src/pages/Tree.jsx'), read('src/pages/Today.jsx'), read('src/pages/Habits.jsx'),
    read('src/components/QuickCapture.jsx'), read('src/pages/Feed.jsx'), read('src/pages/AiReviews.jsx'),
  ])
  assert.match(nodeCard, /'task_progress'/)
  assert.match(tree, /'goal_progress'/)
  assert.match(`${today}\n${habits}`, /'habit_progress'/)
  assert.match(capture, /'capture_saved'/)
  assert.match(feed, /'feed_action'/)
  assert.match(reviews, /'review_decision'/)
})
