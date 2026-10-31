/**
 * `scripts/skill-import.mjs` — fremde Fähigkeitsbäume für den Harness lesbar machen.
 *
 * ## Warum das nötig ist
 *
 * Eine Sammlung wie `SnailSploit/claude-red` ist für Claude Code geschrieben und
 * für den Harness **byte-gleich wertlos**. Drei Unterschiede sind messbar:
 *
 * 1. **Kein Frontmatter.** Der Harness verlangt `---` / YAML / `---` mit `name`
 *    und `description`; die Sammlung schreibt `## Metadata`, `## Description` und
 *    `## Trigger Phrases` als Markdown. Ohne Frontmatter meldet der Anbieter
 *    „fehlendes YAML-Frontmatter" und überspringt die Datei — der Skill liegt da
 *    und ist unsichtbar. Genau dieser Satz steht als Commit `03b9d91` in
 *    `units/skills`.
 * 2. **Verschachtelte Ablage.** Die Sammlung gruppiert nach `Skills/<kategorie>/`;
 *    der Anbieter liest nur `<wurzel>/<name>/SKILL.md` als direktes Kind.
 * 3. **Ausführbare Payloads.** Pentest-Skills zitieren echte Webshells im
 *    Klartext. Windows Defender löscht solche Dateien als
 *    `Backdoor:PHP/Perhetshell.A!dha` — der Skill verschwindet dabei lautlos,
 *    weil ein fehlendes `SKILL.md` nur übersprungen wird.
 *
 * Dieses Werkzeug behebt 1 und 2 durch Übersetzen und meldet 3, statt es zu
 * verstecken: Die Webshell-Zeile bleibt als Beschreibung erkennbar, ihr
 * ausführbarer Kern wird durch einen Kommentar ersetzt.
 *
 * ## Was hier bewusst nicht steht
 *
 * Kein Netzzugriff: gelesen wird nur, was auf der Platte liegt. Kein Urteil über
 * die Qualität einer Sammlung — die trifft `skillspector` beim Installieren.
 *
 * @module scripts/skill-import
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'

/** Kebab-Case, dieselbe Grammatik wie der Skill-Anbieter. */
const GUELTIGER_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Ein Aufruf, der eine Superglobal ausführt — die Signatur einer Webshell.
 *
 * Bewusst eng: `shell_exec('id')` in einer Lehrbuchzeile bleibt stehen, denn das
 * ist keine Hintertür. Erst `system($_GET[…])` macht aus dem Beispiel eine Waffe,
 * die ein Virenscanner zu Recht beanstandet.
 */
const PAYLOAD = /\b(system|shell_exec|passthru|exec|popen|proc_open)\s*\(\s*\$_(?:GET|POST|REQUEST|COOKIE|SERVER)\b[^)]*\)/g

/** Die drei Claude-Blöcke, die im Harness zu Frontmatter werden. */
const CLAUDE_BLOCK = /^##\s+(Metadata|Description|Trigger Phrases)\s*$/i

/** Ein Ressourcenordner, den ein Skill neben seiner `SKILL.md` mitbringt. */
const RESSOURCEN = new Set(['scripts', 'references', 'reference', 'assets', 'templates', 'examples', 'resources'])

/**
 * Entschärft Webshell-Aufrufe in einem Skill-Text.
 *
 * @param {string} text - der vollständige Dateitext
 * @returns {{ text: string, treffer: string[] }} der neue Text und was ersetzt wurde
 */
export function entschaerfe(text) {
  const treffer = []
  const neu = text.replace(PAYLOAD, (ganz, funktion) => {
    treffer.push(ganz.trim())
    return `${funktion}(/* payload removed */)`
  })
  return { text: neu, treffer }
}

/**
 * Liest einen Claude-Skill und übersetzt ihn in die Harness-Form.
 *
 * @param {string} raw - der vollständige Dateitext
 * @param {string} ordner - der Ordnername, aus dem der Rückfallname kommt
 * @returns {{ ok: true, name: string, description: string, whenToUse?: string, body: string }
 *   | { ok: false, grund: string }} das Ergebnis
 */
