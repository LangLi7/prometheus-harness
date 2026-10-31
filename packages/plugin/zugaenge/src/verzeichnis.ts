/**
 * Das Verzeichnis der **Zugänge** — die eine Stelle, an der aus einem Eintrag ein Anbieter wird.
 *
 * ## Warum hier und nicht im Server
 *
 * Der Server kennt HTTP, Sitzungen und Rümpfe; er soll **nicht** wissen, wie eine Familie
 * aufgebaut ist oder wie eine Sonde deutet. Diese Datei kennt beides und **kein** HTTP — damit
 * läßt sie sich ohne laufenden Host prüfen.
 *
 * ## Was sie aus einem Zugang macht
 *
 * | Feld | Woher |
 * |---|---|
 * | Basisadresse, Kopfzeile, Modellweg | `@prometheus-harness/provider-directory` — die **gemessene** Tabelle |
 * | Abweichende Basis (lokaler Endpunkt) | der Zugang |
 * | Fähigkeiten und Modelle | der Zugang |
 *
 * **Eine Familie, die das Verzeichnis nicht kennt, wird nicht erfunden.** Sie wird
 * `openai-kompatibel` genannt, bekommt die Basis des Nutzers — und ihre Wege bleiben **leer**.
 * Damit sagt die Sonde „unbekannt" statt „vorhanden", und niemand trägt einen Anbieter ein, der
 * nichts kann.
 *
 * @module @prometheus-harness/zugaenge/verzeichnis
 */

import type { Anbieter, Faehigkeit } from '@prometheus-harness/capabilities'
import { openrouter } from '@prometheus-harness/openrouter'
import { typesafe } from '@prometheus-harness/typesafe'
import {
  FAMILIEN,
  familieMit,
  sonde,
  type Abruf,
  type Familie,
  type Sondebefund,
  type Wegbefund,
} from '@prometheus-harness/provider-directory'

import { ohneSchraegstrich, type Zugang } from './vertrag.ts'

/** Die Kennung der Familie, die für einen eigenen Endpunkt steht. */
export const OFFENE_FAMILIE = 'openai-kompatibel'

/**
 * Was die Oberfläche über eine Familie wissen muß.
 *
 * **Warum nicht die ganze {@link Familie}.** Die enthält Funktionen; sie über eine Route zu
 * schicken wäre weder möglich noch nötig. Hier stehen nur die Auskünfte, die eine Auswahl braucht.
 */
export interface Familienauskunft {
  /** Die Kennung. */
  readonly id: string
  /** Der Name für Menschen. */
  readonly name: string
  /** Die Basisadresse — **fehlt** bei {@link OFFENE_FAMILIE}. */
  readonly basis?: string
  /** Ob der Nutzer eine Basisadresse nennen muß. */
  readonly basisNoetig: boolean
  /** Was über die Wege gemessen ist — in Worten, aus der Tabelle. */
  readonly stand: string
}

/**
 * Die Familien für die Auswahl.
 *
 * **Warum `openai-kompatibel` zuletzt steht.** Die bekannten Familien tragen eine gemessene
 * Adresse; der offene Eintrag ist der Ausnahmefall. Ihn zuerst zu zeigen lüde dazu ein, ihn
 * wahllos zu wählen — und dann steht ein Anbieter da, über den nichts bekannt ist.
 *
 * @returns die Auskünfte in Anzeigereihenfolge
 */
export function familienAuswahl(): readonly Familienauskunft[] {
  const bekannt: Familienauskunft[] = FAMILIEN.map((familie) => ({
    id: familie.id,
    name: familie.name,
    basis: familie.basis,
    basisNoetig: false,
    stand: familie.stand,
  }))
  return [
    ...bekannt,
    {
      id: OFFENE_FAMILIE,
      name: 'Eigener Endpunkt (OpenAI-kompatibel)',
      basisNoetig: true,
      stand:
        'Keine Tabelle: Pfad und Form sind unbekannt. Die Sonde prüft die üblichen Wege und sagt ' +
        '„vorhanden" nur, wenn der Dienst den Auftrag wirklich abweist (400/405/415/422) — ein 401 ' +
        'zählt nicht.',
    },
  ]
}

/**
 * Baut die Familie zu einem Zugang.
 *
 * @param zugang - der Zugang
 * @returns die Familie oder `undefined`, wenn weder Tabelle noch Basis eine Adresse hergeben
 */
