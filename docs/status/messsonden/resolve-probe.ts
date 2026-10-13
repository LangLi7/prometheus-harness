/**
 * Messsonde: welches Paket löst die Laufzeit für `@deepseek-ai/dsh-llm` auf?
 *
 * Hintergrund: unter Windows nativ deaktiviert der Boot 27 Profil-Einträge mit
 * „@deepseek-ai/dsh-llm@0.1.1-rc.2 is incompatible", unter WSL2 keinen einzigen.
 * Im Baum liegt laut `bun pm ls` nur 0.2.1-alpha.2. Diese Sonde misst, welchen
 * Ordner jede Auflösungsart tatsächlich findet — geraten wird hier nichts.
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const BUNDLE = 'C:/Users/Chang/prometheus-harness/node_modules/@deepseek-ai/dsh-base/lib/index.js'
const BARE = '@deepseek-ai/dsh-llm'

function versionOf(manifestPath: string): string {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string; version?: string }
    return `${manifest.name ?? '?'}@${manifest.version ?? '?'}`
  } catch (cause) {
    return `unlesbar: ${String(cause)}`
  }
}

console.log('Bun:', Bun.version, '| Plattform:', process.platform)
console.log('Anker:', BUNDLE)
console.log('gesucht:', BARE)
console.log('')

// 1. Node-Auflösungskette, wie sie `manifestOf` im Ausweichzweig benutzt.
const req = createRequire(pathToFileURL(BUNDLE).href)
const paths = req.resolve.paths(BARE) ?? []
console.log(`1. createRequire(...).resolve.paths("${BARE}") → ${paths.length} Suchpfade`)
let found = 0
for (const searchPath of paths) {
  const manifest = join(searchPath, BARE, 'package.json')
  if (existsSync(manifest)) {
    found += 1
    console.log(`   TREFFER: ${manifest}`)
    console.log(`            ${versionOf(manifest)}`)
  }
}
if (found === 0) console.log('   kein Treffer in der Node-Kette')

// 2. Bun-Auflösung relativ zum Bundle.
for (const spec of [`${BARE}/package.json`, BARE]) {
  try {
    const resolved = Bun.resolveSync(spec, 'C:/Users/Chang/prometheus-harness/node_modules/@deepseek-ai/dsh-base/lib')
    console.log(`2. Bun.resolveSync("${spec}") → ${resolved}`)
  } catch (cause) {
    console.log(`2. Bun.resolveSync("${spec}") → Fehler: ${String(cause).slice(0, 120)}`)
  }
}

// 3. Was liegt tatsächlich im Baum?
const topLevel = 'C:/Users/Chang/prometheus-harness/node_modules/@deepseek-ai/dsh-llm/package.json'
console.log(`3. Projektwurzel: ${existsSync(topLevel) ? versionOf(topLevel) : 'fehlt'}`)
const bundleLocal = 'C:/Users/Chang/prometheus-harness/node_modules/@deepseek-ai/dsh-base/node_modules/@deepseek-ai/dsh-llm/package.json'
console.log(`   im Bundle:     ${existsSync(bundleLocal) ? versionOf(bundleLocal) : 'fehlt'}`)

// 4. Läuft die Runtimeschicht? Der Interzeptor wäre die Erklärung für einen
//    anderen Ordner als die Node-Kette.
console.log('')
console.log('4. Ist der Runtimeschicht-Interzeptor aktiv?')
console.log('   execArgv:', JSON.stringify(process.execArgv))
console.log('   has --expose-internals:', process.execArgv.includes('--expose-internals'))
try {
  // Der Interzeptor hängt an `node-addon-require-builtin`. Fehlt das Addon,
  // kann die Runtimeschicht nicht installiert sein.
  const addon = 'C:/Users/Chang/prometheus-harness/node_modules/node-addon-require-builtin/package.json'
  console.log('   node-addon-require-builtin:', existsSync(addon) ? 'vorhanden' : 'FEHLT')
} catch (cause) {
  console.log('   Prüfung fehlgeschlagen:', String(cause))
}
