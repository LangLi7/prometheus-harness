/**
 * Der Aufbau — **rein** geprüft: kein Netz, kein Modell, kein Dateisystem.
 *
 * ## Die drei Regeln, die hier bewiesen werden
 *
 * 1. **Der Mensch steht zuletzt.** Der erste einsatzbereite Anbieter gewinnt; stünde er vorn,
 *    entschiede er über alles — auch über das, was ein Modell in Millisekunden könnte.
 * 2. **Eine Wahl auf einen unbekannten Anbieter wird gemeldet.** Sonst wählte jemand `zai` für das
 *    Einbetten, die Wahl würde gespeichert — und **nichts geschähe**, lautlos.
 * 3. **Ein Anbieter ohne jede Wahl wird nicht eingetragen.** Er stünde sonst in jeder
 *    Eskalationsmeldung, obwohl der Nutzer ihn nie benutzen wollte.
 *
 * ## Was diese Datei NICHT beweist
 *
 * Daß ein echtes Modell antwortet. Die Anbieter hier sind Attrappen mit **vorgegebenen** Antworten.
 */

import { describe, expect, test } from 'bun:test'
import {
  KeinAnbieterError,
  menschAlsAnbieter,
  type Anbieter,
  type Bereitschaft,
  type EntscheidungsEingabe,
  type Faehigkeit,
  type Urteil,
} from '@prometheus-harness/faehigkeiten'
import { VORGABE, mitStufen, mitWahl, type Einstellungen } from '@prometheus-harness/settings'
import { STUFEN_VORSICHTIG, baueAuf } from '../src/index.ts'

/**
 * Ein Anbieter für die Prüfung.
 *
 * @param eingabe - Kennung, Fähigkeiten und Antwort
 * @returns der Anbieter und die Zahl seiner Aufrufe
 */
function attrappe(eingabe: {
  readonly id: string
  readonly faehigkeiten: readonly Faehigkeit[]
  readonly antwort: string
}): Anbieter & { readonly gerufen: () => number } {
  let gerufen = 0
  return {
    id: eingabe.id,
    name: eingabe.id.toUpperCase(),
    faehigkeiten: eingabe.faehigkeiten,
    schluessel: 'schluessel-noetig',
    modelle: () => ['ein-modell'],
    async bereit(_f: Faehigkeit): Promise<Bereitschaft> {
      return { bereit: true }
    },
    ...(eingabe.faehigkeiten.includes('entscheiden')
      ? {
          entscheider: {
            async entscheide<T>(_e: EntscheidungsEingabe<T>): Promise<Urteil<T>> {
              gerufen += 1
              return { wert: { quelle: eingabe.antwort } as unknown as T }
            },
          },
        }
      : {}),
    gerufen: () => gerufen,
  }
}

/** Ein menschlicher Anbieter, der eine feste Antwort gibt. */
function mensch(antwort: string, gerufen: { n: number }): Anbieter {
  return menschAlsAnbieter({
    frage: async <T,>(): Promise<T> => {
      gerufen.n += 1
      return { quelle: antwort } as unknown as T
    },
  })
}

/** Die Frage für die Prüfungen. */
const FRAGE = {
  frage: 'Wer antwortet?',
  lage: {},
  schema: { felder: { quelle: { art: 'text' as const } } },
}

// ---------------------------------------------------------------------------
// 1. Der Mensch steht zuletzt
// ---------------------------------------------------------------------------

describe('Der Mensch steht zuletzt', () => {
  test('mit einem eingerichteten Anbieter antwortet das MODELL, nicht der Mensch', async () => {
    const modell = attrappe({ id: 'openrouter', faehigkeiten: ['entscheiden'], antwort: 'modell' })
    const menschGerufen = { n: 0 }
    const auf = baueAuf({
      einstellungen: mitWahl(VORGABE, 'entscheiden', { anbieter: 'openrouter', modell: 'x/y' }),
      anbieter: [modell],
      mensch: mensch('mensch', menschGerufen),
    })

    const entscheider = await auf.faehigkeiten.entscheider()
    const urteil = await entscheider.entscheide(FRAGE)
    expect(urteil.wert).toEqual({ quelle: 'modell' })
    // **Der Mensch wurde nicht einmal gefragt.** Stünde er vorn, wäre er hier zum Zug gekommen.
    expect(menschGerufen.n).toBe(0)
    expect(auf.eingetragen).toEqual(['openrouter', 'mensch'])
  })

  test('OHNE eingerichtetes Modell entscheidet der Mensch — die Kette läuft durch', async () => {
    const menschGerufen = { n: 0 }
    const auf = baueAuf({
      einstellungen: VORGABE,
      anbieter: [attrappe({ id: 'openrouter', faehigkeiten: ['entscheiden'], antwort: 'modell' })],
      mensch: mensch('mensch', menschGerufen),
    })

    const entscheider = await auf.faehigkeiten.entscheider()
    const urteil = await entscheider.entscheide(FRAGE)
    expect(urteil.wert).toEqual({ quelle: 'mensch' })
    expect(menschGerufen.n).toBe(1)
    expect(urteil.herkunft?.anbieter).toBe('mensch')
  })

  test('ohne menschlichen Anbieter UND ohne Modell wird geworfen — es wird nichts geraten', async () => {
    const auf = baueAuf({ einstellungen: VORGABE, anbieter: [] })
    const fehler = await auf.faehigkeiten.entscheider().catch((e: unknown) => e)
    expect(fehler).toBeInstanceOf(KeinAnbieterError)
    expect(auf.hinweise.join(' ')).toContain('KEIN menschlicher Anbieter')
  })
})

