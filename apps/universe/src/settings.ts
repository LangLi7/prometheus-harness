/**
 * Einstellungen — der Kern.
 *
 * **Was der Betreiber dazu gesagt hat:** „die könnte man in settings implementieren fuer
 * stuerung" — gemeint war die Steuerung (Drehgeschwindigkeit, Zoom, Achsen). Und dann:
 * „sprache nicht vergessen". Beides sind Einstellungen, und beide gehoeren **hierher**, nicht in
 * eine Konstante im Code.
 *
 * **Warum das ein eigener Kern ist und kein Plugin.** Weil die Einstellungen **von** Plugins
 * gefuellt werden. Ein Plugin, das eine Groesse hat, die man einstellen kann, **beschreibt** sie
 * hier (`contributes.settings`) — so wie eine VS-Code-Extension ihre `configuration` beisteuert.
 * Der Kern kennt keine einzige Einstellung; er kennt nur das **Verfahren**:
 *
 *     beschreiben (Schema)  →  Wert holen (`get`)  →  Wert setzen (`set`)  →  speichern
 *
 * **Beschreibung und Anzeige sind getrennt.** Das Schema traegt **Technik** (Typ, Grenzen,
 * Vorgabe, Schrittweite), das Sprachpaket traegt **Text** (`setting.<key>.label`,
 * `setting.<key>.description`). Deshalb steht in dieser Datei kein deutscher Satz — und eine
 * zweite Sprache braucht keine zweite Einstellung.
 *
 * **Gepruefte Werte, nicht vertraute Werte.** Jeder Wert geht durch `coerce`. Eine Zahl aus dem
 * Speicher, die keine Zahl ist, oder eine Zahl ausserhalb der Grenzen, wird auf die Vorgabe bzw.
 * auf die Grenze gezogen. Der Grund ist derselbe wie ueberall in diesem Prototyp: ein
 * beschädigter Speicher darf den Start **nie** verhindern und keine unmoegliche Ansicht
 * erzeugen (z. B. Drehgeschwindigkeit 0, aus der man nicht mehr herausfindet).
 */
import { storageKey } from './room'

/**
 * Die Einheiten, in denen ein Wert angezeigt wird.
 *
 * **Warum eine Zahl keine Zahl bleibt.** „0.00175 rad/px" sagt niemandem etwas. Der Betreiber hat
 * sich beschwert, dass sich Drehen „zu fast" anfuehlt — also muss die Anzeige das zeigen, was man
 * **fuehlt**: wie weit sich die Welt dreht, wenn man ueber den Bildschirm zieht. Die Einheit rechnet
 * um, das Schema speichert weiter den technischen Wert.
 *
 * ── Ein Widerspruch, der beim Nachrechnen aufgefallen ist ───────────────────────────────
 *
 * In einem frueheren Schritt stand in `camera.ts`, `0.00175 rad/px` seien „57 Pixel je Grad", und
 * `0.0042` seien „24 Pixel je Grad". **Beides ist falsch gerechnet.** Richtig ist:
 *
 *   px/°  =  (π/180) / (rad/px)   →  0.00175 → 9.97 px/°   (nicht 57)
 *                                     0.0042  → 4.15 px/°   (nicht 24)
 *
 * Die Verwechslung war, „Grad je Pixel" zu rechnen und „Pixel je Grad" zu nennen. Der **Faktor 2,4**
 * zwischen alt und neu stimmt; die genannten Zahlen waren um 5,7 zu gross.
 *
 * **Was daraus folgt.** „Pixel je Grad" ist hier ohnehin die schlechtere Anzeige: der Wert haengt an
 * der Fensterbreite, und 10 px/° liest sich wie „sehr feinfuehlig", obwohl ein Zug quer ueber den
 * Bildschirm um 128° dreht. `degreesPerWidth` nennt deshalb das, was man wirklich tut — **ueber den
 * Bildschirm ziehen** —, und diese Zahl ist von der Aufloesung unabhaengig.
 */
export type Unit =
  | 'radPerPx'
  | 'anglePerWidth'
  | 'factorPerNotch'
  | 'seconds'
  | 'degrees'
  | 'percent'
  | 'plain'

