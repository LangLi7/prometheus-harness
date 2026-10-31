/**
 * Werkszeug: **die Naht in die Befehlsliste schneiden — und sagen, ob sie sitzt.**
 *
 * ## Warum es dieses Skript gibt
 *
 * Die Palette (`@deepseek-ai/dsh-client-ui-commands`) gibt einem Host-Befehl nur dann ein Zeichen,
 * wenn er in ihrer festen Tabelle steht (`HOST_FACES`, erkannt an der Herkunft). Ein Befehl aus
 * einem Plugin steht dort nicht. Unsere Zeichen liegen deshalb in
 * `@prometheus-harness/client-command-glyphs` — und die Palette muß sie **fragen**.
 *
 * Diese Frage ist eine Zeile, die im Abhängigkeitsbaum fehlt. `bunfig.toml` nennt den Grund, warum
 * hier kein `patches/` liegt: *„billiger als ein Patch im Abhängigkeitsbaum (`patches/` bleibt leer,
 * `patchedDependencies` gibt es nicht)"*. Also kein Patch-Format, sondern ein **Werkzeug**: es
 * schneidet die Naht, prüft sie, und bricht laut, wenn der Abhängigkeitsbaum nicht mehr paßt.
 *
 * ## Was es genau tut
 *
 * Zwei Stellen im ausgelieferten Bündel:
 *
 * 1. **Die Frage** — in `candidates()` bekommt eine Host-Zeile ohne eingebautes Zeichen ihres aus
 *    dem Dienst `pmhCommandGlyphs`.
 * 2. **Der Weg dorthin** — eine Methode `glyphFor(name)`, die den Dienst über den Kontext holt.
 *
 * Beides wird **an Mustern** gesucht (nicht an Zeilennummern) und mit der gefundenen Einrückung
 * neu geschrieben. Findet das Skript ein Muster nicht, schreibt es **nichts** und nennt den
 * Unterschied — ein halb geschnittenes Bündel wäre schlimmer als keins.
 *
 * ## Wann es laufen muß
 *
 * Nach jedem `bun install`, das dieses Paket neu auspackt. Die Prüfung unten (`--pruefen`) ist
 * darum Teil des Baus von `client-command-glyphs`: fehlt die Naht, wird der Bau rot und nennt
 * diesen Befehl.
 *
 * ```powershell
 * bun scripts/client-naht.mjs            # schneiden (oder: schon genäht)
 * bun scripts/client-naht.mjs --pruefen  # nur nachsehen
 * ```
 *
 * @module scripts/client-naht
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Die Wurzel des Projekts — aus dem Modulpfad, nie aus dem Aufrufort. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Das Paket, in das die Naht gehört. */
const PAKET = 'node_modules/@deepseek-ai/dsh-client-ui-commands'

/** Die Datei, in der die Palette ihre Zeilen baut. */
const ZIEL = join(ROOT, PAKET, 'lib', 'client.js')

/** Die Kennung, die eine geschnittene Datei trägt — und an der ein zweiter Lauf sie erkennt. */
const MARKE = 'pmh-naht'

/** Der Dienst, den die Palette fragt (bereitgestellt von client-command-glyphs). */
export const DIENST = 'pmhCommandGlyphs'

/** Der alte Block in `candidates()` — je Zeile ohne Einrückung, damit sie wandern darf. */
const ALT = [
  'for (const c of list) {',
  'seen.add(c.name);',
  'rows.push({',
  'name: c.name,',
  '...builtinRowFace(c, this.t) ?? { description: c.description },',
  '...c.input !== void 0 ? { hint: c.input.hint } : {}',
  '});',
  '}',
]

/** Der neue Block: dieselbe Zeile, nur mit Frage nach dem Zeichen. */
const NEU = [
  'for (const c of list) {',
  'seen.add(c.name);',
  `// ${MARKE}: hat der Kern kein Zeichen für diese Zeile, wird der Dienst gefragt —`,
  `// das Zeichen kommt aus @prometheus-harness/client-command-glyphs.`,
  'const face = builtinRowFace(c, this.t);',
  'const glyph = face?.icon ?? this.glyphFor(c.name);',
  'rows.push({',
  'name: c.name,',
  '...face ?? { description: c.description },',
  '...glyph === void 0 ? {} : { icon: glyph },',
  '...c.input !== void 0 ? { hint: c.input.hint } : {}',
  '});',
  '}',
]

/** Die Methode, die den Dienst holt — sie wird direkt vor `candidates()` eingefügt. */
const METHODE = [
  `/** ${MARKE}: the glyph of a host command the core does not know; undefined keeps the row plain. */`,
  'glyphFor(name) {',
  `return this.ctx.get("${DIENST}")?.for(name);`,
  '}',
  '',
]

/**
 * Zerlegt eine Datei in Zeilen **ohne** Zeilenende.
 *
 * @param text - der Dateiinhalt
 * @returns die Zeilen
 */
function zeilen(text) {
  return text.split('\n').map((zeile) => zeile.replace(/\r$/u, ''))
}

/**
 * Sucht einen Block ab einer Zeile, vergleicht je Zeile ohne Einrückung.
 *
 * @param datei - die Zeilen der Datei
 * @param muster - der gesuchte Block, je Zeile ohne Einrückung
 * @param ab - ab welcher Zeile gesucht wird
 * @returns die Trefferzeile oder `-1`
 */
