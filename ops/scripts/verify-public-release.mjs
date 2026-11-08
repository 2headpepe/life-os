#!/usr/bin/env node
import { execFileSync } from 'node:child_process'

const forbiddenPath = /^(brain\/(?!README\.md$)|\.(agents|claude|codex|obsidian)\/|areas\/|graphify-out\/|output\/|sites\/|\.presentation-build-[^/]+\/|geostatistics-ch6-handoff-[^/]+\/|research-handoff-[^/]+\/|20\d\d-\d\d-\d\d\.md$|ai-brain\.md$|orbcloud\.txt$|pamyatka\.html$|conversation-[^/]+\.txt$|[^/]+\.canvas$|(AGENTS|CLAUDE|CODEX)\.md$|docs\/(archive|reviews)\/|docs\/life-review-[^/]+\.md$|life-os\/backend\/data\/|ops\/(agent-registry\.json$|aggregates\/|ai-improvements\/|ai-sessions\/|launchd\/|life-os-analytics\/|product-intelligence\/|request-runs\/|route-promotions\/|scenario-candidates\/|warehouse\/|sports-[^/]+\.py$))/
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
const forbidden = tracked.filter(path => forbiddenPath.test(path))
if (forbidden.length) {
  console.error(`Public release contains forbidden paths:\n${forbidden.join('\n')}`)
  process.exit(1)
}

const history = execFileSync('git', ['log', 'HEAD', '--name-only', '--pretty=format:'], { encoding: 'utf8' })
  .split('\n').filter(Boolean)
const historical = [...new Set(history.filter(path => forbiddenPath.test(path)))]
if (historical.length) {
  console.error(`Git history contains forbidden paths:\n${historical.join('\n')}`)
  process.exit(1)
}

console.log('Public release path check passed.')
