/**
 * **Das zusammengesetzte Werkzeug — der Hybride zwischen Standardmodus und PTC.**
 *
 * Im Standardmodus sieht das Modell jedes Werkzeug einzeln und ruft sie nacheinander; jede
 * Antwort wandert durch den Kontext, und jeder Zwischenschritt kostet eine Modell-Runde. Im
 * PTC-Modus sieht es nur `run_code` — der Katalog verschwindet aus dem Prompt, dafür ist kein
 * Einzelaufruf mehr möglich. Beides ist eine Festlegung für den ganzen Agenten.
 *
 * Dieses Bündel nimmt die Festlegung heraus: Die nativen Werkzeuge bleiben sichtbar, und
 * **zusätzlich** gibt es `run_program`. Ein Programm darin sieht dieselben Werkzeuge als
 * `tools.*`, kann sie in einer Schleife aufrufen, Ergebnisse filtern und nur das zurückgeben,
 * was gebraucht wird. Welches der beiden Wege richtig ist, entscheidet das Modell — die Regel
 * dafür steht im Skill `programmatic-tools`, nicht hier. Der Harness kennt die Aufgabe nicht,
 * bevor das Modell sie liest; er kann sie nicht erkennen.
 *
 * ## Warum die Werkzeuge nicht direkt aufgerufen werden
 *
 * Ein Binding ruft `ctx.tools.execute(...)`, nicht die `execute`-Methode der Definition. Nur
 * dieser Weg läuft durch Pre-Policy, Guards, Around-Dispatch und Post-Policy — also durch
 * dieselbe Kette wie ein Aufruf des Modells. Wer die Definition direkt riefe, umginge jede
 * Freigabe. `parent: exec.token` markiert den Aufruf als Sub-Dispatch: unter `mode: 'ptc'`
 * sind nur solche Aufrufe für native Namen erlaubt.
 *
 * ## Was hier nicht passiert
 *
 * Kein Zustand zwischen Programmen (der Sandkasten ist je Lauf frisch), keine Streaming-
 * Ausgabe (das Ergebnis kommt ganz oder gar nicht), und keine Präsentationsumschaltung: Der
 * Werkzeugkatalog bleibt stabil, weil ein Wechsel mitten im Gespräch den Prompt-Cache
 * invalidieren würde.
 *
 * @module @prometheus-harness/programmatic-tools
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'

/** Der Name, unter dem das Modell das Werkzeug sieht. */
export const name = 'pmh-programmatic-tools'

/** Der Sandkasten kommt vom Kern; ohne ihn tut dieses Bündel nichts. */
export const inject = ['tools', 'ptcRuntime'] as const

/** Der Werkzeugname. `run_code` ist für die PTC-Präsentation reserviert und hier gesperrt. */
export const TOOL_NAME = 'run_program'

/** Was der Betreiber einstellen darf. */
export interface Config {
  /** Vorgabe-Budget eines Programms in Millisekunden; ohne Angabe entscheidet der Sandkasten. */
  timeoutMs?: number
  /** Werkzeugnamen, die im Programm nicht sichtbar sind (Rückfragen, Plan-Modus). */
  deniedTools?: string[]
}

/** Der kleinste Ausschnitt der PTC-Naht, den dieses Werkzeug braucht. */
interface PtcRuntimeLike {
  resolve(request: Record<string, unknown>): unknown
  run(spec: unknown): Promise<PtcRunLike>
}

/** Was ein Lauf zurückgibt — Fehler als Feld, nicht als Ausnahme. */
interface PtcRunLike {
  value?: unknown
  logs?: string[]
  error?: { kind: string; message: string }
}

/**
 * Meldet das Werkzeug an.
 *
 * @param ctx - der Host-Kontext.
 * @param config - optionales Budget und gesperrte Werkzeugnamen.
 * @returns die Abmeldung, die der Loader beim Entladen ruft.
 */
export function apply(ctx: Context, config: Config = {}): () => void {
  return ctx.tools.register(baueWerkzeug(ctx, config))
}

/**
 * Baut die Werkzeugdefinition.
 *
 * @param ctx - der Host-Kontext, aus dem Registry und Sandkasten kommen.
 * @param config - Budget und Sperrliste.
 * @returns die Definition, wie `ctx.tools.register` sie verlangt.
 */
