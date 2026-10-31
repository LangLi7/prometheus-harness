/**
 * Die Dokumente ändern und ablegen.
 *
 * ## Zwei Aufgaben in einer Datei, mit Absicht
 *
 * Der erste Teil sind **reine Funktionen**: sie ändern ein Dokument und sagen, ob sich etwas
 * geändert hat. Kein Netz, keine Uhr, kein Dateisystem — jede Regel ist damit in einem Test ohne
 * Aufräumen prüfbar.
 *
 * Der zweite Teil ist der **Speicher**: er liest und schreibt diese Dokumente, atomar und je
 * Dokument serialisiert.
 *
 * ## Warum serialisiert und nicht einfach geschrieben
 *
 * Ein Lauf führt die Schritte einer Welle **gleichzeitig** aus (`Promise.all`). Jeder Schritt
 * schreibt seinen Stand zurück. Ohne eine Kette je Dokument lesen zwei Schritte denselben alten
 * Stand, und der zweite Schreibvorgang löscht den ersten — der Plan verliert genau die Arbeit, die
 * gerade getan wurde. Der Harness hat dieselbe Kette (`state.ts:1021-1028`), und der Grund ist
 * derselbe.
 *
 * ## Warum atomar (temporär + umbenennen)
 *
 * Ein Absturz mitten im Schreiben hinterläßt sonst eine halbe Datei. Sie ist syntaktisch kein JSON,
 * wird beim Start als leer gelesen — und der Plan ist weg, während die Arbeit getan ist. Der
 * Umbenennvorgang ist auf demselben Dateisystem unteilbar: entweder der alte Stand oder der neue.
 *
 * @module @prometheus-harness/crew-plan/state
 */

import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  MAX_AUFGABEN_JE_ROLLE,
  Aufgabengrenze,
  istAufgabenstand,
  istZielstand,
  leererZustand,
  rollenstand,
  type Aufgabenstand,
  type CrewAufgabe,
  type CrewRolle,
  type CrewZustand,
  type Zielstand,
} from './types.ts'
import type { Projektbereich } from './scope.ts'

/** Eine Aufgabe, wie ein Aufrufer sie hereingibt. */
export interface Aufgabeneintrag {
  /** Stabile Kennung; ohne Angabe wird eine freie vergeben. */
  id?: string
  /** Was zu tun ist. */
  text: string
  /** Der gewünschte Stand; ohne Angabe bleibt der bisherige, sonst `pending`. */
  stand?: Aufgabenstand
}

/** Das Ergebnis einer Änderung. */
export interface Aenderung {
  /** Das Dokument nach der Änderung. */
  zustand: CrewZustand
  /** Ob wirklich etwas geschrieben wurde. */
  geaendert: boolean
}

/** Wie der Speicher gebaut wird. */
export interface Speicheroptionen {
  /** Das Verzeichnis der Plandokumente; fehlt es, bleibt alles im Arbeitsspeicher. */
  verzeichnis?: string
  /** Die Uhr; im Test setzbar. */
  jetzt?: () => Date
}

/**
 * Beschneidet eine Aufgabenliste auf die Grenze.
 *
 * **Was zuerst fällt:** die **älteste erledigte** Aufgabe. Eine offene Aufgabe ist Arbeit, die noch
 * aussteht; sie zu verlieren hieße, den Plan zu beschneiden, statt ihn zu Ende zu bringen. Erst
 * wenn die Grenze auch mit lauter offenen Aufgaben überschritten wäre, gibt es einen Fehler.
 *
 * @param rolle - die Rolle, zu der die Liste gehört (für die Meldung)
 * @param aufgaben - die Liste
 * @returns die Liste innerhalb der Grenze
 * @throws Aufgabengrenze wenn zu viele **offene** Aufgaben übrig blieben
 */
export function beschraenkeAufgaben(rolle: CrewRolle, aufgaben: CrewAufgabe[]): CrewAufgabe[] {
  if (aufgaben.length <= MAX_AUFGABEN_JE_ROLLE) return aufgaben
  let rest = [...aufgaben]
  let i = 0
  while (rest.length > MAX_AUFGABEN_JE_ROLLE && i < rest.length) {
    const eintrag = rest[i]
    if (eintrag !== undefined && eintrag.stand === 'completed') {
      rest = [...rest.slice(0, i), ...rest.slice(i + 1)]
      continue
    }
    i += 1
  }
  if (rest.length > MAX_AUFGABEN_JE_ROLLE) throw new Aufgabengrenze(rolle, rest.length)
  return rest
}

