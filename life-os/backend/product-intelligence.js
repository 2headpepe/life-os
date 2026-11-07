import { createHash, randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { priorityPacket } from './priority-loop.js'

const FILES = {
  opportunities: 'opportunities.jsonl',
  initiatives: 'initiatives.jsonl',
  actions: 'review-actions.jsonl',
  reminders: 'priority-reminders.jsonl',
  rechecks: 'priority-rechecks.jsonl',
}

const safeJsonl = async file => {
  try {
    return (await fs.readFile(file, 'utf8')).split('\n').filter(Boolean).map(JSON.parse)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

const safeJson = async (file, fallback) => {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

const append = async (file, record) => {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.appendFile(file, `${JSON.stringify(record)}\n`, 'utf8')
}

const latest = rows => Object.values(rows.reduce((out, row) => {
  if (!out[row.id] || String(row.updated_at || row.created_at) >= String(out[row.id].updated_at || out[row.id].created_at)) out[row.id] = row
  return out
}, {}))
const safeRefs = refs => (Array.isArray(refs) ? refs : []).filter(ref => typeof ref === 'string' && /^[a-z0-9][a-z0-9:_-]{0,120}$/i.test(ref))

export function productIntelligenceStore(root) {
  const file = name => path.join(root, 'ops/product-intelligence', FILES[name])
  const coverageFile = path.join(root, 'ops/product-intelligence', 'design-reviews', 'coverage-registry.json')
  const now = () => new Date().toISOString()
  const id = type => `${type}:${randomUUID()}`

  async function readModel() {
    const [opportunities, initiatives, actions, reminders, rechecks, coverage] = await Promise.all([
      ...Object.keys(FILES).map(name => safeJsonl(file(name))),
      safeJson(coverageFile, { zones: [] }),
    ])
    const actionByTarget = actions.reduce((out, action) => ((out[action.target_ref] ||= []).push(action), out), {})
    const safeOpportunities = latest(opportunities).map(item => ({ ...item, source_refs: safeRefs(item.source_refs), actions: (actionByTarget[item.id] || []).map(({ body, ...action }) => action) }))
    const candidates = safeOpportunities.filter(item => !['defer', 'stop'].includes((actionByTarget[item.id] || []).at(-1)?.action)).slice(0, 3).map(item => ({ id: item.id, title: item.title, reasons: item.source_refs?.length ? ['has_provenance'] : ['needs_provenance'] }))
    const candidate_set_checksum = createHash('sha256').update(JSON.stringify(candidates)).digest('hex')
    const legacyReminder = latest(reminders).find(item => item.candidate_set_checksum === candidate_set_checksum)
    const loop = priorityPacket(coverage)
    const loopReminderRecord = reminders.filter(item => item.candidate_set_checksum === loop.candidate_set_checksum).at(-1)
    const loopReminder = loopReminderRecord
      ? { state: loopReminderRecord.action === 'dismiss' ? 'dismissed' : 'suppressed' }
      : loop.reminder
    return {
      schema_version: 1,
      boundary: 'data-free',
      limits: ['No session text, transcript, filesystem path, credential, or personal content is exposed.'],
      opportunities: safeOpportunities,
      initiatives: latest(initiatives),
      priority: { candidates, candidate_set_checksum, reminder: legacyReminder || { state: 'draft' }, rechecks: latest(rechecks) },
      priority_loop: { ...loop, reminder: loopReminder },
      priority_recheck: { drafts: latest(rechecks) },
    }
  }

  async function action({ action, target_ref }) {
    if (!['select', 'defer', 'stop', 'restore_attention', 'mark_seen', 'approve_delivery_scope'].includes(action)) throw new Error('Unknown review action')
    const model = await readModel()
    const target = [...model.opportunities, ...model.initiatives].find(item => item.id === target_ref)
    if (!target) throw new Error('Review record not found')
    const record = { id: id('review-action'), schema_version: 1, action, target_ref, created_at: now(), author: 'user' }
    await append(file('actions'), record)
    if (action === 'select' && model.opportunities.some(item => item.id === target_ref)) {
      const initiative = { id: id('initiative'), schema_version: 1, opportunity_id: target_ref, title: target.title, goal: target.goal || target.summary || '', scope: '', state: 'draft', source_refs: target.source_refs || [], work_item_ids: [], created_at: now(), updated_at: now() }
      await append(file('initiatives'), initiative)
      return { action: record, initiative }
    }
    if (action === 'approve_delivery_scope' && model.initiatives.some(item => item.id === target_ref)) {
      const initiative = model.initiatives.find(item => item.id === target_ref)
      if (initiative.state !== 'draft') throw new Error('Only a draft initiative can be approved')
      const approved = { ...initiative, state: 'approved', approval_ref: record.id, updated_at: now() }
      await append(file('initiatives'), approved)
      return { action: record, initiative: approved }
    }
    return { action: record }
  }

  async function createInitiative(input) {
    const required = ['title', 'goal', 'scope', 'expected_effect', 'effect_window', 'user_direction']
    if (required.some(key => !String(input[key] || '').trim())) throw new Error(`Missing ${required.join(', ')}`)
    const timestamp = now()
    const initiative = {
      id: id('initiative'), schema_version: 1, title: String(input.title).trim(), goal: String(input.goal).trim(),
      scope: String(input.scope).trim(), expected_effect: String(input.expected_effect).trim(), effect_window: String(input.effect_window).trim(),
      user_direction: String(input.user_direction).trim(), state: 'approved', origin: 'user_directive', source_refs: [], work_item_ids: [], created_at: timestamp, updated_at: timestamp,
    }
    await append(file('initiatives'), initiative)
    await append(file('actions'), { id: id('review-action'), schema_version: 1, action: 'create_delivery_initiative', target_ref: initiative.id, created_at: timestamp, author: 'user' })
    return initiative
  }

  async function attachWorkItem(initiativeId, workItemId) {
    const model = await readModel()
    const initiative = model.initiatives.find(item => item.id === initiativeId)
    if (!initiative || initiative.state !== 'approved') throw new Error('Approved initiative not found')
    const next = { ...initiative, work_item_ids: [...new Set([...(initiative.work_item_ids || []), workItemId])], updated_at: now() }
    await append(file('initiatives'), next)
    return next
  }

  async function priority(kind, payload) {
    if (!['shown', 'dismiss', 'create_recheck', 'dismiss_recheck'].includes(kind)) throw new Error('Unknown priority action')
    const checksum = String(payload.candidate_set_checksum || '')
    if (!(/^[a-f0-9]{16,128}$/i.test(checksum) || /^priority:[a-z0-9:|,_-]{1,512}$/i.test(checksum))) throw new Error('Invalid candidate set checksum')
    const isRecheck = kind.includes('recheck')
    const destination = file(isRecheck ? 'rechecks' : 'reminders')
    const existing = await safeJsonl(destination)
    const deliveryTaskId = payload.delivery_task_id || null
    const sameAction = existing.find(record => record.action === kind && record.candidate_set_checksum === checksum && record.delivery_task_id === deliveryTaskId)
    if (sameAction) return { ...sameAction, idempotent: true }
    const record = {
      id: isRecheck ? `priority-recheck:${deliveryTaskId}:${checksum}` : id('priority'),
      schema_version: 1,
      action: kind,
      candidate_set_checksum: checksum,
      delivery_task_id: deliveryTaskId,
      zone_ids: Array.isArray(payload.zone_ids) ? payload.zone_ids : [],
      state: kind === 'dismiss_recheck' ? 'dismissed' : 'draft',
      created_at: now(),
    }
    await append(destination, record)
    return record
  }

  return { readModel, action, priority, createInitiative, attachWorkItem }
}

export function checksumForCoverage(coverage) {
  return createHash('sha256').update(JSON.stringify(coverage)).digest('hex')
}
