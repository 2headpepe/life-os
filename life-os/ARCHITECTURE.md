# Устройство Life OS

Этот документ предназначен для разработки. Перед изменением поведения также
прочитайте [SPEC.md](SPEC.md).

## Запуск

```bash
# Бэкенд: порт из .env, по умолчанию 3001
cd life-os/backend && node --env-file=.env server.js

# Фронтенд: по умолчанию 5173
cd life-os/frontend && npm run dev
```

Нужен Node.js 22 или новее. Переменные окружения обрабатываются самим Node.js,
отдельная библиотека не используется.

## Слои

| Часть | Расположение | Роль |
|---|---|---|
| Интерфейс | `life-os/frontend/src/` | React, Vite и TailwindCSS |
| Сервер | `life-os/backend/server.js` | Express API и операции с локальными файлами |
| AI-адаптер | `life-os/backend/ai-runtime.js` | Запуск Codex или OpenCode для read-only задач |
| Данные | `brain/content/` | Локальные JSON-файлы, исключённые из Git |

## Локальные данные

Бэкенд создаёт структуру автоматически при первом запуске. Отдельной базы
данных нет.

```text
brain/content/
  tree/nodes.json              плоское дерево целей и задач
  habits/definitions.json      определения привычек
  habits/log/YYYY-MM-DD.json   ежедневные отметки
  lists/{тип}.json             фильмы, книги, игры и другие списки
  inbox/current.json           входящие
  insights/index.json          инсайты
  memories/index.json          записи и ссылки на фотографии
  memories/photos/             загруженные фотографии
  feed/reactions.json          реакции на карточки ленты
  profile/profile.json         локальный профиль
```

Корневая сфера — узел с `parent_id: null` и идентификатором `root-*`. Цели и
задачи находятся в том же массиве `nodes` и связаны через `parent_id`.

## Основные страницы

| Маршрут | Файл | Назначение |
|---|---|---|
| `/` | `Feed.jsx` | Лента задач, привычек, воспоминаний и подсказок |
| `/today` | `Today.jsx` | План на день |
| `/goals` | `Tree.jsx` | Дерево сфер, целей и задач |
| `/pool` | `Pool.jsx` | Все активные и запланированные задачи |
| `/habits` | `Habits.jsx` | Трекинг привычек и история |
| `/lists` | `Lists.jsx` | Личные списки |
| `/calendar` | `Calendar.jsx` | Календарь и синхронизация Google Calendar |
| `/inbox` | `Inbox.jsx` | Неразобранные записи |
| `/insights` | `Insights.jsx` | Инсайты и тематические заметки |
| `/memories` | `Memories.jsx` | Воспоминания и фотографии |

## Ключевые компоненты

| Компонент | Назначение |
|---|---|
| `QuickCapture.jsx` | Быстрый захват через `⌘K` или `Ctrl+K` |
| `AiConsole.jsx` | Чат с выбранным локальным AI runtime через `⌘J` или `Ctrl+J` |
| `GlobalSearch.jsx` | Поиск через `⌘F` или `Ctrl+F` |
| `Sidebar.jsx` | Навигация и фильтр по сферам |
| `NodeCard.jsx` | Редактирование задачи или цели |
| `SpheresContext.jsx` | Единый источник подписей и цветов сфер |

## API

```text
GET    /api/tree                 все узлы дерева
POST   /api/tree                 создать узел
PATCH  /api/tree/:id             изменить узел
DELETE /api/tree/:id             удалить узел и потомков
GET    /api/tree/leaves          получить задачи без потомков
GET    /api/tree/spheres         получить корневые сферы

GET    /api/context              краткий контекст дня
GET    /api/search?q=            поиск
GET    /api/pulse                напоминания и устаревшие данные

POST   /api/inbox                добавить запись во входящие
GET/POST/PATCH /api/lists/*      работа со списками
GET/POST/PATCH /api/memories/*   работа с воспоминаниями и фотографиями
GET/POST/PATCH /api/sync/*       Google Calendar

GET    /api/config               состояние выбранного AI runtime
POST   /api/ai/chat              read-only AI-ответ; для OpenCode создаёт асинхронную локальную сессию
GET    /api/ai/sessions/:id      reconcile состояния OpenCode-сессии через status/history
POST   /api/ai/sessions/:id/abort отменить OpenCode-сессию
POST   /api/ai/sessions/:id/open явно открыть ту же OpenCode-сессию в терминале
POST   /api/ai/open              открыть выбранный CLI или, по явному действию, `opencode serve`
```

Все ответы API возвращают JSON. Ошибка имеет вид `{ "error": "..." }`.

## AI runtime

`AI_RUNTIME` может быть `none`, `codex` или `opencode`. Все функции должны
работать и при `none`. Фоновые задачи запускаются через `runAiTask()`:

- Codex получает `--sandbox read-only`;
- OpenCode получает временную конфигурацию с запретом edit, shell, webfetch и
  доступа за пределы рабочей папки.

Для setup и встроенного чата при `AI_RUNTIME=opencode` используется отдельный
`opencode-session-bridge.js`: он соединяется только с user-managed loopback
`opencode serve`, создаёт сессию с выбранными `assistant/assistant` и `build`,
и задаёт session-level permission `ask` для всех действий. Backend никогда не
отвечает на permission API. Browser опрашивает только Life OS API; SSE от
OpenCode служит лучшим усилием, а `status` и история сообщений — источником
истины. По явному клику пользователь может открыть `opencode attach` к той же
сессии и принять решение в TUI. При запуске из Life OS команда явно передаёт
hostname и fixed port из `OPENCODE_SERVER_URL`: OpenCode 1.18 иначе выбирает
случайный порт. Codex этот bridge не использует.

Не добавляйте ключи провайдеров в `.env.example`, исходный код или Git.

## Проверка изменений

```bash
node ops/scripts/verify-public-release.mjs
node ops/scripts/doctor.mjs
cd life-os/backend && npm test
cd ../frontend && npm run build
```
