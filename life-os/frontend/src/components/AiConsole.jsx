import { useState, useEffect, useRef } from 'react'
import { AlertCircle, ArrowUp, Check, RefreshCw, Terminal, X } from 'lucide-react'
import { ai, context as contextApi, config as configApi } from '../api'
import { pollAiSession } from '../utils/aiSession'

function OpenCodeConsoleStatus({ session, busy, onOpen, onCancel, onCheck, actionRef }) {
  if (!session) return null
  const state = session.state || 'running'
  const needsTerminal = state === 'permission_required' || state === 'needs_attention'
  const title = {
    running: 'OpenCode обрабатывает запрос',
    permission_required: 'OpenCode ждёт твоего разрешения',
    needs_attention: 'Нужна проверка сессии',
    failed: 'OpenCode не завершил запрос',
    cancelled: 'Запрос отменён',
  }[state] || 'OpenCode обрабатывает запрос'
  const detail = {
    running: 'Ответ появится здесь. Life OS не подтверждает никакие действия за тебя.',
    permission_required: 'Life OS не отвечает на permission-запросы. Открой эту же сессию в терминале и реши вопрос там.',
    needs_attention: 'Ответ не появился вовремя. Продолжи эту же сессию в терминале или отмени запрос.',
    failed: session.error || 'Проверь сессию в терминале или отправь новый запрос.',
    cancelled: 'Можно отправить новый запрос.',
  }[state] || ''

  return (
    <div className={`rounded-xl border p-3 text-xs ${needsTerminal ? 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200' : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300'}`} role="status" aria-live="polite">
      <div className="flex gap-2">
        {state === 'running' ? <span className="mt-1 inline-flex gap-0.5" aria-hidden="true">{[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />)}</span> : <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />}
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          <p className="leading-relaxed">{detail}</p>
        </div>
      </div>
      {(state === 'running' || needsTerminal || state === 'failed') && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(state === 'running' || needsTerminal || state === 'failed') && (
            <button ref={actionRef} type="button" onClick={onOpen} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900">
              <Terminal size={12} /> Открыть эту сессию
            </button>
          )}
          {needsTerminal && (
            <button type="button" onClick={onCheck} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-current/25 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10">
              <RefreshCw size={12} /> Проверить ответ
            </button>
          )}
          <button type="button" onClick={onCancel} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-current/25 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10">
            <X size={12} /> Отменить
          </button>
        </div>
      )}
    </div>
  )
}

function OpenCodeServerStatus({ server, busy, onStart, onRefresh }) {
  const configurationIssue = ['model_missing', 'model_not_allowed', 'missing_provider', 'missing_model'].includes(server?.reason)
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200" role="status" aria-live="polite">
      <div className="flex gap-2">
        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">{configurationIssue ? 'Проверь настройку OpenCode' : 'Локальный OpenCode server недоступен'}</p>
          <p className="leading-relaxed">{configurationIssue
            ? 'Для setup и чата нужен доступный assistant/assistant в уже запущенном OpenCode server.'
            : 'Life OS не запускает его в фоне. Открой сервер в терминале, затем проверь соединение.'}</p>
          {server?.reason && <p className="text-[11px] opacity-80">{server.reason}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!configurationIssue && <button type="button" onClick={onStart} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-900 px-2.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-amber-200 dark:text-amber-950">
          <Terminal size={12} /> Открыть opencode serve
        </button>}
        <button type="button" onClick={onRefresh} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:hover:bg-amber-900/40">
          <RefreshCw size={12} /> Проверить
        </button>
      </div>
    </div>
  )
}

