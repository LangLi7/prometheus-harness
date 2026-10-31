/**
 * Prüfungen des lokalen Skill-Anbieters.
 *
 * Jede Prüfung legt eine **echte** Wurzel auf der Platte an. Das ist Absicht: der Anbieter
 * besteht aus Dateisystemarbeit, und ein nachgebauter Dateidienst würde genau die Fehler
 * nicht finden, um die es geht — fehlende Dateien, `.system`, symlinkartige Einträge,
 * Frontmatter-Grenzen.
 */

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SkillRegistry, type SkillCandidate, type SkillProviderControl, type SkillProviderObservation } from '@prometheus-harness/skill'
import {
  FilesystemSkillProvider,
  PROJECT_AGENTS_RANK,
  PROJECT_DSH_RANK,
  USER_AGENTS_RANK,
  USER_DSH_RANK,
  registerFilesystemSkills,
  type FilesystemSkillConfig,
} from '../src/index.ts'
import { parseSkillText } from '../src/frontmatter.ts'

const wurzeln: string[] = []

afterAll(async () => {
  for (const wurzel of wurzeln) await rm(wurzel, { recursive: true, force: true })
})

/** Legt ein frisches Verzeichnis an, das nach dem Lauf gelöscht wird. */
async function neuesVerzeichnis(): Promise<string> {
  const pfad = await mkdtemp(join(tmpdir(), 'pmh-skill-'))
  wurzeln.push(pfad)
  return pfad
}

/** Schreibt eine Fähigkeitsdatei und legt fehlende Verzeichnisse an. */
async function schreibe(pfad: string, text: string): Promise<void> {
  await mkdir(join(pfad, '..'), { recursive: true })
  await writeFile(pfad, text, 'utf8')
}

/** Eine gültige Fähigkeitsdatei. */
function datei(name: string, beschreibung = `Beschreibung von ${name}`, zusatz = ''): string {
  return `---
name: ${name}
description: ${beschreibung}
${zusatz}---

Anweisungen für ${name}.
`
}

function kandidaten(out: readonly SkillCandidate[] | SkillProviderObservation): readonly SkillCandidate[] {
  return 'candidates' in out ? out.candidates : out
}

/** Wartet bis zu drei Sekunden auf eine Bedingung — Beobachtung ist zeitabhängig. */
async function warteAuf(bedingung: () => boolean): Promise<void> {
  const ende = Date.now() + 3000
  while (!bedingung() && Date.now() < ende) {
    await new Promise((fertig) => setTimeout(fertig, 25))
  }
  expect(bedingung()).toBe(true)
}

function steuerung(): SkillProviderControl & { invalidierungen: number } {
  const zustand = {
    signal: new AbortController().signal,
    invalidierungen: 0,
    invalidate(): void {
      zustand.invalidierungen += 1
    },
  }
  return zustand
}

function anbieter(
  config: FilesystemSkillConfig,
  control?: SkillProviderControl,
): FilesystemSkillProvider {
  return new FilesystemSkillProvider(
    { includeDefaultRoots: false, watch: false, ...config },
    control,
  )
}

