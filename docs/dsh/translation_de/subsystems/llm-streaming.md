# LLM-Streaming

English | [中文](llm-streaming.zh.md)

Die Konversations- und Streaming-Typen aus [`packages/llm`](../../packages/llm/README.md): dauerhafte `Message`-Werte, nur für Anfragen geltende Nutzereingaben, gemeinsame `ContentBlock`-Varianten, die vollständig zusammengesetzte Modellanfrage, das rohe `StreamChunk`-Protokoll, den Adapter-Vertrag, den jeder Adapter implementieren muss, und den gemeinsamen Assembler. Die [Core-Pakete](core.md) halten und protokollieren diese Werte in jedem Turn; diese Seite deklariert sie.

Quelle: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

<a id="content-blocks-and-messages"></a>

## Content-Blöcke und Nachrichten

Eine Konversation besteht aus `Message`s; eine Nachricht ist ein Array typisierter **Content-Blöcke**. Die Block-Union leitet sich aus `ContentBlockMap` ab.

Quelle: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

```ts type-equiv
/**
 * Merge-extensible content blocks keyed by `type`. New core blocks must land
 * with adapter, UI, and compaction support. Tool-change blocks belong to
 * developer messages; `projectToolUpdates` selects what each route receives.
 */
interface ContentBlockMap {
  'text': TextBlock
  'reasoning': ReasoningBlock
  'image': ImageBlock
  'file': FileBlock
  'tool-call': ToolCallBlock
  'tool-addition': ToolAdditionBlock
  'tool-removal': ToolRemovalBlock
}
```

Die Block-Schnittstellen (vollständige Felder im Quellcode): `TextBlock` (`text`), `ReasoningBlock` (Denken, unterschieden vom sichtbaren Text), `ImageBlock` (ein dauerhaftes [Bild-Attachment](attachment.md)), `FileBlock` (ein dauerhaftes wörtliches [Datei-Attachment](attachment.md), das die Anfragezusammenstellung für jede Route zu Handle-Text projiziert) und `ToolCallBlock` (`id: ToolCallId`, `name`, `arguments` als Roh-JSON). Tool-Ergebnisse sind erstklassige `ToolResultMessage`-Werte mit `toolCallId`, Ergebnis-`content` und optionalem `isError`; sie sind keine Content-Blöcke. `ContentBlock = ContentBlockMap[ContentBlockType]`. Eine neue Modalität gehört nur dann in die merge-erweiterbare Map, wenn ihre Pfade für Adapter, UI, Compaction und dauerhaftes Replay sie berücksichtigen. Tool-Änderungsblöcke für Developer-Nachrichten werden gemäß der aufgelösten Route-Capability projiziert.

Der Bildzugriff gehört zur Anfragenserialisierung und nicht zum dauerhaften Attachment oder zur deterministischen Version der Anfragebilder. `resolveImageAttachmentAccess()` kombiniert den optionalen Host-Objektpfad des Attachment-Providers mit einem Mapping, das der Consumer für das Dateisystem der aktuellen Tool-Ausführung liefert. Das Ergebnis ist nur für diese Anfrage verfügbar und nimmt nicht an `variantId` teil.

Quelle: [`packages/llm/llm/src/content.ts`](../../packages/llm/llm/src/content.ts)

```ts type-equiv
/** Execution-world path that model tools can use to read one normalized attachment. */
interface ImageAttachmentAccess {
  /** Absolute path to immutable normalized bytes; callers must treat it as read-only. */
  readonlyPath: string
}
```

Quelle: [`packages/llm/llm/src/message.ts`](../../packages/llm/llm/src/message.ts)

Eine `Message` ist ein identifizierter, unveränderlicher Wert aus Rolle, Quelle und Inhalt. Vom Modell erzeugte Assistenten-Nachrichten benennen den Provider und das Modell, die sie erzeugt haben, und tragen optionale adapterprivate Replay-Daten in ihrer Quelle:

```ts type-equiv
/** Provider/model identity and adapter-private replay data for an assistant message. */
interface AssistantProviderMetadata {
  /** Provider route that produced the message. */
  provider: string
  /** Provider model id that produced the message. */
  model: string
  /**
   * Lossless-JSON adapter state needed to replay the provider response.
   * `LlmRuntime` exposes it to a target adapter only when that adapter instance
   * currently owns both this historical provider and the target provider.
   */
  replayState?: unknown
}
```

```ts type-equiv
/** Any persisted conversation message, discriminated by its `role`. */
type Message = MessageRoleMap[keyof MessageRoleMap]
```

