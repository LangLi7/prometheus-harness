/**
 * `@prometheus-harness/skill-marketplace/remote` — Quellen holen.
 *
 * **Was als Quelle gilt.** Ein lokales Verzeichnis, ein GitHub-Kürzel
 * (`owner/repo`), eine GitHub-URL oder eine beliebige Archiv-URL. Alles andere
 * wird abgelehnt, statt geraten.
 *
 * **Warum GitHub über `codeload` und nicht über `git clone`.** `git` ist eine
 * Zusatzabhängigkeit, `codeload` ist eine HTTPS-Adresse. Der Installer soll dort
 * funktionieren, wo ein Browser funktioniert.
 *
 * **Die Grenze.** Es gibt keinen stillen Fallback auf einen anderen Branch: erst
 * der gemeldete Standardbranch, dann `main`, dann `master`. Scheitern alle drei,
 * scheitert der Aufruf mit dem letzten Fehler.
 *
 * @module @prometheus-harness/skill-marketplace/remote
 */

import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { chmod } from 'node:fs/promises'

import { extractTarGz, extractZip, stripTopLevel, type ArchiveEntry } from './archive.ts'
import { MarketplaceError, type SourceSpec } from './types.ts'

/** Höchstgröße eines Downloads. Skills mit Video- oder Font-Assets liegen darüber. */
const MAX_DOWNLOAD_BYTES = 160 * 1024 * 1024

/** Zeitlimit eines Downloads. */
const DOWNLOAD_TIMEOUT_MS = 60_000

/** Ein geholtes Repository. */
export interface FetchedRepository {
  readonly repo: string
  readonly ref: string
  readonly entries: readonly ArchiveEntry[]
}

/**
 * Liest eine Quellenangabe von der Kommandozeile.
 *
 * @param input - `./pfad`, `owner/repo`, `owner/repo@ref`, GitHub-URL oder Archiv-URL
 * @returns die Quelle
 * @throws MarketplaceError bei unbrauchbarer Angabe
 */
export function parseSourceSpec(input: string): SourceSpec {
  const value = input.trim()
  if (value === '') throw new MarketplaceError('Quelle ist leer')

  const githubUrl = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/?#]+))?(?:[#?].*)?$/.exec(value)
  if (githubUrl !== null) {
    const owner = githubUrl[1]
    const repo = githubUrl[2]
    if (owner === undefined || repo === undefined) throw new MarketplaceError(`GitHub-URL unbrauchbar: ${input}`)
    const ref = githubUrl[3]
    return { kind: 'github', repo: `${owner}/${repo}`, ...(ref === undefined ? {} : { ref }) }
  }

  if (/^https?:\/\//.test(value)) return { kind: 'url', url: value }

  const shorthand = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:@([^\s]+))?$/.exec(value)
  if (shorthand !== null && !value.startsWith('.')) {
    const owner = shorthand[1]
    const repo = shorthand[2]
    const ref = shorthand[3]
    if (owner === undefined || repo === undefined) throw new MarketplaceError(`Quelle unbrauchbar: ${input}`)
    return { kind: 'github', repo: `${owner}/${repo}`, ...(ref === undefined ? {} : { ref }) }
  }

  return { kind: 'path', path: resolve(value) }
}

/**
 * Zerlegt `owner/repo`.
 *
 * @param repo - das Kürzel
 * @returns Besitzer und Repository
 */
export function splitRepo(repo: string): { owner: string; name: string } {
  const [owner, name, ...rest] = repo.split('/')
  if (owner === undefined || name === undefined || owner === '' || name === '' || rest.length > 0) {
    throw new MarketplaceError(`Repository muss "owner/repo" sein: ${repo}`)
  }
  return { owner, name }
}

/**
 * Holt ein GitHub-Repository als Archiv.
 *
 * @param repo - `owner/repo`
 * @param ref - Branch, Tag oder SHA; ohne Angabe der Standardbranch
 * @returns Branch und Einträge ohne oberstes Verzeichnis
 */
export async function fetchGitHubRepository(repo: string, ref?: string): Promise<FetchedRepository> {
  const { owner, name } = splitRepo(repo)
  const candidates = ref === undefined ? await branchCandidates(owner, name) : [ref]
  const errors: string[] = []
  for (const candidate of candidates) {
    const url = `https://codeload.github.com/${owner}/${name}/tar.gz/${encodeURIComponent(candidate)}`
    try {
      const buffer = await download(url)
      return { repo, ref: candidate, entries: stripTopLevel(extractTarGz(buffer)) }
    } catch (error) {
      errors.push(`${candidate}: ${messageOf(error)}`)
    }
  }
  throw new MarketplaceError(`Repository ${repo} konnte nicht geladen werden (${errors.join('; ')})`)
}

