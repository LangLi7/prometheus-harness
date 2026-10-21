/**
 * Die Ausführungsschicht: git über die Subprozess-Naht.
 *
 * ## Warum jede Ausführung durch `ctx.subprocess` geht
 *
 * Ein Plugin, das `child_process` selbst aufruft, umgeht die Umgebungs-Säuberung des Harness: die
 * Naht entfernt credential-förmige Namen und `DSH_*`-Werte aus der Umgebung des Kindes. Für git ist
 * das kein Beiwerk — `GIT_ASKPASS`, `GIT_CONFIG_*` und ein geerbtes `GITHUB_TOKEN` würden sonst
 * unbemerkt mitlaufen.
 *
 * Dazu kommen die Grenzen, die hier gesetzt werden: eine Frist je Befehl, eine Obergrenze für die
 * Ausgabe und `GIT_TERMINAL_PROMPT=0`. Ohne die letzte Variable wartet ein `push` ohne Anmeldung
 * ewig auf eine Eingabe, die im Host niemand geben kann.
 *
 * ## Warum ein Nicht-Null-Exit kein Fehler ist
 *
 * `git diff` endet mit 1, wenn es Unterschiede gibt, `git status` mit 1 außerhalb eines
 * Repositories. Ein Wurf daraus zu machen hieße, den Normalfall als Ausnahme zu behandeln. Erst der
 * Aufrufer entscheidet, was ein Exit bedeutet — hier wird er nur berichtet.
 *
 * @module @prometheus-harness/git/repo
 */

import { readFile } from 'node:fs/promises'

import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'

import {
  anzeigePfad,
  parseDiff,
  parseLog,
  parseNameStatus,
  parseNumstat,
  parseRemotes,
  parseStatus,
  zaehleZeilen,
  type Aenderung,
  type Commit,
  type Dateidiff,
  type Modus,
  type Remote,
  type Zweigstand,
} from './vertrag.ts'

/** Die Grenzen, unter denen jeder git-Befehl läuft. */
export interface Grenzen {
  /** Frist für einen rein lokalen Befehl. */
  readonly timeoutMs: number
  /** Frist für einen Befehl, der das Netz berührt (`fetch`, `pull`, `push`). */
  readonly netzTimeoutMs: number
  /** Obergrenze der Ausgabe eines Befehls. */
  readonly maxBytes: number
  /** Obergrenze einer Datei, die für einen unversionierten Diff gelesen wird. */
  readonly maxDateiBytes: number
}

/** Die Vorgaben; der Betreiber kann sie im Profil überschreiben. */
export const STANDARD_GRENZEN: Grenzen = {
  timeoutMs: 15_000,
  netzTimeoutMs: 120_000,
  maxBytes: 8 * 1024 * 1024,
  maxDateiBytes: 512 * 1024,
}

/** Das Ergebnis eines Befehls. */
export interface GitLauf {
  /** Der Exit-Code; `null`, wenn das Kind durch ein Signal endete. */
  readonly exit: number | null
  /** Die Standardausgabe (bei Kürzung deren Ende). */
  readonly aus: string
  /** Die Fehlerausgabe. */
  readonly fehler: string
  /** Ob die Ausgabe gekürzt wurde. */
  readonly abgeschnitten: boolean
}

/**
 * Baut eine Frist, die auch ein fremdes Abbruchsignal beachtet.
 *
 * **Warum nicht `AbortSignal.any`.** Die Funktion ist nicht in jeder Zielumgebung deklariert, und
 * dieser Code soll ohne Annahme über die Node-Version typechecken. Der Controller hier leistet
 * dasselbe und ist prüfbar.
 *
 * @param signal - das Signal des Aufrufers, wenn es eines gibt
 * @param ms - die Frist in Millisekunden
 * @returns das Signal und eine Aufräumfunktion
 */
export function mitFrist(signal: AbortSignal | undefined, ms: number): { signal: AbortSignal; fertig: () => void } {
  const steuerung = new AbortController()
  const timer = setTimeout(() => {
    steuerung.abort(new Error('Zeitüberschreitung'))
  }, ms)
  const weiter = (): void => {
    steuerung.abort(signal?.reason)
  }
  if (signal !== undefined) {
    if (signal.aborted) weiter()
    else signal.addEventListener('abort', weiter, { once: true })
  }
  return {
    signal: steuerung.signal,
    fertig: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', weiter)
    },
  }
}

