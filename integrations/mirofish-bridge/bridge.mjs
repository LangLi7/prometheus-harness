#!/usr/bin/env node
/**
 * OpenAI-compatible bridge for MiroFish.
 *
 * MiroFish only speaks the OpenAI SDK wire format. Prometheus Harness does not
 * expose a model server; it holds provider credentials and talks to OpenRouter
 * itself. This bridge closes that gap: it accepts /v1/chat/completions from
 * MiroFish, authenticates the caller with a shared token, and forwards the
 * request to the upstream provider using the credential Prometheus stores in
 * ~/.pmh/.credentials.yaml.
 *
 * No dependencies: Node 18+ built-ins only.
 */

import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { timingSafeEqual } from 'node:crypto'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)

const here = dirname(fileURLToPath(import.meta.url))

// Providers the bridge can forward to. The credential name is resolved from the
// Prometheus store, so switching costs one environment variable. A provider can
// also rewrite the model name, because the caller's model id is provider
// specific (MiroFish sends whatever LLM_MODEL_NAME holds).
const PROVIDERS = {
  openrouter: {
    upstream: 'https://openrouter.ai/api/v1',
    credential: 'OPENROUTER_API_KEY',
    model: null,
  },
  deepseek: {
    upstream: 'https://api.deepseek.com/v1',
    credential: 'DEEPSEEK_API_KEY',
    model: 'deepseek-chat',
  },
}

const PROVIDER_NAME = (process.env.BRIDGE_PROVIDER ?? 'openrouter').toLowerCase()
const PROVIDER = PROVIDERS[PROVIDER_NAME]
if (!PROVIDER) {
  console.error(
    `[bridge] unknown BRIDGE_PROVIDER "${PROVIDER_NAME}"; known: ${Object.keys(PROVIDERS).join(', ')}`,
  )
  process.exit(1)
}

const UPSTREAM = process.env.BRIDGE_UPSTREAM ?? PROVIDER.upstream
// Forces one model id regardless of what the caller asks for; empty means pass
// the caller's value through.
const MODEL_OVERRIDE = process.env.BRIDGE_MODEL ?? PROVIDER.model ?? ''
const PORT = Number(process.env.BRIDGE_PORT ?? 8799)
const HOST = process.env.BRIDGE_HOST ?? '0.0.0.0'
const STORE = process.env.BRIDGE_CREDENTIAL_STORE ?? join(homedir(), '.pmh', '.credentials.yaml')
const TOKEN_FILE = process.env.BRIDGE_TOKEN_FILE ?? join(here, 'token.txt')
const MAX_BODY_BYTES = 8 * 1024 * 1024

// PDF export wiring: the builder lives next to the bridge in this checkout and
// writes into its own out/ directory.
const PDF_BUILDER = join(here, '..', 'mirofish-report-pdf', 'build.mjs')
const PDF_OUT_DIR = join(here, '..', 'mirofish-report-pdf', 'out')
// Only the local web app may trigger a build; the route is not token protected
// because the browser has no way to hold the bridge token.
const PDF_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])

/**
 * Upstream deadline. Without one, a provider that accepts the request and then
 * stalls leaves the caller waiting forever: the container showed a socket in
 * CLOSE_WAIT while the simulation sat at round 0 for minutes. Generous because
 * a large completion legitimately takes a while; override with
 * BRIDGE_TIMEOUT_MS.
 */
const UPSTREAM_TIMEOUT_MS = Number.parseInt(process.env.BRIDGE_TIMEOUT_MS ?? '180000', 10)

function readToken() {
  if (process.env.BRIDGE_TOKEN) return process.env.BRIDGE_TOKEN.trim()
  if (!existsSync(TOKEN_FILE)) return ''
  return readFileSync(TOKEN_FILE, 'utf8').trim()
}

/**
 * Read one credential from the Prometheus store. The file lists plain-text
 * `NAME: value` pairs under `refs:`; entries below `records:` are encrypted and
 * are not handled here.
 */
