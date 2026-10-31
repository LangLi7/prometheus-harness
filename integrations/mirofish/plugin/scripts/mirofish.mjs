/**
 * `integrations/mirofish/plugin/scripts/mirofish.mjs` — MiroFish prüfen und füttern.
 *
 * ## Warum dieses Skript existiert
 *
 * MiroFish ist kein Website-Analysator, sondern eine Schwarm-Simulation: Es baut
 * aus Seed-Material einen Persona-Graphen und lässt hunderte Agenten in einer
 * Twitter-/Reddit-Umgebung interagieren. Für Website-Arbeit ist der sinnvolle
 * Einsatz **synthetische Zielgruppe**: Wie reagiert die Zielgruppe auf
 * Versprechen, Preis und Beweise dieser Seite?
 *
 * Das Skript schließt die Lücke zwischen einer Website und diesem Eingang:
 *
 * ```text
 * bun …/mirofish.mjs check --dir C:\Users\Chang\MiroFish
 * bun …/mirofish.mjs seed ./mein-projekt --out mirofish-seed.md
 * bun …/mirofish.mjs seed https://beispiel.ch --out mirofish-seed.md
 * bun …/mirofish.mjs health --dir C:\Users\Chang\MiroFish
 * bun …/mirofish.mjs env-template --dir C:\Users\Chang\MiroFish
 * ```
 *
 * ## Was es nicht tut
 *
 * Es startet keine Simulation und trägt keine Schlüssel ein. Eine Simulation
 * kostet LLM-Tokens und Zep-Kontingent; das bleibt eine bewusste Entscheidung.
 * Das Skript prüft, ob alles bereit ist, und baut das Seed-Dokument.
 *
 * @module integrations/mirofish/scripts/mirofish
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

/** Die erwarteten Schlüssel in `MiroFish/.env`. */
const PFLICHT = ['LLM_API_KEY', 'ZEP_API_KEY']

/** Adressen; überschreibbar, wenn ein Port belegt ist (`FLASK_PORT`). */
const BACKEND = (process.env.MIROFISH_BACKEND_URL ?? 'http://127.0.0.1:5001').replace(/\/+$/, '')
const FRONTEND = (process.env.MIROFISH_FRONTEND_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')

/** Die Verbindung, die MiroFish im Betrieb braucht. */
const DIENSTE = [
  { name: 'Frontend', url: FRONTEND, pfad: '/' },
  { name: 'Backend', url: BACKEND, pfad: '/health' },
]

function abbruch(text) {
  process.stderr.write(`mirofish: ${text}\n`)
  process.exit(1)
}

function schalter(argv, name) {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

function positionale(argv) {
  const werte = []
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === undefined) continue
    if (value.startsWith('--')) {
      index += 1
      continue
    }
    werte.push(value)
  }
  return werte
}

/** Findet das MiroFish-Verzeichnis: `--dir`, `MIROFISH_DIR`, oder übliche Orte. */
function mirofishDir(argv) {
  const explicit = schalter(argv, '--dir') ?? process.env.MIROFISH_DIR
  if (explicit !== undefined && explicit.trim() !== '') return resolve(explicit)
  const kandidaten = [
    resolve('MiroFish'),
    resolve('../MiroFish'),
    'C:\\Users\\Chang\\MiroFish',
  ]
  return kandidaten.find((pfad) => existsSync(join(pfad, 'backend', 'run.py'))) ?? kandidaten[0]
}

/** Ob ein Befehl im PATH liegt. */
function vorhanden(name) {
  if (typeof Bun !== 'undefined' && typeof Bun.which === 'function') return Bun.which(name) !== null
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' })
  return probe.status === 0
}

/** Liest `.env` ohne Werte auszugeben. */
async function leseEnv(dir) {
  const pfad = join(dir, '.env')
  if (!existsSync(pfad)) return undefined
  const text = await readFile(pfad, { encoding: 'utf8' })
  const werte = {}
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (match === null) continue
    werte[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '').trim()
  }
  return werte
}

/** Ob ein Wert gesetzt und kein Platzhalter ist. */
function echt(value) {
  return typeof value === 'string' && value !== '' && !/your_|_here|change_me/i.test(value)
}

