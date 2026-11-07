import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'

test('data-free AI review HTTP lifecycle never serves a source session', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-pi-http-'))
  const pi = path.join(root, 'ops/product-intelligence')
  await fs.mkdir(pi, { recursive: true })
  await fs.writeFile(path.join(pi, 'opportunities.jsonl'), `${JSON.stringify({ id: 'opp:http', title: 'Test opportunity', source_refs: ['coverage:test'], created_at: '2026-01-01T00:00:00Z' })}\n`)
  const port = 33000 + Math.floor(Math.random() * 1000)
  const server = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), WORK_DIR: root, VAULT_PATH: path.join(root, 'brain/content'), AI_RUNTIME: 'none' } })
  t.after(() => server.kill('SIGTERM'))
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 5_000)
    server.stdout.on('data', chunk => { if (chunk.toString().includes('running')) { clearTimeout(timer); resolve() } })
    server.once('error', reject)
  })
  const base = `http://127.0.0.1:${port}/api`
  const initial = await (await fetch(`${base}/ai-reviews`)).json()
  assert.equal(initial.boundary, 'data-free')
  assert.equal(initial.opportunities[0].id, 'opp:http')
  assert.equal(initial.sessions, undefined)
  const selected = await (await fetch(`${base}/product-intelligence/review-actions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'select', target_ref: 'opp:http' }) })).json()
  assert.equal(selected.initiative.state, 'draft')
  const denied = await fetch(`${base}/ai-sessions/anything/source`)
  assert.equal(denied.status, 404)
})
