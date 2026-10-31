/**
 * **Objekte in der Flaeche — die Regeln, ohne Browser geprueft.**
 *
 * Betreiber: „**also objecte aka datei möglichkeit drag and drop genauso später zb in eine art
 * workspaces definieren zu was es gehört also kann man und daraus die möglichkeit geben das der harness
 * Prometheus diese datei sieht**".
 *
 * Das ist **Stufe 1** von dreien: ablegen und verschieben. Was hier geprueft wird, ist genau das, was
 * schiefgehen kann — und jede Pruefung steht fuer einen Fehler, den man sonst erst im Bild sieht:
 *
 *   - Eine Datei, die **halb aus dem Bild** faellt, ist nicht mehr zu greifen.
 *   - Zwei Dateien am **selben** Platz sehen aus wie eine.
 *   - Ein Klick trifft das **verdeckte** Objekt statt das sichtbare.
 *   - Eine kaputte Ablage macht aus dem Bild eine Karte an der Stelle `NaN`.
 */
import { expect, test } from 'bun:test'
import {
  CARD,
  dropPosition,
  emptyLayout,
  kindOf,
  loadLayout,
  makeId,
  moveObject,
  objectAt,
  removeObject,
  saveLayout,
} from '../src/canvas-objects'
import type { CanvasObject } from '../src/canvas-objects'
import { formatBytes } from '../src/canvas-view'

const fenster = { b: 1200, h: 800 }

test('eine abgelegte Datei landet unter dem Zeiger — mittig, nicht in der Ecke', () => {
  const stelle = dropPosition(600, 400, fenster)
  // Der Zeiger zeigt auf die **Mitte** der Karte.
  expect(stelle.x + CARD.w / 2).toBeCloseTo(600, 0)
  expect(stelle.y + CARD.h / 2).toBeCloseTo(400, 0)
})

test('eine Datei am Rand bleibt IM Bild — sonst ist sie nicht mehr zu greifen', () => {
  const links = dropPosition(2, 2, fenster)
  expect(links.x).toBeGreaterThanOrEqual(0)
  expect(links.y).toBeGreaterThanOrEqual(0)
  const rechts = dropPosition(1199, 799, fenster)
  // Die Karte endet vor dem Rand, nicht dahinter.
  expect(rechts.x + CARD.w).toBeLessThanOrEqual(fenster.b)
  expect(rechts.y + CARD.h).toBeLessThanOrEqual(fenster.h)
})

test('mehrere Dateien auf einmal liegen NEBENEINANDER, nicht aufeinander', () => {
  /*
   * Der Versatz ist der Grund: legt man fuenf Dateien an derselben Stelle ab, lagen sie ohne ihn
   * **genau uebereinander** — und man saehe eine Karte, obwohl fuenf da sind.
   */
  const stellen = [0, 1, 2, 3].map((i) => dropPosition(600, 400, fenster, i))
  const eindeutig = new Set(stellen.map((s) => `${s.x},${s.y}`))
  expect(eindeutig.size).toBe(4)
})

test('verschieben setzt die Lage und haelt sie im Bild', () => {
  const layout = {
    objects: [{ id: 'a', name: 'x.pdf', kind: 'pdf', size: 10, x: 100, y: 100 }],
  }
  const bewegt = moveObject(layout, 'a', 500, 400, fenster)
  expect(bewegt.objects[0]?.x).toBe(500)
  expect(bewegt.objects[0]?.y).toBe(400)
  // Und weit ausserhalb wird sie eingefangen statt abgeschnitten.
  const weit = moveObject(layout, 'a', 99999, 99999, fenster)
  expect(weit.objects[0]?.x).toBe(fenster.b - CARD.w - 4)
  expect(weit.objects[0]?.y).toBe(fenster.h - CARD.h - 4)
})

test('ein Klick trifft das OBERE Objekt, nicht das verdeckte', () => {
  /*
   * Von **hinten** gesucht: das zuletzt abgelegte liegt oben. Eine Suche von vorne traefe das
   * verdeckte darunter — ein Fehler, der nur bei ueberlappenden Karten auffaellt.
   */
  const layout = {
    objects: [
      { id: 'unten', name: 'unten.pdf', kind: 'pdf', size: 10, x: 100, y: 100 },
      { id: 'oben', name: 'oben.pdf', kind: 'pdf', size: 10, x: 110, y: 110 },
    ],
  }
  expect(objectAt(layout, 120, 120)?.id).toBe('oben')
  // Und daneben trifft es nichts.
  expect(objectAt(layout, 600, 600)).toBeNull()
})

