/**
 * `beobachtung-lebensdauer.mjs` — mißt, ob eine Datei-Beobachtung die **Wiederherstellung der
 * Sitzung** überlebt.
 *
 * **Warum es diese Sonde gibt.** Am 18.10.2026 scheiterten Edits nach jedem Turn mit
 * `cannot modify "<pfad>": file has not been read — read the file, then retry`, obwohl dieselben
 * Dateien im Turn davor gelesen worden waren. Ursache: der Host baut die Sitzung am Turn-Ende aus
 * dem Protokoll neu auf (neues `Session`-Objekt, gleiche `id`), die Policy
 * `@deepseek-ai/dsh-fs-observation-policy` schlüsselt ihre `WeakMap` aber über das **Objekt**.
 * Die Ergänzung `scripts/fs-beobachtung-lebensdauer.mjs` schlüsselt über die **`id`**.
 *
 * **Was die Sonde tut.** Sie baut die Policy auf, zeichnet eine Beobachtung für Sitzung A auf und
 * fragt dann den Edit-Intent für ein **zweites Objekt mit derselben `id`** ab — genau der Fall
 * „Turn 2 nach Wiederherstellung". Danach zwei Gegenproben, damit klar ist, daß die Sperre bleibt.
 *
 * Aufruf (cwd = Projekt, damit die Vorladung greift):
 *
 *     bun docs/status/messsonden/beobachtung-lebensdauer.mjs
 *
 * Gegenprobe (cwd außerhalb des Projekts): derselbe Fall **muß** scheitern.
 */

const listener = {}
const policy = await import('@deepseek-ai/dsh-fs-observation-policy')
policy.apply({
  on: (ereignis, fn) => {
    listener[ereignis] = fn
  },
  effect: () => {},
})

const ziel = { targetKey: 'C:/p/a.ts', displayPath: 'C:/p/a.ts' }
const sitzung = (id) => ({ agent: { session: { id } } })

console.log(`Laufzeit: Bun ${globalThis.Bun?.version ?? '?'} auf ${process.platform}`)
console.log(`cwd:      ${process.cwd()}\n`)

// Turn 1: die Datei wird gelesen.
listener['fs/observed'](ziel, { kind: 'present', version: 'v1' }, sitzung('session-1'))

// Turn 2: die Sitzung wurde wiederhergestellt — anderes Objekt, gleiche id.
let ueberlebt = false
try {
  const intent = await listener['fs/edit-intent'](ziel, sitzung('session-1'))
  ueberlebt = intent?.version === 'v1'
  console.log(`  Wiederherstellung überlebt   : JA   (Version ${intent?.version})`)
} catch (error) {
  console.log(`  Wiederherstellung überlebt   : NEIN (${String(error.message).slice(0, 60)})`)
}

// Gegenprobe 1: eine andere Sitzung darf nichts sehen.
let fremd_blockiert = false
try {
  await listener['fs/edit-intent'](ziel, sitzung('session-2'))
} catch (error) {
  fremd_blockiert = error.code === 'FS_NOT_OBSERVED'
}
console.log(`  andere Sitzung blockiert     : ${fremd_blockiert ? 'JA' : 'NEIN'}`)

// Gegenprobe 2: ohne jede Beobachtung bleibt es gesperrt.
const anderesZiel = { targetKey: 'C:/p/b.ts', displayPath: 'C:/p/b.ts' }
let ohne_blockiert = false
try {
  await listener['fs/edit-intent'](anderesZiel, sitzung('session-1'))
} catch (error) {
  ohne_blockiert = error.code === 'FS_NOT_OBSERVED'
}
console.log(`  ungesehene Datei blockiert   : ${ohne_blockiert ? 'JA' : 'NEIN'}`)

console.log(`\nUrteil: ${ueberlebt && fremd_blockiert && ohne_blockiert ? 'OK — Lebensdauer repariert, Sperre steht' : 'NICHT in Ordnung'}`)
