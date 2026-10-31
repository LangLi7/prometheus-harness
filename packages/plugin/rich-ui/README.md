# @prometheus-harness/rich-ui

**Reiche Antworten im Chat: Das Modell beschreibt eine Komponente, der Browser malt sie.**

Eine Antwort besteht heute aus Prosa, Markdown, Tabellen, Formeln und Code — alles, was aus Text entsteht. Dieses Plugin ergänzt die fehlende Hälfte: eine Karte mit Kennzahlen, ein kleines Diagramm, eine Tabelle mit Kopfzeile, ein Bild, ein Absatz, um den ein Bild fließt, ein Code-Ausschnitt mit Dateinamen oder ein hervorgehobener Hinweis. Das Modell liefert dafür **nur Daten und die Komponentenart**; Achsen, Farben, Abstände und das Verhalten bei schmalem Fenster gehören dem Client.

## Was das Modell aufruft

Ein einziges Werkzeug, `render_ui`:

```json
{
  "kind": "chart",
  "title": "Umsatzentwicklung",
  "subtitle": "Demonstrationsdaten",
  "footer": "Beispieldaten",
  "chart": {
    "type": "line",
    "unit": "€",
    "labels": ["Jan", "Feb", "Mär", "Apr"],
    "series": [{ "key": "revenue", "label": "Umsatz", "values": [120, 180, 150, 240] }]
  }
}
```

| `kind` | Pflichtfeld | Grenzen |
|---|---|---|
| `stats` | `stats[]` | 1–4 Kacheln, je `label` und `value` |
| `chart` | `chart` | `line` oder `bar`, 1–60 Kategorien, 1–4 Reihen mit gleich vielen Zahlen |
| `table` | `table` | 1–8 Spalten, bis 50 Zeilen, Zellen als Text |
| `image` | `image` | `src` als `http(s)`-URL oder eingebettete Bilddaten, bis 8 192 Zeichen |
| `note` | `note` | Fließtext mit Zeilenumbrüchen |
| `prose` | `prose.text` | Absatz bis 800 Zeichen, dazu **höchstens ein** Bild mit 40–320 px Box |
| `code` | `code.content` | bis 60 Zeilen und 8 000 Zeichen; was darüber liegt, wird gekürzt und als gekürzt markiert |
| `files` | `files.items[]` | 1–40 Einträge, Pfad bis 200 Zeichen, `change` und Zeilenzahlen optional |

`files` zeigt einen Pfad nur dann als Knopf, wenn die Fläche einen Datei-Öffner mitgibt (`openFile`); ohne ihn bleibt es ein Pfad in Monospace statt eines Knopfes, der nichts tut.

Gemeinsam sind `title` (120 Zeichen), `subtitle` und `footer` (je 200 Zeichen). Die Grenzen stehen als Zahlen in [`src/spec.ts`](src/spec.ts) und werden **zweimal** angewandt: im Host, damit das Modell eine brauchbare Rückmeldung bekommt, und im Browser, weil ein wiederhergestellter Verlauf auch ältere, ungültige Argumente enthalten kann.

## Wie die Karte in den Verlauf kommt

Ein Werkzeug-Aufruf ist normalerweise **Prozess**: er fällt beim Abschluss eines Turns hinter „Werkzeuge aufgerufen …" zusammen. Eine Komponente, die zur Antwort gehört, darf dort nicht landen — sonst sieht man sie erst nach dem Aufklappen der Prozesszeile (gemessen am 21.10.2026 genau so passiert). Deshalb registriert das Plugin eine `ConversationNodeDefinition` mit dem Knoten `rich-ui` und dem Ziel `chat`:

