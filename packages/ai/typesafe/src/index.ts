/**
 * Der Anbieter TypeSafe — Jev als Entscheider.
 *
 * ## Warum es diesen Anbieter gibt und nicht OpenRouter genügt
 *
 * `typesafe/jev-router` ist über OpenRouter erreichbar, aber dort spricht es das
 * OpenAI-Chat-Format: man bekommt ein JSON-Objekt, das dem Schema folgt. Was man **nicht**
 * bekommt, ist das, wofür Jev gebaut ist — die **Verteilung** über die Optionen und die daraus
 * berechnete `confidence`.
 *
 * Genau diese Zahl ist der Grund für den zweiten Anbieter. Der Vertrag
 * ({@link Urteil.sicherheit}) hat einen Platz dafür, und bisher füllt ihn niemand: die Pakete
 * `guard` und `directory-curator` **erfragen** die Sicherheit als Schema-Feld
 * (`{ art: 'zahl' }`) — eine Selbstauskunft eines generativen Modells. Jev liefert sie.
 *
 * Der zweite Grund ist der Preis. Über OpenRouter trägt `jev-router` den Preis `-1`
 * („unbekannt", gemessen am 15.10.2026). Hier steht die gemessene Zahl: **$42 pro Milliarde
 * Input-Token, Output kostenlos.**
 *
 * ## Was dieser Anbieter kann — und was ausdrücklich nicht
 *
 * **Kann:** `entscheiden`. Ein Schema-Feld wird eine typisierte Frage; mehrere Felder gehen in
 * **einem** Aufruf, parallel beantwortet, zu einem Preis.
 *
 * **Kann nicht:** freien Text und freie Zahlen. Jev generiert nicht. Ein Feld `art: 'text'`
 * ohne `auswahl` oder `art: 'zahl'` ohne `auswahl` wird **abgelehnt**, bevor ein Aufruf
 * entsteht — nicht still durch ein Ersatzformat ersetzt. Ein Urteil, das aussieht wie eine
 * Antwort, aber keine ist, wäre schlimmer als eine Meldung.
 *
 * ## Die Grenze, die der Aufrufer kennen muß
 *
 * **Der `state` ist untrusted.** Am 15.10.2026 hat Datadog gezeigt, daß eine **umformulierte
 * Policy** im State den Injection-Recall von 82,9 % auf 3,88 % drückt. Wer Jev als Wächter
 * einsetzt, darf das nicht vergessen: der Text, über den geurteilt wird, kann die Regeln
 * umschreiben, nach denen geurteilt wird.
 *
 * @module @prometheus-harness/typesafe
 */

import type {
  Anbieter,
  Bereitschaft,
  Entscheider,
  EntscheidungsEingabe,
  Faehigkeit,
  Feld,
  Schema,
  Urteil,
} from '@prometheus-harness/capabilities'

/** Die gemessene Adresse (Docs, gelesen 28.10.2026). */
export const BASIS = 'https://api.typesafe.ai'

/** Der einzige Weg, den dieser Anbieter geht. */
export const WEG = '/v1/systemone'

/** Wo der Schlüssel herkommt, wenn keine Quelle übergeben wurde. */
export const UMWELT_SCHLUESSEL = 'TYPESAFE_API_KEY'

/**
 * Wo die Modellkennung herkommt, wenn keine Wahl getroffen wurde.
 *
 * **Warum das keine Vorgabe im Quelltext ist.** Im Quelltext stünde eine Entscheidung, die
 * niemand getroffen hat — sie liefe still, und die Rechnung käme später. Eine gesetzte
 * Umgebungsvariable ist dagegen eine Entscheidung des Betreibers, und sie steht sichtbar da.
 */
export const UMWELT_MODELL = 'TYPESAFE_MODELL'

/**
 * Das Modell, das dieser Anbieter vorschlägt — **nicht** das, das er verwendet.
 *
 * Die gepinnte Fassung, nicht `jev-latest`: ein Alias wandert mit jedem Release, und wer
 * Schwellen gegen eine Fassung kalibriert hat, bekäme sonst unbemerkt andere Antworten
 * (Docs: *„An alias moves when a new release ships, so its answers can change without any
 * change to your code."*).
 */
