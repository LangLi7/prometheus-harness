/**
 * Das Unit-Bündel: **eine** Datei, die ein Unit plus seinen Abhängigkeitsabschluss trägt.
 *
 * ## Containerformat (`PMHUNITB`), Format 1
 *
 * Ein Bündel ist eine Folge aus Kopfzeile, Manifest und Nutzlast — keine
 * Kompression, keine Fremdbibliothek, keine Struktur, die nur ein bestimmter
 * Packer lesen kann. Wer das hier liest, kann es in einer anderen Sprache in
 * wenigen Zeilen nachbauen (`README.md`, „Bündelformat").
 *
 * ```
 * Offset  Länge  Inhalt
 *      0      8  Magic  "PMHUNITB" (ASCII)
 *      8      1  Trenner "\n" (0x0A)
 *      9     12  Formatversion, ASCII-Dezimal, 12 Stellen, führende Nullen
 *     21      1  Leerzeichen (0x20)
 *     22     12  Länge des Manifests in Bytes, ASCII-Dezimal, 12 Stellen
 *     34      1  Leerzeichen (0x20)
 *     35     12  Länge der Nutzlast in Bytes, ASCII-Dezimal, 12 Stellen
 *     47      1  Leerzeichen (0x20)
 *     48     12  Länge von H1, ASCII-Dezimal, 12 Stellen — immer `000000000012`
 *     60      1  Leerzeichen (0x20)
 *     61      1  Trenner "\n" (0x0A)
 *     62      4  reserviert, vier Leerzeichen (0x20)
 *     66      L  Manifest: UTF-8 JSON, ohne BOM, kanonisch serialisiert
 *   66+L     12  H1: die ersten 12 hexadezimalen ASCII-Zeichen des SHA-256 über
 *                 die kanonischen Manifest-Bytes (mit Platzhalter in `digest`)
 *                Nutzlast: die Dateiinhalte, in der Reihenfolge von manifest.files
 * ```
 *
 * Die Kopfzeile ist damit **genau 66 Bytes** lang. Die Zahlenfelder sind
 * fest breit, damit ein Leser sie ohne Suche schneiden kann. `H1` bindet die
 * Manifest-Bytes: wer das Manifest ändert, kann die Kopfzeile nicht
 * unverändert lassen, ohne dass es auffällt.
 *
 * ## Nutzlast
 *
 * Die Nutzlast ist die Verkettung aller Dateiinhalte in der Reihenfolge von
 * `manifest.files`. Jeder Eintrag nennt `offset` (Bytes ab Beginn der
 * Nutzlast), `size` und `sha256` (voller Hex-Digest). Es gibt kein Padding und
 * keine Ausrichtung: `offset[i+1] = offset[i] + size[i]`, geprüft beim Lesen.
 *
 * ## Digest
 *
 * Zwei Digestwerte, beide stabil über alle Plattformen und beide aus der
 * geschriebenen Datei **allein** nachrechenbar:
 *
 *  - **Bündeldigest** = `sha256:` + SHA-256 über
 *    `"PMHUNITB\n1\n" + H1 + H2 + "\n"`, wobei `H2` der volle Hex-Digest
 *    (64 Zeichen) über die Nutzlast ist und `H1` der volle Hex-Digest über die
 *    **kanonischen Manifest-Bytes mit Platzhalter im Feld `digest`**
 *    ({@link DIGEST_PLACEHOLDER}). Der Platzhalter steht dort, weil ein Digest
 *    sich nicht selbst enthalten kann; er ist genauso lang wie der fertige
 *    Wert. Nachrechnen heißt also: Manifest aus der Datei lesen, `digest` auf
 *    den Platzhalter setzen, kanonisch serialisieren, rechnen. Der Digest
 *    deckt damit jede Datei, jede Größe, jeden Hash und jedes eingebettete
 *    Unit-Manifest ab, ohne von der Serialisierungs-Laune eines Schreibers
 *    abzuhängen.
 *  - **Inhaltsdigest** = `sha256:` + SHA-256 über
 *    `"unit-content-1\n" + für jede Datei in der Reihenfolge des Manifests
 *    "unit\u0000path\u0000sha256\n"`. Er hängt **nicht** an Zeitstempeln,
 *    Quellpfaden oder Exportwerkzeug und ist deshalb die Größe, mit der zwei
 *    Bündel desselben Inhalts verglichen werden.
 *
 * `manifest.digest` trägt den Bündeldigest; `manifest.contentDigest` den
 * Inhaltsdigest. Beide werden beim Import nachgerechnet.
 */

import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

import { unitError, type UnitError } from './errors.ts'
import { directoryNameFor, parseManifest, serializeManifest, type UnitKind, type UnitManifest } from './manifest.ts'
import { findUnit, type Registry } from './registry.ts'

/** Magic der Containerdatei. */
export const BUNDLE_MAGIC = 'PMHUNITB'

/** Die höchste Formatversion, die dieses Paket schreibt und liest. */
export const BUNDLE_FORMAT = 1

/** Länge der Kopfzeile in Bytes. */
export const BUNDLE_HEADER_BYTES = 66

/** Dateiendung eines Bündels. */
export const BUNDLE_EXTENSION = '.pmhunit'

/** Dateien, die nie in ein Bündel wandern: sie beschreiben die Installation, nicht die Unit. */
export const EXPORT_SKIP_FILES: readonly string[] = ['.pmh-export.json', '.pmh-export', 'unit-export.json']

