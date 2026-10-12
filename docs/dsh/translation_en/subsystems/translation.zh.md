# Text translation

[English](translation.md) | 中文

The experimental [translator](../../packages/experimental/translator/README.zh.md) translates text through a login-free browser endpoint or an explicitly selected paid native Flash route. Consumers own presentation, scheduling, and Session activation; a Session-bound request retains a reusable result through the active Session's writer.

## Requests and results

`TranslationProvider` selects `bing`, `google`, `deepseek-account`, or `deepseek-official`. `TranslationRequest` supplies `text`, `targetLanguage`, and optional `sourceLanguage`, `provider`, and a branded `sessionId`. `resolve()` writes the explicit route into a `TranslationSpec`: the configured default Provider is Bing, and an omitted source language is auto-detected. Common Chinese locale tags map to the selected Provider's language codes. `translate()` returns the selected Provider's translated plain text.

The service publishes the configured `maxTextChars` in UTF-16 code units. Consumers split oversized input before requesting translation. Every call limits the response bytes and counts the response-body read toward its timeout. Caller cancellation and service unload both abort accepted requests; unload waits for those requests to finish.

## Failures and data handling

`TranslationError`'s `TranslationErrorCode` distinguishes text limit exceeded, HTTP failure, invalid response, response limit exceeded, the service's own timeout, and request failure. `TRANSLATION_SESSION_REQUIRED` rejects a missing persistence backend or Session, `TRANSLATION_SESSION_INACTIVE` rejects an inactive Session with a cache miss before calling a Provider, and `TRANSLATION_STORAGE_ERROR` rejects an invalid saved record or a persistence failure. Provider error messages omit the submitted text and the response body. No other Provider is selected on failure. Responses are validated as external JSON and redirects are rejected.

`TRANSLATION_UNAVAILABLE` rejects a missing active built-in owner or registered route, unconfigured credentials, absence of an exact `deepseek-flash` in the catalog, a change to the owner/model list/official credential reference before dispatch, provider unload, and a post-preparation call whose reasoning effort is not `off`. A native `finish` with reason `error` maps to `TRANSLATION_REQUEST_FAILED`; a missing finish or any other non-`stop` reason maps to `TRANSLATION_INVALID_RESPONSE`.

Google receives the source text in a form POST body; Bing receives it in a JSON POST body. Both are remote services. A login-free endpoint guarantees neither the availability nor the free quota of a developer API. Regional connectivity must be verified on the user's network.

## Persisted translations

Session-bound calls use `plugin:translator/request` and `plugin:translator/result` for all Providers. The request retains the exact source text, language tags, selected Provider, and translation rule identity, and a successful result references the request sequence number. Optional request metadata holds Provider-specific detail without changing the record type. The translator completes the request checkpoint before external dispatch and the result checkpoint before returning. A read-only cache lookup precedes the Provider call and requires no active Session; a failed or incomplete attempt provides no reusable translation. New records use the active Session's existing writer. The translator opens no write handle and activates no Session. Translation records preserve the original events and model input. An anonymous call without a Session stays stateless; a paid route requires a Session. Future format migrations retain experimental records on a best-effort basis.

A paid cache miss requires the built-in account or official API owner to be active, credentials to be configured, and the catalog to contain a model whose ID is exactly `deepseek-flash`; name and version tags take no part in matching, and pi-ai routes are excluded. Each miss prepares one separate plain-text query with thinking off. The exact configuration, system instructions, and the unique source fragment are saved in the optional `metadata.modelRequest` of the same request record. Reading a saved result precedes this admission, so missing credentials do not invalidate an existing translation. The native request extension receives no main-Session identity and cannot upload its complete log.

## Reasoning-content display

The [optional Bundle](../../packages/experimental/cot-translation-bundle/README.zh.md) composes the translator with a [GUI consumer](../../packages/experimental/client-ui-cot-translation/README.zh.md). Its `cotTranslation` Remote serves authenticated browser calls. When the Session is inactive and no saved result exists, the Host waits for the Session controller's normal activation and retries once. Activation retains the normal preset hooks, resume markers, and interrupted-turn repair; cancellation ends the caller's wait and prevents a subsequent translation call, without cancelling shared activation. The Bundle setting selects the translation service and target language; `auto` follows the current interface language.

