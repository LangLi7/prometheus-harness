/**
 * Kanten, Schleifen, Vereinfachung — aus Pixeln werden Umrisse.
 *
 * ## Warum Kanten und nicht „Nachbarschaft absuchen"
 *
 * Die klassische Randverfolgung (Moore) läuft pixelweise und stolpert an Stellen, an denen sich
 * zwei Flächen **diagonal** berühren: dort gibt es zwei mögliche Fortsetzungen, und die falsche
 * verbindet zwei Umrisse zu einem. Hier wird stattdessen **jede Grenze zwischen zwei Pixeln** zu
 * einer gerichteten Kante — die Richtung ist so gewählt, daß die Fläche **rechts** liegt. Damit
 * ist an jedem Knotenpunkt die Zahl der ankommenden und abgehenden Kanten gleich, und eine
 * Verzweigung bleibt eine Verzweigung statt zu einem Kreuz zu verschmelzen.
 *
 * ## Warum gerade Kanten und keine Kurven
 *
 * Eine Kurvenanpassung (Bezier) würde glatter aussehen, aber auch **erfundene** Rundungen
 * behaupten: ein Kreis aus 40 Stützpunkten wird durch eine Kurve „schöner" — und weicht dabei
 * mehr vom Bild ab als der Polygomzug. Für ein flächiges Zeichen sind Polygone ehrlicher; sie
 * lassen sich später immer noch glätten, wenn jemand es will.
 *
 * @module @prometheus-harness/vectorize/kanten
 */

/** Ein Punkt auf dem Pixelraster — Ecken, nicht Mittelpunkte. */
export type Punkt = readonly [number, number]

/** Eine geschlossene Umrißlinie. */
export interface Schleife {
  /** Die Stützpunkte in Reihenfolge; der letzte Punkt ist **nicht** der erste. */
  readonly punkte: readonly Punkt[]
  /** Die vorzeichenbehaftete Fläche (Shoelace); das Vorzeichen sagt die Richtung. */
  readonly flaeche: number
}

/**
 * Bildet die Randkanten **einer** Farbe und verkettet sie zu Schleifen.
 *
 * @param labels - je Pixel der Farbindex
 * @param breite - die Breite
 * @param hoehe - die Höhe
 * @param wert - der Farbindex, dessen Umriß gesucht wird
 * @param minFlaeche - Schleifen unter dieser Fläche (in Pixeln) werden verworfen
 * @returns die Schleifen
 */
export function schleifenFuer(
  labels: Uint8Array,
  breite: number,
  hoehe: number,
  wert: number,
  minFlaeche = 4,
): Schleife[] {
  /** Eine Kante als zwei Rasterpunkte. */
  interface Kante {
    von: Punkt
    nach: Punkt
  }
  const kanten: Kante[] = []

  /** Der Schlüssel eines Rasterpunkts — ganzzahlig, also stabil. */
  const schluessel = (p: Punkt): string => `${String(p[0])},${String(p[1])}`

  for (let y = 0; y < hoehe; y += 1) {
    for (let x = 0; x < breite; x += 1) {
      const p = y * breite + x
      if (labels[p] !== wert) continue
      // Die vier Seiten; die Richtung hält die Fläche rechts.
      if (y === 0 || labels[p - breite] !== wert) kanten.push({ von: [x, y], nach: [x + 1, y] })
      if (x === breite - 1 || labels[p + 1] !== wert) kanten.push({ von: [x + 1, y], nach: [x + 1, y + 1] })
      if (y === hoehe - 1 || labels[p + breite] !== wert) kanten.push({ von: [x + 1, y + 1], nach: [x, y + 1] })
      if (x === 0 || labels[p - 1] !== wert) kanten.push({ von: [x, y + 1], nach: [x, y] })
    }
  }

  const abgehend = new Map<string, number[]>()
  kanten.forEach((kante, i) => {
    const liste = abgehend.get(schluessel(kante.von)) ?? []
    liste.push(i)
    abgehend.set(schluessel(kante.von), liste)
  })

  const benutzt = new Uint8Array(kanten.length)
  const schleifen: Schleife[] = []

  for (let start = 0; start < kanten.length; start += 1) {
    if (benutzt[start] === 1) continue
    const kette: Punkt[] = []
    let aktuell = start
    let sicherung = 0
    while (true) {
      if (sicherung > kanten.length + 4) break
      sicherung += 1
      const kante = kanten[aktuell]
      if (kante === undefined) break
      if (benutzt[aktuell] === 1) break
      benutzt[aktuell] = 1
      kette.push(kante.von)
      const amKnoten = abgehend.get(schluessel(kante.nach)) ?? []
      const offen = amKnoten.filter((i) => benutzt[i] === 0)
      if (offen.length === 0) {
        // Geschlossen, wenn wir wieder am Anfang sind; sonst eine offene Kette — die gibt es bei
        // einer vollständigen Kantenmenge nicht, und sie wird deshalb verworfen statt geraten.
        if (kante.nach[0] === kette[0]?.[0] && kante.nach[1] === kette[0]?.[1]) break
        kette.length = 0
        break
      }
      let naechste = offen[0] ?? 0
      if (offen.length > 1) {
        // **Die Verzweigung.** Die Fläche liegt rechts; die Fortsetzung ist die **am stärksten
        // rechts** drehende Kante. Ohne diese Regel verschmelzen zwei Flächen, die sich nur in
        // einer Ecke berühren.
        const rein = richtung(kante.von, kante.nach)
        let besterWinkel = Number.POSITIVE_INFINITY
        for (const i of offen) {
          const kandidat = kanten[i]
          if (kandidat === undefined) continue
          const raus = richtung(kandidat.von, kandidat.nach)
          const winkel = Math.atan2(rein[0] * raus[1] - rein[1] * raus[0], rein[0] * raus[0] + rein[1] * raus[1])
          if (winkel < besterWinkel) {
            besterWinkel = winkel
            naechste = i
          }
        }
      }
      aktuell = naechste
    }
    if (kette.length < 3) continue
    const flaeche = shoelace(kette)
    if (Math.abs(flaeche) < minFlaeche) continue
    schleifen.push({ punkte: kette, flaeche })
  }

  return schleifen
}

