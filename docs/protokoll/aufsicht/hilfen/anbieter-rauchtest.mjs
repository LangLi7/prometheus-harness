/**
 * anbieter-rauchtest.mjs — Hilfe der Aufsicht für den offenen Punkt `P8.12`
 * („Aufruf gegen den **echten** Anbieter — kein Schlüssel in dieser Umgebung").
 *
 * ## Warum es diesen Test gibt, und warum er zwei Dinge zeigt
 *
 * Der Adapter des Ziel-Repos liest den Schlüssel an **genau einer** Stelle:
 * `providerFromEnv()` → `env.DEEPSEEK_API_KEY` (`packages/llm/llm-deepseek/src/index.ts:510`).
 * **Nichts** im Repo liest den Credential-Speicher (`~/.pmh/.credentials.yaml`) — geprüft: null
 * Treffer auf `apiKeyEnv`, `credentials-local`, `credentials.yaml`.
 *
 * Daraus folgt der Unterschied, der `P8.12` blockiert:
 *
 *   * Der **Kern** (Core) löst `apiKeyEnv`-Referenzen aus dem Speicher auf.
 *   * **Unser eigener Adapter** tut das **nicht** — er braucht die **Umgebungsvariable**.
 *
 * Dieser Test setzt die Variable aus dem Speicher (ohne den Wert je auszugeben) und ruft den
 * **echten** Dienst über **unseren** Adapter. Damit ist die Kette geprüft:
 * Speicher → Umgebungsvariable → `providerFromEnv` → DeepSeek.
 *
 * ## Aufruf (mit Bun, aus dem Repository)
 *
 *   bun run docs\protokoll\aufsicht\hilfen\anbieter-rauchtest.mjs
 *
 * ## Ehrliche Grenzen
 *
 * * Es ist ein **echter** Aufruf: er verbraucht Token (wenige) und ist damit nicht kostenlos.
 * * Er belegt **nicht** `P8.12` im Sinne der Projektregeln — das ist ein Nachweis des bauenden
 *   Agenten **in seiner Kette**. Er zeigt nur, dass der Zugang vorhanden, gültig und mit dem
 *   eigenen Adapter benutzbar ist.
 * * Ohne `DEEPSEEK_API_KEY` in der Umgebung **und** ohne lesbaren Speicher bricht er mit einer
 *   klaren Meldung ab, statt etwas zu behaupten.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'C:\\Users\\Chang\\prometheus-harness'
const SPEICHER = 'C:\\Users\\Chang\\.pmh\\.credentials.yaml'
const MODELL = process.argv[2] ?? 'deepseek-flash'

console.log('=== Rauchtest gegen den echten Anbieter (über den Adapter des Repos) ===')
console.log(`Adapter : ${REPO}\\packages\\llm\\llm-deepseek`)
console.log(`Modell  : ${MODELL}\n`)

/** Schlüssel aus der Umgebung — sonst aus dem Speicher, ohne ihn auszugeben. */
let herkunft = 'Umgebungsvariable'
if (process.env.DEEPSEEK_API_KEY === undefined || process.env.DEEPSEEK_API_KEY === '') {
  try {
    const roh = readFileSync(SPEICHER, 'utf8')
    const treffer = /DEEPSEEK_API_KEY:\s*"?([A-Za-z0-9_\-]+)"?/u.exec(roh)
    if (treffer === null) {
      console.log(`ABBRUCH: in ${SPEICHER} steht keine Referenz DEEPSEEK_API_KEY.`)
      process.exit(1)
    }
    process.env.DEEPSEEK_API_KEY = treffer[1]
    herkunft = 'Credential-Speicher (in die Umgebung gesetzt)'
  } catch (error) {
    console.log(`ABBRUCH: kein Schlüssel in der Umgebung und Speicher nicht lesbar (${error.code ?? error.message}).`)
    process.exit(1)
  }
}

const schluessel = process.env.DEEPSEEK_API_KEY
console.log(`Schlüssel: vorhanden (${schluessel.length} Zeichen, Fingerabdruck ${createHash('sha256').update(schluessel).digest('hex').slice(0, 12)})`)
console.log(`Herkunft : ${herkunft}\n`)

/** Den Adapter des Repos laden — er ist TypeScript, Bun führt ihn direkt aus. */
const modul = await import(pathToFileURL(join(REPO, 'packages', 'llm', 'llm-deepseek', 'src', 'index.ts')).href)
const { providerFromEnv } = modul

let anbieter
try {
  anbieter = providerFromEnv()
} catch (error) {
  console.log(`ABBRUCH beim Aufbau des Anbieters: ${error?.message ?? error}`)
  process.exit(1)
}
console.log('Anbieter aufgebaut: OK (der Adapter hat den Schlüssel angenommen)')

const start = Date.now()
try {
  const antwort = await anbieter.complete({
    model: MODELL,
    // **Warum 200 und nicht 24.** Der erste Lauf mit 24 Token endete mit `finishReason: length`
    // und **leerem** Text: das Modell verbrauchte das Budget, bevor sichtbarer Text entstand.
    // Ein Rauchtest, dessen Ergebnis „leer" ist, beweist die Verbindung, aber nicht die Antwort.
    maxTokens: 200,
    messages: [
      {
        role: 'user',
        parts: [{ type: 'text', text: 'Antworte mit genau einem Wort: Empfang.' }],
      },
    ],
  })
  const dauer = ((Date.now() - start) / 1000).toFixed(2)
  console.log(`\nECHTE ANTWORT in ${dauer} s`)
  console.log(`  Modell       : ${antwort.model}`)
  console.log(`  finishReason : ${antwort.finishReason}`)
  console.log(`  Token        : ${antwort.usage ? `${antwort.usage.inputTokens} ein / ${antwort.usage.outputTokens} aus` : '(nicht gemeldet)'}`)
  console.log(`  Text         : ${JSON.stringify(antwort.text.slice(0, 120))}`)
  console.log('\nERGEBNIS: der Zugang ist gültig und über den eigenen Adapter benutzbar.')
} catch (error) {
  console.log(`\nFEHLER beim Aufruf: ${error?.message ?? error}`)
  console.log('Das ist die Stelle, an der P8.12 hängt — die Meldung nennt den Grund.')
  process.exit(1)
}
process.exit(0)