`DeveloperMessage` zeichnet inkrementelle Änderungen der Agent-Session in Konversationsreihenfolge mit der Rolle `developer` auf. `ToolAdditionBlock.toolName` aktiviert die Definition, die durch die historische Header-Referenz des enthaltenden Session-Events ausgewählt wird; `ToolRemovalBlock.toolName` entfernt die aktive Definition. Beide Blöcke werden in anderen Nachrichtenrollen zurückgewiesen. `deferLoading` fordert unabhängig davon das verzögerte Laden von Definitionen an, ohne einen Addition-Datensatz zu benötigen. Siehe [Session](../../packages/core/session/README.md) für die Header-Bindung und das [LLM-Paket](../../packages/llm/llm/README.md#known-limitations-and-deferred-work) für Grenzen der Provider-Unterstützung. `ToolUpdate` ist `in-history` oder `addition-only` auf aufgelösten und vorbereiteten Modellmetadaten. `GenerateOptions.toolHistory` trägt `ToolHistory`: initiale `tools` und geordnete `updates`, wobei jedes eine Developer-`messageId` an seine historisch aufgelösten `additions` bindet. Die Laufzeit projiziert diesen Zustand in Provider-Deklarationen; sie ändert nicht die aktive Tool-Liste in protokollierten Headern.

Woher eine Nachricht stammt, ist selbst ein merge-erweiterbarer Summentyp:

```ts type-equiv
/**
 * Where a message (or injected content) came from, in the harness's own
 * vocabulary. Merge-extensible sum type — each producer declares its own
 * `kind` in its own module; there is no shared catch-all `plugin` kind.
 * Model and tool sources answer their role messages; user messages carry any
 * producer's kind, and consumers fall through unknown kinds.
 */
interface MessageSourceMap {
  user: { kind: 'user' }
  model: ModelMessageSource
  tool: ToolMessageSource
  'system-prompt': SystemPromptMessageSource
}
```

Produzentenidentität und Darstellungsform sind unabhängig. `kind` beantwortet *wer das erzeugt hat*; das optionale `form` beantwortet *um welche Art von Information es sich handelt*, und Consumer entscheiden, wie sie sie darstellen. Mehrere Produzenten können eine Form teilen, und ein Produzent kann über eine Session hinweg mehr als eine Form ausgeben. Die Werte sind semantisch und wachsen einzeln; ein fehlender oder nicht erkannter Wert verwendet den dokumentierten Standard und wird als undurchsichtiger Inhalt dargestellt:

```ts type-equiv
/**
 * The kind of information in producer-supplied context, declared by the
 * producer in the same `MessageSource`.
 *
 * `MessageSource.kind` answers *who produced this*; `form` answers *what kind
 * of thing it is*, and the two axes are deliberately independent — several
 * producers share one form, and one producer may emit more than one form over
 * a session.
 *
 * The vocabulary is SEMANTIC, never visual: a value states that the content is
 * a file's instructions or a catalog of available items, and a consumer decides
 * what that looks like. Colors, icons, ordering, and collapse defaults are the
 * consumer's business and must not enter this union. It grows one value at a
 * time as producers gain the structured fields their form needs; an absent or
 * unknown value is the documented default, presented as opaque content.
 */
type ContextForm =
  /** Instructions read out of workspace files the model is expected to follow. */
  | 'instructions'
  /** A catalog of items available in this session, republished as it changes. */
  | 'catalog'
  /** Current state, where a later snapshot from the same producer supersedes an earlier one. */
  | 'snapshot'
  /** A one-off account of something that just happened; it supersedes nothing. */
  | 'notice'
  /** A message another agent addressed to this one. */
  | 'relay'
  /** Material lifted out of another session's log, possibly reduced on the way in. */
  | 'recall'
```

```ts type-equiv
/** One named contribution to a `snapshot`-form context, in assembly order. */
interface ContextSnapshotSection {
  /** The contributing subsystem's name. */
  readonly name: string
  /** That contribution's model-facing text, exactly as assembled. */
  readonly text: string
}
```

```ts type-equiv
/**
 * Producer-declared {@link ContextForm} and the fields that form requires,
 * mixed into the source types that carry one.
 *
 * Discriminated by `form` so a producer cannot select a form without the
 * fields needed to present it: a `notice` must record its one-line
 * account, a `snapshot` its sections. Omitting `form` stays valid — an
 * undeclared context is the documented default.
 */
type ContextFormed =
  | { readonly form?: never }
  | { readonly form: 'instructions' }
  | { readonly form: 'catalog' }
  | {
    readonly form: 'snapshot'
    /** The named contributions this snapshot assembled, in order. */
    readonly sections: readonly ContextSnapshotSection[]
  }
  | {
    readonly form: 'notice'
    /** One-line account of what happened, shown without expanding the row. */
    readonly summary: string
  }
  | { readonly form: 'relay' }
  | { readonly form: 'recall' }
```

<a id="streamchunk--the-raw-protocol"></a>

## `StreamChunk` — das rohe Protokoll

Eine Streaming-Antwort verschachtelt mehrere typisierte Blöcke (Text, Reasoning, mehrere Tool-Aufrufe). `index` bindet jedes Delta an seinen Block; `block-end` trägt den vollständig zusammengesetzten `ContentBlock`, sodass Consumer Deltas nicht selbst neu zusammensetzen müssen. Es ist eine **geschlossene** diskriminierte Union — ein `switch` über `type` endet mit `assertNever`, sodass das Hinzufügen einer Variante die Kompilierung bei jedem Consumer bricht, der sie behandeln muss.

```ts type-equiv
/**
 * Adapter-private lossless-JSON state for replaying a successful response,
 * carried by a terminal `finish` chunk and stored on the assembled assistant
 * message's model source. Both halves stay opaque to the harness; only the
 * split is shared vocabulary, so assembly can keep stored metadata aligned
 * with stored content without reading either half.
 */
interface ReplayEnvelope {
  /** Response-level adapter-private metadata (ids, native stop reason). */
  response: unknown
  /**
   * Per-block adapter-private metadata, one entry per emitted block in
   * first-seen stream order. When assembly drops a block it drops the entry at
   * the same position; entries whose length does not match the emitted block
   * count discard the whole envelope. An adapter whose metadata is independent
   * of block structure omits this field and the envelope passes through
   * assembly unchanged.
   */
  blocks?: readonly unknown[]
}
```

```ts type-equiv
/**
 * Raw streaming protocol emitted by adapters.
 * Block indexes correlate interleaved deltas, and `block-end` carries the
 * assembled block. Adapters emit usage before the terminal finish and nothing
 * afterward; tool arguments remain raw JSON strings. An adapter implementation
 * may throw, but `LlmRuntime.stream()` normalizes that failure to a terminal
 * `error` or `aborted` finish before exposing it to consumers.
 */
type StreamChunk =
  | { type: 'block-start'; index: number; blockType: ContentBlockType }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: ToolCallId; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }
  | {
    type: 'finish'
    reason: FinishReason
    /** Replay metadata for a successful response; see {@link ReplayEnvelope}. */
    replayState?: ReplayEnvelope
  }
```

<a id="compact-assistant-streams"></a>

## Kompakte Assistenten-Streams

`AssistantStreamAccumulator` paart jeden `StreamChunk` mit seinem ursprünglichen Safe-Integer-Zeitstempel und erzeugt `AssistantStreamRecord[]`. Aufeinanderfolgende Text-, Reasoning- oder Tool-Argument-Deltas für denselben Block werden zu einem Datensatz mit `time0`, exakten Zeitstempel-Abständen und einem Array-Eintrag pro ursprünglichem Delta; jeder andere Chunk bleibt ein mit Zeitstempel versehener Rohdatensatz. Diese Darstellung entfernt wiederholte Event-Envelopes, ohne Token-Grenzen zu verbinden oder terminale Fakten, Usage-, Block-, Fehler- oder Replay-Fakten zu verwerfen.

`snapshot()` gibt einen losgelösten unveränderlichen Stream zurück. `expandAssistantStream()` prüft strikt Datensatzschlüssel, Member-Anzahlen, Indizes, Zeitstempel, Tool-Aufruf-Identität und verlustfreies JSON, bevor es die exakte zeitgestempelte Chunk-Sequenz wiederherstellt. Das Session-Log bettet diesen Stream in `assistant/message` für ein Oberflächenergebnis ein oder in `assistant/attempt` für einen Versuch ohne Oberflächennachricht.

Prozesslokale `agent/assistant-stream`-Frames tragen die Live-Darstellung. Dauerhaftes Replay und Restore-Validierung expandieren weiterhin die eingebettete Abrechnung; Telemetrie, Token-Abrechnung und Host-Faltungen lesen die kompakten Datensätze direkt. Leser auf Datensatzebene (`assistantStreamFirstTokenTime`, `assistantStreamHasVisibleContent`, `assistantStreamHasVisibleText`, `lastAssistantStreamChunk`, `assistantStreamChunks`, `joinAssistantStreamText`, `assembleAssistantStream` sowie das laufbezogene `runFirstTokenTime` und `runFirstVisibleTime`) beantworten Consumer-Fragen in einem Durchlauf über die Datensätze mit frühem Abbruch, sodass eine große Historie O(Datensätze) pro Abrechnung kostet statt O(Member) für die Expansion ([fold reference](../../packages/llm/llm/README.md)). `expandAssistantStream()` bleibt der validierende Pfad für Datensätze, die an einer dauerhaften Grenze gelesen werden, und für Consumer, die jedes Member benötigen.

## `LlmFailure`

Jeder geworfene oder in-band gemeldete finale Adapterfehler wird zu einer serialisierbaren providerneutralen Nutzlast normalisiert. `providerRetryAfterMs` ist eine validierte positive Verzögerung, die der Provider anfragt, und keine Retry-Entscheidung; `ProviderRequestId` ist ein undurchsichtiger gebrandeter String für Diagnosen.

```ts type-equiv
/** Serializable provider or transport failure facts; policy decides whether they are retryable. */
interface LlmFailure {
  /** Human-readable provider or transport failure. */
  readonly message: string
  /** Stable provider-neutral machine-routing code. */
  readonly code: string
  /** HTTP status returned by the provider, when available. */
  readonly status?: number
  /** Provider-requested delay in milliseconds, when valid and available. */
  readonly providerRetryAfterMs?: number
  /** Opaque provider-issued request identifier for diagnostics. */
  readonly requestId?: ProviderRequestId
  /**
   * With code `IMAGE_OFFLOAD_REQUIRED`: how many more of the oldest retained
   * image occurrences the route needs offloaded before the same request fits
   * its exact byte accounting. `dsh-compaction-image-offload` records the
   * selected occurrences in an `image/offload` event and retries the step.
   */
  readonly offloadImages?: number
}
```

## Preisgestaltung für Anfragebilder

Ein Adapter, dessen Provider für Anfragebilder visuelle Token berechnet, deklariert die Preisgestaltung pro Route, indem er `LlmAdapter.imageRequestPricing` überschreibt, und `ctx.llm.imageRequestPricing(provider, model)` löst sie synchron für Consumer auf. Der Token-Meter löst die Preisgestaltung des gerouteten Modells bei jeder Messung auf, sodass Compaction-Druck, Aufbewahrung und Bereichsauswahl die Bildhistorie so bepreisen, wie die geroutete Anfrage sie tatsächlich sendet; der DeepSeek-Adapter bepreist jedes aufbewahrte Vorkommen mit seinem modellspezifischen Anfrageziel und der veröffentlichten Vision-Abrechnung und jedes durch eine protokollierte Bild-Offload-Entscheidung ausgewählte Vorkommen mit seinem Platzhaltertext, während die Provider-Usage der autoritative Anker für abgeschlossene Anfragen bleibt.

```ts type-equiv
/**
 * Request price of one ordered image occurrence under one exact model route's
 * request projection. Every occurrence resolves to the pair the wire actually
 * carries: provider visual tokens for a retained image, plus the model-visible
 * text sent with or instead of it (request-preview handle, offload placeholder,
 * or text-only substitution). The caller prices `text` with its own text
 * estimator so provider pricing never fixes a text tokenization.
 */
interface LlmImageRequestPrice {
  /** Provider visual tokens for the retained request image; 0 when only text represents this occurrence. */
  visualTokens: number
  /** Model-visible text sent for this occurrence, to be priced by the caller's text estimator. */
  text: string
}
```

```ts type-equiv
/**
 * Provider-side request-image pricing for one exact model route. Implemented
 * by adapters whose provider charges visual tokens; consumers (the token
 * meter) resolve it synchronously per measurement, so implementations must not
 * perform I/O.
 */
interface LlmImageRequestPricing {
  /**
   * Price every image occurrence of one request projection.
   * @param images - surface image blocks in request order, one entry per occurrence; an `offloaded` block
   *   is priced as its placeholder text.
   * @returns one price per occurrence, aligned by index with `images`.
   */
  priceImages(images: readonly ImageBlock[]): readonly LlmImageRequestPrice[]
}
```

## Der Adapter-Vertrag

Jeder Adapter MUSS diese Punkte einhalten, und jeder Consumer darf sich auf sie verlassen:

- **`usage` vor `finish`, nichts nach `finish`.** Beides bis zum End-of-Stream-Marker des Providers zurückstellen, damit ein nachlaufender reiner Usage-Chunk die Reihenfolge nicht verletzen kann.
- **Tool-Aufruf-`arguments` bleiben durchgängig Roh-JSON-Strings.** Teilfragmente streamen über `argumentsDelta`; ein Provider, der geparste Objekte zurückgibt, wird bei `block-end` neu stringifiziert.
- **Zwei zulässige Fehlerpfade, ein `LlmFailure`-Typ.** Ein Fehler kann entweder aus `stream()` WERFEN (Transport-/Protokollfehler) **oder** den Stream mit `finish {kind:'error'|'aborted', failure}` beenden (In-Band-Fehler des Providers, für Adapter, die nicht mitten im Stream werfen können). `LlmError.failure` trägt dasselbe `LlmFailure`. Nachdem der Aufruf seinen Adapter ausgewählt hat, bewahrt der Stream das exakt geworfene `Error`-Objekt und verknüpft unveränderliche Fakten sowie die unveränderliche Retry-Richtlinie der bedienenden Registrierung mit diesem Aufruf; der Agent-Loop committet den Versuchsstream als `assistant/attempt`, schließt den fehlgeschlagenen Schritt und bietet den Fehler, die Fakten, unveränderliche zuvor wiederholte Fakten, die bedienende Richtlinie und das Turn-Signal `agent/request-error` an. Ein behandelnder Listener gibt nach seiner erwarteten Reparatur `{ kind: 'retry' }` zurück; ohne Wiederherstellung wird der strukturierte Fehler zum Turn-Fehler, und für diesen Versuch wird weder eine Oberflächen-Assistenten-Nachricht noch ein Tool-Seiteneffekt committet.
- **Ein Adapter-Aufruf ist ein Provider-Versuch.** Adapter deaktivieren Bibliotheks-Retries. Wiederherstellung auf Agent-Ebene eröffnet einen weiteren dauerhaften nummerierten Turn; direkte Aufrufer von `ctx.llm.stream()` bleiben bei einem einzelnen Versuch.
- **Provider-Stillstände sind am Transport begrenzt.** Beide ausgelieferten Remote-Adapter legen ein positives endliches `streamIdleTimeoutMs` mit Standardwert fünf Minuten offen. Die Watchdog greift nur, solange `next()` des Iterators aussteht, verwendet ein stabiles Signal für die gesamte Anfrage, bildet ihren eigenen Ablauf auf `TIMEOUT` ab und behält einen früheren Aufrufer-Abbruch als `ABORTED`.
- **Kontextüberlauf hat einen kanonischen Code.** Beide DeepSeek-Adapter klassifizieren explizites Provider-Detail über `isContextWindowExceededError()` und legen `CONTEXT_WINDOW_EXCEEDED` offen, gleich ob der Fehler als geworfener HTTP-`LlmError` oder als In-Band-Finish-Fehler eintrifft. Consumer routen auf den Code, niemals auf Provider-Text.
- **Eine leere Completion ist ein wiederholbarer Fehler, kein stiller Erfolg.** Beide Adapter bilden einen terminalen `stop`-Finish ohne Content-Blöcke auf `finish {kind:'error'}` mit dem kanonischen Code `EMPTY_RESPONSE` ab, und `dsh-llm-retry` wiederholt ihn standardmäßig.
- **Jede HTTP-Anfrage an den Provider trägt den App-Attributions-Header.** Adapter senden `attributionHeaders()` (unten) — die `User-Agent`-Grundlinie — und weisen dies mit einem Wire-Level-Test nach.
- **Der Replay-Zustand gehört dem Adapter; seine Aufteilung ist geteilt.** Ein erfolgreiches `finish` kann ein `ReplayEnvelope` tragen: undurchsichtige Metadaten auf Antwortebene plus optionale Einträge pro Block, ausgerichtet an der ausgegebenen Blocksequenz. Die Ausrichtung ist das Vokabular des Harness — wenn die Zusammenstellung einen Block verwirft, verwirft sie den Eintrag an derselben Position, sodass gespeicherte Metadaten stets gespeicherten Inhalt beschreiben. Der Loop speichert das bereinigte Envelope mit der zusammengesetzten Assistenten-Nachricht. Bei einer späteren Anfrage reicht `LlmRuntime` den Zustand nur durch, wenn der historische Provider und der Ziel-Provider aktuell auf genau dieselbe Adapter-Instanz registriert sind. Dieser Adapter validiert den Zustand und besitzt jede modell- oder providerübergreifende Konvertierung; andere Adapter erhalten den providerneutralen Inhalt plus Provider-/Modell-Felder ohne den privaten Zustand. Dauerhafter Inhalt bleibt autoritativ: Ein gespeicherter Zustand, den der lesende Adapter nicht nutzen kann, degradiert diese eine Nachricht zu einer providerneutralen Konvertierung mit einer Diagnose, statt die Anfrage fehlschlagen zu lassen.

## `ResolvedRetryPolicy`

Die Retry-Konfiguration wird vor der Routenregistrierung zu einer unveränderlichen diskriminierten Union aufgelöst. Der Normalmodus trägt `mode: 'normal'`, ein endliches `maxRetries`, `retryableCodes` und die erforderlichen `initialDelayMs`, `maxDelayMs` und `jitterRatio`; der Immer-Modus trägt `mode: 'always'` und dieselben erforderlichen Backoff-Felder ohne endliches Maximum. Das Weglassen einer Provider-Richtlinie verwendet den normalen Standard von fünf Wiederholungen. Geschichtete Einstellungen können `maxRetries` oder `retryableCodes` behalten, die nur für den Normalmodus gelten, nachdem auf den Immer-Modus umgeschaltet wurde; der Resolver ignoriert diese inaktiven Felder und erfasst die reine Immer-Richtlinie. `LlmRuntime.providerRetryPolicy(provider)` gibt den registrierten Wert zurück, und `llmRetryPolicyOf(stream)` gibt den Wert zurück, der aus der bedienenden Registrierung erfasst wurde, nachdem der Aufruf sie ausgewählt hat, sodass eine spätere Entsorgung oder ein Austausch der Route die Wiederherstellungsrichtlinie eines laufenden Fehlers nicht ändern kann. Der [generierte Konfigurationskatalog](../config-catalog.md) listet die optionalen Eingabefelder.

## `AppIdentity` — App-Attribution

Die statische öffentliche Anwendungsidentität, die jeder Adapter an Provider sendet ([`packages/llm/llm/src/attribution.ts`](../../packages/llm/llm/src/attribution.ts)). `attributionHeaders(identity?)` bildet sie nur auf den standardmäßigen `User-Agent`-Header ab; OpenRouter-spezifische App-Attributions-Header werden von diesem Vertrag bewusst nicht unterstützt. Das Standard-`APP_IDENTITY` bezieht seine Version aus dem Paketmanifest; jedes Feld ist eine öffentliche Produkttatsache — keine Secrets, Pfade, Session-Ids oder nutzerbezogenen Identifikatoren, und nichts pro Anfrage darf die Werte beeinflussen.

```ts type-equiv
/**
 * Static public application identity sent to LLM providers.
 *
 * Every field is a public product fact, safe on every request: no secrets,
 * local paths, session ids, prompt text, or per-user identifiers belong here,
 * and nothing per-request may influence the values.
 */
interface AppIdentity {
  /** `User-Agent` product token (lowercase, hyphenated). */
  product: string
  /** Product version; sourced from package metadata, never hand-copied. */
  version: string
  /** Repository home URL of the app, used as the `User-Agent` comment. */
  url: string
}
```

## `TokenUsage`

Token-Abrechnung pro Aufruf. Die Zählungen sind **disjunkt**: `inputTokens` ist nur ungecachte Eingabe; gecachte Eingabe wird separat gemeldet, und die abgerechnete Eingabe ist die Summe der drei. Adapter, deren Provider Cache-Treffer in eine einzige Prompt-Summe falten (DeepSeeks `prompt_tokens`), subtrahieren sie wieder heraus. Das optionale `totalTokens` ist eine exakte Gesamtzählung aus Prompt plus Ausgabe, die vom Provider bewahrt oder aus autoritativen Aggregatzählern rekonstruiert wird; Adapter lassen es weg, wenn es nicht verfügbar oder inkonsistent ist. `reasoningTokens` ist, wenn vorhanden, informatives Detail, das bereits in `outputTokens` enthalten ist; Summen dürfen es nicht erneut addieren.

```ts type-equiv
/**
 * Token accounting for one model call (cache fields are optional).
 *
 * Counts are DISJOINT: `inputTokens` is uncached input only; cached input is
 * reported separately as `cacheReadTokens`/`cacheWriteTokens` (billed input =
 * sum of the three). Adapters whose providers fold cache hits into a total
 * prompt count (DeepSeek's `prompt_tokens`) subtract them out.
 */
interface TokenUsage {
  inputTokens: number
  outputTokens: number
  /**
   * Exact full-call total including aggregate prompt and output tokens.
   *
   * Adapters preserve a provider total or derive it from authoritative
   * aggregate prompt/output counters; they omit it when unavailable or
   * inconsistent.
   */
  totalTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}
```

## `BlockAssembler`

`BlockAssembler` ([`packages/llm/llm/src/assembler.ts`](../../packages/llm/llm/src/assembler.ts)) ist die eine gemeinsame Implementierung, die einen `StreamChunk`-Stream zurück zu `ContentBlock`s, Usage, Finish-Grund und Replay-Zustand faltet. Der Loop protokolliert die rohen Chunks, während er dieselben Chunks durch einen Assembler speist, und speichert dann den zusammengesetzten Assistenteninhalt mit dem Provider und Modell, die ihn erzeugt haben. Ein Consumer, der das zusammengesetzte Ergebnis benötigt, ohne die Faltung neu zu implementieren, verwendet dies.

Eine Behalten/Verwerfen-Entscheidung deckt Inhalt und Metadaten gemeinsam ab: Ein `max-tokens`-Finish verwirft jeden Tool-Aufruf, weil ein abgeschnittener Aufruf nicht sicher auszuführen ist, und dieselbe Entscheidung entfernt den Eintrag des Replay-Envelopes pro Block an jeder verworfenen Position. `blocks()` und `replayState` können daher nicht widersprechen, was die Zusammenstellung auch entfernt.

```ts public-api
/**
 * Incrementally assembles raw {@link StreamChunk}s into complete
 * {@link ContentBlock}s and a final assistant {@link Message}.
 *
 * The agent loop feeds it while logging raw chunks for replay fidelity, then
 * reads `blocks()` / `message()` / `usage` / `finish` once the stream ends,
 * or `interruptedBlocks()` when cancellation cut the stream short.
 *
 * Tolerant of delta-only protocols (no block-start/end); deltas arriving for
 * an index already closed by `block-end` are ignored (malformed stream) so a
 * misbehaving adapter cannot grow memory or corrupt a completed block.
 */
declare class BlockAssembler {
  /**
   * Feed one chunk into the assembly state.
   * @param chunk - the next raw chunk, in stream order.
   */
  push(chunk: StreamChunk): void;
  /**
   * Assemble all blocks seen so far, in stream order.
   * @returns one block per seen index, except that max-token truncation drops
   *   tool calls that cannot be executed safely; an open block assembles from
   *   its accumulated deltas (an unknown block type never closed by `block-end` throws).
   */
  blocks(): ContentBlock[];
  /**
   * Assemble the prefix an interrupted stream can safely finalize: closed and
   * open text/reasoning blocks with non-whitespace content, in stream order.
   * Tool calls are omitted because interruption precedes dispatch; retaining
   * one would require a fabricated result. Open unknown blocks are also omitted.
   * @returns the kept blocks; empty when nothing streamed before the interruption.
   */
  interruptedBlocks(): ContentBlock[];
  /** Usage from the `usage` chunk; undefined until one arrives. */
  get usage(): TokenUsage | undefined;
  /** Finish reason from the `finish` chunk; `{kind: 'stop'}` when the stream ended without one. */
  get finish(): FinishReason;
  /**
   * Replay metadata from the terminal finish chunk, if any, with per-block
   * entries pruned in step with {@link blocks}. Undefined when the envelope's
   * entries do not align with the emitted blocks.
   */
  get replayState(): ReplayEnvelope | undefined;
  /**
   * The assembled assistant message.
   * @param source - provider/model attribution (without the `kind` tag) for the assembled message.
   * @returns a frozen assistant-role message over `blocks()` (same open-block assembly rules).
   */
  message(source: Omit<ModelMessageSource, 'kind'>): AssistantMessage;
}
```

<a id="the-model-request-and-result"></a>

## Die Modellanfrage

Ein Modellaufruf ist ein vollständig zusammengesetztes `GenerateOptions`. Der Adapter antwortet mit einem rohen [`StreamChunk`](#streamchunk--the-raw-protocol)-Stream; der Consumer setzt ihn mit [`BlockAssembler`](#blockassembler) zusammen.

Quelle: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

Provider- und Modellentdeckung verwendet kleine providerneutrale Deskriptoren. Ein Modellkatalog ist beratend: Das Routing schlüsselt weiterhin auf einen registrierten Provider.

Das Registrieren eines Adapters gibt ein Handle zurück: den Disposer plus den atomaren Routenaustausch, den ein Plugin mit nutzerkonfigurierbarem Routensatz benötigt.

```ts type-equiv
/**
 * What {@link LlmRuntime.registerAdapter} returns: the disposer, plus an
 * atomic route replacement for the same adapter instance.
 */
interface AdapterRegistrationHandle {
  /** Release every route this registration currently holds. */
  (): void
  /**
   * Replace this registration's routes with `providers`, keeping the same
   * adapter instance. The candidate set is validated in full first — a
   * conflict with another adapter, an invalid name, or bad provider metadata
   * throws and leaves the current routes untouched — and the swap itself is
   * one synchronous section, so no request can observe a gap. An empty array
   * is legal here (a settings section that emptied holds zero routes while
   * staying registered), unlike an empty initial registration.
   *
   * Throws `LlmError` with code `REGISTRATION_DISPOSED` once the registration
   * has been released: its routes are gone and its disposer has already run,
   * so anything registered afterwards would have no owner left to release it.
   * @param providers - the complete next route set for this registration.
   */
  replace(providers: string[]): void
}
```

```ts type-equiv
/** Display metadata for one registered provider route. */
interface LlmProviderInfo {
  /** Provider route key used by {@link GenerateOptions.provider}. */
  id: string
  /** Human-readable provider name for selectors and diagnostics. */
  name: string
}
```

Adapter-Plugins deklarieren zusätzlich über `registerConfigurableProviders()`, welche Routen *laufen könnten*, und adressieren dabei den Nutzereinstellungs-Abschnitt jeder einzelnen, sodass Konfigurationsoberflächen ruhende Provider anbieten können, bevor eine Route registriert wird.

```ts type-equiv
/**
 * One provider route an adapter plugin can activate through configuration,
 * whether or not the route is currently registered. Configuration surfaces
 * merge this directory with `listProviders()` to offer every configurable
 * provider alongside its live/dormant state.
 */
interface LlmConfigurableProvider {
  /** Provider route key this entry activates when configured. */
  provider: string
  /** Human-readable provider name for configuration surfaces. */
  displayName: string
  /** User-settings namespace whose section configures this provider. */
  settingsNs: string
  /**
   * Path from that namespace's section root to this provider's profile
   * object; empty when the whole section is the profile.
   */
  settingsPath: readonly string[]
  /**
   * Whether the owning adapter knows this route only because configuration
   * declared it — a gateway or self-hosted server it ships nothing about.
   * Absent means the adapter draws no such distinction; false means it does
   * and this route is one of its own. Only the adapter can answer: a stored
   * profile is how a user-added route AND a corrected shipped one both look
   * from outside.
   */
  declared?: boolean
  /** Configuration diagnostic for repair; unaffected models may remain serviceable. */
  error?: string
}
```

```ts type-equiv
/** One adapter-discovered model; catalog membership is advisory, not request validation. */
interface LlmModelInfo {
  /** Provider route that owns this model entry. */
  provider: string
  /** Model id passed to {@link GenerateOptions.model}. */
  id: string
  /** Human-readable model name for selectors. */
  name: string
  /** Optional user-facing distinction from otherwise similar models. */
  description?: string
  /** Accepted request modalities; absent means unknown, while an explicit omission is negative capability. */
  inputModalities?: readonly ModelModality[]
}
```

Korrektheitsrelevante Metadaten werden getrennt vom beratenden Katalog aufgelöst und gehören dem Adapter, der die exakte Route bedient. Kontextkapazität, Adapter-Aufrufstandards, Reasoning-Auswahlmöglichkeiten und der Aktualisierungsmodus des System-Prompts teilen ein exaktmodellbezogenes Ergebnis, sodass Consumer die autoritative Modellauflösung nicht wiederholen. `SystemPromptUpdate` hat den einzigen Wert `'in-history'`: Das Modell liest die neueste `system`-Nachricht an beliebiger Position von `messages` als vollständigen effektiven System-Prompt, sodass der Agent-Loop einen geänderten Prompt nach der gecachten Historie anhängen kann, statt Nachricht 0 neu zu schreiben ([Entscheidungsregel](../../packages/core/agent-loop/README.md#understand-the-implementation)); ein fehlender Modus bedeutet, dass nur eine führende System-Nachricht gelesen wird, und `normalizeModelInfo` weist jeden anderen Wert mit `INVALID_MODEL_INFO` zurück.

```ts type-equiv
/** Provider-owned context capacity for one exact provider/model route. */
interface LlmModelContext {
  /** Maximum combined request and response context in tokens. */
  contextWindow: number
}
```

Der Reasoning-Aufwand ist eine weitere exaktroutebezogene Capability. Der Core brandet Identifikatoren, zählt ihre Werte aber nicht auf; jeder Adapter besitzt die Auswahlmöglichkeiten in aufsteigender Aufwandsreihenfolge, die Anzeigenamen und einen optionalen Deployment-Standard. Die Reihenfolge vergleicht auswählbare Steuerelemente, nicht vorhergesagten Token-Verbrauch, Kosten oder Latenz.

```ts type-equiv
/** Adapter-owned identifier for one model's selectable reasoning effort. */
type ReasoningEffortId = Branded<'ReasoningEffortId'>
```

```ts type-equiv
/** Display metadata for one adapter-owned reasoning effort. */
interface LlmReasoningEffortInfo {
  /** Opaque stable value accepted by {@link GenerateOptions.reasoningEffort}. */
  id: ReasoningEffortId
  /** Human-readable effort name for selectors and diagnostics. */
  name: string
  /** Optional user-facing distinction from otherwise similar efforts. */
  description?: string
}
```

```ts type-equiv
/** Selectable reasoning efforts for one exact provider/model route. */
interface LlmModelReasoningInfo {
  /** Supported efforts from least to greatest selectable reasoning effort, not predicted token use or latency. */
  efforts: readonly LlmReasoningEffortInfo[]
  /**
   * Adapter-configured default materialized into requests when callers omit
   * an effort. Absence preserves the provider's own default.
   */
  defaultEffort?: ReasoningEffortId
}
```

```ts type-equiv
/** Exact-route model metadata resolved by its owning adapter. */
interface LlmResolvedModelInfo extends LlmModelInfo {
  /** Provider-owned context capacity when known. */
  context?: LlmModelContext
  /** Adapter-configured per-request output cap materialized when callers omit one. */
  defaultMaxTokens?: number
  /** Adapter-owned selectable reasoning levels when exposed. */
  reasoning?: LlmModelReasoningInfo
  /** Declared mid-conversation system prompt handling; absent means only a leading system message is read. */
  systemPromptUpdate?: SystemPromptUpdate
  /** Declared mid-conversation tool declaration handling; absent means every request declares the complete tool list. */
  toolUpdate?: ToolUpdate
}
```

Hilfsaufrufer können Nutzerinhalt ohne dauerhafte Identität oder Quelle bereitstellen. Bestehende `Message[]`-Historien bleiben gültige Anfrageeingaben. Session-Schreibvorgänge, Agent-Zustellung und aufgezeichnete Titel-Anfragen erfordern weiterhin dauerhafte Nachrichten.

```ts type-equiv
/** User input for one LLM request; it has no durable Session identity or source. */
interface RequestUserInput {
  readonly role: 'user'
  readonly content: UserMessage['content']
  readonly id?: never
  readonly source?: never
}
```

```ts type-equiv
/** A durable conversation message or a user input used only for one request. */
type RequestMessage = Message | RequestUserInput
```

```ts type-equiv
/** A single model request, fully assembled. */
interface GenerateOptions {
  /** Registered provider route selecting the adapter instance. */
  provider: string
  model: string
  /** Adapter-owned reasoning effort selected for this exact model. */
  reasoningEffort?: ReasoningEffortId
  /**
   * Ordered conversation messages, exactly as the provider sees them. A
   * loop-built request passes the derived history (dsh-agent-loop), whose
   * leading system-role message carries the system prompt; a hand-built
   * one-shot may include identity-free user inputs.
   */
  messages: RequestMessage[]
  /**
   * System prompt text for one-shot callers; adapters map it to the provider's
   * system slot ahead of `messages`. Loop-built requests leave it undefined.
   */
  system?: string
  /** Tool schemas (adapters map to the provider's `tools` field). */
  tools?: ToolSchema[]
  /** Session-folded tool history used for route projection; omission sends complete declarations without tool updates. */
  toolHistory?: ToolHistory
  temperature?: number
  maxTokens?: number
  /**
   * Stop sequences: generation halts as soon as the model produces any one of
   * these strings (adapters map to the provider's stop field, e.g. OpenAI
   * `stop`). The stop string itself is not included in the output.
   */
  stop?: string[]
  signal?: AbortSignal
  /**
   * Session identity stamped by the loop for request routing. Replay uses it
   * to separate cursors; adapters may map it to model-hidden transport metadata.
   */
  sessionId?: Branded<'SessionId'>
  /**
   * Provider-neutral classification for an auxiliary model call. Adapters may
   * map the purpose to model-hidden transport metadata. Ordinary conversation
   * requests leave it unset.
   */
  purpose?: 'compaction' | 'session-title'
}
```

Warum eine Modellantwort endete, ist ein merge-erweiterbarer Grund. Terminale Provider-Fehler tragen das [`LlmFailure`](#llmfailure) des Streaming-Vertrags:

```ts type-equiv
/**
 * Why a model response stopped.
 * Merge-extensible so adapters can surface provider-specific reasons.
 */
interface FinishReasonMap {
  'stop': { kind: 'stop' }
  'tool-calls': { kind: 'tool-calls' }
  'max-tokens': { kind: 'max-tokens' }
  'aborted': { kind: 'aborted'; failure: LlmFailure }
  'error': { kind: 'error'; failure: LlmFailure }
}
```

`FinishReason = FinishReasonMap[keyof FinishReasonMap]`. `TokenUsage` (Abrechnung pro Aufruf mit disjunkten Cache-Feldern) ist [unten](#tokenusage) ausgeführt.

`GenerateOptions.tools` trägt `ToolSchema` — die JSON-Schema-Beschreibung eines Tools, wie sie an das Modell gesendet wird. Sie ist gerade deshalb in dsh-llm (und nicht in dsh-tools) deklariert, weil sie Teil der Anfrage ist, die der Loop in jedem Schritt zusammensetzt:

```ts type-equiv
/**
 * JSON-schema description of a tool, as sent to the model.
 *
 * Declared here (not in dsh-tools) because it is part of {@link GenerateOptions};
 * dsh-tools' ToolDefinition and dsh-system-prompt's PromptAssembly both import
 * it from this package.
 */
interface ToolSchema {
  /**
   * Requests deferred loading of the tool definition into model context,
   * independently of whether a tool-addition block records the tool.
   * Uses Anthropic's defer_loading terminology.
   */
  deferLoading?: true
  name: string
  description: string
  /** JSON Schema object for the arguments. */
  parameters: Record<string, unknown>
}
```

Das modellzugewandte `ToolSchema` ist der Wire-Typ; die registrierte `ToolDefinition`, die ihn erzeugt (Schema + `execute`), steht in [tools.md](tools.md).

Ein Provider, den eine Oberfläche gerade entwirft, hat keine Route und keinen Katalog, daher wird die Abfrage separat beschrieben: Die Anfrage trägt den Entwurf, den der Nutzer gerade bearbeitet, und die Antwort sind Kandidaten, die eine Oberfläche übernehmen kann, statt ein Katalog, den sie bedienen muss.

```ts type-equiv
/**
 * One interrogation of a provider endpoint that configuration has not stored
 * yet. Configuration surfaces send the draft a user is still editing, so the
 * request carries the endpoint and credential directly instead of naming a
 * route: a provider being added has no route to name.
 */
interface LlmModelDiscoveryRequest {
  /**
   * Route the draft is editing, when it edits an existing one. A route whose
   * adapter already knows its models answers from that knowledge instead of
   * asking the endpoint — the adapter's own registry is the better answer, and
   * it costs no network call.
   */
  provider?: string
  /**
   * Endpoint to interrogate. Optional because a route the adapter already
   * describes needs none; a route it does not must supply one.
   */
  baseURL?: string
  /** Wire protocol the endpoint speaks, when the draft names one. */
  api?: string
  /** Credential for this interrogation alone; the harness never stores it. */
  apiKey?: string
}
```

```ts type-equiv
/**
 * One model an endpoint reports about itself. Every field but the id is
 * optional because most provider listings disclose an id and nothing else;
 * a surface adopting one of these still owes the capacities its adapter needs.
 */
interface LlmDiscoveredModel {
  /** Model id the endpoint accepts. */
  id: string
  /** Human-readable name when the endpoint supplies one. */
  name?: string
  /** Maximum combined request and response context, when disclosed. */
  contextWindow?: number
  /** Maximum output tokens, when disclosed. */
  maxTokens?: number
  /** Accepted input types when disclosed by the catalog or endpoint; absent means unknown. */
  inputModalities?: readonly ModelModality[]
}
```

### Der Anfrage-Envelope: `LlmCallConfig` und der protokollierte Header

Der Loop baut jede Anfrage aus protokolliertem Zustand. `EpochHeader` zeichnet die Aufrufkonfiguration auf, markiert die durch Adapter-Standards gelieferten Felder und zeichnet die autoritative zurückgegebene Tool-Reihenfolge (konfiguriert durch `toolOrder` oder lexikografisch, wenn nicht gesetzt) über vollständige `request/header`-Snapshots auf. Der gerenderte Prompt ist abgeleitete Historie — die `system/message` am Oberflächenknoten 0 plus jeder spätere System-Knoten, den eine `in-history`-Route angehängt hat —, sodass Header und abgeleitete Historie zusammen die Anfrage aus dem Session-Log rekonstruierbar machen. Siehe [session.md](session.md#the-request-header-event-requestheader) und die [Agent Note zur Rekonstruierbarkeit](../../.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md).

`agent/request` erhält einen eingefrorenen Aufrufkonfigurations-Seed und kann einen Ersatz zurückgeben, um Provider, Modell, Reasoning-Aufwand oder Sampling zu wechseln. Vor dem Waterfall entfernt der Loop Werte, die als Adapter-Standards markiert sind, damit die exaktmodellbezogene Vorbereitung die aktuellen Werte der ausgewählten Route materialisiert; unmarkierte explizite Einstellungen bleiben im Vorschlag. Nach dem Waterfall weist die Vorbereitung nicht unterstützte explizite Effort-Ids ohne Clamping zurück und protokolliert die effektive Konfiguration plus die durch Adapter-Standards gelieferten Felder unter dem Turn-Signal. Bei der Schritt-Zulassung laufen dieser Waterfall und die Vorbereitung nach der Zusammenstellung und `step/start`, aber bevor der System-Prompt und der akzeptierte Nutzer-Batch committet werden; ein Abbruch während eines der beiden committet keines von beiden. Die vorbereitete Capability bestimmt die Prompt-Abstimmung, und der Aufruf behält eine Adapter-Registrierung durch den Dispatch. Anfragen, die `llm/stream` erreichen, sind tief eingefroren, sodass Mutation wirft, und tragen eine prozesslokale Loop-Identität, damit Beobachter separat protokollierte eingefrorene Hilfsaufrufe nicht mit Konversationsanfragen verwechseln.

Auf dem Wire ist eine loop-gebaute Anfrage allein die abgeleitete Historie: Der gerenderte Prompt reist als führende `system`-Rollen-Nachricht (Oberflächenknoten 0, ein `system/message`-Event), und wenn der vorbereitete Aufruf `systemPromptUpdate: 'in-history'` deklariert, darf ein nicht leerer geänderter Prompt der gecachten Historie als spätere `system`-Rollen-Nachricht folgen, die das Modell als effektiven Prompt liest; das `system`-Feld der Anfrage ist nicht gesetzt — `GenerateOptions.system` dient direkten One-Shot-Aufrufern wie Titel-Providern. Ein leeres Rendering hinterlässt keine System-Nachrichten in der abgeleiteten Historie, selbst wenn frühere Anfragen mehrere Prompt-Versionen behielten. Die protokollierte Anfrage endet mit der neuesten `user/message` im ersten Schritt eines Turns und mit den Tool-Ergebnissen des vorherigen Schritts in späteren Schritten.

FIXME(call-config-shape): erneut prüfen, welche verbleibenden Felder für Cache-Zwecke wirklich Epoche-Ebene haben (`model` und der modellbesessene Reasoning-Aufwand sind explizit; die Sampling-Skalare stehen hier aus Vorsicht).

```ts type-equiv
/** Concrete generation settings; omitted controls use the selected route's defaults. */
interface LlmCallControls {
  reasoningEffort?: ReasoningEffortId
  temperature?: number
  maxTokens?: number
  stop?: string[]
}
```

```ts type-equiv
/**
 * Provider, model, reasoning effort, and sampling scalars of one conversation's
 * requests. Every field maps 1:1 onto the same-named `GenerateOptions` field;
 * the loop builds requests from the logged header rather than accepting these
 * per call.
 */
interface LlmCallConfig extends LlmCallControls {
  provider: string
  model: string
}
```

```ts type-equiv
/**
 * Synchronous, pure configuration of one call before defaults and validation.
 * Compose functions in the desired order; later writes replace earlier ones.
 * The returned controls cannot change the captured route. Errors reject
 * preparation before dispatch; only the resolved configuration is recordable.
 * @param controls - detached, deeply frozen proposed controls, without defaults.
 * @param model - detached, deeply frozen metadata from the captured adapter generation.
 * @returns concrete controls; omitted fields receive the route's defaults.
 */
type ConfigureCall = (
  controls: Readonly<LlmCallControls>,
  model: Readonly<LlmResolvedModelInfo>,
) => LlmCallControls
```

```ts type-equiv
/**
 * Effective config fields supplied by exact-model adapter resolution rather
 * than by the caller's request proposal.
 */
interface LlmCallConfigAdapterDefaults {
  reasoningEffort?: true
  maxTokens?: true
}
```

## Offizielle DeepSeek-Anfrageerweiterungen

`ctx.deepseekLlmApiExtensions` ist die providerspezifische Registry für additive Top-Level-Felder auf `deepseek-official`-Anfragen. Beitragende Plugins verwenden `register(field, provider)`, um ein Feld zu beanspruchen; der Adapter ruft `prepare(request)` auf, nachdem er seinen Basiskörper serialisiert hat, und merged die zurückgegebenen Felder vor HTTP. Die vorbereitete `accept()`-Transaktion läuft nach 2xx, sodass ein Beitragender den Zustellzustand committen kann, ohne eine Transport- oder Provider-Ablehnung als Annahme zu behandeln. Ein Beitragender, dessen Vorbereitung wirft, wird protokolliert und aus dieser Anfrage ausgelassen, und ein Annahmefehler wird protokolliert, ohne die Anfrage fehlschlagen zu lassen; eine Kollision mit einem Basisfeld verwendet `REQUEST_EXTENSION` und lässt die Modellanfrage fehlschlagen. Ein gemergter Körper, der nicht serialisiert werden kann, wird ohne Erweiterungsfelder gesendet; die Annahme wird übersprungen, und das Provider-Plugin protokolliert die ausgelassenen Feldnamen.

Die [Wire-Referenz](../deepseek-llm-api-wire-extensions.md) definiert die exakten Anfrage-Header, die Erweiterungstransaktion, Feldversionen und Empfängerpflichten. Die ausgelieferte Komposition registriert [`dsh_session_log`](../../packages/session/session-log-deepseek/README.md) als verlustfreies inkrementelles Suffix des kanonischen Logs und [`dsh_plugin_packages`](../../packages/llm/plugin-package-inventory-deepseek/README.md) als vollständige aktive, vom Loader gestützte Paketmenge. Diese Felder bleiben außerhalb der Modellnachrichten und fehlen im Pfad des pi-ai-Adapters.

## Dienst- und Provider-Verträge

`LlmAdapter` ist der Provider-Vertrag: ableiten, `stream()` implementieren und eine Adapter-Instanz mit `ctx.llm.registerAdapter(providers, adapter)` registrieren. `GenerateOptions.provider` wählt den registrierten Adapter aus; `GenerateOptions.model` wird an diesen Adapter übergeben und muss beim Start des Lifecycle nicht registriert sein. Doppelte Provider-Routen schlagen atomar fehl. Das optionale `providerRetryPolicy()` wird pro Route mit normalen Standards erfasst, während `providerInfo()` und das asynchrone `listModels()` `LlmRuntime.listProviders()` / `listModels()` mit losgelösten Selektor-Metadaten versorgen. Dieser Katalog ist beratend und keine Anfrage-Whitelist: Der Adapter bleibt autoritativ und kann nicht gelistete Modell-Ids akzeptieren. Eine asynchrone `resolveModel()`-Abfrage gibt die exakte Modellidentität plus optionale korrektheitsrelevante Kontextkapazität, ein adapterkonfiguriertes `defaultMaxTokens` und geordnete modellbesessene Reasoning-Ids mit einem optionalen Deployment-Standard zurück; fehlende Felder bedeuten nicht verfügbare Metadaten oder providerbesessenes Verhalten, nicht ungültige Katalogmitgliedschaft. Der Resolver erhält optionalen Abbruch und muss nach einem Abbruch zeitnah abschließen. `LlmRuntime.resolveModelInfo()` validiert das Aggregat und löst es ab. An der finalen Adaptergrenze materialisiert `resolveCallConfig()` den Ausgabestandard nur, wenn `maxTokens` fehlt, und validiert und materialisiert Reasoning, sodass direkte Aufrufe keines der beiden konfigurierten Verhalten umgehen können; der direkte Dispatch erfasst eine Registrierung, bevor er auf diese Auflösung wartet. Der Agent-Loop verwendet stattdessen `prepareCall()`, um dieselbe Registrierung über Modellauflösung, dauerhafte Header-Protokollierung und Dispatch hinweg zu behalten, losgelöste Kontextmetadaten aus genau dieser Suche zu bewahren und zu berichten, welche Konfigurationsfelder der Adapter mit Standardwerten belegt hat. Die Adapter-Suche erfolgt an der terminalen Fortsetzung des `llm/stream`-Waterfalls, sodass ein Listener den Aufruf kurzschließen oder eine veränderliche One-Shot-Anfrage vor der Suche routen kann. AgentLoop beobachtet einen Anfrageversuch, sobald der äußere Waterfall ein Stream-Handle zurückgibt; diese begrenzte Grenze beweist nicht, dass ein träger terminaler Adapter konstruiert wurde oder Provider-I/O begonnen hat. Die `index`-Korrelation von `block-start` / `block-end` und der Assembler bedeuten zusammen, dass ein Adapter nur wohlgeformte Chunks ausgeben muss — die Block-Neuzusammensetzung ist nicht das Problem jedes Adapters. [architecture.md](../architecture.md#turn-flow) zeigt, wo `ctx.llm.stream()` und der `llm/stream`-Waterfall in einem Turn sitzen.

```ts type-equiv
/** One model call whose config and adapter registration were resolved together. */
interface PreparedLlmCall {
  /** Detached, deep-frozen config with any adapter-owned default materialized. */
  readonly config: LlmCallConfig
  /** Immutable retry policy captured with the adapter registration. */
  readonly retryPolicy: ResolvedRetryPolicy
  /** Detached context metadata resolved with the registration-bound call. */
  readonly context?: LlmModelContext
  /** Exact model modalities captured with the adapter dispatch generation. */
  readonly inputModalities?: readonly ModelModality[]
  /** Exact model system prompt update mode captured with the adapter dispatch generation. */
  readonly systemPromptUpdate?: SystemPromptUpdate
  /** Exact model tool update mode captured with the adapter dispatch generation. */
  readonly toolUpdate?: ToolUpdate
  /** Config fields materialized by the captured adapter rather than proposed by the caller. */
  readonly adapterDefaults: LlmCallConfigAdapterDefaults
  /**
   * Dispatch this call once through the registration captured during
   * preparation. The request's call-config fields must match {@link config};
   * reuse or mismatch fails with `INVALID_PREPARED_CALL`.
   * @param options - fully assembled request carrying the prepared config.
   * @returns the chunk stream, including the `llm/stream` waterfall.
   */
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}
```

```ts public-api
/**
 * Provider-wire adapter for the harness message and stream vocabulary. Register implementations
 * with `ctx.llm.registerAdapter(providers, adapter)`. Every provider HTTP request must include
 * `attributionHeaders()`; prove the headers are added in the wire request or library header hook. The direct-fetch
 * DeepSeek and library-backed pi-ai adapters meet this contract through different internals.
 */
declare abstract class LlmAdapter {
  /**
   * Describe one provider route owned by this adapter.
   * @param provider - a route passed to `registerAdapter()` for this instance.
   * @returns detached display metadata whose id must equal `provider`.
   */
  providerInfo(provider: string): LlmProviderInfo;
  /**
   * Return the provider-owned retry policy captured with this route.
   * @param _provider - a route passed to `registerAdapter()` for this instance.
   * @returns a resolved policy, or `undefined` to use the normal defaults.
   */
  providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined;
  /**
   * Resolve provider-side request-image pricing for one exact model route.
   * The default declares none, so consumers fall back to their own neutral
   * estimate. Implementations must answer synchronously without I/O; the
   * token meter resolves this per measurement.
   * @param _provider - a route passed to `registerAdapter()` for this instance.
   * @param _model - exact model id passed to {@link GenerateOptions.model}.
   * @returns route-owned image pricing, or `undefined` when the route declares none.
   */
  imageRequestPricing(_provider: string, _model: string): LlmImageRequestPricing | undefined;
  /**
   * List models this adapter can currently advertise for one owned provider.
   * Core routing accepts unlisted model ids; catalog-driven entry points such
   * as the GUI may require membership. Adapters used there must advertise
   * their available models; the base empty catalog offers no GUI selection.
   * @param _provider - one provider route owned by this adapter.
   * @returns discoverable models in adapter-preferred order.
   */
  listModels(_provider: string): Promise<readonly LlmModelInfo[]>;
  /**
   * Resolve all metadata available for one exact model. This query is
   * independent of the advisory catalog and does not validate request routing.
   * @param provider - one provider route owned by this adapter.
   * @param model - exact model id passed to {@link GenerateOptions.model}.
   * @param _signal - cancellation for this exact-model lookup; asynchronous
   *   implementations must settle promptly after it aborts.
   * @returns provider/model identity plus any context, call-default, and reasoning metadata.
   */
  resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo>;
  /**
   * Bind exact model metadata and the eventual request dispatch to one adapter generation.
   * Dynamic adapters override this so settings changes between preparation and
   * dispatch cannot combine one generation's capabilities with another's endpoint.
   * @param provider - registered provider route.
   * @param model - exact model id.
   * @param signal - cancellation for model resolution.
   * @returns model metadata and a one-generation stream entry point.
   */
  async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall>;
  /**
   * Stream one model call as raw chunks. The only required method.
   * @param options - the fully-assembled request; implementations must honor `options.signal`.
   * @returns the chunk stream, obeying the adapter contract documented on `StreamChunk`.
   */
  abstract stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
```

`ContentBlockType` (die Schlüsselmenge, die die `index`-korrelierten Blöcke tragen) leitet sich aus [`ContentBlockMap`](#content-blocks-and-messages) oben ab.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generiert aus dem Quellcode durch `scripts/gen-cordis-catalog.ts` (per `pnpm run verify-cordis-catalog` in doc-sync auf Aktualität geprüft; Neugenerierung mit `pnpm run gen-cordis-catalog`) — die Sprachseiten unterscheiden sich nur in lokalspezifischen gepaarten Dokumentpfaden. Signaturblöcke verwenden einen `ts cordis-catalog`-Fence und behalten das ursprüngliche Quell-JSDoc; Dispatch-Modi sind im [primer](../cordis-primer.md#dispatch-modes) definiert, und die vom Framework geerbte `ctx`-API liegt in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdeepseekllmapiextensions--deepseekllmapiextensionregistry"></a>

### `ctx.deepseekLlmApiExtensions` — `DeepSeekLlmApiExtensionRegistry`

Registry unabhängig besessener Top-Level-Felder für offizielle DeepSeek-Anfragen.

```ts cordis-catalog
/**
 * Register the sole provider of one top-level request field. Registration is effect-scoped.
 * @param field - declaration-merged field owned by the provider.
 * @param provider - request-time field preparation and optional acceptance behavior.
 * @returns disposer that releases the field.
 */
register<K extends keyof DeepSeekLlmApiExtensionMap>( field: K, provider: DeepSeekLlmApiExtensionProvider<DeepSeekLlmApiExtensionMap[K]>, ): () => Promise<void>

/**
 * Prepare every currently registered field from one immutable base request.
 * A provider whose preparation throws, or whose value cannot be cloned, is omitted
 * from this request; the first such failure per field is logged. Only cancellation rejects. Field values are cloned
 * and frozen; providers retain no mutable alias to the outgoing request.
 * @param request - exact serialized request facts before extension fields.
 * @returns detached fields and their idempotent joint acceptance transaction.
 */
async prepare(request: DeepSeekLlmApiExtensionRequest): Promise<PreparedDeepSeekLlmApiExtensions>
```

Quelle: [`packages/llm/deepseek-llm-api-extensions/src/index.ts`](../../packages/llm/deepseek-llm-api-extensions/src/index.ts)

<a id="ctxllm--llmruntime"></a>

### `ctx.llm` — `LlmRuntime`

Der abstrakte Dienst `llm`: eine Adapter-Registry plus eine Streaming-API für Modellaufrufe, abfangbar über den `llm/stream`-Waterfall.

```ts cordis-catalog
/**
 * Register an adapter for the given provider routes. Throws `LlmError` with code
 * `DUPLICATE_ADAPTER` if any provider already has an adapter (all-or-nothing).
 * Disposed with the fiber.
 * @param providers - every provider route this adapter should serve.
 * @param adapter - the adapter that streams calls for those providers.
 * @returns the disposer, carrying {@link AdapterRegistrationHandle.replace}.
 */
registerAdapter(providers: string[], adapter: LlmAdapter): AdapterRegistrationHandle

/**
 * Describe provider routes with a registered adapter.
 * @returns detached provider metadata in registration order.
 */
@Remote listProviders(): LlmProviderInfo[]

/**
 * Declare provider routes an adapter plugin can activate through
 * configuration. Registration is all-or-nothing: an empty list, invalid
 * entry, or a provider already declared by any registration throws
 * `LlmError` without registering the rest. Disposed with the fiber.
 * @param entries - every configurable provider this plugin owns.
 * @returns a handle that withdraws all of them, and can atomically replace them.
 */
registerConfigurableProviders(entries: readonly LlmConfigurableProvider[]): DirectoryRegistrationHandle

/**
 * List every declared configurable provider, registered or dormant.
 * @returns detached directory entries in declaration order.
 */
@Remote listConfigurableProviders(): LlmConfigurableProvider[]

/**
 * Offer to interrogate provider endpoints on behalf of the settings
 * namespace this plugin owns. The namespace is the key because that is what
 * a configuration surface already holds from the configurable-provider
 * directory, and because a provider being *added* has no route to name yet.
 * Disposed with the fiber.
 * @param settingsNs - the namespace whose profiles this discovery serves.
 * @param discover - interrogates one endpoint and must honor the supplied signal.
 * @returns the disposer that withdraws the offer.
 */
registerModelDiscovery( settingsNs: string, discover: ( request: LlmModelDiscoveryRequest, signal?: AbortSignal, ) => Promise<readonly LlmDiscoveredModel[]>, ): () => void

/**
 * Interrogate one provider endpoint for the models it advertises. The
 * request describes a draft, not a stored route, so nothing here reads or
 * writes settings or credentials — the caller owns both, and the reply is
 * candidate metadata a surface may offer for adoption.
 * @param settingsNs - namespace whose registered discovery serves this draft.
 * @param request - the endpoint, protocol, and one-shot credential to use.
 * @param signal - caller cancellation.
 * @returns the advertised models, deduplicated in endpoint order.
 */
async discoverModels( settingsNs: string, request: LlmModelDiscoveryRequest, signal?: AbortSignal, ): Promise<LlmDiscoveredModel[]>

/**
 * Remote adapter for one draft provider interrogation.
 * @param settingsNs - namespace whose registered discovery serves this draft.
 * @param request - endpoint, protocol, and one-shot credential to use.
 * @param signal - caller cancellation supplied by the Remote carrier.
 * @returns advertised models in endpoint order.
 * @throws RemoteError with `llm/model-discovery-rejected` when discovery refuses or fails.
 */
@Remote('discoverModels') async remoteDiscoverModels( settingsNs: string, request: LlmModelDiscoveryRequest, signal: AbortSignal, ): Promise<LlmDiscoveredModel[]>

/**
 * Resolve the retry policy captured when one provider route was registered.
 * @param provider - registered provider route to inspect.
 * @returns the provider-owned policy, with normal defaults already resolved.
 */
providerRetryPolicy(provider: string): ResolvedRetryPolicy

/**
 * Resolve provider-side request-image pricing for one exact route, or
 * `undefined` when the provider is unregistered or declares none. Unknown
 * providers degrade to `undefined` rather than throwing because callers
 * price durable history whose route may no longer be mounted.
 * @param provider - provider route named by a request header.
 * @param model - exact model id named by the same header.
 * @returns the owning adapter's image pricing for the route, when declared.
 */
imageRequestPricing(provider: string, model: string): LlmImageRequestPricing | undefined

/**
 * Resolve the exact text one durable file occurrence contributes to every
 * provider request in the current execution environment.
 * @param ref - durable verbatim file reference from model history.
 * @returns the same deterministic handle text used at adapter dispatch.
 */
fileRequestText(ref: FileAttachmentRef): string

/**
 * Discover models advertised by one registered provider. Catalog membership
 * does not constrain core routing. Catalog-driven entry points may restrict
 * selection and submission to the advertised models.
 * @param provider - registered provider route to inspect.
 * @returns detached model metadata in adapter-preferred order.
 */
async listModels(provider: string): Promise<LlmModelInfo[]>

/**
 * Resolve and validate all metadata from the adapter that owns one exact
 * route. The result is detached from adapter-owned objects; catalog
 * membership remains advisory and does not control request routing.
 * @param provider - registered provider route to inspect.
 * @param model - exact model id passed to the adapter.
 * @param signal - optional cancellation for adapter-owned asynchronous lookup.
 * @returns exact model identity plus available context and reasoning metadata.
 */
async resolveModelInfo( provider: string, model: string, signal?: AbortSignal, ): Promise<LlmResolvedModelInfo>

/**
 * Validate a conversation call config against its exact model capability and
 * materialize adapter-configured defaults. Unsupported explicit efforts
 * reject before provider I/O; no clamping or aliasing is performed. This
 * standalone query does not bind a later dispatch; use {@link prepareCall}
 * when logging and streaming must share one adapter registration.
 * @param config - provider/model route and optional request controls.
 * @param signal - optional cancellation for adapter-owned capability lookup.
 * @returns a detached config only when a default must be materialized.
 */
async resolveCallConfig(config: LlmCallConfig, signal?: AbortSignal): Promise<LlmCallConfig>

/**
 * Resolve one call under its current adapter registration. The returned
 * one-shot handle keeps that registration across header logging and dispatch,
 * so HMR cannot combine one adapter's capability result with another adapter.
 * An optional synchronous callback selects concrete controls using captured
 * model metadata. Defaults and validation apply to its result. Callback
 * failures and cancellation reject preparation before dispatch.
 * @param config - provider/model route and optional concrete request controls.
 * @param signal - optional cancellation for adapter-owned capability lookup.
 * @param configure - pure control selection, called once before defaults and validation.
 * @returns a prepared config and its registration-bound stream entry point.
 */
async prepareCall( config: LlmCallConfig, signal?: AbortSignal, configure?: ConfigureCall, ): Promise<PreparedLlmCall>

/**
 * Stream one model call as raw chunks (token-level deltas). Replay state is
 * retained only when the same adapter instance owns its historical provider
 * and the target provider. Final adapter selection remains fixed through
 * asynchronous exact-model resolution and dispatch. Adapter selection,
 * dispatch, and iteration failures become terminal `error` or `aborted`
 * finish chunks; middleware, nested-call, cleanup, and consumer failures
 * remain thrown.
 * @param options - the full request; `options.provider` selects the adapter.
 * @returns the chunk stream, possibly wrapped by `llm/stream` listeners.
 */
stream(options: GenerateOptions): AsyncIterable<StreamChunk>
```

Types: [FileAttachmentRef](attachment.md)

Quelle: [`packages/llm/llm/src/index.ts`](../../packages/llm/llm/src/index.ts)

<a id="llm-events"></a>

### `llm/*`-Events

<a id="llmadapters-updated--emit"></a>

#### `llm/adapters-updated` — emit

Die Provider-Topologie hat sich geändert: Ein Adapter hat Routen registriert oder abgemeldet, oder das Verzeichnis konfigurierbarer Provider hat Einträge gewonnen oder verloren. Diese nutzlastfreie Registry-Benachrichtigung feuert an jedem Commit-Punkt (einschließlich der Entsorgung von Registrierungen); Consumer lesen `listProviders()`, `listModels()` oder `listConfigurableProviders()` für den neuen Zustand erneut. Beobachterfehler werden eingedämmt und können die Registry-Mutation nicht vetoieren.

```ts cordis-catalog
/**
 * The provider topology changed: an adapter registered or unregistered
 * routes, or the configurable-provider directory gained or lost entries.
 * This payload-free registry notification fires at each commit point
 * (including registration disposal); consumers re-read `listProviders()`,
 * `listModels()`, or `listConfigurableProviders()` for the new state.
 * Observer failures are contained and cannot veto the registry mutation.
 * @mode emit
 */
'llm/adapters-updated'(): void
```

Quelle: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

<a id="llmstream--waterfall"></a>

#### `llm/stream` — waterfall

Waterfall um jeden streamenden Modellaufruf (Retry, Replay, Routing). An den LlmRuntime gebunden; `next()` aufrufen, um den Stream des aufgelösten Adapters zu erreichen, oder eigene Chunks ausgeben, um kurzzuschließen.

```ts cordis-catalog
/**
 * Waterfall around every streaming model call (retry, replay, routing).
 * Bound to the {@link LlmRuntime}; call `next()` to reach the resolved
 * adapter's stream, or yield your own chunks to short-circuit.
 * @param options - the full request. A LOOP-built request carries the
 *   process-local {@link markAgentLoopRequest} identity and arrives deep-frozen
 *   (mutation throws): its content is a pure function of the session log (the
 *   reconstructability Agent Note), so listeners read it, never rewrite it.
 *   Hand-built calls do not carry that marker; callers own their request
 *   inputs and must keep them unchanged until the stream settles.
 * @mode waterfall
 */
'llm/stream'(this: LlmRuntime, options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>
```

Quelle: [`packages/llm/llm/src/index.ts`](../../packages/llm/llm/src/index.ts)
<!-- END GENERATED cordis-surface -->
