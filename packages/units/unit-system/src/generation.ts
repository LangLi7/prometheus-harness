/**
 * Generationen, Zeiger, Journal — die Buchführung, die aus einem Ordner ein
 * System macht.
 *
 * **Der Schnitt, den dieses Modul zieht.**
 *
 * ```
 * harness/            DEKLARATION — versioniert, von Hand und vom Agenten gepflegt
 * .pmh/               ZUSTAND     — nicht versioniert, aus der Deklaration herstellbar
 *   generations/NNNNNN/generation.json
 *   current           was JETZT gilt
 *   next              was ein NEUER Prozeß beim Start liest
 *   journal.jsonl     append-only
 * ```
 *
 * Die Regel, die den Schnitt prüfbar macht: **was in `.pmh/` liegt, ist aus
 * `harness/` herstellbar.** Ein Zustand, der das nicht ist, ist entweder ein
 * Fehler oder eine fehlende Deklaration.
 *
 * **Warum der Zeiger eine Datei ist und keine Verknüpfung.** Gemessen am
 * 13.10.2026 auf diesem Wirt: `mklink /D` scheitert („Ihre Berechtigungen
 * reichen nicht aus"), `mklink /J` geht. NixOS schaltet mit einem Symlink um;
 * hier trägt eine Junction einen *Pfad* statt einer *Nummer* und ist nicht
 * atomar ersetzbar. Deshalb: eine Datei mit einer Zahl, geschrieben über
 * temporäre Datei plus `rename`. Der Nebengewinn ist echt — der Notausgang ist
 * ein Texteditor, kein Werkzeugkasten.
 *
 * @module @prometheus-harness/unit-system/generation
 */

import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import {
  UnitFailure,
  hoechsterTakt,
  unitError,
  type UnitReload,
} from '@prometheus-harness/unit-export'

import type { ClosureFile, ClosureUnit } from './closure.ts'
import type { DeclaredCheck } from './declaration.ts'
import type { Pruefbau } from './pruefbau.ts'
import { kanonisch, sha256Hex, digestLabel } from './hash.ts'

/** Fassung des Generationenformats. Ein höherer Wert wird abgelehnt, nicht geraten. */
export const GENERATION_FORMAT = 1

/** Die Präfixzeile des Fingerabdrucks. Ändert sie sich, sind alle Generations digests neu. */
const FINGERPRINT_PREFIX = 'pmh-generation-1'

/** Wie viele Stellen eine Generationsnummer im Ordnernamen hat. */
const NUMMER_STELLEN = 6

/** Der Zustandsordner, relativ zur Projektwurzel. */
export const STATE_DIR = '.pmh'

/** Eine Generation, wie sie auf der Platte liegt. */
export interface GenerationRecord extends GenerationInhalt {
  readonly format: 1
  /** Fortlaufend, nie wiederverwendet. Reine Buchführung — nicht Teil des Fingerabdrucks. */
  readonly number: number
  readonly createdAt: string
  /** Der Fingerabdruck über Inhalt **ohne** Nummer und Zeitpunkt. */
  readonly fingerprint: string
  /**
   * Das Ergebnis des Prüfbaus.
   *
   * **Steht bewusst NICHT im Fingerabdruck.** Der Fingerabdruck beschreibt
   * Inhalt; der Prüfbau ist eine **Messung zu einem Zeitpunkt**. Gehörte er zum
   * Fingerabdruck, wäre jeder zweite Prüflauf eine neue Generation — und „hat sich
   * etwas geändert?" wäre nicht mehr beantwortbar.
   */
  readonly pruefung?: Pruefbau
}

