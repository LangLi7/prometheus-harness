/**
 * Der Katalog — das **dauerhafte** Ergebnis der Verwalterläufe.
 *
 * ## Warum ein Katalog und nicht der bloße Befund
 *
 * Ein Sondenbefund ist eine **Momentaufnahme**: er gilt für den Augenblick des Aufrufs. Der Katalog
 * trägt **wann** gemessen wurde — und damit die Frage, ob die Auskunft noch gilt. Ohne dieses Datum
 * wäre „gemessen" eine Behauptung, die nie altert.
 *
 * ## Warum eine unerreichbare Familie ihren Eintrag BEHÄLT
 *
 * Ein Dienst, der gerade nicht antwortet, hat nichts widerlegt. Seinen Eintrag zu löschen hieße,
 * Wissen wegen eines Netzfehlers wegzuwerfen. Der Verwalter behält den alten Eintrag und **sagt
 * es** — siehe `curator.ts`.
 *
 * @module @prometheus-harness/directory-curator/katalog
 */

import type { Faehigkeit, Herkunft } from '@prometheus-harness/faehigkeiten'
import type { Sondebefund, Wegbefund } from '@prometheus-harness/verzeichnis'

/** Die Fassung dieses Formats. Eine unbekannte wird **abgelehnt**, nicht gedeutet. */
export const FASSUNG = 1

/** Was ein Auslegungslauf ergeben hat — oder warum er offen blieb. */
export interface Auslegung {
  /** Die Fähigkeiten, die der Ausleger für belegt hält. */
  readonly faehigkeiten: readonly Faehigkeit[]
  /** Wie sicher er war. Fehlt sie, war er es nicht — und dann steht sie auch nicht hier. */
  readonly sicherheit?: number
  /** Wer ausgelegt hat. */
  readonly herkunft?: Herkunft
}

/** Ein Eintrag im Katalog: was über **eine** Familie gemessen ist. */
export interface Katalogeintrag {
  /** Die Kennung der Familie. */
  readonly familie: string
  /** Wann geprüft wurde (ISO-Zeitpunkt) — **ohne dieses Datum altert „gemessen" nie**. */
  readonly geprueftAm: string
  /** Ob die Models-API geantwortet hat. */
  readonly modelleErreichbar: boolean
  /** Die Kennungen, die sie genannt hat. */
  readonly modelle: readonly string[]
  /** Je Fähigkeit der Befund der Sonde. */
  readonly wege: Readonly<Record<string, Wegbefund>>
  /** Was sonst zu sagen ist. */
  readonly bemerkung: string
  /** Die Auslegung — **nur**, wenn sie sicher genug war. */
  readonly auslegung?: Auslegung
  /**
   * Warum **keine** Auslegung im Katalog steht.
   *
   * **Warum ein eigener Text und kein fehlendes Feld.** „Nicht ausgelegt" kann heißen: kein Modell
   * gefragt (Wächter), zu unsicher (Mensch nötig), oder gar nicht versucht. Das sind drei
   * verschiedene Lagen — und wer den Katalog liest, muß sie unterscheiden können.
   */
  readonly auslegungOffen?: string
  /**
   * Wo die Auslegung der **Messung** widersprach.
   *
   * **Warum das ein eigenes Feld ist und kein Grund unter `auslegungOffen`.** Ein Widerspruch ist
   * etwas anderes als eine fehlende Auskunft: hier hat jemand **etwas behauptet**, und die Messung
   * sagt das Gegenteil. Im ersten lebenden Lauf (15.10.2026) hat sich das Modell für Z.ai mit
   * Sicherheit 0,93 geirrt — es sagte „keine der bekannten Fähigkeiten", während die Sonde alle
   * sechs Wege als antwortend gemessen hatte. Wer das später liest, soll sehen, **daß** und
   * **wo** die Deutung danebenlag.
   */
  readonly widerspruch?: string
}

/** Der Katalog. */
export interface Katalog {
  /** Die Fassung des Formats. */
  readonly fassung: number
  /** Je Familie ein Eintrag. */
  readonly eintraege: Readonly<Record<string, Katalogeintrag>>
}

/** Der leere Katalog. */
export const LEER: Katalog = { fassung: FASSUNG, eintraege: {} }

/** Die erlaubten Befunde eines Weges — dieselben wie in der Sonde. */
const WEGBEFUNDE: readonly Wegbefund[] = ['vorhanden', 'fehlt', 'unbekannt']

/** Warum ein Katalog nicht angenommen wurde. */
export class KatalogFehler extends Error {
  /**
   * @param maengel - was alles nicht stimmte
   */
  constructor(readonly maengel: readonly string[]) {
    super(`Der Katalog ist unbrauchbar:\n  ${maengel.join('\n  ')}`)
    this.name = 'KatalogFehler'
  }
}

