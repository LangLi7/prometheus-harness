/**
 * Die Zugriffspfade eines Arbeitsbereichs — geprüft mit einer **mitschreibenden Attrappe**.
 *
 * ## Warum eine Attrappe hier richtig ist
 *
 * Dieselbe Begründung wie in `tenant.test.ts`: eine Attrappe kann bestätigen, was **unser
 * Code** tut — sie kann nicht bestätigen, was PostgreSQL tut. Diese Datei prüft die
 * **Übersetzung**: aus Zeilen der Tabelle werden Hauptwurzel und Zusatzordner, und ein
 * unbekannter Wert darf **nicht** zu Schreibrechten führen.
 *
 * Daß die Tabelle wirklich filtert (Row Level Security), steht gemessen in
 * `packages/auth/db-schema/tests/arbeitsbereich-ordner.test.ts` — dort gegen echtes PostgreSQL.
 */

import { describe, expect, test } from 'bun:test'
import type { SqlZugang, TransaktionsZugang } from '../src/index.ts'
import { ladeWurzeln, schreibbareWurzeln } from '../src/roots.ts'

/** Eine Anweisung, wie sie wirklich gesendet wurde. */
interface Gesendet {
  readonly anweisung: string
  readonly werte: readonly unknown[]
  readonly ueber: 'aussen' | 'innen'
}

/**
 * Ein Zugang, der **mitschreibt** und vorbereitete Zeilen zurückgibt.
 *
 * @param zeilen - was die Abfrage liefern soll
 * @returns Zugang, Protokoll und der Zähler der Transaktionen
 */
function attrappe(zeilen: readonly unknown[] = []): {
  zugang: TransaktionsZugang
  gesendet: Gesendet[]
  transaktionen: () => number
} {
  const gesendet: Gesendet[] = []
  let transaktionen = 0
  const innen: SqlZugang = {
    async unsafe(anweisung: string, werte: readonly unknown[] = []) {
      gesendet.push({ anweisung, werte, ueber: 'innen' })
      // Die erste Anweisung ist `set_config` (Mandant), die zweite die Abfrage.
      return anweisung.includes('workspace_folders') ? [...zeilen] : []
    },
  }
  const zugang: TransaktionsZugang = {
    async unsafe(anweisung: string, werte: readonly unknown[] = []) {
      gesendet.push({ anweisung, werte, ueber: 'aussen' })
      return []
    },
    async begin<T>(arbeit: (innerhalb: SqlZugang) => Promise<T>): Promise<T> {
      transaktionen += 1
      return await arbeit(innen)
    },
  }
  return { zugang, gesendet, transaktionen: () => transaktionen }
}

const MANDANT = '00000000-0000-4000-8000-0000000000a1'
const ARBEITSBEREICH = '00000000-0000-4000-8000-0000000000a2'

describe('Aus Zeilen werden Zugriffspfade', () => {
  test('die Hauptwurzel wird zur Hauptwurzel, der Rest wird getrennt nach Zugriff', async () => {
    const a = attrappe([
      { pfad: 'D:\\Arbeit', ist_primaer: true, zugriff: 'schreiben' },
      { pfad: 'D:\\Daten', ist_primaer: false, zugriff: 'schreiben' },
      { pfad: 'D:\\Vorlagen', ist_primaer: false, zugriff: 'lesen' },
    ])
    const wurzeln = await ladeWurzeln(a.zugang, MANDANT, ARBEITSBEREICH)
    expect(wurzeln).toEqual({
      hauptwurzel: 'D:\\Arbeit',
      weitereSchreibbar: ['D:\\Daten'],
      weitereLesbar: ['D:\\Vorlagen'],
    })
  })

  test('die schreibbaren Wurzeln beginnen mit dem Arbeitsplatz', async () => {
    const a = attrappe([
      { pfad: 'D:\\Arbeit', ist_primaer: true, zugriff: 'schreiben' },
      { pfad: 'D:\\Daten', ist_primaer: false, zugriff: 'schreiben' },
    ])
    const wurzeln = await ladeWurzeln(a.zugang, MANDANT, ARBEITSBEREICH)
    expect(wurzeln).toBeDefined()
    expect(schreibbareWurzeln(wurzeln!)).toEqual(['D:\\Arbeit', 'D:\\Daten'])
  })

  test('OHNE Hauptordner gibt es keine Wurzeln — und keine erfundene', async () => {
    const a = attrappe([{ pfad: 'D:\\Daten', ist_primaer: false, zugriff: 'lesen' }])
    expect(await ladeWurzeln(a.zugang, MANDANT, ARBEITSBEREICH)).toBeUndefined()
  })

  test('ein unbekannter Zugriffswert zählt als LESEN — die sichere Richtung', async () => {
    // Ein Tippfehler in der Datenbank darf keine Schreibrechte ergeben. Die Prüfregel der
    // Tabelle läßt nur `lesen`/`schreiben` zu; diese Prüfung hält fest, was gilt, **falls**
    // sie einmal umgangen wird (etwa durch eine ältere Zeile).
    const a = attrappe([
      { pfad: 'D:\\Arbeit', ist_primaer: true, zugriff: 'schreiben' },
      { pfad: 'D:\\Daten', ist_primaer: false, zugriff: 'schreiben!' },
    ])
    const wurzeln = await ladeWurzeln(a.zugang, MANDANT, ARBEITSBEREICH)
    expect(wurzeln?.weitereSchreibbar).toEqual([])
    expect(wurzeln?.weitereLesbar).toEqual(['D:\\Daten'])
  })
})

describe('Der Mandant steht vor der Abfrage', () => {
  test('erst `set_config`, dann die Abfrage — und beides INNEN', async () => {
    const a = attrappe([{ pfad: 'D:\\Arbeit', ist_primaer: true, zugriff: 'schreiben' }])
    await ladeWurzeln(a.zugang, MANDANT, ARBEITSBEREICH)

    expect(a.transaktionen()).toBe(1)
    expect(a.gesendet.length).toBe(2)
    const [erst, dann] = a.gesendet
    expect(erst?.anweisung).toContain('set_config')
    expect(erst?.werte).toEqual([MANDANT])
    expect(dann?.anweisung).toContain('workspace_folders')
    // **Beides in der Transaktion.** Über den äußeren Zugang ginge der Mandant verloren.
    expect(a.gesendet.map((g) => g.ueber)).toEqual(['innen', 'innen'])
    expect(dann?.werte).toEqual([ARBEITSBEREICH])
  })

  test('ohne Transaktion bricht es LAUT ab — kein stiller Rückfall', async () => {
    // Ein Zugang ohne `begin`: `mitMandant` wirft, statt den Mandanten sitzungsweit zu setzen.
    const ohne: SqlZugang = { async unsafe() { return [] } }
    await expect(ladeWurzeln(ohne, MANDANT, ARBEITSBEREICH)).rejects.toThrow('begin')
  })
})
