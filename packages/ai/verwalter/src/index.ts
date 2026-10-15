/**
 * `@prometheus-harness/verwalter` — der Verwalter des Verzeichnisses.
 *
 * ## Die Lücke, die er schließt
 *
 * Das Verzeichnis (`@prometheus-harness/verzeichnis`) **kann** messen, aber es läuft nicht von
 * selbst. Ohne diesen Verwalter wäre „gemessen" eine Auskunft, die **nie altert** — und ein neuer
 * Anbieter, ein neues Modell oder ein abgeschalteter Weg fiele niemandem auf.
 *
 * ## Die drei Teile
 *
 * | Teil | Aufgabe |
 * |---|---|
 * | `katalog.ts` | Das **dauerhafte** Ergebnis: was wann gemessen wurde, geprüft und abgelehnt |
 * | `ausleger.ts` | Legt **fremde** Antworten aus — durch den **Wächter**, mit Eskalation |
 * | `verwalter.ts` | Der Ablauf: wer läuft wann, was geschieht bei einem Aussetzer |
 *
 * ## Wo der Verwalter NICHT eingreift
 *
 * Er **wählt keine Modelle**. Welches Modell läuft, entscheidet der Endnutzer
 * (`@prometheus-harness/einstellungen`). Der Verwalter sagt nur, **was es gibt** — und ob er es
 * gemessen oder nur ausgelegt hat. Die beiden zu vermischen hieße, dem Nutzer die Wahl
 * wegzunehmen, die er ausdrücklich haben soll.
 *
 * @module @prometheus-harness/verwalter
 */

export {
  FASSUNG,
  LEER,
  TAKT_TAG,
  KatalogFehler,
  eintragAus,
  eintragFuer,
  istFrisch,
  leseKatalog,
  mitEintrag,
  schreibeKatalog,
  type Auslegung,
  type Katalog,
  type Katalogeintrag,
  type Takt,
} from './katalog.ts'

export { auslegeSchema, legeAus, type Auslegeauftrag, type Auslegeergebnis } from './ausleger.ts'

export {
  sollLaufen,
  verwalte,
  type Anlass,
  type Verwalterlauf,
  type Verwalteroptionen,
} from './verwalter.ts'
