# Life OS

Личная операционная система: цели, задачи, привычки, списки, воспоминания, AI-ассистент.

## Требования

- **Node.js 22+** — [nodejs.org](https://nodejs.org)
- **Git**
- **AI-ключ** — один из вариантов ниже

Проверить версию Node: `node -v`

---

## Установка

### 1. Клонировать репозиторий

```bash
git clone <repo-url>
cd <repo-name>
```

### 2. Создать пустую базу данных

```bash
node ops/scripts/seed-empty.js
```

Скрипт создаст папку `brain/content/` с пустыми файлами. Пропускает файлы которые уже существуют — безопасно запускать повторно.

### 3. Настроить окружение

```bash
cp life-os/backend/.env.example life-os/backend/.env
```

Открыть `life-os/backend/.env` и вписать AI-ключ (нужен хотя бы один):

```env
# Anthropic Claude:
ANTHROPIC_API_KEY=sk-ant-...

# или OpenAI:
# AI_API_KEY=sk-...
# AI_API_BASE_URL=https://api.openai.com/v1
# AI_MODEL=gpt-4o
```

Также выбрать CLI-инструмент для консоли:

```env
CLI_COMMAND=claude    # Claude Code (npm i -g @anthropic-ai/claude-code)
# CLI_COMMAND=opencode  # opencode (npm i -g opencode-ai)
```

**Все варианты** с комментариями — в `life-os/backend/.env.example`.

### 4. Установить зависимости

```bash
cd life-os/backend && npm install
cd ../frontend && npm install
```

### 5. Запустить

**Вариант A — двойной клик (macOS):**

Создать симлинк на рабочем столе из папки репозитория:

```bash
ln -sf "$(pwd)/life-os.command" ~/Desktop/life-os.command
```

Скрипт автоматически запустит бэкенд и фронтенд, откроет браузер. При повторных запусках `npm install` не нужен — скрипт проверяет сам.

> Важно: именно симлинк (`ln -sf`), не копирование (`cp`) — иначе скрипт не найдёт репозиторий.

**Вариант B — вручную (два терминала):**

```bash
# Терминал 1 — бэкенд (порт 3001)
cd life-os/backend && node --env-file=.env server.js
```

```bash
# Терминал 2 — фронтенд (порт 5173)
cd life-os/frontend && npm run dev
```

Открыть в браузере: **http://localhost:5173**

При первом запуске автоматически откроется мастер настройки — он поможет создать сферы жизни и первые задачи.

---

## Структура данных

Все данные хранятся в JSON-файлах в папке `brain/content/` — никакой базы данных нет.

```
brain/
  content/
    tree/nodes.json           # цели и задачи (единое дерево)
    habits/definitions.json   # определения привычек
    habits/log/YYYY-MM-DD.json
    lists/films.json          # фильмы, книги, игры, желания...
    inbox/current.json        # входящие
    insights/index.json       # инсайты и заметки
    memories/index.json       # воспоминания
  people/                     # заметки о людях (markdown)
  topics/                     # тематические заметки (markdown)
```

---

## Горячие клавиши

| Клавиша | Действие |
|---|---|
| `⌘K` | Быстрый захват (задача / инбокс / воспоминание / инсайт) |
| `⌘J` | Чат с AI |
| `⌘F` | Поиск |

---

## Настройка

**Привычки** — страница «Привычки» → вкладка «Настройки»

**Новости (RSS)** — страница «Новости» → добавить источники

**Google Calendar** (опционально) — добавить в `.env`:
```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3001/api/sync/oauth/callback
GOOGLE_TIMEZONE=Europe/Moscow
```

---

## Частые проблемы

**Бэкенд не запускается** — убедись что Node.js версии 22+: `node -v`

**Фронтенд не видит API** — бэкенд должен работать на порту 3001 до старта фронтенда

**AI не отвечает** — проверь что ключ задан в `.env` и бэкенд перезапущен после изменения

**Онбординг не появляется** — если уже есть данные в `brain/content/tree/nodes.json`, онбординг не показывается. Удали файл и перезапусти, или открой http://localhost:5173/setup напрямую
