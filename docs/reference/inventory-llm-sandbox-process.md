# Referenz-Inventar: LLM-Adapter, Sandbox, Prozess/FS/Terminal und Capability-Provider

**Zweck.** Reine Lese-Inventur (read-only analysis) der TypeScript-Pakete für den LLM-Seam, die
Sandbox, den Prozess-/FS-/Terminal-Unterbau und die umgebenden Capability-Provider. Jede Aussage
trägt den Dateipfad, aus dem sie stammt. **Quelle:** `C:\Users\Chang\harness\prometheus-harness`
(Monorepo der DeepSeek-Harness-Referenzvorlage), primär `packages\<gruppe>\<paket>\src\*.ts`,
`lib/types/*.d.ts` nur zur Signaturbestätigung. **Datum:** 2026-02-14. **Read-only:** im Quell-Repo
wurde nichts angelegt, geändert oder gelöscht; `docs\dsh` und `docs\design` wurden nicht geöffnet;
dies ist die einzige geschriebene Datei. **Abdeckung:** alle angeforderten Pakete existieren;
`packages\document` enthält nur `office-to-pdf`, `packages\telemetry` nur `otel`.

---

## 1. Der LLM-Seam und die Adapter

### 1.1 `LlmAdapter` — die Provider-Schnittstelle (`packages\llm\llm\src\index.ts`)

| Methode | Condensed Signatur | Default-Implementierung |
| --- | --- | --- |
| `providerInfo` | `providerInfo(provider: string): LlmProviderInfo` | `{ id: provider, name: provider }` |
| `providerRetryPolicy` | `providerRetryPolicy(_provider: string): ResolvedRetryPolicy \| undefined` | `undefined` ⇒ Normal-Defaults |
| `imageRequestPricing` | `imageRequestPricing(_provider, _model): LlmImageRequestPricing \| undefined` | `undefined` |
| `listModels` | `listModels(_provider: string): Promise<readonly LlmModelInfo[]>` | `Promise.resolve([])` |
| `resolveModel` | `resolveModel(provider, model, _signal?): Promise<LlmResolvedModelInfo>` | `{ provider, id: model, name: model }` |
| `prepareCall` | `prepareCall(provider, model, signal?): Promise<PreparedAdapterCall>` | `{ model: await this.resolveModel(…), stream: o => this.stream(o) }` |
| `stream` | `abstract stream(options: GenerateOptions): AsyncIterable<StreamChunk>` | **einzige Pflichtmethode** |

`PreparedAdapterCall = { model: LlmResolvedModelInfo; stream(options): AsyncIterable<StreamChunk> }`.
Vertrag: jede Provider-HTTP-Anfrage muss `attributionHeaders()` tragen (Modulkommentar zu `LlmAdapter`;
`packages\llm\llm\src\attribution.ts`).

### 1.2 `LlmRuntime` (`ctx.llm`, `packages\llm\llm\src\index.ts`)

`registerAdapter(providers, adapter): AdapterRegistrationHandle` (`INVALID_ADAPTER`,
`DUPLICATE_ADAPTER`, `REGISTRATION_DISPOSED`; all-or-nothing, `handle.replace(providers)` atomar) ·
`@Remote listProviders(): LlmProviderInfo[]` · `registerConfigurableProviders(entries):
DirectoryRegistrationHandle` (`INVALID_DIRECTORY`, `DUPLICATE_DIRECTORY`, `REGISTRATION_DISPOSED`) ·
`@Remote listConfigurableProviders()` · `registerModelDiscovery(settingsNs, discover): () => void`
(`INVALID_DISCOVERY`, `DUPLICATE_DISCOVERY`) · `discoverModels(settingsNs, request, signal?)`
(`NO_DISCOVERY`, `INVALID_DISCOVERY`; dedupliziert in Endpunkt-Reihenfolge; `remoteDiscoverModels`
ist der `@Remote('discoverModels')`-Carrier und wirft `RemoteError('llm/model-discovery-rejected')`) ·
`providerRetryPolicy(provider): ResolvedRetryPolicy` (`NO_ADAPTER`) · `imageRequestPricing(provider,
model)` (unbekannte Route ⇒ `undefined`) · `fileRequestText(ref): string` (deterministischer
Handle-Text) · `listModels(provider): Promise<LlmModelInfo[]>` (`INVALID_CATALOG`) ·
`resolveModelInfo(provider, model, signal?)` (`INVALID_MODEL_INFO`, `INVALID_MODEL_CONTEXT`,
`INVALID_MODEL_MAX_TOKENS`, `INVALID_MODEL_REASONING`) · `resolveCallConfig(config, signal?)`
(`UNSUPPORTED_REASONING_EFFORT`) · `prepareCall(config, signal?, configure?): Promise<PreparedLlmCall>`
(`INVALID_PREPARED_CALL`) · `stream(options)` (durch den `llm/stream`-Waterfall).
`PreparedLlmCall = { config; retryPolicy; context?; inputModalities?; systemPromptUpdate?;
toolUpdate?; adapterDefaults; stream(options) }`; `stream()` darf genau **einmal** und nur mit
identischer Call-Config aufgerufen werden. Events: `llm/adapters-updated()` (emit, nicht-vetierend),
`llm/stream(options, next)` (waterfall). `LlmError extends HarnessError` trägt `failure: LlmFailure`.

### 1.3 Request `GenerateOptions` (`packages\llm\llm\src\types.ts`)

`provider: string` (registrierte Route) · `model: string` · `reasoningEffort?: ReasoningEffortId` ·
`messages: RequestMessage[]` · `system?: string` · `tools?: ToolSchema[]` · `toolHistory?: ToolHistory` ·
`temperature?: number` · `maxTokens?: number` · `stop?: string[]` (nicht im Output) ·
`signal?: AbortSignal` · `sessionId?: Branded<'SessionId'>` ·
`purpose?: 'compaction' | 'session-title'`.
`ToolSchema = { deferLoading?: true; name; description; parameters: Record<string, unknown> }`;
`ToolHistory = { tools: readonly ToolSchema[]; updates: readonly { messageId: MessageId;
additions: readonly ToolSchema[] }[] }`. `LlmCallConfig`, `LlmCallControls`, `callConfigEquals`,
`markAgentLoopRequest`, `isAgentLoopRequest` in `packages\llm\llm\src\call-config.ts`.

### 1.4 Response-Vokabular (`packages\llm\llm\src\types.ts`)

`FinishReasonMap`: `'stop'`, `'tool-calls'`, `'max-tokens'`, `'aborted'` (mit `failure: LlmFailure`),
`'error'` (mit `failure`). `TokenUsage` — Zähler sind **disjunkt**: `inputTokens` (nur ungecachter
Input), `outputTokens`, `totalTokens?`, `cacheReadTokens?`, `cacheWriteTokens?`, `reasoningTokens?`;
DeepSeek-`prompt_tokens` wird entsprechend zerlegt.
`LlmFailure = { message; code; status?; providerRetryAfterMs?; requestId?; offloadImages? }`
(`offloadImages` nur mit `IMAGE_OFFLOAD_REQUIRED`). `LlmImageRequestPrice = { visualTokens; text }`;
`LlmImageRequestBudget = { representation: 'raw' | 'base64'; maxBytes?; maxImages?; byteQuantum?;
countQuantum? }`; `LlmModelReasoningInfo = { efforts; defaultEffort? }`;
`LlmResolvedModelInfo = LlmModelInfo & { context?; defaultMaxTokens?; reasoning?;
systemPromptUpdate?; toolUpdate? }`; `SystemPromptUpdate = 'in-history'`;
`ToolUpdate = 'in-history' | 'addition-only'`.

### 1.5 Streaming-Delta-Shape `StreamChunk` (`packages\llm\llm\src\types.ts`)

`{ type: 'block-start'; index; blockType: ContentBlockType }` ·
`{ type: 'text-delta'; index; text }` · `{ type: 'reasoning-delta'; index; text }` ·
`{ type: 'tool-call-delta'; index; id: ToolCallId; name?; argumentsDelta: string }` ·
`{ type: 'block-end'; index; block: ContentBlock }` · `{ type: 'usage'; usage: TokenUsage }` ·
`{ type: 'finish'; reason: FinishReason; replayState?: ReplayEnvelope }`.
Regeln: Block-Indizes korrelieren verschachtelte Deltas; `block-end` trägt den assemblierten Block;
`usage` kommt **vor** dem terminalen `finish`, danach nichts mehr; Tool-Argumente bleiben rohe
JSON-Strings; ein geworfener Adapterfehler wird über `adapterFailureChunk` auf `error`/`aborted`
normalisiert. `ContentBlockMap`: `'text'`, `'reasoning'`, `'image'`, `'file'`, `'tool-call'`,
`'tool-addition'`, `'tool-removal'`; `ToolCallBlock.arguments` ist ein roher JSON-String.
`ReplayEnvelope = { response: unknown; blocks?: readonly unknown[] }` mit einem `blocks`-Eintrag pro
emittiertem Block in First-Seen-Reihenfolge; Längen-Mismatch verwirft das Envelope.

### 1.6 Tool-Calls in Request und Stream

**Request:** `GenerateOptions.tools: ToolSchema[]` (mit `deferLoading: true` möglich); Änderungen
laufen als `ToolAdditionBlock`/`ToolRemovalBlock` in Developer-Messages plus `ToolHistory`;
`projectToolUpdates(...)` (`packages\llm\llm\src\content.ts`) wählt anhand von
`LlmResolvedModelInfo.toolUpdate` aus, was die Route erhält.
**Stream:** `block-start` (`blockType: 'tool-call'`) → initialer `tool-call-delta` mit
`{ index, id, name, argumentsDelta: '' }` → weitere `tool-call-delta`-Chunks, deren `argumentsDelta`
**akkumuliert** wird (roher JSON-String) → `block-end` mit dem assemblierten `ToolCallBlock`.
**Assemblierung:** `BlockAssembler` (`assembler.ts`), `AssistantStreamAccumulator`/
`assembleAssistantStream` (`assistant-stream.ts`).

### 1.7 Retry-Policy (`packages\llm\llm\src\retry-policy.ts`, Ausführung `packages\llm\llm-retry\src\index.ts`)

`NormalRetryPolicyConfig` (`mode: 'normal'`) und `AlwaysRetryPolicyConfig` (`mode: 'always'`) sind
in `RetryPolicySchema` vereint; `resolveRetryPolicy(config, path)` liefert `ResolvedRetryPolicy`.
Defaults: `DEFAULT_MAX_RETRIES 5`, `DEFAULT_INITIAL_DELAY_MS 500`, `DEFAULT_MAX_DELAY_MS 10_000`,
`DEFAULT_JITTER_RATIO 0.1`, `DEFAULT_RETRYABLE_CODES = ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER',
'TIMEOUT', 'TRANSPORT']`. Validierung: Delays positiv, finit, `<= MAX_TIMER_DELAY_MS`,
`initialDelayMs <= maxDelayMs`; `jitterRatio ∈ [0, 1]`; `maxRetries` nicht-negativer Safe-Integer;
`retryableCodes` nicht leer und duplikatfrei; unbekannte Keys ⇒ Fehler.

| Situation | Ergebnis |
| --- | --- |
| Policy `undefined` | `next()` |
| `normal`, `failure.code` ∉ `retryableCodes` | `next()` — **fatal** |
| `always` | Downstream-Recovery zuerst; deren `kind: 'retry'` gewinnt, Downstream-Fehler wird nur geloggt |
| `providerRetryAfterMs > maxDelayMs` | `normal`: `next()`; `always`: lokaler Backoff |
| `previousRetry >= maxRetries` (nur `normal`) | `next()` |
| Abbruch (Signal oder Plugin-Lifetime) | kein Retry |
| sonst | `llm/retry` loggen → warten → `llm/retry-started` loggen → `{ kind: 'retry' }` |

**Backoff** (`localDelay`): `exponent = min(retry - 1, 1024)`;
`exponential = min(initialDelayMs * 2 ** exponent, maxDelayMs)`;
`jitter = 1 - jitterRatio + 2 * jitterRatio * random()`; `delay = min(exponential * jitter, maxDelayMs)`.
Ein gültiges, finites, positives `providerRetryAfterMs` wird direkt übernommen, sofern es
`maxDelayMs` nicht überschreitet. Das Warten ist abbrechbar (`cancellableDelay`); der Retry wird
**vor** dem Warten durabel geloggt. Der Executor hat keine Konfiguration
(`Config = Readonly<Record<string, never>>`, `retryPolicy` wird abgelehnt); `internals.random` ist
Testhook. `RetryId` in `packages\llm\llm-retry\src\brand.ts`; Eventtypen in
`packages\llm\llm-retry\src\types.ts`; Projektion `llmRetry`, `stateVersion: 1`.

### 1.8 `token-meter` (`packages\llm\token-meter\src\`)

Konstanten (`estimate.ts`): `CHARS_PER_TOKEN 4`, `BLOCK_OVERHEAD 4`, `ROLE_OVERHEAD 4` (exportiert);
Exporte `estimateStructuralBlock`, `estimateContent`, `estimateSystemMessage`, `estimateMessage`,
`estimateToolsTokens` — das System-Prompt zählt Textdichte plus `ROLE_OVERHEAD` **ohne**
Block-Overhead. `priceSurface(nodes, pricing, fileText)` (`route-pricing.ts`) ersetzt
Attachment-Heuristiken durch die gesendete Repräsentation und ruft `pricing.priceImages(images)` auf;
ein Längen-Mismatch **wirft** (`token meter: route image pricing answered N prices for M
occurrences`). Service `TokenMeter` (`ctx.tokenMeter`, `index.ts`): `Config = z.object({})` (jeder
Schlüssel wird abgelehnt), `static inject = ['sessionProjections']`, Projektionen
`tokenUsageProjectionDefinition`, `contextPressureProjectionDefinition`,
`contextBreakdownProjectionDefinition`, Methoden `measure(session, requestHeader?)` und
`estimateMessage(message)`. `TokenMeasurement = { logRevision; baseline; surfaceDeltaTokens;
totalTokens; surfaceTokens; nodes }`; `TokenMeasurementBaseline = { kind: 'none'; tokens: 0 } |
{ kind: 'estimated'; tokens } | { kind: 'usage'; tokens; usage }`;
`TokenSurfaceNode = { seq; tokens; heuristicTokens }` (`types.ts`). `usageTokens()` summiert
`inputTokens + cacheRead + cacheWrite + outputTokens` **ohne** `reasoningTokens`. Ergänzend
`surface-fold.ts`, `surface-projection.ts`, `turn-usage.ts` (`deriveTurnTokenUsage`).

### 1.9 DeepSeek-Adapter (`packages\llm\llm-deepseek\src\`)

| Datei | Kern |
| --- | --- |
| `adapter.ts` | `class DeepSeekAdapter<C extends Connection> extends LlmAdapter` |
| `config.ts` | `Config`, `deepSeekConfigFields`, `plainOptions`, `resolveAdapterOptions`, `PUBLIC_BASE_URL = 'https://api.deepseek.com/anthropic'` |
| `messages-api.ts` | `MESSAGES_FILES_BETA = 'files-api-2025-04-14'`, `MESSAGES_TOOL_CHANGES_BETA = 'mid-conversation-tool-changes-2026-07-01'`, `messagesApiRoot(baseURL)` (hängt `/v1` an, wenn der Pfad nicht auf `/v1` endet) |
| `serialize.ts` | `serialize(options, connection, history, images, access, onReplayDegrade?, fileIds?): WireRequest` |
| `translate.ts` | `translate(events, model): AsyncGenerator<StreamChunk>`, `string(value)` |
| `sse.ts` / `transport.ts` | `parseSse(body, activity)`; `providerError(raw, status, headers?)`, `providerErrorDetail(raw)` |
| `model-info.ts` / `models.ts` | `modelInfo(connection, provider, model)`, `catalogModelInfo(...)`; `DEFAULT_MODELS` |
| `defaults.ts` / `request-pricing.ts` | Zeit-/Größen-Defaults (§10.1); Bildpreise, Request-Budgets |
| `file-store.ts`, `files-api.ts`, `request-files.ts`, `upload-index.ts`, `file-id.ts` | Files-API-Upload, Wiederverwendung, Quota-Recovery |
| `images.ts`, `image-tokens.ts`, `replay.ts` | Bildvorbereitung/Token-Projektion; `object`, `replayState`, `readReplay` |
| `request-extensions.ts`, `wire-types.ts`, `host.ts` | `prepareRequestExtensions(...)`; `WireInput`/`WireBlock`/`WireMessage`/`WireRequest`; `registerDeepSeekProvider(...)` |

