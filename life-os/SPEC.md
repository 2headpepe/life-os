# Life OS — Specification

This file defines behavioral contracts, invariants, and change protocols for the Life OS codebase.
Read it before making any change. It answers "what must always be true" — not "where things are" (that's `CLAUDE.md`).

---

## Core model

Everything the user does maps to one of six types:

| Type | File | What it is |
|---|---|---|
| **Node** | `brain/content/tree/nodes.json` | Any goal, task, event, or milestone — unified tree |
| **Habit log** | `brain/content/habits/log/YYYY-MM-DD.json` | Daily habit values |
| **List item** | `brain/content/lists/{type}.json` | Media/wish items: films, books, games, series, wishes, restaurants, travel |
| **Inbox item** | `brain/content/inbox/current.json` | Unrouted captures |
| **Insight** | `brain/content/insights/index.json` | Observations, patterns, ideas |
| **Memory** | `brain/content/memories/index.json` | Journal entries with optional photos |

**Rule:** Never create a parallel storage structure. All new features must map to one of these six types or extend them explicitly via schema changes documented in `docs/data-schemas.md`.

---

## Invariants

These must never be broken by any change:

### Data

1. `nodes.json` is a **flat array** — no nesting. The tree is reconstructed client-side via `parent_id`.
2. Node `id` is unique and immutable once created. Format: `node-{slug}` for leaves, `root-{sphere}` for sphere roots.
3. Sphere roots are nodes with `parent_id: null` and `id` starting with `root-`. They carry `color`. Do not hardcode sphere slugs anywhere — read them from the tree via `GET /api/tree/spheres`.
4. `brain/content/` is never committed to git. It is gitignored. The backend creates it on startup via `initBrain()`.
5. Deleting a node must cascade: delete all descendants recursively (enforced in `DELETE /api/tree/:id`).
6. Recurring nodes: completing a node with `recurrence` set spawns a new instance with the next `due` date. The original is not deleted.

### API

7. All endpoints return JSON. Error shape: `{ error: string }` with appropriate HTTP status.
8. `GET /api/tree` always returns all nodes. Filtering is done client-side.
9. `PATCH /api/tree/:id` is partial update — only the fields sent are changed. Never replace the whole node object.
10. `POST /api/feed/reactions` is append-only — reactions are never deleted or overwritten.

### Frontend

11. Every page that shows content must work when `brain/content/` is empty (fresh install). Use empty-state UI.
12. Every page must be accessible without AI configured — AI features are optional enhancements, not requirements.
13. `SpheresContext` (`useSpheres()`) is the single source for sphere order, labels, and colors. Never import hardcoded sphere maps from other files.
14. The floating `+` button and `⌘K` shortcut (QuickCapture) must work on every page.

---

## Feature contracts

### Node tree (Tree.jsx + /api/tree)

- A node without children is a **leaf** (actionable task).
- A node with children is a **container** (goal/milestone). Its status = derived from children.
- Progress shown on containers = `count(done leaves) / count(all leaves)` in the subtree.
- Undefined leaves (no `due`, no `updated` within 21 days, `status` falsy) surface in the pulse/notification bell.

### Today (Today.jsx)

- Shows only nodes where `due == today` OR `status == 'in_progress'` OR `status == 'overdue'`.
- Checking off a task here updates the node's `status` to `'done'` via `PATCH /api/tree/:id`.
- Habits section shows today's log state; checking a habit here writes to `habits/log/YYYY-MM-DD.json`.

### Habits

- Habit definitions live in `habits/definitions.json` → `categories[].habits[]`.
- Daily log: `habits/log/YYYY-MM-DD.json` → `{ [habitId]: value }`. Value type depends on `kind`: `toggle` = boolean, `counter` = number, `cycle` = string, `time_window` = string HH:MM.
- `habitIsDone(habit, value)` is the canonical done-check. Use it everywhere — never re-implement the logic.

### Feed (Feed.jsx + /api/feed)

- Cards are stateless on the server — the feed is regenerated each call.
- Dismissed/answered cards are hidden using `feed/reactions.json` (client filters them out).
- AI-generated cards (nudge, reflection, etc.) require `ANTHROPIC_API_KEY` or `AI_API_KEY` in env. Without a key, these card types are simply absent — no errors shown.
- New card types require: a component in `FeedCards.jsx` + a case in `Feed.jsx`'s `render()` switch + server logic in `GET /api/feed`.

### Lists

- List type is determined by filename: `films | books | games | series | wishes | restaurants | travel`.
- A list item has: `id`, `title`, `status` (`want`/`in_progress`/`done`), `rating?`, `created`.
- Do not create a tree node for a leisure/entertainment item — use a list item. A node is only created when the user actively schedules it.

### Inbox

- Inbox items are temporary. They are not shown in other views.
- Routing means: move item to the correct owner (node, list, insight, memory) then delete from inbox.
- The inbox should never be the permanent home of any data.

### Onboarding (Onboarding.jsx)

- Onboarding is shown when `brain/content/tree/nodes.json` has zero nodes (fresh install).
- Completing onboarding creates: sphere root nodes + goal/task nodes + habit definitions.
- Skip is always available — onboarding must never block app use.
- Per-page onboarding (PageOnboarding.jsx) uses `localStorage` key `life-os-onboarded-{pageId}`. It shows once per page per browser.

---

## Change protocols

### Adding a new page

1. Create `life-os/frontend/src/pages/NewPage.jsx`.
2. Add route in `App.jsx`.
3. Add nav entry in `Sidebar.jsx`.
4. Add a `PageOnboarding` config entry in `PageOnboarding.jsx` (CONFIGS object).
5. Add backend endpoints if the page needs new data (follow the existing pattern in `server.js`).
6. Add the page to the frontend pages table in `CLAUDE.md`.

### Adding a new feed card type

1. Add component to `FeedCards.jsx`. Props: `{ card, liked, onLike, onDismiss, onSaved, note, onNote }`.
2. Add `case 'type_name':` to the `render()` switch in `Feed.jsx`.
3. Add server logic in `GET /api/feed` in `server.js`.
4. The card must handle the `onDismiss` prop — user must always be able to dismiss.

### Adding a new list type

1. Add `brain/content/lists/{type}.json` stub to `initBrain()` in `server.js`.
2. Add the type to `VALID_LISTS` array in `server.js`.
3. Add tab/label in `Lists.jsx`.
4. Document the schema in `docs/data-schemas.md`.

### Adding a new node field

1. Add to the schema in `docs/data-schemas.md` first.
2. `PATCH /api/tree/:id` is already open — new fields pass through automatically.
3. Add UI in `Tree.jsx` or `NodeCard.jsx` if user-editable.
4. Do not add fields that duplicate existing ones (e.g., no `deadline` if `due` already exists).

### Changing the data schema

1. Update `docs/data-schemas.md`.
2. If adding a required field: add a migration/default in `initBrain()` or handle `undefined` gracefully in all readers.
3. Never remove a field without checking all usages: `grep -r "fieldName" life-os/`.

---

## What not to do

- **Do not** add a database. The JSON file store is intentional — simple, portable, gitignore-able.
- **Do not** add authentication. This is a single-user local app.
- **Do not** hardcode sphere slugs (`health`, `career`, etc.) — spheres are user-defined tree roots.
- **Do not** write to `brain/content/inbox/current.json` for data that belongs somewhere else — inbox is a routing queue, not storage.
- **Do not** add network requests to the frontend that bypass `/api/` — all data access goes through the Express backend.
- **Do not** add AI as a hard dependency — every feature must have a non-AI fallback.
- **Do not** add `console.log` to production paths — use them only in dev-only branches or remove before commit.
