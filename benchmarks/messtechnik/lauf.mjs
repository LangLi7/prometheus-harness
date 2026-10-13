/**
 * `benchmarks/messtechnik/lauf.mjs` — mißt den **Meßaufbau** selbst, echt.
 *
 * ## Warum es dieses Gate gibt
 *
 * Die Prüfungen für {@link module:benchmarks/support/messen} sind am 13.10.2026
 * **deterministisch** geworden: sie speisen vorgegebene Dauern ein und prüfen das
 * **Urteil**. Der Grund stand in einem roten Testlauf — die Prüfung „lineare
 * Arbeit skaliert grün" maß 2.000.000 gegen 20.000.000 Einträge, während `bun
 * test` 30 Dateien gleichzeitig laufen ließ, und dieselbe unveränderte Datei war
 * einmal grün und einmal rot.
 *
 * **Was damit offen blieb.** Daß die Meßbausteine an einer **echten** Uhr ein
 * lineares Verhältnis als grün und ein quadratisches als rot erkennen. Das ist
 * keine Logik, das ist eine Eigenschaft des Aufbaus auf dieser Maschine, und sie
 * gehört gemessen.
 *
 * **Warum hier und nicht in `bun test`.** Dieses Gate läuft **allein** (der
 * Sammelläufer startet jedes Gate als eigenen Prozeß und nacheinander). Eine rote
 * Zeile ist hier ein **Befund** — der Exit-Code ist 1, der Lauf meldet
 * `1 Befund(e)` — und nicht ein kaputter Testlauf, der die übrigen 890 Prüfungen
 * mitreißt. Genau diese Trennung ist der Punkt: **Urteil prüfen heißt `bun test`,
 * Aufbau messen heißt Benchmark.**
 *
 * ## Der Befund, der dieses Gate beim ersten Lauf rot machte
 *
 * Gemessen am 13.10.2026, sechs Wiederholungen je Fall, `aufwaermen: 3`,
 * `laeufe: 5` (Bun 1.4.0, Windows nativ):
 *
 * | Arbeit | Eingabe | Zeit-Verhältnis (6 Läufe) |
 * |---|---|---|
 * | lineare Feldarbeit (2M → 20M) | ×10 | ×7,58 · ×7,94 · ×8,54 · ×8,81 · ×8,82 · **×11,01** |
 * | lineare Feldarbeit, ein anderer Prozeß | ×10 | **×13,40** (5,00 → 54,26 ms) |
 * | lineare Pufferarbeit (4M → 40M) | ×10 | ×9,12 … ×12,15 |
 * | **quadratische** Arbeit (1,5k → 15k) | ×10 | **×69,7 · ×104,7 · ×102,3** |
 * | **quadratische** Arbeit (2k → 20k) | ×10 | **×72,2 · ×102,1 · ×103,2** |
 *
 * Zwei Schlüsse, beide nachgemessen:
 *
 * 1. **Die Vorgabetoleranz ×1,25 ist für eine echte Messung zu eng.** ×10 Eingabe
 *    ergibt auf dieser Maschine bis zu ×13,4 Zeit — über der Grenze ×12,5. Die
 *    Toleranz wurde für den Rauschfall bei 0,15 ms gewählt; bei 5 ms gegen 45 ms
 *    wirken Takt, Speicherbereinigung und Speicherhierarchie anders.
 * 2. **Die Trennung ist trotzdem gewaltig.** Linear liegt bei ×7,6 … ×13,4,
 *    quadratisch bei ×70 … ×104 — Faktor **5 bis 13** dazwischen. Ein Schwellwert
 *    bei ×20 trennt beide **sicher**, und genau das prüft dieses Gate: nicht eine
 *    Konstante, sondern die **Trennschärfe** des Verfahrens.
 *
 * **Warum das keine abgeschwächte Prüfung ist.** Eine abgeschwächte Prüfung wäre
 * eine, die nichts mehr fängt. Hier steht die Gegenprobe **im selben Lauf**: eine
 * quadratische Arbeit muß rot werden — und zwar mit einem **beurteilten**
 * Verhältnis, nicht mit „nicht beurteilbar". Fiele die Trennung, fiele das Gate.
 *
 * ## Aufruf
 *
 * ```sh
 * bun benchmarks/messtechnik/lauf.mjs
 * bun benchmarks/lauf.mjs --nur=messtechnik
 * ```
 *
 * @module benchmarks/messtechnik/lauf
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fuehreAus, messe, pruefeSkalierung, statistik } from '../support/messen.mjs'

/**
 * Die Toleranz, mit der dieses Gate lineare Arbeit bewertet.
 *
 * **Warum nicht die Vorgabe ×1,25.** Siehe Dateikopf: die gemessene Streuung
 * linearer Arbeit reicht bis ×13,4, die Vorgabe erlaubt ×12,5. Ein Gate, das bei
 * jeder dritten Ausführung rot wird, weil die Maschine warm ist, wird
 * abgeschaltet statt gelesen. ×2,0 erlaubt ×20 und liegt damit **sicher** unter
 * der kleinsten gemessenen quadratischen Kennlinie (×69,7).
 */
