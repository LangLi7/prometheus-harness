/**
 * **Die Konfiguration dieses Plugins** — Befehl, Ausgabeordner, Arbeitswurzel.
 *
 * Gespeichert wird **eine** Datei: `$DSH_HOME/world/graphify.json` mit genau
 * `{ command, outDir, root }`. `DSH_HOME` kommt aus der Umgebung; ist es nicht
 * gesetzt, gilt `~/.dsh`.
 *
 * ## Warum `command` **nicht** aus dem Anfragekörper stammen darf
 *
 * `POST /run` startet ein Programm. Käme der Programmname aus dem Körper, wäre
 * die Route ein Ausführungsdienst für jeden, der sie erreicht — die
 * Localhost-Prüfung wäre die einzige Zaunlatte, und eine einzige Latte ist
 * keine. Der Name steht deshalb **nur** in dieser Datei, und der Körper kann
 * ihn nicht setzen; `POST /config` ist der ausdrückliche, geprüfte Weg.
 *
 * ## Warum `..` abgelehnt wird
 *
 * `outDir` und `root` werden zu Dateisystempfaden. Ein `..` ist kein Zeichen,
 * sondern eine Richtung: es führt aus dem Verzeichnis heraus, das der
 * Betreiber genannt hat. Relative Pfade sind erlaubt (sie lösen gegen `root`
 * bzw. das Arbeitsverzeichnis auf), aber ohne `..`.
 *
 * @module @prometheus-harness/world-graphify/config
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/** Die beiden Laufarten, die Graphify kennt. */
export type GraphifyMode = 'deep' | 'update'

/** Die Laufart, wie sie in der Antwort steht; ohne Angabe `default`. */
export type GraphifyModus = GraphifyMode | 'default'

/**
 * Ob und wann die CLI von selbst nachinstalliert wird.
 *
 * * `auto` — beim Start des Hosts einmal versuchen, wenn die CLI fehlt.
 * * `ask` — nur prüfen; die Installation startet der Knopf im Panel.
 * * `never` — weder prüfen noch installieren.
 */
export type SetupModus = 'auto' | 'ask' | 'never'

/** Die gespeicherte Konfiguration. */
export interface GraphifyConfig {
  /** Der Programmname oder der volle Pfad zur CLI. */
  readonly command: string
  /** Der Ausgabeordner, relativ zu `root` oder absolut. */
  readonly outDir: string
  /** Die Arbeitswurzel, in der die CLI läuft. */
  readonly root: string
  /** Ob die CLI fehlen darf und nachinstalliert werden soll. */
  readonly setup: SetupModus
}

/** Die erlaubten Modi — an einer Stelle, damit Prüfung und Vorgabe nicht auseinanderlaufen. */
export const SETUP_MODI: readonly SetupModus[] = ['auto', 'ask', 'never']

/** Die Vorgabe: fehlt die CLI, wird sie beim Start einmal nachinstalliert. */
export const STANDARD_SETUP: SetupModus = 'auto'

/** Eine Umgebung als Lesesicht — damit Tests ohne `process.env`-Mutation auskommen. */
export type Env = Readonly<Record<string, string | undefined>>

/** Das Ergebnis einer Prüfung. */
export type Geprueft<T> =
  | { readonly ok: true; readonly wert: T }
  | { readonly ok: false; readonly error: string }

/** Der Vorgabename der CLI. */
export const STANDARD_COMMAND = 'graphify'

/** Der Vorgabe-Ausgabeordner — Graphifys eigener Name. */
export const STANDARD_OUT_DIR = 'graphify-out'

/** Der Dateiname der Konfiguration. */
export const KONFIG_DATEINAME = 'graphify.json'

/** Der Ordner der Konfiguration unterhalb des Home. */
export const KONFIG_ORDNER = 'world'

/** Der Dateiname, den Graphify in `outDir` schreibt. */
export const GRAPH_DATEINAME = 'graph.json'

/**
 * Die Vorgabekonfiguration.
 *
 * `root` ist das **aktuelle** Arbeitsverzeichnis — nicht das Verzeichnis dieser
 * Datei. Ein Betreiber startet den Host dort, wo sein Repository liegt.
 *
 * @returns die Vorgaben
 */
