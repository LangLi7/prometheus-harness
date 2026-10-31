/**
 * **Jeder Körper, den es gibt, hat auch ein Bild.**
 *
 * ## Der Befund, der diese Prüfung erzwungen hat
 *
 * Am 15.10.2026 schaltete der Betreiber die Anzeige ein und fragte: *„interessante weisse hat es
 * trotzdem planeten oder kugel idk gespawn??"* — er sah **zwei** Kugeln in einem leeren Raum, eine
 * große **einfarbig graue** und eine kleinere mit Flecken.
 *
 * **Nachgemessen:** das sind die zwei Körper der Ebene 6 — `planetensystem` und `projekt-stack`.
 * Der Unterschied zwischen ihnen stand in `aggregateSvg` (`bodies.ts`): `Gruppe` hatte eine
 * Zeichnung, **`Planetensystem` nicht**. Und ohne Zeichnung zeichnet der Aufrufer nur die **Farbe aus
 * den Daten**: eine Kugel ohne jede Struktur.
 *
 * **Fünf von sechs Umschlägen fehlten** — `Planetensystem`, `Sternhaufen`, `Galaxiengruppe`,
 * `Galaxienhaufen`, `Superhaufen`. Es fiel niemandem auf, weil eine einfarbige Kugel **nicht falsch
 * aussieht**, sondern nur **leer**. Ein Test, der nach einem Fehler sucht, findet das nie; einer, der
 * die **Vollständigkeit** prüft, findet es sofort.
 *
 * ## Und warum die Prüfung am DATENBAUM hängt und nicht an einer Liste
 *
 * Eine Liste der Arten im Test wäre die dritte Nennung derselben Sache (Daten, Zeichnung, Test) und
 * liefe beim nächsten neuen Körper auseinander. Geprüft wird deshalb das, **was wirklich vorkommt**:
 * die Prüfung läuft über den Beispielbaum und fragt für jede gefundene Art, ob es ein Bild gibt.
 */
import { expect, test } from 'bun:test'
import { aggregateSvg } from '../src/bodies'
import { buildScene } from '../src/scene'
import { exampleUniverse } from '../src/universe'
import type { Body, Level } from '../src/universe'

/** Alle Arten, die im Baum vorkommen — jede genau einmal. */
function arten(root: Body): readonly string[] {
  const gefunden = new Set<string>()
  const lauf = (knoten: Body): void => {
    gefunden.add(knoten.kind)
    // **`children` darf fehlen.** Ein Blatt hat keine Kinder (`Body.children?`) — und ein `for` über
    // `undefined` wirft. Genau daran ist der erste Anlauf dieser Prüfung gestorben, mit einem
    // Stapelauszug statt einer Aussage.
    for (const kind of knoten.children ?? []) lauf(kind)
  }
  lauf(root)
  return [...gefunden].sort()
}

/**
 * **Die Arten, die als ZUSAMMENFASSUNG gezeichnet werden — je Ebene.**
 *
 * **Warum nicht einfach alle Arten im Baum.** Der erste Anlauf dieser Prüfung sammelte jede Art aus
 * dem Baum und meldete sofort `Mond hat kein Bild`. Das war die Prüfung, nicht die Sache: ein Mond
 * wird von `buildPlanet` mit einer **Oberflächen**-Textur gezeichnet (`surfaceTexture`), nicht von
 * `aggregateSvg`. Beide Wege haben ihre eigene Liste, und sie zu vermischen meldet einen Fehler, wo
 * keiner ist.
 *
 * Die richtige Menge steht deshalb in derselben Funktion, die auch zeichnet: `buildScene` legt die
 * Zusammenfassungen in `placed` (`kind: 'node'`) — und genau für die fragt `buildInto` nach
 * `aggregateSvg`.
 */
function zusammenfassungen(root: Body): readonly string[] {
  const gefunden = new Set<string>()
  for (let level = 1 as Level; level <= 12; level = (level + 1) as Level) {
    for (const platz of buildScene(root, level).placed) gefunden.add(platz.body.kind)
  }
  return [...gefunden].sort()
}

test('das Universum hat überhaupt Arten — sonst prüft die Prüfung nichts', () => {
  const alle = arten(exampleUniverse())
  expect(alle.length).toBeGreaterThan(5)
  // Und die Umschläge sind dabei: sie sind der Grund für diese Datei.
  expect(alle).toContain('Planetensystem')
  expect(alle).toContain('Superhaufen')
})

