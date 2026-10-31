/**
 * `shapes.ts` — **die Zeichen selbst, als Geometrie.**
 *
 * ## Warum eine eigene Datei für die Formen
 *
 * Ein Zeichen ist hier **keine Bilddatei**, sondern eine Zeichnung: eine Liste von SVG-Elementen auf
 * einem 24×24-Raster. Das hat drei Folgen, und alle drei sind gewollt:
 *
 *   1. **Eine Quelle.** `svg/prometheus.svg`, das Sprite und das, was die Oberfläche anzeigt, kommen
 *      aus **demselben** Eintrag. Es gibt keinen zweiten Stand, der veralten kann.
 *   2. **Prüfbar ohne Browser.** Ob eine Form im Raster bleibt, ob sie nur erlaubte Elemente
 *      benutzt, ob zwei Zeichen dieselbe Kennung tragen — das sind Rechnungen und Textvergleiche
 *      (`tests/icons.test.ts`), keine Bildvergleiche.
 *   3. **Farbneutral.** Jede Form malt mit `currentColor` und **nichts** sonst. Die Farbe entscheidet
 *      die Oberfläche (CSS) — ein Zeichen, das seine Farbe mitbringt, wäre in einem dunklen Bild
 *      unbrauchbar.
 *
 * ## Die Sprache der Formen
 *
 * * **24 × 24 Raster**, Strichlinie, `stroke-width` aus {@link STRICHSTAERKE}, runde Enden.
 * * **Kein Füllen außer als Akzent** (`fill="currentColor" stroke="none"`), und nur für Punkte, die
 *   ohne Füllung nicht zu sehen wären (Sternpunkte, Zielpunkte).
 * * **Zwei Nachkommastellen.** Mehr ist bei 24 Einheiten und 16 Pixeln Anzeige nicht sichtbar, macht
 *   die Datei aber unlesbar lang.
 *
 * ## Das Thema: Prometheus
 *
 * Der Titan, der das Feuer stahl, es im **Narthex** (einem Gefäß) trug, an den Kaukasus **gekettet**
 * wurde und dem täglich ein Adler kam — und den Hephaistos' **Amboss** und Heras **Fackelzug** durch
 * die ganze Geschichte begleiten. Fünf Zeichen tragen das: {@link ICONS} unter `prometheus`,
 * `torch`, `vessel`, `chain` und `anvil`. Die übrigen sind **Werkzeug**: Navigation, Himmel, Zustand.
 * Ein Zeichensatz, der nur aus Mythen bestünde, wäre ein Poster und keine Oberfläche.
 *
 * @module @prometheus-harness/icons/shapes
 */

/** Die Kantenlänge des Rasters. Jede Zahl in dieser Datei liegt zwischen 0 und diesem Wert. */
export const RASTER = 24

/**
 * Die Strichstärke in Rastereinheiten.
 *
 * **Warum 1,7 und nicht 2.** Angezeigt werden die Zeichen mit 14–17 px (Insel, Kopfzeile). Bei 24
 * Einheiten Raster sind 1,7 Einheiten dort rund **1,1 px** — eine Linie, die auf einem Bildschirm
 * noch steht, ohne zuzulaufen. Mit 2,0 werden feine Formen (die Flamme, das Zahnrad) zu Flecken;
 * mit 1,4 verschwinden sie auf einem hellen Untergrund. Der Wert steht hier und nicht im CSS, weil
 * er die **Zeichnung** betrifft: die Abstände sind darauf abgestimmt.
 *
 * Er läßt sich im CSS überschreiben (`stroke-width`), wenn ein Zusammenhang größere Zeichen braucht.
 */
export const STRICHSTAERKE = 1.7

/** Farbe und Linienart — `currentColor` erbt von der Oberfläche, siehe Dateikopf. */
export const STRICH = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': String(STRICHSTAERKE),
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const

/**
 * Rundet auf zwei Nachkommastellen **und schneidet Nullen weg**.
 *
 * Ohne das stünde in jeder Datei `11.600000000000001` — und ein Pfad, den niemand mehr liest, wird
 * auch nicht mehr geprüft.
 *
 * @param wert - die Zahl
 * @returns die gekürzte Schreibweise
 */
export function z(wert: number): string {
  return String(Math.round(wert * 100) / 100)
}

/** Ein Punkt im Raster. */
export type Punkt = readonly [x: number, y: number]

