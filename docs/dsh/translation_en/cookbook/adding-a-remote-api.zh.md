# Cookbook: adding a Remote API

[English](adding-a-remote-api.md) | 中文

Adding or changing a `ctx.remote` endpoint follows five steps on this page: declare the method, declare failures, register on the package, consume it in the Client, and write tests. Decorator semantics, lookup resolution, the generation pipeline, and the `/api` route are mechanics owned by the [API Gateway reference](../api-gateway.zh.md); this page gives each step's actions and the conventions you must follow. For why the surface looks like this, see the [Typert remote method calls Agent Note](../../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.zh.md); for why the failure surface is a single `RemoteError` plus one code table, see the [failure vocabulary Agent Note](../../.agents/notes/implemented/architecture/2026-08-28-ctx-remote-failure-vocabulary.zh.md).

## 1. Declare the API

The owner is a Host-side Cordis service: extend `TypertRemoteService` to bind the service key together with the wire namespace, then mark the externally exposed methods with `@Remote`. If a business method's signature already matches the wire convention, annotate that method itself; only write a `remoteExport*` adapter when the shape needs adjusting (adding `signal`, changing parameter order, changing the export name), and let it call the business method under its unchanged name. A lookup object (`Agent`, `Session`) can occupy a top-level parameter position only, and a method that supports cooperative cancellation puts `signal: AbortSignal` in the final position.

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

/** One stored note as a Client reads it. */
export interface NoteRow {
  readonly noteId: string
  readonly title: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    notesController: NotesController
  }
}

export class NotesController extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'notesController', { namespace: 'notes' })
  }

  /**
   * @param agent - lookup parameter the Gateway resolves from its wire identity.
   * @param signal - carrier cancellation, always the final parameter.
   * @returns the notes this Agent's session owns.
   */
  @Remote('list')
  async remoteExportList(agent: Agent, signal: AbortSignal): Promise<NoteRow[]> {
    return await this.list(agent, signal)
  }

  /** The in-process API the adapter above delegates to, unchanged by it. */
  async list(agent: Agent, signal: AbortSignal): Promise<NoteRow[]> {
    signal.throwIfAborted()
    return await Promise.resolve([{ noteId: `${agent.id}-1`, title: 'draft' }])
  }
}
```

## 2. Declare failures

A Remote failure has exactly one class, `RemoteError`: domain codes enter `RemoteErrorDetailsMap` through declaration merging, and a failure site simply does `throw new RemoteError(code, message, details)`. Do not build a family of domain exception classes and do not write exit mapping functions; do not classify exceptions unrelated to this endpoint in advance, because the Gateway folds them into `gateway/internal` as a fallback. Write a `catch` only for the one scenario of folding arbitrary provider exceptions into a domain code, and attach the original exception as `cause`.

A code name is `<domain>/<reason>`, and where to declare it has four rules:

- A single producer: declare it in the producer package, right next to the throw site.
- Several packages produce it together: put it in the lowest-level domain package both depend on (`session/not-found` in `core/session`, `workspace/not-found` in `dsh-workspace`).
- The carrier codes `gateway/bad-request`, `gateway/cancelled`, and `gateway/internal` are already declared in protocol, and Gateway infrastructure codes are already declared in gateway — use them directly, do not copy them.
- A local failure that never reaches the wire does not enter the code table; express it with the caller's own type.

```ts
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No stored note carries that id. */
    'note/not-found': { readonly noteId: string }
    /** The store refused an otherwise valid write. */
    'note/rejected': { readonly noteId: string }
  }
}

declare const stored: ReadonlyMap<string, string>
declare function persist(noteId: string, title: string): Promise<void>

