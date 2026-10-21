/**
 * Das Git-Plugin — vier Routen, sonst nichts.
 *
 * ## Warum vier Routen und nicht eine
 *
 * | Route | Kosten | Wann sie gebraucht wird |
 * |---|---|---|
 * | `GET /stand` | ein git-Aufruf je Workspace und Modus | beim Öffnen und bei „Aktualisieren" |
 * | `GET /diff` | ein git-Aufruf | beim Aufklappen **einer** Datei |
 * | `POST /aktion` | ein schreibender git-Aufruf | auf ausdrücklichen Klick |
 * | `GET /fern` | zwei HTTP-Anfragen beim Anbieter | beim Aufklappen der Cloud |
 *
 * Alles in einer Antwort hieße: beim Aufklappen einer Datei alle Repositories neu lesen. Getrennt
 * bleibt jede Route so billig, wie sie ist.
 *
 * ## Warum jede Route gesperrt ist
 *
 * Der Stand nennt Pfade und Commits, `POST /aktion` schreibt in ein Repository. Beides gehört nicht
 * ins offene Netz. Die Entscheidung, ob eine Anfrage angemeldet ist, trifft der Verbindungsdienst
 * des Hosts — hier wird sie über `abweisung` **gefragt**, nicht getroffen (dieselbe Naht wie im
 * Usage-Panel).
 *
 * ## Warum die Workspaces vom Host kommen
 *
 * Der Browser kennt die Projektliste nicht; `workspaceRegistry` kennt sie. Damit ist „nach
 * Workspaces" keine Behauptung der Oberfläche, sondern die Liste, die der Host führt — und ein
 * Pfad, den die Route liest, ist immer ein registrierter Workspace, nie ein beliebiger Pfad aus
 * einer Anfrage.
 *
 * @module @prometheus-harness/git/server
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Context } from '@deepseek-ai/cordis'
// **Nur für die Typen.** Die Zeile ergänzt `ctx.workspaceRegistry` um seine Deklaration; ohne sie
// kennt der Übersetzer den Dienst nicht, den der Loader bereitstellt.
import type {} from '@deepseek-ai/dsh-workspace'

import { abweisung } from '@prometheus-harness/ai-capabilities'

import { holeFern, tokenFuer, type Fernstand } from './fern.ts'
import {
  fuehreAus,
  findeWurzel,
  istAktion,
  liesDiff,
  liesStand,
  BunAusfuehrung,
  Git,
  STANDARD_GRENZEN,
  type Aktionsergebnis,
  type Grenzen,
  type Repostand,
} from './repo.ts'
import { istModus, type Modus } from './vertrag.ts'

/**
 * Der stabile Plugin-Name.
 *
 * **Warum nicht `pmh-git` im Sinne einer Route.** Der Name ist der Eintrag im Cordis-Ledger; er muß
 * über alle Pakete eindeutig sein. `@prometheus-harness/git` ist der Paketname, `pmh-git` der
 * Dienst — zwei verschiedene Dinge, die sich nicht überschreiben dürfen.
 */
export const name = 'pmh-git'

/**
 * Ohne Webserver gibt es keine Fläche, ohne Workspace-Registry keine Gruppen.
 *
 * **`subprocess` steht bewusst nicht mehr hier.** git läuft seit dem 21.10.2026 über
 * {@link BunAusfuehrung}: der Job-Runner des Subprozess-Dienstes starb unter Windows mit Exit 127,
 * danach lieferte jeder `spawn` ein Handle ohne Kind.
 */
export const inject = ['webServer', 'workspaceRegistry']

/** Wo der Stand aller Workspaces steht. */
export const WEG_STAND = '/api/pmh/git/stand'

/** Wo ein einzelner Diff steht. */
export const WEG_DIFF = '/api/pmh/git/diff'

/** Wo eine Aktion ausgelöst wird. */
export const WEG_AKTION = '/api/pmh/git/aktion'

/** Wo Pull Requests und Issues stehen. */
export const WEG_FERN = '/api/pmh/git/fern'

/** So groß darf ein Aktionskörper sein. */
const KOERPER_MAX = 64 * 1024

/** So viele Repositories werden gleichzeitig gelesen. */
const GLEICHZEITIG = 4

