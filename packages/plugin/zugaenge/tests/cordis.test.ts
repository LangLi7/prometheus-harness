/**
 * Die Naht unter dem **echten** Cordis — nicht unter einem Fake-Kontext.
 *
 * ## Warum diese Prüfung nötig ist
 *
 * Die übrigen Tests bauen einen Kontext, der nur die vier Methoden hat, die `apply` benutzt.
 * Damit ist geprüft, **was** das Plugin tut — nicht, ob es das unter der echten Registry **darf**:
 *
 * - `ctx.provide` gehört einem **Fiber**. Ein nacktes `provide` in `apply` wäre dauerhaft; ein
 *   Ausschalten und Wiedereinschalten im Plugin-Fenster liefe in „already provided".
 * - `inject: ['webServer']` muß den Fiber wirklich erst starten, wenn der Dienst da ist.
 * - Beim Abhängen müssen Routen **und** Dienst verschwinden — sonst zeigt die nächste Instanz auf
 *   einen toten Kontext.
 *
 * Genau das prüft diese Datei: laden, abhängen, **wieder** laden.
 *
 * @module @prometheus-harness/zugaenge/tests/cordis
 */

import { describe, expect, test } from 'bun:test'

import { Context } from '@deepseek-ai/cordis'
import type { Plugin } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

import { ROUTEN, apply, name } from '../src/server.ts'

/** Baut einen echten Cordis-Kontext mit den zwei Diensten, die das Plugin braucht. */
function welt(): { ctx: Context; routen: WebRoute[] } {
  const ctx = new Context()
  const routen: WebRoute[] = []
  const roh = ctx as unknown as { provide: (dienst: string, wert: unknown) => () => void }
  roh.provide('webServer', {
    register: (route: WebRoute) => {
      routen.push(route)
      return () => {
        const at = routen.indexOf(route)
        if (at >= 0) routen.splice(at, 1)
      }
    },
  })
  roh.provide('connection', { requestRejection: () => undefined })
  return { ctx, routen }
}

/** Das Plugin in der Form, die der Loader sieht. */
const PLUGIN = { name, inject: ['webServer'], apply } as unknown as Plugin

describe('Unter echtem Cordis', () => {
  test('lädt, hängt vier Routen ein und stellt den Dienst bereit', async () => {
    const { ctx, routen } = welt()
    const fiber = ctx.plugin(PLUGIN)
    await fiber
    expect(routen.map((route) => route.path).sort()).toEqual(Object.values(ROUTEN).sort())
    expect(ctx.get('zugaenge')).toBeDefined()
    await fiber.dispose()
  })

  test('beim Abhängen verschwinden Routen UND Dienst — sonst stirbt das zweite Laden', async () => {
    const { ctx, routen } = welt()
    const erste = ctx.plugin(PLUGIN)
    await erste
    await erste.dispose()
    expect(routen).toEqual([])
    expect(ctx.get('zugaenge')).toBeUndefined()

    // **Der eigentliche Beweis.** Ohne den Effekt um `provide` wäre hier „already provided".
    const zweite = ctx.plugin(PLUGIN)
    await zweite
    expect(routen).toHaveLength(4)
    await zweite.dispose()
    expect(routen).toEqual([])
  })

  test('zwei Instanzen nebeneinander teilen den Dienst, statt zu werfen', async () => {
    const { ctx, routen } = welt()
    const erste = ctx.plugin(PLUGIN)
    await erste
    const zweite = ctx.plugin(PLUGIN)
    await zweite
    expect(ctx.get('zugaenge')).toBeDefined()
    expect(routen).toHaveLength(8)
    await zweite.dispose()
    await erste.dispose()
    expect(routen).toEqual([])
  })
})
