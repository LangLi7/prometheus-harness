/**
 * Manifest-Modell und -Prüfung.
 *
 * Bindende Vorgabe ist `units/README.md`: `unit.json` deklariert ein Unit
 * vollständig. Dieses Modul liest die Deklaration, prüft sie feldweise und
 * liefert **alle** Befunde statt eines generischen Wurfs.
 *
 * Zwei Felder gehen über `units/README.md` hinaus und sind hier bewusst
 * zugelassen, weil die vorhandenen Units sie schon benutzen:
 *
 *  - `notes`   — steht in allen acht vorhandenen `unit.json`, fehlt aber in der
 *                Tabelle des README.
 *  - `contract` — die Core-Vertragsversion, die §3.2 der Entscheidung
 *                (`docs/decisions/hybrid-then-self-build.md`) verlangt. Das
 *                README kennt nur `core: optional|required_core`; das sagt
 *                *ob* ein Core nötig ist, nicht *welcher*. Ohne `contract`
 *                gilt der Default des Hosts (siehe `registry.ts`).
 *
 * Alles andere ist ein Fehler: ein Tippfehler in `unit.json` soll auffallen,
 * nicht still ignoriert werden.
 */

import { readFile, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import { UnitValidationError, invalid, unitError, valid, type UnitError, type Validation } from './errors.ts'

/** Die vier Unit-Arten aus `docs/concept.md` und `units/README.md`. */
export type UnitKind = 'plugin' | 'service' | 'patch' | 'skill'

/** Die drei Sprachen, die `units/README.md` zulässt. */
export type UnitLanguage = 'typescript' | 'go' | 'rust'

/** Plattformen, die `units/README.md` als Beispiel nennt. */
export type UnitPlatform = 'windows' | 'linux' | 'darwin'

/** Wie ein Dienst gestartet wird (`entry` in `unit.json`). */
export interface UnitEntry {
  readonly command: string
  readonly args: readonly string[]
}

/**
 * Der Wechsel-Takt eines Units — die Klassifizierung aus
 * `docs/design/harness-generationen.md` §2.3.
 *
 * `hot`  = im laufenden Prozeß annehmbar (Konfigurationszeile, Client-Plugin).
 * `idle` = zwischen zwei Zügen wechselbar (eigenes Modul, eine Unit-Zeile).
 * `boot` = nur durch einen neuen Prozess (Core, Launcher, Ports, native Dienste).
 *
 * **Die Vorgabe ist `boot`**, und zwar absichtlich: wer eine Änderung für heiß
 * erklärt, muß sie belegen — und der Beleg ist eine Prüfung (die Mitgift der
 * Unit wird abgeräumt), kein Satz. Die vorsichtige Annahme ist die einzige, die
 * niemanden täuscht.
 */
export type UnitReload = 'hot' | 'idle' | 'boot'

/** Die Ordnung der Takte: höher = teurer. Für „der höchste Takt gewinnt". */
export const RELOAD_ORDER: Readonly<Record<UnitReload, number>> = { hot: 0, idle: 1, boot: 2 }

/** Der teurere von zwei Takten. */
export function hoechsterTakt(a: UnitReload, b: UnitReload): UnitReload {
  return RELOAD_ORDER[a] >= RELOAD_ORDER[b] ? a : b
}

/** Ein vollständig geprüftes Unit-Manifest. */
export interface UnitManifest {
  /** Eindeutiger Name; entspricht dem Ordnernamen (letztes Segment, case-insensitiv). */
  readonly name: string
  /** Eigene Version, unabhängig vom Core. */
  readonly version: string
  readonly kind: UnitKind
  readonly language: UnitLanguage
  /** Ein Satz. */
  readonly description: string
  /** Nur bei `kind: "service"` Pflicht. */
  readonly entry?: UnitEntry
  /** `optional` = ohne Core startbar; `required_core` = braucht den Core. */
  readonly core: 'optional' | 'required_core'
  /** Core-Vertragsversion oder -spanne; fehlt sie, gilt der Host-Default. */
  readonly contract?: string
  readonly provides: readonly string[]
  /** Andere Units, die dieses Unit braucht. */
  readonly requires: readonly string[]
  /** Leer = überall lauffähig. */
  readonly platforms: readonly UnitPlatform[]
  readonly notes: readonly string[]
  /**
   * Wie teuer ein Wechsel dieses Units ist. Fehlt das Feld, gilt `boot` —
   * die vorsichtige Annahme (siehe {@link UnitReload}).
   */
  readonly reload?: UnitReload
  /**
   * `true` heißt Einbahnstraße: die Wirkung läßt sich nicht zurücknehmen
   * (Schema-Migration, Rotation, nach außen gewirkte Nebenwirkung). Ein
   * Generationenwechsel mit einem solchen Unit verlangt ausdrückliche Freigabe.
   */
  readonly irreversible?: boolean
  /** Der Ordner, aus dem das Manifest gelesen wurde (absolut). */
  readonly directory: string
}

/** Was ein Manifest sein darf, ohne dass aus dem Ordner gelesen wird (Tests, Bundle-Prüfung). */
export interface ManifestSource {
  /** Der rohe JSON-Inhalt von `unit.json`. */
  readonly json: unknown
  /** Ordner, gegen den `name` geprüft wird; fehlt er, entfällt diese Prüfung. */
  readonly directory?: string
  /** Woher der Inhalt stammt, für Befundorte (Default `unit.json`). */
  readonly at?: string
}

const KINDS: readonly UnitKind[] = ['plugin', 'service', 'patch', 'skill']
const LANGUAGES: readonly UnitLanguage[] = ['typescript', 'go', 'rust']
const PLATFORMS: readonly UnitPlatform[] = ['windows', 'linux', 'darwin']
const RELOAD_CLASSES: readonly UnitReload[] = ['hot', 'idle', 'boot']

const KNOWN_FIELDS = new Set([
  'name',
  'version',
  'kind',
  'language',
  'description',
  'entry',
  'core',
  'contract',
  'provides',
  'requires',
  'platforms',
  'notes',
  'reload',
  'irreversible',
])

/**
 * Erlaubte Zeichen im Unit-Namen.
 *
 * Der Name landet als **Ordnername** auf dem Datenträger und als Schlüssel in
 * der Registry. Deshalb klein geschrieben (Windows vergleicht Dateinamen
 * case-insensitiv — zwei Namen, die sich nur in der Groß-/Kleinschreibung
 * unterscheiden, kollidieren dort still) und ohne Zeichen, die Windows
 * ablehnt oder umdeutet (`<>:"/\|?*`). Der Schrägstrich ist nur in der
 * npm-Form `@scope/name` zugelassen, und `@scope` wird nicht als Ordner
 * verwendet.
 */
const NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/

/** Windows-Gerätenamen: ein Ordner mit diesem Namen ist auf Windows unbenutzbar. */
const RESERVED_DEVICE_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
])

