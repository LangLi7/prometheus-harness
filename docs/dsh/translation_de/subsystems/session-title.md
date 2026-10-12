# Session-Titel

English | [中文](session-title.zh.md)

Dauerhafter Latest-Wins-Titelzustand und das optionale Vokabular für asynchrone Provider, besessen von [`@deepseek-ai/dsh-session-title`](../../packages/session/session-title). Das gemeinsame Ausführungsmodul besitzt den exakten Datensatz der Hilfsanfrage. Paket-READMEs besitzen Timing, Fallback, Fehlerverhalten und Fork-Verhalten; der generierte [Persistenz-Katalog](../persistence-catalog.md) besitzt die vollständigen Event-Deklarationen.

Quellen: [`packages/session/session-title/src/index.ts`](../../packages/session/session-title/src/index.ts), [`packages/session/session-title-llm/src/index.ts`](../../packages/session/session-title-llm/src/index.ts)

## Dauerhafter Titelzustand

`SessionTitleProviderId` wird für von Providern erzeugte Revisionen aufgezeichnet. `SessionTitleEventData` listet die exakten Mensche-Nachrichten-Seqs, die für den Titel verwendet wurden, während `SessionTitleSnapshot` die dauerhaften Envelope-Fakten des Events hinzufügt, die `ctx.sessionTitle.get()` und `foldSessionTitle()` zurückgeben. Die `title`-Projektion behält ihren Version-1-Zustand und ihre Client-Ansicht als bloßen Titelstring oder `null`, sodass bestehende persistierte Cache-Zeilen lesbar bleiben.

```ts type-equiv
/** Identifies one session-title provider registration. */
type SessionTitleProviderId = Branded<'SessionTitleProviderId'>
```

```ts type-equiv
/** Exact auxiliary model route that produced a title. */
interface SessionTitleModelIdentity {
  /** Registered LLM provider route. */
  readonly provider: string
  /** Provider model id. */
  readonly model: string
}
```

```ts type-equiv
/** Durable ownership record for an accepted session title. */
type SessionTitleSource =
  | { readonly kind: 'fallback' }
  | {
    readonly kind: 'provider'
    readonly provider: SessionTitleProviderId
    readonly model?: SessionTitleModelIdentity
  }
  | {
    /** Explicit user rename: pins the title — automatic generation stops scheduling. */
    readonly kind: 'user'
  }
```

```ts type-equiv
/** Payload of the log-only `session/title` event. */
interface SessionTitleEventData {
  /** Normalized non-empty title text. */
  readonly title: string
  /** Exact human `user/message` seqs used to derive this title; empty for an explicit user rename. */
  readonly messageSeqs: SessionSeq[]
  /** Whether the built-in fallback, a registered provider, or the user supplied the title. */
  readonly source: SessionTitleSource
}
```

```ts type-equiv
/** Latest folded title plus the title event's durable envelope facts. */
interface SessionTitleSnapshot extends SessionTitleEventData {
  /** Seq of the latest `session/title` event. */
  readonly eventSeq: SessionSeq
  /** Timestamp of the latest `session/title` event. */
  readonly updatedAt: number
}
```

## Datensatz der Hilfsanfrage

Das gemeinsame Ausführungsmodul zeichnet jede validierte, dispatchbare Titel-Anfrage auf, bevor es das Modell aufruft. Die Nutzlast gibt die modellsichtbare System- und Nachrichteneingabe, das Routing, das Ausgabelimit, den aufgelösten Reasoning-Aufwand, die Provider-Ownership und die Zuordnung zu Quellnachrichten wieder, selbst wenn die Generierung später fehlschlägt.

```ts type-equiv
/** Exact model-visible request recorded before one auxiliary title dispatch. */
interface SessionTitleLlmRequestEventData {
  /** Registered title-provider identity responsible for the request. */
  readonly titleProvider: SessionTitleProviderId
  /** Exact human `user/message` seqs represented in `messages`. */
  readonly messageSeqs: SessionSeq[]
  /** Exact auxiliary LLM route. */
  readonly route: SessionTitleModelIdentity
  /** Exact auxiliary system prompt. */
  readonly system: string
  /** Exact auxiliary message list. */
  readonly messages: Message[]
  /** Exact auxiliary output-token cap. */
  readonly maxTokens: number
  /** Resolved reasoning effort when recorded; older requests can omit it. */
  readonly reasoningEffort?: ReasoningEffortId
}
```

## Provider-Eingabe und -Ausgabe

Der Dienst erstellt einen Schnappschuss der berechtigten Nachrichten über eine Revision und unmittelbar vor jedem Provider-Aufruf den letzten akzeptierten Titel einschließlich des Fallbacks, den er gerade sichergestellt hat. Ein Provider gibt nur Seqs aus dieser Anfrage zurück; die dienstseitige Annahme prüft die Reihenfolge, normalisiert den Titel, setzt die Byte-Grenze durch und hängt den Titel mit seinen Quellnachrichten-Seqs und seiner Quellart an.

