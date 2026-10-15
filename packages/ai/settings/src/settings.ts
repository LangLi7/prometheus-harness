/**
 * Die Einstellungen des Endnutzers — **rein**: kein Dateisystem, kein Netz.
 *
 * ## Was hier drinsteht, und was NICHT
 *
 * | Drin | Warum |
 * |---|---|
 * | Die **Wahl je Fähigkeit** (Anbieter + Modellkennung) | Der Endnutzer entscheidet, welches Modell läuft |
 * | Die **Schwellen** (`automatisch`, `rueckfrage`) | Die Risikotoleranz gehört dem Aufrufer |
 * | Der Schalter **`denkhilfe`** | Standard aus; der Nutzer schaltet ihn ein |

 * | **NICHT drin** | Warum |
 * |---|---|
 * | **Schlüssel** | Sie gehören in den Schlüsselspeicher. Eine Einstellungsdatei wird angezeigt, geteilt und gesichert — ein Schlüssel darin wäre überall mit dabei. |
 * | Vorgabemodelle | Es gibt **keine**. Eine Vorgabe wäre eine Entscheidung, die niemand getroffen hat. |
 *
 * ## Warum eine kaputte Datei ein FEHLER ist und eine fehlende nicht
 *
 * **Fehlende Datei → Vorgabe** (nichts gewählt): das ist der Normalzustand vor der ersten
 * Einrichtung. Der Anbieter meldet dann „nicht bereit", und die Kette läuft bis zum Menschen.
 *
 * **Kaputte Datei → Fehler, laut.** Wer eine Datei hat, hat etwas **gewollt**. Sie stillschweigend
 * durch Vorgaben zu ersetzen hieße: seine Wahl verschwindet, und nichts sagt es. Der schlimmste
 * Fall wäre eine **vertippte Fähigkeit** (`entscheiden` statt `entscheiden` — ein Buchstabe
 * daneben): sie läse sich wie „nichts gewählt", und die Entscheidungen gingen zum Menschen, ohne
 * daß jemand erführe warum.
 *
 * @module @prometheus-harness/settings/einstellungen
 */

import { FAEHIGKEITEN, NAME_DER_FAEHIGKEIT, type Faehigkeit, type Stufen } from '@prometheus-harness/faehigkeiten'

/** Die Fassung dieses Formats. Eine unbekannte Fassung wird **abgelehnt**, nicht gedeutet. */
export const FASSUNG = 1

/** Welcher Anbieter mit welchem Modell eine Fähigkeit bedient. */
export interface Wahl {
  /** Die Kennung des Anbieters (`openrouter`). */
  readonly anbieter: string
  /** Die Modellkennung (`openai/gpt-oss-20b`). */
  readonly modell: string
}

/**
 * Wie stark ein Modell **denken** darf.
 *
 * **Warum das eine EINSTELLUNG ist und kein Wert im Code.** Gemessen am 15.10.2026: bei zu kleinem
 * Token-Budget kam ein **leerer** Inhalt zurück — die Zwischenschritte des Modells hatten das Budget
 * aufgebraucht, und bezahlt war nichts Brauchbares. Wie stark ein Modell denken darf, hängt an der
 * Aufgabe **und** am Geldbeutel — beides kennt nur der Endnutzer.
 *
 * **Die vier Wörter sind unsere.** Was der Dienst daraus macht, steht in
 * `@prometheus-harness/openrouter` (`DENKSTUFEN`) — seine Werte sind seine Sache.
 */
export type Denkstufe = 'aus' | 'niedrig' | 'mittel' | 'hoch'

/** Die vier Stufen in fester Reihenfolge — für Anzeige und Prüfung. */
export const DENKSTUFEN: readonly Denkstufe[] = ['aus', 'niedrig', 'mittel', 'hoch']

