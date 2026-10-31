/**
 * Dokumente und Speicher: Grenzen, Erhalt, Atomarität, Nutzertrennung.
 *
 * Die vier Eigenschaften, die hier festgenagelt werden:
 * **offene Arbeit fällt nie** (nur erledigte wird verdrängt),
 * **zwei Nutzer teilen sich keinen Plan** (der Pfad trennt sie, nicht eine Abfrage),
 * **gleichzeitige Änderungen verlieren einander nicht** (eine Kette je Dokument),
 * **ein Absturz hinterläßt keine halbe Datei** (temporär + umbenennen).
 */

import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  Aufgabengrenze,
  MAX_AUFGABEN_JE_ROLLE,
  leererZustand,
  rollenstand,
  type CrewAufgabe,
} from '../src/types.ts'
import {
  beschraenkeAufgaben,
  CrewZustandSpeicher,
  entferneAufgabe,
  entferneProjektliste,
  fuegeAufgabeHinzu,
  offeneAufgaben,
  setzeAufgaben,
  setzeAufgabenstand,
  setzeProjektstand,
  setzeWorkspaceZiel,
  setzeZiel,
  schreibeProjektliste,
  zusammenfassung,
} from '../src/state.ts'
import { OHNE_PROJEKT, projektbereich, slug } from '../src/scope.ts'

const JETZT = '2026-10-19T08:00:00.000Z'

/** Ein frisches Dokument für Tests. */
const dokument = (projekt = 'projekte-shop-11111111') =>
  leererZustand({ crew: 'crew-1', nutzer: 'benutzer-1', projekt, jetzt: JETZT })

/** Baut eine Aufgabe. */
const aufgabe = (id: string, stand: CrewAufgabe['stand'] = 'pending'): CrewAufgabe => ({
  id,
  text: `Aufgabe ${id}`,
  stand,
  erstellt: JETZT,
  aktualisiert: JETZT,
})

describe('Aufgabengrenze', () => {
  test('unverändert, solange die Grenze nicht erreicht ist', () => {
    const liste = [aufgabe('a'), aufgabe('b')]
    expect(beschraenkeAufgaben('executor', liste)).toEqual(liste)
  })

  test('über der Grenze fällt die älteste erledigte Aufgabe', () => {
    const liste: CrewAufgabe[] = [aufgabe('alt', 'completed')]
    for (let i = 0; i < MAX_AUFGABEN_JE_ROLLE; i += 1) liste.push(aufgabe(`o${String(i)}`))
    const beschnitten = beschraenkeAufgaben('executor', liste)
    expect(beschnitten).toHaveLength(MAX_AUFGABEN_JE_ROLLE)
    expect(beschnitten.some((eintrag) => eintrag.id === 'alt')).toBe(false)
  })

  test('lauter offene Aufgaben über der Grenze sind ein Fehler, kein stilles Abschneiden', () => {
    const liste: CrewAufgabe[] = []
    for (let i = 0; i <= MAX_AUFGABEN_JE_ROLLE; i += 1) liste.push(aufgabe(`o${String(i)}`))
    expect(() => beschraenkeAufgaben('executor', liste)).toThrow(/200/)
  })

  test('der Fehler trägt Rolle und Zahl', () => {
    const fehler = new Aufgabengrenze('search', 250)
    expect(fehler.name).toBe('Aufgabengrenze')
    expect(fehler.message).toContain('search')
    expect(fehler.message).toContain('250')
  })
})

