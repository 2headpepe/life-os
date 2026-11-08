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
    const timeout = setTimeout(() => reject(new Error(`server did not start: ${output.join('')}`)), 5000)
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

const registry = sourceRefs => ({ zones: [
  { id: 'stable', kind: 'route', axes: { design_review: { state: 'current', source_refs: ['safe'] } } },
  { id: 'partial', kind: 'route', axes: { design_review: { state: 'partial', source_refs: sourceRefs } } },
  { id: 'journey', kind: 'journey', axes: { tests: { state: 'not_reviewed', source_refs: [] } } },
] })

test('priority reminder HTTP lifecycle is isolated and changes with evidence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-priority-http-'))
  const vault = path.join(root, 'vault')
  const work = path.join(root, 'work')
  const treeFile = path.join(vault, 'tree', 'nodes.json')
  const registryFile = path.join(work, 'ops', 'product-intelligence', 'design-reviews', 'coverage-registry.json')
  const remindersFile = path.join(work, 'ops', 'product-intelligence', 'priority-reminders.jsonl')
  await fs.mkdir(path.dirname(treeFile), { recursive: true })
  await fs.mkdir(path.dirname(registryFile), { recursive: true })
  await fs.writeFile(treeFile, JSON.stringify({ _type: 'tree', nodes: [
    { id: 'done-delivery', title: 'Done delivery', work_context: 'delivery', status: 'done', updated: '2026-11-06' },
    { id: 'open-delivery', title: 'Open delivery', work_context: 'delivery', status: 'in_progress', updated: '2026-11-06' },
  ] }))
  await fs.writeFile(registryFile, JSON.stringify(registry(['old-evidence'])))
  const port = await unusedPort()
  const server = await startServer({ vault, work, port })
  const api = `http://127.0.0.1:${port}/api`
  try {
    const initial = await (await fetch(`${api}/ai-reviews`)).json()
    const packet = initial.priority_loop
    assert.equal(packet.reminder.state, 'draft')
    assert.equal(packet.candidates[0].zone_id, 'journey')
    const checksum = packet.candidate_set_checksum

    const post = async action => fetch(`${api}/product-intelligence/priority-loop/reminder`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, candidate_set_checksum: checksum }),
    })
    assert.equal((await post('shown')).status, 200)
    assert.equal((await (await fetch(`${api}/ai-reviews`)).json()).priority_loop.reminder.state, 'suppressed')
    const repeated = await (await post('shown')).json()
    assert.equal(repeated.idempotent, true)
    assert.equal((await post('dismiss')).status, 200)
    assert.equal((await (await fetch(`${api}/ai-reviews`)).json()).priority_loop.reminder.state, 'dismissed')

    await fs.writeFile(registryFile, JSON.stringify(registry(['new-evidence'])))
    const changed = (await (await fetch(`${api}/ai-reviews`)).json()).priority_loop
    assert.notEqual(changed.candidate_set_checksum, checksum)
    assert.equal(changed.reminder.state, 'draft')
    const rows = (await fs.readFile(remindersFile, 'utf8')).trim().split('\n').map(JSON.parse)
    assert.deepEqual(rows.map(row => row.action), ['shown', 'dismiss'])

    const recheck = async (action, delivery_task_id, candidate_set_checksum = changed.candidate_set_checksum) => fetch(`${api}/product-intelligence/priority-loop/recheck-drafts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, delivery_task_id, candidate_set_checksum }),
    })
    assert.equal((await recheck('create', 'open-delivery')).status, 409)
    const created = await (await recheck('create', 'done-delivery')).json()
    assert.equal(created.ok, true)
    assert.equal(created.draft.state, 'draft')
    assert.deepEqual(created.draft.zone_ids, ['partial', 'journey'])
    assert.equal((await (await recheck('create', 'done-delivery')).json()).idempotent, true)
    assert.equal((await recheck('dismiss', 'done-delivery')).status, 200)
    assert.equal((await (await recheck('dismiss', 'done-delivery')).json()).idempotent, true)
    const recheckView = (await (await fetch(`${api}/ai-reviews`)).json()).priority_recheck
    assert.equal(recheckView.drafts[0].state, 'dismissed')
    await fs.writeFile(registryFile, JSON.stringify(registry(['newer-evidence'])))
    const newer = (await (await fetch(`${api}/ai-reviews`)).json()).priority_loop
    assert.notEqual(newer.candidate_set_checksum, changed.candidate_set_checksum)
    assert.equal((await recheck('create', 'done-delivery', newer.candidate_set_checksum)).status, 200)
    const finalView = (await (await fetch(`${api}/ai-reviews`)).json()).priority_recheck
    assert.ok(finalView.drafts.some(draft => draft.candidate_set_checksum === changed.candidate_set_checksum && draft.state === 'dismissed'))
    assert.ok(finalView.drafts.some(draft => draft.candidate_set_checksum === newer.candidate_set_checksum && draft.state === 'draft'))
    const unchangedTree = JSON.parse(await fs.readFile(treeFile, 'utf8'))
    assert.deepEqual(unchangedTree.nodes.map(node => node.status), ['done', 'in_progress'])
  } finally {
    await stopServer(server)
    await fs.rm(root, { recursive: true, force: true })
  }
})
