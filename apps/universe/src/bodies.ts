/**
 * **Die Körper als SVG** — und die echten Grössenverhältnisse des Sonnensystems.
 *
 * **Was der Betreiber verlangt hat:**
 *
 *   „die sonne sieht nicht wie eine sonne aus und planeten sieht auch nicht real aus nutze svg
 *    bilder passend zur naming des planeten"
 *   „die grösse der planet und Sollar system vorallem mit dem erde sonne ect sollte schon
 *    realistische Relative grösse haben als masstab, diestance ect sieht kurse aus genauso wie
 *    grösse"
 *
 * **Warum SVG und nicht gemalt.** Vorher wurde jeder Körper aus Zufallsflecken einer einzigen Farbe
 * gebaut (`surfaceTexture`). Das Ergebnis war eine Kugel mit Rauschen — der Betreiber hat es
 * gesehen („sieht nicht real aus"). Ein SVG trägt **Zeichnung**: Krater, Wolkenbänder, Polkappen,
 * einen grossen roten Fleck. Es ist eine Datei, es skaliert verlustfrei, und es lässt sich je
 * Körper schreiben statt je Körper zufällig erzeugen.
 *
 * **Die Zahlen sind echte Zahlen.** Radius in Kilometern, Abstand in **AU**, Umlaufzeit in Jahren —
 * für alle acht Planeten, den Mond, die Sonne und die Sonde. Sie stehen hier, damit die Umrechnung
 * **nachprüfbar** ist; eine Kugel mit „etwa so gross" ist keine Angabe.
 *
 * ── Der Massstab, und warum er nicht 1:1 sein kann ───────────────────────────────────────
 *
 * **1:1 ist nicht darstellbar — und zwar aus einem Grund, der sich rechnen lässt.** Die Sonne hat
 * den **109-fachen** Erddurchmesser und den **107-fachen** Erddurchmesser Abstand zur Erde
 * (1 AU = 23 455 Erddurchmesser). Bei 1:1 wäre also:
 *
 *   Sonne           109 Einheiten  →  füllt den halben Bildschirm schon bei Abstand 300
 *   Merkur           0,38 Einheiten →  bei Abstand 3000 weniger als ein Pixel
 *   Neptun-Abstand   30 AE = 703 650 Einheiten →  das Sonnensystem wäre 234 000 Erddurchmesser breit
 *
 * Zwischen dem kleinsten Körper (Merkur, 0,38) und dem äussersten Abstand (703 650) liegt der
 * Faktor **1,8 Millionen**. Kein Bild zeigt beides.
 *
 * **Deshalb: echte Verhältnisse, gestaucht — mit offengelegtem Exponenten.**
 *
 *   Größe     `r = r_erde · (R / R_erde)^0,42`        Sonne 6,8 · Jupiter 2,6 · Erde 1,0 · Merkur 0,66
 *   Abstand   `d = 300 · a^0,42`                      Merkur 113 · Erde 224 · Neptun 1240
 *
 * **Warum 0,42 bei beiden.** Mit **einem** Exponenten für Grösse **und** Abstand bleiben die
 * Verhältnisse **in sich** stimmig: Jupiter ist 11-mal so gross wie die Erde, und die Sonne ist
 * 6,8-mal so gross wie Jupiter — die Reihenfolge und die Abstufung sind echt. Nur die *Steilheit*
 * ist gestaucht.
 *
 * **Der Preis, ehrlich gesagt:** mit 0,42 liegt Neptun **nicht** 30-mal weiter draussen als die
 * Erde, sondern 5,5-mal. Die inneren Planeten bekommen dadurch mehr Platz, als ihnen real zusteht.
 * Das ist der Tausch, den jedes Modell eines Sonnensystems eingeht: **Sichtbarkeit gegen Verhältnis.**
 * Wer ihn nicht will, setzt den Exponenten auf 1 — dann ist es 1:1, und man sieht die Sonne und
 * sonst nichts.
 */

/** Ein Körper, wie er gezeichnet wird. */
export interface BodyLook {
  /** Kennung aus den Daten (`id`), z. B. `sun`, `erde`, `jupiter`. */
  readonly svg: string
  /** Ring um den Körper — nur Saturn hat einen. */
  readonly ring?: boolean
  /**
   * Wie stark der Körper leuchtet (0 = matt, 1 = strahlt).
   *
   * Nur die Sonne hat hier etwas anderes als 0. Ein Planet, der leuchtet, ist keine Kugel mehr,
   * sondern eine Lampe.
   */
  readonly glow: number
}

/**
 * Der Exponent für den **Abstand**.
 *
 * **Warum zwei Exponenten statt einem.** Ein gemeinsamer Wert war der erste Versuch — er hält die
 * Verhältnisse *in sich* stimmig, macht die Sonne aber **unsichtbar**:
 *
 *   `r_sonne = (696340 / 6371)^0,42 = 7,2` Einheiten. Bei einem Bildabstand von 6650 Einheiten sind
 *   das **1,5 Pixel**. Im gemessenen Bild war die Sonne ein Punkt, und das Sonnensystem bestand aus
 *   Bahnen und Beschriftungen.
 *
 * **Die beiden Grössen haben zwei verschiedene Aufgaben.** Der Abstand muss **alles ins Bild
 * bringen** — er darf flach sein. Die Grösse muss **jeden Körper sichtbar** machen — sie darf es
 * nicht. Also zwei Zahlen.
 */
export const SCALE_EXPONENT = 0.42

/** Der Exponent für die **Grösse** allein — steiler, damit die Sonne kein Punkt ist. */
export const SIZE_EXPONENT = 0.75

/** Der Abstand der Erde in Einheiten. 1 AE wird so breit gezeichnet. */
export const EARTH_DISTANCE = 300

