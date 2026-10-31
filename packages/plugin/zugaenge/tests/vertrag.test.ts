/**
 * Der Vertrag — **ohne Host, ohne Netz, ohne Datei**.
 *
 * Was hier geprüft wird, ist die Stelle, an der ein Fehler am teuersten wäre: eine Datei, die
 * falsch gelesen wird, verliert Einträge; eine Kennung, die zweimal gebildet wird, verliert den
 * Schlüssel.
 *
 * @module @prometheus-harness/zugaenge/tests/vertrag
 */

import { describe, expect, test } from 'bun:test'

import {
  FASSUNG,
  Zugangsfehler,
  alsZugang,
  faehigkeitenVon,
  kennungAus,
  leseZugaenge,
  mitZugang,
  ohneZugang,
  pruefeEingabe,
  schreibeZugaenge,
  standVon,
  type Zugang,
  type ZugangEingabe,
} from '../src/vertrag.ts'

/** Eine brauchbare Eingabe. */
const EINGABE: ZugangEingabe = {
  name: 'OpenRouter privat',
  familie: 'openrouter',
  art: 'fern',
  schluessel: 'noetig',
  modelle: { gespraech: 'openai/gpt-oss-20b' },
}

/** Ein gespeicherter Zugang. */
function zugang(teil: Partial<Zugang> = {}): Zugang {
  return { ...alsZugang(EINGABE, new Date('2026-10-21T12:00:00.000Z')), ...teil }
}

describe('Die Kennung', () => {
  test('wird aus dem Namen gebildet, klein und mit Bindestrich', () => {
    expect(kennungAus('OpenRouter privat')).toBe('openrouter-privat')
  })

  test('Umlaute werden ausgeschrieben', () => {
    expect(kennungAus('Über Ämter')).toBe('ueber-aemter')
    expect(kennungAus('Straße')).toBe('strasse')
  })

  test('ein Name ohne Buchstaben ergibt eine Ersatzkennung', () => {
    expect(kennungAus('---')).toBe('zugang')
    expect(kennungAus('123')).toBe('z-123')
  })

  test('wird auf 48 Zeichen gekürzt, ohne Bindestrich am Ende', () => {
    const lang = kennungAus(`${'a'.repeat(47)} b c`)
    expect(lang.length).toBeLessThanOrEqual(48)
    expect(lang.endsWith('-')).toBe(false)
  })

  test('eine vorhandene Kennung bleibt bei einer Änderung', () => {
    const alt = zugang()
    const neu = alsZugang({ ...EINGABE, name: 'Anderer Name' }, new Date('2026-10-22T00:00:00.000Z'), alt)
    expect(neu.id).toBe(alt.id)
    expect(neu.angelegt).toBe(alt.angelegt)
    expect(neu.geaendert).toBe('2026-10-22T00:00:00.000Z')
  })
})

describe('Die Prüfung', () => {
  test('nimmt eine brauchbare Eingabe an und schneidet Leerraum ab', () => {
    const geprueft = pruefeEingabe({ ...EINGABE, name: '  OpenRouter  ' })
    expect(geprueft.name).toBe('OpenRouter')
    expect(geprueft.modelle.gespraech).toBe('openai/gpt-oss-20b')
  })

  test('lehnt eine unbekannte Fähigkeit ab — statt sie zu schlucken', () => {
    expect(() =>
      pruefeEingabe({ ...EINGABE, modelle: { 'text-zu-bild': 'x' } as unknown as ZugangEingabe['modelle'] }),
    ).toThrow(Zugangsfehler)
  })

  test('lehnt ein leeres Modell ab — leer heißt „kann er nicht", nicht „Modell 0"', () => {
    expect(() => pruefeEingabe({ ...EINGABE, modelle: { gespraech: '  ' } })).toThrow(Zugangsfehler)
  })

  test('verlangt für einen eigenen Endpunkt eine Basisadresse', () => {
    expect(() => pruefeEingabe({ ...EINGABE, familie: 'openai-kompatibel' })).toThrow(Zugangsfehler)
  })

  test('auch eine bekannte Familie braucht lokal eine eigene Adresse', () => {
    expect(() => pruefeEingabe({ ...EINGABE, art: 'lokal' })).toThrow(Zugangsfehler)
  })

  test('lehnt eine Basisadresse ab, die kein http(s) ist', () => {
    expect(() => pruefeEingabe({ ...EINGABE, familie: 'openai-kompatibel', basis: 'file:///etc/passwd' })).toThrow(
      Zugangsfehler,
    )
    expect(() => pruefeEingabe({ ...EINGABE, basis: 'nicht mal eine Adresse' })).toThrow(Zugangsfehler)
  })

  test('entfernt einen Schrägstrich am Ende der Basis', () => {
    const geprueft = pruefeEingabe({
      ...EINGABE,
      familie: 'openai-kompatibel',
      basis: 'http://127.0.0.1:11434/v1/',
    })
    expect(geprueft.basis).toBe('http://127.0.0.1:11434/v1')
  })

  test('sammelt ALLE Mängel auf einmal', () => {
    try {
      pruefeEingabe({ name: '', familie: '', art: 'irgendwas', schluessel: 'vielleicht' })
      throw new Error('hätte werfen müssen')
    } catch (fehler) {
      expect(fehler).toBeInstanceOf(Zugangsfehler)
      const maengel = (fehler as Zugangsfehler).maengel
      expect(maengel.length).toBeGreaterThanOrEqual(4)
    }
  })
})

