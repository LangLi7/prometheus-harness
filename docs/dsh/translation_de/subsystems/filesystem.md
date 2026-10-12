# Dateisystem

English | [中文](filesystem.zh.md)

Die optionale Dateisystem-Fähigkeit hat vier Teile: [dsh-fs](../../packages/fs/fs) besitzt `ctx.fs` und atomare Textoperationen mit optionalen Wächtern, [dsh-fs-local](../../packages/fs/fs-local) implementiert die lokale Platte, [dsh-fs-observation-policy](../../packages/fs/fs-observation-policy) zeichnet beobachtete Anwesenheit oder Abwesenheit auf und ergänzt Frischeregeln über Events statt über einen Service, und [dsh-tool-fs](../../packages/fs/tool-fs) führt modellseitige Read-/Write-/Edit-Aufrufe direkt aus und rendert Fenster. Sie liegt außerhalb des Agent-Loop-Rückgrats; alternative Backends ändern weder Policy noch Tool-Schemas.

`dsh-fs-observation-policy` ist optional. Ohne sie bilden die Service Definition `FileSystem`, ein Provider und der Consumer `dsh-tool-fs` die vollständige, unbeschränkte Dateisystem-Naht: `write` erzeugt oder überschreibt bedingungslos, und `edit` ersetzt wörtlichen Text bedingungslos. Das Policy-Plugin ändert diese Operationen, indem es die `fs/*`-Waterfalls entscheidet. Sein Entfernen bricht das Tool nicht, weil das Tool `ctx.fs` aufruft und Events dispatcht; es ruft keine Policy-Methoden auf. Von einem Deployment, das `dsh-tool-fs` lädt, wird erwartet, dass es auch `dsh-fs-observation-policy` lädt, damit das Standardverhalten read-before-write/edit ist.

Provider-Quelle: [`packages/fs/fs/src/types.ts`](../../packages/fs/fs/src/types.ts) und [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts). Policy-Quelle: [`packages/fs/fs-observation-policy/src/types.ts`](../../packages/fs/fs-observation-policy/src/types.ts). Read-Rendering-Quelle: [`packages/fs/tool-fs/src/read-render.ts`](../../packages/fs/tool-fs/src/read-render.ts).

## Zielidentität und Metadaten (Provider-Vertrag)

Jede Operation löst zuerst einen vom Nutzer gelieferten Pfad zu einem opaken Backend-Ziel auf. Consumer dürfen `displayPath` anzeigen, aber nicht `targetKey` parsen (eine gebrandete opake Id) oder annehmen, dass er ein lokaler absoluter Pfad ist.

Consumer, die die Ausführungswelt des Dateisystems teilen, erhalten Koordinaten über Capability-Grenzen hinweg über den Provider, statt diese Identität zu interpretieren: `processPath(target)` gibt den kanonischen absoluten Pfad zurück, den ein Subprozess öffnen kann, `processPathFromHostPath(hostPath)` bildet eine absolute Datei des Harness-Hosts nur dann ab, wenn diese Ausführungswelt sie teilt, `fileUrl(target)` gibt ihre `file:`-URI der Provider-Plattform zurück, und `contains(parent, child)` prüft kanonische Identität oder Nachfahren-Enthaltensein.

```ts type-equiv
/**
 * A path resolved by a backend into a stable identity. `resolve()` produces
 * this; every other operation takes it.
 */
interface FsTarget {
  /** Opaque key for stale guards and target lookup. */
  targetKey: FsTargetKey
  /**
   * Path for model/UI-facing output. May be a local absolute path,
   * workspace-relative path, or remote URI depending on the backend.
   */
  displayPath: string
}
```

Das Backend besitzt die Dateiversionstoken — das Frischetoken, gegen das ein Write/Edit absichert. Das Policy-Plugin speichert sie für Stale-Prüfungen; Consumer interpretieren sie nicht. Beide Ids sind gebrandete opake Zeichenketten.

```ts type-equiv
/**
 * Opaque key for stale guards and target lookup. The local backend uses a
 * realpath-like string; a remote backend might use a workspace URI or file id.
 * Consumers MUST NOT parse it or assume it is a local absolute path.
 */
type FsTargetKey = Branded<'FsTargetKey'>
```