function readCredential(name) {
  if (!existsSync(STORE)) return ''
  const text = readFileSync(STORE, 'utf8')
  const pattern = new RegExp(`^\\s{2}${name}:\\s*(\\S+)\\s*$`, 'm')
  const match = pattern.exec(text)
  return match ? match[1] : ''
}

const BRIDGE_TOKEN = readToken()
const UPSTREAM_KEY =
  process.env[PROVIDER.credential] || readCredential(PROVIDER.credential)

if (!UPSTREAM_KEY) {
  console.error(
    `[bridge] no credential for provider "${PROVIDER_NAME}": ` +
      `set ${PROVIDER.credential} or provide it in the store`,
  )
  process.exit(1)
}
if (!BRIDGE_TOKEN) {
  console.error(`[bridge] no bridge token: set BRIDGE_TOKEN or write ${TOKEN_FILE}`)
  process.exit(1)
}

// A model can answer with UTF-16 surrogates that are not part of a valid pair
// (qwen does this for some emoji). Python then fails when it encodes the text
// as UTF-8, which killed a simulation mid-round. Replace every lone surrogate
// before the caller ever sees it.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

function cleanText(value) {
  if (typeof value === 'string') return value.replace(LONE_SURROGATE, '\uFFFD')
  if (Array.isArray(value)) return value.map(cleanText)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, entry] of Object.entries(value)) out[key] = cleanText(entry)
    return out
  }
  return value
}

/** Sanitize a JSON response body; fall back to the original bytes on failure. */
function sanitizeJsonBody(text) {
  try {
    const parsed = JSON.parse(text)
    const cleaned = cleanText(parsed)
    return cleaned === parsed ? text : JSON.stringify(cleaned)
  } catch {
    return text
  }
}

/** Constant-time comparison of the caller token against the bridge token. */
function tokenMatches(header) {
  if (!header) return false
  const value = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim()
  const a = Buffer.from(value)
  const b = Buffer.from(BRIDGE_TOKEN)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    connection: 'close',
  })
  res.end(body)
}

