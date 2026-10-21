/**
 * Die lesende Cloud-Hälfte: Pull Requests und Issues bei GitHub, GitLab, Forgejo und Gitea.
 *
 * ## Warum nur lesend
 *
 * Ein Merge oder ein Kommentar aus einer Oberfläche heraus ist eine schreibende Aktion mit
 * Folgen für andere Menschen. Der Betreiber hat den lesenden Zuschnitt gewählt (21.10.2026): sehen,
 * was offen ist, und per Klick zur Weboberfläche — nicht von hier aus eingreifen.
 *
 * ## Warum das Token aus der Umgebung kommt
 *
 * Der Harness hat eine Credential-Naht; sie kennt heute die Anbieter, die als Modell-Anbieter
 * eingetragen sind, nicht GitHub. Bis ein Eintrag dort existiert, ist die Umgebung der ehrliche
 * Weg: `GITHUB_TOKEN`, `GITLAB_TOKEN`, `GITEA_TOKEN`, `FORGEJO_TOKEN`. Fehlt das Token, sagt das
 * Panel es — statt eine leere Liste zu zeigen, die wie „nichts offen" aussieht.
 *
 * ## Warum die API-Adresse geraten werden muss
 *
 * GitHub hat `api.github.com`, GitLab `/api/v4`, Gitea und Forgejo `/api/v1`. Für selbstgehostete
 * Instanzen ist der Hostname die einzige Auskunft. Was nicht erkannt wird, bleibt leer — mit einem
 * Hinweis, nicht mit einer stillen Null.
 *
 * @module @prometheus-harness/git/fern
 */

import { mitFrist } from './repo.ts'
import type { Anbieter, Remote } from './vertrag.ts'

/** Ein Eintrag aus der Cloud. */
export interface Fernposten {
  /** Die Nummer in der Weboberfläche. */
  readonly nummer: number
  /** Der Titel. */
  readonly titel: string
  /** Die Adresse in der Weboberfläche. */
  readonly url: string
  /** Ob es ein Pull Request oder ein Issue ist. */
  readonly art: 'pull' | 'issue'
  /** Der Zustand, wie ihn der Anbieter nennt. */
  readonly zustand: string
  /** Der Verfasser. */
  readonly autor: string
  /** Wann zuletzt geändert. */
  readonly aktualisiert: string
}

/** Was die Cloud zu einem Repository sagt. */
export interface Fernstand {
  /** Der erkannte Anbieter. */
  readonly anbieter: Anbieter
  /** Der Eigner aus der Remote-URL. */
  readonly eigner: string | null
  /** Das Repository aus der Remote-URL. */
  readonly repo: string | null
  /** Die offenen Pull Requests. */
  readonly pulls: readonly Fernposten[]
  /** Die offenen Issues. */
  readonly issues: readonly Fernposten[]
  /** Warum eine Liste leer ist, wenn das einen Grund hat. */
  readonly hinweis?: string
}

/**
 * Sucht das Token eines Anbieters in der Umgebung.
 *
 * @param anbieter - der erkannte Anbieter
 * @param umgebung - die Umgebung (im Test setzbar)
 * @returns das Token und der Name der Variable, aus der es kam
 */
export function tokenFuer(
  anbieter: Anbieter,
  umgebung: Readonly<Record<string, string | undefined>> = process.env,
): { readonly wert: string | null; readonly name: string } {
  const kandidaten =
    anbieter === 'github'
      ? ['GITHUB_TOKEN', 'GH_TOKEN']
      : anbieter === 'gitlab'
        ? ['GITLAB_TOKEN', 'GL_TOKEN']
        : anbieter === 'gitea'
          ? ['GITEA_TOKEN']
          : anbieter === 'forgejo'
            ? ['FORGEJO_TOKEN', 'GITEA_TOKEN']
            : []
  for (const name of kandidaten) {
    const wert = umgebung[name]
    if (wert !== undefined && wert.trim() !== '') return { wert: wert.trim(), name }
  }
  return { wert: null, name: kandidaten[0] ?? '' }
}

/**
 * Die API-Basis zu einem Remote.
 *
 * @param remote - der erkannte Remote
 * @returns die Basis oder `null`, wenn für den Host keine API bekannt ist
 */
export function apiBasis(remote: Remote): string | null {
  if (remote.host === '') return null
  switch (remote.anbieter) {
    case 'github':
      return remote.host === 'github.com' ? 'https://api.github.com' : `https://${remote.host}/api/v3`
    case 'gitlab':
      return `https://${remote.host}/api/v4`
    case 'gitea':
    case 'forgejo':
      return `https://${remote.host}/api/v1`
    default:
      return null
  }
}

/**
 * Die Kopfzeilen, die ein Anbieter für ein Token erwartet.
 *
 * @param anbieter - der Anbieter
 * @param token - das Token
 * @returns die Kopfzeilen
 */