/**
 * Setzt das dauerhafte Ziel einer Rolle.
 *
 * @param zustand - das Dokument
 * @param rolle - die Rolle
 * @param text - das Ziel; ein leerer Text wird abgewiesen
 * @param stand - der Zustand des Ziels
 * @param jetzt - der Zeitpunkt (ISO 8601)
 * @returns ob sich etwas geändert hat
 */
export function setzeZiel(
  zustand: CrewZustand,
  rolle: CrewRolle,
  text: string,
  stand: Zielstand,
  jetzt: string,
): boolean {
  const sauber = text.trim()
  if (sauber === '') throw new Error(`Rolle "${rolle}": ein leeres Ziel wird nicht gespeichert`)
  const rueckstand = rollenstand(zustand, rolle)
  const vorher = rueckstand.ziel
  if (vorher !== undefined && vorher.text === sauber && vorher.stand === stand) return false
  rueckstand.ziel = { text: sauber, stand, aktualisiert: jetzt }
  zustand.aktualisiert = jetzt
  return true
}

/**
 * Schreibt die **vollständige** Aufgabenliste einer Rolle.
 *
 * **Welche Aufgaben überleben.** Eine Kennung, die schon existiert, behält ihren Stand — es sei
 * denn, der Eintrag nennt ausdrücklich einen. Erledigte Aufgaben, die der neue Plan nicht mehr
 * nennt, bleiben erhalten, solange `behalteErledigte` gilt: sie sind der Nachweis getaner Arbeit.
 *
 * @param zustand - das Dokument
 * @param rolle - die Rolle
 * @param eintraege - die vollständige Liste
 * @param jetzt - der Zeitpunkt (ISO 8601)
 * @param behalteErledigte - erledigte Aufgaben behalten, die nicht mehr genannt werden (Vorgabe ja)
 * @returns ob sich etwas geändert hat
 */
export function setzeAufgaben(
  zustand: CrewZustand,
  rolle: CrewRolle,
  eintraege: readonly Aufgabeneintrag[],
  jetzt: string,
  behalteErledigte = true,
): boolean {
  const rueckstand = rollenstand(zustand, rolle)
  const vorher = new Map(rueckstand.aufgaben.map((aufgabe) => [aufgabe.id, aufgabe]))
  const gesehen = new Set<string>()
  const neu: CrewAufgabe[] = []

  for (const eintrag of eintraege) {
    const text = eintrag.text.trim()
    if (text === '') continue
    const id = eintrag.id?.trim() !== undefined && eintrag.id?.trim() !== '' ? eintrag.id.trim() : freieId(vorher, gesehen)
    if (gesehen.has(id)) continue
    gesehen.add(id)
    const alt = vorher.get(id)
    const stand = eintrag.stand ?? alt?.stand ?? 'pending'
    neu.push({
      id,
      text,
      stand,
      erstellt: alt?.erstellt ?? jetzt,
      aktualisiert: alt !== undefined && alt.text === text && alt.stand === stand ? alt.aktualisiert : jetzt,
    })
  }

  if (behalteErledigte) {
    for (const alt of rueckstand.aufgaben) {
      if (alt.stand === 'completed' && !gesehen.has(alt.id)) neu.push(alt)
    }
  }

  const beschraenkt = beschraenkeAufgaben(rolle, neu)
  const gleich = beschraenkt.length === rueckstand.aufgaben.length
    && beschraenkt.every((aufgabe, i) => {
      const alt = rueckstand.aufgaben[i]
      return alt !== undefined && alt.id === aufgabe.id && alt.text === aufgabe.text
        && alt.stand === aufgabe.stand && alt.aktualisiert === aufgabe.aktualisiert
    })
  if (gleich) return false
  rueckstand.aufgaben = beschraenkt
  zustand.aktualisiert = jetzt
  return true
}

