/**
 * Die Werkzeugbrücke: unser `AgentTool` wird ein `ToolDefinition` des Kerns.
 *
 * ## Warum das eine Brücke ist und keine Kopie
 *
 * Der Kern verlangt mehr als einen Namen und eine Funktion: `ToolDefinition` trägt ein **Ausgabe-
 * schema** (`output.schema`) und eine **reine Darstellung** (`output.render`), und `execute` liefert
 * den **kanonischen Wert** — nicht den Text. Unser `AgentTool` liefert Text (so verlangt es unser
 * eigener Seam). Die Brücke ist deshalb:
 *
 * | unser Seam | Kern |
 * |---|---|
 * | `execute(args, ctx) → string` | `execute(args, exec) → unknown` (JSON wird geparst) |
 * | Text als Ergebnis | `output.render(args, value) → [{type:'text', text}]` |
 * | — | `output.schema`: offen (`{type:'object'}`), weil der Wert ein Bericht ist |
 *
 * ## Warum das Ausgabeschema offen ist — und was das kostet
 *
 * Ein enges Schema wäre eine Zusage, die wir nicht halten: die Werkzeuge liefern Berichte, deren
 * Felder sich mit der Planstruktur ändern. Ein `{type:'object'}` prüft „ist ein Objekt" und nicht
 * mehr. Wer strengere Prüfung will, gibt ein Schema an — dann scheitert ein abweichender Wert
 * sichtbar, statt durchzurutschen.
 *
 * @module @prometheus-harness/crew-plugin/tool-bridge
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { AgentTool } from '@prometheus-harness/agent-tools'

/** Was die Brücke an Schema zulässt. */
export interface BrueckenOptionen {
  /** Ein eigenes Ausgabeschema; Vorgabe `{ type: 'object' }`. */
  ausgabeSchema?: Readonly<Record<string, unknown>>
}

/**
 * Baut aus einem `AgentTool` ein `ToolDefinition` des Kerns.
 *
 * @param werkzeug - das Werkzeug aus unserem Seam
 * @param optionen - optional ein engeres Ausgabeschema
 * @returns die Definition, wie `ctx.tools.register` sie verlangt
 * @throws Error wenn das Werkzeug keinen Namen trägt
 */
export function alsKernWerkzeug(werkzeug: AgentTool, optionen: BrueckenOptionen = {}): ToolDefinition {
  if (werkzeug.name.trim() === '') throw new Error('ein Werkzeug ohne Namen laesst sich nicht anmelden')
  return {
    name: werkzeug.name,
    description: werkzeug.description,
    parameters: werkzeug.parameters as Record<string, unknown>,
    output: {
      schema: (optionen.ausgabeSchema ?? { type: 'object' }) as unknown as ToolDefinition['output']['schema'],
      render: (_args: unknown, value: unknown): ContentBlock[] => [{
        type: 'text',
        text: typeof value === 'string' ? value : JSON.stringify(value),
      }] as unknown as ContentBlock[],
    },
    execute: async (args: unknown, exec: ToolRunContext): Promise<unknown> => {
      const text = await werkzeug.execute(
        (typeof args === 'object' && args !== null ? args : {}) as Readonly<Record<string, unknown>>,
        {
          signal: exec.signal,
          // Unser Seam zählt Steps selbst; der Kern gibt hier keine Nummer, also 1.
          step: 1,
          callId: String(exec.rootCallId),
        },
      )
      // **Kein stilles Fangen.** Was kein JSON ist, kommt als Text zurück — der Kern reicht es
      // weiter, und das Modell sieht den Bericht statt eines Abbruchs.
      try {
        return JSON.parse(text) as unknown
      } catch {
        return text
      }
    },
  }
}
