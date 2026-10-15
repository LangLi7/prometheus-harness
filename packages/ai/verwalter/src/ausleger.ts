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

/** Was der Ausleger braucht. */
export interface Auslegeauftrag {
  /** Die Kennung der Familie (`zai`). */
  readonly familie: string
  /** Wie der Dienst heißt — für den Text, den das Modell liest. */
  readonly dienst: string
  /** Die Kennungen, die die Models-API genannt hat. */
  readonly modelle: readonly string[]
  /** Wer auslegt. */
  readonly entscheider: Entscheider
  /** Die Schwellen des Aufrufers. */
  readonly stufen: Stufen
  /** Der Wächter, der **vor** dem Modellaufruf prüft. */
  readonly waechter: Waechter
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
  'Antworte für JEDE Fähigkeit mit wahr oder falsch und gib mit `sicherheit` an, ' +
  'wie sicher du bist (Zahl zwischen 0 und 1). ' +
  'Beurteile nur, was die Liste der Modellkennungen und der Name des Dienstes hergeben. ' +
  'Wenn die Liste nichts hergibt, sage das über die Sicherheit — rate nicht.'

/**
 * Legt eine fremde Models-API-Antwort aus — **durch den Wächter**.
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
