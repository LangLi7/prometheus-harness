# Plugin-Marketplace in Prometheus

**Stand:** 26.10.2026 · **Paket:** `@prometheus-harness/skill-marketplace` · **Kommandos:** `pmh plugin …`, `pmh skill …`, `pmh mcp …`

## 1. Die kurze Antwort

Prometheus liest das **Plugin-Marketplace-Format von Claude Code** und kann
Plugins daraus installieren. Der Befehl heißt wie dort:

```bash
pmh plugin marketplace add anthropics/claude-code
pmh plugin install frontend-design@claude-code-plugins
pmh plugin list
```

Zusätzlich gibt es den Weg für **eigenständige Skills** — ein Repository mit
`SKILL.md`, ohne Marketplace:

```bash
pmh skill install mattpocock/skills
pmh skill install ./mein-lokaler-skill
pmh skill list
```

Jede Installation läuft durch den Sicherheits-Scanner
(siehe [skillspector.md](skillspector.md)). Ein Plugin, das `DO_NOT_INSTALL`
bekommt, wird **nicht geschrieben** — außer mit `--force`.

## 2. Formate, die gelesen werden

| Format | Datei | Was daraus wird |
|---|---|---|
| Claude-Marketplace | `.claude-plugin/marketplace.json` | Katalog mit `plugins[]` und `source` |
| Claude-Plugin | `.claude-plugin/plugin.json` | Name, Version, Komponentenpfade |
| Claude-Komponenten | `skills/<name>/SKILL.md`, `commands/*.md`, `agents/*.md`, `hooks/hooks.json`, `.mcp.json`, `.lsp.json` | Skills, Commands und Agents werden zu Skills; Hooks laufen nur nach Freigabe; LSP bleibt liegen |
| Claude-MCP | `.mcp.json` / `mcpServers` im Manifest | `McpServerSpec` |
| Codex-MCP | TOML mit `[mcp_servers.<name>]` | dieselbe `McpServerSpec` |
| Eigenständige Skills | beliebiges `SKILL.md` bis Tiefe 4 | ein Skill je Verzeichnis |

**Quellen** eines Marketplace-Eintrags: relativer Pfad, `github` (`owner/repo`,
optional `ref`), `git-subdir`, `archive` (ZIP oder TAR.GZ), `url` (GitHub) —
sowie `npm` und `command`, die **abgelehnt** werden (siehe Grenzen).

## 3. Was auf die Platte kommt

Alles unter dem Harness-Home (`PMH_HOME → DSH_HOME → ~/.pmh`):

```text
<home>/
├── marketplaces/<name>/          # vollständiger Marketplace-Baum
├── plugins/<marketplace>/<name>/ # installiertes Plugin (Dateien wie geliefert)
├── skills/<skill-name>/          # materialisierte Fähigkeit, die der Host liest
└── marketplaces/state.json       # was installiert ist, woher, mit welchem Scan
```

**Warum Skills kopiert und nicht verlinkt werden.** Der Host liest Fähigkeiten
aus Verzeichnissen (`<name>/SKILL.md`). Ein zweiter Anbieter im Kern wäre eine
zweite Wahrheit; eine Kopie ist eine Datei, die man sieht, prüfen und löschen
kann. Der Preis: eine Änderung am Plugin erreicht die Kopie erst beim nächsten
`install`.

Der **Name im Katalog** kommt aus dem Frontmatter der `SKILL.md`, nicht aus dem
Verzeichnis. Das Verzeichnis trägt den Plugin-Namen nur, wenn es sich vom
Skill-Namen unterscheidet (`plugin-skill`, sonst `skill`).

## 4. Der Sicherheitslauf

Vor jedem Schreiben:

1. Quellbaum holen und entpacken (Pfade geprüft: kein `..`, keine absoluten Pfade)
2. Plugin-Bestandteile erkennen
3. `scanDirectory` über den **ganzen** Quellbaum
4. `gate(report, 'balanced')` — Vorgabe des Installers

| Politik | blockt |
|---|---|
| `balanced` (Vorgabe) | `CRITICAL` und `HIGH` aus Absichtsfamilien |
| `--strict` | jedes `CRITICAL` und `HIGH` |
| `--force` | nichts; der Bericht bleibt im Zustand sichtbar |

Nach der Installation steht das Ergebnis in `pmh plugin list`:

```text
frontend-design@claude-code-plugins   0/100 LOW ALLOW   frontend-design
impeccable@impeccable                 52/100 HIGH WARN (Empfehlung: DO_NOT_INSTALL)  impeccable
```

`ALLOW` heißt: das Gate hat nicht gewarnt. `WARN` heißt: installiert, aber mit
Befunden. `BLOCK` erscheint nur nach `--force` oder in der `strict`-Politik.
Empfehlung und Aktion sind bewusst getrennt — eine `DO_NOT_INSTALL`-Empfehlung
kann nach einer bewussten Entscheidung trotzdem installiert sein.

## 5. Commands und Agents werden Skills

Ein Claude-Plugin bringt vier Arten von Bestandteilen mit; der Harness kennt nur
Skills. Der Adapter übersetzt die zwei, die sich verlustarm übersetzen lassen:

| Claude | Wird zu | Name |
|---|---|---|
| `commands/status.md` | `SKILL.md` | `<plugin>-status` |
| `agents/reviewer.md` | `SKILL.md` | `<plugin>-agent-reviewer` |