/** Verzeichnisse, die nie in ein Bündel wandern. */
export const EXPORT_SKIP_DIRECTORIES: readonly string[] = [
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'target',
  'dist',
  'build',
  '.venv',
  '__pycache__',
]

/** Eine Datei im Bündel. */
export interface BundleFile {
  /** Name des Units, dem die Datei gehört. */
  readonly unit: string
  /** Pfad **innerhalb** des Unit-Ordners, immer mit `/`, nie absolut. */
  readonly path: string
  readonly size: number
  /** Voller Hex-SHA-256 des Inhalts. */
  readonly sha256: string
  /** Byte-Offset in der Nutzlast. */
  readonly offset: number
}

/** Ein Unit im Bündel, ohne den Dateibaum. */
export interface BundleUnit {
  readonly name: string
  readonly version: string
  readonly kind: UnitKind
  /** Die geprüfte Deklaration, wie sie im Bündel liegt. */
  readonly manifest: UnitManifest
}

/** Das Bündelmanifest (`manifest.json` innerhalb des Containers). */
export interface BundleManifest {
  readonly format: number
  readonly createdAt: string
  readonly createdBy: string
  readonly source: { readonly unit: string; readonly version: string }
  /** Startpunkt des Bündels; bei Services der `entry.command`. */
  readonly entrypoint: string
  readonly units: readonly BundleUnit[]
  readonly files: readonly BundleFile[]
  /** Abhängigkeitsabschluss einschließlich des Units selbst. */
  readonly closure: readonly string[]
  readonly digest: string
  readonly contentDigest: string
  readonly payloadBytes: number
}

/** Ein gelesenes Bündel: Manifest plus Nutzlast. */
export interface LoadedBundle {
  readonly manifest: BundleManifest
  readonly payload: Buffer
  /** Der eingebettete Digest aus `manifest.digest`. */
  readonly digest: string
  /** Der aus den Bytes nachgerechnete Digest. */
  readonly computedDigest: string
}

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function prefix(text: string, length: number): string {
  return text.slice(0, length)
}

/**
 * Sortiert zwei Zeichenketten nach Code-Einheit — bewusst **nicht**
 * `localeCompare`. Die Reihenfolge der Dateien in der Nutzlast muss auf jedem
 * Rechner dieselbe sein, sonst ist der Digest nicht reproduzierbar.
 */
function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** `sha256:…` — die Anzeigeform eines Digests. */
export function digestLabel(hex: string): string {
  return `sha256:${hex}`
}

/** Der Platzhalter, über den der Digest gerechnet wird. */
export const DIGEST_PLACEHOLDER = 'sha256:0000000000000000000000000000000000000000000000000000000000000000'

/** Rechnet den Bündeldigest aus den beiden Komponenten-Digests. */
export function computeBundleDigest(manifestBytes: Uint8Array, payload: Uint8Array): string {
  const h1 = sha256Hex(manifestBytes)
  const h2 = sha256Hex(payload)
  return digestLabel(sha256Hex(Buffer.from(`${BUNDLE_MAGIC}\n${BUNDLE_FORMAT}\n${h1}${h2}\n`, 'utf8')))
}

/**
 * Rechnet den Bündeldigest aus einem Manifest und der Nutzlast.
 *
 * Der Digest deckt **alles** ab: die kanonischen Manifest-Bytes mit einem
 * Platzhalter an der Stelle von `digest` und die Nutzlast. Der Platzhalter
 * steht dort, weil ein Digest sich nicht selbst enthalten kann; er ist genau
 * so lang wie der fertige Wert, damit das Ergebnis dieselbe Länge hat.
 *
 * Weil nur der *Platzhalter* eingeht, ist der Digest aus der Datei allein
 * nachrechenbar: Manifest lesen, `digest` auf den Platzhalter setzen,
 * kanonisch serialisieren, rechnen. Es gibt keine Reihenfolge-Abhängigkeit
 * und keinen Wert, der in seine eigene Berechnung eingeht.
 */
export function bundleDigestOf(manifest: BundleManifest, payload: Uint8Array): string {
  const bytes = Buffer.from(serializeBundleManifest({ ...manifest, digest: DIGEST_PLACEHOLDER }), 'utf8')
  return computeBundleDigest(bytes, payload)
}

/** Rechnet den Inhaltsdigest einer Dateiliste. */
export function computeContentDigest(files: readonly BundleFile[]): string {
  const lines = files.map((file) => `${file.unit}\u0000${file.path}\u0000${file.sha256}\n`).join('')
  return digestLabel(sha256Hex(Buffer.from(`unit-content-1\n${lines}`, 'utf8')))
}

/**
 * Prüft einen Pfad **innerhalb** eines Bündels.
 *
 * Das ist die Sicherheitsgrenze: ein Bündel ist Fremddaten. Verlangt wird
 *  - ein relativer Pfad mit `/` als Trenner (kein `\`, kein `C:`, kein `//`),
 *  - kein Null-Byte, kein leeres Segment, kein `.`/`..`,
 *  - je Segment: kein reservierter Windows-Gerätename, kein Punkt oder
 *    Leerzeichen am Ende, keine der Zeichen `<>:"|?*`,
 *  - kein Laufwerksbuchstabe und kein UNC-Präfix am Anfang.
 *
 * Die Prüfung ist bewusst strenger als nötig: sie soll plattformunabhängig
 * dieselben Bytes ablehnen, damit ein Bündel nicht auf Windows etwas anderes
 * bedeutet als auf Linux.
 */
