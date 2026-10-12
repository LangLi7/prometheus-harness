# Todo

[English](todo.md) | 中文

This page records the persistent todo vocabulary owned by [`@deepseek-ai/dsh-tool-todo`](../../packages/todo/tool-todo/README.zh.md). The model-facing tool replaces an agent session's list wholesale; the package also owns the event declaration and the replay projection. For tool behavior and configuration see the [package README](../../packages/todo/tool-todo/README.zh.md).

Source: [`packages/todo/tool-todo/src/types.ts`](../../packages/todo/tool-todo/src/types.ts)

## `TodoItem`: one list entry

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

## Persistent event

Through declaration merging the package adds `todo/write: { todos: TodoItem[] }` to `SessionEventMap`. This event is log-only and carries the full replacement list; the generated [persistence catalog](../persistence-catalog.zh.md#todowrite--log-only) records where it is declared.
