/**
 * Das Einhängen — ohne Host, aber mit einem Kontext, der **mitschreibt**.
 *
 * ## Was diese Prüfung beweist
 *
 * Daß `apply` die sechs Adressen einträgt, die fünf Werkzeuge anmeldet — und daß beim Abhängen
 * alles wieder verschwindet. Was sie **nicht** beweist: daß der echte Loader das Plugin lädt. Das
 * steht erst nach einem Neustart des Hosts fest (und in `GET /api/ai/capabilities`).
 *
 * ## Warum ein eigener Fake-Kontext statt `cordis`
 *
 * Der Kontext des Kerns hat mehr, als dieses Plugin braucht (Fiber, Lebenszyklus, Dienste). Ein
 * Fake mit genau den vier Aufrufen, die `apply` macht, zeigt, **was** das Plugin vom Host verlangt —
 * und das ist selbst eine Auskunft über den Vertrag.
 *
 * @module @prometheus-harness/ai-capabilities/tests/plugin
 */

import { describe, expect, test } from 'bun:test'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import { ROUTEN, apply, alsKernWerkzeug, name } from '../src/index.ts'

interface Fake {
  readonly ctx: Context
  readonly routen: WebRoute[]
  readonly werkzeuge: ToolDefinition[]
  readonly wirkungen: (() => void)[]
  readonly abmelden: () => void
}

/** Baut einen Kontext, der nur das kann, was `apply` verlangt. */
function macheFake(mitWerkzeugen = true): Fake {
  const routen: WebRoute[] = []
  const werkzeuge: ToolDefinition[] = []
  const wirkungen: (() => void)[] = []
  const ctx = {
    get: (dienst: string) =>
      dienst === 'tools' && mitWerkzeugen
        ? {
            register: (definition: ToolDefinition) => {
              werkzeuge.push(definition)
              return () => {
                const at = werkzeuge.indexOf(definition)
                if (at >= 0) werkzeuge.splice(at, 1)
              }
            },
          }
        : undefined,
    webServer: {
      register: (route: WebRoute) => {
        routen.push(route)
        return () => {
          const at = routen.indexOf(route)
          if (at >= 0) routen.splice(at, 1)
        }
      },
    },
    effect: (fn: () => () => void) => {
      wirkungen.push(fn())
    },
  } as unknown as Context
  return {
    ctx,
    routen,
    werkzeuge,
    wirkungen,
    abmelden: () => {
      for (const ab of wirkungen.splice(0).reverse()) ab()
    },
  }
}

describe('Das Plugin', () => {
  test('trägt sechs Adressen ein — jede genau einmal', () => {
    const fake = macheFake()
    apply(fake.ctx)
    expect(fake.routen).toHaveLength(6)
    expect(fake.routen.map((r) => r.path).sort()).toEqual(Object.values(ROUTEN).sort())
    expect(fake.routen.every((r) => r.kind === 'exact')).toBe(true)
  })

  test('meldet fünf Werkzeuge an', () => {
    const fake = macheFake()
    apply(fake.ctx)
    expect(fake.werkzeuge.map((w) => w.name).sort()).toEqual([
      'ai_decide',
      'image_generate',
      'speech_speak',
      'speech_transcribe',
      'text_embed',
    ])
  })

  test('ohne Werkzeugdienst bleiben die Adressen stehen — und nichts wirft', () => {
    const fake = macheFake(false)
    expect(() => apply(fake.ctx)).not.toThrow()
    expect(fake.routen).toHaveLength(6)
    expect(fake.werkzeuge).toHaveLength(0)
  })

  test('beim Abhängen verschwindet alles wieder', () => {
    const fake = macheFake()
    apply(fake.ctx)
    fake.abmelden()
    expect(fake.routen).toHaveLength(0)
    expect(fake.werkzeuge).toHaveLength(0)
  })

  test('der Plugin-Name ist stabil', () => {
    expect(name).toBe('pmh-ai-capabilities')
  })

  test('die Brücke liefert den Text, wenn kein JSON kommt', async () => {
    const definition = alsKernWerkzeug({
      name: 'x',
      description: 'd',
      parameters: {},
      execute: async () => 'kein JSON',
    })
    const wert = await definition.execute({}, {} as never)
    expect(wert).toBe('kein JSON')
  })

  test('die Brücke parst JSON zu einem Wert', async () => {
    const definition = alsKernWerkzeug({
      name: 'x',
      description: 'd',
      parameters: {},
      execute: async () => '{"a":1}',
    })
    const wert = await definition.execute({}, {} as never)
    expect(wert).toEqual({ a: 1 })
  })
})
