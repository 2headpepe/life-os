const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

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
  if (separator <= 0 || separator === value.length - 1 || value.indexOf('/', separator + 1) !== -1) {
    throw new OpenCodeServerError('OpenCode model must use provider/model format', { code: 'model_invalid' })
  }
  const providerID = value.slice(0, separator)
  const modelID = value.slice(separator + 1)
  if (!/^[A-Za-z0-9._-]+$/.test(providerID) || !/^[A-Za-z0-9._:-]+$/.test(modelID)) {
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

function parseResponseJson(response) {
  return response.text().then(text => {
    if (!text) return null
    try { return JSON.parse(text) } catch {
      throw new OpenCodeServerError('OpenCode server returned invalid JSON', { code: 'server_invalid_response', status: response.status })
    }
  })
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

export class OpenCodeServerClient {
  constructor({ url, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = validateOpenCodeServerUrl(url)
    if (typeof fetchImpl !== 'function') throw new OpenCodeServerError('Fetch implementation is required', { code: 'fetch_unavailable' })
    this.fetch = fetchImpl
  }

  headers(extra = {}) {
    return { Accept: 'application/json', ...extra }
  }

  async request(pathname, { method = 'GET', body, signal, headers } = {}) {
    const response = await this.fetch(`${this.baseUrl}${pathname}`, {
      method,
      signal,
      headers: this.headers({ ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }).catch(error => {
      if (error instanceof OpenCodeServerError) throw error
      throw new OpenCodeServerError('OpenCode server is unreachable', { code: 'server_unreachable' })
    })
    if (!response.ok) throw new OpenCodeServerError(`OpenCode server returned HTTP ${response.status}`, { code: 'server_http_error', status: response.status })
    return response
  }

  async health({ signal } = {}) {
    return parseResponseJson(await this.request('/global/health', { signal }))
  }

  async providers({ signal } = {}) {
    return parseResponseJson(await this.request('/config/providers', { signal }))
  }

  async preflight(model, { signal } = {}) {
    const [health, providers] = await Promise.all([this.health({ signal }), this.providers({ signal })])
    const inspection = inspectConfiguredModel(providers, model)
    if (inspection.status === 'missing_provider' || inspection.status === 'missing_model') {
      throw new OpenCodeServerError(`Configured OpenCode model is unavailable: ${model}`, { code: inspection.status })
    }
    return { health, model: inspection }
  }

  async createSession({ title, agent, model, permission, signal } = {}) {
    const body = {}
    if (title) body.title = title
    if (agent !== undefined) {
      if (typeof agent !== 'string' || !/^[A-Za-z0-9._-]+$/.test(agent)) {
        throw new OpenCodeServerError('Invalid OpenCode agent', { code: 'agent_invalid' })
      }
      body.agent = agent
    }
    if (model !== undefined) {
      body.model = typeof model === 'string' ? parseModelRef(model) : model
      if (!body.model?.providerID || !body.model?.modelID) {
        throw new OpenCodeServerError('OpenCode session requires providerID and modelID', { code: 'model_invalid' })
      }
    }
    const rules = normalizePermissionRules(permission)
    if (rules) body.permission = rules
    const result = await parseResponseJson(await this.request('/session', { method: 'POST', body, signal }))
    if (!result?.id) throw new OpenCodeServerError('OpenCode server did not return a session ID', { code: 'session_missing' })
    return result
  }

  async submitPromptAsync(sessionId, { model, agent = 'build', system, parts, signal } = {}) {
    assertSessionId(sessionId)
    if (typeof agent !== 'string' || !/^[A-Za-z0-9._-]+$/.test(agent)) throw new OpenCodeServerError('Invalid OpenCode agent', { code: 'agent_invalid' })
    if (!Array.isArray(parts) || parts.length === 0) throw new OpenCodeServerError('OpenCode prompt requires parts', { code: 'prompt_invalid' })
    const body = { model: typeof model === 'string' ? parseModelRef(model) : model, agent, parts }
    if (!body.model?.providerID || !body.model?.modelID) throw new OpenCodeServerError('OpenCode prompt requires providerID and modelID', { code: 'model_invalid' })
    if (system) body.system = system
    await this.request(`/session/${encodeURIComponent(sessionId)}/prompt_async`, { method: 'POST', body, signal })
    return { accepted: true }
  }

  async sessionStatus(sessionId, { signal } = {}) {
    assertSessionId(sessionId)
    const result = await parseResponseJson(await this.request('/session/status', { signal }))
    return result?.[sessionId] ?? null
  }

  async messages(sessionId, { limit, signal } = {}) {
    assertSessionId(sessionId)
    const query = Number.isInteger(limit) && limit > 0 ? `?limit=${limit}` : ''
    const result = await parseResponseJson(await this.request(`/session/${encodeURIComponent(sessionId)}/message${query}`, { signal }))
    return Array.isArray(result) ? result : (result?.data || [])
  }

  async abort(sessionId, { signal } = {}) {
    assertSessionId(sessionId)
    return parseResponseJson(await this.request(`/session/${encodeURIComponent(sessionId)}/abort`, { method: 'POST', body: {}, signal }))
  }

  async *events({ signal } = {}) {
    const response = await this.request('/global/event', { signal, headers: { Accept: 'text/event-stream' } })
    yield* parseSseEvents(response.body)
  }
}
