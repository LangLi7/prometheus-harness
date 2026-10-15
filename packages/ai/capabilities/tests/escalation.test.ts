/**
 * Die Eskalation — **rein** geprüft, ohne Netz, ohne Modell, ohne Oberfläche.
 *
 * ## Was diese Datei beweist
 *
 * Drei Regeln, die zusammengehören, und jede ist aus einem echten Fehler entstanden:
 *
 * 1. **Die Bereitschaft gilt je Fähigkeit.** Ein Anbieter, dem das Modell für `einbetten` fehlt,
 *    darf für `entscheiden` **nicht** übersprungen werden. Vorher fragte die Registratur nur
 *    „bist du bereit?" — und ein Anbieter mit drei von vier eingerichteten Fähigkeiten hätte
 *    „nein" sagen müssen und wäre für **alles** ausgefallen. Der Aufrufer hätte eine Antwort
 *    bekommen, nur von der falschen Stelle.
 *
 * 2. **Unwissen führt zum Menschen.** Ein Urteil **ohne** Sicherheitsangabe wird nicht als
 *    „sicher genug" gelesen, sondern als „ich weiß es nicht".
 *
 * 3. **Der Mensch ist die letzte Instanz** — und was er entschieden hat, ist entschieden.
 *
 * ## Was diese Datei NICHT beweist
 *
 * Daß ein echtes Modell (Jev, Gemini, DeepSeek) brauchbare Sicherheiten liefert. Hier antworten
 * Attrappen mit **vorgegebenen** Zahlen. Ob die Zahlen im Betrieb taugen, ist eine Messung am
 * echten Modell und eine Frage der Schwellen — und die Schwellen gehören dem Aufrufer.
 */

import { describe, expect, test } from 'bun:test'
import {
  Faehigkeiten,
  KeinAnbieterError,
  MENSCH_ID,
  menschAlsAnbieter,
  umgangFuer,
  type Anbieter,
  type Bereitschaft,
  type EntscheidungsEingabe,
  type Faehigkeit,
  type Urteil,
} from '../src/index.ts'

/**
 * Ein Anbieter, dessen Bereitschaft **von der Fähigkeit abhängt**.
 *
 * @param eingabe - Kennung, Fähigkeiten, Bereitschaft und die Antwort des Entscheiders
 * @returns der Anbieter und die Liste, mit welcher Fähigkeit er gefragt wurde
 */
function anbieterMit(eingabe: {
  readonly id: string
  readonly faehigkeiten: readonly Faehigkeit[]
  readonly bereitFuer?: readonly Faehigkeit[]
  readonly antwort?: unknown
  readonly sicherheit?: number
}): Anbieter & { readonly gefragtMit: Faehigkeit[] } {
  const gefragtMit: Faehigkeit[] = []
  return {
    id: eingabe.id,
    name: eingabe.id.toUpperCase(),
    faehigkeiten: eingabe.faehigkeiten,
    schluessel: 'kein-schluessel',
    modelle: () => ['ein-modell'],
    async bereit(faehigkeit: Faehigkeit): Promise<Bereitschaft> {
      gefragtMit.push(faehigkeit)
      if (eingabe.faehigkeiten.includes(faehigkeit) === false) {
        return { bereit: false, grund: `kann ${faehigkeit} nicht` }
      }
      if (eingabe.bereitFuer !== undefined && !eingabe.bereitFuer.includes(faehigkeit)) {
        return { bereit: false, grund: `kein Modell für ${faehigkeit}` }
      }
      return { bereit: true }
    },
    ...(eingabe.faehigkeiten.includes('entscheiden')
      ? {
          entscheider: {
            async entscheide<T>(_eingabe: EntscheidungsEingabe<T>): Promise<Urteil<T>> {
              return {
                wert: (eingabe.antwort ?? { antwort: 'ja' }) as T,
                ...(eingabe.sicherheit === undefined ? {} : { sicherheit: eingabe.sicherheit }),
              }
            },
          },
        }
      : {}),
    gefragtMit,
  }
}

// ---------------------------------------------------------------------------
// 1. Die Bereitschaft gilt je Fähigkeit
// ---------------------------------------------------------------------------

