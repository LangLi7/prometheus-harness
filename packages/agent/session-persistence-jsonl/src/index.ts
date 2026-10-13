/**
 * `@prometheus-harness/session-persistence-jsonl` — die sechste und letzte
 * Sprosse der kleinsten Kette.
 *
 * **Was hier entschieden wird.** Wie eine Sitzung auf die Platte kommt, ohne
 * dass zwei gleichzeitige Schreibvorgänge sie zerlegen (Reihenfolge), ohne dass
 * ein Absturz sie unlesbar macht (Toleranz beim Lesen) und ohne dass eine
 * Wiederaufnahme Rätsel aufgibt (Prüfung und benannter Befund).
 *
 * **Die vier Entscheidungen, jede mit einem Preis:**
 *
 * | Entscheidung | Warum | Der Preis |
 * |---|---|---|
 * | **Eine Datei je Sitzung** (`<root>/<id>/events.jsonl`) | eine Sitzung lässt sich kopieren, sichern und löschen, ohne eine Datenbank zu berühren; kein Dienst muss laufen | kein gemeinsamer Index — wer sucht, liest Verzeichnisse. Ein Index ist ein **eigenes** Paket (geplant) |
 * | **Reihenfolge im Schreibpfad** | zwei gleichzeitige `appendFile`-Aufrufe können sich überholen. Der Verlauf wäre dann falsch **geordnet** — und das fällt erst bei der Wiederaufnahme auf, also lange danach | ein Aufruf muss auf den vorigen warten. Der Gewinn ist, dass **jede Zeile genau einmal und in Reihenfolge** geschrieben wird — über einen gemeinsamen Anhängepunkt (siehe {@link SessionWriter.append}) |
 * | **Toleranter Leser** | eine abgebrochene Zeile ist ein Absturz, kein Datenverlust des Ganzen | der Leser muss melden, was er nicht lesen konnte — und das tut er ({@link ReadReport}) |
 * | **Zwei Dateien: `events.jsonl` und `meta.json`** | die Ereignisdatei ist ausschließlich **Anhängen**; ein Zustandsbild darin würde eine Änderung mitten in der Datei verlangen. Titel, Modell und Zähler sind **Zustand** und stehen deshalb getrennt | eine zusätzliche Datei, die zum Verlauf passen muss. Die Prüfung dafür steht in {@link openSession} |
 *
 * **Was dieses Paket bewusst NICHT tut:** es kennt den Agent-Loop nicht (es
 * bekommt Ereignisse), es formatiert nichts (das ist `session-format`) und es
 * kürzt keinen Kontext.
 *
 * **Wo gespeichert wird, entscheidet der Aufrufer.** Dieses Paket liest keine
 * Umgebungsvariable und kennt kein Harness-Home. Wer das Home auflösen will,
 * benutzt `@prometheus-harness/home-paths` und übergibt das Ergebnis.
 *
 * @module @prometheus-harness/session-persistence-jsonl
 */

import { appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  SESSION_FORMAT_VERSION,
  foldSession,
  parseLine,
  parseSession,
  serializeLine,
  type FoldResult,
  type ReadEvent,
  type SessionId,
} from '@prometheus-harness/session-format'

// ---------------------------------------------------------------------------
// Namen und Pfade
// ---------------------------------------------------------------------------

/** Name der Ereignisdatei innerhalb eines Sitzungsordners. */
export const EVENTS_FILENAME = 'events.jsonl'

/** Name der Zustandsdatei innerhalb eines Sitzungsordners. */
export const META_FILENAME = 'meta.json'

/** Ein Sitzungsordner, wie er auf der Platte liegt. */
export interface SessionPaths {
  /** Der Sitzungsordner. */
  readonly dir: string
  /** `<dir>/events.jsonl` */
  readonly events: string
  /** `<dir>/meta.json` */
  readonly meta: string
}

/**
 * Baut die Pfade einer Sitzung.
 *
 * **Warum hier geprüft wird und nicht beim Schreiben.** Eine Kennung, die `..`
 * oder ein Laufwerk enthält, würde die Sitzung **außerhalb** des Wurzelordners
 * anlegen. Bei einer Kennung, die aus einer Datei oder einer Eingabe kommt, ist
 * das ein Pfadausbruch — dieselbe Prüfung, die `unit-export` beim Import macht.
 *
 * @param root - der Wurzelordner aller Sitzungen
 * @param id - die Sitzungskennung
 * @returns die drei Pfade
 * @throws Error bei einer unbrauchbaren Kennung
 */
