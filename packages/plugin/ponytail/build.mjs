/**
 * Baut die Browser-Hälfte des Ponytail-Plugins.
 *
 * `bun packages/plugin/ponytail/build.mjs`
 *
 * **Warum ein eigener Bau.** Der Client lädt die Browser-Hälfte als ein Modul, das sein
 * `__ModuleLoader__` auswertet. TypeScript und JSX kann der Browser nicht lesen — also wird
 * gebündelt, in die Hülle gepackt und **danach geprüft**: ein Bündel ohne `apply` oder ohne
 * `slots` in `inject` würde sonst erst im Browser auffallen, als leerer Fleck.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = resolve(dirname(fileURLToPath(import.meta.url)))
const KENNUNG = '@prometheus-harness/ponytail'
const ZIEL = join(DIR, 'lib', 'client.js')

/**
 * Packt das Bündel in die Hülle des `__ModuleLoader__`.
 *
 * @param rumpf - der gebündelte Code
 * @returns das fertige Modul
 */
function umschliesse(rumpf) {
  const eingerueckt = rumpf
    .split('\n')
    .map((zeile) => (zeile.length > 0 ? `\t\t${zeile}` : zeile))
    .join('\n')
  return `/**
 * Browser-Hälfte. ERZEUGT von \`packages/plugin/ponytail/build.mjs\`.
 * Nicht von Hand ändern: die Quelle ist \`packages/plugin/ponytail/src/index.tsx\`.
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
 * Prüft das erzeugte Bündel, ohne Browser.
 *
 * @param text - das erzeugte Bündel
 * @returns die Befunde und die Fehler
 */
function pruefe(text) {
  const fehler = []
  const befund = []
  let erfasst
  const fenster = { __ModuleLoader__: { load: (definition) => (erfasst = definition) } }
  try {
    new Function('window', text)(fenster)
  } catch (f) {
    return { fehler: [`Nicht auswertbar: ${f instanceof Error ? f.message : String(f)}`], befund }
  }
  if (erfasst === undefined) return { fehler: ['Kein __ModuleLoader__.load im Bündel.'], befund }
  if (erfasst.id !== KENNUNG) fehler.push(`Kennung ${JSON.stringify(erfasst.id)} statt ${JSON.stringify(KENNUNG)}.`)
  befund.push(`Kennung: ${String(erfasst.id)}`)
  let plugin
  try {
    plugin = erfasst.factory((name) => ({
      jsx: () => null,
      jsxs: () => null,
      Fragment: null,
      useState: () => [undefined, () => undefined],
      useEffect: () => undefined,
      useRef: () => ({ current: undefined }),
      createElement: () => null,
    }))
  } catch (f) {
    fehler.push(`Fabrik warf: ${f instanceof Error ? f.message : String(f)}`)
    return { fehler, befund }
  }
  if (typeof plugin?.apply !== 'function') fehler.push('apply fehlt.')
  if (!Array.isArray(plugin?.inject)) fehler.push('inject fehlt.')
  else if (!plugin.inject.includes('slots')) fehler.push('inject nennt slots nicht.')
  if (typeof plugin?.PonytailPill !== 'function') fehler.push('PonytailPill fehlt.')
  befund.push(`inject: ${JSON.stringify(plugin?.inject)}`)
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
