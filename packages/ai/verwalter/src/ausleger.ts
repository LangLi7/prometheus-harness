/**
 * Der Ausleger — er legt **fremde** Antworten aus.
 *
 * ## Warum es ihn gibt
 *
 * Eine Models-API nennt Kennungen wie `glm-4.6`, `gemini-3.8-flash-tts` oder `deepseek-v4-pro`.
 * Welche dieser Kennungen **sprechen**, welche **einbetten**, welche nur **reden** — das steht
 * nirgends. Und aus der Liste allein läßt sich die Fähigkeit **nicht** ableiten: die Liste von
 * OpenRouter nennt 462 Einträge und verschweigt darin TTS, Transkription und Einbetten.
 *
 * Der Betreiber hat festgelegt, wer das auslegt: **DeepSeek Flash**, wegen des
 * Preis-Leistungs-Verhältnisses. Hier steht der Ablauf; **welcher** Anbieter auslegt, entscheidet
 * der Aufrufer — dieser Code kennt nur einen `Entscheider`.
 *
 * ## Der Satz, der diesen Ablauf prägt
 *
 * **Eine fremde Antwort zu einem Modell zu schicken heißt, sie hinauszuschicken.** Deshalb geht der
 * Text **zuerst** durch den Wächter — und bei einem Fund wird das Modell **gar nicht** gefragt.
 * Sonst hätte der Ausleger das Leck verursacht, das er nicht sieht.
 *
 * ## Warum das Ergebnis „offen" bleiben kann, statt geraten zu werden
 *
 * Der Ausleger liefert eine Zuordnung **und** eine Sicherheit. Reicht sie nicht, wird **nichts**
 * in den Katalog geschrieben — die Auslegung bleibt offen, mit dem Grund, und die Frage geht an
 * einen Menschen (siehe `umgangFuer`). Eine unsichere Auslegung als Tatsache einzutragen wäre der
 * stille Fehler: sie stünde danach im Katalog wie eine Messung.
 *
 * @module @prometheus-harness/verwalter/ausleger
 */

import {
  FAEHIGKEITEN,
  NAME_DER_FAEHIGKEIT,
  umgangFuer,
  type Entscheider,
  type Faehigkeit,
  type Herkunft,
  type Schema,
  type Stufen,
} from '@prometheus-harness/faehigkeiten'
import type { Waechter } from '@prometheus-harness/waechter'
import type { Wegbefund } from '@prometheus-harness/verzeichnis'

/** Was der Ausleger braucht. */
export interface Auslegeauftrag {
  /** Die Kennung der Familie (`zai`). */
  readonly familie: string
  /** Wie der Dienst heißt — für den Text, den das Modell liest. */
  readonly dienst: string
  /** Die Kennungen, die die Models-API genannt hat. */
  readonly modelle: readonly string[]
  /**
   * Was die **Sonde** über die Wege gemessen hat.
   *
   * **Warum das hereingehört — gemessen am 15.10.2026.** Im ersten lebenden Lauf bekam das Modell
   * nur die Kennungen und den Namen des Dienstes. Es legte für Z.ai mit Sicherheit **0,93** fest,
   * der Dienst biete *„keine der bekannten Fähigkeiten"* — während die Sonde für **dieselbe**
   * Familie im **selben** Lauf **alle sechs Wege** als antwortend gemessen hatte.
   *
   * Der Grund war nicht Nachlässigkeit, sondern **Unbeantwortbarkeit**: aus Modell**namen** läßt
   * sich keine Fähigkeit ableiten. Ohne diese Angabe beurteilt der Ausleger ins Leere — und je
   * sicherer er sich dabei fühlt, desto schlimmer.
   */
  readonly wege: Readonly<Record<string, Wegbefund>>
  /** Wer auslegt. */
  readonly entscheider: Entscheider
  /** Die Schwellen des Aufrufers. */
  readonly stufen: Stufen
  /** Der Wächter, der **vor** dem Modellaufruf prüft. */
  readonly waechter: Waechter
}

/**
 * Prüft eine Auslegung **gegen die Messung**.
 *
 * ## Warum das die wichtigste Funktion dieser Datei ist
 *
 * Die Sonde **mißt** einen Weg: sie schickt einen leeren Auftrag und sieht nach, ob der Pfad
 * antwortet. Der Ausleger **deutet**. Wo die Deutung der Messung widerspricht, hat die **Messung**
 * recht — die Deutung ist dann keine Auskunft, sondern ein **Widerspruch**, und der gehört in den
 * Katalog.
 *
 * **`unbekannt` widerspricht nichts.** Ein Tor (401/403) oder ein Netzfehler sagt nichts über den
 * Weg; daraus läßt sich kein Widerspruch bauen. Nur `vorhanden` und `fehlt` sind Aussagen.
 *
 * @param wege - was die Sonde gemessen hat
 * @param faehigkeiten - was der Ausleger behauptet
 * @returns der Widerspruch oder `undefined`
 */
