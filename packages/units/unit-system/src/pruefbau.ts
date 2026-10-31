/**
 * Der Prüfbau — das Tor vor jedem Wechsel.
 *
 * ## Warum es ihn gibt
 *
 * `docs/design/harness-generationen.md` §4.1 nennt fünf Stufen
 * (`build · check · approve · apply · rollback`) und einen Satz, der die
 * Selbstverbesserung erst sicher macht: *„bauen und prüfen frei, umschalten nur
 * mit Freigabe."* Ohne den Prüfbau ist der Rückweg blind: eine ungeprüfte
 * Generation ist von einer geprüften nicht zu unterscheiden, und `rollback` rollt
 * auf etwas zurück, von dem niemand weiß, ob es trug.
 *
 * ## Warum die Ausgabe über **Dateien** läuft und nicht über Pipes
 *
 * Das ist die eine Entscheidung, die dieses Modul von der üblichen Fassung
 * unterscheidet — und sie ist gemessen, nicht geschmacklich:
 *
 * | Weg | Folge |
 * |---|---|
 * | `stdio: 'pipe'` | Ausgabe im Speicher; ein Schritt, der viel schreibt, kann den Puffer füllen und **blockieren**; in einer eingeschränkten Sandkastenumgebung scheitert das Starten ganz (`EPERM`) |
 * | `stdio: [..., fd, fd]` auf eine **Datei** | kein Pipe, kein Puffer, keine Blockade; die Ausgabe ist nach dem Lauf eine Datei und wird **gekürzt** gelesen |
 *
 * Nachgemessen am 18.10.2026: mit Datei-Deskriptoren startet das Kind, schreibt,
 * endet mit `exit=0`, und die Ausgabe liegt in der Datei.
 *
 * ## Was ein Schritt ist
 *
 * Ein Prozeß mit Exit-Code — die kleinste gemeinsame Form von
 * `bun run typecheck`, `bun test`, `go test ./...` und einem Schema-Abgleich,
 * und für jede Sprache dieselbe. Die Liste steht in der **Deklaration**, nicht im
 * Code: eine neue Prüfung soll der Agent deklarieren können, ohne den Manager zu
 * ändern.
 *
 * @module @prometheus-harness/unit-system/pruefbau
 */

