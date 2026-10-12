# Core

English | [中文](core.zh.md)

Das **Core**-Subsystem ist [`packages/core`](../../packages/core/README.md) — die Pakete, die jede Komposition bootet: das event-sourced Session-Log, die System-Prompt-Assembly, die Tool-Registry, die Agent-Typen und der konkrete Loop, der sie antreibt. Diese Seite erklärt, was das Paar `agent`/`agent-loop` deklariert — wie ein Agent erzeugt und besessen wird und welche Delivery-, Cancellation- und Interception-Verträge das `Agent`-Handle hat — sowie die zwei Typmuster, denen jedes Subsystem folgt. Die eigenen Seiten der Gruppe und der Rest des Ordners sind im [Subsystem-README](README.md) indexiert.

## Das Rückgrat, Paket für Paket

Ein Turn fließt in einem Loop durch die sechs Pakete: der Treiber in [`agent-loop`](../../packages/core/agent-loop) beansprucht einen eingereihten Prompt, öffnet einen Turn im [Session-Log](session.md) (`ctx.sessions`), setzt das Request-Präfix über [system-prompt](system-prompt.md) (`ctx.systemPrompt`) zusammen und leitet die Historie aus dem Log ab, streamt die Modellantwort über die [LLM-Naht](llm-streaming.md), dispatcht Tool-Aufrufe über die [Tool-Registry](tools.md) (`ctx.tools`) und hängt jeden modellsichtbaren Fakt wieder an das Log an, bevor der nächste Step daraus ableitet. Das Konversationsvokabular, das der Loop bewegt — `Message`, `ContentBlock`, `StreamChunk`, die Modellanfrage — wird von [`packages/llm`](../../packages/llm/README.md) deklariert und auf [llm-streaming.md](llm-streaming.md) dokumentiert.

| Paket | Besitzt | Seite |
|---|---|---|
| `session/` | Das append-only `SessionEvent`-Log und den In-Memory-Store — die einzige Quelle der Wahrheit (`ctx.sessions`) | [session.md](session.md) |
| `system-prompt/` | Assembly von Prompt-Abschnitten und Tool-Schema (`ctx.systemPrompt`) | [system-prompt.md](system-prompt.md) |
| `tools/` | Die gescopte Tool-Registry und die abgesicherte Ausführungspipeline (`ctx.tools`) | [tools.md](tools.md) |
| `agent/` | Das `Agent`-Interface, die Live-Registry, den Initiator-Scope und das `agent/*`-Eventvokabular (`ctx.agents`) | diese Seite |
| `agent-loop/` | Den konkreten Treiber, der den öffentlichen `Agent`-Vertrag implementiert (`ctx.agentLoop`) | diese Seite |
| `scope/` | Das Scoped-Registration-Primitiv, auf dem die Registries und der Loop das Scoping pro Agent aufbauen | [scope.md](scope.md) |

`scope/` ist das eine Nicht-Service-Paket: eine abhängigkeitsfreie Bibliothek (`createScope`/`scopeOf`/`scopeTarget`), die im Modulgraphen unter `session/` und `system-prompt/` liegt, genau damit diese sie ohne Zyklus konsumieren können. `agent-loop` ist die eine konkrete Implementierung des öffentlichen `Agent`-Vertrags und liegt hier, weil er der Standardprodukt-Loop des Harness ist; er führt jeden Treiber innerhalb von `ctx.agents.withInitiator()` aus. Erweiterungs-Plugins hängen von `agent` ab — auch wenn sie den initiierenden Agent benötigen — und niemals direkt von `agent-loop`, sodass der Loop austauschbar bleibt. [`dsh-base`](../../packages/bundle/base/README.md) ist die Standardprodukt-Komposition, während [`dsh-sdk-minimal`](../../packages/bundle/sdk-minimal/README.md) einen kleineren eigenständigen Baum deklariert.

## Erzeugung und Eigentum

Consumer erzeugen Agents über `ctx.agents` — `create()` baut eine frische Session und einen Agent unter einer vom Aufrufer gelieferten `SessionId`, `resume()` lädt zuerst eine persistierte Session — oder deklarativ über die Config-Einträge des Loops. Die programmatische Erzeugung gibt das Handle des Owners zurück:

Source: [`packages/core/agent/src/index.ts`](../../packages/core/agent/src/index.ts)

```ts type-equiv
/**
 * An owned agent plus its disposer, returned by {@link AgentRegistry.create} /
 * {@link AgentRegistry.resume}. The disposer is a CAPABILITY: among consumers,
 * only the holder can tear this agent down. The registered factory provider is
 * also a structural owner because the scoped agent depends on that provider's
 * service API; provider unload stops and drains every live handle it made.
 * `dispose()` stops the loop, awaits its exit, unregisters the agent, removes
 * its session from the store, and finally unwinds its scoped world.
 *
 * `ctx.agents.get(id)` still returns a bare {@link Agent} — the handle is
 * exposed only to the consumer owner that created it; the structural provider
 * reaches the same teardown internally. Config-created agents (the loop's own
 * startup) are owned by the loop fiber and never need a handle.
 */
interface AgentHandle {
  agent: Agent
  dispose(): Promise<void>
}
```

`CreateAgentOptions` trägt die gemeinsame Identität und alles, was ein frischer Agent vor der Veröffentlichung braucht: einen optionalen laufenden `parentAgent`, Session-Metadaten (`meta` — validiertes `cwd`, Fork-Lineage, der `isSeeded`-Marker, Herkunftsklassifikation, Delegationstiefe und `agentPreset`), den exakten Fork-Schnitt im Geschwisterfeld `inheritedEventCount`, ein optionales `seed`-Replay-Präfix, `AgentOptions` pro Agent, ein nur für die Erzeugung geltendes Abbruch-`signal` und `setup`. `ResumeAgentOptions` ist das Gegenstück für persistierte Identität: `resumeSessionId`, `parentAgent`, `agentOptions`, `signal` und `setup`. Der `setup`-Callback (`AgentSetup`) erhält `(agentCtx, agent)`, während beide Ids noch unveröffentlicht sind: der Kontext besitzt die gescopten Registrierungen, während der explizite Agent die exakte Kind-Session ohne Rückwärtseigenschaft am Kontext liefert. Alles, was über `agentCtx` registriert wird, existiert vor `agent/created` und der ersten Prompt-Assembly. Setup darf einen synchronen Commit zurückgeben, der unmittelbar vor der Veröffentlichung aufgerufen wird; eine Ablehnung von Setup, ein werfender Commit oder die Entsorgung des Owners rollt die Transaktion zurück, ohne eine der beiden Ids zu veröffentlichen.

