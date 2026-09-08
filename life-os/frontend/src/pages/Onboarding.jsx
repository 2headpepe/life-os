import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUp, Loader2, CheckCircle2, Sparkles } from 'lucide-react'
import { claude, tree as treeApi } from '../api'

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

function extractJson(text) {
  const m = text.match(/```json\s*([\s\S]*?)```/)
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
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

export default function Onboarding({ onDone }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0) // 0=welcome 1=spheres-chat 2=spheres-confirm 3=tasks-chat 4=tasks-confirm 5=done
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])

  const [spheres, setSpheres] = useState([])
  const [editingSphere, setEditingSphere] = useState(null)
  const [tasks, setTasks] = useState([])

  const ai = async (messages, system) => {
    const res = await claude.chat(messages, system || SETUP_SYSTEM)
    if (res.error) throw new Error(res.error)
    return res.text
  }

  // Step 1: user describes themselves → AI proposes spheres
  const handleDescribeSelf = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setLoading(true)
    setError(null)

    const msgs = [
      ...history,
      { role: 'user', content: text },
      { role: 'user', content: 'На основе моего описания предложи 5–6 сфер жизни. Верни только JSON-блок с сферами, как описано в инструкции.' },
    ]

    try {
      const reply = await ai(msgs)
      const parsed = extractJson(reply)
      if (parsed?.spheres?.length) {
        setSpheres(parsed.spheres.map((s, i) => ({ ...s, color: s.color || SPHERE_COLORS[i % SPHERE_COLORS.length] })))
        setHistory([...history, { role: 'user', content: text }])
        setStep(2)
      } else {
        setError('AI не вернул список сфер. Попробуй описать подробнее.')
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  // Step 2 confirm: create sphere nodes
  const createSpheres = async () => {
    setLoading(true)
    setError(null)
    try {
      for (const s of spheres) {
        await treeApi.create({ id: s.id, title: s.title, color: s.color, parent_id: null })
      }
      setStep(3)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  // Step 3: user describes goals → AI proposes tasks
  const handleDescribeGoals = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setLoading(true)
    setError(null)

    const sphereList = spheres.map(s => `${s.id} = "${s.title}"`).join(', ')
    const msgs = [
      ...history,
      { role: 'user', content: text },
      { role: 'user', content: `Мои сферы: ${sphereList}. Предложи 4–6 конкретных задач на основе моего описания. Каждая задача должна относиться к одной из сфер (parent_id). Верни только JSON-блок с задачами.` },
    ]

    try {
      const reply = await ai(msgs)
      const parsed = extractJson(reply)
      if (parsed?.tasks?.length) {
        setTasks(parsed.tasks)
        setHistory([...history, { role: 'user', content: text }])
        setStep(4)
      } else {
        setError('AI не вернул список задач. Попробуй описать подробнее.')
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  // Step 4 confirm: create task nodes
  const createTasks = async () => {
    setLoading(true)
    setError(null)
    try {
      for (const t of tasks) {
        await treeApi.create({ title: t.title, parent_id: t.parent_id, status: t.status || 'in_progress' })
      }
      setStep(5)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const finish = () => {
    onDone?.()
    navigate('/')
  }

  const sphereTitle = (id) => spheres.find(s => s.id === id)?.title || id

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
                  Это твоя личная система для задач, целей, привычек и всего остального.<br />
                  Давай за пару минут настроим её под тебя.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-left text-xs text-gray-500 dark:text-gray-400">
                {['Цели и задачи', 'Привычки', 'Списки (фильмы, книги…)', 'Воспоминания'].map(f => (
                  <div key={f} className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                    <CheckCircle2 size={11} className="text-gray-400 flex-shrink-0" />
                    {f}
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
                <p className="text-xs text-gray-400 mt-1">
                  Кто ты, чем занимаешься, что сейчас важно? AI предложит сферы жизни под тебя.
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                <textarea
                  autoFocus
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleDescribeSelf() } }}
                  placeholder="Например: я студентка, хочу лучше следить за здоровьем, читать больше, развивать творческие навыки…"
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
                  <div key={s.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                    <input
                      type="color"
                      value={s.color}
                      onChange={e => setSpheres(prev => prev.map((x, j) => j === i ? { ...x, color: e.target.value } : x))}
                      className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                    />
                    {editingSphere === i ? (
                      <input
                        autoFocus
                        value={s.title}
                        onChange={e => setSpheres(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                        onBlur={() => setEditingSphere(null)}
                        onKeyDown={e => e.key === 'Enter' && setEditingSphere(null)}
                        className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none border-b border-gray-300 dark:border-gray-600"
                      />
                    ) : (
                      <button onClick={() => setEditingSphere(i)} className="flex-1 text-left text-sm text-gray-800 dark:text-gray-200 hover:text-gray-900">
                        {s.title}
                      </button>
                    )}
                    <button
                      onClick={() => setSpheres(prev => prev.filter((_, j) => j !== i))}
                      className="text-gray-300 hover:text-red-400 text-xs px-1"
                    >✕</button>
                  </div>
                ))}
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                onClick={createSpheres}
                disabled={loading || spheres.length === 0}
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
                <p className="text-xs text-gray-400 mt-1">
                  Что сейчас в приоритете? Что хочешь сделать в ближайшее время?
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {spheres.map(s => (
                  <span key={s.id} className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: s.color + '20', color: s.color }}>
                    {s.title}
                  </span>
                ))}
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                <textarea
                  autoFocus
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleDescribeGoals() } }}
                  placeholder="Например: хочу начать ходить в зал, дочитать книгу по дизайну, разобраться с курсовой…"
                  rows={4}
                  className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none resize-none placeholder-gray-400"
                />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                onClick={handleDescribeGoals}
                disabled={!input.trim() || loading}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <><ArrowUp size={15} /> Отправить</>}
              </button>
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
                  const sphere = spheres.find(s => s.id === t.parent_id)
                  return (
                    <div key={i} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sphere?.color || '#6B7280' }} />
                      <div className="flex-1 min-w-0">
                        <input
                          value={t.title}
                          onChange={e => setTasks(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                          className="w-full bg-transparent text-sm text-gray-800 dark:text-gray-200 outline-none"
                        />
                        <span className="text-[10px] text-gray-400">{sphereTitle(t.parent_id)}</span>
                      </div>
                      <button
                        onClick={() => setTasks(prev => prev.filter((_, j) => j !== i))}
                        className="text-gray-300 hover:text-red-400 text-xs px-1"
                      >✕</button>
                    </div>
                  )
                })}
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                onClick={createTasks}
                disabled={loading || tasks.length === 0}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <><CheckCircle2 size={15} /> Добавить задачи</>}
              </button>
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
                  Создали{' '}
                  <span className="font-medium text-gray-700 dark:text-gray-300">{spheres.length} сфер</span> и{' '}
                  <span className="font-medium text-gray-700 dark:text-gray-300">{tasks.length} задач</span>.
                  Теперь исследуй — зайди в «Привычки» чтобы настроить трекинг, в «Сегодня» чтобы увидеть план дня.
                </p>
              </div>
              <div className="text-left text-xs text-gray-400 space-y-1.5 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                <div className="font-medium text-gray-600 dark:text-gray-300 mb-1">Быстрые клавиши:</div>
                <div><kbd className="bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded text-[10px] border border-gray-200 dark:border-gray-600">⌘K</kbd> — быстрый захват</div>
                <div><kbd className="bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded text-[10px] border border-gray-200 dark:border-gray-600">⌘J</kbd> — спросить AI</div>
                <div><kbd className="bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded text-[10px] border border-gray-200 dark:border-gray-600">⌘F</kbd> — поиск</div>
              </div>
              <button
                onClick={finish}
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
