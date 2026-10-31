/**
 * **`scripts/mitgaben.mjs` — geprüft ohne eine einzige Installation.**
 *
 * Der Punkt dieser Datei ist die **Entscheidung**, nicht der Download:
 *
 * 1. Wird für jede Plattform der richtige Weg gewählt — und nur einer, dessen
 *    Werkzeug da ist?
 * 2. Wird Obsidian **nicht** ohne Schalter installiert?
 * 3. Erkennt die Nachprüfung einen Fehlschlag, auch wenn der Paketmanager `exit 0`
 *    gemeldet hat?
 *
 * Alle drei sind an einer echten Maschine nicht herstellbar (dort gibt es genau
 * eine Plattform und genau einen Zustand). Deshalb ist die Außenwelt einspeisbar.
 */
import { describe, expect, test } from 'bun:test'
import {
  MITGABEN,
  MITGABEN_NAMEN,
  installiere,
  pruefe,
  pruefeAlle,
  rezepteFuer,
  waehleWege,
  wirdInstalliert,
  zeilen,
} from '../mitgaben.mjs'

/** Ein Rechner, auf dem es nur die genannten Programme gibt. */
function maschine(programme: readonly string[], plattform = 'win32') {
  const aufrufe: { programm: string, args: readonly string[] }[] = []
  return {
    aufrufe,
    umgebung: {
      welche: (programm: string) => (programme.includes(programm) ? `C:\\bin\\${programm}.exe` : null),
      laufe: async (programm: string, args: readonly string[]) => {
        aufrufe.push({ programm, args })
        if (programm === 'graphify') return { code: 0, text: 'graphify 0.9.92' }
        return { code: 0, text: '' }
      },
      plattform,
      findeObsidian: () => ({ verfuegbar: false, exe: null, detail: 'nicht gefunden' }),
    },
  }
}

describe('rezepteFuer', () => {
  test('Graphify hat auf jeder Plattform denselben Weg', () => {
    for (const plattform of ['win32', 'darwin', 'linux']) {
      const rezepte = rezepteFuer(MITGABEN.graphify, plattform)
      expect(rezepte[0]?.befehl).toBe('uv')
      expect(rezepte[0]?.args).toContain('graphifyy[mcp]')
    }
  })

  test('Obsidian nimmt je Plattform den dokumentierten Weg', () => {
    expect(rezepteFuer(MITGABEN.obsidian, 'win32')[0]?.args).toContain('Obsidian.Obsidian')
    expect(rezepteFuer(MITGABEN.obsidian, 'darwin')[0]?.args).toEqual(['install', '--cask', 'obsidian'])
    expect(rezepteFuer(MITGABEN.obsidian, 'linux')[0]?.args).toContain('md.obsidian.Obsidian')
  })

  test('die AppImage-Variante kommt nicht vor — sie registriert keinen Handler', () => {
    const alle = JSON.stringify(MITGABEN.obsidian.rezepte)
    expect(alle).not.toContain('AppImage')
  })
})

describe('waehleWege', () => {
  test('überspringt ein Rezept, dessen Werkzeug fehlt, und nennt es', () => {
    const { passend, fehlendeWerkzeuge } = waehleWege(MITGABEN.obsidian, 'win32', () => null)
    expect(passend).toEqual([])
    expect(fehlendeWerkzeuge).toEqual(['winget'])
  })

  test('nimmt das erste Rezept, dessen Werkzeug da ist', () => {
    const { passend } = waehleWege(MITGABEN.obsidian, 'win32', (p) => (p === 'winget' ? 'winget.exe' : null))
    expect(passend.map((rezept) => rezept.befehl)).toEqual(['winget'])
  })
})

