#!/usr/bin/env node
/**
 * Startet Reverse API Engineer mit einem Schlüssel aus dem PMH-Credential-Store.
 *
 *   node rae-run.mjs --prompt "…" --url https://… [--model …] [--sdk claude]
 *                    [--credential ANTHROPIC_API_KEY] [--headless] [--dry-run]
 *
 * Der Schlüssel wird im Prozess aufgelöst und nur als Umgebungsvariable an das
 * Kind übergeben. Er erscheint weder in Argumenten noch in der Ausgabe.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'

const args = process.argv.slice(2)
const options = {
  prompt: undefined,
  url: undefined,
  model: undefined,
  sdk: undefined,
  credential: 'ANTHROPIC_API_KEY',
  headless: false,
  dryRun: false,
  stream: false,
  bin: process.env.RAE_BIN || 'reverse-api-engineer',
  timeoutMs: 900000,
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  const next = () => args[++i]
  switch (arg) {
    case '--prompt': options.prompt = next(); break
    case '--url': options.url = next(); break
    case '--model': options.model = next(); break
    case '--sdk': options.sdk = next(); break
    case '--credential': options.credential = next(); break
    case '--bin': options.bin = next(); break
    case '--timeout': options.timeoutMs = Number.parseInt(next(), 10); break
    case '--headless': options.headless = true; break
    case '--dry-run': options.dryRun = true; break
    case '--stream': options.stream = true; break
    case '--help':
    case '-h':
      console.log('node rae-run.mjs --prompt <text> [--url <url>] [--model m] [--sdk s] [--credential REF] [--headless] [--dry-run]')
      process.exit(0)
    default:
      console.error(`Unbekanntes Argument: ${arg}`)
      process.exit(2)
  }
}

if (!options.prompt) {
  console.error('--prompt fehlt.')
  process.exit(2)
}

function resolveCredential(ref) {
  if (process.env[ref]) return { value: process.env[ref], source: 'environment' }

  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  const file = join(home, '.credentials.yaml')
  if (!existsSync(file)) return { value: undefined, source: 'missing' }

  try {
    const parsed = parse(readFileSync(file, 'utf8'))
    const value = parsed?.refs?.[ref]
    return { value: typeof value === 'string' && value.length > 0 ? value : undefined, source: 'store' }
  } catch {
    return { value: undefined, source: 'unreadable' }
  }
}

const credential = resolveCredential(options.credential)
if (options.sdk === 'claude' || (!options.sdk && options.credential === 'ANTHROPIC_API_KEY')) {
  // Hinweis nur, wenn der erwartete Schlüssel fehlt; kein Wert, keine Dateipfade.
  if (!credential.value) {
    console.error(JSON.stringify({
      warning: 'credential_missing',
      credential: options.credential,
      hint: 'Key mit scripts/rae-key.ps1 speichern oder per Umgebungsvariable setzen.',
    }))
  }
}

const childArgs = ['agent', '--prompt', options.prompt]
if (options.url) childArgs.push('--url', options.url)
if (options.model) childArgs.push('--model', options.model)
if (options.headless) childArgs.push('--headless')
if (options.dryRun) childArgs.push('--dry-run')
childArgs.push(options.stream ? '--json-stream' : '--json')

const env = { ...process.env }
if (options.sdk) env.RAE_SDK = options.sdk
if (credential.value) env[options.credential] = credential.value

const child = spawn(options.bin, childArgs, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })

let stdout = ''
let stderr = ''
child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk })
child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk })

const timer = setTimeout(() => {
  child.kill('SIGTERM')
}, options.timeoutMs)

child.on('error', (error) => {
  clearTimeout(timer)
  console.error(JSON.stringify({ status: 'error', error: error.message, bin: options.bin }))
  process.exit(1)
})

child.on('close', (code) => {
  clearTimeout(timer)

  if (stderr.trim()) process.stderr.write(stderr)

  let text = stdout.trim()
  if (options.stream) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim())
    const resultLine = [...lines].reverse().find((line) => line.includes('"event":"result"')) ?? lines.at(-1)
    text = resultLine ?? ''
  }

  let result
  try {
    result = JSON.parse(text)
  } catch {
    if (text) process.stdout.write(text + '\n')
    process.exit(code ?? 1)
  }

  const summary = {
    status: result.status,
    run_id: result.run_id ?? null,
    mode: result.mode ?? null,
    har_path: result.har_path ?? null,
    script_path: result.script_path ?? null,
    error: result.error ?? null,
    credential_source: credential.source,
    credential_configured: Boolean(credential.value),
    checks: Array.isArray(result.checks) ? result.checks : undefined,
  }
  console.log(JSON.stringify(summary, null, 2))

  if (code !== 0) process.exit(code)
  process.exit(result.status === 'ok' ? 0 : 1)
})