export function validateRelativePath(path: string, at = 'bundle:path'): readonly UnitError[] {
  const errors: UnitError[] = []
  const push = (code: Parameters<typeof unitError>[0], message: string): void => {
    errors.push(unitError(code, message, at))
  }

  if (path.length === 0) {
    push('path_empty', 'Der Pfad ist leer.')
    return errors
  }
  if (path.length > 1024) {
    push('path_too_long', 'Der Pfad ist länger als 1024 Zeichen.')
  }
  if (path.includes('\u0000')) {
    push('path_nul_byte', 'Der Pfad enthält ein Null-Byte.')
  }
  if (path.includes('\\')) {
    push('path_backslash', 'Der Pfad enthält einen Backslash; im Bündel ist "/" der Trenner.')
  }
  if (path.startsWith('/')) {
    push('path_absolute', 'Der Pfad ist absolut.')
  }
  if (path.startsWith('//') || path.startsWith('\\\\')) {
    push('path_unc', 'Der Pfad ist ein UNC-Pfad.')
  }
  if (/^[A-Za-z]:/.test(path)) {
    push('path_drive_letter', 'Der Pfad beginnt mit einem Laufwerksbuchstaben.')
  }
  if (!path.startsWith('/') && resolve('/').startsWith(resolve(path))) {
    push('path_escape', 'Der Pfad zeigt aus dem Ablageordner heraus.')
  }

  const segments = path.split('/')
  segments.forEach((segment, index) => {
    if (segment.length === 0) {
      push('path_empty_segment', `Segment ${index} ist leer (doppelter Schrägstrich oder Abschluss-Schrägstrich).`)
      return
    }
    if (segment === '.' || segment === '..') {
      push('path_traversal', `Segment ${index} ist "${segment}".`)
    }
    if (/[<>:"|?*]/.test(segment)) {
      push('path_empty_segment', `Segment "${segment}" enthält ein für Windows unzulässiges Zeichen.`)
    }
    if (segment.endsWith('.') || segment.endsWith(' ')) {
      push('path_segment_trailing_dot', `Segment "${segment}" endet mit Punkt oder Leerzeichen.`)
    }
    const deviceCandidate = (segment.split('.')[0] ?? segment).toLowerCase()
    if (['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'].includes(deviceCandidate)) {
      push('path_segment_reserved_device', `Segment "${segment}" ist ein reservierter Windows-Gerätename.`)
    }
  })

  if (errors.length === 0) {
    // Letzte Kontrolle: der zusammengesetzte Pfad muss im Zielordner bleiben.
    const root = resolve('/pmh-unit-root')
    const combined = resolve(root, path)
    if (combined !== root && !combined.startsWith(root + sep)) {
      push('path_escape', 'Der zusammengesetzte Pfad verlässt den Zielordner.')
    }
  }

  return errors
}

/** Ein Dateieintrag, bevor Offsets und Hashes berechnet sind. */
interface StagedFile {
  readonly unit: string
  readonly path: string
  readonly bytes: Buffer
}

async function collectUnitFiles(
  directory: string,
  unitName: string,
  includes: readonly string[],
): Promise<StagedFile[]> {
  const root = resolve(directory)
  const staged: StagedFile[] = []
  const explicit = new Set(includes.map((entry) => entry.replace(/\\/g, '/')))

  const walk = async (current: string): Promise<void> => {
    const entries = (await readdir(current, { withFileTypes: true })).sort((a, b) => byName(a.name, b.name))
    for (const entry of entries) {
      const absolute = join(current, entry.name)
      const relativePath = relative(root, absolute).split(sep).join('/')
      if (entry.isDirectory()) {
        if (EXPORT_SKIP_DIRECTORIES.includes(entry.name.toLowerCase())) continue
        await walk(absolute)
        continue
      }
      if (!entry.isFile()) continue
      if (EXPORT_SKIP_FILES.includes(entry.name) && !explicit.has(relativePath)) continue
      staged.push({ unit: unitName, path: relativePath, bytes: await readFile(absolute) })
    }
  }

  await walk(root)
  for (const extra of includes) {
    const normalized = extra.replace(/\\/g, '/')
    if (staged.some((file) => file.path === normalized)) continue
    staged.push({ unit: unitName, path: normalized, bytes: await readFile(join(root, normalized)) })
  }
  return staged
}

/** Ein zusammengestelltes Bündel. */
export interface BuiltBundle {
  readonly manifest: BundleManifest
  readonly payload: Buffer
}

/** Optionen für {@link buildBundle}. */
export interface BuildBundleOptions {
  /** Zeitstempel des Bündels; Default: jetzt. Fest setzbar für reproduzierbare Läufe. */
  readonly createdAt?: string
  /** Werkzeugkennung, Default `@prometheus-harness/unit-export`. */
  readonly createdBy?: string
  /** Zusätzliche Dateien (relativ zum Unit-Ordner), die sonst übersprungen würden. */
  readonly include?: readonly string[]
}

/**
 * Stellt aus einem Unit und seinen aufgelösten Abhängigkeiten **ein** Bündel zusammen.
 *
 * Die Reihenfolge der Units ist die der übergebenen Liste (das Unit selbst
 * zuerst), die Reihenfolge der Dateien ist je Unit sortiert — damit ist die
 * Nutzlast deterministisch und zwei Bündel desselben Standes sind byte-gleich,
 * wenn `createdAt` festgehalten wird.
 */
export async function buildBundle(
  root: UnitManifest,
  rootDirectory: string,
  dependencies: readonly { readonly manifest: UnitManifest; readonly directory: string }[],
  options: BuildBundleOptions = {},
): Promise<BuiltBundle> {
  const includes = options.include ?? []
  const groups: { readonly manifest: UnitManifest; readonly directory: string }[] = [
    { manifest: root, directory: rootDirectory },
    ...dependencies,
  ]

  const staged: StagedFile[] = []
  for (const group of groups) {
    const files = await collectUnitFiles(group.directory, group.manifest.name, group.manifest.name === root.name ? includes : [])
    files.sort((a, b) => byName(a.path, b.path))
    staged.push(...files)
  }
  staged.sort((a, b) => byName(a.unit, b.unit) ||byName(a.path, b.path))

  const files: BundleFile[] = []
  let offset = 0
  for (const file of staged) {
    files.push({ unit: file.unit, path: file.path, size: file.bytes.byteLength, sha256: sha256Hex(file.bytes), offset })
    offset += file.bytes.byteLength
  }

  const payload = Buffer.concat(staged.map((file) => file.bytes))
  const closure = [root.name, ...dependencies.map((dependency) => dependency.manifest.name)]
  const contentDigest = computeContentDigest(files)

  // Digest zweistufig: erst das Manifest ohne `digest`, dann mit.
  const draft: Omit<BundleManifest, 'digest' | 'contentDigest'> = {
    format: BUNDLE_FORMAT,
    createdAt: options.createdAt ?? new Date().toISOString(),
    createdBy: options.createdBy ?? '@prometheus-harness/unit-export',
    source: { unit: root.name, version: root.version },
    entrypoint: root.entry?.command ?? `units/${directoryNameFor(root.name)}`,
    units: groups.map((group) => ({
      name: group.manifest.name,
      version: group.manifest.version,
      kind: group.manifest.kind,
      manifest: group.manifest,
    })),
    files,
    closure,
    payloadBytes: payload.byteLength,
  }
  // Der Digest wird über die kanonischen Manifest-Bytes mit **Platzhalter**
  // und über die Nutzlast gerechnet. Er hängt damit an keinem Wert, der in
  // seine eigene Berechnung eingeht, und ist aus der geschriebenen Datei
  // allein nachrechenbar: `encodeBundle` serialisiert kanonisch, und die
  // kanonische Form hängt nicht davon ab, über welchen Weg das Manifest
  // entstanden ist.
  const manifestWithPlaceholder: BundleManifest = { ...draft, contentDigest, digest: DIGEST_PLACEHOLDER }
  const digest = bundleDigestOf(manifestWithPlaceholder, payload)
  return { manifest: { ...manifestWithPlaceholder, digest }, payload }
}

/**
 * Serialisiert das Bündelmanifest kanonisch.
 *
 * Kanonisch heißt: feste Schlüsselreihenfolge, keine Leerzeichen, `\n` statt
 * Plattform-Zeilenende. Zwei Implementierungen, die dasselbe Bündel schreiben,
 * erzeugen dieselben Bytes.
 */
export function serializeBundleManifest(manifest: BundleManifest): string {
  return JSON.stringify({
    format: manifest.format,
    createdAt: manifest.createdAt,
    createdBy: manifest.createdBy,
    source: { unit: manifest.source.unit, version: manifest.source.version },
    entrypoint: manifest.entrypoint,
    units: manifest.units.map((unit) => ({
      name: unit.name,
      version: unit.version,
      kind: unit.kind,
      manifest: JSON.parse(serializeManifest(unit.manifest)) as unknown,
    })),
    files: manifest.files.map((file) => ({
      unit: file.unit,
      path: file.path,
      size: file.size,
      sha256: file.sha256,
      offset: file.offset,
    })),
    closure: [...manifest.closure],
    contentDigest: manifest.contentDigest,
    digest: manifest.digest,
    payloadBytes: manifest.payloadBytes,
  })
}

function padded(value: number): string {
  const text = String(value)
  if (text.length > 12 || value < 0 || !Number.isInteger(value)) {
    throw new RangeError(`Kopfzeilenfeld passt nicht in 12 Stellen: ${value}`)
  }
  return text.padStart(12, '0')
}

/**
 * Setzt ein Bündel zu den Bytes zusammen, die geschrieben werden.
 *
 * `H1` in der Kopfzeile ist der Anfang des SHA-256 über die **kanonischen
 * Manifest-Bytes mit Platzhalter** — dieselbe Größe, die auch in den
 * Bündeldigest eingeht. Damit genügt der Dateiinhalt, um H1 nachzurechnen:
 * Manifest lesen, `digest` auf den Platzhalter setzen, kanonisch
 * serialisieren, hashen.
 */
export function encodeBundle(manifest: BundleManifest, payload: Uint8Array): Buffer {
  const bytes = Buffer.from(serializeBundleManifest(manifest), 'utf8')
  const canonical = Buffer.from(serializeBundleManifest({ ...manifest, digest: DIGEST_PLACEHOLDER }), 'utf8')
  const h1 = sha256Hex(canonical)
  const header = Buffer.from(
    `${BUNDLE_MAGIC}\n${padded(manifest.format)} ${padded(bytes.byteLength)} ${padded(payload.byteLength)} ${padded(12)} \n    `,
    'ascii',
  )
  if (header.byteLength !== BUNDLE_HEADER_BYTES) {
    throw new Error(`Kopfzeile ist ${header.byteLength} statt ${BUNDLE_HEADER_BYTES} Bytes`)
  }
  return Buffer.concat([header, bytes, Buffer.from(prefix(h1, 12), 'ascii'), Buffer.from(payload)])
}

/** Setzt ein zusammengestelltes Bündel zusammen. */
export function encodeBuiltBundle(bundle: BuiltBundle): Buffer {
  return encodeBundle(bundle.manifest, bundle.payload)
}

/** Ein Prüfergebnis über die Bytes eines Bündels; sammelt alle Befunde. */
export interface BundleCheck {
  readonly ok: boolean
  readonly errors: readonly UnitError[]
  readonly bundle?: LoadedBundle
}

function headerField(header: Buffer, start: number): number {
  return Number.parseInt(header.toString('ascii', start, start + 12), 10)
}

/**
 * Liest und prüft ein Bündel **vollständig**, ohne etwas zu schreiben.
 *
 * Geprüft werden: Magic, Formatversion, Feldbreiten, Länge gegen die
 * Dateigröße, `H1` gegen die Manifest-Bytes, `SHA-256(Manifest)` und
 * `SHA-256(Nutzlast)` gegen `manifest.digest`, jede Dateigröße und jeder
 * Dateihash gegen die Nutzlast, Offsets lückenlos, keine doppelten Einträge,
 * jeder Pfad über {@link validateRelativePath} und jedes eingebettete Manifest
 * über {@link parseManifest}. Jeder Verstoß ist ein eigener Befund; die Liste
 * kommt vollständig zurück.
 */
export function checkBundle(bytes: Uint8Array): BundleCheck {
  const errors: UnitError[] = []
  const data = Buffer.from(bytes)

  if (data.byteLength < BUNDLE_HEADER_BYTES) {
    return { ok: false, errors: [unitError('bundle_truncated', `Die Datei ist nur ${data.byteLength} Bytes lang; die Kopfzeile allein hat ${BUNDLE_HEADER_BYTES}.`, 'bundle')] }
  }
  if (data.toString('ascii', 0, 8) !== BUNDLE_MAGIC) {
    return { ok: false, errors: [unitError('bundle_header_invalid', `Kein Bündel: Magic ist "${data.toString('ascii', 0, 8)}" statt "${BUNDLE_MAGIC}".`, 'bundle')] }
  }
  if (data.toString('ascii', 8, 9) !== '\n' || data.toString('ascii', 61, 62) !== '\n') {
    errors.push(unitError('bundle_header_invalid', 'Die Kopfzeilen-Trenner stehen nicht an Position 8 und 61.', 'bundle'))
  }

  const format = headerField(data, 9)
  const manifestLength = headerField(data, 22)
  const payloadLength = headerField(data, 35)
  const h1Length = headerField(data, 48)

  if (!Number.isInteger(format) || !Number.isInteger(manifestLength) || !Number.isInteger(payloadLength) || !Number.isInteger(h1Length)) {
    return { ok: false, errors: [unitError('bundle_header_invalid', 'Die Längenfelder der Kopfzeile sind keine Dezimalzahlen.', 'bundle')] }
  }
  if (format > BUNDLE_FORMAT || format < 1) {
    errors.push(unitError('bundle_format_version_unsupported', `Formatversion ${format} wird nicht gelesen; dieses Paket kennt 1 bis ${BUNDLE_FORMAT}.`, 'bundle'))
    return { ok: false, errors }
  }
  if (h1Length !== 12) {
    errors.push(unitError('bundle_header_invalid', `Das Feld H1 muss 12 Zeichen lang sein, ist ${h1Length}.`, 'bundle'))
  }
  const expected = BUNDLE_HEADER_BYTES + manifestLength + 12 + payloadLength
  if (data.byteLength !== expected) {
    errors.push(unitError(
      'bundle_length_mismatch',
      `Die Datei ist ${data.byteLength} Bytes lang, die Kopfzeile verlangt ${expected}.`,
      'bundle',
      { actual: data.byteLength, expected },
    ))
  }
  if (errors.length > 0 && data.byteLength !== expected) return { ok: false, errors }

  const manifestBytes = data.subarray(BUNDLE_HEADER_BYTES, BUNDLE_HEADER_BYTES + manifestLength)
  const h1 = data.toString('ascii', BUNDLE_HEADER_BYTES + manifestLength, BUNDLE_HEADER_BYTES + manifestLength + 12)
  const payload = data.subarray(BUNDLE_HEADER_BYTES + manifestLength + 12)

  let parsed: unknown
  try {
    parsed = JSON.parse(manifestBytes.toString('utf8')) as unknown
  }
  catch (error) {
    errors.push(unitError('bundle_manifest_not_json', `Das Manifest ist kein gültiges JSON: ${(error as Error).message}`, 'bundle'))
    return { ok: false, errors }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, errors: [...errors, unitError('bundle_manifest_not_object', 'Das Manifest muss ein JSON-Objekt sein.', 'bundle')] }
  }

  const manifest = parsed as Record<string, unknown>
  const formatError = requireNumber(manifest, 'format', errors)
  if (formatError !== undefined && formatError !== format) {
    errors.push(unitError('bundle_manifest_field_value', `manifest.format ist ${formatError}, die Kopfzeile sagt ${format}.`, 'bundle:format'))
  }
  const createdAt = requireString(manifest, 'createdAt', errors)
  const createdBy = requireString(manifest, 'createdBy', errors)
  const entrypoint = requireString(manifest, 'entrypoint', errors)
  const declaredDigest = requireString(manifest, 'digest', errors)
  const contentDigest = requireString(manifest, 'contentDigest', errors)
  const payloadBytes = requireNumber(manifest, 'payloadBytes', errors)
  if (payloadBytes !== undefined && payloadBytes !== payload.byteLength) {
    errors.push(unitError('bundle_file_size_mismatch', `manifest.payloadBytes ist ${payloadBytes}, die Nutzlast hat ${payload.byteLength} Bytes.`, 'bundle:payloadBytes'))
  }

  const sourceRaw = manifest.source
  if (typeof sourceRaw !== 'object' || sourceRaw === null || Array.isArray(sourceRaw)) {
    errors.push(unitError('bundle_manifest_field_missing', 'manifest.source fehlt oder ist kein Objekt.', 'bundle:source'))
  }
  const source = (typeof sourceRaw === 'object' && sourceRaw !== null ? sourceRaw : {}) as Record<string, unknown>
  const sourceUnit = requireString(source, 'unit', errors, 'bundle:source.unit')
  const sourceVersion = requireString(source, 'version', errors, 'bundle:source.version')

  // `closure` ist der Abschluss einschließlich des Quell-Units. Er muss — wie
  // beim Schreiben — genau die Namen der enthaltenen Units nennen, sonst wäre
  // der Digest über eine andere Beschreibung gerechnet als die, die in der
  // Datei steht.
  const closureRaw = manifest.closure
  let closure: string[] = []
  if (!Array.isArray(closureRaw) || closureRaw.some((entry) => typeof entry !== 'string')) {
    errors.push(unitError('bundle_manifest_field_type', 'manifest.closure muss eine Liste von Namen sein.', 'bundle:closure'))
  }
  else {
    closure = closureRaw as string[]
  }

  const unitsRaw = manifest.units
  const units: BundleUnit[] = []
  if (!Array.isArray(unitsRaw) || unitsRaw.length === 0) {
    errors.push(unitError('bundle_manifest_field_missing', 'manifest.units fehlt oder ist leer.', 'bundle:units'))
  }
  else {
    unitsRaw.forEach((entry, index) => {
      const at = `bundle:units[${index}]`
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        errors.push(unitError('bundle_manifest_field_type', 'Ein Unit-Eintrag muss ein Objekt sein.', at))
        return
      }
      const record = entry as Record<string, unknown>
      const name = requireString(record, 'name', errors, `${at}.name`)
      const version = requireString(record, 'version', errors, `${at}.version`)
      const kind = requireString(record, 'kind', errors, `${at}.kind`)
      const manifestRaw = record.manifest
      if (manifestRaw === undefined) {
        errors.push(unitError('bundle_manifest_field_missing', 'Der eingebettete Unit-Manifest fehlt.', `${at}.manifest`))
        return
      }
      const validation = parseManifest({ json: manifestRaw, at: `${at}.manifest` })
      if (!validation.ok) {
        for (const error of validation.errors) errors.push(error)
        return
      }
      if (name !== undefined && name !== validation.value.name) {
        errors.push(unitError('bundle_manifest_field_value', `units[${index}].name ist "${name}", das Manifest sagt "${validation.value.name}".`, `${at}.name`))
      }
      if (version !== undefined && version !== validation.value.version) {
        errors.push(unitError('bundle_manifest_field_value', `units[${index}].version ist "${version}", das Manifest sagt "${validation.value.version}".`, `${at}.version`))
      }
      if (kind !== undefined && kind !== validation.value.kind) {
        errors.push(unitError('bundle_manifest_field_value', `units[${index}].kind ist "${kind}", das Manifest sagt "${validation.value.kind}".`, `${at}.kind`))
      }
      units.push({
        name: validation.value.name,
        version: validation.value.version,
        kind: validation.value.kind,
        manifest: validation.value,
      })
    })
  }

  const filesRaw = manifest.files
  const files: BundleFile[] = []
  if (!Array.isArray(filesRaw)) {
    errors.push(unitError('bundle_manifest_field_missing', 'manifest.files fehlt.', 'bundle:files'))
  }
  else {
    let runningOffset = 0
    const seen = new Set<string>()
    filesRaw.forEach((entry, index) => {
      const at = `bundle:files[${index}]`
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        errors.push(unitError('bundle_manifest_field_type', 'Ein Dateieintrag muss ein Objekt sein.', at))
        return
      }
      const record = entry as Record<string, unknown>
      const unit = requireString(record, 'unit', errors, `${at}.unit`)
      const path = requireString(record, 'path', errors, `${at}.path`)
      const size = requireNumber(record, 'size', errors, `${at}.size`)
      const sha256 = requireString(record, 'sha256', errors, `${at}.sha256`)
      const offset = requireNumber(record, 'offset', errors, `${at}.offset`)
      if (path === undefined || size === undefined || sha256 === undefined || offset === undefined || unit === undefined) return

      for (const error of validateRelativePath(path, `${at}.path`)) errors.push(error)
      if (!/^[0-9a-f]{64}$/.test(sha256)) {
        errors.push(unitError('bundle_manifest_field_value', `sha256 ist kein Hex-Digest: "${sha256}".`, `${at}.sha256`))
      }
      if (offset !== runningOffset) {
        errors.push(unitError('bundle_manifest_field_value', `Offset ${offset} passt nicht; lückenlos erwartet wird ${runningOffset}.`, `${at}.offset`))
      }
      runningOffset = offset + size
      const key = `${unit}\u0000${path}`
      if (seen.has(key)) {
        errors.push(unitError('bundle_duplicate_entry', `"${unit}/${path}" steht mehrfach im Bündel.`, `${at}.path`))
      }
      seen.add(key)
      files.push({ unit, path, size, sha256, offset })
    })

    if (runningOffset !== payload.byteLength) {
      errors.push(unitError('bundle_file_size_mismatch', `Die Dateieinträge ergeben ${runningOffset} Bytes, die Nutzlast hat ${payload.byteLength}.`, 'bundle:files'))
    }
  }

  // Dateihashes gegen die tatsächlichen Bytes.
  for (const file of files) {
    if (file.offset + file.size > payload.byteLength) {
      errors.push(unitError('bundle_truncated', `"${file.unit}/${file.path}" liegt außerhalb der Nutzlast.`, `bundle:files:${file.path}`))
      continue
    }
    const slice = payload.subarray(file.offset, file.offset + file.size)
    const actual = sha256Hex(slice)
    if (actual !== file.sha256) {
      errors.push(unitError(
        'bundle_file_digest_mismatch',
        `"${file.unit}/${file.path}" hat den Hash ${actual}, angekündigt war ${file.sha256}.`,
        `bundle:files:${file.path}`,
      ))
    }
  }

  // Zugehörigkeit: jede Datei muss zu einem Unit im Bündel gehören.
  for (const file of files) {
    if (!units.some((unit) => unit.name === file.unit)) {
      errors.push(unitError('bundle_manifest_field_value', `Datei "${file.path}" gehört zu Unit "${file.unit}", das nicht im Bündel steht.`, `bundle:files:${file.path}`))
    }
  }

  const computedContent = computeContentDigest(files)
  if (contentDigest !== undefined && contentDigest !== computedContent) {
    errors.push(unitError('bundle_component_digest_mismatch', `Der Inhaltsdigest stimmt nicht: ${contentDigest} statt ${computedContent}.`, 'bundle:contentDigest'))
  }

  // Jede deklarierte Abhängigkeit muss im Abschluss liegen — sonst ist das
  // Bündel unvollständig und die Installation würde später scheitern.
  const present = new Set(units.map((unit) => unit.name.toLowerCase()))
  for (const unit of units) {
    for (const required of unit.manifest.requires) {
      if (!present.has(required.toLowerCase())) {
        errors.push(unitError(
          'bundle_dependency_missing',
          `"${unit.name}" braucht "${required}", das im Bündel fehlt.`,
          `bundle:units:${unit.name}`,
        ))
      }
    }
  }
  if (sourceUnit !== undefined && !present.has(sourceUnit.toLowerCase())) {
    errors.push(unitError('bundle_source_manifest_invalid', `Das Quell-Unit "${sourceUnit}" steht nicht in manifest.units.`, 'bundle:source.unit'))
  }

  // Der Digest wird zuletzt geprüft und **über den Platzhalter** gerechnet:
  // er hängt damit an keinem Wert, der in seine eigene Berechnung eingeht, und
  // ein Angreifer kann das Manifest nicht so ändern, dass der Digest passt.
  const bundle: BundleManifest = {
    format: formatError ?? format,
    createdAt: createdAt ?? '',
    createdBy: createdBy ?? '',
    source: { unit: sourceUnit ?? '', version: sourceVersion ?? '' },
    entrypoint: entrypoint ?? '',
    units,
    files,
    closure,
    digest: declaredDigest ?? '',
    contentDigest: contentDigest ?? '',
    payloadBytes: payload.byteLength,
  }
  // H1 bindet die kanonischen Manifest-Bytes. Nachgerechnet wird über genau
  // die Felder, die auch geschrieben werden — nicht über das rohe Objekt aus
  // der Datei: sonst würde ein zusätzliches Feld im JSON den Digest brechen,
  // obwohl der Inhalt stimmt.
  {
    const canonical = Buffer.from(serializeBundleManifest({ ...bundle, digest: DIGEST_PLACEHOLDER }), 'utf8')
    const expectedH1 = prefix(sha256Hex(canonical), 12)
    if (h1 !== expectedH1) {
      errors.push(unitError('bundle_component_digest_mismatch', `H1 in der Kopfzeile ist "${h1}", das Manifest ergibt "${expectedH1}".`, 'bundle'))
    }
  }
  const computedDigest = bundleDigestOf(bundle, payload)
  if (declaredDigest !== undefined && declaredDigest !== computedDigest) {
    errors.push(unitError(
      'bundle_digest_mismatch',
      `Der Bündeldigest stimmt nicht: im Manifest steht ${declaredDigest}, die Bytes ergeben ${computedDigest}.`,
      'bundle:digest',
    ))
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    errors: [],
    bundle: { manifest: bundle, payload: Buffer.from(payload), digest: declaredDigest as string, computedDigest },
  }
}