/** Der Inhalt einer Generation — alles, was den Fingerabdruck ausmacht. */
export interface GenerationInhalt {
  readonly core: { readonly version: string; readonly contract?: string }
  readonly platform: string
  /** Die erwartete Datenbankfassung; `null` = nicht deklariert. */
  readonly schema: number | null
  readonly units: readonly ClosureUnit[]
  readonly files: readonly ClosureFile[]
  /** Der teuerste Takt im Abschluß. */
  readonly takt: UnitReload
  /** `true`, wenn irgendein Unit eine Einbahnstraße ist. */
  readonly irreversible: boolean
  /** Der Digest der Deklaration, aus der die Generation gebaut wurde. */
  readonly declarationDigest: string
  /**
   * Ob ein Wechsel auf diese Generation einen grünen Prüfbau verlangt.
   *
   * **Es gehört in den Fingerabdruck**, weil es das Verhalten des Systems
   * ändert: eine Generation mit erzwungenem Prüfbau ist eine andere Generation
   * als dieselbe ohne.
   */
  readonly requireCheck: boolean
  /**
   * Die Prüfschritte, mit denen diese Generation geprüft wird.
   *
   * **Sie stehen im Datensatz, damit eine Generation ohne die aktuelle
   * Deklaration lesbar ist.** Ein Prüfbau, der die Prüfliste von *heute* nimmt,
   * prüft eine Generation von *gestern* gegen eine Zusage von heute — und das
   * Ergebnis wäre über eine andere Sache als die Generation.
   */
  readonly checks: readonly DeclaredCheck[]
  readonly reason?: string
}

/** Wo der Zustand liegt. */
export interface StateLayout {
  readonly projectRoot: string
  readonly stateDir: string
  readonly generationsDir: string
  readonly currentFile: string
  readonly nextFile: string
  readonly journalFile: string
  readonly keysDir: string
}

/** Baut das Zustandslayout für ein Projekt. */
export function layoutFor(projectRoot: string, stateDir: string = STATE_DIR): StateLayout {
  const wurzel = resolve(projectRoot)
  const zustand = resolve(wurzel, stateDir)
  return {
    projectRoot: wurzel,
    stateDir: zustand,
    generationsDir: join(zustand, 'generations'),
    currentFile: join(zustand, 'current'),
    nextFile: join(zustand, 'next'),
    journalFile: join(zustand, 'journal.jsonl'),
    keysDir: join(zustand, 'keys'),
  }
}

/** Legt die Zustandsordner an, falls sie fehlen. */
export async function legeLayoutAn(layout: StateLayout): Promise<void> {
  await mkdir(layout.generationsDir, { recursive: true })
  await mkdir(layout.keysDir, { recursive: true })
}

/**
 * Der Fingerabdruck einer Generation.
 *
 * Zeilenweise, sortiert, über Inhalt — **nicht** über Zeitpunkt und **nicht**
 * über die Nummer. Damit sind zwei Generationen genau dann gleich, wenn sie
 * denselben Inhalt haben: ein zweiter Bau derselben Deklaration ergibt denselben
 * Fingerabdruck und ist damit als „nichts geändert" erkennbar, statt als neue
 * Generation zu erscheinen.
 */
