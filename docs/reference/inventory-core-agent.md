# Inventar: Agent-Core der DeepSeek-Harness-Vorlage

## 1. Kopf

**Was diese Datei ist.** Vollständige, faktische Referenz-Inventur des **Agent-Core** der Vorlage `C:\Users\Chang\harness\prometheus-harness` (DeepSeek Harness, TypeScript-Monorepo) für die Backend-Portierung in das Zielprojekt `C:\Users\Chang\prometheus-harness`. Sie beschreibt je Paket Zweck, `inject`-Liste, `Config`-Schema, exportierte Serviceklassen, exportierte Typen, angehängte Session-Events, emittierte/konsumierte Cordis-Events und interne Abhängigkeiten; zusätzlich den Agent-Loop im Detail, die Tool-Execution-Pipeline, alle registrierten Tool-Namen, alle referenzierten Session-Event-Typen, alle Projektions-Keys mit `stateVersion` sowie eine Liste harter Fakten.

**Quelle.** Ausschließlich lesende Analyse von `C:\Users\Chang\harness\prometheus-harness\packages\...`. Autoritativ sind die TypeScript-Quellen unter `src/`; `lib/types/*.d.ts` wurde nur zur Bestätigung exportierter Signaturen herangezogen. Alle Quellpfade in dieser Datei sind relativ zum Vorlagen-Repo (z. B. `packages/core/agent/src/types.ts`).

**Version.** Alle hier behandelten Pakete tragen `"version": "0.2.1-alpha.2"` (jeweilige `packages/<gruppe>/<paket>/package.json`).

**Datum der Erhebung.** 12.10.2026.

**Status.** Diese Datei ist **reine Analyse und read-only**. Sie ist kein Build-Artefakt, verändert die Vorlage nicht und darf nicht als Laufzeit-Konfiguration interpretiert werden. Es wurden keine Dateien in der Vorlage erstellt, geändert oder gelöscht.

**Abdeckung.** 45 Pakete: `core/agent`, `core/agent-loop`, `core/agent-default-model`, `core/agent-tool-presentation`, `core/scope`, `core/session`, `core/system-prompt`, `core/tools`, `guard/*` (2), `goal/*` (4), `plan/plan-mode`, `todo/tool-todo`, `interaction/*` (5), `workflow/*` (3), `subagent/*` (9), `compaction/*` (5), `preset/*` (3), `schedule/*` (2), `feedback/*` (2).

**Nicht geöffnet (Auflage).** `C:\Users\Chang\prometheus-harness\docs\dsh` und `C:\Users\Chang\prometheus-harness\docs\design` wurden nicht gelesen.

---

## 2. Pakete im Einzelnen

### 2.1 `packages/core/agent`

- **npm-Paket:** `@deepseek-ai/dsh-agent` (`packages/core/agent/package.json`)
- **Zweck:** Agent-Schnittstelle, Live-Registry und prozesslokaler Initiator-Scope. Konkrete Erzeugung und Steuerung eines Agents gehören nicht hierher, sondern in den Loop (`dsh-agent-loop`).
- **`inject`:** kein Top-Level-`inject` und kein `static inject`. Der Service wird über Modul-Augmentation bereitgestellt: `declare module '@deepseek-ai/cordis' { interface Context { agents: AgentRegistry } }` (`packages/core/agent/src/index.ts`). Zusätzlich dynamisch `ctx.inject(['typert'], …)` (`src/index.ts` Zeile 257).
- **`Config`:** nicht vorhanden (kein `Config` in `src/*.ts`).
- **Exportierte Serviceklasse:** `AgentRegistry extends Service`, registriert als `ctx.agents` (`super(ctx, 'agents')`, `src/index.ts` Zeile 256).

  | Methode (einzeilig) | Datei |
  |---|---|
  | `currentInitiator(): Agent \| undefined` | `src/index.ts` |
  | `requireInitiator(): Agent` (wirft `no initiating agent is active`) | `src/index.ts` |
  | `withInitiator<T>(agent: Agent, operation: () => T): T` | `src/index.ts` |
  | `withoutInitiator<T>(operation: () => T): T` | `src/index.ts` |
  | `setFactory(factory: AgentFactory): () => void` | `src/index.ts` |
  | `create(options: CreateAgentOptions): Promise<AgentHandle>` | `src/index.ts` |
  | `resume(options: ResumeAgentOptions): Promise<AgentHandle>` | `src/index.ts` |
  | `register(agent: Agent): ReturnType<Context['effect']>` | `src/index.ts` |
  | `enter(agent: Agent, owner: Agent \| undefined): () => void` | `src/index.ts` |
  | `announce(agent: Agent, source: SessionStartSource, signal?: AbortSignal): Promise<void>` | `src/index.ts` |
  | `get(id: SessionId): Agent \| undefined` | `src/index.ts` |
  | `isOwnedBy(id: SessionId, owner: Agent): boolean` | `src/index.ts` |
  | `list(): Agent[]` | `src/index.ts` |
  | `roots(): Agent[]` | `src/index.ts` |

  Privat: `requireFactory`, `detachEntered`, `emitDisposed`, `closeInitiators`, `disposeInitiators`, `runWithInitiator`, `hasLifecycleAncestor`, `assertInitiatorsReadable`, `releaseReentrantInitiatorRuns`, `releaseInitiatorRun`.
- **Exportierte Typen/Schnittstellen (Auswahl, reimplementierungsrelevant):** `Agent` (nur `readonly id: SessionId`, live erweitert um `options`, `session`, `inbox`, `status`, `ctx`, `cancel`, `whenIdle`, `runMaintenance`, `send`, `followup`, `steer`, `inject`; `src/runtime-types.ts`), `AgentOptions` (`provider?`, `model?`, `reasoningEffort?`, `maxTokens?`), `CancelOptions` (`keepInbox?`), `Inbox` (Contract), `InboxTarget = 'next-turn' | 'next-step'`, `InboxState`, `InboxWireState`, `TurnBoundaryProjection`, `AgentStatus = 'idle' | 'running'`, `PreStepDecision = { kind: 'reject' } | { kind: 'enter'; messages; startsRequestSeries? }`, `RequestErrorAction = { kind: 'retry' } | undefined`, `SessionStartSource = 'startup' | 'resume' | 'clear' | 'compact'`, `AssistantStreamFrame`, `AgentCancelCause` (re-exportiert aus `dsh-session`), `CreateAgentOptions`, `ResumeAgentOptions`, `AgentHandle`, `AgentFactory`, `AgentSetup`, `AgentSetupCommit`, `ConsumedWork` + `foldConsumedWork(events): ConsumedWork`, `ModelSelection`, `ModelSelectionRef`, `installModelSelection(agentCtx, selection): () => void`, `agentCarrier(agent)`, `agentEvents(ctx, agent, carrier?)`, `emitAgentEvent(ctx, agent, name, payload)`, `assembleContextFor(agent, signal?)`, Typen `AgentEventDispatch`, `AgentSubjectEvent`.
- **Angehängte Session-Events:** keine eigenen Appends. Deklariert `agent/inbox/spliced` (`src/types.ts` Zeile 96) — geschrieben wird es vom Inbox-Implementierer im Loop.
- **Cordis-Events (deklariert in `src/runtime-types.ts`, Zeilen 245–394):**

  | Event | Modus |
  |---|---|
  | `agent/created` | serial (`this: Scoped<Agent>`, Payload `{ agent, source, signal? }`) |
  | `agent/disposed` | emit |
  | `agent/status` | emit (Payload `{ agent, status }`) |
  | `agent/inbox/inserted` | emit |
  | `agent/inbox/claimed` | emit (Payload `{ agent, message, turn }`) |
  | `agent/inbox/discarded` | emit |
  | `agent/pre-step` | waterfall (`next: () => Promise<PreStepDecision>`) |
  | `agent/request` | waterfall (`next: () => Promise<LlmCallConfig>`) |
  | `agent/request-error` | waterfall (`next: () => Promise<RequestErrorAction>`) |
  | `agent/assistant-stream` | emit |
  | `agent/turn-stopping` | serial |
  | `agent/error` | emit (Payload `{ agent, turn, step, error }`) |

  Zusätzlich konsumiert der Konstruktor `internal/status` (`src/index.ts` Zeile 271) sowie `workspace/session-activity` / `workspace/session-stop` über `installTurnArchiveAdmission` (`src/archive-admission.ts`).
- **Interne Abhängigkeiten:** peerDependencies `@deepseek-ai/dsh-llm`, `dsh-scope`, `dsh-session`, `dsh-session-projection`, `dsh-system-prompt`, `dsh-typert-protocol`, `dsh-util-values`, `dsh-workspace` (optional), `@deepseek-ai/cordis`.

### 2.2 `packages/core/agent-loop`

- **npm-Paket:** `@deepseek-ai/dsh-agent-loop`
- **Zweck:** Der konkrete Agent-Loop-Plugin: erzeugt gescopte `ReactLoopAgent`-Instanzen, veröffentlicht sie über Agent- und Session-Registry und besitzt deren geordneten Teardown. Enthält außerdem den Tool-Call-Scheduler und die beiden Loop-eigenen Projektionen.
- **`inject`:** `static inject = ['agents', 'sessions', 'llm', 'tools', 'systemPrompt', 'sessionProjections']` (`src/index.ts` Zeile 342). Dynamisch zusätzlich `ctx.inject(['sessionPersistence'], …)` (`src/index.ts` Zeile 411).
- **`Config`** (`interface Config`, `src/index.ts` Zeile 303; Schema Zeilen 345–357):

  | Feld | Typ | Default | Anmerkung |
  |---|---|---|---|
  | `maxParallelToolCalls` | `Volatile<number>`, Schema `z.number().step(1).min(1)` | `DEFAULT_MAX_PARALLEL_TOOL_CALLS` = **10** (`src/constants.ts` Zeile 6) | `1` = seriell |
  | `agents` | Array aus `AgentOptions & { id: string; sessionId?: SessionId; cwd?: string; resumeSessionId?: SessionId }` | `[]` | `id` required; `maxTokens` `z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER)` |

  Zusätzlich exportierte Konstanten: `CONFIGURED_AGENT_IDENTITIES_KEY = 'configuredAgentIdentities'` (`src/index.ts` Zeile 277), `DEFAULT_MAX_PARALLEL_TOOL_CALLS = 10`.
- **Exportierte Serviceklasse:** `AgentLoop extends Service implements AgentFactory`, registriert als `ctx.agentLoop`.
  - `constructor(ctx: Context, config: Config)`
  - `create(id: SessionId, options?: AgentOptions, meta?: Pick<SessionHeader, 'cwd'>): Promise<Agent>`
  - `createAgent(ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle>`
  - `resume(ownerCtx: Context, options: ResumeAgentOptions): Promise<AgentHandle>`
  - `readonly config: Config`
  - Privat: `reportConfiguredStartupFailure`, `restoreOrCreateConfigured`, `waitForDrainingConfiguredIdentity`, `prepare`, `createStoredSession`, `appendUnstoredSuffix`, `setupAndPublish`, `initializeAgent`, `resumeWith`.
- **Weitere exportierte Klassen/Funktionen:** `ReactLoopAgent implements Agent` (`src/agent.ts`), `ReactLoopInbox implements Inbox` (`src/inbox.ts`), `SystemPromptProjection` und `RuntimeContextProjection` (`src/runtime-context.ts`), `AssistantStreamAttempt` (`src/assistant-stream.ts`), `executeToolCalls(...)` (`src/tool-calls.ts`), `inboxProjectionDefinition` (`src/inbox.ts`), `turnBoundaryProjectionDefinition` (`src/index.ts` Zeile 57), `LauncherAgentIdentity`, `ConfiguredAgentIdentities`.
- **Angehängte Session-Events:** `turn/start`, `turn/end`, `step/start`, `step/end`, `system/message`, `user/message`, `assistant/message`, `assistant/attempt`, `request/header`, `request/context`, `developer/message`, `tool/call`, `tool/result` (alle in `src/agent.ts`, `src/tool-calls.ts`, `src/runtime-context.ts`); `agent/inbox/spliced` (`src/inbox.ts` Zeile 235).
- **Cordis-Events:** emittiert `agent-loop/config-start-failed` (`src/index.ts` Zeile 249, Modus emit); variablen `provider`/`model` am SystemPrompt (`src/index.ts` Zeilen 389–390).
- **Interne Abhängigkeiten:** `dsh-agent`, `dsh-llm`, `dsh-scope`, `dsh-session`, `dsh-session-persistence`, `dsh-session-projection`, `dsh-system-prompt`, `dsh-tools`, `@deepseek-ai/dsh-brand`, `dsh-util-values`, `schemastery`, `zod`, `cordis`.

### 2.3 `packages/core/agent-default-model`

- **npm-Paket:** `@deepseek-ai/dsh-agent-default-model`
- **Zweck:** Hält die Standard-Modellauswahl für Agents, die ohne eigenes Modell erzeugt werden, unabhängig von Host und Transport.
- **`inject`:** kein `inject`-Export; dynamisch `ownerContext.inject(['settings'], …)` (`src/index.ts` Zeile 60).
- **`Config`** (`static Config`, `src/index.ts` Zeilen 51–55, Interface Zeilen 24–31):

  | Feld | Typ | Default |
  |---|---|---|
  | `provider` | `Volatile<string>`, `z.string().required().volatile()` | keiner (Pflicht) |
  | `model` | `Volatile<string>`, `z.string().required().volatile()` | keiner (Pflicht) |
  | `reasoningEffort` | `Volatile<string \| undefined>`, `z.string().volatile()` | keiner (Omission folgt dem Provider-Default) |

- **Serviceklasse:** `AgentDefaultModelConfig extends Service` als `ctx.agentDefaultModel`.
  - `currentSelection(): ModelSelection`
  - `saveSelection(next: ModelSelection): Promise<void>` (No-op ohne `configEditor`)
- **Session-/Cordis-Events:** keine.
- **Abhängigkeiten:** `dsh-agent`, `dsh-llm`, `dsh-settings`, `dsh-config-editor` (type-only), `schemastery`, `cordis`.

### 2.4 `packages/core/agent-tool-presentation`

- **npm-Paket:** `@deepseek-ai/dsh-agent-tool-presentation`
- **Zweck:** Agentenplane-Zeile, mit der ein Agent-Preset deklariert, welche Form seiner Tools das Modell sieht (`native` oder `ptc`). Sie besitzt keine eigenen Revisionen, sondern ruft `ctx.tools.presentAs()` für den mountenden Scope auf.
- **`name`:** `'tool-presentation'` (`src/index.ts` Zeile 28).
- **`inject`:** `['tools']` (`src/index.ts` Zeile 35); für `ptc` zusätzlich dynamisch `ctx.inject(['ptcRuntime'], …)` (`src/index.ts` Zeile 69).
- **`Config`** (`src/index.ts` Zeilen 38–52): `mode: ToolPresentationMode` — Schema `z.union(['native', 'ptc'] as const).required()`; **kein Default** (bewusst required: der Deployment-Default ist das, was eine Zeile ohne dieses Feld ohnehin bekäme).
- **Exportierte Funktion:** `apply(ctx: Context, config: Config): void`.
- **Session-/Cordis-Events:** keine eigenen; wirkt über `ctx.tools.presentAs()`.
- **Abhängigkeiten:** `dsh-tools`, `schemastery`, `cordis`.

### 2.5 `packages/core/scope`

- **npm-Paket:** `@deepseek-ai/dsh-scope`
- **Zweck:** Grundprimitive für gescopte Kontexte: mintet einen Cordis-Kontext, der Registrierungen mit einer opaken Identität taggt, und baut routing-only Event-Carrier für diese Identität.
- **`inject` / `Config`:** nicht vorhanden (reine Bibliothek).
- **Exportierte Funktionen:** `createScope(ctx, key, options?): Scope`, `scopeOf(ctx): ScopeKey | undefined`, `scopeTarget<T>(base, key): Scoped<T>`, `isScopeCarrier(value)`, `carrierKeyOf(value)`, `bindScopeParent(key, parent): ScopeParentBinding`, `scopeParentOf(key)`, `scopeChainOf(key)`, sowie die Store-Klassen `NamedEntries<V>`, `AnonymousEntries<V>`, `ScopedLayers<L>` (`src/store.ts`).
- **Exportierte Typen:** `ScopeKey`, `Scoped<T>`, `Scope`, `CreateScopeOptions`, `ScopeParentBinding`, `ScopeLayer`.
- **Session-/Cordis-Events:** keine.
- **Abhängigkeiten:** nur `@deepseek-ai/cordis`.

### 2.6 `packages/core/session`

- **npm-Paket:** `@deepseek-ai/dsh-session`
- **Zweck:** Durable, append-only Session-Log als Quelle der Wahrheit plus `SessionStore`-Service, Surface-Verwaltung, Request-Header-Faltung, Tail-Repair und Fork-Erzeugung.
- **`inject`:** kein `inject`-Export; dynamisch `ctx.inject(['typert'], …)` (`src/index.ts` Zeile 1078).
- **`Config`:** nicht vorhanden.
- **Exportierte Serviceklasse:** `SessionStore extends Service` als `ctx.sessions`.
  - `registerMessageProjection(projection: SessionMessageProjection): () => Promise<void>`
  - `create(id?: SessionId, options?: CreateSessionOptions): Session`
  - `prepare(id?: SessionId, options?: PrepareSessionOptions): Session`
  - `enter(session: Session): () => void`
  - `announce(session: Session): void`
  - `flush(session: Session): Promise<boolean>`
  - `get(id: SessionId): Session | undefined`
  - `list(): Session[]`
  - `fork(source: SessionForkSource, boundary?: SessionSeq, childSessionId?: SessionId): Session`
  - Privat: `detachEntered`, `emitDisposed`, `liveEntryFor`, `_forkBoundary`, `_resolveForkSource`.
- **Exportierte Klasse `Session`** (kein Service): `static create(...)`, `static fromRestore(...)`, `get surface(): SessionSurface`, `readonly header: SessionHeader`, `readonly inheritedEventCount: SessionLogOffset`, `get id(): SessionId`, `readonly firstLiveSeq: SessionLogOffset`, `readonly firstLifecycleSeq: SessionLogOffset`, `eventAt(seq): SessionEvent | undefined` (deprecated), `snapshotEvents(fromSeq?, toSeqExclusive?)` (deprecated), `ownEvents()` (deprecated), `isOwnSeq(seq): boolean`, `get seq(): SessionLogOffset`, `append<T>(type, data, ...opts): SessionEvent<T>`, `requestHeader(): EpochHeader | undefined`, `requestContext(): RequestContext | undefined`, `toolHistory(): ToolHistory`, `deriveMessages(): Message[]`, `deriveEventMessage(event): Message | null`.
- **Weitere Exporte:** `buildForkSeed`, `SessionPreparation`, `interruptedTurnClosers`, `ToolCallRecovery`, `TOOL_NOT_STARTED = 'TOOL_NOT_STARTED'`, `TOOL_OUTCOME_UNKNOWN = 'TOOL_OUTCOME_UNKNOWN'`, `deriveEventMessage`, `foldSurface`, `isAppendSurfaceEvent`, `isReplacementSurfaceEvent`, `isSurfaceEvent`, `isSurfaceEligibleType`, `canonicalHeader`, `foldRequestHeader`, `headerEquals`, `KNOWN_SESSION_EVENT_TYPES`, `MESSAGE_PROJECTION_EVENT_TYPES`, `adoptSessionEvent`, `snapshotSessionEvent`, `appendPluginRecord`, `pluginRecordOf`, `decodeSeqRanges`, `encodeSeqRanges`, `SessionForkError`, `SESSION_FORMAT_VERSION = 4`, `SessionId(id)`, `SessionSeq(value)`, `SessionLogOffset(value)`, `SessionForkSource`, `SessionForkErrorCode`, Typen `SessionEventMap`, `SessionEventType`, `SurfaceEventType`, `SurfaceEvent`, `SurfaceOp`, `SurfaceIntent`, `SessionEvent<T>`, `PluginRecordType`, `PluginRecordMap`, `PluginRecord`, `TurnEndReasonMap`, `TurnEndReason`, `TurnEndCancelCause`, `AgentCancelCause`, `EpochHeader`, `RequestContext`, `RequestHeaderReason`, `SessionHeader`, `CreateSessionOptions`, `RestoredSessionOptions`, `PrepareSessionOptions`, `SessionSeedEventState`, `SessionSeqCursor`, `OptionalSessionSeq`.
- **Angehängte Session-Events:** Kernvokabular `turn/start`, `turn/end`, `step/start`, `step/end`, `user/message`, `developer/message`, `system/message`, `assistant/message`, `assistant/attempt`, `tool/call`, `tool/result`, `request/header`, `request/context`, `session/end-seed` (`src/types.ts` Zeilen 281–428). Der Store selbst hängt nichts an; `Session.append` committet.
- **Cordis-Events:** `session/created`, `session/disposed`, `session/flush` (Store-Methoden `announce`, `emitDisposed`, `flush`), `session/event` (Publication), deklariert in `src/index.ts` Zeile 43.
- **Abhängigkeiten:** `dsh-brand`, `dsh-llm`, `dsh-util-values`, `dsh-typert-protocol`, `cordis`.

### 2.7 `packages/core/system-prompt`

- **npm-Paket:** `@deepseek-ai/dsh-system-prompt`
- **Zweck:** Registry für Prompt-Sections, Runtime-Contexts, Tool-Provider und Prompt-Variablen; baut die Assemblierung des System-Prompts und rendert Sections/Contexts.
- **`inject`:** kein `inject`-Export.
- **`Config`** (Interface Zeile 254, Schema Zeilen 426–433):

  | Feld | Typ | Default |
  |---|---|---|
  | `includeHarnessIdentity` | `boolean?` | `true` |
  | `includeRuntimeContext` | `boolean?` | `true` |
  | `personaPrefix` | `string?` | `''` |
  | `personaSuffix` | `string?` | `''` |
  | `toolOrder` | `string[]?` | `undefined` (Omission bewusst erhalten) |

- **Serviceklasse:** `SystemPrompt extends Service` als `ctx.systemPrompt`.
  - `section(section: PromptSection): () => void`
  - `getSectionOrder(name: PromptSectionOrderName): number`
  - `getContextOrder(name: PromptContextOrderName): number`
  - `context(context: PromptContext): () => void`
  - `suppressRuntimeContext(): () => void`
  - `tools(provider: (context: AssembleContext) => ToolProviderResult): () => void`
  - `variable(name: string, provider: (context: AssembleContext) => string | undefined): () => void`
  - `refreshContext(assembly: PromptAssembly, context?: AssembleContext): PromptAssembly`
  - `assemble(context?: AssembleContext): Promise<PromptAssembly>`
- **Weitere Exporte:** `renderPrompt`, `renderContextSnapshot`, `joinContextSections`, `renderContextSections`, `SECTION_ORDERS`-Namen über `PromptSectionOrderName`, `CONTEXT_ORDERS`-Namen über `PromptContextOrderName`, `PERSONA_PREFIX_SECTION = 'deployment:persona-prefix'`, `PERSONA_SUFFIX_SECTION = 'deployment:persona-suffix'`, `TOOL_ORDER_REST = '<unlisted-tools>'`, Typen `AssembleContext`, `PromptSection`, `PromptContext`, `AssembledSection`, `AssembledContext`, `ToolProviderResult`, `PromptAssembly`, `PromptSectionOrderName`, `PromptContextOrderName`.
- **Cordis-Events:** emittiert `system-prompt/change` (`src/index.ts` Zeile 437); konsumiert/emittiert `system-prompt/assemble` als Waterfall (`src/index.ts` Zeile 674).
- **Abhängigkeiten:** `dsh-scope`, `dsh-llm`, `dsh-util-values`, `schemastery`, `cordis`.

### 2.8 `packages/core/tools`

- **npm-Paket:** `@deepseek-ai/dsh-tools`
- **Zweck:** Tool-Registry, Modell-Präsentationsmodi (`native`/`ptc`) und die Pre/Guard/Around/Post/Result-Execution-Pipeline samt Schema-, JSON-Schema-, SDK-Renderer- und `run_code`-Transport-Bausteinen.
- **`inject`:** `static inject = ['systemPrompt']` (`src/index.ts` Zeile 809). `ptcRuntime` wird bewusst **nicht** injiziert, sondern zur Nutzungszeit über `ctx.get('ptcRuntime')` gelesen (`requirePtcRuntime`, `src/index.ts` Zeile 1051).
- **`Config`** (Interface Zeile 675, Schema Zeilen 811–814):

  | Feld | Typ | Default |
  |---|---|---|
  | `mode` | `'native' \| 'ptc'` | `'native'` |
  | `maxParallelSubCalls` | positiver Integer | `10` (`z.natural().min(1).default(10)`) |

- **Serviceklasse:** `ToolRuntime extends Service` als `ctx.tools`.
  - `presentAs(mode: ToolPresentationMode): () => void`
  - `register(definition: ToolDefinition): () => void`
  - `restrict(filter: ToolRestriction): () => void`
  - `guard(guard: ToolGuard): () => void`
  - `get(name: string, scope?: ScopeKey): ToolDefinition | undefined`
  - `schemas(scope?: ScopeKey): ToolSchema[]`
  - `executionMode(exec: ToolExecutionInput): ToolExecutionMode`
  - `execute(exec: ToolExecutionInput): Promise<ToolExecutionResult>`
  - Symbol-Key `[TOOL_RUNTIME_SCHEDULER]: ToolRuntimeScheduler` mit `prepare`, `dispatch`, `finalize`, `finish` (internal)
  - Privat: `collapseSection`, `sdkSection`, `modeFor`, `requirePtcTransport`, `wireSchemas`, `requirePtcRuntime`, `guardReason`, `view`, `resolveExecution`, `sdkSchemas`, `schemaOf`, `shapeDispatchLog`, `collapses`, `completeScheduledExecution`, `createExecution`, `prepareScheduledExecution`, `prepareExecution`, `callerCancelled`, `cancellationResult`, `dispatchToolBody`, `dispatchScheduledExecution`, `finalizeScheduledExecution`, `finishScheduledExecution`, `applyFinalContent`, `notifyResult`, `serviceAsk`, `postExecute`, `markCanonical`, `createSuccessResult`, `normalizeDispatchResult`, `materializeFinalResult`.
- **Weitere Exporte:** `defineTool`, `valueSchemaSpecToJsonSchema`, `parameterSchemaSpecToJsonSchema`, `validateArgs`, `ToolArgsError`, `assertSupportedJsonSchema`, `assertObjectJsonSchema`, `validateJsonSchemaValue`, `JsonSchemaError`, `CodeRunFailedError`, `RUN_CODE_NAME = 'run_code'`, `jsonSchemaToTs`, `renderToolsSdk`, `jsonSchemaToPy`, `renderToolsSdkPy`, `defineContentToolFixture`, `TOOL_RUNTIME_SCHEDULER`, `TOOL_ABORTED = 'ABORTED'`, `TOOL_ABORTED_BEFORE_DISPATCH = 'ABORTED_BEFORE_DISPATCH'`, Klassen `ToolNotFoundError` (code `UNKNOWN_TOOL`), `ToolOutputError` (code `INVALID_TOOL_OUTPUT`), `PtcSdkLanguage = 'typescript' | 'python'`, `ToolPresentationMode`, `ToolRestriction`, `ToolGuard`, `ToolDefinition`, `ToolOutputDefinition`, `ToolResult`, `ToolExecutionInput`, `ToolExecution`, `ToolDispatchExecution`, `ToolRunContext`, `ToolExecutionMode`, `ToolExecutionSuccess`, `ToolExecutionFailure`, `ToolExecutionResult`, `PreToolDecision`, `PostToolDecision`, `ToolErrorInfo`, `ToolFailure`, `ToolExecutionToken`, `ScheduledToolPreparation`, `ScheduledToolDispatch`, `ToolRuntimeScheduler`, `PtcDispatchLog`, `PtcDispatchEventData`, `PtcDispatchStartEventData` sowie die Präsentationstypen `ToolCallKind`, `FileLocation`, `FileDiff`, `ToolCallView`, `GenericCallView`, `TerminalCallView`, `DiffCallView`, `ToolResultView`, `GenericResultView`, `TerminalResultView`, `DiffResultView`, `SearchResultView`, `SearchMatchesResultView`, `SearchPathsResultView`, `SearchFileMatches`, `SearchLineMatch`, `ReadResultView`, `WebResultView`, `WebSearchResultView`, `WebFetchResultView`, `WebSource`.
- **Angehängte Session-Events:** `tool/ptc-dispatch-start` und `tool/ptc-dispatch` (`src/types.ts` Zeilen 45, 61; geschrieben im `run_code`-Bridge-Pfad).
- **Cordis-Events (deklariert `src/index.ts` Zeilen 143–210):** `tools/pre-execute` (waterfall), `tools/execute` (waterfall), `tools/post-execute` (waterfall), `tools/ptc-dispatch-log` (waterfall), `tools/result` (emit), `tools/change` (emit, unfiltered).
- **Abhängigkeiten:** `dsh-scope`, `dsh-llm`, `dsh-agent`, `dsh-session`, `dsh-system-prompt`, `dsh-ptc-runtime`, `dsh-sandbox-policy`, `dsh-user-approval`, `dsh-working-directory`, `dsh-util-values`, `schemastery`, `cordis`.