`CotTranslationPreferences` contains the accepted translation service and target language. `CotTranslationSnapshot` returns these preferences together with the translator's current `maxTextChars` and available service IDs. The browser reads this Host snapshot before registering the translation controls, including when local settings storage is unavailable. An accepted settings update and a reconnect refresh both values; when the request length limit changes, requests for expanded content are cancelled and re-chunked.

The GUI registers into the Session-scoped `conversation.chat.reasoning.body` single Slot, replacing the Chat default entry. Both entries reuse the official `conversation.chat.reasoning.content` factory; the translation wrapper selects the display text, maintains its own toolbar and view state, passes its own localized labels, and does not reimplement Markdown rendering. When enabled, the GUI translates only complete paragraphs and the request-length prefix of streaming long paragraphs after expansion, restoring completed results from the current Session; the local cache only optimizes the currently expanded region. An unfinished trailing fragment keeps its source text. The source text is always reachable. Closing the expanded content, switching Provider or language, and unloading the plugin all cancel unfinished calls and ignore late results. On Provider failure the source text is kept and an explicit retry is required; a translation never replaces the original Session event or model input.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcottranslation--cottranslationcontroller"></a>

### `ctx.cotTranslation` — `CotTranslationController`

Optional reasoning translation delegates Session-bound storage to the translator.

```ts cordis-catalog
/**
 * Read accepted translation preferences and the current request limit without sending text.
 * @param signal - browser query cancellation or Remote contribution withdrawal.
 * @returns authoritative preferences, eligible routes, and maximum UTF-16 text length per request.
 */
@Remote async limits(signal: AbortSignal): Promise<CotTranslationSnapshot>

/**
 * Translate one displayed fragment through the reader's selected provider.
 * @param request - original text and Session identity supplied by the Client; provider and explicit
 * target language match accepted preferences, while auto uses the browser locale.
 * @param signal - browser cancellation or Remote contribution withdrawal.
 * @returns translated text; an uncached inactive Session joins ordinary GUI activation before retry.
 * Failures omit the source and provider response. Cancellation stops this caller's wait, not shared activation.
 */
@Remote async translate(request: TranslationRequest, signal: AbortSignal): Promise<string>
```

Source: [`packages/experimental/client-ui-cot-translation/src/index.ts`](../../packages/experimental/client-ui-cot-translation/src/index.ts)

<a id="ctxtranslator--translator"></a>

### `ctx.translator` — `Translator`

One Host service with explicit routing, cancellation and quiescent unload.

```ts cordis-catalog
/**
 * Inspect eligible native routes without inference; saved results remain readable for unavailable routes.
 * @param signal - optional caller cancellation, combined with service disposal.
 * @returns anonymous choices followed by eligible explicitly selected paid routes.
 */
async availableProviders(signal?: AbortSignal): Promise<readonly TranslationProvider[]>

/**
 * Resolve provider and source-language defaults without sending text.
 * @param request - consumer text, destination and optional routing choices.
 * @returns a complete specification; exceeding `maxTextChars` throws `TRANSLATION_TEXT_LIMIT`.
 */
resolve(request: TranslationRequest): TranslationSpec

/**
 * Translate one resolved specification; the selected provider receives its text.
 * @param spec - complete routing and language choices from `resolve()`.
 * @param signal - optional caller cancellation, combined with service disposal.
 * @returns translated plain text, durably retained before return when a Session is supplied.
 * An uncached supplied Session must be active; otherwise rejects with `TRANSLATION_SESSION_INACTIVE` before dispatch.
 * Rejects provider/storage/limit failures and preserves cancellation reasons.
 */
async translate(spec: TranslationSpec, signal?: AbortSignal): Promise<string>
```

Source: [`packages/experimental/translator/src/index.ts`](../../packages/experimental/translator/src/index.ts)
<!-- END GENERATED cordis-surface -->
