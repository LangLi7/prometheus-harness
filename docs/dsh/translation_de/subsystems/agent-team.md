# Agent Teams

English | [中文](agent-team.zh.md)

Typen, die von der experimentellen impliziten Root-Team-Domäne, den Modell-Tools und den Host-Adaptern gemeinsam genutzt werden. Die [Agent Teams Agent Note](../../.agents/notes/implemented/feature/2026-08-05-agent-teams.md) besitzt die Entscheidungen zu Identität, Mailbox, Task und gemeinsamem Checkout; diese Seite hält die dauerhaften und client-sichtbaren Formen aus [`packages/experimental/agent-team/src/types.ts`](../../packages/experimental/agent-team/src/types.ts) fest.

## Identität und Roster

`TeamId` ist die Root-`SessionId` unter einer eigenen [Brand](core.md#branded-ids). `TeamTaskId` wird als `task-<n>` vergeben. Neue Sendungen geben die `MessageId` des Ziel-Inbox zurück; `TeamMessageId` bleibt nur für historische Mailbox-Datensätze erhalten. Teammate-Namen sind unveränderliche Labels.

```ts type-equiv
/** Whole durable value written on every teammate lifecycle change. */
interface TeamMemberSnapshot {
  readonly id: SessionId
  readonly name: string
  readonly description: string
  readonly provider: string
  readonly context: 'fresh' | 'fork'
  readonly phase: TeamMemberPhase
  readonly error?: string
}
```

Jedes Member startet in `provisioning` und erreicht genau eine terminale Roster-Phase, `active` oder `failed`. Der Roster-Status `running`/`inactive` wird separat abgeleitet und schreibt diesen Datensatz niemals um.

## Nachrichten und historische Mailbox

Neue Sendungen geben die Inbox-Annahme oder die Ablehnung zurück. Das Ziel speichert die bestehende `agent-message`-Source mit der echten Sender-Session-id und einem Sender-Namens-Präfix im Inhalt. Team hat keine Outbox für neue Nachrichten und keine Deduplizierung beim erneuten Senden. Der [Paketvertrag](../../packages/experimental/agent-team/README.md#understand-the-implementation) definiert die Persistenz. Die folgenden Mailbox-Typen bleiben lesbar, damit historische Lead-Logs weiterhin wiedergegeben werden können; Team stellt ihre Pending-Datensätze nicht zu.

```ts type-equiv
/** One peer message recorded by the historical Team mailbox. */
interface TeamMessageSnapshot {
  readonly id: TeamMessageId
  readonly senderId: SessionId
  readonly senderName: string
  readonly targetId: SessionId
  readonly content: ContentBlock[]
}
```

Jede Nachricht versucht eine Steer-Zustellung. Ein laufendes Ziel erhält sie an der nächstgelegenen Schrittgrenze; ein inaktives Ziel startet einen Turn, wenn es geladen ist, oder wird andernfalls kalt wiederaufgenommen. Die Planung wird nicht im dauerhaften Datensatz gespeichert, weil Aufrufer keinen anderen Modus wählen können.

Historische `team-message`-Sources behalten die alte Nachrichten-id und die Sender-Zuordnung; der Client verwendet sie für den Nachrichtentitel und das Symbol.

```ts type-equiv
/** Source recorded by a target Session for one historical Team mailbox delivery. */
interface TeamMessageSource {
  readonly kind: 'team-message'
  readonly teamId: TeamId
  readonly messageId: TeamMessageId
  readonly senderId: SessionId
  readonly senderName: string
}
```

## Gemeinsamer Task-DAG

Jedes Task-Event speichert einen vollständigen Snapshot. `revision` ist der Compare-and-Set-Wert und wird pro Mutation um eins erhöht. `blockedBy`-Kanten müssen nicht gelöschte Tasks benennen und den Graphen azyklisch halten. `writeScopes` sind normalisierte beratende Pfadpräfixe und keine Locks.

```ts type-equiv
/** Whole durable task snapshot; every mutation increments {@link revision}. */
interface TeamTaskSnapshot {
  readonly id: TeamTaskId
  readonly revision: number
  readonly subject: string
  readonly description: string
  readonly status: TeamTaskStatus
  readonly ownerId?: SessionId
  readonly blockedBy: TeamTaskId[]
  readonly writeScopes: string[]
}
```

`pending` ist nicht gestartet oder freigegeben, `in_progress` trägt einen Owner, `completed` erfüllt Blocker, und `deleted` ist ein aufbewahrter Tombstone. Views ergänzen den Owner-Namen, die Bereitschaft und Warnungen zu überlappenden Write-Scopes, ohne den dauerhaften Snapshot zu ändern.

<a id="web-projection"></a>

## Web-Projektion

Die Lead-Session veröffentlicht `SessionProjectionMap.agentTeam` mit dauerhaften Roster-Zeilen und nicht gelöschten Task-Views. `failure` meldet einen abgelehnten persistierten Datensatz neben dem letzten gültigen Zustand. Die Member-Aktivität stammt aus dem Session-Status; Modell-Labels stammen aus der `modelSelection`-Projektion des jeweiligen Members.

```ts type-equiv
/** One durable roster row published through the `agentTeam` Session projection. */
interface TeamMemberProjection {
  readonly id: SessionId
  readonly name: string
  readonly role: 'lead' | 'teammate'
  /** Durable lifecycle; the Lead row is always `active`. Turn activity comes from Session status. */
  readonly phase: TeamMemberPhase
  readonly error?: string
}
```

```ts type-equiv
/** Runtime-enriched task view returned to tools and hosts. */
interface TeamTaskView {
  readonly id: TeamTaskId
  readonly revision: number
  readonly subject: string
  readonly description: string
  readonly status: TeamTaskStatus
  readonly blockedBy: TeamTaskId[]
  readonly writeScopes: string[]
  readonly ownerName?: string
  readonly ready: boolean
  readonly writeScopeWarnings: string[]
}
```

```ts type-equiv
/**
 * Durable Team state published to browser clients through the Lead Session's
 * `agentTeam` projection. `failure` names the first rejected persisted Team
 * record; members and tasks then stay at the last valid state.
 */
interface TeamProjection {
  readonly members: TeamMemberProjection[]
  readonly tasks: TeamTaskView[]
  readonly failure?: string
}
```

## Replay

Die `agentTeam`-Session-Projektion gibt eine Root-Session in den Roster, das Task-Board und die historische Queued-minus-Delivered-Mailbox wieder. Sie wählt Datensätze über `TeamId` aus, sodass Events, die ein gewöhnlicher Fork erbt, die Ancestor-id behalten und niemals in den Zustand des neuen Roots eingehen. Session-Event `seq` und `time` bleiben der Datensatz für Reihenfolge und Zeitpunkt; Team-Snapshots duplizieren sie nicht. Roster- und Task-Lesevorgänge erreichen Aufrufer als Views; Pending-Mail wird Aufrufern nicht offengelegt. Das Paket-[README](../../packages/experimental/agent-team/README.md) besitzt Operation, Autorisierung, Wiederherstellung und das Verhalten bei Limits.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis-API

Aus dem Quellcode generiert durch `scripts/gen-cordis-catalog.ts` (in doc-sync durch `pnpm run verify-cordis-catalog` auf Aktualität geprüft; neu generieren mit `pnpm run gen-cordis-catalog`) — die Sprachseiten unterscheiden sich nur in den lokalspezifischen Pfaden der gepaarten Dokumente. Signaturblöcke verwenden einen `ts cordis-catalog`-Fence und behalten das ursprüngliche JSDoc aus der Quelle; Dispatch-Modi sind im [Primer](../cordis-primer.md#dispatch-modes) definiert, und die vom Framework geerbte `ctx`-API steht in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxagentteams--teamservice"></a>

### `ctx.agentTeams` — `TeamService`

Agent Teams Service, der durch das exakte Live-Lead-Session-Log gestützt wird.

```ts cordis-catalog
/**
 * Resolve one exact live Agent's Team role.
 * @param agent - exact live Agent used as the authority credential.
 * @returns its root, Team identity, role, and model-facing name.
 */
membership(agent: Agent): TeamMembership

/**
 * List the runtime-enriched roster visible to one Team member.
 * @param agent - exact live Team member.
 * @returns Lead and teammate rows in creation order.
 */
listMembers(agent: Agent): TeamMemberView[]

/**
 * Create one named, continuable direct child of the Team Lead.
 * @param caller - exact live Lead Agent.
 * @param request - immutable name, description, prompt, context mode, provider, and cancellation.
 * @returns the active roster row.
 */
async spawnTeammate(caller: Agent, request: SpawnTeammateRequest): Promise<SpawnTeammateResult>

/**
 * Steer one peer message into the target inbox or reject the attempt.
 * @param caller - exact live sending Team member.
 * @param request - target name, content, and cancellation before acceptance.
 * @returns accepted inbox identity; acceptance follows normal Agent persistence and does not await model processing.
 */
async sendMessage(caller: Agent, request: SendTeamMessageRequest): Promise<SendTeamMessageResult>

/**
 * Create one unowned pending task in the Team Lead log.
 * @param caller - exact live Team member creating the task.
 * @param request - task text, blockers, and advisory write scopes.
 * @returns the revision-one task view.
 */
async createTask(caller: Agent, request: CreateTeamTaskRequest): Promise<TeamTaskView>

/**
 * Return one task, including a deleted tombstone.
 * @param caller - exact live Team member reading the task.
 * @param id - Team-local task identity.
 * @returns the latest task value and derived readiness diagnostics.
 */
getTask(caller: Agent, id: TeamTaskId): TeamTaskView

/**
 * List current non-deleted tasks in numeric creation order.
 * @param caller - exact live Team member reading the board.
 * @returns detached current task views.
 */
listTasks(caller: Agent): TeamTaskView[]

/**
 * Compare-and-set one authorized task transition.
 * @param caller - exact live Team member authorizing the mutation.
 * @param request - task identity, expected revision, action, and action fields.
 * @returns the committed next task revision.
 */
async updateTask(caller: Agent, request: UpdateTeamTaskRequest): Promise<TeamTaskView>

/**
 * Wait for the next Team-domain or member-status change.
 * @param caller - exact live Team member waiting for activity.
 * @param timeoutMs - bounded wait duration from ten seconds through one hour.
 * @param signal - caller cancellation for the wait only.
 * @returns one observed change or a timeout result.
 */
async waitForChange(caller: Agent, timeoutMs: number, signal: AbortSignal): Promise<TeamWaitResult>

/**
 * Interrupt one live teammate turn without clearing its pending inbox.
 * @param caller - exact live Lead Agent.
 * @param targetName - durable teammate name.
 * @returns the target status sampled before cancellation.
 */
interrupt(caller: Agent, targetName: string): { previousStatus: 'running' | 'inactive' }

/**
 * Resolve a caller without throwing, used by scoped-tool installation and observers.
 * @param agent - candidate exact live Agent.
 * @returns Team membership, or undefined for non-Team subagents and stale identities.
 */
tryMembership(agent: Agent): TeamMembership | undefined
```

Types: [Agent](core.md)

Source: [`packages/experimental/agent-team/src/index.ts`](../../packages/experimental/agent-team/src/index.ts)
<!-- END GENERATED cordis-surface -->