**Wire-Request:** `model`, `stream: true`, `messages`, `max_tokens`,
`thinking: { type: 'disabled' | 'enabled' }`, optional `output_config: { effort }`, `system`,
`temperature`, `stop_sequences`, `tools` (mit `input_schema`, optional `defer_loading: true`).
Bilder werden als Handle-Text plus Bild-Eintrag serialisiert: ohne Files-Referenz
`source: { type: 'base64', media_type, data }`, mit Referenz `source: { type: 'file', file_id }`.
Tool-Änderungen erscheinen als `{ type: 'tool_addition' | 'tool_removal', tool: { type:
'tool_reference', name } }` und benötigen den Tool-Changes-Beta-Header.
**Reasoning/Effort:** erlaubte Werte genau `'off' | 'low' | 'high' | 'max'`; Auflösung
`options.reasoningEffort ?? connection.defaults.reasoningEffort ?? (thinking === 'disabled' ? 'off' :
'high')`; `thinking: { type: 'disabled' }` nur bei `effort === 'off'`, sonst `enabled` plus
`output_config.effort`; bei `thinking: 'disabled'` bietet `modelInfo` nur `off` an
(`OFF_ONLY_REASONING_EFFORTS`). **max-Tokens:** `options.maxTokens ?? model?.maxTokens ??
connection.maxTokens` (Default `256_000`).
**Streaming:** `message_start` → `content_block_start` → `content_block_delta`/`content_block_stop` →
`message_delta` → `message_stop`; `text_delta`→`text-delta`, `thinking_delta`→`reasoning-delta`,
`signature_delta`→kein Chunk (Signatur in den Replay-State), `input_json_delta`→`tool-call-delta`
(akkumuliert in `block.json`, bei `content_block_stop` nach `arguments`); `stop_reason`:
`end_turn`/`stop_sequence`→`stop`, `tool_use`→`tool-calls`, `max_tokens`→`max-tokens`; Usage aus
`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`,
`totalTokens` als Summe. Leere Antwort mit `stop` ⇒ `EMPTY_RESPONSE`; ohne `message_stop` ⇒
`STREAM_CLOSED`; unbekannte Blöcke/Deltas ⇒ `MALFORMED_RESPONSE`.
**HTTP-Fehler:** 401/403 oder `authentication_error`/`permission_error` ⇒ `AUTH`; Quota-Text oder 402
⇒ `QUOTA`; 429 oder `rate_limit_error` ⇒ `RATE_LIMIT`; Context-Window-Text ⇒
`CONTEXT_WINDOW_EXCEEDED`; 400/413 oder `invalid_request_error` ⇒ `INVALID_REQUEST`; ≥500,
`api_error`, `overloaded_error` ⇒ `SERVER`; sonst `SERVER` bzw. `HTTP_<status>`. `retry-after`
(Sekunden oder HTTP-Datum) ⇒ `providerRetryAfterMs`; Request-Id aus `request-id` / `x-request-id` /
`x-deepseek-request-id`.
**Header/Endpunkt:** `attributionHeaders()`, `content-type: application/json`,
`accept: text/event-stream`, `anthropic-version: 2023-06-01`, optional `anthropic-beta` (Komma-join),
`x-deepseek-harness-user-id`, optional `x-deepseek-harness-session-id`, bei
`purpose === 'compaction'` zusätzlich `x-deepseek-harness-compact: 1`; POST auf
`${messagesApiRoot(baseURL)}/messages` mit `redirect: 'error'`; Idle-Überwachung über
`idleWatchdog(signal, connection.streamIdleTimeoutMs, 'MESSAGES_IDLE')`; Fehler werden auf `TIMEOUT`,
`ABORTED`, `TRANSPORT` abgebildet.
**Default-Modelle:** `deepseek-flash` / `DeepSeek-V4.1-Flash`, `contextWindow 1_000_000`,
`inputModalities ['text','image']`, `systemPromptUpdate 'in-history'`, `toolUpdate 'addition-only'`;
`deepseek-v4-pro` / `DeepSeek-V4-Pro`, `contextWindow 1_000_000`, Modalitäten-Default `['text']`.
Reasoning-Ids: `off`, `low`, `high`, `max`. Katalog-Validierung: `imageDetail` entfernt (→
`imagePixelBudget`), Ids nicht leer und eindeutig, `contextWindow`/`maxTokens` positive Integer,
`inputModalities` nicht leer, duplikatfrei und nur `text`/`image`, text-only-Modelle ohne Bildlimits,
`systemPromptUpdate` nur `'in-history'`, `toolUpdate` nur `'in-history'`/`'addition-only'`; `baseURL`
muss credential-, query- und fragmentfreies HTTP(S) sein; ein Feld `protocol` wird abgelehnt.

### 1.10 Extension-Felder (`packages\llm\deepseek-llm-api-extensions\src\`)

`DeepSeekLlmApiJson` = rekursiver JSON-Wert; `DeepSeekLlmApiExtensionMap` ist eine leere,
merge-extensible Tabelle (Contributor-Pakete deklarieren ihr Top-Level-Feld per Declaration-Merging).
`DeepSeekLlmApiExtensionRequest = { body: Readonly<Record<string, DeepSeekLlmApiJson>>; sessionId?;
purpose?: 'compaction' | 'session-title'; signal: AbortSignal }`;
`PreparedDeepSeekLlmApiExtension<T> = { value: T; accept?(): void | Promise<void> }`;
`PreparedDeepSeekLlmApiExtensions = { fields; accept(): Promise<void> }`.
`DeepSeekLlmApiExtensionRegistry` (`ctx.deepseekLlmApiExtensions`) bietet `register(field, provider)`
und `prepare(request)`: genau ein Provider pro Feld, Feldname nicht leer und getrimmt, ein
Vorbereitungsfehler lässt das Feld **weg** (erster Fehler pro Feld wird geloggt), Werte werden
geklont, tief eingefroren und in ein `Object.create(null)`-Objekt gesammelt, `accept()` ist memoisiert
und sammelt Fehler zu `AggregateError`. Das Merging in
`packages\llm\llm-deepseek\src\request-extensions.ts` ist `{ ...body, ...fields }`; eine Kollision
mit einem Basis-Feld wirft `REQUEST_EXTENSION`; schlägt die Serialisierung fehl, wird nur der
Basis-Body gesendet und `accept` ist ein No-op.

### 1.11 `llm-pi-ai` (`packages\llm\llm-pi-ai\src\`)

Adapter über `@earendil-works/pi-ai`; `Config = { providers: Record<string, PiAiProviderProfile> }` —
der **Dict-Schlüssel ist die Provider-Route**. Profilfelder: `apiKeyEnv`, `displayName`, `api`,
`baseURL`, `models`, `modelOverrides`, `compat`, `defaultContextWindow`, `defaultMaxTokens`,
`defaultInput`, `headers`, `reasoning`, `thinkingBudgets`, `cacheRetention`, `transport`
(`'sse' | 'websocket' | 'websocket-cached' | 'auto'`), `timeoutMs`, `websocketConnectTimeoutMs`,
`streamIdleTimeoutMs`, `maxRequestImageBytes`, `requestImagePixelBudget`, `requestImageMaxBytes`,
`retryPolicy`. Defaults: `DEFAULT_STREAM_IDLE_TIMEOUT_MS 300_000`,
`DEFAULT_MAX_REQUEST_IMAGE_BYTES 20 MiB`, `DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET 2048*2048`,
`DEFAULT_REQUEST_IMAGE_MAX_BYTES 1 MiB`, `DEFAULT_CONTEXT_WINDOW 262_144`,
`DEFAULT_MAX_TOKENS 32_768`, `DEFAULT_INPUT ['text']`; `discovery.ts`: `MAX_RESPONSE_BYTES 4 MiB`.
Exporte: `PiAiAdapter`, `PiAiAdapterOptions`, `Config`, `resolveProfiles`, `assertServiceable`,
`recordKeyFor`, `supportedProtocols`, `createModels`, `createProvider`, `getSupportedThinkingLevels`,
`conversationUpdates`, `discoverModels`, `mapUsage`, `mapStopReason`, `toStreamChunks`,
`toPiReplayState`, `toPiAssistant`, `toPiContext`, `registerPiAiFlows`. `RECORD_SCOPE = 'llm-pi-ai'`
(`auth.ts`). Entfernte Legacy-Felder (`provider`, `maxRetries`, `maxRetryDelayMs`) werden mit Verweis
auf `dsh-llm-retry` abgelehnt, `providers` als Array wird abgelehnt, Header werden gegen Fetch
validiert.

### 1.12 Credential-Auflösung und Endpunkt

**`llm-deepseek-api-key`** (`src\index.ts`, `src\config.ts`), Route
`const PROVIDER = 'deepseek-official'`, Anzeigename `DeepSeek`: (1) Credential-Referenz
`connection.apiKeyEnv`; Schemastery-Default `z.string().role('credential-ref')
.default('DEEPSEEK_API_KEY').volatile()`. (2) Wenn `ctx.credentials` gemountet ist:
`await credentials.resolve(ref)`, ein Treffer wird durch `assertUsableApiKey(value, 'llm-deepseek',
ref)` geprüft. (3) Sonst `launchEnvironmentOf(ctx).get(ref)` (nur wenn die Umgebungsschicht
existiert und der Wert nicht leer ist), ebenfalls über `assertUsableApiKey`. (4) Sonst `LlmError` mit
`MISSING_CREDENTIAL`. Header: `{ 'x-api-key': <key> }`; Discovery liefert bei `MISSING_CREDENTIAL`
eine leere Liste statt zu werfen. `assertUsableApiKey` (`packages\llm\llm\src\index.ts`) trimmt und
wirft bei leerem oder header-untauglichem Wert `INVALID_CREDENTIAL`; die Meldung nennt nur die
Referenz, nie den Key.
**`llm-deepseek-account`** (`src\index.ts`, `src\config.ts`), Route
`const PROVIDER = 'deepseek-account'`, Anzeigename `DeepSeek Account`: (1)
`ctx.get('deepseekAccount')`, dann `await account.resolveToken(connection.baseURL)`. (2) Kein Token
⇒ `LlmError(…, 'ACCOUNT_SIGN_IN_REQUIRED')`. (3) Header `{ 'x-dsh-auth-token': token }`.
(4) `onRequestError`: `QUOTA` ⇒ `ACCOUNT_QUOTA`; HTTP 401 ⇒ `ACCOUNT_TOKEN_INVALID` plus
`account.rejectToken(token)` (ein Speicherfehler ersetzt den Inferenzfehler nicht). `Config`
entspricht der Protokoll-Config **ohne** API-Key-Referenz.
Beide Routen registrieren sich als configurable provider (Namespace
`ctx.fiber.entry?.options.id ?? name`, `settingsPath: []`) und nutzen `discoverModels` über
`catalogModelInfo`. **Endpunkt** (`packages\llm\llm-deepseek\src\config.ts`):
`config.baseURL ?? environment?.get('DEEPSEEK_BASE_URL')?.value ?? PUBLIC_BASE_URL`.

### 1.13 `plugin-package-inventory-deepseek`

`name = 'plugin-package-inventory-deepseek'`, `inject = ['agents', 'deepseekLlmApiExtensions',
'loader']` (`src\index.ts`); eigenes `Config`-Schema; registriert einen Extension-Provider, der
Paket-Identität an den offiziellen DeepSeek-Request anheftet (`DeepSeekPluginPackageIdentity`,
`DeepSeekPluginPackageInventoryExtension` in `src\types.ts`).

---

## 2. Sandbox

### 2.1 Policy-Modell (`packages\sandbox\sandbox-policy\src\index.ts`) — die vollständigen Knobs

| Knob | Typ | Erlaubte Werte | Default |
| --- | --- | --- | --- |
| `mode` | `SandboxMode?` | `'read-only'`, `'workspace-write'`, `'danger-full-access'` | `'read-only'` (fail-safe) |
| `workspaceRoot` | `string?` | absoluter Pfad | `process.cwd()` (im Konstruktor absolut aufgelöst) |

Das Paket besitzt **keine weiteren Knobs**. `SANDBOX_MODES` (`session-mode.ts`) enthält genau diese
drei Werte; `setSandboxMode(session, mode)` schreibt das `sandbox/mode`-Event.
`SandboxPolicyRequest = { session?: Session; mode?: SandboxMode }`; `resolve()` ordnet: explizit
genehmigter Modus > Session-Override (`overrideOf`) > Deployment-Default; `workspaceRoot` ist
`session?.header.cwd ?? this.workspaceRoot`; `resolveWorkspaceRoot` verlangt einen absoluten Pfad;
Projektion `sandboxMode` (`stateVersion: 1`, Init `null`) faltet `sandbox/mode`. Die
System-Prompt-Sektion `sandbox:policy` rendert `renderPolicyContext(policy)` mit drei Texten:
`read-only` = „Current DSH file policy: read-only. … Do not refuse a required modification from this
policy alone …“; `workspace-write` = „… may modify files under the session workspace: <root>. Some
platform temporary areas may also be writable.“; `danger-full-access` = „… does not restrict file
modifications by available operations.“

### 2.2 Service-Definition (`packages\sandbox\sandbox\src\index.ts`)

`SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'`;
`ConfinedSandboxMode = Exclude<SandboxMode, 'danger-full-access'>`;
`SandboxExecutionPolicy = { mode; workspaceRoot; sessionId? }`;
`SandboxPolicy = SandboxExecutionPolicy & { mode: ConfinedSandboxMode }`;
`SandboxEnforcement = 'full' | 'partial'`; `ConfinedArgv = { argv: string[]; enforcement;
denialSignatures: readonly string[]; runnerFailureRules: readonly RunnerFailureRule[] }`;
`RunnerFailureRule = { allowedExitCodes?: readonly number[]; fatalSignatures: readonly string[];
informationalLines?: readonly string[] }`; `SANDBOX_UNAVAILABLE = 'SANDBOX_UNAVAILABLE'` mit
`SandboxUnavailableError`.
`abstract confine(argv: readonly string[], policy: SandboxPolicy, signal?: AbortSignal):
Promise<ConfinedArgv>` — einzige abstrakte Methode; stiller unconfined Passthrough ist verboten
(fail closed); funktionale Proben arbitrieren nur mehrgliedrige Runner-Ketten.
Escalation: `WIDER_MODES`, `ESCALATION_TARGETS = ['workspace-write', 'danger-full-access']`,
`validateEscalationArgs`, `sandboxDenialMarker(mode)`, `escalationHintMarker(subject)`,
`sandboxPermissionsDescription(subject)`, `approveEscalation(...)`, `EscalationOutcome =
'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'`.
Roots: `canonicalPath(path)` über `realpathSync.native` (bei Fehlschlag unveränderte Schreibweise);
`writableRoots(policy)` unter `workspace-write` = kanonisch dedupliziert `[workspaceRoot, '/tmp',
os.tmpdir()]`, unter `read-only` leer. Diagnostik: `isRunnerSpawnFailure`, `classifyRunnerFailure`,
`matchesSignature`.

