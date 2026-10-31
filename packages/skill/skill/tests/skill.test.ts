/**
 * Prüfungen der Skill-Registry.
 *
 * Der Aufbau folgt der Frage, die das Paket beantworten muß: **welcher Eintrag gewinnt, und
 * wann wird neu gelesen?** Jede Prüfung stellt deshalb einen Namensstreit oder eine
 * Cache-Bedingung her und beobachtet, was der Aufrufer sieht — nicht, wie die Registry es
 * intern ablegt.
 */

import { describe, expect, test } from 'bun:test'

import { createScope } from '@prometheus-harness/scope'
import {
  BUNDLED_SKILL_RANK,
  SkillRegistry,
  escapeText,
  isModelInvocable,
  isSkillName,
  isUserInvocable,
  renderSkillContent,
  type SkillCandidate,
  type SkillDefinition,
  type SkillLookupOptions,
  type SkillProvider,
  type SkillProviderControl,
} from '../src/index.ts'

/** Eine Fähigkeit ohne Aufruf-Einschränkung. */
function skill(name: string, content = `Inhalt von ${name}`): SkillDefinition {
  return {
    name,
    description: `Beschreibung von ${name}`,
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'custom',
    provider: 'test',
    content,
  }
}

/** Ein Kandidat, wie ihn ein Anbieter liefert. */
function candidate(
  name: string,
  provider: string,
  extra: Partial<SkillCandidate> = {},
): SkillCandidate {
  return {
    name,
    description: `Beschreibung von ${name}`,
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'custom',
    provider,
    rank: 300,
    locator: { name },
    ...extra,
  }
}

/** Ein Anbieter aus festen Kandidaten; zählt seine Aufrufe. */
function providerOf(
  name: string,
  candidates: readonly SkillCandidate[] | ((options: SkillLookupOptions) => readonly SkillCandidate[]),
): SkillProvider & { listCalls: number; getCalls: number } {
  const state = {
    listCalls: 0,
    getCalls: 0,
    name,
    async list(options: SkillLookupOptions) {
      state.listCalls += 1
      return typeof candidates === 'function' ? candidates(options) : candidates
    },
    async get(entry: SkillCandidate) {
      state.getCalls += 1
      return {
        ...skill(entry.name),
        description: entry.description,
        invocation: entry.invocation,
        provider: name,
        source: entry.source,
      }
    },
  }
  return state
}

/** Eine Laufzeit-Registrierung ohne Anbieterfeld — die Registry setzt `runtime`. */
function runtimeSkill(name: string, content = `Inhalt von ${name}`): {
  name: string
  description: string
  source: 'runtime'
  content: string
} {
  return { name, description: `Beschreibung von ${name}`, source: 'runtime', content }
}

describe('isSkillName', () => {
  test('nimmt Kebab-Case und lehnt alles andere ab', () => {
    expect(isSkillName('code-review')).toBe(true)
    expect(isSkillName('a1')).toBe(true)
    expect(isSkillName('Code-Review')).toBe(false)
    expect(isSkillName('-start')).toBe(false)
    expect(isSkillName('zwei--striche')).toBe(false)
    expect(isSkillName('mit_unterstrich')).toBe(false)
    expect(isSkillName('')).toBe(false)
  })
})

describe('Aufruf-Richtlinie', () => {
  test('liest die beiden Schalter getrennt', () => {
    expect(isModelInvocable({ invocation: { modelInvocable: true, userInvocable: false } })).toBe(true)
    expect(isUserInvocable({ invocation: { modelInvocable: true, userInvocable: false } })).toBe(false)
    expect(isModelInvocable({ invocation: { modelInvocable: false, userInvocable: true } })).toBe(false)
    expect(isUserInvocable({ invocation: { modelInvocable: false, userInvocable: true } })).toBe(true)
  })
})