export const TOLERANZ_LINEAR = 2.0

/**
 * Ab welchem Faktor die Trennung zwischen linear und quadratisch als belegt gilt.
 *
 * Gemessen liegt sie bei 5 bis 13. Ein Faktor von 3 als Untergrenze läßt Raum für
 * eine langsamere Maschine und fängt trotzdem den Fall, daß die Kennlinien
 * zusammenrücken — dann ist das Verfahren stumpf und muß es sagen.
 */
export const MINDEST_TRENNSCHAERFE = 3

/**
 * Arbeit, die **nicht** wegoptimierbar ist, linear wächst — **und nichts
 * proportional zu `n` anfordert**.
 *
 * **Warum das der Kern der Kalibrierung ist.** Gemessen am 13.10.2026, sechs
 * Wiederholungen je Lauf, drei Prozesse (Bun 1.4.0, Windows nativ):
 *
 * | Arbeit | Zeit-Verhältnis bei ×10 Eingabe | Streuung |
 * |---|---|---|
 * | Feld der Länge `n` (fordert 160 MB bei 20M) | ×6,25 · ×7,03 · ×7,42 · ×7,61 · ×7,73 · ×7,93 · ×8,03 · ×8,29 · ×8,43 · ×8,45 · ×8,83 · ×8,91 · ×8,95 · ×12,25 · ×13,24 · **×13,37** · **×14,02** | **×6,3 … ×14,0** |
 * | derselbe Puffer (32 kB), nur der Zähler wächst | ×10,03 · ×10,06 · ×10,11 · ×10,19 · ×10,25 · ×10,26 · ×10,51 · ×10,60 · ×10,61 · ×10,64 | **×10,0 … ×10,6** |
 *
 * **Der Befund:** die Feldarbeit mißt zu einem erheblichen Teil den
 * **Speicherbereinigungsdienst**, nicht die Kennlinie. Die große Messung schwankte
 * zwischen **43 und 76 ms**, während die kleine zwischen 3,8 und 7,4 ms lag — bei
 * gleichbleibender Arbeit. Wer daraus ein Skalierungsurteil bildet, beurteilt die
 * Speicherbereinigung. Diese Arbeit fordert **nichts** proportional zur Eingabe
 * an; sie liest aus einem Puffer, der in den L1-Cache paßt.
 *
 * **Warum `i & 4095` und kein Index auf ein Feld der Länge `n`.** Nur so bleibt
 * die Anforderung konstant. Der Puffer wird **einmal** beim Aufbau gefüllt, nicht
 * je Lauf — sonst wäre die Füllung selbst Teil der Messung.
 *
 * **Und trotzdem: die erste Messung in einem kalten Prozeß ist unzuverlässig.**
 * Gemessen fiel die kleine Messung in einem Lauf auf **0,79 ms** und damit unter
 * die Beurteilungsgrenze, in einem anderen stieg sie auf 2,8 ms. Deshalb läuft vor
 * jeder Beurteilung ein **Wegwerflauf** derselben Arbeit (siehe
 * `pruefeTrennschaerfe`) — dieselbe Begründung wie für `aufwaermen` in
 * `messe.mjs`, nur eine Ebene höher.
 *
 * @param {number} n - die Eingabegröße
 * @returns {() => number} die Arbeit
 */