export function kopfzeilen(anbieter: Anbieter, token: string): Record<string, string> {
  const basis: Record<string, string> = { accept: 'application/json' }
  if (anbieter === 'github') {
    return { ...basis, authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' }
  }
  if (anbieter === 'gitlab') {
    return { ...basis, 'private-token': token }
  }
  return { ...basis, authorization: `token ${token}` }
}

/** Was eine Liste geliefert hat. */
interface Listenantwort<T> {
  readonly daten: readonly T[]
  readonly fehler?: string
}

/**
 * Holt eine JSON-Liste.
 *
 * @param url - die Adresse
 * @param kopf - die Kopfzeilen
 * @param signal - Abbruch
 * @param ms - Frist
 * @returns die Liste oder ein Fehlertext
 */
async function holeListe<T>(
  url: string,
  kopf: Record<string, string>,
  signal: AbortSignal | undefined,
  ms: number,
): Promise<Listenantwort<T>> {
  const frist = mitFrist(signal, ms)
  try {
    const antwort = await fetch(url, { headers: kopf, signal: frist.signal })
    if (!antwort.ok) {
      return { daten: [], fehler: `HTTP ${String(antwort.status)} von ${new URL(url).host}` }
    }
    const daten = (await antwort.json()) as unknown
    return { daten: Array.isArray(daten) ? (daten as T[]) : [] }
  } catch (problem) {
    return { daten: [], fehler: problem instanceof Error ? problem.message : String(problem) }
  } finally {
    frist.fertig()
  }
}

/** Ein Eintrag, wie ihn die Anbieter mehr oder weniger gemeinsam liefern. */
interface Rohposten {
  readonly number?: number
  readonly iid?: number
  readonly title?: string
  readonly html_url?: string
  readonly web_url?: string
  readonly state?: string
  readonly updated_at?: string
  readonly user?: { readonly login?: string }
  readonly author?: { readonly username?: string }
  readonly pull_request?: unknown
}

/**
 * Formt einen Anbieter-Eintrag.
 *
 * @param roh - der Eintrag
 * @param art - Pull Request oder Issue
 * @returns der Anzeigeposten oder `null`, wenn Pflichtfelder fehlen
 */
function forme(roh: Rohposten, art: 'pull' | 'issue'): Fernposten | null {
  const nummer = roh.number ?? roh.iid
  const titel = roh.title ?? ''
  const url = roh.html_url ?? roh.web_url ?? ''
  if (nummer === undefined || titel === '' || url === '') return null
  return {
    nummer,
    titel,
    url,
    art,
    zustand: roh.state ?? 'open',
    autor: roh.user?.login ?? roh.author?.username ?? '',
    aktualisiert: roh.updated_at ?? '',
  }
}

/**
 * Holt Pull Requests und Issues zu einem Remote.
 *
 * @param remote - der erkannte Remote
 * @param token - das Token
 * @param signal - Abbruch
 * @param ms - Frist je Anfrage
 * @returns der Fernstand; leere Listen tragen einen Hinweis, wenn etwas fehlte
 */
export async function holeFern(
  remote: Remote,
  token: string,
  signal?: AbortSignal,
  ms = 8000,
): Promise<Fernstand> {
  const eigner = remote.eigner
  const repo = remote.repo
  const basis = apiBasis(remote)
  if (basis === null || eigner === null || repo === null) {
    return {
      anbieter: remote.anbieter,
      eigner,
      repo,
      pulls: [],
      issues: [],
      hinweis: 'Für diesen Host ist keine API bekannt — nur der Weblink steht zur Verfügung.',
    }
  }

  const kopf = kopfzeilen(remote.anbieter, token)
  const projekt = encodeURIComponent(`${eigner}/${repo}`)
  const pullsUrl =
    remote.anbieter === 'github'
      ? `${basis}/repos/${eigner}/${repo}/pulls?state=open&per_page=5`
      : remote.anbieter === 'gitlab'
        ? `${basis}/projects/${projekt}/merge_requests?state=opened&per_page=5`
        : `${basis}/repos/${eigner}/${repo}/pulls?state=open&limit=5`
  const issuesUrl =
    remote.anbieter === 'github'
      ? `${basis}/repos/${eigner}/${repo}/issues?state=open&per_page=5`
      : remote.anbieter === 'gitlab'
        ? `${basis}/projects/${projekt}/issues?state=opened&per_page=5`
        : `${basis}/repos/${eigner}/${repo}/issues?state=open&limit=5&type=issues`

  const [pulls, issues] = await Promise.all([
    holeListe<Rohposten>(pullsUrl, kopf, signal, ms),
    holeListe<Rohposten>(issuesUrl, kopf, signal, ms),
  ])

  const fehler = pulls.fehler ?? issues.fehler
  return {
    anbieter: remote.anbieter,
    eigner,
    repo,
    pulls: pulls.daten.map((roh) => forme(roh, 'pull')).filter((posten): posten is Fernposten => posten !== null),
    // **GitHub liefert Pull Requests auch unter `/issues`.** Ohne diesen Filter stünde jeder Pull
    // Request zweimal in der Liste — einmal als PR, einmal als Issue.
    issues: issues.daten
      .filter((roh) => roh.pull_request === undefined)
      .map((roh) => forme(roh, 'issue'))
      .filter((posten): posten is Fernposten => posten !== null),
    ...(fehler === undefined ? {} : { hinweis: fehler }),
  }
}
