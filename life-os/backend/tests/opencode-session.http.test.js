import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const backendDir = path.resolve(import.meta.dirname, '..')
const fakeOpenCodeCli = path.join(import.meta.dirname, 'fixtures/fake-opencode-v2-cli.mjs')

async function unusedPort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

function sendJson(res, value, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(value))
}

function sendHtml(res, value, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html' })
  res.end(value)
}

async function startOpenCodeMock({ invalidHealth = false } = {}) {
  const calls = []
  const sockets = new Set()
  const state = {
    status: { type: 'idle' },
    messages: [{ info: { role: 'assistant' }, parts: [{ type: 'text', text: 'Сферы готовы' }] }],
  }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname === '/global/health') {
      if (invalidHealth) return sendHtml(res, '<!doctype html><title>Other local service</title>')
      return sendJson(res, { healthy: true, version: '1.18.33' })
    }
    if (url.pathname === '/config/providers') return sendJson(res, { providers: [{ id: 'assistant', models: [{ id: 'assistant' }] }] })
    if (url.pathname === '/session' && req.method === 'POST') {
      calls.push({ type: 'create', body: await readJson(req) })
      return sendJson(res, { id: 'ses_lifeos' })
    }
    if (url.pathname === '/session/ses_lifeos/prompt_async' && req.method === 'POST') {
      calls.push({ type: 'prompt', body: await readJson(req) })
      res.writeHead(204)
      return res.end()
    }
    if (url.pathname === '/session/status') return sendJson(res, { ses_lifeos: state.status })
    if (url.pathname === '/session/ses_lifeos/message') return sendJson(res, state.messages)
    if (url.pathname === '/session/ses_lifeos/abort' && req.method === 'POST') {
      calls.push({ type: 'abort', body: await readJson(req) })
      return sendJson(res, true)
    }
    if (url.pathname === '/global/event') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' })
      return
    }
    sendJson(res, { error: `unexpected ${req.method} ${url.pathname}` }, 404)
  })
  server.on('connection', socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  return {
    calls,
    state,
    url: `http://127.0.0.1:${port}`,
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise(resolve => server.close(resolve))
    },
  }
}

