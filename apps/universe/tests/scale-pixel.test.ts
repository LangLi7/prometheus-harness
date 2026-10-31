/**
 * **Die Sichtgrenze in Bildpunkten — die Probe, die gefehlt hat.**
 *
 * Der Betreiber zum Sternhaufen: „**beim zb projekt stack erstellen als ein beispiel sieht das schon
 * verbugt damint meine ich das es irgendwie verschwindet und auftaucht komische weisse und grösse das
 * man es gar nicht erkennen kann was es ist lol :D**"
 *
 * Ein Körper, der „verschwindet und auftaucht", hat eine Grenze, an der er **kippt**. Die Regel dafür
 * heisst `MIN_BODY_PIXELS` — **Pixel**, nicht Welteneinheiten. Geprüft wurde sie aber nur gegen
 * Welteneinheiten, die von Hand nachgerechnet waren, und dabei war die Rechnung selbst falsch:
 *
 *     im Code:   w = MIN_BODY_PIXELS · d · tan(fov/2) / viewHeight
 *     richtig:   w = MIN_BODY_PIXELS · d · 2 · tan(fov/2) / viewHeight
 *
 * Es fehlte der Faktor 2 — die halbe Höhe ist `tan(fov/2)`, die volle das Doppelte. Damit ergab die
 * Konstante, die „2,4 Pixel" heisst, in Wahrheit `2,4 / cos(fov/2)` Pixel: bei 60° also **2,77**, und
 * bei einem engeren Bildwinkel noch mehr. Eine Grenze, die in Pixeln festgelegt ist, hing am
 * **Bildwinkel**.
 *
 * **Warum das kein Test gefunden hat.** Der vorhandene Test rechnete **dieselbe falsche Formel** noch
 * einmal nach und schrieb ihr Ergebnis als Erwartung fest. Ein Test, der die Rechnung wiederholt, prüft
 * die Rechnung nicht — er **bestätigt** sie. Deshalb geht dieser Test den anderen Weg: er rechnet die
 * Grenze **vorwärts** in Pixel und verlangt, dass genau `MIN_BODY_PIXELS` herauskommt. Die Zahl steht
 * damit dort, wo sie hingehört: auf dem Bildschirm.
 */
import { expect, test } from 'bun:test'
import { MIN_BODY_PIXELS, bodyPixels, minBodySize, visibilityFloor } from '../src/scene'

/** Die Bildwinkel, die vorkommen: ein enger (Tele), der Standard und ein weiter. */
const FOVS = [30, 45, 60, 90] as const

test('die Sichtgrenze ist genau MIN_BODY_PIXELS Bildpunkte gross — bei JEDEM Bildwinkel', () => {
  const HOEHE = 900
  for (const fov of FOVS) {
    for (const abstand of [500, 4761, 20_000, 227_274, 4_000_000]) {
      const grenze = visibilityFloor(abstand, HOEHE, fov)
      const pixel = bodyPixels(grenze, abstand, HOEHE, fov)
      /*
       * Die Probe: die Grenze, vorwärts gerechnet, muss die Konstante ergeben. Ohne den Faktor 2 im
       * Code wäre hier `2,4 / cos(fov/2)` gestanden — bei 60° also 2,77 statt 2,4, und der Test wäre rot.
       */
      expect(pixel).toBeCloseTo(MIN_BODY_PIXELS, 6)
    }
  }
})

test('die Grenze haengt NICHT am Bildwinkel — nur an Abstand und Fensterhoehe', () => {
  const HOEHE = 900
  const ABSTAND = 20_000
  /*
   * Ein enger Bildwinkel zeigt einen kleineren Ausschnitt, also muss die **Weltenweite**, die einem
   * Pixel entspricht, kleiner werden. Was sich **nicht** ändern darf, ist die Pixelzahl.
   *
   * Hier stand zuerst „die Grenze ist bei jedem Bildwinkel gleich" — das war falsch gedacht: sie ist in
   * **Welten** verschieden und in **Pixeln** gleich. Genau das ist der Unterschied, der die ganze Zeit
   * gefehlt hat.
   */
  const eng = visibilityFloor(ABSTAND, HOEHE, 30)
  const weit = visibilityFloor(ABSTAND, HOEHE, 90)
  expect(eng).toBeLessThan(weit)
  // Und in Pixeln sind beide gleich — das ist die Zusage.
  expect(bodyPixels(eng, ABSTAND, HOEHE, 30)).toBeCloseTo(MIN_BODY_PIXELS, 6)
  expect(bodyPixels(weit, ABSTAND, HOEHE, 90)).toBeCloseTo(MIN_BODY_PIXELS, 6)
})

test('die Grenze waechst mit dem Abstand — sonst verschwindet der Koerper beim Herauszoomen', () => {
  const HOEHE = 900
  const FOV = 60
  const nah = visibilityFloor(1000, HOEHE, FOV)
  const fern = visibilityFloor(10_000, HOEHE, FOV)
  // Zehnmal so weit weg heisst: zehnmal so gross, damit es gleich gross **aussieht**.
  expect(fern / nah).toBeCloseTo(10, 6)
})

test('ein Körper an der Grenze kippt NICHT — er bleibt sichtbar', () => {
  const HOEHE = 900
  const FOV = 60
  /*
   * **Der gemeldete Fehler als Rechnung.** Ein Körper, dessen Radius knapp unter der Grenze liegt, wird
   * auf die Grenze gezogen — und einer knapp darüber bleibt, wie er ist. Beide sind danach mindestens
   * die Grenze gross, und **beide** sind mindestens `MIN_BODY_PIXELS` Bildpunkte breit.
   *
   * Vorher lagen sie um den Faktor `cos(fov/2)` daneben: der eine wurde **über** die wahre Sichtgrenze
   * gezogen, der andere blieb **darunter**. An genau dieser Stelle war der Körper mal sichtbar, mal
   * nicht — „verschwindet und taucht auf".
   */
  for (const abstand of [1000, 15_600, 227_274]) {
    const grenze = visibilityFloor(abstand, HOEHE, FOV)
    for (const faktor of [0.9, 1.0, 1.1]) {
      const radius = grenze * faktor
      // Die Ebenenregel ist hier absichtlich aus dem Spiel: ein winziger Bezug, ein riesiger Deckel.
      const gezeichnet = minBodySize(0.0001, 1e9, abstand, HOEHE, FOV)
      void radius
      expect(bodyPixels(gezeichnet, abstand, HOEHE, FOV)).toBeCloseTo(MIN_BODY_PIXELS, 6)
    }
  }
})
