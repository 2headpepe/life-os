const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const V1_PROTOCOL = 'v1'
const V2_PROTOCOL = 'v2'

export class OpenCodeServerError extends Error {
  constructor(message, { code = 'opencode_server_error', status = null } = {}) {
    super(message)
    this.name = 'OpenCodeServerError'
    this.code = code
    this.status = status
  }
}

export function validateOpenCodeServerUrl(value) {
  if (!value || typeof value !== 'string') {
    throw new OpenCodeServerError('OPENCODE_SERVER_URL is required', { code: 'server_url_missing' })
  }

  let url
  try {
    url = new URL(value)
  } catch {
    throw new OpenCodeServerError('OPENCODE_SERVER_URL must be an absolute URL', { code: 'server_url_invalid' })
  }

  if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new OpenCodeServerError('OPENCODE_SERVER_URL must use a loopback HTTP(S) address', { code: 'server_url_not_loopback' })
  }
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new OpenCodeServerError('OPENCODE_SERVER_URL must not include credentials, a path, query, or fragment', { code: 'server_url_invalid' })
  }

  return url.origin
}

export function parseModelRef(value) {
  if (typeof value !== 'string') throw new OpenCodeServerError('OpenCode model is required', { code: 'model_missing' })
  const separator = value.indexOf('/')
  if (separator <= 0 || separator === value.length - 1) {
    throw new OpenCodeServerError('OpenCode model must use provider/model format', { code: 'model_invalid' })
  }
  const providerID = value.slice(0, separator)
  const modelID = value.slice(separator + 1)
  // V2 model IDs may themselves contain slashes (for example OpenRouter
  // catalog IDs); the first slash remains the provider boundary.
  if (!/^[A-Za-z0-9._-]+$/.test(providerID) || !/^[A-Za-z0-9._:/-]+$/.test(modelID)) {
    throw new OpenCodeServerError('OpenCode model contains unsupported characters', { code: 'model_invalid' })
  }
  return { providerID, modelID }
}

// OpenCode 1.x merges a session ruleset after the selected agent's rules. This
// makes `ask` stronger than build's default allow rules without turning it into
// a permanent deny: once the user attaches the same session in the TUI, they
// can explicitly decide there. Life OS deliberately never calls the permission
// reply API for sessions it creates.
export const ASK_USER_FOR_ALL_PERMISSIONS = Object.freeze([
  Object.freeze({ permission: '*', pattern: '*', action: 'ask' }),
])

export const ASK_USER_FOR_ALL_PERMISSIONS_V2 = Object.freeze([
  Object.freeze({ action: '*', resource: '*', effect: 'ask' }),
])

function normalizePermissionRules(rules) {
  if (rules === undefined) return undefined
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new OpenCodeServerError('OpenCode session permissions must be a non-empty array', { code: 'permission_invalid' })
  }
  return rules.map(rule => {
    if (!rule || typeof rule !== 'object' ||
      !['allow', 'ask', 'deny'].includes(rule.action) ||
      typeof rule.permission !== 'string' || !rule.permission ||
      typeof rule.pattern !== 'string' || !rule.pattern) {
      throw new OpenCodeServerError('Invalid OpenCode session permission rule', { code: 'permission_invalid' })
    }
    return { permission: rule.permission, pattern: rule.pattern, action: rule.action }
  })
}

function assertSessionId(sessionId) {
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9._:-]+$/.test(sessionId)) {
    throw new OpenCodeServerError('Invalid OpenCode session ID', { code: 'session_invalid' })
  }
  return sessionId
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return Object.entries(value).map(([id, model]) => ({ id, ...(model && typeof model === 'object' ? model : {}) }))
  return []
}

function providerId(provider) {
  if (!provider || typeof provider !== 'object') return null
  return provider.id || provider.providerID || provider.name || null
}

function modelId(model) {
  if (!model || typeof model !== 'object') return null
  return model.id || model.modelID || model.name || null
}

export function inspectConfiguredModel(payload, modelRef) {
  const { providerID, modelID } = typeof modelRef === 'string' ? parseModelRef(modelRef) : modelRef
  const providers = asArray(payload?.providers || payload?.all || payload?.data?.providers)
  if (providers.length === 0) return { providerID, modelID, status: 'unknown' }

  const provider = providers.find(item => providerId(item) === providerID)
  if (!provider) return { providerID, modelID, status: 'missing_provider' }

  const models = asArray(provider.models || provider.model || provider.availableModels)
  if (models.length === 0) return { providerID, modelID, status: 'unknown_model' }
  return {
    providerID,
    modelID,
    status: models.some(item => modelId(item) === modelID) ? 'available' : 'missing_model',
  }
}

