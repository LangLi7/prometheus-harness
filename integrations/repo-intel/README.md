# repo-intel — fremde Repositories verstehen

Ein Claude-kompatibles Plugin für Prometheus Harness. Es macht ein fremdes
Git-Repository auf drei Weisen lesbar: als Text-Digest, als Architekturkarte und
als Bau-Prompt.

**Was es nicht ist:** ein Ersatz für das Lesen des Codes. Die drei Dienste
liefern unterschiedlich belastbare Näherungen; nur der Digest enthält den
Quelltext selbst.

## Die drei Fähigkeiten

| Skill | Dienst | Was herauskommt | Belastbarkeit |
|---|---|---|---|
| `repo-digest` | gitingest, lokal | Textdatei: Baum + jede Datei | hoch — der Quelltext |
| `repo-map` | gitdiagram | Markdown: Überblick, Mermaid, Komponenten mit Pfaden | mittel — von einem Modell aus einer Stichprobe |
| `repo-reverse` | gitreverse | ein Absatz: wie man das nachbaut | niedrig — aus README und Dateibaum |

Die Reihenfolge ist Absicht: erst die Karte (billig), dann die Absicht, dann der
Code (teuer, aber wahr).

## Installation

```bash
bun apps/cli/src/main.ts plugin marketplace add ./integrations/repo-intel
bun apps/cli/src/main.ts plugin install repo-intel@repo-intel
```

Danach stehen die drei Skills im Katalog.

## Voraussetzungen

- **gitingest** für `repo-digest`. Einmalig einrichten:

  ```bash
  bun "$DSH_HOME/plugins/repo-intel/repo-intel/scripts/repo-intel.mjs" setup
  ```

  Das legt ein venv unter `.repo-intel/venv` an und installiert gitingest über
  `uv`. Wer `pipx` hat, kann auch `pipx install gitingest` nutzen; das Skript
  findet beides.

- **gitdiagram** für `repo-map`: keine Einrichtung, die Markdown-Fassung ist
  öffentlich. Für strukturierten Zugriff und frische Diagramme optional der
  MCP-Server:

  ```bash
  # Die `pmh`-Shim startet nur den Harness; die Kommandos liegen im Host-Einstieg.
  bun apps/cli/src/main.ts mcp add gitdiagram --url https://gitdiagram.com/mcp --profile web
  ```

- **gitreverse** für `repo-reverse`: keine Einrichtung, öffentlicher Endpunkt.

Prüfen, was fehlt:

```bash
bun "$DSH_HOME/plugins/repo-intel/repo-intel/scripts/repo-intel.mjs" check
```

`check` nennt jeden Blocker einzeln und endet mit Exit-Code 1, solange etwas
fehlt.

## Benutzung

```bash
S="$DSH_HOME/plugins/repo-intel/repo-intel/scripts/repo-intel.mjs"

# Digest: Baum plus Zusammenfassung, voller Text in .repo-intel/
bun "$S" digest expressjs/express --exclude "test/*"

# Architektur als Markdown
bun "$S" map expressjs/express

# Bau-Prompt
bun "$S" reverse expressjs/express
```

Der Digest wird **nie vollständig ausgegeben**. Das Skript schreibt ihn in eine
Datei und zeigt nur Zusammenfassung und Baum; der Agent liest gezielt nach. Das
ist die einzige Regel, die den Kontext rettet: `expressjs/express` sind ohne
Filter rund 300.000 Zeichen.

## Grenzen

- **gitingest braucht Named Pipes.** Sein Logger öffnet einen Pipe; in einer
  Sandbox, die Pipes verbietet, scheitert schon der Import. Das Skript meldet
  das als Berechtigungsgrenze und nicht als fehlendes Werkzeug — die beiden
  Fälle brauchen verschiedene Abhilfe.
- **gitdiagram und gitreverse sind fremde Dienste.** Kein SLA, Ratenbegrenzung
  möglich. `repo-reverse` schickt README und Dateibaum an einen fremden
  Server — nichts Vertrauliches damit analysieren.
- **gitdiagram-Karten können veralten.** Die Datei nennt das Datum der letzten
  Erzeugung; ohne Datum nicht verwenden.
- **Private Repositories** nur über `repo-digest` mit `GITHUB_TOKEN`. `map` und
  `reverse` kennen keinen Token.

## Lizenz

Dieses Plugin enthält keinen Code der drei Dienste. Es ruft `gitingest` als
installiertes Werkzeug auf und spricht über HTTP mit `gitdiagram.com` und
`gitreverse.com`. Die Plugin-Dateien stehen unter MIT.