/** Die Einstellungen. */
export interface Einstellungen {
  /** Die Fassung des Formats. */
  readonly fassung: number
  /** Je Fähigkeit die Wahl. Fehlt eine, ist für sie **nichts** gewählt. */
  readonly wahl: Partial<Record<Faehigkeit, Wahl>>
  /** Die Schwellen für den Umgang mit Unsicherheit. Fehlen sie, entscheidet der Aufrufer. */
  readonly stufen?: Stufen
  /**
   * Ob die Denkhilfe benutzt wird: ein billiges Modell denkt, das teure urteilt.
   *
   * **Vorgabe: `false`.** Der Betreiber hat den Standard so festgelegt — der Schalter ist ein
   * Angebot, keine Einstellung, die jemand still für ihn trifft.
   */
  readonly denkhilfe?: boolean
  /**
   * Wie stark gedacht werden darf.
   *
   * **Der Hebel gegen das volle Denk-Budget.** Gemessen: die Modelle `google/gemini-3.8-flash`,
   * `openai/gpt-oss-20b` und `typesafe/jev-router` nehmen `reasoning_effort` an — **332 von 462**
   * Modellen nennen `reasoning`. Fehlt der Wert, wird **nichts** gesendet und der Anbieter
   * entscheidet wie bisher.
   */
  readonly denken?: Denkstufe
}

/** Die Vorgabe: **nichts gewählt**. */
export const VORGABE: Einstellungen = { fassung: FASSUNG, wahl: {} }

/** Warum eine Einstellungsdatei nicht angenommen wurde. */
export class EinstellungenFehler extends Error {
  /**
   * @param maengel - was alles nicht stimmte
   */
  constructor(readonly maengel: readonly string[]) {
    // **Alle Mängel auf einmal** — beim ersten abzubrechen hieße: Fehler beheben, nächster Fehler,
    // Fehler beheben … bei einer Datei, die ein Mensch von Hand schreibt.
    super(`Die Einstellungen sind unbrauchbar:\n  ${maengel.join('\n  ')}`)
    this.name = 'EinstellungenFehler'
  }
}

/** Die erlaubten Felder der obersten Ebene. */
const ERLAUBT = ['fassung', 'wahl', 'stufen', 'denkhilfe', 'denken'] as const

/**
 * Prüft, ob ein Wert ein nichtleerer Text ist.
 *
 * @param wert - der Wert
 * @returns ob es ein brauchbarer Text ist
 */
function istText(wert: unknown): wert is string {
  return typeof wert === 'string' && wert.trim() !== ''
}

/**
 * Liest Einstellungen aus JSON — **geprüft**, nicht geglaubt.
 *
 * @param text - der Inhalt der Datei
 * @returns die Einstellungen
 * @throws EinstellungenFehler - mit **allen** Mängeln
 */
