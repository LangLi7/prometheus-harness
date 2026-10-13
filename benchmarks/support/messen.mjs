/**
 * `benchmarks/support/messen.mjs` — die Meßbausteine aller Benchmarks.
 *
 * ## Warum es diese Datei gibt
 *
 * Ein Benchmark besteht aus drei Teilen, und **zwei davon sind Statistik**, nicht
 * Messung. Wer sie jedes Mal neu schreibt, schreibt sie jedes Mal anders — und
 * vergleicht dann Zahlen, die nicht vergleichbar sind. Diese Datei hält sie an
 * **einer** Stelle.
 *
 * ## Die drei Fehler, gegen die sie gebaut ist
 *
 * **1. Den ersten Lauf messen.** Gemessen am 13.10.2026 (Windows nativ, je acht
 * Läufe einer einfachen Schleife):
 *
 * | Laufzeit | erster Lauf | fünfter Lauf | Verhältnis |
 * |---|---|---|---|
 * | Bun 1.4.0 | 3,1 ms | 1,7 ms | **1,81×** |
 * | Node 24.19.0 | 2,3 ms | 1,8 ms | **1,25×** |
 *
 * Der erste Lauf ist **nicht** die Arbeit, sondern der Compiler. Ein Benchmark,
 * der ihn mitzählt, mißt die Aufwärmzeit seiner eigenen Laufzeit — und die
 * ändert sich mit jeder Fassung. Deshalb gibt es {@link messe} mit einer
 * ausdrücklichen Aufwärmphase.
 *
 * **2. Den Mittelwert nehmen.** Ein Mittelwert über Laufzeiten ist empfindlich
 * gegen **einen** Ausreißer — und Ausreißer entstehen auf einem gewöhnlichen
 * Rechner ständig (ein anderer Prozess, eine Speicherbereinigung, ein
 * Taktwechsel). Der **Median** ist robust, und das **95. Perzentil** sagt, was
 * ein Benutzer gelegentlich erlebt. Deshalb liefert {@link messe} beide.
 *
 * **3. Eine Zahl ohne Streuung melden.** „37 ms" ist keine Messung, sondern eine
 * Behauptung. „37 ms, Streuung 4 ms über 20 Läufe" ist eine. Deshalb trägt jedes
 * Ergebnis seine Streuung und die Zahl der Läufe.
 *
 * ## Was diese Datei **nicht** tut
 *
 * Sie baut nichts, startet nichts und kennt keinen Harness. Sie mißt Zahlen und
 * prüft Budgets. Was gemessen wird, entscheidet der Benchmark.
 *
 * @module benchmarks/support/messen
 */

/**
 * Führt eine Funktion aus und liefert ihre Dauer.
 *
 * **Warum `process.hrtime.bigint()` und nicht `Date.now()`.** `Date.now()` hat je
 * nach Plattform eine Auflösung von 1 bis 16 Millisekunden — für Arbeit, die in
 * Mikrosekunden gemessen wird, ist das keine Messung. `hrtime` ist monoton und
 * wird in Nanosekunden aufgelöst.
 *
 * **Warum die Dauer als Zahl und nicht als `bigint` zurückkommt.** Sie wird
 * gerechnet (Median, Perzentil); `bigint` und `number` lassen sich nicht
 * mischen, und der Wertebereich von Zahlen reicht für Nanosekunden über Jahrzehnte.
 *
 * ## Der asynchrone Fall — und der Fehler, der ihn erzwungen hat
 *
 * Die erste Fassung war **synchron**: sie rief den Körper und nahm die Zeit
 * danach. Damit ist eine `async`-Funktion **nach der ersten Zeile fertig** — die
 * Messung ergab etwas Nahe bei null, und die Arbeit lief danach weiter, außerhalb
 * jeder Messung.
 *
 * Gemessen am 13.10.2026 im Benchmark `session-open`:
 *
 * ```
 * writeSession, 2000 Ereignisse: 0.05 ms   ← sah hervorragend aus
 * readSession: geschriebene Sitzung ist nicht lesbar — ENOENT
 * ```
 *
 * Die Zeit war falsch **und** die Messung hatte den Schreibvorgang nicht
 * abgewartet. Zwei Fehler, die einander deckten: die schnelle Zahl ließ die
 * fehlende Datei wie ein Datenbankproblem aussehen.
 *
 * Jetzt wird ein zurückgegebenes Versprechen **abgewartet**, und die Zeit wird um
 * das Warten herum genommen.
 *
 * @param {() => unknown} koerper - die auszuführende Arbeit; darf ein Versprechen liefern
 * @returns {Promise<number>} die Dauer in Millisekunden
 */
