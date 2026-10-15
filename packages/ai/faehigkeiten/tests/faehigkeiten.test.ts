/**
 * Die Registratur der Fähigkeiten — **rein** geprüft, ohne Netz und ohne Dateisystem.
 *
 * ## Was diese Datei beweist
 *
 * Daß die Registratur **auswählt** statt zu raten: sie nimmt den ersten **einsatzbereiten**
 * Anbieter, sie **wirft** statt still nichts zu tun, und sie nennt **jeden** Grund, warum ein
 * Anbieter ausfiel. Ein Aufrufer, der ein Urteil braucht, darf niemals ein erfundenes bekommen.
 *
 * Was sie **nicht** beweist: daß ein echter Anbieter (OpenRouter, ein lokales Modell) richtig
 * antwortet. Das ist eine eigene Prüfung je Anbieter — und gehört dorthin, wo der Anbieter lebt.
 */

import { describe, expect, test } from 'bun:test'
import {
  FAEHIGKEITEN,
  Faehigkeiten,
  KeinAnbieterError,
  NAME_DER_FAEHIGKEIT,
  type Anbieter,
  type Bereitschaft,
  type Faehigkeit,
  type Urteil,
} from '../src/index.ts'

/**
 * Ein Anbieter für die Prüfung.
 *
 * **Er tut wirklich etwas**: er merkt sich, ob er gefragt wurde. Damit ist prüfbar, ob die
 * Registratur ihn überhaupt angefaßt hat.
 *
 * @param eingabe - Kennung, Fähigkeiten und Bereitschaft
 * @returns der Anbieter
 */
function anbieter(eingabe: {
  readonly id: string
  readonly faehigkeiten: readonly Faehigkeit[]
  readonly bereit?: Bereitschaft
  readonly mitEntscheider?: boolean
}): Anbieter & { readonly gefragt: () => number } {
  let gefragt = 0
  const stand: Bereitschaft = eingabe.bereit ?? { bereit: true }
  return {
    id: eingabe.id,
    name: eingabe.id.toUpperCase(),
    faehigkeiten: eingabe.faehigkeiten,
    schluessel: 'kein-schluessel',
    modelle: () => ['ein-modell'],
    async bereit(): Promise<Bereitschaft> {
      gefragt += 1
      return stand
    },
    ...(eingabe.mitEntscheider === true
      ? {
          entscheider: {
            // **Das Urteil hat die Form, die das Schema verlangt** — hier fest verdrahtet, weil
            // die Attrappe kein Modell ist. Eine Attrappe, die etwas anderes zurückgibt als das
            // Schema zusagt, würde eine Prüfung grün machen, die nichts bedeutet.
            async entscheide<T>(): Promise<Urteil<T>> {
              return { wert: { antwort: 'ja' } as T, sicherheit: 0.9 }
            },
          },
        }
      : {}),
    gefragt: () => gefragt,
  }
}

describe('Was es an Fähigkeiten gibt', () => {
  test('jede Fähigkeit hat einen deutschen Namen — keine Lücke', () => {
    for (const faehigkeit of FAEHIGKEITEN) {
      const name = NAME_DER_FAEHIGKEIT[faehigkeit]
      expect({ faehigkeit, name: typeof name === 'string' && name.trim() !== '' }).toEqual({
        faehigkeit,
        name: true,
      })
    }
  })

  test('die Liste nennt keine Fähigkeit zweimal', () => {
    expect(new Set(FAEHIGKEITEN).size).toBe(FAEHIGKEITEN.length)
  })
})

describe('Anbieter eintragen', () => {
  test('eintragen und zurücknehmen', () => {
    const f = new Faehigkeiten()
    const zurueck = f.anbieten(anbieter({ id: 'openrouter', faehigkeiten: ['entscheiden'] }))
    expect(f.alle().map((a) => a.id)).toEqual(['openrouter'])
    zurueck()
    expect(f.alle()).toEqual([])
  })

  test('eine doppelte Kennung wird abgewiesen — kein stiller Ersatz', () => {
    const f = new Faehigkeiten()
    f.anbieten(anbieter({ id: 'openrouter', faehigkeiten: ['entscheiden'] }))
    expect(() => f.anbieten(anbieter({ id: 'openrouter', faehigkeiten: ['bild'] }))).toThrow('gibt es schon')
  })

  test('ein Anbieter ohne Fähigkeit wird abgewiesen', () => {
    // Ein Anbieter, der nichts kann, wäre ein Eintrag, der nichts beiträgt — und in der
    // Oberfläche ein Schalter ohne Wirkung.
    const f = new Faehigkeiten()
    expect(() => f.anbieten(anbieter({ id: 'leer', faehigkeiten: [] }))).toThrow('kann nichts')
  })

  test('ein Anbieter ohne Kennung wird abgewiesen', () => {
    const f = new Faehigkeiten()
    expect(() => f.anbieten(anbieter({ id: '   ', faehigkeiten: ['bild'] }))).toThrow('Kennung')
  })
})

