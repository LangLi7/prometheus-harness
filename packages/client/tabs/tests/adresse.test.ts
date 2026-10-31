/**
 * Prüfungen der Adreßform — **Pfade**, nicht Abfragen.
 *
 * Seit dem 28.10.2026 ist die Adresse ein Pfad (`/c/<Sitzung>`, `/w`); die Abfrage lebt nur noch
 * als Alias für alte Lesezeichen. Beides wird hier geprüft, weil die Umstellung sonst still
 * zurückfallen könnte.
 *
 * @module @prometheus-harness/client-tabs/tests/adresse
 */

import { describe, expect, test } from 'bun:test'
import {
  aliasZiel,
  chatHref,
  gleichesZiel,
  hrefFor,
  istEinfacherKlick,
  PANEL_ID,
  parsePfad,
  PFAD_CHAT,
  PFAD_UEBERSICHT,
  workspacesHref,
} from '../src/adresse.ts'

describe('Adressform', () => {
  test('die Sitzung steht kodiert im Pfad', () => {
    expect(chatHref('ses_1')).toBe('/c/ses_1')
    expect(chatHref('a b')).toBe('/c/a%20b')
    expect(chatHref('a&b=c')).toBe('/c/a%26b%3Dc')
    // **Kein doppelter Schrägstrich**, auch wenn die Kennung mit einem beginnt.
    expect(chatHref('a/b')).toBe('/c/a%2Fb')
  })

  test('die Übersicht ist ein eigener Pfad', () => {
    expect(workspacesHref()).toBe('/w')
    expect(PFAD_UEBERSICHT).toBe('/w')
    expect(PFAD_CHAT).toBe('/c')
    expect(PANEL_ID).toBe('workspaces')
  })

  test('lesen: /w, /c/<id>, Wurzel, Unbekanntes', () => {
    expect(parsePfad('/w')).toEqual({ ansicht: 'uebersicht' })
    expect(parsePfad('/w/')).toEqual({ ansicht: 'uebersicht' })
    expect(parsePfad('/c/ses_1')).toEqual({ ansicht: 'chat', sessionId: 'ses_1' })
    expect(parsePfad('/c/a%20b')).toEqual({ ansicht: 'chat', sessionId: 'a b' })
    // Ein Prefix ohne Kennung ist kein Chat, sondern die Wurzel — kein Grund für einen Fehler.
    expect(parsePfad('/c')).toEqual({ ansicht: 'chat', sessionId: null })
    expect(parsePfad('/c/')).toEqual({ ansicht: 'chat', sessionId: null })
    expect(parsePfad('/')).toEqual({ ansicht: 'chat', sessionId: null })
    // **Fremde Pfade sind nicht unsere.** Sie ergeben den Chat, nicht die Übersicht.
    expect(parsePfad('/anmeldung')).toEqual({ ansicht: 'chat', sessionId: null })
    expect(parsePfad('/universe/index.html')).toEqual({ ansicht: 'chat', sessionId: null })
  })

  test('ein kaputter Prozentwert verliert die Seite nicht', () => {
    expect(parsePfad('/c/%E0%A4%A')).toEqual({ ansicht: 'chat', sessionId: '%E0%A4%A' })
  })

  test('der Alias übersetzt die alte Abfrage in einen Pfad', () => {
    expect(aliasZiel('?s=ses_1')).toBe('/c/ses_1')
    expect(aliasZiel('?s=a%20b')).toBe('/c/a%20b')
    expect(aliasZiel('?w')).toBe('/w')
    expect(aliasZiel('?w=1')).toBe('/w')
    // Beides gleichzeitig: die Übersicht gewinnt — sie führt zu jeder Sitzung.
    expect(aliasZiel('?w&s=ses_1')).toBe('/w')
    // Nichts zu übersetzen.
    expect(aliasZiel('')).toBeUndefined()
    expect(aliasZiel('?')).toBeUndefined()
    expect(aliasZiel('?s=')).toBeUndefined()
    expect(aliasZiel('?weiter=%2F')).toBeUndefined()
  })

  test('die Adresse aus dem Zustand', () => {
    expect(hrefFor({ panelId: PANEL_ID, sessionId: 'ses_1' })).toBe('/w')
    expect(hrefFor({ panelId: null, sessionId: 'ses_1' })).toBe('/c/ses_1')
    expect(hrefFor({ panelId: null, sessionId: null })).toBe('/')
    expect(hrefFor({ panelId: null, sessionId: '' })).toBe('/')
    // Ein anderes Panel (etwa die Welt) bleibt beim Chat: es hat keine eigene Adresse.
    expect(hrefFor({ panelId: 'world', sessionId: 'ses_1' })).toBe('/c/ses_1')
  })

  test('nur der einfache linke Klick wird abgefangen', () => {
    expect(istEinfacherKlick({})).toBe(true)
    expect(istEinfacherKlick({ button: 0 })).toBe(true)
    expect(istEinfacherKlick({ ctrlKey: true })).toBe(false)
    expect(istEinfacherKlick({ metaKey: true })).toBe(false)
    expect(istEinfacherKlick({ shiftKey: true })).toBe(false)
    expect(istEinfacherKlick({ altKey: true })).toBe(false)
    expect(istEinfacherKlick({ button: 1 })).toBe(false)
    expect(istEinfacherKlick({ defaultPrevented: true })).toBe(false)
  })

  test('dasselbe Ziel wird nicht zweimal geschrieben', () => {
    expect(gleichesZiel('/c/ses_1', '/c/ses_1')).toBe(true)
    expect(gleichesZiel('/c/ses_1/', '/c/ses_1')).toBe(true)
    expect(gleichesZiel('/c/ses_1', '/c/ses_2')).toBe(false)
    expect(gleichesZiel('/w', '/')).toBe(false)
    expect(gleichesZiel('/', '/')).toBe(true)
  })
})
