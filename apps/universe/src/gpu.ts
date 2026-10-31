/**
 * **Die Gerätestufe — was diese Maschine leisten kann, und was sie uns sagt.**
 *
 * ## Warum es diese Datei gibt
 *
 * Der Betreiber: *„noch nebenbei sollte es auch IGPU und CPU supporten"*. Das ist keine Kleinigkeit,
 * sondern eine **Zusage an den Rechner**, auf dem die Welt läuft — und die Welt hat bis hierher das
 * Gegenteil getan: der Zeichner forderte `antialias: true` (Kantenglättung, teuer auf jeder iGPU und
 * **sehr** teuer ohne Grafikkarte) und `powerPreference: 'high-performance'` (die Bitte um die
 * **schnelle** Karte — auf einem Laptop heißt das: die stromfressende, und auf einer Maschine ohne
 * eigene Karte heißt es: gar nichts).
 *
 * ## Zwei Quellen, und die zweite ist die bessere
 *
 * 1. **Was die Maschine über sich sagt.** Der Name des Zeichners ist abfragbar
 *    (`WEBGL_debug_renderer_info`). Aus ihm wird die **Startstufe** abgeleitet — nicht geraten,
 *    sondern gelesen: `SwiftShader` und `llvmpipe` sind **Softwarezeichner** (die CPU rechnet),
 *    `Intel`, `UHD`, `Iris`, `Vega`, `Mali`, `Adreno`, `Apple GPU` sind **integrierte** Karten, alles
 *    andere gilt als eigene Karte.
 * 2. **Was die Maschine tut.** Nach den ersten Bildern wird **gemessen**, wie lange ein Bild braucht.
 *    Ist es zu langsam, fällt die Stufe. Die Begründung ist dieselbe wie überall in diesem Projekt:
 *    der Name im Gerät ist eine **Auskunft**, die Zeit ist eine **Tatsache**. Wer nur dem Namen
 *    glaubt, baut auf einer Karte mit neuer Kennung und alter Leistung daneben. Deshalb gibt es den
 *    Regler {@link naechsteStufe} — und deshalb wird er **tatsächlich gezogen**.
 *
 * ## Warum „kein WebGL" ein eigener Fall ist
 *
 * Weil er vorkommt: ein blockierter Treiber, ein alter Rechner, ein Browser mit abgeschaltetem WebGL.
 * Ohne eigenen Fall stürzt der Aufbau ab — und dann ist die Seite **leer**, was wie ein Fehler im
 * Projekt aussieht und keiner ist. Mit eigenem Fall steht die Welt ohne Sternenfeld da (und sagt es).
 *
 * @module apps/universe/src/gpu
 */

/** Was für eine Zeichenmaschine unter der Seite liegt. */
export type Geraetestufe = 'gpu' | 'igpu' | 'cpu' | 'kein-webgl'

/** Die Stufen in der Reihenfolge ihrer Leistung — von viel nach wenig. */
export const STUFEN: readonly Geraetestufe[] = ['gpu', 'igpu', 'cpu', 'kein-webgl']

/**
 * **Die Stufen, die man LEISTEN kann** — ohne den Sonderfall.
 *
 * `kein-webgl` steht **nicht** darin, und das ist keine Auslassung: es ist keine langsamere Stufe,
 * sondern das **Fehlen der Fähigkeit**. Wer bei zu langsamen Bildern weiter „eine Stufe tiefer" ginge,
 * landete irgendwann dort — und hätte dann nicht weniger Sterne, sondern **gar keine Grafik**. Der
 * Aufbau würde also auf einer langsamen Maschine das Bild **abschalten**, statt es zu erleichtern.
 *
 * Gefunden hat das ein Test (`tests/gpu.test.ts`): er erwartete, daß `cpu` unten stehen bleibt, und
 * bekam `kein-webgl`. Der Test hatte recht, der Code nicht.
 */
export const LEISTUNGS_STUFEN: readonly Geraetestufe[] = ['gpu', 'igpu', 'cpu']

/**
 * **Wie viele Sterne je Stufe gezeichnet werden** — als Anteil des Katalogs.
 *
 * Das Sternenfeld ist der ehrlichste Regler, den dieses Bild hat: die Zahl der Punkte geht **linear**
 * in die Arbeit ein, und ein Feld mit 12 % der Sterne sieht noch nach Himmel aus (nur dünner).
 * Bessere Regler gibt es nicht: Kantenglättung und Beleuchtung sind **an oder aus**, die Zahl der
 * Sterne läßt sich dosieren.
 */
export const STERN_ANTEIL: Readonly<Record<Geraetestufe, number>> = {
  gpu: 1,
  igpu: 0.45,
  cpu: 0.12,
  'kein-webgl': 0,
}

/** Ab welcher Bildzeit die Stufe fällt (Millisekunden). */
export const BUDGET_MS = 33

/**
 * Die Stufe zu einem Zeichnernamen.
 *
 * **Reihenfolge der Prüfungen ist bindend.** `ANGLE (Intel, Intel(R) UHD Graphics …, SwiftShader)`
 * gibt es wirklich — ein Softwarezeichner, der als Intel gemeldet wird. Wer zuerst auf „Intel" sieht,
 * hält ihn für eine iGPU. Deshalb steht **Software zuerst**.
 *
 * @param kennung - der Name des Zeichners (oder `''`, wenn er nicht lesbar ist)
 * @param software - ob der Browser die Software-Rasterung selbst meldet (`WEBGL_debug_renderer_info`
 *   fehlt manchen Browsern; dann hilft das Flag des Kontexts)
 * @returns die Startstufe
 */
