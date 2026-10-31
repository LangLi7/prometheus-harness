/**
 * Prüfungen der **Quittung** und des **Zug-Tors**.
 *
 * ## Warum diese Datei existiert
 *
 * Der Betreiber hat auf einen echten Fehlschlag gezeigt: ein Werkzeugaufruf, der
 * mitten im Zug abbrach, und ein Ergebnis, das nicht dauerhaft abgelegt war —
 * *„no result durably recorded"*. Seine Frage war, ob Prometheus so etwas
 * bekommt, weil „einfach alles neu gestartet wird".
 *
 * Die Antwort ist zweiteilig, und beide Teile sind hier geprüft:
 *
 *  1. **Kein Takt darf einen laufenden Zug töten.** Ein Wechsel, der einen neuen
 *     Prozess verlangt (`boot`), wird abgelehnt, solange ein Zug läuft.
 *  2. **Und wenn gewechselt wird, wird es gesagt.** Die Quittung nennt, ob der
 *     Prozess wechselt und ob die Sitzung fortgesetzt werden kann — denn
 *     „fortgesetzt" und „nicht fortgesetzt" sehen für den Aufrufer sonst gleich
 *     aus. Das Feld heißt bei Socket.IO `recovered`, und es gibt keinen Grund,
 *     es nicht zu haben.
 */

import { afterEach, describe, expect, test } from 'bun:test'

import { journalLesen, layoutFor, leseZeiger } from '../src/generation.ts'
import { baue, schalte, zustand } from '../src/operations.ts'
import { baueProjekt, type TestProjekt, type TestUnit } from './fixtures.ts'

let offen: TestProjekt[] = []

afterEach(async () => {
  for (const projekt of offen) await projekt.aufraeumen()
  offen = []
})

async function projekt(units: readonly TestUnit[] = [{ name: 'a' }]): Promise<TestProjekt> {
  const gebaut = await baueProjekt(units)
  offen.push(gebaut)
  return gebaut
}

describe('Quittung — was der Wechsel ehrlich zugibt', () => {
  test('ein Wechsel im Takt `hot` berührt keine Sitzung — und sagt es', async () => {
    const p = await projekt([{ name: 'a', reload: 'hot' }])
    await baue({ projectRoot: p.root })
    const ergebnis = await schalte({ projectRoot: p.root, art: 'switch' })

    expect(ergebnis.ok).toBe(true)
    expect(ergebnis.quittung?.prozessWechsel).toBe(false)
    expect(ergebnis.quittung?.fortsetzung).toBe('nicht-noetig')
    expect(ergebnis.quittung?.hinweis).toContain('Kein Prozeßwechsel')
    expect(ergebnis.quittung?.von).toBeNull()
    expect(ergebnis.quittung?.nach).toBe(1)
  })

  test('ein Wechsel im Takt `boot` wechselt den Prozess — und die Fortsetzung ist UNBEKANNT, solange niemand sie zusichert', async () => {
    const p = await projekt()
    await baue({ projectRoot: p.root })
    const ergebnis = await schalte({ projectRoot: p.root, art: 'switch' })

    expect(ergebnis.quittung?.prozessWechsel).toBe(true)
    expect(ergebnis.quittung?.fortsetzung).toBe('unbekannt')
    expect(ergebnis.quittung?.hinweis).toContain('niemand gesagt')
  })

  test('sagt der Aufrufer die Fortsetzbarkeit zu, steht `moeglich` — und die Zusicherung ist damit sichtbar', async () => {
    const p = await projekt()
    await baue({ projectRoot: p.root })
    const ergebnis = await schalte({ projectRoot: p.root, art: 'switch', fortsetzbar: true })

    expect(ergebnis.quittung?.fortsetzung).toBe('moeglich')
    expect(ergebnis.quittung?.hinweis).toContain('fortgesetzt werden')
  })

  test('die Quittung steht im Journal — nicht nur in der Antwort', async () => {
    const p = await projekt()
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'switch' })
    const eintraege = await journalLesen(layoutFor(p.root))
    const wechsel = eintraege.find((eintrag) => eintrag.event === 'switch')
    expect(wechsel?.detail).toContain('Prozeßwechsel')
  })
})