### 2.3 `sandbox-local` (`packages\sandbox\sandbox-local\src\index.ts`, `profiles.ts`)

| Plattform | Kette (`PLATFORM_CHAINS`) | Statisch gemeldetes Enforcement |
| --- | --- | --- |
| `linux` | `bwrap`, dann `landlock` | `bwrap: 'full'`, `landlock: 'full'` |
| `darwin` | `seatbelt` | `'full'` |
| `win32` | `windows-acl` | `'partial'` |

Eine Kette mit **einem** Kandidaten wird ohne Probe gewählt; nur mehrgliedrige Ketten werden
funktional geprobt; Plattform ohne Kette ⇒ Fail-closed in `confine()`, das vorher `workspaceRoot`
kanonisiert. `Config`: `runnerCommand: string[]` (Default `[]`), `runnerFailureSignatures: string[]`
(Default `[]`), `probeTimeoutMs` (Default `5_000`); `runnerFailureSignatures` ohne `runnerCommand`
ist ungültig und umgekehrt, Signaturen müssen nicht-leere einzeilige Strings sein, ein
Operator-Runner assertiert `enforcement: 'full'` und überspringt Selektion/Probing, `probeTimeoutMs`
muss positiv und finit sein (Node deutet `timeout: 0` als unbegrenzt).
**Profil-Dialekte:** `bwrap` = `['--ro-bind','/','/','--dev','/dev','--unshare-pid','--proc','/proc',
'--die-with-parent']`, unter `workspace-write` zusätzlich `['--tmpfs','/tmp']` und `['--bind',
workspaceRoot, workspaceRoot]`; `landlock` = `grantArgs({ readOnly: ['/'], readWrite })` mit
`readWrite = ['/dev/null']` plus unter `workspace-write` `['/tmp', workspaceRoot]`; `seatbelt` =
`sandbox-exec -p '(version 1) (allow default) (deny file-write*) (allow file-write* (literal
"/dev/null")) …'` mit schreibbaren Wurzeln aus `writableRoots(policy)` als `(subpath "…")`.
**Denial-Signaturen:** `bwrap` → `['read-only file system']`; `landlock` → `['permission denied']`;
`seatbelt` → `['operation not permitted']`; `windows-acl` → `['access is denied', 'access to the
path', 'permission denied', 'operation not permitted']`; konfigurierter `runnerCommand` →
`['read-only file system', 'permission denied']`.
**Runner-Failure-Regeln:** `bwrap` → `fatalSignatures: ['bwrap: ']`; `landlock` →
`allowedExitCodes: [125]`, `fatalSignatures: ['<LAUNCHER_BIN>: ']`, `informationalLines:
['<LAUNCHER_BIN>: partial enforcement (older Landlock ABI)']`; `seatbelt` → `['sandbox-exec: ']`;
`windows-acl` → `allowedExitCodes: [127]`, `fatalSignatures: ['windows-acl-run: ']`.
**Proben:** `bwrap` über `spawnSync('bwrap', [...read-only-Profil, '--', 'true'])` mit
`timeout: probeTimeoutMs` und `stdio: 'ignore'`; Seatbelt analog über den `sandbox-exec`-Pfad;
windows-acl startet den Runner mit `--workspace <tmpdir> --temp <tmpdir> --mode read-only -- cmd /c
exit 0`.
**Windows-ACL-argv:** ohne Session oder unter `read-only` `--workspace <root> --temp <tmpdir>
--mode <mode>` ohne SID-Flags; unter `workspace-write` mit Session zusätzlich `--write-sid
<workspaceWriteSid(root)>` und `--temp-write-sid <tempWriteSid(dir)>` für ein pro
Session/Workspace-Paar einmalig erzeugtes privates Temp-Verzeichnis
(`mkdtempSync(join(tmpdir(), 'dsh-'))`); Workspace-Grants sind stehend
(Cross-Session-Reuse-Cache), Temp-Grants werden bei Provider-Dispose widerrufen;
`assertTempRootOutsideWorkspace` verhindert ein Temp im Workspace; der Diagnose-Skill wird nur unter
`win32` und nur ohne `runnerCommand` registriert.

### 2.4 `sandbox-windows-acl` — konkrete Mechanik (`packages\sandbox\sandbox-windows-acl\src\`)

Win32-Bindings über `koffi` (`ffi.ts`, `kernel32.dll` + `advapi32.dll`): `OpenProcess`,
`OpenProcessToken`, `LocalAlloc`, `LocalFree`, `ConvertStringSidToSidW`, `CreateWellKnownSid`,
`IsValidSid`, `GetLengthSid`, `CopySid`, `GetTokenInformation`, `SetTokenInformation`,
`CreateRestrictedToken`, `SetEntriesInAclW`, `InitializeAcl`, `AddMandatoryAce`,
`SetNamedSecurityInfoW`, `GetNamedSecurityInfoW`, `GetTempPathW`, `SetEnvironmentVariableW`,
`SetConsoleCtrlHandler`, `CreateFileW`, `LockFileEx`, `UnlockFileEx`.

| Baustein | Datei | Wirkung |
| --- | --- | --- |
| `openCurrentProcessToken`, `findLogonSid` | `token.ts` | Token öffnen; Logon-SID aus `TokenGroups` (`SE_GROUP_LOGON_ID = 0xC0000000`) |
| `makeWellKnownSid`, `setTokenDefaultDaclGrant` | `token.ts` | Low-Integrity-SID (`WinLowLabelSid = 66`); `TokenDefaultDacl` (= 6) |
| `restrictTokenIntegrity` | `token.ts` | `TokenIntegrityLevel = 25` mit `SYSTEM_MANDATORY_LABEL_NO_WRITE_UP = 0x1` |
| `createRestrictedToken` | `token.ts` | `DISABLE_MAX_PRIVILEGE = 0x1`, `LUA_TOKEN = 0x4`, `WRITE_RESTRICTED = 0x8` |
| `buildExplicitAccess`, `buildLowLabelAcl`, `grantWrite`, `revokeWrite` | `acl.ts` | `SetEntriesInAclW` + `SetNamedSecurityInfoW` mit `DACL_SECURITY_INFORMATION = 0x4` / `LABEL_SECURITY_INFORMATION = 0x10`, Vererbung `SUB_CONTAINERS_AND_OBJECTS_INHERIT = 0x3`, Label-ACE `SYSTEM_MANDATORY_LABEL_ACE_TYPE = 0x11` |
| `withPathLock`, `lockFilePath` | `acl.ts` | Lock-Datei über `CreateFileW`/`LockFileEx` (`LOCKFILE_EXCLUSIVE_LOCK = 0x2`, `LOCKFILE_FAIL_IMMEDIATELY = 0x1`) |
| `workspaceWriteSid`, `tempWriteSid` | `workspace-sid.ts` | deterministische bzw. verzeichnisgebundene Capability-SIDs |
| `assertTempRootOutsideWorkspace`, `assertPrivateTempDisjoint` | `path-boundary.ts` | verhindern privates Temp im Workspace |
| `AclWriteGrant.create/add/dispose` | `grant.ts` | Erteilen/Widerrufen der Schreibrechte |
| `AclSandbox`, `AclSandboxOptions`, `AclSandboxSpawnOptions`, `AclSandboxChild`, `AclSandboxChildResult` | `index.ts` | Runner-seitige Ausführung |
| `spawnSandboxed`, `spawnSandboxedInherited`, `waitForExit` | `spawn.ts` | nutzt `SpawnedPipedProcess`/`SpawnedJobProcess` aus `dsh-win32-process` |
| `ACL_DIAGNOSIS_SKILL = 'diagnose-windows-sandbox-acl'`, `registerAclDiagnosisSkill(ctx)` | `acl-skill.ts` | Diagnose-Skill |

**Grant-Maske** (`win32-abi.ts`): `GRANT_MASK = (FILE_GENERIC_WRITE | DELETE | FILE_DELETE_CHILD) &
~STANDARD_RIGHTS_WRITE` mit `FILE_GENERIC_WRITE = 0x00120116`, `DELETE = 0x00010000`,
`FILE_DELETE_CHILD = 0x0040`, `STANDARD_RIGHTS_WRITE = 0x00020000`; weitere ABI-Konstanten:
`FILE_ALL_ACCESS = 0x1F01FF`, `MAX_PATH = 260`, `SECURITY_MAX_SID_SIZE = 68`,
`SID_MAX_SUB_AUTHORITIES = 15`, `EXPLICIT_ACCESS_W_SIZE = 48`, `TRUSTEE_W_OFFSET = 16`,
`ACL_HEADER_SIZE = 8`, `MANDATORY_ACE_OVERHEAD = 8`, `TOKEN_MANDATORY_LABEL_SIZE = 16`,
`ACL_REVISION = 2`, `LPTR = 0x0040`, `ERROR_LOCK_VIOLATION = 33`, `GRANT_ACCESS = 1`,
`DENY_ACCESS = 3`, `REVOKE_ACCESS = 4`, `CONTAINER_INHERIT_ACE = 0x2`,
`PROCESS_QUERY_INFORMATION = 0x0400`, `TOKEN_ASSIGN_PRIMARY = 0x0001`, `TOKEN_DUPLICATE = 0x0002`,
`TOKEN_QUERY = 0x0008`, `TOKEN_ADJUST_DEFAULT = 0x0080`.
**Gewährt/verweigert:** Der Kindprozess läuft mit eingeschränktem Token unter Low-Integrity; das
Low-Label verweigert Write-Up; Schreibzugriff entsteht ausschließlich über die expliziten
Schreib-ACEs der beiden Capability-SIDs (Workspace-Wurzel, privates Temp); der Prozessstart läuft
über `CreateProcessAsUserW` (`dsh-win32-process`).
**Failure-Modes** (`packages\sandbox\sandbox-local\src\index.ts`, Kommentar zu
`STATIC_ENFORCEMENT['windows-acl']`): `enforcement = 'partial'`, weil (a) NTFS-Hardlinks eine
berechtigte Workspace-Datei auf einen Pfad außerhalb aliasen, (b) Reads **nicht** confiniert sind und
(c) ein von einem anderen AppContainer-Tool mit Package-SID ACL'ter Baum für das Low-Integrity-Kind
nicht lesbar ist. Zusätzlich fail-closed: eine halb materialisierte Temp-Grant-Kombination wird
widerrufen und das Verzeichnis entfernt; ein Cleanup-Fehler nach einem Workspace-Grant-Fehler wird
als `AggregateError` gemeldet.

### 2.5 Linux-Landlock-Enforcement und Abgrenzung

Zwei Stufen: (1) `bwrap` mit Mount-Profil, `--unshare-pid`, `--proc /proc`, `--die-with-parent`;
(2) der Landlock-Launcher aus `@deepseek-ai/node-addon-system/landlock-run` mit
`landlockGrantArgs({ readOnly: ['/'], readWrite })`, aufgelöst über `launcherPath()` und geprüft über
`probe()`; `LAUNCHER_BIN` und `LAUNCHER_FAILURE_EXIT` (in der Failure-Regel als `125` verwendet)
stammen aus diesem Paket. Der Launcher meldet auf stderr bei jedem confinierten Lauf selbst partielle
Enforcement („partial enforcement (older Landlock ABI)“) — genau diese Zeile liefert die
Unterscheidung `full`/`partial`, weshalb Landlock in der Linux-Kette nur probiert ausgewählt wird.
**Echte Durchsetzung:** `sandbox-local` erzeugt konkrete Runner-argv; bwrap/Landlock/Seatbelt sind
kernel-gestützt, windows-acl token- und ACL-gestützt; `SandboxUnavailableError` verhindert
unbemerktes unconfined Ausführen. **Nur Modellierung:** `renderPolicyContext` ist Text für das Modell
und beansprucht ausdrücklich nicht, welche Capabilities gemountet sind;
`SandboxExecutionPolicy.workspaceRoot` wird auch unter Modi mitgeführt, die ihn nicht nutzen;
`enforcement: 'partial'` ist eine Selbstauskunft des Backends; `denialSignatures` und
`runnerFailureRules` sind Klassifikations-Metadaten für stderr-Text und erzwingen nichts; `fs-sandbox`
bezeichnet sich selbst als Containment, **nicht** als Security-Boundary und nicht TOCTOU-fest
(`packages\fs\fs-sandbox\src\index.ts`).

---

## 3. Subprozess und Prozess-Aufsicht

### 3.1 Prozess-API und Windows-Mechanik (`subprocess\subprocess\src\`, `subprocess\win32-process\src\`)