/**
 * Die Groesse der **Sonne** in Welteneinheiten.
 *
 * **Warum sie nicht aus dem Exponenten kommt.** (696340/6371)^0,75 ergibt **13,4** — und bei
 * einem Bildabstand von 4761 sind das **9 Pixel**. Gemessen war die Sonne ein Punkt, und das
 * ganze System bestand aus Bahnen.
 *
 * **Das ist eine Eigenschaft der gestauchten Abstaende.** Neptun liegt hier bei **4,2-fachem**
 * Erdenabstand statt beim 30-fachen: die Abstaende sind stark komprimiert, die Groessen also
 * **relativ zu klein**. Wer die Sonne sichtbar machen will, muss sie relativ zum **Abstand**
 * setzen — nicht zum Erdenradius.
 *
 * **Der Wert:** 100 Einheiten sind **8 %** des Erdenabstands (300). In den bekannten
 * Darstellungen des Sonnensystems nimmt die Sonne 5 bis 10 % ein. Die echten 109 Erddurchmesser
 * waeren hier das **36-fache** — und dann fuellte sie bei diesem Abstand die halbe Hoehe.
 */
export const SUN_RADIUS = 100

/** Merkur: der kleinste Planet, und der nächste an der Sonne. */
export interface PlanetFacts {
  /** Radius in Kilometern. */
  readonly radiusKm: number
  /** Grosse Bahnhalbachse in **Astronomischen Einheiten**. */
  readonly au: number
  /** Umlaufzeit in **Jahren** — die echte, für die Bewegung. */
  readonly periodYears: number
}

/**
 * Die echten Zahlen des Sonnensystems.
 *
 * Quellen sind die üblichen Mittelwerte; für einen Prototyp zählt, dass die **Verhältnisse** stimmen
 * und die Herkunft nachprüfbar ist. Wer eine Zahl ändert, ändert damit auch das Bild — deshalb steht
 * sie hier und nicht in der Zeichenfunktion.
 */
export const SOLAR_FACTS: Readonly<Record<string, PlanetFacts>> = {
  sonne: { radiusKm: 696_340, au: 0, periodYears: 1 },
  merkur: { radiusKm: 2_440, au: 0.387, periodYears: 0.241 },
  venus: { radiusKm: 6_052, au: 0.723, periodYears: 0.615 },
  erde: { radiusKm: 6_371, au: 1, periodYears: 1 },
  mond: { radiusKm: 1_737, au: 0, periodYears: 0.0748 },
  mars: { radiusKm: 3_390, au: 1.524, periodYears: 1.881 },
  jupiter: { radiusKm: 69_911, au: 5.203, periodYears: 11.86 },
  saturn: { radiusKm: 58_232, au: 9.537, periodYears: 29.46 },
  uranus: { radiusKm: 25_362, au: 19.19, periodYears: 84.01 },
  neptun: { radiusKm: 24_622, au: 30.07, periodYears: 164.8 },
  voyager: { radiusKm: 13, au: 40, periodYears: 200 },
}

const ERDE_RADIUS_KM = 6_371

/**
 * Der Radius eines Körpers in **Welteneinheiten**.
 *
 * `(r / r_erde)^0,42` — die Erde ist **1**, die Sonne **6,8**, Merkur **0,66**. Wer einen Körper
 * nicht in der Tabelle hat (Platzhalter des Projekt-Stapels), bekommt seinen Wert aus den Daten.
 */
export function relativeRadius(nameOrId: string, fallback: number): number {
  const facts = factsFor(nameOrId)
  if (!facts) return fallback
  return Math.pow(facts.radiusKm / ERDE_RADIUS_KM, SIZE_EXPONENT)
}

/**
 * Der Bahnabstand in **Welteneinheiten**.
 *
 * `300 · a^0,42`. Die Erde liegt bei 300, Merkur bei 178, Neptun bei 1240. Wer keinen Abstand in
 * der Tabelle hat, bekommt `null` — dann gilt der Abstand aus den Daten.
 */
export function relativeDistance(nameOrId: string): number | null {
  const facts = factsFor(nameOrId)
  if (!facts || facts.au <= 0) return null
  return EARTH_DISTANCE * Math.pow(facts.au, SCALE_EXPONENT)
}

/**
 * Findet die Zahlen zu einem Namen — **gross- und kleingeschrieben, deutsch und englisch**.
 * Die Daten dieses Prototyps tragen deutsche Namen (`Erde`, `Sonne`); die Zeichnungen sind nach
 * Planeten benannt. Wer hier eine Zuordnung vergisst, bekommt einen nackten grauen Körper — und
 * genau das sieht aus wie ein Fehler, ohne einer zu sein.
 */
export function factsFor(nameOrId: string): PlanetFacts | null {
  const schluessel = nameOrId.trim().toLowerCase().replace(/[^a-zäöü]/g, '')
  const aliase: Readonly<Record<string, string>> = {
    sun: 'sonne',
    sol: 'sonne',
    sonne: 'sonne',
    mercury: 'merkur',
    merkur: 'merkur',
    venus: 'venus',
    earth: 'erde',
    erde: 'erde',
    moon: 'mond',
    mond: 'mond',
    mars: 'mars',
    jupiter: 'jupiter',
    saturn: 'saturn',
    uranus: 'uranus',
    neptune: 'neptun',
    neptun: 'neptun',
    voyager: 'voyager',
    voyager1: 'voyager',
    sonde: 'voyager',
  }
  const ziel = aliase[schluessel]
  return ziel ? (SOLAR_FACTS[ziel] ?? null) : null
}

/**
 * Die Zeichnungen — **je Körper eine eigene**, wie vom Betreiber verlangt („passend zur naming").
 *
 * Jede ist bewusst als **Textur** gedacht: `preserveAspectRatio="none"` und ein Verhältnis von 2:1
 * (wie eine Weltkarte), damit sie auf einer Kugel liegt, ohne zu verzerren.
 */
export const BODY_SVG: Readonly<Record<string, string>> = {
  sonne: sonneSvg(),
  merkur: merkurSvg(),
  venus: venusSvg(),
  erde: erdeSvg(),
  mond: mondSvg(),
  mars: marsSvg(),
  jupiter: jupiterSvg(),
  saturn: saturnSvg(),
  uranus: uranusSvg(),
  neptun: neptunSvg(),
}

/** Der Kopf, den jede Zeichnung braucht — sonst zeichnet der Browser sie nicht. */
function kopf(inhalt: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 256" preserveAspectRatio="none" width="512" height="256">${inhalt}</svg>`
}

