/**
 * Der Vertrag der **Zugänge** — rein: kein Netz, kein Dateisystem, kein Host.
 *
 * ## Warum es dieses Paket gibt
 *
 * Der Host kennt **eine** Schlüsselquelle (`ctx.credentials`) und **einen** Anbieter
 * (`openrouter`, siehe `@prometheus-harness/ai-capabilities`). Wer einen zweiten Schlüssel
 * eintragen will, muß ihn von Hand in die Credential-Ablage schreiben und den Anbieter im Code
 * verdrahten. Für einen lokalen Endpunkt, ein Whisper-Modell oder ein Bildmodell gibt es dafür
 * **keinen Ort**.
 *
 * Dieses Paket legt diesen Ort an — als **Daten**, nicht als Sonderfall je Anbieter:
 *
 * | Begriff | Bedeutung |
 * |---|---|
 * | **Zugang** | ein Eintrag: *welcher* Anbieter, *welche* Fähigkeiten, *welches* Modell je Fähigkeit |
 * | **Schlüssel** | das Geheimnis zu einem Zugang — es liegt **nicht** hier, sondern in der Credential-Naht |
 * | **Stand** | ob der Zugang einsatzbereit ist: bereit, ohne Schlüssel, ohne Fähigkeit |
 *
 * ## Drei Regeln, die hier gelten
 *
 * 1. **Der Schlüssel steht nie in dieser Datei.** Er hat eine eigene Ablage
 *    ({@link Schluesselbedarf}), und diese Datei kennt nur, *ob* er gebraucht wird.
 * 2. **Unbekannte Felder werden abgelehnt.** Wer `faehigkeit` statt `modelle` schreibt, hat etwas
 *    gemeint — und würde sonst nie erfahren, daß es nicht angekommen ist. Dieselbe Regel wie in
 *    `@prometheus-harness/settings`.
 * 3. **Ein Zugang ohne Fähigkeit ist kein Zugang.** Er steht da, ist aber nie „bereit" — und der
 *    Grund steht in {@link standVon}, nicht im Schweigen.
 *
 * @module @prometheus-harness/zugaenge/vertrag
 */

import { FAEHIGKEITEN, NAME_DER_FAEHIGKEIT, type Faehigkeit } from '@prometheus-harness/capabilities'

// ---------------------------------------------------------------------------
// Die Form
// ---------------------------------------------------------------------------

/** Die Fassung des Dateiformats. Eine unbekannte Fassung wird **abgelehnt**, nicht gedeutet. */
export const FASSUNG = 1

/**
 * Wo der Zugang liegt.
 *
 * **Warum das im Datensatz steht und nicht geraten wird.** Ein lokaler Endpunkt
 * (`http://127.0.0.1:11434/v1`) ist etwas anderes als ein Dienst im Netz: er braucht keinen
 * Schlüssel, darf keine Kosten verursachen und ist im Zweifel gar nicht gestartet. Die Oberfläche
 * zeigt beides verschieden — und die Sonde darf bei einem lokalen Ziel nicht so tun, als sei ein
 * Netzfehler ein Anbieterfehler.
 */
export type Art = 'fern' | 'lokal'

/** Ob der Zugang ohne Schlüssel auskommt. */
export type Schluesselbedarf = 'noetig' | 'kein'

/**
 * Wie einsatzbereit ein Zugang ist.
 *
 * **Warum drei Werte und kein Wahrheitswert.** „Nicht bereit" allein schickt den Nutzer an die
 * falsche Stelle: es kann der Schlüssel fehlen oder die Modellwahl. Der Unterschied ist die
 * Auskunft, die die Oberfläche braucht.
 */
export type Stand = 'bereit' | 'kein-schluessel' | 'keine-faehigkeit'

/**
 * Ein Zugang — **eine** Zeile in der Verwaltung.
 *
 * Die Modellwahl ist bewußt **eine Zuordnung je Fähigkeit**: ein Zugang kann Chat und Bild über
 * denselben Schlüssel bedienen, aber mit verschiedenen Modellkennungen. Fehlt eine Fähigkeit in
 * {@link modelle}, bietet dieser Zugang sie **nicht** an — das ist keine Lücke, sondern die
 * Auskunft.
 */
