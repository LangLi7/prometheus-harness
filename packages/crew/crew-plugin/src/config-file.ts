/**
 * Die Konfiguration aus einer Datei — und warum „fehlt" nicht „Fehler" heißt.
 *
 * ## Der Unterschied, der zählt
 *
 * | Fall | Verhalten |
 * |---|---|
 * | Datei fehlt | **nichts einhängen**, einen Satz ins Protokoll — der Host startet weiter |
 * | Datei ist kein JSON / kein Objekt | **werfen** — das ist ein Fehler, kein Nichtvorhandensein |
 * | Datei gültig, aber Crews leer | **werfen** — eine Einrichtung ohne Crew wäre eine Attrappe |
 *
 * ## Was ein Wurf im Loader wirklich tut — gemessen, nicht angenommen
 *
 * Früher stand hier, ein werfendes `apply` breche den ganzen Start ab („plugin tree failed to
 * load"). **Das stimmt für den Kern 0.2.1 nicht.** Gemessen mit einer Datei `{"crews": []}`:
 *
 * ```
 * pmh: warning: 2 entries did not activate
 * pmh-crew-plugin (@prometheus-harness/crew-plugin): Error: .pmh-build\harness-home\crew\config.json:
 *     die Liste "crews" ist leer
 *     at liesKonfiguration (…\config-file.ts:91:38)
 * pmh: core running (profile "web", loader active)
 * ```
 *
 * Der Eintrag wird also **nicht** eingehängt, der Fehler samt Stapel steht im Startprotokoll, und
 * der Host läuft weiter. Zwei Folgerungen, die daraus folgen und die man kennen muß:
 *
 * 1. **Nichts halb Eingeheangtes.** Ein Wurf kommt aus der Prüfung *vor* der ersten Anmeldung
 *    (Crews, Crew-Kennung, Nutzer) — der Adapter geht nie ohne Nutzer an den Kern. Die Zusage
 *    „fail-closed" trägt also, nur eben mit „Eintrag nicht aktiv" statt „Boot tot".
 * 2. **Der Hinweis muß geschrieben werden.** Weil der Start weiterläuft, ist das Protokoll die
 *    einzige Spur. Deshalb geht der fehlende Fall über {@link protokollAus} — und nicht über ein
 *    `ctx.logger?.warn`, das bei cordis stillschweigend ins Nichts schreiben würde.
 *
 * ## Wo die Datei liegt
 *
 * `<home>/crew/config.json`. Dieselbe Wurzel, unter der die Plandokumente und Verbrauchsdateien
 * liegen — eine Wurzel, nicht zwei. Das Home kommt von außen (nie aus einem festen Pfad), damit die
 * Datei auf jeder Maschine am richtigen Ort liegt.
 *
 * @module @prometheus-harness/crew-plugin/config-file
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Konfiguration } from './plugin.ts'

/** Der Name der Datei innerhalb der Crew-Wurzel. */
export const KONFIGURATIONSDATEI = 'config.json'

/**
 * Was der Leser gefunden hat.
 *
 * Drei Fälle, drei Namen — damit der Aufrufer nicht raten muß, warum nichts eingehängt wurde.
 */
export type Lesung =
  | { readonly art: 'gefunden'; readonly konfiguration: Konfiguration }
  | { readonly art: 'fehlt'; readonly pfad: string }

/**
 * Der Pfad der Konfiguration in einer Wurzel.
 *
 * @param wurzel - das Home des Hosts
 * @returns `<wurzel>/crew/config.json`
 */
export function konfigurationsdatei(wurzel: string): string {
  return join(wurzel, 'crew', KONFIGURATIONSDATEI)
}

/**
 * Prüft, ob ein gelesenes Objekt als Konfiguration taugt.
 *
 * @param roh - das gelesene JSON
 * @returns der Grund, warum es nicht taugt — oder `undefined`
 */
function befund(roh: unknown): string | undefined {
  if (typeof roh !== 'object' || roh === null || Array.isArray(roh)) return 'die Datei ist kein Objekt'
  const feld = roh as Record<string, unknown>
  if (!Array.isArray(feld['crews'])) return 'das Feld "crews" fehlt oder ist keine Liste'
  if (feld['crews'].length === 0) return 'die Liste "crews" ist leer'
  if (typeof feld['crew'] !== 'string' || feld['crew'].trim() === '') return 'das Feld "crew" fehlt'
  if (typeof feld['nutzer'] !== 'string' || feld['nutzer'].trim() === '') {
    return 'das Feld "nutzer" fehlt — ohne Nutzer wird nicht gebucht'
  }
  return undefined
}

/**
 * Liest die Konfiguration.
 *
 * @param pfad - der Pfad der Datei
 * @returns was gefunden wurde; eine fehlende Datei ist **kein** Fehler
 * @throws Error wenn die Datei existiert, aber keine brauchbare Konfiguration enthält
 */
export function liesKonfiguration(pfad: string): Lesung {
  let roh: string
  try {
    roh = readFileSync(pfad, 'utf8')
  } catch {
    return { art: 'fehlt', pfad }
  }
  let gelesen: unknown
  try {
    gelesen = JSON.parse(roh)
  } catch (fehler) {
    throw new Error(`${pfad}: kein JSON (${fehler instanceof Error ? fehler.message : String(fehler)})`)
  }
  const grund = befund(gelesen)
  if (grund !== undefined) throw new Error(`${pfad}: ${grund}`)
  return { art: 'gefunden', konfiguration: gelesen as Konfiguration }
}