`AgentFactory` ist das Erzeugungsinterface hinter der Registry: der Loop registriert seine Factory über `ctx.agents.setFactory()`, sodass Consumer `ctx.agents` nutzen, ohne vom konkreten Loop-Paket abzuhängen. Ein Laufzeit-Kinderzeuger setzt `options.parentAgent`; die Registry reicht die Optionen und den Kontext des Aufrufers an die Factory weiter, ohne eines aus dem anderen abzuleiten. Die exakten `create`/`resume`-Signaturen und Rollback-Verträge stehen im [generierten Abschnitt](#ctxagents--agentregistry) unten.

## Das Agent-Handle

`Agent` ist die Oberfläche, gegen die jedes Plugin (UI, Hooks, Orchestratoren) programmiert; `ctx.agents.get(id)` gibt sie zurück, und der [Initiator-Scope](#initiating-agent) trägt sie. Die konkrete Implementierung ist paketintern in dsh-agent-loop; nichts außerhalb des Loops hängt von ihr ab. Die vereinheitlichte `send`-Methode legt Ziel- und Wakeup-Routing direkt offen; `followup`, `steer` und `inject` sind Aliasnamen mit festem Preset.

Source: [`packages/core/agent/src/types.ts`](../../packages/core/agent/src/types.ts)

```ts type-equiv
/** Public live-agent handle; the runtime face augments its live capabilities. */
interface Agent {
  /** Session-backed Agent identity. */
  readonly id: SessionId
  /** The provider route and model this agent's requests use. */
  readonly options: AgentOptions
  /** The live session this agent drives; its log is the durable source of truth. */
  readonly session: Session
  /** Agent-owned access to durable pending work. */
  readonly inbox: Inbox
  /** The current lifecycle state, mirrored on every `agent/status` transition. */
  readonly status: AgentStatus
  /** Agent-scoped context; its contributions are agent-local, unwind on disposal, and reject registration afterward. */
  readonly ctx: Context

  /**
   * Clear queued and steering work — unless `keepInbox` — and abort the active
   * turn or between-turn task. The first cause wins for that activity. With no
   * active activity, cancellation is a no-op and does not arm later work.
   * @param cause - the stable caller intent carried by the active operation signal.
   * @param options - cancellation options; `keepInbox` preserves pending work.
   */
  cancel(cause: AgentCancelCause, options?: CancelOptions): void

  /**
   * Resolve after the current whole-agent activity reaches quiescence. This
   * follows replacement work started before the observed driver retires,
   * but does not identify the settlement of any particular message.
   * @returns fulfillment after no active driver or maintenance task remains.
   */
  whenIdle(): Promise<void>

  /**
   * Run one non-turn maintenance task from the true idle phase. The task starts
   * synchronously after claiming that phase; later waking input remains in the
   * inbox until the task settles, while public status stays `idle`.
   * `whenIdle()` follows both the task and any waking work released behind it.
   * @param task - operation whose fulfillment or rejection is preserved, with a signal aborted by {@link cancel}.
   * @throws synchronously when turn-driving or another maintenance task already owns the agent.
   * @returns the task promise.
   */
  runMaintenance<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T>

  /**
   * Route identified input to an inbox boundary and optionally wake the driver.
   * Waking input submitted after active cancellation is queued for the next
   * turn and runs when the aborted activity converges to idle; a `disposed`
   * cancel leaves it parked. A wake submitted while already idle always opens
   * its turn boundary, even when its message is cleared before the driver
   * claims ([driver wake convergence](../../agent-loop/src/agent.ts)).
   * @param message - identified content and the source that supplied it.
   * @param target - the preferred next-turn or next-step inbox boundary.
   * @param wakeup - whether delivery may wake the driver.
   */
  send(message: UserMessage, target: InboxTarget, wakeup: boolean): void

  /**
   * Queue an ordinary follow-up turn and wake the driver. The item becomes the
   * sole ordinary message of its own turn.
   * @param message - identified prompt content and the source that supplied it.
   */
  followup(message: UserMessage): void

  /**
   * Submit steering for the nearest step. An idle driver starts a turn;
   * a running driver consumes it at its next step boundary.
   * A rejected step leaves steering parked in the inbox until the next
   * wake; cancellation or disposal may discard pending steering.
   * @param message - identified steering content and the source that supplied it.
   */
  steer(message: UserMessage): void

  /**
   * Queue model-facing context for the next pre-step without waking the
   * driver. A running driver claims it at the nearest later step boundary;
   * idle drivers leave it pending until follow-up or steering
   * wakes them. It may miss a request whose pre-step already claimed its
   * batch. Cancellation or disposal may discard pending context.
   * @param message - identified injected context and the source that supplied it.
   */
  inject(message: UserMessage): void
}
```

```ts type-equiv
/**
 * An agent's lifecycle state, emitted on every transition as `agent/status`:
 * `idle` means no driver is active; `running` begins when waking input starts
 * cancellable pre-step processing and lasts while the driver drains,
 * closes, or checkpoints turns. Disposal removes the agent from its registry;
 * it is not a third observable status.
 */
type AgentStatus = 'idle' | 'running'
```

```ts type-equiv
/** One process-local live assistant streaming publication. */
type AssistantStreamFrame =
  | {
    readonly type: 'start'
    readonly attemptId: LlmAttemptId
    /** Monotone within one attached Agent lifecycle; replacement restarts at 1. */
    readonly revision: number
    readonly turn: number
    readonly step: number
  }
  | {
    readonly type: 'chunk'
    readonly attemptId: LlmAttemptId
    readonly revision: number
    /** Dense zero-based position within the attempt. */
    readonly index: number
    /** Safe-integer timestamp reused by the durable embedded stream. */
    readonly time: number
    readonly chunk: StreamChunk
  }
  | {
    readonly type: 'end'
    readonly attemptId: LlmAttemptId
    readonly revision: number
    /** Number of chunk frames emitted by this attempt. */
    readonly index: number
    /** Durable settlement committed before this notification, or live abandonment without one. */
    readonly outcome:
      | {
        readonly kind: 'committed'
        readonly eventType: 'assistant/message' | 'assistant/attempt'
        readonly seq: SessionSeq
      }
      | { readonly kind: 'abandoned' }
  }
```

`running` beschreibt das treiberweite Drain-Intervall und darf aufeinanderfolgende eingereihte Turns umfassen; es beweist nicht, dass ein Turn noch offen ist. Die Entsorgung entfernt den Agent aus der Registry und emittiert `agent/disposed`; es ist kein terminaler Statuswert. `followup()` gibt kein Handle zurück: seine `MessageId` identifiziert die dauerhaften Fakten von Einfügung, Anspruch und Verwerfen in der Inbox, nicht eine spätere Assistant-Ausgabe oder ein Turn-Ende. `whenIdle()` beobachtet den gesamten Agent, sodass Aufrufer ein Intervall von Beleg bis Idle nur dann einen Lauf nennen dürfen, wenn sie dieses Intervall explizit besitzen ([Entscheidung](../../.agents/notes/implemented/architecture/2026-07-30-followup-enqueue-and-owned-runs.md)).

```ts type-equiv
/** Merge-extensible agent creation options. Persona belongs to system-prompt sections. */
interface AgentOptions {
  /** Provider route (must have a registered adapter at call time). */
  provider?: string
  /** Model id interpreted by the selected provider adapter. */
  model?: string
  /** Adapter-owned reasoning effort for the selected provider/model route. */
  reasoningEffort?: ReasoningEffortId
  /** Maximum output tokens for each conversation-model request. */
  maxTokens?: number
}
```

Der Dispatch erfordert `provider` und `model` nach `agent/request`. Ein explizites `reasoningEffort` setzt die erste Anfrage auf dieser Route; die exakte Modellauflösung validiert ihn, während eine Auslassung den Adapter-Default materialisieren lässt. Wenn vorhanden, muss `maxTokens` eine positive ganze Sicherheitszahl sein und begrenzt jede Konversationsmodellanfrage; eine Auslassung lässt den Adapter-Default des exakten Modells vor dem Request-Header materialisieren oder lässt das Provider-Verhalten ansonsten unverändert. Ein agent-gescopter Prompt-Abschnitt `deployment:persona-prefix` darf die globale Standard-Persona überschatten.

Die Inbox ist das Delivery-Vokabular — zwei geordnete Listen ausstehender Nachrichten, die der Agent als dauerhafte Projektion besitzt:

```ts type-equiv
/** Agent-owned access to pending work; concrete storage belongs to the driver. */
interface Inbox {
  /** Prompts awaiting individual turns. */
  readonly nextTurn: readonly UserMessage[]
  /** Input awaiting the next step boundary. */
  readonly nextStep: readonly UserMessage[]

  /** Durably cancel all pending input, clearing next-step before next-turn. */
  clear(): void

  /**
   * Append one message to a pending list.
   * @param target - pending list to extend.
   * @param message - message to append.
   */
  append(target: InboxTarget, message: UserMessage): void

  /**
   * Prepend one message to a pending list.
   * @param target - pending list to extend.
   * @param message - message to prepend.
   */
  prepend(target: InboxTarget, message: UserMessage): void

  /**
   * Replace one pending message in place.
   * @param messageId - identity of the pending message to replace.
   * @param newMessage - replacement message.
   * @returns whether the message was still pending.
   */
  replace(messageId: MessageId, newMessage: UserMessage): boolean

  /**
   * Remove one pending message.
   * @param messageId - identity of the pending message to remove.
   * @returns whether the message was still pending.
   */
  remove(messageId: MessageId): boolean

  /**
   * Apply standard splice semantics and durably record the normalized result.
   * @param target - pending list to mutate.
   * @param start - splice position.
   * @param deleteCount - maximum number of messages to remove.
   * @param inserted - messages to insert at the resolved position.
   * @returns messages removed by the splice.
   */
  splice(
    target: InboxTarget,
    start: number,
    deleteCount: number,
    inserted: UserMessage[],
  ): UserMessage[]
}
```

```ts type-equiv
/** One of the two ordered pending-message lists owned by an agent. */
type InboxTarget = 'next-turn' | 'next-step'
```

Jedes ausstehende Vorkommen ist seine `UserMessage`; `MessageId` ist die einzige Identität. Die strukturellen `Inbox`-Methoden zeichnen normalisierte dauerhafte `agent/inbox/spliced`-Mutationen auf und weisen doppelte ausstehende Ids zurück. `replace(messageId, newMessage)` und `remove(messageId)` lokalisieren die ausstehende Nachricht über beide Listen hinweg; eine Ersetzung darf die Identität ändern und emittiert die alte Nachricht als verworfen, gefolgt von der neuen Nachricht als eingefügt. Gewöhnliche Entfernungen und `clear()` sind Stornierungen. An einer Step-Grenze entfernt das paketinterne `ReactLoopInbox` von dsh-agent-loop den vorgeschlagenen Batch — alle `next-step`-Eingaben plus, an einer Turn-Grenze, eine `next-turn`-Nachricht — über reine Lösch-Splices ohne Verworfen-Benachrichtigungen und emittiert dann Anspruchs-Benachrichtigungen pro Nachricht. Erkennung und Anspruch ausstehender Arbeit nur für den Loop sind nicht Teil von `Agent.inbox`. Der `AgentLoop`-Service registriert die Standard-`inbox`-Projektion, bevor er seine Factory veröffentlicht; ihre Zelle ist der einzige Live-Zustand, und derselbe Fold dient kalten Consumern, selbst wenn kein Agent existiert. Der Fold weist unsichere oder außerhalb des Bereichs liegende Splice-Koordinaten und doppelte Identitäten über beide Listen hinweg zurück und identifiziert fehlerhafte dauerhafte Historie über die Event-Seq. Consumer, die einer Nachricht folgen, verwenden die exakten Benachrichtigungen `agent/inbox/inserted`, `claimed` und `discarded`.

Stornierung:

```ts type-equiv
/** Options for {@link Agent.cancel}. */
interface CancelOptions {
  /**
   * Preserve queued and steering inbox items instead of discarding them. The
   * active turn is still aborted, but un-started and pending work survives for a
   * later turn and no canceled inbox splice is logged.
   */
  keepInbox?: boolean | undefined
}
```

```ts type-equiv
/** Why an active agent driver was cancelled. */
type AgentCancelCause =
  | { readonly kind: 'user' }
  | { readonly kind: 'parent' }
  | { readonly kind: 'hook'; readonly reason: string }
  | { readonly kind: 'disposed' }
```

Die Ursache ist eine von TypeScript erzwungene Same-Process-Eingabe. Ein aktiver Stornierungshalter legt dasselbe Objekt als nur zur Laufzeit existierenden `AbortSignal.reason` offen; ein Signal gewährt kooperierenden Listenern keine Klassifikationsbefugnis. Das dauerhafte `turn/end` zeichnet das Ergebnis als `{ kind: 'aborted', reason: TurnEndCancelCause }` auf, sodass die Stornierungsursache im terminalen Ergebnis landet.

Die [Event-Taxonomie](../architecture.md#events) besitzt die Lebenszyklus-, Checkpoint- und Waterfall-Verträge von `agent/*`. Turn- und Step-Grenzen sind dauerhafte Session-Events und keine Agent-Emits.

## Initiierender Agent

Der prozesslokale Initiator, den `ctx.agents` trägt, ist der exakte `Agent` von oben, kein separater Rahmen und keine kopierte Identität. Umgebungspräsenz ist weder Lebendigkeitsnachweis noch Autorisierung; die [Entscheidung zum Initiator-Scope](../../.agents/notes/implemented/architecture/2026-07-15-agent-initiator-scope.md) definiert seine Lebensdauer und Scope-Regeln.

## Interception-Entscheidungen

Pre-Step-Entscheidungen verwenden denselben identifizierten `UserMessage`-Typ wie dauerhafte Eingaben mit Nutzerrolle. Der eingetretene Batch ist autoritativ und bewahrt `id` und `source` jeder Nachricht. Hook-Brücken bilden ihre nativen Entscheidungsfelder auf dieses typisierte Ergebnis ab.

Source: [`packages/core/agent/src/types.ts`](../../packages/core/agent/src/types.ts)

`agent/pre-step` erhält ein Payload mit dem exklusiv beanspruchten Batch (`messages`), den Koordinaten des vorgeschlagenen Steps (`turn`, `step`) und dem Abbruch-`signal` des aktuellen Turns. Der initiale Vorschlag läuft innerhalb eines offenen Turns vor jedem Step; eine Tool-Fortsetzung darf zwischen Steps einen leeren beanspruchten Batch einreichen:

Es gibt eine `PreStepDecision` zurück. Reject öffnet keinen Step. Enter liefert den vollständigen Nachrichtenbatch, der nach `step/start` angehängt wird; beanspruchte Nachrichten, die die endgültige Entscheidung auslässt, bleiben entfernt, während Eingaben, die nach dem Anspruch eingefügt wurden, ausstehend bleiben:

```ts type-equiv
/** Whether and with which messages the loop enters a proposed step. */
type PreStepDecision =
  | { kind: 'reject' }
  | {
    kind: 'enter'
    messages: UserMessage[]
    /** Start a distinct model-message series before this step's admitted messages. */
    startsRequestSeries?: true
  }
```

`agent/request-error` läuft, nachdem ein fehlgeschlagener Modell-Step geschlossen ist und bevor sein Turn schließt. Listener dürfen dauerhaften Zustand reparieren oder auf Policy-Arbeit warten, während das Signal des fehlgeschlagenen Turns noch lebt. Ein behandelnder Listener gibt `{ kind: 'retry' }` zurück, ohne `next()` aufzurufen; das standardmäßige `undefined` lässt den Fehler terminal.

```ts type-equiv
/** Action returned by a listener that owns model-request recovery. */
type RequestErrorAction = { kind: 'retry' } | undefined
```

`agent/pre-step` ist die einzige Waterfall-Listenerkette vor der Request-Ableitung. `agent/turn-stopping` läuft, wenn ein Turn keine Tool- oder Steering-Fortsetzung hat, vor einem letzten Steering-Drain.

`agent/created` trägt eine `SessionStartSource` (warum der Session-Lebenszyklus begann; eine Brücke schlüsselt ihren SessionStart-Matcher darauf):

```ts type-equiv
/** Why a session lifecycle began; seeded creates are `startup`, while persisted loads are `resume`. */
type SessionStartSource = 'startup' | 'resume' | 'clear' | 'compact'
```

## Sessions

Eine `Session` ist ein **append-only Log** typisierter `SessionEvent`s — die einzige Quelle der Wahrheit. Die LLM-Nachrichtenhistorie wird aus dem Log *abgeleitet* (`deriveMessages()`), nicht separat gespeichert. Jeder Eintrag trägt eine monotone `seq`, eine `time` und ein über `type` unterschiedenes `data`-Payload; Surface-Varianten dürfen außerdem zitierte frühere Events in `sourceEventSeqs` auflisten und ein `surfaceOp` tragen.

Die exakten bedingten Felder der `SessionEvent`-Envelope, die dreizehn Kern-Eventvarianten (`turn/start`, `turn/end`, `step/start`, `step/end`, `user/message`, `system/message`, `assistant/message`, `assistant/attempt`, `tool/call`, `tool/result`, `request/header`, `request/context`, `session/end-seed`), die Projektionsregeln von `deriveMessages()`, die Gründe von `TurnEndReason` sowie die Regeln für Execution Enclosure und Standalone-Events stehen auf **[session.md](session.md)**. Wie das Log dauerhaft gemacht wird — das `SessionPersistence`-Interface, der JSONL-Provider, der `session/flush`-Checkpoint, Crash-Recovery und `SessionHeader` — steht auf **[persistence.md](persistence.md)**.

## `ToolDefinition`

Der eine Pipeline-Autorentyp, der zum Core gehört: was jedes registrierte Tool *ist* — ein modellseitiges `ToolSchema` plus eine `execute`-Funktion und optionale Final-Content- und UI-Callbacks. Ein Tool-Autor konstruiert ihn selten von Hand (die `defineTool`-DSL baut ihn mit typisierten Argumenten), aber er ist der Vertrag, den die Registry hält und durch den der Loop dispatcht.

Seine vollständigen Felder, die typisierte Schema-DSL `defineTool`/`ValueSchemaSpec`/`ParameterSchemaSpec`, die Waterfall-Typen `ToolExecution`/`ToolExecutionResult` und die UI-Typen der Tool-Präsentation stehen auf **[tools.md](tools.md)**.

## Repoweite Typmuster

Zwei Muster kehren in jedem Subsystem wieder und werden einmal dokumentiert, hier.

<a id="the-map--derived-union-pattern"></a>

### Das Muster `…Map → derived-union`

Nahezu jeder erweiterbare Summentyp im Harness folgt einem Muster: ein Interface, geschlüsselt nach einem Diskriminanten-Tag (die `…Map`), aus dem die Union mit `keyof` abgeleitet wird. Plugins fügen Varianten per **Declaration Merging** hinzu — ohne Bearbeitung des besitzenden Pakets.

```ts ignore-check
// The pattern, schematically:
interface ThingMap {
  'a': { kind: 'a'; /* … */ }
  'b': { kind: 'b'; /* … */ }
}
type ThingKind = keyof ThingMap          // 'a' | 'b'
type Thing = ThingMap[keyof ThingMap]    // the discriminated union

// A plugin extends it without touching the source package:
declare module '@deepseek-ai/dsh-llm' {
  interface ThingMap {
    'c': { kind: 'c'; /* … */ }
  }
}
```

Fünf kanonische Maps verwenden dieses Muster; ein Plugin-Autor erweitert sie:

| Map | Paket | Leitet ab | Katalog |
|---|---|---|---|
| `ContentBlockMap` | dsh-llm | `ContentBlock` | [llm-streaming.md](llm-streaming.md#content-blocks-and-messages) |
| `MessageSourceMap` | dsh-llm | `MessageSource` | [llm-streaming.md](llm-streaming.md#content-blocks-and-messages) |
| `FinishReasonMap` | dsh-llm | `FinishReason` | [llm-streaming.md](llm-streaming.md#the-model-request-and-result) |
| `TurnEndReasonMap` | dsh-session | `TurnEndReason` | [session.md](session.md) |
| `SessionEventMap` | dsh-session | `SessionEvent` | [session.md](session.md) |

Zwei große diskriminierte Unions sind die, über die Consumer am häufigsten `switch`en: **`StreamChunk`** (das Streaming-Protokoll) und **`SessionEvent`** (der Log-Eintrag). Gemäß der Repo-Konvention über das Tag `switch`en — keine `if`-Ketten —, damit jeder Zweig sich verengt und ein vertipptes Tag nicht kompiliert.

### Gebrandete Ids

Ids, die zwischen Paketen übergeben werden, sind **gebrandet** — strukturell Zeichenketten, aber auf Typebene nicht austauschbar (eine `SessionId` kann nicht dort übergeben werden, wo eine `ToolCallId` erwartet wird). Die Konstruktion verwendet den gemeinsamen Helfer `brandString<T>()` oder eine owner-definierte validierende Factory; Vergleich, Protokollierung und JSON verhalten sich wie gewöhnliche Zeichenketten.

Das Primitiv `Branded<B>` und der zustandslose Konstruktor liegen in [dsh-brand](../../packages/util/brand), das keine Abhängigkeit auf eine Harness-Fähigkeit hat. `brandString<T>()` wendet eine reine Compile-Time-Brand auf eine Zeichenkette an.

Source: [`packages/util/brand/src/index.ts`](../../packages/util/brand/src/index.ts)

```ts type-equiv
/** A string carrying a compile-time-only brand `B`. */
type Branded<B extends string> = string & { readonly [BRAND]: B }
```

Die zwei Core-Ids sind `ToolCallId` (korreliert einen Tool-Aufruf mit seinem Ergebnis; dsh-llm) und `SessionId` (die gemeinsame Identität von laufendem Agent und dauerhafter Session; dsh-session). Capability-Pakete branden ebenfalls ihre eigenen Ids, etwa `JobId` in [jobs.md](jobs.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxagentdefaultmodel--agentdefaultmodelconfig"></a>

### `ctx.agentDefaultModel` — `AgentDefaultModelConfig`

Besitzt die Standard-Modellauswahl unabhängig von jedem Host oder Transport. Jede Operation liest die Referenzen der besitzenden Config.

```ts cordis-catalog
/**
 * Read the current default model selection.
 * @returns a detached provider, model, and optional reasoning selection.
 */
currentSelection(): ModelSelection

/**
 * Save the complete default model selection. A deployment without a configuration
 * editor keeps its composition entry. Saves commit in submission order; a failed
 * save rejects its caller without blocking later saves.
 * @param next - resolved selection accepted by an entry point.
 * @returns fulfillment after the optional profile write settles.
 */
async saveSelection(next: ModelSelection): Promise<void>
```

Source: [`packages/core/agent-default-model/src/index.ts`](../../packages/core/agent-default-model/src/index.ts)

<a id="ctxagentloop--agentloop"></a>

### `ctx.agentLoop` — `AgentLoop`

Konkreter Agent-Factory- und Treiber-Service.

```ts cordis-catalog
/**
 * Create an agent and session under one caller-supplied identity, owned by
 * the accessing fiber. Constructor-driven config calls mint a fresh combined
 * id before entering this boundary. When a persistence backend is mounted,
 * the session's durable identity and any seed are stored before publication.
 * @param id - shared agent/session identity.
 * @param options - concrete loop options.
 * @param meta - optional fresh-session workspace metadata.
 * @returns the published running agent.
 */
async create(id: SessionId, options: AgentOptions = {}, meta: Pick<SessionHeader, 'cwd'> = {}): Promise<Agent>

/**
 * Create an owned agent on a caller-supplied session id.
 * @param ownerCtx - caller context that structurally owns the lifecycle.
 * @param options - identities, optional live parent, session seed/metadata, loop options, setup, and cancellation.
 * @returns the published handle.
 */
async createAgent(ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle>

/**
 * Resume an owned agent from the configured persistence service.
 * @param ownerCtx - caller context that owns load, setup, and the live lifecycle.
 * @param options - persisted identity, optional live parent, loop options, setup, and cancellation.
 * @returns the published handle.
 */
async resume(ownerCtx: Context, options: ResumeAgentOptions): Promise<AgentHandle>
```

Types: [SessionHeader](persistence.md)

Source: [`packages/core/agent-loop/src/index.ts`](../../packages/core/agent-loop/src/index.ts)

<a id="ctxagentpresets--agentpresetregistry"></a>

### `ctx.agentPresets` — `AgentPresetRegistry`

Registry der in YAML deklarierten Presets und der Revisionen, die laufende Agents behalten.

```ts cordis-catalog
/** Register and eagerly load a definition; activation failure remains visible in the roster.
 * @param definition Parsed configuration supplied by the declaring plugin.
 * @returns Definition disposer after activation or its diagnostic settles; the declaring plugin owns it.
 */
async register(definition: PresetDefinition): Promise<() => Promise<void>>

/** Inspect retained revisions, or the exact revision an Agent joined.
 * @param ctx - optional Agent context; omission includes all retained revisions.
 * @returns detached module references and isolation diagnostics; no match returns an empty list.
 */
inspectCompositions(ctx?: Context): AgentPresetInspection[]

/** Read every declared preset, including activation failures.
 * @returns Display metadata and loading diagnostics.
 */
async list(): Promise<AgentPreset[]>

/** Read the selection roster.
 * @returns Current presets, each marked when it is the default.
 */
@Remote('list') async remoteExportList(): Promise<AgentPresetRoster>

/** Resolve an identity without starting an Agent.
 * @param id Explicit preset or the current default.
 * @returns Current metadata, including failure when activation failed.
 */
async resolve(id?: string): Promise<AgentPreset>

/** Read one declaration's child plugin list as YAML, for viewing only.
 * @param agentPreset Preset identity.
 * @returns The declared composition beside its published metadata.
 */
@Remote('read') readDocument(agentPreset: string): Promise<AgentPresetDocument>

/** Bind an unpublished Agent to the current preset revision.
 * @param ctx Agent context from its setup callback.
 * @param id Requested preset, or the default.
 * @returns Bound preset identity.
 */
async mount(ctx: Context, id?: string): Promise<AgentPreset>

/** Join a child to the exact revision retained by its parent.
 * @param ctx Child Agent context.
 * @param parent Parent Agent context.
 * @returns Inherited preset id, or undefined in a preset-free composition.
 */
composeFrom(ctx: Context, parent: Context): string | undefined

/** Read the preset a live Agent uses.
 * @param ctx Agent context.
 * @returns Its preset id, if bound.
 */
composedPreset(ctx: Context): string | undefined

/** Read a service supplied inside an Agent's isolated preset group.
 * @param agent Agent whose composition is queried.
 * @param name Cordis service name.
 * @returns The service, or undefined.
 */
serviceFor<K extends string & keyof Context>(agent: { ctx: Context }, name: K): Context[K] | undefined

/** Rebind a blank Agent; the caller owns the blank-session check.
 * @param ctx Agent context.
 * @param id Requested preset.
 * @returns The bound identity.
 */
async recompose(ctx: Context, id: string): Promise<AgentPreset>

/** Select a preset before a session starts its first turn.
 * @param agent Target Agent.
 * @param agentPreset Requested identity.
 * @returns Committed preset identity.
 */
@Remote('select') async select(agent: Agent, agentPreset: string): Promise<string>

/** Read current registrations for cold transcript presentation.
 * @param id Preset identity or the default.
 * @returns A revision lease; dispose it after the scoped read completes.
 */
async acquireScope(id?: string): Promise<{ key: ScopeKey } & AsyncDisposable>

/** Read plugin rows without creating an Agent.
 * @returns Current declaration metadata and activation states.
 */
compositionInventory(): Promise<AgentPresetComposition[]>
```

Types: [ScopeKey](scope.md)

Source: [`packages/preset/agent-preset-registry/src/index.ts`](../../packages/preset/agent-preset-registry/src/index.ts)

<a id="ctxagents--agentregistry"></a>

### `ctx.agents` — `AgentRegistry`

Agent-Service (`ctx.agents`): verfolgt laufende Agents und trägt den initiierenden Agent durch eine prozesslokale asynchrone Treiberkette. Die Agent-*Erzeugung* wird von dem Plugin bereitgestellt, das die AgentFactory implementiert (`@deepseek-ai/dsh-agent-loop`), registriert über setFactory.

Initiator-Methoden liefern nur Same-Process-Kausalzuschreibung. Umgebungspräsenz ist weder Lebendigkeitsnachweis noch Autorisierung; Subjekte und Owner bleiben explizit, ebenso die Identität an Worker-, Prozess-, Persistenz- und Wire-Grenzen. Zurückgegebene Promise-Grenzen werden während des Abbaus gedraint, außer eine verschachtelte Lineage, die das Entladen einer besitzenden Fiber startet, ist von ihrem eigenen Drain ausgenommen.

```ts cordis-catalog
/**
 * Read the Agent that initiated the inherited asynchronous driver chain.
 * Use this optional form for logging, tracing, metrics, or host attribution
 * that also supports agentless calls. When a parent creates a child, setup
 * reports the causal parent while the setup callback's Agent parameter
 * identifies the child.
 * @returns the inherited Agent, or `undefined` outside an initiator boundary
 *   and inside an explicit clearing boundary.
 * @throws when this service instance has been disposed.
 */
currentInitiator(): Agent | undefined

/**
 * Read the initiating Agent and fail when no initiator boundary is active.
 * Use this for private helpers contractually below a driver, or for a
 * deployment-owned outbound request whose contract forbids agentless calls.
 * Generic or direct-call paths use optional lookup or explicit request fields.
 * @returns the inherited Agent.
 * @throws when no initiator is active or this service instance has been disposed.
 */
requireInitiator(): Agent

/**
 * Run an operation with one exact Agent as its process-local initiator. The
 * exact synchronous value or Promise returned by the operation is preserved.
 * Custom drivers and test harnesses wrap their complete returned foreground
 * lifetime.
 * A queue or wire receiver may establish this boundary only after validating
 * explicit identity and resolving the exact live Agent; this method does neither.
 * Detached work remains owned by the subsystem that starts it.
 * @param agent - initiating Agent to inherit; presence is neither liveness proof nor authorization.
 * @param operation - synchronous or asynchronous operation to invoke.
 * @returns the exact value returned by `operation`.
 * @throws when the initiator scope is closing/disposed, or when `operation` throws.
 */
withInitiator<T>(agent: Agent, operation: () => T): T

/**
 * Run an operation inside a boundary that hides any inherited initiating
 * Agent. The exact synchronous value or Promise is preserved.
 * Use this while creating lazy shared timers, queue pumps, pool maintenance,
 * watchers, or exporters so they do not inherit the first Agent that happens
 * to initialize them. It clears only initiator attribution, not explicit
 * fields, and does not own or drain detached resources.
 * @param operation - synchronous or asynchronous operation to invoke without an initiator.
 * @returns the exact value returned by `operation`.
 * @throws when the initiator scope is closing/disposed, or when `operation` throws.
 */
withoutInitiator<T>(operation: () => T): T

/**
 * Register the agent-creation factory (the loop calls this on construction,
 * effect-scoped). A traced Cordis service is canonicalized to its concrete
 * target; each create/resume call is then traced through that caller's
 * context so ownership follows the caller without stacking proxy layers.
 * Throws if a factory is already registered. Returns the disposer; on
 * dispose the factory slot is cleared.
 * @param factory - the loop-owned factory {@link create}/{@link resume} delegate to.
 * @returns the disposer that clears the factory slot. The exact
 *   Cordis effect disposer (single-shot): composite (generator) effects may
 *   yield it directly — exact identity nests the teardown in order.
 */
setFactory(factory: AgentFactory): () => void

/**
 * Create and publish a new agent through the registered factory.
 * Distinct from {@link register} (which records an already-constructed
 * agent): this constructs the agent and its session. Rejects if no factory is
 * registered or creation/setup fails. The resolved {@link AgentHandle} lets
 * the owner tear down exactly this agent.
 * @param options - shared identity, optional live parent, session seed/metadata, and agent options.
 * @returns the handle after setup, rollback-covered publication, and loop start complete.
 */
async create(options: CreateAgentOptions): Promise<AgentHandle>

/**
 * Load a persisted session and resume an agent on it through the registered
 * factory. Rejects if no factory is registered; the factory rejects if
 * session persistence is not configured or persistence/setup fails.
 * @param options - persisted identity, optional live parent, configuration, and setup.
 * @returns the handle after setup, rollback-covered publication, and loop start complete.
 */
async resume(options: ResumeAgentOptions): Promise<AgentHandle>

/**
 * Register a live agent with source `startup`. Rejects if the id is already registered or a
 * serial `agent/created` listener fails. Emits `agent/disposed`
 * when the calling fiber is disposed — both with the agent's scope carrier
 * (`scopeTarget(agent, agent)`): the subject is the agent in hand, so the
 * emits are scope-filtered regardless of which context invoked `register`
 * (calling through `agent.ctx` scopes EFFECTS; dispatch scoping always
 * requires passing the carrier). The entry is a runtime root; factory-backed
 * creation uses `options.parentAgent` for child ownership. Await the registration before using the agent.
 * @param agent - the already-constructed agent to record in the store.
 * @returns the awaitable Cordis effect disposer (single-shot; a repeat call
 *   returns undefined without awaiting an in-flight teardown). Exact
 *   identity is load-bearing: a composite (generator) effect that owns a
 *   teardown ORDER — the agent factory's lifecycle chain — must yield THIS
 *   function so Cordis nests the unregistration at that yield position;
 *   yielding a wrapper would leave it disposing as a concurrent sibling on
 *   owner unload, unregistering the agent (and emitting `agent/disposed`)
 *   while its final turn is still draining.
 */
register(agent: Agent): ReturnType<Context['effect']>

/**
 * Insert an already-constructed agent without announcing it. This is the
 * advanced ordered-lifecycle primitive used by the async agent factory: it
 * first completes setup while the agent is unpublished, then assigns the
 * returned detach closure into its pre-installed composite teardown before
 * calling {@link announce}. Ordinary callers use {@link register}.
 * @param agent - the prepared, unpublished agent.
 * @param owner - explicitly supplied live runtime owner, or
 *   undefined for a top-level runtime root. This is runtime ownership, not
 *   the resumed session's durable parent lineage.
 * @returns an idempotent closure that removes this exact entry and emits
 *   `agent/disposed` with listener failures contained. When called from a
 *   `agent/created` listener, removal and disposal wait until the serial
 *   creation dispatch settles.
 */
enter(agent: Agent, owner: Agent | undefined): () => void

/**
 * Announce an agent previously inserted with {@link enter}.
 * @param agent - the live inserted agent to announce.
 * @param source - fresh creation, resume, clear, or compaction source.
 * @param signal - optional factory initialization cancellation signal passed to listeners.
 * @returns completion of the serial creation listeners; a listener failure rejects.
 * @throws if `agent` is not the exact live registry entry for its id, or its
 *   creation announcement already began (including a reentrant call from a
 *   creation listener).
 */
async announce(agent: Agent, source: SessionStartSource, signal?: AbortSignal): Promise<void>

/**
 * Look up a live agent.
 * @param id - the shared agent/session id to look up.
 * @returns the agent, or undefined when no live agent has that id.
 */
get(id: SessionId): Agent | undefined

/**
 * Test whether a live agent was created through one exact parent agent's
 * scoped context. Runtime ownership is independent of durable session
 * lineage and remains unambiguous when unrelated providers reuse an id.
 * @param id - the candidate child agent's shared agent/session id.
 * @param owner - the expected runtime creator agent.
 * @returns true only while the exact child entry is live under that owner.
 */
isOwnedBy(id: SessionId, owner: Agent): boolean

/**
 * All live agents, in registration order.
 * @returns a fresh array; mutating it does not affect the registry.
 */
list(): Agent[]

/**
 * All live top-level agents in registration order. A top-level agent was
 * created without an owning agent context; durable session lineage does not
 * affect this runtime relation, so a resumed fork may still be a root.
 * @returns a fresh array; mutating it does not affect the registry.
 */
roots(): Agent[]
```

Source: [`packages/core/agent/src/index.ts`](../../packages/core/agent/src/index.ts)

<a id="agent-events"></a>

### `agent/*` events

<a id="agentassistant-stream--emit"></a>

#### `agent/assistant-stream` — emit

Prozesslokale Veröffentlichung des Assistant-Streams. Chunk-Frames sind transient; der Loop hängt vor einem committeten End-Frame eine finale v2 `assistant/message` oder `assistant/attempt` mit demselben Stream an.

```ts cordis-catalog
/**
 * Process-local assistant-stream publication. Chunk frames are transient;
 * the loop appends one final v2 `assistant/message` or `assistant/attempt`
 * with the same stream before a committed end frame.
 * @param payload.agent - the agent whose attempt produced the frame.
 * @param payload.frame - one ordered start, chunk, or end publication.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/assistant-stream'(this: Scoped<Agent>, payload: { agent: Agent; frame: AssistantStreamFrame }): void
```

Types: [Scoped](scope.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentcreated--serial"></a>

#### `agent/created` — serial

Ein eingetretener Agent ist nach dem Factory-Setup bereit für die Initialisierung pro Agent. Listener laufen in Reihenfolge und werden abgewartet, bevor die Erzeugung auflöst. AgentLoop hält eingereihte Eingaben zurück, bis alle Listener fertig sind. Ein Throw oder eine Ablehnung lässt die Erzeugung fehlschlagen und überspringt spätere Listener. Die Entsorgung behält Scope und Session, bis der Dispatch abgeschlossen ist; Listener dürfen nicht auf agent.whenIdle() oder die Entsorgung ihres eigenen Owners warten.

```ts cordis-catalog
/**
 * An entered agent is ready for per-agent initialization after factory setup.
 * Listeners run in order and are awaited before creation resolves. AgentLoop
 * holds queued input until all listeners finish. A throw or rejection fails
 * creation and skips later listeners. Disposal retains the scope and session
 * until dispatch settles; listeners must not await agent.whenIdle() or their
 * own owner's disposal.
 * @param payload.agent - the newly registered agent with its live session and completed setup.
 * @param payload.source - fresh creation, resume, clear, or compaction source.
 * @param payload.signal - factory initialization cancellation signal, when provided.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode serial
 */
'agent/created'(this: Scoped<Agent>, payload: { agent: Agent; source: SessionStartSource; signal?: AbortSignal }): undefined | Promise<undefined>
```

Types: [Scoped](scope.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentdisposed--emit"></a>

#### `agent/disposed` — emit

Ein Agent hat die Registry verlassen; AgentLoop emittiert dies nach der Treiberruhe und dem Abbau der gescopten Registrierung, aber vor der Ablösung der Session. Nutzer einer eigenen Registry besitzen ihren Vertrag zur Treiberreihenfolge.

```ts cordis-catalog
/**
 * An agent left the registry; AgentLoop emits this after driver quiescence
 * and scoped-registration unwind, but before session detachment. Custom
 * registry users own their driver-ordering contract.
 * @param payload.agent - the exact agent removed from the registry.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/disposed'(this: Scoped<Agent>, payload: { agent: Agent }): void
```

Types: [Scoped](scope.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agenterror--emit"></a>

#### `agent/error` — emit

Ein Step oder Turn ist fehlgeschlagen. Die Maschine meldet hier einen Fehler, auch wenn der Fehler keine Position im Turn für eine dauerhafte Aufzeichnung hat.

```ts cordis-catalog
/**
 * A step or turn errored. The machine reports a failure here even when
 * the error has no in-turn position for a durable record.
 * @param payload.agent - the agent whose turn errored.
 * @param payload.turn - the turn in which the failure surfaced.
 * @param payload.step - the step at which the failure surfaced.
 * @param payload.error - the failure, verbatim.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/error'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; step: number; error: unknown }): void
```

Types: [Scoped](scope.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentinboxclaimed--emit"></a>

#### `agent/inbox/claimed` — emit

Eine Nachricht hat die Inbox innerhalb ihres offenen Turns verlassen. Wird der vorgeschlagene Step zurückgewiesen, endet die beanspruchte Nachricht hier: sie wird weder verworfen noch erneut als user/message emittiert, und der Turn schließt ohne Step.

```ts cordis-catalog
/**
 * One message left the inbox inside its open turn. If the proposed step
 * is rejected, the claimed message ends here: it is neither discarded nor
 * re-emitted as a user/message, and the turn closes without a step.
 * @param payload.agent - the agent whose inbox changed.
 * @param payload.message - the claimed message.
 * @param payload.turn - the owning turn.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/inbox/claimed'(this: Scoped<Agent>, payload: { agent: Agent; message: UserMessage; turn: number }): void
```

Types: [Scoped](scope.md) · [UserMessage](session.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentinboxdiscarded--emit"></a>

#### `agent/inbox/discarded` — emit

Eine Nachricht wurde aus der laufenden Inbox verworfen.

```ts cordis-catalog
/**
 * One message was discarded from the live inbox.
 * @param payload.agent - the agent whose inbox changed.
 * @param payload.message - the discarded message.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/inbox/discarded'(this: Scoped<Agent>, payload: { agent: Agent; message: UserMessage }): void
```

Types: [Scoped](scope.md) · [UserMessage](session.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentinboxinserted--emit"></a>

#### `agent/inbox/inserted` — emit

Eine Nachricht ist in die laufende Inbox eingetreten.

```ts cordis-catalog
/**
 * One message entered the live inbox.
 * @param payload.agent - the agent whose inbox changed.
 * @param payload.message - the inserted message.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/inbox/inserted'(this: Scoped<Agent>, payload: { agent: Agent; message: UserMessage }): void
```

Types: [Scoped](scope.md) · [UserMessage](session.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentpre-step--waterfall"></a>

#### `agent/pre-step` — waterfall

Einen vorgeschlagenen Step zurückweisen oder die Nachrichten ersetzen, die in ihn eintreten. Der Aufruf von `next()` bewahrt die aktuellen Nachrichten.

```ts cordis-catalog
/**
 * Reject a proposed step or replace the messages that enter it. Calling
 * `next()` preserves the current messages.
 * @param payload.agent - the agent proposing the step.
 * @param payload.messages - messages removed from the inbox for this step.
 * @param payload.turn - the turn that will own the step.
 * @param payload.step - the step proposed by the loop.
 * @param payload.signal - the current turn's cancellation signal.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode waterfall
 */
'agent/pre-step'(this: Scoped<Agent>, payload: { agent: Agent; messages: UserMessage[]; turn: number; step: number; signal: AbortSignal }, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>
```

Types: [Scoped](scope.md) · [UserMessage](session.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentrequest--waterfall"></a>

#### `agent/request` — waterfall

Die eingefrorene Aufrufkonfiguration ersetzen. `await next()` liefert die Konfiguration, die die Maschine verwenden würde (Agent-Optionen bei der ersten Anfrage, danach den protokollierten Header); eine Ersetzung zurückgeben, um zu wechseln. Bei der Step-Admission läuft dies nach der Assembly und `step/start`, bevor der System-Prompt und der akzeptierte Nutzerbatch committet werden. Eine Stornierung hier oder während der anschließenden `prepareCall()`-Auflösung committet keines von beiden. Die vorbereitete Call-Capability bestimmt die Prompt-Admission. Modellsichtbarer Inhalt muss protokollierte Kanäle verwenden; dieser Waterfall kann Nachrichten nicht mutieren.

```ts cordis-catalog
/**
 * Replace the frozen call configuration. `await next()` yields the config
 * the machine would use (agent options on the first request, the logged
 * header afterwards); return a replacement to switch. On step admission,
 * this runs after assembly and `step/start`, before the system prompt and
 * accepted user batch are committed. Cancellation here or during subsequent
 * `prepareCall()` resolution commits neither. The prepared call capability
 * governs prompt admission. Model-visible content must use logged channels;
 * this waterfall cannot mutate messages.
 * @param payload.agent - the agent making the model call.
 * @param payload.turn - the open turn number.
 * @param payload.step - the step whose request this is.
 * @param payload.signal - the current turn's explicit abort signal.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode waterfall
*/
'agent/request'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; step: number; signal: AbortSignal }, next: () => Promise<LlmCallConfig>): Promise<LlmCallConfig>
```

Types: [LlmCallConfig](llm-streaming.md) · [Scoped](scope.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentrequest-error--waterfall"></a>

#### `agent/request-error` — waterfall

Einen fehlgeschlagenen Modellanfrageversuch behandeln, bevor der Loop es erneut versucht oder seinen Step schließt. Ein Listener gibt `{ kind: 'retry' }` zurück, ohne `next()` aufzurufen, wenn er die Wiederherstellung besitzt, oder ruft `next()` auf, um zu delegieren. Das standardmäßige `undefined` lässt den Fehler terminal.

```ts cordis-catalog
/**
 * Handle one failed model-request attempt before the loop retries or closes
 * its step. A listener returns `{ kind: 'retry' }` without calling `next()`
 * when it owns recovery, or calls `next()` to delegate. The default
 * `undefined` leaves the failure terminal.
 * @param payload.agent - the agent whose request failed.
 * @param payload.turn - the turn containing the failed request.
 * @param payload.step - the step containing the failed request attempt.
 * @param payload.provider - the provider selected for the failed request.
 * @param payload.failure - serializable facts normalized at the final adapter boundary.
 * @param payload.retryPolicy - the policy of the adapter registration that served the failed request.
 * @param payload.signal - the turn abort signal.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode waterfall
 */
'agent/request-error'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; step: number; provider: string; failure: LlmFailure; retryPolicy: ResolvedRetryPolicy | undefined; signal: AbortSignal }, next: () => Promise<RequestErrorAction>): Promise<RequestErrorAction>
```

Types: [LlmFailure](llm-streaming.md) · [ResolvedRetryPolicy](llm-streaming.md) · [Scoped](scope.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentstatus--emit"></a>

#### `agent/status` — emit

Der Agent-Status hat sich geändert (`idle` ⇄ `running`). Eine weckende Zustellung tritt synchron in `running` ein, nachdem sie die Stornierung reserviert hat; `idle` bedeutet, dass kein Treiber mehr geplant oder aktiv ist.

```ts cordis-catalog
/**
 * Agent status changed (`idle` ⇄ `running`). A waking delivery enters
 * `running` synchronously after reserving cancellation; `idle` means no
 * driver remains scheduled or active.
 * @param payload.agent - the agent whose status flipped.
 * @param payload.status - the status just entered (the transition's destination).
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/status'(this: Scoped<Agent>, payload: { agent: Agent; status: AgentStatus }): void
```

Types: [Scoped](scope.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentturn-stopping--serial"></a>

#### `agent/turn-stopping` — serial

Der Turn steht kurz vor dem Schließen: das Modell schuldet keine Antwort (keine laufenden Tool-Aufrufe, kein frisches Steering). Wird abgewartet, bevor die Grenze committet — ein Listener, der widerspricht, steuert (`agent.steer(...)`) und die Maschine liest ihre Inbox erneut: frisches Steering führt einen weiteren Step aus, keines schließt den Turn. Daten entscheiden, sodass die Listener-Reihenfolge das Ergebnis nicht ändern kann. Die umgekehrte Kontrolle (eine Tool-Schleife früh stoppen) sind ebenfalls Daten: ein Tool-Ergebnis mit `concludesTurn` beendet den Turn bei seinem Step. Der Abschluss kurzschließt niemals bereits eingereichte Next-Step-Arbeit: `additionalContexts` desselben Steps oder konkurrierendes Steering laufen weiterhin, und der Turn schließt erst, wenn diese Inbox leergelaufen ist.

```ts cordis-catalog
/**
 * The turn is about to close: the model owes no response (no live tool
 * calls, no fresh steering). Awaited before the boundary commits — a
 * listener that objects steers (`agent.steer(...)`) and the machine
 * re-reads its inbox: fresh steering runs another step, none closes the
 * turn. Data decides, so listener order cannot change the outcome. The
 * inverse control (stop a tool loop early) is data too: a tool result
 * carrying `concludesTurn` ends the turn at its step. The conclusion
 * never short-circuits already-submitted next-step work: same-step
 * `additionalContexts` or racing steering still runs, and the turn
 * closes only when that inbox drains.
 * @param payload.agent - the agent whose turn is at its stop boundary.
 * @param payload.turn - the turn about to close.
 * @param payload.signal - the current turn's explicit abort signal.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode serial
 */
'agent/turn-stopping'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; signal: AbortSignal }): Promise<void> | void
```

Types: [Scoped](scope.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agent-loop-events"></a>

### `agent-loop/*` events

<a id="agent-loopconfig-start-failed--emit"></a>

#### `agent-loop/config-start-failed` — emit

Ein deklarativer Agent-Eintrag ist fehlgeschlagen, bevor er einen laufenden Agent veröffentlichen konnte. Consumer, die Arbeit für die konfigurierte Identität puffern, verwenden dieses transiente Signal, um diese Arbeit zurückzuweisen, statt ewig zu warten. Der normale Factory-Abbau unterdrückt Fehler aus dem stornierten Startversuch.

```ts cordis-catalog
/**
 * A declarative agent entry failed before it could publish a live agent.
 * Consumers that buffer work for the configured identity use this
 * transient signal to reject that work instead of waiting forever. Normal
 * factory teardown suppresses failures from the cancelled startup attempt.
 * @param payload.sessionId - exact shared agent/session identity that failed startup.
 * @param payload.error - persistence, setup, or publication failure.
 * @mode emit
 */
'agent-loop/config-start-failed'(payload: { sessionId: SessionId; error: unknown }): void
```

Source: [`packages/core/agent-loop/src/index.ts`](../../packages/core/agent-loop/src/index.ts)

<a id="agent-preset-events"></a>

### `agent-preset/*` events

<a id="agent-presetselected--emit"></a>

#### `agent-preset/selected` — emit

Eine Session hat ein anderes Agent-Preset in ihr dauerhaftes Log committet. Consumer invalidieren nur Zustand, der aus der Komposition dieser Session abgeleitet ist.

```ts cordis-catalog
/**
 * One session committed a different agent preset to its durable log.
 * Consumers invalidate only state derived from that session's composition.
 * @mode emit
 * @param sessionId - the session whose composition changed.
 * @param agentPreset - the preset recorded by the committed selection.
 */
'agent-preset/selected'(sessionId: SessionId, agentPreset: string): void
```

Source: [`packages/preset/agent-preset-registry/src/types.ts`](../../packages/preset/agent-preset-registry/src/types.ts)
<!-- END GENERATED cordis-surface -->