export function sessionPaths(root: string, id: SessionId): SessionPaths {
  assertUsableSessionId(id)
  const dir = join(root, id)
  return { dir, events: join(dir, EVENTS_FILENAME), meta: join(dir, META_FILENAME) }
}

/**
 * Prüft eine Sitzungskennung auf Pfadsicherheit.
 *
 * **Was abgelehnt wird:** leere Kennung, Pfadtrenner (`/`, `\`), `..`, ein
 * führender Punkt (versteckte Ordner), ein Doppelpunkt (Laufwerk oder
 * NTFS-Datenstrom), Steuerzeichen und alles über 128 Zeichen.
 *
 * **Warum ein führender Punkt verboten ist.** `..meta` wäre kein Ausbruch, aber
 * eine Sitzung, die in jeder Auflistung unsichtbar ist — und damit eine, die
 * niemand mehr findet, obwohl sie Platz belegt.
 *
 * @param id - die zu prüfende Kennung
 * @throws Error mit dem Grund
 */
export function assertUsableSessionId(id: string): void {
  if (id === '') throw new Error('Sitzungskennung ist leer')
  if (id === '.' || id === '..') throw new Error(`Sitzungskennung ist ein Pfadverweis: ${id}`)
  if (id.length > 128) throw new Error(`Sitzungskennung ist zu lang (${id.length} Zeichen, erlaubt sind 128)`)
  if (id.startsWith('.')) throw new Error(`Sitzungskennung darf nicht mit "." beginnen: ${id}`)
  for (const character of id) {
    const code = character.codePointAt(0) ?? 0
    if (character === '/' || character === '\\') throw new Error(`Sitzungskennung enthält einen Pfadtrenner: ${id}`)
    if (character === ':') throw new Error(`Sitzungskennung enthält einen Doppelpunkt: ${id}`)
    if (code < 0x20 || code === 0x7f) throw new Error(`Sitzungskennung enthält ein Steuerzeichen: ${id}`)
  }
}

/**
 * Erzeugt eine Sitzungskennung aus der Zeit.
 *
 * **Warum aus der Zeit und nicht zufällig.** Zwei Sitzungen, die im selben
 * Augenblick beginnen, sind praktisch ausgeschlossen; eine Kennung, die die
 * Zeit trägt, lässt sich dagegen **sortieren und lesen**. Bei hunderten
 * Sitzungsordnern ist das der Unterschied zwischen einem Blick und einem Skript.
 *
 * Die Form ist `2026-10-13T12-34-56-789Z-<zufall>` — ohne Doppelpunkte, weil
 * Windows sie in Dateinamen nicht zulässt.
 *
 * @param now - der Zeitpunkt; Vorgabe ist jetzt
 * @param random - Zufallsquelle in `[0, 1)`; austauschbar für Tests
 * @returns die Kennung
 */
export function newSessionId(now: Date = new Date(), random: () => number = Math.random): SessionId {
  const iso = now.toISOString().replace(/[:.]/g, '-')
  const suffix = Math.floor(random() * 0x10000)
    .toString(16)
    .padStart(4, '0')
  return `${iso}-${suffix}`
}

// ---------------------------------------------------------------------------
// Zustand (meta.json)
// ---------------------------------------------------------------------------

/** Der Zustand einer Sitzung — das, was **nicht** aus den Ereignissen folgt. */
export interface SessionMeta {
  /** Formatversion des Zustandsbildes. */
  readonly v: number
  readonly id: SessionId
  /** Titel; ein leerer Titel heißt „noch keiner". */
  readonly title: string
  /** Modellkennung, mit der die Sitzung begann. */
  readonly model: string
  /** Arbeitsverzeichnis beim Anlegen. */
  readonly cwd: string
  /** Erzeugungszeitpunkt, ISO-8601. */
  readonly createdAt: string
  /** Letzte Änderung, ISO-8601. */
  readonly updatedAt: string
  /** Zahl der geschriebenen Ereignisse. */
  readonly events: number
}

/** Die Version des Zustandsbildes. */
export const META_VERSION = 1

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