export async function einmal(koerper) {
  const beginn = process.hrtime.bigint()
  const ergebnis = koerper()
  // `await` auf einen Nicht-Promise ist erlaubt und kostet fast nichts; deshalb
  // ist hier keine Fallunterscheidung nötig. Eine Fallunterscheidung wäre
  // außerdem die Stelle, an der man den asynchronen Fall vergißt.
  await ergebnis
  return Number(process.hrtime.bigint() - beginn) / 1e6
}

/**
 * Das Mindestmaß an Statistik, das eine gemessene Zahl begleiten muß.
 *
 * @typedef {object} Messung
 * @property {number} min - der schnellste Lauf
 * @property {number} median - der mittlere Lauf; **die Hauptzahl**
 * @property {number} p95 - der Wert, unter dem 95 % der Läufe liegen
 * @property {number} max - der langsamste Lauf
 * @property {number} streuung - Standardabweichung, als Streumaß
 * @property {number} laeufe - wie oft gemessen wurde
 */

/**
 * Rechnet aus einer Reihe von Dauern die Statistik.
 *
 * **Reine Funktion, damit sie prüfbar ist.** Sie kennt keine Uhr und keinen
 * Prozeß: aus Zahlen werden Zahlen. Genau das muß sie sein — eine Statistik, die
 * nur im Betrieb prüfbar ist, wird nicht geprüft.
 *
 * **Warum das 95. Perzentil „nächstgelegen" und nicht interpoliert ist.** Bei
 * zwanzig Läufen gibt es keinen Wert *zwischen* dem neunzehnten und zwanzigsten.
 * Eine Interpolation würde eine Zahl erfinden, die nie gemessen wurde — für ein
 * Budget ist die **gemessene** Zahl die richtige.
 *
 * @param {readonly number[]} dauern - die gemessenen Dauern in Millisekunden
 * @returns {Messung}
 * @throws {Error} wenn keine Dauer vorliegt
 */
export function statistik(dauern) {
  if (!Array.isArray(dauern) || dauern.length === 0) {
    throw new Error('statistik: mindestens eine Dauer wird gebraucht')
  }
  for (const d of dauern) {
    if (typeof d !== 'number' || !Number.isFinite(d) || d < 0) {
      throw new Error(`statistik: ungültige Dauer ${String(d)} — erwartet wird eine nicht-negative Zahl`)
    }
  }
  // Eine Kopie: der Aufrufer soll seine Reihe behalten, wie sie war.
  const sortiert = [...dauern].sort((a, b) => a - b)
  const mitte = (unten, oben) => {
    const i = Math.min(sortiert.length - 1, Math.max(0, Math.floor(unten)))
    const j = Math.min(sortiert.length - 1, Math.max(0, Math.ceil(oben)))
    return (sortiert[i] + sortiert[j]) / 2
  }
  const mittel = sortiert.reduce((s, x) => s + x, 0) / sortiert.length
  // Stichprobenstreuung (N-1). Bei einem einzigen Lauf gibt es keine Streuung
  // zu schätzen — dann ist sie 0, und der Aufrufer sieht an `laeufe`, daß er
  // nicht darauf bauen darf.
  const varianz =
    sortiert.length < 2 ? 0 : sortiert.reduce((s, x) => s + (x - mittel) ** 2, 0) / (sortiert.length - 1)
  return {
    min: sortiert[0],
    median: mitte((sortiert.length - 1) / 2, (sortiert.length - 1) / 2),
    p95: sortiert[Math.max(0, Math.ceil(0.95 * sortiert.length) - 1)],
    max: sortiert[sortiert.length - 1],
    streuung: Math.sqrt(varianz),
    laeufe: sortiert.length,
  }
}

