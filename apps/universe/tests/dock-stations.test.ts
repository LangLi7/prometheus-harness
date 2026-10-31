/**
 * **Die Andockstellen — als Tabelle geprueft, nicht als Gefuehl.**
 *
 * Der Auftrag: „**diese docking station objekt logic koennten wir ja implementieren das es quasi
 * bestimmte stellen erleichtert und auch den objekte selbst auch orientiert**".
 *
 * Was hier bewiesen wird, ist genau das — und zwar **gegen den Zustand vorher**, damit die Tests den
 * Fehler festhalten und nicht nur die neue Regel:
 *
 *   1. **Bestimmte Stellen**: es gibt sie, sie sind endlich, und ihre Lage kommt aus der gemessenen
 *      Zone — nicht aus einem Bildschirmrand.
 *   2. **Erleichtert**: jede Stelle hat einen Fangbereich. Man muss sie **meinen**, nicht treffen.
 *   3. **Orientiert**: die Lage im Kasten folgt der Stelle — am Rand, und das zweite Objekt daneben
 *      statt darauf.
 *   4. **Kein Zufall mehr**: „Mitte oben" ist **kein** Abstecken. Vorher war es das, und ein Panel
 *      verschwand („wen ich zb in mitte rot rein tue verschwindet es einfach").
 */
import { expect, test } from 'bun:test'
import { GLUE_GAP, dockStations, glueTo, stationAt, stationPlacement, zoneRects } from '../src/docking'

/**
 * **Ein Fenster fuer die Rechnung.**
 *
 * `stationPlacement` richtet ein Objekt im **Bild** aus und liest dafuer `innerWidth` und `innerHeight`
 * — reine Zahlen, die jede Umgebung liefert. Im Browser ist das das Fenster; hier die Attrappe, und
 * zwar **mit den Maßen, die `tools/dock-stations.js` gemessen hat** (1440 x 900). Damit prueft der Test
 * genau die Lage, die der Betreiber sieht.
 */
Object.defineProperty(globalThis, 'window', {
  value: { innerWidth: 1440, innerHeight: 900 },
  configurable: true,
  writable: true,
})

/** Ein Fenster, wie es `tools/dock-stations.js` gemessen hat: 1440 x 900. */
const fenster = { b: 1440, h: 900 }

/** Die Insel, gemessen: 181 x 40 px, oben in der Mitte. */
const insel = { x: 441, y: 15, w: 181, h: 40 }

/**
 * **Die Zonen, wie sie gemessen wurden.**
 *
 * `tools/dock-stations.js` vor dem Umbau:
 *
 *     left     0 / 0     280 x 900
 *     right    (aus)
 *     bottom   0 / 755  1440 x 145
 */
const zonenLinksUnten = zoneRects(
  fenster,
  { links: 280, rechts: 260, unten: 145 },
  { links: true, rechts: false, unten: true },
)

test('die Zonen werden aus Breiten und Offenheit gerechnet — nicht gemessen', () => {
  expect(zonenLinksUnten.map((z) => z.zone)).toEqual(['left', 'bottom'])
  const links = zonenLinksUnten[0]!
  expect(links.w).toBe(280)
  expect(links.h).toBe(900)
  const unten = zonenLinksUnten[1]!
  // Die untere Zone liegt **am unteren Rand**: 900 - 145 = 755.
  expect(unten.y).toBe(755)
  expect(unten.w).toBe(1440)
  // Die rechte Zone ist aus — es gibt sie also nicht, und sie bekommt auch keine Stelle.
  expect(zonenLinksUnten.some((z) => z.zone === 'right')).toBe(false)
})

test('zu jeder offenen Zone gehoert genau eine Stelle', () => {
  const stellen = dockStations(fenster, zonenLinksUnten, insel)
  expect(stellen.map((s) => s.id)).toEqual(['zone-left', 'zone-bottom', 'insel'])
})

test('eine geschlossene Zone bekommt keine Stelle — sonst zieht man ins Leere', () => {
  const nurLinks = zoneRects(fenster, { links: 280, rechts: 260, unten: 145 }, {
    links: true,
    rechts: false,
    unten: false,
  })
  const stellen = dockStations(fenster, nurLinks, insel)
  expect(stellen.some((s) => s.id === 'zone-bottom')).toBe(false)
  expect(stellen.some((s) => s.id === 'zone-right')).toBe(false)
})