### 2.9 `packages/guard/repeat-tool-reminder`

- **npm-Paket:** `@deepseek-ai/dsh-repeat-tool-reminder`
- **Zweck:** Advisory Guard, der wiederholte identische Tool-Calls eines Agents erkennt und dem Post-Execute-Ergebnis eine protokollierte Modell-Erinnerung als `additionalContexts` anfügt — ohne den Call zu vetoieren oder umzuschreiben.
- **`name`:** `'repeat-tool-reminder'` (`src/index.ts` Zeile 24). **`inject`:** nicht vorhanden.
- **`Config`** (`src/index.ts` Zeilen 35–57): `thresholds` (`number[]`, Default `[3, 5, 8]`), `include` (`string[]`, Default `[]`), `exclude` (`string[]`, Default `[]`), `argumentsPreviewChars` (`number`, Default `500`).
- **Exportierte Funktion:** `apply(ctx: Context, config: Config): void`.
- **Session-Events:** keine Appends; die Erinnerung wirkt als `additionalContexts` auf dem Tool-Ergebnis und wird vom Loop als `user/message` protokolliert.
- **Cordis-Events:** konsumiert `tools/post-execute` (waterfall, `src/index.ts` Zeile 220) und `agent/pre-step` (waterfall, reiner Reset-Hook, Zeile 236).
- **Interne Abhängigkeiten:** `dsh-agent`, `dsh-llm`, `dsh-session`, `dsh-tools`, `schemastery`, `cordis`.

### 2.10 `packages/guard/timeout-policy`

- **npm-Paket:** `@deepseek-ai/dsh-tool-call-timeout-policy`
- **Zweck:** Kooperativer Timeout-Vollstrecker: ein Tool deklariert `timeoutMs`, dieser `tools/execute`-Wrapper bewaffnet die Deadline auf `exec.signal` und ersetzt das Ergebnis durch `TOOL_TIMEOUT`, ohne das Tool-Promise abzubrechen oder zu abandonnieren.
- **`name`:** `'timeout-policy'`; **`inject`:** `['tools']` (`src/index.ts` Zeilen 28, 31).
- **`Config`:** nicht vorhanden (`apply(ctx: Context): void`, Zeile 55).
- **Exportierte Konstante:** `TOOL_TIMEOUT = 'TOOL_TIMEOUT'` (`src/index.ts` Zeile 25); Funktion `apply(ctx)`.
- **Session-Events:** keine.
- **Cordis-Events:** konsumiert `tools/execute` (waterfall).
- **Abhängigkeiten:** `dsh-timeout` (`deadline`, `timeoutOf`), `dsh-tools`, `cordis`.

### 2.11 `packages/goal/goal`

- **npm-Paket:** `@deepseek-ai/dsh-goal`
- **Zweck:** Ereignis-sourcing-basierter Same-Session-Goal-Zustand (`ctx.goals`) mit Lebenszyklusoperationen, ausschließlich aus dem besitzenden Session-Log gespeist.
- **`inject`:** `static inject = ['agents', 'sessionProjections']` (`src/index.ts` Zeile 241).
- **`Config`** (`src/index.ts` Zeilen 172–181, Schema 243–245): `defaultMaxGoalRounds?: number` mit `z.number().default(256)`; aufgelöst über `ResolvedConfig { defaultMaxGoalRounds: number }`; negative/nicht-ganzzahlige Werte werfen `GoalError(..., 'GOAL_INVALID_MAX_ROUNDS')`.
- **Serviceklasse `GoalService`** (als `ctx.goals`):
  - `get(agent: Agent): GoalView | undefined`
  - `disarm(agent: Agent): GoalView | undefined`
  - `create(agent: Agent, request: CreateGoalRequest): GoalView`
  - `edit(agent: Agent, ref: GoalRef, request: EditGoalRequest): GoalView`
  - `pause(agent: Agent, ref: GoalRef): GoalView`
  - `resume(agent: Agent, ref: GoalRef): GoalView`
  - `complete(agent: Agent, ref: GoalRef): GoalView`
  - `block(agent: Agent, ref: GoalRef, reason: GoalBlockReason): GoalView`
  - `clear(agent: Agent, ref: GoalRef): GoalRef`
  - `remoteExportCreate(agent: Agent, request: CreateGoalRequest): CreateGoalResult`
  - Privat: `prepareMutation`, `expectCurrent`, `assertLive`, `state`, `runtimeState`, `setActivation`, `withPhase`, `transition`, `transitionError`, `commitCurrent`, `nextMutationTime`, `commitSnapshot`, `commit`, `view`.
- **Exportierte Typen:** `GoalOperation = 'create' | 'edit' | 'pause' | 'resume' | 'complete' | 'block' | 'clear'`; `GoalSnapshotChangeMeta`, `GoalClearChangeMeta`, `GoalChangeMeta`, `GoalMessageSource` (MessageSource `kind: 'goal'`), `FoldedGoal`, `GoalChanged`, `GoalErrorCode` (`GOAL_AGENT_NOT_LIVE`, `GOAL_NOT_FOUND`, `GOAL_ALREADY_EXISTS`, `GOAL_STALE_REVISION`, `GOAL_INVALID_OBJECTIVE`, `GOAL_INVALID_MAX_ROUNDS`, `GOAL_INVALID_BLOCK_REASON`, `GOAL_INVALID_EDIT`, `GOAL_INVALID_TRANSITION`), `goalProjectionDefinition`, `Config`, `ResolvedConfig`, `GOAL_CHANGE_VERSION = 1` (`src/runtime.ts` Zeile 8).
- **Angehängte Session-Events:** `goal/change` (`src/index.ts` Zeile 613).
- **Cordis-Events:** `goal/changed` (scoped, emit, deklariert `src/domain.ts` Zeile 105) und `goal/changed`-Konsum; `goalRoundStarted`-Familie nicht gefunden.
- **Interne Abhängigkeiten:** `dsh-agent`, `dsh-llm`, `dsh-session`, `dsh-session-projection`, `dsh-util-values`, `schemastery`, `zod`, `cordis`.

### 2.12 `packages/goal/goal-round-driver`

- **npm-Paket:** `@deepseek-ai/dsh-goal-round-driver`
- **Zweck:** Race-fenced Driver, der automatische Goal-Runden startet, solange ein aktives Goal existiert, und am konfigurierten Rundenlimit mit dem Code `round-limit` endet.
- **`name`:** `'goal-round-driver'`; **`inject`:** `['agents', 'goals', 'sessions']` (`src/index.ts` Zeilen 18–19).
- **`Config`:** nicht gefunden in `src/*.ts` (kein `Config`-Export; die Rundengrenze kommt aus dem Goal selbst: `goal.maxGoalRounds`).
- **Exportierte Funktion:** `apply(ctx, config)`.
- **Session-Events:** keine Appends im Paket (Runden werden über `agent.send`/`followup` und den Goal-Zustand gefahren).
- **Cordis-Events:** nutzt den Goal-Service und Session-Grenzen; zusätzlich `session/flush` als Idle-Checkpoint (Kommentar in `packages/core/session/src/index.ts` Zeile 1308 nennt `goal-round-driver` ausdrücklich als Flush-Nutzer).
- **Harter Fakt:** Fehlertext `Goal reached its configured limit of ${goal.maxGoalRounds} rounds.` mit `code: 'round-limit'` (`src/index.ts` Zeilen 168–169).

### 2.13 `packages/goal/command-goal`

- **npm-Paket:** `@deepseek-ai/dsh-command-goal`
- **Zweck:** Menschorientierter Slash-Befehl für persistierte Same-Session-Goals.
- **`name`:** `'command-goal'`; **`inject`:** `['commands', 'goals']` (`src/index.ts` Zeilen 13–14).
- **`Config`:** nicht gefunden.
- **Session-Events:** keine eigenen Appends; der `command/*`-Lifecycle wird vom Command-Registry geschrieben.
- **Cordis-Events:** keine eigenen.

### 2.14 `packages/goal/tool-goal`

- **npm-Paket:** `@deepseek-ai/dsh-tool-goal`
- **Zweck:** Modellgerichtete Goal-Tools mit Autoritätsprüfung zur Ausführungszeit.
- **`name`:** `'tool-goal'`; **`inject`:** `['agents', 'goals', 'tools', 'systemPrompt', 'sessionProjections']` (`src/index.ts` Zeilen 28–29).
- **`Config`** (`src/index.ts` Zeilen 32–40): `blockedAfterConsecutiveRounds?: number` mit `z.number().step(1).min(1).default(3)`. `UPDATE_ACTIONS = ['edit', 'pause', 'resume', 'complete', 'blocked']` (`src/index.ts` Zeile 49).
- **Registrierte Tools:** `get_goal` (Zeile 196), `create_goal` (Zeile 208), `update_goal` (Zeile 235). Alle drei deklarieren kein `isConcurrencySafe` → **exklusiv**.
- **Session-Prompt-Section:** `tool:goal` (Zeile 190).
- **Session-Events:** keine eigenen Appends; Änderungen laufen über `ctx.goals`.
- **Cordis-Events:** keine eigenen.

### 2.15 `packages/plan/plan-mode`

- **npm-Paket:** `@deepseek-ai/dsh-plan-mode`
- **Zweck:** Protokollierter Pro-Agent-Plan-Modus mit Deployment-Guidance, direktem Slash-Befehl `/plan` und benutzergereviewtem Verlassen über das Tool `exit_plan_mode`.
- **`inject`:** `static inject = ['tools', 'systemPrompt', 'sessionProjections']` (`src/index.ts` Zeile 176); dynamisch `ctx.inject(['commands'], …)` (Zeile 229).
- **`Config`** (`PlanModeConfig`, `src/index.ts` Zeilen 69–72, Validierung 104–117): `section: string` — Pflicht, nicht leer, keine unbekannten Keys. Kein `default` (Validierung wirft bei fehlendem/leerem `section`).
- **Serviceklasse:** `PlanModeController extends Service` als `ctx.planMode`.
- **Exportierte Konstante:** `EXIT_PLAN_MODE = 'exit_plan_mode'` (`src/index.ts` Zeile 66); Projektion `planProjectionDefinition` (Zeile 136); Funktion `resolveConfig(config: PlanModeConfig): PlanModeConfig`.
- **Angehängte Session-Events:** `plan/mode` (`src/index.ts` Zeilen 440, 456).
- **Cordis-Events:** konsumiert `agent/pre-step` (waterfall, Zeile 196); registriert die Prompt-Section `plan:policy` (Order `PLAN_POLICY`); registriert den Command `plan` mit `definitionId '@deepseek-ai/dsh-plan-mode'`.
- **Review-Interaktion:** Frage-Id `plan-review`, Optionen `Approve` / `Keep planning` (`src/index.ts` Zeilen 74–81).

### 2.16 `packages/todo/tool-todo`

- **npm-Paket:** `@deepseek-ai/dsh-tool-todo`
- **Zweck:** Modellgerichtetes `todo_write`-Tool über das ereignis-sourcing-basierte Session-Log; jede Schreiboperation ist ein Whole-List-Snapshot.
- **`name`:** `'tool-todo'`; **`inject`:** `['tools', 'sessionProjections']` (`src/index.ts` Zeilen 22–23).
- **`Config`** (`src/index.ts` Zeilen 41–43): genau **ein** Feld `allowParallelInProgress: boolean` mit `z.boolean().required()` — **kein Default** (Pflichtfeld); es wählt die Prompt-Beschreibung, ob mehrere Einträge gleichzeitig `in_progress` sein dürfen.
- **Registriertes Tool:** `todo_write` (`src/index.ts` Zeile 136); kein `isConcurrencySafe` → **exklusiv**.
- **Angehängte Session-Events:** `todo/write` (`src/index.ts` Zeile 199) mit Payload `{ todos: TodoItem[] }`.
- **Exportierte Typen:** `TodoItem { content: string; status: 'pending' | 'in_progress' | 'completed' }`; Projektion `todos` (Key `todos`, `stateVersion: 2`, `init: () => null`).
- **Cordis-Events:** keine eigenen.

### 2.17 `packages/interaction/commands`

- **npm-Paket:** `@deepseek-ai/dsh-commands`
- **Zweck:** Plugin-eigene Human-Command-Registry, die interaktive UI-Adapter teilen; verwaltet Registrierung, Sichtbarkeit pro Agent, Anhänge-Admission und den `command/run`/`command/done`-Lifecycle.
- **`name`:** `'commands'` (`src/index.ts` Zeile 30). **`inject`:** nicht vorhanden.
- **`Config`:** nicht vorhanden.
- **Serviceklasse:** `CommandRuntime extends TypertRemoteService` als `ctx.commands`.
  - `register(definition: CommandDefinition): () => void`
  - `registerFileReceiptResolver(resolver: CommandFileReceiptResolver): () => void`
  - `list(agent: Agent): readonly CommandDescriptor[]`
  - `find(agent: Agent, name: string): CommandDefinition | undefined`
  - `execute(agent: Agent, line: string, submittedAttachments: readonly CommandSubmitAttachment[], signal: AbortSignal): Promise<CommandExecution | undefined>` (`@Remote`, Zeile 360)
  - Privat: `settleThrown`, `mintCommandId`, `view`, `notifyChange`.
- **Exportierte Typen:** `CommandInvocation`, `CommandDefinition`, `CommandDescriptor`, `CommandInputDescriptor`, `CommandResult = { kind: 'success'; text?; sourceEventSeq? } | { kind: 'error'; text }`, `CommandExecution { commandId; result }`, `CommandSourceMap`/`CommandSource` (nur `user`), `CommandSubmitAttachment = { type: 'image' } & EncodedImageAttachment | { type: 'file'; receiptId }`, `CommandFileReceiptResolver`, `CommandDefinitionId`, `CommandId`.
- **Angehängte Session-Events:** `command/run` und `command/done` (`src/index.ts` Zeilen 373, 380).
- **Cordis-Events:** emittiert `commands/change` (unfiltered, deklariert `src/types.ts` Zeile 89).
- **Harte Fakten:** Command-Namensmuster `^[a-z][a-z0-9_-]*$` (`src/index.ts` Zeile 32); `recordInput: false` unterdrückt das `args`-Feld in `command/run` (`src/index.ts` Zeile 376); Attachment-Ablehnung `/${name} does not accept attachments`.

### 2.18 `packages/interaction/permission-presets`

- **npm-Paket:** `@deepseek-ai/dsh-permission-presets`
- **Zweck:** Ein produktweites Permissions-Select, das Sandbox-Modus und Approval-Policy bündelt und beide über je eigene Session-Events festschreibt.
- **`inject`:** `static inject = ['shell', 'approval', 'sessions', 'sessionProjections']` (`src/index.ts` Zeile 201); dynamisch `ctx.inject(['settings'], …)` (Zeile 210) und `ctx.inject(['commands'], …)` (Zeile 255).
- **`Config`** (Interface `src/index.ts` Zeilen 159–172, Schema 182–199):

  | Feld | Typ | Default |
  |---|---|---|
  | `presets` | `Record<string, PresetSpec>` (`z.dict(z.object({ sandbox: required, approval: required, name?: string, description?: string }))`) | `{ 'workspace-write': { sandbox: 'workspace-write', approval: 'ask', … }, 'danger-full-access': { sandbox: 'danger-full-access', approval: 'never', … } }` |
  | `defaultPreset` | `Volatile<string \| undefined>` | keiner (ohne Angabe wird der zum komponierten Sandbox-/Approval-Default passende Preset genutzt) |

- **Serviceklasse:** `PermissionPresetService extends TypertRemoteService` als `ctx.permissionPresets`.
- **Exportierte Typen:** `PermissionSettings { defaultPreset: string }`, `PresetSpec`, `Config`; Konstante `CUSTOM_PRESET` (Kommentar `src/index.ts` Zeile 177).
- **Angehängte Session-Events:** `permission/preset` (`src/index.ts` Zeilen 416, 440, 448).
- **Projektion:** Key `permissions`, `stateVersion: 2`, `init: () => ({ ...EMPTY_KNOBS, seeded: false })` (`src/index.ts` Zeilen 238–241).
- **Reservierte Preset-Namen:** `custom` (abgeleiteter Zustand) und `auto` (Auto-Review-Integration).

### 2.19 `packages/interaction/tool-ask-user`

- **npm-Paket:** `@deepseek-ai/dsh-tool-ask-user`
- **Zweck:** Modellgerichteter Consumer der `ctx.userQuestions`-Naht: das Tool pausiert, bis ein UI-Provider eine menschliche Antwort liefert, und speist sie als gewöhnliches Tool-Ergebnis in den Loop zurück.
- **`name`:** `'tool-ask-user'`; **`inject`:** `['tools', 'userQuestions']` (`src/index.ts` Zeilen 28–29).
- **`Config`** (`src/index.ts` Zeilen 16–26): `mode?: 'legacy' | 'timed'` mit Default `'legacy'`; `timeout?: number` mit `z.union([-1, z.number().step(1).min(1).max(2_147_483)])` und Default `120` (Sekunden).
- **Registriertes Tool:** `ask_user_question` — im `legacy`-Modus aus `src/index.ts` (Zeile 39), im `timed`-Modus aus `src/timed.ts` (Zeile 107). Kein `isConcurrencySafe` → **exklusiv**.
- **Parameter:** `questions` (Array, required; Items mit `id` required, `question` required, `header?`, `options?` (Items `label` required, `description?`), `multi_select?`). **Output:** `{ answers: [{ id, selected[], custom? }] }`; `render` liefert einen Textblock mit `JSON.stringify(value)`.
- **Session-Events:** keine eigenen Appends (Antworten werden über die Tool-Result-Bahn geliefert).
- **Cordis-Events:** nutzt `ctx.userQuestions.ask(...)`, d. h. den `user-questions/request`-Waterfall.
- **Harter Fakt:** Der Modelltext des Tools ist im Zeitmodus identisch benannt (`ask_user_question`), nur die Wartesemantik unterscheidet sich.

### 2.20 `packages/interaction/user-approval`

- **npm-Paket:** `@deepseek-ai/dsh-user-approval`
- **Zweck:** Approval-Naht (`ctx.approval`) für einmalige Berechtigungsentscheidungen, dispatcht an komponierte Answerer über den `approval/request`-Waterfall — fail-closed per Voreinstellung.
- **`inject`:** kein `inject`-Export; dynamisch `ctx.inject(['systemPrompt'], …)` (`src/index.ts` Zeile 162).
- **`Config`** (Interface Zeilen 134–143, Schema 151–153): `policy?: ApprovalPolicy` mit `z.union(['ask', 'never'] as const).default('ask')`.
- **Serviceklasse:** `ApprovalService extends Service` als `ctx.approval`.
  - `constructor(ctx: Context, public config: Config)`
  - `setPolicy(agent: Agent, policy: ApprovalPolicy): void`
  - `request(req: ApprovalRequest): Promise<ApprovalOutcome>`
  - `overrideOf(session: Session): ApprovalPolicy | undefined`
  - Privat: `effectivePolicy`, `decide`.
- **Exportierte Typen/Konstanten:** `ApprovalPolicy = 'ask' | 'never'`, `APPROVAL_POLICIES = ['ask', 'never']`, `ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'`, `ApprovalRequest`, `ApprovalRequestId`, `ApprovalRequestEvent`, `setApprovalPolicy(session, policy): void`.
- **Angehängte Session-Events:** `approval/policy` (`src/index.ts` Zeile 104), `approval/asked` (Zeile 225), `approval/decided` (Zeile 232).
- **Cordis-Events:** `approval/request` (waterfall, scoped auf `req.agent`, `src/index.ts` Zeile 282); Prompt-Context `approval:policy` (Order `APPROVAL_POLICY`, `src/index.ts` Zeile 164).
- **Harte Fakten:** `request()` verlangt einen **offenen Turn** (`hasOpenTurn`), sonst wirft es mit dem Hinweis auf das turn-eingeschlossene Audit-Paar (`src/index.ts` Zeilen 217–223). Der `'never'`-Policy-Entscheid fällt **vor** jedem Dispatch (Zeile 275), damit Listener-Reihenfolge ihn nicht aushebeln kann. Ein nicht-vokabularer Answerer-Rückgabewert wird auf `'unavailable'` normalisiert (Zeile 288).

### 2.21 `packages/interaction/user-questions`

- **npm-Paket:** `@deepseek-ai/dsh-user-questions`
- **Zweck:** Abstrakte User-Questions-Naht (`ctx.userQuestions`), über die ein Agent während des Laufs den Menschen fragen kann — inklusive zeitlich begrenzter Fortsetzung und später Antwortzuführung.
- **`inject`:** kein `inject`-Export; dynamisch `ctx.inject(['sessionProjections'], …)` (`src/index.ts` Zeile 86).
- **`Config`:** nicht vorhanden.
- **Serviceklasse:** `UserQuestionService extends TypertRemoteService` als `ctx.userQuestions`.
  - `answer(agent: Agent, callId: ToolCallId, answer: AskUserQuestionAnswer): boolean` (`@Remote`, Zeile 164)
  - `attachWait(agent: Agent, callId: ToolCallId, signal: AbortSignal): AsyncIterable<{ remainingMs: number }>` (`@Remote({ mode: 'stream' })`, Zeile 216)
  - `askTimed(request: AskUserQuestionRequest & { agent: Agent }, callId: ToolCallId, timeoutMs: number): Promise<TimedUserQuestionResult>` (Zeile 234)
  - `ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer>` (Zeile 287)
  - Privat: `releaseReply`, `assertLiveRoot`, `continued`.
- **Fehlerklasse:** `UserQuestionError extends HarnessError` mit Codes `CALLER_NOT_LIVE`, `DELEGATED_CALLER`, `BAD_TIMEOUT`, `DUPLICATE_WAIT`, `ASK_TIMED_OUT`, `REPLY_QUEUED`, `BAD_ANSWER` (`src/index.ts` Zeilen 131–246).
- **Exportierte Typen:** `AskUserQuestionOption`, `AskUserQuestionIntent` (`kind: 'plan-review'`, `approve: string`, `callId?`), `AskUserQuestionItem`, `AskUserQuestionAnswerItem`, `AskUserQuestionAnswer`, `UserQuestionState = 'open' | 'continued'`, `PendingUserQuestion`, `SettledUserQuestion`, `UserQuestionProjectionView { active; settled }`, `UserQuestionFold`, `UserQuestionProjectionState`, `AskUserQuestionRequest`, `TimedUserQuestionResult`, `TIMED_WAIT_PARAMETER = 'timeout'`, Funktionen `foldUserQuestions(events)`, `userQuestionProjectionDefinition`.
- **Message-Source:** `'user-question-reply'` (`{ kind: 'user-question-reply'; callId; outcome: 'answered' }`, `src/types.ts` Zeile 117).
- **Cordis-Events:** `user-questions/request` (waterfall, scoped auf `Agent`, `src/types.ts` Zeile 157); konsumiert global `agent/inbox/claimed`, `agent/inbox/discarded`, `session/event` (`src/index.ts` Zeilen 90–122).
- **Projektion:** Key `userQuestions`, `stateVersion: 2` (`src/projection.ts` Zeilen 317, 330).
- **Harte Fakten:** `timeoutMs` muss `Number.isSafeInteger` sein, `>= 1` und `<= 2_147_483_647`, sonst `BAD_TIMEOUT` (`src/index.ts` Zeilen 239–241). Ein Agent, der von einem anderen live-Agent besessen ist, erhält `DELEGATED_CALLER` (`src/index.ts` Zeilen 138–143).

### 2.22 `packages/workflow/workflow`

- **npm-Paket:** `@deepseek-ai/dsh-workflow`
- **Zweck:** Workflow-Fähigkeitsnaht: `ctx.workflowEngine`-Service, Run-Vokabular und die `workflow/*`-Events. Der Seam führt selbst nichts aus; Provider implementieren ihn.
- **`inject` / `Config`:** nicht vorhanden.
- **Serviceklasse:** `abstract class WorkflowEngine extends Service` als `ctx.workflowEngine`.
  - `abstract start(request: WorkflowStartRequest): WorkflowRun`
  - `protected emitWorkflowEvent(name: WorkflowEventName, ...args: unknown[]): void`
- **Exportierte Typen/Klassen:** `WorkflowError extends HarnessError` mit `readonly fatal: boolean` (Default `true`), `isFatalWorkflowError(error): boolean`, `WorkflowEventName = 'workflow/start' | 'workflow/phase' | 'workflow/log' | 'workflow/agent-start' | 'workflow/agent-end' | 'workflow/end'`, `WorkflowErrorCode = 'SCRIPT_PARSE' | 'META_INVALID' | 'INVALID_ARGUMENT' | 'UNSUPPORTED_OPTION' | 'UNSUPPORTED_SCHEMA' | 'AGENT_CAP' | 'ITEM_CAP' | 'AGENT_START' | 'AGENT_RESULT' | 'RESULT_UNSERIALIZABLE' | 'CANCELLED'` (Liste in `src/index.ts` Zeilen 108–119 begonnen), `WorkflowRun`, `WorkflowStartRequest`, `WorkflowRunId`, `WorkflowAgentEndInfo`, `WorkflowAgentInfo`, `WorkflowAgentOutcome`, `WorkflowMeta`, `WorkflowPhase`, `WorkflowResult`, `WorkflowResultInfo`, `WorkflowRunInfo`, `WorkflowStopReason`.
- **Cordis-Events:** `workflow/start`, `workflow/phase`, `workflow/log`, `workflow/agent-start`, `workflow/agent-end`, `workflow/end` — alle Modus `emit` (`src/index.ts` Zeilen 43–89); Listener-Fehler werden enthalten und geloggt (`emitWorkflowEvent`, Zeile 175).
- **Session-Events:** keine.

### 2.23 `packages/workflow/workflow-ptc`

- **npm-Paket:** `@deepseek-ai/dsh-workflow-ptc`
- **Zweck:** Workflow-Orchestrierung im geteilten sandboxed Node-PTC-Runtime; führt das Skript in einem `node:vm`-Kontext aus und ruft Kind-Agents über `ctx.subagents` auf.
- **`inject`:** `static inject = ['subagents', 'ptcRuntime', 'sandboxPolicy', 'workingDirectory']` (`src/index.ts` Zeile 104).
- **`Config`** (`src/index.ts` Zeilen 32–112, Schema ab 106):

  | Feld | Typ | Default |
  |---|---|---|
  | `maxTotalAgents?` | `z.natural().min(1)` | `1000` |
  | `maxItemsPerCall?` | `z.natural().min(1)` | `4096` |
  | `syncTimeoutMs?` | `z.natural().min(1)` | `5000` |
  | `maxConcurrentAgents?` | `z.natural()`, Schema-Default **0** | `0` bedeutet **nicht** „null Agenten", sondern „ableiten": `Math.min(16, Math.max(1, availableParallelism() - 2))` (`src/index.ts` Zeilen 142–144) |