```ts type-equiv
/**
 * Opaque file-version token — the freshness token a write/edit guards against.
 * The local backend derives it from high-resolution stat identity and freshness
 * fields; a remote backend might use a revision id. The policy layer records it
 * for stale checks; consumers may display related metadata but MUST NOT
 * interpret this token.
 */
type FsVersion = Branded<'FsVersion'>
```

`stat` gibt Metadaten zurück (niemals Inhalt) oder `undefined`, wenn das Ziel abwesend ist. `type` lässt Consumer Verzeichnisse und spezielle Dateien vor dem Lesen zurückweisen, und `size` lässt Text-Consumer zwischen `readText` und `streamText` wählen, ohne durch Fehlschlag zu sondieren. Ein Text-Consumer wendet beim Konsumieren von `streamText` seine eigene Beibehaltungs-Obergrenze an. Consumer roher Bytes verwenden `readBytes(target, signal, maxBytes)`; seine erforderliche Obergrenze für vollständigen Inhalt lässt einen bekannten oder entdeckten Überlauf mit `FS_TOO_LARGE` fehlschlagen, statt zu kürzen oder unbegrenzt zu puffern.

```ts type-equiv
/**
 * Metadata about a target — what {@link FileSystem.stat} returns. Lets the
 * policy layer reject directories/special files before reading and choose
 * `readText` vs `streamText` from `size` without probing by failure. `version`
 * is the freshness token. `undefined` from `stat` means the target is absent.
 */
interface FsInfo {
  /** Opaque freshness token of the target right now. */
  version: FsVersion
  /** Whether the target is a regular file, a directory, or something else. */
  type: 'file' | 'directory' | 'other'
  /** Byte size of a regular file, when the backend can report it. */
  size?: number
}
```

`lstat` ist das pfadbezogene Metadatenprimitiv ohne Folgen von Symlinks. Es nimmt einen Pfad statt eines `FsTarget`, weil `resolve` bewusst Symlinks folgt, um eine stabile Identität zu erzeugen; Consumer, die Prüfungen an Vertrauensgrenzen benötigen, können zuerst `lstat` aufrufen und `symlink` zurückweisen, bevor sie auflösen.

```ts type-equiv
/**
 * Metadata about a path without following the final path component when it is a
 * symbolic link. Unlike {@link FsInfo}, this path-level probe can report
 * `symlink` so consumers with trust-boundary rules can reject repository-owned
 * links before resolving a target.
 */
interface FsPathInfo {
  /** Opaque freshness token of the path entry right now. */
  version: FsVersion
  /** Whether the path entry is a regular file, directory, symlink, or other. */
  type: 'file' | 'directory' | 'symlink' | 'other'
  /** Byte size of the path entry, when the backend can report it. */
  size?: number
}
```

`listDir` gibt direkte Kindeinträge in stabiler Namensreihenfolge zurück. Jeder Eintrag trägt den Basename des Kindes, den Typ, das aufgelöste Ziel und günstige Metadaten, wenn das Backend sie melden kann. Es darf keine Dateiinhalte lesen, sodass `size` nur für reguläre Dateien gilt und `version` aus Metadaten abgeleitet ist. Kaputte oder verschwundene Kinder dürfen als `other` ohne Metadaten zurückgegeben werden; Berechtigungs- oder Backend-I/O-Fehler beim Auflisten oder Auflösen von Kindmetadaten lassen die gesamte Auflistung mit `FS_PERMISSION_DENIED` oder `FS_IO_ERROR` fehlschlagen.

```ts type-equiv
/**
 * One direct child returned by {@link FileSystem.listDir}. Listing returns
 * metadata and resolved targets only; it must not read file contents.
 */
interface FsDirEntry {
  /** Basename of the child inside the listed directory. */
  name: string
  /** Whether the child is a regular file, a directory, or something else. */
  type: 'file' | 'directory' | 'other'
  /** Resolved child target for follow-up operations. */
  target: FsTarget
  /** Opaque freshness token when the backend can report metadata cheaply. */
  version?: FsVersion
  /** Byte size of a regular file, when the backend can report it. */
  size?: number
}
```

