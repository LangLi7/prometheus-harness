# @prometheus-harness/skill-marketplace

Claude-Code-kompatibler Plugin-Marketplace und Skill-Installer für Prometheus.

```bash
pmh plugin marketplace add anthropics/claude-code
pmh plugin install frontend-design@claude-code-plugins
pmh plugin adapt --all
pmh skill install mattpocock/skills
pmh skill install leonxlnx/taste-skill --prefix upstream
pmh plugin list
```

## Was gelesen wird

- `.claude-plugin/marketplace.json` und `.claude-plugin/plugin.json`
- Komponenten: `skills/`, `commands/`, `agents/`, `hooks/hooks.json`,
  `.mcp.json`, `.lsp.json`
- MCP in Claude-Form (`mcpServers`) und Codex-Form (TOML `[mcp_servers.*]`)
- Eigenständige Skills: jedes `SKILL.md` bis Tiefe 4

## Was geschrieben wird

```text
<home>/marketplaces/<name>/          Marketplace-Baum
<home>/plugins/<marketplace>/<name>/ installiertes Plugin
<home>/skills/<name>/                materialisiertes Skill
<home>/marketplaces/state.json       Zustand (Quelle, Digest, Scan)
```

Jede Installation läuft durch `@prometheus-harness/skillspector`. Vorgabe ist die
Politik `balanced`; `--strict` blockt jedes `HIGH`, `--force` überschreibt einen
Block.

## Commands, Agents, Hooks

Commands und Agents werden zu Skills (`<plugin>-<command>`,
`<plugin>-agent-<name>`); der Name im Frontmatter wird umgeschrieben. Beim
Installieren ist das die Vorgabe, abschaltbar mit `--no-adapter`; für vorhandene
Plugins holt `pmh plugin adapt --all` es nach.

Hooks laufen nur nach ausdrücklicher Freigabe:
`pmh plugin hooks enable <id>` (wirksam nach Neustart). Ein Hook ist fremder Code
bei jedem Werkzeugaufruf.

## Grenzen

- Keine `npm`- oder `command`-Quellen (kein Paketmanager, keine Befehlsausführung).
- Kein `git clone`: GitHub-Archive über `codeload`, andere Hosts nur als
  ZIP/TAR.GZ.
- LSP wird nicht ausgeführt — der Harness hat keinen Sprachserver-Client.
- Kein OAuth: Mobbin und Figma-Remote lassen sich eintragen, aber nicht
  autorisieren; Figma-Desktop funktioniert.
- Ohne `--prefix` gewinnt bei gleichem Frontmatter-Namen eine Fassung; ein
  vorhandenes Fremd-Skill wird nur mit `--force` überschrieben.

Die vollständige Beschreibung steht in
[`docs/subsystems/plugin-marketplace.md`](../../../docs/subsystems/plugin-marketplace.md).

## Prüfen

```bash
bun test packages/skill/skill-marketplace
bunx tsgo --noEmit -p packages/skill/skill-marketplace/tsconfig.json
```