describe('Ziele und Aufgaben schreiben', () => {
  test('ein Ziel wird gesetzt, ein gleiches Ziel schreibt nicht noch einmal', () => {
    const zustand = dokument()
    expect(setzeZiel(zustand, 'planner', '  Bauen  ', 'active', JETZT)).toBe(true)
    expect(rollenstand(zustand, 'planner').ziel).toEqual({ text: 'Bauen', stand: 'active', aktualisiert: JETZT })
    expect(setzeZiel(zustand, 'planner', 'Bauen', 'active', JETZT)).toBe(false)
  })

  test('ein leeres Ziel wird abgewiesen', () => {
    expect(() => setzeZiel(dokument(), 'planner', '   ', 'active', JETZT)).toThrow(/leeres Ziel/)
  })

  test('überlebende Kennungen behalten ihren Stand', () => {
    const zustand = dokument()
    setzeAufgaben(zustand, 'executor', [{ id: 'a', text: 'A' }], JETZT)
    setzeAufgabenstand(zustand, 'executor', 'a', 'completed', JETZT)
    expect(setzeAufgaben(zustand, 'executor', [{ id: 'a', text: 'A neu' }, { id: 'b', text: 'B' }], JETZT)).toBe(true)
    expect(rollenstand(zustand, 'executor').aufgaben.map((eintrag) => [eintrag.id, eintrag.stand])).toEqual([
      ['a', 'completed'],
      ['b', 'pending'],
    ])
  })

  test('erledigte Aufgaben bleiben erhalten, wenn der neue Plan sie nicht mehr nennt', () => {
    const zustand = dokument()
    setzeAufgaben(zustand, 'executor', [{ id: 'alt', text: 'alt' }], JETZT)
    setzeAufgabenstand(zustand, 'executor', 'alt', 'completed', JETZT)
    setzeAufgaben(zustand, 'executor', [{ id: 'neu', text: 'neu' }], JETZT)
    expect(rollenstand(zustand, 'executor').aufgaben.map((eintrag) => eintrag.id)).toEqual(['neu', 'alt'])
  })

  test('ohne behalteErledigte fallen sie weg', () => {
    const zustand = dokument()
    setzeAufgaben(zustand, 'executor', [{ id: 'alt', text: 'alt' }], JETZT)
    setzeAufgabenstand(zustand, 'executor', 'alt', 'completed', JETZT)
    setzeAufgaben(zustand, 'executor', [{ id: 'neu', text: 'neu' }], JETZT, false)
    expect(rollenstand(zustand, 'executor').aufgaben.map((eintrag) => eintrag.id)).toEqual(['neu'])
  })

  test('eine unbekannte Kennung braucht einen Text, sonst ist es ein Fehler', () => {
    const zustand = dokument()
    expect(() => setzeAufgabenstand(zustand, 'executor', 'x', 'completed', JETZT)).toThrow(/gibt es nicht/)
    setzeAufgabenstand(zustand, 'executor', 'x', 'pending', JETZT, 'x anlegen')
    expect(rollenstand(zustand, 'executor').aufgaben[0]?.text).toBe('x anlegen')
  })

  test('eine neue Aufgabe bekommt eine freie Kennung und eine doppelte wird abgewiesen', () => {
    const zustand = dokument()
    expect(fuegeAufgabeHinzu(zustand, 'executor', 'erst', JETZT)).toBe('t1')
    expect(fuegeAufgabeHinzu(zustand, 'executor', 'zweit', JETZT)).toBe('t2')
    expect(() => fuegeAufgabeHinzu(zustand, 'executor', 'nochmal', JETZT, 't1')).toThrow(/gibt es schon/)
  })

  test('entfernen meldet, ob etwas entfernt wurde', () => {
    const zustand = dokument()
    fuegeAufgabeHinzu(zustand, 'executor', 'x', JETZT)
    expect(entferneAufgabe(zustand, 'executor', 't1')).toBe(true)
    expect(entferneAufgabe(zustand, 'executor', 't1')).toBe(false)
  })

  test('offene Aufgaben zählen nur, was nicht erledigt ist', () => {
    const zustand = dokument()
    fuegeAufgabeHinzu(zustand, 'executor', 'a', JETZT)
    fuegeAufgabeHinzu(zustand, 'executor', 'b', JETZT)
    setzeAufgabenstand(zustand, 'executor', 't1', 'completed', JETZT)
    expect(offeneAufgaben(zustand, 'executor')).toBe(1)
    expect(offeneAufgaben(zustand, 'vision')).toBe(0)
  })

  test('die Projektebene trägt Ziel und Arbeitsströme', () => {
    const zustand = dokument()
    setzeWorkspaceZiel(zustand, 'Shop bauen', 'active', JETZT)
    schreibeProjektliste(zustand, 'p1', 'Erster Strom', [{ id: 'a', text: 'A' }], JETZT)
    expect(setzeProjektstand(zustand, 'p1', 'completed', JETZT)).toBe(true)
    expect(zustand.workspace?.projekte[0]?.aufgaben[0]?.stand).toBe('completed')
    expect(entferneProjektliste(zustand, 'p1')).toBe(true)
    expect(entferneProjektliste(zustand, 'p1')).toBe(false)
  })

  test('die Zusammenfassung nennt Ziele, Offenes und Erledigtes', () => {
    const zustand = dokument()
    setzeZiel(zustand, 'planner', 'Planen', 'active', JETZT)
    fuegeAufgabeHinzu(zustand, 'executor', 'a', JETZT)
    const uebersicht = zusammenfassung(zustand)
    expect(uebersicht.nutzer).toBe('benutzer-1')
    expect(uebersicht.rollen[0]?.zielText).toBe('Planen')
    expect(uebersicht.rollen[1]?.offen).toBe(1)
  })
})