export function fingerabdruck(inhalt: GenerationInhalt): string {
  const zeilen: string[] = [FINGERPRINT_PREFIX]
  zeilen.push(`core\t${inhalt.core.version}\t${inhalt.core.contract ?? '*'}`)
  zeilen.push(`platform\t${inhalt.platform}`)
  zeilen.push(`schema\t${inhalt.schema === null ? '-' : String(inhalt.schema)}`)
  zeilen.push(`requireCheck\t${inhalt.requireCheck ? 'ja' : 'nein'}`)
  zeilen.push(`declaration\t${inhalt.declarationDigest}`)
  for (const unit of [...inhalt.units].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    zeilen.push(
      `unit\t${unit.name}\t${unit.version}\t${unit.kind}\t${unit.reload}\t${unit.irreversible ? 'irreversible' : 'reversible'}\t${unit.contentDigest}`,
    )
  }
  for (const datei of [...inhalt.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    zeilen.push(`file\t${datei.path}\t${datei.sha256}`)
  }
  // Die Prüfschritte gehören hinein: eine andere Prüfliste ist ein anderes
  // Versprechen an dasselbe System.
  for (const check of inhalt.checks) {
    zeilen.push(`check\t${check.name}\t${check.command}\t${check.args.join(' ')}\t${String(check.timeoutMs)}\t${check.required ? 'pflicht' : 'frei'}`)
  }
  return digestLabel(sha256Hex(`${zeilen.join('\n')}\n`))
}

/** Der Digest einer Deklaration — geht in den Fingerabdruck ein. */
export function deklarationsDigest(declaration: unknown): string {
  return digestLabel(sha256Hex(kanonisch(declaration)))
}

/** Der Ordnername einer Generation. */
export function ordnerName(number: number): string {
  if (!Number.isInteger(number) || number < 1) {
    throw new UnitFailure(unitError('generation_number_invalid', `Ungültige Generationsnummer: ${String(number)}.`))
  }
  return String(number).padStart(NUMMER_STELLEN, '0')
}

/** Der Pfad der Generationendatei. */
export function generationDatei(layout: StateLayout, number: number): string {
  return join(layout.generationsDir, ordnerName(number), 'generation.json')
}

/** Alle vorhandenen Generationsnummern, aufsteigend. */
export async function listGenerationen(layout: StateLayout): Promise<readonly number[]> {
  let eintraege
  try {
    eintraege = await readdir(layout.generationsDir, { withFileTypes: true })
  }
  catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') return []
    throw new UnitFailure(unitError('generation_store_unreadable', `Generationsordner nicht lesbar: ${(error as Error).message}`))
  }
  const nummern: number[] = []
  for (const eintrag of eintraege) {
    if (!eintrag.isDirectory()) continue
    const zahl = Number.parseInt(eintrag.name, 10)
    if (!Number.isInteger(zahl) || zahl < 1) continue
    nummern.push(zahl)
  }
  return nummern.sort((a, b) => a - b)
}

/** Die nächste freie Nummer. Nie wiederverwendet, auch nicht nach `prune`. */
export async function naechsteNummer(layout: StateLayout): Promise<number> {
  const vorhanden = await listGenerationen(layout)
  const letzte = vorhanden.length === 0 ? 0 : (vorhanden[vorhanden.length - 1] ?? 0)
  return letzte + 1
}

async function schreibeAtomar(datei: string, inhalt: string): Promise<void> {
  const temp = `${datei}.tmp-${String(process.pid)}-${String(Date.now())}`
  await writeFile(temp, inhalt, 'utf8')
  await rename(temp, datei)
}

/**
 * Schreibt eine Generation.
 *
 * **Der Zeitpunkt wandert ins Journal, nicht in den Fingerabdruck.** `createdAt`
 * steht im Datensatz, damit ein Mensch sieht, wann gebaut wurde — aber es geht
 * nicht in den Fingerabdruck ein. Sonst wäre derselbe Inhalt bei jedem Bau eine
 * andere Generation, und „hat sich etwas geändert?" wäre nicht beantwortbar.
 */
export async function schreibeGeneration(
  layout: StateLayout,
  inhalt: GenerationInhalt,
  jetzt: string = new Date().toISOString(),
): Promise<GenerationRecord> {
  await legeLayoutAn(layout)
  const number = await naechsteNummer(layout)
  const record: GenerationRecord = {
    format: GENERATION_FORMAT,
    number,
    createdAt: jetzt,
    fingerprint: fingerabdruck(inhalt),
    ...inhalt,
  }
  const ordner = join(layout.generationsDir, ordnerName(number))
  await mkdir(ordner)
  await schreibeAtomar(join(ordner, 'generation.json'), `${JSON.stringify(record, null, 2)}\n`)
  return record
}