/** Prüft, ob eine Adresse antwortet. */
async function erreichbar(url, timeoutMs = 2000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return { ok: response.ok, status: response.status }
  } catch (error) {
    return { ok: false, status: 0, fehler: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Prüft, ob auf 5001 wirklich MiroFish antwortet.
 *
 * **Warum nicht nur `response.ok`.** Port 5001 kann von einem anderen Dienst
 * belegt sein — dann wäre „HTTP 200" ein falsches grünes Häkchen und der Lauf
 * würde gegen den falschen Server gehen. MiroFish antwortet mit
 * `service: "MiroFish Backend"`.
 */
async function istMirofish(url, timeoutMs = 2000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) return { ok: false, status: response.status, fremd: false }
    const data = await response.json().catch(() => undefined)
    const service = typeof data === 'object' && data !== null ? data.service : undefined
    const echt = typeof service === 'string' && service.includes('MiroFish')
    return { ok: echt, status: response.status, fremd: !echt }
  } catch {
    return { ok: false, status: 0, fremd: false }
  }
}

/** Alle Voraussetzungen prüfen. */
async function check(argv) {
  const dir = mirofishDir(argv)
  const zeilen = []
  const blockiert = []

  const python = spawnSync('python', ['--version'], { encoding: 'utf8' })
  const pythonText = `${python.stdout ?? ''}${python.stderr ?? ''}`.trim()
  zeilen.push(`python      ${pythonText || 'fehlt'}${python.status === 0 ? '' : '  ← nötig: 3.11–3.12'}`)
  if (python.status !== 0) blockiert.push('python')

  const node = spawnSync('node', ['--version'], { encoding: 'utf8' })
  zeilen.push(`node        ${(node.stdout ?? '').trim() || 'fehlt'}${node.status === 0 ? '' : '  ← nötig: 18+'}`)
  if (node.status !== 0) blockiert.push('node')

  zeilen.push(`uv          ${vorhanden('uv') ? 'vorhanden' : 'fehlt (oder Docker nutzen)'}`)
  zeilen.push(`docker      ${vorhanden('docker') ? 'vorhanden' : 'fehlt'}`)

  zeilen.push(`MiroFish    ${existsSync(join(dir, 'backend', 'run.py')) ? dir : `${dir}  ← kein backend/run.py`}`)
  if (!existsSync(join(dir, 'backend', 'run.py'))) blockiert.push('MiroFish-Verzeichnis')

  const env = await leseEnv(dir)
  if (env === undefined) {
    zeilen.push('.env        fehlt  ← Vorlage: env-template')
    blockiert.push('.env')
  } else {
    for (const key of PFLICHT) {
      const gesetzt = echt(env[key])
      zeilen.push(`.env ${key.padEnd(12)} ${gesetzt ? 'gesetzt' : 'fehlt/Platzhalter'}`)
      if (!gesetzt) blockiert.push(key)
    }
    zeilen.push(`LLM_BASE_URL ${env.LLM_BASE_URL ?? '(Vorgabe OpenAI)'}`)
    zeilen.push(`LLM_MODEL    ${env.LLM_MODEL_NAME ?? '(Vorgabe gpt-4o-mini)'}`)
  }

  for (const dienst of DIENSTE) {
    if (dienst.name === 'Backend') {
      const stand = await istMirofish(`${dienst.url}${dienst.pfad}`)
      zeilen.push(
        `${dienst.name.padEnd(10)} ${stand.ok ? `${dienst.url}  HTTP ${stand.status}` : stand.fremd ? `${dienst.url}  fremder Dienst (kein MiroFish)` : `${dienst.url}  nicht erreichbar`}`,
      )
      if (!stand.ok) blockiert.push(stand.fremd ? 'Backend-Port fremd belegt' : 'Backend')
      continue
    }
    const stand = await erreichbar(`${dienst.url}${dienst.pfad}`)
    zeilen.push(
      `${dienst.name.padEnd(10)} ${stand.ok ? `${dienst.url}  HTTP ${stand.status}` : `${dienst.url}  nicht erreichbar`}`,
    )
  }

  process.stdout.write(`${zeilen.join('\n')}\n\n`)
  if (blockiert.length > 0) {
    process.stdout.write(`Blockiert: ${blockiert.join(', ')}\n`)
    process.stdout.write('Start: cd <MiroFish> && npm run setup:all && npm run dev\n')
    process.exitCode = 1
    return
  }
  process.stdout.write('Bereit. Start: cd <MiroFish> && npm run dev\n')
}

