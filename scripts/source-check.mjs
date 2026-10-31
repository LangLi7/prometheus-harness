/**
 * `scripts/source-check.mjs` — findet Zeichen im Quelltext, die niemand sieht.
 *
 * ## Warum es diese Datei gibt
 *
 * Am 13.10.2026 standen in `benchmarks/session-open/lauf.mjs` **zwei** Zeichen 12
 * (Seitenvorschub) an der Stelle des `f` in `flushEvery`. Aus dem Namen der
 * Vorgabe wurde `lushEvery` — in einem Kommentar, den jemand liest, um genau
 * diesen Namen zu erfahren. Wer ihn abschreibt, schreibt etwas, das es nicht
 * gibt, und bekommt keine Fehlermeldung.
 *
 * **Gefunden wurde es nicht durch Lesen.** Gelesen sieht die Zeile richtig aus:
 * ein Seitenvorschub hat keine Breite. Gefunden wurde es, weil beim Nachzählen
 * einer Zahl in derselben Datei ein Zeichen **code 12** im Umfeld auftauchte.
 *
 * **Wie es entstehen konnte.** Ein Werkzeug hat den Text geschrieben und `\f` als
 * **Escape** gedeutet statt als zwei Zeichen. Das Ergebnis ist gültiges UTF-8,
 * gültiges Markdown und ein gültiger Kommentar — nur mit einem Steuerzeichen
 * darin. Deshalb ist der Fehler still, und deshalb braucht er einen Zähler.
 *
 * ## Was erlaubt ist und was nicht
 *
 * **Erlaubt** sind genau drei: Tabulator (9), Zeilenumbruch (10) und
 * Wagenrücklauf (13). Sie **strukturieren** den Text; sie mitzuzählen machte die
 * Prüfung auf jeder Datei rot und damit wertlos.
 *
 * **Verboten** ist alles andere unter 32 sowie das Löschzeichen (127) — also
 * Nullbyte, Klingel, Escape, Seitenvorschub, geschütztes Leerzeichen als
 * Steuerzeichen und so weiter. Keines davon gehört in Quelltext.
 *
 * @module scripts/source-check
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/** Wurzel des Projekts, abgeleitet aus dem Modulpfad — nie aus dem Aufrufort. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Die drei Steuerzeichen, die Text strukturieren und deshalb erlaubt sind. */
export const ERLAUBT = new Set([9, 10, 13])

/**
 * Verzeichnisse, die **nicht** durchsucht werden — mit Grund.
 *
 * `node_modules` und `target` sind installiert bzw. erzeugt, `.git` ist die
 * Objektablage, `.pmh-build` ist der Bau- und Laufzeitordner des Projekts,
 * `docs/dsh` und `.github` sind **Kopien fremden Inhalts** (nicht unser Code).
 *
 * **Warum der Website-Zwischenspeicher dazugehört — und wie er auffiel.** Der
 * erste Lauf dieser Prüfung meldete **zwei** Treffer, beide in
 * `website/.vitepress/cache/deps/vitepress___mark__js_src_vanilla__js.js`. Das ist
 * eine **erzeugte** Datei aus einer fremden Bibliothek (mark.js), und die
 * Steuerzeichen darin sind Absicht: sie benutzt `\u0001` und `\u0002` als
 * Trennzeichen in einem regulären Ausdruck. **Fremder, erzeugter Code ist kein
 * Befund gegen unseren Quelltext** — ihn mitzuprüfen machte die Prüfung rot und
 * damit unglaubwürdig. Deshalb ist der Zwischenspeicher ausgenommen; wer ihn
 * mitprüfen will, prüft fremde Software.
 */
export const AUSGENOMMEN = [
  'node_modules',
  'target',
  '.git',
  '.pmh-build',
  '.bun-tmp',
  '.bun-cache',
  'docs/dsh',
  '.github',
  'website/.vitepress/cache',
  'website/.vitepress/dist',
  // **Minifizierte Fremd-Bündel in mitgelieferten Skill-Assets.** `frost.js` ist
  // ein Three.js-Bundle; die Bytes `\u0001` sind dort Trennzeichen in einem
  // Tag-Leser, kein Defekt — derselbe Fall wie mark.js weiter oben. Gemessen am
  // 31.10.2026: zwei Treffer, beide in dieser Datei, beide Absicht.
  '.agents/skills/frost-sequence-camera-orbit/assets',
]

