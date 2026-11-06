import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'

const read = file => fs.readFile(path.resolve(file), 'utf8')

test('personal routine views exclude delivery work by default', async () => {
  const [today, pool] = await Promise.all([
    read('src/pages/Today.jsx'),
    read('src/pages/Pool.jsx'),
  ])
  assert.match(today, /work_context \|\| 'personal'\) === 'personal'/)
  assert.match(pool, /parseWorkView\(location\.search\)/)
  assert.match(pool, /viewState\.context/)
  assert.match(pool, /work_context \|\| 'personal'\) === viewState\.context/)
})

test('AI Reviews exposes delivery approval but routes work-item creation to Goals', async () => {
  const reviews = await read('src/pages/AiReviews.jsx')
  assert.match(reviews, /approve_delivery_scope/)
  assert.match(reviews, /DeliveryApprovalDialog/)
  assert.match(reviews, /Утвердить границы работ/)
  assert.match(reviews, /Создать work item в Goals/)
  assert.doesNotMatch(reviews, /productIntelligence\.createWorkItem/)
  assert.doesNotMatch(reviews, /Создать первую work item/)
  assert.doesNotMatch(reviews, /window\.prompt\('Граница delivery scope'/)
})

test('AI Reviews keeps evidence secondary and provides accessible detail surfaces', async () => {
  const reviews = await read('src/pages/AiReviews.jsx')
  assert.match(reviews, /Приоритетное решение/)
  assert.match(reviews, /Аналитика по запросу/)
  assert.match(reviews, /aria-pressed/)
  assert.match(reviews, /role="tablist"/)
  assert.match(reviews, /aria-modal="true"/)
  assert.match(reviews, /event\.key === 'Escape'/)
  assert.match(reviews, /open_daily_detail/)
  assert.match(reviews, /open_weekly_detail/)
})

test('direct initiatives are created only in Goals and AI Reviews keeps the decision gate', async () => {
  const [tree, reviews, api] = await Promise.all([
    read('src/pages/Tree.jsx'),
    read('src/pages/AiReviews.jsx'),
    read('src/api.js'),
  ])
  assert.match(api, /createInitiative: \(payload\) => api\.post\('\/product-intelligence\/initiatives'/)
  assert.match(tree, /function DirectInitiativeDialog/)
  assert.match(tree, /productIntelligence\.createInitiative/)
  assert.match(tree, /expected_effect/)
  assert.match(tree, /user_direction/)
  assert.match(reviews, /href="\/goals\?context=delivery"/)
  assert.match(reviews, /goals\?context=delivery&task=\$\{encodeURIComponent\(work\.id\)\}/)
  assert.doesNotMatch(reviews, /productIntelligence\.createInitiative/)
  assert.doesNotMatch(reviews, /productIntelligence\.createWorkItem/)
  assert.match(reviews, /Приоритетное решение/)
  assert.match(reviews, /Рассмотреть решение/)
})

test('Tree presents delivery separately and never offers blocked as a status', async () => {
  const tree = await read('src/pages/Tree.jsx')
  assert.match(tree, /\['personal', 'Личное'\], \['delivery', 'Delivery'\]/)
  assert.doesNotMatch(tree, /LEAF_STATUSES = \[[^\]]*'blocked'/)
})

test('Tree exposes preparation and dependency creation only for delivery leaves', async () => {
  const [tree, api] = await Promise.all([
    read('src/pages/Tree.jsx'),
    read('src/api.js'),
  ])
  assert.match(tree, /function DeliveryTaskDialog/)
  assert.match(tree, /node\.work_context === 'delivery' && isLeaf/)
  assert.match(tree, /treeApi\.saveHandoff/)
  assert.match(tree, /treeApi\.createDependency/)
  assert.match(api, /createDependency: \(id, payload, outcomeCategory = 'task_progress'\)/)
  assert.match(api, /saveHandoff: \(id, handoff_contract, outcomeCategory = 'task_progress'\)/)
})

test('Tree links only server-filtered existing delivery dependencies', async () => {
  const [tree, api] = await Promise.all([read('src/pages/Tree.jsx'), read('src/api.js')])
  assert.match(tree, /Связать существующую задачу/)
  assert.match(tree, /eligibleExistingDependencies\(node\.id\)/)
  assert.match(tree, /linkExistingDependency\(node\.id, selectedExistingDependency\)/)
  assert.match(api, /eligibleExistingDependencies: \(id\) => api\.get\(`\/tree\/\$\{id\}\/eligible-existing-dependencies`\)/)
  assert.match(api, /linkExistingDependency: \(id, dependency_id, outcomeCategory = 'task_progress'\) => api\.post\(`\/tree\/\$\{id\}\/existing-dependencies`/)
})

test('Tree keeps delivery execution and verification in Goals lifecycle controls', async () => {
  const [tree, api] = await Promise.all([read('src/pages/Tree.jsx'), read('src/api.js')])
  assert.match(tree, /Исполнение и проверка/)
  assert.match(tree, /treeApi\.verify\(node\.id/)
  assert.match(tree, /Передать на проверку/)
  assert.match(tree, /Подтвердить проверку/)
  assert.match(tree, /node\.work_context === 'delivery' \? setDeliveryDialog\('execution'\)/)
  assert.match(api, /verify: \(id, payload\) => api\.post\(`\/tree\/\$\{id\}\/verification`/)
})

test('Tree does not expose a second manual AI-session lifecycle', async () => {
  const [tree, api] = await Promise.all([read('src/pages/Tree.jsx'), read('src/api.js')])
  assert.doesNotMatch(tree, /Начать сессию/)
  assert.doesNotMatch(tree, /Контур delivery-сессии/)
  assert.doesNotMatch(api, /startSession:/)
  assert.doesNotMatch(api, /handoffResult:/)
})

test('delivery dialog accepts legacy string fields in a handoff contract', async () => {
  const tree = await read('src/pages/Tree.jsx')
  assert.match(tree, /Array\.isArray\(value\) \? value : value \? \[String\(value\)\] : \[\]/)
})
