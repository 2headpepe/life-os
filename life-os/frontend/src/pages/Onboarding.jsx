import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, ArrowUp, Loader2, CheckCircle2, Sparkles,
  Terminal, RefreshCw, Calendar, GitBranch, Activity,
  Zap, Layers, Edit2, X, ChevronDown, ChevronRight,
} from 'lucide-react'
import { claude, config as configApi, tree as treeApi, habits as habitsApi, profile as profileApi } from '../api'
import { openInConsole } from '../utils/openInConsole'

// ─── Constants ────────────────────────────────────────────────────

const SPHERE_COLORS = ['#3B82F6', '#22C55E', '#EF4444', '#06B6D4', '#EC4899', '#F59E0B', '#8B5CF6', '#F97316']

const FEATURES = [
  { icon: Calendar, color: '#3B82F6', title: 'Сегодня', desc: 'Все задачи на день и статус привычек — одним взглядом' },
  { icon: GitBranch, color: '#8B5CF6', title: 'Дерево', desc: 'Цели и задачи по всем сферам жизни, с декомпозицией' },
  { icon: Activity, color: '#22C55E', title: 'Привычки', desc: 'Ежедневный трекинг и статистика по каждой привычке' },
  { icon: Zap, color: '#F59E0B', title: '⌘K — Захват', desc: 'Мысль, задача, идея — в систему за одну секунду' },
  { icon: Layers, color: '#06B6D4', title: 'Лента', desc: 'Умные карточки: что сделать, что вспомнить, что важно' },
]

const IMPACT_GUIDE = [
  { emoji: '🌅', when: 'Утром', what: 'Открой «Сегодня» — там твой план дня' },
  { emoji: '⚡', when: 'Любая мысль', what: 'Нажми ⌘K — захвати в систему, не потеряй' },
  { emoji: '🌙', when: 'Вечером', what: 'Отметь привычки — 30 секунд, видна динамика' },
  { emoji: '📅', when: 'Раз в неделю', what: 'Открой «Дерево» — закрой сделанное, добавь новое' },
]

// ─── AI System Prompt ─────────────────────────────────────────────

const SETUP_SYSTEM = `Ты помощник по настройке Life OS — персональной системы управления жизнью.
Отвечай по-русски. Возвращай ТОЛЬКО JSON-блок без текста до и после.

Форматы:

Сферы:
\`\`\`json
{"spheres":[{"id":"root-health","title":"Здоровье","color":"#3B82F6"}]}
\`\`\`
id = root-{slug} (латиница, дефисы). Предлагай 5–6 сфер.

Цели и задачи:
\`\`\`json
{"goals":[{"id":"goal-health-fitness","title":"Войти в форму к весне","outcome":"Регулярные тренировки 3×/нед, −5 кг жира","parent_id":"root-health"}],"tasks":[{"id":"node-gym-schedule","title":"Составить план тренировок","parent_id":"goal-health-fitness","notes":"пн/ср/пт"}]}
\`\`\`
Правила: title goal начинается с глагола, outcome измерим. Минимум 2 goal на активную сферу, 2–3 task на goal. Итого минимум 8 tasks.

Привычки:
\`\`\`json
{"habits":[{"id":"habit-training","title":"Тренировка","detail":"Отмечай после каждой тренировки","category":"Здоровье"}]}
\`\`\`
Правила: 3–6 привычек, конкретные, связаны с целями пользователя. Не добавляй generic привычки (пить воду, медитировать) если они не из контекста.`

