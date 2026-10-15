/**
 * Prüfungen für die Folgen-Tabelle des Installers.
 *
 * **Warum diese Datei existiert.** Die Weisung des Betreibers lautet: plug and
 * play, wenig Fehlersuche. Ein Werkzeug, das nur als `FEHLT` erscheint, ohne zu
 * sagen **was es kostet**, erzeugt genau diese Fehlersuche. Diese Prüfungen halten
 * fest, daß zu **jedem** geprüften Werkzeug eine Folge genannt ist und daß die
 * Einstufung stimmt: WSL2 und Docker sind **Komfort**, nicht Bedingung.
 */

import { describe, expect, test } from 'bun:test'

import { BENOETIGTE_WERKZEUGE, WERKZEUG_FOLGEN, werkzeugFolge } from '../install-teile.mjs'

describe('Jedes gepruefte Werkzeug nennt seine Folge', () => {
  test('fuer jeden Eintrag der Pruefliste gibt es eine Folge', () => {
    for (const name of BENOETIGTE_WERKZEUGE) {
      const eintrag = werkzeugFolge(name)
      expect({ name, folge: eintrag.folge.length > 10 }).toEqual({ name, folge: true })
      expect({ name, bekannt: WERKZEUG_FOLGEN[name] !== undefined }).toEqual({ name, bekannt: true })
    }
  })

  test('ein unbekanntes Werkzeug wird BENANNT, nicht still durchgelassen', () => {
    // Eine Pruefung ohne Eintrag ist ein Fehler in der Tabelle. Wer sie still
    // durchlaufen laesst, baut die stille Ausnahme wieder ein.
    const unbekannt = werkzeugFolge('gibtesnicht')
    expect(unbekannt.folge).toContain('unbekannt')
    expect(unbekannt.folge).toContain('gibtesnicht')
  })
})

describe('Die Einstufung folgt der Weisung: Komfort ist keine Bedingung', () => {
  test('ohne Bun und ohne git laeuft nichts', () => {
    expect(werkzeugFolge('bun').pflicht).toBe(true)
    expect(werkzeugFolge('git').pflicht).toBe(true)
  })

  test('WSL2 und Docker sind NICHT Pflicht -- sie sind Komfort fuer Windows', () => {
    // Wortlaut des Betreibers: WSL und Docker sind "nicht unbedingt noetig", sie
    // ermoeglichen nur die einfache Handhabung. Wer sie zur Pflicht macht,
    // blockiert ein lauffaehiges System.
    expect(werkzeugFolge('wsl2').pflicht).toBe(false)
    expect(werkzeugFolge('docker').pflicht).toBe(false)
    expect(werkzeugFolge('wsl2').folge).toContain('Komfort')
  })

  test('die Folge nennt den Preis, nicht nur das Fehlen', () => {
    expect(werkzeugFolge('docker').folge).toContain('Datenbank')
    expect(werkzeugFolge('go').folge).toContain('übersprungen')
    expect(werkzeugFolge('wsl2').folge).toContain('Sandbox')
  })

  test('zu jedem Eintrag gibt es eine Quelle oder einen Befehl', () => {
    for (const [name, eintrag] of Object.entries(WERKZEUG_FOLGEN)) {
      expect({ name, quelle: (eintrag.quelle ?? '').length > 0 }).toEqual({ name, quelle: true })
    }
  })
})
