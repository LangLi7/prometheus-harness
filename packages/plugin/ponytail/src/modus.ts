/**
 * Der Zustand des Plugins — und die reine Logik dahinter.
 *
 * **Warum das eine eigene Datei ist.** Der Zustand entscheidet über zwei Dinge im Host
 * (Prompt-Abschnitt, Skill) und über eine Anzeige im Browser. Er ist die einzige Stelle, an der
 * etwas schiefgehen kann, und deshalb die einzige, die ohne Host prüfbar sein muß.
 *
 * @module @prometheus-harness/ponytail/modus
 */

/** Die vier Zustände, in Anzeigereihenfolge. */
export const MODI = ['off', 'lite', 'full', 'ultra'] as const

/** Ein Zustand. */
export type Modus = (typeof MODI)[number]

/** Womit das Plugin anfängt, wenn niemand etwas gesagt hat. */
export const STANDARD: Modus = 'full'

/**
 * Ist der Wert ein bekannter Zustand?
 *
 * @param wert - der geprüfte Wert
 * @returns `true`, wenn er einer der vier ist
 */
export function istModus(wert: unknown): wert is Modus {
  return typeof wert === 'string' && (MODI as readonly string[]).includes(wert)
}

/**
 * Der nächste Zustand im Kreis — `off → lite → full → ultra → off`.
 *
 * @param modus - der jetzige Zustand
 * @returns der nächste
 */
export function naechster(modus: Modus): Modus {
  const stelle = MODI.indexOf(modus)
  return MODI[(stelle + 1) % MODI.length] ?? STANDARD
}

/**
 * Liest den Zustand aus einer Datei, die auch von einem anderen Werkzeug stammen kann.
 *
 * **Warum `enabled` mitgelesen wird.** In `~/.dsh` liegt ein `ponytail.json` der
 * Claude-Code-Installation (`{ enabled, updatedAt, skills }`). Es zu überschreiben wäre
 * falsch — es gehört einem anderen Werkzeug. Es zu lesen ist dagegen billig und macht
 * den Umzug zu einem, der nichts kostet.
 *
 * @param roh - der Dateitext
 * @returns der Zustand; bei unbrauchbarem Inhalt {@link STANDARD}
 */
export function leseModus(roh: string): Modus {
  let daten: unknown
  try {
    daten = JSON.parse(roh)
  } catch {
    return STANDARD
  }
  if (typeof daten !== 'object' || daten === null) return STANDARD
  const eintrag = daten as { modus?: unknown; mode?: unknown; enabled?: unknown }
  if (istModus(eintrag.modus)) return eintrag.modus
  if (istModus(eintrag.mode)) return eintrag.mode
  if (typeof eintrag.enabled === 'boolean') return eintrag.enabled ? 'full' : 'off'
  return STANDARD
}

/**
 * Der Dateiinhalt, der geschrieben wird.
 *
 * **Unbekannte Felder bleiben stehen.** Die Datei kann einem anderen Werkzeug gehören; nur
 * `modus` und `updatedAt` sind unsere.
 *
 * @param modus - der neue Zustand
 * @param vorher - der bisherige Text, falls es einen gab
 * @param jetzt - der Zeitstempel
 * @returns der neue Text
 */
export function schreibeModus(modus: Modus, vorher: string | undefined, jetzt: Date): string {
  let bestand: Record<string, unknown> = {}
  if (vorher !== undefined) {
    try {
      const gelesen: unknown = JSON.parse(vorher)
      if (typeof gelesen === 'object' && gelesen !== null && !Array.isArray(gelesen)) {
        bestand = gelesen as Record<string, unknown>
      }
    } catch {
      bestand = {}
    }
  }
  return `${JSON.stringify({ ...bestand, modus, updatedAt: jetzt.toISOString() }, null, 2)}\n`
}
