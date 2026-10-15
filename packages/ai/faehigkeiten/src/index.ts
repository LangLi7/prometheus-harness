/**
 * `@prometheus-harness/faehigkeiten` — der **Vertrag** für alles, was ein Modell tun kann.
 *
 * ## Die Wörter, und warum sie so heißen
 *
 * | Wort | Bedeutung |
 * |---|---|
 * | **Paket** | die Einheit im Quelltext (`packages/…`) |
 * | **Plugin** | wie der Rechner es lädt (`dsh.client`, `inject`, `apply`) |
 * | **Fähigkeit** | die **Schnittstelle**: *was* kann etwas (`entscheiden`, `text-zu-sprache`, …) |
 * | **Anbieter** | die **Umsetzung** einer Fähigkeit (`openrouter`, `tev-lokal`) |
 *
 * Ein Anbieter **erfüllt** Fähigkeiten. Ein Paket darf mehrere anbieten — wenn sein Dienst sie
 * wirklich kann. Diese Datei enthält **keine Umsetzung** und **keinen Netzzugriff**: sie ist der
 * Vertrag, gegen den gebaut wird, und die Registratur, in der Anbieter erscheinen.
 *
 * ## Warum jede Fähigkeit ihre EIGENE Form hat
 *
 * Ein gemeinsamer Weg „ruf ein Modell" würde die Unterschiede verwischen: ein **Urteil** kommt
 * nach Schema, `text-zu-sprache` kommt als **Bytes**, `einbetten` als **Vektor fester Länge**.
 * Wer alles gleich behandelt, rät am Ende, was zurückkommt. Deshalb: je Fähigkeit eine eigene
 * Eingabe- und Ausgabeform.
 *
 * ## Warum der Schlüssel am ANBIETER hängt und nicht an der Fähigkeit
 *
 * OpenRouter bedient Chat, Text→Sprache, Sprache→Text, Einbetten und Bild über **einen**
 * Schlüssel. Hinge er an der Fähigkeit, müßte der Nutzer denselben Schlüssel fünfmal eintragen.
 * Also: **Schlüssel je Anbieter**, Zuordnung *Fähigkeit → Modellkennung* als Einstellung.
 *
 * ## Kein stiller Rückfall
 *
 * Fehlt der Schlüssel oder ist nichts eingerichtet, **wirft** die Registratur — sie nimmt nicht
 * „irgendeinen" Anbieter. Ein stiller Rückfall auf ein Urteil, das niemand gefällt hat, wäre der
 * schlimmste Fall: er sieht aus wie eine Antwort.
 *
 * @module @prometheus-harness/faehigkeiten
 */

// ---------------------------------------------------------------------------
// Die Fähigkeiten
// ---------------------------------------------------------------------------

/** Was ein Modell tun kann — **die Schnittstelle**, nicht das Modell. */
export type Faehigkeit =
  /** Ein **Urteil** fällen: eine Lage und ein Schema hinein, ein geprüftes Ergebnis heraus. */
  | 'entscheiden'
  /** Text zu Sprache. */
  | 'text-zu-sprache'
  /** Sprache zu Text. */
  | 'sprache-zu-text'
  /** Text zu Vektor. */
  | 'einbetten'
  /** Text zu Bild. */
  | 'bild'
  /** Das Gespräch — der Fall, den der Kern schon kann (`@prometheus-harness/llm`). */
  | 'gespraech'

/** Alle Fähigkeiten in fester Reihenfolge — für Anzeige und Prüfung. */
export const FAEHIGKEITEN: readonly Faehigkeit[] = [
  'gespraech',
  'entscheiden',
  'text-zu-sprache',
  'sprache-zu-text',
  'einbetten',
  'bild',
]

/** Der deutsche Name einer Fähigkeit — für Meldungen, nicht für Kennungen. */
export const NAME_DER_FAEHIGKEIT: Readonly<Record<Faehigkeit, string>> = {
  gespraech: 'Gespräch',
  entscheiden: 'Entscheiden',
  'text-zu-sprache': 'Text zu Sprache',
  'sprache-zu-text': 'Sprache zu Text',
  einbetten: 'Einbetten',
  bild: 'Bild',
}

// ---------------------------------------------------------------------------
// Die Formen je Fähigkeit
// ---------------------------------------------------------------------------