export function uebersetze(raw, ordner) {
  const vorhanden = liesFrontmatter(raw)
  if (vorhanden !== undefined) {
    const name = gueltigOder(vorhanden.werte.name) ?? waehleName(ordner, '')
    const description = vorhanden.werte.description?.trim()
    if (name === undefined || description === undefined || description === '') {
      return { ok: false, grund: 'Frontmatter ohne gültigen Namen oder ohne Beschreibung' }
    }
    const whenToUse = vorhanden.werte.whenToUse?.trim()
    return {
      ok: true,
      ...(whenToUse === undefined || whenToUse === '' ? {} : { whenToUse }),
      name,
      description,
      body: vorhanden.rumpf.trim(),
    }
  }

  const zeilen = raw.split('\n')
  const bloecke = zerlegeBloecke(zeilen)
  const metadata = bloecke.get('metadata') ?? []
  const beschreibung = bloecke.get('description') ?? []
  const trigger = bloecke.get('trigger phrases') ?? []

  const description = absatz(beschreibung)
  if (description === '') return { ok: false, grund: 'kein Beschreibungsblock' }

  const rohName = feld(metadata, 'Skill Name') ?? ''
  const name = waehleName(ordner, rohName)
  if (name === undefined) return { ok: false, grund: `kein gültiger Name (Ordner "${ordner}", Feld "${rohName}")` }

  const whenToUse = absatz(trigger)
  const body = entferneBloecke(zeilen, bloecke)
  return { ok: true, name, ...(whenToUse === '' ? {} : { whenToUse }), description, body }
}

/**
 * Liest ein vorhandenes YAML-Frontmatter, ohne einen YAML-Parser zu ziehen.
 *
 * Gelesen werden nur die drei Felder, die der Anbieter kennt, und nur als
 * einzeilige Werte. Ein mehrzeiliger YAML-Block (`>` / `|`) ist kein Fehler der
 * Quelle, aber hier nicht abgedeckt — er fällt auf `undefined` und wird gemeldet,
 * statt halb geraten zu werden.
 *
 * @param {string} raw - der vollständige Dateitext
 * @returns {{ werte: Record<string, string>, rumpf: string } | undefined} die Teile
 */
function liesFrontmatter(raw) {
  if (!raw.startsWith('---')) return undefined
  const ende = raw.indexOf('\n---', 3)
  if (ende < 0) return undefined
  const kopf = raw.slice(3, ende)
  const rumpfAb = raw.indexOf('\n', ende + 1)
  const werte = {}
  for (const zeile of kopf.split('\n')) {
    const treffer = /^(name|description|whenToUse):\s*(.*)$/.exec(zeile.trim())
    if (treffer === null) continue
    let wert = treffer[2].trim()
    if (wert.startsWith('"') && wert.endsWith('"') && wert.length > 1) {
      try {
        wert = JSON.parse(wert)
      } catch {
        return undefined
      }
    }
    werte[treffer[1]] = wert
  }
  return { werte, rumpf: rumpfAb < 0 ? '' : raw.slice(rumpfAb + 1) }
}

/**
 * Zerlegt die Datei in die Claude-Blöcke: Überschrift → Inhalt bis zur nächsten `##`.
 *
 * @param {string[]} zeilen
 * @returns {Map<string, string[]>} Blockname (klein) → Zeilen
 */
function zerlegeBloecke(zeilen) {
  const bloecke = new Map()
  let aktuell
  for (const zeile of zeilen) {
    const treffer = /^##\s+(.+?)\s*$/.exec(zeile)
    if (treffer !== null) {
      const name = treffer[1].toLowerCase()
      aktuell = CLAUDE_BLOCK.test(zeile) ? name : undefined
      if (aktuell !== undefined) bloecke.set(aktuell, [])
      continue
    }
    if (aktuell !== undefined) bloecke.get(aktuell).push(zeile)
  }
  return bloecke
}

/** Der erste nicht-leere Absatz eines Blocks, auf eine Zeile gebracht. */
function absatz(zeilen) {
  const teile = []
  for (const zeile of zeilen) {
    const sauber = zeile.trim()
    if (sauber === '') {
      if (teile.length > 0) break
      continue
    }
    teile.push(sauber)
  }
  return teile.join(' ').replace(/\s+/g, ' ').trim()
}

