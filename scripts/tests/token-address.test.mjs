/**
 * Prüfungen für {@link module:scripts/token-adresse}.
 *
 * Der Anlass ist gemessen: die Startausgabe nennt `http://127.0.0.1:3081/`, und
 * der Aufruf dieser Adresse antwortet mit **401**. Wer die Anleitung befolgt,
 * landet auf einer Fehlerseite. Diese Prüfungen halten fest, dass die
 * **benutzbare** Adresse ausgegeben wird — genau einmal, und nie eine
 * abgeschnittene.
 *
 * Die Stückgrenzen in den Prüfungen sind **gemessen**: die Ausgabe des Hosts kam
 * in Stücken bis 158 Zeichen, und die Adresse lag in einem Fall über zwei Stücke
 * verteilt.
 */
import { describe, expect, test } from 'bun:test'

import {
  TOKEN_VOLLE_LAENGE,
  announceAuthUrl,
  findAuthUrl,
  tokenOf,
} from '../token-adresse.mjs'

/** Die gemessene Ausgabezeile des Hosts (13.10.2026, Port 3081). */
const TOKEN = 'jWQ3mZm0Qk9Xv1pR7sT2bN4cL6hG8dF5aE3zY1uI0oP'
const ECHT = `dsh web: http://127.0.0.1:3081/?token=${TOKEN}`

if (TOKEN.length !== TOKEN_VOLLE_LAENGE) {
  throw new Error(
    `Prüfdaten stimmen nicht mit der Schranke überein: ${TOKEN.length} statt ${TOKEN_VOLLE_LAENGE}`,
  )
}

/** Sammelt die Ausgabe in ein Feld. */
function sammle() {
  const zeilen = []
  const a = announceAuthUrl((t) => zeilen.push(t))
  return { zeilen, a, alle: () => zeilen.join('\n') }
}

describe('findAuthUrl', () => {
  test('findet die gemessene Adresse des Hosts', () => {
    expect(findAuthUrl(ECHT)).toBe(`http://127.0.0.1:3081/?token=${TOKEN}`)
  })

  test('nimmt auch localhost und ::1', () => {
    expect(findAuthUrl('öffne http://localhost:3080/?token=abcdefgh')).toBe(
      'http://localhost:3080/?token=abcdefgh',
    )
    expect(findAuthUrl('öffne http://[::1]:3080/?token=abcdefgh')).toBe(
      'http://[::1]:3080/?token=abcdefgh',
    )
  })

  test('erkennt eine Adresse ohne Token NICHT — sonst würde eine fremde URL genommen', () => {
    expect(findAuthUrl('dsh web: http://127.0.0.1:3081/')).toBeUndefined()
    expect(findAuthUrl('Bereit auf http://0.0.0.0:9000/')).toBeUndefined()
    expect(findAuthUrl('siehe https://example.com/?token=abcdefgh')).toBeUndefined()
  })

  test('erkennt `?token=` ohne Inhalt NICHT', () => {
    expect(findAuthUrl('dsh web: http://127.0.0.1:3081/?token=')).toBeUndefined()
    expect(findAuthUrl('dsh web: http://127.0.0.1:3081/?token=jWQ')).toBeUndefined()
  })

  test('nimmt ein Token mit Sonderzeichen vollständig — keine geratene Zeichenklasse', () => {
    // Ein Muster wie `[A-Za-z0-9_-]+` wäre eine Annahme über die Form des Tokens
    // und würde hier abschneiden.
    expect(findAuthUrl('w http://127.0.0.1:3080/?token=a.b~c%2Fd+efgh')).toBe(
      'http://127.0.0.1:3080/?token=a.b~c%2Fd+efgh',
    )
  })

  test('leere und falsche Eingaben sind kein Fehler', () => {
    expect(findAuthUrl('')).toBeUndefined()
    expect(findAuthUrl(undefined)).toBeUndefined()
    expect(findAuthUrl(null)).toBeUndefined()
    expect(findAuthUrl(42)).toBeUndefined()
  })

  test('tokenOf liest den Token heraus', () => {
    expect(tokenOf(`http://127.0.0.1:3080/?token=${TOKEN}`)).toBe(TOKEN)
    expect(tokenOf('http://127.0.0.1:3080/')).toBe('')
  })
})