function requireString(
  record: Record<string, unknown>,
  field: string,
  errors: UnitError[],
  at = `bundle:${field}`,
): string | undefined {
  const value = record[field]
  if (value === undefined) {
    errors.push(unitError('bundle_manifest_field_missing', `"${field}" fehlt im Bündelmanifest.`, at))
    return undefined
  }
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(unitError('bundle_manifest_field_type', `"${field}" muss eine nicht-leere Zeichenkette sein.`, at))
    return undefined
  }
  return value
}

function requireNumber(
  record: Record<string, unknown>,
  field: string,
  errors: UnitError[],
  at = `bundle:${field}`,
): number | undefined {
  const value = record[field]
  if (value === undefined) {
    errors.push(unitError('bundle_manifest_field_missing', `"${field}" fehlt im Bündelmanifest.`, at))
    return undefined
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    errors.push(unitError('bundle_manifest_field_type', `"${field}" muss eine nicht-negative ganze Zahl sein.`, at))
    return undefined
  }
  return value
}

/** Liest ein Bündel von der Platte und prüft es. */
export async function loadBundleFile(path: string): Promise<BundleCheck> {
  const absolute = resolve(path)
  let bytes: Buffer
  try {
    const info = await stat(absolute)
    if (!info.isFile()) {
      return { ok: false, errors: [unitError('bundle_missing', 'Die angegebene Datei ist keine reguläre Datei.', absolute)] }
    }
    bytes = await readFile(absolute)
  }
  catch (error) {
    const code = (error as { code?: string }).code
    return {
      ok: false,
      errors: [unitError(code === 'ENOENT' ? 'bundle_missing' : 'bundle_unreadable', `Bündel nicht lesbar: ${(error as Error).message}`, absolute)],
    }
  }
  return checkBundle(bytes)
}

