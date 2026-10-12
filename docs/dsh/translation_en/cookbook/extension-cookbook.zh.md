# Cookbook: extension plugin shapes

[English](extension-cookbook.md) | 中文

Reference patterns for harness extensions. The snippets omit imports and helper implementations and cannot be copied and run as they are. For concrete authoring paths, see the [package checklist](adding-a-package.zh.md), the [first tool tutorial](../user/develop/basic/tool.zh.md), the [tool reference](adding-a-tool.zh.md), the [LLM adapter guide](adding-an-llm-adapter.zh.md), and the [session format version tutorial](adding-a-session-format-version.zh.md); the system and extension-point map is the [architecture document](../architecture.zh.md).

## Tool plugins

Tools register on `ctx.tools`. For annotated `defineTool` examples (typed `execute` arguments, result construction, `run_in_background` patterns), see [adding-a-tool.md](adding-a-tool.zh.md) — that guide is the source of truth for tool definitions. `ctx.tools.register()` also accepts a raw JSON Schema `ToolDefinition` directly (which is how MCP-sourced tools arrive); `defineTool` is the typed helper first-party tools use.

<a id="a-hook-plugin-permission-gate-example"></a>

## Hook plugins (a permission gate as the example)

This permission gate is one example of a hook plugin. It returns a typed decision from the `tools/pre-execute` gate to allow or deny one call; sandbox, permission, and plan-mode plugins can all use that extension point. A hook plugin can also intercept other extension points and is not equivalent to a permission gate. A "native hook" is an ordinary Cordis plugin running on an interception point; it needs no external protocol.

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'

declare function isAllowed(exec: ToolExecution): Promise<boolean>

export const name = 'permission-gate'

export function apply(ctx: Context) {
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!(await isAllowed(exec))) {
      return { kind: 'deny', reason: 'Denied by policy.' }
    }
    return next()
  })
}
```

This waterfall (waterfall event) is a reorderable policy layer. Use `ctx.tools.guard()` when an invariant needs a monotonic final denial; use `tools/execute` when a plugin needs to wrap the dispatch lifecycle (timeouts, retries, metrics; only `exec.signal` is replaceable); use `tools/post-execute` for explicit result transformation; use `tools/result` for restricted observation of the immutable final result. For the selection rules, see the [tool authoring guide](adding-a-tool.zh.md#execution-policy-and-observation).

## UI plugins

A UI plugin combines the persistent `session/event` record (Assistant settlement, turn and step boundaries, and tool activity) with the transient `agent/assistant-stream` frames used for live token presentation, and drives input back through `agent.followup()` / `agent.steer()`. If a browser plugin should contribute business rows to the built-in Web Client, it registers a `ConversationNodeDefinition` and a keyed Chat renderer; the exact contract is in the [Conversation subsystem reference](../subsystems/conversation.zh.md).

```ts
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'

declare function render(text: string): void
declare function onUserInput(handler: (text: string) => void): void

export const name = 'my-ui'
export const inject = ['agents']

export function apply(ctx: Context) {
  ctx.on('agent/assistant-stream', ({ frame }) => {
    if (frame.type === 'chunk' && frame.chunk.type === 'text-delta') {
      render(frame.chunk.text)
    }
  })
  onUserInput(text => ctx.agents.get(brandString<SessionId>('client-session'))?.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })))
}
```

## External protocol drivers

A *protocol driver* connects a protocol peer to `ctx.agents`; it can serve a UI or an automation client. A stdio driver owns stdout, creates or resumes agents through a factory, and maps protocol requests to `followup()` or `cancel()`. A low-level prompt request returns its persistent enqueue receipt; it does not obtain a result by correlating a `MessageId` with `turn/end`. Whole-agent status is published separately. An automation method can wait from the receipt to the next idle and summarize that explicitly owned interval; a UI will normally keep observing the open-ended event stream instead. Tear down the agent through `AgentHandle.dispose()` so that dispose (disposal) reaches full quiescence.

[`packages/acp/acp`](../../packages/acp/acp) is the complete automation-only example: it serves fresh text sessions over ACP (Agent Client Protocol) JSON-RPC stdio, emits committed assistant text, and registers a one-shot machine permission responder for the agent it owns. Its [README](../../packages/acp/acp/README.zh.md) defines the exact methods, event order, and lifecycle contract.

```ts
import type { Context } from '@deepseek-ai/cordis'
import { expandAssistantStream } from '@deepseek-ai/dsh-llm'

export const name = 'my-protocol-bridge'
export const inject = ['agents', 'sessions', 'sessionPersistence']

