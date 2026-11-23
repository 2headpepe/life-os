import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { blockTarget, eventStore, saveWorkBlock, pushWorkBlocks } from '../work-blocks.js'

const nodes = [{ id: 'root', parent_id: null }, { id: 'leaf', parent_id: 'root', status: 'in_progress', planner: { lane: 'focus', rank: 1 } }]
const base = { id: 'block-1', title: 'Отчёт', task_id: 'leaf', date: '2026-11-20', time: '16:30', duration_min: 25, type: 'work_block' }
const cals = [{ id: 'local' }, { id: 'synced', sync_to_gcal: true, gcal_calendar_id: 'work' }]

test('blocks attach to concrete active personal leaves and cannot be reassigned', () => {
  const original = structuredClone(nodes)
  const data = { events: [] }
  assert.equal(blockTarget(nodes, 'root'), false)
  assert.equal(blockTarget([{ ...nodes[0], work_context: 'system_improvement' }, nodes[1]], 'leaf'), false)
  const block = saveWorkBlock(data, base, nodes, cals)
  saveWorkBlock(data, { date: '2026-11-21' }, nodes, cals, block)
  assert.equal(data.events.length, 1)
  assert.equal(data.events[0].date, '2026-11-21')
  assert.deepEqual(nodes, original)
  assert.throws(() => saveWorkBlock(data, { task_id: 'other' }, nodes, cals, data.events[0]), /Связь/)
  assert.throws(() => saveWorkBlock(data, { ...base, duration_min: -1 }, nodes, cals), /Длительность/)
  assert.throws(() => saveWorkBlock(data, { ...base, date: '2026-02-30' }, nodes, cals), /дата/)
  assert.throws(() => saveWorkBlock(data, base, [{...nodes[0], work_context:'delivery'}, nodes[1]], cals), /личная задача/)
})

test('retries and concurrent inserts share one serialized calendar file', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'calendar-blocks-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'index.json')
  const change = eventStore(file)
  await Promise.all([base, { ...base, id: 'block-2', time: '14:00' }, base].map(input => change(data => saveWorkBlock(data, input, nodes, cals))))
  const events = JSON.parse(await fs.readFile(file, 'utf8')).events
  assert.deepEqual(events.map(e => e.id), ['block-1','block-2'])
  await assert.rejects(change(data => saveWorkBlock(data, { ...base, title: 'Other' }, nodes, cals)), /уже занят/)
})

test('explicit push targets only an opted-in layer and reconciles moves and removals', async () => {
  const calls = []
  const remote = new Map()
  const client = { events: {
    update: async ({calendarId,eventId,requestBody}) => {
      calls.push(['update',calendarId])
      if (!remote.has(eventId)) throw Object.assign(new Error(), {code:404})
      remote.set(eventId, requestBody)
    },
    insert: async ({calendarId,requestBody}) => { calls.push(['insert',calendarId]); remote.set(requestBody.id, requestBody) },
    delete: async ({calendarId,eventId}) => { calls.push(['delete',calendarId]); remote.delete(eventId) },
  } }
  const block = { ...base, calendar_id: 'synced', time: '23:50', time_zone: 'Asia/Tomsk' }
  const data = { events: [block, {...base, id:'unassigned'}, {...base, id:'local', calendar_id:'local'}] }
  const push = () => pushWorkBlocks(data, cals, client, async () => {}, 'UTC')
  assert.equal(await push(), 1)
  assert.equal(remote.size, 1)
  assert.deepEqual([...remote.values()][0].end, {dateTime:'2026-11-20T17:15:00.000Z', timeZone:'Asia/Tomsk'})
  block.time = '10:15'
  await push()
  assert.equal(remote.size, 1)
  assert.equal([...remote.values()][0].start.dateTime,'2026-11-20T03:15:00.000Z')
  data.events = []
  await push()
  assert.equal(remote.size, 0)
  assert.ok(calls.every(([,calendar]) => calendar === 'work'))
})

test('concurrent reservations of the same interval cannot both succeed', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'calendar-block-race-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'events.json')
  const change = eventStore(file)
  const tree = [...nodes, {id:'other', parent_id:'root'}]
  const attempts = await Promise.allSettled([base, { ...base, id:'block-2', task_id:'other' }].map(input => change(data =>
    saveWorkBlock(data, { ...input, verify_window:true }, tree, cals))))
  assert.deepEqual(attempts.map(a => a.status), ['fulfilled', 'rejected'])
  assert.equal(attempts[1].reason.status, 409)
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).events.length, 1)
})

test('recommended interval is rechecked against meetings and appointments, with deadlines left free', () => {
  const meeting = {id:'meeting',date:base.date,time:'16:40',duration_min:30}
  const data = {events:[meeting]}
  assert.throws(() => saveWorkBlock(data, {...base, verify_window:true}, nodes, cals), /занят/)
  meeting.type = 'deadline'
  const appointment = {id:'appt',parent_id:'root',due:base.date,time:'16:50',date_kind:'scheduled'}
  assert.throws(() => saveWorkBlock(data, {...base, verify_window:true}, [...nodes,appointment], cals), /занят/)
  const stored = saveWorkBlock(data, {...base, verify_window:true}, nodes, cals)
  assert.equal(stored.verify_window, undefined)
})

test('re-exporting a removed block uses a new remote id, retired Google ids are recovered', async () => {
  const data = {events:[{...base, calendar_id:'synced'}]}
  const ids = []
  const client = { events: {
    update: async () => { throw Object.assign(new Error(), {code:404}) },
    get: async () => ({ data: { status:'cancelled' } }),
    insert: async ({requestBody}) => {
      ids.push(requestBody.id)
      if (ids.length === 1) throw Object.assign(new Error(), {code:409})
    },
    delete: async () => {},
  }}
  const push = () => pushWorkBlocks(data, cals, client, async()=>{}, 'UTC')
  await push()
  data.events = []
  await push()
  data.events = [{...base, calendar_id:'synced'}]
  await push()
  assert.equal(new Set(ids).size,3)
})