export interface NumberField {
  readonly kind: 'number'
  readonly key: string
  /** Anzeigegruppe, z. B. `control`. Wird uebersetzt ueber `category.<id>`. */
  readonly category: string
  readonly default: number
  readonly min: number
  readonly max: number
  /** Schrittweite fuer das Eingabefeld — nicht die Grenze. */
  readonly step: number
  readonly unit: Unit
  /**
   * Groesser ist **mehr** von dem, was der Nutzer will.
   *
   * **Warum das im Schema steht:** `rotateSpeed` ist „rad je Pixel" — ein **groesserer** Wert
   * dreht **schneller**, ist also *weniger* praezise. Ohne dieses Vorzeichen wuesste die Anzeige
   * nicht, ob ein groesserer Wert „mehr" oder „weniger" bedeutet, und ein Regler muesste invertiert
   * gezeichnet werden. Genau daran sind schon Bedienoberflaechen gescheitert.
   */
  readonly invert?: boolean
  /** Suchbegriffe, die zusaetzlich zu Label und Schluessel treffen. */
  readonly keywords?: readonly string[]
  /** Siehe `BooleanField.internal`. */
  readonly internal?: boolean
  /** Siehe {@link Migrate}. */
  readonly migrate?: Migrate
}

export interface BooleanField {
  readonly kind: 'boolean'
  readonly key: string
  readonly category: string
  readonly default: boolean
  readonly keywords?: readonly string[]
  readonly internal?: boolean
  /** Siehe {@link Migrate}. */
  readonly migrate?: Migrate
}

export interface ChoiceField {
  readonly kind: 'choice'
  readonly key: string
  readonly category: string
  readonly default: string
  /**
   * Die moeglichen Werte. `options` ist eine **Funktion**, keine Liste: die Sprachen stehen erst
   * fest, wenn die Sprachpakete eingetragen sind. Eine feste Liste waere beim Start leer.
   *
   * **`labelKey` ist der bessere Weg, `label` der Rueckfall.** Ein Wert, der aus einem
   * Sprachschluessel kommt, wechselt mit der Sprache; ein fest geschriebener nicht. `label` bleibt
   * fuer das, was **keine** Uebersetzung braucht (Eigennamen wie `CAD`).
   */
  readonly options: () => readonly {
    readonly value: string
    readonly label: string
    readonly labelKey?: string
  }[]
  readonly keywords?: readonly string[]
  readonly internal?: boolean
  /** Siehe {@link Migrate}. */
  readonly migrate?: Migrate
}

/**
 * **Wie ein ALTER Wert in einen neuen übersetzt wird.**
 *
 * **Warum jedes Feld das können muss.** Ein Feld kann seine **Art** wechseln: aus einem Schalter
 * („Himmelskörper an/aus", `boolean`) wird eine Auswahlliste („leer / nur Sterne / alles", `choice`).
 * Der gespeicherte Wert steht dann als `true` im Speicher — und `coerce` wirft ihn weg, weil er kein
 * erlaubter Wert der Liste ist. Ergebnis: die Einstellung des Nutzers ist **stillschweigend weg**,
 * und er hält das für einen Fehler (zu Recht — er hat sie gestern gesetzt).
 *
 * Die Übersetzung steht deshalb **am Feld**, nicht im Speicher und nicht im Aufrufer: sie gehört zu
 * der Entscheidung „dieses Feld sieht jetzt anders aus", und das ist dieselbe Stelle, an der die
 * neue Form steht.
 *
 * @param alt - der gespeicherte Wert, bevor er geprüft wurde
 * @returns der neue Wert — oder `undefined`, wenn die Übersetzung nicht zuständig ist
 */
export type Migrate = (alt: unknown) => FieldValue | undefined

export type Field = NumberField | BooleanField | ChoiceField
export type FieldValue = number | boolean | string

export const CATEGORIES: readonly string[] = ['control', 'universe', 'interface', 'language', 'plugins']

const STORAGE_NAME = 'settings.v1'

/**
 * Die Verwaltung.
 *
 * Sie haelt **Schema und Werte** zusammen. Wer einen Wert braucht (`control.rotateSpeed`), fragt
 * hier — nicht eine Konstante in `camera.ts`. Damit ist „Drehen ist mir zu schnell" keine
 * Code-Aenderung mehr, sondern eine Einstellung.
 */