/**
 * Mißt eine Arbeit **nach einer Aufwärmphase**.
 *
 * **Warum die Aufwärmphase keine Bequemlichkeit ist.** Siehe Dateikopf: der erste
 * Lauf kostet unter Bun das **1,81-fache**, unter Node das **1,25-fache** des
 * fünften. Wer sie wegläßt, mißt den Compiler.
 *
 * **Warum die Aufwärmphase nicht mitgezählt wird.** Sie läuft genau einmal, um
 * Code zu übersetzen und Speicher zu belegen. Sie mitzuzählen verwässert den
 * Median um einen Wert, der nichts mit der Arbeit zu tun hat.
 *
 * **Warum diese Funktion `async` ist.** Ein asynchroner Körper — und der Harness
 * ist voll davon: Dateien schreiben, Modell aufrufen, Stapel abfragen — wäre
 * sonst nach der ersten Zeile „fertig", und die Messung ergäbe eine Zahl nahe
 * null. Siehe {@link einmal}.
 *
 * @param {() => unknown} koerper - die auszuführende Arbeit; darf ein Versprechen liefern
 * @param {{aufwaermen?: number, laeufe?: number}} [optionen] - Vorgaben: 5 und 20
 * @returns {Promise<Messung>}
 */
export async function messe(koerper, optionen = {}) {
  const aufwaermen = optionen.aufwaermen ?? 5
  const laeufe = optionen.laeufe ?? 20
  for (let i = 0; i < aufwaermen; i += 1) await einmal(koerper)
  const dauern = []
  for (let i = 0; i < laeufe; i += 1) dauern.push(await einmal(koerper))
  return statistik(dauern)
}

/**
 * Ein Zeitbudget: eine Obergrenze, die geprüft wird.
 *
 * @typedef {object} Budget
 * @property {string} name - was gemessen wird
 * @property {number} grenzeMs - die Obergrenze in Millisekunden
 * @property {(m: Messung) => number} [wert] - welcher Wert geprüft wird; Vorgabe: der Median
 * @property {string} [warum] - wozu die Grenze da ist
 */

/**
 * Prüft eine Messung gegen ein Budget.
 *
 * **Warum der **Median** die Vorgabe ist und nicht das Maximum.** Ein Budget auf
 * das Maximum wäre ein Budget auf den **schlechtesten Lauf auf einem beliebigen
 * Rechner** — und damit entweder zu groß, um etwas zu fangen, oder so knapp, daß
 * es bei jeder fremden Last rot wird. Der Median sagt, was im Betrieb geschieht.
 * Wer gegen das 95. Perzentil prüfen will, sagt das mit `wert`.
 *
 * **Warum das Ergebnis die Begründung trägt.** Ein roter Benchmark ohne Grund
 * führt dazu, daß die Grenze erhöht wird. Mit Grund wird entschieden, ob das
 * richtig ist.
 *
 * @param {Budget} budget - die Obergrenze
 * @param {Messung} messung - das Gemessene
 * @returns {{ok: boolean, name: string, wertMs: number, grenzeMs: number, text: string, warum: string}}
 */
export function pruefeBudget(budget, messung) {
  const lese = budget.wert ?? ((m) => m.median)
  const wert = lese(messung)
  const ok = wert <= budget.grenzeMs
  const kennzahl = budget.wert === undefined ? 'Median' : 'Wert'
  return {
    ok,
    name: budget.name,
    wertMs: wert,
    grenzeMs: budget.grenzeMs,
    warum: budget.warum ?? '',
    text:
      `${ok ? 'ok  ' : 'ROT '} ${budget.name}: ${wert.toFixed(2)} ms ` +
      `(${kennzahl}, ${String(messung.laeufe)} Läufe, Streuung ${messung.streuung.toFixed(2)} ms) ` +
      `gegen ${budget.grenzeMs.toFixed(2)} ms`,
  }
}

/**
 * Ab welcher Dauer ein Skalierungsverhältnis überhaupt beurteilbar ist.
 *
 * ## Der Befund, der diese Zahl erzwungen hat
 *
 * Die erste Fassung prüfte mit `von: 200`. Gemessen am 13.10.2026, drei Läufe
 * desselben Benchmarks:
 *
 * | Lauf | Zeit ×(Eingabe ×10) |
 * |---|---|
 * | 1 | ×10,04 · **×16,05** |
 * | 2 | ×8,81 · ×9,57 |
 * | 3 | ×11,39 · **×14,77** |
 *
 * Dasselbe Programm, dreimal gemessen, und die Prüfung war zweimal rot und einmal
 * grün. **Das ist keine Eigenschaft des Codes, sondern eine des Meßaufbaus:** bei
 * 0,15 ms für die kleine Eingabe machen feste Kosten — Aufwärmen der Funktion,
 * Speicheranforderung, Auflösung der Uhr — einen großen Teil der Zeit aus. Sie
 * wachsen **nicht** mit der Eingabe, also sieht die Kennlinie überlinear aus.
 *
 * Eine Prüfung, die von der Last des Rechners abhängt, ist schlimmer als keine:
 * sie wird rot, jemand erhöht die Toleranz, und danach fängt sie nichts mehr.
 *
 * **Die Korrektur:** eine kleine Messung unter dieser Grenze ist **nicht
 * beurteilbar** und wird als solche gemeldet — statt ein Verhältnis zu behaupten,
 * das aus Rauschen entsteht.
 */
