import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUp, Loader2, CheckCircle2, Sparkles, Terminal, RefreshCw } from 'lucide-react'
import { claude, config as configApi, tree as treeApi } from '../api'
import { openInConsole } from '../utils/openInConsole'

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
  const [cliCommand, setCliCommand] = useState('claude')
  const [step, setStep] = useState(0)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])
  const [spheres, setSpheres] = useState([])
  const [editingSphere, setEditingSphere] = useState(null)
  const [tasks, setTasks] = useState([])

  useEffect(() => {
    configApi.get()
      .then(c => { setHasAi(!!c.hasAi); setCliCommand(c.cliCommand || 'claude') })
      .catch(() => setHasAi(false))
  }, [])

  const spheresWithIds = spheres.map((s, i) => ({
    ...s,
    id: s.id || `root-sphere-${i}`,
  }))

  const handleDescribeSelf = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput(''); setLoading(true); setError(null)
    const msgs = [
      ...history,
      { role: 'user', content: text },
      { role: 'user', content: 'На основе моего описания предложи 5–6 сфер жизни. Верни только JSON-блок с сферами.' },
    ]
    try {
      const reply = await claude.chat(msgs, SETUP_SYSTEM)
      if (reply.error) throw new Error(reply.error)
      const parsed = extractJson(reply.text)
      if (parsed?.spheres?.length) {
        setSpheres(parsed.spheres.map((s, i) => ({ ...s, color: s.color || SPHERE_COLORS[i % SPHERE_COLORS.length] })))
        setHistory([...history, { role: 'user', content: text }])
        setStep(2)
      } else {
        setError('AI не вернул список сфер. Попробуй описать подробнее.')
      }
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const handleDescribeGoals = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput(''); setLoading(true); setError(null)
    const sphereList = spheresWithIds.map(s => `${s.id} = "${s.title}"`).join(', ')
    const msgs = [
      ...history,
      { role: 'user', content: text },
      { role: 'user', content: `Мои сферы: ${sphereList}. Предложи 4–6 конкретных задач. Каждая — в одну из сфер (parent_id). Верни только JSON-блок с задачами.` },
    ]
    try {
      const reply = await claude.chat(msgs, SETUP_SYSTEM)
      if (reply.error) throw new Error(reply.error)
      const parsed = extractJson(reply.text)
      if (parsed?.tasks?.length) {
        setTasks(parsed.tasks)
        setHistory([...history, { role: 'user', content: text }])
        setStep(4)
      } else {
        setError('AI не вернул список задач. Попробуй описать подробнее.')
      }
    } catch (e) { setError(e.message) }
    setLoading(false)
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

  // No-AI: show CLI onboarding screen
  if (!hasAi) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <CliOnboarding cliCommand={cliCommand} onDone={finish} />
          </div>
        </div>
      </div>
    )
  }

  // AI web flow
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <StepDots step={Math.min(step, 5)} total={6} />

        <div className="mt-8 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">

          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="p-8 text-center space-y-5">
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
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleDescribeSelf() } }}
                  placeholder="Например: я студентка, хочу следить за здоровьем, читать больше, развивать творческие навыки…"
                  rows={4}
                  className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none resize-none placeholder-gray-400"
                />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                onClick={handleDescribeSelf}
                disabled={!input.trim() || loading}
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
                <textarea autoFocus value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleDescribeGoals() } }}
                  placeholder="Например: хочу начать ходить в зал, дочитать книгу по дизайну, разобраться с курсовой…"
                  rows={4}
                  className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none resize-none placeholder-gray-400"
                />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button onClick={handleDescribeGoals} disabled={!input.trim() || loading}
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
