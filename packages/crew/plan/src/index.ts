/**
 * `@prometheus-harness/crew-plan` — der Planungskern einer Crew.
 *
 * ## Die Lücke, die dieses Paket füllt
 *
 * Eine Crew (Mehrmodell-Router) ist erst dann mehr als ein Modellname, wenn sie **planen** und
 * **ausführen** kann: eine Rolle zerlegt ein Ziel, andere Rollen arbeiten die Schritte ab, eine
 * Rolle prüft das Ergebnis, und der Stand überlebt Neustart und Verdichtung. Im DeepSeek Harness
 * lebt dieses Können in `dsh-llm-crew` (5 517 Zeilen Quelle) — es ist dort an den Cordis-Adapter,
 * an Settings und an den Turn-Hooks gebunden.
 *
 * Dieses Paket nimmt den **Kern** heraus und lässt die Naht weg: Rollen, Dokumente, Zerlegung,
 * Wellen, Prüfschleife. Es rechnet nur mit dem, was ihm gereicht wird — kein Modell, kein Netz,
 * keine Harness. Damit ist jede Regel hier ohne Schlüssel prüfbar, und die Naht (Adapter, Tools,
 * Turn-Hooks) wird später ein eigenes Unit.
 *
 * ## Der eine Unterschied, der zählt: der **Nutzer** steht im Pfad
 *
 * Der Harness legt seinen Plan unter `$DSH_HOME/crew/goals/<crew>/<projekt>.json` ab — pro Rechner,
 * nicht pro Person. Prometheus ist mehrbenutzig (`conversation_sessions.user_id`, Migration 0004).
 * Hier gehört jeder Plan **einem** Nutzer: `<verzeichnis>/<nutzer>/<crew>/<projekt>.json`. Ein
 * fremder Plan ist damit strukturell unerreichbar — nicht durch eine Abfrage, sondern durch den
 * Pfad.
 *
 * ## Was dieses Paket ausdrücklich NICHT tut
 *
 * - Es ruft **kein** Modell. Wer die Rolle ausführt, reicht `rufeRolle` herein.
 * - Es schreibt **keine** Datenbank. Der Speicher ist an ein Verzeichnis gebunden; wer PostgreSQL
 *   will, gibt einen anderen Speicher.
 * - Es prüft **nicht**, ob eine Rolle ein Modell hat. Ob eine Crew einsatzbereit ist, weiß nur die
 *   Naht.
 *
 * @module @prometheus-harness/crew-plan
 */

export {
  AUFGABEN_STAENDE,
  CREW_ROLLEN,
  MAX_AUFGABEN_JE_ROLLE,
  ZIEL_STAENDE,
  Aufgabengrenze,
  istAufgabenstand,
  istRolle,
  istZielstand,
  leererZustand,
  rollenstand,
  type Aufgabenstand,
  type CrewAufgabe,
  type CrewRolle,
  type CrewZiel,
  type CrewZustand,
  type Projektliste,
  type Rollenzustand,
  type Workspacezustand,
  type Zielstand,
} from './types.ts'

export {
  NUTZER_MUSTER,
  OHNE_PROJEKT,
  projektbereich,
  slug,
  type Projektbereich,
} from './scope.ts'

export {
  CrewZustandSpeicher,
  benenneProjektliste,
  beschraenkeAufgaben,
  entferneAufgabe,
  entferneProjektliste,
  fuegeAufgabeHinzu,
  offeneAufgaben,
  setzeAufgaben,
  setzeAufgabenstand,
  setzeProjektstand,
  setzeWorkspaceZiel,
  setzeZiel,
  schreibeProjektliste,
  zusammenfassung,
  type Aenderung,
  type Aufgabeneintrag,
  type Speicheroptionen,
} from './state.ts'

export {
  fuehreAus,
  routen,
  wellen,
  zerlegePlan,
  type Ausfuehrung,
  type Beanstandung,
  type Lauf,
  type PlanSchritt,
  type RatSitzung,
  type Rollenaufruf,
  type RufePersona,
  type RufeRolle,
  type SchrittErgebnis,
  type Urteil,
  type Wellenplan,
} from './plan.ts'

export {
  crewPlan,
  crewTodo,
  crewTodoStatus,
  crewWorkspace,
  type Werkzeugkontext,
  type Zustandsauskunft,
} from './tools.ts'

export {
  BEANSTANDUNG_SCHWEREN,
  CREW_PERSONAS,
  PERSONA_AUSGABE,
  PERSONA_KOPF,
  PERSONA_SITZE,
  PERSONA_TIERS,
  PERSONA_VORLAGEN,
  istPersona,
  personaPrompt,
  personenAm,
  type BeanstandungSchwere,
  type CrewPersona,
  type PersonaSitz,
  type PersonaTier,
  type PersonaVorlage,
} from './personas.ts'