export const MINDESTDAUER_FUER_VERHAELTNIS_MS = 1

/**
 * Prüft, ob eine Arbeit **skaliert** — ob die Dauer langsamer wächst als die Eingabe.
 *
 * **Warum das eine eigene Prüfung ist.** Ein Zeitbudget für eine feste
 * Eingabegröße sagt nichts darüber, was bei zehnfacher Eingabe geschieht. Eine
 * Umsetzung, die quadratisch wächst, ist bei zwanzig Einträgen schnell und bei
 * zwanzigtausend unbrauchbar — und das ist genau die Sorte Fehler, die ein
 * Benchmark fangen soll.
 *
 * **Warum „höchstens linear" und nicht „linear".** Konstante Faktoren,
 * Speicherhierarchie und Meßrauschen machen aus einer linearen Kennlinie nie eine
 * exakt gerade Linie. Geprüft wird, daß sie **nicht überlinear** ist.
 *
 * **Warum die kleine Größe groß genug sein muß.** Siehe
 * {@link MINDESTDAUER_FUER_VERHAELTNIS_MS}: unter einer Millisekunde überwiegen
 * feste Kosten, und das Ergebnis ist Rauschen. Ist die kleine Messung zu kurz,
 * meldet die Prüfung **rot mit Grund** — sie behauptet kein Verhältnis.
 *
 * @param {{von: number, bis: number, koerper: (n: number) => () => unknown, aufwaermen?: number, laeufe?: number}} optionen
 *        - die beiden Eingabegrößen und die Arbeit
 * @param {number} [toleranz] - wieviel überlinear erlaubt ist; Vorgabe 1,25
 * @returns {Promise<{ok: boolean, text: string, klein: Messung, gross: Messung, verhaeltnis: number}>}
 */
export async function pruefeSkalierung(optionen, toleranz = 1.25) {
  const { von, bis, koerper } = optionen
  const klein = await messe(koerper(von), { aufwaermen: optionen.aufwaermen ?? 5, laeufe: optionen.laeufe ?? 15 })
  const gross = await messe(koerper(bis), { aufwaermen: optionen.aufwaermen ?? 5, laeufe: optionen.laeufe ?? 15 })
  const eingabeVerhaeltnis = bis / von
  if (klein.median < MINDESTDAUER_FUER_VERHAELTNIS_MS) {
    return {
      ok: false,
      klein,
      gross,
      verhaeltnis: Number.POSITIVE_INFINITY,
      text:
        `ROT  Skalierung nicht beurteilbar: die kleine Messung ist ${klein.median.toFixed(3)} ms, ` +
        `nötig sind ${MINDESTDAUER_FUER_VERHAELTNIS_MS.toFixed(2)} ms — darunter überwiegen feste Kosten. ` +
        `Größere Eingabe für "von" wählen.`,
    }
  }
  const zeitVerhaeltnis = gross.median / klein.median
  const ok = zeitVerhaeltnis <= eingabeVerhaeltnis * toleranz
  return {
    ok,
    klein,
    gross,
    verhaeltnis: zeitVerhaeltnis,
    text:
      `${ok ? 'ok  ' : 'ROT '} Skalierung: Eingabe ×${eingabeVerhaeltnis.toFixed(1)} ` +
      `→ Zeit ×${zeitVerhaeltnis.toFixed(2)} (erlaubt ×${(eingabeVerhaeltnis * toleranz).toFixed(2)}; ` +
      `${klein.median.toFixed(3)} → ${gross.median.toFixed(3)} ms)`,
  }
}