/** Ein Workspace, wie ihn die Route beschreibt. */
export interface Workspacestand {
  /** Die stabile Kennung aus der Registry. */
  readonly id: string
  /** Der Anzeigename. */
  readonly titel: string
  /** Der kanonische Pfad. */
  readonly pfad: string
  /** Der Modus, in dem gelesen wurde. */
  readonly modus: Modus
  /** Der Repostand oder `null`, wenn das Verzeichnis in keinem Repository liegt. */
  readonly repo: Repostand | null
  /** Warum `repo` `null` ist. */
  readonly hinweis?: string
}

/** Die Antwort von `GET /stand`. */
export interface Standantwort {
  /** Wann gelesen wurde. */
  readonly gelesenAm: string
  /** Die Workspaces in der Reihenfolge der Registry. */
  readonly workspaces: readonly Workspacestand[]
}

/** Ein Handler, wie ihn der Webserver erwartet. */
type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/**
 * Schreibt eine JSON-Antwort.
 *
 * @param res - die Antwort
 * @param status - der Status
 * @param koerper - der Körper
 */
function antworte(res: ServerResponse, status: number, koerper: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(koerper))
}

/**
 * Die Absage, wenn die Anfrage nicht angemeldet ist.
 *
 * @param ctx - der Plugin-Kontext
 * @param req - die Anfrage
 * @param res - die Antwort
 * @returns `true`, wenn schon geantwortet wurde
 */
function weiseAb(ctx: Context, req: IncomingMessage, res: ServerResponse): boolean {
  const status = abweisung(ctx, req.headers)
  if (status === undefined) return false
  antworte(res, status, { fehler: status === 401 ? 'nicht angemeldet' : 'kein Verbindungsdienst' })
  return true
}

/**
 * Liest den Rumpf einer Anfrage als JSON.
 *
 * @param req - die Anfrage
 * @returns der gelesene Wert oder `undefined`, wenn er fehlt oder zu groß ist
 */
async function leseKoerper(req: IncomingMessage): Promise<unknown> {
  const stuecke: Buffer[] = []
  let groesse = 0
  for await (const stueck of req) {
    const buf = Buffer.isBuffer(stueck) ? stueck : Buffer.from(String(stueck))
    groesse += buf.byteLength
    if (groesse > KOERPER_MAX) return undefined
    stuecke.push(buf)
  }
  if (stuecke.length === 0) return undefined
  try {
    return JSON.parse(Buffer.concat(stuecke).toString('utf8')) as unknown
  } catch {
    return undefined
  }
}

/**
 * Führt Aufgaben mit begrenzter Gleichzeitigkeit aus.
 *
 * **Warum nicht `Promise.all` über alles.** Fünfzig Workspaces hießen fünfzig git-Prozesse
 * gleichzeitig; auf einem Laptop ist das ein Sturm auf die Platte, kein Fortschritt.
 *
 * @param werte - die Eingaben
 * @param grenze - wie viele gleichzeitig laufen
 * @param aufgabe - was je Eingabe zu tun ist
 * @returns die Ergebnisse in Eingabereihenfolge
 */
async function inGruppen<T, R>(
  werte: readonly T[],
  grenze: number,
  aufgabe: (wert: T) => Promise<R>,
): Promise<R[]> {
  const aus: R[] = new Array<R>(werte.length)
  let naechster = 0
  const arbeiter = async (): Promise<void> => {
    for (;;) {
      const index = naechster
      naechster += 1
      const wert = werte[index]
      if (wert === undefined) return
      aus[index] = await aufgabe(wert)
    }
  }
  await Promise.all(Array.from({ length: Math.min(grenze, werte.length) }, arbeiter))
  return aus
}

/** Der Zustand, den das Plugin über die Anfragen hinweg hält. */
interface Bestand {
  /** Das aufgelöste git oder `null`, solange es nicht gefunden wurde. */
  gitExe: string | null
  /** Warum git nicht gefunden wurde. */
  fehler: string | null
}

