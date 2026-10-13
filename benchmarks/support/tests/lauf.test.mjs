/**
 * Prüfungen für {@link module:benchmarks/lauf} — den Sammelläufer.
 *
 * **Warum es diese Datei gibt.** Der Kopf von `benchmarks/lauf.mjs` nennt Zahlen:
 * wie viele Ordner es gibt, wie viele Gates laufen, wie viele übersprungen
 * werden. Diese Zahlen waren **einmal falsch**: als das Gate `messtechnik`
 * dazukam, wurde die Liste `GATES` ergänzt, der Kopf aber nicht. Er stand weiter
 * auf „Acht Ordner … sieben davon leer", während es neun Ordner und sechs
 * übersprungene Gates waren.
 *
 * **Der Befund kam von außen** (eine Fremdprüfung hat die Zahlen
 * gegeneinandergehalten) — und genau das ist der Punkt: ein Kommentar, der
 * zählen soll, wird von niemandem nachgezählt, der den Code liest. Deshalb
 * zählt ihn hier ein Skript. Dieselbe Regel wie beim README-Paarungsprüfer:
 * **was eine Zahl behauptet, braucht einen Zähler.**
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { GATES, einstiegVon } from '../../lauf.mjs'

/** Die Wurzel `benchmarks/` — aus dem Modulpfad, nie aus dem Aufrufort. */
const HIER = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Die Ordner unter `benchmarks/`, sortiert. */
function ordnerAufDerPlatte() {
  return readdirSync(HIER, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

describe('GATES und die Ordner auf der Platte', () => {
  test('jedes Gate hat einen Ordner', () => {
    const da = new Set(ordnerAufDerPlatte())
    const fehlend = GATES.map((g) => g.ordner).filter((o) => !da.has(o))
    expect(fehlend).toEqual([])
  })

  test('jeder Ordner ist entweder ein Gate oder ausdrücklich ein Werkzeugordner', () => {
    // **Warum `support` hier namentlich steht.** Es ist kein Gate: es hat keine
    // `lauf.mjs`, sondern enthält die Meßbausteine und ihre Prüfungen. Stünde es
    // nur in einer stillen Ausnahmeliste, wäre der nächste neue Ordner wieder
    // unbemerkt kein Gate.
    const WERKZEUGORDNER = ['support']
    const bekannt = new Set([...GATES.map((g) => g.ordner), ...WERKZEUGORDNER])
    const unbekannt = ordnerAufDerPlatte().filter((o) => !bekannt.has(o))
    expect(unbekannt).toEqual([])
  })

  test('ein Gate, das laufen soll, hat auch einen Einstieg', () => {
    // Ein Gate als „läuft" zu führen, dessen `lauf.mjs` fehlt, ist ein Fehler im
    // Sammelläufer — er meldete ihn zur Laufzeit, aber hier fällt er sofort auf.
    const fehlend = GATES.filter((g) => g.laeuft && einstiegVon(g.ordner) === undefined).map((g) => g.ordner)
    expect(fehlend).toEqual([])
  })

  test('ein Gate, das nicht läuft, nennt den Grund', () => {
    const ohneGrund = GATES.filter((g) => !g.laeuft && (g.fehlt ?? '').trim() === '').map((g) => g.ordner)
    expect(ohneGrund).toEqual([])
  })
})

describe('Die Zahlen im Kopf von lauf.mjs', () => {
  /** Der Dateikopf bis zum Ende des Modulkommentars. */
  const kopf = readFileSync(join(HIER, 'lauf.mjs'), 'utf8').split('@module')[0]

  test('die genannten Anzahlen stimmen mit GATES und der Platte überein', () => {
    const ordner = ordnerAufDerPlatte().length
    const gates = GATES.length
    const laufen = GATES.filter((g) => g.laeuft).length
    const uebersprungen = GATES.filter((g) => !g.laeuft).length

    // Die Sätze im Kopf lauten „N Ordner liegen in benchmarks/" usw. Geprüft wird
    // jede dieser Zahlen gegen die Wirklichkeit — nicht die Formulierung.
    for (const [zahl, satz] of [
      [ordner, `${String(ordner)} Ordner liegen in`],
      [gates, `davon sind ${String(gates)} Gates`],
      [laufen, `laufen ${String(laufen)}`],
      [uebersprungen, `übrigen ${String(uebersprungen)}`],
    ]) {
      expect({ satz, vorhanden: kopf.includes(satz) }).toEqual({ satz, vorhanden: true })
    }
  })

  test('keine andere Anzahl steht als Ziffer im Kopf', () => {
    // **Warum nicht einfach `not.toContain('Acht Ordner')`.** Der Kopf **zitiert**
    // die alte, falsche Fassung, um den Fehler festzuhalten — ein bloßes
    // „kommt nicht vor" schlägt darauf an und verbietet damit genau die
    // Dokumentation des Fehlers. Das Zitat nennt die Zahl als **Wort** („Acht"),
    // jede echte Angabe steht als **Ziffer**. Geprüft wird deshalb: jede Ziffer,
    // die vor „Ordner"/„Gates" steht, muß die wahre Anzahl sein.
    const zahlVor = (wort) =>
      [...kopf.matchAll(new RegExp(`(\\d+)\\s+${wort}`, 'gu'))].map((m) => Number(m[1]))

    for (const [wort, wahr] of [
      ['Ordner', ordnerAufDerPlatte().length],
      ['Gates', GATES.length],
    ]) {
      const gefunden = zahlVor(wort)
      // Es muß mindestens eine Angabe geben — sonst prüft die Zeile nichts.
      expect({ wort, anzahl: gefunden.length > 0 }).toEqual({ wort, anzahl: true })
      expect({ wort, alleRichtig: gefunden.every((n) => n === wahr) }).toEqual({ wort, alleRichtig: true })
    }
  })

  test('der Kopf hält den früheren Fehler fest, statt ihn zu verschweigen', () => {
    // Ein Kopf, der die alten Zahlen einfach löscht, hat nichts gelernt. Wer die
    // Geschichte entfernt, bekommt hier eine rote Prüfung — und muß sich
    // entscheiden, ob er sie wirklich loswerden will.
    expect(kopf).toContain('veraltet gewesen')
    expect(kopf).toContain('braucht einen Zähler')
  })
})
