# Web-UI-Stilreferenz

English | [中文](web-styling.zh.md)

Diese Referenz definiert die Styling-Zuständigkeit und die Komponentenregeln für Browser-Client-Pakete. Die aktuellen Token-Werte liegen in [`packages/client/ui-theme/src/styles/`](../packages/client/ui-theme/src/styles/); dieses Dokument dupliziert dieses aus dem Quellcode generierte Inventar nicht.

## Zuständigkeit

[`ui-theme`](../packages/client/ui-theme/README.md) besitzt die statische Skala `--dsw-*`, semantische Aliase, Typografie, Motion, Verläufe, Schatten, Scrollbar-Styles und die Hell/Dunkel-Präferenz. [`ui-layout`](../packages/client/ui-layout/README.md) wendet den aufgelösten Theme-Snapshot auf das Dokument an. Feature-Pakete konsumieren semantische Aliase und definieren kein weiteres globales Theme.

Globale Stylesheets gehören in `ui-theme/src/styles/`. Komponenten-Styles liegen als CSS Modules neben ihrer Komponente. Eine Komponente darf eine lokale Custom Property definieren, wenn ihr Wert Teil des Layout- oder Darstellungsvertrags dieser Komponente ist; gemeinsame Farben, Typografie, Elevation und Motion gehören zum Theme-Paket.

<a id="component-rules"></a>
## Komponentenregeln