describe('Zug-Tor — kein Takt darf einen laufenden Zug töten', () => {
  test('ein Wechsel mit `boot` wird abgelehnt, solange ein Zug läuft — und setzt keinen Zeiger', async () => {
    const p = await projekt()
    await baue({ projectRoot: p.root })
    const ergebnis = await schalte({
      projectRoot: p.root,
      art: 'switch',
      zug: { laeuftEinZug: true, offeneWerkzeuge: 2 },
    })

    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.befunde.map((befund) => befund.code)).toContain('generation_zug_laeuft')
    expect(ergebnis.befunde[0]?.message).toContain('2 Werkzeug')
    expect(await leseZeiger(layoutFor(p.root), 'current')).toBeUndefined()
    // Und die Quittung erklärt die Ablehnung, statt sie nur zu werfen.
    expect(ergebnis.quittung?.prozessWechsel).toBe(true)
  })

  test('ein Wechsel im Takt `hot` läuft trotz laufendem Zug durch — er berührt ihn nicht', async () => {
    const p = await projekt([{ name: 'a', reload: 'hot' }])
    await baue({ projectRoot: p.root })
    const ergebnis = await schalte({ projectRoot: p.root, art: 'switch', zug: { laeuftEinZug: true } })

    expect(ergebnis.ok).toBe(true)
    expect(ergebnis.quittung?.zug?.laeuftEinZug).toBe(true)
    expect(ergebnis.quittung?.hinweis).toContain('es lief ein Zug')
  })

  test('--freigabe bricht das Tor ausdrücklich — und die Quittung nennt den Zug', async () => {
    const p = await projekt()
    await baue({ projectRoot: p.root })
    const ergebnis = await schalte({
      projectRoot: p.root,
      art: 'switch',
      zug: { laeuftEinZug: true, offeneSubagenten: 1 },
      freigabe: true,
    })

    expect(ergebnis.ok).toBe(true)
    expect(ergebnis.quittung?.zug?.laeuftEinZug).toBe(true)
    expect(await leseZeiger(layoutFor(p.root), 'current')).toBe(1)
  })

  test('„unbekannt" ist nicht „ruhig": ohne Auskunft wird nicht gesperrt, aber gesagt', async () => {
    const p = await projekt()
    await baue({ projectRoot: p.root })
    const ergebnis = await schalte({ projectRoot: p.root, art: 'switch' })

    expect(ergebnis.ok).toBe(true)
    expect(ergebnis.quittung?.zug).toBeUndefined()
    expect(ergebnis.quittung?.hinweis).toContain('nichts bekannt')
  })

  test('eine Weigerung VOR dem Wechsel trägt keine Quittung — und das ist richtig', async () => {
    const p = await projekt()
    const gebaut = await baue({ projectRoot: p.root })
    expect(gebaut.ok).toBe(true)

    // Eine Nummer, die es nicht gibt: die Weigerung kommt vor jedem Vergleich,
    // also gibt es nichts zu quittieren. Ein Quittungsobjekt über einen Wechsel,
    // der nie stattfand, wäre eine Auskunft über nichts.
    const ohne = await schalte({ projectRoot: p.root, nummer: 99, art: 'switch' })
    expect(ohne.ok).toBe(false)
    expect(ohne.quittung).toBeUndefined()
  })
})

describe('Zustand bleibt lesbar', () => {
  test('nach dem Wechsel meldet `zustand` denselben Stand wie die Quittung', async () => {
    const p = await projekt([{ name: 'a', reload: 'hot' }])
    await baue({ projectRoot: p.root })
    const ergebnis = await schalte({ projectRoot: p.root, art: 'switch' })
    const bericht = await zustand({ projectRoot: p.root })

    expect(bericht.current?.number).toBe(ergebnis.quittung?.nach)
    expect(bericht.current?.fingerprint).toBe(ergebnis.quittung?.fingerprint)
    expect(bericht.hatDrift).toBe(false)
  })
})
