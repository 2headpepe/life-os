# AI reviews in the public edition

Life OS keeps review instructions in Git and personal content in the local,
gitignored `brain/` directory. A review must never require copying a user's
profile, notes, photos, or CLI session history into an issue, commit, or pull
request.

For in-app background jobs, Codex uses its read-only sandbox. OpenCode is
started in pure mode with `edit`, `bash`, `webfetch`, and external-directory
access denied. The interactive Console is intentionally different: it is a
user-opened terminal session where the user decides each requested permission.

## What may be reviewed

- source code, dependency manifests, and public documentation;
- the empty seed-data schema and the onboarding flow;
- privacy boundaries, error states, and cross-platform setup;
- an explicitly prepared, synthetic test workspace.

## What must stay local

- `brain/content/` and all exported data;
- `.env`, OAuth credentials, tokens, and CLI authentication state;
- raw Codex/OpenCode conversations unless the user has manually redacted and
  chosen to share them.

## Repeatable review loop

1. Start with the deterministic checks:

   ```bash
   node ops/scripts/verify-public-release.mjs
   node ops/scripts/doctor.mjs
   cd life-os/backend && npm test
   cd ../frontend && npm run build
   ```

2. Open the app against an empty local `brain/` directory. Complete both
   first-run paths: **without AI** and, if a local runtime is available,
   **with AI**.
3. Copy the prompt below into the already authenticated CLI chosen in `.env`.
   It asks for an analysis only; do not grant write permissions for a review.
4. Record findings using the review record below. A finding is actionable only
   when it has a reproducible path, expected outcome, and severity.
5. Fix accepted findings, re-run step 1, and attach only the sanitized review
   record to a pull request.

## Runtime-neutral review prompt

```text
Review this repository's first-run experience for a new user on macOS,
Windows, or Linux. Do not read or modify brain/, .env, credentials, or local
session history. Inspect only tracked source and documentation.

Check: prerequisites, README clarity, no-AI path, Codex/OpenCode selection,
runtime failure states, data privacy, and recoverability after a failed step.
Return a concise Markdown report: severity (P0–P3), evidence, affected user,
recommended change, and a testable acceptance criterion. Do not make edits.
```

## Review record

```md
# Review: <scope> — <YYYY-MM-DD>

## Coverage
- OS tested:
- AI runtime: none | codex | opencode
- Data used: empty generated local workspace only

## Findings
| Severity | Evidence | User impact | Recommendation | Acceptance criterion |
|---|---|---|---|---|
| P1 | ... | ... | ... | ... |

## Decision
- Accepted:
- Deferred:
- Rejected (with reason):
```

## Design-review baseline: first-run onboarding

The current baseline is deliberately a hypothesis, not telemetry:

| Hypothesis | Risk | Current response | How to validate |
|---|---|---|---|
| A newcomer may not have an AI subscription or token. | They abandon setup at the AI choice. | `AI_RUNTIME=none` is the default and opens a manual three-field setup. | Five moderated first-run sessions: time to create first task and completion rate. |
| A CLI may be installed but unusable. | A blank/error-only onboarding path. | `/api/config` checks `--version`; unavailable AI falls back to manual setup with a reason. | Test absent CLI, unauthenticated CLI, and working OpenCode/Codex. |
| A user needs an immediate useful result. | Empty dashboard has no next action. | Manual setup writes a sphere, a goal, and an active first task. | Confirm the user reaches Today with a visible actionable task. |
| Users may change the backend port. | The UI cannot reach the API. | Vite reads the local backend `.env` `PORT`. | Start both services with a non-default port. |

Remaining review work before a public release: run the cross-platform sessions
above, test a healthy Codex installation, and decide whether to add opt-in,
redacted review receipts for local CLI sessions.
