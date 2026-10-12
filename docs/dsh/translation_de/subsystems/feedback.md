# Nachrichten-Feedback

English | [中文](feedback.zh.md)

[`@deepseek-ai/dsh-message-feedback`](../../packages/feedback/message-feedback) besitzt editierbares Feedback für einzelne Assistant-Nachrichten. Das kanonische Session-Log speichert `feedback/message-put` und `feedback/message-delete`; die unveränderliche Anmerkung auf Session-Ebene bleibt `feedback/record`, besessen von [`@deepseek-ai/dsh-command-feedback`](../../packages/feedback/command-feedback) zusammen mit der `FeedbackCategory`-Taxonomie, unter der beide Feedback-Arten abgelegt werden. Alle drei sind nur protokollierte Events, die niemals in den Modellkontext gelangen.

Source: [`packages/feedback/message-feedback/src/types.ts`](../../packages/feedback/message-feedback/src/types.ts)

## Öffentliche Typen

```ts type-equiv
/** Opaque compare-and-set token for one exact feedback item revision. */
type MessageFeedbackVersion = Branded<'MessageFeedbackVersion'>
```

```ts type-equiv
/** The human's overall judgment of one assistant message. */
type MessageFeedbackRating = 'positive' | 'negative'
```

```ts type-equiv
/** One current feedback value and its opaque mutation token. */
interface MessageFeedbackItem {
  /** Stable identity of the assistant message inside the owning Session. */
  readonly messageId: MessageId
  /** Overall positive or negative judgment. */
  readonly rating: MessageFeedbackRating
  /** Optional explanation, preserved verbatim after validation. */
  readonly note?: string
  /** Category the human filed the judgment under. */
  readonly category?: FeedbackCategory
  /** Equality-only token replaced by every material create or update. */
  readonly version: MessageFeedbackVersion
  /** Host-assigned creation time in Unix epoch milliseconds. */
  readonly createdAt: number
  /** Host-assigned time of the most recent material update. */
  readonly updatedAt: number
}
```

```ts type-equiv
/** A material creation or edit, retaining its complete current value. */
interface MessageFeedbackPut {
  /** Owning Session; inherited feedback in a fork belongs to its parent. */
  readonly sessionId: SessionId
  /** Value after this mutation, including the original creation time. */
  readonly item: MessageFeedbackItem
}
```

```ts type-equiv
/** A material deletion of one current feedback item. */
interface MessageFeedbackDelete {
  /** Session that owns the deleted feedback. */
  readonly sessionId: SessionId
  /** Message whose feedback was removed. */
  readonly messageId: MessageId
}
```

```ts type-equiv
/** Read all message feedback belonging to one persisted Session lifecycle. */
interface MessageFeedbackListRequest {
  /** Session whose feedback events should be read. */
  readonly sessionId: SessionId
}
```

```ts type-equiv
/** Current feedback values for one Session, in first-creation order. */
interface MessageFeedbackListValue {
  /** Fresh immutable item snapshots. */
  readonly items: readonly MessageFeedbackItem[]
}
```

```ts type-equiv
/** Create or replace feedback for one assistant message. */
interface MessageFeedbackPutRequest {
  /** Persisted Session that owns the target message. */
  readonly sessionId: SessionId
  /** Target assistant-message identity. */
  readonly messageId: MessageId
  /** Desired overall judgment. */
  readonly rating: MessageFeedbackRating
  /** Optional non-blank explanation. */
  readonly note?: string
  /** Optional category; absent keeps the item uncategorized. */
  readonly category?: FeedbackCategory
  /** Observed item version, or `null` to require that no item exists. */
  readonly ifVersion: MessageFeedbackVersion | null
}
```

```ts type-equiv
/** Delete feedback for one message after observing its current version. */
interface MessageFeedbackDeleteRequest {
  /** Session that owns the feedback. */
  readonly sessionId: SessionId
  /** Message whose feedback should be absent after this operation. */
  readonly messageId: MessageId
  /** Observed item version; ignored when the item is already absent. */
  readonly ifVersion: MessageFeedbackVersion
}
```

```ts type-equiv
/** Idempotent deletion acknowledgement. */
interface MessageFeedbackDeleteValue {
  /** Stable postcondition shared by the first deletion and every retry. */
  readonly absent: true
}
```