function finde(datei, muster, ab = 0) {
  for (let i = ab; i + muster.length <= datei.length; i += 1) {
    let passt = true
    for (let j = 0; j < muster.length; j += 1) {
      if ((datei[i + j] ?? '').trim() !== muster[j]) {
        passt = false
        break
      }
    }
    if (passt) return i
  }
  return -1
}

/**
 * Die Einrückung einer Zeile (die führenden Tabulatoren).
 *
 * @param zeile - die Zeile
 * @returns die Einrückung
 */
function einzug(zeile) {
  return /^\t*/u.exec(zeile)?.[0] ?? ''
}

/**
 * Sieht nach, ob die Naht sitzt.
 *
 * @param text - der Inhalt des Bündels
 * @returns die Befunde; leer heißt „sitzt"
 */
export function pruefeNaht(text) {
  const befunde = []
  const datei = zeilen(text)
  const hatFrage = datei.some((zeile) => zeile.includes('this.glyphFor(c.name)'))
  const hatMethode = datei.some((zeile) => zeile.trim() === 'glyphFor(name) {')
  const ruftDienst = datei.some((zeile) => zeile.includes(`this.ctx.get("${DIENST}")`))
  if (!hatMethode) befunde.push(`Die Methode glyphFor fehlt — die Palette kann ${DIENST} nicht fragen.`)
  if (!ruftDienst) befunde.push(`glyphFor holt den Dienst "${DIENST}" nicht aus dem Kontext.`)
  if (!hatFrage) befunde.push('Die Frage in candidates() fehlt — Host-Zeilen bleiben ohne Zeichen.')
  return befunde
}

/**
 * Schneider die Naht — oder sagt, warum nicht.
 *
 * @returns was geschehen ist
 */
export function schneide() {
  if (!existsSync(ZIEL)) {
    return {
      stand: 'fehlt',
      text: `${PAKET} ist nicht installiert (${ZIEL}). Nichts zu schneiden — und ohne das Paket läuft keine Palette.`,
    }
  }

  const vorher = readFileSync(ZIEL, 'utf8')
  const version = JSON.parse(readFileSync(join(ROOT, PAKET, 'package.json'), 'utf8')).version

  if (pruefeNaht(vorher).length === 0) {
    return { stand: 'genaeht', text: `Die Naht sitzt schon (${PAKET} ${String(version)}). Nichts zu tun.` }
  }

  const datei = zeilen(vorher)

  const blockStart = finde(datei, ALT)
  if (blockStart < 0) {
    return {
      stand: 'fremd',
      text:
        `Der Block in candidates() sieht anders aus als erwartet (${PAKET} ${String(version)}).\n` +
        'Geschrieben wurde nichts. Erwartet war:\n' +
        ALT.map((zeile) => `    ${zeile}`).join('\n') +
        '\nVermutlich hat sich das Paket geändert — die Naht muß dann nachgezogen werden ' +
        '(und der Grund, sie zu brauchen, geprüft).',
    }
  }

  const methodenStart = datei.findIndex((zeile) => zeile.trim() === 'async candidates(session, req) {')
  if (methodenStart < 0) {
    return {
      stand: 'fremd',
      text: `candidates() wurde nicht gefunden (${PAKET} ${String(version)}). Geschrieben wurde nichts.`,
    }
  }

  const blockEinzug = einzug(datei[blockStart] ?? '')
  const methodenEinzug = einzug(datei[methodenStart] ?? '')

  const neu = [
    ...datei.slice(0, methodenStart),
    ...METHODE.map((zeile) => (zeile === '' ? '' : `${methodenEinzug}${zeile}`)),
    ...datei.slice(methodenStart, blockStart),
    ...NEU.map((zeile) => `${blockEinzug}${zeile}`),
    ...datei.slice(blockStart + ALT.length),
  ]
  /**
   * **Die Zeilenenden bleiben, wie sie sind.**
   *
   * Das Bündel ist ausgeliefert; ein Werkzeug, das beim Schreiben die Enden wechselt, hinterläßt
   * einen Diff über die ganze Datei — und der nächste Blick sieht eine Änderung, die es nicht gibt.
   */
  const ende = vorher.includes('\r\n') ? '\r\n' : '\n'
  const nachher = neu.join(ende)

  const befunde = pruefeNaht(nachher)
  if (befunde.length > 0) {
    return { stand: 'fremd', text: `Die Naht wäre nicht vollständig:\n${befunde.map((b) => `  - ${b}`).join('\n')}` }
  }

  writeFileSync(ZIEL, nachher, 'utf8')
  return { stand: 'geschnitten', text: `Naht geschnitten in ${PAKET} ${String(version)}.` }
}

if (import.meta.main === true) {
  if (process.argv.includes('--pruefen')) {
    if (!existsSync(ZIEL)) {
      console.log(`${PAKET} ist nicht installiert — die Naht ist damit nicht prüfbar.`)
      process.exit(0)
    }
    const befunde = pruefeNaht(readFileSync(ZIEL, 'utf8'))
    if (befunde.length > 0) {
      console.error('Die Naht fehlt:')
      for (const befund of befunde) console.error(`  - ${befund}`)
      console.error('Abhilfe: bun scripts/client-naht.mjs')
      process.exit(1)
    }
    console.log('Die Naht sitzt.')
    process.exit(0)
  }

  const ergebnis = schneide()
  console.log(ergebnis.text)
  process.exit(ergebnis.stand === 'fremd' ? 1 : 0)
}