/**
 * **Wer** ein Urteil gefällt hat.
 *
 * ## Warum das am Urteil stehen muß
 *
 * Gemessen am 15.10.2026: eine Anfrage an `typesafe/jev-router` wurde **weitergereicht** — die
 * erste an `openai/gpt-6-luna`, die zweite an `google/gemini-3.8-flash`. Eine Kennung wie
 * `jev-router` ist also **nicht** die Antwort auf „welches Modell hat entschieden": sie ist ein
 * Verteiler.
 *
 * Wer ein Urteil später prüft, muß wissen, wer es gefällt hat. Fehlte diese Auskunft, ließe sich
 * ein auffälliges Urteil nicht nachvollziehen — und ein Modellwechsel bliebe unbemerkt.
 */
export interface Herkunft {
  /** Die Kennung des **Anbieters** (`openrouter`) — nicht die des Modells. */
  readonly anbieter: string
  /** Die Modellkennung, die **tatsächlich** geantwortet hat. */
  readonly modell: string
}

/**
 * Ein **Urteil** — die Antwort eines Entscheidungsmodells.
 *
 * **Warum nicht einfach ein Wert.** Der Wert allein verschweigt, ob das Modell sicher war und
 * warum. Beides ist für einen Aufrufer oft entscheidender als das Urteil selbst — und beides
 * darf fehlen, wenn der Anbieter es nicht liefert. Ein erfundenes „sicher" wäre schlimmer als
 * keines.
 *
 * @typeParam T - die Form des Urteils, wie sie das Schema verlangt
 */
export interface Urteil<T> {
  /** Das Urteil, gegen das Schema geprüft. */
  readonly wert: T
  /** Wie sicher der Anbieter war (0 bis 1) — **nur**, wenn er es gesagt hat. */
  readonly sicherheit?: number
  /** Warum — **nur**, wenn der Anbieter es begründet. */
  readonly begruendung?: string
  /** Wer geantwortet hat — **nur**, wenn der Anbieter es mitteilt. */
  readonly herkunft?: Herkunft
}

/**
 * Ein **Schema** für ein Urteil — absichtlich winzig.
 *
 * **Warum kein JSON-Schema hier.** Der Vertrag soll **prüfbar** sein, ohne eine Bibliothek. Ein
 * Anbieter darf intern JSON-Schema sprechen; hier zählt nur, was der Aufrufer verlangt: genau
 * diese Felder, jeder Wert in dieser Auswahl.
 *
 * @typeParam T - die Form des Ergebnisses
 */
export interface Schema<T> {
  /** Die Felder, die das Urteil tragen muß. */
  readonly felder: { readonly [K in keyof T]: Feld<T[K]> }
}

/** Ein einzelnes Feld eines Schemas. */
export interface Feld<T> {
  /** Erlaubte Werte; fehlt die Auswahl, ist jeder Wert der Art erlaubt. */
  readonly auswahl?: readonly T[]
  /** Die Art — `'text'`, `'zahl'`, `'wahrheitswert'`. */
  readonly art: 'text' | 'zahl' | 'wahrheitswert'
  /** Ob das Feld fehlen darf. */
  readonly freiwillig?: boolean
}

/** Die Eingabe eines Entscheids. */
export interface EntscheidungsEingabe<T> {
  /** Die Frage in Worten — für den Menschen, der sie später liest. */
  readonly frage: string
  /** Die Lage, um die es geht (Freitext oder `jsonb`-fähige Daten). */
  readonly lage: unknown
  /** Wonach entschieden werden soll. */
  readonly schema: Schema<T>
}

/** Ein Anbieter, der **entscheiden** kann. */
export interface Entscheider {
  /**
   * Fällt ein Urteil.
   *
   * @param eingabe - Frage, Lage und Schema
   * @returns das Urteil
   */
  entscheide<T>(eingabe: EntscheidungsEingabe<T>): Promise<Urteil<T>>
}

/** Die Eingabe für Text zu Sprache. */
export interface SprachEingabe {
  readonly text: string
  /** Die Stimme, wenn der Anbieter mehrere kennt. */
  readonly stimme?: string
  /** Die Sprache (`de`, `en`) — **nicht** die Stimme. */
  readonly sprache?: string
}

