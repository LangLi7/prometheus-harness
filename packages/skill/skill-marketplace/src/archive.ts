/**
 * `@prometheus-harness/skill-marketplace/archive` — Archive lesen, ohne fremdes Programm.
 *
 * **Warum eigener Code statt `tar`/`unzip`.** Ein Installer, der ein
 * Systemprogramm aufruft, hängt an dessen Vorhandensein und an seiner
 * Argument Syntax. `tar.gz` und `zip` sind hier zwei klar begrenzte Formate; sie
 * zu lesen kostet weniger, als sie zu starten — und es funktioniert auf Windows
 * ohne Zusatzinstallation.
 *
 * **Die Sicherheitsregel.** Jeder Pfad wird normalisiert und geprüft: keine
 * absoluten Pfade, kein `..`, keine Laufwerksbuchstaben. Ein Archiv, das aus seinem
 * Ziel ausbrechen will, wird abgelehnt — nicht bereinigt.
 *
 * @module @prometheus-harness/skill-marketplace/archive
 */

import { gunzipSync, inflateRawSync } from 'node:zlib'

import { MarketplaceError } from './types.ts'

/** Ein Eintrag aus einem Archiv. */
export interface ArchiveEntry {
  /** Normalisierter relativer Pfad mit `/`. */
  readonly path: string
  readonly data: Buffer
  /** Unix-Modus, wenn das Archiv ihn trägt. */
  readonly mode?: number
}

/** Höchstzahl Einträge — ein Schutz gegen Archiv-Bomben. */
const MAX_ENTRIES = 20_000

/**
 * Liest ein `tar.gz`.
 *
 * @param buffer - die komprimierten Bytes
 * @returns die Dateien ohne Verzeichnisse und Verknüpfungen
 */
export function extractTarGz(buffer: Buffer): ArchiveEntry[] {
  let tar: Buffer
  try {
    tar = gunzipSync(buffer)
  } catch (error) {
    throw new MarketplaceError(`Archiv ist kein gültiges gzip: ${messageOf(error)}`)
  }
  return extractTar(tar)
}

/**
 * Liest ein unkomprimiertes `tar`.
 *
 * @param tar - die Bytes
 * @returns die Dateien
 */
export function extractTar(tar: Buffer): ArchiveEntry[] {
  const entries: ArchiveEntry[] = []
  let offset = 0
  let pendingName: string | undefined
  let pendingSize: number | undefined

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (isZeroBlock(header)) break

    const name = cString(header, 0, 100)
    const mode = parseOctal(header, 100, 8)
    const size = parseOctal(header, 124, 12)
    const type = String.fromCharCode(header[156] ?? 0)
    const prefix = cString(header, 345, 155)
    const dataStart = offset + 512
    const dataEnd = dataStart + size
    if (dataEnd > tar.length) throw new MarketplaceError('Archiv endet mitten in einem Eintrag')

    if (type === 'L') {
      pendingName = cString(tar.subarray(dataStart, dataEnd), 0, size)
    } else if (type === 'x') {
      const pax = parsePax(tar.subarray(dataStart, dataEnd))
      if (pax['path'] !== undefined) pendingName = pax['path']
      if (pax['size'] !== undefined) pendingSize = Number(pax['size'])
    } else if (type === 'g') {
      // Globale pax-Angaben ändern keine Pfade; sie werden bewusst ignoriert.
    } else if (type === '0' || type === '\u0000' || type === '7') {
      const declared = pendingName ?? (prefix === '' ? name : `${prefix}/${name}`)
      const finalSize = pendingSize ?? size
      const finalEnd = dataStart + finalSize
      if (finalEnd > tar.length) throw new MarketplaceError('Archiv endet mitten in einem Eintrag')
      entries.push({
        path: safePath(declared),
        data: Buffer.from(tar.subarray(dataStart, finalEnd)),
        ...(Number.isFinite(mode) && mode > 0 ? { mode } : {}),
      })
      pendingName = undefined
      pendingSize = undefined
      if (entries.length > MAX_ENTRIES) throw new MarketplaceError('Archiv enthält zu viele Einträge')
      offset = dataStart + roundUp(finalSize, 512)
      continue
    }

    if (type === 'L' || type === 'x') {
      offset = dataStart + roundUp(size, 512)
    } else {
      offset = dataStart + roundUp(size, 512)
    }
  }
  return entries
}

/**
 * Liest ein `zip`.
 *
 * @param buffer - die Bytes
 * @returns die Dateien
 */
