import { spawn } from 'child_process'

const RUNTIMES = new Set(['none', 'codex', 'opencode'])
const SAFE_COMMAND = /^[A-Za-z0-9._/-]+$/
const OPENCODE_READ_ONLY_CONFIG = JSON.stringify({
  $schema: 'https://opencode.ai/config.json',
  // OpenCode v2 evaluates ordered permission rules. The broad deny rules make
  // background analysis read-only even when the user's global config is more
  // permissive.
  permissions: [
    { action: 'edit', resource: '*', effect: 'deny' },
    { action: 'shell', resource: '*', effect: 'deny' },
    { action: 'webfetch', resource: '*', effect: 'deny' },
    { action: 'websearch', resource: '*', effect: 'deny' },
    { action: 'external_directory', resource: '*', effect: 'deny' },
    { action: 'subagent', resource: '*', effect: 'deny' },
  ],
  // Policies are evaluated after agent and saved permission rules, preventing
  // a permissive user configuration from weakening the background sandbox.
  policies: [
    { action: 'tool.use', resource: 'edit:*', effect: 'deny' },
    { action: 'tool.use', resource: 'shell:*', effect: 'deny' },
    { action: 'tool.use', resource: 'webfetch:*', effect: 'deny' },
    { action: 'tool.use', resource: 'websearch:*', effect: 'deny' },
    { action: 'tool.use', resource: 'external_directory:*', effect: 'deny' },
    { action: 'tool.use', resource: 'subagent:*', effect: 'deny' },
  ],
})

function configuredCommand(value, fallback, variable) {
  const command = value || fallback
  if (!SAFE_COMMAND.test(command)) {
    throw new Error(`${variable} must be an executable path or name without spaces or shell characters`)
  }
  return command
}

export function aiRuntimeConfig(env = process.env) {
  const runtime = (env.AI_RUNTIME || 'none').toLowerCase()
  if (!RUNTIMES.has(runtime)) throw new Error('AI_RUNTIME must be none, codex, or opencode')
  return {
    runtime,
    command: runtime === 'codex'
      ? configuredCommand(env.CODEX_COMMAND, 'codex', 'CODEX_COMMAND')
      : configuredCommand(env.OPENCODE_COMMAND, 'opencode', 'OPENCODE_COMMAND'),
    model: runtime === 'codex' ? env.CODEX_MODEL : env.OPENCODE_MODEL,
  }
}

function run(command, args, { cwd, timeoutMs, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`AI task timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', code => {
      clearTimeout(timer)
      if (code === 0) return resolve(stdout)
      reject(new Error(`${command} exited ${code}: ${stderr.slice(0, 300)}`))
    })
  })
}

export async function checkAiRuntime(options = {}) {
  const config = aiRuntimeConfig(options.env)
  if (config.runtime === 'none') return { ...config, available: false, reason: 'AI_RUNTIME=none' }
  try {
    await run(config.command, ['--version'], { cwd: options.cwd || process.cwd(), timeoutMs: 10_000, env: options.env || process.env })
    return { ...config, available: true }
  } catch (error) {
    return { ...config, available: false, reason: error.message }
  }
}

// Background analysis is always read-only. User-approved writes belong to the
// application backend, never to an AI CLI permission flag.
export function aiTaskInvocation(prompt, env = process.env) {
  const config = aiRuntimeConfig(env)
  if (config.runtime === 'none') throw new Error('AI is disabled. Set AI_RUNTIME=codex or AI_RUNTIME=opencode.')
  const modelArgs = config.model ? ['--model', config.model] : []
  const args = config.runtime === 'codex'
    ? ['exec', '--ephemeral', '--sandbox', 'read-only', ...modelArgs, prompt]
    // OpenCode v2 runs scripts through the `run` subcommand. Its old `--pure`
    // flag is unsupported, so read-only protection comes from the temporary
    // v2 permission rules below instead.
    : ['run', ...modelArgs, prompt]
  const runtimeEnv = config.runtime === 'opencode'
    ? { ...env, OPENCODE_CONFIG_CONTENT: OPENCODE_READ_ONLY_CONFIG }
    : env
  return { config, args, env: runtimeEnv }
}

export function runAiTask(prompt, { cwd, timeoutMs = 180_000, env = process.env } = {}) {
  const invocation = aiTaskInvocation(prompt, env)
  return run(invocation.config.command, invocation.args, { cwd, timeoutMs, env: invocation.env })
}

export function promptFromMessages(messages, system) {
  const transcript = messages
    .map(message => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
    .join('\n\n')
  return `${system || 'You are a helpful Life OS assistant. Reply in Russian, concisely and safely.'}\n\n${transcript}\n\nAssistant:`
}
