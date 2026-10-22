/**
 * Prüfungen der Selbstinstallation — ohne Netz, ohne Paketmanager, ohne Lauf.
 *
 * Geprüft werden die Entscheidungen: welcher Weg gewählt wird, welche
 * Befehlszeile daraus folgt und an welchen Orten nach der CLI gesucht wird.
 * Eine echte Installation ist ein Netzereignis und gehört nicht in einen Test.
 */

import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pruefeSetup } from '../src/config.ts'
import {
  findeBefehl,
  installBefehl,
  kandidaten,
  setupStatus,
  waehleMethode,
} from '../src/setup.ts'

describe('waehleMethode', () => {
  test('uv geht vor pipx, pipx vor pip', () => {
    expect(waehleMethode(true, true, true)).toBe('uv')
    expect(waehleMethode(false, true, true)).toBe('pipx')
    expect(waehleMethode(false, false, true)).toBe('pip')
    expect(waehleMethode(false, false, false)).toBe('none')
  })
})

describe('installBefehl', () => {
  test('uv und pipx installieren das feste Paket', () => {
    expect(installBefehl('uv', null)).toEqual(['uv', 'tool', 'install', 'graphifyy'])
    expect(installBefehl('pipx', null)).toEqual(['pipx', 'install', 'graphifyy'])
  })

  test('pip nimmt den gefundenen Interpreter, py bekommt die Versionswahl', () => {
    expect(installBefehl('pip', '/usr/bin/python3')).toEqual([
      '/usr/bin/python3',
      '-m',
      'pip',
      'install',
      '--user',
      'graphifyy',
    ])
    expect(installBefehl('pip', 'C:\\Windows\\py.exe')).toEqual([
      'C:\\Windows\\py.exe',
      '-3',
      '-m',
      'pip',
      'install',
      '--user',
      'graphifyy',
    ])
  })

  test('ohne Python gibt es keinen pip-Befehl und für none gar keinen', () => {
    expect(installBefehl('pip', null)).toBeNull()
    expect(installBefehl('none', '/usr/bin/python3')).toBeNull()
  })
})

describe('kandidaten', () => {
  test('Windows sucht im uv-Werkzeugordner und im lokalen bin', () => {
    const liste = kandidaten('win32', 'C:\\Users\\test', 'C:\\Users\\test\\AppData\\Roaming')
    expect(liste[0]).toBe(
      join('C:\\Users\\test\\AppData\\Roaming', 'uv', 'tools', 'graphifyy', 'Scripts', 'graphify.exe'),
    )
    expect(liste).toContain(join('C:\\Users\\test', '.local', 'bin', 'graphify.exe'))
  })

  test('Linux sucht im lokalen bin und im uv-Werkzeugordner', () => {
    const liste = kandidaten('linux', '/home/test')
    expect(liste).toContain(join('/home/test', '.local', 'bin', 'graphify'))
    expect(liste).toContain(join('/home/test', '.local', 'share', 'uv', 'tools', 'graphifyy', 'bin', 'graphify'))
  })

  test('ohne APPDATA bleibt der Windows-Kandidat aus', () => {
    const liste = kandidaten('win32', 'C:\\Users\\test', '')
    expect(liste).toHaveLength(1)
  })
})

describe('findeBefehl', () => {
  test('ein absoluter Pfad zählt nur, wenn er existiert', () => {
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-graphify-setup-'))
    try {
      const datei = join(ordner, 'graphify')
      writeFileSync(datei, '')
      expect(findeBefehl(datei)).toBe(datei)
      expect(findeBefehl(join(ordner, 'fehlt'))).toBeNull()
      expect(existsSync(datei)).toBe(true)
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })

  test('ein leerer Name findet nichts', () => {
    expect(findeBefehl('   ')).toBeNull()
  })
})

describe('setupStatus', () => {
  test('die Auskunft übernimmt den Modus aus der Konfiguration', () => {
    const status = setupStatus({
      command: 'graphify',
      outDir: 'graphify-out',
      root: '.',
      setup: 'never',
    })
    expect(status.modus).toBe('never')
    expect(typeof status.platform).toBe('string')
    expect(Array.isArray(status.hinweise)).toBe(true)
  })
})

describe('pruefeSetup', () => {
  test('nimmt die drei Modi und lehnt alles andere ab', () => {
    for (const modus of ['auto', 'ask', 'never'] as const) {
      expect(pruefeSetup(modus)).toEqual({ ok: true, wert: modus })
    }
    for (const wert of ['', 'immer', true, 1, null]) {
      expect(pruefeSetup(wert).ok).toBe(false)
    }
  })
})
