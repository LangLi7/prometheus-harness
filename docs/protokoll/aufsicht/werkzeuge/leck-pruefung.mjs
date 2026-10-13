/**
 * leck-pruefung.mjs — Wächter-Werkzeug (Aufsicht): steht ein **echter** Geheimwert aus einer
 * Quelle (`.env`, Credential-Speicher) irgendwo in der Git-Historie **oder** im Arbeitsbaum?
 *
 * WARUM KEIN MUSTER-SCANNER. Ein Scanner (`sk-[A-Za-z0-9]{20,}`) findet Platzhalter und echte
 * Werte gleichermaßen und kann „sauber" nicht beweisen. Diese Prüfung ist definitiv: sie liest die
 * **tatsächlichen** Werte, bildet je Wert einen Suchbegriff und lässt `git grep -F -f` laufen.
 * Der Wert selbst wird **nie** gedruckt — nur Name, Länge und ein Fingerabdruck.
 *
 * Drei Orte, weil ein Leck an jedem anfangen kann:
 *   1. **Historie** — `git grep` über **jeden** Commit (`git rev-list --all`). Ein Treffer hier ist
 *      ein Leck: er ist veröffentlicht, auch wenn er später gelöscht wurde.
 *   2. **Arbeitsbaum, verfolgte Dateien** — der Stand, den `git add -A` **jetzt** aufnehmen würde.
 *   3. **Arbeitsbaum, unverfolgte und nicht ignorierte Dateien** — die Kandidaten für das nächste
 *      `git add -A`. Hier ist ein Treffer noch **kein** Leck, sondern eine Warnung.
 *
 * Die Suchbegriffe liegen in einer Datei **außerhalb** des Repositories (Temp) und werden gelöscht.
 *
 * Aufruf:
 *   node leck-pruefung.mjs <repo> [<quelle> …] [--vorlage <pfad>]
 *   node leck-pruefung.mjs C:\Users\Chang\prometheus-harness .env C:\Users\Chang\.dsh\.credentials.yaml
 *
 * **Die Vorlage trennt Geheimnis von veröffentlichtem Standard.** Ein Wert, der **genau so** in
 * `.env.example` steht, ist **kein** Geheimnis — er steht im Repository, das ist sein Zweck
 * (Platzhalter wie `bitte-aendern-…`, oder eine schmucklose `redis://127.0.0.1:6379`). Ohne diese
 * Unterscheidung meldet die Prüfung jeden Standardwert als „Leck" und ist damit wertlos.
 * Ein Treffer für einen **Vorlagenwert** wird darum getrennt gemeldet — als das, was er ist:
 * eine Einstellung, die der Installer **nicht** erneuert hat.
 *
 * Ausgabe: eine Zeile je Wert mit Fingerabdruck und Trefferzahl; danach die Trefferstellen.
 * Rückgabewert: 1, wenn ein **echter** Geheimwert in der Historie oder in verfolgten Dateien steht.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire('file:///C:/Users/Chang/deepseek-harness/')

const roh = process.argv.slice(2)
const vorlageIndex = roh.indexOf('--vorlage')
const vorlagePfad = vorlageIndex === -1 ? undefined : roh[vorlageIndex + 1]
const quellen = vorlageIndex === -1 ? roh.slice(1) : roh.slice(1, vorlageIndex)
const [repo] = roh
if (repo === undefined || quellen.length === 0) {
  throw new Error('usage: node leck-pruefung.mjs <repo> <quelle> [<quelle> …] [--vorlage <pfad>]')
}
for (const q of quellen) if (!existsSync(q)) throw new Error(`Quelle nicht lesbar: ${q}`)
if (vorlagePfad !== undefined && !existsSync(vorlagePfad)) throw new Error(`Vorlage nicht lesbar: ${vorlagePfad}`)

/** Ein Wert ist nur dann ein brauchbarer Suchbegriff, wenn er lang genug und kein Platzhalter ist. */
const PLATZHALTER = /^(<|\{|\(|)$|change|hier|example|beispiel|platzhalter|xxx|todo|dein|your|ersetzen|generiert|leer/i
function istEchterWert(wert) {
  if (typeof wert !== 'string') return false
  if (wert.length < 16) return false
  if (PLATZHALTER.test(wert)) return false
  if (/^[a-z]+(_[a-z]+)*$/.test(wert)) return false // etwa `postgres` oder `pmh_owner`
  return true
}

/** Liest `.env`-Zeilen (`SCHLUESSEL=WERT`) oder einen YAML-Credential-Speicher (`refs:`). */
function liesQuelle(pfad) {
  const inhalt = readFileSync(pfad, 'utf8')
  const werte = []
  if (/^\s*refs\s*:/m.test(inhalt)) {
    const yaml = require('js-yaml')
    const speicher = yaml.load(inhalt)
    for (const [name, wert] of Object.entries(speicher?.refs ?? {})) werte.push({ name, wert })
  } else {
    for (const zeile of inhalt.split(/\r?\n/)) {
      if (/^\s*#/.test(zeile) || zeile.trim() === '') continue
      const treffer = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(zeile)
      if (treffer === null) continue
      werte.push({ name: treffer[1], wert: treffer[2].trim().replace(/^["']|["']$/g, '') })
    }
  }
  return werte
}

const alle = []
const vorlageWerte = new Map()
if (vorlagePfad !== undefined) for (const { name, wert } of liesQuelle(vorlagePfad)) vorlageWerte.set(name, wert)
for (const q of quellen) {
  for (const { name, wert } of liesQuelle(q)) {
    if (!istEchterWert(wert)) continue
    const fp = createHash('sha256').update(wert).digest('hex').slice(0, 12)
    alle.push({
      name,
      wert,
      fp,
      quelle: basename(q),
      laenge: wert.length,
      // Ein Wert, der genau so in der Vorlage steht, ist **veröffentlicht** und damit kein Geheimnis.
      vorlagenwert: vorlageWerte.get(name) === wert,
    })
  }
}

console.log(`Repository : ${repo}`)
console.log(`Quellen    : ${quellen.map((q) => basename(q)).join(', ')}`)
console.log(`Geprüfte echte Werte: ${alle.length} (Länge ≥ 16, ohne Platzhalter)\n`)

const ordner = mkdtempSync(join(tmpdir(), 'aufsicht-leck-'))
const muster = join(ordner, 'muster.txt')
writeFileSync(muster, alle.map((w) => w.wert).join('\n') + '\n', 'utf8')

const revs = execFileSync('git', ['rev-list', '--all'], { cwd: repo, encoding: 'utf8' }).trim().split('\n')
console.log(`Commits in allen Zweigen: ${revs.length}\n`)

/** Trefferstellen je Fingerabdruck sammeln — nie Inhalte. */
const treffer = new Map(alle.map((w) => [w.fp, []]))
function merke(fp, ort) {
  treffer.get(fp).push(ort)
}

// --- 1. Historie -------------------------------------------------------------------------------
for (const rev of revs) {
  let ausgabe = ''
  try {
    ausgabe = execFileSync('git', ['grep', '-I', '-l', '-F', '-f', muster, rev], {
      cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    continue // kein Treffer in diesem Commit
  }
  for (const zeile of ausgabe.split('\n').filter(Boolean)) {
    const doppelpunkt = zeile.indexOf(':')
    const pfad = zeile.slice(doppelpunkt + 1)
    for (const w of alle) if (dateiEnthaelt(repo, rev, pfad, w.wert)) merke(w.fp, `Historie ${rev.slice(0, 7)}  ${pfad}`)
  }
}

/** Prüft genau, **welcher** Wert in einer Datei eines Commits steht (ohne ihn zu drucken). */
function dateiEnthaelt(repoPfad, rev, pfad, wert) {
  try {
    const inhalt = execFileSync('git', ['show', `${rev}:${pfad}`], {
      cwd: repoPfad, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
    })
    return inhalt.includes(wert)
  } catch {
    return false
  }
}

// --- 2. Arbeitsbaum, verfolgte Dateien ----------------------------------------------------------
const verfolgt = execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
for (const pfad of verfolgt) {
  let inhalt = ''
  try {
    inhalt = readFileSync(join(repo, pfad), 'utf8')
  } catch {
    continue // Binärdatei oder nicht lesbar
  }
  for (const w of alle) if (inhalt.includes(w.wert)) merke(w.fp, `verfolgt  ${pfad}`)
}

// --- 3. Arbeitsbaum, unverfolgt und nicht ignoriert ---------------------------------------------
const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: repo, encoding: 'utf8' })
const unverfolgt = status.split('\n').filter((z) => z.startsWith('??')).map((z) => z.slice(3).trim())
for (const pfad of unverfolgt) {
  let inhalt = ''
  try {
    inhalt = readFileSync(join(repo, pfad), 'utf8')
  } catch {
    continue
  }
  for (const w of alle) if (inhalt.includes(w.wert)) merke(w.fp, `UNVERFOLGT ${pfad}`)
}

rmSync(ordner, { recursive: true, force: true })

// --- Bericht ------------------------------------------------------------------------------------
const echte = alle.filter((w) => !w.vorlagenwert)
const vorlagen = alle.filter((w) => w.vorlagenwert)

console.log('Wert                                    Quelle              Länge  Fingerabdruck  Treffer  Art')
console.log('-'.repeat(104))
let historieOderVerfolgt = 0
for (const w of alle) {
  const stellen = treffer.get(w.fp)
  const hart = !w.vorlagenwert && stellen.some((s) => !s.startsWith('UNVERFOLGT'))
  if (hart) historieOderVerfolgt++
  console.log(
    `${w.name.padEnd(38)} ${w.quelle.padEnd(19)} ${String(w.laenge).padStart(5)}  ${w.fp}  ${String(stellen.length).padStart(7)}  ${w.vorlagenwert ? 'Vorlagenwert' : 'Geheimnis'}`,
  )
}

console.log(`\nEchte Geheimwerte: ${echte.length}   Werte mit Vorlageninhalt: ${vorlagen.length}`)

if (vorlagen.length > 0) {
  console.log('\nDiese Werte tragen den Inhalt der Vorlage — sie sind also **im Repository bekannt**:')
  for (const w of vorlagen) {
    const pfade = [...new Set(treffer.get(w.fp).map((s) => s.replace(/^.*?\s\s/, '')))].sort()
    console.log(`  ${w.name} (Länge ${w.laenge}) — der Installer hat ihn **nicht** erneuert`)
    console.log(`      gefunden in: ${pfade.join(', ')}`)
  }
  console.log('  Ein solcher Wert ist **kein** Geheimnis. Ist der Name aber ein Kennwort, ist das Kennwort öffentlich.')
}

const harteEchte = echte.filter((w) => treffer.get(w.fp).some((s) => !s.startsWith('UNVERFOLGT')))
const nurUnverfolgt = echte.filter(
  (w) => !harteEchte.includes(w) && treffer.get(w.fp).some((s) => s.startsWith('UNVERFOLGT')),
)

if (harteEchte.length === 0 && nurUnverfolgt.length === 0) {
  console.log('\nERGEBNIS (Geheimwerte): kein einziger steht in der Historie, in verfolgten Dateien oder')
  console.log('in unverfolgten Dateien. Das ist ein **Negativbeweis** über alle Commits und den Arbeitsbaum.')
} else {
  console.log('\nTrefferstellen der Geheimwerte (ohne Werte):\n')
  for (const w of [...harteEchte, ...nurUnverfolgt]) {
    console.log(`  ${w.name}  [${w.fp}]`)
    for (const s of treffer.get(w.fp)) console.log(`      ${s}`)
  }
  console.log(
    harteEchte.length === 0
      ? '\nERGEBNIS: Treffer nur in **unverfolgten** Dateien — noch kein Leck, aber Kandidaten für das nächste `git add -A`.'
      : `\nERGEBNIS: ⚠ ${harteEchte.length} Geheimwert(e) stehen in der Historie oder in verfolgten Dateien — das ist ein Leck.`,
  )
}

process.exit(historieOderVerfolgt === 0 ? 0 : 1)
