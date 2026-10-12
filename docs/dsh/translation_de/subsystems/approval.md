# Nutzerfreigabe

English | [中文](approval.zh.md)

Die Naht für Nutzerfreigaben von [dsh-user-approval](../../packages/interaction/user-approval) beantwortet eine Frage: darf diese konkrete Aktion fortfahren? Sie besitzt das gemeinsame Vokabular für Anfrage/Ergebnis, den Dispatch-Service `ctx.approval`, den Answerer-Waterfall `approval/request`, das nur protokollierte Audit-Paar und die `ask`/`never`-Policy pro Session. UI-Kanäle können menschliche Answerer bereitstellen; die [ACP-Automatisierungsbrücke](../../packages/acp/acp) liefert Einmal-Entscheidungen durch Maschinen für ihre eigenen Agents. Aufrufer wie [dsh-tools](../../packages/core/tools) und [dsh-tool-bash](../../packages/shell/tool-bash) konsumieren das abgeschlossene Ergebnis und verhalten sich fail-closed, solange es nicht `allowed-once` ist.

Source: [`packages/interaction/user-approval/src/index.ts`](../../packages/interaction/user-approval/src/index.ts)

## Identität und Ergebnis

Jede Anfrage erhält eine frische `ApprovalRequestId`. Die Brand paart die Audit-Events `approval/asked` und `approval/decided`, ohne Freigabe-Ids mit Tool-Aufruf- oder Agent-/Session-Ids austauschbar zu machen.

```ts type-equiv
/**
 * Pairs one `approval/asked` audit event with its `approval/decided`.
 * Service-issued (one fresh id per {@link ApprovalService.request} call).
 */
type ApprovalRequestId = Branded<'ApprovalRequestId'>
```

`ApprovalOutcome` ist geschlossen und fail-closed. `allowed-once` gewährt nur die erfragte Aktion; Aufrufer lehnen bei `rejected`, `cancelled` und `unavailable` ab. Ein fehlender, nicht zuständiger, werfender oder nicht konformer Answerer wird zu `unavailable`, statt das Tor zu öffnen.

```ts type-equiv
/**
 * Closed approval outcomes: a one-shot grant, explicit rejection, withdrawn
 * request, or unavailable answerer. Callers fail closed on `unavailable`.
 */
type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'
```

## Policy pro Session

`ApprovalPolicy` bestimmt, was geschieht, bevor interaktive Answerer laufen. `ask` delegiert an die zusammengesetzte Answerer-Kette, deren Default ohne Antwort `unavailable` ist; `never` liefert deterministisch `rejected`, ohne irgendeinen Answerer zu dispatchen. Der effektive Wert ist das letzte `approval/policy`-Event im Session-Log, mit Rückfall auf die Service-Config. Consumer lesen ihn mit `ctx.approval.effectivePolicy(session)`; `setApprovalPolicy(session, policy)` ist der einzige Schreibpfad, sodass Replay die Überschreibung rekonstruiert.

```ts type-equiv
/**
 * A session's approval policy — what happens to an {@link ApprovalService}
 * ask BEFORE any interactive answerer sees it:
 *
 * - `'ask'` (the default) — delegate to the composed answerers; with none
 *   composed the chain falls through to the fail-closed `'unavailable'`.
 * - `'never'` — never prompt anyone: every ask resolves `'rejected'`
 *   deterministically. The strict headless stance (CI, unattended runs) and
 *   the policy whose outcome is knowable without asking.
 */
type ApprovalPolicy = 'ask' | 'never'
```

Beide Policies tragen ihre vollständige aktuelle Bedeutung zum cache-sicheren Runtime-Context-Snapshot bei. Das mit Herkunft versehene `user/message` ist die dauerhafte, modellsichtbare Eingabe; eine Änderung des Freigabezustands hängt einen neuen vollständigen Snapshot nach der beibehaltenen Historie an, ohne die `system/message`-Knoten zu berühren, die den gerenderten System-Prompt halten.

## Freigabeanfrage

`ApprovalRequest` identifiziert Agent und Tool-Aktion so genau, dass die Frage geroutet und auditiert werden kann. Sie lässt Tool-Argumente bewusst aus: ein Answerer hängt den Prompt über `callId` an den bereits gestreamten Tool-Aufruf an, statt eine zweite Kopie zu rendern, die abdriften könnte. Das optionale `displayReason` trägt locale-spezifische Zeichenketten des Anfragenden zur Präsentation; `reason` bleibt der Audit-Text.

