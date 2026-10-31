/**
 * **Baut die Browser-Hälfte der Welt** — und prüft die Form.
 *
 * Der Kern lädt Client-Plugins **nicht** aus dem TypeScript-Quelltext, sondern
 * aus einem gebauten `lib/client.js` im Umschlag des Modulladers. Dieses
 * Werkzeug baut genau eine Datei und legt den Umschlag darum.
 *
 * ```powershell
 * bun packages/client/world/build.mjs
 * ```
 *
 * @module packages/client/world/build
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DIR = join(ROOT, 'packages', 'client', 'world')
const KENNUNG = '@prometheus-harness/client-world'
const ZIEL = join(DIR, 'lib', 'client.js')

/**
 * Der Umschlag des Modulladers.
 *
 * @param {string} rumpf - der gebaute CommonJS-Rumpf
 * @returns {string} die vollständige Datei
 */
function umschliesse(rumpf) {
  const eingerueckt = rumpf
    .split('\n')
    .map((zeile) => (zeile.length > 0 ? `\t\t${zeile}` : zeile))
    .join('\n')
  return `/**
 * Browser-Hälfte. ERZEUGT von \`packages/client/world/build.mjs\`.
 * Nicht von Hand ändern: die Quelle ist \`packages/client/world/src/index.tsx\`.
 */
window.__ModuleLoader__.load({
\tid: ${JSON.stringify(KENNUNG)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${eingerueckt}
\t\treturn module.exports;
\t}
});
`
}

/**
 * Führt das gebaute Bündel aus und befragt die Plugin-Form.
 *
 * @param {string} text - die gebaute Datei
 * @returns {{fehler: string[], befund: string[]}}
 */
function pruefe(text) {
  const fehler = []
  const befund = []
  let erfasst
  const fenster = { __ModuleLoader__: { load: (definition) => (erfasst = definition) } }
  try {
    // eslint-disable-next-line no-new-func
    new Function('window', text)(fenster)
  } catch (f) {
    return { fehler: [`Nicht auswertbar: ${f instanceof Error ? f.message : String(f)}`], befund }
  }
  if (erfasst === undefined) return { fehler: ['Kein __ModuleLoader__.load im Bündel.'], befund }
  if (erfasst.id !== KENNUNG) fehler.push(`Kennung ${JSON.stringify(erfasst.id)} statt ${JSON.stringify(KENNUNG)}.`)
  befund.push(`Kennung: ${String(erfasst.id)}`)
  let plugin
  try {
    plugin = erfasst.factory(() => ({
      jsx: () => null,
      jsxs: () => null,
      Fragment: null,
      useState: () => [undefined, () => undefined],
      useEffect: () => undefined,
      useCallback: (f) => f,
      createElement: () => null,
    }))
  } catch (f) {
    fehler.push(`Fabrik warf: ${f instanceof Error ? f.message : String(f)}`)
    return { fehler, befund }
  }
  if (typeof plugin?.apply !== 'function') fehler.push('apply fehlt.')
  if (!Array.isArray(plugin?.inject)) fehler.push('inject fehlt.')
  else if (!plugin.inject.includes('slots')) fehler.push('inject nennt slots nicht.')
  if (plugin?.PANEL_ID !== 'world') fehler.push(`PANEL_ID ist ${JSON.stringify(plugin?.PANEL_ID)}, erwartet "world".`)
  befund.push(`inject: ${JSON.stringify(plugin?.inject)}`)
  befund.push(`Panel: ${String(plugin?.PANEL_ID)}`)
  return { fehler, befund }
}

const ergebnis = await Bun.build({
  entrypoints: [join(DIR, 'src', 'index.tsx')],
  target: 'browser',
  format: 'cjs',
  jsx: { runtime: 'automatic', importSource: 'react', development: false },
  minify: false,
  sourcemap: false,
  external: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client'],
})
if (!ergebnis.success) {
  console.error('Bau gescheitert:')
  for (const log of ergebnis.logs) console.error(`  ${String(log)}`)
  process.exit(1)
}
const ausgabe = ergebnis.outputs[0]
if (ausgabe === undefined) {
  console.error('Bau lieferte keine Ausgabe.')
  process.exit(1)
}
const text = umschliesse(await ausgabe.text())
mkdirSync(dirname(ZIEL), { recursive: true })
writeFileSync(ZIEL, text, 'utf8')
console.log(`Gebaut: ${ZIEL} (${String(Buffer.byteLength(readFileSync(ZIEL)))} B)`)

const { fehler, befund } = pruefe(text)
console.log('')
console.log('== Befund ==')
for (const zeile of befund) console.log(`  ${zeile}`)
if (fehler.length > 0) {
  console.error('')
  for (const f of fehler) console.error(`FEHLER: ${f}`)
  process.exit(1)
}
console.log('  Form: ok')