export const VORSCHLAG = 'jev-1.14.0'

/** Wie lange ein Aufruf höchstens dauern darf. */
export const FRIST_MS = 20_000

/** Der Kopf, der die langen Grenzen freischaltet (262k statt 64k/32k). */
export const KOPF_LANG = 'TypeSafe-Danger-Zone-Long-Context'

/**
 * Der Netzzugriff — im Test ersetzbar.
 *
 * Dieselbe Form wie in `openrouter`, damit beide Anbieter gleich geprüft werden können.
 */
export type Abruf = (adresse: string, einstellung: RequestInit) => Promise<Response>

/** Warum ein Aufruf nicht zustande kam oder die Antwort unbrauchbar war. */
export class TypesafeFehler extends Error {
  /**
   * @param meldung - was nicht stimmte
   * @param status - der HTTP-Status, wenn es eine Antwort gab
   */
  constructor(
    meldung: string,
    readonly status?: number,
  ) {
    super(meldung)
    this.name = 'TypesafeFehler'
  }
}

/** Was der Anbieter zum Bauen braucht. */
export interface TypesafeOptionen {
  /**
   * Woher der Schlüssel kommt — eine **Funktion**, kein Wert.
   *
   * Damit steht der Schlüssel nie in dem Objekt, das durch die Gegend gereicht wird.
   */
  readonly schluessel?: () => string | undefined | Promise<string | undefined>
  /** Die Adresse; im Test die einer Attrappe. */
  readonly basis?: string
  /** Die Modellkennung. Fehlt sie, gilt {@link UMWELT_MODELL}. */
  readonly modell?: string
  /** Der Netzzugriff. */
  readonly abruf?: Abruf
  /**
   * Die langen Grenzen (262k) freischalten.
   *
   * Laut Docs **langsamer und ungenauer** als innerhalb der Vorgabe — deshalb aus, bis jemand
   * es ausdrücklich will.
   */
  readonly langKontext?: boolean
  /** Die Frist je Aufruf in Millisekunden. */
  readonly fristMs?: number
}

// ---------------------------------------------------------------------------
// Die Übersetzung: Schema → Fragen
// ---------------------------------------------------------------------------

/**
 * Der Feldname, den dieser Anbieter **selbst** beantwortet.
 *
 * ## Warum es diese Sonderregel gibt
 *
 * `packages/ai/guard` und `packages/ai/directory-curator` verlangen ein Feld `sicherheit`
 * (`art: 'zahl'`) im Schema. Sie **erfragen** die Sicherheit damit beim Modell — weil es bis
 * jetzt keinen Anbieter gab, der sie von sich aus liefert.
 *
 * TypeSafe liefert sie. Ein Feld `sicherheit` zu **fragen** wäre nicht nur überflüssig: Jev
 * könnte es gar nicht (freie Zahl ohne Auswahl), und der Aufruf würde abgelehnt. Der Name ist
 * im Projekt die etablierte Bezeichnung für genau diese Zahl ({@link Urteil.sicherheit},
 * `Stufen`, `umgangFuer`) — deshalb wird er hier **beantwortet statt gefragt**.
 *
 * **Die Grenze der Regel.** Sie greift nur bei exakt diesem Namen, `art: 'zahl'` und **ohne**
 * `auswahl`. Ein Feld `sicherheit` mit Auswahl ist eine gewöhnliche Frage und bleibt eine.
 */
export const SICHERHEITSFELD = 'sicherheit'

/**
 * Ist das ein Feld, das dieser Anbieter selbst beantwortet?
 *
 * @param name - der Feldname
 * @param feld - das Feld
 * @returns ob es aus der `confidence` gefüllt wird
 */
export function istSicherheitsfeld(name: string, feld: Feld<unknown>): boolean {
  return name === SICHERHEITSFELD && feld.art === 'zahl' && feld.auswahl === undefined
}

/** Eine Frage, wie die TypeSafe-API sie entgegennimmt. */
interface Frage {
  readonly type: 'choice' | 'noul'
  readonly instructions: unknown
  readonly criteria?: Record<string, string>
}

