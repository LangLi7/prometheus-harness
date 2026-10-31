/**
 * **Die Prüfungen des Zeichensatzes.**
 *
 * ## Was hier gemessen wird — und warum
 *
 * Ein Zeichen ist **Geometrie**. Ob es taugt, sieht man am Bild — aber ob es **im Raster bleibt**,
 * ob es **nur erlaubte Elemente** benutzt und ob zwei Namen **dieselbe Zeichnung** tragen, sind
 * Rechnungen und Textvergleiche. Genau die stehen hier, denn ein Blick auf ein Übersichtsblatt
 * findet einen Zahlendreher erst, wenn jemand hinsieht — und bei 15 px sieht niemand hin.
 *
 * Die drei Befunde, die es ohne diese Datei nicht gegeben hätte:
 *
 *   * `stack` und `layers` waren **dieselbe Zeichnung** (dreimal Raute) — zwei Namen, ein Bild.
 *     Gefunden von der Prüfung auf doppelte Körper, nicht vom Auge: im Blatt sah es nach Absicht aus.
 *   * Die Körper auf `orbit`s Bahn waren mit `r = 1,5` **unter dem Strich der Bahn** verschwunden.
 *   * Zwei `a`-Bögen lagen so, daß ihre **Kreise** weit über das Raster hinausragten (der Bogen
 *     selbst nicht) — das ist die Stelle, an der eine grobe Prüfung falsch Alarm schlägt und eine
 *     gar keine diesen Fehler durchläßt.
 *
 * ## Der Bogen und die Grenzen — die Rechnung
 *
 * {@link grenzen} rechnet die **echte** Hülle eines Pfades aus: für `M`, `L`, `C`, `S` und `Z` aus
 * den Stützpunkten (die Kontrollpunkte sind eine obere Schranke — ein Cubic liegt **in** der Hülle
 * seiner vier Punkte), und für `A` aus der **Mittelpunktsform** des Bogens nach der SVG-Spezifikation
 * (Anhang F.6.5). Ohne diese Umrechnung müßte man den Kreis um den Bogen nehmen — und der ist bei
 * einem Viertelbogen dreimal so groß wie der Bogen.
 */
import { expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  ICONS,
  ICON_CLASS,
  ICON_NAMES,
  RASTER,
  SPRITE_PREFIX,
  STAERKE,
  iconElement,
  iconFile,
  iconId,
  iconMarkup,
  spriteMarkup,
} from '../src/index'

// ── Erlaubtes ────────────────────────────────────────────────────────────────────────────────

/**
 * **Diese Elemente dürfen vorkommen — und keine anderen.**
 *
 * Eine kurze Liste ist hier eine **Sicherheitsentscheidung**, keine Stilfrage: die Oberfläche setzt
 * die Zeichen als Markup in den Baum. Ein `<script>`, ein `<foreignObject>` oder ein `<image>` in
 * einem Zeichen wäre damit ausführbarer Inhalt bzw. ein Abruf nach außen. Was nicht in dieser Liste
 * steht, kommt nicht in den Baum — geprüft, nicht gehofft.
 */