/** Ein Anbieter, der **sprechen** kann. */
export interface Sprecher {
  /**
   * Wandelt Text in Ton.
   *
   * @param eingabe - der Text und was dazu gehört
   * @returns die Bytes (Audio) und ihr Typ
   */
  sprich(eingabe: SprachEingabe): Promise<{ readonly bytes: Uint8Array; readonly typ: string }>
}

/** Ein Anbieter, der **hören** kann. */
export interface Hoerer {
  /**
   * Wandelt Ton in Text.
   *
   * @param ton - die Bytes
   * @param sprache - die erwartete Sprache, wenn bekannt
   * @returns der Text und was der Anbieter sonst noch weiß
   */
  hoere(ton: Uint8Array, sprache?: string): Promise<{ readonly text: string; readonly sprache?: string }>
}

/** Ein Anbieter, der **einbetten** kann. */
export interface Einbetter {
  /**
   * Wandelt Text in Vektoren.
   *
   * @param texte - die Texte
   * @returns je Text ein Vektor **gleicher Länge**
   */
  betteEin(texte: readonly string[]): Promise<readonly (readonly number[])[]>
}

/** Ein Anbieter, der **zeichnen** kann. */
export interface Zeichner {
  /**
   * Wandelt Text in ein Bild.
   *
   * @param beschreibung - was zu sehen sein soll
   * @returns die Bytes und ihr Typ
   */
  zeichne(beschreibung: string): Promise<{ readonly bytes: Uint8Array; readonly typ: string }>
}

// ---------------------------------------------------------------------------
// Der Anbieter
// ---------------------------------------------------------------------------

/** Ob ein Anbieter einen Schlüssel braucht. */
export type Schluesselbedarf = 'schluessel-noetig' | 'kein-schluessel'

/**
 * Wie einsatzbereit ein Anbieter ist.
 *
 * **Warum das eine Auskunft ist und kein Wahrheitswert.** „Nicht bereit" allein hilft niemandem:
 * der Nutzer soll lesen, **was** fehlt — der Schlüssel, das Modell, die Verbindung.
 */
export type Bereitschaft =
  | { readonly bereit: true }
  | { readonly bereit: false; readonly grund: string }

/**
 * Ein Anbieter — die Umsetzung.
 *
 * **Was hier NICHT steht.** Kein Schlüssel, kein Modellpfad, keine Adresse. Der Anbieter
 * **verwaltet** sie; die Registratur kennt nur seinen Namen und seine Fähigkeiten. Damit ist der
 * Schlüssel nie Teil dessen, was durch die Gegend gereicht wird.
 */
export interface Anbieter {
  /** Die Kennung, stabil und klein geschrieben (`openrouter`). */
  readonly id: string
  /** Der Name für Menschen (`OpenRouter`). */
  readonly name: string
  /** Welche Fähigkeiten er **wirklich** kann. */
  readonly faehigkeiten: readonly Faehigkeit[]
  /** Ob er einen Schlüssel braucht — für die Oberfläche. */
  readonly schluessel: Schluesselbedarf
  /**
   * Die Modellkennungen, die er für eine Fähigkeit **anbietet** — für die Einstellungen.
   *
   * **Was das NICHT ist: das eingestellte Modell.** Hier steht, was **wählbar** ist. Welches
   * gewählt **wurde**, ist eine Einstellung des Endnutzers und wird dem Anbieter beim Aufbau
   * übergeben. Die beiden zu vermischen wäre genau der Fehler, den dieser Vertrag vermeiden soll:
   * dann liefe etwas mit einem Modell, das niemand ausgesucht hat.
   *
   * @param faehigkeit - die gefragte Fähigkeit
   * @returns die Kennungen; leer, wenn er sie nicht kann
   */
  modelle(faehigkeit: Faehigkeit): readonly string[]
  /**
   * Ist er **für diese Fähigkeit** einsatzbereit?
   *
   * **Warum die Fähigkeit ein Pflicht-Parameter ist.** Ein Anbieter kann Schlüssel und Modell für
   * `entscheiden` haben und für `einbetten` keines. Ohne diesen Parameter müßte er „nicht bereit"
   * melden — und die Registratur würde ihn **auch für `entscheiden`** überspringen. Der Aufrufer
   * landete beim Menschen, obwohl ein Anbieter bereitstand. Genau diese Verwechslung wäre still:
   * es käme eine Antwort, nur die falsche.
   *
   * @param faehigkeit - die Fähigkeit, für die gefragt wird
   * @returns die Auskunft samt Grund
   */
  bereit(faehigkeit: Faehigkeit): Promise<Bereitschaft>
  /** Der Entscheider, wenn er `entscheiden` kann. */
  readonly entscheider?: Entscheider
  /** Der Sprecher, wenn er `text-zu-sprache` kann. */
  readonly sprecher?: Sprecher
  /** Der Hörer, wenn er `sprache-zu-text` kann. */
  readonly hoerer?: Hoerer
  /** Der Einbetter, wenn er `einbetten` kann. */
  readonly einbetter?: Einbetter
  /** Der Zeichner, wenn er `bild` kann. */
  readonly zeichner?: Zeichner
}

