/**
 * Die Übersetzung zwischen **unserem** Schema und **JSON-Schema** — rein, ohne Netz.
 *
 * ## Warum das eine eigene Datei ist
 *
 * Hier steckt die einzige Stelle, an der ein Fehler **still** bleibt: ein Schema, das falsch
 * übersetzt wird, ergibt eine Anfrage, die das Modell anders versteht, als der Aufrufer gemeint
 * hat — und ein Urteil, das **aussieht** wie eine Antwort. Deshalb ist dieses Stück vom Netzzugriff
 * getrennt und für sich prüfbar.
 *
 * ## Die zwei Richtungen
 *
 * | Richtung | Wozu |
 * |---|---|
 * | {@link zuJsonSchema} | hinaus: was das Modell liefern **soll** |
 * | {@link liesUrteil} | herein: was es geliefert **hat** — geprüft, nicht geglaubt |
 *
 * ## Warum geprüft wird, obwohl `strict` gesetzt ist
 *
 * Weil `strict` eine **Bitte** an den Anbieter ist, keine Zusage. Gemessen am 15.10.2026 kam aus
 * `typesafe/jev-router` gültiges JSON — aber die Prüfung darf sich nicht darauf verlassen, daß das
 * immer so bleibt: ein gerouteter Anbieter kann ein Modell wählen, das die Bitte überhört. Ohne
 * eigene Prüfung käme ein `wert` heraus, der nur **aussieht** wie die verlangte Form.
 *
 * @module @prometheus-harness/openrouter/schema
 */

import type { Feld, Schema } from '@prometheus-harness/faehigkeiten'

/** JSON-Schema, so weit wir es brauchen — absichtlich winzig und ohne Bibliothek. */
export interface JsonSchema {
  readonly type: 'object'
  readonly properties: Readonly<Record<string, unknown>>
  readonly required: readonly string[]
  readonly additionalProperties: false
}

/** Die Art eines Feldes als JSON-Schema-Art. */
const ART_ALS_TYP: Readonly<Record<Feld<unknown>['art'], 'string' | 'number' | 'boolean'>> = {
  text: 'string',
  zahl: 'number',
  wahrheitswert: 'boolean',
}

/**
 * Übersetzt ein Feld in JSON-Schema.
 *
 * @param feld - das Feld
 * @returns die Beschreibung
 */
function feldZuJson(feld: Feld<unknown>): Record<string, unknown> {
  const typ = ART_ALS_TYP[feld.art]
  return feld.auswahl === undefined
    ? { type: typ }
    : // Bei einer Auswahl steht der Typ **neben** ihr. Beides zusammen ist strenger als eines
      // allein: `enum` verbietet fremde Werte, `type` verbietet `1` gegen `"1"`.
      { type: typ, enum: [...feld.auswahl] }
}

/**
 * Übersetzt ein Schema in JSON-Schema.
 *
 * **`additionalProperties: false` ist Absicht.** Ohne das dürfte das Modell Felder erfinden, und
 * der Aufrufer bekäme ein `wert` mit Daten, für die seine Form (`T`) gar keinen Platz hat.
 *
 * @param schema - unser Schema
 * @returns das JSON-Schema
 */
export function zuJsonSchema<T>(schema: Schema<T>): JsonSchema {
  const namen = Object.keys(schema.felder)
  if (namen.length === 0) {
    // Ein Schema ohne Felder wäre eine Anfrage ohne Frage. Das Modell würde irgendetwas liefern,
    // und `wert` wäre ein leeres Objekt, das wie ein Urteil aussieht.
    throw new Error('Ein Schema ohne Felder ist kein Schema — es gibt nichts zu entscheiden.')
  }
  const eigenschaften: Record<string, unknown> = {}
  const pflicht: string[] = []
  for (const name of namen) {
    const feld = (schema.felder as Readonly<Record<string, Feld<unknown>>>)[name]
    if (feld === undefined) continue
    eigenschaften[name] = feldZuJson(feld)
    if (feld.freiwillig !== true) pflicht.push(name)
  }
  return { type: 'object', properties: eigenschaften, required: pflicht, additionalProperties: false }
}

/**
 * Warum ein Urteil nicht angenommen wurde.
 *
 * **Warum eine Liste und nicht der erste Mangel.** Wer ein Modell richtet, will **alle** Abweichungen
 * sehen. Beim ersten abzubrechen führt zu „Fehler behoben, nächster Fehler" — bei einem bezahlten
 * Aufruf jedes Mal aufs neue.
 */
export class UrteilFehler extends Error {
  /**
   * @param maengel - was alles nicht stimmte
   */
  constructor(readonly maengel: readonly string[]) {
    super(`Das Urteil folgt nicht dem Schema:\n  ${maengel.join('\n  ')}`)
    this.name = 'UrteilFehler'
  }
}

