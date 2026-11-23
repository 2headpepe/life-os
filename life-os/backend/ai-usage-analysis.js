import fs from 'fs/promises'
import path from 'path'

const EVENT_TYPES = new Set(['screen_view', 'screen_exit', 'screen_rendered', 'api_write_succeeded', 'api_write_failed', 'ui_action'])
const OUTCOMES = new Set(['task_progress', 'habit_progress', 'goal_progress', 'capture_saved', 'feed_action', 'review_decision'])
const SAFE_VALUE = /^[a-z0-9_:/.-]{1,120}$/i

const count = (groups, predicate) => groups.filter(predicate).reduce((total, group) => total + (Number(group.count) || 0), 0)
const activeSurfaces = manifest => (manifest?.surfaces || []).filter(surface => surface.status === 'active')
const surfaceById = manifest => new Map(activeSurfaces(manifest).map(surface => [surface.id, surface]))
const safeArray = value => Array.isArray(value) ? value : []
const manifestIds = manifest => new Set([
  ...(manifest?.surfaces || []).map(item => item.id),
  ...(manifest?.reviewable_blocks || []).map(item => item.id),
  ...(manifest?.journeys || []).map(item => item.id),
])

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return fallback }
}

function validSignature(signature) {
  if (!signature || typeof signature !== 'object') return false
  const keys = Object.keys(signature)
  if (!keys.length || keys.some(key => !['type', 'feature', 'action', 'operation'].includes(key))) return false
  if (signature.type && !EVENT_TYPES.has(signature.type)) return false
  return keys.every(key => typeof signature[key] === 'string' && SAFE_VALUE.test(signature[key]))
}

export function validateSignalRegistry(registry, manifest) {
  if (!registry || registry.schema_version !== 1 || registry.id !== 'life-os-analytics-signal-registry') throw new Error('invalid signal registry identity')
  if (registry.manifest_ref !== 'life-os/design-surface-manifest.json') throw new Error('invalid signal registry manifest reference')
  if (!Number.isInteger(registry.manifest_revision)) throw new Error('invalid signal registry manifest revision')
  const functionIds = new Set()
  const knownManifestIds = manifestIds(manifest)
  for (const signal of safeArray(registry.functions)) {
    if (!signal?.id || functionIds.has(signal.id) || !validSignature(signal.signature)) throw new Error('invalid function signal')
    const declaredSurfaces = safeArray(signal.surface_ids)
    if (!declaredSurfaces.length || declaredSurfaces.some(id => id !== '*' && !knownManifestIds.has(id))) throw new Error('invalid function surface identity')
    functionIds.add(signal.id)
    if (Object.hasOwn(signal, 'instrumented') && typeof signal.instrumented !== 'boolean') throw new Error('invalid function instrumentation state')
  }
  const journeyIds = new Set(safeArray(manifest?.journeys).map(journey => journey.id))
  const flowIds = new Set()
  for (const flow of safeArray(registry.flows)) {
    if (!flow?.id || flowIds.has(flow.id) || !journeyIds.has(flow.id)) throw new Error('invalid flow signal')
    if (!safeArray(flow.outcome_categories).length || safeArray(flow.outcome_categories).some(item => !OUTCOMES.has(item))) throw new Error('invalid flow outcomes')
    flowIds.add(flow.id)
  }
  if (flowIds.size !== journeyIds.size) throw new Error('missing flow signal')
  return true
}

export async function readSignalRegistry(root, manifest) {
  const registry = await readJson(path.join(root, 'ops', 'life-os-analytics', 'signal-registry.json'), null)
  try {
    validateSignalRegistry(registry, manifest)
    return {
      state: registry.manifest_revision === manifest?.revision ? 'available' : 'needs_verification',
      registry,
      reason: registry.manifest_revision === manifest?.revision ? null : 'Карта сигналов собрана для другой версии manifest.',
    }
  } catch {
    return { state: 'needs_verification', registry: null, reason: 'Карта сигналов недоступна или не проходит проверку.' }
  }
}

function healthState({ sourceState, observed, errors = 0, instrumented = true, registryState }) {
  if (registryState !== 'available') return 'needs_verification'
  if (!instrumented) return 'not_instrumented'
  if (errors > 0) return 'error_observed'
  if (sourceState !== 'available') return 'source_missing'
  return observed > 0 ? 'observed' : 'not_observed'
}

