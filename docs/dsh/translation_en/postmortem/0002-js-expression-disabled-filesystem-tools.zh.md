# Postmortem 0002: filesystem snapshot tools permanently disabled

[English](0002-js-expression-disabled-filesystem-tools.md) | 中文

Status: resolved

## Summary

The ACP (Agent Client Protocol) example tried to enable the filesystem plugins conditionally through `disabled: !!js ...`, but Cordis evaluates JavaScript expressions only inside a plugin's `config`. The raw expression object is truthy, so the filesystem stack stayed disabled at all times. Snapshot refresh then accepted the `UNKNOWN_TOOL` results as the new expected output. The fix switched to an explicit filesystem overlay and added a static config guard and a snapshot-result guard.

## Overview

The default ACP composition deliberately enables only bash, because its sandbox cannot constrain in-process filesystem providers. The filesystem snapshot scenarios still need `read`, `write`, and `edit`, so those plugins were placed in the default `cordis.yml` with a `disabled` expression intended to enable them only under a full-permission launch and in snapshot mode.

The Cordis Include resolves each `!!js` scalar into an expression object. The Loader interpolates a plugin's `config` recursively, but reads entry metadata such as `disabled` directly. Every filesystem entry therefore saw a truthy object and stayed disabled in every mode.

## Impact

Seven filesystem scenarios and one mixed workspace-editing scenario called tools that are absent from the registry. Their structured session logs carried `ToolNotFoundError` (code `UNKNOWN_TOOL`), and stdout rendered the generic failed-tool card. The snapshot suite passed, because both the structured session log and the generic failed-tool card rendered to stdout matched the refreshed fixture (test fixture data); it proved deterministic replay of a regression, not the correctness of filesystem behavior.

The restricted default mode that actually ran gained no unintended filesystem access. Fixing the interpolation carelessly would have introduced exactly that risk: permission presets update the bash sandbox and approval state at runtime, but they cannot mount, unmount, or constrain the filesystem stack.

## Timeline

- PR (Pull Request) #261 consolidated the ACP composition and refreshed the filesystem snapshots, introducing the conditional filesystem entries at the same time.
- All unit tests, coverage, snapshots, docs, build, and hygiene checks passed.
- Review of the refreshed filesystem expected output found the generic failure card and the structured `UNKNOWN_TOOL` results.
- A real Loader launch confirmed that every `disabled` value was still an expression object and that no filesystem fiber had been created.

## Root cause

The implementation assumed `!!js` applies to a whole Loader entry. In fact only `entry.options.config` uses it: `Entry._resolveConfig()` interpolates that field, while `Entry.disabled` tests `entry.options.disabled` directly, without interpolation. The YAML tag is syntactically legal, so the load produces no diagnostic.

The snapshot framework treats any deterministic transcript (text record) as valid behavior. The header pin validated the composed tool schema, but the filesystem scenarios shared the pin from the default composition, so they never independently proved that the tools they needed were registered. The refresh rewrote the expected stdout and session logs before any semantic assertion could reject the missing tools.

## Guards added

- The filesystem scenarios launch `fs.cordis.yml`: an explicit, pinned full-permission overlay with a matching replay configuration and its own request-header class.
- [`AGENTS.md`](../../AGENTS.md) and the [Cordis primer](../cordis-primer.zh.md#loader-configuration) state plainly that `!!js` is valid inside a plugin `config` and an entry's `disabled`; other entry metadata stays literal, so conditional composition uses an overlay.
- `verify-cordis-config` parses the Cordis YAML in the repository and rejects expression nodes in Loader entry metadata, including include patches and inserted entries.
- `dsh-session-snapshot` rejects structured `UNKNOWN_TOOL` results in fresh runs and in committed session fixtures, so they cannot be committed as expected output.

## Lessons

- A syntactically accepted config value is not necessarily evaluated at that position; document and verify exactly which fields are interpolated.
- A snapshot refresh is fixture production, not a correctness review. Semantically impossible results, such as a missing registered tool, need assertions independent of the expected output.
- Permission control should describe only the capability it actually governs. Filesystem access at composition time cannot safely follow a runtime bash-only preset.
