import { trackMutation } from './analytics'

const BASE = '/api'

async function request(path, method = 'GET', body, outcomeCategory = null) {
  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
    if (method !== 'GET') trackMutation(method, path, 'success', outcomeCategory)
    return data
  } catch (error) {
    if (method !== 'GET') trackMutation(method, path, 'failed', outcomeCategory)
    throw error
  }
}

function localDate() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export const api = {
  get: (path) => request(path),
  put: (path, body, outcomeCategory = null) => request(path, 'PUT', body, outcomeCategory),
  post: (path, body, outcomeCategory = null) => request(path, 'POST', body, outcomeCategory),
  patch: (path, body, outcomeCategory = null) => request(path, 'PATCH', body, outcomeCategory),
  delete: (path, outcomeCategory = null) => request(path, 'DELETE', undefined, outcomeCategory),
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
  add: (list, item, outcomeCategory = null) => api.post(`/lists/${list}`, item, outcomeCategory),
  update: (list, id, patch) => api.patch(`/lists/${list}/${id}`, patch),
}

export const events = {
  all: () => api.get('/content/events/index.json'),
  add: (event) => api.post('/events', event),
  update: (id, patch) => api.patch(`/events/${id}`, patch),
  delete: (id) => api.delete(`/events/${id}`),
}

export const habits = {
  definitions: () => api.get('/content/habits/definitions.json'),
  log: (date) => api.get(`/content/habits/log/${date}.json`),
  saveLog: (date, log, outcomeCategory = null) => api.put(`/content/habits/log/${date}.json`, log, outcomeCategory),
  saveDefinitions: (defs) => api.put('/content/habits/definitions.json', defs),
}

export const inbox = {
  all: () => api.get('/content/inbox/current.json'),
  add: (text, tags = [], outcomeCategory = null) => api.post('/inbox', { text, tags }, outcomeCategory),
  delete: (id) => api.delete(`/inbox/${id}`),
}


export const tree = {
  all:    ()          => api.get('/tree'),
  leaves: ()          => api.get('/tree/leaves'),
  create: (node, outcomeCategory = null)      => api.post('/tree', node, outcomeCategory),
  add:    (node, outcomeCategory = null)      => api.post('/tree', node, outcomeCategory),
  update: (id, patch, outcomeCategory = null) => api.patch(`/tree/${id}`, patch, outcomeCategory),
  delete: (id)        => api.delete(`/tree/${id}`),
  createDependency: (id, payload, outcomeCategory = 'task_progress') => api.post(`/tree/${id}/dependencies`, payload, outcomeCategory),
  eligibleExistingDependencies: (id) => api.get(`/tree/${id}/eligible-existing-dependencies`),
  linkExistingDependency: (id, dependency_id, outcomeCategory = 'task_progress') => api.post(`/tree/${id}/existing-dependencies`, { dependency_id }, outcomeCategory),
  saveHandoff: (id, handoff_contract, outcomeCategory = 'task_progress') => api.patch(`/tree/${id}/handoff-contract`, { handoff_contract }, outcomeCategory),
  verify: (id, payload) => api.post(`/tree/${id}/verification`, payload),
}

export const config = {
  get: () => api.get('/config'),
}

export const insights = {
  all: () => api.get('/insights'),
  add: (insight, outcomeCategory = null) => api.post('/insights', insight, outcomeCategory),
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
    delete: (id)        => api.delete(`/news/sources/${id}`),
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
  delete: (id)        => api.delete(`/calendars/${id}`),
}

export const sync = {
  status: () => api.get('/sync/status'),
  push: () => api.post('/sync/push', {}),
  calendars: () => api.get('/sync/calendars'),
}

export const feed = {
  all: () => api.get(`/feed?_t=${Date.now()}&focus_date=${localDate()}`),
  reactions: () => api.get('/feed/reactions'),
  react: (ref, type, extra, outcomeCategory = null) => api.post('/feed/reactions', { ref, type, ...extra }, outcomeCategory),
  noteProcess: (ref, text, cardType) => api.post('/feed/note-process', { ref, text, card_type: cardType }),
  noteJobs: () => api.get('/feed/note-jobs'),
  aiStatus: () => api.get('/feed/ai-status'),
  aiGenerate: (force = false) => api.post('/feed/ai-generate', { force }),
}

export const focus = {
  get: () => api.get(`/focus?date=${localDate()}`),
  action: (component_id, action, payload = {}) => api.post('/focus/action', { component_id, action, date: localDate(), ...payload }),
}

export const ai = {
  chat: (messages, system) => api.post('/ai/chat', { messages, ...(system ? { system } : {}) }),
  run: (task, params = {}) => api.post('/ai/run', { task, params }),
}

export const aiReviews = {
  all: () => api.get('/ai-reviews'),
}

export const productIntelligence = {
  all: () => api.get('/product-intelligence'),
  source: (ref) => api.get(`/product-intelligence/source?ref=${encodeURIComponent(ref)}`),
  reviewAction: (action, target_ref, body = '', outcomeCategory = null) => api.post('/product-intelligence/review-actions', { action, target_ref, body }, outcomeCategory),
  createInitiative: (payload) => api.post('/product-intelligence/initiatives', payload, 'review_decision'),
  createWorkItem: (initiativeId, payload) => api.post(`/product-intelligence/initiatives/${initiativeId}/work-items`, payload, 'review_decision'),
  priorityReminder: (action, candidate_set_checksum) => api.post('/product-intelligence/priority-loop/reminder', { action, candidate_set_checksum }, 'review_decision'),
  priorityRecheckDraft: (action, delivery_task_id, candidate_set_checksum) => api.post('/product-intelligence/priority-loop/recheck-drafts', { action, delivery_task_id, candidate_set_checksum }, 'review_decision'),
}

export const memories = {
  all: (date = null) => api.get(date ? `/memories?date=${date}` : '/memories'),
  add: (entry, outcomeCategory = null) => api.post('/memories', entry, outcomeCategory),
  update: (id, patch) => api.patch(`/memories/${id}`, patch),
  delete: (id) => api.delete(`/memories/${id}`),
  uploadPhotos: (id, files) => {
    const formData = new FormData()
    for (const f of files) formData.append('photos', f)
    return fetch(`/api/memories/${id}/photos`, { method: 'POST', body: formData })
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`)
        trackMutation('POST', `/memories/${id}/photos`, 'success')
        return data
      })
      .catch(error => { trackMutation('POST', `/memories/${id}/photos`, 'failed'); throw error })
  },
  mediaUrl: (filename) => `/api/memories/photos/${filename}`,
}