/**
 * Holt eine Archiv-URL und entpackt sie nach Endung.
 *
 * @param url - die Adresse
 * @returns die Einträge
 */
export async function fetchArchive(url: string): Promise<readonly ArchiveEntry[]> {
  const buffer = await download(url)
  const pathname = new URL(url).pathname.toLowerCase()
  if (pathname.endsWith('.zip')) return stripTopLevel(extractZip(buffer))
  if (pathname.endsWith('.tar.gz') || pathname.endsWith('.tgz')) return stripTopLevel(extractTarGz(buffer))
  throw new MarketplaceError(`Unbekanntes Archivformat: ${pathname}`)
}

/**
 * Lädt eine Adresse mit Größen- und Zeitgrenze.
 *
 * @param url - die Adresse
 * @returns die Bytes
 */
export async function download(url: string): Promise<Buffer> {
  let response: Response
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      headers: { 'accept': 'application/vnd.github+json, application/octet-stream, */*' },
    })
  } catch (error) {
    throw new MarketplaceError(`Download fehlgeschlagen (${url}): ${messageOf(error)}`)
  }
  if (!response.ok) throw new MarketplaceError(`Download fehlgeschlagen (${url}): HTTP ${response.status}`)
  const length = Number(response.headers.get('content-length') ?? '0')
  if (length > MAX_DOWNLOAD_BYTES) throw new MarketplaceError(`Download zu groß: ${length} Bytes`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_DOWNLOAD_BYTES) throw new MarketplaceError(`Download zu groß: ${buffer.length} Bytes`)
  return buffer
}

/**
 * Schreibt Archiveinträge in ein Verzeichnis.
 *
 * @param entries - die Einträge
 * @param target - das Zielverzeichnis
 */
export async function materialize(entries: readonly ArchiveEntry[], target: string): Promise<void> {
  for (const entry of entries) {
    const destination = join(target, ...entry.path.split('/'))
    const inside = relative(target, destination)
    if (inside.startsWith('..') || inside.includes(`..${sep}`)) {
      throw new MarketplaceError(`Eintrag bricht aus dem Ziel aus: ${entry.path}`)
    }
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, entry.data)
    if (entry.mode !== undefined && (entry.mode & 0o111) !== 0) {
      await chmod(destination, 0o755).catch(() => {
        // Windows kennt kein Ausführbar-Bit; das ist kein Fehler.
      })
    }
  }
}

/**
 * Kopiert einen Verzeichnisbaum, ohne `.git` und ohne Abhängigkeiten.
 *
 * @param from - Quelle
 * @param to - Ziel
 */
export async function copyTree(from: string, to: string): Promise<void> {
  const source = resolve(from)
  const target = resolve(to)
  if (source === target) return
  await mkdir(target, { recursive: true })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const child = join(source, entry.name)
    const destination = join(target, entry.name)
    if (entry.isDirectory()) await copyTree(child, destination)
    else if (entry.isFile()) await writeFile(destination, await readFile(child))
  }
}

/**
 * Führt eine Aufgabe in einem temporären Verzeichnis aus und räumt danach auf.
 *
 * @param task - die Aufgabe
 * @returns ihr Ergebnis
 */
export async function withTempDir<T>(task: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'pmh-marketplace-'))
  try {
    return await task(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/**
 * Ob ein Pfad ein Verzeichnis ist.
 *
 * @param path - der Pfad
 * @returns ob es ein Verzeichnis gibt
 */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function branchCandidates(owner: string, name: string): Promise<string[]> {
  const declared = await defaultBranch(owner, name)
  const candidates = declared === undefined ? ['main', 'master'] : [declared, 'main', 'master']
  return [...new Set(candidates)]
}

async function defaultBranch(owner: string, name: string): Promise<string | undefined> {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'prometheus-harness' },
    })
    if (!response.ok) return undefined
    const data = (await response.json()) as { default_branch?: unknown }
    return typeof data.default_branch === 'string' && data.default_branch !== '' ? data.default_branch : undefined
  } catch {
    return undefined
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