// OpenCode 2.x returns a flat catalog from `/api/model`, wrapped in `{data}`.
// Keep the public inspection result identical to the legacy code so callers do
// not need to know which server generation they reached.
export function inspectConfiguredV2Model(payload, modelRef) {
  const { providerID, modelID } = typeof modelRef === 'string' ? parseModelRef(modelRef) : modelRef
  const models = asArray(payload?.data ?? payload)
  if (models.length === 0) return { providerID, modelID, status: 'unknown' }
  // `Model.Info.id` is the model ID, not its provider. Prefer V2's explicit
  // providerID over the generic legacy helper, which intentionally checks id.
  const providerModels = models.filter(model => (model?.providerID || model?.providerId || providerId(model)) === providerID)
  if (providerModels.length === 0) return { providerID, modelID, status: 'missing_provider' }
  return {
    providerID,
    modelID,
    status: providerModels.some(model => modelId(model) === modelID) ? 'available' : 'missing_model',
  }
}

async function parseResponseJson(response) {
  const text = await response.text()
  if (!text) return null
  try { return JSON.parse(text) } catch {
    throw new OpenCodeServerError('OpenCode server returned invalid JSON', { code: 'server_invalid_response', status: response.status })
  }
}

async function tryResponseJson(response) {
  const text = await response.text()
  if (!text) return { value: null, valid: true }
  try { return { value: JSON.parse(text), valid: true } } catch {
    return { value: null, valid: false }
  }
}

function eventFromBlock(block) {
  const lines = block.split(/\r?\n/)
  let name = null
  const data = []
  for (const line of lines) {
    if (line.startsWith('event:')) name = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  if (data.length === 0) return null
  const raw = data.join('\n')
  if (raw === '[DONE]') return null
  try {
    const parsed = JSON.parse(raw)
    return {
      id: parsed.id || null,
      type: parsed.type || name || 'message',
      properties: parsed.properties || parsed.data || parsed,
    }
  } catch {
    return { id: null, type: name || 'message', properties: { raw } }
  }
}

export async function* parseSseEvents(body) {
  if (!body?.getReader) throw new OpenCodeServerError('OpenCode event stream is unavailable', { code: 'events_unavailable' })
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() || ''
      for (const block of blocks) {
        const event = eventFromBlock(block)
        if (event) yield event
      }
      if (done) break
    }
    const finalEvent = eventFromBlock(buffer)
    if (finalEvent) yield finalEvent
  } finally {
    reader.releaseLock?.()
  }
}

export function eventNeedsPermission(event) {
  return /(^|\.)permission(\.|$)|permission.*(ask|request)|ask.*permission/i.test(event?.type || '')
}

function isV1Health(payload) {
  return Boolean(payload && typeof payload === 'object' && typeof payload.healthy === 'boolean')
}

function unwrapV2(payload) {
  return payload?.data && typeof payload.data === 'object' ? payload.data : payload
}

function isV2Info(payload) {
  const info = unwrapV2(payload)
  return Boolean(info && typeof info === 'object' &&
    (typeof info.version === 'string' || Number.isInteger(info.pid) || info.urls || info.paths))
}

function isV2AuthChallenge(payload) {
  const value = unwrapV2(payload)
  const message = typeof value?.message === 'string' ? value.message : ''
  const tag = typeof value?._tag === 'string' ? value._tag : ''
  return /auth|unauthor/i.test(`${tag} ${message}`)
}

function normalizeV1Model(model) {
  const ref = typeof model === 'string' ? parseModelRef(model) : model
  if (!ref?.providerID || !ref?.modelID) {
    throw new OpenCodeServerError('OpenCode session requires providerID and modelID', { code: 'model_invalid' })
  }
  return { providerID: ref.providerID, modelID: ref.modelID }
}

function normalizeV2Model(model) {
  const ref = typeof model === 'string' ? parseModelRef(model) : model
  if (!ref?.providerID || !ref?.modelID) {
    throw new OpenCodeServerError('OpenCode session requires providerID and modelID', { code: 'model_invalid' })
  }
  return { providerID: ref.providerID, id: ref.modelID, ...(ref.variant ? { variant: ref.variant } : {}) }
}