/**
 * Wie ein Prozess ausgeführt wird — eine Naht, damit Tests ohne Host laufen.
 *
 * **Warum eine eigene Schnittstelle und nicht `ctx.subprocess`.** Der Subprozess-Dienst des Hosts
 * ist unter Windows nach dem ersten Lauf gestorben: der **Job-Runner** endete mit Exit 127
 * („before proving its managed range empty"), danach lieferte `spawn` ein Handle ohne Kind und
 * `done` löste nie auf — gemessen am 21.10.2026 an drei Aufrufen. Das trifft jeden Verbraucher
 * dieser Naht, nicht nur dieses Plugin. Bis der Runner repariert ist, führt dieses Paket git
 * selbst aus und behält nur die **Umgebungs-Säuberung** bei (`scrubbedParentEnv`).
 */
export interface Ausfuehrung {
  /**
   * Führt einen Befehl aus.
   *
   * @param argv - Programm und Argumente; nie über eine Shell interpretiert
   * @param cwd - das Arbeitsverzeichnis
   * @param optionen - Obergrenze der Ausgabe, Frist und Abbruch
   * @returns Exit, Ausgabe und Fehlerausgabe; ein Nicht-Null-Exit ist kein Fehler
   */
  lauf(
    argv: readonly string[],
    cwd: string,
    optionen: { readonly maxBytes: number; readonly fristMs: number; readonly signal?: AbortSignal },
  ): Promise<GitLauf>
}

/**
 * Führt Prozesse direkt über Bun aus.
 *
 * Die Umgebung wird mit `scrubbedParentEnv()` gesäubert — dieselbe Funktion, die auch der
 * Subprozess-Dienst benutzt: credential-förmige Namen und `DSH_*` erreichen das Kind nicht.
 */
