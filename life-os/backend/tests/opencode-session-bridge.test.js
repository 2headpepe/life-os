import assert from 'node:assert/strict'
import test from 'node:test'
import { LifeOsOpenCodeSessionBridge } from '../opencode-session-bridge.js'

function runtime() {
  return {
    runtime: 'opencode',
    command: 'opencode',
    model: 'assistant/assistant',
    serverUrl: 'http://127.0.0.1:4096',
    agent: 'build',
  }
}

function fakeClient({ status = { type: 'busy' }, messages = [] } = {}) {
  const calls = []
  return {
    calls,
    async preflight(model) { calls.push(['preflight', model]); return { health: { version: '1.18.33' }, model: { status: 'available' } } },
    async createSession(input) { calls.push(['createSession', input]); return { id: 'ses_lifeos' } },
    async submitPromptAsync(id, input) { calls.push(['prompt', id, input]); return { accepted: true } },
    async sessionStatus(id) { calls.push(['status', id]); return status },
    async messages(id) { calls.push(['messages', id]); return messages },
    async abort(id) { calls.push(['abort', id]); return true },
    async *events() {},
  }
}

test('OpenCode bridge creates an ask-only session and submits no prompt tools', async () => {
  const client = fakeClient()
  const bridge = new LifeOsOpenCodeSessionBridge({ runtime, clientFactory: () => client, log: { warn() {} } })
  const result = await bridge.start({ messages: [{ role: 'user', content: 'Привет' }], system: 'Отвечай кратко' })
  bridge.stopEventPump()

  assert.equal(result.state, 'running')
  assert.equal(result.session_id, 'ses_lifeos')
  const create = client.calls.find(call => call[0] === 'createSession')[1]
  assert.equal(create.title, 'Life OS chat')
  assert.equal(create.agent, 'build')
  assert.equal(create.model, 'assistant/assistant')
  assert.deepEqual(create.permission, [{ permission: '*', pattern: '*', action: 'ask' }])
  assert.ok(create.signal)
  const prompt = client.calls.find(call => call[0] === 'prompt')[2]
  assert.equal(prompt.tools, undefined)
  assert.match(prompt.parts[0].text, /Отвечай кратко/)
  assert.match(prompt.parts[0].text, /User: Привет/)
})

test('OpenCode bridge reconciles completion, permission waits, and cancellation', async () => {
  const client = fakeClient({
    status: { type: 'idle' },
    messages: [{ info: { role: 'assistant' }, parts: [{ type: 'text', text: 'Готово' }] }],
  })
  const bridge = new LifeOsOpenCodeSessionBridge({ runtime, clientFactory: () => client, log: { warn() {} } })
  await bridge.start({ messages: [{ role: 'user', content: 'Привет' }] })
  assert.equal((await bridge.inspect('ses_lifeos')).state, 'completed')

  // A second bridge gives the permission branch a deliberately busy session
  // without output.
  const waitingClient = fakeClient({ status: { type: 'busy' }, messages: [] })
  const waiting = new LifeOsOpenCodeSessionBridge({ runtime, clientFactory: () => waitingClient, log: { warn() {} } })
  await waiting.start({ messages: [{ role: 'user', content: 'Нужен файл' }] })
  waiting.applyEvent({ type: 'permission.asked', properties: { sessionID: 'ses_lifeos' } })
  assert.equal((await waiting.inspect('ses_lifeos')).state, 'permission_required')
  assert.equal((await waiting.abort('ses_lifeos')).state, 'cancelled')
  assert.ok(waitingClient.calls.some(call => call[0] === 'abort'))
  bridge.stopEventPump()
  waiting.stopEventPump()
})

test('OpenCode bridge never exposes a session it did not create', async () => {
  const bridge = new LifeOsOpenCodeSessionBridge({ runtime, clientFactory: () => fakeClient(), log: { warn() {} } })
  await assert.rejects(bridge.inspect('ses_other'), error => error.code === 'session_unknown')
})

