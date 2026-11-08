import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { spawn as nodeSpawn } from 'node:child_process'
import { createServer } from 'node:net'

const MANAGED_HOST = '127.0.0.1'
const DEFAULT_READINESS_TIMEOUT_MS = 12_000
const DEFAULT_READINESS_INTERVAL_MS = 150
const DEFAULT_STOP_TIMEOUT_MS = 5_000
const DEFAULT_FORCE_STOP_TIMEOUT_MS = 1_000

export class ManagedOpenCodeServerError extends Error {
  constructor(message, { code = 'managed_server_error', status = null } = {}) {
    super(message)
    this.name = 'ManagedOpenCodeServerError'
    this.code = code
    this.status = status
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function asBase64Url(bytes) {
  if (typeof bytes?.toString !== 'function') {
    throw new ManagedOpenCodeServerError('Secure random bytes are required', { code: 'random_unavailable' })
  }
  return bytes.toString('base64url')
}

function validateCommand(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(value)) {
    throw new ManagedOpenCodeServerError('Managed OpenCode command is invalid', { code: 'command_invalid' })
  }
  return value
}

function safeCode(error, fallback = 'managed_server_failed') {
  if (error?.code === 'EADDRINUSE') return 'endpoint_occupied'
  if (typeof error?.code === 'string' && /^[a-z0-9_]+$/i.test(error.code)) return error.code
  return fallback
}

function validateManagedUrl(value) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new ManagedOpenCodeServerError('Managed OpenCode URL must be absolute', { code: 'managed_url_invalid' })
  }

  const port = Number(parsed.port)
  if (parsed.protocol !== 'http:' || parsed.hostname !== MANAGED_HOST || !parsed.port || !Number.isInteger(port) || port < 1 || port > 65_535 || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new ManagedOpenCodeServerError('Managed OpenCode URL must use an explicit 127.0.0.1 HTTP port', { code: 'managed_url_invalid' })
  }

  return {
    url: parsed.origin,
    port,
  }
}

function basicAuthorization(password) {
  return `Basic ${Buffer.from(`opencode:${password}`, 'utf8').toString('base64')}`
}

function defer() {
  let resolve
  const promise = new Promise(nextResolve => { resolve = nextResolve })
  return { promise, resolve }
}

function attachDrain(stream) {
  // OpenCode prints its generated password during startup. Put a data listener
  // on both streams so their buffers cannot block the child, but never forward
  // their contents to logs or public diagnostics.
  stream?.on?.('data', () => {})
  stream?.resume?.()
}

function defaultPortProbe({ host, port }) {
  return new Promise(resolve => {
    const server = createServer()
    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      resolve(result)
    }
    server.once('error', error => finish({ available: false, code: safeCode(error, 'port_probe_failed') }))
    server.listen({ host, port, exclusive: true }, () => {
      server.close(error => {
        if (error) return finish({ available: false, code: 'port_probe_failed' })
        finish({ available: true })
      })
    })
  })
}

/**
 * Owns one explicitly-started OpenCode v2 foreground server.
 *
 * It deliberately does not inspect, adopt, restart, or terminate a server it
 * did not spawn. `availability()` is passive. `credentials()` is an internal
 * backend-only boundary: callers must not serialize or log its return value.
 */