* `match` erkennt `tool/call` mit dem Namen `render_ui`, die Aufruf-Kennung wird die Identität.
* `start` normalisiert die Argumente zu einem `RichSpec` oder zu einem lesbaren Fehler.
* `buildViewNode` veröffentlicht den Knoten **sichtbar** an der Sequenz des Aufrufs — das ist die Karte im Prozess, dort wo sie entstanden ist.
* Dieselben Daten rendert zusätzlich der **Turn-Fuß** (`conversation.chat.turnTail`), dieselbe Fläche wie die Karte der geänderten Dateien: `turnDataSource(turn, 'rich-ui')` liefert genau die Karten dieses Turns in Anker-Reihenfolge. Die Antwort endet damit sichtbar mit der Karte, auch wenn der Prozess eingeklappt ist.
* Die gewöhnliche Werkzeug-Zeile bleibt leer (`tool.call.toolview` mit dem Schlüssel `render_ui`); nur ein **fehlgeschlagener** Aufruf zeigt seinen Grund, damit ein Fehler nicht unsichtbar wird.

Zwei Plätze, eine Beschreibung: Die Prozess-Karte belegt, *wann* die Komponente entstanden ist; die Karte am Fuß macht sie zum Teil der Antwort. Bei mehreren Aufrufen in einem Turn entsteht am Fuß ein Stapel.

Der Renderer selbst ist [`RichCard`](src/card.tsx): reine Darstellung ohne Hooks, Stores oder Host-Zugriff. Dieselbe Komponente rendert eine Live-Antwort, einen wiederhergestellten Verlauf und einen Test-Fixture.

Fällt der Browser-Teil aus (alter Tab, andere Komposition), schreibt der Host das Ergebnis als **Klartext** in die Werkzeug-Zeile — Titel, Werte, Tabellenzeilen, gekappt auf 700 Zeichen. Die Daten gehen also nicht verloren, wenn die Karte fehlt.

## Diagramme ohne Diagrammbibliothek

[`src/chart.ts`](src/chart.ts) rechnet die Geometrie: Achsenbereich, „schöne" Schrittweite, Punkte, Balken, Kategorienbeschriftung. Das Ergebnis ist ein `viewBox`-SVG mit Theme-Variablen (`--dsw-alias-*`), also ohne zusätzliche Abhängigkeit, ohne Canvas und ohne Messung im DOM. Jeder Punkt trägt seinen Wert als `<title>`; unter dem Diagramm steht dieselbe Tabelle für Vorleser und als Rückfall.

Farben: Marke, Geschäftszustand und Warnzustand als Reihe 1–3, sekundärer Text als Reihe 4. Mehr als vier Reihen nimmt das Format nicht an.

## Achsenbeschriftung: gemessen statt gezählt

Eine feste Regel „jede n-te Beschriftung" ist bei „September 2026" falsch, obwohl sie bei „Jan" richtig aussieht. Deshalb misst [`src/measure.ts`](src/measure.ts) jede Beschriftung mit [`@chenglou/pretext`](https://github.com/chenglou/pretext): Canvas-Messung ohne `getBoundingClientRect`, ohne Reflow, mit demselben Font-String. Aus den gemessenen Breiten folgt, wie viele Beschriftungen Platz haben und welche mit `…` gekürzt werden; der volle Text bleibt im Tooltip und in der Tabelle.

Pretext ist MIT-lizenziert und ohne Laufzeitabhängigkeiten. Der Preis ist die Größe: die Unicode-Tabellen des Line-Breakers legen rund **59 KB gzip** ins Bündel. Ohne Canvas — in Bun-Tests, in einem künftigen Server-Render — wirft `prepare()`; dann greift eine Schätzung, die Karte bleibt lesbar, nur nicht pixelgenau.

### Wiedererkennen: das „Buch-Bild"

Die Bibliothek taucht in Erinnerungen regelmäßig als „die Lib mit dem Bild wie Bücher"
auf. Zur Wiedererkennung: Die Demos unter <https://chenglou.me/pretext/> heißen
*Bubbles* (eine Blase auf ihre breiteste Zeile schrumpfen), *Markdown Chat*
(virtualisierter Chat), *Rich Text* (Bild und Text in einer Zeile) und **Dynamic
Layout** — das ist das Bild, das wie eine Buchdoppelseite aussieht: fester Rahmen, Text
um Hindernisse und Bilder herumgeführt.