export class Settings {
  private readonly fields = new Map<string, Field>()
  private values: Record<string, FieldValue> = {}
  private readonly listeners = new Set<(key: string) => void>()
  private readonly room: string

  constructor(room: string) {
    this.room = room
    this.load()
  }

  onChange(listener: (key: string) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Traegt eine Beschreibung ein.
   *
   * Wird eine Kennung zweimal beschrieben, **gewinnt die spaetere**. Das ist Absicht: ein Nutzer
   * kann die Grenzen einer Einstellung verschaerfen, ohne den Kern zu beruehren — dieselbe Regel
   * wie bei den Sprachpaketen.
   */
  describe(field: Field): void {
    this.fields.set(field.key, field)
    // Ein bereits gespeicherter Wert wird gegen die **neue** Beschreibung geprueft: aendert sich
    // die Grenze, zieht der Wert nach. Sonst liefe er aus dem erlaubten Bereich heraus.
    this.values[field.key] = this.coerce(field, this.values[field.key])
    this.emit(field.key)
  }

  has(key: string): boolean {
    return this.fields.has(key)
  }

  /** Alle Beschreibungen, nach Gruppe und Kennung sortiert — so steht die Liste ruhig. */
  all(): readonly Field[] {
    return [...this.fields.values()].sort((a, b) => {
      const cat = CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category)
      return cat !== 0 ? cat : a.key.localeCompare(b.key)
    })
  }

  inCategory(category: string): readonly Field[] {
    return this.all().filter((f) => f.category === category)
  }

  field(key: string): Field | undefined {
    return this.fields.get(key)
  }

  /**
   * Der Wert zu einer Kennung.
   *
   * Ist die Kennung **unbekannt**, wird `fallback` zurueckgegeben statt zu werfen: die Huelle darf
   * nicht davon abhaengen, dass ein Plugin geladen ist. (Ein abgeschaltetes Plugin nimmt seine
   * Beschreibung mit — die Oberflaeche soll trotzdem starten.)
   */
  get<T extends FieldValue>(key: string, fallback: T): T {
    const field = this.fields.get(key)
    if (!field) return fallback
    return this.coerce(field, this.values[key]) as T
  }

  getNumber(key: string, fallback: number): number {
    return this.get(key, fallback)
  }

  getBoolean(key: string, fallback: boolean): boolean {
    return this.get(key, fallback)
  }

  getString(key: string, fallback: string): string {
    return this.get(key, fallback)
  }

  /**
   * Setzt einen Wert.
   *
   * Der Wert wird **zuerst** geprueft und **dann** gespeichert — nicht umgekehrt. Sonst laege
   * ein unsinniger Wert im Speicher, auch wenn die Anzeige ihn kaschiert.
   */
  set(key: string, value: FieldValue): boolean {
    const field = this.fields.get(key)
    if (!field) return false
    const geprueft = this.coerce(field, value)
    if (this.values[key] === geprueft) return true
    this.values[key] = geprueft
    this.save()
    this.emit(key)
    return true
  }

  /** Setzt eine Einstellung auf ihre Vorgabe zurueck. */
  reset(key: string): boolean {
    const field = this.fields.get(key)
    if (!field) return false
    this.values[key] = field.default
    this.save()
    this.emit(key)
    return true
  }

  /** Setzt **alle** Einstellungen zurueck. */
  resetAll(): void {
    this.values = {}
    for (const field of this.fields.values()) this.values[field.key] = field.default
    this.save()
    this.emit('*')
  }

  /** Was vom Standard abweicht — fuer die Anzeige „geaendert" und fuer `settings list`. */
  changed(): readonly { readonly key: string; readonly value: FieldValue; readonly default: FieldValue }[] {
    const out: { key: string; value: FieldValue; default: FieldValue }[] = []
    for (const field of this.all()) {
      const value = this.get(field.key, field.default)
      if (value !== field.default) out.push({ key: field.key, value, default: field.default })
    }
    return out
  }

