import assert from 'node:assert/strict'
import test from 'node:test'
import { aiRuntimeConfig, promptFromMessages } from '../ai-runtime.js'

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

test('chat prompts retain roles and system constraints', () => {
  const prompt = promptFromMessages([{ role: 'user', content: 'Привет' }, { role: 'assistant', content: 'Здравствуйте' }], 'Отвечай кратко')
  assert.match(prompt, /Отвечай кратко/)
  assert.match(prompt, /User: Привет/)
  assert.match(prompt, /Assistant: Здравствуйте/)
})