describe('pruefe', () => {
  test('Graphify gilt nur als da, wenn das Programm antwortet', async () => {
    const { umgebung } = maschine(['graphify'])
    const befund = await pruefe('graphify', umgebung)
    expect(befund.da).toBe(true)
    expect(befund.fassung).toBe('graphify 0.9.92')
  })

  test('ein Programm, das nicht antwortet, gilt als DA — aber die Störung steht da', async () => {
    // **Der Fund aus der eigenen Messung.** Im PATH gefunden, aber der Start
    // scheitert (hier: EPERM durch die Sandbox). Würde das als „FEHLT" gelten,
    // überschriebe der Installer ein vorhandenes Werkzeug.
    const { umgebung } = maschine([])
    const kaputt = {
      ...umgebung,
      welche: () => 'C:\\bin\\graphify.exe',
      laufe: async () => ({ code: null, text: 'EPERM: operation not permitted' }),
    }
    const befund = await pruefe('graphify', kaputt)
    expect(befund.da).toBe(true)
    expect(befund.fassung).toContain('nicht ausführbar')
    expect(befund.fassung).toContain('EPERM')
  })

  test('was gar nicht im PATH liegt, ist nicht da — und nennt den Weg', async () => {
    const { umgebung } = maschine([])
    const befund = await pruefe('graphify', umgebung)
    expect(befund.da).toBe(false)
    expect(befund.fassung).toBe('nicht im PATH')
    expect(befund.wege).toContain('  uv tool install graphifyy[mcp]')
  })

  test('Obsidian wird über dieselbe Erkennung gesucht wie der Knopf im Panel', async () => {
    const { umgebung } = maschine([])
    const befund = await pruefe('obsidian', {
      ...umgebung,
      findeObsidian: () => ({ verfuegbar: true, exe: 'C:\\…\\Obsidian.exe', detail: 'Gefunden' }),
    })
    expect(befund.da).toBe(true)
    expect(befund.pfad).toBe('C:\\…\\Obsidian.exe')
  })
})

describe('wirdInstalliert', () => {
  test('Graphify ist die Vorgabe, Obsidian nicht', () => {
    const ohneWahl = { ohneMitgaben: false, mitObsidian: false, mitGraphen: true }
    expect(wirdInstalliert('graphify', ohneWahl)).toBe(true)
    expect(wirdInstalliert('obsidian', ohneWahl)).toBe(false)
  })

  test('--mit-obsidian nimmt die Entscheidung ab', () => {
    expect(wirdInstalliert('obsidian', { ohneMitgaben: false, mitObsidian: true, mitGraphen: true })).toBe(true)
  })

  test('--ohne-mitgaben schlägt alles', () => {
    const wahl = { ohneMitgaben: true, mitObsidian: true, mitGraphen: true }
    expect(wirdInstalliert('graphify', wahl)).toBe(false)
    expect(wirdInstalliert('obsidian', wahl)).toBe(false)
  })
})

describe('installiere', () => {
  test('ruft bei Linux erst die Flatpak-Quelle auf, dann die Installation', async () => {
    const { umgebung, aufrufe } = maschine(['flatpak'], 'linux')
    await installiere('obsidian', umgebung)
    expect(aufrufe.map((aufruf) => aufruf.args[0])).toEqual(['remote-add', 'install'])
  })

  test('meldet Fehlschlag, wenn die Nachprüfung nicht findet, was der Befehl behauptet', async () => {
    // Der Paketmanager meldet Erfolg — aber `pruefe` findet nichts. Genau dieser
    // Fall ist der Grund, warum der Exit-Code allein nicht reicht.
    const { umgebung } = maschine(['uv'])
    const ergebnis = await installiere('graphify', { ...umgebung, welche: (p) => (p === 'uv' ? 'uv.exe' : null) })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.danach.da).toBe(false)
    expect(ergebnis.text).toContain('exit 0')
  })

  test('ohne Werkzeug wird nichts gestartet, sondern der Grund genannt', async () => {
    const { umgebung, aufrufe } = maschine([], 'win32')
    const ergebnis = await installiere('obsidian', umgebung)
    expect(ergebnis.ok).toBe(false)
    expect(aufrufe).toEqual([])
    expect(ergebnis.text).toContain('winget')
  })
})

describe('zeilen', () => {
  test('nennt bei einer fehlenden Mitgabe den Weg', async () => {
    const { umgebung } = maschine([], 'win32')
    const befund = await pruefe('obsidian', umgebung)
    const text = zeilen(befund, { installiert: false }).join('\n')
    expect(text).toContain('FEHLT')
    expect(text).toContain('winget install --id Obsidian.Obsidian')
  })

  test('bei einer vorhandenen Mitgabe steht kein Weg da', async () => {
    const { umgebung } = maschine(['graphify'])
    const befund = await pruefe('graphify', umgebung)
    const text = zeilen(befund, { installiert: false }).join('\n')
    expect(text).toContain('da')
    expect(text).not.toContain('→')
  })
})

describe('pruefeAlle', () => {
  test('liefert beide Mitgaben in Anzeigereihenfolge', async () => {
    const { umgebung } = maschine([])
    const befunde = await pruefeAlle(umgebung)
    expect(befunde.map((befund) => befund.name)).toEqual([...MITGABEN_NAMEN])
  })
})
