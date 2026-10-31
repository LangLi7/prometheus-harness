/**
 * `scripts/motionclone.mjs` — MotionClone als Werkzeug für Website-Motion nutzen.
 *
 * ## Warum es dieses Skript gibt
 *
 * MotionClone ist kein Skill und keine Bibliothek: eine Python-App mit eigenem
 * HTTP-Server auf `127.0.0.1:4319`, die aus einem Referenzvideo ein **editierbares
 * HyperFrames-Projekt** baut. Genau das ist der Anschluss an Prometheus — der
 * Harness spricht HyperFrames bereits. Ein Fork von `app/ai.py` (der Codex fest
 * aufruft) wäre nötig, um die KI zu ersetzen; für die **Nutzung** reicht die
 * HTTP-API.
 *
 * ## Was es tut
 *
 * ```text
 * bun scripts/motionclone.mjs status
 * bun scripts/motionclone.mjs list
 * bun scripts/motionclone.mjs run <video.mp4> --brand "Meine Marke" --out motion/hero
 * bun scripts/motionclone.mjs run --url https://… --mode hyperframes
 * bun scripts/motionclone.mjs export <job-id> --out motion/hero
 * ```
 *
 * Es lädt hoch, fragt den Fortschritt ab, holt das HyperFrames-ZIP und packt es
 * aus. Der Schreibpfad wird über `safePath` geprüft — ein Archivpfad mit `..`
 * bricht ab, statt aus dem Zielordner auszubrechen.
 *
 * ## Was es voraussetzt
 *
 * - Der Server läuft (`C:\Users\Chang\MotionClone\start.ps1`).
 * - Die App ist mit ChatGPT/Codex verbunden (`codex.cmd login`, dann in der App
 *   „Connect ChatGPT“). `status` zeigt beides.
 * - Ein Job gleichzeitig; die App lehnt einen zweiten mit 409 ab.
 *
 * @module scripts/motionclone
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { extractZip, safePath } from '../packages/skill/skill-marketplace/src/archive.ts'

/** Adresse des lokalen Servers. */
const BASE = (process.env.MOTIONCLONE_URL ?? 'http://127.0.0.1:4319').replace(/\/+$/, '')

/** Wie lange auf einen Job gewartet wird. */
const MAX_WAIT_MS = 30 * 60 * 1000

/** Abstand zwischen zwei Statusabfragen. */
const POLL_MS = 2000

/** Bricht mit einer Meldung auf stderr ab. */
function abbruch(text) {
  process.stderr.write(`motionclone: ${text}\n`)
  process.exit(1)
}

/** Liest `--name wert` und `--schalter`. */
function schalter(argv, name) {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

/** Ob ein Schalter gesetzt ist. */
function gesetzt(argv, name) {
  return argv.includes(name)
}

/** Argumente, die einen Wert tragen; ihr Wert ist kein Positionsargument. */
const WERT_SCHALTER = new Set([
  '--url', '--brand', '--instructions', '--mode', '--accent', '--sampling', '--out',
])

/** Alle freien Argumente (Video, Job-Id) ohne Schalter und deren Werte. */
function positionale(argv) {
  const werte = []
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === undefined) continue
    if (WERT_SCHALTER.has(value)) {
      index += 1
      continue
    }
    if (value.startsWith('--')) continue
    werte.push(value)
  }
  return werte
}

/** Ruft die API auf und liefert JSON oder einen Fehler mit Servermeldung. */
async function api(path, options = {}) {
  let response
  try {
    response = await fetch(`${BASE}${path}`, options)
  } catch (error) {
    abbruch(
      `Server nicht erreichbar unter ${BASE}. Starte MotionClone mit start.ps1. ` +
        `(${error instanceof Error ? error.message : String(error)})`,
    )
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    abbruch(`${path}: HTTP ${response.status} ${text.trim()}`)
  }
  return response
}