/**
 * Ändert **eine** Aufgabe: anlegen, umstellen oder umbenennen.
 *
 * @param zustand - das Dokument
 * @param rolle - die Rolle
 * @param id - die Kennung
 * @param stand - der neue Stand; fehlt er, bleibt der bisherige
 * @param jetzt - der Zeitpunkt (ISO 8601)
 * @param text - ein neuer Text für eine **vorhandene** Aufgabe; fehlt er, bleibt der bisherige
 * @returns ob sich etwas geändert hat
 */
export function setzeAufgabenstand(
  zustand: CrewZustand,
  rolle: CrewRolle,
  id: string,
  stand: Aufgabenstand | undefined,
  jetzt: string,
  text?: string,
): boolean {
  const kennung = id.trim()
  if (kennung === '') throw new Error('eine Aufgabe ohne Kennung laesst sich nicht aendern')
  const rueckstand = rollenstand(zustand, rolle)
  const vorhanden = rueckstand.aufgaben.find((aufgabe) => aufgabe.id === kennung)
  if (vorhanden === undefined) {
    const neuerText = text?.trim() ?? ''
    if (neuerText === '') {
      throw new Error(`Rolle "${rolle}": Aufgabe "${kennung}" gibt es nicht — zum Anlegen einen Text mitgeben`)
    }
    rueckstand.aufgaben = beschraenkeAufgaben(rolle, [
      ...rueckstand.aufgaben,
      { id: kennung, text: neuerText, stand: stand ?? 'pending', erstellt: jetzt, aktualisiert: jetzt },
    ])
    zustand.aktualisiert = jetzt
    return true
  }
  const neuerText = text?.trim() !== undefined && text.trim() !== '' ? text.trim() : vorhanden.text
  const neuerStand = stand ?? vorhanden.stand
  if (neuerText === vorhanden.text && neuerStand === vorhanden.stand) return false
  vorhanden.text = neuerText
  vorhanden.stand = neuerStand
  vorhanden.aktualisiert = jetzt
  zustand.aktualisiert = jetzt
  return true
}

/**
 * Legt eine Aufgabe an und gibt ihre Kennung zurück.
 *
 * @param zustand - das Dokument
 * @param rolle - die Rolle
 * @param text - was zu tun ist
 * @param jetzt - der Zeitpunkt (ISO 8601)
 * @param id - eine gewünschte Kennung; sonst wird eine freie vergeben
 * @returns die Kennung der neuen Aufgabe
 * @throws Error wenn der Text leer ist oder die Kennung schon vergeben
 */
export function fuegeAufgabeHinzu(
  zustand: CrewZustand,
  rolle: CrewRolle,
  text: string,
  jetzt: string,
  id?: string,
): string {
  const sauber = text.trim()
  if (sauber === '') throw new Error(`Rolle "${rolle}": eine Aufgabe ohne Text wird nicht angelegt`)
  const rueckstand = rollenstand(zustand, rolle)
  const vorhanden = new Map(rueckstand.aufgaben.map((aufgabe) => [aufgabe.id, aufgabe]))
  const gewuenscht = id?.trim()
  const kennung = gewuenscht !== undefined && gewuenscht !== '' ? gewuenscht : freieId(vorhanden, new Set())
  if (rueckstand.aufgaben.some((aufgabe) => aufgabe.id === kennung)) {
    throw new Error(`Rolle "${rolle}": Aufgabe "${kennung}" gibt es schon`)
  }
  rueckstand.aufgaben = beschraenkeAufgaben(rolle, [
    ...rueckstand.aufgaben,
    { id: kennung, text: sauber, stand: 'pending', erstellt: jetzt, aktualisiert: jetzt },
  ])
  zustand.aktualisiert = jetzt
  return kennung
}

/**
 * Entfernt eine Aufgabe.
 *
 * @param zustand - das Dokument
 * @param rolle - die Rolle
 * @param id - die Kennung
 * @returns ob eine Aufgabe entfernt wurde
 */
