# Life OS — Claude Entry Point

Personal operating system web app on top of Obsidian vault.

> **Before making any change, read `life-os/SPEC.md`** — it defines invariants, contracts, and change protocols that must be preserved.

## Running the app

```bash
# Backend (port 3001)
cd life-os/backend && node --env-file=.env server.js

# Frontend (port 5173)
cd life-os/frontend && npm run dev
```

Node.js v22+ required. Backend uses native `--env-file` (no dotenv).

## Stack

- **Frontend**: React + Vite + TailwindCSS, `life-os/frontend/src/`
- **Backend**: Express ESM, `life-os/backend/server.js`
- **Data**: Obsidian vault JSON files at `brain/content/`

## Data

The web app reads and writes `brain/content/` JSON files. There is no separate database.

Data schemas (task, goal, inbox, event, habit) are defined in `docs/data-schemas.md`.

## Data layout

```
brain/content/
  tree/nodes.json              # unified Node tree (goals + tasks + milestones)
  habits/definitions.json      # habit definitions by category
  habits/log/YYYY-MM-DD.json   # daily habit logs
  lists/{type}.json            # films/books/games/etc
  inbox/current.json           # capture inbox
  insights/index.json          # personal insights
  memories/index.json          # daily memory entries (text + photo refs)
  memories/photos/              # photo files served at /api/memories/photos/
  feed/reactions.json           # append-only feed card reactions (like/dismiss/done)
```

The old `goals/`, `tasks/`, and `events/` files are removed — everything is a Node now (see `docs/data-schemas.md` and `docs/tree-refactor-plan.md`).

Spheres = root nodes (`parent_id: null`, `id: root-{sphere}`, carry `color`). Frontend reads them via `GET /api/tree/spheres` → `SpheresContext.jsx` (which still exposes them as `SPHERE_ORDER/LABELS/COLORS` keyed by sphere slug — a compatibility shim over the tree roots).

## Frontend pages

| Route | File | Description |
|---|---|---|
| `/` | `Feed.jsx` | **Home page** — mixed feed of all content types (news, prompt-to-capture, auto-saved "вчера в цифрах" memory (done tasks + habit log + done lists, `auto: true`, created by `GET /api/feed` when the day has no entry; user edits/deletes freely, deletion prevents regeneration), memories + "on this day" (double-click edit inline), insights, list picks, habit streaks, overdue nudge, goal progress, completed tasks). Weighted shuffle, stable within a day. Vertical snap-scroll. |
| `/today` | `Today.jsx` | Today view: focus zone (overdue/scheduled/in-progress leaves), habit rings, day timeline |
| `/goals` | `Tree.jsx` | Full Node-tree browser: expand/collapse, decompose, set status/due, undefined-leaf flagging |
| `/pool` | `Pool.jsx` | All scheduled/in-progress leaves: list/kanban, filter by root, group by priority/sphere/status |
| `/habits` | `Habits.jsx` | Tabs: Трекинг (day nav, inputs) / История (week grid) / Пропуски |
| `/lists` | `Lists.jsx` | Media/wish lists with status tabs, rating, random pick |
| `/calendar` | `Calendar.jsx` | Month/Week/Day; scheduled leaves as blocks; two-way Google Calendar sync |
| `/inbox` | `Inbox.jsx` | Capture inbox with quick actions |
| `/stats` | `Stats.jsx` | Habit stats: bar chart, streaks, completion % |
| `/insights` | `Insights.jsx` | Personal insights (tab) + Заметки (Topics tab) |
| `/people` | `People.jsx` | People master-detail from `brain/people/` |
| `/memories` | `Memories.jsx` | Daily memories: text entries with photos via drag/paste, scrolling feed |

Feed card components live in `pages/FeedCards.jsx` (one component per card type, all take `{ card, liked, onLike, onDismiss, onSaved }`).

## Frontend components

| Component | Hotkey | Description |
|---|---|---|
| `QuickCapture.jsx` | ⌘K | Quick capture with type picker: **Задача** (leaf under `root-{sphere}`, or inbox if no sphere) / **Inbox** / **Вспоминание** (text + date + photos via paste) / **Инсайт** (title + tag + subtags) / **Список** (any collection). Also opened by the global floating **+** button (bottom-right, mounted in `App.jsx`) and by the Feed end-card (event `life-os:capture`). |
| `ClaudeConsole.jsx` | ⌘J | Opens Terminal with `claude` via AppleScript |
| `GlobalSearch.jsx` | ⌘F | Search nodes/inbox, keyboard nav |
| `Sidebar.jsx` | — | Nav links + root (domain) filter + action buttons |
| `NodeCard.jsx` | — | Expandable node row, all fields editable inline (replaced `TaskCard.jsx`) |
| `NotificationBell.jsx` | — | Pulse: undefined leaves + stale items + inbox count |
| `MarkdownContent.jsx` | — | Shared react-markdown renderer (People/Topics) |

