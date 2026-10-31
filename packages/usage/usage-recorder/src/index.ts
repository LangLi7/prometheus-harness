/**
 * `@prometheus-harness/usage-recorder` — vom Modellaufruf zum bezahlten Datensatz.
 *
 * ## Was dieses Paket schließt
 *
 * `usage-budget` rechnet Token × Tarif, wenn ihm Zeilen gereicht werden. `token-meter` liefert die
 * Token mit Herkunft. Was fehlte, war die **Zuordnung**: welcher Nutzer, welcher Schlüsselname,
 * welcher Zweck — und die Ablage. Genau das tut dieses Paket, in einem Aufruf:
 *
 * ```ts
 * const aufzeichner = new Aufzeichner({ speicher, tarife })
 * await aufzeichner.verbuchen({
 *   nutzer: 'anna', familie: 'deepseek-official', modell: 'deepseek-flash',
 *   tokens: { inputTokens: 1_200, outputTokens: 300 }, zaehlung: 'reported',
 * })
 * const konto = await aufzeichner.konto('anna', { tage: 30, budget })
 * ```
 *
 * ## Die Grenze, die bleibt
 *
 * Der Aufzeichner **hängt sich nicht** in den Modellstrom. Die Naht (Waterfall `llm/stream`, Sitzung
 * → Nutzer, Route → Schlüssel) ist Host-Arbeit; hier liegt die aufrufbare Hälfte, geprüft ohne
 * Host, ohne Netz und ohne Modell. Wer die Naht baut, ruft `verbuchen` je `usage`-Chunk — und
 * `schluesselFuerRoute`, weil der Aufruf den Schlüssel nicht mitführt.
 *
 * @module @prometheus-harness/usage-recorder
 */

export { SCHLUESSEL_JE_ROUTE, schluesselFuerRoute } from './keys.ts'

export { herkunftAus, verbuche, type Aufruf, type Zaehlungsart } from './record.ts'

export { Aufzeichner, type AufzeichnerOptionen, type Aufzeichnung, type Konto } from './recorder.ts'

export { messenderAnbieter, type MessendeOptionen } from './provider.ts'