/**
 * **Die Sonne.**
 *
 * Drei Dinge machen eine Sonne aus, und alle drei fehlten vorher: **Körnung** (die Oberfläche ist
 * nicht glatt), **Flecken** (dunklere Stellen) und **der Rand** — aussen heller, weil man dort
 * tangential in die Atmosphäre schaut. Ohne den Rand sieht eine Kugel aus wie ein Ball.
 */
function sonneSvg(): string {
  return kopf(`
    <defs>
      <radialGradient id="kern" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fff6d8"/>
        <stop offset="55%" stop-color="#ffd24a"/>
        <stop offset="88%" stop-color="#ff9a1f"/>
        <stop offset="100%" stop-color="#ff7a08"/>
      </radialGradient>
      <filter id="korn">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="7"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
    </defs>
    <rect width="512" height="256" fill="url(#kern)"/>
    <rect width="512" height="256" filter="url(#korn)" opacity="0.28" style="mix-blend-mode:overlay"/>
    <g fill="#c85a00" opacity="0.5">
      <ellipse cx="120" cy="90" rx="26" ry="16"/>
      <ellipse cx="300" cy="170" rx="34" ry="18"/>
      <ellipse cx="420" cy="80" rx="18" ry="12"/>
    </g>
    <g fill="#fff3c4" opacity="0.35">
      <ellipse cx="220" cy="60" rx="40" ry="14"/>
      <ellipse cx="70" cy="200" rx="30" ry="12"/>
    </g>`)
}

/** Merkur: grau, **viele Krater**, keine Atmosphäre — die Oberfläche ist alt und zernarbt. */
function merkurSvg(): string {
  const krater: string[] = []
  let seed = 11
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let i = 0; i < 90; i++) {
    const x = (rnd() * 512).toFixed(0)
    const y = (rnd() * 256).toFixed(0)
    const r = (2 + rnd() * 9).toFixed(1)
    krater.push(
      `<circle cx="${x}" cy="${y}" r="${r}" fill="#6b6660" opacity="0.55"/>` +
        `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#a8a29a" stroke-width="0.8" opacity="0.5"/>`,
    )
  }
  return kopf(`
    <defs>
      <radialGradient id="m" cx="40%" cy="35%" r="75%">
        <stop offset="0%" stop-color="#b9b2a8"/>
        <stop offset="60%" stop-color="#8e877e"/>
        <stop offset="100%" stop-color="#5d574f"/>
      </radialGradient>
    </defs>
    <rect width="512" height="256" fill="url(#m)"/>
    ${krater.join('')}`)
}

/** Venus: dichte Wolkendecke, hellgelb — **keine sichtbare Oberfläche**, nur Wolkenbänder. */
function venusSvg(): string {
  return kopf(`
    <defs>
      <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f6e3a8"/>
        <stop offset="45%" stop-color="#e8c877"/>
        <stop offset="100%" stop-color="#c9a24f"/>
      </linearGradient>
    </defs>
    <rect width="512" height="256" fill="url(#v)"/>
    <g fill="none" stroke="#fff2c9" stroke-width="7" opacity="0.5">
      <path d="M0 60 Q128 40 256 62 T512 58"/>
      <path d="M0 118 Q140 96 268 120 T512 112"/>
      <path d="M0 182 Q120 164 264 186 T512 176"/>
    </g>
    <g fill="#b98f3c" opacity="0.25">
      <ellipse cx="150" cy="150" rx="90" ry="26"/>
      <ellipse cx="390" cy="80" rx="70" ry="20"/>
    </g>`)
}

/**
 * Die **Erde**.
 *
 * Der einzige Körper, bei dem die Zeichnung wiedererkennbar sein **muss**: blaue Ozeane, grüne und
 * braune Landmassen, weisse Wolken und die Polkappen. Wer die Erde nicht erkennt, erkennt das
 * Sonnensystem nicht.
 */
function erdeSvg(): string {
  return kopf(`
    <defs>
      <linearGradient id="ozean" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1b4f8f"/>
        <stop offset="50%" stop-color="#1d6bb5"/>
        <stop offset="100%" stop-color="#123c6e"/>
      </linearGradient>
    </defs>
    <rect width="512" height="256" fill="url(#ozean)"/>
    <!-- Landmassen: grob, aber in der richtigen Lage (Afrika/Europa mittig, Amerika links) -->
    <g fill="#2f7a3a">
      <path d="M40 70 q60 -22 120 4 q30 14 20 44 q-8 30 -50 44 q-46 16 -74 -12 q-24 -28 -16 -80z"/>
      <path d="M150 150 q40 -10 56 26 q14 34 -14 58 q-30 26 -58 -6 q-22 -28 16 -78z"/>
      <path d="M300 60 q70 -18 118 10 q34 22 22 62 q-12 40 -66 40 q-58 0 -78 -34 q-16 -46 4 -78z"/>
      <path d="M352 168 q40 -8 56 22 q10 30 -22 40 q-38 10 -48 -22 q-6 -30 14 -40z"/>
      <path d="M228 40 q40 -14 66 8 q18 16 4 34 q-18 22 -52 12 q-30 -10 -18 -54z"/>
    </g>
    <g fill="#8a7a45" opacity="0.55">
      <ellipse cx="120" cy="120" rx="34" ry="18"/>
      <ellipse cx="368" cy="96" rx="40" ry="16"/>
      <ellipse cx="196" cy="200" rx="26" ry="12"/>
    </g>
    <!-- Polkappen -->
    <rect width="512" height="16" fill="#eef6ff" opacity="0.9"/>
    <rect y="240" width="512" height="16" fill="#eef6ff" opacity="0.9"/>
    <!-- Wolken -->
    <g fill="#ffffff" opacity="0.42">
      <ellipse cx="90" cy="46" rx="70" ry="14"/>
      <ellipse cx="280" cy="140" rx="86" ry="16"/>
      <ellipse cx="430" cy="210" rx="64" ry="13"/>
      <ellipse cx="200" cy="30" rx="50" ry="10"/>
    </g>`)
}

