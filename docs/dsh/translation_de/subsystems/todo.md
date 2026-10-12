# Todo

English | [中文](todo.zh.md)

Das dauerhafte Todo-Vokabular, besessen von [`@deepseek-ai/dsh-tool-todo`](../../packages/todo/tool-todo/README.md). Das modellzugewandte Tool ersetzt die gesamte Liste einer Agent-Session; das Paket besitzt außerdem die Event-Deklaration und die Replay-Projektion. Tool-Verhalten und Konfiguration stehen im [Paket-README](../../packages/todo/tool-todo/README.md).

Quelle: [`packages/todo/tool-todo/src/types.ts`](../../packages/todo/tool-todo/src/types.ts)

## `TodoItem` — ein Listeneintrag

```ts type-equiv
/**
 * One entry in an agent's todo list — the unit of the `todo/write`
 * whole-list snapshot declared by this package.
 *
 * Deliberately minimal: a human-readable `content` line and a three-state
 * `status`. No id, priority, or `activeForm` — the list is replaced wholesale
 * on every write (last-write-wins), so entries need no stable identity. The
 * three statuses describe the complete portable lifecycle needed by model and
 * UI consumers.
 */
interface TodoItem {
  /** What this task is — a short imperative line shown in the UI. */
  content: string
  /** Lifecycle state. `in_progress` marks a task being worked now; parallel work may mark several. */
  status: 'pending' | 'in_progress' | 'completed'
}
```

## Dauerhaftes Event

Das Paket merged per Deklaration `todo/write: { todos: TodoItem[] }` in `SessionEventMap`. Das Event steht nur im Log und trägt die vollständige Ersatzliste; der generierte [Persistenz-Katalog](../persistence-catalog.md#todowrite--log-only) zeichnet seine Deklarationsstelle auf.
