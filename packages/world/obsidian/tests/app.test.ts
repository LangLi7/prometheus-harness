/**
 * **Das Programm finden und öffnen — geprüft ohne echte Installation.**
 *
 * Zwei Dinge können hier falsch sein, und beide sind sichtbar:
 *
 * 1. **Der Suchort.** Auf diesem Rechner liegt Obsidian unter
 *    `%LOCALAPPDATA%\Programs\Obsidian` — nicht am Standardort. Der Test baut
 *    genau diesen Baum nach und prüft, daß er gefunden wird.
 * 2. **Die Adresse.** Sie muß absolut, vollständig kodiert und für Vault **und**
 *    Notiz dieselbe Form haben.
 *
 * Gestartet wird nichts: `oeffneApp` bekommt im Test keine Plattform, auf der es
 * ein echtes Programm gäbe — geprüft wird nur die gebaute Adresse.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findeApp, kandidaten, obsidianUrl, startBefehl } from '../src/app.ts'

const baeume: string[] = []

/**
 * Baut einen künstlichen Installationsbaum.
 *
 * @param teile - Pfadstücke unter der Wurzel
 * @returns Wurzel und der volle Programmweg
 */
function baum(teile: readonly string[]): { wurzel: string; exe: string } {
  const wurzel = mkdtempSync(join(tmpdir(), 'pmh-obsidian-app-'))
  baeume.push(wurzel)
  const ordner = join(wurzel, ...teile.slice(0, -1))
  mkdirSync(ordner, { recursive: true })
  const exe = join(wurzel, ...teile)
  writeFileSync(exe, '', 'utf8')
  return { wurzel, exe }
}

afterAll(() => {
  for (const wurzel of baeume) rmSync(wurzel, { recursive: true, force: true })
})

describe('kandidaten', () => {
  test('Windows: der gemessene Ort steht vor dem Standardort', () => {
    const liste = kandidaten({ LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' }, 'win32')
    expect(liste[0]).toBe(join('C:\\Users\\x\\AppData\\Local', 'Programs', 'Obsidian', 'Obsidian.exe'))
    expect(liste[1]).toBe(join('C:\\Users\\x\\AppData\\Local', 'Obsidian', 'Obsidian.exe'))
  })

  test('Windows ohne Umgebung liefert keine leeren Pfade', () => {
    expect(kandidaten({}, 'win32')).toEqual([])
  })

  test('macOS und Linux nennen ihre Orte', () => {
    expect(kandidaten({}, 'darwin').some((pfad) => pfad.endsWith('Obsidian.app'))).toBe(true)
    expect(kandidaten({}, 'linux').some((pfad) => pfad.endsWith('obsidian'))).toBe(true)
  })
})

describe('findeApp', () => {
  test('findet den per-Benutzer-Installer unter Programs', () => {
    const { wurzel, exe } = baum(['Programs', 'Obsidian', 'Obsidian.exe'])
    const befund = findeApp({ LOCALAPPDATA: wurzel }, 'win32', (pfad) => pfad === exe)
    expect(befund.verfuegbar).toBe(true)
    expect(befund.exe).toBe(exe)
    expect(befund.weg).toBe('pfad')
    expect(befund.detail).toContain(exe)
  })

  test('meldet fehlend, ohne zu werfen', () => {
    const befund = findeApp({ LOCALAPPDATA: join(tmpdir(), 'gibt-es-nicht') }, 'win32', () => false)
    expect(befund).toEqual({
      verfuegbar: false,
      exe: null,
      weg: null,
      detail: 'Obsidian ist auf diesem Rechner nicht gefunden worden (weder Pfad noch Protokoll).',
    })
  })
})

describe('obsidianUrl', () => {
  test('kodiert Leerzeichen und Backslashes eines Vault-Pfads', () => {
    expect(obsidianUrl('D:\\Windows\\Dokumente\\Obsidian Vault')).toBe(
      'obsidian://open?path=D%3A%5CWindows%5CDokumente%5CObsidian%20Vault',
    )
  })

  test('eine Notiz bekommt dieselbe Form — kein Sonderweg', () => {
    expect(obsidianUrl('D:\\Vault\\Neuer Link.md')).toBe('obsidian://open?path=D%3A%5CVault%5CNeuer%20Link.md')
  })
})

describe('startBefehl', () => {
  const url = obsidianUrl('D:\\Vault')
  const exe = 'C:\\Users\\x\\AppData\\Local\\Programs\\Obsidian\\Obsidian.exe'

  test('Windows startet das gefundene Programm direkt mit der Adresse', () => {
    // Kein `cmd /c start`: `cmd` würde `%…%` in der kodierten Adresse expandieren.
    expect(startBefehl(url, exe, 'win32')).toEqual([exe, [url]])
  })

  test('Windows ohne Programm fällt auf den Shell-Handler zurück', () => {
    expect(startBefehl(url, null, 'win32')).toEqual(['cmd.exe', ['/c', 'start', '', url]])
  })

  test('macOS und Linux nehmen ihren Öffner', () => {
    expect(startBefehl(url, null, 'darwin')).toEqual(['open', [url]])
    expect(startBefehl(url, null, 'linux')).toEqual(['xdg-open', [url]])
  })
})
