---
kind: upgrade-guide
description: "The runtime invariant registry package and every package's `./invariant` subpath export are removed."
---

# Runtime invariant plugins are removed

[English](guide.md) | 中文

## Change

In v0.2.0-rc.2, `@deepseek-ai/dsh-invariants` provides the `ctx.invariants` service, and workspace packages such as `@deepseek-ai/dsh-session`, `@deepseek-ai/dsh-agent`, `@deepseek-ai/dsh-scope`, and `@deepseek-ai/dsh-agent-loop` publish `./invariant` companion plugins that register checks with that service. The `sdk-minimal` profile mounts five of those rows, with the ids `invariants`, `session-invariant`, `agent-invariant`, `scope-invariant`, and `agent-loop-invariant`.

The next release no longer publishes `@deepseek-ai/dsh-invariants`, `InvariantRegistry`, `InvariantInstaller`, `InvariantFailure`, or `InvariantError`, nor any `<package>/invariant` subpath. The `sdk-minimal` profile no longer contains those five rows. The emitters of `credentials/reference-updated`, `credentials/record-updated`, `authorization/settled`, and `llm/adapters-updated` isolate and log each listener failure, including errors with `code: 'INVARIANT'`, and no longer rethrow.

A `cordis.yml`, patch, or overlay that references a removed module cannot load it. A patch that names any of those five `sdk-minimal` ids logs `patch: entry <id> not found`. TypeScript code that imports a removed module or symbol no longer compiles.

## Migration

1. Remove rows whose `name` is `@deepseek-ai/dsh-invariants` or ends in `/invariant` from `cordis.yml`, `$DSH_HOME/profiles/<name>/cordis.patch.yml`, and `--patch` overlays.
2. Delete patch entries that name the ids `invariants`, `session-invariant`, `agent-invariant`, `scope-invariant`, or `agent-loop-invariant`.
3. Remove `@deepseek-ai/dsh-invariants` from your `package.json` dependencies and delete imports of it and of `<package>/invariant` subpaths. A plugin that relies on those four emitters rethrowing an `INVARIANT` failure must report that failure through its own channel.
4. Confirm that `dsh` starts the profile with no module-not-found error or `patch: entry ... not found` warning, and that `tsc` no longer reports a missing module or export.
