# @prometheus-harness/plugin-hooks

Claude-Plugin-Hooks (`hooks/hooks.json`) im Prometheus-Host — **standardmäßig aus**.

```bash
pmh plugin hooks enable hookify@claude-code-plugins
pmh plugin hooks list
pmh plugin hooks disable hookify@claude-code-plugins
```

Das Plugin hängt `PreToolUse` und `PostToolUse` an die Wasserfall-Pipeline des
Werkzeug-Registry (`tools/pre-execute`, `tools/post-execute`). Freigegeben wird
pro Plugin in `<home>/hooks-enabled.json`; wirksam nach einem Neustart des Hosts.

- `exit 2` blockiert, `stderr` ist die Begründung.
- `permissionDecision: "deny"` und `decision: "block"` blockieren ebenfalls.
- Startfehler und Abstürze blockieren nicht; ein Timeout schon.
- Hooks sehen **keine** Host-Geheimnisse: nur Pfade, `TEMP`, Proxy und
  `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PROJECT_DIR`/`CLAUDE_TOOL_NAME`.

Nicht unterstützt: `prompt`-Hooks, `Stop`/`SessionStart`/`SessionEnd`, das
Umschreiben von Argumenten.

Die Begründung und das Dateiformat stehen in
[`docs/subsystems/plugin-hooks.md`](../../../docs/subsystems/plugin-hooks.md).

## Prüfen

```bash
bun test packages/plugin/plugin-hooks
bunx tsgo --noEmit -p packages/plugin/plugin-hooks/tsconfig.json
```
