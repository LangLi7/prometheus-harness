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
   * Die Modellkennungen je Fähigkeit — für die Einstellungen.
   *
   * @param faehigkeit - die gefragte Fähigkeit
   * @returns die Kennungen; leer, wenn er sie nicht kann
   */
  modelle(faehigkeit: Faehigkeit): readonly string[]
  /**
   * Ist er einsatzbereit?
   *
   * @returns die Auskunft samt Grund
   */
  bereit(): Promise<Bereitschaft>
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
   * kosten (Schlüssel vorhanden? Modell geladen?). Eine synchrone Antwort müßte raten.
   *
   * @param faehigkeit - die Fähigkeit
   * @returns der Anbieter
   * @throws KeinAnbieterError - wenn keiner einsatzbereit ist, mit allen Gründen
   */
  async waehle(faehigkeit: Faehigkeit): Promise<Anbieter> {
    const kandidaten = this.fuer(faehigkeit)
    const gruende: string[] = []
    for (const anbieter of kandidaten) {
      const stand = await anbieter.bereit()
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
