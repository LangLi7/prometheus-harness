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
import type { Waechter } from '@prometheus-harness/guard'
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
 * Was eine Auslegung gegen die **Messung** wert ist.
 *
 * Alle drei Felder leer heißt: die Auslegung ist gedeckt.
 */
export interface Auslegepruefung {
  /** Die Messung sagt **nein** (404), die Auslegung sagt **ja**. */
  readonly widerspruch?: string
  /**
   * Die Auslegung behauptet **mehr, als gemessen ist**.
   *
   * **Warum das ein eigener Fall ist — lebend gemessen am 15.10.2026.** ZenMux gibt auf **jeden**
   * POST 403; die Sonde konnte dort **keinen** Weg messen, alles war `unbekannt`. Das Modell
   * behauptete trotzdem mit Sicherheit 0,95 **alle sechs** Fähigkeiten — und wurde **angenommen**,
   * weil `unbekannt` ja nichts widerspricht.
   *
   * Die Lücke war: „widerspricht nicht" ist **nicht** dasselbe wie „ist belegt".
   */
  readonly nichtBelegt?: string
  /**
   * Die Auslegung ist **enger** als die Messung: sie streitet ab, was gemessen wurde.
   *
   * **Warum auch das nicht durchgehen darf.** Im ersten lebenden Lauf legte das Modell für Z.ai mit
   * Sicherheit 0,93 fest, der Dienst biete „keine der bekannten Fähigkeiten" — während die Sonde
   * **alle sechs** Wege als antwortend gemessen hatte. Ließe man das durch, stünde im Katalog
   * `faehigkeiten: []` neben sechs gemessenen Wegen: ein Widerspruch im selben Eintrag, den eine
   * Anzeige nicht auflösen kann.
   *
   * **Und die Regel dahinter:** wo Messung und Deutung **auseinandergehen** — in welche Richtung
   * auch immer —, ist das ein Fall für einen **Menschen**. Das ist dieselbe Regel, die überall
   * sonst in diesem Haus gilt.
   */
  readonly engerAlsGemessen?: string
}

/**
 * Prüft eine Auslegung **gegen die Messung** — in **beide** Richtungen.
 *
 * ## Warum beide Richtungen
 *
 * Die Sonde **mißt** einen Weg: sie schickt einen leeren Auftrag und sieht nach, ob der Pfad
 * antwortet. Der Ausleger **deutet**. Damit gibt es drei Arten, wie die Deutung danebengehen kann,
 * und **jede** wurde an einem echten Fall gemessen:
 *
 * | Fall | Was die Messung sagt | Was die Deutung tut | Was daraus folgt |
 * |---|---|---|---|
 * | `widerspruch` | 404 | behauptet den Weg | Die Messung sagt **nein** |
 * | `nichtBelegt` | unbekannt / nichts | behauptet den Weg | Es gibt **keine** Messung |
 * | `engerAlsGemessen` | antwortet | streitet den Weg ab | Die Deutung geht gegen die Messung |
 *
 * In **allen drei** Fällen wird die Auslegung **nicht** übernommen. Das ist streng — und Absicht:
 * ein Katalog, der sich als gemessen ausgibt, darf nur tragen, was Messung und Deutung **decken**.
 *
 * @param wege - was die Sonde gemessen hat
 * @param faehigkeiten - was der Ausleger behauptet
 * @returns die Prüfung; alle Felder leer heißt „gedeckt"
 */