/**
 * Ein Punkt auf einem Kreis um die Mitte.
 *
 * **0° zeigt nach oben, gezählt wird im Uhrzeigersinn** — die Richtung, in der ein Betrachter eine
 * Uhr liest. Damit ist `punkt(12, 12, 8, 0)` der Scheitel und `(12, 12, 8, 90)` der rechte Rand;
 * wer die Gegenrichtung braucht, zählt negativ.
 *
 * @param mx - x der Mitte
 * @param my - y der Mitte
 * @param r - Radius
 * @param grad - Winkel in Grad
 * @returns der Punkt
 */
export function punkt(mx: number, my: number, r: number, grad: number): Punkt {
  const bogen = ((grad - 90) * Math.PI) / 180
  return [mx + r * Math.cos(bogen), my + r * Math.sin(bogen)]
}

/**
 * **Ein Punkt auf einer gedrehten Ellipse** — dieselbe Zählung wie {@link punkt}.
 *
 * **Warum das gerechnet wird.** Ein Körper, der auf einer Bahn sitzen soll, muss **auf** der Bahn
 * liegen; von Hand geraten liegt er daneben, und bei 15 px sieht das aus wie ein Fleck neben dem
 * Ring. Hier wird erst der Einheitskreis auf `rx`/`ry` gestreckt und dann mit **derselben** Drehung
 * gedreht, die die Ellipse im Markup bekommt — die Bahn und ihr Körper können also nicht
 * auseinanderlaufen.
 *
 * @param mx - x der Mitte
 * @param my - y der Mitte
 * @param rx - halbe Breite
 * @param ry - halbe Höhe
 * @param drehung - die Drehung der Ellipse in Grad (wie `rotate` im SVG)
 * @param grad - die Stelle auf der Bahn (0° = oben)
 * @returns der Punkt
 */
export function punktEllipse(
  mx: number,
  my: number,
  rx: number,
  ry: number,
  drehung: number,
  grad: number,
): Punkt {
  const einheit = punkt(0, 0, 1, grad)
  const x = einheit[0] * rx
  const y = einheit[1] * ry
  const rad = (drehung * Math.PI) / 180
  return [mx + x * Math.cos(rad) - y * Math.sin(rad), my + x * Math.sin(rad) + y * Math.cos(rad)]
}

/** Ein `<circle>` — der häufigste Baustein. */
export function kreis(mx: number, my: number, r: number, gefuellt = false): string {
  const fuellung = gefuellt ? ' fill="currentColor" stroke="none"' : ''
  return `<circle cx="${z(mx)}" cy="${z(my)}" r="${z(r)}"${fuellung}/>`
}

/** Ein `<ellipse>` — für Bahnen und Ringe. */
export function ellipse(mx: number, my: number, rx: number, ry: number, drehung = 0): string {
  const winkel = drehung === 0 ? '' : ` transform="rotate(${z(drehung)} ${z(mx)} ${z(my)})"`
  return `<ellipse cx="${z(mx)}" cy="${z(my)}" rx="${z(rx)}" ry="${z(ry)}"${winkel}/>`
}

/** Ein `<rect>` mit runden Ecken. */
export function rechteck(x: number, y: number, breite: number, hoehe: number, r = 2, drehung = 0): string {
  const winkel = drehung === 0 ? '' : ` transform="rotate(${z(drehung)} ${z(x + breite / 2)} ${z(y + hoehe / 2)})"`
  return `<rect x="${z(x)}" y="${z(y)}" width="${z(breite)}" height="${z(hoehe)}" rx="${z(r)}"${winkel}/>`
}

/** Eine Linie. */
export function linie(x1: number, y1: number, x2: number, y2: number): string {
  return `<path d="M${z(x1)} ${z(y1)} ${z(x2)} ${z(y2)}"/>`
}

/**
 * Ein Polygonzug — entweder offen (`d="M… L…"`) oder geschlossen (`d="M… L… Z"`).
 *
 * @param punkte - die Eckpunkte
 * @param geschlossen - ob der Zug sich schließt
 * @returns das `<path>`-Element
 */
export function zug(punkte: readonly Punkt[], geschlossen = false): string {
  const [erster, ...rest] = punkte
  if (!erster) return ''
  const teil = [`M${z(erster[0])} ${z(erster[1])}`]
  for (const p of rest) teil.push(`L${z(p[0])} ${z(p[1])}`)
  if (geschlossen) teil.push('Z')
  return `<path d="${teil.join(' ')}"/>`
}

/**
 * **Ein Strahlenkranz** — die Sonne, das Zahnrad, der Funke.
 *
 * Die Strahlen beginnen **außerhalb** des Kerns (`von`) und enden bei `bis`. Ein Strahl, der den Kern
 * berührt, sieht bei kleiner Anzeige aus wie ein Fleck; der Abstand ist der ganze Unterschied
 * zwischen „Sonne" und „Klecks".
 *
 * @param mx - x der Mitte
 * @param my - y der Mitte
 * @param anzahl - wie viele Strahlen
 * @param von - innerer Radius
 * @param bis - äußerer Radius
 * @param versatz - Startwinkel in Grad
 * @returns die Linien als eine Zeichenkette
 */
