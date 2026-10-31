/**
 * Der Terminal-Prozess über **Buns eigenes PTY** — der Ersatz für `node-pty`,
 * wenn der Host unter Bun läuft.
 *
 * ## Der Befund, der dieses Modul erzwingt (gemessen am 18.10.2026)
 *
 * Der Betreiber meldete zum Terminal der Seitenleiste: „Prozess beendet
 * (-1073741502)" — **für jede** Shell (`cmd.exe`, `powershell`, `bash`). Die
 * Ursache liegt nicht beim Sandboxing: der Terminal-Weg des Controllers
 * (`dsh-api-terminal-controller` → `subprocess.spawnTerminal`) ist **gar nicht**
 * eingezäunt, er ruft den Subprozess-Dienst direkt.
 *
 * Sie liegt beim **Addon**. `@deepseek-ai/dsh-subprocess-local` startet Terminals
 * über `require("node-pty")`, und das Addon ist unter **Bun** auf Windows
 * funktionsunfähig. Dieselbe Sonde, dieselbe Shell, dieselbe Maschine:
 *
 * | Laufzeit | `cmd.exe` über `node-pty` |
 * |---|---|
 * | Node v24.19.0 | Exit **0**, Ausgabe `HALLO-CMD` |
 * | Bun 1.4.0 | **16 Bytes** ConPTY-Initialisierung, dann tot (`0xC0000142`/`0xC000013A`) |
 *
 * Das ist im Projekt schon notiert (`docs/protokoll/aufsicht/werkzeuge/pty-probe.mjs`:
 * „node-pty lädt und startet unter Bun, liefert aber keine Daten (16 Bytes, kein
 * Marker)") — nur war daraus bisher kein Ersatz gebaut worden.
 *
 * ## Warum Bun und nicht der Rust-PTY
 *
 * `native/pty` (Rust) ist laut `MAPPING.md` der geplante Nachfolger, benutzt aber
 * **Pipes statt eines echten PTY** (`unit.json`: „Kein isatty, keine
 * Zeilenbearbeitung, keine Job-Control-Signale"). Für ein *interaktives* Terminal
 * ist das zu wenig. Buns `Bun.spawn({ terminal })` liefert dagegen ein **echtes**
 * ConPTY und ist auf dieser Maschine gemessen grün — auch für `wsl.exe -e bash`
 * und Git-Bash (`exitCode 0`, echte Ausgabe).
 *
 * ## Die Grenze, ehrlich benannt
 *
 * Zwei Vertragsteile kann dieses Backend **nicht** liefern, und es täuscht sie
 * nicht vor:
 *
 * * **`inspectForeground()` → `undefined`.** Bun gibt die Prozessgruppe des
 *   Vordergrunds nicht heraus; das Kind ist auf Windows ohnehin nicht über
 *   Prozessgruppen, sondern über den Konsolenbaum organisiert.
 * * **`inspectActivity()` → `unknown`.** Diese Auskunft verlangt „positive
 *   Prompt-Evidenz"; ohne Vordergrundgruppe ist sie nicht zu belegen. `unknown`
 *   ist die ehrliche Antwort — sie schaltet nur die Leerlauf-Erkennung ab, nicht
 *   das Terminal.
 *
 * @module @prometheus-harness/terminal-pty/handle
 */