/** Der Mond: grau, **Krater**, grosse dunkle „Meere" — die Maria, die man von der Erde sieht. */
function mondSvg(): string {
  const krater: string[] = []
  let seed = 23
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let i = 0; i < 110; i++) {
    const x = (rnd() * 512).toFixed(0)
    const y = (rnd() * 256).toFixed(0)
    const r = (1.5 + rnd() * 8).toFixed(1)
    krater.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="#9a958d" opacity="0.5"/>`)
  }
  return kopf(`
    <rect width="512" height="256" fill="#b5b0a6"/>
    <g fill="#7d786f" opacity="0.62">
      <ellipse cx="140" cy="96" rx="72" ry="52"/>
      <ellipse cx="300" cy="150" rx="86" ry="58"/>
      <ellipse cx="420" cy="70" rx="56" ry="40"/>
    </g>
    ${krater.join('')}`)
}

/** Mars: **rostrot**, Polkappen und dunklere Regionen — der bekannteste Planet nach der Erde. */
function marsSvg(): string {
  return kopf(`
    <defs>
      <linearGradient id="ma" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#d9723c"/>
        <stop offset="50%" stop-color="#b8501f"/>
        <stop offset="100%" stop-color="#8c3a13"/>
      </linearGradient>
    </defs>
    <rect width="512" height="256" fill="url(#ma)"/>
    <g fill="#7a2f10" opacity="0.45">
      <ellipse cx="180" cy="130" rx="110" ry="54"/>
      <ellipse cx="400" cy="90" rx="70" ry="36"/>
    </g>
    <g fill="#e8a878" opacity="0.4">
      <ellipse cx="300" cy="60" rx="80" ry="18"/>
      <ellipse cx="90" cy="200" rx="60" ry="16"/>
    </g>
    <!-- Polkappen aus Eis -->
    <ellipse cx="256" cy="6" rx="90" ry="20" fill="#f4f8ff" opacity="0.85"/>
    <ellipse cx="256" cy="252" rx="70" ry="16" fill="#f4f8ff" opacity="0.75"/>`)
}

/** Jupiter: **Bänder** und der **grosse rote Fleck** — ohne die ist es keine Jupiterzeichnung. */
function jupiterSvg(): string {
  return kopf(`
    <defs>
      <linearGradient id="ju" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#d8c3a5"/>
        <stop offset="30%" stop-color="#c9a978"/>
        <stop offset="60%" stop-color="#e6d6bb"/>
        <stop offset="100%" stop-color="#b99a6a"/>
      </linearGradient>
    </defs>
    <rect width="512" height="256" fill="url(#ju)"/>
    <g opacity="0.55">
      <rect y="24" width="512" height="14" fill="#a8834f"/>
      <rect y="60" width="512" height="20" fill="#8f6a3c"/>
      <rect y="108" width="512" height="12" fill="#a8834f"/>
      <rect y="150" width="512" height="22" fill="#7d5a30"/>
      <rect y="200" width="512" height="14" fill="#a8834f"/>
      <rect y="232" width="512" height="10" fill="#8f6a3c"/>
    </g>
    <g opacity="0.3" fill="#fff2dc">
      <rect y="44" width="512" height="6"/>
      <rect y="132" width="512" height="6"/>
      <rect y="184" width="512" height="6"/>
    </g>
    <!-- Der grosse rote Fleck: ein Sturm, seit Jahrhunderten -->
    <ellipse cx="330" cy="168" rx="58" ry="28" fill="#b34a2a" opacity="0.85"/>
    <ellipse cx="330" cy="168" rx="40" ry="16" fill="#d06a44" opacity="0.7"/>`)
}

/** Saturn: **blasse Bänder**, und den Ring zeichnet der Aufrufer (er liegt vor der Kugel). */
function saturnSvg(): string {
  return kopf(`
    <defs>
      <linearGradient id="sa" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f0e2c0"/>
        <stop offset="45%" stop-color="#dcc596"/>
        <stop offset="100%" stop-color="#bda571"/>
      </linearGradient>
    </defs>
    <rect width="512" height="256" fill="url(#sa)"/>
    <g opacity="0.35">
      <rect y="58" width="512" height="18" fill="#c2a878"/>
      <rect y="120" width="512" height="16" fill="#b89a68"/>
      <rect y="182" width="512" height="18" fill="#c2a878"/>
    </g>
    <g opacity="0.22" fill="#fff6e0">
      <rect y="40" width="512" height="6"/>
      <rect y="146" width="512" height="6"/>
    </g>`)
}

/** Uranus: **blass türkis** und fast einfarbig — Methan in der Atmosphäre, kaum Struktur. */
function uranusSvg(): string {
  return kopf(`
    <defs>
      <linearGradient id="ur" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#bfeef2"/>
        <stop offset="50%" stop-color="#94d8de"/>
        <stop offset="100%" stop-color="#6fb7c2"/>
      </linearGradient>
    </defs>
    <rect width="512" height="256" fill="url(#ur)"/>
    <g opacity="0.18" fill="#ffffff">
      <rect y="86" width="512" height="14"/>
      <rect y="160" width="512" height="11"/>
    </g>`)
}

/** Neptun: **tiefes Blau**, mit einem dunklen Fleck — wie auf den Voyager-Bildern. */
function neptunSvg(): string {
  return kopf(`
    <defs>
      <linearGradient id="ne" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#5b86d6"/>
        <stop offset="50%" stop-color="#2f57b0"/>
        <stop offset="100%" stop-color="#1c3a80"/>
      </linearGradient>
    </defs>
    <rect width="512" height="256" fill="url(#ne)"/>
    <g opacity="0.25" fill="#9dc0ff">
      <rect y="70" width="512" height="12"/>
      <rect y="150" width="512" height="10"/>
    </g>
    <ellipse cx="200" cy="150" rx="52" ry="26" fill="#16306e" opacity="0.8"/>
    <g opacity="0.3" fill="#ffffff">
      <ellipse cx="380" cy="70" rx="40" ry="9"/>
    </g>`)
}

/**
 * Der **Ring des Saturn** — als Textur mit **Lücken**.
 *
 * Ein Ring ist kein einfarbiger Reifen: die Cassini-Teilung trennt zwei Ringe sichtbar, und die
 * innere Kante ist dichter als die äussere. Ein glatter Ring sieht aus wie ein Unterteller.
 */
export function saturnRingSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 16" preserveAspectRatio="none" width="256" height="16">
    <defs>
      <linearGradient id="ring" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#00000000"/>
        <stop offset="12%" stop-color="#cdbb96" stop-opacity="0.75"/>
        <stop offset="42%" stop-color="#e4d6b4" stop-opacity="0.95"/>
        <stop offset="52%" stop-color="#3a3428" stop-opacity="0.25"/>
        <stop offset="58%" stop-color="#efe4c8" stop-opacity="0.9"/>
        <stop offset="86%" stop-color="#b8a684" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="#00000000"/>
      </linearGradient>
    </defs>
    <rect width="256" height="16" fill="url(#ring)"/></svg>`
}

