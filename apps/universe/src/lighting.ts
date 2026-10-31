/**
 * Licht und Bahnen.
 *
 * **Warum das fehlte:** Die erste Fassung zeichnete jede Kugel mit einem Grundmaterial, das
 * Licht **ignoriert**. Dadurch sah alles flach aus wie ein Aufkleber — der Betreiber hat es
 * sofort gesehen („licht simulation fehlt"). Schlimmer: ein Stern, der nichts beleuchtet,
 * ist kein Stern. Deshalb hier:
 *
 *   - **Punktlicht je Stern.** Es sitzt im Zentrum des Sonnensystems und beleuchtet seine
 *     Planeten. Die Sonne ist damit nicht Dekoration, sondern die Ursache des Lichts.
 *   - **Bahnen als Ringe**, nicht als Kreise auf dem Bildschirm: sie liegen **in der Welt**
 *     in der Bahnebene. Durch die Perspektive erscheinen sie von selbst als Ellipsen — und
 *     wenn die Kamera kippt, kippen sie mit. Das ist der Unterschied zwischen einer
 *     gezeichneten Ellipse und einer echten Bahn.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  SRGBColorSpace,
  SphereGeometry,
  Texture,
} from 'three'
import type { Body } from './universe'
import { lookFor } from './bodies'

/** Kugelvorrat: eine Geometrie fuer alle Objekte. Tausend gleiche Geometrien waeren Unsinn. */
export const SPHERE = new SphereGeometry(1, 24, 16)

/**
 * Material eines Sterns: leuchtet aus sich heraus.
 *
 * `emissive` ist der Teil, der **ohne** Licht strahlt — genau das, was einen Stern von einem
 * Planeten unterscheidet. Ohne diese Zeile waere die Sonne im eigenen Licht schwarz.
 */
export function starMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    emissive: new Color(color),
    emissiveIntensity: 1.6,
    roughness: 0.5,
  })
}

/** Material eines Planeten: unbeleuchtet dunkel, vom Stern beschienen hell. */
export function surfaceMaterial(color: string, map?: Texture | null): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: new Color(color), roughness: 0.85, metalness: 0.05 })
  if (map) material.map = map
  return material
}

/**
 * **Eine Zeichnung als Textur auf der Kugel.**
 *
 * **Warum SVG hier funktioniert, obwohl three.js keine SVG-Datei lädt.** Der Umweg ist ein
 * Daten-URL: der SVG-Text wird als `data:image/svg+xml` in ein `Image` gesteckt, und der Browser
 * **rastert** ihn beim Laden. Für die Kugel liegt das Ergebnis als gewöhnliche Textur vor — mit
 * einem Vorteil, den ein gemaltes Canvas nicht hat: die Zeichnung ist **geschrieben**, nicht
 * zufällig erzeugt. Krater, Wolkenbänder und der grosse rote Fleck stehen als Pfade da und sehen
 * bei jedem Start gleich aus. Der Betreiber: „nutze svg bilder passend zur naming des planeten".
 *
 * **Warum `SRGBColorSpace`.** Ohne die Angabe behandelt three.js die Textur als linearen Wert, und
 * die Farben kommen **zu dunkel** an — ein Fehler, der wie „die Sonne ist aus" aussieht.
 */
export function svgTexture(svg: string): Texture {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  const bild = new Image()
  const texture = new Texture(bild)
  texture.colorSpace = SRGBColorSpace
  bild.addEventListener('load', () => {
    texture.needsUpdate = true
  })
  bild.src = url
  return texture
}

