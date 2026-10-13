/**
 * `@prometheus-harness/agent-tools` — die Werkzeug-Registry des Agent-Loops.
 *
 * **Was ein Werkzeug hier ist.** Ein Name, eine Beschreibung, ein
 * Parameterschema und **eine** Funktion, die aus Argumenten ein Ergebnis macht.
 * Mehr nicht: keine Berechtigungen, keine Wiederholung, keine Nebenläufigkeit —
 * das entscheidet der Loop, weil er den Zusammenhang kennt (welcher Turn,
 * welcher Schritt, welcher Abbruch).
 *
 * **Der eine Fehler, der nicht durchgereicht wird.** Ein unbekanntes Werkzeug
 * ist **kein** Wurf: das Modell hat etwas verlangt, das es nicht gibt. Der Loop
 * gibt ihm das als Ergebnis zurück und lässt es korrigieren. Ein Wurf würde den
 * ganzen Turn beenden — für einen Tippfehler des Modells. Dasselbe gilt für
 * einen Fehler **innerhalb** eines Werkzeugs: er wird zum Ergebnis, nicht zum
 * Absturz. Ein Absturz mitten im Turn verliert alles, was bis dahin galt.
 *
 * **Der eine Fall, der sehr wohl durchgereicht wird:** ein ungültiges
 * Registry-Argument beim **Bauen** (doppelter Name, leerer Name). Das ist ein
 * Programmierfehler des Aufrufers, kein Modellfehler — er soll sofort auffallen
 * und nicht als Werkzeugergebnis im Verlauf landen.
 *
 * @module @prometheus-harness/agent-tools
 */

import { type ToolCall, type ToolResultPart, type ToolSpec } from '@prometheus-harness/llm'

/** Der Zusammenhang, in dem ein Werkzeug läuft. */
export interface ToolContext {
  /**
   * Abbruchsignal des Aufrufers.
   *
   * **Warum es mitgegeben wird.** Ein Werkzeug kann lange dauern (ein Befehl,
   * ein Netzaufruf). Ohne Signal kann es einen Abbruch nicht bemerken und läuft
   * weiter, obwohl niemand das Ergebnis noch will.
   */
  readonly signal: AbortSignal | undefined
  /** Laufende Nummer des Steps innerhalb des Turns, ab 1. */
  readonly step: number
  /** Kennung des Aufrufs, zu dem das Ergebnis gehört. */
  readonly callId: string
}

/** Ein Werkzeug, wie der Loop es sieht. */
export interface AgentTool {
  /** Eindeutiger Name; genau so muss das Modell ihn nennen. */
  readonly name: string
  /** Beschreibung für das Modell. Sie ist der Vertrag, den das Modell liest. */
  readonly description: string
  /** Parameterschema, unverändert an den Anbieter gereicht. */
  readonly parameters: Readonly<Record<string, unknown>>
  /**
   * Führt das Werkzeug aus.
   *
   * Der Rückgabewert ist **Text**: so kommt er beim Modell an. Ein Werkzeug,
   * das strukturierte Daten liefern will, serialisiert sie selbst — der Loop
   * entscheidet nicht über Darstellung.
   *
   * @param args - die Argumente des Modells, bereits geparst (kann leer sein)
   * @param context - Step, Kennung und Abbruchsignal
   * @returns der Ergebnistext
   */
  execute(args: Readonly<Record<string, unknown>>, context: ToolContext): Promise<string>
}

/** Eine Sammlung von Werkzeugen, nach Namen auffindbar. */
export interface ToolRegistry {
  /** Alle Werkzeuge in stabiler Reihenfolge — so gehen sie an den Anbieter. */
  list(): readonly AgentTool[]
  /** Ein Werkzeug nach Namen, oder `undefined`. */
  get(name: string): AgentTool | undefined
  /** Zahl der Werkzeuge. */
  readonly size: number
}

/**
 * Eine Registry aus einer Liste.
 *
 * **Warum die Reihenfolge erhalten bleibt.** Werkzeugbeschreibungen gehen in
 * jeder Anfrage mit; ihre Reihenfolge beeinflusst, wie stabil ein Anbieter
 * antwortet (und ob ein Zwischenspeicher greift). Eine wechselnde Reihenfolge
 * wäre eine unnötige Änderung an jeder Anfrage.
 */
export class Tools implements ToolRegistry {
  readonly #tools: readonly AgentTool[]
  readonly #byName: ReadonlyMap<string, AgentTool>

