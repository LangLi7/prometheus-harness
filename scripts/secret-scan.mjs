/**
 * secret-scan.mjs — der eingebaute Geheimnis-Scanner.
 *
 * ## Warum es diese Datei gibt
 *
 * `scripts/leck-haken.mjs` verläßt sich auf **gitleaks**. Fehlt das Werkzeug,
 * sagt der Haken das ehrlich — und **prüft nichts**. Gemessen am 14.10.2026 war
 * genau das der Zustand, und GitHubs eigener Schutz ist für dieses **private**
 * Repository nicht verfügbar (`HTTP 422 — Secret scanning is not available for
 * this repository`). Es gab also **keine** Schicht, die ein Geheimnis aufgehalten
 * hätte. Diese Datei ist diese Schicht.
 *
 * ## Die Marke mit Begründungspflicht
 *
 * Ein Fund wird **entweder behoben oder markiert** — und eine Marke **muß einen
 * Grund nennen**:
 *
 *     const BEISPIEL = 'postgres://pmh:pmh-dev-only@127.0.0.1:5432/pmh'  // pmh-scan: allow — dokumentiertes Beispiel aus der Testanleitung
 *
 * Eine Marke **ohne** Grund befreit **nicht** (mindestens 12 Zeichen, und nicht
 * bloß „ok"). Und befreite Funde **verschwinden nicht**: sie werden mit ihrer
 * Begründung weiterhin ausgegeben. Eine stille Ausnahmeliste ist genau das, was
 * ein Wächter nicht sein darf — sie ist unsichtbar und wächst.
 *
 * **Warum die Marke auch für die HISTORIE gilt.** Eine Zeilenmarke kann nicht
 * rückwirkend in einem alten Commit stehen. Deshalb sammelt der Scanner die
 * markierten **Werte** aus dem heutigen Baum (Fingerabdruck) und befreit damit
 * auch historische Funde desselben Wertes. Nachvollziehbar bleibt es, weil jede
 * Marke einen geschriebenen Grund trägt und jede Befreiung ausgegeben wird.
 *
 * ## Die Lektion aus dem Fehlalarm
 *
 * `leck-pruefung.mjs` meldete `REDIS_URL` — ein **rein längenbasiertes** Kriterium
 * ohne Blick darauf, ob Zugangsdaten darin stehen. `redis://127.0.0.1:6379` hat
 * keine. Hier gilt deshalb: eine Verbindungszeichenfolge ist nur ein Fund, wenn
 * sie `benutzer:kennwort@` trägt. Der Test hält beide Seiten fest.
 *
 * ## Kein Wert verläßt dieses Programm
 *
 * Gemeldet werden **Art, Ort, Länge und Fingerabdruck** — nie der Wert. Ein
 * Scanner, der Geheimnisse in die CI-Ausgabe schreibt, verbreitet sie.
 *
 * Aufruf:
 *   bun scripts/secret-scan.mjs verlauf        # alle Commits + verfolgte Dateien
 *   bun scripts/secret-scan.mjs gestellt       # nur die gestellten Änderungen
 *   bun scripts/secret-scan.mjs dateien        # nur der heutige Baum
 *   bun scripts/secret-scan.mjs text "<text>"
 *
 * Rückgabewert: 0 = nichts (oder nur Befreites) gefunden, 1 = Fund, 2 = Aufruffehler.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Die Marke. Englisch ist die kanonische Form, die deutsche wird mitgelesen. */
export const MARKE = /pmh-scan:\s*(?:allow|erlaubt)\s*[—–:-]\s*(?<grund>.+)$/u

/** Mindestlänge eines Grundes — `ok` oder `x` ist keine Begründung. */
export const GRUND_MIN = 12

/** Platzhalter und offensichtliche Nicht-Geheimnisse. */
const PLATZHALTER = [
  'bitte-aendern',
  'bitte-ändern',
  'changeme',
  'change-me',
  'placeholder',
  'example',
  'beispiel',
  'dummy',
  'dein-',
  'your-',
  'xxx',
  'TODO',
  'DEINEN',
  '<',
  '…',
  'geheim',
]