## Wächter für Write und Edit (Provider-Vertrag)

Sowohl `writeText` als auch `editText` nehmen ihren Versionswächter OPTIONAL: auslassen für eine bedingungslose Mutation (Bare-Provider), angeben zum Absichern. Der Wächter von `writeText` ist ein `FsWriteIntent` — `createIfAbsent` erzeugt ein fehlendes Ziel und weist ein bestehendes mit `FS_NOT_OBSERVED` zurück, einschließlich eines Ziels, das nach der anfänglichen Probe des Providers erscheint, weil die Veröffentlichung selbst ohne Ersetzung erfolgen muss; `replaceIfVersion` ersetzt nur, wenn das Ziel in der beobachteten Version existiert, sonst `FS_STALE_VERSION`. Das Auslassen von `expected` erzeugt oder überschreibt bedingungslos. Die Union selbst trägt nur die beiden abgesicherten Absichten; „kein Wächter“ wird durch Auslassung ausgedrückt, sodass Write und Edit dasselbe optionale `expected`-Feld verwenden.

```ts type-equiv
/**
 * Guarded write intent. `createIfAbsent` rejects an existing target with
 * `FS_NOT_OBSERVED`; `replaceIfVersion` rejects absence or mismatch with
 * `FS_STALE_VERSION`. Omitting the intent from `writeText` means unconditional
 * create-or-overwrite, not a third union arm.
 */
type FsWriteIntent =
  | { kind: 'createIfAbsent' }
  | { kind: 'replaceIfVersion'; version: FsVersion }
```

```ts type-equiv
/** Outcome of a full-file write. */
interface FsWriteOutcome {
  /** Whether the write created a new file or replaced an existing one. */
  operation: 'create' | 'update'
  /** Opaque version of the file after the write. */
  version: FsVersion
  /**
   * The file's content BEFORE the write, or `null` when the file did not exist
   * (a create) or the backend declined a contextual basis (for example, a
   * binary/non-UTF-8 prior file or either overwrite side reaching its exclusive limit).
   * LF-normalized storage text (the diff basis), never a diff — a consumer
   * computes the result-time contextual diff from `before`/`after` when
   * `before` is present, else falls back to a whole-file diff.
   */
  before: string | null
  /** The file's content AFTER the write, LF-normalized to share `before`'s diff basis. */
  after: string
}
```

`editText` ist eine Mutation auf Provider-Ebene, nicht ein `read` plus `write`, das andernorts zusammengesetzt wird. Wenn abgesichert, verifiziert es die erwartete Version VOR dem wörtlichen Abgleich (damit ein veralteter Edit `FS_STALE_VERSION` meldet und nicht einen Abgleichsfehler gegen neueren Inhalt); ungesichert bearbeitet es den aktuellen Inhalt. Beides wendet die Ersetzung an und schreibt atomar — Abgleich, Zeilenende-Behandlung, Stale-Prüfung und atomare Ersetzung bleiben innerhalb eines kritischen Abschnitts der Mutation — und ein fehlendes Ziel meldet auf beiden Pfaden `FS_STALE_VERSION`.

```ts type-equiv
/** A literal-replacement edit request. */
interface FsEditRequest {
  /** Literal non-empty text to replace. Must match exactly (after line-ending normalization). */
  oldString: string
  /** Literal replacement text. An empty string deletes the matched text. */
  newString: string
  /** Replace every match instead of requiring exactly one. */
  replaceAll: boolean
}
```

```ts type-equiv
/** Outcome of a literal edit. */
interface FsEditOutcome {
  /** Opaque version of the file after the edit. */
  version: FsVersion
  /**
   * The file's content BEFORE the edit. Raw storage text (LF-normalized by the
   * backend), never a diff — a consumer computes the result-time contextual diff
   * (the applied hunk with context) from `before`/`after`.
   */
  before: string
  /** The file's content AFTER the edit. */
  after: string
}
```

## Die fs-Policy-Events (Vokabular des Provider-Vertrags)