/** Baut ein Seed-Dossier aus einem Projektordner oder einer URL. */
async function seed(argv) {
  const quelle = positionale(argv)[0]
  if (quelle === undefined) abbruch('seed braucht einen Projektordner oder eine URL.')
  const out = schalter(argv, '--out') ?? 'mirofish-seed.md'

  let titel = quelle
  let text = ''
  if (/^https?:\/\//i.test(quelle)) {
    const response = await fetch(quelle, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) abbruch(`${quelle}: HTTP ${response.status}`)
    const html = await response.text()
    titel = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? quelle
    text = htmlZuText(html)
  } else {
    const root = resolve(quelle)
    const teile = []
    for (const name of ['design.md', 'README.md', 'index.html']) {
      const pfad = join(root, name)
      if (!existsSync(pfad)) continue
      const raw = await readFile(pfad, { encoding: 'utf8' })
      teile.push(`### ${name}\n\n${name.endsWith('.html') ? htmlZuText(raw) : raw}`)
    }
    if (teile.length === 0) abbruch(`keine design.md/README.md/index.html in ${root}`)
    text = teile.join('\n\n')
    titel = root.split(/[\\/]/).pop() ?? root
  }

  const kurz = text.replace(/\n{3,}/g, '\n\n').trim().slice(0, 7000)
  const inhalt = `# Seed — ${titel}

> Erzeugt am ${new Date().toISOString().slice(0, 10)} aus ${quelle}.
> Dieses Dokument ist die Grundlage für eine MiroFish-Simulation. Die mit TODO
> markierten Felder muss der Agent aus dem Projekt ergänzen, bevor die Simulation
> startet — MiroFish leitet Personas und Konflikte daraus ab.

## 1. Produkt und Versprechen

${kurz}

## 2. Zielgruppen (TODO: drei Segmente mit Motivation, Einwand, Sprache)

- Segment A:
- Segment B:
- Segment C:

## 3. Botschaft und Beweise

- Hauptversprechen:
- Beweise (Zahlen, Kunden, Demo):
- Tonalität:

## 4. Preise und Risiko

- Preismodell:
- Größter Einwand gegen den Preis:

## 5. Wettbewerber und Alternativen

- Direkt:
- „Nichts tun" als Alternative:

## 6. Prognosefragen für MiroFish

1. Welchen ersten Eindruck hat die Zielgruppe von dieser Seite — in einem Satz?
2. Welches Versprechen wird geglaubt, welches als Werbung abgetan?
3. Welche Einwände dominieren, und in welcher Reihenfolge tauchen sie auf?
4. Wie wirkt der Preis im Verhältnis zum wahrgenommenen Wert?
5. Welche Botschaft würde sich in einem sozialen Feed verbreiten — und welche nicht?

## 7. Auftrag

Simuliere 120–200 Personas aus den Segmenten oben über 20–30 Runden auf
Twitter und Reddit. Beantworte die sechs Fragen. Gib am Ende drei Änderungen an
der Seite an, die den stärksten Einwand entkräften, und drei, die das Vertrauen
erhöhen. Keine erfundenen Zitate: der Report nennt die Herkunft aus der
Simulation.
`

  await mkdir(dirname(resolve(out)), { recursive: true })
  await writeFile(out, inhalt, { encoding: 'utf8' })
  process.stdout.write(`${resolve(out)}\n${inhalt.length} Zeichen · Quelle: ${quelle}\n`)
}

/** Grobe HTML-zu-Text-Wandlung ohne Abhängigkeit. */
function htmlZuText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Prüft nur die laufenden Dienste. */
async function health() {
  const backend = await istMirofish(`${BACKEND}/health`)
  const frontend = await erreichbar(`${FRONTEND}/`)
  process.stdout.write(
    `Frontend\t${FRONTEND}\t${frontend.ok ? `HTTP ${frontend.status}` : 'nicht erreichbar'}\n`,
  )
  process.stdout.write(
    `Backend\t${BACKEND}\t${backend.ok ? `HTTP ${backend.status}` : backend.fremd ? 'fremder Dienst' : 'nicht erreichbar'}\n`,
  )
}

/** Schreibt eine `.env`-Vorlage, ohne Werte zu erfinden. */
async function envTemplate(argv) {
  const dir = mirofishDir(argv)
  const ziel = join(dir, '.env')
  if (existsSync(ziel)) abbruch(`${ziel} existiert bereits — nicht überschrieben.`)
  const inhalt = `# MiroFish — aus integrations/mirofish erzeugt
# Pflicht: OpenAI-kompatibler LLM-Zugang und Zep Cloud.
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL_NAME=gpt-4o-mini
ZEP_API_KEY=
`
  await writeFile(ziel, inhalt, { encoding: 'utf8' })
  process.stdout.write(`${ziel} angelegt. Werte eintragen, nicht committen.\n`)
}

const [command, ...rest] = process.argv.slice(2)
if (command === 'check' || command === undefined) await check(rest)
else if (command === 'seed') await seed(rest)
else if (command === 'health') await health()
else if (command === 'env-template') await envTemplate(rest)
else if (command === 'urls') {
  process.stdout.write('Frontend http://127.0.0.1:3000\nBackend  http://127.0.0.1:5001/health\n')
} else {
  abbruch(`unbekannt: ${command}. Erlaubt: check, seed, health, env-template, urls.`)
}
