/**
 * `app.ts` — das Obsidian-**Programm** finden und öffnen.
 *
 * Der Vault ist gelesen (das Panel zeigt ihn), aber das Programm selbst fehlte:
 * wer in Obsidian weiterschreiben will, mußte es von Hand starten. Dieses Modul
 * beantwortet zwei Fragen:
 *
 * | Frage | Antwort |
 * |---|---|
 * | *ist Obsidian installiert, und wo?* | {@link findeApp} |
 * | *wie öffne ich Vault oder Notiz darin?* | {@link oeffneApp} |
 *
 * **Warum die Reihenfolge der Suchorte so ist, wie sie ist.** Gemessen am
 * 21.10.2026 auf diesem Rechner: Obsidian liegt **nicht** unter
 * `%LOCALAPPDATA%\Obsidian`, sondern unter
 * `%LOCALAPPDATA%\Programs\Obsidian` (der per-Benutzer-Installer von Obsidian).
 * Ein Test nur am Standardort hätte „nicht installiert“ gemeldet, obwohl das
 * Programm da ist. Deshalb: erst die bekannten Pfade, dann die Registry als
 * Rückfall — und der Rückfall darf scheitern, ohne die Antwort zu verfälschen.
 *
 * **Warum das Protokoll und nicht das Programm mit Pfadargument.** `Obsidian.exe`
 * nimmt keinen Ordner als Argument entgegen; der registrierte Weg ist
 * `obsidian://open?path=…`. Das ist derselbe Weg, den ein Link im Browser nimmt,
 * und er funktioniert für den Vault **und** für eine einzelne Notiz.
 *
 * @module @prometheus-harness/world-obsidian-provider/app
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Woher der gefundene Pfad stammt — für die Diagnose im Panel. */
export type Fundweg = 'pfad' | 'registry' | 'befehl' | 'bundle'

/** Was das Panel über das Programm wissen muß. */
export interface ObsidianApp {
  /** Ist ein startbares Programm gefunden worden? */
  readonly verfuegbar: boolean
  /** Der gefundene Programmweg, sonst `null`. */
  readonly exe: string | null
  /** Über welchen Weg er gefunden wurde. */
  readonly weg: Fundweg | null
  /** Ein Satz für die Kopfzeile des Panels — nie leer. */
  readonly detail: string
}

/** Eine Umgebung, aus der sich Pfade ableiten lassen (prüfbar ohne echten Rechner). */
export type AppEnv = Readonly<Record<string, string | undefined>>

/**
 * Die bekannten Installationsorte, in der Reihenfolge, in der sie geprüft werden.
 *
 * @param env - die Umgebung (für `%LOCALAPPDATA%` und `%ProgramFiles%`)
 * @param plattform - `process.platform`
 * @returns absolute Programmwege
 */
export function kandidaten(env: AppEnv, plattform: string): string[] {
  if (plattform === 'win32') {
    const lokal = env['LOCALAPPDATA']
    const programme = env['ProgramFiles']
    const programme86 = env['ProgramFiles(x86)']
    return [
      lokal === undefined ? '' : join(lokal, 'Programs', 'Obsidian', 'Obsidian.exe'),
      lokal === undefined ? '' : join(lokal, 'Obsidian', 'Obsidian.exe'),
      programme === undefined ? '' : join(programme, 'Obsidian', 'Obsidian.exe'),
      programme86 === undefined ? '' : join(programme86, 'Obsidian', 'Obsidian.exe'),
    ].filter((pfad) => pfad !== '')
  }
  if (plattform === 'darwin') {
    return ['/Applications/Obsidian.app', join(homedir(), 'Applications', 'Obsidian.app')]
  }
  return [
    '/usr/bin/obsidian',
    '/usr/local/bin/obsidian',
    '/snap/bin/obsidian',
    '/var/lib/flatpak/exports/bin/md.obsidian.Obsidian',
    join(homedir(), '.local', 'share', 'flatpak', 'exports', 'bin', 'md.obsidian.Obsidian'),
    '/opt/Obsidian/obsidian',
  ]
}

/**
 * Liest den Programmweg aus dem registrierten `obsidian://`-Handler.
 *
 * **Warum `reg query` und kein Registry-Modul.** Es gibt unter Bun kein
 * eingebautes Registry-Lesen; ein `reg query` ist ein Aufruf, dessen Ausgabe
 * bekannt ist. Schlägt er fehl (kein Eintrag, kein `reg`), ist das **kein
 * Fehler**, sondern nur ein leerer Fund — die Pfadliste davor hat schon
 * gesucht.
 *
 * @param schluessel - der Registry-Schlüssel
 * @param pruefe - „existiert dieser Pfad?“
 * @returns der eingetragene Programmweg oder `undefined`
 */
function ausRegistry(schluessel: string, pruefe: (pfad: string) => boolean): string | undefined {
  let ausgabe: string
  try {
    const lauf = spawnSync('reg', ['query', schluessel, '/ve'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    if (lauf.status !== 0 || typeof lauf.stdout !== 'string') return undefined
    ausgabe = lauf.stdout
  } catch {
    return undefined
  }
  // Die Zeile sieht so aus:  `    (Standard)    REG_SZ    "C:\…\Obsidian.exe" "%1"`
  const treffer = /"([^"]+\.exe)"/i.exec(ausgabe)
  if (treffer === null) return undefined
  const pfad = treffer[1]
  return pfad !== undefined && pruefe(pfad) ? pfad : undefined
}