/**
 * Ein **Schweif** statt eines festen Rings.
 *
 * **Warum die Ringe weg sind.** Ein Ring sagt nur „hier *kann* der Koerper sein". Der
 * Betreiber: „die striche kreis da kannst du es entfernen und es eher als eine art verlauf
 * machen weisse bahn oder so oder passend zur Planeten farbe die sollte dann auch irgendwann
 * wieder verschwinden eine art schweif." Ein Schweif sagt „hier **war** er gerade" — das ist
 * die Aussage, die Bewegung traegt.
 *
 * **Wie er funktioniert.** Die Punkte sind **nicht** gespeicherte Vergangenheit, sondern
 * ausgerechnet: fuer jeden Punkt wird die Lage zu einem frueheren Zeitpunkt gesetzt. Der
 * Schweif ist damit immer genau die Bahn, die der Koerper tatsaechlich genommen hat — und er
 * ist bei jedem Bild konsistent, ohne Historie im Speicher.
 *
 * **Das Verblassen** kommt aus einer Farbzusage je Punkt (RGBA): am Koerper die Planetenfarbe
 * voll, hinten durchsichtig. Eine einzige Linie, ein einziger Zeichenaufruf.
 */
export function buildTrail(color: string, segments: number): Line {
  const geometry = new BufferGeometry()
  const position = new Float32Array(segments * 3)
  const rgba = new Float32Array(segments * 4)

  const base = new Color(color)
  for (let i = 0; i < segments; i++) {
    // Am Koerper (i = 0) kraeftig, nach hinten ausklingend — quadratisch, damit das Ende
    // wirklich verschwindet und nicht als harte Kante stehen bleibt.
    const t = 1 - i / (segments - 1)
    const alpha = t * t
    const offset = i * 4
    rgba[offset] = base.r
    rgba[offset + 1] = base.g
    rgba[offset + 2] = base.b
    rgba[offset + 3] = alpha
  }

  geometry.setAttribute('position', new Float32BufferAttribute(position, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(rgba, 4))
  return new Line(
    geometry,
    new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }),
  )
}

/**
 * Aktualisiert die Punkte eines Schweifs.
 *
 * `lage(t)` liefert die Weltkoordinate zum Zeitpunkt `t` — die Rechnung bleibt damit dort, wo
 * die Bahn definiert ist (`scene.ts`), und diese Datei kuemmert sich nur um die Linie.
 */
export function updateTrail(
  line: Line,
  segments: number,
  headSeconds: number,
  spanSeconds: number,
  lage: (t: number) => readonly [number, number, number],
): void {
  const attribute = line.geometry.getAttribute('position')
  const array = attribute.array as Float32Array
  for (let i = 0; i < segments; i++) {
    const t = headSeconds - (i / (segments - 1)) * spanSeconds
    const [x, y, z] = lage(t)
    array[i * 3] = x
    array[i * 3 + 1] = y
    array[i * 3 + 2] = z
  }
  attribute.needsUpdate = true
  line.geometry.computeBoundingSphere()
}

/**
 * Ein Stern mit seinem Licht.
 *
 * **Zwei Fallen, in die die erste Fassung getappt ist — die Welt wurde davon schwarz:**
 *
 *  1. **`decay: 1.4`** laesst die Helligkeit mit dem Quadrat des Abstands fallen. Ein Planet
 *     in 4000 Einheiten Entfernung bekommt dann praktisch kein Licht mehr, und alles
 *     ausserhalb der Sonne versinkt im Schwarz. Ein **Stern** leuchtet weit — genau das
 *     unterscheidet ihn von einer Gluehbirne. Deshalb `decay: 0`: die Helligkeit bleibt
 *     gleich, und `distance` begrenzt nur die **Reichweite**.
 *  2. **Zu schwache Grundhelligkeit.** Ohne sie ist die Nachtseite eines Planeten voellig
 *     schwarz; er wirkt dann nicht wie eine Kugel, sondern wie ein Halbmond-Aufkleber.
 */