export const pufferArbeit = (n) => {
  const puffer = new Float64Array(4096)
  for (let i = 0; i < puffer.length; i += 1) puffer[i] = (i * 2654435761) % 1000
  return () => {
    let s = 0
    for (let i = 0; i < n; i += 1) s += puffer[i & 4095]
    return s
  }
}

/**
 * Arbeit, die **nicht** wegoptimierbar ist und deren Dauer mit `n` wächst.
 *
 * **Warum nicht eine leere Zählschleife.** Der erste Versuch benutzte
 * `for (let i = 0; i < n; i++) s += i`. Gemessen: bei 2.000.000 Durchläufen
 * dauerte das **0,789 ms** — der Übersetzer erkennt die geschlossene Form und
 * rechnet sie in einem Schritt. Die kleine Messung fiel damit unter die
 * Beurteilungsgrenze, und die Prüfung meldete zu Recht „nicht beurteilbar".
 *
 * Diese Arbeit schreibt in ein Feld und liest daraus: sie läßt sich nicht
 * zusammenfassen. Für die **Beurteilung** der Skalierung wird sie nicht benutzt
 * (siehe {@link pufferArbeit}), sondern für die Speicher- und Statistikteile.
 *
 * @param {number} n - die Eingabegröße
 * @returns {() => number} die Arbeit
 */
export const feldArbeit = (n) => () => {
  const a = new Array(n)
  for (let i = 0; i < n; i += 1) a[i] = i % 251
  let s = 0
  for (let i = 0; i < n; i += 1) s += a[i]
  return s
}

/**
 * Arbeit, die **quadratisch** wächst — die Gegenprobe.
 *
 * **Warum `von` mindestens 2000 sein muß.** Gemessen: bei 900 sind es 810.000
 * Durchläufe und **0,497 ms** — unter der Beurteilungsgrenze von 1 ms, und die
 * Prüfung meldete „nicht beurteilbar". Bei 1500 waren es 1,31 bis 1,96 ms: die
 * Grenze wurde **gerade eben** überschritten, je nach Last mal so, mal so. Bei
 * 2000 sind es 2,37 bis 3,38 ms und 4.000.000 Durchläufe — sichere Lage.
 *
 * Eine quadratische Umsetzung ist bei zwanzig Einträgen schnell und bei
 * zwanzigtausend unbrauchbar. Wenn dieser Aufbau sie **nicht** als rot erkennt,
 * erkennt er gar nichts — dann ist jede grüne Skalierungszeile wertlos.
 *
 * @param {number} n - die Eingabegröße
 * @returns {() => number} die Arbeit
 */
export const quadratArbeit = (n) => () => {
  let s = 0
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) s += j
  }
  return s
}

/**
 * Die Eingabegrößen der linearen Messung.
 *
 * **Warum 5M und nicht 2M.** Bei 2M lag die kleine Messung gemessen bei
 * **0,79 bis 2,63 ms** — die Beurteilungsgrenze von 1 ms wurde je nach Lauf
 * unter- oder überschritten, und ein Lauf meldete deshalb „nicht beurteilbar"
 * statt eines Verhältnisses. Bei 5M liegt sie gemessen bei **1,63 bis 1,97 ms**
 * (mit Wegwerflauf, fünf Läufe) — über der Grenze, mit Abstand.
 */
export const LINEAR = { von: 5_000_000, bis: 50_000_000 }

/** Die Eingabegrößen der quadratischen Gegenprobe. */
export const QUADRAT = { von: 2_000, bis: 20_000 }

