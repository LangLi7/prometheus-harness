# Dauerhafte Anhänge

English | [中文](attachment.zh.md)

Die Attachment-Naht trennt das Eigentum an binären Bildern und generischen Dateien vom Session-Log. Ein Producer übergibt Bytes an [`ctx.attachments`](#ctxattachments--attachmentstore-abstract-seam); der Service veröffentlicht eine unveränderliche, inhaltsadressierte Referenz erst, nachdem das Objekt dauerhaft ist. Session-Events und modellsichtbare Attachment-Blöcke enthalten diese Referenz und Metadaten, niemals eine Browser-Objekt-URL, einen Host-Temp-Pfad, eine Provider-URL oder ein Base64-Payload. Der unabhängige Service [`ctx.fileUploads`](#ctxfileuploads--fileuploads) bindet Browser-Dateiübertragungen und bereitgestellte Belege an den empfangenden Agent.

Nicht gesendete Browser-Entwürfe dürfen im Speicher bleiben, und native Clients dürfen sie in temporärem Speicher des Betriebssystems bereitstellen. Generische Browser-Dateien werden dauerhaft, bevor sie einen Beleg für einen bereitgestellten Prompt erhalten. Sobald der Host eine Nutzernachricht annimmt, wandern ihre Bilder unter `<DSH_HOME>/attachments/v1`, bevor das Nutzer-Event angehängt wird. Strukturierte Bildausgabe des Modells folgt derselben Regel „erst persistieren, dann Event“.

Source: [`packages/attachment/attachment/src/types.ts`](../../packages/attachment/attachment/src/types.ts)

## Identität und verifizierte Metadaten

`AttachmentId` ist eine gebrandete opake Zeichenkette. Das lokale Backend gibt derzeit `sha256:<digest>` aus, aber Consumer dürfen diese Darstellung weder parsen noch einen Dateisystempfad daraus ableiten. Ein Consumer darf den Attachment-Provider über `imageHostPath()` nach dem Objektort fragen und muss dann mit dem aktuellen Ausführungsdateisystem entscheiden, ob Modell-Tools diesen Host-Pfad lesen können.

```ts type-equiv
/** Raster image formats accepted by the version-one attachment path. */
type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
```

```ts type-equiv
/** Durable, serializable reference to one immutable normalized image. */
interface ImageAttachmentRef {
  /** Opaque storage identifier; never a filesystem path or bearer URL. */
  attachmentId: AttachmentId
  /** Media type verified from the stored bytes. */
  mediaType: ImageMediaType
  /** Exact encoded byte length. */
  bytes: number
  /** Intrinsic encoded width in pixels. */
  width: number
  /** Intrinsic encoded height in pixels. */
  height: number
  /** Optional display name stripped of local path information. */
  name?: string
  /**
   * Input dimensions after applying EXIF orientation and before normalization
   * scaling. Present only when normalization reduced the image.
   */
  originalDimensions?: {
    width: number
    height: number
  }
}
```

```ts type-equiv
/** Deployment-resolved limits used by upload admission and request buffering. */
interface ImageAttachmentLimits {
  maxImageBytes: number
  maxImagesPerMessage: number
  maxMessageImageBytes: number
  maxImagePixels: number
  /** Maximum intrinsic width and maximum intrinsic height in pixels for one image. */
  maxImageDimension: number
  mediaTypes: readonly ImageMediaType[]
}
```

Das lokale Backend lässt höchstens 20 Bilder und 200 MiB kodierter Quelldaten pro Nachricht zu. Eine Quelle darf bis zu 20 MiB, 64.000.000 Pixel und 8192 Pixel pro Seite verwenden. Diese Quellgrenzen gehen der unabhängigen Normalisierungsstufe voraus, die die lange Kante standardmäßig auf 2048 Pixel und die kodierten Daten auf 4 MiB begrenzt.

Die Referenz zeichnet intrinsische Abmessungen und kodierte Länge auf, damit Clients die Historie anordnen können, ohne zuerst zu dekodieren; jeder autoritative Read prüft dennoch Digest, Media-Signatur, Abmessungen und Metadaten erneut gegen das Objekt.

## Commit- und verifizierte Read-Payloads

```ts type-equiv
/**
 * Browser-submitted prompt content accepted by Host prompt endpoints; the
 * accepting Host promotes image parts to durable references through
 * `ctx.attachments.admitPromptContent()` before any message is created, so a wire caller can
 * never cite an attachment it did not upload.
 */
type PromptContentPart =
  | { readonly type: 'text'; readonly text: string }
  | {
    readonly type: 'image'
    readonly mediaType: ImageMediaType
    readonly data: string
    readonly name?: string
  }
```

```ts type-equiv
/** Host prompt content whose file receipts are resolved and whose image bytes await admission. */
type AttachmentAdmissionPart =
  | PromptContentPart
  | { readonly type: 'file'; readonly attachment: FileAttachmentRef }
```

```ts type-equiv
/** Host-admitted prompt content with every attachment represented by its durable reference. */
type AdmittedPromptContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly attachment: ImageAttachmentRef }
  | { readonly type: 'file'; readonly attachment: FileAttachmentRef }
```

```ts type-equiv
/** Base64-encoded image upload accompanying one wire request. */
interface EncodedImageAttachment {
  /** Declared media type, verified against the decoded bytes during admission. */
  mediaType: ImageMediaType
  /** Canonical base64 encoding of the image bytes. */
  data: string
  /** Optional display name; it is never interpreted as a path. */
  name?: string
}
```

```ts type-equiv
/** Request to validate and durably commit one image. */
interface SaveImageAttachment {
  data: Uint8Array
  /** Caller-declared media type, checked against fully decoded bytes. */
  mediaType: ImageMediaType
  /** Optional browser/provider display name; it is never interpreted as a path. */
  name?: string
}
```

```ts type-equiv
/** Stored image bytes returned after reference and digest verification. */
interface StoredImageAttachment {
  ref: ImageAttachmentRef
  data: Uint8Array
}
```

```ts type-equiv
/** Deterministic request-image target selected by one exact model route for one attachment. */
interface ImageRequestTarget {
  /** Target width in pixels; a target above the source keeps the source width. */
  width: number
  /** Target height in pixels; a target above the source keeps the source height. */
  height: number
  /** Encoded-byte target before base64 expansion or Files API upload; the smallest quality-ladder output is kept when no quality fits. */
  maxBytes: number
}
```

```ts type-equiv
/** Integer width and height of one projected image. */
interface ProjectedDimensions {
  width: number
  height: number
}
```

```ts type-equiv
/** Cached request version derived from one provider-independent normalized attachment. */
interface RequestImageAttachment {
  /** Cache and upload-index key over the attachment id, policy, and fixed encoder parameters. */
  variantId: ImageVariantId
  /** Durable normalized attachment from which this request version was derived. */
  attachment: ImageAttachmentRef
  /** Encoded request bytes. */
  data: Uint8Array
  mediaType: ImageMediaType
  bytes: number
  width: number
  height: number
  /** Provider-compatible sample depth proven after request encoding. */
  depth: 'uchar'
  /** Provider-compatible color space proven after request encoding. */
  space: 'srgb'
  /** Whether the encoded request version retains an alpha channel. */
  hasAlpha: boolean
}
```

`saveImage()` bereitet einen providerunabhängigen normalisierten Anhang vor und committet ihn atomar, bevor es seinen `ImageAttachmentRef` zurückgibt. `saveImages()` bereitet jeden validierten Anhang einmal vor, bevor der Batch veröffentlicht wird, sodass eine Validierungsablehnung keine Teilobjekte hinterlässt und die Veröffentlichung Dekodierung oder Qualitätsauswahl nicht wiederholt. `admitPromptContent()` akzeptiert den vollständigen geordneten Host-Prompt nach der Auflösung der Dateibelege, ersetzt Base64-Bilduploads durch dauerhafte Referenzen und reicht dauerhafte Dateireferenzen unverändert weiter. `admitEncodedImages()` unterstützt andere Wire-Einträge und delegiert Anzahl, aggregierte Bytes und die geordnete Batch-Admission an `saveImages()`. `admitEncodedFile()` gibt kodierten Protokolladaptern dieselbe serviceeigene Admission für kanonisches Base64, und `isAttachmentError()` lässt diese Adapter stabile Attachment-Fehler erkennen, ohne Implementierungs-Helfer zu importieren. `readImage()` verifiziert einen normalisierten Anhang über einen autorisierten Session-Pfad. `imageHostPath()` legt nur den providereigenen Host-Objektort offen; es entscheidet nicht, ob die aktuelle Tool-Ausführungswelt ihn lesen kann. `readImageRequest()` leitet eine deterministische Request-Version in einer exakt routengewählten Zielgröße und mit einem kodierten Byte-Ziel ab und cached sie. Diese Version enthält kodierte Bytes und Metadaten, aber keinen Pfad in der Ausführungswelt. Neue Einträge werden vor der Veröffentlichung vollständig dekodiert, während Cache-Treffer eine begrenzte Metadaten-Probe verwenden. Aufrufer verwenden `Promise.all` über die singuläre Methode, wenn sie einen geordneten Batch benötigen. Die lokale Implementierung kodiert bevorzugte Kandidaten lazy, singleflightet gleiche Request-Identitäten, lässt jeden Wartenden unabhängig abbrechen, beendet gemeinsame Arbeit, wenn kein Wartender bleibt, und begrenzt alle Transformationen mit ihrem Limiter auf Instanzebene, der standardmäßig zwei gleichzeitige Transformationen erlaubt. Der Service ist retention-neutral: fortgesetzte und geforkte Sessions dürfen Objekte teilen, weshalb referenzbewusste Garbage Collection aufgeschoben wird, statt an die Löschung einer Session gebunden zu sein.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxattachments--attachmentstore-abstract-seam"></a>

### `ctx.attachments` — `AttachmentStore` (abstract seam)

Unveränderlicher Service für binäre Anhänge. Implementierungen validieren Bytes, bevor sie eine Referenz veröffentlichen.

```ts cordis-catalog
/**
 * Validate one image without persisting it.
 * Batch callers validate every member before saving any member.
 * @param input - encoded bytes, declared media type, and optional display name.
 * @returns completion after the encoded raster has been fully decoded.
 */
abstract validateImage(input: SaveImageAttachment): Promise<void>

/**
 * Validate and durably commit one ordered image batch.
 * @param inputs - encoded images in owning-message order.
 * @returns durable normalized attachment references in the same order after every member succeeds.
 */
async saveImages(inputs: readonly SaveImageAttachment[]): Promise<readonly ImageAttachmentRef[]>

/**
 * Admit one Host prompt and replace each uploaded image with its durable reference.
 * Text and durable file references pass through unchanged. A prompt without image parts performs no storage operation.
 * @param content - prompt parts in message order after file receipt resolution.
 * @returns admitted prompt parts in the same order as `content`.
 * @throws AttachmentError when the image batch is refused.
 */
async admitPromptContent( content: readonly AttachmentAdmissionPart[], ): Promise<AdmittedPromptContentPart[]>

/**
 * Decode and durably commit one canonical base64 file upload.
 * @param input - canonical base64 bytes and optional display name.
 * @returns the durable content-addressed file reference.
 * @throws AttachmentError when the encoding or storage operation is refused.
 */
admitEncodedFile(input: EncodedFileAttachment): Promise<FileAttachmentRef>

/**
 * Identify a failure emitted by this attachment capability by its stable code.
 * @param error - value caught from an attachment operation.
 * @returns whether the value is an attachment failure.
 */
isAttachmentError(error: unknown): error is AttachmentError

/**
 * Validate and durably commit one image before its owning session event is appended.
 * The returned reference describes the persisted normalized image. When
 * normalization reduces the raster, its `originalDimensions` records the
 * orientation-applied input dimensions.
 * @param input - encoded bytes, declared media type, and optional display name.
 * @returns the durable content-addressed normalized image reference.
 */
abstract saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef>

/**
 * Read one image and verify that bytes still match the recorded reference.
 * @param ref - durable reference from the session log.
 * @param signal - optional cancellation for backend read and verification work.
 * @returns the verified bytes and normalized attachment reference.
 * @throws the signal reason when aborted, or a storage error when verification fails.
 */
abstract readImage(ref: ImageAttachmentRef, signal?: AbortSignal): Promise<StoredImageAttachment>

/**
 * Locate the provider-owned normalized object in the harness host filesystem.
 * @param ref - durable normalized attachment reference.
 * @returns an absolute host path, or undefined when this backend is not host-file-backed.
 * @throws an AttachmentError when the durable reference is invalid.
 */
imageHostPath(ref: ImageAttachmentRef): string | undefined

/**
 * Durably commit one file byte-for-byte before its owning session event is
 * appended. Files carry no admission limits: any byte content and length is
 * accepted, and the stored object is the exact submitted bytes. Backends
 * without verbatim file storage keep this default rejection.
 * @param input - exact bytes and optional display name.
 * @returns the durable content-addressed file reference.
 */
saveFile(input: SaveFileAttachment): Promise<FileAttachmentRef>

/**
 * Durably commit one file byte-for-byte from bounded chunks. Providers must
 * apply backpressure and must not collect the complete file in memory.
 * Backends without streamed verbatim storage keep this default rejection.
 * @param input - ordered exact bytes, optional cancellation, and display name.
 * @returns the durable content-addressed file reference.
 */
saveFileStream(input: SaveFileStreamAttachment): Promise<FileAttachmentRef>

/**
 * Read and verify one verbatim stored file as bounded chunks. Providers must
 * not collect the complete file in memory. Backends without verbatim file
 * reads keep this default rejection.
 * @param ref - durable reference from the session log.
 * @param signal - optional cancellation for backend reads and verification work.
 * @returns exact file bytes in order; integrity failures reject the iteration.
 */
async *readFileStream( ref: FileAttachmentRef, signal?: AbortSignal, ): AsyncIterable<Uint8Array>

/**
 * Locate the verbatim stored file object in the harness host filesystem.
 * @param ref - durable file reference.
 * @returns an absolute host path, or undefined when this backend is not host-file-backed.
 * @throws an AttachmentError when the durable reference is invalid.
 */
fileHostPath(ref: FileAttachmentRef): string | undefined

/**
 * Generate or read one deterministic model-request version from the stored normalized image.
 * @param ref - durable provider-independent normalized attachment reference.
 * @param target - route-chosen dimensions and byte target; an unmet byte target yields the smallest ladder output.
 * @param signal - optional cancellation.
 * @returns request bytes and the cache/upload identity covering every transform input.
 */
readImageRequest( ref: ImageAttachmentRef, target: ImageRequestTarget, signal?: AbortSignal, ): Promise<RequestImageAttachment>
```

Source: [`packages/attachment/attachment/src/index.ts`](../../packages/attachment/attachment/src/index.ts)

<a id="ctxfileuploads--fileuploads"></a>

### `ctx.fileUploads` — `FileUploads`

Host-Service, der Upload-Speicher und Belege besitzt, adressiert nach der exakten Session des jeweils empfangenden Agent.

```ts cordis-catalog
/**
 * Register the ordinary-Session resolver used when a raw upload addresses a cold Session.
 * @param resolve - resolver that returns the exact live Agent or throws a Remote error.
 * @returns disposer removing this resolver.
 */
registerAgentResolver(resolve: AgentResolver): () => void

/**
 * Persist one encoded upload and stage it under the Agent receiver selected by Typert.
 * @param agent - receiving Agent resolved from the Remote Agent scope.
 * @param request - canonical base64 bytes and optional display name.
 * @param signal - caller cancellation before storage begins.
 * @returns the staged receipt and durable file reference.
 */
@Remote('upload') upload(agent: Agent, request: EncodedFileUploadRequest, signal: AbortSignal): Promise<FileUploadValue>

/**
 * Persist raw chunks for one Session without aggregating the upload.
 * @param request - Session identity, ordered bytes, cancellation, and optional display name.
 * @returns the staged receipt and durable file reference.
 */
async uploadStream(request: { readonly sessionId: SessionId readonly data: AsyncIterable<Uint8Array> readonly signal?: AbortSignal readonly name?: string }): Promise<FileUploadValue>

/**
 * Resolve one staged receipt for the receiving Agent's exact Session.
 * @param agent - receiving Agent.
 * @param receiptId - opaque receipt minted for one completed upload.
 * @returns durable file reference, or `undefined` for an unknown or foreign receipt.
 */
resolve(agent: Agent, receiptId: FileUploadReceiptId): FileAttachmentRef | undefined

/**
 * Bind receipts while one prompt enters an Agent inbox.
 * Disposal restores every prior binding unless the caller commits successful delivery.
 * @param agent - receiving Agent.
 * @param receiptIds - distinct staged receipts referenced by the prompt.
 * @param requestId - prompt identity later observed in queue or history.
 * @returns binding kept after commit until queue or history observation retires its receipts.
 */
bindPrompt( agent: Agent, receiptIds: readonly FileUploadReceiptId[], requestId: string, ): PromptFileBinding

/**
 * Retire every receipt accepted by one removed queue occurrence.
 * @param agent - receiving Agent.
 * @param requestId - prompt identity carried by the queue occurrence.
 */
retirePrompt(agent: Agent, requestId: string): void
```

Types: [Agent](core.md) · [SessionId](core.md)

Source: [`packages/client/file-upload/src/index.ts`](../../packages/client/file-upload/src/index.ts)
<!-- END GENERATED cordis-surface -->
