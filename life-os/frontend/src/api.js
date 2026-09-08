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
}

export const claude = {
  chat: (messages, system) => api.post('/claude', { messages, ...(system ? { system } : {}) }),
}

export const config = {
  get: () => api.get('/config'),
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
  run: (task, params = {}) => fetch('/api/ai/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, params }),
  }).then(r => r.json()),
}

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
