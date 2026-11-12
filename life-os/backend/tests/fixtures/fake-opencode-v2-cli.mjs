#!/usr/bin/env node
import http from 'node:http'

const args = process.argv.slice(2)
if (args[0] === '--version') {
  process.stdout.write('2.20.0\n')
  process.exit(0)
}
if (args[0] !== 'serve') process.exit(64)

function option(name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}

const host = option('--hostname')
const port = Number(option('--port'))
const password = process.env.OPENCODE_PASSWORD
if (!host || !Number.isInteger(port) || !password) process.exit(64)

const authorization = `Basic ${Buffer.from(`opencode:${password}`, 'utf8').toString('base64')}`

function sendJson(res, value, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(value))
}

function requiresAuth(req, res) {
  if (req.headers.authorization === authorization) return false
  sendJson(res, { _tag: 'UnauthorizedError', message: 'authentication required' }, 401)
  return true
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`)
  // OpenCode v2 serves its web SPA for legacy/non-API paths.
  if (url.pathname === '/global/health') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    return res.end('<!doctype html><div id="root">You need to enable JavaScript to run this app.</div>')
  }
  if (url.pathname === '/auth/connect/single-use-pair-code') {
    res.writeHead(303, { Location: '/' })
    return res.end()
  }
  if (url.pathname === '/auth/connect/other-code') return sendJson(res, { _tag: 'UnauthorizedError', message: 'Pairing link expired or already used' }, 401)
  if (requiresAuth(req, res)) return

  if (url.pathname === '/api/info') return sendJson(res, { version: '2.20.0', pid: process.pid })
  if (url.pathname === '/api/model') return sendJson(res, { data: [{ providerID: 'assistant', id: 'assistant' }] })
  if (url.pathname === '/api/session' && req.method === 'POST') return sendJson(res, { data: { id: 'ses_managed' } })
  if (url.pathname === '/api/session/ses_managed/prompt' && req.method === 'POST') return sendJson(res, { data: { id: 'msg_user' } })
  if (url.pathname === '/api/session/active') return sendJson(res, { data: {} })
  if (url.pathname === '/api/session/ses_managed/message') {
    return sendJson(res, { data: [{ id: 'msg_assistant', type: 'assistant', content: [{ type: 'text', text: 'Ответ от managed OpenCode' }] }] })
  }
  if (url.pathname === '/api/session/ses_managed/interrupt' && req.method === 'POST') return sendJson(res, { interrupted: true })
  if (url.pathname === '/api/pair' && req.method === 'POST') return sendJson(res, { code: 'single-use-pair-code', expires_in: 300 })
  if (url.pathname === '/api/event') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    return res.end('data: {"type":"server.connected","data":{}}\n\n')
  }
  return sendJson(res, { error: `unexpected ${req.method} ${url.pathname}` }, 404)
})

server.listen(port, host)

function stop() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1_000).unref()
}

process.once('SIGTERM', stop)
process.once('SIGINT', stop)