```ts type-equiv
/** No persisted Session header exists for the requested id. */
interface MessageFeedbackSessionNotFound {
  readonly code: 'session-not-found'
  readonly sessionId: SessionId
}
```

```ts type-equiv
/** The id does not name a derived, append-origin assistant message. */
interface MessageFeedbackTargetNotFound {
  readonly code: 'target-not-found'
  readonly sessionId: SessionId
  readonly messageId: MessageId
}
```

```ts type-equiv
/** A material mutation did not match the addressed item's current version. */
interface MessageFeedbackVersionConflict {
  readonly code: 'version-conflict'
  /** Authoritative current item, or `null` when it does not exist. */
  readonly current: MessageFeedbackItem | null
}
```

```ts type-equiv
/** A supplied note contains no non-whitespace character. */
interface MessageFeedbackNoteBlank {
  readonly code: 'note-blank'
}
```

```ts type-equiv
/** A supplied note exceeds the configured UTF-8 byte limit. */
interface MessageFeedbackNoteTooLarge {
  readonly code: 'note-too-large'
  readonly maxBytes: number
  readonly actualBytes: number
}
```

```ts type-equiv
/** Failures shared by the public message-feedback operations. */
type MessageFeedbackFailure =
  | MessageFeedbackSessionNotFound
  | MessageFeedbackTargetNotFound
  | MessageFeedbackVersionConflict
  | MessageFeedbackNoteBlank
  | MessageFeedbackNoteTooLarge
```

```ts type-equiv
/** Successful public operation result. */
interface MessageFeedbackSuccess<T> {
  readonly ok: true
  readonly value: T
}
```

```ts type-equiv
/** Rejected public operation result with a stable business failure. */
interface MessageFeedbackRejected<E extends MessageFeedbackFailure> {
  readonly ok: false
  readonly error: E
}
```

```ts type-equiv
/** Result returned by the message-feedback `list` operation. */
type MessageFeedbackListResult =
  | MessageFeedbackSuccess<MessageFeedbackListValue>
  | MessageFeedbackRejected<MessageFeedbackSessionNotFound>
```

```ts type-equiv
/** Result returned by the message-feedback `put` operation. */
type MessageFeedbackPutResult =
  | MessageFeedbackSuccess<MessageFeedbackItem>
  | MessageFeedbackRejected<
    | MessageFeedbackSessionNotFound
    | MessageFeedbackTargetNotFound
    | MessageFeedbackVersionConflict
    | MessageFeedbackNoteBlank
    | MessageFeedbackNoteTooLarge
  >
```

```ts type-equiv
/** Result returned by the message-feedback `delete` operation. */
type MessageFeedbackDeleteResult =
  | MessageFeedbackSuccess<MessageFeedbackDeleteValue>
  | MessageFeedbackRejected<MessageFeedbackSessionNotFound | MessageFeedbackVersionConflict>
```

## Typen für Session-Feedback

Source: [`packages/feedback/command-feedback/src/types.ts`](../../packages/feedback/command-feedback/src/types.ts)

```ts type-equiv
/** One of the fixed feedback categories; the ids are durable log vocabulary. */
type FeedbackCategory =
  | 'task-result'
  | 'instruction-following'
  | 'product-interaction'
  | 'service-stability'
  | 'resource-cost'
  | 'security-privacy-permission'
  | 'other'
```

```ts type-equiv
/**
 * One recorded human remark about a Session. Both members are optional: a
 * submission with neither still records that the human asked for the
 * Session to be reviewed, which is what authorizes log delivery.
 */
interface FeedbackRecord {
  /** Free-text remark with surrounding whitespace removed; never empty when present. */
  readonly text?: string
  /** Category the human filed the remark under. */
  readonly category?: FeedbackCategory
}
```

```ts type-equiv
/** Record one Session-level remark through the Host Remote. */
interface SessionFeedbackRecordRequest {
  /** Live Session the remark describes. */
  readonly sessionId: SessionId
  /** Free-text remark; blank text is recorded as absent. */
  readonly text?: string
  /** Category the human filed the remark under. */
  readonly category?: FeedbackCategory
}
```

```ts type-equiv
/** Stable postcondition of a recorded remark. */
interface SessionFeedbackRecordValue {
  /** The remark is appended to the Session log; flushing follows the Session's own schedule. */
  readonly recorded: true
}
```

```ts type-equiv
/** No live Session carries the requested id. */
interface SessionFeedbackSessionNotFound {
  readonly code: 'session-not-found'
  readonly sessionId: SessionId
}
```

