# Bestands-Checkup — Skills und Plugins, gemessen am 21.10.2026

> **Warum dieses Blatt existiert.** Der Betreiber hat einen Bestands-Checkup verlangt:
> *„inklusive Bestand-Checkup-Liste Skill & Plugin"*. Bis heute gab es dafür nur verstreute
> Zahlen — `plugin-inventur.md` zählt den **Host**, `skill-uebertragung.md` zählt die
> **Implementierung**, dieser Blatt zählt den **Bestand**: was ist da, was ist leer, was liegt
> außerhalb des Repos, und wo widerspricht sich die Doku.
>
> **Die Regel, die dieses Blatt von einer Wunschliste trennt:** jeder Wert trägt seinen Beleg.
> Was ich nicht gemessen habe, steht unter „Grenzen" und nicht im Befund.

---

## 0. Die vier Schichten des Bestands

Ein „Plugin" ist bei Prometheus nicht eine Sache. Der Bestand liegt in **vier** Schichten, und wer
sie vermischt, zählt doppelt:

| Schicht | Ort | Was dort liegt | Gemessen |
|---|---|---|---|
| **A — Kern** | `node_modules/@deepseek-ai/` | 265 Pakete des DeepSeek Harness, alle `0.2.1-alpha.2` | 265 Einträge |
| **B — eigene Plugins** | `packages/plugin/*` | 8 Client-Plugins mit eigenem Panel und eigenen Routen | 8 Pakete, 116 Dateien |
| **C — Fähigkeiten (Skills)** | `C:\Users\Chang\.agents\skills` (Benutzer-Scope) | 23 Fähigkeiten, wirksam in dieser Sitzung | 23 Verzeichnisse |
| **D — MCP-Server** | Host-Konfiguration | `graphify`, `rea`, `research` (SearXNG→Firecrawl), `obsidian` | 4 Server |

**Dazu die Steckplätze:** `packages/*/*` sind **401** Paketordner, davon **82 mit Dateien** und
**319 leer**. Die leeren sind nach `MAPPING.md` Absicht (geplante Units), nicht Versehen — das ist
eine **Deutung**, keine Messung, und steht so auch in `ziel-liste-ist-und-plan.md` §3.

---

## 1. Skills — der Bestand, den diese Sitzung wirklich lädt

**Der Befund, der zuerst überrascht:** die Skill-Wurzel **im Repository** (`.agents/skills/`) hat
**19 Ordner, davon 15 leer**. Nur drei tragen Inhalt:

| Ordner im Repo | Dateien | Zustand |
|---|---:|---|
| `design-taste-frontend` | 41 | vollständig, mit `library/`, `evals/`, `scripts/`, `PMH.md` |
| `reverse-api` | 14 | vollständig, mit `references/` und `scripts/` |
| `browser-local` | 1 | nur `SKILL.md` |
| **15 weitere** | **0** | **leer** (`agent-experience`, `dsh-*`, `record-browser-gif`) |

**Die 23 Fähigkeiten, die diese Sitzung tatsächlich sieht**, liegen im **Benutzer-Scope**
(`C:\Users\Chang\.agents\skills`, Rang 400 der Registry). Sie sind **nicht** im Repository
versioniert. Das ist der wichtigste Bestandsbefund dieses Blattes — er ist unter §5 als Lücke
geführt, nicht als Fehler beschönigt.

### 1.1 Die 23 wirksamen Fähigkeiten, nach Aufgabe