/**
 * Die Richtung einer Kante als Einheitsvektor — für den Winkel an einer Verzweigung.
 *
 * @param von - der Anfang
 * @param nach - das Ende
 * @returns der Einheitsvektor
 */
function richtung(von: Punkt, nach: Punkt): Punkt {
  const dx = nach[0] - von[0]
  const dy = nach[1] - von[1]
  const laenge = Math.hypot(dx, dy) || 1
  return [dx / laenge, dy / laenge]
}

/**
 * Die Fläche einer geschlossenen Linie (Shoelace).
 *
 * @param punkte - die Stützpunkte
 * @returns die vorzeichenbehaftete Fläche
 */
export function shoelace(punkte: readonly Punkt[]): number {
  let summe = 0
  for (let i = 0; i < punkte.length; i += 1) {
    const a = punkte[i] ?? [0, 0]
    const b = punkte[(i + 1) % punkte.length] ?? [0, 0]
    summe += a[0] * b[1] - b[0] * a[1]
  }
  return summe / 2
}

/**
 * Vereinfacht eine geschlossene Linie (Ramer–Douglas–Peucker).
 *
 * ## Warum die Linie zweigeteilt wird
 *
 * RDP arbeitet auf einer **offenen** Strecke: es nimmt Anfang und Ende und wirft alles weg, was
 * nah an der Verbindungsgeraden liegt. Bei einer geschlossenen Linie ist Anfang = Ende, die
 * Verbindungsgerade also ein Punkt — und RDP würde **alles** wegwerfen. Deshalb wird die Linie am
 * Punkt mit dem größten Abstand zum Anfang geteilt und jede Hälfte einzeln vereinfacht.
 *
 * @param punkte - die Stützpunkte
 * @param toleranz - der größte erlaubte Abstand in Pixeln
 * @returns die vereinfachten Stützpunkte
 */
export function vereinfache(punkte: readonly Punkt[], toleranz: number): Punkt[] {
  if (punkte.length <= 4 || toleranz <= 0) return [...punkte]
  const erster = punkte[0] ?? [0, 0]
  let fernster = 0
  let groesster = -1
  for (let i = 1; i < punkte.length; i += 1) {
    const p = punkte[i] ?? [0, 0]
    const d = (p[0] - erster[0]) ** 2 + (p[1] - erster[1]) ** 2
    if (d > groesster) {
      groesster = d
      fernster = i
    }
  }
  const links = rdp(punkte.slice(0, fernster + 1), toleranz)
  const rechts = rdp(punkte.slice(fernster), toleranz)
  // **Die Naht liegt am Teilungspunkt.** Beide Hälften enthalten ihn; er darf nur **einmal** in
  // die Schleife. Die letzte Zeile der linken Hälfte ist er, die erste der rechten auch —
  // deshalb wird die rechte Hälfte **ohne ihr erstes** Element angehängt.
  const zusammen = [...links, ...rechts.slice(1)]
  return zusammen.length >= 3 ? entferneKollinear(zusammen, Math.max(toleranz, 0.01)) : [...punkte]
}