test('entfernen nimmt genau eines weg', () => {
  const layout = {
    objects: [
      { id: 'a', name: 'a.pdf', kind: 'pdf', size: 1, x: 10, y: 10 },
      { id: 'b', name: 'b.pdf', kind: 'pdf', size: 1, x: 20, y: 20 },
    ],
  }
  const danach = removeObject(layout, 'a')
  expect(danach.objects.map((o) => o.id)).toEqual(['b'])
})

test('die Art kommt aus der Endung — auch bei Mehrfachpunkten', () => {
  expect(kindOf('bericht.pdf')).toBe('pdf')
  expect(kindOf('main.test.ts')).toBe('ts')
  expect(kindOf('README')).toBe('datei')
  // Ein Punkt am Anfang ist keine Endung — sonst waere `.gitignore` die Art „gitignore".
  expect(kindOf('.gitignore')).toBe('datei')
})

test('zwei gleichnamige Dateien bekommen VERSCHIEDENE Kennungen', () => {
  /*
   * Der Grund steht in `makeId`: heissen zwei Objekte gleich, findet die Suche das falsche. Der Name
   * allein genuegt deshalb nicht — die Groesse und die Zeit gehoeren dazu.
   */
  const a = makeId('bericht.pdf', 100, 1)
  const b = makeId('bericht.pdf', 100, 2)
  expect(a).not.toBe(b)
  expect(a).toContain('bericht')
})

test('eine kaputte Ablage macht aus dem Bild keine Karte an der Stelle NaN', () => {
  /*
   * Eine Ablage kann von Hand geaendert oder von einer aelteren Fassung geschrieben worden sein. Ein
   * Objekt ohne Zahlen waere im Bild eine Karte an `NaN` — unsichtbar und nicht zu greifen.
   */
  const kaputt = {
    version: 1,
    objects: [
      { id: 'gut', name: 'gut.pdf', kind: 'pdf', size: 10, x: 50, y: 60 },
      { id: 'ohne-zahlen', name: 'boese.pdf', kind: 'pdf', size: 10 },
      { id: 'mit-nan', name: 'nan.pdf', kind: 'pdf', size: 10, x: Number.NaN, y: 1 },
      null,
      42,
    ],
  }
  const wieder = JSON.parse(JSON.stringify(kaputt)) as unknown
  expect(Array.isArray((wieder as { objects: unknown[] }).objects)).toBe(true)
  // Die Pruefung sitzt in `loadLayout` — hier wird sie mit einem nachgebauten Speicher gefahren.
  const speicher = new Map<string, string>()
  const echt = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => speicher.get(k) ?? null,
      setItem: (k: string, v: string) => void speicher.set(k, v),
    },
    configurable: true,
  })
  try {
    saveLayout(kaputt as never, 'kaputt')
    const geladen = loadLayout('kaputt')
    expect(geladen.objects.map((o) => o.id)).toEqual(['gut'])
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: echt, configurable: true })
  }
})

test('die Anordnung ueberlebt einen Neustart', () => {
  const speicher = new Map<string, string>()
  const echt = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => speicher.get(k) ?? null,
      setItem: (k: string, v: string) => void speicher.set(k, v),
    },
    configurable: true,
  })
  try {
    const objekt: CanvasObject = { id: 'a', name: 'notiz.md', kind: 'md', size: 4096, x: 300, y: 200 }
    /*
     * **Und die Fassung gehoert dazu.**
     *
     * Hier stand zuerst nur `{ objects: [objekt] }` — und `loadLayout` verwarf es, weil `parsed.version`
     * nicht die aktuelle Fassung war. **Das war richtig so**, und der Test war falsch: die Ablage wird
     * verworfen, wenn die Voreinstellung sich geändert hat (siehe `LAYOUT_VERSION`), und eine Ablage
     * ohne Fassung ist genau dieser Fall.
     */
    saveLayout({ objects: [objekt], version: 1 }, 'raum')
    const wieder = loadLayout('raum')
    expect(wieder.objects.length).toBe(1)
    expect(wieder.objects[0]).toEqual(objekt)
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: echt, configurable: true })
  }
})

test('die Flaeche startet LEER — wie das Universe selbst', () => {
  expect(emptyLayout().objects).toEqual([])
})

test('eine Groesse wird gelesen, nicht gerechnet: 1,2 MB statt 1234567', () => {
  expect(formatBytes(512)).toBe('512 B')
  expect(formatBytes(1500)).toBe('1.5 kB')
  expect(formatBytes(2_500_000)).toBe('2.5 MB')
  expect(formatBytes(Number.NaN)).toBe('—')
})