export async function rename(noteId: string, title: string): Promise<void> {
  if (!stored.has(noteId)) {
    throw new RemoteError('note/not-found', `no note "${noteId}"`, { noteId })
  }
  try {
    await persist(noteId, title)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    throw new RemoteError('note/rejected', message, { noteId }, { cause: error })
  }
}
```

## 3. Register on the package

`@Remote` must live in a Loader entry plugin package; when the owner is an abstract seam, put the controller in the matching package under `packages/api/`. The package manifest needs two generated entrypoints and a peer dependency on protocol, and on the Client side the `@deepseek-ai/dsh-api-remotes` assembly mounts that contribution and re-exports type vocabulary as needed. For which generated artifact each entrypoint points at and how the generation pipeline orders them, see the [API Gateway reference](../api-gateway.zh.md).

```json
{
  "exports": {
    "./typert": { "types": "./lib/typert.host.d.ts", "default": "./lib/typert.host.js" },
    "./remote": { "types": "./lib/typert.remote-client.d.ts", "default": "./lib/typert.remote-client.js" }
  },
  "peerDependencies": { "@deepseek-ai/dsh-typert-protocol": "workspace:*" },
  "devDependencies": { "@deepseek-ai/dsh-typert-protocol": "workspace:*" }
}
```

After changing a signature, the code table, a namespace, or an export name, re-run `pnpm run build:lib` so the Client receives the new declarations and codecs; changing only an implementation body needs no regeneration.

## 4. Consume it in the Client

A calling plugin declares both `remote` and `remote.<namespace>` in `inject` and writes `ctx.remote.<namespace>.<method>(...)` directly at the call site: do not narrow with `Pick<ClientRemote, …>`, do not hand-write method signatures, and do not invent wire relay objects. The result is a `RemoteResult<T>`; branch on `if (!result.ok)` in place and test `code`, not `instanceof` — a code branch narrows `details` automatically. At sites that let exceptions flow, write `throw result.error` (it is a real Error); a layer that catches it uses `isRemoteFailure` to separate Remote failures from local defects, and local defects keep propagating. Do not write defensive catch blocks: a Remote call does not reject, and an assembly error should blow up.

Read fixed Host facts from `ctx.remote.$host`: `home` and `isLoopback` are plain value reads with no subscription and no generation counter, and `home` is `undefined` before the first ready frame; refreshing after a reconnect goes through `ctx.on('connection/reset')` or each domain's own remote events. When a caller aborts a unary call, the result lands on the error branch as `gateway/cancelled` instead of throwing.

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import { isRemoteFailure } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'

export const inject = ['remote', 'remote.notes']

declare const ctx: Context

/** Store-side read: the error branch is handled where the code is meaningful. */
export async function noteTitles(): Promise<readonly string[]> {
  const result = await ctx.remote.notes.list()
  if (!result.ok) {
    if (result.error.code === 'note/not-found') return []
    throw result.error
  }
  return result.value.map(row => row.title)
}

/** Action-side: a Remote failure becomes copy; a local fault keeps crashing. */
export async function renderTitles(): Promise<string> {
  try {
    return (await noteTitles()).join(', ')
  } catch (error: unknown) {
    if (!isRemoteFailure(error)) throw error
    return `unavailable (${error.code})`
  }
}

/** Fixed Host facts as plain reads. */
export function hostLabel(): string {
  const { home, isLoopback } = ctx.remote.$host
  return home ?? (isLoopback ? 'local host' : 'remote host')
}
```

## 5. Test

On the owner side, assert the thrown code: catch it, extract the failure with `remoteErrorOf`, then compare `code` and the needed `details` fields with `toMatchObject` — do not deep-compare error objects with `toEqual`, and do not assert `instanceof`.

```ts
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { expect, it } from 'vitest'

declare function rename(noteId: string, title: string): Promise<void>

it('refuses an unknown note before writing', async () => {
  const failure = await rename('n-404', 'fresh title').catch((error: unknown) => error)

  expect(remoteErrorOf(failure)).toMatchObject({
    code: 'note/not-found',
    details: { noteId: 'n-404' },
  })
})
```

A Client-side stand-in returns real instances: always take value imports of `RemoteError` and `TestRemote` from `@deepseek-ai/dsh-client-test-runtime`, because a value import from the `api-remotes` facade pulls in an assembly chain that has not been built yet. `TestRemote.$host` is an ordinary field, so a spec can assign it directly.

```ts ignore-check
import { Context } from '@deepseek-ai/cordis'
import { RemoteError, TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { expect, it } from 'vitest'

it('renders the failure code the Host reported', async () => {
  const ctx = new Context()
  const remote = new TestRemote(ctx, {
    notes: {
      list: () => Promise.resolve({
        ok: false as const,
        error: new RemoteError('note/not-found', 'no note "n-404"', { noteId: 'n-404' }),
      }),
    },
  })
  remote.$host = { home: '/home/fixture', isLoopback: true }

  await expect(ctx.remote.notes.list()).resolves.toMatchObject({ error: { code: 'note/not-found' } })
})
```

## Verification

1. `pnpm run build:lib`: re-run it whenever a signature, the code table, a namespace, or an export name changed, since it produces the Client declarations and codecs.
2. `pnpm run typecheck`: run both the Host and the Client program; a wrong merge location for the code table goes red here.
3. Run the specs on both sides by name: `npx vitest run <owner spec> <client spec>`.
4. When the endpoint is part of the product-visible surface, add a recorded session snapshot, per the rules in the [testing policy](../testing.zh.md).