export function strahlen(mx: number, my: number, anzahl: number, von: number, bis: number, versatz = 0): string {
  const teile: string[] = []
  for (let i = 0; i < anzahl; i += 1) {
    const a = punkt(mx, my, von, versatz + (360 / anzahl) * i)
    const b = punkt(mx, my, bis, versatz + (360 / anzahl) * i)
    teile.push(linie(a[0], a[1], b[0], b[1]))
  }
  return teile.join('')
}

/**
 * **Ein Zahnrad als geschlossener Zug.**
 *
 * Zwischen zwei Zähnen liegt immer ein Tal, also hat der Zug `2 × zaehne` Ecken: außen und innen im
 * Wechsel. Die Zähne werden mit einem kleinen Versatz gesetzt (`breite`), sonst wären sie Nulldicke
 * und das Rad sähe aus wie ein Stern.
 *
 * **Warum gerechnet und nicht von Hand geschrieben.** Ein von Hand geschriebener Zahnradpfad mit 16
 * Ecken ist eine Zahlenwüste, in der ein Zahlendreher nicht auffällt — man sieht nur, dass „das
 * Zahnrad komisch aussieht". Hier ist jede Ecke eine Rechnung, und die Prüfung kann nachrechnen, dass
 * alle Außenecken auf demselben Kreis liegen.
 *
 * @param mx - x der Mitte
 * @param my - y der Mitte
 * @param zaehne - Anzahl der Zähne
 * @param aussen - Radius der Zahnspitzen
 * @param innen - Radius der Täler
 * @param breite - halbe Winkelbreite eines Zahns in Grad
 * @returns das `<path>`-Element
 */
export function zahnrad(
  mx: number,
  my: number,
  zaehne: number,
  aussen: number,
  innen: number,
  breite = 11,
): string {
  const schritt = 360 / zaehne
  const ecken: Punkt[] = []
  for (let i = 0; i < zaehne; i += 1) {
    const mitte = i * schritt
    ecken.push(punkt(mx, my, aussen, mitte - breite))
    ecken.push(punkt(mx, my, aussen, mitte + breite))
    ecken.push(punkt(mx, my, innen, mitte + schritt / 2 - breite))
    ecken.push(punkt(mx, my, innen, mitte + schritt / 2 + breite))
  }
  return zug(ecken, true)
}

/**
 * **Ein Bogen** als Pfad — von `start` um `winkel` Grad im Uhrzeigersinn.
 *
 * `groß` und `richtung` sind die beiden Schalter, die SVG für Bögen verlangt; sie werden hier
 * **gerechnet** und nicht geschrieben: ein Bogen über mehr als 180° braucht ein anderes Kennzeichen
 * als ein kurzer, und wer das von Hand setzt, vertauscht es irgendwann.
 *
 * @param mx - x der Mitte
 * @param my - y der Mitte
 * @param r - Radius
 * @param start - Startwinkel in Grad (0° = oben)
 * @param winkel - der Winkel, den der Bogen überstreicht (negativ = gegen den Uhrzeigersinn)
 * @returns das `<path>`-Element
 */
export function bogen(mx: number, my: number, r: number, start: number, winkel: number): string {
  const a = punkt(mx, my, r, start)
  const b = punkt(mx, my, r, start + winkel)
  const gross = Math.abs(winkel) > 180 ? 1 : 0
  const richtung = winkel >= 0 ? 1 : 0
  return `<path d="M${z(a[0])} ${z(a[1])} A${z(r)} ${z(r)} 0 ${String(gross)} ${String(richtung)} ${z(b[0])} ${z(b[1])}"/>`
}

/** Das rohe Zeichen: was es ist und wie es gezeichnet wird. */
export interface Zeichen {
  /** Was es zeigt — auf Deutsch, für die Übersicht und die Doku. */
  readonly was: string
  /** Sein Körper: SVG-Elemente **ohne** das umgebende `<svg>`. */
  readonly koerper: string
}

/** Der Rumpf eines Pfeils, immer gleich — die vier Richtungen entstehen durch Drehung. */
const PFEIL = zug([
  [9.6, 5.8],
  [15.8, 12],
  [9.6, 18.2],
])

