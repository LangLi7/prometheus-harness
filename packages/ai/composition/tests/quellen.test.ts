/**
 * Die Quellen anmelden — und was dabei **nicht** geschieht.
 *
 * Der wichtigste Test: **ohne Katalog wird kein Katalog angemeldet.** Ein leerer Katalog
 * (`{fassung: 1, eintraege: {}}`) wäre etwas anderes als keiner — er behauptete, es sei gemessen
 * worden und nichts gefunden. Der Unterschied ist der zwischen „unbekannt" und „nichts vorhanden".
 */

import { describe, expect, test } from 'bun:test'

import { FAMILIEN } from '@prometheus-harness/provider-directory'
import { SAAT, SAAT_STAND } from '@prometheus-harness/tariffs'
import { meldeQuellen, type Quellenmelder } from '../src/index.ts'

/** Ein Melder, der alles mitschreibt — und nichts tut. */
function melder(): Quellenmelder & {
  readonly familien: string[]
  readonly tarife: number[]
  readonly kataloge: number[]
  readonly modelle: string[]
  readonly abmeldungen: string[]
} {
  const familien: string[] = []
  const tarife: number[] = []
  const kataloge: number[] = []
  const modelle: string[] = []
  const abmeldungen: string[] = []
  return {
    familien,
    tarife,
    kataloge,
    modelle,
    abmeldungen,
    meldeFamilie: (familie) => {
      familien.push(familie.id)
      return () => abmeldungen.push(`familie:${familie.id}`)
    },
    meldeTarife: (liste) => {
      tarife.push(liste.length)
      return () => abmeldungen.push('tarife')
    },
    meldeKatalog: (katalog) => {
      kataloge.push(Object.keys(katalog.eintraege).length)
      return () => abmeldungen.push('katalog')
    },
    meldeModelle: (id, liste) => {
      modelle.push(`${id}:${String(liste.length)}`)
      return () => abmeldungen.push(`modelle:${id}`)
    },
  }
}

describe('Quellen anmelden', () => {
  test('das Verzeichnis und die Saat kommen an — mit ihren Zahlen', () => {
    const m = melder()
    const meldung = meldeQuellen(m)

    expect(m.familien).toEqual(FAMILIEN.map((familie) => familie.id))
    expect(m.familien.length).toBe(FAMILIEN.length)
    expect(m.tarife).toEqual([SAAT.length])
    expect(meldung.bericht.join(' ')).toContain(`${FAMILIEN.length} Familien`)
    expect(meldung.bericht.join(' ')).toContain(String(SAAT.length))
    expect(meldung.bericht.join(' ')).toContain(SAAT_STAND)
  })

  test('OHNE Katalog wird KEIN Katalog angemeldet — und es wird gesagt', () => {
    const m = melder()
    const meldung = meldeQuellen(m)

    // **Der Kern.** Ein leerer Katalog wäre eine Behauptung; keiner ist eine Auskunft.
    expect(m.kataloge).toEqual([])
    expect(meldung.bericht.join(' ')).toContain('KEIN Katalog')
    expect(meldung.bericht.join(' ')).toContain('empfiehlt nichts')
  })

  test('mit Katalog wird er angemeldet, mit der Zahl seiner Einträge', () => {
    const m = melder()
    const meldung = meldeQuellen(m, {
      katalog: {
        fassung: 1,
        eintraege: {
          a: {
            familie: 'a',
            geprueftAm: '2026-10-15T00:00:00.000Z',
            modelleErreichbar: true,
            modelle: [],
            wege: {},
            bemerkung: 'T',
          },
        },
      },
    })
    expect(m.kataloge).toEqual([1])
    expect(meldung.bericht.join(' ')).toContain('Katalog mit 1 Einträgen')
  })

  test('ohne Tarife wird gewarnt, nicht geschwiegen', () => {
    const m = melder()
    const meldung = meldeQuellen(m, { tarife: [] })
    expect(m.tarife).toEqual([])
    expect(meldung.bericht.join(' ')).toContain('jeder Preis unbekannt')
  })

  test('Modelllisten werden je Familie angemeldet', () => {
    const m = melder()
    meldeQuellen(m, {
      modelle: { openrouter: [{ kennung: 'a' }, { kennung: 'b' }], deepseek: [{ kennung: 'c' }] },
    })
    expect(m.modelle.sort()).toEqual(['deepseek:1', 'openrouter:2'])
  })

  test('abmelden nimmt ALLES zurück, in umgekehrter Reihenfolge', () => {
    const m = melder()
    const meldung = meldeQuellen(m, {
      katalog: { fassung: 1, eintraege: {} },
      modelle: { openrouter: [{ kennung: 'a' }] },
    })
    meldung.abmelden()

    // Zuletzt angemeldet, zuerst abgemeldet — wie `ctx.effect`.
    expect(m.abmeldungen[0]).toBe('modelle:openrouter')
    expect(m.abmeldungen).toContain('katalog')
    expect(m.abmeldungen).toContain('tarife')
    expect(m.abmeldungen.filter((zeile) => zeile.startsWith('familie:'))).toHaveLength(FAMILIEN.length)
  })

  test('zweimal abmelden ist harmlos — die Reihenfolge bleibt', () => {
    const m = melder()
    const meldung = meldeQuellen(m)
    meldung.abmelden()
    const nachEinmal = m.abmeldungen.length
    meldung.abmelden()
    expect(m.abmeldungen.length).toBe(nachEinmal * 2)
  })

  test('die Familien lassen sich einschränken — für einen kleinen Aufbau', () => {
    const m = melder()
    const meldung = meldeQuellen(m, { familien: FAMILIEN.slice(0, 2), tarife: [] })
    expect(m.familien.length).toBe(2)
    expect(meldung.bericht.join(' ')).toContain('2 Familien')
  })
})
