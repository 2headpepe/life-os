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
    env: { ...process.env, VAULT_PATH: vault, WORK_DIR: work, PORT: String(port), AI_RUNTIME: 'none' },
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

test('PATCH moves a node only to a valid parent in the same tree context', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-reparent-http-'))
  const vault = path.join(root, 'brain-content')
  const work = path.join(root, 'work')
  const treeFile = path.join(vault, 'tree', 'nodes.json')
  const tree = {
    _type: 'tree', nodes: [
      { id: 'root-personal', title: 'Personal', parent_id: null, work_context: 'personal', blocked_by: [] },
      { id: 'goal-a', title: 'Goal A', parent_id: 'root-personal', work_context: 'personal', blocked_by: [] },
      { id: 'goal-b', title: 'Goal B', parent_id: 'root-personal', work_context: 'personal', blocked_by: [] },
      { id: 'task-a', title: 'Task A', parent_id: 'goal-a', work_context: 'personal', status: 'undefined', blocked_by: [] },
      { id: 'root-delivery', title: 'Delivery', parent_id: null, work_context: 'delivery', blocked_by: [] },
      { id: 'delivery-goal', title: 'Delivery goal', parent_id: 'root-delivery', work_context: 'delivery', blocked_by: [] },
    ],
  }
  await fs.mkdir(path.dirname(treeFile), { recursive: true })
  await fs.mkdir(work, { recursive: true })
  await fs.writeFile(treeFile, JSON.stringify(tree))
  const port = await unusedPort()
  const server = await startServer({ vault, work, port })
  const patch = (id, body) => fetch(`http://127.0.0.1:${port}/api/tree/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

  try {
    const moved = await patch('task-a', { parent_id: 'goal-b' })
    assert.equal(moved.status, 200)
    assert.equal((await moved.json()).parent_id, 'goal-b')

    const cycle = await patch('goal-b', { parent_id: 'task-a' })
    assert.equal(cycle.status, 400)
    assert.match((await cycle.json()).error, /descendant/)

    const crossContext = await patch('task-a', { parent_id: 'delivery-goal' })
    assert.equal(crossContext.status, 400)
    assert.match((await crossContext.json()).error, /work context/)

    const toRoot = await patch('task-a', { parent_id: null })
    assert.equal(toRoot.status, 400)
    assert.match((await toRoot.json()).error, /root/)
  } finally {
    await stopServer(server)
    await fs.rm(root, { recursive: true, force: true })
  }
})
