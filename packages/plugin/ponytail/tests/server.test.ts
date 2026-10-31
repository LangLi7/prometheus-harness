/**
 * Prüfungen für die Host-Hälfte — ohne laufenden Host.
 *
 * **Warum das geht.** `apply` verlangt nichts als drei Dienste und einen Kontext, von dem nur
 * `get('connection')` gelesen wird. Ein Ersatz mit diesen vier Teilen ist ehrlicher als ein
 * Start des ganzen Harness: er prüft genau die Behauptung — *off meldet Abschnitt und Skill ab*.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'
import type { Context } from '@deepseek-ai/cordis'

import { ABSCHNITT, DATEINAME, SKILL_NAME, WEG, apply } from '../src/index.ts'

/** Ein Prompt-Abschnitt, wie ihn der Kern bekäme. */
interface Abschnitt {
  readonly name: string
  readonly order: number
  readonly text: string
}

/** Ein Skill, wie ihn der Kern bekäme. */
interface Skill {
  readonly name: string
  readonly description: string
  readonly content: string
}

/** Ein Route-Handler. */
type Handler = (req: FakeRequest, res: FakeResponse) => Promise<void>

/** Was der Ersatz-Kontext mitschreibt. */
interface Aufzeichnung {
  readonly ctx: Context
  readonly abschnitte: Abschnitt[]
  readonly skills: Skill[]
  readonly handler: () => Handler
}

/**
 * Baut einen Kontext, der nur das kann, was das Plugin braucht.
 *
 * @returns der Kontext samt Aufzeichnung
 */
function ersatz(): Aufzeichnung {
  const abschnitte: Abschnitt[] = []
  const skills: Skill[] = []
  let handler: Handler | undefined

  const ctx = {
    systemPrompt: {
      section(abschnitt: Abschnitt): () => void {
        abschnitte.push(abschnitt)
        return () => {
          const stelle = abschnitte.indexOf(abschnitt)
          if (stelle >= 0) abschnitte.splice(stelle, 1)
        }
      },
    },
    skills: {
      register(skill: Skill): () => void {
        skills.push(skill)
        return () => {
          const stelle = skills.indexOf(skill)
          if (stelle >= 0) skills.splice(stelle, 1)
        }
      },
    },
    webServer: {
      register(route: { handler: Handler }): () => void {
        handler = route.handler
        return () => {
          handler = undefined
        }
      },
    },
    effect(setup: () => () => void): () => void {
      return setup()
    },
    get(name: string): unknown {
      return name === 'connection' ? { requestRejection: () => undefined } : undefined
    },
  }

  return {
    ctx: ctx as unknown as Context,
    abschnitte,
    skills,
    handler: () => {
      if (handler === undefined) throw new Error('keine Route eingehängt')
      return handler
    },
  }
}

/** Eine Anfrage, die sich lesen läßt. */
class FakeRequest {
  readonly method: string
  readonly headers: Record<string, string> = {}
  readonly #teile: Buffer[]

  constructor(method: string, koerper?: unknown) {
    this.method = method
    this.#teile = koerper === undefined ? [] : [Buffer.from(JSON.stringify(koerper), 'utf8')]
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Buffer> {
    for (const teil of this.#teile) yield teil
  }
}

/** Eine Antwort, die mitschreibt. */
class FakeResponse {
  status = 0
  koerper = ''
  readonly kopf: Record<string, string> = {}

  writeHead(status: number, kopf: Record<string, string>): this {
    this.status = status
    Object.assign(this.kopf, kopf)
    return this
  }

  setHeader(name: string, wert: string): void {
    this.kopf[name] = wert
  }

  end(text: string): void {
    this.koerper = text
  }

  get json(): unknown {
    return JSON.parse(this.koerper)
  }
}

const ORTE: string[] = []

/** Ein eigenes Home für einen Test. */
function home(): string {
  const pfad = mkdtempSync(join(tmpdir(), 'pmh-ponytail-'))
  ORTE.push(pfad)
  return pfad
}

afterEach(() => {
  for (const ort of ORTE.splice(0)) rmSync(ort, { recursive: true, force: true })
})

describe('apply', () => {
  test('registers a prompt section and a skill in the default level', async () => {
    const { ctx, abschnitte, skills } = ersatz()
    apply(ctx, { home: home() })

    expect(abschnitte).toHaveLength(1)
    expect(abschnitte[0]?.name).toBe(ABSCHNITT)
    expect(abschnitte[0]?.text).toContain('full')
    expect(skills.map((skill) => skill.name)).toEqual([SKILL_NAME])
  })

  test('answers GET with the current level', async () => {
    const { ctx, handler } = ersatz()
    apply(ctx, { home: home() })

    const antwort = new FakeResponse()
    await handler()(new FakeRequest('GET') as never, antwort as never)

    expect(antwort.status).toBe(200)
    expect(antwort.json).toEqual({ modus: 'full', modi: ['off', 'lite', 'full', 'ultra'] })
  })

  test('off detaches section and skill and writes the file', async () => {
    const pfad = home()
    const { ctx, abschnitte, skills, handler } = ersatz()
    apply(ctx, { home: pfad })

    const antwort = new FakeResponse()
    await handler()(new FakeRequest('POST', { modus: 'off' }) as never, antwort as never)

    expect(antwort.status).toBe(200)
    expect(abschnitte).toHaveLength(0)
    expect(skills).toHaveLength(0)
    expect(JSON.parse(readFileSync(join(pfad, DATEINAME), 'utf8')).modus).toBe('off')
  })

  test('a new level replaces the section instead of stacking it', async () => {
    const { ctx, abschnitte, handler } = ersatz()
    apply(ctx, { home: home() })

    await handler()(new FakeRequest('POST', { modus: 'ultra' }) as never, new FakeResponse() as never)

    expect(abschnitte).toHaveLength(1)
    expect(abschnitte[0]?.text).toContain('ultra')
  })

  test('rejects an unknown level without touching the state', async () => {
    const { ctx, abschnitte, handler } = ersatz()
    apply(ctx, { home: home() })

    const antwort = new FakeResponse()
    await handler()(new FakeRequest('POST', { modus: 'max' }) as never, antwort as never)

    expect(antwort.status).toBe(400)
    expect(abschnitte).toHaveLength(1)
    expect(abschnitte[0]?.text).toContain('full')
  })

  test('keeps the state file path stable across restarts', async () => {
    const pfad = home()
    const erst = ersatz()
    apply(erst.ctx, { home: pfad })
    await erst.handler()(new FakeRequest('POST', { modus: 'lite' }) as never, new FakeResponse() as never)

    const zweit = ersatz()
    apply(zweit.ctx, { home: pfad })

    expect(zweit.abschnitte[0]?.text).toContain('lite')
    expect(zweit.skills).toHaveLength(1)
  })

  test('does not register a section when the file says off', () => {
    const pfad = home()
    const erst = ersatz()
    apply(erst.ctx, { home: pfad })
    const weg = join(pfad, DATEINAME)
    // Datei von Hand setzen, wie sie ein Neustart vorfindet.
    writeFileSync(weg, '{"modus":"off"}', 'utf8')

    const zweit = ersatz()
    apply(zweit.ctx, { home: pfad })

    expect(zweit.abschnitte).toHaveLength(0)
    expect(zweit.skills).toHaveLength(0)
  })
})

describe('WEG', () => {
  test('is one route for one state', () => {
    expect(WEG).toBe('/api/pmh/ponytail')
  })
})
