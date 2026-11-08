export const DELIVERY_STATUSES = new Set([
  'needs_grooming', 'backlog', 'ready', 'scheduled', 'in_progress', 'waiting_for_review', 'done', 'dropped',
])

export const HANDOFF_FIELDS = [
  'target_role', 'requested_result', 'input_refs', 'scope', 'non_goals',
  'output_format', 'acceptance_criteria', 'verifier_role',
]

export function workContext(node) {
  return node?.work_context || 'personal'
}
export function isBlocked(node, nodeById) {
  return (node?.blocked_by || []).some(id => {
    const dependency = nodeById.get(id)
    // A missing dependency is corrupt state, not proof that the source work is
    // unblocked. Keep work safely blocked until an explicit recovery resolves it.
    return !dependency || dependency.status !== 'done'
  })
}

export function blockersFor(node, nodeById) {
  return (node?.blocked_by || []).flatMap(id => {
    const dependency = nodeById.get(id)
    return dependency
      ? [{ id: dependency.id, title: dependency.title, status: dependency.status }]
      : [{ id, title: 'Missing dependency', status: 'needs_verification', missing: true }]
  })
}

export function inboundDependencyReferences(nodes, deletingIds) {
  const deleted = deletingIds instanceof Set ? deletingIds : new Set(deletingIds)
  return nodes.flatMap(source => {
    if (deleted.has(source.id)) return []
    return (source.blocked_by || [])
      .filter(dependencyId => deleted.has(dependencyId))
      .map(dependencyId => ({ source_id: source.id, dependency_id: dependencyId }))
  })
}

export function handoffIsComplete(contract) {
  if (!contract || typeof contract !== 'object') return false
  return HANDOFF_FIELDS.every(field => {
    const value = contract[field]
    return Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim().length > 0
  })
}

export function hasDependencyCycle(nodes, sourceId, dependencyId) {
  if (sourceId === dependencyId) return true
  const byId = new Map(nodes.map(node => [node.id, node]))
  const seen = new Set()
  const visit = id => {
    if (id === sourceId) return true
    if (seen.has(id)) return false
    seen.add(id)
    return (byId.get(id)?.blocked_by || []).some(visit)
  }
  return visit(dependencyId)
}

export function assertDeliveryTransition(node, nextStatus, next = {}) {
  if (workContext(node) !== 'delivery') return
  if (nextStatus === 'blocked') throw new Error('blocked is derived from blocked_by and cannot be stored')
  if (!DELIVERY_STATUSES.has(nextStatus)) throw new Error('unknown delivery status')
  if (node.status === 'needs_grooming' && nextStatus !== 'needs_grooming' && !handoffIsComplete(next.handoff_contract ?? node.handoff_contract)) {
    throw new Error('delivery task needs a complete handoff contract before leaving needs_grooming')
  }
  if (nextStatus === 'waiting_for_review' && !(next.execution ?? node.execution)?.actor) {
    throw new Error('delivery task needs an executor before review')
  }
  if (nextStatus === 'in_progress' && !(next.execution ?? node.execution)?.actor) {
    throw new Error('delivery task needs an executor before in_progress')
  }
  if (nextStatus === 'done') {
    const verification = next.verification ?? node.verification
    const execution = next.execution ?? node.execution
    if (node.status !== 'waiting_for_review') throw new Error('delivery task can be done only after waiting_for_review')
    if (verification?.state !== 'passed' || !(verification.evidence_refs || []).length) throw new Error('delivery task needs passed verification evidence before done')
    if (!verification.verified_by || verification.verified_by === execution?.actor) throw new Error('delivery verification must be independent from executor')
  }
}