Der Name im Frontmatter wird dabei **umgeschrieben** — der Katalog liest ihn dort,
nicht aus dem Verzeichnis. Der Rumpf bleibt unverändert; bei Agents kommt ein Satz
dazu, wann ein Subagent sinnvoll ist. `argument-hint` wird als Hinweis übernommen.

```bash
# beim Installieren (Vorgabe), abschaltbar mit --no-adapter
pmh plugin install pr-review-toolkit@claude-code-plugins

# für bereits installierte Plugins nachholen
pmh plugin adapt --all
pmh plugin adapt hookify@claude-code-plugins
```

Der Adapter läuft nach dem Sicherheitslauf: der Plugin-Bericht deckt auch die
Command- und Agent-Dateien ab. Er kann mit `--no-adapter` abgeschaltet werden.

**Hooks** sind kein Skill. Sie laufen als eigener Laufzeit-Haken
([plugin-hooks](plugin-hooks.md)) und nur für ausdrücklich freigegebene Plugins.

## 6. MCP-Server eintragen

Ein Plugin kann MCP-Server mitbringen. `pmh plugin install … --mcp` trägt sie
direkt in `profiles/<profil>/cordis.patch.yml` ein; ohne den Schalter werden sie
nur mitkopiert.

Der allgemeine Weg:

```bash
# Streamable HTTP (Figma Desktop, Mobbin)
pmh mcp add figma-desktop --url http://127.0.0.1:3845/mcp --optional
pmh mcp add mobbin --url https://api.mobbin.com/mcp --optional

# stdio (npx-Server)
pmh mcp add playwright --optional -- npx @playwright/mcp@latest
pmh mcp add codebase-memory --optional -- npx -y codebase-memory-mcp

pmh mcp list
pmh mcp remove playwright
```

Der Eintrag hat die Form, die `@deepseek-ai/dsh-mcp-client` liest:

```yaml
- insert:
    - id: pmh-mcp-figma-desktop
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        transport: streamable-http
        serverName: figma-desktop
        url: http://127.0.0.1:3845/mcp
        failOnStartupError: false
```

`--optional` setzt `failOnStartupError: false`. Das ist für Server gedacht, die
**nicht immer laufen** (Figma Desktop) oder eine Anmeldung brauchen (Mobbin):
der Host startet auch dann, wenn der Server fehlt.

Die Datei wird als YAML-Dokument bearbeitet, nicht als Text angehängt. Dadurch
bleiben Kommentare erhalten, und derselbe Servername wird beim zweiten Lauf
**ersetzt**, nicht verdoppelt.

## 7. Grenzen

- **Kein `npm` und kein `command` als Plugin-Quelle.** Die eine bräuchte einen
  Paketmanager, die andere würde beim Installieren fremden Code ausführen —
  genau das, was der Scanner verhindern soll.
- **Kein `git clone`.** GitHub-Archive über `codeload`; andere Hosts nur als
  ZIP/TAR.GZ-URL. Das spart die git-Abhängigkeit und funktioniert ohne
  Zugangsdaten.
- **LSP wird nicht ausgeführt.** Der Harness hat keinen Sprachserver-Client; die
  `.lsp.json` bleibt im Plugin-Verzeichnis und wird gemeldet, nicht gestartet.
- **Hooks laufen nur nach Freigabe.** Ein Hook ist fremder Code bei jedem
  Werkzeugaufruf. Ohne `pmh plugin hooks enable <id>` passiert nichts; Einzelheiten
  in [plugin-hooks](plugin-hooks.md).
- **Kein OAuth.** Der MCP-Client kennt statische Header, keinen OAuth-Fluss.
  Mobbin und der Figma-Remote-Server brauchen OAuth; sie lassen sich eintragen,
  aber die Autorisierung passiert nicht im Harness. Der Figma-**Desktop**-Server
  ist davon nicht betroffen — er bringt seine Anmeldung mit.
- **Kein Rollback über Versionen.** `install` ersetzt das Zielverzeichnis. Der
  Zustand merkt sich Digest und Scan, nicht jede Fassung.
- **Kein automatisches Update.** Ein erneutes `install` holt den aktuellen Stand.

## 8. Aufbau

| Datei | Aufgabe |
|---|---|
| `src/types.ts` | Marketplace, Plugin, MCP-Spec, Zustand, Optionen |
| `src/manifest.ts` | `marketplace.json`, `plugin.json`, Bestandteile, MCP-JSON/TOML |
| `src/archive.ts` | TAR.GZ und ZIP lesen, Pfade prüfen |
| `src/remote.ts` | Quellen erkennen, GitHub-Archiv holen, kopieren |
| `src/state.ts` | Zustand atomar lesen und schreiben |
| `src/install.ts` | Marketplace eintragen, Plugin/Skill installieren, Gate |
| `src/adapter.ts` | Commands und Agents in Skills übersetzen |
| `src/names.ts` | Skill-Namen normalisieren und Präfixe bilden |
| `src/mcp.ts` | `cordis.patch.yml` als YAML-Dokument bearbeiten |

Tests: `tests/marketplace.test.ts` — Manifeste, MCP-Formate, TAR/ZIP,
Installation, Gate, Präfixe, Adapter, Patch-Idempotenz.

