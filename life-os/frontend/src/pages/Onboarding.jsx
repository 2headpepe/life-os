import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, ArrowUp, ExternalLink, Loader2, CheckCircle2, Play, Sparkles, Terminal, RefreshCw, X } from 'lucide-react'
import { ai, config as configApi, tree as treeApi } from '../api'
import { openInConsole } from '../utils/openInConsole'
import { pollAiSession } from '../utils/aiSession'
import ThemeSwitcher from '../components/ui/ThemeSwitcher'

const SPHERE_COLORS = ['#3B82F6', '#22C55E', '#EF4444', '#06B6D4', '#EC4899', '#F59E0B', '#8B5CF6', '#F97316']

const SETUP_SYSTEM = `Ты помощник по настройке Life OS — персональной системы управления жизнью.
Ты ведёшь пользователя через онбординг. Отвечай по-русски, коротко и дружелюбно.

Когда просят предложить сферы жизни — верни ТОЛЬКО JSON-блок в таком формате, без лишнего текста до/после:
\`\`\`json
{"spheres":[{"id":"root-health","title":"Здоровье","color":"#3B82F6"},{"id":"root-work","title":"Работа","color":"#22C55E"}]}
\`\`\`

Когда просят предложить задачи — верни ТОЛЬКО JSON-блок:
\`\`\`json
{"tasks":[{"title":"Название задачи","parent_id":"root-health","status":"in_progress"}]}
\`\`\`

id сфер должны быть в формате root-{slug} (латиница, дефисы).`

const CLI_ONBOARDING_PROMPT = `Ты настраиваешь Life OS — личную систему управления жизнью — для нового пользователя.

Твоя задача: провести короткое интервью и по итогу записать данные в файлы системы.

Шаг 1. Поприветствуй пользователя и узнай:
- Как его зовут
- Чем занимается
- Какие сферы жизни сейчас важны (здоровье, работа, учёба, отношения, хобби и т.д.)
- 2-3 конкретные задачи или цели которые хочет отслеживать

Шаг 2. По итогам разговора запиши данные в brain/content/tree/nodes.json.
Формат узла:
{"id":"root-health","title":"Здоровье","parent_id":null,"color":"#3B82F6","status":null,"due":null,"notes":null,"created":"TODAY","updated":"TODAY"}

Корневые узлы (сферы): parent_id = null, id = root-{slug}
Задачи: parent_id = id родительской сферы, id = node-{slug}, status = "in_progress"

Файл nodes.json имеет структуру: {"_type":"tree","updated":"TODAY","nodes":[...все узлы...]}

Сохрани существующие корневые узлы если они есть, добавь новые.
После записи скажи пользователю: "Готово! Вернись в браузер и нажми кнопку 'Я готов'."

Начни с приветствия прямо сейчас.`

function extractJson(text) {
  const patterns = [
    /```json\s*([\s\S]*?)```/,
    /```\s*([\s\S]*?)```/,
    /(\{[\s\S]*\})/,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) { try { return JSON.parse(m[1]) } catch {} }
  }
  return null
}

function StepDots({ step, total }) {
  return (
    <div className="flex gap-1.5 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-gray-900 dark:bg-white' : 'w-1.5 bg-gray-200 dark:bg-gray-700'}`} />
      ))}
    </div>
  )
}

const SERVER_CONFIGURATION_ISSUES = new Set([
  'model_missing', 'model_not_allowed', 'missing_provider', 'missing_model',
  'server_url_missing', 'server_url_invalid', 'server_url_not_loopback',
  'server_url_port_required', 'server_protocol_unsupported',
])

function serverLifecycle(server) {
  return server?.state || server?.status || server?.lifecycle || server?.managed?.state || (server?.available ? 'ready' : 'stopped')
}