/**
 * Findet die Zeichnung zu einem Körper.
 *
 * **Deutsch und englisch, Name und Kennung** — dieselbe Zuordnung wie bei den Zahlen. Fehlt sie,
 * gibt es **keine** Zeichnung: dann zeichnet der Aufrufer die Farbe aus den Daten. Ein grauer Körper
 * ist ehrlicher als ein falsch beschrifteter.
 */
/**
 * **Die Zeichnungen der Zusammenfassungen — nach der ART des Objekts.**
 *
 * **Warum es sie gibt.** Der Betreiber: „nutze svg bilder passend zur naming des planeten". Für die
 * Planeten war das erledigt; die **Zusammenfassungen** hatten keine. Und die sind auf den groben
 * Ebenen das Einzige, was man sieht: auf Ebene 7 steht dort **ein** Körper, der „kosmischer
 * Überblick" mit 9000 Einheiten Radius. Gemessen war er ein **dunkelgrüner Ball von 20 px** —
 * `surfaceMaterial` ist unbeleuchtet schwarz, und ohne Zeichnung hat er keine Struktur.
 *
 * Der Betreiber hat es gesehen: „da fehlt galaxie".
 *
 * **Warum nach `kind` und nicht nach Name.** Ein Name ist eine Beschriftung, die sich ändern darf;
 * die Art steht in den Daten (`universe.ts`: „Was dieses Objekt im Projekt bedeutet"). Die Arten des
 * Beispiels sind gemessen: `Alles`, `Projekt`, `Gruppe`, `Schaustück`, `Platzhalter`, `Datei` — dazu
 * `Stern`, `Planet`, `Mond`, `Sonde` für die Körper, die ihre Zeichnung schon haben.
 *
 * **Warum eine galaktische Scheibe und kein Foto.** Dasselbe Argument wie bei den Planeten: keine
 * zufällige Flecken, sondern eine **gezeichnete** Struktur — Kern, zwei Spiralarme, Staubbänder.
 * Sie ist bei jeder Grösse dieselbe, und sie ist verlustfrei skalierbar.
 */
export function aggregateSvg(kind: string): string | null {
  switch (kind) {
    case 'Alles':
      return galaxieSvg()
    case 'Projekt':
      return projektSvg()
    case 'Gruppe':
      return gruppeSvg()
    case 'Schaustück':
      return schaustueckSvg()
    case 'Platzhalter':
      return platzhalterSvg()
    case 'Datei':
      return dateiSvg()
    /*
     * ══ DIE UMSCHLÄGE ═══════════════════════════════════════════════════════════════════════════
     *
     * **Der Befund, der diese fünf Fälle erzwungen hat.** Am 15.10.2026 schaltete der Betreiber die
     * Anzeige ein und fragte: *„interessante weisse hat es trotzdem planeten oder kugel idk
     * gespawn??"* — er sah **zwei Kugeln** in einem sonst leeren Raum, eine große **einfarbig graue**
     * und eine kleinere mit Flecken.
     *
     * **Nachgemessen, nicht geraten.** Die beiden sind die **Umschläge der Ebene**: `planetensystem`
     * (Ebene 5) und `projekt-stack` (Ebene 6) — genau zwei Körper, so viele zeichnet diese Ebene
     * (`tools/…`, `blend().fine` = 2). Und der Unterschied zwischen ihnen stand in **dieser** Liste:
     * `Gruppe` hatte eine Zeichnung (`gruppeSvg`), `Planetensystem` **nicht** — und ohne Zeichnung
     * zeichnet der Aufrufer nur die **Farbe aus den Daten**: eine Kugel ohne jede Struktur.
     *
     * **Fünf von sechs Umschlägen fehlten.** Die Arten entstehen in `universe.ts` aus dem Namen der
     * Stufe (`umschlag(…, 'Planetensystem', …)`) — und die Liste hier kannte sie nicht. Das fiel
     * niemandem auf, weil ein einfarbiger Körper **nicht falsch aussieht**, sondern nur **leer**.
     *
     * **Und warum jetzt jede Stufe ihr eigenes Bild hat.** Die fünf sind **nicht** dieselbe Zeichnung
     * in fünf Größen: was man sieht, soll sagen, **wie groß** man gerade denkt — ein System mit
     * Bahnen, ein Haufen aus Sternen, eine Gruppe aus Galaxien, ein Haufen aus Galaxien, ein Netz aus
     * Haufen. Wer die Stufen verwechselt, sieht es am Bild.
     */
    case 'Planetensystem':
      return planetensystemSvg()
    case 'Sternhaufen':
      return sternhaufenSvg()
    case 'Galaxiengruppe':
      return galaxiengruppeSvg()
    case 'Galaxienhaufen':
      return galaxienhaufenSvg()
    case 'Superhaufen':
      return superhaufenSvg()
    default:
      // Keine Zeichnung: dann zeichnet der Aufrufer die Farbe aus den Daten. Ein einfarbiger Körper
      // ist ehrlicher als ein falsch beschrifteter — **aber er soll die Ausnahme sein, nicht die
      // Regel**: `tests/bodies.test.ts` prüft, daß jede Art, die im Universum vorkommt, ein Bild hat.
      return null
  }
}

/** Die Kopfzeile, die jede Zeichnung braucht — sonst zeichnet der Browser sie nicht. */
function kopfQuadratic(inhalt: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" preserveAspectRatio="none" width="256" height="256">${inhalt}</svg>`
}

/**
 * **Die Galaxie** — Kern, zwei Spiralarme, Staub.
 *
 * Eine Draufsicht, wie man sie kennt: heller Kern, davon ausgehend zwei Arme, die sich nach aussen
 * verjüngen. Dazwischen dunkle Bänder, damit die Arme **getrennt** erscheinen und nicht als Scheibe.
 */
