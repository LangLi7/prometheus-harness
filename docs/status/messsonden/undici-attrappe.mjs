/**
 * `undici-attrappe.mjs` — mißt, ob die Laufzeit unter dem Namen `undici` das **Paket** oder eine
 * **Attrappe** ausliefert.
 *
 * **Warum es diese Sonde gibt.** Am 18.10.2026 fiel `web_fetch` mit
 * `dispatcher.close is not a function` aus. Die Ursache war keine Anwendung, sondern die Laufzeit:
 * Bun 1.4.0 beantwortet den nackten Spezifizierer `undici` aus eigenem Bestand und lädt
 * `node_modules/undici` nie. Die Attrappe hat die Klassen (`Agent`, `Dispatcher`), aber **keine
 * Methoden** — der Konstruktor wirft nicht, erst der Aufruf scheitert.
 *
 * **Was die Sonde ohne Netzwerk tut.** Sie fragt nur Fähigkeiten ab und meldet, ob die Ergänzung
 * greift. Ein echter Abruf kostet Fremdzugriff und gehört nicht in eine Messung, die man beliebig
 * oft fährt — dafür gibt es `--fetch`.
 *
 * Aufruf (cwd = Projekt, damit die Vorladung greift):
 *
 *     bun docs/status/messsonden/undici-attrappe.mjs
 *     bun docs/status/messsonden/undici-attrappe.mjs --fetch
 *
 * Gegenprobe (cwd außerhalb des Projekts): dieselbe Ausgabe, aber ohne Ergänzung — dann ist
 * `ergaenzungNoetig()` weiter `true` und der Umweg trotzdem **nicht** eingehängt.
 */

import { ergaenzungNoetig, UMWEG } from '../../../scripts/undici-echte-aufloesung.mjs'

const zeile = (label, wert) => console.log(`  ${label.padEnd(42)} ${wert}`)

console.log(`Laufzeit: Bun ${globalThis.Bun?.version ?? '?'} auf ${process.platform}`)
console.log(`cwd:      ${process.cwd()}`)
console.log('')

console.log('--- 1. Wie löst die Laufzeit "undici" auf? ---')
zeile('Bun.resolveSync("undici")', (() => {
  try {
    return globalThis.Bun.resolveSync('undici', process.cwd())
  } catch (error) {
    return `wirft: ${String(error.message).split('\n')[0]}`
  }
})())

console.log('\n--- 2. Was kann der Agent? ---')
const nackt = await import('undici')
const nackterAgent = new nackt.Agent()
zeile('nackter Import: typeof close', typeof nackterAgent.close)
zeile('nackter Import: typeof dispatch', typeof nackterAgent.dispatch)
zeile('nackter Import: instanceof Dispatcher', nackterAgent instanceof nackt.Dispatcher)

const umweg = await import(UMWEG.href)
zeile('über scripts/undici-echt: typeof close', typeof new umweg.Agent().close)

console.log('\n--- 3. Greift die Ergänzung? ---')
zeile('ergaenzungNoetig()', ergaenzungNoetig())
zeile('Umwegmodul', UMWEG.href)

if (process.argv.includes('--fetch')) {
  console.log('\n--- 4. Echter Abruf (nur mit --fetch) ---')
  const { HttpFetchProvider } = await import('@deepseek-ai/dsh-web-fetch-http')
  const anbieter = new HttpFetchProvider({
    maxResponseBytes: 5e6,
    maxBodyChars: 1e5,
    timeoutMs: 3e4,
    maxRedirects: 5,
    userAgent: 'pmh-sonde/1.0',
  })
  try {
    const r = await anbieter.fetch({ url: 'https://example.com' })
    const inhalt = r.body?.content ?? ''
    zeile('HTTP', r.statusCode)
    zeile('Zeichen', inhalt.length)
    zeile('Anfang', inhalt.replace(/\s+/g, ' ').trim().slice(0, 50))
  } catch (error) {
    zeile('FEHLER', String(error?.message ?? error).split('\n')[0].slice(0, 120))
  }
}
