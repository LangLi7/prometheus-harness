/**
 * Die ersten Prüfungen für `install.mjs` — und der Beleg für Go und WSL2.
 *
 * ## Warum diese Datei existiert
 *
 * Gemessen am 14.10.2026 wurde `install.mjs` von **keiner** Prüfdatei genannt: die
 * `FEHLT`-Zeilen für **Go** und **WSL2** waren nur **gelesen**, nie **ausgeführt**.
 * Einen Rechner ohne Go gibt es hier nicht — also mußten die Abhängigkeiten
 * **eingespeist** werden (`pruefeWerkzeuge(deps)`), damit ein Test jeden Fall
 * herstellen kann.
 *
 * ## Was hier NICHT geprüft wird
 *
 * Daß die Vorgaben das wirkliche Verhalten sind. Das ist eine Eigenschaft des
 * Produktivcodes, nicht dieser Prüfungen — hier wird nur belegt, was passiert,
 * **wenn** ein Werkzeug fehlt.
 */

import { describe, expect, test } from 'bun:test'

import { pruefeWerkzeuge } from '../install.mjs'

/** Attrappen: alles vorhanden, keine Ausgabe, Linux. */
function allesDa(plattform = 'linux') {
  return {
    laeuft: async () => true,
    laufe: async () => ({ code: 0, text: '' }),
    plattform,
  }
}

describe('Go fehlt — die Luecke aus Runde 48', () => {
  test('die Zeile nennt die Folge, nicht nur das Fehlen', async () => {
    const { ergebnisse } = await pruefeWerkzeuge({
      laeuft: async (programm) => !String(programm).startsWith('go'),
      laufe: async () => ({ code: 0, text: '' }),
      plattform: 'linux',
    })
    const go = ergebnisse.find((e) => e.name === 'go')
    // Die Zeile EXISTIERT ueberhaupt -- vor dem 14.10.2026 gab es sie nicht.
    expect(go).toBeDefined()
    expect(go.ok).toBe(false)
    expect(go.hinweis).toContain('go.dev')
    // Und sie sagt den PREIS: ohne Go werden die Go-Dienste uebersprungen.
    expect(go.hinweis).toContain('übersprungen')
  })

  test('ist Go da, gibt es keinen Hinweis', async () => {
    const { ergebnisse } = await pruefeWerkzeuge(allesDa())
    const go = ergebnisse.find((e) => e.name === 'go')
    expect(go.ok).toBe(true)
    expect(go.hinweis).toBeUndefined()
  })
})

describe('WSL2 fehlt — und zwar VOR Docker', () => {
  test('auf Windows nennt die Zeile den Befehl und den Neustart', async () => {
    const { ergebnisse } = await pruefeWerkzeuge({
      laeuft: async () => true,
      // Leere Ausgabe = kein WSL. `wslLage('')` ist genau der Fall "nichts da".
      laufe: async () => ({ code: 1, text: '' }),
      plattform: 'win32',
    })
    const wsl = ergebnisse.find((e) => e.name === 'wsl2')
    expect(wsl).toBeDefined()
    expect(wsl.ok).toBe(false)
    expect(wsl.hinweis).toContain('wsl --install')
    // Die Zurueckhaltung: Administrator und Neustart werden GESAGT, nicht getan.
    expect(wsl.hinweis).toContain('Administrator')
    expect(wsl.hinweis).toContain('Neustart')
  })

  test('auf Linux gibt es die Zeile NICHT', async () => {
    // WSL2 ist ein Windows-Thema. Eine Zeile auf Linux waere Rauschen.
    const { ergebnisse } = await pruefeWerkzeuge(allesDa('linux'))
    expect(ergebnisse.find((e) => e.name === 'wsl2')).toBeUndefined()
  })

  test('die Reihenfolge stimmt: wsl2 steht vor docker', async () => {
    const { ergebnisse } = await pruefeWerkzeuge({
      laeuft: async () => false,
      laufe: async () => ({ code: 1, text: '' }),
      plattform: 'win32',
    })
    const namen = ergebnisse.map((e) => e.name)
    expect(namen.indexOf('wsl2')).toBeLessThan(namen.indexOf('docker'))
  })
})

describe('Alles da', () => {
  test('keine Zeile traegt einen Hinweis', async () => {
    const { ergebnisse, dockerDa, dockerLaeuft } = await pruefeWerkzeuge(allesDa())
    for (const e of ergebnisse) {
      expect({ name: e.name, ok: e.ok }).toEqual({ name: e.name, ok: true })
      expect({ name: e.name, hinweis: e.hinweis }).toEqual({ name: e.name, hinweis: undefined })
    }
    expect(dockerDa).toBe(true)
    expect(dockerLaeuft).toBe(true)
  })

  test('ohne Docker entfaellt die Dienst-Zeile', async () => {
    // **Kein stiller Durchlauf.** Ist Docker nicht da, gibt es auch keine
    // Dienst-Zeile -- sonst behauptete die Liste eine Pruefung, die nie lief.
    const { ergebnisse, dockerDa, dockerLaeuft } = await pruefeWerkzeuge({
      laeuft: async (programm) => !String(programm).startsWith('docker'),
      laufe: async () => ({ code: 1, text: '' }),
      plattform: 'linux',
    })
    expect(dockerDa).toBe(false)
    expect(dockerLaeuft).toBe(false)
    expect(ergebnisse.find((e) => e.name === 'docker-Dienst')).toBeUndefined()
  })
})
