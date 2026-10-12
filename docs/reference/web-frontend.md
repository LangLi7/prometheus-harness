# Web-Oberfläche: `apps/web`

> Angelegt am 12.10.2026. Dieses Dokument beantwortet: **wo** die Oberfläche liegt, **warum
> dort**, **was** aus der Web-UI-Vorlage übernommen wurde, **wie** man sie startet und
> **was gemessen** wurde. Vorlagen-Pfade und Startanleitung der Vorlage selbst stehen in
> [webui-dev.md](webui-dev.md), die Übernahme-Entscheidung in
> [../design/ui-keep-cut.md](../design/ui-keep-cut.md).

---

## 1. Wo sie liegt — und warum genau dort

```
C:\Users\Chang\prometheus-harness\apps\web
```

Die Core-Vorlage (`C:\Users\Chang\harness\prometheus-harness`, Upstream
<https://github.com/deepseek-ai/deepseek-harness>) legt ihre Web-Oberfläche nach `apps/web`:

| Vorlage-Verzeichnis | Rolle dort | Rolle bei uns |
|---|---|---|
| `apps/web` | Vite-Einstieg der Oberfläche (`@deepseek-ai/dsh-web-frontend`), `index.html` + `src/` + `vite.config.ts` | **derselbe Ort, dieselbe Rolle** |
| `apps/cli` | Host, der das gebaute `dist/` ausliefert (`dsh web`) | vorgesehen, noch leer |
| `apps/desktop`, `apps/desktop-host` | Desktop-GUI | vorgesehen, noch leer |
| `packages/client/ui-*` | die UI-Bausteine als einzelne Units (~60 Stück, z. B. `ui-dockkit`, `ui-sidebar`, `ui-primitives`, `ui-slots`, `ui-theme`) | vorgesehen für unsere UI-Units, noch leer |
| `website/` | **VitePress-Dokumentationsseite** (`@deepseek-ai/website`, `vitepress dev`) — nicht die App-Oberfläche | bei uns ebenfalls Doku-Seite, **nicht** die Oberfläche |

**Ein erster Anlauf lag in `C:\Users\Chang\prometheus-harness\webui`.** Das war falsch: Der
Ordner `apps/web` existierte aus dem Namensskelett bereits, ein zweiter Web-Ordner daneben
hätte zwei Wahrheiten erzeugt. Der Inhalt wurde nach `apps/web` verschoben, `webui/` gibt es
nicht mehr.

**Ebenso abgegrenzt:** `website/` ist bei uns — wie in der Vorlage — die
Dokumentationsseite. Dort gehört die Oberfläche **nicht** hin; bisher ist dort nichts
implementiert.

## 2. Aufbau des Ordners

```
apps/web
├── index.html          Einstiegsseite; lädt /src/main.tsx, verweist auf /favicon.svg
├── package.json        @prometheus-harness/web
├── vite.config.ts      React-Plugin; host 127.0.0.1, port 5175, strictPort
├── tsconfig.json       strenger Typecheck (strict, noUnusedLocals, verbatimModuleSyntax)
├── README.md           Kurzfassung dieses Dokuments für den Ordner selbst
├── public/             favicon.svg (eigenes, nicht aus der Vorlage)
├── stress-tests/       Platz aus dem Namensskelett, noch leer
├── tests/              channels-island.test.tsx — Struktur-Abnahme der Insel
└── src
    ├── main.tsx        mountet App (bewusst ohne StrictMode, siehe §7)
    ├── App.tsx         Fläche: Hintergrund + Insel
    ├── app.css         Design-Tokens, Reset, Basis, `.stage` — eine einzige Datei (§8)
    └── lib
        ├── ChannelsIsland.tsx / .css   die Dynamic Island
        ├── island-data.ts              Kanäle, Branches, Tools als Daten
        └── Universe.tsx / .css         der Hintergrund
```

## 3. Was aus der Vorlage übernommen wurde

Quelle ist die Web-UI-Vorlage `H:\Projekt\Programmieren\Prometheus\webui`. Übernommen wurde
**genau zweierlei**: die Insel und der Hintergrund.

| Was | Vorlagendatei | Stelle dort | Bei uns |
|---|---|---|---|
| Insel-Markup | `src/App.svelte` | Zeilen 319–336 (`.full`, `.head`, `.ch`, `.grp`, Einträge) | `src/lib/ChannelsIsland.tsx` |
| Insel-Aussehen | `src/App.svelte` | `<style>` Zeilen 530–548 (`.isl`, `.isl.max`, `.full`, `.head`, `.head b/span`, `.x`, `.ch`, `.grp`, `a`, `a:hover`, `a.on`, `a .h`, `a .b`) | `src/lib/ChannelsIsland.css` |
| Insel-Inhalte | `src/App.svelte` | Zeilen 322–333 (4 Kanäle, 3 Branches, 2 Tools, Marken `live`/`7d`/`neu`) | `src/lib/island-data.ts` |
| Hintergrund | `src/lib/Universe.svelte` | `init()` Zeilen 219–242 (WebGL-Renderer, orthografische Kamera, OrbitControls), `buildStarField()` 195–205, `buildJARVIS()` 160–193, Animationsschleife 294–360 | `src/lib/Universe.tsx` |
| Hintergrund-Verlauf | `src/lib/Universe.svelte` | `<style>` Zeile 397 `canvas { background: radial-gradient(ellipse at 50% 35%, #0c0a10, #050507 75%) }` | `src/lib/Universe.css` |
| Farb- und Schriftwerte | `src/app.css` | `:root` mit `--bg … --sans` | `src/app.css` |

**Nicht übernommen** (bewusst, weil es nicht Insel und nicht Hintergrund ist): der
Kosmische-Web-Graph aus sechs Projektgalaxien samt Chunk-Streaming/LOD, Kepler-Orbits,
Force-Graph, Filamente, `.panel`, `.dock`, `.term`, `.rail`, Kalender, Suche, Einstellungen,
`api.js`, die Mikrofon- und Sprachsteuerung sowie die HUD-Kopfzeile der Vorlage. Die
Vorlage-Stylesheet-Regeln der Insel sind die **einzigen** Regeln, die aus dem 100+-Regel-Block
der `App.svelte` mitgewandert sind.

## 4. Stack — nach `docs/stack.md`, nicht nach der Vorlage

Die Vorlage ist **Svelte 5**. Unser Projekt ist laut [../stack.md](../stack.md) und
[../project-profile.md](../project-profile.md) auf **TypeScript + React** festgelegt
(„Oberfläche · entschieden"), Laufzeit **Bun**, Typecheck **TypeScript 7**. Deshalb ist die
Insel **nachgebaut**, nicht kopiert: Markup-Reihenfolge, Klassennamen, Maße und Farben sind
identisch, die Technik ist unsere.

| Baustein | Bei uns | Belegt durch |
|---|---|---|
| Laufzeit, Pakete | Bun 1.4.0 | `bun.lock`, `bun run …` |
| Oberfläche | React 19.3.0 | `package.json` |
| Bündelung | Vite 8.3.4 + `@vitejs/plugin-react` 6.1.2 | `vite.config.ts` |
| Typecheck | TypeScript 7 (`@typescript/native-preview`, `tsgo`) | `bun run typecheck` |
| Hintergrund | three 0.186.1 | `src/lib/Universe.tsx` |
| Tests | `bun test` + `react-dom/server` | `tests/channels-island.test.tsx` |

## 5. Starten

```powershell
cd C:\Users\Chang\prometheus-harness\apps\web
bun install            # nur beim ersten Mal
bun run dev            # Dev-Server mit HMR
```

**Aufruf: <http://127.0.0.1:5175/>** — Port und Adresse sind fest eingestellt
(`strictPort`, `host: '127.0.0.1'`). Der Port ist mit Absicht nicht 5173 (auf diesem Rechner
belegt) und nicht 5174 (dort läuft die Referenz-Vorlage, siehe
[webui-dev.md](webui-dev.md) — sie bleibt unangetastet).

| Befehl | Wirkung |
|---|---|
| `bun run dev` | Dev-Server, HMR, Port 5175 |
| `bun run typecheck` | TypeScript 7 prüft, schreibt nichts |
| `bun test` | Struktur-Abnahme der Insel (7 Prüfungen) |
| `bun run build` | Produktionsbuild nach `dist/` |

## 6. Prüfnachweise vom 12.10.2026

Geprüft wird **textuell** — HTTP-Status, DOM-Inhalt, berechnete Stile, Zustandsfolgen. Bilder
werden als Nachweis bewusst nicht verwendet: ein Screenshot ist nicht auswertbar, wenn kein
Modell ihn lesen kann, und ein weißer Screenshot sah zuvor fälschlich nach „Seite kaputt" aus,
obwohl nur die GPU-Komposition des Testbrowsers leer blieb. Zahlen lügen nicht.

| Prüfung | Werkzeug | Ergebnis |
|---|---|---|
| Typecheck | `bun run typecheck` (`tsgo --noEmit`) | **0 Fehler** |
| Struktur der Insel | `bun test` | **7 pass, 0 fail**, 27 Zusicherungen |
| Seite lädt | Playwright + Chromium, `http://127.0.0.1:5175/` | HTTP 200, alle 21 Modul-Anfragen 200, **kein Seitenfehler** |
| Insel im DOM | derselbe Lauf | `.isl.max`, Kopf `◆ CHANNELS · projekt: prometheus · ✕`, Gruppen `# channels`, `⌥ branches`, `◉ tools`, 9 Einträge mit Sigil, Marken `live`/`7d`/`neu`, genau ein `.on` mit `aria-current` |
| Insel lesbar | berechnete Stile im Browser | Einträge `rgb(255,179,92)`, Marken `rgb(107,163,255)`, Fläche `rgba(10,10,10,0.933)` |
| Seite dunkel | berechnete Stile im Browser | `body` `rgb(5,5,7)`, Schrift JetBrains Mono — Tokens `--bg`, `--text-2`, `--accent-2` vorhanden (vorher leer, siehe §8) |
| Hintergrund | WebGL-Puffer ausgelesen | 0,592 % der Bildpunkte hell, hellster Punkt 539/765 → Kern und Sterne werden wirklich gezeichnet |
| **Funktion der Insel** | 7 Zustandsfolgen im Browser (siehe unten) | **alle 7 korrekt** |
| Konsolenmeldungen | derselbe Lauf | **keine** Warnung, **kein** Fehler der Anwendung; keine Antwort ≥ 400 |

**Die sieben Zustandsfolgen der Insel** (Chromium, 1280 × 800):

| Schritt | Aktion | Gemessen |
|---|---|---|
| 1 | Start | `.isl` (230 × 40), Pille mit `PROMETHEUS #main · ornith-9b`, keine CHANNELS-Fläche |
| 2 | Klick auf die Pille | `.isl.max` (560 × 280), `.full` mit 9 Einträgen, aktiv `# main live` |
| 3 | Kanal `trading-ideen` wählen | klappt ein; Pille zeigt `PROMETHEUS #trading-ideen · ornith-9b` |
| 4 | Pille erneut anklicken | `.isl.max`; aktiv ist jetzt `# trading-ideen` |
| 5 | ✕ | klappt ein, Pille unverändert `#trading-ideen` |
| 6 | Pille per **Enter** | klappt auf (Tastaturweg der Pille) |
| 7 | **Escape** | klappt ein |

Textartefakte dieses Nachweises liegen in [verify/](verify/): die vier Hash-Listen beider
Vorlagen (vorher/nachher, siehe §9). Die Prüfskripte selbst liegen nicht im Projekt, sondern
im Werkzeugverzeichnis; die Befehle stehen in §5 und oben.

## 7. Bewusste Abweichungen von der Vorlage

| Punkt | Vorlage | Bei uns | Grund |
|---|---|---|---|
| Einträge | `<a>` **ohne** `href`, nur `onclick` | `<button type="button">` mit `aria-current` | Klickbares ohne Rolle und ohne Tastaturweg ist im Browser nicht bedienbar; Befund „Barrierefreiheit" in [../design/ui-keep-cut.md](../design/ui-keep-cut.md#b-was-wir-ersetzen-oder-neu-bauen) |
| Inhalte | neun Einträge fest im Markup | Daten aus `island-data.ts` | soll später aus dem Harness kommen statt aus dem Quelltext |
| Klassennamen | `.h`, `.b`, `.svelte-1n46o8q` | `.sigil`, `.badge`, ohne Svelte-Scope-Hash | React kennt keine Scope-Klassen; ein `<button>` verträgt kein Präfix-Span mehr |
| Inselform | Pille ⇄ Fläche (`islandOpen`) | **nachgebaut**: Pille ⇄ Fläche mit den Übergängen der Vorlage | die Funktion war der Auftrag, nicht nur die Form |
| ✕-Knopf | schließt die Insel | **nachgebaut**: ✕ und Escape klappen ein | — |
| Zustandstext | Vorlage liest ihn per `textContent` aus dem geklickten Element (`pickChannel`) | kommt als Eigenschaft `summary` von außen | dasselbe Ergebnis (`#trading-ideen · ornith-9b`) ohne DOM-Zugriff auf ein fremdes Element |
| Tastatur und Fokus | Pille ohne Tastaturweg; nach dem Aufklappen lag der Fokus im Nichts | Pille mit `role="button"`/`aria-expanded`, Escape am Dokument, Fokus wandert mit | Schritt 7 des Verhaltenstests fiel zuerst durch, weil der Tastendruck `<body>` erreichte statt die Insel |
| Kerngröße | `st.activity` sinkt in jedem Bild, steigt nie → Kern praktisch konstant | ruhiger Grundpuls mit langsamem Atmen | das „activity"-Signal der Vorlage war mikrofongebunden; ohne Mikrofon wäre es wirkungslos |
| Zeitmessung | `THREE.Clock` | `performance.now()` | `THREE.Clock` ist in three 0.186 als veraltet markiert und meldete sich in der Konsole |
| React-Mount | — (Svelte) | ohne `<StrictMode>` | der Doppel-Mount im Dev-Modus würde den WebGL-Kontext sofort wieder verwerfen |
| Favicon | keine Angabe | eigenes `public/favicon.svg` | ohne es fragt der Browser `/favicon.ico` an → 404 in der Konsole |

## 8. Der Fehler, der die Seite leer aussehen ließ

**Beobachtung.** Im Browser war die Seite weiß und die Insel ein dunkler Kasten mit schwarzer
Schrift; Screenshot-Auswertung: alle 1.024.000 Bildpunkte `255,255,255`, Token-Abfrage im
Browser `--bg`, `--text-2`, `--accent-2` **leer**, Body-Schrift `Times New Roman`.

**Ursache.** Es lagen zwei CSS-Dateien vor, deren Namen sich nur in der Schreibweise
unterscheiden: `src/app.css` (Tokens, Basis) und `src/App.css` (`.stage`). Unter Windows ist
das **dieselbe** Datei — der zweite Schreibvorgang überschrieb den ersten. Übrig blieb eine
Datei mit der Regel `.stage`; Tokens und Basisstile fehlten, deshalb weißer Grund und
schwarze Schrift auf dunkler Inselfläche.

**Behebung.** Eine einzige Datei `src/app.css` trägt Tokens, Reset, Basis und `.stage`;
`App.tsx` importiert kein eigenes CSS mehr. Danach: Body `rgb(5,5,7)`, Tokens vorhanden,
Einträge `rgb(255,179,92)`.

**Lehre für den Rest des Projekts:** Zwei Dateien, die sich nur in Groß- und Kleinschreibung
unterscheiden, sind unter Windows eine Datei. Auf Linux und in CI sind es zwei — derselbe
Stand verhält sich also je nach System verschieden. Namen müssen sich deutlicher
unterscheiden.

## 9. Vorlagen unverändert — Nachweis

| Vorlage | Umfang | Vergleich | Ergebnis |
|---|---|---|---|
| `H:\Projekt\Programmieren\Prometheus\webui` | 22 Dateien (ohne `node_modules/`) | SHA-256, Länge, Änderungszeit vorher/nachher | **identisch** |
| `C:\Users\Chang\harness\prometheus-harness` | 27.093 Dateien (ohne `node_modules/`, `.git/`) | ebenso | **identisch** |

Belege: [verify/webui-template-before.txt](verify/webui-template-before.txt) ·
[verify/webui-template-after.txt](verify/webui-template-after.txt) ·
[verify/core-template-before.txt](verify/core-template-before.txt) ·
[verify/core-template-after.txt](verify/core-template-after.txt).
Es wurde nichts im Vorlagen-Verzeichnis angelegt, geändert oder gelöscht; die Vorlage-WebUI
auf Port 5174 lief während der Arbeit weiter.

## 10. Offen

1. **Die Insel als eigene Unit.** Im Moment liegt sie in `apps/web/src/lib`. Nach der
   Vorlage gehören UI-Bausteine nach `packages/client/ui-*` — für uns also
   `packages/client/ui-island` mit eigenem `package.json`, `README.md`, `src/` und `tests/`,
   das `apps/web` als Hülle einbindet. Das Namensskelett `packages/client` existiert.
2. **Ein Host, der `dist/` ausliefert.** In der Vorlage ist das `apps/cli` (TypeScript,
   `dsh web`) — **nicht** Go. Go ist laut [../stack.md](../stack.md)
   Gateway/Scheduler/Supervisor und kommt mit dem Dienst darunter.
3. **Rust** ist dort Sandbox und schwere Werkzeuge. Für eine Oberfläche aus Insel und
   Hintergrund gibt es dafür keine Aufgabe; der erste Rust-Baustein gehört zum
   Sandbox-Unit.
4. **`website/`** bleibt die Dokumentationsseite (VitePress), wie in der Vorlage.
