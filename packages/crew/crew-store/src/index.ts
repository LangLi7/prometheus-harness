/**
 * `@prometheus-harness/crew-store` — wo die Crews liegen.
 *
 * ## Die eine Frage, die dieses Paket beantwortet
 *
 * Bis zum 21.10.2026 war die Crew eine **Datei** (`<home>/crew/config.json`). Das war ehrlich
 * (eine Ablage, ein Rechner) und für einen Betrieb mit **einem** Konto richtig. Prometheus ist
 * aber mehrbenutzig (`conversation_sessions.user_id`, Migration 0004) — und eine Datei kennt
 * keinen Eigentümer. Der Betreiber hat die Richtung entschieden: **Datenbank je Konto, Datei nur
 * als Rückfall.**
 *
 * ## Zwei Ablagen, ein Begriff
 *
 * | Ablage | Wer sie benutzt | Was sie kann |
 * |---|---|---|
 * | {@link fuerNutzer} / {@link sichern} | die Wege des Plugins (Sitzung → Konto) | lesen **und** schreiben, je Konto |
 * | {@link liesDatei} | der Host beim Start, ohne Datenbank | nur lesen — eine Datei hat kein Konto |
 *
 * **Die Datei wird nicht geschrieben.** Wer ohne Datenbank arbeitet, bearbeitet sie weiterhin von
 * Hand; das Panel antwortet in diesem Fall mit einer Erklärung statt mit einem halben Schreibweg.
 * Ein Schreibweg, der eine Datei ohne Eigentümer ändert, wäre die Nutzertrennung als Behauptung.
 *
 * ## Warum die Prüfung hier steht und nicht in der Oberfläche
 *
 * Die Rollen kommen aus einem Dokument, das ein Mensch schreibt — aus dem Panel, aus einer Datei,
 * aus einem `curl`. Eine Rolle, die auf die Route `crew` zeigt, wäre eine Crew in einer Crew; der
 * Harness hatte dafür nur eine Sperre im Modellwähler. {@link liesEingabe} prüft deshalb **vor**
 * jedem Schreibvorgang, und zwar mit derselben Funktion, die auch der Adapter beim Bau benutzt
 * ({@link pruefeCrew}) — nicht mit einer zweiten Fassung derselben Regel.
 *
 * @module @prometheus-harness/crew-store
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CREW_ROLLEN, istRolle, type CrewRolle } from '@prometheus-harness/crew-plan'
import { CREW_ROUTE, pruefeCrew, type CrewEintrag, type Rollenbindung, type Sprache } from '@prometheus-harness/crew-core-adapter'

/** Die höchste Zahl Crews je Konto. Eine Liste, kein Archiv. */
export const MAX_CREWS = 32

/** Die höchste Länge einer Crew-Kennung — dieselbe Grenze wie in der Tabelle. */
export const MAX_KENNUNG = 64