/** Read the request body with a hard size cap instead of buffering blindly. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function upstreamHeaders(extra = {}) {
  return {
    authorization: `Bearer ${UPSTREAM_KEY}`,
    'http-referer': 'http://localhost:3000',
    'x-title': 'Prometheus MiroFish Bridge',
    ...extra,
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (url.pathname === '/healthz') {
    sendJson(res, 200, { ok: true, upstream: UPSTREAM })
    return
  }

  // The PDF route is guarded by its own origin check: the browser cannot hold
  // the bridge token, and the route only renders a report that is already on
  // this host.
  if (url.pathname !== '/pdf' && !tokenMatches(req.headers.authorization)) {
    sendJson(res, 401, { error: { message: 'invalid bridge token', type: 'authentication_error' } })
    return
  }

  try {
    // PDF export. The MiroFish UI runs in the browser, the Typst toolchain runs
    // here on the host, so the browser asks the bridge to build the PDF and
    // hands the bytes straight back. Only local app origins may call it.
    if (url.pathname === '/pdf') {
      const origin = req.headers.origin
      if (req.method === 'OPTIONS') {
        if (!PDF_ORIGINS.has(origin)) {
          res.writeHead(403, { connection: 'close' })
          res.end()
          return
        }
        res.writeHead(204, {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'POST',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '600',
          connection: 'close',
        })
        res.end()
        return
      }

      if (!PDF_ORIGINS.has(origin)) {
        sendJson(res, 403, { error: { message: 'origin not allowed', type: 'forbidden' } })
        return
      }

      const payload = JSON.parse((await readBody(req)).toString('utf8') || '{}')
      const reportId = String(payload.report_id ?? '')
      if (!/^[A-Za-z0-9_-]+$/.test(reportId)) {
        sendJson(res, 400, { error: { message: 'invalid report_id', type: 'invalid_request_error' } })
        return
      }

      const started = Date.now()
      try {
        await run(process.execPath, [PDF_BUILDER, reportId], { timeout: 180_000 })
      } catch (error) {
        console.error(`[bridge] pdf build failed for ${reportId}: ${error.message}`)
        sendJson(res, 500, {
          error: { message: `pdf build failed: ${error.message}`, type: 'pdf_error' },
        })
        return
      }

      const pdfPath = join(PDF_OUT_DIR, `${reportId}.pdf`)
      if (!existsSync(pdfPath)) {
        sendJson(res, 500, { error: { message: 'pdf not written', type: 'pdf_error' } })
        return
      }
      const data = readFileSync(pdfPath)
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${reportId}.pdf"`,
        'content-length': data.length,
        'access-control-allow-origin': origin,
        connection: 'close',
      })
      res.end(data)
      console.log(`[bridge] pdf ${reportId} ${data.length}B ${Date.now() - started}ms`)
      return
    }

    if (req.method === 'GET' && url.pathname === '/v1/models') {
      const upstream = await fetch(`${UPSTREAM}/models`, { headers: upstreamHeaders() })
      const text = await upstream.text()
      res.writeHead(upstream.status, {
        'content-type': 'application/json; charset=utf-8',
        connection: 'close',
      })
      res.end(text)
      return
    }

    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      const raw = await readBody(req)
      let payload
      try {
        payload = JSON.parse(raw.toString('utf8'))
      } catch {
        sendJson(res, 400, { error: { message: 'malformed JSON body', type: 'invalid_request_error' } })
        return
      }

      // The caller's model id belongs to its own provider; override it when the
      // bridge is pinned to another one (BRIDGE_MODEL).
      if (MODEL_OVERRIDE && payload.model !== MODEL_OVERRIDE) {
        payload.model = MODEL_OVERRIDE
      }

      const started = Date.now()
      const label = `${payload.model ?? 'unknown'} stream=${payload.stream === true}`

      // Abort the upstream call when the caller disconnects, and give up once
      // the deadline passes. Either way the request cannot hang indefinitely.
      const clientGone = new AbortController()
      req.on('close', () => clientGone.abort())

      const upstream = await fetch(`${UPSTREAM}/chat/completions`, {
        method: 'POST',
        headers: upstreamHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify(payload),
        signal: AbortSignal.any([clientGone.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
      })

      // Stream server-sent events straight through so MiroFish keeps its
      // expected transport; fall back to plain text for error bodies.
      if (payload.stream === true) {
        res.writeHead(upstream.status, {
          'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
          'cache-control': 'no-cache',
          // Close instead of keeping the socket alive: a pooled connection the
          // server has already closed is reused by the Python client, which
          // then waits for a response that never comes. One handshake per
          // request on loopback is cheaper than a stalled simulation.
          connection: 'close',
        })
        if (!upstream.body) {
          res.end()
          return
        }
        for await (const chunk of upstream.body) res.write(chunk)
        res.end()
        console.log(`[bridge] ${upstream.status} ${label} ${Date.now() - started}ms`)
        return
      }

      const text = await upstream.text()
      res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
        connection: 'close',
      })
      res.end(sanitizeJsonBody(text))
      console.log(`[bridge] ${upstream.status} ${label} ${Date.now() - started}ms`)
      return
    }

    sendJson(res, 404, { error: { message: `unknown route ${req.method} ${url.pathname}`, type: 'invalid_request_error' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    const reason = timedOut ? `upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms` : message
    console.error(`[bridge] failure: ${reason}`)
    if (res.headersSent) {
      res.end()
      return
    }
    sendJson(res, timedOut ? 504 : 502, {
      error: { message: `upstream failure: ${reason}`, type: 'upstream_error' },
    })
  }
})

// Idle sockets are closed after the response anyway; the timeout only guards
// against a client that sends headers and then goes quiet.
server.keepAliveTimeout = 5_000
server.headersTimeout = 10_000

server.listen(PORT, HOST, () => {
  console.log(`[bridge] listening on http://${HOST}:${PORT}`)
  console.log(`[bridge] provider ${PROVIDER_NAME} (${PROVIDER.credential})`)
  console.log(`[bridge] upstream ${UPSTREAM}`)
  console.log(`[bridge] credential store ${STORE}`)
})
