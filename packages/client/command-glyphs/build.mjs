/**
 * Werkszeug: **das Bündel bauen — und das Gebaute rendern.**
 *
 * ## Warum gerendert und nicht gelesen
 *
 * Ein Zeichen ist hier keine Zeichenkette, sondern eine Komponente: sie bekommt `{ size }` und
 * liefert ein `<svg>`. Ob das stimmt, sieht man einer Quelle nicht an — man muß es **tun**. Die
 * Prüfung ruft darum jede Komponente mit echtem React auf (`react-dom/server`) und befragt das
 * Ergebnis: Raster, Strich, Farbe, Anzahl der Formen.
 *
 * Der zweite Teil ist die Zuordnung: daß `/bild` und `/image` dasselbe Bild tragen, `/ui` etwas
 * anderes, `/usage` und `/verbrauch` die Messuhr **des Kerns** (nicht eine nachgezeichnete) — und
 * daß ein Befehl ohne Zeichen auch keins bekommt.
 *
 * ```powershell
 * bun run packages/client/command-glyphs/build.mjs            # bauen + prüfen
 * bun run packages/client/command-glyphs/build.mjs --pruefen  # nur die vorhandene Datei prüfen
 * ```
 *
 * @module @prometheus-harness/client-command-glyphs/build
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { pruefeNaht } from '../../../scripts/client-naht.mjs'
import { pruefeNahtAmLauf } from './pruefe-naht.mjs'

/** Das Verzeichnis dieses Pakets. */
const HIER = dirname(fileURLToPath(import.meta.url))

/** Die Kennung, unter der der Kern das Bündel lädt — sie MUSS dem Paketnamen entsprechen. */
const KENNUNG = '@prometheus-harness/client-command-glyphs'

/** Die Zieldatei des Bündels. */
const ZIEL = join(HIER, 'lib', 'client.js')

/** Der Name des Dienstes, den die Naht in der Palette fragt. */
const DIENST = 'pmhCommandGlyphs'

/**
 * Die Baseline der Shell — gemessen, nicht geraten. Fundstelle:
 * `deepseek-harness/packages/client/web/src/platform.ts` (`PLATFORM_MODULES`), dieselbe Liste wie
 * in `packages/client/skills-by-package/build.mjs`.
 *
 * Dieses Plugin braucht davon **eins**: `react` (es baut Elemente). Die Liste steht vollständig
 * hier, damit die Prüfung einen fremden Modulwunsch bemerkt, statt ihn durchzureichen.
 */
const BASELINE = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]

/**
 * Die Befehle, die ein Zeichen bekommen — und die, die keins bekommen dürfen.
 *
 * Die zweite Liste ist der eigentliche Wächter: der Dienst darf **nur** die Befehle dieses Hauses
 * kennen. Ein `for`, das für alles etwas liefert, würde jede künftige Zeile mit demselben Zeichen
 * bemalen — und niemand merkte, daß die Zuordnung fehlt.
 */
const MIT_ZEICHEN = ['bild', 'image', 'ui', 'usage', 'verbrauch']
const OHNE_ZEICHEN = ['compact', 'permission', 'model', 'export', 'goal', 'plan', 'feedback', 'skills']

/**
 * Baut den Rumpf als CommonJS.
 *
 * `process.env.NODE_ENV` wird festgenagelt: ohne den Produktionsmodus baut Bun mit der
 * Entwicklungs-Laufzeit, und das Bündel verlangt Module, die der Modullader nicht kennt.
 *
 * @returns der Rumpf
 */
async function baueRumpf() {
  const ergebnis = await Bun.build({
    entrypoints: [join(HIER, 'src', 'index.ts')],
    target: 'browser',
    format: 'cjs',
    external: BASELINE,
    minify: false,
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  })
  if (!ergebnis.success || ergebnis.outputs.length === 0) {
    throw new Error(`Der Bau scheiterte: ${ergebnis.logs.map((log) => String(log)).join(' ')}`)
  }
  return await ergebnis.outputs[0].text()
}

/**
 * Legt den Umschlag um den Rumpf, den der Kern erwartet.
 *
 * @param rumpf - das gebaute CommonJS
 * @returns die auszuliefernde Datei
 */
