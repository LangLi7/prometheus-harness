/**
 * **Das Sternenfeld — erzeugt, nicht gezeichnet.**
 *
 * ## Warum diese Datei `sky.ts` ersetzt
 *
 * Der Betreiber, 16.10.2026: *„keine bilder nutzen lol ;D das macht es doch so laggy ;D, stattdessen
 * kannst du doch quasi die sterne generieren oder anderewaltig machen das es realistisch zoom in and
 * zoom out ist. like star wars schiff beschleunigen verstehst du? das es smooth aussieht und keine
 * stock bilder die nur einfach da steht fps drop ect"*
 *
 * Er hat den Kern getroffen. `sky.ts` erzeugte ein **SVG mit 4 053 `<circle>`** und schob es als
 * Bildebene über die Welt. Das ist ein **Standbild**: es hat keine Tiefe, keine Parallaxe und keine
 * Geschwindigkeit — und es kostete, sobald sich seine Lage ändern sollte, eine Stilberechnung über
 * 4 053 Knoten in **jedem** Bild (gemessen 58,8 ms gegen 0,09 ms; `docs/status/himmel-physik.md` §4.6).
 *
 * Hier entstehen die Sterne stattdessen **als Punkte im Raum**: Zahlenreihen, einmal gerechnet,
 * einmal hochgeladen — danach zeichnet sie die Grafikkarte in **einem** Zug. Daraus folgt alles, was
 * gefehlt hat:
 *
 *   * **Parallaxe.** Die Kamera fährt in Weltkoordinaten (`cameraPosition` = Fokus + Abstand). Sterne
 *     in **endlicher** Entfernung wandern also über das Bild, wenn man fährt — nahe schnell, ferne
 *     langsam. Ein Standbild kann das nicht; ein Punkt im Raum tut es von selbst.
 *   * **Der Beschleunigungseindruck.** Beim Fahren fliegen die Sterne **radial** auseinander — genau
 *     das Bild, das der Betreiber beschreibt („like star wars schiff beschleunigen"). Es ist keine
 *     Animation, sondern die Perspektive.
 *   * **Kein Standbild.** Es gibt kein Bild mehr, das „einfach da steht": es gibt Positionen.
 *
 * ## Was aus `sky.ts` bleibt — weil es Physik ist und nicht Darstellung
 *
 * Die **Helligkeitsklassen** und die **Grenzhelligkeit je Bezugsebene**. Die Verteilung ist keine
 * Erfindung: je eine Größenklasse schwächer sind es rund **viermal** so viele Sterne (3 · 12 · 48 ·
 * 190 · 760 · 3040). Und was man auf einer Ebene noch **sieht**, hängt an der Bezugsebene, nicht am
 * Abstand innerhalb einer Ebene ({@link STERN_GRENZE}).
 *
 * ## Die Verteilung im Raum
 *
 * Richtung **gleichmäßig auf der Kugel**, Radius **logarithmisch** gestreut (gleich viele Sterne je
 * Größenordnung). Beides aus einem Grund: ein Feld in einer dünnen Schale sieht aus wie eine
 * Kugelwand, eines gleichmäßig im Volumen wäre in der Mitte viel dichter und damit als **Wolke um die
 * Kamera** erkennbar. Logarithmisch im Radius ergibt über **alle** Bezugsebenen dieselbe
 * Flächendichte — dieselbe Aussage, die `sky.ts` mit der Plattkarte nachgebaut hat.
 *
 * **Warum mehr Sterne als 4 053.** Von einer Gleichverteilung auf der Kugel liegt nur ein Bruchteil
 * im Blickfeld (58° Öffnung: rund 16 % der Richtungen), und davon wiederum nur der Teil zwischen
 * Nah- und Ferngrenze der Kamera. Die Zahl ist deshalb ein **Vielfaches** der Klassenverteilung
 * ({@link STERN_VIELFACHES}) — nicht, weil mehr schöner ist, sondern weil sonst zu wenige übrig
 * bleiben.
 *
 * @module apps/universe/src/stars
 */

/**
 * **Die Helligkeitsklassen** — Größe, Deckkraft und Anzahl je Klasse.
 *
 * Die Zahlen sind aus `sky.ts` übernommen und **nicht** neu gewürfelt: sie sind der physikalische
 * Teil. Wer sie ändert, ändert die Aussage über den Himmel, nicht das Aussehen.
 *
 * `r` ist die **Seitenlänge im Verhältnis zur Bezugsgröße** — die Oberfläche rechnet daraus die
 * Pixergröße, weil dieselbe Zahl bei jedem Zoom gleich groß *aussehen* soll.
 */
export const STERN_KLASSEN: readonly { readonly r: number; readonly o: number; readonly n: number }[] = [
  { r: 1.0, o: 0.95, n: 3 },
  { r: 0.85, o: 0.82, n: 12 },
  { r: 0.72, o: 0.68, n: 48 },
  { r: 0.6, o: 0.54, n: 190 },
  { r: 0.5, o: 0.4, n: 760 },
  { r: 0.42, o: 0.28, n: 3040 },
]