  /**
   * Zieht jeden Wert in den erlaubten Bereich.
   *
   * **Der wichtigste Fall ist der langweiligste:** der Wert fehlt. Dann gilt die Vorgabe. Der
   * zweitwichtigste: der Wert ist vom falschen Typ (`"2"` statt `2`) — auch dann die Vorgabe,
   * nicht eine stillschweigende Umwandlung, die aus `"abc"` eine `NaN` macht.
   */
  private coerce(field: Field, value: unknown): FieldValue {
    if (value === undefined || value === null) return field.default
    /*
     * **Und die Wanderung — VOR der Prüfung.**
     *
     * Sie steht hier und nicht im Aufrufer: ein Wert, der aus einer **früheren Fassung** stammt, ist
     * kein Fehler des Nutzers, sondern eine Tatsache des Speichers. Wer ihn erst nach der Prüfung
     * ansieht, hat ihn schon durch die Vorgabe ersetzt — und dann ist die Einstellung weg.
     */
    if (field.migrate) {
      const gewandelt = field.migrate(value)
      if (gewandelt !== undefined) value = gewandelt
    }
    switch (field.kind) {
      case 'boolean':
        return typeof value === 'boolean' ? value : field.default
      case 'number': {
        const zahl = typeof value === 'number' ? value : Number.NaN
        if (!Number.isFinite(zahl)) return field.default
        return Math.min(field.max, Math.max(field.min, zahl))
      }
      case 'choice': {
        const text = typeof value === 'string' ? value : ''
        const erlaubt = field.options().map((o) => o.value)
        return erlaubt.includes(text) ? text : field.default
      }
    }
  }

  private load(): void {
    try {
      const raw = globalThis.localStorage?.getItem(storageKey(this.room, STORAGE_NAME))
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return
      const out: Record<string, FieldValue> = {}
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
          out[key] = value
        }
      }
      this.values = out
    } catch {
      // Beschaedigter oder gesperrter Speicher: die Vorgaben gelten. Kein Grund zu scheitern.
    }
  }

  private save(): void {
    try {
      globalThis.localStorage?.setItem(storageKey(this.room, STORAGE_NAME), JSON.stringify(this.values))
    } catch {
      // Voller Speicher oder Privatmodus: die Sitzung laeuft weiter, nur ohne Gedaechtnis.
    }
  }

  private emit(key: string): void {
    for (const listener of this.listeners) listener(key)
  }
}

// ── Anzeige-Hilfen ───────────────────────────────────────────────────────────────────────
//
// Diese Funktionen sind **rein** und liegen deshalb hier statt in der Oberflaeche: sie sind die
// Stelle, an der „0.00175" zu „128° je Bildschirmbreite" wird — und genau das ist die Zahl, ueber die
// der Betreiber sich beschwert hat („wenn ich versuche zu drehen ist es zu fast"). Eine solche
// Umrechnung gehoert geprueft, nicht gemalt.

/**
 * Radiant je Pixel → **Pixel je Grad**.
 *
 * **Die Herleitung, damit hier nie wieder geraten wird.** Wenn ein Pixelzug `s` Pixel weit ist,
 * dreht er um `s · radPerPixel` Radiant. Ein Grad ist `π/180` Radiant. Also:
 *
 *     Pixel je Grad  =  (π/180) / radPerPixel
 *
 * Mit `radPerPixel = 0,00175`:  `0,017453 / 0,00175 = ` **9,97 px/°**.
 * Mit dem alten `0,0042`:       `0,017453 / 0,0042  = ` **4,15 px/°**.
 *
 * Die Gegenprobe: 10 Pixel Zug mal 0,00175 sind 0,0175 Radiant — das ist **1,0°**. Ein Zug von
 * 10 px dreht also um ein Grad, und das sind 10 Pixel je Grad. Die Zahl stimmt.
 *
 * **Hier stand zweimal etwas Falsches, und beide Male war es dieselbe Verwechslung:**
 *
 *   1. `(180/π) · radPerPixel` → `0,1`. Das ist „**Grad** je Pixel".
 *   2. `(180/π) / radPerPixel` → `32 740`. Das ist „Pixel je **Radiant**" — die Umrechnung
 *      Radiant→Grad fehlte. Als Korrektur stand darunter „richtig sind 32,7 px/°"; das war
 *      derselbe Fehler, nur um den Faktor 1000 daneben.
 *
 * Richtig ist **9,97 px/°**. `tests/settings.test.ts` haelt die Zahl samt Gegenprobe fest — ohne
 * diesen Test waere sie ein drittes Mal verrutscht.
 */