/**
 * Sucht das git-Programm einmalig.
 *
 * **Warum `Bun.which` und nicht `ctx.subprocess.resolveExecutable`.** Der Subprozess-Dienst ist
 * unter Windows nach dem ersten Lauf gestorben (Job-Runner, Exit 127); sein `spawn` lieferte
 * danach Handles ohne Kind. `PMH_GIT` übersteuert den Pfad — unter NixOS zeigt er auf
 * `/nix/store/…/bin/git`, im Test auf etwas anderes.
 *
 * @param bestand - der Zustand des Plugins
 * @returns der Aufrufer oder `null`, wenn git fehlt
 */
function gitFuer(bestand: Bestand): Git | null {
  if (bestand.gitExe === null && bestand.fehler === null) {
    const roh = process.env['PMH_GIT']
    const gewaehlt = roh !== undefined && roh.trim() !== '' ? roh.trim() : Bun.which('git')
    if (gewaehlt === null) bestand.fehler = 'git ist nicht im PATH'
    else bestand.gitExe = gewaehlt
  }
  if (bestand.gitExe === null) return null
  return new Git(new BunAusfuehrung(), bestand.gitExe, grenzen())
}

/**
 * Liest die Grenzen aus der Umgebung.
 *
 * @returns die Grenzen; ohne Umgebung die Vorgaben
 */
export function grenzen(): Grenzen {
  const zahl = (name: string, vorgabe: number): number => {
    const roh = process.env[name]
    if (roh === undefined) return vorgabe
    const wert = Number.parseInt(roh, 10)
    return Number.isFinite(wert) && wert > 0 ? wert : vorgabe
  }
  return {
    timeoutMs: zahl('PMH_GIT_TIMEOUT_MS', STANDARD_GRENZEN.timeoutMs),
    netzTimeoutMs: zahl('PMH_GIT_NETZ_TIMEOUT_MS', STANDARD_GRENZEN.netzTimeoutMs),
    maxBytes: zahl('PMH_GIT_MAX_BYTES', STANDARD_GRENZEN.maxBytes),
    maxDateiBytes: zahl('PMH_GIT_MAX_DATEI_BYTES', STANDARD_GRENZEN.maxDateiBytes),
  }
}

/**
 * Macht den Handler für den Stand.
 *
 * @param ctx - der Plugin-Kontext
 * @param bestand - der Zustand des Plugins
 * @returns der Handler
 */
function macheStand(ctx: Context, bestand: Bestand): Handler {
  return async (req, res) => {
    if (weiseAb(ctx, req, res)) return
    const git = gitFuer(bestand)
    if (git === null) {
      antworte(res, 503, { fehler: 'git ist auf diesem Host nicht auffindbar', detail: bestand.fehler })
      return
    }

    const url = new URL(req.url ?? WEG_STAND, 'http://127.0.0.1')
    const rohModus = url.searchParams.get('modus') ?? 'arbeitsbaum'
    if (!istModus(rohModus)) {
      antworte(res, 400, { fehler: `unbekannter Modus „${rohModus}"` })
      return
    }
    const nur = url.searchParams.get('workspace')

    const alle = ctx.workspaceRegistry.list()
    const gewaehlt = nur === null ? alle : alle.filter((workspace) => String(workspace.id) === nur)
    if (nur !== null && gewaehlt.length === 0) {
      antworte(res, 404, { fehler: 'diesen Workspace gibt es nicht' })
      return
    }

    const grenzenWert = grenzen()
    const staende = await inGruppen(gewaehlt, GLEICHZEITIG, async (workspace) => {
      const pfad = workspace.path
      const wurzel = await findeWurzel(git, pfad)
      if (wurzel === null) {
        return {
          id: String(workspace.id),
          titel: workspace.title,
          pfad,
          modus: rohModus,
          repo: null,
          hinweis: 'Dieses Verzeichnis liegt in keinem git-Repository.',
        } satisfies Workspacestand
      }
      const repo = await liesStand(git, wurzel, rohModus, grenzenWert)
      return {
        id: String(workspace.id),
        titel: workspace.title,
        pfad,
        modus: rohModus,
        repo,
      } satisfies Workspacestand
    })

    const antwort: Standantwort = { gelesenAm: new Date().toISOString(), workspaces: staende }
    antworte(res, 200, antwort)
  }
}