describe('Auswählen statt raten', () => {
  test('der erste EINSATZBEREITE gewinnt — nicht der erste', async () => {
    const f = new Faehigkeiten()
    f.anbieten(
      anbieter({ id: 'ohne-schluessel', faehigkeiten: ['entscheiden'], bereit: { bereit: false, grund: 'Schlüssel fehlt' } }),
    )
    f.anbieten(anbieter({ id: 'tev-lokal', faehigkeiten: ['entscheiden'] }))

    const gewaehlt = await f.waehle('entscheiden')
    expect(gewaehlt.id).toBe('tev-lokal')
  })

  test('nur Anbieter MIT der Fähigkeit werden überhaupt gefragt', async () => {
    const f = new Faehigkeiten()
    const zeichner = anbieter({ id: 'bildner', faehigkeiten: ['bild'] })
    f.anbieten(zeichner)
    f.anbieten(anbieter({ id: 'denker', faehigkeiten: ['entscheiden'] }))

    await f.waehle('entscheiden')
    // Der Zeichner kann nicht entscheiden — ihn zu fragen wäre eine unnötige Nachfrage
    // (und bei einem echten Anbieter ein Netzaufruf).
    expect(zeichner.gefragt()).toBe(0)
  })

  test('OHNE einsatzbereiten Anbieter wird geworfen — mit jedem Grund', async () => {
    const f = new Faehigkeiten()
    f.anbieten(anbieter({ id: 'a', faehigkeiten: ['entscheiden'], bereit: { bereit: false, grund: 'Schlüssel fehlt' } }))
    f.anbieten(anbieter({ id: 'b', faehigkeiten: ['entscheiden'], bereit: { bereit: false, grund: 'Modell fehlt' } }))

    const fehler = await f.waehle('entscheiden').catch((f2: unknown) => f2)
    expect(fehler).toBeInstanceOf(KeinAnbieterError)
    const text = (fehler as Error).message
    // **Die Meldung nennt BEIDE Gründe.** Wer sie liest, soll wissen, was zu tun ist — und
    // nicht den zweiten Anbieter selbst herausfinden müssen.
    expect(text).toContain('Entscheiden')
    expect(text).toContain('A: Schlüssel fehlt')
    expect(text).toContain('B: Modell fehlt')
  })

  test('ohne eingetragenen Anbieter sagt die Meldung genau das', async () => {
    const f = new Faehigkeiten()
    const fehler = await f.waehle('bild').catch((f2: unknown) => f2)
    expect((fehler as Error).message).toContain('keiner eingetragen')
  })

  test('ein Anbieter, der die Fähigkeit NENNT und nichts liefert, fliegt auf', async () => {
    // Der gefährlichste Fall: der Anbieter steht als „kann entscheiden" in der Liste, hat aber
    // keinen Entscheider. Ohne diese Prüfung liefe der Aufrufer in einen TypeError.
    const f = new Faehigkeiten()
    f.anbieten(anbieter({ id: 'prahler', faehigkeiten: ['entscheiden'] }))
    await expect(f.entscheider()).rejects.toThrow('liefert aber keinen Entscheider')
  })

  test('der Entscheider kommt durch — und das Urteil trägt, was der Anbieter wußte', async () => {
    const f = new Faehigkeiten()
    f.anbieten(anbieter({ id: 'tev', faehigkeiten: ['entscheiden'], mitEntscheider: true }))
    const entscheider = await f.entscheider()
    const urteil = await entscheider.entscheide({
      frage: 'Soll ich das tun?',
      lage: { x: 1 },
      schema: { felder: { antwort: { art: 'text', auswahl: ['ja', 'nein'] } } },
    })
    expect(urteil.wert).toEqual({ antwort: 'ja' })
    expect(urteil.sicherheit).toBe(0.9)
  })
})