/**
 * Ein Pfeil in eine Richtung — dieselbe Zeichnung, gedreht.
 *
 * **Warum gedreht und nicht vier Mal gezeichnet.** Vier Pfade wären vier Gelegenheiten, einen davon
 * schief zu setzen — und man sähe es erst im Bild. Eine Zeichnung, vier Drehungen: was in einer
 * Richtung stimmt, stimmt in allen.
 *
 * @param grad - die Drehung um die Mitte
 * @returns der gedrehte Pfeil
 */
function pfeil(grad: number): string {
  return grad === 0 ? PFEIL : `<g transform="rotate(${String(grad)} 12 12)">${PFEIL}</g>`
}

/** Die Mitte des Rasters — Bahnen und Körper rechnen immer darum. */
const MITTE = RASTER / 2

/** Ein Körper auf einer Bahn: wo er sitzt und wie groß er ist. */
interface KoerperAufBahn {
  /** Die Stelle auf der Bahn (0° = oben). */
  readonly grad: number
  /** Sein Radius. */
  readonly r: number
}

/**
 * **Eine Bahn mit Körpern darauf** — die Zeichnung, die `orbit` und `solar-system` teilen.
 *
 * Beide zeigen dasselbe Bild: eine Ellipse, und daraufliegend kleine Punkte. Was sie unterscheidet,
 * ist der **Kern** — und der kommt von außen (`kern`), weil genau er die Bedeutung trägt: ein
 * Vollpunkt heißt „ein Körper", ein offener Kreis heißt „eine Sonne".
 *
 * @param rx - halbe Breite der Bahn
 * @param ry - halbe Höhe der Bahn
 * @param drehung - die Drehung der Bahn in Grad
 * @param koerper - die Punkte auf der Bahn
 * @param kern - was in der Mitte steht (Vorgabe: nichts)
 * @returns die Zeichnung
 */
function bahnMitKoerpern(
  rx: number,
  ry: number,
  drehung: number,
  koerper: readonly KoerperAufBahn[],
  kern = '',
): string {
  const punkte = koerper
    .map((k) => {
      const p = punktEllipse(MITTE, MITTE, rx, ry, drehung, k.grad)
      return kreis(p[0], p[1], k.r, true)
    })
    .join('')
  return ellipse(MITTE, MITTE, rx, ry, drehung) + kern + punkte
}

/**
 * **Der gesamte Zeichensatz.**
 *
 * Die Reihenfolge ist die der Übersicht (`svg/index.html`): zuerst das Thema, dann das Werkzeug,
 * dann der Himmel, dann der Zustand. Wer ein Zeichen hinzufügt, trägt es **hier** ein — alles andere
 * (Datei, Sprite, Prüfung, Übersicht) folgt daraus.
 */
