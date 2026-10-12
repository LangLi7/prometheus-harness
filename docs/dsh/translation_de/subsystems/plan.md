# Plan-Modus

English | [中文](plan.zh.md)

Der Plan-Modus ist protokollierter Kollaborationszustand pro Agent, besessen von [dsh-plan-mode](../../packages/plan/plan-mode) (`ctx.planMode`, `PlanModeController`): solange er aktiv ist, wird ein von der Deployment besessener Anweisungsabschnitt in jede Modellanfrage aufgenommen. Der Plan-Modus ist **weiche Anweisung**. [Sandbox-Modus](sandbox.md) und [Freigaberichtlinie](approval.md) erzwingen Einschränkungen unabhängig davon; keiner von beiden liest oder schreibt den Plan-Zustand, daher konfiguriert die Deployment sie getrennt. Das Paket ist optional, und der Agent-Loop hängt nicht davon ab. Es steuert den Prompt-Abschnitt `plan:policy` bei und registriert das Tool `exit_plan_mode` sowie den Befehl `/plan`. Die [Design-Referenz](../../packages/plan/plan-mode/README.md) besitzt die Begründung; das [Paket-README](../../packages/plan/plan-mode/README.md) besitzt die Details zu Model Experience und Einschränkungen.

Quelle: [`packages/plan/plan-mode/src/index.ts`](../../packages/plan/plan-mode/src/index.ts)

## Protokollierter Zustand und Wiederherstellung

`plan/mode` (`{ active: boolean }`) ist ein [Session-Event](session.md), das nur im Log steht und den ganzen Wert ersetzt: dauerhaft und wiederabspielbar, niemals im Modelltranskript. Die optional registrierte `plan`-Unit faltet den committeten Modus, den Abschluss von Befehlen und den Modus, der im letzten Anfrage-Header aufgezeichnet wurde. `ctx.planMode` liest diesen Zustand über `stateOf()`; der erste abhängige Zugriff schlägt fehl, wenn die Registry, der Schlüssel `plan` oder der Schlüssel `turnBoundary` fehlt. Clients erhalten nur `{ active, pending }`; Resume, Fork und Compaction stellen beide aus dem Log wieder her. Die vollständige Event-Deklaration steht im [Katalog der Persistenz-Log-Events](../persistence-catalog.md).

## Ausstehende Auswahlen und das Anhängen vor dem Schritt

Da jedes Session-Event turn-eingeschlossen ist, bleibt eine Nutzerauswahl ausstehend, bis der nächste akzeptierte In-Turn-Pre-Step sie vor der Anfrageherleitung anhängt — in welchem Turn das auch geschieht. Eine Auswahl erzwingt nie eine Fortsetzung, sodass eine nach dem letzten akzeptierten Pre-Step eines Turns getroffene Auswahl in einem späteren Turn angehängt wird. `set(agent, active)` zeichnet die ausstehende Auswahl auf (ein No-op, wenn das Ziel dem protokollierten oder bereits ausstehenden Zustand entspricht), und `get(agent)` gibt `{ active: boolean; pending?: boolean }` zurück: den protokollierten Zustand, der zum Zusammensetzen des aktuellen Schritts dient, plus den ausgewählten Zustand, der auf das Anhängen wartet.