/**
 * Wirft Punkte weg, die **auf** der Verbindungsgeraden ihrer Nachbarn liegen.
 *
 * ## Warum das nötig ist
 *
 * Die Randverfolgung beginnt an einem beliebigen Randpunkt — bei einem Quadrat also **mitten** auf
 * einer Kante. RDP behält Anfang und Ende einer Strecke immer, und so bleibt dieser Punkt stehen,
 * obwohl er keine Ecke ist: ein Quadrat hätte fünf Stützpunkte statt vier. Im SVG ist das
 * unsichtbar, im Pfad ist es Ballast — und bei einer Kurve wäre es ein Knick, den niemand wollte.
 *
 * @param punkte - die Stützpunkte einer geschlossenen Linie
 * @param epsilon - der größte Abstand zur Geraden, der noch als „darauf" gilt
 * @returns die Stützpunkte ohne Zwischenpunkte
 */
export function entferneKollinear(punkte: readonly Punkt[], epsilon = 0.01): Punkt[] {
  if (punkte.length <= 3) return [...punkte]

  /** Liegt `p` auf der Geraden `a`–`b` (und nicht dahinter)? */
  const dazwischen = (a: Punkt, b: Punkt, p: Punkt): boolean => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const laenge = Math.hypot(dx, dy)
    if (laenge === 0) return false
    const abstand = Math.abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / laenge
    const vorwaerts = dx * (p[0] - b[0]) + dy * (p[1] - b[1])
    return abstand <= epsilon && vorwaerts >= 0
  }

  const out: Punkt[] = []
  for (const p of punkte) {
    const b = out[out.length - 1]
    const a = out[out.length - 2]
    if (a !== undefined && b !== undefined && dazwischen(a, b, p)) {
      out[out.length - 1] = p
      continue
    }
    out.push(p)
  }

  // **Und die Naht.** Der erste Punkt hat als Nachbarn den letzten und den zweiten — die Schleife
  // ist geschlossen, und genau dort bliebe sonst der Startpunkt stehen. Dasselbe gilt für den
  // **letzten** Punkt: er liegt zwischen dem vorletzten und dem ersten.
  let geschrumpft = true
  while (geschrumpft && out.length > 3) {
    geschrumpft = false
    const n = out.length
    const letzter = out[n - 1]
    const vorletzter = out[n - 2]
    const erster = out[0]
    const zweiter = out[1]
    if (letzter === undefined || vorletzter === undefined || erster === undefined || zweiter === undefined) break
    if (dazwischen(letzter, erster, zweiter)) {
      out.shift()
      geschrumpft = true
    } else if (dazwischen(vorletzter, letzter, erster)) {
      out.pop()
      geschrumpft = true
    }
  }
  return out
}

/**
 * RDP auf einer offenen Strecke.
 *
 * @param punkte - die Strecke
 * @param toleranz - der größte erlaubte Abstand
 * @returns die vereinfachte Strecke
 */
function rdp(punkte: readonly Punkt[], toleranz: number): Punkt[] {
  if (punkte.length <= 2) return [...punkte]
  const anfang = punkte[0] ?? [0, 0]
  const ende = punkte[punkte.length - 1] ?? [0, 0]
  let weit = 0
  let stelle = -1
  const dx = ende[0] - anfang[0]
  const dy = ende[1] - anfang[1]
  const laenge = Math.hypot(dx, dy)
  for (let i = 1; i < punkte.length - 1; i += 1) {
    const p = punkte[i] ?? [0, 0]
    const abstand =
      laenge === 0
        ? Math.hypot(p[0] - anfang[0], p[1] - anfang[1])
        : Math.abs(dy * p[0] - dx * p[1] + ende[0] * anfang[1] - ende[1] * anfang[0]) / laenge
    if (abstand > weit) {
      weit = abstand
      stelle = i
    }
  }
  if (weit <= toleranz || stelle < 0) return [anfang, ende]
  const links = rdp(punkte.slice(0, stelle + 1), toleranz)
  const rechts = rdp(punkte.slice(stelle), toleranz)
  return [...links.slice(0, -1), ...rechts]
}

/**
 * Der `d`-Teil eines SVG-Pfads aus mehreren Schleifen.
 *
 * @param schleifen - die Schleifen
 * @returns der Pfadtext
 */
export function pfadAus(schleifen: readonly Schleife[]): string {
  const teile: string[] = []
  for (const schleife of schleifen) {
    const punkte = schleife.punkte
    if (punkte.length < 3) continue
    const erster = punkte[0] ?? [0, 0]
    teile.push(`M ${zahl(erster[0])} ${zahl(erster[1])}`)
    for (let i = 1; i < punkte.length; i += 1) {
      const p = punkte[i] ?? [0, 0]
      teile.push(`L ${zahl(p[0])} ${zahl(p[1])}`)
    }
    teile.push('Z')
  }
  return teile.join(' ')
}

/**
 * Eine Zahl für den Pfad — ohne überflüssige Nullen.
 *
 * @param wert - die Zahl
 * @returns die Textform
 */
function zahl(wert: number): string {
  return Number.isInteger(wert) ? String(wert) : wert.toFixed(1)
}