export function extractZip(buffer: Buffer): ArchiveEntry[] {
  const eocd = findEndOfCentralDirectory(buffer)
  if (eocd === undefined) throw new MarketplaceError('ZIP ohne zentrales Verzeichnis')
  const count = buffer.readUInt16LE(eocd + 10)
  const centralOffset = buffer.readUInt32LE(eocd + 16)
  if (count > MAX_ENTRIES) throw new MarketplaceError('ZIP enthält zu viele Einträge')

  const entries: ArchiveEntry[] = []
  let offset = centralOffset
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > buffer.length) break
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break
    const flags = buffer.readUInt16LE(offset + 8)
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const externalAttributes = buffer.readUInt32LE(offset + 38)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString(flags & 0x800 ? 'utf8' : 'latin1')

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new MarketplaceError('ZIP64 wird nicht unterstützt')
    }

    if (!name.endsWith('/')) {
      const localNameLength = buffer.readUInt16LE(localOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localOffset + 28)
      const dataStart = localOffset + 30 + localNameLength + localExtraLength
      const raw = buffer.subarray(dataStart, dataStart + compressedSize)
      const data =
        method === 0
          ? Buffer.from(raw)
          : method === 8
            ? inflateRawSync(raw)
            : (() => {
                throw new MarketplaceError(`ZIP-Kompression ${method} wird nicht unterstützt`)
              })()
      const unixMode = (externalAttributes >>> 16) & 0xffff
      entries.push({
        path: safePath(name),
        data,
        ...(unixMode === 0 ? {} : { mode: unixMode }),
      })
    }

    offset += 46 + nameLength + extraLength + commentLength
    if (entries.length > MAX_ENTRIES) throw new MarketplaceError('ZIP enthält zu viele Einträge')
  }
  return entries
}

/**
 * Entfernt das gemeinsame oberste Verzeichnis eines Archivs.
 *
 * GitHub-Archive liegen immer in `<repo>-<ref>/`; ohne diesen Schritt hieße jedes
 * installierte Plugin so.
 *
 * @param entries - die Einträge
 * @returns Einträge ohne die gemeinsame Wurzel
 */
export function stripTopLevel(entries: readonly ArchiveEntry[]): ArchiveEntry[] {
  if (entries.length === 0) return []
  const roots = new Set(entries.map((entry) => entry.path.split('/')[0] ?? ''))
  if (roots.size !== 1) return [...entries]
  const root = [...roots][0]
  if (root === undefined || root === '') return [...entries]
  if (!entries.every((entry) => entry.path.startsWith(`${root}/`))) return [...entries]
  return entries.map((entry) => ({ ...entry, path: entry.path.slice(root.length + 1) }))
}

/**
 * Prüft und normalisiert einen Archivpfad.
 *
 * @param path - Rohpfad aus dem Archiv
 * @returns der sichere relative Pfad
 * @throws MarketplaceError bei Ausbruchsversuch
 */
export function safePath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new MarketplaceError(`Archivpfad ist absolut: ${path}`)
  }
  const parts: string[] = []
  for (const part of normalized.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') throw new MarketplaceError(`Archivpfad bricht aus: ${path}`)
    parts.push(part)
  }
  if (parts.length === 0) throw new MarketplaceError('Archivpfad ist leer')
  return parts.join('/')
}

function findEndOfCentralDirectory(buffer: Buffer): number | undefined {
  const minimum = Math.max(0, buffer.length - 66_000)
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset
  }
  return undefined
}

function isZeroBlock(block: Buffer): boolean {
  for (const byte of block) if (byte !== 0) return false
  return true
}

function cString(buffer: Buffer, offset: number, length: number): string {
  const slice = buffer.subarray(offset, offset + length)
  const end = slice.indexOf(0)
  return slice.subarray(0, end === -1 ? slice.length : end).toString('utf8')
}

function parseOctal(buffer: Buffer, offset: number, length: number): number {
  const text = cString(buffer, offset, length).trim()
  const value = Number.parseInt(text === '' ? '0' : text, 8)
  return Number.isFinite(value) ? value : 0
}

function parsePax(buffer: Buffer): Record<string, string> {
  const result: Record<string, string> = {}
  let offset = 0
  while (offset < buffer.length) {
    const space = buffer.indexOf(0x20, offset)
    if (space === -1) break
    const length = Number.parseInt(buffer.subarray(offset, space).toString('utf8'), 10)
    if (!Number.isFinite(length) || length <= 0) break
    const record = buffer.subarray(space + 1, offset + length - 1).toString('utf8')
    const equals = record.indexOf('=')
    if (equals > 0) result[record.slice(0, equals)] = record.slice(equals + 1)
    offset += length
  }
  return result
}

function roundUp(value: number, unit: number): number {
  return Math.ceil(value / unit) * unit
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