```ts type-equiv
/**
 * Readonly same-process permission question. `callId` links to an already
 * presented tool call, so arguments are not duplicated here.
 */
interface ApprovalRequest extends ApprovalRequestEvent {
  /**
   * The agent on whose behalf the question is asked. Routes the question (a
   * UI answerer only answers for agents it owns) and receives the audit
   * events on its session log.
   */
  readonly agent: Agent
  /** The tool the question is about (presentation and audit). */
  readonly toolName: string
  /**
   * The exact tool call being decided, when the asker has one — lets a UI
   * attach the prompt to the tool call it already streamed.
   */
  readonly callId?: ToolCallId
  /** The asker's human-readable explanation of WHY it is asking. */
  readonly reason?: string
  /**
   * Aborting withdraws the question: the request settles `'cancelled'`
   * immediately and a late answer from a still-pending answerer is discarded.
   */
  readonly signal?: AbortSignal
}
```

## Dispatch und Audit

`ctx.approval.request(req)` verlangt, dass die anfragende Session sich in einem offenen Turn befindet. Sie hängt `approval/asked` an, erhält ein Ergebnis, hängt das passende `approval/decided` an und löst mit diesem Ergebnis auf. Die `never`-Policy wird innerhalb des Service vor dem Waterfall-Dispatch durchgesetzt, sodass selbst ein später mit `prepend` registrierter Answerer sie nicht umgehen kann. Answerer geben ein Ergebnis zurück, wenn sie die Anfrage besitzen, oder rufen `next()` auf, um zu delegieren; die erste Antwort besetzt den einzigen Entscheidungsplatz.

Die Audit-Events sind nur protokolliert und gelangen nicht in das Modelltranskript. Modellsichtbares Verhalten ist das abgeleitete Tool-Ergebnis des Aufrufers plus der aktuelle Runtime-Context-Snapshot. Die Entsorgung des Service entfernt seinen Kontextbeitrag; Answerer-Listener sind unabhängig voneinander effektgebunden an ihre besitzenden Plugins.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxapproval--approvalservice"></a>

### `ctx.approval` — `ApprovalService`

Freigabe-Service, der die Session-Policy vor den Answerern anwendet und jedes Paar aus Anfrage und Ergebnis am anfragenden Session protokolliert. Er legt deterministische Policy-Änderungen über den Runtime-Context-Snapshot und Switch-Notices für das Modell offen.

```ts cordis-catalog
/**
 * Switch one live agent's policy and queue the transition for its next model
 * step. Session initialization uses {@link setApprovalPolicy} directly
 * because there is no previously visible policy to change.
 * @param agent - the live agent whose policy is changing.
 * @param policy - the new effective policy.
 */
setPolicy(agent: Agent, policy: ApprovalPolicy): void

/**
 * Ask the composed answerers to decide one readonly same-process request.
 * The service borrows the request, agent, session, and live signal directly.
 * The request requires an open turn because the audit pair must be enclosed
 * by the durable log's commit/replay boundary; an idle ask rejects before
 * appending anything. The answerer phase always produces an outcome: an
 * aborted signal yields `'cancelled'`, a missing or throwing answerer yields
 * `'unavailable'` (fail closed), and a rogue non-vocabulary return value is
 * normalized to `'unavailable'`. A failure that prevents either audit append
 * from committing still rejects because returning an unlogged decision would
 * violate the pair. Session contains post-commit observer failures, so an
 * authoritative append cannot reject the request or suppress its matching
 * audit event.
 * @param req - the pending decision (agent, tool identity, reason, signal).
 * @returns the closed outcome; `'allowed-once'` is the only grant.
 * @throws when no turn is open or either audit event fails before the session
 *   append commit point.
 */
async request(req: ApprovalRequest): Promise<ApprovalOutcome>

/**
 * Read the session override without applying the configured default.
 * @param session - session whose log supplies the override.
 * @returns the last logged policy, or `undefined` without one.
 */
overrideOf(session: Session): ApprovalPolicy | undefined
```

Types: [Agent](core.md) · [Session](session.md)

Source: [`packages/interaction/user-approval/src/index.ts`](../../packages/interaction/user-approval/src/index.ts)

<a id="approval-events"></a>

### `approval/*` events

<a id="approvalrequest--waterfall"></a>

#### `approval/request` — waterfall

Zusammengesetzte Answerer um eine Entscheidung bitten. Ein Ergebnis zurückgeben, um die Anfrage zu beanspruchen, oder `next()` aufrufen, um zu delegieren. Scope-gefilterter Dispatch (`@deepseek-ai/dsh-scope`): agent-gescopte Listener erhalten nur diesen Agent.

```ts cordis-catalog
/**
 * Ask composed answerers for one decision. Return an outcome to claim the
 * request or call `next()` to delegate. Scope-filtered dispatch
 * (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @param req - pending approval request.
 * @mode waterfall
 */
'approval/request'( this: Scoped<Agent>, req: ApprovalRequestEvent, next: () => Promise<ApprovalOutcome>, ): Promise<ApprovalOutcome>
```

Types: [Agent](core.md) · [Scoped](scope.md)

Source: [`packages/interaction/user-approval/src/types.ts`](../../packages/interaction/user-approval/src/types.ts)
<!-- END GENERATED cordis-surface -->
