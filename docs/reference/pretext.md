# Pretext — Textmaß und Textfluss ohne DOM

> Angelegt am 27.10.2026. Dieses Dokument beantwortet: **welche** Bibliothek mehrzeiliges
> Textmaß ohne Reflow rechnet, **wie** man sie in einer Website einsetzt und **wo** sie hier
> schon läuft. Die Laufzeitzahlen in §6 sind **fremd gemessen** (die Demo-Dokumentation des
> Pakets) — von uns ist nichts davon gemessen. Der Einsatz im Projekt steht in
> [../../packages/plugin/rich-ui/README.md](../../packages/plugin/rich-ui/README.md).

---

## 1. Was es ist

`@chenglou/pretext` (<https://github.com/chenglou/pretext>), Fassung 1.0.0, MIT, ohne
Laufzeitabhängigkeiten. Die Bibliothek misst Text mit Canvas und bricht Zeilen nach eigener
Logik — ohne `getBoundingClientRect`, ohne `offsetHeight`, also ohne den Reflow, der beim
Messen im DOM entsteht. Sie gibt nach DOM, Canvas und SVG aus.

Zwei Einstiege im Paket:

| Einstieg | Inhalt |
|---|---|
| `@chenglou/pretext` | Maß und Zeilenlegen für einen Absatz in einer Schrift |
| `@chenglou/pretext/rich-inline` | derselbe Absatz aus mehreren Stücken: mehrere Schriften, Chips, Bilder |

Der Preis ist die Größe: die Unicode-Tabellen des Line-Breakers legen rund **59 KB gzip** ins
Bündel.

Wiedererkennung: die Demos heißen *Bubbles*, *Markdown Chat*, *Rich Text* und *Dynamic
Layout* — letzteres ist das Bild, das wie eine Buchdoppelseite aussieht; dort läuft Text um
Hindernisse und Bilder. Alle unter <https://chenglou.me/pretext/>.

## 2. Die drei Anwendungsfälle

### 2.1 Höhe eines Absatzes, bevor er gemalt ist

```ts
import { prepare, layout } from '@chenglou/pretext'

const prepared = prepare(text, '16px Inter')
const { height, lineCount } = layout(prepared, 320, 20)
```

`prepare()` macht die einmalige Arbeit: normalisieren, an Umbruchstellen trennen, per Canvas
messen. `layout()` ist danach reine Arithmetik über zwischengespeicherte Breiten — das ist
der heiße Pfad. **Nie zweimal `prepare()` für denselben Text**: bei einer Größenänderung nur
`layout()` erneut rufen.

### 2.2 Zeilen selbst legen

```ts
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'

const prepared = prepareWithSegments(text, '18px "Helvetica Neue"')
const { lines } = layoutWithLines(prepared, 320, 26)
```

Drei Stufen, je nach Bedarf: `layoutWithLines()` gibt alle Zeilen mit Text; `walkLineRanges()`
und `measureLineStats()` geben Breiten und Zeilenzahl ohne Text-Allokation;
`layoutNextLineRange()` gibt **eine** Zeile je Aufruf, wobei die Breite zwischen den Zeilen
wechseln darf. Der letzte Weg ist der für Text um ein Bild herum:

```ts
let cursor = { segmentIndex: 0, graphemeIndex: 0 }
let y = 0
while (true) {
  const width = y < image.bottom ? columnWidth - image.width : columnWidth
  const range = layoutNextLineRange(prepared, width, cursor)
  if (range === null) break
  const line = materializeLineRange(prepared, range)
  ctx.fillText(line.text, 0, y)
  cursor = range.end
  y += 26
}
```

### 2.3 Gemischter Inhalt in einer Zeile

```ts
import { prepareRichInline, walkRichInlineLineRanges } from '@chenglou/pretext/rich-inline'

const prepared = prepareRichInline([
  { text: 'Ship ', font: '500 17px Inter' },
  { text: '@maya', font: '700 12px Inter', break: 'never', extraWidth: 22 },
  { text: "'s rich-note ", font: '500 17px Inter' },
  { width: 20 },
])
```

Ein Bild, ein Emoji, eine Formel oder ein Chip ist eine **Box** `{ width }`: die Breite des
Margin-Kastens in ganzen oder Viertel-Pixeln. Die Zeile darf auf beiden Seiten der Box
brechen, die Box selbst bleibt ganz. Höhen sind Sache des Aufrufers: jeder Box
`vertical-align: top` geben, dann ist eine Zeile so hoch wie die Zeilenhöhe oder die höchste
Box.

## 3. Das Rezept für eine Website

Die Reihenfolge ist nicht beliebig; sie stammt aus der Demo-Dokumentation und aus den
Fallstricken in §4.

1. **Typografie genau einmal definieren.** Schrift, Größe, Laufweite und Zeilenhöhe stehen an
   einer Stelle, und der Canvas-Font-String wird daraus abgeleitet — nicht daneben getippt.
   Zwei Quellen driften, und dann malt die Seite anders, als gemessen wurde.
2. **Einmal `prepare()`, je Breite `layout()`.** Vorbereiten misst per Canvas; Layout ist
   Arithmetik. Für lange Listen: je Block ein vorbereiteter Wert, nicht je Nachricht ein
   neuer.
3. **Messen, was man malt.** Padding um ein Stück Text ist Breite und gehört als `extraWidth`
   in die Messung; ein CSS-`border` innerhalb der gerechneten Breite schiebt den Inhalt nach
   innen — Umriss stattdessen als `inset box-shadow`. Chips und Bilder bekommen
   `break: 'never'` und werden als `display: inline-block; white-space: nowrap` gemalt.
4. **Blasen schrumpfen.** `measureLineStats()` liefert die breiteste Zeile; die Blase bekommt
   `Math.ceil(maxLineWidth)`, gedeckelt auf die Höchstbreite. Ohne Deckel kann das Element ein
   Pixel breiter werden als erlaubt.
5. **Lange Listen virtualisieren.** Höhen und Oberkanten in zwei `Float64Array`, die sichtbaren
   Zeilen per Binärsuche, im DOM nur diese Zeilen. Geschätzte Höhen sind der Fehler, den man
   nicht machen will: sie lassen die Bildlaufleiste falsch laufen und den Inhalt springen.
6. **Leseposition halten.** Anker ist ein Element plus sein Abstand zur Oberkante; nach einer
   Größenänderung wird nur gescrollt, wenn sich der Anker bewegt hat. `scrollTop` nach dem
   `scrollTo()` **zurücklesen** — Browser runden, und ein Vergleich mit dem gewünschten Wert
   hält die eigene Scrollung für eine des Benutzers.
7. **Lesen, rechnen, schreiben, dann scrollen.** Ein Frame: alle Werte einmal lesen, alles ohne
   DOM rechnen, alles schreiben, zuletzt scrollen. Verschränkte Lese- und Schreibzugriffe
   lassen den Browser nach jedem Lesen neu layouten.
8. **Nie HTML malen.** `marked.parse()` mit `innerHTML` führt jedes Markup in der Nachricht aus;
   marked bereinigt seine Ausgabe nicht. Lexen, dann `textContent` und Textknoten.

## 4. Fallstricke, die wirklich beißen

- **Schrift.** Benannte Familie, nicht `system-ui` und nicht `-apple-system` (auf macOS
  ungenau). Ganze Pixelgrößen — Firefox rundet Canvas-Text, `13.33px` bricht dort anders.
- **`lang` am `<html>`.** Ohne Sprache wählen die Browser ihre eigene; Anführungszeichen und
  Umbruchstellen hängen daran. Ändert sich `lang`, muss neu vorbereitet werden.
- **Webfonts.** Erst laden (`await document.fonts.load('16px Inter', text)`), dann
  vorbereiten; nach einem späten Laden `clearCache()` und erneut vorbereiten. Ein fertiger
  Handle behält die Breiten der Ersatzschrift.
- **`overflow-wrap: break-word`** muss am gemalten Element stehen — es ist nicht CSS' Vorgabe,
  aber die Annahme der Bibliothek.
- **Ohne Canvas wirft `prepare()`** — in Node, Bun, jsdom und happy-dom. Zwei Auswege: ein
  globales `OffscreenCanvas` mit eigenem `measureText` bereitstellen, oder schätzen und die
  Ungenauigkeit in Kauf nehmen (so macht es `rich-ui` in Tests).
- **Kein Bidi.** Die Bibliothek liefert keine Richtungsebenen und keine visuelle Reihenfolge.
  Einen gemischtsprachigen Absatz als **ein** DOM-Element mit gesetzter Richtung malen, dann
  ordnet der Browser; einzeln gemalte Zeilen ordnen sich je Zeile neu.
- **`maxWidth` ist die Zahl, die man setzt.** Nicht die zurückgelesene Breite (die ist gerundet
  und unter Zoom skaliert).
- **`letter-spacing`** geht als Pixelzahl in `prepare()`; `font-variant-numeric`,
  `font-feature-settings` und ähnliche CSS-Schalter kennt die Bibliothek nicht.
- **`white-space: pre-wrap`** nur mit `{ whiteSpace: 'pre-wrap' }` in `prepare()`, und die
  Zeilen dann mit `white-space: pre` malen — sonst bricht eine einzeln gemalte Zeile erneut.

## 5. Im Projekt

- Abhängigkeit in [`packages/plugin/rich-ui/package.json`](../../packages/plugin/rich-ui/package.json);
  Einsatz in [`src/measure.ts`](../../packages/plugin/rich-ui/src/measure.ts), um die
  Achsenbeschriftungen der Karten zu messen und mit `…` zu kürzen.
- **Nicht** im Chat-Kern: dort ist das Transkript vollständig gemountet, es gibt keinen
  Höhen-Seam für eine Messung ohne DOM. Begründung und Preis stehen in der README des Plugins.
- `packages/vision/vectorize` ist **nicht** diese Bibliothek: eigenes Paket, flaches Bild zu
  SVG, keine Textmessung.

## 6. Fremd gemessene Zahlen

Aus der Dokumentation der Chat-Demo (Chrome 153, Apple M5 Max, 1280 × 900, Chat 860 px breit,
Stand 15.09.2026) — **nicht von uns nachgemessen**:

| Nachrichten | erste Nachricht auf dem Schirm | JS-Heap | schlechtester Frame bei Größenänderung |
|---|---|---|---|
| 10 000 | 0,65–0,74 s | 48 MB | 7,9–13,1 ms |
| 100 000 | 4,9–5,4 s | 402 MB | 54,9–55,2 ms |

Bei 100 000 Nachrichten stürzte iOS Safari ab (16.09.2026). Das ist der Grund, warum die
Demo-Dokumentation selbst sagt: Höhen erst ab einer Größe, die man noch trägt.

## 7. Was offen ist

- Für unsere Karten ist nur die Achsenmessung im Einsatz. Ein Höhenmaß fürs Transkript ist
  **nicht** gebaut und **nicht** gemessen — die Begründung steht in §5.
- Die Zahlen in §6 sind fremd; eine eigene Messung an unseren Karten gibt es nicht.
- Die Demo-Dokumentation nennt Grenzen, die für uns noch nicht geprüft sind: Streaming einer
  wachsenden Nachricht, Auswahl und Suchen über nicht gemountete Zeilen, Bildschirmleser.