export function stufeAusKennung(kennung: string, software = false): Geraetestufe {
  if (software) return 'cpu'
  const text = kennung.toLowerCase()
  if (text === '') return 'igpu'
  // Erst die CPU: siehe oben — „SwiftShader" kommt auch hinter einem Kartennamen vor.
  for (const wort of ['swiftshader', 'llvmpipe', 'softpipe', 'software', 'offscreen', 'mesa']) {
    if (text.includes(wort)) return 'cpu'
  }
  for (const wort of ['intel', 'uhd', 'iris', 'hd graphics', 'vega', 'radeon graphics', 'mali', 'adreno', 'apple gpu', 'apple m']) {
    if (text.includes(wort)) return 'igpu'
  }
  return 'gpu'
}

/**
 * Die nächste Stufe tiefer — oder dieselbe, wenn es keine tiefere gibt.
 *
 * **Warum es diesen Regler gibt.** Der Name eines Zeichners ist eine Auskunft über seine **Herkunft**,
 * nicht über seine **Leistung**: eine integrierte Karte von 2015 und eine von 2024 heißen beide
 * „Intel", und ein Softwarezeichner auf einem 32-Kern-Rechner ist schneller als eine alte iGPU. Der
 * Name setzt deshalb nur den **Anfang**; ob es stimmt, sagt die Zeit. Diese Funktion ist der Schritt,
 * der auf ein zu langsames Bild antwortet.
 *
 * **Die untere Grenze ist `cpu`, nicht `kein-webgl`** — siehe {@link LEISTUNGS_STUFEN}.
 *
 * @param stufe - die jetzige Stufe
 * @returns die nächste tiefere Stufe
 */
export function naechsteStufe(stufe: Geraetestufe): Geraetestufe {
  if (!LEISTUNGS_STUFEN.includes(stufe)) return stufe
  const i = LEISTUNGS_STUFEN.indexOf(stufe)
  return LEISTUNGS_STUFEN[Math.min(LEISTUNGS_STUFEN.length - 1, i + 1)] ?? 'cpu'
}

/** Ob eine Stufe Kantenglättung bekommt (teuer auf iGPU, unbezahlbar auf der CPU). */
export function mitKantenglaettung(stufe: Geraetestufe): boolean {
  return stufe === 'gpu'
}

/** Ob eine Stufe additiv blendet (Licht addiert sich) — auf der CPU kostet das Füllrate. */
export function mitAdditiv(stufe: Geraetestufe): boolean {
  return stufe === 'gpu' || stufe === 'igpu'
}

/** Die Bitte um die schnelle Karte — nur, wo es eine gibt. */
export function energieVorliebe(stufe: Geraetestufe): 'high-performance' | 'default' | 'low-power' {
  if (stufe === 'gpu') return 'high-performance'
  if (stufe === 'igpu') return 'default'
  return 'low-power'
}

/**
 * **Die Stufe einer laufenden Seite.**
 *
 * Liest den Namen des Zeichners, wenn der Browser ihn hergibt, und die Software-Meldung des Kontexts.
 * Beides in `try`/`catch`: die Abfrage ist eine **Erweiterung**, und eine fehlende Erweiterung ist
 * kein Fehler, sondern eine Auskunft weniger.
 *
 * @param gl - der WebGL-Kontext (oder `null`, wenn es keinen gibt)
 * @returns die Stufe
 */
export function stufeFuerKontext(gl: WebGLRenderingContext | WebGL2RenderingContext | null): Geraetestufe {
  if (!gl) return 'kein-webgl'
  let kennung = ''
  let software = false
  try {
    const erweiterung = gl.getExtension('WEBGL_debug_renderer_info')
    if (erweiterung) {
      kennung = String(gl.getParameter(erweiterung.UNMASKED_RENDERER_WEBGL) ?? '')
    }
    const zeichner = String(gl.getParameter(gl.RENDERER) ?? '')
    if (kennung === '') kennung = zeichner
  } catch {
    kennung = ''
  }
  // **Der Zaun um die Auskunft.** Manche Browser liefern hier `null` oder werfen; dann gilt der
  // Rückfall (iGPU), und die Messung nach den ersten Bildern entscheidet das Weitere.
  return stufeAusKennung(kennung, software)
}

/**
 * **Die Stufe aus gemessenen Bildzeiten.**
 *
 * Der zweite Weg, und der ehrliche: die Seite **sieht**, wie lange sie braucht. Gemessen wird der
 * Mittelwert über die ersten Bilder (die den Aufbau enthalten und deshalb nicht zählen dürfen — sie
 * werden abgeschnitten).
 *
 * **Warum ein Mittelwert und kein einzelnes Bild.** Ein einzelnes langes Bild kann ein Neubau sein
 * (Ebenenwechsel, Panel, Sprache) — daraus eine Gerätestufe abzuleiten hieße, den Zufall zum Richter
 * zu machen. Der Mittelwert über viele Bilder sagt, wie es **läuft**.
 *
 * @param bildzeiten - die gemessenen Zeiten in Millisekunden
 * @param stufe - die jetzige Stufe
 * @returns die Stufe, die gelten soll (dieselbe, wenn es schnell genug ist)
 */
export function stufeAusBildzeiten(bildzeiten: readonly number[], stufe: Geraetestufe): Geraetestufe {
  // Die ersten Bilder tragen den Aufbau — sie beschreiben nicht den Betrieb.
  const betrieb = bildzeiten.slice(Math.min(10, Math.floor(bildzeiten.length / 2)))
  if (betrieb.length === 0) return stufe
  const mittel = betrieb.reduce((summe, x) => summe + x, 0) / betrieb.length
  return mittel > BUDGET_MS ? naechsteStufe(stufe) : stufe
}