export function widerspruchZwischen(
  wege: Readonly<Record<string, Wegbefund>>,
  faehigkeiten: readonly Faehigkeit[],
): string | undefined {
  const maengel: string[] = []
  for (const faehigkeit of FAEHIGKEITEN) {
    const befund = wege[faehigkeit]
    if (befund === undefined || befund === 'unbekannt') continue
    const behauptet = faehigkeiten.includes(faehigkeit)
    if (befund === 'vorhanden' && !behauptet) {
      maengel.push(
        `„${NAME_DER_FAEHIGKEIT[faehigkeit]}": der Weg antwortet, die Auslegung sagt „gibt es nicht"`,
      )
    }
    if (befund === 'fehlt' && behauptet) {
      maengel.push(
        `„${NAME_DER_FAEHIGKEIT[faehigkeit]}": der Weg gibt 404, die Auslegung sagt „gibt es"`,
      )
    }
  }
  return maengel.length === 0 ? undefined : maengel.join('; ')
}

/** Was der Ausleger ergeben hat. */
export interface Auslegeergebnis {
  /** Ob die Auslegung als Tatsache in den Katalog darf. */
  readonly angenommen: boolean
  /** Die für belegt gehaltenen Fähigkeiten — **nur** bei `angenommen`. */
  readonly faehigkeiten?: readonly Faehigkeit[]
  /** Wie sicher der Ausleger war. */
  readonly sicherheit?: number
  /** Wer ausgelegt hat. */
  readonly herkunft?: Herkunft
  /**
   * Wo die Auslegung der **Messung** widerspricht.
   *
   * Steht hier etwas, ist `angenommen` **falsch** — die Messung hat recht, nicht die Deutung.
   */
  readonly widerspruch?: string
  /** Warum so entschieden wurde — und bei `angenommen: false`, warum nicht. */
  readonly wegen: string
}

/** Das Schema des Auslegers: je Fähigkeit ein Wahrheitswert, dazu die Sicherheit. */
type Auslegeschema = { readonly [K in Faehigkeit | 'sicherheit']: K extends 'sicherheit' ? number : boolean }

/**
 * Baut das Schema — **aus der Fähigkeitsliste**, nicht aus einer zweiten Aufzählung.
 *
 * **Warum das wichtig ist.** Eine handgeschriebene Feldliste ginge auseinander, sobald eine
 * Fähigkeit dazukommt: das neue Feld fehlte, das Modell würde es nicht füllen, und die Auslegung
 * wäre still unvollständig. Hier steht jede Fähigkeit, die es gibt.
 *
 * @returns das Schema
 */
export function auslegeSchema(): Schema<Auslegeschema> {
  const felder: Record<string, { art: 'wahrheitswert' | 'zahl' }> = {}
  for (const faehigkeit of FAEHIGKEITEN) felder[faehigkeit] = { art: 'wahrheitswert' }
  felder['sicherheit'] = { art: 'zahl' }
  return { felder } as Schema<Auslegeschema>
}

/** Der Auftrag an das Modell. */
const FRAGE =
  'Welche Fähigkeiten bietet dieser KI-Dienst an? ' +
  'Du bekommst zwei Angaben: die Kennungen der Modelle und die BEREITS GEMESSENEN Wege. ' +
  'Die gemessenen Wege sind Tatsachen — ein Weg, der „vorhanden" ist, antwortet wirklich, ' +
  'ein Weg, der „fehlt" ist, gibt 404. Deine Beurteilung darf ihnen NICHT widersprechen. ' +
  'Antworte für JEDE Fähigkeit mit wahr oder falsch und gib mit `sicherheit` an, ' +
  'wie sicher du bist (Zahl zwischen 0 und 1). ' +
  'Wenn die Angaben nicht ausreichen, sage das über die Sicherheit — rate nicht.'

/**
 * Schreibt die gemessenen Wege als Text.
 *
 * @param wege - die Befunde der Sonde
 * @returns die Zeilen
 */
function wegeAlsText(wege: Readonly<Record<string, Wegbefund>>): string[] {
  const zeilen: string[] = []
  for (const faehigkeit of FAEHIGKEITEN) {
    const befund = wege[faehigkeit]
    if (befund === undefined) continue
    const erklaerung =
      befund === 'vorhanden'
        ? 'vorhanden (der Pfad antwortet)'
        : befund === 'fehlt'
          ? 'fehlt (404)'
          : 'unbekannt (Tor oder Netzfehler — sagt nichts über den Weg)'
    zeilen.push(`- ${faehigkeit} (${NAME_DER_FAEHIGKEIT[faehigkeit]}): ${erklaerung}`)
  }
  return zeilen.length === 0 ? ['(kein Weg wurde gemessen)'] : zeilen
}

