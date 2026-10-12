# Cookbook: adding a session-log format version

[English](adding-a-session-format-version.md) | 中文

## Overview

This tutorial covers adding the next session-log format version without rewriting already published data. Read the [version and release status source of truth](../session-format-status.zh.md) to determine the workspace writer and the latest released format. Let N be the verified released format and N+1 the target version; replace these placeholders in names and metadata with the numbers. Before starting, have a working contributor workspace ready and read the [package checklist](adding-a-package.zh.md), the [format library](../../packages/session/session-format/README.zh.md), and the [released format decision](../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md).

## Contents

- [1. Choose the version and release baseline](#choose-the-version)
- [2. Add an identity migration edge](#add-an-identity-edge)
- [3. Implement per-artifact stages and validation](#stages-and-validation)
- [4. Update current-version consumers](#current-version-consumers)
- [5. Create snapshot successor generations](#snapshot-successors)
- [6. Validate the integrated result](#validate)
- [Developer V4 corpus trial migration](#v4-corpus-trial)
- [Developer notes](#dev-note)

<a id="choose-the-version"></a>
## 1. Choose the version and release baseline

Raise the format version only when effective discriminating information cannot prevent an unsafe interpretation. Header, event envelope, event-semantic, or reconstructed-structure changes require assessment under the [reader compatibility rules](../../.agents/notes/implemented/process/2026-10-08-session-reader-compatibility-review.zh.md) and do not raise the version automatically. Record safe same-version evolution through the [type change process](reviewing-persistence-type-changes.zh.md). Distinguish the session format integer from package release versions, SQLite schema versions, projection unit versions, and protocol wrapper versions.

When a version raise really is needed, take N from the accepted or released version in [version/status](../session-format-status.zh.md). After V4 is accepted, this raise needs V5 even if the V4 release has not yet been recorded; a reviewed same-version evolution does not need this step.

Use the shared `release/*` integration baseline for N+1. Baseline changes add the writer, codec, catalog wiring, identity migration, and validation. Create the individual child branches from that baseline and target their PRs (Pull Requests) at the release branch, not at another child branch. Each child branch adds its own structural transform, validators, consumers, and tests inside the same adjacent migration package. Do not allocate extra versions merely to express review order. Merge reviewed child branches into the release branch through PRs and validate the combined result before release. Respect the release branch's force-push and deletion protection; do not force-sync that branch.

A released codec keeps the interpretation that was accepted. A current-version codec may admit branches with clear discriminating information while preserving historical readability; do not loosen an old codec just to admit a current feature. Once N+1 is released, the N→N+1 converter may fix or add historical scenario support as long as its output remains N+1-compatible. A fix only affects later conversions, not existing N+1 successor files. Record mapping changes and how existing output continues to be supported; any new target representation must apply the reader compatibility rules.

A same-version log skips adjacent migrations, so after restore it may mix historical and newer record branches. Each integer therefore identifies a set of supported representations rather than one fixed schema. The owning reader must preserve and distinguish those branches, and the next outward migration must handle them. Do not add same-version migrations, and do not rely on `restoreCurrent` alone for normalization: reading current-version JSONL with transformed validation skips that hook. Intermediate integration formats use discardable, mutually isolated Harness homes; when an adjacent conversion changes, re-run from unchanged historical input, and never rewrite committed generations or use a real user home.

Before changing the writer, preserve its complete persistence schema with the [archival command](../persistence-changes/historical-formats/README.zh.md#maintenance), then add a bilingual format reference under `docs/persistence-changes/historical-formats/vN.*`. Keep every earlier record. The format coverage check requires a separate document for every integer version below the new writer; the currently generated catalog covers only the new writer.

<a id="add-an-identity-edge"></a>
## 2. Add an identity migration edge

Create the library for N→N+1 according to the package checklist, not as a mounted plugin. The identity body transform is only the initial wiring skeleton. The [V2 to V3 specification](../../packages/session/session-format-v2-to-v3/README.zh.md#v2-to-v3-specification) is a fixed example of explicit transform and preservation rules, not a migration edge you can keep extending or treat as an identity conversion.

Declare `dsh.sessionFormatMigration` in the manifest (metadata manifest) with the numeric `from: N` and `to: N+1`, the export paths, and the exported migration, source codec, target codec, target header validator, and target restorer. Reuse the source codec exported by the package that owns the preceding migration edge and depend on that package; do not copy or redefine a released codec. Export the target codec and validator from the new package. Add the migration edge to the catalog's direct dependencies and add the workspace TypeScript path and project reference.

In the same change that adds the new migration edge declaration, set `SESSION_FORMAT_VERSION` in the [core session types](../../packages/core/session/src/types.ts) to N+1, then generate the catalog. The command below generates only the migration chain that is declared; it does not implement the new version:

```sh
pnpm run gen-session-format-catalog
```

The [generator](../../scripts/gen-session-format-catalog.ts) requires exactly one adjacent migration package for every step from zero to the writer version, with matching directory and package names, matching adjacent codec exports, and the declared dependencies. It rejects gaps, duplicate or superfluous migration edges, unknown metadata members, and a catalog that does not share Session through a peer dependency (peer dependency) plus a dev dependency. Fix the declarations rather than hand-editing `generated.ts`. The catalog is statically determined at build time; plugin mounting must not decide whether historical data is readable.

<a id="stages-and-validation"></a>
## 3. Implement per-artifact stages and validation

Use the [Stage interface](../../packages/session/session-format/src/types.ts), not a whole-artifact array-to-array migrator. The immutable `SessionFormatMigration` declaration provides `migrateHeader`, `validateTargetHeader`, and `createStage`. Every `createStage` call creates independent state for one source artifact. Counters, pending events, and reference maps belong to that state; never share a mutable Stage across sessions.

Implement `transformEvent(event, context)`, `transformRun(run, context)`, and `finish(context)`. Emit synchronously through `context.emitEvent` or `context.emitRun`; one call may produce zero, one, or many outputs. Let the Stage consume the codec-owned compact run directly, or iterate `run.expand()`, without materializing intermediate arrays. The caller owns scheduling, and the migration chain finishes upstream Stages before downstream Stages.

The inheritance cutoff is a logical event count, not a physical line count. Expose `headerInheritedEventCount` only when it is known before EOF; `finish` returns the exact target cutoff. A preceding migration edge that changes event counts can make that count unknowable at construction time. Where necessary, derive it from the validated seed marker, and test seeded multi-hop restore from every supported historical generation to N+1 rather than testing only direct N input. Never substitute zero for an unknown cutoff.

Define the new migration edge's event admission and transform rules explicitly. The [V2 to V3 source audit](../../packages/session/session-format-v2-to-v3/README.zh.md#source-audit) and the [Alpha V0→V1 rules](../../.agents/notes/implemented/architecture/2026-08-31-alpha-historical-unknown-event-refusal.zh.md) own the policy of their respective released migration edges, not the policy of the new edge. Do not generalize either policy to all migration edges. When structure or event position changes, you must classify source events, payload members, and references, and decide explicitly whether opaque data can remain valid. [Same-version retention](../../.agents/notes/implemented/architecture/2026-08-30-retain-ignorable-external-session-events.zh.md) alone does not prove a structural transform safe. Validate the target semantics and provide one rejected counterexample for every newly accepted case; never loosen an old migration edge to hide an unsupported conversion.

Plugin records written by `appendPluginRecord()` are ignorable events in the `plugin:` namespace, and experimental packages read them back by type. When the target format can represent them, keep carrying them under their original names; otherwise state in the migration edge README which records it drops. The [ignorable event decision](../../.agents/notes/implemented/architecture/2026-08-30-retain-ignorable-external-session-events.zh.md) retains these records on a best-effort basis. This policy applies even when a stored record is not declared in the [experimental persistence catalog](../experimental-persistence-catalog.zh.md).

Use native writer output as the conversion control: replay the old writer and the target writer with the same recorded LLM messages, tool output, and other inputs. Compare the migrated old output with the target's raw output before any format-normalization helper runs, masking only the documented volatile fields. In V4, an ordinary tool result becomes a flat tool-role message containing ordinary content blocks. The fact that an old type theoretically allowed some structure is not by itself enough to support a new core content type.

An Alpha converter may explicitly refuse historical scenarios that have no implemented, evidence-backed mapping, including otherwise valid logs. Source files stay unchanged and no partial successor is published. When extending support, prefer real corpora and a reproducible writer; inspect user corpora read-only and create sanitized regression fixtures.

In the migration edge README, record only the identifiers and field mappings the target format needs, with a per-item reason. Do not add a namespace to a direct source kind or to ordinary metadata merely because that is extensible. Preserve opaque nested data. An Alpha converter may refuse an unexpected source field that would acquire new semantics in the target format rather than invent an interpretation for it.

Following the [V2 to V3 specification](../../packages/session/session-format-v2-to-v3/README.zh.md#v2-to-v3-specification), maintain the new migration edge's README as the single complete catalog of conversion and admission. Enumerate every transformed header, event, message slot, and payload field, the exact rename or conflict rules, the preserved ids, coordinates, references, and inheritance cutoffs, the external prior evidence, the refusal and opaque-data policy, and the unsupported or deferred behavior. Keep historical source conversion separate from native target admission, and state which codec, restorer, installed validator, and recovery policy performs each check. Record validation scopes that are deliberately narrower than the declared schema. A code change must update this catalog in the same change; a generated schema inventory or a PR description does not replace it.

Validate strict restore through `sessionFormatCatalog.createRestore(header, { recovery: 'strict', validation: 'current' })`, feeding the lines in order and calling `finish()`. That performs physical decoding, the full migration chain, and installed current-session validation. The production recoverable/transformed policies do not replace the strict validation that fixtures (test fixture data) and release validation need. Keep recorded historical validation exceptions and do not claim source validation is stricter than the migration edge actually performs.

<a id="current-version-consumers"></a>
## 4. Update current-version consumers

Track every current-version consumer, including session creation and restore, JSONL filename selection and publication, the catalog's current encoder and restorer, projection-cache generation identity, replay and snapshot normalization, the [physical fixture layout check](../../scripts/session-fixture-layout.ts), and TypeScript/Python SDK recording. Use the writer constant where a value denotes the current version; keep literal historical versions in released codecs and historical fixtures. Update current documentation and generated references through their respective owners.

Do not auto-promote unrelated versions. A request wrapper's `sessionFormatVersion` identifies the embedded session generation; the outer schema version has its own meaning. A projection unit state version likewise does not replace a cached session generation identity.

Validate both the read and the write path. A header-only list operation must not read the body or publish. A historical read open may return the migrated in-memory artifact without writing; a write open must validate and publish the single final current successor generation before allowing appends. Source paths, bytes, and inodes stay unchanged. When the selected generation is higher than the current version or invalid, do not fall back to the previous generation. The [preparation decision](../../.agents/notes/implemented/architecture/2026-09-05-read-only-session-migration-preparation.zh.md) owns publication timing.

<a id="snapshot-successors"></a>
## 5. Create snapshot successor generations

Read [snapshot ownership](../../snapshots/AGENTS.md) and the [snapshot library](../../packages/test-support/session-snapshot/README.zh.md). The [corpus policy](../../scripts/session-snapshot-corpus-policy.ts) keeps its declared baseline as replay input, so an upgrade really goes through the adjacent migration chain; raising the writer version does not require refreshing that corpus. When a current-generation successor is needed, choose the scenario that owns the data, keep every historical file, and use the target version's canonical parent/child filenames. Never rename a previous generation to the target filename or merely edit its header.

If replay input is unchanged, run a key-free refresh on the owner, then a replay that writes nothing back. The SDK commands below use `text-turn` and the workspace writer version. Implement and wire up N+1 before using them to generate that version; for a feature change, choose the owners actually affected:

```sh
pnpm run test:snapshot:refresh snapshots/sdk/sdk.snapshot.ts -t text-turn
pnpm run test:snapshot snapshots/sdk/sdk.snapshot.ts -t text-turn
```

Review the new generation, the accompanying request files, and the protocol output together. Verify that every previous generation keeps identical bytes and that parent/child roles are contiguous. The selection rule takes the numerically highest generation, so update shared references to the parent generation the owner selected. Do not treat the packed layout migrator as a version upgrader. If the model transcript (text record) must change, the scenario owner records it live with the required provider key according to the [testing policy](../testing.zh.md).

Keep cases earlier than the baseline explicitly through `snapshot.yml`'s `sessionFormat.version` and the supported `coverage` names; record and refresh do not touch pinned session fixtures. Update the [corpus policy](../../scripts/session-snapshot-corpus-policy.ts) to adopt the current generation while keeping focused direct-migration-edge, multi-hop, packed-row, retry/failure, and delivery-profile coverage. Inspect the corpus and both SDK projections; do not bulk-refresh unrelated scenarios merely to clear a validation failure.

<a id="validate"></a>
## 6. Validate the integrated result

Run from the repository root. The commands below check catalog declarations, Stage composition, the released V2→V3 migration edge, and generation selection. They are baseline checks; add focused coverage for the new migration edge:

```sh
pnpm run verify-session-format-catalog
pnpm exec vitest run scripts/gen-session-format-catalog.spec.ts packages/session/session-format/tests packages/session/session-format-v2-to-v3/tests packages/session/session-format-catalog/tests
pnpm run test:snapshot scripts/session-snapshot-corpus.corpus.ts
```

Once the new migration edge is implemented, add its actual test paths to the focused Vitest command. Add the affected JSONL, replay, projection, and SDK tests according to the real diff; when the release Worker path changes, also add a build-artifact smoke test. Require strict migration success, an identity skeleton that stays identical, refusal of malformed and unknown required events, deterministic repeated restore, independent concurrent Stage state, correct seeded multi-hop cutoffs, and unchanged previous generations with no fallback. Report the exact commands and failures; do not infer the result of the whole test suite.

Update the [owning Agent Note](../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md) rather than adding a duplicate decision record. Keep the [release record](../session-format-status.zh.md#updating-the-record) unchanged before release; after release, update it with the verified release evidence. Audit the supersession relationships of related active records; keep independent rationale and keep archived records frozen. Update the bilingual prose together, re-record each changed pair through the repository tooling, then run the documentation checks:

```sh
pnpm run verify-translation-pairing --write docs/cookbook/adding-a-session-format-version.md
pnpm run test:docs
pnpm run doc-sync
pnpm run lint
git diff --check
```

<a id="v4-corpus-trial"></a>
### Developer V4 corpus trial migration

Use this one-shot [migration script](../../scripts/migrate-sessions-to-v4.ts) in a contributor workspace that has dependencies installed and a V4 writer. Before starting, stop DSH processes using the target root so that write locks and changing child logs do not block the migration. Run from the repository root:

```sh
pnpm run migrate:sessions-to-v4
```

The default root is `~/.dsh/sessions`. Use `--sessions-dir /path/to/sessions-copy` to name another corpus, or `--help` for usage. The default concurrency is the number of available CPUs, capped at 16; `--jobs N` accepts any positive safe integer, expert users may pass a larger value, and `--jobs 1` runs serially. The bounded queue opens only the specified number of sessions at once and does not grow with the corpus size. Every historical session goes through the normal locking, validation, and publication flow to create a V4 successor beside the unmodified source file. An existing V4 session is opened read-only; a repeated run does not convert it again. The script issues no model requests and changes no conversion or refusal rules.

The terminal reports each session's selected file, version, progress, result, and elapsed time. A single error does not stop later sessions. The final summary lists every failure and the full diagnostic log in the system temporary directory; it returns a non-zero exit status when any failure occurred. It also prints JSON and saves the same report as `summary.json` beside `migration.log`: counts by source version and result, failure-reason groups, per-item diagnostics, runtime information, and both report paths. Known diagnostics extract the event type, unexpected fields, whether a child log is involved, and the sequence number; unknown errors keep the message without inferring a cause. Attach those reports when reporting a migration problem. Sessions converted in this run and sessions that were already V4 before the run are counted separately.

During concurrent conversion, a child session publishing V4 can invalidate child-log evidence used by a parent session. Only that source-change error is retried serially once after all first tasks finish; corruption, unsupported formats, and already-held write locks are reported immediately. Completion lines keep the original input number and show the completed count separately, so out-of-order results stay readable.

<a id="final-v3-vocabulary"></a>
### Confirm the final V3 event vocabulary before releasing V4

While the released format is still V3 and the integration writer is V4, master can still add valid V3 event types. After every integration of master and before the first V4 release, compare the migration's own `RELEASED_V3_EVENT_TYPES` with the latest V3 writer commit used for that refresh. While the locally verified `origin/master` still writes V3, record its full, immutable commit id:

```sh
V3_SOURCE_REF="$(git rev-parse --verify 'origin/master^{commit}')"
pnpm run verify-v3-event-vocabulary --source-ref "$V3_SOURCE_REF"
```

The validator reads only that local commit and requires exactly matching event names. It rejects a missing V3 name, an extra copied name, and a source commit that does not write V3. In particular, do not put the V4-only `developer/message` into the frozen V3 set. Check the V3 payload, the required transforms, target admission, and consumers item by item; adding a name alone does not prove the migration complete. Add the matching migration regression before accepting a new source event.

This command does not fetch and cannot prove remote freshness. The release operator must confirm that the chosen commit is the latest V3 writer included in this integration; a stale remote-tracking ref or a passing result from an old pin is not enough. Record the verified id in the release validation. If master already writes V4, reuse the recorded final V3 commit instead of resolving the current master. After the V4 release, the V3 vocabulary remains bound to that historical source; later V4 event additions do not update it. Regular static CI does not depend on a mutable master ref.

<a id="dev-note"></a>
## Developer notes

None.