Drei Wege, die dieses Plugin nicht anfasst: `layoutNextLineRange()` legt Zeile für Zeile
mit wechselnder Breite und führt so Text um ein Bild; `@chenglou/pretext/rich-inline`
nimmt ein Bild als Box `{ width }` mitten in der Zeile, die ganz bleibt, während der Text
umbricht; `measureLineStats` und `measureNaturalWidth` liefern die schmalste Breite, in
die ein Absatz noch passt. Für Karten und ihre Achsenbeschriftungen brauchen wir davon
nichts — das ist der Grund, warum nur gemessen und nicht gelegt wird.

**Warum nicht im Chat-Kern?** Das Transkript ist dort vollständig gemountet; virtualisiert ist nur die Turn-Leiste, mit fester Zeilenhöhe (`TURN_SPACING_PX`). Es gibt keinen Höhen-Seam, an dem eine Messung ohne DOM ansetzen könnte — das wäre ein Umbau des Transkripts (Auswahl, Suchen im Text, Scroll-Anker), kein Plugin.

## Bild im Textfluss, und eine Karte, die sich zusammenzieht

`kind: "prose"` setzt einen Absatz um ein Bild. Der Text läuft neben dem Bild und bricht darunter um — gemalt mit einem gewöhnlichen `float`, damit er auswählbar, durchsuchbar und für Vorleser lesbar bleibt. Pretext (`@chenglou/pretext/rich-inline`) beantwortet vorher die Frage, die CSS nicht beantwortet: **wie breit muss die Karte sein?** Es nimmt das Bild als Box `{ width }` mitten in den Absatz und misst den Absatz als Ganzes.

**Warum eine Suche nötig ist.** `measureRichInlineStats(prepared, 646)` liefert für umbrochenen Text fast 646 — die erste Zeile füllt sich ja. Eine Karte darauf zu stellen ergäbe wieder die volle Breite, also genau den Zustand, den die Karte ersetzen soll. Gesucht ist die **schmalste** Breite, deren Zeilenzahl sich nicht erhöht: eine binäre Suche mit 9–10 Proben, ohne Textallokation. Auf diesem Rechner gemessen: ein zwei-zeiliger Absatz bekommt **450 statt 680 px** Innenbreite, ein vierzeiliger mit Bild **538 statt 680** (mit Rand sind das 486 bzw. 574 px).

**Die Falle dabei: `box-sizing`.** `.pmh-rich` setzt es nicht, also begrenzt `max-width: 680px` die *Innenbreite* — und genau in dieser Koordinate misst Pretext. Eine erste Fassung addierte hier die 34 px Rand hinzu und machte damit jede Karte breiter als gemessen; der Browser meldete 716 px für eine 680-px-Karte. Die gemessene Zahl ist die Innenbreite und wird als `width` gesetzt, ohne Zuschlag.

**Warum nicht `layoutNextLineRange`.** Das legt Zeile für Zeile mit selbst gewählter Breite — das richtige Werkzeug, wenn man Text um einen Block *von Hand* setzt. Diese Karte setzt nicht von Hand: sie misst, der Browser malt. Absolute Fragmente zu positionieren kostete Textauswahl, Textsuche und Vorlesbarkeit.

**`prejs` liefert die Breite vor dem ersten Malen.** `new PreJS()`, `load([url], 'image')`, Ereignis `loaded`, `item.asset` ist ein `HTMLImageElement`. Damit steht `naturalWidth` fest, bevor die Zeilen entstehen; sonst müsste die Karte raten und danach springen. Bei *einem* Bild gibt es keinen Teilfortschritt (`0` → `1`) — ein Fortschrittsbalken lohnt erst für eine Gruppe, also für die Bildergruppe einer Nachricht, nicht für diese Karte.

