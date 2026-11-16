import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { isLoopbackAddress } from '../ai-review-overview.js'
import { productIntelligenceStore } from '../product-intelligence.js'

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(value, null, 2))
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-ai-review-overview-'))
  const pi = path.join(root, 'ops/product-intelligence')
  const receipts = path.join(root, 'ops/ai-sessions/runtime/receipts')
  await fs.mkdir(pi, { recursive: true })
  await fs.mkdir(receipts, { recursive: true })
  await fs.writeFile(path.join(pi, 'initiatives.jsonl'), `${JSON.stringify({ id: 'initiative:overview', title: 'Сделать обзоры понятными', goal: 'Показывать статус работы без технического шума.', state: 'approved', work_item_ids: ['work:done', 'work:active', 'work:missing'], created_at: '2026-11-15T00:00:00Z' })}\n`)
  await writeJson(path.join(root, 'brain/content/tree/nodes.json'), { nodes: [
    { id: 'work:done', title: 'Показать результаты отчётов', status: 'done' },
    { id: 'work:active', title: 'Проверить понятность карточек', status: 'in_progress', blocked_by: ['dependency:visual-check'] },
  ] })
  await writeJson(path.join(receipts, 'daily-2026-11-15.json'), { target_end: '2026-11-15', generated_at: '2026-11-15T09:00:00Z', terminal_state: 'draft_ready', report_exists: true, report: 'ops/ai-sessions/daily/2026-11-15.md', missing_run_ids: [] })
  await writeJson(path.join(receipts, 'weekly-2026-W46.json'), { target_end: '2026-11-15', generated_at: '2026-11-15T10:00:00Z', terminal_state: 'partial_pending', report_exists: true, report: 'ops/ai-sessions/weekly/2026-W46.md', missing_run_ids: ['run:missing'] })
  await fs.mkdir(path.join(root, 'ops/ai-sessions/daily'), { recursive: true })
  await fs.mkdir(path.join(root, 'ops/ai-sessions/weekly'), { recursive: true })
  const report = '# Отчёт\n\n## Что обработано\n- Проверен локальный источник ops/ai-sessions/private-run.md.\n\n## Что требует проверки\n- Источник не полностью доступен.\n\n## Следующее действие\n- Повторить проверку после следующего запуска.\n'
  await fs.writeFile(path.join(root, 'ops/ai-sessions/daily/2026-11-15.md'), report)
  await fs.writeFile(path.join(root, 'ops/ai-sessions/weekly/2026-W46.md'), report)
  await writeJson(path.join(root, 'ops/ai-sessions/runtime/health/latest.json'), { checked_at: '2026-11-16T00:00:00Z', checks: [
    { id: 'design_review_weekly', status: 'needs_verification', detail: 'Нет подтверждённого design evidence.' },
    { id: 'analytics_daily', status: 'failed', detail: 'Агрегат не сформирован.' },
  ] })
  await writeJson(path.join(root, 'ops/product-intelligence/design-reviews/coverage-index.json'), { generated_at: '2026-11-15T12:00:00Z', latest_run_ref: 'ops/product-intelligence/design-reviews/runs/2026-W46.md', coverage: { automated_weekly: { last_run_id: 'weekly-design-review:2026-W46', freshness: 'stale' } } })
  await fs.mkdir(path.join(root, 'ops/product-intelligence/design-reviews/runs'), { recursive: true })
  await fs.writeFile(path.join(root, 'ops/product-intelligence/design-reviews/runs/2026-W46.md'), report)
  return root
}

test('AI Review overview exposes only concise local report results and initiative progress', async t => {
  const root = await fixture()
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const model = await productIntelligenceStore(root).readModel({ includeLocalOverview: true })
  assert.equal(model.boundary, 'local_summary_only')
  assert.equal(model.overview.streams.length, 4)
  assert.deepEqual(model.overview.streams.map(stream => stream.kind), ['daily', 'weekly', 'design', 'analytics'])
  assert.equal(model.overview.streams[0].status, 'healthy')
  assert.equal(model.overview.streams[2].status_label, 'Нужно проверить')
  assert.equal(model.overview.streams[3].status, 'failed')
  assert.equal(model.overview.history.daily.length, 1)
  assert.match(model.overview.history.daily[0].sections[0].text, /локальный источник/)
  assert.doesNotMatch(JSON.stringify(model.overview), /ops\/ai-sessions\/private-run\.md/)
  const initiative = model.initiatives.find(item => item.id === 'initiative:overview')
  assert.deepEqual(initiative.work_summary, {
    total: 3, resolved: 2, done: 1, active: 1, blocked: 1,
    work_items: [
      { id: 'work:done', title: 'Показать результаты отчётов', status: 'done', blockers: 0 },
      { id: 'work:active', title: 'Проверить понятность карточек', status: 'in_progress', blockers: 1 },
    ],
  })
})

test('AI Review summaries are available only to loopback callers', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::1'), true)
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackAddress('192.168.1.5'), false)
  assert.equal(isLoopbackAddress(''), false)
})