function galaxieSvg(): string {
  const stern = (x: number, y: number, r: number, o: number) =>
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#ffffff" opacity="${o.toFixed(2)}"/>`
  // Zwei Arme, jeder aus Punkten, die nach aussen dünner und blasser werden.
  let arm = ''
  for (let i = 0; i < 90; i++) {
    const t = i / 90
    const winkel = t * Math.PI * 2.4
    const radius = 14 + t * 112
    // Der zweite Arm liegt um 180° versetzt.
    for (const versatz of [0, Math.PI]) {
      const x = 128 + Math.cos(winkel + versatz) * radius
      const y = 128 + Math.sin(winkel + versatz) * radius * 0.62
      arm += stern(x, y, 3.4 - t * 2.2, 0.85 - t * 0.55)
    }
  }
  return kopfQuadratic(`
    <defs>
      <radialGradient id="kern" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fffdf3"/>
        <stop offset="22%" stop-color="#ffe9a8"/>
        <stop offset="52%" stop-color="#ffb64d" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#3fb970" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="256" height="256" fill="#05070a"/>
    <ellipse cx="128" cy="128" rx="124" ry="78" fill="#7fd4ff" opacity="0.05"/>
    ${arm}
    <ellipse cx="128" cy="128" rx="46" ry="28" fill="url(#kern)"/>
    <ellipse cx="128" cy="128" rx="15" ry="10" fill="#fffdf3"/>
  `)
}

/** **Ein Projekt** — ein Bündel: mehrere Teile um einen Kern. */
function projektSvg(): string {
  return kopfQuadratic(`
    <defs>
      <radialGradient id="p" cx="50%" cy="50%" r="55%">
        <stop offset="0%" stop-color="#dff3ff"/>
        <stop offset="60%" stop-color="#5aa9e6" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="#123047" stop-opacity="0.15"/>
      </radialGradient>
    </defs>
    <rect width="256" height="256" fill="#05070a"/>
    <ellipse cx="128" cy="128" rx="118" ry="98" fill="url(#p)"/>
    <circle cx="128" cy="128" r="26" fill="#eaf6ff"/>
    <circle cx="70" cy="86" r="13" fill="#9fd0f0" opacity="0.9"/>
    <circle cx="190" cy="92" r="11" fill="#9fd0f0" opacity="0.8"/>
    <circle cx="84" cy="184" r="10" fill="#9fd0f0" opacity="0.75"/>
    <circle cx="182" cy="178" r="12" fill="#9fd0f0" opacity="0.85"/>
  `)
}

/** **Eine Gruppe** — mehrere gleiche Teile, ohne festen Kern. */
function gruppeSvg(): string {
  let punkte = ''
  for (let i = 0; i < 12; i++) {
    const winkel = (i / 12) * Math.PI * 2
    const r = 34 + (i % 3) * 18
    punkte += `<circle cx="${(128 + Math.cos(winkel) * r).toFixed(1)}" cy="${(128 + Math.sin(winkel) * r).toFixed(1)}" r="${(7 - (i % 3) * 1.5).toFixed(1)}" fill="#ffd9a0" opacity="${(0.85 - (i % 3) * 0.15).toFixed(2)}"/>`
  }
  return kopfQuadratic(`
    <rect width="256" height="256" fill="#0a0705"/>
    <ellipse cx="128" cy="128" rx="96" ry="96" fill="#ff9a1f" opacity="0.10"/>
    ${punkte}
  `)
}

/*
 * ══ DIE FÜNF UMSCHLÄGE ══════════════════════════════════════════════════════════════════════════
 *
 * **Was ein Umschlag ist.** `universe.ts` baut für jede Stufe zwischen den echten Größen einen Knoten,
 * der nur zusammenfasst (`umschlag(…)`) — vom Planetensystem (Ebene 5) bis zum kosmischen Überblick
 * (Ebene 12). Seine **Art** ist der Name der Stufe, und bis zum 15.10.2026 kannte diese Datei fünf
 * davon **nicht**: sie wurden als **einfarbige Kugeln** gezeichnet. Der Betreiber hat genau das
 * gesehen und gefragt, was da „gespawnt" sei.
 *
 * **Warum fünf eigene Zeichnungen und nicht eine mit einem Parameter.** Die fünf sagen fünf
 * verschiedene Dinge über den **Maßstab**: ein System hat **Bahnen**, ein Haufen hat **Sterne**, eine
 * Galaxiengruppe hat **wenige** Galaxien, ein Galaxienhaufen **viele**, und ein Superhaufen ist ein
 * **Netz** aus Haufen. Eine gemeinsame Zeichnung mit anderer Dichte wäre in Wahrheit dieselbe Aussage
 * — und wer die Stufen verwechselt, sähe es nicht.
 *
 * **Alle bleiben bei 256 × 256 und `preserveAspectRatio="none"`** (`kopfQuadratic`): die Textur wird
 * auf eine Kugel gelegt, und ein anderes Maß würde sie verzerren.
 */

/** **Ein Planetensystem** — ein Stern mit Bahnen und Körpern darauf. */
function planetensystemSvg(): string {
  let bahnen = ''
  for (let i = 0; i < 3; i++) {
    const rx = 52 + i * 26
    const ry = 18 + i * 9
    bahnen += `<ellipse cx="128" cy="128" rx="${String(rx)}" ry="${String(ry)}" fill="none" stroke="#ffce7a" stroke-width="${(1.6 - i * 0.3).toFixed(1)}" opacity="${(0.5 - i * 0.12).toFixed(2)}"/>`
    // Und ein Körper auf jeder Bahn — an wechselnden Stellen, damit die Bahnen nicht wie Ringe wirken.
    const winkel = (i * 2.1) % (Math.PI * 2)
    bahnen += `<circle cx="${(128 + Math.cos(winkel) * rx).toFixed(1)}" cy="${(128 + Math.sin(winkel) * ry).toFixed(1)}" r="${(6 - i).toFixed(1)}" fill="#fffdf3" opacity="0.9"/>`
  }
  return kopfQuadratic(`
    <defs>
      <radialGradient id="ps" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="35%" stop-color="#ffd27a" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="#8a4a00" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="256" height="256" fill="#07050a"/>
    <ellipse cx="128" cy="128" rx="104" ry="104" fill="#ff9a1f" opacity="0.07"/>
    ${bahnen}
    <circle cx="128" cy="128" r="34" fill="url(#ps)"/>
    <circle cx="128" cy="128" r="12" fill="#fffdf3"/>
  `)
}