function OpenCodeServerRecovery({ server, errorCode, busy, onStart, onStop, onRefresh }) {
  const state = serverLifecycle(server)
  const reason = errorCode || server?.reason || null
  const isManaged = server?.managed === true || server?.owned === true || server?.managed?.owned === true
  const copy = (() => {
    if (state === 'ready') return {
      title: 'OpenCode готов',
      detail: 'Life OS подключён к локальному OpenCode. Для действий агент всё равно спросит разрешение.',
    }
    if (state === 'starting') return {
      title: 'OpenCode запускается',
      detail: 'Life OS ждёт подтверждённый ответ OpenCode. Пароль сервера не передаётся в браузер.',
    }
    if (state === 'endpoint_occupied') return {
      title: 'Порт OpenCode уже занят',
      detail: 'Life OS не станет подключаться к неизвестному процессу и не остановит его. Освободи порт или измени настройку.',
    }
    if (reason === 'server_v2_auth_required' || reason === 'server_auth_required') return {
      title: 'Найден OpenCode v2, но нужен доступ',
      detail: 'Это не ошибка провайдера. Сервер защищён паролем, которым Life OS не располагает. Запусти управляемый сервер из Life OS или настрой отдельное подключение.',
    }
    if (reason === 'server_invalid_response') return {
      title: 'На адресе ответил не OpenCode',
      detail: 'Проверка v2 не распознала OpenCode. HTML на старом v1-адресе сам по себе не является такой ошибкой.',
    }
    if (SERVER_CONFIGURATION_ISSUES.has(reason)) return {
      title: 'Проверь настройку OpenCode',
      detail: 'Для setup и чата нужен доступный assistant/assistant в OpenCode.',
    }
    if (state === 'failed') return {
      title: 'OpenCode не запустился',
      detail: 'Проверь диагностику и попробуй запустить сервер ещё раз.',
    }
    return {
      title: 'OpenCode не запущен',
      detail: 'Life OS запускает отдельный локальный сервер только после явного нажатия кнопки.',
    }
  })()
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200" role="status" aria-live="polite">
      <div className="flex gap-2">
        <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
        <div className="space-y-1.5">
          <p className="font-medium">{copy.title}</p>
          <p className="leading-relaxed">{copy.detail}</p>
          {reason && <p className="text-[11px] opacity-80">{reason}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {state !== 'starting' && state !== 'ready' && <button type="button" onClick={onStart} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-900 px-2.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-amber-200 dark:text-amber-950">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Запустить OpenCode
        </button>}
        <button type="button" onClick={onRefresh} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:hover:bg-amber-900/40">
          <RefreshCw size={12} /> Проверить соединение
        </button>
        {isManaged && state === 'ready' && <button type="button" onClick={onStop} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:hover:bg-amber-900/40">
          <X size={12} /> Остановить
        </button>}
      </div>
    </div>
  )
}

function OpenCodeSessionStatus({ session, busy, onOpen, onCancel, onCheck, actionRef }) {
  if (!session) return null
  const state = session.state || 'running'
  const needsTerminal = state === 'permission_required' || state === 'needs_attention'
  const copy = {
    running: ['OpenCode обрабатывает запрос', 'Ответ появится здесь. Life OS не подтверждает никакие действия за тебя.'],
    permission_required: ['OpenCode ждёт твоего разрешения', 'Life OS не отвечает на permission-запросы. Открой эту сессию в OpenCode и прими решение там.'],
    needs_attention: ['Нужна проверка сессии', 'Ответ не появился вовремя. Открой сессию в OpenCode или отмени запрос.'],
    failed: ['OpenCode не завершил запрос', session.error || 'Проверь сессию в OpenCode или попробуй отправить запрос снова.'],
    cancelled: ['Запрос отменён', 'Можно сформулировать запрос заново.'],
  }[state] || ['OpenCode обрабатывает запрос', 'Ответ появится здесь.']

  return (
    <div className={`rounded-xl border p-3 text-xs ${needsTerminal ? 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200' : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300'}`} role="status" aria-live="polite">
      <div className="flex gap-2">
        {state === 'running' && <Loader2 size={15} className="mt-0.5 animate-spin flex-shrink-0" />}
        {state !== 'running' && <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />}
        <div className="space-y-1">
          <p className="font-medium">{copy[0]}</p>
          <p className="leading-relaxed">{copy[1]}</p>
        </div>
      </div>
      {(state === 'running' || needsTerminal || state === 'failed') && (
        <div className="mt-3 flex flex-wrap gap-2">
          {state === 'running' || needsTerminal || state === 'failed' ? (
            <button ref={actionRef} type="button" onClick={onOpen} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-gray-900">
              <ExternalLink size={12} /> {session.can_open_terminal ? 'Открыть в терминале' : 'Открыть OpenCode Web'}
            </button>
          ) : null}
          {needsTerminal ? (
            <button type="button" onClick={onCheck} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-current/25 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10">
              <RefreshCw size={12} /> Проверить ответ
            </button>
          ) : null}
          <button type="button" onClick={onCancel} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-current/25 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10">
            <X size={12} /> Отменить
          </button>
        </div>
      )}
    </div>
  )
}

