# UI: Was wir in `prometheus-harness` implementieren

> Erstellt am 12.10.2026 nach Sichtung der laufenden Vorlage
> `H:\Projekt\Programmieren\Prometheus\webui` (<http://localhost:5174/>, Anleitung in
> [webui-dev.md](../reference/webui-dev.md)) und der Skizzen-Sammlung.
>
> Die Frage war nicht „was soll weg", sondern: **was wird bei uns echt gebaut?**

## A. Was wir übernehmen — als eigene Units

| # | Element | Warum es bei uns gebaut wird | Aufwand |
|---|---|---|---|
| 1 | **Dockbare Panels** (Leiste links, Layouts speicherbar) | Der Kern der Bedienung. Alle drei denkbaren Varianten (Dock-Leiste, IDE-artige Panels, unendliche Leinwand) sollen konfigurierbar sein, nicht festgelegt | hoch |
| 2 | **Zoom als Bedeutungsebenen** (Übersicht → Projekt → Datei → Detail) | Aus den Skizzen `002-b…002-g`. Zoom wechselt die Darstellung, nicht nur die Größe — das ist unser Unterscheidungsmerkmal | hoch |
| 3 | **Universe-Graph** (`Universe.svelte` → eigene Unit) | Wissens- und Projektgraph als sichtbare Fläche; Vorbild ist der vorhandene Entwurf, Umsetzung auf `three` | mittel |
| 4 | **Terminal als Gerüst, nicht als Shell** (`Terminal.svelte`) | Der Aufsatz ist brauchbar; bei uns hängt er an unserem Dienst-Modell, nicht an einer fest verdrahteten Shell | mittel |
| 5 | **Multi-Modell-Umschaltung** (aus `api.js` → `/api/model`) | Setzt genau die Anforderung um, die der Referenz-Harness **nicht** hat: Modell live wechseln, Persistenz in der eigenen Konfiguration | mittel |
| 6 | **Settings mit Write-Back** (`/api/settings`) | Einstellungen im UI ändern und dauerhaft schreiben — gehört zu „Dienste starten mit der Harness" | mittel |
| 7 | **Dünne API-Schicht** zwischen UI und Kernel | Eine einzige, kleine Vertragsfläche. Verhindert, dass Units Interna des Cores anfassen (Regel 2 aus [concept.md](../concept.md)) | klein |
| 8 | **Status-/Befehlszeile** | Sichtbarer Zustand statt stiller Ausfälle — die Regel „fehlgeschlagener Start ist ein sichtbarer Fehler" braucht eine Fläche | klein |
| 9 | **Markdown-Darstellung** | Der Harness liefert Dokumente und Berichte; Anzeige ist Pflicht, nicht Beiwerk | klein |
| 10 | **Tastenkürzel + Befehlspalette** | Ohne sie ist ein Docking-Workbench nicht bedienbar | klein |
| 11 | **Kalender-Anbindung** (aus `Calendar.svelte`, FullCalendar) | Erst sinnvoll mit unserem Scheduler — deshalb als **Unit mit Dienst**, nicht als loses Widget | mittel |
| 12 | **Sprach-/Audio-Eingabe** (`/api/voice`) | Zielbild des Betreibers; als eigene Unit nachrüstbar, kein Kernbestandteil | klein |

## B. Was wir ersetzen oder neu bauen

| Element | Befund in der Vorlage | Was wir tun |
|---|---|---|
| **Reaktivität** | `App.svelte` und `Calendar.svelte` ändern Variablen ohne `$state(...)` (`non_reactive_update`) | Von Anfang an korrekt in Svelte 5 — sonst erben wir stille Anzeigefehler |
| **Barrierefreiheit** | Zahlreiche `<div>`/`<a>` mit Klick-Handler ohne Rolle und ohne Tastaturweg, Autofokus, Labels ohne Steuerelement | Tastatur und Rollen sind Teil der Abnahme, nicht Nacharbeit |
| **Toter CSS-Bestand** | Viele `Unused CSS selector`-Meldungen (`.term …`, `.cev …`) | Ersatzlos weglassen; ein neuer Aufbau braucht diese Reste nicht |
| **Feste Ports und Pfade** | Dev-Server nur auf IPv6-Loopback, Port 5173 belegt, Go-Dienst auf 8080 erwartet | Startkonfiguration explizit machen und dokumentieren |
| **Monolithische Komponente** | `App.svelte` trägt 130 KB und alles auf einmal | Zerlegen: je Fähigkeit eine Unit mit eigenem Einstiegspunkt |

## C. Was bewusst **nicht** übernommen wird

| Element | Grund |
|---|---|
| Das **Go-Backend** der Vorlage (`Prometheus`, „Heusc") | Laut Festlegung ignoriert — Basis-Experiment, keine Grundlage dieses Vorhabens. Wir bauen den Kernel als TypeScript-Core |
| **Wegwerf-Skizzen als Codebasis** | Sie sind Darstellungsvorbild, nicht Architektur. Übernommen wird das **Verfahren** (Varianten vergleichen), nicht das HTML |
| **Design-System der Vorlage als Ganzes** | Aussehen ist nicht entschieden; die Bilder in `img/` sind Zielbilder, keine Vorgabe. Ein Design-System wird separat gewählt |
| **Automatisch erzeugter UI-Code aus dem Referenz-Harness** | Nur als Anschauung; wir bauen eigene Units statt fremde Client-Pakete zu kopieren |

## D. Reihenfolge im Projekt

1. **Gerüst steht** — Ordner- und Namensordnung wie die Core-Vorlage (erledigt, nur Namen, kein Inhalt).
2. **Ein Unit beweist die Kette** — Paket, Registrierung, Test, **im UI sichtbar**, absteckbar.
3. **Dann die Fläche** — Dock-Layout und Zoom, aufgebaut auf diesem einen Unit.
4. **Erst danach Füllung** — Graph, Terminal, Kalender, Sprache.

Diese Reihenfolge steht so auch im [Konzept](../concept.md) und in der
[Roadmap](../roadmap.md) und schützt davor, drei Sprachen und eine Oberfläche gleichzeitig
zu bauen.

## E. Offene Entscheidungen

- Welche der drei Layout-Varianten ist die **Voreinstellung**?
- Ist die Leiste links dauerhaft, einklappbar oder eine von mehreren Andockzonen?
- Wird der Graph aus `three` selbst gebaut oder auf einem bestehenden Graph-Renderer?
- Welches Design-System (Farbe, Typografie, Abstände) gilt?

Diese vier Punkte gehören in [decisions/](../decisions/) und in den
[Fragenkatalog](../decisions/open-questions.md).
