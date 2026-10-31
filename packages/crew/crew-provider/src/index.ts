/**
 * `@prometheus-harness/crew-provider` — die Naht zwischen Planungskern und Seam.
 *
 * ## Was dieses Paket schließt
 *
 * `crew-plan` plant und führt aus, kennt aber keinen Modellaufruf. Der Seam von Prometheus kennt
 * Modellaufrufe, aber keine Rollen. Hier trifft beides aufeinander:
 *
 * - **`crewAnbieter`** — eine Crew als `LlmProvider` unter dem Namen `crew:<id>`. Jede Anfrage wird
 *   über `routen` einer Rolle zugeordnet und mit dem **Modell dieser Rolle** an den Anbieter der
 *   Rolle gegeben. Der Kern sieht einen Anbieter wie jeden anderen; nichts wird umgebaut.
 * - **`crewLauf`** — ein Ziel durch die Crew: Planer fragen (oder Plan hereinreichen), Wellen
 *   abarbeiten, prüfen. Das ist die Ausführung, die `crew-plan` allein nicht leisten konnte, weil
 *   ihr `rufeRolle` fehlte.
 * - **`pruefeCrew`** — die Prüfung, die der Harness **nicht im Host** hatte: eine Rolle, die auf
 *   die Route `crew` zeigt, wäre eine Crew in einer Crew. Der Harness verhinderte das nur im
 *   Modellwähler (`ModelDropdown.tsx:86`); hier wird es abgewiesen.
 *
 * ## Die Grenze, die bleibt und benannt ist
 *
 * **Der Seam trägt keine Bilder.** `MessagePart` ist `TextPart | ToolResultPart | ToolCallPart` —
 * es gibt keinen Bildteil. Die Rolle `vision` ist damit nur über eine **Beschreibung als Text**
 * erreichbar (`bildBeschreibung`). Das ist keine Auslassung, sondern der Zustand des Seams; wer
 * Bilder will, erweitert zuerst ihn.
 *
 * @module @prometheus-harness/crew-provider
 */

export {
  CREW_ROUTE,
  crewAnbieter,
  crewModelle,
  pruefeCrew,
  type Anbieterwahl,
  type CrewDefinition,
  type Rollenbindung,
} from './adapter.ts'

export { crewLauf, type CrewErgebnis, type CrewLaufOptionen } from './run.ts'

export { crewWerkzeuge, type CrewWerkzeugKontext } from './tools.ts'

export {
  EVAL_AUFGABEN,
  EVAL_KATEGORIEN,
  fuehreEval,
  mehrheit,
  pruefeKriterium,
  vergleiche,
  type ArmErgebnis,
  type AufgabenErgebnis,
  type Beantworte,
  type Bewerte,
  type EvalAufgabe,
  type EvalKategorie,
  type Kriterium,
  type Vergleichszeile,
} from './eval.ts'

export {
  armEinzelmodell,
  armRat,
  armSampling,
  bewerteMitRichter,
  type Preis,
} from './arme.ts'

export {
  JEV_SCHWELLEN,
  bewerteMitJev,
  festerJevClient,
  type JevClient,
  type JevSchwellen,
  type JevUrteil,
} from './jev.ts'