export function standardConfig(): GraphifyConfig {
  return {
    command: STANDARD_COMMAND,
    outDir: STANDARD_OUT_DIR,
    root: process.cwd(),
    setup: STANDARD_SETUP,
  }
}

/**
 * Das Harness-Home: `DSH_HOME`, sonst `~/.dsh`.
 *
 * @param env - die Umgebung
 * @returns der absolute Pfad
 */
export function dshHome(env: Env = process.env): string {
  const ausUmgebung = env['DSH_HOME']
  if (ausUmgebung !== undefined && ausUmgebung.trim() !== '') return resolve(ausUmgebung)
  return join(homedir(), '.dsh')
}

/**
 * Der Pfad der Konfigurationsdatei.
 *
 * @param env - die Umgebung
 * @returns `$DSH_HOME/world/graphify.json` (absolut)
 */
export function konfigDatei(env: Env = process.env): string {
  return join(dshHome(env), KONFIG_ORDNER, KONFIG_DATEINAME)
}

/**
 * **Die Argumente eines Laufs** — eine reine Funktion, damit sie prüfbar ist.
 *
 * Die CLI selbst kommt **nicht** hierher; sie steht in der Konfiguration. Hier
 * stehen nur die festen Argumente, und es gibt keinen Weg, weitere
 * einzuschleusen.
 *
 * @param mode - die Laufart; ohne Angabe nur `.`
 * @returns die Argumentliste
 */
export function argsFuer(mode?: GraphifyMode): readonly string[] {
  /*
   * **Immer `--code-only`.**
   *
   * Ohne das Flag scannt Graphify auch die 1 500 Dokumente, Bilder und Paper
   * und verlangt dafür einen LLM-Schlüssel — der Lauf scheiterte dann mit
   * „no LLM API key found", obwohl der Code-Graph lokal und ohne Schlüssel
   * entsteht. Der Provider liefert den **Code-Graphen**; die semantische
   * Anreicherung ist ein eigener, bezahlter Schritt.
   */
  const args: string[] = ['.', '--code-only']
  if (mode === 'deep') args.push('--mode', 'deep')
  else if (mode === 'update') args.push('--update')
  return args
}

/**
 * Der Pfad der Graphdatei zu einer Konfiguration.
 *
 * Ein relativer `outDir` löst gegen `root` auf — dort läuft die CLI, dort legt
 * sie ihren Ordner an.
 *
 * @param config - die Konfiguration
 * @returns der absolute Pfad zu `graph.json`
 */
export function graphDatei(config: GraphifyConfig): string {
  return isAbsolute(config.outDir)
    ? join(config.outDir, GRAPH_DATEINAME)
    : resolve(config.root, config.outDir, GRAPH_DATEINAME)
}

/**
 * Prüft den Programmnamen.
 *
 * @param wert - der Wert aus dem Körper
 * @returns der geprüfte Name
 */
export function pruefeBefehl(wert: unknown): Geprueft<string> {
  if (typeof wert !== 'string') return { ok: false, error: '„command" muss eine Zeichenkette sein.' }
  const befehl = wert.trim()
  if (befehl === '') return { ok: false, error: '„command" darf nicht leer sein.' }
  if (/[\u0000\r\n]/u.test(befehl)) return { ok: false, error: '„command" enthält ein unerlaubtes Zeichen.' }
  return { ok: true, wert: befehl }
}

/**
 * Prüft den Setup-Modus.
 *
 * @param wert - der Wert aus dem Körper
 * @returns der geprüfte Modus
 */
export function pruefeSetup(wert: unknown): Geprueft<SetupModus> {
  if (wert === 'auto' || wert === 'ask' || wert === 'never') return { ok: true, wert }
  return { ok: false, error: '„setup" muss „auto", „ask" oder „never" sein.' }
}

/**
 * Prüft einen Pfad: absolut oder relativ, aber **ohne** `..`.
 *
 * @param wert - der Wert aus dem Körper
 * @param name - der Feldname für die Meldung
 * @returns der geprüfte Pfad
 */