export const ICONS = {
  // ── Das Thema: Prometheus ────────────────────────────────────────────────────────────────
  prometheus: {
    was: 'Die Flamme mit zwei Zungen — die Marke. Sie steht für das gestohlene Feuer.',
    koerper:
      // Der äußere Umriß: unten rund, oben spitz, mit einem kleinen Widerhaken links.
      '<path d="M12 21.4a6.4 6.4 0 0 0 6.4-6.4c0-3.4-2.4-4.9-3.4-7.1-.6-1.3-.7-2.5-.3-3.8-2.9 1.5-4.5 3.9-4.5 6.3 0 1.3.5 2.2.5 3a1.9 1.9 0 0 1-3.8.2c-.1-.6 0-1.2.2-1.8A6.4 6.4 0 0 0 12 21.4z"/>' +
      // Die innere Zunge — sie macht aus dem Tropfen eine Flamme.
      '<path d="M12 20.2a2.9 2.9 0 0 0 2.9-2.9c0-1.8-1.4-2.4-1.4-4.2-1.1 1.2-1.9 2.1-1.9 3.4 0 .6.4.9.4 1.4a1.4 1.4 0 0 1-2.1 1.2"/>',
  },
  phoenix: {
    was: 'Der Phönix — aus der Asche aufsteigend. Für „Neuanfang", „Wiederaufbau", „Weiter nach dem Fehler".',
    koerper:
      /*
       * **Warum der Vogel und nicht noch eine Flamme.** Die Marke *ist* bereits eine Flamme
       * ({@link ICONS.prometheus}). Ein zweites Feuerzeichen daneben wäre kein zweites Bild, sondern
       * dasselbe zweimal — und bei 15 px nicht zu unterscheiden. Der Phönix trägt dieselbe Herkunft
       * (Feuer) in einer **anderen Gestalt**: Flügel, Rücken, Stoß aus drei Zungen.
       *
       * **Die Flügel sind die Aussage.** Sie steigen nach **außen oben** — nach unten gebogene
       * Flügel ergäben einen hängenden Vogel, und „aus der Asche steigen" ist das Gegenteil davon.
       * Der Stoß darunter besteht aus **drei** Zungen, wie das Feuer in {@link ICONS.flamme}.
       */
      // Kopf und Schnabel.
      kreis(12, 5.8, 1.5) +
      linie(13.3, 5.5, 15.4, 6.5) +
      // Der Rücken — er hält Kopf und Stoß zusammen; ohne ihn schweben die Teile.
      '<path d="M12 7.4c-1 2.4-0.9 4.8 0.3 7.2"/>' +
      // Die Flügel: ein Schwung je Seite, vom Rücken nach außen oben.
      '<path d="M11.6 9.2C9 7.2 6.4 7.3 3.6 9.8c2.8 1 4.8 2 6.6 3.4"/>' +
      '<path d="M12.4 9.2c2.6-2 5.2-1.9 8 0.6-2.8 1-4.8 2-6.6 3.4"/>' +
      // Der Stoß: drei Zungen, die kürzeste in der Mitte.
      '<path d="M12.3 14.6c1.4 2.2 1.6 4.2 0.6 6.4"/>' +
      '<path d="M11.7 14.6c-1.4 2.2-1.6 4.2-0.6 6.4"/>' +
      linie(12, 15.2, 12, 20.8),
  },
  flamme: {
    was: 'Das Feuer — drei Zungen über dem Grund. Für „Schmiede", „Hitze", „in Betrieb".',
    koerper:
      /*
       * **Drei Zungen, nicht eine.** {@link ICONS.prometheus} ist die **eine** Flamme mit Widerhaken
       * (die Marke), {@link ICONS.torch} die getragene. Dieses Zeichen ist das **Feuer selbst**: eine
       * hohe Zunge in der Mitte, zwei kleinere an den Seiten, alle auf einer Linie stehend. Die
       * Grundlinie ist der Unterschied zwischen „Feuer" und „Flamme im Wind" — ohne sie schweben die
       * Zungen, und das Bild heißt dann „Blätter".
       */
      '<path d="M12 2.8c2.4 3.2 3.6 5 3.6 7a3.6 3.6 0 0 1-7.2 0c0-2 1.2-3.8 3.6-7z"/>' +
      '<path d="M12 9.6c1.1 1.5 1.6 2.4 1.6 3.4a1.6 1.6 0 0 1-3.2 0c0-1 0.5-1.9 1.6-3.4z"/>' +
      '<path d="M6.2 12.4c1.4 1.9 2.1 3.1 2.1 4.5a2.1 2.1 0 0 1-4.2 0c0-1.4 0.7-2.6 2.1-4.5z"/>' +
      '<path d="M17.8 12.4c1.4 1.9 2.1 3.1 2.1 4.5a2.1 2.1 0 0 1-4.2 0c0-1.4 0.7-2.6 2.1-4.5z"/>' +
      linie(3.2, 21, 20.8, 21),
  },
  torch: {
    was: 'Die Fackel — das Feuer wird getragen. Für „weitergeben" und „in Betrieb".',
    koerper:
      // **Die Flamme zuerst und groß.** Der erste Anlauf hatte eine breite Schale unter einer
      // schmalen Flamme — und sah damit aus wie ein **Kelch**, nicht wie eine Fackel (gemessen am
      // Übersichtsblatt, nicht geraten). Der zweite hatte eine Flamme, die wie ein **Blatt** aussah.
      // Jetzt trägt ein dünner Stiel eine Flamme mit **innerer Zunge** — dieselbe Sprache wie die
      // Marke.
      '<path d="M12 2.4c2.3 2.9 3.5 4.5 3.5 6.3a3.5 3.5 0 0 1-7 0c0-1.8 1.2-3.4 3.5-6.3z"/>' +
      '<path d="M12 8.4c1 1.2 1.5 1.9 1.5 2.7a1.5 1.5 0 0 1-3 0c0-.8.5-1.5 1.5-2.7z"/>' +
      zug(
        [
          [8.8, 10.4],
          [15.2, 10.4],
          [14.4, 12.2],
          [9.6, 12.2],
        ],
        true,
      ) +
      '<path d="M10.9 12.2 10.2 20.6M13.1 12.2 13.8 20.6"/>' +
      linie(9.2, 20.6, 14.8, 20.6),
  },
  vessel: {
    was: 'Das Gefäß (Narthex), in dem das Feuer kam. Für „Behälter", „Bestand", „Sitzung".',
    koerper:
      // Ein Bauch mit Hals, Henkeln und Fuß. Der erste Anlauf war ein Kelch: zu schmal, keine
      // Henkel — und damit von `torch` nicht zu unterscheiden.
      linie(9.8, 3.2, 14.2, 3.2) +
      '<path d="M10 3.2c0 1.5.9 2.1.9 3.4 0 1-.9 1.4-.9 2.8 0 3.6 1.1 6.2 3 6.2s3-2.6 3-6.2c0-1.4-.9-1.8-.9-2.8 0-1.3.9-1.9.9-3.4"/>' +
      '<path d="M9.4 7.4C7.6 8 6.6 9.4 6.6 11s1 3 2.8 3.6"/>' +
      '<path d="M14.6 7.4c1.8.6 2.8 2 2.8 3.6s-1 3-2.8 3.6"/>' +
      '<path d="M10.6 15.6 9.8 20.8h4.4l-.8-5.2"/>',
  },
  chain: {
    was: 'Zwei verschlungene Glieder — Prometheus war an den Felsen gebunden. Für „festgelegt".',
    koerper:
      // **Zwei Glieder, nicht zwei Kapseln.** Der erste Anlauf zeigte zwei senkrechte Kapseln
      // nebeneinander — das liest man als „acht", nicht als Kette. Jetzt liegen beide schräg
      // (45°) und **überschneiden** sich: die Überschneidung ist die Kette.
      rechteck(3.3, 8.3, 11, 7.4, 3.7, -45) + rechteck(9.7, 8.3, 11, 7.4, 3.7, -45),
  },
  anvil: {
    was: 'Der Amboss — die Werkstatt des Hephaistos. Für „Bauen", „Umsetzen".',
    koerper:
      '<path d="M3.2 8.8h12.2c1 1.6 2.6 2.6 4.6 3.2-2 1.2-3.4 2.2-4.2 3.4H8.8l-1.2 1.8H4.4z"/>' +
      '<path d="M8.8 15.4h6.6l1.4 3.4H7.4z"/>' +
      linie(5.4, 20.4, 18.6, 20.4),
  },

  hammer: {
    was: 'Der Hammer — das Werkzeug der Schmiede. Für „formen", „schlagen", „umbauen".',
    koerper:
      /*
       * **Ein Bärhammer, kein Zimmermannshammer.** Der Kopf ist ein **geschlossener Zug** mit sechs
       * Ecken: unten flach (die Bahn, auf der er liegt), oben leicht zulaufend. Ein bloßes Rechteck
       * sähe aus wie ein Balken — und `anvil` daneben ist bereits eine schwere Silhouette.
       *
       * Der Stiel steht **senkrecht** und nicht schräg: schräg gekreuzt mit dem Amboss ergäbe ein
       * Wappen; ein Werkzeug zeigt man gerade.
       */
      zug(
        [
          [3.4, 3.8],
          [16.6, 3.8],
          [20.2, 5.4],
          [20.2, 7.4],
          [16.6, 9],
          [3.4, 9],
        ],
        true,
      ) +
      linie(12, 9, 12, 20.2) +
      linie(9.8, 20.2, 14.2, 20.2),
  },

  // ── Das Werkzeug: Navigation ─────────────────────────────────────────────────────────────
  orbit: {
    was: 'Eine Bahn mit zwei Körpern darauf — der kosmische Überblick, der Weg in die Welt.',
    koerper: bahnMitKoerpern(9.6, 4.4, -28, [
      // **Groß genug, um neben der Bahn zu bestehen.** Mit r=1,5 verschwanden die Körper unter dem
      // Strich der Bahn — gemessen am Übersichtsblatt: man sah einen Ring und sonst nichts.
      { grad: 90, r: 2.2 },
      { grad: 270, r: 2.2 },
    ]),
  },
  chat: {
    was: 'Eine Sprechblase mit zwei Zeilen — der Chat.',
    koerper:
      rechteck(2.6, 4.4, 18.8, 12.6, 2.8) +
      '<path d="M8.2 17v4l4.2-4"/>' +
      linie(6.4, 8.6, 17.6, 8.6) +
      linie(6.4, 12.6, 13.4, 12.6),
  },
  'reset-view': {
    was: 'Die Kamera kehrt zurück — „Ansicht zurücksetzen".',
    koerper:
      '<path d="M12 4.4A7.6 7.6 0 1 0 19.6 12"/>' +
      '<path d="M12 4.4 14.6 2.2M12 4.4 14.6 6.6"/>' +
      kreis(12, 12.6, 1.5, true),
  },
  settings: {
    was: 'Drei Schienen mit Knöpfen — Einstellungen.',
    koerper:
      linie(3, 7, 5.2, 7) +
      linie(10, 7, 21, 7) +
      kreis(7.6, 7, 2.4) +
      linie(3, 12, 13.4, 12) +
      linie(18.6, 12, 21, 12) +
      kreis(16, 12, 2.4) +
      linie(3, 17, 7.4, 17) +
      linie(12.6, 17, 21, 17) +
      kreis(10, 17, 2.4),
  },
  gear: {
    was: 'Ein Zahnrad — Einstellungen als Gruppe, „Mechanik".',
    koerper: zahnrad(12, 12, 8, 9.8, 7.6) + kreis(12, 12, 3.3),
  },
  close: {
    was: 'Ein Kreuz — schließen, abstecken, abbrechen.',
    koerper: linie(6.6, 6.6, 17.4, 17.4) + linie(17.4, 6.6, 6.6, 17.4),
  },
  'chevron-right': { was: 'Ein Pfeil nach rechts — „weiter", „aufklappen".', koerper: pfeil(0) },
  'chevron-down': { was: 'Ein Pfeil nach unten — „öffnen", „mehr davon".', koerper: pfeil(90) },
  'chevron-left': { was: 'Ein Pfeil nach links — „zurück", „einklappen".', koerper: pfeil(180) },
  'chevron-up': { was: 'Ein Pfeil nach oben — „zuklappen", „eine Ebene höher".', koerper: pfeil(270) },
  plus: {
    was: 'Ein Kreuz aus zwei gleichen Strichen — hinzufügen, öffnen.',
    koerper: linie(12, 5.6, 12, 18.4) + linie(5.6, 12, 18.4, 12),
  },
  prompt: {
    was: 'Eine Eingabeaufforderung: Winkel und Strich. Für das Terminal.',
    koerper: zug([
      [5.4, 7.4],
      [9.8, 12],
      [5.4, 16.6],
    ]) + linie(12.6, 16.6, 18.6, 16.6),
  },
  panels: {
    was: 'Eine Fläche mit einer Trennlinie — die Panels.',
    koerper: rechteck(3, 4.4, 18, 15.2, 2.4) + '<path d="M3 10.2h18M10.2 10.2v9.4"/>',
  },
  layers: {
    was: 'Drei übereinanderliegende Ebenen — Ansichten, Bezugsebenen.',
    koerper:
      '<path d="M12 3.2 21 7.8 12 12.4 3 7.8z"/>' +
      '<path d="M3 12.4 12 17l9-4.6"/>' +
      '<path d="M3 16.6 12 21.2l9-4.6"/>',
  },
  search: {
    was: 'Eine Lupe — suchen, finden, einen Körper aufspüren.',
    koerper: kreis(10.4, 10.4, 6.4) + linie(15.2, 15.2, 20.8, 20.8),
  },

  // ── Der Himmel: Orte und Körper ──────────────────────────────────────────────────────────
  place: {
    was: 'Eine Marke im Raum — ein Ort.',
    koerper:
      '<path d="M12 21.6c0 0 6.6-6.6 6.6-11.2a6.6 6.6 0 1 0-13.2 0c0 4.6 6.6 11.2 6.6 11.2z"/>' +
      kreis(12, 10.2, 2.4),
  },
  constellation: {
    was: 'Verbunde Punkte — der kosmische Überblick.',
    koerper:
      linie(5.2, 17.4, 11.8, 7.2) +
      linie(11.8, 7.2, 19.2, 13.2) +
      linie(5.2, 17.4, 9.4, 20) +
      kreis(11.8, 7.2, 1.7, true) +
      kreis(5.2, 17.4, 1.7, true) +
      kreis(19.2, 13.2, 1.7, true) +
      kreis(9.4, 20, 1.2, true),
  },
  stack: {
    was: 'Gestapelte Kästen — ein Stapel, ein Bauwerk, „projekt-stack".',
    koerper:
      // **Nicht dieselbe Zeichnung wie `layers`.** Der erste Anlauf war ebenfalls ein Stapel
      // Rauten — zwei Zeichen, die gleich aussehen, sind ein Zeichen zu viel. Der Stapel ist
      // jetzt **von der Seite** gesehen: drei Kästen, nach oben schmaler.
      rechteck(4.4, 15.6, 15.2, 5, 1.2) + rechteck(6.8, 9.6, 10.4, 5, 1.2) + rechteck(9.2, 3.6, 5.6, 5, 1.2),
  },
  'solar-system': {
    was: 'Eine Sonne mit einer Bahn und einem Körper darauf — das Sonnensystem.',
    koerper:
      // **Der Unterschied zu `orbit` liegt innen.** Beide haben eine Bahn; hier ist der Kern ein
      // **offener** Kreis (eine Sonne, kein Vollpunkt) und es läuft nur **ein** Körper mit.
      bahnMitKoerpern(9.6, 4.6, -22, [{ grad: 90, r: 1.4 }], kreis(12, 12, 3.6)),
  },
  galaxy: {
    was: 'Zwei gekreuzte Bahnen — eine Galaxie.',
    koerper: ellipse(12, 12, 9.8, 3.6, -32) + ellipse(12, 12, 3.6, 9.8, -32) + kreis(12, 12, 1.9, true),
  },
  cluster: {
    was: 'Mehrere Punkte dicht beieinander — ein Sternhaufen.',
    koerper:
      kreis(9.2, 8.6, 2.3, true) +
      kreis(16.2, 10.4, 1.6, true) +
      kreis(11.4, 15.8, 2.6, true) +
      kreis(17.6, 17.2, 1.4, true) +
      kreis(5.8, 16.4, 1.4, true),
  },
  star: {
    was: 'Ein Stern: Kern und acht Strahlen. Für die Sonne und die Marke „stern".',
    koerper: kreis(12, 12, 4.4) + strahlen(12, 12, 8, 6.6, 9.4, 22.5),
  },
  planet: {
    was: 'Ein Körper mit Ring und einer Küstenlinie — ein Planet, die Erde.',
    koerper:
      kreis(12, 11.2, 5.8) +
      '<path d="M8.2 13.4c1.6 1 2.8.2 4.2 1 1.2.7 1.4 2 .8 3"/>' +
      ellipse(12, 13.8, 10.4, 3.1, -18),
  },
  object: {
    was: 'Eine Kugel mit Lichtkante und Krater — ein beliebiger Körper.',
    koerper:
      // **Ohne Äquatorlinie.** Der erste Anlauf zog eine Linie quer durch die Kugel; damit sah sie
      // aus wie ein Verbotszeichen. Was eine Kugel ausmacht, ist die **Lichtkante** — der Rest ist
      // Beiwerk, das bei 15 px nur Unruhe stiftet.
      kreis(12, 12, 7.6) +
      '<path d="M7.4 8.6a6.6 6.6 0 0 1 3.6-2.8"/>' +
      kreis(15.2, 15.4, 1.8),
  },
  'code-file': {
    was: 'Ein Blatt mit geknickter Ecke und zwei Klammern — eine Datei mit Text.',
    koerper:
      '<path d="M13.8 2.8H7A1.8 1.8 0 0 0 5.2 4.6v14.8A1.8 1.8 0 0 0 7 21.2h10a1.8 1.8 0 0 0 1.8-1.8V7.8z"/>' +
      '<path d="M13.8 2.8v5h5"/>' +
      '<path d="M10.4 12.6 8.6 14.8l1.8 2.2M13.6 12.6l1.8 2.2-1.8 2.2"/>',
  },

  // ── Der Zustand ──────────────────────────────────────────────────────────────────────────
  pulse: {
    was: 'Ein Ausschlag in einer ruhigen Linie — „live", ein Messwert, Gesundheit.',
    koerper: '<path d="M2.6 12.4h3.8l2.2-5.8 3.6 11.2 2.4-5.4h6.8"/>',
  },
  spark: {
    was: 'Ein vierzackiger Funke — ein Hinweis, „neu", ein einzelnes Ereignis.',
    koerper:
      '<path d="M12 2.8c.7 4.6 2.6 6.5 7.2 7.2-4.6.7-6.5 2.6-7.2 7.2-.7-4.6-2.6-6.5-7.2-7.2 4.6-.7 6.5-2.6 7.2-7.2z"/>' +
      '<path d="M18.4 16.6c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3z"/>',
  },
  chip: {
    was: 'Ein Baustein mit Anschlüssen — ein Gerät, ein Prozess.',
    koerper:
      rechteck(6.4, 6.4, 11.2, 11.2, 2.2) +
      rechteck(9.8, 9.8, 4.4, 4.4, 1.2) +
      linie(9.8, 3.2, 9.8, 6.4) +
      linie(14.2, 3.2, 14.2, 6.4) +
      linie(9.8, 17.6, 9.8, 20.8) +
      linie(14.2, 17.6, 14.2, 20.8) +
      linie(3.2, 9.8, 6.4, 9.8) +
      linie(3.2, 14.2, 6.4, 14.2) +
      linie(17.6, 9.8, 20.8, 9.8) +
      linie(17.6, 14.2, 20.8, 14.2),
  },
} as const satisfies Readonly<Record<string, Zeichen>>

/** Die Namen aller Zeichen — abgeleitet aus der Tabelle, nicht daneben gepflegt. */
export type IconName = keyof typeof ICONS

/** Alle Namen, in der Reihenfolge der Tabelle. */
export const ICON_NAMES = Object.keys(ICONS) as readonly IconName[]