`dsh-fs` besitzt drei Events, die das Tool dispatcht und auf die das Policy-Plugin hört, sodass der Emitter (`dsh-tool-fs`) und der Listener (`dsh-fs-observation-policy`) ein Vokabular teilen, ohne dass der Emitter vom Policy-Plugin abhängt. Sie tragen nur `dsh-fs`-Vokabular plus einen opaken `object`-Akteur — keine modellseitigen Konzepte und keine Agent-/Session-Owner-Struktur.

`fs/write-intent` und `fs/edit-intent` sind **Entscheidungs-Waterfalls mit einem Slot**: das Tool dispatcht jeden mit einem Default-Thunk, der `undefined` zurückgibt (der Bare-Provider), und ein Listener entscheidet vollständig, ohne `next()` aufzurufen. Der Slot wird nach Registrierungsreihenfolge zuerst besetzt — dass das Policy-Plugin ihn besitzt, ist eine Deployment-Konvention, keine erzwungene Invariante. `fs/observed` ist ein Fire-and-Forget-Aufzeichnungsevent, das eine `FsObservation` trägt: anwesend in einer Version oder bestätigt abwesend. Es wird mit einem einfachen `ctx.emit` dispatcht; sein Listener MUSS synchron und reiner Seiteneffekt sein, weil das Tool das Emit nicht absichert — ein werfender Listener kann einen Read-Fehler ersetzen oder nach einer bereits erfolgreichen Mutation als `isError`-Ergebnis des Tools erscheinen. Die generierte [Cordis-Oberfläche](#cordis-surface) unten zeigt die exakten Signaturen.

```ts type-equiv
/**
 * One authoritative observation of a target. A present observation carries the
 * version used by guarded replacement; an absent observation authorizes only a
 * guarded create, never an edit.
 */
type FsObservation =
  | { readonly kind: 'present'; readonly version: FsVersion }
  | { readonly kind: 'absent' }
```

## Ausführungskontext (Policy-Plugin)

Das Policy-Plugin benötigt gerade genug Ausführungskontext, um den Owner des beobachteten Zustands durch Verengung des opaken `object`-Akteurs abzuleiten, den die `fs/*`-Events tragen. `ToolExecution` hat die erforderlichen Felder, sodass `dsh-tool-fs` sein Ausführungsobjekt als Akteur durchreicht, ohne dass `dsh-fs-observation-policy` die Tool-, Agent- oder Session-Pakete importiert.

```ts type-equiv
/**
 * Minimal structural view of a tool execution the policy plugin needs to derive
 * an observed-state owner. `@deepseek-ai/dsh-tools`' `ToolExecution` contains
 * these fields, so the tool passes its `exec` straight through as the opaque
 * `object` actor on the `fs/*` events; this plugin narrows that actor to
 * `FsObservationActor` without importing `dsh-tools`, `dsh-agent`, or `dsh-session`.
 *
 * The owner is `agent.session` when present. It is treated as an opaque object
 * identity (a `WeakMap` key); this package never reads any of its fields.
 */
interface FsObservationActor {
  /** The agent on whose behalf the call runs, when there is one. */
  agent?: {
    /** The session that owns observed-file state, used as an opaque key. */
    session?: object
  }
}
```

## Read-Ergebnis (Consumer / Read-Rendering)

Ein Text-Read ist durch Zeilenfenster, Byte-Obergrenze und Backend-Grenzen beschränkt. Nach Erreichen der Byte-Obergrenze läuft das Scannen weiter, ohne weitere Zeilen zu behalten, damit `totalLines` exakt bleibt. Das Ergebnis, das das modellseitige `read`-Tool rendert, ist rein präsentational; es gibt keine `full`/`partial`-Sicht — Autorisierung basiert auf Frische (das Tool emittiert eine anwesende `fs/observed` direkt mit der Version aus dem stat), sodass jeder gefensterte Read einen späteren Write/Edit autorisieren kann, wenn die Datei unverändert ist. Ein Metadaten-Miss emittiert eine abwesende Beobachtung, bevor das Tool `FS_NOT_FOUND` zurückgibt, was einem späteren abgesicherten Write erlaubt, ein extern gelöschtes Ziel neu zu erzeugen, ohne einen Edit zu autorisieren. `dsh-tool-fs`, der Executor, der den Read besitzt, implementiert das Read-Fenster und konstruiert dieses Ergebnis; das Policy-Plugin nicht.

```ts type-equiv
/** Outcome of a bounded text read — what {@link formatReadOutput} renders. */
interface FileReadOutcome {
  /** 1-based first line requested. */
  offset: number
  /** Returned lines, already numbered. */
  lines: FileTextLine[]
  /** Exact total line count in the file. */
  totalLines: number
  /** Whether selected output hit the byte cap. */
  truncatedByBytes?: true
}
```

## Beobachteter Dateizustand (Policy-Plugin)

Der beobachtete Zustand ist eine `WeakMap<owner, Map<targetKey, FsObservation>>`, gehalten im Plugin `dsh-fs-observation-policy`. Ein fehlender Map-Eintrag bedeutet ungesehen; `{ kind: 'absent' }` bedeutet, dass ein `read` oder ein Metadaten-Miss bei `view`, `str_replace` oder `insert` von `str_replace_editor` Abwesenheit bestätigt hat; `{ kind: 'present', version }` bedeutet, dass ein Read, Write oder Edit diese Version beobachtet hat. Die Write-Entscheidung bildet ungesehen und abwesend auf `createIfAbsent` ab, während anwesend auf `replaceIfVersion` abbildet; die Edit-Entscheidung bildet ungesehen auf `FS_NOT_OBSERVED`, abwesend auf `FS_NOT_FOUND` und anwesend auf seinen Versionswächter ab. Der Owner wird aus dem Event-Akteur abgeleitet (normalerweise `exec.agent.session`), als opak behandelt und nie gelesen. Die Entsorgung verwirft alles (HMR-Sicherheit), und die Policy führt keine Dateisystem-I/O aus.

## Fehlertaxonomie (Provider-Vertrag)

Dateisystemfehler verwenden stabile `FsErrorCode`-Zeichenketten, getragen von `FsError` (`HarnessError`). Die Tool-Registry bewahrt `{ name, code }` in Fehlerergebnissen, sodass Retry-, Berechtigungs- und UI-Schichten verzweigen können, ohne Text zu parsen.

```ts type-equiv
/**
 * Stable, machine-routable codes for filesystem failures. Carried on
 * {@link FsError}; the tool registry exposes `{ name, code }` on `isError`
 * results so retry/permission/UI layers can branch without parsing messages.
 */
type FsErrorCode =
  | 'FS_NOT_FOUND'
  | 'FS_NOT_DIRECTORY'
  | 'FS_NOT_TEXT'
  | 'FS_NOT_REGULAR_FILE'
  | 'FS_TOO_LARGE'
  | 'FS_PERMISSION_DENIED'
  | 'FS_SANDBOX_DENIED'
  | 'FS_IO_ERROR'
  | 'FS_STALE_VERSION'
  | 'FS_NOT_OBSERVED'
  | 'FS_AMBIGUOUS_EDIT'
  | 'FS_EDIT_NOT_FOUND'
  | 'FS_ABORTED'
```

`FS_NOT_DIRECTORY`, `FS_PERMISSION_DENIED` und `FS_IO_ERROR` werden von der Verzeichnisauflistung verwendet, um ein bestehendes Nicht-Verzeichnis-Ziel, eine verwehrte Auflistung und einen unerwarteten Backend-I/O-Fehler zu unterscheiden. `FS_SANDBOX_DENIED` ist eine POLICY-Zurückweisung eines sandboxdurchsetzenden Backends (`dsh-fs-sandbox`) — die Modus-Schranke hat einen Write/Edit verweigert —, verschieden von `FS_PERMISSION_DENIED` (der Host-Kernel weigert sich). `FS_NOT_OBSERVED` bedeutet, dass das Policy-Plugin keinen vorherigen Beobachtungsrecord für diesen Owner hat (oder ein `createIfAbsent` auf eine bestehende Datei traf). `FS_NOT_FOUND` steht auch für einen aus bestätigter Abwesenheit zurückgewiesenen Edit. `FS_STALE_VERSION` bedeutet, dass die Backend-Version nicht mehr zur beobachteten passt (oder der Provider selbst einen Edit für ein fehlendes Ziel erhält). Die Frische-Autorisierung kennt keine Unterscheidung zwischen partiell und vollständig, daher gibt es kein `FS_PARTIAL_OBSERVATION`.

## Keine Timeouts bei Datei-I/O

`read`/`write`/`edit` nehmen **kein** `timeoutMs`, und der Provider-Vertrag setzt keine Deadline — anders als bash und web (die [`@deepseek-ai/dsh-timeout`](../../packages/util/timeout/README.md) konsumieren) und die subprozessgestützten `glob`/`grep` (deren deklariertes `timeoutMs` von `@deepseek-ai/dsh-tool-call-timeout-policy` durchgesetzt wird): diese sind prozessgestützt, wo eine Deadline die Arbeit wirklich beenden kann. Ein lokaler Syscall ist höchstens best-effort-abbrechbar — ein Timeout könnte ein laufendes `fsync`/`rename` nicht zum Stoppen zwingen, sodass ein `timeoutMs` hier eine Deadline wäre, die die Naht nicht durchsetzen kann, und ein impliziter Default genau dort, wo explicit-over-implicit ihn verbietet. Die Stornierung wird weiterhin über das Tool-Ausführungssignal für best-effort-Abbruch an Syscall-Grenzen weitergegeben.

## Der Service und das Plugin

`FileSystem` (`ctx.fs`, abstrakt) besitzt die Provider-Primitive: `resolve`, `processPath`, `processPathFromHostPath`, `fileUrl`, `contains`, `stat`, `lstat`, `readText`, `streamText`, `readBytes`, `listDir`, `writeText` und `editText`. `dsh-fs-observation-policy` registriert **keinen Service** — es ist ein Plugin, das Policy über das `fs/*`-Event-Gate ergänzt: es entscheidet die Write-/Edit-Intent-Waterfalls aus ungesehenem/abwesendem/anwesendem Zustand und zeichnet `FsObservation`-Werte auf. Der Executor ist `dsh-tool-fs`: er liest/schreibt/bearbeitet über `ctx.fs`, dispatcht die Waterfalls und emittiert das Aufzeichnungsevent. Der generierte Abschnitt [`ctx.fs`](#ctxfs--filesystem-abstract-seam) unten zeigt die exakten Signaturen.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxfs--filesystem-abstract-seam"></a>

### `ctx.fs` — `FileSystem` (abstract seam)

Abstrakter Dateisystem-Provider. Ziele müssen Identität über Aliase hinweg bewahren; Reads legen regulären UTF-8-Text oder typisierte Fehler offen, Auflistungen sind stabil und inhaltsfrei, und Mutationen sind atomar. Optionale Wächter ergänzen Schutz gegen veraltete Stände, ohne den ungesicherten Provider-Vertrag zu ändern.

```ts cordis-catalog
/**
 * Observe one file or a directory's direct entries in this provider's execution world.
 * @param target - resolved file or directory, including an absent path to observe for creation.
 * @param changed - invalidation callback; errors can be reported during or after initialization.
 * @param signal - cancels watcher initialization; the caller closes an initialized watcher.
 * @returns a promise resolving once observation is active, with an asynchronous close function.
 * @throws when the provider does not support watching or cannot initialize the watcher.
 */
watch(target: FsTarget, changed: (error?: Error) => void, signal: AbortSignal): Promise<() => Promise<void>>

/**
 * Resolve a model/plugin-supplied path into a stable {@link FsTarget}. May perform I/O (a
 * remote/sandboxed backend may need a round-trip to map a path to a stable identity), hence
 * async even though the local backend only normalizes + realpaths.
 *
 * @param path - the path to resolve; relative paths resolve against `opts.cwd`.
 * @param opts - optional cwd override and cancellation signal.
 * @returns the stable target; the same file yields the same `targetKey`.
 */
abstract resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget>

/**
 * Return the canonical absolute path a subprocess in this filesystem's
 * execution world can open. The path is deliberately separate from
 * {@link FsTarget.targetKey}: consumers may pass this value to another OS
 * capability, but must continue treating the target key as opaque.
 * @param target - the resolved target whose process path is required.
 * @returns an absolute path in the backend's execution world.
 */
abstract processPath(target: FsTarget): string

/**
 * Map an absolute path from the harness host into this filesystem's
 * execution world when both paths identify the same file. The base provider
 * exposes no mapping; host-backed or explicitly shared backends override it.
 * @param hostPath - absolute path in the harness host filesystem.
 * @returns the process path for the same file, or undefined when this
 *   execution world cannot read that host file.
 */
processPathFromHostPath(hostPath: string): string | undefined

/**
 * Return the canonical `file:` URI for a target in this filesystem's
 * execution world. Backends own URI encoding because the host platform may
 * differ from the execution platform.
 * @param target - the resolved target to encode.
 * @returns the target's canonical file URI.
 */
abstract fileUrl(target: FsTarget): string

/**
 * Test canonical containment without exposing or parsing backend target
 * keys. Both targets must come from this provider.
 * @param parent - canonical directory target.
 * @param child - canonical candidate target.
 * @returns true when `child` is `parent` or a descendant of it.
 */
abstract contains(parent: FsTarget, child: FsTarget): boolean

/**
 * Return target metadata, or `undefined` when the target does not exist.
 * @param target - the resolved target to stat.
 * @param signal - aborts the metadata round-trip.
 * @returns metadata only, never content; undefined for an absent target.
 */
abstract stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>

/**
 * Return path metadata without following the final path component when it is a
 * symbolic link. This is intentionally path-shaped, not target-shaped:
 * {@link resolve} follows symlinks to produce the stable identity used by
 * normal reads/writes, while `lstat` lets a consumer reject the path itself
 * before that follow happens.
 *
 * `opts.cwd` follows {@link resolve}'s cwd rules. `undefined` means the path is
 * absent.
 * @param path - the path to inspect; relative paths resolve against `opts.cwd`.
 * @param opts - `cwd` overrides the backend's default base for relative paths.
 * @param signal - aborts the metadata round-trip.
 * @returns metadata only, never content; undefined for an absent path.
 */
abstract lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined>

/**
 * Read the whole regular text file as a single decoded string.
 * @param target - the resolved target to read.
 * @param signal - aborts the read.
 * @returns the full decoded UTF-8 content.
 */
abstract readText(target: FsTarget, signal?: AbortSignal): Promise<string>

/**
 * Stream the whole regular text file as decoded text chunks (same text
 * semantics as {@link readText}, for large files). The backend owns
 * cross-chunk UTF-8 decoding and binary rejection so the policy layer never
 * touches raw bytes.
 * @param target - the resolved target to read.
 * @param signal - aborts the stream, including between chunks.
 * @returns the chunk iterable, decoded and validated like {@link readText}.
 */
abstract streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>>

/**
 * Read the whole regular file as raw bytes with no decoding or binary
 * rejection. The bound lives at this seam so a backend can never buffer an
 * unbounded file: a target known or discovered to exceed `maxBytes` fails
 * with `FS_TOO_LARGE` instead of returning a truncated result.
 * @param target - the resolved target to read.
 * @param signal - aborts the read.
 * @param maxBytes - inclusive byte cap on the complete content.
 * @returns the full raw content, at most `maxBytes` long.
 */
abstract readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>

/**
 * Read one byte window of the regular file as raw bytes with no decoding or
 * binary rejection: the bytes at `[offset, offset + length)`, shorter when
 * the file ends inside the window and empty when `offset` lies at or past
 * its end. The window is the bound here, not the file: a backend transfers
 * at most `length` bytes of content beyond the prefix it skips to reach
 * `offset` and never buffers the whole file, so the caller's cap on `length`
 * is the guard against unbounded buffering.
 * @param target - the resolved target to read.
 * @param range - `offset`, the 0-based first byte, and `length`, the largest byte count; both non-negative integers.
 * @param signal - aborts the read.
 * @returns the window's bytes, at most `length` long.
 */
abstract readByteRange(target: FsTarget, range: { offset: number; length: number }, signal?: AbortSignal): Promise<Uint8Array>

/**
 * List direct children of a directory in stable name order. Returns resolved
 * child targets plus cheap metadata only; never reads file contents.
 * @param target - the resolved directory target.
 * @param signal - aborts the listing.
 * @returns one entry per direct child, in stable name order.
 */
abstract listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]>