describe('announceAuthUrl', () => {
  test('gibt die Adresse aus, wenn der Host eine Zeile abschließt', () => {
    const { a, alle } = sammle()
    a.feed(`${ECHT}\n`)
    expect(a.done()).toBe(true)
    expect(alle()).toContain(`http://127.0.0.1:3081/?token=${TOKEN}`)
  })

  test('gibt die Adresse genau einmal aus, auch bei mehrfacher Nennung', () => {
    const { zeilen, a, alle } = sammle()
    a.feed(`${ECHT}\n`)
    a.feed(`${ECHT}\n`)
    a.feed('dsh web: http://127.0.0.1:3081/?token=einZweiterToken1234567890123456\n')
    expect(alle().split(`?token=${TOKEN}`)).toHaveLength(2)
    expect(zeilen.filter((z) => z.includes('?token='))).toHaveLength(1)
    expect(a.done()).toBe(true)
  })

  test('die letzte Zeile OHNE Umbruch wird gemeldet', () => {
    // **Der Befund, der diese Prüfung erzwungen hat.** Der Host schreibt die
    // Adresse ohne abschließenden Umbruch. Ein Puffer, der auf einen Umbruch
    // wartet, erkennt sie nie.
    const { a, alle } = sammle()
    a.feed('lade Profile …\n')
    a.feed(ECHT)
    expect(a.done()).toBe(true)
    expect(alle()).toContain(`?token=${TOKEN}`)
  })

  test('eine über zwei Stücke geteilte Adresse wird vollständig und einmal gemeldet', () => {
    // Genau dieser Fall ist gemessen: die Ausgabe kam in Stücken, die Adresse lag
    // über zwei davon verteilt. Wird der erste Teil für vollständig gehalten, geht
    // die echte Adresse verloren.
    const { zeilen, a, alle } = sammle()
    a.feed('dsh web: http://127.0.0.1:308')
    a.feed('1/?token=jWQ3mZm0Qk')
    a.feed('9Xv1pR7sT2bN4cL6hG8dF5aE3zY1uI0oP\n')
    expect(a.done()).toBe(true)
    expect(alle()).toContain(`?token=${TOKEN}`)
    expect(zeilen.filter((z) => z.includes('?token='))).toHaveLength(1)
  })

  test('eine über zwei Stücke geteilte Adresse OHNE Umbruch wird nach flush gemeldet', () => {
    const { a, alle } = sammle()
    a.feed('dsh web: http://127.0.0.1:3081/?tok')
    a.feed(`en=${TOKEN}`)
    // Sofort gemeldet: die Tokenlänge ist voll.
    expect(a.done()).toBe(true)
    expect(alle()).toContain(`?token=${TOKEN}`)
  })

  test('ohne flush bleibt ein abgeschnittener Rest ungemeldet — er ist kein Ergebnis', () => {
    const { a, alle } = sammle()
    a.feed('dsh web: http://127.0.0.1:3081/?token=jWQ3mZm0Qk9Xv1p')
    expect(a.done()).toBe(false)
    expect(alle()).toBe('')
  })

  test('gibt nichts aus, solange keine Anmeldeadresse kommt', () => {
    const { a, zeilen } = sammle()
    a.feed('lade Profile …\n')
    a.feed('kein Token hier\n')
    a.flush()
    expect(zeilen).toEqual([])
    expect(a.done()).toBe(false)
  })

  test('flush nach vollständiger Ausgabe ändert nichts', () => {
    const { zeilen, a } = sammle()
    a.feed(`${ECHT}\n`)
    const vorher = zeilen.length
    a.flush()
    expect(zeilen).toHaveLength(vorher)
    expect(a.done()).toBe(true)
  })

  test('eine Zeile ohne Umbruch verschwindet nicht dauerhaft', () => {
    const { a } = sammle()
    a.feed('halb')
    expect(a.done()).toBe(false)
    a.feed('e Zeile ohne Umbruch')
    expect(a.done()).toBe(false)
  })

  test('Windows-Zeilenenden werden genauso behandelt', () => {
    const { a, alle } = sammle()
    a.feed('lade Profile …\r\n')
    a.feed(`${ECHT}\r\n`)
    expect(a.done()).toBe(true)
    expect(alle()).toContain(`?token=${TOKEN}`)
  })

  test('eine Adresse in der Mitte einer Zeile wird gefunden', () => {
    const { a, alle } = sammle()
    a.feed(`[host] 2026-10-13 web-app: dsh web: http://127.0.0.1:3081/?token=${TOKEN} bereit\n`)
    expect(a.done()).toBe(true)
    expect(alle().trim().endsWith(`http://127.0.0.1:3081/?token=${TOKEN}`)).toBe(true)
  })
})