describe('Laufzeit-Fähigkeiten', () => {
  test('erscheinen im Katalog und laden ihren Rumpf', async () => {
    const registry = new SkillRegistry()
    registry.register(runtimeSkill('eigene'))
    expect((await registry.list()).map((entry) => entry.name)).toEqual(['eigene'])
    const loaded = await registry.get('eigene')
    expect(loaded?.content).toBe('Inhalt von eigene')
    expect(loaded?.provider).toBe('runtime')
  })

  test('fehlende Aufruf-Schalter erlauben beide Wege', async () => {
    const registry = new SkillRegistry()
    registry.register({
      name: 'ohne-schalter',
      description: 'ohne Angabe',
      source: 'runtime',
      content: 'x',
    })
    const loaded = await registry.get('ohne-schalter')
    expect(loaded?.invocation).toEqual({ modelInvocable: true, userInvocable: true })
  })

  test('gleicher Name in einer Schicht: der erste gewinnt, der zweite wird gemeldet', async () => {
    const meldungen: string[] = []
    const registry = new SkillRegistry({ logger: { warn: (text) => meldungen.push(text) } })
    const ersteAbmeldung = registry.register(runtimeSkill('doppelt', 'erster'))
    const zweiteAbmeldung = registry.register(runtimeSkill('doppelt', 'zweiter'))

    expect((await registry.get('doppelt'))?.content).toBe('erster')
    expect(meldungen.some((text) => text.includes('bereits registriert'))).toBe(true)
    // Die wirkungslose Rücknahme darf den Gewinner nicht entfernen.
    zweiteAbmeldung()
    expect((await registry.get('doppelt'))?.content).toBe('erster')
    ersteAbmeldung()
    expect(await registry.get('doppelt')).toBeUndefined()
  })

  test('Abmeldung entfernt den Eintrag und meldet die Änderung', async () => {
    const registry = new SkillRegistry()
    let änderungen = 0
    registry.onChange(() => { änderungen += 1 })
    const abmelden = registry.register(runtimeSkill('fluechtig'))
    expect(await registry.list()).toHaveLength(1)
    abmelden()
    abmelden()
    expect(await registry.list()).toHaveLength(0)
    expect(änderungen).toBe(2)
  })

  test('lehnt ungültige Namen und leere Beschreibungen ab', () => {
    const registry = new SkillRegistry()
    expect(() => registry.register({ ...skill('Gross'), name: 'Gross' })).toThrow('Ungültiger Fähigkeitsname')
    expect(() =>
      registry.register({ name: 'leer', description: '', source: 'runtime', content: '' }),
    ).toThrow('braucht eine Beschreibung')
  })
})

describe('Anbieter', () => {
  test('Rang entscheidet vor Anbieter-Reihenfolge', async () => {
    const registry = new SkillRegistry()
    const niedrig = providerOf('niedrig', [candidate('streit', 'niedrig', { rank: 500 })])
    const hoch = providerOf('hoch', [candidate('streit', 'hoch', { rank: 100 })])
    registry.registerProvider(() => niedrig)
    registry.registerProvider(() => hoch)

    const geladen = await registry.get('streit')
    expect(geladen?.provider).toBe('hoch')
    expect(niedrig.getCalls).toBe(0)
  })

  test('gleicher Rang: der zuerst registrierte Anbieter gewinnt', async () => {
    const registry = new SkillRegistry()
    const erst = providerOf('erst', [candidate('streit', 'erst')])
    const zweit = providerOf('zweit', [candidate('streit', 'zweit')])
    registry.registerProvider(() => erst)
    registry.registerProvider(() => zweit)

    expect((await registry.get('streit'))?.provider).toBe('erst')
  })

  test('Rang 100 schlägt eine Laufzeit-Fähigkeit, Rang 400 verliert gegen sie', async () => {
    const registry = new SkillRegistry()
    const projekt = providerOf('projekt', [candidate('streit', 'projekt', { rank: 100 })])
    const benutzer = providerOf('benutzer', [candidate('anderer', 'benutzer', { rank: 400 })])
    registry.registerProvider(() => projekt)
    registry.registerProvider(() => benutzer)
    registry.register(runtimeSkill('streit', 'laufzeit'))
    registry.register(runtimeSkill('anderer', 'laufzeit'))

    expect((await registry.get('streit'))?.provider).toBe('projekt')
    expect((await registry.get('anderer'))?.provider).toBe('runtime')
  })

  test('Anbieter, die werfen, werden übersprungen und der Katalog bleibt unvollständig', async () => {
    const meldungen: string[] = []
    const registry = new SkillRegistry({ logger: { warn: (text) => meldungen.push(text) } })
    registry.registerProvider(() => ({
      name: 'kaputt',
      async list() {
        throw new Error('Netz weg')
      },
      async get() {
        return undefined
      },
    }))
    registry.registerProvider(() => providerOf('heil', [candidate('heil', 'heil')]))

    const snapshot = await registry.snapshot()
    expect(snapshot.skills.map((entry) => entry.name)).toEqual(['heil'])
    expect(snapshot.complete).toBe(false)
    expect(meldungen.some((text) => text.includes('Netz weg'))).toBe(true)
  })

  test('eine unvollständige Beobachtung wird nicht zwischengespeichert', async () => {
    const registry = new SkillRegistry()
    const anbieter = providerOf('teil', [candidate('teil', 'teil')])
    let vollständig = false
    registry.registerProvider((_control: SkillProviderControl) => ({
      name: 'teil',
      async list() {
        anbieter.listCalls += 1
        return { candidates: [candidate('teil', 'teil')], complete: vollständig }
      },
      get: anbieter.get,
    }))

    expect((await registry.snapshot()).complete).toBe(false)
    expect((await registry.snapshot()).complete).toBe(false)
    expect(anbieter.listCalls).toBe(2)

    vollständig = true
    expect((await registry.snapshot()).complete).toBe(true)
    await registry.snapshot()
    expect(anbieter.listCalls).toBe(3)
  })

  test('doppelter Anbietername in einer Schicht wirft, der reservierte Name ebenso', () => {
    const registry = new SkillRegistry()
    const anbieter = providerOf('gleich', [])
    registry.registerProvider(() => anbieter)
    expect(() => registry.registerProvider(() => anbieter)).toThrow('bereits registriert')
    expect(() =>
      registry.registerProvider(() => providerOf('runtime', [])),
    ).toThrow('reserviert')
  })

  test('die Fabrik erhält eine Steuerung, deren Abbruch die Abmeldung meldet', () => {
    const registry = new SkillRegistry()
    let gesehen: SkillProviderControl | undefined
    const abmelden = registry.registerProvider((control) => {
      gesehen = control
      return providerOf('beobachtet', [])
    })
    expect(gesehen?.signal.aborted).toBe(false)
    abmelden()
    expect(gesehen?.signal.aborted).toBe(true)
  })

  test('invalidate verwirft nur, solange genau diese Registrierung lebt', async () => {
    const registry = new SkillRegistry()
    let steuerung: SkillProviderControl | undefined
    const anbieter = providerOf('zaehler', [candidate('zaehler', 'zaehler')])
    const abmelden = registry.registerProvider((control) => {
      steuerung = control
      return anbieter
    })

    await registry.snapshot()
    await registry.snapshot()
    expect(anbieter.listCalls).toBe(1)

    steuerung?.invalidate()
    await registry.snapshot()
    expect(anbieter.listCalls).toBe(2)

    abmelden()
    steuerung?.invalidate()
    await registry.snapshot()
    expect(anbieter.listCalls).toBe(2)
  })
})

