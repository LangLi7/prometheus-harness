/**
 * **Die Stilvorlagen der Welt — und wie man sie umschaltet.**
 *
 * **Was der Betreiber dazu gesagt hat:** „für den style denke ich ein Kombination inklusive SVG und
 * Theme ect inklusive Font, Richtung Rust, Prometheus Mythologie … so scifi und Mythologie flame like
 * … like a phoenix flame mit rust" — und dann ausdrücklich: „erstelle mal ein Template side oder eine
 * möglichkeit es zu switchen damit man es auch testen könnte."
 *
 * ## Warum es **Vorlagen** sind und keine neuen Farben
 *
 * Eine Gestaltung zu ändern heißt in diesem Projekt nicht, Werte zu überschreiben, sondern **einen
 * zweiten Satz Token** zu führen. Der Grund steht in `app.css`: die Werte dort sind die **eine**
 * Quelle, aus der Kamera, Insel, Panels und Dialog lesen. Wer für eine neue Richtung eine Regel
 * daneben schreibt („der Dialog ist jetzt eckiger"), hat zwei Wahrheiten — und die zweite fällt beim
 * nächsten Umbau um. Hier wird stattdessen **derselbe Satz Namen** mit anderen Werten belegt;
 * jede Regel der Welt merkt davon nichts und sieht trotzdem anders aus.
 *
 * ## Wie eine Vorlage gewählt wird — drei Wege, eine Reihenfolge
 *
 * | Weg | Wo | Gilt |
 * |---|---|---|
 * | `?stil=prometheus` in der Adresse | zum **Prüfen**, ohne etwas zu speichern | **gewinnt** beim Laden |
 * | Einstellung `interface.stil` | im Einstellungsbildschirm, für den Dauerzustand | gilt, wenn die Adresse nichts sagt |
 * | Vorgabe | {@link STIL_VORGABE} | gilt, wenn beides fehlt |
 *
 * **Warum die Adresse gewinnt.** Wer zwei Vorlagen vergleichen will, braucht **zwei offene Tabs** —
 * und die dürfen sich nicht gegenseitig umstellen. Eine Einstellung ist im Browserspeicher je Raum
 * abgelegt und wäre für beide Tabs dieselbe; ein Adresszusatz ist es nicht. Ein Adresszusatz wird
 * **nicht gespeichert**: das nächste Laden ohne ihn zeigt wieder die eingestellte Vorlage.
 *
 * **Und warum die Herkunft im Dokument steht.** `data-stil-quelle` sagt, **warum** eine Vorlage
 * gerade gilt. Ohne diese Angabe sieht ein Prüflauf mit `?stil=…` genauso aus wie eine geänderte
 * Einstellung — und dann sucht jemand den Fehler in der Einstellung, die niemand angefaßt hat.
 * Dasselbe Verfahren wie beim Thema des Harness (`data-ds-theme-source`).
 *
 * ## Was eine Vorlage **nicht** tut
 *
 * Sie ändert **keine Struktur**: kein Knoten kommt dazu, keiner fällt weg, keine Beschriftung
 * wechselt. Was sich ändert, ist Farbe, Form, Schriftbehandlung und Bewegung — plus **ein** Zeichen:
 * die Marke. Deshalb ist die Umschaltung ohne Neuladen möglich und ohne Zustand: es gibt nichts,
 * was auseinanderlaufen könnte.
 *
 * @module apps/universe/src/stil
 */

import type { IconName } from '@prometheus-harness/icons'

/**
 * Die bekannten Vorlagen.
 *
 * **Die Reihenfolge ist die Anzeige-Reihenfolge** in der Auswahlliste: erst das Bestehende, dann das
 * Neue. Eine Liste, die alphabetisch sortiert, stellte `base` hinter `prometheus` — und damit wäre
 * die Vorgabe der zweite Eintrag.
 *
 * **Warum die Werte englisch sind.** Sie sind **Kennungen**, keine Anzeige — genau wie die
 * Schlüssel der Einstellungen (`interface.labels`, `interface.mode`, `universe.visuals` mit
 * `none|stars|all`). Was der Nutzer liest, steht im Sprachpaket („Grundgerüst", „Schmiede —
 * Prometheus").
 */
export const STILE = ['base', 'prometheus'] as const

/** Eine Vorlage. */
export type Stil = (typeof STILE)[number]

/**
 * Die Vorlage, die gilt, wenn nichts gewählt wurde.
 *
 * **Warum das `base` ist und nicht `prometheus`.** Das Bestehende bleibt die Vorgabe, solange der
 * Betreiber nichts anderes sagt: eine neue Gestaltung, die sich beim nächsten Start von selbst
 * einschaltet, nimmt ihm die Wahl — und genau die hat er verlangt („damit man es auch testen könnte").
 */
export const STIL_VORGABE: Stil = 'base'

/** Der Schlüssel der Einstellung, die die Vorlage hält. */
export const STIL_SCHLUESSEL = 'interface.style'

/** Der Name des Adresszusatzes (`?stil=prometheus`). */
export const STIL_PARAMETER = 'stil'

/** Das Attribut am Wurzelelement, an dem das Blatt die Vorlage erkennt. */
export const STIL_ATTRIBUT = 'data-stil'