export function entferneAufgabe(zustand: CrewZustand, rolle: CrewRolle, id: string): boolean {
  const rueckstand = rollenstand(zustand, rolle)
  const rest = rueckstand.aufgaben.filter((aufgabe) => aufgabe.id !== id)
  if (rest.length === rueckstand.aufgaben.length) return false
  rueckstand.aufgaben = rest
  return true
}

/**
 * Setzt das Ziel des Projekts.
 *
 * @param zustand - das Dokument
 * @param text - das Ziel
 * @param stand - der Zustand des Ziels
 * @param jetzt - der Zeitpunkt (ISO 8601)
 * @returns ob sich etwas geändert hat
 */
export function setzeWorkspaceZiel(
  zustand: CrewZustand,
  text: string,
  stand: Zielstand,
  jetzt: string,
): boolean {
  const sauber = text.trim()
  if (sauber === '') throw new Error('ein leeres Projektziel wird nicht gespeichert')
  const workspace = zustand.workspace ?? { projekte: [] }
  zustand.workspace = workspace
  const vorher = workspace.ziel
  if (vorher !== undefined && vorher.text === sauber && vorher.stand === stand) return false
  workspace.ziel = { text: sauber, stand, aktualisiert: jetzt }
  zustand.aktualisiert = jetzt
  return true
}

/**
 * Schreibt einen Arbeitsstrom (eine benannte Liste auf Projektebene).
 *
 * @param zustand - das Dokument
 * @param id - die Kennung des Arbeitsstroms
 * @param name - der Anzeigename; fehlt er, bleibt der bisherige
 * @param eintraege - die vollständige Aufgabenliste
 * @param jetzt - der Zeitpunkt (ISO 8601)
 * @param behalteErledigte - erledigte Aufgaben behalten (Vorgabe ja)
 * @returns ob sich etwas geändert hat
 */
export function schreibeProjektliste(
  zustand: CrewZustand,
  id: string,
  name: string | undefined,
  eintraege: readonly Aufgabeneintrag[],
  jetzt: string,
  behalteErledigte = true,
): boolean {
  const kennung = id.trim()
  if (kennung === '') throw new Error('ein Arbeitsstrom ohne Kennung wird nicht angelegt')
  const workspace = zustand.workspace ?? { projekte: [] }
  zustand.workspace = workspace
  const vorhanden = workspace.projekte.find((liste) => liste.id === kennung)
  const aufgaben = baueListe(vorhanden?.aufgaben ?? [], eintraege, jetzt, behalteErledigte)
  const neuerName = name?.trim() !== undefined && name.trim() !== '' ? name.trim() : vorhanden?.name ?? kennung

  if (vorhanden === undefined) {
    workspace.projekte = [...workspace.projekte, { id: kennung, name: neuerName, aufgaben }]
    zustand.aktualisiert = jetzt
    return true
  }
  if (vorhanden.name === neuerName && gleichListe(vorhanden.aufgaben, aufgaben)) return false
  vorhanden.name = neuerName
  vorhanden.aufgaben = aufgaben
  zustand.aktualisiert = jetzt
  return true
}

/**
 * Benennt einen Arbeitsstrom um.
 *
 * @param zustand - das Dokument
 * @param id - die Kennung
 * @param name - der neue Name
 * @returns ob sich etwas geändert hat
 */
export function benenneProjektliste(zustand: CrewZustand, id: string, name: string): boolean {
  const liste = zustand.workspace?.projekte.find((eintrag) => eintrag.id === id)
  if (liste === undefined) throw new Error(`Arbeitsstrom "${id}" gibt es nicht`)
  const sauber = name.trim()
  if (sauber === '' || sauber === liste.name) return false
  liste.name = sauber
  return true
}

/**
 * Entfernt einen Arbeitsstrom.
 *
 * @param zustand - das Dokument
 * @param id - die Kennung
 * @returns ob einer entfernt wurde
 */
export function entferneProjektliste(zustand: CrewZustand, id: string): boolean {
  const workspace = zustand.workspace
  if (workspace === undefined) return false
  const rest = workspace.projekte.filter((liste) => liste.id !== id)
  if (rest.length === workspace.projekte.length) return false
  workspace.projekte = rest
  return true
}