/**
 * Die Gesamtzahl der Sterne in {@link STERN_KLASSEN} — **gerechnet**, nicht hingeschrieben.
 *
 * Eine zweite Zahl wäre eine zweite Wahrheit, und die erste fiele beim nächsten Ändern der Klassen um.
 */
export const STERN_KLASSEN_ANZAHL = STERN_KLASSEN.reduce((summe, k) => summe + k.n, 0)

/** Wie viele Sterne je Klasse erzeugt werden — die Verteilung, wie sie im Bild ankommt. */
export const STERN_JE_KLASSE: readonly number[] = STERN_KLASSEN.map((k) => Math.round(k.n * 7.4))

/** Die Gesamtzahl der erzeugten Sterne. */
export const STERN_ANZAHL = STERN_JE_KLASSE.reduce((summe, n) => summe + n, 0)

/**
 * Die **Grenzhelligkeit je Bezugsebene** (1 = nur die hellsten, 6 = alle).
 *
 * **Was sie bedeutet.** Auf einer Ebene sieht man nur bis zu einer bestimmten Größenklasse — das ist
 * die Aussage, die der Betreiber vermißt hat („auf jeder Ebene dieselbe Dichte").
 *
 * **Warum sie NICHT vom Abstand innerhalb einer Ebene abhängt.** Die Sterne stehen im Unendlichen;
 * ihre Lage ändert sich mit dem Abstand der Kamera nicht. Geändert wird nicht die Lage, sondern die
 * Grenzhelligkeit — und die gehört in diesem Modell zur **Bezugsebene**. Wer sie stetig haben will,
 * ändert **diese Tabelle**; sie ist die eine Stelle.
 */
export const STERN_GRENZE: readonly number[] = [6, 6, 6, 6, 5, 5, 4, 4, 3, 3, 2, 1]

/**
 * Ein Zufallsgeber, der **immer dasselbe** liefert.
 *
 * **Warum kein `Math.random()`.** Ein Sternenfeld, das bei jedem Laden anders aussieht, ist keine
 * Welt, sondern ein Muster: der Betreiber findet die Stelle nicht wieder, über die er geredet hat,
 * und ein Test kann nichts nachrechnen. Derselbe Same, dieselben Sterne.
 *
 * @param same - der Startwert
 * @returns eine Zahl in `[0, 1)` bei jedem Aufruf
 */
export function zufall(same: number): () => number {
  let zustand = same >>> 0
  return () => {
    zustand = (Math.imul(zustand, 1664525) + 1013904223) >>> 0
    return zustand / 4294967296
  }
}

/**
 * Die Farbe eines Sterns nach seiner Klasse — warm für die hellen, kühl für die schwachen.
 *
 * **Warum das keine Zierde ist.** Ein Sternenfeld in einer einzigen Farbe sieht nach Bildschirm aus,
 * nicht nach Himmel: die hellen Sterne sind in Wirklichkeit rot bis weiß, die schwachen bläulich. Der
 * Unterschied ist klein und macht den Unterschied.
 *
 * @param klasse - 1 … 6
 * @param wuerfel - der Zufallsgeber (für die Streuung innerhalb einer Klasse)
 * @returns die Farbe als drei Zahlen in `[0, 1]`
 */
export function sternFarbe(klasse: number, wuerfel: () => number): readonly [number, number, number] {
  const warm = [1, 0.86, 0.68] as const
  const weiss = [1, 0.97, 0.93] as const
  const kalt = [0.78, 0.86, 1] as const
  const von = klasse <= 2 ? warm : klasse <= 4 ? weiss : kalt
  const bis = klasse <= 2 ? weiss : klasse <= 4 ? warm : weiss
  const t = 0.35 + wuerfel() * 0.5
  return [
    von[0] + (bis[0] - von[0]) * t,
    von[1] + (bis[1] - von[1]) * t,
    von[2] + (bis[2] - von[2]) * t,
  ]
}

/** Ein Stern: Position, Klasse, Farbe — mehr braucht die Grafikkarte nicht. */
export interface Stern {
  readonly x: number
  readonly y: number
  readonly z: number
  /** 1 … 6 — je größer, desto schwächer. */
  readonly klasse: number
  readonly farbe: readonly [number, number, number]
}

/**
 * **Die Sterne erzeugen.**
 *
 * Richtung gleichmäßig auf der Kugel — über einen Würfel mit **Verwerfen** der Außenseite. Die naive
 * Rechnung über zwei Winkel (Azimut und Höhe) würde die **Pole häufen**: dort liegen viele Winkel auf
 * engem Raum, und das Bild zeigt dann zwei Knoten.
 *
 * **Warum `von`/`bis` übergeben werden und nicht hier stehen.** Der Maßstab gehört zum Modell, nicht
 * zum Sternenfeld: die untere Grenze ist die kleinste Bezugsebene, die obere die größte
 * (`MIN_DISTANCE`/`MAX_DISTANCE` in `camera.ts`). Zwei Orte für denselben Maßstab wären zwei
 * Wahrheiten — und die zweite driftet beim nächsten Umbau.
 *
 * @param jeKlasse - wie viele Sterne je Klasse (aus {@link STERN_JE_KLASSE})
 * @param von - kleinster Radius um den Beobachter
 * @param bis - größter Radius um den Beobachter
 * @param zentrum - **wo der Beobachter steht** (der Fokus der Kamera)
 * @param same - Startwert des Zufallsgebers
 * @returns die Sterne, hellste Klasse zuerst
 */