export default function AiConsole({ open, onClose, prefill = '', contextMessage = '', onPrefillUsed }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [ctx, setCtx] = useState(null)
  const [aiLabel, setAiLabel] = useState('AI')
  const [aiRuntime, setAiRuntime] = useState('none')
  const [openCodeServer, setOpenCodeServer] = useState(null)
  const [openCodeSessionId, setOpenCodeSessionId] = useState(null)
  const [activeSession, setActiveSession] = useState(null)
  const [serverActionLoading, setServerActionLoading] = useState(false)
  const bottomRef = useRef()
  const inputRef = useRef()
  const dialogRef = useRef()
  const previousFocusRef = useRef(null)
  const pollAbortRef = useRef(null)
  const terminalActionRef = useRef(null)
  const completedTurnsRef = useRef(new Set())

  const refreshConfig = async () => {
    try {
      const c = await configApi.get()
      setAiRuntime(c.aiRuntime || 'none')
      setAiLabel(c.aiRuntime === 'none' ? 'AI' : (c.aiRuntime || 'AI'))
      setOpenCodeServer(c.openCodeServer || null)
      if (c.openCodeServer?.available && errorCode?.startsWith('server_')) {
        setError(null)
        setErrorCode(null)
      }
      return c
    } catch {
      return null
    }
  }

  useEffect(() => {
    void refreshConfig()
    return () => pollAbortRef.current?.abort()
    // Refreshing configuration is an explicit user action after server start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (open) {
      setError(null)
      setErrorCode(null)
      if (prefill) {
        setInput(prefill)
        onPrefillUsed?.()
      }
      window.setTimeout(() => inputRef.current?.focus(), 100)
      if (!ctx) contextApi.get().then(setCtx).catch(() => {})
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined
    previousFocusRef.current = document.activeElement
    return () => previousFocusRef.current?.focus?.()
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, activeSession?.state, error])

  useEffect(() => {
    if (open && (activeSession?.state === 'permission_required' || activeSession?.state === 'needs_attention')) {
      window.setTimeout(() => terminalActionRef.current?.focus(), 0)
    }
  }, [open, activeSession?.state])

  useEffect(() => {
    if (!open) return undefined
    const handler = (e) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = [...(dialogRef.current?.querySelectorAll('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || [])]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!dialogRef.current?.contains(document.activeElement)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const buildContextMessage = () => {
    const parts = []
    if (contextMessage) {
      parts.push('Карточка в фокусе:')
      parts.push(contextMessage)
      parts.push('')
    }
    if (ctx) {
      parts.push(`Текущий контекст (${ctx.date}):`)
      if (ctx.overdue?.length) parts.push(`• Просрочено: ${ctx.overdue.map(t => t.title).join(', ')}`)
      if (ctx.scheduled_today?.length) parts.push(`• Запланировано сегодня: ${ctx.scheduled_today.map(t => t.title).join(', ')}`)
      if (ctx.top_tasks?.length) parts.push(`• Топ задачи: ${ctx.top_tasks.slice(0, 5).map(t => t.title).join(', ')}`)
      if (ctx.habits) parts.push(`• Привычки: ${ctx.habits.done}/${ctx.habits.total} (счёт ${ctx.habits.score})`)
    }
    return parts.length > 0 ? parts.join('\n') : null
  }

  const pollSession = async (sessionId, turnKey) => {
    pollAbortRef.current?.abort()
    const controller = new AbortController()
    pollAbortRef.current = controller
    const isCurrent = () => pollAbortRef.current === controller
    const snapshot = await pollAiSession(sessionId, {
      signal: controller.signal,
      onUpdate: update => {
        if (isCurrent()) setActiveSession(previous => ({ ...previous, ...update, session_id: sessionId, turnKey }))
      },
    })
    if (!isCurrent()) return snapshot
    pollAbortRef.current = null

    if (snapshot.state === 'completed') {
      if (snapshot.text && !completedTurnsRef.current.has(turnKey)) {
        completedTurnsRef.current.add(turnKey)
        setMessages(previous => [...previous, { role: 'assistant', content: snapshot.text }])
      }
      setActiveSession(null)
      setError(null)
      setErrorCode(null)
    } else if (snapshot.state === 'failed') {
      setActiveSession(previous => ({ ...previous, ...snapshot, session_id: sessionId, turnKey }))
      setError(snapshot.error || 'OpenCode не завершил запрос.')
      setErrorCode(snapshot.code || 'session_failed')
    }
    return snapshot
  }

  const openActiveSession = async () => {
    if (!activeSession?.session_id) return
    try {
      const result = await ai.openSession(activeSession.session_id)
      if (result.error) throw new Error(result.error)
    } catch (e) {
      setError(e.message || 'Не удалось открыть сессию OpenCode в терминале.')
    }
  }

  const cancelActiveSession = async () => {
    if (!activeSession?.session_id) return
    pollAbortRef.current?.abort()
    setLoading(true)
    try {
      const result = await ai.abortSession(activeSession.session_id)
      if (result.error) throw new Error(result.error)
      setActiveSession(previous => ({ ...previous, state: 'cancelled' }))
      setOpenCodeSessionId(null)
    } catch (e) {
      setError(e.message || 'Не удалось отменить сессию OpenCode.')
    } finally {
      setLoading(false)
    }
  }

  const resumeActiveSession = async () => {
    if (!activeSession?.session_id || loading) return
    setLoading(true)
    setError(null)
    setErrorCode(null)
    try {
      await pollSession(activeSession.session_id, activeSession.turnKey)
    } catch (e) {
      setError(e.message || 'Не удалось проверить сессию OpenCode.')
      setErrorCode(e.code || 'session_status_error')
    } finally {
      setLoading(false)
    }
  }

  const startOpenCodeServer = async () => {
    setServerActionLoading(true)
    try {
      const result = await ai.openServer()
      if (result.error) throw new Error(result.error)
      setError('OpenCode server открыт в терминале. Дождись строки о запуске и нажми «Проверить».')
      setErrorCode('server_start_requested')
    } catch (e) {
      setError(e.message || 'Не удалось открыть OpenCode server в терминале.')
      setErrorCode('server_start_failed')
    } finally {
      setServerActionLoading(false)
    }
  }

  const send = async () => {
    const text = input.trim()
    const sessionBlocksInput = ['running', 'permission_required', 'needs_attention'].includes(activeSession?.state)
    if (!text || loading || sessionBlocksInput) return
    setInput('')
    setError(null)
    setErrorCode(null)

    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setLoading(true)

    const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }))
    if (messages.length === 0 && (ctx || contextMessage)) {
      const ctxMsg = buildContextMessage()
      if (ctxMsg) apiMessages.unshift({ role: 'user', content: ctxMsg }, { role: 'assistant', content: 'Понял, вижу твой контекст. Чем помочь?' })
    }

    try {
      const reuseSession = aiRuntime === 'opencode' ? openCodeSessionId : null
      const res = await ai.chat(apiMessages, undefined, {
        sessionId: reuseSession,
        prompt: reuseSession ? text : undefined,
      })
      if (res.error) {
        setError(res.error)
        setErrorCode(res.code || 'chat_error')
      } else if (res.session_id) {
        const turnKey = `${res.session_id}:${Date.now()}`
        setOpenCodeSessionId(res.session_id)
        setActiveSession({ session_id: res.session_id, state: res.state || 'running', turnKey })
        await pollSession(res.session_id, turnKey)
      } else {
        setMessages(previous => [...previous, { role: 'assistant', content: res.text }])
      }
    } catch {
      setError('Ошибка соединения с сервером')
      setErrorCode('connection_error')
    }
    setLoading(false)
  }

  const clearConversation = () => {
    if (activeSession && activeSession.state !== 'completed' && activeSession.state !== 'cancelled') return
    setMessages([])
    setOpenCodeSessionId(null)
    setActiveSession(null)
    setError(null)
    setErrorCode(null)
  }

  if (!open) return null

  const hints = [
    'Декомпозируй мою главную цель на задачи',
    'Что мне сделать первым делом сегодня?',
    'Помоги разобрать inbox и расставить приоритеты',
    'Как улучшить мои привычки на этой неделе?',
  ]
  const sessionBlocksInput = ['running', 'permission_required', 'needs_attention'].includes(activeSession?.state)
  const serverUnavailable = aiRuntime === 'opencode' && (openCodeServer?.available === false || errorCode?.startsWith('server_'))

  return (
    <>
      <div className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40" onClick={onClose} />
      <div ref={dialogRef} className="fixed right-0 top-0 bottom-0 w-[420px] max-w-full z-50 bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 flex flex-col shadow-2xl" role="dialog" aria-modal="true" aria-label="Чат с AI">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{aiLabel}</span>
            {ctx && (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                <Check size={10} /> контекст загружен
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button onClick={clearConversation} disabled={!!activeSession && activeSession.state !== 'cancelled'} className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40">Очистить</button>
            )}
            <button onClick={onClose} aria-label="Закрыть чат" className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={14} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="py-4">
              {contextMessage && (
                <div className="mb-3 text-xs text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 rounded-xl px-3 py-2.5 border border-violet-200 dark:border-violet-800/50">
                  <span className="font-medium">Карточка: </span>{contextMessage}
                </div>
              )}
              {ctx && (
                <div className="mb-4 text-xs text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-xl px-3 py-2.5 space-y-0.5">
                  {ctx.overdue?.length > 0 && <div className="text-red-400">⚠ {ctx.overdue.length} просроченных задач</div>}
                  {ctx.habits && <div>Привычки сегодня: {ctx.habits.done}/{ctx.habits.total}</div>}
                  {ctx.top_tasks?.length > 0 && <div>Топ задача: {ctx.top_tasks[0].title}</div>}
                </div>
              )}
              <p className="text-xs text-gray-400 mb-3 text-center">Подсказки:</p>
              <div className="space-y-1.5">
                {hints.map(hint => (
                  <button key={hint} onClick={() => { setInput(hint); inputRef.current?.focus() }}
                    className="block w-full text-left text-xs px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-br-sm'
                  : 'bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 rounded-bl-sm'
              }`}>{m.content}</div>
            </div>
          ))}

          {loading && !activeSession && (
            <div className="flex justify-start">
              <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 rounded-2xl rounded-bl-sm">
                <span className="inline-flex gap-1">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
              </div>
            </div>
          )}

          {serverUnavailable && <OpenCodeServerStatus server={openCodeServer} busy={serverActionLoading} onStart={startOpenCodeServer} onRefresh={refreshConfig} />}
          <OpenCodeConsoleStatus session={activeSession} busy={loading} onOpen={openActiveSession} onCancel={cancelActiveSession} onCheck={resumeActiveSession} actionRef={terminalActionRef} />
          {error && <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg" role="alert">{error}</div>}
          <div ref={bottomRef} />
        </div>

        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800">
          <div className="flex gap-2 items-end bg-gray-50 dark:bg-gray-900 rounded-xl px-3 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={sessionBlocksInput ? 'Сначала заверши или отмени текущую сессию' : 'Напиши... (Enter — отправить)'}
              rows={1}
              disabled={sessionBlocksInput}
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none resize-none placeholder-gray-400 dark:placeholder-gray-600 disabled:opacity-60"
              style={{ maxHeight: '120px' }}
            />
            <button onClick={send} disabled={!input.trim() || loading || sessionBlocksInput} aria-label="Отправить сообщение"
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-900 dark:bg-white text-white dark:text-gray-900 disabled:opacity-30 flex-shrink-0"><ArrowUp size={16} /></button>
          </div>
          <p className="text-xs text-gray-400 mt-1 text-center">⌘J закрыть · Shift+Enter новая строка</p>
        </div>
      </div>
    </>
  )
}
