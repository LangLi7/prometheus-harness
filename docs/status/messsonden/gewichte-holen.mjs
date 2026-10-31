/**
 * Lädt Modellgewichte von Hugging Face in einen Zielordner — mit Größen- und
 * Prüfsummenprüfung.
 *
 * Aufruf:
 *   node docs/status/messsonden/gewichte-holen.mjs --repo <repo> --rev <sha> --ziel <ordner> --teil name=sha256=bytes [--teil …]
 *
 * **Warum kein fertiges Werkzeug.** Der Prüfstand hat kein Netzzugriffswerkzeug
 * außer Node; `curl.exe` und `Invoke-WebRequest` sind in dieser Umgebung blockiert
 * (bzw. scheitern an TLS). `node:fetch` geht. Dieses Skript ist das schmale
 * Gegenstück zu `runtime/assets.json` der Vorlage: dieselben Angaben, dieselbe
 * Prüfung, kein Fortschrittsprotokoll.
 */

import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const argv = process.argv.slice(2)

/** Liest einen Schalterwert, z. B. `--repo name`. */
const hole = (name, vorgabe) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : vorgabe
}

/** Sammelt alle `--teil name=sha256=bytes`-Angaben. */
const holeTeile = () =>
  argv.reduce((alle, arg, i) => {
    if (arg !== '--teil') return alle
    const [name, sha256, bytes] = argv[i + 1].split('=')
    return [...alle, { name, sha256, bytes: Number(bytes) }]
  }, [])

/**
 * Rechnet den SHA-256 einer Datei nach.
 *
 * @param {string} pfad - zu prüfende Datei.
 * @param {string} erwartet - erwartete Prüfsumme.
 * @returns {Promise<boolean>} wahr, wenn sie stimmt.
 */
async function pruefe(pfad, erwartet) {
  const hasher = createHash('sha256')
  hasher.update(await readFile(pfad))
  return hasher.digest('hex') === erwartet.toLowerCase()
}

/**
 * Holt eine Datei und benennt sie erst nach bestandener Prüfung um.
 *
 * @param {string} url - Quelle.
 * @param {string} ziel - Zielpfad.
 * @param {number} bytes - erwartete Größe.
 * @param {string} sha256 - erwartete Prüfsumme.
 * @returns {Promise<'vorhanden'|'geholt'>}
 */
async function holeDatei(url, ziel, bytes, sha256) {
  const da = await stat(ziel).catch(() => undefined)
  if (da?.size === bytes && (await pruefe(ziel, sha256))) return 'vorhanden'
  const teil = `${ziel}.teil`
  await mkdir(join(ziel, '..'), { recursive: true })
  const antwort = await fetch(url)
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status} für ${url}`)
  await pipeline(Readable.fromWeb(antwort.body), createWriteStream(teil, { flags: 'w' }))
  const fertig = await stat(teil)
  if (fertig.size !== bytes) {
    await rm(teil, { force: true })
    throw new Error(`${basename(ziel)}: ${fertig.size} B statt ${bytes} B`)
  }
  if (!(await pruefe(teil, sha256))) {
    await rm(teil, { force: true })
    throw new Error(`${basename(ziel)}: Prüfsumme stimmt nicht`)
  }
  await rename(teil, ziel)
  return 'geholt'
}

const repo = hole('repo')
const rev = hole('rev', 'main')
const ziel = hole('ziel')
const teile = holeTeile()
if (!repo || !ziel || teile.length === 0) {
  throw new Error('--repo, --ziel und mindestens ein --teil name=sha256=bytes sind nötig')
}

for (const teil of teile) {
  const ergebnis = await holeDatei(
    `https://huggingface.co/${repo}/resolve/${rev}/${teil.name}`,
    join(ziel, basename(teil.name)),
    teil.bytes,
    teil.sha256,
  )
  console.log(`${teil.name} (${teil.bytes} B) — ${ergebnis}`)
}