Der einzige Anhängepunkt, während ein Agent läuft, ist ein vorangestellter `agent/pre-step`-Listener. Er beobachtet jeden vorgeschlagenen Anfrageschritt, einschließlich Turn 1 Schritt 1 und Anfrage-Wiederherstellungs-Wiederholungen, ruft nachgelagerte Listener zuerst auf und hängt erst an, nachdem sie den Schritt akzeptiert haben. Die Prompt-Zulassung geschieht vor einem Turn und kann `plan/mode` nicht anhängen, sodass eine am Prompt getroffene Auswahl durch den ersten akzeptierten In-Turn-Pre-Step des Turns angehängt wird, den sie startet. Ein Anhängefehler kann den Turn nicht blockieren, und die Auswahl bleibt für einen späteren akzeptierten In-Turn-Pre-Step ausstehend. Eine angehängte Nutzerauswahl zeichnet außerdem eine plugin-stämmige `user/message`-Benachrichtigung auf, aber nur, wenn der letzte protokollierte Anfrage-Header den anderen Zustand beschrieb, sodass das Modell genau dann informiert wird, wenn sich sein Kontext geändert hat, und niemals redundant. Eine nach dem letzten akzeptierten Pre-Step eines Turns getroffene Auswahl bleibt prozesslokal und geht verloren, wenn der Prozess vor einem weiteren akzeptierten In-Turn-Pre-Step beendet wird ([README-Einschränkung](../../packages/plan/plan-mode/README.md#known-limitations-and-deferred-work)).

## Konfiguration

```ts type-equiv
/** Deployment-owned plan guidance. */
interface PlanModeConfig {
  /** Guidance rendered as the `plan:policy` prompt section while plan mode is active. */
  section: string
}
```

Ein fehlendes, leeres oder nicht-stringförmiges `section` und jeder unbekannte Schlüssel schlagen beim Laden des Plugins fehl, statt ignoriert zu werden. Solange der Plan-Modus aktiv ist, wird der exakte `section`-Text als [System-Prompt-Abschnitt](system-prompt.md) `plan:policy` an Position 50 gerendert; ein inaktiver Plan-Modus steuert keinen Text bei.

## Das Exit-Tool und der Befehl `/plan`

[`exit_plan_mode`](../tool-catalog.md#deepseek-aidsh-plan-mode) bleibt registriert, während der Plan-Modus inaktiv ist, sodass das Betreten oder Verlassen des Plan-Modus nur den Prompt-Abschnitt ändert, niemals den Tool-Katalog der Anfrage; eine Ausführung außerhalb des Plan-Modus schlägt fehl. Im Plan-Modus erfordert es einen vollständigen Markdown-Plan, der mit einer `#`-Überschrift beginnt, und legt ihn über den [user-questions-Seam](user-questions.md) zur Prüfung vor. Eine Zustimmung gibt `{ approved: true }` zurück und zeichnet einen stillen (nicht erzählten) ausstehenden Exit auf, der beim nächsten akzeptierten In-Turn-Pre-Step angehängt wird. Die Plan-Anweisung bleibt daher für den Rest des aktuellen Tool-Batches des Assistenten aktiv, und das Tool-Ergebnis selbst berichtet den Übergang. „Planung fortsetzen“ ist ein fehlgeschlagener Aufruf, der das Feedback des Nutzers trägt, sodass das Modell überarbeitet und erneut vorlegt. Eine verworfene Prüfung gibt `{ approved: false }` zurück und beendet den Turn, sodass der Plan-Modus aktiv bleibt, bis die nächste Nachricht des Nutzers eintrifft. Ein fehlender Interaktionskanal und ein Dienst-Reload während der Prüfung lassen den Aufruf ebenfalls fehlschlagen, statt den Plan-Modus stillschweigend zu verlassen.

Wenn [`ctx.commands`](commands.md) komponiert ist, registriert das Plugin `/plan [off|message]`: ein blankes `/plan` wählt den Plan-Modus, jede andere nicht leere Nachricht wählt ihn und reicht den Text anschließend über `agent.steer()` ein, sodass er unter der Plan-Anweisung zur gewöhnlichen protokollierten Nutzernachricht des nächsten Schritts wird, und das exakte Argument `off` wählt inaktiv, was außerdem einen ausstehenden Eintrag abbricht, bevor er angehängt und für eine Anfrage sichtbar wird.

## Der Dienst

`ctx.planMode` besitzt den protokollierten Plan-Zustand, wendet den ausgewählten Zustand beim Schrittbeginn an und erzählt ihn, und besitzt den Abschnitt `plan:policy`, den Befehl `/plan` und das stabile Exit-Tool; die Signaturen von `get`/`set` stehen im generierten [Dienstkatalog](#ctxplanmode--planmodecontroller).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generiert aus dem Quellcode durch `scripts/gen-cordis-catalog.ts` (per `pnpm run verify-cordis-catalog` in doc-sync auf Aktualität geprüft; Neugenerierung mit `pnpm run gen-cordis-catalog`) — die Sprachseiten unterscheiden sich nur in lokalspezifischen gepaarten Dokumentpfaden. Signaturblöcke verwenden einen `ts cordis-catalog`-Fence und behalten das ursprüngliche Quell-JSDoc; Dispatch-Modi sind im [primer](../cordis-primer.md#dispatch-modes) definiert, und die vom Framework geerbte `ctx`-API liegt in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxplanmode--planmodecontroller"></a>

### `ctx.planMode` — `PlanModeController`

`ctx.planMode`: besitzt den protokollierten Plan-Zustand, wendet den ausgewählten Zustand beim Schrittbeginn an und erzählt ihn, den Abschnitt `plan:policy`, den Befehl `/plan` und das stabile Exit-Tool. Client-Carrier legen die beschnittene Ansicht `{ active, pending }` der Projektion offen.

```ts cordis-catalog
/**
 * Read the logged plan state and any selected state awaiting the next
 * accepted in-turn pre-step.
 *
 * @param agent The agent to read.
 * @returns Current logged state plus a pending selection, when present.
 */
get(agent: Agent): { active: boolean; pending?: boolean }

/**
 * Select whether plan mode should be active. Between turns the method
 * appends the change immediately because no in-turn pre-step will run until
 * another prompt starts a turn. The open-turn fold is the idle signal:
 * agent status stays `running` through post-turn checkpointing, when no
 * further in-turn pre-step runs. During an open turn the selection remains
 * pending until the next accepted in-turn pre-step. Repeated selection of
 * the current or already-pending state is a no-op.
 *
 * @param agent The agent to switch.
 * @param active Whether plan mode should be active.
 * @returns what happened: `committed` (logged now), `queued` (awaiting the
 * next accepted in-turn pre-step), `cancelled` (an opposite pending selection
 * was cleared; the logged state already matches), or `noop` (already in that
 * state).
 */
set(agent: Agent, active: boolean): 'committed' | 'queued' | 'cancelled' | 'noop'
```

Types: [Agent](core.md)

Quelle: [`packages/plan/plan-mode/src/index.ts`](../../packages/plan/plan-mode/src/index.ts)
<!-- END GENERATED cordis-surface -->
