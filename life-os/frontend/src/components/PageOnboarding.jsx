import { useState } from 'react'
import { Compass, X } from 'lucide-react'

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
  const [visible, setVisible] = useState(() => Boolean(config) && !localStorage.getItem(onboardingStorageKey(pageId)))

  const dismiss = () => {
    localStorage.setItem(onboardingStorageKey(pageId), '1')
    setVisible(false)
  }

  if (!config || !visible) return null

  return (
    <aside className="life-os-onboarding fixed bottom-24 right-6 z-30 w-[min(23rem,calc(100vw-3rem))] rounded-2xl border p-4 shadow-xl" aria-label={`Подсказка: ${config.title}`}>
      <button type="button" onClick={dismiss} className="life-os-onboarding__close absolute right-3 top-3 rounded-md p-1" aria-label="Закрыть подсказку"><X size={15} /></button>
      <div className="flex gap-3 pr-6">
        <span className="life-os-onboarding__icon mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg ring-1"><Compass size={15} /></span>
        <div>
          <p className="text-sm font-semibold">{config.title}</p>
          <p className="life-os-onboarding__copy mt-1 text-xs leading-5">{config.text}</p>
          <button type="button" onClick={dismiss} className="life-os-onboarding__action mt-3 text-xs font-semibold underline underline-offset-4">{config.action} →</button>
        </div>
      </div>
    </aside>
  )
}
