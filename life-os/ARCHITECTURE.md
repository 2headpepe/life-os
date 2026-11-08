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
POST   /api/ai/opencode-server/start  по явному UI-клику запускает owned loopback OpenCode v2
POST   /api/ai/opencode-server/stop   останавливает только owned OpenCode-процесс
GET    /api/ai/sessions/:id      reconcile состояния OpenCode-сессии через status/history
POST   /api/ai/sessions/:id/abort отменить OpenCode-сессию
POST   /api/ai/sessions/:id/open по явному UI-клику: v1 terminal attach или v2 одноразовый pairing flow
POST   /api/ai/open              открыть выбранный CLI (не управляет OpenCode server)
```

Все обычные ответы API возвращают JSON. Ошибка имеет вид `{ "error": "..." }`.
`POST /api/ai/sessions/:id/open` сохраняет совместимость с внешним v1:
явный клик открывает локальный terminal attach и возвращает JSON. Для owned v2
это браузерная навигация: endpoint возвращает пустой `303 Location` в
одноразовый OpenCode pairing URL с `Cache-Control: no-store`; pairing
capability не проходит через JavaScript Life OS.

## AI runtime

`AI_RUNTIME` может быть `none`, `codex` или `opencode`. Все функции должны
работать и при `none`. Фоновые задачи запускаются через `runAiTask()`:

- Codex получает `--sandbox read-only`;
- OpenCode получает временную конфигурацию с запретом edit, shell, webfetch и
  доступа за пределы рабочей папки.

Для setup и встроенного чата при `AI_RUNTIME=opencode` используются
`managed-opencode-server.js` и `opencode-session-bridge.js`. Managed режим
запускается только явным кликом пользователя: backend создаёт случайный
пароль, передаёт его исключительно через environment дочернего
`opencode serve --hostname 127.0.0.1 --port ...` и хранит только в памяти.
Все v2 API-запросы backend → OpenCode получают Basic auth; браузер его никогда
не получает. Manager не усыновляет, не перезапускает и не останавливает чужой
процесс на занятом порту. Его `cwd` и v2 session `location.directory` равны
`WORK_DIR`, поэтому OpenCode видит корень нужного репозитория, а не каталог
`life-os/backend`.

Мост определяет legacy v1 JSON health или v2 `/api/info`, использует
`assistant/assistant` и `build`, а для v2 адаптирует session, prompt, active,
messages, interrupt и events. Для каждой сессии задаётся `ask` на действия;
backend никогда не отвечает на permission API. Browser опрашивает только Life
OS API; SSE OpenCode — best effort, а session status/history — источник
истины. При явном «Открыть в OpenCode» внешняя v1-сессия сохраняет прежний
terminal attach, а owned v2-сессия получает короткоживущий одноразовый pairing
code и открывает официальный OpenCode Web UI без передачи root password.
Стабильный public deep-link ровно в одну v2-сессию не предполагается. External
v1 server поддерживается без auth, но не managed; внешний защищённый v2 server
явно показывает auth-required вместо ложного сообщения о чужом сервисе. Codex
этот bridge и lifecycle не использует.

Ограничение upstream OpenCode: foreground `serve` получает свой пароль через
`OPENCODE_PASSWORD`. В затронутых v2-версиях tool/shell-процесс, который сам
OpenCode запускает после явного пользовательского разрешения, может унаследовать
эту переменную. Life OS не передаёт пароль в браузер, свой API, логи, аналитику,
файлы или аргументы, и никогда не разрешает такой tool автоматически; однако
пользователь не должен одобрять недоверенный shell/tool до появления upstream
безопасного password-file/descriptor механизма.

Не добавляйте ключи провайдеров в `.env.example`, исходный код или Git.

## Проверка изменений

```bash
node ops/scripts/verify-public-release.mjs
node ops/scripts/doctor.mjs
cd life-os/backend && npm test
cd ../frontend && npm run build
```
