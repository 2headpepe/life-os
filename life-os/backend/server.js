import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec, spawn } from 'child_process'
import { google } from 'googleapis'
import multer from 'multer'

const app = express()
const PORT = process.env.PORT || 3001
const VAULT = process.env.VAULT_PATH || path.join(import.meta.dirname, '../../brain/content')
const WORK_DIR = process.env.WORK_DIR || path.resolve(import.meta.dirname, '../..')

const STALENESS_DAYS = {
  node: 21,
  list_item: 60,
  insight: 30,
}

app.use(cors())
app.use(express.json())

// ─── Memories photo upload ───────────────────────────────────────
const MEMORIES_DIR = path.join(VAULT, 'memories')
const PHOTOS_DIR = path.join(MEMORIES_DIR, 'photos')
const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      await fs.mkdir(PHOTOS_DIR, { recursive: true })
      cb(null, PHOTOS_DIR)
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
      cb(null, `mem-${Date.now()}${ext}`)
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm', '.avi']
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()))
  },
})
app.use('/api/memories/photos', express.static(PHOTOS_DIR))

// ─── Helpers ───────────────────────────────────────────────────────

function addDaysToDate(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// Next due date for a recurring node. monthly advances one calendar month.
function nextRecurrenceDate(dateStr, recurrence) {
  if (recurrence === 'daily')  return addDaysToDate(dateStr, 1)
  if (recurrence === 'weekly') return addDaysToDate(dateStr, 7)
  if (recurrence === 'monthly') {
    const d = new Date(dateStr + 'T12:00:00')
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  }
  return null
}

// Walk up from a changed node, syncing each non-leaf container's done-ness with
// its leaf descendants. Only toggles between `done` and `null` (active) — never
// touches a container that the user parked as `someday`/`dropped`. Mutates in place.
function propagateDoneStatus(nodes, startId) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
  const childrenOf = {}
  for (const n of nodes) {
    if (n.parent_id) (childrenOf[n.parent_id] ||= []).push(n)
  }
  const leavesUnder = (id) => {
    const kids = childrenOf[id] || []
    if (kids.length === 0) return byId[id] ? [byId[id]] : []
    return kids.flatMap(k => leavesUnder(k.id))
  }
  let cur = byId[startId]
  const seen = new Set()
  while (cur && cur.parent_id && !seen.has(cur.id)) {
    seen.add(cur.id)
    const parent = byId[cur.parent_id]
    if (!parent) break
    if (parent.status !== 'someday' && parent.status !== 'dropped') {
      const leaves = leavesUnder(parent.id)
      const allDone = leaves.length > 0 && leaves.every(l => l.status === 'done' || l.status === 'dropped')
      if (allDone && parent.status !== 'done') parent.status = 'done'
      else if (!allDone && parent.status === 'done') parent.status = null
    }
    cur = parent
  }
}


// ─── Content read/write ────────────────────────────────────────────

app.get('/api/content/*', async (req, res) => {
  const filePath = path.join(VAULT, req.params[0])
  try {
    res.json(JSON.parse(await fs.readFile(filePath, 'utf-8')))
  } catch {
    res.status(404).json({ error: 'not found' })
  }
})

app.put('/api/content/*', async (req, res) => {
  const filePath = path.join(VAULT, req.params[0])
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(req.body, null, 2))
    const relPath = req.params[0]
    if (relPath.includes('habits/log/')) {
      autoMemory('Привычки', `лог обновлён: ${relPath.split('/').pop()}`)
    } else if (relPath.includes('habits/definitions')) {
      autoMemory('Привычки', 'определения обновлены')
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/ls/*', async (req, res) => {
  const dirPath = path.join(VAULT, req.params[0])
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    res.json(entries.map(e => ({ name: e.name, isDir: e.isDirectory() })))
  } catch {
    res.status(404).json({ error: 'not found' })
  }
})


// ─── Lists ────────────────────────────────────────────────────────

app.post('/api/lists/:list', async (req, res) => {
  const { list } = req.params
  const filePath = path.join(VAULT, 'lists', `${list}.json`)
  try {
    const data = JSON.parse(await fs.readFile(filePath, 'utf-8'))
    const item = { id: `${list}-${Date.now()}`, status: 'want', added: new Date().toISOString().slice(0, 10), ...req.body }
    data.items.push(item)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    autoMemory('Добавлено в список', `${list}: ${item.title || item.id}`)
    res.json(item)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/lists/:list/:id', async (req, res) => {
  const { list, id } = req.params
  const filePath = path.join(VAULT, 'lists', `${list}.json`)
  try {
    const data = JSON.parse(await fs.readFile(filePath, 'utf-8'))
    const idx = data.items.findIndex(i => i.id === id)
    if (idx === -1) return res.status(404).json({ error: 'not found' })
    data.items[idx] = { ...data.items[idx], ...req.body, updated: new Date().toISOString().slice(0, 10) }
    await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    autoMemory('Список', `${list}/${data.items[idx].title || id}: ${Object.keys(req.body).join(', ')}`)
    res.json(data.items[idx])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Inbox ────────────────────────────────────────────────────────

app.post('/api/inbox', async (req, res) => {
  const filePath = path.join(VAULT, 'inbox/current.json')
  try {
    const data = JSON.parse(await fs.readFile(filePath, 'utf-8'))
    const item = { id: `inbox-${Date.now()}`, added: new Date().toISOString().slice(0, 10), tags: [], ...req.body }
    data.items.push(item)
    data.updated = new Date().toISOString().slice(0, 10)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    autoMemory('Inbox', `добавлено: ${item.text || item.id}`)
    res.json(item)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/inbox/:id', async (req, res) => {
  const filePath = path.join(VAULT, 'inbox/current.json')
  try {
    const data = JSON.parse(await fs.readFile(filePath, 'utf-8'))
    data.items = data.items.filter(i => i.id !== req.params.id)
    data.updated = new Date().toISOString().slice(0, 10)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Events ───────────────────────────────────────────────────────

app.post('/api/events', async (req, res) => {
  const filePath = path.join(VAULT, 'events/index.json')
  try {
    const data = JSON.parse(await fs.readFile(filePath, 'utf-8'))
    const event = {
      id: `event-${Date.now()}`,
      title: '',
      date: new Date().toISOString().slice(0, 10),
      time: null,
      duration_min: null,
      type: 'event',
      notes: '',
      ...req.body,
    }
    data.events.push(event)
    data.updated = new Date().toISOString().slice(0, 10)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    res.json(event)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/events/:id', async (req, res) => {
  const filePath = path.join(VAULT, 'events/index.json')
  try {
    const data = JSON.parse(await fs.readFile(filePath, 'utf-8'))
    const idx = data.events.findIndex(e => e.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'not found' })
    data.events[idx] = { ...data.events[idx], ...req.body }
    data.updated = new Date().toISOString().slice(0, 10)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    res.json(data.events[idx])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/events/:id', async (req, res) => {
  const filePath = path.join(VAULT, 'events/index.json')
  try {
    const data = JSON.parse(await fs.readFile(filePath, 'utf-8'))
    data.events = data.events.filter(e => e.id !== req.params.id)
    data.updated = new Date().toISOString().slice(0, 10)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Context (for Claude) ─────────────────────────────────────────

app.get('/api/context', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const treeData = await readTree()
    const nodes = treeData.nodes
    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))
    const childIds = new Set(nodes.map(n => n.parent_id).filter(Boolean))
    const leaves = nodes.filter(n => !childIds.has(n.id))
    const active = leaves.filter(n => n.status !== 'done' && n.status !== 'dropped' && n.status !== 'someday')

    const overdue = active.filter(n => n.due && n.due < today)
    const scheduledToday = active.filter(n => n.due === today && n.status === 'scheduled')
    const top = active.filter(n => !overdue.find(o => o.id === n.id)).slice(0, 7)

    // root title for context
    const rootTitle = (n) => {
      let cur = n
      while (cur.parent_id && nodeMap[cur.parent_id]) cur = nodeMap[cur.parent_id]
      return cur.title
    }

    let habitDefs = [], habitLog = {}, habitScore = 0
    try {
      const h = JSON.parse(await fs.readFile(path.join(VAULT, 'habits/definitions.json'), 'utf-8'))
      habitDefs = (h.categories || []).flatMap(c => c.habits.filter(x => x.active))
    } catch {}
    try {
      const log = JSON.parse(await fs.readFile(path.join(VAULT, `habits/log/${today}.json`), 'utf-8'))
      habitLog = log.habits || {}
      habitScore = log.score || 0
    } catch {}

    res.json({
      date: today,
      overdue: overdue.map(n => ({ title: n.title, due: n.due, sphere: rootTitle(n) })),
      scheduled_today: scheduledToday.map(n => ({ title: n.title, sphere: rootTitle(n) })),
      top_tasks: top.map(n => ({ title: n.title, status: n.status, sphere: rootTitle(n) })),
      habits: {
        done: habitDefs.filter(h => { const v = habitLog[h.id]; return v !== null && v !== undefined && v !== false }).length,
        total: habitDefs.length,
        score: habitScore,
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Search ───────────────────────────────────────────────────────

app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim()
  if (!q) return res.json({ results: [] })
  const results = []

  try {
    // Tree nodes
    const treeData = await readTree()
    for (const n of treeData.nodes) {
      if (n.status === 'done' || n.status === 'dropped') continue
      if (n.title?.toLowerCase().includes(q) || n.notes?.toLowerCase().includes(q) || n.outcome?.toLowerCase().includes(q)) {
        results.push({ type: 'node', id: n.id, title: n.title, sub: (n.notes || n.outcome || '').slice(0, 60) })
      }
    }
    // Inbox
    try {
      const ib = JSON.parse(await fs.readFile(path.join(VAULT, 'inbox/current.json'), 'utf-8'))
      for (const item of ib.items || []) {
        if (item.text?.toLowerCase().includes(q)) {
          results.push({ type: 'inbox', id: item.id, title: item.text.slice(0, 80), sub: '' })
        }
      }
    } catch {}
  } catch {}

  res.json({ results: results.slice(0, 20) })
})

// ─── Claude ───────────────────────────────────────────────────────

// ─── People ───────────────────────────────────────────────────────

const BRAIN_DIR = path.resolve(VAULT, '..')
const PEOPLE_INDEX = path.join(BRAIN_DIR, 'people/index.json')

app.get('/api/people', async (req, res) => {
  try {
    const index = JSON.parse(await fs.readFile(PEOPLE_INDEX, 'utf-8'))
    res.json(index.people)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/people/:id', async (req, res) => {
  try {
    const index = JSON.parse(await fs.readFile(PEOPLE_INDEX, 'utf-8'))
    const person = index.people.find(p => p.id === req.params.id)
    if (!person) return res.status(404).json({ error: 'not found' })
    const mdPath = path.join(WORK_DIR, person.file)
    const content = await fs.readFile(mdPath, 'utf-8').catch(() => '')
    res.json({ ...person, content })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Topics ───────────────────────────────────────────────────────

const TOPICS_DIR = path.join(BRAIN_DIR, 'topics')

app.get('/api/topics', async (req, res) => {
  try {
    const entries = await fs.readdir(TOPICS_DIR, { withFileTypes: true })
    const topics = []
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const slug = e.name
      const mdPath = path.join(TOPICS_DIR, slug, `${slug}-current.md`)
      const raw = await fs.readFile(mdPath, 'utf-8').catch(() => null)
      if (!raw) continue
      const firstLine = raw.split('\n')[0] || ''
      const topicMatch = firstLine.match(/^topic:\s*(.+)/)
      const label = topicMatch ? topicMatch[1].replace(/_/g, ' ') : slug.replace(/-/g, ' ')
      topics.push({ slug, label })
    }
    res.json(topics)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/topics/:slug', async (req, res) => {
  try {
    const slug = req.params.slug
    const mdPath = path.join(TOPICS_DIR, slug, `${slug}-current.md`)
    const content = await fs.readFile(mdPath, 'utf-8').catch(() => null)
    if (!content) return res.status(404).json({ error: 'not found' })
    res.json({ slug, content })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Insights ─────────────────────────────────────────────────────

app.get('/api/insights', async (req, res) => {
  try {
    const data = JSON.parse(await fs.readFile(path.join(VAULT, 'insights/index.json'), 'utf-8'))
    res.json(data.insights)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


// ─── Insights PATCH ───────────────────────────────────────────────

app.post('/api/insights', async (req, res) => {
  const filePath = path.join(VAULT, 'insights/index.json')
  try {
    const data = JSON.parse(await fs.readFile(filePath, 'utf-8'))
    const today = new Date().toISOString().slice(0, 10)
    const insight = {
      id: `ins-${Date.now()}`,
      title: '',
      body: '',
      tags: [],
      sphere: null,
      source: null,
      created: today,
      updated: today,
      ...req.body,
    }
    data.insights.push(insight)
    data.updated = today
    await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    autoMemory('Инсайт', `создан: ${insight.title || insight.id}`)
    res.json(insight)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/insights/:id', async (req, res) => {
  const filePath = path.join(VAULT, 'insights/index.json')
  try {
    const data = JSON.parse(await fs.readFile(filePath, 'utf-8'))
    const idx = data.insights.findIndex(i => i.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'insight not found' })
    const today = new Date().toISOString().slice(0, 10)
    data.insights[idx] = { ...data.insights[idx], ...req.body, updated: today }
    data.updated = today
    await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    autoMemory('Инсайт изменён', `${data.insights[idx].title || req.params.id}: ${Object.keys(req.body).join(', ')}`)
    res.json(data.insights[idx])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── News ─────────────────────────────────────────────────────────

app.get('/api/news', async (req, res) => {
  try {
    const data = await readNews()
    res.json({ items: data.items, sources: data.sources, updated: data.updated })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/news', async (req, res) => {
  try {
    const data = await readNews()
    const today = new Date().toISOString().slice(0, 10)
    const incoming = Array.isArray(req.body.items) ? req.body.items : [req.body]
    const added = []
    for (const item of incoming) {
      const newsItem = {
        id: `news-${Date.now() + added.length}`,
        title: '',
        summary: '',
        full_text: null,
        url: null,
        source_name: null,
        source_id: null,
        published: null,
        topics: [],
        feedback: null,
        saved: false,
        created: today,
        updated: today,
        ...item,
      }
      data.items.push(newsItem)
      added.push(newsItem)
    }
    await writeNews(data)
    res.json(added)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/news/:id', async (req, res) => {
  try {
    const data = await readNews()
    const idx = data.items.findIndex(i => i.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'news item not found' })
    const today = new Date().toISOString().slice(0, 10)
    data.items[idx] = { ...data.items[idx], ...req.body, updated: today }
    data.updated = today
    await writeNews(data)
    autoMemory('Новость', `${data.items[idx].title || req.params.id}: ${Object.keys(req.body).join(', ')}`)
    res.json(data.items[idx])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/news/sources', async (req, res) => {
  try {
    const data = await readNews()
    res.json(data.sources)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/news/sources', async (req, res) => {
  try {
    const data = await readNews()
    const source = {
      id: req.body.id || `src-${Date.now()}`,
      name: req.body.name || '',
      url: req.body.url || '',
      topic: req.body.topic || '',
      enabled: req.body.enabled ?? true,
    }
    data.sources.push(source)
    await writeNews(data)
    res.json(source)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/news/sources/:id', async (req, res) => {
  try {
    const data = await readNews()
    const idx = data.sources.findIndex(s => s.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'source not found' })
    data.sources[idx] = { ...data.sources[idx], ...req.body, id: data.sources[idx].id }
    await writeNews(data)
    res.json(data.sources[idx])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/news/sources/:id', async (req, res) => {
  try {
    const data = await readNews()
    data.sources = data.sources.filter(s => s.id !== req.params.id)
    await writeNews(data)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// news auto-refresh — pull all enabled RSS sources, dedupe by url, cap the archive
function parseRssXml(xml, source) {
  const items = []
  const clean = (s) => (s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
  const entryRe = /<(item|entry)[^>]*>([\s\S]*?)<\/\1>/g
  let m
  while ((m = entryRe.exec(xml)) !== null) {
    const body = m[2]
    const get = (tag) => {
      const r = body.match(new RegExp(`<${tag}(?:[^>]*)>([\\s\\S]*?)<\\/${tag}>`))
      return r ? clean(r[1]) : ''
    }
    let link = get('link')
    if (!link) {
      const lr = body.match(/<link[^>]*href="([^"]+)"/)
      link = lr ? lr[1] : ''
    }
    const title = get('title').replace(/<[^>]+>/g, '')
    if (!title || !link) continue
    const rawDesc = get('description') || get('summary') || ''
    const summary = clean(rawDesc.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').slice(0, 220)
    let published = null
    const d = new Date(get('pubDate') || get('published') || get('updated'))
    if (!isNaN(d.getTime())) published = d.toISOString().slice(0, 10)
    items.push({
      title, url: link, summary,
      source_name: source.name, source_id: source.id,
      published, topics: source.topic ? [source.topic] : [],
    })
  }
  return items
}

async function refreshNewsFromSources() {
  const data = await readNews()
  const known = new Set((data.items || []).map(i => i.url).filter(Boolean))
  const today = new Date().toISOString().slice(0, 10)
  let added = 0
  for (const src of (data.sources || []).filter(s => s.enabled)) {
    try {
      const res = await fetch(src.url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'LifeOS/1.0 (personal feed)', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
      })
      if (!res.ok) continue
      const xml = await res.text()
      for (const item of parseRssXml(xml, src)) {
        if (known.has(item.url)) continue
        known.add(item.url)
        data.items.push({
          id: `news-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title: '', summary: '', full_text: null, url: null,
          source_name: null, source_id: null, published: null,
          topics: [], feedback: null, saved: false,
          created: today, updated: today,
          ...item,
        })
        added++
      }
    } catch { /* source unreachable — skip */ }
  }
  data.items.sort((a, b) => (b.published || b.created || '').localeCompare(a.published || a.created || ''))
  if (data.items.length > 500) {
    const keep = new Set(data.items.filter(i => i.rating != null || i.saved).map(i => i.id))
    const kept = data.items.filter(i => keep.has(i.id))
    const rest = data.items.filter(i => !keep.has(i.id)).slice(0, 500 - kept.length)
    data.items = [...kept, ...rest]
  }
  await writeNews(data)
  return added
}