/**
 * Findet das Programm.
 *
 * @param env - die Umgebung
 * @param plattform - `process.platform`
 * @param pruefe - „existiert dieser Pfad?“ — im Test ersetzbar, damit ein
 *   künstlicher Baum ohne echte Installation prüfbar ist
 * @returns der Befund; `verfuegbar: false` ist eine gültige Antwort, kein Fehler
 */
export function findeApp(
  env: AppEnv = process.env,
  plattform: string = process.platform,
  pruefe: (pfad: string) => boolean = existsSync,
): ObsidianApp {
  for (const pfad of kandidaten(env, plattform)) {
    if (pruefe(pfad)) {
      return { verfuegbar: true, exe: pfad, weg: 'pfad', detail: `Gefunden: ${pfad}` }
    }
  }
  if (plattform === 'win32') {
    for (const schluessel of [
      'HKCU\\Software\\Classes\\obsidian\\shell\\open\\command',
      'HKLM\\SOFTWARE\\Classes\\obsidian\\shell\\open\\command',
    ]) {
      const pfad = ausRegistry(schluessel, pruefe)
      if (pfad !== undefined) {
        return { verfuegbar: true, exe: pfad, weg: 'registry', detail: `Gefunden über das obsidian://-Protokoll: ${pfad}` }
      }
    }
  }
  return {
    verfuegbar: false,
    exe: null,
    weg: null,
    detail: 'Obsidian ist auf diesem Rechner nicht gefunden worden (weder Pfad noch Protokoll).',
  }
}

/**
 * Baut die Adresse, die Obsidian öffnet.
 *
 * `path` ist laut Obsidian-Dokumentation **absolut** und darf auf einen Vault
 * **oder** auf eine Datei darin zeigen. Beides braucht deshalb nur einen
 * Parameter — kein Sonderweg für „ganzer Vault“.
 *
 * @param ziel - absoluter Pfad auf Vault oder Notiz
 * @returns die `obsidian://`-Adresse
 */
export function obsidianUrl(ziel: string): string {
  return `obsidian://open?path=${encodeURIComponent(ziel)}`
}

/** Was beim Öffnen herauskam. */
export interface OeffnenErgebnis {
  readonly ok: boolean
  /** Die abgeschickte Adresse — auch bei Mißerfolg, damit man sie von Hand probieren kann. */
  readonly url: string
  /** Eine Meldung, die im Panel stehen kann. */
  readonly detail: string
}

/**
 * Der Startbefehl für eine Adresse.
 *
 * **Warum unter Windows das Programm und nicht die Shell.** Die
 * Protokoll-Registrierung startet genau das: `Obsidian.exe "<adresse>"`. Der
 * eigene Weg über `cmd /c start` wäre ein zweiter Weg mit einer eigenen
 * Fehlerquelle — `cmd` expandiert `%…%`, und eine kodierte Adresse ist voller
 * `%`. Der direkte Start umgeht das ganz.
 *
 * Ohne gefundenes Programm bleibt nur die Shell (`cmd /c start`, `open`,
 * `xdg-open`) — dann entscheidet die Registrierung des Systems.
 *
 * @param url - die `obsidian://`-Adresse
 * @param exe - der gefundene Programmweg, oder `null`
 * @param plattform - `process.platform`
 * @returns Programm und Argumente
 */
export function startBefehl(
  url: string,
  exe: string | null,
  plattform: string = process.platform,
): readonly [string, string[]] {
  if (plattform === 'win32') {
    // Der leere Titel nach `start` ist Pflicht: sonst hält `start` die Adresse
    // für einen Fenstertitel und öffnet nichts.
    return exe === null ? ['cmd.exe', ['/c', 'start', '', url]] : [exe, [url]]
  }
  if (plattform === 'darwin') return ['open', [url]]
  return ['xdg-open', [url]]
}

/**
 * Öffnet einen absoluten Pfad in Obsidian.
 *
 * Scheitert der Start, wird **nicht** stillschweigend auf etwas anderes
 * ausgewichen: das Ergebnis sagt, was passiert ist, und nennt die Adresse.
 *
 * @param ziel - absoluter Pfad auf Vault oder Notiz
 * @param exe - der gefundene Programmweg, oder `null`
 * @param plattform - `process.platform`
 * @returns das Ergebnis des Startversuchs
 */
export async function oeffneApp(
  ziel: string,
  exe: string | null = null,
  plattform: string = process.platform,
): Promise<OeffnenErgebnis> {
  const url = obsidianUrl(ziel)
  const [befehl, argumente] = startBefehl(url, exe, plattform)
  try {
    /*
     * Kein Warten auf das Programm. Obsidian ist ein Einzelinstanz-Programm und
     * bleibt nach dem Öffnen laufen; `spawnSync` würde bis zum Timeout auf sein
     * Ende warten und dabei den Ereignisschleifen-Handle des Hosts verlieren —
     * unter Windows endet das mit "GetQueuedCompletionStatusEx: Handle ungültig".
     * `spawn` meldet über `spawn`/error, ob der Start geklappt hat, und `unref`
     * löst die Verbindung zum Host.
     */
    const kind = spawn(befehl, argumente, {
      windowsHide: true,
      stdio: 'ignore',
      detached: true,
    })
    await new Promise<void>((erfuellt, verworfen) => {
      kind.once('spawn', () => {
        erfuellt()
      })
      kind.once('error', (fehler: Error) => {
        verworfen(fehler)
      })
    })
    kind.unref()
    return { ok: true, url, detail: `Geöffnet: ${ziel}` }
  } catch (fehler) {
    return { ok: false, url, detail: `Start fehlgeschlagen: ${fehler instanceof Error ? fehler.message : String(fehler)}` }
  }
}