/** Version: `MAJOR.MINOR.PATCH` mit optionaler Vorabkennung (`1.0.0-alpha.2`). */
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/

/** Vertragsspanne: exakt, `^`, `~`, `>=`, `>`, `<=`, `<` oder `*`. */
const CONTRACT_PATTERN = /^(?:[~^]|>=|<=|>|<)?(?:0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$|^\*$/

const MAX_NAME_LENGTH = 96
const MAX_SEGMENT_LENGTH = 64
const MAX_CONTRACT_LENGTH = 64

/** Fehlercode-Präfix für Manifest-Befunde. */
const AT_ROOT = 'unit.json'

/**
 * Prüft einen Unit-Namen.
 *
 * Liefert **alle** Verstöße, nicht den ersten: eine Oberfläche, die einen Namen
 * ablehnt, soll den Grund vollständig zeigen können.
 */
export function validateUnitName(name: string, at = `${AT_ROOT}#/name`): readonly UnitError[] {
  const errors: UnitError[] = []
  const push = (code: Parameters<typeof unitError>[0], message: string): void => {
    errors.push(unitError(code, message, at))
  }

  if (name.length === 0) {
    push('unit_name_empty', 'Der Unit-Name ist leer.')
    return errors
  }
  if (name.length > MAX_NAME_LENGTH) {
    push('unit_name_too_long', `Der Unit-Name ist länger als ${MAX_NAME_LENGTH} Zeichen.`)
  }
  if (name !== name.toLowerCase()) {
    push('unit_name_uppercase', 'Der Unit-Name enthält Großbuchstaben; Windows vergleicht Dateinamen case-insensitiv, zwei solche Units kollidieren.')
  }
  if (name.startsWith('.')) {
    push('unit_name_leading_dot', 'Der Unit-Name beginnt mit einem Punkt.')
  }
  if (name.endsWith('.') || name.endsWith(' ')) {
    push('unit_name_trailing_dot', 'Der Unit-Name endet mit Punkt oder Leerzeichen; Windows schneidet das beim Anlegen eines Ordners ab.')
  }
  if (name.includes('..')) {
    push('unit_name_illegal_character', 'Der Unit-Name enthält "..".')
  }
  for (const character of name) {
    if (NAME_PATTERN.test(name)) continue
    if (character === '\\' || character === ':' || character === '<' || character === '>' || character === '"' || character === '|' || character === '?' || character === '*') {
      push('unit_name_illegal_character', `Der Unit-Name enthält das für Windows unzulässige Zeichen "${character}".`)
      break
    }
  }
  if (!NAME_PATTERN.test(name) && errors.length === 0) {
    push('unit_name_illegal_character', `Der Unit-Name "${name}" entspricht nicht ^(@scope/)?[a-z0-9][a-z0-9._-]*$.`)
  }

  const segments = name.split('/')
  for (const segment of segments) {
    if (segment.length > MAX_SEGMENT_LENGTH) {
      push('unit_name_too_long', `Das Namenssegment "${segment}" ist länger als ${MAX_SEGMENT_LENGTH} Zeichen.`)
    }
    const deviceCandidate = segment.split('.')[0] ?? segment
    if (RESERVED_DEVICE_NAMES.has(deviceCandidate.toLowerCase())) {
      push('unit_name_reserved_device', `"${segment}" ist ein reservierter Windows-Gerätename.`)
    }
  }

  return errors
}

/**
 * Ordner-Basisname eines Units: das letzte Segment des Namens, `@scope/` fällt weg.
 * Genau die Form, die als Verzeichnisname erwartet wird.
 */
export function directoryNameFor(name: string): string {
  const slash = name.lastIndexOf('/')
  return slash === -1 ? name : name.slice(slash + 1)
}

/**
 * Prüft eine Vertragsspanne wie `^0.2.1` oder `0.2.1`.
 * Wird auch von der Registry verwendet.
 */
export function isContractRange(value: string): boolean {
  return value.length > 0 && value.length <= MAX_CONTRACT_LENGTH && CONTRACT_PATTERN.test(value)
}

/** Vergleicht zwei Versionen: negativ = a älter, 0 = gleich, positiv = a neuer. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string): { numbers: readonly number[]; pre: string | undefined } => {
    const [core, pre] = value.split('-', 2)
    const numbers = (core ?? '').split('.').map((part) => Number.parseInt(part, 10) || 0)
    return { numbers, pre }
  }
  const left = parse(a)
  const right = parse(b)
  for (let index = 0; index < 3; index += 1) {
    const difference = (left.numbers[index] ?? 0) - (right.numbers[index] ?? 0)
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  // Vorabkennung: eine Version ohne Vorabkennung ist neuer als eine mit.
  if (left.pre === right.pre) return 0
  if (left.pre === undefined) return 1
  if (right.pre === undefined) return -1
  return left.pre < right.pre ? -1 : 1
}

/**
 * Prüft, ob `version` in `range` fällt.
 *
 * Unterstützt genau das, was `units/README.md` und die vorhandenen Units
 * brauchen: exakt, `^`, `~`, `>=`, `>`, `<=`, `<` und `*`. Mehr wird
 * ausdrücklich nicht versprochen — siehe README „Grenzen".
 */
export function satisfiesContract(version: string, range: string): boolean {
  if (range === '*') return true
  const match = /^([~^]|>=|<=|>|<)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(range)
  if (match === null) return false
  const operator = match[1] ?? ''
  const bound = match[2] ?? ''
  const comparison = compareVersions(version, bound)
  switch (operator) {
    case '': return comparison === 0
    case '>=': return comparison >= 0
    case '>': return comparison > 0
    case '<=': return comparison <= 0
    case '<': return comparison < 0
    case '^': {
      // Bis zur nächsten von Null verschiedenen Stelle: ^0.2.1 < 0.3.0, ^1.2.3 < 2.0.0
      const [major = 0, minor = 0] = bound.split('.').map((part) => Number.parseInt(part, 10) || 0)
      if (comparison < 0) return false
      if (major > 0) return (Number.parseInt(version.split('.')[0] ?? '0', 10) || 0) === major
      if (minor > 0) {
        const parts = version.split('.')
        return (Number.parseInt(parts[0] ?? '0', 10) || 0) === 0
          && (Number.parseInt(parts[1] ?? '0', 10) || 0) === minor
      }
      return compareVersions(version, bound) === 0
    }
    case '~': {
      if (comparison < 0) return false
      const parts = bound.split('.')
      const target = version.split('.')
      return (Number.parseInt(parts[0] ?? '0', 10) || 0) === (Number.parseInt(target[0] ?? '0', 10) || 0)
        && (Number.parseInt(parts[1] ?? '0', 10) || 0) === (Number.parseInt(target[1] ?? '0', 10) || 0)
    }
    default: return false
  }
}

function readString(
  raw: Record<string, unknown>,
  field: string,
  errors: UnitError[],
  options: { readonly required?: boolean; readonly maxLength?: number } = {},
): string | undefined {
  const value = raw[field]
  if (value === undefined) {
    if (options.required === true) {
      errors.push(unitError('manifest_field_missing', `Das Pflichtfeld "${field}" fehlt.`, `${AT_ROOT}#/${field}`))
    }
    return undefined
  }
  if (typeof value !== 'string') {
    errors.push(unitError('manifest_field_type', `"${field}" muss eine Zeichenkette sein, ist aber ${typeof value}.`, `${AT_ROOT}#/${field}`))
    return undefined
  }
  if (options.required === true && value.trim().length === 0) {
    errors.push(unitError('manifest_field_value', `"${field}" darf nicht leer sein.`, `${AT_ROOT}#/${field}`))
    return undefined
  }
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    errors.push(unitError('manifest_field_value', `"${field}" ist länger als ${options.maxLength} Zeichen.`, `${AT_ROOT}#/${field}`))
  }
  return value
}