// ---------------------------------------------------------------------------
// Unsicherheit: handeln, nachfragen, den Menschen fragen
// ---------------------------------------------------------------------------

/**
 * Was mit einem Urteil geschehen soll.
 *
 * **Warum es diese drei gibt und nicht zwei.** Ein Urteil ist keine Erlaubnis. Ein Modell kann
 * einen klaren Fall sehen, einen ungefähren — oder gar keinen. Wer nur „ja" und „nein" kennt,
 * muß den ungefähren Fall als eines von beidem ausgeben und **rät** damit.
 *
 * Die drei Stufen stammen aus der Anleitung von TypeSafe (`docs.typesafe.ai/confidence`,
 * gelesen am 15.10.2026) — dort steht wörtlich:
 *
 * | Sicherheit | Verhalten laut Anleitung |
 * |---|---|
 * | hoch | *„Act automatically."* |
 * | mittel | *„ask the user to confirm, flag for review"* |
 * | niedrig | *„Do not act. Route to a human … The model is telling you it does not have enough information."* |
 */
export type Umgang =
  /** Sicher genug: handeln. */
  | 'handeln'
  /** Unsicher: den Benutzer fragen, bevor gehandelt wird. */
  | 'rueckfrage'
  /** Zu unsicher oder unbekannt: **nicht handeln**, einen Menschen fragen. */
  | 'mensch'

/**
 * Wo die Grenzen liegen — **die Einstellung des Aufrufers**.
 *
 * **Warum die Schwellen nicht dem Modell gehören.** Aus derselben Anleitung:
 * *„A confidence threshold is not one number. Different actions within the same system should be
 * gated at different levels depending on the consequences of getting it wrong."* Und:
 * *„Your code encodes the risk tolerance."* Ein Schreibvorgang und ein Lesevorgang dürfen
 * deshalb **verschiedene** Stufen bekommen — dieselbe Zahl für alles wäre eine Politik, die
 * niemand beschlossen hat.
 */
export interface Stufen {
  /** Ab hier wird ohne Rückfrage gehandelt. */
  readonly automatisch: number
  /** Ab hier wird nachgefragt; darunter geht es zum Menschen. */
  readonly rueckfrage: number
}

/**
 * Die Kennung des menschlichen Anbieters.
 *
 * **Warum als Konstante.** An ihr hängt eine Regel: hat ein **Mensch** entschieden, ist die Sache
 * entschieden — sie darf nicht noch einmal bewertet und womöglich wieder zum Menschen geschickt
 * werden. Diese Kennung an zwei Stellen als Text hinzuschreiben, hieße: irgendwann steht sie an
 * einer Stelle anders, und die Schleife ist wieder da.
 */
export const MENSCH_ID = 'mensch'

/**
 * Entscheidet, wie mit einem Urteil umzugehen ist — **rein**, ohne Netz.
 *
 * **Die wichtigste Regel steht am Anfang: ohne Sicherheit keine Handlung.** Sagt der Anbieter
 * nichts über seine Sicherheit, ist das **kein** Freibrief, sondern Unwissen — und Unwissen
 * führt zum Menschen. Ein fehlendes Feld als „sicher genug" zu lesen, wäre genau der stille
 * Fehler, der später niemandem zuzuordnen ist.
 *
 * Die zweite Regel: **was ein Mensch entschieden hat, ist entschieden.** Sonst ergäbe sich eine
 * Schleife — der Mensch antwortet, die Antwort trägt keine Sicherheit, die Regel schickt sie
 * wieder zum Menschen.
 *
 * @param urteil - das Urteil, mindestens seine Sicherheit
 * @param stufen - die Schwellen des Aufrufers
 * @returns was zu tun ist
 * @throws Error - wenn die Stufen unbrauchbar sind (außerhalb 0…1 oder verkehrt herum)
 */