| # | Fähigkeit | Aufgabe | Fremd/Eigen |
|---|---|---|---|
| 1 | `code-review` | CodeRabbit-Review, PR-Threads, Fix-Prompts | fremd |
| 2 | `autofix` | Review-Threads einzeln anwenden, mit Freigabe je Änderung | fremd |
| 3 | `open-code-review` | `ocr`-CLI von alibaba, Review auf Diffs | fremd |
| 4 | `open-code-review-delegate` | OCR nur für Auswahl/Regeln, Urteil beim Host-Agenten | fremd |
| 5 | `security-audit` | Sicherheitsprüfung von Code, APIs, Diensten | fremd |
| 6 | `reverse-api` | API-Verhalten aus Artefakten rekonstruieren, typisierter Client | eigen |
| 7 | `reverse-engineer-anything` | REA für native, managed, Electron-, Firmware-Ziele | fremd |
| 8 | `browser-local` | echter Chromium über CDP, inkl. angemeldeter Seiten | eigen |
| 9 | `playwright-cli` | Browser-Tests und Playwright-Automatisierung | fremd |
| 10 | `design-taste-frontend` | Art Direction für Web-Oberflächen, Look-and-fix-Schleife | eigen (Bibliothek) |
| 11 | `high-end-visual-design` | Typografie, Abstände, Schatten, Animation einer Agentur | fremd |
| 12 | `emil-design-eng` | Feinschliff von Komponenten und Bewegung | fremd |
| 13 | `redesign-existing-projects` | bestehende Oberflächen aufwerten, ohne Funktion zu brechen | fremd |
| 14 | `web-design-guidelines` | Prüfung gegen die Web Interface Guidelines | fremd |
| 15 | `figma-use` | Pflicht-Vorbedingung für jeden `use_figma`-Aufruf | fremd |
| 16 | `codebase-memory` | Graphify-Graph **und** Obsidian-Vault als Gedächtnis | eigen |
| 17 | `find-skills` | Fähigkeiten finden und installieren | fremd |
| 18 | `hf-cli` | Hugging-Face-Hub: Modelle, Datensätze, Jobs | fremd |
| 19 | `typesafe-ai` | typisierte KI-Urteile als Programmierbaustein | fremd |
| 20 | `ponytail` | erzwingt die faule, kleinste Lösung | eigen (Plugin-Paar) |
| 21 | `ponytail-audit` | Überbau im ganzen Repo aufspüren | eigen |
| 22 | `ponytail-debt` | `ponytail:`-Kommentare in ein Schuldenregister ziehen | eigen |
| 23 | `ponytail-gain` / `-help` / `-review` | Wirkungsanzeige, Übersicht, Überbau-Review | eigen |

**Verteilung:** 16 fremd, 7 eigen. Die drei eigenständigen Blöcke sind Design
(`design-taste-frontend`), Reverse-Engineering (`reverse-api`, `browser-local`) und
Überbau-Abwehr (`ponytail`).

### 1.2 Was die 23 Fähigkeiten **nicht** abdecken

Gemessen an den Ordnern, nicht an Wünschen:

| Fehlt | Beleg |
|---|---|
| **Diagramme** | kein Ordner mit „diagram", „mermaid", „svg-chart" |
| **Video, Schnitt, Shorts/Reels** | kein Ordner mit „video", „ffmpeg", „cut" |
| **Skill-Evals** (Prüfen, ob eine Fähigkeit wirkt) | kein Ordner mit „eval", „grade" |
| **Wissensmanagement** außerhalb Obsidian/Graphify | `codebase-memory` deckt nur diese beiden |
| **Übersetzung, Doku-Pflege** | die 15 leeren `dsh-*`-Ordner im Repo waren dafür gedacht |

---

## 2. Plugins — der Bestand mit Panel und Route

Acht eigene Client-Plugins, alle unter `packages/plugin/`:

| Plugin | Dateien | Was es im Host tut | Route |
|---|---:|---|---|
| `accounts` | 9 | Benutzerliste, Einladungen mit Ablauf | `/api/pmh/auth/benutzer`, `/einladungen` |
| `crew` | 15 | Crews, Rollen, Vorgabe und Projekt; Adapter, Werkzeuge, Buchung | `/api/pmh/crew` |
| `graphify` | 9 | Graph-Panel mit Knoten, Hubs und Lauf | `/api/world/graphify` |
| `obsidian` | 9 | Vault-Panel mit Suche und Notizvorschau | `/api/world/obsidian` |
| `ponytail` | 13 | Prompt-Abschnitt, Skill und Schalter im Composer (aus/lite/full/ultra) | — |
| `rich-ui` | 20 | `render_ui`-Werkzeug: Karte, Diagramm, Tabelle, Bild, Notiz | — |
| `usage` | 21 | Guthaben, Verbrauch, Bildkostenschätzung | `/api/pmh/usage/status`, `/schaetzung` |
| `zugaenge` | 20 | Schlüsselverwalter über der Credential-Naht, aktive Sonde | — |