export interface Zugang {
  /** Die Kennung, stabil und klein geschrieben (`openrouter-privat`). */
  readonly id: string
  /** Der Name für Menschen. */
  readonly name: string
  /**
   * Die API-Familie aus `@prometheus-harness/provider-directory` (`openrouter`, `deepseek`, …)
   * oder `openai-kompatibel` für einen eigenen Endpunkt.
   */
  readonly familie: string
  /** Fern oder lokal. */
  readonly art: Art
  /** Ob ein Schlüssel nötig ist. */
  readonly schluessel: Schluesselbedarf
  /** Je Fähigkeit die Modellkennung. Fehlt eine, bietet der Zugang sie nicht an. */
  readonly modelle: Partial<Record<Faehigkeit, string>>
  /**
   * Die Basisadresse, wenn sie von der Familie abweicht — bei `openai-kompatibel` **Pflicht**.
   *
   * **Warum sie hier stehen darf.** Ein lokaler Dienst hat keine feste Adresse: Ollama hört auf
   * `11434`, llama.cpp auf einem Port, den der Nutzer wählt. Eine Tabelle könnte das nicht
   * abbilden, ohne für jede Installation eine Zeile zu erfinden.
   */
  readonly basis?: string
  /**
   * Der Name der Umgebungsvariablen, aus der der Schlüssel ersatzweise kommt.
   *
   * **Warum es das gibt.** In einem Container oder in CI steht der Schlüssel absichtlich in der
   * Umgebung; ihn dort herauszunehmen und in eine Datei zu schreiben wäre ein Rückschritt. Die
   * Ablage geht vor — die Umgebung ist der Ausweichweg.
   */
  readonly umgebung?: string
  /** Eine Notiz für den Menschen — nie ein Geheimnis. */
  readonly notiz?: string
  /** Wann der Zugang angelegt wurde (ISO 8601). */
  readonly angelegt: string
  /** Wann er zuletzt geändert wurde (ISO 8601). */
  readonly geaendert: string
}

/** Die Eingabe eines Zugangs — ohne die Zeitstempel, die der Host setzt. */
export interface ZugangEingabe {
  readonly id?: string
  readonly name: string
  readonly familie: string
  readonly art: Art
  readonly schluessel: Schluesselbedarf
  readonly modelle: Partial<Record<Faehigkeit, string>>
  readonly basis?: string
  readonly umgebung?: string
  readonly notiz?: string
}

/** Der Inhalt der Datei. */
export interface Zugangsdatei {
  /** Die Fassung des Formats. */
  readonly fassung: number
  /** Die Zugänge. Die Reihenfolge in der Datei ist **nicht** die Anzeigereihenfolge. */
  readonly zugaenge: readonly Zugang[]
}

/** Die leere Datei — der Normalzustand vor dem ersten Eintrag. */
export const LEER: Zugangsdatei = { fassung: FASSUNG, zugaenge: [] }

/**
 * Macht aus einer Eingabe einen gespeicherten Zugang.
 *
 * **Was der Aufrufer entscheiden muß.** Ob eine vorhandene Kennung **fortgeschrieben** oder eine
 * **neue** vergeben wird. Bei einer Änderung wird der vorhandene Eintrag hereingegeben — dann
 * bleiben Kennung und Anlagedatum; sonst entstehen sie neu.
 *
 * @param eingabe - die geprüfte Eingabe
 * @param jetzt - der Zeitpunkt
 * @param vorher - der Eintrag, der ersetzt wird (bei einer Änderung)
 * @returns der Zugang
 */