export function leseEinstellungen(text: string): Einstellungen {
  let roh: unknown
  try {
    roh = JSON.parse(text)
  } catch {
    throw new EinstellungenFehler([`Der Inhalt ist kein JSON. Er begann mit: ${text.slice(0, 120)}`])
  }
  if (roh === null || typeof roh !== 'object' || Array.isArray(roh)) {
    throw new EinstellungenFehler(['Erwartet war ein Objekt.'])
  }
  const objekt = roh as Record<string, unknown>
  const maengel: string[] = []

  // Unbekannte Felder werden ABGELEHNT, nicht weggeworfen. Wer „schwellen" statt „stufen"
  // schreibt, hat etwas gemeint — und würde sonst nie erfahren, daß es nicht angekommen ist.
  for (const feld of Object.keys(objekt)) {
    if (!(ERLAUBT as readonly string[]).includes(feld)) {
      maengel.push(`Unbekanntes Feld „${feld}". Erlaubt: ${ERLAUBT.join(', ')}.`)
    }
  }

  const fassung = objekt['fassung']
  if (fassung !== FASSUNG) {
    maengel.push(
      `Die Fassung ist ${JSON.stringify(fassung) ?? 'nicht angegeben'} — erwartet wird ${String(FASSUNG)}. ` +
        'Eine unbekannte Fassung wird nicht gedeutet.',
    )
  }

  const wahlRoh = objekt['wahl']
  const wahl: Partial<Record<Faehigkeit, Wahl>> = {}
  if (wahlRoh !== undefined) {
    if (wahlRoh === null || typeof wahlRoh !== 'object' || Array.isArray(wahlRoh)) {
      maengel.push('„wahl" muß ein Objekt sein.')
    } else {
      for (const [name, eintrag] of Object.entries(wahlRoh as Record<string, unknown>)) {
        if (!(FAEHIGKEITEN as readonly string[]).includes(name)) {
          // **Der stille Fehler, den diese Zeile verhindert.** Ein Tippfehler im Fähigkeitsnamen
          // läse sich sonst wie „nichts gewählt" — und die Entscheidungen gingen zum Menschen,
          // ohne daß jemand erführe warum.
          maengel.push(
            `Unbekannte Fähigkeit „${name}". Erlaubt: ${FAEHIGKEITEN.join(', ')}.`,
          )
          continue
        }
        if (eintrag === null || typeof eintrag !== 'object' || Array.isArray(eintrag)) {
          maengel.push(`„${name}" muß ein Objekt mit „anbieter" und „modell" sein.`)
          continue
        }
        const satz = eintrag as Record<string, unknown>
        const anbieter = satz['anbieter']
        const modell = satz['modell']
        if (!istText(anbieter)) maengel.push(`„${name}.anbieter" fehlt oder ist leer.`)
        if (!istText(modell)) maengel.push(`„${name}.modell" fehlt oder ist leer.`)
        if (istText(anbieter) && istText(modell)) {
          wahl[name as Faehigkeit] = { anbieter: anbieter.trim(), modell: modell.trim() }
        }
      }
    }
  }

  const stufenRoh = objekt['stufen']
  let stufen: Stufen | undefined
  if (stufenRoh !== undefined) {
    if (stufenRoh === null || typeof stufenRoh !== 'object' || Array.isArray(stufenRoh)) {
      maengel.push('„stufen" muß ein Objekt sein.')
    } else {
      const s = stufenRoh as Record<string, unknown>
      const automatisch = s['automatisch']
      const rueckfrage = s['rueckfrage']
      const schlecht = (w: unknown): boolean => typeof w !== 'number' || !Number.isFinite(w) || w < 0 || w > 1
      if (schlecht(automatisch)) maengel.push('„stufen.automatisch" muß eine Zahl zwischen 0 und 1 sein.')
      if (schlecht(rueckfrage)) maengel.push('„stufen.rueckfrage" muß eine Zahl zwischen 0 und 1 sein.')
      if (!schlecht(automatisch) && !schlecht(rueckfrage) && (rueckfrage as number) > (automatisch as number)) {
        // Dieselbe Regel wie in `umgangFuer` — nur früher geprüft. Eine Schwelle, die nie greift,
        // ist keine Schwelle; sie hier schon abzulehnen erspart einen Fehler beim ersten Urteil.
        maengel.push('„stufen.rueckfrage" darf nicht über „stufen.automatisch" liegen — sonst wird nie nachgefragt.')
      }
      if (!schlecht(automatisch) && !schlecht(rueckfrage)) {
        stufen = { automatisch: automatisch as number, rueckfrage: rueckfrage as number }
      }
    }
  }

  const denkhilfeRoh = objekt['denkhilfe']
  if (denkhilfeRoh !== undefined && typeof denkhilfeRoh !== 'boolean') {
    maengel.push('„denkhilfe" muß wahr oder falsch sein.')
  }

  const denkenRoh = objekt['denken']
  let denken: Denkstufe | undefined
  if (denkenRoh !== undefined) {
    if (typeof denkenRoh === 'string' && (DENKSTUFEN as readonly string[]).includes(denkenRoh)) {
      denken = denkenRoh as Denkstufe
    } else {
      // **Ein unbekanntes Wort wird abgelehnt, nicht auf eine Stufe gerundet.** „sehr hoch" still
      // als „hoch" zu lesen hieße, eine Einstellung zu erfinden, die niemand getroffen hat.
      maengel.push(`„denken" war ${JSON.stringify(denkenRoh)} — erlaubt: ${DENKSTUFEN.join(', ')}.`)
    }
  }

  if (maengel.length > 0) throw new EinstellungenFehler(maengel)

  return {
    fassung: FASSUNG,
    wahl,
    ...(stufen === undefined ? {} : { stufen }),
    ...(denkhilfeRoh === undefined ? {} : { denkhilfe: denkhilfeRoh as boolean }),
    ...(denken === undefined ? {} : { denken }),
  }
}

