export const AGENT_LIFECYCLE_STATES = new Set(['proposed', 'active', 'suspended', 'retired'])
export function activeAgent(registry, id) { return registry?.agents?.find(agent => agent.id === id && agent.status === 'active') || null }
function assertActiveRole(registry, actor, role, errorPrefix) {
  const agent = activeAgent(registry, actor)
  if (!agent) throw new Error(`${errorPrefix} is unavailable or unregistered`)
  if (!agent.roles?.includes(role)) throw new Error(`${errorPrefix} does not match the required role`)
  return agent
}
export function assertEligibleCoordinator(registry, actor) { return assertActiveRole(registry, actor, 'Координатор AI-сессии', 'coordinator') }
export function assertEligibleExecutor(registry, actor, targetRole) { return assertActiveRole(registry, actor, targetRole, 'executor') }
export function assertEligibleVerifier(registry, verifier, executor) {
  const agent = activeAgent(registry, verifier)
  if (!agent) throw new Error('verifier is unavailable or unregistered')
  if (!agent.can_verify) throw new Error('agent is not approved for independent verification')
  if (!agent.roles?.includes('Независимый проверяющий')) throw new Error('verifier does not match the required role')
  if (verifier === executor) throw new Error('verifier must be independent from executor')
  return agent
}