const CLI_ONBOARDING_PROMPT = `Ты настраиваешь Life OS — личную систему управления жизнью — для нового пользователя.
Работаешь в терминале. Веди диалог поэтапно, не отправляй всё сразу.

═══ БЛОК 1: Знакомство ═══
Поприветствуй и узнай:
— Имя
— Чем занимается (работа, учёба, контекст)
— Какие сферы жизни важны прямо сейчас (здоровье, работа, учёба, отношения, финансы, хобби...)
— Для каждой сферы: что хочет достичь в ближайшие 1–3 месяца?

═══ БЛОК 2: Декомпозиция целей ═══
Для каждой сферы с целью:
1. Переформулируй цель конкретно и измеримо (не "заниматься спортом", а "ходить в зал 3×/нед до мая")
2. Уточни 2–3 конкретных задачи / следующих шага
3. Спроси: что можно начать прямо на этой неделе?

═══ БЛОК 3: Привычки ═══
Предложи 3–5 конкретных привычек исходя из целей пользователя.
Уточни формат каждой (да/нет, счётчик, время).
Спроси нет ли ещё чего-то что хотел бы отслеживать ежедневно.

═══ БЛОК 4: Запись данных ═══
После сбора всех данных запиши три файла:

1. brain/content/tree/nodes.json
Структура:
{"_type":"tree","updated":"СЕГОДНЯ","nodes":[
  // Корневые сферы: parent_id=null, id=root-{slug}
  {"id":"root-health","title":"Здоровье","parent_id":null,"color":"#3B82F6","status":null,"due":null,"notes":null,"created":"СЕГОДНЯ","updated":"СЕГОДНЯ"},
  // Цели: parent_id=root-{sphere}, id=goal-{sphere}-{slug}, добавь поле outcome
  {"id":"goal-health-fitness","title":"Войти в форму к маю","outcome":"Зал 3×/нед, −5 кг","parent_id":"root-health","color":null,"status":null,"due":"2026-05-01","notes":null,"created":"СЕГОДНЯ","updated":"СЕГОДНЯ"},
  // Задачи: parent_id=goal-..., id=node-{slug}, status="in_progress"
  {"id":"node-gym-plan","title":"Составить план тренировок","parent_id":"goal-health-fitness","color":null,"status":"in_progress","due":null,"notes":"пн/ср/пт","created":"СЕГОДНЯ","updated":"СЕГОДНЯ"}
]}
Сохрани существующие узлы если файл уже есть.

2. brain/content/habits/definitions.json
{"categories":[{"id":"main","label":"Основные","habits":[
  {"id":"habit-training","label":"Тренировка","detail":"Отметь после тренировки","kind":"toggle","max_score":1,"active":true}
]}]}

3. brain/content/inbox/current.json — добавь задачи «на эту неделю» из ответов пользователя
{"_type":"inbox","updated":"СЕГОДНЯ","items":[
  {"id":"inbox-{slug}","text":"Купить абонемент в зал","tags":["здоровье"],"created":"СЕГОДНЯ","updated":"СЕГОДНЯ"}
]}
Если файл уже есть — прочитай и добавь новые items к существующим.

После записи всех файлов напиши пользователю краткий итог:
— Сколько сфер, целей, задач создано
— Сколько привычек настроено
— Что попало в инбокс
— "Готово! Вернись в браузер и нажми «Я готов»."

Начни с приветствия прямо сейчас.`

// ─── JSON extractor ───────────────────────────────────────────────

function extractJson(text) {
  const patterns = [/```json\s*([\s\S]*?)```/, /```\s*([\s\S]*?)```/, /(\{[\s\S]*\})/]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) { try { return JSON.parse(m[1]) } catch {} }
  }
  return null
}

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30)
}

// ─── Sub-components ───────────────────────────────────────────────

function StepDots({ step, total }) {
  return (
    <div className="flex gap-1.5 justify-center mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-gray-900 dark:bg-white' : i < step ? 'w-1.5 bg-gray-400 dark:bg-gray-500' : 'w-1.5 bg-gray-200 dark:bg-gray-700'}`} />
      ))}
    </div>
  )
}

function FeatureCard({ icon: Icon, color, title, desc }) {
  return (
    <div className="flex items-start gap-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + '20' }}>
        <Icon size={15} style={{ color }} />
      </div>
      <div>
        <div className="text-xs font-medium text-gray-900 dark:text-gray-100">{title}</div>
        <div className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{desc}</div>
      </div>
    </div>
  )
}