```ts type-equiv
/** Result returned by the `sessionFeedback.record` operation. */
type SessionFeedbackRecordResult =
  | { readonly ok: true; readonly value: SessionFeedbackRecordValue }
  | { readonly ok: false; readonly error: SessionFeedbackSessionNotFound }
```

## Daten und Nebenläufigkeit

Aktuelle Items werden aus kanonischen Feedback-Events gefaltet, deren Payload-`sessionId` zur besitzenden Session passt. Jedes Item trägt eine positive oder negative Bewertung, eine optionale Notiz, eine optionale Kategorie, vom Host vergebene `createdAt`/`updatedAt`-Zeitstempel und seine eigene opake Version. Versionen werden nur auf Gleichheit verglichen und nur gegen die adressierte Nachricht; Aufrufer ordnen sie nicht und erzeugen sie nicht selbst.

`put` verwendet strikte optimistische Nebenläufigkeit: jede Anfrage für ein bestehendes Item muss zu dessen aktuellem `ifVersion` passen, einschließlich eines No-op (ein Put, der gespeicherte Bewertung, Notiz und Kategorie wiederholt). Ein Konflikt gibt das autoritative aktuelle Item (oder `null`) zurück, sodass ein Aufrufer eine verlorene Antwort oder eine gleichzeitige Bearbeitung ohne weiteren Read abgleichen kann. Das Löschen eines bereits abwesenden Items gelingt. Eine Queue pro Session serialisiert Reads und Mutationen; kalte Mutationen halten ein Persistenz-Schreibhandle über Read, Vergleich, Append und Flush. Passende No-ops hängen kein Event an.

## Ziel- und Lifecycle-Autorität

Das In-Memory-Log eines laufenden Owners liefert die Beobachtung der Ziel-Session direkt; kalte Reads verwenden ein `SessionPersistence.open(id, 'read')`-Handle, während Mutationen ein Schreibhandle verwenden. Keiner der Pfade konstruiert eine Session oder einen Agent. Ein `stat(id)`-Preflight klassifiziert definitive Abwesenheit; ein Read-Fehler für eine per `stat` bestätigte Session wird als Infrastrukturfehler weitergegeben. `put` akzeptiert nur eine nicht leere `assistant/message` mit Herkunft append und der angefragten `MessageId`; Records mit Herkunft replace, nur-Nutzung-leere und Nicht-Assistant-Records sind keine Feedback-Ziele.

Fork-Seeds dürfen Feedback-Events des Eltern enthalten, aber ihr Payload behält die `sessionId` des Eltern, sodass sie nicht zu aktuellem Feedback für das Kind werden. Das Löschen eines Items hängt einen Tombstone an; frühere Bewertungen und Notizen bleiben im Log.

## Persistenz- und Remote-Vertrag

Erfolgreiche Mutationen von Nachrichten-Feedback warten auf kanonische Persistenz: laufende Operationen hängen über die besitzende Session an und erfordern einen teilnehmenden `ctx.sessions.flush`-Listener; kalte Operationen hängen über ihr Schreibhandle an und flushen. Persistenzfehler werden weitergegeben, statt Erfolg zu melden. `maxNoteBytes` ist erforderlich und begrenzt den Notiztext in UTF-8-Bytes; die Web-Host-Komposition setzt `8192`. Das Paket veröffentlicht die unären Host-Remote-Verträge `messageFeedback.list`, `messageFeedback.put` und `messageFeedback.delete` über `TypertRemoteService` und `@Remote`; `command-feedback` veröffentlicht `sessionFeedback.record` auf dieselbe Weise für Anmerkungen auf Session-Ebene bei laufenden Sessions. Die generierte Cordis-API unten ist die Autorität auf Methodenebene.

Die Entsorgung des Plugins schließt die Operations-Admission und draint akzeptierte Queue-Arbeit pro Session.

Standardmäßig trägt [`session-log-deepseek`](../../packages/session/session-log-deepseek/README.md) Feedback als Teil des gewöhnlichen `dsh_session_log`-Suffix bei nachfolgenden berechtigten DeepSeek-Anfragen; eine Komposition deaktiviert dies mit `enabled: false`. Das Aufzeichnen von Feedback löst weder eine LLM-Anfrage noch einen separaten `dsh_feedback`-Upload aus. Für Nicht-DeepSeek-Routen kann das [OTel-Backend](../../packages/session/session-telemetry-otel/README.md) das kanonische Präfix über aufgezeichnetes Feedback freigeben. Die Befehlsbestätigung bestätigt die Aufzeichnung und benennt die Session und den anonymen Nutzer; sie meldet weder Telemetrie-Policy noch Zustellung.

