#!/usr/bin/env node
import { execFileSync } from 'node:child_process'

const forbiddenPath = /^(brain\/(?!README\.md$)|\.(agents|claude|codex|obsidian)\/|areas\/|graphify-out\/|output\/|sites\/|\.presentation-build-[^/]+\/|geostatistics-ch6-handoff-[^/]+\/|research-handoff-[^/]+\/|20\d\d-\d\d-\d\d\.md$|ai-brain\.md$|orbcloud\.txt$|pamyatka\.html$|conversation-[^/]+\.txt$|[^/]+\.canvas$|(AGENTS|CLAUDE|CODEX)\.md$|docs\/(archive|reviews|commands|scenarios)\/|docs\/(README|ai-session-intelligence(-feature-spec)?|data-schemas|knowledge-operations|migration-status|product-roadmap|request-observability|runtime-architecture)\.md$|docs\/life-os-(agent-skill-contract|ai-review-delivery-system|concept-transition-plan|contract-map|data-boundary-contract|delegation-contract|operating-model|reliability-contract|target-platform|task-contract|transformation-proposal)\.(md|docx)$|docs\/life-review-[^/]+\.md$|life-os\/(CLAUDE\.md|design-surface-manifest\.json|backend\/data\/|frontend\/src\/components\/ClaudeConsole\.jsx|frontend\/tests\/|island\/\.gitignore$)|ops\/(\.gitignore$|README\.md$|agent-registry\.json$|aggregates\/|ai-improvements\/|ai-sessions\/|launchd\/|life-os-analytics\/|product-intelligence\/|prompts\/|request-runs\/|route-promotions\/|scenario-candidates\/|schemas\/|sql\/|ui\/|warehouse\/|sports-[^/]+\.py$)|ops\/scripts\/(?!doctor\.mjs$|seed-empty\.js$|verify-public-release\.mjs$)|prompts\/)/
const historicalForbiddenPath = /^(brain\/(?!README\.md$)|\.(agents|claude|codex|obsidian)\/|areas\/|graphify-out\/|output\/|sites\/|\.presentation-build-[^/]+\/|geostatistics-ch6-handoff-[^/]+\/|research-handoff-[^/]+\/|20\d\d-\d\d-\d\d\.md$|ai-brain\.md$|orbcloud\.txt$|pamyatka\.html$|conversation-[^/]+\.txt$|[^/]+\.canvas$|(AGENTS|CLAUDE|CODEX)\.md$|docs\/(archive|reviews)\/|docs\/life-review-[^/]+\.md$|life-os\/backend\/data\/|ops\/(agent-registry\.json$|aggregates\/|ai-improvements\/|ai-sessions\/|launchd\/|life-os-analytics\/|product-intelligence\/|request-runs\/|route-promotions\/|scenario-candidates\/|warehouse\/|sports-[^/]+\.py$))/
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
const forbidden = tracked.filter(path => forbiddenPath.test(path))
if (forbidden.length) {
  console.error(`Public release contains forbidden paths:\n${forbidden.join('\n')}`)
  process.exit(1)
}

const history = execFileSync('git', ['log', 'HEAD', '--name-only', '--pretty=format:'], { encoding: 'utf8' })
  .split('\n').filter(Boolean)
const historical = [...new Set(history.filter(path => historicalForbiddenPath.test(path)))]
if (historical.length) {
  console.error(`Git history contains forbidden paths:\n${historical.join('\n')}`)
  process.exit(1)
}

console.log('Public release path check passed.')
