#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '../..')
const envPath = path.join(root, 'life-os/backend/.env')
const nodeMajor = Number(process.versions.node.split('.')[0])
let failed = false

function report(ok, label, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed = true
}

function readEnvValue(content, name) {
  const match = content.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`, 'm'))
  return match?.[1]?.replace(/^['"]|['"]$/g, '') || ''
}

report(nodeMajor >= 22, 'Node.js 22+', process.versions.node)
report(fs.existsSync(path.join(root, 'life-os/backend/package.json')), 'backend source')
report(fs.existsSync(path.join(root, 'life-os/frontend/package.json')), 'frontend source')

if (!fs.existsSync(envPath)) {
  console.log('• AI runtime — disabled until life-os/backend/.env is created')
} else {
  const env = fs.readFileSync(envPath, 'utf8')
  const runtime = (readEnvValue(env, 'AI_RUNTIME') || 'none').toLowerCase()
  if (!['none', 'codex', 'opencode'].includes(runtime)) {
    report(false, 'AI_RUNTIME', 'must be none, codex, or opencode')
  } else if (runtime === 'none') {
    console.log('✓ AI runtime — none (safe mode)')
  } else {
    const command = runtime === 'codex'
      ? (readEnvValue(env, 'CODEX_COMMAND') || 'codex')
      : (readEnvValue(env, 'OPENCODE_COMMAND') || 'opencode')
    try {
      const version = execFileSync(command, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
      report(true, `${runtime} CLI`, version)
    } catch {
      report(false, `${runtime} CLI`, `install and authenticate ${command}`)
    }
  }
}

process.exitCode = failed ? 1 : 0