describe('Katalog-Cache', () => {
  test('gleicher Suchkontext liest einmal; ein anderes cwd liest neu', async () => {
    const registry = new SkillRegistry()
    const anbieter = providerOf('wurzel', () => [candidate('wurzel', 'wurzel')])
    registry.registerProvider(() => anbieter)

    await registry.snapshot({ cwd: 'C:/a' })
    await registry.snapshot({ cwd: 'C:/a' })
    expect(anbieter.listCalls).toBe(1)

    await registry.snapshot({ cwd: 'C:/b' })
    expect(anbieter.listCalls).toBe(2)
  })

  test('die Grenze verdrängt den ältesten Katalog', async () => {
    const registry = new SkillRegistry({ collectCacheMaxEntries: 1 })
    const anbieter = providerOf('wurzel', () => [candidate('wurzel', 'wurzel')])
    registry.registerProvider(() => anbieter)

    await registry.snapshot({ cwd: 'C:/a' })
    await registry.snapshot({ cwd: 'C:/b' })
    await registry.snapshot({ cwd: 'C:/a' })
    expect(anbieter.listCalls).toBe(3)
  })
})

describe('Schichtung', () => {
  test('der nächste Scope verdeckt denselben Namen, globale Einträge bleiben sichtbar', async () => {
    const registry = new SkillRegistry()
    const agentScope = createScope('agent')
    registry.register(runtimeSkill('global'))
    registry.register(runtimeSkill('global', 'eng'), { scope: agentScope })

    const weit = await registry.list()
    const eng = await registry.list({ scope: agentScope })
    expect(weit.map((entry) => entry.name)).toEqual(['global'])
    expect(eng.map((entry) => entry.name)).toEqual(['global'])
    expect((await registry.get('global', { scope: agentScope }))?.content).toBe('eng')
    expect((await registry.get('global'))?.content).toBe('Inhalt von global')
  })

  test('ein fremder Scope sieht die Einträge eines anderen nicht', async () => {
    const registry = new SkillRegistry()
    const a = createScope('agent-a')
    const b = createScope('agent-b')
    registry.register(runtimeSkill('nur-a'), { scope: a })

    expect(await registry.list({ scope: a })).toHaveLength(1)
    expect(await registry.list({ scope: b })).toHaveLength(0)
  })

  test('eine Kette verdeckt von der Wurzel bis zum nächsten Scope', async () => {
    const registry = new SkillRegistry()
    const wurzel = createScope('wurzel')
    const kind = createScope('kind', wurzel)
    registry.register(runtimeSkill('stufe', 'wurzel'), { scope: wurzel })
    registry.register(runtimeSkill('stufe', 'kind'), { scope: kind })

    expect((await registry.get('stufe', { scope: kind }))?.content).toBe('kind')
    expect((await registry.get('stufe', { scope: wurzel }))?.content).toBe('wurzel')
  })

  test('gleicher Anbietername ist je Schicht erlaubt, der nächste Eintrag gewinnt', async () => {
    const registry = new SkillRegistry()
    registry.registerProvider(() => providerOf('lokal', [candidate('streit', 'lokal', { description: 'global' })]))
    const scope = createScope('preset')
    registry.registerProvider(
      () => providerOf('lokal', [candidate('streit', 'lokal', { description: 'eng' })]),
      { scope },
    )

    expect((await registry.list({ scope })).map((entry) => entry.name)).toEqual(['streit'])
    expect((await registry.get('streit', { scope }))?.description).toBe('eng')
    expect((await registry.get('streit'))?.description).toBe('global')
  })
})