export function pruefeAuslegung(
  wege: Readonly<Record<string, Wegbefund>>,
  faehigkeiten: readonly Faehigkeit[],
): Auslegepruefung {
  const widersprueche: string[] = []
  const unbelegte: string[] = []
  const enger: string[] = []

  for (const faehigkeit of FAEHIGKEITEN) {
    const name = NAME_DER_FAEHIGKEIT[faehigkeit]
    const befund = wege[faehigkeit]
    const behauptet = faehigkeiten.includes(faehigkeit)

    if (behauptet) {
      if (befund === 'vorhanden') continue
      if (befund === 'fehlt') {
        widersprueche.push(`„${name}": der Weg gibt 404, die Auslegung sagt „gibt es"`)
      } else {
        unbelegte.push(`„${name}": kein Weg wurde als antwortend gemessen`)
      }
      continue
    }
    // Nicht behauptet — und trotzdem gemessen. Die Deutung geht gegen die Messung.
    if (befund === 'vorhanden') {
      enger.push(`„${name}": der Weg antwortet, die Auslegung sagt „gibt es nicht"`)
    }
  }

  return {
    ...(widersprueche.length === 0 ? {} : { widerspruch: widersprueche.join('; ') }),
    ...(unbelegte.length === 0 ? {} : { nichtBelegt: unbelegte.join('; ') }),
    ...(enger.length === 0 ? {} : { engerAlsGemessen: enger.join('; ') }),
  }
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
  /**
   * Wo die Auslegung **mehr behauptet, als gemessen ist**.
   *
   * Steht hier etwas, ist `angenommen` **falsch**: ohne Messung ist die Behauptung eine Meinung.
   */
  readonly nichtBelegt?: string
  /**
   * Wo die Auslegung **enger** ist als die Messung.
   *
   * Steht hier etwas, ist `angenommen` **falsch**: Messung und Deutung gehen auseinander, und das
   * ist ein Fall für einen Menschen.
   */
  readonly engerAlsGemessen?: string
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
 * Die **gemessene** Empfehlung für das Auslegermodell.
 *
 * ## Warum ein nichtdenkendes Modell
 *
 * Gemessen am 15.10.2026 mit **derselben** Frage, **demselben** Weg (`legeAus`), zwei Familien:
 *
 * | Modell | Z.ai (11 Kennungen) | Nous (422 Kennungen) |
 * |---|---|---|
 * | `deepseek/deepseek-v4-flash-0731` (denkt) | 40,4 s · Sicherheit **0,00** | 176,4 s · Sicherheit **0,00** |
 * | **`ibm-granite/granite-4.0-h-micro`** (denkt **nicht**) | **2,2 s** · 0,95 · **angenommen und richtig** | **3,4 s** · 0,95 |
 * | `openai/gpt-oss-20b` (denkt) | 56,4 s · Sicherheit 0,02 | **300 s** · Zeitüberschreitung |
 *
 * **Die denkenden Modelle antworten nicht.** Sie melden 0,00 bis 0,02 Sicherheit und werden damit
 * nicht übernommen — der Ausleger trägt nichts bei. Das nichtdenkende Modell antwortet in
 * **Sekunden**, mit 0,95.
 *
 * ## Und es irrt sich — der Wächter ist der Grund, warum das geht
 *
 * Beim selben Lauf behauptete `granite-4.0-h-micro` für Nous Research Sprache, Ton, Einbetten und
 * Bild — während die Sonde für alle vier **404** gemessen hatte. `widerspruchZwischen` fing es auf.
 *
 * **Ein schnell antwortendes Modell, das sich irren kann, ist nur zusammen mit der
 * Widerspruchsprüfung brauchbar.** Ohne sie stünde die falsche Behauptung im Katalog; mit ihr
 * steht dort der Widerspruch.
 *
 * **Es bleibt eine Empfehlung, keine Vorgabe.** Welches Modell läuft, entscheidet der Endnutzer.
 */
export const AUSLEGER_EMPFEHLUNG = 'ibm-granite/granite-4.0-h-micro'

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
 * Ist unter den Befunden **ein Meßwert**, an dem eine Auslegung sich halten kann?
 *
 * **Warum das gefragt wird, bevor ein Modell gefragt wird.** Ein Befund von `unbekannt` ist **kein
 * Meßwert**: er sagt, daß das Tor zu war oder das Netz nicht antwortete. Aus sechs `unbekannt`
 * folgt **nichts** — und wer trotzdem ein Modell fragt, bekommt eine Meinung, die auf nichts steht.
 *
 * **Der Unterschied, den das macht:** ZenMux gibt auf **jeden** POST 403. Zuvor wurde das Modell
 * dort gefragt, antwortete mit 0,95 „alle sechs Fähigkeiten" — und ohne die Prüfung wäre das in den
 * Katalog gekommen. Jetzt wird dort **gar nicht** gefragt, und es steht der Grund im Katalog.
 *
 * @param wege - die Befunde der Sonde
 * @returns ob mindestens ein Weg wirklich gemessen wurde
 */
export function messbar(wege: Readonly<Record<string, Wegbefund>>): boolean {
  return Object.values(wege).some((befund) => befund === 'vorhanden' || befund === 'fehlt')
}

/**
 * Legt eine fremde Models-API-Antwort aus — **durch den Wächter** und **gegen die Messung**.
 *
 * @param auftrag - was auszulegen ist und wer es tut
 * @returns das Ergebnis; bei einem Fund des Wächters **ohne** Modellaufruf
 * @throws Error - wenn **kein Weg gemessen** wurde. Das ist ein Fehler des Aufrufers: einen
 *   Ausleger ohne Meßwert zu fragen heißt, nach einer Meinung zu fragen.
 */
export async function legeAus(auftrag: Auslegeauftrag): Promise<Auslegeergebnis> {
  if (Object.keys(auftrag.wege).length === 0) {
    // **Hier stand vorher ein stiller Durchlauf.** Eine Auslegung ganz ohne Messung wurde
    // entgegengenommen und dann an `pruefeAuslegung` weitergereicht — mit dem Ergebnis „nicht
    // belegt". Das war zu nachsichtig: wer nichts gemessen hat, darf **gar nicht** fragen. Ein
    // Fehler, der erst beim Auswerten auffällt, ist ein Fehler, der zu spät auffällt.
    throw new Error(
      'Der Ausleger wurde OHNE MESSUNG gefragt — es gibt keinen einzigen Wegbefund. ' +
        'Erst sondieren, dann auslegen: ohne Meßwert ist jede Auslegung eine Meinung.',
    )
  }

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
  // Lauf hat sich das Modell mit 0,93 geirrt. Und die Auslegung darf **enger** sein als die
  // Messung, nicht **weiter** — sonst stünde eine Meinung im Katalog, der sich als gemessen ausgibt.
  const pruefung = pruefeAuslegung(auftrag.wege, belegt)

  if (pruefung.widerspruch !== undefined) {
    return {
      angenommen: false,
      sicherheit,
      ...(urteil.herkunft === undefined ? {} : { herkunft: urteil.herkunft }),
      widerspruch: pruefung.widerspruch,
      wegen: `NICHT übernommen: die Auslegung widerspricht der MESSUNG. ${pruefung.widerspruch}.`,
    }
  }

  if (pruefung.nichtBelegt !== undefined) {
    // **Der Fall, der am 15.10.2026 durchging.** ZenMux gibt auf jeden POST 403 — die Sonde konnte
    // nichts messen, und das Modell behauptete trotzdem alle sechs Fähigkeiten mit 0,95. „Es
    // widerspricht nichts" ist NICHT „es ist belegt".
    return {
      angenommen: false,
      sicherheit,
      ...(urteil.herkunft === undefined ? {} : { herkunft: urteil.herkunft }),
      nichtBelegt: pruefung.nichtBelegt,
      wegen:
        `NICHT übernommen: die Auslegung behauptet mehr, als gemessen ist. ${pruefung.nichtBelegt}. ` +
        'Ohne Messung ist eine Behauptung eine Meinung.',
    }
  }

  if (pruefung.engerAlsGemessen !== undefined) {
    // **Der Fall aus dem ERSTEN lebenden Lauf.** Das Modell legte für Z.ai mit 0,93 fest, der
    // Dienst biete „keine der bekannten Fähigkeiten" — während die Sonde alle sechs Wege als
    // antwortend gemessen hatte. Messung und Deutung gehen auseinander; das sieht ein Mensch an.
    return {
      angenommen: false,
      sicherheit,
      ...(urteil.herkunft === undefined ? {} : { herkunft: urteil.herkunft }),
      engerAlsGemessen: pruefung.engerAlsGemessen,
      wegen:
        `NICHT übernommen: die Auslegung ist ENGER als die Messung. ${pruefung.engerAlsGemessen}. ` +
        'Messung und Deutung gehen auseinander — das gehört einem Menschen vorgelegt.',
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