/** Das Attribut, das die **Herkunft** der Wahl nennt. Siehe Dateikopf. */
export const STIL_QUELLE_ATTRIBUT = 'data-stil-quelle'

/** Woher die geltende Vorlage kommt. */
export type StilQuelle = 'adresse' | 'einstellung' | 'vorgabe'

/**
 * Ist das eine bekannte Vorlage?
 *
 * **Warum geprüft wird und nicht vertraut.** Der Wert kommt aus einer Adresse oder aus dem
 * Browserspeicher — beides kann alles enthalten. Ein unbekannter Wert darf **nicht** durchgereicht
 * werden: er landete als Attribut im Dokument, dort träfe ihn keine Regel, und die Welt stünde ohne
 * Farben da (der `:root`-Satz der Vorlage **ersetzt** den Grundsatz, er ergänzt ihn nicht).
 *
 * @param wert - der geprüfte Wert
 * @returns ob es eine bekannte Vorlage ist
 */
export function istStil(wert: unknown): wert is Stil {
  return typeof wert === 'string' && (STILE as readonly string[]).includes(wert)
}

/**
 * Die Vorlage aus einem Adressteil (`?stil=prometheus`).
 *
 * **Warum der ganze Suchteil übergeben wird und nicht `location`.** Damit die Funktion ohne Browser
 * prüfbar ist: aus Zeichenkette wird Ergebnis, sonst nichts.
 *
 * @param suche - `location.search`, mit oder ohne führendes `?`
 * @returns die gewählte Vorlage oder `undefined`, wenn die Adresse nichts (Gültiges) sagt
 */
export function stilAusAdresse(suche: string): Stil | undefined {
  const roh = suche.startsWith('?') ? suche.slice(1) : suche
  if (roh === '') return undefined
  for (const teil of roh.split('&')) {
    const [name, wert = ''] = teil.split('=')
    if (name !== STIL_PARAMETER) continue
    // `?stil` ohne Wert ist **keine** Wahl — sonst schaltete ein Tippfehler in der Adresse die
    // Vorlage um, und niemand fände den Grund.
    if (wert === '') return undefined
    let entpackt: string
    try {
      entpackt = decodeURIComponent(wert)
    } catch {
      // Eine kaputte Prozentfolge ist keine Angabe. Sie zu erraten wäre schlimmer als sie zu verwerfen.
      return undefined
    }
    return istStil(entpackt) ? entpackt : undefined
  }
  return undefined
}

/**
 * Woher die geltende Vorlage kommt.
 *
 * **Warum das eine eigene Funktion ist.** Die Herkunft ist eine Aussage, die man **prüfen** können
 * muss: sie steht im Dokument und in der Statusauskunft. Drei Fälle, drei Namen — und keiner davon
 * wird geraten.
 *
 * @param gewaehlt - der Wert aus der Einstellung, wie er im Speicher steht (unbekannt möglich)
 * @param ausAdresse - der Wert aus der Adresse, wenn es einen gibt
 * @returns die geltende Vorlage und ihre Herkunft
 */
export function stilWahl(
  gewaehlt: unknown,
  ausAdresse: Stil | undefined,
): { readonly stil: Stil; readonly quelle: StilQuelle } {
  if (ausAdresse !== undefined) return { stil: ausAdresse, quelle: 'adresse' }
  if (istStil(gewaehlt)) return { stil: gewaehlt, quelle: 'einstellung' }
  return { stil: STIL_VORGABE, quelle: 'vorgabe' }
}

/**
 * **Das Zeichen der Marke je Vorlage.**
 *
 * Die Marke ist das **einzige**, was eine Vorlage an der Struktur ändert — und sie muss es: ein
 * Farbwechsel allein sagt nicht, welche Richtung gerade gilt, und wer einen Bildschirm fotografiert,
 * sieht nur noch ein Bild ohne Namen. `base` trägt die Flamme (das Bestehende), die Vorlage
 * `prometheus` den Vogel, der daraus steigt.
 *
 * @param stil - die Vorlage
 * @returns der Name des Zeichens aus `@prometheus-harness/icons`
 */
export function stilMarke(stil: Stil): IconName {
  return stil === 'prometheus' ? 'phoenix' : 'prometheus'
}

/**
 * Setzt die Vorlage am Wurzelelement.
 *
 * **Warum zwei Attribute und nicht eines.** `data-stil` ist die Wahl, `data-stil-quelle` ihre
 * Herkunft. Beides an **einem** Element: das Blatt greift über `[data-stil='…']`, und wer im
 * Browser nachsieht, findet die Begründung daneben.
 *
 * @param wurzel - das Wurzelelement (im Betrieb `document.documentElement`)
 * @param stil - die zu setzende Vorlage
 * @param quelle - woher sie kommt
 */
export function setzeStil(
  wurzel: { setAttribute(name: string, wert: string): void },
  stil: Stil,
  quelle: StilQuelle,
): void {
  wurzel.setAttribute(STIL_ATTRIBUT, stil)
  wurzel.setAttribute(STIL_QUELLE_ATTRIBUT, quelle)
}