/** **Ein Sternhaufen** — viele Sterne dicht beieinander, ohne Mitte. */
function sternhaufenSvg(): string {
  let sterne = ''
  for (let i = 0; i < 44; i++) {
    // Eine Spirale: aussen dünner besetzt als innen — so sieht ein Haufen aus und nicht wie Rauschen.
    const t = i / 44
    const winkel = t * Math.PI * 7.2
    const r = 10 + t * 100
    const x = 128 + Math.cos(winkel) * r
    const y = 128 + Math.sin(winkel) * r * 0.92
    sterne += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(4.4 - t * 2.6).toFixed(1)}" fill="#ffe6bd" opacity="${(0.95 - t * 0.5).toFixed(2)}"/>`
  }
  return kopfQuadratic(`
    <rect width="256" height="256" fill="#0a0806"/>
    <ellipse cx="128" cy="128" rx="92" ry="88" fill="#ff9a1f" opacity="0.08"/>
    ${sterne}
  `)
}

/** **Eine Galaxiengruppe** — wenige Galaxien, jede ein kleiner Wirbel. */
function galaxiengruppeSvg(): string {
  const wirbel = (mx: number, my: number, r: number, o: number) => {
    let arme = ''
    for (let i = 0; i < 22; i++) {
      const t = i / 22
      const winkel = t * Math.PI * 2.2 + mx
      const radius = r * (0.2 + t * 0.9)
      arme += `<circle cx="${(mx + Math.cos(winkel) * radius).toFixed(1)}" cy="${(my + Math.sin(winkel) * radius).toFixed(1)}" r="${(2.4 - t * 1.4).toFixed(1)}" fill="#cfe4ff" opacity="${(o - t * o * 0.6).toFixed(2)}"/>`
    }
    return `<circle cx="${String(mx)}" cy="${String(my)}" r="${(r * 0.22).toFixed(1)}" fill="#ffffff" opacity="${o.toFixed(2)}"/>${arme}`
  }
  return kopfQuadratic(`
    <rect width="256" height="256" fill="#04060a"/>
    <ellipse cx="128" cy="128" rx="110" ry="96" fill="#5aa9e6" opacity="0.10"/>
    <ellipse cx="128" cy="128" rx="76" ry="68" fill="#9fd0f0" opacity="0.07"/>
    ${wirbel(92, 104, 46, 1)}
    ${wirbel(170, 148, 34, 0.85)}
    ${wirbel(112, 186, 26, 0.7)}
  `)
}

/** **Ein Galaxienhaufen** — viele Galaxien, dichter, mit einem hellen Kern. */
function galaxienhaufenSvg(): string {
  let wirbel = ''
  for (let i = 0; i < 14; i++) {
    const t = i / 14
    const winkel = t * Math.PI * 4.4
    const r = 26 + t * 90
    const mx = 128 + Math.cos(winkel) * r
    const my = 128 + Math.sin(winkel) * r * 0.88
    // Jede Galaxie ist ein Punkt mit einem kurzen Schweif — bei 14 Stück reicht das.
    wirbel += `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="${(9 - t * 4).toFixed(1)}" fill="#e8f3ff" opacity="${(0.85 - t * 0.4).toFixed(2)}"/>`
    wirbel += `<ellipse cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" rx="${(17 - t * 7).toFixed(1)}" ry="${(5 - t * 2).toFixed(1)}" fill="none" stroke="#9fd0f0" stroke-width="1" opacity="${(0.5 - t * 0.25).toFixed(2)}" transform="rotate(${(winkel * 40).toFixed(0)} ${mx.toFixed(1)} ${my.toFixed(1)})"/>`
  }
  return kopfQuadratic(`
    <defs>
      <radialGradient id="gh" cx="50%" cy="50%" r="55%">
        <stop offset="0%" stop-color="#dff3ff"/>
        <stop offset="45%" stop-color="#5aa9e6" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#0b1a2a" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="256" height="256" fill="#04060a"/>
    <ellipse cx="128" cy="128" rx="112" ry="104" fill="url(#gh)"/>
    ${wirbel}
  `)
}

/** **Ein Superhaufen** — ein Netz: Knoten, verbunden durch Fäden. */
function superhaufenSvg(): string {
  // Die Knoten des Netzes: feste Stellen, damit zwei Aufrufe dasselbe Bild geben.
  const knoten: readonly (readonly [number, number, number])[] = [
    [128, 128, 15],
    [58, 76, 9],
    [198, 82, 8],
    [72, 194, 8],
    [196, 190, 10],
    [128, 44, 6],
    [128, 214, 6],
    [44, 138, 7],
    [212, 136, 7],
  ]
  let faeden = ''
  for (let i = 1; i < knoten.length; i++) {
    const [ax, ay] = knoten[0] ?? [128, 128]
    const [bx, by] = knoten[i] ?? [128, 128]
    faeden += `<line x1="${String(ax)}" y1="${String(ay)}" x2="${String(bx)}" y2="${String(by)}" stroke="#8fa4b8" stroke-width="1.1" opacity="0.32"/>`
  }
  // Und ein paar Fäden zwischen den äußeren Knoten — das macht aus dem Stern ein Netz.
  const paare = [[1, 5], [1, 7], [2, 5], [2, 8], [3, 7], [4, 8], [3, 6], [4, 6], [5, 2], [6, 4]] as const
  for (const [i, j] of paare) {
    const [ax, ay] = knoten[i] ?? [128, 128]
    const [bx, by] = knoten[j] ?? [128, 128]
    faeden += `<line x1="${String(ax)}" y1="${String(ay)}" x2="${String(bx)}" y2="${String(by)}" stroke="#8fa4b8" stroke-width="0.9" opacity="0.22"/>`
  }
  let knotenBild = ''
  for (const [x, y, r] of knoten) {
    knotenBild += `<circle cx="${String(x)}" cy="${String(y)}" r="${(r * 2.2).toFixed(1)}" fill="#9fd0f0" opacity="0.10"/>`
    knotenBild += `<circle cx="${String(x)}" cy="${String(y)}" r="${String(r)}" fill="#eef6ff" opacity="0.85"/>`
  }
  return kopfQuadratic(`
    <rect width="256" height="256" fill="#03060a"/>
    ${faeden}
    ${knotenBild}
  `)
}

