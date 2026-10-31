# Drei Änderungen am Prometheus Harness

Stand 31.10.2026. Der Aufbau der Oberfläche bleibt, wie er ist. Geändert werden drei Dinge: die Marke, die Farbe und eine Seite Darstellung in den Einstellungen. Alles andere, auch die Zeichen, bleibt unverändert.

Im Produkt ist nichts davon eingebaut.

## Was hier liegt

| Datei | Was sie zeigt |
|---|---|
| [vorschlag.html](vorschlag.html) | Drei Bildschirme untereinander: heute, derselbe Aufbau mit neuer Marke und Farbe, Einstellungen mit Darstellung |
| [icons.html](icons.html) | Die vorhandenen Zeichen, unverändert, mit ihren Quellen |
| [marke.svg](marke.svg) | Der Ring als Vektor, `currentColor` |
| [favicon.svg](favicon.svg) | Derselbe Ring auf einer dunklen Kachel |
| `zeichen/` | Die neun Seitenleisten-Zeichen als einzelne SVG-Dateien, aus den Client-Bündeln gezogen |
| `img/` | Die drei Bildschirme als Bild |
| `fonts/` | Montserrat mit Lizenztext (SIL OFL), nur für die Kopfzeile der Einstellungen |

## 1. Die Marke

Die Kopfzeile sagt heute `deepseek HARNESS`. Das ist der Name der Vorlage. Neu steht dort derselbe Aufbau mit **Prometheus HARNESS**: ein Ring, der Name, die Marke im Kästchen.

Der Ring ist bewusst neutral. Er trägt keine Bedeutung und läuft nicht Gefahr, eine falsche zu behaupten. Die Wiedererkennung trägt der Name, und ein Ring bleibt bei 16, 24 und 88 Pixeln ein Ring. Mehr braucht eine Marke in einer Seitenleiste nicht.

Das Zeichen liegt als `marke.svg` daneben, mit `currentColor`, damit es in jeder Fläche mitgeht.

## 2. Die Farbe

Die Flächen waren kühl und blau gestimmt, der Akzent war das Blau der Vorlage. Neu liegt alles auf einem warmen Graphit mit dem Farbton der Marke (30 Grad), und der Akzent ist die Markenfarbe.

| Rolle | heute | neu |
|---|---|---|
| Grund | `hsl(240 5% 8%)` | `hsl(28 8% 7%)` |
| Seitenleiste | `hsl(240 3% 11%)` | `hsl(28 8% 9.5%)` |
| Fläche | `hsl(240 2% 17.6%)` | `hsl(28 7% 14%)` |
| Linie | `hsl(0 0% 100% / .12)` | `hsl(30 20% 96% / .11)` |
| Text | `hsl(210 33% 98%)` | `hsl(30 14% 94%)` |
| Gedämpft | `hsl(214 5% 70%)` | `hsl(30 7% 56%)` |
| Akzent | `hsl(222 99% 67%)` | `hsl(30 77% 57%)` |
| Text auf Akzent | `hsl(0 0% 100%)` | `hsl(28 70% 9%)` |

Kontraste auf dem Grund: Text 16,4 : 1, gedämpft 5,9 : 1, Akzent 7,6 : 1, Text auf Akzent 7,0 : 1. Alle über der Grenze von 4,5 : 1.

Die Sättigung der Flächen liegt bei 6 bis 8 Prozent und nicht bei 10: Bei so geringer Helligkeit kippt ein höherer Wert ins Bräunliche.

## 3. Darstellung in den Einstellungen

In den Einstellungen liegt zwischen Allgemein und Modelle ein neuer Punkt Darstellung:

- **Thema**: Dunkel, Hell, System. Dunkel ist gebaut, Hell nicht. Der Hinweis sagt das.
- **Akzent**: vier Punkte, Markenfarbe, Blau, Grün, Grau. Die Wahl färbt Auswahl, Freigabe und den einen Knopf.
- **Dichte**: Bequem oder Kompakt, 6 px Unterschied je Listenzeile.
- **Schriftgröße**: 13 bis 17 px für Verlauf und Eingabe.
- **Vorschau**: ein kleines Stück Seitenleiste mit Eingabe in der gewählten Farbe.

Damit bleibt die Gestaltung eine Einstellung und keine fest verdrahtete Entscheidung. Wer das Blau behalten will, wählt Blau.

## 4. Die Zeichen bleiben

Der Auftrag war Marke, Farbe und Darstellung. Die Zeichen der Seitenleiste sind deshalb unverändert; sie liegen in [icons.html](icons.html) mit ihren Quellen.

Damit der Entwurf nicht mit erfundenen Zeichen arbeitet, sind die neun Pfade aus den Client-Bündeln gezogen statt nachgezeichnet:

| Zeichen | Quelle |
|---|---|
| Plugins | `dsh-client-ui-plugin-manager`, `IconPluginPinwheelOutlineRegular` |
| Automatisierungsaufgaben | `dsh-client-ui-schedule`, `IconClockOutlineRegular` |
| Konten | `packages/plugin/accounts`, `KontenIcon` |
| Crew | `packages/plugin/crew`, `CrewIcon` |
| Git | `packages/plugin/git`, `GitIcon` |
| Obsidian | `packages/plugin/obsidian`, `ObsidianIcon` |
| Graphify | `packages/plugin/graphify`, `GraphifyIcon` |
| Verbrauch | `packages/plugin/usage`, `UsageIcon` |
| Suche | `packages/plugin/obsidian`, `SearchIcon` |

## Was noch fehlt

1. **Hell ist nicht entworfen.** Ein zweiter Modus, der nur die Hälfte der Flächen kennt, sieht schlechter aus als keiner. Der Punkt bleibt vorerst gesperrt.
2. **Der Ort im Code ist noch nicht angebunden.** Die Farben liegen im Harness in `ui-theme` (`design-platform.css`, die Token `--dsw-alias-*`), die Marke in `@deepseek-ai/dsh-client-ui-brand-official` über `BrandWordmark` und `FishLogo` aus `dsh-client-ui-primitives`, die Einstellungen in den `dsh-client-ui-settings-*`-Paketen. Diese Quellen liegen nicht in diesem Checkout, deshalb ist hier ein Entwurf und kein Patch.
3. **Die Zahlen in den Bildschirmen sind Beispielwerte**, übernommen aus dem heutigen Bild: Arbeitsbereiche, Sitzungstitel und Zeitangaben.

## Prüfen

```bash
node .tmp/serve-design.mjs docs/design/umbau-2026-10 5099
```

Dann `http://127.0.0.1:5099/vorschlag.html` öffnen. Die Seite braucht keinen Build und kein Netz.