describe('Der Stand', () => {
  test('ohne Fähigkeit: keine Fähigkeit — vor jeder Schlüsselfrage', () => {
    expect(standVon({ modelle: {}, schluessel: 'noetig' }, false)).toBe('keine-faehigkeit')
  })

  test('mit Fähigkeit, ohne Schlüssel: kein Schlüssel', () => {
    expect(standVon({ modelle: { gespraech: 'm' }, schluessel: 'noetig' }, false)).toBe('kein-schluessel')
  })

  test('mit Fähigkeit und Schlüssel: bereit', () => {
    expect(standVon({ modelle: { gespraech: 'm' }, schluessel: 'noetig' }, true)).toBe('bereit')
  })

  test('ohne Schlüsselbedarf: bereit, auch ohne Wert', () => {
    expect(standVon({ modelle: { gespraech: 'm' }, schluessel: 'kein' }, false)).toBe('bereit')
  })

  test('die Fähigkeiten stehen in fester Reihenfolge', () => {
    const zugang0 = zugang({ modelle: { bild: 'b', gespraech: 'g' } })
    expect(faehigkeitenVon(zugang0)).toEqual(['gespraech', 'bild'])
  })
})

describe('Die Datei', () => {
  test('eine leere Datei ist die leere Liste', () => {
    expect(leseZugaenge(`{"fassung":${String(FASSUNG)},"zugaenge":[]}`).zugaenge).toEqual([])
  })

  test('unbekannte Felder werden abgelehnt', () => {
    expect(() => leseZugaenge(`{"fassung":${String(FASSUNG)},"zugaenge":[{"name":"x","faehigkeiten":{}}]}`)).toThrow(
      Zugangsfehler,
    )
    expect(() => leseZugaenge(`{"fassung":${String(FASSUNG)},"zugaenge":[],"extra":1}`)).toThrow(Zugangsfehler)
  })

  test('eine unbekannte Fassung wird nicht gedeutet', () => {
    expect(() => leseZugaenge('{"fassung":2,"zugaenge":[]}')).toThrow(Zugangsfehler)
  })

  test('eine doppelte Kennung ist ein Fehler', () => {
    const eintrag = zugang()
    const text = JSON.stringify({ fassung: FASSUNG, zugaenge: [eintrag, eintrag] })
    expect(() => leseZugaenge(text)).toThrow(Zugangsfehler)
  })

  test('Schreiben und Lesen ist verlustfrei', () => {
    const datei = mitZugang({ fassung: FASSUNG, zugaenge: [] }, zugang())
    const gelesen = leseZugaenge(schreibeZugaenge(datei))
    expect(gelesen.zugaenge).toHaveLength(1)
    expect(gelesen.zugaenge[0]?.id).toBe('openrouter-privat')
  })

  test('die Reihenfolge in der Datei ist fest, nicht zufällig', () => {
    const a = zugang({ id: 'z-zweiter', name: 'Zweiter' })
    const b = zugang({ id: 'a-erster', name: 'Erster' })
    const text = schreibeZugaenge({ fassung: FASSUNG, zugaenge: [a, b] })
    expect(text.indexOf('"id": "a-erster"')).toBeLessThan(text.indexOf('"id": "z-zweiter"'))
  })

  test('eine Datei ohne Schlüssel bleibt ohne Schlüssel', () => {
    const datei = mitZugang({ fassung: FASSUNG, zugaenge: [] }, zugang())
    const text = schreibeZugaenge(datei)
    expect(text).not.toContain('schluessel-wert')
    expect(text).not.toContain('apiKey')
  })

  test('Entfernen meldet, ob etwas entfernt wurde', () => {
    const datei = mitZugang({ fassung: FASSUNG, zugaenge: [] }, zugang())
    expect(ohneZugang(datei, 'gibt-es-nicht').entfernt).toBe(false)
    expect(ohneZugang(datei, 'openrouter-privat').entfernt).toBe(true)
  })
})