export function buildStar(
  body: Body,
  minSize = 0,
): { readonly mesh: Mesh; readonly light: PointLight } {
  // Die Mindestgroesse kommt vom Abstand (siehe `scene.ts`). Ohne sie wird die Sonne beim
  // Herauszoomen zu einem Punkt — und ein Punkt beleuchtet nichts.
  const scale = Math.max(body.radius * 0.55, 34, minSize)

  /*
   * **Die Sonne bekommt ihre Zeichnung — und zwar als `emissiveMap`.**
   *
   * Das ist der Unterschied, den der Betreiber gesehen hat („die sonne sieht nicht wie eine sonne
   * aus"). Ein Stern leuchtet **aus sich heraus**: seine Zeichnung darf nicht vom Licht abhängen,
   * sonst ist die beleuchtete Hälfte hell und die andere schwarz — und eine halb schwarze Sonne ist
   * keine Sonne. `emissiveMap` legt die Zeichnung auf den Teil, der von selbst strahlt.
   */
  const aussehen = lookFor(body.name) ?? lookFor(body.id)
  const material = starMaterial(body.color)
  if (aussehen) {
    const textur = svgTexture(aussehen.svg)
    material.emissiveMap = textur
    material.map = textur
    material.emissiveIntensity = 1.9
  }
  const mesh = new Mesh(SPHERE, material)
  mesh.scale.setScalar(scale)

  /*
   * **Der Glorienschein — additiv, ohne Tiefenschreiben.**
   *
   * Die Sonne war eine flache Scheibe: das Emissiv-Material färbt die Kugel, aber
   * ein Stern hat keinen Rand. Ein zweiter, größerer Ball mit additiver Blende
   * legt einen weichen Hof um den Kern; `depthWrite: false` verhindert, dass er
   * die Planeten dahinter verdeckt.
   */
  const glow = new Mesh(
    SPHERE,
    new MeshBasicMaterial({
      color: new Color(body.color),
      transparent: true,
      opacity: 0.16,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  )
  glow.scale.setScalar(1.85)
  mesh.add(glow)

  // `decay: 0` heisst: die Helligkeit nimmt **nicht** mit dem Abstand ab. Der Stern beleuchtet
  // damit seine ganze Umgebung; `distance` begrenzt die Reichweite, damit ein Stern nicht die
  // Nachbargalaxie mitbeleuchtet.
  const light = new PointLight(new Color(body.color), 2.6, scale * 60, 0)
  return { mesh, light }
}

/**
 * Eine **Oberflaeche** fuer einen Planeten — prozedural gemalt, ohne Datei.
 *
 * **Warum keine SVG-Datei.** Der Betreiber wuenschte sich „eine svg bild erstellen als kugel
 * die man schauen kann drehen kann". Der Wunsch ist richtig — eine einfarbige Kugel zeigt
 * nicht, dass sie sich dreht. Der Weg dahin ist aber ein **Textur-Abbild**: three.js nimmt
 * keine SVG-Datei fuer eine Kugeloberflaeche, sondern ein Bild. Deshalb wird das Bild
 * **hier gemalt** (Canvas) statt geladen:
 *
 *   - **keine Abhaengigkeit** und keine Datei im Projekt,
 *   - **kein Ladefehler**: die Textur ist da, wenn der Planet da ist,
 *   - **jeder Planet sein eigenes Muster** — Streifen fuer die Gasriesen, Flecken fuer die
 *     Gesteinsplaneten.
 *
 * Es ist **kein** photosharfer Planet, und das soll es nicht sein: es ist genug Muster, damit
 * das Auge eine Kugel als Koerper erkennt statt als Kreis.
 */
export function surfaceTexture(color: string, seed: number): CanvasTexture {
  const w = 256
  const h = 128
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return new CanvasTexture(canvas)

  const base = new Color(color)
  ctx.fillStyle = `#${base.getHexString()}`
  ctx.fillRect(0, 0, w, h)

  // Ein fester Zufallsstartwert je Koerper: derselbe Planet sieht bei jedem Laden gleich aus.
  let s = seed * 2654435761
  const rnd = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }

  // Streifen: die Gasriesen (Jupiter, Saturn) sind gebaendert, die Gesteinsplaneten fleckig.
  // Beides entsteht aus derselben Schleife — nur Hoehe und Deckkraft unterscheiden sich.
  const streifen = 14
  for (let i = 0; i < streifen; i++) {
    const y = (i / streifen) * h
    const hoehe = h / streifen + 2
    const heller = rnd() > 0.5
    const ton = base.clone()
    if (heller) ton.offsetHSL(0, -0.05, 0.12)
    else ton.offsetHSL(0, 0.05, -0.1)
    ctx.globalAlpha = 0.28 + rnd() * 0.3
    ctx.fillStyle = `#${ton.getHexString()}`
    ctx.fillRect(0, y, w, hoehe)
  }

  // Flecken: ein paar rundliche Aufhellungen, damit die Kugel Struktur bekommt.
  ctx.globalAlpha = 1
  for (let i = 0; i < 18; i++) {
    const cx = rnd() * w
    const cy = rnd() * h
    const r = 4 + rnd() * 16
    const ton = base.clone()
    ton.offsetHSL(0, 0, rnd() > 0.5 ? 0.1 : -0.12)
    ctx.globalAlpha = 0.18 + rnd() * 0.22
    ctx.fillStyle = `#${ton.getHexString()}`
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * 0.6, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  const texture = new CanvasTexture(canvas)
  // Ohne die richtige Farbraum-Angabe wirkt jede Textur zu dunkel — ein Fehler, der wie ein
  // Beleuchtungsproblem aussieht und keins ist.
  texture.colorSpace = SRGBColorSpace
  return texture
}

/** Der Zaehler fuer den Zufallsstartwert — jeder Koerper bekommt sein eigenes Muster. */
let textureSeed = 1

/** Ein Planet mit Oberflaeche. Der Radius ist bewusst **nicht** massstabsgetreu. */
export function buildPlanet(body: Body, minSize = 0): Mesh {
  /*
   * **Erst die Zeichnung, dann die Farbe.**
   *
   * Hat der Körper eine benannte Zeichnung (`Erde`, `Mars`, …), bekommt er sie; sonst bleibt es bei
   * der prozeduralen Fläche aus seiner Farbe. Das ist der Unterschied zwischen „eine Kugel mit
   * Rauschen" und „der Mars": der Betreiber hat ihn sofort gesehen.
   *
   * **Die Textur kommt auch auf kleine Körper.** Vorher hing sie an `radius >= 16` — eine
   * Ersparnis, die sich nicht lohnt: ein Bild von 512 × 256 kostet wenige Kilobyte, und ein Planet
   * ohne Zeichnung ist bei jedem Zoom ein farbiger Punkt.
   */
  const aussehen = lookFor(body.name) ?? lookFor(body.id)
  const material = surfaceMaterial(
    body.color,
    aussehen ? svgTexture(aussehen.svg) : body.radius >= 16 && typeof document !== 'undefined' ? surfaceTexture(body.color, (textureSeed += 1)) : null,
  )
  const mesh = new Mesh(SPHERE, material)
  mesh.scale.setScalar(Math.max(body.radius, 9, minSize))
  return mesh
}

/**
 * Ein schwaches Grundlicht.
 *
 * Es ist **nicht** die Sonne. Es ist nur genug Licht, damit die Nachtseite eines Planeten
 * nicht vollkommen schwarz ist — ohne das verschwindet die Haelfte jeder Kugel im Nichts und
 * sie wirkt flach statt rund.
 */
export function fillLight(): HemisphereLight {
  return new HemisphereLight(0x9aa4b2, 0x14100c, 0.55)
}

/**
 * Wie weit der Stern leuchtet — als Zahl, damit Kamera und Szene **dieselbe** Annahme haben.
 *
 * Ohne diese geteilte Zahl setzt die Kamera ihre ferne Ebene zu klein, und die eigenen
 * Planeten verschwinden im Nichts. Genau dieser Fehler war in der ersten Fassung.
 */
export function lightReach(starRadius: number): number {
  return Math.max(starRadius * 0.55, 34) * 90
}
