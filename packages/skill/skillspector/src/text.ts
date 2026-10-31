/**
 * Textwerkzeuge des Scanners: Zeilennummern, Belege, Globs, Fingerabdrücke.
 *
 * **Warum Belege normalisiert werden.** Ein Befund soll wiedererkennbar sein, ohne
 * den halben Skill zu zitieren. Normalisieren heißt hier: Steuerzeichen und
 * Zero-Width-Zeichen entfernen, Leerraum zusammenfassen, auf 200 Zeichen kürzen.
 * Der Fingerabdruck hängt am normalisierten Text — sonst ändert eine
 * Umformatierung jede Baseline.
 *
 * @module @prometheus-harness/skillspector/text
 */

import { createHash } from 'node:crypto'

/** Höchstlänge eines Belegs in Zeichen. */
const EVIDENCE_MAX = 200

/**
 * Ermittelt die 1-basierte Zeile eines Zeichenindex.
 *
 * @param text - der vollständige Text
 * @param index - Zeichenindex
 * @returns die Zeile; bei negativem Index 1
 */
export function lineOfIndex(text: string, index: number): number {
  if (index <= 0) return 1
  let line = 1
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1
  }
  return line
}

/**
 * Normalisiert einen Beleg für Anzeige und Fingerabdruck.
 *
 * @param text - Rohtext
 * @returns einzeiliger, gekürzter Beleg
 */
export function normalizeEvidence(text: string): string {
  const cleaned = text
    // Zero-Width- und Bidi-Zeichen sind unsichtbar; im Beleg wären sie eine Falle.
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '')
    // Andere Steuerzeichen als Tab und Zeilenumbruch.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > EVIDENCE_MAX ? `${cleaned.slice(0, EVIDENCE_MAX - 1)}…` : cleaned
}

/**
 * Liefert alle Treffer eines globalen Ausdrucks, ohne in eine Endlosschleife zu
 * geraten, wenn der Ausdruck leer treffen kann.
 *
 * @param pattern - Ausdruck mit `g`-Flag
 * @param text - zu durchsuchender Text
 * @returns Treffer mit Index
 */
export function findAll(pattern: RegExp, text: string): Array<{ index: number; match: RegExpExecArray }> {
  const result: Array<{ index: number; match: RegExpExecArray }> = []
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    result.push({ index: match.index, match })
    if (match[0].length === 0) regex.lastIndex += 1
    if (result.length >= 50) break
  }
  return result
}

/**
 * Baut den stabilen Fingerabdruck eines Befunds.
 *
 * Der Fingerabdruck bindet Regel, Datei und Beleg. Er bindet **nicht** die Zeile:
 * eine eingefügte Leerzeile darf eine akzeptierte Stelle nicht wieder aufwecken.
 *
 * @param ruleId - Regel-Kennung
 * @param file - Dateipfad
 * @param evidence - normalisierter Beleg
 * @returns 16 Hex-Zeichen
 */
export function fingerprintOf(ruleId: string, file: string, evidence: string): string {
  return createHash('sha256')
    .update(`${ruleId}\u0000${file}\u0000${evidence}`)
    .digest('hex')
    .slice(0, 16)
}

/**
 * Berechnet den Inhalts-Digest einer Dateimenge.
 *
 * Sortiert nach Pfad und hasht Paar für Paar; zwei gleiche Bäume ergeben denselben
 * Digest, unabhängig von der Einlesereihenfolge.
 *
 * @param files - die geprüften Dateien
 * @returns `sha256` als Hex
 */
export function digestOf(files: ReadonlyArray<{ path: string; text: string }>): string {
  const hash = createHash('sha256')
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(file.path)
    hash.update('\u0000')
    hash.update(createHash('sha256').update(file.text).digest('hex'))
    hash.update('\n')
  }
  return hash.digest('hex')
}

/**
 * Übersetzt einen POSIX-Glob in einen Ausdruck.
 *
 * `*` trifft auch `/` — dieselbe Regel wie im Vorbild, damit `tests/*` wirklich
 * alles unter `tests/` meint und nicht nur die erste Ebene.
 *
 * @param glob - Muster relativ zur Wurzel
 * @returns der Ausdruck ohne Flags
 */
export function globToRegExp(glob: string): RegExp {
  let pattern = '^'
  for (const char of glob) {
    if (char === '*') pattern += '.*'
    else if (char === '?') pattern += '.'
    else pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`${pattern}$`)
}

/**
 * Erkennt, ob ein Text binär wirkt.
 *
 * Ein NUL-Byte in den ersten 8 KiB ist das verlässliche Signal; ein hoher Anteil
 * nicht druckbarer Zeichen kommt bei UTF-16 ohne BOM ebenfalls vor.
 *
 * @param text - der gelesene Text
 * @returns ob er als binär gilt
 */
