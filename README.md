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
- AI is optional. To enable it, install and sign in to either the Codex CLI or OpenCode CLI locally.

### 2. Clone

```bash
git clone <repo-url>
cd <repo-name>
```

### 3. Configure environment

**macOS / Linux:**
```bash
cp life-os/backend/.env.example life-os/backend/.env
```

**Windows (Command Prompt):**
```cmd
copy life-os\backend\.env.example life-os\backend\.env
```

**Windows (PowerShell):**
```powershell
Copy-Item life-os\backend\.env.example life-os\backend\.env
```

The app works fully without AI. To enable AI, choose one local runtime:

```env
AI_RUNTIME=codex       # sign in first with `codex`
# AI_RUNTIME=opencode  # sign in first with `opencode auth login`
```

> All variables with explanations are in `life-os/backend/.env.example`.

### 4. Choose your local AI runtime

The console button opens the selected runtime in a terminal. Install either Codex or OpenCode, authenticate locally, then set `AI_RUNTIME` as above. API tokens are never added to this repository.

Verify the installation at any time:

```bash
node ops/scripts/doctor.mjs
```

The in-app AI features run read-only analysis. Codex receives its read-only sandbox; OpenCode runs in pure mode with edit, shell, and web-fetch permissions denied. The separate Console button opens your selected CLI in the repository; any file changes there remain an explicit action you approve in that CLI.

Without AI, first launch opens a short manual setup: one sphere, one goal, and the first concrete task. This creates a useful local workspace without an account, key, or external service.

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

Double-click the shortcut. Starts backend + frontend, opens the browser. Handles `npm install` and port cleanup automatically.

> Use `ln -sf` (symlink), not `cp` — the script needs to know the repo path.

**Windows — double-click launcher:**

Double-click `life-os.bat` in the repo root. It runs `life-os.ps1` via PowerShell.

If Windows blocks the script with a policy error, run once in PowerShell as Administrator:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**Manual — any OS (two terminals):**

```bash
# Terminal 1 — backend (port 3001)
cd life-os/backend
node --env-file=.env server.js

# Terminal 2 — frontend (port 5173)
cd life-os/frontend
npm run dev
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
| AI | Local Codex or OpenCode runtime (optional) |

---

## Configuration reference

All backend settings are in `life-os/backend/.env` (copy from `.env.example`):

| Variable | Required | Default | Description |
|---|---|---|---|
| `AI_RUNTIME` | No | `none` | `none`, `codex`, or `opencode` |
| `CODEX_COMMAND` / `OPENCODE_COMMAND` | No | executable name | Local runtime executable |
| `CODEX_MODEL` / `OPENCODE_MODEL` | No | — | Optional runtime model override |
| `PORT` | No | `3001` | Backend port |
| `VAULT_PATH` | No | `../../brain/content` | Absolute path to data directory |
| `WORK_DIR` | No | repo root | Working directory for terminal |
| `GOOGLE_CLIENT_ID` | No | — | Google Calendar OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | — | Google Calendar OAuth secret |
| `GOOGLE_REDIRECT_URI` | No | `http://localhost:3001/api/sync/oauth/callback` | OAuth callback |
| `GOOGLE_TIMEZONE` | No | — | Timezone for calendar (e.g. `Europe/Moscow`) |

If you change `PORT`, restart both the backend and Vite frontend: the development proxy reads the same local backend `.env` file.

## Privacy and AI review

Before sharing a fork or contribution, run the public-release checks and follow the [AI review playbook](docs/AI-REVIEWS.md). It defines a runtime-neutral review for Codex and OpenCode without collecting personal Life OS data or CLI session history.

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

**AI doesn't respond** — verify `AI_RUNTIME` and that the selected CLI is installed and authenticated

**Codex reports a missing binary** — repair the local Codex installation first; `node ops/scripts/doctor.mjs` must show a version before Life OS can use it.

**Onboarding doesn't appear** — if `brain/content/tree/nodes.json` already has data, onboarding is skipped. Delete the file and restart, or go to http://localhost:5173/setup directly

**Console button does nothing** — install and authenticate the selected Codex or OpenCode runtime

**Windows: PowerShell blocks life-os.bat** — run once in PowerShell as Administrator:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**Windows: console button doesn't open a terminal** — make sure the selected runtime is installed and in your system PATH.
