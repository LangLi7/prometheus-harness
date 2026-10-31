/**
 * **Schreibt das App-Zeichen der Welt** — `public/favicon.svg`.
 *
 * ## Warum es dieses Werkzeug gibt
 *
 * Der Browserreiter zeigte bisher **nichts** (kein `<link rel="icon">`, also das Vorgabezeichen des
 * Browsers). Ein Produkt, das sich „moderne Harness" nennt, hat dort seine **Marke** — und die Marke
 * ist die Flamme aus `@prometheus-harness/icons`, dasselbe Zeichen wie in der Kopfzeile.
 *
 * ## Warum es nicht von Hand geschrieben wird
 *
 * Eine von Hand geschriebene `favicon.svg` wäre eine **zweite Zeichnung** derselben Flamme. Beim
 * ersten Umzug der Marke liefen die zwei auseinander, und im Reiter stünde etwas anderes als in der
 * Kopfzeile. Die Datei entsteht deshalb aus **derselben** Quelle wie alles andere
 * (`src/app-icon.ts`), und `tests/favicon.test.ts` prüft, daß sie noch dazu paßt.
 *
 * Aufruf:
 *
 * ```
 * bun tools/write-favicon.mjs            schreiben
 * bun tools/write-favicon.mjs --pruefen  nur vergleichen (Exit 1 bei Abweichung)
 * ```
 *
 * @module tools/write-favicon
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { APP_ICON_FARBE, appIconSvg } from '../src/app-icon.ts'

const ZIEL = join(import.meta.dirname, '..', 'public', 'favicon.svg')
const INHALT = appIconSvg()

if (process.argv.includes('--pruefen')) {
  let vorhanden = null
  try {
    vorhanden = readFileSync(ZIEL, 'utf8')
  } catch {
    console.log(`FEHLER: ${ZIEL} fehlt.`)
    process.exit(1)
  }
  if (vorhanden !== INHALT) {
    console.log(`FEHLER: ${ZIEL} stimmt nicht mit dem Zeichensatz überein.`)
    console.log('        In Ordnung bringen: bun tools/write-favicon.mjs')
    process.exit(1)
  }
  console.log('Geprueft: public/favicon.svg stimmt mit dem Zeichensatz ueberein.')
  process.exit(0)
}

mkdirSync(dirname(ZIEL), { recursive: true })
writeFileSync(ZIEL, INHALT, 'utf8')
console.log(`Geschrieben: ${ZIEL}  (${String(Buffer.byteLength(INHALT))} B, Flamme in ${APP_ICON_FARBE})`)