describe('parseSkillText', () => {
  test('liest Name, Beschreibung, Rumpf und Schalter', () => {
    const ergebnis = parseSkillText(datei('code-review', 'Prüft Code', 'whenToUse: bei Reviews\n'))
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.skill.name).toBe('code-review')
    expect(ergebnis.skill.description).toBe('Prüft Code')
    expect(ergebnis.skill.whenToUse).toBe('bei Reviews')
    expect(ergebnis.skill.invocation).toEqual({ modelInvocable: true, userInvocable: true })
    expect(ergebnis.skill.content).toBe('Anweisungen für code-review.')
  })

  test('liest die zwei Schalter unabhängig', () => {
    const nurMensch = parseSkillText(datei('nur-mensch', 'x', 'disable-model-invocation: true\n'))
    expect(nurMensch.ok && nurMensch.skill.invocation).toEqual({
      modelInvocable: false,
      userInvocable: true,
    })
    const nurModell = parseSkillText(datei('nur-modell', 'x', 'user-invocable: false\n'))
    expect(nurModell.ok && nurModell.skill.invocation).toEqual({
      modelInvocable: true,
      userInvocable: false,
    })
  })

  test('nimmt die Schreibweisen, die im Bestand vorkommen', () => {
    for (const wert of ['yes', 'on', '1', true]) {
      const ergebnis = parseSkillText(datei('schalter', 'x', `user-invocable: ${wert}\n`))
      expect(ergebnis.ok && ergebnis.skill.invocation.userInvocable).toBe(true)
    }
    for (const wert of ['no', 'off', '0', false]) {
      const ergebnis = parseSkillText(datei('schalter', 'x', `user-invocable: ${wert}\n`))
      expect(ergebnis.ok && ergebnis.skill.invocation.userInvocable).toBe(false)
    }
  })

  test('lehnt alte Schlüssel ab, statt sie wirkungslos zu übernehmen', () => {
    const ergebnis = parseSkillText(datei('alt', 'x', 'disableModelInvocation: true\n'))
    expect(ergebnis.ok).toBe(false)
    if (!ergebnis.ok) expect(ergebnis.reason).toContain('disable-model-invocation')
  })

  test('meldet fehlende Pflichtfelder, ungültige Namen und kaputtes YAML', () => {
    const ohneBeschreibung = parseSkillText('---\nname: x\n---\nInhalt\n')
    expect(ohneBeschreibung.ok).toBe(false)
    const falscherName = parseSkillText(datei('Gross'))
    expect(falscherName.ok).toBe(false)
    if (!falscherName.ok) expect(falscherName.reason).toContain('ungültiger Fähigkeitsname')
    const kaputt = parseSkillText('---\nname: [\n---\nInhalt\n')
    expect(kaputt.ok).toBe(false)
    const ohneFrontmatter = parseSkillText('# nur Markdown\n')
    expect(ohneFrontmatter.ok).toBe(false)
  })

  test('übernimmt metadata nur als Objekt', () => {
    const mit = parseSkillText(datei('mit', 'x', 'metadata:\n  owner: team\n'))
    expect(mit.ok && mit.skill.metadata).toEqual({ owner: 'team' })
    const falsch = parseSkillText(datei('ohne', 'x', 'metadata: nur-text\n'))
    expect(falsch.ok && falsch.skill.metadata).toBeUndefined()
  })
})