export function familieFuer(zugang: Zugang): Familie | undefined {
  const bekannt = familieMit(zugang.familie)
  if (bekannt !== undefined) {
    // **Die Basis des Zugangs überschreibt die Tabelle.** Genau dafür ist sie da: derselbe
    // OpenAI-kompatible Weg, aber auf einem anderen Rechner (Proxy, Gateway, eigener Port).
    return zugang.basis === undefined ? bekannt : { ...bekannt, basis: ohneSchraegstrich(zugang.basis) }
  }
  if (zugang.basis === undefined) return undefined
  return offeneFamilie(zugang.name, zugang.familie, ohneSchraegstrich(zugang.basis))
}

/**
 * Baut die Familie für einen eigenen Endpunkt.
 *
 * **Warum `wege: {}`.** Die Tabelle dieses Pakets ist gemessen; hier ist **nichts** gemessen. Leere
 * Wege heißen: die Sonde nimmt die verbreiteten Pfade (`VERSUCHSPFAD`) und deutet den Status. Ein
 * eingetragener Pfad ohne Messung wäre eine Behauptung.
 *
 * @param name - der Anzeigename
 * @param id - die Kennung
 * @param basis - die Adresse ohne Schrägstrich am Ende
 * @returns die Familie
 */
function offeneFamilie(name: string, id: string, basis: string): Familie {
  return {
    id,
    name,
    basis,
    kopf: (schluessel) => ({ authorization: `Bearer ${schluessel}` }),
    modellWeg: '/models',
    wege: {},
    stand: `Eigener Endpunkt ${basis} — Pfad und Form sind nicht gemessen.`,
  }
}

/**
 * Baut aus einem Eintrag einen **fertigen Anbieter** — soweit es eine Umsetzung gibt.
 *
 * ## Warum das hier steht
 *
 * Ein Eintrag ist eine Beschreibung; ein `Anbieter` ist die Umsetzung
 * (`@prometheus-harness/capabilities`). Bisher war der Weg dazwischen Handarbeit: das
 * AI-Plugin baute `openrouter()` mit einem festen Schlüssel. Hier wird der Eintrag zur
 * Umsetzung — und die Kennung ist die des **Eintrags**, nicht die der Familie: zwei
 * OpenRouter-Zugänge (privat und geschäftlich) sind zwei Anbieter und dürfen sich nicht
 * gegenseitig aus der Registratur werfen.
 *
 * ## Was es (noch) NICHT gibt
 *
 * Zwei Umsetzungen: `openrouter` und `typesafe`. Für jede andere Familie ist `undefined` die
 * ehrliche Antwort — kein geratener HTTP-Aufbau, keine erfundenen Feldnamen. Ein generischer
 * OpenAI-kompatibler Anbieter folgt erst, wenn seine Form gemessen ist.
 *
 * **Warum `typesafe` nicht über den OpenAI-kompatiblen Weg läuft.** Es könnte — `response_format`
 * gibt es dort auch. Aber dann käme das JSON **ohne** `confidence`, und der Platz, für den der
 * Vertrag ihn vorsieht (`Urteil.sicherheit`), bliebe leer. Zwei Formen, zwei Umsetzungen.
 *
 * @param zugang - der Eintrag
 * @param schluessel - woher der Schlüssel kommt (eine Funktion, kein Wert)
 * @returns der Anbieter oder `undefined`, wenn es für die Familie keine Umsetzung gibt
 */
export function anbieterAusZugang(
  zugang: Zugang,
  schluessel: () => string | undefined | Promise<string | undefined>,
): Anbieter | undefined {
  if (zugang.familie === 'openrouter') {
    const roh = openrouter({
      schluessel,
      modelle: zugang.modelle,
      ...(zugang.basis === undefined ? {} : { basis: ohneSchraegstrich(zugang.basis) }),
    })
    return { ...roh, id: zugang.id, name: zugang.name }
  }
  if (zugang.familie === 'typesafe') {
    // **Nur `entscheiden`.** TypeSafe kann nichts anderes; ein Zugang, der mehr verspricht,
    // verspräche es ins Leere. Die Modellwahl ist genau eine Kennung je Fähigkeit — hier die
    // für `entscheiden`.
    const modell = zugang.modelle['entscheiden']
    const roh = typesafe({
      schluessel,
      ...(zugang.basis === undefined ? {} : { basis: ohneSchraegstrich(zugang.basis) }),
      ...(modell === undefined ? {} : { modell }),
    })
    return { ...roh, id: zugang.id, name: zugang.name }
  }
  return undefined
}

/** Warum eine Prüfung nicht stattfinden konnte. */
export class PruefFehler extends Error {
  /**
   * @param meldung - was fehlt
   */
  constructor(meldung: string) {
    super(meldung)
    this.name = 'PruefFehler'
  }
}

/**
 * Was die Sonde zu **einem** Zugang ergeben hat.
 *
 * **Ohne Schlüssel, ohne Kopfzeilen.** Der Befund ist das, was die Oberfläche zeigen darf; der
 * Schlüssel bleibt in der Ablage.
 */
