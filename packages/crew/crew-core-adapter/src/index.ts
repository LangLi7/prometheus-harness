/**
 * `@prometheus-harness/crew-core-adapter` — die Crew am **Seam des Kerns**.
 *
 * ## Warum dieser Adapter der richtige für den Host ist
 *
 * Der Host lädt den Kern (`apps/cli` → `boot()`), und der Kern spricht
 * `LlmAdapter.stream(GenerateOptions)`. Unser eigener Seam (`LlmProvider.complete`) hat im Host
 * **keinen** Verbraucher. Dieser Adapter ist deshalb der einzige Weg, auf dem eine Crew im
 * laufenden Host im Modellwähler erscheint.
 *
 * ## Der Vorteil, den nur der Kern-Seam bietet
 *
 * Der Kern trägt **Bildblöcke** (`ContentBlockMap['image']`, `ModelModality = 'text' | 'image'`).
 * Hier wird eine Anfrage mit Bild **wirklich** an die Rolle `vision` geroutet; im eigenen Seam war
 * das unmöglich, weil `MessagePart` dort nur Text, Werkzeugergebnis und Werkzeugaufruf kennt. Der
 * Katalog meldet `inputModalities: ['text', 'image']` **nur**, wenn eine Bildrolle gebunden ist —
 * eine Zusage, die der Adapter einlösen kann.
 *
 * ## Was er nicht tut
 *
 * Kein Umbau des Stroms: Route und Modell werden umgeschrieben, der Strom des Ziel-Anbieters kommt
 * unverändert zurück. Wiederholung, Bildprojektion und Abbruch bleiben Sache des Kerns.
 *
 * @module @prometheus-harness/crew-core-adapter
 */

export {
  CREW_ROUTE,
  CrewAdapter,
  pruefeCrew,
  type CrewEintrag,
  type LlmVersand,
  type Rollenbindung,
  type Sprache,
} from './adapter.ts'