describe('Entdeckung', () => {
  test('findet Bündel und flache Datei und ordnet die Ränge zu', async () => {
    const projekt = await neuesVerzeichnis()
    await mkdir(join(projekt, '.git'), { recursive: true })
    await schreibe(join(projekt, '.dsh', 'skills', 'bündel', 'SKILL.md'), datei('buendel'))
    await schreibe(join(projekt, '.dsh', 'skills', 'flach.md'), datei('flach'))
    await schreibe(join(projekt, '.agents', 'skills', 'geteilt', 'SKILL.md'), datei('geteilt'))

    const candidates = await anbieter({
      includeDefaultRoots: true,
      dshHome: await neuesVerzeichnis(),
      agentsHome: await neuesVerzeichnis(),
    }).list({ cwd: projekt })
    const liste = kandidaten(candidates)
    expect(liste.map((entry) => entry.name)).toEqual(['buendel', 'flach', 'geteilt'])
    expect(liste.find((entry) => entry.name === 'buendel')?.rank).toBe(PROJECT_DSH_RANK)
    expect(liste.find((entry) => entry.name === 'geteilt')?.rank).toBe(PROJECT_AGENTS_RANK)
    expect(liste.find((entry) => entry.name === 'flach')?.source).toBe('project-dsh')
  })

  test('findet die Projektwurzel von einem Unterverzeichnis aus', async () => {
    const projekt = await neuesVerzeichnis()
    await mkdir(join(projekt, '.git'), { recursive: true })
    await schreibe(join(projekt, '.agents', 'skills', 'oben', 'SKILL.md'), datei('oben'))
    const tief = join(projekt, 'src', 'tief')
    await mkdir(tief, { recursive: true })

    const candidates = await anbieter({
      includeDefaultRoots: true,
      dshHome: await neuesVerzeichnis(),
      agentsHome: await neuesVerzeichnis(),
    }).list({ cwd: tief })
    const liste = kandidaten(candidates)
    expect(liste.map((entry) => entry.name)).toEqual(['oben'])
  })

  test('ohne .git gilt das Arbeitsverzeichnis als Projektwurzel', async () => {
    const projekt = await neuesVerzeichnis()
    await schreibe(join(projekt, '.dsh', 'skills', 'hier', 'SKILL.md'), datei('hier'))
    const candidates = await anbieter({
      includeDefaultRoots: true,
      dshHome: await neuesVerzeichnis(),
      agentsHome: await neuesVerzeichnis(),
    }).list({ cwd: projekt })
    const liste = kandidaten(candidates)
    expect(liste.map((entry) => entry.name)).toEqual(['hier'])
  })

  test('Benutzer-Wurzeln: .system wird übersprungen, agents-home gelesen', async () => {
    const home = await neuesVerzeichnis()
    const agents = await neuesVerzeichnis()
    await schreibe(join(home, 'skills', 'sichtbar', 'SKILL.md'), datei('sichtbar'))
    await schreibe(join(home, 'skills', '.system', 'intern', 'SKILL.md'), datei('intern'))
    await schreibe(join(agents, 'skills', 'geteilt', 'SKILL.md'), datei('geteilt'))

    const candidates = await anbieter({
      includeDefaultRoots: true,
      dshHome: home,
      agentsHome: agents,
    }).list({})
    const liste = kandidaten(candidates)
    expect(liste.map((entry) => entry.name).sort()).toEqual(['geteilt', 'sichtbar'])
    expect(liste.find((entry) => entry.name === 'sichtbar')?.rank).toBe(USER_DSH_RANK)
    expect(liste.find((entry) => entry.name === 'geteilt')?.rank).toBe(USER_AGENTS_RANK)
  })

  test('eigene Wurzeln stehen zwischen Projekt und Benutzer', async () => {
    const projekt = await neuesVerzeichnis()
    const home = await neuesVerzeichnis()
    const eigene = await neuesVerzeichnis()
    await mkdir(join(projekt, '.git'), { recursive: true })
    await schreibe(join(projekt, '.dsh', 'skills', 'streit', 'SKILL.md'), datei('streit'))
    await schreibe(join(eigene, 'streit', 'SKILL.md'), datei('streit'))
    await schreibe(join(home, 'skills', 'streit', 'SKILL.md'), datei('streit'))

    const candidates = await anbieter({
      includeDefaultRoots: true,
      dshHome: home,
      agentsHome: join(home, 'agents-leer'),
      customSkillDirs: [eigene],
    }).list({ cwd: projekt })
    const liste = kandidaten(candidates)
    // Drei Wurzeln liefern denselben Namen — die Registry entscheidet; der Anbieter liefert alle.
    expect(liste).toHaveLength(3)
    expect(liste.map((entry) => entry.rank).sort()).toEqual([100, 300, 400])
  })

  test('kaputte Dateien werden gemeldet und übersprungen, gute bleiben', async () => {
    const wurzel = await neuesVerzeichnis()
    await schreibe(join(wurzel, 'gut', 'SKILL.md'), datei('gut'))
    await schreibe(join(wurzel, 'ohne-beschreibung', 'SKILL.md'), '---\nname: ohne\n---\n')
    await schreibe(join(wurzel, 'falscher-name', 'SKILL.md'), datei('Falsch'))
    await schreibe(join(wurzel, 'andere.txt'), 'kein Markdown')

    const meldungen: string[] = []
    const candidates = await anbieter({
      customSkillDirs: [wurzel],
      logger: { warn: (text) => meldungen.push(text) },
    }).list({})
    const liste = kandidaten(candidates)
    expect(liste.map((entry) => entry.name)).toEqual(['gut'])
    expect(meldungen.length).toBe(2)
    expect(meldungen.every((text) => text.includes('ignoriert'))).toBe(true)
  })

  test('verschachtelte SKILL.md werden nicht gefunden', async () => {
    const wurzel = await neuesVerzeichnis()
    await schreibe(join(wurzel, 'kategorie', 'tief', 'SKILL.md'), datei('tief'))
    const candidates = await anbieter({ customSkillDirs: [wurzel] }).list({})
    const liste = kandidaten(candidates)
    expect(liste).toEqual([])
  })
})

describe('Laden', () => {
  test('liest den Rumpf beim Laden neu und liefert die Ressourcenbasis', async () => {
    const wurzel = await neuesVerzeichnis()
    const dateipfad = join(wurzel, 'review', 'SKILL.md')
    await schreibe(dateipfad, datei('review', 'Erste Fassung'))
    const anbieterInstanz = anbieter({ customSkillDirs: [wurzel] })

    const candidates = await anbieterInstanz.list({})
    const liste = kandidaten(candidates)
    const kandidat = liste[0]
    expect(kandidat).toBeDefined()
    if (kandidat === undefined) return

    const erste = await anbieterInstanz.get(kandidat, {})
    expect(erste?.content).toBe('Anweisungen für review.')
    expect(erste?.resourceBase).toEqual({ kind: 'directory', path: join(wurzel, 'review') })
    expect(erste?.path).toBe(dateipfad)

    await writeFile(dateipfad, datei('review', 'Zweite Fassung'), 'utf8')
    const zweite = await anbieterInstanz.get(kandidat, {})
    expect(zweite?.description).toBe('Zweite Fassung')
  })

  test('eine verschwundene Datei liefert undefined', async () => {
    const wurzel = await neuesVerzeichnis()
    const dateipfad = join(wurzel, 'weg', 'SKILL.md')
    await schreibe(dateipfad, datei('weg'))
    const anbieterInstanz = anbieter({ customSkillDirs: [wurzel] })
    const candidates = await anbieterInstanz.list({})
    const liste = kandidaten(candidates)
    const kandidat = liste[0]
    if (kandidat === undefined) throw new Error('Kandidat fehlt')

    await rm(join(wurzel, 'weg'), { recursive: true, force: true })
    expect(await anbieterInstanz.get(kandidat, {})).toBeUndefined()
  })
})