export function umgangFuer(
  urteil: { readonly sicherheit?: number; readonly herkunft?: Herkunft },
  stufen: Stufen,
): Umgang {
  for (const [name, wert] of [
    ['automatisch', stufen.automatisch],
    ['rueckfrage', stufen.rueckfrage],
  ] as const) {
    if (!Number.isFinite(wert) || wert < 0 || wert > 1) {
      throw new Error(`Die Stufe „${name}" muß zwischen 0 und 1 liegen, war ${String(wert)}.`)
    }
  }
  if (stufen.rueckfrage > stufen.automatisch) {
    // Verkehrt herum ergäbe „nachfragen ab 0,9, handeln ab 0,4" — dann würde ab 0,4 gehandelt
    // und die Rückfrage nie erreicht. Eine Schwelle, die nie greift, ist keine Schwelle.
    throw new Error(
      `Die Rückfrage-Stufe (${String(stufen.rueckfrage)}) darf nicht über der Handlungs-Stufe ` +
        `(${String(stufen.automatisch)}) liegen — sonst wird nie nachgefragt.`,
    )
  }
  if (urteil.herkunft?.anbieter === MENSCH_ID) return 'handeln'
  const sicherheit = urteil.sicherheit
  if (typeof sicherheit !== 'number' || !Number.isFinite(sicherheit) || sicherheit < 0 || sicherheit > 1) {
    return 'mensch'
  }
  if (sicherheit >= stufen.automatisch) return 'handeln'
  if (sicherheit >= stufen.rueckfrage) return 'rueckfrage'
  return 'mensch'
}

/**
 * Die Befragung eines Menschen — die Stelle, an der der Harness anhält und wartet.
 *
 * **Warum sie hereingereicht wird.** Der Vertrag kennt keine Oberfläche. Ob der Mensch im
 * Fenster, im Terminal oder am Telefon antwortet, ist Sache des Hosts; hier zählt nur, daß es
 * jemanden gibt, den man fragen kann — und daß die Frage **warten** kann.
 *
 * @typeParam T - die verlangte Form der Antwort
 * @param auftrag - die Frage, die Lage und das Schema
 * @returns die Antwort des Menschen, in der verlangten Form
 */
export interface Menschenbefragung {
  <T>(auftrag: {
    readonly faehigkeit: Faehigkeit
    readonly frage: string
    readonly lage: unknown
    readonly schema: Schema<T>
  }): Promise<T>
}

/** Was der menschliche Anbieter braucht. */
export interface MenschOptionen {
  /** Wie gefragt wird. */
  readonly frage: Menschenbefragung
  /** Was er entscheiden darf. Vorgabe: nur `entscheiden`. */
  readonly faehigkeiten?: readonly Faehigkeit[]
  /** Wie er in der Oberfläche heißt. Vorgabe: `Der Mensch`. */
  readonly name?: string
}

/**
 * Der **Mensch als Anbieter** — die letzte Instanz.
 *
 * ## Warum er ein Anbieter ist und keine Sonderbehandlung
 *
 * Weil die Registratur dann **nichts** über ihn wissen muß: sie geht ihre Liste von vorn nach
 * hinten durch und nimmt den ersten einsatzbereiten. Steht der Mensch am Ende, kommt er genau
 * dann zum Zug, wenn kein automatischer Anbieter bereit war. Kein Sonderweg, keine Verzweigung,
 * die man vergessen kann.
 *
 * ## Warum er IMMER bereit ist
 *
 * Weil das sein Zweck ist: er ist die Antwort auf „keiner kann es". Wäre er es nicht, gäbe es
 * für den Fall „niemand kann" nur noch einen Fehler.
 *
 * ## Warum er zuletzt eingetragen werden muß
 *
 * Weil der erste bereite gewinnt. Steht er vorn, entscheidet der Mensch über alles — auch über
 * das, was ein Modell in Millisekunden könnte.
 *
 * @param optionen - wie gefragt wird und was er darf
 * @returns der Anbieter
 */
