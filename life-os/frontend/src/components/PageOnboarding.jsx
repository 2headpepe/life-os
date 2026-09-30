import { useState } from 'react'
import { X, Terminal } from 'lucide-react'
import { openInConsole } from '../utils/openInConsole'

// ─── Per-page config ──────────────────────────────────────────────

const CONFIGS = {
  today: {
    emoji: '🌅',
    title: 'Сегодня — твой план дня',
    description: 'Здесь собраны задачи с дедлайном на сегодня и статус привычек. Одним взглядом видно что важно.',
    tips: [
      'Задачи появляются автоматически из Дерева — по дедлайну',
      'Отметь выполненное — статус обновится в дереве',
      'Привычки внизу: быстро отметь что сделал сегодня',
    ],
    cliPrompt: `Ты помощник в системе Life OS. Пользователь открыл раздел "Сегодня" — его план дня.
Прочитай brain/content/tree/nodes.json и brain/content/habits/definitions.json.
Объясни как работает страница: откуда берутся задачи, как отмечать выполненные, как связана с привычками.
Покажи что запланировано на сегодня. Спроси есть ли задачи которые хочет добавить на сегодня или ближайшие дни.`,
  },

  tree: {
    emoji: '🌳',
    title: 'Дерево целей',
    description: 'Все цели и задачи по сферам жизни. Большие цели разбиваются на конкретные шаги.',
    tips: [
      'Кликни по цели чтобы раскрыть задачи внутри',
      'Нажми + рядом с любым узлом чтобы добавить подзадачу',
      'Переводи задачи в done — цель начнёт закрываться',
    ],
    cliPrompt: `Ты помощник в системе Life OS. Пользователь открыл раздел "Дерево целей".
Прочитай brain/content/tree/nodes.json.
Покажи структуру: сферы → цели → задачи. Объясни как создавать, как двигать в done, как связано с разделом "Сегодня".
Спроси есть ли цели или задачи которые хочет добавить или уточнить прямо сейчас.`,
  },

  habits: {
    emoji: '🔁',
    title: 'Привычки',
    description: 'Ежедневный трекинг. Отмечай каждый день — статистика покажет реальную динамику.',
    tips: [
      'Заходи вечером и отмечай что сделал за день',
      'График показывает streak и процент выполнения',
      'Добавляй и редактируй привычки через кнопку ⚙️',
    ],
    cliPrompt: `Ты помощник в системе Life OS. Пользователь открыл раздел "Привычки".
Прочитай brain/content/habits/definitions.json.
Покажи текущие привычки, объясни как отмечать, как читать статистику.
Спроси нет ли привычек которые хочет добавить, изменить или убрать. Внеси изменения если попросит.`,
  },

  inbox: {
    emoji: '📥',
    title: 'Входящие',
    description: 'Место для мыслей, задач и идей которые ещё не разобраны. Захвати сейчас — разбери потом.',
    tips: [
      '⌘K — мгновенный захват из любого места сайта',
      'Разбирай инбокс раз в неделю: каждому элементу своё место',
      'Роутируй в дерево, списки или удаляй — держи инбокс чистым',
    ],
    cliPrompt: `Ты помощник в системе Life OS. Пользователь открыл раздел "Входящие" (инбокс).
Прочитай brain/content/inbox/current.json.
Покажи что сейчас в инбоксе. Объясни принцип: захвати сначала, разбери потом.
Помоги разобрать текущие элементы — каждый роутируй в нужное место (дерево, список, удали).`,
  },

  feed: {
    emoji: '✨',
    title: 'Лента',
    description: 'Умные карточки на основе твоих данных: что сделать, что вспомнить, что давно не открывал.',
    tips: [
      'Карточки генерируются по твоему дереву, привычкам и инсайтам',
      'Лайкай и скрывай — это обратная связь системе',
      'Заходи раз в день чтобы не пропустить важное',
    ],
    cliPrompt: `Ты помощник в системе Life OS. Пользователь открыл раздел "Лента".
Прочитай brain/content/tree/nodes.json и brain/content/habits/definitions.json.
Объясни как работает умная лента и откуда берутся карточки.
На основе данных пользователя скажи на что сегодня стоит обратить внимание.`,
  },

  lists: {
    emoji: '📚',
    title: 'Списки',
    description: 'Фильмы, книги, игры, сериалы, желания — всё что хочешь посмотреть, прочитать или сделать.',
    tips: [
      'Добавляй через кнопку + или ⌘K → выбери тип',
      'Фильтруй по статусу: хочу / смотрю / готово',
      'Списки всплывают в ленте как рекомендации',
    ],
    cliPrompt: `Ты помощник в системе Life OS. Пользователь открыл раздел "Списки".
Объясни какие типы списков есть (фильмы, книги, игры, сериалы, желания, рестораны, путешествия).
Спроси что хотел бы добавить прямо сейчас — и добавь через brain/content/lists/.`,
  },

  memories: {
    emoji: '📸',
    title: 'Воспоминания',
    description: 'Фиксируй важные моменты: события, мысли, фото. Приятно перечитывать через год.',
    tips: [
      'Добавляй запись в конце дня или после важного момента',
      'Прикрепляй фото — хранятся локально',
      'Воспоминания всплывают в ленте — "год назад"',
    ],
    cliPrompt: `Ты помощник в системе Life OS. Пользователь открыл раздел "Воспоминания".
Объясни как пользоваться: когда добавлять, как искать по дате, как прикреплять фото.
Спроси есть ли что-то из последних дней что хотел бы зафиксировать. Помоги создать первую запись если захочет.`,
  },

  insights: {
    emoji: '💡',
    title: 'Инсайты',
    description: 'Наблюдения, паттерны, идеи — мысли которые стоит не потерять и переосмыслить потом.',
    tips: [
      'Добавляй через ⌘K → Инсайт или кнопку +',
      'Инсайты всплывают в ленте и просят вернуться к ним',
      'Помечай тегами — легче находить нужное потом',
    ],
    cliPrompt: `Ты помощник в системе Life OS. Пользователь открыл раздел "Инсайты".
Прочитай brain/content/insights/index.json.
Объясни что такое инсайт в контексте системы: наблюдение, паттерн, идея — то что стоит переосмыслить.
Покажи существующие инсайты если есть. Спроси есть ли что-то что хочет зафиксировать прямо сейчас.`,
  },

  calendar: {
    emoji: '📅',
    title: 'Календарь',
    description: 'События и задачи с датами на timeline. Задачи из дерева появляются автоматически по дедлайну.',
    tips: [
      'Задачи с датой из дерева целей видны здесь автоматически',
      'Добавляй конкретные события с датой и временем',
      'Можно подключить Google Calendar в настройках',
    ],
    cliPrompt: `Ты помощник в системе Life OS. Пользователь открыл раздел "Календарь".
Прочитай brain/content/tree/nodes.json — посмотри какие задачи имеют дедлайны.
Объясни как работает календарь и как добавлять события.
Спроси есть ли что-то что хочет запланировать на ближайшее время — помоги добавить.`,
  },
}

