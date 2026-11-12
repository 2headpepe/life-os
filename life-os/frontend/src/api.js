const BASE = '/api'

export const api = {
  get: (path) => fetch(`${BASE}${path}`).then(r => r.json()),
  put: (path, body) => fetch(`${BASE}${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  post: (path, body) => fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  patch: (path, body) => fetch(`${BASE}${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
}

export const spheres = {
  all: () => api.get('/tree/spheres'),
}


export const people = {
  all: () => api.get('/people'),
  get: (id) => api.get(`/people/${id}`),
}

export const lists = {
  index: () => api.get('/content/lists/_index.json'),
  get: (name) => api.get(`/content/lists/${name}.json`),
  add: (list, item) => api.post(`/lists/${list}`, item),
  update: (list, id, patch) => api.patch(`/lists/${list}/${id}`, patch),
}

export const events = {
  all: () => api.get('/content/events/index.json'),
  add: (event) => api.post('/events', event),
  update: (id, patch) => api.patch(`/events/${id}`, patch),
  delete: (id) => fetch(`/api/events/${id}`, { method: 'DELETE' }).then(r => r.json()),
}

export const habits = {
  definitions: () => api.get('/content/habits/definitions.json'),
  log: (date) => api.get(`/content/habits/log/${date}.json`),
  saveLog: (date, log) => api.put(`/content/habits/log/${date}.json`, log),
  saveDefinitions: (defs) => api.put('/content/habits/definitions.json', defs),
}

export const inbox = {
  all: () => api.get('/content/inbox/current.json'),
  add: (text, tags = []) => api.post('/inbox', { text, tags }),
  delete: (id) => fetch(`/api/inbox/${id}`, { method: 'DELETE' }).then(r => r.json()),
}


export const tree = {
  all:    ()          => api.get('/tree'),
  leaves: ()          => api.get('/tree/leaves'),
  create: (node)      => api.post('/tree', node),
  add:    (node)      => api.post('/tree', node),
  update: (id, patch) => api.patch(`/tree/${id}`, patch),
  delete: (id)        => fetch(`/api/tree/${id}`, { method: 'DELETE' }).then(r => r.json()),
  createDependency: (id, payload) => api.post(`/tree/${id}/dependencies`, payload),
  eligibleExistingDependencies: (id) => api.get(`/tree/${id}/eligible-existing-dependencies`),
  linkExistingDependency: (id, dependency_id) => api.post(`/tree/${id}/existing-dependencies`, { dependency_id }),
  saveHandoff: (id, handoff_contract) => api.patch(`/tree/${id}/handoff-contract`, { handoff_contract }),
  verify: (id, payload) => api.post(`/tree/${id}/verification`, payload),
}

export const focus = {
  get: () => api.get('/focus'),
  action: (component_id, action, payload = {}) => api.post('/focus/action', { component_id, action, ...payload }),
}

export const config = {
  get: () => api.get('/config'),
}

export const profile = {
  get: () => api.get('/profile'),
  update: (data) => fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
}

export const insights = {
  all: () => api.get('/insights'),
  add: (insight) => api.post('/insights', insight),
  update: (id, patch) => api.patch(`/insights/${id}`, patch),
}

export const news = {
  all:      ()          => api.get('/news'),
  add:      (items)     => api.post('/news', { items }),
  update:   (id, patch) => api.patch(`/news/${id}`, patch),
  sources: {
    all:    ()          => api.get('/news/sources'),
    add:    (source)    => api.post('/news/sources', source),
    update: (id, patch) => api.patch(`/news/sources/${id}`, patch),
    delete: (id)        => fetch(`/api/news/sources/${id}`, { method: 'DELETE' }).then(r => r.json()),
  },
}

export const pulse = {
  get: () => api.get('/pulse'),
  ack: (type, sphere, id, snooze_days = null) => api.post('/pulse/ack', { type, sphere, id, ...(snooze_days ? { snooze_days } : {}) }),
}

export const context = {
  get: () => api.get('/context'),
}

export const search = {
  query: (q) => api.get(`/search?q=${encodeURIComponent(q)}`),
}

export const calendars = {
  all:    ()          => api.get('/calendars'),
  add:    (cal)       => api.post('/calendars', cal),
  update: (id, patch) => api.patch(`/calendars/${id}`, patch),
  delete: (id)        => fetch(`/api/calendars/${id}`, { method: 'DELETE' }).then(r => r.json()),
}

export const sync = {
  status: () => api.get('/sync/status'),
  push: () => api.post('/sync/push', {}),
  calendars: () => api.get('/sync/calendars'),
}

export const feed = {
  all: () => api.get(`/feed?_t=${Date.now()}`),
  reactions: () => api.get('/feed/reactions'),
  react: (ref, type, extra) => api.post('/feed/reactions', { ref, type, ...extra }),
  noteProcess: (ref, text, cardType) => api.post('/feed/note-process', { ref, text, card_type: cardType }),
  noteJobs: () => api.get('/feed/note-jobs'),
  aiStatus: () => api.get('/feed/ai-status'),
  aiGenerate: (force = false) => api.post('/feed/ai-generate', { force }),
}

export const ai = {
  ensureOpenCode: async () => {
    const runtime = await api.get('/config')
    if (runtime.aiRuntime !== 'opencode') return runtime
    const server = runtime.openCodeServer || {}
    if (server.available && (server.state || server.status) === 'ready') return runtime
    const started = await api.post('/ai/opencode-server/start', {})
    if (started.error) throw new Error(started.error)
    return started
  },
  chat: async (messages, system, { sessionId, prompt } = {}) => {
    await ai.ensureOpenCode()
    return api.post('/ai/chat', {
    messages,
    ...(system ? { system } : {}),
    ...(sessionId ? { session_id: sessionId } : {}),
    ...(prompt ? { prompt } : {}),
    })
  },
  session: (id) => api.get(`/ai/sessions/${encodeURIComponent(id)}`),
  abortSession: (id) => api.post(`/ai/sessions/${encodeURIComponent(id)}/abort`, {}),
  // Legacy v1 can retain the original local terminal attach. V2 deliberately
  // uses native navigation: its one-time pairing URL must never be exposed to
  // Life OS JavaScript, rendered in the UI, or retained in state.
  openSession: (id, { legacyTerminal = false } = {}) => {
    if (legacyTerminal) return api.post(`/ai/sessions/${encodeURIComponent(id)}/open`, {})
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = `/api/ai/sessions/${encodeURIComponent(id)}/open`
    form.target = '_blank'
    form.rel = 'noopener'
    form.style.display = 'none'
    document.body.appendChild(form)
    form.submit()
    window.setTimeout(() => form.remove(), 0)
    return { opened: true }
  },
  startOpenCodeServer: () => api.post('/ai/opencode-server/start', {}),
  stopOpenCodeServer: () => api.post('/ai/opencode-server/stop', {}),
  run: async (task, params = {}) => {
    await ai.ensureOpenCode()
    return fetch('/api/ai/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, params }),
    }).then(r => r.json())
  },
}

export const aiReviews = {
  all: () => api.get('/ai-reviews'),
  action: (action, target_ref) => api.post('/product-intelligence/review-actions', { action, target_ref }),
  reminder: (action, candidate_set_checksum) => api.post('/product-intelligence/priority-loop/reminder', { action, candidate_set_checksum }),
  recheck: (action, delivery_task_id, candidate_set_checksum) => api.post('/product-intelligence/priority-loop/recheck-drafts', { action, delivery_task_id, candidate_set_checksum }),
  createInitiative: (payload) => api.post('/product-intelligence/initiatives', payload),
  createWorkItem: (initiativeId, payload) => api.post(`/product-intelligence/initiatives/${initiativeId}/work-items`, payload),
}

export const productIntelligence = aiReviews

export const memories = {
  all: (date = null) => api.get(date ? `/memories?date=${date}` : '/memories'),
  add: (entry) => api.post('/memories', entry),
  update: (id, patch) => api.patch(`/memories/${id}`, patch),
  delete: (id) => fetch(`/api/memories/${id}`, { method: 'DELETE' }).then(r => r.json()),
  uploadPhotos: (id, files) => {
    const formData = new FormData()
    for (const f of files) formData.append('photos', f)
    return fetch(`/api/memories/${id}/photos`, { method: 'POST', body: formData })
      .then(r => r.json())
  },
  mediaUrl: (filename) => `/api/memories/photos/${filename}`,
}