export function menschAlsAnbieter(optionen: MenschOptionen): Anbieter {
  const faehigkeiten = optionen.faehigkeiten ?? ['entscheiden']
  return {
    id: MENSCH_ID,
    name: optionen.name ?? 'Der Mensch',
    faehigkeiten,
    schluessel: 'kein-schluessel',
    /**
     * Ein Mensch bringt **kein** Modell mit.
     *
     * Die leere Liste ist deshalb **keine** Aussage darüber, ob er die Fähigkeit kann — das steht
     * in {@link Anbieter.faehigkeiten}. Hier steht nur: es gibt nichts zu wählen.
     *
     * @returns immer leer
     */
    modelle: () => [],
    /**
     * Immer bereit — **für das, was er kann**. Siehe die Begründung an {@link menschAlsAnbieter}.
     *
     * Für alles andere meldet er „nicht bereit". Ein Mensch, der „Bild erzeugen" als bereit
     * meldete, würde die Registratur dazu bringen, ihn **statt** eines Zeichners zu nehmen.
     *
     * @param faehigkeit - die gefragte Fähigkeit
     * @returns `{bereit: true}` oder der Grund
     */
    async bereit(faehigkeit: Faehigkeit): Promise<Bereitschaft> {
      return faehigkeiten.includes(faehigkeit)
        ? { bereit: true }
        : { bereit: false, grund: `Ein Mensch kann „${NAME_DER_FAEHIGKEIT[faehigkeit]}" hier nicht.` }
    },
    ...(faehigkeiten.includes('entscheiden')
      ? {
          entscheider: {
            async entscheide<T>(eingabe: EntscheidungsEingabe<T>): Promise<Urteil<T>> {
              const wert = await optionen.frage<T>({
                faehigkeit: 'entscheiden',
                frage: eingabe.frage,
                lage: eingabe.lage,
                schema: eingabe.schema,
              })
              // **Keine Sicherheit.** Der Mensch hat keine genannt, und eine zu erfinden — etwa
              // „1, er war sich ja sicher" — wäre eine Behauptung über seinen Kopf hinweg.
              // Deshalb steht nur, wer entschieden hat.
              return { wert, herkunft: { anbieter: MENSCH_ID, modell: MENSCH_ID } }
            },
          },
        }
      : {}),
  }
}


// ---------------------------------------------------------------------------
// Die Registratur
// ---------------------------------------------------------------------------

/** Warum eine Anfrage nicht bedient werden konnte. */
export class KeinAnbieterError extends Error {
  /**
   * @param faehigkeit - die Fähigkeit, für die keiner da war
   * @param gruende - je Anbieter, warum er nicht in Frage kam
   */
  constructor(
    readonly faehigkeit: Faehigkeit,
    readonly gruende: readonly string[],
  ) {
    super(
      `Für „${NAME_DER_FAEHIGKEIT[faehigkeit]}" ist kein Anbieter einsatzbereit.` +
        (gruende.length === 0 ? ' Es ist keiner eingetragen.' : `\n  ${gruende.join('\n  ')}`),
    )
    this.name = 'KeinAnbieterError'
  }
}

/**
 * Die Registratur — **rein**, ohne Netz und ohne Dateisystem.
 *
 * Sie kennt die eingetragenen Anbieter und gibt den **ersten einsatzbereiten** für eine
 * Fähigkeit zurück. Findet sie keinen, **wirft** sie mit Begründungen: nicht „irgendeinen"
 * nehmen, nicht still nichts tun.
 */
export class Faehigkeiten {
  readonly #anbieter = new Map<string, Anbieter>()

  /**
   * Trägt einen Anbieter ein.
   *
   * @param anbieter - der Anbieter
   * @returns der Rücknehmer
   */
  anbieten(anbieter: Anbieter): () => void {
    if (anbieter.id.trim() === '') throw new Error('Ein Anbieter braucht eine Kennung.')
    if (this.#anbieter.has(anbieter.id)) {
      throw new Error(`Den Anbieter „${anbieter.id}" gibt es schon.`)
    }
    if (anbieter.faehigkeiten.length === 0) {
      throw new Error(`Der Anbieter „${anbieter.id}" kann nichts — er nennt keine Fähigkeit.`)
    }
    this.#anbieter.set(anbieter.id, anbieter)
    return () => {
      this.#anbieter.delete(anbieter.id)
    }
  }