import { Buffer } from 'node:buffer'
import { PassThrough } from 'node:stream'
import { setTimeout as sleepMs } from 'node:timers/promises'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import type {
  SubprocessOutcome,
  SubprocessTerminalActivity,
  SubprocessTerminalForeground,
  SubprocessTerminalHandle,
  SubprocessTerminalSignal,
  SubprocessTerminalSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'

/** Was dieses Modul von einem Bun-Prozess braucht — mehr nicht. */
interface BunProzess {
  readonly pid: number
  readonly exited: Promise<number>
  readonly terminal: BunTerminal | undefined
  kill(signal?: number | string): void
}

/** Was dieses Modul von Buns Terminal braucht. */
interface BunTerminal {
  write(data: string | Uint8Array): number
  resize(cols: number, rows: number): void
  close(): void
}

/** Die Minimaleingabe, aus der ein Handle gebaut wird (der Seam-Vertrag plus Tests). */
export type BunPtySpawnSpec = SubprocessTerminalSpawnSpec

/**
 * Baut die Umgebung des Kindes.
 *
 * **Warum dieselbe Bereinigung wie der Subprozess-Dienst.** Der Dienst entfernt
 * aus der Umgebung des Hosts alles, was nach Geheimnis aussieht, und **alle**
 * `DSH_*`-Namen (`scrubbedParentEnv`). Würde das Terminal die Umgebung
 * unverändert durchreichen, wäre jeder Zugangsschlüssel des Hosts in jeder Shell
 * sichtbar — und die beiden Wege würden sich unterschiedlich verhalten.
 *
 * **Warum der Aufrufer-Eintrag gewinnt und zwar ohne Rücksicht auf Groß- und
 * Kleinschreibung.** Windows-Umgebungsnamen sind nicht case-sensitiv; ohne
 * Vereinheitlichung stünden `Path` und `PATH` nebeneinander im Block, und welcher
 * gilt, entschiede die Laune des Laders. Ein vorhandener Eintrag wird deshalb
 * **entfernt**, bevor der neue hinzukommt.
 *
 * @param zusatz - ausdrückliche Einträge des Aufrufers (etwa `DSH_SESSION_ID`)
 * @returns die fertige Umgebung für `Bun.spawn`
 */
export function kindUmgebung(zusatz: Readonly<Record<string, string>> | undefined): Record<string, string> {
  const umgebung: Record<string, string> = { ...scrubbedParentEnv() }
  if (zusatz === undefined) return umgebung
  for (const [schluessel, wert] of Object.entries(zusatz)) {
    const gross = schluessel.toUpperCase()
    for (const vorhanden of Object.keys(umgebung)) {
      if (vorhanden.toUpperCase() === gross) delete umgebung[vorhanden]
    }
    umgebung[schluessel] = wert
  }
  return umgebung
}

/**
 * Ein laufendes Terminal: Buns PTY als `SubprocessTerminalHandle`.
 *
 * **Warum die Klasse `implements` benutzt und nicht nur „passt schon".** Der
 * Vertrag ist die Schnittstelle zwischen Controller und Subprozess-Dienst;
 * `implements` macht aus einem vergessenen Glied einen Übersetzungsfehler statt
 * eines Fehlers zur Laufzeit — und dieser Vertrag wird vom Werkzeug
 * `terminal` **und** von der Seitenleiste benutzt.
 */
export class BunPtyTerminalHandle implements SubprocessTerminalHandle {
  /** Die Prozeßkennung der obersten Shell. */
  readonly pid: number

  /** Die Ausgabe des PTY in Reihenfolge; endet mit dem Prozeß. */
  readonly output = new PassThrough()

  /** Wird erfüllt, wenn die oberste Shell endet. */
  readonly done: Promise<SubprocessOutcome>

  private readonly proc: BunProzess
  private readonly terminal: BunTerminal
  private readonly ausgang = Promise.withResolvers<SubprocessOutcome>()
  private readonly graceMs: number
  private beendet = false
  private abraeumen: Promise<void> | undefined
  private revision = 0

  /**
   * Startet die Shell im PTY.
   *
   * @param spec - Programm, Verzeichnis, Umgebung, Maße und Frist
   * @throws wenn `argv` kein Programm nennt, das Abbruchsignal schon steht, oder
   *   Bun kein Terminal liefert
   */
  constructor(spec: BunPtySpawnSpec) {
    const programm = spec.argv[0]
    if (programm === undefined || programm.length === 0) {
      throw new Error('terminal-pty: argv muss ein Programm nennen')
    }
    spec.signal?.throwIfAborted()
    const argumente = spec.argv.slice(1)
    const proc = Bun.spawn({
      cmd: [programm, ...argumente],
      cwd: spec.cwd,
      env: kindUmgebung(spec.env),
      terminal: {
        cols: spec.cols,
        rows: spec.rows,
        name: spec.terminalType,
        data: (_terminal, stueck) => {
          if (this.beendet) return
          this.revision++
          this.output.write(Buffer.from(stueck))
        },
      },
    }) as unknown as BunProzess
    const terminal = proc.terminal
    if (terminal === undefined) {
      // Ohne Terminal ist kein interaktives Arbeiten möglich. Ein leerer Handle
      // wäre schlimmer als ein Fehler: die Oberfläche zeigte ein Terminal, in das
      // niemand schreiben kann.
      try {
        proc.kill('SIGKILL')
      } catch (_keinProzessMehr) {
        // Der Prozeß ist schon weg — das ist der gewünschte Endzustand.
      }
      throw new Error('terminal-pty: Bun hat kein PTY geliefert')
    }
    this.proc = proc
    this.terminal = terminal
    this.pid = proc.pid
    this.graceMs = spec.graceMs
    this.done = this.ausgang.promise
    void proc.exited.then(
      code => { this.schliesse({ exitCode: code, signal: null }) },
      () => { this.schliesse({ exitCode: null, signal: null }) },
    )
    if (spec.signal !== undefined) {
      spec.signal.addEventListener('abort', () => { void this.terminate().catch(() => {}) }, { once: true })
    }
  }

  // Buns `Terminal.write` schreibt synchron in den PTY-Puffer; der Seam verlangt
  // ein Versprechen, damit ein ferner Anbieter dasselbe kann.
  // oxlint-disable-next-line typescript/require-await -- Vertrag des Seams.
  async write(data: string): Promise<void> {
    if (this.beendet) throw new Error('terminal-pty: der Terminalprozeß ist beendet')
    this.revision++
    this.terminal.write(data)
  }

  // Siehe `write`: `resize` ist synchron, der Vertrag ist asynchron.
  // oxlint-disable-next-line typescript/require-await -- Vertrag des Seams.
  async resize(cols: number, rows: number): Promise<void> {
    if (this.beendet) throw new Error('terminal-pty: der Terminalprozeß ist beendet')
    this.terminal.resize(cols, rows)
  }

  /**
   * Die Vordergrund-Prozessgruppe — die Bun nicht herausgibt.
   *
   * @returns immer `undefined`; siehe Dateikopf, „Die Grenze".
   */
  // oxlint-disable-next-line typescript/require-await -- Vertrag des Seams.
  async inspectForeground(): Promise<SubprocessTerminalForeground | undefined> {
    return undefined
  }

  /**
   * Die Tätigkeit der Shell — ohne Vordergrundgruppe nicht belegbar.
   *
   * @returns `unknown` mit dem Revisionszähler der bisherigen Ein-/Ausgaben.
   */
  // oxlint-disable-next-line typescript/require-await -- Vertrag des Seams.
  async inspectActivity(): Promise<SubprocessTerminalActivity> {
    return { state: 'unknown', revision: this.revision }
  }

  /**
   * Schickt ein Signal an die Shell.
   *
   * **Warum `SIGINT` als Tastendruck geht.** Windows kennt keine
   * Prozeßgruppen-Signale; `\x03` in den PTY zu schreiben ist der Weg, auf dem
   * conhost ein `CTRL_C_EVENT` an die angebundenen Prozesse austeilt — genau so
   * macht es der `node-pty`-Weg des Kerns ebenfalls.
   *
   * @param signal - das zugelassene Signal
   * @returns die Prozeßkennung, die es bekam
   */
  async signalForeground(signal: SubprocessTerminalSignal): Promise<number> {
    if (signal === 'SIGINT') {
      this.revision++
      this.terminal.write('\x03')
      return this.pid
    }
    if (signal === 'SIGTSTP' || signal === 'SIGHUP') {
      throw new Error(`terminal-pty: Signal ${signal} gibt es auf Windows nicht; nur SIGINT, SIGTERM und SIGKILL`)
    }
    await this.terminate()
    return this.pid
  }

  /**
   * Beendet die ganze Sitzung und wartet, bis sie fort ist.
   *
   * **Warum `taskkill /T` und nicht `proc.kill()`.** Ein `kill` trifft die Shell,
   * nicht ihre Kinder: ein laufender `npm install` überlebte sie und hielte den
   * PTY offen. `/T` nimmt den Baum mit, `/F` erzwingt es.
   *
   * @returns ein Versprechen, das nach dem Ende der Sitzung erfüllt ist
   */
  terminate(): Promise<void> {
    if (this.abraeumen !== undefined) return this.abraeumen
    const lauf = this.beende()
    this.abraeumen = lauf
    // Ein gescheitertes Aufräumen darf den nächsten Versuch nicht blockieren.
    void lauf.catch(() => { this.abraeumen = undefined })
    return lauf
  }

  /** Setzt die Ausgabeseite still und löst den Ausgang genau einmal auf. */
  private schliesse(ausgang: SubprocessOutcome): void {
    if (this.beendet) return
    this.beendet = true
    try {
      this.terminal.close()
    } catch (_terminalSchonZu) {
      // Ein zweites Schließen ist kein Fehler, den jemand behandeln müßte.
    }
    this.output.end()
    this.ausgang.resolve(ausgang)
  }

  /**
   * Beendet den Baum und belegt, daß er weg ist.
   *
   * **Warum nach dem Baum-Ende auf `exited` gewartet wird.** `taskkill /F` kann
   * den Prozeß töten, ohne daß Bun das Ende noch meldet (dieselbe Falle, die der
   * Kern in `LocalTerminalHandle.stopShellWindows` beschreibt). Nach einem
   * **bestätigten** `taskkill` (Rückgabewert 0) ist das Ausbleiben der Meldung
   * selbst der Ausgang — das wird hier ausdrücklich festgehalten, statt ewig zu
   * warten.
   */
  private async beende(): Promise<void> {
    if (this.beendet) return
    const getoetet = this.beendeBaum()
    await this.warteAufAusgang()
    if (this.beendet) return
    try {
      this.proc.kill('SIGKILL')
    } catch (_schonTot) {
      // Der Prozeß war schon weg — genau das war das Ziel.
    }
    await this.warteAufAusgang()
    if (this.beendet) return
    if (getoetet) {
      this.schliesse({ exitCode: null, signal: null })
      return
    }
    throw new Error(`terminal-pty: Sitzung ${this.pid} ließ sich nicht beenden`)
  }

  /**
   * Beendet den Prozeßbaum.
   *
   * @returns ob das Betriebssystem das Ende bestätigt hat
   */
  private beendeBaum(): boolean {
    if (process.platform !== 'win32') {
      try {
        this.proc.kill('SIGKILL')
        return true
      } catch (_schonTot) {
        return false
      }
    }
    try {
      const lauf = Bun.spawnSync({
        cmd: ['taskkill', '/PID', String(this.pid), '/T', '/F'],
        stdout: 'ignore',
        stderr: 'ignore',
      })
      return lauf.exitCode === 0
    } catch (_keinTaskkill) {
      // Ohne `taskkill` bleibt der direkte Weg über die Prozeßkennung.
      try {
        this.proc.kill('SIGKILL')
      } catch (_schonTot) {
        // Siehe oben: der gewünschte Endzustand.
      }
      return false
    }
  }

  /** Wartet höchstens die Gnadenfrist auf das Ende des obersten Prozesses. */
  private async warteAufAusgang(): Promise<void> {
    await Promise.race([
      this.done.then(() => undefined),
      sleepMs(Math.max(1, this.graceMs)),
    ])
  }
}
