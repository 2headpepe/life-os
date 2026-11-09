import { useState } from 'react'
import { Compass, X } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

// Appears once, in the context of the route, without interrupting the task.
const CONFIGS = {
  feed: { title: 'Лента — контекст на сегодня', text: 'Здесь появляются сигналы из задач, привычек и заметок. Карточки можно сохранить или скрыть.', action: 'Посмотреть ленту' },
  today: { title: 'Сегодня — один следующий шаг', text: 'Здесь задачи на сегодня и ритм привычек. Если пока пусто — начни с одной задачи или привычки.', action: 'Начать день' },
  goals: { title: 'Цели строятся из сфер', text: 'Добавляй широкие жизненные сферы, затем цели и конкретные шаги внутри них. Лист без детей — это задача.', action: 'Понятно' },
  pool: { title: 'Задачи — рабочий список', text: 'Здесь активные и запланированные шаги. Если список пуст, создай задачу через «Захват» или в разделе «Цели».', action: 'Понятно' },
  habits: { title: 'Привычки — ежедневный ритм', text: 'Отмечай привычки в течение дня. Пока их нет, добавь первую вручную или вернись в setup за предложениями.', action: 'Понятно' },
  inbox: { title: 'Входящие — чтобы не держать всё в голове', text: 'Сохраняй сюда мысли и мелкие дела, а разбирать можно позже. Быстрый захват доступен по ⌘K.', action: 'Понятно' },
  calendar: { title: 'Календарь — только дела с датой', text: 'Задачи из целей появятся здесь, когда у них будет дата. Это помогает увидеть ближайшие дни без лишнего шума.', action: 'Понятно' },
  lists: { title: 'Списки для того, что хочется', text: 'Книги, фильмы, места и идеи живут здесь, пока не стали конкретным планом.', action: 'Понятно' },
  people: { title: 'Люди', text: 'Здесь появятся заметки о людях и договорённостях. Пустой раздел не требует настройки — его можно заполнить позже.', action: 'Понятно' },
  insights: { title: 'Инсайты — мысли, к которым стоит вернуться', text: 'Фиксируй наблюдения и идеи через быстрый захват. Теги помогут найти их позже.', action: 'Понятно' },
  memories: { title: 'Воспоминания', text: 'Сохраняй важные моменты дня и фотографии. Позже они будут возвращаться в ленте в нужный момент.', action: 'Понятно' },
}

export const onboardingStorageKey = pageId => `life-os:onboarding:v2:${pageId}:seen`

export default function PageOnboarding({ pageId }) {
  const config = CONFIGS[pageId]
  const { colorScheme } = useTheme()
  const [visible, setVisible] = useState(() => Boolean(config) && !localStorage.getItem(onboardingStorageKey(pageId)))

  const dismiss = () => {
    localStorage.setItem(onboardingStorageKey(pageId), '1')
    setVisible(false)
  }

  if (!config || !visible) return null

  return (
    <aside className={`fixed bottom-24 right-6 z-30 w-[min(23rem,calc(100vw-3rem))] rounded-2xl border p-4 shadow-xl ${colorScheme === 'dark' ? 'border-slate-200 bg-white text-slate-950 shadow-black/30' : 'border-slate-700 bg-slate-950 text-white shadow-slate-950/30'}`} aria-label={`Подсказка: ${config.title}`}>
      <button type="button" onClick={dismiss} className={`absolute right-3 top-3 rounded-md p-1 ${colorScheme === 'dark' ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-950' : 'text-slate-400 hover:bg-white/15 hover:text-white'}`} aria-label="Закрыть подсказку"><X size={15} /></button>
      <div className="flex gap-3 pr-6">
        <span className={`mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg ring-1 ${colorScheme === 'dark' ? 'bg-slate-900 text-white ring-slate-300' : 'bg-white/15 text-white ring-white/30'}`}><Compass size={15} /></span>
        <div>
          <p className="text-sm font-semibold">{config.title}</p>
          <p className={`mt-1 text-xs leading-5 ${colorScheme === 'dark' ? 'text-slate-600' : 'text-slate-200'}`}>{config.text}</p>
          <button type="button" onClick={dismiss} className={`mt-3 text-xs font-semibold underline underline-offset-4 ${colorScheme === 'dark' ? 'text-slate-800 decoration-slate-400 hover:decoration-slate-700' : 'text-white decoration-white/50 hover:decoration-white'}`}>{config.action} →</button>
        </div>
      </div>
    </aside>
  )
}
