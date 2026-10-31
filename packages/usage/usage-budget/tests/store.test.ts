/**
 * Der Speicher: Nutzertrennung, Grenze, Atomarität.
 *
 * Die drei Eigenschaften, die hier festgenagelt werden: **zwei Nutzer teilen keine Datei**,
 * **die Grenze verdrängt die ältesten Datensätze** (und zählt sie), und **gleichzeitige Anhänge
 * verlieren einander nicht**.
 */

import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { HOECHSTZAHL_STANDARD, Verbrauchsspeicher, istBrauchbar } from '../src/index.ts'
import type { Verbrauch } from '../src/index.ts'

/** Ein Verbrauch für Tests. */
const zeile = (teil: Partial<Verbrauch> = {}): Verbrauch => ({
  zeit: '2026-10-18T12:00:00.000Z',
  nutzer: 'benutzer-1',
  schluessel: 'DEEPSEEK_API_KEY',
  familie: 'deepseek-official',
  modell: 'deepseek-flash',
  hinein: 1_000,
  heraus: 500,
  herkunft: 'gemessen',
  ...teil,
})

/** Ein Wegwerfverzeichnis. */
const verzeichnis = async (): Promise<string> => mkdtemp(join(tmpdir(), 'pmh-usage-'))

describe('Speicher je Nutzer', () => {
  test('zwei Nutzer teilen keine Datei', async () => {
    const wurzel = await verzeichnis()
    try {
      const speicher = new Verbrauchsspeicher({ verzeichnis: wurzel, jetzt: () => new Date('2026-10-18T12:00:00Z') })
      await speicher.anhaengen('anna', [zeile({ nutzer: 'anna', hinein: 100 })])
      await speicher.anhaengen('bernd', [zeile({ nutzer: 'bernd', hinein: 200 })])
      expect((await speicher.lesen('anna')).map((eintrag) => eintrag.hinein)).toEqual([100])
      expect((await speicher.lesen('bernd')).map((eintrag) => eintrag.hinein)).toEqual([200])
      expect(speicher.pfadVon('anna')).toBe(join(wurzel, 'anna', 'usage.json'))
    } finally {
      await rm(wurzel, { recursive: true, force: true })
    }
  })

  test('eine Zeile eines anderen Nutzers wird nicht übernommen', async () => {
    const wurzel = await verzeichnis()
    try {
      const speicher = new Verbrauchsspeicher({ verzeichnis: wurzel })
      const aufnahme = await speicher.anhaengen('anna', [zeile({ nutzer: 'anna' }), zeile({ nutzer: 'bernd' })])
      expect(aufnahme.aufgenommen).toBe(1)
      expect(aufnahme.verworfen).toBe(1)
      expect(await speicher.lesen('anna')).toHaveLength(1)
    } finally {
      await rm(wurzel, { recursive: true, force: true })
    }
  })

  test('gleichzeitige Anhänge verlieren einander nicht', async () => {
    const wurzel = await verzeichnis()
    try {
      const speicher = new Verbrauchsspeicher({ verzeichnis: wurzel, hoechstzahl: 100 })
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          speicher.anhaengen('anna', [zeile({ nutzer: 'anna', hinein: i, zeit: `2026-10-18T12:00:${String(i).padStart(2, '0')}.000Z` })]),
        ),
      )
      const gelesen = await speicher.lesen('anna')
      expect(gelesen).toHaveLength(20)
      expect(new Set(gelesen.map((eintrag) => eintrag.hinein)).size).toBe(20)
    } finally {
      await rm(wurzel, { recursive: true, force: true })
    }
  })

  test('die Grenze verdrängt die ältesten Datensätze und sagt wie viele', async () => {
    const wurzel = await verzeichnis()
    try {
      const speicher = new Verbrauchsspeicher({ verzeichnis: wurzel, hoechstzahl: 3 })
      const aufnahme = await speicher.anhaengen('anna', [
        zeile({ nutzer: 'anna', hinein: 1, zeit: '2026-10-18T10:00:00.000Z' }),
        zeile({ nutzer: 'anna', hinein: 2, zeit: '2026-10-18T11:00:00.000Z' }),
        zeile({ nutzer: 'anna', hinein: 3, zeit: '2026-10-18T12:00:00.000Z' }),
        zeile({ nutzer: 'anna', hinein: 4, zeit: '2026-10-18T13:00:00.000Z' }),
      ])
      expect(aufnahme.verdraengt).toBe(1)
      expect(aufnahme.gesamt).toBe(3)
      expect((await speicher.lesen('anna')).map((eintrag) => eintrag.hinein)).toEqual([2, 3, 4])
    } finally {
      await rm(wurzel, { recursive: true, force: true })
    }
  })

  test('Anhänge werden nach Zeit sortiert abgelegt', async () => {
    const wurzel = await verzeichnis()
    try {
      const speicher = new Verbrauchsspeicher({ verzeichnis: wurzel })
      await speicher.anhaengen('anna', [zeile({ nutzer: 'anna', zeit: '2026-10-18T14:00:00.000Z', hinein: 2 })])
      await speicher.anhaengen('anna', [zeile({ nutzer: 'anna', zeit: '2026-10-18T10:00:00.000Z', hinein: 1 })])
      expect((await speicher.lesen('anna')).map((eintrag) => eintrag.hinein)).toEqual([1, 2])
    } finally {
      await rm(wurzel, { recursive: true, force: true })
    }
  })

  test('eine unlesbare Datei wird leer gelesen und beim nächsten Anhängen sauber angelegt', async () => {
    const wurzel = await verzeichnis()
    try {
      const speicher = new Verbrauchsspeicher({ verzeichnis: wurzel })
      const pfad = speicher.pfadVon('anna') as string
      await mkdir(join(wurzel, 'anna'), { recursive: true })
      await writeFile(pfad, 'kein json', 'utf8')
      expect(await speicher.lesen('anna')).toEqual([])
      await speicher.anhaengen('anna', [zeile({ nutzer: 'anna' })])
      const roh = await readFile(pfad, 'utf8')
      expect(JSON.parse(roh).fassung).toBe(1)
      expect(await speicher.lesen('anna')).toHaveLength(1)
    } finally {
      await rm(wurzel, { recursive: true, force: true })
    }
  })

  test('ein JSON-Dokument, das kein Objekt ist, wird abgewiesen', async () => {
    const wurzel = await verzeichnis()
    try {
      const speicher = new Verbrauchsspeicher({ verzeichnis: wurzel })
      const pfad = speicher.pfadVon('anna') as string
      await mkdir(join(wurzel, 'anna'), { recursive: true })
      await writeFile(pfad, '"nur text"', 'utf8')
      await expect(speicher.lesen('anna')).rejects.toThrow(/kein Verbrauchsobjekt/)
    } finally {
      await rm(wurzel, { recursive: true, force: true })
    }
  })

  test('eine fremde Datei im eigenen Ordner wird erkannt, nicht gelesen', async () => {
    const wurzel = await verzeichnis()
    try {
      const speicher = new Verbrauchsspeicher({ verzeichnis: wurzel })
      const pfad = speicher.pfadVon('anna') as string
      await mkdir(join(wurzel, 'anna'), { recursive: true })
      await writeFile(pfad, JSON.stringify({ fassung: 1, nutzer: 'bernd', verbrauch: [] }), 'utf8')
      await expect(speicher.lesen('anna')).rejects.toThrow(/gehoert "bernd"/)
    } finally {
      await rm(wurzel, { recursive: true, force: true })
    }
  })

  test('eine unbekannte Fassung wird nicht geraten', async () => {
    const wurzel = await verzeichnis()
    try {
      const speicher = new Verbrauchsspeicher({ verzeichnis: wurzel })
      const pfad = speicher.pfadVon('anna') as string
      await mkdir(join(wurzel, 'anna'), { recursive: true })
      await writeFile(pfad, JSON.stringify({ fassung: 2, nutzer: 'anna', verbrauch: [] }), 'utf8')
      await expect(speicher.lesen('anna')).rejects.toThrow(/Fassung/)
    } finally {
      await rm(wurzel, { recursive: true, force: true })
    }
  })

  test('ein Nutzername mit Pfadtrenner wird abgewiesen', () => {
    const speicher = new Verbrauchsspeicher({ verzeichnis: 'C:/irgendwo' })
    expect(() => speicher.pfadVon('../fremd')).toThrow(/Pfadsegment/)
    expect(() => speicher.pfadVon('a/b')).toThrow(/Pfadsegment/)
  })

  test('ohne Verzeichnis bleibt der Verbrauch im Arbeitsspeicher', async () => {
    const speicher = new Verbrauchsspeicher({})
    expect(speicher.pfadVon('anna')).toBeUndefined()
    await speicher.anhaengen('anna', [zeile({ nutzer: 'anna' })])
    expect(await speicher.lesen('anna')).toHaveLength(1)
  })

  test('eine unsinnige Grenze wird beim Bau abgewiesen', () => {
    expect(() => new Verbrauchsspeicher({ hoechstzahl: 0 })).toThrow(/hoechstzahl/)
    expect(() => new Verbrauchsspeicher({ hoechstzahl: 1.5 })).toThrow(/hoechstzahl/)
    expect(HOECHSTZAHL_STANDARD).toBe(20_000)
  })
})

describe('Brauchbarkeit', () => {
  test('eine vollständige Zeile ist brauchbar', () => {
    expect(istBrauchbar(zeile())).toBe(true)
  })

  test('fehlende Zahlen, kaputte Zeit und unbekannte Herkunft sind es nicht', () => {
    expect(istBrauchbar(zeile({ hinein: Number.NaN }))).toBe(false)
    expect(istBrauchbar(zeile({ zeit: 'gestern' }))).toBe(false)
    expect(istBrauchbar({ ...zeile(), herkunft: 'geraten' })).toBe(false)
    expect(istBrauchbar({ ...zeile(), nutzer: '' })).toBe(false)
    expect(istBrauchbar(null)).toBe(false)
    expect(istBrauchbar(42)).toBe(false)
  })
})
