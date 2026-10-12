# Einheitlicher DSH-Standard für Eckenradien

English | [中文](ui-radius.zh.md)

## Zusammenfassung

Konsistente Eckenradien nach Komponentenrolle und -größe wählen und verschachtelte Bereiche, Hover-Füllungen, Hintergründe und Konturen aufeinander abstimmen. Dieser Standard umfasst Buttons, Zellen, Karten, Menüs, Dialoge und Avatare in DSH Web und Desktop.

## Inhaltsverzeichnis

- [Geltungsbereich und Autorität](#scope)
- [Den Radius wählen](#radius-scale)
- [Tokens wiederverwenden und bewusste Formen erhalten](#shapes)
- [Verschachtelte Geometrie und Hover](#nested-hover)
- [Materialien der Einstellungskarten](#settings-cards)
- [Anwenden und verifizieren](#verification)

<a id="scope"></a>
## Geltungsbereich und Autorität

Diese Referenz definiert die Radius-Skala von DSH Web und Desktop und ihre Komponentenregeln. Eine lokale visuelle Anpassung bleibt auf die benannte Komponente oder Familie beschränkt und ändert die globale Skala nicht automatisch.

Die [Web-UI-Stilreferenz](web-styling.md) definiert die allgemeine Styling-Zuständigkeit. Gemeinsame Werte liegen in [`base.css`](../packages/client/ui-theme/src/styles/base.css), das Kurvenverhalten in [`corner-shape.css`](../packages/client/ui-theme/src/styles/corner-shape.css). Bei einer Regeländerung sind die Theme-Implementierung und beide Sprachfassungen dieses Standards gemeinsam zu aktualisieren.

<a id="radius-scale"></a>
## Den Radius wählen

H bezeichnet die entworfene Außenhöhe in CSS-Pixeln, einschließlich Rahmen. R bezeichnet das CSS-`border-radius`, bevor der Browser überlappende Ecken beschneidet. Zuerst die Komponentenrolle wählen, dann ihre Größenvariante; Breite, Länge des Labels, beiläufiger Umbruch und Inhaltserweiterung wählen nicht eigenständig einen größeren Radius.

| Rolle | Typische Maße oder Beispiele | Radius | Gemeinsames Token |
|---|---|---|---|
| Kleines Detail | Unter H20; Keycaps, Inline-Code, winzige Controls | R4 | `--dsw-radius-xs` |
| Kompaktes Control | H20–28; kleine Buttons, kompakte Icon-Buttons, kompakte Menüeinträge | R8 | `--dsw-radius-sm` |
| Standard-Control oder einzeilige Zelle | H32–40; Buttons, Inputs, Selects, Navigationszeilen | R12 | `--dsw-radius-md` |
| Großes Control oder gruppierter Inhalt | Große Buttons, bewusst mehrzeilige Zellen, verschachtelte Formulargruppen | R16 | `--dsw-radius-lg` |
| Eigenständige Inhaltskarte | Einstellungskarten, Message-Bubbles, Guide-Eintragskarten | R20 | `--dsw-radius-xl` |
| Hauptumschließende Fläche | Composer, Dialoge, Haupt- oder schwebende Panels | R28 | `--dsw-radius-panel` |

Wenn ein vorgesehenes Control zwischen diese Bänder fällt, eine bestehende gemeinsame Größenvariante bevorzugen. Eine höhere Karte bleibt eine Karte: Sie nicht allein deshalb auf R28 hochstufen, weil sie die Höhe eines Buttons übersteigt. Eine mehrzeilige Zelle, die bewusst für mehrere Zeilen entworfen ist, verwendet R16; ein gewöhnlicher Button, dessen Label umbricht, behält seine Button-Variante.

Konkrete Defaults: `Button` verwendet H28/R8 für `sm` und H36/R12 für `md`, einschließlich Outline-Varianten. Standard-Inputs mit H32 und Selects mit H36 verwenden R12. Die Guide-Einträge „Workspace files“ und „New terminal“ verwenden beide R20, einschließlich der Varianten nur mit Titel und mit Beschreibung. R28 ist für ihr umschließendes Panel oder ihren Dialog reserviert, nicht für diese Einträge.

Codeblöcke, Diffs und Dateivorschauen teilen R16: Eintragskarten für geänderte Dateien, Karten für ausgelieferte Dateien, generische Dateianhang-Karten und Hover-Vorschau-Panels. Die 40px-Dateiicon-Kacheln innerhalb von Karten für geänderte Dateien und für Lieferungen verwenden als komponentenspezifische Ausnahme R10 an allen vier Ecken. Ihre Hover-Füllungen behalten dieselbe Kontur.

<a id="shapes"></a>
## Tokens wiederverwenden und bewusste Formen erhalten

`ui-primitives`-Controls wiederverwenden, bevor feature-eigene Geometrie hinzugefügt wird. `box-sizing: border-box` für feste Außenmaße verwenden. Die Varianten Filled, Outline, Ghost, Loading und Disabled behalten dieselbe Größe und denselben Radius; die Zustände Hover, Pressed, Selected und Focus ändern den Radius nicht.

Die benannten Tokens konsumieren, statt für gewöhnliche Controls und Karten lokale Werte wie 10px, 14px, 18px oder 24px einzuführen. Schedule-Controls, Desktop-Onboarding, Kontohinweise und Shortcut-Controls behalten ihre paketeigene Geometrie; der [Radius-Ausnahmedatensatz](../packages/client/ui-theme/tests/expected/radius-exceptions.expected.json) pinnt jede zulässige Datei, jeden Selektor und jede Deklaration, statt ganze Pakete auszunehmen. Eine familieneigene Property darf auf ein gemeinsames Token verweisen, wie es `--dsl-guide-entry-radius` tut. Geometrie, die aus einem echten Inset abgeleitet ist, darf `calc()` verwenden; sie ist keine zusätzliche Skalenstufe.

Gewöhnliche abgerundete Flächen verwenden die Kurve `superellipse(1.5)` des Themes, wo sie unterstützt wird. `corner-shape` wird nicht vererbt: das Theme wendet es auf Elemente und deren `::before`/`::after` an. Nicht unterstützende Engines behalten gewöhnliche kreisförmige Ecken. Keine komponentenspezifische Glättung einführen, durch die eine Füllung und ihre Kontur unterschiedlich krümmen.

Beabsichtigte Kreise und Kapseln erhalten: Avatare und Statuspunkte verwenden `50%`; explizite Pills und vollrund laufende Tracks dürfen `999px` verwenden. Jede solche vollrunde Deklaration mit `corner-shape: round` in derselben Regel paaren. Nicht jeden Button zur Kapsel machen, nur weil seine Höhe klein ist. Winzige Zeichnungsdetails wie Glyphenmarken oder Miniatur-Tracks dürfen ihre etablierte lokale Geometrie behalten; sie rechtfertigen keine beliebigen Radien an umgebenden Controls.

Sowohl der Avatar-Container als auch sein `img` müssen kreisförmig bleiben; ein Bild, das nur `border-radius` erbt, benötigt weiterhin ein explizites `corner-shape: round` oder muss die Kurve von seinem kreisförmigen Container erben. Bei beiden gleiche Breite und Höhe beibehalten. Siehe [Kontoeinstellungen](../packages/client/ui-settings-account/README.md#use-this-package) für die Größen von Konto-Avataren.

Bündig angedockte Flächen und angrenzende Zellen dürfen an gemeinsamen Kanten R0 verwenden. Ein Header, Footer oder Bild, das bündig an einer Karte anliegt, rundet nur seine freiliegenden Außenecken; quadratische interne Übergänge erhalten, statt jedes Kind auf allen vier Seiten zu runden.

<a id="nested-hover"></a>
## Verschachtelte Geometrie und Hover

Diese drei Anordnungen unterscheiden, bevor ein Kind-Radius geändert wird:

| Anordnung | Regel | Beispiel |
|---|---|---|
| Konzentrisches Inset | Innen-R = max(0, Außen-R − Inset); dieselbe Kurve verwenden | Außen R16, Inset 4, innen R12 |
| Füllung bündig an einer umschließenden Kante | Die Umschließung besitzt die sichtbare Ecke; die Füllung clippen oder die passende Ecke erben | Eine Split-Button-Karte mit zwei unabhängigen Hover-Bereichen |
| Eigenständige Karte oder Formulargruppe innerhalb einer anderen Fläche | Die semantische Ebene des Kindes wählen; nicht mechanisch das gesamte Parent-Padding abziehen | R16-Editor innerhalb einer R20-Einstellungskarte |

Standardmenüs verwenden außen R16, 4px Padding und R12 für Einträge. Kompakte Menüs verwenden außen R12, 4px Padding und R8 für Einträge. Das gemeinsame `SegmentedControl` verwendet außen R12, 4px Inset und R8 für Segmente/Indikator; `SegmentedTabs` verwendet außen R16, 4px Inset und R12 für Segmente/Indikator. Bei Änderungen am Padding Indikator-Offsets, Breitenberechnungen, Submenü-Ausrichtung und Pointer-Bridges konsistent halten.

Eine einzelne klickbare Fläche zeichnet Hover auf sich selbst. Ein bündiges Pseudo-Element oder Overlay verwendet denselben Radius und dieselbe Kurve wie die sichtbare Umschließung. Eine separat gerundete Füllung vermeiden, die einen Halbmond zwischen Hintergrund und Rahmen lässt.

Bei einer geteilten Guide-Karte den gemeinsamen Radius und das Clipping auf die äußere Karte legen; den bündigen inneren Buttons eckige Ecken geben. Jeder Button darf seine eigene Hover-Farbe behalten, während die äußere Karte beide Füllungen auf eine Kontur clippt. Dropdown-Menüs über das bestehende Portal außerhalb des geclippten Subtrees halten. Eine sichtbare Keyboard-Focus-Behandlung erhalten, statt einen externen Focus-Ring wegzuclippen.

```css
.entry {
  border-radius: var(--dsl-guide-entry-radius);
  overflow: hidden;
}

.main,
.trigger {
  border-radius: 0;
}
```

Der umschließende Guide setzt `--dsl-guide-entry-radius: var(--dsw-radius-xl)`. Den inneren Buttons keine eigenen R28-Enden geben, während die äußere Karte R20 ist.

<a id="settings-cards"></a>
## Materialien der Einstellungskarten

Die Karten für Kontoprofil, Guthaben, Modell-Provider, Preset und Plugin teilen dieses Default-Material. Die Zustände Selected, Warning, Error und Expanded dürfen ihre bestehenden semantischen Farben verwenden und behalten dabei die Geometrie.

```css
.card {
  border-radius: var(--dsw-radius-xl);
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  background: var(--dsw-alias-settings-card-fill);
}
```

Das Theme löst die Kartenfüllung zu `--dsw-alias-bg-layer-2` und die Kontur zu `--dsw-alias-border-l4` auf `body` auf, wo die Paletten-Aliase existieren. Feature-Styles konsumieren diese Aliase in beiden Paletten. Verschachtelte Editoren verwenden R16 und die bestehende Modul-Füllung. Links für Kontonutzung/Aufladen folgen der H36/R12-Button-Geometrie; Autorisierungs-Buttons verwenden den gemeinsamen Button.

Flache neutrale Rahmen verwenden die gemeinsame 0.5px-Haarlinie. Erhöhte Menüs, Popovers, Dialoge und Panels verwenden `border: 0` mit dem bestehenden Material `--dsw-elevation-*`, dessen Schatten die Haarlinie enthält. Keinen zweiten neutralen Rahmen über diese Kontur legen und einer gewöhnlichen Einstellungskarte keinen Schatten hinzufügen, nur um ihren Tab zu unterscheiden. Semantische zustandsfarbige Rahmen und das bestehende Verhalten des transluzenten Menü-Hintergrunds erhalten.

<a id="verification"></a>
## Anwenden und verifizieren

1. Die angefragten Komponenten zusammen mit ihren gemeinsamen Primitives, Overlays, Pseudo-Elementen und Geschwistervarianten inspizieren. Rollen klassifizieren, bevor Werte ersetzt werden; nicht jedes Vorkommen eines alten Radius auf dasselbe neue Token abbilden.
2. Wo passend den gemeinsamen Owner ändern und danach abhängige Füllungen, Kind-Ecken, Clipping und Zustands-Styles angleichen. Eigenständige Kind-Karten auf ihrer eigenen Ebene belassen.
3. Die tatsächlich gerenderte Außengröße, den Radius, die Kurve, die Füllung und die Kontur in hellem und dunklem Theme vergleichen. Wo zutreffend die Zustände Normal, Hover, Pressed/Selected, Disabled und Keyboard-Focus inspizieren; bei Split-Buttons beide Hälften hovern. Ein schmales Layout und längere Labels prüfen, wenn sie die Komponente beeinflussen können.
4. Die bestehenden Stylesheet-Guards für Radius, Corner-Shape und Elevation sowie das kleinste relevante Browser-Szenario verwenden. Der Radius-Guard weist skalenfremde Literale und unbekannte Tokens zurück; er kann nicht feststellen, ob ein gültiges Token für eine Komponente angemessen ist oder ob zwei gerenderte Konturen übereinstimmen. Diese Punkte visuell bestätigen.
5. Die Validierungs- und Dokumentationsanforderungen des Repositories für den tatsächlichen Diff befolgen. Betroffene Expectations erst aktualisieren, nachdem das beabsichtigte Erscheinungsbild bestätigt ist. Die resultierende Regel, die getesteten Flächen und alle nicht verifizierten Zustände melden; keine Tests hinzufügen, die für eine triviale lokale Anpassung lediglich CSS-Werte wiederholen.
