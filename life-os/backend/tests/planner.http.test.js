import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const backendDir = path.resolve(import.meta.dirname, '..')

async function unusedPort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

async function startServer({ vault, work, port }) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: backendDir,
    env: { ...process.env, VAULT_PATH: vault, WORK_DIR: work, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = []
  child.stdout.on('data', data => output.push(data.toString()))
  child.stderr.on('data', data => output.push(data.toString()))
  const started = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`server did not start: ${output.join('')}`)), 5_000)
    child.stdout.on('data', data => {
      if (data.toString().includes('Life OS backend running')) {
        clearTimeout(timeout)
        resolve()
      }
    })
    child.once('exit', code => {
      clearTimeout(timeout)
      reject(new Error(`server exited ${code}: ${output.join('')}`))
    })
  })
  await started
  return child
}

async function stopServer(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await once(child, 'exit')
}

test('planner changes priority without starting personal tasks and migrates previous lane names', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-planner-http-'))
  const vault = path.join(root, 'vault')
  const work = path.join(root, 'work')
  const treeFile = path.join(vault, 'tree', 'nodes.json')
  await fs.mkdir(path.dirname(treeFile), { recursive: true })
  await fs.writeFile(treeFile, JSON.stringify({ _type: 'tree', nodes: [
    { id: 'root-work', title: 'Работа', parent_id: null, color: '#123456' },
    { id: 'root-delivery', title: 'Delivery', parent_id: null, work_context: 'delivery', color: '#654321' },
    { id: 'inactive', title: 'Не начато', parent_id: 'root-work' },
    { id: 'transition', title: 'Сменит состояние', parent_id: 'root-work' },
    { id: 'scheduled-start', title: 'Начать из Сегодня', parent_id: 'root-work', status: 'scheduled', first_step: 'Первый шаг', due: null },
    { id: 'someday', title: 'Идея на потом', parent_id: 'root-work', status: 'someday' },
    { id: 'calendar-item', title: 'Встреча', parent_id: 'root-work', status: 'scheduled', due: '2026-11-24', date_kind: 'scheduled', calendar_id: 'calendar-1' },
    { id: 'now-one', title: 'Первое', parent_id: 'root-work', status: 'in_progress', planner: { lane: 'focus', rank: 1024, urgency: 'unknown', follow_up_on: null, priority_note: null } },
    { id: 'review', title: 'На проверке', parent_id: 'root-work', status: 'waiting_for_review', planner: { lane: 'focus', rank: 1, urgency: 'unknown', follow_up_on: null, priority_note: null } },
    { id: 'legacy', title: 'Старое', parent_id: 'root-work', status: 'in_progress', planner: { lane: 'now', rank: 1024, urgency: 'unknown', follow_up_on: null, priority_note: null } },
  ] }))
  const port = await unusedPort()
  const server = await startServer({ vault, work, port })
  const api = `http://127.0.0.1:${port}/api/planner`
  const treeApi = `http://127.0.0.1:${port}/api/tree`
  try {
    const before = await (await fetch(`${api}/queue`)).json()
    assert.deepEqual(before.tasks.map(task => task.id), ['now-one'])

    const prioritizedInactive = await fetch(`${api}/tasks/inactive`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planner: { lane: 'next' } }),
    })
    assert.equal(prioritizedInactive.status, 200)
    assert.equal((await prioritizedInactive.json()).task.status, undefined)

    const startedTransitionStatus = await fetch(`${treeApi}/transition`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    })
    assert.equal(startedTransitionStatus.status, 200)

    const startedTransition = await fetch(`${api}/tasks/transition`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planner: { lane: 'focus' } }),
    })
    assert.equal(startedTransition.status, 200)
    const movedToReview = await fetch(`${treeApi}/transition`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'waiting_for_review' }),
    })
    assert.equal(movedToReview.status, 200)
    assert.equal((await movedToReview.json()).planner, null)

    const startedInactiveStatus = await fetch(`${treeApi}/inactive`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    })
    assert.equal(startedInactiveStatus.status, 200)
    const startedResponse = await fetch(`${api}/tasks/inactive`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planner: { lane: 'next' } }),
    })
    assert.equal(startedResponse.status, 200)
    const reorderedResponse = await fetch(`${api}/reorder`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lane: 'next', ordered_ids: ['inactive'] }),
    })
    assert.equal(reorderedResponse.status, 200)
    const statusOnly = await fetch(`${treeApi}/inactive`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'undefined' }),
    })
    assert.equal(statusOnly.status, 200)
    assert.equal((await statusOnly.json()).planner.lane, 'next')

    const removeResponse = await fetch(`${api}/tasks/inactive`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planner: null }),
    })
    assert.equal(removeResponse.status, 200)
    const afterRemoval = await (await fetch(`${api}/queue`)).json()
    assert.equal(afterRemoval.tasks.some(task => task.id === 'inactive'), false)

    const rejected = await fetch(`${api}/tasks/review`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planner: { lane: 'focus' } }),
    })
    assert.equal(rejected.status, 409)

    const migration = await (await fetch(`${api}/migrate`, { method: 'POST' })).json()
    assert.equal(migration.changed, true)
    assert.deepEqual(migration.tasks.map(task => task.id), ['now-one', 'legacy'])
    const stored = JSON.parse(await fs.readFile(treeFile, 'utf8'))
    assert.equal(stored.nodes.find(node => node.id === 'legacy').status, 'in_progress')
    assert.equal(stored.nodes.find(node => node.id === 'legacy').planner.lane, 'focus')
    assert.equal(stored.nodes.find(node => node.id === 'review').planner, null)

    const startBody = { start: true, expected_lane: null, planner: { lane: 'focus', follow_up_on: null } }
    const startResponse = await fetch(`${api}/tasks/scheduled-start`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(startBody) })
    assert.equal(startResponse.status, 200)
    const started = (await startResponse.json()).task
    assert.equal(started.status, 'in_progress')
    assert.equal(started.first_step, 'Первый шаг')
    const repeatResponse = await fetch(`${api}/tasks/scheduled-start`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(startBody) })
    assert.equal(repeatResponse.status, 200)
    assert.equal((await repeatResponse.json()).task.planner.rank, started.planner.rank)
    const waitingResponse = await fetch(`${api}/tasks/scheduled-start`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_lane: 'focus', planner: { lane: 'waiting', follow_up_on: '2026-11-21' } }) })
    assert.equal(waitingResponse.status, 200)
    const staleResponse = await fetch(`${api}/tasks/scheduled-start`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_lane: 'focus', planner: { lane: 'next' } }) })
    assert.equal(staleResponse.status, 409)
    const returnResponse = await fetch(`${api}/tasks/scheduled-start`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_lane: 'waiting', planner: { lane: 'focus' } }) })
    assert.equal(returnResponse.status, 200)
    assert.equal((await returnResponse.json()).task.planner.follow_up_on, null)
    const competing = await Promise.all([
      fetch(`${api}/tasks/scheduled-start`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_lane: 'focus', planner: { lane: 'next' } }) }),
      fetch(`${api}/tasks/scheduled-start`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_lane: 'focus', planner: { lane: 'waiting', follow_up_on: '2026-11-22' } }) }),
    ])
    assert.deepEqual(competing.map(response => response.status).sort(), [200, 409])
    const afterCompetition = JSON.parse(await fs.readFile(treeFile, 'utf8'))
    assert.equal(afterCompetition.nodes.find(node => node.id === 'scheduled-start').first_step, 'Первый шаг')
    const beforeInvalid = await fs.readFile(treeFile, 'utf8')
    const invalid = await fetch(`${api}/tasks/scheduled-start`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planner: { lane: 'waiting', follow_up_on: '2026-11-31' } }) })
    assert.equal(invalid.status, 400)
    assert.equal(await fs.readFile(treeFile, 'utf8'), beforeInvalid)
    const rawWrite = await fetch(`http://127.0.0.1:${port}/api/content/tree/nodes.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: beforeInvalid })
    assert.equal(rawWrite.status, 409)
    assert.equal(await fs.readFile(treeFile, 'utf8'), beforeInvalid)
    for (const [id, status] of [['someday', 'someday'], ['calendar-item', 'scheduled']]) {
      const prioritized = await fetch(`${api}/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planner: { lane: 'waiting' } }) })
      assert.equal(prioritized.status, 200)
      assert.equal((await prioritized.json()).task.status, status)
    }
    const allPriorities = await (await fetch(`${api}/queue`)).json()
    assert.equal(allPriorities.tasks.some(task => task.id === 'someday'), true)
    assert.equal(allPriorities.tasks.some(task => task.id === 'calendar-item'), true)
  } finally {
    await stopServer(server)
    await fs.rm(root, { recursive: true, force: true })
  }
})