```ts type-equiv
/** One eligible human text message exposed to title providers. */
interface SessionTitleUserMessage {
  /** Source `user/message` event seq. */
  readonly seq: SessionSeq
  /** Exact concatenated text-block content. */
  readonly text: string
}
```

```ts type-equiv
/** Automatic generation cadence owned by a registered provider. */
type SessionTitleAutomaticMode = 'first-prompt' | 'all-prompts'
```

```ts type-equiv
/** Immutable input supplied to one title-provider call. */
interface SessionTitleProviderRequest {
  /** Live session being titled. */
  readonly session: Session
  /** All eligible human messages through this generation revision. */
  readonly messages: readonly SessionTitleUserMessage[]
  /** Exact current logged main-request route, when one has been recorded. */
  readonly route?: SessionTitleModelIdentity
  /**
   * Latest accepted title captured at invocation, including an accepted
   * fallback whose event may follow the last eligible message. Absent before
   * any title is accepted. The provider decides whether and how to use it.
   */
  readonly currentTitle?: SessionTitleSnapshot
  /** Cancellation for supersession, disposal, timeout composition, or the explicit caller. */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/** Provider output before service-owned normalization and log acceptance. */
interface SessionTitleProviderResult {
  /** Proposed title text. */
  readonly title: string
  /** Exact seqs from `request.messages` used by this result. */
  readonly messageSeqs: readonly SessionSeq[]
  /** Auxiliary LLM route, when generation used a model. */
  readonly model?: SessionTitleModelIdentity
}
```

```ts type-equiv
/** One optional asynchronous title implementation registered with the service. */
interface SessionTitleProvider {
  /** Stable id of the provider recorded with the title. */
  readonly id: SessionTitleProviderId
  /** When new human prompts start automatic generation. */
  readonly automatic: SessionTitleAutomaticMode
  /**
   * Produce one title revision.
   * @param request - message snapshot, current title, current route, session, and cancellation.
   * @returns proposed title plus exact input seqs and the optional provider/model route used to generate it.
   */
  generate(request: SessionTitleProviderRequest): Promise<SessionTitleProviderResult>
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generiert aus dem Quellcode durch `scripts/gen-cordis-catalog.ts` (per `pnpm run verify-cordis-catalog` in doc-sync auf Aktualität geprüft; Neugenerierung mit `pnpm run gen-cordis-catalog`) — die Sprachseiten unterscheiden sich nur in lokalspezifischen gepaarten Dokumentpfaden. Signaturblöcke verwenden einen `ts cordis-catalog`-Fence und behalten das ursprüngliche Quell-JSDoc; Dispatch-Modi sind im [primer](../cordis-primer.md#dispatch-modes) definiert, und die vom Framework geerbte `ctx`-API liegt in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessiontitle--sessiontitleservice"></a>

### `ctx.sessionTitle` — `SessionTitleService`

Log-gestützte Titel-Faltung plus asynchrone Fallback-Generierung.

```ts cordis-catalog
/**
 * Read the latest folded title from one live or replayed session.
 * @param session - session whose log is the title source of truth.
 * @returns latest title snapshot, or `undefined` before eligible input.
 */
get(session: Session): SessionTitleSnapshot | undefined

/**
 * Accept an explicit user title. Appends a `session/title` event with the
 * `user` source, which pins the title: in-flight automatic generation is
 * superseded and later user messages schedule none (an explicit
 * {@link SessionTitleService.refresh} remains the deliberate unpin).
 * @param session - exact live session to rename.
 * @param title - raw user input; normalized before acceptance.
 * @returns the accepted title snapshot.
 * @throws {SessionTitleInvalidError} when the title normalizes to empty.
 * @throws {Error} when the session is not live or the service is disposed.
 */
rename(session: Session, title: string): SessionTitleSnapshot

/**
 * Explicitly retry the registered provider, or materialize the built-in
 * fallback when no provider is registered.
 * @param session - exact live session to refresh.
 * @param signal - optional caller cancellation.
 * @returns latest accepted title, or `undefined` when no eligible text exists.
 */
async refresh(session: Session, signal?: AbortSignal): Promise<SessionTitleSnapshot | undefined>

/**
 * Register the sole optional title provider. Disposal aborts its pending and
 * active work; a replacement may register once disposal has started, and the
 * closing provider's late results never commit.
 * @param provider - provider identity, cadence, and generation function.
 * @returns exact Cordis effect disposer, which settles after active calls quiesce.
 */
register(provider: SessionTitleProvider): () => Promise<void>
```

Types: [Session](session.md)

Quelle: [`packages/session/session-title/src/index.ts`](../../packages/session/session-title/src/index.ts)
<!-- END GENERATED cordis-surface -->