/**
 * Ein Schema-Feld, übersetzt — samt dem Weg zurück.
 *
 * **Warum der Rückweg ein Paar Funktionen ist und keine Fallunterscheidung an einer Stelle.**
 * Die Form der Antwort hängt an der Frage: `noul` liefert eine Zahl, `choice` einen Namen und
 * eine Verteilung. Wer beides an einer Stelle auseinandernimmt, schreibt dieselbe
 * Fallunterscheidung zweimal — und die zweite Stelle vergißt man.
 */
interface Abbildung {
  /** Der Feldname — zugleich der Schlüssel der Frage. */
  readonly name: string
  /** Die Frage an das Modell. */
  readonly frage: Frage
  /**
   * Liest den Wert aus der Antwort.
   *
   * @param antwort - die Antwort zu **dieser** Frage
   * @returns der Wert, oder `undefined`, wenn die Antwort unbrauchbar ist
   */
  readonly wert: (antwort: Record<string, unknown>) => unknown
  /**
   * Liest die Sicherheit aus der Antwort.
   *
   * @param antwort - die Antwort zu **dieser** Frage
   * @returns die Sicherheit, oder `undefined`, wenn das Modell keine genannt hat
   */
  readonly sicherheit: (antwort: Record<string, unknown>) => number | undefined
}

/**
 * Baut die Beschreibung einer Auswahl-Option.
 *
 * **Was hier fehlt und fehlen muß.** Der Vertrag kennt je Feld **eine** Beschreibung, nicht je
 * Option. Also trägt jede Option dieselbe Erläuterung plus ihren eigenen Wert — mehr gibt der
 * Vertrag nicht her. Wer die Optionen unterscheiden will, schreibt es in
 * {@link Feld.beschreibung}.
 *
 * @param feld - das Feld
 * @param schluessel - der Optionsname
 * @returns die Beschreibung
 */
function optionsbeschreibung(feld: Feld<unknown>, schluessel: string): string {
  return feld.beschreibung === undefined
    ? `Dieser Wert ist "${schluessel}".`
    : `${feld.beschreibung} Dieser Wert ist "${schluessel}".`
}

/**
 * Baut die Anweisung einer Frage.
 *
 * **Warum bei einem einzelnen Feld die nackte Frage genügt.** Sie ist dann eindeutig — es gibt
 * nur ein Feld, auf das sie sich beziehen kann. Bei mehreren Feldern braucht das Modell den
 * Bezug, sonst beantwortet es die Gesamtfrage mehrfach.
 *
 * @param frage - die Frage des Aufrufers
 * @param name - der Feldname
 * @param feld - das Feld samt Beschreibung
 * @param mehrere - ob es mehr als ein Feld gibt
 * @returns die Anweisung
 */
function anweisung(frage: string, name: string, feld: Feld<unknown>, mehrere: boolean): unknown {
  if (!mehrere && feld.beschreibung === undefined) return frage
  return {
    question: frage,
    field: name,
    ...(feld.beschreibung === undefined ? {} : { meaning: feld.beschreibung }),
  }
}

/**
 * Übersetzt **ein** Feld in eine Frage und ihren Rückweg.
 *
 * ## Die Regel, in einem Satz
 *
 * **Hat das Feld eine Auswahl, wird es eine `choice`; ist es ein Wahrheitswert, ein `noul`;
 * alles andere ist nicht abbildbar.**
 *
 * Daß `art: 'zahl'` mit Auswahl eine `choice` wird, ist Absicht: die Auswahl ist dann eine
 * geschlossene Menge, und ein Name läßt sich auf den ursprünglichen Wert zurückführen. Ohne
 * Auswahl ginge das nicht — Jev rechnet nicht und gibt keine freie Zahl aus.
 *
 * @param name - der Feldname
 * @param feld - das Feld
 * @param frage - die Frage des Aufrufers
 * @param mehrere - ob es mehr als ein Feld gibt
 * @returns die Abbildung
 * @throws TypesafeFehler - wenn das Feld nicht abbildbar ist
 */
