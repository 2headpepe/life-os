import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { ManagedOpenCodeServer } from '../managed-opencode-server.js'

class FakeChild extends EventEmitter {
  constructor({ exitOnKill = true } = {}) {
    super()
    this.stdout = new EventEmitter()
    this.stderr = new EventEmitter()
    this.exitOnKill = exitOnKill
    this.killCalls = []
  }

  kill(signal) {
    this.killCalls.push(signal)
    if (this.exitOnKill) this.emit('exit', 0, signal)
    return true
  }
}

function fixedBytes(text = 'managed-password') {
  return () => Buffer.from(text)
}

function makeManager(overrides = {}) {
  const children = []
  const spawns = []
  const spawnImpl = overrides.spawnImpl || ((command, args, options) => {
    const child = new FakeChild()
    children.push(child)
    spawns.push({ command, args, options, child })
    return child
  })
  const manager = new ManagedOpenCodeServer({
    url: 'http://127.0.0.1:4096',
    spawnImpl,
    randomBytesImpl: fixedBytes(),
    environment: { PROVIDER_TOKEN: 'provider-token' },
    portProbe: async () => ({ available: true }),
    readinessTimeoutMs: 0,
    readinessProbe: async ({ password }) => {
      assert.equal(password, 'bWFuYWdlZC1wYXNzd29yZA')
      return { version: '2.20.0' }
    },
    ...overrides,
  })
  return { manager, children, spawns }
}

test('does not spawn until explicit start and keeps generated credential off public state', async () => {
  const { manager, spawns } = makeManager()

  assert.equal(manager.availability().status, 'stopped')
  assert.equal(spawns.length, 0)

  const result = await manager.start()
  assert.equal(result.status, 'ready')
  assert.equal(result.action, 'started')
  assert.equal(spawns.length, 1)
  assert.equal(spawns[0].command, 'opencode')
  assert.deepEqual(spawns[0].args, ['serve', '--hostname', '127.0.0.1', '--port', '4096'])
  assert.equal(spawns[0].options.shell, false)
  assert.equal(spawns[0].options.cwd, process.cwd())
  assert.equal(spawns[0].options.windowsHide, true)
  assert.equal(spawns[0].options.env.OPENCODE_PASSWORD, 'bWFuYWdlZC1wYXNzd29yZA')
  assert.equal(spawns[0].options.env.PROVIDER_TOKEN, 'provider-token')
  assert.equal(spawns[0].args.join(' '), 'serve --hostname 127.0.0.1 --port 4096')
  assert.equal(JSON.stringify(manager.availability()).includes('bWFuYWdlZC1wYXNzd29yZA'), false)
  assert.equal(JSON.stringify(result).includes('bWFuYWdlZC1wYXNzd29yZA'), false)
  assert.deepEqual(manager.credentials(), {
    url: 'http://127.0.0.1:4096',
    password: 'bWFuYWdlZC1wYXNzd29yZA',
  })
})

test('coalesces concurrent explicit starts into one owned child', async () => {
  let release
  const ready = new Promise(resolve => { release = resolve })
  const { manager, spawns } = makeManager({ readinessProbe: () => ready })

  const first = manager.start()
  const second = manager.start()
  release({ version: '2.20.0' })

  const [one, two] = await Promise.all([first, second])
  assert.equal(one.status, 'ready')
  assert.equal(two.status, 'ready')
  assert.equal(spawns.length, 1)
  assert.equal((await manager.start()).action, 'already_running')
})

test('marks a preflight port collision as external and never spawns, adopts, or stops it', async () => {
  let spawnCount = 0
  const { manager } = makeManager({
    portProbe: async () => ({ available: false, code: 'EADDRINUSE' }),
    spawnImpl: () => { spawnCount += 1; return new FakeChild() },
  })

  const result = await manager.start()
  assert.equal(result.status, 'endpoint_occupied')
  assert.equal(result.errorCode, 'endpoint_occupied')
  assert.equal(manager.credentials(), null)

  const stopped = await manager.stop()
  assert.equal(stopped.action, 'not_owned')
  assert.equal(spawnCount, 0)
})

test('clears a spawn EADDRINUSE error without treating the child as owned', async () => {
  let spawned
  const { manager } = makeManager({
    spawnImpl: () => {
      spawned = new FakeChild({ exitOnKill: false })
      queueMicrotask(() => spawned.emit('error', Object.assign(new Error('busy'), { code: 'EADDRINUSE' })))
      return spawned
    },
    readinessProbe: async () => new Promise(() => {}),
  })

  const result = await manager.start()
  assert.equal(result.status, 'endpoint_occupied')
  assert.equal(manager.availability().owned, false)
  await manager.stop()
  assert.deepEqual(spawned.killCalls, [])
})

