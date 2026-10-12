# Voice input

[English](voice-input.md) | 中文

Experimental speech recognition involves three roles: the [Service Definition](../../packages/experimental/speech-to-text/README.zh.md) routes named Providers, the [SenseVoice Provider](../../packages/experimental/speech-to-text-sensevoice/README.zh.md) owns local inference, and the [Remote consumer](../../packages/experimental/api-speech-to-text/README.zh.md) serves the browser. The [optional Bundle](../../packages/experimental/voice-input-bundle/README.zh.md) composes them with the microphone UI.

## Provider selection

`SpeechProviderId` brands the registration identity. `SpeechProviderInfo` carries a display name, supported `languages` hints, and a `host-local` or `cloud` processing location. `SpeechRequest` carries the WAV bytes and an optional Provider and language selection; `resolve()` produces a `SpeechSpec` that pins one Provider instance. A missing Provider or an unsupported language produces an error; replacement or withdrawal invalidates an already resolved task. Audio never falls back to another Provider.

`SpeechProvider.transcribe()` receives the complete `SpeechInput` and an `AbortSignal`. `Transcript` returns the plain `text`, `audioSeconds`, and `inferenceSeconds`. Providers respond to cancellation and finish their tasks before deregistration completes. A local Provider runs calls serially, bounds its queue, and manages worker-process lifetime independently of any Session.

## Browser and Host ownership

The browser owns the microphone track and the unsent draft. `TranscriptionRequest` sends canonical base64 PCM16 WAV through the authenticated Remote. `SpeechCatalog` publishes the available Providers, the default selection, and the recording byte and duration limits. The API validates these process inputs before recognition.

The input facade captures a versioned selection before recording. `InputActions.insertText()` inserts one undoable plain-text edit only when the selection version is still valid and the commit state permits editing. When the insertion is rejected, the transcribed text is retained for explicit insertion. Switching Session or disposing the plugin invalidates late results. Recognition itself writes no Session event; the ordinary user submission owns the final model-visible text.

## Preparation and settings

`SpeechProviderInfo.downloadSources` publishes the preparation-phase sources. `SpeechPreparationOptions.downloadSource` selects one source for a single task; omission keeps the provider policy. SenseVoice validates the published options, pins the manually specified source without falling back, and rejects a source change during preparation. The UI retains the choice for a retry in the current card but does not save it as a recognition preference.

The Host Provider owns one preparation task across page and Session changes. The Client shares one `follow()` subscription across the input box, the installation-guidance dialog, and the Bundle detail. The optional `SpeechSetupEstimate` metadata provides per-Provider resource expectations, separate from measured progress. `SpeechPreparationStepKind` identifies ordered resource operations; `SpeechPreparationStep` records each step's status and start time. The complete `SpeechPreparationState` retains these steps after cancellation or failure. The collapsed UI shows the current operation, expansion lists all steps, and only the in-progress step shows byte progress or wait time. Closing an observer does not cancel preparation. Validated files continue to be reused across retries and idle-process reclamation.

A preparation failure can include `SpeechDownloadFailure`, providing the file, download source, reason category, and an optional error code or HTTP status. The Client localizes the recovery advice; the raw download error stays on the Host.

Microphone use occupies `conversation.input.activity` between the model selector and the send button. Clicking starts recording and expands the toolbar; stopping transcribes and inserts into the draft. The activity bar retains the editor and submit button, owns local feedback, and releases the expanded state on unmount. Cancellation, Escape, or hiding the page discards the recording. The waveform history shows measured microphone volume. The Bundle detail contains recognition preferences, preparation state, and progress. When explicitly enabled, `plugins.bundle.activation` guides users who lack a model to the installation; the list shows only the Bundle description and a switch.

## Design rationale

The [voice input decision](../../.agents/notes/implemented/architecture/2026-09-16-experimental-voice-input.zh.md) explains transient audio, explicit Provider selection, and deferred preparation of the local runtime.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxspeechcontroller--speechcontroller"></a>

### `ctx.speechController` — `SpeechController`

Speech calls never activate or submit to an Agent.

