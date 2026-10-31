# Prometheus — Zeichensatz

**Erzeugt aus `../src/shapes.ts`** (`bun build.mjs`). Nicht von Hand ändern: die Quelle ist der Code.

| Datei | Was |
|---|---|
| `<name>.svg` | ein Zeichen je Datei, 24×24, ohne Größe (skalierbar) |
| `sprite.svg` | alle Zeichen als `<symbol>` — einmal einbinden, danach `<use href="#pmh-icon-chat"/>` |
| `index.html` | das Übersichtsblatt: alle Zeichen groß, auf hellem und dunklem Grund |

Die Farbe kommt **immer** von außen (`currentColor`); die Größe setzt der Aufrufer.

## Die Zeichen

| Name | Was es zeigt |
|---|---|
| `prometheus` | Die Flamme mit zwei Zungen — die Marke. Sie steht für das gestohlene Feuer. |
| `phoenix` | Der Phönix — aus der Asche aufsteigend. Für „Neuanfang", „Wiederaufbau", „Weiter nach dem Fehler". |
| `flamme` | Das Feuer — drei Zungen über dem Grund. Für „Schmiede", „Hitze", „in Betrieb". |
| `torch` | Die Fackel — das Feuer wird getragen. Für „weitergeben" und „in Betrieb". |
| `vessel` | Das Gefäß (Narthex), in dem das Feuer kam. Für „Behälter", „Bestand", „Sitzung". |
| `chain` | Zwei verschlungene Glieder — Prometheus war an den Felsen gebunden. Für „festgelegt". |
| `anvil` | Der Amboss — die Werkstatt des Hephaistos. Für „Bauen", „Umsetzen". |
| `hammer` | Der Hammer — das Werkzeug der Schmiede. Für „formen", „schlagen", „umbauen". |
| `orbit` | Eine Bahn mit zwei Körpern darauf — der kosmische Überblick, der Weg in die Welt. |
| `chat` | Eine Sprechblase mit zwei Zeilen — der Chat. |
| `reset-view` | Die Kamera kehrt zurück — „Ansicht zurücksetzen". |
| `settings` | Drei Schienen mit Knöpfen — Einstellungen. |
| `gear` | Ein Zahnrad — Einstellungen als Gruppe, „Mechanik". |
| `close` | Ein Kreuz — schließen, abstecken, abbrechen. |
| `chevron-right` | Ein Pfeil nach rechts — „weiter", „aufklappen". |
| `chevron-down` | Ein Pfeil nach unten — „öffnen", „mehr davon". |
| `chevron-left` | Ein Pfeil nach links — „zurück", „einklappen". |
| `chevron-up` | Ein Pfeil nach oben — „zuklappen", „eine Ebene höher". |
| `plus` | Ein Kreuz aus zwei gleichen Strichen — hinzufügen, öffnen. |
| `prompt` | Eine Eingabeaufforderung: Winkel und Strich. Für das Terminal. |
| `panels` | Eine Fläche mit einer Trennlinie — die Panels. |
| `layers` | Drei übereinanderliegende Ebenen — Ansichten, Bezugsebenen. |
| `search` | Eine Lupe — suchen, finden, einen Körper aufspüren. |
| `place` | Eine Marke im Raum — ein Ort. |
| `constellation` | Verbunde Punkte — der kosmische Überblick. |
| `stack` | Gestapelte Kästen — ein Stapel, ein Bauwerk, „projekt-stack". |
| `solar-system` | Eine Sonne mit einer Bahn und einem Körper darauf — das Sonnensystem. |
| `galaxy` | Zwei gekreuzte Bahnen — eine Galaxie. |
| `cluster` | Mehrere Punkte dicht beieinander — ein Sternhaufen. |
| `star` | Ein Stern: Kern und acht Strahlen. Für die Sonne und die Marke „stern". |
| `planet` | Ein Körper mit Ring und einer Küstenlinie — ein Planet, die Erde. |
| `object` | Eine Kugel mit Lichtkante und Krater — ein beliebiger Körper. |
| `code-file` | Ein Blatt mit geknickter Ecke und zwei Klammern — eine Datei mit Text. |
| `pulse` | Ein Ausschlag in einer ruhigen Linie — „live", ein Messwert, Gesundheit. |
| `spark` | Ein vierzackiger Funke — ein Hinweis, „neu", ein einzelnes Ereignis. |
| `chip` | Ein Baustein mit Anschlüssen — ein Gerät, ein Prozess. |
