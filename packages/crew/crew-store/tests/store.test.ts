import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
  MAX_CREWS,
  alleAktiven,
  einzigesKonto,
  fuerNutzer,
  konfigurationsdatei,
  liesDatei,
  liesEingabe,
  sichern,
  type Sql,
  type TransaktionsSql,
} from '../src/index.ts'

/** Ein Zugang, der jede Anweisung mitschreibt und aus einer Tabelle antwortet. */
function aufzeichnen(antworten: (anweisung: string, werte?: readonly unknown[]) => unknown = () => []): {
  sql: Sql
  aufrufe: { anweisung: string; werte: readonly unknown[] | undefined }[]
} {
  const aufrufe: { anweisung: string; werte: readonly unknown[] | undefined }[] = []
  return {
    aufrufe,
    sql: {
      async unsafe(anweisung: string, werte?: readonly unknown[]): Promise<unknown> {
        aufrufe.push({ anweisung, werte })
        return antworten(anweisung, werte)
      },
    },
  }
}

const CREW = {
  id: 'crew-1',
  name: 'Zwei Modelle',
  rollen: {
    planner: { familie: 'deepseek-official', modell: 'deepseek-v4-pro' },
    executor: { familie: 'deepseek-official', modell: 'deepseek-flash' },
  },
}

describe('liesEingabe', () => {
  test('nimmt eine Crew an und macht die erste zur Vorgabe', () => {
    const lesung = liesEingabe({ crews: [CREW] })
    expect(lesung.ok).toBe(true)
    if (!lesung.ok) return
    expect(lesung.wert.crews).toHaveLength(1)
    expect(lesung.wert.crews[0]?.id).toBe('crew-1')
    expect(lesung.wert.standard).toBe('crew-1')
    expect(lesung.wert.projekt).toBeNull()
    expect(lesung.wert.aktiv).toBe(true)
  })

  test('leere Liste ist erlaubt — alle Crews löschen ist ein Wille', () => {
    const lesung = liesEingabe({ crews: [], standard: null, projekt: null, aktiv: false })
    expect(lesung.ok).toBe(true)
    if (!lesung.ok) return
    expect(lesung.wert.crews).toHaveLength(0)
    expect(lesung.wert.standard).toBeNull()
    expect(lesung.wert.aktiv).toBe(false)
  })

  test('unbekannte Rolle wird benannt, nicht übergangen', () => {
    const lesung = liesEingabe({ crews: [{ id: 'c', rollen: { executer: { familie: 'a', modell: 'b' } } }] })
    expect(lesung.ok).toBe(false)
    if (lesung.ok) return
    expect(lesung.befunde.join(' ')).toContain('executer')
  })

  test('halb gebundene Rolle ist ein Befund', () => {
    const lesung = liesEingabe({ crews: [{ id: 'c', rollen: { planner: { familie: 'a', modell: '' } } }] })
    expect(lesung.ok).toBe(false)
    if (lesung.ok) return
    expect(lesung.befunde.join(' ')).toContain('halb gebunden')
  })

  test('die Route crew ist als Rollenziel verboten', () => {
    const lesung = liesEingabe({ crews: [{ id: 'c', rollen: { executor: { familie: 'crew', modell: 'x' } } }] })
    expect(lesung.ok).toBe(false)
    if (lesung.ok) return
    expect(lesung.befunde.join(' ')).toContain('Crew in einer Crew')
  })

  test('doppelte Kennung wird abgewiesen', () => {
    const lesung = liesEingabe({ crews: [CREW, CREW] })
    expect(lesung.ok).toBe(false)
    if (lesung.ok) return
    expect(lesung.befunde.join(' ')).toContain('zweimal')
  })

  test('eine Standard-Crew, die nicht in der Liste steht, ist ein Befund', () => {
    const lesung = liesEingabe({ crews: [CREW], standard: 'gibt-es-nicht' })
    expect(lesung.ok).toBe(false)
    if (lesung.ok) return
    expect(lesung.befunde.join(' ')).toContain('gibt-es-nicht')
  })

  test('das Projekt muß absolut sein und darf nicht aufsteigen', () => {
    expect(liesEingabe({ crews: [CREW], projekt: 'relativ/weg' }).ok).toBe(false)
    expect(liesEingabe({ crews: [CREW], projekt: 'C:/a/../b' }).ok).toBe(false)
    const gut = liesEingabe({ crews: [CREW], projekt: 'C:/Arbeit/Projekt' })
    expect(gut.ok).toBe(true)
  })

  test('mehr als die Grenze wird abgewiesen', () => {
    const crews = Array.from({ length: MAX_CREWS + 1 }, (_, i) => ({
      id: `c-${String(i)}`,
      rollen: { executor: { familie: 'a', modell: 'b' } },
    }))
    expect(liesEingabe({ crews }).ok).toBe(false)
  })

  test('der Rumpf muß ein Objekt mit crews sein', () => {
    expect(liesEingabe(null).ok).toBe(false)
    expect(liesEingabe({}).ok).toBe(false)
    expect(liesEingabe({ crews: 'nein' }).ok).toBe(false)
  })

  test('Englisch ist die erste Sprache der Befunde', () => {
    const lesung = liesEingabe(
      { crews: [{ id: 'c', rollen: { executer: { familie: 'a', modell: 'b' } } }] },
      'en',
    )
    expect(lesung.ok).toBe(false)
    if (lesung.ok) return
    expect(lesung.befunde.join(' ')).toContain('unknown role "executer"')
    expect(lesung.befunde.join(' ')).not.toContain('unbekannte')
  })
})