/**
 * Legt eine fremde Models-API-Antwort aus — **durch den Wächter** und **gegen die Messung**.
 *
 * @param auftrag - was auszulegen ist und wer es tut
 * @returns das Ergebnis; bei einem Fund des Wächters **ohne** Modellaufruf
 */
export async function legeAus(auftrag: Auslegeauftrag): Promise<Auslegeergebnis> {
  const text = [
    `Dienst: ${auftrag.dienst} (${auftrag.familie})`,
    `Anzahl der Kennungen: ${String(auftrag.modelle.length)}`,
    'Kennungen:',
    ...auftrag.modelle.map((m) => `- ${m}`),
    '',
    'Gemessene Wege:',
    ...wegeAlsText(auftrag.wege),
  ].join('\n')

  // **Zuerst der Wächter.** Eine fremde Antwort kann alles enthalten — auch einen Schlüssel, den
  // jemand in eine Fehlermeldung geschrieben hat. Sie zu einem Modell zu schicken hieße, sie
  // hinauszuschicken.
  const erlaubnis = auftrag.waechter.pruefe(text)
  if (!erlaubnis.darfRaus) {
    return {
      angenommen: false,
      wegen:
        `NICHT ausgelegt, und es wurde KEIN Modell gefragt: der Wächter hat etwas gefunden. ` +
        `${erlaubnis.wegen}`,
    }
  }

  if (auftrag.modelle.length === 0) {
    // Eine leere Liste heißt nicht „kann nichts" — sie heißt „die Models-API hat nichts genannt".
    // Das ist eine andere Lage und wird auch so festgehalten.
    return { angenommen: false, wegen: 'Die Models-API hat KEINE Kennung genannt — es gibt nichts auszulegen.' }
  }

  const urteil = await auftrag.entscheider.entscheide({
    frage: FRAGE,
    lage: { dienst: auftrag.dienst, kennungen: auftrag.modelle },
    schema: auslegeSchema(),
  })

  // Die Sicherheit steht **im Schema**, nicht in `Urteil.sicherheit`: ob der Anbieter von sich aus
  // eine meldet, ist seine Sache. Wir haben sie **verlangt** — dann ist sie da oder die Auslegung
  // fällt durch (siehe `umgangFuer`: ohne Sicherheit geht es zum Menschen).
  const sicherheit = urteil.wert.sicherheit
  const umgang = umgangFuer(
    { sicherheit, ...(urteil.herkunft === undefined ? {} : { herkunft: urteil.herkunft }) },
    auftrag.stufen,
  )

  if (umgang !== 'handeln') {
    return {
      angenommen: false,
      sicherheit,
      ...(urteil.herkunft === undefined ? {} : { herkunft: urteil.herkunft }),
      wegen:
        `Nicht übernommen: ${umgang === 'mensch' ? 'zu unsicher' : 'unsicher'} ` +
        `(Sicherheit ${typeof sicherheit === 'number' ? sicherheit.toFixed(2) : 'nicht angegeben'}). ` +
        'Eine unsichere Auslegung als Tatsache einzutragen wäre der stille Fehler.',
    }
  }

  const belegt = FAEHIGKEITEN.filter((f) => urteil.wert[f] === true)

  // **Die Messung hat recht, nicht die Deutung.** Auch bei hoher Sicherheit: im ersten lebenden
  // Lauf hat sich das Modell mit 0,93 geirrt. Eine Auslegung, die einem gemessenen Weg
  // widerspricht, ist keine Auskunft — sie ist ein Widerspruch, und der gehört in den Katalog.
  const widerspruch = widerspruchZwischen(auftrag.wege, belegt)
  if (widerspruch !== undefined) {
    return {
      angenommen: false,
      sicherheit,
      ...(urteil.herkunft === undefined ? {} : { herkunft: urteil.herkunft }),
      widerspruch,
      wegen: `NICHT übernommen: die Auslegung widerspricht der MESSUNG. ${widerspruch}.`,
    }
  }

  return {
    angenommen: true,
    faehigkeiten: belegt,
    sicherheit,
    ...(urteil.herkunft === undefined ? {} : { herkunft: urteil.herkunft }),
    wegen:
      belegt.length === 0
        ? 'Ausgelegt: der Dienst bietet nach dieser Auslegung KEINE der bekannten Fähigkeiten an.'
        : `Ausgelegt: ${belegt.map((f) => NAME_DER_FAEHIGKEIT[f]).join(', ')}.`,
  }
}