/** Die Form einer Kennung: wie ein Nutzername im Pfad, ohne `..` und ohne Trenner. */
export const KENNUNG_MUSTER = /^[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*$/

/**
 * Der kleinste Zugang, den dieses Paket braucht.
 *
 * **Warum eine eigene Form und nicht `SqlZugang` aus `store-postgres`.** Dieses Paket soll ohne
 * Datenbanktreiber ladbar und prüfbar bleiben; es benutzt nur `unsafe(anweisung, werte)`. Der
 * echte Zugang erfüllt diese Form strukturell — kein Cast, keine Anpassung.
 */
export interface Sql {
  unsafe(anweisung: string, werte?: readonly unknown[]): PromiseLike<unknown> | Promise<unknown>
}

/** Ein Zugang, der Transaktionen kann. */
export interface TransaktionsSql extends Sql {
  begin<T>(arbeit: (innerhalb: Sql) => Promise<T>): Promise<T>
}

/** Eine Crew, wie sie gespeichert wird. */
export interface Crewdatensatz {
  /** Die Kennung — zugleich der Modellname am Kern-Seam. */
  readonly id: string
  /** Der Name für Menschen; fehlt er, gilt die Kennung. */
  readonly name?: string
  /** Die gebundenen Rollen. */
  readonly rollen: Partial<Record<CrewRolle, Rollenbindung>>
}

/** Der Stand **eines** Kontos. */
export interface Nutzerstand {
  readonly crews: readonly Crewdatensatz[]
  /** Die Standard-Crew; `null`, wenn keine gesetzt ist. */
  readonly standard: string | null
  /** Das Projekt der Werkzeuge; `null`, wenn keines gesetzt ist. */
  readonly projekt: string | null
  /** Ob der Host die Crews dieses Kontos bedient. */
  readonly aktiv: boolean
}

/** Was ein Konto speichern will. */
export interface Nutzereingabe {
  readonly crews: readonly Crewdatensatz[]
  readonly standard: string | null
  readonly projekt: string | null
  readonly aktiv: boolean
}

/** Eine Crew **mit** ihrem Eigentümer — die Sicht, aus der der Host den Adapter baut. */
export interface FremdCrew {
  readonly nutzerId: string
  readonly crew: Crewdatensatz
}

/** Das Ergebnis einer Prüfung. */
export type Lesung =
  | { readonly ok: true; readonly wert: Nutzereingabe }
  | { readonly ok: false; readonly befunde: readonly string[] }

/** Was in der Konfigurationsdatei stand. */
export type Dateilesung =
  | { readonly art: 'fehlt'; readonly pfad: string }
  | { readonly art: 'kaputt'; readonly pfad: string; readonly grund: string }
  | {
      readonly art: 'da'
      readonly pfad: string
      readonly nutzer: string
      readonly projekt: string | null
      readonly crews: readonly Crewdatensatz[]
      readonly standard: string | null
    }

// ---------------------------------------------------------------------------
// Die Prüfung
// ---------------------------------------------------------------------------

/** Ein Objekt mit Zeichenketten-Schlüsseln, oder `undefined`. */
function alsObjekt(roh: unknown): Record<string, unknown> | undefined {
  return typeof roh === 'object' && roh !== null && !Array.isArray(roh)
    ? (roh as Record<string, unknown>)
    : undefined
}

/**
 * Die Sätze, die dieses Paket sprechen kann.
 *
 * **Englisch ist die erste Sprache, Deutsch die zweite.** Die Schlüssel sind Absichten, keine
 * deutschen Wörter; die englische Fassung ist die vollständige, die deutsche die Übersetzung.
 * Der Vorgabewert bleibt `de`, damit vorhandene Aufrufer und Prüfungen dieselben Sätze sehen.
 */
interface Meldungen {
  readonly rumpf: string
  readonly crewsFehlt: string
  readonly zuViele: (n: number) => string
  readonly crewNr: (i: number) => string
  readonly crewKeinObjekt: (i: number) => string
  readonly crewMitId: (id: string) => string
  readonly kennungFehlt: (wo: string) => string
  readonly kennungLang: (wo: string, n: number) => string
  readonly kennungForm: (wo: string, id: string) => string
  readonly doppelt: (id: string) => string
  readonly standardFehlt: (id: string) => string
  readonly standardTyp: string
  readonly rollenObjekt: (wo: string) => string
  readonly unbekannteRolle: (wo: string, rolle: string) => string
  readonly rolleBindung: (wo: string, rolle: string) => string
  readonly halbGebunden: (wo: string, rolle: string) => string
  readonly projektTyp: string
  readonly projektAufstieg: string
  readonly projektRelativ: string
  readonly aktivTyp: string
  readonly dateiKeinJson: (grund: string) => string
  readonly dateiKeinObjekt: string
  readonly dateiNutzer: string
  readonly dateiCrews: string
  readonly dateiStandard: (id: string) => string
  readonly quelleDatenbank: string
}

const MELDUNGEN: Readonly<Record<Sprache, Meldungen>> = {
  en: {
    rumpf: 'The body is not an object.',
    crewsFehlt: '"crews" is missing or is not a list.',
    zuViele: (n) => `More than ${String(n)} crews are not stored.`,
    crewNr: (i) => `Crew no. ${String(i)}`,
    crewKeinObjekt: (i) => `Crew no. ${String(i)} is not an object`,
    crewMitId: (id) => `Crew "${id}"`,
    kennungFehlt: (wo) => `${wo}: the identifier is missing`,
    kennungLang: (wo, n) => `${wo}: the identifier is longer than ${String(n)} characters`,
    kennungForm: (wo, id) =>
      `${wo}: the identifier "${id}" is not a model name (allowed: letters, digits, - _ .)`,
    doppelt: (id) => `The identifier "${id}" appears twice in the list.`,
    standardFehlt: (id) => `The default crew "${id}" is not in the list.`,
    standardTyp: '"standard" must be an identifier or empty',
    rollenObjekt: (wo) => `${wo}: "rollen" must be an object`,
    unbekannteRolle: (wo, rolle) => `${wo}: unknown role "${rolle}" (known: ${CREW_ROLLEN.join(', ')})`,
    rolleBindung: (wo, rolle) => `${wo}: role "${rolle}" is not a binding`,
    halbGebunden: (wo, rolle) => `${wo}: role "${rolle}" is half-bound (route and model must both be set)`,
    projektTyp: '"projekt" must be text',
    projektAufstieg: '"projekt" must not contain ".."',
    projektRelativ: '"projekt" must be an absolute path',
    aktivTyp: '"aktiv" must be true or false',
    dateiKeinJson: (grund) => `not JSON: ${grund}`,
    dateiKeinObjekt: 'the file contains no object',
    dateiNutzer: 'the user is missing',
    dateiCrews: 'the list "crews" is empty',
    dateiStandard: (id) => `the crew "${id}" is not in the list`,
    quelleDatenbank: 'Database',
  },
  de: {
    rumpf: 'Der Rumpf ist kein Objekt.',
    crewsFehlt: '"crews" fehlt oder ist keine Liste.',
    zuViele: (n) => `Mehr als ${String(n)} Crews werden nicht gespeichert.`,
    crewNr: (i) => `Crew Nr. ${String(i)}`,
    crewKeinObjekt: (i) => `Crew Nr. ${String(i)} ist kein Objekt`,
    crewMitId: (id) => `Crew "${id}"`,
    kennungFehlt: (wo) => `${wo}: die Kennung fehlt`,
    kennungLang: (wo, n) => `${wo}: die Kennung ist länger als ${String(n)} Zeichen`,
    kennungForm: (wo, id) =>
      `${wo}: die Kennung "${id}" taugt nicht als Modellname (erlaubt: Buchstaben, Ziffern, - _ .)`,
    doppelt: (id) => `Die Kennung "${id}" steht zweimal in der Liste.`,
    standardFehlt: (id) => `Die Standard-Crew "${id}" steht nicht in der Liste.`,
    standardTyp: '"standard" muß eine Kennung oder leer sein',
    rollenObjekt: (wo) => `${wo}: "rollen" muß ein Objekt sein`,
    unbekannteRolle: (wo, rolle) => `${wo}: unbekannte Rolle "${rolle}" (bekannt: ${CREW_ROLLEN.join(', ')})`,
    rolleBindung: (wo, rolle) => `${wo}: Rolle "${rolle}" ist keine Bindung`,
    halbGebunden: (wo, rolle) => `${wo}: Rolle "${rolle}" ist halb gebunden (Route und Modell müssen stehen)`,
    projektTyp: '"projekt" muß ein Text sein',
    projektAufstieg: '"projekt" darf kein ".." enthalten',
    projektRelativ: '"projekt" muß ein absoluter Pfad sein',
    aktivTyp: '"aktiv" muß wahr oder falsch sein',
    dateiKeinJson: (grund) => `kein JSON: ${grund}`,
    dateiKeinObjekt: 'die Datei enthält kein Objekt',
    dateiNutzer: 'der Nutzer fehlt',
    dateiCrews: 'die Liste "crews" ist leer',
    dateiStandard: (id) => `die Crew "${id}" steht nicht in der Liste`,
    quelleDatenbank: 'Datenbank',
  },
}

/** Die Sätze in der gewählten Sprache. */
function texte(sprache: Sprache): Meldungen {
  return MELDUNGEN[sprache]
}

/**
 * Liest die Rollenbindungen einer Crew.
 *
 * **Unbekannte Rollen sind ein Befund, kein stilles Weglassen.** Wer `executer` schreibt, meint
 * `executor`; ihn zu übergehen hieße, eine Crew ohne diese Rolle zu speichern und den Fehler erst
 * beim Lauf zu sehen.
 *
 * @param roh - der Rohwert aus JSON
 * @param wo - der Ort für die Meldung (z. B. `"Crew \"crew-1\""`)
 * @param befunde - die Sammelliste
 * @returns die Rollen, soweit lesbar
 */
function leseRollen(
  roh: unknown,
  wo: string,
  befunde: string[],
  sprache: Sprache,
): Partial<Record<CrewRolle, Rollenbindung>> {
  const t = texte(sprache)
  const rollen: Partial<Record<CrewRolle, Rollenbindung>> = {}
  const objekt = alsObjekt(roh)
  if (objekt === undefined) {
    befunde.push(t.rollenObjekt(wo))
    return rollen
  }
  for (const [rolle, wert] of Object.entries(objekt)) {
    if (!istRolle(rolle)) {
      befunde.push(t.unbekannteRolle(wo, rolle))
      continue
    }
    const bindung = alsObjekt(wert)
    if (bindung === undefined) {
      befunde.push(t.rolleBindung(wo, rolle))
      continue
    }
    const familie = typeof bindung['familie'] === 'string' ? bindung['familie'].trim() : ''
    const modell = typeof bindung['modell'] === 'string' ? bindung['modell'].trim() : ''
    if (familie === '' || modell === '') {
      befunde.push(t.halbGebunden(wo, rolle))
      continue
    }
    rollen[rolle] = { familie, modell }
  }
  return rollen
}

/**
 * Liest eine Crew aus einem Rohwert.
 *
 * @param roh - der Rohwert
 * @param nummer - die Position in der Liste (für die Meldung)
 * @param befunde - die Sammelliste
 * @returns die Crew oder `undefined`, wenn sie unlesbar ist
 */
function leseCrew(
  roh: unknown,
  nummer: number,
  befunde: string[],
  sprache: Sprache,
): Crewdatensatz | undefined {
  const t = texte(sprache)
  const objekt = alsObjekt(roh)
  if (objekt === undefined) {
    befunde.push(t.crewKeinObjekt(nummer))
    return undefined
  }
  const id = typeof objekt['id'] === 'string' ? objekt['id'].trim() : ''
  const wo = id === '' ? t.crewNr(nummer) : t.crewMitId(id)
  if (id === '') {
    befunde.push(t.kennungFehlt(wo))
    return undefined
  }
  if (id.length > MAX_KENNUNG) {
    befunde.push(t.kennungLang(wo, MAX_KENNUNG))
  }
  if (!KENNUNG_MUSTER.test(id)) {
    befunde.push(t.kennungForm(wo, id))
  }
  const name = typeof objekt['name'] === 'string' && objekt['name'].trim() !== ''
    ? objekt['name'].trim()
    : undefined
  const rollen = leseRollen(objekt['rollen'], wo, befunde, sprache)
  const crew: Crewdatensatz = { id, ...(name === undefined ? {} : { name }), rollen }
  // **Dieselbe Prüfung wie der Adapter.** Sie ergänzt, was hier fehlt: keine Rolle, `crew` als
  // Route, zu viele Rollen — in derselben Sprache wie die Befunde dieses Pakets.
  befunde.push(...pruefeCrew(crew as CrewEintrag, sprache).map((meldung) => `${wo}: ${meldung}`))
  return crew
}

/** Ein Projektpfad, wie ihn die Tabelle zuläßt. */
function pruefeProjekt(roh: unknown, befunde: string[], sprache: Sprache): string | null {
  const t = texte(sprache)
  if (roh === undefined || roh === null) return null
  if (typeof roh !== 'string') {
    befunde.push(t.projektTyp)
    return null
  }
  const pfad = roh.trim()
  if (pfad === '') return null
  if (pfad.includes('..')) {
    befunde.push(t.projektAufstieg)
    return null
  }
  if (!/^([A-Za-z]:[\\/]|\/)/.test(pfad)) {
    befunde.push(t.projektRelativ)
    return null
  }
  return pfad
}

/**
 * Prüft, was ein Konto speichern will.
 *
 * @param roh - der Rumpf des `PUT`
 * @param sprache - die Sprache der Befunde (Vorgabe `de`; Englisch ist die erste Sprache)
 * @returns die geprüfte Eingabe oder die Befunde
 */
export function liesEingabe(roh: unknown, sprache: Sprache = 'de'): Lesung {
  const t = texte(sprache)
  const befunde: string[] = []
  const objekt = alsObjekt(roh)
  if (objekt === undefined) return { ok: false, befunde: [t.rumpf] }

  if (!Array.isArray(objekt['crews'])) {
    return { ok: false, befunde: [t.crewsFehlt] }
  }
  if (objekt['crews'].length > MAX_CREWS) {
    befunde.push(t.zuViele(MAX_CREWS))
  }

  const gesehen = new Set<string>()
  const crews: Crewdatensatz[] = []
  objekt['crews'].slice(0, MAX_CREWS).forEach((eintrag, index) => {
    const crew = leseCrew(eintrag, index + 1, befunde, sprache)
    if (crew === undefined) return
    if (gesehen.has(crew.id)) {
      befunde.push(t.doppelt(crew.id))
      return
    }
    gesehen.add(crew.id)
    crews.push(crew)
  })

  const standardRoh = objekt['standard']
  let standard: string | null = null
  if (standardRoh !== undefined && standardRoh !== null && standardRoh !== '') {
    if (typeof standardRoh !== 'string') {
      befunde.push(t.standardTyp)
    } else {
      standard = standardRoh.trim()
      if (crews.length > 0 && !gesehen.has(standard)) {
        befunde.push(t.standardFehlt(standard))
      }
    }
  }
  if (standard === null && crews.length > 0) standard = crews[0]?.id ?? null

  const projekt = pruefeProjekt(objekt['projekt'], befunde, sprache)
  const aktivRoh = objekt['aktiv']
  const aktiv = typeof aktivRoh === 'boolean' ? aktivRoh : true
  if (aktivRoh !== undefined && typeof aktivRoh !== 'boolean') {
    befunde.push(t.aktivTyp)
  }

  if (befunde.length > 0) return { ok: false, befunde }
  return { ok: true, wert: { crews, standard, projekt, aktiv } }
}

// ---------------------------------------------------------------------------
// Die Datenbank
// ---------------------------------------------------------------------------

/** Eine Zeile aus `crew_definitionen`, wie der Treiber sie liefert. */
interface Crewzeile {
  readonly user_id?: string
  readonly crew_id: string
  readonly name: string | null
  readonly rollen: unknown
}

/** Eine Zeile aus `crew_einstellungen`. */
interface Einstellungszeile {
  readonly standard_crew: string | null
  readonly projekt: string | null
  readonly aktiv: boolean
}

/** Wandelt `rollen` aus der Datenbank in die Form, mit der der Adapter arbeitet. */
function rollenAusSpalte(roh: unknown): Partial<Record<CrewRolle, Rollenbindung>> {
  const wert = typeof roh === 'string' ? (JSON.parse(roh) as unknown) : roh
  const befunde: string[] = []
  // Die Sprache der Befunde ist hier ohne Belang: sie werden **verworfen**. Eine Zeile, die nicht
  // lesbar ist, wird zu einer Crew ohne Rolle — und der Adapter weist sie beim Bau ab.
  return leseRollen(wert, 'Datenbank', befunde, 'de')
}

/** Wandelt eine Zeile in einen Datensatz. */
function alsDatensatz(zeile: Crewzeile): Crewdatensatz {
  return {
    id: zeile.crew_id,
    ...(zeile.name === null || zeile.name === '' ? {} : { name: zeile.name }),
    rollen: rollenAusSpalte(zeile.rollen),
  }
}

/** Liest die Zeilen einer Abfrage. */
async function zeilen<T>(sql: Sql, anweisung: string, werte: readonly unknown[]): Promise<readonly T[]> {
  return (await sql.unsafe(anweisung, werte)) as readonly T[]
}

/**
 * Der Stand eines Kontos.
 *
 * **Ohne Zeile in `crew_einstellungen` gilt `aktiv: true` und keine Standard-Crew.** Ein Konto,
 * das gerade seine erste Crew anlegt, hat noch keine Einstellungen — es soll nicht auf „aus"
 * stehen, nur weil die Zeile fehlt.
 *
 * @param sql - der Zugang
 * @param nutzerId - das Konto (uuid)
 * @returns der Stand
 */
export async function fuerNutzer(sql: Sql, nutzerId: string): Promise<Nutzerstand> {
  const crews = await zeilen<Crewzeile>(
    sql,
    `select crew_id, name, rollen from crew_definitionen
      where user_id = $1::uuid
      order by created_at, crew_id`,
    [nutzerId],
  )
  const einstellungen = await zeilen<Einstellungszeile>(
    sql,
    'select standard_crew, projekt, aktiv from crew_einstellungen where user_id = $1::uuid',
    [nutzerId],
  )
  const einstellung = einstellungen[0]
  return {
    crews: crews.map(alsDatensatz),
    standard: einstellung?.standard_crew ?? null,
    projekt: einstellung?.projekt === null || einstellung?.projekt === '' ? null : (einstellung?.projekt ?? null),
    aktiv: einstellung?.aktiv ?? true,
  }
}

/**
 * Alle Crews, die der Host bedienen soll — **über alle Konten**.
 *
 * **Warum diese eine Abfrage kein `user_id` filtert.** Der Kern kennt **eine** Route `crew` und
 * **eine** Modellliste; der Adapter ist die Vereinigung der aktiven Crews. Diese Abfrage ist im
 * Kopf der Migration als solche benannt; jede andere Abfrage dieses Pakets trägt das Konto.
 *
 * @param sql - der Zugang
 * @returns die Crews mit ihrem Eigentümer, nach Konto und Kennung sortiert
 */
export async function alleAktiven(sql: Sql): Promise<readonly FremdCrew[]> {
  const zeilen2 = await zeilen<Crewzeile & { user_id: string }>(
    sql,
    `select d.user_id::text as user_id, d.crew_id, d.name, d.rollen
       from crew_definitionen d
       join crew_einstellungen e on e.user_id = d.user_id
      where e.aktiv
      order by d.user_id, d.crew_id`,
    [],
  )
  return zeilen2.map((zeile) => ({ nutzerId: zeile.user_id, crew: alsDatensatz(zeile) }))
}

/**
 * Das **eine** Konto, dem der Host Werkzeuge und Buchung zuordnen kann.
 *
 * **Warum es diese Frage gibt.** Der Kern reicht einem Werkzeug keine Sitzung und keinen Nutzer
 * (`ToolRunContext` trägt `agent.id` — eine Sitzungskennung, die heute auf kein Konto zeigt).
 * Werkzeuge und Buchung brauchen aber **ein** Konto. Solange genau **eines** existiert, ist die
 * Antwort eindeutig; bei mehreren wäre jede Wahl geraten, und geraten wird hier nicht.
 *
 * @param sql - der Zugang
 * @returns die Kennung, wenn genau ein Konto existiert
 */
export async function einzigesKonto(sql: Sql): Promise<string | undefined> {
  const konten = await zeilen<{ id: string }>(
    sql,
    'select id::text as id from users order by created_at, id limit 2',
    [],
  )
  return konten.length === 1 ? konten[0]?.id : undefined
}

/**
 * Das **eine aktive Verwalterkonto** — der Rückfall bei mehreren Konten.
 *
 * **Warum das kein Raten ist.** Ein Verwalter ist die Rolle, die die Installation führt; gibt es
 * genau **einen** aktiven, ist die Zuordnung eindeutig. Gibt es keinen oder mehrere, bleibt es bei
 * „kein Betriebskonto" — dann bietet der Host die Crews als Modelle an, ohne Werkzeuge und ohne
 * Buchung (`nurAdapter`), und der Grund steht im Protokoll.
 *
 * **Warum nicht der älteste Benutzer.** „Der erste, der sich anmeldet" ist keine Rolle, sondern
 * eine Reihenfolge; eine Abrechnung darauf wäre eine Behauptung über Zuständigkeit.
 *
 * @param sql - der Zugang
 * @returns die Kennung, wenn genau ein aktiver Verwalter existiert
 */
export async function einzigesVerwalterkonto(sql: Sql): Promise<string | undefined> {
  const konten = await zeilen<{ id: string }>(
    sql,
    `select id::text as id from users
      where role = 'admin' and disabled_at is null
      order by created_at, id
      limit 2`,
    [],
  )
  return konten.length === 1 ? konten[0]?.id : undefined
}

/** Das Ergebnis eines Schreibvorgangs. */
export type Schreibgang =
  | { readonly ok: true }
  | { readonly ok: false; readonly grund: 'belegt'; readonly crewId: string }

/**
 * Speichert den Stand eines Kontos — **in einer Transaktion**.
 *
 * **Warum eine Transaktion.** „Diese Liste ist der Stand" heißt: was fehlt, ist gelöscht. Wer
 * einzeln löscht und dann einzeln schreibt und dazwischen stürzt, hinterläßt ein halbes Konto.
 * Hier gilt entweder der alte Stand oder der neue.
 *
 * **Warum `ON CONFLICT` und kein `delete` + `insert`.** Die Zeilenidentität bleibt erhalten
 * (`created_at`), und ein zweiter Aufruf mit derselben Liste ändert nichts.
 *
 * @param sql - ein Zugang mit `begin`
 * @param nutzerId - das Konto
 * @param eingabe - die geprüfte Eingabe
 * @returns Erfolg oder die belegte Kennung
 */
export async function sichern(
  sql: TransaktionsSql,
  nutzerId: string,
  eingabe: Nutzereingabe,
): Promise<Schreibgang> {
  try {
    await sql.begin(async (tx) => {
      const kennungen = eingabe.crews.map((crew) => crew.id)
      await tx.unsafe(
        `delete from crew_definitionen
          where user_id = $1::uuid
            and not (crew_id = any ($2::text[]))`,
        [nutzerId, kennungen],
      )
      for (const crew of eingabe.crews) {
        // **Das Objekt, nicht sein JSON-Text.** Am 21.10.2026 im laufenden Host und in einer
        // eigenen Sonde gemessen: ein gebundener **Text** `{"executor":…}` kommt in einer
        // jsonb-Spalte als jsonb-**Skalar** an (ein zitierter String ist gültiges JSON), mit und
        // ohne `::jsonb`. Erst das **Objekt** ergibt `jsonb_typeof = 'object'`.
        await tx.unsafe(
          `insert into crew_definitionen (user_id, crew_id, name, rollen, updated_at)
           values ($1::uuid, $2, $3, $4, now())
           on conflict (user_id, crew_id)
           do update set name = excluded.name, rollen = excluded.rollen, updated_at = now()`,
          [nutzerId, crew.id, crew.name ?? null, crew.rollen],
        )
      }
      await tx.unsafe(
        `insert into crew_einstellungen (user_id, standard_crew, projekt, aktiv, updated_at)
         values ($1::uuid, $2, $3, $4, now())
         on conflict (user_id)
         do update set standard_crew = excluded.standard_crew,
                       projekt = excluded.projekt,
                       aktiv = excluded.aktiv,
                       updated_at = now()`,
        [nutzerId, eingabe.standard, eingabe.projekt, eingabe.aktiv],
      )
    })
    return { ok: true }
  } catch (fehler) {
    const code = (fehler as { code?: string }).code ?? ''
    const detail = (fehler as { detail?: string }).detail ?? ''
    if (code === '23505') {
      // `Key (crew_id)=(…) already exists` — die Kennung gehört einem anderen Konto.
      const treffer = /crew_id\)=\(([^)]+)\)/.exec(detail)
      return { ok: false, grund: 'belegt', crewId: treffer?.[1] ?? '' }
    }
    throw fehler
  }
}