describe('get', () => {
  test('ein unbekannter oder ungültiger Name ist undefined, kein Wurf', async () => {
    const registry = new SkillRegistry()
    expect(await registry.get('fehlt')).toBeUndefined()
    expect(await registry.get('Gross')).toBeUndefined()
  })

  test('ein abgebrochenes Signal bricht das Laden ab', async () => {
    const registry = new SkillRegistry()
    registry.registerProvider(() => ({
      name: 'langsam',
      async list() {
        return [candidate('langsam', 'langsam')]
      },
      async get() {
        return await new Promise<undefined>(() => {})
      },
    }))
    const controller = new AbortController()
    const ladung = registry.get('langsam', { signal: controller.signal })
    controller.abort(new Error('genug'))
    await expect(ladung).rejects.toThrow('genug')
  })

  test('ein Rumpf mit fremdem Namen wird verworfen und der Katalog neu gelesen', async () => {
    const registry = new SkillRegistry()
    let geliefert: SkillDefinition | undefined
    let listCalls = 0
    const anbieter: SkillProvider = {
      name: 'vertauscht',
      async list() {
        listCalls += 1
        return [candidate('vertauscht', 'vertauscht')]
      },
      async get() {
        return geliefert
      },
    }
    registry.registerProvider(() => anbieter)

    await registry.snapshot()
    geliefert = { ...skill('anderer'), provider: 'vertauscht' }
    expect(await registry.get('vertauscht')).toBeUndefined()

    await registry.snapshot()
    expect(listCalls).toBe(2)
  })

  test('ein Anbieter, der den Rumpf nicht mehr hat, liefert undefined', async () => {
    const registry = new SkillRegistry()
    registry.registerProvider(() => ({
      name: 'weg',
      async list() {
        return [candidate('weg', 'weg')]
      },
      async get() {
        return undefined
      },
    }))
    expect(await registry.get('weg')).toBeUndefined()
  })
})

describe('Rendering', () => {
  test('rendert eine feste Rahmung mit Basisverzeichnis', () => {
    const text = renderSkillContent({
      name: 'code-review',
      provider: 'filesystem',
      resourceBase: { kind: 'directory', path: 'C:/skills/code-review' },
      content: 'Prüfe den Code.',
    })
    expect(text).toContain('<skill_content name="code-review">')
    expect(text).toContain('<skill_resources>')
    expect(text).toContain('Basisverzeichnis dieser Fähigkeit: C:/skills/code-review')
    expect(text).toContain('<skill_instructions>\nPrüfe den Code.\n</skill_instructions>')
    expect(text.endsWith('</skill_content>')).toBe(true)
  })

  test('entschärft Anbieternamen im Rahmen und den Namen im Attribut', () => {
    const text = renderSkillContent({
      name: 'x',
      provider: '<script>',
      content: '',
    })
    expect(text).toContain('&lt;script&gt;')
    expect(text).not.toContain('<script>')
    expect(escapeText('a&b<c>d')).toBe('a&amp;b&lt;c&gt;d')
  })

  test('BUNDLED_SKILL_RANK ist der Rang gebündelter Wurzeln', () => {
    expect(BUNDLED_SKILL_RANK).toBe(600)
  })
})