/**
 * Macht den Handler für einen Diff.
 *
 * @param ctx - der Plugin-Kontext
 * @param bestand - der Zustand des Plugins
 * @returns der Handler
 */
function macheDiff(ctx: Context, bestand: Bestand): Handler {
  return async (req, res) => {
    if (weiseAb(ctx, req, res)) return
    const git = gitFuer(bestand)
    if (git === null) {
      antworte(res, 503, { fehler: 'git ist auf diesem Host nicht auffindbar' })
      return
    }
    const url = new URL(req.url ?? WEG_DIFF, 'http://127.0.0.1')
    const rohModus = url.searchParams.get('modus') ?? 'arbeitsbaum'
    const pfad = url.searchParams.get('pfad') ?? ''
    const bereich = url.searchParams.get('bereich') ?? 'werk'
    const basis = url.searchParams.get('basis')
    if (!istModus(rohModus)) {
      antworte(res, 400, { fehler: `unbekannter Modus „${rohModus}"` })
      return
    }
    if (pfad.trim() === '') {
      antworte(res, 400, { fehler: 'der Parameter pfad fehlt' })
      return
    }
    if (bereich !== 'index' && bereich !== 'werk' && bereich !== 'unversioniert' && bereich !== 'zweig' && bereich !== 'runde') {
      antworte(res, 400, { fehler: `unbekannter Bereich „${bereich}"` })
      return
    }

    const workspace = ctx.workspaceRegistry.list().find((eintrag) => String(eintrag.id) === (url.searchParams.get('workspace') ?? ''))
    if (workspace === undefined) {
      antworte(res, 404, { fehler: 'diesen Workspace gibt es nicht' })
      return
    }
    const wurzel = await findeWurzel(git, workspace.path)
    if (wurzel === null) {
      antworte(res, 404, { fehler: 'dieser Workspace ist kein Repository' })
      return
    }

    const diff = await liesDiff(
      git,
      wurzel,
      { modus: rohModus, pfad, bereich, basis: basis === null || basis === '' ? null : basis },
      grenzen(),
    )
    antworte(res, 200, { pfad, modus: rohModus, bereich, diff })
  }
}

/**
 * Macht den Handler für eine Aktion.
 *
 * @param ctx - der Plugin-Kontext
 * @param bestand - der Zustand des Plugins
 * @returns der Handler
 */
function macheAktion(ctx: Context, bestand: Bestand): Handler {
  return async (req, res) => {
    if (weiseAb(ctx, req, res)) return
    if (req.method !== 'POST') {
      antworte(res, 405, { fehler: 'nur POST' })
      return
    }
    const git = gitFuer(bestand)
    if (git === null) {
      antworte(res, 503, { fehler: 'git ist auf diesem Host nicht auffindbar' })
      return
    }
    const koerper = await leseKoerper(req)
    if (typeof koerper !== 'object' || koerper === null) {
      antworte(res, 400, { fehler: 'der Körper ist kein JSON-Objekt' })
      return
    }
    const daten = koerper as Record<string, unknown>
    const workspaceId = typeof daten['workspace'] === 'string' ? daten['workspace'] : ''
    const rohAktion = typeof daten['aktion'] === 'string' ? daten['aktion'] : ''
    if (!istAktion(rohAktion)) {
      antworte(res, 400, { fehler: `unbekannte Aktion „${rohAktion}"` })
      return
    }

    const workspace = ctx.workspaceRegistry.list().find((eintrag) => String(eintrag.id) === workspaceId)
    if (workspace === undefined) {
      antworte(res, 404, { fehler: 'diesen Workspace gibt es nicht' })
      return
    }
    const wurzel = await findeWurzel(git, workspace.path)
    if (wurzel === null) {
      antworte(res, 404, { fehler: 'dieser Workspace ist kein Repository' })
      return
    }

    const rohePfade = Array.isArray(daten['pfade'])
      ? (daten['pfade'] as unknown[]).filter((wert): wert is string => typeof wert === 'string')
      : undefined
    const nachricht = typeof daten['nachricht'] === 'string' ? daten['nachricht'] : undefined

    const vorher = await liesStand(git, wurzel, 'arbeitsbaum', grenzen())
    let ergebnis: Aktionsergebnis
    try {
      ergebnis = await fuehreAus(
        git,
        wurzel,
        {
          aktion: rohAktion,
          ...(rohePfade === undefined ? {} : { pfade: rohePfade }),
          ...(nachricht === undefined ? {} : { nachricht }),
        },
        vorher.zweig,
      )
    } catch (problem) {
      antworte(res, 400, { fehler: problem instanceof Error ? problem.message : String(problem) })
      return
    }

    // **Der Stand kommt mit der Antwort.** Sonst müßte das Panel nach jeder Aktion eine zweite
    // Anfrage stellen — und zeigte bis dahin einen Zustand, den es nicht mehr gibt.
    const repo = await liesStand(git, wurzel, 'arbeitsbaum', grenzen())
    antworte(res, 200, { ...ergebnis, workspace: workspaceId, repo })
  }
}