  /** Alle eingetragenen Anbieter. */
  alle(): readonly Anbieter[] {
    return [...this.#anbieter.values()]
  }

  /**
   * Die Anbieter, die eine Fähigkeit nennen.
   *
   * @param faehigkeit - die Fähigkeit
   * @returns die Anbieter in Eintragsreihenfolge
   */
  fuer(faehigkeit: Faehigkeit): readonly Anbieter[] {
    return this.alle().filter((anbieter) => anbieter.faehigkeiten.includes(faehigkeit))
  }

  /**
   * Der **erste einsatzbereite** Anbieter für eine Fähigkeit.
   *
   * **Warum `async`.** „Bereit" ist eine Auskunft des Anbieters, und die kann einen Blick
   * kosten (Schlüssel vorhanden? Modell eingestellt?). Eine synchrone Antwort müßte raten.
   *
   * ## Die Reihenfolge ist die Rangfolge — und der Mensch steht zuletzt
   *
   * Gesucht wird von **vorn nach hinten**; der erste einsatzbereite gewinnt. Damit ist die
   * Eintragsreihenfolge die Rangfolge: die günstige, schnelle Entscheidung zuerst, die teure
   * danach.
   *
   * **Der Mensch ist der letzte Anbieter.** Ist keiner bereit, kommt der Mensch zum Zug — er ist
   * immer bereit. Wer ihn zuerst einträgt, bekommt ihn für alles; wer ihn vergißt, bekommt einen
   * Fehler statt einer Rückfrage. Beides ist Absicht: **raten ist keine Option.** Lieber eine
   * Meldung, die sagt „es geht nicht", als ein Urteil, das niemand gefällt hat.
   *
   * @param faehigkeit - die Fähigkeit
   * @returns der Anbieter
   * @throws KeinAnbieterError - wenn keiner einsatzbereit ist, mit allen Gründen
   */
  async waehle(faehigkeit: Faehigkeit): Promise<Anbieter> {
    const kandidaten = this.fuer(faehigkeit)
    const gruende: string[] = []
    for (const anbieter of kandidaten) {
      // **Die Fähigkeit wird mitgegeben.** Ohne sie könnte ein Anbieter nur „im ganzen" bereit
      // sein — und würde für `entscheiden` übersprungen, weil ihm das Modell für `einbetten`
      // fehlt. Der Aufrufer landete beim Menschen, obwohl ein Anbieter bereitstand.
      const stand = await anbieter.bereit(faehigkeit)
      if (stand.bereit) return anbieter
      gruende.push(`${anbieter.name}: ${stand.grund}`)
    }
    throw new KeinAnbieterError(faehigkeit, gruende)
  }

  /**
   * Der einsatzbereite **Entscheider**.
   *
   * **Warum der Umweg über die Registratur und nicht ein Feld.** Wer `entscheiden` braucht, soll
   * nicht wissen müssen, **wer** es tut. Er fragt die Fähigkeit, nicht den Anbieter — und wenn
   * der Anbieter wechselt, ändert sich hier nichts.
   *
   * @returns der Entscheider
   */
  async entscheider(): Promise<Entscheider> {
    const anbieter = await this.waehle('entscheiden')
    if (anbieter.entscheider === undefined) {
      // Ein Anbieter, der die Fähigkeit nennt und sie dann nicht liefert, ist ein Fehler des
      // Anbieters — nicht des Aufrufers. Deshalb laut und mit Namen.
      throw new Error(`Der Anbieter „${anbieter.id}" nennt „entscheiden", liefert aber keinen Entscheider.`)
    }
    return anbieter.entscheider
  }

  /**
   * Der einsatzbereite **Sprecher**.
   *
   * @returns der Sprecher
   */
  async sprecher(): Promise<Sprecher> {
    const anbieter = await this.waehle('text-zu-sprache')
    if (anbieter.sprecher === undefined) {
      throw new Error(`Der Anbieter „${anbieter.id}" nennt „text-zu-sprache", liefert aber keinen Sprecher.`)
    }
    return anbieter.sprecher
  }

  /**
   * Der einsatzbereite **Hörer**.
   *
   * @returns der Hörer
   */
  async hoerer(): Promise<Hoerer> {
    const anbieter = await this.waehle('sprache-zu-text')
    if (anbieter.hoerer === undefined) {
      throw new Error(`Der Anbieter „${anbieter.id}" nennt „sprache-zu-text", liefert aber keinen Hörer.`)
    }
    return anbieter.hoerer
  }
}