function readStringArray(
  raw: Record<string, unknown>,
  field: string,
  errors: UnitError[],
): readonly string[] {
  const value = raw[field]
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    errors.push(unitError('manifest_field_type', `"${field}" muss eine Liste sein, ist aber ${typeof value}.`, `${AT_ROOT}#/${field}`))
    return []
  }
  const result: string[] = []
  value.forEach((element, index) => {
    if (typeof element !== 'string') {
      errors.push(unitError('manifest_field_type', `"${field}[${index}]" muss eine Zeichenkette sein.`, `${AT_ROOT}#/${field}/${index}`))
      return
    }
    if (element.trim().length === 0) {
      errors.push(unitError('manifest_field_value', `"${field}[${index}]" darf nicht leer sein.`, `${AT_ROOT}#/${field}/${index}`))
      return
    }
    result.push(element)
  })
  return result
}

/**
 * Prüft ein rohes Manifest.
 *
 * Sammelt alle Befunde; der Rückgabewert trägt sie auch im Erfolgsfall
 * (Warnungen sind derzeit keine definiert, die Struktur bleibt aber offen).
 */
export function parseManifest(source: ManifestSource): Validation<UnitManifest> {
  const at = source.at ?? AT_ROOT
  const errors: UnitError[] = []
  const raw = source.json

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return invalid([unitError('manifest_not_object', 'unit.json muss ein JSON-Objekt sein.', at)])
  }

  const record = raw as Record<string, unknown>
  for (const field of Object.keys(record)) {
    if (!KNOWN_FIELDS.has(field)) {
      errors.push(unitError('manifest_unknown_field', `Unbekanntes Feld "${field}".`, `${at}#/${field}`))
    }
  }

  // --- name ---
  const name = readString(record, 'name', errors, { required: true, maxLength: MAX_NAME_LENGTH })
  if (name !== undefined) errors.push(...validateUnitName(name, `${at}#/name`))

  // --- version ---
  const version = readString(record, 'version', errors, { required: true, maxLength: 64 })
  if (version !== undefined && !VERSION_PATTERN.test(version)) {
    errors.push(unitError('unit_version_not_semver', `"version" muss MAJOR.MINOR.PATCH sein, ist "${version}".`, `${at}#/version`))
  }

  // --- kind ---
  const kindRaw = readString(record, 'kind', errors, { required: true })
  let kind: UnitKind | undefined
  if (kindRaw !== undefined) {
    if ((KINDS as readonly string[]).includes(kindRaw)) {
      kind = kindRaw as UnitKind
    }
    else {
      errors.push(unitError('unit_kind_unknown', `Unbekannte Art "${kindRaw}"; erlaubt: ${KINDS.join(', ')}.`, `${at}#/kind`))
    }
  }

  // --- language ---
  const languageRaw = readString(record, 'language', errors, { required: true })
  let language: UnitLanguage | undefined
  if (languageRaw !== undefined) {
    if ((LANGUAGES as readonly string[]).includes(languageRaw)) {
      language = languageRaw as UnitLanguage
    }
    else {
      errors.push(unitError('unit_language_unknown', `Unbekannte Sprache "${languageRaw}"; erlaubt: ${LANGUAGES.join(', ')}.`, `${at}#/language`))
    }
  }

  // --- description ---
  const description = readString(record, 'description', errors, { required: true, maxLength: 512 })

  // --- core ---
  const coreRaw = readString(record, 'core', errors, { required: true })
  let core: 'optional' | 'required_core' | undefined
  if (coreRaw !== undefined) {
    if (coreRaw === 'optional' || coreRaw === 'required_core') {
      core = coreRaw
    }
    else {
      errors.push(unitError('manifest_field_value', `"core" muss "optional" oder "required_core" sein, ist "${coreRaw}".`, `${at}#/core`))
    }
  }

  // --- contract (Erweiterung, siehe Kopfkommentar) ---
  const contract = readString(record, 'contract', errors, { maxLength: MAX_CONTRACT_LENGTH })
  if (contract !== undefined && !isContractRange(contract)) {
    errors.push(unitError('unit_contract_range_invalid', `"contract" ist keine gültige Spanne: "${contract}".`, `${at}#/contract`))
  }

  // --- entry ---
  let entry: UnitEntry | undefined
  const entryRaw = record.entry
  if (entryRaw !== undefined) {
    if (typeof entryRaw !== 'object' || entryRaw === null || Array.isArray(entryRaw)) {
      errors.push(unitError('manifest_field_type', '"entry" muss ein Objekt sein.', `${at}#/entry`))
    }
    else {
      const entryRecord = entryRaw as Record<string, unknown>
      for (const field of Object.keys(entryRecord)) {
        if (field !== 'command' && field !== 'args') {
          errors.push(unitError('manifest_unknown_field', `Unbekanntes Feld "entry.${field}".`, `${at}#/entry/${field}`))
        }
      }
      const command = readString(entryRecord, 'command', errors, { required: true, maxLength: 260 })
      const args = readStringArray(entryRecord, 'args', errors)
      if (command !== undefined) entry = { command, args }
    }
  }
  if (kind === 'service' && entry === undefined) {
    errors.push(unitError('manifest_field_missing', 'Ein Unit der Art "service" braucht "entry" mit "command" und "args".', `${at}#/entry`))
  }

  // --- provides / requires / platforms / notes ---
  const provides = readStringArray(record, 'provides', errors)
  const requires = readStringArray(record, 'requires', errors)
  const platformsRaw = readStringArray(record, 'platforms', errors)
  const platforms: UnitPlatform[] = []
  platformsRaw.forEach((platform, index) => {
    if ((PLATFORMS as readonly string[]).includes(platform)) {
      platforms.push(platform as UnitPlatform)
      return
    }
    errors.push(unitError('unit_platform_unknown', `Unbekannte Plattform "${platform}"; erlaubt: ${PLATFORMS.join(', ')}.`, `${at}#/platforms/${index}`))
  })
  const notes = readStringArray(record, 'notes', errors)

  // --- reload / irreversible (Erweiterung, harness-generationen.md §2.3) ---
  const reloadRaw = readString(record, 'reload', errors)
  let reload: UnitReload | undefined
  if (reloadRaw !== undefined) {
    if (RELOAD_CLASSES.includes(reloadRaw as UnitReload)) {
      reload = reloadRaw as UnitReload
    }
    else {
      errors.push(unitError('manifest_field_value', `"reload" muss ${RELOAD_CLASSES.join(', ')} sein, ist "${reloadRaw}".`, `${at}#/reload`))
    }
  }

  let irreversible: boolean | undefined
  const irreversibleRaw = record.irreversible
  if (irreversibleRaw !== undefined) {
    if (typeof irreversibleRaw !== 'boolean') {
      errors.push(unitError('manifest_field_type', `"irreversible" muss true oder false sein, ist ${typeof irreversibleRaw}.`, `${at}#/irreversible`))
    }
    else {
      irreversible = irreversibleRaw
    }
  }

  // Der Widerspruch, den niemand bemerkt, bis es zu spät ist: ein Vorgang, der
  // im laufenden Prozeß zurückgenommen werden kann, KANN nicht einbahnig sein.
  // Wer beides deklariert, hat eines von beidem nicht verstanden.
  if (reload === 'hot' && irreversible === true) {
    errors.push(unitError(
      'manifest_field_value',
      '"reload": "hot" mit "irreversible": true widerspricht sich: was im laufenden Prozeß zurückgenommen werden kann, ist keine Einbahnstraße.',
      `${at}#/irreversible`,
    ))
  }

  // --- requires: Selbstabhängigkeit, Duplikate, Namensform ---
  const seenRequires = new Set<string>()
  requires.forEach((required, index) => {
    const key = required.toLowerCase()
    if (name !== undefined && key === name.toLowerCase()) {
      errors.push(unitError('unit_self_dependency', `"${required}" verweist auf das Unit selbst.`, `${at}#/requires/${index}`))
    }
    if (seenRequires.has(key)) {
      errors.push(unitError('unit_dependency_duplicate', `"${required}" steht mehrfach in "requires".`, `${at}#/requires/${index}`))
    }
    seenRequires.add(key)
    errors.push(...validateUnitName(required, `${at}#/requires/${index}`))
  })

  // --- Ordnerübereinstimmung ---
  //
  // `units/README.md` sagt: „eindeutiger Name; entspricht dem Ordnernamen".
  // Die vorhandenen Units halten das nicht immer ein (`native/atomicfs` trägt
  // den Namen `pmh-atomicfs`). Deshalb ist das ein **Befund mit Warncharakter**
  // und kein Ablehnungsgrund: der Name ist die Identität, der Ordner ist der
  // Ablageort — eine Abweichung soll sichtbar sein, aber nicht blockieren.
  const warnings: UnitError[] = []
  if (name !== undefined && source.directory !== undefined) {
    const expected = directoryNameFor(name)
    const actual = basename(resolve(source.directory))
    if (expected.toLowerCase() !== actual.toLowerCase()) {
      warnings.push(unitError(
        'unit_name_directory_mismatch',
        `"name" ist "${name}", der Ordner heißt aber "${actual}"; erwartet wird "${expected}".`,
        `${at}#/name`,
        { expected, actual },
      ))
    }
  }

  if (errors.length > 0) return invalid(errors, warnings)
  return valid({
    name: name as string,
    version: version as string,
    kind: kind as UnitKind,
    language: language as UnitLanguage,
    description: description as string,
    ...(entry === undefined ? {} : { entry }),
    core: core as 'optional' | 'required_core',
    ...(contract === undefined ? {} : { contract }),
    provides,
    requires,
    platforms,
    notes,
    ...(reload === undefined ? {} : { reload }),
    ...(irreversible === undefined ? {} : { irreversible }),
    directory: source.directory === undefined ? '' : resolve(source.directory),
  }, warnings)
}