/**
 * Setzt den Zustand eines Arbeitsstroms — gemeint ist der Zustand seiner Aufgaben.
 *
 * @param zustand - das Dokument
 * @param id - die Kennung des Arbeitsstroms
 * @param stand - der neue Stand
 * @param jetzt - der Zeitpunkt (ISO 8601)
 * @returns ob sich etwas geändert hat
 */
export function setzeProjektstand(zustand: CrewZustand, id: string, stand: Aufgabenstand, jetzt: string): boolean {
  const liste = zustand.workspace?.projekte.find((eintrag) => eintrag.id === id)
  if (liste === undefined) throw new Error(`Arbeitsstrom "${id}" gibt es nicht`)
  let geaendert = false
  for (const aufgabe of liste.aufgaben) {
    if (aufgabe.stand === stand) continue
    aufgabe.stand = stand
    aufgabe.aktualisiert = jetzt
    geaendert = true
  }
  if (geaendert) zustand.aktualisiert = jetzt
  return geaendert
}

/**
 * Wie viele Aufgaben einer Rolle noch offen sind.
 *
 * @param zustand - das Dokument
 * @param rolle - die Rolle
 * @returns die Zahl der Aufgaben, die nicht `completed` sind
 */
export function offeneAufgaben(zustand: CrewZustand, rolle: CrewRolle): number {
  const aufgaben = zustand.rollen[rolle]?.aufgaben ?? []
  return aufgaben.filter((aufgabe) => aufgabe.stand !== 'completed').length
}

/** Was ein Dokument über eine Rolle aussagt. */
export interface Rollenuebersicht {
  rolle: CrewRolle
  zielText?: string
  zielStand?: Zielstand
  offen: number
  erledigt: number
  gesamt: number
}

/** Was ein Dokument insgesamt aussagt. */
export interface Uebersicht {
  crew: string
  nutzer: string
  projekt: string
  rollen: Rollenuebersicht[]
  projektebene?: { zielText?: string; zielStand?: Zielstand; arbeitsstroeme: number }
}

/**
 * Fasst ein Dokument für eine Anzeige zusammen.
 *
 * @param zustand - das Dokument
 * @returns die Zusammenfassung ohne Aufgabenliste
 */
export function zusammenfassung(zustand: CrewZustand): Uebersicht {
  const rollen: Rollenuebersicht[] = []
  for (const [rolle, stand] of Object.entries(zustand.rollen)) {
    if (stand === undefined) continue
    const eintrag: Rollenuebersicht = {
      rolle: rolle as CrewRolle,
      offen: stand.aufgaben.filter((aufgabe) => aufgabe.stand !== 'completed').length,
      erledigt: stand.aufgaben.filter((aufgabe) => aufgabe.stand === 'completed').length,
      gesamt: stand.aufgaben.length,
    }
    if (stand.ziel !== undefined) {
      eintrag.zielText = stand.ziel.text
      eintrag.zielStand = stand.ziel.stand
    }
    rollen.push(eintrag)
  }
  const uebersicht: Uebersicht = {
    crew: zustand.crew,
    nutzer: zustand.nutzer,
    projekt: zustand.projekt,
    rollen,
  }
  if (zustand.workspace !== undefined) {
    const ebene: { zielText?: string; zielStand?: Zielstand; arbeitsstroeme: number } = {
      arbeitsstroeme: zustand.workspace.projekte.length,
    }
    if (zustand.workspace.ziel !== undefined) {
      ebene.zielText = zustand.workspace.ziel.text
      ebene.zielStand = zustand.workspace.ziel.stand
    }
    uebersicht.projektebene = ebene
  }
  return uebersicht
}

/**
 * Der Speicher für Plandokumente.
 *
 * **Ein Speicher je Verzeichnis.** Zwei Speicher auf demselben Verzeichnis haben zwei Ketten und
 * würden einander überschreiben; der Aufrufer hält deshalb **einen**.
 */
export class CrewZustandSpeicher {
  private readonly wurzel: string | undefined
  private readonly jetzt: () => Date
  private readonly kette = new Map<string, Promise<unknown>>()
  private readonly zwischenspeicher = new Map<string, { zustand: CrewZustand; stempel: string }>()
  private readonly imSpeicher = new Map<string, CrewZustand>()