function uebersetzeFeld(
  name: string,
  feld: Feld<unknown>,
  frage: string,
  mehrere: boolean,
): Abbildung {
  const anweisungstext = anweisung(frage, name, feld, mehrere)

  // --- 1. Eine Auswahl ist immer eine Choice ---------------------------------
  if (feld.auswahl !== undefined) {
    if (feld.auswahl.length < 2) {
      // Eine „Auswahl" mit einem Wert ist keine Frage, sondern eine Behauptung. Sie als Choice
      // zu senden, hieße das Modell nach etwas fragen, das nur eine Antwort hat.
      throw new TypesafeFehler(
        `Das Feld „${name}" hat eine Auswahl mit ${String(feld.auswahl.length)} Wert(en). ` +
          'Eine Auswahl braucht mindestens zwei — sonst gibt es nichts zu entscheiden.',
      )
    }
    if (feld.auswahl.length > 255) {
      // Die Grenze der API: `ChoiceQuestion.criteria` hat `maxProperties: 255`.
      throw new TypesafeFehler(
        `Das Feld „${name}" hat ${String(feld.auswahl.length)} Auswahlwerte; die API erlaubt ` +
          'höchstens 255 je Frage.',
      )
    }

    // Der Weg zurück: Optionsname → ursprünglicher Wert. `String(...)` ist der Schlüssel,
    // weil die API die Optionen als Objekteigenschaften trägt.
    const zurueck = new Map<string, unknown>()
    const criteria: Record<string, string> = {}
    for (const wert of feld.auswahl) {
      const schluessel = String(wert)
      if (zurueck.has(schluessel)) {
        // Zwei verschiedene Werte mit demselben Namen wären nicht mehr auseinanderzuhalten —
        // etwa `1` und `"1"`. Das still zu übergehen hieße: das Urteil landet beim falschen Wert.
        throw new TypesafeFehler(
          `Das Feld „${name}" hat zwei Auswahlwerte mit demselben Namen „${schluessel}". ` +
            'Sie lassen sich in der Antwort nicht unterscheiden.',
        )
      }
      zurueck.set(schluessel, wert)
      criteria[schluessel] = optionsbeschreibung(feld, schluessel)
    }

    return {
      name,
      frage: { type: 'choice', instructions: anweisungstext, criteria },
      wert: (antwort) => {
        const gewaehlt = antwort['choice']
        if (typeof gewaehlt !== 'string') return undefined
        return zurueck.get(gewaehlt)
      },
      sicherheit: (antwort) => zahlZwischenNullUndEins(antwort['confidence']),
    }
  }

  // --- 2. Ein Wahrheitswert ist ein Noul -------------------------------------
  if (feld.art === 'wahrheitswert') {
    return {
      name,
      frage: { type: 'noul', instructions: anweisungstext },
      wert: (antwort) => {
        const p = antwort['noul']
        if (typeof p !== 'number' || !Number.isFinite(p)) return undefined
        return p >= 0.5
      },
      // **Ein Noul trägt keine eigene `confidence`.** Die Wahrscheinlichkeit IST die
      // Unsicherheit; der Abstand zur Mitte ist der passende Ausdruck dafür, und die Docs
      // nennen genau diese Formel: `confidence = |2p − 1|`.
      sicherheit: (antwort) => {
        const p = antwort['noul']
        if (typeof p !== 'number' || !Number.isFinite(p)) return undefined
        return Math.abs(2 * p - 1)
      },
    }
  }

  // --- 3. Alles andere kann Jev nicht ----------------------------------------
  throw new TypesafeFehler(
    `Das Feld „${name}" ist vom Typ „${feld.art}" ohne Auswahl — das kann TypeSafe nicht. ` +
      'Jev gibt weder freien Text noch freie Zahlen aus: es wählt aus Optionen und stuft auf ' +
      'einer Skala. Entweder bekommt das Feld eine `auswahl`, oder es gehört zu einem ' +
      'generativen Modell.',
  )
}

/**
 * Prüft eine Zahl auf „zwischen 0 und 1".
 *
 * @param wert - der geprüfte Wert
 * @returns die Zahl, oder `undefined`
 */
function zahlZwischenNullUndEins(wert: unknown): number | undefined {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) return undefined
  if (wert < 0 || wert > 1) return undefined
  return wert
}

/**
 * Das Ergebnis der Übersetzung.
 *
 * **Warum getrennt und nicht in einer Liste.** Fragen kosten Token und gehen an das Modell;
 * ein Sicherheitsfeld geht **nicht** hinaus — es wird aus der Antwort gefüllt. Beides in eine
 * Liste zu legen hieße, an jeder Stelle wieder zu unterscheiden, was davon eine Frage ist.
 */