/**
 * Macht den Handler für Pull Requests und Issues.
 *
 * @param ctx - der Plugin-Kontext
 * @param bestand - der Zustand des Plugins
 * @returns der Handler
 */
function macheFern(ctx: Context, bestand: Bestand): Handler {
  return async (req, res) => {
    if (weiseAb(ctx, req, res)) return
    const git = gitFuer(bestand)
    if (git === null) {
      antworte(res, 503, { fehler: 'git ist auf diesem Host nicht auffindbar' })
      return
    }
    const url = new URL(req.url ?? WEG_FERN, 'http://127.0.0.1')
    const workspace = ctx.workspaceRegistry.list().find((eintrag) => String(eintrag.id) === (url.searchParams.get('workspace') ?? ''))
    if (workspace === undefined) {
      antworte(res, 404, { fehler: 'diesen Workspace gibt es nicht' })
      return
    }
    const wurzel = await findeWurzel(git, workspace.path)
    if (wurzel === null) {
      antworte(res, 404, { fehler: 'dieser Workspace ist kein Repository' })
      return
    }
    const stand = await liesStand(git, wurzel, 'arbeitsbaum', grenzen())
    const remote = stand.remotes.find((eintrag) => eintrag.name === 'origin') ?? stand.remotes[0]
    if (remote === undefined) {
      const leer: Fernstand = {
        anbieter: 'unbekannt',
        eigner: null,
        repo: null,
        pulls: [],
        issues: [],
        hinweis: 'Dieses Repository hat kein Remote.',
      }
      antworte(res, 200, leer)
      return
    }
    if (remote.webUrl === null) {
      const leer: Fernstand = {
        anbieter: remote.anbieter,
        eigner: remote.eigner,
        repo: remote.repo,
        pulls: [],
        issues: [],
        hinweis: 'Dieses Remote ist ein lokaler Pfad — es gibt keine Weboberfläche.',
      }
      antworte(res, 200, leer)
      return
    }

    const token = tokenFuer(remote.anbieter)
    if (token.wert === null) {
      const leer: Fernstand = {
        anbieter: remote.anbieter,
        eigner: remote.eigner,
        repo: remote.repo,
        pulls: [],
        issues: [],
        hinweis: `Kein Token hinterlegt (${token.name === '' ? 'dieser Anbieter braucht keines' : token.name}).`,
      }
      antworte(res, 200, leer)
      return
    }

    antworte(res, 200, await holeFern(remote, token.wert))
  }
}

/**
 * Hängt die vier Routen ein.
 *
 * @param ctx - der Plugin-Kontext
 */
export function apply(ctx: Context): void {
  const bestand: Bestand = { gitExe: null, fehler: null }
  ctx.effect(() => {
    const abgemeldet: (() => void)[] = [
      ctx.webServer.register({ kind: 'exact', path: WEG_STAND, handler: macheStand(ctx, bestand) }),
      ctx.webServer.register({ kind: 'exact', path: WEG_DIFF, handler: macheDiff(ctx, bestand) }),
      ctx.webServer.register({ kind: 'exact', path: WEG_AKTION, handler: macheAktion(ctx, bestand) }),
      ctx.webServer.register({ kind: 'exact', path: WEG_FERN, handler: macheFern(ctx, bestand) }),
    ]
    return () => {
      for (const ab of abgemeldet) ab()
    }
  }, `${name} Routen`)
}

export default apply