export class ManagedOpenCodeServer {
  constructor({
    url,
    command = 'opencode',
    spawnImpl = nodeSpawn,
    randomBytesImpl = nodeRandomBytes,
    fetchImpl = globalThis.fetch,
    readinessProbe,
    portProbe = defaultPortProbe,
    environment = process.env,
    cwd = process.cwd(),
    now = () => Date.now(),
    waitImpl = wait,
    readinessTimeoutMs = DEFAULT_READINESS_TIMEOUT_MS,
    readinessIntervalMs = DEFAULT_READINESS_INTERVAL_MS,
    stopTimeoutMs = DEFAULT_STOP_TIMEOUT_MS,
    forceStopTimeoutMs = DEFAULT_FORCE_STOP_TIMEOUT_MS,
  } = {}) {
    const endpoint = validateManagedUrl(url)
    if (typeof spawnImpl !== 'function') throw new ManagedOpenCodeServerError('Spawn implementation is required', { code: 'spawn_unavailable' })
    if (typeof randomBytesImpl !== 'function') throw new ManagedOpenCodeServerError('Secure random implementation is required', { code: 'random_unavailable' })
    if (typeof fetchImpl !== 'function') throw new ManagedOpenCodeServerError('Fetch implementation is required', { code: 'fetch_unavailable' })
    if (typeof portProbe !== 'function') throw new ManagedOpenCodeServerError('Port probe implementation is required', { code: 'port_probe_unavailable' })
    if (typeof waitImpl !== 'function') throw new ManagedOpenCodeServerError('Wait implementation is required', { code: 'wait_unavailable' })
    if (typeof cwd !== 'string' || !cwd) throw new ManagedOpenCodeServerError('Managed OpenCode working directory is required', { code: 'working_directory_invalid' })

    this.url = endpoint.url
    this.port = endpoint.port
    this.command = validateCommand(command)
    this.spawnImpl = spawnImpl
    this.randomBytesImpl = randomBytesImpl
    this.fetchImpl = fetchImpl
    this.portProbe = portProbe
    this.environment = environment
    this.cwd = cwd
    this.now = now
    this.waitImpl = waitImpl
    this.readinessTimeoutMs = readinessTimeoutMs
    this.readinessIntervalMs = readinessIntervalMs
    this.stopTimeoutMs = stopTimeoutMs
    this.forceStopTimeoutMs = forceStopTimeoutMs
    this.readinessProbe = readinessProbe || (options => this.#defaultReadinessProbe(options))

    this.state = 'stopped'
    this.failureCode = null
    this.child = null
    this.password = null
    this.startPromise = null
    this.stopPromise = null
    this.stopRequested = false
    this.exitDeferred = null
  }

  // Safe to return through `/api/config`: no password, auth header, PID, raw
  // process output, or low-level spawn error crosses this boundary.
  availability() {
    return {
      mode: 'managed',
      managed: true,
      status: this.state,
      url: this.url,
      errorCode: this.failureCode,
      owned: Boolean(this.child),
    }
  }

  // Backend-only. Do not expose this through an HTTP response, logger, UI
  // state, telemetry, shell command, or temporary file.
  credentials() {
    if (this.state !== 'ready' || !this.child || !this.password) return null
    return { url: this.url, password: this.password }
  }

  // The runtime config owns the executable choice. It can only be changed
  // before a managed child exists, so a running child never receives a
  // surprise command or secret rotation.
  setCommand(command) {
    if (this.child || this.startPromise) {
      throw new ManagedOpenCodeServerError('Cannot change the OpenCode command while managed server is active', { code: 'command_change_while_active' })
    }
    this.command = validateCommand(command)
    return this.availability()
  }

  async start() {
    if (this.state === 'ready' && this.child && this.password) {
      return { ...this.availability(), action: 'already_running' }
    }
    if (this.startPromise) return this.startPromise

    // A previous owned child is still stopping or failed to stop. Never start
    // another child on the same port before that ownership is resolved.
    if (this.child) {
      if (this.stopPromise) await this.stopPromise
      if (this.child) return { ...this.availability(), action: 'not_started' }
    }

    this.startPromise = this.#start()
    try {
      return await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  async stop() {
    if (this.stopPromise) return this.stopPromise
    if (!this.child) {
      // `endpoint_occupied` denotes an external process. Do not pretend this
      // operation stopped it, and do not mutate its lifecycle state.
      const action = this.state === 'endpoint_occupied' ? 'not_owned' : 'already_stopped'
      return { ...this.availability(), action }
    }

    this.stopPromise = this.#stopOwnedChild()
    try {
      return await this.stopPromise
    } finally {
      this.stopPromise = null
    }
  }

  async shutdown() {
    return this.stop()
  }

  async #start() {
    this.state = 'starting'
    this.failureCode = null
    this.stopRequested = false

    let port
    try {
      port = await this.portProbe({ host: MANAGED_HOST, port: this.port })
    } catch (error) {
      this.#setFailure(safeCode(error, 'port_probe_failed'))
      return { ...this.availability(), action: 'failed' }
    }
    if (port?.available !== true) {
      this.#setFailure(port?.code === 'endpoint_occupied' || port?.code === 'EADDRINUSE' ? 'endpoint_occupied' : 'port_probe_failed')
      return { ...this.availability(), action: 'failed' }
    }

    const password = asBase64Url(this.randomBytesImpl(32))
    const args = ['serve', '--hostname', MANAGED_HOST, '--port', String(this.port)]
    let child

    try {
      child = this.spawnImpl(this.command, args, {
        cwd: this.cwd,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...this.environment, OPENCODE_PASSWORD: password },
      })
    } catch (error) {
      this.#clearOwnership()
      this.#setFailure(safeCode(error))
      return { ...this.availability(), action: 'failed' }
    }

    if (!child || typeof child.on !== 'function') {
      this.#clearOwnership()
      this.#setFailure('spawn_invalid')
      return { ...this.availability(), action: 'failed' }
    }

    this.child = child
    this.password = password
    this.exitDeferred = defer()
    attachDrain(child.stdout)
    attachDrain(child.stderr)
    child.on('error', error => this.#onChildError(child, error))
    child.on('exit', (code, signal) => this.#onChildExit(child, code, signal))

    const deadline = this.now() + this.readinessTimeoutMs
    let lastError = null
    while (this.child === child && this.state === 'starting') {
      let probe
      try {
        probe = await Promise.race([
          Promise.resolve()
            .then(() => this.readinessProbe({ url: this.url, password }))
            .then(value => ({ kind: 'ready', value }), error => ({ kind: 'error', error })),
          this.exitDeferred.promise.then(() => ({ kind: 'exited' })),
        ])
        if (probe.kind === 'exited') break
        if (probe.kind === 'error') throw probe.error
        if (this.child !== child || this.state !== 'starting') break
        this.state = 'ready'
        this.failureCode = null
        return { ...this.availability(), action: 'started' }
      } catch (error) {
        lastError = error
        if (this.child !== child || this.state !== 'starting') break
        if (this.now() >= deadline || !this.#isRetryableReadinessError(error)) break
        await this.waitImpl(this.readinessIntervalMs)
      }
    }

    if (this.state === 'endpoint_occupied') return { ...this.availability(), action: 'failed' }
    if (this.child === child && this.state === 'starting') {
      this.#setFailure(safeCode(lastError, 'readiness_failed'))
      await this.#terminateAfterFailedStart(child)
    }
    return { ...this.availability(), action: 'failed' }
  }

  async #defaultReadinessProbe({ url, password }) {
    let response
    try {
      response = await this.fetchImpl(`${url}/api/info`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: basicAuthorization(password),
        },
      })
    } catch {
      throw new ManagedOpenCodeServerError('Managed OpenCode server is not ready', { code: 'server_unreachable' })
    }

    if (response.status === 401) {
      throw new ManagedOpenCodeServerError('Managed OpenCode server rejected its credential', { code: 'readiness_auth_failed', status: 401 })
    }
    if (!response.ok) {
      throw new ManagedOpenCodeServerError('Managed OpenCode server is not ready', { code: 'server_not_ready', status: response.status })
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      throw new ManagedOpenCodeServerError('Managed OpenCode server returned invalid JSON', { code: 'server_invalid_response', status: response.status })
    }
    if (!payload || typeof payload !== 'object' || typeof payload.version !== 'string') {
      throw new ManagedOpenCodeServerError('Managed OpenCode server returned an invalid info response', { code: 'server_invalid_response', status: response.status })
    }
    return payload
  }

  #isRetryableReadinessError(error) {
    return ['server_unreachable', 'server_not_ready'].includes(error?.code)
  }