test('jede Stelle hat einen Fangbereich — man muss sie meinen, nicht treffen', () => {
  const stellen = dockStations(fenster, zonenLinksUnten, insel)
  /*
   * **Auch die kleinste Stelle ist mit dem Zeiger erreichbar.**
   *
   * Gemessen sind die Zugaben 140 (links, halbe Breite), 145 (unten, ihre Hoehe) und 108 (Insel,
   * 12 % der kleineren Fensterseite). Die Insel hat damit den **kleinsten** Fangbereich — und trotzdem
   * einen, der fast dreimal so gross ist wie sie selbst (181 x 40 px): ohne ihn waere das Abstecken eine
   * Zieluebung mit einer Pille.
   *
   * Hier stand zuerst „die Insel hat den groessten Fangbereich". Das war eine **Erwartung ohne
   * Rechnung**: 108 ist kleiner als 140. Genau deshalb steht die Zahl jetzt im Test.
   */
  for (const s of stellen) expect(s.margin).toBeGreaterThanOrEqual(100)
  const links = stellen.find((s) => s.id === 'zone-left')!
  const inselStelle = stellen.find((s) => s.id === 'insel')!
  // Die Insel ist die kleinste Stelle — ihre Flaeche ist um Groessenordnungen kleiner …
  expect(links.rect.w * links.rect.h).toBeGreaterThan(inselStelle.rect.w * inselStelle.rect.h * 20)
  // … und ihr Fangbereich ist trotzdem grosszuegig gegen sie selbst.
  expect(inselStelle.margin).toBeGreaterThan(inselStelle.rect.h * 2)
})

test('die Insel ist eine Stelle, die absteckt — vorher war sie nur ein Zufall der Lage', () => {
  const stellen = dockStations(fenster, zonenLinksUnten, insel)
  const treffer = stationAt(441 + 90, 15 + 20, stellen)
  expect(treffer?.id).toBe('insel')
  expect(treffer?.zone).toBe('closed')
})

test('Mitte oben steckt NICHT ab — das war der gemeldete Fehler', () => {
  const stellen = dockStations(fenster, zonenLinksUnten, insel)
  /*
   * „Mitte oben" (720, 40) lag vorher **im Absteckbereich** (`y < edgeY`), und der Betreiber hat genau
   * das gesehen: „wen ich zb in mitte rot rein tue verschwindet es einfach".
   *
   * Jetzt liegt dort **keine** Stelle: die Insel endet bei 441 + 181 = 622, und ihr Fangbereich reicht
   * bis 730 — aber die linke Stelle beginnt bei 0 und reicht bis 420. Zwischen 730 und 1160 (rechts ist
   * aus) ist nichts. Genau dort ist „Mitte".
   */
  const treffer = stationAt(820, 40, stellen)
  expect(treffer).toBeNull()
})

test('die engste Stelle gewinnt — und der Fangbereich traegt ihren Namen weiter', () => {
  const stellen = dockStations(fenster, zonenLinksUnten, insel)
  /*
   * **Der Fangbereich gehoert zur Stelle, mit der er kommt.**
   *
   * Ein Punkt neben der Insel (y = 120) liegt **ausserhalb** ihres Kastens (15 … 55), aber in ihrem
   * Fangbereich (Zugabe 108). Er muss also `insel` ergeben — nicht `zone-left`, deren Fangbereich dort
   * ebenfalls reicht (bis x = 420). Ohne die Regel „die engste gewinnt" entschiede hier die Reihenfolge
   * im Quelltext, und die Insel verloere gegen die Zone.
   */
  const nahe = stationAt(500, 120, stellen)
  expect(nahe?.id).toBe('insel')
  expect(nahe?.zone).toBe('closed')
  /*
   * Und der Gegenbeweis: der Fangbereich der Insel endet bei y = 15 + 40 + 108 = 163. Ein Punkt neben
   * ihr, aber nicht mehr in ihrem Band, gehoert der Stelle, in deren Band er liegt — und traegt deren
   * Namen. Der Fangbereich gehoert immer zur Stelle, mit der er kommt.
   */
  const daneben = stationAt(1000, 300, stellen)
  expect(daneben?.id).toBeUndefined()
})

