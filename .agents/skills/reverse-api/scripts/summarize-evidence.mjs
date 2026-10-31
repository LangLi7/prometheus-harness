#!/usr/bin/env node
/**
 * Fasst große Evidenzdateien zu einer kompakten Übersicht zusammen.
 *
 *   node summarize-evidence.mjs <datei> [--kind auto|har|rae|js|capture|generic]
 *                                       [--limit 20] [--json]
 *
 * Unterstützt HAR, RAE-Ergebnisse (--json), REA-JavaScript-Evidenz und
 * REA-Netzwerkaufzeichnungen. Es werden niemals Header-Werte oder Body-Inhalte
 * ausgegeben, nur Namen, Zähler und Pfad-Templates.
 */

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
if (!file) {
  console.error('Aufruf: node summarize-evidence.mjs <datei> [--kind …] [--limit N] [--json]')
  process.exit(2)
}

const getFlag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  if (index === -1) return fallback
  const value = args[index + 1]
  return value && !value.startsWith('--') ? value : true
}

const kindFlag = String(getFlag('kind', 'auto'))
const limit = Number.parseInt(String(getFlag('limit', '20')), 10) || 20
const asJson = Boolean(getFlag('json', false))

let parsed
try {
  parsed = JSON.parse(readFileSync(file, 'utf8'))
} catch (error) {
  console.error(`Datei nicht lesbar oder kein JSON: ${file}\n${error.message}`)
  process.exit(1)
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const arrayAt = (obj, path) => {
  let current = obj
  for (const key of path.split('.')) {
    if (!isObject(current)) return undefined
    current = current[key]
  }
  return Array.isArray(current) ? current : undefined
}

const detectKind = () => {
  if (kindFlag !== 'auto') return kindFlag
  if (arrayAt(parsed, 'log.entries')) return 'har'
  if (isObject(parsed) && 'schema_version' in parsed && ('run_id' in parsed || 'har_path' in parsed)) return 'rae'
  if (isObject(parsed) && (Array.isArray(parsed.modules) || Array.isArray(parsed.records))) {
    return Array.isArray(parsed.records) ? 'capture' : 'js'
  }
  if (isObject(parsed) && isObject(parsed.normalized_result)) return 'capture'
  return 'generic'
}

const templateSegment = (segment) => {
  if (/^\d+$/.test(segment)) return '{numeric}'
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(segment)) return '{uuid}'
  if (/^[0-9a-fA-F]{32,}$/.test(segment)) return '{hex}'
  if (/^\d{4}-\d{2}-\d{2}$/.test(segment)) return '{iso-date}'
  return segment
}

const templatePath = (pathname) => {
  try {
    const segments = pathname.split('/')
    return segments.map(templateSegment).join('/') || '/'
  } catch {
    return pathname
  }
}

const headerNames = (headers) => {
  if (!Array.isArray(headers)) return []
  return headers.map((header) => String(header?.name ?? '').toLowerCase()).filter(Boolean)
}

const summarizeHar = () => {
  const entries = arrayAt(parsed, 'log.entries') ?? []
  const groups = new Map()
  const statuses = new Map()
  const mimeTypes = new Map()
  const queryNames = new Set()
  const authHeaders = new Set()
  let withRequestBody = 0
  let withResponseBody = 0

  for (const entry of entries) {
    const request = entry?.request ?? {}
    const response = entry?.response ?? {}
    let url
    try {
      url = new URL(request.url)
    } catch {
      continue
    }

    const key = `${String(request.method ?? '?').toUpperCase()} ${url.origin}${templatePath(url.pathname)}`
    groups.set(key, (groups.get(key) ?? 0) + 1)

    const status = Number(response.status ?? 0)
    const bucket = status === 0 ? 'kein Status' : `${Math.floor(status / 100)}xx`
    statuses.set(bucket, (statuses.get(bucket) ?? 0) + 1)

    const mime = String(response.content?.mimeType ?? '').split(';')[0].trim().toLowerCase()
    if (mime) mimeTypes.set(mime, (mimeTypes.get(mime) ?? 0) + 1)

    for (const name of url.searchParams.keys()) queryNames.add(name)

    for (const name of headerNames(request.headers)) {
      if (name === 'authorization' || name === 'cookie' || name === 'x-api-key') authHeaders.add(name)
    }

    if (typeof request.postData?.text === 'string' && request.postData.text.length > 0) withRequestBody += 1
    if (typeof response.content?.text === 'string' && response.content.text.length > 0) withResponseBody += 1
  }

  const topGroups = [...groups.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([group, count]) => ({ group, count }))

  return {
    kind: 'har',
    entries: entries.length,
    groups: groups.size,
    topGroups,
    statuses: Object.fromEntries(statuses),
    mimeTypes: Object.fromEntries([...mimeTypes.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)),
    queryParameterNames: [...queryNames].sort(),
    authHeaderNames: [...authHeaders].sort(),
    entriesWithRequestBody: withRequestBody,
    entriesWithResponseBody: withResponseBody,
    note: 'Beobachteter Verkehr, keine vollständige API. Keine Header-Werte ausgegeben.',
  }
}

const findCollections = (root, wanted) => {
  const found = new Map()
  const seen = new Set()
  const walk = (node, depth) => {
    if (depth > 6 || !isObject(node) || seen.has(node)) return
    seen.add(node)
    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value) && wanted.includes(key)) {
        found.set(key, (found.get(key) ?? 0) + value.length)
      } else if (isObject(value)) {
        walk(value, depth + 1)
      }
    }
  }
  walk(root, 0)
  return found
}