/**
 * Mißt **beide** Kennlinien und beurteilt ihre **Trennung**.
 *
 * **Warum eine Prüfung statt zweier.** „Linear ist grün" und „quadratisch ist
 * rot" sind einzeln erfüllbar, ohne daß das Verfahren etwas taugt — man kann beide
 * Grenzen so setzen, daß jede für sich hält. Erst der **Abstand** zwischen den
 * beiden Kennlinien sagt, ob das Verfahren unterscheidet.
 *
 * **Warum der Abstand als Verhältnis der Verhältnisse.** Beide Messungen haben
 * dieselbe Eingabesteigerung (×10). Beurteilt wird deshalb, um wieviel
 * **überlinearer** die quadratische Kennlinie ist als die lineare:
 * `(Zeit/Bis)/(Zeit/Von)`. Diese Zahl ist vom gewählten Eingabeverhältnis
 * **unabhängig** — sonst würde ein kleineres `bis` die Trennung scheinbar
 * verbessern, ohne daß das Verfahren besser geworden wäre.
 *
 * **Warum vorher ein Wegwerflauf steht.** Gemessen ist die **erste** Messung
 * eines kalten Prozesses unzuverlässig (kleine Messung 0,79 statt 2,0 ms, große
 * 76 statt 46 ms). Der Wegwerflauf übersetzt den Code und belegt den Speicher;
 * danach beginnt die Beurteilung. Dieselbe Begründung wie für `aufwaermen` in
 * `messe.mjs`, eine Ebene höher angesetzt.
 *
 * @returns {Promise<{ok: boolean, text: string}>}
 */
export async function pruefeTrennschaerfe() {
  // Wegwerflauf: beide Arbeiten einmal durch den Übersetzer und den Allokator.
  await messe(pufferArbeit(LINEAR.von / 10), { aufwaermen: 1, laeufe: 1 })
  await messe(quadratArbeit(QUADRAT.von), { aufwaermen: 1, laeufe: 1 })

  const linear = await pruefeSkalierung(
    { ...LINEAR, koerper: pufferArbeit, aufwaermen: 3, laeufe: 5 },
    TOLERANZ_LINEAR,
  )
  const quadrat = await pruefeSkalierung({ ...QUADRAT, koerper: quadratArbeit, aufwaermen: 3, laeufe: 5 })

  // **Erst prüfen, dann vergleichen.** Ein „nicht beurteilbar" ist kein Verhältnis;
  // es in die Trennschärfe einzurechnen hieße, aus `Infinity` ein Ergebnis zu
  // machen.
  if (linear.text.includes('nicht beurteilbar')) {
    return {
      ok: false,
      text:
        `ROT  lineare Messung unter der Beurteilungsgrenze — sie sagt nichts über die ` +
        `Skalierung. Eingabe für \`von\` erhöhen. (${linear.text})`,
    }
  }
  if (quadrat.text.includes('nicht beurteilbar')) {
    return {
      ok: false,
      text:
        `ROT  Trennschärfe nicht beurteilbar: die quadratische Gegenprobe liegt unter der ` +
        `Beurteilungsgrenze — ihr „rot" beweist nichts. Eingabe für \`von\` erhöhen. (${quadrat.text})`,
    }
  }
  if (quadrat.ok) {
    return {
      ok: false,
      text: `ROT  Gegenprobe gescheitert: quadratische Arbeit wurde als grün gemeldet (${quadrat.text})`,
    }
  }
  if (!linear.ok) {
    return {
      ok: false,
      text:
        `ROT  lineare Arbeit wurde rot: die Toleranz ×${TOLERANZ_LINEAR.toFixed(1)} reicht für die ` +
        `Streuung auf dieser Maschine nicht (${linear.text})`,
    }
  }

  // Überlinearität, normiert auf die Eingabesteigerung.
  const linearUeber = linear.verhaeltnis / (LINEAR.bis / LINEAR.von)
  const quadratUeber = quadrat.verhaeltnis / (QUADRAT.bis / QUADRAT.von)
  const trennschaerfe = quadratUeber / linearUeber
  const ok = trennschaerfe >= MINDEST_TRENNSCHAERFE
  return {
    ok,
    text:
      `${ok ? 'ok  ' : 'ROT '} Trennung: linear Überlinearität ×${linearUeber.toFixed(2)} ` +
      `(${linear.klein.median.toFixed(2)} → ${linear.gross.median.toFixed(2)} ms) gegen quadratisch ` +
      `×${quadratUeber.toFixed(2)} (${quadrat.klein.median.toFixed(2)} → ${quadrat.gross.median.toFixed(2)} ms) ` +
      `— Faktor ${trennschaerfe.toFixed(1)} (nötig ${String(MINDEST_TRENNSCHAERFE)})`,
  }
}

/**
 * Die Teile dieses Gates.
 *
 * @returns {readonly (() => Promise<{ok: boolean, text: string}> )[]}
 */
