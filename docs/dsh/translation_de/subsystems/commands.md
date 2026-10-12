# Menschliche Befehle

English | [中文](commands.zh.md)

Der Registry-Service für menschliche Befehle aus [`dsh-commands`](../../packages/interaction/commands). Interaktive Adapter verwenden ihn, um plugin-eigene Befehle für einen exakten Agent zu entdecken und direkt auszuführen, ohne eine Modellnachricht zu erzeugen. Die [historische Agent Note zu Befehlen](../../.agents/notes/archived/feature/2026-07-19-plugin-command-registration.md) hält die Begründung zu Dispatch und Lebenszyklus fest; das [Paket-README](../../packages/interaction/commands/README.md) besitzt Komposition und Einschränkungen.

Source: [`packages/interaction/commands/src/index.ts`](../../packages/interaction/commands/src/index.ts)

## Eingabemetadaten

Der Service legt einen optionalen Deskriptor für unstrukturierte Eingabe offen: einen Hinweis plus ein Flag für die Annahme von Anhängen. Die Verfügbarkeit von Befehlen folgt der Plugin-Komposition: jeder Adapter, der die Registry konsumiert, sieht jede effektive Definition.

```ts type-equiv
/** Immutable metadata for a command's optional unstructured input. */
interface CommandInputDescriptor {
  /** Placeholder shown before the user supplies free-form input. */
  readonly hint: string
  /**
   * Whether composer attachments may accompany an invocation. Absent or
   * false = the executor rejects an invocation carrying attachments and capable
   * composers refuse the submission before dispatch. A declaring command's
   * handler receives the admitted durable blocks and owns every further
   * grammar decision, including rejecting sub-commands that cannot use them.
   */
  readonly attachments?: boolean
}
```

## Definition

`CommandDefinition` ist die vom Plugin verfasste Registrierung. Die Registry validiert und friert eine abgelöste effektive Definition ein.

```ts type-equiv
/** Plugin-owned command registration. */
interface CommandDefinition {
  /** Stable plugin-owned identity; absent for definitions without identity-based client behavior. */
  readonly definitionId?: CommandDefinitionId
  /** Lowercase command name without the leading slash. */
  readonly name: string
  /** Human-readable summary used in discovery UI. */
  readonly description: string
  /** Optional free-form input hint advertised to capable clients. */
  readonly input?: CommandInputDescriptor
  /**
   * Whether `command/run` records `rawInput`. Defaults to true. A command
   * whose domain event owns the payload sets this false to avoid duplicating
   * that payload in the session log.
   */
  readonly recordInput?: boolean
  /** Execute against the receiving agent without sending the command to the model. */
  readonly handler: (invocation: CommandInvocation) => CommandResult | Promise<CommandResult>
}
```

## Invocation und Ergebnis

Der Adapter besitzt die Stornierung und übergibt den exakten Zielagent. `rawInput` beginnt unmittelbar nach dem geparsten Namen und behält das vom Adapter gelieferte Trennzeichen und den Suffix. Ergebnisse sind direkte UI-Ergebnisse, keine Tool-Ergebnisse und keine Session-Events.

```ts type-equiv
/** Invocation passed to one registered command handler. */
interface CommandInvocation {
  /** Pairing id already written to this invocation's `command/run` event. */
  readonly commandId: CommandId
  /** Exact agent whose UI received the command. */
  readonly agent: Agent
  /** Exact text following the registered command name, including separator whitespace. */
  readonly rawInput: string
  /**
   * Durably admitted image and file blocks accompanying this invocation, in submission
   * order; empty unless the definition declares `input.attachments`. The handler
   * owns their model-visible use — the registry never schedules them itself —
   * and a handler whose grammar cannot use them in this invocation returns an
   * error so the dispatching composer retains the originals.
   */
  readonly attachments: readonly (ImageBlock | FileBlock)[]
  /** Cancellation signal owned by the dispatching UI request. */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/** Expected command outcome rendered directly by the dispatching UI. */
type CommandResult =
  | {
    readonly kind: 'success'
    readonly text?: string
    /** Earlier authoritative domain event that owns a richer presentation. */
    readonly sourceEventSeq?: SessionSeq
  }
  | { readonly kind: 'error'; readonly text: string }
```

`sourceEventSeq` ist optional und nur bei Erfolg zulässig. Wenn vorhanden, benennt es ein früheres Nicht-Befehl-Event im Log der empfangenden Session; `command/done` persistiert dieselbe Referenz, sodass ein Client den Befehlslebenszyklus mit jener Domänenprojektion kombinieren kann, ohne `text` zu parsen oder sich auf benachbarte Zeilen zu verlassen.

## Discovery- und Parsing-Sichten