export function apply(ctx: Context) {
  // Publish every committed Assistant text delta to the client.
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
      for (const { chunk } of expandAssistantStream(event.data.stream)) {
        if (chunk.type === 'text-delta') {
          // sendToClient({ kind: 'message_chunk', text: chunk.text })
        }
      }
    }
  })
  // Inbound "prompt": create/resume an agent, feed it, and return its enqueue receipt.
  // Whole-agent status is a separate notification; no turn end belongs to this prompt.
  // Teardown reaches quiescence via AgentHandle.dispose() (stop + await exit).
}
```

## Runnable composition examples

Shipped applications provide profile layers through `packages/bundle/*/cordis.patch.yml`, and the product `dsh` launcher serves Web, ACP, SDK, and one-shot headless execution through named profiles. Optional user overlays live in `apps/cli/config/examples/`; profile integration tests live in `apps/cli/tests/profiles/`, while package-specific Loader compositions stay in the owning package's test directory.

<a id="the-feature--mechanism-map"></a>

## Feature → mechanism map

Every product feature maps to a listener on a documented extension point — which is what makes the microkernel claim verifiable ([microkernel reference](../architecture.zh.md)). Not one line modifies the loop itself.

`system-prompt/assemble` is an expert-cooperative whole-assembly transform: the assembly it returns is authoritative, so the listener author is responsible for preserving the contributions of an active PTC mode and of structured output protocols. For tool filtering that must keep presentation, lookup, and execution aligned, prefer `ctx.tools.restrict()`.

| Product feature | Plugin mechanism |
|---|---|
| Hook system (user-level + project-level) | Listeners on `agent/created`, `agent/pre-step`, `agent/request`, `tools/pre-execute`, `tools/post-execute`, and `agent/turn-stopping`; waterfalls return typed decisions, and `agent/turn-stopping` can trigger the next step through steering; the `dsh-hooks-claude-code` / `dsh-hooks-codex` bridges map hook config files onto those extension points |
| `/goal` | `ctx.goals` manages persistent state, `dsh-goal-round-driver` dispatches same-session Rounds through the public `Agent`, and separate command/tool producers provide human and model control |
| `/loop` | `followup()` the next iteration on the `turn/end` session event; or force continuation |
| Dynamic workflows | `ctx.workflowEngine` + the PTC workflow engine + the `workflow` tool; structured in-process subtasks enforce output through scoped prompt/tool registration, monotonic tool guards, final `tools/result` submission (including the outer `run_code`), and the monotonic `concludeTurn()` marker of structured output execution |
| Queued messages + steering | The core `Agent.followup()` / `Agent.steer()` |
| Context compaction (automatic + manual) | The `ctx.compaction` seam + `dsh-compaction-basic`; the automatic pressure check runs on the serial `agent/pre-step`, the standard overflow recovery mechanism runs on `agent/request-error`, and manual callers use the same compaction service ([compaction reference](../../packages/compaction/compaction/README.zh.md)) |
| System prompt configurability | `ctx.systemPrompt.section()`, with ordering and scope-local overrides |
| AGENTS.md (root) | A section provider that reads that file |
| AGENTS.md (subdirectory, triggered on demand) + file-change notification | Call `agent.inject()` from a watcher / tool-result listener |
| Built-in tools | `ctx.tools.register()`; schemas flow into assembly automatically — the `dsh-tool-*` family (bash, fs, web, subagent, todo) is the shipped example |
| ToolSearch / progressive disclosure | Replace a scoped `ctx.tools.restrict()` registration when the visible set changes; the registry keeps presentation, lookup, and execution aligned |
| Tool deadlines / retries / metrics | Wrap the core dispatch with `tools/execute`; the wrapper can replace `exec.signal`, delegate execution, and inspect the normalized result within the same lexical lifecycle |
| Final tool-result metrics / audit / capture | Observe the immutable authoritative result with `tools/result`; use `tools/post-execute` only when a plugin needs to transform the result or attach context |
| Monotonic terminal-turn policy | Call `ToolExecution.concludeTurn()` from a successful terminal tool; later tool calls in the same response can still be blocked by a guard, and the loop stops after that step |
| Subprocess sandbox (landlock / sandbox-exec) | Use a `ctx.sandbox` backend through `dsh-bash-sandbox`; capability-level denials use `tools/pre-execute` |
| Permission system / AskUserQuestion | Return `ask` from `tools/pre-execute` and answer through `ctx.approval`; register a separate model-facing ask tool for ordinary user questions |
| Plan mode | [`@deepseek-ai/dsh-plan-mode`](../../packages/plan/plan-mode/README.zh.md): logged `plan/mode` state, a `plan:policy` guidance section, a `/plan [message]` entry, `/plan off` to exit directly, and a user-reviewed `exit_plan_mode` exit; enforcement stays on the separate sandbox/approval axes |
| Subagent delegation | The `ctx.subagents` provider registry (`dsh-subagent-spawn-in-process`/`dsh-subagent-fork-in-process`/`dsh-subagent-acp`/`dsh-subagent-codex`/`dsh-subagent-claude-code`/`dsh-subagent-dsh-sdk`) + `dsh-tool-subagent` to expose one configured provider to the model |
| MCP | One plugin per server: discover tools → `ctx.tools.register()` |
| Skills | Section + tool registration; inject the skill content through `inject()` at invocation time |
| Memory | Section provider + tools |
| Scheduled jobs (cron) | A plugin registers a model-facing scheduling tool; when a timer fires it delivers through `followup(…, {source: {kind: 'schedule'}})` |
| UI (GUI; CLI output is JSONL) | Listen for live chunks on `agent/assistant-stream` and for persistent settlement, boundaries, and tool activity on `session/event`; input → `followup()` |
| Web Client Chat business nodes | Register a `ConversationNodeDefinition` and a `conversation.chat.node` keyed renderer |
| Telemetry / replayable traces | `session/event` → JSONL; replay = `sessions.create(id, { seed })` |
| Model adapters | Register an `LlmAdapter` subclass through `registerAdapter` (`dsh-llm-deepseek`, `dsh-llm-pi-ai`) |
| Plugin hot reload | Every registration is a `ctx.effect` → the HMR shipped with the repository works directly |
