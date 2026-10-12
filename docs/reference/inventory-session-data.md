# Referenz-Inventar: Session-Format, Persistenz und Daten

**Was diese Datei ist.** Ein vollständiges, quellengestütztes Inventar der Session-Format-, Persistenz-,
Projektions-, Query-, Storage-, Workspace-, Spill- und Context-Pakete der DeepSeek-Harness-Vorlage.
Sie ist als Referenz für die Portierung des Backends gedacht: Zahlen, Feldnamen, Pfade und
Versionsnummern sind wörtlich aus dem Quelltext übernommen, nicht rekonstruiert.

**Quelle (Analysequelle, READ-ONLY).** `C:\Users\Chang\harness\prometheus-harness` — ein TypeScript-Monorepo.
Pro Paket ist `src/` maßgeblich; `lib/types/*.d.ts` sind generierte Deklarationen und wurden nur zur
Bestätigung exportierter Signaturen herangezogen. Ergänzend gelesen: `docs/` der Vorlage
(ausgenommen `docs/dsh` und `docs/design`, die nie geöffnet wurden) sowie die Paket-`README.md`
und `tests/`.

**Datum der Analyse.** 2026-10-08 (Bezugsdatum aus der Format-Historie der Vorlage;
die Analyse selbst wurde gegen den vorliegenden Checkout-Stand durchgeführt).

**Read-only-Hinweis.** Diese Datei ist ein reines Analyseergebnis. Die Analysequelle wurde nicht
verändert, dort wurde keine Datei erzeugt oder gelöscht. Es wurde ausschließlich diese eine Datei
geschrieben.

**Nicht Gegenstand dieses Dokuments.** `packages/core/session` (der In-Memory-Session-Log und
`ctx.sessions`) wird von einem anderen Dokument abgedeckt. Hier wird es nur dort referenziert, wo
die Format-/Persistenzpakete damit interagieren — insbesondere als Eigentümer der Konstante
`SESSION_FORMAT_VERSION` und von `KNOWN_SESSION_EVENT_TYPES`.

---

## 1. Das Session-Format

### 1.1 Versionskonstanten

| Konstante | Wert | Datei |
|---|---|---|
| `SESSION_FORMAT_VERSION` | `4` | `packages/core/session/src/types.ts:89` |
| `formatVersion` (Persistenz-Schema-Inventar, nicht das Session-Format) | `1` bzw. `2` | `docs/persistence-catalog.md`, `docs/persistence-changes/historical-formats/*.schema.json` |
| `STORAGE_SQLITE_SCHEMA_VERSION` | `1` | `packages/storage/storage-sqlite/src/schema.ts:20` |
| `SESSION_QUERY_SQLITE_SCHEMA_VERSION` | `8` | `packages/session-query/session-query-sqlite/src/schema.ts:8` |
| `SESSION_QUERY_SQLITE_APPLICATION_ID` | `0x44534851` | `packages/session-query/session-query-sqlite/src/schema.ts:11` |
| Domain-Spec-Version `session_projcache` | `7`, `compatibleVersions: [3, 4, 5, 6]` | `packages/session/session-projection-cache/src/spec.ts:100-107` |

`SESSION_FORMAT_VERSION` ist laut `docs/session-format-status.md` die **einzige handgepflegte
Writer-Nummer im Code**. Der Finalisierungs-Record nennt `latestFinalizedVersion: 4`, der
Release-Record `latestReleasedVersion: 4` mit `evidenceTag: dsh-v0.2.0-rc.2`.

**Unterstützte Formatversionen (Codecs):** `0`, `1`, `2`, `3`, `4`
(`packages/session/session-format-catalog/src/generated.ts:16-31`).

### 1.2 Log-Dateinamen pro Generation

`packages/session/session-format/src/filename.ts`:

| Version | Basename (ohne Kompressionssuffix) |
|---|---|
| `0` | `session.jsonl` |
| `N ≥ 1` | `session.v<N>.jsonl` (kleingeschriebenes numerisches `.vN` vor `.jsonl`) |

Das kanonische Muster ist `^session(?:\.v([1-9][0-9]*))?\.jsonl$`
(`packages/session/session-format/src/filename.ts:5`). Uppercase-, Leading-Zero-, `.v0`- und
kompressionssuffigierte Namen gelten **nicht** als kanonisch. Bei aktivierter Kompression lautet der
Suffix `.jsonl.zstd` bzw. leer bei `compression: 'none'`
(`packages/session/session-persistence-jsonl/src/format.ts:42-60`).

### 1.3 On-Disk-Record-Shape der JSONL-Persistenz

Eine Datei ist eine Folge von JSON-Objekten, **ein Objekt pro Zeile**, jeweils mit `\n`
abgeschlossen. Es gibt **keinen Footer-/Endrecord** — die Datei endet nach dem letzten Event.
Das Ende der vererbten (Fork-)Historie wird ausschließlich über den letzten getaggten
`session/end-seed`-Event mit `data.inherited === true` ausgedrückt.

#### 1.3.1 Header-Record (erste Zeile)

Definiert in `packages/session/session-persistence-jsonl/src/format.ts:83-98` (`interface HeaderLine`).

| Feld | Typ | Pflicht | Anmerkung |
|---|---|---|---|
| `type` | `'session'` | ja | Literal-Tag des Headers |
| `version` | `number` | ja | Generation; muss dem Dateinamen entsprechen |
| `id` | `string` (`SessionId`) | ja | nicht leer |
| `createdAt` | `number` | ja | non-negative safe integer, **nicht** `-0` |
| `isSeeded` | `boolean` | ja | Fork-Lineage-Marker |
| `delegationDepth` | `number` | ja | non-negative safe integer, nicht `-0`; fehlend top-level = `0` |
| `cwd` | `string` | nein | **muss absolut sein**, sonst kein Header |
| `parentSession` | `string` | nein | Seed-Lineage |
| `origin` | `'subagent'` | nein | einziges zugelassenes Literal |
| `agentPreset` | `string` | nein | durabel, weil das Preset Tools und Prompt bestimmt |

`HEADER_REQUIRED_KEYS = ['type','version','id','createdAt','isSeeded','delegationDepth']`,
`HEADER_OPTIONAL_KEYS = ['cwd','parentSession','origin','agentPreset']`; jeder andere Key macht die
erste Zeile zu keinem Header (`format.ts:96-98, 159-186`).
Retirierte Felder `sandboxMode` und `approvalPolicy` werden explizit abgelehnt
(`assertNoRetiredHeaderFields`, `format.ts:105-110`).

#### 1.3.2 Event-Record (jede weitere Zeile)

Envelope laut `packages/session/session-format-v1-to-v2/src/codec.ts:19-23` und
`packages/session/session-format-v3-to-v4/src/...` (native V4-Admission):

| Feld | Typ | Pflicht | Anmerkung |
|---|---|---|---|
| `type` | `string` | ja | Event-Typname (Vokabular siehe 1.4) |
| `seq` | `number` | ja | dichte, non-negative safe integer; `seq` = Zeilenindex |
| `time` | `number` | ja | safe integer, Epoch-Millisekunden |
| `data` | JSON-Value | ja | typabhängige Payload |
| `ignorable` | `true` | nein | wenn vorhanden, **exakt** `true`; sonst Refusal |
| `sourceEventSeqs` | `number[]` oder `[start,end]`-Paare | nein | nur auf Surface-Events; non-empty, eindeutig, jeder Wert `< seq` |
| `surfaceOp` | `'append'` \| `{ op: 'replace', startSeq, endSeq }` | bedingt | auf allen fünf Surface-Typen **verpflichtend** |

Die physische Zusatzrepräsentation von `sourceEventSeqs` ist verlustfrei verlaufs-kodiert:
aufeinanderfolgende Läufe von **mindestens drei** Sequenznummern werden zu `[start, end]`-Paaren,
jede andere Liste bleibt wörtlich (`packages/session/session-format-v1-to-v2/src/codec.ts:217-232`).
Retirierte Namen `start`/`end` für Ersetzungsendpunkte werden im aktuellen Format abgelehnt;
gültig sind ausschließlich `startSeq`/`endSeq` mit exakt drei Keys
(`packages/session/session-format-v2-to-v3/src/payload.ts:286-297`).

### 1.4 Das `session-format`-Typ-Interface

`packages/session/session-format/src/types.ts` — die vollständige exportierte Oberfläche:

| Typ | Rolle |
|---|---|
| `SessionFormatJsonPrimitive` | `null \| boolean \| number \| string` |
| `SessionFormatJsonValue` | verlustfreier JSON-Wert (rekursiv) |
| `SessionFormatJsonObject` | `{ readonly [key]: SessionFormatJsonValue }` |
| `SessionFormatHeader` | logischer Header (Superset der physischen Headerfelder) |
| `SessionFormatEvent` | `{ type, seq, time, data }` als logisches Event |
| `SessionFormatArtifact` | `{ header, inheritedEventCount, events[] }` |
| `SessionFormatMigration` | `{ name, fromVersion, toVersion, migrateHeader, createStage, validateTargetHeader }` |
| `SessionFormatMigrationStageInput` | `{ sourceHeader, targetHeader, sourceInheritedEventCount, sourceKind }` |
| `SessionFormatChainOptions` | `{ currentVersion, migrations, restoreCurrentHeader }` |
| `SessionFormatChain` | `{ currentVersion, createStream, migrateHeader }` |
| `SessionFormatRecovery` | `'strict' \| 'recoverable'` |
| `SessionFormatCodec` | `{ version, decodeHeader, createDecoder }` |
| `SessionFormatArtifactDecoder` | `{ header, headerInheritedEventCount?, decodeRow, finish }` |
| `SessionFormatCurrentEncoder` | `{ encodeHeader, encodeEvent }` |
| `SessionFormatEventRun` | `{ runType, firstSeq, eventCount, expand() }` (kompakter Lauf) |
| `SessionFormatMigrationContext` | `{ emitEvent, emitRun }` |
| `SessionFormatMigrationStage` | `{ headerInheritedEventCount?, transformEvent, transformRun, finish }` |
| `SessionFormatMigrationStream` | `{ header, emitEvent, emitRun, finish() }` |
| `SessionFormatHeaderReadResult` | `current` \| `migration-required` \| `unsupported` \| `malformed` |
| `SessionFormatCatalogOptions` | Codecs + Migrationen + Restorer + Encoder |
| `SessionFormatRestoreOptions` | `{ recovery, validation: 'transformed' \| 'current' }` |
| `SessionFormatCatalog` | `{ currentVersion, readHeader, createRestore, encodeCurrentHeader, encodeCurrentEvent }` |
| `SessionFormatRestore` | `{ header, decodeRow, finish() }` |

Fehlerklassen (`packages/session/session-format/src/error.ts`):
`SessionFormatError` und `SessionFormatUnsupportedMigrationError` (Unterklasse).

Header-Validierung (`packages/session/session-format/src/json.ts`):
`sessionFormatCount` (non-negative safe integer, **nicht** `-0`), `sessionFormatSafeInteger`
(safe integer, nicht `-0`), `sessionFormatVersion`, `inspectSessionFormatVersion`,
`snapshotSessionFormatJson`, `snapshotSessionFormatHeader`.

### 1.5 Surface-Op-Vokabular

`surfaceOp` ist auf den **fünf** Surface-Events verpflichtend
(`packages/session/session-format-v2-to-v3/src/payload.ts:9`):

```
SURFACE_TYPES = { 'system/message', 'user/message', 'assistant/message', 'tool/result', 'developer/message' }
```

| Wert | Bedeutung |
|---|---|
| `'append'` | Event hängt neue Surface-Nodes an |
| `{ op: 'replace', startSeq, endSeq }` | ersetzt eine inklusive Spanne in Surface-Reihenfolge |

Zusatzregeln (native V4, `packages/session/session-format-v3-to-v4/README.md`):
- Beide Endpunkte müssen auf **frühere** Events zeigen (`< seq`).
- Ein Replace-Objekt hat exakt `op`, `startSeq`, `endSeq`; gemischte Schreibweisen und Extra-Keys werden abgelehnt.
- Ein Replace muss alle entfernten Nodes zitieren; `assistant/message` darf daher **kein**
  `sourceEventSeqs` tragen und kann selbst keine Surface-Spanne ersetzen.
- Der geschützte erste System-Head darf nur durch genau eine System-Message ersetzt werden, die exakt diesen Head abdeckt.
- Log-only-Events tragen **weder** `surfaceOp` **noch** `sourceEventSeqs`.

### 1.6 Event-Typ-Vokabular

Die maßgebliche Liste des aktuellen Builds ist generiert:
`packages/core/session/src/known-event-types.ts` (`KNOWN_SESSION_EVENT_TYPES`), erzeugt von
`scripts/gen-persistence-catalog.ts`. Ebenfalls dort: `MESSAGE_PROJECTION_EVENT_TYPES = { 'image/offload' }`.

Die 54 aktuellen Event-Typen (`known-event-types.ts:22-83`):

| Gruppe | Typen |
|---|---|
| Preset/Modell | `agent-preset/selected`, `model/selection`, `permission/preset` |
| Approval | `approval/asked`, `approval/decided`, `approval/policy` |
| Assistant | `assistant/attempt`, `assistant/message` |
| Command | `command/run`, `command/done` |
| Compaction | `compaction/start`, `compaction/summary`, `compaction/end`, `compaction/prune` |
| Deliverables | `deliverables/presented` |
| Developer | `developer/message` |
| Feedback | `feedback/record`, `feedback/message-put`, `feedback/message-delete` |
| Goal/Plan | `goal/change`, `plan/mode` |
| Hooks | `hook/invoked`, `hook/result` |
| Bild | `image/offload` |
| LLM-Retry | `llm/retry`, `llm/retry-started` |
| Request | `request/context`, `request/header` |
| Sandbox/Schedule | `sandbox/mode`, `schedule/change` |
| Delivery-Log | `session-log-deepseek/delivery-accepted` |
| Session | `session/end-seed`, `session/title`, `session/title-llm-request` |
| Schritte/Turns | `step/start`, `step/end`, `turn/start`, `turn/end` |
| Subagent/Team | `subagent/catalog`, `subagent/descriptor`, `subagent/model-selection-policy`, `team/member`, `team/task`, `team/message/queued`, `team/message/delivered` |
| System/User | `system/message`, `user/message`, `todo/write`, `agent/inbox/spliced` |
| Tools | `tool/call`, `tool/result`, `tool/ptc-dispatch`, `tool/ptc-dispatch-start` |
| Workflow | `tool-workflow/agent-start`, `tool-workflow/agent-end`, `tool-workflow/run-start`, `tool-workflow/run-end` |
| Web | `web/deepseek-search-llm-request` |
| Working-Dir/Workspace | `working-directory/change`, `workspace/changes` |

**Vokabular pro Generation** (aus den Schemas, siehe 1.7):

| Generation | Anzahl Event-Roots | Unterschiede zum Vorgänger |
|---|---|---|
| v0 | 51 Events | Basis; enthält `assistant/chunk`, `tool/code-dispatch`, `tool/code-dispatch-start` |
| v1 | 51 Events | identisches Event-Set wie v0 |
| v2 | 53 Events | + `assistant/attempt`, `feedback/message-put`, `feedback/message-delete`; − `assistant/chunk` |
| v3 | 57 Events | + `deliverables/presented`, `image/offload`, `subagent/catalog`, `system/message`; − `tool/code-dispatch*`, + `tool/ptc-dispatch*` |
| v4 (aktuell) | 54 Events (`KNOWN_SESSION_EVENT_TYPES`) | + `developer/message`; `working-directory/change`, `workspace/changes` ergänzt |

Hinweis: Die v4-Persistenz-Änderungs-Schemas sind inkrementelle Change-Records (14 Roots), nicht die
volle Vokabelliste — die vollständige aktuelle Liste ist `KNOWN_SESSION_EVENT_TYPES`.
Die historische, vom V3-Reader verstandene Liste ist unabhängig und in
`packages/session/session-format-v3-to-v4/src/extension-identities.ts:8-67`
(`RELEASED_V3_EVENT_TYPES`, 56 Einträge) eingefroren.

### 1.7 JSON-Schema-Dateien

Die in der Aufgabenstellung genannten Pakete liefern **keine** eigenen `*.schema.json`. Eine Suche
über `packages/session`, `packages/session-query`, `packages/storage`, `packages/workspace`,
`packages/spill` und `packages/context` ergab null Treffer auf Paketebene.

Die Schemas liegen gesammelt unter `docs/persistence-changes/` und `docs/`:

| Pfad | Was es validiert |
|---|---|
| `docs/persistence-schema.json` | Maschinelles Inventar aller erreichbaren normalisierten Typen mit SHA-256-Digest |
| `docs/persistence-changes/historical-formats/v0.schema.json` | Vollständiges v0-Vokabular: 54 Roots (2 Header, 1 Envelope, 51 Events), `formatVersion: 1` |
| `docs/persistence-changes/historical-formats/v1.schema.json` | Vollständiges v1-Vokabular: 54 Roots, `formatVersion: 1` |
| `docs/persistence-changes/historical-formats/v2.schema.json` | Vollständiges v2-Vokabular: 56 Roots, `formatVersion: 1` |
| `docs/persistence-changes/historical-formats/v3.schema.json` | Vollständiges v3-Vokabular: 60 Roots, `formatVersion: 1` |
| `docs/persistence-changes/2026-09-11-initial.schema.json` | Änderungsrecord: `SessionHeader`, `JsonlHeaderLine`, `SessionEventEnvelope`, betroffene Events; `formatVersion: 1` |
| `docs/persistence-changes/2026-09-16-session-format-v4.schema.json` | V4-Änderungsrecord (14 Roots), `formatVersion: 2`; `SessionHeader`-Digest `1a3440e3577382704d42a6263aa463504eb74c566734a55e9503a63efcd02445` |
| `docs/persistence-changes/2026-09-12-auto-review-error-metadata.schema.json` | Fehler-Metadaten der Auto-Review |
| `docs/persistence-changes/2026-09-13-working-directory.schema.json` | `working-directory/change` |
| `docs/persistence-changes/2026-09-14-image-offload.schema.json` | `image/offload` |
| `docs/persistence-changes/2026-09-14-workspace-changes-event.schema.json` | `workspace/changes` |
| `docs/persistence-changes/2026-09-18-schedule-optional-title.schema.json` | optionaler Titel in `schedule/change` |
| `docs/persistence-changes/2026-09-19-external-subagent-catalog.schema.json` | externe Subagent-Katalogeinträge |
| `docs/persistence-changes/2026-09-20-unknown-child-catalog.schema.json` | Unknown-Mode-Kindeinträge |
| `docs/persistence-changes/2026-09-21-user-question-reply.schema.json` | User-Question-Reply |
| `docs/persistence-changes/2026-10-05-ptc-operation-metadata.schema.json` | PTC-Operations-Metadaten |
| `docs/persistence-changes/2026-10-05-working-directory-attribution.schema.json` | Working-Directory-Attribution |
| `docs/persistence-changes/2026-10-07-title-reasoning-effort.schema.json` | Reasoning-Effort im Titel-Request |
| `docs/persistence-changes/releases/dsh-v<version>.schema.json` | Pro Produkt-Release eingefrorenes Vokabular (31 Dateien von `dsh-v0.0.1-rc.1` bis `dsh-v0.1.5-rc.2`) |

Der `JsonlHeaderLine`-Root in den historischen v0/v1-Schemas beschreibt die physische erste Zeile:
`type` (Literal `"session"`), `version`, `id`, `createdAt`, `isSeeded`, `delegationDepth` (dort
**required**), optional `cwd`, `parentSession`, `origin`, `agentPreset`
(`docs/persistence-changes/2026-09-11-initial.schema.json:85-170`).

---

## 2. Die Migrationskette v0 → v1 → v2 → v3 → v4

Die Kette ist in `packages/session/session-format-catalog/src/generated.ts:26-31` fest verdrahtet:
`migrations: [sessionFormatV0ToV1, sessionFormatV1ToV2, sessionFormatV2ToV3, sessionFormatV3ToV4]`
und `currentVersion: 4`.

### 2.1 Gemeinsamer Rahmen

`defineSessionFormatMigration` erzwingt: nicht-leerer `name`, `toVersion === fromVersion + 1`
(`packages/session/session-format/src/chain.ts:24-34`). Jede Migration wird über
`SessionFormatEvent` / `SessionFormatEventRun` / `SessionFormatJsonObject` /
`SessionFormatMigrationContext` / `SessionFormatMigrationStage` aus `@deepseek-ai/dsh-session-format`
gefahren; Header über `SessionFormatHeader`.

### 2.2 `session-format-v0-to-v1` — Identitätskante mit Legacy-Normalisierung

Datei: `packages/session/session-format-v0-to-v1/src/migration.ts` (Name
`@deepseek-ai/dsh-session-format-v0-to-v1`, `fromVersion: 0`, `toVersion: 1`).
Der Header wird nur auf `version: 1` angehoben (`migration.ts:31-34`) — **verlustfrei**.