export function pixelsPerDegree(radPerPixel: number): number {
  if (!Number.isFinite(radPerPixel) || radPerPixel <= 0) return Number.POSITIVE_INFINITY
  return (Math.PI / 180) / radPerPixel
}

/**
 * Radian je Pixel → **Grad, um die ein Zug ueber die ganze Bildschirmbreite dreht**.
 *
 * **Das ist die Zahl, die man beim Drehen wirklich spuert.** „Pixel je Grad" haengt an der
 * Fensterbreite und liest sich bei 10 px/° wie „sehr feinfuehlig"; „128° je Bildschirmbreite" sagt
 * dasselbe und ist sofort verstaendlich: zwei Zuege, und man ist einmal herum.
 */
export function degreesPerWidth(radPerPixel: number, width = 1280): number {
  if (!Number.isFinite(radPerPixel) || radPerPixel <= 0) return 0
  return ((radPerPixel * width * 180) / Math.PI) % 360
}

/** Ein Faktor je Rastschritt → wie viele Schritte eine Halbierung braucht. */
export function notchesPerHalf(factor: number): number {
  if (!Number.isFinite(factor) || factor <= 1) return Number.POSITIVE_INFINITY
  return Math.log(0.5) / Math.log(1 / factor)
}

/**
 * Der Wert, wie er in der Oberflaeche steht.
 *
 * **Warum die Einheit hier rechnet und nicht im Bauteil:** es gibt **eine** Stelle, an der die
 * Bedeutung eines Wertes steht. Zwei Stellen wuerden auseinanderlaufen, und dann zeigt die
 * Einstellung etwas anderes an, als die Kamera tut.
 */
export function formatValue(field: Field, value: FieldValue, locale = 'en'): string {
  // Eine Auswahl und ein Schalter haben **keine Einheit** — ihre Anzeige ist der Wert selbst.
  // Ohne diese Zeile muesste jeder Aufrufer wissen, welche Art Feld er vor sich hat, und genau
  // dieses Wissen ist die Stelle, an der die Anzeige spaeter nicht mehr zum Schema passt.
  if (field.kind !== 'number') return String(value)
  const zahl = typeof value === 'number' ? value : Number.NaN
  switch (field.unit) {
    case 'radPerPx': {
      // **Zwei Zahlen, und beide sind wichtig.** Die Grad je Bildschirmbreite sagen, wie es sich
      // anfuehlt; die Pixel je Grad sagen, wie genau man zielt. Eine allein reicht nicht.
      const px = pixelsPerDegree(zahl)
      const grad = degreesPerWidth(zahl)
      if (!Number.isFinite(px)) return '—'
      return locale === 'de'
        ? `${grad.toFixed(0)}° je Bildschirmbreite · ${px.toFixed(1)} px/°`
        : `${grad.toFixed(0)}° per screen width · ${px.toFixed(1)} px/°`
    }
    case 'anglePerWidth': {
      // **Die Hauptzahl.** Sie beschreibt das, was man tut: ueber den Bildschirm ziehen. Und sie ist
      // von der Aufloesung unabhaengig — „Pixel je Grad" waere es nicht.
      const grad = degreesPerWidth(zahl)
      if (!Number.isFinite(zahl) || zahl <= 0) return '—'
      return `${grad.toFixed(0)}° / ${locale === 'de' ? 'Bildschirmbreite' : 'screen width'}`
    }
    case 'factorPerNotch': {
      const schritte = notchesPerHalf(zahl)
      const text = Number.isFinite(schritte) ? schritte.toFixed(1) : '∞'
      return locale === 'de' ? `${zahl.toFixed(2)} · ${text} Schritte je Halbierung` : `${zahl.toFixed(2)} · ${text} steps per half`
    }
    case 'seconds':
      return locale === 'de' ? `${zahl.toFixed(2)} s` : `${zahl.toFixed(2)} s`
    case 'degrees':
      return `${zahl.toFixed(0)}°`
    case 'percent':
      return `${Math.round(zahl * 100)} %`
    default:
      return String(value)
  }
}