/**
 * **Diese Arten haben ihren EIGENEN Weg — AggregateSvg ist nicht zuständig.**
 *
 * **Gemessen, nicht angenommen.** Welche Arten auf einer Ebene als *Zusammenfassung* liegen, sagt
 * buildScene(root, level).placed. Über die zwölf Ebenen sind das:
 *
 *    1  Sonde                 2  Datei, Planet        3  Datei, Planet, Stern
 *    4  Platzhalter, Schaustück   5  Planetensystem, Platzhalter
 *    6  Gruppe, Planetensystem    7  Sternhaufen     8  Projekt
 *    9  Galaxiengruppe       10  Galaxienhaufen      11  Superhaufen      12  Alles
 *
 * **Sonde, Planet und Stern stehen hier zu Recht** — für sie gibt es buildStar und
 * buildPlanet (aus lighting.ts) mit einer **Oberflächen**-Textur: eine Kugel mit Flecken, nicht
 * eine Zeichnung auf einer Kugel. Der erste Anlauf dieser Prüfung hat sie mitgezählt und „Planet hat
 * kein Bild" gemeldet — **das war die Prüfung, nicht die Sache.**
 */
const EIGENER_WEG: readonly string[] = ['Sonde', 'Planet', 'Stern']

test('JEDE Zusammenfassung, die gezeichnet wird, hat eine Zeichnung', () => {
  const root = exampleUniverse()
  const alle = zusammenfassungen(root)
  /*
   * **Und die Prüfung sagt, daß sie etwas geprüft hat** — und daß die fünf Umschläge dabei sind.
   * Das sind genau die Arten, die am 15.10.2026 **gefehlt** haben: der Betreiber sah zwei Kugeln,
   * eine davon ohne jede Struktur, weil AggregateSvg sie nicht kannte.
   */
  expect(alle.length).toBeGreaterThan(8)
  for (const pflicht of ['Planetensystem', 'Sternhaufen', 'Galaxiengruppe', 'Galaxienhaufen', 'Superhaufen']) {
    expect(alle, `${pflicht} kommt gar nicht vor — dann prueft die Pruefung ihn nicht`).toContain(pflicht)
  }
  const ohne: string[] = []
  for (const kind of alle) {
    if (EIGENER_WEG.includes(kind)) continue
    if (aggregateSvg(kind) === null) ohne.push(kind)
  }
  expect(ohne.join(', ')).toBe('')
})

test('und jede Zeichnung ist ein vollständiges, texturfähiges SVG', () => {
  /*
   * **Warum das geprüft wird.** Die Zeichnung wird über `svgTexture` auf ein **Canvas** gezeichnet und
   * dann auf eine Kugel gelegt. Fehlt der Namensraum oder die Größe, zeichnet der Browser **nichts** —
   * und eine leere Textur sieht aus wie eine einfarbige Kugel: derselbe Fehler, nur schwerer zu
   * finden, weil die Zeichnung ja „da" ist.
   */
  for (const kind of zusammenfassungen(exampleUniverse())) {
    if (EIGENER_WEG.includes(kind)) continue
    const svg = aggregateSvg(kind)
    expect(svg, `${kind} hat kein Bild`).not.toBeNull()
    expect(svg ?? '', `${kind}: kein Namensraum`).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg ?? '', `${kind}: ohne Größe zeichnet der Browser nichts`).toContain('width="256"')
    expect(svg ?? '', `${kind}: keine Fläche`).toContain('<rect width="256" height="256"')
    // **Und es muß etwas zu sehen sein.** Eine Zeichnung aus einem Hintergrund und sonst nichts wäre
    // wieder eine leere Kugel — nur mit Mühe.
    const inhalt = (svg ?? '').split('<rect width="256" height="256"')[1] ?? ''
    expect(inhalt.length, `${kind}: nur Hintergrund`).toBeGreaterThan(120)
  }
})

test('eine unbekannte Art bleibt ehrlich leer — kein geratenes Bild', () => {
  // Die Gegenprobe: wer eine Art erfindet, bekommt **kein** Bild, sondern die Farbe aus den Daten.
  // Ein falsches Bild wäre schlimmer als keines (siehe den Kommentar in `aggregateSvg`).
  expect(aggregateSvg('Gibtsnicht')).toBeNull()
})