- **Exportierte Typen/Klassen:** `WorkerLimits` (`maxConcurrentAgents`, `maxTotalAgents`, `maxItemsPerCall`, `syncTimeoutMs`), `WorkerInit`, `WorkflowExecution` (in `src/runtime.ts`, exportiert als Teil des Guest-Bundles), `runWorkflowGuest`, `WORKFLOW_GUEST_SOURCE`.
- **Skript-Vokabular (Guest):** `agent(prompt, opts)`, `parallel(thunks)`, `pipeline(items, ...stages)`, `phase(title)`, `log(message)`, `args`.
- **Unterstützte `agent()`-Optionen:** genau `label`, `phase`, `schema`, `provider`, `model` (`SUPPORTED_AGENT_OPTIONS`). Ausdrücklich **deferred** und mit eigener Meldung abgelehnt: `effort`, `isolation`, `agentType` (`DEFERRED_AGENT_OPTIONS`).
- **Harte Fakten (aus dem Guest-Bundle `src/guest-source.ts`):** `defaultLabel` kürzt auf 48 Zeichen (bei Überschreitung 47 Zeichen + `…`); `parallel()`/`pipeline()` mappen gewöhnliche Stage-Fehler auf `null`, fatale `WorkflowError` werden erneut geworfen; `agent()` zählt `started` 1-basiert; Rückgabewerte werden über `materializeFromRealm` auf reine JSON-Daten reduziert (BigInt, Funktionen, Symbole, `undefined`, zyklische Referenzen, Sparse Arrays, exotische Prototypen und symbolische Keys werden abgelehnt).
- **Session-Events:** keine eigenen Appends.

### 2.24 `packages/workflow/tool-workflow`