/**
 * Atomically create or replace UTF-8 text. `expected` guards intent and
 * staleness; omission allows unconditional overwrite.
 * @param target - the resolved target to write.
 * @param content - the full new file content.
 * @param expected - the write intent guarding the write; omit for unconditional.
 * @param signal - aborts before atomic publication takes effect.
 * @param sandboxPolicy - the per-call mode and workspace root this write
 *   runs under; a sandboxing backend fences the write by it, the bare backend
 *   ignores it. Omit to leave the backend its own default.
 * @returns the outcome, including the version the write produced.
 */
abstract writeText( target: FsTarget, content: string, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<FsWriteOutcome>

/**
 * Atomically edit literal text. When supplied, the version guard is checked
 * before matching so stale content reports `FS_STALE_VERSION`; omission edits
 * the current content without a freshness precondition.
 * @param target - the resolved target to edit.
 * @param edit - the literal search/replace request.
 * @param expected - the version guard; omit for an unconditional edit.
 * @param signal - aborts before atomic publication takes effect.
 * @param sandboxPolicy - the per-call mode and workspace root this edit runs
 *   under; a sandboxing backend fences the edit by it, the bare backend
 *   ignores it. Omit to leave the backend its own default.
 * @returns the outcome, including the version the edit produced.
 */
abstract editText( target: FsTarget, edit: FsEditRequest, expected?: { version: FsVersion }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<FsEditOutcome>
```

Types: [SandboxExecutionPolicy](sandbox.md)

Source: [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)

<a id="fs-events"></a>

### `fs/*` events

<a id="fsedit-intent--waterfall"></a>

#### `fs/edit-intent` — waterfall

Entscheidung mit einem Slot für den nächsten FileSystem.editText. Der Aufruf von `next()` liefert einen bedingungslosen Edit; der erste zurückgegebene Wächter gewinnt.

```ts cordis-catalog
/**
 * Single-slot decision for the next {@link FileSystem.editText}. Calling
 * `next()` yields an unconditional edit; the first returned guard wins.
 * @param target - the resolved target about to be edited.
 * @param actor - the opaque tool-execution context the decider keys off.
 * @mode waterfall
 */
'fs/edit-intent'(target: FsTarget, actor: object | undefined, next: () => { version: FsVersion } | undefined | Promise<{ version: FsVersion } | undefined>): Promise<{ version: FsVersion } | undefined>
```

Source: [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)

<a id="fsobserved--emit"></a>

#### `fs/observed` — emit

Eine autoritative positive oder negative Beobachtung aufzeichnen. Listener müssen synchrone Aufzeichner sein: Throws lassen den Tool-Aufruf fehlschlagen, und zurückgegebene Promises werden nicht abgewartet.

```ts cordis-catalog
/**
 * Record an authoritative positive or negative observation. Listeners must
 * be synchronous recorders: throws fail the tool call and returned promises
 * are not awaited.
 * @param target - the target whose presence or absence was observed.
 * @param observation - present with its version, or confirmed absent.
 * @param actor - the observing tool-execution context; undefined records nothing useful.
 * @mode emit
 */
'fs/observed'(target: FsTarget, observation: FsObservation, actor: object | undefined): void
```

Source: [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)

<a id="fswrite-intent--waterfall"></a>

#### `fs/write-intent` — waterfall

Entscheidung mit einem Slot für den nächsten FileSystem.writeText. Der Aufruf von `next()` liefert den bedingungslosen Write des Bare-Providers; der erste Listener, der eine Absicht zurückgibt, besitzt die Entscheidung, statt sich mit Peers zusammenzusetzen.

```ts cordis-catalog
/**
 * Single-slot decision for the next {@link FileSystem.writeText}. Calling
 * `next()` yields the bare provider's unconditional write; the first listener
 * that returns an intent owns the decision rather than composing with peers.
 * @param target - the resolved target about to be written.
 * @param actor - the opaque tool-execution context the decider keys off.
 * @mode waterfall
 */
'fs/write-intent'(target: FsTarget, actor: object | undefined, next: () => FsWriteIntent | undefined | Promise<FsWriteIntent | undefined>): Promise<FsWriteIntent | undefined>
```

Source: [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)
<!-- END GENERATED cordis-surface -->