// ─── Component ────────────────────────────────────────────────────

const STORAGE_KEY = (pageId) => `life-os-onboarded-${pageId}`

export default function PageOnboarding({ pageId }) {
  const config = CONFIGS[pageId]
  const [visible, setVisible] = useState(() => !localStorage.getItem(STORAGE_KEY(pageId)))
  const [opening, setOpening] = useState(false)

  if (!config || !visible) return null

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY(pageId), '1')
    setVisible(false)
  }

  const handleOpenConsole = async () => {
    setOpening(true)
    try {
      await openInConsole(config.cliPrompt)
      dismiss()
    } finally {
      setOpening(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={dismiss}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

      {/* Card */}
      <div
        className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Top accent stripe */}
        <div className="h-1 bg-gradient-to-r from-blue-400 via-indigo-500 to-violet-500" />

        {/* Close */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X size={15} />
        </button>

        <div className="px-6 pt-6 pb-5 space-y-5">
          {/* Emoji + title + description */}
          <div className="space-y-2 pr-6">
            <div className="text-3xl leading-none">{config.emoji}</div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight">
              {config.title}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {config.description}
            </p>
          </div>

          {/* Tips */}
          <div className="space-y-2.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4">
            {config.tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-[10px] flex items-center justify-center font-bold mt-0.5">
                  {i + 1}
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{tip}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <button
              onClick={handleOpenConsole}
              disabled={opening}
              className="w-full flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              <Terminal size={14} />
              {opening ? 'Открываю…' : 'Открыть в консоли'}
            </button>
            <button
              onClick={dismiss}
              className="w-full text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 dark:hover:text-gray-300 py-2 transition-colors"
            >
              Понятно, начну сам →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
