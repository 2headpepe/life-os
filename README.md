# Life OS

Локальное приложение для целей, задач, привычек, списков и заметок. Данные
хранятся на вашем устройстве в обычных JSON-файлах: аккаунт, облако и база
данных не нужны.

AI — дополнительная возможность. Можно пользоваться приложением без AI или
подключить локально установленный Codex CLI либо OpenCode CLI.

## Возможности

| Раздел | Назначение |
|---|---|
| Сегодня | План дня, просроченные задачи и привычки |
| Дерево | Сферы жизни, цели и следующие действия |
| Привычки | Ежедневные отметки и статистика |
| Входящие | Быстрый захват мыслей и задач |
| Лента | Карточки с актуальными задачами и наблюдениями |
| Списки | Книги, фильмы, игры, желания и поездки |
| Календарь | Задачи с датами и синхронизация с Google Calendar |
| Воспоминания и инсайты | Личные заметки и журнал |

## Быстрый запуск

### 1. Установите Node.js

Нужен [Node.js 22 или новее](https://nodejs.org/). Проверьте версию:

```bash
node -v
```

### 2. Клонируйте репозиторий

```bash
git clone https://github.com/2headpepe/life-os.git
cd life-os
```

### 3. Создайте локальную настройку

**macOS / Linux:**

```bash
cp life-os/backend/.env.example life-os/backend/.env
```

**Windows PowerShell:**

```powershell
Copy-Item life-os\backend\.env.example life-os\backend\.env
```

По умолчанию в `.env` указано `AI_RUNTIME=none`. Это полноценный безопасный
режим: приложение работает без ключей и внешних сервисов.

### 4. Установите зависимости

```bash
cd life-os/backend
npm ci
cd ../frontend
npm ci
cd ../..
```

### 5. Запустите приложение

**macOS:**

```bash
chmod +x life-os.command
./life-os.command
```

Также можно создать ярлык на рабочем столе:

```bash
ln -sf "$(pwd)/life-os.command" ~/Desktop/life-os.command
```

**Windows:** дважды откройте `life-os.bat` в корне репозитория.

**Linux, macOS или Windows вручную:**

```bash
# Терминал 1
cd life-os/backend
node --env-file=.env server.js
```

```bash
# Терминал 2
cd life-os/frontend
npm run dev
```

Откройте <http://localhost:5173>. При первом запуске появится настройка:
сфера жизни, цель и первый конкретный шаг.

## AI: Codex или OpenCode

AI не обязателен. Если он нужен, установите и авторизуйте один выбранный CLI,
а затем измените `life-os/backend/.env`.

- Для Codex используйте [официальную инструкцию установки](https://learn.chatgpt.com/docs/codex/cli), затем выполните `codex` и войдите в аккаунт.
- Для OpenCode используйте [официальную инструкцию установки](https://opencode.ai/docs/). Если ваш провайдер уже задан в `opencode.json` с токеном, отдельный OAuth-логин в Life OS не нужен: он остаётся задачей самого OpenCode только для провайдеров, которым он требуется.

```env
# Вариант 1: Codex CLI
AI_RUNTIME=codex

# Вариант 2: OpenCode — модель и токен остаются в конфиге OpenCode
AI_RUNTIME=opencode
OPENCODE_MODEL=assistant/assistant
# Необязательно: это значение уже используется по умолчанию.
OPENCODE_SERVER_URL=http://127.0.0.1:4096
```

Авторизация и токены остаются в локальной среде выбранного CLI; в репозиторий
их добавлять не нужно и нельзя. Проверьте настройку:

```bash
node ops/scripts/doctor.mjs
```

Встроенные AI-функции только анализируют данные: Codex запускается в sandbox
`read-only`, OpenCode — с запретом изменения файлов и запуска команд. Кнопка
«Открыть в консоли» запускает отдельную интерактивную сессию: любые изменения
в ней вы подтверждаете сами.

### OpenCode server для настройки и чата

При `AI_RUNTIME=opencode` настройка и встроенный чат используют не одноразовый
`opencode run`, а явную локальную сессию. В отдельном терминале из папки
проекта запустите:

```bash
opencode serve
```

Сервер по умолчанию слушает только `127.0.0.1:4096`. Не запускайте его с
`--auto`. Life OS обращается к нему только через свой backend, проверяет
`assistant/assistant`, показывает состояние сессии и не отвечает на permission
запросы. Если OpenCode хочет прочитать файл, выполнить команду или внести
изменение, интерфейс предложит открыть **эту же** сессию в терминале; решение
останется за вами. При отсутствии server интерфейс не крутит вечный spinner, а
показывает кнопку явного открытия `opencode serve`.

## Где лежат данные

Все личные данные создаются в `brain/content/` рядом с репозиторием:

```text
brain/content/
  tree/nodes.json            цели и задачи
  habits/                    привычки и ежедневные отметки
  inbox/current.json         входящие
  lists/                     списки
  memories/                  воспоминания и фотографии
  insights/index.json        инсайты
  profile/profile.json       локальный профиль
```

Папка `brain/` находится в `.gitignore`. Она не попадёт в коммит или push.
При первом запуске бэкенд сам создаёт пустую структуру; отдельный seed-скрипт
не требуется.

## Настройка

Все настройки находятся в локальном файле `life-os/backend/.env`.

| Переменная | По умолчанию | Назначение |
|---|---:|---|
| `AI_RUNTIME` | `none` | `none`, `codex` или `opencode` |
| `CODEX_COMMAND`, `OPENCODE_COMMAND` | имя команды | Путь или имя выбранного CLI |
| `CODEX_MODEL` | — | Необязательная модель Codex CLI |
| `OPENCODE_MODEL` | `assistant/assistant` | Для session bridge setup/chat используется только `assistant/assistant` |
| `OPENCODE_SERVER_URL` | `http://127.0.0.1:4096` | Только loopback-адрес user-managed `opencode serve` |
| `LIFE_OS_UI_ORIGIN` | `localhost:5173`, `127.0.0.1:5173`, `[::1]:5173` | Разрешённый origin для явного открытия Terminal; несколько значений через запятую |
| `PORT` | `3001` | Порт бэкенда |
| `VAULT_PATH` | `../../brain/content` | Внешняя папка для личных данных |
| `WORK_DIR` | корень репозитория | Папка для интерактивной консоли |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | — | Необязательная синхронизация Google Calendar |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3001/api/sync/auth/callback` | Адрес возврата Google OAuth |
| `GOOGLE_TIMEZONE` | `Europe/Moscow` | Часовой пояс календаря |

После изменения `PORT` перезапустите бэкенд и фронтенд: Vite читает тот же
локальный `.env`.

## Проверка перед обновлением или публикацией

```bash
node ops/scripts/verify-public-release.mjs
node ops/scripts/doctor.mjs
cd life-os/backend && npm test
cd ../frontend && npm run build
```

### Защита личных данных в Git

`brain/` и локальные рабочие артефакты исключены из Git. Чтобы Git проверял
это перед каждым коммитом, один раз после клонирования включите версионируемый
hook:

```bash
git config core.hooksPath .githooks
```

Hook запускает `node ops/scripts/verify-public-release.mjs`: он отклоняет
коммит с личными путями или локальным runtime-состоянием. Перед push при
необходимости можно запустить ту же проверку вручную.

Инструкция по AI- и дизайн-ревью находится в
[docs/AI-REVIEWS.md](docs/AI-REVIEWS.md). Она не требует передачи личных
данных или истории сессий.

## Частые проблемы

- **Бэкенд не запускается:** убедитесь, что Node.js версии 22 или выше.
- **Страница не видит API:** сначала запустите бэкенд, затем фронтенд.
- **AI недоступен:** проверьте `AI_RUNTIME` и выполните
  `node ops/scripts/doctor.mjs`.
- **Онбординг не появляется:** откройте <http://localhost:5173/setup>.
- **Windows блокирует PowerShell:** выполните один раз от имени пользователя:

  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  ```

## Документация для разработки

- [Устройство приложения](life-os/ARCHITECTURE.md)
- [Технические правила изменений](life-os/SPEC.md)
- [AI- и дизайн-ревью](docs/AI-REVIEWS.md)