test('die Insel faengt NUR in ihrem eigenen Band ab — sie ist ein Punkt, keine Kante', () => {
  const stellen = dockStations(fenster, zonenLinksUnten, insel)
  /*
   * **Ihr Band, nachgerechnet.** Der Kasten liegt bei x = 441 … 622, y = 15 … 55; die Zugabe ist 108
   * (12 % der kleineren Fensterseite, mindestens 56). Damit reicht sie von x = 333 … 730 und
   * y = -93 … 163 — also **nur** um sich selbst herum.
   *
   * **Warum das geprueft wird:** waere die Insel wie eine Zone behandelt worden (`randlos`), finge sie
   * ein Objekt ab, das ganz **unten** in der Mitte losgelassen wird — und steckte es ab. Genau der
   * Fehler, den der Betreiber gemeldet hat: „wen ich zb in mitte rot rein tue verschwindet es einfach".
   */
  expect(stationAt(500, 40, stellen)?.id).toBe('insel')
  // Am unteren Rand ihres Bands ist sie noch zustaendig …
  expect(stationAt(500, 150, stellen)?.id).toBe('insel')
  /*
   * **… und darunter liegt keine Stelle mehr.**
   *
   * Die Insel endet bei y = 163, und die linke Stelle reicht mit ihrer Zugabe bis x = 420 — ein Punkt
   * bei x = 500, y = 200 liegt also **zwischen** beiden. Er ist damit keiner Stelle zuzuordnen, und das
   * Objekt bliebe dort schwebend. Vorher steckte es ab, weil „oben" war, wo die Regel „abstecken" sagte.
   */
  expect(stationAt(500, 200, stellen)).toBeNull()
  /*
   * In der **eigenen Spalte** der linken Stelle (bis x = 420) ist sie dagegen auf **jeder** Hoehe
   * zustaendig — das ist der Unterschied zwischen einer Kante und einem Punkt im Bild.
   */
  for (const y of [200, 300, 600]) {
    expect(stationAt(300, y, stellen)?.id).toBe('zone-left')
  }
  expect(stationAt(300, 860, stellen)?.id).toBe('zone-bottom')
  // Und unterhalb der unteren Stelle: die, nicht die Insel.
  expect(stationAt(500, 860, stellen)?.id).toBe('zone-bottom')
  /*
   * **Dieselbe Stelle, ohne die Insel im Weg.**
   *
   * Ihre Zugabe ist die halbe Breite (140), sie reicht also bis x = 420. Genau daran sieht man, dass die
   * Insel die **engere** Stelle ist: mit ihr gehoert x = 500 in ihrem Band noch zu ihr, ohne sie ist es
   * niemandes Band mehr. Das ist der Unterschied zwischen „welche Stelle ist gemeint" und „welcher Rand
   * ist am naechsten" — bei einem Rand gaebe es hier keine zwei Antworten.
   */
  const ohneInsel = dockStations(fenster, zonenLinksUnten)
  for (const y of [200, 300, 600]) {
    expect(stationAt(300, y, ohneInsel)?.id).toBe('zone-left')
  }
  expect(stationAt(420, 300, ohneInsel)?.id).toBe('zone-left')
  expect(stationAt(421, 300, ohneInsel)).toBeNull()
  expect(stationAt(500, 300, ohneInsel)).toBeNull()
  // Und weit weg davon ist keine Stelle: dort schwebt es.
  expect(stationAt(900, 400, ohneInsel)).toBeNull()
})

test('die untere Stelle faengt in der ganzen Breite — sie ist so breit wie das Fenster', () => {
  const stellen = dockStations(fenster, zonenLinksUnten, insel)
  for (const x of [40, 700, 1400]) {
    expect(stationAt(x, 860, stellen)?.id).toBe('zone-bottom')
  }
})

test('das erste Objekt liegt AM RAND der Stelle, nicht in ihrer Mitte', () => {
  const stellen = dockStations(fenster, zonenLinksUnten, insel)
  const links = stellen.find((s) => s.id === 'zone-left')!
  const lage = stationPlacement(links, { w: 280, h: 400 })
  // An der linken Kante steht die Stelle selbst — also liegt das Objekt bei x = 0 (Rand) + Abstand.
  expect(lage.x).toBe(GLUE_GAP)
  expect(lage.y).toBe(GLUE_GAP)
})

test('das zweite Objekt legt sich NEBEN das erste — nicht darauf', () => {
  const stellen = dockStations(fenster, zonenLinksUnten, insel)
  const links = stellen.find((s) => s.id === 'zone-left')!
  const erstes = stationPlacement(links, { w: 280, h: 400 })
  const zweites = stationPlacement(links, { w: 280, h: 300 }, [
    { x: erstes.x, y: erstes.y, w: 280, h: 400 },
  ])
  // An der linken Stelle (senkrecht) rutscht es **nach unten**.
  expect(zweites.x).toBe(erstes.x)
  expect(zweites.y).toBe(erstes.y + 400 + GLUE_GAP)
})