## Backend API endpoints

```
GET    /api/tree              all nodes (flat); client assembles tree
POST   /api/tree              create node { title, parent_id, status?, due?, ... }
PATCH  /api/tree/:id          update node (also drives Google Calendar sync)
DELETE /api/tree/:id          delete node + all descendants (recursive cascade)
GET    /api/tree/leaves       all leaf nodes
GET    /api/tree/spheres      root nodes (domains) as { sphere, label, color }

GET    /api/context           current state summary (overdue, scheduled, habits)
GET    /api/search?q=         search nodes + inbox
GET    /api/pulse             undefined leaves + stale items + inbox: { inbox[], alerts[], total }
POST   /api/pulse/ack         mark item reviewed: { type, sphere, id } → sets updated=today

POST   /api/inbox             add inbox item
DELETE /api/inbox/:id         delete inbox item

GET    /api/insights          all insights
POST   /api/insights          add insight
PATCH  /api/insights/:id      update insight (sets item-level updated=today)

GET    /api/people · /api/people/:id      people from brain/people/
GET    /api/topics · /api/topics/:slug    topic notes from brain/topics/
POST   /api/lists/:list · PATCH /api/lists/:list/:id   list items

GET    /api/feed              assembles the home feed (news, prompt, memories+on-this-day, insights, list picks, streaks, overdue, goals, completed) — weighted shuffle seeded by date
POST   /api/feed/reactions    { ref, type } → append to brain/content/feed/reactions.json (like/unlike/dismiss/done/celebrate)
GET    /api/feed/reactions    all reactions (cards show like state; feed hides dismissed/answered)

GET/POST/PATCH/DELETE /api/sync/*         Google Calendar OAuth + push
GET/POST/PATCH/DELETE /api/memories/*   memories CRUD + photo upload
PUT    /api/content/* · GET /api/content/*   raw vault file read/write (e.g. habit logs)

POST   /api/open-claude       open Terminal.app with `claude` via AppleScript
POST   /api/claude            proxy to Anthropic API (requires ANTHROPIC_API_KEY in .env)
```

> `/api/events/*` endpoints still exist but are **deprecated** (events are now `scheduled` leaves). `/api/tasks/*` and `/api/goals/*` were removed.

## Shared habit logic

`Habits.jsx` exports three functions used across pages:

```js
import { habitIsDone, computeHabitScore, inTimeWindow } from './pages/Habits'
```

- `habitIsDone(habit, value)` — type-aware done check (toggle/counter/cycle/time_window)
- `computeHabitScore(allHabits, log)` — total score for a day
- `inTimeWindow(tw, value)` — handles midnight-crossing windows

## Recurring nodes

A leaf node can carry `recurrence = 'daily'|'weekly'|'monthly'`. When `PATCH /api/tree/:id` sets `status: 'done'` on a recurring node that has a `due` date, the backend spawns the next instance: a clone with a new `id`, `status: 'scheduled'`, and `due` advanced by the interval (`monthly` = +1 calendar month). The new instance also syncs to Google Calendar.

## Config

`frontend/src/config.js` — `ENERGY_LABELS/DOTS`, `GOAL_STATUS_BADGE/LABELS`.
Sphere colors/labels are NOT here anymore — they come from tree roots via `SpheresContext` (`useSpheres()` → `SPHERE_ORDER/LABELS/COLORS`). Grep before defining new shared constants.

## Decomposition

Decomposition is just tree depth: any node can get child nodes (`POST /api/tree` with `parent_id`). A non-leaf node is a "goal/milestone"; a leaf is an atomic action. Tree.jsx renders the recursion with per-branch progress = % of leaf descendants `done`.

## Pending work

- Tree: no done-propagation upward, no max-depth warning (open questions in `docs/tree-refactor-plan.md`)
- Pool kanban: no drag & drop (status change via buttons)
- Sphere vocabulary still a leaky shim (`root-{sphere}`) in QuickCapture/GlobalSearch
- Lists: tags and filters
- Habits: streaks beyond 7 days in history view; 32-habit set needs active/catalog split
- Inbox: batch actions
- Mobile: out of scope (desktop single-user only)
