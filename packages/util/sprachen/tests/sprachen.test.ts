/**
 * Die Sprachtabelle — vollständig, leerstellenfrei, und wirklich übersetzt.
 *
 * ## Warum diese Prüfungen
 *
 * Die **Typen** erzwingen schon, daß jede Sprache jedes Feld hat (`TEXTE: Record<string, Texte>`).
 * Diese Datei prüft das, was ein Typ **nicht** sieht:
 *
 * 1. Daß eine Sprache nicht nur **abgeschrieben** wurde — gleiche Texte in beiden Sprachen sind
 *    keine Übersetzung, und der Typ merkt es nicht.
 * 2. Daß kein Text leer ist. Ein leerer Text ist typrichtig und im Formular eine leere Stelle.
 * 3. Daß keine **Auszeichnung** in den Texten steht (`<`, `>`). Die Seite setzt ihr `<strong>`
 *    selbst; HTML aus der Tabelle wäre in jeder Sprache ein eigenes Problem.
 * 4. Daß ein **unbekannter** Wert niemals einen Fehler auslöst — er kommt aus einem Keks, also
 *    vom Aufrufer.
 */

import { describe, expect, test } from 'bun:test'
import {
  KEKS_SPRACHE,
  SPRACHEN,
  TEXTE,
  VORGABE_SPRACHE,
  istSprache,
  spracheAusKeks,
  texteFuer,
} from '../src/index.ts'

/** Die Felder, die jede Sprache tragen muß — aus der Tabelle selbst gelesen, nicht abgeschrieben. */
function felderVon(id: string): readonly string[] {
  const texte = TEXTE[id]
  if (texte === undefined) throw new Error(`Sprache ${id} fehlt in TEXTE`)
  return Object.keys(texte).sort()
}

describe('Die Tabelle', () => {
  test('die Vorgabe ist eine angebotene Sprache', () => {
    expect(SPRACHEN.map((s) => s.id)).toContain(VORGABE_SPRACHE)
    expect(istSprache(VORGABE_SPRACHE)).toBe(true)
  })

  test('jede angebotene Sprache liegt auch wirklich in der Tabelle', () => {
    for (const sprache of SPRACHEN) {
      expect({ id: sprache.id, da: TEXTE[sprache.id] !== undefined }).toEqual({ id: sprache.id, da: true })
    }
  })

  test('die Kennungen sind eindeutig, und jede trägt einen Namen', () => {
    const ids = SPRACHEN.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const sprache of SPRACHEN) {
      expect(sprache.label.trim().length).toBeGreaterThan(0)
    }
  })

  test('jede Sprache hat GENAU die Felder von Deutsch — keine mehr, keine weniger', () => {
    const deutsch = felderVon('de')
    expect(deutsch.length).toBeGreaterThan(30)
    for (const id of Object.keys(TEXTE)) {
      expect({ id, felder: felderVon(id) }).toEqual({ id, felder: deutsch })
    }
  })

  test('kein Text ist leer', () => {
    for (const [id, texte] of Object.entries(TEXTE)) {
      for (const [feld, wert] of Object.entries(texte)) {
        expect({ id, feld, leer: wert.trim() === '' }).toEqual({ id, feld, leer: false })
      }
    }
  })

  test('kein Text enthält Auszeichnung — die Seite setzt sie selbst', () => {
    for (const [id, texte] of Object.entries(TEXTE)) {
      for (const [feld, wert] of Object.entries(texte)) {
        const hatMarkup = wert.includes('<') || wert.includes('>')
        expect({ id, feld, hatMarkup }).toEqual({ id, feld, hatMarkup: false })
      }
    }
  })

  test('GEGENPROBE: Englisch ist wirklich übersetzt und nicht abgeschrieben', () => {
    // **Der Fall, den ein Typ nicht fängt.** Wer eine Sprache anlegt und die deutschen Texte
    // hineinkopiert, hat eine Sprache, die aussieht wie eine und keine ist. Hier muß sich die
    // Mehrheit der Felder unterscheiden.
    const deutsch = TEXTE['de']
    const englisch = TEXTE['en']
    expect(deutsch).toBeDefined()
    expect(englisch).toBeDefined()
    if (deutsch === undefined || englisch === undefined) return

    const felder = felderVon('de')
    const gleich = felder.filter((feld) => deutsch[feld as keyof typeof deutsch] === englisch[feld as keyof typeof englisch])
    // Ein paar Felder dürfen gleich sein: „Prometheus Harness" ist ein Name, kein Satz.
    expect(gleich.length).toBeLessThan(felder.length / 4)
  })
})

describe('Die Wahl der Sprache', () => {
  test('ohne Angabe gilt die Vorgabe', () => {
    expect(texteFuer(undefined)).toBe(TEXTE[VORGABE_SPRACHE] as never)
    expect(texteFuer('gibt-es-nicht')).toBe(TEXTE[VORGABE_SPRACHE] as never)
  })

  test('eine bekannte Sprache ergibt ihre Texte', () => {
    expect(texteFuer('en').titel).toBe('Prometheus Harness')
    expect(texteFuer('en').knopfAnmelden).not.toBe(texteFuer('de').knopfAnmelden)
  })

  test('der Keks wird gelesen', () => {
    expect(spracheAusKeks(`${KEKS_SPRACHE}=en`)).toBe('en')
    expect(spracheAusKeks(`andere=1; ${KEKS_SPRACHE}=en; nochwas=2`)).toBe('en')
  })

  test('ein unbekannter Kekswert ergibt die Vorgabe — und keinen Fehler', () => {
    expect(spracheAusKeks(`${KEKS_SPRACHE}=klingonisch`)).toBe(VORGABE_SPRACHE)
    expect(spracheAusKeks(`${KEKS_SPRACHE}=`)).toBe(VORGABE_SPRACHE)
  })

  test('ein kaputter oder fehlender Kopf ergibt die Vorgabe', () => {
    expect(spracheAusKeks(undefined)).toBe(VORGABE_SPRACHE)
    expect(spracheAusKeks('ohne-gleichheitszeichen')).toBe(VORGABE_SPRACHE)
    expect(spracheAusKeks(`${'x'.repeat(3)}=de`)).toBe(VORGABE_SPRACHE)
  })

  test('derselbe Keksname an zweiter Stelle zählt — der erste Treffer gewinnt', () => {
    expect(spracheAusKeks(`${KEKS_SPRACHE}=en; ${KEKS_SPRACHE}=de`)).toBe('en')
  })

  test('ein kodierter Wert wird gelesen', () => {
    expect(spracheAusKeks(`${KEKS_SPRACHE}=%65n`)).toBe('en')
  })
})
