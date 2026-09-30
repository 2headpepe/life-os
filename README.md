# Life OS

Personal life management system — goals, tasks, habits, lists, memories, and an AI assistant built into every page.

All data is stored locally as plain JSON files. No database, no cloud sync, no accounts.

![stack](https://img.shields.io/badge/stack-React%20%2B%20Vite%20%2B%20Express-blue)
![node](https://img.shields.io/badge/node-22%2B-green)

---

## What's inside

| Section | What it does |
|---|---|
| **Today** | Tasks due today + habit check-in |
| **Tree** | Goal hierarchy: spheres → goals → tasks |
| **Habits** | Daily tracking with streaks and stats |
| **Inbox** | Quick capture — route later |
| **Feed** | AI-generated smart cards from your data |
| **Lists** | Films, books, games, series, wishes, restaurants, travel |
| **Calendar** | Timeline view of tasks with due dates |
| **Memories** | Personal journal with photo support |
| **Insights** | Observations, patterns, ideas |

---

## Quick start

### 1. Requirements

- **Node.js 22+** — [nodejs.org](https://nodejs.org)  
  Check: `node -v`
- An AI API key (optional but recommended — see step 3)

### 2. Clone

```bash
git clone <repo-url>
cd <repo-name>
```

### 3. Configure environment

```bash
cp life-os/backend/.env.example life-os/backend/.env
```

Open `life-os/backend/.env` and add at least one AI key:

**Option A — Anthropic Claude** (recommended)  
Get key: [console.anthropic.com](https://console.anthropic.com) → API Keys
```env
ANTHROPIC_API_KEY=sk-ant-...
```

**Option B — OpenAI**  
Get key: [platform.openai.com](https://platform.openai.com) → API Keys
```env
AI_API_KEY=sk-...
AI_API_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o
```

**Option C — OpenRouter** (access 100+ models via one key)  
Get key: [openrouter.ai/keys](https://openrouter.ai/keys)
```env
AI_API_KEY=sk-or-...
AI_API_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=anthropic/claude-sonnet-4-5
```

**No key** — the app still works fully; AI features (feed generation, web onboarding) are disabled. You can use it with a CLI tool instead (see `CLI_COMMAND` below).

> All variables with explanations are in `life-os/backend/.env.example`.

### 4. Choose your CLI tool

The app has a console button on every page that opens your AI assistant in the terminal. Set the command:

```env
# In life-os/backend/.env:
CLI_COMMAND=claude    # Claude Code — npm install -g @anthropic-ai/claude-code
# CLI_COMMAND=opencode  # opencode    — npm install -g opencode-ai
```

The CLI assistant reads your `brain/content/` files directly and can add goals, tasks, habits, and notes through conversation.

### 5. Install dependencies

```bash
cd life-os/backend && npm install
cd ../frontend && npm install
```

### 6. Run

**macOS — double-click launcher:**

```bash
ln -sf "$(pwd)/life-os.command" ~/Desktop/life-os.command
```

Double-click the shortcut. It starts backend + frontend and opens the browser automatically. Handles `npm install` and port cleanup on each launch.

> Use `ln -sf` (symlink), not `cp` — the script needs to know the repo path.

**Manual (two terminals):**

```bash
# Terminal 1 — backend (port 3001)
cd life-os/backend && node --env-file=.env server.js

# Terminal 2 — frontend (port 5173)
cd life-os/frontend && npm run dev
```

Open: **http://localhost:5173**

On first launch, the onboarding wizard opens automatically.

---

## Data layout

Everything lives in `brain/content/` — plain JSON, no database:

```
brain/
  content/
    tree/nodes.json              # all goals and tasks (flat list, parent_id links)
    habits/definitions.json      # habit definitions
    habits/log/YYYY-MM-DD.json   # daily habit check-ins
    inbox/current.json           # unprocessed captures
    insights/index.json          # observations, patterns, ideas
    memories/index.json          # journal entries
    memories/photos/             # attached photos
    lists/films.json             # watchlist
    lists/books.json
    lists/games.json
    lists/series.json
    lists/wishes.json
    lists/restaurants.json
    lists/travel.json
    feed/reactions.json          # feed interaction history
    profile/profile.json         # name, occupation
```

`brain/` is gitignored — your data never leaves your machine.  
The backend creates all files automatically on first start if they don't exist.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TailwindCSS |
| Backend | Node.js 22, Express (ESM) |
| Data | JSON files (no database) |
| AI (web) | Anthropic / OpenAI / OpenAI-compatible |
| AI (CLI) | Claude Code, opencode, or any terminal command |

---

## Configuration reference

All backend settings are in `life-os/backend/.env` (copy from `.env.example`):

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | No | — | Anthropic Claude key |
| `AI_API_KEY` | No | — | OpenAI-compatible key |
| `AI_API_BASE_URL` | No | — | Base URL for OpenAI-compatible API |
| `AI_MODEL` | No | — | Model name for OpenAI-compatible API |
| `CLI_COMMAND` | No | `claude` | Terminal command for console button |
| `PORT` | No | `3001` | Backend port |
| `VAULT_PATH` | No | `../../brain/content` | Absolute path to data directory |
| `WORK_DIR` | No | repo root | Working directory for terminal |
| `GOOGLE_CLIENT_ID` | No | — | Google Calendar OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | — | Google Calendar OAuth secret |
| `GOOGLE_REDIRECT_URI` | No | `http://localhost:3001/api/sync/oauth/callback` | OAuth callback |
| `GOOGLE_TIMEZONE` | No | — | Timezone for calendar (e.g. `Europe/Moscow`) |

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `⌘K` | Quick capture (task / inbox / memory / insight) |
| `⌘J` | AI chat |
| `⌘F` | Search |

---

## Troubleshooting

**Backend won't start** — check Node.js version: `node -v` (need 22+)

**Frontend can't reach API** — backend must be running on port 3001 before starting frontend

**AI doesn't respond** — verify the key is set in `.env` and restart the backend after editing

**Onboarding doesn't appear** — if `brain/content/tree/nodes.json` already has data, onboarding is skipped. Delete the file and restart, or go to http://localhost:5173/setup directly

**Console button does nothing** — make sure `CLI_COMMAND` is set to an installed tool (e.g. `claude` requires `npm install -g @anthropic-ai/claude-code`)