export interface Pruefbefund {
  /** Die Kennung des Zugangs. */
  readonly id: string
  /** Die befragte Familie. */
  readonly familie: string
  /** Die Adresse, gegen die geprüft wurde. */
  readonly basis: string
  /** Wann geprüft wurde (ISO 8601). */
  readonly geprueftAm: string
  /** Ob die Models-API geantwortet hat. */
  readonly modelleErreichbar: boolean
  /** Die Modelle, die sie genannt hat — gekürzt, damit die Antwort nicht wächst. */
  readonly modelle: readonly string[]
  /** Wie viele Modelle sie genannt hat (vor der Kürzung). */
  readonly modellAnzahl: number
  /** Je Fähigkeit der Befund. */
  readonly wege: Readonly<Record<string, Wegbefund>>
  /** Was sonst zu sagen ist. */
  readonly bemerkung: string
}

/** Wie viele Modellkennungen höchstens mitgehen. */
export const MODELLE_MAX = 60

/** Was die Sonde braucht. */
export interface Pruefoptionen {
  /** Der Schlüssel — **nur** für diese Prüfung, nie gespeichert. */
  readonly schluessel?: string
  /** Der Netzzugriff; im Test ersetzbar. */
  readonly abruf?: Abruf
  /** Die Frist je Aufruf in Millisekunden. */
  readonly fristMs?: number
  /** Der Zeitpunkt (im Test setzbar). */
  readonly jetzt?: Date
}

/**
 * Prüft einen Zugang gegen die **lebende** Schnittstelle.
 *
 * **Was hier NICHT passiert: eine Fähigkeit wird aufgerufen.** Die Sonde aus
 * `@prometheus-harness/provider-directory` schickt leere Aufträge und liest nur den Status. Ein
 * abgewiesener Auftrag erzeugt keine Rechnung — und ein 404 ist der ehrliche Beweis, daß ein Weg
 * fehlt.
 *
 * @param zugang - der Zugang
 * @param optionen - Schlüssel, Netzzugriff, Frist, Zeitpunkt
 * @returns der Befund
 * @throws PruefFehler - wenn es keine Adresse gibt oder die Sonde nicht laufen konnte
 */
export async function sondeFuer(zugang: Zugang, optionen: Pruefoptionen = {}): Promise<Pruefbefund> {
  const familie = familieFuer(zugang)
  if (familie === undefined) {
    throw new PruefFehler(
      `Für „${zugang.name}" gibt es keine Adresse: die Familie „${zugang.familie}" steht nicht in ` +
        'der Tabelle, und der Zugang nennt keine Basis.',
    )
  }
  const befund: Sondebefund = await sonde(familie, {
    ...(optionen.schluessel === undefined ? {} : { schluessel: optionen.schluessel }),
    ...(optionen.abruf === undefined ? {} : { abruf: optionen.abruf }),
    ...(optionen.fristMs === undefined ? {} : { fristMs: optionen.fristMs }),
  })
  const jetzt = optionen.jetzt ?? new Date()
  return {
    id: zugang.id,
    familie: familie.id,
    basis: familie.basis,
    geprueftAm: jetzt.toISOString(),
    modelleErreichbar: befund.modelleErreichbar,
    modelle: befund.modelle.slice(0, MODELLE_MAX),
    modellAnzahl: befund.modelle.length,
    wege: befund.wege,
    bemerkung: befund.bemerkung,
  }
}

/**
 * Welche Fähigkeiten die Sonde **nicht** als vorhanden erkannt hat.
 *
 * **Warum das eine eigene Funktion ist.** „fehlt" und „unbekannt" sind zwei verschiedene Antworten.
 * Sie zu einer zu verschmelzen war der Fehler, den `standDesWeges` in der Tabelle bereits vermeidet.
 *
 * @param befund - der Befund
 * @returns die Fähigkeiten ohne „vorhanden", mit ihrem Befund
 */
export function ohneWeg(befund: Pruefbefund): readonly { readonly faehigkeit: string; readonly befund: Wegbefund }[] {
  return Object.entries(befund.wege)
    .filter(([, wert]) => wert !== 'vorhanden')
    .map(([faehigkeit, wert]) => ({ faehigkeit, befund: wert }))
}

/**
 * Die Fähigkeiten, für die ein Weg als vorhanden erkannt wurde.
 *
 * @param befund - der Befund
 * @returns die Fähigkeiten
 */
export function mitWeg(befund: Pruefbefund): readonly Faehigkeit[] {
  return Object.entries(befund.wege)
    .filter(([, wert]) => wert === 'vorhanden')
    .map(([faehigkeit]) => faehigkeit as Faehigkeit)
}