describe('Projektbereich', () => {
  test('gleicher Ordnername, anderer Pfad: zwei Etiketten, zwei Pläne', () => {
    const eins = projektbereich({ nutzer: 'u1', pfad: 'C:/a/shop' })
    const zwei = projektbereich({ nutzer: 'u1', pfad: 'D:/b/shop' })
    expect(slug(eins.pfad)).toBe('c-a-shop')
    expect(eins.label).not.toBe(zwei.label)
  })

  test('ohne Pfad gilt der Bereich „ohne Projekt"', () => {
    expect(projektbereich({ nutzer: 'u1' }).label).toBe(OHNE_PROJEKT)
    expect(projektbereich({ nutzer: 'u1', pfad: '  ' }).label).toBe(OHNE_PROJEKT)
  })

  test('ein Nutzername mit Pfadtrenner wird abgewiesen', () => {
    expect(() => projektbereich({ nutzer: '../fremd', pfad: 'C:/x' })).toThrow(/Pfadsegment/)
    expect(() => projektbereich({ nutzer: 'a/b', pfad: 'C:/x' })).toThrow(/Pfadsegment/)
  })

  test('ein registrierter Arbeitsbereich gibt dem Etikett seine Kennung', () => {
    const mit = projektbereich({ nutzer: 'u1', pfad: 'C:/x', workspaceId: 'ws-7' })
    const ohne = projektbereich({ nutzer: 'u1', pfad: 'C:/x' })
    expect(mit.label).not.toBe(ohne.label)
  })
})

