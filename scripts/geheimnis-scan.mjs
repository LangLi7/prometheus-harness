/**
 * geheimnis-scan.mjs — der eingebaute Geheimnis-Scanner.
 *
 * ## Warum es diese Datei gibt
 *
 * `scripts/leck-haken.mjs` verläßt sich auf **gitleaks**. Fehlt das Werkzeug,
 * sagt der Haken das ehrlich — und **prüft nichts**. Gemessen am 14.10.2026:
 * genau das war der Zustand, und GitHubs eigener Schutz ist für dieses
 * **private** Repository nicht verfügbar (`HTTP 422 — Secret scanning is not
 * available for this repository`). Es gab also **keine** Schicht, die ein
 * Geheimnis aufgehalten hätte.
 *
 * Diese Datei ist diese Schicht: ein Scanner **ohne** Fremdwerkzeug, der lokal
 * im Haken **und** in der CI über den ganzen Verlauf läuft.
 *
 * ## Was er ist und was nicht
 *
 * Er ist ein **Muster- und Entropie-Prüfer**, kein Ersatz für `gitleaks`.
 * Mustererkennung findet **Formen**; `docs/protokoll/aufsicht/werkzeuge/leck-pruefung.mjs`
 * findet die **echten Werte** aus `.env` gegen jeden Commit — das ist die
 * schärfere Frage, und sie braucht die `.env`, die in der CI nicht existiert.
 * Beide stehen nebeneinander, keiner ersetzt den anderen.
 *
 * ## Die Lektion, die eingebaut ist
 *
 * `leck-pruefung.mjs` meldete `REDIS_URL` als Fund — ein **rein längenbasiertes**
 * Kriterium („ab 16 Zeichen ist ein Geheimnis") ohne Blick darauf, ob überhaupt
 * Zugangsdaten darin stehen. `redis://127.0.0.1:6379` hat **keine**. Hier ist die
 * Regel deshalb **Zugangsdaten im Wert**, nicht Länge allein: eine
 * Verbindungszeichenfolge wird nur gemeldet, wenn sie `benutzer:kennwort@` trägt.
 * Der Test hält diesen Fall ausdrücklich fest.
 *
 * ## Kein Wert verläßt dieses Programm
 *
 * Gemeldet werden **Datei, Zeile, Art und ein Fingerabdruck** — nie der Wert
 * selbst. Ein Scanner, der Geheimnisse in die CI-Ausgabe schreibt, verbreitet sie.
 *
 * Aufruf:
 *   bun scripts/geheimnis-scan.mjs verlauf        # alle Commits + verfolgte Dateien
 *   bun scripts/geheimnis-scan.mjs gestellt       # nur die gestellten Änderungen
 *   bun scripts/geheimnis-scan.mjs text "<text>"  # ein Text (für Prüfungen)
 *
 * Rückgabewert: 0 = nichts gefunden, 1 = Fund (oder Fehler), 2 = nicht meßbar.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

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

/**
 * Verbindungszeichenfolgen **mit** Zugangsdaten.
 *
 * Absichtlich **kein** Treffer ohne `@`: `redis://127.0.0.1:6379` ist keine
 * Zugangsdatenweitergabe, sondern eine Adresse.
 */
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
  // Reine Wiederholung (`aaaa…`) und reine Ziffernfolgen sind keine Geheimnisse.
  if (/^(.)\1+$/u.test(wert)) return true
  if (/^\d+$/u.test(wert)) return true
  return false
}

/**
 * Shannon-Entropie in Bit je Zeichen.
 *
 * Schätzung, kein Beweis: englischer Fließtext liegt bei etwa 4, Zufall aus
 * base64 bei etwa 5 bis 6. Die Schwelle wird deshalb **mit** einer
 * Zeichenklassen-Prüfung kombiniert, statt sich auf sie zu verlassen.
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
  const hatGross = /[A-Z]/u.test(wert)
  const hatKlein = /[a-z]/u.test(wert)
  const hatZahl = /[0-9]/u.test(wert)
  const hatZeichen = /[^A-Za-z0-9]/u.test(wert)
  const klassen = [hatGross, hatKlein, hatZahl, hatZeichen].filter(Boolean).length
  if (klassen < 3) return false
  return entropie(wert) >= 3.5
}

/** Fingerabdruck — damit gemeldet werden kann, ohne den Wert zu zeigen. */
export function fingerabdruck(wert) {
  return createHash('sha256').update(wert, 'utf8').digest('hex').slice(0, 12)
}

/**
 * Findet Fundstellen in einem Text.
 *
 * @param {string} text - der geprüfte Text
 * @param {string} wo - die Herkunft (Datei oder `commit:pfad`)
 * @returns {{art: string, wo: string, zeile: number, fp: string, laenge: number}[]} die Funde
 */
