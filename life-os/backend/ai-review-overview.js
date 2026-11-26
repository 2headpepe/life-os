import fs from 'fs/promises'
import path from 'path'

const REPORT_KINDS = {
  daily: { label: 'Ежедневный обзор', directory: 'daily', receiptPrefix: 'daily-' },
  weekly: { label: 'Недельный обзор', directory: 'weekly', receiptPrefix: 'weekly-' },
}

const STATUS_LABELS = {
  healthy: 'Готово',
  degraded: 'Неполно',
  failed: 'Не готово',
  unknown: 'Нет данных',
  needs_verification: 'Нужно проверить',
}

export function isLoopbackAddress(address = '') {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return fallback }
}

async function readText(file) {
  try { return await fs.readFile(file, 'utf8') } catch { return '' }
}

async function directoryEntries(directory, matcher) {
  try { return (await fs.readdir(directory)).filter(matcher).sort() } catch { return [] }
}

function cleanReportText(value) {
  const cleaned = String(value || '')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(?:^|\s)(?:ops|brain|life-os)\/[\w./:-]+/g, ' локальный источник')
    .replace(/(?:^|\s)\/(?:[\w.-]+\/)+[\w.-]+/g, ' локальный источник')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return cleaned
}

function concise(value, limit = 480) {
  const cleaned = cleanReportText(value).replace(/\s+/g, ' ')
  if (cleaned.length <= limit) return cleaned
  const sentence = cleaned.slice(0, limit).replace(/[,:;\s]+[^.?!]*$/, '').trim()
  return `${sentence || cleaned.slice(0, limit).trim()}…`
}