/** Der Dateiname der Deklaration. */
export const MANIFEST_FILE = 'unit.json'

/**
 * Liest das Manifest **eines Unit-Ordners**.
 *
 * Fehlt `unit.json`, ist das kein Wurf ins Leere, sondern ein Befund
 * `manifest_missing` — der Aufrufer entscheidet, ob das ein Fehler ist.
 */
export async function readManifest(
  directory: string,
  ...alternateFileNames: readonly string[]
): Promise<Validation<UnitManifest>> {
  const absolute = resolve(directory)
  const candidates = [MANIFEST_FILE, ...alternateFileNames]
  let lastError: UnitError | undefined

  for (const candidate of candidates) {
    const path = join(absolute, candidate)
    let text: string
    try {
      const info = await stat(path)
      if (!info.isFile()) continue
      text = await readFile(path, 'utf8')
    }
    catch (error) {
      const code = (error as { code?: string }).code
      if (code === 'ENOENT' || code === 'EISDIR' || code === 'ENOTDIR') {
        lastError = unitError('manifest_missing', `Kein ${candidate} in diesem Ordner.`, candidate)
        continue
      }
      return invalid([unitError('manifest_unreadable', `unit.json nicht lesbar: ${(error as Error).message}`, candidate)])
    }

    let json: unknown
    try {
      json = JSON.parse(text) as unknown
    }
    catch (error) {
      return invalid([unitError('manifest_not_json', `unit.json ist kein gültiges JSON: ${(error as Error).message}`, candidate)])
    }
    return parseManifest({ json, directory: absolute, at: candidate })
  }

  return invalid([lastError ?? unitError('manifest_missing', 'Kein unit.json in diesem Ordner.', MANIFEST_FILE)])
}