**Eine Falle im Modul.** `prejs@1.2.6` ist ES5 mit `exports.default`; je nach Bündel ist `import PreJS from 'prejs'` die Klasse oder `{ default: { default: … } }`. Im zweiten Fall wirft der Konstruktor in einem Effekt und nimmt die ganze Karte mit. [`src/preload.ts`](src/preload.ts) wickelt deshalb `default` ab, bis eine Funktion erscheint, und meldet sonst nur „keine Größe" — die Karte bleibt stehen, ihr fehlt nur das genaue Seitenverhältnis.

## Sicherheit

* Es gibt **kein** Freiform-HTML, kein `dangerouslySetInnerHTML`, kein ausgeführtes Modell-Skript.
* Textfelder werden gekürzt, Zahlen auf endliche Werte geprüft, Längen begrenzt.
* `image.src` und `prose.image.src` akzeptieren nur `http(s)` und eingebettete Bilddaten — `javascript:`, `file:` und `data:text/html` werden verworfen.
* Eine zu lange Bildadresse wird **abgelehnt**, nicht gekürzt. Vorher schnitt der Leser bei 2 048 Zeichen ab; eine eingebettete Bilddatei kam damit als kaputte Adresse an, ohne Fehlermeldung — eine gekürzte URL ist keine kürzere URL, sondern eine falsche. Seitdem gilt hier eine Ablehnung bis 8 192 Zeichen, während Anzeigetext weiterhin gekürzt wird. Die Grenze ist mit 8 192 großzügiger als vorher, weil signierte CDN-Adressen regelmäßig länger als 2 000 Zeichen sind.
* Die Karte ist eine erlaubte Liste von Komponenten, keine generische Bühne für beliebigen Code.

## Immer anwenden — und wieder abschalten

Ein Werkzeugschema allein führt dazu, dass ein Modell die Karte **gelegentlich** benutzt. Damit sie **regelmäßig** entsteht, registriert das Plugin eine kurze Anweisung im System-Prompt (375 Zeichen ≈ 94 Tokens): Sie nennt die Auslöser (Kennzahlen, Verlauf, Vergleich, kompakter Datensatz, bekannte Bild-URL), verlangt **eine** Karte je Antwort und verbietet die Wiederholung des Inhalts im Text. Sie wird nur ausgeliefert, solange das Werkzeug angeboten wird — `''` entfernt sie aus der Assemblierung, ohne die Sektion abzumelden.

Zusammen mit dem Schema kostet das Angebot **≈ 735 Tokens pro Anfrage**, solange es an ist; ausgeschaltet kostet es nichts. Der Verlauf behält seine Karten in beiden Fällen.

## Kosten und Schalter

Das Werkzeug wird **jeder Anfrage angeboten**, auch wenn es nie aufgerufen wird: Name, Beschreibung und Parameterschema stehen im Werkzeugkasten des Modells. Gemessen sind das **3 645 Zeichen** (379 Zeichen Beschreibung, 3 266 Zeichen Schema) ≈ 910 Tokens pro Anfrage, dazu 501 Zeichen Anweisung ≈ 125 Tokens. Vor `prose` und `code` waren es 2 569 + 375 Zeichen; die beiden neuen Arten kosten also rund **300 Tokens pro Anfrage**. Eine Karte selbst kostet nur, wenn sie entsteht.

Vier Stufen, um das abzuschalten:

| Stufe | Wirkung | Wo |
|---|---|---|
| `/ui off` | Werkzeug **und** Anweisung weg, **alte Karten bleiben sichtbar**; `/ui on` stellt beides wieder her | im Chat, ohne Neustart |
| `config.offerTool: false` | wie `/ui off`, aber als Vorgabe nach jedem Start | [`cordis.patch.yml`](cordis.patch.yml), Zeile `pmh-rich-ui` |
| Plugin aus | Werkzeug **und** Renderer weg; alte Karten haben dann keinen Darsteller und entfallen | Einstellungen → Plugins |
| Bündel entfernen | wie aus, zusätzlich nicht mehr geladen | `dsh.profile.bundles` |