export class BunAusfuehrung implements Ausfuehrung {
  /**
   * @param argv - Programm und Argumente
   * @param cwd - das Arbeitsverzeichnis
   * @param optionen - Obergrenze, Frist und Abbruch
   * @returns Exit, Ausgabe und Fehlerausgabe
   */
  async lauf(
    argv: readonly string[],
    cwd: string,
    optionen: { readonly maxBytes: number; readonly fristMs: number; readonly signal?: AbortSignal },
  ): Promise<GitLauf> {
    const frist = mitFrist(optionen.signal, optionen.fristMs)
    try {
      const prozess = Bun.spawn({
        cmd: [...argv],
        cwd,
        env: {
          ...scrubbedParentEnv(),
          // **Diese vier Zeilen sind der Unterschied zwischen einem Befehl und einem Hänger.**
          // Ohne `GIT_TERMINAL_PROMPT=0` fragt git nach einem Passwort; ohne `LC_ALL=C` ist die
          // Fehlerausgabe nicht vergleichbar; ohne `GIT_OPTIONAL_LOCKS=0` nimmt ein Lesebefehl
          // Sperren, die einen parallelen Commit des Nutzers stören.
          GIT_TERMINAL_PROMPT: '0',
          GIT_OPTIONAL_LOCKS: '0',
          GIT_PAGER: 'cat',
          LC_ALL: 'C',
          LANG: 'C',
        },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const abbruch = (): void => {
        prozess.kill()
      }
      if (frist.signal.aborted) abbruch()
      else frist.signal.addEventListener('abort', abbruch, { once: true })
      try {
        const [aus, fehler] = await Promise.all([
          new Response(prozess.stdout).text(),
          new Response(prozess.stderr).text(),
        ])
        const exit = await prozess.exited
        const gekuerzt = aus.length > optionen.maxBytes
        return {
          exit,
          aus: gekuerzt ? aus.slice(aus.length - optionen.maxBytes) : aus,
          fehler,
          abgeschnitten: gekuerzt,
        }
      } finally {
        frist.signal.removeEventListener('abort', abbruch)
        frist.fertig()
      }
    } catch (problem) {
      frist.fertig()
      return {
        exit: null,
        aus: '',
        fehler: problem instanceof Error ? problem.message : String(problem),
        abgeschnitten: false,
      }
    }
  }
}

/** Ein git-Aufrufer für genau eine Executable und einen Satz Grenzen. */
export class Git {
  /**
   * @param ausfuehrung - wie ein Prozess ausgeführt wird
   * @param exe - der aufgelöste Pfad zu `git`
   * @param grenzen - Fristen und Obergrenzen
   */
  constructor(
    private readonly ausfuehrung: Ausfuehrung,
    private readonly exe: string,
    private readonly grenzen: Grenzen = STANDARD_GRENZEN,
  ) {}

  /**
   * Führt `git <args>` aus.
   *
   * @param args - die Argumente; nie über eine Shell interpretiert
   * @param cwd - das Arbeitsverzeichnis
   * @param optionen - Frist, Obergrenze und Abbruch
   * @returns Exit, Ausgabe und Fehlerausgabe
   */
  async lauf(
    args: readonly string[],
    cwd: string,
    optionen: { readonly signal?: AbortSignal; readonly maxBytes?: number; readonly netz?: boolean } = {},
  ): Promise<GitLauf> {
    return this.ausfuehrung.lauf([this.exe, ...args], cwd, {
      maxBytes: optionen.maxBytes ?? this.grenzen.maxBytes,
      fristMs: optionen.netz === true ? this.grenzen.netzTimeoutMs : this.grenzen.timeoutMs,
      ...(optionen.signal === undefined ? {} : { signal: optionen.signal }),
    })
  }
}

/**
 * Übersetzt eine git-Fehlermeldung in einen Satz, der ohne git-Wissen trägt.
 *
 * **Warum das nicht bei git bleiben darf.** Unter NixOS und in Containern läuft der Harness oft als
 * anderer Benutzer als der Eigentümer des Repositories. git antwortet dann mit
 * `detected dubious ownership in repository at ...` und einem Ratschlag, der wie eine Warnung
 * klingt, aber eine Sperre ist. Der rohe Text im Panel hieße: der Nutzer liest „Fehler" und weiß
 * nicht, was zu tun ist.
 *
 * @param fehler - die Fehlerausgabe von git
 * @returns der erklärende Satz
 */
export function erklaereGitFehler(fehler: string): string {
  const text = fehler.trim()
  if (text === '') return 'git ist ohne Ausgabe gescheitert.'
  if (/dubious ownership/iu.test(text)) {
    return 'Dieses Repository gehört einem anderen Benutzer; git verweigert den Zugriff (dubious ownership). Der Eintrag safe.directory gehört in die git-Konfiguration des Host-Benutzers.'
  }
  if (/not a git repository/iu.test(text)) return 'Dieses Verzeichnis liegt in keinem git-Repository.'
  if (/permission denied/iu.test(text)) return 'Keine Berechtigung für dieses Repository.'
  if (/command not found|ENOENT|is not recognized/iu.test(text)) return 'git ist auf diesem Host nicht auffindbar.'
  return text
}

/** Ein Workspace mit seinem Repostand. */
export interface Repostand {
  /** Die Repository-Wurzel. */
  readonly wurzel: string
  /** Zweig und Stellung zum Upstream. */
  readonly zweig: Zweigstand
  /** Die Änderungen des gewählten Modus — **gekürzt**, wenn es zu viele sind. */
  readonly aenderungen: readonly Aenderung[]
  /** Wie viele Änderungen es insgesamt gibt. */
  readonly aenderungenGesamt: number
  /** Ob {@link aenderungen} gekürzt wurde. */
  readonly gekuerzt: boolean
  /** Die letzten Commits. */
  readonly commits: readonly Commit[]
  /** Die Remotes. */
  readonly remotes: readonly Remote[]
  /** Der Vergleichszweig im Modus `zweig`, wenn einer gefunden wurde. */
  readonly basis: string | null
  /** Warum eine Liste leer ist, obwohl der Modus etwas zeigen sollte. */
  readonly hinweis?: string
}

/**
 * So viele Änderungen liefert eine Antwort höchstens.
 *
 * **Warum überhaupt eine Grenze.** Dieses Repository hatte am 21.10.2026 **2635** geänderte
 * Dateien; ein Panel, das sie alle rendert, ist kein Überblick mehr, sondern ein Standbild. Die
 * Grenze steht deshalb auf dem Host, nicht im Browser — und die Gesamtzahl kommt mit, damit nichts
 * verschwiegen wird.
 */
export const AENDERUNGEN_MAX = 300

/**
 * Sucht die Repository-Wurzel über einem Verzeichnis.
 *
 * @param git - der Aufrufer
 * @param pfad - das Verzeichnis
 * @param signal - Abbruch
 * @returns die Wurzel oder `null`, wenn das Verzeichnis in keinem Repository liegt
 */
export async function findeWurzel(git: Git, pfad: string, signal?: AbortSignal): Promise<string | null> {
  const lauf = await git.lauf(['rev-parse', '--show-toplevel'], pfad, signal === undefined ? {} : { signal })
  if (lauf.exit !== 0) return null
  const wurzel = lauf.aus.trim()
  return wurzel === '' ? null : wurzel
}

/**
 * Bestimmt den Zweig, gegen den „Branch changes" vergleicht.
 *
 * Reihenfolge: der eingetragene Upstream, dann `origin/HEAD`, dann der erste vorhandene von
 * `origin/main`, `origin/master`, `main`, `master`. Findet sich nichts, bleibt der Modus leer — mit
 * einem Hinweis, statt mit einer stillen Null.
 *
 * @param git - der Aufrufer
 * @param wurzel - die Repository-Wurzel
 * @param zweig - der Zweigstand aus `status --branch`
 * @param signal - Abbruch
 * @returns der Vergleichsname oder `null`
 */
export async function basisZweig(
  git: Git,
  wurzel: string,
  zweig: Zweigstand,
  signal?: AbortSignal,
): Promise<string | null> {
  const optionen = signal === undefined ? {} : { signal }
  if (zweig.upstream !== null) return zweig.upstream
  const kopf = await git.lauf(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], wurzel, optionen)
  if (kopf.exit === 0) {
    const name = kopf.aus.trim()
    if (name !== '') return name
  }
  for (const kandidat of ['origin/main', 'origin/master', 'main', 'master']) {
    const da = await git.lauf(['rev-parse', '--verify', '--quiet', `${kandidat}^{commit}`], wurzel, optionen)
    if (da.exit === 0) return kandidat
  }
  return null
}

/**
 * Ergänzt die Zahlen einer unversionierten Datei.
 *
 * **Warum gelesen wird.** Für eine unversionierte Datei gibt es keinen Vergleich und damit keine
 * Zahlen. Sie ohne Zahlen zu zeigen wäre ehrlich, aber unbrauchbar; sie ganz zu lesen wäre teuer.
 * Deshalb wird bis {@link Grenzen.maxDateiBytes} gelesen, gezählt und bei Binärinhalt aufgegeben.
 *
 * @param wurzel - die Repository-Wurzel
 * @param aenderungen - die Änderungen, deren unversionierte Einträge ergänzt werden
 * @param grenzen - die Obergrenze
 * @returns die Änderungen mit Zahlen, soweit lesbar
 */
async function mitDateizahlen(
  wurzel: string,
  aenderungen: readonly Aenderung[],
  grenzen: Grenzen,
): Promise<Aenderung[]> {
  const aus: Aenderung[] = []
  for (const eintrag of aenderungen) {
    if (eintrag.bereich !== 'unversioniert' || eintrag.zusatz !== null) {
      aus.push(eintrag)
      continue
    }
    try {
      const roh = await readFile(`${wurzel}/${eintrag.pfad}`, { encoding: 'utf8' })
      const text = roh.length > grenzen.maxDateiBytes ? roh.slice(0, grenzen.maxDateiBytes) : roh
      const binaer = text.includes('\0')
      aus.push({
        ...eintrag,
        zusatz: binaer ? null : zaehleZeilen(text),
        abzug: binaer ? null : 0,
        binaer,
      })
    } catch {
      aus.push(eintrag)
    }
  }
  return aus
}

/**
 * Liest den vollständigen Stand eines Repositories im gewählten Modus.
 *
 * @param git - der Aufrufer
 * @param wurzel - die Repository-Wurzel
 * @param modus - welche der drei Fragen beantwortet wird
 * @param grenzen - die Grenzen
 * @param signal - Abbruch
 * @returns der Stand
 */
export async function liesStand(
  git: Git,
  wurzel: string,
  modus: Modus,
  grenzen: Grenzen = STANDARD_GRENZEN,
  signal?: AbortSignal,
): Promise<Repostand> {
  const optionen = signal === undefined ? {} : { signal }
  const [status, zahlenIndex, zahlenWerk, log, remotes] = await Promise.all([
    git.lauf(['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'], wurzel, optionen),
    git.lauf(['diff', '--cached', '--numstat', '-z'], wurzel, optionen),
    git.lauf(['diff', '--numstat', '-z'], wurzel, optionen),
    git.lauf(['log', '-n', '8', '--date=iso-strict', '--pretty=format:%h%x1f%H%x1f%an%x1f%ad%x1f%s'], wurzel, optionen),
    git.lauf(['remote', '-v'], wurzel, optionen),
  ])

  if (status.exit !== 0) {
    return {
      wurzel,
      zweig: { name: null, kopf: null, upstream: null, voraus: 0, zurueck: 0 },
      aenderungen: [],
      aenderungenGesamt: 0,
      gekuerzt: false,
      commits: [],
      remotes: [],
      basis: null,
      hinweis: erklaereGitFehler(status.fehler),
    }
  }

  const gelesen = parseStatus(status.aus)
  const karteIndex = parseNumstat(zahlenIndex.aus)
  const karteWerk = parseNumstat(zahlenWerk.aus)
  const commits = parseLog(log.aus)
  const remoteListe = parseRemotes(remotes.aus)

  let aenderungen: Aenderung[] = gelesen.aenderungen.map((eintrag) => {
    const quelle = eintrag.bereich === 'index' ? karteIndex : karteWerk
    const zahlen = quelle.get(eintrag.pfad)
    if (zahlen === undefined) return eintrag
    return { ...eintrag, zusatz: zahlen.zusatz, abzug: zahlen.abzug, binaer: zahlen.binaer }
  })
  let basis: string | null = null
  let hinweis: string | undefined

  if (modus === 'zweig') {
    basis = await basisZweig(git, wurzel, gelesen.zweig, signal)
    if (basis === null) {
      aenderungen = []
      hinweis = 'Kein Vergleichszweig gefunden — weder ein Upstream noch main/master.'
    } else {
      const [namen, zahlen] = await Promise.all([
        git.lauf(['diff', '--name-status', '-z', basis], wurzel, optionen),
        git.lauf(['diff', '--numstat', '-z', basis], wurzel, optionen),
      ])
      if (namen.exit !== 0) {
        aenderungen = []
        hinweis = namen.fehler.trim() === '' ? `Vergleich mit ${basis} ist gescheitert.` : namen.fehler.trim()
      } else {
        aenderungen = parseNameStatus(namen.aus, 'zweig', parseNumstat(zahlen.aus))
      }
    }
  } else if (modus === 'letzte-runde') {
    const [namen, zahlen] = await Promise.all([
      git.lauf(['diff', '--name-status', '-z', 'HEAD~1', 'HEAD'], wurzel, optionen),
      git.lauf(['diff', '--numstat', '-z', 'HEAD~1', 'HEAD'], wurzel, optionen),
    ])
    if (namen.exit !== 0) {
      aenderungen = []
      hinweis = 'Der letzte Commit hat keinen Vorgänger — die Runde ist die erste.'
    } else {
      aenderungen = parseNameStatus(namen.aus, 'runde', parseNumstat(zahlen.aus))
    }
  }
  // Der Arbeitsbaum steht schon in `aenderungen` — aus `status` samt Index und Arbeitsbaum.

  // **Erst zählen, dann kürzen, dann nur die sichtbaren Dateien lesen.** Die Zahlen einer
  // unversionierten Datei kosten einen Lesevorgang; sie für 2635 Zeilen zu holen, von denen 300
  // sichtbar sind, wäre Arbeit für den Papierkorb.
  const gesamt = aenderungen.length
  const gekuerzt = gesamt > AENDERUNGEN_MAX
  const sichtbar = gekuerzt ? aenderungen.slice(0, AENDERUNGEN_MAX) : aenderungen
  aenderungen = modus === 'arbeitsbaum' ? await mitDateizahlen(wurzel, sichtbar, grenzen) : sichtbar

  return {
    wurzel,
    zweig: gelesen.zweig,
    aenderungen,
    aenderungenGesamt: gesamt,
    gekuerzt,
    commits,
    remotes: remoteListe,
    basis,
    ...(hinweis === undefined ? {} : { hinweis }),
  }
}

/** Woher ein Diff genommen wird. */
export interface Diffauftrag {
  /** Der Modus, in dem die Datei gelistet ist. */
  readonly modus: Modus
  /** Der Pfad relativ zur Wurzel. */
  readonly pfad: string
  /** Der Bereich aus der Liste — er entscheidet zwischen Index und Arbeitsbaum. */
  readonly bereich: Aenderung['bereich']
  /** Der Vergleichszweig im Modus `zweig`. */
  readonly basis: string | null
}

/**
 * Baut aus einer unversionierten Datei einen Diff, der nur aus Plus-Zeilen besteht.
 *
 * @param text - der Inhalt
 * @param grenze - höchstens so viele Zeilen
 * @returns der Diff
 */
export function unversionierterDiff(text: string, grenze = 4000): Dateidiff {
  const zeilen = text.split('\n')
  const nichtLeer = text.endsWith('\n') ? zeilen.slice(0, -1) : zeilen
  const binaer = text.includes('\0')
  if (binaer) return { binaer: true, abgeschnitten: false, hunks: [] }
  const genommen = nichtLeer.slice(0, grenze)
  const kopf = `@@ -0,0 +1,${String(genommen.length)} @@`
  return {
    binaer: false,
    abgeschnitten: nichtLeer.length > grenze,
    hunks: [
      {
        kopf,
        zeilen: genommen.map((zeile, index) => ({ art: 'plus' as const, text: zeile, alt: null, neu: index + 1 })),
      },
    ],
  }
}

/**
 * Liest den Diff einer Datei.
 *
 * @param git - der Aufrufer
 * @param wurzel - die Repository-Wurzel
 * @param auftrag - Modus, Pfad, Bereich und Vergleichszweig
 * @param grenzen - die Grenzen
 * @param signal - Abbruch
 * @returns der Diff
 */
export async function liesDiff(
  git: Git,
  wurzel: string,
  auftrag: Diffauftrag,
  grenzen: Grenzen = STANDARD_GRENZEN,
  signal?: AbortSignal,
): Promise<Dateidiff> {
  const optionen = signal === undefined ? {} : { signal }
  const pfad = auftrag.pfad.replace(/\\/gu, '/')

  if (auftrag.modus === 'arbeitsbaum' && auftrag.bereich === 'unversioniert') {
    try {
      const inhalt = await readFile(`${wurzel}/${pfad}`, { encoding: 'utf8' })
      return unversionierterDiff(inhalt.slice(0, grenzen.maxDateiBytes))
    } catch (problem) {
      return {
        binaer: false,
        abgeschnitten: false,
        hunks: [],
        hinweis: problem instanceof Error ? problem.message : String(problem),
      }
    }
  }

  let args: string[]
  if (auftrag.modus === 'zweig') {
    if (auftrag.basis === null) return { binaer: false, abgeschnitten: false, hunks: [] }
    args = ['diff', auftrag.basis, '--', pfad]
  } else if (auftrag.modus === 'letzte-runde') {
    args = ['diff', 'HEAD~1', 'HEAD', '--', pfad]
  } else if (auftrag.bereich === 'index') {
    args = ['diff', '--cached', '--', pfad]
  } else {
    args = ['diff', '--', pfad]
  }

  const lauf = await git.lauf(args, wurzel, optionen)
  if (lauf.exit !== 0 && lauf.exit !== 1) {
    return { binaer: false, abgeschnitten: false, hunks: [] }
  }
  return parseDiff(lauf.aus)
}

/** Die Aktionen, die das Panel auslösen darf. */
export type Aktion = 'stage' | 'unstage' | 'commit' | 'fetch' | 'pull' | 'push'

/** Die bekannten Aktionen in Anzeigereihenfolge. */
export const AKTIONEN: readonly Aktion[] = ['stage', 'unstage', 'commit', 'fetch', 'pull', 'push']

/**
 * Ob ein Text eine bekannte Aktion nennt.
 *
 * @param wert - der geprüfte Text
 * @returns ob er eine Aktion nennt
 */
export function istAktion(wert: string): wert is Aktion {
  return (AKTIONEN as readonly string[]).includes(wert)
}

/** Ein Auftrag an das Repository. */
export interface Auftrag {
  /** Was getan werden soll. */
  readonly aktion: Aktion
  /** Die Dateien; fehlt die Liste, gilt der ganze Baum. */
  readonly pfade?: readonly string[]
  /** Die Commit-Nachricht; nur bei `commit`. */
  readonly nachricht?: string
}

/** Das Ergebnis einer Aktion. */
export interface Aktionsergebnis {
  /** Ob git mit 0 geendet hat. */
  readonly ok: boolean
  /** Was git geschrieben hat. */
  readonly ausgabe: string
  /** Der Fehler, wenn einer kam. */
  readonly fehler?: string
}

/**
 * Prüft einen Pfad, bevor er an git geht.
 *
 * **Warum überhaupt.** Die Argumente gehen als Array an git, nicht durch eine Shell — ein
 * eingeschleuster Befehl ist damit ausgeschlossen. Ein Pfad, der mit `-` beginnt, wäre aber weiter
 * eine Option. Deshalb steht vor jedem Pfad ein `--`, und ein leerer oder NUL-haltiger Pfad wird
 * abgewiesen.
 *
 * @param pfad - der geprüfte Pfad
 * @returns der Pfad, wenn er zulässig ist
 */
export function pruefePfad(pfad: string): string {
  if (pfad === '' || pfad.includes('\0') || pfad.length > 4096) {
    throw new Error('unzulässiger Pfad')
  }
  return pfad
}

/**
 * Führt eine Aktion aus.
 *
 * @param git - der Aufrufer
 * @param wurzel - die Repository-Wurzel
 * @param auftrag - was getan werden soll
 * @param zweig - der aktuelle Zweig (für `push -u`)
 * @param signal - Abbruch
 * @returns das Ergebnis; ein Nicht-Null-Exit ist `ok: false`, kein Wurf
 */
export async function fuehreAus(
  git: Git,
  wurzel: string,
  auftrag: Auftrag,
  zweig: Zweigstand,
  signal?: AbortSignal,
): Promise<Aktionsergebnis> {
  const pfade = (auftrag.pfade ?? []).map(pruefePfad)
  const netz = auftrag.aktion === 'fetch' || auftrag.aktion === 'pull' || auftrag.aktion === 'push'
  const optionen = { ...(signal === undefined ? {} : { signal }), netz }

  let args: string[]
  switch (auftrag.aktion) {
    case 'stage':
      args = ['add', '-A', ...(pfade.length === 0 ? [] : ['--', ...pfade])]
      break
    case 'unstage':
      if (pfade.length === 0) return { ok: false, ausgabe: '', fehler: 'ohne Pfadliste wird nicht zurückgesetzt' }
      args = ['reset', '-q', '--', ...pfade]
      break
    case 'commit': {
      const nachricht = (auftrag.nachricht ?? '').trim()
      if (nachricht === '') return { ok: false, ausgabe: '', fehler: 'die Commit-Nachricht fehlt' }
      if (nachricht.length > 5000) return { ok: false, ausgabe: '', fehler: 'die Commit-Nachricht ist zu lang' }
      args = ['commit', '-m', nachricht, ...(pfade.length === 0 ? [] : ['--', ...pfade])]
      break
    }
    case 'fetch':
      args = ['fetch', '--prune']
      break
    case 'pull':
      args = ['pull', '--ff-only']
      break
    case 'push':
      args = ['push']
      break
  }

  const lauf = await git.lauf(args, wurzel, optionen)
  if (lauf.exit === 0) {
    return { ok: true, ausgabe: [lauf.aus, lauf.fehler].filter((teil) => teil.trim() !== '').join('\n').trim() }
  }

  // Ohne eingetragenen Upstream scheitert `push` mit „no upstream branch". Ein zweiter Versuch mit
  // `-u origin <zweig>` ist die Antwort, die git selbst vorschlägt — und der einzige Fall, in dem
  // dieser Code eine Konfiguration schreibt.
  if (auftrag.aktion === 'push' && zweig.name !== null && /no upstream|has no upstream/iu.test(lauf.fehler)) {
    const zweiter = await git.lauf(['push', '-u', 'origin', zweig.name], wurzel, optionen)
    return zweiter.exit === 0
      ? { ok: true, ausgabe: [zweiter.aus, zweiter.fehler].filter((teil) => teil.trim() !== '').join('\n').trim() }
      : { ok: false, ausgabe: zweiter.aus, fehler: zweiter.fehler.trim() }
  }

  return { ok: false, ausgabe: lauf.aus, fehler: lauf.fehler.trim() === '' ? `git endete mit ${String(lauf.exit)}` : lauf.fehler.trim() }
}

/**
 * Formt eine Änderung für die Anzeige.
 *
 * @param aenderung - die Änderung
 * @returns dieselbe Änderung mit Schrägstrichen im Pfad
 */
export function alsAnzeige(aenderung: Aenderung): Aenderung {
  return {
    ...aenderung,
    pfad: anzeigePfad(aenderung.pfad),
    ...(aenderung.altpfad === undefined ? {} : { altpfad: anzeigePfad(aenderung.altpfad) }),
  }
}
