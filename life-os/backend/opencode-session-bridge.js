import { promptFromMessages } from './ai-runtime.js'
import {
  ASK_USER_FOR_ALL_PERMISSIONS,
  ASK_USER_FOR_ALL_PERMISSIONS_V2,
  OpenCodeServerClient,
  OpenCodeServerError,
  eventNeedsPermission,
  parseModelRef,
  validateOpenCodeServerUrl,
} from './opencode-server.js'

const SESSION_ID = /^[A-Za-z0-9._:-]+$/
const PREFLIGHT_TIMEOUT_MS = 4_000
const EMPTY_RESPONSE_GRACE_MS = 10_000
const STALL_TIMEOUT_MS = 120_000
export const LIFE_OS_OPENCODE_MODEL = 'assistant/assistant'

export class LifeOsOpenCodeSessionError extends Error {
  constructor(message, { code = 'opencode_session_error', cause } = {}) {
    super(message, cause ? { cause } : undefined)
    this.name = 'LifeOsOpenCodeSessionError'
    this.code = code
  }
}

function safeSessionId(value) {
  if (!SESSION_ID.test(value || '')) {
    throw new LifeOsOpenCodeSessionError('Invalid OpenCode session ID', { code: 'session_invalid' })
  }
  return value
}

function statusType(status) {
  if (typeof status === 'string') return status
  if (status && typeof status === 'object' && typeof status.type === 'string') return status.type
  return 'unknown'
}

function assistantMessages(messages) {
  return messages
    // OpenCode 1.x returns `{ info: { role }, parts }`; v2 returns a direct
    // session message with `type: "assistant"` and `content` blocks. Keep a
    // single normalized bridge record so polling/recovery does not depend on
    // the server generation.
    .filter(message => (message?.info?.role || message?.role || message?.type) === 'assistant')
    .map((message, index) => ({
      id: message.info?.id || message?.id || null,
      index,
      text: (message.parts || message.content || [])
        .filter(part => part?.type === 'text' && typeof part.text === 'string')
        .map(part => part.text)
        .join('')
        .trim(),
      error: message.info?.error || message?.error || null,
    }))
}

function assistantTextSince(messages, record) {
  const assistants = assistantMessages(messages)
  const baselineIds = record.assistantBaselineIds || new Set()
  const baselineCount = record.assistantBaselineCount || 0
  const currentTurn = assistants.filter((message, index) => message.id
    ? !baselineIds.has(message.id)
    : index >= baselineCount)
  return currentTurn.at(-1)?.text || null
}

function sessionMessageError(messages, record) {
  const assistants = assistantMessages(messages)
  const baselineIds = record.assistantBaselineIds || new Set()
  const baselineCount = record.assistantBaselineCount || 0
  const assistant = assistants.filter((message, index) => message.id
    ? !baselineIds.has(message.id)
    : index >= baselineCount).at(-1)
  if (!assistant?.error) return null
  const error = assistant.error
  if (typeof error === 'string') return error.slice(0, 300)
  if (typeof error?.message === 'string') return error.message.slice(0, 300)
  return 'OpenCode session failed'
}

function eventSessionId(event) {
  const data = event?.properties || {}
  return data.sessionID || data.sessionId || data.session?.id || data.id || null
}

function eventStatus(event) {
  const data = event?.properties || {}
  return data.status || data.session?.status || null
}

function errorCode(error) {
  return error instanceof OpenCodeServerError || error instanceof LifeOsOpenCodeSessionError
    ? error.code
    : 'opencode_server_error'
}

function withTimeout(timeoutMs = PREFLIGHT_TIMEOUT_MS) {
  return AbortSignal.timeout(timeoutMs)
}

export function openCodePublicConfig(runtime) {
  if (runtime?.runtime !== 'opencode') return null
  const modelMatches = runtime.model === LIFE_OS_OPENCODE_MODEL
  return {
    configured: modelMatches,
    available: false,
    model: runtime.model || null,
    agent: runtime.agent || 'build',
    reason: !runtime.model ? 'model_missing' : (modelMatches ? null : 'model_not_allowed'),
  }
}

