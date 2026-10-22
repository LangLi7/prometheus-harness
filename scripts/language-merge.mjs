/**
 * Der Zusammenlauf der Plugin-Texte ins Sprachpaket.
 *
 * ## Warum es diese Datei gibt
 *
 * Jedes Plugin trägt seine Texte in `locale/de.json` und `locale/en.json`. Damit ist eine Quelle
 * je Plugin da — aber die **Oberfläche** liest über den Namensraum-Speicher des Sprachpakets
 * (`packages/client/locale`). Ohne einen Schritt, der die Plugin-Fächer dorthin bringt, gäbe es
 * zwei Wege zu denselben Wörtern, und der zweite wäre irgendwann veraltet.
 *
 * Dieser Schritt ist bewusst klein: er **sammelt** die Fächer aus den Plugins, **prüft** sie auf
 * gleiche Schlüssel in beiden Sprachen und **schreibt** daraus zwei erzeugte Dateien im
 * Sprachpaket. Das große `de.json` der Kern-Oberfläche bleibt unberührt — es ist 154 KB gewachsen
 * und wird von Hand gepflegt; es bei jedem Lauf neu zu serialisieren hieße, eine riesige
 * Scheinänderung zu erzeugen.
 *
 * ## Warum getrennte Dateien für die Sprachen
 *
 * `de` ist vollständig (jeder Schlüssel hat einen Text). `en` ist im Sprachpaket **nicht** die
 * Aufgabe dieses Pakets: der Kern bringt Englisch mit, und die Rückfallkette endet dort. Die
 * erzeugte `plugins.en.json` enthält deshalb nur die Fächer unserer Plugins — wer sie anmeldet,
 * entscheidet `src/index.ts` des Sprachpakets, nicht dieser Schritt.
 *
 * ## Aufruf
 *
 * ```powershell
 * bun scripts/language-merge.mjs --pruefen   # nur prüfen, nichts schreiben
 * bun scripts/language-merge.mjs             # prüfen und schreiben
 * ```
 *
 * @module scripts/language-merge
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Wo die Plugins liegen, deren Texte zusammengeführt werden. */
const PLUGIN_WURZEL = 'packages/plugin'

/** Das Sprachpaket, das die Fächer aufnimmt. */
const ZIEL = 'packages/client/locale'

/** Die Sprachen, die je Fach geprüft werden. `de` ist Pflicht, `en` muß dieselben Schlüssel haben. */
const SPRACHEN = ['de', 'en']

/**
 * Liest einen JSON-Bestand und bricht mit einer lesbaren Meldung ab, wenn er kaputt ist.
 *
 * @param pfad - die Datei
 * @returns der gelesene Inhalt
 */
function lies(pfad) {
  try {
    return JSON.parse(readFileSync(pfad, 'utf8'))
  } catch (fehler) {
    throw new Error(`${pfad}: kein gültiges JSON — ${fehler instanceof Error ? fehler.message : String(fehler)}`)
  }
}

/**
 * Zieht die Fächer aus einer Datei — alles außer `meta` und den reservierten `_`-Angaben.
 *
 * @param bestand - der gelesene Inhalt einer `locale/*.json`
 * @returns die Namensräume mit ihrem Wörterbuch
 */
function faecher(bestand) {
  const raus = {}
  for (const [name, wert] of Object.entries(bestand ?? {})) {
    if (name === 'meta' || name.startsWith('_')) continue
    if (wert === null || typeof wert !== 'object' || Array.isArray(wert)) continue
    const woerter = {}
    let brauchbar = true
    for (const [schluessel, text] of Object.entries(wert)) {
      if (typeof text !== 'string') {
        brauchbar = false
        break
      }
      woerter[schluessel] = text
    }
    if (brauchbar) raus[name] = woerter
  }
  return raus
}

/**
 * Sammelt die Fächer aller Plugins je Sprache.
 *
 * @returns je Sprache ein Verzeichnis `Namensraum → Wörterbuch`, dazu die Herkunft je Fach
 */
function sammle() {
  const gesammelt = Object.fromEntries(SPRACHEN.map((sprache) => [sprache, {}]))
  const herkunft = {}
  const pakete = readdirSync(PLUGIN_WURZEL).filter((name) => {
    try {
      return statSync(join(PLUGIN_WURZEL, name, 'locale')).isDirectory()
    } catch {
      return false
    }
  })
  for (const paket of pakete) {
    for (const sprache of SPRACHEN) {
      const pfad = join(PLUGIN_WURZEL, paket, 'locale', `${sprache}.json`)
      let bestand
      try {
        bestand = lies(pfad)
      } catch {
        continue
      }
      for (const [namensraum, woerter] of Object.entries(faecher(bestand))) {
        const vorher = herkunft[namensraum]
        if (vorher !== undefined && vorher !== paket) {
          throw new Error(
            `Namensraum „${namensraum}" steht in zwei Plugins (${vorher} und ${paket}) — ein Fach hat einen Eigentümer.`,
          )
        }
        herkunft[namensraum] = paket
        gesammelt[sprache][namensraum] = woerter
      }
    }
  }
  return { gesammelt, herkunft }
}

