# Tool authoring reference

[English](adding-a-tool.md) | 中文

This page is authoritative on the conventions a model-facing tool must satisfy. For a step-by-step build of your first tool, read [building tools](../user/develop/basic/tool.zh.md). `packages/shell/tool-bash` is the production three-package example.

## Minimal shape

```ts
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'my-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'read_file',
    description: 'Read a file from disk.',          // what the model sees
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path' },
      limit: { type: 'number' },                     // optional by default
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      // args is TYPED from the schema: { path: string; limit?: number }
      // exec carries immutable identity + token; signal is the operational field
      return readFile(args.path, { encoding: 'utf8', signal: exec.signal })
    },
  }))
}
```

Registration is effect-based: disposing the plugin fiber unregisters the tool. The schema flows automatically into system-prompt assembly.

## Rules of the execute() contract

- **Arguments are already validated for you.** Before `execute` runs, `defineTool` validates the model-generated `arguments` against the unified `ParameterSchemaSpec` (types, required keys, literal constraints, unions matching exactly one branch, and nested values), so args inside `execute` match `InferArgs`. An explicit object node must declare `additionalProperties: true | false`; the implicit argument root object stays open. You still check constraints the schema DSL cannot express by hand, such as a non-empty string, a positive number, or a cross-field rule. A raw JSON Schema tool registered directly is responsible for its own input validation.
- **Registration borrows your read-only definition.** A typed in-process contribution is not a serialization boundary; do not modify its schema or replace callbacks after registration. `schemas()` materializes only the explicit model-visible projection. To hot-replace a tool, dispose its owning effect and register the replacement; mutable state inside a callback closure is still ordinary plugin state.
- **Execution identity is protected.** In one recursive traversal, the registry materializes `arguments` into detached lossless JSON, freezes that value before policy begins, and allocates an opaque `exec.token`; `callId`, `name`, `arguments`, `agent`, `token`, the required caller-held `signal`, and the optional outer transport `parent` token stay immutable for the whole dispatch. `parent` is identity only and exposes no live outer execution. Treat `args` as read-only input. Only around-dispatch wrappers receive a mutable view; such a wrapper may replace and restore the required `exec.signal` to impose a deadline, but may not remove that signal.
- **Declare and return one canonical JSON value.** `output.schema` uses `ValueSchemaSpec`, and its root may be an object, array, scalar, or null. `execute` returns only the derived value; the registry snapshots it as lossless JSON and, after validation and freezing finish, passes it to `output.render(args, value)`. A tool body must not return content blocks, and must not force callers to parse ids and fields out of natural language.
- **Throwing or returning an invalid value means `isError`.** The registry catches throws and converges schema, renderer, metadata projector, and lossless-JSON failures before observers run. Throw for infrastructure faults. Write a successful domain result into the canonical value even when it represents an undesirable state; its Native renderer can explain that state, for example a process that exited non-zero.
- **Honor `exec.signal`.** Cancel in-flight work when the signal fires.
- **Use `presentationMeta` to project persisted card data (optional).** `output.presentationMeta(args, value)` derives replayable JSON from the same canonical value. The core persists it on `tool/result` and passes it to `presentResult`, so a card that needs result-time facts — for example the applied hunks of `write`/`edit` — reproduces during replay without persisting the canonical value. Nested Code dispatch has no card, so it skips this projector.
- **Use `exec.agent` for asynchronous notification.** `agent.inject({ content, source: { kind: 'my-plugin' } })` appends persistent context that the next model request sees — this is not a wake-up (an idle agent stays idle). Declare that `kind` in your plugin through [`MessageSourceMap`](../subsystems/llm-streaming.zh.md#content-blocks-and-messages): session format V4 rejects the retired `{ kind: 'plugin', plugin: '<name>' }` wrapper at message admission. Guard against a disposed agent (try/catch).

## Long-running work

Control `run_in_background` through the producer configuration, then register the task with `ctx.jobs.start({ kind, label, owner: exec.agent, run })`. The registry fails a pre-aborted call before entering the producer body; the runtime validates that the owner and the task controller are available before `run()` starts work, and then provides the id, session fencing, generic control tools, notification, and owner cleanup. A successful background branch returns a typed canonical handle such as `{ kind: 'background', jobId }`; its Native renderer may keep human-readable prose such as `started background job bash-1`, but PTC mode must never obtain the id by parsing that text.

The spec provides a synchronous `cancel`, a `done` that settles after resource cleanup and never rejects, and either a pull-based `output` source that the registry pumps into the job output ring or a push of appends received through a starter `JobHandle`; `dsh-tool-jobs` renders the model's consumptive reads from that ring. A pre-aborted call is a failure, because no task exists and its id cannot satisfy the success output schema. After `ctx.jobs.start()` publishes an id, use the task's own cancellation signal rather than `exec.signal`: cancelling the outer call afterwards only stops waiting for this call and does not terminate work already published; that lifecycle belongs to `job_kill`, owner dispose, and service teardown. Foreground work stays coupled to `exec.signal`. For streaming producer examples and the full contract, see the [background jobs runtime reference](../../packages/jobs/jobs/README.zh.md) and `dsh-tool-bash`.

<a id="execution-policy-and-observation"></a>

## Execution policy and observation

As far as possible, do not build deployment policy into a tool. Use `tools/pre-execute` for extensible allow/deny/ask policy (see the [permission gate example](extension-cookbook.zh.md#a-hook-plugin-permission-gate-example)); use `ctx.tools.guard()` for a final monotonic denial that later listeners cannot undo; use `tools/execute` to add deadlines, retries, or metric collection to dispatch; use `tools/post-execute` to replace the presented content or the return value, block a result, or attach model-visible context; use `tools/result` to observe the immutable normalized result without changing it. Replacing content does not block programmatic access to `value`; a confidentiality policy masks or replaces that value. A sandbox implementation may also run inside the tool's executor implementation; the [`dsh-tools` README](../../packages/core/tools/README.zh.md#extension-points) defines each extension point's input, ordering, return value, and failure behavior.

## PTC mode reaches your tool automatically

In [PTC mode](../../packages/core/tools/README.zh.md), every visible registered tool is callable through `await tools.<name>(args)` with no extra integration. The generated `ToolArgsMap` and `ToolOutputMap` derive exact argument types and canonical return types from the same schemas, and the call re-enters the normal execution pipeline. A successful call resolves to the final canonical JSON value after policy handling, not to rendered Native content. A failed call rejects with a real `ToolCallError`; a program can inspect only its `name`, `toolName`, and human-readable `message` and cannot obtain internal error codes or the failure union.

Design `output.schema` as a practical programmatic API: return handles and fields directly; when a scalar, array, or null really is the result, allow the corresponding root type; put the human-facing explanation in `output.render`. Intermediate values exist only during execution and are neither persisted nor truncated against prompt limits, and they have no byte cap, so honestly declared collection bounds and process memory still matter. Only the outer `run_code` log/result is subject to configurable output caps and the model-facing spill pipeline.

## How a tool renders in the UI

A tool's `output.render` returns model-visible content; its **UI card** is a separate concern, declared through a pure presentation projection plus optional `presentCall`/`presentResult` methods. Design these together with the canonical value. A tool with no UI presentation method falls back to the generic card (title = tool name, raw args as input).

Both methods return a **`card`-tagged render intent** — choose the card type that matches your tool's behavior:

- `presentCall(args)` → a `ToolCallView` (the PENDING card):
  - `{ card: 'generic', title, kind?, rawInput?, content?, locations? }` — the default. Set `kind` for an icon (`read`/`search`/…); set `locations: [{ path, line? }]` to mark the files the tool touches so a capable editor can follow or jump.
  - `{ card: 'terminal', title, description?, cwd? }` — your call is itself a shell command. `title` is the command, and `description` renders above the terminal card. (tool-bash.)
  - `{ card: 'diff', title, diffs, locations? }` — your call creates or modifies files. `diffs: [{ path, oldText, newText }]` (`oldText: null` for a new file) renders as an inline diff card. (tool-fs `write`/`edit`.)
- `presentResult(args, { content, isError, meta? })` returns the completed card:
  - `generic` supplies an optional title and content.
  - `terminal` supplies the raw output and optional exit metadata; each UI renders the corresponding view or its fallback according to its own capabilities.
  - `diff` supplies the applied hunks, normally derived by `output.presentationMeta` and carried through the persisted `result.meta` so replay can reproduce them. A mutation tool keeps the diff result, because the completed view replaces the pending card.
  - `read` supplies a completed file window rebuilt from the persisted `result.meta`: the file `path`, a 1-based `offset`, the returned `lines` (each line keeping its file line number), `totalLines`, and an optional `lang` highlighting hint; a UI without `read` capability falls back to the raw result content. There is no `read` call view — the pending state of a read call stays a generic card, because the content exists only after `execute`. (tool-fs `read`.)
  - `search` supplies discovery results rebuilt from the persisted `result.meta`: matches grouped by file (`shape: 'matches'`, grep) or a flat path list (`shape: 'paths'`, glob), plus `truncated`/`total` so a UI never presents a truncated result as a complete one. This view carries no result text (a UI without a search card falls back to the raw result content), and there is no `search` call view — the pending state of a discovery call stays a generic card, because matches exist only after `execute`. (tool-fs-search `grep`/`glob`.)
  - `web` supplies a completed web retrieval, distinguished by `kind: 'search' | 'fetch'` (structured search sources or a fetch summary), derived from `result.meta`; it carries no body copy, so a UI without `web` capability falls back to the raw result content. (tool-web `web_search`/`web_fetch`.)

Hard rules (violating them causes problems):

- **Pure functions.** These methods run during live streaming and during session-log replay, so they must be pure functions of `args` (plus result) — no I/O, no reading session state, no clock or random numbers. Derive diffs from args (`write` uses `oldText: null`, because the presenter at call time has no previous file content); the session context is supplied by the UI adapter, not by the tool. If you find yourself wanting to read the file's previous content or the working directory inside `presentCall`, stop: that belongs to persisted result metadata or the adapter, not to the presenter.
- **UI formatting does not enter the model result.** Fenced ` ```console ` blocks, diffs, and relativized paths must not enter the canonical value or the Native content merely to serve the UI. `output.render` owns the model-visible prose; `presentationMeta` and the card presenters own replayable UI state. The `terminal` result view carries the raw output, and the adapter adds fallback formatting as needed.
- **`defineTool` soft-validates the presentation paths.** Malformed arguments or arguments from an older log make the wrapper return `undefined` (the generic fallback) instead of throwing — presentation must never crash replay.

The neutral vocabulary is defined in `dsh-tools`; a tool never imports UI or transport types. A consumer of that API maps each `card` to its own view. For the design and rationale, see the [render intent union Agent Note](../../.agents/notes/implemented/architecture/2026-07-02-tool-render-intent-union.zh.md); `dsh-tool-fs` (generic/diff) and `dsh-tool-bash` (terminal) are the reference implementations.

## Web Client presentation

The built-in Web Client does not consume `presentCall` or `presentResult`. The Session `page` and `follow` transports ship the raw `tool/call` and `tool/result` events, including the persisted `result.meta`. A Client plugin registers its own wire tool names in the keyed slot `tool.call.toolview` and derives component props from the `ToolCallBlock` arguments, content, error, metadata, the existing PTC dispatch `parentCallId`, and Session path facts. Plugins validate these wire values locally and let malformed or unsupported input fall back to the generic row.

When an existing Web card needs a bounded structured result fact that model-visible content cannot preserve losslessly, use `output.presentationMeta(args, value)`. Do not store React props or pre-selected cards in metadata, do not import Host tool implementations into the browser bundle, and do not build a second Client presenter registry. Defining only a Host presentation method does not add a dedicated Web card. The [client-derived tool presentation Agent Note](../../.agents/notes/implemented/architecture/2026-08-23-client-derived-tool-presentation.zh.md) sets out the ownership, fallback, and parity requirements.

## Verification

Follow the [repository testing policy](../testing.zh.md) and the owning package's test documentation. A shipped model-facing or UI-facing change must provide the assembled coverage those documents require.
