import assert from 'node:assert/strict'
import test from 'node:test'
import { aiRuntimeConfig, aiTaskInvocation, promptFromMessages, runAiTask } from '../ai-runtime.js'

test('AI runtime defaults to no AI', () => {
  assert.deepEqual(aiRuntimeConfig({}), { runtime: 'none', command: 'opencode', model: undefined })
})
test('Codex and OpenCode select only their own configuration', () => {
  assert.deepEqual(aiRuntimeConfig({ AI_RUNTIME: 'codex', CODEX_COMMAND: 'my-codex', CODEX_MODEL: 'gpt-test' }), {
    runtime: 'codex', command: 'my-codex', model: 'gpt-test',
  })
  assert.deepEqual(aiRuntimeConfig({ AI_RUNTIME: 'opencode', OPENCODE_COMMAND: 'my-opencode', OPENCODE_MODEL: 'local/test' }), {
    runtime: 'opencode', command: 'my-opencode', model: 'local/test',
  })
})
test('AI runtime rejects an arbitrary command runtime', () => {
  assert.throws(() => aiRuntimeConfig({ AI_RUNTIME: 'claude' }), /none, codex, or opencode/)
})

test('AI runtime rejects shell syntax in a configured executable', () => {
  assert.throws(
    () => aiRuntimeConfig({ AI_RUNTIME: 'opencode', OPENCODE_COMMAND: 'opencode; rm -rf /' }),
    /OPENCODE_COMMAND must be an executable path or name/,
  )
})
test('chat prompts retain roles and system constraints', () => {
  const prompt = promptFromMessages([{ role: 'user', content: 'Привет' }, { role: 'assistant', content: 'Здравствуйте' }], 'Отвечай кратко')
  assert.match(prompt, /Отвечай кратко/)
  assert.match(prompt, /User: Привет/)
  assert.match(prompt, /Assistant: Здравствуйте/)
})

test('OpenCode v2 background tasks are launched without write-capable tools', () => {
  const invocation = aiTaskInvocation('Review this', { AI_RUNTIME: 'opencode' })
  assert.deepEqual(invocation.args.slice(0, 1), ['run'])
  assert.ok(!invocation.args.includes('--pure'))
  assert.equal(invocation.env.OPENCODE_PURE, undefined)
  const config = JSON.parse(invocation.env.OPENCODE_CONFIG_CONTENT)
  assert.deepEqual(config.permissions, [
    { action: 'edit', resource: '*', effect: 'deny' },
    { action: 'shell', resource: '*', effect: 'deny' },
    { action: 'webfetch', resource: '*', effect: 'deny' },
    { action: 'websearch', resource: '*', effect: 'deny' },
    { action: 'external_directory', resource: '*', effect: 'deny' },
    { action: 'subagent', resource: '*', effect: 'deny' },
  ])
  assert.deepEqual(config.policies, [
    { action: 'tool.use', resource: 'edit:*', effect: 'deny' },
    { action: 'tool.use', resource: 'shell:*', effect: 'deny' },
    { action: 'tool.use', resource: 'webfetch:*', effect: 'deny' },
    { action: 'tool.use', resource: 'websearch:*', effect: 'deny' },
    { action: 'tool.use', resource: 'external_directory:*', effect: 'deny' },
    { action: 'tool.use', resource: 'subagent:*', effect: 'deny' },
  ])
})

test('AI runtime reports a bounded, redacted diagnostic when its executable cannot start', async () => {
  await assert.rejects(
    runAiTask('test', { cwd: process.cwd(), timeoutMs: 100, env: { AI_RUNTIME: 'opencode', OPENCODE_COMMAND: 'missing-opencode-binary' } }),
    error => {
      assert.equal(error.code, 'spawn_error')
      assert.equal(error.aiDiagnostic.code, 'spawn_error')
      assert.equal(error.aiDiagnostic.command, 'missing-opencode-binary')
      assert.equal(typeof error.aiDiagnostic.durationMs, 'number')
      return true
    },
  )
})