/** Liest eine Generation. Wirft, wenn sie fehlt oder unlesbar ist. */
export async function leseGeneration(layout: StateLayout, number: number): Promise<GenerationRecord> {
  const datei = generationDatei(layout, number)
  let text: string
  try {
    text = await readFile(datei, 'utf8')
  }
  catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') {
      throw new UnitFailure(unitError('generation_missing', `Generation ${String(number)} ist nicht vorhanden.`))
    }
    throw new UnitFailure(unitError('generation_store_unreadable', `Generation ${String(number)} nicht lesbar: ${(error as Error).message}`))
  }
  let json: unknown
  try {
    json = JSON.parse(text) as unknown
  }
  catch (error) {
    throw new UnitFailure(unitError('generation_store_unreadable', `Generation ${String(number)} ist kein gültiges JSON: ${(error as Error).message}`))
  }
  const record = json as Partial<GenerationRecord>
  if (record.format !== GENERATION_FORMAT) {
    throw new UnitFailure(unitError(
      'generation_store_unreadable',
      `Generation ${String(number)} hat Format ${String(record.format)}; dieser Stand liest ${String(GENERATION_FORMAT)}.`,
    ))
  }
  return record as GenerationRecord
}

/**
 * Schreibt das Ergebnis eines Prüfbaus in eine **bestehende** Generation.
 *
 * **Der Fingerabdruck bleibt unverändert** — er beschreibt den Inhalt, und der
 * hat sich nicht geändert. Der Prüfbau ist eine Messung *an* diesem Inhalt, und
 * eine Messung, die den Gegenstand verändert, wäre keine.
 *
 * Geschrieben wird atomar über temporäre Datei plus `rename`: ein abgebrochener
 * Schreibvorgang darf keine halbe Generation hinterlassen, aus der niemand mehr
 * lesen kann, ob geprüft wurde.
 */
export async function schreibePruefung(
  layout: StateLayout,
  number: number,
  pruefung: Pruefbau,
): Promise<GenerationRecord> {
  const vorhanden = await leseGeneration(layout, number)
  const neu: GenerationRecord = { ...vorhanden, pruefung }
  await schreibeAtomar(
    join(layout.generationsDir, ordnerName(number), 'generation.json'),
    `${JSON.stringify(neu, null, 2)}\n`,
  )
  return neu
}

/** Welcher Zeiger gelesen oder geschrieben wird. */
export type ZeigerName = 'current' | 'next'/** Liest einen Zeiger. `undefined` heißt: nicht gesetzt (Generation 0). */
export async function leseZeiger(layout: StateLayout, name: ZeigerName): Promise<number | undefined> {
  const datei = name === 'current' ? layout.currentFile : layout.nextFile
  let text: string
  try {
    text = await readFile(datei, 'utf8')
  }
  catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') return undefined
    throw new UnitFailure(unitError('generation_pointer_invalid', `Zeiger "${name}" nicht lesbar: ${(error as Error).message}`))
  }
  const roh = text.trim()
  if (roh.length === 0) return undefined
  if (!/^\d+$/.test(roh)) {
    throw new UnitFailure(unitError(
      'generation_pointer_invalid',
      `Zeiger "${name}" enthält "${roh}" statt einer Nummer.`,
      name,
    ))
  }
  return Number.parseInt(roh, 10)
}

/** Schreibt einen Zeiger atomar (temporäre Datei + `rename`). */
export async function schreibeZeiger(layout: StateLayout, name: ZeigerName, number: number): Promise<void> {
  await legeLayoutAn(layout)
  const datei = name === 'current' ? layout.currentFile : layout.nextFile
  await schreibeAtomar(datei, `${String(number)}\n`)
}

/** Ein Eintrag im Journal. */
export interface JournalEintrag {
  readonly at: string
  readonly event: 'build' | 'switch' | 'boot' | 'test' | 'rollback' | 'prune' | 'import' | 'export'
  readonly generation?: number
  readonly fingerprint?: string
  readonly actor?: string
  readonly detail?: string
}

