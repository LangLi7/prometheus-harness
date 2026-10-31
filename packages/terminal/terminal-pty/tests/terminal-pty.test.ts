/**
 * Prüfungen für `@prometheus-harness/terminal-pty`.
 *
 * ## Was hier wirklich geprüft wird — und warum der Prozeßstart dazugehört
 *
 * Der Anlaß war ein **gemessener** Ausfall, kein Verdacht: `node-pty` startet
 * unter Bun keine Shell (16 Bytes, sofort tot), und der Betreiber sah „Prozess
 * beendet (-1073741502)". Eine Prüfung, die nur den Austausch der Methode
 * nachstellt, hätte diesen Ausfall **nicht** bemerkt — sie wäre grün geblieben,
 * während das Terminal schwarz bleibt.
 *
 * Deshalb steht neben den reinen Prüfungen ein echter Lauf: eine Shell, ein
 * Marker, ein erwarteter Ausgang 0. Genau der Lauf, der vorher scheiterte.
 *
 * ## Warum Attrappen statt eines zweiten Dienstes
 *
 * Der Austausch nimmt seine Erzeugerfunktion als Parameter. Damit läßt sich die
 * Verdrahtung ohne Prozeßstart prüfen, und der Prozeßstart bleibt **eine**
 * Prüfung statt jeder.
 *
 * @module @prometheus-harness/terminal-pty/tests
 */