/** Einstellungen zum Anlegen einer Sitzung. */
export interface CreateOptions {
  /** Der Wurzelordner aller Sitzungen. Wird angelegt, falls er fehlt. */
  readonly root: string
  /** Die Kennung; ohne Angabe wird sie aus der Zeit erzeugt. */
  readonly id?: SessionId
  readonly model: string
  readonly cwd: string
  readonly title?: string
  /** Fassung der schreibenden Software. */
  readonly writer?: string
  /** Zeitquelle; Vorgabe ist jetzt. */
  readonly now?: () => Date
  /** Zahl der Ereignisse, die gepuffert werden, bevor geschrieben wird. Vorgabe 1. */
  readonly flushEvery?: number
}

/** Ein Schreiber auf eine Sitzung. */
export interface SessionWriter {
  /** Die Kennung. */
  readonly id: SessionId
  /** Die Pfade. */
  readonly paths: SessionPaths
  /**
   * Hängt ein Ereignis an.
   *
   * **Warum das ein Versprechen zurückgibt, obwohl die Reihenfolge intern
   * gehalten wird.** Der Aufrufer soll wissen, wann geschrieben wurde — er
   * kann darauf warten (sicher) oder es laufen lassen (schnell). Es **nicht**
   * abzuwarten ist ausdrücklich erlaubt: die Reihenfolge hält der Schreiber.
   */
  append(event: ReadEvent): Promise<void>
  /** Schreibt alles Gepufferte und aktualisiert `meta.json`. */
  flush(): Promise<void>
  /** Schreibt alles, aktualisiert den Zustand und gibt die Datei frei. */
  close(): Promise<void>
  /** Zahl der bisher angehängten Ereignisse (nicht: geschriebenen). */
  readonly appended: number
  /**
   * Setzt die Nummer, die das **nächste** Ereignis tragen muss.
   *
   * **Warum das der Schreiber selbst entscheidet.** Eine Sitzung, die
   * fortgesetzt wird, muss dort weiternummerieren, wo die letzte **gültige**
   * Zeile endete. Würde der Aufrufer die Nummern bilden, könnte er sich
   * vertun — und ein Verlauf mit doppelter Nummer ist mehrdeutig, ohne dass es
   * beim Schreiben auffällt.
   *
   * @param seq - die nächste erwartete Nummer, ab 1
   */
  setStartSequence(seq: number): void
}

class JsonlSessionWriter implements SessionWriter {
  readonly id: SessionId
  readonly paths: SessionPaths
  readonly #meta: SessionMeta
  readonly #now: () => Date
  readonly #flushEvery: number
  #buffer: string[] = []
  #appended = 0
  #written = 0
  /**
   * Die Kette der Schreibvorgänge.
   *
   * **Warum eine Kette und keine Sperre.** Zwei `appendFile`-Aufrufe auf
   * dieselbe Datei können sich überholen; das Ergebnis ist eine **falsch
   * geordnete** Datei. Eine Warteschlange macht aus „meistens richtig" ein
   * „in Reihenfolge": jeder Schreibvorgang beginnt erst, wenn der vorige
   * geendet hat.
   */
  #chain: Promise<void> = Promise.resolve()
  #closed = false
  #expectedSeq = 1
  #broken: string | undefined

  constructor(id: SessionId, paths: SessionPaths, meta: SessionMeta, now: () => Date, flushEvery: number) {
    this.id = id
    this.paths = paths
    this.#meta = meta
    this.#now = now
    this.#flushEvery = flushEvery
  }

  get appended(): number {
    return this.#appended
  }

  setStartSequence(seq: number): void {
    if (!Number.isInteger(seq) || seq < 1) {
      throw new RangeError(`Startnummer muss eine ganze Zahl ≥ 1 sein, ist ${String(seq)}`)
    }
    if (this.#appended > 0) {
      throw new Error('Die Startnummer lässt sich nicht mehr setzen — es wurde bereits angehängt')
    }
    this.#expectedSeq = seq
  }

