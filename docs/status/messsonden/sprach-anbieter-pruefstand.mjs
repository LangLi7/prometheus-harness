/**
 * Prüfstand: führt einen lokalen Sprach-Anbieter **wirklich** aus.
 *
 * Aufruf:
 *   node --experimental-strip-types docs/status/messsonden/sprach-anbieter-pruefstand.mjs \
 *     --paket <pfad zu src/index.ts> --data-root <ordner> --wav <datei> [--sprache de] [--wav2 <datei>]
 *
 * ## Was hier nachgewiesen wird
 *
 * Nicht die Erkennung an sich — die ist im Trockenlauf belegt —, sondern die
 * **Verdrahtung**: daß `apply()` den Anbieter am Register anmeldet, daß die
 * Vorbereitung die Gewichte prüft, daß der Kindprozeß startet, sich mit Kennwort
 * meldet und eine Aufnahme über die Schleife erkennt, und daß der Anbieter danach
 * wieder sauber abgebaut werden kann.
 *
 * ## Was hier NICHT benutzt wird
 *
 * Die echte `dsh app boot`-Zusammensetzung und die Weboberfläche. Dieser Prüfstand
 * baut einen eigenen, kleinen Kontext mit `LocalSubprocessRuntime` und ruft
 * `apply()` direkt auf. Damit ist er **unabhängig** von einem laufenden Host — und
 * die Grenze ist ehrlich benannt: er belegt den Anbieter, nicht die Anzeige.
 */

import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { readFile } from 'node:fs/promises'

const argv = process.argv.slice(2)

/** Liest einen Schalterwert, z. B. `--wav datei.wav`. */
const hole = (name, vorgabe) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : vorgabe
}

/** Sammelt alle `--wav`-Angaben mit ihrer Sprachkennung. */
const holeFaelle = () => {
  const faelle = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--wav') continue
    const spracheIndex = argv.indexOf('--sprache', i)
    faelle.push({ wav: argv[i + 1], sprache: spracheIndex >= 0 ? argv[spracheIndex + 1] : 'de' })
  }
  return faelle
}

const paket = hole('paket')
const faelle = holeFaelle()
if (!paket || faelle.length === 0) {
  throw new Error('--paket und mindestens ein --wav sind nötig')
}
// **Der Ablageort kommt aus `DSH_HOME`** — derselbe Weg wie im Host. Ein
// ausdrückliches `--data-root` setzt ihn für Prüfungen außerhalb des Harness.
const dataRoot = hole('data-root')
if (dataRoot) process.env.DSH_HOME = dataRoot

/** Ein stiller Auffangbehälter für die Protokolle des Anbieters. */
const stille = {
  info: (...teile) => console.log('[info]', ...teile),
  warn: (...teile) => console.log('[warn]', ...teile),
  error: (...teile) => console.log('[error]', ...teile),
  debug: (...teile) => console.log('[debug]', ...teile),
}

const ctx = new Context()
ctx.provide('logger', stille)
// **Der Dienst `subprocess` wird hier von Hand eingehängt**, weil dieser Prüfstand
// keine `dsh app boot`-Zusammensetzung benutzt. `LocalSubprocessRuntime` ist ein
// Dienst: er meldet sich beim Einhängen selbst als `ctx.subprocess` an. Der
// Anbieter-Code sieht keinen Unterschied — er fragt `ctx.subprocess.spawn(...)`.
ctx.plugin(LocalSubprocessRuntime)

/** Sammelt die angemeldeten Anbieter und den Abbau. */
const angemeldet = new Map()
const abmeldungen = []
/** Die Abbauer der `ctx.effect`-Wirkungen, in der Reihenfolge ihrer Anmeldung. */
const wirkungen = []
ctx.provide('speechToText', {
  register(anbieter) {
    angemeldet.set(anbieter.info.id, anbieter)
    const abmelden = async () => {
      angemeldet.delete(anbieter.info.id)
    }
    abmeldungen.push(abmelden)
    return abmelden
  },
})
// **`ctx.effect` gehört zum Kern-Kontext** — es darf nicht ersetzt werden. Der
// Rückgabewert ist der Abbauer der Wirkung; genau den ruft der Host beim Entladen
// des Pakets. Hier wird er gesammelt, damit der Prüfstand denselben Weg geht.
const echtesEffect = ctx.effect.bind(ctx)
ctx.effect = (rueckruf) => {
  const abbau = echtesEffect(rueckruf)
  wirkungen.push(abbau)
  return abbau
}

const modul = await import(pathToFileURL(paket).href)
const config = modul.Config({})
console.log(`=== Anbieter wird angemeldet: ${modul.name}`)
modul.apply(ctx, config)

const anbieter = [...angemeldet.values()][0]
if (!anbieter) throw new Error('apply() hat keinen Anbieter angemeldet')
console.log(`Kennung: ${anbieter.info.id} | Name: ${anbieter.info.name} | Ort: ${anbieter.info.location}`)
console.log(`Sprachen: ${anbieter.info.languages.join(', ')}`)

console.log('=== Vorbereitung')
const start = performance.now()
await anbieter.preparation.prepare()
console.log(`Zustand nach ${(performance.now() - start).toFixed(0)} ms: ${JSON.stringify(anbieter.preparation.snapshot().phase)}`)

for (const fall of faelle) {
  const audio = new Uint8Array(await readFile(fall.wav))
  console.log(`=== Erkennung (${fall.sprache}): ${fall.wav} (${audio.byteLength} B)`)
  const lauf = performance.now()
  const ergebnis = await anbieter.transcribe({ audio, language: fall.sprache }, new AbortController().signal)
  console.log(`  audioSeconds=${ergebnis.audioSeconds.toFixed(2)} inferenceSeconds=${ergebnis.inferenceSeconds.toFixed(3)} gesamt=${((performance.now() - lauf) / 1000).toFixed(2)} s`)
  console.log(`  TEXT: ${JSON.stringify(ergebnis.text)}`)
}

console.log('=== Abbau')
// **Der Abbau geht den Weg des Hosts**: zuerst die Wirkung des Anbieters
// zurücknehmen (dort läuft `dispose()`: Anbieter abmelden, Kindprozeß beenden),
// danach die übrigen Wirkungen in umgekehrter Reihenfolge.
for (const abbau of wirkungen.reverse()) await abbau()
console.log('fertig')