  #onChildError(child, error) {
    if (this.child !== child) return
    const code = safeCode(error)
    // A child-process `error` signals failure to spawn/communicate with the
    // process. It is never ownership of an already-running endpoint. Clear it
    // before publishing the collision state so Stop can never kill/adopt a
    // foreign process on that port.
    this.#clearOwnership()
    this.#setFailure(code)
  }

  #onChildExit(child) {
    if (this.child !== child) return
    const wasRequested = this.stopRequested
    this.#clearOwnership()
    if (wasRequested) {
      if (!this.failureCode) {
        this.state = 'stopped'
        this.failureCode = null
      }
    } else if (this.state !== 'endpoint_occupied' && !this.failureCode) {
      this.#setFailure('process_exited')
    }
  }

  async #terminateAfterFailedStart(child) {
    if (this.child !== child) return
    this.stopRequested = true
    this.password = null
    try {
      const killed = child.kill?.('SIGTERM')
      if (killed === false && this.child === child) return this.#setFailure('stop_failed')
    } catch {
      return this.#setFailure('stop_failed')
    }
    const exited = await this.#waitForExit(child, this.stopTimeoutMs)
    if (exited || this.child !== child) return

    // Readiness can fail after a process has bound its port. Apply the same
    // owned-only escalation used by explicit Stop so a broken start cannot
    // strand an OpenCode child after its backend owner gives up.
    try {
      const forceKilled = child.kill?.('SIGKILL')
      if (forceKilled === false && this.child === child) return this.#setFailure('stop_failed')
    } catch {
      return this.#setFailure('stop_failed')
    }
    const forceExited = await this.#waitForExit(child, this.forceStopTimeoutMs)
    if (!forceExited && this.child === child) this.#setFailure('stop_timeout')
  }

  async #stopOwnedChild() {
    const child = this.child
    this.stopRequested = true
    // Do not let an in-flight caller use credentials after the user selected
    // Stop, even before the process reports its exit.
    this.password = null
    try {
      const killed = child.kill?.('SIGTERM')
      if (killed === false && this.child === child) {
        this.#setFailure('stop_failed')
        return { ...this.availability(), action: 'failed' }
      }
    } catch {
      this.#setFailure('stop_failed')
      return { ...this.availability(), action: 'failed' }
    }

    const exited = await this.#waitForExit(child, this.stopTimeoutMs)
    if (!exited && this.child === child) {
      // A child that ignores SIGTERM would otherwise survive backend shutdown
      // and leave the configured port occupied. Escalate only while the exact
      // child is still owned; external processes are never signalled.
      try {
        const forceKilled = child.kill?.('SIGKILL')
        if (forceKilled === false && this.child === child) {
          this.#setFailure('stop_failed')
          return { ...this.availability(), action: 'failed' }
        }
      } catch {
        this.#setFailure('stop_failed')
        return { ...this.availability(), action: 'failed' }
      }
      const forceExited = await this.#waitForExit(child, this.forceStopTimeoutMs)
      if (!forceExited && this.child === child) {
        this.#setFailure('stop_timeout')
        return { ...this.availability(), action: 'failed' }
      }
    }
    return { ...this.availability(), action: 'stopped' }
  }

  async #waitForExit(child, timeoutMs) {
    if (this.child !== child) return true
    const timeout = this.waitImpl(timeoutMs).then(() => false)
    const exited = this.exitDeferred?.promise.then(() => true) || Promise.resolve(this.child !== child)
    return Promise.race([timeout, exited])
  }

  #clearOwnership() {
    const exit = this.exitDeferred
    this.child = null
    this.password = null
    this.exitDeferred = null
    exit?.resolve?.()
  }

  #setFailure(code) {
    this.failureCode = code
    this.state = code === 'endpoint_occupied' ? 'endpoint_occupied' : 'failed'
  }
}