export function looksBinary(text: string): boolean {
  const probe = text.slice(0, 8192)
  if (probe.includes('\u0000')) return true
  let control = 0
  for (let i = 0; i < probe.length; i += 1) {
    const code = probe.charCodeAt(i)
    if (code < 9 || (code > 13 && code < 32)) control += 1
  }
  return probe.length > 0 && control / probe.length > 0.1
}

/** Ein dekodierbarer Base64-Block. */
export interface DecodedBlock {
  readonly index: number
  readonly decoded: string
}

/**
 * Findet Base64-Blöcke, die lesbaren Text mit Anweisungscharakter ergeben.
 *
 * Reines Base64 ist in Bildern und Signaturen normal. Verdächtig wird es erst,
 * wenn der dekodierte Text wie eine Anweisung aussieht — genau die Kombination,
 * die das Vorbild als „encoded payload“ führt.
 *
 * @param text - zu durchsuchender Text
 * @returns dekodierte, verdächtige Blöcke
 */
export function findSuspiciousBase64(text: string): DecodedBlock[] {
  const blocks: DecodedBlock[] = []
  const pattern = /[A-Za-z0-9+/]{80,}={0,2}/g
  for (const hit of findAll(pattern, text)) {
    const raw = hit.match[0]
    let decoded: string
    try {
      decoded = Buffer.from(raw, 'base64').toString('utf8')
    } catch {
      continue
    }
    if (!isMostlyPrintable(decoded)) continue
    if (!/ignore|instruction|system|prompt|password|secret|token|http|exec|curl/i.test(decoded)) continue
    blocks.push({ index: hit.index, decoded })
    if (blocks.length >= 5) break
  }
  return blocks
}

function isMostlyPrintable(text: string): boolean {
  if (text.length === 0) return false
  let printable = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code < 127) || code >= 160) printable += 1
  }
  return printable / text.length > 0.85
}

/** Ein verdächtiges Unicode-Zeichen. */
export interface UnicodeHit {
  readonly index: number
  readonly kind: 'zero-width' | 'bidi' | 'mixed-script'
  readonly sample: string
}

// U+200C/U+200D sind Steuerzeichen für Emoji- und Schriftfolgen (z. B. 👨‍💻).
// Sie sind alltäglich und kein Versteck; ein Scanner, der sie meldet, meldet
// jede Emoji-Sequenz. Verdächtig sind die unsichtbaren Trenner ohne Funktion.
const ZERO_WIDTH = /[\u200B\u200E\u200F\u2060\uFEFF]/
const BIDI = /[\u202A-\u202E\u2066-\u2069]/
/** Kyrillische Zeichen, die lateinischen Buchstaben gleichen. */
const HOMOGLYPH = /[\u0410-\u044F]/

/**
 * Sucht unsichtbare und täuschende Zeichen.
 *
 * @param text - zu durchsuchender Text
 * @returns Treffer in Textreihenfolge
 */
export function findUnicodeTricks(text: string): UnicodeHit[] {
  const hits: UnicodeHit[] = []
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === undefined) continue
    if (ZERO_WIDTH.test(char)) {
      hits.push({ index, kind: 'zero-width', sample: `U+${char.charCodeAt(0).toString(16).toUpperCase()}` })
    } else if (BIDI.test(char)) {
      hits.push({ index, kind: 'bidi', sample: `U+${char.charCodeAt(0).toString(16).toUpperCase()}` })
    }
    if (hits.length >= 20) break
  }
  const mixed = HOMOGLYPH.exec(text)
  if (mixed !== null) {
    hits.push({ index: mixed.index, kind: 'mixed-script', sample: mixed[0] })
  }
  return hits
}

/**
 * Klassifiziert eine Datei anhand ihres Pfads.
 *
 * @param path - relativer Pfad
 * @returns die Anzeigeart
 */
export function componentTypeOf(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml'
  if (lower.endsWith('.sh') || lower.endsWith('.bash')) return 'shell'
  if (lower.endsWith('.ps1')) return 'powershell'
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript'
  if (lower.endsWith('.toml')) return 'toml'
  if (lower.endsWith('.exe') || lower.endsWith('.dll') || lower.endsWith('.so')) return 'binary'
  return 'text'
}

/**
 * Ob eine Datei ausführbar wirkt.
 *
 * @param path - relativer Pfad
 * @param text - Inhalt, für die Shebang-Prüfung
 * @returns ob sie als ausführbar zählt
 */
export function isExecutable(path: string, text: string): boolean {
  const type = componentTypeOf(path)
  if (type === 'shell' || type === 'powershell' || type === 'python' || type === 'binary') return true
  if (type === 'javascript' || type === 'typescript') return true
  return text.startsWith('#!')
}