function reportSections(markdown) {
  const collected = []
  let heading = 'Обзор'
  let lines = []
  const flush = () => {
    if (!heading || !lines.length) return
    const text = cleanReportText(lines.join('\n'))
    if (text) collected.push({ heading, text })
  }
  for (const rawLine of String(markdown || '').split('\n')) {
    if (rawLine.trim() === '---' && !collected.length && !lines.length) { heading = null; continue }
    const match = rawLine.match(/^#{1,3}\s+(.+)/)
    if (match) {
      flush()
      const normalized = match[1].trim().toLocaleLowerCase('ru')
      if (/доказательств|доказательства|work_groups|^coverage$|^daily_receipts$|^source_reports$/.test(normalized)) { lines = []; break }
      heading = match[0].startsWith('# ') ? 'Обзор' : match[1].trim()
      lines = []
      continue
    }
    if (heading && rawLine.trim()) lines.push(rawLine.trim())
  }
  flush()
  return collected
}

function reportPath(root, kind, ref) {
  if (typeof ref !== 'string') return null
  const prefix = `ops/ai-sessions/${REPORT_KINDS[kind].directory}/`
  if (!ref.startsWith(prefix) || !ref.endsWith('.md')) return null
  const base = path.resolve(root, prefix)
  const file = path.resolve(root, ref)
  return file.startsWith(`${base}${path.sep}`) ? file : null
}

function localMarkdownPath(root, ref, directory) {
  if (typeof ref !== 'string' || !ref.startsWith(`${directory}/`) || !ref.endsWith('.md')) return null
  const base = path.resolve(root, directory)
  const file = path.resolve(root, ref)
  return file.startsWith(`${base}${path.sep}`) ? file : null
}

function receiptStatus(receipt) {
  if (!receipt) return 'unknown'
  if (receipt.terminal_state === 'draft_ready' && receipt.report_exists && !(receipt.missing_run_ids || []).length) return 'healthy'
  if (receipt.terminal_state === 'partial_pending' || receipt.report_exists) return 'degraded'
  return 'failed'
}

function receiptReason(receipt) {
  if (!receipt) return 'Отчёт ещё не запускался.'
  if (receipt.coverage_status === 'source_index_failed') return 'Не удалось подготовить источник для обзора.'
  if (receipt.coverage_status === 'generation_failed') return 'Отчёт не сформировался; причина остаётся видимой в health.'
  if ((receipt.missing_run_ids || []).length) return `Не покрыто сессий: ${receipt.missing_run_ids.length}.`
  if (!receipt.report_exists) return 'Файл отчёта не создан.'
  return 'Отчёт подготовлен, но требует проверки полноты.'
}

async function receiptEntry(root, kind, receipt) {
  const report = reportPath(root, kind, receipt?.report)
  const sections = report ? reportSections(await readText(report)) : []
  const date = receipt?.target_end || null
  return {
    id: `${kind}:${date || 'unknown'}`,
    kind,
    title: REPORT_KINDS[kind].label,
    period: date || 'Нет даты',
    status: receiptStatus(receipt),
    status_label: STATUS_LABELS[receiptStatus(receipt)],
    summary: sections[0]?.text ? concise(sections[0].text) : receiptReason(receipt),
    sections,
    has_detail: sections.length > 0,
    generated_at: receipt?.generated_at || null,
  }
}

async function receiptsFor(root, kind) {
  const directory = path.join(root, 'ops/ai-sessions/runtime/receipts')
  const prefix = REPORT_KINDS[kind].receiptPrefix
  const names = await directoryEntries(directory, name => name.startsWith(prefix) && name.endsWith('.json'))
  const rows = await Promise.all(names.map(name => readJson(path.join(directory, name))))
  return rows.filter(Boolean).sort((a, b) => String(b.target_end || b.generated_at).localeCompare(String(a.target_end || a.generated_at)))
}

function healthCheck(health, id) {
  return health?.checks?.find(check => check.id === id) || null
}

function withHealth(entry, check) {
  if (!check) return entry
  const status = ['healthy', 'degraded', 'failed'].includes(check.status) ? check.status : 'unknown'
  return {
    ...entry,
    status,
    status_label: STATUS_LABELS[check.status] || STATUS_LABELS[status] || entry.status_label,
    summary: check.status === 'healthy' ? entry.summary : concise(typeof check.detail === 'string' ? check.detail : entry.summary),
  }
}

async function designEntry(root, health) {
  const index = await readJson(path.join(root, 'ops/product-intelligence/design-reviews/coverage-index.json'), {})
  const runRef = index?.latest_run_ref
  const runPath = localMarkdownPath(root, runRef, 'ops/product-intelligence/design-reviews/runs')
  const sections = runPath ? reportSections(await readText(runPath)) : []
  const coverage = index?.coverage?.automated_weekly || {}
  const base = {
    id: 'design', kind: 'design', title: 'Design review',
    period: coverage.last_run_id?.replace('weekly-design-review:', '') || 'Нет запуска',
    status: coverage.freshness === 'fresh' ? 'healthy' : coverage.last_run_id ? 'degraded' : 'unknown',
    status_label: STATUS_LABELS[coverage.freshness === 'fresh' ? 'healthy' : coverage.last_run_id ? 'degraded' : 'unknown'],
    summary: sections[0]?.text ? concise(sections[0].text) : (coverage.last_run_id ? 'Автоматическая проверка ограничена имеющимися evidence.' : 'Design review ещё не запускался.'),
    sections,
    has_detail: sections.length > 0,
    generated_at: index?.generated_at || null,
  }
  return withHealth(base, healthCheck(health, 'design_review_weekly'))
}

async function analyticsEntry(root, health) {
  const directory = path.join(root, 'ops/life-os-analytics/aggregates')
  const names = await directoryEntries(directory, name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
  const latestName = names.at(-1)
  const aggregate = latestName ? await readJson(path.join(directory, latestName), {}) : null
  const missing = aggregate?.source_coverage?.missing_source_refs?.length || 0
  const base = {
    id: 'analytics', kind: 'analytics', title: 'Аналитика',
    period: aggregate?.date || latestName?.replace('.json', '') || 'Нет агрегата',
    status: !aggregate ? 'unknown' : missing ? 'degraded' : 'healthy',
    status_label: STATUS_LABELS[!aggregate ? 'unknown' : missing ? 'degraded' : 'healthy'],
    summary: !aggregate
      ? 'Агрегат ещё не создан.'
      : missing ? `Не хватает источников: ${missing}. Выводы о поведении не делаются.` : `Событий за период: ${aggregate.source_event_count || 0}.`,
    sections: aggregate ? [{ heading: 'Что известно', text: missing ? `Для периода не хватает ${missing} источников, поэтому данные нельзя трактовать как эффект.` : `Собрано ${aggregate.source_event_count || 0} событий. Сигналы требуют отдельной проверки.` }] : [],
    has_detail: Boolean(aggregate), generated_at: aggregate?.generated_at || null,
  }
  const daily = healthCheck(health, 'analytics_daily')
  const weekly = healthCheck(health, 'analytics_weekly')
  const dailyEntry = withHealth(base, daily)
  if (!weekly || weekly.status === 'healthy') return dailyEntry
  const weeklySummary = weekly.detail === 'aggregate_missing'
    ? 'Недельный агрегат ещё не создан.'
    : weekly.detail === 'source_coverage_incomplete'
      ? `В недельном агрегате не хватает источников: ${(weekly.missing_source_refs || []).length}.`
      : 'Недельный агрегат требует проверки.'
  const status = weekly.status === 'failed' || dailyEntry.status === 'failed' ? 'failed' : 'degraded'
  return {
    ...dailyEntry,
    status,
    status_label: STATUS_LABELS[status],
    summary: `${dailyEntry.summary} ${weeklySummary}`,
    sections: [...dailyEntry.sections, { heading: 'Недельное окно', text: weeklySummary }],
    has_detail: true,
  }
}

function workSummary(initiative, nodes) {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const workItems = (initiative.work_item_ids || []).map(id => byId.get(id)).filter(Boolean).map(node => ({
    id: node.id, title: cleanReportText(node.title), status: node.status || 'not_started', blockers: (node.blocked_by || []).length,
  }))
  const counts = workItems.reduce((result, item) => ({ ...result, [item.status]: (result[item.status] || 0) + 1 }), {})
  return {
    total: (initiative.work_item_ids || []).length,
    resolved: workItems.length,
    done: counts.done || 0,
    active: (counts.in_progress || 0) + (counts.waiting_for_review || 0),
    blocked: workItems.filter(item => item.blockers > 0).length,
    work_items: workItems,
  }
}

export async function buildAiReviewOverview(root, initiatives) {
  const health = await readJson(path.join(root, 'ops/ai-sessions/runtime/health/latest.json'), {})
  const [dailyReceipts, weeklyReceipts, tree] = await Promise.all([
    receiptsFor(root, 'daily'), receiptsFor(root, 'weekly'),
    readJson(path.join(root, 'brain/content/tree/nodes.json'), { nodes: [] }),
  ])
  const [daily, weekly, design, analytics] = await Promise.all([
    receiptEntry(root, 'daily', dailyReceipts[0]),
    receiptEntry(root, 'weekly', weeklyReceipts[0]),
    designEntry(root, health), analyticsEntry(root, health),
  ])
  const history = {
    daily: await Promise.all(dailyReceipts.slice(0, 14).map(row => receiptEntry(root, 'daily', row))),
    weekly: await Promise.all(weeklyReceipts.slice(0, 12).map(row => receiptEntry(root, 'weekly', row))),
    design: design.has_detail ? [design] : [],
    analytics: analytics.has_detail ? [analytics] : [],
  }
  const nodes = Array.isArray(tree?.nodes) ? tree.nodes : []
  return {
    boundary: 'local_summary_only', checked_at: health?.checked_at || null,
    streams: [daily, weekly, design, analytics], history,
    initiatives: initiatives.map(initiative => ({ ...initiative, work_summary: workSummary(initiative, nodes) })),
  }
}