describe('Beobachtung', () => {
  test('eine Schreibbeobachtung im Bereich invalidiert, außerhalb nicht', async () => {
    const wurzel = await neuesVerzeichnis()
    const control = steuerung()
    const anbieterInstanz = anbieter({ customSkillDirs: [wurzel], watch: true }, control)

    expect(anbieterInstanz.observeHostMutation(join(wurzel, 'neu', 'SKILL.md'))).toBe(true)
    await Promise.resolve()
    expect(control.invalidierungen).toBeGreaterThan(0)

    const vorher = control.invalidierungen
    expect(anbieterInstanz.observeHostMutation(join(tmpdir(), 'anderswo', 'datei.md'))).toBe(false)
    await Promise.resolve()
    expect(control.invalidierungen).toBe(vorher)
    anbieterInstanz.dispose()
  })

  test('eine neue Datei löst über die Beobachtung eine Invalidierung aus', async () => {
    const wurzel = await neuesVerzeichnis()
    await mkdir(wurzel, { recursive: true })
    const control = steuerung()
    const anbieterInstanz = anbieter({ customSkillDirs: [wurzel], watch: true }, control)
    await anbieterInstanz.list({})

    await schreibe(join(wurzel, 'neu', 'SKILL.md'), datei('neu'))
    const ende = Date.now() + 3000
    while (control.invalidierungen === 0 && Date.now() < ende) {
      await new Promise((fertig) => setTimeout(fertig, 25))
    }
    expect(control.invalidierungen).toBeGreaterThan(0)
    anbieterInstanz.dispose()
  })

  test('eine entstandene Wurzel wird selbst beobachtet — der Anker zieht um', async () => {
    const eltern = await neuesVerzeichnis()
    const wurzel = join(eltern, 'skills')
    const control = steuerung()
    const anbieterInstanz = anbieter({ customSkillDirs: [wurzel], watch: true }, control)

    // Fehlende Wurzel: beobachtet wird der vorhandene Vorfahre.
    await anbieterInstanz.list({})
    await schreibe(join(wurzel, 'erst', 'SKILL.md'), datei('erst'))
    await warteAuf(() => control.invalidierungen > 0)

    // Nächste Erfassung sieht die Wurzel und zieht die Beobachtung auf sie um.
    await anbieterInstanz.list({})
    const vorher = control.invalidierungen
    await schreibe(join(wurzel, 'zweit', 'SKILL.md'), datei('zweit'))
    await warteAuf(() => control.invalidierungen > vorher)
    anbieterInstanz.dispose()
  })

  test('abgemeldet liefert der Anbieter nicht mehr', async () => {
    const wurzel = await neuesVerzeichnis()
    const anbieterInstanz = anbieter({ customSkillDirs: [wurzel], watch: false })
    anbieterInstanz.dispose()
    await expect(anbieterInstanz.list({})).rejects.toThrow('abgemeldet')
  })
})

describe('Registry-Verbund', () => {
  test('registerFilesystemSkills hängt den Anbieter an und nimmt ihn zurück', async () => {
    const wurzel = await neuesVerzeichnis()
    await schreibe(join(wurzel, 'verbunden', 'SKILL.md'), datei('verbunden'))
    const registry = new SkillRegistry()

    const abmelden = registerFilesystemSkills(registry, {
      customSkillDirs: [wurzel],
      includeDefaultRoots: false,
      watch: false,
    })
    expect((await registry.list()).map((entry) => entry.name)).toEqual(['verbunden'])
    expect((await registry.get('verbunden'))?.content).toBe('Anweisungen für verbunden.')

    abmelden()
    expect(await registry.list()).toEqual([])
  })
})
