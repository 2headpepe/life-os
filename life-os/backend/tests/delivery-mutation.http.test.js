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

test('DELETE rejects referenced delivery dependency and preserves normal dependency creation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-delivery-http-'))
  const vault = path.join(root, 'brain-content')
  const work = path.join(root, 'work')
  const treeFile = path.join(vault, 'tree', 'nodes.json')
  const operationsFile = path.join(work, 'ops', 'product-intelligence', 'delivery-operations.jsonl')
  const initiativesFile = path.join(work, 'ops', 'product-intelligence', 'initiatives.jsonl')
  const tree = {
    _type: 'tree', nodes: [
      { id: 'root-delivery-life-os', title: 'Delivery', parent_id: null, work_context: 'delivery', blocked_by: [] },
      { id: 'source', title: 'Source', parent_id: 'root-delivery-life-os', work_context: 'delivery', status: 'backlog', blocked_by: ['dependency'] },
      { id: 'dependency', title: 'Dependency', parent_id: 'root-delivery-life-os', work_context: 'delivery', status: 'backlog', blocked_by: [] },
      { id: 'source-two', title: 'Second source', parent_id: 'root-delivery-life-os', work_context: 'delivery', status: 'backlog', blocked_by: [] },
      { id: 'cycle-dependent', title: 'Cycle dependent', parent_id: 'root-delivery-life-os', work_context: 'delivery', status: 'backlog', blocked_by: ['source-two'] },
      { id: 'foreign', title: 'Foreign delivery', parent_id: 'root-delivery-life-os', work_context: 'delivery', status: 'backlog', blocked_by: [] },
      { id: 'personal', title: 'Personal', parent_id: null, work_context: 'personal', status: 'backlog', blocked_by: [] },
    ],
  }
  const initiative = { id: 'initiative:test', state: 'approved', work_item_ids: ['source', 'dependency', 'source-two', 'cycle-dependent'], updated_at: '2026-11-05T00:00:00Z' }
  const foreignInitiative = { id: 'initiative:foreign', state: 'approved', work_item_ids: ['foreign'], updated_at: '2026-11-05T00:00:00Z' }
  await fs.mkdir(path.dirname(treeFile), { recursive: true })
  await fs.mkdir(path.dirname(initiativesFile), { recursive: true })
  await fs.writeFile(treeFile, JSON.stringify(tree))
  await fs.writeFile(initiativesFile, `${JSON.stringify(initiative)}\n${JSON.stringify(foreignInitiative)}\n`)
  await fs.writeFile(operationsFile, '')
  const port = await unusedPort()
  const server = await startServer({ vault, work, port })
  try {
    const rejected = await fetch(`http://127.0.0.1:${port}/api/tree/dependency`, { method: 'DELETE' })
    assert.equal(rejected.status, 409)
    const rejection = await rejected.json()
    assert.deepEqual(rejection.inbound_refs, [{ source_id: 'source', dependency_id: 'dependency' }])
    const afterRejected = JSON.parse(await fs.readFile(treeFile, 'utf8'))
    assert.equal(afterRejected.nodes.some(node => node.id === 'dependency'), true)
    const rejectedReceipt = (await fs.readFile(operationsFile, 'utf8')).trim().split('\n').map(JSON.parse).at(-1)
    assert.equal(rejectedReceipt.state, 'rejected')
    assert.equal(rejectedReceipt.reason, 'referenced_dependency')

    const created = await fetch(`http://127.0.0.1:${port}/api/tree/source/dependencies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New dependency', outcome: 'Safe regression fixture' }),
    })
    assert.equal(created.status, 201)
    const result = await created.json()
    assert.equal(result.dependency.work_context, 'delivery')
    assert.equal(result.source.blocked_by.includes(result.dependency.id), true)

    const eligible = await fetch(`http://127.0.0.1:${port}/api/tree/source-two/eligible-existing-dependencies`)
    assert.equal(eligible.status, 200)
    assert.equal((await eligible.json()).candidates.some(candidate => candidate.id === 'dependency'), true)

    const linked = await fetch(`http://127.0.0.1:${port}/api/tree/source-two/existing-dependencies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dependency_id: 'dependency' }),
    })
    assert.equal(linked.status, 201)
    assert.equal((await linked.json()).source.blocked_by.includes('dependency'), true)

    const repeated = await fetch(`http://127.0.0.1:${port}/api/tree/source-two/existing-dependencies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dependency_id: 'dependency' }),
    })
    assert.equal(repeated.status, 200)
    assert.equal((await repeated.json()).idempotent, true)

    const rejectedBefore = await Promise.all([
      fs.readFile(treeFile, 'utf8'),
      fs.readFile(operationsFile, 'utf8'),
    ])
    const assertRejectedLink = async dependencyId => {
      const response = await fetch(`http://127.0.0.1:${port}/api/tree/source-two/existing-dependencies`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dependency_id: dependencyId }),
      })
      assert.equal(response.status, dependencyId === 'missing' ? 404 : 409)
      assert.deepEqual(await Promise.all([fs.readFile(treeFile, 'utf8'), fs.readFile(operationsFile, 'utf8')]), rejectedBefore)
    }
    await assertRejectedLink('source-two')
    await assertRejectedLink('missing')
    await assertRejectedLink('personal')
    await assertRejectedLink('foreign')
    await assertRejectedLink('cycle-dependent')
  } finally {
    await stopServer(server)
    await fs.rm(root, { recursive: true, force: true })
  }
})