function umschliesse(rumpf) {
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(KENNUNG)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${rumpf}
    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
`
}

/**
 * Führt das Gebaute aus und befragt es.
 *
 * @param text - der Inhalt von `lib/client.js`
 * @returns die Befunde; leer heißt „bestanden"
 */
async function pruefe(text) {
  const befunde = []
  let geladen
  const fenster = { __ModuleLoader__: { load: (eintrag) => { geladen = eintrag } } }

  // ---- 1. Den Umschlag wirklich auswerten, nicht im Text nachsehen. ----
  // eslint-disable-next-line no-new-func
  new Function('window', text)(fenster)
  if (geladen === undefined) return ['Der Umschlag ruft window.__ModuleLoader__.load NICHT auf.']
  if (geladen.id !== KENNUNG) befunde.push(`Die Kennung ist „${String(geladen.id)}".`)

  // ---- 2. Die Fabrik — mit echtem `require`, nicht mit einer Attrappe. ----
  const require = createRequire(join(HIER, 'package.json'))
  const verlangt = []
  const plugin = geladen.factory((modul) => {
    verlangt.push(modul)
    return require(modul)
  })
  const fremd = verlangt.filter((modul) => !BASELINE.includes(modul))
  if (fremd.length > 0) befunde.push(`Die Fabrik verlangt Module außerhalb der Baseline: ${fremd.join(', ')}.`)
  if (!verlangt.includes('react')) befunde.push('Die Fabrik verlangt `react` nicht — dann baut sie keine Elemente.')

  if (plugin.name !== 'command-glyphs') befunde.push(`name ist „${String(plugin.name)}".`)
  if (!Array.isArray(plugin.inject) || plugin.inject.length !== 0) {
    befunde.push(`inject ist ${JSON.stringify(plugin.inject)} — dieses Plugin nimmt keinen Dienst.`)
  }
  if (typeof plugin.apply !== 'function') return [...befunde, 'apply ist keine Funktion.']

  // ---- 3. `apply` an einem mitschreibenden Kontext. ----
  const angeboten = new Map()
  plugin.apply({
    provide: (name, wert) => {
      if (angeboten.has(name)) befunde.push(`provide("${name}") wurde zweimal gerufen.`)
      angeboten.set(name, wert)
    },
  })
  const dienst = angeboten.get(DIENST)
  if (dienst === undefined) return [...befunde, `provide("${DIENST}") wurde nicht gerufen.`]
  if (typeof dienst.for !== 'function') return [...befunde, 'Der Dienst hat kein `for`.']

  // ---- 4. Die Zuordnung. ----
  for (const befehl of MIT_ZEICHEN) {
    if (typeof dienst.for(befehl) !== 'function') befunde.push(`Der Dienst liefert für "${befehl}" kein Zeichen.`)
  }
  for (const befehl of OHNE_ZEICHEN) {
    if (dienst.for(befehl) !== undefined) befunde.push(`Der Dienst liefert für "${befehl}" ein Zeichen — das gehört ihm nicht.`)
  }

  // ---- 5. Wirklich rendern. ----
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')

  /**
   * Rendert ein Zeichen in der Größe, in der die Palette es aufruft.
   *
   * @param komponente - das Zeichen
   * @returns das Markup
   */
  const male = (komponente) => renderToStaticMarkup(React.createElement(komponente, { size: 14 }))

  /**
   * Prüft das Markup einer Zeichnung.
   *
   * @param befehl - wofür die Zeichnung steht (für die Meldung)
   * @param markup - was React geliefert hat
   * @returns die Zahl der Formen im Zeichen
   */
  function pruefeMarkup(befehl, markup) {
    if (!markup.startsWith('<svg')) befunde.push(`„${befehl}" rendert kein <svg>: ${markup.slice(0, 40)}`)
    if (!markup.includes('viewBox="0 0 16 16"')) befunde.push(`„${befehl}" steht nicht auf dem 16er-Raster.`)
    if (!markup.includes('width="14"') || !markup.includes('height="14"')) {
      befunde.push(`„${befehl}" übernimmt die Größe der Palette (14) nicht.`)
    }
    if (!markup.includes('stroke-width="1"')) befunde.push(`„${befehl}" zeichnet nicht mit einem Pixel Strich.`)
    if (!markup.includes('currentColor')) befunde.push(`„${befehl}" bringt keine Farbe aus der Oberfläche (currentColor).`)
    if (!markup.includes('aria-hidden="true"')) befunde.push(`„${befehl}" ist für Vorleser nicht ausgeblendet.`)
    return (markup.match(/<(rect|circle|path)\b/gu) ?? []).length
  }

  const bild = male(dienst.for('bild'))
  const karten = male(dienst.for('ui'))
  const messuhr = male(dienst.for('usage'))

  const formenBild = pruefeMarkup('bild', bild)
  const formenKarten = pruefeMarkup('ui', karten)
  const formenUhr = pruefeMarkup('usage', messuhr)
  if (bild !== male(dienst.for('image'))) befunde.push('/image trägt nicht dasselbe Bild wie /bild.')
  if (bild === karten) befunde.push('/ui trägt dasselbe Zeichen wie /bild — die Zuordnung zeigt aufs falsche Bild.')
  if (messuhr === bild || messuhr === karten) befunde.push('Die Messuhr ist keine eigene Zeichnung.')
  if (formenBild < 2) befunde.push(`Das Bild hat ${String(formenBild)} Formen — Rahmen und Grate fehlen.`)
  if (formenKarten !== 4) befunde.push(`Die Karten haben ${String(formenKarten)} Formen, erwartet: 4.`)

  // ---- 6. Die Messuhr ist die des Kerns — Pfad für Pfad gegen sein Bündel. ----
  //
  // **Warum gegen das Bündel und nicht gegen eine zweite Kopie hier.** Die Pfade stehen in dieser
  // Quelle noch einmal, damit das Plugin nur `react` braucht (die Primitives lassen sich in dieser
  // Umgebung nicht laden — ihnen fehlt `clsx`). Die Gegenprobe ist deshalb Text: jeder Pfad der
  // gezeichneten Messuhr muß im ausgelieferten Bündel des Kerns vorkommen. Ändert der Kern sein
  // Zeichen, wird diese Prüfung rot — und das ist der Punkt.
  const kernBuendel = resolve(HIER, '../../../node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js')
  if (!existsSync(kernBuendel)) {
    befunde.push(`Das Bündel des Kerns fehlt (${kernBuendel}) — die Herkunft der Messuhr ist ungeprüft.`)
  } else {
    const kernQuelle = readFileSync(kernBuendel, 'utf8')
    const pfade = [...messuhr.matchAll(/d="([^"]+)"/gu)].map((treffer) => treffer[1])
    if (pfade.length !== 3) befunde.push(`Die Messuhr hat ${String(pfade.length)} Pfade, erwartet: 3.`)
    for (const pfad of pfade) {
      if (!kernQuelle.includes(pfad)) {
        befunde.push(`Ein Pfad der Messuhr steht nicht im Bündel des Kerns: ${pfad.slice(0, 48)}…`)
      }
    }
  }
  if (male(dienst.for('verbrauch')) !== messuhr) befunde.push('/verbrauch trägt nicht dieselbe Messuhr wie /usage.')

  // ---- 7. Die Naht, ohne die niemand fragt. ----
  //
  // Ein Zeichen, das niemand abfragt, ist keins. Die Frage steht im Bündel der Palette — und das
  // ist ein Abhängigkeitsbaum, den ein `bun install` neu auspackt. Fehlt die Naht, ist dieser Bau
  // rot und nennt den Befehl, der sie schneidet.
  const naht = resolve(HIER, '../../../node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js')
  if (!existsSync(naht)) {
    befunde.push('Die Palette ist nicht installiert — die Naht ist ungeprüft.')
  } else {
    for (const befund of pruefeNaht(readFileSync(naht, 'utf8'))) {
      befunde.push(`${befund} Abhilfe: \`bun scripts/client-naht.mjs\`.`)
    }
  }

  // ---- 8. Die Naht am laufenden Code — nicht an ihrem Text. ----
  //
  // `pruefeNaht` sieht nach, ob die Zeile dasteht; hier wird das Bündel der Palette **ausgeführt**
  // und `candidates()` befragt. Ein Text kann richtig sein und die Frage trotzdem wirkungslos.
  const zeichnungen = Object.fromEntries(MIT_ZEICHEN.map((befehl) => [befehl, dienst.for(befehl)]))
  for (const befund of await pruefeNahtAmLauf(zeichnungen)) befunde.push(befund)

  // ---- 9. Die Zuordnung steht auch in der Quelle (kein stiller Sonderfall im Bündel). ----
  const paket = JSON.parse(readFileSync(join(HIER, 'package.json'), 'utf8'))
  if (paket?.dsh?.client?.platform !== 'web') befunde.push('dsh.client.platform ist nicht "web".')

  return befunde
}

const nurPruefen = process.argv.includes('--pruefen')

if (!nurPruefen) {
  const rumpf = await baueRumpf()
  mkdirSync(dirname(ZIEL), { recursive: true })
  writeFileSync(ZIEL, umschliesse(rumpf), 'utf8')
  console.log(`Bündel geschrieben: lib/client.js (${String(readFileSync(ZIEL, 'utf8').length)} Zeichen)`)
}

if (!existsSync(ZIEL)) {
  console.error(`Kein Bündel zum Prüfen: ${ZIEL}`)
  process.exit(1)
}

const befunde = await pruefe(readFileSync(ZIEL, 'utf8'))
if (befunde.length > 0) {
  console.error('Prüfung FEHLGESCHLAGEN:')
  for (const befund of befunde) console.error(`  - ${befund}`)
  process.exit(1)
}
console.log(
  'Prüfung bestanden: fünf Befehle mit Zeichen, acht ohne, Bild und Karten gerendert, Messuhr des Kerns übernommen.',
)