function normalizeV2PermissionRules(rules) {
  if (rules === undefined) return undefined
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new OpenCodeServerError('OpenCode session permissions must be a non-empty array', { code: 'permission_invalid' })
  }
  return rules.map(rule => {
    if (!rule || typeof rule !== 'object') {
      throw new OpenCodeServerError('Invalid OpenCode session permission rule', { code: 'permission_invalid' })
    }
    // The current bridge deliberately passes the legacy shape. Accept the
    // native v2 form as well, without weakening its effect.
    const effect = rule.effect || rule.action
    const action = rule.resource === undefined ? '*' : rule.action
    const resource = rule.resource === undefined ? '*' : rule.resource
    if (!['allow', 'ask', 'deny'].includes(effect) || typeof action !== 'string' || !action || typeof resource !== 'string' || !resource) {
      throw new OpenCodeServerError('Invalid OpenCode session permission rule', { code: 'permission_invalid' })
    }
    return { action, resource, effect }
  })
}

function normalizeV2Location(location) {
  if (location === undefined) return undefined
  if (!location || typeof location !== 'object' || typeof location.directory !== 'string' || !location.directory) {
    throw new OpenCodeServerError('OpenCode v2 session location requires a directory', { code: 'location_invalid' })
  }
  return { directory: location.directory }
}

function promptTextFromParts(parts, system) {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new OpenCodeServerError('OpenCode prompt requires parts', { code: 'prompt_invalid' })
  }
  const text = parts
    .filter(part => part?.type === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('')
    .trim()
  if (!text) throw new OpenCodeServerError('OpenCode prompt requires text', { code: 'prompt_invalid' })
  // V2 has one `text` prompt field. Preserve the existing bridge's system
  // context instead of sending the removed V1-only `system` field.
  return system ? `${system}\n\n${text}` : text
}

function normalizeV2Message(message) {
  if (!message || typeof message !== 'object') return message
  const type = message.type || message.info?.role
  if (type === 'assistant' || type === 'user') {
    return {
      info: {
        id: message.id || message.info?.id || null,
        role: type,
        ...(type === 'assistant' && message.error ? { error: message.error } : {}),
      },
      parts: (Array.isArray(message.content) ? message.content : [])
        .filter(part => part && typeof part === 'object')
        .map(part => ({ type: part.type || (typeof part.text === 'string' ? 'text' : 'unknown'), ...(typeof part.text === 'string' ? { text: part.text } : {}) })),
    }
  }
  // V2 emits a terminal idle record rather than a legacy assistant error.
  // Project failures to the shape consumed by the existing session bridge.
  if (type === 'idle' && ['failed', 'interrupted'].includes(message.outcome)) {
    return {
      info: { id: message.id || null, role: 'assistant', error: message.error || `OpenCode session ${message.outcome}` },
      parts: [],
    }
  }
  return message
}

export class OpenCodeServerClient {
  #password
  #credentialProvider
  #protocol = null

  constructor({ url, fetchImpl = globalThis.fetch, password, credentialProvider, passwordProvider } = {}) {
    this.baseUrl = validateOpenCodeServerUrl(url)
    if (typeof fetchImpl !== 'function') throw new OpenCodeServerError('Fetch implementation is required', { code: 'fetch_unavailable' })
    if (password !== undefined && (typeof password !== 'string' || !password)) {
      throw new OpenCodeServerError('OpenCode password must be a non-empty string', { code: 'server_auth_invalid' })
    }
    const provider = credentialProvider || passwordProvider
    if (provider !== undefined && typeof provider !== 'function') {
      throw new OpenCodeServerError('OpenCode credential provider must be a function', { code: 'server_auth_invalid' })
    }
    this.fetch = fetchImpl
    this.#password = password || null
    this.#credentialProvider = provider || null
  }

  authorizationHeader() {
    const credential = this.#credentialProvider ? this.#credentialProvider() : this.#password
    const password = typeof credential === 'string' ? credential : credential?.password
    if (password === undefined || password === null || password === '') return null
    if (typeof password !== 'string') {
      throw new OpenCodeServerError('OpenCode credential provider returned an invalid value', { code: 'server_auth_invalid' })
    }
    return `Basic ${Buffer.from(`opencode:${password}`, 'utf8').toString('base64')}`
  }

  headers(extra = {}) {
    const authorization = this.authorizationHeader()
    return { Accept: 'application/json', ...(authorization ? { Authorization: authorization } : {}), ...extra }
  }