`/ui` schaltet **hostweit** (alle Sitzungen dieses Hosts) und überlebt keinen Neustart: Nach dem Start gilt wieder `config.offerTool`. `/ui status` nennt den aktuellen Stand, `/ui` ohne Argument ebenfalls.

## Aktivierung

Das Paket ist ein Bündel (`dsh.bundle.patch` → [`cordis.patch.yml`](cordis.patch.yml)) und trägt beide Hälften: den Host-Teil mit dem Werkzeug und den Browser-Teil mit dem Renderer. Es wird über `dsh.profile.bundles` des Profils geladen und erscheint danach im Plugin-Fenster als eigener Eintrag.

Nach dem Hinzufügen zum Profil ist ein **Neustart des Hosts** nötig; die Startliste des Browsers wird beim Start aus den aktiven Zeilen gebaut.

## Prüfen

```powershell
bun test                      # Format, Geometrie, Messung, gerenderte Karte
bun run build.mjs             # bündelt und führt das Bündel gegen einen Attrappen-Client aus
bun run typecheck             # Host- und Browser-Hälfte
bun preview.mjs               # schreibt .pmh-build/rich-ui-preview.html
```

`build.mjs` prüft mehr als die Form: Es meldet die Definition an, ruft `start` mit einem echten Diagramm auf, prüft den veröffentlichten Knoten samt Anker und stellt sicher, dass abgeschnittene Argumente zu einem Fehlerzustand führen statt zu einer Ausnahme. `preview.mjs` rendert dieselben Komponenten statisch in eine Seite — nützlich für einen Blick auf Abstände und Beschriftungen, ohne den Host zu starten.

## Grenzen

* **Kein Streaming der Karte.** Sie erscheint, sobald der Aufruf protokolliert ist; die Prosa streamt weiter wie bisher.
* **Keine Bilder aus dem Arbeitsbereich.** `src` ist eine URL oder eingebettete Daten; lokale Pfade rendert der bestehende Bild-Anhang, nicht diese Karte.
* **Keine Interaktion.** Ein Diagramm hat Tooltips, aber keine Filter, Zoomstufen oder Legenden-Schalter — dafür bräuchte es einen Zustand, der im Verlauf nicht aufgeht.
* **Messung braucht Canvas.** Ohne Canvas (Tests, Server-Render) schätzt `measure.ts` die Breite; die Beschriftung kann dann ein bis zwei Zeichen früher oder später gekürzt werden.
* **Feste Palette.** Die vier Reihenfarben sind Theme-Token; eine fünfte Reihe lehnt das Format ab, statt eine Farbe zu erfinden.
* **Noch kein Syntax-Highlighting.** Diese Karte zeichnet ihren Code selbst. Die Shell bringt aber `CodeBlock` (shiki) und den KaTeX-Renderer als Primitives mit — `@deepseek-ai/dsh-client-ui-primitives` exportiert beide. Eine zweite Engine zu bündeln wäre die falsche Antwort; richtig ist, die vorhandene über `dsh.client.inject` auszuleihen. Das kostet kein Bündelvolumen, nur die Umstellung der Karte auf `CodeBlock`. Bis dahin liefert sie Herkunft, Zeilennummern und Kopieren.
* **Die Breite braucht Canvas.** Ohne Canvas — Test, Server-Render — behält die Karte die volle Breite. Der Umbruch bleibt richtig, nur die Schmalheit fehlt.
* **Kein TeX in Karten.** Formeln in der Prosa rendert das Transkript über KaTeX (`ui-primitives` bringt dafür `markdown/katex.js` mit, inline und als Block). Eine Karte gibt Text aus und rendert keinen TeX; ein eigenes `formula`-Kind müsste KaTeX ein zweites Mal bündeln oder den Host um ein gerendertes Bild bitten.
* **`prejs` kennt keinen Abbruch.** `on()` sammelt Handler und es gibt kein `off()`; die Instanz lebt pro Mount, ein spätes Ereignis fängt ein `live`-Flag ab.