import { spawn } from 'node:child_process'
import { closeSync, openSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'

import type { DeclaredCheck } from './declaration.ts'

/** Das Ergebnis eines einzelnen Prüfschritts. */
export interface SchrittErgebnis {
  readonly name: string
  readonly command: string
  readonly args: readonly string[]
  /** `0` ist Erfolg; `-1` heißt „nicht startbar". */
  readonly exitCode: number
  readonly dauerMs: number
  readonly ok: boolean
  /** Ob ein Fehlschlag diesen Schritt sperrt. */
  readonly required: boolean
  /** Die Ausgabe, gekürzt (Anfang und Ende). */
  readonly ausgabe: string
  /** `true`, wenn die Frist überschritten wurde. */
  readonly frist?: boolean
}

/** Das Ergebnis eines ganzen Prüfbaus. */
export interface Pruefbau {
  readonly at: string
  /** Grün heißt: es gibt Schritte, und jeder **verbindliche** ist durchgelaufen. */
  readonly ok: boolean
  readonly schritte: readonly SchrittErgebnis[]
  /** Ein Satz, warum nicht grün; leer bei grün. */
  readonly grund: string
}

/** Wie ein Schritt ausgeführt wird — austauschbar für Prüfungen. */
export type Schrittauffuehrung = (
  schritt: DeclaredCheck,
  cwd: string,
) => Promise<{ readonly exitCode: number; readonly ausgabe: string; readonly frist?: boolean }>

/** Wie viel Ausgabe ein Schritt behalten darf (Anfang und Ende je zur Hälfte). */
const AUSGABE_GRENZE = 4_000

function kuerze(text: string): string {
  if (text.length <= AUSGABE_GRENZE) return text
  const haelfte = Math.floor(AUSGABE_GRENZE / 2)
  return `${text.slice(0, haelfte)}\n…[${String(text.length - AUSGABE_GRENZE)} Zeichen ausgelassen]…\n${text.slice(-haelfte)}`
}

let zaehler = 0

/**
 * Führt einen Schritt über Datei-Deskriptoren aus.
 *
 * **Die Datei liegt im Temp-Verzeichnis des Systems** und wird nach dem Lesen
 * gelöscht. Sie liegt nicht im Projekt, weil ein Prüflauf keine Spuren im
 * Arbeitsbaum hinterlassen darf — `git status` muß nach einem Prüfbau unverändert
 * sein.
 */
export const STANDARD_AUSFUEHRUNG: Schrittauffuehrung = async (schritt, cwd) => {
  zaehler += 1
  const ordner = join(tmpdir(), 'pmh-pruefbau')
  mkdirSync(ordner, { recursive: true })
  const datei = join(ordner, `${String(process.pid)}-${String(zaehler)}.log`)
  const fd = openSync(datei, 'w')
  try {
    // **Relative Umgebungswerte werden gegen das Arbeitsverzeichnis des Schritts
    // aufgelöst.** Ein Werkzeug wie `go` verlangt für seinen Cache einen
    // absoluten Pfad; die Deklaration darf trotzdem relativ bleiben, sonst wäre
    // sie maschinengebunden.
    const umgebung: Record<string, string> = {}
    for (const [schluessel, wert] of Object.entries(process.env)) {
      if (wert !== undefined) umgebung[schluessel] = wert
    }
    for (const [schluessel, wert] of Object.entries(schritt.env ?? {})) {
      umgebung[schluessel] = isAbsolute(wert) ? wert : join(cwd, wert)
    }

    return await new Promise((fertig) => {
      let fristGesetzt = false
      let beendet = false
      const kind = spawn(schritt.command, [...schritt.args], {
        cwd,
        stdio: ['ignore', fd, fd],
        windowsHide: true,
        env: umgebung,
      })

      const fristgeber = setTimeout(() => {
        fristGesetzt = true
        // `kill` beendet unter Windows den direkten Kindprozeß, nicht den ganzen
        // Baum. Das ist eine benannte Grenze: ein Enkel kann weiterlaufen. Die
        // Alternative (`taskkill /T`) wäre ein zweiter Prozeßstart in einem
        // Prozeßstart — und ein Prüfwerkzeug, das selbst scheitern kann, prüft
        // nichts mehr.
        try {
          kind.kill()
        }
        catch {
          // Ein bereits beendetes Kind ist kein Fehler.
        }
      }, schritt.timeoutMs)

      const abschluss = (exitCode: number): void => {
        if (beendet) return
        beendet = true
        clearTimeout(fristgeber)
        let inhalt = ''
        try {
          inhalt = readFileSync(datei, 'utf8')
        }
        catch {
          inhalt = ''
        }
        fertig({ exitCode, ausgabe: kuerze(inhalt.trim()), ...(fristGesetzt ? { frist: true } : {}) })
      }

      kind.on('error', () => {
        // Nicht startbar (Programm fehlt, keine Rechte): `-1` und der Grund in
        // der Ausgabe. Ein fehlendes Programm ist ein Befund und kein Absturz.
        abschluss(-1)
      })
      kind.on('exit', (code) => {
        abschluss(code ?? -1)
      })
    })
  }
  finally {
    // **Immer schließen und löschen** — auch wenn das Kind nie startete.
    try {
      closeSync(fd)
    }
    catch {
      // schon geschlossen
    }
    try {
      rmSync(datei, { force: true })
    }
    catch {
      // Die Datei liegt im Temp-Ordner; ein Rest ist kein Grund zu scheitern.
    }
  }
}

/**
 * Führt den Prüfbau aus.
 *
 * **Die Reihenfolge ist bindend** und wird nicht umsortiert: was der Betreiber
 * zuerst prüfen läßt, läuft zuerst. Das ist kein Beiwerk — ein schneller
 * Typenlauf vor einem langsamen Testlauf gibt dem Menschen den Befund in
 * Sekunden statt in Minuten.
 *
 * **Ein unverbindlicher Schritt (`required: false`) sperrt nicht**, steht aber im
 * Ergebnis. Wer ihn liest, sieht den Unterschied zwischen „übersprungen" und
 * „durchgelaufen".
 */
export async function fuehrePruefbauAus(
  checks: readonly DeclaredCheck[],
  projectRoot: string,
  optionen: { readonly ausfuehren?: Schrittauffuehrung; readonly jetzt?: () => string } = {},
): Promise<Pruefbau> {
  const ausfuehren = optionen.ausfuehren ?? STANDARD_AUSFUEHRUNG
  const jetzt = optionen.jetzt ?? (() => new Date().toISOString())

  if (checks.length === 0) {
    // **Ein leerer Prüfbau ist nicht grün.** Dieselbe Lehre wie bei
    // `/api/ready` und Befund B20: „nichts geprüft" darf nicht wie „alles gut"
    // aussehen.
    return {
      at: jetzt(),
      ok: false,
      schritte: [],
      grund: 'keine Prüfschritte deklariert — ein leerer Prüfbau prüft nichts',
    }
  }

  const schritte: SchrittErgebnis[] = []
  for (const check of checks) {
    const beginn = Date.now()
    let exitCode = -1
    let ausgabe = ''
    let frist: boolean | undefined
    try {
      // Das Arbeitsverzeichnis ist **relativ** und wird hier aufgelöst; die
      // Deklaration kennt keinen absoluten Pfad (Befund E4: maschinengebundene
      // Pfade sind der Grund, warum eine Deklaration nur auf einem Rechner gilt).
      const arbeitsordner = check.cwd === undefined ? projectRoot : join(projectRoot, check.cwd)
      const ergebnis = await ausfuehren(check, arbeitsordner)
      exitCode = ergebnis.exitCode
      ausgabe = ergebnis.ausgabe
      frist = ergebnis.frist
    }
    catch (fehler) {
      ausgabe = `nicht startbar: ${(fehler as Error).message}`
    }
    schritte.push({
      name: check.name,
      command: check.command,
      args: [...check.args],
      exitCode,
      dauerMs: Date.now() - beginn,
      ok: exitCode === 0 && frist !== true,
      required: check.required,
      ausgabe,
      ...(frist === true ? { frist: true } : {}),
    })
  }

  const gescheitert = schritte.filter((schritt) => schritt.required && !schritt.ok)
  const ok = gescheitert.length === 0
  return {
    at: jetzt(),
    ok,
    schritte,
    grund: ok
      ? ''
      : `gescheitert: ${gescheitert.map((schritt) => `${schritt.name} (Exit ${String(schritt.exitCode)}${schritt.frist === true ? ', Frist' : ''})`).join(', ')}`,
  }
}