/** Status und Konto. */
async function status() {
  const info = await (await api('/api/status')).json()
  let account = undefined
  try {
    account = await (await api('/api/account')).json()
  } catch {
    // Das Konto ist eine Zugabe; der Status genügt für den Start.
  }
  process.stdout.write(`${JSON.stringify({ status: info, account }, undefined, 2)}\n`)
}

/** Die letzten Jobs. */
async function list() {
  const jobs = await (await api('/api/jobs')).json()
  for (const job of Array.isArray(jobs) ? jobs : []) {
    process.stdout.write(`${job.id}\t${job.status}\t${job.progress ?? 0}%\t${job.name ?? ''}\n`)
  }
}

/** Packt ein HyperFrames-ZIP in den Zielordner. */
async function auspacken(bytes, out) {
  const entries = extractZip(Buffer.from(bytes))
  const root = resolve(out)
  let written = 0
  for (const entry of entries) {
    const relative = safePath(entry.path)
    const target = join(root, relative)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, entry.data)
    written += 1
  }
  return { root, written }
}

/** Lädt das HyperFrames-Projekt eines fertigen Jobs. */
async function exportieren(id, out) {
  const response = await api(`/api/jobs/${id}/hyperframes`)
  const bytes = await response.arrayBuffer()
  const { root, written } = await auspacken(bytes, out)
  process.stdout.write(`${root}\n${written} Dateien\n`)
}

/** Startet einen Job und wartet auf das Ergebnis. */
async function run(argv) {
  const video = positionale(argv)[0]
  const url = schalter(argv, '--url')
  if (video === undefined && url === undefined) {
    abbruch('run braucht ein Video oder --url <adresse>.')
  }
  const form = new FormData()
  if (video !== undefined) {
    const bytes = await readFile(video).catch(() => abbruch(`Video nicht lesbar: ${video}`))
    form.append('video', new Blob([bytes]), video.split(/[\\/]/).pop() ?? 'reference.mp4')
  }
  if (url !== undefined) form.append('url', url)
  form.append('brand', schalter(argv, '--brand') ?? '')
  form.append('instructions', schalter(argv, '--instructions') ?? '')
  form.append('mode', schalter(argv, '--mode') ?? 'hyperframes')
  form.append('accent', schalter(argv, '--accent') ?? '#bcf76a')
  form.append('keep_audio', gesetzt(argv, '--no-audio') ? 'false' : 'true')
  form.append('auto_review', gesetzt(argv, '--no-review') ? 'false' : 'true')
  form.append('sampling', schalter(argv, '--sampling') ?? 'standard')

  const job = await (await api('/api/jobs', { method: 'POST', body: form })).json()
  const id = job.id
  process.stderr.write(`motionclone: Job ${id} gestartet (${job.status}).\n`)
  const started = Date.now()
  for (;;) {
    if (Date.now() - started > MAX_WAIT_MS) abbruch(`Job ${id} läuft länger als 30 Minuten.`)
    await new Promise((fertig) => setTimeout(fertig, POLL_MS))
    const current = await (await api(`/api/jobs/${id}`)).json()
    process.stderr.write(`\r${current.status} · ${current.progress ?? 0}% · ${current.stage ?? ''}   `)
    if (current.status === 'complete' || current.status === 'draft') {
      process.stderr.write('\n')
      const out = schalter(argv, '--out') ?? join('motion', id)
      await exportieren(id, out)
      return
    }
    if (current.status === 'error' || current.status === 'cancelled' || current.status === 'interrupted') {
      process.stderr.write('\n')
      abbruch(`Job ${id}: ${current.status} — ${current.error ?? current.stage ?? ''}`)
    }
  }
}

const [command, ...rest] = process.argv.slice(2)
if (command === 'status' || command === undefined) await status()
else if (command === 'list') await list()
else if (command === 'run') await run(rest)
else if (command === 'export') {
  const id = positionale(rest)[0]
  if (id === undefined) abbruch('export braucht eine Job-Id.')
  await exportieren(id, schalter(rest, '--out') ?? join('motion', id))
} else {
  abbruch(`unbekannt: ${command}. Erlaubt: status, list, run, export.`)
}
