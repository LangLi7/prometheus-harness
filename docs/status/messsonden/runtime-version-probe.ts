/**
 * Messsonde: WELCHE `dsh-app-boot`-Fassung liest die Laufzeit?
 *
 * `getDshRuntimeVersion()` liest `new URL("../package.json", import.meta.url)`
 * **innerhalb** von `@deepseek-ai/dsh-app-boot`. Diese Sonde löst dieselbe
 * Spezifikation aus derselben Richtung auf, aus der der Host sie lädt — und
 * zeigt, welche Datei dabei herauskommt. Damit ist die Frage „welche Fassung
 * meldet sich als Laufzeit?" beantwortet und nicht geraten.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = 'C:/Users/Chang/prometheus-harness'
const ENTRY = `${ROOT}/apps/cli/src/main.ts`
const PKG = '@deepseek-ai/dsh-app-boot'

function versionOf(path: string): string {
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { version?: string }
    return manifest.version ?? '(keine version)'
  } catch {
    return '(unlesbar)'
  }
}

console.log('Bun:', Bun.version, '| Plattform:', process.platform, '| arch:', process.arch)
console.log('')

// 1. Bun-Auflösung aus dem Host-Einstieg heraus.
try {
  const resolved = Bun.resolveSync(`${PKG}/package.json`, `${ROOT}/apps/cli/src`)
  console.log('1. Bun.resolveSync aus apps/cli/src:')
  console.log(`   ${resolved}`)
  console.log(`   Version: ${versionOf(resolved)}`)
} catch (cause) {
  console.log('1. Auflösung fehlgeschlagen:', String(cause).slice(0, 160))
}

// 2. Dieselbe Auflösung, aber aus dem Installations-Anker (apps/cli).
try {
  const resolved = Bun.resolveSync(`${PKG}/package.json`, `${ROOT}/apps/cli`)
  console.log('2. aus apps/cli:')
  console.log(`   ${resolved}  →  ${versionOf(resolved)}`)
} catch (cause) {
  console.log('2. Auflösung fehlgeschlagen:', String(cause).slice(0, 160))
}

// 3. Die Node-Kette — der Weg, den `manifestOf` als Ausweichzweig nimmt.
const req = createRequire(pathToFileURL(ENTRY).href)
for (const searchPath of req.resolve.paths(PKG) ?? []) {
  const manifest = join(searchPath, PKG, 'package.json')
  if (existsSync(manifest)) console.log(`3. Node-Kette: ${manifest}  →  ${versionOf(manifest)}`)
}

// 4. Gibt es überhaupt eine zweite Kopie im Baum?
console.log('')
console.log('4. Weitere Kopien von dsh-app-boot:')
function walk(dir: string, depth: number): void {
  if (depth > 6) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name !== 'node_modules' && name !== '.git') continue
    const candidate = join(dir, '@deepseek-ai', PKG, 'package.json')
    if (existsSync(candidate)) console.log(`   ${candidate}  →  ${versionOf(candidate)}`)
    const next = join(dir, 'node_modules', '@deepseek-ai')
    if (existsSync(next)) {
      for (const pkgDir of readdirSync(next)) {
        walk(join(next, pkgDir), depth + 1)
      }
    }
  }
}
walk(ROOT, 0)

// 5. Was die Laufzeit selbst sagen würde — direkt aus dem Paket gelesen.
console.log('')
console.log('5. Datei, die getDshRuntimeVersion() liest:')
const top = `${ROOT}/node_modules/@deepseek-ai/dsh-app-boot/package.json`
console.log(`   ${top}`)
console.log(`   → dsh-Runtime-Version = ${versionOf(top)}`)