/** Hängt einen Eintrag ans Journal. Append-only: nichts wird je überschrieben. */
export async function journalAnhaengen(layout: StateLayout, eintrag: JournalEintrag): Promise<void> {
  await legeLayoutAn(layout)
  await appendFile(layout.journalFile, `${JSON.stringify(eintrag)}\n`, 'utf8')
}

/** Liest das Journal; fehlt es, ist es leer. */
export async function journalLesen(layout: StateLayout, limit = 0): Promise<readonly JournalEintrag[]> {
  let text: string
  try {
    text = await readFile(layout.journalFile, 'utf8')
  }
  catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') return []
    throw new UnitFailure(unitError('generation_journal_unreadable', `Journal nicht lesbar: ${(error as Error).message}`))
  }
  const eintraege: JournalEintrag[] = []
  for (const zeile of text.split('\n')) {
    if (zeile.trim().length === 0) continue
    try {
      eintraege.push(JSON.parse(zeile) as JournalEintrag)
    }
    catch {
      // Eine kaputte Zeile macht das Journal nicht unlesbar: der Rest gilt.
      eintraege.push({ at: '', event: 'build', detail: `unlesbare Zeile: ${zeile.slice(0, 120)}` })
    }
  }
  return limit > 0 ? eintraege.slice(-limit) : eintraege
}

/**
 * Räumt alte Generationen weg.
 *
 * **Was nie wegfällt:** die aktive Generation (`current`), die kommende (`next`)
 * und die **neueste** — auch dann, wenn `behalten` 0 wäre. Der Grund ist die
 * Rückrollbarkeit selbst: *„once an old ReplicaSet is deleted, you lose the
 * ability to rollback"*. Aufbewahren ist keine Höflichkeit, sondern die
 * Eigenschaft, die den Rückweg ausmacht.
 *
 * Was wegfällt, wird **genannt** — eine Räumung, die stillschweigend löscht, ist
 * ein Datenverlust mit freundlicher Miene.
 */
export async function raeumeAuf(
  layout: StateLayout,
  behalten: number,
): Promise<{ readonly behalten: readonly number[]; readonly entfernt: readonly number[] }> {
  const alle = await listGenerationen(layout)
  if (alle.length === 0) return { behalten: [], entfernt: [] }

  const geschuetzt = new Set<number>()
  const current = await leseZeiger(layout, 'current')
  const next = await leseZeiger(layout, 'next')
  if (current !== undefined) geschuetzt.add(current)
  if (next !== undefined) geschuetzt.add(next)
  const neueste = alle[alle.length - 1]
  if (neueste !== undefined) geschuetzt.add(neueste)

  const zuBehalten = Math.max(0, Math.trunc(behalten))
  const kandidaten = alle.filter((nummer) => !geschuetzt.has(nummer))
  // Die neuesten `zuBehalten` unter den Kandidaten bleiben zusätzlich.
  const zusätzlich = zuBehalten > 0 ? kandidaten.slice(-zuBehalten) : []
  const bleibt = new Set<number>([...geschuetzt, ...zusätzlich])

  const entfernt: number[] = []
  for (const nummer of alle) {
    if (bleibt.has(nummer)) continue
    await rm(join(layout.generationsDir, ordnerName(nummer)), { recursive: true, force: true })
    entfernt.push(nummer)
  }
  return { behalten: [...bleibt].sort((a, b) => a - b), entfernt }
}

/** Was zwischen zwei Generationen liegt. */
export interface UnitAenderung {
  readonly name: string
  readonly art: 'hinzugefuegt' | 'entfernt' | 'fassung' | 'inhalt' | 'takt'
  readonly von?: string
  readonly nach?: string
  readonly reload: UnitReload
  readonly irreversible: boolean
}

/** Der Vergleich zweier Generationen. */
export interface GenerationsVergleich {
  readonly von: number | undefined
  readonly nach: number | undefined
  readonly aenderungen: readonly UnitAenderung[]
  readonly identisch: boolean
  /** Der Takt, den der Wechsel mindestens braucht. */
  readonly benoetigt: UnitReload
  /** `true`, wenn eine Änderung nicht zurückgenommen werden kann. */
  readonly irreversible: boolean
  readonly dateienGeaendert: readonly string[]
}