## Web-Oberfläche

[`@deepseek-ai/dsh-client-ui-message-feedback`](../../packages/client/ui-message-feedback) ist der Browser-Consumer. `@deepseek-ai/dsh-api-remotes` mountet die generierten Beiträge `messageFeedback` und `sessionFeedback`, sodass das Plugin `ctx.remote.messageFeedback` und `ctx.remote.sessionFeedback` aufruft und den Transport nie berührt.

Die Steuerelemente sind der Eintrag `feedback` (Reihenfolge 10) des List-Slots `conversation.chat.assistant-actions`, den `ui-conversation` deklariert und innerhalb der IconActions-Zeile der finalisierten Assistant-Nachricht rendert. `AssistantMessageNode` trägt die optionale `messageId` aus dem `assistant/message`-Event. Das Feld fehlt bei durch Unterbrechung eingefrorenen Teilnachrichten, und die Renderstelle überspringt den Slot, wenn es fehlt. Der Streifen rendert einmal pro Turn, an der abschließenden Assistant-Nachricht: der Host akzeptiert jede Step-Nachricht mit Herkunft append als Ziel, aber frühere Steps eines mehrstufigen Turns rendern Tool-Zeilen statt eines bewertbaren Körpers, sodass die UI eine engere Menge offenlegt, als der Host-Vertrag erlaubt.

Ein `MessageFeedbackController` pro Session steht hinter jedem Nachrichtensteuerelement in dieser Session: ein einzelner `list`-Read speist das gesamte Transkript vor, aufgeschoben bis zum ersten Hover oder Fokus statt beim Mounten ausgelöst. Jede Mutation sendet die Version, die der Controller zuletzt beobachtet hat, als `ifVersion`; eine `version-conflict`-Antwort trägt das autoritative Item, sodass der Controller aus der Antwort abgleicht, statt neu abzurufen. Mutationen serialisieren pro Session, damit eine eingereihte Operation gegen die committete Version vergleicht. Die injizierte `retract`-Operation prüft die committete Bewertung innerhalb dieser Queue erneut und wird nach einer gleichzeitigen Änderung zum No-op, sodass eine veraltete UI den Dialog nicht umgehen kann, indem sie eine bloße Bewertung aufzeichnet. Ein `connection/reset` aktualisiert nur Sessions, die bereits gelesen wurden.

Jede nicht aufgezeichnete Bewertung öffnet den Feedback-Dialog der Session, den Eintrag `feedback-dialog` von `conversation.input.overlay`: die gemeinsame Modal-Karte mit sieben Kategorie-Chips und einem Detailfeld. Submit sendet die gewählte Bewertung mit der gewählten Kategorie und der getrimmten Beschreibung oder keines von beiden; Erfolg schließt den Dialog und zeigt den Bestätigungs-Toast, während ein Fehler den Dialog und Entwurf offen lässt und einen Warn-Toast zeigt. Derselbe Dialog öffnet sich für die Session über ein bloßes `/feedback` — eine Dekoration, die `ui-commands` als `action` routet — und zeichnet dann über `sessionFeedback.record` auf; `/feedback <text>` behält den Host-Befehlspfad. Ein Klick auf eine aufgezeichnete Bewertung zieht sie zurück, ohne den Dialog zu öffnen.

## Grenzen und Einschränkungen

