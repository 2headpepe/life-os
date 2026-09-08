import { useState, useEffect, useRef } from 'react'
import { Check, X, ArrowUp } from 'lucide-react'
import { claude, context as contextApi, config as configApi } from '../api'

function renderText(text) {
  return text.split('\n').map((line, i) => <span key={i}>{line}{i < text.split('\n').length - 1 && <br />}</span>)
}

export default function ClaudeConsole({ open, onClose, prefill = '', contextMessage = '', onPrefillUsed }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [ctx, setCtx] = useState(null)
  const [aiLabel, setAiLabel] = useState('AI')
  const bottomRef = useRef()
  const inputRef = useRef()

  useEffect(() => {
    configApi.get().then(c => {
      const cmd = c.cliCommand || 'claude'
      setAiLabel(cmd === 'opencode' ? 'AI' : 'Claude')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (open) {
      setError(null)
      if (prefill) {
        setInput(prefill)
        onPrefillUsed?.()
      }
      setTimeout(() => inputRef.current?.focus(), 100)
      if (!ctx) contextApi.get().then(setCtx).catch(() => {})
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

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

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setError(null)

    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setLoading(true)

    const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }))
    if (messages.length === 0 && (ctx || contextMessage)) {
      const ctxMsg = buildContextMessage()
      if (ctxMsg) apiMessages.unshift({ role: 'user', content: ctxMsg }, { role: 'assistant', content: 'Понял, вижу твой контекст. Чем помочь?' })
    }

    try {
      const res = await claude.chat(apiMessages)
      if (res.error) setError(res.error)
      else setMessages(prev => [...prev, { role: 'assistant', content: res.text }])
    } catch {
      setError('Ошибка соединения с сервером')
    }
    setLoading(false)
  }

  if (!open) return null

  const hints = [
    'Декомпозируй мою главную цель на задачи',
    'Что мне сделать первым делом сегодня?',
    'Помоги разобрать inbox и расставить приоритеты',
    'Как улучшить мои привычки на этой неделе?',
  ]

  return (
    <>
      <div className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-[420px] max-w-full z-50 bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 flex flex-col shadow-2xl">

        {/* Header */}
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
              <button onClick={() => setMessages([])} className="text-xs text-gray-400 hover:text-gray-600">Очистить</button>
            )}
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={14} /></button>
          </div>
        </div>

        {/* Messages */}
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

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 rounded-2xl rounded-bl-sm">
                <span className="inline-flex gap-1">
                  {[0,1,2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
                  ))}
                </span>
              </div>
            </div>
          )}

          {error && <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</div>}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800">
          <div className="flex gap-2 items-end bg-gray-50 dark:bg-gray-900 rounded-xl px-3 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Напиши... (Enter — отправить)"
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none resize-none placeholder-gray-400 dark:placeholder-gray-600"
              style={{ maxHeight: '120px' }}
            />
            <button onClick={send} disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-900 dark:bg-white text-white dark:text-gray-900 disabled:opacity-30 flex-shrink-0"><ArrowUp size={16} /></button>
          </div>
          <p className="text-xs text-gray-400 mt-1 text-center">⌘J закрыть · Shift+Enter новая строка</p>
        </div>
      </div>
    </>
  )
}