const ERLAUBTE_ELEMENTE = ['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'g'] as const

/**
 * **Diese Merkmale dürfen vorkommen.**
 *
 * Alles andere wird abgewiesen — insbesondere alles, was mit `on` beginnt (ein Ereignis), was eine
 * Adresse ist (`href`, `xlink:href`) oder was Stil *und* Inhalt mischt (`style`). Die Zeichen werden
 * **nicht** mit `style` gesteuert; sie erben ihre Farbe über `currentColor`.
 */
const ERLAUBTE_MERKMALE = [
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'width',
  'height',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'transform',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
] as const

/** Zieht Elementname und Merkmale aus einem Körper — ein kleiner, aber ehrlicher Parser. */
function zerlege(koerper: string): readonly { readonly name: string; readonly merkmale: readonly string[] }[] {
  const raus: { name: string; merkmale: string[] }[] = []
  for (const treffer of koerper.matchAll(/<([a-zA-Z][\w-]*)((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)) {
    const name = treffer[1] ?? ''
    const merkmale = [...(treffer[2] ?? '').matchAll(/([\w:-]+)="/g)].map((m) => m[1] ?? '')
    raus.push({ name, merkmale })
  }
  return raus
}

// ── Die Rechnung: die Hülle eines Pfades ─────────────────────────────────────────────────────

/** Ein Kasten, wie ihn ein Pfad aufspannt. */
interface Kasten {
  x0: number
  y0: number
  x1: number
  y1: number
}

function neu(): Kasten {
  return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
}

function nimm(k: Kasten, x: number, y: number): void {
  k.x0 = Math.min(k.x0, x)
  k.y0 = Math.min(k.y0, y)
  k.x1 = Math.max(k.x1, x)
  k.y1 = Math.max(k.y1, y)
}

/**
 * **Die Mittelpunktsform eines Bogens** — SVG-Spezifikation, Anhang F.6.5.
 *
 * Aus Anfangspunkt, Radien, Drehung und den beiden Kennzeichen wird der **Mittelpunkt** des Kreises,
 * auf dem der Bogen liegt. Erst damit weiß man, wo der Bogen wirklich verläuft; ohne sie bleibt nur
 * „irgendwo im Kreis um einen der Endpunkte".
 *
 * @returns der Mittelpunkt, oder `undefined` bei einem entarteten Bogen (Radien zu klein)
 */
function bogenMitte(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  drehung: number,
  gross: number,
  richtung: number,
  x2: number,
  y2: number,
): readonly [number, number, number, number] | undefined {
  if (rx === 0 || ry === 0) return undefined
  const rad = (drehung * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  // (1) Die Endpunkte in das Koordinatensystem der Ellipse drehen.
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const px = cos * dx + sin * dy
  const py = -sin * dx + cos * dy
  // (2) Die Radien vergrößern, wenn sie für die Sehne zu klein sind — die Spezifikation schreibt
  //     genau das vor (statt den Bogen einfach nicht zu zeichnen).
  const faktor = (px * px) / (rx * rx) + (py * py) / (ry * ry)
  if (faktor > 1) {
    const s = Math.sqrt(faktor)
    rx *= s
    ry *= s
  }
  // (3) Der Mittelpunkt in Ellipsenkoordinaten.
  const zaehler = rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px
  const nenner = rx * rx * py * py + ry * ry * px * px
  const vorzeichen = gross === richtung ? -1 : 1
  const wurzel = vorzeichen * Math.sqrt(Math.max(0, zaehler / nenner))
  const cxp = (wurzel * rx * py) / ry
  const cyp = (-wurzel * ry * px) / rx
  // (4) … und zurückdrehen.
  const mx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const my = sin * cxp + cos * cyp + (y1 + y2) / 2
  return [mx, my, rx, ry]
}

/**
 * **Die Hülle eines Pfades.**
 *
 * @param d - der Pfad
 * @returns der Kasten, den der Pfad aufspannt
 */
function grenzen(d: string): Kasten {
  const k = neu()
  /*
   * Die Zahlen und Buchstaben in eine Folge trennen.
   *
   * **`-.6` ist eine gültige Zahl** — Vorzeichen, Punkt, Ziffern, ohne führende Null. Der erste
   * Anlauf dieser Zerlegung (`-?\d*\.?\d+`) ließ sie durchfallen und meldete `-.6` als *Befehl*: die
   * Prüfung war rot, und schuld war nicht das Zeichen, sondern ihr eigener Parser.
   */
  const teile = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? []
  let i = 0
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  // Der zweite Kontrollpunkt des letzten Cubics — `S` spiegelt ihn.
  let letzterKontrollX = 0
  let letzterKontrollY = 0
  let letzteWarCubic = false

  const zahl = (): number => Number(teile[i++] ?? '0')
  const punktNimm = (px: number, py: number): void => nimm(k, px, py)

  /*
   * **Der Befehl wird EINMAL gelesen und gilt weiter, solange Zahlen folgen.**
   *
   * Das ist keine Feinheit, sondern die Stelle, an der der erste Anlauf dieser Rechnung scheiterte:
   * `c0-3.4-2.4-4.9-3.4-7.1-.6-1.3-.7-2.5-.3-3.8` sind **zwei** kubische Stücke unter **einem**
   * `c`. Wer nach sechs Zahlen den nächsten Befehl erwartet, liest `-.6` als Befehl und meldet einen
   * Fehler — und beschuldigt damit das Zeichen für einen Fehler des Prüfers.
   *
   * Nach `M`/`m` wiederholt sich der Befehl als **Linie** (`L`/`l`), so schreibt es die
   * Spezifikation.
   */
  let befehl = ''
  while (i < teile.length) {
    const naechstes = teile[i] ?? ''
    if (/[A-Za-z]/.test(naechstes)) {
      befehl = naechstes
      i += 1
    } else if (befehl === '') {
      throw new Error(`Der Pfad beginnt nicht mit einem Befehl: ${JSON.stringify(d)}`)
    } else if (befehl === 'M') {
      befehl = 'L'
    } else if (befehl === 'm') {
      befehl = 'l'
    }
    const rel = befehl === befehl.toLowerCase()
    switch (befehl.toUpperCase()) {
      case 'M': {
        x = rel ? x + zahl() : zahl()
        y = rel ? y + zahl() : zahl()
        startX = x
        startY = y
        punktNimm(x, y)
        letzteWarCubic = false
        break
      }
      case 'L': {
        x = rel ? x + zahl() : zahl()
        y = rel ? y + zahl() : zahl()
        punktNimm(x, y)
        letzteWarCubic = false
        break
      }
      case 'H': {
        x = rel ? x + zahl() : zahl()
        punktNimm(x, y)
        letzteWarCubic = false
        break
      }
      case 'V': {
        y = rel ? y + zahl() : zahl()
        punktNimm(x, y)
        letzteWarCubic = false
        break
      }
      case 'C': {
        const c1x = rel ? x + zahl() : zahl()
        const c1y = rel ? y + zahl() : zahl()
        const c2x = rel ? x + zahl() : zahl()
        const c2y = rel ? y + zahl() : zahl()
        const ex = rel ? x + zahl() : zahl()
        const ey = rel ? y + zahl() : zahl()
        punktNimm(c1x, c1y)
        punktNimm(c2x, c2y)
        punktNimm(ex, ey)
        letzterKontrollX = c2x
        letzterKontrollY = c2y
        x = ex
        y = ey
        letzteWarCubic = true
        break
      }
      case 'S': {
        // Der erste Kontrollpunkt ist die Spiegelung des letzten — er gehört in die Hülle.
        const c1x = letzteWarCubic ? 2 * x - letzterKontrollX : x
        const c1y = letzteWarCubic ? 2 * y - letzterKontrollY : y
        const c2x = rel ? x + zahl() : zahl()
        const c2y = rel ? y + zahl() : zahl()
        const ex = rel ? x + zahl() : zahl()
        const ey = rel ? y + zahl() : zahl()
        punktNimm(c1x, c1y)
        punktNimm(c2x, c2y)
        punktNimm(ex, ey)
        letzterKontrollX = c2x
        letzterKontrollY = c2y
        x = ex
        y = ey
        letzteWarCubic = true
        break
      }
      case 'A': {
        const rx = zahl()
        const ry = zahl()
        const drehung = zahl()
        const gross = zahl()
        const richtung = zahl()
        const ex = rel ? x + zahl() : zahl()
        const ey = rel ? y + zahl() : zahl()
        const mitte = bogenMitte(x, y, rx, ry, drehung, gross, richtung, ex, ey)
        if (mitte) {
          // Der **ganze** Kreis um den Mittelpunkt: eine obere Schranke, die bei einem Bogen über
          // 180° fast genau ist und bei einem kleinen Bogen zu groß — aber nie zu klein.
          const umfang = Math.max(rx, ry)
          punktNimm(mitte[0] - umfang, mitte[1] - umfang)
          punktNimm(mitte[0] + umfang, mitte[1] + umfang)
        } else {
          punktNimm(ex, ey)
        }
        x = ex
        y = ey
        letzteWarCubic = false
        break
      }
      case 'Z': {
        x = startX
        y = startY
        punktNimm(x, y)
        letzteWarCubic = false
        break
      }
      default: {
        // `Q`/`T` kommen in diesem Satz nicht vor. Statt sie stillschweigend zu übergehen, fällt die
        // Prüfung hier auf: ein Befehl, den die Rechnung nicht kennt, macht ihre Aussage wertlos.
        throw new Error(`Unbekannter Pfadbefehl ${JSON.stringify(befehl)} in ${JSON.stringify(d)}`)
      }
    }
  }
  return k
}

/**
 * Die Hülle eines ganzen Zeichens: alle Pfade und alle Formelemente.
 *
 * **Die Drehung wird mitgerechnet.** `transform="rotate(a cx cy)"` kommt in diesem Satz vor (Ringe,
 * Kapseln). Wer sie ignoriert, prüft ein anderes Bild als das, was gezeichnet wird.
 *
 * @param koerper - der Körper des Zeichens
 * @returns der Kasten
 */
function koerperGrenzen(koerper: string): Kasten {
  const k = neu()
  const nimmGedreht = (x: number, y: number, drehung: number, mx: number, my: number): void => {
    if (drehung === 0) {
      nimm(k, x, y)
      return
    }
    const rad = (drehung * Math.PI) / 180
    const dx = x - mx
    const dy = y - my
    nimm(k, mx + dx * Math.cos(rad) - dy * Math.sin(rad), my + dx * Math.sin(rad) + dy * Math.cos(rad))
  }

  for (const treffer of koerper.matchAll(/<([a-zA-Z][\w-]*)([^>]*?)\/?>/g)) {
    const name = (treffer[1] ?? '').toLowerCase()
    const roh = treffer[2] ?? ''
    const merkmal = (n: string): number | undefined => {
      const m = new RegExp(`\\b${n}="([^"]*)"`).exec(roh)
      return m ? Number(m[1]) : undefined
    }
    const drehungsText = /\btransform="rotate\(([^)]*)\)"/.exec(roh)?.[1]
    const drehungsTeile = drehungsText?.trim().split(/[\s,]+/).map(Number) ?? []
    const drehung = drehungsTeile[0] ?? 0
    const dmx = drehungsTeile[1] ?? 0
    const dmy = drehungsTeile[2] ?? 0

    if (name === 'path') {
      const d = /\bd="([^"]*)"/.exec(roh)?.[1] ?? ''
      const teil = grenzen(d)
      if (Number.isFinite(teil.x0)) {
        // **Die Ecken des Pfadkastens drehen** — das ist eine obere Schranke (die gedrehte Hülle
        // liegt im gedrehten Kasten), und für eine Prüfung auf „bleibt im Raster" genau richtig.
        nimmGedreht(teil.x0, teil.y0, drehung, dmx, dmy)
        nimmGedreht(teil.x1, teil.y0, drehung, dmx, dmy)
        nimmGedreht(teil.x0, teil.y1, drehung, dmx, dmy)
        nimmGedreht(teil.x1, teil.y1, drehung, dmx, dmy)
      }
      continue
    }
    if (name === 'circle') {
      const cx = merkmal('cx') ?? 0
      const cy = merkmal('cy') ?? 0
      const r = merkmal('r') ?? 0
      nimmGedreht(cx - r, cy - r, drehung, dmx, dmy)
      nimmGedreht(cx + r, cy + r, drehung, dmx, dmy)
      nimmGedreht(cx - r, cy + r, drehung, dmx, dmy)
      nimmGedreht(cx + r, cy - r, drehung, dmx, dmy)
      continue
    }
    if (name === 'ellipse') {
      const cx = merkmal('cx') ?? 0
      const cy = merkmal('cy') ?? 0
      const rx = merkmal('rx') ?? 0
      const ry = merkmal('ry') ?? 0
      nimmGedreht(cx - rx, cy - ry, drehung, dmx, dmy)
      nimmGedreht(cx + rx, cy + ry, drehung, dmx, dmy)
      nimmGedreht(cx - rx, cy + ry, drehung, dmx, dmy)
      nimmGedreht(cx + rx, cy - ry, drehung, dmx, dmy)
      continue
    }
    if (name === 'rect') {
      const x = merkmal('x') ?? 0
      const y = merkmal('y') ?? 0
      const b = merkmal('width') ?? 0
      const h = merkmal('height') ?? 0
      const mx = drehungsText === undefined ? 0 : (dmx === 0 && dmy === 0 ? x + b / 2 : dmx)
      const my = drehungsText === undefined ? 0 : (dmx === 0 && dmy === 0 ? y + h / 2 : dmy)
      nimmGedreht(x, y, drehung, mx, my)
      nimmGedreht(x + b, y + h, drehung, mx, my)
      nimmGedreht(x, y + h, drehung, mx, my)
      nimmGedreht(x + b, y, drehung, mx, my)
      continue
    }
    if (name === 'line') {
      nimm(k, merkmal('x1') ?? 0, merkmal('y1') ?? 0)
      nimm(k, merkmal('x2') ?? 0, merkmal('y2') ?? 0)
    }
  }
  return k
}

// ── Die Prüfungen ────────────────────────────────────────────────────────────────────────────

test('der Satz ist nicht leer und jeder Name ist englisch und klein', () => {
  expect(ICON_NAMES.length).toBeGreaterThanOrEqual(30)
  for (const name of ICON_NAMES) {
    // Regel 42 dieses Projekts: Datei- und Bezeichnernamen sind englisch. Ein Zeichenname ist ein
    // Bezeichner — er steht im Markup, in der Datei und im Aufruf.
    expect(name).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
  }
  // Ein Name ist ein Dateiname: keine zwei dürfen sich nur durch Gross-/Kleinschreibung trennen.
  const klein = ICON_NAMES.map((n) => n.toLowerCase())
  expect(new Set(klein).size).toBe(klein.length)
})

test('jedes Zeichen sagt, was es zeigt', () => {
  for (const name of ICON_NAMES) {
    const was = ICONS[name].was
    expect(was.length, `${name}: die Beschreibung ist zu kurz`).toBeGreaterThan(20)
    expect(was.endsWith('.'), `${name}: die Beschreibung ist kein Satz`).toBe(true)
  }
})

test('kein Zeichen ist leer', () => {
  for (const name of ICON_NAMES) {
    expect(ICONS[name].koerper.length, `${name} hat keinen Körper`).toBeGreaterThan(20)
    expect(zerlege(ICONS[name].koerper).length, `${name} hat kein Element`).toBeGreaterThan(0)
  }
})

test('zwei Namen tragen NICHT dieselbe Zeichnung', () => {
  // **Der Befund, der diese Prüfung erzwungen hat.** `stack` und `layers` waren beide ein Stapel
  // Rauten — im Übersichtsblatt sah das nach Absicht aus, im Markup war es zweimal dasselbe Bild.
  // Zwei Namen für ein Bild sind ein Name zu viel: der Nutzer lernt die Bedeutung nie.
  const gesehen = new Map<string, string>()
  for (const name of ICON_NAMES) {
    const koerper = ICONS[name].koerper
    const vorher = gesehen.get(koerper)
    expect(vorher, `${name} zeichnet dasselbe wie ${vorher ?? ''}`).toBeUndefined()
    gesehen.set(koerper, name)
  }
})

test('jedes Zeichen bleibt im Raster — auch mit dem Strich', () => {
  /*
   * **Warum die halbe Strichstärke zählt.** Ein SVG beschneidet, was über den `viewBox` hinausragt.
   * Eine Linie, die bei y=24 liegt, ist damit **halb weg** — und das sieht man erst im Bild. Die
   * Grenze ist deshalb `0 + halbe Strichstärke` … `24 - halbe Strichstärke`.
   */
  const rand = STAERKE / 2
  const fehler: string[] = []
  for (const name of ICON_NAMES) {
    const k = koerperGrenzen(ICONS[name].koerper)
    if (!Number.isFinite(k.x0)) {
      fehler.push(`${name}: keine Geometrie gefunden`)
      continue
    }
    // Eine halbe Rastereinheit Spiel, weil die Rechnung bei Bögen bewusst zu großzügig ist.
    if (k.x0 < rand - 0.5 || k.y0 < rand - 0.5 || k.x1 > RASTER - rand + 0.5 || k.y1 > RASTER - rand + 0.5) {
      fehler.push(
        `${name}: ${k.x0.toFixed(2)} … ${k.x1.toFixed(2)} / ${k.y0.toFixed(2)} … ${k.y1.toFixed(2)}`,
      )
    }
  }
  expect(fehler.join('\n')).toBe('')
})

test('nur erlaubte Elemente und Merkmale — der Zeichensatz ist Inhalt, kein Programm', () => {
  const fehler: string[] = []
  for (const name of ICON_NAMES) {
    for (const { name: element, merkmale } of zerlege(ICONS[name].koerper)) {
      if (!(ERLAUBTE_ELEMENTE as readonly string[]).includes(element)) {
        fehler.push(`${name}: Element <${element}> ist nicht erlaubt`)
      }
      for (const m of merkmale) {
        if (!(ERLAUBTE_MERKMALE as readonly string[]).includes(m)) {
          fehler.push(`${name}: Merkmal ${m} ist nicht erlaubt`)
        }
      }
    }
    // Und die drei Formen, die man nicht über ein Merkmal, sondern über den Namen ausschließt.
    for (const verboten of ['<script', '<foreignObject', '<image', 'javascript:', 'onload', 'onclick']) {
      if (ICONS[name].koerper.includes(verboten)) fehler.push(`${name}: ${verboten} gefunden`)
    }
  }
  expect(fehler.join('\n')).toBe('')
})

test('kein Zeichen bringt eine Farbe mit', () => {
  // **Der Grund steht im Dateikopf von `shapes.ts`:** ein Zeichen mit eigener Farbe ist in einem
  // dunklen Bild unbrauchbar. Erlaubt sind nur `currentColor` und `none`.
  const fehler: string[] = []
  for (const name of ICON_NAMES) {
    const koerper = ICONS[name].koerper
    for (const treffer of koerper.matchAll(/\b(fill|stroke)="([^"]*)"/g)) {
      const wert = treffer[2] ?? ''
      if (wert !== 'currentColor' && wert !== 'none') {
        fehler.push(`${name}: ${treffer[1]}="${wert}"`)
      }
    }
    if (/#[0-9a-fA-F]{3,8}\b/.test(koerper) || /\b(rgb|hsl)a?\(/.test(koerper)) {
      fehler.push(`${name}: eine Farbangabe im Körper`)
    }
  }
  expect(fehler.join('\n')).toBe('')
})

test('das Markup ist ein vollständiges, barrierefreies SVG', () => {
  for (const name of ICON_NAMES) {
    const markup = iconMarkup(name)
    expect(markup.startsWith('<svg '), `${name}: kein <svg>`).toBe(true)
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(markup).toContain(`viewBox="0 0 ${String(RASTER)} ${String(RASTER)}"`)
    expect(markup).toContain(`class="${ICON_CLASS}"`)
    // Ein Zeichen ist **Zierde**, kein Text: Vorleser sollen es überspringen. Was es bedeutet, sagt
    // die Beschriftung daneben — sonst läse ein Vorleser „Grafik" und sonst nichts.
    expect(markup).toContain('aria-hidden="true"')
    // **Ohne Größe — am WURZEL-ELEMENT.** Sie gehört in die Oberfläche; ein Zeichen mit eingebauter
    // Größe wäre in der Kopfzeile zu groß und in einer Tabelle zu klein. Geprüft wird deshalb nur die
    // öffnende `<svg>`-Marke: `width` an einem `<rect>` **im** Zeichen ist Geometrie und richtig — der
    // erste Anlauf suchte im ganzen Markup und meldete `stroke-width` und jedes `<rect width>` mit.
    const wurzel = markup.slice(0, markup.indexOf('>') + 1)
    expect(wurzel).not.toContain(' width="')
    expect(wurzel).not.toContain(' height="')
    expect(markup).toContain(ICONS[name].koerper)
  }
})

test('das Markup ist bei jedem Aufruf dasselbe', () => {
  // Ohne diese Prüfung wäre ein Zeichen mit Zufall (etwa eine zufällige Kennung) erst im Betrieb
  // aufgefallen — als Sprite, das mal trifft und mal nicht.
  for (const name of ICON_NAMES) {
    expect(iconMarkup(name)).toBe(iconMarkup(name))
  }
})

test('die Klasse lässt sich erweitern', () => {
  expect(iconMarkup('chat', 'gross')).toContain(`class="${ICON_CLASS} gross"`)
})

test('ein unbekannter Name wirft — und nennt die bekannten', () => {
  expect(() => iconMarkup('gibtsnicht' as never)).toThrow()
  try {
    iconMarkup('gibtsnicht' as never)
  } catch (f) {
    const text = f instanceof Error ? f.message : ''
    expect(text).toContain('gibtsnicht')
    // Die Antwort muß brauchbar sein: wer den Tippfehler sucht, will die Liste sehen.
    expect(text).toContain('chat')
  }
})

test('das Sprite trägt jedes Zeichen genau einmal', () => {
  const sprite = spriteMarkup()
  for (const name of ICON_NAMES) {
    const kennung = iconId(name)
    expect(kennung.startsWith(SPRITE_PREFIX)).toBe(true)
    const treffer = sprite.split(`id="${kennung}"`).length - 1
    expect(treffer, `${name} steht ${String(treffer)}× im Sprite`).toBe(1)
    expect(sprite).toContain(ICONS[name].koerper)
  }
  // Und keine Kennung, die zu einer anderen gehört (Einzigkeit).
  const kennungen = [...sprite.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
  expect(new Set(kennungen).size).toBe(kennungen.length)
  expect(kennungen.length).toBe(ICON_NAMES.length)
})

test('jedes Zeichen ist auch eine eigene, vollständige Datei', () => {
  const datei = iconFile('prometheus')
  expect(datei.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
  expect(datei).toContain('<title>')
  expect(datei.endsWith('</svg>\n')).toBe(true)
  // **Eine Datei, die man öffnen kann.** Ohne `width`/`height` skaliert sie; mit Rastermaß ist sie
  // in einer Bildliste überhaupt sichtbar.
  expect(datei).toContain(`width="${String(RASTER)}"`)
  // Und ohne feste Farbe erbt sie (`currentColor`) — das ist die Form für einen Zeichensatz.
  expect(datei).toContain('stroke="currentColor"')
})

test('eine DATEI kann eine feste Farbe tragen — ein Favicon erbt nichts', () => {
  /*
   * **Warum das eine eigene Prüfung ist.** In der Oberfläche erbt ein Zeichen seine Farbe. Eine
   * **Datei** hat niemanden, von dem sie erben könnte: ein Favicon mit `currentColor` wäre schwarz —
   * und neben einem dunklen Browser-Thema unsichtbar. Der Betreiber sieht das Zeichen im Reiter,
   * also muß die Farbe dort **drinstehen**.
   */
  const farbig = iconFile('prometheus', '#ff9d3f')
  expect(farbig).toContain('stroke="#ff9d3f"')
  expect(farbig).not.toContain('currentColor')
  // Alles andere bleibt gleich — nur die Farbe kommt dazu.
  expect(farbig.replace('stroke="#ff9d3f"', 'stroke="currentColor"')).toBe(iconFile('prometheus'))
})

test('die Dateien auf der Platte stimmen mit der Quelle', () => {
  /*
   * **Der Stand, der veralten kann.** `svg/` ist ein Ergebnis (`build.mjs`), `src/shapes.ts` ist die
   * Quelle. Wer nur die Quelle ändert, hat danach zwei Wahrheiten — eine im Code und eine im
   * weitergegebenen Zeichensatz. Geprüft wird deshalb **beides**: daß jede erwartete Datei da ist
   * und gleich lautet, und daß keine da ist, die niemand mehr erzeugt.
   */
  const ziel = join(import.meta.dirname, '..', 'svg')
  const fehler: string[] = []
  for (const name of ICON_NAMES) {
    let vorhanden: string | null = null
    try {
      vorhanden = readFileSync(join(ziel, `${name}.svg`), 'utf8')
    } catch {
      fehler.push(`fehlt: ${name}.svg`)
      continue
    }
    if (vorhanden !== iconFile(name)) fehler.push(`abweichend: ${name}.svg`)
  }
  try {
    if (readFileSync(join(ziel, 'sprite.svg'), 'utf8') !== `${spriteMarkup()}\n`) {
      fehler.push('abweichend: sprite.svg')
    }
  } catch {
    fehler.push('fehlt: sprite.svg')
  }
  const erwartet = new Set([...ICON_NAMES.map((n) => `${n}.svg`), 'sprite.svg', 'index.html', 'README.md'])
  for (const datei of readdirSync(ziel)) {
    if (!erwartet.has(datei)) fehler.push(`ueberzaehlig (erzeugt niemand mehr): ${datei}`)
  }
  expect(fehler.join('\n')).toBe('')
})

test('ein Element entsteht nur mit einem Dokument, das eine Vorlage kennt', () => {
  // **Warum `<template>` und nicht `innerHTML` am Zielknoten.** Ein `<path>`, der als HTML geparst
  // wird, landet im HTML-Namensraum — und wird **nicht gezeichnet**. Der Weg über die Vorlage parst
  // im richtigen Namensraum und hängt noch nichts an die Seite.
  const gerufen: string[] = []
  const dokument = {
    createElement: (tag: string) => {
      gerufen.push(tag)
      return {
        set innerHTML(wert: string) {
          gerufen.push(wert.slice(0, 4))
        },
        content: { firstElementChild: { tagName: 'svg' } },
      }
    },
  } as unknown as Document
  const element = iconElement(dokument, 'chat')
  expect(gerufen).toContain('template')
  expect(gerufen).toContain('<svg')
  expect((element as unknown as { tagName: string }).tagName).toBe('svg')

  // Und der ehrliche Fehlerfall: eine Vorlage, die nichts hergibt.
  const leer = { createElement: () => ({ innerHTML: '', content: { firstElementChild: null } }) } as unknown as Document
  expect(() => iconElement(leer, 'chat')).toThrow()
})
