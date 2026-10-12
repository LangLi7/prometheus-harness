# LSP-Navigation

English | [中文](lsp.zh.md)

Der LSP-Seam — ein [capability seam](../glossary.md#capability-seam), der semantische Codenavigation über einen Dienst `ctx.lsp` bereitstellt, aufgeteilt über Pakete: Service Definition ([dsh-lsp](../../packages/lsp/lsp), `ctx.lsp` + die Provider-Registry), ein generischer Service Provider ([dsh-lsp-stdio](../../packages/lsp/lsp-stdio), ein konfigurierter stdio-Host für Language-Server) und Consumer ([dsh-tool-lsp](../../packages/lsp/tool-lsp), das `lsp`-Tool-Schema). LSP ist **eine optionale Capability**, nicht Teil des Rückgrats des Agent-Loops — daher lebt sein Vokabular hier und nicht in [core.md](core.md). Ein Provider-Wechsel ändert nicht, wie das Modell Navigation anfragt.

Quelle: [`packages/lsp/lsp/src/types.ts`](../../packages/lsp/lsp/src/types.ts)

## Operationen und Koordinaten

Der Seam und das Modell legen genau vier semantische Abfragen offen; die Union ist geschlossen, sodass das Hinzufügen einer Abfrage eine compile-erzwungene Änderung über den Seam, die Provider und das Tool hinweg ist. Positionen und Ranges sind nullbasiert in UTF-16 und entsprechen damit dem Protokoll; das modellzugewandte Tool besitzt die einsbasierte Cursor-Konvention und konvertiert auf dem Weg hinein und hinaus.

```ts type-equiv
/**
 * The four semantic queries the seam and model expose. A closed union: adding an operation is a
 * compile-enforced change across the seam, providers, and the tool. Symbols and call hierarchy are
 * not operations here; they need different schemas.
 */
type LspOperation = 'goToDefinition' | 'findReferences' | 'goToImplementation' | 'hover'
```

```ts type-equiv
/** A zero-based UTF-16 cursor coordinate, matching the LSP wire convention. */
interface LspPosition {
  /** Zero-based line. */
  readonly line: number
  /** Zero-based UTF-16 code-unit offset within the line. */
  readonly character: number
}
```

```ts type-equiv
/** A zero-based UTF-16 half-open range `[start, end)`. */
interface LspRange {
  readonly start: LspPosition
  readonly end: LspPosition
}
```

## Anfrage

Jedes Feld ist erforderlich: `workspaceRoot` wird vom Aufrufer geliefert, `languageId` stammt aus der Registrierung des Providers (nicht aus der Anfrage), und Consumer besitzen Timeouts und Ergebnisgrenzen — daher braucht kein Feld eine Standardbelegung durch die Implementierung und es gibt keinen `resolve()`-Schritt. Der Provider erhält die Anfrage des Aufrufers plus die abgeleitete `languageId`, die nur das transiente Dokument synchronisiert und nie an der Auswahl teilnimmt.

```ts type-equiv
/**
 * A caller's normalized query. Every field is required: `workspaceRoot` is caller-supplied,
 * `languageId` comes from the provider registration (not here), and consumers own timeouts and
 * result limits — so no field needs implementation defaulting and there is no `resolve()` step.
 */
interface LspQueryRequest {
  /** Which semantic query to run. */
  readonly operation: LspOperation
  /** The source file to query (relative to `workspaceRoot` or absolute; the provider canonicalizes). */
  readonly filePath: string
  /** The zero-based UTF-16 cursor position to query at. */
  readonly position: LspPosition
  /** The workspace root the provider resolves against and indexes; required, never defaulted. */
  readonly workspaceRoot: string
}
```

```ts type-equiv
/**
 * A request as a provider receives it: the caller's {@link LspQueryRequest} plus the `languageId`
 * the seam derived from the provider's extension mapping. The language id only synchronizes the
 * transient document; it does not participate in selection.
 */
interface LspProviderQuery extends LspQueryRequest {
  /** The LSP language id for `filePath`, from this provider's extension mapping. */
  readonly languageId: string
}
```

## Ergebnis

Eine GESCHLOSSENE diskriminierte Union: Navigationsoperationen normalisieren zu `locations`, `hover` zu Inhalt oder `null`. Consumer `switch`en auf `kind` bis zur Vollständigkeit, sodass ein neuer Arm die Kompilierung bricht, bis er behandelt wird. `findReferences` enthält immer Deklarationen — der Provider erzwingt dies intern, sodass Aufrufer kein Flag erhalten. Die `locations`-Variante trägt `resolvedWorkspaceUri`, die kanonische `file:`-URI des Workspace seitens des Providers. Ein Aufrufer, der Orts-URIs relativiert, verwendet diese Koordinate, statt Host-Plattform-Pfadregeln auf das möglicherweise symlinkte Anfrage-Root anzuwenden.

```ts type-equiv
/** One resolved location: a document URI and the range within it. */
interface LspLocation {
  /** The target document URI (`file:` or otherwise), verbatim from the server. */
  readonly uri: string
  /** The range within the target document. */
  readonly range: LspRange
}
```

```ts type-equiv
/** Normalized hover content, or `null` for no hover at the position. */
interface LspHover {
  /** The normalized hover text (markdown or plaintext, provider-joined). */
  readonly contents: string
  /** The range the hover applies to, when the server supplied one. */
  readonly range?: LspRange
}
```

```ts type-equiv
/**
 * The closed result union. Navigation operations (`goToDefinition`, `findReferences`,
 * `goToImplementation`) normalize to `locations`; `hover` normalizes to content or `null`.
 * Consumers `switch` on `kind` to exhaustiveness so a new arm breaks compilation until handled.
 *
 * The `locations` variant carries `resolvedWorkspaceUri`: the provider's canonical `file:` URI for
 * the request's workspace root. A caller that relativizes location URIs MUST use this, not parse the
 * request's possibly symlinked process path with host-platform rules; the execution platform may
 * differ from the caller's.
 */
type LspQueryResult =
  | { readonly kind: 'locations'; readonly locations: readonly LspLocation[]; readonly resolvedWorkspaceUri: string }
  | { readonly kind: 'hover'; readonly hover: LspHover | null }
```

## Provider und Dienst

Ein Provider besitzt eine stabile gebrandete `id` und eine exklusive, kleingeschriebene Extension-Map mit führendem Punkt. `registerProvider` reserviert die Id und jede Extension atomar — eine ungültige oder konfliktbehaftete Registrierung veröffentlicht nichts —, und sein Disposer gibt alle Reservierungen frei. Die Auswahl erfolgt pro Abfrage und ist ordnungsunabhängig; keine Übereinstimmung wirft `LspError` `LSP_UNAVAILABLE`. Der Seam legt keine Protokolltypen, keine Prozess-/Dokumentsteuerung und keine generische JSON-RPC-Notluke offen.

```ts type-equiv
/**
 * A language-server backend registered on `ctx.lsp`. Each provider owns a stable {@link
 * LspProviderId} and an extension-to-language-id map (lowercase, leading-dot keys).
 * `findReferences` always includes declarations — the provider enforces this internally; callers
 * get no flag.
 */
interface LspProvider {
  /** Stable provider identity, reserved atomically with the extension mappings. */
  readonly id: LspProviderId
  /** Lowercase leading-dot extension → LSP language id (e.g. `{ '.ts': 'typescript' }`). */
  readonly extensionToLanguage: Readonly<Record<string, string>>
  /**
   * Run one query. The seam has already selected this provider and derived `languageId`.
   * @param request - the resolved provider query (caller request + derived language id).
   * @param signal - optional cancellation; the provider stops its own work when it aborts.
   * @returns the normalized, closed-union result.
   */
  query(request: LspProviderQuery, signal?: AbortSignal): Promise<LspQueryResult>
}
```

```ts type-equiv
/**
 * The LSP capability seam (`ctx.lsp`). Owns provider registration/selection and normalized query
 * execution; exposes exactly the four operations and no protocol escape hatch.
 */
interface LspService {
  /**
   * Register a provider, atomically reserving its id and every normalized extension. Any conflict
   * or invalid input publishes nothing and throws `LspError`; the returned disposer releases all
   * reservations. Disposed with the calling fiber.
   * @param provider - the backend to register.
   * @returns a synchronous disposer releasing the id and all extension reservations.
   */
  registerProvider(provider: LspProvider): () => void
  /**
   * Select a provider by the file's extension and run one query. Selection is per-query and
   * order-independent; no match throws `LspError` `LSP_UNAVAILABLE`.
   * @param request - the normalized query.
   * @param signal - optional cancellation forwarded to the selected provider.
   * @returns the normalized, closed-union result.
   */
  query(request: LspQueryRequest, signal?: AbortSignal): Promise<LspQueryResult>
}
```

`LspProviderId` ist die gebrandete Id des Seams (`Branded<'LspProviderId'>` aus [dsh-brand](../../packages/util/brand)); `LspError` erweitert `HarnessError` um stabile Codes wie `LSP_INVALID_PROVIDER`, `LSP_CONFLICT`, `LSP_UNAVAILABLE`, `LSP_DISPOSED`, `LSP_UNSUPPORTED_OPERATION` und `LSP_MALFORMED_RESPONSE`, auf die Aufrufer routen, statt `message` zu parsen.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generiert aus dem Quellcode durch `scripts/gen-cordis-catalog.ts` (per `pnpm run verify-cordis-catalog` in doc-sync auf Aktualität geprüft; Neugenerierung mit `pnpm run gen-cordis-catalog`) — die Sprachseiten unterscheiden sich nur in lokalspezifischen gepaarten Dokumentpfaden. Signaturblöcke verwenden einen `ts cordis-catalog`-Fence und behalten das ursprüngliche Quell-JSDoc; Dispatch-Modi sind im [primer](../cordis-primer.md#dispatch-modes) definiert, und die vom Framework geerbte `ctx`-API liegt in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxlsp--lspservice"></a>

### `ctx.lsp` — `LspService`

Der LSP-Capability-Seam (`ctx.lsp`). Besitzt Provider-Registrierung/-Auswahl und die Ausführung normalisierter Abfragen; legt genau die vier Operationen und keine Protokoll-Notluke offen.

```ts cordis-catalog
/**
 * Register a provider, atomically reserving its id and every normalized extension. Any conflict
 * or invalid input publishes nothing and throws `LspError`; the returned disposer releases all
 * reservations. Disposed with the calling fiber.
 * @param provider - the backend to register.
 * @returns a synchronous disposer releasing the id and all extension reservations.
 */
registerProvider(provider: LspProvider): () => void

/**
 * Select a provider by the file's extension and run one query. Selection is per-query and
 * order-independent; no match throws `LspError` `LSP_UNAVAILABLE`.
 * @param request - the normalized query.
 * @param signal - optional cancellation forwarded to the selected provider.
 * @returns the normalized, closed-union result.
 */
query(request: LspQueryRequest, signal?: AbortSignal): Promise<LspQueryResult>
```

Quelle: [`packages/lsp/lsp/src/types.ts`](../../packages/lsp/lsp/src/types.ts)
<!-- END GENERATED cordis-surface -->