**Zusammen 116 Dateien.** Alle acht sind gewöhnliche Prometheus-Pakete mit eigenem Panel — die
Bauform, die das Projekt „Unit" nennt.

### 2.1 Der Kern daneben — was **nicht** von uns ist

Aus `plugin-inventur.md` (gemessen 14.10.2026 am laufenden Host, Port 3097):

| Größe | Wert |
|---|---|
| Einträge im Host-Loader | **191** |
| davon `enabled` und `active` | **163** (= deckungsgleich) |
| davon `failed` | **0** |
| Agent-Presets | **4** (`standard` ist Vorgabe) |

**Die Falle, die dort schon zugeschlagen hat:** ein `enabled=false` im Host-Loader heißt **nicht**
„fehlt". Zwölf Werkzeuge (`pwsh`, `fs`, `jobs`, `todo`, `skill`, `web`, `subagent`, …) stehen
hostweit auf `false` und in der Preset-Zeile auf `true`. Wer nur die 191 liest, schreibt einen
falschen Lückenbericht.

### 2.2 Eigene Pakete, die **kein** Client-Plugin sind

| Paket | Dateien | Rolle |
|---|---:|---|
| `packages/skill/skill` | 4 | geschichtete Registry (Anbieter, Ränge, Scope) |
| `packages/skill/skill-filesystem` | 6 | lokaler Anbieter, Frontmatter, Git-Wurzel |
| `packages/skill/tool-skill` | 4 | Werkzeug `skill`, Katalogtext, Digest |
| `packages/skill/skill-plugin` | 4 | Brücke in den Host, meldet Anbieter an `ctx.skills` |
| `packages/units/unit-export` | 19 | Plugin-Export mit Digest-Rundlauf |
| `packages/units/unit-system` | 22 | Unit-System |

**Zwei Steckplätze sind gebaut und leer:** `packages/skill/skill-office` (0 Dateien) und
`packages/skill/tool-workspace-dependencies` (0 Dateien). Sie stehen in `skill-uebertragung.md` §5
ausdrücklich als **nicht gebaut**.

---

## 3. MCP-Server — die Schicht, die keine Unit ist

| Server | Werkzeuge | Anbindung |
|---|---|---|
| `graphify` | Graphabfrage, Nachbarn, kürzester Pfad, Hubs, PR-Auswirkung | lokal, `graphify-out/graph.json` |
| `rea` | Reverse-Engineering über Ghidra, Rizin, Frida, CDP, ADB | lokal, viele Provider |
| `research` | Suche (SearXNG → Firecrawl), Abruf | lokal, Container |
| `obsidian` | Vault-Suche, Notiz lesen/schreiben | lokal, `D:\Windows\Dokumente\Obsidian Vault` |

**Der Unterschied, auf den es ankommt:** ein geladener MCP-Server ist **Konfiguration**, kein
gebautes Unit. Fällt die Sitzung, ist er weg. Genau diesen Satz führt
`ziel-liste-ist-und-plan.md` §2.1 für den Browser.

---

## 4. Die Lücken — gemessen, nicht vermutet