// ── No-AI flow: open CLI in terminal ──────────────────────────────

function CliOnboarding({ cliCommand, onDone }) {
  const [launched, setLaunched] = useState(false)
  const [checking, setChecking] = useState(false)

  const launch = async () => {
    await openInConsole(CLI_ONBOARDING_PROMPT)
    setLaunched(true)
  }

  const checkAndContinue = async () => {
    setChecking(true)
    try {
      const nodes = await fetch('/api/tree').then(r => r.json())
      const hasUserNodes = nodes.some(n => n.parent_id !== null)
      if (hasUserNodes) {
        onDone()
      } else {
        alert('Данные ещё не записаны. Заверши интервью в консоли и попробуй снова.')
      }
    } catch {
      alert('Не удалось проверить данные. Попробуй снова.')
    }
    setChecking(false)
  }

  return (
    <div className="p-8 space-y-6">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-gray-900 dark:bg-white flex items-center justify-center mx-auto">
          <Terminal size={22} className="text-white dark:text-gray-900" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Настройка через консоль</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            {cliCommand} откроется в терминале и проведёт короткое интервью.<br />
            По итогу он сам запишет твои сферы и первые задачи.
          </p>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-start gap-2">
          <span className="text-gray-300 font-mono mt-0.5">1.</span>
          <span>Нажми кнопку ниже — откроется терминал с {cliCommand}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-gray-300 font-mono mt-0.5">2.</span>
          <span>Вставь первое сообщение <kbd className="bg-white dark:bg-gray-700 px-1 rounded border border-gray-200 dark:border-gray-600">⌘V</kbd> — оно уже в буфере обмена</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-gray-300 font-mono mt-0.5">3.</span>
          <span>Ответь на вопросы {cliCommand}, он сам запишет данные</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-gray-300 font-mono mt-0.5">4.</span>
          <span>Когда {cliCommand} скажет «Готово» — вернись сюда и нажми «Я готов»</span>
        </div>
      </div>

      {!launched ? (
        <button
          onClick={launch}
          className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Terminal size={15} /> Открыть {cliCommand}
        </button>
      ) : (
        <div className="space-y-2">
          <button
            onClick={checkAndContinue}
            disabled={checking}
            className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {checking ? <Loader2 size={15} className="animate-spin" /> : <><CheckCircle2 size={15} /> Я готов</>}
          </button>
          <button
            onClick={launch}
            className="w-full flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-gray-600 py-2"
          >
            <RefreshCw size={12} /> Открыть консоль снова
          </button>
        </div>
      )}

      <div className="border-t border-gray-100 dark:border-gray-800 pt-4 flex gap-3 text-xs text-gray-400">
        <button onClick={onDone} className="flex-1 hover:text-gray-600 dark:hover:text-gray-300 py-1">
          Пропустить →
        </button>
      </div>
    </div>
  )
}

// ── AI web flow ───────────────────────────────────────────────────

