# REA als MCP-Plugin in DeepSeek Harness

REA lässt sich auf zwei Wegen nutzen: über die **CLI** (dieser Skill) oder als **MCP-Server**, dessen Werkzeuge als `mcp__rea__*` direkt im Modell erscheinen. Beide teilen dieselben Operationen und Evidenzverträge.

## Status dieser Installation (21.10.2026)

| Baustein | Wert |
|---|---|
| REA | `6.7.0`, global installiert (`%APPDATA%\npm\rea.cmd`) |
| MCP-Client | `@deepseek-ai/dsh-mcp-client@0.2.1-alpha.2` im Profil |
| Patch | `$DSH_HOME/cordis.patch.yml`, Eintrag `id: rea-mcp` |
| Verbindung | aktiv; Client meldet `dsh-mcp-client`, Server `rea 6.7.0`, 207 Werkzeuge |
| Skill | `reverse-engineer-anything` (Version 42) unter `~/.agents/skills` |

Damit sind Werkzeuge wie `mcp__rea__analyze_javascript_application`, `mcp__rea__inspect_web_network_capture` oder `mcp__rea__binary_session` verfügbar. Die CLI bleibt der schlankere Weg für Einzelaufgaben.

## So wird es eingetragen

`rea setup --client dsh` ergänzt `$DSH_HOME/cordis.patch.yml` (bzw. `~/.dsh/cordis.patch.yml`) um:

```yaml
- insert:
    - id: rea-mcp
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: rea
        transport: stdio
        command: C:\Program Files\nodejs\node.exe
        args:
          - C:\Users\<user>\AppData\Roaming\npm\node_modules\rea-agents\scripts\rea.mjs
          - mcp
```

Der Home-Patch gilt für jedes Profil und hat Vorrang vor dem Profil-Patch; eine per-Profil-Änderung ist nicht nötig. REA pinnt den Launcher auf die installierte Version.

## Ablauf auf einem neuen Rechner

```powershell
# 1. MCP-Client ins Profil (Version an das Profil anpassen)
npm install --prefix "$env:DSH_PROFILE_DIR" "@deepseek-ai/dsh-mcp-client@0.2.1-alpha.2"

# 2. Plan ansehen (schreibt nichts)
rea.cmd setup --client dsh --dry-run --json

# 3. Anwenden
rea.cmd setup --client dsh --yes

# 4. DSH neu starten; danach müssen mcp__rea__* Werkzeuge erscheinen
```

Dasselbe mit Prüfung: `pwsh -ExecutionPolicy Bypass -File scripts/enable-rea-mcp.ps1` (Plan) bzw. `-Apply` (anwenden). Das Skript bricht ab, solange der MCP-Client im Profil fehlt.

## Prüfen und zurücknehmen

```powershell
rea.cmd doctor --client dsh --json     # prüft den Eintrag, schreibt nichts
rea.cmd uninstall                      # entfernt Registrierung und REA-Skill
```

Nach einem REA-Update `rea.cmd setup --client dsh` erneut ausführen, damit die gepinnte Version mitwandert.

## Risiken

- Ein fehlerhafter Patch kann den Profilstart verhindern. Vorher `cordis.patch.yml` sichern; DSH legt eigene `.bak`-Dateien an, aber nicht für fremde Änderungen. Notfall: die `rea-mcp`-Insertion entfernen oder die Datei löschen.
- Der Client lädt beim Start alle 207 Werkzeuge; das kostet Kontext. Für einmalige Aufgaben bleibt die CLI günstiger.
- Analyse-Engines (Ghidra, IDA, JADX, Apktool, WABT …) sind separat; `mcp__rea__binary_session` meldet pro Operation, was fehlt. Ohne Engine funktionieren die artefaktfreien Werkzeuge (JS, .NET, HAR, SQLite, Go, Rust, PE-Ressourcen).

## Entscheidungshilfe

| Bedarf | Weg |
|---|---|
| Einmalige Analyse, wenig Kontextverbrauch | CLI (dieser Skill) |
| Wiederkehrende, dialogische Analyse mit Werkzeugaufrufen | MCP (`mcp__rea__*`) |
| Automatisierung/Skripte, CI | CLI |