  /**
   * @param optionen - Verzeichnis und Uhr
   */
  constructor(optionen: Speicheroptionen = {}) {
    this.wurzel = optionen.verzeichnis
    this.jetzt = optionen.jetzt ?? (() => new Date())
  }

  /** Das Verzeichnis der Dokumente; `undefined` heißt „nur im Arbeitsspeicher". */
  get verzeichnis(): string | undefined {
    return this.wurzel
  }

  /**
   * Der Pfad eines Dokuments.
   *
   * @param crew - die Crew
   * @param bereich - Nutzer und Projekt
   * @returns `<verzeichnis>/<nutzer>/<crew>/<projekt>.json` oder `undefined` ohne Verzeichnis
   */
  pfadVon(crew: string, bereich: Projektbereich): string | undefined {
    if (this.wurzel === undefined) return undefined
    return join(this.wurzel, bereich.nutzer, pruefeSegment(crew), `${bereich.label}.json`)
  }

  /**
   * Liest ein Dokument.
   *
   * Ein fehlendes Dokument ist der Normalfall beim ersten Zugriff und ergibt ein leeres. Ein
   * **unlesbares** Dokument (kein JSON) ergibt ebenfalls ein leeres — aber der nächste Schreibvorgang
   * legt es danach sauber an. Ein Dokument, das zwar JSON, aber kein Objekt ist, ist dagegen ein
   * Fehler: es sieht aus wie ein Plan und ist keiner.
   *
   * @param crew - die Crew
   * @param bereich - Nutzer und Projekt
   * @returns das Dokument
   */
  async lesen(crew: string, bereich: Projektbereich): Promise<CrewZustand> {
    const schluessel = this.schluessel(crew, bereich)
    const pfad = this.pfadVon(crew, bereich)
    if (pfad === undefined) {
      return this.imSpeicher.get(schluessel) ?? leererZustand(this.leer(crew, bereich))
    }
    const stempel = await this.stempel(pfad)
    const zwischen = this.zwischenspeicher.get(schluessel)
    if (zwischen !== undefined && zwischen.stempel === stempel) return zwischen.zustand
    const zustand = await diesemLesen(pfad, () => this.leer(crew, bereich))
    this.zwischenspeicher.set(schluessel, { zustand, stempel })
    return zustand
  }

  /**
   * Ändert ein Dokument, atomar und je Dokument serialisiert.
   *
   * @param crew - die Crew
   * @param bereich - Nutzer und Projekt
   * @param mutiere - die Änderung; Rückgabe `true` heißt „schreiben"
   * @returns das Dokument und ob es geändert wurde
   */
  async aendern(
    crew: string,
    bereich: Projektbereich,
    mutiere: (zustand: CrewZustand, jetztIso: string) => boolean,
  ): Promise<Aenderung> {
    const schluessel = this.schluessel(crew, bereich)
    const lauf = this.reiht(schluessel, async () => {
      const jetztIso = this.jetzt().toISOString()
      const zustand = await this.lesen(crew, bereich)
      let geaendert = false
      try {
        geaendert = mutiere(zustand, jetztIso)
      } catch (fehler) {
        // Eine gescheiterte Änderung darf als Änderung gelten, wenn sie **vor** dem Fehler etwas
        // geschrieben hat — deshalb entscheidet der Aufrufer über die Rückgabe, nicht der Fehler.
        this.zwischenspeicher.delete(schluessel)
        throw fehler
      }
      if (!geaendert) return { zustand, geaendert: false }
      zustand.aktualisiert = jetztIso
      await this.schreibe(crew, bereich, zustand)
      return { zustand, geaendert: true }
    })
    return lauf
  }

  /**
   * Der letzte gelesene Stand, ohne das Dateisystem zu fragen.
   *
   * @param crew - die Crew
   * @param bereich - Nutzer und Projekt
   * @returns der Stand oder `undefined`, wenn noch nichts gelesen wurde
   */
  blick(crew: string, bereich: Projektbereich): CrewZustand | undefined {
    const schluessel = this.schluessel(crew, bereich)
    return this.zwischenspeicher.get(schluessel)?.zustand ?? this.imSpeicher.get(schluessel)
  }