`abstract class SubprocessRuntime extends Service` (`ctx.subprocess`):
`resolveExecutable(command, env?, signal?) => Promise<string>` · `terminalEnvironment(signal?)` ·
`spawn(spec: SubprocessSpawnSpec): SubprocessHandle` (synchron) ·
`spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle>`.
`SubprocessSpawnSpec = { argv: readonly string[] (nie shell-interpretiert); cwd: string;
stdio: SubprocessStdio; graceMs: number; signal?: AbortSignal; env?: NodeJS.ProcessEnv }` — der Seam
setzt **keine** Defaults. `SubprocessStdio = { stdin: 'ignore' | 'pipe' | { data: string };
stdout: 'pipe' | 'inherit' | SubprocessCollect; stderr: …; control?: 'pipe' }`;
`SubprocessCollect = { maxBytes; spill?: { maxBytes } }`.
`SubprocessHandle`: `stdin?`, `stdout?`, `stderr?`, `control?` (Duplex), `collected`
(`readFrom(fromByte) => { text, nextOffset, lossy, spillPath? }`), `done: Promise<SubprocessOutcome>`,
`terminate(): void` (idempotent, auch über das Abort-Signal), `waitForExit(signal?):
Promise<boolean>` (wartet, bis der **verwaltete Bereich** leer ist; `false` bei Abbruch; wirft, wenn
der Provider ihn nicht mehr beobachten kann). `SubprocessOutcome = { exitCode: number | null;
signal: NodeJS.Signals | null }` — bewusst ohne Timeout-Klassifikation und ohne Output, weil
collected Streams nach dem Settlement lesbar bleiben.
`SubprocessTerminalHandle`: `pid`, `output: Readable`, `done`, `write(data)`, `resize(cols, rows)`,
`inspectForeground()`, `inspectActivity()`, `signalForeground(signal): Promise<number>`,
`terminate(): Promise<void>`; `SubprocessTerminalSignal = 'SIGINT' | 'SIGTERM' | 'SIGKILL' |
'SIGTSTP' | 'SIGHUP'`; `SubprocessTerminalActivity = { state: 'idle' | 'busy' | 'unknown';
revision: number }`; `SubprocessTerminalForeground = { processGroupId; inputWaiting }`.
**Environment-Overlay:** `SENSITIVE_ENV_PATTERN = /KEY|PASSWORD|SECRET|TOKEN/i`; `scrubbedParentEnv()`
entfernt alle passenden und alle `DSH_*`-Namen (beide Scrubs case-insensitive) und legt danach
`proxyEnvironmentForChild()` darüber (`undefined` löscht); explizites `spec.env` merged **nach** dem
Scrub, `undefined` ist ein Tombstone. **Control-Kanal:** `SUBPROCESS_CONTROL_FD = 7`,
`SUBPROCESS_CONTROL_ENV = 'DSH_SUBPROCESS_CONTROL'`, `openInheritedControlChannel(): Duplex`.
**`win32-process`:** FFI-Bindings (`ffi.ts` über `koffi`) `CreatePipe`, `SetHandleInformation`,
`CreateProcessAsUserW`, `CreateProcessW`, `ReadFile`, `PeekNamedPipe`, `WaitForSingleObject`,
`GetExitCodeProcess`, `CreateJobObjectW`, `AssignProcessToJobObject`, `ResumeThread`,
`TerminateProcess`, `TerminateJobObject`, mit Layout-Prüfungen `STARTUPINFOW_SIZE = 104` und
`PROCESS_INFORMATION_SIZE = 24` (Mismatch ⇒ Throw). Prozess-API (`process.ts`): `quoteArg`,
`buildCommandLine`, `spawnPipedProcess`, `drainPipe`, `waitForProcessExit`, `spawnInheritedJobProcess`,
`spawnCurrentTokenJobProcess`, `probeCurrentTokenJobSupport`, `pollProcessExit`, `isJobEmpty`,
`terminateJob`, `closeHandleChecked`. Mechanik: Kindprozesse starten mit `CREATE_SUSPENDED`, werden
per `AssignProcessToJobObject` in ein Job-Object aufgenommen und über `ResumeThread` gestartet; das
Job-Object trägt `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; `isJobEmpty` liest die aktive Prozesszählung
am Offset 40 im 48-Byte-Accounting-Block; Pipes über `CreatePipe`, Vererbung über
`SetHandleInformation(…, HANDLE_FLAG_INHERIT)`, Drain über `PeekNamedPipe` + `ReadFile`, wobei
`ERROR_BROKEN_PIPE` (109) und `ERROR_NO_DATA` (232) den Drain regulär beenden; Exit über
`WaitForSingleObject`/`GetExitCodeProcess`; `control-stdio.ts` erzeugt den Deskriptorblock für das
geerbte Control-Handle (`inheritedControlStdio`), der bis zur Rückkehr von `CreateProcess` am Leben
bleiben muss. `MoveFileExW` kommt hier **nicht** vor; es wird in
`packages\session\session-persistence-jsonl\src\win32.ts` (`MOVEFILE_WRITE_THROUGH`) und in
`packages\storage\storage-json\src\atomic.ts` (über libuv `MOVEFILE_REPLACE_EXISTING`) verwendet.

### 3.2 `subprocess-local` (`packages\subprocess\subprocess-local\src\`)

| Datei | Kern |
| --- | --- |
| `index.ts` | `class LocalSubprocessRuntime extends SubprocessRuntime`; `defaultShell` = `process.env.ComSpec` (Windows) bzw. `process.env.SHELL \|\| userInfo().shell` |
| `spawn.ts` | `childEnv`, `LocalSubprocessHandle`, `killGroup`, `taskkillProcessTree`, `validateSubprocessSpec`, `bindManagedProcess`, `spawnSubprocess` |
| `output.ts` | `OutputCollector`, `SpillOptions`, `prepareManagedProcessBinding`, `logSpillFailure` |
| `process-inspector.ts` | `ProcessIdentity`, `ProcessSnapshot`, `ProcessInspector`, `parseProcStat`, `linuxProcessGroupHasLiveMembers`, `createProcessInspector` |
| `windows-inspector.ts`, `windows-job.ts` | `windowsProcessTree`, `WindowsProcessInspector`, `createWindowsProcessInspector`; `probeWindowsJob`, `launchWindowsJob` |
| `linux-scope.ts`, `linux-execve.ts` | `probeLinuxBootstrap/Scope/Manager/Native`, `launchLinuxScope`, `prepareLinuxTerminalScope`, `signalLinuxDirectProcess`; `loadLinuxExecve` (direkter `execve`, `FD_CLOEXEC`) |
| `terminal.ts` | `class LocalTerminalHandle implements SubprocessTerminalHandle` (node-pty) |
| `runner-launch.ts` | `SUBPROCESS_RUNNER_ENV = 'DSH_SUBPROCESS_RUNNER'`, `WINDOWS_RUNNER_SELECTION = 'windows'`, `spawnRunnerInvocation`, `runnerInvocationAvailable`, `runnerEnvironment`, `consumeRunnerSelection`, `parseRunnerTargetArgv`, `runnerStdio`, `resolveWindowsExecutable`, `targetEnvironment` |
| `runner-protocol.ts` | `LinuxLaunchRequest`, `WindowsStartRequest`, `WindowsTerminateRequest`, `createLinuxLaunchFiles`, `writeLinuxStartupError`, `readLinuxStartupError`, `parseWindowsStartRequest`, `isWindowsTerminateRequest`, `parseWindowsRunnerResult`, `serializeRunnerError`, `deserializeRunnerError`, `cleanupLinuxLaunchFiles` |
| `spawn-runner.ts`, `control-spawn.ts`, `shell-activity.ts`, `managed-owner.ts`, `bin.ts` | `runSpawnRunner`, `reportSpawnRunnerFailure`; `controlPipe`, `controlEnvironment`; `ShellActivity`, `prepareShellActivity`; `BoundProcessOwner`, `ManagedProcessLaunch`, `waitWithAbort`; `runSelectedSubprocessRunner(selection)` |

**Signal-/Exit-Semantik** (`spawn.ts`): Termination als `SIGTERM`, nach `spec.graceMs` als `SIGKILL`;
unter Windows beendet `taskkill /PID <pid> /T /F` den Baum (`taskkillProcessTree`), nicht-forcierte
Signale ohne `/F` (`windows-inspector.ts`); ein noch offener collected Pipe erhält nach Prozess-Exit
maximal `spec.graceMs`, dann wird das Ergebnis mitgeteilt; `validateSubprocessSpec` erzwingt `graceMs`
positiv, finit und `<= MAX_TIMER_DELAY_MS`; Linux-Scope nutzt `SYSTEMCTL_TIMEOUT_MS = 5_000` und
`SCOPE_INITIAL_POLL_INTERVAL_MS = 50`.

---

## 4. Shell und Terminal

### 4.1 Shell-Seam und Environment (`packages\shell\shell\src\`, `packages\shell\shell-env\src\index.ts`)

`abstract class ShellExecutor extends Service` (`ctx.shell`): `get sandboxMode(): SandboxMode |
undefined` (Default `undefined`), `abstract resolve(request: ShellExecRequest): ShellExecSpec`,
`abstract execute(spec: ShellExecSpec): Promise<ShellExecution>`.
`ShellExecRequest = { command; workdir?; timeoutMs?; onExpiry?; stdoutMaxBytes?; signal?; stdin?;
env?; dshEnv?; sandboxPolicy? }`; `ShellExpiryPolicy = 'kill' | 'none'` — `'none'` armt **keinen**
Timer, `timeoutMs` wird nur zurückgespiegelt. `ShellRunResult = { exitCode; signal; timedOut;
aborted; timeoutMs; stdout; stderr; sandbox? }` mit **gegenseitig ausschließenden**
`timedOut`/`aborted` (First-Cause); `ShellSandboxInfo = { mode; denied; enforcement?; runnerFailed? }`;
`ShellProcess = { status: 'running' | 'completed' | 'killed'; exitCode; signal; done; sandbox?;
readOutput(): ShellProcessRead; observed: ShellObservedStreams; kill(): boolean }`;
`ShellExecution = ShellProcess & { result(): Promise<ShellRunResult> }` (memoisiert, wirft nur bei
Infrastrukturfehlern); `parseExitStatus(text)` (`render.ts`) invertiert `\n[exit code: N]` und
`\n[killed by signal: X]`.
`ShellEnvRegistry extends Service` (`ctx.shellEnv`, `name = 'shell-env'`, `inject: string[] = []`,
`Config = { dshHome?: string }`, Default `$DSH_HOME` dann `~/.dsh` über `resolveDshHome`) baut die
`DSH_*`-Umgebung. Eingebaute Fakten in `collect(execution)`: `DSH_HOME`, `DSH_SHELL = '1'`, bei
Agent `DSH_SESSION_ID = session.header.id`, bei gemountetem `profileContext` zusätzlich `DSH_PROFILE`
und `DSH_PROFILE_DIR`. Reservierte Schlüssel: `DSH_HOME`, `DSH_SHELL`, `DSH_SESSION_ID`,
`DSH_PROFILE`, `DSH_PROFILE_DIR`; Key-Muster `^[A-Z][A-Z0-9_]*$` nach `DSH_`. `register(contributor)`
ist effekt-scoped und erzwingt eindeutige Namen und Keys; `collect` sortiert Contributors nach Name,
wirft bei nicht deklarierten Keys oder Nicht-String-Werten und liefert ein tiefgefrorenes, nach
Schlüssel sortiertes Objekt; `list()` zählt nur Plugin-Beiträge auf (TODO im Code: eingebaute Fakten
fehlen).

### 4.2 Die vier Shell-Provider

| Paket | Klasse | `static inject` | Unterschiede |
| --- | --- | --- | --- |
| `shell\bash-local` | `LocalBashExecutor` | `['subprocess']` | `ENV_OVERRIDES = { NO_COLOR: '1', TERM: 'dumb', PAGER: 'cat', GIT_PAGER: 'cat' }`; Config `cwd`, `timeoutMs` (120_000), `maxTimeoutMs` (600_000), `maxOutputBytes` (64_000), `maxSpillBytes` (64 MiB), `graceMs` (3_000) |
| `shell\pwsh-local` | `PwshLocalExecutor` | `['subprocess']` | identische Budgets plus `pwshPath`; eigene `ENV_OVERRIDES` und `ENCODING_PREAMBLE`; `candidatePwshPaths`, `resolvePwshPath` (`resolve.ts`) |
| `shell\bash-sandbox` | `SandboxBashExecutor extends LocalBashExecutor` | `['subprocess', 'sandbox', 'sandboxPolicy']` | wickelt argv über `ctx.sandbox.confine(...)` und klassifiziert Denials/Runner-Fehler (`helpers.ts` re-exportiert `isRunnerSpawnFailure`, `classifyRunnerFailure`, `matchesSignature` aus `dsh-sandbox` plus `classifyDenial`) |
| `shell\pwsh-sandbox` | `SandboxPwshExecutor extends PwshLocalExecutor` | `['subprocess', 'sandbox', 'sandboxPolicy']` | dieselbe Rolle für PowerShell; eigene Kopien der Klassifikatoren in `helpers.ts` |

Alle vier validieren ihre Config (`assertServiceableBashConfig`/`assertServiceablePwshConfig`:
positiv und finit; `graceMs <= MAX_TIMER_DELAY_MS`).

### 4.3 Die vier Shell-Tools

`tool-bash` und `tool-pwsh` (`packages\shell\tool-bash\src\index.ts`, `packages\shell\tool-pwsh\src\index.ts`),
Config jeweils `{ enableRunInBackground: true, promoteOnTimeout: true }`,
`inject = ['tools', 'shell', 'systemPrompt', 'shellEnv', 'workingDirectory']`:

| Parameter | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| `description` | `string` | ja | prägnante Beschreibung des Befehls |
| `command` | `string` | ja | auszuführender Befehl |
| `workdir` | `string` | nein | Arbeitsverzeichnis, relativ gegen den Session-Workspace |
| `run_in_background` | `boolean` | nein | nur bei aktiviertem Hintergrund; liefert sofort eine Job-Id, kein Timeout |
| `sandbox_permissions` | `string` (Enum der Eskalationsmodi) | nein | verlangt `danger-full-access` oder den breiteren Modus |
| `justification` | `string` | nein | mit `sandbox_permissions` erforderlich: ein Satz für den Nutzer |
| `timeout_ms` | `number` | nein | **nur `tool-pwsh`** („Max wait in milliseconds with wait: true. Defaults to and is capped by configuration.“); beide Tools reichen `args.timeoutMs` intern weiter |

Verhalten: bei gesetztem `sandbox_permissions` laufen `validateEscalationArgs` und
`approveEscalation`, die Policy kommt aus `ctx.sandboxPolicy.resolve(...)`; die Ausführung erfolgt im
Vordergrund oder als Job (`ctx.jobs.start({ kind: 'bash' })` bzw. `kind: 'pwsh'`); `promoteOnTimeout`
befördert ein Foreground-Timeout zum Hintergrund-Job (`renderPromoted`); Ergebnisse werden über
`parseExitStatus` in eine `terminal`-Karte gerendert; beide erweitern die JobKindMap
(`{ bash: 'bash' }` bzw. `{ pwsh: 'pwsh' }`).
`tool-bash-persistent` und `tool-pwsh-persistent`:
`inject = ['tools', 'terminals', 'workingDirectory']` — sie nutzen die **Terminal**-API, nicht
`ctx.shell`; Parameter **nur** `command` (Pflicht); Config `backendType` (Default `'shell'`),
`timeoutMs` (Default `300_000`), `maxOutputChars` (Default `16_000`), `description` (Default „Run
commands in a persistent bash shell. State, including the current directory and exported environment
variables, persists across calls for this agent.“ bzw. die PowerShell-Variante); pro Owner genau eine
persistente Shell, ein `WeakMap`-Queue serialisiert Operationen pro Owner, und bei
`waitReason === 'stdin_read'` wird der erfasste Scrollback zurückgegeben statt bis zum Deadline zu
warten.

### 4.4 Terminal-API (`packages\terminal\terminal\src\`)

`TerminalSessionService extends Service` (`ctx.terminals`) hält eine `TerminalBackend`-Registry:
`TerminalBackend = { readonly type: string; spawn(spec: TerminalBackendSpawnSpec):
Promise<TerminalBackendSession> }`; `TerminalBackendSpawnSpec = TerminalSpawnRequest &
{ sessionId; owner: Agent; signal? }`, `TerminalSpawnRequest = { type; name?; cwd? }`.
`TerminalBackendSession` — das open/write/resize/read/close-Modell: `motd: string` (initialer
begrenzter Output) · `pid?: number` · `startSend(request: TerminalSendRequest):
TerminalSendOperation` (genau **eine** aktive Operation) · `read(request: TerminalReadRequest):
TerminalReadResult` (begrenzte Scrollback-Seite) · `signal(signal: TerminalSignal):
Promise<TerminalSignalResult>` (nur verifizierte Vordergrundgruppe) · `status():
TerminalSessionStatus` · `close(reason: string): Promise<void>` (idempotent, wartet Quieszenz ab).
`TerminalSendRequest = { text; submit; signal? }`; `TerminalSendOperation = { done;
readOutput(): TerminalSendRead; cancel(): boolean }`; `TerminalSendResult = { viewport; waitReason:
'stdin_read' | 'inferred_idle' | 'timeout' | 'session_exit'; sessionStatus; truncated }`;
`TerminalReadResult = { text; totalLines; lineBegin; lineEnd; truncated }`;
`TerminalSignalResult = { delivered: true; targetPgid: number }`; `TerminalSessionStatus =
{ kind: 'running' } | { kind: 'exited'; exitCode: number | null; signal: NodeJS.Signals | null }`;
`TerminalBackendCleanupError extends AggregateError` trägt `spawnError` und `cleanupError`;
`TerminalError` und `TerminalErrorCode` liegen in `index.ts`; `TerminalSessionId(value)` ist ein
Brand-Konstruktor; Session-Namen werden pro Owner reserviert.

### 4.5 `terminal-bash` — PTY und ConPTY

Config-Defaults (`packages\terminal\terminal-bash\src\config.ts`): `backendType 'shell'`,
`shellDialect 'bash'`, `shellPath` = `/bin/bash` (`DEFAULT_BASH_SHELL`) bzw. `resolvePwshPath()`,
`shellArgs` = bash `['--noprofile','--norc','-i']` (`DEFAULT_BASH_ARGS`) bzw. pwsh `['-NoLogo',
'-NoProfile']` (`DEFAULT_PWSH_ARGS`), `rows 40`, `cols 160`, `scrollbackLines 10_000`,
`scrollbackMaxBytes 4 MiB`, `maxReadBytes 256 KiB` (darf `scrollbackMaxBytes` nicht überschreiten),
`pollIntervalMs 50`, `exactProbeAfterMs 150`, `idleSilenceMs 3_000`, `handoffGraceMs 500`
(mindestens `pollIntervalMs`), `promptTailGraceMs 0` (null oder mindestens `pollIntervalMs`),
`timeoutMs 30_000`, `disposeGraceMs 3_000`. `validateConfig` verlangt positive Safe-Integer für alle
numerischen Felder außer `promptTailGraceMs` (nicht-negativ) und prüft diese Kompositionsgrenzen;
`resolveConfig` wählt bei fehlendem oder leerem `shellPath`/`shellArgs` die Dialekt-Defaults
(Schemastery materialisiert ein fehlendes Array als `[]`, daher bedeutet auch Leerheit
„Dialekt-Default“).
PTY-Abstraktion: `class LocalPtySession implements TerminalBackendSession` (`session.ts`) über
node-pty, mit begrenztem Scrollback, Readyness-Erkennung und Terminal-Protokoll-Antworten;
`exactProbeAfterMs` steuert Linux-Syscall-Proben, `idleSilenceMs` die `inferred_idle`-Erkennung,
`handoffGraceMs` den Zusatz nach gesehenem Prompt-Marker und `promptTailGraceMs` den Fall eines noch
fehlenden druckbaren Prompt-Schwanzes; `timeoutMs` ist die absolute Grenze für einen Send und die
gesamte pwsh-Startsequenz. Fehlertexte: `PTY shell exited during startup`, `PTY shell did not reach
readiness before startup timeout`, `PTY session is closing`, `PTY session has exited`, `PTY session
already has an active send`, `PTY cleanup failed (...)`. Prompt-Kontrakt:
`PROMPT_MARKER_PREFIX = '133;D;'`, `CONTROLLED_PROMPT = 'dsh> '`, `TerminalSanitizer`,
`normalizeTerminalText` (`sanitize.ts`); `PWSH_PROMPT_SETUP` in `index.ts`;
`inject = ['terminals', 'sandboxPolicy', 'sessionProjections', 'subprocess', 'workingDirectory']`.
**ConPTY-Pfad unter Windows:** Die Terminal-Bytes stammen aus node-pty
(`packages\subprocess\subprocess-local\src\terminal.ts`); node-ptys `kill(signal)` wirft dort
(„Signals not supported on …“), daher läuft das Töten über `taskkill`-Baum-Eskalation oder den rohen
`kill`-Fallback; `SIGKILL` auf die Terminal-Shell selbst wird verweigert (`refusing to SIGKILL the
terminal shell; terminate the terminal session instead`); Windows unterstützt nur `SIGINT`,
`SIGTERM`, `SIGKILL` (`signal … is unsupported on Windows; only SIGINT, SIGTERM, and SIGKILL are
available`); ein extern per `taskkill` getöteter Windows-Shell-Prozess feuert ggf. nie node-ptys
Exit-Event, daher verifizieren die Teardown-Stufen den Zustand selbst
(`signalMembers`/`signalProcess`-Kette in `terminal.ts`); Foreground- und Aktivitätsbeobachtung
kommen aus dem `ProcessInspector` des Providers.

---

## 5. Dateisystem

### 5.1 `fs`-Service und die beiden Backends (`packages\fs\fs\src\`, `fs-local\src\`, `fs-sandbox\src\`)

`abstract class FileSystem extends Service` (`ctx.fs`): `watch(target, changed, signal):
Promise<() => Promise<void>>` (Basis wirft `FS_IO_ERROR`) · `get sandboxMode(): SandboxMode |
undefined` (Basis `undefined`) · `resolve(path, opts?): Promise<FsTarget>` · `processPath(target):
string` · `processPathFromHostPath(hostPath): string | undefined` (Basis `undefined`) ·
`fileUrl(target): string` · `contains(parent, child): boolean` · `stat(target, signal?)` /
`lstat(path, opts?, signal?)` · `readText(target, signal?)` · `streamText(target, signal?)` ·
`readBytes(target, signal, maxBytes)` (`FS_TOO_LARGE` statt Truncation) ·
`readByteRange(target, { offset, length }, signal?)` · `listDir(target, signal?)` (stabile
Namensordnung, nie Inhalte) · `writeText(target, content, expected?: FsWriteIntent, signal?,
sandboxPolicy?)` · `editText(target, edit, expected?: { version }, signal?, sandboxPolicy?)`.
Events: `fs/write-intent` und `fs/edit-intent` sind Single-Slot-Waterfalls (erster Rückgabewert
gewinnt), `fs/observed(target, observation, actor)` ist ein synchrones emit — geworfene Fehler
schlagen den Tool-Call fehl, Promises werden **nicht** erwartet.
Vokabular: `FsTargetKey`, `FsVersion` (opak, gebrandet), `FsObservation`,
`FsInfo { version; type: 'file' | 'directory' | 'other'; size? }`,
`FsPathInfo { version; type: 'file' | 'directory' | 'symlink' | 'other'; size? }`, `FsDirEntry`,
`FsWriteIntent = { kind: 'createIfAbsent' } | { kind: 'replaceIfVersion'; version }`,
`FsWriteOutcome { operation: 'create' | 'update'; version; before: string | null; after: string }`,
`FsEditRequest { oldString; newString; replaceAll }`, `FsEditOutcome { version; before; after }`,
`FsErrorCode` = `FS_NOT_FOUND`, `FS_NOT_DIRECTORY`, `FS_NOT_TEXT`, `FS_NOT_REGULAR_FILE`,
`FS_TOO_LARGE`, `FS_PERMISSION_DENIED`, `FS_SANDBOX_DENIED`, `FS_IO_ERROR`, `FS_STALE_VERSION`,
`FS_NOT_OBSERVED`, `FS_AMBIGUOUS_EDIT`, `FS_EDIT_NOT_FOUND`, `FS_ABORTED`; `FsError`.
`fs-local` (`index.ts`, `fsio.ts`, `win32.ts`): `class LocalFileSystem extends FileSystem`;
`Config = { cwd?: string; diffBasisMaxBytes?: number }` mit `DEFAULT_DIFF_BASIS_MAX_BYTES =
10 * 1024 * 1024`, gekappt durch `min(bufferConstants.MAX_LENGTH,
bufferConstants.MAX_STRING_LENGTH)`; `cwd` ist ein **Auflösungsdefault, keine Containment-Grenze**
(Kommentar im Code); `watch` nutzt chokidar mit `ignoreInitial: true, depth: 0`; `applyLiteralEdit`,
`LineEndings = 'LF' | 'CRLF'` und die Temp-Namen (`.<name>.<pid>.<uuid>.tmpdir`, `<name>.tmp`)
liegen in `fsio.ts`.
`fs-sandbox` (`index.ts`, `containment.ts`): `class SandboxedFileSystem extends LocalFileSystem`,
`Config = LocalConfig`; `sandboxMode` liefert den Deployment-Default des Policy-Service;
`writeText`/`editText` prüfen Containment auf dem **frisch kanonisierten** Pfad gegen
`writableRoots(policy)`; `isPathUnder(path, root, caseSensitive = process.platform !== 'win32')`
nimmt den lexikalischen Schnellpfad und fällt sonst auf Dateisystem-Identität zurück
(`dev`/`ino`-Vergleich der existierenden Vorfahren), um Windows-8.3-Aliase und
Groß-/Kleinschreibung zu erkennen.

### 5.2 `fs-observation-policy` (`packages\fs\fs-observation-policy\src\index.ts`, `types.ts`)

`name = 'fs-observation-policy'`; Event-only-Plugin ohne Service und ohne `inject`. Zustand:
`WeakMap<object, Map<string, FsObservation>>` — erster Schlüssel der Owner (`actor.agent.session`,
abgeleitet über `FsObservationActor` in `types.ts`), zweiter Schlüssel `target.targetKey`. Ohne
ableitbaren Owner liest der Aufruf frei, kann aber die Prior-Observation-Policy nicht erfüllen.
**Was als „observed“ gilt:** jedes `fs/observed`-Emit schreibt einen Eintrag —
`{ kind: 'present'; version }` nach autoritativem positivem Befund, `{ kind: 'absent' }` nach
bestätigter Abwesenheit; der Diskriminant trennt „ungesehen“ von „bestätigt abwesend“.
**Durchgesetzt wird:** `fs/write-intent` ⇒ ungesehen oder `absent` ergibt `{ kind: 'createIfAbsent' }`,
`present` ergibt `{ kind: 'replaceIfVersion', version: prior.version }`; `fs/edit-intent` ⇒ ohne
Owner oder Prior `FsError('edit requires reading "…" first', 'FS_NOT_OBSERVED')`, bei `absent`
`FsError('cannot edit "…": not found', 'FS_NOT_FOUND')`, bei `present` `{ version: prior.version }`;
`fs/observed` zeichnet synchron und nicht-werfend auf; Disposal setzt den WeakMap zurück
(HMR-Sicherheit). Ohne dieses Plugin behalten die Tools das unbedingte Mutationsverhalten des
Providers; die Provider-seitige atomare Frische-/No-Clobber-Prüfung bleibt bestehen.

### 5.3 Die FS-Tools

**`tool-fs`** (`packages\fs\tool-fs\src\`), `inject = ['tools', 'fs', 'systemPrompt',
'workingDirectory']`, Config-Defaults `readLimit = READ_LIMIT = 2000`,
`readMaxLineLength = READ_MAX_LINE_LENGTH = 2000`, `readMaxBytes = READ_MAX_BYTES = 50 * 1024`,
`readStreamMinSize = STREAM_MIN_SIZE = 10 * 1024 * 1024`:

| Tool | Parameter | Concurrency |
| --- | --- | --- |
| `read` | `file_path` (Pflicht), `offset` (1-basiert, Default 1), `limit` (Default `readLimit`) | **ja** (`read.ts:136`) |
| `read_image` | `file_path` (Pflicht); nur registriert, wenn `attachments` gemountet ist | **ja** (`read-image.ts:239`) |
| `write` | `file_path` (Pflicht), `content` (Pflicht) | nein (keine Deklaration) |
| `edit` | `file_path` (Pflicht), `old_string` (Pflicht), `new_string` (Pflicht), `replace_all` (Default false ⇒ genau ein Treffer nötig) | nein (keine Deklaration) |

Ausgabeschemas: `read` ⇒ `{ path, offset, lines: [{ number, text }], totalLines }`; `write` ⇒
`{ path, operation: 'create' | 'update', before: string | null, after }`; `edit` ⇒
`{ path, before, after }`; `read_image` ⇒ `{ path, image: { attachmentId, mediaType ∈
image/png|image/jpeg|image/webp|image/gif, bytes, width, height, name?, originalDimensions? } }`.
**`tool-fs-search`** (`packages\fs\tool-fs-search\src\`), `inject = ['tools', 'systemPrompt',
'subprocess', 'workingDirectory']` — bewusst **nicht** `fs`; nutzt das mitgelieferte
ripgrep-Binär (`@vscode/ripgrep`) über `ctx.subprocess.spawn()` und niemals `ctx.shell`.
Konstanten: `GLOB_MAX_RESULTS 100`, `GREP_MAX_MATCHES 250`, `GREP_MAX_LINE_BYTES 2000`,
`RAW_OUTPUT_MAX_BYTES 20_000_000`, `SEARCH_TIMEOUT_MS 30_000`, `SEARCH_STDERR_MAX_BYTES 64 * 1024`,
`SEARCH_GRACE_MS 3_000`, `SEARCH_META_MAX_BYTES 65_536`. Config: `sampleOverCapGlobResults`
(**pflichtig**, kein Default), `globMaxResults`, `grepMaxMatches`, `grepMaxLineBytes`,
`searchMetaMaxBytes`, `rawOutputMaxBytes`, `graceMs`, `stderrMaxBytes`, `timeoutMs` (übrige mit den
obigen Konstanten als Default; `graceMs <= MAX_TIMER_DELAY_MS`). Die beiden Tools `glob`
(`pattern` Pflicht, `path` optional mit Default Session-Workspace) und `grep` (`pattern` Pflicht,
`path` optional, `include` als einzelner Glob-Filter ohne Negation) tragen beide `timeoutMs` als
`ToolDefinition.timeoutMs` (erzwungen von `@deepseek-ai/dsh-tool-call-timeout-policy` über
`exec.signal`) und haben keine Concurrency-Deklaration; übermäßige Roh-Ausgabe schlägt mit
`SEARCH_RAW_OUTPUT_OVERFLOW` fehl; zurückgegebene Pfade sind workdir-relativ und nur in co-located
Deployments direkt wieder lesbar.
**`tool-str-replace-editor`** (`packages\fs\tool-str-replace-editor\src\index.ts`), Tool-Name
`str_replace_editor`, Output-Schema `{ type: 'string' }`, Config
`{ description: z.string().default(DEFAULT_DESCRIPTION) }`; Parameter: `command` (string, Pflicht,
Enum `view | create | str_replace | insert`), `path` (string, Pflicht, absolut),
`file_text` (string \| null, für `create` erforderlich), `insert_line` (integer \| null, für
`insert`: `new_str` wird **nach** dieser Zeile eingefügt), `new_str` (string \| null, `str_replace`-
Ersatztext bzw. `insert`-Einfügetext), `old_str` (string \| null, für `str_replace` erforderlich),
`view_range` (integer[] \| null, optional für `view`; 1-basiert, `[start, -1]` = bis Dateiende);
keine Concurrency-Deklaration.

---

## 6. SSH

### 6.1 Design und Multiplexing (`packages\ssh\ssh\src\`)

`class SshConnection extends Service` (`ctx.ssh`) besitzt genau **eine** nicht-wiederverbindende
OpenSSH-Verbindung zu einem versionierten POSIX-Helper; ein Verlust invalidiert alle laufenden
Operationen; der Service verlangt einen POSIX-Client (`process.platform` ∈ `linux`, `darwin`).
`Config` (Schemastery-Defaults): `host` (Alias, Pflicht), `launch` (`HelperLaunch`, Pflicht),
`helper` (absoluter Pfad, Pflicht), `helperHash` (SHA-256, Pflicht), `workspace` (absoluter
Remote-Pfad, Pflicht), `requestTimeoutMs` (Default `30_000`, max `2_147_483_647`), `maxFrameBytes`
(Default `64 * 1024 * 1024`), `maxPending` (Default `128`, max `128`), `leaseMs` (Default `30_000`,
min `3000`, max `600_000`); `HelperLaunch = { kind: 'node-script'; node; bootstrapPath?;
bootstrapHash? }` (Pfad und Hash müssen gepaart sein) oder `{ kind: 'executable' }`.
`ready: Promise<Hello>` muss vor dem Start abgewartet werden; `[Service.init]` hält die
Plugin-Readyness, bis Remote-Identität und Helper-Digest verifiziert sind; `ptcLaunch` liefert
`{ kind: 'embedded' | 'node-script'; executable; bootstrapPath? }`. Die RPC-Verbindung läuft über den
Helper-Prozess mit Heartbeat-Lease; jeder gestreamte Kanal ist ein **eigener** weitergeleiteter
Socket (`createConnection` aus `node:net`) mit Capability-basierter Autorisierung
(`authenticateStream`, `SSH_STREAM_TLS_OPTIONS` in `stream-security.ts`). `protocol.ts`:
`SSH_PROTOCOL_VERSION 2`, `SSH_MAX_PROCESS_HANDLES 128`, `SSH_MAX_TEXT_STREAMS 128`,
`SshRpcPeer extends EventEmitter`, `RemoteOperationError`; `helper-processes.ts`:
`class RemoteProcesses`. `schemas.ts` (Zod): `SshProcessId`, `SshTextStreamId` (UUID), `remotePath`
(absoluter POSIX-Pfad ohne NUL), `targetSchema`, `infoSchema`, `pathInfoSchema`, `policySchema`
(Modus + `workspaceRoot` + optional `sessionId`), `entriesSchema`, `intentSchema`, `editSchema`,
`writeResultSchema`, `editResultSchema`, `environmentSchema`, `spawnSchema`, `helloSchema`,
`streamEndpointSchema` (`{ path, capability }` mit 64 Hex-Zeichen), `preparedSchema`, `outcomeSchema`,
`outputSnapshotSchema`, `doneSchema`, `foregroundSchema`, `terminalActivitySchema`,
`outputSnapshotFrameLimit(maxBytes)`.

### 6.2 Remote-Varianten und Helper-Runtime

| Paket | Klasse | Basistyp | Besonderheit |
| --- | --- | --- | --- |
| `ssh\fs-ssh` | `SshFileSystem` | `FileSystem` | `static inject = ['ssh', 'sandboxPolicy']`; jede Operation ist ein Helper-RPC (`fs.resolve`, `fs.stat`, `fs.lstat`, `fs.readText`, `fs.stream`, `fs.next`, …) mit Zod-Validierung; `sandboxMode` = `ctx.sandboxPolicy.defaultMode`; `contains` über `posix.relative`; `fileUrl` über `pathToFileURL`; Fehlercodes werden gegen die vollständige `FsErrorCode`-Liste geprüft |
| `ssh\sandbox-ssh` | `SshSandboxProvider` | `SandboxProvider` | `static inject = ['ssh']`; `confine` ruft `ssh.request('sandbox', { argv, policy }, factsSchema)` und übersetzt in `ConfinedArgv`; jeder Fehler ⇒ `SandboxUnavailableError(policy.mode, …)` |
| `ssh\subprocess-ssh` | `SshSubprocessRuntime` | `SubprocessRuntime` | vollständiger Spawn-/Stream-/Handle-Aufbau auf der Gegenseite (`index.ts`) |
| `ssh\ssh-helper-runtime` | `runSshHelperRuntime()` | SEA-Dispatcher | nur unter `node:sea` (`isSea()`), sonst Fehler; registriert einen `node:module`-Resolve-Hook, der `@deepseek-ai/node-addon-system-<platform>-<arch>/package.json` auf `<execPath>/native/system/package.json` umbiegt (Landlock läuft außerhalb des SEA-VFS); wählt über `DSH_SUBPROCESS_RUNNER`: `DSH_PTC_RUNTIME_NODE === '1'` ⇒ `@deepseek-ai/dsh-ptc-runtime-node/process`, sonst gesetzter Runner ⇒ `@deepseek-ai/dsh-subprocess-local/runner` mit `runSelectedSubprocessRunner(selection)`, sonst `@deepseek-ai/dsh-ssh/helper` (`helper-entry.ts` ist der Einstiegspunkt) |

Die Runtime liefert damit auf die Remote-Seite den RPC-Helper selbst, den gewählten
Subprozess-Runner und optional den PTC-Node-Runtime-Prozess.

---

## 7. Jobs

### 7.1 Job-Modell, Events, Persistenz (`packages\jobs\jobs\src\`, `packages\jobs\jobs-local\src\`)

`JobStatus = 'running' | 'stopping' | 'completed' | 'killed' | 'failed'` (`view.ts`);
`JobKindMap` ist merge-extensibel und enthält im Kern nur `bash: 'bash'`; `JobKind` ist die Union der
registrierten Kind-Namen. **Alle im Repo gefundenen Job-Kind-Strings:**

| Kind-String | Definierendes Paket |
| --- | --- |
| `bash` | `packages\jobs\jobs\src\view.ts` (Kern-`JobKindMap`); gesetzt in `packages\shell\tool-bash\src\index.ts` |
| `pwsh` | `packages\shell\tool-pwsh\src\index.ts` |
| `workflow` | `packages\workflow\tool-workflow\src\index.ts` |
| `pty-send` | `packages\experimental\tool-terminal\src\index.ts` |
| `test-task` | nur Test-Fixture-Kind (`packages\jobs\jobs-local\tests\jobs.spec.ts`, `packages\jobs\tool-jobs\tests\tool-jobs.spec.ts`) — kein Produktions-Definierer |

`JobChannel = 'stdout' | 'stderr' | 'log'`; `JobChunk = { at; text; channel?; gapBefore? }`;
`JobView = { id; kind; label; owner?; outputLimitBytes?; status; progress?; detail?; startedAt;
finishedAt?; output: { total; earliest; spillPaths? } }` — `id` hat die Form `<kind>-N`, `owner`
fehlt bei unowned Jobs, `output.earliest > 0` genau dann, wenn Retention den Kopf verworfen hat.
`JobSettleCause = 'producer' | 'kill' | 'teardown'`; `JobSpec = { kind; label; owner?;
outputLimitBytes?; output?: readonly JobOutputSource[]; run(job: JobHandle): JobHooks }`;
`JobRead = { chunks; lossy; result?; job }`; `JobOutputRead = { chunks; next; lossy }`.
**Lifecycle-Events** (`types.ts`): `registered`/`progress`/`stopping`/`removed` tragen
`job: JobView` (Projektion nach dem Commit); `settled` trägt `job`, `cause: JobSettleCause` und
`awaited: boolean`; `output` trägt `{ id, owner?, total }` ohne Payload-Push.
`JobEvents.subscribe(filter, listener): () => void` mit `JobEventFilter = { owner: SessionId } |
{ owners: 'all' | 'scope' }`; Events werden synchron nach dem Commit verteilt, das erste Event eines
Jobs ist `registered`, `settled` folgt nach Freigabe aller Waiter, nach Service-Disposal läuft kein
Listener mehr; `awaited` markiert ein Settlement, das einen lebenden `wait` freigegeben hat (dieser
Aufrufer erhält den Endzustand selbst).
`JobRegistry` (`packages\jobs\jobs\src\index.ts`) ist abstrakt und deklariert `start`, `read`,
`readAt`, `list`, `wait`, `kill` sowie die Event-Subscription; `jobs-local` implementiert
`LocalJobRegistry` mit `TASK_WAIT_TIMEOUT = 'TASK_WAIT_TIMEOUT'`, `OutputRing` (`ring.ts`),
`startPump` (`pump.ts`), `JobLayer`/`JobEventHub` (`events.ts`) und der Config
`maxConcurrentJobsPerOwner` (Default `10`), `retainBytes` (Default `262144`), `settledRetainBytes`
(Default `16384`), `pumpPollMs` (Default `150`); `archive-admission.ts` meldet laufende Jobs als
Session-Aktivität (`{ kind: 'job', items: [{ id, label }] }`).
**Persistenz:** Das Job-Paket persistiert **nichts**. Durable ist die Session-Historie —
Completion-Notices werden als User-Message mit Source `{ kind: 'tool-jobs', form: 'notice', summary }`
geschrieben (`packages\jobs\tool-jobs\src\index.ts`); Job-Zustand und Output-Ring leben prozesslokal
im Registry, langlebige Bytes liegen in Spill-Dateien (`JobView.output.spillPaths`).
**Hintergrundausführung:** Der Producer besitzt die Ausführungsressourcen, das Registry Identität,
Lifecycle und Output-Ring; Owner-Disposal cancelt und wartet den Job ab, Service-Disposal terminiert
alle laufenden Jobs; ein Producer, dessen `run()` wirft, hinterlässt keinen Eintrag.

### 7.2 Die `jobs`-Tools (`packages\jobs\tool-jobs\src\index.ts`)

`inject = ['tools', 'jobs', 'systemPrompt']`; Config `waitTimeoutMs` (Default `30_000`),
`maxWaitTimeoutMs` (Default `600_000`), `completionDelivery: 'quiet' | 'wakeup'` (Default `'wakeup'`),
`maxConsecutiveWakes` (optional; ohne Angabe weckt jede idle-Completion ihren Owner).

| Tool | Parameter | Output | Concurrency |
| --- | --- | --- | --- |
| `job_output` | `job_id` (Pflicht), `wait` (Default false), `timeout_ms` (Default `waitTimeoutMs`, gekappt auf `maxWaitTimeoutMs`) | `{ text: string, job: PUBLIC_JOB_SCHEMA }` | nein (keine Deklaration) |
| `job_list` | keine | `PUBLIC_JOB_SCHEMA[]` | nein (keine Deklaration) |
| `job_kill` | `job_id` (Pflicht), `reason` (optional) | `{ outcome: 'cancellation-requested' \| 'already-finished', job }` | nein (keine Deklaration) |

`PUBLIC_JOB_SCHEMA` verlangt `id`, `kind`, `label`, `status` (Enum der fünf Status) und optional
`detail`. `job_output` besitzt seine Deadline selbst (kein `ToolDefinition.timeoutMs`), weil ein
Timeout Job-Zustand statt eines `TOOL_TIMEOUT`-Fehlers liefert. Bei `wakeup` und idle-Owner wird die
Notice per `owner.followup(...)` zugestellt, sonst per `owner.inject(...)`;
`maxConsecutiveWakes` begrenzt die self-exciting Kette.

---

## 8. MCP, LSP, Browser/Computer-Use, Web, Skill, Attachment, Office, Telemetrie

### 8.1 MCP

**`mcp-client`** (`packages\mcp\mcp-client\src\`): `name = 'mcp-client'`, `inject = ['tools']`,
`Config` als Union zweier Transporte. `StdioConfig`: `transport: 'stdio'`, `serverName` (Muster
`^[A-Za-z0-9_-]{1,32}$`), `command`, `args` (Default `[]`), `env` (Default `{}`), `cwd` (Default
`''`), `toolCallTimeoutMs` (Default `60_000`), `failOnStartupError` (Default `false`),
`maxInstructionBytes` (Default `32_768`), `reconnect?`. `StreamableHttpConfig`:
`transport: 'streamable-http'`, `serverName`, `url`, `headers` (Default `{}`), `toolCallTimeoutMs`,
`failOnStartupError`, `maxInstructionBytes`, `reconnect?`.
`RECONNECT_DEFAULTS = { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 10 }`
(`connection.ts`), `DEFAULT_MAX_INSTRUCTION_BYTES = 32_768`. Öffentliche Tool-Namen entstehen über
`publicToolName(serverName, rawName)` ⇒ `mcp__<serverName>__<rawName>` (`tools.ts`). Exporte:
`createMcpToolDefinition`, `McpResult`, `McpToolDefinitionOptions`, `startConnection`,
`resolveReconnectPolicy`, `registerServerContext`, `ServerContext`, `createTransport`. Externer
Prozess/Service: ein per `command` gestarteter Kindprozess (stdio) **oder** ein HTTP(S)-Endpunkt; der
Server-Name ist pro Registrierungs-Scope reserviert (agent-scoped Server dürfen einen Namespace in
einem anderen Agent wiederverwenden).
**`mcp-resources`**: `class McpResourceRuntime extends Service`, `static inject = ['tools']`,
`McpResourceProvider`, `McpResourceRequest`, `renderResourceResult`, `registerResourceTools`; genau
drei Tools, alle ohne Concurrency-Deklaration (⇒ exklusiv): `list_mcp_resources` (`server` Pflicht,
`cursor?` ⇒ `resources/list`), `list_mcp_resource_templates` (gleiche Parameter ⇒
`resources/templates/list`) und `read_mcp_resource` (`server`, `uri` Pflicht ⇒ `resources/read`).

### 8.2 LSP

**`lsp`** (`packages\lsp\lsp\src\index.ts`): `class Lsp extends Service implements LspService`
(`ctx.lsp`), `LspError extends HarnessError`, `finalExtension(filePath)`, `LspProviderId`;
`LspOperation = 'goToDefinition' | 'findReferences' | 'goToImplementation' | 'hover'`; weitere Typen
`LspPosition`, `LspRange`, `LspQueryRequest`, `LspProviderQuery`, `LspLocation`, `LspHover`,
`LspQueryResult`, `LspProvider`, `LspService`.
**`lsp-stdio`**: `name = 'lsp-stdio'`, `inject = ['fs', 'lsp', 'subprocess']`; `Config` mit
`LspLocalServerConfig`-Einträgen. Exporte: `abortError`, `throwIfAborted`, `abortable`,
`LspConnection`, `ConnectionSpec`, `ConnectionWriter`, `ConnectionSpawner`, `encodeMessage`,
`MessageDecoder`, `LspInstance`, `InstanceSpec`, `requestMethod`, `supportsOperation`,
`supportsTransientOpen`, `negotiatePositionEncoding` (liefert immer `'utf-16'`),
`normalizeLocations`, `normalizeHover`, `HostWorkspace`, `HostSource` sowie die Wire-Typen
(`WirePosition`, `WireRange`, `WireLocation`, `WireLocationLink`, `WireMarkupContent`, `WireHover`,
`WireServerCapabilities`, `WireInitializeResult`, …). Externer Prozess: ein Sprachserver über
`ctx.subprocess.spawn()`.
**`tool-lsp`**: `name = 'tool-lsp'`, `inject = ['tools', 'lsp', 'systemPrompt',
'workingDirectory']`, `DEFAULT_LSP_TOOL_TIMEOUT_MS = 60_000`, `DEFAULT_MAX_LOCATIONS = 100`,
`DEFAULT_MAX_RESULT_CHARS = 16_000`, `LSP_OPERATIONS`, `LSP_PROMPT_TEXT`; Config `maxLocations`,
`maxResultChars`, `timeoutMs` (max `MAX_TIMER_DELAY_MS`). Tool `lsp`: `operation` (Enum der vier
Werte), `file_path` (Pflicht, workspace-relativ oder absolut), `line` (1-basiert, Pflicht),
`character` (1-basiert, UTF-16-Spalte, Pflicht); Output ist eine Union aus `{ kind: 'locations',
locations[], resolvedWorkspaceUri }` und `{ kind: 'hover', hover | null, … }`; fehlt der
Owner-Workspace ⇒ `LspError('…', 'LSP_WORKSPACE_REQUIRED')`.

### 8.3 Browser-Use, Computer-Use, Web

Beide Use-Seams sind reine Registrierungen ohne `Config` und ohne eigene Tools:
`packages\browser-use\browser-use\src\index.ts` ⇒ `class BrowserUseRegistry extends Service`
(`ctx.browserUse`) mit `register(name: BrowserUseProviderName): () => Promise<void>`, das den
**einzigen** Provider-Slot reserviert (zweite Registrierung wirft, auch bei gleichem Namen);
`packages\computer-use\computer-use\src\index.ts` ⇒ `class ComputerUseRegistry extends Service`
(`ctx.computerUse`) mit identischer Semantik. Externe Runtimes stammen aus Provider-Paketen außerhalb
dieses Inventars, z. B. `packages\experimental\computer-use-cua-driver-native\src\index.ts`
(`computer-use-cua-driver-native-runtime`).
**`web`**: `class WebRuntime extends Service` (`ctx.web`), `WebRuntimeConfig`, `WebSearchRequest`,
`WebSearchResult`, `WebSearchSource`, `WebFetchRequest`, `WebFetchResult`, `WebFetchBody`,
`WebSearchProvider`, `WebFetchProvider`, `WebError extends HarnessError`.
**`tool-web`**: `name = 'tool-web'`, `inject = ['tools', 'web', 'systemPrompt']`,
`DEFAULT_WEB_TOOL_TIMEOUT_MS = 30_000`, `DEFAULT_FETCH_MAX_OUTPUT_CHARS = 200_000`,
`WEB_SEARCH_MAX_RESULTS = 8`, `WEB_SEARCH_MAX_QUERIES = 4`, `EXTERNAL_WEB_CONTENT_NOTICE`; Config
`search` (Default true), `fetch` (Default true), `searchMaxResults`, `searchMaxQueries`,
`fetchTimeoutMs`, `searchTimeoutMs`, `fetchMaxOutputChars`. Werkzeuge: `web_search` mit `queries`
(Array, 1–`maxQueries`, Pflicht) und `web_fetch` mit `url` (Pflicht) — beide
`isConcurrencySafe: () => true` (`search.ts:364`, `fetch.ts:498`) und beide hängen eine
System-Prompt-Sektion ein, die Web-Inhalte als nicht vertrauenswürdige Daten markiert.
**`web-fetch-http`**: `name = 'web-fetch-http'`, `inject = ['web']`, `LOCAL_FETCH_PROVIDER_ID =
'http'`, `DEFAULT_USER_AGENT = 'deepseek-harness/0.0.1 (+https://github.com/deepseek-ai)'`,
`WEB_FETCH_MAX_URL_LENGTH = 2048`, `HttpFetchProvider`, `HttpFetchLimits`, `HttpFetchResolver`,
`publicHttpNetwork`, `isPublicIpAddress`, `isNonPublicIpLiteral`, `createPinnedLookup`,
`parseFetchUrl`, `validateFetchUrl`, `isSameOrigin`, `classifyContentType` (`'html' | 'text'`),
`parseCharset`, `decoderForCharset`; kein externer Prozess, reiner HTTP(S)-Zugriff mit SSRF-Schutz
durch Adress-Pinning.
**Such-Provider** (jeweils `inject = ['web']`, eigener Settings-Namespace, Credential-Referenz in der
`Config`):

| Paket | Provider-Id | Base-URL-Default | Weitere Defaults |
| --- | --- | --- | --- |
| `web\web-search-deepseek` | `deepseek-official` | `https://api.deepseek.com/anthropic/v1` | Modell `deepseek-v4-flash`, API-Version `2023-06-01`, maxTokens `4096`, maxUses `5`; Namespace `web-search-deepseek` |
| `web\web-search-exa` | `exa` | `https://api.exa.ai` | `searchType = 'auto'`, `highlightsPerResult = 1` |
| `web\web-search-perplexity` | `perplexity` | `https://api.perplexity.ai` | Modell `sonar`, maxTokens `1024`, Recency `'day' \| 'week' \| 'month' \| 'year'` |