export interface Uebersetzung {
  /** Die Fragen, die wirklich gestellt werden. */
  readonly abbildungen: readonly Abbildung[]
  /** Die Felder, die aus der `confidence` gefüllt werden — sie werden **nicht** gefragt. */
  readonly sicherheitsfelder: readonly string[]
}

/**
 * Übersetzt ein ganzes Schema in Fragen.
 *
 * @param schema - das Schema
 * @param frage - die Frage des Aufrufers
 * @returns die Fragen und die selbst beantworteten Felder
 * @throws TypesafeFehler - wenn ein Feld nicht abbildbar ist
 */
export function uebersetze(schema: Schema<unknown>, frage: string): Uebersetzung {
  const felder = schema.felder as Readonly<Record<string, Feld<unknown>>>
  const namen = Object.keys(felder)
  if (namen.length === 0) {
    // Dieselbe Regel wie in `openrouter`: ein Schema ohne Felder ist eine Anfrage ohne Frage.
    throw new TypesafeFehler('Ein Schema ohne Felder ist kein Schema — es gibt nichts zu entscheiden.')
  }

  const sicherheitsfelder: string[] = []
  const zuFragen: Array<{ readonly name: string; readonly feld: Feld<unknown> }> = []
  for (const name of namen) {
    const feld = felder[name]
    if (feld === undefined) continue
    if (istSicherheitsfeld(name, feld)) {
      sicherheitsfelder.push(name)
      continue
    }
    zuFragen.push({ name, feld })
  }

  if (zuFragen.length === 0) {
    throw new TypesafeFehler(
      'Das Schema enthält nur ein Sicherheitsfeld — es gibt nichts zu entscheiden. ' +
        'Die Sicherheit wird aus der Antwort eines Urteils gefüllt, nicht erfragt.',
    )
  }

  // **Erst jetzt zählt, ob es „mehrere" gibt.** Ein Sicherheitsfeld ist keine Frage; es darf die
  // Anweisungen der echten Fragen nicht mit einem Feldbezug belasten, den es nicht braucht.
  const mehrere = zuFragen.length > 1
  return {
    abbildungen: zuFragen.map(({ name, feld }) => uebersetzeFeld(name, feld, frage, mehrere)),
    sicherheitsfelder,
  }
}

// ---------------------------------------------------------------------------
// Die Lage
// ---------------------------------------------------------------------------

/**
 * Bringt die Lage in eine Form, die die API annimmt.
 *
 * Die API nimmt `string`, Objekt oder Array. Alles andere — eine Zahl, ein Wahrheitswert,
 * `null` — wird zu Text: es gibt keinen Grund, dafür einen Fehler zu werfen, denn die Frage
 * bleibt dieselbe.
 *
 * @param lage - die Lage
 * @returns die Form für `state`
 */
export function alsState(lage: unknown): string | Record<string, unknown> | unknown[] {
  if (typeof lage === 'string') return lage
  if (Array.isArray(lage)) return lage
  if (lage !== null && typeof lage === 'object') return lage as Record<string, unknown>
  return String(lage)
}

// ---------------------------------------------------------------------------
// Der Anbieter
// ---------------------------------------------------------------------------

/**
 * Baut den Anbieter.
 *
 * @param optionen - Schlüsselquelle, Adresse, Modell und Netzzugriff
 * @returns der Anbieter
 */