  append(event: ReadEvent): Promise<void> {
    if (this.#closed) return Promise.reject(new Error(`Sitzung ${this.id} ist geschlossen`))
    if (this.#broken !== undefined) {
      return Promise.reject(new Error(`Sitzung ${this.id} ist abgebrochen: ${this.#broken}`))
    }
    // Die Reihenfolge wird **hier** erzwungen: eine Zeile mit falscher Nummer
    // würde den Verlauf mehrdeutig machen, und das fiele erst beim Lesen auf.
    if (event.seq !== this.#expectedSeq) {
      return Promise.reject(
        new Error(
          `Ereignis ${event.type} trägt seq ${event.seq}, erwartet war ${this.#expectedSeq} — eine Zeile mit falscher Nummer wird nicht geschrieben`,
        ),
      )
    }
    this.#expectedSeq += 1
    this.#buffer.push(serializeLine(event))
    this.#appended += 1
    if (this.#buffer.length >= this.#flushEvery) return this.#flushBuffer()
    return Promise.resolve()
  }

  async flush(): Promise<void> {
    if (this.#broken !== undefined) throw new Error(`Sitzung ${this.id} ist abgebrochen: ${this.#broken}`)
    await this.#flushBuffer()
    await this.#writeMeta()
  }

  async close(): Promise<void> {
    await this.flush()
    this.#closed = true
  }

  /**
   * Hängt den Puffer in **einem** Aufruf an — die Reihenfolge bleibt erhalten.
   *
   * **Was bei einem Schreibfehler geschieht: der Schreiber wird abgebrochen.**
   * Ein weiterer Versuch würde eine **Lücke** erzeugen, wenn der erste Aufruf
   * doch teilweise geschrieben hat; ein Weiterlaufen würde einen Verlauf
   * erzeugen, der nicht mehr vollständig ist. Der Aufrufer muss die Sitzung
   * nach einem Schreibfehler neu öffnen — dort wird geprüft, was wirklich auf
   * der Platte steht. Das ist unbequem und richtig: ein Schreibfehler ist kein
   * Zustand, in dem man weiterarbeitet.
   */
  #flushBuffer(): Promise<void> {
    if (this.#buffer.length === 0) return this.#chain
    const block = this.#buffer.join('')
    const count = this.#buffer.length
    this.#buffer = []
    this.#chain = this.#chain
      .then(() => appendFile(this.paths.events, block, 'utf8'))
      .then(() => {
        this.#written += count
      })
      .catch((cause: unknown) => {
        this.#broken = describe(cause)
        throw cause instanceof Error ? cause : new Error(this.#broken)
      })
    return this.#chain
  }

  async #writeMeta(): Promise<void> {
    await this.#chain
    const meta: SessionMeta = {
      ...this.#meta,
      v: META_VERSION,
      updatedAt: this.#now().toISOString(),
      events: this.#written,
    }
    // Erst daneben schreiben, dann umbenennen: ein Absturz mitten im Schreiben
    // lässt damit **kein** halbes Zustandsbild zurück.
    const temporary = `${this.paths.meta}.tmp`
    await writeFile(temporary, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
    await rename(temporary, this.paths.meta)
  }
}

/**
 * Legt eine Sitzung an: Ordner, Zustandsbild und die erste Zeile.
 *
 * **Die erste Zeile ist `session-start` und wird sofort geschrieben.** Eine
 * Sitzung ohne `session-start` wäre beim Lesen nicht als Sitzung erkennbar.
 *
 * @param options - Wurzel, Kennung, Modell, Arbeitsverzeichnis
 * @returns der Schreiber
 * @throws Error, wenn eine Sitzung mit dieser Kennung bereits existiert
 */
export async function createSession(options: CreateOptions): Promise<SessionWriter> {
  const now = options.now ?? ((): Date => new Date())
  const id = options.id ?? newSessionId(now())
  const paths = sessionPaths(options.root, id)

  if (await exists(paths.meta)) {
    throw new Error(`Sitzung ${id} existiert bereits unter ${paths.dir}`)
  }

  await mkdir(paths.dir, { recursive: true })
  const created = now().toISOString()
  const meta: SessionMeta = {
    v: META_VERSION,
    id,
    title: options.title ?? '',
    model: options.model,
    cwd: options.cwd,
    createdAt: created,
    updatedAt: created,
    events: 0,
  }
  await writeFile(paths.meta, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')

  const writer = new JsonlSessionWriter(id, paths, meta, now, options.flushEvery ?? 1)
  await writer.append({
    v: SESSION_FORMAT_VERSION,
    seq: 1,
    at: created,
    type: 'session-start',
    id,
    model: options.model,
    cwd: options.cwd,
    writer: options.writer ?? 'pmh/0.1.0',
  })
  await writer.flush()
  return writer
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

/** Der Bericht eines Lesevorgangs. */
export interface ReadReport {
  readonly id: SessionId
  readonly paths: SessionPaths
  /** Alle gelesenen Ereignisse. */
  readonly events: readonly ReadEvent[]
  /** Zeilen, die nicht gelesen werden konnten — mit Zeilennummer und Grund. */
  readonly problems: readonly { readonly line: number; readonly problem: string }[]
  /** Befunde beim Falten (Lücken, Ergebnisse ohne Aufruf, Unbekanntes). */
  readonly foldProblems: FoldResult['problems']
  /** Zahl der Zeilen einer **neueren** Fassung. */
  readonly futureVersions: number
  /** Der gefaltete Verlauf — die Form, die der Agent-Loop weiterbenutzen kann. */
  readonly fold: FoldResult
  /** Der Zustand aus `meta.json`, falls lesbar. */
  readonly meta: SessionMeta | undefined
  /** Ob die Datei mit einer **abgebrochenen** Zeile endet. */
  readonly truncatedTail: boolean
}

/**
 * Liest eine Sitzung.
 *
 * **Warum der Bericht und nicht nur der Verlauf.** Wer nur den Verlauf bekommt,
 * erfährt nicht, dass drei Zeilen fehlten. Bei einer Wiederaufnahme ist genau
 * das die Frage: „ist der Verlauf vollständig?" — und die Antwort steht hier,
 * nicht im Gefühl des Aufrufers.
 *
 * **Eine abgebrochene letzte Zeile wird ausdrücklich benannt** (Feld
 * `truncatedTail`): sie ist der Normalfall nach einem Absturz und **kein**
 * Schaden — aber sie ist ein Unterschied zu einer vollen Datei.
 *
 * @param root - der Wurzelordner
 * @param id - die Kennung
 * @returns der Bericht
 * @throws Error, wenn die Sitzung nicht existiert
 */
export async function readSession(root: string, id: SessionId): Promise<ReadReport> {
  const paths = sessionPaths(root, id)
  let text: string
  try {
    text = await readFile(paths.events, 'utf8')
  } catch (cause) {
    throw new Error(`Sitzung ${id} ist nicht lesbar unter ${paths.events}: ${describe(cause)}`, { cause })
  }

  const parsed = parseSession(text)
  const fold = foldSession(parsed.events)
  const meta = await readMetaSafely(paths.meta)
  const lastLine = text === '' ? '' : (text.split('\n').filter((line) => line.trim() !== '').at(-1) ?? '')
  const truncatedTail = lastLine !== '' && parseLine(lastLine).ok === false

  return {
    id,
    paths,
    events: parsed.events,
    problems: parsed.problems,
    foldProblems: fold.problems,
    futureVersions: parsed.futureVersions,
    fold,
    meta,
    truncatedTail,
  }
}

/**
 * Öffnet eine vorhandene Sitzung zum Weiterschreiben.
 *
 * **Die Prüfung, die hier stattfindet — und warum sie nötig ist.** Ein neues
 * Ereignis muss die **nächste** Nummer tragen. Eine Nummer, die schon vergeben
 * ist, macht den Verlauf mehrdeutig; eine Lücke macht ihn unvollständig. Beides
 * wird hier festgestellt, **bevor** geschrieben wird — danach ist es zu spät.
 *
 * **Was bei einer abgebrochenen letzten Zeile geschieht.** Sie wird gemeldet und
 * ihre Nummer **wiederverwendet**: die abgebrochene Zeile ist nie gültig gewesen,
 * also ist ihre Nummer frei. Wer das nicht täte, risse bei jedem Absturz eine
 * Lücke in die Nummerierung — und eine Lücke sieht wie Datenverlust aus.
 *
 * @param root - der Wurzelordner
 * @param id - die Kennung
 * @param options - Zeitquelle und Puffergröße
 * @returns der Schreiber und der Befund des bisherigen Verlaufs
 * @throws Error, wenn die Sitzung nicht existiert oder die Nummerierung bricht
 */
export async function openSession(
  root: string,
  id: SessionId,
  options: { readonly now?: () => Date; readonly flushEvery?: number } = {},
): Promise<{ readonly writer: SessionWriter; readonly report: ReadReport }> {
  const report = await readSession(root, id)
  const now = options.now ?? ((): Date => new Date())

  const realProblems = report.foldProblems.filter((problem) => problem.problem !== 'gap-in-seq')
  if (realProblems.length > 0) {
    throw new Error(
      `Sitzung ${id} ist nicht fortsetzbar: ${realProblems
        .map((problem) => `${problem.problem} bei seq ${problem.seq}`)
        .join(', ')}`,
    )
  }

  const highestSeq = report.events.reduce((max, event) => (event.seq > max ? event.seq : max), 0)
  // Eine abgebrochene letzte Zeile ist nie gültig gewesen — ihre Nummer ist frei.
  const lastSeq = report.events.at(-1)?.seq ?? 0
  const gaps = report.foldProblems.filter((problem) => problem.problem === 'gap-in-seq')
  if (gaps.length > 1 || (gaps.length === 1 && highestSeq > lastSeq + 1)) {
    throw new Error(
      `Sitzung ${id} hat Lücken in der Nummerierung: ${gaps.map((gap) => gap.seq).join(', ')}`,
    )
  }

  const meta = report.meta ?? {
    v: META_VERSION,
    id,
    title: '',
    model: '',
    cwd: '',
    createdAt: now().toISOString(),
    updatedAt: now().toISOString(),
    events: report.events.length,
  }

  // **Eine abgebrochene letzte Zeile wird entfernt, bevor weitergeschrieben
  // wird.** Ohne diesen Schritt würde das nächste Ereignis **an den Rest der
  // kaputten Zeile angehängt** — und damit wäre auch die neue, gültige Zeile
  // unlesbar. Gemessen: die Datei enthielt danach `…"type":"user-inp{"v":1,…`.
  // Der Verlust ist genau der Teil, der nie gültig geschrieben wurde.
  if (report.truncatedTail) {
    await repairTruncatedTail(report.paths.events)
  }

  const writer = new JsonlSessionWriter(id, report.paths, meta, now, options.flushEvery ?? 1)
  // Die Nummerierung setzt dort fort, wo die letzte **gültige** Zeile endete.
  writer.setStartSequence(lastSeq + 1)
  return { writer, report }
}

/**
 * Schneidet eine abgebrochene letzte Zeile ab.
 *
 * **Warum das der einzige Inhalt ist, der je verworfen wird.** Alles bis zum
 * letzten Zeilenumbruch endet mit einer vollständigen Zeile. Was danach kommt,
 * ist ein Rest ohne Umbruch — und damit nachweislich **unvollständig**, sonst
 * hätte der Schreiber ihn mit Umbruch beendet. Es gibt hier keine Deutung und
 * keine Reparatur: der Rest wird abgeschnitten.
 *
 * @param path - die Ereignisdatei
 * @returns die Zahl der entfernten Zeichen
 */
async function repairTruncatedTail(path: string): Promise<number> {
  const text = await readFile(path, 'utf8')
  const lastNewline = text.lastIndexOf('\n')
  // Kein Umbruch in der ganzen Datei: die einzige Zeile ist kaputt. Dann bleibt
  // eine leere Datei — und `openSession` hat bereits gemeldet, dass die Sitzung
  // keinen gültigen Verlauf mehr hat.
  const keep = lastNewline === -1 ? '' : text.slice(0, lastNewline + 1)
  const removed = text.length - keep.length
  if (removed > 0) await writeFile(path, keep, 'utf8')
  return removed
}

// ---------------------------------------------------------------------------
// Verwalten
// ---------------------------------------------------------------------------

/** Eine Sitzung in einer Auflistung. */
export interface SessionSummary {
  readonly id: SessionId
  readonly dir: string
  readonly meta: SessionMeta | undefined
  /** Zahl der Zeilen in der Ereignisdatei. */
  readonly lines: number
  /** Größe der Ereignisdatei in Bytes. */
  readonly bytes: number
  /** Ob die letzte Zeile abgebrochen ist. */
  readonly truncatedTail: boolean
}

/**
 * Listet alle Sitzungen eines Wurzelordners.
 *
 * **Warum das fehlerfrei sein muss.** Ein einzelner kaputter Ordner darf die
 * Auflistung nicht verhindern — sonst ist keine Sitzung mehr erreichbar. Was
 * nicht gelesen werden kann, wird **übersprungen und gezählt**, nicht geworfen.
 *
 * @param root - der Wurzelordner
 * @returns die Sitzungen, nach Kennung sortiert (die Kennung trägt die Zeit)
 */
export async function listSessions(root: string): Promise<readonly SessionSummary[]> {
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    return []
  }

  const out: SessionSummary[] = []
  for (const id of entries.sort()) {
    const paths = sessionPaths(root, id)
    try {
      const info = await stat(paths.events)
      const text = await readFile(paths.events, 'utf8')
      const lines = text.split('\n').filter((line) => line.trim() !== '')
      const lastLine = lines.at(-1) ?? ''
      out.push({
        id,
        dir: paths.dir,
        meta: await readMetaSafely(paths.meta),
        lines: lines.length,
        bytes: info.size,
        truncatedTail: lastLine !== '' && parseLine(lastLine).ok === false,
      })
    } catch {
      continue
    }
  }
  return out
}

/**
 * Benennt eine Sitzung um — nur **innerhalb** von `meta.json`.
 *
 * **Warum nur der Titel und nicht der Ordner.** Die Kennung steht in jeder
 * Ereigniszeile. Sie nachträglich zu ändern hieße, die ganze Datei
 * umzuschreiben — und jede bereits geschriebene Zeile wäre kurzzeitig falsch.
 * Der Ordner bleibt deshalb, wie er ist; der Titel ist das, was ein Mensch
 * ändern will.
 *
 * @param root - der Wurzelordner
 * @param id - die Kennung
 * @param title - der neue Titel
 */
export async function renameSession(root: string, id: SessionId, title: string): Promise<void> {
  const paths = sessionPaths(root, id)
  const meta = await readMetaSafely(paths.meta)
  if (meta === undefined) throw new Error(`Sitzung ${id} hat kein lesbares ${META_FILENAME}`)
  const updated: SessionMeta = { ...meta, v: META_VERSION, title, updatedAt: new Date().toISOString() }
  const temporary = `${paths.meta}.tmp`
  await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, 'utf8')
  await rename(temporary, paths.meta)
}

/** Löscht eine Sitzung samt Ordner. */
export async function deleteSession(root: string, id: SessionId): Promise<void> {
  const paths = sessionPaths(root, id)
  await rm(paths.dir, { recursive: true, force: true })
}

/** Prüft, ob eine Sitzung existiert. */
export async function sessionExists(root: string, id: SessionId): Promise<boolean> {
  return exists(sessionPaths(root, id).events)
}

/** Schreibt einen Verlauf als **neue** Sitzung — für Import und Tests. */
export async function writeSession(
  options: CreateOptions & { readonly events: readonly ReadEvent[] },
): Promise<SessionWriter> {
  const writer = await createSession(options)
  // Die erste Zeile hat `createSession` schon geschrieben; sie wird übersprungen,
  // wenn sie in `events` ebenfalls steht.
  for (const event of options.events) {
    if (event.seq === 1 && event.type === 'session-start') continue
    await writer.append(event)
  }
  await writer.flush()
  return writer
}

// ---------------------------------------------------------------------------
// Kleine Helfer
// ---------------------------------------------------------------------------

/** Liest `meta.json`, ohne bei einem Fehler zu werfen. */
async function readMetaSafely(path: string): Promise<SessionMeta | undefined> {
  try {
    const raw: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (typeof raw !== 'object' || raw === null) return undefined
    const candidate = raw as Partial<SessionMeta>
    if (typeof candidate.id !== 'string') return undefined
    return {
      v: typeof candidate.v === 'number' ? candidate.v : META_VERSION,
      id: candidate.id,
      title: typeof candidate.title === 'string' ? candidate.title : '',
      model: typeof candidate.model === 'string' ? candidate.model : '',
      cwd: typeof candidate.cwd === 'string' ? candidate.cwd : '',
      createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
      updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '',
      events: typeof candidate.events === 'number' ? candidate.events : 0,
    }
  } catch {
    return undefined
  }
}

/** Prüft, ob ein Pfad existiert. */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Kurze, sichere Beschreibung eines unbekannten Fehlers. */
function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}

/** Der Ordner, in dem eine Sitzung liegt — für Aufrufer, die ihn brauchen. */
export function sessionDirOf(root: string, id: SessionId): string {
  return sessionPaths(root, id).dir
}
