/**
 * **Baut die Browser-Hälfte der Ansichten** — und prüft die Form.
 *
 * Der Kern lädt Client-Plugins **nicht** aus dem TypeScript-Quelltext, sondern
 * aus einem gebauten `lib/client.js` im Umschlag des Modulladers. Dieses
 * Werkzeug baut genau eine Datei und legt den Umschlag darum — dasselbe
 * Verfahren wie in `packages/client/world/build.mjs`.
 *
 * Die Prüfung führt das **Gebaute** aus und befragt es: Kennung, `apply`,
 * `inject`, die Panel-Kennung und die drei Bausteine der Adresse (`chatHref`,
 * `parsePfad`, `aliasZiel`). Ein Bündel, das diese Punkte nicht trifft, ist nicht
 * ausgeliefert.
 *
 * ```powershell
 * bun packages/client/tabs/build.mjs
 * ```
 *
 * @module packages/client/tabs/build
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DIR = join(ROOT, 'packages', 'client', 'tabs')
const KENNUNG = '@prometheus-harness/client-tabs'
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
 * Browser-Hälfte. ERZEUGT von \`packages/client/tabs/build.mjs\`.
 * Nicht von Hand ändern: die Quelle ist \`packages/client/tabs/src/index.tsx\`.
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
  else {
    for (const dienst of ['slots', 'locale', 'layout', 'sessions', 'uiWorkspace']) {
      if (!plugin.inject.includes(dienst)) fehler.push(`inject nennt ${dienst} nicht.`)
    }
  }
  if (plugin?.PANEL_ID !== 'workspaces') {
    fehler.push(`PANEL_ID ist ${JSON.stringify(plugin?.PANEL_ID)}, erwartet "workspaces".`)
  }
  if (typeof plugin?.chatHref !== 'function') fehler.push('chatHref fehlt.')
  else if (plugin.chatHref('a b') !== '/c/a%20b') fehler.push(`chatHref('a b') = ${String(plugin.chatHref('a b'))}, erwartet "/c/a%20b".`)
  if (typeof plugin?.parsePfad !== 'function') fehler.push('parsePfad fehlt.')
  else {
    if (plugin.parsePfad('/w').ansicht !== 'uebersicht') fehler.push('parsePfad("/w") zeigt nicht die Übersicht.')
    if (plugin.parsePfad('/c/x').sessionId !== 'x') fehler.push('parsePfad("/c/x") liest die Sitzung nicht.')
    // **Die Wurzel bleibt der Chat** — der Kern stellt dort seine Sitzung wieder her.
    if (plugin.parsePfad('/').sessionId !== null) fehler.push('parsePfad("/") nennt eine Sitzung.')
  }
  // **Der Alias lebt weiter**, sonst verlören alte Lesezeichen ihre Adresse.
  if (typeof plugin?.aliasZiel !== 'function') fehler.push('aliasZiel fehlt.')
  else if (plugin.aliasZiel('?s=x') !== '/c/x') fehler.push(`aliasZiel('?s=x') = ${String(plugin.aliasZiel('?s=x'))}, erwartet "/c/x".`)
  /*
   * **Die Zeile ist ein Link — und der Stil dafür steht im Bündel.**
   *
   * Seit dem 28.10.2026 trägt die Sitzungszeile ein `<a href="/c/…">` (Patch auf
   * `dsh-client-ui-workspace`). Ein Anker bringt die Farbe und den Strich des Browsers mit; beides
   * nimmt die Regel `a[data-row-key^="session:"]` zurück. Fehlt sie im Bündel, sieht die Leiste
   * nach unterstrichenen Links aus.
   */
  if (!text.includes('a[data-row-key^="session:"]')) fehler.push('Die Stilregel für den Zeilen-Anker fehlt im Bündel.')
  // **Kein eigenes Kontextmenü mehr.** Es verdeckte das native Menü, das mit dem Anker endlich
  // „In neuem Tab öffnen" anbietet — der Grund, warum es gebaut worden war, ist entfallen.
  if (text.includes('contextmenu')) fehler.push('Ein contextmenu-Zuhörer steckt noch im Bündel — er verdeckt das native Menü.')
  befund.push(`inject: ${JSON.stringify(plugin?.inject)}`)
  befund.push(`Panel: ${String(plugin?.PANEL_ID)}`)
  befund.push('Adresse: chatHref, parsePfad und aliasZiel geprüft')
  befund.push('Zeile: Stilregel für den Anker im Bündel, kein eigenes Kontextmenü')
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