- Das Control wiederverwenden, bevor eines neu gestylt wird: der [ui-primitives-Komponentenkatalog](../packages/client/ui-primitives/README.md#component-catalog) ist der einzige Kanal, der Feature-Pakete quert, und eine beabsichtigte visuelle Abweichung gehört dort in eine Prop statt in eine zweite Kopie ([Referenz](../packages/client/ui-primitives/README.md)).
- CSS Modules und `clsx` verwenden; keine Komponentenbibliothek und kein Tailwind hinzufügen.
- In Feature-Komponenten die semantischen Tokens `--dsw-alias-*` verwenden. Dort keine statischen Palettenwerte kopieren und keine literalen Farben schreiben.
- Theme-Selektoren aus dem CSS von Feature-Komponenten heraushalten. Hell/Dunkel-Overrides gehören zum Theme-Owner.
- Schriftgrößen mit Zeilenhöhen paaren und die Typografie-Variablen des Themes verwenden, wenn eine bestehende Rolle passt.
- Quelltext, Terminalausgabe und Diff-Zeilen ungebrochen lassen, wenn ihr Komponentenvertrag den Spaltenerhalt erfordert; die gemeinsamen Scrollbar-Styles statt komponentenspezifischer Scrollbar-Selektoren verwenden.
- Darstellung in CSS unterbringen. Inline-React-Styles dürfen komponentenlokale Custom-Property-Werte übergeben, aber keine Theme-Verzweigungen kodieren.
- Sichtbarkeit des Keyboard-Focus und das Reduced-Motion-Verhalten erhalten, wenn Übergänge oder reine Hover-Controls hinzugefügt werden.
- Abgerundete Ecken erben auf unterstützenden Engines die globale Superellipsen-Glättung aus `corner-shape.css` von ui-theme. `corner-shape: round` mit jedem vollrunden `border-radius` (`50%`, `100%` oder ein Pill-Radius) paaren, damit Kreise und Kapseln kreisförmige Bögen behalten; die Corner-Shape-Spec von ui-theme erzwingt die Paarung.
- Erhöhte Flächen (Menüs, Popovers, Modals, Panels, schwebende Buttons, der Composer) setzen `border: 0` und nehmen `box-shadow: var(--dsw-elevation-panel)`, `var(--dsw-elevation-prominent)` oder `var(--dsw-elevation-soft)` des Composers (größerer Blur bei niedrigerem Alpha): die 0.5px-Haarlinienkontur ist die erste Schattenebene, und `--dsw-elevation-stroke-color` bindet sie pro Fläche oder Zustand neu oder unterdrückt sie. Niemals einen Rahmen `--dsw-alias-border-*` mit einem lv-/Elevation-Schatten paaren — die Elevation-Spec von ui-theme weist diese Paarung zurück; zustandsfarbige Rahmen (Warn-Panels) bleiben echte Rahmen.
- Bestehende und neue Dropdown-, Kontext-, Submenü- und Auswahlmenüs verwenden `Menu` oder hüllen benutzerdefinierten Inhalt in `MenuSurface`. Das Material ist das theme-eigene `--dsw-menu-surface-fill` plus `--dsw-menu-backdrop-filter`; Feature- und Plattform-CSS dürfen keines von beiden überschreiben. Die Menü-Spec von ui-theme weist nicht umhüllte Menü-/Listbox-Renderer, Material-Overrides und Token-Neudefinitionen zurück. Die vom Schedule besessenen `TaskMenu` und `ClockPicker` behalten ihre bestehenden Container und ihr Material als ausdrückliche Ausnahmen ([Owner](../packages/client/ui-schedule/README.md)).
- Modal-Backdrops, einschließlich Einstellungs- und Bestätigungsdialogen, behalten ihre transluzente dunkle Maske ohne Blur. Das Theme setzt `--dsw-mask-blur` auf `none`; Desktop-eigene Modal-Overlays lassen auch die übergeordnete Seite ungefiltert.
- Das Filtern des Menühintergrunds bleibt auf einer isolierten Ebene, damit verschachtelte Menüs und fixierte Overlays ihre Positionierung und ihren Backdrop behalten. Unter macOS fügt `MenuSurface` nur innerhalb der Grenzen jedes Menüs eine opake Hinterlegung hinter dem Seiteninhalt hinzu, sodass Chromium Inhalte über der nativen Vibrancy blurren kann; CSS-Anker folgen Platzierung und Größe, und beim Unmounten wird die Hinterlegung entfernt. Overlays ohne diese Hinterlegung verwenden `--dsw-specific-menu`, dessen theme-eigene macOS-Füllung zu 94 % opak ist, damit darunterliegender Text nicht durchscheint. Andere erhöhte Flächen, die diese Füllung verwenden, paaren sie auf ihrem eigenen isolierten Hintergrund mit demselben Filter, wenn sie fixierte Overlays enthalten.
- Flache Rahmen und Trennlinien, die ein neutrales Token `--dsw-alias-border-*` verwenden, zeichnen mit `0.5px` — Buttons, Inputs, Karten, Zeilenteiler und als gefüllte Boxen gezeichnete Separatoren (Menü-Separatoren, die Naht des Konversations-Headers, Markdown-`hr`, vertikale Schienen) teilen das Haarliniengewicht, das Chromium als ein Gerätepixel malt. Gestrichelte Affordanzen und zustandsfarbige Rahmen behalten 1px; Spinner-Ring-Tracks behalten ihre Breite über die ausdrückliche Allowlist der Spec. Die Elevation-Spec von ui-theme weist breitere neutrale durchgezogene Rahmen zurück.
- Klickbare Artefakt-Links (Markdown-Anker, im Fließtext erwähnte Dateien, Web-Quellen- und Fetch-Links, Chips für erzeugte Dateien, Workflow-Member-Links) färben über `--dsw-alias-link` bei `font-weight: 500`, ohne Unterstreichung im Ruhezustand und mit einer gepunkteten Unterstreichung mit 3px-Versatz bei Hover/Focus. Kompaktes Thinking-Markdown behält die tertiäre Textfarbe und eine gepunktete Unterstreichung im Ruhezustand ([kompakte Darstellung](../packages/client/ui-primitives/README.md#rendering-agent-output)). Textführende Anker führen zusätzlich das Kategorie-Glyph `LinkIconMedium` aus ui-primitives, das `currentColor` trägt und bei einem bekannten externen Host statt des Globus die eigene Marke dieser Seite ist; Workflow-Member-Links und reine Bild-Anker tragen kein Glyph, und Datei-Links in Tool-Zeilen behalten ihre graue gepunktete Affordanz.

<a id="corner-radii-and-settings-cards"></a>
## Eckenradien und Einstellungskarten

Der [einheitliche DSH-Standard für Eckenradien](ui-radius.md) definiert die Radius-Skala, die Zuordnung der Komponentengrößen, die Ausnahmen für Kreise und Kapseln, die verschachtelte Hover-Geometrie sowie Füllungen und Konturen der Einstellungskarten.

## Das System ändern

Ein gemeinsames Token im besitzenden `ui-theme`-Sheet hinzufügen oder ändern und danach seinen semantischen Alias aus Feature-Paketen konsumieren. Die Referenz des besitzenden Pakets aktualisieren, wenn sich ein öffentlicher Styling-Vertrag ändert. Das visuelle Verhalten folgt der [Test-Richtlinie](testing.md); die [archivierte Styling-System-Agent-Note](../.agents/notes/archived/process/2026-07-19-web-styling-system.md) hält die Framework-Begründung fest.
