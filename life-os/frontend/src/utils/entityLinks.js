function decode(segment) {
  try { return decodeURIComponent(segment) } catch { return null }
}

function encode(value) {
  return encodeURIComponent(String(value))
}

export function routeSegments(pathname, route) {
  const prefix = `/${route}`
  if (pathname === prefix) return []
  if (!pathname.startsWith(`${prefix}/`)) return null
  return pathname.slice(prefix.length + 1).split('/').filter(Boolean).map(decode)
}

export function directEntityId(pathname, route) {
  const segments = routeSegments(pathname, route)
  return segments?.length === 1 && segments[0] ? segments[0] : null
}

export function nodeLineage(nodes, nodeOrId) {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const lineage = []
  const seen = new Set()
  let node = typeof nodeOrId === 'string' ? byId.get(nodeOrId) : nodeOrId

  while (node) {
    if (seen.has(node.id)) return null
    seen.add(node.id)
    lineage.unshift(node)
    if (node.parent_id && !byId.has(node.parent_id)) return null
    node = node.parent_id ? byId.get(node.parent_id) : null
  }

  return lineage.length ? lineage : null
}

export function nodePath(nodes, nodeOrId) {
  const lineage = nodeLineage(nodes, nodeOrId)
  return lineage ? `/goals/${lineage.map(node => encode(node.id)).join('/')}` : null
}

export function resolveNodePath(nodes, pathname) {
  const ids = routeSegments(pathname, 'goals')
  if (ids === null) return { state: 'outside_route', node: null }
  if (!ids.length) return { state: 'overview', node: null }
  if (ids.some(id => !id)) return { state: 'invalid', node: null }

  const byId = new Map(nodes.map(node => [node.id, node]))
  let parentId = null
  let node = null

  for (const id of ids) {
    node = byId.get(id)
    if (!node || node.parent_id !== parentId) return { state: 'not_found', node: null }
    parentId = node.id
  }

  return { state: 'found', node }
}

export function legacyNodePath(nodes, search) {
  const params = new URLSearchParams(search)
  const id = params.get('task') || params.get('root')
  return id ? nodePath(nodes, id) : null
}

export const entityPath = {
  inbox: id => `/inbox/${encode(id)}`,
  habit: id => `/habits/${encode(id)}`,
  listItem: (listId, itemId) => `/lists/${encode(listId)}/${encode(itemId)}`,
  insight: id => `/insights/${encode(id)}`,
  topic: slug => `/insights/topics/${encode(slug)}`,
  person: id => `/people/${encode(id)}`,
  memory: id => `/memories/${encode(id)}`,
  news: id => `/news/${encode(id)}`,
  calendar: id => `/calendar/${encode(id)}`,
  calendarEvent: id => `/calendar/events/${encode(id)}`,
  aiReview: (type, id) => `/ai-reviews/${encode(type)}/${encode(id)}`,
}
