/**
 * **Das App-Zeichen im Browserreiter — und sein Zusammenhang mit `index.html`.**
 *
 * **Warum das geprüft wird.** `public/favicon.svg` ist eine **erzeugte** Datei
 * (`tools/write-favicon.mjs`) aus dem Zeichensatz `@prometheus-harness/icons`. Wer die Flamme dort
 * ändert und diese Datei nicht neu schreibt, hat zwei Marken: eine in der Kopfzeile und eine im
 * Reiter. Der Unterschied fällt niemandem auf, bis jemand hinsieht — und im Reiter sieht man ihn
 * kaum.
 *
 * **Und die zweite Aussage: das Zeichen wird überhaupt eingebunden.** Eine tadellose Datei, auf die
 * niemand zeigt, ist keine Marke. Deshalb wird `index.html` **gelesen** und nach dem `<link
 * rel="icon">` gefragt, statt es zu glauben.
 */
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { iconFile } from '@prometheus-harness/icons'
import { APP_ICON_FARBE, appIconSvg } from '../src/app-icon'

const HIER = join(import.meta.dirname, '..')

test('das App-Zeichen stimmt mit dem Zeichensatz überein', () => {
  const datei = readFileSync(join(HIER, 'public', 'favicon.svg'), 'utf8')
  expect(datei).toBe(appIconSvg())
  // Und es ist wirklich die Marke — nicht irgendein Zeichen.
  expect(datei).toContain('<title>Die Flamme mit zwei Zungen')
  // **Mit fester Farbe.** Ein Favicon erbt nichts; mit `currentColor` wäre es schwarz.
  expect(datei).toContain(`stroke="${APP_ICON_FARBE}"`)
  expect(datei).not.toContain('currentColor')
})

test('das Zeichen ist auch wirklich eingebunden', () => {
  const html = readFileSync(join(HIER, 'index.html'), 'utf8')
  expect(html).toContain('<link rel="icon"')
  // **Ein SVG, kein `.ico`.** Das Zeichen ist eine Zeichnung; als Pixelbild müsste man es in fünf
  // Größen ablagen, und jede davon könnte veralten.
  expect(html).toContain('type="image/svg+xml"')
  expect(html).toContain('href="./favicon.svg"')
})

test('dieselbe Datei entsteht auch, wenn man sie aus der Quelle baut', () => {
  // Die Probe dessen, was `tools/write-favicon.mjs` schreibt — ohne die Datei anzufassen.
  expect(iconFile('prometheus', APP_ICON_FARBE)).toBe(appIconSvg())
})
