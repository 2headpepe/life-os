#!/usr/bin/env node
import { execFileSync } from 'node:child_process'

const forbiddenPath = /^(brain\/(?!README\.md$)|\.obsidian\/|\.codex\/|\.agents\/|ops\/(ai-sessions|life-os-analytics|product-intelligence)\/)/
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
const forbidden = tracked.filter(path => forbiddenPath.test(path))
if (forbidden.length) {
  console.error(`Public release contains forbidden paths:\n${forbidden.join('\n')}`)
  process.exit(1)
}

const history = execFileSync('git', ['log', '--all', '--name-only', '--pretty=format:'], { encoding: 'utf8' })
  .split('\n').filter(Boolean)
const historical = [...new Set(history.filter(path => forbiddenPath.test(path)))]
if (historical.length) {
  console.error(`Git history contains forbidden paths:\n${historical.join('\n')}`)
  process.exit(1)
}

console.log('Public release path check passed.')