/**
 * Vergleicht zwei Generationen — `undefined` steht für Generation 0, also
 * „nichts aktiv".
 */
export function vergleiche(
  von: GenerationRecord | undefined,
  nach: GenerationRecord | undefined,
): GenerationsVergleich {
  const links = new Map((von?.units ?? []).map((unit) => [unit.name.toLowerCase(), unit]))
  const rechts = new Map((nach?.units ?? []).map((unit) => [unit.name.toLowerCase(), unit]))
  const aenderungen: UnitAenderung[] = []

  const namen = [...new Set([...links.keys(), ...rechts.keys()])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  for (const schluessel of namen) {
    const alt = links.get(schluessel)
    const neu = rechts.get(schluessel)
    if (alt === undefined && neu !== undefined) {
      aenderungen.push({ name: neu.name, art: 'hinzugefuegt', nach: neu.version, reload: neu.reload, irreversible: neu.irreversible })
      continue
    }
    if (alt !== undefined && neu === undefined) {
      aenderungen.push({ name: alt.name, art: 'entfernt', von: alt.version, reload: alt.reload, irreversible: alt.irreversible })
      continue
    }
    if (alt === undefined || neu === undefined) continue
    if (alt.version !== neu.version) {
      aenderungen.push({ name: neu.name, art: 'fassung', von: alt.version, nach: neu.version, reload: neu.reload, irreversible: neu.irreversible })
      continue
    }
    if (alt.contentDigest !== neu.contentDigest) {
      aenderungen.push({ name: neu.name, art: 'inhalt', von: alt.contentDigest, nach: neu.contentDigest, reload: neu.reload, irreversible: neu.irreversible })
      continue
    }
    if (alt.reload !== neu.reload) {
      aenderungen.push({ name: neu.name, art: 'takt', von: alt.reload, nach: neu.reload, reload: neu.reload, irreversible: neu.irreversible })
    }
  }

  const dateienLinks = new Map((von?.files ?? []).map((datei) => [datei.path, datei.sha256]))
  const dateienRechts = new Map((nach?.files ?? []).map((datei) => [datei.path, datei.sha256]))
  const dateienGeaendert = [...new Set([...dateienLinks.keys(), ...dateienRechts.keys()])]
    .filter((pfad) => dateienLinks.get(pfad) !== dateienRechts.get(pfad))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  let benoetigt: UnitReload = 'hot'
  let irreversible = false
  for (const aenderung of aenderungen) {
    benoetigt = hoechsterTakt(benoetigt, aenderung.reload)
    irreversible ||= aenderung.irreversible
  }
  // Eine geänderte Schichtdatei ist mindestens `idle`: sie wird beim Start
  // gelesen, nicht im laufenden Prozeß neu bewertet.
  if (dateienGeaendert.length > 0) benoetigt = hoechsterTakt(benoetigt, 'idle')
  // Eine **geänderte** Datenbankfassung ist eine Einbahnstraße, immer. Wichtig
  // ist das Wort „geändert": der Übergang von „nicht deklariert" auf
  // „deklariert 7" ist keine Migration, sondern eine neue Auskunft. Wer beides
  // gleich behandelt, sperrt den ersten Wechsel jeder jungen Installation.
  const schemaGeaendert = von?.schema != null && nach?.schema != null && von.schema !== nach.schema
  if (schemaGeaendert) {
    benoetigt = 'boot'
    irreversible = true
  }

  return {
    von: von?.number,
    nach: nach?.number,
    aenderungen,
    identisch: aenderungen.length === 0 && dateienGeaendert.length === 0 && !schemaGeaendert,
    benoetigt,
    irreversible,
    dateienGeaendert,
  }
}
