/**
 * Die Wahl der Sprache — rein geprüft, ohne Browser.
 *
 * `waehleSprache` bekommt Keks und Browsersprache **hereingereicht** und ist damit reine
 * Logik. Das ist Absicht: die Regel „Keks schlägt Browser, Browser schlägt Vorgabe" soll
 * prüfbar sein, ohne ein Fenster zu öffnen — auf diesem Rechner gibt es ohnehin keinen Browser.
 */

import { describe, expect, test } from 'bun:test'
import { VORGABE_SPRACHE } from '@prometheus-harness/languages'
import { waehleSprache } from '../src/language.ts'

describe('Die Sprache wählen', () => {
  test('der Keks schlägt alles', () => {
    expect(waehleSprache('en', 'de-DE')).toBe('en')
    expect(waehleSprache('de', 'en-US')).toBe('de')
  })

  test('ohne Keks entscheidet der Browser', () => {
    expect(waehleSprache(undefined, 'en-GB')).toBe('en')
    expect(waehleSprache(undefined, 'de')).toBe('de')
  })

  test('ein unbekannter Kekswert fällt auf den Browser zurück — nicht auf einen Fehler', () => {
    expect(waehleSprache('klingonisch', 'en-US')).toBe('en')
  })

  test('ohne beides gilt die Vorgabe', () => {
    expect(waehleSprache(undefined, undefined)).toBe(VORGABE_SPRACHE)
    expect(waehleSprache(undefined, '')).toBe(VORGABE_SPRACHE)
    expect(waehleSprache('', 'zz-ZZ')).toBe(VORGABE_SPRACHE)
  })

  test('nur der erste Teil der Browsersprache zählt — die Region ist keine Sprache', () => {
    // `de-CH` und `de` sind dieselbe Sprache. Wer den ganzen Wert vergleicht, zeigt einem
    // Schweizer die Vorgabe statt Deutsch.
    expect(waehleSprache(undefined, 'de-CH')).toBe('de')
    expect(waehleSprache(undefined, 'en-AU')).toBe('en')
  })

  test('Groß- und Kleinschreibung im Browserwert stört nicht', () => {
    expect(waehleSprache(undefined, 'EN-us')).toBe('en')
    expect(waehleSprache(undefined, 'De')).toBe('de')
  })

  test('GEGENPROBE: eine nicht angebotene Browsersprache öffnet nicht die Vorgabe-Tür falsch', () => {
    // Wäre die Prüfung „gibt es irgendeinen Wert?", käme hier `fr` heraus — und die Seite
    // hätte keine Texte. Genau das darf nicht passieren.
    const gewaehlt = waehleSprache(undefined, 'fr-FR')
    expect(gewaehlt).toBe(VORGABE_SPRACHE)
    expect(gewaehlt).not.toBe('fr')
  })
})