export function teile() {
  return [
    // Der Kern: beide Kennlinien und ihr Abstand.
    () => pruefeTrennschaerfe(),

    // **Die Auflösungsgrenze, echt gemessen.** Eine zu kurze kleine Messung darf
    // kein Verhältnis behaupten. Bei 100 Einträgen sind es 0,007 ms — die Grenze
    // muß greifen, sonst ist sie Zierde.
    async () => {
      const r = await pruefeSkalierung({
        von: 100,
        bis: 1_000,
        koerper: (n) => () => {
          let s = 0
          for (let i = 0; i < n; i += 1) s += i
        },
        aufwaermen: 3,
        laeufe: 5,
      })
      return r.ok
        ? { ok: false, text: `ROT  Auflösungsgrenze greift nicht: 100 Einträge ergaben ein Urteil (${r.text})` }
        : {
            ok: true,
            // Das innere `ROT` ist hier **erwartet** — es ist die geprüfte Sache.
            // Deshalb davor ein eigener Satz statt eines zweiten Statuszeichens.
            text: `ok   Auflösungsgrenze greift: 100 Einträge ergeben kein Urteil, sondern „nicht beurteilbar"`,
          }
    },

    // **Die Aufwärmphase, echt gemessen.** Der Dateikopf von `messen.mjs` nennt
    // 1,81× (Bun) — das ist ein Befund über diese Maschine, kein Naturgesetz.
    // Hier wird nachgemessen, statt die Zahl abzuschreiben.
    async () => {
      const arbeit = () => {
        let s = 0
        for (let i = 0; i < 200_000; i += 1) s += i % 7
        return s
      }
      const ohne = await messe(arbeit, { aufwaermen: 0, laeufe: 1 })
      const mit = await messe(arbeit, { aufwaermen: 5, laeufe: 20 })
      const faktor = ohne.median / mit.median
      // **Kein Urteil über den Faktor, nur über die Größenordnung.** Wäre die
      // Aufwärmphase wirkungslos, wäre der Faktor 1 — dann könnte sie weg. Daß
      // er auf dieser Maschine schwankt, ist erwartet und kein Befund.
      //
      // **Der Fehler, der hier stand.** `ok` wurde berechnet, der Text aber
      // begann **fest** mit `ok  `. Ein Befund hätte also `ok   Aufwärmphase: …`
      // gemeldet, während der Exit-Code 1 war — dieselbe Sorte falscher Treffer
      // wie in der quadratischen Gegenprobe, nur andersherum. Der Text wird
      // jetzt aus **derselben** Bedingung gebildet wie `ok`.
      const inOrdnung = Number.isFinite(faktor) && faktor > 1
      return {
        ok: inOrdnung,
        text:
          `${inOrdnung ? 'ok  ' : 'ROT '} Aufwärmphase: erster Lauf ${ohne.median.toFixed(2)} ms gegen Median ` +
          `${mit.median.toFixed(2)} ms über 20 Läufe — Faktor ${faktor.toFixed(2)}×` +
          (inOrdnung ? '' : ' (erwartet: > 1 — sonst wirkt die Aufwärmphase nicht)'),
      }
    },

    // **Die Statistik gegen die Uhr, nicht gegen ein Beispiel.** Die
    // Ordnungsrelationen müssen an echten Zahlen halten; sonst ist der Median
    // nichts wert.
    async () => {
      const m = await messe(feldArbeit(500_000), { aufwaermen: 3, laeufe: 20 })
      const stimmig = m.min <= m.median && m.median <= m.p95 && m.p95 <= m.max && m.laeufe === 20
      const geprueft = statistik([m.min, m.median, m.p95, m.max])
      return {
        ok: stimmig && Number.isFinite(geprueft.median),
        text:
          `${stimmig ? 'ok  ' : 'ROT '} Statistik an echten Zahlen: min ${m.min.toFixed(3)} ≤ median ` +
          `${m.median.toFixed(3)} ≤ p95 ${m.p95.toFixed(3)} ≤ max ${m.max.toFixed(3)} ms über ` +
          `${String(m.laeufe)} Läufe (Streuung ${m.streuung.toFixed(3)} ms)`,
      }
    },
  ]
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = (await fuehreAus('messtechnik — mißt den Meßaufbau', teile())) === 0 ? 0 : 1
}
