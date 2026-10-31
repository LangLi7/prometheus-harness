/**
 * Hashen, Abdrucke und kanonisches JSON — die gemeinsame Grundlage von
 * Fingerabdruck, Generation und Implementierungsbündel.
 *
 * **Warum das ein eigenes Modul ist.** Drei verschiedene Stellen müssen
 * denselben Byte-Strom für dieselbe Sache erzeugen: der Fingerabdruck einer
 * Generation, der Inhaltsdigest eines Units und der Digest eines
 * Implementierungsbündels. Drei Kopien derselben Hash-Routine wären drei
 * Wahrheiten — und die erste, die jemand später „nur ein bißchen" ändert, macht
 * jedes gespeicherte Bündel unprüfbar.
 *
 * **Was hier NICHT passiert.** Kein Netz, kein Ausführen fremden Codes, kein
 * Verfolgen von Verknüpfungen. Wer einen Dateibaum hasht, hasht ihn so, wie er
 * auf der Platte liegt — Verknüpfungen werden übersprungen, nicht aufgelöst.
 * Ein Unit, das über Symlinks aufbaut, wird damit unvollständig abgedruckt; das
 * ist die sichere Wahl und steht als Grenze im README.
 *
 * @module @prometheus-harness/unit-system/hash
 */

import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { EXPORT_SKIP_DIRECTORIES, EXPORT_SKIP_FILES } from '@prometheus-harness/unit-export'

/** Der Abdruck einer einzelnen Datei: Pfad (immer `/`-getrennt), Größe, SHA-256. */
export interface DateiAbdruck {
  /** Relativ zum Bezugsordner, immer mit `/` als Trenner, nie absolut. */
  readonly path: string
  readonly sha256: string
  readonly size: number
}

/** Voller hexadezimaler SHA-256 eines Byte-Stroms. */
export function sha256Hex(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Dieselbe Zahl, aber in der Form, die dieses Projekt überall schreibt. */
export function digestLabel(hex: string): string {
  return `sha256:${hex}`
}

/** Der SHA-256-Inhalt einer Datei und ihre Größe — beides in einem Durchlauf. */
export async function hashFile(path: string): Promise<{ sha256: string; size: number }> {
  const bytes = await readFile(path)
  return { sha256: sha256Hex(bytes), size: bytes.byteLength }
}

/**
 * Kanonisches JSON.
 *
 * Schlüssel rekursiv nach Code-Einheit sortiert, keine Leerzeichen, UTF-8 ohne
 * BOM. **Absichtlich nicht** `JSON.stringify` mit Einfügereihenfolge: die hängt
 * davon ab, in welcher Reihenfolge ein Objekt gebaut wurde, und zwei Aufrufe mit
 * demselben Inhalt ergäben zwei verschiedene Digests. Ein Digest, der von der
 * Baureihenfolge abhängt, ist kein Digest.
 *
 * `undefined` in einem Objekt fällt weg (wie bei `JSON.stringify`); `undefined`
 * in einer Liste wird zu `null` — es gibt keinen Fall, in dem das gewollt ist,
 * aber es gibt auch keinen, in dem ein stiller Versatz harmlos wäre.
 */
export function kanonisch(value: unknown): string {
  return JSON.stringify(sortiere(value))
}

function sortiere(value: unknown): unknown {
  if (value === undefined || value === null) return null
  if (Array.isArray(value)) return value.map((element) => sortiere(element))
  if (typeof value === 'object') {
    const quelle = value as Record<string, unknown>
    const ziel: Record<string, unknown> = {}
    for (const key of Object.keys(quelle).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
      const element = quelle[key]
      if (element === undefined) continue
      ziel[key] = sortiere(element)
    }
    return ziel
  }
  return value
}

/** Ist dieser Verzeichnisname eines der bekannten Rauschverzeichnisse? */
function istRauschverzeichnis(name: string): boolean {
  return EXPORT_SKIP_DIRECTORIES.includes(name.toLowerCase())
}

/**
 * Sammelt alle Dateien unterhalb von `root` als Abdruck.
 *
 * Sortiert nach Pfad, damit zwei Läufe auf derselben Platte **dieselbe**
 * Reihenfolge liefern — sonst hinge der Inhaltsdigest von der Laune des
 * Dateisystems ab. Verknüpfungen und Sonderdateien werden übersprungen (siehe
 * Dateikopf); Rauschverzeichnisse (`node_modules`, `target`, `.git` …) ebenfalls,
 * weil sie nicht zum Unit gehören und den Digest nur zufällig verändern würden.
 *
 * @param root - der Ordner, dessen Inhalt abgedruckt wird
 * @returns die Abdrücke, stabil sortiert; leer, wenn `root` fehlt
 */
export async function sammleDateien(root: string): Promise<readonly DateiAbdruck[]> {
  const gefunden: DateiAbdruck[] = []

  const lauf = async (ordner: string): Promise<void> => {
    let eintraege
    try {
      eintraege = await readdir(ordner, { withFileTypes: true })
    }
    catch {
      return
    }
    eintraege.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const eintrag of eintraege) {
      const pfad = join(ordner, eintrag.name)
      if (eintrag.isDirectory()) {
        if (istRauschverzeichnis(eintrag.name)) continue
        await lauf(pfad)
        continue
      }
      if (!eintrag.isFile()) continue
      if (EXPORT_SKIP_FILES.includes(eintrag.name)) continue
      const { sha256, size } = await hashFile(pfad)
      gefunden.push({ path: zuPosix(relative(root, pfad)), sha256, size })
    }
  }

  if (!(await istOrdner(root))) return []
  await lauf(root)
  gefunden.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return gefunden
}

/** Wandelt einen Betriebssystem-Pfad in die Form, die in Bündeln steht. */
export function zuPosix(pfad: string): string {
  return pfad.split('\\').join('/')
}

async function istOrdner(pfad: string): Promise<boolean> {
  try {
    return (await stat(pfad)).isDirectory()
  }
  catch {
    return false
  }
}

/**
 * Der Inhaltsdigest eines Units aus seinen Dateiabdrücken.
 *
 * Die Zeile je Datei ist **byte-gleich** mit `computeContentDigest` aus
 * `unit-export`: `unit \u0000 path \u0000 sha256 \n`, eingeleitet von
 * `unit-content-1\n`. Damit hat ein Unit denselben Inhaltsdigest, egal ob es in
 * einem Bündel oder in einer Generation steht — und ein Vergleich zwischen beiden
 * ist eine Aussage und keine Ähnlichkeit.
 *
 * Der Unit-Name steht mit in der Zeile, obwohl er für einen einzelnen Unit
 * konstant ist: sonst wäre die Rechnung nicht dieselbe wie die des Bündels, und
 * genau das ist der Punkt.
 */
export function inhaltsDigest(unit: string, dateien: readonly DateiAbdruck[]): string {
  const zeilen = dateien
    .map((datei) => `${unit}\u0000${datei.path}\u0000${datei.sha256}\n`)
    .join('')
  return digestLabel(sha256Hex(`unit-content-1\n${zeilen}`))
}