export function pruefePfad(wert: unknown, name: string): Geprueft<string> {
  if (typeof wert !== 'string') return { ok: false, error: `„${name}" muss eine Zeichenkette sein.` }
  const pfad = wert.trim()
  if (pfad === '') return { ok: false, error: `„${name}" darf nicht leer sein.` }
  if (pfad.includes('\u0000')) return { ok: false, error: `„${name}" enthält ein Nullzeichen.` }
  if (pfad.split(/[\\/]+/u).includes('..')) {
    return { ok: false, error: `„${name}" darf kein „.." enthalten.` }
  }
  return { ok: true, wert: pfad }
}

/**
 * Prüft eine Änderung und legt sie über die bisherige Konfiguration.
 *
 * Nur genannte Felder ändern sich; ein fehlendes Feld behält seinen Wert.
 *
 * @param roh - der Anfragekörper
 * @param basis - die bisherige Konfiguration
 * @returns die neue Konfiguration oder der Grund der Ablehnung
 */
export function validiereAenderung(roh: unknown, basis: GraphifyConfig): Geprueft<GraphifyConfig> {
  if (roh === null || typeof roh !== 'object' || Array.isArray(roh)) {
    return { ok: false, error: 'Der Körper muss ein JSON-Objekt sein.' }
  }
  const daten = roh as Record<string, unknown>
  let command = basis.command
  let outDir = basis.outDir
  let root = basis.root
  let setup = basis.setup
  if ('command' in daten) {
    const geprueft = pruefeBefehl(daten['command'])
    if (!geprueft.ok) return geprueft
    command = geprueft.wert
  }
  if ('outDir' in daten) {
    const geprueft = pruefePfad(daten['outDir'], 'outDir')
    if (!geprueft.ok) return geprueft
    outDir = geprueft.wert
  }
  if ('root' in daten) {
    const geprueft = pruefePfad(daten['root'], 'root')
    if (!geprueft.ok) return geprueft
    root = geprueft.wert
  }
  if ('setup' in daten) {
    const geprueft = pruefeSetup(daten['setup'])
    if (!geprueft.ok) return geprueft
    setup = geprueft.wert
  }
  return { ok: true, wert: { command, outDir, root, setup } }
}

/**
 * **Liest die Konfiguration.**
 *
 * Fehlt die Datei oder ist sie unlesbar, gelten die Vorgaben. Eine **kaputte**
 * Datei wird nicht mit einem halben Ergebnis gemischt: entweder sie ergibt
 * eine gültige Konfiguration oder gar keine. Ein Plugin, das wegen einer
 * falsch geschriebenen Zeile nicht startet, wäre der teurere Fehler.
 *
 * @param env - die Umgebung
 * @returns die Konfiguration
 */
export function leseConfig(env: Env = process.env): GraphifyConfig {
  const standard = standardConfig()
  const datei = konfigDatei(env)
  if (!existsSync(datei)) return standard
  let roh: unknown
  try {
    roh = JSON.parse(readFileSync(datei, 'utf8')) as unknown
  } catch {
    return standard
  }
  const geprueft = validiereAenderung(roh, standard)
  return geprueft.ok ? geprueft.wert : standard
}

/**
 * **Schreibt die Konfiguration.**
 *
 * Das Verzeichnis wird angelegt; geschrieben wird erst nach der Prüfung.
 *
 * @param roh - der Anfragekörper
 * @param env - die Umgebung
 * @returns die gespeicherte Konfiguration oder der Grund der Ablehnung
 */
export function speichereConfig(roh: unknown, env: Env = process.env): Geprueft<GraphifyConfig> {
  const geprueft = validiereAenderung(roh, leseConfig(env))
  if (!geprueft.ok) return geprueft
  const datei = konfigDatei(env)
  try {
    mkdirSync(dirname(datei), { recursive: true })
    writeFileSync(datei, `${JSON.stringify(geprueft.wert, null, 2)}\n`, 'utf8')
  } catch (problem) {
    return { ok: false, error: `Die Konfiguration konnte nicht geschrieben werden: ${fehlerText(problem)}` }
  }
  return geprueft
}

/**
 * Macht aus einem geworfenen Wert einen Satz.
 *
 * @param problem - der gefangene Wert
 * @returns der Text
 */
export function fehlerText(problem: unknown): string {
  if (problem instanceof Error) return problem.message
  if (typeof problem === 'string') return problem
  return String(problem)
}
