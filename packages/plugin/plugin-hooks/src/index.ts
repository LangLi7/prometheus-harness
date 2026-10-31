/**
 * `@prometheus-harness/plugin-hooks` — Claude-Hooks im Host.
 *
 * **Wo der Haken sitzt.** Der Werkzeug-Registry des Kerns hat eine
 * Wasserfall-Pipeline: `tools/pre-execute` darf erlauben, ablehnen, abbrechen oder
 * fragen; `tools/post-execute` darf das Ergebnis ersetzen. Genau dort hängen die
 * Claude-Ereignisse `PreToolUse` und `PostToolUse`.
 *
 * **Warum standardmäßig aus.** Ein Hook ist fremder Code, der bei jedem
 * Werkzeugaufruf läuft — mit den Rechten des Hosts. Freigegeben wird ausdrücklich
 * über `pmh plugin hooks enable <id>`; ohne Freigabe lädt das Plugin nichts.
 *
 * **Was passiert, wenn ein Hook scheitert.** Ein Startfehler oder ein Absturz
 * blockiert **nicht** (Claude-Verhalten: nicht-blockierender Fehler). Nur ein
 * ausdrückliches Nein — Exit 2, `permissionDecision: "deny"` oder
 * `decision: "block"` — hält den Aufruf auf.
 *
 * @module @prometheus-harness/plugin-hooks
 */

import { resolvePmhHome } from '@prometheus-harness/home-paths'

import {
  loadHooks,
  readEnabled,
  runPostToolHooks,
  runPreToolHooks,
  type HookSet,
} from './hooks.ts'

/** Der Cordis-Name. */
export const name = 'pmh-plugin-hooks'

export { enabledPath, readEnabled, writeEnabled } from './hooks.ts'

/** Ohne die Werkzeug-Registry gibt es keinen Haken. */
export const inject = ['tools'] as const

/** Konfiguration des Eintrags. */
export interface Konfiguration {
  /** Harness-Home; Vorgabe `resolvePmhHome()`. */
  readonly home?: string
  /** Freigegebene Plugin-Ids; ohne Angabe aus `hooks-enabled.json`. */
  readonly enabled?: readonly string[]
}

/** Der Ausschnitt eines Werkzeugaufrufs, den Hooks sehen. */
interface ToolLike {
  readonly name: string
  readonly arguments: unknown
}

/** Die Entscheidung, die die Pipeline versteht. */
type PreDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny'; readonly reason: string }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'ask'; readonly reason?: string }

/** Der strukturelle Host-Kontext; so bleibt das Plugin ohne Host prüfbar. */
interface HostKontext {
  on(
    event: 'tools/pre-execute',
    listener: (exec: ToolLike, next: () => Promise<PreDecision>) => Promise<PreDecision>,
  ): () => void
  on(
    event: 'tools/post-execute',
    listener: (exec: ToolLike, result: unknown, next: () => Promise<unknown>) => Promise<unknown>,
  ): () => void
  logger?: { warn(...args: readonly unknown[]): void }
}

/**
 * Hängt die Hooks an die Werkzeug-Pipeline.
 *
 * @param ctx - der Host-Kontext
 * @param konfiguration - Home und Freigaben
 * @returns die Abmeldung
 */
export function apply(ctx: HostKontext, konfiguration: Konfiguration = {}): () => void {
  const home = konfiguration.home ?? resolvePmhHome()
  const loaded = konfiguration.enabled === undefined
    ? readEnabled(home).then((state) => loadHooks(home, state.enabled))
    : loadHooks(home, konfiguration.enabled)
  let warned = false
  const sets = async (): Promise<readonly HookSet[]> => {
    try {
      const result = await loaded
      if (!warned && result.warnings.length > 0) {
        warned = true
        for (const warning of result.warnings) ctx.logger?.warn?.(`plugin-hooks: ${warning}`)
      }
      return result.sets
    } catch (error) {
      ctx.logger?.warn?.(`plugin-hooks: Laden fehlgeschlagen: ${String(error)}`)
      return []
    }
  }

  const offPre = ctx.on('tools/pre-execute', async (exec, next) => {
    const active = await sets()
    if (active.length === 0) return next()
    const decision = await runPreToolHooks(
      {
        hook_event_name: 'PreToolUse',
        tool_name: exec.name,
        tool_input: exec.arguments,
        cwd: process.cwd(),
      },
      active,
      process.cwd(),
    )
    if (decision.block) return { kind: 'deny', reason: decision.reason ?? 'blockiert durch Plugin-Hook' }
    return next()
  })

  const offPost = ctx.on('tools/post-execute', async (exec, _result, next) => {
    const active = await sets()
    if (active.length > 0) {
      const feedback = await runPostToolHooks(
        {
          hook_event_name: 'PostToolUse',
          tool_name: exec.name,
          tool_input: exec.arguments,
          cwd: process.cwd(),
        },
        active,
        process.cwd(),
      )
      if (feedback.length > 0) ctx.logger?.warn?.(`plugin-hooks: ${feedback.join(' ')}`)
    }
    return next()
  })

  return () => {
    offPre()
    offPost()
  }
}