function GoalTree({ goals, tasks, spheres }) {
  const [expanded, setExpanded] = useState({})
  const sphereMap = Object.fromEntries(spheres.map(s => [s.id, s]))

  const goalsBySphere = goals.reduce((acc, g) => {
    if (!acc[g.parent_id]) acc[g.parent_id] = []
    acc[g.parent_id].push(g)
    return acc
  }, {})

  const tasksByGoal = tasks.reduce((acc, t) => {
    if (!acc[t.parent_id]) acc[t.parent_id] = []
    acc[t.parent_id].push(t)
    return acc
  }, {})

  return (
    <div className="space-y-3">
      {Object.entries(goalsBySphere).map(([sphereId, sphereGoals]) => {
        const sphere = sphereMap[sphereId]
        return (
          <div key={sphereId} className="rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800">
            <div className="px-3 py-2 text-xs font-semibold text-white flex items-center gap-2" style={{ backgroundColor: sphere?.color || '#6B7280' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
              {sphere?.title || sphereId}
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {sphereGoals.map(goal => (
                <div key={goal.id}>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, [goal.id]: !e[goal.id] }))}
                    className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    {(tasksByGoal[goal.id]?.length) ? (
                      expanded[goal.id]
                        ? <ChevronDown size={12} className="mt-0.5 text-gray-400 flex-shrink-0" />
                        : <ChevronRight size={12} className="mt-0.5 text-gray-400 flex-shrink-0" />
                    ) : <div className="w-3" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 dark:text-gray-200 leading-tight">{goal.title}</div>
                      {goal.outcome && <div className="text-[10px] text-gray-400 mt-0.5">{goal.outcome}</div>}
                    </div>
                    <div className="text-[10px] text-gray-300 flex-shrink-0 mt-0.5">{tasksByGoal[goal.id]?.length || 0} задач</div>
                  </button>
                  {expanded[goal.id] && tasksByGoal[goal.id]?.map(task => (
                    <div key={task.id} className="flex items-start gap-2 px-3 py-2 pl-8 bg-gray-50/50 dark:bg-gray-800/30">
                      <div className="w-1 h-1 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
                      <div>
                        <div className="text-[11px] text-gray-600 dark:text-gray-400">{task.title}</div>
                        {task.notes && <div className="text-[10px] text-gray-400 mt-0.5">{task.notes}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Remaining sections guide (shown after CLI onboarding) ────────

const REMAINING_SECTIONS = [
  {
    emoji: '🎬',
    title: 'Списки',
    path: '/lists',
    desc: 'Фильмы, книги, игры, сериалы, желания. Добавляй что хочешь посмотреть или прочитать.',
  },
  {
    emoji: '📸',
    title: 'Воспоминания',
    path: '/memories',
    desc: 'Фиксируй важные моменты, события, фото. Будет приятно перечитывать через год.',
  },
  {
    emoji: '💡',
    title: 'Инсайты',
    path: '/insights',
    desc: 'Наблюдения, идеи, паттерны. Добавляй через ⌘K → «Инсайт» или прямо в разделе.',
  },
  {
    emoji: '📰',
    title: 'Лента',
    path: '/feed',
    desc: 'Умные карточки появятся автоматически на основе твоих данных. Загляни сегодня вечером.',
  },
]

function CliRemainingGuide({ stats, onDone }) {
  return (
    <div className="p-6 space-y-5">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
          <CheckCircle2 size={24} className="text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Планирование завершено!</h2>
          {stats && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {stats}
            </p>
          )}
          <p className="mt-1.5 text-xs text-gray-400">Осталось познакомиться с остальными разделами</p>
        </div>
      </div>

      <div className="space-y-2">
        {REMAINING_SECTIONS.map(s => (
          <div key={s.path} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3">
            <span className="text-xl leading-none mt-0.5">{s.emoji}</span>
            <div>
              <div className="text-xs font-medium text-gray-900 dark:text-gray-100">{s.title}</div>
              <div className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Как получить максимум</p>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {IMPACT_GUIDE.map(g => (
            <div key={g.when} className="flex items-start gap-3 px-4 py-2.5">
              <span className="text-base leading-none mt-0.5">{g.emoji}</span>
              <div>
                <div className="text-xs font-medium text-gray-800 dark:text-gray-200">{g.when}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{g.what}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={onDone} className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity">
        Открыть Life OS <ArrowRight size={15} />
      </button>
    </div>
  )
}

// ─── CLI path ─────────────────────────────────────────────────────

function CliOnboarding({ cliCommand, onCliDone, onDone }) {
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
      if (nodes.some(n => n.parent_id !== null)) {
        const sphereCount = nodes.filter(n => n.parent_id === null).length
        const goalCount = nodes.filter(n => n.parent_id !== null && nodes.some(p => p.id === n.parent_id && p.parent_id === null)).length
        const taskCount = nodes.filter(n => n.parent_id !== null && !nodes.some(p => p.id === n.parent_id && p.parent_id === null)).length
        onCliDone(`${sphereCount} сфер · ${goalCount} целей · ${taskCount} задач`)
      } else {
        alert('Данные ещё не записаны. Заверши интервью в консоли и попробуй снова.')
      }
    } catch { alert('Не удалось проверить данные. Попробуй снова.') }
    setChecking(false)
  }

  return (
    <div className="p-8 space-y-6">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-gray-900 dark:bg-white flex items-center justify-center mx-auto">
          <Terminal size={22} className="text-white dark:text-gray-900" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Настройка через {cliCommand}</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            AI-ассистент проведёт полное интервью и настроит<br />сферы, цели, задачи и привычки.
          </p>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2 text-xs text-gray-500 dark:text-gray-400">
        {[
          `Нажми кнопку — откроется терминал с ${cliCommand}`,
          `Вставь первое сообщение ⌘V — оно уже в буфере обмена`,
          `Ответь на вопросы — ассистент сам запишет все данные`,
          `Когда скажет «Готово» — вернись сюда и нажми «Я готов»`,
        ].map((s, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-gray-300 font-mono mt-0.5">{i + 1}.</span>
            <span>{s}</span>
          </div>
        ))}
      </div>

      {!launched ? (
        <button onClick={launch} className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity">
          <Terminal size={15} /> Открыть {cliCommand}
        </button>
      ) : (
        <div className="space-y-2">
          <button onClick={checkAndContinue} disabled={checking} className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
            {checking ? <Loader2 size={15} className="animate-spin" /> : <><CheckCircle2 size={15} /> Я готов</>}
          </button>
          <button onClick={launch} className="w-full flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-gray-600 py-2">
            <RefreshCw size={12} /> Открыть снова
          </button>
        </div>
      )}

      <div className="border-t border-gray-100 dark:border-gray-800 pt-4 text-center">
        <button onClick={onDone} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">Пропустить →</button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────

export default function Onboarding({ onDone }) {
  const navigate = useNavigate()
  const [hasAi, setHasAi] = useState(null)
  const [cliCommand, setCliCommand] = useState('claude')

  const [step, setStep] = useState(0)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Step 1
  const [name, setName] = useState('')
  const [selfDesc, setSelfDesc] = useState('')

  // Step 2 — spheres
  const [spheres, setSpheres] = useState([])
  const [editingSphere, setEditingSphere] = useState(null)

  // Step 3 — goals + tasks
  const [goalsDesc, setGoalsDesc] = useState('')
  const [goals, setGoals] = useState([])
  const [tasks, setTasks] = useState([])
  const [treeExpanded, setTreeExpanded] = useState(true)

  // Step 4 — habits
  const [habits, setHabits] = useState([])
  const [loadingHabits, setLoadingHabits] = useState(false)

  // Step 5 summary
  const [done, setDone] = useState(false)

  // CLI post-onboarding
  const [cliStats, setCliStats] = useState(null)
  const [showCliGuide, setShowCliGuide] = useState(false)

  const inputRef = useRef(null)

  useEffect(() => {
    configApi.get()
      .then(c => { setHasAi(!!c.hasAi); setCliCommand(c.cliCommand || 'claude') })
      .catch(() => setHasAi(false))
  }, [])

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus()
  }, [step])

  const spheresWithIds = spheres.map((s, i) => ({
    ...s,
    id: s.id || `root-sphere-${i}`,
  }))

  // ── Step 1 → 2: describe self → AI suggests spheres ──

  const handleDescribeSelf = async () => {
    if (!selfDesc.trim() || loading) return
    setLoading(true); setError(null)
    const msgs = [
      { role: 'user', content: `Меня зовут ${name || 'пользователь'}. ${selfDesc}` },
      { role: 'user', content: 'На основе моего описания предложи 5–6 сфер жизни. Верни только JSON.' },
    ]
    try {
      const reply = await claude.chat(msgs, SETUP_SYSTEM)
      if (reply.error) throw new Error(reply.error)
      const parsed = extractJson(reply.text)
      if (parsed?.spheres?.length) {
        setSpheres(parsed.spheres.map((s, i) => ({ ...s, color: s.color || SPHERE_COLORS[i % SPHERE_COLORS.length] })))
        setStep(2)
      } else {
        setError('AI не вернул список сфер. Попробуй описать подробнее.')
      }
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  // ── Step 2 → 3: confirm spheres, save to backend ──

  const confirmSpheres = async () => {
    setLoading(true); setError(null)
    try {
      if (name.trim()) await profileApi.update({ name: name.trim(), occupation: selfDesc.trim() })
      for (const s of spheresWithIds) {
        if (!s.title?.trim()) continue
        await treeApi.create({ id: s.id, title: s.title, color: s.color, parent_id: null })
      }
      setStep(3)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  // ── Step 3 → 4: describe goals → AI generates goals+tasks ──

  const handleDescribeGoals = async () => {
    if (!goalsDesc.trim() || loading) return
    setLoading(true); setError(null)
    const sphereList = spheresWithIds.map(s => `${s.id} = "${s.title}"`).join(', ')
    const msgs = [
      { role: 'user', content: `Меня зовут ${name}. ${selfDesc}` },
      { role: 'user', content: `Мои сферы: ${sphereList}` },
      { role: 'user', content: `Мои цели и планы: ${goalsDesc}` },
      { role: 'user', content: 'Предложи цели и задачи. Верни только JSON с goals и tasks.' },
    ]
    try {
      const reply = await claude.chat(msgs, SETUP_SYSTEM)
      if (reply.error) throw new Error(reply.error)
      const parsed = extractJson(reply.text)
      if (parsed?.goals?.length) {
        setGoals(parsed.goals)
        setTasks(parsed.tasks || [])
        setTreeExpanded(true)
        setStep(4)
      } else {
        setError('AI не вернул структуру целей. Попробуй описать подробнее.')
      }
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  // ── Step 4 → 5: confirm goals+tasks, then auto-generate habits ──

  const confirmGoalsAndLoadHabits = async () => {
    setLoading(true); setError(null)
    try {
      for (const g of goals) {
        if (!g.title?.trim()) continue
        await treeApi.create({ id: g.id || `goal-${slugify(g.title)}`, title: g.title, parent_id: g.parent_id, outcome: g.outcome })
      }
      for (const t of tasks) {
        if (!t.title?.trim()) continue
        await treeApi.create({ id: t.id || `node-${slugify(t.title)}`, title: t.title, parent_id: t.parent_id, status: 'in_progress', notes: t.notes })
      }
      setStep(5)
      setLoadingHabits(true)
      const sphereList = spheresWithIds.map(s => `"${s.title}"`).join(', ')
      const goalList = goals.map(g => g.title).join(', ')
      const msgs = [
        { role: 'user', content: `Меня зовут ${name}. ${selfDesc}` },
        { role: 'user', content: `Мои сферы: ${sphereList}. Мои цели: ${goalList}` },
        { role: 'user', content: 'Предложи 3–5 конкретных привычек для ежедневного трекинга. Верни только JSON.' },
      ]
      const reply = await claude.chat(msgs, SETUP_SYSTEM)
      if (!reply.error) {
        const parsed = extractJson(reply.text)
        if (parsed?.habits?.length) setHabits(parsed.habits)
      }
    } catch (e) { setError(e.message) }
    setLoadingHabits(false)
    setLoading(false)
  }

  // ── Step 5 → done: save habits, finish ──

  const confirmHabits = async () => {
    setLoading(true); setError(null)
    try {
      if (habits.length > 0) {
        const byCategory = habits.reduce((acc, h) => {
          const cat = h.category || 'Основные'
          if (!acc[cat]) acc[cat] = []
          acc[cat].push(h)
          return acc
        }, {})
        const categories = Object.entries(byCategory).map(([label, hs]) => ({
          id: `cat-${slugify(label)}`,
          label,
          habits: hs.map(h => ({
            id: h.id || `habit-${slugify(h.title)}`,
            label: h.title,
            detail: h.detail || '',
            kind: 'toggle',
            max_score: 1,
            active: true,
          })),
        }))
        await habitsApi.saveDefinitions({ categories })
      }
      setDone(true)
      setStep(6)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const finish = () => { onDone?.(); navigate('/') }

  if (hasAi === null) return null

  if (!hasAi) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          {showCliGuide
            ? <CliRemainingGuide stats={cliStats} onDone={finish} />
            : <CliOnboarding
                cliCommand={cliCommand}
                onCliDone={(stats) => { setCliStats(stats); setShowCliGuide(true) }}
                onDone={finish}
              />
          }
        </div>
      </div>
    )
  }

  const TOTAL_STEPS = 7

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <StepDots step={step} total={TOTAL_STEPS} />

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">

          {/* ── Step 0: Product Tour ── */}
          {step === 0 && (
            <div className="p-8 space-y-6">
              <div className="text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-gray-900 dark:bg-white flex items-center justify-center mx-auto">
                  <Sparkles size={22} className="text-white dark:text-gray-900" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Добро пожаловать в Life OS</h1>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    Одно место для целей, привычек и всего что важно.<br />
                    Настроим систему под тебя за 5 минут.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {FEATURES.map(f => <FeatureCard key={f.title} {...f} />)}
              </div>

              <button onClick={() => setStep(1)} className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity">
                Начать настройку <ArrowRight size={15} />
              </button>
            </div>
          )}

          {/* ── Step 1: Who are you ── */}
          {step === 1 && (
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Шаг 1 из 4 — Расскажи о себе</p>
                <p className="text-xs text-gray-400 mt-1">AI адаптирует систему под твой контекст и цели</p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Как тебя зовут?</label>
                  <input
                    ref={inputRef}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Имя"
                    className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none placeholder-gray-400 focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Чем занимаешься и что сейчас важно?</label>
                  <textarea
                    value={selfDesc}
                    onChange={e => setSelfDesc(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); handleDescribeSelf() } }}
                    placeholder="Например: работаю дизайнером, учусь на вечернем, хочу заняться здоровьем и выучить английский…"
                    rows={4}
                    className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none resize-none placeholder-gray-400 focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-700"
                  />
                </div>
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button onClick={handleDescribeSelf} disabled={!selfDesc.trim() || loading} className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
                {loading ? <Loader2 size={15} className="animate-spin" /> : <><ArrowUp size={15} /> Далее</>}
              </button>
            </div>
          )}

          {/* ── Step 2: Confirm spheres ── */}
          {step === 2 && (
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Шаг 2 из 4 — Сферы жизни</p>
                <p className="text-xs text-gray-400 mt-1">Нажми на название чтобы изменить. Убери лишнее.</p>
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
                      <button onClick={() => setEditingSphere(i)} className="flex-1 text-left text-sm text-gray-800 dark:text-gray-200 flex items-center gap-1.5 group">
                        {s.title}
                        <Edit2 size={10} className="text-gray-300 group-hover:text-gray-400" />
                      </button>
                    )}
                    <button onClick={() => setSpheres(prev => prev.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 p-1">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button onClick={confirmSpheres} disabled={loading || spheres.length === 0} className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
                {loading ? <Loader2 size={15} className="animate-spin" /> : <><CheckCircle2 size={15} /> Создать сферы</>}
              </button>
            </div>
          )}

          {/* ── Step 3: Goals description ── */}
          {step === 3 && (
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Шаг 3 из 4 — Цели и задачи</p>
                <p className="text-xs text-gray-400 mt-1">AI декомпозирует цели на конкретные шаги</p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {spheresWithIds.map(s => (
                  <span key={s.id} className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: s.color + '15', color: s.color }}>{s.title}</span>
                ))}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Что хочешь достичь в ближайшие 1–3 месяца?</label>
                <textarea
                  ref={inputRef}
                  value={goalsDesc}
                  onChange={e => setGoalsDesc(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); handleDescribeGoals() } }}
                  placeholder="Например: хочу начать тренироваться 3 раза в неделю, закрыть сессию без хвостов, начать откладывать 10% от дохода…"
                  rows={5}
                  className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-gray-100 outline-none resize-none placeholder-gray-400 focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-700"
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button onClick={handleDescribeGoals} disabled={!goalsDesc.trim() || loading} className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
                {loading ? <Loader2 size={15} className="animate-spin" /> : <><ArrowUp size={15} /> Сгенерировать план</>}
              </button>

              <button onClick={() => setStep(5)} className="w-full text-xs text-gray-400 hover:text-gray-600 py-1">Пропустить</button>
            </div>
          )}

          {/* ── Step 4: Confirm goals+tasks tree ── */}
          {step === 4 && (
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Твой план — {goals.length} целей, {tasks.length} задач</p>
                <p className="text-xs text-gray-400 mt-1">Нажми на цель чтобы раскрыть задачи. Добавишь/изменишь потом в системе.</p>
              </div>

              <GoalTree goals={goals} tasks={tasks} spheres={spheresWithIds} />

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button onClick={confirmGoalsAndLoadHabits} disabled={loading} className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
                {loading ? <Loader2 size={15} className="animate-spin" /> : <><CheckCircle2 size={15} /> Добавить в систему</>}
              </button>

              <button onClick={() => setStep(3)} className="w-full text-xs text-gray-400 hover:text-gray-600 py-1">← Переформулировать</button>
            </div>
          )}

          {/* ── Step 5: Habits ── */}
          {step === 5 && (
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Шаг 4 из 4 — Привычки</p>
                <p className="text-xs text-gray-400 mt-1">Что отслеживать каждый день. Убери ненужное.</p>
              </div>

              {loadingHabits ? (
                <div className="flex items-center justify-center py-8 gap-2 text-sm text-gray-400">
                  <Loader2 size={15} className="animate-spin" /> Подбираю привычки под твой контекст…
                </div>
              ) : habits.length > 0 ? (
                <div className="space-y-2">
                  {habits.map((h, i) => (
                    <div key={i} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                      <Activity size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800 dark:text-gray-200">{h.title}</div>
                        {h.detail && <div className="text-[11px] text-gray-400 mt-0.5">{h.detail}</div>}
                        {h.category && <div className="text-[10px] text-gray-300 mt-0.5">{h.category}</div>}
                      </div>
                      <button onClick={() => setHabits(prev => prev.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 p-1 flex-shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-gray-400">
                  <p>Не удалось подобрать привычки.</p>
                  <p className="text-xs mt-1">Добавишь вручную в разделе «Привычки»</p>
                </div>
              )}

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button onClick={confirmHabits} disabled={loading} className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
                {loading ? <Loader2 size={15} className="animate-spin" /> : <><CheckCircle2 size={15} /> {habits.length > 0 ? `Добавить ${habits.length} привычки` : 'Продолжить без привычек'}</>}
              </button>

              <button onClick={() => { setHabits([]); confirmHabits() }} className="w-full text-xs text-gray-400 hover:text-gray-600 py-1">Пропустить</button>
            </div>
          )}

          {/* ── Step 6: Done + Guide ── */}
          {step === 6 && (
            <div className="p-8 space-y-6">
              <div className="text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={24} className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {name ? `Готово, ${name}!` : 'Готово!'}
                  </h2>
                  <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                    {spheres.length > 0 && <><span className="font-medium text-gray-700 dark:text-gray-300">{spheres.length} сфер</span> · </>}
                    {goals.length > 0 && <><span className="font-medium text-gray-700 dark:text-gray-300">{goals.length} целей</span> · </>}
                    {tasks.length > 0 && <><span className="font-medium text-gray-700 dark:text-gray-300">{tasks.length} задач</span> · </>}
                    {habits.length > 0 && <><span className="font-medium text-gray-700 dark:text-gray-300">{habits.length} привычек</span></>}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Как получить максимум</p>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {IMPACT_GUIDE.map(g => (
                    <div key={g.when} className="flex items-start gap-3 px-4 py-3">
                      <span className="text-base leading-none mt-0.5">{g.emoji}</span>
                      <div>
                        <div className="text-xs font-medium text-gray-800 dark:text-gray-200">{g.when}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{g.what}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1.5">
                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-2">Быстрые клавиши</p>
                {[
                  ['⌘K', 'Быстрый захват — в любой момент'],
                  ['⌘J', 'Чат с AI'],
                  ['⌘F', 'Поиск по всей системе'],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                    <kbd className="bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded text-[10px] border border-gray-200 dark:border-gray-600 font-mono text-gray-700 dark:text-gray-300">{key}</kbd>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>

              <button onClick={finish} className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity">
                Открыть Life OS <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