- Die Operations-Queue ist prozesslokal; der Ausschluss kalter Schreiber beruht auf dem gewählten Persistenz-Provider.
- Das Löschen entfernt das aktuelle Item, nicht früheren Notiztext aus dem append-only Log oder ein bereits zugestelltes Suffix.
- Eine Anfrage im engen Intervall nach dem Detach einer laufenden Session, aber bevor der Persistenz-Katalog den Header materialisiert, kann `session-not-found` erhalten; Aufrufer wiederholen nach der Materialisierung des Rückzugs.
- Kalte Anfragen lesen das vollständige Log; der Service hat keine Obergrenze für die Item-Anzahl oder aggregierte Bytes. `maxNoteBytes` begrenzt nur jede einzelne Notiz.
- Der Host-Vertrag zeichnet keinen authentifizierten Akteur und keine Audit-Identität auf und setzt daher eine vertrauenswürdige Aufrufergrenze voraus.
- Die Web-Steuerelemente erscheinen nur in der Chat-View. Die Trajectory- und Waterfall-Views rendern keinen Feedback-Eintrag, obwohl ihre Assistant-Nodes dieselbe `messageId` tragen.
- Der Web-Controller konsumiert keine Feedback-Log-Events, sodass die Bewertung eines zweiten Tabs erst bei Reconnect oder bei der nächsten Konfliktantwort sichtbar wird, nicht sofort.
- Der Dialog prüft `maxNoteBytes` nicht vorab; eine überdimensionierte Beschreibung für eine Nachricht schlägt beim Submit mit `note-too-large` fehl statt während des Tippens. Eine Anmerkung auf Session-Ebene hat keine Größenbegrenzung, da der `/feedback`-Befehl nie eine hatte.
- `sessionFeedback.record` bedient nur laufende Sessions und antwortet ansonsten mit `session-not-found`; der Dialog meldet diesen Fehler, wenn seine Session zurücktritt, während er offen ist.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmessagefeedback--messagefeedbackservice"></a>

### `ctx.messageFeedback` — `MessageFeedbackService`

Session-Log-Service; kalte Operationen konstruieren nie eine Session oder einen Agent.

```ts cordis-catalog
/**
 * Read current feedback from the canonical log.
 * @param request - Session to inspect.
 * @returns immutable items or a definite persistence miss.
 */
@Remote('list') list(request: MessageFeedbackListRequest): Promise<MessageFeedbackListResult>

/**
 * Create or replace feedback after checking its current version.
 * Matching no-ops retain the version and append no event.
 * @param request - Target, desired value, and observed item version.
 * @returns the durable item or an explicit business failure.
 */
@Remote('put') put(request: MessageFeedbackPutRequest): Promise<MessageFeedbackPutResult>

/**
 * Delete one item after checking its version; absence succeeds without an event.
 * @param request - Session, message, and observed item version.
 * @returns the stable absent postcondition or an explicit failure.
 */
@Remote('delete') delete(request: MessageFeedbackDeleteRequest): Promise<MessageFeedbackDeleteResult>
```

Source: [`packages/feedback/message-feedback/src/index.ts`](../../packages/feedback/message-feedback/src/index.ts)

<a id="ctxsessionfeedback--sessionfeedbackservice"></a>

### `ctx.sessionFeedback` — `SessionFeedbackService`

Host Remote, über den eine Produktoberfläche eine Anmerkung auf Session-Ebene aufzeichnet.

```ts cordis-catalog
/**
 * Record one remark on a live Session.
 * @param request - target Session plus the optional text and category.
 * @returns the recorded postcondition, or `session-not-found` when no live
 * Session carries the id.
 */
@Remote('record') record(request: SessionFeedbackRecordRequest): Promise<SessionFeedbackRecordResult>
```

Source: [`packages/feedback/command-feedback/src/index.ts`](../../packages/feedback/command-feedback/src/index.ts)

<a id="feedback-events"></a>

### `feedback/*` events

<a id="feedbackcommitted--parallel"></a>

#### `feedback/committed` — parallel

Eine dauerhafte kalte Feedback-Mutation beobachten, ohne eine laufende Session zu veröffentlichen. Observer laufen, bevor das Schreib-Eigentum freigegeben wird, und dürfen nicht auf eine weitere Message-Feedback-Operation für diese Session warten. Das Payload ist schreibgeschützt geliehen; es vor der Übertragung des Eigentums tief kopieren (zum Beispiel an Session.fromRestore).

```ts cordis-catalog
/**
 * Observe a durable cold feedback mutation without publishing a live Session.
 * Observers run before write ownership is released and must not await
 * another message-feedback operation for this Session. The payload is borrowed
 * read-only; deep-clone it before transferring ownership (for example, to Session.fromRestore).
 * @param inspection - committed canonical prefix, including the feedback as its last event.
 * @mode parallel
 */
'feedback/committed'(inspection: SessionInspection): void
```

Types: [SessionInspection](persistence.md)

Source: [`packages/feedback/message-feedback/src/index.ts`](../../packages/feedback/message-feedback/src/index.ts)
<!-- END GENERATED cordis-surface -->