/** Verbindungszeichenfolgen **mit** Zugangsdaten (`benutzer:kennwort@`). */
const MIT_ZUGANGSDATEN = /(?:postgres(?:ql)?|redis|mysql|mongodb(?:\+srv)?|amqp|mssql):\/\/[^\s:/@]+:[^\s@/]+@[^\s/]+/gu

/** Muster mit fest bekannten Formen. */
export const MUSTER = [
  { name: 'privater Schluessel', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/gu },
  { name: 'AWS-Zugangsschluessel', re: /\bAKIA[0-9A-Z]{16}\b/gu },
  { name: 'GitHub-Token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/gu },
  { name: 'GitHub-Feintoken', re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/gu },
  { name: 'Google-API-Schluessel', re: /\bAIza[0-9A-Za-z\-_]{35}\b/gu },
  { name: 'OpenAI/DeepSeek-Schluessel', re: /\bsk-[A-Za-z0-9]{24,}\b/gu },
  { name: 'Slack-Token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gu },
  { name: 'JSON-Web-Token', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/gu },
  { name: 'Verbindung mit Zugangsdaten', re: MIT_ZUGANGSDATEN },
]

/** Zuweisungen, deren Wert geprüft wird (`schluessel = wert`). */
const ZUWEISUNG = /(?:passwor[dt]|secret|geheimnis|token|api[_-]?key|apikey|master[_-]?key|hauptschluessel|private[_-]?key|auth)[a-z_]*\s*[:=]\s*['"]([^'"\n]{8,})['"]/giu

/** Ist der Text ein Platzhalter oder offensichtlich kein Geheimnis? */
export function istPlatzhalter(wert) {
  const klein = wert.toLowerCase()
  if (PLATZHALTER.some((p) => klein.includes(p.toLowerCase()))) return true
  if (/^(.)\1+$/u.test(wert)) return true
  if (/^\d+$/u.test(wert)) return true
  return false
}

/**
 * Shannon-Entropie in Bit je Zeichen — eine Schätzung, kein Beweis.
 *
 * @param {string} text - der geprüfte Wert
 * @returns {number} Bit je Zeichen
 */
export function entropie(text) {
  const haeufig = new Map()
  for (const zeichen of text) haeufig.set(zeichen, (haeufig.get(zeichen) ?? 0) + 1)
  let summe = 0
  for (const zahl of haeufig.values()) {
    const p = zahl / text.length
    summe -= p * Math.log2(p)
  }
  return summe
}

/** Sieht der Wert nach einem echten Geheimnis aus? */
export function siehtNachGeheimnisAus(wert) {
  if (wert.length < 20) return false
  if (istPlatzhalter(wert)) return false
  const klassen = [/[A-Z]/u, /[a-z]/u, /[0-9]/u, /[^A-Za-z0-9]/u].filter((r) => r.test(wert)).length
  if (klassen < 3) return false
  return entropie(wert) >= 3.5
}

/** Fingerabdruck — damit gemeldet werden kann, ohne den Wert zu zeigen. */
export function fingerabdruck(wert) {
  return createHash('sha256').update(wert, 'utf8').digest('hex').slice(0, 12)
}

/**
 * Liest die Begründung einer Marke aus einer Zeile.
 *
 * @param {string} zeile - die Quellzeile
 * @returns {string | undefined} der Grund, oder `undefined` wenn keine gültige Marke
 */
export function markenGrund(zeile) {
  const m = MARKE.exec(zeile)
  if (m === null) return undefined
  const grund = (m.groups?.grund ?? '').trim()
  // **Die Begründungspflicht.** Eine zu kurze „Begründung" befreit nicht — sonst
  // wäre die Marke eine stille Ausnahme mit einem Buchstaben daneben.
  if (grund.length < GRUND_MIN) return undefined
  return grund
}

/**
 * Findet Fundstellen in einem Text.
 *
 * @param {string} text - der geprüfte Text
 * @param {string} wo - die Herkunft
 * @param {Set<string>} [befreit] - Fingerabdrücke, die eine Marke tragen
 * @returns {{art: string, wo: string, zeile: number, fp: string, laenge: number, grund?: string}[]} die Funde
 */
export function finde(text, wo, befreit) {
  const funde = []
  const zeilen = text.split('\n')

  for (const [i, zeile] of zeilen.entries()) {
    // Eine Marke in DIESER Zeile befreit die Funde dieser Zeile — mit Grund.
    const grund = markenGrund(zeile)
    const sammle = (art, wert) => {
      const fp = fingerabdruck(wert)
      const eintrag = { art, wo, zeile: i + 1, fp, laenge: wert.length }
      if (grund !== undefined) eintrag.grund = grund
      else if (befreit?.has(fp) === true) eintrag.grund = '(Marke im heutigen Baum)'
      funde.push(eintrag)
    }

    for (const m of MUSTER) {
      m.re.lastIndex = 0
      let treffer
      while ((treffer = m.re.exec(zeile)) !== null) {
        if (istPlatzhalter(treffer[0])) continue
        sammle(m.name, treffer[0])
      }
    }
    ZUWEISUNG.lastIndex = 0
    let zu
    while ((zu = ZUWEISUNG.exec(zeile)) !== null) {
      const wert = zu[1] ?? ''
      if (!siehtNachGeheimnisAus(wert)) continue
      sammle('Zuweisung mit hoher Entropie', wert)
    }
  }
  return funde
}

/** Führt git aus und gibt die Ausgabe zurück (leer bei Fehler). */
function git(argumente, wo) {
  try {
    return execFileSync('git', argumente, { cwd: wo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch {
    return ''
  }
}

/**
 * Sammelt die Fingerabdrücke aller **markierten** Werte im heutigen Baum.
 *
 * Das ist der Grund, warum die Marke auch für die Historie wirkt: ein alter
 * Commit kann die Marke nicht tragen, der Wert ist aber derselbe.
 *
 * @param {string} repo - das Verzeichnis
 * @returns {{befreit: Set<string>, marken: {wo: string, zeile: number, grund: string}[]}} Mengen und Marken
 */
export function markierteWerte(repo) {
  const befreit = new Set()
  const marken = []
  for (const datei of git(['ls-files'], repo).split('\n').filter(Boolean)) {
    let inhalt
    try {
      inhalt = readFileSync(join(repo, datei), 'utf8')
    } catch {
      continue
    }
    for (const [i, zeile] of inhalt.split('\n').entries()) {
      const grund = markenGrund(zeile)
      if (grund === undefined) continue
      marken.push({ wo: datei, zeile: i + 1, grund })
      for (const f of finde(zeile, datei)) befreit.add(f.fp)
    }
  }
  return { befreit, marken }
}

/**
 * Prüft die **gestellten** Änderungen (für den Haken).
 *
 * @param {string} repo - das Verzeichnis
 * @returns {object[]} die Funde
 */
export function pruefeGestellt(repo) {
  const text = git(['diff', '--cached', '--unified=0'], repo)
  if (text.trim() === '') return []
  const zeilen = text
    .split('\n')
    .filter((z) => z.startsWith('+') && !z.startsWith('+++'))
    .map((z) => z.slice(1))
  return finde(zeilen.join('\n'), 'gestellte Aenderung', markierteWerte(repo).befreit)
}

/**
 * Prüft den heutigen Baum (verfolgte Dateien).
 *
 * @param {string} repo - das Verzeichnis
 * @returns {object[]} die Funde
 */
export function pruefeDateien(repo) {
  const funde = []
  for (const datei of git(['ls-files'], repo).split('\n').filter(Boolean)) {
    let inhalt
    try {
      inhalt = readFileSync(join(repo, datei), 'utf8')
    } catch {
      continue
    }
    funde.push(...finde(inhalt, datei))
  }
  return funde
}

/**
 * Prüft jeden Commit (hinzugefügte Zeilen) und die verfolgten Dateien.
 *
 * @param {string} repo - das Verzeichnis
 * @returns {{funde: object[], commits: number}} die Funde und die Zahl der Commits
 */
export function pruefeVerlauf(repo) {
  const { befreit } = markierteWerte(repo)
  const commits = git(['rev-list', '--all'], repo).split('\n').filter(Boolean)
  const funde = []
  for (const commit of commits) {
    const diff = git(['show', '--format=', '--unified=0', commit], repo)
    if (diff.trim() === '') continue
    const zeilen = diff
      .split('\n')
      .filter((z) => z.startsWith('+') && !z.startsWith('+++'))
      .map((z) => z.slice(1))
    funde.push(...finde(zeilen.join('\n'), `Commit ${commit.slice(0, 7)}`, befreit))
  }
  funde.push(...pruefeDateien(repo))
  return { funde, commits: commits.length }
}

/**
 * Gibt die Funde aus — **ohne Werte**, mit Begründung, und nichts wird verschwiegen.
 *
 * @param {object[]} funde - die Funde
 * @param {(text: string) => void} schreibe - die Ausgabe
 * @returns {number} die Zahl der Funde OHNE Begründung
 */
export function berichte(funde, schreibe) {
  const ohne = funde.filter((f) => f.grund === undefined)
  const mit = funde.filter((f) => f.grund !== undefined)

  if (ohne.length > 0) {
    schreibe(`${ohne.length} Fund(e) OHNE Begründung — Werte werden NICHT angezeigt:\n\n`)
    for (const f of ohne) schreibe(`  ${f.art.padEnd(32)} ${f.wo}:${f.zeile}  ${f.fp}  ${f.laenge} Zeichen\n`)
    schreibe('\nJeder Fund wird entweder BEHOBEN oder mit einem Grund markiert:\n')
    schreibe('  // pmh-scan: allow — <Grund, mindestens 12 Zeichen>\n')
  } else {
    schreibe('Kein Fund ohne Begruendung.\n')
  }

  if (mit.length > 0) {
    // **Befreit heißt nicht unsichtbar.** Wer befreit, steht hier mit Grund.
    schreibe(`\nBefreit durch Marke (${mit.length}) — sichtbar, nicht still:\n\n`)
    for (const f of mit) schreibe(`  ${f.fp}  ${f.wo}:${f.zeile}  „${String(f.grund)}"\n`)
  }
  return ohne.length
}

/** Der Einstieg. */
function main() {
  const [modus, ...rest] = process.argv.slice(2)
  const schreibe = (t) => process.stdout.write(t)
  const repo = process.cwd()

  if (modus === 'text') {
    const text = rest.join(' ')
    process.exit(berichte(finde(text, 'Text'), schreibe) === 0 ? 0 : 1)
  }
  if (modus === 'gestellt') {
    process.exit(berichte(pruefeGestellt(repo), schreibe) === 0 ? 0 : 1)
  }
  if (modus === 'dateien') {
    process.exit(berichte(pruefeDateien(repo), schreibe) === 0 ? 0 : 1)
  }
  if (modus === 'verlauf') {
    const { funde, commits } = pruefeVerlauf(repo)
    schreibe(`Geheimnis-Scan ueber ${commits} Commits und alle verfolgten Dateien\n\n`)
    process.exit(berichte(funde, schreibe) === 0 ? 0 : 1)
  }

  schreibe(
    'Aufruf:\n  bun scripts/secret-scan.mjs verlauf\n  bun scripts/secret-scan.mjs gestellt\n  bun scripts/secret-scan.mjs dateien\n  bun scripts/secret-scan.mjs text "<text>"\n',
  )
  process.exit(2)
}

if (process.argv[1]?.replace(/\\/gu, '/').endsWith('secret-scan.mjs')) main()