  /**
   * @param tools - die Werkzeuge; die Reihenfolge wird übernommen
   * @throws Error bei einem leeren oder doppelten Namen — ein Programmierfehler
   */
  constructor(tools: readonly AgentTool[] = []) {
    const byName = new Map<string, AgentTool>()
    for (const tool of tools) {
      if (tool.name === '') throw new Error('Ein Werkzeug ohne Namen ist nicht erreichbar')
      if (byName.has(tool.name)) throw new Error(`Werkzeug "${tool.name}" ist doppelt eingetragen`)
      byName.set(tool.name, tool)
    }
    this.#tools = [...tools]
    this.#byName = byName
  }

  /** {@inheritDoc ToolRegistry.list} */
  list(): readonly AgentTool[] {
    return this.#tools
  }

  /** {@inheritDoc ToolRegistry.get} */
  get(name: string): AgentTool | undefined {
    return this.#byName.get(name)
  }

  /** {@inheritDoc ToolRegistry.size} */
  get size(): number {
    return this.#tools.length
  }

  /** Fügt Werkzeuge hinzu und gibt eine **neue** Registry zurück. */
  with(...additional: readonly AgentTool[]): Tools {
    return new Tools([...this.#tools, ...additional])
  }
}

/** Eine leere Registry. */
export function emptyTools(): Tools {
  return new Tools([])
}

/**
 * Übersetzt die Registry in die Form, die der Anbieter bekommt.
 *
 * @param registry - die Registry
 * @returns die Werkzeugbeschreibungen in Registry-Reihenfolge
 */
export function toolSpecs(registry: ToolRegistry): readonly ToolSpec[] {
  return registry.list().map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))
}

/**
 * Führt einen Werkzeugaufruf aus und macht **immer** ein Ergebnis daraus.
 *
 * Vier Ausgänge, drei davon sind Ergebnisse statt Würfe:
 *
 * | Fall | Ergebnis |
 * |---|---|
 * | Werkzeug vorhanden, läuft | sein Text |
 * | Werkzeug unbekannt | `Unbekanntes Werkzeug "<name>". Verfügbar: a, b` |
 * | Werkzeug wirft | `Werkzeug "<name>" ist gescheitert: <Meldung>` |
 * | Aufruf abgebrochen | `Werkzeug "<name>" wurde abgebrochen` |
 *
 * **Warum die Liste der verfügbaren Werkzeuge im Text steht.** Ein Modell, das
 * einen Namen falsch geraten hat, korrigiert sich damit selbst. Ohne die Liste
 * rät es erneut — und der Turn kostet eine weitere Runde.
 *
 * **Warum der Fehlertext gekürzt wird.** Ein Werkzeug kann eine sehr lange
 * Meldung liefern (etwa ein Befehlsauszug). Eine unbegrenzte Meldung landet im
 * Verlauf und damit in jeder weiteren Anfrage.
 *
 * @param registry - die Registry
 * @param call - der Aufruf des Modells
 * @param context - Step und Abbruchsignal (die Kennung kommt aus `call`)
 * @returns das Ergebnis, immer mit der Kennung des Aufrufs
 */
export async function executeToolCall(
  registry: ToolRegistry,
  call: ToolCall,
  context: Omit<ToolContext, 'callId'>,
): Promise<ToolResultPart> {
  const tool = registry.get(call.name)
  if (tool === undefined) {
    const available = registry.list().map((entry) => entry.name).join(', ')
    return {
      type: 'tool-result',
      callId: call.id,
      content:
        available === ''
          ? `Unbekanntes Werkzeug "${call.name}". Es ist kein Werkzeug eingehängt.`
          : `Unbekanntes Werkzeug "${call.name}". Verfügbar: ${available}`,
    }
  }

  if (context.signal?.aborted === true) {
    return {
      type: 'tool-result',
      callId: call.id,
      content: `Werkzeug "${call.name}" wurde vor dem Start abgebrochen`,
    }
  }

  try {
    const result = await tool.execute(call.arguments, { ...context, callId: call.id })
    return { type: 'tool-result', callId: call.id, content: clampResult(result) }
  } catch (cause) {
    return {
      type: 'tool-result',
      callId: call.id,
      content: clampResult(`Werkzeug "${call.name}" ist gescheitert: ${describeCause(cause)}`),
    }
  }
}

/** Höchstlänge eines Werkzeugergebnisses, bevor es gekürzt wird. */
export const MAX_TOOL_RESULT_CHARS = 8000

/** Kürzt einen Text mit sichtbarem Vermerk. */
export function clampResult(text: string, max = MAX_TOOL_RESULT_CHARS): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}… [gekürzt: ${text.length - max} Zeichen]`
}

/** Eine kurze, sichere Beschreibung eines unbekannten Fehlers. */
export function describeCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}