describe('Die Bereitschaft gilt JE FÄHIGKEIT — nicht im Ganzen', () => {
  test('ein Anbieter ohne Modell fürs Einbetten wird fürs Entscheiden trotzdem genommen', async () => {
    const f = new Faehigkeiten()
    const teuer = anbieterMit({
      id: 'mit-schluessel',
      faehigkeiten: ['entscheiden', 'einbetten'],
      // Für `einbetten` fehlt die Einstellung, für `entscheiden` ist alles da.
      bereitFuer: ['entscheiden'],
    })
    f.anbieten(teuer)

    const gewaehlt = await f.waehle('entscheiden')
    expect(gewaehlt.id).toBe('mit-schluessel')
    // **Und die Registratur hat die Fähigkeit auch mitgegeben.** Ohne diese Zeile wäre der Test
    // grün, obwohl die Registratur „im Ganzen" fragt — die Attrappe antwortet ja pauschal.
    expect(teuer.gefragtMit).toEqual(['entscheiden'])
  })

  test('für das Einbetten wird er übersprungen — und der nächste genommen', async () => {
    const f = new Faehigkeiten()
    f.anbieten(
      anbieterMit({
        id: 'ohne-einbettung',
        faehigkeiten: ['entscheiden', 'einbetten'],
        bereitFuer: ['entscheiden'],
      }),
    )
    f.anbieten(anbieterMit({ id: 'mit-einbettung', faehigkeiten: ['einbetten'] }))

    const gewaehlt = await f.waehle('einbetten')
    expect(gewaehlt.id).toBe('mit-einbettung')
  })

  test('die Meldung nennt den Grund JE FÄHIGKEIT', async () => {
    const f = new Faehigkeiten()
    f.anbieten(
      anbieterMit({ id: 'halb', faehigkeiten: ['entscheiden'], bereitFuer: [] }),
    )
    const fehler = await f.waehle('entscheiden').catch((e: unknown) => e)
    expect(fehler).toBeInstanceOf(KeinAnbieterError)
    expect((fehler as Error).message).toContain('kein Modell für entscheiden')
  })

  test('eine Attrappe, die die Fähigkeit gar nicht kann, wird nicht einmal gefragt', async () => {
    const f = new Faehigkeiten()
    const zeichner = anbieterMit({ id: 'zeichner', faehigkeiten: ['bild'] })
    f.anbieten(zeichner)
    f.anbieten(anbieterMit({ id: 'denker', faehigkeiten: ['entscheiden'] }))

    await f.waehle('entscheiden')
    expect(zeichner.gefragtMit).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 2. Unwissen führt zum Menschen
// ---------------------------------------------------------------------------

describe('Wie mit einem Urteil umzugehen ist', () => {
  /** Zwei Stufen: ab 0,9 automatisch, ab 0,5 mit Rückfrage, darunter zum Menschen. */
  const STUFEN = { automatisch: 0.9, rueckfrage: 0.5 }

  test('hohe Sicherheit — handeln', () => {
    expect(umgangFuer({ sicherheit: 0.95 }, STUFEN)).toBe('handeln')
  })

  test('genau auf der Grenze wird gehandelt — die Grenze gehört dazu', () => {
    expect(umgangFuer({ sicherheit: 0.9 }, STUFEN)).toBe('handeln')
  })

  test('mittlere Sicherheit — nachfragen', () => {
    expect(umgangFuer({ sicherheit: 0.7 }, STUFEN)).toBe('rueckfrage')
  })

  test('genau auf der Rückfrage-Grenze wird nachgefragt', () => {
    expect(umgangFuer({ sicherheit: 0.5 }, STUFEN)).toBe('rueckfrage')
  })

  test('niedrige Sicherheit — zum Menschen', () => {
    expect(umgangFuer({ sicherheit: 0.2 }, STUFEN)).toBe('mensch')
  })

  test('OHNE Sicherheitsangabe — zum Menschen. Das ist die wichtigste Regel', () => {
    // Ein fehlendes Feld als „sicher genug" zu lesen, wäre der stille Fehler: es sähe aus wie
    // eine Entscheidung und wäre doch nur ein leeres Feld.
    expect(umgangFuer({}, STUFEN)).toBe('mensch')
  })

  test('unbrauchbare Sicherheit wird nicht geraten', () => {
    for (const wert of [Number.NaN, 1.5, -0.1, Number.POSITIVE_INFINITY]) {
      expect({ wert, umgang: umgangFuer({ sicherheit: wert }, STUFEN) }).toEqual({ wert, umgang: 'mensch' })
    }
  })

  test('verkehrt herum gesetzte Stufen fliegen auf', () => {
    expect(() => umgangFuer({ sicherheit: 0.7 }, { automatisch: 0.4, rueckfrage: 0.9 })).toThrow(
      'nie nachgefragt',
    )
  })

  test('Stufen außerhalb 0…1 fliegen auf', () => {
    expect(() => umgangFuer({ sicherheit: 0.7 }, { automatisch: 1.4, rueckfrage: 0.5 })).toThrow('zwischen 0 und 1')
    expect(() => umgangFuer({ sicherheit: 0.7 }, { automatisch: 0.9, rueckfrage: -1 })).toThrow('zwischen 0 und 1')
  })

  test('was ein MENSCH entschieden hat, ist entschieden — keine Schleife', () => {
    // Ohne diese Regel: der Mensch antwortet, seine Antwort trägt keine Sicherheit, die Regel
    // schickt sie wieder zum Menschen. Endlos.
    const vomMenschen = { herkunft: { anbieter: MENSCH_ID, modell: MENSCH_ID } }
    expect(umgangFuer(vomMenschen, STUFEN)).toBe('handeln')
    // Und auch dann, wenn zusätzlich eine niedrige Sicherheit dabeistünde: der Mensch bleibt
    // der Mensch.
    expect(umgangFuer({ ...vomMenschen, sicherheit: 0.1 }, STUFEN)).toBe('handeln')
  })
})

// ---------------------------------------------------------------------------
// 3. Der Mensch als letzte Instanz
// ---------------------------------------------------------------------------

describe('Der Mensch als letzter Anbieter', () => {
  test('ohne bereiten Anbieter entscheidet der Mensch — und die Frage kommt wirklich an', async () => {
    const f = new Faehigkeiten()
    f.anbieten(
      anbieterMit({ id: 'ohne-modell', faehigkeiten: ['entscheiden'], bereitFuer: [] }),
    )
    const gefragt: string[] = []
    f.anbieten(
      menschAlsAnbieter({
        frage: async <T,>(auftrag: { frage: string }): Promise<T> => {
          gefragt.push(auftrag.frage)
          return { antwort: 'nein' } as T
        },
      }),
    )

    const entscheider = await f.entscheider()
    const urteil = await entscheider.entscheide({
      frage: 'Darf dieser Text hinaus?',
      lage: { text: 'harmlos' },
      schema: { felder: { antwort: { art: 'text', auswahl: ['ja', 'nein'] } } },
    })

    expect(gefragt).toEqual(['Darf dieser Text hinaus?'])
    expect(urteil.wert).toEqual({ antwort: 'nein' })
    // **Man muß erkennen können, daß ein Mensch geantwortet hat.** Sonst hielte man sein Urteil
    // für das eines Modells — und würde Schwellen darauf anwenden, die es nicht kennt.
    expect(urteil.herkunft).toEqual({ anbieter: MENSCH_ID, modell: MENSCH_ID })
    expect(urteil.sicherheit).toBeUndefined()
  })

  test('der Mensch hat KEINE Sicherheit — sie wird nicht erfunden', async () => {
    const mensch = menschAlsAnbieter({ frage: async <T,>(): Promise<T> => ({ antwort: 'ja' }) as T })
    const urteil = await mensch.entscheider?.entscheide({
      frage: 'x',
      lage: 1,
      schema: { felder: { antwort: { art: 'text' } } },
    })
    expect(urteil?.sicherheit).toBeUndefined()
    // Und genau deshalb greift hier die Schleifen-Regel: der Mensch hat entschieden.
    expect(umgangFuer(urteil ?? {}, { automatisch: 0.9, rueckfrage: 0.5 })).toBe('handeln')
  })

  test('der Mensch ist bereit — aber nur für das, was er kann', async () => {
    const mensch = menschAlsAnbieter({ frage: async <T,>(): Promise<T> => ({}) as T })
    expect(await mensch.bereit('entscheiden')).toEqual({ bereit: true })
    const bild = await mensch.bereit('bild')
    expect(bild.bereit).toBe(false)
    expect(bild.bereit === false ? bild.grund : '').toContain('Bild')
  })

  test('steht der Mensch VORN, entscheidet er über alles', async () => {
    // Die Gefahr der Reihenfolge, als Prüfung festgehalten: der erste bereite gewinnt.
    const f = new Faehigkeiten()
    f.anbieten(menschAlsAnbieter({ frage: async <T,>(): Promise<T> => ({ antwort: 'mensch' }) as T }))
    f.anbieten(anbieterMit({ id: 'billig-und-schnell', faehigkeiten: ['entscheiden'], antwort: { antwort: 'modell' } }))

    const entscheider = await f.entscheider()
    const urteil = await entscheider.entscheide({
      frage: 'x',
      lage: 1,
      schema: { felder: { antwort: { art: 'text' } } },
    })
    expect(urteil.wert).toEqual({ antwort: 'mensch' })
    expect(urteil.herkunft?.anbieter).toBe(MENSCH_ID)
  })

  test('ohne Mensch und ohne bereiten Anbieter bleibt es bei einer ehrlichen Meldung', async () => {
    const f = new Faehigkeiten()
    f.anbieten(anbieterMit({ id: 'leer', faehigkeiten: ['entscheiden'], bereitFuer: [] }))
    const fehler = await f.entscheider().catch((e: unknown) => e)
    expect(fehler).toBeInstanceOf(KeinAnbieterError)
    expect((fehler as Error).message).toContain('kein Modell für entscheiden')
  })
})