test('unexpected child exit clears credential and does not trigger a restart', async () => {
  const { manager, children, spawns } = makeManager()
  await manager.start()
  children[0].emit('exit', 1, null)

  assert.equal(manager.availability().status, 'failed')
  assert.equal(manager.availability().errorCode, 'process_exited')
  assert.equal(manager.credentials(), null)
  assert.equal(manager.availability().owned, false)
  assert.equal(spawns.length, 1)
})

test('only terminates a child it owns and stop is idempotent', async () => {
  const { manager, children } = makeManager()
  await manager.start()

  const stopped = await manager.stop()
  assert.equal(stopped.status, 'stopped')
  assert.equal(stopped.action, 'stopped')
  assert.deepEqual(children[0].killCalls, ['SIGTERM'])
  assert.equal(manager.credentials(), null)

  const again = await manager.stop()
  assert.equal(again.action, 'already_stopped')
  assert.deepEqual(children[0].killCalls, ['SIGTERM'])
})

test('escalates only an owned child that ignores graceful stop', async () => {
  let child
  const { manager } = makeManager({
    spawnImpl: () => {
      child = new FakeChild({ exitOnKill: false })
      child.kill = signal => {
        child.killCalls.push(signal)
        if (signal === 'SIGKILL') child.emit('exit', 0, signal)
        return true
      }
      return child
    },
    waitImpl: async () => {},
    stopTimeoutMs: 0,
    forceStopTimeoutMs: 0,
  })

  await manager.start()
  const stopped = await manager.stop()

  assert.equal(stopped.status, 'stopped')
  assert.equal(stopped.owned, false)
  assert.deepEqual(child.killCalls, ['SIGTERM', 'SIGKILL'])
})

test('uses Basic authentication for default v2 readiness without publishing it', async () => {
  const requests = []
  const { manager } = makeManager({
    readinessProbe: undefined,
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return new Response(JSON.stringify({ version: '2.20.0', pid: 1 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    },
  })

  await manager.start()
  assert.equal(requests.length, 1)
  assert.equal(new URL(requests[0].url).pathname, '/api/info')
  assert.equal(requests[0].options.headers.Authorization, `Basic ${Buffer.from('opencode:bWFuYWdlZC1wYXNzd29yZA').toString('base64')}`)
  assert.equal(JSON.stringify(manager.availability()).includes(requests[0].options.headers.Authorization), false)
})

test('a failed readiness probe terminates only its own child and retains a redacted failure', async () => {
  const { manager, children } = makeManager({
    readinessProbe: async () => {
      const error = new Error('not an OpenCode server')
      error.code = 'server_invalid_response'
      throw error
    },
  })

  const result = await manager.start()
  assert.equal(result.status, 'failed')
  assert.equal(result.errorCode, 'server_invalid_response')
  assert.equal(manager.credentials(), null)
  assert.deepEqual(children[0].killCalls, ['SIGTERM'])
  assert.equal(manager.availability().owned, false)
})

test('a failed readiness probe force-stops only its own unresponsive child', async () => {
  let child
  const { manager } = makeManager({
    spawnImpl: () => {
      child = new FakeChild({ exitOnKill: false })
      child.kill = signal => {
        child.killCalls.push(signal)
        if (signal === 'SIGKILL') child.emit('exit', 1, signal)
        return true
      }
      return child
    },
    readinessProbe: async () => {
      const error = new Error('not an OpenCode server')
      error.code = 'server_invalid_response'
      throw error
    },
    waitImpl: async () => {},
    stopTimeoutMs: 0,
    forceStopTimeoutMs: 0,
  })

  const result = await manager.start()

  assert.equal(result.status, 'failed')
  assert.equal(result.errorCode, 'server_invalid_response')
  assert.equal(result.owned, false)
  assert.deepEqual(child.killCalls, ['SIGTERM', 'SIGKILL'])
})

test('accepts a configured executable only before a child is active', async () => {
  const { manager, spawns } = makeManager()
  manager.setCommand('custom-opencode')
  await manager.start()
  assert.equal(spawns[0].command, 'custom-opencode')
  assert.throws(() => manager.setCommand('other-opencode'), error => error.code === 'command_change_while_active')
})

test('requires a fixed IPv4 loopback HTTP endpoint and safe executable name', () => {
  assert.throws(() => new ManagedOpenCodeServer({ url: 'https://127.0.0.1:4096' }), error => error.code === 'managed_url_invalid')
  assert.throws(() => new ManagedOpenCodeServer({ url: 'http://localhost:4096' }), error => error.code === 'managed_url_invalid')
  assert.throws(() => new ManagedOpenCodeServer({ url: 'http://127.0.0.1:0' }), error => error.code === 'managed_url_invalid')
  assert.throws(() => new ManagedOpenCodeServer({ url: 'http://127.0.0.1:4096', command: 'opencode --bad' }), error => error.code === 'command_invalid')
})