const summarizeJs = () => {
  const collections = findCollections(parsed, ['modules', 'imports', 'routes', 'ipcHandlers', 'files', 'components'])
  const modules = arrayAt(parsed, 'modules') ?? arrayAt(parsed, 'graph.modules') ?? []
  const sample = modules.slice(0, limit).map((module, index) => {
    if (typeof module === 'string') return module
    return String(module?.path ?? module?.id ?? module?.name ?? `#${index}`)
  })
  return {
    kind: 'js',
    collections: Object.fromEntries(collections),
    moduleSample: sample,
    limitations: (parsed.limitations ?? []).slice(0, limit),
    unknowns: (parsed.unknowns ?? []).slice(0, limit),
    topLevelKeys: Object.keys(parsed).slice(0, limit),
  }
}

const summarizeCapture = () => {
  const records = arrayAt(parsed, 'records') ?? arrayAt(parsed, 'records.records') ?? []
  const methods = new Map()
  const hosts = new Map()
  for (const record of records) {
    const request = record?.reported?.request ?? record?.request ?? {}
    const method = String(request.method ?? '?').toUpperCase()
    methods.set(method, (methods.get(method) ?? 0) + 1)
    let host = 'unbekannt'
    try { host = new URL(request.url).host } catch { /* unbekannt */ }
    hosts.set(host, (hosts.get(host) ?? 0) + 1)
  }
  return {
    kind: 'capture',
    records: records.length,
    methods: Object.fromEntries(methods),
    hosts: Object.fromEntries([...hosts.entries()].slice(0, limit)),
    limitations: (parsed.limitations ?? []).slice(0, limit),
    note: 'Aufzeichnung ist historisch; sie belegt keinen Live-Zustand.',
  }
}

const summarizeRae = () => ({
  kind: 'rae',
  status: parsed.status,
  runId: parsed.run_id ?? null,
  mode: parsed.mode ?? null,
  harPath: parsed.har_path ?? null,
  scriptPath: parsed.script_path ?? null,
  error: parsed.error ?? null,
  usage: parsed.usage ?? null,
})

const summarizeGeneric = () => {
  const counts = {}
  if (isObject(parsed)) {
    for (const [key, value] of Object.entries(parsed)) {
      if (Array.isArray(value)) counts[key] = `array(${value.length})`
      else if (isObject(value)) counts[key] = `object(${Object.keys(value).length})`
      else counts[key] = typeof value
    }
  } else if (Array.isArray(parsed)) {
    counts.items = `array(${parsed.length})`
  }
  return {
    kind: 'generic',
    topLevel: Object.fromEntries(Object.entries(counts).slice(0, limit)),
    limitations: (parsed?.limitations ?? []).slice?.(0, limit) ?? [],
    unknowns: (parsed?.unknowns ?? []).slice?.(0, limit) ?? [],
  }
}

const kind = detectKind()
const summary =
  kind === 'har' ? summarizeHar()
    : kind === 'rae' ? summarizeRae()
      : kind === 'js' ? summarizeJs()
        : kind === 'capture' ? summarizeCapture()
          : summarizeGeneric()

if (asJson) {
  console.log(JSON.stringify({ file, ...summary }, null, 2))
  process.exit(0)
}

console.log(`Datei: ${file}`)
console.log(`Erkannt: ${summary.kind}`)
console.log('')

if (summary.kind === 'har') {
  console.log(`Requests:        ${summary.entries}`)
  console.log(`Gruppen:         ${summary.groups}`)
  console.log(`mit Body (req):  ${summary.entriesWithRequestBody}`)
  console.log(`mit Body (resp): ${summary.entriesWithResponseBody}`)
  console.log(`Status:          ${JSON.stringify(summary.statuses)}`)
  console.log(`Inhaltstypen:    ${JSON.stringify(summary.mimeTypes)}`)
  console.log(`Query-Namen:     ${summary.queryParameterNames.join(', ') || '—'}`)
  console.log(`Auth-Header:     ${summary.authHeaderNames.join(', ') || '—'}`)
  console.log('')
  console.log('Häufigste Endpunkte:')
  for (const { group, count } of summary.topGroups) console.log(`  ${String(count).padStart(4)}  ${group}`)
  console.log('')
  console.log(summary.note)
} else if (summary.kind === 'js') {
  console.log(`Sammlungen: ${JSON.stringify(summary.collections)}`)
  console.log(`Module (Auszug): ${summary.moduleSample.join(', ') || '—'}`)
  if (summary.limitations.length) console.log(`Limitations: ${summary.limitations.length}`)
  if (summary.unknowns.length) console.log(`Unknowns: ${summary.unknowns.length}`)
  console.log(`Top-Level: ${summary.topLevelKeys.join(', ')}`)
} else if (summary.kind === 'capture') {
  console.log(`Records:  ${summary.records}`)
  console.log(`Methoden: ${JSON.stringify(summary.methods)}`)
  console.log(`Hosts:    ${JSON.stringify(summary.hosts)}`)
  console.log(summary.note)
} else if (summary.kind === 'rae') {
  console.log(`Status:  ${summary.status}`)
  console.log(`Run-ID:  ${summary.runId ?? '—'}`)
  console.log(`HAR:     ${summary.harPath ?? '—'}`)
  console.log(`Skript:  ${summary.scriptPath ?? '—'}`)
  if (summary.error) console.log(`Fehler:  ${summary.error}`)
} else {
  console.log('Top-Level-Schlüssel:')
  for (const [key, value] of Object.entries(summary.topLevel)) console.log(`  ${key}: ${value}`)
}