// ---------------------------------------------------------------------------
// Die Datei — der Rückfall
// ---------------------------------------------------------------------------

/**
 * Der Pfad der Konfigurationsdatei.
 *
 * @param home - das Harness-Home
 * @returns `<home>/crew/config.json`
 */
export function konfigurationsdatei(home: string): string {
  return join(home, 'crew', 'config.json')
}

/**
 * Liest die Konfigurationsdatei — **nur lesend**.
 *
 * Drei Fälle, drei Antworten: **fehlt** (kein Fehler, der Host startet weiter), **kaputt** (ein
 * Befund, der sichtbar bleibt), **da** (geprüfte Crews). Das ist dieselbe Unterscheidung, die
 * `crew-plugin` schon trifft — hier wird sie auf die gemeinsame Prüfung gestellt, damit Datei und
 * Datenbank **eine** Grammatik haben.
 *
 * @param pfad - der Pfad der Datei
 * @param sprache - die Sprache der Befunde (Vorgabe `de`)
 * @returns die Lesung
 */
export function liesDatei(pfad: string, sprache: Sprache = 'de'): Dateilesung {
  const t = texte(sprache)
  if (!existsSync(pfad)) return { art: 'fehlt', pfad }
  let roh: unknown
  try {
    roh = JSON.parse(readFileSync(pfad, 'utf8')) as unknown
  } catch (fehler) {
    return {
      art: 'kaputt',
      pfad,
      grund: t.dateiKeinJson(fehler instanceof Error ? fehler.message : String(fehler)),
    }
  }
  const objekt = alsObjekt(roh)
  if (objekt === undefined) return { art: 'kaputt', pfad, grund: t.dateiKeinObjekt }
  const nutzer = typeof objekt['nutzer'] === 'string' ? objekt['nutzer'].trim() : ''
  if (nutzer === '') return { art: 'kaputt', pfad, grund: t.dateiNutzer }
  if (!Array.isArray(objekt['crews']) || objekt['crews'].length === 0) {
    return { art: 'kaputt', pfad, grund: t.dateiCrews }
  }
  const befunde: string[] = []
  const crews: Crewdatensatz[] = []
  objekt['crews'].forEach((eintrag, index) => {
    const crew = leseCrew(eintrag, index + 1, befunde, sprache)
    if (crew !== undefined) crews.push(crew)
  })
  if (befunde.length > 0) return { art: 'kaputt', pfad, grund: befunde.join('; ') }
  const standard = typeof objekt['crew'] === 'string' ? objekt['crew'].trim() : ''
  if (standard !== '' && !crews.some((crew) => crew.id === standard)) {
    return { art: 'kaputt', pfad, grund: t.dateiStandard(standard) }
  }
  const projekt = typeof objekt['projekt'] === 'string' && objekt['projekt'].trim() !== ''
    ? objekt['projekt'].trim()
    : null
  return {
    art: 'da',
    pfad,
    nutzer,
    projekt,
    crews,
    standard: standard === '' ? (crews[0]?.id ?? null) : standard,
  }
}

/** Die Route, unter der eine Crew selbst erscheint — hier nur für Prüfungen wieder ausgeführt. */
export const ROUTE_CREW = CREW_ROUTE