/** Die Dateiendungen, die als Quelltext gelten. */
export const ENDUNGEN = [
  '.ts',
  '.mts',
  '.cts',
  '.mjs',
  '.cjs',
  '.js',
  '.jsx',
  '.tsx',
  '.sql',
  '.json',
  '.jsonl',
  '.yml',
  '.yaml',
  '.md',
  '.go',
  '.rs',
  '.toml',
  '.cmd',
  '.ps1',
  '.sh',
  '.css',
  '.html',
]

/**
 * Ob ein Pfad ausgenommen ist.
 *
 * @param pfad - der zu prüfende Pfad
 * @returns `true`, wenn er übersprungen wird
 */
export function istAusgenommen(pfad) {
  const normal = pfad.split('\\').join('/')
  return AUSGENOMMEN.some((a) => normal.includes(a.split('\\').join('/')))
}

/**
 * Findet verbotene Steuerzeichen in einem Text.
 *
 * **Reine Funktion, damit sie prüfbar ist.** Sie kennt kein Verzeichnis und
 * keinen Prozeß: aus Text werden Treffer. Genau das muß sie sein — eine Prüfung,
 * die nur im Betrieb prüfbar ist, wird nicht geprüft.
 *
 * @param datei - der Dateiname für die Meldung
 * @param text - der Inhalt
 * @returns die Treffer mit Zeile, Zeichencode und Umfeld
 */
export function findeSteuerzeichen(datei, text) {
  const treffer = []
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code >= 32 && code !== 127) continue
    if (ERLAUBT.has(code)) continue
    const zeile = text.slice(0, i).split('\n').length
    treffer.push({
      datei,
      zeile,
      code,
      umfeld: JSON.stringify(text.slice(Math.max(0, i - 30), i + 20)),
    })
  }
  return treffer
}

/**
 * Läuft über den Quelltext des Projekts und sammelt verbotene Steuerzeichen.
 *
 * @param wurzel - die Projektwurzel
 * @returns geprüfte Dateien und gefundene Treffer
 */
export function pruefeQuelltext(wurzel = ROOT) {
  const treffer = []
  let gepruefteDateien = 0

  /** @param dir - das zu durchlaufende Verzeichnis */
  function lauf(dir) {
    for (const eintrag of readdirSync(dir, { withFileTypes: true })) {
      const pfad = join(dir, eintrag.name)
      if (istAusgenommen(pfad)) continue
      if (eintrag.isDirectory()) {
        lauf(pfad)
        continue
      }
      if (!ENDUNGEN.some((e) => eintrag.name.endsWith(e))) continue
      gepruefteDateien += 1
      const text = readFileSync(pfad, 'utf8')
      for (const t of findeSteuerzeichen(relative(wurzel, pfad), text)) treffer.push(t)
    }
  }

  lauf(wurzel)
  return { gepruefteDateien, treffer }
}

// Nur ausführen, wenn dieses Modul **direkt** gerufen wurde — sonst würde ein
// Import aus einer Prüfdatei den ganzen Durchlauf starten.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bericht = pruefeQuelltext()
  process.stdout.write(`Quelltext-Prüfung: ${String(bericht.gepruefteDateien)} Dateien\n`)
  if (bericht.treffer.length === 0) {
    process.stdout.write('Keine verbotenen Steuerzeichen.\n')
  } else {
    for (const t of bericht.treffer) {
      process.stdout.write(`  ${t.datei}:${String(t.zeile)} Zeichen ${String(t.code)} ${t.umfeld}\n`)
    }
    process.stdout.write(`\n${String(bericht.treffer.length)} Treffer.\n`)
    process.exitCode = 1
  }
}
