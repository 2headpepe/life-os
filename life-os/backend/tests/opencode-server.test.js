import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OpenCodeServerClient,
  OpenCodeServerError,
  ASK_USER_FOR_ALL_PERMISSIONS,
  eventNeedsPermission,
  inspectConfiguredModel,
  parseModelRef,
  parseSseEvents,
  validateOpenCodeServerUrl,
} from '../opencode-server.js'

function json(value, init = {}) {
  return new Response(value === undefined ? null : JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function sse(...chunks) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } })
}

test('OpenCode server URL is constrained to loopback HTTP(S)', () => {
  assert.equal(validateOpenCodeServerUrl('http://127.0.0.1:4096'), 'http://127.0.0.1:4096')
  assert.equal(validateOpenCodeServerUrl('https://localhost:4096/'), 'https://localhost:4096')
  assert.throws(() => validateOpenCodeServerUrl('http://10.0.0.8:4096'), error => error.code === 'server_url_not_loopback')
  assert.throws(() => validateOpenCodeServerUrl('http://user:password@127.0.0.1:4096'), error => error.code === 'server_url_invalid')
  assert.throws(() => validateOpenCodeServerUrl('http://127.0.0.1:4096/path'), error => error.code === 'server_url_invalid')
})

test('model parsing and flexible provider inspection support custom providers', () => {
  assert.deepEqual(parseModelRef('assistant/assistant'), { providerID: 'assistant', modelID: 'assistant' })
  assert.throws(() => parseModelRef('assistant'), error => error.code === 'model_invalid')
  assert.deepEqual(inspectConfiguredModel({ providers: [{ id: 'assistant', models: { assistant: {} } }] }, 'assistant/assistant'), {
    providerID: 'assistant', modelID: 'assistant', status: 'available',
  })
  assert.equal(inspectConfiguredModel({ providers: [{ id: 'assistant', models: [{ id: 'other' }] }] }, 'assistant/assistant').status, 'missing_model')
  assert.equal(inspectConfiguredModel({ providers: [{ id: 'other' }] }, 'assistant/assistant').status, 'missing_provider')
  assert.equal(inspectConfiguredModel({}, 'assistant/assistant').status, 'unknown')
})

test('client performs a session lifecycle without authorization headers', async () => {
  const requests = []
  const fetchImpl = async (url, options) => {
    requests.push({ url, options })
    const pathname = new URL(url).pathname
    if (pathname === '/global/health') return json({ healthy: true, version: '1.18.33' })
    if (pathname === '/config/providers') return json({ providers: [{ id: 'assistant', models: [{ id: 'assistant' }] }] })
    if (pathname === '/session' && options.method === 'POST') return json({ id: 'ses_1' })
    if (pathname === '/session/ses_1/prompt_async') return new Response(null, { status: 204 })
    if (pathname === '/session/status') return json({ ses_1: { type: 'idle' } })
    if (pathname === '/session/ses_1/message') return json([{ info: { role: 'assistant' }, parts: [{ type: 'text', text: 'ok' }] }])
    if (pathname === '/session/ses_1/abort') return json(true)
    throw new Error(`Unexpected path ${pathname}`)
  }
  const client = new OpenCodeServerClient({ url: 'http://127.0.0.1:4096', fetchImpl })

  assert.equal((await client.preflight('assistant/assistant')).model.status, 'available')
  assert.equal((await client.createSession({
    title: 'Life OS setup',
    agent: 'build',
    model: 'assistant/assistant',
    permission: ASK_USER_FOR_ALL_PERMISSIONS,
  })).id, 'ses_1')
  await client.submitPromptAsync('ses_1', {
    model: 'assistant/assistant', agent: 'build', system: 'Answer concisely', parts: [{ type: 'text', text: 'Hello' }],
  })
  assert.deepEqual(await client.sessionStatus('ses_1'), { type: 'idle' })
  assert.equal((await client.messages('ses_1', { limit: 4 }))[0].parts[0].text, 'ok')
  await client.abort('ses_1')

  const prompt = requests.find(request => new URL(request.url).pathname.endsWith('/prompt_async'))
  assert.deepEqual(JSON.parse(prompt.options.body), {
    model: { providerID: 'assistant', modelID: 'assistant' }, agent: 'build', system: 'Answer concisely', parts: [{ type: 'text', text: 'Hello' }],
  })
  const session = requests.find(request => new URL(request.url).pathname === '/session')
  assert.deepEqual(JSON.parse(session.options.body), {
    title: 'Life OS setup',
    agent: 'build',
    model: { providerID: 'assistant', modelID: 'assistant' },
    permission: [{ permission: '*', pattern: '*', action: 'ask' }],
  })
  assert.equal(prompt.options.headers.Authorization, undefined)
})

test('client reports unavailable server and unavailable configured model safely', async () => {
  const unavailable = new OpenCodeServerClient({ url: 'http://127.0.0.1:4096', fetchImpl: async () => { throw new Error('connect ECONNREFUSED') } })
  await assert.rejects(unavailable.health(), error => error instanceof OpenCodeServerError && error.code === 'server_unreachable')

  const missingModel = new OpenCodeServerClient({
    url: 'http://127.0.0.1:4096',
    fetchImpl: async url => new URL(url).pathname === '/global/health' ? json({ healthy: true }) : json({ providers: [{ id: 'assistant', models: [] }] }),
  })
  await assert.rejects(missingModel.preflight('other/model'), error => error.code === 'missing_provider')
})

test('SSE parsing normalizes session and permission events', async () => {
  const response = sse(
    'event: message\ndata: {"id":"event-1","type":"session.status","properties":{"sessionID":"ses_1","status":{"type":"busy"}}}\n\n',
    'data: {"id":"event-2","type":"permission.asked","properties":{"sessionID":"ses_1","permissionID":"perm_1"}}\n\n',
  )
  const events = []
  for await (const event of parseSseEvents(response.body)) events.push(event)
  assert.deepEqual(events[0], { id: 'event-1', type: 'session.status', properties: { sessionID: 'ses_1', status: { type: 'busy' } } })
  assert.equal(eventNeedsPermission(events[1]), true)
  assert.equal(eventNeedsPermission(events[0]), false)
})
