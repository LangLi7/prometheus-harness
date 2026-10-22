# @prometheus-harness/graphify

Graphify als **eigenes DSH-Plugin**: ein Sidebar-Eintrag **Graphify**, ein main-Panel mit **gezeichnetem Graphen**, Knotenliste, größten Hubs, Nachbarschaft und einem Lauf-Button. Die Host-Routen kommen aus `@prometheus-harness/world-graphify`.

## Was das Panel zeigt

- CLI-Status, Graph-Datei, **Knoten**, **Kanten**, **Gruppen**
- **Drei Ebenen**, umschaltbar in der Werkzeugleiste:
  - **Gesamt** — eine Stichprobe über die 16 größten Gruppen (der ganze Graph als Karte); je Gruppe wächst die Auswahl vom wichtigsten Knoten aus, damit farbige Inseln entstehen
  - **Gruppe** — alle Knoten einer Gruppe (die des gewählten Knotens, sonst die größte)
  - **Nachbarschaft** — die Umgebung eines Knotens, Tiefe 1–3
- **Gezeichneter Ausschnitt** (Canvas): Kräfte-Layout des jeweils gezeigten Ausschnitts
  - Ziehen mit der Maus, **Mausrad** zoomt um den Zeiger, Hintergrund ziehen verschiebt, `⤢` paßt ein
  - **Höchstzahl** der Knoten ist einstellbar; der Rest wird sichtbar als „gekürzt" gemeldet
  - **Farbe nach Gruppe oder Art**, Namen an den Knoten, **Bewegung** (Layout rechnet beim Anfassen weiter)
  - **Anordnen** startet dasselbe Netz neu; Klick auf einen Knoten wählt ihn
  - **Legende** unten links: in der Gesamtkarte öffnet ein Klick die Gruppe, sonst springt er zu ihrem wichtigsten Knoten
- Suche über Name, Art und Pfad
- Die **größten Hubs** (Grad im Graphen) als Schnellauswahl
- Knoten-Detail: Art, Pfad, Gruppe, Nachbarschaft (anklickbar), Verbindungszahl
- **Datei öffnen**: Code-Viewer mit Zeilennummern, Sprach-Kennung (`TYPESCRIPT`, `JSON`, …) und Syntaxfarben für Kommentare, Zeichenketten, Zahlen und Schlüsselwörter
- **Bearbeiten**: Quelldatei im Textarea ändern, **Speichern** (`Strg+S`) oder **Schließen ohne Speichern**; der Graph bleibt bis zum nächsten Lauf unverändert. Ungespeicherte Änderungen lösen beim Schließen/Wechseln eine Rückfrage aus.
- **Graph erzeugen** startet `POST /api/world/graphify/run` mit `{ mode: "update" }`; die Ausgabe erscheint im Panel
- Leerzustand mit dem Befehl `graphify extract . --code-only`

## Einstellungen (Plugin-Einstellungen → Graphify)

| Feld | Werte | Vorgabe | Wirkung |
|---|---|---|---|
| `surface` | `sidebar` · `plugins` · `both` · `none` | `sidebar` | wo das Plugin erscheint |
| `order` | Zahl | `12` | Platz in der Leiste bzw. Liste |
| `label` | Text | leer | eigene Beschriftung |
| `view` | `split` · `graph` · `list` | `split` | welche Flächen aufgehen: Liste + Graph + Daten, nur Graph + Daten, nur Liste + Daten |
| `level` | `gesamt` · `gruppe` · `nachbarschaft` | `gesamt` | die Ebene beim Öffnen |
| `depth` | `1`–`3` | `2` | Schritte der Nachbarschaft |
| `limit` | `20`–`400` | `160` | Höchstzahl gezeichneter Knoten |
| `labels` | `true`/`false` | `true` | Namen an den Knoten |
| `colour` | `community` · `kind` | `community` | Farbe nach Gruppe oder Art |
| `motion` | `true`/`false` | `true` | Layout beim Öffnen und Ziehen weiterrechnen |
| `inspector` | `right` · `below` · `off` | `right` | wohin die Knotendaten kommen |

Die Einstellungen gelten sofort für ein offenes Panel. Die **Host-Hälfte** hält das Schema; ein neues Feld erscheint in den Einstellungen erst nach einem Neustart des Hosts, das Panel selbst arbeitet bis dahin mit den Vorgaben.

## Grenzen

- **Gesamt** ist eine **Stichprobe** (16 Gruppen, Standard 160 Knoten), nicht der ganze Graph: 36 000 Knoten sind kein Bild. Suche und Hubs führen durch den Rest, die Grenze steht im Panel.
- **Gruppe** zeigt höchstens `limit` Knoten der Gruppe, nach Grad; die übrigen bleiben über Suche und Nachbarschaft erreichbar.
- Das Layout rechnet im Browser (eigener Feder-Kern, keine `d3`-Abhängigkeit); bei 400 Knoten ist es noch flüssig, darüber wird gekürzt.
- Die Datei-Route liest weiterhin den ganzen Graphen je Anfrage (21 MB lokal in ~0.5 s); das Panel merkt sich den gelesenen Graphen bis „Neu lesen".

## Installation bringt Graphify mit

Das Plugin prüft beim Start, ob die CLI erreichbar ist — unter `command`, in
`PATH` und an den bekannten `uv`-Orten (`%APPDATA%\uv\tools\graphifyy\…`,
`~/.local/bin`, `~/.local/share/uv/tools/graphifyy/bin`). Fehlt sie und steht
`setup` auf `auto` (Vorgabe), installiert der Provider sie **einmal** im
Hintergrund:

| Reihenfolge | erkannt an | Befehl |
|---|---|---|
| 1 | `uv` | `uv tool install graphifyy` |
| 2 | `pipx` | `pipx install graphifyy` |
| 3 | `python`/`python3`/`py` | `python -m pip install --user graphifyy` |

Nach Erfolg wird der gefundene Pfad als `command` gespeichert, damit die CLI
auch ohne neuen `PATH` gefunden wird. Fehlt jeder Paketmanager, passiert
**nichts** Automatisches: das Panel zeigt die Hinweise für das jeweilige System.

Im Panel steht bei fehlender CLI ein Kasten mit **Weg**, **Jetzt installieren**
und der Ausgabe des Versuchs; dort läßt sich „Beim Start automatisch
installieren" abwählen (`auto` → `ask`). Ganz abschalten:

```json
// $DSH_HOME/world/graphify.json
{ "command": "graphify", "outDir": "graphify-out", "root": ".", "setup": "never" }
```

**Grenzen.** Installiert wird nur das PyPI-Paket `graphifyy`. Der MCP-Server
(`graphify-mcp` und das Python-Paket `mcp`) bleibt ein eigener Profil-Eintrag —
siehe unten. Kein `curl | sh`, kein `sudo`, kein Herunterladen eines Installers;
eine Installation bricht nach fünf Minuten ab.

## Installieren

```powershell
bun run packages/plugin/graphify/build.mjs
```

Dann im Plugin-Manager `C:\Users\Chang\prometheus-harness\packages\plugin\graphify` installieren. Das Paket ist **Bündel und Plugin zugleich** (`dsh.bundle.patch` + `dsh.client`).

## MCP — autonom für den Agenten

`graphify-mcp.exe` (aus `graphifyy`) stellt den Graphen über MCP bereit. Im Profil
steht dafür eine Zeile **außerhalb** des von `profile-patch.mjs` verwalteten Blocks:

```yaml
- insert:
    - id: graphify-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: graphify
        transport: stdio
        command: 'C:\Users\Chang\.local\bin\graphify-mcp.exe'
        args: ['--graph', 'C:\Users\Chang\prometheus-harness\graphify-out\graph.json']
        env: {}
        cwd: 'C:\Users\Chang\prometheus-harness'
```

Voraussetzungen: `@deepseek-ai/dsh-mcp-client` im Profil installiert und im
Graphify-Tool-Environment das Python-Paket `mcp`:

```powershell
uv pip install mcp --python "$env:APPDATA\uv\tools\graphifyy\Scripts\python.exe"
```

Der Client meldet die Werkzeuge als `mcp__graphify__query_graph`,
`get_node`, `get_neighbors`, `shortest_path`, `god_nodes`, `graph_stats`, …
Ein **neuer Host-Start** lädt den Client; danach genügt eine neue Sitzung.

## Graph erzeugen

Der Provider läuft **immer mit `--code-only`**: der Code-Graph entsteht lokal per AST, ohne API-Schlüssel. Dokumente, Bilder und Paper brauchen einen LLM-Schlüssel (Gemini, Kimi, Claude, OpenAI, DeepSeek) und sind ein eigener, bezahlter Schritt.

```powershell
graphify extract . --code-only --out .
```

Ergebnis: `graphify-out/graph.json`.

## Routen

| Weg | Methode | Antwort |
|---|---|---|
| `/api/world/graphify/status` | GET | CLI, Ausgabeordner, Knoten/Kanten |
| `/api/world/graphify/graph` | GET | `WorldGraph` aus `graph.json` |
| `/api/world/graphify/run` | POST | Lauf `{ mode: "deep" \| "update" }` |
| `/api/world/graphify/config` | GET/POST | `{ command, outDir, root, setup }` |
| `/api/world/graphify/setup` | GET | CLI, uv, pipx, Python, gewählter Weg, letzter Versuch |
| `/api/world/graphify/setup` | POST | Installation `{ method: "uv" \| "pipx" \| "pip" }` |
| `/api/world/graphify/file?path=…` | GET | `{ path, content, language, lines }` einer Textdatei |
| `/api/world/graphify/file` | POST | `{ path, content }` speichern |

Alle Routen sind **local-only**; `/run` und `/setup` starten Prozesse, `/config` schreibt — jeweils erst nach der Loopback-Prüfung.

## Gemessen

- Graphify **0.9.92** (`~/.local/bin/graphify.exe`)
- Voller Lauf über das Repo (21.10.2026): **36 942 Knoten, 63 072 Kanten**, 1 715 Gruppen
- `/api/world/graphify/graph`: **21.6 MB in ~0.5 s** (lokal, ohne Zwischenspeicher)
- Gezeichneter Ausschnitt: **160 Knoten**, Umschalten von Ebene/Tiefe/Fokus je ~2 ms; Layout im Browser gerechnet
- Prüfseite (`.tmp/gf-harness`, ohne Host): **Gesamt**, **Gruppe** und **Nachbarschaft** gerendert, dazu der Einrichtungs-Kasten; **keine** Konsolenfehler; Bilder `shot-gesamt3.png`, `shot-gruppe.png`, `shot-setup.png`
- Browser (Host 3099, ältere Fassung): Sidebar **Graphify**, Panel sichtbar, **Code-Viewer mit 646 Zeilen** für `packages/ai/capabilities/src/index.ts`, **keine** Konsolenfehler
- Selbstinstallation auf diesem Rechner erkannt: `cli` gefunden, `uv` gefunden, Weg **uv**, Modus **auto** — ohne Installationslauf
- `tsgo --noEmit` exit 0; `bun test packages/plugin/graphify/tests/view.test.ts`: **26 pass**; `bun test packages/world/graphify/tests`: **33 pass**
