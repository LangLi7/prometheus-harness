/**
 * Prüfung des Aufrufers, der den Mandanten setzt ({@link mitMandant}).
 *
 * ## Was hier geprüft wird — und was nicht
 *
 * Diese Datei prüft die **Mechanik**: Wird `set_config` mit dem richtigen Argument
 * gesendet? Geschieht es **vor** der Arbeit? Läuft die Arbeit **innerhalb** der
 * Transaktion? Bricht es **laut** ab, wenn keine da ist?
 *
 * Sie prüft **nicht**, ob die Datenbank danach filtert. Das ist eine Eigenschaft von
 * Row Level Security und steht gemessen in
 * `docs/status/mandantentrennung.md` §13 und in
 * `packages/auth/db-schema/tests/proben/rls-verhalten.sql`. Und die
 * **Transaktionslokalität** am echten Treiber prüft
 * `packages/auth/store-postgres/tests/postgres.test.ts`.
 *
 * **Warum diese Trennung.** Eine Attrappe kann bestätigen, was der eigene Code tut —
 * sie kann **nicht** bestätigen, was PostgreSQL tut. Wer beides in einen Test legt,
 * prüft am Ende seine eigene Annahme.
 */

import { describe, expect, it } from 'bun:test'
import { mitMandant, type SqlZugang, type TransaktionsZugang } from '../src/index.ts'

/** Eine Anweisung, wie sie wirklich gesendet wurde. */
interface Gesendet {
  readonly anweisung: string
  readonly werte: readonly unknown[]
  /** `aussen` = über den Zugang, `innen` = über die Transaktion. */
  readonly ueber: 'aussen' | 'innen'
}

/**
 * Eine Attrappe, die **mitschreibt** statt zu antworten.
 *
 * Sie liefert die vorbereiteten Zeilen der Reihe nach zurück, damit `arbeit` etwas zu
 * lesen hat; alles andere interessiert hier nicht.
 */
function attrappe(antworten: readonly unknown[] = []): {
  zugang: TransaktionsZugang
  gesendet: Gesendet[]
  transaktionen: number
} {
  const gesendet: Gesendet[] = []
  let lauf = 0
  let transaktionen = 0
  const innen: SqlZugang = {
    async unsafe(anweisung: string, werte: readonly unknown[] = []) {
      gesendet.push({ anweisung, werte, ueber: 'innen' })
      const a = antworten[lauf]
      lauf += 1
      return a ?? []
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
  return {
    zugang,
    gesendet,
    get transaktionen() {
      return transaktionen
    },
  }
}

describe('mitMandant setzt den Mandanten richtig', () => {
  it('sendet set_config mit dem dritten Argument true (transaktionslokal)', async () => {
    const a = attrappe()
    const mandant = 'aaaaaaaa-0000-4000-8000-000000000001'
    await mitMandant(a.zugang, mandant, async () => 'fertig')

    const setzend = a.gesendet.filter((g) => g.anweisung.includes('set_config'))
    expect(setzend).toHaveLength(1)
    expect(setzend[0]?.anweisung).toContain('pmh.user_id')
    // **Das dritte Argument ist der ganze Punkt.** `true` heißt `is_local` und bindet
    // den Wert an die Transaktion. Stünde dort `false` (oder fehlte es), bliebe der
    // Mandant in der VERBINDUNG stehen — und weil Verbindungen wiederverwendet werden,
    // liefe die nächste Abfrage unter dem vorigen Benutzer.
    expect(setzend[0]?.werte).toEqual([mandant])
    expect(setzend[0]?.anweisung).toContain(', true)')
    expect(setzend[0]?.anweisung).not.toContain(', false)')
  })

  it('setzt den Mandanten VOR der Arbeit — nicht danach', async () => {
    const a = attrappe()
    await mitMandant(a.zugang, 'aaaaaaaa-0000-4000-8000-000000000002', async (s) => {
      await s.unsafe('select 1')
    })
    const arten = a.gesendet.map((g) => (g.anweisung.includes('set_config') ? 'setzen' : 'arbeiten'))
    expect(arten).toEqual(['setzen', 'arbeiten'])
  })

  it('läuft INNEN: die Arbeit benutzt die Transaktion, nicht den äußeren Zugang', async () => {
    const a = attrappe()
    await mitMandant(a.zugang, 'aaaaaaaa-0000-4000-8000-000000000003', async (s) => {
      await s.unsafe('select aus_der_arbeit')
    })
    const ausArbeit = a.gesendet.find((g) => g.anweisung === 'select aus_der_arbeit')
    expect(ausArbeit?.ueber).toBe('innen')
    // Und: der äußere Zugang wurde für die Arbeit **nicht** benutzt. Wäre er es,
    // liefe die Abfrage ohne Mandanten — und RLS gäbe still null Zeilen.
    expect(a.gesendet.some((g) => g.ueber === 'aussen')).toBe(false)
  })

  it('gibt den Rückgabewert der Arbeit durch', async () => {
    const a = attrappe()
    const wert = await mitMandant(a.zugang, 'aaaaaaaa-0000-4000-8000-000000000004', async () => 42)
    expect(wert).toBe(42)
  })

  it('öffnet GENAU EINE Transaktion', async () => {
    const a = attrappe()
    await mitMandant(a.zugang, 'aaaaaaaa-0000-4000-8000-000000000005', async () => undefined)
    expect(a.transaktionen).toBe(1)
  })
})

describe('Ohne Transaktion bricht es LAUT ab', () => {
  it('wirft mit Begründung, statt sitzungsweit zu setzen', async () => {
    // **Die Gegenprobe.** Der naheliegende Rückfall wäre „dann setzen wir den Mandanten
    // eben ohne Transaktion". Genau der erzeugt das Leck: der Wert bliebe in der
    // Verbindung stehen. Deshalb muß es hier **werfen**.
    const ohne: SqlZugang = { async unsafe() { return [] } }
    await expect(mitMandant(ohne, 'aaaaaaaa-0000-4000-8000-000000000006', async () => 1)).rejects.toThrow(
      /begin/u,
    )
    await expect(mitMandant(ohne, 'aaaaaaaa-0000-4000-8000-000000000006', async () => 1)).rejects.toThrow(
      /Verbindung/u,
    )
  })

  it('sendet in diesem Fall NICHTS — auch kein set_config', async () => {
    const gesendet: string[] = []
    const ohne: SqlZugang = {
      async unsafe(anweisung: string) {
        gesendet.push(anweisung)
        return []
      },
    }
    await expect(mitMandant(ohne, 'aaaaaaaa-0000-4000-8000-000000000007', async () => 1)).rejects.toThrow()
    expect(gesendet).toEqual([])
  })
})