Adapter erhalten nach der Scope-Auflösung handlerfreie unveränderliche Deskriptoren. `parseCommand()` gibt `ParsedCommand` vor der Registry-Auflösung zurück; syntaktisch gültige Eingabe kann dennoch einen nicht verfügbaren Befehl benennen.

```ts type-equiv
/** Handler-free immutable command view returned to UI adapters. */
interface CommandDescriptor {
  /** Stable plugin-owned identity; absent for definitions without identity-based client behavior. */
  readonly definitionId?: CommandDefinitionId
  /** Lowercase command name without the leading slash. */
  readonly name: string
  /** Human-readable summary used in discovery UI. */
  readonly description: string
  /** Optional free-form input hint advertised to capable clients. */
  readonly input?: CommandInputDescriptor
}
```

```ts type-equiv
/** Syntactically valid slash command before registry resolution. */
interface ParsedCommand {
  /** Lowercase command name without the leading slash. */
  readonly name: string
  /** Exact text following the command name. */
  readonly rawInput: string
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcommands--commandruntime"></a>

### `ctx.commands` — `CommandRuntime`

Registry für menschliche Befehle. Definitionen im einfachen Kontext sind global; Definitionen, die über ein befehlsinjiziertes Kind eines Agent-Kontexts registriert wurden, überschatten für diesen Agent die globalen.

```ts cordis-catalog
/**
 * Register a global or calling-agent-scoped command.
 * @param definition - discovery metadata and direct UI handler.
 * @returns the exact effect disposer that unregisters this definition.
 */
register(definition: CommandDefinition): () => void

/**
 * Register the sole authority that resolves staged file receipts for command submissions.
 * @param resolver - Session-aware receipt resolver.
 * @returns disposer that removes this exact resolver.
 */
registerFileReceiptResolver(resolver: CommandFileReceiptResolver): () => void

/**
 * List the effective immutable command descriptors for one agent.
 * @param agent - exact receiving agent and scoped-layer key.
 * @returns name-sorted descriptors after scoped shadowing.
 */
@Remote list(agent: Agent): readonly CommandDescriptor[]

/**
 * Resolve one effective command definition.
 * @param agent - exact receiving agent and scoped-layer key.
 * @param name - command name without a slash.
 * @returns the scoped shadow or global definition.
 */
find(agent: Agent, name: string): CommandDefinition | undefined

/**
 * Parse and execute a known command without sending it to the model.
 *
 * A resolved command's lifecycle is logged: `command/run` is appended
 * before the handler is invoked and `command/done` after settlement (a
 * thrown or aborted handler settles as `kind: 'error'`). Both are direct
 * log-only appends — no turn wraps them, and persistence drains them at
 * ordinary checkpoints. Admission misses (syntax or unknown name) log
 * nothing — they never entered a handler. A `command/run` append failure
 * fails the execution loud; a `command/done` append failure on the
 * handler-failure path is contained so the handler's own error stays the
 * reported failure.
 *
 * Attachment admission is enforced here, not in the composer: attachments sent to a
 * command that does not declare `input.attachments`, an absent attachment store,
 * and an exceeded image limit each settle as an error result before
 * the handler runs. Validation rejection starts no attachment writes;
 * a storage failure can leave only unreachable content-addressed objects
 * for deferred collection.
 *
 * @param agent - exact receiving agent.
 * @param line - complete slash-command line.
 * @param submittedAttachments - encoded images and staged file receipts accompanying the line,
 *   in submission order; empty for a plain invocation.
 * @param signal - cancellation signal owned by the UI request.
 * @returns the settled execution (result + lifecycle pairing id), or
 *   `undefined` when syntax or name does not resolve.
 */
@Remote async execute( agent: Agent, line: string, submittedAttachments: readonly CommandSubmitAttachment[], signal: AbortSignal, ): Promise<CommandExecution | undefined>
```

Types: [Agent](core.md)

Source: [`packages/interaction/commands/src/index.ts`](../../packages/interaction/commands/src/index.ts)

<a id="commands-events"></a>

### `commands/*` events

<a id="commandschange--emit"></a>

#### `commands/change` — emit

Ein Befehl wurde registriert oder abgemeldet. Dies ist eine ungefilterte Registry-Benachrichtigung, weil eine globale oder gescopte Änderung jede UI-Sicht betreffen kann. Observer-Fehler werden enthalten und können die Registry-Mutation nicht vetoieren.

```ts cordis-catalog
/**
 * A command was registered or unregistered. This is an unfiltered registry
 * notification because a global or scoped change may affect any UI view.
 * Observer failures are contained and cannot veto the registry mutation.
 * @mode emit
 */
'commands/change'(): void
```

Source: [`packages/interaction/commands/src/types.ts`](../../packages/interaction/commands/src/types.ts)
<!-- END GENERATED cordis-surface -->