describe('Speicher', () => {
  test('ein fehlendes Dokument ist ein leeres — und kein Fehler', async () => {
    const speicher = new CrewZustandSpeicher({ jetzt: () => new Date(JETZT) })
    const zustand = await speicher.lesen('crew-1', projektbereich({ nutzer: 'u1' }))
    expect(zustand.rollen).toEqual({})
    expect(zustand.nutzer).toBe('u1')
  })

  test('zwei Nutzer am selben Pfad teilen keinen Plan', async () => {
    const verzeichnis = await mkdtemp(join(tmpdir(), 'pmh-crew-'))
    try {
      const speicher = new CrewZustandSpeicher({ verzeichnis, jetzt: () => new Date(JETZT) })
      const a = projektbereich({ nutzer: 'anna', pfad: 'C:/projekt' })
      const b = projektbereich({ nutzer: 'bernd', pfad: 'C:/projekt' })
      await speicher.aendern('crew-1', a, (zustand, jetzt) => {
        fuegeAufgabeHinzu(zustand, 'executor', 'von anna', jetzt)
        return true
      })
      await speicher.aendern('crew-1', b, (zustand, jetzt) => {
        fuegeAufgabeHinzu(zustand, 'executor', 'von bernd', jetzt)
        return true
      })
      const anna = await speicher.lesen('crew-1', a)
      const bernd = await speicher.lesen('crew-1', b)
      expect(anna.rollen.executor?.aufgaben.map((eintrag) => eintrag.text)).toEqual(['von anna'])
      expect(bernd.rollen.executor?.aufgaben.map((eintrag) => eintrag.text)).toEqual(['von bernd'])
      expect(speicher.pfadVon('crew-1', a)).toContain(join('anna', 'crew-1'))
    } finally {
      await rm(verzeichnis, { recursive: true, force: true })
    }
  })

  test('gleichzeitige Änderungen verlieren einander nicht', async () => {
    const verzeichnis = await mkdtemp(join(tmpdir(), 'pmh-crew-'))
    try {
      const speicher = new CrewZustandSpeicher({ verzeichnis, jetzt: () => new Date(JETZT) })
      const bereich = projektbereich({ nutzer: 'u1', pfad: 'C:/projekt' })
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          speicher.aendern('crew-1', bereich, (zustand, jetzt) => {
            fuegeAufgabeHinzu(zustand, 'executor', `aufgabe ${String(i)}`, jetzt)
            return true
          }),
        ),
      )
      const zustand = await speicher.lesen('crew-1', bereich)
      expect(zustand.rollen.executor?.aufgaben).toHaveLength(20)
      const roh = await readFile(speicher.pfadVon('crew-1', bereich) as string, 'utf8')
      expect(JSON.parse(roh).fassung).toBe(1)
    } finally {
      await rm(verzeichnis, { recursive: true, force: true })
    }
  })

  test('eine unlesbare Datei wird leer gelesen und beim nächsten Schreiben sauber angelegt', async () => {
    const verzeichnis = await mkdtemp(join(tmpdir(), 'pmh-crew-'))
    try {
      const speicher = new CrewZustandSpeicher({ verzeichnis, jetzt: () => new Date(JETZT) })
      const bereich = projektbereich({ nutzer: 'u1', pfad: 'C:/projekt' })
      const pfad = speicher.pfadVon('crew-1', bereich) as string
      const { mkdir } = await import('node:fs/promises')
      await mkdir(join(verzeichnis, 'u1', 'crew-1'), { recursive: true })
      await writeFile(pfad, 'kein json', 'utf8')
      const leer = await speicher.lesen('crew-1', bereich)
      expect(leer.rollen).toEqual({})
      await speicher.aendern('crew-1', bereich, (zustand, jetzt) => {
        fuegeAufgabeHinzu(zustand, 'executor', 'danach', jetzt)
        return true
      })
      const danach = await speicher.lesen('crew-1', bereich)
      expect(danach.rollen.executor?.aufgaben).toHaveLength(1)
    } finally {
      await rm(verzeichnis, { recursive: true, force: true })
    }
  })

  test('ein Dokument, das JSON aber kein Objekt ist, wird abgewiesen', async () => {
    const verzeichnis = await mkdtemp(join(tmpdir(), 'pmh-crew-'))
    try {
      const speicher = new CrewZustandSpeicher({ verzeichnis, jetzt: () => new Date(JETZT) })
      const bereich = projektbereich({ nutzer: 'u1', pfad: 'C:/projekt' })
      const pfad = speicher.pfadVon('crew-1', bereich) as string
      const { mkdir } = await import('node:fs/promises')
      await mkdir(join(verzeichnis, 'u1', 'crew-1'), { recursive: true })
      await writeFile(pfad, '"nur ein text"', 'utf8')
      await expect(speicher.lesen('crew-1', bereich)).rejects.toThrow(/kein Planobjekt/)
    } finally {
      await rm(verzeichnis, { recursive: true, force: true })
    }
  })

  test('eine unbekannte Fassung wird nicht geraten', async () => {
    const verzeichnis = await mkdtemp(join(tmpdir(), 'pmh-crew-'))
    try {
      const speicher = new CrewZustandSpeicher({ verzeichnis, jetzt: () => new Date(JETZT) })
      const bereich = projektbereich({ nutzer: 'u1', pfad: 'C:/projekt' })
      const pfad = speicher.pfadVon('crew-1', bereich) as string
      const { mkdir } = await import('node:fs/promises')
      await mkdir(join(verzeichnis, 'u1', 'crew-1'), { recursive: true })
      await writeFile(pfad, JSON.stringify({ fassung: 2, crew: 'c', nutzer: 'u1', projekt: 'p' }), 'utf8')
      await expect(speicher.lesen('crew-1', bereich)).rejects.toThrow(/Fassung/)
    } finally {
      await rm(verzeichnis, { recursive: true, force: true })
    }
  })

  test('eine Änderung, die nichts ändert, schreibt nicht', async () => {
    const verzeichnis = await mkdtemp(join(tmpdir(), 'pmh-crew-'))
    try {
      const speicher = new CrewZustandSpeicher({ verzeichnis, jetzt: () => new Date(JETZT) })
      const bereich = projektbereich({ nutzer: 'u1', pfad: 'C:/projekt' })
      const erst = await speicher.aendern('crew-1', bereich, (zustand, jetzt) => setzeZiel(zustand, 'planner', 'x', 'active', jetzt))
      expect(erst.geaendert).toBe(true)
      const nochmal = await speicher.aendern('crew-1', bereich, (zustand, jetzt) => setzeZiel(zustand, 'planner', 'x', 'active', jetzt))
      expect(nochmal.geaendert).toBe(false)
    } finally {
      await rm(verzeichnis, { recursive: true, force: true })
    }
  })

  test('ohne Verzeichnis bleibt der Stand im Arbeitsspeicher', async () => {
    const speicher = new CrewZustandSpeicher({ jetzt: () => new Date(JETZT) })
    const bereich = projektbereich({ nutzer: 'u1', pfad: 'C:/projekt' })
    expect(speicher.pfadVon('crew-1', bereich)).toBeUndefined()
    await speicher.aendern('crew-1', bereich, (zustand, jetzt) => setzeZiel(zustand, 'planner', 'x', 'active', jetzt))
    expect(speicher.blick('crew-1', bereich)?.rollen.planner?.ziel?.text).toBe('x')
  })
})