- **npm-Paket:** `@deepseek-ai/dsh-tool-workflow`
- **Zweck:** Modellgerichtetes Workflow-Tool: führt ein JavaScript-Orchestrierungsskript über `ctx.workflowEngine` aus und protokolliert Run/Agent-Lifecycle im Session-Log.
- **`name`:** `'tool-workflow'`; **`inject`:** `['tools', 'workflowEngine', 'systemPrompt']` (`src/index.ts` Zeilen 40–41).
- **`Config`** (`src/index.ts` Zeilen 44–63): `toolName?: string` mit Default `'workflow'`; `maxResultChars?: number` mit `z.natural().min(1).default(50_000)`; `enableRunInBackground?: boolean` mit Default `true`.
- **Registriertes Tool:** Tool-Name aus `config.toolName` (Default `workflow`), registriert in `src/index.ts` Zeile 328; kein `isConcurrencySafe` → **exklusiv**.
- **Parameter:** `script` (string, required; „plain JavaScript body, not TypeScript, without `export const meta`"), `meta` (object, required; `name` required, `description` required, `whenToUse?`, `phases?` mit `title` required, `detail?`, `provider?`, `model?`), `args?` (object), `run_in_background?` (boolean, nur wenn `enableRunInBackground`).
- **Output:** `oneOf`: `{ kind: 'background'; jobId; runId }` oder `{ kind: 'foreground'; runId; agentsStarted; result }`.
- **Angehängte Session-Events:** `tool-workflow/run-start`, `tool-workflow/agent-start`, `tool-workflow/agent-end`, `tool-workflow/run-end` (`ToolWorkflowRecordEventMap`, `src/index.ts` Zeilen 73–78; Recorder ab Zeile 93).
- **Prompt-Section:** `tool:${toolName}` mit Order `TOOL_WORKFLOW` (`src/index.ts` Zeilen 324–326).
- **Harte Fakten:** Hintergrundläufe brauchen eine lebende `ctx.jobs`-Registry; fehlt sie, scheitert der Aufruf mit Nennung des fehlenden Teils. `maxResultChars` ist eine Zeichen-, keine Token-Grenze.

### 2.25 `packages/subagent/subagent`

- **npm-Paket:** `@deepseek-ai/dsh-subagent`
- **Zweck:** Abstrakte Subagent-Naht (`ctx.subagents`): benannter Provider-Registry zum Delegieren an Kind-Agents, inklusive Activation-Budget, continuierbaren Kind-Links und Katalog-/Descriptor-Projektionen.
- **`inject`:** `static inject = ['workingDirectory']` (`src/index.ts` Zeile 197); dynamisch zusätzlich `ctx.inject(['agents'], …)` (Zeilen 210, 232) und `ctx.inject(['sessionProjections'], …)` (Zeile 225).
- **`Config`** (Interface Zeilen 183–189, Schema 193–196): `maxDepth` (`z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(1).volatile()`), `maxActiveSubagents` (`z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(8).volatile()`).
- **Serviceklasse:** `SubagentRuntime extends TypertRemoteService` als `ctx.subagents`.
  - `resolveMaxDepth(configured?: number | 'provider-managed'): number | undefined`
  - `startActivation(spec: SubagentActivationSpec & { readonly childId: SessionId }): …` und überladene `startActivation(spec): Promise<SubagentActivation>` (Zeilen 253–267)
  - `waitForChildren(parent: Agent): Promise<boolean>`
  - `sendMessage(...)`: `Promise<…>` (Zeile 308)
  - `interrupt(targetSessionId: SessionId, authority: SubagentInterruptAuthority): void`
  - `drainDescendants(parents: readonly Agent[]): Promise<void>`
  - `drainChildren(parent: Agent, childIds: readonly SessionId[]): Promise<void>`
  - `listChildren(parentSessionId: SessionId, signal?: AbortSignal): Promise<SubagentCatalogEntry[]>`
  - `listDescendants(rootSessionId: SessionId, signal?: AbortSignal): Promise<SubagentDescendantListEntry[]>`
  - `prompt(request: SubagentPromptRequest, signal: AbortSignal): Promise<SubagentPromptReceipt>`
  - `interruptByParent(...)` (Zeile 513)
  - `registerProvider(provider: SubagentProvider): () => void`
  - `getProvider(name: string): SubagentProvider | undefined`
  - `list(): string[]`
  - Privat: `expectProvider`, `requireManager`, `observeActivation`, `assertCapabilities`.
- **Exportierte Typen/Konstanten:** `SUBAGENT_CATALOG_VERSION = 0` (`src/catalog.ts` Zeile 21), `SUBAGENT_DESCRIPTOR_VERSION = 3` (`src/descriptor.ts` Zeile 48), `EXTERNAL_SUBAGENT_CATALOG_VERSION = 2` (`src/catalog.ts` Zeile 154), `MAX_SUBAGENT_DIAGNOSTIC_BYTES = 4_096` (`src/out-of-process.ts` Zeile 19), Fehlercode `ACTIVATION_LIMIT_REACHED` mit Text `subagent limit reached (active child limit: ${capacity}); wait for an existing child to finish` (`src/activation.ts` Zeilen 27–29), `SubagentProvider`, `SubagentActivationSpec`, `SubagentCatalogEntry`, `SubagentDescriptorData`, `SubagentIdentityProjection` (`mode: 'one-shot' | 'continuable'`), `subagentTimingProjectionDefinition`, `subagentIdentityProjectionDefinition`.
- **Angehängte Session-Events:** `subagent/catalog` (am **Parent**, `src/catalog.ts` Zeilen 144, 163), `subagent/descriptor` (am **Kind**, `src/manager.ts` Zeile 886), `sandbox/mode` (`src/child-agent.ts` Zeile 270), `approval/policy` (Zeile 273), `permission/preset` (Zeile 276).
- **Cordis-Events:** `subagent/provider-added`, `subagent/provider-removed` (emit), `subagent/start`, `subagent/end` (emit, scoped auf den delegierenden Parent) — `src/index.ts` Zeilen 136–167.
- **Projektionen:** `subagentTiming` (`stateVersion: 3`, `init: () => ({ descriptorSeen: false, settledMs: 0 })`) und `subagent` (`stateVersion: 2`, `init: () => ({})`) — `src/projection.ts` Zeilen 68–189.

### 2.26 `packages/subagent/tool-subagent`

- **npm-Paket:** `@deepseek-ai/dsh-tool-subagent`
- **Zweck:** Modellgerichtetes Delegationswerkzeug über die `ctx.subagents`-Naht; registriert pro geladener Instanz genau ein Tool mit konfigurierbarem Namen.
- **`name`:** `'tool-subagent'`; **`inject`:** `['tools', 'subagents', 'systemPrompt', 'sessionProjections']` (`src/index.ts` Zeilen 40–41); zusätzlich `runtimeCtx.inject(['tools', 'subagents', 'systemPrompt'], …)` (Zeile 455).
- **`Config`** (`src/index.ts` Zeilen 48–117): `provider: string` (required); `toolName?: string` Default `'subagent'`; `modelSelectionSettings?: boolean` Default `false`; `agentOptions?: { provider?; model?; reasoningEffort?; maxTokens? }` (Default bewusst `undefined`, damit Schemastery kein `{}` materialisiert); `persona?: string`; `toolFilter?: { allow?: string[]; deny?: string[] }` (Default `undefined`, damit `{ allow: [] }` nicht alles verbietet); `maxDepth?: number | 'provider-managed'`.
- **Registrierte Tools:** das Delegations-Tool unter `config.toolName` (Default `subagent`, `src/index.ts` Zeile 224) — **`isConcurrencySafe: () => true`** (`src/index.ts` Zeile 279), also parallelfähig. Zusätzlich `list_subagent_models` (`src/list-models.ts` Zeile 88) ohne `isConcurrencySafe` → **exklusiv**.
- **Output des Delegations-Tools:** `{ kind: 'activation'; subagentId }`.
- **Angehängte Session-Events:** `subagent/model-selection-policy` (`src/model-selection-state.ts` Zeile 78).
- **Projektion:** Key `subagentModelSelectionPolicy`, `stateVersion: 1` (`src/model-selection-state.ts` Zeilen 38–39).
- **Zweites Plugin-Modul der Datei:** `subagent-model-selection-settings` (`src/model-selection-settings.ts` Zeile 62).
- **Harte Fakten:** `maxDepth`-Default ist `1` (Host-Einstellung); ein `toolFilter` ohne `allow` und ohne `deny` wird beim Laden abgelehnt (`src/index.ts` Zeile 169); ein numerisches `maxDepth` erfordert die Provider-Fähigkeit `depthLimit`; `persona` erfordert die Provider-Fähigkeit `persona`; `toolFilter` erfordert `toolFilter`.

### 2.27 `packages/subagent/tool-subagent-control`

- **npm-Paket:** `@deepseek-ai/dsh-tool-subagent-control`
- **Zweck:** Global benannte `send_message`-, `interrupt_agent`- und `list_agents`-Tools über die Continuation-Fähigkeiten der `ctx.subagents`-Naht.
- **`name`:** `'tool-subagent-control'`; **`inject`:** `['tools', 'subagents']` (`src/index.ts` Zeilen 20–21`).
- **Zweites Modul:** `src/list-agents.ts` mit `name = 'tool-subagent-list-agents'` und `inject = ['tools', 'subagents', 'agents']` (Zeilen 19–20).
- **`Config`:** nicht gefunden in beiden Dateien.
- **Registrierte Tools:** `send_message` (`src/index.ts` Zeile 29, registriert über `markAdjacentAgentSendMessageTool(defineTool({...}))`, Zeile 28), `interrupt_agent` (Zeile 75), `list_agents` (`src/list-agents.ts` Zeile 87). Keines deklariert `isConcurrencySafe` → alle **exklusiv**.
- **Session-Events:** keine eigenen Appends.

### 2.28 `packages/subagent/subagent-fork-in-process`

- **npm-Paket:** `@deepseek-ai/dsh-subagent-fork-in-process`
- **Zweck:** In-Process-Fork-Backend: führt einen Kind-Agent aus, der mit einem Präfix des Parent-Logs geseedet ist.
- **`name`:** `'subagent-fork-in-process'`; **`inject`:** `['subagents']` (`src/index.ts` Zeilen 21, 26).
- **`Config`** (`src/index.ts` Zeilen 29–36): `providerName: string` mit `z.string().default('fork')`.
- **Seed-Regel:** der Seed ist das **balancierte Präfix abgeschlossener Turns** — alle Events bis einschließlich des letzten `turn/end`; der laufende Turn ist ausgeschlossen, und ohne abgeschlossenen Turn startet das Kind frisch (`completedTurnPrefix`, `src/index.ts` Zeilen 39–48).
- **Provider-Fähigkeiten:** alle Start-Fähigkeiten (`agentOptions`, `outputSchema`, `depthLimit`, `toolFilter`, `persona`) sind laut Kommentar `src/index.ts` Zeilen 22–25 bewusst so getaktet, dass die Registrierung des Capture-Tools die Modell-Tool-Liste nicht verschiebt.
- **Session-Events:** keine eigenen Appends (das Kind erbt über den Fork-Seed).

### 2.29 `packages/subagent/subagent-spawn-in-process`

- **npm-Paket:** `@deepseek-ai/dsh-subagent-spawn-in-process`
- **Zweck:** In-Process-Spawn-Backend: führt einen frischen Kind-Agent auf `ctx.agents` aus (kein geerbter Kontext).
- **`name`:** `'subagent-spawn-in-process'`; **`inject`:** `['subagents']` (`src/index.ts` Zeilen 17, 20) — `tools` ist bewusst **nicht** injiziert, weil die Kind-Fabrik es bereits während des Setups bereitstellt und eine zusätzliche Injection das Apply-Timing verändern würde (Kommentar Zeilen 18–19).
- **`Config`** (`src/index.ts` Zeilen 23–30): `providerName: string` mit `z.string().default('spawn')`.
- **Provider-Fähigkeiten (alle `true`):** `agentOptions`, `outputSchema`, `depthLimit`, `toolFilter`, `persona` (`src/index.ts` Zeilen 40–45).
- **Session-Events:** keine eigenen Appends.

### 2.30 `packages/subagent/subagent-acp`

- **npm-Paket:** `@deepseek-ai/dsh-subagent-acp`
- **Zweck:** Out-of-Process-ACP-Subagent-Backend: fährt einen Kind-Agent in einem gestarteten Subprozess über das Agent Client Protocol.
- **`name`:** `'subagent-acp'`; **`inject`:** `['subagents', 'subprocess']` (`src/index.ts` Zeilen 21–22).
- **`Config`** (`src/index.ts` Zeilen 25–64):

  | Feld | Schema | Default |
  |---|---|---|
  | `providerName` | `z.string()` | `'acp'` |
  | `command` | `z.string().required()` | keiner (Pflicht) |
  | `args` | `z.array(z.string())` | `[]` |
  | `permission` | `z.union(['allow', 'reject'] as const)` | `'reject'` |
  | `env` | `z.dict(z.string())` | `{}` |
  | `disposeEofGraceMs` | `z.number()` | `DEFAULT_DISPOSE_EOF_GRACE_MS` = **6000** (`src/run.ts` Zeile 82) |
  | `disposeGraceMs` | `z.number()` | `DEFAULT_DISPOSE_GRACE_MS` = **3000** (`src/run.ts` Zeile 85) |

- **Provider-Fähigkeiten: alle `false`** — ein Out-of-Process-Kind kann `agentOptions`/`outputSchema`/`maxDepth`/`toolFilter`/`persona` nicht erfüllen; der Service lehnt eine solche Anfrage vor `start` ab (`src/index.ts` Zeilen 75–87). `inheritsParentContext = false`.
- **Validierung:** `disposeEofGraceMs` und `disposeGraceMs` müssen positive endliche Zahlen `<= MAX_TIMER_DELAY_MS` sein, sonst `subagent-acp: <name> must be a positive finite number no greater than <MAX_TIMER_DELAY_MS>` (`src/index.ts` Zeilen 67–70).
- **Session-Events:** keine eigenen Appends.

### 2.31 `packages/subagent/subagent-claude-code`

- **npm-Paket:** `@deepseek-ai/dsh-subagent-claude-code`
- **Zweck:** One-Shot-Claude-Code-Subagent-Provider über das offizielle Agent SDK.
- **`name`:** `'subagent-claude-code'`; **`inject`:** `['subagents', 'subprocess']` (`src/index.ts` Zeilen 30–31).
- **`Config`** (`src/index.ts` Zeilen 38–66):

  | Feld | Schema | Default |
  |---|---|---|
  | `providerName` | `z.string().min(1)` | `DEFAULT_PROVIDER_NAME = 'claude-code'` |
  | `model` | `z.string().min(1)` | keiner (Omission erbt die Claude-Einstellungen) |
  | `env` | `z.dict(z.string())` | `{}` (über eine credential-bereinigte Kopie der Parent-Umgebung gelegt) |
  | `permissionMode` | `z.union([...CLAUDE_CODE_PERMISSION_MODES])` | `DEFAULT_CLAUDE_CODE_PERMISSION_MODE = 'dontAsk'` |
  | `disposeGraceMs` | `z.number()` | `DEFAULT_DISPOSE_GRACE_MS` = **3000** (`src/run.ts` Zeile 41) |

- **`CLAUDE_CODE_PERMISSION_MODES` (exakt, in Reihenfolge):** `'dontAsk'`, `'acceptEdits'`, `'auto'`, `'plan'`, `'bypassPermissions'` (`src/run.ts` Zeilen 44–50).
- **Provider-Fähigkeiten:** `NO_START_CAPABILITIES` (keine); `inheritsParentContext = false` (`src/index.ts` Zeilen 74–75).
- **Session-Events:** keine eigenen Appends.

### 2.32 `packages/subagent/subagent-codex`

- **npm-Paket:** `@deepseek-ai/dsh-subagent-codex`
- **Zweck:** One-Shot-Codex-Subagent-Provider über das offizielle app-server-Protokoll.
- **`name`:** `'subagent-codex'`; **`inject`:** `['subagents', 'subprocess']` (`src/index.ts` Zeilen 30–31).
- **`Config`** (`src/index.ts` Zeilen 36–59):

  | Feld | Schema | Default |
  |---|---|---|
  | `providerName` | `z.string().min(1)` | `DEFAULT_PROVIDER_NAME = 'codex'` |
  | `model` | `z.string().min(1)` | keiner (Omission erbt die Codex-Einstellungen) |
  | `env` | `z.dict(z.string())` | `{}` |
  | `permissionMode` | `z.union([...CODEX_PERMISSION_MODES])` | `DEFAULT_CODEX_PERMISSION_MODE = 'never'` |
  | `disposeGraceMs` | `z.number()` | `DEFAULT_DISPOSE_GRACE_MS` = **3000** (`src/run.ts` Zeile 36) |

- **`CODEX_PERMISSION_MODES` (exakt, in Reihenfolge):** `'never'`, `'approve-for-me'`, `'dangerously-bypass-approvals-and-sandbox'` (`src/run.ts` Zeilen 62–66).
- **Provider-Fähigkeiten:** `NO_START_CAPABILITIES` (keine); `inheritsParentContext = false` (`src/index.ts` Zeilen 64–65).
- **Session-Events:** keine eigenen Appends.

### 2.33 `packages/subagent/subagent-dsh-sdk`

- **npm-Paket:** `@deepseek-ai/dsh-subagent-dsh-sdk`
- **Zweck:** Out-of-Process-SDK-Subagent-Backend: fährt einen Kind-DeepSeek-Harness-Subprozess über stdio-JSON-RPC mit dem TypeScript-SDK-Client.
- **`name`:** `'subagent-dsh-sdk'`; **`inject`:** `['subagents']` (`src/index.ts` Zeilen 30–31).
- **`Config`** (`src/index.ts` Zeilen 34–83):

  | Feld | Schema | Default |
  |---|---|---|
  | `providerName` | `z.string()` | `'dsh-sdk'` |
  | `dshBin` | `z.string()` | keiner (Omission nutzt die SDK-Abhängigkeit) |
  | `profile` | `z.string()` | `'sdk'` |
  | `patches` | `z.array(z.string())` | `[]` |
  | `dshHome` | `z.string().required()` | keiner (Pflicht; absolutes isoliertes Harness-Home) |
  | `provider` | `z.string()` | `'deepseek-official'` |
  | `model` | `z.string()` | `'deepseek-v4-flash'` |
  | `maxTokens` | `z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER)` | keiner |
  | `env` | `z.dict(z.string())` | `{}` |
  | `shutdownTimeoutMs` | `z.number()` | `DEFAULT_SHUTDOWN_TIMEOUT_MS` = **1000** (`src/run.ts` Zeile 79) |
  | `disposeEofGraceMs` | `z.number()` | `DEFAULT_DISPOSE_EOF_GRACE_MS` = **6000** (`src/run.ts` Zeile 73) |
  | `disposeGraceMs` | `z.number()` | `DEFAULT_DISPOSE_GRACE_MS` = **3000** (`src/run.ts` Zeile 76) |

- **Fähigkeitsprofil:** `SDK_START_CAPABILITIES` — der DSH-SDK kann Agent-Route-Optionen anwenden, während die übrigen Start-Features Kind-eigen bleiben (`src/index.ts` Zeilen 99–100).
- **Pfad-Validierung:** `dshBin` und jeder `patches`-Eintrag werden relativ zum Harness-Startverzeichnis aufgelöst und müssen reguläre Dateien sein; sonst `TypeError: subagent-dsh-sdk <field> must name an existing file: <path>` (`src/index.ts` Zeilen 88–97).
- **Session-Events:** keine eigenen Appends.

### 2.34 `packages/compaction/compaction`

- **npm-Paket:** `@deepseek-ai/dsh-compaction`
- **Zweck:** Abstrakter Compaction-Seam (`ctx.compaction`): definiert die drei Operationen, das Ergebniss-Vokabular und die log-only `compaction/*`-Session-Events. Kompaktiert selbst nichts.
- **`inject` / `Config` / `name` / `apply`:** alle nicht vorhanden (rein deklaratives Paket). Service über Modul-Augmentation `Context { compaction: CompactionEngine }` (`src/index.ts` Zeilen 88–91).
- **Serviceklasse:** `abstract class CompactionEngine extends Service` als `ctx.compaction`.
  - `abstract compactIfNeeded(agent: CompactionAgentContext, trigger: CompactionTrigger, signal: AbortSignal): Promise<CompactionResult | null>`
  - `abstract compactNow(agent: ManualCompactAgentContext, signal: AbortSignal, sourceCommandId?: CommandId): Promise<CompactionResult | null>`
  - `abstract compactRegion(start: SessionSeq, end: SessionSeq, agent: CompactionAgentContext, signal?: AbortSignal): Promise<CompactionResult>`
- **Weitere Exporte:** `ManualCompactionError extends Error` (Feld `readonly code: ManualCompactionErrorCode`), `CompactionId(id)`, `compactCheckpointSource(compactionId, sourceCommandId?)`, `isCompactCheckpointSource(source)`, `toolPairingBalancedBefore(session, seq)`, `toolPairingBalancedAfter(session, seq)`, `CompactionTrigger = 'pressure' | 'context-overflow'`, `ManualCompactionErrorCode = 'busy' | 'cancelled' | 'changed' | 'summary' | 'commit' | 'persistence'`, `CompactionAgentContext`, `ManualCompactAgentContext`, `CompactionResult`, `CompactionId`, `CompactionCheckpointSource`.
- **Deklarierte Session-Events:** `compaction/start` (`{ compactionId; sourceCommandId?; turn: number | null }`), `compaction/summary` (`{ compactionId; sourceCommandId?; summary; shadowedRange; shadowedSeqs; shadowedTokenCount; provider; model; maxTokens?; usage? }` plus `rawOutput`/`llmStreamCall`-Variante), `compaction/end` (`{ compactionId; sourceCommandId?; turn: number | null; error? }`), `compaction/prune` (`{ shadowedRange; shadowedSeqs; shadowedTokenCount }`) — `src/types.ts` Zeilen 17–91.
- **Cordis-Events:** `compaction/summary-error` (waterfall, `src/index.ts` Zeilen 92–107).
- **Harte Fakten:** Magic-String `'compact-checkpoint'` als Checkpoint-Marker (`src/checkpoint.ts` Zeile 19); `shadowedRange` ist eine **Surface-Positionsspanne**, kein numerischer Seq-Intervall — nach einem früheren Replace kann `start > end` gelten (`src/types.ts` Zeilen 107–115); `compaction/summary` und das unmittelbar folgende `user/message` müssen **adjacent** sein; das Replacement zu `compaction/prune` muss **synchron direkt nach** dem Event angehängt werden; kein modellgerichtetes Compaction-Tool wird registriert.

### 2.35 `packages/compaction/compaction-basic`

- **npm-Paket:** `@deepseek-ai/dsh-compaction-basic`
- **Zweck:** Ausgeliefertes Compaction-Backend: misst Token-Druck über `ctx.tokenMeter`, wählt eine balancierte ältere Surface-Spanne, holt eine LLM-Zusammenfassung und ersetzt die Spanne durch einen Checkpoint — automatisch wie auf Anforderung.
- **`inject`:** `static inject = ['llm', 'tokenMeter', 'sessions']` (`src/index.ts` Zeile 114).
- **`Config`** (Schema `src/index.ts` Zeilen 116–128; Werte-Defaults in `src/config.ts`):

  | Feld | Schema | Default (Wert) |
  |---|---|---|
  | `thresholdRatio` | `z.number()` | `0.8` (`DEFAULT_THRESHOLD_RATIO`) |
  | `headroomTokens` | `z.number().step(1).min(0)` | `65_536` |
  | `retainRatio` | `z.number()` | `0.16` (`DEFAULT_RETAIN_RATIO`) |
  | `retainTokens` | `z.number().step(1).min(0)` | keiner (Alternativ zu `retainRatio`) |
  | `summarizationProvider` | `z.string()` | `''` |
  | `summarizationModel` | `z.string()` | `''` |
  | `maxTokens` | `z.number().step(1).min(1)` | `headroomTokens` (also `65_536`) |
  | `compactionRetries` | `z.number().step(1).min(0)` | `1` |
  | `maxOverflowRetries` | `z.number().step(1).min(0)` | `1` |
  | `modelPolicies` | `z.array(modelPolicy)` (`provider` required, `model` required) | `[]` |
  | `auto` | `z.boolean()` | `true` |

- **Serviceklasse:** `BasicCompactionEngine extends CompactionEngine` (`src/index.ts` Zeile 113).
  - `constructor(ctx: Context, config: BasicCompactionConfig = {})`
  - `readonly config: ResolvedConfig`
  - `protected async summarize(input: SummarizationInput, agent: Agent, signal?: AbortSignal): Promise<SummaryResult>` (einziger Subclass-Hook)
  - `async compactIfNeeded(agent, trigger, signal): Promise<CompactionResult | null>`
  - `async compactRegion(start, end, agent, signal?): Promise<CompactionResult>`
  - `compactNow(agent, signal, sourceCommandId?): Promise<CompactionResult | null>`
  - Privat: `_registerAutomaticCompaction`, `regionDependencies`.
- **Weitere Exporte:** `resolveConfig`, `resolveTargetPolicy`, `resolveCompactSpec`, `TargetPressureConfigError`, `selectCompactableRange`, `compactSurfaceRegion`, `assertNoActiveCompaction`, `summarizeWithLlm`, `frameSummary`, `SummarizationInput`, `SummaryResult`, `CompactionPolicyConfig`, `ModelCompactPolicyConfig`, `BasicCompactionConfig`, `ResolvedRetention`, `ResolvedConfig`, `ResolvedTargetPolicy`, `ResolvedCompactSpec`.
- **Angehängte Session-Events:** `compaction/start` (`src/region.ts` Zeile 210), `compaction/end` (Zeilen 237, 245), `compaction/summary` (Zeile 491), `user/message` als Replacement (`surfaceOp: { op: 'replace', startSeq, endSeq }`, Zeile 506).
- **Cordis-Events:** `agent/pre-step` (`src/index.ts` Zeile 158), `agent/status` (Zeile 178), `session/event` (Zeile 184), `agent/request-error` (Zeile 190), `compaction/summary-error`-Waterfall (Zeile 442).
- **Harte Fakten:** Triggerrechnung `messageBudgetTokens = contextWindow - reservedCompletionTokens`; `pressureBudgetTokens = messageBudgetTokens - policy.headroomTokens`; `thresholdTokens = Math.floor(Math.min(contextWindow * thresholdRatio, pressureBudgetTokens))`; `retainTokens = Math.floor(messageBudgetTokens * retainRatio)`. Fehlertexte: `retainTokens (x) must be less than threshold tokens y`, `retainRatio and retainTokens are mutually exclusive`, `summarizationProvider and summarizationModel must be set together as an empty or non-empty pair`, `compaction still above threshold after ${spec.compactionRetries + 1} compaction attempts`, `summary is not smaller than the shadowed content`. Magic-Strings in `src/summarizer.ts`: `SUMMARY_OPEN_TAG = '<compacted-summary>'`, `SUMMARY_CLOSE_TAG = '</compacted-summary>'`, `CHECKPOINT_PREAMBLE = 'This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. …'`; `GenerateOptions.purpose = 'compaction'`. Nur Text-Blöcke überleben (`UNSUPPORTED_CONTENT` bei Bildausgabe). Duplicate-Key-Trenner ist `\u0000`.

### 2.36 `packages/compaction/compaction-tool-result-pruner`

- **npm-Paket:** `@deepseek-ai/dsh-compaction-tool-result-pruner`
- **Zweck:** Replay-sicheres, modellfreies Kopf/Mitte/Schwanz-Pruning für `tool/result`-Surface-Nodes; das Original bleibt im append-only Log und wird über `sourceEventSeqs` zitiert.
- **`inject`:** `static inject = ['tokenMeter']` (`src/index.ts` Zeile 47).
- **`Config`** (`src/index.ts` Zeilen 49–53; Defaults in `src/config.ts`): `thresholdChars` Default `8192`, `headChars` Default `4096`, `tailChars` Default `1024`.
- **Serviceklasse:** `ToolResultPruner extends Service` als `ctx.toolResultPruner`.
  - `readonly config: ResolvedConfig`
  - `measureContent(blocks: readonly ContentBlock[]): number`
  - `pruneContent(blocks: readonly ContentBlock[]): ContentBlock[] | null`
  - `pruneSession(session: Session): PruneResult`
- **Weitere Exporte:** `PRUNE_MARKER = '\n\n[... tool result middle pruned ...]\n\n'`, `DEFAULTS = { thresholdChars: 8192, headChars: 4096, tailChars: 1024 }`, `codePointLength(text)`, `resolveConfig(config?)`, `ToolResultPruneConfig`, `ResolvedConfig`, `PrunedEntry`, `PruneResult`.
- **Angehängte Session-Events:** `compaction/prune` (`src/index.ts` Zeile 160) und das Replacement-`tool/result` (`surfaceOp: { op: 'replace', startSeq: seq, endSeq: seq }`, Zeile 165).
- **Harte Fakten:** Budget-Invariante `headChars + codePointLength(PRUNE_MARKER) + tailChars <= thresholdChars` (Fehlertext `headChars + marker + tailChars (X) must be at most thresholdChars (Y)`); Slicing erfolgt pro Unicode-Codepunkt (kein Surrogatpaar-Split), Graphemcluster dürfen weiterhin getrennt werden; Nicht-Text-Blöcke kosten `0`; ein zweiter `pruneSession`-Aufruf liefert `{ pruned: [], charsRemoved: 0 }`.

### 2.37 `packages/compaction/compaction-image-offload`

- **npm-Paket:** `@deepseek-ai/dsh-compaction-image-offload`
- **Zweck:** Durable Bild-Offload für bildfähige Routen: überbudgetierte Request-Bilder werden durch Platzhalter ersetzt und der Aufruf wird erneut versucht.
- **`name`:** `'compaction-image-offload'`; **`inject`:** `['agents', 'sessions']` (`src/index.ts` Zeilen 18–19).
- **`Config`:** nicht vorhanden (`apply(ctx: Context): void`, Zeile 25) — ausdrücklich dokumentiert.
- **Exportierte Funktionen:** `apply(ctx)`, `offloadOldestImages(session, sourceEventSeqs, count): boolean`, `offloadMessageImages(message, indexes): Message`, `imageOffloadProjection: SessionMessageProjection<'image/offload'>`.
- **Angehängte Session-Events:** `image/offload` mit Payload `{ targets: ImageOffloadTarget[] }` (`src/image-offload.ts` Zeile 44), `ImageOffloadTarget { seq: SessionSeq; imageIndexes: number[] }`.
- **Cordis-Events:** `agent/request-error` (`src/index.ts` Zeilen 27–32, gibt bei Erfolg `{ kind: 'retry' }`), `compaction/summary-error` (Zeilen 33–40).
- **Message-Projection (kein `stateVersion`):** `ctx.sessions.registerMessageProjection(imageOffloadProjection)` (`src/index.ts` Zeile 26); Projektions-Typ-String `'image/offload'`.
- **Harte Fakten:** Ein Offload kostet einen fehlgeschlagenen Versuch, verbraucht aber **kein** Provider-Retry-Budget und protokolliert kein `llm/retry`. Nur `user/message` und `tool/result` sind zulässige Targets; `assistant/message` wird übersprungen. Validierungsfehler: `data must contain a nonempty targets array`, `each target must contain a seq and nonempty imageIndexes`, `duplicate target seq ${seq}`, `target seq ${seq} is not a current surface node`, `target seq ${seq} must be user/message or tool/result`, `imageIndexes must be strictly increasing non-negative safe integers`. `-0` wird als Index abgelehnt.

### 2.38 `packages/compaction/command-compact`

- **npm-Paket:** `@deepseek-ai/dsh-command-compact`
- **Zweck:** Menschorientierter Slash-Befehl `/compact` für explizite Session-Kompaktierung; der Handler ruft ausschließlich `ctx.compaction.compactNow(agent, signal, commandId)`.
- **`name`:** `'command-compact'`; **`inject`:** `['commands', 'compaction']` (`src/index.ts` Zeilen 11–12).
- **`Config`:** nicht vorhanden (`apply(ctx: Context): void`, Zeile 85).
- **Exportierte Funktion:** `apply(ctx)`.
- **Session-Events:** keine eigenen Appends; `command/run`/`command/done` kommen vom Command-Registry.
- **Harte Fakten:** `USAGE = 'Usage: /compact (no arguments)'`; Fehlerabbildung je Code: `busy` → `'Compaction is unavailable because this process has an active compaction, or the agent is not idle.'`, `cancelled` → `'Compaction cancelled.'`, `changed` → `'The history selected for compaction changed before it could be replaced. The attempt is recorded in the session log.'`, `summary` → `'Compaction could not produce a useful summary. The attempt is recorded in the session log.'`, `commit` → `'Compaction did not finish cleanly; some session history may have changed. Inspect the current session state before retrying.'`, `persistence` → `'Compaction finished, but the session could not be saved.'`; ohne History: `'No compactable history yet.'`; Erfolg: `` `Compacted ${result.shadowedSeqs.length} history items (~${result.shadowedTokenCount} tokens).` ``. Cancellation hat Vorrang vor der Fehlerabbildung (Zeile 75). Nur `ManualCompactionError` wird konvertiert, alles andere wird erneut geworfen.

### 2.39 `packages/preset/agent-preset`

- **npm-Paket:** `@deepseek-ai/dsh-agent-preset`
- **Zweck:** Deklariert eine Agent-Fähigkeitskomposition in Cordis-YAML; die Zeile liest `id`, `name`, `description`, `order`, `plugins` und registriert die Definition beim `agentPresets`-Registry-Service.
- **`inject`:** `static inject = ['agentPresets']` (`src/index.ts` Zeile 13); zusätzlich `static readonly [EntryGroup.key] = true` (Zeile 15).
- **`Config`** (`src/index.ts` Zeilen 16–23; `export type Config = PresetDefinition`, Zeile 9):

  | Feld | Typ | Default |
  |---|---|---|
  | `id` | `z.string().required()` | keiner (Pflicht) |
  | `name` | `z.string()` | keiner |
  | `description` | `z.string()` | keiner |
  | `order` | `z.number()` | keiner |
  | `plugins` | `z.array(z.any()).required()` | keiner (Pflicht) |

- **Klasse:** `export default class AgentPreset` — **kein** Cordis-Service; `constructor(ctx, config)` und `async* [Service.init]()` (registriert über `yield await this.ctx.agentPresets.register(this.config)`).
- **Session-/Cordis-Events:** keine eigenen.

### 2.40 `packages/preset/agent-preset-registry`

- **npm-Paket:** `@deepseek-ai/dsh-agent-preset-registry`
- **Zweck:** Nimmt Preset-Definitionen an, lädt je Definition eifrig eine registry-eigene Scope mit In-Memory-Loader-Baum, prüft Aktivierung und bindet Agents an die beim Beitritt genutzte Revision; hält die Auswahl im Session-Log fest.
- **`inject`:** `static inject = ['loader', 'sessionProjections']` (`src/index.ts` Zeile 53); dynamisch `ctx.inject(['settings'], …)` (Zeile 68).
- **`Config`** (`src/index.ts` Zeilen 54–57, Interface `src/preset.ts` Zeilen 13–18): `default: string` (`z.string().required()`, kein Default), `selectedDefault: Volatile<string | undefined>` (`z.string().volatile()`, kein Default; `defaultId` fällt auf `config.default` zurück).
- **Serviceklasse:** `AgentPresetRegistry extends TypertRemoteService` als `ctx.agentPresets`.
  - `get defaultId(): string`
  - `async register(definition: PresetDefinition): Promise<() => Promise<void>>`
  - `inspectCompositions(ctx?: Context): AgentPresetInspection[]`
  - `async list(): Promise<AgentPreset[]>`
  - `async remoteExportList(): Promise<AgentPresetRoster>` (`@Remote('list')`)
  - `async resolve(id?: string): Promise<AgentPreset>`
  - `readDocument(agentPreset: string): Promise<AgentPresetDocument>` (`@Remote('read')`)
  - `async mount(ctx: Context, id?: string): Promise<AgentPreset>`
  - `composeFrom(ctx: Context, parent: Context): string | undefined`
  - `composedPreset(ctx: Context): string | undefined`
  - `serviceFor<K extends string & keyof Context>(agent: { ctx: Context }, name: K): Context[K] | undefined`
  - `async recompose(ctx: Context, id: string): Promise<AgentPreset>`
  - `async select(agent: Agent, agentPreset: string): Promise<string>` (`@Remote('select')`)
  - `async acquireScope(id?: string): Promise<{ key: ScopeKey } & AsyncDisposable>`
  - `compositionInventory(): Promise<AgentPresetComposition[]>`
  - Privat: `activate`, `diagnostic`, `collect`, `generationFor`, `retain`, `bind`, `join`.
- **Weitere Exporte:** `agentPresetProjectionDefinition`, `entryListProblem`, `auditRows`, `leakedServices`, `mountPreset`, `presetDisplayText`, `isBuiltInPreset`, `activeCompositionModules`, `definitionComposition`, `mountedCompositionRows`, Typen `PresetDefinition`, `AgentPreset`, `PresetMount`, `RowAudit`, `AgentPresetInspection`, `AgentPresetComposition`, `AgentPresetCompositionRow`, `CompositionRowEnablement = boolean | 'conditional'`, `AgentPresetRow`, `AgentPresetRoster`, `AgentPresetDocument`, `BuiltInPresetCopyKey`, `Config`.
- **Angehängte Session-Events:** `agent-preset/selected` (`src/index.ts` Zeile 354).
- **Cordis-Events:** emittiert `agent-preset/selected` (`(sessionId, agentPreset)`, Zeile 70) und `tools/change` (Zeile 336); konsumiert `session/event` (Zeile 69).
- **Projektion:** Key `agentPreset`, `stateVersion: 1` (`src/session.ts` Zeilen 36, 43).
- **Remote-Fehlercodes:** `agent-preset/not-found`, `agent-preset/invalid`, `agent-preset/locked`.
- **Harte Fakten:** `Preset id must not be empty`; `Duplicate agent preset: ${definition.id}`; ein bereits gestarteter Turn wirft `agent-preset/locked` (`'This session has already started'`); `list()` sortiert nach `order ?? Infinity`, dann `id.localeCompare`; `read` rendert YAML über `dump(plugins, { schema: entryListSchema, noRefs: true, lineWidth: -1 })`; Presets sind **keine** Sicherheits-Sandboxes.

### 2.41 `packages/preset/persona`

- **npm-Paket:** `@deepseek-ai/dsh-persona`
- **Zweck:** Kompositions-autorierte Deployment-Persona-Section: überschattet in einer Agent-Scope den deployment-weiten Persona-Prefix und -Suffix.
- **`name`:** `'persona'`; **`inject`:** `['systemPrompt']` (`src/index.ts` Zeilen 24, 27).
- **`Config`** (`src/index.ts` Zeilen 30–54): `prefix` (`z.string().required()`, kein Default), `suffix` (`z.string().default('')`), `complete` (`z.boolean().default(false)`), `includeRuntimeContext` (`z.boolean().default(true)`).
- **Exportierte Funktion:** `apply(ctx: Context, config: Config): void`; Re-Export `PERSONA_PREFIX_SECTION`, `PERSONA_SUFFIX_SECTION`.
- **Session-/Cordis-Events:** keine. Nutzt `ctx.systemPrompt.section(...)` mit Orders `DEPLOYMENT_PERSONA_PREFIX`/`DEPLOYMENT_PERSONA_SUFFIX` und optional `suppressRuntimeContext()`.
- **Harte Fakten:** Die Zeile ist **scope-only** — global gemountet kollidiert sie mit der registry-eigenen Persona-Registrierung und scheitert laut. Ein leerer `prefix`/`suffix` lässt die Section beim Rendern weg, überschattet aber weiterhin die deployment-weite Section. `suffix` erbt den globalen Suffix nicht.

### 2.42 `packages/schedule/schedule`

- **npm-Paket:** `@deepseek-ai/dsh-schedule`
- **Zweck:** Host-weite durable Reminders (`ctx.schedule`): speichert Tasks in einer version-1-`schedule`-Storage-Domain, hält genau einen Host-Timer und liefert fällige Erinnerungen als Follow-up in die ursprüngliche Session.
- **`inject`:** `static inject = ['agents', 'sessions', 'storageDomain', 'sessionController', 'sessionPersistence']` (`src/index.ts` Zeile 100).
- **`Config`** (`src/index.ts` Zeilen 102–105, Interface 72–83): `deliveryHistoryDays` (`z.number().step(1).min(1).max(3650)`, Default `30`) und `deliveryHistoryRecords` (`z.number().step(1).min(1).max(10_000)`, Default `200`).
- **Serviceklasse:** `ScheduleService extends TypertRemoteService` als `ctx.schedule`.
  - `async [Service.init](): Promise<void>`
  - `async create(sessionId: SessionId, request: ScheduleCreateRequest, signal?: AbortSignal): Promise<ScheduleRecord>`
  - `async list(request: ScheduleListRequest): Promise<ScheduleRecord[]>` (`@Remote('list')`)
  - `async catalog(): Promise<ScheduleCatalogEntry[]>` (`@Remote('catalog')`)
  - `async history(request: ScheduleDeliveryHistoryRequest): Promise<ScheduleDeliveryHistoryResult>` (`@Remote('history')`)
  - `async delete(request: ScheduleDeleteRequest, signal?: AbortSignal): Promise<ScheduleDeleteResult>` (`@Remote('delete')`)
  - `async update(request: ScheduleUpdateRequest, signal?: AbortSignal): Promise<ScheduleUpdateResult>` (`@Remote('update')`)
  - Privat: `emitChanged`, `getDomain`, `reminderTargetRefusal`, `stopSessionTasks`, `serialize`.
- **Weitere Exporte:** `ScheduleRuntime` (Klasse, `requestDrive()`, `dispose()`), `scheduleDomain`, `scheduleTaskSchema`, `ScheduleTask`, `SCHEDULE_CHANGE_VERSION = 1`, `MIN_EVERY_INTERVAL_SECONDS = 60`, `MAX_TITLE_LENGTH = 120`, `CRON_SEARCH_HORIZON_YEARS = 400`, `MAX_TIMER_DELAY_MS = 2_147_483_647`, `REQUIRED_TITLE_MESSAGE`, `ScheduleId(value)`, `ScheduleLogError` (`code = 'corrupt_schedule_log'`), `ScheduleInputError` (Codes `invalid_prompt`, `invalid_selector`, `invalid_rule`, `invalid_time_zone`, `not_future`, `time_out_of_range`, `frequency_too_high`, `subagent_session`), `canonicalizeCronExpression`, `createAfterScheduleRecord`, `createAtScheduleRecord`, `createEveryScheduleRecord`, `createDailyScheduleRecord`, `createWeeklyScheduleRecord`, `createCronScheduleRecord`, `decodeScheduleChange`, `decodeScheduleRecord`, `foldScheduleEvents`, `isRecurringScheduleRecord`, `normalizeWeekdays`, `parseCronInput`, `parseWeeklyInput`, `renderReminderFraming`, `renderRecurringReminderBatchFraming`, `resolveEveryOccurrence`, `resolveDailyOccurrence`, `resolveWeeklyOccurrence`, `resolveCronOccurrence`, `resolveRecurringOccurrence`, `scheduleTitle`, `scheduleView`, `weeklyTime`, `appendDelivery`, `deliveryHistoryPage`, `retainedTitle`, `resolveScheduleUpdate`, `ReccurringOccurrence`, Typen `ScheduleRecord` (Union aus `after`/`at`/`every`/`daily`/`weekly`/`cron`), `OneShotScheduleRecord`, `RecurringScheduleRecord`, `LegacyScheduleRecord`, `ScheduleChange`, `ScheduleState = 'scheduled' | 'overdue'`, `ScheduleDeliveryMode = 'host'`, `ScheduleToolError`, `ScheduleCreateValue`, `ScheduleListValue`, `ScheduleDeleteResult`, `ScheduleDeleteValue`, `ScheduleTimingChange`, `ScheduleUpdateResult`, `ScheduleUpdateMiss`, `ScheduleUpdateValue`, `ScheduleDeliveryHistoryResult`, `ScheduleCatalogEntry`, `DeliveryRetentionBounds`.
- **Session-Events:** **keine eigenen Appends.** Gelesen/gefaltet wird `schedule/change` (`src/domain.ts` Zeilen 1226–1230; Listener `session/created` `src/index.ts` Zeilen 172–178).
- **Cordis-Events:** `session/created` (global, `src/index.ts` Zeile 166), `workspace/session-activity` (Waterfall, Zeilen 189–198, Familienbeitrag `{ kind: 'schedule' }`), `workspace/session-stop` (Zeilen 199–201), emittiert `schedule/changed` (Zeile 384).
- **Harte Fakten:** Cron ist ein Fünf-Feld-Dialekt (Minute/Stunde/Tag-des-Monats/Monat/Wochentag) mit Feldgrenzen minute `0-59`, hour `0-23`, day-of-month `1-31`, month `1-12`, day-of-week `0-7` (Sonntag `7` fällt auf `0`); `L`, `W`, `#`, Namen, Makros und Sekundenfelder werden abgelehnt. Zeitbereich nur UTC-Zieljahre `0001–9999`. `at` verbietet den Offset `-00:00`. `everySeconds` muss Safe Integer `>= 60` sein und `everySeconds * 1000` ebenfalls Safe Integer. History-`limit` liegt zwischen `1` und `100`. Retention: `floor = Date.parse(receipt.deliveredAt) - bounds.days * DAY_MS`, Filter `>= floor`, dann `.slice(-bounds.records)`. Es gibt **keine** Exactly-once-Garantie für Lieferungen (Crash nach Session-Flush kann dieselbe Erinnerung erneut liefern). Ausgabe-Id-Format bei Erstellung: `schedule-${randomUUID()}`. `subagent_session`-Meldung: `'This Session belongs to subagent routing, which never receives reminder delivery.'`

### 2.43 `packages/schedule/tool-schedule`

- **npm-Paket:** `@deepseek-ai/dsh-tool-schedule`
- **Zweck:** Modellgerichtete Reminder-Verwaltung (`schedule_create`, `schedule_list`, `schedule_update`, `schedule_delete`) über den Host-Service `ctx.schedule`.
- **`name`:** `'tool-schedule'`; **`inject`:** `['tools']` (`src/index.ts` Zeilen 24, 29); zusätzlich dynamisch `ctx.inject(['schedule'], …)` (Zeile 436) — ohne Host-Service bleiben die Tools **unregistriert**.
- **`Config`:** nicht vorhanden (ausdrücklich dokumentiert).
- **Registrierte Tools:** `schedule_create` (Zeile 446), `schedule_list` (Zeile 484, ohne Parameter), `schedule_delete` (Zeile 505, `id` required), `schedule_update` (Zeile 531, `id` required; optional `title`, `prompt`, `every_seconds`, `daily`, `weekly`, `cron`, `at`). Keines deklariert `isConcurrencySafe` → alle vier **exklusiv**.
- **`schedule_create`-Parameter:** `prompt` (required), `title` (required), `after_seconds?`, `every_seconds?`, `daily?` (`time`+`time_zone` required), `weekly?` (`time`, `time_zone`, `weekdays` required), `cron?` (`expression`, `time_zone` required), `at?` (`oneOf[string, { date, time, time_zone }]`).
- **Session-Events:** keine eigenen Appends; Storage-Effekte laufen über `ctx.schedule`.
- **Harte Fakten:** Delegations-Guard läuft vor Selektor- und Identitätsprüfungen; `delegationDepthOf(agent) === 0` ist die Bedingung, Refusal `{ code: 'subagent_session', message: 'A delegated subagent cannot use reminders.' }`. Ohne `exec.agent` liefern alle vier Tools `{ code: 'internal_error', message: 'The schedule operation failed.' }`. Ein abgebrochenes `exec.signal` vor dem Service-Aufruf ergibt ebenfalls `internal_error`. `after_seconds` ist **create-only**. Validierungsfehler: `'schedule_create accepts exactly one of after_seconds, at, every_seconds, daily, weekly, or cron.'`, `'schedule_update accepts at most one of at, every_seconds, daily, weekly, or cron.'`, `'schedule_update needs a new title, prompt, or one of at, every_seconds, daily, weekly, or cron.'`, `'every_seconds must be at least 60.'`, `title must be at most 120 characters.`. `renderValue` liefert genau einen Textblock mit `JSON.stringify(value)`. Card-Titel: `'Create reminder'`, `'List reminders'`, `'Delete reminder'`, `'Update reminder'`.

### 2.44 `packages/feedback/command-feedback`

- **npm-Paket:** `@deepseek-ai/dsh-command-feedback`
- **Zweck:** Log-only Session-Feedback: ein `feedback/record`-Event, das Typert-Remote `sessionFeedback` und der menschorientierte Slash-Befehl `/feedback`.
- **`name`:** `'command-feedback'`; **`inject`:** `['commands']` (`src/index.ts` Zeilen 40–41). Die Serviceklasse trägt zusätzlich `static inject = ['sessions']` (Zeile 86).
- **`Config`:** nicht vorhanden.
- **Serviceklasse:** `SessionFeedbackService extends TypertRemoteService` als `ctx.sessionFeedback`.
  - `record(request: SessionFeedbackRecordRequest): Promise<SessionFeedbackRecordResult>` (`@Remote('record')`)
- **Weitere Exporte:** `recordFeedback(session: Session, entry: FeedbackRecord): void`, `apply(ctx)`, `FEEDBACK_CATEGORIES`, `FeedbackCategory`, `FeedbackRecord`, `SessionFeedbackRecordRequest`, `SessionFeedbackRecordValue`, `SessionFeedbackSessionNotFound`, `SessionFeedbackRecordResult`.
- **Kategorien (Reihenfolge verbatim):** `['task-result', 'instruction-following', 'product-interaction', 'service-stability', 'resource-cost', 'security-privacy-permission', 'other']`.
- **Angehängte Session-Events:** `feedback/record` (`src/index.ts` Zeilen 60–63).
- **Cordis-Events:** keine eigenen.
- **Harte Fakten:** `USAGE = 'Usage: /feedback <text>'`; leerer Input → `{ kind: 'error', text: 'Feedback text is required. Usage: /feedback <text>' }`; Erfolgsmeldung `` `Feedback recorded for session ${session.id}\nAnonymous user: ${getOrCreateAnonymousUserId()}.` ``; der Produzent trimmt den Text und **lässt** einen leeren Text aus; kein Parsing, keine Kürzung; `recordInput: false` verhindert Duplikation des Texts in `command/run`; fehlende Live-Session → `{ code: 'session-not-found' }`; der Append ist eager, aber ungeflusht.

### 2.45 `packages/feedback/message-feedback`

- **npm-Paket:** `@deepseek-ai/dsh-message-feedback`
- **Zweck:** Kanonische Session-Log-Bewertungen und -Notizen für finalisierte Assistant-Messages; jede Erstellung, Änderung und Löschung liegt als log-only Event im Log.
- **`inject`:** `static inject = ['sessionPersistence', 'sessions']` (`src/index.ts` Zeile 119).
- **`Config`** (`src/index.ts` Zeilen 40–43, Schema 122–124): `maxNoteBytes` (`s.number().step(1).min(1).required()`, **kein Default**; das Web-Bundle liefert `8192`).
- **Serviceklasse:** `MessageFeedbackService extends TypertRemoteService` als `ctx.messageFeedback`.
  - `protected [Service.init](): void`
  - `list(request: MessageFeedbackListRequest): Promise<MessageFeedbackListResult>` (`@Remote('list')`)
  - `put(request: MessageFeedbackPutRequest): Promise<MessageFeedbackPutResult>` (`@Remote('put')`)
  - `delete(request: MessageFeedbackDeleteRequest): Promise<MessageFeedbackDeleteResult>` (`@Remote('delete')`)
  - Privat: `withSession`, `resolveNote`, `versionConflict`, `enqueue`.
- **Exportierte Typen:** `MessageFeedbackRating = 'positive' | 'negative'`, `MessageFeedbackItem`, `MessageFeedbackPut`, `MessageFeedbackDelete`, `MessageFeedbackFailure` (Codes `session-not-found`, `target-not-found`, `version-conflict`, `note-blank`, `note-too-large`), `MessageFeedbackSuccess<T>`, `MessageFeedbackRejected<E>`, `MessageFeedbackListRequest`, `MessageFeedbackListValue`, `MessageFeedbackPutRequest`, `MessageFeedbackDeleteRequest`, `MessageFeedbackDeleteValue`, `MessageFeedbackListResult`, `MessageFeedbackPutResult`, `MessageFeedbackDeleteResult`, `MessageFeedbackVersion`.
- **Angehängte Session-Events:** `feedback/message-put` (`src/index.ts` Zeile 196) und `feedback/message-delete` (Zeile 212).
- **Cordis-Events:** emittiert `feedback/committed` (Modus **parallel**, `src/index.ts` Zeile 271, nur im kalten Pfad nach erfolgreichem Flush).
- **Harte Fakten:** `maxNoteBytes` muss positiver Safe Integer sein, sonst `TypeError('message-feedback: maxNoteBytes must be a positive safe integer')`. Notizregeln: nur Whitespace → `note-blank`; `Buffer.byteLength(note, 'utf8') > maxNoteBytes` → `note-too-large` mit `{ maxBytes, actualBytes }`. CAS über `ifVersion`; No-op bei gleichem `rating`/`note`/`category` ohne Event. `version` ist eine `randomUUID()`; `updatedAt` ist monoton (`Math.max(now, existing.updatedAt)`). Nur nicht-leere Assistant-Projektionen aus **append**-Origin-Events sind gültige Targets. Nur Live- und Cold-Pfad: der Live-Pfad verlangt `sessions.flush(live)` und verifiziert anschließend die Header-Identität über `sessionPersistence.open(sessionId, 'read')`. Kalte Mutationen halten einen Write-Handle über Read, Vergleich, Append, Flush und Close. Loop-Overhead: jeder `list`/`put`/`delete` scannt das vollständige Event-Log. Ein Fork startet **ohne** geerbte Feedback-Einträge.

---

## 3. Der Agent-Loop im Detail

Alle Aussagen aus `packages/core/agent-loop/src/agent.ts` (Loop), `src/index.ts` (Fabrik/Projektionen), `src/tool-calls.ts` (Scheduler), `src/inbox.ts` (Inbox) und `src/runtime-context.ts` (Prompt-/Context-Projektionen), ergänzt um `packages/core/agent/src/runtime-types.ts` (Eventvokabular) und `packages/core/session/src/types.ts` (`TurnEndReason`).

### 3.1 Phasen-Zustandsmaschine

`ReactLoopAgent` (`src/agent.ts` Zeile 98) hält genau eine `Phase` (Zeile 42):

| Phase | Felder | Bedeutung |
|---|---|---|
| `idle` | `lastTurn: number` | kein Driver aktiv; `status === 'idle'` |
| `maintenance` | `abort: AbortController`, `lastTurn`, `wakeRequested: boolean` | eine Nicht-Turn-Wartungsaufgabe läuft; öffentlicher Status bleibt `idle` |
| `running` | `abort: AbortController`, `turn: number`, `step: number`, `wakeRequested: boolean` | Treiber aktiv; `status === 'running'` |

`status` ist ausschließlich `'idle' | 'running'` (`src/agent.ts` Zeile 140): `maintenance` zählt als `idle`. Jeder Phasenwechsel läuft über `setPhase(next)` (Zeile 145), das den Status vergleicht und bei Änderung `agent/status` mit der **Ziel**-Status emittiert. Disposal ist **kein** dritter Status.

### 3.2 Wie ein Turn aufgeht und schließt

**Aufgehen:**
1. `send(message, target, wakeup)` (Zeile 154) klassifiziert den Aufruf: `wakingAfterAbort = wakeup && phase.kind !== 'idle' && phase.abort.signal.aborted`. Dies wird **vor** dem Inbox-Splice erfasst, damit ein reentranter Cancel aus einem Splice-Observer die Einstufung nicht umwerfen kann.
2. Ist `wakingAfterAbort` wahr, wird der Ziel-Inbox-Kanal auf `'next-turn'` umgebogen; die Nachricht kann nicht in eine bereits abgebrochene Aktivität eintreten.
3. `inbox.splice(resolvedTarget, Infinity, 0, [message])` schreibt den Splice durable.
4. Bei `wakeup` folgt `wakeDriver(wakingAfterAbort)`.
5. `wakeDriver` (Zeile 214) startet nur im Phasenstand `idle` einen Treiber: es setzt `activityDone`, wechselt in `running` mit frischem `AbortController`, `turn = phase.lastTurn` und `step = 0` und ruft `this.loopCtx.agents.withInitiator(this, () => this.kick())`. Ist der Agent nicht idle, wird der Weckruf **gelatcht** (`wakeRequested = true`), außer die Aktivität wurde mit `kind: 'disposed'` abgebrochen — Disposal latcht nie, damit der Teardown auf keinen Modell-Turn wartet.
6. `kick()` (Zeile 252) ruft in einer Schleife `while (await this.turn()) {}`. Fehler werden am Treiberrand enthalten. Im `finally` geht die Phase zurück auf `idle` mit `lastTurn = turn`; ein gelatchter Weckruf startet nur dann einen neuen Treiber, wenn die Inbox noch Arbeit hat.

**Turn-Körper (`turn()`, Zeile 298):**
1. Vorbedingung: Phase muss `running` sein, sonst `throwError(new Error('agent "…": turn without driver reservation'))`.
2. `signal.throwIfAborted()`; `turn = phase.turn + 1`.
3. `session.append('turn/start', { turn })`. Scheitert der Append, wird der Fehler über `throwError` gemeldet.
4. `phase.turn = turn`; lokale Variablen `turnEnds: TurnEndReason | null = null` und `target: InboxTarget = 'next-turn'`.
5. Stepschleife, siehe 3.3.
6. `finally`: `session.append('turn/end', { turn, reason: turnEnds! })`. Jeder Ausstiegspfad hat zu diesem Zeitpunkt ein Turn-Ende gesetzt.
7. Nach dem Turn: hat die Inbox keine Arbeit mehr → `return false` (Treiber endet). Sonst frischer `AbortController` (macht ein Latch am alten Controller ungültig), `phase.wakeRequested = false`, `phase.step = 0`, `return true` (nächster Turn).

### 3.3 Stepschleife, Batching und Ordering

Pro Turn-Iteration (`src/agent.ts` Zeilen 315–367):
1. `signal.throwIfAborted()`; `step = phase.step + 1`.
2. `decision = await this.preStep(target, { turn, step })`.
3. `decision.kind === 'reject'` → `turnEnds = { kind: 'blocked' }`, sofortiges `return false` (Turn endet ohne Step).
4. Ist bereits ein Turn-Ende bekannt **und** ist die Step-Entscheidung leer (`messages.length === 0`) → Schleife endet (`break`), der Turn schließt.
5. Ist `phase.step === 0` (erster Step des Turns) und die Entscheidung leer → `turnEnds = { kind: 'completed' }`, `return false`. Kommentar: eine entfernte Wecknachricht oder eine zu leer umgeschriebene `enter`-Entscheidung besitzt weiterhin die Turn-Grenze, verbraucht aber keinen Modellaufruf.
6. `signal.throwIfAborted()`; `session.append('step/start', { turn, step })`; `phase.step = step`.
7. `toolRecovery = new ToolCallRecovery()`; ein Listener `session/event` beobachtet alle Events dieser Session und speist `toolRecovery.observe(event)`.
8. `stepEnd = await this.step(decision)`.
9. **max-tokens ist sticky:** `if (turnEnds === null || turnEnds.kind !== 'max-tokens') turnEnds = stepEnd` — ein späterer regulär kompletter Step darf das Turn-Ergebnis nicht herabstufen.
10. Bei einem Fehler werden die von `toolRecovery.results()` gelieferten synthetischen `tool/result`-Events nachgeschrieben (mit `surfaceOp: 'append'` und geerbten `sourceEventSeqs`); scheitert auch das, entsteht ein `AggregateError([error, recoveryError], 'Step failed and its pending tool results could not be recorded', { cause: error })`.
11. `finally`: Recovery-Listener entfernen und `session.append('step/end', { turn, step })`.
12. `signal.throwIfAborted()`.
13. **Turn-Stop-Grenze:** ist ein Turn-Ende bekannt **und** ist `inbox.nextStep.length === 0`, dann `await this.dispatch.serial('agent/turn-stopping', { turn, signal })`, danach erneut `signal.throwIfAborted()`. Ein Listener, der widerspricht, ruft `agent.steer(...)`; die Maschine liest die Inbox danach erneut.
14. Ist danach weiterhin ein Turn-Ende bekannt und `nextStep` leer → `break` (Turn schließt). Sonst `target = 'next-step'` und weiter mit dem nächsten Step — **Steering setzt die Schleife fort**.

**Tool-Call-Batching und -Ordering** (`src/tool-calls.ts`):
- `executeToolCalls(ctx, turn, step, toolCalls, signal, acceptContext)` erhält die Tool-Aufrufe in **Modellreihenfolge** und plant jeden als `PlannedCall { block, exec }`, wobei `exec = { callId, name, arguments, agent, signal }` und `agent = ctx.agents.requireInitiator()`.
- Argumente werden **einmal** geparst: `parseArguments(raw)` liefert bei leerem String `{}`, bei gültigem JSON das Objekt, bei ungültigem JSON den **Rohstring** unverändert.
- Die äußere Schleife (Zeile 85) committet zuerst („Commit before classifying again so registry changes affect unstarted calls"), klassifiziert dann den nächsten Aufruf über `ctx.tools.executionMode(first.exec).kind`.
- **Parallel vs. exklusiv:** ist der Modus `parallel`, wird der gesamte Rest als Gruppe genommen (`planned.slice(next)`); ist er `exclusive`, besteht die Gruppe aus genau einem Aufruf und wirkt als **Barriere**.
- Innerhalb der Gruppe reklassifiziert `fillPool` (Zeile 199) jeden folgenden Aufruf erneut: solange `!aborted && nextToStart < group.length && inFlight.size < maxParallelToolCalls`, wird geprüft, ob der nächste Aufruf unter einer parallelen Gruppe noch `parallel` ist — andernfalls bricht das Füllen ab, und der exklusive Aufruf bleibt für die **nächste** Barriere stehen.
- `maxParallelToolCalls` wird pro Gruppe über `ctx.agentLoop.config.maxParallelToolCalls.get()` gelesen.
- **Ordering:** Dispatch und Pre-Execute dürfen überlappen; Policy, Ergebnisse und Ergebnis-Context bleiben **modellgeordnet**. `commitReady()` (Zeile 147) committet nur über zusammenhängende Slots (`while (committed < group.length)`) und verwendet `Promise.race(inFlight.values())`, um den nächsten gesetzten Slot zu finden.
- Jeder gestartete Aufruf erhält zuerst sein `tool/call`-Event (`appendToolCall` gibt die Seq zurück; der Kommentar spricht von der „Started-Slot-Seq, damit das Ergebnis sie zitieren kann"). Das Ergebnis wird über `appendToolResult` mit `{ surfaceOp: 'append', sourceEventSeqs: [callSeq] }` an `session.append('tool/result', …)` übergeben.
- Ergebnis-Context aus `result.additionalContexts` wird über den `acceptContext`-Callback an den Loop gegeben; dieser schiebt ihn per `inbox.splice('next-step', inbox.nextStep.length, 0, [context])` an das nächste Step-Ende.
- `concluded ||= result.concludesTurn === true` — ein erfolgreiches Ergebnis mit `concludesTurn` beendet den Turn am Ende des Steps.

### 3.4 `TurnEndReason`-Werte

Definiert als merge-erweiterbare Summe in `packages/core/session/src/types.ts` (`TurnEndReasonMap`, Zeilen 201–229):

| `kind` | Payload | Wer erzeugt es |
|---|---|---|
| `completed` | — | Loop: Step ohne Tool-Calls, ein `concludesTurn`-Ergebnis, oder ein erster Step, dessen Entscheidung leer wurde |
| `aborted` | `reason: TurnEndCancelCause` | Loop: wenn `abortedCancelCause(signal)` vorliegt (Abbruch durch `cancel()`); `TurnEndCancelCause = AgentCancelCause \| { kind: 'legacy' }` |
| `blocked` | — | Loop: `agent/pre-step`-Waterfall ergab `{ kind: 'reject' }` |
| `error` | `error: LlmFailure` (immer strukturiert: `LlmError`-Fakten verbatim oder `{ message: errorChain(error), code: 'UNKNOWN' }`) | Loop |
| `max-tokens` | — | Loop: mindestens ein Step erreichte das Output-Token-Limit; **sticky** |
| `interrupted` | — | Nicht der Loop: Agent-Loop-Resume schreibt diesen Closer für ein gespeichertes Log, dessen letzter Turn nie endete; `session-query` synthetisiert ihn bei Kaltlesungen |
| `forked` | — | Nicht der Loop: Fork-Seed-Konstruktion schließt einen am Fork-Schnittpunkt offenen Turn |

### 3.5 Abbruch (`AgentCancelCause`, Abbruchpfade)

**Vokabular** (`packages/core/session/src/types.ts` Zeilen 189–193):
`AgentCancelCause = { kind: 'user' } | { kind: 'parent' } | { kind: 'hook'; reason: string } | { kind: 'disposed' }`.

**`ReactLoopAgent.cancel(cause, options = {})`** (`src/agent.ts` Zeile 175):
1. Ohne `options.keepInbox` wird `this.inbox.clear()` aufgerufen und — falls nicht idle — `phase.wakeRequested = false` gesetzt.
2. Ist die Phase nicht `idle`, wird `phase.abort.abort(cause)` ausgeführt. Der erste Cause gewinnt für diese Aktivität; ohne aktive Aktivität ist der Cancel ein No-op und bewaffnet keine spätere Arbeit.

**Cause-Extraktion** (`abortedCancelCause(signal)`, Zeile 80): liest `signal.reason`, akzeptiert genau die geschlossenen Varianten und kopiert **nur** die von `turn/end` protokollierten Felder (`user`, `parent`, `disposed` ohne Zusatz; `hook` mit `reason`). Begründung im Code: Nodes `fetch` schreibt ein `stack`-Feld auf das Reason-Objekt, das `Session.append` entweder protokollieren würde oder als nicht-JSON-fähig ablehnen müsste.

**Abbruchpfade im Detail:**
- **Während eines Turns:** `signal.throwIfAborted()` an allen Grenzen (vor `turn/start`, vor/nach `preStep`, vor `step/start`, vor dem Stream, nach dem Stream, nach dem Step, nach `agent/turn-stopping`). Der `catch` in `turn()` prüft zuerst `abortedCancelCause(signal)`: liegt ein Cause vor, wird `turnEnds = { kind: 'aborted', reason: cause }` gesetzt und der Fehler weitergereicht; sonst `turnEnds = { kind: 'error', … }`.
- **Während eines Streams:** `live.settle('assistant/message', …)` mit `interrupted: true`, falls `live.interruptedBlocks()` Inhalt liefert — sonst `live.settle('assistant/attempt', …)`. Danach wird der Fehler erneut geworfen.
- **Während der Tool-Ausführung:** der Scheduler prüft `signal.aborted` nach jedem `settle` und nach dem Pool-Füllen; gestartete Aufrufe werden gedrained und geordnet committet, danach erhalten alle **übrigen** Modellaufrufe in Modellreihenfolge ein synthetisches Ergebnis über `appendSkippedToolCall` mit Code `ABORTED_BEFORE_DISPATCH` und Text `'Error: tool call aborted before dispatch'`.
- **Disposal:** `AgentLoop.prepare`'s Teardown ruft `machine.cancel({ kind: 'disposed' })` und danach `await machine.whenIdle()` (`src/index.ts` Zeilen 563–566). Disposal ist damit „ein Dispose-Cause-Cancel gefolgt von Quieszenz".
- **Archivierung:** `installTurnArchiveAdmission` (`packages/core/agent/src/archive-admission.ts`) reagiert auf `workspace/session-stop` mit `agent.cancel({ kind: 'user' })` — **ohne** `keepInbox`, damit die Warteschlange mit protokolliertem Inbox-Splice verworfen wird, und ohne auf Settlement zu warten.
- **Erzeugungsabbruch:** `AgentRegistry.create/resume` reichen ein optionales `signal` durch; der Loop fust drei Quellen in einen `AbortController` (Aufrufer-Signal, Owner-Fiber-Unload, Factory-Teardown) und normalisiert Nicht-`Error`-Gründe zu `new Error('agent "<id>" creation aborted', { cause })`.

### 3.6 Das Inbox-/Steering-Modell

**Zwei geordnete Listen** (`InboxTarget = 'next-turn' | 'next-step'`), gehalten als durable Projektion `inbox` (siehe Abschnitt 7). Der Konstruktor liest den letzten Turn aus der Projektion `turnBoundary` und startet mit `phase = { kind: 'idle', lastTurn }`.

**Öffentliche Fassade (Loop):**
| API | Wirkung |
|---|---|
| `send(message, target, wakeup)` | Splice in den Zielkanal; optionaler Weckruf (siehe 3.2) |
| `followup(message)` | `send(message, 'next-turn', true)` — die Nachricht wird die **einzige** gewöhnliche Nachricht ihres eigenen Turns |
| `steer(message)` | `send(message, 'next-step', true)` — läuft beim nächsten Step-Grenzpunkt |
| `inject(message)` | `send(message, 'next-step', false)` — **weckt nicht**; ein laufender Treiber beansprucht es beim nächsten Step, ein idler Treiber lässt es liegen |

**Inbox-Implementierung `ReactLoopInbox`** (`src/inbox.ts`):
- Getter `nextTurn`, `nextStep`, `hasPending` lesen den Projektionszustand über `projections.stateOf(session, 'inbox')`; fehlt die Registrierung, wirft der Zugriff mit `agent "<id>" cannot read inbox state: its projection registration is not active`.
- `claim(target, turn)`: entfernt zuerst den **kompletten** `next-step`-Batch, dann — bei `target === 'next-turn'` — **genau eine** Nachricht aus `next-turn`. Die zurückgegebene Reihenfolge ist also: zuerst `next-step`-Inhalt, dann die beanspruchte Turn-Nachricht. Anschließend wird für jede Nachricht `agent/inbox/claimed` mit `{ message, turn }` emittiert.
- `splice(...)` normalisiert wie `Array.prototype.splice`: `start` wird getruncated, negative Werte zählen vom Ende, `deleteCount` wird auf `[0, länge - start]` geklemmt. Ein No-op-Splice (nichts entfernt, nichts eingefügt) schreibt **kein** Event.
- `mutate(...)` prüft die Eindeutigkeit von Nachrichten-Ids über beide Listen und wirft `message "<id>" is already pending`.
- Das angehängte Event ist `agent/inbox/spliced` mit `{ target, start, removedCount?, inserted, outcome? }`; `outcome: 'canceled'` wird gesetzt, wenn `discardRemoved` gilt und tatsächlich etwas entfernt wurde. Nach dem Append werden `agent/inbox/discarded` (für jede entfernte Nachricht, nur bei `discardRemoved`) und `agent/inbox/inserted` (für jede tatsächlich eingefügte Nachricht aus `event.data.inserted`) emittiert.
- `clear()` leert `next-step` **vor** `next-turn`.

**Step-Grenzpunkt (`preStep`, `src/agent.ts` Zeile 267):**
1. `claimed = this.inbox.claim(target, turn)` — Inbox-Entnahme mit Event-Emission.
2. `assembly = await this.loopCtx.systemPrompt.assemble(assembleContextFor(this, signal))`.
3. `signal.throwIfAborted()`.
4. `decision = await this.dispatch.waterfall('agent/pre-step', { messages: claimed, turn, step, signal }, next)`; der Default von `next()` rendert die Assembly, projiziert den Runtime-Context und gibt `{ kind: 'enter', messages: context === undefined ? claimed : [...claimed, context] }` zurück.
5. `signal.throwIfAborted()`; bei `reject` Rückgabe der Entscheidung, sonst `{ ...decision, assembly }`.

**Steering-Semantik:** `agent/turn-stopping` ist der Punkt, an dem ein Listener per `agent.steer(...)` einen weiteren Step erzwingen kann (siehe 3.3 Schritt 13/14). Der Code betont: „Data decides, so listener order cannot change the outcome." Kommt während des Turns `additionalContexts` oder konkurrierendes Steering hinzu, läuft der Step weiter; der Turn schließt erst, wenn die Inbox leer ist.

### 3.7 Runtime-Context und System-Prompt pro Step

**Assembly pro Step:** `preStep` assembliert den Prompt **pro vorgeschlagenem Step** (`src/agent.ts` Zeile 272). Innerhalb von `step()` wird der Context erneut aufgefrischt: `const currentContext = this.loopCtx.systemPrompt.refreshContext(assembly, assembleContextFor(this, signal))` (Zeile 411). Anschließend werden die Context-Sections gerendert (`renderContextSections`) und über `runtimeContext.project(joinContextSections(sections), sections)` in eine unverbindliche Snapshot-Nachricht projiziert.

**`SystemPromptProjection`** (`src/runtime-context.ts` Zeile 65) entscheidet, wie der gerenderte Prompt auf die Surface gelangt, ohne den Commit zu besitzen:
- `systemNodes()` sammelt in Surface-Reihenfolge alle überlebenden `system/message`-Knoten mit ihrer Textlänge (leerer Content zählt als `''`).
- Gibt es **keinen** Knoten, wird `[{ message: createSystemMessage(rendered), intent: { surfaceOp: 'append' } }]` geliefert — der erste Prompt, auch ein leerer, reserviert Surface-Knoten 0.
- Bei `!input.inHistory || input.startsSeries || rendered.length === 0` wird normalisiert: alle nicht-leeren späteren Knoten werden auf `''` gesetzt und der Kopf bei Bedarf auf den gerenderten Text umgeschrieben (jeweils per `{ surfaceOp: { op: 'replace', startSeq, endSeq }, sourceEventSeqs: [seq] }`).
- Andernfalls: entspricht der letzte nicht-leere Knoten dem gerenderten Text → keine Änderung (`[]`); sonst wird ein **neuer** `system/message`-Knoten angehängt (fähige, fortlaufende Serie).
- `SystemPromptDecisionInput` ist `{ inHistory: boolean; startsSeries: boolean }`. `inHistory` kommt aus `preparedCall?.systemPromptUpdate === 'in-history'`; `startsSeries` wird aus `decision.startsRequestSeries === true`, einer geänderten Surface-Generation oder einem Tool-Wechsel auf einer Route ohne Tool-Update-Unterstützung gebildet (`src/agent.ts` Zeilen 416–421).

**`RuntimeContextProjection`** (`src/runtime-context.ts` Zeile 114):
- Beim Konstruktor wird die Projektion **einmal** restauriert: die Events werden neueste-zuerst durchlaufen; das erste `user/message` mit `source.kind === 'runtime-context'`, das ein aktueller Surface-Knoten ist, wird als `retained = { seq, text }` übernommen; existiert überhaupt ein eigener Snapshot und keiner ist retained, wird `null` gesetzt.
- Ein `session/event`-Listener folgt danach autoritativ: ein neues eigenes `user/message` setzt `retained` neu; ein Replacement-Surface-Event, dessen `sourceEventSeqs` die retained-Seq enthält, setzt `retained = null`.
- `project(current, sections)` erzeugt nur bei Unterschied eine Nachricht: `retained === undefined && current.length === 0` → `undefined`; sonst ist der Snapshot bei leerem Context der Festtext `'Current runtime context: none. Earlier runtime-context snapshots no longer apply.'`; entspricht `retained.text` dem Snapshot → `undefined`; sonst wird eine `user/message` mit `source: { kind: 'runtime-context' }` (plus `form: 'snapshot'` und `sections`, sofern Sections beitrugen) zurückgegeben.

**Admission im `step()`** (Zeilen 425–440): nur beim **ersten** Versuch werden die `decision.messages` protokolliert; eine Nachricht mit `source.kind === 'runtime-context'` wird durch den aktuellen Context **ersetzt** und nur einmal eingefügt (`contextAdmitted`-Flag). Ein restlicher Context, der noch nicht admitted wurde, wird nachgezogen. Jede Modell-nachricht geht als `session.append('user/message', message, { surfaceOp: 'append' })` ins Log; die `system/message`-Commits laufen mit ihrem `intent` aus `SystemPromptProjection.project`.

**Request-Aufbau pro Step (`prepareRequest` + `buildRequest`, Zeilen 564–704):**
1. Route und Seed-Config: `route = { provider: options.provider ?? '', model: options.model ?? '' }`. Ein persistierter `reasoningEffort` wird **nur** restauriert, wenn er zu genau dieser Route gehört und nicht als Adapter-Default markiert ist (`adapterDefaults.reasoningEffort !== true`). `maxTokens` kommt aus `options.maxTokens`.
2. Bei bereits protokolliertem Header dient `requestProposal(persistedHeader)` als Seed: `adapterDefaults`-markierte Felder (`reasoningEffort`, `maxTokens`) werden **entfernt**, damit Plugins den nächsten Config-Vorschlag bilden können. Der Seed wird `structuredClone`'d und `deepFreeze`'d.
3. `proposedConfig = await this.dispatch.waterfall('agent/request', { turn, step, signal }, () => seed)`.
4. `signal.throwIfAborted()`; fehlt `provider` oder `model`, wirft der Loop `agent "<id>" has no provider/model: set AgentOptions.provider and AgentOptions.model or supply both via the agent/request waterfall`.
5. `preparedCall = await this.loopCtx.llm.prepareCall(proposedConfig, signal)`; `config = preparedCall.config`. Nur ein `LlmError` mit Code `NO_ADAPTER` wird geschluckt (Middleware darf eine unregistrierte Route bedienen) — jeder andere Fehler wird weitergereicht.
6. `buildRequest` bildet `canonicalHeader({ config, adapterDefaults?, tools? })` und protokolliert `request/header` mit `reason: 'initial' | 'resume' | 'change' | 'series'` und optional `startsSeries: true`. Der Grund ist `'initial'`, wenn noch kein Baseline-Header existiert, `'resume'`, wenn dies der erste Header dieses Loop-Instanz-Zyklus über ein bereits headerhaltiges Log ist, `'change'` bei unterschiedlichem Header, `'series'` bei unverändertem Header mit explizit neuer Serie.
7. Tool-Änderungen gegenüber dem Baseline werden als `developer/message` mit `createDeveloperMessage({ source: { kind: 'tool-registry' }, content: [additions..., removals...] })` protokolliert; `headerSeq` wird nur bei Additions mitgegeben.
8. `request/context` wird nur protokolliert, wenn sich `provider`, `model`, `contextWindow` oder `systemPromptUpdate` gegenüber `session.requestContext()` unterscheiden.
9. Der Header wird `deepFreeze`'d; `session.deriveMessages()` liefert die Grenznachrichten, die per `frozenMessages`-WeakSet nur einmal tief eingefroren werden; das Array wird `Object.freeze`'d.
10. Der Request ist `markAgentLoopRequest(Object.freeze({ ...header.config, messages, toolHistory: session.toolHistory(), tools?, sessionId, signal }))`.

**Streaming und Siedlung (`AssistantStreamAttempt`, `src/assistant-stream.ts`):** `start()` emittiert den `start`-Frame, `push(chunk)` snapshotet den Chunk einmal (Zeit + Chunk), speist Akkumulator und Block-Assembler und emittiert den `chunk`-Frame mit dichter `index`. `settle(eventType, append)` ruft zuerst den durablen Append, setzt danach `terminal = true` und emittiert den `end`-Frame mit `outcome: { kind: 'committed', eventType, seq }`; wirft der Append, wird `abandon()` aufgerufen (Frame mit `outcome: { kind: 'abandoned' }`). Die `attemptId` ist `` `${sessionId}:${attempt}` ``; `assistantStreamRevision` und `assistantAttemptCounter` sind pro Attached-Session-Lifecycle monoton.

### 3.8 Alle `agent/*`-Cordis-Events

| Event | Modus | Payload | Deklariert in |
|---|---|---|---|
| `agent/created` | serial | `{ agent, source: SessionStartSource, signal? }` | `packages/core/agent/src/runtime-types.ts` |
| `agent/disposed` | emit | `{ agent }` | ebd. |
| `agent/status` | emit | `{ agent, status }` | ebd. |
| `agent/inbox/inserted` | emit | `{ agent, message }` | ebd. |
| `agent/inbox/claimed` | emit | `{ agent, message, turn }` | ebd. |
| `agent/inbox/discarded` | emit | `{ agent, message }` | ebd. |
| `agent/pre-step` | waterfall | `{ agent, messages, turn, step, signal }` + `next: () => Promise<PreStepDecision>` | ebd. |
| `agent/request` | waterfall | `{ agent, turn, step, signal }` + `next: () => Promise<LlmCallConfig>` | ebd. |
| `agent/request-error` | waterfall | `{ agent, turn, step, provider, failure, retryPolicy, signal }` + `next: () => Promise<RequestErrorAction>` | ebd. |
| `agent/assistant-stream` | emit | `{ agent, frame: AssistantStreamFrame }` | ebd. |
| `agent/turn-stopping` | serial | `{ agent, turn, signal }` | ebd. |
| `agent/error` | emit | `{ agent, turn, step, error }` | ebd. |
| `agent-loop/config-start-failed` | emit | `{ sessionId, error }` | `packages/core/agent-loop/src/index.ts` |

Zusätzlich konsumiert der Agent-Core `internal/status` (Registry-Lifecycle, `packages/core/agent/src/index.ts`), `workspace/session-activity` und `workspace/session-stop` (`src/archive-admission.ts`) sowie `session/event` (Loop-Recovery und Runtime-Context-Projektion, `src/agent.ts` Zeile 334, `src/runtime-context.ts` Zeile 134).

---

## 4. Die Tool-Execution-Pipeline im Detail

Quellen: `packages/core/tools/src/index.ts`, `src/ptc.ts`, `src/types.ts`, `packages/guard/timeout-policy/src/index.ts`, `packages/core/agent-loop/src/tool-calls.ts`.

### 4.1 Stufenfolge

Die Pipeline wird vom Agent-Loop über den symbolgekeyten Scheduler gefahren (`TOOL_RUNTIME_SCHEDULER`, `src/index.ts` Zeile 481). Die vier Scheduler-Methoden sind:

| Methode | Aufgabe |
|---|---|
| `prepare(exec: ToolExecutionInput): Promise<ScheduledToolPreparation>` | Input materialisieren, den geordneten `tools/pre-execute`/Guard-Gate fahren und entscheiden, welche Stufe folgt |
| `dispatch(exec: ToolRunContext): Promise<ScheduledToolDispatch>` | **nur** die Around-Dispatch-/Body-Stufe |
| `finalize(exec, result): Promise<ToolExecutionResult>` | `tools/post-execute` plus definitions-eigene Content-Finalisierung, dann Materialisierung und Benachrichtigung |
| `finish(exec, result): ToolExecutionResult` | definitions-eigene Content-Finalisierung, dann Materialisierung und Benachrichtigung **ohne** `post-execute` |

`ToolRuntime.execute(exec)` ist der gewöhnliche Aufrufweg und entspricht `prepareExecution(exec, prepared => completeScheduledExecution(prepared))` (`src/index.ts` Zeile 1375). `completeScheduledExecution` (Zeile 1379) fährt je nach Vorbereitung:
- `dispatch` → `dispatchScheduledExecution`, danach `finalizeScheduledExecution` (bei `post-result`) oder `finishScheduledExecution` (bei `final-result`);
- `post-result` → `finalizeScheduledExecution`;
- `final-result` → `finishScheduledExecution`.

**Stufe 1 — Materialisierung und Kollapsprüfung (`createExecution`, Zeile 1397):**
1. `token = createExecutionToken()` (ein `Symbol('dsh.tool.execution')`); `rootCallId = exec.rootCallId ?? callId`.
2. Modus-Kollaps wird **vor** der Policy-Pipeline entschieden: `visible = this.get(name, agent)`; `collapsed = visible !== undefined && this.collapses(name, agent, parent !== undefined)`. Eine kollabierte (nicht: unbekannte) Anfrage wird deterministisch verweigert, damit Pre-Execute-Listener, Approval-`ask` und Guards sie nie sehen oder gar genehmigen können.
3. `finalizeContent` und `projectContent` werden **vor** der Argumentmaterialisierung gebunden: der `finalizeContent`-Contract snapshotet den Callback beim Start, und ein Arguments-Getter darf ihn nicht während `snapshotJsonValue` ersetzen. Der Kollaps entscheidet nur, ob der **eingefangene** Callback behalten wird: der Pre-Dispatch-Abbruchpfad behält ihn, die `UNKNOWN_TOOL`-Verweigerung und der Invalid-Args-Fall einer **nicht** abgebrochenen kollabierten Anfrage verwerfen ihn (`finalizerFor()`, Zeile 1444).
4. `snapshotJsonValue(exec.arguments)`; ist das Ergebnis `undefined`, wirft `new TypeError('tool execution arguments must be losslessly JSON-serializable')`. Die Argumente werden `deepFreeze`'d.
5. Registrierung in den internen WeakMaps: `deferredContexts`, `contentFinalizers`, `contentProjectors` (nur wenn nicht kollabiert), `cancellationStates = { callerSignal: signal, bodyInvoked: false }`.
6. Kollabierter Pfad: ist `signal.aborted`, wird sofort `toolAbortedBeforeDispatchResult()` geliefert; sonst `toolErrorResult(new ToolNotFoundError(name, 'only `run_code` is callable directly — call `<name>` from inside a `run_code` program instead'))`. Beides sind `final-result`s, die die Policy-Pipeline überspringen.
7. Nicht kollabiert: `{ kind: 'ready', exec: execution }`.

**Stufe 2 — `tools/pre-execute` + Guards (`prepareExecution`, Zeile 1499):**
1. `if (this.callerCancelled(exec))` → `final-result` mit `toolAbortedBeforeDispatchResult()`.
2. `const carrier = scopeTarget(this, exec.agent)`; `gate = await this.ctx.waterfall(carrier, 'tools/pre-execute', exec, () => Promise.resolve<PreToolDecision>({ kind: 'allow' }))`.
3. Bei `gate.kind === 'ask'` folgt `serviceAsk(exec, gate)`.
4. Ist der Aufrufer abgebrochen **und** meldete die Approval-Auflösung einen Abbruch → `post-result` mit `toolAbortedBeforeDispatchResult()`.
5. `decision.kind === 'cancel'` → `post-result` mit `toolAbortedBeforeDispatchResult()`.
6. `denialReason = decision.kind === 'allow' ? this.guardReason(exec) : decision.reason` — **Guards greifen nur nach `allow`**.
7. Liegt ein `denialReason` vor, wird ein `post-result` mit materialisiertem `{ content: [{ type: 'text', text: 'Error: ' + denialReason }], isError: true, error: { message: denialReason, info? } }` geliefert — also **durchläuft `tools/post-execute`**.
8. Nach den Guards wird die Abbruchsituation erneut geprüft → `post-result` mit `toolAbortedBeforeDispatchResult()`.
9. Sonst `{ kind: 'dispatch', exec }`. Ein synchroner/geworfener Fehler in der Stufe ergibt `final-result` mit `toolErrorResult(error)`.

**Guard-Reihenfolge (`guardReason`, Zeile 1151):** zuerst die globale Layer (`this.layers.global.guardReason(exec)`), dann — nur wenn `exec.agent` existiert — jede Layer der Scope-Kette in der Reihenfolge `chainLayers` (fernste Ahnen zuerst). Innerhalb einer Layer liefert der erste Guard mit einem Nicht-`undefined`-Rückgabewert den Grund. Guards sind **monoton**: kein Guard kann eine Verweigerung eines anderen in Erlaubnis umwandeln, und Listener-Reihenfolge kann eine Verweigerung nicht rückgängig machen, weil Guards kein `allow`-Ergebnis haben.

**Stufe 3 — `tools/execute` und Body (`dispatchScheduledExecution`, Zeile 1607; `dispatchToolBody`, Zeile 1570):**
1. `result = await this.ctx.waterfall(scopeTarget(this, exec.agent), 'tools/execute', mutableExec, () => this.dispatchToolBody(mutableExec))`.
2. `dispatchToolBody` fusst den ursprünglichen Aufrufer-Signal mit dem Wrapper-Signal (`fuseToolSignals`, Zeile 1934): bei Identität wird das Signal unverändert weitergegeben, sonst wird ein `AbortController` mit `once`-Listenern auf beiden Seiten gebaut und nach dem Body wieder abgeräumt. So kann ein Wrapper das Aufrufer-Signal nicht abhängen.
3. Ist das gefusste Signal bereits abgebrochen → `toolAbortedBeforeDispatchResult()` ohne Body-Aufruf.
4. `exec.signal = signal` (der Wrapper sieht das gefusste Signal); danach wird die Definition über `resolveExecution(exec.name, exec.agent, exec.parent !== undefined)` erneut aufgelöst; fehlt sie, wirft `ToolNotFoundError`.
5. `state.bodyInvoked = true`; `returned = await tool.execute(exec.arguments, exec)`; `result = this.createSuccessResult(exec, tool, returned)`. Ist das Signal danach abgebrochen, wird das erfolgreiche Ergebnis durch `toolAbortedResult(result)` **ersetzt** — gestartete Arbeit wird aber nie abandonniert.
6. Ein geworfener Fehler ergibt `toolErrorResult(error)`.
7. `finally`: `fused.dispose()`, `exec.signal = wrapperSignal` (der Aufrufer-Signal wird restauriert, damit Post-Listener nie das Timeout-Signal sehen).
8. Zurück in `dispatchScheduledExecution`: `normalizeDispatchResult(exec, result)` normalisiert ein von einem Wrapper **verfasstes** Ergebnis durch den Output-Contract (nur Ergebnisse, die nicht schon kanonisch für diesen Token sind). Dann werden `deferredContexts` der Execution **vor** die `additionalContexts` des Ergebnisses gemischt.
9. Ist der Aufrufer abgebrochen und das Ergebnis **kein** Fehler, wird es durch `cancellationResult(exec, result)` ersetzt (`ABORTED` bei `bodyInvoked`, sonst `ABORTED_BEFORE_DISPATCH`). Fehlerergebnisse bleiben erhalten — ein tool-eigener, strukturierter Fehler überlebt einen Abbruch.
10. Rückgabe `{ kind: 'post-result', result }`. Ein Throw in der Stufe ergibt `{ kind: 'final-result', result: toolErrorResult(error) }`.

**Stufe 4 — `tools/post-execute` und Content-Finalisierung (`finalizeScheduledExecution`, Zeile 1647; `postExecute`, Zeile 1787):**
1. `project = this.contentProjectors.get(exec)`; der Eintrag wird **gelöscht** (jeder Projektor läuft genau einmal). Liefert `project(exec, result)` Blöcke, wird ein materialisiertes Ergebnis mit ersetztem `content` als kanonisch markiert.
2. `postResult = await this.postExecute(exec, projected)`.
3. Ist der Aufrufer abgebrochen und `postResult` kein Fehler, wird `cancellationResult(exec, postResult)` angewendet.
4. Ergebnis geht in `finishScheduledExecution`. Ein Throw in der Stufe ergibt `finishScheduledExecution(exec, toolErrorResult(error))`.

**Stufe 5 — Materialisierung und `tools/result` (`finishScheduledExecution`, Zeile 1675):**
1. `materializedResult = this.materializeFinalResult(result)`; wirft das, wird `materializeFinalResult(toolErrorResult(error))` verwendet.
2. `finalResult = this.materializeFinalResult(this.applyFinalContent(exec, materializedResult))`; wirft das, wird wieder auf `materializeFinalResult(toolErrorResult(error))` zurückgefallen.
3. `this.notifyResult(exec, finalResult)`.

`applyFinalContent` (Zeile 1693) ruft den beim Start snapshotierten `finalizeContent`-Callback; `undefined` erhält das Ergebnis, sonst wird nur `content` ersetzt.

`notifyResult` (Zeile 1701): `Object.freeze(exec)` **vor** der Beobachtung; dann `ctx.events.dispatch('emit', [scopeTarget(this, exec.agent), 'tools/result', exec, result])` und jeder Callback einzeln mit `try`/`catch` plus `Promise.resolve(...).catch(...)`. Listener-Fehler landen als Warnung (`tools/result observer failed: …`) und haben keinen Kanal in das Ergebnis.

`materializeFinalResult` (Zeile 1892) erzeugt das autoritative Commit-Ergebnis: der `presentation`-Teil (`content`, `meta?`, `additionalContexts?`) wird `snapshotJsonValue`-geprüft, `deepFreeze`'d; bei Fehlern `{ isError: true, error, ...presentation }`, bei Erfolg zusätzlich `concludesTurn: true` (falls gesetzt) und schließlich `deepFreeze({ ...detached, value: result.value })`. Das `value` trägt also **nur** das nichterfolgreiche Ergebnis.

### 4.2 Entnahme-Vokabulare (exakt)

**`PreToolDecision`** (`src/index.ts` Zeilen 608–612):
```
{ kind: 'allow' }
| { kind: 'deny'; reason: string; info?: ToolErrorInfo }
| { kind: 'cancel' }
| { kind: 'ask'; reason?: string; displayReason?: { readonly en: string; readonly [locale: string]: string } }
```
Bedeutung laut JSDoc: `allow` führt aus; `deny` materialisiert seinen modellgerichteten Grund und eine optionale strukturierte Fehleridentität; `cancel` wählt das kanonische Abbruchergebnis **ohne** Policy-Verweigerung; `ask` läuft nur, wenn der Approval-Service `allowed-once` liefert, sonst verweigert es. Input-Rewriting ist ausgeschlossen, weil Argumente bereits protokolliert und präsentiert sind.

**`PostToolDecision`** (`src/index.ts` Zeilen 618–621):
```
{ kind: 'accept'; content?: ContentBlock[]; value?: never; additionalContexts?: UserMessage[] }
| { kind: 'accept'; value: JsonValue; content?: never; additionalContexts?: UserMessage[] }
| { kind: 'block'; feedback: ContentBlock[]; additionalContexts?: UserMessage[] }
```
Regeln in `postExecute`: ein `accept` mit **beidem** (`content` und `value`) wirft `TypeError('tools/post-execute accept decision cannot replace both value and content')`; ein `value`-Ersatz auf einem Fehlerergebnis wirft `TypeError('tools/post-execute cannot replace the value of a failed result')`. Ein `block` liefert `{ content: feedback, isError: true, error: { message: failureMessageFromContent(feedback) }, additionalContexts? }`; der Nachrichtentext ist der zusammengefügte Text der Feedback-Blöcke bzw. `'tool result blocked by post-execute policy'`, wenn nichts Textförmiges dabei ist. Kontext, den der Body deferiert hat, überlebt ein akzeptiertes Ergebnis, wird aber bei einem Block **verworfen** — ein Block zeigt nur explizit mitgegebenen Kontext.

**`ApprovalOutcome`**: `'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'`. `serviceAsk` (Zeile 1733) bildet ab: `allowed-once` → `{ kind: 'allow' }`; `rejected` → `deny` mit `the user rejected tool "<name>"`; `cancelled` → `deny` mit `approval for tool "<name>" was cancelled` **und** `approvalCancelled: true`; `unavailable` → `deny` mit `tool "<name>" requires approval, but no approval channel is available`. Ohne Approval-Service: `deny` mit `ask.reason ?? 'tool "<name>" requires approval (not yet supported)'`. Ohne `exec.agent`: `deny` mit `tool "<name>" requires approval, but the call has no agent to route it through`.

**`ToolExecutionMode`** (`src/index.ts` Zeilen 359–361): `{ kind: 'parallel' } | { kind: 'exclusive' }`.
`executionMode(exec)` (Zeile 1309) ist **fail-closed**: nur ein exaktes `true` aus `isConcurrencySafe(exec.arguments)` ergibt `parallel`; unbekanntes Tool, fehlende Deklaration, `false`, Nicht-`true`-Rückgabe oder geworfener Klassifizierer ergeben `exclusive`. Nur sichtbare (nicht weggefilterte) Definitionen werden klassifiziert, und die Klassifizierung läuft über `resolveExecution` — ein kollabierter Modell-Direktaufruf ist also nie `parallel`.

**`ToolPresentationMode`** (`src/index.ts` Zeile 672): `'native' | 'ptc'`.

### 4.3 Native vs. PTC

**`native` (Default):** `wireSchemas` (Zeile 1017) liefert **alle** sichtbaren Schemas in stabiler Reihenfolge plus die vollständige Menge der `knownNames` (vor Restrictions) für die `toolOrder`-Validierung. Es werden keine Prompt-Sections registriert.

**`ptc`:** Der Executor wird auf ein einziges Modell-gerichtetes Tool zusammengeklappt:
- `wireSchemas` ruft **zuerst** `requirePtcRuntime(mode)` (damit die Renderer-Tabellen-Ablehnung the kanonische Assemblierungsfehler bleibt) und liefert danach nur das `run_code`-Schema; `knownNames` ist genau `[RUN_CODE_NAME]`.
- Zwei Prompt-Sections werden registriert: `tools:ptc-only` (Order `PTC_ONLY`) mit dem Text `\`run_code\` is the only tool you can call directly — a tool call naming any other tool fails. Reach every tool the SDK declares below from inside the program.` und `tools:sdk` (Order `TOOLS_SDK`, `interpolate: false`), die aus den sichtbaren Tools der **aufrufenden** Scope ein SDK rendert.
- `SDK_RENDERERS` ist exakt `{ typescript: renderToolsSdk, python: renderToolsSdkPy }` (`satisfies Record<PtcSdkLanguage, …>`).
- `collapses(name, scope, nested)` (Zeile 1357) ist `!nested && this.modeFor(scope) === 'ptc' && name !== RUN_CODE_NAME`. Eine Modell-Direktanfrage darf also nur `run_code` nennen; ein verschachtelter Sub-Dispatch (mit gesetztem `parent`-Token) darf jedes sichtbare Tool aufrufen. `modeFor` liest die **nächstgelegene** Scope-Deklaration entlang der Kette, sonst den Deployment-Default.
- Der Transport wird von `requirePtcTransport()` per `createRunCodeTool(this, …)` **bei Bedarf** gebaut und nie in die globale Layer eingehängt; `register()` lehnt den reservierten Namen `run_code` hart ab, und `restrict()` darf ihn nicht nennen.
- Der `run_code`-Einstiegspunkt bleibt `exclusive`: er deklariert **kein** `isConcurrencySafe` und kein `timeoutMs`; die Zeitbudget-Steuerung läuft über das Modellargument `timeoutMs` und die Runtime (`runtime.timeout.defaultMs` / `.maxMs`).
- Verschachtelte Sub-Calls folgen dem nativen Scheduling-Vertrag (`maxParallel` = `ctx.tools.maxParallelSubCalls`, Default `10`); exklusive Sub-Calls bilden Barrieren. Start-Events werden über `tool/ptc-dispatch-start` protokolliert, Siedlungen über `tool/ptc-dispatch`; das logbare Content-Ergebnis darf über den `tools/ptc-dispatch-log`-Waterfall umgeformt werden.
- Nur der kuratierte äußere `run_code`-Rückgabewert ({ `logs`, `sandbox?`, `result?` }) erreicht die Modellhistorie. Bildtragende Sub-Ergebnisse werden als `user/message` mit `source: { kind: 'ptc-mode' }` deferiert.

### 4.4 Scheduler-Vertrag

- Der Scheduler ist **nicht** öffentlich: `TOOL_RUNTIME_SCHEDULER` ist ein `unique symbol` und laut JSDoc internal; gewöhnliche Aufrufer nutzen `ToolRuntime.execute`.
- `ScheduledToolPreparation = { kind: 'dispatch'; exec: ToolRunContext } | { kind: 'post-result'; exec; result } | { kind: 'final-result'; exec; result }`.
- `ScheduledToolDispatch = { kind: 'post-result'; result } | { kind: 'final-result'; result }`.
- Ein `post-result` erhält **noch** `post-execute`; ein `final-result` überspringt es und entspricht bereits der `execute`-Fehlersemantik.
- Der Loop-Vertrag (`packages/core/agent-loop/src/tool-calls.ts`): vor jedem Start eines weiteren Aufrufs wird `prepare` gefahren und das Ergebnis eingestuft; `dispatch` wird nur bei `dispatch` gestartet; gesiedelte Slots werden in Modellordnung über `finalize` (`needsPost`) bzw. `finish` committet.
- Ein **innerer Scheduler-Fehler** stoppt neue Dispatches, drained bereits gestartete (`Promise.allSettled(inFlight.values())`) und wirft den ersten Fehler; die besitzende Step-Stufe schreibt konservative Recovery-Ergebnisse, bevor sie schließt.
- Invarianten-Fehler des Registries: `'tool registry scheduler invariant violated: missing cancellation state'` und `'tool registry scheduler invariant violated: unprepared execution'`.

### 4.5 Timeouts

- Ein Tool deklariert `timeoutMs?: number` (kooperatives Budget in Millisekunden; Omission = keine Deadline). Der Wert wird **nie** an das Modell gesendet — `schemas()` projiziert nur `name`, `description`, `parameters` (und `deferLoading`).
- Validierung doppelt: `defineTool` wirft `defineTool(<name>): timeoutMs must be a positive finite number` (`src/schema.ts` Zeile 575); `ToolRuntime.register` wirft `tool "<name>" timeoutMs must be a positive finite number` (`src/index.ts` Zeile 1081).
- Vollstreckt wird ausschließlich von `@deepseek-ai/dsh-tool-call-timeout-policy` als `tools/execute`-Wrapper: `ctx.tools.get(exec.name, exec.agent)?.timeoutMs` wird gelesen; ohne Budget wird delegiert. Sonst `using d = deadline(exec.signal, timeoutMs, TOOL_TIMEOUT)`, `exec.signal = d.signal`, delegieren, und **nur** wenn `timeoutOf(d.signal, TOOL_TIMEOUT) !== undefined` (d. h. die eigene Uhr feuerte), wird das Ergebnis durch den strukturierten Timeout ersetzt. Danach wird das Upstream-Signal restauriert.
- Das Timeout-Ergebnis: Text `` `Error: tool call timed out after ${timeoutMs}ms` ``, `error.info = { name: 'ToolTimeoutError', code: 'TOOL_TIMEOUT' }` (`TOOL_TIMEOUT = 'TOOL_TIMEOUT'`, `packages/guard/timeout-policy/src/index.ts` Zeile 25).
- Ein verschachteltes äußeres Deadline (ein anderer Wrapper feuerte zuerst) liest über `timeoutOf` **nicht** als eigener Timeout und erscheint als gewöhnlicher Upstream-Abbruch.

### 4.6 Eingebaute Tool-Fehlercodes und -Strings

| Code / Name | Konstante / Klasse | Quelle | Modelltext |
|---|---|---|---|
| `UNKNOWN_TOOL` | `ToolNotFoundError` | `packages/core/tools/src/index.ts` Zeile 511 | `unknown tool "<name>"` bzw. `unknown tool "<name>": <reachableFrom>` |
| `INVALID_TOOL_OUTPUT` | `ToolOutputError` (Feld `violations: string[]`) | ebd. Zeile 530 | `tool "<name>" returned invalid output: <violations>` |
| `ABORTED` | `TOOL_ABORTED = 'ABORTED'` | ebd. Zeile 484 | `Error: tool call aborted` |
| `ABORTED_BEFORE_DISPATCH` | `TOOL_ABORTED_BEFORE_DISPATCH = 'ABORTED_BEFORE_DISPATCH'` | ebd. Zeile 487 | `Error: tool call aborted before dispatch` |
| `TOOL_TIMEOUT` | `TOOL_TIMEOUT` | `packages/guard/timeout-policy/src/index.ts` Zeile 25 | `Error: tool call timed out after <n>ms` |
| `CODE_RUN_FAILED` | `CodeRunFailedError` | `packages/core/tools/src/ptc.ts` Zeile 175 | `code run failed (<kind>): <message>` (+ `Captured output:` und Sandbox-Zeile) |
| `TOOL_NOT_STARTED` | `TOOL_NOT_STARTED` | `packages/core/session/src/repair.ts` Zeile 15 | (synthetisches Recovery-Ergebnis) |
| `TOOL_OUTCOME_UNKNOWN` | `TOOL_OUTCOME_UNKNOWN` | ebd. Zeile 18 | (synthetisches Recovery-Ergebnis) |
| — | `ToolArgsError` | `packages/core/tools/src/schema.ts` | Argumentvalidierung |
| — | `JsonSchemaError` | `packages/core/tools/src/json-schema.ts` | Schema-Validierung |

Beide Abbruch-Ergebnisse tragen `info = { name: 'AbortError', code: … }`; beide übernehmen `additionalContexts` aus einem vorherigen Ergebnis, falls vorhanden. `toolErrorResult(error)` erzeugt für beliebige Fehler `{ content: [{ type: 'text', text: 'Error: ' + message }], isError: true, error: { message, info? } }`, wobei `info` nur für `HarnessError` aus `{ name, code }` gebildet wird. `errorMessage(error)` ist total: `Error.message`, sonst ein String-`message`-Feld, sonst `String(error)`, und im Fehlerfall `'<unprintable thrown value>'`.

**Weitere feste Strings der Pipeline:** `'tool result blocked by post-execute policy'`, `'tool "<name>" must declare output { schema, render, presentationMeta? }'`, `'tool execution arguments must be losslessly JSON-serializable'`, `'tool name "run_code" is reserved for the PTC mode presentation transport and cannot be registered or shadowed'`, `'tools.presentAs() requires a scoped context (agent.ctx): a context-global presentation is the \`mode\` config field on the tools row'`, `'tools.restrict() requires a scoped context (agent.ctx): a context-global restriction would mask every agent — deny the tool for the intended agent instead'`, `'tools.restrict({}) is a no-op: pass \`allow\` and/or \`deny\` (an empty filter is almost always a materialized-empty-config bug)'`, `'maxParallelSubCalls must be a positive integer'`, `'dsh-tools: mode "<mode>" requires a PTC runtime — load a ctx.ptcRuntime implementation (e.g. @deepseek-ai/dsh-ptc-runtime-node) or set tools mode to "native"'`, `'dsh-tools: no SDK renderer registered for runtime language <lang> (known: …)'`.

---

## 5. Alle von diesen Paketen registrierten Tool-Namen

Registrierung erfolgt immer über `ctx.tools.register(defineTool({ name, description, parameters, output, … }))`. **Konkurrenzsicher** heißt hier: die Definition deklariert `isConcurrencySafe` und liefert für die konkreten Argumente exakt `true`; alles andere ist nach `executionMode` **exklusiv** (fail-closed).

| Tool-Name | Paket | Zweck (eine Zeile) | Konkurrenzsicher |
|---|---|---|---|
| `run_code` | `packages/core/tools` (`src/ptc.ts`) | Reservierter PTC-Transport: führt ein TypeScript-/Python-Programm aus, das die sichtbaren Tools über das SDK aufruft | nein (kein `isConcurrencySafe` → exklusiv) |
| `exit_plan_mode` | `packages/plan/plan-mode` | Nimmt den vollständigen Markdown-Plan, lässt den Nutzer ihn reviewen und verlässt bei Zustimmung den Plan-Modus | nein |
| `get_goal` | `packages/goal/tool-goal` | Liest das aktuelle Session-Goal inkl. `id` und `revision` | nein |
| `create_goal` | `packages/goal/tool-goal` | Legt ein persistiertes Goal an, das die Session über automatische Fortsetzungsrunden weiterarbeitet | nein |
| `update_goal` | `packages/goal/tool-goal` | Ändert ein Goal (`edit`/`pause`/`resume`/`complete`/`blocked`) mit Autoritätsprüfung | nein |
| `todo_write` | `packages/todo/tool-todo` | Schreibt die vollständige Todo-Liste des Agents als Whole-List-Snapshot ins Log | nein |
| `ask_user_question` | `packages/interaction/tool-ask-user` (`legacy`-Modus `src/index.ts`, `timed`-Modus `src/timed.ts`) | Stellt dem Menschen eine oder mehrere Fragen und liefert die strukturierte Antwort als Tool-Ergebnis | nein |
| `workflow` (Default; konfigurierbar über `toolName`) | `packages/workflow/tool-workflow` | Führt ein JavaScript-Orchestrierungsskript über `ctx.workflowEngine` aus (föderiert über Subagents) | nein |
| `subagent` (Default; konfigurierbar über `toolName`) | `packages/subagent/tool-subagent` | Delegiert eine Aufgabe an einen Kind-Agent beim konfigurierten Provider | **ja** (`isConcurrencySafe: () => true`) |
| `list_subagent_models` | `packages/subagent/tool-subagent` (`src/list-models.ts`) | Listet die für Subagent-Delegation verfügbaren Modellrouten | nein |
| `send_message` | `packages/subagent/tool-subagent-control` | Sendet eine Nachricht an einen bestehenden Kind-Agent (Continuation) | nein |
| `interrupt_agent` | `packages/subagent/tool-subagent-control` | Unterbricht den laufenden Turn eines Kind-Agents | nein |
| `list_agents` | `packages/subagent/tool-subagent-control` (`src/list-agents.ts`) | Listet die bestehenden Kind-Agents des aufrufenden Agents | nein |
| `schedule_create` | `packages/schedule/tool-schedule` | Legt eine durable Erinnerung an (`after_seconds`/`at`/`every_seconds`/`daily`/`weekly`/`cron`) | nein |
| `schedule_list` | `packages/schedule/tool-schedule` | Listet die Erinnerungen der aufrufenden Session (keine Parameter) | nein |
| `schedule_update` | `packages/schedule/tool-schedule` | Ändert Titel, Prompt oder Timing einer bestehenden Erinnerung in-place | nein |
| `schedule_delete` | `packages/schedule/tool-schedule` | Löscht eine Erinnerung anhand ihrer Id | nein |

**Nicht in dieser Liste (bewusst):** `compaction` registriert kein modellgerichtetes Tool (ausdrücklich dokumentiert); `preset/persona`, `preset/agent-preset*`, `feedback/*`, `guard/*`, `interaction/commands`, `interaction/user-approval`, `interaction/user-questions`, `interaction/permission-presets`, `core/agent*`, `core/session`, `core/scope`, `core/system-prompt` registrieren ebenfalls keine Tools. `run_code` wird nicht über `register()` eingehängt, sondern als reservierter Transport dynamisch in die Sichtbarkeit eingefügt (siehe 4.3) — trotzdem ist es ein modellgerichteter Tool-Name.

**Slash-Commands (kein Tool, aber modellfern registriert):** `/compact` (`command-compact`), `/feedback` (`command-feedback`), `/plan` (`plan-mode`), `/goal`-Command (`command-goal`).

---

## 6. Alle referenzierten Session-Event-Typ-Strings

„Append-Paket" nennt das Paket, das den Event tatsächlich schreibt (oder, bei reinen Deklarationen, das ihn deklariert). Payload-Shapes sind verdichtet.

### 6.1 Kernereignisse (`packages/core/session/src/types.ts`)

| Typ | Append-Paket | Payload (verdichtet) |
|---|---|---|
| `turn/start` | `core/agent-loop` | `{ turn: number }` |
| `turn/end` | `core/agent-loop` | `{ turn: number; reason: TurnEndReason }` |
| `step/start` | `core/agent-loop` | `{ turn; step }` |
| `step/end` | `core/agent-loop` | `{ turn; step }` |
| `user/message` | `core/agent-loop`, `core/compaction-basic`, `compaction-tool-result-pruner` (Replacement) | `UserMessage` |
| `developer/message` | `core/agent-loop` | `{ turn; step; message: DeveloperMessage; headerSeq? }` |
| `system/message` | `core/agent-loop` | `{ turn; step; message: SystemMessage }` |
| `assistant/message` | `core/agent-loop` | `{ turn; step; message: AssistantMessage; stream: AssistantStreamRecord[]; usage?; interrupted?: true }` |
| `assistant/attempt` | `core/agent-loop` | `{ turn; step; stream: AssistantStreamRecord[] }` |
| `tool/call` | `core/agent-loop` | `{ turn; step; callId: ToolCallId; name: string; arguments: string }` |
| `tool/result` | `core/agent-loop`, `compaction-tool-result-pruner` (Replacement) | `{ turn; step; message: ToolResultMessage; error?: { name; code; reason? }; meta? }` |
| `request/header` | `core/agent-loop` | `{ header: EpochHeader; reason: 'initial' \| 'resume' \| 'change' \| 'series'; startsSeries?: true }` |
| `request/context` | `core/agent-loop` | `RequestContext { provider; model; contextWindow?; systemPromptUpdate? }` |
| `session/end-seed` | `core/session` (Konstruktor/`buildForkSeed`) | `{ inherited?: true }` |

### 6.2 Agent-Loop-eigene Ergänzungen

| Typ | Append-Paket | Payload |
|---|---|---|
| `agent/inbox/spliced` | `core/agent-loop` (`src/inbox.ts`) | `{ target: 'next-turn' \| 'next-step'; start: number; removedCount?: number; inserted: UserMessage[]; outcome?: 'canceled' }` |

### 6.3 Tool-/PTC-Ereignisse

| Typ | Append-Paket | Payload |
|---|---|---|
| `tool/ptc-dispatch-start` | `core/tools` | `{ rootCallId; parentCallId; subCallId; name; arguments }` |
| `tool/ptc-dispatch` | `core/tools` | wie oben plus `{ isError; content: ContentBlock[]; meta?; error?: { name; code; reason? } }` |

### 6.4 Goal

| Typ | Append-Paket | Payload |
|---|---|---|
| `goal/change` | `goal/goal` | `GoalChangeMeta` = `{ kind: 'goal/change'; version: 1; operation: 'create'\|'edit'\|'pause'\|'resume'\|'complete'\|'block'; goal: GoalSnapshot; roundsStarted; createdAt; updatedAt }` **oder** `{ kind: 'goal/change'; version: 1; operation: 'clear'; cleared: GoalRef; clearedAt }` |

### 6.5 Plan / Todo

| Typ | Append-Paket | Payload |
|---|---|---|
| `plan/mode` | `plan/plan-mode` | `{ active: boolean }` (log-only, Whole-Value-Replace, letzter gewinnt) |
| `todo/write` | `todo/tool-todo` | `{ todos: TodoItem[] }` (Whole-List-Snapshot, letzter gewinnt) |

### 6.6 Interaktion

| Typ | Append-Paket | Payload |
|---|---|---|
| `approval/policy` | `interaction/user-approval`, `subagent/subagent` (Delegation) | `{ policy: 'ask' \| 'never'; source?: 'delegation' }` |
| `approval/asked` | `interaction/user-approval` | `{ id: ApprovalRequestId; toolName: string; callId?: ToolCallId; reason?: string }` |
| `approval/decided` | `interaction/user-approval` | `{ id: ApprovalRequestId; outcome: 'allowed-once'\|'rejected'\|'cancelled'\|'unavailable' }` |
| `permission/preset` | `interaction/permission-presets`, `subagent/subagent` (Delegation) | `{ preset: string }` |
| `command/run` | `interaction/commands` | `{ commandId: CommandId; name: string; args?: string; source: { kind: 'user' } }` |
| `command/done` | `interaction/commands` | `{ commandId; kind: 'success' \| 'error'; text?: string; sourceEventSeq?: SessionSeq }` |

### 6.7 Workflow

| Typ | Append-Paket | Payload |
|---|---|---|
| `tool-workflow/run-start` | `workflow/tool-workflow` | `ToolWorkflowRunStartData` (Recorder, `src/index.ts` Zeilen 73–78) |
| `tool-workflow/agent-start` | `workflow/tool-workflow` | `ToolWorkflowAgentStartData` |
| `tool-workflow/agent-end` | `workflow/tool-workflow` | `ToolWorkflowAgentEndData` |
| `tool-workflow/run-end` | `workflow/tool-workflow` | `ToolWorkflowRunEndData` |

### 6.8 Subagent

| Typ | Append-Paket | Payload |
|---|---|---|
| `subagent/catalog` | `subagent/subagent` (am **Parent**) | `SubagentCatalogEvent`; Version `SUBAGENT_CATALOG_VERSION = 0`, extern `EXTERNAL_SUBAGENT_CATALOG_VERSION = 2` |
| `subagent/descriptor` | `subagent/subagent` (am **Kind**) | `SubagentDescriptorData`; Version `SUBAGENT_DESCRIPTOR_VERSION = 3` |
| `subagent/model-selection-policy` | `subagent/tool-subagent` | Modellselektions-Policy des Kindes |
| `sandbox/mode` | `subagent/subagent` (Delegation) | `{ mode: SandboxMode; source: 'delegation' }` |

### 6.9 Compaction

| Typ | Append-Paket | Payload |
|---|---|---|
| `compaction/start` | `compaction/compaction` (deklariert), `compaction/compaction-basic` (schreibt) | `{ compactionId; sourceCommandId?; turn: number \| null }` |
| `compaction/summary` | `compaction/compaction-basic` | `{ compactionId; sourceCommandId?; summary: ContentBlock[]; shadowedRange; shadowedSeqs; shadowedTokenCount; provider; model; maxTokens?; usage? }` (+ `rawOutput`/`llmStreamCall`-Variante) |
| `compaction/end` | `compaction/compaction-basic` | `{ compactionId; sourceCommandId?; turn: number \| null; error? }` |
| `compaction/prune` | `compaction/compaction-tool-result-pruner` | `{ shadowedRange: { start; end }; shadowedSeqs: SessionSeq[]; shadowedTokenCount: number }` |
| `image/offload` | `compaction/compaction-image-offload` | `{ targets: { seq: SessionSeq; imageIndexes: number[] }[] }` (`@messageProjection`) |

### 6.10 Preset / Schedule / Feedback

| Typ | Append-Paket | Payload |
|---|---|---|
| `agent-preset/selected` | `preset/agent-preset-registry` | `{ agentPreset: string }` (log-only) |
| `schedule/change` | **kein Appender in diesen Paketen** — deklariert von `schedule/schedule` und nur gelesen/gefaltet | `ScheduleChange` = `ScheduleCreateChange \| ScheduleDeleteChange \| ScheduleOneShotDispatchChange \| ScheduleEveryDispatchChange`, jeweils `version: 1`, `operation: 'create' \| 'delete' \| 'dispatch'` |
| `feedback/record` | `feedback/command-feedback` | `{ text?: string; category?: FeedbackCategory }` (log-only) |
| `feedback/message-put` | `feedback/message-feedback` | `{ sessionId: SessionId; item: MessageFeedbackItem }` |
| `feedback/message-delete` | `feedback/message-feedback` | `{ sessionId: SessionId; messageId: MessageId }` |

### 6.11 Fremdvokabular, das diese Pakete nur lesen/falten

`session/event` (alle), `workspace/session-activity` (Workspace-Registry), `session/disposed`, `session/created`, `llm/retry` (nur erwähnt: der Bild-Offload-Pfad protokolliert bewusst keines), `hook/*` (nicht in diesen Paketen).

---

## 7. Projektions-Keys mit `stateVersion`

Projektionen werden über `ctx.sessionProjections.register(definition)` registriert; das Schema eines Eintrags ist `{ key, stateVersion, stateSchema, init, apply, wire? }`.

| Key | `stateVersion` | Registrierendes Paket / Datei | Was gespeichert wird |
|---|---|---|---|
| `turnBoundary` | **2** | `core/agent-loop` (`src/index.ts` Zeile 57) | `TurnBoundaryProjection`: `openTurnStartSeq` (Seq des offenen `turn/start` oder `null`), `lastStepStartSeq`, `lastStepBoundary` (`{ kind: 'start' \| 'end'; seq }` oder `null`), `lastTurn` (0 vor dem ersten Turn) |
| `inbox` | **1** | `core/agent-loop` (`src/inbox.ts` Zeile 27) | `InboxState = { 'next-turn': UserMessage[]; 'next-step': UserMessage[] }`; der Fold lehnt ungültige Splice-Historie und doppelte Message-Ids ab |
| `goal` | **6** | `goal/goal` (`src/index.ts` Zeile 162) | `GoalProjectionState = { current: GoalSnapshot \| null; seenGoalIds: GoalId[]; failure: … \| null }`; Wire-View ist `state.current` |
| `plan` | **3** | `plan/plan-mode` (`src/index.ts` Zeile 136) | `PlanUnitState = { active: boolean; wanted: boolean \| null; running: { commandId; wanted } \| null; activeAtLastHeader: boolean \| null }`; Wire-View `{ active, pending }` |
| `todos` | **2** | `todo/tool-todo` (`src/index.ts` Zeile 124) | `TodoItem[] \| null` — die letzte vollständige `todo/write`-Liste, `null` vor dem ersten Schreiben |
| `permissions` | **2** | `interaction/permission-presets` (`src/index.ts` Zeile 238) | Aktuelle Knob-Werte (`EMPTY_KNOBS` erweitert) plus `seeded: boolean`; Client-View `{ key: 'permissions', value: { currentValue, … } }` |
| `userQuestions` | **2** | `interaction/user-questions` (`src/projection.ts` Zeile 316) | `{ inheritedEventCount; timed: boolean; questions: { active: PendingUserQuestion[]; settled: SettledUserQuestion[] } }`; Fold respektiert `inheritedEventCount` |
| `subagentTiming` | **3** | `subagent/subagent` (`src/projection.ts` Zeile 68) | `{ descriptorSeen: boolean; settledMs: number; active?: { since; through }; lastTurnCompleted?: boolean; pendingTurnStart? }` |
| `subagent` | **2** | `subagent/subagent` (`src/projection.ts` Zeile 177) | `{ identity?: { mode: 'one-shot'; label?; seq } \| { mode: 'continuable'; label; seq } }`; ein ungültiger Descriptor setzt auf `{}` zurück |
| `subagentCatalog` | **6** | `subagent/subagent` (`src/catalog.ts` Zeile 122) | Katalog der bekannten Subagent-Kinder (Version `SUBAGENT_CATALOG_VERSION = 0`, extern `2`) |
| `subagentModelSelectionPolicy` | **1** | `subagent/tool-subagent` (`src/model-selection-state.ts` Zeile 38) | Zuletzt protokollierte Modellselektions-Policy des Kindes |
| `agentPreset` | **1** | `preset/agent-preset-registry` (`src/session.ts` Zeile 36) | `string \| null`: der aktuelle Preset-Name der Session; `init` liest `header.agentPreset ?? null`, `apply` folgt `agent-preset/selected` |

**Message-Projektion ohne `stateVersion`:** `image/offload` (`compaction/compaction-image-offload`, registriert über `ctx.sessions.registerMessageProjection`), Typ-String `'image/offload'`, liefert `Map<SessionSeq, Message>` mit den markierten `offloaded: true`-Bildvorkommen.

**Ohne Projektions-Key in diesen Paketen:** `core/agent` (nur Typ-Deklaration von `inbox`/`turnBoundary` für die Konsumentenseite), `core/scope`, `core/system-prompt`, `core/tools`, `core/agent-default-model`, `core/agent-tool-presentation`, `guard/*`, `goal/goal-round-driver`, `goal/command-goal`, `goal/tool-goal`, `interaction/commands`, `interaction/tool-ask-user`, `interaction/user-approval`, `workflow/*`, `subagent/subagent-*` (Backends), `compaction/compaction`, `compaction/compaction-basic`, `compaction/compaction-tool-result-pruner`, `compaction/command-compact`, `preset/agent-preset`, `preset/persona`, `schedule/*`, `feedback/*`.

---

## 8. Harte Fakten (Konstanten, Limits, Schwellen, Versionen, Gotchas)

### 8.1 Versionen und Formatstände
- Alle Pakete: `"version": "0.2.1-alpha.2"`.
- `SESSION_FORMAT_VERSION = 4` (`packages/core/session/src/types.ts` Zeile 89) — einkomponentige monotone Ganzzahl, bewusst ohne Major/Minor-Split.
- `SUBAGENT_CATALOG_VERSION = 0`, `EXTERNAL_SUBAGENT_CATALOG_VERSION = 2` (`packages/subagent/subagent/src/catalog.ts` Zeilen 21, 154).
- `SUBAGENT_DESCRIPTOR_VERSION = 3` (`packages/subagent/subagent/src/descriptor.ts` Zeile 48).
- `GOAL_CHANGE_VERSION = 1` (`packages/goal/goal/src/runtime.ts` Zeile 8); `GoalSnapshotChangeMeta.version = 1`, `GoalClearChangeMeta.version = 1`.
- `SCHEDULE_CHANGE_VERSION = 1` (`packages/schedule/schedule/src/domain.ts` Zeile 34); Storage-Domain `name: 'schedule'`, `version: 1`, Tabelle `tasks`.
- Exakte Fremdversionen: `@js-temporal/polyfill` **0.5.1** (`packages/schedule/schedule/package.json`), `zod ^4.4.3` (mehrere).

### 8.2 Defaults und Schwellen
- `DEFAULT_MAX_PARALLEL_TOOL_CALLS = 10` (`packages/core/agent-loop/src/constants.ts`).
- `ctx.tools.maxParallelSubCalls` Default **10** (`packages/core/tools/src/index.ts` Zeile 797: `value ?? 10`); `mode` Default `'native'`.
- `tool-subagent.maxDepth` Default **1**, `maxActiveSubagents` Default **8** (`packages/subagent/subagent/src/index.ts` Zeilen 194–195).
- `tool-goal.blockedAfterConsecutiveRounds` Default **3**; `goal.defaultMaxGoalRounds` Default **256**.
- `tool-ask-user.timeout` Default **120** (Sekunden), Grenzen `-1` oder `1 … 2_147_483`.
- `repeat-tool-reminder.thresholds` Default **`[3, 5, 8]`**, `argumentsPreviewChars` Default **500**; harte Regeln: Liste nicht leer, jede Zahl ganzzahlig `>= 2`, keine Duplikate, `argumentsPreviewChars` ganzzahlig `>= 1`.
- `tool-result-pruner`: `thresholdChars` **8192**, `headChars` **4096**, `tailChars` **1024**; Invariante `headChars + len(PRUNE_MARKER) + tailChars <= thresholdChars`.
- `compaction-basic`: `thresholdRatio` **0.8**, `retainRatio` **0.16**, `headroomTokens` **65536**, `maxTokens` = `headroomTokens`, `compactionRetries` **1**, `maxOverflowRetries` **1**, `auto` **true**.
- `workflow-ptc`: `maxTotalAgents` **1000**, `maxItemsPerCall` **4096**, `syncTimeoutMs` **5000 ms**.
- `tool-workflow`: `toolName` Default `'workflow'`, `maxResultChars` Default **50000**, `enableRunInBackground` Default **true**.
- `schedule`: `MIN_EVERY_INTERVAL_SECONDS` **60**, `MAX_TITLE_LENGTH` **120**, `CRON_SEARCH_HORIZON_YEARS` **400**, `MAX_TIMER_DELAY_MS` **2_147_483_647**, `deliveryHistoryDays` Default **30**, `deliveryHistoryRecords` Default **200**, History-`limit` **1 … 100**, `DAY_MS = 86_400_000`.
- `user-questions.askTimed`: `timeoutMs` ganzzahlig, `>= 1`, `<= 2_147_483_647`.
- `message-feedback.maxNoteBytes`: Default **keiner** (Pflichtfeld); das Web-Bundle liefert **8192**.
- `MAX_SUBAGENT_DIAGNOSTIC_BYTES = 4_096` (`packages/subagent/subagent/src/out-of-process.ts`).
- Dispose-Gnaden der Subagent-Provider: `DEFAULT_DISPOSE_GRACE_MS = 3_000` in `subagent-claude-code` (`src/run.ts` Zeile 41), `subagent-codex` (`src/run.ts` Zeile 36), `subagent-acp` (`src/run.ts` Zeile 85) und `subagent-dsh-sdk` (`src/run.ts` Zeile 76); `DEFAULT_DISPOSE_EOF_GRACE_MS = 6_000` in `subagent-acp` (Zeile 82) und `subagent-dsh-sdk` (Zeile 73); `DEFAULT_SHUTDOWN_TIMEOUT_MS = 1_000` in `subagent-dsh-sdk` (Zeile 79). Alle Prozess-Gnaden müssen `<= MAX_TIMER_DELAY_MS` sein.
- Subagent-Provider-Standardnamen: `spawn` (spawn-in-process), `fork` (fork-in-process), `acp`, `claude-code`, `codex`, `dsh-sdk`.
- `workflow-ptc.maxConcurrentAgents`-Default ist **0 = ableiten** (nicht „null"), aufgelöst zu `Math.min(16, Math.max(1, availableParallelism() - 2))`.
- `MAX_JSON_INDENT_CHARS = 10` (`packages/core/tools/src/ptc.ts` Zeile 213) — danach wird das Ergebnis-JSON kompakt gerendert.
- SDK-Renderer-Limits für Python: `MAX_CLASS_NAME_BASE = 120`, `MAX_LIST_NESTING = 180` (`packages/core/tools/src/py-types.ts`) — 180 statt CPythons ~200 offenen Klammern, um den SDK-Block nicht zu zerlegen.
- `workflow-ptc`-Labelkürzung: 48 Zeichen (bei Überschreitung 47 Zeichen + `…`).

### 8.3 Gotchas und Invarianten (aus Kommentaren und Tests)
1. **`max-tokens` ist sticky**: ein späterer regulär kompletter Step darf das Turn-Ergebnis nicht auf `completed` herabstufen (`src/agent.ts` Zeile 343).
2. **Ein leerer erster Step beendet den Turn mit `completed`**, ohne einen Modellaufruf zu verbrauchen; die Turn-Grenze bleibt dennoch erhalten (Zeilen 326–329).
3. **Disposal latcht nie einen Weckruf** — der Teardown wartet auf keinen Modell-Turn (Zeile 220).
4. **Ein Wake, der im Idle gesendet wurde, öffnet immer seine Turn-Grenze**, auch wenn die Nachricht vor dem Beanspruchen geleert wird; nur ein gelatchter Replay wird unterdrückt, wenn die Queue den Wake nicht mehr hält (Zeilen 209–212).
5. **Waking-Input kann nie einer abgebrochenen Aktivität beitreten** — die Klassifikation wird **vor** dem Splice erfasst, damit ein reentranter Cancel sie nicht umwirft (Zeilen 156–158).
6. **Guards greifen nur nach `allow`**: ein `deny` aus dem Pre-Execute-Waterfall überspringt die Guards, und kein Guard kann eine Verweigerung in Erlaubnis wandeln.
7. **Eine kollabierte PTC-Direktanfrage durchläuft die Policy-Pipeline nicht** — Pre-Execute-Listener, Approval-`ask` und Guards dürfen sie nie sehen oder genehmigen. Bei bereits abgebrochenem Signal bleibt es beim kanonischen Abbruchergebnis statt `UNKNOWN_TOOL`.
8. **Der `finalizeContent`-Callback wird beim Start gebunden**, nicht bei der Nutzung — ein mutate-Arguments-Getter darf ihn während `snapshotJsonValue` nicht austauschen.
9. **Der Aufrufer-Signal wird restauriert**, damit Post-Execute-Listener nie das (möglicherweise bereits abgebrochene) Timeout-Signal des Wrappers sehen.
10. **Gestartete Arbeit wird nie abandonniert**: ein Abbruch nach Body-Aufruf ersetzt ein erfolgreiches Ergebnis durch `ABORTED`, ein tool-eigener strukturierter Fehler bleibt aber erhalten.
11. **Nur exakt `true` ist parallel**: unbekannt, fehlend, `false`, Nicht-`true` oder ein geworfener Klassifizierer sind exklusiv (Test `packages/core/tools/tests/execution-mode.spec.ts` Zeile 40 hält das ausdrücklich fest).
12. **`isConcurrencySafe` und `timeoutMs` erreichen nie das Modell** — `schemas()` und `sdkSchemas()` projizieren nur `name`, `description`, `parameters`, `deferLoading` (Test `execution-mode.spec.ts` Zeile 124).
13. **Die `tools/result`-Beobachtung ist nicht-vetierend**: das Live-Objekt wird vorher `Object.freeze`'d, jeder Listener-Fehler wird gewarnt und hat keinen Kanal ins Ergebnis.
14. **Argumente werden einmal geparst und dann tiefgefroren**; ungültiges JSON-Argument bleibt als **Rohstring** erhalten, leeres Argument wird `{}`.
15. **Abbruch-Synthetikergebnisse halten den Replay gültig**: übersprungene Aufrufe erhalten in Modellreihenfolge ein `tool/call` + `tool/result`-Paar mit `ABORTED_BEFORE_DISPATCH`.
16. **`tool/result.meta` muss JSON-serialisierbar sein** — `Session.append` validiert jedes Event-Datenfeld über `isJsonValue`; der Log reproduziert die identische Karte beim Replay (Kommentar `packages/core/session/src/types.ts` Zeilen 363–374).
17. **Meldungen-Ids müssen über beide Inbox-Listen eindeutig sein** — sonst `message "<id>" is already pending` (`src/inbox.ts` Zeile 47 und 223).
18. **`compaction/summary` und das folgende `user/message` müssen adjacent sein**; das Replacement zu `compaction/prune` muss **synchron direkt nach** dem Event angehängt werden.
19. **`shadowedRange` ist eine Surface-Positionsspanne**, kein numerischer Seq-Intervall — `start > end` ist nach einem früheren Replace zulässig.
20. **Ein lebendes `compaction/start`-Bracket darf keinen `turn/start`/`turn/end` überqueren**; das neueste unmatched `compaction/start` nach dem neuesten `session/end-seed` ist live und meldet `busy`, ein älteres ist stale.
21. **`approval.request()` verlangt einen offenen Turn** — sonst gilt das Audit-Paar als Crash-Tail-Müll beim Reload und der Aufruf wird verweigert.
22. **Die `'never'`-Policy entscheidet vor jedem Dispatch** — so kann keine Listener-Registrierungsreihenfolge die deterministische Ablehnung aushebeln.
23. **Bild-Offload kostet einen Provider-Versuch, aber kein Retry-Budget** und protokolliert kein `llm/retry`.
24. **`run_code`-Zeitbudget**: `timeoutMs`-Default und -Obergrenze kommen aus `runtime.timeout.defaultMs`/`.maxMs`; `0` deaktiviert die Deadline **nicht**. Für eine Runtime ohne `timeout`-Fähigkeit wirft `timeoutMs` `'timeoutMs is not available for this PTC runtime'`.
25. **PTC-Programme werden nie automatisch wiederholt**; Sandbox-Eskalation gilt für genau eine Programmausführung, verschachtelte Tools behalten ihre eigenen Policies.
26. **`workflow()`-Optionen sind geschlossen**: nur `label`, `phase`, `schema`, `provider`, `model`; `effort`, `isolation`, `agentType` werden mit eigener Meldung als deferred abgelehnt; jede andere Option wirft `UNSUPPORTED_OPTION`.
27. **Workflow-Combinators unterscheiden fatal von gewöhnlich**: ein fataler `WorkflowError` wird erneut geworfen, gewöhnliche Kind-/Stage-Fehler werden zu `null` — Fatality ist Host-`instanceof` und aus einem Script-Realm nicht fälschbar.
28. **Subagent-Delegation ist concurrency-safe, Subagent-Control nicht** — deshalb dürfen mehrere `subagent`-Aufrufe parallel laufen, `send_message`/`interrupt_agent`/`list_agents` nicht.
29. **`toolFilter` ohne `allow` und `deny` wird beim Laden abgelehnt**, und `agentOptions`/`toolFilter` haben bewusst `undefined` als Schema-Default, damit Schemastery kein `{}` bzw. `{ allow: [] }` materialisiert (was jedes Tool verbieten würde).
30. **`schedule` garantiert keine Exactly-once-Lieferung**: ein Crash oder Task-Schreibfehler nach dem Session-Flush kann dieselbe Erinnerung erneut liefern.
31. **Ein abgeschlossener Schedule-Target bleibt fällig**, auch wenn aktuelle tzdata die Regel davor platziert (`Math.max(candidate, savedTarget)`), und DST-Lücken werden übersprungen, Wiederholungen feuern einmal (früherer Instant).
32. **`message-feedback`-No-op-Mutationen flushen trotzdem** das aktuelle Prefix; ein fehlgeschlagener Flush rollt ein akzeptiertes Event **nicht** zurück (der Aufrufer kann mit der Version erneut lesen und retryen).
33. **Kalte `message-feedback`-Mutationen halten den Write-Handle über Read, Vergleich, Append, Flush und Close**; ein anderer Prozess mit Session-Write-Handle lässt sie rejecten.
34. **Ein Fork startet ohne geerbte Feedback-Einträge** (`inheritedEventCount` ist der Filter).
35. **`messageFeedback`-Notizvalidierung läuft vor dem Session-Lookup** — eine ungültige Notiz fasst Persistenz nicht an.
36. **`command-feedback` zählt genau einmal**: `recordInput: false` verhindert, dass der Text zusätzlich in `command/run.args` landet; Tests erzwingen, dass der Text im serialisierten Log genau einmal vorkommt.
37. **Der Agent-Loop besitzt das `tool/result`-Zitieren**: das Ergebnis zitiert die `tool/call`-Seq als `sourceEventSeqs`, nicht die Modellreihenfolge.
38. **Die Session-Projektion-Registry treibt eager**: jedes committete Event läuft durch `apply` jedes registrierten Units; ein Wechsel der State-Referenz berechnet den nächsten Client-View, und die Change-Feed wird nur bei `Object.is`-Ungleichheit benachrichtigt.
39. **Eine fehlende `inbox`- oder `turnBoundary`-Registrierung ist Capability-Absence**, kein korrupter Zustand — Leser ohne sicheren Fallback dürfen laut scheitern (Kommentar `packages/core/agent/src/types.ts` Zeilen 69–77).
40. **Zwei registrierte Config-Klassen im selben Paket**: `feedback/command-feedback` führt eine Modul-`inject = ['commands']` **und** eine `static inject = ['sessions']` der Serviceklasse; beide gelten je nach Mount-Kontext.

### 8.4 Nicht bestimmte Punkte
Folgende Fakten konnten im Rahmen dieser Inventur nicht abschließend belegt werden und sind bewusst als Lücke markiert statt geraten:
- Exakte Payload-Shapes der vier `tool-workflow/*`-Event-Typen (`ToolWorkflowRunStartData`, `ToolWorkflowAgentStartData`, `ToolWorkflowAgentEndData`, `ToolWorkflowRunEndData`) — die Typnamen und die Event-Namen sind belegt (`packages/workflow/tool-workflow/src/index.ts` Zeilen 73–78), die Feldlisten nicht.
- `goal/command-goal` und `subagent/tool-subagent-control`: ob überhaupt ein `Config`-Export existiert (in den gelesenen Dateien wurde keiner gefunden; die Command- bzw. Tool-Definitionen sind vollständig belegt).
- Exakte Feldliste des `Config` von `interaction/commands` und `interaction/user-questions`: beide Pakete definieren keinen `Config` in `src/*.ts`; ein Config aus einer anderen Quelle (z. B. Loader-Default) wurde nicht geprüft.
- Die genaue Zuordnung der einzelnen `Config`-Feldwerte in `compaction-basic` zu `Threshold`- vs. `Retention`-Pfad bei gleichzeitig gesetzten `modelPolicies` (die Auflösungsreihenfolge ist belegt, nicht jede Verzweigung getestet).

---

## 9. Abgleich mit dem Zielprojekt (Prometheus Harness)

Dieser Abschnitt ordnet das Vorlagen-Inventar der tatsächlich vorhandenen Struktur des Zielprojekts `C:\Users\Chang\prometheus-harness` zu. Grundlage ist das Verzeichnislisting des Zielprojekts und das dortige Mapping-Dokument `MAPPING.md` (Kapitel „3. Das vollständige Mapping", „5. Projektweites 1:1-Mapping", „6. Zuordnung je Zielsprache", „7. Schnittstellen-Mapping").

**Struktur des Zielprojekts (Top-Level, verifiziert):** `apps/` (`cli`, `desktop`, `desktop-host`, `web`), `services/` (`pmh-sandbox`, `pmh-supervisor`), `packages/`, `native/` (`atomicfs`, `crypto`, `flock`, `index`, `landlock-run`, `pty`, `system`), `python/` (`sdk`, `sdk-runtime`), `scripts/`, `snapshots/`, `benchmarks/`, `units/`, `docs/`, `target/`, `website/`, `patches/`, `assets/`, sowie `Cargo.toml`, `bun.lock`, `bunfig.toml`, `tsconfig.base.json`, `MAPPING.md`, `README.md`.

**Paketgruppen des Zielprojekts:** die Vorlagen-Struktur `packages/<gruppe>/<paket>` ist gespiegelt; unter `packages/` existieren unter anderem `core`, `compaction`, `goal`, `guard`, `interaction`, `preset`, `schedule`, `subagent`, `workflow`, `feedback`, `todo`, `plan`, `session`, `tools`, `api`, `host`, `llm`, `fs`, `shell`, `terminal`, `jobs`, `credentials`, `browser-use`, `computer-use`, `extensions`, `experimental`, `deliverables`, `attachment`, `boot`, `bundle`, `client`, `context`, `document`, `identity`.

**Sprachzuordnung nach `MAPPING.md`:** Der Agent-Core (Kernel) bleibt **TypeScript auf Bun** (Mapping-Stufe A, `MAPPING.md` Abschnitt 3.1); die Fähigkeits-Seams sind ebenfalls TypeScript auf Bun (Abschnitt 3.2); Session-Format, Persistenz und Daten bleiben TypeScript mit **zwei Rust-Diensten** (Abschnitt 3.4/6.2); Go trägt elf Dienste (Abschnitt 6.1), Rust sieben Komponenten (6.2), und der Rest liegt bei Bun/TS7 (6.3). Die Sprachverteilung ist damit **Go 11 / Bun-TS7 ~300 / Rust 7 / C 0 / Python 0** (`MAPPING.md` Abschnitt 4).

---

## 9a. Mapping-Tabelle: Vorlage (Python/C/C++) → Zielkomponente (Go · Bun/TS7 · Rust)

Diese Tabelle belegt die Zuordnung der Python-/C/C++-Anteile der Vorlage auf Zielkomponenten und die Erhaltungsanforderungen. Sie ist aus `MAPPING.md` (Abschnitte 3.1, 3.2, 3.8, 3.9, 7) übernommen und um die Zuordnung der von diesem Inventar erfassten Agent-Core-Pakete ergänzt.

### 9a.1 Python-Anteile

| Vorlage (Python) | Zielkomponente | Zielsprache | Erhaltungsanforderung |
|---|---|---|---|
| `python/sdk/src/deepseek_harness/models.py` (Datenmodelle des öffentlichen API) | `services/*/internal/api` (Typen) **und** `packages/sdk/protocol` (Typen) | **Go + Bun/TS7** | Feldnamen und Datenmodelle in beiden Sprachen **übereinstimmend** |
| `python/sdk/src/deepseek_harness/api.py` (API-Oberfläche) | HTTP-/JSON-RPC-Routen des Go-Dienstes **und** TS-SDK-Client | **Go + Bun/TS7** | Methodennamen und Parameter **wörtlich** |
| `python/sdk/src/deepseek_harness/client.py` (Transport/Client) | `packages/sdk/client` | **Bun/TS7** | Framing und Aufrufsemantik |
| `python/sdk/src/deepseek_harness/errors.py` (Fehlertypen) | Fehlercodes in Go **und** TS | **Go + Bun/TS7** | Fehlercodes müssen übereinstimmen |
| `python/sdk/src/deepseek_harness/__init__.py` | — (Paketoberfläche) | — | entfällt |
| `python/sdk/pyproject.toml`, `uv.lock` | — | — | **entfällt** (Stufe E: kein Python im Zielprojekt) |
| `python/sdk/examples/minimal.py` | Go-Beispiel `services/…/examples/minimal` **und** `packages/sdk/examples/minimal.ts` | **Go + Bun/TS7** | Beispiel muss die Oberfläche zeigen |
| `packages/core/tools/src/py-types.ts` (**kein** Python-Backend) | `packages/core/tools/src/py-types.ts` | **Bun/TS7** | Dieses Modul **erzeugt** nur Python-Quelltext als Prompt-Baustein (`renderToolsSdkPy`); es ist PTC-SDK-Renderer, kein zu portierender Python-Code. Der Ziel-Port muss den Renderer erhalten, weil `SDK_RENDERERS` genau `typescript` und `python` kennt. |
| **Ein Python-Client wird nicht nachgebaut** (`MAPPING.md` §3.9) | — | — | Begründung: TS ist Oberflächen-/Core-Sprache, Go Dienstsprache; ein dritter Client hätte keinen Aufrufer. Falls doch benötigt: eigenes Unit `units/python-client`, ausdrücklich außerhalb des Backends. |

### 9a.2 C-Anteile

| Vorlage (C) | Zielkomponente | Zielsprache | Erhaltungsanforderung |
|---|---|---|---|
| `main.c` (Landlock-Ruleset setzen, dann `execvp`) | `native/landlock-run` | **Rust** | CLI **wörtlich** (`--ro`/`--rw`/`--`/`--probe`), Fail-closed `Exit 125 ohne exec`, `no_new_privs` **vor** der Restriktion, ABI-Verhandlung bis ABI 5, Teil-Durchsetzung akzeptiert (eine stderr-Zeile), Report-Zeilen **wörtlich** (`landlock: fully enforced`, `landlock: partially enforced (older ABI)`, `landlock-run: partial enforcement (older Landlock ABI)`, jede Fatalzeile mit Präfix `landlock-run: `), Kind-Status unverändert durchgereicht, **keine** Env-Eingabe, Nicht-Verzeichnis-Grant behält nur dateikompatible Bits. Umsetzung über `libc`/`rustix`-Syscalls statt roher C11-UAPI ist erlaubt (Implementierung, nicht Verhalten). |
| `flock.c` + `flock.ts` (Node-API-Addon `tryLock(fd, callback(errno))`) | `native/flock` als **Prozess** `pmh-flock --fd <n> --json` | **Rust** | `flock(fd, LOCK_EX \| LOCK_NB)`; der Prozess öffnet/dupliziert/schließt/entsperrt das fd **nie**; Fehlerfelder `code` (z. B. `EAGAIN`), **positives** `errno`, `syscall: 'flock'`; `ERR_FLOCK_UNSUPPORTED_PLATFORM` bleibt; Windows behält die Semaphore im JS (Rust-`flock` nur POSIX); die glibc/musl-Unterscheidung entfällt (statisch gelinkte Binärdatei); die 17 Verhaltensbedingungen aus `flock-contract.md` werden als Rust-Tests nachgebaut; `test/fixtures/flock-oracle.c` entfällt, weil der Dienst selbst der Syscall-Aufrufer ist. |
| Plattformpakete `native/system/packages/{linux-x64,linux-arm64,darwin-x64,darwin-arm64}` | `native/*/packages/<triple>/` | **Rust + TS** | Muster übernehmen: ein Paket je Triple, Auswahl über `os`/`cpu` |
| `native/system/scripts/*.mjs` + `build.ts` | Rust-Build + `cargo` + ein Release-Skript | **Rust** | Buildkette auf `cargo` umstellen |
| `native/system/test/*.test.js` + Fixtures | `native/*/tests/` in Rust (`#[test]`) | **Rust** | Verhalten übernehmen |
| `vendor/*` (9 vendored Cordis-Pakete) | Cordis als **Abhängigkeit** | **Bun/TS7** | **kein** Vendor-Baum; Cordis nicht nachbauen |

### 9a.3 Agent-Core-Pakete dieses Inventars

| Vorlage | Zielkomponente | Stufe | Zielsprache | Erhaltungsanforderung (Schnittstellen) |
|---|---|---|---|---|
| `packages/core/scope` | `packages/core/scope` | A | Bun/TS7 | `Scoped<T>`, `createScope`, Carrier, `ScopedLayers` |
| `packages/core/session` | `packages/core/session` | A | Bun/TS7 | Session-Log, Surface, `ctx.sessions`, Format **Version 4** mit Feldnamen, Record-Form und Header; Migrationskette v0→v4 vollständig |
| `packages/core/agent` | `packages/core/agent` | A | Bun/TS7 | `ctx.agents`, Inbox-Vokabular, alle `agent/*`-Events |
| `packages/core/agent-loop` | `packages/core/agent-loop` | A | Bun/TS7 | Turn-/Step-Zustandsmaschine, `TurnEndReason`, Projektionen `turnBoundary` (2) und `inbox` (1) |
| `packages/core/agent-default-model` | `packages/core/agent-default-model` | A | Bun/TS7 | `ctx.agentDefaultModel`, `ModelSelection` |
| `packages/core/agent-tool-presentation` | `packages/core/agent-tool-presentation` | A | Bun/TS7 | Row `tool-presentation` mit `mode: native \| ptc` |
| `packages/core/system-prompt` | `packages/core/system-prompt` | A | Bun/TS7 | Sections, Contexts, Variablen, `system-prompt/assemble` |
| `packages/core/tools` | `packages/core/tools` | A | Bun/TS7 | Tool-Registry + Ausführungspipeline, Event-Namen `tools/pre-execute`/`execute`/`post-execute`/`result`/`change`, Tool-Name `run_code` reserviert |
| `packages/guard/*` (2) | `packages/guard/*` | A | Bun/TS7 | Plugin-Anatomie `name`/`inject`/`Config`/`apply` wörtlich; `TOOL_TIMEOUT` |
| `packages/goal/*` (4) | `packages/goal/*` | A | Bun/TS7 | `goal/change`, `goal/changed`, Projektion `goal` (6) |
| `packages/plan/plan-mode` | `packages/plan/plan-mode` | A | Bun/TS7 | `plan/mode`, `EXIT_PLAN_MODE`, Projektion `plan` (3) |
| `packages/todo/tool-todo` | `packages/todo/tool-todo` | A | Bun/TS7 | `todo/write`, Projektion `todos` (2) |
| `packages/interaction/*` (5) | `packages/interaction/*` | A | Bun/TS7 | `approval/*`, `permission/preset`, `command/run`/`command/done`, `user-questions/request`, Projektionen `permissions` (2), `userQuestions` (2) |
| `packages/workflow/*` (3) | `packages/workflow/*` | A | Bun/TS7 | `workflow/*`-Events und `WorkflowErrorCode` |
| `packages/subagent/*` (9) | `packages/subagent/*` | A | Bun/TS7 | `subagent/*`-Events, Provider-Namen, Projektionen `subagent` (2), `subagentTiming` (3), `subagentCatalog` (6), `subagentModelSelectionPolicy` (1) |
| `packages/compaction/*` (5) | `packages/compaction/*` | A | Bun/TS7 | `compaction/*`-Events, `image/offload`, Adjazenz- und Surface-Invarianten |
| `packages/preset/*` (3) | `packages/preset/*` | A | Bun/TS7 | `agent-preset/selected`, Projektion `agentPreset` (1), Persona-Section-Namen |
| `packages/schedule/*` (2) | `packages/schedule/*` | A | Bun/TS7 | `schedule/change`-Vokabular, Storage-Domain `schedule` v1, vier Tool-Namen |
| `packages/feedback/*` (2) | `packages/feedback/*` | A | Bun/TS7 | `feedback/record`, `feedback/message-put`/`-delete`, `feedback/committed` |
| — (**kein** Python-/C-Anteil im Agent-Core) | — | — | — | Der Agent-Core der Vorlage ist **ausnahmslos TypeScript**; es gibt in diesem Inventarbereich nichts, was aus Python oder C/C++ kopiert werden könnte (`MAPPING.md` §9: „Python-Code im Zielprojekt: keiner", „C/C++-Code im Zielprojekt: keiner"). |

**Schnittstellen-Erhaltung generell** (`MAPPING.md` §7): Cordis-`ctx.*`-Seams bleiben identisch in TS, und die Plugin-Anatomie `name` / `inject` / `Config` / `apply(ctx, config)` wird **wörtlich** beibehalten; Session-JSONL-Format Version 4, Frame-/Event-Namen und Fehlercodes ebenfalls wörtlich.

**Nachweis „keine Python-/C++-Kopie"** (`MAPPING.md` §9): übernommen werden nur **Verhaltensvorgaben** — CLI-Grammatik, Exit-Codes, Report-Zeilen, Fehlerfelder, Formatversionen, Event- und Methodennamen, Fehlercodes. Die Quellvorlage wurde in dieser Analyse ausschließlich lesend verwendet (verifiziert: keine Datei unter `C:\Users\Chang\harness\prometheus-harness` in den letzten 6 Stunden geändert).

**Konsequenz für dieses Inventar:** Sämtliche in den Abschnitten 2–7 beschriebenen Typen, Event-Namen, Tool-Namen, Projektions-Keys und `Config`-Felder sind die **verhaltensverbindliche Referenz** für die Zielimplementierung, unabhängig davon, in welcher Zielsprache die jeweilige Komponente liegt. Die Beibehaltung der Bezeichner (`agent/pre-step`, `tools/post-execute`, `run_code`, `inbox`, `turnBoundary`, `stateVersion`, …) ist Teil der Schnittstellen-Erhaltung, nicht Zierde.

**Umsetzungsstand im Zielprojekt (verifiziert am 12.10.2026):**

| Beobachtung | Beleg | Bedeutung |
|---|---|---|
| Die Zielverzeichnisse der Agent-Core-Pakete **existieren als leere Hüllen**: `packages/core/agent`, `agent-loop`, `agent-default-model`, `agent-tool-presentation`, `scope`, `session`, `system-prompt`, `tools` sind vorhanden, enthalten aber **keine Dateien**. | Verzeichnislisting `C:\Users\Chang\prometheus-harness\packages\core\*` (rekursiv: 0 Dateien in `packages/core/agent-loop`) | Die Struktur ist gescaffoldet; die Agent-Core-Implementierung ist noch **nicht** vorhanden |
| Der Ziel-`README.md` führt als Stand ausdrücklich **„Phase: Konzept. Es läuft noch kein eigener Code."** | `README.md` Zeilen 31–33 | Deckt sich mit der leeren `packages/core`-Struktur |
| Go ist teilweise real umgesetzt: `services/pmh-supervisor` hat `cmd/pmh-supervisor/main.go`, `internal/api/{api,server,server_test}.go`, `internal/config/{config,yaml,config_test}.go`, `internal/env/env.go`, `internal/supervisor/*` (inkl. `procattr_posix.go`, `debugflow_test.go`) und ein eigenes `go.mod`. | Dateilisting + `services/pmh-supervisor/go.mod` | Die Go-Schiene ist begonnen (Supervisor zuerst, wie in `MAPPING.md` §8 vorgesehen) |
| Ein Rust-Buildverzeichnis `target/{debug,release,tmp,x86_64-unknown-linux-gnu}` existiert auf oberster Ebene; ein Root-`Cargo.toml` ist vorhanden, ein Root-`go.mod` nicht. | `target/`, `Cargo.toml` (Test-Path True), `go.mod` (Test-Path False) | Rust-Builds wurden ausgeführt; kein Root-Go-Modul (Go liegt je Dienst) |

**Daraus folgt:** Build-/Testaussagen für den **Agent-Core** sind derzeit nicht möglich, weil dort noch kein Code existiert. Nachweisbar ist nur die Struktur-Gleichheit der Scaffolds mit der Vorlage sowie der begonnene Go-Service `pmh-supervisor`. Ein Ausführen von Builds/Tests war nicht Teil dieses Inventar-Auftrags und wurde nicht durchgeführt; das Ziel-`README.md` dokumentiert außerdem einen früheren Fremd-Build des **Referenz-Forks** (`pnpm run build` → exit 0, 212,9 s) und einen TS-7-Typecheck des Harness-Codes in 12,7 s — beides betrifft die **Vorlage**, nicht die Zielimplementierung.

**Bewusst nicht übertragen (laut `MAPPING.md` Abschnitt 3.10):** dort als „Stufe E" geführte Punkte; sie sind nicht Teil dieses Inventars.

---

## 10. Abweichungen und offene Punkte

| # | Beobachtung | Belegstelle | Bewertung |
|---|---|---|---|
| A1 | Die Vorlage führt **kein** Python- oder C++-Backend im Agent-Core; die Pakete sind ausnahmslos TypeScript. Der Auftrag „kein Python-/C++-Copy-Paste" ist damit für dieses Inventar gegenstandslos — es gibt im Agent-Core nichts, was kopiert werden könnte. | alle `packages/core/agent*/src/*.ts`, `packages/core/tools/src/*.ts` | Kein Mangel; reine Feststellung |
| A2 | Die Vorlage enthält sehr wohl Python- und C-Anteile, aber außerhalb des Agent-Core (`packages/core/tools/src/py-types.ts` erzeugt nur **Python-Quelltext als Prompt-Baustein**; `MAPPING.md` Abschnitt 3.8/3.9 führt die C-Programme und das Python-SDK). | `packages/core/tools/src/py-types.ts`, `packages/core/tools/src/ptc.ts` | Für das Mapping relevant, nicht für dieses Inventar |
| A3 | Zwei Config-Träger pro Paket sind möglich (`feedback/command-feedback`: Modul-`inject` **und** `static inject`). Eine Portierung, die nur `static inject` liest, verliert die Command-Bindung. | `packages/feedback/command-feedback/src/index.ts` Zeilen 40–41, 86 | Risiko bei mechanischer Übertragung |
| A4 | Der Zustand von `verbindlichen` Projektions-Keys ist **nicht** frei wählbar: die `stateVersion`-Zahlen (u. a. `goal` 6, `subagentCatalog` 6, `turnBoundary` 2, `permissions`/`userQuestions`/`todos` 2) sind Persistenz-Formatangaben. Eine Portierung mit anderen Zahlen bricht gespeicherte Snapshots. | Abschnitt 7 dieser Datei | Risiko, falls Snapshots geteilt werden |
| A5 | Der Loop verlässt sich auf ordnungsrelevante Semantik, die in einer Neuimplementierung leicht verloren geht: Sticky-`max-tokens`, Latch-Verhalten bei Disposal, Wake-vor-Splice-Klassifikation, Ordering der Commits über zusammenhängende Slots. | Abschnitt 3 und 8.3 dieser Datei | Hauptrisiko des Ports |
| A6 | Die Cordis-Schicht (Waterfall/Serial/Emit, `Scoped`-Carrier, `ctx.effect`-Disposer-Identität) ist kein Nebendetail: Guards, Policy-Reihenfolge, Scoping und Teardown-Reihenfolge hängen daran. | `packages/core/scope/src/*.ts`, `packages/core/tools/src/index.ts` | Hauptrisiko des Ports |
| A7 | Vier Tools sind parallelfähig, alle anderen nicht; die Regel ist fail-closed (`nur exakt true`). Eine Portierung, die „unbekannt = parallel" annimmt, erzeugt Datenrennen. | `packages/core/tools/src/index.ts` Zeilen 1309–1318 | Risiko bei abweichender Klassifizierung |
| A8 | `approval.request()` verlangt einen offenen Turn; ein Port ohne diese Vorbedingung erzeugt Crash-Tail-Events, die beim Reload als Müll gelten. | `packages/interaction/user-approval/src/index.ts` Zeilen 217–223 | Risiko bei Persistenz-Port |
| A9 | Die Event-Verzeichnisse `KNOWN_SESSION_EVENT_TYPES` (54 Typen) und `MESSAGE_PROJECTION_EVENT_TYPES` (nur `image/offload`) sind **generiert** (`scripts/gen-persistence-catalog.ts`) und werden über `pnpm run verify-persistence-catalog` geprüft. Ein Port, der eigene Event-Namen ohne Katalogeintrag schreibt, bricht diese Prüfung. | `packages/core/session/src/known-event-types.ts` | Prozess-/Tooling-Risiko |
| A10 | Zwei Pakete dieses Inventars emittieren **nachweislich keine** Session-Events aus eigenem Code, obwohl sie Zustand halten: `schedule/schedule` (liest `schedule/change`, schreibt es nie) und `interaction/commands` (schreibt über den Registry-Pfad). Ein Port, der dort Appends erwartet, sucht an der falschen Stelle. | `packages/schedule/schedule/src/index.ts`, `packages/interaction/commands/src/index.ts` | Verständnisrisiko |
| A11 | Die in Abschnitt 8.4 gelisteten Lücken (Payload-Feldlisten der `tool-workflow/*`-Events, Config-Existenz bei `command-goal`/`tool-subagent-control`, Config-Feldlisten bei `commands`/`user-questions`) sind **nicht** durch dieses Inventar belegt und müssen vor einer Portierung dieser vier Stellen separat verifiziert werden. | Abschnitt 8.4 | Offener Punkt |
| A12 | Der Nutzerhinweis zum DSH-Verhalten (kein browserseitiges Chat-Caching, große Verläufe destabilisieren Browser-Reloads) betrifft nur die Arbeitstechnik dieser Analyse, nicht das Inventar. Dieses Dokument wurde als einzelne Datei geschrieben, um Verlaufslast gering zu halten. | Sitzungskontext | Kein Mangel |
| A13 | **Der Agent-Core ist im Zielprojekt noch nicht implementiert**: die acht Zielverzeichnisse unter `packages/core/` existieren, enthalten aber keine Dateien; der Ziel-`README.md` sagt „Phase: Konzept. Es läuft noch kein eigener Code." | Verzeichnislisting `C:\Users\Chang\prometheus-harness\packages\core\*`, `README.md` Zeilen 31–33 | **Offener Punkt mit Priorität**: dieses Inventar beschreibt die Vorlage, nicht einen vorhandenen Zielcode. Build-/Testaussagen zum Agent-Core sind deshalb nicht möglich. |
| A14 | Go ist im Zielprojekt teilweise real: `services/pmh-supervisor` mit `cmd/`, `internal/api`, `internal/config`, `internal/env`, `internal/supervisor` und eigenem `go.mod`. Rust-Buildverzeichnisse (`target/*`) existieren; ein Root-`go.mod` fehlt (bewusst, Go liegt je Dienst). | Dateilisting `services/pmh-supervisor`, `target/`, `Cargo.toml`/`go.mod` | Kein Mangel; belegter Teilfortschritt außerhalb des Agent-Core |

---

## 11. Mindest-Inhalt, Reihenfolge und Verifikation dieser Datei

- Abschnitt 1: Kopf (Was, Quelle, Datum, Read-only-Charakter).
- Abschnitt 2: 45 Paket-Unterschriften mit Pfad, npm-Name, Zweck, `inject`, `Config`, Serviceklassen + Methodensignaturen, exportierte Typen, Session-Events, Cordis-Events, interne Abhängigkeiten.
- Abschnitt 3: Agent-Loop im Detail (Phasen-Zustandsmaschine, Turn-Öffnen/-Schließen, Stepschleife, Batching/Ordering, Parallel-vs-Exklusiv, `TurnEndReason`, `AgentCancelCause` und alle Abbruchpfade, Inbox-/Steering-Modell, Runtime-Context- und System-Prompt-Assembly pro Step, alle `agent/*`-Events).
- Abschnitt 4: Tool-Pipeline im Detail (`tools/pre-execute` → Guard → `tools/execute` → `tools/post-execute` → `tools/result`), Entscheidungsvokabulare, Native vs. PTC, `ToolExecutionMode`, Scheduler-Vertrag, Timeouts, Fehlercodes/-texte).
- Abschnitt 5: vollständige Tool-Tabelle (Name → Paket → Zweck → konkurrenzsicher).
- Abschnitt 6: vollständige Session-Event-Tabelle (Typ → appendendes Paket → Payload).
- Abschnitt 7: Projektions-Keys mit `stateVersion` und Inhalt.
- Abschnitt 8: harte Fakten (Defaults, Limits, Schwellen, Versionen, Gotchas) plus die Liste der nicht bestimmten Punkte.
- Abschnitt 9: Abgleich mit dem Zielprojekt (Struktur, Sprachzuordnung, Umsetzungsstand).
- Abschnitt 9a: **Mapping-Tabellen** — Python-Anteile, C-Anteile und die Agent-Core-Pakete dieses Inventars, je Vorlage → Zielkomponente → Zielsprache → Erhaltungsanforderung, plus Schnittstellen-Erhaltung und der Nachweis „keine Python-/C++-Kopie".
- Abschnitt 10: Abweichungen und offene Punkte.
- Abschnitt 11: dieser Verifikationsabschnitt.

**Nicht gelesen:** `C:\Users\Chang\prometheus-harness\docs\dsh` und `C:\Users\Chang\prometheus-harness\docs\design` — beide Ordner wurden in dieser Analyse nicht geöffnet.

**Keine Änderung an der Vorlage:** unter `C:\Users\Chang\harness\prometheus-harness` wurden ausschließlich Lesezugriffe ausgeführt.