export function finde(text, wo) {
  const funde = []
  const zeilen = text.split('\n')

  for (const [i, zeile] of zeilen.entries()) {
    for (const m of MUSTER) {
      m.re.lastIndex = 0
      let treffer
      while ((treffer = m.re.exec(zeile)) !== null) {
        const wert = treffer[0]
        if (istPlatzhalter(wert)) continue
        funde.push({ art: m.name, wo, zeile: i + 1, fp: fingerabdruck(wert), laenge: wert.length })
      }
    }
    ZUWEISUNG.lastIndex = 0
    let zu
    while ((zu = ZUWEISUNG.exec(zeile)) !== null) {
      const wert = zu[1] ?? ''
      if (!siehtNachGeheimnisAus(wert)) continue
      funde.push({ art: 'Zuweisung mit hoher Entropie', wo, zeile: i + 1, fp: fingerabdruck(wert), laenge: wert.length })
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
 * Prüft die **gestellten** Änderungen (für den Haken).
 *
 * @param {string} repo - das Verzeichnis
 * @returns {{art: string, wo: string, zeile: number, fp: string, laenge: number}[]} die Funde
 */
export function pruefeGestellt(repo) {
  const text = git(['diff', '--cached', '--unified=0'], repo)
  if (text.trim() === '') return []
  // Nur **hinzugefügte** Zeilen: was schon drin war, ist nicht die Frage dieses Hakens.
  const zeilen = text
    .split('\n')
    .filter((z) => z.startsWith('+') && !z.startsWith('+++'))
    .map((z) => z.slice(1))
  return finde(zeilen.join('\n'), 'gestellte Aenderung')
}

/**
 * Prüft jeden Commit (nur hinzugefügte Zeilen) und alle verfolgten Dateien.
 *
 * @param {string} repo - das Verzeichnis
 * @returns {{funde: object[], commits: number}} die Funde und die Zahl der Commits
 */
export function pruefeVerlauf(repo) {
  const commits = git(['rev-list', '--all'], repo).split('\n').filter(Boolean)
  const funde = []
  for (const commit of commits) {
    const diff = git(['show', '--format=', '--unified=0', commit], repo)
    if (diff.trim() === '') continue
    const zeilen = diff
      .split('\n')
      .filter((z) => z.startsWith('+') && !z.startsWith('+++'))
      .map((z) => z.slice(1))
    funde.push(...finde(zeilen.join('\n'), `Commit ${commit.slice(0, 7)}`))
  }
  const dateien = git(['ls-files'], repo).split('\n').filter(Boolean)
  for (const datei of dateien) {
    const inhalt = git(['show', `HEAD:${datei}`], repo)
    if (inhalt === '') continue
    funde.push(...finde(inhalt, datei))
  }
  return { funde, commits: commits.length }
}

/** Gibt die Funde aus — **ohne Werte**. */
export function berichte(funde, schreibe) {
  if (funde.length === 0) {
    schreibe('Keine Auffaelligkeit: kein Muster und keine Zufallszeichenfolge gefunden.\n')
    return
  }
  schreibe(`${funde.length} Fund(e) — Werte werden NICHT angezeigt, nur Fingerabdruecke:\n\n`)
  for (const f of funde) {
    schreibe(`  ${f.art.padEnd(32)} ${f.wo}:${f.zeile}  ${f.fp}  ${f.laenge} Zeichen\n`)
  }
  schreibe('\nEin Fund ist ein Verdacht, kein Beweis. Wer ihn fuer falsch haelt:\n')
  schreibe('erst die Regel pruefen, dann den Eintrag als Platzhalter kennzeichnen.\n')
}

/** Der Einstieg. */
function main() {
  const [modus, ...rest] = process.argv.slice(2)
  const schreibe = (t) => process.stdout.write(t)
  const repo = process.cwd()

  if (modus === 'text') {
    berichte(finde(rest.join(' '), 'Text'), schreibe)
    process.exit(finde(rest.join(' '), 'Text').length === 0 ? 0 : 1)
  }
  if (modus === 'gestellt') {
    const funde = pruefeGestellt(repo)
    berichte(funde, schreibe)
    process.exit(funde.length === 0 ? 0 : 1)
  }
  if (modus === 'verlauf') {
    const { funde, commits } = pruefeVerlauf(repo)
    schreibe(`Geheimnis-Scan ueber ${commits} Commits und alle verfolgten Dateien\n\n`)
    berichte(funde, schreibe)
    process.exit(funde.length === 0 ? 0 : 1)
  }

  schreibe('Aufruf:\n  bun scripts/geheimnis-scan.mjs verlauf\n  bun scripts/geheimnis-scan.mjs gestellt\n  bun scripts/geheimnis-scan.mjs text "<text>"\n')
  process.exit(2)
}

if (process.argv[1]?.replace(/\\/gu, '/').endsWith('geheimnis-scan.mjs')) main()