describe('liesDatei', () => {
  let ordner: string | undefined

  afterEach(() => {
    if (ordner !== undefined) rmSync(ordner, { recursive: true, force: true })
    ordner = undefined
  })

  function datei(inhalt: string): string {
    ordner = mkdtempSync(join(tmpdir(), 'crew-store-'))
    mkdirSync(join(ordner, 'crew'), { recursive: true })
    const pfad = konfigurationsdatei(ordner)
    writeFileSync(pfad, inhalt, 'utf8')
    return pfad
  }

  test('fehlt — kein Fehler', () => {
    ordner = mkdtempSync(join(tmpdir(), 'crew-store-'))
    const lesung = liesDatei(konfigurationsdatei(ordner))
    expect(lesung.art).toBe('fehlt')
  })

  test('kaputt ist ein Befund', () => {
    const pfad = datei('{ kein json')
    const lesung = liesDatei(pfad)
    expect(lesung.art).toBe('kaputt')
  })

  test('leere Crew-Liste ist kaputt', () => {
    const lesung = liesDatei(datei(JSON.stringify({ nutzer: 'operator', crews: [], crew: 'x' })))
    expect(lesung.art).toBe('kaputt')
  })

  test('gültige Datei wird gelesen, die Vorgabe fällt auf die erste Crew', () => {
    const lesung = liesDatei(datei(JSON.stringify({ nutzer: 'operator', crews: [CREW] })))
    expect(lesung.art).toBe('da')
    if (lesung.art !== 'da') return
    expect(lesung.nutzer).toBe('operator')
    expect(lesung.standard).toBe('crew-1')
    expect(lesung.crews).toHaveLength(1)
  })
})