import { describe, expect, test } from 'bun:test'
import type { SubprocessTerminalHandle, SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { bunPtyMoeglich, tauscheTerminalBackend, waehleBackend } from '../src/index.ts'
import { BunPtyTerminalHandle, kindUmgebung } from '../src/handle.ts'

/** Eine Vorgabe für alle Prüfläufe: dieselben Maße, dieselbe Frist. */
function vorgabe(argv: readonly string[], zusatz: Partial<SubprocessTerminalSpawnSpec> = {}): SubprocessTerminalSpawnSpec {
  return {
    argv,
    cwd: process.cwd(),
    rows: 24,
    cols: 80,
    terminalType: 'xterm-256color',
    graceMs: 2_000,
    ...zusatz,
  }
}

/**
 * Ein Subprozess-Dienst, der nichts tut außer sich zu merken.
 *
 * Er liefert statt eines Handles einen leeren Gegenstand: die Prüfungen hier
 * interessieren sich für **welche** Funktion antwortet, nicht für das Ergebnis.
 */
function attrappe(): { seam: { spawnTerminal: (spec: SubprocessTerminalSpawnSpec) => Promise<SubprocessTerminalHandle> }; aufrufe: SubprocessTerminalSpawnSpec[] } {
  const aufrufe: SubprocessTerminalSpawnSpec[] = []
  return {
    aufrufe,
    seam: {
      async spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle> {
        aufrufe.push(spec)
        return {} as SubprocessTerminalHandle
      },
    },
  }
}

describe('Die Laufzeitprüfung', () => {
  test('bunPtyMoeglich erkennt Bun.spawn', () => {
    // Die Prüfungen laufen unter Bun — dort MUSS die Fähigkeit da sein, sonst
    // wäre der ganze Austausch wirkungslos und niemand würde es merken.
    expect(bunPtyMoeglich()).toBe(true)
  })

  test('auf Windows übernimmt Buns PTY, unter Bun', () => {
    expect(waehleBackend('win32')).toBe('bun-pty')
  })

  test('auf Linux bleibt der Kern-Weg — dort ist node-pty nicht auffällig', () => {
    expect(waehleBackend('linux')).toBe('unveraendert')
    expect(waehleBackend('darwin')).toBe('unveraendert')
  })
})

describe('Der Austausch', () => {
  test('„unveraendert" faßt den Dienst nicht an', () => {
    const { seam } = attrappe()
    const vorher = seam.spawnTerminal
    const zurueck = tauscheTerminalBackend(seam, 'unveraendert')
    expect(seam.spawnTerminal).toBe(vorher)
    zurueck()
    expect(seam.spawnTerminal).toBe(vorher)
  })

  test('„bun-pty" lenkt auf den Erzeuger um — und der Aufräumer holt den Ursprung zurück', async () => {
    const { seam, aufrufe } = attrappe()
    const ursprung = seam.spawnTerminal
    const spec = vorgabe(['bash'])
    const gesehen: SubprocessTerminalSpawnSpec[] = []
    const marke = { pid: 4711 } as unknown as SubprocessTerminalHandle
    const zurueck = tauscheTerminalBackend(seam, 'bun-pty', (erhalten) => {
      gesehen.push(erhalten)
      return marke
    })

    const handle = await seam.spawnTerminal(spec)
    expect(handle).toBe(marke)
    expect(gesehen).toEqual([spec])
    // Der Ursprung wurde NICHT mehr gefragt.
    expect(aufrufe).toEqual([])

    zurueck()
    // Nach dem Aufräumen antwortet wieder der Kern — und wieder mit ihm selbst.
    await seam.spawnTerminal(spec)
    expect(aufrufe).toEqual([spec])
    expect(seam.spawnTerminal).not.toBe(ursprung)
  })

  test('ein zweites Aufräumen ist folgenlos', () => {
    const { seam } = attrappe()
    const zurueck = tauscheTerminalBackend(seam, 'bun-pty', () => ({} as SubprocessTerminalHandle))
    const nachTausch = seam.spawnTerminal
    zurueck()
    const nachZweitemRuf = seam.spawnTerminal
    zurueck()
    expect(seam.spawnTerminal).toBe(nachZweitemRuf)
    expect(nachZweitemRuf).not.toBe(nachTausch)
  })
})

describe('Die Umgebung des Kindes', () => {
  test('was nach Geheimnis aussieht, kommt nicht mit', () => {
    process.env['PMH_TEST_API_KEY'] = 'geheim'
    process.env['PMH_TEST_PASSWORD'] = 'geheim'
    try {
      const umgebung = kindUmgebung(undefined)
      expect(umgebung['PMH_TEST_API_KEY']).toBeUndefined()
      expect(umgebung['PMH_TEST_PASSWORD']).toBeUndefined()
    } finally {
      delete process.env['PMH_TEST_API_KEY']
      delete process.env['PMH_TEST_PASSWORD']
    }
  })

  test('DSH_-Namen des Hosts leckt nicht in die Shell', () => {
    process.env['DSH_TEST_INTERNAL'] = '1'
    try {
      expect(kindUmgebung(undefined)['DSH_TEST_INTERNAL']).toBeUndefined()
    } finally {
      delete process.env['DSH_TEST_INTERNAL']
    }
  })

  test('ein ausdrücklicher Eintrag gewinnt — auch bei anderer Schreibweise', () => {
    const vorher = process.env['PATH']
    try {
      process.env['PATH'] = 'C:\\vom-host'
      const umgebung = kindUmgebung({ Path: 'C:\\vom-aufrufer' })
      const namen = Object.keys(umgebung).filter((name) => name.toUpperCase() === 'PATH')
      // Genau EIN Eintrag: `Path` und `PATH` nebeneinander wären ein Würfelspiel.
      expect(namen).toEqual(['Path'])
      expect(umgebung['Path']).toBe('C:\\vom-aufrufer')
    } finally {
      if (vorher === undefined) delete process.env['PATH']
      else process.env['PATH'] = vorher
    }
  })
})

describe('Ein echtes Terminal (der Lauf, der vorher scheiterte)', () => {
  const marker = 'PMH-PTY-PROBE-OK'

  test.skipIf(!bunPtyMoeglich())('startet eine Shell, liefert ihre Ausgabe und endet mit 0', async () => {
    const programm = process.platform === 'win32' ? (process.env['ComSpec'] ?? 'cmd.exe') : '/bin/sh'
    const argumente = process.platform === 'win32' ? ['/c', `echo ${marker}`] : ['-c', `echo ${marker}`]
    const handle = new BunPtyTerminalHandle(vorgabe([programm, ...argumente]))
    const stuecke: string[] = []
    handle.output.on('data', (stueck: Buffer) => stuecke.push(stueck.toString('utf8')))

    const ausgang = await handle.done

    expect(ausgang.exitCode).toBe(0)
    expect(stuecke.join('')).toContain(marker)
    // Nach dem Ende ist Schreiben kein stiller Verlust, sondern ein Fehler.
    await expect(handle.write('echo spaet\n')).rejects.toThrow()
    await handle.terminate()
  })

  test.skipIf(!bunPtyMoeglich())('meldet Vordergrund und Tätigkeit ehrlich als unbekannt', async () => {
    const programm = process.platform === 'win32' ? (process.env['ComSpec'] ?? 'cmd.exe') : '/bin/sh'
    const argumente = process.platform === 'win32' ? ['/c', 'echo x'] : ['-c', 'echo x']
    const handle = new BunPtyTerminalHandle(vorgabe([programm, ...argumente]))
    expect(await handle.inspectForeground()).toBeUndefined()
    expect((await handle.inspectActivity()).state).toBe('unknown')
    await handle.done
    await handle.terminate()
  })

  test('ein argv ohne Programm wird abgelehnt', () => {
    const ohneProgramm = vorgabe([])
    expect(() => new BunPtyTerminalHandle(ohneProgramm)).toThrow()
    expect(() => new BunPtyTerminalHandle(vorgabe(['']))).toThrow()
  })
})