app.post('/api/news/refresh', async (req, res) => {
  try {
    const added = await refreshNewsFromSources()
    res.json({ ok: true, added })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const NEWS_REFRESH_MS = 6 * 3600 * 1000
async function maybeRefreshNews() {
  try {
    const data = await readNews()
    const age = Date.now() - new Date((data.updated || '') + 'T00:00:00Z').getTime()
    if (!isFinite(age) || age > NEWS_REFRESH_MS) {
      const added = await refreshNewsFromSources()
      console.log(`news auto-refresh: +${added} items`)
    }
  } catch (e) {
    console.log('news auto-refresh error:', e.message)
  }
}
setInterval(maybeRefreshNews, NEWS_REFRESH_MS).unref()
maybeRefreshNews()

// ─── Memories ──────────────────────────────────────────────────────

const MEMORIES_FILE = path.join(MEMORIES_DIR, 'index.json')

async function readMemories() {
  try {
    return JSON.parse(await fs.readFile(MEMORIES_FILE, 'utf-8'))
  } catch {
    return { _type: 'memories', updated: new Date().toISOString().slice(0, 10), entries: [] }
  }
}

async function writeMemories(data) {
  await fs.mkdir(MEMORIES_DIR, { recursive: true })
  data.updated = new Date().toISOString().slice(0, 10)
  await fs.writeFile(MEMORIES_FILE, JSON.stringify(data, null, 2))
}

// Auto-memory: any user action creates a memory entry for today.
async function autoMemory(label, detail) {
  try {
    const data = await readMemories()
    const today = new Date().toISOString().slice(0, 10)
    const entry = {
      id: `mem-auto-${Date.now()}`,
      date: today,
      text: `${label}: ${detail}`,
      photos: [],
      auto: true,
      source: 'action',
      created: today,
      updated: today,
    }
    data.entries.push(entry)
    await writeMemories(data)
    return entry
  } catch (e) {
    console.error('autoMemory failed:', e.message)
  }
}

app.get('/api/memories', async (req, res) => {
  try {
    const data = await readMemories()
    let entries = data.entries || []
    if (req.query.date) entries = entries.filter(e => e.date === req.query.date)
    entries.sort((a, b) => (b.date + b.created).localeCompare(a.date + a.created))
    res.json(entries)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/memories', async (req, res) => {
  try {
    const data = await readMemories()
    const today = new Date().toISOString().slice(0, 10)
    const entry = {
      id: `mem-${Date.now()}`,
      date: today,
      text: '',
      photos: [],
      created: today,
      updated: today,
      ...req.body,
    }
    data.entries.push(entry)
    await writeMemories(data)
    res.json(entry)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/memories/:id', async (req, res) => {
  try {
    const data = await readMemories()
    const idx = data.entries.findIndex(e => e.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'entry not found' })
    const today = new Date().toISOString().slice(0, 10)
    data.entries[idx] = { ...data.entries[idx], ...req.body, updated: today }
    await writeMemories(data)
    res.json(data.entries[idx])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/memories/:id', async (req, res) => {
  try {
    const data = await readMemories()
    const idx = data.entries.findIndex(e => e.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'entry not found' })
    const [removed] = data.entries.splice(idx, 1)
    await writeMemories(data)
    if (removed.auto && removed.date) {
      const rdata = await readFeedReactions()
      rdata.reactions.push({ ref: `auto-mem:${removed.date}`, type: 'done', ts: new Date().toISOString() })
      rdata.updated = new Date().toISOString().slice(0, 10)
      await fs.mkdir(path.dirname(FEED_REACTIONS_FILE), { recursive: true })
      await fs.writeFile(FEED_REACTIONS_FILE, JSON.stringify(rdata, null, 2))
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/memories/:id/photos', upload.array('photos', 10), async (req, res) => {
  try {
    const data = await readMemories()
    const idx = data.entries.findIndex(e => e.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'entry not found' })
    const photos = (req.files || []).map(f => ({
      id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      filename: f.filename,
      original_name: f.originalname,
    }))
    data.entries[idx].photos = [...(data.entries[idx].photos || []), ...photos]
    const today = new Date().toISOString().slice(0, 10)
    data.entries[idx].updated = today
    await writeMemories(data)
    res.json({ photos, entry: data.entries[idx] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Pulse ────────────────────────────────────────────────────────

function daysSince(dateStr) {
  if (!dateStr) return Infinity
  const now = new Date()
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((todayUTC - new Date(dateStr + 'T00:00:00Z').getTime()) / 86400000)
}

app.get('/api/pulse', async (req, res) => {
  const alerts = []
  const today = new Date().toISOString().slice(0, 10)
  const isSnoozed = (item) => item.snoozed_until && item.snoozed_until >= today

  try {
    const treeData = await readTree()
    const nodes = treeData.nodes
    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))
    const childIds = new Set(nodes.map(n => n.parent_id).filter(Boolean))
    const leaves = nodes.filter(n => !childIds.has(n.id))

    for (const node of leaves) {
      if (isSnoozed(node)) continue
      const blocked = (node.blocked_by || []).some(bid => nodeMap[bid]?.status !== 'done')
      if (blocked) continue

      if (!node.status || node.status === 'undefined') {
        alerts.push({ type: 'node', id: node.id, title: node.title, days_stale: daysSince(node.updated || node.created), reason: 'undefined' })
        continue
      }
      if (node.status === 'done' || node.status === 'dropped') continue

      if (node.status === 'someday') {
        if (node.review_by && node.review_by < today) {
          alerts.push({ type: 'node', id: node.id, title: node.title, days_stale: daysSince(node.review_by), reason: 'someday_review' })
        } else if (!node.review_by) {
          const days = daysSince(node.updated || node.created)
          if (days >= 30) alerts.push({ type: 'node', id: node.id, title: node.title, days_stale: days, reason: 'someday_stale' })
        }
        continue
      }

      if (!node.due) {
        const days = daysSince(node.updated || node.created)
        if (days >= STALENESS_DAYS.node) {
          alerts.push({ type: 'node', id: node.id, title: node.title, days_stale: days, reason: 'floating' })
        }
      }
    }
  } catch {}

  try {
    const li = JSON.parse(await fs.readFile(path.join(VAULT, 'lists/_index.json'), 'utf-8'))
    for (const col of li.collections) {
      try {
        const data = JSON.parse(await fs.readFile(path.join(VAULT, 'lists', col.file), 'utf-8'))
        for (const item of data.items || []) {
          if (item.status !== 'want') continue
          if (isSnoozed(item)) continue
          const days = daysSince(item.updated || item.added)
          if (days >= STALENESS_DAYS.list_item) {
            alerts.push({ type: 'list_item', sphere: col.id, id: item.id, title: item.title, days_stale: days, reason: 'want_stale' })
          }
        }
      } catch {}
    }
  } catch {}

  try {
    const data = JSON.parse(await fs.readFile(path.join(VAULT, 'insights/index.json'), 'utf-8'))
    for (const insight of data.insights) {
      if (isSnoozed(insight)) continue
      const days = daysSince(insight.updated)
      if (days >= STALENESS_DAYS.insight) {
        alerts.push({ type: 'insight', sphere: insight.sphere, id: insight.id, title: insight.title, days_stale: days, reason: 'not_reviewed' })
      }
    }
  } catch {}

  let inbox = []
  try {
    const data = JSON.parse(await fs.readFile(path.join(VAULT, 'inbox/current.json'), 'utf-8'))
    inbox = data.items || []
  } catch {}

  alerts.sort((a, b) => b.days_stale - a.days_stale)
  res.json({ inbox, alerts, total: inbox.length + alerts.length })
})

app.post('/api/pulse/ack', async (req, res) => {
  const { type, sphere, id, snooze_days } = req.body
  const today = new Date().toISOString().slice(0, 10)
  const snoozed_until = snooze_days ? addDaysToDate(today, snooze_days) : null

  const applyAck = (item) => {
    item.updated = today
    if (snoozed_until) item.snoozed_until = snoozed_until
    else delete item.snoozed_until
  }

  try {
    if (type === 'node') {
      const data = await readTree()
      const idx = data.nodes.findIndex(n => n.id === id)
      if (idx !== -1) applyAck(data.nodes[idx])
      await writeTree(data)
    } else if (type === 'list_item') {
      const filePath = path.join(VAULT, 'lists', `${sphere}.json`)
      const data = JSON.parse(await fs.readFile(filePath, 'utf-8'))
      const idx = (data.items || []).findIndex(i => i.id === id)
      if (idx !== -1) applyAck(data.items[idx])
      await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    } else if (type === 'insight') {
      const filePath = path.join(VAULT, 'insights/index.json')
      const data = JSON.parse(await fs.readFile(filePath, 'utf-8'))
      const idx = data.insights.findIndex(i => i.id === id)
      if (idx !== -1) { applyAck(data.insights[idx]); data.updated = today }
      await fs.writeFile(filePath, JSON.stringify(data, null, 2))
    }
    res.json({ ok: true, snoozed_until })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Calendars ─────────────────────────────────────────────────────

const CALENDARS_FILE = path.join(VAULT, 'calendars/index.json')
const NEWS_FILE = path.join(import.meta.dirname, 'data', 'news', 'index.json')

async function readCalendars() {
  try {
    return JSON.parse(await fs.readFile(CALENDARS_FILE, 'utf-8'))
  } catch {
    return { updated: new Date().toISOString().slice(0, 10), calendars: [] }
  }
}

async function writeCalendars(data) {
  await fs.mkdir(path.dirname(CALENDARS_FILE), { recursive: true })
  data.updated = new Date().toISOString().slice(0, 10)
  await fs.writeFile(CALENDARS_FILE, JSON.stringify(data, null, 2))
}

async function readNews() {
  try {
    return JSON.parse(await fs.readFile(NEWS_FILE, 'utf-8'))
  } catch {
    return { _type: 'news_feed', updated: new Date().toISOString().slice(0, 10), items: [], sources: [] }
  }
}

async function writeNews(data) {
  await fs.mkdir(path.dirname(NEWS_FILE), { recursive: true })
  data.updated = new Date().toISOString().slice(0, 10)
  await fs.writeFile(NEWS_FILE, JSON.stringify(data, null, 2))
}

app.get('/api/calendars', async (req, res) => {
  try {
    const data = await readCalendars()
    res.json(data.calendars)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/calendars', async (req, res) => {
  try {
    const data = await readCalendars()
    const cal = {
      id: req.body.id || `cal-${Date.now()}`,
      title: req.body.title || '',
      color: req.body.color || '#6B7280',
      sync_to_gcal: req.body.sync_to_gcal ?? false,
    }
    data.calendars.push(cal)
    await writeCalendars(data)
    res.json(cal)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/calendars/:id', async (req, res) => {
  try {
    const data = await readCalendars()
    const idx = data.calendars.findIndex(c => c.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'calendar not found' })
    data.calendars[idx] = { ...data.calendars[idx], ...req.body, id: data.calendars[idx].id }
    await writeCalendars(data)
    res.json(data.calendars[idx])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/calendars/:id', async (req, res) => {
  try {
    const tree = await readTree()
    const used = tree.nodes.some(n => n.calendar_id === req.params.id)
    if (used) return res.status(409).json({ error: 'calendar has linked nodes — unlink them first' })
    const data = await readCalendars()
    data.calendars = data.calendars.filter(c => c.id !== req.params.id)
    await writeCalendars(data)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Tree ─────────────────────────────────────────────────────────

const TREE_FILE = path.join(VAULT, 'tree/nodes.json')

async function readTree() {
  try {
    return JSON.parse(await fs.readFile(TREE_FILE, 'utf-8'))
  } catch {
    return { _type: 'tree', updated: new Date().toISOString().slice(0, 10), nodes: [] }
  }
}

async function writeTree(data) {
  await fs.mkdir(path.dirname(TREE_FILE), { recursive: true })
  data.updated = new Date().toISOString().slice(0, 10)
  await fs.writeFile(TREE_FILE, JSON.stringify(data, null, 2))
}

app.get('/api/tree/spheres', async (req, res) => {
  try {
    const data = await readTree()
    const roots = data.nodes.filter(n => !n.parent_id)
    res.json(roots.map(n => ({
      id: n.id.replace(/^root-/, ''),
      nodeId: n.id,
      label: n.title,
      color: n.color || '#6B7280',
    })))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/tree/leaves', async (req, res) => {
  try {
    const data = await readTree()
    const nodes = data.nodes
    const nodeMap = {}
    nodes.forEach(n => (nodeMap[n.id] = n))
    const childIds = new Set(nodes.map(n => n.parent_id).filter(Boolean))
    const leaves = nodes.filter(n => !childIds.has(n.id))

    const enriched = leaves.map(leaf => {
      let cur = leaf
      const path = []
      let root = cur
      while (cur.parent_id && nodeMap[cur.parent_id]) {
        cur = nodeMap[cur.parent_id]
        path.unshift(cur.title)
        root = cur
      }
      const blockers = (leaf.blocked_by || [])
        .map(bid => { const b = nodeMap[bid]; return b ? { id: b.id, title: b.title, status: b.status } : null })
        .filter(Boolean)
      const is_blocked = blockers.some(b => b.status !== 'done')
      return {
        ...leaf,
        root_id:    root.id,
        root_title: root.title,
        root_color: root.color || '#6B7280',
        path,
        is_blocked,
        blockers,
      }
    })
    res.json(enriched)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/tree', async (req, res) => {
  try {
    const data = await readTree()
    res.json(data.nodes)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/tree', async (req, res) => {
  try {
    const data = await readTree()
    const today = new Date().toISOString().slice(0, 10)
    const node = {
      id: `node-${Date.now()}`,
      title: '',
      outcome: null,
      parent_id: null,
      calendar_id: null,
      watched: false,
      color: null,
      status: 'undefined',
      due: null,
      notes: null,
      recurrence: null,
      created: today,
      updated: today,
      ...req.body,
    }
    data.nodes.push(node)
    await writeTree(data)
    autoMemory('Создана задача', `${node.title || node.id} (${node.status})`)
    if (node.status === 'scheduled' && node.due) {
      const cal = await getCalendarClient()
      const gcalId = await syncNodeToGCal(node, cal)
      if (gcalId) {
        const idx = data.nodes.findIndex(n => n.id === node.id)
        data.nodes[idx].gcal_event_id = gcalId
        node.gcal_event_id = gcalId
        await writeTree(data)
      }
    }
    res.json(node)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/tree/:id', async (req, res) => {
  try {
    const data = await readTree()
    const idx = data.nodes.findIndex(n => n.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'node not found' })
    const today = new Date().toISOString().slice(0, 10)
    const oldNode = data.nodes[idx]
    data.nodes[idx] = { ...oldNode, ...req.body, updated: today }
    const newNode = data.nodes[idx]

    // Auto-memory: node changed
    const changedFields = Object.keys(req.body)
    if (changedFields.includes('status')) {
      autoMemory('Задача', `${oldNode.title || req.params.id}: ${oldNode.status} → ${newNode.status}`)
    } else if (changedFields.length > 0) {
      autoMemory('Задача изменена', `${oldNode.title || req.params.id}: ${changedFields.join(', ')}`)
    }

    // Recurring node: completing it spawns the next scheduled instance.
    let nextNode = null
    if (req.body.status === 'done' && oldNode.status !== 'done' && oldNode.recurrence && oldNode.due) {
      const nextDue = nextRecurrenceDate(oldNode.due, oldNode.recurrence)
      if (nextDue) {
        nextNode = { ...oldNode, id: `node-${Date.now()}`, status: 'scheduled', due: nextDue, created: today, updated: today }
        delete nextNode.gcal_event_id
        data.nodes.push(nextNode)
      }
    }

    // Keep ancestor containers in sync with their leaves (done ↔ active).
    if (req.body.status !== undefined) propagateDoneStatus(data.nodes, req.params.id)

    await writeTree(data)
    const cal = await getCalendarClient()
    if (cal) {
      const wasScheduled = oldNode.status === 'scheduled' && oldNode.due
      const isScheduled = newNode.status === 'scheduled' && newNode.due
      if (isScheduled) {
        const gcalId = await syncNodeToGCal(newNode, cal)
        if (gcalId && gcalId !== newNode.gcal_event_id) {
          data.nodes[idx].gcal_event_id = gcalId
          newNode.gcal_event_id = gcalId
          await writeTree(data)
        }
      } else if (wasScheduled && !isScheduled && oldNode.gcal_event_id) {
        await deleteFromGCal(oldNode.gcal_event_id, cal)
        delete data.nodes[idx].gcal_event_id
        delete newNode.gcal_event_id
        await writeTree(data)
      }
      // Sync the freshly spawned recurring instance to GCal.
      if (nextNode) {
        const gcalId = await syncNodeToGCal(nextNode, cal)
        if (gcalId) {
          const ni = data.nodes.findIndex(n => n.id === nextNode.id)
          if (ni !== -1) { data.nodes[ni].gcal_event_id = gcalId; await writeTree(data) }
        }
      }
    }
    res.json(newNode)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/tree/:id', async (req, res) => {
  try {
    const data = await readTree()
    const toDelete = new Set()
    const collect = (id) => {
      toDelete.add(id)
      data.nodes.filter(n => n.parent_id === id).forEach(n => collect(n.id))
    }
    collect(req.params.id)
    const gcalIds = data.nodes
      .filter(n => toDelete.has(n.id) && n.gcal_event_id)
      .map(n => n.gcal_event_id)
    const deletedNames = data.nodes.filter(n => toDelete.has(n.id)).map(n => n.title || n.id)
    data.nodes = data.nodes.filter(n => !toDelete.has(n.id))
    await writeTree(data)
    autoMemory('Задача удалена', deletedNames.slice(0, 3).join(', ') + (deletedNames.length > 3 ? ` +${deletedNames.length - 3}` : ''))
    if (gcalIds.length) {
      const cal = await getCalendarClient()
      for (const id of gcalIds) await deleteFromGCal(id, cal)
    }
    res.json({ ok: true, deleted: toDelete.size })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


const AI_SYSTEM_PROMPT = 'Ты личный ассистент в Life OS — системе управления жизнью пользователя. Помогай разбирать задачи, декомпозировать цели, планировать день. Отвечай кратко и по делу на русском языке. Используй markdown для форматирования когда уместно.'

app.post('/api/claude', async (req, res) => {
  const { messages, system } = req.body
  if (!messages?.length) return res.status(400).json({ error: 'messages required' })

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const openaiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY

  if (!anthropicKey && !openaiKey) {
    return res.status(503).json({ error: 'AI не настроен: задайте ANTHROPIC_API_KEY или AI_API_KEY в .env файле бэкенда' })
  }

  const systemPrompt = system || AI_SYSTEM_PROMPT

  try {
    if (anthropicKey) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: process.env.AI_MODEL || 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: systemPrompt,
          messages,
        }),
      })
      const data = await response.json()
      if (data.error) return res.status(500).json({ error: data.error.message })
      res.json({ text: data.content?.[0]?.text || '' })
    } else {
      const baseUrl = (process.env.AI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
      const model = process.env.AI_MODEL || 'gpt-4o'
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
        }),
      })
      const data = await response.json()
      if (data.error) return res.status(500).json({ error: data.error.message || JSON.stringify(data.error) })
      res.json({ text: data.choices?.[0]?.message?.content || '' })
    }
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/config', (req, res) => {
  res.json({
    cliCommand: process.env.CLI_COMMAND || 'claude',
    hasAi: !!(process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY),
  })
})

app.get('/api/profile', async (req, res) => {
  try {
    const data = JSON.parse(await fs.readFile(path.join(VAULT, 'profile/profile.json'), 'utf-8'))
    res.json(data)
  } catch { res.json({ name: null }) }
})

app.put('/api/profile', async (req, res) => {
  try {
    const existing = await fs.readFile(path.join(VAULT, 'profile/profile.json'), 'utf-8').then(JSON.parse).catch(() => ({}))
    const updated = { ...existing, ...req.body, updated: new Date().toISOString().slice(0, 10) }
    await fs.mkdir(path.join(VAULT, 'profile'), { recursive: true })
    await fs.writeFile(path.join(VAULT, 'profile/profile.json'), JSON.stringify(updated, null, 2))
    res.json(updated)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/open-claude', async (req, res) => {
  const { prompt } = req.body || {}
  const cliCmd = process.env.CLI_COMMAND || 'claude'
  const platform = process.platform

  try {
    if (platform === 'win32') {
      // Windows: write a .bat, copy prompt via clip, open cmd
      const scriptPath = path.join(os.tmpdir(), 'life-os-cli.bat')
      let script = `@echo off\ncd /d "${WORK_DIR}"\n`
      if (prompt) {
        const escaped = prompt.replace(/"/g, '\\"')
        script += `echo ${escaped}| clip\n`
        script += `echo.\n`
        script += `echo ==========================================\n`
        script += `echo  Life OS - prompt copied to clipboard\n`
        script += `echo  Paste your first message: Ctrl+V\n`
        script += `echo ==========================================\n`
        script += `echo.\n`
      }
      script += `${cliCmd}\n`
      await fs.writeFile(scriptPath, script)
      exec(`start cmd /k "${scriptPath}"`)
    } else {
      // macOS / Linux: write a .sh, copy prompt, open terminal
      const scriptPath = path.join(os.tmpdir(), 'life-os-cli.sh')
      let script = `#!/bin/bash\ncd "${WORK_DIR}"\n`
      if (prompt) {
        const escapedPrompt = prompt.replace(/'/g, "'\\''")
        if (platform === 'darwin') {
          script += `echo '${escapedPrompt}' | pbcopy\n`
          script += `echo ""\n`
          script += `echo "══════════════════════════════════════════"\n`
          script += `echo " Life OS — инструкции скопированы в буфер"\n`
          script += `echo " Вставь первое сообщение: ⌘V (Cmd+V)"\n`
          script += `echo "══════════════════════════════════════════"\n`
          script += `echo ""\n`
        } else {
          // Linux: try xclip, fall back to xsel
          script += `echo '${escapedPrompt}' | xclip -selection clipboard 2>/dev/null || echo '${escapedPrompt}' | xsel --clipboard --input 2>/dev/null || true\n`
          script += `echo ""\n`
          script += `echo "══════════════════════════════════════════"\n`
          script += `echo " Life OS — prompt copied to clipboard"\n`
          script += `echo " Paste your first message: Ctrl+Shift+V"\n`
          script += `echo "══════════════════════════════════════════"\n`
          script += `echo ""\n`
        }
      }
      script += `${cliCmd}\n`
      await fs.writeFile(scriptPath, script)
      await fs.chmod(scriptPath, 0o755)
      if (platform === 'darwin') {
        exec(`osascript -e 'tell application "Terminal" to do script "${scriptPath}"' -e 'tell application "Terminal" to activate'`)
      } else {
        // Linux: try common terminal emulators
        exec(`x-terminal-emulator -e "${scriptPath}" 2>/dev/null || gnome-terminal -- bash "${scriptPath}" 2>/dev/null || xterm -e "${scriptPath}" 2>/dev/null`)
      }
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Feed ─────────────────────────────────────────────────────────

const FEED_REACTIONS_FILE = path.join(VAULT, 'feed/reactions.json')
const FEED_AI_CARDS_FILE = path.join(VAULT, 'feed/ai-cards.json')

async function readFeedReactions() {
  try {
    return JSON.parse(await fs.readFile(FEED_REACTIONS_FILE, 'utf-8'))
  } catch {
    return { _type: 'feed_reactions', updated: null, reactions: [] }
  }
}

async function readAiCards() {
  try {
    const data = JSON.parse(await fs.readFile(FEED_AI_CARDS_FILE, 'utf-8'))
    return data.cards || []
  } catch {
    return []
  }
}

async function writeAiCards(cards) {
  await fs.mkdir(path.dirname(FEED_AI_CARDS_FILE), { recursive: true })
  const today = new Date().toISOString().slice(0, 10)
  let reactionsData
  try { reactionsData = await readFeedReactions() } catch { reactionsData = { reactions: [] } }
  const doneRefs = new Set(reactionsData.reactions.filter(r => r.type === 'done').map(r => r.ref))
  // deduplicate by ref — keep newest version of each card
  const byRef = new Map()
  for (const c of cards) {
    const existing = byRef.get(c.ref)
    if (!existing || (c.ts || '') >= (existing.ts || '')) byRef.set(c.ref, c)
  }
  const pruned = [...byRef.values()].filter(c => {
    const age = daysSince(c.ts)
    if (age > 30) return false
    if (age > 7 && doneRefs.has(c.ref)) return false
    return true
  }).sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
  await fs.writeFile(FEED_AI_CARDS_FILE, JSON.stringify({ cards: pruned.slice(0, 100) }, null, 2))
}

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle(arr, rng) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function habitValueDone(habit, value) {
  if (value === undefined || value === null) return false
  if (habit.kind === 'toggle') return value === true
  if (habit.kind === 'counter') {
    const n = typeof value === 'number' ? value : 0
    return habit.target === 0 ? n === 0 : n >= (habit.target || 1)
  }
  if (habit.kind === 'cycle') {
    return Boolean(value) && (habit.cycle_scores?.[value] || 0) >= (habit.max_score || 1)
  }
  if (habit.kind === 'time_window') {
    const tw = habit.time_window
    if (!tw || typeof value !== 'string') return false
    if (tw.end <= tw.start) return value >= tw.start || value <= tw.end
    return value >= tw.start && value <= tw.end
  }
  if (habit.kind === 'bp') return Array.isArray(value) && value.length > 0
  return false
}

function calcHabitStreak(habit, logs) {
  let streak = 0
  const d = new Date()
  const key = () => d.toISOString().slice(0, 10)
  while (habitValueDone(habit, logs[key()]?.habits?.[habit.id])) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  if (streak > 0) return streak
  d.setDate(d.getDate() + 1)
  while (habitValueDone(habit, logs[key()]?.habits?.[habit.id])) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

const FEED_PROMPTS = [
  { id: 'plans',   q: 'Какие планы на сегодня ещё не в задачах?', target: 'inbox' },
  { id: 'day',     q: 'Что произошло сегодня? Пара предложений.', target: 'memory' },
  { id: 'mood',    q: 'Как ты себя чувствуешь прямо сейчас?', target: 'memory' },
  { id: 'thought', q: 'Мысль, которую стоит сохранить?', target: 'insight' },
  { id: 'win',     q: 'Что сегодня шло хорошо, даже мелочь?', target: 'memory' },
  { id: 'grate',   q: 'За что ты сегодня благодарен?', target: 'memory' },
  { id: 'bugging', q: 'Что сейчас бесит или тревожит?', target: 'insight' },
]

const RESURFACE_LABELS = {
  7: 'Неделю назад',
  30: 'Месяц назад',
  91: '3 месяца назад',
  182: 'Полгода назад',
  365: 'Год назад',
}

const FEED_SIZE = 10

app.get('/api/feed', async (req, res) => {
  try {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000)

    const [treeData, memoriesData, insightsData, newsData, reactionsData, listsIndex, habitDefs, inboxData, savedAiCards] = await Promise.all([
      readTree(),
      readMemories(),
      (async () => { try { return JSON.parse(await fs.readFile(path.join(VAULT, 'insights/index.json'), 'utf-8')) } catch { return { insights: [] } } })(),
      readNews(),
      readFeedReactions(),
      (async () => { try { return JSON.parse(await fs.readFile(path.join(VAULT, 'lists/_index.json'), 'utf-8')) } catch { return { collections: [] } } })(),
      (async () => { try { return JSON.parse(await fs.readFile(path.join(VAULT, 'habits/definitions.json'), 'utf-8')) } catch { return { categories: [] } } })(),
      (async () => { try { return JSON.parse(await fs.readFile(path.join(VAULT, 'inbox/current.json'), 'utf-8')) } catch { return { items: [] } } })(),
      readAiCards(),
    ])

    const makeTrace = ({ generated_by, description, data, ...extra }) => ({
      generated_by, description, data: data || {}, generated_at: today, ...extra
    })

    // reactions don't filter the pool — hiding is client-side only
    const dismissed = new Set()

    const cards = []
    const leaves = treeData.nodes
    const leavesByParent = {}
    for (const n of leaves) if (n.parent_id) (leavesByParent[n.parent_id] ||= []).push(n)
    const leafDescendants = (id) => {
      const kids = leavesByParent[id] || []
      if (kids.length === 0) return leaves.find(n => n.id === id) ? [leaves.find(n => n.id === id)] : []
      return kids.flatMap(k => leafDescendants(k.id))
    }

    // news — one per day, seeded selection. Stays the same within a day regardless of rating.
    // Rating is just feedback; it doesn't change which news card appears.
    const newsItems = [...(newsData.items || [])].sort((a, b) => (b.published || '').localeCompare(a.published || ''))
    const newsPool = newsItems.slice(0, 30) // consider 30 newest
    const newsPick = newsPool.length > 0 ? newsPool[Math.floor(Math.random() * newsPool.length)] : null
    if (newsPick && !dismissed.has(`news:${newsPick.id}`)) {
      cards.push({
        ref: `news:${newsPick.id}`, type: 'news', ts: newsPick.published || newsPick.created || today,
        item: newsPick,
        stale_days: daysSince(newsData.updated || today),
        trace: makeTrace({ generated_by: 'rules',
          description: 'Новость из RSS, выбрана seeded по дню',
          data: {
            'Всего новостей': newsItems.length,
            'Пул для выбора': newsPool.length,
            'Unrated': newsItems.filter(i => i.rating == null).length,
            'Сохранённых': newsItems.filter(i => i.saved).length,
            'Источник': newsPick.source_name || '?',
            'Топики': (newsPick.topics || []).join(', ') || '—',
            'Опубликовано': newsPick.published || '—',
            'Оценка': newsPick.rating ?? 'нет',
            'RSS обновлялся': `${daysSince(newsData.updated || today)} дн. назад`,
          },
        }),
      })
    }

    // prompt — one per day, rotates by day + morning/evening
    const prompt = FEED_PROMPTS[(dayOfYear + (now.getHours() < 12 ? 0 : 3)) % FEED_PROMPTS.length]
    const promptRef = `prompt:${prompt.id}:${today}`
    if (!dismissed.has(promptRef)) {
      cards.push({ ref: promptRef, type: 'prompt', ts: today, question: prompt.q, target: prompt.target, prompt_id: prompt.id,
        trace: makeTrace({ generated_by: 'rules',
          description: 'Вопрос дня, ротация по дню + утро/вечер',
          data: {
            'Индекс': `${(dayOfYear + (now.getHours() < 12 ? 0 : 3)) % FEED_PROMPTS.length} из ${FEED_PROMPTS.length}`,
            'Час': `${now.getHours()}:00 (${now.getHours() < 12 ? 'утро' : 'вечер'})`,
            'DayOfYear': dayOfYear,
            'Вопрос': prompt.q,
            'Тип сохранения': prompt.target,
            'Все вопросы': FEED_PROMPTS.map(p => p.id).join(', '),
          },
        }),
      })
    }

    // memories — recent + "on this day"
    const memEntries = memoriesData.entries || []
    let recentMemCount = 0
    for (const entry of [...memEntries].sort((a, b) => (b.date || '').localeCompare(a.date || ''))) {
      if (!entry.date) continue
      const diff = daysSince(entry.date)
      let resurfaced = null
      if (diff === 0) continue
      if (RESURFACE_LABELS[diff]) resurfaced = RESURFACE_LABELS[diff]
      else if (diff > 400 && entry.date.slice(5) === today.slice(5)) resurfaced = `${Math.round(diff / 365)} года назад`
      if (!resurfaced && diff > 14) continue
      // cap recent (non-anniversary) memories at 2 newest
      if (!resurfaced && recentMemCount >= 2) continue
      const ref = `mem:${entry.id}`
      if (!dismissed.has(ref)) {
        cards.push({ ref, type: 'memory', ts: entry.date, entry, resurfaced, days_ago: diff,
          trace: makeTrace({ generated_by: 'rules',
            description: resurfaced ? `On this day: ${resurfaced}` : `Воспоминание за ${diff} дн. назад`,
            data: { 'Дата': entry.date, 'Тип': entry.auto ? 'авто' : 'ручное', 'Resurfaced': resurfaced || 'нет', 'Дней назад': diff, 'Всего записей': memEntries.length, 'Текст': (entry.text || '').slice(0, 80) || '—' },
          }),
        })
        if (!resurfaced) recentMemCount++
      }
    }

    // insights — resurface ones not touched for 2–4 months
    const insightCandidates = (insightsData.insights || [])
      .filter(i => !i.snoozed_until || i.snoozed_until < today)
      .map(i => ({ i, age: daysSince(i.updated || i.created) }))
      .filter(x => x.age >= 14 && x.age <= 120)
      .sort((a, b) => a.age - b.age)
    const pickedInsights = []
    for (const { i, age } of insightCandidates) {
      if (pickedInsights.length >= 5) break
      const ref = `ins:${i.id}`
      if (dismissed.has(ref)) continue
      // diversity: don't surface two parts of the same series in one feed
      if (pickedInsights.some(p => (p.title || '').slice(0, 15) === (i.title || '').slice(0, 15))) continue
      pickedInsights.push(i)
      cards.push({
        ref, type: 'insight', ts: i.updated || i.created,
        insight: i,
        when: age < 35 ? `${Math.max(1, Math.round(age / 7))} нед. назад` : `${Math.round(age / 30)} мес. назад`,
        trace: makeTrace({ generated_by: 'rules',
          description: `Инсайт не обновлялся ${age} дн., resurfaced`,
          data: { 'Возраст': `${age} дн.`, 'Кандидатов': insightCandidates.length, 'Выбрано': pickedInsights.length + 1, 'Теги': (i.tags || []).concat(i.subtags || []).join(', ') || '—', 'Сфера': i.sphere || '—', 'Источник': i.source || '—', 'Заголовок': i.title || '—' },
        }),
      })
    }

    // list files — loaded once, used by picks and the auto memory draft
    const collections = (listsIndex.collections || []).filter(c => c.id !== 'shopping')
    const listFiles = []
    for (const c of collections) {
      let items = []
      try { items = (JSON.parse(await fs.readFile(path.join(VAULT, 'lists', c.file), 'utf-8')).items) || [] } catch { /* skip */ }
      listFiles.push({ c, items })
    }

    // list picks — one random "want" item from up to 2 collections
    const withWants = []
    for (const { c, items } of [...listFiles].sort(() => Math.random() - 0.5)) {
      const want = items.filter(x => x.status === 'want')
      if (want.length > 0) withWants.push({ c, pick: want[Math.floor(Math.random() * want.length)] })
      if (withWants.length >= 4) break
    }
    for (const { c, pick } of withWants) {
      const ref = `list:${c.id}:${pick.id}`
      if (!dismissed.has(ref)) {
        const listData = listFiles.find(l => l.c.id === c.id)
        const listItems = listData?.items || []
        cards.push({ ref, type: 'list_pick', ts: pick.updated || pick.added || today, list: c.id, list_label: c.label, item: pick,
          trace: makeTrace({ generated_by: 'rules',
            description: `Случайный want из «${c.label}», seeded shuffle`,
            data: { 'Список': c.label, 'Выбрано': pick.title, 'Want в списке': listItems.filter(x => x.status === 'want').length, 'Всего в списке': listItems.length, 'Добавлено': pick.added || '—', 'Теги': (pick.tags || []).join(', ') || '—' },
          }),
        })
      }
    }

    // habit streaks — notable only (7+ days, or a 7+ day streak broke)
    const logDir = path.join(VAULT, 'habits/log')
    const logs = {}
    try {
      for (const f of await fs.readdir(logDir)) {
        if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) continue
        try { logs[f.slice(0, 10)] = JSON.parse(await fs.readFile(path.join(logDir, f), 'utf-8')) } catch { /* skip */ }
      }
    } catch { /* no log dir */ }
    for (const cat of habitDefs.categories || []) {
      for (const habit of cat.habits || []) {
        if (!habit.active) continue
        const streak = calcHabitStreak(habit, logs)
        const todayDone = habitValueDone(habit, logs[today]?.habits?.[habit.id])
        if (todayDone && streak >= 7) {
          const ref = `streak:${habit.id}:${today}`
          if (!dismissed.has(ref)) cards.push({ ref, type: 'streak', ts: today, habit: { id: habit.id, label: habit.label }, streak, broken: false,
            trace: makeTrace({ generated_by: 'rules',
              description: `Стрик ${streak} дней по habit log`,
              data: { 'Привычка': habit.label, 'Категория': cat.label, 'Стрик': streak, 'Сегодня': 'сделано', 'Дней логов': Object.keys(logs).length, 'Тип': habit.kind, 'Цель': habit.target ?? '—' },
            }),
          })
        } else if (!todayDone && streak >= 7) {
          const ref = `streak:${habit.id}:${today}`
          if (!dismissed.has(ref)) cards.push({ ref, type: 'streak', ts: today, habit: { id: habit.id, label: habit.label }, streak, broken: true,
            trace: makeTrace({ generated_by: 'rules',
              description: `Стрик ${streak} дней прервался`,
              data: { 'Привычка': habit.label, 'Категория': cat.label, 'Стрик': streak, 'Сегодня': 'пропущено', 'Дней логов': Object.keys(logs).length, 'Тип': habit.kind, 'Цель': habit.target ?? '—' },
            }),
          })
        }
      }
    }

    // auto memory — "yesterday in numbers" is saved on its own if the day has no entry yet.
    // Once saved it is never touched again: the user edits/deletes it freely.
    // Deleting an auto entry records a done reaction so it is never regenerated for that day.
    let autoMemCard = null
    const yest = addDaysToDate(today, -1)
    const hasMemForYest = (memoriesData.entries || []).some(e => e.date === yest)
    if (!hasMemForYest && !reactionsData.reactions.some(r => r.ref === `auto-mem:${yest}` && r.type === 'done')) {
      const doneTasks = leaves
        .filter(n => n.status === 'done' && n.updated === yest && !(leavesByParent[n.id] || []).length)
        .map(n => n.title)
      const ylog = logs[yest]
      const activeHabits = (habitDefs.categories || []).flatMap(cat => cat.habits || [])
        .filter(h => h.active)
      const doneHabits = activeHabits.filter(h => habitValueDone(h, ylog?.habits?.[h.id]))
      const missedCount = activeHabits.length - doneHabits.length
      const doneLists = listFiles.flatMap(({ c, items }) =>
        items.filter(i => i.status === 'done' && i.updated === yest).map(i => ({ label: c.label, title: i.title })))
      const parts = []
      if (doneTasks.length > 0) parts.push('Сделано: ' + doneTasks.slice(0, 6).map(t => `«${t}»`).join(', '))
      if (ylog && activeHabits.length > 0) {
        parts.push(`Привычки: ${doneHabits.length}/${activeHabits.length}` +
          (doneHabits.length === 0 ? '' :
           missedCount === 0 ? ' — всё сделал! ' + doneHabits.map(h => h.label).join(', ') :
           ' — ' + doneHabits.map(h => h.label).join(', ')))
      }
      if (doneLists.length > 0) parts.push('Списки: ' + doneLists.slice(0, 6).map(x => `${x.label}: «${x.title}»`).join(', '))
      if (parts.length > 0) {
        const entry = {
          id: `mem-${Date.now()}`,
          date: yest,
          text: parts.join('\n\n'),
          photos: [],
          created: today,
          updated: today,
          auto: true,
        }
        memoriesData.entries.push(entry)
        await writeMemories(memoriesData)
        autoMemCard = { ref: `mem:${entry.id}`, type: 'memory', ts: yest, entry, resurfaced: null, days_ago: 1,
          trace: makeTrace({ generated_by: 'rules',
            description: 'Авто-воспоминание: вчера в цифрах',
            data: { 'Задачи сделано': doneTasks.length, 'Задачи': doneTasks.slice(0, 5).join(', ') || '—', 'Привычки': `${doneHabits.length}/${activeHabits.length}`, 'Сделанные привычки': doneHabits.map(h => h.label).join(', ') || '—', 'Пропущено': missedCount, 'Списки сделано': doneLists.length, 'Списки': doneLists.slice(0, 5).map(x => `${x.label}: ${x.title}`).join('; ') || '—' },
          }),
        }
        cards.push(autoMemCard)
      }
    }

    // overdue nudge
    const overdue = leaves
      .filter(n => n.due && n.due < today && ['scheduled', 'in_progress'].includes(n.status))
      .sort((a, b) => a.due.localeCompare(b.due))
    if (overdue.length > 0) {
      const ref = 'overdue'
      if (!dismissed.has(ref)) {
        cards.push({
          ref, type: 'overdue', ts: today, count: overdue.length,
          tasks: overdue.slice(0, 3).map(n => ({ id: n.id, title: n.title, due: n.due, days: daysSince(n.due) })),
          trace: makeTrace({ generated_by: 'rules',
            description: `${overdue.length} задач просрочено`,
            data: { 'Всего': overdue.length, 'Показано': Math.min(3, overdue.length), 'Самый старый': overdue[0] ? `${daysSince(overdue[0].due)} дн. (${overdue[0].title})` : '—', 'Все задачи': overdue.slice(0, 10).map(n => `${n.title} (${daysSince(n.due)}дн)`).join('; '), 'Сферы': [...new Set(overdue.map(n => { let c = n; const m = Object.fromEntries(leaves.map(x=>[x.id,x])); while(c.parent_id && m[c.parent_id]) c=m[c.parent_id]; return c.title }))].join(', ') },
            truncation: overdue.length > 3 ? { shown: 3, total: overdue.length } : undefined,
          }),
        })
      }
    }

    // upcoming — what is scheduled in the next 3 days
    const upcoming = leaves
      .filter(n => n.due && n.due >= today && n.due <= addDaysToDate(today, 3) && n.status === 'scheduled')
      .sort((a, b) => a.due.localeCompare(b.due))
    if (upcoming.length > 0) {
      const ref = 'upcoming'
      if (!dismissed.has(ref)) {
        cards.push({
          ref, type: 'upcoming', ts: today, count: upcoming.length,
          tasks: upcoming.slice(0, 3).map(n => ({ id: n.id, title: n.title, due: n.due })),
          trace: makeTrace({ generated_by: 'rules',
            description: `${upcoming.length} задач в ближайшие 3 дня`,
            data: { 'Всего': upcoming.length, 'Показано': Math.min(3, upcoming.length), 'Сегодня': upcoming.filter(n => n.due === today).length, 'Завтра': upcoming.filter(n => n.due === addDaysToDate(today, 1)).length, 'Послезавтра': upcoming.filter(n => n.due === addDaysToDate(today, 2)).length, 'Все задачи': upcoming.slice(0, 10).map(n => `${n.title} (${n.due})`).join('; ') },
            truncation: upcoming.length > 3 ? { shown: 3, total: upcoming.length } : undefined,
          }),
        })
      }
    }

    // habits stale — tracking has gone quiet
    const lastLog = Object.keys(logs).filter(d => d < today).sort().pop()
    const lastLogToday = logs[today]
    if (!lastLogToday && lastLog && daysSince(lastLog) >= 3) {
      const ref = 'habits-stale'
      if (!dismissed.has(ref)) {
        cards.push({ ref, type: 'habits_stale', ts: lastLog, last_log: lastLog, stale_days: daysSince(lastLog),
          trace: makeTrace({ generated_by: 'rules',
            description: `Привычки не логались ${daysSince(lastLog)} дней`,
            data: { 'Последний лог': lastLog, 'Дней тишины': daysSince(lastLog), 'Всего дней логов': Object.keys(logs).length, 'Активных привычек': (habitDefs.categories || []).flatMap(c => c.habits || []).filter(h => h.active).length },
          }),
        })
      }
    }

    // goal progress
    const weekAgo = addDaysToDate(today, -7)
    const goalCards = []
    for (const n of leaves) {
      if (n.parent_id === null) continue
      const kids = leavesByParent[n.id] || []
      if (kids.length === 0) continue
      const under = leafDescendants(n.id)
      const total = under.length
      if (total === 0) continue
      const done = under.filter(l => l.status === 'done' || l.status === 'dropped').length
      const thisWeek = under.filter(l => ['done', 'dropped'].includes(l.status) && (l.updated || '') >= weekAgo).length
      if (done === 0 && thisWeek === 0) continue
      goalCards.push({ n, total, done, thisWeek, under })
    }
    goalCards.sort((a, b) => (b.n.updated || '').localeCompare(a.n.updated || ''))
    for (const { n, total, done, thisWeek, under } of goalCards.slice(0, 5)) {
      const ref = `goal:${n.id}`
      if (!dismissed.has(ref)) {
        cards.push({
          ref, type: 'goal', ts: n.updated || today,
          goal: { id: n.id, title: n.title, color: n.color || null },
          done, total, pct: Math.round((done / total) * 100), this_week: thisWeek,
          trace: makeTrace({ generated_by: 'rules',
            description: `Прогресс цели: ${done}/${total} (${Math.round((done / total) * 100)}%)`,
            data: { 'Цель': n.title, 'Сделано': done, 'Всего': total, 'За неделю': `+${thisWeek}`, 'Процент': `${Math.round((done / total) * 100)}%`, 'Статусы': { done: under.filter(l => l.status === 'done').length, dropped: under.filter(l => l.status === 'dropped').length, in_progress: under.filter(l => l.status === 'in_progress').length, scheduled: under.filter(l => l.status === 'scheduled').length, undefined: under.filter(l => !l.status || l.status === 'undefined').length } },
          }),
        })
      }
    }

    // completed resurface — "you did X N days ago"
    const completed = leaves
      .filter(n => n.status === 'done' && (n.updated || '') >= addDaysToDate(today, -7) && (n.updated || '') <= today)
      .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))
    for (const n of completed.slice(0, 10)) {
      if ((leavesByParent[n.id] || []).length > 0) continue
      const ref = `done:${n.id}:${n.updated}`
      if (dismissed.has(ref)) continue
      cards.push({ ref, type: 'done', ts: n.updated, task: { id: n.id, title: n.title }, days_ago: daysSince(n.updated),
        trace: makeTrace({ generated_by: 'rules',
          description: `Завершено ${daysSince(n.updated)} дн. назад`,
          data: { 'Задача': n.title, 'Дней назад': daysSince(n.updated), 'Сфера': (() => { let c = n; const m = Object.fromEntries(leaves.map(x=>[x.id,x])); while(c.parent_id && m[c.parent_id]) c=m[c.parent_id]; return c.title })() },
        }),
      })
    }

    // inbox pending
    const inboxItems = inboxData.items || []
    if (inboxItems.length > 0) {
      const ref = 'inbox-pending'
      if (!dismissed.has(ref)) {
        cards.push({ ref, type: 'inbox_pending', ts: today, count: inboxItems.length, oldest: inboxItems[0]?.created,
          trace: makeTrace({ generated_by: 'rules',
            description: `${inboxItems.length} записей в inbox`,
            data: { 'Всего': inboxItems.length, 'Старейшая': inboxItems[0]?.added || inboxItems[0]?.created || '—', 'Тексты': inboxItems.slice(0, 5).map(i => (i.text || '').slice(0, 40)).join('; ') || '—' },
          }),
        })
      }
    }

    // stale in_progress — tasks stuck for 5+ days
    const staleInProgress = leaves
      .filter(n => n.status === 'in_progress' && n.updated && daysSince(n.updated) >= 5 && !(leavesByParent[n.id] || []).length)
      .sort((a, b) => a.updated.localeCompare(b.updated))
    if (staleInProgress.length > 0) {
      const ref = 'stale-inprogress'
      if (!dismissed.has(ref)) {
        cards.push({
          ref, type: 'stale_inprogress', ts: today, count: staleInProgress.length,
          tasks: staleInProgress.slice(0, 3).map(n => ({ id: n.id, title: n.title, days: daysSince(n.updated) })),
          trace: makeTrace({ generated_by: 'rules',
            description: `${staleInProgress.length} задач зависло в in_progress`,
            data: { 'Всего': staleInProgress.length, 'Показано': Math.min(3, staleInProgress.length), 'Самый старый': staleInProgress[0] ? `${daysSince(staleInProgress[0].updated)} дн. (${staleInProgress[0].title})` : '—', 'Все задачи': staleInProgress.slice(0, 10).map(n => `${n.title} (${daysSince(n.updated)}дн)`).join('; ') },
            truncation: staleInProgress.length > 3 ? { shown: 3, total: staleInProgress.length } : undefined,
          }),
        })
      }
    }

    // people stale — no updates for 30+ days
    try {
      const peopleIndex = JSON.parse(await fs.readFile(PEOPLE_INDEX, 'utf-8'))
      const peopleWithDates = await Promise.all(
        peopleIndex.people.map(async p => {
          const content = await fs.readFile(path.join(WORK_DIR, p.file), 'utf-8').catch(() => '')
          const dates = (content.match(/\d{4}-\d{2}-\d{2}/g) || []).sort()
          const lastDate = dates[dates.length - 1] || null
          return { id: p.id, name: p.name, last_date: lastDate, days: lastDate ? daysSince(lastDate) : 999 }
        })
      )
      const stalePeople = peopleWithDates.filter(p => p.days >= 30).sort((a, b) => b.days - a.days)
      if (stalePeople.length > 0) {
        const ref = `people-stale:${stalePeople[0].id}`
        if (!dismissed.has(ref)) {
          cards.push({ ref, type: 'people_stale', ts: today, people: stalePeople.slice(0, 3),
            trace: makeTrace({ generated_by: 'rules',
              description: `${stalePeople.length} человек без записей 30+ дн.`,
              data: { 'Всего': stalePeople.length, 'Показано': Math.min(3, stalePeople.length), 'Все': stalePeople.slice(0, 10).map(p => `${p.name} (${p.days}дн)`).join('; ') },
              truncation: stalePeople.length > 3 ? { shown: 3, total: stalePeople.length } : undefined,
            }),
          })
        }
      }
    } catch { /* skip */ }

    // --- nudge cards (initiation) ---
    const hour = now.getHours()
    const dow = now.getDay()
    const monday = addDaysToDate(today, dow === 0 ? -6 : 1 - dow)

    // no_memory_yesterday — nothing recorded for yesterday
    if (!memEntries.some(e => e.date === yest) && !autoMemCard) {
      const ref = `nudge:no-memory-yesterday:${yest}`
      if (!dismissed.has(ref)) {
        cards.push({ ref, type: 'nudge', ts: today, nudge_type: 'no_memory_yesterday',
          message: 'Вчера прошло без единой записи. Что было?',
          action_label: 'Записать', action_target: 'memory', action_link: '/memories',
          trace: makeTrace({ generated_by: 'rules',
            description: 'Нет записи за вчера',
            data: { 'nudge_type': 'no_memory_yesterday', 'Вчера': yest, 'Записей за вчера': memEntries.filter(e => e.date === yest).length },
            nudge_type: 'no_memory_yesterday',
          }),
        })
      }
    }

    // no_memory_today — no entry for today, evening only
    if (!memEntries.some(e => e.date === today) && hour >= 20) {
      const ref = `nudge:no-memory-today:${today}`
      if (!dismissed.has(ref)) {
        cards.push({ ref, type: 'nudge', ts: today, nudge_type: 'no_memory_today',
          message: 'Сегодня ещё нет записи. Что происходило?',
          action_label: 'Записать', action_target: 'memory', action_link: '/memories',
          trace: makeTrace({ generated_by: 'rules',
            description: 'Нет записи за сегодня (вечер)',
            data: { 'nudge_type': 'no_memory_today', 'Час': hour },
            nudge_type: 'no_memory_today',
          }),
        })
      }
    }

    // habits_not_logged — no habit log for today, afternoon+
    if (!logs[today] && hour >= 14) {
      const ref = `nudge:habits-today:${today}`
      if (!dismissed.has(ref)) {
        cards.push({ ref, type: 'nudge', ts: today, nudge_type: 'habits_not_logged',
          message: 'Привычки ещё не залогированы сегодня',
          action_label: 'Заполнить', action_target: null, action_link: '/habits',
          trace: makeTrace({ generated_by: 'rules',
            description: 'Привычки не залогированы сегодня',
            data: { 'nudge_type': 'habits_not_logged', 'Час': hour, 'Есть лог за сегодня': !!logs[today] },
            nudge_type: 'habits_not_logged',
          }),
        })
      }
    }

    // no_tasks_done_week — no leaf completed this week
    const weekDone = leaves.some(n => n.status === 'done' && (n.updated || '') >= monday && !(leavesByParent[n.id] || []).length)
    if (!weekDone) {
      const ref = `nudge:no-done-week:${monday}`
      if (!dismissed.has(ref)) {
        cards.push({ ref, type: 'nudge', ts: today, nudge_type: 'no_tasks_done_week',
          message: 'Ни одной задачи не завершено на этой неделе',
          action_label: 'К задачам', action_target: null, action_link: '/pool',
          trace: makeTrace({ generated_by: 'rules',
            description: 'Нет завершённых задач на неделе',
            data: { 'nudge_type': 'no_tasks_done_week', 'Неделя с': monday },
            nudge_type: 'no_tasks_done_week',
          }),
        })
      }
    }

    // no_insights_lately — newest insight older than 14 days
    const newestInsight = (insightsData.insights || []).sort((a, b) => (b.updated || b.created || '').localeCompare(a.updated || a.created || ''))[0]
    if (newestInsight && daysSince(newestInsight.updated || newestInsight.created) >= 14) {
      const ref = 'nudge:no-insights'
      if (!dismissed.has(ref)) {
        cards.push({ ref, type: 'nudge', ts: today, nudge_type: 'no_insights_lately',
          message: 'Инсайтов давно не было. Есть наблюдение?',
          action_label: 'Добавить', action_target: 'insight', action_link: '/insights',
          trace: makeTrace({ generated_by: 'rules',
            description: `Инсайтов давно не было (${daysSince(newestInsight.updated || newestInsight.created)} дн.)`,
            data: { 'nudge_type': 'no_insights_lately', 'Новейший инсайт': newestInsight.title, 'Дней назад': daysSince(newestInsight.updated || newestInsight.created) },
            nudge_type: 'no_insights_lately',
          }),
        })
      }
    }

    // list_stale — a list not updated in 30 days (show 1, the stalest)
    const staleLists = listFiles
      .map(({ c, items }) => {
        const newest = items.reduce((max, i) => { const d = i.updated || i.added || ''; return d > max ? d : max }, '')
        return { id: c.id, label: c.label, last_updated: newest, days: daysSince(newest) }
      })
      .filter(l => l.days >= 30)
      .sort((a, b) => b.days - a.days)
    if (staleLists.length > 0) {
      const sl = staleLists[0]
      const ref = `nudge:list-stale:${sl.id}:${today}`
      if (!dismissed.has(ref)) {
        cards.push({ ref, type: 'nudge', ts: today, nudge_type: 'list_stale',
          message: `Список «${sl.label}» не обновлялся ${sl.days} дней`,
          action_label: 'Открыть', action_target: null, action_link: '/lists',
          trace: makeTrace({ generated_by: 'rules',
            description: `Список «${sl.label}» не обновлялся ${sl.days} дн.`,
            data: { 'nudge_type': 'list_stale', 'Список': sl.label, 'Дней': sl.days, 'Последнее обновление': sl.last_updated || '—' },
            nudge_type: 'list_stale',
          }),
        })
      }
    }

    // no_in_progress — no active tasks but scheduled ones exist
    const hasInProgress = leaves.some(n => n.status === 'in_progress' && !(leavesByParent[n.id] || []).length)
    const hasScheduled = leaves.some(n => n.status === 'scheduled' && !(leavesByParent[n.id] || []).length)
    if (!hasInProgress && hasScheduled) {
      const ref = `nudge:no-inprogress:${today}`
      if (!dismissed.has(ref)) {
        cards.push({ ref, type: 'nudge', ts: today, nudge_type: 'no_in_progress',
          message: 'Нет задач в работе. Выбери что-то из запланированного.',
          action_label: 'К пулу', action_target: null, action_link: '/pool',
          trace: makeTrace({ generated_by: 'rules',
            description: 'Нет in_progress, но есть scheduled',
            data: { 'nudge_type': 'no_in_progress', 'В работе': hasInProgress ? 'да' : 'нет', 'Запланировано': hasScheduled ? 'да' : 'нет' },
            nudge_type: 'no_in_progress',
          }),
        })
      }
    }

    // goals_static_week — no non-root node updated this week → trigger AI analysis
    const activeNodes = leaves.filter(n => n.parent_id !== null && !['done', 'dropped', 'someday'].includes(n.status))
    const anyMovedThisWeek = activeNodes.some(n => (n.updated || '') >= monday)
    if (activeNodes.length > 0 && !anyMovedThisWeek) {
      // check if AI card already exists for this week
      const goalCardRef = `ai-goals-week-${monday}`
      const hasAiGoalCard = savedAiCards.some(c => c.ref === goalCardRef)
      if (!hasAiGoalCard) {
        // fire async AI analysis — result will appear as an AI card on next refresh
        triggerGoalAnalysis(monday).catch(e => console.error('Goal analysis trigger failed:', e.message))
        // show placeholder nudge only while AI is generating
        const ref = `nudge:goals-static:${monday}`
        if (!dismissed.has(ref)) {
          cards.push({ ref, type: 'nudge', ts: today, nudge_type: 'goals_static_week',
            message: 'Анализирую дерево целей — скоро появится карточка с фокусом на неделю',
            action_label: 'К целям', action_target: null, action_link: '/goals',
            trace: makeTrace({ generated_by: 'ai',
              description: 'AI анализ целей: дерево не двигалось с ' + monday,
              data: { 'nudge_type': 'goals_static_week', 'Активных узлов': activeNodes.length, 'Неделя с': monday, 'Ни один не обновлялся': true },
              nudge_type: 'goals_static_week',
              ai_prompt_summary: 'Анализ дерева целей на неделю',
              ai_input_summary: `Активных узлов: ${activeNodes.length}, ни один не обновлялся с ${monday}`,
            }),
          })
        }
      }
      // if AI card exists, it already appears via savedAiCards — no duplicate nudge
    }

    // attach note job status to cards that have been note-processed
    try {
      const noteJobsData = await readNoteJobs()
      const jobsByRef = {}
      for (const j of noteJobsData.jobs) {
        if (!jobsByRef[j.ref] || j.created > jobsByRef[j.ref].created) jobsByRef[j.ref] = j
      }
      for (const c of cards) {
        const job = jobsByRef[c.ref]
        if (job) {
          c.trace = c.trace || {}
          c.trace.note_job = { id: job.id, status: job.status, result_summary: job.result_summary, error: job.error }
        }
      }
    } catch { /* skip */ }

    // random shuffle pool, diversity spread (no same type adjacent), take FEED_SIZE
    const poolSize = cards.length
    const shuffled = [...cards].sort(() => Math.random() - 0.5)
    const spread = []
    for (const c of shuffled) {
      let pos = spread.length
      while (pos > 0 && spread[pos - 1].type === c.type) pos--
      spread.splice(pos, 0, c)
    }
    const selected = spread.slice(0, FEED_SIZE)

    // AI cards (not interacted today), at most 3 most recent, prepended
    const aiLastGenerated = savedAiCards.length > 0
      ? savedAiCards.map(c => c.ts || '').sort().pop()
      : null
    const thisWeekPrefix = `ai-goals-week-${monday}`
    const thisWeekAiCards = savedAiCards.filter(c => c.ref.startsWith(thisWeekPrefix) && !dismissed.has(c.ref))
    // show all this week's AI cards; fallback to 1 newest overall
    const aiCards = thisWeekAiCards.length > 0
      ? [...thisWeekAiCards].sort(() => Math.random() - 0.5)
      : savedAiCards.filter(c => !dismissed.has(c.ref)).sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).slice(0, 1)
      .map(c => ({
        ...c,
        trace: c.trace || {
          generated_by: 'ai', generated_at: c.ts || today,
          description: c.meta?.subtitle || `AI-карточка типа ${c.type}`,
          data: { 'Тип': c.type },
          ai_reasoning: c.meta?.subtitle, ai_tone: c.meta?.tone,
        },
      }))

    res.set('Cache-Control', 'no-store')
    res.json({ date: today, cards: [...aiCards, ...selected], pool_size: poolSize, ai_last_generated: aiLastGenerated })
  } catch (e) {
    console.error('FEED ERROR:', e.stack)
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/feed/reactions', async (req, res) => {
  const { ref, type } = req.body || {}
  if (!ref || !type) return res.status(400).json({ error: 'ref and type required' })
  try {
    const data = await readFeedReactions()
    const now = new Date()
    const reaction = { ref, type, ts: now.toISOString() }
    if (req.body.text != null) reaction.text = req.body.text
    data.reactions.push(reaction)
    data.updated = now.toISOString().slice(0, 10)
    await fs.mkdir(path.dirname(FEED_REACTIONS_FILE), { recursive: true })
    await fs.writeFile(FEED_REACTIONS_FILE, JSON.stringify(data, null, 2))
    autoMemory('Реакция', `${type} на ${ref}${req.body.text ? ': ' + req.body.text : ''}`)
    res.json(reaction)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/feed/reactions', async (req, res) => {
  try {
    const data = await readFeedReactions()
    res.json(data.reactions)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Note Processing (fire-and-forget AI) ────────────────────

const NOTE_JOBS_FILE = path.join(VAULT, 'feed/note-jobs.json')

async function readNoteJobs() {
  try { return JSON.parse(await fs.readFile(NOTE_JOBS_FILE, 'utf-8')) }
  catch { return { jobs: [] } }
}

async function writeNoteJobs(data) {
  await fs.mkdir(path.dirname(NOTE_JOBS_FILE), { recursive: true })
  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = addDaysToDate(today, -7)
  data.jobs = data.jobs.filter(j => (j.created || '').slice(0, 10) >= sevenDaysAgo)
  if (data.jobs.length > 200) data.jobs = data.jobs.slice(-200)
  await fs.writeFile(NOTE_JOBS_FILE, JSON.stringify(data, null, 2))
}

async function updateNoteJob(jobId, patch) {
  const data = await readNoteJobs()
  const idx = data.jobs.findIndex(j => j.id === jobId)
  if (idx !== -1) { Object.assign(data.jobs[idx], patch); await writeNoteJobs(data) }
}

app.post('/api/feed/note-process', async (req, res) => {
  const { ref, text, card_type, card_context } = req.body || {}
  if (!ref || !text) return res.status(400).json({ error: 'ref and text required' })
  try {
    // 1. save note as reaction
    const data = await readFeedReactions()
    const now = new Date()
    const reaction = { ref, type: 'note', text, ts: now.toISOString() }
    data.reactions.push(reaction)
    data.updated = now.toISOString().slice(0, 10)
    await fs.mkdir(path.dirname(FEED_REACTIONS_FILE), { recursive: true })
    await fs.writeFile(FEED_REACTIONS_FILE, JSON.stringify(data, null, 2))

    // 2. create job record
    const jobId = `nj-${Date.now()}`
    const jobs = await readNoteJobs()
    jobs.jobs.push({ id: jobId, ref, text, card_type, card_context: card_context || null,
      status: 'pending', created: now.toISOString(), completed: null, result_summary: null, error: null })
    await writeNoteJobs(jobs)

    autoMemory('Заметка', `на ${ref}: ${text.slice(0, 100)}`)

    // 3. fire async (don't await)
    processNoteJob(jobId, ref, text, card_type, card_context).catch(e => {
      console.error(`Note job ${jobId} failed:`, e.message)
    })

    res.json({ ok: true, job_id: jobId })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/feed/note-jobs', async (req, res) => {
  try {
    const data = await readNoteJobs()
    res.json(data.jobs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

async function processNoteJob(jobId, ref, text, cardType, cardContext) {
  await updateNoteJob(jobId, { status: 'running' })
  try {
    const today = new Date().toISOString().slice(0, 10)
    const reactionsData = await readFeedReactions()
    const recentReactions = reactionsData.reactions.slice(-20)

    const prompt = `Today is ${today}. The user wrote a note on a feed card.

Card ref: ${ref}
Card type: ${cardType}
Card context: ${JSON.stringify(cardContext || {})}
Note text: ${text}

Recent feed reactions (last 20): ${JSON.stringify(recentReactions)}

Analyze this note. The note serves dual purpose: feedback AND a searchable memory.

Choose 0-2 actions from:
- create_memory: { text: "...", date: "${today}" } — save as a memory entry
- create_insight: { title: "...", body: "...", tags: ["психология"|"здоровье"|"системы"], subtags: [] } — save as insight
- create_task: { title: "...", parent_id: "root-{sphere}" } — create a task node
- create_inbox: { text: "..." } — add to inbox
- create_ai_card: { ref: "ai-note-{slug}", title: "...", body: "...", actions: [{id,label,primary?}] } — add a follow-up card to the feed

Rules:
- Don't create a memory if the note is purely feedback (e.g. "not interesting")
- Don't create a task from trivial reactions
- create_ai_card only if there's a genuine follow-up worth showing later
- Russian for all user-facing text
- Be conservative — 0 actions is fine if the note is just a reaction

Return ONLY this JSON between the exact markers:
---JSON---
{ "actions": [], "summary": "one sentence in Russian" }
---JSON---`

    const raw = await runClaudeTask(prompt, 120000)
    const result = extractJson(raw)
    const actions = result.actions || []
    const summaries = []

    for (const action of actions) {
      try {
        if (action.create_memory) {
          const memData = await readMemories()
          const entry = { id: `mem-${Date.now()}`, date: action.create_memory.date || today,
            text: action.create_memory.text, photos: [], created: today, updated: today }
          memData.entries.push(entry)
          await writeMemories(memData)
          summaries.push('memory created')
        } else if (action.create_insight) {
          const filePath = path.join(VAULT, 'insights/index.json')
          const data = JSON.parse(await fs.readFile(filePath, 'utf-8'))
          const insight = { id: `ins-${Date.now()}`, title: '', body: '', tags: [], subtags: [],
            sphere: null, source: 'feed_note', created: today, updated: today, ...action.create_insight }
          data.insights.push(insight)
          data.updated = today
          await fs.writeFile(filePath, JSON.stringify(data, null, 2))
          summaries.push('insight created')
        } else if (action.create_task) {
          const treeData = await readTree()
          const node = { id: `node-${Date.now()}`, title: '', outcome: null, parent_id: null,
            calendar_id: null, watched: false, color: null, status: 'undefined',
            due: null, notes: null, recurrence: null, created: today, updated: today, ...action.create_task }
          treeData.nodes.push(node)
          await writeTree(treeData)
          summaries.push('task created')
        } else if (action.create_inbox) {
          const filePath = path.join(VAULT, 'inbox/current.json')
          const data = JSON.parse(await fs.readFile(filePath, 'utf-8'))
          const item = { id: `inbox-${Date.now()}`, added: today, tags: [], text: action.create_inbox.text }
          data.items.push(item)
          data.updated = today
          await fs.writeFile(filePath, JSON.stringify(data, null, 2))
          summaries.push('added to inbox')
        } else if (action.create_ai_card) {
          const existing = await readAiCards()
          existing.push({ ...action.create_ai_card, type: 'ai_note', ts: today })
          await writeAiCards(existing)
          summaries.push('AI card created')
        }
      } catch (e) {
        console.error(`Note job ${jobId} action failed:`, e.message)
      }
    }

    await updateNoteJob(jobId, { status: 'done', completed: new Date().toISOString(),
      result_summary: result.summary || (summaries.length ? summaries.join(', ') : 'no actions') })
  } catch (e) {
    await updateNoteJob(jobId, { status: 'error', completed: new Date().toISOString(), error: e.message })
  }
}

// ─── Goal Analysis AI Card ────────────────────────────────────────

const GOAL_ANALYSIS_STATUS = new Map()
// { ref → { status: 'running'|'done'|'error', started_at, finished_at?, error? } }

function currentMonday() {
  const today = new Date().toISOString().slice(0, 10)
  const dow = new Date().getDay()
  return addDaysToDate(today, dow === 0 ? -6 : 1 - dow)
}

const GENERATION_MODES = [
  {
    id: 'action',
    instruction: 'Push to act. Surface stalled tasks, overdue things, concrete next steps. Prefer nudge and challenge cards.',
  },
  {
    id: 'reflection',
    instruction: 'Go introspective. Surface inner questions, cross-source patterns, unprocessed insights. Prefer reflection and pattern cards.',
  },
  {
    id: 'celebration',
    instruction: 'Be warm and positive. Surface wins, streaks, and progress worth acknowledging. Prefer celebration and motivating nudge cards.',
  },
  {
    id: 'challenge',
    instruction: 'Growth-oriented. Surface experiments, comfort-zone edges, things slightly outside routine. Prefer challenge and pattern cards.',
  },
]

function weeklyMode(monday) {
  const wn = Math.floor(new Date(monday + 'T12:00:00').getTime() / (7 * 24 * 60 * 60 * 1000))
  return GENERATION_MODES[wn % GENERATION_MODES.length]
}

async function triggerGoalAnalysis(monday, force = false) {
  const cardRef = `ai-goals-week-${monday}`
  if (GOAL_ANALYSIS_STATUS.get(cardRef)?.status === 'running') return
  const started_at = new Date().toISOString()
  GOAL_ANALYSIS_STATUS.set(cardRef, { status: 'running', started_at })
  const existing = await readAiCards()
  if (!force && existing.some(c => c.ref.startsWith(cardRef))) {
    GOAL_ANALYSIS_STATUS.set(cardRef, { status: 'idle' })
    return
  }
  const mode = weeklyMode(monday)
  const prevCards = existing
    .filter(c => {
      const prevRef1 = `ai-goals-week-${addDaysToDate(monday, -7)}`
      const prevRef2 = `ai-goals-week-${addDaysToDate(monday, -14)}`
      return c.ref?.startsWith(prevRef1) || c.ref?.startsWith(prevRef2)
    })
    .map(c => ({ type: c.type, subtitle: c.meta?.subtitle || c.message?.slice(0, 80) || c.title?.slice(0, 80) || '' }))
    .filter(c => c.subtitle)

  try {
    const today = new Date().toISOString().slice(0, 10)

    // load all available context in parallel
    const [treeData, memoriesData, insightsData, inboxData, habitDefs] = await Promise.all([
      readTree(),
      readMemories(),
      fs.readFile(path.join(VAULT, 'insights/index.json'), 'utf-8').then(JSON.parse).catch(() => ({ insights: [] })),
      fs.readFile(path.join(VAULT, 'inbox/current.json'), 'utf-8').then(JSON.parse).catch(() => ({ items: [] })),
      fs.readFile(path.join(VAULT, 'habits/definitions.json'), 'utf-8').then(JSON.parse).catch(() => ({ categories: [] })),
    ])

    // habit logs — last 14 days
    const logDir = path.join(VAULT, 'habits/log')
    const habitLogs = {}
    try {
      for (const f of await fs.readdir(logDir)) {
        if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) continue
        const d = f.slice(0, 10)
        if (d >= addDaysToDate(today, -14)) {
          habitLogs[d] = JSON.parse(await fs.readFile(path.join(logDir, f), 'utf-8'))
        }
      }
    } catch {}

    // tree summary
    const nodes = treeData.nodes || []
    const roots = nodes.filter(n => n.parent_id === null)
    const treeSummary = roots.map(root => {
      const children = nodes.filter(n => n.parent_id === root.id)
      const grandchildren = children.flatMap(c => nodes.filter(n => n.parent_id === c.id))
      const allUnder = [...children, ...grandchildren]
      const activeCount = allUnder.filter(n => !['done','dropped'].includes(n.status)).length
      const doneCount = allUnder.filter(n => n.status === 'done').length
      const inProgressItems = allUnder.filter(n => n.status === 'in_progress').map(n => n.title)
      const scheduledItems = allUnder.filter(n => n.status === 'scheduled').map(n => ({ title: n.title, due: n.due }))
      const undefinedItems = allUnder.filter(n => n.status === 'undefined').map(n => n.title)
      const lastUpdated = allUnder.map(n => n.updated || '').sort().pop() || ''
      return { sphere: root.title, activeCount, doneCount, inProgressItems, scheduledItems: scheduledItems.slice(0, 5), undefinedItems: undefinedItems.slice(0, 5), lastUpdated }
    })

    // memories: split manual vs auto
    const last14 = addDaysToDate(today, -14)
    const allRecentMem = (memoriesData.entries || []).filter(e => e.date >= last14)

    // manual memories — full text, up to 7
    const manualMemories = allRecentMem
      .filter(e => !e.auto)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 7)
      .map(e => ({ date: e.date, text: (e.text || '').slice(0, 400) }))

    // auto memories — aggregate rule-based into compact summary
    const autoEntries = allRecentMem.filter(e => e.auto)
    const autoTasksMentioned = new Set()
    const habitScores = []
    for (const e of autoEntries) {
      const text = e.text || ''
      const doneMatch = text.match(/Сделано:(.*?)(?:\n|$)/s)
      if (doneMatch) doneMatch[1].split(',').map(t => t.replace(/«|»/g, '').trim()).filter(Boolean).forEach(t => autoTasksMentioned.add(t))
      const habitsMatch = text.match(/Привычки:\s*(\d+)\/(\d+)/)
      if (habitsMatch) habitScores.push(parseInt(habitsMatch[1]) / parseInt(habitsMatch[2]))
    }
    const autoSummary = autoEntries.length === 0 ? null : {
      days_covered: autoEntries.length,
      tasks_completed: [...autoTasksMentioned].slice(0, 20),
      habit_avg_pct: habitScores.length ? Math.round(habitScores.reduce((a, b) => a + b, 0) / habitScores.length * 100) : null,
    }

    // recent insights (last 20 by updated)
    const recentInsights = (insightsData.insights || [])
      .sort((a, b) => (b.updated || b.created || '').localeCompare(a.updated || a.created || ''))
      .slice(0, 30)
      .map(i => ({ title: i.title, tags: [...(i.tags||[]), ...(i.subtags||[])], updated: i.updated || i.created }))

    // habit summary
    const activeHabits = (habitDefs.categories || []).flatMap(c => c.habits || []).filter(h => h.active)
    const habitSummary = activeHabits.map(h => {
      const loggedDays = Object.keys(habitLogs).filter(d => habitLogs[d]?.habits?.[h.id] != null).length
      const lastLogged = Object.keys(habitLogs).filter(d => habitLogs[d]?.habits?.[h.id] != null).sort().pop() || null
      return { label: h.label, loggedDays, lastLogged, gap: lastLogged ? daysSince(lastLogged) : null }
    })

    // inbox
    const inboxItems = (inboxData.items || []).slice(0, 10).map(i => ({ text: i.text, created: i.created }))

    // done tasks last 7 days
    const doneLast7 = nodes
      .filter(n => n.status === 'done' && n.updated >= addDaysToDate(today, -7) && n.parent_id !== null)
      .sort((a, b) => b.updated.localeCompare(a.updated))
      .slice(0, 15)
      .map(n => ({ title: n.title, date: n.updated }))

    // overdue tasks (scheduled or in_progress, past due date)
    const overdueTasks = nodes
      .filter(n => n.due && n.due < today && ['scheduled', 'in_progress'].includes(n.status))
      .sort((a, b) => a.due.localeCompare(b.due))
      .map(n => ({ title: n.title, due: n.due, days_overdue: daysSince(n.due), status: n.status }))

    // lists — random partial sample across all collections (rotates each generation)
    const allListItems = []
    try {
      const listsIdx = JSON.parse(await fs.readFile(path.join(VAULT, 'lists/_index.json'), 'utf-8'))
      for (const c of (listsIdx.collections || [])) {
        try {
          const items = JSON.parse(await fs.readFile(path.join(VAULT, 'lists', c.file), 'utf-8')).items || []
          const wantItems = items.filter(i => i.status === 'want')
          // pick up to 3 random want items per list
          const picked = [...wantItems].sort(() => Math.random() - 0.5).slice(0, 3)
          for (const item of picked) allListItems.push({ list: c.label, title: item.title, added: item.added || item.updated || null })
        } catch {}
      }
    } catch {}

    const prevCardsText = prevCards.length > 0
      ? prevCards.map(c => `- [${c.type}] ${c.subtitle}`).join('\n')
      : 'none'

    const prompt = `Today is ${today}. Week started ${monday}.

You are a personal life OS assistant for one specific person. Generate 4 smart, varied feed cards.

## This week's generation mode: ${mode.id}
${mode.instruction}

## Previous cards — last 2 weeks (do NOT repeat these angles)
${prevCardsText}

## Goal tree by sphere
${JSON.stringify(treeSummary, null, 2)}

## Manual memories (last 14 days) — real events, feelings, experiences
${manualMemories.length ? JSON.stringify(manualMemories, null, 2) : 'none'}

## Auto-diary summary (last 14 days, rule-aggregated)
${autoSummary ? JSON.stringify(autoSummary, null, 2) : 'none'}

## Personal insights (recent)
${recentInsights.length ? JSON.stringify(recentInsights, null, 2) : 'none'}

## Habit tracking (last 14 days)
${JSON.stringify(habitSummary, null, 2)}

## Inbox (unprocessed captures)
${inboxItems.length ? JSON.stringify(inboxItems, null, 2) : 'empty'}

## Done tasks — last 7 days (${doneLast7.length} tasks)
${doneLast7.length ? JSON.stringify(doneLast7, null, 2) : 'none'}

## Overdue tasks
${overdueTasks.length ? JSON.stringify(overdueTasks, null, 2) : 'none'}

## Lists — random sample of "want" items (rotates each generation)
${allListItems.length ? JSON.stringify(allListItems, null, 2) : 'none'}

---

Generate exactly 4 cards. Use a MIX of at least 2 different types among the 4.
Lean toward the generation mode above but don't be rigid.
Draw from ALL sections — memories, insights, habits, inbox, lists — not just goals.
Never repeat an angle already covered by the previous cards list.

Available card types:

1. "nudge" — actionable reminder, surfaces something to act on
{"ref":"...", "type":"nudge", "nudge_type":"ai_generated", "message":"2-3 sentences", "detail":"concrete next step or null", "action_label":"short label", "action_link":"/goals", "meta":{"subtitle":"why this matters","tone":"urgent|motivating|casual"}}

2. "reflection" — an open question sparked by real data, invites thinking
{"ref":"...", "type":"reflection", "question":"open question in 1 sentence", "context":"1 sentence — what in the data triggered this", "meta":{"subtitle":"the underlying tension","tone":"curious"}}

3. "celebration" — acknowledge a real win, streak, or positive momentum
{"ref":"...", "type":"celebration", "title":"name of the win", "body":"1-2 sentences why it matters", "meta":{"subtitle":"why this is meaningful","tone":"casual|motivating"}}

4. "challenge" — a micro-challenge or experiment for this week
{"ref":"...", "type":"challenge", "title":"challenge name", "description":"exactly what to do", "acceptance_label":"short CTA", "meta":{"subtitle":"what growth this unlocks","tone":"motivating"}}

5. "pattern" — a pattern noticed across multiple data sources
{"ref":"...", "type":"pattern", "title":"pattern name", "observation":"what the data actually shows", "implication":"so what — what does this mean for you", "meta":{"subtitle":"the insight in one line","tone":"curious"}}

Return ONLY this JSON between the exact markers:
---JSON---
[
  {"ref":"${cardRef}:0", "type":"nudge|reflection|celebration|challenge|pattern", ...},
  {"ref":"${cardRef}:1", ...},
  {"ref":"${cardRef}:2", ...},
  {"ref":"${cardRef}:3", ...}
]
---JSON---

Rules:
- Russian only for all user-facing text
- Be specific: use real names ("задача «Отдать бутылки»", "инсайт про стоп-сигналы", "привычка sleep_time")
- No two cards about the same thing
- No generic advice — everything must reference actual data`

    const raw = await runClaudeTask(prompt, 120000)
    const specs = extractJson(raw)
    const traceData = {
      'Режим': mode.id,
      'Сферы': treeSummary.map(s => s.sphere).join(', '),
      'Активных': treeSummary.map(s => `${s.sphere}: ${s.activeCount}`).join(', '),
      'In-progress': treeSummary.flatMap(s => s.inProgressItems).slice(0, 5).join(', ') || '—',
    }
    const newCards = (Array.isArray(specs) ? specs : [specs]).map(spec => ({
      ...spec, ts: today,
      trace: {
        generated_by: 'ai', generated_at: today,
        description: spec.meta?.subtitle || 'AI-анализ целей на неделю',
        data: traceData,
        ai_prompt_summary: 'Полный контекст: дерево, инсайты, воспоминания, привычки, инбокс',
        ai_input_summary: `Дерево: ${treeSummary.map(s => s.sphere + '(' + s.activeCount + ' active)').join(', ')} | Инсайтов: ${recentInsights.length} | Воспоминаний: ${allRecentMem.length} | Привычек: ${habitSummary.length} | Инбокс: ${inboxItems.length} | Сделано за 7д: ${doneLast7.length} | Просрочено: ${overdueTasks.length} | Списки: ${allListItems.length}`,
        ai_reasoning: spec.meta?.subtitle || spec.detail,
        ai_tone: spec.meta?.tone,
      },
    }))
    // replace all cards from this week, add new ones
    const existingCards = await readAiCards()
    const withoutThisWeek = existingCards.filter(c => !c.ref.startsWith(cardRef))
    await writeAiCards([...withoutThisWeek, ...newCards])
    GOAL_ANALYSIS_STATUS.set(cardRef, { status: 'done', started_at, finished_at: new Date().toISOString() })
  } catch (e) {
    console.error('Goal analysis failed:', e.message)
    GOAL_ANALYSIS_STATUS.set(cardRef, { status: 'error', started_at, finished_at: new Date().toISOString(), error: e.message })
  }
}

app.get('/api/feed/ai-status', async (req, res) => {
  try {
    const monday = currentMonday()
    const ref = `ai-goals-week-${monday}`
    const statusEntry = GOAL_ANALYSIS_STATUS.get(ref) || { status: 'idle' }
    const cards = await readAiCards()
    const hasCard = cards.some(c => c.ref.startsWith(ref))
    const noteJobsData = await readNoteJobs()
    const activeNoteJobs = noteJobsData.jobs.filter(j => j.status === 'pending' || j.status === 'running')
    const lastGenerated = cards.length > 0 ? cards.map(c => c.ts || '').sort().pop() : null
    res.json({
      goal_analysis: { ref, has_card: hasCard, ...statusEntry },
      note_jobs: { running: activeNoteJobs.length },
      last_generated: lastGenerated,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/feed/ai-generate', async (req, res) => {
  try {
    const { force = false } = req.body || {}
    const monday = currentMonday()
    const ref = `ai-goals-week-${monday}`
    triggerGoalAnalysis(monday, force).catch(e => console.error('Manual goal analysis failed:', e.message))
    res.json({ ok: true, ref })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── AI Task Runner ────────────────────────────────────────────────

function runClaudeTask(prompt, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', '--dangerously-skip-permissions'], {
      cwd: WORK_DIR,
      env: process.env,
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', d => { stdout += d })
    proc.stderr.on('data', d => { stderr += d })
    const timer = setTimeout(() => { proc.kill(); reject(new Error('Claude task timeout')) }, timeoutMs)
    proc.on('close', code => {
      clearTimeout(timer)
      if (code !== 0 && code !== null) reject(new Error(`Claude exited ${code}: ${stderr.slice(0, 200)}`))
      else resolve(stdout)
    })
    proc.on('error', reject)
    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

function extractJson(output) {
  const match = output.match(/---JSON---\s*([\s\S]*?)\s*---JSON---/)
  if (!match) throw new Error('No JSON block found in Claude output')
  return JSON.parse(match[1].trim())
}

async function resolveAiCards(specs, today, promptSummary) {
  const [memoriesData, insightsData, newsData, listsIndex] = await Promise.all([
    readMemories(),
    (async () => { try { return JSON.parse(await fs.readFile(path.join(VAULT, 'insights/index.json'), 'utf-8')) } catch { return { insights: [] } } })(),
    readNews(),
    (async () => { try { return JSON.parse(await fs.readFile(path.join(VAULT, 'lists/_index.json'), 'utf-8')) } catch { return { collections: [] } } })(),
  ])

  const listFiles = {}
  for (const c of listsIndex.collections || []) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(VAULT, 'lists', c.file), 'utf-8'))
      listFiles[c.id] = { c, items: data.items || [] }
    } catch { /* skip */ }
  }

  const aiBaseTrace = (description, meta) => ({
    generated_by: 'ai', generated_at: today, description,
    data: { 'Запрос': promptSummary?.slice(0, 80) || '—' },
    ai_prompt_summary: promptSummary,
    ai_input_summary: 'Профиль, привычки, реакции, дерево, инсайты, воспоминания, списки, люди, новости',
    ai_reasoning: meta?.subtitle, ai_tone: meta?.tone,
  })

  const cards = []
  for (const spec of specs) {
    const { type, target_id, target_date, target_list, meta } = spec
    try {
      if (type === 'ai_note') {
        cards.push({ ...spec, ts: today,
          trace: { ...aiBaseTrace(spec.meta?.subtitle || 'AI-наблюдение', spec.meta) },
        })
        continue
      }
      if (type === 'news') {
        const item = (newsData.items || []).find(i => i.id === target_id)
        if (!item) continue
        cards.push({ ref: `ai:news:${item.id}`, type: 'news', ts: item.published || today, item, stale_days: 0, meta,
          trace: { ...aiBaseTrace(spec.meta?.subtitle || 'AI-подборка: новость', meta), data: { 'Новость': item.title?.slice(0, 60), 'Источник': item.source_name || '—', 'Запрос': promptSummary?.slice(0, 80) || '—' } },
        })
        continue
      }
      if (type === 'memory') {
        const entry = (memoriesData.entries || []).find(e => e.id === target_id || e.date === target_date)
        if (!entry) continue
        const diff = daysSince(entry.date)
        cards.push({ ref: `ai:mem:${entry.id}`, type: 'memory', ts: entry.date, entry, resurfaced: meta?.subtitle || null, days_ago: diff, meta,
          trace: { ...aiBaseTrace(spec.meta?.subtitle || 'AI-подборка: воспоминание', meta), data: { 'Дата': entry.date, 'Дней назад': diff, 'Запрос': promptSummary?.slice(0, 80) || '—' } },
        })
        continue
      }
      if (type === 'insight') {
        const insight = (insightsData.insights || []).find(i => i.id === target_id)
        if (!insight) continue
        const age = daysSince(insight.updated || insight.created)
        const when = age < 35 ? `${Math.max(1, Math.round(age / 7))} нед. назад` : `${Math.round(age / 30)} мес. назад`
        cards.push({ ref: `ai:ins:${insight.id}`, type: 'insight', ts: insight.updated || insight.created, insight, when, meta,
          trace: { ...aiBaseTrace(spec.meta?.subtitle || 'AI-подборка: инсайт', meta), data: { 'Инсайт': insight.title?.slice(0, 60), 'Теги': (insight.tags || []).concat(insight.subtags || []).join(', ') || '—', 'Дней назад': age, 'Запрос': promptSummary?.slice(0, 80) || '—' } },
        })
        continue
      }
      if (type === 'list_pick') {
        const list = listFiles[target_list]
        if (!list) continue
        const item = list.items.find(i => i.id === target_id) || list.items.find(i => i.status === 'want')
        if (!item) continue
        cards.push({ ref: `ai:list:${target_list}:${item.id}`, type: 'list_pick', ts: today, list: target_list, list_label: list.c.label, item, meta,
          trace: { ...aiBaseTrace(spec.meta?.subtitle || `AI-подборка: ${target_list}`, meta), data: { 'Список': list.c.label, 'Пункт': item.title?.slice(0, 60), 'Want в списке': list.items.filter(i => i.status === 'want').length, 'Запрос': promptSummary?.slice(0, 80) || '—' } },
        })
        continue
      }
      if (type === 'nudge') {
        cards.push({ ...spec, ts: today,
          trace: { ...aiBaseTrace(spec.meta?.subtitle || spec.message?.slice(0, 80) || 'AI-наблюдение', meta), data: { 'nudge_type': spec.nudge_type || '—', 'Запрос': promptSummary?.slice(0, 80) || '—' } },
        })
        continue
      }
    } catch { /* skip bad spec */ }
  }
  return cards
}

app.post('/api/ai/run', async (req, res) => {
  const { task, params = {} } = req.body || {}
  const today = new Date().toISOString().slice(0, 10)

  if (task === 'feed_extend') {
    const shown = params.shown || []
    const prompt = `Today is ${today}. You are curating a personal life OS feed for one user.

Already shown card refs today (skip these): ${JSON.stringify(shown)}

Your task: choose 3-5 feed cards to add. Mix types — don't only use ai_note. Surface real content from the vault.

STEP 1 — Read context:
- brain/profile/profile-current.md
- brain/content/habits/log/ (last few days)
- brain/content/feed/reactions.json (liked/dismissed history)
- brain/content/tree/nodes.json (goals and tasks)
- brain/content/insights/index.json
- brain/content/memories/index.json
- brain/content/lists/ (films, books, games, series, etc.)
- brain/people/index.json + a few person files
- life-os/backend/data/news/index.json (news items)

STEP 2 — Pick cards. Use real IDs you found.

Available card types and required fields:

news       → { type:"news",     target_id:"<items[].id from news/index.json>", meta:{subtitle,tone} }
memory     → { type:"memory",   target_id:"<entries[].id>" OR target_date:"YYYY-MM-DD", meta:{subtitle,tone} }
insight    → { type:"insight",  target_id:"<insights[].id>", meta:{subtitle,tone} }
list_pick  → { type:"list_pick", target_list:"films|books|games|series|restaurants|travel|wishes", target_id:"<items[].id>", meta:{subtitle,tone} }
ai_note    → { type:"ai_note",  ref:"ai-<slug>", title:"...", body:"...", actions:[{id,label,primary?}] }
            valid action ids: "capture" (saves to inbox), "dismiss"
nudge      → { type:"nudge", ref:"ai-nudge-<slug>", nudge_type:"ai_generated",
               message:"...", action_label:"...", action_target:"memory"|"inbox"|"insight"|null,
               action_link:"/memories"|"/inbox"|"/insights"|"/goals"|null, meta:{subtitle,tone} }

meta.subtitle = one sentence in Russian explaining WHY you chose this card right now.
meta.tone = "casual"|"motivating"|"nostalgic"|"urgent"|"celebratory"|"curious"

Return ONLY this JSON between the exact markers. No other text outside the markers.

---JSON---
{
  "cards": []
}
---JSON---

Rules:
- Russian for all user-facing text
- Be specific and personal — name actual habits, goals, people, titles
- 3-5 cards, varied types
- ai_note cards must have a ref starting with "ai-"
- You may include 0-1 nudge cards — personal observations about gaps (no social plans, haven't read a book in 2 weeks, etc). Be specific, not generic.
- meta.subtitle and meta.tone apply to nudge cards too`

    try {
      const output = await runClaudeTask(prompt)
      const result = extractJson(output)
      const cards = await resolveAiCards(result.cards || [], today, 'Feed extend: подборка 3-5 карточек на основе полного свода данных')
      const existing = await readAiCards()
      await writeAiCards([...existing, ...cards])
      res.json({ cards })
    } catch (e) {
      console.error('AI task error:', e.message)
      res.status(500).json({ error: e.message })
    }
    return
  }

  res.status(400).json({ error: `Unknown task: ${task}` })
})

// ─── Brain init ────────────────────────────────────────────────────

async function initBrain() {
  const today = new Date().toISOString().slice(0, 10)
  const dirs = ['tree', 'habits/log', 'inbox', 'insights', 'memories/photos', 'lists', 'feed', 'profile']
  for (const d of dirs) await fs.mkdir(path.join(VAULT, d), { recursive: true })

  const defaults = {
    'tree/nodes.json': { _type: 'tree', updated: today, nodes: [] },
    'habits/definitions.json': { categories: [] },
    'inbox/current.json': { _type: 'inbox', updated: today, items: [] },
    'insights/index.json': { insights: [] },
    'memories/index.json': { entries: [] },
    'feed/reactions.json': { reactions: [] },
    'profile/profile.json': { name: null, occupation: null, created: today },
    'lists/_index.json': {
      _type: 'list_collection', updated: today,
      _config: { defaultTab: 'films', defaultView: 'cards' },
      collections: [
        { id: 'films', label: 'Фильмы', file: 'films.json' },
        { id: 'series', label: 'Сериалы', file: 'series.json' },
        { id: 'games', label: 'Игры', file: 'games.json' },
        { id: 'books', label: 'Книги', file: 'books.json' },
        { id: 'wishes', label: 'Желания', file: 'wishes.json' },
        { id: 'restaurants', label: 'Рестораны', file: 'restaurants.json' },
        { id: 'travel', label: 'Путешествия', file: 'travel.json' },
      ],
    },
    'lists/films.json': { items: [] },
    'lists/series.json': { items: [] },
    'lists/games.json': { items: [] },
    'lists/books.json': { items: [] },
    'lists/wishes.json': { items: [] },
    'lists/restaurants.json': { items: [] },
    'lists/travel.json': { items: [] },
  }

  for (const [file, data] of Object.entries(defaults)) {
    const fpath = path.join(VAULT, file)
    try { await fs.access(fpath) } catch {
      await fs.writeFile(fpath, JSON.stringify(data, null, 2))
    }
  }
}

app.listen(PORT, async () => {
  await initBrain()
  console.log(`Life OS backend running on http://localhost:${PORT}`)
})

// ─── Google Calendar sync ──────────────────────────────────────────

const GCAL_TOKEN_FILE = path.join(import.meta.dirname, 'google-tokens.json')
const GCAL_REDIRECT = 'http://localhost:3001/api/sync/auth/callback'

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    GCAL_REDIRECT
  )
}

async function getCalendarClient() {
  if (!process.env.GOOGLE_CLIENT_ID) return null
  try {
    const tokens = JSON.parse(await fs.readFile(GCAL_TOKEN_FILE, 'utf8'))
    const oauth2 = getOAuth2Client()
    oauth2.setCredentials(tokens)
    oauth2.on('tokens', async (newTokens) => {
      const cur = JSON.parse(await fs.readFile(GCAL_TOKEN_FILE, 'utf8').catch(() => '{}'))
      await fs.writeFile(GCAL_TOKEN_FILE, JSON.stringify({ ...cur, ...newTokens }))
    })
    return google.calendar({ version: 'v3', auth: oauth2 })
  } catch {
    return null
  }
}

function addOneHour(time) {
  const [h, m] = time.split(':').map(Number)
  if (h >= 23) return '23:59'
  return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function nodeToGCalEvent(node) {
  const tz = process.env.GOOGLE_TIMEZONE || 'Europe/Moscow'
  const event = { summary: node.title }
  if (node.notes) event.description = node.notes
  if (node.time) {
    event.start = { dateTime: `${node.due}T${node.time}:00`, timeZone: tz }
    event.end = { dateTime: `${node.due}T${addOneHour(node.time)}:00`, timeZone: tz }
  } else {
    event.start = { date: node.due }
    event.end = { date: addDaysToDate(node.due, 1) }
  }
  return event
}

async function syncNodeToGCal(node, calendar, gcalCalendarId = 'primary') {
  if (!calendar || node.status !== 'scheduled' || !node.due) return null
  try {
    const eventBody = nodeToGCalEvent(node)
    if (node.gcal_event_id) {
      try {
        await calendar.events.update({ calendarId: gcalCalendarId, eventId: node.gcal_event_id, requestBody: eventBody })
        return node.gcal_event_id
      } catch (e) {
        if (e.status === 404) {
          // Event was in a different calendar — insert fresh
          const res = await calendar.events.insert({ calendarId: gcalCalendarId, requestBody: eventBody })
          return res.data.id
        }
        throw e
      }
    } else {
      const res = await calendar.events.insert({ calendarId: gcalCalendarId, requestBody: eventBody })
      return res.data.id
    }
  } catch (e) {
    console.error('GCal sync error:', e.message)
    return node.gcal_event_id || null
  }
}

async function deleteFromGCal(gcalEventId, calendar, gcalCalendarId = 'primary') {
  if (!calendar || !gcalEventId) return
  try {
    await calendar.events.delete({ calendarId: gcalCalendarId, eventId: gcalEventId })
  } catch (e) {
    if (e.status !== 404) console.error('GCal delete error:', e.message)
  }
}

app.get('/api/sync/auth', (req, res) => {
  const oauth2 = getOAuth2Client()
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly'],
  })
  res.redirect(url)
})

app.get('/api/sync/auth/callback', async (req, res) => {
  try {
    const oauth2 = getOAuth2Client()
    const { tokens } = await oauth2.getToken(req.query.code)
    await fs.writeFile(GCAL_TOKEN_FILE, JSON.stringify(tokens))
    res.send('<h2 style="font-family:sans-serif;padding:2rem">✅ Google Calendar подключён! Можно закрыть вкладку.</h2>')
  } catch (e) {
    res.status(500).send(`Ошибка: ${e.message}`)
  }
})

app.get('/api/sync/status', async (req, res) => {
  const cal = await getCalendarClient()
  res.json({ connected: !!cal })
})

app.get('/api/sync/calendars', async (req, res) => {
  const cal = await getCalendarClient()
  if (!cal) return res.status(401).json({ error: 'Google Calendar not connected' })
  try {
    const list = await cal.calendarList.list()
    res.json(list.data.items.map(c => ({ id: c.id, summary: c.summary, primary: c.primary || false })))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/sync/push', async (req, res) => {
  const cal = await getCalendarClient()
  if (!cal) return res.status(401).json({ error: 'Google Calendar not connected' })
  try {
    const data = await readTree()
    const cals = await readCalendars()
    const calGcalMap = Object.fromEntries(cals.calendars.map(c => [c.id, c.gcal_calendar_id || 'primary']))
    const noSyncIds = new Set(cals.calendars.filter(c => !c.sync_to_gcal).map(c => c.id))
    const scheduled = data.nodes.filter(n => {
      if (n.status !== 'scheduled' || !n.due) return false
      if (n.calendar_id && noSyncIds.has(n.calendar_id)) return false
      if (n.calendar_id && !n.watched) return false
      return true
    })
    let synced = 0
    let cleaned = 0
    for (const node of scheduled) {
      const idx = data.nodes.findIndex(n => n.id === node.id)
      const gcalCalendarId = node.calendar_id ? (calGcalMap[node.calendar_id] || 'primary') : 'primary'
      const gcalId = await syncNodeToGCal(node, cal, gcalCalendarId)
      if (gcalId && gcalId !== node.gcal_event_id) {
        data.nodes[idx].gcal_event_id = gcalId
        synced++
      } else if (gcalId) {
        synced++
      }
    }
    // Clean up: delete GCal events for nodes that were synced before but are now excluded
    for (const node of data.nodes) {
      if (!node.gcal_event_id) continue
      if (!node.due) continue
      const calSyncEnabled = !node.calendar_id || !noSyncIds.has(node.calendar_id)
      if (!calSyncEnabled) continue
      const shouldSync = node.status === 'scheduled' && (!node.calendar_id || node.watched)
      if (!shouldSync) {
        const gcalCalendarId = node.calendar_id ? (calGcalMap[node.calendar_id] || 'primary') : 'primary'
        await deleteFromGCal(node.gcal_event_id, cal, gcalCalendarId)
        const idx = data.nodes.findIndex(n => n.id === node.id)
        delete data.nodes[idx].gcal_event_id
        cleaned++
      }
    }
    await writeTree(data)
    res.json({ ok: true, synced, cleaned })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
