# 子系统

[English](README.md) | 中文

One page per subsystem of the DeepSeek Harness: what it is, the data structures it moves, and — where a `ctx` service or event scope backs it — a generated **Cordis API** section carrying its service and event reference. This folder complements [architecture.md](../architecture.zh.md), which describes *behavior* across subsystems (the service map, the session/turn/step lifecycle, the event taxonomy); each page here is the reference for one subsystem's vocabulary and wiring.

| 页面 | 负责内容 |
|---|---|
| [boot.md](boot.zh.md) | Current-profile plugin management and launcher reload coordination |
| [core.md](core.zh.md) | how `packages/core` controls the agent loop: the package-by-package loop description, agent creation and ownership (`AgentHandle`), the `Agent` handle's delivery/cancellation/interception contracts, and the repo-wide type patterns (`…Map → derived-union`, branded ids) |
| [llm-streaming.md](llm-streaming.zh.md) | the `packages/llm` conversation types — `Message`/`ContentBlock`, the assembled model request, the `StreamChunk` wire protocol and adapter contract, `BlockAssembler`, and the `LlmAdapter` provider contract |
| [token-meter.md](token-meter.zh.md) | immutable scalar and positional replay measurements with consumed-log revisions |
| [scope.md](scope.zh.md) | scoped registration identity, dispatch carriers, and the owned `Scope` context |
| [typert.md](typert.zh.md) | Remote invocation descriptors, lookup/Context declarations, Typert registries, and the Host Gateway/Client API boundaries |
| [goal.md](goal.zh.md) | persisted goal identity, lifecycle snapshots, activation, change records, and Round attribution |
| [schedule.md](schedule.zh.md) | Host-owned reminder records, durable transitions, active and ended views, and ordinary-conversation delivery |
| [todo.md](todo.zh.md) | the todo package's whole-list item type, durable event ownership, and projection |
| [deliverables.md](deliverables.zh.md) | what a turn hands to the user: `PresentedFile` deliveries from `present` and the Host-served `WorkspaceChangesSummary` of changed files derived from git snapshots |
| [commands.md](commands.zh.md) | the human-command registry service: definitions, adapter discovery, direct invocation, results, and parsing views |
| [session.md](session.zh.md) | the full `SessionEventMap` variant catalog, `TurnEndReason`, `deriveMessages()`, execution enclosure, and standalone events |
| [working-directory.md](working-directory.zh.md) | Session execution directories, durable changes, recovery, and user context |
| [worktrees.md](worktrees.zh.md) | Experimental Git branch and checkout creation under existing permissions |
| [persistence.md](persistence.zh.md) | the durability seam: `SessionPersistence`, the JSONL provider, `session/flush`, crash recovery, `SessionHeader` |
| [settings.md](settings.zh.md) | the user-settings seam: `SettingsNamespace` registration, layered resolution (defaults → composition `base` → user document), owner scopes, hot commits |
| [credentials.md](credentials.zh.md) | the credentials seam: `CredentialRef` references (never values) in configuration, per-operation resolution, UI-safe `CredentialInfo`, provider source layers |
| [session-query.md](session-query.zh.md) | logical records, bounded exact-event reads, relationship traces, semantic filters/documents, and full-text result pages |
| [feedback.md](feedback.zh.md) | lifecycle-bound per-message feedback records, optimistic versions, sidecar persistence, and the Host Remote contract |
| [session-title.md](session-title.zh.md) | durable title snapshots, cited source-message seqs, and the asynchronous provider contract |
| [session-reference.md](session-reference.zh.md) | structured cross-session references: `SessionReferenceInput`/`Candidate`, prepared message contexts, the stable error taxonomy |
| [system-prompt.md](system-prompt.zh.md) | per-assembly context, tool-provider results, prompt sections, and cooperative assembly |
| [tools.md](tools.zh.md) | `ToolDefinition` full fields, the schema DSL, `ToolExecution`/`ToolResult`, tool-presentation UI types, and the guarded execution pipeline |
| [mcp.md](mcp.zh.md) | external MCP connections, scoped tools and resources, server instructions, protocol results, and configuration ownership |
| [user-questions.md](user-questions.zh.md) | the UI-backed human question/answer seam: `AskUserQuestionRequest`, answer/options vocabulary, provider API, error taxonomy |
| [approval.md](approval.zh.md) | the one-shot user-approval seam: `ApprovalRequest`, `ApprovalOutcome`, per-session policy, audit events, and answerer contracts |
| [office-to-pdf.md](office-to-pdf.zh.md) | authorized Office-to-PDF conversion, native/WASM engines, and bounded shared reuse |
| [attachment.md](attachment.zh.md) | durable image identity and metadata, validation inputs, verified reads, and the `AttachmentStore` seam |
| [shell.md](shell.zh.md) | the shell executor seam: `ShellExecRequest`/`Spec`, `ShellRunResult`, background `ShellProcess` handles |
| [subprocess.md](subprocess.zh.md) | the subprocess seam: fully-explicit `SubprocessSpawnSpec`, offset-based output readers, unclassified `SubprocessOutcome`, and the managed `DSH_*` environment vocabulary |
| [ssh.md](ssh.zh.md) | the POSIX SSH connection and remote filesystem, subprocess and sandbox providers |
| [terminal.md](terminal.zh.md) | persistent terminal ids, backend/session contracts, send readiness, bounded reads, and owner-visible snapshots |
| [sandbox.md](sandbox.zh.md) | per-session policy resolution and the process-confinement seam: file-effect modes, execution/provider policies, `ConfinedArgv`, enforcement and fail-closed errors |
| [ptc-runtime.md](ptc-runtime.zh.md) | the PTC execution seam: `PtcRunRequest`/`Result`, binding namespaces, captured logs, the `PtcRunFailure` taxonomy |
| [computer-use.md](computer-use.zh.md) | exclusive named computer-use provider registration and Cua Driver integration choices |
| [browser-use.md](browser-use.zh.md) | exclusive named browser-use registration, provider choices, and per-Session browser ownership |
| [extensions.md](extensions.zh.md) | versioned dynamic Cordis Plugins and Packages, Host/Client activation, approval, runtime inspection, and lifecycle teardown |
| [filesystem.md](filesystem.zh.md) | the filesystem seam: `FsTarget`, read/write/edit outcomes, observed-file state, `FsErrorCode` |
| [lsp.md](lsp.zh.md) | the LSP navigation seam: `LspQueryRequest`/`Result`, `LspProvider`/`Service`, four operations, `LspError` |
| [skills.md](skills.zh.md) | the skill service: discovery priority, `SkillSummary`/`SkillDefinition`, session-prefix catalog, model-facing `skill` loading |
| [compaction.md](compaction.zh.md) | the compaction seam: the `compaction/*` session events, `CompactionResult`, the `CompactionEngine` interface |
| [subagent.md](subagent.zh.md) | the subagent seam: the named-provider registry, `SubagentStartRequest`/`Result`/`Run`, the split between start-time and runtime capabilities |
| [voice-input.md](voice-input.zh.md) | experimental named recognizers, transient audio, and revision-guarded draft insertion |
| [translation.md](translation.zh.md) | experimental login-free text translation and explicit Provider requests |
| [agent-team.md](agent-team.zh.md) | Agent Teams: implicit Lead identity, named continuable teammates, direct peer inbox delivery, and shared task DAG |
| [claude-code-mods.md](claude-code-mods.zh.md) | Claude Code mods through the experimental bridge: every event, `$` member, chain rule, drawing feature, and example mod that differs from Claude Code |
| [web.md](web.zh.md) | the web access seam: `WebSearchRequest`/`Result`, `WebFetchRequest`/`Result`, `WebFetchBody`, provider availability, `WebError` |
| [spill.md](spill.zh.md) | the spill storage seam: `SaveTextSpill`, `SpillOwner`/`SpillSource`, `SpillRef`, the branded `SpillLocator` |
| [workflow.md](workflow.zh.md) | the workflow seam: `WorkflowStartRequest`, `WorkflowMeta`, `WorkflowRun`/`Result`, the `workflow/*` event payloads, `WorkflowError` fatality |
| [jobs.md](jobs.zh.md) | the background-job runtime: branded `JobId`s, the producer contract, consumer views, and `ctx.jobs` service behavior |
| [permission-presets.md](permission-presets.zh.md) | the permission-preset layer: `PresetSpec`/`PresetOption`, the derived `custom` state, the log-only `permission/preset` event |
| [plan.md](plan.zh.md) | plan mode: the log-only `plan/mode` state, pending-selection flush, `PlanModeConfig`, the `exit_plan_mode` review arc |
| [web-server.md](web-server.zh.md) | the HTTP carrier: `WebRouteKind`/`WebRoute`, match order, the claimable fallback seat, index render taps |
| [webhook.md](webhook.zh.md) | authenticated provider deliveries, arbitrary programmatic rules, and fire-and-forget Workspace Session creation |
| [storage.md](storage.zh.md) | the storage subsystem: the backend contract (`StorageBackend`), `StorageForms`, `DomainSpec`/`Domain`, `domain/changed` |
| [workspace.md](workspace.zh.md) | the workspace registry: `Workspace`/`WorkspaceId`, registration and resolution, the relationship to the session `cwd` |
| [web-client.md](web-client.zh.md) | the browser architecture: boot, Remote communication, paired Client models, UI adapters, Conversation assembly, Slots, and reconnect semantics |
| [client-modules.md](client-modules.zh.md) | the web plugin table: `dsh.client` declarations, `WebBootGraph` wire-format composition, the bundle route and index taps |
| [slots.md](slots.zh.md) | typed Web UI composition: declaration ownership, cardinality and scope, framework and feature injection, props derivation, and the shipped hierarchy |
| [client-resources.md](client-resources.zh.md) | the client resource model: `dsh-resource://<type>/…` addresses, protocol providers and `ResourceProtocolMap`, the `useResource` global hook and its states, pins and release |
| [sidebar-right.md](sidebar-right.zh.md) | the right Sidebar: resource and navigation addresses, tab-type registration and routing, the `ctx.sidebarRight` navigation service, the pane-tab Slots and owner props, the resource model, and the Workspace Files service |
| [conversation.md](conversation.zh.md) | target-neutral Session-event assembly: Context identity, Location data, replay paths, view builders, and target-owned render nodes |
| [session-projection.md](session-projection.zh.md) | the projection seam: `SessionProjectionMap`, the pure `ProjectionDefinition` unit, `ProjectionSnapshot`'s consistent cut, the change feed |
| [session-telemetry.md](session-telemetry.zh.md) | the outbound session-reporting capability seam: `SessionTelemetryRecord`/`SessionTelemetrySeverity`, the `SessionTelemetrySink` contract, and the `session-telemetry/record` redact waterfall |
| [otel.md](otel.zh.md) | Shared ordinary-event and Session-log OTLP channels |
| [product-telemetry.md](product-telemetry.zh.md) | Explicit product analytics submission and OTLP/HTTP transport |

> Type declarations and their JSDoc on these pages are source-equivalent and drift-checked by `pnpm run verify-type-equiv` (see [development.md](../development.zh.md#documenting-types-verbatim-ts-type-equiv)). Ordinary blocks preserve complete declarations; `public-api` blocks preserve body-stripped public class declarations. Cordis services and events use each page's generated **Cordis API** section.