### 8.4 Skill, Attachment, Office, Telemetrie

**`skill`** (`packages\skill\skill\src\index.ts`): `class SkillRegistry extends Service`
(`ctx.skills`), `SkillProvider`, `SkillProviderControl`, `SkillProviderObservation`,
`SkillCatalogSnapshot`, `SkillSummary`, `SkillCandidate`, `SkillDefinition`, `SkillRegistration`,
`SkillInvocationPolicy`, `SkillResourceBase`, `SkillLookupOptions`, `SkillViewOptions`, `Config`;
`SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/`, `BUNDLED_SKILL_RANK = 600`; Funktionen `isSkillName`,
`isModelInvocable`, `isUserInvocable`, `renderSkillContent`, `escapeText`; `SkillSource =
'project-dsh' | 'project-agents' | 'runtime' | 'user-dsh' | 'user-agents' | 'custom' | 'bundled' |
(string & {})`. **`skill-filesystem`**: `name = 'skill-filesystem'`, `inject = ['skills']`,
`FileSystemSkillProvider`, Config u. a. `providerName` (Default `'filesystem'`).
**`skill-office`**: `name = 'skill-office'`, `inject = ['skills']`, eigenes `Config`-Schema.
**`tool-skill`**: `name = 'tool-skill'`, `inject = ['agents', 'tools', 'skills',
'workingDirectory']`, `DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH = 500`, Config
`{ catalogDescriptionMaxLength }` (Minimum 3); Tool `skill` mit Parameter `name` (Pflicht, exakter
Skill-Name aus dem Katalog) und Output `{ name, provider, resourceBase: { kind: 'directory'; path } |
{ kind: 'url'; url } | { kind: 'opaque'; description }, content }`; der Katalog wird als durable
Session-Message mit Source `{ kind: 'skill-catalog', form: 'catalog', entries[] }` geschrieben und
erscheint nur, wenn der aufrufende Agent genau diese Tool-Registrierung auflöst.
**`tool-workspace-dependencies`**: `name = 'tool-workspace-dependencies'`, `inject = ['tools']`,
Config `{ source: string (Pflicht, Payload-Verzeichnis mit runtime.json und dependencies/); root?:
string }`; Tool `load_workspace_dependencies` ohne Parameter; ohne `root` wird die Payload in-place
genutzt, mit `root` beim ersten Aufruf dorthin kopiert; zusätzlich `PrimaryRuntimeManifest`,
`WorkspaceDependencies`, `parsePrimaryRuntime`, `workspaceDependencyPaths`.
**`attachment`**: `AttachmentStore` (Default-Export), `AttachmentId`/`ImageVariantId`,
`AttachmentError`, `AttachmentErrorCode`, `ImageAdmissionErrorCode`, `isAttachmentError`,
`isImageAdmissionError`, `requestImageDimensions`, `longEdgeDimensions`, `ProjectedDimensions` sowie
`ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'`, `ImageAttachmentRef`,
`FileAttachmentRef`, `EncodedFileAttachment`, `SaveFileAttachment`, `SaveFileStreamAttachment`,
`ImageAttachmentLimits`, `EncodedImageAttachment`, `PromptContentPart`, `AttachmentAdmissionPart`,
`AdmittedPromptContentPart`, `SaveImageAttachment`, `StoredImageAttachment`, `ImageRequestTarget`,
`RequestImageAttachment`.
**`attachment-local`**: `LocalAttachmentStore`, Config mit `dshHome?` und den Limits (§10.1);
zusätzlich `CompressionLimiter`, `compressionFailure`, `IMAGE_ENCODING_QUALITIES = [85, 75, 60]`,
`WEBP_ENCODING_EFFORT = 0`, `encodingLadder`, `isExhaustedEncoding`,
`REQUEST_IMAGE_TRANSFORM_VERSION = 'request-image-v6'`, `requestImageVariantId`, `requireSharp`
(native `sharp`-Dependency, lazy), Dateiablage über `storedFilePath`/`fileLeafName`
(Windows-Gerätenamen `con|prn|aux|nul|com1-9|lpt1-9` werden behandelt),
`canPassThroughNormalization`/`NormalizationPolicy`.
**`office-to-pdf`** (`packages\document\office-to-pdf\src\`, einziges Paket im Verzeichnis):
`class OfficeToPdf extends TypertRemoteService` (`ctx.officeToPdf`), `OfficeToPdfError`,
`ConversionQueue`, `OfficeSourceKey`, `OfficeToPdfGeneration`, `OfficeToPdfKey`,
`OfficeExtension = 'doc' | 'docx' | 'xls' | 'xlsx' | 'ppt' | 'pptx'`, `OfficeToPdfPriority =
'foreground' | 'background'`, `OfficeToPdfRequest`, `OfficeToPdfResult`, `OfficeToPdfErrorCode`,
`RenderedDocumentBytes`; öffentlich `convert(request, signal?)` und die workspace-autorisierte
Datei-Variante, aber **kein** model-sichtbares Tool; `generation` ist eine UUID und ändert sich bei
jeder Konfigurationsablösung. Externer Prozess: ein LibreOffice-Konverter (Slot-basiert;
„LibreOffice converter disposal failed.“ als Aggregatfehler).
**`otel`** (`packages\telemetry\otel\src\`, einziges Paket im Verzeichnis):
`export default class OTel extends Service` (`ctx.otel`) mit
`createEventReporter(options: EventLogOptions) => EventLogReporter` (Count-Batching) und
`createSessionLogReporter(options: SessionLogOptions) => SessionLogReporter` (byte-begrenzt).
`SessionLogOptions = { exporter: LogExporterOptions; processor?: SessionLogProcessorOptions;
maxRequestBytes?; scope: { name; version? }; resourceAttributes; onFailure }`;
`SESSION_LOG_MAX_REQUEST_BYTES = 4_000_000` (darf nur gesenkt werden); Processor-Defaults
`maxQueueSize 2048`, `maxExportBatchSize 512` (darf `maxQueueSize` nicht überschreiten, Werte
zwischen 1 und `2_147_483_647`); zu große Einzelrecords werden **nicht** gekürzt, sondern abgelehnt;
Transport über `createLogExporter`, `createLogExporterMetrics`, `logTransportOptions`; Exporte
`EventLogReporter`, `EventLogOptions`, `OTelEventRecord`, `OTelEventScalar`, `SessionLogReporter`,
`SessionLogRecord`, `SessionLogOptions`, `SessionLogProcessorOptions`, `LogExporterOptions`; kein
lokaler Prozess, aber ein OTLP-Collector-Endpunkt als externer Service.

---

## 9. Vollständige Tool-Tabelle

Konvention: `isConcurrencySafe` ist die Deklaration des Tools; **fehlt sie, ist der Aufruf exklusiv**
(`packages\core\tools\src\index.ts`: `if (!tool?.isConcurrencySafe) return { kind: 'exclusive' }`).

| Tool-Name | Paket | Zweck | Concurrency-safe |
| --- | --- | --- | --- |
| `read` | `fs\tool-fs` | Datei zeilenweise lesen (`file_path`, `offset`, `limit`) | **ja** (`read.ts:136`) |
| `read_image` | `fs\tool-fs` | Bilddatei als Attachment lesen; nur bei gemountetem `attachments` | **ja** (`read-image.ts:239`) |
| `write` | `fs\tool-fs` | Datei vollständig schreiben (`file_path`, `content`) | nein |
| `edit` | `fs\tool-fs` | Literalen Text ersetzen (`old_string`, `new_string`, `replace_all`) | nein |
| `glob` | `fs\tool-fs-search` | Dateien per Glob-Muster finden (ripgrep) | nein |
| `grep` | `fs\tool-fs-search` | Dateiinhalte per ripgrep-Regex durchsuchen | nein |
| `str_replace_editor` | `fs\tool-str-replace-editor` | Editor mit `view`/`create`/`str_replace`/`insert` | nein |
| `bash` | `shell\tool-bash` | Bash-Befehl ausführen, optional als Hintergrund-Job, mit Sandbox-Eskalation | nein |
| `bash` | `shell\tool-bash-persistent` | Befehl in einer persistenten Bash-Shell (Zustand bleibt erhalten) | nein (pro Owner serialisiert) |
| `pwsh` | `shell\tool-pwsh` | PowerShell-Befehl ausführen, optional als Hintergrund-Job, mit Sandbox-Eskalation | nein |
| `pwsh` | `shell\tool-pwsh-persistent` | Befehl in einer persistenten PowerShell (Zustand bleibt erhalten) | nein (pro Owner serialisiert) |
| `job_output` | `jobs\tool-jobs` | Job-Ausgabe bzw. Ergebnis eines beendeten Jobs lesen, optional mit Warten | nein |
| `job_list` | `jobs\tool-jobs` | Eigene Hintergrund-Jobs mit Ids, Kinds und Status auflisten | nein |
| `job_kill` | `jobs\tool-jobs` | Abbruch eines laufenden Hintergrund-Jobs anfordern | nein |
| `list_mcp_resources` | `mcp\mcp-resources` | Ressourcen eines MCP-Servers auflisten | nein |
| `list_mcp_resource_templates` | `mcp\mcp-resources` | Parametrisierte Ressourcen-URI-Templates auflisten | nein |
| `read_mcp_resource` | `mcp\mcp-resources` | MCP-Ressource per URI lesen | nein |
| `lsp` | `lsp\tool-lsp` | LSP-Abfrage: `goToDefinition`, `findReferences`, `goToImplementation`, `hover` | nein |
| `web_search` | `web\tool-web` | Web-Suche mit 1–4 Anfragen, liefert Quellen | **ja** (`search.ts:364`) |
| `web_fetch` | `web\tool-web` | Eine HTTP(S)-URL abrufen und zu Text dekodieren | **ja** (`fetch.ts:498`) |
| `skill` | `skill\tool-skill` | Vollständige Anweisungen eines Skills laden | nein |
| `load_workspace_dependencies` | `skill\tool-workspace-dependencies` | Workspace-Payload-Abhängigkeiten bereitstellen | nein |

Einziger dynamisch erzeugter Tool-Name dieser Paketgruppe: `mcp__<serverName>__<rawName>` pro
MCP-Tool (`packages\mcp\mcp-client\src\tools.ts`); seine Concurrency folgt der MCP-Definition.
`browser-use`, `computer-use`, `document\office-to-pdf`, `telemetry\otel`, `llm\*` und `sandbox\*`
registrieren selbst **keine** Tools.

---

## 10. Hard Facts

### 10.1 Default-Konstanten

*LLM-Retry* (`packages\llm\llm\src\retry-policy.ts`): `maxRetries 5`, `initialDelayMs 500`,
`maxDelayMs 10_000`, `jitterRatio 0.1`, Codes `EMPTY_RESPONSE, RATE_LIMIT, SERVER, TIMEOUT,
TRANSPORT`; Ausführungsexponent gekappt bei `1024`, Projektion `llmRetry` / `stateVersion: 1`
(`packages\llm\llm-retry\src\index.ts`). *Token-Meter*
(`packages\llm\token-meter\src\estimate.ts`): `CHARS_PER_TOKEN 4`, `BLOCK_OVERHEAD 4`,
`ROLE_OVERHEAD 4`.
*DeepSeek* (`packages\llm\llm-deepseek\src\defaults.ts`): `DEFAULT_STREAM_IDLE_TIMEOUT_MS 300_000`,
`DEFAULT_CONTEXT_WINDOW 1_000_000`, `DEFAULT_MAX_TOKENS 256_000`,
`DEFAULT_MAX_INLINE_REQUEST_IMAGE_BYTES 20 MiB`, `DEFAULT_IMAGE_OFFLOAD_BYTE_QUANTUM 64 MiB`,
`DEFAULT_INLINE_IMAGE_OFFLOAD_BYTE_QUANTUM 10 MiB`, `DEFAULT_IMAGE_OFFLOAD_COUNT_QUANTUM 20`,
`DEFAULT_FILE_EXPIRY_SECONDS 604800`, `DEFAULT_FILE_REFRESH_MARGIN_SECONDS 3600`,
`DEFAULT_FILE_QUOTA_CLEANUP_BATCH 100`, `DEFAULT_FILES_API_TIMEOUT_MS 60_000`;
`request-pricing.ts`: `DEFAULT_MAX_REQUEST_FILES_BYTES 128 MiB`, `DEFAULT_MAX_IMAGES_PER_REQUEST 600`,
`DEFAULT_LOW_DETAIL_IMAGE_PIXEL_BUDGET 512*512`, `DEFAULT_REQUEST_IMAGE_MAX_BYTES 2 MiB`,
`REQUEST_IMAGE_MAX_DIMENSION 4096`; `files-api.ts`: `MIN_FILE_EXPIRY_SECONDS 3600`,
`MAX_FILE_EXPIRY_SECONDS 2_592_000`, `MAX_FILE_UPLOAD_BYTES 128 MiB`, `MAX_STORED_FILE_COUNT 10_000`,
`MAX_STORED_FILE_BYTES 25 GiB`; `file-store.ts`: `MAX_IMAGE_BYTES 32 MiB`.
*pi-ai* (`packages\llm\llm-pi-ai\src\config.ts`): `DEFAULT_STREAM_IDLE_TIMEOUT_MS 300_000`,
`DEFAULT_MAX_REQUEST_IMAGE_BYTES 20 MiB`, `DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET 2048*2048`,
`DEFAULT_REQUEST_IMAGE_MAX_BYTES 1 MiB`, `DEFAULT_CONTEXT_WINDOW 262_144`,
`DEFAULT_MAX_TOKENS 32_768`, `DEFAULT_INPUT ['text']`; `discovery.ts`: `MAX_RESPONSE_BYTES 4 MiB`.
*Sandbox*: `probeTimeoutMs 5_000` (`sandbox-local`); Landlock-Runner-Failure-Exit `125`,
Windows-ACL-Runner-Failure-Exit `127`; Grant-Maske
`(FILE_GENERIC_WRITE | DELETE | FILE_DELETE_CHILD) & ~STANDARD_RIGHTS_WRITE`.
*Subprozess*: `SUBPROCESS_CONTROL_FD 7`; `SENSITIVE_ENV_PATTERN /KEY|PASSWORD|SECRET|TOKEN/i`;
`SYSTEMCTL_TIMEOUT_MS 5_000`, `SCOPE_INITIAL_POLL_INTERVAL_MS 50`; Windows
`taskkill /PID <pid> /T /F`; `INFINITE 0xFFFFFFFF`, `WAIT_TIMEOUT 258`, `STARTUPINFOW_SIZE 104`,
`PROCESS_INFORMATION_SIZE 24`, `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE 0x2000`; `graceMs` ist **kein**
Seam-Default, sondern pro Spawn vorgeschrieben und auf `MAX_TIMER_DELAY_MS` begrenzt.
*Shell*: `bash-local`/`pwsh-local` `timeoutMs 120_000`, `maxTimeoutMs 600_000`,
`maxOutputBytes 64_000`, `maxSpillBytes 64 MiB`, `graceMs 3_000`; Overrides `NO_COLOR=1, TERM=dumb,
PAGER=cat, GIT_PAGER=cat`; `tool-bash`/`tool-pwsh` `enableRunInBackground true`,
`promoteOnTimeout true`; persistente Varianten `timeoutMs 300_000`, `maxOutputChars 16_000`.
*Terminal*: `rows 40`, `cols 160`, `scrollbackLines 10_000`, `scrollbackMaxBytes 4 MiB`,
`maxReadBytes 256 KiB`, `pollIntervalMs 50`, `exactProbeAfterMs 150`, `idleSilenceMs 3_000`,
`handoffGraceMs 500`, `promptTailGraceMs 0`, `timeoutMs 30_000`, `disposeGraceMs 3_000`;
`PROMPT_MARKER_PREFIX '133;D;'`, `CONTROLLED_PROMPT 'dsh> '`.
*Dateisystem*: `READ_LIMIT 2000`, `READ_MAX_LINE_LENGTH 2000`, `READ_MAX_BYTES 50 KiB`,
`STREAM_MIN_SIZE 10 MiB`, `GLOB_MAX_RESULTS 100`, `GREP_MAX_MATCHES 250`, `GREP_MAX_LINE_BYTES 2000`,
`RAW_OUTPUT_MAX_BYTES 20_000_000`, `SEARCH_TIMEOUT_MS 30_000`, `SEARCH_STDERR_MAX_BYTES 64 KiB`,
`SEARCH_GRACE_MS 3_000`, `SEARCH_META_MAX_BYTES 65_536`, `DEFAULT_DIFF_BASIS_MAX_BYTES 10 MiB`.
*Jobs*: `maxConcurrentJobsPerOwner 10`, `retainBytes 262144`, `settledRetainBytes 16384`,
`pumpPollMs 150`, `waitTimeoutMs 30_000`, `maxWaitTimeoutMs 600_000`, `completionDelivery 'wakeup'`.
*MCP*: `toolCallTimeoutMs 60_000`, `maxInstructionBytes 32_768`, Reconnect `{ enabled: true,
initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 10 }`, `serverName`-Muster
`^[A-Za-z0-9_-]{1,32}$`. *LSP*: `DEFAULT_LSP_TOOL_TIMEOUT_MS 60_000`,
`DEFAULT_MAX_LOCATIONS 100`, `DEFAULT_MAX_RESULT_CHARS 16_000`. *Web*:
`DEFAULT_WEB_TOOL_TIMEOUT_MS 30_000`, `DEFAULT_FETCH_MAX_OUTPUT_CHARS 200_000`,
`WEB_SEARCH_MAX_RESULTS 8`, `WEB_SEARCH_MAX_QUERIES 4`, `WEB_FETCH_MAX_URL_LENGTH 2048`.
*Skill*: `BUNDLED_SKILL_RANK 600`, `DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH 500`, Muster
`^[a-z0-9]+(?:-[a-z0-9]+)*$`. *Attachment*: `DEFAULT_MAX_IMAGE_BYTES 20 MiB`,
`DEFAULT_MAX_IMAGES_PER_MESSAGE 20`, `DEFAULT_MAX_MESSAGE_IMAGE_BYTES 200 MiB`,
`DEFAULT_MAX_IMAGE_PIXELS 64_000_000`, `DEFAULT_MAX_IMAGE_DIMENSION 8192`,
`DEFAULT_NORMALIZED_IMAGE_MAX_PIXELS 2048*2048`, `DEFAULT_NORMALIZED_IMAGE_MAX_BYTES 4 MiB`,
`DEFAULT_IMAGE_COMPRESSION_CONCURRENCY 2` (max `8`), `IMAGE_ENCODING_QUALITIES [85, 75, 60]`,
`WEBP_ENCODING_EFFORT 0`. *Office* (`packages\document\office-to-pdf\src\index.ts`):
`maxConcurrentConversions 2`, `maxQueuedJobs 8`, `maxReaders 32`, `maxSourceBytes 104857600`,
`maxBackgroundConversions 1`, `maxCachedEntries 8`, `maxCachedBytes 134217728`, `maxSourceEntries 64`,
`timeoutMs 60_000`, `maxInputBytes 50 MiB`, `maxOutputBytes 100 MiB`, `maxImageResolution 192`,
`maxArchiveEntries 10_000`, `maxUncompressedBytes 250 MiB`, `maxFontFiles 20_000`,
`maxFontFileBytes 256 MiB`, `maxLoadedFontBytes 512 MiB` (`fontDirectories`/`fontFallbacks` ohne
Default; `fontDirectories` absolut; `maxSourceBytes >= maxInputBytes`).
*Telemetrie*: `SESSION_LOG_MAX_REQUEST_BYTES 4_000_000`, `maxQueueSize 2048`,
`maxExportBatchSize 512`. *SSH*: `requestTimeoutMs 30_000`, `maxFrameBytes 64 MiB`,
`maxPending 128`, `leaseMs 30_000`, `SSH_PROTOCOL_VERSION 2`, `SSH_MAX_PROCESS_HANDLES 128`,
`SSH_MAX_TEXT_STREAMS 128`.

### 10.2 Externe Konfiguration: Env-Variablen und Dateipfade

| Name | Typ | Fundstelle |
| --- | --- | --- |
| `DEEPSEEK_BASE_URL` | Env (nur vertrauenswürdige Schichten) | `packages\llm\llm-deepseek\src\config.ts` (`BASE_URL_ENV`) |
| `DEEPSEEK_API_KEY` | Credential-Referenz (Default) | `packages\llm\llm-deepseek-api-key\src\config.ts` |
| `DSH_HOME` | Env / Config | `packages\shell\shell-env\src\index.ts`, `packages\attachment\attachment-local\src\index.ts` (Fallback `~/.dsh`) |
| `DSH_SUBPROCESS_RUNNER` | Env | `packages\subprocess\subprocess-local\src\runner-launch.ts`; konsumiert in `packages\ssh\ssh-helper-runtime\src\index.ts` |
| `DSH_PTC_RUNTIME_NODE` | Env | `packages\ssh\ssh-helper-runtime\src\index.ts` |
| `DSH_SUBPROCESS_CONTROL` | Env | `packages\subprocess\subprocess\src\control.ts` |
| `ComSpec`, `SHELL` | Env | `packages\subprocess\subprocess-local\src\index.ts` (`defaultShell`) |
| `<apiKeyEnv>` pro pi-ai-Route | Env | `packages\llm\llm-pi-ai\src\config.ts` |
| `<credentialRef>` je Such-Provider | Env / Credentials-Store | `packages\web\web-search-*\src\config.ts` |
| `<execPath>\native\system\package.json` | Datei | `packages\ssh\ssh-helper-runtime\src\index.ts` |
| `<source>\runtime.json` + `dependencies/` | Datei | `packages\skill\tool-workspace-dependencies\src\index.ts` |
| `~/.dsh` (Harness-Home) | Verzeichnis | `resolveDshHome` aus `@deepseek-ai/dsh-home-paths`, genutzt in `shell-env` und `attachment-local` |
| Settings-Namespace `web-search-deepseek` | Settings | `packages\web\web-search-deepseek\src\index.ts` |
| Credentials-Record-Scope `llm-pi-ai` | Credentials-Store | `packages\llm\llm-pi-ai\src\auth.ts` (`RECORD_SCOPE`) |

### 10.3 Gotchas

1. **`sandbox-windows-acl` ist `partial`** — Hardlink-Aliasing, unconfinerte Reads und
   AppContainer-ACL'te Bäume sind explizit dokumentierte Grenzen
   (`packages\sandbox\sandbox-local\src\index.ts`).
2. **Workspace-ACEs bleiben stehen, Temp-ACEs werden widerrufen**; ein uncleaner Shutdown
   hinterlässt Workspace-ACEs für den nächsten exakten-ACE-Skip.
3. **`probeTimeoutMs: 0` bedeutet in Node „unbegrenzt“** — daher die Positiv-Finit-Prüfung.
4. **`fs-local` `cwd` ist keine Containment-Grenze**; nur `fs-sandbox` prüft Containment, und auch
   das ist nicht TOCTOU-fest (`packages\fs\fs-local\src\index.ts`, `packages\fs\fs-sandbox\src\index.ts`).
5. **`fs-observation-policy` ist ein separates Plugin.** Ohne es schreiben `write`/`edit` unbedingt;
   mit ihm wirft `edit` ohne vorheriges Lesen `FS_NOT_OBSERVED`.
6. **Der Subprozess-Seam hat keine Defaults** — fehlende `cwd`, `stdio` oder `graceMs` sind
   Caller-Fehler; `graceMs` wird validiert.
7. **Der Credential-Scrub ist case-insensitive** und entfernt alle `DSH_*`; explizite `env`-Einträge
   überleben, weil sie danach mergen (`packages\subprocess\subprocess\src\index.ts`).
8. **`llm-retry` hat selbst kein Konfigurationsfeld** — eine dort gesetzte `retryPolicy` wird
   abgelehnt (`packages\llm\llm-retry\src\index.ts`).
9. **`TokenUsage`-Zähler sind disjunkt** — DeepSeek-`prompt_tokens` wird zerlegt, sonst würde doppelt
   gezählt (`packages\llm\llm\src\types.ts`).
10. **`reasoningTokens` fließen nicht in `usageTokens()` ein** (`packages\llm\token-meter\src\index.ts`).
11. **Ein `PreparedLlmCall` darf nur einmal dispatcht werden** und die Konfiguration darf sich nicht
    ändern: sonst `INVALID_PREPARED_CALL` (`packages\llm\llm\src\index.ts`).
12. **Loop-gebaute Requests sind tief eingefroren**; `llm/stream`-Listener dürfen sie nur lesen.
13. **`llm-deepseek` lehnt ein `protocol`-Feld ab** und verlangt eine credential-, query- und
    fragmentfreie HTTP(S)-BaseURL; `imageDetail` ist entfernt (→ `imagePixelBudget`).
14. **`llm-pi-ai` akzeptiert `providers` nur als Dict** und weist `maxRetries`/`maxRetryDelayMs` mit
    Verweis auf `dsh-llm-retry` zurück (`packages\llm\llm-pi-ai\src\config.ts`).
15. **MCP-`serverName` ist auf 32 Zeichen begrenzt** und pro Registrierungs-Scope eindeutig
    (`packages\mcp\mcp-client\src\index.ts`).
16. **`tool-fs-search` nutzt nicht den Shell-Seam** — Hintergrundausführung ist dort
    architektonisch ausgeschlossen (`packages\fs\tool-fs-search\src\index.ts`).
17. **Die persistenten Shell-Tools nutzen `ctx.terminals`, nicht `ctx.shell`** — kein `workdir`,
    dafür Serialisierung pro Owner (`packages\shell\tool-bash-persistent\src\index.ts`).
18. **`job_output` besitzt seine Deadline selbst** und nutzt bewusst kein
    `ToolDefinition.timeoutMs` (`packages\jobs\tool-jobs\src\index.ts`).
19. **Windows-ACL-argv ändert sich mit der Session**: agentlose `workspace-write`-Aufrufe bekommen
    kein SID-Flag und der Runner erzeugt sein privates Temp selbst; mit Session kommen beide SIDs.
20. **`enforcement` und `denialSignatures` erzwingen nichts** — Denial-Erkennung ist
    stderr-Text-Matching und wird erst nach Ausschluss eines Runner-Fehlers angewendet.

---

## 11. Abdeckung und offene Punkte

| Gruppe | Pakete | Status |
| --- | --- | --- |
| `llm` | `llm`, `llm-deepseek`, `llm-pi-ai`, `llm-retry`, `llm-deepseek-account`, `llm-deepseek-api-key`, `deepseek-llm-api-extensions`, `token-meter`, `plugin-package-inventory-deepseek` | vollständig |
| `sandbox` | `sandbox`, `sandbox-local`, `sandbox-policy`, `sandbox-windows-acl` | vollständig |
| `subprocess` | `subprocess`, `subprocess-local`, `win32-process` | vollständig |
| `shell` | `shell`, `shell-env`, `bash-local`, `bash-sandbox`, `pwsh-local`, `pwsh-sandbox`, `tool-bash`, `tool-bash-persistent`, `tool-pwsh`, `tool-pwsh-persistent` | vollständig |
| `terminal` | `terminal`, `terminal-bash` | vollständig |
| `fs` | `fs`, `fs-local`, `fs-sandbox`, `fs-observation-policy`, `tool-fs`, `tool-fs-search`, `tool-str-replace-editor` | vollständig |
| `ssh` | `ssh`, `fs-ssh`, `sandbox-ssh`, `subprocess-ssh`, `ssh-helper-runtime` | vollständig |
| `jobs` | `jobs`, `jobs-local`, `tool-jobs` | vollständig |
| `mcp` | `mcp-client`, `mcp-resources` | vollständig |
| `lsp` | `lsp`, `lsp-stdio`, `tool-lsp` | vollständig |
| Browser/Computer-Use | `browser-use`, `computer-use` | vollständig |
| `web` | `web`, `tool-web`, `web-fetch-http`, `web-search-deepseek`, `web-search-exa`, `web-search-perplexity` | vollständig |
| `skill` | `skill`, `skill-filesystem`, `skill-office`, `tool-skill`, `tool-workspace-dependencies` | vollständig |
| `document` | `office-to-pdf` (einziges Paket im Verzeichnis) | vollständig |
| `attachment` | `attachment`, `attachment-local` | vollständig |
| `telemetry` | `otel` (einziges Paket im Verzeichnis) | vollständig |

**Nicht ermittelbar / bewusst offen gelassen:** (a) die Interna von
`@deepseek-ai/node-addon-system/landlock-run` (Binär-Addon außerhalb des Repos) — belegt sind nur die
konsumierten Exporte `LAUNCHER_BIN`, `LAUNCHER_FAILURE_EXIT`, `launcherPath`, `probe`, `grantArgs`;
(b) die Feldliste der `DeepSeekLlmApiExtensionMap`-Beiträge außerhalb von
`plugin-package-inventory-deepseek`, weil die Tabelle absichtlich leer und merge-extensibel ist;
(c) die Anzahl der von `mcp-client` dynamisch erzeugten `mcp__*`-Tools (konfigurationsabhängig);
(d) der numerische Wert von `MAX_TIMER_DELAY_MS` (`@deepseek-ai/dsh-timeout`, außerhalb des
Auftrags) — hier nur als Obergrenze referenziert; (e) die Methodenrümpfe des abstrakten
`JobRegistry` (`packages\jobs\jobs\src\index.ts`) — aus Signaturen, Typen und der
`jobs-local`-Implementierung abgeleitet, nicht aus einer vollständigen Zeileninventur.