describe('Datenbank', () => {
  test('fuerNutzer liest die Crews und die Einstellungen', async () => {
    const { sql, aufrufe } = aufzeichnen((anweisung) =>
      anweisung.includes('crew_definitionen')
        ? [{ crew_id: 'crew-1', name: null, rollen: CREW.rollen }]
        : [{ standard_crew: 'crew-1', projekt: null, aktiv: false }],
    )
    const stand = await fuerNutzer(sql, '11111111-1111-4111-8111-111111111111')
    expect(stand.crews).toHaveLength(1)
    expect(stand.crews[0]?.rollen.executor?.modell).toBe('deepseek-flash')
    expect(stand.standard).toBe('crew-1')
    expect(stand.aktiv).toBe(false)
    expect(aufrufe).toHaveLength(2)
    for (const aufruf of aufrufe) expect(aufruf.werte?.[0]).toBe('11111111-1111-4111-8111-111111111111')
  })

  test('ohne Einstellungszeile gilt aktiv und keine Vorgabe', async () => {
    const { sql } = aufzeichnen((anweisung) => (anweisung.includes('crew_definitionen') ? [] : []))
    const stand = await fuerNutzer(sql, '11111111-1111-4111-8111-111111111111')
    expect(stand.crews).toHaveLength(0)
    expect(stand.aktiv).toBe(true)
    expect(stand.standard).toBeNull()
  })

  test('alleAktiven liefert die Crews mit Eigentümer', async () => {
    const { sql, aufrufe } = aufzeichnen(() => [
      { user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', crew_id: 'crew-1', name: 'Eins', rollen: CREW.rollen },
    ])
    const crews = await alleAktiven(sql)
    expect(crews).toHaveLength(1)
    expect(crews[0]?.nutzerId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(aufrufe[0]?.anweisung).toContain('where e.aktiv')
  })

  test('einzigesKonto antwortet nur bei genau einem Konto', async () => {
    const eins = aufzeichnen(() => [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }])
    expect(await einzigesKonto(eins.sql)).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    const zwei = aufzeichnen(() => [{ id: 'a' }, { id: 'b' }])
    expect(await einzigesKonto(zwei.sql)).toBeUndefined()
  })

  test('sichern schreibt in einer Transaktion und löscht, was fehlt', async () => {
    const { sql: innen, aufrufe } = aufzeichnen(() => [])
    let transaktionen = 0
    const sql: TransaktionsSql = {
      unsafe: innen.unsafe,
      async begin<T>(arbeit: (innerhalb: Sql) => Promise<T>): Promise<T> {
        transaktionen += 1
        return await arbeit(innen)
      },
    }
    const gang = await sichern(sql, '11111111-1111-4111-8111-111111111111', {
      crews: [CREW],
      standard: 'crew-1',
      projekt: 'C:/Arbeit',
      aktiv: true,
    })
    expect(gang.ok).toBe(true)
    expect(transaktionen).toBe(1)
    expect(aufrufe[0]?.anweisung).toContain('delete from crew_definitionen')
    const einfuegen = aufrufe.find((aufruf) => aufruf.anweisung.includes('insert into crew_definitionen'))
    expect(einfuegen?.anweisung ?? '').not.toContain('$4::jsonb')
    // Die Rollen gehen als **Objekt** an die Spalte. Ein JSON-Text käme als jsonb-Skalar an
    // (gemessen: `jsonb_typeof` = `string`) — die Prüfregel der Tabelle würde den Schreibvorgang
    // danach zu Recht abweisen.
    expect(typeof einfuegen?.werte?.[3]).toBe('object')
    expect(JSON.stringify(einfuegen?.werte?.[3])).toContain('deepseek-flash')
    expect(aufrufe.some((aufruf) => aufruf.anweisung.includes('insert into crew_einstellungen'))).toBe(true)
  })

  test('eine belegte Kennung wird als solche gemeldet, nicht geworfen', async () => {
    const sql: TransaktionsSql = {
      async unsafe(): Promise<unknown> {
        return []
      },
      async begin<T>(arbeit: (innerhalb: Sql) => Promise<T>): Promise<T> {
        const fehler = Object.assign(new Error('duplicate key'), {
          code: '23505',
          detail: 'Key (crew_id)=(crew-1) already exists.',
        })
        try {
          return await arbeit({
            async unsafe(): Promise<unknown> {
              throw fehler
            },
          })
        } catch (gefangen) {
          throw gefangen
        }
      },
    }
    const gang = await sichern(sql, '11111111-1111-4111-8111-111111111111', {
      crews: [CREW],
      standard: 'crew-1',
      projekt: null,
      aktiv: true,
    })
    expect(gang.ok).toBe(false)
    if (gang.ok) return
    expect(gang.grund).toBe('belegt')
    expect(gang.crewId).toBe('crew-1')
  })
})