async function startLifeOs({ vault, work, port, env = {} }) {
  // Managed OpenCode starts in the selected project directory. Make the
  // temporary fixture mirror a real Life OS workspace rather than testing a
  // process spawn with a deliberately nonexistent cwd.
  await fs.mkdir(work, { recursive: true })
  const child = spawn(process.execPath, ['server.js'], {
    cwd: backendDir,
    env: { ...process.env, VAULT_PATH: vault, WORK_DIR: work, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = []
  child.stdout.on('data', data => output.push(data.toString()))
  child.stderr.on('data', data => output.push(data.toString()))
  const ready = new Promise((resolve, reject) => {
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
  await ready
  return child
}

async function stop(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await once(child, 'exit')
}

async function createExecutableFakeOpenCode(root) {
  const command = path.join(root, 'fake-opencode-v2')
  await fs.copyFile(fakeOpenCodeCli, command)
  await fs.chmod(command, 0o755)
  return command
}

test('OpenCode chat creates an observable ask-only session without automatic approval', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-opencode-http-'))
  const mock = await startOpenCodeMock()
  const port = await unusedPort()
  const backend = await startLifeOs({
    vault: path.join(root, 'brain-content'),
    work: path.join(root, 'work'),
    port,
    env: {
      AI_RUNTIME: 'opencode',
      OPENCODE_COMMAND: process.execPath,
      OPENCODE_MODEL: 'assistant/assistant',
      OPENCODE_SERVER_URL: mock.url,
    },
  })
  try {
    const started = await fetch(`http://127.0.0.1:${port}/api/ai/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Помоги настроить сферы' }] }),
    })
    assert.equal(started.status, 202)
    const startedBody = await started.json()
    assert.equal(startedBody.session_id, 'ses_lifeos')
    assert.equal(startedBody.state, 'running')
    assert.equal(startedBody.model, 'assistant/assistant')
    assert.equal(startedBody.agent, 'build')
    assert.equal(typeof startedBody.created_at, 'number')
    assert.equal(typeof startedBody.updated_at, 'number')
    assert.equal(startedBody.permission_required, false)
    assert.equal(startedBody.can_open_opencode, true)
    assert.equal(startedBody.can_open_terminal, true)
    assert.equal(startedBody.opencode_handoff, 'terminal')
    assert.equal(startedBody.can_cancel, true)
    assert.equal(typeof startedBody.requestId, 'string')
    const create = mock.calls.find(call => call.type === 'create').body
    assert.equal(create.agent, 'build')
    assert.deepEqual(create.model, { providerID: 'assistant', modelID: 'assistant' })
    assert.deepEqual(create.permission, [{ permission: '*', pattern: '*', action: 'ask' }])
    const prompt = mock.calls.find(call => call.type === 'prompt').body
    assert.equal(prompt.tools, undefined)
    assert.equal(prompt.agent, 'build')

    const status = await fetch(`http://127.0.0.1:${port}/api/ai/sessions/ses_lifeos`)
    assert.equal(status.status, 200)
    assert.equal((await status.json()).state, 'completed')

    const aborted = await fetch(`http://127.0.0.1:${port}/api/ai/sessions/ses_lifeos/abort`, { method: 'POST' })
    assert.equal(aborted.status, 200)
    assert.equal((await aborted.json()).state, 'cancelled')
    assert.equal(mock.calls.filter(call => call.type === 'abort').length, 1)
  } finally {
    await stop(backend)
    await mock.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})
test('Codex chat never contacts an OpenCode server', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-codex-isolation-'))
  const mock = await startOpenCodeMock()
  const port = await unusedPort()
  const backend = await startLifeOs({
    vault: path.join(root, 'brain-content'),
    work: path.join(root, 'work'),
    port,
    env: {
      AI_RUNTIME: 'codex',
      CODEX_COMMAND: 'missing-codex-for-isolation-test',
      CODEX_MODEL: 'gpt-test',
      OPENCODE_SERVER_URL: mock.url,
    },
  })
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/ai/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Привет' }] }),
    })
    assert.equal(response.status, 503)
    assert.equal(mock.calls.length, 0)

    const terminalWithoutOrigin = await fetch(`http://127.0.0.1:${port}/api/ai/open`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start_opencode_server' }),
    })
    assert.equal(terminalWithoutOrigin.status, 403)
    const terminalFromForeignOrigin = await fetch(`http://127.0.0.1:${port}/api/ai/open`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: JSON.stringify({ action: 'start_opencode_server' }),
    })
    assert.equal(terminalFromForeignOrigin.status, 403)
    const terminalFromLifeOs = await fetch(`http://127.0.0.1:${port}/api/ai/open`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify({ action: 'unknown' }),
    })
    assert.equal(terminalFromLifeOs.status, 400)
  } finally {
    await stop(backend)
    await mock.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})