Obwohl der Edge „identity" heißt, normalisiert der Body zahlreiche Vor-React-Loop-Repräsentationen.
`normalizeReleasedV0Event` (`migration.ts:85-103`) wendet folgende Regeln in dieser Reihenfolge an:

| Regel | Transformation | Bedingung |
|---|---|---|
| `normalizeLegacyCompactionType` | `compact/start` → `compaction/start`, `compact/summary` → `compaction/summary`, `compact/end` → `compaction/end`, `compact/prune` → `compaction/prune` | immer, wenn der Typ passt |
| `normalizeLegacyTurnStart` | entfernt `data.trigger`, behält `{ turn }` | nur wenn `data.trigger` vorhanden; `turn ≥ 1` und `trigger.kind` nicht-leerer String, sonst malformed |
| `normalizeLegacyTurnEnd` | `reason.kind: 'aborted'` ohne `reason` → `{ kind: 'aborted', reason: { kind: 'legacy' } }`; `'disposed'` → `{ kind: 'aborted', reason: { kind: 'disposed' } }`; `'error'` ohne `error` → normalisiertes Fehlerobjekt | `completed`/`blocked`/`max-tokens`/`interrupted` bleiben unverändert |
| `normalizeLegacyErrorReason` | `reason.failure` → `reason.error` = das `failure`-Objekt; sonst `{ message, code: code ?? 'UNKNOWN' }` | fehlendes `code` wird zu `'UNKNOWN'` — **eine nicht verlustfreie Default-Füllung** |
| `normalizeLegacyRequestHeader` | entfernt `header.messagePrefix` aus `request/header.data.header` | nur wenn vorhanden; nicht-Array → Fehler |
| `normalizeLegacySteering` | `steering/message` → `user/message`; Variante mit `data.message` übernimmt den Wrapper, Variante mit `content`/`source` bekommt zusätzlich `id` und `role: 'user'` | immer |
| `normalizeLegacyRetry` | ergänzt `llm/retry.data.retryId`, wenn das Feld fehlt: Wiederverwendung der Ketten-ID oder `legacy-retry:<sessionId>:<seq>` | nur wenn `retryId` nicht als Own-Property existiert |
| `normalizeLegacyCompaction` | `compaction/start` erhält `compactionId` (`legacy-compaction:<sessionId>:<seq>`); `compaction/summary` und `compaction/end` erben die offene ID; `user/message` mit `source { kind: 'plugin', plugin: 'compact' }` erhält `source.compactionId` | Zustand wird bei `session/end-seed` verworfen |
| `normalizeLegacyMessage` | `user/message` erhält `id` + `role: 'user'`; `assistant/message` wird zu `{ message: { id, role: 'assistant', content, source: { ...source, kind: 'model' } } }` umgebaut (Legacy-Key `provenance` wird entfernt); `tool/result` wird zu einer User-Nachricht mit `content: [{ type: 'tool-result', toolCallId, content, isError }]` und `source: { kind: 'tool', callId }` | jeweils nur bei der exakten Legacy-Form |

Erzeugte IDs haben die Form `legacy-message:<sessionId>:<seq>` und
`legacy-compaction:<sessionId>:<seq>` bzw. `legacy-retry:<sessionId>:<seq>`
(`migration.ts:151, 173, 440-442`).

**Verweigerungen (nicht verlustfrei konvertierbar):**
- `request/header-delta` und `mode/set` → `SessionFormatUnsupportedMigrationError`
  (`migration.ts:224-229`).
- `request/header` mit `data.reason === 'fallback'` (`migration.ts:230-237`).
- `tool/result` mit `surfaceOp.op === 'replace'`, dessen `start` auf eine Nachricht ohne Identität zeigt
  (`migration.ts:400-402`).
- Delivery-Marker `session-log-deepseek/delivery-accepted`, der bei `sessionFormatVersion === 0`,
  nicht vererbtem `seq` und fremder `sessionId` die falsche Session nennt (`migration.ts:121-133`).

**Erhaltung konsumierter Läufe:** Der v0/v1-Codec dekodiert die gepackten
Assistant-Zeilen `text-chunks`, `reasoning-chunks`, `tool-call-chunks` in einen
`ReleasedAssistantChunkRun` (`packages/session/session-format-v0-to-v1/src/codec.ts:26-33, 203-265`)
mit `runType: 'released-assistant-chunks'`, `turn`, `step`, `lastSeq`, `lastTime`, `stream`.
Dieser Lauf wird von v0→v1 **unverändert weitergereicht** und erst von v1→v2 expandiert —
das ist der Grund, warum die Kette verlustfrei bleibt.

**Physischer Header v0/v1** (`codec.ts:21-22, 142-187`): required `type`, `version`, `id`,
`createdAt`, `delegationDepth`; optional `cwd`, `parentSession`, `seedLength`, `origin`, `agentPreset`.
`seedLength` (Default `0`) wird zu `isSeeded = (seedLength !== undefined)` und zum
`inheritedEventCount`. **`seedLength` existiert in v2+ nicht mehr** — der Schnitt wird dort aus dem
getaggten `session/end-seed` abgeleitet.

**Verlustfreiheit:** Überwiegend verlustfrei, mit zwei bewussten Bedeutungszuweisungen
(`code: 'UNKNOWN'` bei fehlendem Fehlercode; generierte Legacy-IDs). Nicht unterstützte Legacy-Formen
werfen und verändern die Quelle nicht.

### 2.3 `session-format-v1-to-v2` — Assistant-Chunks werden zu Attempts eingebettet

Datei: `packages/session/session-format-v1-to-v2/src/migration.ts` (Name
`@deepseek-ai/dsh-session-format-v1-to-v2`). Der Header wird nur auf `version: 2` angehoben
(`migration.ts:47-50`).

**Zentrale Strukturänderung:** Die separaten `assistant/chunk`-Top-Level-Events entfallen. Die
Chunks werden in eine **kompakte Stream-Repräsentation** eingebettet, die an
`assistant/attempt` (`data.stream`) bzw. `assistant/message` (`data.stream`) hängt.

| Aspekt | Regel |
|---|---|
| Gruppierung | `AttemptGroup` pro `(turn, step)` mit `spans`, `stream`, `chunkCount`, `terminal` (`migration.ts:30-40`) |
| Akkumulation | Top-Level-`assistant/chunk` wird über `AssistantStreamAccumulator` (aus `@deepseek-ai/dsh-llm`) gesammelt (`migration.ts:256-260`) |
| Terminierung | Chunk mit `chunk.type === 'finish'` setzt `terminal` (`migration.ts:262`) |
| Chunk-Spannen | zusammenhängende `firstSeq`-Bereiche werden zusammengeführt (`recordChunkSpan`, `migration.ts:461-471`) |
| Stream-Zusammenfassung | gleichartige aufeinanderfolgende Records mit gleichem `index` (und bei Tool-Calls gleichem `id`/`name`) werden unter Erhalt der `dt`-Lücken verschmolzen (`appendStreamRecord`, `migration.ts:498-532`) |
| `assistant/message` | muss `sourceEventSeqs` genau auf die vollständige geordnete Chunk-Menge zeigen; `matchesChunkSources` prüft Element-für-Element-Übereinstimmung mit `chunkCount` (`migration.ts:265-301, 473-483`) |
| Erzeugter Attempt | `attemptEvent` erzeugt `{ type: 'assistant/attempt', seq: lastChunkSeq, time: lastChunkTime, data: { turn, step, stream } }` (`migration.ts:557-564`) |
| Sequenz-Remapping | jede Quelle bekommt eine Ziel-Sequenz; alle auditierten Referenzen werden über `mapping` umgeschrieben (`remapReferences` / `remapPayloadReferences`, `migration.ts:566-661`) |
| Umgeschriebene Referenzfelder | `sourceEventSeqs`, `surfaceOp` (`start`/`end` → `replace`), `command/done.sourceEventSeq`, `compaction/prune`/`compaction/summary` `shadowedRange` + `shadowedSeqs`, `session/title`/`session/title-llm-request` `messageSeqs` |
| Vererbter Schnitt | `targetCut` wird ab dem ersten Event ab `sourceCut` fortgeschrieben; bei `isSeeded` wird bei Bedarf ein synthetischer `session/end-seed` mit `{ inherited: true }` eingefügt (`migration.ts:351-368`) |
| Goal-Split | `user/message` mit `source { kind: 'goal', change }` wird in einen neuen `goal/change`-Event plus eine `user/message` mit `source { kind: 'plugin', plugin: 'goal' }` aufgeteilt (`migration.ts:428-448`) |
| Legacy-Turn-Reparatur | Aufeinanderfolgendes `turn/start` mit `turn === openTurn + 1` direkt nach `agent/inbox/spliced` mit `target: 'next-turn'` erzeugt einen eingefügten `turn/end` mit `reason: { kind: 'interrupted' }` (`migration.ts:393-410`) |

**Verweigerungen:** unbekannter Event-Typ, `assistant/message` ohne vollständige Chunk-Referenzen,
`turn/start` das den offenen Turn nicht schließt, ein inherited Cut, der einen Assistant-Attempt
teilt, ein Delivery-Marker mit falscher Session (`migration.ts:130-137, 281-295, 370-381, 677`).

**Verlustfreiheit:** ja für die Event-Bedeutung — die Chunk-Sequenz wird nur kompakter
repräsentiert; die Ziel-Bedeutung ist vollständig rekonstruierbar.
**Physischer Codec v2** (`packages/session/session-format-v1-to-v2/src/codec.ts:19-23`):
required `type`, `version`, `id`, `createdAt`, `isSeeded`, `delegationDepth`; optional `cwd`,
`parentSession`, `origin`, `agentPreset`. Der Decoder leitet `inheritedEventCount` aus dem
`session/end-seed` mit `inherited === true` ab und **verlangt** ihn bei `isSeeded` bzw. **verbietet**
ihn bei `!isSeeded` (`codec.ts:114-128`).

### 2.4 `session-format-v2-to-v3` — System-Prompt-Promotion + PTC-Umbenennung

Datei: `packages/session/session-format-v2-to-v3/src/migration.ts`.

**Header** (`migration.ts:16-19`): `version: 2 → 3`, und `agentPreset: 'code'` wird zu `'ptc'`.

| Änderung | Regel |
|---|---|
| System-Prompt-Promotion | `request/header.data.header.system` wird aus dem Header entfernt und als eigener `system/message`-Event emittiert (`emitSystem`, `migration.ts:109-136`); bei jedem Wechsel des Prompt-Textes entsteht ein neuer Event mit `surfaceOp: 'append'` (erster Head) bzw. `{ op: 'replace', start: head, end: head }` + `sourceEventSeqs: [head]` |
| Generierte System-Message-ID | `'v2-to-v3-system-' + sha256(JSON.stringify(['session-format-v2-to-v3', sessionId, anchor.seq, anchor.type]))` (`migration.ts:113-114`) |
| System-Source | `{ kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' }`, `role: 'system'` |
| Leerer Prompt | `content: []`; bei fehlendem `system` wird `''` verwendet (`migration.ts:52-53`) |
| Event-Umbenennung | `tool/code-dispatch-start` → `tool/ptc-dispatch-start`; `tool/code-dispatch` → `tool/ptc-dispatch` (`renamePtcEvent`, `migration.ts:140-148`) |
| Preset-Umbenennung | `agent-preset/selected.data.agentPreset === 'code'` → `'ptc'` |
| Source-Umbenennung | `user/message`, `agent/inbox/spliced[].inserted[]`, `session/title-llm-request.data.messages[]`: `source { kind: 'plugin', plugin: 'tools-code-mode' }` → `plugin: 'tools-ptc'` (`renameMessageSource`, `migration.ts:169-173`) |
| SurfaceOp-Kanonisierung | `replace` mit `start`/`end` wird zu `{ op: 'replace', startSeq, endSeq }` (`canonicalizeTransformedEvent`, `payload.ts:344-371`) |
| Header-Kanonisierung | leeres `header.tools: []` und leeres `header.adapterDefaults: {}` werden **entfernt** (`payload.ts:359-368`) |
| Sequenz-Mapping | dicht, `event.seq === this.mapping.length` erzwungen (`migration.ts:45`) |

**Verweigerungen:**
- Ein Surface-Event **vor** dem ersten Schritt kann keinen System-Head erhalten
  (`migration.ts:56-58`).
- Ein geänderter Request-Prompt **außerhalb** eines offenen Steps kann die Chronologie nicht bewahren
  (`migration.ts:110-112`).
- Generierte System-Message-ID kollidiert mit einer vorhandenen oder generierten ID
  (`migration.ts:115-117, 104`).
- Delivery-Marker, der bereits `sessionFormatVersion === 3` behauptet (`migration.ts:65`).
- Delivery-Marker der Generation 2 mit fremder `sessionId` ohne `parentSession` bzw. nicht vor dem Cut
  (`migration.ts:88-91`).
- Nicht klassifizierte Events (`RELEASED_V2_EVENT_DISPOSITIONS[type] === undefined` und kein
  Feedback-Message-Event) bzw. nicht klassifizierte Message-Source-Kinds oder Content-Kinds
  (`payload.ts:49-50, 110-121, 169-173`).
- `request/header.header.system` in V3-Quellen (auch leer) → `SessionFormatUnsupportedMigrationError`
  (`payload.ts:212-224`).

Bekannte Source-Kinds (`payload.ts:10`): `user`, `plugin`, `model`, `tool`, `agent-instructions`,
`session-reference`, `team-message`, `goal`, `skill-invocation`, `skill-catalog`, `coordinator`,
`subagent-report`, `subagent-settled`, `webhook`, `agent-message`.
Bekannte Content-Kinds (`payload.ts:123`): `text`, `reasoning`, `image`, `file`, `tool-call`,
`tool-result`.

Feedback-Validierung (`payload.ts:243-257`): `feedback/message-put` required `sessionId` + `item`,
`item` required `messageId`, `rating`, `version`, `createdAt`, `updatedAt` und optional `note`;
`rating` ∈ `{ positive, negative }`. `feedback/message-delete` required `sessionId` + `messageId`.

**Verlustfreiheit:** inhaltlich ja; die Änderungen sind Re-Repräsentationen (Header-Feld wandert in
einen Event, Dispatch-Tags und Plugin-Namen werden umbenannt). Ein `header.system` ist danach nicht
mehr im Request-Header vorhanden — die Information lebt als Surface-Event weiter.

### 2.5 `session-format-v3-to-v4` — Tool-Role, Message-Sources, Parent-Kataloge

Datei: `packages/session/session-format-v3-to-v4/src/migration.ts`. Name
`@deepseek-ai/dsh-session-format-v3-to-v4`. Der Header wird nur auf `version: 4` angehoben
(`migration.ts:19-22`).

**Besonderheit — explizite Child-Evidenz.** `sessionFormatV3ToV4.createStage()` **wirft** ohne
gebundene Child-Fakten:
`'V3 catalog migration requires explicit historical child facts, including an empty array for a parent without children'`
(`migration.ts:23-25`). `createSessionFormatV3ToV4(children)` (`migration.ts:34-39`) bindet die
Evidenz; `createSessionFormatCatalogWithChildren(children)`
(`packages/session/session-format-catalog/src/children.ts:13-19`) ersetzt nur diese eine Kante im
Optionsobjekt. Ein leeres Array deklariert ausdrücklich „keine Kinder".

`packages/session/session-format-catalog/src/historical.ts` definiert zusätzlich einen
**historischen Katalog** mit `currentVersion: 3`, der nur V0–V3 dekodiert und niemals publiziert
(`historical.ts:10-21`).

| Transformation | Regel | Datei |
|---|---|---|
| Tool-Result-Lifting | `tool/result` mit `role: 'user'` wird zu `role: 'tool'`; `content[0].toolCallId` wandert nach `message.toolCallId`; `content[0].content` wird direktes `message.content`; `content[0].isError` wird optionales `message.isError`; der `tool-result`-Wrapper entfällt | `src/tool-role.ts` |
| Wrapper-Restfelder | andere Wrapper-Felder werden `plugin:result:<original-field>`; äußere Message-Felder außer `id`, `role`, `source`, `content` werden `plugin:message:<original-field>` | `src/tool-role.ts` / README |
| Extension-Namespacing | unbekannte V3-Content-Tags werden `plugin:<original-type>`; Stream-Starts nutzen denselben Tag in `blockType` | `src/content.ts` / README |
| Opaque Events | unbekannte **ignorable** V3-Events werden zu `type: 'plugin:<original-type>'` mit unverändertem Payload; nur `seq` wird umnummeriert | `src/extension-identities.ts:75-79` |
| Message-Source-Konversion | `plugin`-Source wird zu `kind`; siehe Tabelle unten | `src/sources.ts` |
| Message-Walker-Positionen | `user/message: data`; `system/message`/`developer/message`/`assistant/message`/`tool/result`: `data.message`; `agent/inbox/spliced`: `data.inserted[]`; `session/title-llm-request`: `data.messages[]` | README |
| Interrupted-Turn-Reparatur | offener Turn ohne offenen Step + nächster nummerierter `turn/start` direkt nach nicht-leerem `agent/inbox/spliced` mit `target: 'next-turn'` → eingefügter `turn/end` mit `reason: { kind: 'interrupted' }` und dem Zeitstempel des Starts | `migration.ts:117-135, 67-71` |
| Referenz-Remapping | `sourceEventSeqs`, `startSeq`/`endSeq`, `command/done.sourceEventSeq`, `session/title*.messageSeqs`, `compaction/prune|summary.shadowedRange` + `shadowedSeqs`, `image/offload`-Ziel-`seq` | `src/references.ts` |
| Parent-Katalog-Anhang | fehlende Kind-Einträge werden **nach** allen Source-Events angehängt, sortiert nach `childCreatedAt`, dann `childId`; Zeit = Zeit des letzten Source-Events, bei leerem Log die Header-Zeit | `migration.ts:137-174` |
| Vererbter Schnitt | letzter `session/end-seed` mit `inherited: true` bestimmt den Cut; jeder vererbte Marker verwirft frühere Katalog-Kandidaten | `migration.ts:74-78, 140-147` |

**Message-Source-Konversionstabelle** (README `session-format-v3-to-v4`):

| V3 `plugin` | V4 `kind` |
|---|---|
| `compact` | `compact-checkpoint` |
| `tools-code-mode`, `tools-ptc` | `ptc-mode` |
| `dsh-compaction-basic` | `compact-basic` |
| `@deepseek-ai/dsh-system-prompt` (Rolle `system`) | `system-prompt` |
| `@deepseek-ai/dsh-system-prompt` (andere Rolle) | `runtime-context` |
| Gleichnamige First-Party-Produzenten | exakt der Plugin-String |
| jeder andere Plugin-Name | `plugin:` + vollständiger Originalname |

Gleichnamige Produzenten: `agent-instructions`, `session-reference`, `team-message`, `goal`,
`skill-invocation`, `skill-catalog`, `coordinator`, `subagent-report`, `subagent-settled`, `webhook`,
`agent-message`, `model-selection`, `plan-mode`, `time-context`, `tmux-context`, `user-approval`,
`repeat-tool-reminder`, `tool-cordis`, `cordis-host-runner`, `tool-goal`, `tool-jobs`,
`hooks-codex`, `hooks-claude-code`, `schedule`, `dsh-session-title-llm`.