/** Ein Bündel schreiben. */
export async function writeBundleFile(path: string, bundle: BuiltBundle): Promise<{ readonly digest: string; readonly bytes: number }> {
  const bytes = encodeBuiltBundle(bundle)
  const absolute = resolve(path)
  await writeFile(absolute, bytes)
  return { digest: bundle.manifest.digest, bytes: bytes.byteLength }
}

/** Ein geplanter Schreibvorgang: endgültiger Pfad plus die Bytes, die dorthin gehören. */
export interface ExtractPlan {
  readonly unit: string
  /** Endgültiger, absoluter Zielpfad der Datei. */
  readonly absolute: string
  /** Pfad relativ zum Unit-Ordner, wie im Bündel deklariert. */
  readonly path: string
  readonly bytes: Buffer
}

/** Ergebnis der Schreibplanung. */
export interface ExtractResult {
  readonly ok: boolean
  readonly errors: readonly UnitError[]
  /** Leer, sobald `ok` falsch ist — es wird nichts halb geschrieben. */
  readonly plan: readonly ExtractPlan[]
}

/**
 * Plant das Schreiben der Bündeldateien in Zielordner je Unit.
 *
 * Es wird **nichts** geschrieben: erst planen, prüfen, dann schreiben. Jede
 * Datei läuft durch {@link validateRelativePath} **und** durch die
 * Wurzelkontrolle, und zwar erneut — ein Bündel ist Fremddaten, und die
 * Prüfung ist billig gegen die Kosten einer Datei außerhalb des Zielordners.
 * Bei einem einzigen Verstoß ist das Ergebnis leer.
 */