/**
 * Prüft einen Text auf einen Zeitpunkt.
 *
 * @param wert - der Wert
 * @returns ob es ein lesbarer Zeitpunkt ist
 */
function istZeitpunkt(wert: unknown): wert is string {
  return typeof wert === 'string' && wert.trim() !== '' && !Number.isNaN(Date.parse(wert))
}

/**
 * Liest einen Katalog — **geprüft**, nicht geglaubt.
 *
 * @param text - der Inhalt der Datei
 * @returns der Katalog
 * @throws KatalogFehler - mit **allen** Mängeln
 */
export function leseKatalog(text: string): Katalog {
  let roh: unknown
  try {
    roh = JSON.parse(text)
  } catch {
    throw new KatalogFehler([`Der Inhalt ist kein JSON. Er begann mit: ${text.slice(0, 120)}`])
  }
  if (roh === null || typeof roh !== 'object' || Array.isArray(roh)) {
    throw new KatalogFehler(['Erwartet war ein Objekt.'])
  }
  const objekt = roh as Record<string, unknown>
  const maengel: string[] = []

  for (const feld of Object.keys(objekt)) {
    if (feld !== 'fassung' && feld !== 'eintraege') {
      maengel.push(`Unbekanntes Feld „${feld}". Erlaubt: fassung, eintraege.`)
    }
  }
  if (objekt['fassung'] !== FASSUNG) {
    maengel.push(
      `Die Fassung ist ${JSON.stringify(objekt['fassung']) ?? 'nicht angegeben'} — erwartet wird ${String(FASSUNG)}.`,
    )
  }

  const eintraegeRoh = objekt['eintraege']
  const eintraege: Record<string, Katalogeintrag> = {}
  if (eintraegeRoh === undefined || eintraegeRoh === null || typeof eintraegeRoh !== 'object' || Array.isArray(eintraegeRoh)) {
    maengel.push('„eintraege" muß ein Objekt sein.')
  } else {
    for (const [name, wert] of Object.entries(eintraegeRoh as Record<string, unknown>)) {
      if (wert === null || typeof wert !== 'object' || Array.isArray(wert)) {
        maengel.push(`Der Eintrag „${name}" ist kein Objekt.`)
        continue
      }
      const e = wert as Record<string, unknown>
      const wo = `Eintrag „${name}"`
      // **Nur die Mängel DIESES Eintrags zählen** für die Frage, ob er aufgenommen wird. Über
      // `maengel.length` zu prüfen wäre falsch: ein Mangel in einem früheren Eintrag würde jeden
      // späteren überspringen — und der Katalog wäre stillschweigend unvollständig.
      const vorher = maengel.length
      if (e['familie'] !== name) maengel.push(`${wo}: „familie" muß „${name}" sein, war ${JSON.stringify(e['familie'])}.`)
      if (!istZeitpunkt(e['geprueftAm'])) maengel.push(`${wo}: „geprueftAm" ist kein lesbarer Zeitpunkt.`)
      if (typeof e['modelleErreichbar'] !== 'boolean') maengel.push(`${wo}: „modelleErreichbar" fehlt.`)
      if (typeof e['bemerkung'] !== 'string') maengel.push(`${wo}: „bemerkung" fehlt.`)
      const modelle = e['modelle']
      if (!Array.isArray(modelle) || modelle.some((m) => typeof m !== 'string')) {
        maengel.push(`${wo}: „modelle" muß eine Liste von Zeichenketten sein.`)
      }
      const wege = e['wege']
      if (wege === null || typeof wege !== 'object' || Array.isArray(wege)) {
        maengel.push(`${wo}: „wege" muß ein Objekt sein.`)
      } else {
        for (const [faehigkeit, befund] of Object.entries(wege as Record<string, unknown>)) {
          if (!WEGBEFUNDE.includes(befund as Wegbefund)) {
            // Nur die drei genannten Befunde zählen. Ein beliebiger Text sähe wie eine Auskunft aus.
            maengel.push(`${wo}.wege.${faehigkeit}: „${String(befund)}" ist kein Befund (${WEGBEFUNDE.join(', ')}).`)
          }
        }
      }
      if (maengel.length > vorher) continue
      eintraege[name] = {
        familie: name,
        geprueftAm: e['geprueftAm'] as string,
        modelleErreichbar: e['modelleErreichbar'] === true,
        modelle: (modelle as string[]).slice(),
        wege: { ...(wege as Record<string, Wegbefund>) },
        bemerkung: e['bemerkung'] as string,
        ...(e['auslegung'] === undefined ? {} : { auslegung: e['auslegung'] as Auslegung }),
        ...(typeof e['auslegungOffen'] === 'string' ? { auslegungOffen: e['auslegungOffen'] } : {}),
        ...(typeof e['widerspruch'] === 'string' ? { widerspruch: e['widerspruch'] } : {}),
      }
    }
  }

  if (maengel.length > 0) throw new KatalogFehler(maengel)
  return { fassung: FASSUNG, eintraege }
}

