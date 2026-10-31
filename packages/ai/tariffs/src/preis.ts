/**
 * Preise — die Umrechnung, die man nur einmal falsch macht.
 *
 * ## Warum eine eigene Datei für vier kleine Funktionen
 *
 * Ein Preis kommt in **drei** Formen herein: als Zahl, als Zeichenkette (`"0.0000005"`) und als
 * Bruchteil eines Dollars **je Token**. Die Liste zeigt ihn als USD **je 1 Mio Token**. Wer diese
 * Umrechnung an zwei Stellen schreibt, hat irgendwann zwei Preise für dasselbe Modell — und beide
 * sehen richtig aus.
 *
 * ## Warum `-1` für „unbekannt" steht und nicht `0`
 *
 * Gemessen am 15.10.2026 über `GET /api/v1/models`: `typesafe/jev-router` trägt den Preis `-1`,
 * und die Einzelabfrage nennt gar keinen. Wäre „unbekannt" eine `0`, stünde dieses Modell in jeder
 * Liste **ganz vorn** — als das billigste. Wer nach dem Preis sortiert, würde also ausgerechnet
 * das Modell bevorzugen, dessen Rechnung niemand kennt. Deshalb hat „weiß ich nicht" hier eine
 * eigene Zahl, und jede Sortierung muß sie behandeln.
 *
 * @module @prometheus-harness/tariffs/preis
 */

/** Der Wert, der „unbekannt" heißt. Niemals als Preis lesen. */
export const UNBEKANNT = -1

/** Ein Preis in USD je 1 Mio Token. `-1` heißt unbekannt — siehe {@link UNBEKANNT}. */
export interface Preis {
  /** Hinein: was die Anfrage kostet. */
  readonly hinein: number
  /** Heraus: was die Antwort kostet. */
  readonly heraus: number
}

/**
 * Rechnet „je Token" in „je 1 Mio Token".
 *
 * **Warum gerundet wird.** `0.0000005 * 1_000_000` ergibt in IEEE-754 nicht zwingend `0.5`,
 * sondern je nach Bitmuster `0.49999999999999994`. Ein solcher Wert in einer Liste sähe nach einem
 * Meßwert aus und wäre ein Rechenrest. Sechs Nachkommastellen sind für USD je 1 Mio Token
 * reichlich; darunter ist jede Angabe der Dienste ohnehin gerundet.
 *
 * @param jeToken - der Preis je einzelnem Token
 * @returns der Preis je 1 Mio Token, auf sechs Nachkommastellen gerundet
 */
export function jeMioToken(jeToken: number): number {
  return Math.round(jeToken * 1_000_000 * 1e6) / 1e6
}

/**
 * Liest eine Zahl, die auch als Zeichenkette kommen darf.
 *
 * **Warum das nötig ist.** Die Models-API von OpenRouter liefert Preise als **Zeichenketten**
 * (`"pricing": {"prompt": "0.0000005"}`) — vermutlich, weil eine Zahl in JSON die Genauigkeit
 * verlöre. Ein `typeof === 'number'`-Test würde diese Preise **still** verwerfen, und jedes Modell
 * stünde als „unbekannt" in der Liste.
 *
 * @param wert - der gelesene Wert
 * @returns die Zahl oder `undefined`, wenn keine darin steht
 */
export function alsZahl(wert: unknown): number | undefined {
  if (typeof wert === 'number') return Number.isFinite(wert) ? wert : undefined
  if (typeof wert !== 'string') return undefined
  const text = wert.trim()
  if (text === '') return undefined
  const zahl = Number(text)
  return Number.isFinite(zahl) ? zahl : undefined
}

/**
 * Ist dieser Preis bekannt — also ein Preis und nicht die Marke für „weiß ich nicht"?
 *
 * @param wert - der Preis
 * @returns ob er als Preis gelesen werden darf
 */
export function istBekannt(wert: number): boolean {
  return Number.isFinite(wert) && wert >= 0
}

/**
 * Sind **beide** Seiten eines Preises bekannt?
 *
 * **Warum „beide" und nicht „eine".** Ein halber Preis ist kein Preis: `0.02` hinein und
 * „unbekannt" heraus ergibt keine vergleichbare Zahl. Wer nur die bekannte Seite liest, vergleicht
 * Äpfel mit Birnen und nennt das Ergebnis eine Rangfolge.
 *
 * @param preis - der Preis
 * @returns ob er vollständig bekannt ist
 */
export function preisBekannt(preis: Preis): boolean {
  return istBekannt(preis.hinein) && istBekannt(preis.heraus)
}

/** Der unbekannte Preis — die eine Stelle, an der er entsteht. */
export const PREIS_UNBEKANNT: Preis = { hinein: UNBEKANNT, heraus: UNBEKANNT }

/**
 * Die Summe beider Seiten — die Größe, nach der sortiert wird.
 *
 * **Warum die Summe und nicht der Hinein-Preis.** Der Hinein-Preis allein bevorzugte ein Modell,
 * das billig liest und teuer schreibt. Für eine Liste, die „was kostet mich das" beantworten soll,
 * ist die Summe die ehrlichere Zahl — sie ist grob, aber sie ist nicht einseitig.
 *
 * @param preis - der Preis
 * @returns die Summe, oder `undefined`, wenn eine Seite unbekannt ist
 */
export function summe(preis: Preis): number | undefined {
  if (!preisBekannt(preis)) return undefined
  return jeMioToken((preis.hinein + preis.heraus) / 1_000_000)
}

/**
 * Schreibt einen Preis für Menschen.
 *
 * @param preis - der Preis
 * @returns `0.50 / 9.00` oder `unbekannt`
 */
export function alsText(preis: Preis): string {
  if (!preisBekannt(preis)) {
    const teile: string[] = []
    teile.push(istBekannt(preis.hinein) ? preis.hinein.toFixed(2) : '?')
    teile.push(istBekannt(preis.heraus) ? preis.heraus.toFixed(2) : '?')
    return `${teile.join(' / ')} (unvollständig)`
  }
  return `${preis.hinein.toFixed(2)} / ${preis.heraus.toFixed(2)}`
}