export function alsZugang(eingabe: ZugangEingabe, jetzt: Date, vorher?: Zugang): Zugang {
  return {
    ...eingabe,
    id: vorher?.id ?? eingabe.id ?? kennungAus(eingabe.name),
    angelegt: vorher?.angelegt ?? jetzt.toISOString(),
    geaendert: jetzt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fehler
// ---------------------------------------------------------------------------

/** Warum eine Datei oder eine Eingabe nicht angenommen wurde. */
export class Zugangsfehler extends Error {
  /**
   * @param maengel - **alle** Mängel auf einmal
   */
  constructor(readonly maengel: readonly string[]) {
    // Alle Mängel auf einmal: beim ersten abzubrechen hieße, eine Datei mangelweise zu reparieren.
    super(`Die Angabe ist unbrauchbar:\n  ${maengel.join('\n  ')}`)
    this.name = 'Zugangsfehler'
  }
}

// ---------------------------------------------------------------------------
// Prüfungen
// ---------------------------------------------------------------------------

/** Die erlaubten Felder eines gespeicherten Zugangs. */
const FELDER = [
  'id',
  'name',
  'familie',
  'art',
  'schluessel',
  'modelle',
  'basis',
  'umgebung',
  'notiz',
  'angelegt',
  'geaendert',
] as const

/** Die erlaubten Felder der obersten Ebene. */
const DATEIFELDER = ['fassung', 'zugaenge'] as const

/** Eine Kennung: klein, mit Bindestrich, beginnt mit einem Buchstaben. */
const KENNUNG = /^[a-z][a-z0-9-]{0,47}$/

/** Ein POSIX-Bezeichner — dieselbe Grammatik wie eine Credential-Referenz. */
const UMWELTNAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Umlaute, die eine Kennung nicht enthalten darf. */
const UMLAUTE: Readonly<Record<string, string>> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
}

/**
 * Prüft, ob ein Wert ein nichtleerer Text ist.
 *
 * @param wert - der Wert
 * @returns ob es ein brauchbarer Text ist
 */
export function istText(wert: unknown): wert is string {
  return typeof wert === 'string' && wert.trim() !== ''
}

/**
 * Prüft, ob ein Wert eine Fähigkeit ist.
 *
 * @param wert - der Wert
 * @returns ob er in {@link FAEHIGKEITEN} steht
 */
export function istFaehigkeit(wert: unknown): wert is Faehigkeit {
  return typeof wert === 'string' && (FAEHIGKEITEN as readonly string[]).includes(wert)
}

/**
 * Macht aus einem Namen eine Kennung.
 *
 * **Warum das hier steht und nicht im Panel.** Die Kennung ist der Adressteil des Schlüssels in
 * der Credential-Ablage (`pmh-zugaenge/<id>`). Sie zweimal zu bilden — einmal in der Oberfläche,
 * einmal beim Speichern — hieße: irgendwann stimmen sie nicht überein, und der Schlüssel liegt
 * unter einer Adresse, die niemand wiederfindet.
 *
 * @param name - der Name für Menschen
 * @returns eine gültige Kennung; nie leer
 */
export function kennungAus(name: string): string {
  const roh = name
    .toLowerCase()
    .replace(/[äöüß]/g, (zeichen) => UMLAUTE[zeichen] ?? zeichen)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  if (roh === '') return 'zugang'
  return /^[a-z]/.test(roh) ? roh : `z-${roh}`
}

/**
 * Prüft eine Basisadresse.
 *
 * **Warum `http` und `https` und sonst nichts.** Ein `file:`-Ziel wäre ein Dateizugriff über eine
 * Netzadresse; ein `ftp:`-Ziel könnte die Sonde nicht lesen. Beides hier zuzulassen hieße, dem
 * Nutzer eine Adresse zu erlauben, die kein Anbieter versteht.
 *
 * @param wert - die Adresse
 * @returns ob sie brauchbar ist
 */
export function istBasisadresse(wert: string): boolean {
  try {
    const adresse = new URL(wert)
    return adresse.protocol === 'http:' || adresse.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Entfernt einen Schrägstrich am Ende — **eine** Adresse, nicht zwei.
 *
 * @param basis - die Adresse
 * @returns die Adresse ohne abschließenden Schrägstrich
 */
export function ohneSchraegstrich(basis: string): string {
  return basis.replace(/\/+$/, '')
}

/**
 * Prüft eine Eingabe und sammelt **alle** Mängel.
 *
 * @param roh - der rohe Wert
 * @param wo - wo er herkommt (für die Meldung)
 * @returns die geprüfte Eingabe
 * @throws Zugangsfehler - mit allen Mängeln
 */
export function pruefeEingabe(roh: unknown, wo = 'Der Zugang'): ZugangEingabe {
  if (roh === null || typeof roh !== 'object' || Array.isArray(roh)) {
    throw new Zugangsfehler([`${wo} muß ein Objekt sein.`])
  }
  const objekt = roh as Record<string, unknown>
  const maengel: string[] = []

  const name = objekt['name']
  const familie = objekt['familie']
  const art = objekt['art']
  const schluessel = objekt['schluessel']

  if (!istText(name)) maengel.push('„name" fehlt oder ist leer.')
  if (!istText(familie)) maengel.push('„familie" fehlt oder ist leer.')
  if (art !== 'fern' && art !== 'lokal') maengel.push('„art" muß „fern" oder „lokal" sein.')
  if (schluessel !== 'noetig' && schluessel !== 'kein') {
    maengel.push('„schluessel" muß „noetig" oder „kein" sein.')
  }

  const id = objekt['id']
  if (id !== undefined && (typeof id !== 'string' || !KENNUNG.test(id))) {
    maengel.push('„id" muß klein geschrieben sein, mit Bindestrich, und mit einem Buchstaben beginnen.')
  }

  const basis = objekt['basis']
  if (basis !== undefined) {
    if (!istText(basis)) maengel.push('„basis" ist leer — weglassen oder eine Adresse angeben.')
    else if (!istBasisadresse(basis)) maengel.push(`„basis" ist keine http(s)-Adresse: ${basis}`)
  }

  // **Ein lokaler Zugang ohne eigene Adresse wäre eine Behauptung.** Die Basis der Familie zeigt
  // ins Netz; „lokal" heißt: dieser Rechner, dieser Port. Wer das meint, muß die Adresse nennen.
  if (art === 'lokal' && basis === undefined) {
    maengel.push('Ein lokaler Zugang braucht eine Basisadresse (etwa http://127.0.0.1:11434/v1).')
  }

  // **`openai-kompatibel` hat keine Basis in der Tabelle.** Für die bekannten Familien steht sie
  // dort; ein eigener Endpunkt (Ollama, llama.cpp, ein LAN-Rechner) braucht sie vom Nutzer.
  if (istText(familie)) {
    if (!/^[a-z][a-z0-9-]*$/.test(familie)) {
      maengel.push(`„familie" ist keine gültige Kennung: ${familie}`)
    }
    if (familie === 'openai-kompatibel' && basis === undefined) {
      maengel.push('„openai-kompatibel" braucht eine Basisadresse.')
    }
  }

  const umgebung = objekt['umgebung']
  if (umgebung !== undefined && (typeof umgebung !== 'string' || !UMWELTNAME.test(umgebung))) {
    maengel.push('„umgebung" muß ein Name wie OPENROUTER_API_KEY sein.')
  }

  const notiz = objekt['notiz']
  if (notiz !== undefined && typeof notiz !== 'string') maengel.push('„notiz" muß Text sein.')

  const modelle: Partial<Record<Faehigkeit, string>> = {}
  const modelleRoh = objekt['modelle']
  if (modelleRoh !== undefined) {
    if (modelleRoh === null || typeof modelleRoh !== 'object' || Array.isArray(modelleRoh)) {
      maengel.push('„modelle" muß ein Objekt sein (Fähigkeit → Modellkennung).')
    } else {
      for (const [faehigkeit, modell] of Object.entries(modelleRoh as Record<string, unknown>)) {
        if (!istFaehigkeit(faehigkeit)) {
          maengel.push(
            `Unbekannte Fähigkeit „${faehigkeit}". Erlaubt: ${FAEHIGKEITEN.join(', ')}.`,
          )
          continue
        }
        if (typeof modell !== 'string' || modell.trim() === '') {
          maengel.push(`„modelle.${faehigkeit}" ist leer — weglassen heißt „kann er nicht".`)
          continue
        }
        modelle[faehigkeit] = modell.trim()
      }
    }
  }

  if (maengel.length > 0) throw new Zugangsfehler(maengel)

  // Ab hier sind die Pflichtfelder geprüft; die Zusicherungen sind deshalb belegt.
  return {
    ...(typeof id === 'string' ? { id } : {}),
    name: (name as string).trim(),
    familie: (familie as string).trim(),
    art: art as Art,
    schluessel: schluessel as Schluesselbedarf,
    modelle,
    ...(istText(basis) ? { basis: ohneSchraegstrich(basis.trim()) } : {}),
    ...(typeof umgebung === 'string' ? { umgebung } : {}),
    ...(typeof notiz === 'string' && notiz.trim() !== '' ? { notiz: notiz.trim() } : {}),
  }
}

/**
 * Prüft einen gespeicherten Zugang — samt Zeitstempeln.
 *
 * @param roh - der rohe Wert
 * @param wo - wo er herkommt
 * @returns der geprüfte Zugang
 * @throws Zugangsfehler - mit allen Mängeln
 */
export function pruefeZugang(roh: unknown, wo: string): Zugang {
  if (roh === null || typeof roh !== 'object' || Array.isArray(roh)) {
    throw new Zugangsfehler([`${wo} muß ein Objekt sein.`])
  }
  const objekt = roh as Record<string, unknown>
  const maengel: string[] = []
  for (const feld of Object.keys(objekt)) {
    if (!(FELDER as readonly string[]).includes(feld)) {
      maengel.push(`${wo}: unbekanntes Feld „${feld}". Erlaubt: ${FELDER.join(', ')}.`)
    }
  }
  // **Beide Fehlerquellen werden gesammelt.** Ein Wurf aus `pruefeEingabe` würde sonst die
  // unbekannten Felder verschlucken — und der Nutzer reparierte die Datei in zwei Runden.
  let eingabe: ZugangEingabe | undefined
  try {
    eingabe = pruefeEingabe(objekt, wo)
  } catch (fehler) {
    if (!(fehler instanceof Zugangsfehler)) throw fehler
    maengel.push(...fehler.maengel)
  }
  const id = objekt['id']
  if (typeof id !== 'string' || !KENNUNG.test(id)) {
    maengel.push(`${wo}: „id" fehlt oder ist keine gültige Kennung.`)
  }
  const angelegt = zeitstempel(objekt['angelegt'])
  const geaendert = zeitstempel(objekt['geaendert'])
  if (angelegt === undefined) maengel.push(`${wo}: „angelegt" ist kein Zeitpunkt.`)
  if (geaendert === undefined) maengel.push(`${wo}: „geaendert" ist kein Zeitpunkt.`)
  if (maengel.length > 0 || eingabe === undefined) throw new Zugangsfehler(maengel)
  return {
    ...eingabe,
    id: id as string,
    angelegt: angelegt as string,
    geaendert: geaendert as string,
  }
}

/**
 * Prüft einen ISO-Zeitpunkt.
 *
 * @param wert - der Wert
 * @returns den Text, wenn er ein Zeitpunkt ist
 */
function zeitstempel(wert: unknown): string | undefined {
  if (typeof wert !== 'string') return undefined
  return Number.isNaN(Date.parse(wert)) ? undefined : wert
}

// ---------------------------------------------------------------------------
// Stand
// ---------------------------------------------------------------------------

/**
 * Rechnet den Stand eines Zugangs aus — **statt ihn zu behaupten**.
 *
 * Die Reihenfolge der Fragen ist Absicht: erst „kann er überhaupt etwas", dann „hat er, was er
 * dafür braucht". So nennt der Grund das, was zuerst fehlt.
 *
 * @param zugang - der Zugang (nur die Felder, die zählen)
 * @param schluesselGesetzt - ob in der Ablage ein Wert liegt (oder die Umgebung einen nennt)
 * @returns der Stand
 */
export function standVon(
  zugang: Pick<Zugang, 'modelle' | 'schluessel'>,
  schluesselGesetzt: boolean,
): Stand {
  const hatModell = FAEHIGKEITEN.some((faehigkeit) => {
    const modell = zugang.modelle[faehigkeit]
    return typeof modell === 'string' && modell.trim() !== ''
  })
  if (!hatModell) return 'keine-faehigkeit'
  if (zugang.schluessel === 'noetig' && !schluesselGesetzt) return 'kein-schluessel'
  return 'bereit'
}

/**
 * Die Fähigkeiten eines Zugangs, in fester Reihenfolge.
 *
 * @param zugang - der Zugang
 * @returns je Fähigkeit die Modellkennung, nur wo eine steht
 */
export function faehigkeitenVon(zugang: Pick<Zugang, 'modelle'>): readonly Faehigkeit[] {
  return FAEHIGKEITEN.filter((faehigkeit) => {
    const modell = zugang.modelle[faehigkeit]
    return typeof modell === 'string' && modell.trim() !== ''
  })
}

/**
 * Der deutsche Name einer Fähigkeit — für Meldungen.
 *
 * @param faehigkeit - die Fähigkeit
 * @returns der Name
 */
export function nameDerFaehigkeit(faehigkeit: Faehigkeit): string {
  return NAME_DER_FAEHIGKEIT[faehigkeit]
}

// ---------------------------------------------------------------------------
// Lesen und Schreiben
// ---------------------------------------------------------------------------

/**
 * Liest die Datei — **geprüft, nicht geglaubt**.
 *
 * @param text - der Inhalt
 * @returns die Datei
 * @throws Zugangsfehler - mit allen Mängeln
 */
export function leseZugaenge(text: string): Zugangsdatei {
  let roh: unknown
  try {
    roh = JSON.parse(text)
  } catch {
    throw new Zugangsfehler([`Der Inhalt ist kein JSON. Er begann mit: ${text.slice(0, 120)}`])
  }
  if (roh === null || typeof roh !== 'object' || Array.isArray(roh)) {
    throw new Zugangsfehler(['Erwartet war ein Objekt.'])
  }
  const objekt = roh as Record<string, unknown>
  const maengel: string[] = []
  for (const feld of Object.keys(objekt)) {
    if (!(DATEIFELDER as readonly string[]).includes(feld)) {
      maengel.push(`Unbekanntes Feld „${feld}". Erlaubt: ${DATEIFELDER.join(', ')}.`)
    }
  }
  if (objekt['fassung'] !== FASSUNG) {
    maengel.push(
      `Die Fassung ist ${JSON.stringify(objekt['fassung']) ?? 'nicht angegeben'} — erwartet ${String(FASSUNG)}. ` +
        'Eine unbekannte Fassung wird nicht gedeutet.',
    )
  }
  const liste = objekt['zugaenge']
  if (!Array.isArray(liste)) {
    maengel.push('„zugaenge" muß eine Liste sein.')
  }
  if (maengel.length > 0) throw new Zugangsfehler(maengel)

  const gesehen = new Set<string>()
  const zugaenge: Zugang[] = []
  for (const [index, eintrag] of (liste as unknown[]).entries()) {
    const zugang = pruefeZugang(eintrag, `zugaenge[${String(index)}]`)
    if (gesehen.has(zugang.id)) {
      throw new Zugangsfehler([`Die Kennung „${zugang.id}" steht zweimal in der Datei.`])
    }
    gesehen.add(zugang.id)
    zugaenge.push(zugang)
  }
  return { fassung: FASSUNG, zugaenge }
}

/**
 * Schreibt die Datei — **in fester Reihenfolge**.
 *
 * **Warum feste Reihenfolge.** Die Datei wird von Menschen gelesen, verglichen und gesichert. Wäre
 * die Reihenfolge zufällig, sähe jede Änderung wie ein Umbau aus — und niemand fände im Vergleich
 * die eine geänderte Zeile.
 *
 * @param datei - der Inhalt
 * @returns der Text, mit Zeilenumbruch am Ende
 */
export function schreibeZugaenge(datei: Zugangsdatei): string {
  const zugaenge = [...datei.zugaenge]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((zugang) => {
      const modelle: Record<string, string> = {}
      for (const faehigkeit of FAEHIGKEITEN) {
        const modell = zugang.modelle[faehigkeit]
        if (modell !== undefined) modelle[faehigkeit] = modell
      }
      return {
        id: zugang.id,
        name: zugang.name,
        familie: zugang.familie,
        art: zugang.art,
        schluessel: zugang.schluessel,
        modelle,
        ...(zugang.basis === undefined ? {} : { basis: zugang.basis }),
        ...(zugang.umgebung === undefined ? {} : { umgebung: zugang.umgebung }),
        ...(zugang.notiz === undefined ? {} : { notiz: zugang.notiz }),
        angelegt: zugang.angelegt,
        geaendert: zugang.geaendert,
      }
    })
  return `${JSON.stringify({ fassung: FASSUNG, zugaenge }, null, 2)}\n`
}

/**
 * Setzt einen Zugang in die Datei — **ohne** sie zu verändern.
 *
 * @param datei - der Inhalt
 * @param zugang - der Zugang
 * @returns der neue Inhalt
 */
export function mitZugang(datei: Zugangsdatei, zugang: Zugang): Zugangsdatei {
  const ohne = datei.zugaenge.filter((eintrag) => eintrag.id !== zugang.id)
  return { fassung: FASSUNG, zugaenge: [...ohne, zugang] }
}

/**
 * Nimmt einen Zugang heraus — **ohne** die Datei zu verändern.
 *
 * @param datei - der Inhalt
 * @param id - die Kennung
 * @returns der neue Inhalt und ob etwas entfernt wurde
 */
export function ohneZugang(datei: Zugangsdatei, id: string): { datei: Zugangsdatei; entfernt: boolean } {
  const ohne = datei.zugaenge.filter((eintrag) => eintrag.id !== id)
  return { datei: { fassung: FASSUNG, zugaenge: ohne }, entfernt: ohne.length !== datei.zugaenge.length }
}
