/**
 * zugangs-lage.mjs — Wächter-Werkzeug (Aufsicht/Rolle).
 *
 * WARUM. Der Nachweis „Aufruf gegen den echten Anbieter" (P8.12 im Ziel-Repo) steht auf
 * „kein Schlüssel in dieser Umgebung". Diese Aussage ist prüfbar: jede Harness-Installation
 * liest ihre Referenzen aus `$DSH_HOME/.credentials.yaml`. Dieses Werkzeug vergleicht die
 * Referenz-Namen aller Harness-Homes auf der Maschine und benennt, wo welche Referenz fehlt.
 *
 * GRUNDREGEL. **Kein Geheimwert wird gedruckt.** Zu jeder Referenz erscheinen nur Name und
 * Länge. Zusätzlich wird je Referenz ein SHA-256-Kurzfingerabdruck ausgegeben, damit man
 * zwei Homes vergleichen kann, ohne den Wert zu kennen.
 *
 * Aufruf:
 *   node zugangs-lage.mjs <home1> [<home2> ...]
 *   node zugangs-lage.mjs --pruefen <refName> <home1> [<home2> ...]
 *
 * `--pruefen` ruft zusätzlich je Home einen echten Endpunkt auf und meldet **nur den
 * HTTP-Status** — der Beweis, dass eine Referenz nicht bloß vorhanden, sondern gültig ist.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire('file:///C:/Users/Chang/deepseek-harness/')
const yaml = require('js-yaml')

const args = process.argv.slice(2)
const pruefen = args[0] === '--pruefen'
const refName = pruefen ? args[1] : undefined
const homes = pruefen ? args.slice(2) : args
if (homes.length === 0) throw new Error('usage: node zugangs-lage.mjs [--pruefen <refName>] <home...>')

/** Endpunkte für den Gültigkeitstest: nur lesende Aufrufe, kein Verbrauch. */
const PROBES = {
  DEEPSEEK_API_KEY: { url: 'https://api.deepseek.com/user/balance', auth: 'bearer' },
  OPENROUTER_API_KEY: { url: 'https://openrouter.ai/api/v1/key', auth: 'bearer' },
  ANTHROPIC_API_KEY: { url: 'https://api.anthropic.com/v1/models', auth: 'x-api-key' },
}

function fingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
}

const table = []
for (const home of homes) {
  const path = join(home, '.credentials.yaml')
  if (!existsSync(path)) {
    table.push({ home, path, exists: false, refs: {} })
    continue
  }
  let doc
  try {
    doc = yaml.load(readFileSync(path, 'utf8'))
  } catch (error) {
    table.push({ home, path, exists: true, error: error.message, refs: {} })
    continue
  }
  const refs = {}
  for (const [name, value] of Object.entries(doc?.refs ?? {})) {
    refs[name] = { len: String(value ?? '').length, fp: fingerprint(value) }
  }
  table.push({ home, path, exists: true, bytes: readFileSync(path, 'utf8').length, refs, sections: Object.keys(doc ?? {}) })
}

const allNames = [...new Set(table.flatMap(entry => Object.keys(entry.refs)))].sort()
console.log('=== Zugangslage je Harness-Home (Namen und Längen, keine Werte) ===\n')
for (const entry of table) {
  console.log(`${entry.home}`)
  console.log(`  Datei: ${entry.exists ? `${entry.bytes} B` : 'FEHLT'}` + (entry.error ? ` · NICHT LESBAR: ${entry.error}` : ''))
  if (entry.exists && !entry.error) {
    console.log(`  Sektionen: ${entry.sections.join(', ') || '(leer)'}`)
    console.log(`  Referenzen: ${Object.keys(entry.refs).length}`)
  }
  console.log('')
}

console.log('=== Matrix: Referenz × Home (Länge | Fingerabdruck) ===')
const header = ['Referenz', ...table.map(entry => entry.home.replace('C:\\Users\\Chang\\', '~\\'))]
console.log(header.join(' | '))
for (const name of allNames) {
  const cells = table.map(entry => {
    const ref = entry.refs[name]
    return ref ? `${ref.len} | ${ref.fp}` : 'FEHLT'
  })
  console.log([name, ...cells].join(' | '))
}

if (pruefen && refName !== undefined) {
  const probe = PROBES[refName]
  if (!probe) throw new Error(`kein Prüfendpunkt bekannt für ${refName}`)
  console.log(`\n=== Gültigkeitstest ${refName} (${probe.url}) — nur Statuscode ===`)
  for (const entry of table) {
    const ref = entry.refs[refName]
    if (!ref) {
      console.log(`${entry.home}: keine Referenz — nicht prüfbar`)
      continue
    }
    const doc = yaml.load(readFileSync(entry.path, 'utf8'))
    const value = doc.refs[refName]
    const headers = probe.auth === 'bearer' ? { Authorization: `Bearer ${value}` } : { 'x-api-key': value, 'anthropic-version': '2023-06-01' }
    try {
      const response = await fetch(probe.url, { headers })
      console.log(`${entry.home}: HTTP ${response.status}`)
    } catch (error) {
      console.log(`${entry.home}: Netzfehler ${error.message}`)
    }
  }
}