export function sterne(
  jeKlasse: readonly number[],
  von: number,
  bis: number,
  zentrum: readonly [number, number, number] = [0, 0, 0],
  same = 0x2f6e2b1,
): readonly Stern[] {
  const wuerfel = zufall(same)
  const raus: Stern[] = []
  const logVon = Math.log(Math.max(von, 1e-6))
  const logBis = Math.log(Math.max(bis, von * 1.000001))
  for (let k = 0; k < jeKlasse.length; k += 1) {
    const klasse = k + 1
    const anzahl = jeKlasse[k] ?? 0
    for (let i = 0; i < anzahl; i += 1) {
      /*
       * **Die Richtung: würfeln und verwerfen.**
       *
       * Der Würfel liefert nur Richtungen **innerhalb** der Einheitskugel; liegt ein Punkt außerhalb,
       * wird er verworfen und neu gewürfelt. Das ist die einzige einfache Rechnung, die auf der Kugel
       * **gleichmäßig** ist. Die Grenze von 40 Versuchen ist keine Genauigkeit, sondern ein Zaun
       * gegen eine Endlosschleife (die Wahrscheinlichkeit, 40-mal danebenzuliegen, ist
       * (1 − π/6)⁴⁰ ≈ 10⁻¹⁰).
       */
      let x = 0
      let y = 0
      let z = 0
      for (let versuch = 0; versuch < 40; versuch += 1) {
        x = wuerfel() * 2 - 1
        y = wuerfel() * 2 - 1
        z = wuerfel() * 2 - 1
        const q = x * x + y * y + z * z
        if (q <= 1 && q > 1e-4) break
      }
      const laenge = Math.hypot(x, y, z) || 1
      const radius = Math.exp(logVon + wuerfel() * (logBis - logVon))
      raus.push({
        x: zentrum[0] + (x / laenge) * radius,
        y: zentrum[1] + (y / laenge) * radius,
        z: zentrum[2] + (z / laenge) * radius,
        klasse,
        farbe: sternFarbe(klasse, wuerfel),
      })
    }
  }
  return raus
}

/**
 * **Die Sterne als Zahlenreihen für die Grafikkarte.**
 *
 * **Warum vier Reihen und keine Objekte.** Die Grafikkarte liest Zahlen; jedes Objekt müßte beim
 * Hochladen erst wieder ausgepackt werden. `position` und `farbe` haben drei Zahlen je Stern, die
 * übrigen eine — das ist die Form, die `BufferAttribute` erwartet.
 *
 * @param liste - die Sterne
 * @returns die vier Reihen, alle gleich lang (mal drei, wo es Paare sind)
 */
export function sternReihen(liste: readonly Stern[]): {
  readonly position: Float32Array
  readonly farbe: Float32Array
  readonly klasse: Float32Array
} {
  const position = new Float32Array(liste.length * 3)
  const farbe = new Float32Array(liste.length * 3)
  const klasse = new Float32Array(liste.length)
  for (let i = 0; i < liste.length; i += 1) {
    const s = liste[i]
    if (!s) continue
    position[i * 3] = s.x
    position[i * 3 + 1] = s.y
    position[i * 3 + 2] = s.z
    farbe[i * 3] = s.farbe[0]
    farbe[i * 3 + 1] = s.farbe[1]
    farbe[i * 3 + 2] = s.farbe[2]
    klasse[i] = s.klasse
  }
  return { position, farbe, klasse }
}

/**
 * Die Grenzhelligkeit zu einer Bezugsebene (1 … 12).
 *
 * **Warum geklemmt wird.** Der Index kommt aus `levelForDistance` (`camera.ts`). Ein Index außerhalb
 * der Tabelle ergäbe `undefined` — die Grenzhelligkeit stünde auf „nichts sichtbar", und der Himmel
 * wäre schwarz. Ein Fehler, der wie ein leerer Himmel aussieht, ist der teuerste, den dieses Feld
 * haben kann: er sieht aus wie eine Entscheidung.
 *
 * @param ebene - die Bezugsebene
 * @returns die feinste Klasse, die noch zu sehen ist (1 … 6)
 */
export function grenzeFuerEbene(ebene: number): number {
  if (!Number.isFinite(ebene)) return 6
  const i = Math.min(STERN_GRENZE.length, Math.max(1, Math.round(ebene))) - 1
  return STERN_GRENZE[i] ?? 6
}