// ---------------------------------------------------------------------------
// 2. Was gemeldet wird, statt lautlos zu bleiben
// ---------------------------------------------------------------------------

describe('Was gemeldet wird', () => {
  test('ein Anbieter OHNE jede Wahl wird nicht eingetragen', async () => {
    const ungenoetzt = attrappe({ id: 'zai', faehigkeiten: ['einbetten'], antwort: 'zai' })
    const auf = baueAuf({
      einstellungen: mitWahl(VORGABE, 'entscheiden', { anbieter: 'openrouter', modell: 'x/y' }),
      anbieter: [attrappe({ id: 'openrouter', faehigkeiten: ['entscheiden'], antwort: 'modell' }), ungenoetzt],
      mensch: mensch('mensch', { n: 0 }),
    })
    expect(auf.eingetragen).toEqual(['openrouter', 'mensch'])
    expect(auf.hinweise.join(' ')).toContain('„zai" wurde NICHT eingetragen')
  })

  test('DER LAUTLOSE FALL: eine Wahl auf einen UNBEKANNTEN Anbieter wird gemeldet', async () => {
    // Wer `zai` für das Einbetten wählt, für den es keinen Anbieter gibt, bekäme sonst gar nichts:
    // die Wahl wäre gespeichert, und nichts geschähe.
    const auf = baueAuf({
      einstellungen: mitWahl(VORGABE, 'einbetten', { anbieter: 'zai', modell: 'embedding-3' }),
      anbieter: [attrappe({ id: 'openrouter', faehigkeiten: ['entscheiden'], antwort: 'modell' })],
      mensch: mensch('mensch', { n: 0 }),
    })
    const text = auf.hinweise.join('\n')
    expect(text).toContain('„zai"')
    expect(text).toContain('Einbetten')
    expect(text).toContain('KEINEN Anbieter')
    expect(text).toContain('wirkt nicht')
  })

  test('fehlende Schwellen werden gemeldet — und es gilt die VORSICHTIGE Vorgabe', () => {
    const auf = baueAuf({ einstellungen: VORGABE, anbieter: [], mensch: mensch('m', { n: 0 }) })
    expect(auf.stufen).toEqual(STUFEN_VORSICHTIG)
    expect(auf.hinweise.join(' ')).toContain('keine Schwellen eingestellt')
  })

  test('gesetzte Schwellen gelten — und es wird nichts gemeldet', () => {
    const e = mitStufen(VORGABE, { automatisch: 0.8, rueckfrage: 0.3 })
    const auf = baueAuf({ einstellungen: e, anbieter: [], mensch: mensch('m', { n: 0 }) })
    expect(auf.stufen).toEqual({ automatisch: 0.8, rueckfrage: 0.3 })
    expect(auf.hinweise.join(' ')).not.toContain('keine Schwellen')
  })

  test('ohne jede Wahl wird gesagt, was die Folge ist', () => {
    const auf = baueAuf({ einstellungen: VORGABE, anbieter: [], mensch: mensch('m', { n: 0 }) })
    expect(auf.hinweise.join(' ')).toContain('KEINE Fähigkeit ein Modell gewählt')
    expect(auf.hinweise.join(' ')).toContain('kein Fehler')
  })

  test('die gewählten Fähigkeiten werden berichtet', () => {
    const e = mitWahl(
      mitWahl(VORGABE, 'entscheiden', { anbieter: 'openrouter', modell: 'a' }),
      'text-zu-sprache',
      { anbieter: 'openrouter', modell: 'b' },
    )
    const auf = baueAuf({
      einstellungen: e,
      anbieter: [attrappe({ id: 'openrouter', faehigkeiten: ['entscheiden', 'text-zu-sprache'], antwort: 'x' })],
      mensch: mensch('m', { n: 0 }),
    })
    expect([...auf.gewaehlt].sort()).toEqual(['entscheiden', 'text-zu-sprache'])
    expect(auf.eingetragen).toEqual(['openrouter', 'mensch'])
  })

  test('der Aufbau verändert die Einstellungen nicht', () => {
    const e: Einstellungen = mitWahl(VORGABE, 'entscheiden', { anbieter: 'openrouter', modell: 'a' })
    const vorher = JSON.stringify(e)
    baueAuf({ einstellungen: e, anbieter: [], mensch: mensch('m', { n: 0 }) })
    expect(JSON.stringify(e)).toBe(vorher)
  })
})