/** **Ein Schaustück** — die Mitte eines Beispiels: ein Ring um einen hellen Punkt. */
function schaustueckSvg(): string {
  return kopfQuadratic(`
    <defs>
      <radialGradient id="s" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="30%" stop-color="#ffe08a" stop-opacity="0.8"/>
        <stop offset="100%" stop-color="#b45a00" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="256" height="256" fill="#07050a"/>
    <ellipse cx="128" cy="128" rx="120" ry="44" fill="none" stroke="#ffce7a" stroke-width="2" opacity="0.45"/>
    <ellipse cx="128" cy="128" rx="86" ry="30" fill="none" stroke="#ffce7a" stroke-width="1.4" opacity="0.3"/>
    <ellipse cx="128" cy="128" rx="52" ry="18" fill="none" stroke="#ffce7a" stroke-width="1" opacity="0.2"/>
    <circle cx="128" cy="128" r="40" fill="url(#s)"/>
    <circle cx="128" cy="128" r="14" fill="#fffdf3"/>
  `)
}

/** **Ein Platzhalter** — gestrichelt: hier steht später etwas, jetzt noch nicht. */
function platzhalterSvg(): string {
  return kopfQuadratic(`
    <rect width="256" height="256" fill="#08090c"/>
    <circle cx="128" cy="128" r="92" fill="none" stroke="#8fa4b8" stroke-width="3"
            stroke-dasharray="14 12" opacity="0.55"/>
    <circle cx="128" cy="128" r="44" fill="none" stroke="#8fa4b8" stroke-width="2"
            stroke-dasharray="8 10" opacity="0.4"/>
    <circle cx="128" cy="128" r="12" fill="#8fa4b8" opacity="0.5"/>
  `)
}

/** **Eine Datei** — ein Blatt mit gefalteter Ecke und Zeilen. */
function dateiSvg(): string {
  let zeilen = ''
  for (let i = 0; i < 6; i++) {
    zeilen += `<rect x="74" y="${96 + i * 16}" width="${i === 5 ? 44 : 108}" height="5" rx="2.5" fill="#cfe3f5" opacity="${(0.75 - i * 0.08).toFixed(2)}"/>`
  }
  return kopfQuadratic(`
    <rect width="256" height="256" fill="#08090c"/>
    <path d="M62 44 h84 l48 48 v120 a8 8 0 0 1 -8 8 h-124 a8 8 0 0 1 -8 -8 v-160 a8 8 0 0 1 8 -8 z"
          fill="#1b2a3a" stroke="#7fa6c9" stroke-width="3"/>
    <path d="M146 44 l48 48 h-40 a8 8 0 0 1 -8 -8 z" fill="#33506b" stroke="#7fa6c9" stroke-width="2"/>
    ${zeilen}
  `)
}

export function lookFor(nameOrId: string): BodyLook | null {
  const facts = factsFor(nameOrId)
  if (!facts) return null
  const schluessel = Object.entries(SOLAR_FACTS).find(([, wert]) => wert === facts)?.[0]
  if (!schluessel) return null
  const svg = BODY_SVG[schluessel]
  if (svg === undefined) return null
  return {
    svg,
    ...(schluessel === 'saturn' ? { ring: true } : {}),
    glow: schluessel === 'sonne' ? 1 : 0,
  }
}

// ── Bequeme Zugriffe fuer die Daten ──────────────────────────────────────────────────────
//
// `universe.ts` braucht die drei Werte an **einer** Stelle je Koerper. Waeren sie dort als
// `Math.pow(...)` hingeschrieben, staende die Formel an zwei Orten — und beim naechsten Mal an drei.

/** Der Radius eines Koerpers aus der Tabelle, mit Rueckfall aus den Daten. */
export function planetRadius(name: string, fallback: number): number {
  return relativeRadius(name, fallback)
}

/**
 * Eine **Masse**, die zur Groesse passt.
 *
 * Die echte Masse waere `r³` — Jupiter waere dann **318-mal** so schwer wie die Erde, und eine
 * Masse, die in Glorienschein und Beschriftungsgroesse eingeht, wuerde alles andere erschlagen.
 * `r^1,5` behaelt die **Reihenfolge** (Jupiter schwerer als Erde, Erde schwerer als Merkur) und
 * bleibt in einem Bereich, in dem die Darstellung nicht umschlaegt.
 */
export function planetMass(name: string): number {
  const facts = factsFor(name)
  if (!facts) return 1
  return Math.min(400, Math.pow(facts.radiusKm / ERDE_RADIUS_KM, 1.5))
}

/**
 * Der Abstand des Mondes von der Erde.
 *
 * **Er kommt aus dem echten Abstand im selben Massstab wie alles andere:** 384 400 km sind
 * **0,00257 AE**. Mit `300 · a^0,42` ergibt das **16,9 Einheiten** — der Mond steht also **17-mal**
 * so weit von der Erde wie deren eigener Radius, und das ist auch in der Wirklichkeit so
 * (der Mond ist 60 Erdradien entfernt, gestaucht bleibt die Reihenfolge).
 *
 * **Warum nicht 60 Einheiten.** Wer 60 Erdradien 1:1 nimmt, setzt den Mond viermal weiter hinaus,
 * als das gestauchte Modell hergibt — und er „gehört" dann nicht mehr zur Erde, obwohl genau das
 * die Aussage der Szene ist.
 */
export function moonDistance(): number {
  const inAu = 384_400 / 149_597_870
  return EARTH_DISTANCE * Math.pow(inAu, SCALE_EXPONENT)
}

/** Der Abstand der Sonde — 40 AE waeren weiter als Neptun; sie steht bei 1,6 Neptunabstaenden. */
export function voyagerDistance(): number {
  return (relativeDistance('voyager') ?? EARTH_DISTANCE * Math.pow(40, SCALE_EXPONENT))
}