  private leer(crew: string, bereich: Projektbereich): { crew: string; nutzer: string; projekt: string; jetzt: string } {
    return { crew, nutzer: bereich.nutzer, projekt: bereich.label, jetzt: this.jetzt().toISOString() }
  }

  private schluessel(crew: string, bereich: Projektbereich): string {
    return `${crew}\u0000${bereich.nutzer}\u0000${bereich.label}`
  }

  private reiht<T>(schluessel: string, lauf: () => Promise<T>): Promise<T> {
    const vorher = this.kette.get(schluessel) ?? Promise.resolve()
    const naechste = vorher.then(lauf, lauf)
    this.kette.set(
      schluessel,
      naechste.then(
        () => {
          if (this.kette.get(schluessel) === naechste) this.kette.delete(schluessel)
        },
        () => {
          if (this.kette.get(schluessel) === naechste) this.kette.delete(schluessel)
        },
      ),
    )
    return naechste
  }

  private async stempel(pfad: string): Promise<string> {
    try {
      const angabe = await stat(pfad)
      return `${String(angabe.mtimeMs)}:${String(angabe.size)}`
    } catch {
      return 'fehlt'
    }
  }

  private async schreibe(crew: string, bereich: Projektbereich, zustand: CrewZustand): Promise<void> {
    const schluessel = this.schluessel(crew, bereich)
    const pfad = this.pfadVon(crew, bereich)
    if (pfad === undefined) {
      this.imSpeicher.set(schluessel, zustand)
      return
    }
    await mkdir(dirname(pfad), { recursive: true })
    const zwischen = `${pfad}.${String(process.pid)}.tmp`
    await writeFile(zwischen, JSON.stringify(zustand, undefined, 2), 'utf8')
    await rename(zwischen, pfad)
    this.zwischenspeicher.set(schluessel, { zustand, stempel: await this.stempel(pfad) })
  }
}

/**
 * Liest ein Dokument von der Platte.
 *
 * @param pfad - der Pfad
 * @param leer - baut ein leeres Dokument
 * @returns das gelesene oder ein leeres Dokument
 */
async function diesemLesen(
  pfad: string,
  leer: () => { crew: string; nutzer: string; projekt: string; jetzt: string },
): Promise<CrewZustand> {
  let roh: string
  try {
    roh = await readFile(pfad, 'utf8')
  } catch {
    return leererZustand(leer())
  }
  let gelesen: unknown
  try {
    gelesen = JSON.parse(roh)
  } catch {
    return leererZustand(leer())
  }
  if (typeof gelesen !== 'object' || gelesen === null || Array.isArray(gelesen)) {
    throw new Error(`${pfad}: die Datei ist JSON, aber kein Planobjekt`)
  }
  const form = gelesen as Partial<CrewZustand>
  if (form.fassung !== 1) throw new Error(`${pfad}: unbekannte Fassung (${String(form.fassung)})`)
  if (typeof form.crew !== 'string' || typeof form.nutzer !== 'string' || typeof form.projekt !== 'string') {
    throw new Error(`${pfad}: crew, nutzer und projekt muessen Zeichenketten sein`)
  }
  return saeubere(form as CrewZustand)
}

/**
 * Bringt ein gelesenes Dokument in Form: unbekannte Rollen fallen weg, Aufgabenzustände werden geprüft.
 *
 * @param zustand - das gelesene Dokument
 * @returns dasselbe Dokument, bereinigt
 */