export function typesafe(optionen: TypesafeOptionen = {}): Anbieter {
  const abruf: Abruf = optionen.abruf ?? ((adresse, einstellung) => fetch(adresse, einstellung))
  const basis = (optionen.basis ?? BASIS).replace(/\/+$/, '')
  const fristMs = optionen.fristMs ?? FRIST_MS
  const langKontext = optionen.langKontext === true

  /** Die Quelle des Schlüssels — die Umgebungsvariable, wenn keine übergeben wurde. */
  const holeSchluessel = async (): Promise<string | undefined> => {
    const quelle = optionen.schluessel ?? (() => process.env[UMWELT_SCHLUESSEL])
    const wert = await quelle()
    return typeof wert === 'string' && wert.trim() !== '' ? wert.trim() : undefined
  }

  /** Die Modellkennung — die übergebene, sonst die aus der Umgebung. */
  const holeModell = (): string | undefined => {
    if (optionen.modell !== undefined && optionen.modell.trim() !== '') return optionen.modell.trim()
    const ausUmgebung = process.env[UMWELT_MODELL]
    return typeof ausUmgebung === 'string' && ausUmgebung.trim() !== '' ? ausUmgebung.trim() : undefined
  }

  const entscheider: Entscheider = {
    // Die Eingabeform wird **ausgeschrieben**: bei einer generischen Methode in einem
    // Objekt-Literal leitet TypeScript den Parameter nicht zuverlässig aus dem Vertrag ab.
    async entscheide<T>(eingabe: EntscheidungsEingabe<T>): Promise<Urteil<T>> {
      const schluessel = await holeSchluessel()
      if (schluessel === undefined) {
        throw new TypesafeFehler(
          `Es ist kein Schlüssel hinterlegt. Für TypeSafe kommt er aus $${UMWELT_SCHLUESSEL} ` +
            'oder aus der übergebenen Quelle.',
        )
      }
      const modell = holeModell()
      if (modell === undefined) {
        throw new TypesafeFehler(
          'Es ist kein Modell eingestellt. Für TypeSafe gehört eine gepinnte Fassung hierher ' +
            `(Vorschlag: ${VORSCHLAG}) — über $${UMWELT_MODELL} oder als Wahl des Endnutzers.`,
        )
      }

      // **Die Übersetzung steht VOR dem Aufruf.** Ein Feld, das Jev nicht kann, kostet so
      // nichts — und der Aufrufer liest, welches Feld es war.
      const { abbildungen, sicherheitsfelder } = uebersetze(
        eingabe.schema as Schema<unknown>,
        eingabe.frage,
      )

      const koerper: Record<string, unknown> = {
        model: modell,
        state: alsState(eingabe.lage),
        questions: Object.fromEntries(abbildungen.map((a) => [a.name, a.frage])),
      }

      const kopf: Record<string, string> = { 'content-type': 'application/json' }
      if (langKontext) kopf[KOPF_LANG] = 'true'

      let antwort: Response
      try {
        antwort = await abruf(`${basis}${WEG}`, {
          method: 'POST',
          headers: { ...kopf, authorization: `Bearer ${schluessel}` },
          body: JSON.stringify(koerper),
          signal: AbortSignal.timeout(fristMs),
        })
      } catch (fehler) {
        // Der Schlüssel darf in keiner Meldung stehen — die Adresse auch nicht mit Anhang.
        throw new TypesafeFehler(
          `TypeSafe war nicht erreichbar: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
        )
      }

      if (!antwort.ok) {
        const text = await antwort.text().catch(() => '')
        throw new TypesafeFehler(
          `TypeSafe antwortete mit HTTP ${String(antwort.status)}` +
            (text === '' ? '.' : `: ${text.slice(0, 300)}`),
          antwort.status,
        )
      }

      let roh: unknown
      try {
        roh = await antwort.json()
      } catch {
        throw new TypesafeFehler('Die Antwort war kein JSON.')
      }
      if (roh === null || typeof roh !== 'object' || Array.isArray(roh)) {
        throw new TypesafeFehler('Die Antwort war kein Objekt.')
      }
      const gelesen = roh as Record<string, unknown>

      const antworten = gelesen['answers']
      if (antworten === null || typeof antworten !== 'object' || Array.isArray(antworten)) {
        throw new TypesafeFehler('Die Antwort enthielt keine `answers`.')
      }

      // --- Die Werte lesen, Mängel sammeln -----------------------------------
      const wert: Record<string, unknown> = {}
      const sicherheiten: number[] = []
      const maengel: string[] = []
      const felder = (eingabe.schema as Schema<unknown>).felder as Readonly<Record<string, Feld<unknown>>>

      for (const abbildung of abbildungen) {
        const eine = (antworten as Record<string, unknown>)[abbildung.name]
        if (eine === null || typeof eine !== 'object' || Array.isArray(eine)) {
          const freiwillig = felder[abbildung.name]?.freiwillig === true
          if (!freiwillig) maengel.push(`Für „${abbildung.name}" fehlt die Antwort.`)
          continue
        }
        const objekt = eine as Record<string, unknown>
        const gelesenWert = abbildung.wert(objekt)
        if (gelesenWert === undefined) {
          const freiwillig = felder[abbildung.name]?.freiwillig === true
          if (!freiwillig) {
            maengel.push(
              `„${abbildung.name}" ließ sich nicht lesen — die Antwort trug nicht die erwartete ` +
                `Form für „${abbildung.frage.type}".`,
            )
          }
          continue
        }
        wert[abbildung.name] = gelesenWert
        const sicherheit = abbildung.sicherheit(objekt)
        if (sicherheit !== undefined) sicherheiten.push(sicherheit)
      }

      // **Die schwächste Teilantwort bestimmt das Ganze.** Ein Urteil über fünf Felder ist nur
      // so sicher wie sein unsicherstes Feld; den Durchschnitt zu nehmen hieße, eine sichere
      // Antwort über eine unsichere zu mitteln und damit Sicherheit zu erfinden.
      const sicherheit = sicherheiten.length === 0 ? undefined : Math.min(...sicherheiten)

      // **Die selbst beantworteten Felder.** `sicherheit` wird nicht gefragt, sondern gefüllt.
      // Fehlt sie, ist das ein Mangel — aber nur, wenn das Schema sie verlangt.
      for (const name of sicherheitsfelder) {
        if (sicherheit !== undefined) {
          wert[name] = sicherheit
          continue
        }
        if (felder[name]?.freiwillig !== true) {
          maengel.push(`Für „${name}" hat der Anbieter keine Sicherheit genannt.`)
        }
      }

      if (maengel.length > 0) {
        throw new TypesafeFehler(`Die Antwort folgt nicht dem Schema:\n  ${maengel.join('\n  ')}`)
      }

      const geantwortetVon = gelesen['model']

      return {
        wert: wert as T,
        ...(sicherheit === undefined ? {} : { sicherheit }),
        ...(typeof geantwortetVon === 'string' && geantwortetVon.trim() !== ''
          ? { herkunft: { anbieter: 'typesafe', modell: geantwortetVon.trim() } }
          : {}),
      }
    },
  }

  return {
    id: 'typesafe',
    name: 'TypeSafe',
    faehigkeiten: ['entscheiden'],
    schluessel: 'schluessel-noetig',
    /**
     * Die wählbaren Modelle.
     *
     * Leer, solange keines eingestellt ist — und das ist die Auskunft, die die Oberfläche
     * braucht: „es gibt hier noch nichts zu wählen" statt einer erfundenen Liste.
     *
     * @param faehigkeit - die gefragte Fähigkeit
     * @returns die Kennungen
     */
    modelle(faehigkeit: Faehigkeit): readonly string[] {
      if (faehigkeit !== 'entscheiden') return []
      const modell = holeModell()
      return modell === undefined ? [] : [modell]
    },
    /**
     * Ob er einsatzbereit ist — und wenn nicht, **was** fehlt.
     *
     * Beide Gründe werden gesammelt: fehlen Schlüssel und Modell zugleich, soll der Nutzer
     * nicht erst den einen, dann den anderen Mangel behoben bekommen.
     *
     * @param faehigkeit - die gefragte Fähigkeit
     * @returns die Auskunft samt Grund
     */
    async bereit(faehigkeit: Faehigkeit): Promise<Bereitschaft> {
      if (faehigkeit !== 'entscheiden') {
        return { bereit: false, grund: 'TypeSafe kann nur „entscheiden".' }
      }
      const gruende: string[] = []
      if ((await holeSchluessel()) === undefined) {
        gruende.push(`Es ist kein Schlüssel hinterlegt ($${UMWELT_SCHLUESSEL}).`)
      }
      if (holeModell() === undefined) {
        gruende.push(`Es ist kein Modell eingestellt ($${UMWELT_MODELL}, Vorschlag: ${VORSCHLAG}).`)
      }
      if (gruende.length > 0) return { bereit: false, grund: gruende.join(' ') }
      return { bereit: true }
    },
    entscheider,
  }
}
