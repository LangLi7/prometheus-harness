# Projekt-Profil

Was Prometheus Harness ist, in welcher Sprache es gebaut wird und **wer** die Vorbilder sind.
Diese Datei ist der Überblick; die Begründungen stehen in den verlinkten Dokumenten.

---

## 1. Was es ist

Ein **Assistent-Agent-Harness** auf Basis des DeepSeek Harness — mit eigener Oberfläche,
eigenem Gedächtnis und der Fähigkeit, als Forscher und Automatisierer für KI-Modelle zu
arbeiten. Details: [vision.md](vision.md).

---

## 2. Sprachen und Laufzeiten

| Baustein | Sprache | Rolle | Status |
|---|---|---|---|
| **Agent-Core** | TypeScript auf **Bun** | Agent-Loop, Plugin-System, Sessions — der Kernel | Laufzeit offen bis zur Bun-Messung |
| **Typecheck** | **TypeScript 7** | prüft, führt nicht aus | entschieden |
| **Oberfläche** | TypeScript + React | Web-UI mit Docking und Zoom | entschieden |
| **Gateway, Scheduler** | **Go** | Nebenläufigkeit, Dienste starten und überwachen | **Vorschlag** — messen |
| **Sandbox, schwere Werkzeuge** | **Rust statt Python** | systemnah, speichersicher | **Vorschlag** — messen |
| kleine Systemaufrufe | C | wie im Referenz-Harness (`flock`) | Muster vorhanden |

**Warum TypeScript gesetzt ist:** Das Plugin-System (Cordis) ist JavaScript. Der Core *muss*
JS sein, sonst lassen sich keine Units laden. Die Frage ist nur die Laufzeit.

**Die Regel:** Der JS-Core bleibt der Kernel. Jede andere Sprache ist ein Dienst, den er
aufruft. Begründungen und Risiken: [stack.md](stack.md), [risks.md](risks.md).

---

## 3. Infrastruktur

| Baustein | Rolle |
|---|---|
| PostgreSQL + pgvector | strukturierte Daten **und** Vektorsuche in einem System |
| Redis | Zwischenspeicher und Nachrichten — erst bei belegtem Bedarf |
| Obsidian | Gedächtnis als Markdown; Graph View als Wissensnetz |
| Git: Forgejo / Gitea / GitLab CE | eigene Anbindung (Auswahl offen) |
| code-server / OpenVSCode / Theia | Entwicklungsumgebung im Browser |
| Tailscale **oder** WireGuard | Fernzugriff |
| Firecrawl + SearXNG | Web-Extraktion und Metasuche |
| Tesseract | OCR |
| n8n | Workflow-Automatisierung |
| Jev / Laya | Entscheidungsmodelle für begrenzte Entscheidungen |
| LangChain / LangGraph | Orchestrierung — **Kernfrage offen: welcher Loop gewinnt?** |

---

## 4. Vorbilder und Referenzen

### DeepSeek Harness — die Basis
Plugin-Seam (Cordis), Agent-Loop, Kompositionsformat. Was dort schon existiert, bauen wir
nicht doppelt: [reference-dsh.md](reference/reference-dsh.md).

### NewDawn0 — Systemaufbau und NixOS-Vorbild

**Geprüft am 12.10.2026** über alle drei Seiten seiner Repositories
([github.com/NewDawn0](https://github.com/NewDawn0?tab=repositories), 70 Repos).

> **Korrektur einer früheren Notiz:** Ich hatte „NewDawn Zeichnungen Tech nutzen mit dem
> Zoom" als *Docking-/UI-Technologie* gelesen. Das ist falsch. NewDawn0 ist ein Entwickler
> für **Systemprogrammierung und Nix** — er hat **kein** UI-, TypeScript- oder
> Docking-Projekt.

Sein Profil: „Just a guy who likes Linux and coding". Sprachen: **Nix, Rust, Go, Lua,
C/C++, Haskell, Zig, Shell** — kein TypeScript.

**Was bei ihm wirklich relevant ist:**

| Repo | Sprache | Warum für uns interessant |
|---|---|---|
| `frostedFlakes` | Nix | Ein **Wrapper-Flake für alle seine Pakete** — genau das Muster, das wir brauchen: viele Einheiten, ein gemeinsamer Einstieg |
| `sys-cfg`, `nixConfig` | Nix | Systemkonfiguration als Code, Generationen, Umschalten |
| `devShells.nix` | Nix | Tooling je Sprache und Framework |
| `nixUtils` | Nix | wiederverwendbare Hilfsfunktionen |
| `jolt` | Rust | Notiz-App, auf **Datenschutz und Leistung** ausgelegt — Vorbild für das Obsidian-Gedächtnis |
| `oiler` | Rust | lineare Algebra |
| `shredder`, `notify`, `sesh`, `note`, `logma`, `gomad` | Go | CLI-Werkzeuge — Muster für unsere Dienste |
| `rgpt` | Rust | CLI-ChatGPT-Client |
| `gpt.el` | Emacs Lisp | ChatGPT-Plugin — früher Agent-Vorbote |
| `ChadOS` | Rust | Betriebssystem von Grund auf (Maturaprojekt) |

**Die Verbindung zu unserem Projekt** ist damit nicht die Oberfläche, sondern der
**NixOS-Ansatz**, den der Betreiber von Anfang an genannt hat: Einheiten deklarieren,
Generationen, atomares Umschalten und Zurückrollen, ein Wrapper als gemeinsame Basis.

### Obsidian — Oberflächen- und Gedächtnis-Vorbild
Docking-Konzept, Graph View.

### Für die Oberfläche noch offen
Das Docking- und Zoom-Konzept braucht ein **konkretes Vorbild** — NewDawn0 liefert es nicht.
Kandidaten wären Obsidian (Docking, Graph) und IDE-artige Modelle.

### Unsere eigenen Vorlagen
Zwei Verzeichnisse sind als Vorlagen gesetzt und werden nicht verändert — Pfade und
Startanleitung: [reference-templates.md](reference/reference-templates.md) und
[webui-dev.md](reference/webui-dev.md). Für Skills gibt es zusätzlich ein übernommenes
Register-Format: [skills-index.md](reference/skills-index.md).

---

## 5. Was entschieden ist und was nicht

**Entschieden:** TypeScript als Core-Sprache · Typecheck mit TypeScript 7 · Units als
Organisationsform · Dienste starten mit der Harness · DeepSeek Harness als Basis.

**Offen:** Laufzeit (Bun oder Node) · Umfang des Cores · ob Go und Rust überhaupt kommen und
wo zuerst · welcher Loop gewinnt (eigener oder LangGraph) · ob Obsidian das Gedächtnis *ist*
oder nur eine Ansicht · welche Git-Plattform · welches Netzwerk.

Vollständig mit Abhängigkeiten: [open-questions.md](decisions/open-questions.md).