export function baueWerkzeug(ctx: Context, config: Config = {}): ToolDefinition {
  const gesperrt = new Set(config.deniedTools ?? [])

  return {
    name: TOOL_NAME,
    description: [
      'Run a small TypeScript program against the tools you can already call, and return only its result.',
      'Use it when three or more calls depend on each other, when you would loop over a collection,',
      'or when you need to filter, count or sort the answers before reading them.',
      'Inside the program every visible tool is a method on `tools` (await tools.read({ path })).',
      'The program is the body of an async function: top-level `await` and `return` work.',
      'Return only what you need — intermediate data stays in the sandbox.',
      'Do not use it for a single call, and never for asking the user something.',
    ].join(' '),
    parameters: {
      description: {
        type: 'string',
        required: true,
        description: 'Short summary of what the program does, for the session log.',
      },
      code: {
        type: 'string',
        required: true,
        description:
          'Program body in TypeScript. Type annotations are advisory and stripped; `enum` and namespaces do not run.',
      },
      timeoutMs: {
        type: 'number',
        description: 'Elapsed budget in milliseconds for this program. Omit for the deployment default.',
      },
    } as unknown as ToolDefinition['parameters'],
    output: {
      // Offen, weil das Ergebnis die Form des Programms trägt. Ein enges Schema wäre eine Zusage,
      // die dieses Werkzeug nicht halten kann.
      schema: { type: 'object' } as unknown as ToolDefinition['output']['schema'],
      render: (_args: unknown, value: unknown): ContentBlock[] =>
        [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] as unknown as ContentBlock[],
    },
    execute: async (args: unknown, exec: ToolRunContext): Promise<unknown> => {
      const eingabe = (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>
      const code = typeof eingabe.code === 'string' ? eingabe.code : ''
      if (code.trim() === '') {
        return { ok: false, error: 'run_program needs a non-empty program body in `code`.' }
      }

      const ptc = (ctx as unknown as { ptcRuntime?: PtcRuntimeLike }).ptcRuntime
      if (ptc === undefined) {
        return { ok: false, error: 'No ptcRuntime is mounted; run_program needs the sandbox backend.' }
      }

      const anfrage: Record<string, unknown> = {
        program: code,
        bindings: sammleBindings(ctx, exec, gesperrt),
        signal: exec.signal,
      }
      const budget = typeof eingabe.timeoutMs === 'number' ? eingabe.timeoutMs : config.timeoutMs
      if (budget !== undefined) anfrage.timeoutMs = budget

      let spec: unknown
      try {
        spec = ptc.resolve(anfrage)
      } catch (fehler) {
        // Fehlbedienung des Aufrufers, nicht des Programms: eigener Zweig, damit der Text
        // nicht wie ein Programmierfehler aussieht.
        return { ok: false, error: `run_program rejected its own options: ${String(fehler)}` }
      }

      const lauf = await ptc.run(spec)
      if (lauf.error !== undefined) {
        return { ok: false, kind: lauf.error.kind, error: lauf.error.message }
      }
      return { ok: true, value: lauf.value ?? null, logs: lauf.logs ?? [] }
    },
  }
}

/**
 * Macht die sichtbaren Werkzeuge zu Bindings.
 *
 * Jeder Aufruf geht durch `ctx.tools.execute`, also durch die volle Policy-Kette. Die
 * Aufrufkennung ist je Aufruf eindeutig (`<root>:prog:<n>`), damit zwei Aufrufe desselben
 * Werkzeugs im selben Programm nicht kollidieren.
 *
 * @param ctx - der Host-Kontext.
 * @param exec - die laufende Ausführung, die den Sub-Dispatch erbt.
 * @param gesperrt - Namen, die im Programm nicht auftauchen.
 * @returns die Bindings-Namensräume für den Sandkasten.
 */
function sammleBindings(
  ctx: Context,
  exec: ToolRunContext,
  gesperrt: ReadonlySet<string>,
): unknown[] {
  const funktionen: Record<string, (argumente: unknown) => Promise<unknown>> = {}
  let zaehler = 0

  for (const schema of ctx.tools.schemas()) {
    if (schema.name === TOOL_NAME || gesperrt.has(schema.name)) continue
    funktionen[schema.name] = async (argumente: unknown): Promise<unknown> => {
      zaehler += 1
      const ergebnis = await ctx.tools.execute({
        callId: `${String(exec.rootCallId)}:prog:${String(zaehler)}` as ToolCallId,
        rootCallId: exec.rootCallId,
        name: schema.name,
        schema,
        arguments: argumente,
        // `exactOptionalPropertyTypes`: ein fehlender Agent darf nicht als `undefined` gesetzt werden.
        ...(exec.agent !== undefined ? { agent: exec.agent } : {}),
        parent: exec.token,
        signal: exec.signal,
      })
      return zuWert(ergebnis)
    }
  }

  return [{ global: 'tools', functions: funktionen }]
}

/**
 * Übersetzt ein Werkzeugergebnis in einen Wert, den das Programm weiterverwenden kann.
 *
 * Die Textblöcke werden zusammengeführt; was JSON ist, wird JSON. Ein Fehler wird zur
 * Ausnahme **im Programm**, damit `try`/`catch` je Element wirkt — genau der Grund, warum
 * gebündelt wird.
 *
 * @param ergebnis - das materialisierte Ergebnis der Registry.
 * @returns der geparste Wert oder der Text.
 * @throws Error wenn das Werkzeug gescheitert ist.
 */
function zuWert(ergebnis: unknown): unknown {
  const r = ergebnis as { isError?: boolean; content?: unknown }
  const bloecke = Array.isArray(r.content) ? r.content : []
  const text = bloecke
    .map((block) => {
      if (typeof block !== 'object' || block === null) return ''
      const t = (block as { text?: unknown }).text
      return typeof t === 'string' ? t : ''
    })
    .filter((zeile) => zeile !== '')
    .join('\n')

  if (r.isError === true) throw new Error(text === '' ? 'tool call failed without a message' : text)
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export default apply