/** Liest das Manifest und wirft bei Befunden — die Kurzform für Aufrufer ohne Berichtsbedarf. */
export async function readManifestOrThrow(directory: string): Promise<UnitManifest> {
  const result = await readManifest(directory)
  if (!result.ok) throw new UnitValidationError(result.errors[0]?.code ?? 'manifest_missing', `Unit in "${directory}" ist nicht gültig`, result.errors)
  return result.value
}

/** Rendert ein Manifest kanonisch — Schlüssel stabil, ohne `directory`. */
export function serializeManifest(manifest: UnitManifest): string {
  return JSON.stringify({
    name: manifest.name,
    version: manifest.version,
    kind: manifest.kind,
    language: manifest.language,
    description: manifest.description,
    ...(manifest.entry === undefined ? {} : { entry: { command: manifest.entry.command, args: [...manifest.entry.args] } }),
    core: manifest.core,
    ...(manifest.contract === undefined ? {} : { contract: manifest.contract }),
    provides: [...manifest.provides],
    requires: [...manifest.requires],
    platforms: [...manifest.platforms],
    notes: [...manifest.notes],
    ...(manifest.reload === undefined ? {} : { reload: manifest.reload }),
    ...(manifest.irreversible === undefined ? {} : { irreversible: manifest.irreversible }),
  })
}
