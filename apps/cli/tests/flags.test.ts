/**
 * Tests für die Kommandozeile des Hosts.
 *
 * **Warum dieses Paket überhaupt Tests bekommt.** `parseHostFlags` ist eine
 * reine Funktion — und sie entscheidet, was der Host tut: welches Profil, welcher
 * Port, welche Overlays, **welches Harness-Home**. Ein Fehler hier ist kein
 * Absturz, sondern ein stiller Fehlstart.
 *
 * **Der Anlass für `--home` (gemessen, 13.10.2026).** Der Profilpfad des Hosts
 * ist der **Auflösungsanker** der Profil-Bündel. Mit einem fremden Home
 * (`DSH_HOME=C:\Users\Chang\.dsh`, dort eine ältere Installation des Core)
 * wurden **27 von 120** Profil-Einträgen als version-inkompatibel abgeschaltet —
 * darunter `llm`, `session`, `agent`, `webserver`, `web-startup`. Kein
 * Webserver, kein HTTP. Mit eigenem Home: **0** Abschaltungen, HTTP **200**.
 *
 * Die Tests unten sichern, dass `--home` **erkannt** und **weitergereicht** wird
 * — in beiden Schreibweisen und gegen die übrigen Flags abgegrenzt. Ob der Wert
 * wirkt, ist eine Frage des Laufs; ob er ankommt, ist eine Frage dieser Funktion.
 */

import { describe, expect, test } from 'bun:test'
import { parseHostFlags } from '../src/main.ts'

describe('Kommandozeile des Hosts', () => {
  test('ohne Argumente: kein Profil, kein Port, kein Home, kein Overlay', () => {
    const flags = parseHostFlags([])
    expect(flags).toEqual({ profile: undefined, port: undefined, patches: [], home: undefined, inner: [] })
  })

  test('erkennt --home mit Wert', () => {
    // Erfundener Name wie in den uebrigen Pruefungen: ein echter Benutzername in
    // einer Vorlage ist ein maschinengebundener Pfad, auch wenn er nur ein Argument
    // ist (gefunden von `scripts/machine-paths.mjs`).
    const flags = parseHostFlags(['web', '--home', 'C:\\Users\\erika\\.pmh'])
    expect(flags.home).toBe('C:\\Users\\erika\\.pmh')
    expect(flags.profile).toBe('web')
  })

  test('erkennt --home=Wert', () => {
    expect(parseHostFlags(['--home=/tmp/pmh']).home).toBe('/tmp/pmh')
  })

  test('--home verlangt einen Wert und bricht sonst sichtbar ab', () => {
    expect(() => parseHostFlags(['--home'])).toThrow('verlangt einen Wert')
    // Ein folgendes Flag ist kein Wert — sonst würde `--home --port 1` den Port
    // zum Home machen und der echte Port verschwinden.
    expect(() => parseHostFlags(['--home', '--port', '5199'])).toThrow('verlangt einen Wert')
  })

  test('setzt das Home nicht, wenn es nicht genannt ist', () => {
    // Wichtig: ein fehlendes `--home` darf **nicht** auf einen stillen Vorgabewert
    // fallen. Die Auflösung liegt beim Aufrufer, nicht in dieser Funktion.
    expect(parseHostFlags(['web', '--port', '5199']).home).toBeUndefined()
  })

  test('unterscheidet Home, Port, Profil und Overlays sauber', () => {
    const flags = parseHostFlags([
      'web',
      '--home', '/h',
      '--port', '5200',
      '--patches', 'a.yml,b.yml',
      '--profile', 'headless',
    ])
    expect(flags.home).toBe('/h')
    expect(flags.port).toBe('5200')
    expect(flags.profile).toBe('headless')
    expect(flags.patches).toEqual(['a.yml', 'b.yml'])
    expect(flags.inner).toEqual([])
  })

  test('das Unterkommando setzt das Profil, wenn --profile fehlt', () => {
    expect(parseHostFlags(['headless']).profile).toBe('headless')
  })

  test('--profile schlägt das Unterkommando', () => {
    expect(parseHostFlags(['web', '--profile', 'sdk']).profile).toBe('sdk')
  })

  test('-p ist die Kurzform von --profile', () => {
    expect(parseHostFlags(['-p', 'sdk']).profile).toBe('sdk')
  })

  test('ein nacktes Wort nach dem ersten gehört dem Baum, nicht dem Host', () => {
    const flags = parseHostFlags(['web', 'irgendwas'])
    expect(flags.profile).toBe('web')
    expect(flags.inner).toEqual(['irgendwas'])
  })

  test('unbekannte Flags gehen an den Baum', () => {
    expect(parseHostFlags(['web', '--verbose']).inner).toEqual(['--verbose'])
  })

  test('--port wird normalisiert an den Baum gereicht', () => {
    const flags = parseHostFlags(['web', '--port=5300'])
    expect(flags.port).toBe('5300')
    expect(flags.inner).toEqual([])
  })

  test('mehrere Overlay-Dateien in einem Argument und wiederholt', () => {
    const flags = parseHostFlags(['--patches', 'a.yml,b.yml', '--patches=c.yml'])
    expect(flags.patches).toEqual(['a.yml', 'b.yml', 'c.yml'])
  })

  test('leere Overlay-Einträge werden übergangen', () => {
    expect(parseHostFlags(['--patches', ' a.yml , ,b.yml ']).patches).toEqual(['a.yml', 'b.yml'])
  })

  test('--patches verlangt einen Wert', () => {
    expect(() => parseHostFlags(['--patches'])).toThrow('verlangt einen Wert')
  })
})