/**
 * Schreibt den Katalog — **in fester Reihenfolge**, damit ein Vergleich die Änderung zeigt.
 *
 * @param katalog - der Katalog
 * @returns der Text, mit Zeilenumbruch am Ende
 */
export function schreibeKatalog(katalog: Katalog): string {
  const namen = Object.keys(katalog.eintraege).sort()
  const eintraege: Record<string, Katalogeintrag> = {}
  for (const name of namen) {
    const e = katalog.eintraege[name]
    if (e === undefined) continue
    const wege: Record<string, Wegbefund> = {}
    for (const faehigkeit of Object.keys(e.wege).sort()) {
      const befund = e.wege[faehigkeit]
      if (befund !== undefined) wege[faehigkeit] = befund
    }
    eintraege[name] = {
      familie: e.familie,
      geprueftAm: e.geprueftAm,
      modelleErreichbar: e.modelleErreichbar,
      modelle: [...e.modelle],
      wege,
      bemerkung: e.bemerkung,
      ...(e.auslegung === undefined ? {} : { auslegung: e.auslegung }),
      ...(e.auslegungOffen === undefined ? {} : { auslegungOffen: e.auslegungOffen }),
      ...(e.widerspruch === undefined ? {} : { widerspruch: e.widerspruch }),
    }
  }
  return `${JSON.stringify({ fassung: FASSUNG, eintraege }, null, 2)}\n`
}

/**
 * Macht aus einem Sondenbefund einen Katalogeintrag.
 *
 * @param familie - die Kennung der Familie
 * @param befund - was die Sonde ergeben hat
 * @param jetzt - der Zeitpunkt der Prüfung
 * @returns der Eintrag
 */
export function eintragAus(familie: string, befund: Sondebefund, jetzt: Date): Katalogeintrag {
  return {
    familie,
    geprueftAm: jetzt.toISOString(),
    modelleErreichbar: befund.modelleErreichbar,
    modelle: [...befund.modelle],
    wege: { ...befund.wege },
    bemerkung: befund.bemerkung,
  }
}

/**
 * Nimmt einen Eintrag in den Katalog auf — **ohne** den alten Katalog zu verändern.
 *
 * @param katalog - der Katalog
 * @param eintrag - der neue Eintrag
 * @returns der neue Katalog
 */
export function mitEintrag(katalog: Katalog, eintrag: Katalogeintrag): Katalog {
  return { fassung: FASSUNG, eintraege: { ...katalog.eintraege, [eintrag.familie]: eintrag } }
}

/**
 * Der Eintrag einer Familie.
 *
 * @param katalog - der Katalog
 * @param familie - die Kennung
 * @returns der Eintrag oder `undefined`
 */
export function eintragFuer(katalog: Katalog, familie: string): Katalogeintrag | undefined {
  return katalog.eintraege[familie]
}

/**
 * Wie lange ein Eintrag gilt.
 *
 * **Warum hier und nicht im Verwalter.** Diese Frage gehört zum **Eintrag**, nicht zum Ablauf:
 * „wie alt darf diese Auskunft sein?" wird an einer Stelle beantwortet, und beide Funktionen, die
 * sie stellen — {@link istFrisch} und `sollLaufen` im Verwalter — nehmen **dieselbe** Form. Vorher
 * nahm die eine eine Zahl und die andere ein Objekt; das war dieselbe Frage zweimal verschieden
 * gestellt.
 */
export interface Takt {
  /** Wie lange ein Eintrag gilt, in Millisekunden. */
  readonly fristMs: number
}

/** Ein Tag — die Vorgabe, wenn der Aufrufer nichts sagt. */
export const TAKT_TAG: Takt = { fristMs: 24 * 60 * 60 * 1000 }

/**
 * Ist der Eintrag noch frisch genug?
 *
 * @param eintrag - der Eintrag oder `undefined`
 * @param jetzt - der jetzige Zeitpunkt
 * @param takt - wie lange ein Eintrag gilt
 * @returns ob er noch gilt
 */
export function istFrisch(
  eintrag: Katalogeintrag | undefined,
  jetzt: Date,
  takt: Takt = TAKT_TAG,
): boolean {
  // **Kein Eintrag ist nie frisch.** Wer nichts weiß, muß messen — auch wenn die Frist groß ist.
  if (eintrag === undefined) return false
  const geprueft = Date.parse(eintrag.geprueftAm)
  if (Number.isNaN(geprueft)) return false
  return jetzt.getTime() - geprueft < takt.fristMs
}