/**
 * Schreibt die Einstellungen als JSON — **in fester Reihenfolge**.
 *
 * **Warum feste Reihenfolge.** Eine Datei, die ein Mensch liest und ändert, wird verglichen und
 * versioniert. Wäre die Reihenfolge zufällig, sähe jede Änderung wie ein Umbau aus — und niemand
 * fände in einem Vergleich die eine geänderte Zeile.
 *
 * @param einstellungen - die Einstellungen
 * @returns der Text, mit Zeilenumbruch am Ende
 */
export function schreibeEinstellungen(einstellungen: Einstellungen): string {
  const wahl: Record<string, Wahl> = {}
  for (const faehigkeit of FAEHIGKEITEN) {
    const eintrag = einstellungen.wahl[faehigkeit]
    if (eintrag === undefined) continue
    wahl[faehigkeit] = { anbieter: eintrag.anbieter, modell: eintrag.modell }
  }
  const inhalt: Record<string, unknown> = { fassung: FASSUNG, wahl }
  if (einstellungen.stufen !== undefined) {
    inhalt['stufen'] = {
      automatisch: einstellungen.stufen.automatisch,
      rueckfrage: einstellungen.stufen.rueckfrage,
    }
  }
  if (einstellungen.denkhilfe !== undefined) inhalt['denkhilfe'] = einstellungen.denkhilfe
  if (einstellungen.denken !== undefined) inhalt['denken'] = einstellungen.denken
  return `${JSON.stringify(inhalt, null, 2)}\n`
}

/**
 * Setzt die Denkstufe.
 *
 * @param einstellungen - die Einstellungen
 * @param stufe - wie stark gedacht werden darf
 * @returns die neuen Einstellungen
 * @throws EinstellungenFehler - wenn das Wort keine Stufe ist
 */
export function mitDenken(einstellungen: Einstellungen, stufe: Denkstufe): Einstellungen {
  if (!(DENKSTUFEN as readonly string[]).includes(stufe)) {
    throw new EinstellungenFehler([
      `„${String(stufe)}" ist keine Denkstufe. Erlaubt: ${DENKSTUFEN.join(', ')}.`,
    ])
  }
  return { ...einstellungen, denken: stufe }
}

/**
 * Die Wahl für eine Fähigkeit.
 *
 * @param einstellungen - die Einstellungen
 * @param faehigkeit - die Fähigkeit
 * @returns die Wahl oder `undefined`, wenn nichts gewählt ist
 */
export function wahlFuer(einstellungen: Einstellungen, faehigkeit: Faehigkeit): Wahl | undefined {
  return einstellungen.wahl[faehigkeit]
}

/**
 * Setzt die Wahl für eine Fähigkeit — **ohne** die Einstellungen zu verändern.
 *
 * @param einstellungen - die Einstellungen
 * @param faehigkeit - die Fähigkeit
 * @param wahl - was gewählt wird
 * @returns die neuen Einstellungen
 * @throws EinstellungenFehler - wenn Anbieter oder Modell leer sind
 */
export function mitWahl(einstellungen: Einstellungen, faehigkeit: Faehigkeit, wahl: Wahl): Einstellungen {
  if (!istText(wahl.anbieter) || !istText(wahl.modell)) {
    throw new EinstellungenFehler([`Für „${NAME_DER_FAEHIGKEIT[faehigkeit]}" fehlen Anbieter oder Modell.`])
  }
  return {
    ...einstellungen,
    wahl: { ...einstellungen.wahl, [faehigkeit]: { anbieter: wahl.anbieter.trim(), modell: wahl.modell.trim() } },
  }
}

