import { ai } from '../api'

const DEFAULT_POLL_INTERVAL_MS = 900
const DEFAULT_MAX_POLL_MS = 135_000

export const SESSION_TERMINAL_STATES = new Set([
  'completed',
  'permission_required',
  'needs_attention',
  'failed',
  'cancelled',
])

function wait(ms, signal) {
  if (signal?.aborted) return Promise.resolve()
  return new Promise(resolve => {
    const timeout = window.setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout)
      resolve()
    }, { once: true })
  })
}

// The OpenCode server's event stream is intentionally not consumed by the
// browser. The local Life OS backend reconciles it and this helper polls that
// backend state, so an interrupted SSE connection cannot leave a web spinner
// running forever.
export async function pollAiSession(sessionId, {
  signal,
  onUpdate,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxPollMs = DEFAULT_MAX_POLL_MS,
} = {}) {
  const startedAt = Date.now()
  let last = { session_id: sessionId, state: 'running' }

  while (!signal?.aborted) {
    const snapshot = await ai.session(sessionId)
    last = snapshot?.session_id ? snapshot : {
      ...last,
      state: 'failed',
      error: snapshot?.error || 'Не удалось получить состояние OpenCode-сессии.',
      code: snapshot?.code || 'session_status_invalid',
    }
    onUpdate?.(last)

    if (SESSION_TERMINAL_STATES.has(last.state)) return last
    if (Date.now() - startedAt >= maxPollMs) {
      const attention = {
        ...last,
        state: 'needs_attention',
        error: 'OpenCode ещё не вернул ответ. Продолжи эту же сессию в терминале или отмени запрос.',
        code: 'client_poll_timeout',
      }
      onUpdate?.(attention)
      return attention
    }
    await wait(intervalMs, signal)
  }

  return { ...last, state: 'cancelled', code: 'poll_cancelled' }
}