test('an der unteren Stelle rutscht das zweite Objekt nach RECHTS — die Stelle gibt die Richtung', () => {
  const stellen = dockStations(fenster, zonenLinksUnten, insel)
  const unten = stellen.find((s) => s.id === 'zone-bottom')!
  /*
   * **Der Kasten der unteren Stelle ist nur 145 px hoch.**
   *
   * Deshalb liegt das Objekt **unten im Bild** und nicht an der Oberkante der Stelle: die Stelle gibt
   * die Richtung, das Bild die Grenze. Ein Objekt, das höher ist als die Stelle, stuende sonst unter dem
   * Bildrand.
   */
  /*
   * **Der Kasten der unteren Stelle ist nur 145 px hoch — und genau das ist die Ausrichtung.**
   *
   * Sie ist eine **Ecke**: nach oben ist kein Platz mehr (der Bildrand), also liegt ihr erstes Objekt an
   * ihrem eigenen Rand — bei y = 755, mit einem Abstand zur linken Kante wie ueberall. Ihre Querachse ist
   * die **Breite des Fensters** (1440 px), und dort ist Platz fuer viele Objekte nebeneinander.
   */
  const groesse = { w: 420, h: 120 }
  const erstes = stationPlacement(unten, groesse)
  expect(erstes.x).toBe(unten.rect.x)
  expect(erstes.y).toBe(unten.rect.y)
  /*
   * Und das zweite liegt **daneben, nicht darauf**: es rutscht nach rechts, mit demselben Abstand. Ohne
   * diese Regel lagen beide genau uebereinander und saehen aus wie eines — der gemeldete Fall
   * „dockingstuff wurde einfach rein getan plop auftaucht".
   */
  const zweites = stationPlacement(unten, groesse, [{ x: erstes.x, y: erstes.y, ...groesse }])
  expect(zweites.y).toBe(erstes.y)
  expect(zweites.x).toBe(erstes.x + groesse.w + GLUE_GAP)
})

test('kein Objekt ragt aus dem Bild — die Stelle gibt die Richtung, das Bild die Grenze', () => {
  const rechts = dockStations(
    fenster,
    zoneRects(fenster, { links: 280, rechts: 260, unten: 145 }, { links: false, rechts: true, unten: false }),
    insel,
  ).find((s) => s.id === 'zone-right')!
  expect(rechts.axis.platz).toBe('rechts')
  /*
   * Die rechte Stelle liegt bei 1440 - 260 = 1180. Ihre **Kante** ist der Bezug — ein Objekt liegt also
   * rechts von ihr, mit dem Abstand. Waere der **Kasten** die Grenze (1180 + 260), laege ein 200 px
   * breites Objekt bei 1440 und damit **ausserhalb** des Bildes.
   */
  expect(rechts.rect.x).toBe(1180)
  expect(rechts.rect.w).toBe(260)
  expect(stationPlacement(rechts, { w: 200, h: 300 }).x).toBe(1440 - 200)
  // Und eines, das nicht mehr passt, wird hereingeholt — nicht abgeschnitten.
  expect(stationPlacement(rechts, { w: 1600, h: 300 }).x).toBe(0)
})

test('der Klebstoff rastet zwei Nachbarn buendig ineinander', () => {
  const nachbar = { x: 100, y: 100, w: 300, h: 200 }
  // Fast rechts daneben: 4 px daneben und 3 px versetzt — das ist ein Nachbar.
  const geklebt = glueTo({ x: 100 + 300 + GLUE_GAP + 4, y: 103 }, [nachbar])
  expect(geklebt.x).toBe(100 + 300 + GLUE_GAP)
  expect(geklebt.y).toBe(103)
})

test('der Klebstoff zieht NICHT — ein absichtlich freies Objekt wird nicht eingefangen', () => {
  const nachbar = { x: 100, y: 100, w: 300, h: 200 }
  // Weit weg: es bleibt, wo es ist.
  const frei = glueTo({ x: 900, y: 600 }, [nachbar])
  expect(frei).toEqual({ x: 900, y: 600 })
})

test('der Klebstoff haelt auch UNTER einem Nachbarn', () => {
  const nachbar = { x: 400, y: 100, w: 300, h: 200 }
  const geklebt = glueTo({ x: 402, y: 100 + 200 + GLUE_GAP - 5 }, [nachbar])
  expect(geklebt.y).toBe(100 + 200 + GLUE_GAP)
  expect(geklebt.x).toBe(402)
})