| # | Lücke | Beleg | Gewicht |
|---|---|---|---|
| **L1** | **Die wirksamen Skills liegen außerhalb des Repos.** 23 Fähigkeiten im Benutzer-Scope, 3 im Repo. Ein frischer Klon hat sie nicht. | §1 | **hoch** |
| **L2** | **319 leere Paketordner.** 401 gesamt, 82 mit Dateien. | `packages/*/*` gezählt | mittel |
| **L3** | **`packages/browser-use/browser-use` ist leer** (0 Dateien). Browser läuft nur als MCP-Konfiguration. | Ordner geprüft | mittel |
| **L4** | **Kein Diagramm-Skill.** | §1.2 | mittel |
| **L5** | **Keine Video-/Schnitt-Fähigkeit.** Nur `image_generate`. | §1.2 | mittel |
| **L6** | **Keine Skill-Evals.** 23 Fähigkeiten, kein Prüfverfahren, das ihre Wirkung mißt. | §1.2 | **hoch** |
| **L7** | **`skill-office` und `tool-workspace-dependencies` sind leere Steckplätze.** | §2.2 | niedrig |
| **L8** | **`roadmap.md` sagt „Noch kein eigener Code".** Das ist seit Monaten falsch und steht als Punkt 0.1 in `ziel-liste-ist-und-plan.md`. | Datei gelesen | niedrig, aber peinlich |

---

## 5. Widersprüche im Bestand

Ein Checkup, der nur zählt, übersieht die Stellen, an denen zwei Dokumente verschiedene Wahrheiten
führen. Drei gefunden:

| Widerspruch | Wo | Auflösung |
|---|---|---|
| „362 Paketordner, 40 mit Dateien, 322 leer" gegen „401 / 82 / 319" | `ziel-liste-ist-und-plan.md` §3 (15.10.) gegen diese Messung (21.10.) | **kein Widerspruch, Wachstum** — 39 Ordner mit Inhalt sind dazugekommen. Die ältere Zahl bleibt als Zeitpunkt stehen. |
| „`apps/universe` hat 30 Dateien in `src`, 24 Tests" gegen „41 / 33" | ebd. | dito: gewachsen. |
| „`.agents/skills` enthält die 21 Fähigkeiten dieser Sitzung" | `skill-uebertragung.md` §5 | **falsch für den Repo-Ort**: dort liegen 3. Die 23 liegen im Benutzer-Scope. Die Aussage meinte den *geladenen* Katalog, nicht den Repo-Pfad — genau diese Unschärfe ist L1. |

**Die Lehre, die schon im Projekt steht und hier wieder gilt:** eine Zahl ohne Datum ist keine
Zahl. Jede Zeile dieses Blattes nennt deshalb den 21.10.2026.

---

## 6. Wie man diesen Checkup wiederholt

```powershell
# Schicht B — eigene Plugins und ihre Größe
Get-ChildItem packages\plugin -Directory | ForEach-Object {
  $n = (Get-ChildItem $_.FullName -Recurse -File | Where-Object { $_.FullName -notmatch 'node_modules' }).Count
  "{0,-12} {1}" -f $_.Name, $n }

# Steckplätze — leer gegen belegt
$leaf = Get-ChildItem packages -Directory | ForEach-Object { Get-ChildItem $_.FullName -Directory }
$leer = $leaf | Where-Object { (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue).Count -eq 0 }
"gesamt {0}, leer {1}" -f $leaf.Count, $leer.Count

# Schicht C — die wirksamen Fähigkeiten (Benutzer-Scope)
(Get-ChildItem "$env:USERPROFILE\.agents\skills" -Directory).Count

# Schicht A — der Kern, laufend (nicht nur installiert)
bun docs/status/messsonden/plugin-inventur.mjs 3097
```

---

## 7. Grenzen dieses Blattes

- **Die 23 Fähigkeiten sind nach ihrem Frontmatter gezählt**, nicht nach Ladeprüfung. Ob alle 23 in
  dieser Sitzung wirklich im Katalog stehen, belegt der Katalog-Digest des Hosts, nicht diese Liste.
- **Die Plugin-Zahlen sind Dateizahlen**, keine Zeilenzahlen und keine Testzahlen. Ein Paket mit
  neun Dateien kann ungetestet sein.
- **Die vier MCP-Server sind aus der laufenden Sitzung abgelesen**, nicht aus einer Konfigurationsdatei
  gegengeprüft. Wer den Bestand fortschreiben will, prüft `cordis.patch.yml`.
- **Nicht geprüft:** ob die 319 leeren Ordner tatsächlich alle gewollt sind. `MAPPING.md` behauptet
  es; nachgezählt hat es niemand.