```ts cordis-catalog
/**
 * Read provider choices without preparing a recognizer.
 * @returns available providers, resolved default, and recording limits.
 */
@Remote catalog(): SpeechCatalog

/**
 * Follow provider readiness independently of Session and preparation lifetimes.
 * @param signal - Client observation lifetime.
 * @returns initial and subsequent complete readiness snapshots.
 */
@Remote({ mode: 'stream' }) async *follow(signal: AbortSignal): AsyncIterable<SpeechCatalog>

/**
 * Persist the user's recognition preferences.
 * @param patch - changed preference fields.
 * @returns after preferences are saved.
 */
@Remote configure(patch: SpeechSelectionPatch): Promise<void>

/**
 * Start or join one Host-owned preparation task.
 * @param providerId - selected recognizer.
 * @param options - task-local source selection validated by the provider.
 */
@Remote prepare(providerId: SpeechProviderId, options?: SpeechPreparationOptions): void

/**
 * Explicitly cancel resource preparation.
 * @param providerId - selected recognizer.
 * @returns after the preparation task settles.
 */
@Remote cancelPreparation(providerId: SpeechProviderId): Promise<void>

/**
 * Validate and transcribe one recording through the explicit provider selection.
 * @param request - canonical WAV encoded as base64, provider id and language hint.
 * @param signal - Client cancellation or Remote contribution disposal.
 * @returns final transcript without adding a Session event.
 */
@Remote async transcribe(request: TranscriptionRequest, signal: AbortSignal): Promise<Transcript>
```

Source: [`packages/experimental/api-speech-to-text/src/index.ts`](../../packages/experimental/api-speech-to-text/src/index.ts)

<a id="ctxspeechtotext--speechtotext"></a>

### `ctx.speechToText` — `SpeechToText`

Registry shared by all transcription consumers in one Host composition.

```ts cordis-catalog
/**
 * Register one recognizer; duplicate ids fail without replacing the original.
 * @param provider - recognizer owned by the contributing fiber.
 * @returns idempotent disposer which rejects admission, cancels, and joins accepted work.
 */
register(provider: SpeechProvider): () => Promise<void>

/**
 * Read the current recognizer roster.
 * @returns available provider facts in registration order.
 */
listProviders(): readonly SpeechProviderInfo[]

/**
 * Observe complete readiness snapshots; a slow reader coalesces intermediate progress.
 * @param caller - observer lifetime, independent of any preparation task.
 * @returns an initial snapshot followed by the latest provider states.
 */
async *follow(caller: AbortSignal): AsyncIterable<SpeechSnapshot>

/**
 * Read provider readiness and current user preferences together.
 * @returns one detached complete observation.
 */
snapshot(): SpeechSnapshot

/**
 * Persist changed selection fields into this plugin's profile entry; the resulting language must be accepted by the selected provider.
 * @param patch - explicit provider or language changes.
 * @returns after the profile write and the live update it applies.
 */
async configure(patch: SpeechSelectionPatch): Promise<void>

/**
 * Start or join provider-owned preparation.
 * @param id - exact registered provider identity.
 * @param options - task-local source selection validated by the provider.
 */
prepare(id: SpeechProviderId, options?: SpeechPreparationOptions): void

/**
 * Explicitly cancel provider preparation without tying it to a browser connection.
 * @param id - exact registered provider identity.
 * @returns after the preparation task settles.
 */
async cancelPreparation(id: SpeechProviderId): Promise<void>

/**
 * Apply composition defaults and capture the selected provider. Missing providers and unsupported languages fail explicitly.
 * @param request - complete recording and optional selection.
 * @returns provider-pinned input for transcribe().
 */
resolve(request: SpeechRequest): SpeechSpec

/**
 * Execute exactly the resolved provider; no fallback sends audio elsewhere.
 * @param spec - resolved input; a withdrawn or replaced registration is rejected.
 * @param signal - caller cancellation.
 * @returns final transcript after provider settlement.
 */
async transcribe(spec: SpeechSpec, signal: AbortSignal): Promise<Transcript>
```

Source: [`packages/experimental/speech-to-text/src/index.ts`](../../packages/experimental/speech-to-text/src/index.ts)
<!-- END GENERATED cordis-surface -->