test('Life OS session bridge pins its configured OpenCode model to assistant/assistant', async () => {
  const bridge = new LifeOsOpenCodeSessionBridge({
    runtime: () => ({ ...runtime(), model: 'other/model' }),
    clientFactory: () => fakeClient(),
    log: { warn() {} },
  })
  await assert.rejects(
    bridge.start({ messages: [{ role: 'user', content: 'Привет' }] }),
    error => error.code === 'model_not_allowed',
  )
})

test('a failed initial prompt stops the event pump when no session remains', async () => {
  let eventStarts = 0
  const client = {
    async preflight() { return { health: {}, model: { status: 'available' } } },
    async createSession() { return { id: 'ses_lifeos' } },
    async submitPromptAsync() { throw new Error('prompt failed') },
    async *events({ signal }) {
      eventStarts += 1
      if (signal.aborted) return
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    },
  }
  const bridge = new LifeOsOpenCodeSessionBridge({ runtime, clientFactory: () => client, log: { warn() {} } })
  await assert.rejects(bridge.start({ messages: [{ role: 'user', content: 'Привет' }] }), /prompt failed/)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(bridge.sessions.size, 0)
  assert.equal(bridge.eventPumpRunning, false)
  assert.equal(bridge.eventAbortController, null)
  assert.ok(eventStarts <= 1)
})

test('a continued session does not reuse the prior assistant reply as its new completion', async () => {
  const state = {
    status: { type: 'idle' },
    messages: [{ info: { id: 'msg_old', role: 'assistant' }, parts: [{ type: 'text', text: 'Старый ответ' }] }],
  }
  const client = {
    async preflight() { return { health: {}, model: { status: 'available' } } },
    async createSession() { return { id: 'ses_lifeos' } },
    async submitPromptAsync() { return { accepted: true } },
    async sessionStatus() { return state.status },
    async messages() { return state.messages },
    async abort() { return true },
    async *events() {},
  }
  const bridge = new LifeOsOpenCodeSessionBridge({ runtime, clientFactory: () => client, log: { warn() {} } })
  await bridge.start({ messages: [{ role: 'user', content: 'Первый вопрос' }] })
  await bridge.continue('ses_lifeos', { prompt: 'Следующий вопрос' })
  const waiting = await bridge.inspect('ses_lifeos')
  assert.equal(waiting.state, 'running')
  assert.equal(waiting.text, null)

  state.messages.push({ info: { id: 'msg_new', role: 'assistant' }, parts: [{ type: 'text', text: 'Новый ответ' }] })
  const completed = await bridge.inspect('ses_lifeos')
  assert.equal(completed.state, 'completed')
  assert.equal(completed.text, 'Новый ответ')
  bridge.stopEventPump()
})

test('a continuation after completion restarts permission event observation', async () => {
  const state = {
    status: { type: 'idle' },
    messages: [{ info: { id: 'msg_old', role: 'assistant' }, parts: [{ type: 'text', text: 'Первый ответ' }] }],
  }
  let eventStarts = 0
  const client = {
    async preflight() { return { health: {}, model: { status: 'available' } } },
    async createSession() { return { id: 'ses_lifeos' } },
    async submitPromptAsync() { return { accepted: true } },
    async sessionStatus() { return state.status },
    async messages() { return state.messages },
    async abort() { return true },
    async *events({ signal }) {
      eventStarts += 1
      if (signal.aborted) return
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    },
  }
  const bridge = new LifeOsOpenCodeSessionBridge({ runtime, clientFactory: () => client, log: { warn() {} } })
  await bridge.start({ messages: [{ role: 'user', content: 'Первый вопрос' }] })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(eventStarts, 1)
  assert.equal((await bridge.inspect('ses_lifeos')).state, 'completed')

  state.status = { type: 'busy' }
  await bridge.continue('ses_lifeos', { prompt: 'Следующий вопрос' })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(eventStarts, 2)
  bridge.applyEvent({ type: 'permission.asked', properties: { sessionID: 'ses_lifeos' } })
  assert.equal((await bridge.inspect('ses_lifeos')).state, 'permission_required')
  bridge.stopEventPump()
})
