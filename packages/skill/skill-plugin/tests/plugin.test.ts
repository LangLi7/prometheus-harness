/**
 * Prüfungen der Host-Brücke gegen einen **nachgebauten** Cordis-Kontext.
 *
 * Der Kern wird nicht gestartet. Festgenagelt wird der Vertrag, den das Plugin ihm gegenüber
 * hat: `registerProvider` erhält eine Fabrik, die Fabrik erhält die Steuerung, der Anbieter
 * liefert die Fähigkeiten aus den konfigurierten Wurzeln, und das Abmelden nimmt beides
 * zurück — Anbieter und Beobachtung.
 */

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { SkillCandidate, SkillProvider, SkillProviderControl, SkillProviderObservation } from '@deepseek-ai/dsh-skill'
import { apply, applyMitKonfiguration, name, type HostKontext } from '../src/index.ts'

const wurzeln: string[] = []

afterAll(async () => {
  for (const wurzel of wurzeln) await rm(wurzel, { recursive: true, force: true })
})

function kandidaten(out: readonly SkillCandidate[] | SkillProviderObservation | undefined): readonly SkillCandidate[] {
  if (out === undefined) return []
  return 'candidates' in out ? out.candidates : out
}

async function neuesVerzeichnis(): Promise<string> {
  const pfad = await mkdtemp(join(tmpdir(), 'pmh-skill-plugin-'))
  wurzeln.push(pfad)
  return pfad
}

async function schreibeSkill(pfad: string, name: string): Promise<void> {
  await mkdir(pfad, { recursive: true })
  await writeFile(
    join(pfad, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Beschreibung von ${name}\n---\n\nAnweisungen für ${name}.\n`,
    'utf8',
  )
}

interface Nachbau {
  readonly ctx: HostKontext
  readonly anbieter: SkillProvider[]
  readonly steuerungen: SkillProviderControl[]
  readonly abmeldungen: number[]
  readonly effekte: (() => void)[]
}

function host(): Nachbau {
  const anbieter: SkillProvider[] = []
  const steuerungen: SkillProviderControl[] = []
  const abmeldungen: number[] = []
  const effekte: (() => void)[] = []
  const ctx: HostKontext = {
    skills: {
      registerProvider(create) {
        const controller = new AbortController()
        const control: SkillProviderControl = {
          signal: controller.signal,
          invalidate: (): void => {},
        }
        steuerungen.push(control)
        anbieter.push(create(control))
        return () => {
          abmeldungen.push(abmeldungen.length)
          controller.abort(new Error('abgemeldet'))
        }
      },
    },
    effect(setup) {
      effekte.push(setup())
    },
  }
  return { ctx, anbieter, steuerungen, abmeldungen, effekte }
}

describe('Plugin-Vertrag', () => {
  test('Name und Pflichtdienst sind fest', () => {
    expect(name).toBe('pmh-skill')
  })

  test('meldet genau einen Anbieter mit eigenem Namen an', async () => {
    const home = await neuesVerzeichnis()
    await schreibeSkill(join(home, 'skills', 'code-review'), 'code-review')
    const nachbau = host()

    const abmelden = apply(nachbau.ctx, { home })
    expect(nachbau.anbieter).toHaveLength(1)
    expect(nachbau.anbieter[0]?.name).toBe('pmh-filesystem')

    const candidates = await nachbau.anbieter[0]?.list({})
    expect(candidates).toBeDefined()
    const liste = kandidaten(candidates)
    expect(liste?.map((entry) => entry.name)).toEqual(['code-review'])

    abmelden()
  })

  test('das Abmelden nimmt den Anbieter zurück und bricht seine Steuerung ab', () => {
    const home = 'C:/nicht-vorhanden'
    const nachbau = host()
    const abmelden = apply(nachbau.ctx, { home, watch: false })

    expect(nachbau.anbieter).toHaveLength(1)
    expect(nachbau.abmeldungen).toHaveLength(0)
    abmelden()
    expect(nachbau.abmeldungen).toHaveLength(1)
    expect(nachbau.steuerungen[0]?.signal.aborted).toBe(true)
    // Zweimal abmelden ist folgenlos.
    abmelden()
    expect(nachbau.abmeldungen).toHaveLength(1)
  })

  test('ein konfigurierter Anbietername wird übernommen', () => {
    const nachbau = host()
    const abmelden = applyMitKonfiguration(nachbau.ctx, { providerName: 'pmh-skills', watch: false })
    expect(nachbau.anbieter[0]?.name).toBe('pmh-skills')
    abmelden()
  })

  test('ein fehlendes Home-Verzeichnis hängt trotzdem an — der Katalog ist nur leer', async () => {
    const home = await neuesVerzeichnis()
    const nachbau = host()
    const abmelden = apply(nachbau.ctx, { home: join(home, 'gibt-es-nicht'), watch: false })

    expect(nachbau.anbieter).toHaveLength(1)
    const candidates = await nachbau.anbieter[0]?.list({})
    const liste = kandidaten(candidates)
    expect(liste).toEqual([])
    abmelden()
  })

  test('zusätzliche Verzeichnisse werden ohne Doppel gelesen', async () => {
    const home = await neuesVerzeichnis()
    const eigenes = await neuesVerzeichnis()
    await schreibeSkill(join(eigenes, 'security-audit'), 'security-audit')
    const nachbau = host()

    const abmelden = apply(nachbau.ctx, {
      home,
      verzeichnisse: [eigenes, eigenes],
      watch: false,
    })
    const candidates = await nachbau.anbieter[0]?.list({})
    const liste = kandidaten(candidates)
    expect(liste?.map((entry) => entry.name)).toEqual(['security-audit'])
    abmelden()
  })

  test('der geladene Rumpf kommt aus der Datei, nicht aus dem Katalog', async () => {
    const home = await neuesVerzeichnis()
    await schreibeSkill(join(home, 'skills', 'review'), 'review')
    const nachbau = host()
    const abmelden = apply(nachbau.ctx, { home, watch: false })

    const provider = nachbau.anbieter[0]
    const candidates = await provider?.list({})
    const liste = kandidaten(candidates)
    const kandidat = liste?.[0]
    if (provider === undefined || kandidat === undefined) throw new Error('Anbieter oder Kandidat fehlt')

    const geladen = await provider.get(kandidat, {})
    expect(geladen?.name).toBe('review')
    expect(geladen?.content).toBe('Anweisungen für review.')
    expect(geladen?.provider).toBe('pmh-filesystem')
    abmelden()
  })
})