**Parent-Katalog-Evidenzregeln** (README, Tabelle „Parent catalog prerequisites"):

| Verfügbare Evidenz | Entscheidung |
|---|---|
| Ein Descriptor, Version 1 | String `provider` + `label` verlangt; `mode: 'continuable'` abgeleitet |
| Ein Descriptor, Version 2 oder 3 | `provider` verlangt; `mode` und optionales `label` aus dem Descriptor |
| Null Descriptoren oder nicht unterstützte Version | bestehenden Parent-Eintrag behalten, sonst Unknown-Mode-Membership anhängen |
| Mehr als ein eigener Descriptor | bestehenden Parent-Eintrag ohne Mode/Label-Vergleich behalten, sonst Unknown-Mode |
| Bestehender eigener Parent-Eintrag | behalten (inkl. Extensions); `childCreatedAt` muss passen, Mode/Label aus genau einem unterstützten Descriptor |
| Fehlender Eintrag mit vollständiger Evidenz | Katalog-Fakt **Version 0** mit `childId`, `childCreatedAt`, `mode`, optional `label` |
| Fehlender Eintrag ohne vollständige Evidenz | `subagent/catalog` **Version 1** mit Header-Identität und `mode: 'unknown'`, ohne erfundenen Label |

Katalog-Versionen: 0 und 1 verlangen String `childId`, non-negative safe integer `childCreatedAt`,
`mode` ∈ `{ continuable, one-shot }` (Version 1 zusätzlich `unknown`) und bei `continuable` einen
String `label`; Version 2 akzeptiert nur `mode: 'external'` mit optionalem String `label`.
Doppelte eigene Child-IDs werden verweigert.

**Delivery-Generationen** (README):

| Record | Behandlung |
|---|---|
| Interpretierter `session-log-deepseek/delivery-accepted` | Generation muss non-negative safe integer sein; fehlend ⇒ V0 |
| V3-Marker mit Generation 4 | **Refusal** — das Header-Advance darf kein Ziel-Watermark aktivieren |
| V3-Marker mit Generation 3 | non-empty `sessionId` und non-negative safe integer `throughSeq` vor dem Marker; fremde ID nur vor dem Cut mit `parentSession` |
| Andere Generationen (auch > 4) | Typ und Payload-Koordinaten unverändert; in V4 inaktiv |
| Nativer V4-Marker mit Generation 4 | dieselben Koordinaten- und Ownership-Prüfungen |
| Nativer V4-Marker mit historischer Generation | Koordinaten und Identität bleiben; kein V4-Acceptance-Watermark |

**Verweigerungen der Kante:**
- `deferLoading` als eigenes Top-Level-Feld einer Request-Tool-Definition in V3
  (das Feld existiert nur in V4).
- Unbekannte **required** V3-Event-Typen vor jeder Payload-Interpretation.
- Verschachtelte Tool-Results (ein `tool-result`-Wrapper in einem `tool-result`).
- Widersprüchliche gelieferte Child-Fakten oder geänderte Parent-Historie.
- Fremder Delivery-Marker ohne `parentSession` oder nicht vor dem Cut.
- `session/end-seed` mit `inherited: true` in einer nicht geseedeten Session.

**Verlustfreiheit:** inhaltlich ja für die genannten Repräsentationen — Zeitstempel,
Message-Identitäten und alle Felder außerhalb der expliziten Konversionen bleiben erhalten. Der Edge
erzeugt **keinen** System-Prompt, **kein** Developer-Event, **keine** Tool-Ausführung und **keine**
Ersetzungsnachricht (README, „V3-to-V4 specification"). Bewusst nicht verlustfrei ist nur die
Unknown-Mode-Eintragung (kein Label wird erfunden) und die Namensraum-Präfixierung
(`plugin:` wird bei bereits präfigierten Namen doppelt angewendet).

### 2.6 Native V4-Admission (kein Migrationsschritt)

V4-Eingaben laufen **nie** durch V3→V4. `packages/session/session-format-v3-to-v4/src/codec.ts`
implementiert den nativen Codec als Wrapper um den v2-Codec: `physicalV2()` setzt `version` auf `2`,
delegiert und stellt `version: 4` wieder her (`codec.ts:14-54`). `assertV4RowAdmission`
(`codec.ts:62-75`) prüft in dieser Reihenfolge: `assertV4DeveloperData`,
`assertV4SourceRowAdmission`, `assertV4RetiredSyntax`, `assertV4SystemMessageFields` und bei
`tool/result` zusätzlich `assertV4ToolResultMessage` + `assertV4ForkResult`.
Ignorable Developer-Payloads werden ohne Reader-Vokabular zurückgestellt.

Native V4-Kernregeln (README „Native V4 admission"):
- Header: exakt `version`, `id`, `createdAt`, `isSeeded`, `delegationDepth` required;
  `cwd`, `parentSession`, `origin`, `agentPreset` optional; keine weiteren Keys; `cwd` absolut.
- Envelope: nur `surfaceOp`, `sourceEventSeqs`, `ignorable` zusätzlich; `ignorable` exakt `true`.
- `sourceEventSeqs` non-empty, eindeutig, jede Sequenz früher als `seq`; `assistant/message` muss es weglassen.
- `developer/message` mit Additions braucht `headerSeq`, der genau einen früheren `request/header` wählt;
  jeder Name muss dort genau eine Definition mit String `description` und Objekt `parameters` treffen.
  Events ohne Additions müssen `headerSeq` weglassen.
- `request/header.header.tools[].deferLoading` muss, wenn vorhanden, exakt `true` sein.
- `tool/result`: Rolle `tool`, non-empty Message- und Call-IDs, passende `source.kind: 'tool'` +
  `source.callId`, direktes Array-`content`, kein retirierter Result-Wrapper, boolesches `isError`
  wenn vorhanden; `data.error` verlangt `isError: true`.
- `request/header`-Config: non-empty `provider`/`model`; `reason` ∈
  `{ initial, resume, change, series }`; `startsSeries` wenn vorhanden `true`.
- System-Bilder: non-empty `attachmentId`, MIME ∈ PNG/JPEG/WebP/GIF, non-negative `bytes`,
  positive `width`/`height`, optionaler String `name`.
- Fork-Ergebnisse: synthetische `TOOL_NOT_STARTED`-Ergebnisse mit IDs
  `forked-tool-result-<callId>-<seq>`, Rolle `tool`, `isError: true`, `ToolNotStartedError`;
  gestartete Fork-Calls nutzen `TOOL_OUTCOME_UNKNOWN`.
- Der historische Not-Started-Repair behält sein kanonisches Präfix
  `interrupted-tool-result-<callId>-<n>` (`packages/session/session-format-v2-to-v3/src/payload.ts:102-108`).

---

## 3. Der Format-Katalog

`packages/session/session-format-catalog` ist die build-statische Assembly.

### 3.1 Erkennung und Ordnung von Migrationen

`createSessionFormatChain` (`packages/session/session-format/src/chain.ts:41-77`):

1. `currentVersion` wird als safe integer validiert.
2. Jede Migration wird via `defineSessionFormatMigration` validiert und gefroren:
   `toVersion === fromVersion + 1` ist **Pflicht**.
3. Doppelte `fromVersion` → `SessionFormatError`; doppelte `name` → `SessionFormatError`.
4. Von `0` bis `currentVersion - 1` muss jede Kante existieren, sonst
   `SessionFormatUnsupportedMigrationError('Session migration vN->vN+1 is missing')`.
5. Überzählige Kanten (`>= currentVersion`) → `SessionFormatError('… does not lead to current vN')`.

Die Reihenfolge ist damit **nicht deklarationsabhängig**, sondern ausschließlich numerisch lückenlos.

`createSessionFormatCatalog` (`packages/session/session-format/src/catalog.ts:29-43`) erzwingt
zusätzlich: genau ein Codec je Version `0..currentVersion`, keine Duplikate, kein Codec neuer als
`currentVersion`.

### 3.2 Versionserkennung aus einer Datei

`inspectSessionFormatVersion` liest **nur** `headerValue['version']`
(`packages/session/session-format/src/json.ts:58-63`). `catalog.readHeader` liefert
(`catalog.ts:45-90`):

| Ergebnis | Bedingung |
|---|---|
| `malformed` | Header ist kein JSON-Objekt oder `version` ist keine non-negative safe integer |
| `unsupported` | `storedVersion > currentVersion` → Reason „stored Session uses newer format vN; this build writes vM" |
| `unsupported` | kein Codec für `storedVersion` |
| `unsupported` | Header-Migration wirft `SessionFormatUnsupportedMigrationError` |
| `current` | `storedVersion === currentVersion` |
| `migration-required` | `storedVersion < currentVersion` |
| `malformed` | Codec-Header-Dekodierung oder Migration schlägt anders fehl |

`readHeader` liest **keine** Event-Zeilen; der exakte vererbte Schnitt ist erst nach einem Body-Read
bekannt.

Die Datei-Ebene nutzt zusätzlich einen **Vorab-Versionscheck**: `refuseForeignFormatVersion`
(`packages/session/session-persistence-jsonl/src/format.ts:340-346`) wirft
`SessionFormatUnsupportedError` **bevor** die aktuelle Header-Shape validiert wird — eine zukünftige
Formatversion muss die strukturellen Checks dieses Builds nicht erfüllen, und der Nutzer soll
„upgrade the harness" sehen, nie „corrupt session log".

### 3.3 Anwendung

`createRestore(headerValue, { recovery, validation })` (`catalog.ts:124-157`):
- `storedVersion === currentVersion` → `CurrentSessionFormatRestore` mit dem Codec-Decoder und
  `restoreCurrent` (bei `validation: 'current'`) bzw. Identität (bei `'transformed'`).
- sonst → `MigratingSessionFormatRestore` mit `chain.createStream(...)` und einem
  `SessionFormatEventCollector`; bei `validation: 'transformed'` wird `restoreTransformedCurrent`
  verwendet, und ein Fehler wird in
  `SessionFormatUnsupportedMigrationError('Session migration from vN to vM refuses the transformed artifact: …')`
  umgewandelt (`catalog.ts:231-251`).

`validation: 'transformed'` bedeutet laut README: veröffentlichte Current-Format-Validierung nur
**nach** einer historischen Migration; bereits aktuelle Eingaben bekommen nur die Codec-Validierung.

### 3.4 Die statische Assembly

`packages/session/session-format-catalog/src/generated.ts` (generiert von
`scripts/gen-session-format-catalog.ts`, „do not edit by hand"):

| Feld | Wert |
|---|---|
| `currentVersion` | `4` |
| `codecs` | `releasedV0SessionFormatCodec`, `releasedV1SessionFormatCodec`, `releasedV2SessionFormatCodec`, `releasedV3SessionFormatCodec`, `releasedV4SessionFormatCodec` |
| `currentEncoder` | `releasedV4SessionFormatCodec` |
| `migrations` | `sessionFormatV0ToV1`, `sessionFormatV1ToV2`, `sessionFormatV2ToV3`, `sessionFormatV3ToV4` |
| `restoreCurrent` | `restoreReleasedV4Artifact(artifact, KNOWN_SESSION_EVENT_TYPES)` + `validateInstalledCurrentSessionArtifact` |
| `restoreTransformedCurrent` | `restoreReleasedV4Artifact(artifact, KNOWN_SESSION_EVENT_TYPES)` |
| `restoreCurrentHeader` | `assertReleasedV4Header(header)` + `validateInstalledCurrentSessionHeader` |

Codec-Eigentümerschaft: v0/v1 in `session-format-v0-to-v1`, v2 in `session-format-v1-to-v2`,
v3 in `session-format-v2-to-v3`, v4 in `session-format-v3-to-v4` (das v3 weiterreexportiert).

### 3.5 Exports des Katalogs

`packages/session/session-format-catalog/src/index.ts`:
`sessionFormatCatalog`, `createSessionFormatCatalogWithChildren`, `historicalSessionFormatCatalog`,
`SessionFormatUnsupportedMigrationError` (reexportiert aus `@deepseek-ai/dsh-session-format`).

---

## 4. Persistenz-Verhalten

### 4.1 Das Seam (`session-persistence`)

Service-Name: **`ctx.sessionPersistence`** (`packages/session/session-persistence/README.md`).
Der Konfigurationseintrag lautet `@deepseek-ai/dsh-session-persistence` / Klasse `SessionPersistence`
(`docs/config-catalog.md:4621`).

Fünf Service-Methoden (`README.md:38-45`):

| Methode | Bedeutung |
|---|---|
| `create(header)` | neue Session speichern, Write-Ownership übernehmen |
| `open(id, 'write')` | Single-Writer-Ownership einer bestehenden Session beanspruchen |
| `open(id, 'read')` | beobachten ohne Ownership |
| `stat(id)` | Header + Revision (+ `eventCount` / `sizeBytes`) ohne Log-Read |
| `list()` | ein Snapshot pro sichtbarer gespeicherter Session |
| `flush()` | backend-weite Durability-Barriere über alle aktiven Write-Handles |

Handle-Vertrag: `handle.read(offset?, length?)` → `{ eventState, events }` mit `eventState` ∈
`{ detached, shared-frozen }`; `handle.append(events)` verlangt, dass die erste `seq` der
gespeicherten Next-Seq entspricht; `handle.flush()` ist die Barrier und materialisiert auch eine
leere erzeugte Session; `handle.close()` ist idempotent und nicht abbrechbar
(`README.md:49`).

Fehlerklassen (`README.md:53`): `SessionAlreadyOwnedError`, `SessionAlreadyExistsError`,
`SessionReadOnlyError`, `SessionHandleClosedError`, `SessionOwnershipLostError`,
`SessionPersistenceCorruptionError`, `SessionPersistenceNotFoundError`,
`SessionFormatUnsupportedError`.

### 4.2 Der JSONL-Backend (`session-persistence-jsonl`)

Konfiguration (`packages/session/session-persistence-jsonl/src/index.ts:90`,
`docs/config-catalog.md:2755-2774`):

| Feld | Pflicht | Default | Bedeutung |
|---|---|---|---|
| `root` | **required** | keiner | Wurzelverzeichnis aller Session-Dateien. Ein `process.cwd()`-Default würde Dateien streuen. Existierendes Root muss ein lesbares Verzeichnis sein; ein fehlendes Root wird bei der ersten Materialisierung erzeugt |
| `compression` | optional | `'zstd'` | `'zstd'` = gechecksumte Frames, `'none'` = zeilengetrennter UTF-8-Text |

Batching-Fenster ist **keine** Konfiguration, sondern interne Scheduling-Policy je Write-Handle
(`README.md:50`).

#### 4.2.1 Verzeichnis-Layout auf der Platte

Aus `packages/session/session-persistence-jsonl/src/format.ts:225-305` und
`README.md:54-72`:

```
<root>/
  --<projekt-key>--/                  # lesbares Projektverzeichnis, ODER
  _no-cwd/                            # wenn die Session kein cwd hat
    <encoded-id>/                     # session-eigenes Verzeichnis
      session.jsonl.zstd              # Generation 0, komprimiert
      session.v1.jsonl.zstd           # Generation 1, komprimiert
      session.v2.jsonl.zstd           # Generation 2, komprimiert
      session.v3.jsonl.zstd           # Generation 3, komprimiert
      session.v4.jsonl.zstd           # Generation 4 = aktuell, komprimiert
      session.jsonl                   # Generation 0, roh (compression: 'none')
      session.v1.jsonl                # Generation 1, roh
      ... session.vN.jsonl            # jede weitere Generation, roh
      session.lock                    # Lock-Datei (POSIX)
```

- **Projektverzeichnis** (`projectKey`, `format.ts:225-245`): Dateisystem- und Laufwerksseparatoren
  (`/`, `\`, `:`) werden zu `-` (Läufe zusammengefasst), unsichere Code-Units zu `~XXXX`
  (Großbuchstaben-Hex, 4 Stellen). Führende `-` werden entfernt, leer ⇒ `root`. Ergebnis:
  `--<slug.slice(0, 251)>--`. Separatorersetzung und Trunkierung sind **bewusst verlustbehaftet**.
- **Session-Verzeichnis** (`encodeSegment`, `format.ts:199-214`): injektive Kodierung über **alle**
  JS-(UTF-16-)Strings inklusive Lone Surrogates. Sichere Code-Units (`[A-Za-z0-9._-]`, außer `~`)
  bleiben literal; alles andere — inklusive `~` — wird `~XXXX`. `.` → `~002E`,
  `..` → `~002E~002E`. Leerer String wirft.
- **Beispiel aus der Vorlage:** `home/sessions/--dsh-workspace--/<id>/session.v4.jsonl`
  (siehe `packages/experimental/webworker-runtime/tests/vfs-example-fixture.ts:506` und
  `packages/api/session-controller/tests/projection-discovery.host.spec.ts:291`).
- Runtime-Operationen wählen die **numerisch höchste** kanonische Generation.
- Ein Root gehört zu **genau einer** Kodierung: Discovery und gezielter Lookup verweigern
  Generationen mit dem jeweils anderen Suffix; Kompressionsumwandlung, Mixed-Root-Fallback und
  Dual-Write sind nicht unterstützt (`README.md:108`).

#### 4.2.2 Physische Kodierung

- `compression: 'zstd'`: eine Konkatenation unabhängiger Zstandard-Frames — **ein** gechecksumter
  Frame mit nur der Header-Zeile, danach **ein** gechecksumter Frame pro durablem Append-Batch.
  Node's eingebaute Zstandard-API auf Default-Level, **kein Level-Knopf** (`README.md:108`).
- `compression: 'none'`: dieselben logischen Speicherzeilen ohne Frame-Kompression.
- Aktuelle Generation schreibt **ein Event pro Zeile**; `sourceEventSeqs` nutzt die
  verlustfreie Lauf-Kodierung aus 1.3.2.
- Historische Migration nutzt **einen** Zstandard-Decoder, schiebt geparste Zeilen durch stateful
  Format-Stages und streamt Current-Records durch **einen** Compression-Context in ca. **1 MiB**
  Main-Thread-Slices; behalten werden nur finale Current-Events, begrenzter Decoder-State und die
  nötige Sequenz-Remap-Tabelle.
- Das Listing liest und validiert **nur** den Header-Frame.

#### 4.2.3 Durability und Crash-Semantik

Aus `README.md:74-78`:

- **Lazy Materialisierung:** `create(header)` schreibt nichts und gibt das Write-Handle zurück. Der
  erste `append` schreibt und `fsync`t Header + ersten Batch durch eine No-Overwrite-Publish.
  Eine erzeugte, aber nie beschriebene Session hinterlässt **nichts** auf der Platte, außer ihr
  Owner ruft `handle.flush()` — das publiziert einen Header-Frame ohne Event.
- **fsync-Policy:** jeder weitere Batch hängt Zeilen bzw. einen komprimierten Frame an und `fsync`t,
  **bevor** der Append auflöst. Ein gefangener Write- oder Sync-Fehler rollt die Datei auf ihre
  vorherige Länge zurück.
- **Committed Events werden nie neu geschrieben.**
- **Nach einem Crash** behält das Log seinen unterbrochenen letzten Turn — jeder Record im
  committed Prefix überlebt, und der wiederaufnehmende Reader hängt synthetische Closer über sein
  Write-Handle an.
- **Unvollständige letzte Rohzeile** wird verworfen.
- **Zerrissener letzter Zstandard-Frame** trägt nur seine vollständig dekodierbaren JSONL-Records
  bei; ein Write-Handle trunkiert die zerrissenen Bytes und schreibt diese geborgenen Records
  **durable neu**, bevor sein erster neuer Batch läuft.
- **Checksum-, Dekompressions- oder Strukturfehler in einem vollständigen committed Frame** werden
  als Corruption abgelehnt.
- Der Current-Generation-Scanner wendet die strukturellen Admission-Checks des Current-Codec-
  Owners **vor** der Recoverable-Tail-Behandlung an. Retirierte required PTC-Tags und
  `request/header.header.system` verweigern die Datei auch nach einer früheren malformed Zeile —
  Recovery trunkiert sie nie als gewöhnlichen beschädigten Tail.

#### 4.2.4 Truncation und Crash-Repair im Detail

`packages/session/session-persistence-jsonl/src/format.ts`:

| Element | Verhalten |
|---|---|
| `SessionLogScanner` | inkrementeller Scanner über vollständige JSONL-Records **nach** einem separat gelieferten Header-Record |
| Newline-Suche | bleibt auf Roh-Buffern; nur vollständige Records werden nach UTF-8 dekodiert (`format.ts:381-385`) |
| Fragment-Handling | ein über Writes hinweg laufendes Fragment wird **kopiert**, weil ein Decoder seinen Output-Buffer nach `write()` wiederverwenden darf |
| `checkpoint()` | liefert `{ inputBytes, committedBytes, eventCount }` — der Schnappschuss vor dem Anhängen eines recoverable Torn-Frame-Prefix |
| `finish()` | ignoriert einen letzten Record ohne Newline als Torn Tail; ruft `restore.finish()`, dann `assertReleasedV4Relationships(artifact, KNOWN_SESSION_EVENT_TYPES)`; liefert `{ meta, inheritedEventCount, events, committedBytes }` |
| Unparsbare committed Zeile | `corrupt session log: unparsable committed event at line N`; bei `strict` sofort geworfen, bei `recoverable` als `issue` gemerkt |
| Owned Structural Refusal | `assertV4RowAdmission(decoded, KNOWN_SESSION_EVENT_TYPES)` läuft **vor** der Recoverable-Tail-Suppression |
| Fatales `turn/end` | ein später dekodierter `turn/end` macht das ursprüngliche `issue` fatal — der Fehler wird geworfen statt weiter unterdrückt |
| `strict` vs. `recoverable` | Recovery-Policy wird einmal pro Restore gewählt (`SessionFormatRecovery`) |

#### 4.2.5 Locking und konkurrierende Writer

Aus `README.md:165-168`:

| Aspekt | Verhalten |
|---|---|
| In-Process-Claim | Der Write-Handle-Claim schließt einen zweiten Writer **innerhalb derselben Backend-Instanz** aus |
| Kernel-Lock POSIX | nicht-blockierendes `flock(2)` auf der Datei `session.lock`; schließt jede andere Instanz und jeden anderen Prozess aus |
| Kernel-Lock Windows | benannter Kernel-Semaphore, abgeleitet aus dem kanonischen Lock-Pfad; **kein Dateisystem-Footprint** |
| Lock-Zeitpunkt | beim Write-Open eines bestehenden Artefakts; bei einer erzeugten Session erst **kurz vor** dem ersten materialisierenden Write |
| Unmaterialisierte Session | hinterlässt keinen Dateisystem-Footprint (kein Lock) |
| Crash des Halters | das Lock stirbt mit dem Prozess ⇒ die Session ist sofort wieder schreibbar |
| Live-but-wedged Halter | blockiert Writer bis zum Prozessende (POSIX: das Entfernen der Lock-Datei verwirkt die Exclusion; Release selbst entfernt sie nie) |
| Netzwerkdateisysteme | Advisory `flock` ist auf manchen NFSv3-Setups unzuverlässig |
| Windows-Semaphore-Name | ist **pro Login-Session** — d.h. über Login-Sessions hinweg nicht wirksam |

Windows-Implementierung (`packages/session/session-persistence-jsonl/src/win32.ts`):

| Element | Wert |
|---|---|
| Semaphore-Name | `Local\dsh-session-lock-<sha256(resolve(path).toLowerCase())>` (`win32.ts:153`) |
| Semaphore-Zähler | initial `1`, maximum `1` |
| Timeout | `WaitForSingleObject(handle, 0)` — Null-Timeout; `WAIT_TIMEOUT` wird zu `EBUSY`/`ERROR_SHARING_VIOLATION` |
| API-Binding | Koffi, lazy geladen (`kernel32.dll`), damit Nicht-Windows-Prozesse Koffi nie laden |
| Release | `ReleaseSemaphore(handle, 1, null)` + `CloseHandle(handle)` |

#### 4.2.6 Atomic Write / Rename und Windows-Write-Through

Aus `win32.ts:1-12, 127-138` und `README.md:166`:

- **POSIX:** erstes Append nutzt `link()`, damit Same-Id-Races **fehlschlagen** statt ein
  committetes Log zu überschreiben; danach wird das Elternverzeichnis gefsynct.
  **Setzt Hard-Link-Unterstützung voraus.**
- **Windows:** Node exponiert den Parent-Directory-fsync-Vertrag nicht, daher nutzt der
  Windows-Pfad das native durable Namespace-Primitiv: ein Staging-Objekt im Zielverzeichnis
  anlegen und mit **`MoveFileExW(..., MOVEFILE_WRITE_THROUGH)`** ohne Ersetzung und ohne
  Cross-Volume-Copy-Fallback publizieren.
- `MOVEFILE_WRITE_THROUGH = 0x00000008` (`win32.ts:39`).
- Ziel darf **nicht** existieren; der Move muss auf demselben Volume bleiben.
- Win32-Fehlercodes werden auf Node-Errno abgebildet (`win32.ts:69-88`):
  `2`/`3`→`ENOENT`, `5`→`EACCES`, `17`→`EXDEV`, `32`→`EBUSY`, `80`/`183`→`EEXIST`,
  `123`→`EINVAL`, sonst `EIO`.
- Lange Pfade werden über `toNamespacedPath` behandelt; eine bloße Laufwerkswurzel wird **nicht**
  namespaced (Node lehnt die Extended-Length-Schreibweise dort als `EISDIR` ab) (`win32.ts:110-125`).
- `ensureDurableDirectoryWin32` legt jede fehlende Verzeichnisebene zuerst als zufälliges
  Staging-Geschwister `mkdir`-Temp (`.dsh-mkdir-<random>`) an und movet es dann mit
  `MOVEFILE_WRITE_THROUGH` auf seinen endgültigen Namen; Races mit einem anderen Ersteller werden
  erst akzeptiert, nachdem geprüft wurde, dass der Gewinner ein Verzeichnis ist
  (`win32.ts:183-207`).

#### 4.2.7 Lesen, Resume und Migration beim Open

Aus `README.md:80-90`:

- `stat`- und `list`-Snapshots materialisierter Sessions enthalten die Header-Klassifikation des
  Format-Katalogs als **`formatStatus`** neben dem übersetzten logischen `header`. Nach der
  Publikation eines Nachfolgers wird der Status `current`. Unmaterialisierte pending Sessions lassen
  `formatStatus` weg.
- `open(id, 'read'|'write')` wählt die höchste kanonische Generation. Current-Input läuft den
  schnellen Pfad. Bei historischem Input dekodiert und migriert ein Read-Open die Quelle **einmal**,
  validiert das aktuelle logische Ergebnis und gibt es **ohne** Nachfolger-Publikation zurück.
- Ein Write-Open nutzt die revision-keyed Preparation wieder oder führt sie aus, kodiert dann eine
  Temporärdatei **im selben Verzeichnis** in begrenzten Chunks, verifiziert sie in einem
  **Worker Thread**, prüft die Source-Revision erneut und publiziert den Current-Nachfolger
  **ohne Overwrite**, bevor er zurückkehrt. Die Quelle bleibt byte-identisch.
- Source-Drift nach der Preparation lehnt diesen Write-Open ab, **ohne** die bereits an Reader
  gelieferte logische Historie zu ersetzen; ein späterer Write-Open bereitet die neue Revision vor.
- Decodierte Event-Graphen werden als **`shared-frozen`** markiert, wenn das Backend sie vor der
  Memoisierung friert: jedes verschachtelte Objekt und Array ist gefroren, und Handle-Reads und
  Slices bewahren diesen Zustand, **auch leere Slices**. Nur ein unmaterialisiertes pending Log
  meldet **`detached`**.
- `stat(id)` und `list()` wählen und übersetzen **nur** den Header der höchsten Generation, ohne
  Event-Zeilen zu lesen oder eine Migration zu starten.
- **Physische Revisionen** kombinieren Device, Inode, Size und Nanosekunden-Zeitstempel
  (`README.md:104`).
- Historische öffentliche Revisionen fügen einen **SHA-256-Fingerprint** der sortierten ausgewählten
  Pfade und ihrer physischen Revisionen hinzu; Lock-Dateien und behaltene, nicht ausgewählte
  Generationen tragen **nicht** bei. Fingerprinting liest nur Dateisystem-Metadaten.
- Verifikation akzeptiert eine erfolgreiche Worker-Antwort nur, nachdem der Worker **natürlich mit
  Code 0** beendet wurde; der Concurrency-Slot wird bis zu diesem Exit gehalten.
- **Ein `list()`-Aufruf teilt einen Corpus-Fingerprint über seine historischen Einträge.**
- `compression: 'none'` macht das Log für externe Reader direkt lesbar; der komprimierte Default
  muss über das Backend gelesen werden.

#### 4.2.8 Parent-Katalog-Vervollständigung bei historischem Body-Read

`README.md:88`:

- Historische Body-Preparation vervollständigt den Parent-Katalog über V3→V4. Sie findet Kandidaten
  für direkte Kinder aus Headern, liest den eigenen Descriptor jedes Kindes durch historische Codecs
  und behält kompakte Evidenz plus Source-Revisionen. Sie bereitet **weder** Kind-Kataloge vor
  **noch** publiziert sie Kind-Nachfolger.
- Unlesbare oder nicht unterstützte Header — inklusive korrupter Zstandard-Header-Frames — werden
  aus Discovery und `list()` ausgelassen. Direkter Zugriff auf einen korrupten komprimierten Header
  wird weiterhin abgelehnt; Header-I/O- und Cancellation-Fehler propagieren.
- Fehler beim Kind-Decoding und in Descriptor-Feldern erzeugen **Warnungen mit dem Kind-Pfad** und
  behalten die Header-Identität über `subagent/catalog`, wenn der Parent keinen vollständigen Eintrag
  hat; gesunde Kinder und bestehende Parent-Katalog-Einträge bleiben verfügbar.
- Preparation prüft Membership und inspizierte Source-Revisionen vor Rückgabe, Reuse und Publikation
  erneut — **inklusive fehlgeschlagener Kind-Reads**, damit ein repariertes Kind eine stale
  Preparation invalidiert.

#### 4.2.9 Retention / Cleanup

**Nichts löscht Session-Dateien.** Logs akkumulieren unter `root`, bis sie extern entfernt werden;
das Seam hat **keine** Deletion-API (`packages/session/session-persistence/README.md:153`,
`packages/session/session-persistence-jsonl/README.md:164`). Es gibt keine
Retention-Fenster, kein Pruning, kein Gap-Collector. Trim/Retention ist out-of-band
Backend-Wartung.

Weitere bekannte Grenzen (`session-persistence-jsonl/README.md:161-168`):
- Formatmigration bewahrt die konfigurierte Kodierung und unterstützt nur die katalogisierte Kette;
  eine Kompressionsänderung erfordert ein separates Root.
- Das Flat-File-Layout lädt nicht (Pre-Release-Artefakte müssen ins Projekt/Session-Layout verschoben werden).
- POSIX-Writes erfordern das passende vorgebaute System-Addon
  (`node-addon-system`, asynchrones `flock`); ein fehlendes Addon lehnt Write-Ownership ab.
  Windows behält seine Semaphore-Implementierung.
- Ein Backend-Plugin-Reload unter laufenden Sessions lässt deren Writer laut fehlschlagen.
- Nur über ein Handle erworbene Sessions persistieren: `ctx.sessions.create` + `session/flush`
  allein speichert **nichts**.
- `list()` ist unpaginiert und ungefiltert.
- Synthetische Closer sind die einzige Crash-Story; es gibt keinen Partial-Turn-Resume.

### 4.2.10 `session-checkpoint-policy` — wann geflusht wird

`packages/session/session-checkpoint-policy/src/index.ts`. `name = 'session-checkpoint-policy'`,
`inject = ['llm', 'sessionPersistence', 'sessions', 'tools']` (`src/index.ts:15-18`).
**Das Paket hat keine Konfigurationsfelder** (`README.md:36`).

Drei Barrieren werden gecheckpointet (`README.md:48`):

| Barriere | Hook | Wirkung |
|---|---|---|
| Modell-Request | `llm/stream` (`src/index.ts:64`) | der Adapter-Stream wird **erst** konstruiert, nachdem die gepufferten Request-Events der Live-Session durabel sind — ein Crash vor der Antwort kann keinen unpersistierten Request wiederholen |
| Top-Level-Tool-Call | `tools/execute` (`src/index.ts:70`) | der Tool-Body läuft erst, nachdem der aufgezeichnete Call durabel ist; verschachtelte Tool-Dispatches nutzen den Checkpoint des äußeren Calls |
| Step-Grenze | `agent/pre-step` (`src/index.ts:79`) | alles, was der vorherige Step committet hat (Antwort + geordnete Tool-Results), wird geflusht, bevor der nächste Request abgeleitet wird |

Fehlerverhalten (`README.md:52`): Checkpoint-Fehler sind **fail-closed** an beiden Barrieren — der
Adapter bzw. der Top-Level-Tool-Body läuft nicht; eine Step-Grenzen-Ablehnung lässt den Turn
scheitern, bevor ein weiterer Request startet. Trifft eine Cancellation während eines pending
Tool-Checkpoint-Flushs ein, gibt der Wrapper das kanonische `ABORTED_BEFORE_DISPATCH`-Resultat
zurück und betritt den Tool-Body nie. Nach einem Tool-Checkpoint ohne Result liefert die Recovery
`TOOL_OUTCOME_UNKNOWN` (aus `dsh-session`).

Bekannte Grenzen: durables Ausführungs-**Intent**, keine Exactly-once-Effekte; kein Checkpoint
innerhalb eines aktiven Modellversuchs (transiente Assistant-Frames können verloren gehen);
Unknown-Outcome statt automatischem Retry.

### 4.3 Exakte Pfade relativ zum Harness-Home

Harness-Home-Auflösung (`packages/util/home-paths/src/index.ts`):

| Konstante / Funktion | Wert bzw. Verhalten |
|---|---|
| `DSH_HOME_DIR_NAME` | `'.dsh'` |
| `DSH_HOME_ENV` | `'DSH_HOME'` |
| `AGENTS_HOME_DIR_NAME` | `'.agents'` |
| `AGENTS_HOME_ENV` | `'DSH_AGENTS_HOME'` |
| `DEFAULT_DSH_HOME_DISPLAY` | `'~/.dsh'` |
| `DEFAULT_AGENTS_HOME_DISPLAY` | `'~/.agents'` |
| `resolveDshHome(configured?, env?)` | Präzedenz: explizit konfiguriert > `$DSH_HOME` > `~/.dsh`; leerer/whitespace-only Wert gilt als unset |
| `resolveAgentsHome(configured?, env?)` | Präzedenz: explizit > `$DSH_AGENTS_HOME` > `~/.agents` |
| `dshHomePath(...segments)` | `join(resolveDshHome(), ...segments)` |
| `dshCachePath(...segments)` | `<home>/cache/<segments>` |
| `expandHomePath` | `~` → `homedir()`; `~/` und `~\` aufgeweitet |

Konkrete Pfade aus `packages/bundle/base/cordis.patch.yml`:

| Zweck | Pfad | Quelle |
|---|---|---|
| Session-Logs | `<home>/sessions` | Zeile 136 (`root: !!js dshHomePath('sessions')`) |
| Storage-JSON-Root | `<home>/storages` | Zeile 180 (`root: !!js dshHomePath('storages')`) |
| Projektion-Cache | `<home>/storages/session_projcache/sessions/<sessionId>.json` | Domain-Spec-Name + `per-record`-Layout; Test bestätigt `join(root, projectionCacheDomainSpec.name, 'sessions', \`${id}.json\`)` (`packages/api/session-controller/tests/session-projection-discoverery.host.spec.ts:135`) |
| Attachment-Cache | `<home>/cache/attachments` | `packages/util/home-paths/tests/home-paths.spec.ts:111` |
| Speech-to-Text-Daten | `<home>/speech-to-text/sensevoice` | `packages/experimental/voice-input-bundle/cordis.patch.yml:9` |
| Agents-Konfiguration | `~/.agents` (bzw. `$DSH_AGENTS_HOME`) | `home-paths/src/index.ts:78-80` |
| Spill (Snapshot-Fixtures) | `./.spill` über `DSH_SNAPSHOT_SPILL_ROOT` | `snapshots/session/session-query-spill/cordis.yml:8` |

---

## 5. Projektionen und Projektions-Cache

### 5.1 Das Projektions-Framework (`session-projection`)

Service-Name: **`ctx.sessionProjections`** (`packages/session/session-projection/src/index.ts:32-34`),
Klasse `SessionProjectionRegistry` (extends Cordis `Service`).

`ProjectionDefinition<K, S>` (`src/index.ts:48-93`) deklariert:

| Feld | Typ | Bedeutung |
|---|---|---|
| `key` | `K extends keyof SessionProjectionStateMap` | der Projektionsschlüssel, den die Unit besitzt |
| `stateSchema` | `ZodType<S>` | validiert persistierten State, bevor er einen Fold seedet |
| `init(header, inheritedEventCount)` | `→ S` | State für das leere Log und die unveränderlichen Metadaten |
| `apply(state, event)` | `(S, SessionEvent) → S` | **pure** Transition; eine uninteressierte Unit **MUSS** dieselbe Referenz zurückgeben (`Object.is`) |
| `wire.viewSchema` | `ZodType<SessionProjectionMap[K]>` | validiert das Wire-Payload, bevor es den Host verlässt |
| `wire.view(state)` | `→ SessionProjectionMap[K]` | State → Wire-Payload; das Objekt muss seine Referenz wiederverwenden |
| `stateVersion` | `number` | non-negative integer; **muss** erhöht werden, wenn sich serialisierte State-Felder oder Fold-Semantik ändern |

Zusatzregeln (`src/index.ts:40-47`): alle Funktionen **müssen synchron** sein (eine async-Unit würde
den Konsistenz-Cut der Carrier zerreißen), und `state` **muss** reines JSON sein
(Persisted-Cache-Voraussetzung). Die **Whole-Value-Event-Regel** ist load-bearing: ein
state-tragendes Log-Event trägt immer den vollständigen Post-Change-State, nie ein Delta
(`src/index.ts:13-15`).

Registry-Oberfläche:

| Methode | Verhalten |
|---|---|
| `register(definition)` | Effekt auf dem aufrufenden Fiber; der zurückgegebene Disposer entfernt den Key; Registranten, die einen Key teilen, werden gezählt (`refs`) — der Key überlebt bis zum letzten Unload (`src/index.ts:233-294`) |
| `onChanged(listener)` | Change-Feed; Listener erhält `(session, key, value, seq)`; nur bei `Object.is`-Änderung des rohen `view`-Ergebnisses (`src/index.ts:302-310`) |
| `stateOf(session, key)` | aktueller Host-State nach Materialisierung aller Units beim Session-Cursor |
| `snapshot(session, keys?)` | konsistenter Cut über jede registrierte client-sichtbare Unit; `asOfSeq` = Seq des letzten reflektierten Events (`-1` bei leerem Log) |
| `cachedSnapshot(session, keys?)` | nur bereits materialisierte Wire-Zellen, ohne Fold; Werte können hinterherhinken (Hinweise, keine Basis) |
| `checkpoint(session)` | State-Level-Checkpoint aller persistierten Units; jeder `val` ist ein **detached structuredClone** |
| `restoreFloor(checkpoint)` | die gespeicherte Seq, bei der ein Restore-Tail-Read starten muss: **eine Seq UNTER** dem niedrigsten brauchbaren Watermark |
| `viewCheckpoint(checkpoint, keys?)` | Zero-I/O-Sprosse: Zeilen ohne Log-Read ansehen, `ver` muss passen |
| `restore(checkpoint, events, baseSeq, header, inheritedEventCount)` | Cold-Read: Fold über ein Log-Suffix, Seeding aus brauchbaren Zeilen |
| `hydrate(session, checkpoint, events, baseSeq)` | exakten Cut wiederherstellen und States auf einer vorbereiteten Session installieren |

**Cache-Keying / Invalidierung:**

- Registry-Zellen sind `WeakMap<Session, UnitCell>` je Registration (`src/index.ts:171`).
- `UnitCell` = `{ state, observedSeq, views: [previous, current] }` (`src/index.ts:150-156`).
- `asOfSeq` = `-1` bei leerem Log, sonst Seq des letzten Events (`cursorBefore`, `src/index.ts:177-179`).
- Eine Zeile ist **brauchbar** genau dann, wenn `row.ver === def.stateVersion`
  **und** `row.seq >= baseSeq - 1` **und** `row.seq <= endSeq` (`src/index.ts:479-486`).
- Bei unbrauchbarer Zeile und `baseSeq > 0` **wirft** `restore`:
  `session projection "<key>" cannot restore from seq <n>: its checkpoint row is missing, version-mismatched, or beyond the supplied log end; re-read from seq 0`
  (`src/index.ts:515-520`).
- `restoreFloor` verankert **eine unter** dem Watermark, damit ein geschrumpftes Log (Crash-Repair-
  Truncation) erkannt wird, statt eine stale Zeile als aktuell zu servieren (`src/index.ts:410-436`).
- Ein `stateVersion`-Konflikt beim Registrieren wirft:
  `session projection key "<key>" is already registered at stateVersion <a>; refusing to share it with stateVersion <b>`
  (`src/index.ts:279-281`).
- Ein nicht-ganzzahliger oder negativer `stateVersion` wirft:
  `session projection "<key>" stateVersion must be a non-negative integer, got <v>`
  (`src/index.ts:270-271`).
- Ein nicht kontinuierlicher Fold wirft
  `session projection "<key>" cannot advance across missing seq <n>` (`src/index.ts:645`)
  bzw. `cannot restore across missing seq <n>` (`src/index.ts:530`).

### 5.2 Die Projektions-Cache-Domain

`packages/session/session-projection-cache/src/spec.ts`:

```
defineDomain({
  name: 'session_projcache',
  version: 7,
  compatibleVersions: [3, 4, 5, 6],
  invalidRecords: 'backup-and-skip',
  layout: 'per-record',
  tables: { sessions: domainTable<SessionId, CheckpointRecord>(checkpointRecord) },
})
```

`CheckpointRow` = `{ ver: non-negative int, seq: int ≥ -1, val: JsonValue }`.
`CheckpointIdentity` = `{ formatVersion?, createdAt, cwd?, isSeeded?, inheritedEventCount? }`.
`CheckpointRecord` = `{ identity, rows: Record<key, CheckpointRow> }`.

| Aspekt | Wert |
|---|---|
| Tabelle | `sessions`, gekeyt nach `SessionId` |
| Layout | `per-record` → ein Dokument pro Session unter `<root>/session_projcache/sessions/` |
| Domain-Version | `7`, kompatibel mit `3`–`6` |
| Invalid Records | `backup-and-skip`: ein schema-fehlerhafter Record wird als `<key>.json.bak.<stamp>` beiseitegelegt, der Fehler geloggt und die Session ungecacht bedient |
| Identity-Zwang | Lesen validiert `formatVersion` immer; ein fehlendes `formatVersion` macht den Record **unbrauchbar** als Fold-Shortcut |

Service `ctx.sessionProjectionCache` (`packages/session/session-projection-cache/src/index.ts:104-115`),
`inject = ['storageDomain', 'sessionProjections', 'sessions']`.

| Config-Feld | Typ | Bedeutung |
|---|---|---|
| `writeEveryEvents` | `number` (natural, min 1, required) | committete Events pro Session, die zwischen Pflichtpunkten einen durablem Checkpoint erzwingen |
| `writeIntervalMs` | `number` (natural, min 1, required) | längste Zeit in ms, die ein dirty Checkpoint zwischen Pflichtpunkten ungeschrieben bleiben darf |

Die drei **Pflicht-Schreibpunkte** — Session-Erzeugung, `turn/end`, Session-Disposal — sind Policy,
keine Tunables, und feuern immer (`src/index.ts:68-74`). Basis-Composition-Werte:
`writeEveryEvents: 200`, `writeIntervalMs: 5000` (`packages/bundle/base/cordis.patch.yml:191-195`).
Jeder durable Write ist **fail-soft**: Fehler loggen eine Warnung, der Cache heilt sich beim nächsten Write.

### 5.3 Tabelle aller Projektions-Keys in diesen Paketen

| Key | `stateVersion` | Gespeicherter State | Sichtbarkeit | Quelle |
|---|---|---|---|---|
| `workingDirectory` | `1` | `string \| null` — absolut oder `null` | wire (`viewSchema` = derselbe Zod-Schema) | `packages/session/working-directory/src/index.ts:82-89` |
| `title` | `1` | `string \| null` (Latin-1-min-1-nullable Zod) | wire | `packages/session/session-title/src/index.ts:266-281` |
| `titleInput` | `3` | `{ first: message \| undefined, count: number, lastSeq: SessionSeq }` | host-only | `packages/session/session-title/src/index.ts:346-360` |
| `sessionStats` | `1` | `SessionStatsState` = `{ turns, steps, llmMs, toolMs, ttftMs, ttftSteps, decodeMs, decodeTokens, lastTurn: number \| null, openStep: { turn, step, startTime, firstTokenTime } \| null, pendingCalls: Record<callId, number> }` | wire (`view` = die acht Totals) | `packages/session/session-stats/src/projection.ts:31-115` |
| `turnOutline` | `2` | `TurnOutlineState` = `{ turns: TurnOutlineEntry[], draft: string }`; `TurnOutlineEntry` = `{ turn, seq, prompt, response }` | wire (`view` = `state.turns`) | `packages/session/session-turn-outline/src/projection.ts:61-137` |
| `subagentCatalog` | `6` | Subagent-Katalogzustand (Modus/Label je Kind) | wire | `packages/subagent/subagent/src/catalog.ts:129` (Konsument in `packages/api/session-controller/src/list.ts:90,102`) |

**Sechs Projektions-Keys** liegen in den hier behandelten Paketen. Zur Abgrenzung: weitere Keys
existieren in Paketen außerhalb dieses Inventars (`goal`, `sandboxPolicy`, `planMode`, `llmRetry`,
`agentPreset`, `todo`, `turnBoundary`, `inbox`, `modelSelection`, `team`, `userQuestions`,
`usage`, `breakdown` — siehe `docs/config-catalog.md` und die jeweiligen Pakete).

---

## 6. Session-Query und Export

### 6.1 `session-query` — die Engine

Service-Name: **`sessionQuery`** (`ctx.sessionQuery`), Klasse `SessionQueryEngine`
(abstract, extends Cordis `Service`), `static inject = ['sessions']`
(`packages/session-query/session-query/src/index.ts:85-106`; `docs/config-catalog.md:4622`).

**Nur `searchSessions` und `searchEvents` sind abstrakt** — alle anderen Reads sind konkret
implementiert. Die tatsächliche Volltextsuche kommt also aus dem SQLite-Backend.

Service-Methoden (exakte Signaturen, `packages/session-query/session-query/src/index.ts`):

| Methode | Signatur |
|---|---|
| Konstruktor | `constructor(ctx: Context, config: Config = {})` |
| `observeSession` | `(sessionId: SessionId, options?: SessionObservationOptions) => Promise<SessionObservation>` |
| `searchSessions` | `abstract (request: SessionSearchRequest, exec?: SessionSearchExecContext) => Promise<SessionSearchPage<SessionSearchHit>>` |
| `searchEvents` | `abstract (request: SessionEventSearchRequest, exec?: SessionSearchExecContext) => Promise<SessionEventSearchPage>` |
| `listSessions` | `(signal?: AbortSignal) => Promise<SessionRecord[]>` |
| `readSession` | `(sessionId: SessionId) => Promise<SessionLogSnapshot>` |
| `filterSessions` | `(filters: readonly SessionResultFilter[], signal?: AbortSignal) => Promise<SessionRecord[]>` |
| `readTitle` | `(sessionId: SessionId, signal?: AbortSignal) => Promise<SessionTitleSnapshot \| undefined>` |
| `readTitleSnapshot` | `(sessionId: SessionId, signal?: AbortSignal) => Promise<SessionTitleObservation>` |
| `readTitleSnapshots` | `(sessionIds: readonly SessionId[], signal?: AbortSignal) => Promise<SessionTitleObservationResult[]>` |
| `listEvents` | `(sessionId: SessionId) => Promise<SessionEventRecord[]>` |
| `filterEvents` | `(sessionId: SessionId, filters: readonly SessionEventResultFilter[]) => Promise<SessionEventSearchDocument[]>` |
| `readSurface` | `(sessionId: SessionId) => Promise<SessionSurfaceSnapshot>` |
| `traceSession` | `(sessionId: SessionId, signal?: AbortSignal) => Promise<SessionLineageTrace>` |
| `traceEvent` | `(request: SessionEventTraceRequest, signal?: AbortSignal) => Promise<SessionEventTraceObservation>` |
| `readEvent` | `(request: SessionEventReadRequest, signal?: AbortSignal) => Promise<SessionEventWindow>` |

Private Helfer: `_filterSessions`, `_filterEvents`, `_readEvent`,
`_readWindow(name: 'before'|'after', value)`; private Felder `_readWindowMax`, `_corpus`,
`_observations`.

**Öffentliche Typen** (`src/types.ts`) mit Feldlisten:

| Typ | Felder |
|---|---|
| `SessionRecord` | `{ header: SessionHeader; live: boolean; persisted: boolean; formatStatus?: 'current' \| 'migration-required' }` |
| `SessionSurfaceSnapshot` | `{ session; inheritedEventCount; capturedThroughSeq: OptionalSessionSeq; events: SurfaceEvent[] }` |
| `SessionLogSnapshot` | `{ session; inheritedEventCount; events: SessionEvent[] }` |
| `SessionEventRecord` | `{ sessionId; seq; type; time; surface: 'current' \| 'shadowed' \| 'log-only' }` |
| `SessionEventSurface` | `'current' \| 'shadowed' \| 'log-only'` |
| `SessionLineageNode` | `{ session: SessionRecord; descendants: SessionLineageNode[] }` |
| `SessionLineageTrace` | `{ target; ancestors; descendants }` geschnitten mit `{ complete: true; root }` \| `{ complete: false; unresolvedParentId }` |
| `SessionEventTraceRequest` | `{ sessionId; seq }` |
| `SessionEventTrace` | `{ target; replacedBy?; replacementChain: SessionSeq[]; replacedEventSeqs: SessionSeq[]; sourceEventSeqs: SessionSeq[]; derivedEventSeqs: SessionSeq[] }` |
| `SessionEventTraceObservation` | `SessionEventTrace & { session }` |
| `SessionEventReadRequest` | `{ sessionId; seq; before?; after? }` |
| `SessionEventWindow` | `{ session; inheritedEventCount; target; events; startSeq; endSeq }` |
| `SessionTitleObservation` | `{ session; title? }` |
| `SessionTitleObservationResult` | fulfilled/rejected-Union mit `sessionId` |
| `SessionResultRange` | `{ from?; to? }` |
| `SessionAvailability` | `'live' \| 'persisted'` |
| `SessionEventMetadataFilter` | `Exclude<SessionEventResultFilter, { kind: 'text' }>` |
| `SessionEventSearchDocument` | `SessionEventRecord & { text: string }` |
| `SessionSearchPage<T>` | `{ items: readonly T[]; nextCursor?: SessionSearchCursor }` |
| `SessionEventSearchPage` | `SessionSearchPage<SessionEventSearchHit> & { session: SessionHeader }` |
| `SessionSearchExecContext` | `{ signal?: AbortSignal }` |
| `SessionSearchRequest` | `{ query; sessionFilters?; eventFilters?; limit?; cursor? }` |
| `SessionEventSearchRequest` | `{ sessionId; query; filters?; limit?; cursor? }` |
| `SessionEventSearchHit` | `SessionEventRecord & { snippet: string }` |
| `SessionSearchHit` | `SessionRecord & { bestMatch: SessionEventSearchHit }` |
| `SessionSearchCursor` | `Branded<'SessionSearchCursor'>` mit `SessionSearchCursor(value: string)` (`src/cursor.ts:6`) |
| `LogicalSession` / `LogicalSessionSource` / `LogicalProjectionResult<Value>` | `src/corpus.ts:13-31` |
| `SessionObservation` | extends `Disposable`, mit `retain()` (`src/observation.ts:17-44`) |

**Config und Defaults** (`packages/session-query/session-query/src/config.ts`):

| Feld | Typ | Default-Konstante | Wert |
|---|---|---|---|
| `readWindowMax` | `number?` | `SESSION_QUERY_READ_WINDOW_MAX` | **`50`** |
| `persistedReadConcurrency` | `number?` | `SESSION_QUERY_DEFAULT_PERSISTED_INSPECT_CONCURRENCY` | **`4`** |
| `preparedSessionCacheSize` | `number?` | `SESSION_QUERY_DEFAULT_PREPARED_SESSION_CACHE_SIZE` | **`5`** |

Validierung: `readWindowMax` non-negative integer; `persistedReadConcurrency` und
`preparedSessionCacheSize` positive safe integers — sonst `SESSION_QUERY_INVALID_CONFIG`.
`readEvent`-Fenster lehnt non-integer/`<0`/`> readWindowMax` mit `SESSION_QUERY_INVALID_WINDOW` ab
(`src/index.ts:107-129, 396-405`).

**Fehlertaxonomie** — `SessionQueryError extends HarnessError`, 17 Codes (geschlossene Union,
alle mit Präfix `SESSION_QUERY_`): `ABORTED`, `CORRUPT_SESSION`, `EVENT_NOT_FOUND`, `INDEX_FAILED`,
`INVALID_CONFIG`, `INVALID_CURSOR`, `INVALID_FILTER`, `INVALID_LIMIT`, `INVALID_QUERY`,
`INVALID_LINEAGE`, `INVALID_SURFACE`, `INVALID_WINDOW`, `PERSISTENCE_FAILED`, `SEARCH_DISABLED`,
`SESSION_NOT_FOUND`, `STALE_CURSOR`, `SOURCE_CONFLICT` (`src/config.ts:29-54`).

**Wie aus den Logs gelesen wird:**

| Aspekt | Faktum | Quelle |
|---|---|---|
| Live-Store | `ctx.sessions` (Service-Key `sessions`) | `src/index.ts`, `src/corpus.ts` |
| Optionaler durabler Store | `ctx.sessionPersistence`, über einen optionalen Fiber gebunden und via `ctx.effect` neu gebunden/freigegeben | `src/corpus.ts:36-55` |
| Listing | `persistence.list(signal === undefined ? undefined : { signal })` | `src/corpus.ts:264-278` |
| Live-Read | `session.header`, `session.snapshotEvents()` (als deprecated markiert), `session.seq`, `session.inheritedEventCount` | `src/corpus.ts:252-255, 304-311` |
| Cold-Read | `persistence.open(sessionId, 'read', options)` → `handle.read(0, undefined, options)` → `handle.close()`; nutzt `handle.header`, `handle.inheritedEventCount`, `read.eventState`; hängt `interruptedTurnClosers(events)` **nur im Speicher** an (Persistenz wird nie mutiert) | `src/cold-read.ts` |
| Point-Observation (cold) | erst `persistence.stat(sessionId, {signal})`; dann `ctx.sessions.prepare(sessionId, { seed, meta, inheritedEventCount, eventState })`; danach `ctx.sessions.get(id)` zur Nachprüfung | `src/observation.ts:98-201` |
| Projektionen | `ctx.get('sessionProjections')?.snapshot(session)`, `registry.hydrate(...)`, `ctx.get('sessionProjectionCache')?.hydratePrepared(...)` | `src/observation.ts:275-325` |
| Batch-Titel-Reads | `projectMany` mit Worker-Pool der Größe `Math.min(persistedReadConcurrency, unresolved.length)`; Fehler je ID isoliert, Cancellation lehnt den ganzen Batch ab | `src/corpus.ts:139-231` |
| Merge-Regel | Persisted Records zuerst, dann überschreiben Live-Records (live-preferred); widersprüchliche unveränderliche Header werfen `SESSION_QUERY_SOURCE_CONFLICT`; Sortierung nach `createdAt` absteigend, dann `id.localeCompare` | `src/corpus.ts:62-87, 313-315` |
| Validierung | `readSession` spielt durch `Session.create(sessionId, events, header, inheritedEventCount, currentSessionMessageProjections)` ab | `src/index.ts:184-198` |
| Prepared-Session-Cache | gekeyt nach Session-ID, validiert über `persistenceIdentity: symbol` + `revision`; LRU-Eviction über der Kapazität; Einträge mit `refs > 0` werden nie evictiert; `retain()` auf einem disposed Lease wirft | `src/observation.ts:56-67, 203-273` |

**Query-/Scan-Pfad:**

- Der Text-Scan der Engine selbst ist ein **Regex, keine FTS**: `compileSessionTextFilter` trimmt,
  splittet an `/\s+/u`, escapet `[.*+?^${}()|[\]\\]`, verbindet mit `\s+` und kompiliert
  `new RegExp(pattern, 'iu')`; leer/whitespace-only → `SESSION_QUERY_INVALID_FILTER`
  (`src/filters.ts`).
- Filtersemantik: Array wird UND-verknüpft; Listenwerte ODER-verknüpft; leere Liste matcht nichts;
  Ranges inklusiv; `from > to` oder non-finite → `SESSION_QUERY_INVALID_FILTER`;
  `availability` ∈ `['live','persisted']`; `surface` ∈ `['current','shadowed','log-only']`.
- Semantische Text-Extraktion nur für `user/message`, `assistant/message`, `tool/call`,
  `tool/result`, `todo/write`, `turn/end` — alles andere liefert `''`; `reasoning`-Blöcke und
  unbekannte Block-/Event-Typen sind **nicht** durchsuchbar (`src/extraction.ts`).
- Surface-Klassifikation in **einem** `foldSurface(events, currentSessionMessageProjections)`-Durchlauf;
  Dokumente mit leerem Text werden verworfen; ein `foldSurface`-Fehler →
  `SESSION_QUERY_INVALID_SURFACE` (`src/documents.ts`, `src/tracing.ts`).
- Filter-Kinds: `SessionResultFilter` ∈ `id`, `cwd`, `created-at`, `parent`, `availability`;
  `SessionEventResultFilter` ∈ `seq`, `time`, `type`, `surface`, `text` (`src/types.ts`).


### 6.2 `session-query-sqlite` — exaktes SQLite-Schema

Datei: `packages/session-query/session-query-sqlite/src/schema.ts`.
Schema-Version `8`, Application-Id `0x44534851` (`'DSHQ'`).

**Persistente Tabellen:**

```sql
CREATE TABLE IF NOT EXISTS search_state (
  singleton         INTEGER PRIMARY KEY CHECK (singleton = 1),
  global_generation INTEGER NOT NULL
) STRICT
```
(`schema.ts:106-110`; danach `INSERT OR IGNORE INTO search_state VALUES (1, 0)`.)

```sql
CREATE TABLE IF NOT EXISTS persisted_sessions (
  id             TEXT PRIMARY KEY,
  version        INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  cwd            TEXT,
  parent_session TEXT,
  seed_length    INTEGER,
  delegation_depth INTEGER,
  agent_preset   TEXT,
  revision       TEXT NOT NULL,
  generation     INTEGER NOT NULL
) STRICT
```
(`schema.ts:113-125`.)

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS persisted_docs USING fts5(
  text,
  session_id UNINDEXED,
  seq UNINDEXED,
  type UNINDEXED,
  time UNINDEXED,
  surface UNINDEXED,
  codepoint_length UNINDEXED,
  tokenize = 'unicode61'
)
```
(`schema.ts:127-137`.) FTS5 erzeugt implizit die Shadow-Tabellen
`persisted_docs_data`, `persisted_docs_idx`, `persisted_docs_content`, `persisted_docs_docsize`,
`persisted_docs_config` — die Whitelist `DERIVED_USER_TABLES` (`schema.ts:16-25`) nennt genau acht Namen.

**Temporäre (connection-lokale) Objekte:**

```sql
CREATE TEMP TABLE IF NOT EXISTS live_sessions (
  id             TEXT PRIMARY KEY,
  version        INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  cwd            TEXT,
  parent_session TEXT,
  seed_length    INTEGER,
  delegation_depth INTEGER,
  agent_preset   TEXT,
  fingerprint    TEXT NOT NULL,
  persisted      INTEGER NOT NULL CHECK (persisted IN (0, 1)),
  generation     INTEGER NOT NULL
) STRICT
```
(`schema.ts:143-156`.)

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS temp.live_docs USING fts5(
  text, session_id UNINDEXED, seq UNINDEXED, type UNINDEXED, time UNINDEXED,
  surface UNINDEXED, codepoint_length UNINDEXED, tokenize = 'unicode61'
)
```
(`schema.ts:158-168`.)

**Primärschlüssel:** `search_state.singleton` (mit `CHECK (singleton = 1)`),
`persisted_sessions.id`, `live_sessions.id`. **Es gibt keine zusätzlichen Indizes** — die Suche läuft
über die FTS5-Tabellen. Keine Views.

**Öffnungs- und Reset-Sequenz** (`openSearchDatabase`, `schema.ts:46-78`):

1. `:memory:` wird direkt verwendet; sonst `resolve(path)`, `mkdir(dirname, { recursive: true, mode: 0o700 })`
   und `createDatabaseFile` (`open(path, 'wx', 0o600)`; `EEXIST` wird toleriert, andere Fehler propagieren).
2. `PRAGMA application_id` und `PRAGMA user_version` lesen.
3. Fremde `application_id` (≠ 0 und ≠ `0x44534851`) → Fehler
   `session-search database at "<path>" belongs to another application`.
4. `application_id === 0` mit vorhandenen User-Tabellen → Fehler
   `… is not an empty or recognized derived index`.
5. Eigene `application_id`: unbekannte User-Tabellen → Fehler
   `… has unrecognized user tables: <names>`; bei abweichender `user_version` wird
   `resetDerivedSchema` ausgeführt (`DROP TABLE` je User-Tabelle, dann `PRAGMA user_version = 0`).
6. Erst **danach** werden mutierende Pragmas angewandt: `PRAGMA journal_mode = <MODE>`.
7. `ensurePersistentSchema` (setzt `application_id`, legt Tabellen an, setzt am Ende
   `PRAGMA user_version = 8`) und `ensureTemporarySchema`.
8. Bei Fehler wird die DB geschlossen und der Fehler neu geworfen.

**Befüllung aus den JSONL-Logs** (Ingestion/Sync-Pfad, `src/index.ts`):

1. `searchSessions`/`searchEvents` rufen `_assertSearchEnabled()`, `normalizeSessionRequest` bzw.
   `normalizeEventRequest` und dann `_serialized(signal, …)` — **eine FIFO-Queue pro Service**
   (`_tail`-Promise-Kette), damit alle SQLite-Arbeit serialisiert ist (Zeilen 268-325, 383-405).
2. `_ensureReady` importiert `node:sqlite` lazy und ruft einmalig
   `openSearchDatabase(path, journalMode)` auf, memoisiert in `_ready` (Zeilen 360-381).
3. `_reconcile` liest den indizierten Zustand
   (`SELECT id, revision, generation FROM persisted_sessions`;
   `SELECT id, fingerprint, persisted, generation FROM temp.live_sessions`) und ruft `_observeStable`.
4. `_observeStable`: `persistence.list(options)` → `materializePersistenceSnapshots` → je Snapshot
   überspringen, wenn `indexed.get(id)?.revision === entry.revision` **und** die
   Persistenz-Identität unverändert ist; überspringen, wenn die ID bereits live ist; sonst
   `readColdSessionLog(persistence, id, signal)` → `assertSessionHeadersCompatible` →
   `observeSession(header, inheritedEventCount, events)`. Danach muss ein **zweiter**
   `persistence.list` identische Snapshots liefern (`samePersistenceSnapshots`) und die Bindung
   unverändert sein, sonst Retry (Zeilen 495-562).
5. Change-Berechnung: `persistentChanges`, `persistentDeletes`, `liveChanges` (über `fingerprint` und
   `persisted`-Flag), `liveDeletes` (Zeilen 420-449).
6. Schreibtransaktion: `BEGIN IMMEDIATE` … `COMMIT`, mit `ROLLBACK` bei Fehler; Deletes via
   `_deleteSession`, Upserts via `_replacePersistedSession` / `_replaceLiveSession`;
   `UPDATE search_state SET global_generation = ? WHERE singleton = 1` nur wenn sich persistierte
   Zeilen geändert haben. Jeder Fehler → `SESSION_QUERY_INDEX_FAILED` (Zeilen 451-486).
7. Dokumente werden mit **einem** Prepared-`INSERT` pro Dokument eingefügt —
   **keine Batch-Größe, kein `LIMIT`, kein Chunking**:
   `INSERT INTO persisted_docs (text, session_id, seq, type, time, surface, codepoint_length) VALUES (?,?,?,?,?,?,?)`
   und derselbe Insert auf `temp.live_docs`.
   `codepoint_length = Array.from(text).length`; `text = sanitizeFtsText(document.text)` (Zeilen 598-645).
8. **Retry-Policy:** `STABLE_OBSERVATION_ATTEMPTS = 2` (ein Retry, dann
   `SESSION_QUERY_PERSISTENCE_FAILED`); ein abgelehntes `BEGIN`/Write rollt zurück, die nächste Suche
   versucht es erneut.
9. Dedup-/Resume-Schlüssel: persisted = `revision` (opaker String aus
   `SessionPersistenceSnapshot`); live = `fingerprint` =
   `sha256(JSON.stringify({ header, inheritedEventCount, events }))` base64url (Zeilen 876-891).
   Änderungen der Persistenz-Identität erhöhen `_persistenceEpoch` und invalidieren Cursor.
10. **Query:** **ein** CTE-Union —
    `persisted_docs JOIN persisted_sessions` (nur bei `? = 1` und
    `NOT EXISTS (SELECT 1 FROM temp.live_sessions WHERE ls.id = pd.session_id)`) `UNION ALL`
    `temp.live_docs JOIN temp.live_sessions`; `highlight(persisted_docs, 0, ?, ?)`;
    `match_count` = `(length(CAST(marked_text AS BLOB)) - length(CAST(replace(marked_text, ?, '') AS BLOB))) / ?`.
    Cross-Session-Ranking nutzt `ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY match_count DESC, document_length ASC, time DESC, seq DESC)`
    und behält `event_rank = 1`, danach
    `ORDER BY match_count DESC, document_length ASC, time DESC, session_id ASC, seq DESC LIMIT ? OFFSET ?`.
    Innerhalb einer Session: `WHERE session_id = ? AND …` mit derselben Ordnung.
    Es werden `limit + 1` Zeilen geholt, um `nextCursor` zu erkennen (Zeilen 647-708, 797-869, 961-973).

**Weitere Konstanten** (`src/query.ts` und `src/index.ts:78-89`):

| Konstante | Wert |
|---|---|
| `FTS_HIGHLIGHT_START` | `'\uFDD0'` |
| `FTS_HIGHLIGHT_END` | `'\uFDD1'` |
| `SQLITE_MAX_PAGE_LIMIT` | `Number.MAX_SAFE_INTEGER - 1` = `9007199254740990` |
| `SQLITE_PORTABLE_VARIABLE_LIMIT` | `32766` |
| `SQLITE_FTS5_OUTER_PREDICATE_LIMIT` | `14` |
| `SESSION_QUERY_SQLITE_DEFAULT_LIMIT` | `20` |
| `SESSION_QUERY_SQLITE_MAX_LIMIT` | `100` |
| `SESSION_QUERY_SQLITE_SNIPPET_CHARS` | `240` |
| `SESSION_QUERY_SQLITE_PATH_KEY` | `'launcherSessionQueryPath'` — **exportiert, aber innerhalb des Pakets von keinem Reader konsumiert** (Context-Augmentation `Context.launcherSessionQueryPath?: string`) |

**Budget-Durchsetzung:** Cross-Session = `sessionWhere.predicateCount + eventWhere.predicateCount ≤ 14`;
innerhalb einer Session = `1 + eventWhere.predicateCount ≤ 14`. Ein Binding-Overflow →
`SESSION_QUERY_INVALID_FILTER`.

**Cursor-Payload:** `{ version: 1, instance: <randomUUID je Engine>, scope: 'sessions' | 'events', fingerprint, generation, offset }`,
base64url-kodiertes JSON; Mismatch → `SESSION_QUERY_INVALID_CURSOR`, Generation-Mismatch →
`SESSION_QUERY_STALE_CURSOR`. Die Within-Session-Generation ist `live:<n>` oder
`persisted:<epoch>:<n>` (Zeilen 439-491, 975-1018).

**PRAGMAs dieses Pakets: ausschließlich `application_id`, `user_version`, `journal_mode`.**
Kein `busy_timeout`, kein `synchronous`, kein `foreign_keys`.

**Verhalten aus Tests belegt** (`tests/sqlite.spec.ts`): eine mit `version - 1` gestempelte Datei
wird in place auf `8` neu aufgebaut, wobei nach dem Reopen geschriebene Daten erhalten bleiben;
eine Datei mit einer zusätzlichen `unrelated`-Tabelle (mit `user_version = 999` **oder** aktueller
Version) wird mit `SESSION_QUERY_INDEX_FAILED` abgelehnt und byte-identisch gelassen; eine fremde
WAL-Datei mit kanonischer Tabelle behält `journal_mode = wal` und wird abgelehnt; `sqliteX` gilt als
User-Tabelle (der Prädikatfilter lautet `NOT GLOB 'sqlite_*'`) und wird abgelehnt;
`application_id = 123` wird abgelehnt. Der TEMP-Live-Zustand ist connection-lokal und wird beim
Reopen verworfen, während persistente Basen bleiben.


**Config** (`docs/config-catalog.md:2805-2847`):

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `path` | `string` | — (required) | Pfad zum dedizierten Index; `:memory:` erlaubt; fehlende Verzeichnisse/Dateien werden owner-only erzeugt |
| `openAt` | `'startup' \| 'first-search' \| 'never'` | `'startup'` | Öffnungsphase; `never` deaktiviert Volltextsuche vollständig |
| `journalMode` | `'wal' \| 'delete' \| 'truncate' \| 'persist'` | `'wal'` | SQLite-Journalmodus |
| `defaultLimit` | `number` | `20` | Seitengröße wenn `limit` fehlt; max `Number.MAX_SAFE_INTEGER - 1` |
| `maxLimit` | `number` | `100` | größte akzeptierte Seitengröße |
| `snippetChars` | `number` | `240` | maximale Snippet-Länge in Unicode-Codepoints |
| `persistedReadConcurrency` | `number` | `4` | maximale gleichzeitige persistierte Log-Reads in einem geerbten Batch-Read |
| `preparedSessionCacheSize` | `number` | `5` | maximale Cold-Prepared-Session-Observations, die der geerbte Reader für Reuse behält |

Basis-Composition-Wert: `path: ':memory:'`, `openAt: never`
(`packages/bundle/base/cordis.patch.yml:152-156`) — Volltextsuche ist **opt-in**, `ctx.sessionQuery`
bleibt aber gemountet, exakte Reads, Titel und Lineage-Traces funktionieren weiter.

### 6.3 `session-log-export` — Exportformate und -shape

Datei: `packages/session-query/session-log-export/src/archive.ts`.
Route-Konfiguration: `packages/session-query/session-log-export/src/index.ts:46`.

| Konstante / Wert | Wert | Quelle |
|---|---|---|
| `SESSION_LOG_FILENAME` | `sessionFormatLogFilename(SESSION_FORMAT_VERSION)` ⇒ `session.v4.jsonl` | `archive.ts:101` |
| `DEFAULT_SESSION_LOG_COMPRESSION_LEVEL` | `6` | `archive.ts:40` |
| `SessionLogCompressionLevel` | `0 \| 1 \| … \| 9` | `archive.ts:37` |
| `PUSH_CHUNK_CODE_UNITS` | `1 << 16` (65536) | `archive.ts:407` |
| `PUSH_CHUNK_BYTES` | `1 << 16` (65536) | `archive.ts:410` |
| `RESPONSE_HIGH_WATER_MARK_BYTES` | `1 << 16` (65536) | `archive.ts:413` |

**Format:** ein **ZIP**-Archiv, gestreamt über fflate's `Zip`/`ZipDeflate`. **Kein Manifest** wird
geschrieben. Archivname: `dsh-session-<sanitized-session-id>.zip`
(`sessionLogZipFilename`, `archive.ts:327-329`); die ID wird über
`replace(/[^A-Za-z0-9_-]/g, '_')` gesichert.

**Archivstruktur** (Zip-Reihenfolge, `sessionLogZipEntries`, `archive.ts:347-404`):

```
session.v4.jsonl                                  # Root-Log, kanonischer Name der aktuellen Generation
subagents/<safe-session-id>/session.v4.jsonl      # je Subagent-Nachfahre, in Lineage-Reihenfolge
media/<attachmentId>.<png|jpg|webp|gif>           # inhaltsadressiert, dedupliziert
files/<digest[:2]>/<digest>/<name>                # generische Dateien, gestreamt
```

- `mediaEntryPath` (`archive.ts:186-188`): `media/${attachmentId}.${extension}` mit
  `MEDIA_TYPE_EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }`
  (`archive.ts:172-177`).
- `fileEntryPath` (`archive.ts:191-196`): der `sha256:`-Präfix wird für den Pfad abgeschnitten;
  Pfadtrenner und Steuerzeichen im Namen werden zu `_`; `.`/`..`/leer ⇒ `file`.
- **Log-Textform** (`serializeSessionLog`, `archive.ts:110-136`): **eine Header-Zeile**, dann **eine
  Zeile pro Event**, mit **abschließendem Newline**. Der Header ist die kanonische v2/v4-physische
  Header-Zeile; `delegationDepth` fällt auf `0` zurück. Der vererbte Schnitt ist bereits durch den
  getaggten `session/end-seed`-Event repräsentiert.
- **Flush-Barriere:** vor jedem Live-Session-Log-Read ruft der Export `sessions.flush(session)`
  (`flushLiveSessionLog`, `archive.ts:80-92`); Cold-Sessions brauchen keine Barriere.
- **Attachment-Discovery:** nur aus **deklarierten** First-Party-Content-Feldern und
  abgeschlossenen Assistant-Blöcken (`collectEventAttachmentRefs`, `archive.ts:231-281`):
  `user/message` + `tool/ptc-dispatch`: `content`; `system/message`, `developer/message`,
  `tool/result`, `team/message/queued`: `message.content`; `agent/inbox/spliced`: `inserted[].content`;
  `compaction/summary`: `summary` und optional `rawOutput`; `assistant/message`: `message.content`
  plus `stream[].chunk.block` bei `block-end`. Unbekannte Events und fremde Payload-Felder bleiben opak.
- **Fehlerverhalten:** ein Nachfahre, der nicht gelesen werden kann, **fehlert den Stream**
  (fail-loud, nie stiller Unter-Export); ein Mid-Stream-Fehler ruft `zip.terminate()`.
- **Speichergrenze:** der Host hält höchstens ein Nachfahren-Log, ein Bild und einen Datei-Chunk
  über dem Root hinaus; der Producer wartet bei `desiredSize === 0` auf Consumer-Pull.
- **Surrogate-Schutz:** beim Chunking wird um eine Code-Unit zurückgewichen, wenn die Grenze in ein
  Surrogatpaar fällt (`pushArtifactChunks`, `archive.ts:517-522`) — ein Lone High Surrogate würde
  sonst als U+FFFD re-enkodiert.

---

## 7. Storage-Abstraktion

### 7.1 `storage` — der Hub

Service-Name laut `docs/config-catalog.md:4590`: `@deepseek-ai/dsh-storage` ohne `inject`-Eintrag.
Der Hub registriert Backends unter Namen; `storage-domain` und die Backends injizieren `storage`.

### 7.2 `storage-domain` — Domänen-Repository-Abstraktionen

`packages/storage/storage-domain/src/index.ts:52`. `inject: ['storage']`.

| Config-Feld | Typ | Bedeutung |
|---|---|---|
| `backend` | `string` (required) | Default-Backend-Name für jede Domäne ohne explizite Route. Required, weil es kein universell richtiges Medium gibt |
| `routes` | `Record<string, string>` (optional) | Per-Domänen-Overrides: Domänenname → Backend-Name |

Eine Route, die ein nicht registriertes Backend nennt, scheitert laut beim `open` mit
`backend-not-found` (`docs/config-catalog.md:3177-3189`).

Deklarations-API: `defineDomain({ name, version, compatibleVersions, invalidRecords, layout, tables })`
und `domainTable<Key, Record>(schema)`. Der `layout`-Wert steuert das Medium:
`'per-record'` bedeutet ein Dokument pro Record statt eines Dokuments für die ganze Unit
(`packages/session/session-projection-cache/src/spec.ts:5-9`).
`invalidRecords: 'backup-and-skip'` verlangt, dass ein schema-fehlerhafter Record beiseitegelegt
und die Unit weiter bedient wird.
Tabellen-Typ `KvTable<Key, Record>` (siehe `session-projection-cache/src/index.ts:34`).

### 7.3 `storage-json` — Layout des JSON-Backends

`packages/storage/storage-json/src/index.ts:28`. `inject: ['storage']`.

| Config-Feld | Typ | Bedeutung |
|---|---|---|
| `root` | `string` (required, **kein** Default) | Verzeichnis mit einer `<unit>.json`-Datei (oder einem `<unit>/`-Baum) pro Unit. Ein `process.cwd()`-Fallback würde Unit-Dateien streuen |

Bekannte Unit-Verzeichnisse in Basis-Composition: `<home>/storages`
(`packages/bundle/base/cordis.patch.yml:180`), darunter die Domäne `session_projcache` mit
`sessions/` (`per-record`) und einer JSON-Datei je Session.

### 7.4 `storage-sqlite` — Schema des SQLite-Backends

`packages/storage/storage-sqlite/src/index.ts:24`. `inject: ['storage']`.

**Config** (`docs/config-catalog.md:3222-3252`):

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `path` | `string` | — (required) | Pfad zur DB-Datei; `:memory:` öffnet eine In-Process-DB (Tests). Fehlende Verzeichnisse/DBs werden owner-only erzeugt; bestehende Modes bleiben. Dateisystem-Setup-Fehler außer „DB existiert" lassen den Open scheitern |
| `journalMode` | `'wal' \| 'delete' \| 'truncate' \| 'persist'` | `'wal'` | SQLite-`journal_mode`-Pragma. `memory`/`off` sind ausgeschlossen, weil das die Durability-Klausel des KV-Backend-Vertrags still verletzen würde |

**Schema** (`packages/storage/storage-sqlite/src/schema.ts`):

```sql
CREATE TABLE IF NOT EXISTS units (
  name    TEXT PRIMARY KEY,
  version INTEGER NOT NULL
) STRICT
```

```sql
CREATE TABLE IF NOT EXISTS unit_globals (
  unit  TEXT PRIMARY KEY REFERENCES units(name),
  value TEXT NOT NULL
) STRICT
```

**Unit-Record-Tabellen** werden pro Descriptor angelegt
(`packages/storage/storage-sqlite/src/index.ts:114-115`):

```sql
CREATE TABLE IF NOT EXISTS "u_<unit>_<table>" (
  key   TEXT PRIMARY KEY,
  ...
)
```

Der physische Tabellenname lautet `u_<unit>_<table>` (`recordTableName`,
`packages/storage/storage-sqlite/src/schema.ts:117-119`). Beide Segmente werden vorab gegen
`UNIT_NAME_RE` validiert, damit der Name sicher in DDL und Prepared-Statement-Text interpoliert
werden kann.

**Open-/Konfigurationssequenz** (`configureDatabase`, `schema.ts:76-107`):

1. `PRAGMA foreign_keys = ON`.
2. `PRAGMA journal_mode = <MODE>` (validierte Union, sicher interpolierbar).
3. `PRAGMA user_version` lesen. Werte ≠ `0` und ≠ `STORAGE_SQLITE_SCHEMA_VERSION` (1) werfen
   `StorageError('version-mismatch', 'storage database at "<path>" has schema version N, incompatible with this build (1)')`.
4. `units` und `unit_globals` anlegen.
5. `PRAGMA user_version = 1` **zuletzt** — der Stempel behauptet ein vollständiges Layout, daher muss
   ein Fehler oberhalb das Medium ungestempelt lassen.

**Es gibt keine Indizes außer den impliziten Primärschlüssel-Indizes.**
`STORAGE_SQLITE_SCHEMA_VERSION = 1` hat bewusst **keine** Migrationen: „any other stamped version
rejects — this unreleased format has no migrations" (`schema.ts:14-19`).

**Tabellen-/Collection-Übersicht:**

| Medium | Name | Felder |
|---|---|---|
| SQLite | `units` | `name` (PK), `version` |
| SQLite | `unit_globals` | `unit` (PK, FK → `units.name`), `value` |
| SQLite | `u_<unit>_<table>` (je Deskriptor) | `key` (PK) + deskriptorspezifische Spalten |
| JSON | `<root>/<unit>.json` bzw. `<root>/<unit>/` | ein Dokument pro Unit oder pro Record (`per-record`) |
| JSON (konkret) | `<root>/session_projcache/sessions/<sessionId>.json` | `{ identity, rows }` mit `rows[key] = { ver, seq, val }` |

---

## 8. Workspace und Spill

### 8.1 `workspace`

Service-Datei: `packages/workspace/workspace/src/index.ts`. `inject`:
`['storageDomain', 'sessionPersistence']` (`docs/config-catalog.md:4601`).
Der Service registriert sich laut `docs/config-catalog.md` als `workspaceRegistry`
(Konsumenten: `session-controller`, `ui-workspace`, `archived-session-gate`, `schedule`, `webhook`).

Das Workspace-Modell:
- Der Workspace gruppiert Sessions über die **Persistenz-Wurzel** und deren Projektverzeichnis
  (`packages/workspace/workspace/src/index.ts:260, 473, 831, 854` greifen auf `ctx.get('sessions')`
  zu, um Live-Sessions zuzuordnen).
- Persistenz-Bindung: `docs/config-catalog.md:4601` nennt `sessionPersistence` — der Workspace liest
  also das tatsächliche On-Disk-Layout des konfigurierten Backends, nicht eine eigene Datenbank.
- Der Workspace-Zustand wird über `storageDomain` durabel gehalten; die Domain liegt unterhalb des
  Storage-JSON-Roots `<home>/storages`.

On-Disk-Layout (abgeleitet aus dem JSONL-Backend, siehe 4.2.1):
`<home>/sessions/--<projekt-key>--/<encoded-session-id>/session.vN.jsonl[.zstd]`.
Aus der Vorlage ist `--dsh-workspace--` als Projekt-Slug belegt
(`packages/experimental/webworker-runtime/tests/vfs-example-fixture.ts:506`).

### 8.2 `spill` — Abstraktion

`packages/spill/spill/src/index.ts` definiert die abstrakte Klasse `SpillStore`
(`docs/config-catalog.md:4624`). Vokabular in `src/types.ts`:

| Typ | Felder |
|---|---|
| `SpillLocator` | Branded String — opaker, modell-sichtbarer Handle. Ein lokales Backend nutzt einen Dateipfad, ein Remote-/DB-Backend eine URI oder einen Key. Konsumenten rendern ihn mit `retrievalHint`, **parsen ihn nicht** |
| `SpillOwner` | `{ sessionId: SessionId }` — Save-Time-Namespace; geforkte Sessions erben Locators aus dem geseedeten Log, Artefakte werden **nicht** kopiert oder neu besessen |
| `SpillSource` | `{ kind: 'tool', toolName, callId, label }` **oder** `{ kind: 'session-reference', sessionId, label }` |
| `SaveTextSpill` | `{ owner, source, suggestedName, content }` — `suggestedName` ist ein Hinweis, **nie** ein Pfad |
| `SpillRef` | `{ locator, bytes, retrievalHint }` |

### 8.3 `spill-local` — Dateinamen, Policy-Knöpfe und Cleanup

`packages/spill/spill-local/src/index.ts:31`.

| Config-Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `root` | `string` (optional) | keiner — omitted nutzt ein **lazy erzeugtes privates (0700) Prozessverzeichnis** unter dem OS-Temp-Verzeichnis | Root für Spill-Dateien. Explizit setzen, um Spill-Dateien an einem bekannten Ort zu halten |
| `cleanupPeriodDays` | `number` (optional) | `30` | Alter in Tagen, ab dem eine Spill-Datei für den **einmaligen Startup-Cleanup-Sweep** in Frage kommt; `0` deaktiviert Cleanup vollständig |

**Dateinamen und Layout** (`packages/spill/spill-local/src/store.ts`):

| Element | Wert |
|---|---|
| Default-Root-Präfix | `dsh-spill-` (`DEFAULT_ROOT_PREFIX`, `store.ts:16`) |
| Default-Root-Erzeugung | `mkdtempSync(join(tmpdir(), 'dsh-spill-'))` (`privateRoot`, `store.ts:36-39`); Ergebnis: `dsh-spill-<6 Zeichen>` |
| Session-Verzeichnis | `join(root, 'session-' + sha256(sessionId).slice(0, 12))` ⇒ `session-<12 lowercase hex>` (`sessionDir`, `store.ts:78-81`) |
| Dateiname | `<randomBytes(6).toString('hex')>-<encodeSegment(suggestedName)>` (`store.ts:110`) |
| Dateimodus | `open(path, 'wx', 0o600)` — exklusiv, owner-only |
| Verzeichnismodus | `mkdir(dir, { recursive: true, mode: 0o700 })` |
| `encodeSegment` | injektiv über alle UTF-16-Strings; leere Eingabe ⇒ `~`; `.` ⇒ `~002E`; `..` ⇒ `~002E~002E`; sonst `~XXXX` für alles außer `[A-Za-z0-9._-]` (`store.ts:55-68`) |
| `bytes` | `Buffer.byteLength(content, 'utf8')` |
| ENOENT-Retry | `mkdir`+`open` werden wiederholt, falls ein anderer Prozess das Verzeichnis dazwischen entfernt (`store.ts:112-124`) |

**Cleanup-Mechanik** (`packages/spill/spill-local/src/cleanup.ts`):

| Element | Wert |
|---|---|
| Default-Root-Muster | `^dsh-spill-[A-Za-z0-9]{6}$` — **exakte** `mkdtemp`-Form, nicht nur das Präfix (`cleanup.ts:15`) |
| Session-Dir-Muster | `^session-[0-9a-f]{12}$` (`cleanup.ts:23`) |
| Cutoff-Semantik | `stats.mtimeMs >= cutoffMs` ⇒ behalten; nur **streng ältere** reguläre Dateien werden gelöscht (`cleanup.ts:256`) |
| Nur reguläre Dateien | `if (!stats.isFile()) continue` — Symlinks, Sockets, FIFOs und verschachtelte Verzeichnisse bleiben unberührt; `lstat` folgt nie einem Link (`cleanup.ts:253-255`) |
| Leere Verzeichnisse | werden gepruned, sobald sie leer sind; `ENOENT` und `ENOTEMPTY` sind tolerierte Races |
| Gefundene frühere Default-Roots | werden selbst entfernt, wenn nichts übrig bleibt (`pruneWhenEmpty: true`); das aktive Root **nie** (`pruneWhenEmpty: false`) |
| Trust-Prüfung POSIX | `stats.uid === process.geteuid() && (stats.mode & 0o022) === 0` (`isTrustedDirectory`, `cleanup.ts:47-55`) |
| Ancestor-Prüfung POSIX | kein Ancestor darf für andere schreibbar sein, außer er ist sticky und das Kind gehört dem aktuellen User (`hasProtectedAncestors`, `cleanup.ts:72-96`) |
| Windows | Trust- und Ancestor-Prüfungen entfallen (`return true`); Root-Identität ist der kleingeschriebene kanonische Pfad (`rootIdentity`, `cleanup.ts:58-65`) |
| POSIX-Root-Identität | `${stats.dev}:${stats.ino}` — dedupliziert Aliase |
| Fehlerverhalten | der Sweep **wirft nie**; jeder Fehler geht an einen `WarnFn`, dessen eigenes Werfen geschluckt wird (`warnSafely`, `cleanup.ts:37-44`) |

Bekannte Spill-Snapshots der Vorlage: `snapshots/session/session-query-spill`,
`session-reference-spill`, `parallel-tool-calls`, `fs-glob-sampling`, `multimodal-spill-ends`
(jeweils mit `DSH_SNAPSHOT_SPILL_ROOT`).

### 8.4 `spill-policy` — was gespilled wird, welche Knöpfe

`packages/spill/spill-policy/src/index.ts:25`. `inject: ['tools']`.

| Config-Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `maxInlineTokens` | `number` (optional) | **kein Default — omitted deaktiviert Retention** | maximale geschätzte Token in einem behaltenen Resultat, **inklusive** Bild-Descriptors und Omission-Notices |

Basis-Composition-Wert: `maxInlineTokens: 12500` (`packages/bundle/base/cordis.patch.yml:409-412`).
Der Wert muss ein non-negative safe integer sein, sonst wirft:
`spill-policy: maxInlineTokens must be a non-negative integer (got N)` (`src/index.ts:51-53`).

**Was gespilled wird** (`apply` / `bound`, `src/index.ts:48-156`):

| Regel | Bedingung |
|---|---|
| Nur text-/bild-tragende Inhalte | `retainable(content)` verlangt, dass **jeder** Block `type === 'text'` oder `'image'` ist |
| Budget-Überschreitung | `content.reduce((total, block) => total + price(block), 0) > maxTokens` |
| Tool `read` ausgenommen | `exec.name === 'read'` umgeht die Retention vollständig |
| PTC-Textbindungen ausgenommen | `exec.parent !== undefined && !hasImages` — rein textliche PTC-Bindings behalten ihren asynchronen log-only Spill-Pfad |
| Owner erforderlich | `agent.session.header.id`; fehlt es, wird `no session owner for <tool> <label>` geworfen |
| Backend erforderlich | `ctx.get('spillStore')`; fehlt es, wird `no ctx.spillStore backend loaded` geworfen |
| Dateiname | `suggestedName: \`${toolName}.txt\`` |
| Label | `'result'` bei Top-Level, `'dispatch'` bei PTC |
| Notice-Reserve | `reserved = price(GAP) + price({ text: '\n\n' + worstNotice.text })`, wobei `GAP = { type: 'text', text: '\n\n[...]\n\n' }` |
| Notice zu groß | `price(worstNotice) > maxTokens` ⇒ `spill notice for <tool> exceeds maxInlineTokens` |
| Ergebnisform | `[footer]` wenn nichts behalten wurde, sonst `[...head, GAP, ...tail, { text: '\n\n' + footer.text }]` |
| Text-Merge | benachbarte Text-Blöcke werden verschmolzen (ein Framing-Kostenpunkt on the wire und in der Spill-Preview) |
| Bild-Deskriptor im Volltext | `\n[Image: "<readonlyPath>"; <mediaType>; <width>x<height>. Use read_image to view it.]\n` |
| Fail-soft | **jeder** Fehler loggt `spill-policy: <error>; keeping the inline content` und lässt den Inline-Inhalt stehen |
| Bild-Bepreisung | benötigt einen `imageRequestPricing(provider, model)`-Calculator; fehlt er, wird `the current model has no image token calculator` geworfen |

**Hooks:** `ctx.on('tools/post-execute', …, { prepend: true })` und
`ctx.on('tools/ptc-dispatch-log', …)` (`src/index.ts:133-155`).

---

## 9. Context-Provider

Alle sechs Pakete registrieren einen Context-Beitrag über `ctx.systemPrompt.context({...})` bzw.
einen Context-Provider und werden über den System-Prompt-Zusammenbau adressiert.

### 9.1 `context/agent-instructions`

| Aspekt | Wert |
|---|---|
| Zweck | lädt Workspace-Instruktionsdateien (Baseline + dynamische Batches) |
| `inject` | `sessionProjections` · `workingDirectory` (`docs/config-catalog.md:62`) |
| Quelle | `packages/context/agent-instructions/src/config.ts:18` |
| Config | `projectRootMarkers?: string[]` (Verzeichniseinträge, die beim Aufsteigen die Projektwurzel markieren); `maxBytes: number` (UTF-8-Byte-Cap pro gerendertem Baseline- oder Dynamic-Batch; **nicht-positiv oder nicht-finit deaktiviert das Laden**); `maxSourceBytes?: number` (max. UTF-8-Bytes aus einer Instruktionsdatei; größere werden ignoriert); `instructionFileCandidates?: string[]` (geordnete Kandidaten im selben Verzeichnis; jede existierende Datei lädt, Pro-Verzeichnis-Dedupe über getrimmten Inhalt auf den frühesten Kandidaten); `localInstructionFileCandidates?: string[]` (geordnete lokale Overlays, nach den Basisdateien, gleiche Dedupe; leer deaktiviert das Overlay) |

### 9.2 `context/file-reference`

| Aspekt | Wert |
|---|---|
| Zweck | Service-Seite für Datei-Referenzen (Erkennung/Adressierung), Serviceklasse `FileReferenceService` (`docs/config-catalog.md:4615`) |
| Adressierung | über den registrierten Service; der lokale Discovery-Provider ist `file-reference-local` |
| `Config` | das Paket selbst hat **keinen** Config-Eintrag im generierten Katalog — es liefert den Typ-/Service-Rahmen |

### 9.3 `context/file-reference-local`

| Aspekt | Wert |
|---|---|
| Zweck | lokale Datei-Referenz-Discovery (Indexierung von Dateien/Verzeichnissen je Agent-Workspace) |
| Quelle | `packages/context/file-reference-local/src/index.ts:35` |
| Config | `docs/config-catalog.md:1335-1351`; Feld „Maximum indexed files and directories per agent workspace" (genauer Feldname und Default nicht im Katalogtext abgedruckt) |

### 9.4 `context/session-reference`

| Aspekt | Wert |
|---|---|
| Zweck | bindet Inhalte referenzierter Sessions in den Kontext ein (Spill-gestützt, siehe Snapshot `session-reference-spill`) |
| `inject` | `sessionQuery` (`docs/config-catalog.md:2855`) |
| Quelle | `packages/context/session-reference/src/config.ts:11` |
| Config | `maxReferences?: number` — maximale Anzahl verschiedener Quell-Sessions pro Nachricht, **von 1 bis 3**; `candidateLimit?: number` — Default-Limit der Host-Kandidatenliste; `maxReferenceBytes?: number` — explizites Maximum gerenderter UTF-8-Bytes pro Quelle; fehlend nutzt das modell-relative Budget mit einem **64 KiB**-Floor; `referenceContextFraction?: number` — Anteil des Modell-Kontextfensters pro Quelle, geschätzt mit **vier Bytes pro Token**, zwischen 0 und 1 |
| Message-Source-Kind | `session-reference` (in der V4-Source-Konversionstabelle erhalten) |

### 9.5 `context/time-context`

| Aspekt | Wert |
|---|---|
| Zweck | fügt dem Request einen Zeit-Kontext hinzu; besitzt die Projektion `timeContext` |
| `inject` | `agents` · `sessionProjections` (`docs/config-catalog.md:3572`) |
| Quelle | `packages/context/time-context/src/index.ts:56` |
| Config | `timeZone?: string` — Fallback-Anzeigezone, wenn der offene Turn keine eindeutige Browser-Zone hat; fehlend ⇒ Prozess-Zone. `refreshIntervalMs?: number` — Mindestabstand in Millisekunden zwischen **durabelen** Injektionen in einer Session; Default **`600000` (10 Minuten)**; `0` injiziert bei jedem geeigneten Schritt |
| Projektion | `stateVersion: 2` (`packages/context/time-context/src/index.ts:159`) |
| Message-Source-Kind | `time-context` |
| Fehlerverhalten | ungültige Werte lassen den Plugin-Load scheitern |

### 9.6 `context/tmux-context`

| Aspekt | Wert |
|---|---|
| Zweck | fügt pro Turn den tmux-Ort in den Kontext ein |
| `inject` | `agents` · `sessionProjections` (`docs/config-catalog.md:3591`) |
| Quelle | `packages/context/tmux-context/src/index.ts:47` |
| Config | `refreshIntervalMs?: number` — Mindestabstand in ms zwischen durabelen Injektionen in einer Session; omitted oder `0` injiziert bei **jeder** geeigneten Änderung |
| Projektion | `stateVersion: 1` (`packages/context/tmux-context/src/index.ts:232`) |
| Message-Source-Kind | `tmux-context` — **einziger** in der V4-`attributionKinds`-Liste des Persistenzschemas (`docs/persistence-changes/2026-09-16-session-format-v4.schema.json:188-190`) |
| Fehlerverhalten | ungültige Werte lassen den Plugin-Load scheitern |

### 9.7 Verwandte `working-directory`-Provider

Obwohl nicht unter `context/`, liefern `session/working-directory` und
`session/tool-working-directory` den Working-Directory-Kontext:

| Aspekt | `working-directory` | `tool-working-directory` |
|---|---|---|
| Service | `ctx.workingDirectory` (`packages/session/working-directory/src/index.ts:76`) | Tool-Beitrag |
| `inject` | `fs` · `sessionProjections` · `systemPrompt` (`src/index.ts:63`) | `tools` · `workingDirectory` (`docs/config-catalog.md:4598`) |
| Config | `defaultDirectory: string` — absoluter Deployment-Fallback; Default `process.cwd()`; **muss absolut sein**, sonst `working-directory: defaultDirectory must be absolute` | — |
| Kontext-Name | `working-directory:current`, mit `order: ctx.systemPrompt.getContextOrder('WORKING_DIRECTORY')`, `required: true`, `interpolate: false` (`src/index.ts:90-96`) | — |
| Projektion | `workingDirectory`, `stateVersion: 1`, State `string \| null`, initial `header.cwd ?? null`, `apply` liest `working-directory/change` (`src/index.ts:82-89`) | — |
| Event | `working-directory/change` (mit `data.cwd`) | — |

---

## 10. Vollständige Konfigurationsoberfläche

### 10.1 Konfigurationstabelle

| Name | Art | Bedeutung | Quelldatei |
|---|---|---|---|
| `root` | Datei/Config (session-persistence-jsonl) | Root-Verzeichnis aller Session-Dateien; **required, kein Default** | `packages/session/session-persistence-jsonl/src/index.ts:90` |
| `compression` | Datei/Config | `'zstd'` (Default) \| `'none'` | ebd. |
| `root` | Datei/Config (storage-json) | Verzeichnis mit `<unit>.json` bzw. `<unit>/`; **required** | `packages/storage/storage-json/src/index.ts:28` |
| `backend` | Datei/Config (storage-domain) | Default-Backend-Name; **required** | `packages/storage/storage-domain/src/index.ts:52` |
| `routes` | Datei/Config | Per-Domänen-Backend-Overrides | ebd. |
| `path` | Datei/Config (storage-sqlite) | DB-Datei oder `:memory:`; **required** | `packages/storage/storage-sqlite/src/index.ts:24` |
| `journalMode` | Datei/Config | `'wal'` (Default) \| `'delete'` \| `'truncate'` \| `'persist'` | ebd. |
| `path` | Datei/Config (session-query-sqlite) | dedizierter Index-Pfad oder `:memory:` | `packages/session-query/session-query-sqlite/src/index.ts:92` |
| `openAt` | Datei/Config | `'startup'` (Default) \| `'first-search'` \| `'never'` | ebd. |
| `defaultLimit` | Default | `20` | ebd. |
| `maxLimit` | Default | `100` | ebd. |
| `snippetChars` | Default | `240` | ebd. |
| `persistedReadConcurrency` | Default | `4` | ebd. |
| `preparedSessionCacheSize` | Default | `5` | ebd. |
| `writeEveryEvents` | Datei/Config | Pflicht; Composition-Wert `200` | `packages/session/session-projection-cache/src/index.ts:75` |
| `writeIntervalMs` | Datei/Config | Pflicht; Composition-Wert `5000` | ebd. |
| `maxInlineTokens` | Datei/Config (spill-policy) | Pflicht für Aktivierung; Composition-Wert `12500`; omitted deaktiviert | `packages/spill/spill-policy/src/index.ts:25` |
| `root` | Datei/Config (spill-local) | optional; omitted ⇒ privates `dsh-spill-<6>` unter OS-Temp | `packages/spill/spill-local/src/index.ts:31` |
| `cleanupPeriodDays` | Default | `30`; `0` deaktiviert Cleanup | ebd. |
| `defaultDirectory` | Datei/Config (working-directory) | absoluter Fallback; Default `process.cwd()` | `packages/session/working-directory/src/index.ts:56` |
| `fallbackMaxWords` | Datei/Config (session-title) | required; positive integer | `packages/session/session-title/src/index.ts:303-307` |
| `fallbackMaxBytes` | Datei/Config (session-title) | required; positive integer; **darf `maxTitleBytes` nicht überschreiten** | ebd. |
| `maxTitleBytes` | Datei/Config (session-title) | required; positive integer | ebd. |
| `projectRootMarkers` | Datei/Config (agent-instructions) | Projektwurzel-Marker beim Aufsteigen | `packages/context/agent-instructions/src/config.ts:18` |
| `maxBytes` | Datei/Config (agent-instructions) | UTF-8-Byte-Cap; ≤ 0 oder nicht-finit deaktiviert Laden | ebd. |
| `maxSourceBytes` | Datei/Config (agent-instructions) | max. Bytes einer Instruktionsdatei | ebd. |
| `instructionFileCandidates` | Datei/Config (agent-instructions) | geordnete Kandidaten | ebd. |
| `localInstructionFileCandidates` | Datei/Config (agent-instructions) | geordnete lokale Overlays | ebd. |
| `maxReferences` | Datei/Config (session-reference) | 1–3 | `packages/context/session-reference/src/config.ts:11` |
| `candidateLimit` | Datei/Config (session-reference) | Kandidatenlisten-Limit | ebd. |
| `maxReferenceBytes` | Datei/Config (session-reference) | explizites Byte-Limit pro Quelle | ebd. |
| `referenceContextFraction` | Datei/Config (session-reference) | 0–1; 4 Bytes/Token | ebd. |
| `timeZone` | Datei/Config (time-context) | Fallback-Zone | `packages/context/time-context/src/index.ts:56` |
| `refreshIntervalMs` | Datei/Config + Default | time-context: Default `600000`; tmux-context: omitted/0 = jede Änderung | ebd.; `packages/context/tmux-context/src/index.ts:47` |
| `DSH_HOME` | env-var | überschreibt das Harness-Home; leer/whitespace = unset; Präzedenz explizit > env > `~/.dsh` | `packages/util/home-paths/src/index.ts:18, 135-137` |
| `DSH_AGENTS_HOME` | env-var | überschreibt `~/.agents` | `packages/util/home-paths/src/index.ts:27, 151-153` |
| `DSH_TELEMETRY_OTLP_URL` | env-var | überschreibt den Produktions-OTLP-Endpoint | `packages/bundle/base/cordis.patch.yml:202` |
| `DSH_TELEMETRY_DISABLED` | env-var | **jeder** nicht-leere Wert (auch `'0'`/`'false'`) meldet den Prozess ab | ebd. |
| `DSH_SNAPSHOT_SESSIONS_ROOT` | env-var (Tests/Snapshots) | überschreibt den Session-Root in Fixtures | `snapshots/acp/escalation-approved/cordis.yml:30` |
| `DSH_SNAPSHOT_SPILL_ROOT` | env-var (Tests/Snapshots) | überschreibt den Spill-Root in Fixtures | `snapshots/session/session-query-spill/cordis.yml:8` |
| `<home>/sessions` | directory | Session-Logs | `packages/bundle/base/cordis.patch.yml:136` |
| `<home>/storages` | directory | Storage-JSON-Root | ebd.:180 |
| `<home>/storages/session_projcache/sessions/` | directory | Projektions-Cache (ein JSON-Dokument pro Session) | `packages/session/session-projection-cache/src/spec.ts:100-107` |
| `<home>/cache/` | directory | Cache-Wurzel (`dshCachePath`) | `packages/util/home-paths/src/index.ts:170-173` |
| `<home>/cache/attachments` | directory | Attachment-Cache | `packages/util/home-paths/tests/home-paths.spec.ts:111` |
| `<home>/speech-to-text/sensevoice` | directory | Speech-to-Text-Daten | `packages/experimental/voice-input-bundle/cordis.patch.yml:9` |
| `~/.agents` | directory | geteilte Agent-Konfiguration | `packages/util/home-paths/src/index.ts:78-80` |
| `./.sessions` | directory | Test-/Fixture-Default in vielen Snapshots | u.a. `snapshots/sdk/bash-tool/cordis.yml:17` |
| `./.spill` | directory | Fixture-Spill-Root | `snapshots/session/session-query-spill/cordis.yml:8` |
| `:memory:` | default (SQLite) | In-Process-DB für `session-query-sqlite.path` und `storage-sqlite.path` | `packages/bundle/base/cordis.patch.yml:155` |
| `session.lock` | file | POSIX-Lock-Datei im Session-Verzeichnis | `packages/session/session-persistence-jsonl/README.md:165` |
| `<key>.json.bak.<stamp>` | file | Backup eines invaliden Projektions-Cache-Records | `packages/session/session-projection-cache/src/spec.ts:93-98` |

### 10.2 Verzeichnisbaum des Harness-Home

```
<home>/                                        # $DSH_HOME, sonst ~/.dsh
├── sessions/                                  # session-persistence-jsonl root
│   ├── --<projekt-key>--/                     # lesbarer Projekt-Slug, z.B. --dsh-workspace--
│   │   └── <encoded-session-id>/              # injektiv kodiertes Session-Verzeichnis
│   │       ├── session.jsonl[.zstd]           # Generation 0
│   │       ├── session.v1.jsonl[.zstd]        # Generation 1
│   │       ├── session.v2.jsonl[.zstd]        # Generation 2
│   │       ├── session.v3.jsonl[.zstd]        # Generation 3
│   │       ├── session.v4.jsonl[.zstd]        # Generation 4 (aktuell)
│   │       └── session.lock                   # POSIX-Lock (nur beim Write-Open)
│   └── _no-cwd/                               # Sessions ohne cwd
│       └── <encoded-session-id>/ …
├── storages/                                  # storage-json root
│   └── session_projcache/                     # Domain session_projcache (version 7)
│       └── sessions/
│           ├── <sessionId>.json               # CheckpointRecord { identity, rows }
│           └── <sessionId>.json.bak.<stamp>   # beiseitegelegter invalider Record
├── cache/                                     # dshCachePath() Wurzel
│   └── attachments/                           # Attachment-Cache
└── speech-to-text/
    └── sensevoice/                            # Speech-to-Text-Daten

~/.agents/                                     # $DSH_AGENTS_HOME, geteilte Agent-Konfiguration
<os-tmp>/dsh-spill-<6 Zeichen>/                # spill-local Default-Root (lazy, 0700)
└── session-<12 lowercase hex>/                # sha256(sessionId)[0..12]
    └── <12 hex Zeichen>-<encoded-suggestedName>   # Spill-Datei, 0600
```

---

## 11. Hard Facts

### Versionen

| Fakt | Wert | Quelle |
|---|---|---|
| `SESSION_FORMAT_VERSION` | **4** | `packages/core/session/src/types.ts:89` |
| Unterstützte Codec-Versionen | 0, 1, 2, 3, 4 | `packages/session/session-format-catalog/src/generated.ts:18-24` |
| `latestFinalizedVersion` | 4 | `docs/session-format-status.md:32` |
| `latestReleasedVersion` / `evidenceTag` | 4 / `dsh-v0.2.0-rc.2` | `docs/session-format-status.md:45-46` |
| `STORAGE_SQLITE_SCHEMA_VERSION` | **1** (keine Migrationen) | `packages/storage/storage-sqlite/src/schema.ts:20` |
| `SESSION_QUERY_SQLITE_SCHEMA_VERSION` | **8** (Reset in place) | `packages/session-query/session-query-sqlite/src/schema.ts:8` |
| `SESSION_QUERY_SQLITE_APPLICATION_ID` | `0x44534851` | ebd.:11 |
| Domain `session_projcache` Version | **7**, kompatibel 3–6 | `packages/session/session-projection-cache/src/spec.ts:102-103` |
| Anzahl aktueller Event-Typen | 54 | `packages/core/session/src/known-event-types.ts:22-83` |
| Anzahl `RELEASED_V3_EVENT_TYPES` | 56 | `packages/session/session-format-v3-to-v4/src/extension-identities.ts:8-67` |
| Anzahl Surface-Typen | 5 | `packages/session/session-format-v2-to-v3/src/payload.ts:9` |
| Anzahl Migrationen | 4 (v0→v1→v2→v3→v4) | `packages/session/session-format-catalog/src/generated.ts:26-31` |

### Default-Pfade

| Fakt | Wert |
|---|---|
| Harness-Home | `$DSH_HOME`, sonst `~/.dsh` |
| Agents-Home | `$DSH_AGENTS_HOME`, sonst `~/.agents` |
| Session-Root (Basis-Composition) | `<home>/sessions` |
| Storage-JSON-Root (Basis-Composition) | `<home>/storages` |
| Projektions-Cache | `<home>/storages/session_projcache/sessions/<sessionId>.json` |
| Attachment-Cache | `<home>/cache/attachments` |
| Spill-Default-Root | `<os-tmp>/dsh-spill-<6 Zeichen>` (mkdtemp, 0700) |
| Spill-Session-Verzeichnis | `<root>/session-<12 lowercase hex>` |
| Engine-Dateiname aktueller Generation | `session.v4.jsonl` (`compression: 'none'`) bzw. `session.v4.jsonl.zstd` |
| Session-Query-SQLite-Default | `path: ':memory:'`, `openAt: never` in der Basis-Composition |

### Default-Limits

| Fakt | Wert | Quelle |
|---|---|---|
| Projektions-Cache `writeEveryEvents` | 200 | `packages/bundle/base/cordis.patch.yml:194` |
| Projektions-Cache `writeIntervalMs` | 5000 | ebd.:195 |
| Spill `maxInlineTokens` | 12500 | ebd.:412 |
| Spill `cleanupPeriodDays` | 30 (0 = aus) | `docs/config-catalog.md:3091` |
| Query `defaultLimit` / `maxLimit` | 20 / 100 | `docs/config-catalog.md:2830-2833` |
| Query `snippetChars` | 240 | ebd.:2835 |
| Query `persistedReadConcurrency` | 4 | ebd.:2837 |
| Query `preparedSessionCacheSize` | 5 | ebd.:2839 |
| time-context `refreshIntervalMs` | 600000 (10 min) | `docs/config-catalog.md:3580` |
| Export-ZIP-DEFLATE-Level | 6 | `packages/session-query/session-log-export/src/archive.ts:40` |
| Export-Chunk-Größen | 65536 Code-Units / 65536 Bytes / High-Water-Mark 65536 Bytes | ebd.:407-413 |
| Migration v2→v3 Streaming-Slice | ca. 1 MiB Main-Thread-Slices | `packages/session/session-persistence-jsonl/README.md:108` |
| session-reference Floor | 64 KiB | `docs/config-catalog.md:2865` |
| `maxReferences` | 1–3 | `docs/config-catalog.md:2862` |
| session-reference Token-Schätzung | 4 Bytes pro Token | `docs/config-catalog.md:2867` |
| Session-Log-ID-Trunkierung im Projekt-Slug | `slice(0, 251)` | `packages/session/session-persistence-jsonl/src/format.ts:244` |
| Spill-Session-Hash-Länge | 12 Hex-Zeichen aus `sha256(sessionId)` | `packages/spill/spill-local/src/store.ts:79` |
| Spill-Dateiname-Zufallsteil | 6 Bytes (12 Hex-Zeichen) | ebd.:110 |

### Retention-Fenster

| Fakt | Wert |
|---|---|
| Spill-Dateien | `cleanupPeriodDays` Default 30 Tage; einmaliger Startup-Sweep; `0` deaktiviert |
| Session-Logs | **keine Retention** — „Nothing deletes session files" |
| Projektions-Cache | keine Retention; Domain-Version-Bump verwirft pro Session (`per-record`) den stale Record |
| Storage-SQLite | keine Promotion, kein Prune |
| Query-SQLite | Reset in place bei Versionswechsel (kein Fenster) |
| Export | kein Fenster; der `media/`- und `files/`-Dedupe gilt pro Archiv |

### Gotchas aus Code und Tests

1. **Kein Footer-Record.** Der vererbte Schnitt steht ausschließlich im letzten getaggten
   `session/end-seed` mit `inherited: true` — nicht im Header. Der v0/v1-Header trug stattdessen
   `seedLength` (`packages/session/session-format-v0-to-v1/src/codec.ts:163-165, 180`).
2. **`-0` ist verboten.** `sessionFormatCount` und `sessionFormatSafeInteger` lehnen negatives Null
   explizit ab (`packages/session/session-format/src/json.ts:23-41`), und `isHeaderLine` prüft
   `!Object.is(createdAt, -0)` bzw. `!Object.is(delegationDepth, -0)`
   (`packages/session/session-persistence-jsonl/src/format.ts:170-174`).
3. **Header-`cwd` muss absolut sein**, sonst gilt die erste Zeile nicht als Header
   (`format.ts:175-177`). In Test-Fixtures wird eine relative `cwd` genau deshalb verworfen.
4. **Retirierte Header-Felder.** `sandboxMode` und `approvalPolicy` werden hart abgelehnt:
   `'session header uses retired policy baseline fields'` (`format.ts:105-110`).
5. **V4 physikalisch = V2-Framing + V4-Admission.** `physicalV2()` setzt `version` auf 2 und stellt
   danach 4 wieder her (`packages/session/session-format-v3-to-v4/src/codec.ts:14-16`).
   Dies ist ein bewusstes Detail, keine Anomalie.
6. **V3→V4 verweigert ohne Child-Evidenz.** `sessionFormatV3ToV4.createStage()` wirft immer.
   Nur `createSessionFormatV3ToV4(children)` bzw. `createSessionFormatCatalogWithChildren(children)`
   funktionieren; ein leeres Array ist die ausdrückliche Erklärung „keine Kinder"
   (`migration.ts:23-25`, `children.ts:9-19`).
7. **Der historische Katalog hat `currentVersion: 3`** und publiziert nie — er existiert nur, um
   Migrations-Voraussetzungen einzusammeln, ohne aktuelle Sessions rekursiv zu öffnen
   (`packages/session/session-format-catalog/src/historical.ts:9-21`).
8. **Zwei Korpora, ein Fingerprint.** Ein `list()`-Aufruf teilt einen Corpus-Fingerprint über seine
   historischen Einträge; historische `stat`/`list`-Revisionen kosten Metadatenarbeit proportional
   zur Session-Anzahl im Root (`session-persistence-jsonl/README.md:84, 90`).
9. **Read-Only öffnet publiziert nie.** Ein Read-Open migriert, validiert und gibt zurück — ohne
   Nachfolger. Kalte Prozesse und evicted Preparations wiederholen die Arbeit.
10. **Source bleibt byte-identisch** bei einer Migration; der Nachfolger wird als **neue**
    `.vN`-Datei publiziert, der Vorgänger bleibt liegen. „Retained predecessors do not provide
    automatic fallback or downgrade support."
11. **Windows-Lock ist per Login-Session.** Der Semaphore-Name ist
    `Local\dsh-session-lock-<sha256(pfad kleingeschrieben)>` — ein zweiter Login sieht ihn nicht
    (`win32.ts:153`, `README.md:165`).
12. **Windows braucht Koffi.** Die Win32-API wird lazy über `koffi.load('kernel32.dll')` geladen;
    Nicht-Windows-Prozesse laden Koffi nie (`win32.ts:53-67`).
13. **POSIX-Materialisierung braucht Hard-Link-Unterstützung** — das erste Append nutzt `link()`
    (`README.md:166`).
14. **POSIX-Writes brauchen das prebuilt Addon** `node-addon-system` für asynchrones `flock`;
    ein fehlendes Addon lehnt Write-Ownership ab (`README.md:167`).
15. **Ein Root gehört zu einer Kodierung.** Ein `compression`-Wechsel erfordert ein separates Root;
    Discovery und gezielter Lookup lehnen Generationen mit dem anderen Suffix ab (`README.md:108, 161`).
16. **`create()` schreibt nichts.** Eine erzeugte Session, die nie `append`/`flush` sieht, hinterlässt
    nichts und existierte nach einem Crash nie (`README.md:76`, `session-persistence/README.md:53`).
17. **`flush()` materialisiert eine leere Session** (Header-Frame ohne Event) — der einzige Weg,
    eine leere Session durabel listbar zu machen.
18. **Der Scanner lädt nur Current-Generation-Dateien.** `assertV4RowAdmission` läuft **vor** der
    Recoverable-Tail-Suppression; retirierte required Tags und `request/header.header.system`
    verweigern die Datei auch nach einer früheren malformed Zeile (`format.ts:490-497`).
19. **Ein späteres `turn/end` macht einen früheren Scan-Fehler fatal**
    (`format.ts:499-503, 515-517`).
20. **Zerrissene Zstd-Frames werden repariert, korrupte vollständige Frames nicht.** Nur der
    **letzte** Frame darf zerrissen sein; eine Checksum-/Dekompressions-/Strukturfehl in einem
    vollständigen Committed-Frame ist Corruption (`README.md:76`).
21. **Spill-Sweep wirft nie** und folgt nie einem Symlink; nur reguläre Dateien mit
    `mtimeMs < cutoffMs` werden gelöscht (`cleanup.ts:225-260, 274-362`).
22. **Spill-Sweep prüft Trust.** Auf POSIX werden Roots übersprungen, die nicht dem aktuellen User
    gehören oder für Gruppe/Andere schreibbar sind (`cleanup.ts:47-55, 120-153`).
23. **Nur die exakte `mkdtemp`-Form wird gesweept.** `dsh-spill-test-*` oder ein fremdes
    `dsh-spill-…`-Verzeichnis wird **nicht** als Backend-Root erkannt
    (`DEFAULT_ROOT_RE = ^dsh-spill-[A-Za-z0-9]{6}$`, `cleanup.ts:15`).
24. **Spill-Policy ist fail-soft.** Jeder Fehler loggt eine Warnung und lässt den Inline-Inhalt stehen
    (`spill-policy/src/index.ts:127-130`). Fehlende `spillStore`, fehlender Session-Owner und
    fehlender Bild-Token-Calculator werfen intern, führen aber zum selben Fail-soft-Ergebnis.
25. **Text-only PTC-Bindings werden nicht retiniert** — sie behalten ihren asynchronen
    log-only-Spill-Pfad (`spill-policy/src/index.ts:138-140`).
26. **Das Tool `read` ist von der Spill-Retention ausgenommen** (`src/index.ts:135`).
27. **`maxInlineTokens` omitted deaktiviert die Retention vollständig**
    (`spill-policy/src/index.ts:50`).
28. **`maxTitleBytes` ist eine Obergrenze für `fallbackMaxBytes`** — sonst wirft
    `session-title: fallbackMaxBytes must not exceed maxTitleBytes`
    (`packages/session/session-title/src/index.ts:327-329`).
29. **`agent-instructions.maxBytes ≤ 0` deaktiviert das Laden still** (nicht-positiv oder nicht-finit).
30. **Projektions-`stateVersion`-Konflikt wirft**, statt still zu koexistieren. Ein
    `stateVersion`-Bump invalidiert alle Persisted Rows dieses Keys.
31. **`restore` wirft bei `baseSeq > 0` und unbrauchbarer Zeile.** Der Aufrufer muss ab Seq 0 neu
    lesen — der Anlass ist typischerweise eine Crash-Repair-Truncation, die das Log unter einen
    Wasserstand geschrumpft hat (`session-projection/src/index.ts:479-520`).
32. **`checkpoint()` gibt struktur-klonte Werte zurück**, nie die Live-Zellreferenz — sonst könnte
    ein Aufrufer jeden nachfolgenden Snapshot korrumpieren (`src/index.ts:383-408`).
33. **Die Projektions-Registry zählt Registranten.** Dasselbe Tool-Paket in N Agent-Presets
    registriert denselben Key N-mal; erst der letzte Unload entfernt ihn (`src/index.ts:158-174`).
34. **Query-SQLite resettet in place.** Bei abweichender `user_version` werden alle User-Tabellen
    gedroppt — der Index ist derived data, keine Quelle der Wahrheit.
35. **Query-SQLite verweigert fremde Datenbanken.** Eine nicht-null `application_id` ≠ `0x44534851`
    wirft; eine Null-`application_id` mit vorhandenen Tabellen wirft ebenfalls.
36. **Export schreibt kein Manifest.** Die Zuordnung erfolgt rein über den inhaltsadressierten Pfad.
37. **Export bricht bei einem unlesbaren Nachfahren den ganzen Stream ab** — bewusst fail-loud.
38. **Export schützt Surrogatpaare beim Chunking** — ohne das würde ein Lone High Surrogate zu
    U+FFFD und das exportierte Artefakt still korrumpieren (`archive.ts:517-522`).
39. **Der Projekt-Slug ist bewusst verlustbehaftet.** Separatorersetzung und Trunkierung auf 251
    Zeichen sind gewollt („human-navigable project-directory convention"), cwd-Strings, die gleich
    normalisieren, teilen sich ein Projektverzeichnis — die Session-IDs trennen weiterhin
    (`format.ts:216-245`).
40. **Session-IDs werden immer kodiert.** Eine `SessionId` ist ein unvalidiertes Branded String;
    `encodeSegment` neutralisiert `../`, absolute Pfade, NUL und Separatoren vor jeder
    Dateisystemnutzung. Ein leerer String wirft `cannot encode an empty path segment`.
41. **`storage-sqlite` lehnt jede andere gestempelte Version ab** — es gibt keinen Migrationspfad
    (`schema.ts:14-19, 82-87`). Der Stempel wird **zuletzt** gesetzt, damit ein Fehler das Medium
    ungestempelt lässt.
42. **`delegationDepth` ist top-level optional, physisch required.** `toHeaderLine` ersetzt ein
    fehlendes `delegationDepth` durch `0` (`format.ts:130-133`), und `serializeSessionLog` macht
    dasselbe für den Export (`archive.ts:130`).
43. **Ein geseedeter Header verlangt einen `inheritedEventCount`**;
    `toHeaderLine` wirft `'seeded session header requires an inherited event count'` bzw.
    `'unseeded session header inherited event count must be 0'` (`format.ts:123-129`).
44. **V2/V4-Decoder erzwingen die End-Seed-Konsistenz:**
    `'released v2 seeded Session lacks an inherited end-seed marker'` und
    `'released v2 unseeded Session contains an inherited end-seed marker'`
    (`packages/session/session-format-v1-to-v2/src/codec.ts:121-127`).
45. **Der V3→V2-Delivery-Marker-Check verbietet ein Target-Watermark:**
    ein V3-Quellmarker, der Generation 4 behauptet, wird verweigert
    (`session-format-v3-to-v4/src/migration.ts:83-86`).
46. **`sourceEventSeqs` wird verlustfrei als Läufe gespeichert.** Läufe von mindestens drei
    Sequenznummern werden zu `[start, end]`; kürzere bleiben einzeln
    (`session-format-v1-to-v2/src/codec.ts:217-232`).

---

### Unsicherheiten

Folgende Punkte konnten aus dem vorliegenden Quellstand **nicht** abschließend bestimmt werden und
sind hier ausdrücklich als offen markiert:

- Der **exakte Feldname und Default** des `Config`-Feldes von `context/file-reference-local`
  (der generierte Katalog druckt nur den JSDoc-Text „Maximum indexed files and directories per
  agent workspace").
- Die **vollständige `Config`-Oberfläche von `context/file-reference`** — das Paket hat keinen
  Eintrag im generierten Konfigurationskatalog; es liefert den Service-Rahmen
  (`FileReferenceService`) und die Typen.
- Die **Felder von `SessionStatsState`** und `TurnOutlineState` sind jetzt vollständig erfasst
  (siehe 5.3); die Feldlisten von `TitleInputState` wurden über den `apply`-Rumpf rekonstruiert
  (`{ first, count, lastSeq }`), nicht über eine explizite Interface-Deklaration.
- Das **`Config`-Schema von `session-turn-outline`, `session-stats`, `session-checkpoint-policy`,
  `session-log-deepseek`, `session-telemetry` und `session-telemetry-otel`** ist in dieser Analyse
  nicht im Detail erfasst; für `session-telemetry-otel` belegt der Katalog nur
  `inject: ['sessions', 'otel']` und die Referenz auf `LogExporterOptions` /
  `SessionLogProcessorOptions`.
- Die **vollständige Methodensignatur-Liste von `SessionQueryEngine`** — die exportierten Typen und
  die Methoden `observeSession` / `listSessions` sind bestätigt, die Signaturen der Trace-, Read-,
  Search- und Titel-Methoden wurden nicht Zeile für Zeile verifiziert.
- Die **Typen und Felder des Workspace-Modells** (Interfaces/Records): die Service-Identität
  (`workspaceRegistry`), `inject`, die Persistenz-Bindung und die Pfadableitung sind belegt, die
  Feldlisten der Workspace-Records nicht.
- Die **`Config`-Felder von `working-directory`** sind auf `defaultDirectory` beschränkt bestätigt;
  ob das Paket weitere Felder akzeptiert, wurde nicht geprüft.
- Die **README-Aussage zu den Dateinamen `session.v3.jsonl` / `session.v3.jsonl.zstd`** in
  `packages/session/session-persistence-jsonl/README.md:62-69` ist **veraltet**: sie beschreibt
  v3 als „current", während `SESSION_FORMAT_VERSION` bereits `4` ist. Der Code
  (`generationLogFilename(SESSION_FORMAT_VERSION, …)`) erzeugt `session.v4.jsonl`. Diese
  Diskrepanz ist ein Dokumentationsfehler der Vorlage, kein Codefehler.