function explanation(kind, label, health, metrics) {
  const noun = kind === 'flow' ? 'сценарий' : kind === 'function' ? 'функция' : 'экран'
  const observed = metrics.observed || 0
  const outcomes = metrics.outcomes || 0
  const errors = metrics.errors || 0
  if (health === 'error_observed') return {
    fact: `${label}: ${errors} прямых ошибок при ${observed} наблюдаемых сигналах.`,
    interpretation: `Есть подтверждённая ошибка, связанная с ${noun}.`,
    limitation: 'Ошибка не объясняет причину и не определяет приоритет исправления.',
    next_check: 'Открыть сгруппированные ошибки и проверить воспроизводимый сценарий.',
  }
  if (health === 'observed') return {
    fact: `${label}: ${observed} наблюдаемых сигналов${outcomes ? `; подтверждённых outcomes: ${outcomes}` : ''}.`,
    interpretation: `Есть подтверждённое использование ${noun}.`,
    limitation: 'Частота не доказывает ценность, удовлетворённость или завершение полного пути.',
    next_check: outcomes ? 'Сравнить период и сегменты трафика перед продуктовым решением.' : 'Проверить, какие outcome-сигналы должны сопровождать это использование.',
  }
  if (health === 'not_observed') return {
    fact: `${label}: за полный доступный период сигналов не наблюдалось.`,
    interpretation: `Нет наблюдений об использовании ${noun} в этом окне.`,
    limitation: 'Это не доказывает, что функция не нужна или сломана.',
    next_check: 'Проверить период, сценарий воспроизведения и достаточность instrumentation.',
  }
  if (health === 'not_instrumented') return {
    fact: `${label}: producer не объявлен как instrumented.`,
    interpretation: `Использование ${noun} нельзя надёжно измерить.`,
    limitation: 'Отсутствие событий является пробелом измерения, а не поведением пользователя.',
    next_check: 'Сначала добавить или подтвердить allowlisted producer.',
  }
  if (health === 'source_missing') return {
    fact: `${label}: часть исходных файлов периода отсутствует.`,
    interpretation: 'Сигнал нельзя считать полным.',
    limitation: 'Нельзя сравнивать частоту и делать вывод об отсутствии использования.',
    next_check: 'Восстановить закрытый aggregate или выбрать полный период.',
  }
  return {
    fact: `${label}: карта сигналов или manifest требуют проверки.`,
    interpretation: 'Корректность связи с интерфейсом не подтверждена.',
    limitation: 'Нельзя использовать это состояние для продуктового вывода.',
    next_check: 'Сверить manifest, registry и producer contract.',
  }
}

function summarizeSurface(surface, groups, sourceState, registryState) {
  const route = surface.route
  const views = count(groups, group => group.type === 'screen_view' && group.route === route)
  const outcomes = count(groups, group => group.route === route && surface.outcome_refs?.includes(group.outcome_category) && group.outcome_state === 'succeeded')
  const errors = count(groups, group => group.route === route && (group.type === 'api_write_failed' || group.outcome_state === 'attempted'))
  const observed = count(groups, group => group.route === route)
  const health = healthState({ sourceState, observed, errors, registryState })
  return {
    id: surface.id,
    route,
    label: route,
    health,
    metrics: { observed, views, outcomes, errors },
    ...explanation('surface', route, health, { observed, outcomes, errors }),
  }
}

function matchesSignature(group, signature) {
  return Object.entries(signature).every(([key, value]) => group[key] === value)
}

function summarizeFunction(signal, groups, sourceState, registryState) {
  const matches = groups.filter(group => matchesSignature(group, signal.signature))
  const observed = count(matches, () => true)
  const outcomes = count(matches, group => group.outcome_state === 'succeeded')
  const errors = count(matches, group => group.type === 'api_write_failed' || group.outcome_state === 'attempted')
  const health = healthState({ sourceState, observed, errors, instrumented: signal.instrumented !== false, registryState })
  return {
    id: signal.id,
    label: signal.label,
    surface_ids: safeArray(signal.surface_ids),
    health,
    metrics: { observed, outcomes, errors },
    ...explanation('function', signal.label, health, { observed, outcomes, errors }),
  }
}