/**
 * Prüft, daß beide Sprachen je Fach dieselben Schlüssel haben.
 *
 * @param gesammelt - was {@link sammle} geliefert hat
 * @returns die Befunde; leer heißt in Ordnung
 */
function pruefeSchluessel(gesammelt) {
  const befunde = []
  for (const [namensraum, de] of Object.entries(gesammelt.de)) {
    const en = gesammelt.en[namensraum] ?? {}
    for (const schluessel of Object.keys(de)) {
      if (!(schluessel in en)) befunde.push(`${namensraum}.${schluessel}: fehlt in en.json`)
    }
    for (const schluessel of Object.keys(en)) {
      if (!(schluessel in de)) befunde.push(`${namensraum}.${schluessel}: fehlt in de.json`)
    }
  }
  for (const namensraum of Object.keys(gesammelt.en)) {
    if (!(namensraum in gesammelt.de)) befunde.push(`${namensraum}: Fach nur in en.json`)
  }
  return befunde
}

/**
 * Ordnet Fächer und Schlüssel — damit zwei Läufe vergleichbar sind und die Driftprüfung etwas
 * aussagt.
 *
 * @param inhalt - `Namensraum → Wörterbuch`
 * @returns dasselbe, sortiert
 */
function sortiert(inhalt) {
  const geordnet = {}
  for (const namensraum of Object.keys(inhalt).sort()) {
    geordnet[namensraum] = Object.fromEntries(
      Object.entries(inhalt[namensraum]).sort(([a], [b]) => a.localeCompare(b)),
    )
  }
  return geordnet
}

/**
 * Schreibt eine erzeugte Datei — mit stabiler Schlüsselordnung, damit der Vergleich zweier Läufe
 * etwas aussagt.
 *
 * @param pfad - das Ziel
 * @param inhalt - das Objekt
 */
function schreibe(pfad, inhalt) {
  writeFileSync(pfad, `${JSON.stringify(sortiert(inhalt), null, 2)}\n`, 'utf8')
}

const nurPruefen = process.argv.includes('--pruefen')
const { gesammelt, herkunft } = sammle()
const befunde = pruefeSchluessel(gesammelt)

const namensraeume = Object.keys(gesammelt.de).sort()
console.log(`Fächer aus ${PLUGIN_WURZEL}: ${String(namensraeume.length)}`)
for (const namensraum of namensraeume) {
  const zahl = Object.keys(gesammelt.de[namensraum]).length
  console.log(`  ${namensraum.padEnd(20)} ${String(zahl).padStart(4)} Texte   (${herkunft[namensraum]})`)
}

if (befunde.length > 0) {
  console.error(`\n${String(befunde.length)} Befund(e):`)
  for (const befund of befunde) console.error(`  ! ${befund}`)
  process.exit(1)
}

if (nurPruefen) {
  /*
   * **Auch die Drift wird geprüft.** Ein Lauf, der nur die Schlüssel vergleicht, wäre zufrieden,
   * wenn ein Text im Plugin geändert und das Sprachpaket nie neu geschrieben wurde — die Anzeige
   * zeigte dann den alten Satz, und niemand sähe einen Fehler. Verglichen wird der **Inhalt**, den
   * ein Lauf schreiben würde, mit dem, was dasteht.
   */
  const abweichend = SPRACHEN.filter((sprache) => {
    const pfad = join(ZIEL, `plugins.${sprache}.json`)
    try {
      const vorhanden = JSON.stringify(sortiert(JSON.parse(readFileSync(pfad, 'utf8'))))
      return vorhanden !== JSON.stringify(sortiert(gesammelt[sprache]))
    } catch {
      return true
    }
  })
  if (abweichend.length > 0) {
    console.error(
      `\n${abweichend.join(', ')}: ${join(ZIEL, 'plugins.*.json')} ist nicht auf dem Stand der Plugin-Dateien` +
        ' — `bun scripts/language-merge.mjs` laufen lassen.',
    )
    process.exit(1)
  }
  console.log('\nGeprüft: Schlüssel vollständig, Sprachpaket auf dem Stand. Nichts geschrieben.')
  process.exit(0)
}

schreibe(join(ZIEL, 'plugins.de.json'), gesammelt.de)
schreibe(join(ZIEL, 'plugins.en.json'), gesammelt.en)
console.log(`\nGeschrieben: ${join(ZIEL, 'plugins.de.json')}, ${join(ZIEL, 'plugins.en.json')}`)