test('unreachable OpenCode server returns a recovery action instead of waiting for a CLI timeout', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-opencode-unavailable-'))
  const port = await unusedPort()
  const unavailablePort = await unusedPort()
  const backend = await startLifeOs({
    vault: path.join(root, 'brain-content'),
    work: path.join(root, 'work'),
    port,
    env: {
      AI_RUNTIME: 'opencode',
      OPENCODE_COMMAND: process.execPath,
      OPENCODE_MODEL: 'assistant/assistant',
      OPENCODE_SERVER_URL: `http://127.0.0.1:${unavailablePort}`,
    },
  })
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/ai/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Привет' }] }),
    })
    assert.equal(response.status, 503)
    const body = await response.json()
    assert.equal(body.code, 'server_unreachable')
    assert.equal(body.action, 'start_server')
    assert.match(body.error, /недоступен/)
  } finally {
    await stop(backend)
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('an unexpected local response reports a port/configuration collision clearly', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-opencode-wrong-service-'))
  const mock = await startOpenCodeMock({ invalidHealth: true })
  const port = await unusedPort()
  const backend = await startLifeOs({
    vault: path.join(root, 'brain-content'),
    work: path.join(root, 'work'),
    port,
    env: {
      AI_RUNTIME: 'opencode',
      OPENCODE_COMMAND: process.execPath,
      OPENCODE_MODEL: 'assistant/assistant',
      OPENCODE_SERVER_URL: mock.url,
    },
  })
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/ai/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Привет' }] }),
    })
    assert.equal(response.status, 503)
    const body = await response.json()
    assert.equal(body.code, 'server_invalid_response')
    assert.equal(body.action, 'fix_server_configuration')
    assert.match(body.error, /поддерживаемый JSON/)
  } finally {
    await stop(backend)
    await mock.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('managed server launch refuses an endpoint it cannot bind safely', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-opencode-launch-config-'))
  const port = await unusedPort()
  const backend = await startLifeOs({
    vault: path.join(root, 'brain-content'),
    work: path.join(root, 'work'),
    port,
    env: {
      AI_RUNTIME: 'opencode',
      OPENCODE_COMMAND: process.execPath,
      OPENCODE_MODEL: 'assistant/assistant',
      OPENCODE_SERVER_URL: 'https://localhost:4096',
    },
  })
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/ai/opencode-server/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({}),
    })
    assert.equal(response.status, 400)
    const body = await response.json()
    assert.equal(body.code, 'managed_url_invalid')
    assert.match(body.error, /OPENCODE_SERVER_URL=http:\/\/127\.0\.0\.1:4096/)
    assert.match(body.error, /не https и не localhost/)
  } finally {
    await stop(backend)
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('managed v2 lifecycle is explicit, authenticated, redacted, and pairs without a terminal secret', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-opencode-managed-'))
  const port = await unusedPort()
  const openCodePort = await unusedPort()
  const command = await createExecutableFakeOpenCode(root)
  const backend = await startLifeOs({
    vault: path.join(root, 'brain-content'),
    work: path.join(root, 'work'),
    port,
    env: {
      AI_RUNTIME: 'opencode',
      OPENCODE_COMMAND: command,
      OPENCODE_MODEL: 'assistant/assistant',
      OPENCODE_SERVER_URL: `http://127.0.0.1:${openCodePort}`,
    },
  })
  try {
    // Config and requests do not start a process implicitly.
    const before = await fetch(`http://127.0.0.1:${port}/api/config`).then(response => response.json())
    assert.equal(before.openCodeServer.status, 'stopped')
    assert.equal(before.openCodeServer.available, false)
    assert.equal(before.openCodeServer.reason, 'server_not_started')

    const rejected = await fetch(`http://127.0.0.1:${port}/api/ai/opencode-server/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
    assert.equal(rejected.status, 403)

    const started = await fetch(`http://127.0.0.1:${port}/api/ai/opencode-server/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: '{}',
    })
    assert.equal(started.status, 200, await started.clone().text())
    const startBody = await started.json()
    assert.equal(startBody.openCodeServer.status, 'ready')
    assert.equal(startBody.openCodeServer.available, true)
    assert.equal(startBody.openCodeServer.managed, true)
    assert.equal(startBody.openCodeServer.owned, true)
    assert.equal(/password|authorization/i.test(JSON.stringify(startBody)), false)

    const chat = await fetch(`http://127.0.0.1:${port}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Проверь managed OpenCode' }] }),
    })
    assert.equal(chat.status, 202)
    const session = await chat.json()
    assert.equal(session.session_id, 'ses_managed')
    assert.equal(session.can_open_opencode, true)
    assert.equal(session.can_open_terminal, false)
    assert.equal(session.opencode_handoff, 'pairing')

    const pairing = await fetch(`http://127.0.0.1:${port}/api/ai/sessions/ses_managed/open`, {
      method: 'POST',
      redirect: 'manual',
      headers: { Origin: 'http://localhost:5173' },
    })
    assert.equal(pairing.status, 303, await pairing.clone().text())
    assert.equal(pairing.headers.get('cache-control'), 'no-store, private')
    assert.equal(pairing.headers.get('referrer-policy'), 'no-referrer')
    assert.match(pairing.headers.get('location'), new RegExp(`^http://127\\.0\\.0\\.1:${openCodePort}/auth/connect/`))
    assert.equal(await pairing.text(), '')

    const stopped = await fetch(`http://127.0.0.1:${port}/api/ai/opencode-server/stop`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: '{}',
    })
    assert.equal(stopped.status, 200)
    const stopBody = await stopped.json()
    assert.equal(stopBody.openCodeServer.status, 'stopped')
    assert.equal(stopBody.openCodeServer.owned, false)
  } finally {
    await stop(backend)
    await fs.rm(root, { recursive: true, force: true })
  }
})