function summarizeFlow(flow, journey, surfaces, groups, sourceState, registryState) {
  const routes = new Set(journey.surface_ids.map(id => surfaces.get(id)?.route).filter(Boolean))
  const journeyGroups = groups.filter(group => routes.has(group.route))
  const observed = count(journeyGroups, () => true)
  const outcomes = count(journeyGroups, group => flow.outcome_categories.includes(group.outcome_category) && group.outcome_state === 'succeeded')
  const errors = count(journeyGroups, group => group.type === 'api_write_failed' || (flow.outcome_categories.includes(group.outcome_category) && group.outcome_state === 'attempted'))
  const health = healthState({ sourceState, observed, errors, registryState })
  return {
    id: flow.id,
    label: flow.id.replaceAll('_', ' '),
    surface_ids: journey.surface_ids,
    health,
    metrics: { observed, outcomes, errors },
    ...explanation('flow', flow.id.replaceAll('_', ' '), health, { observed, outcomes, errors }),
  }
}

function buildSegment({ manifest, registryState, registry, aggregate, eventGroups }) {
  const sourceState = aggregate?.state || 'no_data'
  const groups = safeArray(eventGroups)
  const surfaces = surfaceById(manifest)
  const journeys = safeArray(manifest?.journeys)
  const registryFlows = new Map(safeArray(registry?.flows).map(flow => [flow.id, flow]))
  const functions = safeArray(registry?.functions).map(signal => summarizeFunction(signal, groups, sourceState, registryState))
  const surfaceSummaries = activeSurfaces(manifest).filter(surface => surface.route).map(surface => summarizeSurface(surface, groups, sourceState, registryState))
  const flowSummaries = journeys.map(journey => summarizeFlow(registryFlows.get(journey.id) || { id: journey.id, outcome_categories: [] }, journey, surfaces, groups, sourceState, registryState))
  const signalHealth = [
    ...functions.map(item => ({ id: `function:${item.id}`, label: item.label, health: item.health, metrics: item.metrics, surface_ids: item.surface_ids, kind: 'function' })),
    ...surfaceSummaries.map(item => ({ id: `surface:${item.id}`, label: item.label, health: item.health, metrics: item.metrics, surface_ids: [item.id], kind: 'surface' })),
    ...flowSummaries.map(item => ({ id: `flow:${item.id}`, label: item.label, health: item.health, metrics: item.metrics, surface_ids: item.surface_ids, kind: 'flow' })),
  ]
  return {
    state: registryState === 'available' && sourceState === 'available' ? 'available' : 'needs_verification',
    reason: registryState !== 'available' ? 'Карта сигналов не совпадает с manifest.' : sourceState !== 'available' ? 'Период не имеет полного набора источников.' : null,
    surfaces: surfaceSummaries,
    functions,
    flows: flowSummaries,
    signal_health: signalHealth,
  }
}

function annotateGroups({ manifest, registry, groups }) {
  const surfaces = surfaceById(manifest)
  const journeys = safeArray(manifest?.journeys)
  const functions = safeArray(registry?.functions)
  const flows = new Map(safeArray(registry?.flows).map(flow => [flow.id, flow]))
  return groups.map(group => {
    const surface = [...surfaces.values()].find(item => item.route === group.route)
    const function_ids = functions.filter(signal => matchesSignature(group, signal.signature)).map(signal => signal.id)
    const flow_ids = journeys.filter(journey => {
      const flow = flows.get(journey.id)
      const routes = journey.surface_ids.map(id => surfaces.get(id)?.route).filter(Boolean)
      return routes.includes(group.route) && flow?.outcome_categories?.includes(group.outcome_category)
    }).map(journey => journey.id)
    return { ...group, surface_id: surface?.id || null, function_ids, flow_ids }
  })
}

export function buildUsageAnalysis({ manifest, registryState, registry, aggregate, eventGroups }) {
  const groups = safeArray(eventGroups)
  const common = { manifest, registryState, registry, aggregate }
  return {
    ...buildSegment({ ...common, eventGroups: groups }),
    groups: annotateGroups({ manifest, registry, groups }),
    by_traffic: Object.fromEntries(['ordinary_use', 'observational_audit', 'automated_test', 'unknown'].map(trafficClass => [trafficClass,
      buildSegment({ ...common, eventGroups: groups.filter(group => group.traffic_class === trafficClass) }),
    ])),
  }
}