/** Liest `- **Feld**: Wert` aus dem Metadata-Block. */
function feld(zeilen, name) {
  const muster = new RegExp(`^\\s*[-*]\\s*\\*\\*${name}\\*\\*\\s*:\\s*(.+?)\\s*$`, 'i')
  for (const zeile of zeilen) {
    const treffer = muster.exec(zeile)
    if (treffer !== null) return treffer[1]
  }
  return undefined
}

/**
 * Der Name im Katalog ist der Ordnername, solange er gültig ist.
 *
 * Warum nicht das `Skill Name`-Feld: dort steht `xss`, im Katalog heißt der Skill
 * aber `offensive-xss`. Der Ordner ist die genauere Adresse und bleibt stabil,
 * wenn die Quelle ihre Titel ändert.
 */
function waehleName(ordner, rohName) {
  const kandidaten = [ordner, rohName]
  for (const kandidat of kandidaten) {
    const sauber = String(kandidat).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    if (GUELTIGER_NAME.test(sauber)) return sauber
  }
  return undefined
}

/** Ein Name, der die Grammatik des Anbieters schon erfüllt. */
function gueltigOder(kandidat) {
  if (typeof kandidat !== 'string') return undefined
  const sauber = kandidat.trim()
  return GUELTIGER_NAME.test(sauber) ? sauber : undefined
}

/** Entfernt die drei Claude-Blöcke, damit der Rumpf nur noch Inhalt trägt. */
function entferneBloecke(zeilen, bloecke) {
  const raus = new Set()
  let aktuell
  for (const zeile of zeilen) {
    const treffer = /^##\s+(.+?)\s*$/.exec(zeile)
    if (treffer !== null) {
      aktuell = CLAUDE_BLOCK.test(zeile) ? treffer[1].toLowerCase() : undefined
      if (aktuell !== undefined) raus.add(zeile)
      continue
    }
    if (aktuell !== undefined) raus.add(zeile)
  }
  return zeilen.filter((zeile) => !raus.has(zeile)).join('\n').trim()
}

/** Baut die neue Datei: Frontmatter plus Rumpf. */
export function baueDatei({ name, description, whenToUse, body }) {
  const kopf = [
    '---',
    `name: ${name}`,
    `description: ${JSON.stringify(description)}`,
    ...(whenToUse === undefined ? [] : [`whenToUse: ${JSON.stringify(whenToUse)}`]),
    '---',
    '',
  ]
  return `${kopf.join('\n')}${body}\n`
}

/** Alle `SKILL.md` unterhalb einer Wurzel, höchstens vier Ebenen tief. */
export function findeSkills(wurzel, tiefe = 0) {
  const gefunden = []
  let eintraege
  try {
    eintraege = readdirSync(wurzel, { withFileTypes: true })
  } catch {
    return gefunden
  }
  if (eintraege.some((eintrag) => eintrag.isFile() && eintrag.name === 'SKILL.md')) gefunden.push(wurzel)
  for (const eintrag of eintraege) {
    if (!eintrag.isDirectory() || tiefe >= 4) continue
    if (['node_modules', '.git', '.claude-plugin'].includes(eintrag.name)) continue
    gefunden.push(...findeSkills(join(wurzel, eintrag.name), tiefe + 1))
  }
  return gefunden
}

/**
 * Übersetzt eine ganze Sammlung in ein Zielverzeichnis.
 *
 * @param {string} quelle - Wurzel der Sammlung
 * @param {string} ziel - Ablage, in der `<name>/SKILL.md` entsteht
 * @param {{ force?: boolean }} [optionen]
 * @returns {{ importiert: string[], entschaerft: { name: string, treffer: string[] }[],
 *   uebersprungen: { pfad: string, grund: string }[] }} der Bericht
 */