/**
 * Prüft **einen** Wert gegen **ein** Feld.
 *
 * @param name - der Feldname, für die Meldung
 * @param wert - der gelieferte Wert
 * @param feld - das verlangte Feld
 * @returns der Mangel oder `undefined`
 */
function pruefeFeld(name: string, wert: unknown, feld: Feld<unknown>): string | undefined {
  if (feld.art === 'text' && typeof wert !== 'string') {
    return `„${name}" soll Text sein, war ${beschreibe(wert)}.`
  }
  if (feld.art === 'zahl' && (typeof wert !== 'number' || !Number.isFinite(wert))) {
    return `„${name}" soll eine Zahl sein, war ${beschreibe(wert)}.`
  }
  if (feld.art === 'wahrheitswert' && typeof wert !== 'boolean') {
    return `„${name}" soll ein Wahrheitswert sein, war ${beschreibe(wert)}.`
  }
  if (feld.auswahl !== undefined && !feld.auswahl.includes(wert as never)) {
    return `„${name}" war ${beschreibe(wert)} — erlaubt ist nur ${feld.auswahl.map((w) => beschreibe(w)).join(', ')}.`
  }
  return undefined
}

/**
 * Beschreibt einen Wert für eine Meldung — **kurz und ohne Geheimnis**.
 *
 * @param wert - der Wert
 * @returns die Beschreibung
 */
function beschreibe(wert: unknown): string {
  if (wert === undefined) return 'nicht vorhanden'
  if (wert === null) return 'null'
  const roh = JSON.stringify(wert) ?? String(wert)
  return roh.length > 120 ? `${roh.slice(0, 120)}…` : roh
}

/**
 * Liest ein Urteil aus dem Text, den das Modell geliefert hat — **geprüft gegen das Schema**.
 *
 * @param text - der Inhalt von `content`
 * @param schema - wonach gefragt wurde
 * @returns das Urteil in der Form `T`
 * @throws UrteilFehler - wenn etwas fehlt, die Art nicht stimmt oder ein Wert nicht erlaubt ist
 */
export function liesUrteil<T>(text: string, schema: Schema<T>): T {
  const geschnitten = text.trim()
  if (geschnitten === '') throw new UrteilFehler(['Der Inhalt war leer.'])

  let roh: unknown
  try {
    roh = JSON.parse(geschnitten)
  } catch {
    // **Kein Zaun-Abziehen.** Manche Modelle packen JSON in ```json … ```. Das abzustreifen wäre
    // Nachsicht gegenüber einem Modell, das die Bitte überhört hat — und würde genau die
    // Abweichung verstecken, die man sehen will. Der Anfang des Inhalts steht in der Meldung,
    // damit klar ist, WAS kam.
    throw new UrteilFehler([`Der Inhalt war kein JSON. Er begann mit: ${beschreibe(geschnitten.slice(0, 200))}`])
  }

  if (roh === null || typeof roh !== 'object' || Array.isArray(roh)) {
    throw new UrteilFehler([`Erwartet war ein Objekt, geliefert wurde ${beschreibe(roh)}.`])
  }
  const objekt = roh as Record<string, unknown>
  const maengel: string[] = []
  const felder = schema.felder as Readonly<Record<string, Feld<unknown>>>

  for (const [name, feld] of Object.entries(felder)) {
    const fehlt = !Object.hasOwn(objekt, name) || objekt[name] === undefined
    if (fehlt) {
      // Ein freiwilliges Feld darf fehlen — dann steht es auch nicht im Ergebnis, und `T` sagt
      // an dieser Stelle die Wahrheit (`undefined`), statt ein erfundenes `null` zu führen.
      if (feld.freiwillig !== true) maengel.push(`„${name}" fehlt.`)
      continue
    }
    const mangel = pruefeFeld(name, objekt[name], feld)
    if (mangel !== undefined) maengel.push(mangel)
  }

  // Zusatzfelder werden **abgelehnt**, nicht weggeworfen. Wir haben mit
  // `additionalProperties: false` ausdrücklich darum gebeten, keine zu schicken. Käme eines und wir
  // ließen es fallen, hätte das Modell etwas gesagt, das niemand zu sehen bekommt.
  const erlaubt = new Set(Object.keys(felder))
  const zusatz = Object.keys(objekt).filter((n) => !erlaubt.has(n))
  if (zusatz.length > 0) {
    maengel.push(`Nicht verlangt, aber geliefert: ${zusatz.join(', ')}.`)
  }

  if (maengel.length > 0) throw new UrteilFehler(maengel)
  return roh as T
}