function saeubere(zustand: CrewZustand): CrewZustand {
  const rollenstand_ = zustand.rollen
  const sauber: CrewZustand['rollen'] = {}
  for (const [name, stand] of Object.entries(rollenstand_ ?? {})) {
    if (!(name === 'planner' || name === 'executor' || name === 'reviewer' || name === 'vision' || name === 'search' || name === 'helper')) continue
    if (stand === undefined || typeof stand !== 'object') continue
    const aufgaben = (stand.aufgaben ?? [])
      .filter((aufgabe) => aufgabe !== undefined && typeof aufgabe.id === 'string' && typeof aufgabe.text === 'string')
      .map((aufgabe) => ({
        id: aufgabe.id,
        text: aufgabe.text,
        stand: istAufgabenstand(aufgabe.stand) ? aufgabe.stand : 'pending',
        erstellt: typeof aufgabe.erstellt === 'string' ? aufgabe.erstellt : zustand.erstellt,
        aktualisiert: typeof aufgabe.aktualisiert === 'string' ? aufgabe.aktualisiert : zustand.erstellt,
      }))
    const eintrag: NonNullable<CrewZustand['rollen'][CrewRolle]> = { aufgaben }
    if (stand.ziel !== undefined && typeof stand.ziel.text === 'string') {
      eintrag.ziel = {
        text: stand.ziel.text,
        stand: istZielstand(stand.ziel.stand) ? stand.ziel.stand : 'pending',
        aktualisiert: typeof stand.ziel.aktualisiert === 'string' ? stand.ziel.aktualisiert : zustand.erstellt,
      }
    }
    sauber[name] = eintrag
  }
  zustand.rollen = sauber
  return zustand
}

/**
 * Baut eine Aufgabenliste aus vorhandenen und neuen Einträgen.
 *
 * @param alt - die bisherige Liste
 * @param eintraege - die neuen Einträge
 * @param jetzt - der Zeitpunkt
 * @param behalteErledigte - erledigte behalten
 * @returns die neue Liste
 */
function baueListe(
  alt: readonly CrewAufgabe[],
  eintraege: readonly Aufgabeneintrag[],
  jetzt: string,
  behalteErledigte: boolean,
): CrewAufgabe[] {
  const vorher = new Map(alt.map((aufgabe) => [aufgabe.id, aufgabe]))
  const gesehen = new Set<string>()
  const neu: CrewAufgabe[] = []
  for (const eintrag of eintraege) {
    const text = eintrag.text.trim()
    if (text === '') continue
    const id = eintrag.id?.trim() !== undefined && eintrag.id.trim() !== '' ? eintrag.id.trim() : freieId(vorher, gesehen)
    if (gesehen.has(id)) continue
    gesehen.add(id)
    const bisher = vorher.get(id)
    const stand = eintrag.stand ?? bisher?.stand ?? 'pending'
    neu.push({
      id,
      text,
      stand,
      erstellt: bisher?.erstellt ?? jetzt,
      aktualisiert: bisher !== undefined && bisher.text === text && bisher.stand === stand ? bisher.aktualisiert : jetzt,
    })
  }
  if (behalteErledigte) {
    for (const bisher of alt) {
      if (bisher.stand === 'completed' && !gesehen.has(bisher.id)) neu.push(bisher)
    }
  }
  return neu
}

/**
 * Vergleicht zwei Aufgabenlisten auf Gleichheit der Kennung, des Textes und des Standes.
 *
 * @param a - die eine Liste
 * @param b - die andere Liste
 * @returns ob sie gleich sind
 */
function gleichListe(a: readonly CrewAufgabe[], b: readonly CrewAufgabe[]): boolean {
  if (a.length !== b.length) return false
  return a.every((aufgabe, i) => {
    const andere = b[i]
    return andere !== undefined && andere.id === aufgabe.id && andere.text === aufgabe.text
      && andere.stand === aufgabe.stand
  })
}

/**
 * Vergibt eine freie Kennung der Form `t1`, `t2`, …
 *
 * @param vorher - die vorhandenen Aufgaben
 * @param gesehen - die in diesem Lauf schon vergebenen Kennungen
 * @returns eine freie Kennung
 */
function freieId(vorher: ReadonlyMap<string, CrewAufgabe>, gesehen: ReadonlySet<string>): string {
  let zahl = 1
  while (vorher.has(`t${String(zahl)}`) || gesehen.has(`t${String(zahl)}`)) zahl += 1
  return `t${String(zahl)}`
}

/**
 * Prüft, ob ein Name als Pfadsegment taugt.
 *
 * @param wert - der Name
 * @returns derselbe Name
 * @throws Error wenn er Pfadtrenner oder `..` enthält
 */
function pruefeSegment(wert: string): string {
  if (wert === '' || wert.includes('..') || /[\\/]/u.test(wert)) {
    throw new Error(`"${wert}" taugt nicht als Pfadsegment`)
  }
  return wert
}