export function importiere(quelle, ziel, optionen = {}) {
  const bericht = { importiert: [], entschaerft: [], uebersprungen: [] }
  for (const ordner of findeSkills(quelle)) {
    const datei = join(ordner, 'SKILL.md')
    const uebersetzt = uebersetze(readFileSync(datei, 'utf8'), basename(ordner))
    if (!uebersetzt.ok) {
      bericht.uebersprungen.push({ pfad: relative(quelle, ordner).split(sep).join('/'), grund: uebersetzt.grund })
      continue
    }
    const zielOrdner = join(ziel, uebersetzt.name)
    if (existsSync(join(zielOrdner, 'SKILL.md')) && optionen.force !== true) {
      bericht.uebersprungen.push({ pfad: relative(quelle, ordner).split(sep).join('/'), grund: `Ziel existiert: ${uebersetzt.name}` })
      continue
    }
    const entschaerft = entschaerfe(uebersetzt.body)
    if (entschaerft.treffer.length > 0) bericht.entschaerft.push({ name: uebersetzt.name, treffer: entschaerft.treffer })
    rmSync(zielOrdner, { recursive: true, force: true })
    mkdirSync(zielOrdner, { recursive: true })
    writeFileSync(join(zielOrdner, 'SKILL.md'), baueDatei({ ...uebersetzt, body: entschaerft.text }), 'utf8')
    for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
      if (!eintrag.isDirectory() || !RESSOURCEN.has(eintrag.name)) continue
      cpSync(join(ordner, eintrag.name), join(zielOrdner, eintrag.name), { recursive: true })
    }
    bericht.importiert.push(uebersetzt.name)
  }
  return bericht
}

/**
 * Verknüpft importierte Skills in eine Katalogwurzel.
 *
 * Der Anbieter liest `<wurzel>/<name>/SKILL.md`; auf Windows ist eine Junction
 * der einzige Weg, ohne die Dateien zu verdoppeln. Vorhandene Einträge bleiben
 * unangetastet — auch solche, die keine Verknüpfung sind.
 *
 * @param {string} ablage - das Verzeichnis mit den Skills
 * @param {string} katalog - die Wurzel, aus der der Anbieter liest
 * @returns {string[]} die neu gesetzten Namen
 */
export function verknuepfe(ablage, katalog) {
  const gesetzt = []
  mkdirSync(katalog, { recursive: true })
  for (const eintrag of readdirSync(ablage, { withFileTypes: true })) {
    if (!eintrag.isDirectory()) continue
    const ziel = join(katalog, eintrag.name)
    if (existsSync(ziel)) continue
    symlinkSync(join(ablage, eintrag.name), ziel, process.platform === 'win32' ? 'junction' : 'dir')
    gesetzt.push(eintrag.name)
  }
  return gesetzt
}

/** Die Kommandozeile: `bun run scripts/skill-import.mjs <quelle> --ziel <dir> [--katalog <dir>]`. */
if (import.meta.main) {
  const argv = process.argv.slice(2)
  const nimm = (name) => {
    const stelle = argv.indexOf(name)
    return stelle < 0 ? undefined : argv[stelle + 1]
  }
  const quellen = argv.filter((wert) => !wert.startsWith('--') && argv[argv.indexOf(wert) - 1]?.startsWith('--') !== true)
  const ziel = nimm('--ziel')
  if (quellen.length === 0 || ziel === undefined) {
    process.stderr.write('Aufruf: bun run scripts/skill-import.mjs <quelle…> --ziel <verzeichnis> [--katalog <verzeichnis>] [--force]\n')
    process.exit(2)
  }
  const gesamt = { importiert: [], entschaerft: [], uebersprungen: [] }
  for (const quelle of quellen) {
    const bericht = importiere(quelle, ziel, { force: argv.includes('--force') })
    gesamt.importiert.push(...bericht.importiert)
    gesamt.entschaerft.push(...bericht.entschaerft)
    gesamt.uebersprungen.push(...bericht.uebersprungen)
  }
  const katalog = nimm('--katalog')
  const verknuepft = katalog === undefined ? [] : verknuepfe(ziel, katalog)
  process.stdout.write(`importiert: ${gesamt.importiert.length}\n`)
  for (const name of gesamt.importiert) process.stdout.write(`  + ${name}\n`)
  if (gesamt.entschaerft.length > 0) {
    process.stdout.write(`entschärfte Payloads: ${gesamt.entschaerft.length}\n`)
    for (const eintrag of gesamt.entschaerft) process.stdout.write(`  ! ${eintrag.name}: ${eintrag.treffer.length} Aufruf(e)\n`)
  }
  if (gesamt.uebersprungen.length > 0) {
    process.stdout.write(`übersprungen: ${gesamt.uebersprungen.length}\n`)
    for (const eintrag of gesamt.uebersprungen) process.stdout.write(`  - ${eintrag.pfad}: ${eintrag.grund}\n`)
  }
  if (verknuepft.length > 0) process.stdout.write(`verknüpft: ${verknuepft.length}\n`)
}
