const CONTEXTS = new Set(['personal', 'delivery'])
const SORTS = new Set(['default', 'suggested'])

function values(params, key) {
  return [...new Set(params.getAll(key).map(value => value.trim()).filter(Boolean))].sort()
}

export function parseWorkView(search = '') {
  const params = new URLSearchParams(search)
  const bool = key => params.get(key) === 'true'
  const context = params.get('context')
  return {
    context: CONTEXTS.has(context) ? context : 'personal',
    roots: values(params, 'root'),
    statuses: values(params, 'status'),
    blocked: params.get('blocked') === 'true' ? true : params.get('blocked') === 'false' ? false : null,
    ready: bool('ready'),
    owner: params.get('owner')?.trim() || '',
    q: params.get('q')?.trim() || '',
    sort: SORTS.has(params.get('sort')) ? params.get('sort') : 'default',
    task: params.get('task')?.trim() || '',
  }
}

export function workViewSearch(view) {
  const params = new URLSearchParams()
  if (view.context === 'delivery') params.set('context', 'delivery')
  for (const root of [...new Set(view.roots || [])].sort()) params.append('root', root)
  for (const status of [...new Set(view.statuses || [])].sort()) params.append('status', status)
  if (view.blocked !== null && view.blocked !== undefined) params.set('blocked', String(view.blocked))
  if (view.ready) params.set('ready', 'true')
  if (view.owner) params.set('owner', view.owner)
  if (view.q) params.set('q', view.q)
  if (view.sort === 'suggested') params.set('sort', 'suggested')
  if (view.task) params.set('task', view.task)
  return params.toString()
}

function completeHandoff(node) {
  const handoff = node.handoff_contract
  const fields = ['target_role', 'requested_result', 'input_refs', 'scope', 'non_goals', 'output_format', 'acceptance_criteria', 'verifier_role']
  return Boolean(handoff) && fields.every(field => Array.isArray(handoff[field]) ? handoff[field].length > 0 : Boolean(String(handoff[field] || '').trim()))
}

export function readiness(node) {
  const reasons = []
  if (node.is_blocked) reasons.push('есть незавершённая зависимость')
  if (!completeHandoff(node)) reasons.push('неполный handoff')
  if (node.status !== 'ready') reasons.push(node.status === 'backlog' ? 'ещё не переведена в ready' : `статус: ${node.status || 'не определён'}`)
  return { ready: reasons.length === 0, reasons }
}

export function suggestionFor(node, query = '') {
  const readinessState = readiness(node)
  let score = 0
  const reasons = []
  if (readinessState.ready) { score += 6; reasons.push('готова к старту') }
  else if (!node.is_blocked && completeHandoff(node)) { score += 3; reasons.push('полный handoff') }
  if (query && `${node.title || ''} ${node.outcome || ''}`.toLowerCase().includes(query.toLowerCase())) { score += 2; reasons.push('совпадает с запросом') }
  if (node.review_by) { score += 1; reasons.push('есть дата review') }
  if (!reasons.length) reasons.push(...readinessState.reasons.slice(0, 2))
  return { score, reasons, readiness: readinessState }
}

export function filterAndRank(nodes, view) {
  const query = view.q.toLowerCase()
  const filtered = nodes.filter(node => {
    if ((node.work_context || 'personal') !== view.context) return false
    if (view.roots.length && !view.roots.includes(node.root_id)) return false
    if (view.statuses.length && !view.statuses.includes(node.status || 'undefined')) return false
    if (view.blocked !== null && Boolean(node.is_blocked) !== view.blocked) return false
    if (view.ready && !readiness(node).ready) return false
    if (view.owner && node.execution?.actor !== view.owner) return false
    return !query || `${node.title || ''} ${node.outcome || ''}`.toLowerCase().includes(query)
  }).map(node => ({ ...node, suggestion: suggestionFor(node, view.q) }))
  if (view.sort === 'suggested') filtered.sort((a, b) => b.suggestion.score - a.suggestion.score || String(a.title).localeCompare(String(b.title), 'ru'))
  return filtered
}