export function openCodeServeCommand(runtime) {
  if (runtime?.runtime !== 'opencode' || !runtime.command) {
    throw new LifeOsOpenCodeSessionError('OpenCode runtime is required', { code: 'runtime_not_opencode' })
  }
  // OpenCode 1.18 defaults `serve --port` to 0 (an ephemeral port). Life OS
  // must instead start the exact endpoint that its bridge will subsequently
  // probe and attach to; otherwise the UI can talk to an unrelated process on
  // OPENCODE_SERVER_URL or simply never find the server.
  const server = new URL(validateOpenCodeServerUrl(runtime.serverUrl))
  if (server.protocol !== 'http:') {
    throw new LifeOsOpenCodeSessionError('Life OS can launch only an HTTP OpenCode server', { code: 'server_url_launch_unsupported' })
  }
  if (!server.port || server.port === '0') {
    throw new LifeOsOpenCodeSessionError('OPENCODE_SERVER_URL must include a fixed non-zero port to launch OpenCode', { code: 'server_url_port_required' })
  }
  // URL.hostname retains brackets for an IPv6 literal, while the CLI expects
  // the unbracketed host value passed to --hostname.
  const hostname = server.hostname.replace(/^\[|\]$/g, '')
  return `${runtime.command} serve --hostname ${hostname} --port ${server.port}`
}

export function openCodeAttachCommand(runtime, sessionId) {
  if (runtime?.runtime !== 'opencode' || !runtime.command) {
    throw new LifeOsOpenCodeSessionError('OpenCode runtime is required', { code: 'runtime_not_opencode' })
  }
  safeSessionId(sessionId)
  // Validation makes the interpolation below safe and also guarantees that the
  // terminal attaches only to the same local server Life OS proxies.
  const serverUrl = validateOpenCodeServerUrl(runtime.serverUrl)
  return `${runtime.command} attach ${serverUrl} --session ${sessionId}`
}

export class LifeOsOpenCodeSessionBridge {
  constructor({ runtime, clientFactory, credentialProvider, workingDirectory, now = () => Date.now(), log = console } = {}) {
    if (typeof runtime !== 'function') throw new Error('runtime must be a function')
    this.runtime = runtime
    this.credentialProvider = credentialProvider || (() => null)
    this.workingDirectory = workingDirectory || null
    this.clientFactory = clientFactory || (config => new OpenCodeServerClient({
      url: config.serverUrl,
      credentialProvider: this.credentialProvider,
    }))
    this.now = now
    this.log = log
    this.sessions = new Map()
    this.eventAbortController = null
    this.eventPumpRunning = false
    this.eventReconnectTimer = null
  }

  config() {
    const config = this.runtime()
    if (config.runtime !== 'opencode') {
      throw new LifeOsOpenCodeSessionError('OpenCode session bridge is unavailable for this runtime', { code: 'runtime_not_opencode' })
    }
    if (!config.model) {
      throw new LifeOsOpenCodeSessionError('OPENCODE_MODEL must use provider/model format', { code: 'model_missing' })
    }
    if (config.model !== LIFE_OS_OPENCODE_MODEL) {
      throw new LifeOsOpenCodeSessionError(`Life OS OpenCode sessions require ${LIFE_OS_OPENCODE_MODEL}`, { code: 'model_not_allowed' })
    }
    parseModelRef(config.model)
    return config
  }

  client(config = this.config()) {
    return this.clientFactory(config)
  }

  async preflight() {
    const config = this.config()
    const result = await this.client(config).preflight(config.model, { signal: withTimeout() })
    return {
      configured: true,
      available: true,
      model: config.model,
      agent: config.agent,
      version: result.health?.version || null,
      modelStatus: result.model?.status || 'unknown',
    }
  }

  async availability() {
    let base
    try {
      base = openCodePublicConfig(this.runtime())
    } catch (error) {
      return { configured: false, available: false, reason: errorCode(error) }
    }
    if (!base?.configured) return base
    try {
      return await this.preflight()
    } catch (error) {
      return { ...base, available: false, reason: errorCode(error) }
    }
  }

  getRecord(sessionId) {
    safeSessionId(sessionId)
    const record = this.sessions.get(sessionId)
    if (!record) {
      throw new LifeOsOpenCodeSessionError('This OpenCode session was not created by the current Life OS server', { code: 'session_unknown' })
    }
    return record
  }

