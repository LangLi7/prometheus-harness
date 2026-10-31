/**
 * Die Prüfungen für das zusammengesetzte Werkzeug.
 *
 * Sie brauchen keinen Host: der Kontext ist ein Doppel, der Sandkasten ein Attrappenpaar. Was
 * hier geprüft wird, ist die Naht, an der Fehler teuer sind — leerer Programmtext, fehlender
 * Sandkasten, und dass ein Programm seine Werkzeuge überhaupt als `tools.*` bekommt.
 */

import { describe, expect, test } from 'bun:test'

import type { ToolRunContext } from '@deepseek-ai/dsh-tools'

import { TOOL_NAME, baueWerkzeug } from '../src/server.ts'

/** Ein Ausführungskontext, wie ihn die Registry reicht — nur die Felder, die das Werkzeug liest. */
function ausfuehrung(): ToolRunContext {
  return {
    callId: 'call-1',
    rootCallId: 'call-1',
    name: TOOL_NAME,
    arguments: {},
    token: Symbol('token'),
    signal: new AbortController().signal,
  } as unknown as ToolRunContext
}

/** Ein Kontext mit genau den Diensten, die das Werkzeug braucht. */
function kontext(ueberschreiben: { ptc?: unknown; ausfuehren?: (name: string) => unknown } = {}): unknown {
  const aufrufe: string[] = []
  const basis = {
    tools: {
      schemas: () => [
        { name: 'read', description: 'Read a file', parameters: {} },
        { name: 'grep', description: 'Search', parameters: {} },
      ],
      execute: async (eingabe: { name: string }) => {
        aufrufe.push(eingabe.name)
        if (ueberschreiben.ausfuehren !== undefined) return ueberschreiben.ausfuehren(eingabe.name)
        return { isError: false, content: [{ type: 'text', text: '{"treffer":2}' }] }
      },
    },
    aufrufe,
  } as Record<string, unknown>
  if (ueberschreiben.ptc !== undefined) basis.ptcRuntime = ueberschreiben.ptc
  return basis
}

describe('run_program', () => {
  test('traegt den oeffentlichen Namen und zwei Pflichtfelder', () => {
    const werkzeug = baueWerkzeug(kontext() as never)
    expect(werkzeug.name).toBe(TOOL_NAME)
    expect(werkzeug.description.length).toBeGreaterThan(80)
    const parameter = werkzeug.parameters as Record<string, { required?: boolean }>
    expect(parameter.code?.required).toBe(true)
    expect(parameter.description?.required).toBe(true)
  })

  test('lehnt leeren Programmtext ab, ohne den Sandkasten zu fragen', async () => {
    const werkzeug = baueWerkzeug(kontext() as never)
    const ergebnis = (await werkzeug.execute({ description: 'x', code: '   ' }, ausfuehrung())) as {
      ok: boolean
    }
    expect(ergebnis.ok).toBe(false)
  })

  test('meldet einen fehlenden Sandkasten als Ergebnis, nicht als Ausnahme', async () => {
    const werkzeug = baueWerkzeug(kontext() as never)
    const ergebnis = (await werkzeug.execute({ description: 'x', code: 'return 1' }, ausfuehrung())) as {
      ok: boolean
      error: string
    }
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.error).toContain('ptcRuntime')
  })

  test('reicht die sichtbaren Werkzeuge als Bindings an den Sandkasten', async () => {
    let gesehen: unknown
    const ptc = {
      resolve: (anfrage: unknown) => {
        gesehen = anfrage
        return { anfrage }
      },
      run: async () => ({ value: 'fertig', logs: [] }),
    }
    const werkzeug = baueWerkzeug(kontext({ ptc }) as never)
    const ergebnis = (await werkzeug.execute(
      { description: 'alle Dateien zaehlen', code: 'return await tools.grep({ pattern: "x" })' },
      ausfuehrung(),
    )) as { ok: boolean; value: unknown }

    expect(ergebnis.ok).toBe(true)
    expect(ergebnis.value).toBe('fertig')

    const bindings = (gesehen as { bindings: { global: string; functions: Record<string, unknown> }[] }).bindings
    expect(bindings[0]?.global).toBe('tools')
    expect(Object.keys(bindings[0]?.functions ?? {})).toEqual(['read', 'grep'])
  })

  test('laesst gesperrte Werkzeuge aus dem Programm heraus', async () => {
    let gesehen: unknown
    const ptc = {
      resolve: (anfrage: unknown) => {
        gesehen = anfrage
        return anfrage
      },
      run: async () => ({ value: null, logs: [] }),
    }
    const werkzeug = baueWerkzeug(kontext({ ptc }) as never, { deniedTools: ['read'] })
    await werkzeug.execute({ description: 'x', code: 'return 1' }, ausfuehrung())

    const bindings = (gesehen as { bindings: { functions: Record<string, unknown> }[] }).bindings
    expect(Object.keys(bindings[0]?.functions ?? {})).toEqual(['grep'])
  })
})
