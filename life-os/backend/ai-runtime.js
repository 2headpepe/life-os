import { spawn } from 'child_process'

const RUNTIMES = new Set(['none', 'codex', 'opencode'])

export function aiRuntimeConfig(env = process.env) {
  const runtime = (env.AI_RUNTIME || 'none').toLowerCase()
  if (!RUNTIMES.has(runtime)) throw new Error('AI_RUNTIME must be none, codex, or opencode')
  return {
    runtime,
    command: runtime === 'codex' ? (env.CODEX_COMMAND || 'codex') : (env.OPENCODE_COMMAND || 'opencode'),
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
export function runAiTask(prompt, { cwd, timeoutMs = 180_000, env = process.env } = {}) {
  const config = aiRuntimeConfig(env)
  if (config.runtime === 'none') throw new Error('AI is disabled. Set AI_RUNTIME=codex or AI_RUNTIME=opencode.')
  const modelArgs = config.model ? ['--model', config.model] : []
  const args = config.runtime === 'codex'
    ? ['exec', '--ephemeral', '--sandbox', 'read-only', ...modelArgs, prompt]
    : ['run', ...modelArgs, prompt]
  return run(config.command, args, { cwd, timeoutMs, env })
}

export function promptFromMessages(messages, system) {
  const transcript = messages
    .map(message => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
    .join('\n\n')
  return `${system || 'You are a helpful Life OS assistant. Reply in Russian, concisely and safely.'}\n\n${transcript}\n\nAssistant:`
}