/**
 * Mißt die Speicherbelegung einer Arbeit.
 *
 * **Warum der Zuwachs und nicht die Gesamtbelegung.** Die Gesamtbelegung hängt
 * davon ab, was vorher geladen wurde — sie ist zwischen zwei Läufen nicht
 * vergleichbar. Der **Zuwachs** um die Arbeit herum ist es.
 *
 * **Warum vorher zweimal gesammelt wird.** Ein einzelnes `gc()` gibt den Speicher
 * nicht immer vollständig frei; gemessen wird erst nach zwei Durchgängen. Und:
 * `gc()` gibt es nur mit `--expose-gc`. Fehlt es, wird das **gemeldet** und nicht
 * stillschweigend eine Zahl erfunden — eine erfundene Speicherzahl ist schlimmer
 * als keine.
 *
 * @param {() => unknown} koerper - die auszuführende Arbeit
 * @returns {{zuwachsBytes: number, verfuegbar: boolean, hinweis?: string}}
 */
export function messeSpeicher(koerper) {
  const gc = globalThis.gc
  if (typeof gc !== 'function') {
    return {
      zuwachsBytes: 0,
      verfuegbar: false,
      hinweis: 'Speichermessung übersprungen — der Prozeß läuft ohne --expose-gc',
    }
  }
  gc()
  gc()
  const vorher = process.memoryUsage().heapUsed
  koerper()
  gc()
  gc()
  const nachher = process.memoryUsage().heapUsed
  return { zuwachsBytes: nachher - vorher, verfuegbar: true }
}

/**
 * Formt eine Zahl von Bytes in eine lesbare Angabe.
 *
 * @param {number} bytes - die Zahl der Bytes
 * @returns {string} etwa `1,5 MB`
 */
export function alsGroesse(bytes) {
  const einheiten = ['B', 'kB', 'MB', 'GB']
  let wert = Math.abs(bytes)
  let stufe = 0
  while (wert >= 1024 && stufe < einheiten.length - 1) {
    wert /= 1024
    stufe += 1
  }
  const vorzeichen = bytes < 0 ? '-' : ''
  return `${vorzeichen}${wert.toFixed(stufe === 0 ? 0 : 1).replace('.', ',')} ${einheiten[stufe]}`
}

/**
 * Führt die Arbeitsteile eines Benchmarks aus und meldet das Gesamtergebnis.
 *
 * **Warum das hier steht und nicht in jedem Benchmark.** Der Exit-Code ist das
 * Urteil — ein Benchmark, der rot ist und mit 0 endet, ist ein Benchmark, den
 * niemand bemerkt. Diese Funktion setzt ihn.
 *
 * **Warum sie `async` ist und die Teile nacheinander laufen.** Die Teile messen
 * dieselbe Maschine; liefen sie **gleichzeitig**, würde jeder den anderen
 * verlangsamen und die Zahlen wären nicht mehr vergleichbar. Genau das ist der
 * Fehler, den ein Benchmark nicht machen darf.
 *
 * @param {string} name - der Name des Benchmarks
 * @param {readonly (() => unknown)[]} teile - die Prüfteile; dürfen Versprechen liefern
 * @param {{schreibe?: (t: string) => void}} [optionen]
 * @returns {Promise<number>} die Zahl der roten Teile
 */
export async function fuehreAus(name, teile, optionen = {}) {
  const schreibe = optionen.schreibe ?? ((t) => process.stdout.write(t))
  schreibe(`\n=== ${name} ===\n`)
  schreibe(`Laufzeit: ${process.release.name} ${process.version} auf ${process.platform}\n`)
  if (process.versions.bun !== undefined) {
    // **Ehrlich benannt.** Bun meldet sich als `node` mit eigener Fassung; wer
    // die Zahl mit Werten aus der Vorlage vergleicht, muß wissen, worunter sie
    // entstanden ist.
    schreibe(`Hinweis: ausgeführt von Bun ${process.versions.bun} — ein Vergleich mit Node-Werten ist nicht zulässig\n`)
  }
  schreibe('\n')
  let rot = 0
  for (const teil of teile) {
    try {
      const ergebnis = await teil()
      schreibe(`${ergebnis.text}\n`)
      if (!ergebnis.ok) rot += 1
    } catch (fehler) {
      // Ein Benchmark, der **wirft**, ist ein Befund und kein Absturz. Er wird
      // gezählt und gemeldet — sonst reißt er den ganzen Lauf mit, und die
      // übrigen Messungen fehlen.
      schreibe(`ROT  ${fehler instanceof Error ? fehler.message : String(fehler)}\n`)
      rot += 1
    }
  }
  schreibe(rot === 0 ? '\n0 Befunde.\n' : `\n${String(rot)} Befund(e).\n`)
  return rot
}