  async start({ messages, system, title = 'Life OS chat' } = {}) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new LifeOsOpenCodeSessionError('messages required', { code: 'messages_missing' })
    }
    const config = this.config()
    const client = this.client(config)
    const preflight = await client.preflight(config.model, { signal: withTimeout() })
    const session = await client.createSession({
      title,
      agent: config.agent,
      model: config.model,
      permission: preflight.protocol === 'v2'
        ? ASK_USER_FOR_ALL_PERMISSIONS_V2
        : ASK_USER_FOR_ALL_PERMISSIONS,
      ...(this.workingDirectory ? { location: { directory: this.workingDirectory } } : {}),
      signal: withTimeout(),
    })
    const now = this.now()
    const record = {
      id: session.id,
      createdAt: now,
      submittedAt: now,
      updatedAt: now,
      model: config.model,
      agent: config.agent,
      // The server generation is resolved before the session is created and
      // remains part of its handoff contract. Legacy v1 can safely attach via
      // its local CLI; v2 must use a short-lived browser pairing capability.
      protocol: preflight.protocol === 'v2' ? 'v2' : 'v1',
      permissionRequired: false,
      cancelRequestedAt: null,
      error: null,
      assistantBaselineIds: new Set(),
      assistantBaselineCount: 0,
      lastState: 'running',
    }
    this.sessions.set(session.id, record)
    // Start the global event subscription before accepting the asynchronous
    // prompt. Polling remains the source of truth, but this narrows the window
    // in which an immediate OpenCode permission request could be missed.
    this.ensureEventPump()
    try {
      await client.submitPromptAsync(session.id, {
        model: config.model,
        agent: config.agent,
        parts: [{ type: 'text', text: promptFromMessages(messages, system) }],
        signal: withTimeout(),
      })
    } catch (error) {
      this.sessions.delete(session.id)
      if (!this.hasLiveSessions()) this.stopEventPump()
      throw error
    }
    return this.publicRecord(record, 'running')
  }

  async continue(sessionId, { prompt, system } = {}) {
    const record = this.getRecord(sessionId)
    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw new LifeOsOpenCodeSessionError('A continuation prompt is required', { code: 'prompt_missing' })
    }
    const config = this.config()
    if (record.model !== config.model || record.agent !== config.agent) {
      throw new LifeOsOpenCodeSessionError('Configured OpenCode model changed; create a new chat session', { code: 'session_model_changed' })
    }
    const client = this.client(config)
    const priorMessages = await client.messages(sessionId, { limit: 100, signal: withTimeout() })
    const priorAssistantMessages = assistantMessages(priorMessages)
    record.assistantBaselineIds = new Set(priorAssistantMessages.map(message => message.id).filter(Boolean))
    record.assistantBaselineCount = priorAssistantMessages.length
    record.permissionRequired = false
    record.error = null
    record.cancelRequestedAt = null
    // A completed/failed prior turn stops the best-effort event pump. Reset
    // this before submitting the next turn so permission events for the same
    // attached session can be observed again.
    record.lastState = 'running'
    record.submittedAt = this.now()
    record.updatedAt = record.submittedAt
    this.ensureEventPump()
    try {
      await client.submitPromptAsync(sessionId, {
        model: config.model,
        agent: config.agent,
        system,
        parts: [{ type: 'text', text: prompt.trim() }],
        signal: withTimeout(),
      })
    } catch (error) {
      record.lastState = 'failed'
      if (!this.hasLiveSessions()) this.stopEventPump()
      throw error
    }
    return this.publicRecord(record, 'running')
  }

  async inspect(sessionId) {
    const record = this.getRecord(sessionId)
    const config = this.config()
    const client = this.client(config)
    const [status, messages] = await Promise.all([
      client.sessionStatus(sessionId, { signal: withTimeout() }),
      client.messages(sessionId, { limit: 100, signal: withTimeout() }),
    ])
    const now = this.now()
    const type = statusType(status)
    const text = assistantTextSince(messages, record)
    const messageError = sessionMessageError(messages, record)
    record.updatedAt = now
    record.lastStatus = type
    if (messageError) record.error = { code: 'session_error', message: messageError }

    let state = 'running'
    if (record.cancelRequestedAt) {
      state = 'cancelled'
    } else if (record.error) {
      state = 'failed'
    } else if ((type === 'idle' || type === 'unknown') && text) {
      state = 'completed'
      record.permissionRequired = false
    } else if (record.permissionRequired) {
      state = 'permission_required'
    } else if (now - record.submittedAt >= STALL_TIMEOUT_MS) {
      state = 'needs_attention'
    } else if (type === 'idle' && now - record.submittedAt >= EMPTY_RESPONSE_GRACE_MS) {
      state = 'failed'
      record.error = { code: 'empty_response', message: 'OpenCode finished without an assistant response' }
    } else if (type === 'retry') {
      state = 'needs_attention'
    }
    record.lastState = state
    if (!this.hasLiveSessions()) this.stopEventPump()
    return this.publicRecord(record, state, { text, status: type })
  }

  async abort(sessionId) {
    const record = this.getRecord(sessionId)
    await this.client(this.config()).abort(sessionId, { signal: withTimeout() })
    record.cancelRequestedAt = this.now()
    record.updatedAt = record.cancelRequestedAt
    record.lastState = 'cancelled'
    if (!this.hasLiveSessions()) this.stopEventPump()
    return this.publicRecord(record, 'cancelled')
  }

  async createPairing(sessionId) {
    // A pairing capability is only minted for a session that this Life OS
    // backend created. The caller must redirect immediately and must never
    // serialize the returned code into application state or analytics.
    this.getRecord(sessionId)
    const config = this.config()
    return this.client(config).createPairing({ signal: withTimeout() })
  }

  publicRecord(record, state, extra = {}) {
    const canOpen = ['running', 'permission_required', 'needs_attention', 'failed'].includes(state)
    const legacyTerminal = canOpen && record.protocol === 'v1'
    return {
      session_id: record.id,
      state,
      model: record.model,
      agent: record.agent,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
      permission_required: state === 'permission_required',
      can_open_opencode: canOpen,
      // External v1 stays compatible with the original explicit terminal
      // attach. Only v2 uses browser pairing, so no managed server password
      // can ever be assembled into a terminal command.
      can_open_terminal: legacyTerminal,
      opencode_handoff: record.protocol === 'v1' ? 'terminal' : 'pairing',
      can_cancel: ['running', 'permission_required', 'needs_attention'].includes(state),
      ...(record.error ? { error: record.error.message, code: record.error.code } : {}),
      ...extra,
    }
  }

  applyEvent(event) {
    const sessionId = eventSessionId(event)
    if (!sessionId || !this.sessions.has(sessionId)) return
    const record = this.sessions.get(sessionId)
    record.updatedAt = this.now()
    const type = event?.type || ''
    if (eventNeedsPermission(event)) record.permissionRequired = true
    if (/permission\.(replied|resolved|approved|rejected|removed|updated)/i.test(type)) record.permissionRequired = false
    if (/session\.error|session\.failed/i.test(type)) {
      record.error = { code: 'session_error', message: 'OpenCode reported a session error' }
    }
    const status = eventStatus(event)
    if (status) record.lastStatus = statusType(status)
  }

  hasLiveSessions() {
    return [...this.sessions.values()].some(record => !['completed', 'failed', 'cancelled'].includes(record.lastState || 'running'))
  }

  ensureEventPump() {
    if (!this.hasLiveSessions() || this.eventPumpRunning || this.eventReconnectTimer) return
    const config = this.config()
    const controller = new AbortController()
    this.eventAbortController = controller
    this.eventPumpRunning = true
    ;(async () => {
      try {
        for await (const event of this.client(config).events({ signal: controller.signal })) this.applyEvent(event)
      } catch (error) {
        if (!controller.signal.aborted) this.log.warn?.('[opencode/events] disconnected', { code: errorCode(error) })
      } finally {
        // stopEventPump may have already installed a replacement controller for
        // an immediately continued session. An old generator must not clear or
        // suppress that replacement when its abort settles asynchronously.
        if (this.eventAbortController !== controller) return
        this.eventPumpRunning = false
        this.eventAbortController = null
        if (!controller.signal.aborted && this.hasLiveSessions()) {
          this.eventReconnectTimer = setTimeout(() => {
            this.eventReconnectTimer = null
            this.ensureEventPump()
          }, 1_000)
          this.eventReconnectTimer.unref?.()
        }
      }
    })()
  }

  stopEventPump() {
    const controller = this.eventAbortController
    // Reset synchronously. A continuation may be submitted in the same turn
    // that an idle result stops the old stream, so it must be able to create a
    // fresh subscription before the old generator reaches `finally`.
    this.eventAbortController = null
    this.eventPumpRunning = false
    controller?.abort()
    if (this.eventReconnectTimer) clearTimeout(this.eventReconnectTimer)
    this.eventReconnectTimer = null
  }
}