  async rawRequest(pathname, { method = 'GET', body, signal, headers } = {}) {
    try {
      return await this.fetch(`${this.baseUrl}${pathname}`, {
        method,
        signal,
        headers: this.headers({ ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
    } catch (error) {
      if (error instanceof OpenCodeServerError) throw error
      throw new OpenCodeServerError('OpenCode server is unreachable', { code: 'server_unreachable' })
    }
  }

  async request(pathname, options = {}) {
    const response = await this.rawRequest(pathname, options)
    if (!response.ok) {
      if (response.status === 401) {
        throw new OpenCodeServerError('OpenCode server authentication is required', { code: 'server_auth_required', status: response.status })
      }
      throw new OpenCodeServerError(`OpenCode server returned HTTP ${response.status}`, { code: 'server_http_error', status: response.status })
    }
    return response
  }

  async detectProtocol({ signal, force = false } = {}) {
    if (!force && this.#protocol) return this.#protocol

    // V2 serves its Web SPA for the legacy path, so an HTML response here is
    // an expected reason to try `/api/info`, not proof of a foreign service.
    const legacyResponse = await this.rawRequest('/global/health', { signal })
    const legacy = await tryResponseJson(legacyResponse)
    if (legacyResponse.ok && legacy.valid && isV1Health(legacy.value)) {
      this.#protocol = { version: V1_PROTOCOL, health: legacy.value }
      return this.#protocol
    }

    const v2Response = await this.rawRequest('/api/info', { signal })
    const v2 = await tryResponseJson(v2Response)
    if (v2Response.status === 401 && v2.valid && isV2AuthChallenge(v2.value)) {
      throw new OpenCodeServerError('OpenCode v2 server requires authentication', { code: 'server_v2_auth_required', status: 401 })
    }
    if (v2Response.ok && v2.valid && isV2Info(v2.value)) {
      this.#protocol = { version: V2_PROTOCOL, health: unwrapV2(v2.value) }
      return this.#protocol
    }
    // A service that answered the legacy probe but does not implement v2's
    // identity endpoint is not a usable OpenCode server. Do not mislabel that
    // as an OpenCode HTTP failure in the recovery UI.
    if (!v2Response.ok) {
      throw new OpenCodeServerError('OpenCode server returned an unsupported response', { code: 'server_invalid_response', status: v2Response.status })
    }
    throw new OpenCodeServerError('OpenCode server returned an unsupported response', { code: 'server_invalid_response', status: v2Response.status })
  }

  async protocol(options) {
    return (await this.detectProtocol(options)).version
  }

  async health({ signal } = {}) {
    return (await this.detectProtocol({ signal })).health
  }

  async providers({ signal } = {}) {
    const protocol = await this.protocol({ signal })
    return parseResponseJson(await this.request(protocol === V2_PROTOCOL ? '/api/provider' : '/config/providers', { signal }))
  }

  async models({ signal } = {}) {
    const protocol = await this.protocol({ signal })
    return protocol === V2_PROTOCOL
      ? parseResponseJson(await this.request('/api/model', { signal }))
      : this.providers({ signal })
  }

  async preflight(model, { signal } = {}) {
    const detected = await this.detectProtocol({ signal })
    const payload = detected.version === V2_PROTOCOL
      ? await parseResponseJson(await this.request('/api/model', { signal }))
      : await parseResponseJson(await this.request('/config/providers', { signal }))
    const inspection = detected.version === V2_PROTOCOL
      ? inspectConfiguredV2Model(payload, model)
      : inspectConfiguredModel(payload, model)
    if (inspection.status === 'missing_provider' || inspection.status === 'missing_model') {
      throw new OpenCodeServerError(`Configured OpenCode model is unavailable: ${model}`, { code: inspection.status })
    }
    return { protocol: detected.version, health: detected.health, model: inspection }
  }

  async createSession({ title, agent, model, permission, location, signal } = {}) {
    const protocol = await this.protocol({ signal })
    const body = {}
    if (title) body.title = title
    if (agent !== undefined) {
      if (typeof agent !== 'string' || !/^[A-Za-z0-9._-]+$/.test(agent)) {
        throw new OpenCodeServerError('Invalid OpenCode agent', { code: 'agent_invalid' })
      }
      body.agent = agent
    }
    if (model !== undefined) body.model = protocol === V2_PROTOCOL ? normalizeV2Model(model) : normalizeV1Model(model)
    if (protocol === V2_PROTOCOL) {
      const rules = normalizeV2PermissionRules(permission)
      if (rules) body.permissions = rules
      const normalizedLocation = normalizeV2Location(location)
      if (normalizedLocation) body.location = normalizedLocation
    } else {
      const rules = normalizePermissionRules(permission)
      if (rules) body.permission = rules
    }
    const result = await parseResponseJson(await this.request(protocol === V2_PROTOCOL ? '/api/session' : '/session', { method: 'POST', body, signal }))
    const session = protocol === V2_PROTOCOL ? unwrapV2(result) : result
    if (!session?.id) throw new OpenCodeServerError('OpenCode server did not return a session ID', { code: 'session_missing' })
    return session
  }

  async submitPromptAsync(sessionId, { model, agent = 'build', system, parts, signal } = {}) {
    assertSessionId(sessionId)
    const protocol = await this.protocol({ signal })
    if (typeof agent !== 'string' || !/^[A-Za-z0-9._-]+$/.test(agent)) throw new OpenCodeServerError('Invalid OpenCode agent', { code: 'agent_invalid' })
    if (protocol === V2_PROTOCOL) {
      if (model !== undefined) normalizeV2Model(model)
      await this.request(`/api/session/${encodeURIComponent(sessionId)}/prompt`, {
        method: 'POST', body: { text: promptTextFromParts(parts, system) }, signal,
      })
      return { accepted: true }
    }
    if (!Array.isArray(parts) || parts.length === 0) throw new OpenCodeServerError('OpenCode prompt requires parts', { code: 'prompt_invalid' })
    const body = { model: normalizeV1Model(model), agent, parts }
    if (system) body.system = system
    await this.request(`/session/${encodeURIComponent(sessionId)}/prompt_async`, { method: 'POST', body, signal })
    return { accepted: true }
  }

  async sessionStatus(sessionId, { signal } = {}) {
    assertSessionId(sessionId)
    const protocol = await this.protocol({ signal })
    if (protocol === V2_PROTOCOL) {
      const result = await parseResponseJson(await this.request('/api/session/active', { signal }))
      return unwrapV2(result)?.[sessionId] ?? { type: 'idle' }
    }
    const result = await parseResponseJson(await this.request('/session/status', { signal }))
    return result?.[sessionId] ?? null
  }

  async messages(sessionId, { limit, signal } = {}) {
    assertSessionId(sessionId)
    const protocol = await this.protocol({ signal })
    const query = Number.isInteger(limit) && limit > 0
      ? `?${protocol === V2_PROTOCOL ? 'order=asc&' : ''}limit=${limit}`
      : (protocol === V2_PROTOCOL ? '?order=asc' : '')
    const path = protocol === V2_PROTOCOL
      ? `/api/session/${encodeURIComponent(sessionId)}/message${query}`
      : `/session/${encodeURIComponent(sessionId)}/message${query}`
    const result = await parseResponseJson(await this.request(path, { signal }))
    const messages = protocol === V2_PROTOCOL ? unwrapV2(result) : result
    const list = Array.isArray(messages) ? messages : []
    return protocol === V2_PROTOCOL ? list.map(normalizeV2Message) : list
  }

  async abort(sessionId, { signal } = {}) {
    assertSessionId(sessionId)
    const protocol = await this.protocol({ signal })
    const path = protocol === V2_PROTOCOL
      ? `/api/session/${encodeURIComponent(sessionId)}/interrupt?resume=false`
      : `/session/${encodeURIComponent(sessionId)}/abort`
    const options = protocol === V2_PROTOCOL ? { method: 'POST', signal } : { method: 'POST', body: {}, signal }
    return parseResponseJson(await this.request(path, options))
  }

  async createPairing({ signal } = {}) {
    const protocol = await this.protocol({ signal })
    if (protocol !== V2_PROTOCOL) {
      throw new OpenCodeServerError('OpenCode pairing requires server v2', { code: 'pairing_unsupported' })
    }
    const result = unwrapV2(await parseResponseJson(await this.request('/api/pair', { method: 'POST', signal })))
    if (!result?.code || typeof result.code !== 'string') {
      throw new OpenCodeServerError('OpenCode server did not return a pairing code', { code: 'pairing_invalid_response' })
    }
    return {
      code: result.code,
      ...(Number.isFinite(result.expires_in) ? { expiresIn: result.expires_in } : {}),
    }
  }

  async *events({ signal } = {}) {
    const protocol = await this.protocol({ signal })
    const response = await this.request(protocol === V2_PROTOCOL ? '/api/event' : '/global/event', { signal, headers: { Accept: 'text/event-stream' } })
    yield* parseSseEvents(response.body)
  }
}