export default function Onboarding({ onDone }) {
  const navigate = useNavigate()
  const [hasAi, setHasAi] = useState(null)
  const [cliCommand, setCliCommand] = useState('codex')
  const [aiRuntime, setAiRuntime] = useState('none')
  const [openCodeServer, setOpenCodeServer] = useState(null)
  const [step, setStep] = useState(0)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [history, setHistory] = useState([])
  const [spheres, setSpheres] = useState([])
  const [editingSphere, setEditingSphere] = useState(null)
  const [tasks, setTasks] = useState([])
  const [openCodeSessionId, setOpenCodeSessionId] = useState(null)
  const [activeSession, setActiveSession] = useState(null)
  const [pendingRequest, setPendingRequest] = useState(null)
  const [serverActionLoading, setServerActionLoading] = useState(false)
  const pollAbortRef = useRef(null)
  const terminalActionRef = useRef(null)

  const refreshConfig = async () => {
    try {
      const c = await configApi.get()
      setHasAi(!!c.hasAi)
      setCliCommand(c.cliCommand || 'codex')
      setAiRuntime(c.aiRuntime || 'none')
      setOpenCodeServer(c.openCodeServer || null)
      if (c.openCodeServer?.available && errorCode?.startsWith('server_')) {
        setError(null)
        setErrorCode(null)
      }
      return c
    } catch {
      setHasAi(false)
      return null
    }
  }

  useEffect(() => {
    void refreshConfig()
    return () => pollAbortRef.current?.abort()
    // Configuration is intentionally refreshed after an explicit server action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeSession?.state === 'permission_required' || activeSession?.state === 'needs_attention') {
      window.setTimeout(() => terminalActionRef.current?.focus(), 0)
    }
  }, [activeSession?.state])

  const spheresWithIds = spheres.map((s, i) => ({
    ...s,
    id: s.id || `root-sphere-${i}`,
  }))

  const applySetupReply = (kind, text, sourceText) => {
    const parsed = extractJson(text || '')
    if (kind === 'spheres') {
      if (!parsed?.spheres?.length) {
        setError('AI не вернул список сфер. Попробуй описать подробнее.')
        return false
      }
      setSpheres(parsed.spheres.map((sphere, i) => ({ ...sphere, color: sphere.color || SPHERE_COLORS[i % SPHERE_COLORS.length] })))
      setStep(2)
    } else {
      if (!parsed?.tasks?.length) {
        setError('AI не вернул список задач. Попробуй описать подробнее.')
        return false
      }
      setTasks(parsed.tasks)
      setStep(4)
    }
    setHistory(previous => [...previous, { role: 'user', content: sourceText }])
    setPendingRequest(null)
    setActiveSession(null)
    setError(null)
    setErrorCode(null)
    return true
  }

  const submitOpenCodeAwareChat = async ({ messages, prompt }) => {
    const reuseSession = aiRuntime === 'opencode' ? openCodeSessionId : null
    const response = await ai.chat(messages, SETUP_SYSTEM, {
      sessionId: reuseSession,
      // The first request retains the full, backwards-compatible transcript.
      // Subsequent OpenCode requests carry only their new prompt and keep the
      // prior context inside the same local OpenCode session.
      prompt: reuseSession ? prompt : undefined,
    })
    if (response.error) {
      const failure = new Error(response.error)
      failure.code = response.code
      throw failure
    }
    if (!response.session_id) return response

    setOpenCodeSessionId(response.session_id)
    setActiveSession({ session_id: response.session_id, state: response.state || 'running' })
    pollAbortRef.current?.abort()
    const controller = new AbortController()
    pollAbortRef.current = controller
    const snapshot = await pollAiSession(response.session_id, {
      signal: controller.signal,
      onUpdate: setActiveSession,
    })
    if (pollAbortRef.current === controller) pollAbortRef.current = null
    return snapshot
  }

  const resumeActiveSession = async () => {
    if (!activeSession?.session_id || loading) return
    setLoading(true)
    setError(null)
    setErrorCode(null)
    pollAbortRef.current?.abort()
    const controller = new AbortController()
    pollAbortRef.current = controller
    try {
      const snapshot = await pollAiSession(activeSession.session_id, {
        signal: controller.signal,
        onUpdate: setActiveSession,
      })
      if (snapshot.state === 'completed' && pendingRequest) {
        applySetupReply(pendingRequest.kind, snapshot.text, pendingRequest.sourceText)
      } else if (snapshot.state === 'failed') {
        setError(snapshot.error || 'OpenCode не завершил запрос.')
        setErrorCode(snapshot.code || 'session_failed')
      }
    } catch (e) {
      setError(e.message || 'Не удалось проверить сессию OpenCode.')
      setErrorCode(e.code || 'session_status_error')
    } finally {
      if (pollAbortRef.current === controller) pollAbortRef.current = null
      setLoading(false)
    }
  }

  const openActiveSession = async () => {
    if (!activeSession?.session_id) return
    try {
      const result = await ai.openSession(activeSession.session_id, { legacyTerminal: activeSession.can_open_terminal === true })
      if (result.error) throw new Error(result.error)
    } catch (e) {
      setError(e.message || 'Не удалось открыть сессию в OpenCode.')
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
      setPendingRequest(null)
    } catch (e) {
      setError(e.message || 'Не удалось отменить сессию OpenCode.')
    } finally {
      setLoading(false)
    }
  }

  const startOpenCodeServer = async () => {
    setServerActionLoading(true)
    setError(null)
    setErrorCode(null)
    try {
      const result = await ai.startOpenCodeServer()
      if (result.error) {
        const failure = new Error(result.error)
        failure.code = result.code
        throw failure
      }
      setOpenCodeServer(result.openCodeServer || result.server || result)
      await refreshConfig()
    } catch (e) {
      setError(e.message || 'Не удалось запустить OpenCode.')
      setErrorCode(e.code || 'server_start_failed')
    } finally {
      setServerActionLoading(false)
    }
  }

  const stopOpenCodeServer = async () => {
    setServerActionLoading(true)
    try {
      const result = await ai.stopOpenCodeServer()
      if (result.error) {
        const failure = new Error(result.error)
        failure.code = result.code
        throw failure
      }
      setOpenCodeServer(result.openCodeServer || result.server || result)
      setOpenCodeSessionId(null)
      setActiveSession(null)
      setPendingRequest(null)
      await refreshConfig()
    } catch (e) {
      setError(e.message || 'Не удалось остановить OpenCode.')
      setErrorCode(e.code || 'server_stop_failed')
    } finally {
      setServerActionLoading(false)
    }
  }

  const submitSetupPrompt = async (kind, text, messages, prompt) => {
    setInput('')
    setLoading(true)
    setError(null)
    setErrorCode(null)
    setPendingRequest({ kind, sourceText: text })
    try {
      const reply = await submitOpenCodeAwareChat({ messages, prompt })
      if (!reply.state || reply.state === 'completed') {
        applySetupReply(kind, reply.text, text)
      } else if (reply.state === 'failed') {
        setError(reply.error || 'OpenCode не завершил запрос.')
        setErrorCode(reply.code || 'session_failed')
      }
    } catch (e) {
      setError(e.message || 'Не удалось отправить запрос AI.')
      setErrorCode(e.code || 'chat_error')
      setPendingRequest(null)
    } finally {
      setLoading(false)
    }
  }

  const handleDescribeSelf = async () => {
    const text = input.trim()
    if (!text || loading || ['running', 'permission_required', 'needs_attention'].includes(activeSession?.state)) return
    const msgs = [
      ...history,
      { role: 'user', content: text },
      { role: 'user', content: 'На основе моего описания предложи 5–6 сфер жизни. Верни только JSON-блок с сферами.' },
    ]
    const prompt = `${text}\n\nНа основе моего описания предложи 5–6 сфер жизни. Верни только JSON-блок с сферами.`
    await submitSetupPrompt('spheres', text, msgs, prompt)
  }

  const handleDescribeGoals = async () => {
    const text = input.trim()
    if (!text || loading || ['running', 'permission_required', 'needs_attention'].includes(activeSession?.state)) return
    const sphereList = spheresWithIds.map(s => `${s.id} = "${s.title}"`).join(', ')
    const msgs = [
      ...history,
      { role: 'user', content: text },
      { role: 'user', content: `Мои сферы: ${sphereList}. Предложи 4–6 конкретных задач. Каждая — в одну из сфер (parent_id). Верни только JSON-блок с задачами.` },
    ]
    const prompt = `${text}\n\nМои сферы: ${sphereList}. Предложи 4–6 конкретных задач. Каждая — в одну из сфер (parent_id). Верни только JSON-блок с задачами.`
    await submitSetupPrompt('tasks', text, msgs, prompt)
  }

  const createSpheres = async () => {
    setLoading(true); setError(null)
    try {
      for (const s of spheresWithIds) {
        if (!s.title?.trim()) continue
        await treeApi.create({ id: s.id, title: s.title, color: s.color, parent_id: null })
      }
      setStep(3)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const createTasks = async () => {
    setLoading(true); setError(null)
    try {
      for (const t of tasks) {
        if (!t.title?.trim()) continue
        await treeApi.create({ title: t.title, parent_id: t.parent_id, status: t.status || 'in_progress' })
      }
      setStep(5)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const finish = () => { onDone?.(); navigate('/') }

  if (hasAi === null) return null

  const isOpenCode = aiRuntime === 'opencode'
  const openCodeState = serverLifecycle(openCodeServer)
  const serverUnavailable = isOpenCode && (
    openCodeState !== 'ready' || openCodeServer?.available === false ||
    errorCode?.startsWith('server_') || SERVER_CONFIGURATION_ISSUES.has(errorCode)
  )
  const showServerStatus = isOpenCode && (serverUnavailable || openCodeServer?.managed === true || openCodeServer?.owned === true)
  const activeSessionBlocksInput = ['running', 'permission_required', 'needs_attention'].includes(activeSession?.state)

  // No-AI: show CLI onboarding screen
  if (!hasAi && !isOpenCode) {
    return (
      <div className="onboarding-page min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="onboarding-card bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="onboarding-appearance"><p>Оформление</p><ThemeSwitcher /></div>
            <CliOnboarding cliCommand={cliCommand} onDone={finish} />
          </div>
        </div>
      </div>
    )
  }

  // AI web flow
  return (
    <div className="onboarding-page min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <StepDots step={Math.min(step, 5)} total={6} />

        <div className="onboarding-card mt-8 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">

          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="p-8 text-center space-y-5">
              <div className="onboarding-appearance onboarding-appearance--welcome"><div><p>Оформление</p><span>Можно поменять в любой момент</span></div><ThemeSwitcher /></div>
              <div className="w-12 h-12 rounded-2xl bg-gray-900 dark:bg-white flex items-center justify-center mx-auto">
                <Sparkles size={22} className="text-white dark:text-gray-900" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Добро пожаловать в Life OS</h1>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  Личная система для задач, целей, привычек и всего остального.<br />
                  AI поможет настроить её под тебя за пару минут.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-left text-xs text-gray-500 dark:text-gray-400">
                {['Цели и задачи', 'Привычки', 'Списки (фильмы, книги…)', 'Воспоминания'].map(f => (
                  <div key={f} className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                    <CheckCircle2 size={11} className="text-gray-400 flex-shrink-0" />{f}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setStep(1)}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Начать настройку <ArrowRight size={15} />
              </button>
            </div>
          )}

          {/* Step 1: Describe yourself */}
          {step === 1 && (
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Расскажи о себе</p>
                <p className="text-xs text-gray-400 mt-1">Кто ты, чем занимаешься, что сейчас важно? AI предложит сферы жизни под тебя.</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                <textarea
                  autoFocus
                  value={input}
                  disabled={activeSessionBlocksInput}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleDescribeSelf() } }}
                  placeholder="Например: я студентка, хочу следить за здоровьем, читать больше, развивать творческие навыки…"
                  rows={4}
                  className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none resize-none placeholder-gray-400 disabled:opacity-50"
                />
              </div>
              {showServerStatus && <OpenCodeServerRecovery server={openCodeServer} errorCode={errorCode} busy={serverActionLoading} onStart={startOpenCodeServer} onStop={stopOpenCodeServer} onRefresh={refreshConfig} />}
              <OpenCodeSessionStatus session={activeSession} busy={loading} onOpen={openActiveSession} onCancel={cancelActiveSession} onCheck={resumeActiveSession} actionRef={terminalActionRef} />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                onClick={handleDescribeSelf}
                disabled={!input.trim() || loading || activeSessionBlocksInput}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <><ArrowUp size={15} /> Отправить</>}
              </button>
            </div>
          )}

          {/* Step 2: Confirm spheres */}
          {step === 2 && (
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Твои сферы жизни</p>
                <p className="text-xs text-gray-400 mt-1">Нажми на название чтобы изменить. Можешь убрать лишние.</p>
              </div>
              <div className="space-y-2">
                {spheres.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                    <input type="color" value={s.color}
                      onChange={e => setSpheres(prev => prev.map((x, j) => j === i ? { ...x, color: e.target.value } : x))}
                      className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent flex-shrink-0"
                    />
                    {editingSphere === i ? (
                      <input autoFocus value={s.title}
                        onChange={e => setSpheres(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                        onBlur={() => setEditingSphere(null)}
                        onKeyDown={e => e.key === 'Enter' && setEditingSphere(null)}
                        className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none border-b border-gray-300 dark:border-gray-600"
                      />
                    ) : (
                      <button onClick={() => setEditingSphere(i)} className="flex-1 text-left text-sm text-gray-800 dark:text-gray-200">{s.title}</button>
                    )}
                    <button onClick={() => setSpheres(prev => prev.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 text-xs px-1">✕</button>
                  </div>
                ))}
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button onClick={createSpheres} disabled={loading || spheres.length === 0}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <><CheckCircle2 size={15} /> Создать сферы</>}
              </button>
            </div>
          )}

          {/* Step 3: Describe goals */}
          {step === 3 && (
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Первые задачи</p>
                <p className="text-xs text-gray-400 mt-1">Что сейчас в приоритете? AI предложит конкретные задачи.</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {spheresWithIds.map(s => (
                  <span key={s.id} className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: s.color + '20', color: s.color }}>{s.title}</span>
                ))}
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                <textarea autoFocus value={input} disabled={activeSessionBlocksInput}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleDescribeGoals() } }}
                  placeholder="Например: хочу начать ходить в зал, дочитать книгу по дизайну, разобраться с курсовой…"
                  rows={4}
                  className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none resize-none placeholder-gray-400 disabled:opacity-50"
                />
              </div>
              {showServerStatus && <OpenCodeServerRecovery server={openCodeServer} errorCode={errorCode} busy={serverActionLoading} onStart={startOpenCodeServer} onStop={stopOpenCodeServer} onRefresh={refreshConfig} />}
              <OpenCodeSessionStatus session={activeSession} busy={loading} onOpen={openActiveSession} onCancel={cancelActiveSession} onCheck={resumeActiveSession} actionRef={terminalActionRef} />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button onClick={handleDescribeGoals} disabled={!input.trim() || loading || activeSessionBlocksInput}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <><ArrowUp size={15} /> Отправить</>}
              </button>
              <button onClick={() => setStep(5)} className="w-full text-xs text-gray-400 hover:text-gray-600 py-1">Пропустить</button>
            </div>
          )}

          {/* Step 4: Confirm tasks */}
          {step === 4 && (
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Первые задачи</p>
                <p className="text-xs text-gray-400 mt-1">Нажми на задачу чтобы изменить. Убери лишние.</p>
              </div>
              <div className="space-y-2">
                {tasks.map((t, i) => {
                  const sphere = spheresWithIds.find(s => s.id === t.parent_id)
                  return (
                    <div key={i} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sphere?.color || '#6B7280' }} />
                      <div className="flex-1 min-w-0">
                        <input value={t.title}
                          onChange={e => setTasks(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                          className="w-full bg-transparent text-sm text-gray-800 dark:text-gray-200 outline-none"
                        />
                        <span className="text-[10px] text-gray-400">{sphere?.title || t.parent_id}</span>
                      </div>
                      <button onClick={() => setTasks(prev => prev.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 text-xs px-1">✕</button>
                    </div>
                  )
                })}
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button onClick={createTasks} disabled={loading || tasks.length === 0}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <><CheckCircle2 size={15} /> Добавить задачи</>}
              </button>
              <button onClick={() => setStep(5)} className="w-full text-xs text-gray-400 hover:text-gray-600 py-1">Пропустить</button>
            </div>
          )}

          {/* Step 5: Done */}
          {step === 5 && (
            <div className="p-8 text-center space-y-5">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                <CheckCircle2 size={24} className="text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Готово!</h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  Создали <span className="font-medium text-gray-700 dark:text-gray-300">{spheres.length} сфер</span> и{' '}
                  <span className="font-medium text-gray-700 dark:text-gray-300">{tasks.length} задач</span>.
                  Зайди в «Привычки» чтобы настроить трекинг, в «Сегодня» чтобы увидеть план дня.
                </p>
              </div>
              <div className="text-left text-xs text-gray-400 space-y-1.5 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                <div className="font-medium text-gray-600 dark:text-gray-300 mb-1">Быстрые клавиши:</div>
                <div><kbd className="bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded text-[10px] border border-gray-200 dark:border-gray-600">⌘K</kbd> — быстрый захват</div>
                <div><kbd className="bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded text-[10px] border border-gray-200 dark:border-gray-600">⌘J</kbd> — чат с AI</div>
                <div><kbd className="bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded text-[10px] border border-gray-200 dark:border-gray-600">⌘F</kbd> — поиск</div>
              </div>
              <button onClick={finish}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Открыть Life OS <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