/**
 * Nimmt die Wahl für eine Fähigkeit zurück — **ohne** die Einstellungen zu verändern.
 *
 * @param einstellungen - die Einstellungen
 * @param faehigkeit - die Fähigkeit
 * @returns die neuen Einstellungen
 */
export function ohneWahl(einstellungen: Einstellungen, faehigkeit: Faehigkeit): Einstellungen {
  const wahl = { ...einstellungen.wahl }
  delete wahl[faehigkeit]
  return { ...einstellungen, wahl }
}

/**
 * Setzt die Schwellen.
 *
 * @param einstellungen - die Einstellungen
 * @param stufen - die Schwellen
 * @returns die neuen Einstellungen
 * @throws EinstellungenFehler - wenn sie unbrauchbar sind
 */
export function mitStufen(einstellungen: Einstellungen, stufen: Stufen): Einstellungen {
  const maengel: string[] = []
  for (const [name, wert] of [
    ['automatisch', stufen.automatisch],
    ['rueckfrage', stufen.rueckfrage],
  ] as const) {
    if (!Number.isFinite(wert) || wert < 0 || wert > 1) {
      maengel.push(`Die Stufe „${name}" muß zwischen 0 und 1 liegen, war ${String(wert)}.`)
    }
  }
  if (maengel.length === 0 && stufen.rueckfrage > stufen.automatisch) {
    maengel.push('Die Rückfrage-Stufe darf nicht über der Handlungs-Stufe liegen — sonst wird nie nachgefragt.')
  }
  if (maengel.length > 0) throw new EinstellungenFehler(maengel)
  return { ...einstellungen, stufen }
}

/**
 * Schaltet die Denkhilfe ein oder aus.
 *
 * @param einstellungen - die Einstellungen
 * @param an - ob sie benutzt wird
 * @returns die neuen Einstellungen
 */
export function mitDenkhilfe(einstellungen: Einstellungen, an: boolean): Einstellungen {
  return { ...einstellungen, denkhilfe: an }
}

/**
 * Die Modellkennungen **eines** Anbieters aus den Einstellungen — für den Aufbau des Anbieters.
 *
 * **Warum hier und nicht im Anbieter.** Der Anbieter soll das Format dieser Datei nicht kennen;
 * er bekommt eine Zuordnung `Fähigkeit → Modellkennung`, mehr nicht. Diese Funktion übersetzt in
 * **diese** Richtung und kennt den Anbieter nur als Zeichenkette — sie importiert ihn nicht.
 *
 * @param einstellungen - die Einstellungen
 * @param anbieter - die Kennung des Anbieters (`openrouter`)
 * @returns je Fähigkeit die gewählte Kennung; Fähigkeiten ohne Wahl fehlen
 */
export function modelleFuer(
  einstellungen: Einstellungen,
  anbieter: string,
): Partial<Record<Faehigkeit, string>> {
  const modelle: Partial<Record<Faehigkeit, string>> = {}
  for (const faehigkeit of FAEHIGKEITEN) {
    const wahl = einstellungen.wahl[faehigkeit]
    // **Nur die Wahl für DIESEN Anbieter.** Hat der Nutzer für `einbetten` einen anderen Anbieter
    // gewählt, darf dessen Modellkennung nicht hier landen — der Anbieter würde sonst mit einer
    // fremden Kennung aufgerufen und scheiterte erst beim Dienst.
    if (wahl !== undefined && wahl.anbieter === anbieter) modelle[faehigkeit] = wahl.modell
  }
  return modelle
}

/**
 * Ist die Denkhilfe an?
 *
 * **Der Standard ist `false`** — steht so in {@link Einstellungen.denkhilfe}. Diese Funktion
 * schreibt ihn nicht noch einmal hin, sondern liest ihn an einer Stelle.
 *
 * @param einstellungen - die Einstellungen
 * @returns ob sie benutzt wird
 */
export function denkhilfeAn(einstellungen: Einstellungen): boolean {
  return einstellungen.denkhilfe === true
}