export function planExtract(bundle: LoadedBundle, targetRoot: string): ExtractResult {
  const errors: UnitError[] = []
  const plan: ExtractPlan[] = []
  const root = resolve(targetRoot)

  for (const file of bundle.manifest.files) {
    const at = `bundle:files:${file.path}`
    const pathErrors = validateRelativePath(file.path, at)
    if (pathErrors.length > 0) {
      errors.push(...pathErrors)
      continue
    }
    if (file.offset + file.size > bundle.payload.byteLength) {
      errors.push(unitError('bundle_truncated', `"${file.path}" liegt außerhalb der Nutzlast.`, at))
      continue
    }
    const absolute = resolve(join(root, directoryNameFor(file.unit), file.path))
    if (absolute !== root && !absolute.startsWith(root + sep)) {
      errors.push(unitError('path_escape', `"${file.path}" würde "${root}" verlassen.`, at))
      continue
    }
    plan.push({
      unit: file.unit,
      absolute,
      path: file.path,
      bytes: Buffer.from(bundle.payload.subarray(file.offset, file.offset + file.size)),
    })
  }

  if (errors.length > 0) return { ok: false, errors, plan: [] }
  return { ok: true, errors: [], plan }
}

/** Sammelt die Unit-Verzeichnisse eines registrierten Abschlusses ein. */
export async function gatherDependencies(
  registry: Registry,
  closure: readonly string[],
  skip: string,
): Promise<{ readonly manifest: UnitManifest; readonly directory: string }[]> {
  const result: { manifest: UnitManifest; directory: string }[] = []
  for (const name of closure) {
    if (name === skip) continue
    const entry = findUnit(registry, name)
    if (entry === undefined) continue
    result.push({ manifest: entry.manifest, directory: entry.directory })
  }
  return result
}
