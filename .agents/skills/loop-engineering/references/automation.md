# Automation — where the capture attaches

Read this only when the user wants the **observation** automated. The skill itself needs no code; this reference is the phase-2 blueprint.

## The docking points (verified in this repository)

| Hook | Signature | Can | Cannot |
|---|---|---|---|
| `tools/pre-execute` | `(exec, next) => { kind: 'allow' \| 'deny' \| 'cancel' \| 'ask' }` | block, cancel, ask | see the result |
| `tools/post-execute` | `(exec, result, next) => result` | observe, replace the result | see the model's raw call text |
| `llm/stream` | `(options, next) => AsyncIterable<Chunk>` | wrap the stream, see usage | re-parse a call that already failed |

Sources: `packages/plugin/plugin-hooks/src/index.ts`, `packages/crew/crew-plugin/src/plugin.ts` (usage accounting at `llm/stream`).

## The blind spot that decides the design

The observed failure — `tool input is invalid JSON` — happens while the provider stream is being assembled. **No tool call exists**, so `tools/post-execute` never fires for it. A capture built only on `post-execute` will be blind to exactly the class the user complained about.

Three consequences:

1. **`post-execute` capture is necessary but not sufficient.** It covers tool errors, denials and slow calls. It does not cover malformed calls, aborted turns or context loss.
2. **The malformed-call class needs either** a `llm/stream` observer that records the terminating error, **or** a post-hoc read of the session log. The log is `session.v4.jsonl.zstd` under `<pmh-home>/sessions/<workspace>/<uuid>/` — zstd-compressed, so a reader needs a zstd implementation.
3. **Do not put the repair in the observer.** An observer that silently fixes the payload hides the lesson. Record, then let the loop decide.

## Record schema

One JSON object per line, append-only, next to the session file:

```json
{
  "at": "2026-10-28T16:41:02.113Z",
  "session": "b09de228",
  "tool": "Grep",
  "argHash": "sha256:…",        // salted per session, never the raw arguments
  "argsBytes": 312,
  "outcome": "error",            // ok | error | blocked | cancelled
  "durationMs": 12,
  "class": "model",              // optional: filled by the classifier, not the hook
  "errorKind": "invalid-json"    // provider-independent token
}
```

Rules:

- **No content.** Name, hash, size, outcome. Arguments may contain credentials or personal data.
- **Salt per session.** A small argument domain (`{"path":"a"}`) re-identifies without a salt.
- **Append-only, no rewrite.** Correlation is done at read time, not at write time.
- **Failure to log must not fail the tool call.** A ledger that breaks the harness is worse than no ledger.

## Phase-2 build plan

| Step | Artefact | Done when |
|---|---|---|
| 1 | `packages/plugin/loop-ledger/` with `apply(ctx, config)` | the plugin loads, registers no tools, and logs one line at start |
| 2 | `post-execute` observer + JSONL writer | a test proves one `ok` and one `error` record with the schema above |
| 3 | `pre-execute` observer for `blocked` | a denied call produces `outcome: "blocked"` |
| 4 | Error classifier (pure function, no I/O) | a table-driven test maps sample messages to the six classes |
| 5 | Reader (`pmh loop report` or a script) | reads the JSONL, groups by `(tool, class, errorKind)`, prints counts |
| 6 | Lesson proposal | the reader emits at most three draft lessons with evidence ids |

**Test cases that can go red** (a green test that cannot fail is not a test):

1. A successful call writes exactly one record with `outcome: "ok"`.
2. A throwing tool writes one with `outcome: "error"` and does not change the thrown error.
3. A denied call writes `blocked` and the call is still denied.
4. Two different sessions produce different `argHash` for identical arguments (salt works).
5. The same call within one session produces the same `argHash` (stability).
6. A write failure is swallowed and the tool result is unchanged.
7. The classifier returns `model` for `tool input is invalid JSON`, `environment` for a sandbox denial, `flake` for a retry-pass.

## What must not be automated

- Publishing a lesson, changing a check, or editing the classifier's rules — those are the evaluation surface.
- Retrying a malformed call transparently. Record it; a human or the loop decides whether to retry.

## Honest status

The blueprint above is **specified, not built**. In the session that produced this skill, `bun` and `tar` could not be started (the file sandbox denied the subprocess pipe), so neither the session log could be read nor a test run. Nothing in this reference is measured; it is derived from the source files named above and from `docs/design/harness-generationen.md`. When the plugin is built, this section is replaced by the run that proved it.
