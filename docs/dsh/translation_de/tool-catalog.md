<!-- Erzeugt von scripts/gen-tool-catalog.ts — nicht von Hand bearbeiten.
     Mit `pnpm run gen-tool-catalog` neu erzeugen. -->

# Tool-Schema-Katalog

Jedes modellgerichtete Tool, das ein ausgeliefertes Plugin zu `ctx.tools` beiträgt: der `name`, die `description` und die JSON-Schema-`parameters`, die das Modell über die System-Prompt-Zusammensetzung erhält. Der Katalog ergänzt die [Subsystem-Seiten](subsystems/core.md) (die Typen plus den generierten Cordis-API-Bereich jeder Seite) — diese Seite beschreibt die *Tools*, die dem Agent angeboten werden.

Diese Datei ist GENERIERT und wird von `pnpm run verify-tool-catalog` (Teil von `doc-sync`) auf Aktualität geprüft — nicht von Hand bearbeiten. Anders als der Cordis-Katalog (ein reiner Source-AST-Durchlauf) BOOTET dieser Generator jedes Tool-Plugin auf einem echten Kontext und liest `ctx.tools.schemas()`, weil ein Tool-Schema nicht statisch bestimmbar ist (zur Laufzeit gespreizte Enums, zusammengesetzte Beschreibungen, konfigurationsgesteuerte Namen, rohe JSON-Schema-MCP-Tools). Ein Vollständigkeitswächter globt `packages/*/tool-*` und schlägt fehl, wenn ein Paket im Boot-Manifest des Generators fehlt, sodass ein neues Tool nicht unbemerkt undokumentiert bleiben kann.

Umfang: ausgelieferte Produkt-Tools unter `packages/*/tool-*`, jeweils mit ihrer DEFAULT-Konfiguration gebootet, außer wenn ein Config-Feld REQUIRED ohne Default ist — dort muss der Generator wählen, und die paketweise Notiz hält fest, welchen Zweig diese Seite zeigt. Der registrierte Tool-NAME kann eine Ladezeit-Konfiguration sein (z. B. `toolName` von `tool-subagent`), sodass ein Deployment ein Paket unter einem anderen oder zusätzlichen Namen bereitstellen kann — eine paketweise Notiz hält die ausgelieferten Aliase fest, wo sie existieren. Die Demo-Tools unter `examples/` (z. B. `echo`) sind ausgeschlossen, passend zum nur-Pakete-Umfang des Cordis-Katalogs.

## Tool-Paket-Zuordnung

Diese Tabelle verbindet modellsichtbare Tool-Namen mit dem dahinterliegenden Plugin-Paket und den Service-Seams. Die exakten JSON-Schemas folgen in den Paketabschnitten weiter unten.

| Tool-Paket | Modellsichtbare Namen | Erfordert | Schreibt / wirkt auf | Ausgelieferte Aliase | Deployment-Hinweis |
| --- | --- | --- | --- | --- | --- |
| `@deepseek-ai/dsh-plugin-manager` | `plugin_manager` | `ctx.tools`, `ctx.pluginManager`, `ctx.sandboxPolicy` | `tool/call`, `tool/result`, `user/message` | - | - |
| `@deepseek-ai/dsh-mcp-resources` | `list_mcp_resource_templates`, `list_mcp_resources`, `read_mcp_resource` | `ctx.tools`, `ctx.mcpResources` | `tool/call`, `tool/result` | - | - |
| `@deepseek-ai/dsh-experimental-browser-use-stagehand-native` | `stagehand_act`, `stagehand_extract`, `stagehand_navigate`, `stagehand_observe`, `stagehand_screenshot`, `stagehand_tabs` | `ctx.browserUse`, `ctx.agents`, `ctx.tools`, `ctx.systemPrompt` | `tool/call`, `tool/result` | - | - |
| `@deepseek-ai/dsh-tool-ask-user` | `ask_user_question` | `ctx.tools`, `ctx.userQuestions` | `tool/call`, `tool/result after an answer or timeout`, `late user/message` | - | ask_user_question behält standardmäßig das ursprüngliche blockierende Verhalten; mit `mode: timed` wird ein Vordergrund-Timeout und ein ausstehendes Ergebnis gewählt, während die Frage beantwortbar bleibt. Im Timed-Modus hält `timeout: -1` diesen Aufruf unbegrenzt blockierend. |
| `@deepseek-ai/dsh-tools` | `run_code` | `ctx.workingDirectory (Agent executions)`, `ctx.tools`, `ctx.ptcRuntime (execution time)`, `ctx.systemPrompt` | `tool/call`, `one tool/ptc-dispatch-start + tool/ptc-dispatch pair per bridged sub-call`, `tool/result` | - | Eigentum der Tool-Registry als reservierter Transport außerhalb filterbarer Fähigkeitsschichten unter `mode: ptc` (siehe die Agent Note zum PTC-Modus). Unter `ptc` ist es der einzige Wire-Beitrag der Registry; die übrigen sichtbaren Fähigkeiten werden in einem generierten SDK-Abschnitt in der Sprache der geladenen Runtime deklariert, und ein Programm ruft sie über Bindings auf, die unter dem nativen Nebenläufigkeitsvertrag geplant werden (in Übermittlungsreihenfolge startende Starts und Policy; nebenläufigkeitssichere Rümpfe überlappen bis zu `maxParallelSubCalls`), die die vollständige abgesicherte Tool-Pipeline erneut durchlaufen und jede verschachtelte Ausführung mit diesem äußeren Ergebnis verknüpfen. |
| `@deepseek-ai/dsh-plan-mode` | `exit_plan_mode` | `ctx.tools`, `ctx.systemPrompt`, `ctx.userQuestions (execution time, opportunistic)` | `tool/call`, `plan/mode inactive on an approved review`, `tool/result` | - | exit_plan_mode bleibt im modellgerichteten Schema, während die Planung inaktiv ist, damit Übergänge keinen zusätzlichen Tool-Katalog-Churn über die Änderung der Plan-Policy hinaus erzeugen. Sein Ausführungspfad lehnt Aufrufe außerhalb des Plan-Modus ab; im Plan-Modus präsentiert es den Plan über den User-Questions-Seam (freigeben / mit Feedback weiter planen), und die Freigabe protokolliert plan mode inactive an der Schrittgrenze. |
| `@deepseek-ai/dsh-tool-bash` | `bash` | `ctx.workingDirectory`, `ctx.tools`, `ctx.shell`, `ctx.systemPrompt`, `ctx.shellEnv`, `ctx.jobs for run_in_background and the job-backed foreground path` | `tool/call`, `tool/result` | - | Das bash-Tool ist der modellgerichtete Konsument des Bash-Executor-Seams. Ist eine Job-Registry komponiert, registriert sich jeder Aufruf beim Start bei der generischen `ctx.jobs`-Runtime und wird über die `job_*`-Tools aus `@deepseek-ai/dsh-tool-jobs` eingesammelt/gestoppt; ohne eine solche Registry oder mit `enableRunInBackground: false` registriert das Tool ein reines Vordergrundschema ohne den Parameter `run_in_background`. |
| `@deepseek-ai/dsh-tool-present` | `present` | `ctx.workingDirectory`, `ctx.tools`, `ctx.fs`, `ctx.sessionProjections` | `tool/call`, `deliverables/presented after a successful final result`, `tool/result` | - | Auslieferungen gehören zur aufrufenden Session; Web ui-deliverables liefert das Öffnen von Quelldateien und Karten. |
| `@deepseek-ai/dsh-tool-pwsh` | `pwsh` | `ctx.workingDirectory`, `ctx.tools`, `ctx.shell`, `ctx.systemPrompt`, `ctx.shellEnv`, `ctx.jobs for run_in_background and the job-backed foreground path` | `tool/call`, `tool/result` | - | Das pwsh-Tool ist der Konsument des Bash-Executor-Seams im PowerShell-Dialekt für Windows-Kompositionen (ein PowerShell-Executor wie `@deepseek-ai/dsh-pwsh-local` hinterlegt `ctx.shell`); es spiegelt das bash-Tool Aufruf für Aufruf, abzüglich der Sandbox-Steuerungen — `run_in_background`-Läufe registrieren sich bei der generischen `ctx.jobs`-Runtime und werden über die `job_*`-Tools eingesammelt/gestoppt, und die verwaltete `DSH_*`-Umgebung stammt aus `@deepseek-ai/dsh-shell-env`. Jeder Aufruf läuft in einem frischen Prozess (keine persistente PTY-Session), mit nativen Pfaden `C:\...` und Variablen `$env:NAME`. |
| `@deepseek-ai/dsh-tool-cordis` | `cordis_inspect_list`, `cordis_inspect_query` | `ctx.tools`, `ctx.cordisInspect` | `tool/call`, `tool/result` | - | Der Creator-Modus stellt zwei schreibgeschützte Laufzeit-Inspektionstools bereit. Der Cordis-Host-Runner liefert die Inspektions-Registry; Client-Abfragen erfordern eine verbundene Seite. Dauerhafte Änderungen als Bundles verfassen und mit plugin_manager installieren. |
| `@deepseek-ai/dsh-tool-bash-persistent` | `bash` | `ctx.workingDirectory`, `ctx.tools`, `ctx.terminals`, `an owning Agent at execution time` | `tool/call`, `PTY shell state`, `tool/result` | - | Ein besitzerisoliertes persistentes bash-Tool; die Deployment-Komposition liefert das PTY-Backend und kann die modellgerichtete Umgebungsbeschreibung überschreiben. |
| `@deepseek-ai/dsh-tool-pwsh-persistent` | `pwsh` | `ctx.workingDirectory`, `ctx.tools`, `ctx.terminals`, `an owning Agent at execution time` | `tool/call`, `PTY shell state`, `tool/result` | - | Ein besitzerisoliertes persistentes pwsh-Tool, das Windows-Pendant des persistenten bash-Tools; die Deployment-Komposition liefert ein PTY-Backend im pwsh-Dialekt und kann die modellgerichtete Umgebungsbeschreibung überschreiben. |
| `@deepseek-ai/dsh-tool-str-replace-editor` | `str_replace_editor` | `ctx.tools`, `ctx.fs` | `tool/call`, `fs/observed after view presence/absence, edit absence, or successful mutation`, `tool/result` | - | Eigenständiges Tool für view/create/eindeutigen Literal-Ersatz/Zeileneinfügung über dem Filesystem-Seam; es komponiert mit jeder Shell- oder Terminal-API. |
| `@deepseek-ai/dsh-tool-fs` | `edit`, `read`, `read_image`, `write` | `ctx.workingDirectory`, `ctx.tools`, `ctx.fs`, `ctx.systemPrompt`, `ctx.attachments (image-tool registration)`, `ctx.llm + an image-capable route (image-tool execution)` | `tool/call`, `fs/write-intent or fs/edit-intent for mutations`, `fs/observed after read presence/absence or successful file operation`, `durable attachment (read_image)`, `tool/result` | - | Die Read-before-write/edit-Policy wird von `@deepseek-ai/dsh-fs-observation-policy` hinzugefügt (ein `fs/*`-Event-Gate-Plugin, keine Schemaänderung); ein Deployment, das diese Tools lädt, sollte sie ebenfalls laden. Das Image-Tool wird ohne `ctx.attachments` nicht registriert; sein Schema ist routenunabhängig, und die Ausführung verweigert, sofern das exakt geroutete Modell nicht Bildeingabe deklariert. |
| `@deepseek-ai/dsh-tool-fs-search` | `glob`, `grep` | `ctx.workingDirectory`, `ctx.tools`, `ctx.subprocess`, `ctx.systemPrompt` | `tool/call`, `tool/result` | - | glob und grep sind unbedingte Discovery-Tools, die die mitgelieferte ripgrep-Binärdatei (`@vscode/ripgrep`) über ctx.subprocess als gewöhnliche Vordergrundaufrufe starten (niemals Hintergrund-Jobs) — keine `rg`-Installation auf dem Host und keine Shell-Schicht. Der Katalog verwendet `sampleOverCapGlobResults: true`; Deployments müssen dieses Verhalten explizit wählen. Gekappte Ergebnisse speichern die vollständige formatierte Liste über das optionale ctx.spillStore-Backend; zurückgegebene Locators sind nachfolgend lesbar/durchsuchbar, wenn das Backend in co-located Deployments lokale Pfade bereitstellt. |
| `@deepseek-ai/dsh-tool-terminal` | `terminal_close`, `terminal_list`, `terminal_open`, `terminal_read`, `terminal_send`, `terminal_signal` | `ctx.workingDirectory`, `ctx.tools`, `ctx.terminals`, `ctx.systemPrompt`, `ctx.jobs at call time for run_in_background` | `tool/call`, `tool/result` | - | Die sechs Terminal-Tools sind Opt-in und ergänzen einmalige Shell-/Filesystem-Tools. `terminal_send(run_in_background: true)` registriert sich bei `ctx.jobs`; TUI, benannte Tastenfolgen, BEL, Resize, Autostart und agentübergreifendes Teilen fehlen im Schema. |
| `@deepseek-ai/dsh-tool-goal` | `create_goal`, `get_goal`, `update_goal` | `ctx.tools`, `ctx.agents`, `ctx.goals`, `ctx.systemPrompt`, `a calling Agent in an authorized open turn` | `tool/call`, `goal/change for mutations`, `tool/result` | - | create, edit, pause und resume erfordern Root-Autorität eines direkten Menschen; complete und blocked akzeptieren zusätzlich die exakte aktuelle Goal-Runde. Die Standard-Untergrenze für blocked sind drei zugelassene Runden. |
| `@deepseek-ai/dsh-tool-schedule` | `schedule_create`, `schedule_delete`, `schedule_list`, `schedule_update` | `ctx.tools`, `ctx.schedule` | `tool/call`, `Schedule storage domain create, update, or delete`, `tool/result` | - | Ein Preset- oder Agent-Scope mountet dieses Paket; das Preset entscheidet, welche Agents die vier Verwaltungstools erhalten. Jeder Aufruf wirkt auf die Session des aufrufenden Agent. Akzeptiert after_seconds, explizites absolutes at, begrenztes festratiges every_seconds, tägliche und wöchentliche lokale Zeiten in einer expliziten IANA-Zone sowie cron als Ausdruck mit fünf Feldern. Die Verwaltung nutzt die Host-Speicherdomäne; fällige Nachrichten nehmen die ursprüngliche Session wieder auf. |
| `@deepseek-ai/dsh-tool-lsp` | `lsp` | `ctx.workingDirectory`, `ctx.tools`, `ctx.lsp`, `ctx.systemPrompt` | `tool/call`, `tool/result` | - | Das lsp-Tool hält Provider-Auswahl und Language-Server-Subprozesse hinter ctx.lsp, sodass sein modellsichtbares Schema über Provider hinweg stabil bleibt. Erfordert zur Laufzeit einen registrierten Provider (z. B. `@deepseek-ai/dsh-lsp-stdio`); ohne einen solchen liefert eine Abfrage den strukturierten Fehler `LSP_UNAVAILABLE`, statt das Schema zu ändern. |
| `@deepseek-ai/dsh-tool-ralph` | `ralph` | `ctx.tools`, `ctx.workflowEngine`, `ctx.subagents`, `ctx.systemPrompt`, `a calling Agent (exec.agent parents every fresh round)` | `tool/call`, `tool/result`, `workflow and child session events during execution` | - | Ein fester Vordergrund-Workflow startet pro Runde ein frisches strukturiertes Kind; das Modell wählt nur das unveränderliche Ziel und optional eine Rundengrenze. |
| `@deepseek-ai/dsh-tool-skill` | `skill` | `ctx.workingDirectory`, `ctx.tools`, `ctx.agents`, `ctx.skills` | `tool/call`, `tool/result`, `user/message replacement catalogs via agent.inject()` | - | - |
| `@deepseek-ai/dsh-tool-session-query` | `session_event_read`, `session_event_search`, `session_event_trace`, `session_search`, `session_trace` | `ctx.tools`, `ctx.systemPrompt`, `ctx.sessionQuery`, `a calling Agent for workspace authority` | `tool/call`, `tool/result` | - | Die fünf schreibgeschützten Tools verbergen Provider-Cursor und autorisieren jedes Ergebnis aus der unveränderlichen Session des aufrufenden Agent. Das Paket ist Opt-in; Kompositionen, die erzwungene Fristen oder begrenzte Inline-Ausgabe benötigen, mounten zusätzlich die generischen Timeout- oder Spill-Policies. |
| `@deepseek-ai/dsh-tool-subagent` | `list_subagent_models`, `subagent` | `ctx.tools`, `ctx.subagents`, `ctx.systemPrompt`, `ctx.llm for model discovery and selected-route validation` | `tool/call`, `tool/result`, `child session events through the chosen provider` | `subagent`, `subagent_fork` | Der registrierte Delegationsname ist die Ladezeit-Konfiguration `toolName` (Standard `subagent`); das obige Standardschema hat die Modellauswahl aus, während das Discovery-Schema als fester Begleiter gezeigt wird, der in einer aktivierten Session verfügbar ist. Web-Presets entnehmen die Plugins-Präferenz für jede neue Top-Level-Session und behalten diese Entscheidung für ihre Child-Sessions bei; `subagent_fork` bleibt fest geroutet. Jede Instanz wählt ihr Backend über `provider` und liest die Einstellungen zur Modellauswahl über `modelSelectionSettings`. Jede Delegation liefert zeitnah eine Child-ID zurück; lokale Kinder akzeptieren Folgeaufträge, während externe Backends ihre einzelne Ausführung automatisch melden. |
| `@deepseek-ai/dsh-tool-subagent-control` | `interrupt_agent`, `list_agents`, `send_message` | `ctx.tools`, `ctx.subagents`, `ctx.agents and ctx.sessionProjections (list_agents only)` | `tool/call`, `tool/result`, `child session events through ctx.subagents` | - | Die global benannten Tools für Discovery, Unterbrechung und lokale Nachrichten über verwaltete Subagents: providergebundene `tool-subagent`-Instanzen registrieren eigene Delegationstools, während dieses Paket `send_message` und `interrupt_agent` einmalig registriert, dazu `list_agents` aus seinem separat geladenen `/list-agents`-Plugin (dessen Katalogzeilen die sessionProjections- und die lebende Agent-Registry verwenden). |
| `@deepseek-ai/dsh-tool-jobs` | `job_kill`, `job_list`, `job_output` | `ctx.tools`, `ctx.jobs`, `ctx.systemPrompt` | `tool/call`, `tool/result`, `user/message via agent.inject() for background completion notices` | - | Der artunabhängige Hintergrund-Job-Controller: Hintergrund-bash-Befehle und PTY-Sends werden über dieselben drei Tools gelesen, gelistet und beendet. Das Laden des Plugin hängt den Controller an, der `ctx.jobs.start()` der Produzenten scharf schaltet. |
| `@deepseek-ai/dsh-experimental-tool-agent-team` | `interrupt_agent`, `list_agents`, `send_message`, `spawn_teammate`, `team_task_create`, `team_task_get`, `team_task_list`, `team_task_update`, `wait_agent` | `ctx.tools`, `ctx.systemPrompt`, `ctx.agentTeams`, `an exact live Team member Agent` | `tool/call`, `team/member`, `team/task`, `agent/inbox/spliced`, `user/message on inbox claim`, `tool/result` | - | Alle neun Tools sind auf implizite Team-Leads und dauerhafte Teammitglieder beschränkt. Das ausgelieferte dsh-base-Bundle hält das Paket deaktiviert; der dokumentierte Agent-Teams-Profil-Patch aktiviert es und deaktiviert zugleich die alten Steuernamen für fortsetzbare Kinder. |
| `@deepseek-ai/dsh-tool-todo` | `todo_write` | `ctx.tools`, `owning Agent session` | `tool/call`, `todo/write`, `tool/result` | - | todo_write ist session-eigener Zustand; UIs rendern das jüngste todo/write-Ereignis als Checkliste. `allowParallelInProgress` ist erforderlich ohne Default, daher nennt der Katalog seine Wahl: `true`, dessen Beschreibung mehrere `in_progress`-Einträge nahelegt. Ein Deployment, das `false` wählt, erhält dasselbe Tool mit einer Beschreibung, die genau eine aktive Aufgabe verlangt. |
| `@deepseek-ai/dsh-tool-working-directory` | `working_directory` | `ctx.tools`, `ctx.workingDirectory` | `tool/call`, `working-directory/change`, `user context for directory changes`, `tool/result` | - | Liest oder ändert das Verzeichnis der aufrufenden Session. Bestehende Shells und Prozesse behalten ihre eigenen Verzeichnisse; Ursprungsmetadaten und Berechtigungs-Wurzeln bleiben fest. |
| `@deepseek-ai/dsh-experimental-tool-worktree` | `create_worktree` | `ctx.tools`, `ctx.worktrees`, `a calling Agent` | `tool/call`, `Git branch and checkout`, `working-directory/change`, `tool/result` | - | Nur ausdrückliche experimentelle Komposition. Erzeugt einen neuen Branch und Checkout von einem fixierten lokalen Commit unter bestehenden Schreibberechtigungen und wechselt dann das Session-Verzeichnis. Beim Verlassen bleiben Branch und Checkout erhalten. |
| `@deepseek-ai/dsh-tool-workflow` | `workflow` | `ctx.tools`, `ctx.workflowEngine`, `ctx.systemPrompt`, `a calling Agent (exec.agent parents the script children)` | `tool/call`, `tool/result` | - | - |
| `@deepseek-ai/dsh-tool-workspace-dependencies` | `load_workspace_dependencies` | `ctx.tools` | `tool/call`, `tool/result` | - | - |
| `@deepseek-ai/dsh-tool-web` | `web_fetch`, `web_search` | `ctx.tools`, `ctx.web`, `ctx.systemPrompt` | `tool/call`, `tool/result` | - | web_search und web_fetch halten die Provider-Auswahl hinter ctx.web, sodass modellsichtbare Schemas über Backend-Wechsel hinweg stabil bleiben. |

<a id="deepseek-aidsh-plugin-manager"></a>

## `@deepseek-ai/dsh-plugin-manager`

### `plugin_manager`

Listet Plugins oder Bundles im aktuellen Profil auf, aktiviert oder deaktiviert sie, installiert ein Bundle oder entfernt ein installiertes Bundle. Jede Aktion erfordert für diesen Aufruf die Berechtigung danger-full-access oder eine Freigabe. Eine Freigabe ändert nicht den Berechtigungsmodus der Session. Änderungen betreffen jede Session in diesem Profil. Zuerst auflisten, um exakte Bezeichner zu erhalten. Die Paketinstallation kann erlaubte Build-Skripte ausführen. Live-Profile wenden Änderungen sofort an; Startprofile erfordern einen Neustart. Inkompatible DSH-Peer-Abhängigkeiten blockieren Installation und Aktivierung. Versionsausnahmen riskieren Abstürze und Datenverlust: den Nutzer warnen und vor dem Gewähren einer Ausnahme die ausdrückliche Berechtigung für das exakte Plugin und die exakten Runtime-Versionen einholen.

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "description": "Management operation.",
      "enum": [
        "list_plugins",
        "list_bundles",
        "set_plugin",
        "set_bundle",
        "install_bundle",
        "remove_bundle",
        "list_version_exemptions",
        "set_version_exemption"
      ]
    },
    "target": {
      "type": "string",
      "description": "Plugin entry id, bundle package name, or installation spec, according to action. For an Official catalog entry, pass list_bundles installTarget.spec to install_bundle."
    },
    "enabled": {
      "type": "boolean",
      "description": "Required for set operations; defaults to true for installation. For set_version_exemption, true grants and false revokes."
    },
    "runtimeVersion": {
      "type": "string",
      "description": "For set_version_exemption: exact DSH version from list_version_exemptions. Target must be the manifest package-name@version, not an alias or version range."
    },
    "acceptRisk": {
      "type": "boolean",
      "description": "For granting an exemption: true only after warning the user about possible crashes and data loss and receiving explicit permission for this exact plugin/runtime pair. General installation permission is not enough."
    },
    "approvedBuilds": {
      "type": "array",
      "description": "For install_bundle: pass names from pendingBuilds only after the user explicitly approves running their install scripts in the conversation. This grants persistent permission for this profile.",
      "items": {
        "type": "string"
      }
    },
    "registry": {
      "type": "string",
      "description": "For install_bundle: the npm registry URL asked first, when the user names one; otherwise the configured registry is asked, and its configured fallbacks while a registry is unreachable."
    },
    "offset": {
      "type": "number",
      "description": "Zero-based list offset; defaults to 0."
    },
    "limit": {
      "type": "number",
      "description": "List page size, from 1 to 100; defaults to 25."
    }
  },
  "required": [
    "action"
  ]
}
```

Quelle: [`packages/boot/plugin-manager/src/tools.ts`](../packages/boot/plugin-manager/src/tools.ts)

<a id="deepseek-aidsh-mcp-resources"></a>

## `@deepseek-ai/dsh-mcp-resources`

### `list_mcp_resource_templates`

Listet parametrisierte Resource-URI-Vorlagen von einem MCP-Server auf.

```json
{
  "type": "object",
  "properties": {
    "server": {
      "type": "string",
      "description": "Configured MCP server name."
    },
    "cursor": {
      "type": "string",
      "description": "Continuation cursor returned by this server."
    }
  },
  "required": [
    "server"
  ]
}
```

Quelle: [`packages/mcp/mcp-resources/src/tools.ts`](../packages/mcp/mcp-resources/src/tools.ts)

### `list_mcp_resources`

Listet die von einem MCP-Server verfügbaren Ressourcen auf.

```json
{
  "type": "object",
  "properties": {
    "server": {
      "type": "string",
      "description": "Configured MCP server name."
    },
    "cursor": {
      "type": "string",
      "description": "Continuation cursor returned by this server."
    }
  },
  "required": [
    "server"
  ]
}
```

Quelle: [`packages/mcp/mcp-resources/src/tools.ts`](../packages/mcp/mcp-resources/src/tools.ts)

### `read_mcp_resource`

Liest eine MCP-Ressource anhand ihrer URI vom genannten Server. Eine aufgelistete URI oder eine expandierte Ressourcenvorlage verwenden.

```json
{
  "type": "object",
  "properties": {
    "server": {
      "type": "string",
      "description": "Configured MCP server name."
    },
    "uri": {
      "type": "string",
      "description": "Resource URI to read."
    }
  },
  "required": [
    "server",
    "uri"
  ]
}
```

Quelle: [`packages/mcp/mcp-resources/src/tools.ts`](../packages/mcp/mcp-resources/src/tools.ts)

<a id="deepseek-aidsh-experimental-browser-use-stagehand-native"></a>

## `@deepseek-ai/dsh-experimental-browser-use-stagehand-native`

### `stagehand_act`

Führt eine Browser-Aktion in natürlicher Sprache mit dem konfigurierten Stagehand-Modell aus.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "pageId": {
      "type": "string",
      "minLength": 1
    },
    "instruction": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "instruction"
  ],
  "additionalProperties": false
}
```

Quelle: [`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

### `stagehand_extract`

Extrahiert Seitendaten mit dem konfigurierten Stagehand-Modell und einem optionalen JSON-Schema.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "pageId": {
      "type": "string",
      "minLength": 1
    },
    "instruction": {
      "type": "string",
      "minLength": 1
    },
    "schema": {
      "type": "object",
      "propertyNames": {
        "type": "string"
      },
      "additionalProperties": {
        "$ref": "#/$defs/__schema0"
      }
    }
  },
  "required": [
    "instruction"
  ],
  "additionalProperties": false,
  "$defs": {
    "__schema0": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "number"
        },
        {
          "type": "boolean"
        },
        {
          "type": "null"
        },
        {
          "type": "array",
          "items": {
            "$ref": "#/$defs/__schema0"
          }
        },
        {
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {
            "$ref": "#/$defs/__schema0"
          }
        }
      ]
    }
  }
}
```

Quelle: [`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

### `stagehand_navigate`

Navigiert einen Stagehand-Browser-Tab zu einer URL.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "pageId": {
      "type": "string",
      "minLength": 1
    },
    "url": {
      "type": "string",
      "format": "uri"
    }
  },
  "required": [
    "url"
  ],
  "additionalProperties": false
}
```

Quelle: [`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

### `stagehand_observe`

Findet Browser-Aktionen, die zu einer Anweisung passen, mit dem konfigurierten Stagehand-Modell.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "pageId": {
      "type": "string",
      "minLength": 1
    },
    "instruction": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "instruction"
  ],
  "additionalProperties": false
}
```

Quelle: [`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

### `stagehand_screenshot`

Erstellt einen Screenshot eines Stagehand-Tabs zur visuellen Prüfung.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "pageId": {
      "type": "string",
      "minLength": 1
    },
    "fullPage": {
      "default": false,
      "type": "boolean"
    }
  },
  "required": [
    "fullPage"
  ],
  "additionalProperties": false
}
```

Quelle: [`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

### `stagehand_tabs`

Listet Stagehand-Browser-Tabs auf, erstellt, wählt aus oder schließt sie.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "const": "list"
        }
      },
      "required": [
        "action"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "const": "new"
        },
        "url": {
          "type": "string",
          "format": "uri"
        }
      },
      "required": [
        "action"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "select",
            "close"
          ]
        },
        "pageId": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "action",
        "pageId"
      ],
      "additionalProperties": false
    }
  ],
  "type": "object"
}
```

Quelle: [`packages/experimental/browser-use-stagehand-native/src/index.ts`](../packages/experimental/browser-use-stagehand-native/src/index.ts)

<a id="deepseek-aidsh-tool-ask-user"></a>

## `@deepseek-ai/dsh-tool-ask-user`

### `ask_user_question`

Stellt dem Nutzer eine knappe Frage, wenn vor dem Fortfahren eine Bestätigung, eine Auswahl oder fehlende Information benötigt wird.

```json
{
  "type": "object",
  "properties": {
    "questions": {
      "type": "array",
      "description": "Questions to ask the user before continuing.",
      "items": {
        "type": "object",
        "additionalProperties": true,
        "properties": {
          "id": {
            "type": "string",
            "description": "Stable id for this question; echoed in the answer."
          },
          "question": {
            "type": "string",
            "description": "The specific question to ask the user."
          },
          "header": {
            "type": "string",
            "description": "Optional short heading for the question, such as \"Confirm\" or \"Choose Mode\"."
          },
          "options": {
            "type": "array",
            "description": "Optional choices to show the user. If you recommend one, put it first and append \"(Recommended)\" to that label.",
            "items": {
              "type": "object",
              "additionalProperties": true,
              "properties": {
                "label": {
                  "type": "string",
                  "description": "Short user-facing option label."
                },
                "description": {
                  "type": "string",
                  "description": "One sentence explaining the tradeoff or impact."
                }
              },
              "required": [
                "label"
              ]
            }
          },
          "multi_select": {
            "type": "boolean",
            "description": "Whether the user may select more than one option. Defaults to false."
          }
        },
        "required": [
          "id",
          "question"
        ]
      }
    }
  },
  "required": [
    "questions"
  ]
}
```

Quelle: [`packages/interaction/tool-ask-user/src/index.ts`](../packages/interaction/tool-ask-user/src/index.ts)

ask_user_question behält standardmäßig das ursprüngliche blockierende Verhalten; mit `mode: timed` wird ein Vordergrund-Timeout und ein ausstehendes Ergebnis gewählt, während die Frage beantwortbar bleibt. Im Timed-Modus hält `timeout: -1` diesen Aufruf unbegrenzt blockierend.

<a id="deepseek-aidsh-tools"></a>

## `@deepseek-ai/dsh-tools`

### `run_code`

Führt ein TypeScript-Programm gegen die verfügbaren Tools aus. Nimmt zwei erforderliche Argumente: `description`, eine kurze Zusammenfassung dessen, was das Programm tut, und `code`, den RÜMPF einer async-Funktion (nur löschbare Syntax; `await` und `return` auf oberster Ebene funktionieren). Tools werden gemäß den Deklarationen im System-Prompt als `await tools.name(args)` aufgerufen. Nur was ausgegeben oder zurückgegeben wird, ist Programmausgabe — diese kuratieren. Sub-Tool-Ergebnisse mit Bildern werden nach dem Lauf angehängt.

```json
{
  "type": "object",
  "properties": {
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this program does in active voice, 5-10 words (shown in the UI). Provide `description` before `code` in the arguments. Examples: \"Count TODO markers across packages\"; \"Read failing test and its fixture\"; \"Rename config key in every cordis.yml\"."
    },
    "code": {
      "type": "string",
      "description": "The program: the body of an async TypeScript function."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Positive elapsed-time budget in milliseconds, capped by the deployment maximum."
    },
    "sandbox_permissions": {
      "type": "string",
      "description": "Wider sandbox mode for this complete program execution; requires justification and approval.",
      "enum": [
        "workspace-write",
        "danger-full-access"
      ]
    },
    "justification": {
      "type": "string",
      "description": "Reason this complete program needs wider access, shown to the user for approval. Use the language of the user’s current request."
    }
  },
  "required": [
    "description",
    "code"
  ]
}
```

Quelle: [`packages/core/tools/src/ptc.ts`](../packages/core/tools/src/ptc.ts)

Eigentum der Tool-Registry als reservierter Transport außerhalb filterbarer Fähigkeitsschichten unter `mode: ptc` (siehe die Agent Note zum PTC-Modus). Unter `ptc` ist es der einzige Wire-Beitrag der Registry; die übrigen sichtbaren Fähigkeiten werden in einem generierten SDK-Abschnitt in der Sprache der geladenen Runtime deklariert, und ein Programm ruft sie über Bindings auf, die unter dem nativen Nebenläufigkeitsvertrag geplant werden (in Übermittlungsreihenfolge startende Starts und Policy; nebenläufigkeitssichere Rümpfe überlappen bis zu `maxParallelSubCalls`), die die vollständige abgesicherte Tool-Pipeline erneut durchlaufen und jede verschachtelte Ausführung mit diesem äußeren Ergebnis verknüpfen.

<a id="deepseek-aidsh-plan-mode"></a>

## `@deepseek-ai/dsh-plan-mode`

### `exit_plan_mode`

Nur im Plan-Modus verwenden. Den Plan dem Nutzer zur Prüfung vorlegen und bei Freigabe den Plan-Modus verlassen. Der Nutzer kann freigeben (den Plan ab dem nächsten Schritt ausführen) oder weiter planen — sein Feedback kommt im Tool-Ergebnis zurück; überarbeiten und erneut vorlegen.

```json
{
  "type": "object",
  "properties": {
    "plan": {
      "type": "string",
      "description": "The complete plan, as markdown, starting with a # heading that names it."
    }
  },
  "required": [
    "plan"
  ]
}
```

Quelle: [`packages/plan/plan-mode/src/index.ts`](../packages/plan/plan-mode/src/index.ts)

exit_plan_mode bleibt im modellgerichteten Schema, während die Planung inaktiv ist, damit Übergänge keinen zusätzlichen Tool-Katalog-Churn über die Änderung der Plan-Policy hinaus erzeugen. Sein Ausführungspfad lehnt Aufrufe außerhalb des Plan-Modus ab; im Plan-Modus präsentiert es den Plan über den User-Questions-Seam (freigeben / mit Feedback weiter planen), und die Freigabe protokolliert plan mode inactive an der Schrittgrenze.

<a id="deepseek-aidsh-tool-bash"></a>

## `@deepseek-ai/dsh-tool-bash`

### `bash`

Führt einen bash-Befehl (`bash -c`) aus und gibt dessen stdout/stderr zurück. Jeder Aufruf läuft in einer frischen Shell; `workdir` übergeben, statt `cd` zu verwenden. Verwaltete `$DSH_*`-Variablen legen aktuelle Harness-Umgebungsfakten offen. Lange Ausgabe wird auf ihren Schluss gekürzt; die vollständige Ausgabe wird in eine Datei geschrieben, deren Pfad bei Verfügbarkeit gemeldet wird. `description` vor `command` in den Argumenten angeben. Vor jedem Löschen oder Verschieben prüfen, dass der aufgelöste absolute Zielpfad der beabsichtigte ist; niemals gegen einen berechneten Pfad ausführen, der nicht geprüft wurde. Eine nicht gesetzte Variable expandiert zu einer leeren Zeichenkette, daher Variablen in solchen Pfaden mit `${VAR:?}` absichern. Befehle können unter einer Datei-Sandbox laufen; eine blockierte Dateioperation wird als `[sandbox: file access denied under <mode> mode]` gemeldet, eine Policy-Ablehnung: nicht auf einem anderen Weg erneut versuchen.

```json
{
  "type": "object",
  "properties": {
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"; \"npm install\" → \"Install package dependencies\"."
    },
    "command": {
      "type": "string",
      "description": "The bash command to execute."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap; on expiry the command moves to the background as a job instead of being killed."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "description",
    "command"
  ]
}
```

Quelle: [`packages/shell/tool-bash/src/index.ts`](../packages/shell/tool-bash/src/index.ts)

Das bash-Tool ist der modellgerichtete Konsument des Bash-Executor-Seams. Ist eine Job-Registry komponiert, registriert sich jeder Aufruf beim Start bei der generischen `ctx.jobs`-Runtime und wird über die `job_*`-Tools aus `@deepseek-ai/dsh-tool-jobs` eingesammelt/gestoppt; ohne eine solche Registry oder mit `enableRunInBackground: false` registriert das Tool ein reines Vordergrundschema ohne den Parameter `run_in_background`.

<a id="deepseek-aidsh-tool-present"></a>

## `@deepseek-ai/dsh-tool-present`

### `present`

Erklärt bestehende Dateien zu endgültigen Auslieferungen für den Nutzer. Verwenden, wenn der Nutzer eine separate Datei benötigt, insbesondere Office-Dokumente, Tabellenkalkulationen und Präsentationen; die eigene Abschlussantwort bevorzugen, wenn diese ausreicht. Der Nutzer öffnet die aktuellen Dateien; ihre Inhalte werden nicht kopiert.

```json
{
  "type": "object",
  "properties": {
    "files": {
      "type": "array",
      "description": "Usually the 1-2 most important deliverables; at most 4 per call.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "path": {
            "type": "string",
            "description": "Path of an existing regular file. Relative paths use the Session working directory."
          },
          "description": {
            "type": "string",
            "description": "Brief description for the user."
          }
        },
        "required": [
          "path"
        ]
      }
    }
  },
  "required": [
    "files"
  ]
}
```

Quelle: [`packages/deliverables/tool-present/src/index.ts`](../packages/deliverables/tool-present/src/index.ts)

Auslieferungen gehören zur aufrufenden Session; Web ui-deliverables liefert das Öffnen von Quelldateien und Karten.

<a id="deepseek-aidsh-tool-pwsh"></a>

## `@deepseek-ai/dsh-tool-pwsh`

### `pwsh`

Führt einen PowerShell-Befehl (`pwsh -Command`) aus und gibt dessen stdout/stderr zurück. Jeder Aufruf läuft in einem frischen pwsh-Prozess; `workdir` übergeben, statt `cd` zu verwenden. Pfade verwenden die native Windows-Form (`C:\...`); Umgebungsvariablen werden mit `$env:NAME` gelesen. Verwaltete `$env:DSH_*`-Variablen legen aktuelle Harness-Umgebungsfakten offen. Lange Ausgabe wird auf ihren Schluss gekürzt; die vollständige Ausgabe wird in eine Datei geschrieben, deren Pfad bei Verfügbarkeit gemeldet wird. Unter Windows endet ein hart beendeter Befehl als `[exit code: 1]` ohne Signalmarkierung — das als Unterbrechung behandeln, nicht als Befehlsfehler. `description` vor `command` in den Argumenten angeben. Vor jedem Löschen oder Verschieben prüfen, dass der aufgelöste absolute Zielpfad der beabsichtigte ist; niemals gegen einen berechneten Pfad ausführen, der nicht geprüft wurde. Nicht automatischen Variablen wie `$HOME` zuweisen; Variablennamen sind schreibungsunabhängig, `$home` ist also dieselbe schreibgeschützte Variable. Befehle können unter einer Datei-Sandbox laufen; eine blockierte Dateioperation wird als `[sandbox: file access denied under <mode> mode]` gemeldet, eine Policy-Ablehnung: nicht auf einem anderen Weg erneut versuchen.

```json
{
  "type": "object",
  "properties": {
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"; \"Get-Process\" → \"List running processes\"."
    },
    "command": {
      "type": "string",
      "description": "The PowerShell command to execute."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap; on expiry the command moves to the background as a job instead of being killed."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "description",
    "command"
  ]
}
```

Quelle: [`packages/shell/tool-pwsh/src/index.ts`](../packages/shell/tool-pwsh/src/index.ts)

Das pwsh-Tool ist der Konsument des Bash-Executor-Seams im PowerShell-Dialekt für Windows-Kompositionen (ein PowerShell-Executor wie `@deepseek-ai/dsh-pwsh-local` hinterlegt `ctx.shell`); es spiegelt das bash-Tool Aufruf für Aufruf, abzüglich der Sandbox-Steuerungen — `run_in_background`-Läufe registrieren sich bei der generischen `ctx.jobs`-Runtime und werden über die `job_*`-Tools eingesammelt/gestoppt, und die verwaltete `DSH_*`-Umgebung stammt aus `@deepseek-ai/dsh-shell-env`. Jeder Aufruf läuft in einem frischen Prozess (keine persistente PTY-Session), mit nativen Pfaden `C:\...` und Variablen `$env:NAME`.

<a id="deepseek-aidsh-tool-cordis"></a>

## `@deepseek-ai/dsh-tool-cordis`

### `cordis_inspect_list`

Listet jeden dem Host aktuell bekannten Cordis Inspect Provider auf, einschließlich lokaler Host Provider und der zuletzt vom Client synchronisierten Manifeste. Jeder Eintrag enthält seine Plattform, seinen Zweck, seine schreibgeschützten Methoden sowie Eingabe-/Ausgabeschemas. Dieses Tool vor dem Schreiben oder Konfigurieren eines Plugin aufrufen und dann Provider und Methode für cordis_inspect_query aus seinem Ergebnis wählen. Namen nicht raten und eine Inspect-Methode nicht als Business-Service behandeln, den Plugin-Code aufrufen kann.

```json
{
  "type": "object",
  "properties": {}
}
```

Quelle: [`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_query`

Führt eine von einem Inspect Provider deklarierte schreibgeschützte Abfrage aus. platform, provider und method müssen aus cordis_inspect_list stammen, und input muss das Schema dieser Methode erfüllen. Dieses Tool vor dem Schreiben von Plugin-Code verwenden, um exakte Service-Methoden, Event-Modi, Plugin-Config-Schemas, Tool-Schemas, Theme-Tokens oder lebende Slot-Bäume und -Props zu lesen. Host-Abfragen laufen lokal. Eine Client-Abfrage wartet innerhalb des konfigurierten Timeouts auf die erste gültige Seitenantwort; andernfalls meldet sie einen Client-Fehler oder fordert zum erneuten Verbinden und Wiederholen auf. Dieses Tool kann keine Business-Service-Methoden aufrufen und die Runtime nicht verändern.

```json
{
  "type": "object",
  "properties": {
    "platform": {
      "type": "string",
      "description": "Runtime platform that owns the Provider.",
      "enum": [
        "host",
        "client"
      ]
    },
    "provider": {
      "type": "string",
      "description": "Exact Provider ID returned by cordis_inspect_list."
    },
    "method": {
      "type": "string",
      "description": "Exact method name declared by the Provider manifest."
    },
    "input": {
      "description": "Optional query input; it must satisfy the method input schema."
    }
  },
  "required": [
    "platform",
    "provider",
    "method"
  ]
}
```

Quelle: [`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

Der Creator-Modus stellt zwei schreibgeschützte Laufzeit-Inspektionstools bereit. Der Cordis-Host-Runner liefert die Inspektions-Registry; Client-Abfragen erfordern eine verbundene Seite. Dauerhafte Änderungen als Bundles verfassen und mit plugin_manager installieren.

<a id="deepseek-aidsh-tool-bash-persistent"></a>

## `@deepseek-ai/dsh-tool-bash-persistent`

### `bash`

Führt Befehle in einer persistenten bash-Shell aus. Zustand, einschließlich des aktuellen Verzeichnisses und exportierter Umgebungsvariablen, bleibt über Aufrufe hinweg für diesen Agent erhalten.

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The bash command to run. Relative path is preferred in the command."
    }
  },
  "required": [
    "command"
  ]
}
```

Quelle: [`packages/shell/tool-bash-persistent/src/index.ts`](../packages/shell/tool-bash-persistent/src/index.ts)

Ein besitzerisoliertes persistentes bash-Tool; die Deployment-Komposition liefert das PTY-Backend und kann die modellgerichtete Umgebungsbeschreibung überschreiben.

<a id="deepseek-aidsh-tool-pwsh-persistent"></a>

## `@deepseek-ai/dsh-tool-pwsh-persistent`

### `pwsh`

Führt Befehle in einer persistenten PowerShell-Shell aus. Zustand, einschließlich des aktuellen Verzeichnisses und exportierter Umgebungsvariablen, bleibt über Aufrufe hinweg für diesen Agent erhalten.

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The PowerShell command to run. Relative path is preferred in the command."
    }
  },
  "required": [
    "command"
  ]
}
```

Quelle: [`packages/shell/tool-pwsh-persistent/src/index.ts`](../packages/shell/tool-pwsh-persistent/src/index.ts)

Ein besitzerisoliertes persistentes pwsh-Tool, das Windows-Pendant des persistenten bash-Tools; die Deployment-Komposition liefert ein PTY-Backend im pwsh-Dialekt und kann die modellgerichtete Umgebungsbeschreibung überschreiben.

<a id="deepseek-aidsh-tool-str-replace-editor"></a>

## `@deepseek-ai/dsh-tool-str-replace-editor`

### `str_replace_editor`

Angepasstes Bearbeitungstool zum Anzeigen, Erstellen und Bearbeiten von Dateien
* Der Zustand bleibt über Befehlsaufrufe und Gespräche mit dem Nutzer hinweg erhalten
* Ist `path` eine Datei, zeigt `view` das Ergebnis der Anwendung von `cat -n`. Ist `path` ein Verzeichnis, listet `view` nicht versteckte Dateien und Verzeichnisse bis zu 2 Ebenen tief auf
* Der Befehl `create` kann nicht verwendet werden, wenn der angegebene `path` bereits als Datei existiert
* Erzeugt ein `command` eine lange Ausgabe, wird sie gekürzt und mit `<response clipped>` markiert
* Ein null-Platzhalter für einen vom gewählten Befehl nicht verwendeten Parameter gilt als weggelassen. Erforderliche Parameter benötigen weiterhin Werte; beim Löschen einer Übereinstimmung `str_replace.new_str` weglassen, statt es auf null zu setzen

Hinweise zur Verwendung des Befehls `str_replace`:
* Der Parameter `old_str` sollte EXAKT mit einer oder mehreren aufeinanderfolgenden Zeilen der Originaldatei übereinstimmen. Auf Leerzeichen achten!
* Ist der Parameter `old_str` in der Datei nicht eindeutig, wird der Ersatz nicht durchgeführt. Genügend Kontext in `old_str` aufnehmen, damit er eindeutig ist
* Der Parameter `new_str` sollte die bearbeiteten Zeilen enthalten, die `old_str` ersetzen sollen

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The commands to run. Allowed options are: `view`, `create`, `str_replace`, `insert`.",
      "enum": [
        "view",
        "create",
        "str_replace",
        "insert"
      ]
    },
    "path": {
      "type": "string",
      "description": "Absolute path to file or directory, e.g. `/repo/file.py` or `/repo`."
    },
    "file_text": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "Required string parameter of `create` command, with the content of the file to be created. A null placeholder is treated as omitted by commands that do not use this parameter."
    },
    "insert_line": {
      "oneOf": [
        {
          "type": "integer"
        },
        {
          "type": "null"
        }
      ],
      "description": "Required integer parameter of `insert` command. The `new_str` will be inserted AFTER the line `insert_line` of `path`. A null placeholder is treated as omitted by commands that do not use this parameter."
    },
    "new_str": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "Optional string parameter of `str_replace` command containing the new string (if omitted, no string will be added). Required string parameter of `insert` command containing the string to insert. A null placeholder is accepted only by commands that do not use this parameter."
    },
    "old_str": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "Required string parameter of `str_replace` command containing the string in `path` to replace. A null placeholder is treated as omitted by commands that do not use this parameter."
    },
    "view_range": {
      "oneOf": [
        {
          "type": "array",
          "items": {
            "type": "integer"
          }
        },
        {
          "type": "null"
        }
      ],
      "description": "Optional parameter of `view` command when `path` points to a file. If omitted or null, the full file is shown. If provided, the file will be shown in the indicated line number range, e.g. [11, 12] will show lines 11 and 12. Indexing at 1 to start. Setting `[start_line, -1]` shows all lines from `start_line` to the end of the file."
    }
  },
  "required": [
    "command",
    "path"
  ]
}
```

Quelle: [`packages/fs/tool-str-replace-editor/src/index.ts`](../packages/fs/tool-str-replace-editor/src/index.ts)

Eigenständiges Tool für view/create/eindeutigen Literal-Ersatz/Zeileneinfügung über dem Filesystem-Seam; es komponiert mit jeder Shell- oder Terminal-API.

<a id="deepseek-aidsh-tool-fs"></a>

## `@deepseek-ai/dsh-tool-fs`

### `edit`

Bearbeitet eine bestehende UTF-8-Textdatei durch Ersetzen von Literaltext.

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to edit, resolved by the filesystem backend. Provide `file_path` before `old_string` and `new_string` in the arguments."
    },
    "old_string": {
      "type": "string",
      "description": "Literal text to replace."
    },
    "new_string": {
      "type": "string",
      "description": "Literal replacement text. Use an empty string to delete the match."
    },
    "replace_all": {
      "type": "boolean",
      "description": "Replace all matches. Defaults to false; when false, old_string must appear exactly once."
    }
  },
  "required": [
    "file_path",
    "old_string",
    "new_string"
  ]
}
```

Quelle: [`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `read`

Liest eine UTF-8-Textdatei und gibt den Inhalt mit Zeilennummern zurück.

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to read, resolved by the filesystem backend."
    },
    "offset": {
      "type": "number",
      "description": "1-based first line to return. Defaults to 1."
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of lines to return. Defaults to 2000."
    }
  },
  "required": [
    "file_path"
  ]
}
```

Quelle: [`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `read_image`

Liest eine PNG/JPEG/WebP/GIF-Datei und gibt das Bild selbst zurück. Große Bilder werden automatisch herunterskaliert; keine Bildbibliotheken installieren und keine Thumbnails erzeugen, um ein Bild zu prüfen.

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to the image file, resolved by the filesystem backend."
    }
  },
  "required": [
    "file_path"
  ]
}
```

Quelle: [`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `write`

Erstellt eine UTF-8-Textdatei oder ersetzt sie vollständig.

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to write, resolved by the filesystem backend. Provide `file_path` before `content` in the arguments."
    },
    "content": {
      "type": "string",
      "description": "Full UTF-8 text content to write."
    }
  },
  "required": [
    "file_path",
    "content"
  ]
}
```

Quelle: [`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

Die Read-before-write/edit-Policy wird von `@deepseek-ai/dsh-fs-observation-policy` hinzugefügt (ein `fs/*`-Event-Gate-Plugin, keine Schemaänderung); ein Deployment, das diese Tools lädt, sollte sie ebenfalls laden. Das Image-Tool wird ohne `ctx.attachments` nicht registriert; sein Schema ist routenunabhängig, und die Ausführung verweigert, sofern das exakt geroutete Modell nicht Bildeingabe deklariert.

<a id="deepseek-aidsh-tool-fs-search"></a>

## `@deepseek-ai/dsh-tool-fs-search`

### `glob`

Findet Dateien, keine Verzeichnisse, deren Pfade einem glob-Muster entsprechen, einschließlich versteckter und ignorierter Dateien. Gibt bis zu 100 Pfade in Reihenfolge der Änderungszeit zurück; ein größeres Ergebnis wird über Top-Level-Einträge gesampelt und meldet, wo die vollständige Liste gespeichert wurde.

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Glob pattern to match file paths against (e.g. \"**/*.ts\", \"src/**/*.test.js\"). A pattern with no \"/\" matches the basename at any depth, so \"*\" and \"*.ts\" both search the whole tree; include a separator to anchor the depth."
    },
    "path": {
      "type": "string",
      "description": "Directory to search in. Defaults to the session workspace; a relative path resolves against it."
    }
  },
  "required": [
    "pattern"
  ]
}
```

Quelle: [`packages/fs/tool-fs-search/src/index.ts`](../packages/fs/tool-fs-search/src/index.ts)

### `grep`

Durchsucht Dateiinhalte mit einem ripgrep-Regulärausdruck. Gibt passende Zeilen mit Zeilennummern zurück, nach Datei gruppiert. Gibt bis zu 250 Treffer zurück; ein größeres Ergebnis meldet, wo die vollständige Trefferliste gespeichert wurde.

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Regular expression to search for (ripgrep syntax)."
    },
    "path": {
      "type": "string",
      "description": "File or directory to search. Defaults to the session workspace; a relative path resolves against it."
    },
    "include": {
      "type": "string",
      "description": "One glob filter for which files to search (e.g. \"*.ts\", \"*.{js,jsx}\"). Not a list; negation is not supported."
    }
  },
  "required": [
    "pattern"
  ]
}
```

Quelle: [`packages/fs/tool-fs-search/src/index.ts`](../packages/fs/tool-fs-search/src/index.ts)

glob und grep sind unbedingte Discovery-Tools, die die mitgelieferte ripgrep-Binärdatei (`@vscode/ripgrep`) über ctx.subprocess als gewöhnliche Vordergrundaufrufe starten (niemals Hintergrund-Jobs) — keine `rg`-Installation auf dem Host und keine Shell-Schicht. Der Katalog verwendet `sampleOverCapGlobResults: true`; Deployments müssen dieses Verhalten explizit wählen. Gekappte Ergebnisse speichern die vollständige formatierte Liste über das optionale ctx.spillStore-Backend; zurückgegebene Locators sind nachfolgend lesbar/durchsuchbar, wenn das Backend in co-located Deployments lokale Pfade bereitstellt.

<a id="deepseek-aidsh-tool-terminal"></a>

## `@deepseek-ai/dsh-tool-terminal`

### `terminal_close`

Schließt ein persistentes Terminal und wartet, bis der erfasste, ihm gehörende Prozessbaum verschwunden ist.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

Quelle: [`packages/experimental/tool-terminal/src/index.ts`](../packages/experimental/tool-terminal/src/index.ts)

### `terminal_list`

Listet persistente Terminal-Sessions auf, die dem aktuellen Agent gehören.

```json
{
  "type": "object",
  "properties": {}
}
```

Quelle: [`packages/experimental/tool-terminal/src/index.ts`](../packages/experimental/tool-terminal/src/index.ts)

### `terminal_open`

Erstellt eine persistente, besitzerisolierte Terminal-Session aus einem registrierten Backend-Typ. Für Shell- oder REPL-Zustand verwenden, der über Tool-Aufrufe hinweg erhalten bleiben muss.

```json
{
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "description": "Registered terminal backend type, usually \"shell\"."
    },
    "name": {
      "type": "string",
      "description": "Optional owner-local display name such as \"main\" or \"gdb\"."
    },
    "cwd": {
      "type": "string",
      "description": "Initial working directory, relative to the Session current directory when not absolute."
    }
  },
  "required": [
    "type"
  ]
}
```

Quelle: [`packages/experimental/tool-terminal/src/index.ts`](../packages/experimental/tool-terminal/src/index.ts)

### `terminal_read`

Liest eine begrenzte Seite zurückbehaltener Ausgabe aus einem persistenten Terminal, ohne Eingabe zu senden.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    },
    "offset": {
      "type": "number",
      "description": "Newest-relative line offset (default 0)."
    },
    "count": {
      "type": "number",
      "description": "Requested line count (default 500; backend caps apply)."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

Quelle: [`packages/experimental/tool-terminal/src/index.ts`](../packages/experimental/tool-terminal/src/index.ts)

### `terminal_send`

Sendet Text an ein persistentes Terminal. Standardmäßig wird Enter übermittelt und der Aufruf wartet auf einen Prompt, eine stdin-Wartephase, Ausgabestille, ein Timeout oder das Ende der Session. Der Hintergrundmodus gibt eine Job-ID für job_output/job_kill zurück.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id returned by terminal_open or terminal_list."
    },
    "text": {
      "type": "string",
      "description": "UTF-8 text to write to the terminal."
    },
    "submit": {
      "type": "boolean",
      "description": "Submit Enter after text (default true). Set false for control characters or incomplete REPL input."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Return a job id immediately; collect with job_output or stop with job_kill."
    }
  },
  "required": [
    "sessionId",
    "text"
  ]
}
```

Quelle: [`packages/experimental/tool-terminal/src/index.ts`](../packages/experimental/tool-terminal/src/index.ts)

### `terminal_signal`

Sendet ein erlaubtes Signal an die aktuelle Vordergrundprozessgruppe eines persistenten Terminal.

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    },
    "signal": {
      "type": "string",
      "description": "Signal to deliver. Shell-targeted SIGKILL is rejected; use terminal_close.",
      "enum": [
        "SIGINT",
        "SIGTERM",
        "SIGKILL",
        "SIGTSTP",
        "SIGHUP"
      ]
    }
  },
  "required": [
    "sessionId",
    "signal"
  ]
}
```

Quelle: [`packages/experimental/tool-terminal/src/index.ts`](../packages/experimental/tool-terminal/src/index.ts)

Die sechs Terminal-Tools sind Opt-in und ergänzen einmalige Shell-/Filesystem-Tools. `terminal_send(run_in_background: true)` registriert sich bei `ctx.jobs`; TUI, benannte Tastenfolgen, BEL, Resize, Autostart und agentübergreifendes Teilen fehlen im Schema.

<a id="deepseek-aidsh-tool-goal"></a>

## `@deepseek-ai/dsh-tool-goal`

### `create_goal`

Erstellt ein persistiertes Ziel, das diese Session über automatische Fortsetzungsrunden hinweg weiterarbeiten lässt. Verwenden, wenn die direkte menschliche Anfrage ein langlaufendes Vorhaben ist, auch wenn der Nutzer nicht „Ziel" gesagt hat; nicht für Einzel-Turn-Arbeit.

```json
{
  "type": "object",
  "properties": {
    "objective": {
      "type": "string",
      "description": "The concrete completion objective inferred from the direct human request."
    },
    "max_goal_rounds": {
      "type": "number",
      "description": "Optional positive safe-integer limit on automatic continuation rounds."
    }
  },
  "required": [
    "objective"
  ]
}
```

Quelle: [`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

### `get_goal`

Liest das aktuelle Session-Ziel, einschließlich der id und der revision, die update_goal benötigt.

```json
{
  "type": "object",
  "properties": {}
}
```

Quelle: [`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

### `update_goal`

Aktualisiert das aktuelle Ziel.

```json
{
  "type": "object",
  "properties": {
    "goal_id": {
      "type": "string",
      "description": "Exact id returned by get_goal."
    },
    "revision": {
      "type": "number",
      "description": "Exact positive revision returned by get_goal."
    },
    "action": {
      "type": "string",
      "description": "edit, pause, and resume require a direct top-level human request. complete and blocked are also allowed during an automatic continuation of this goal; blocked is rejected before the configured minimum round count.",
      "enum": [
        "edit",
        "pause",
        "resume",
        "complete",
        "blocked"
      ]
    },
    "objective": {
      "type": "string",
      "description": "Replacement objective; valid only with action edit."
    },
    "max_goal_rounds": {
      "type": "number",
      "description": "Replacement cap; valid only with action edit."
    },
    "blocked_reason": {
      "type": "string",
      "description": "Required only with action blocked: the concrete condition that persisted across rounds and blocks progress."
    }
  },
  "required": [
    "goal_id",
    "revision",
    "action"
  ]
}
```

Quelle: [`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

create, edit, pause und resume erfordern Root-Autorität eines direkten Menschen; complete und blocked akzeptieren zusätzlich die exakte aktuelle Goal-Runde. Die Standard-Untergrenze für blocked sind drei zugelassene Runden.

<a id="deepseek-aidsh-tool-schedule"></a>

## `@deepseek-ai/dsh-tool-schedule`

### `schedule_create`

Erstellt eine Erinnerung in der aktuellen Session, die den Prompt ausliefert, wenn sie fällig wird. Genau einen Zeitparameter angeben: after_seconds, at, every_seconds, daily, weekly oder cron. Lokale Zeiten, die in der Zone nicht existieren, werden übersprungen; wiederholte lokale Zeiten feuern einmal, zum früheren Zeitpunkt. Nach einer Ausfallzeit liefert eine wiederkehrende Erinnerung nur ihr jüngstes verpasstes Vorkommen. Die Auslieferung kann sich nach einem Absturz wiederholen.

```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "description": "Reminder content to present when the target becomes due."
    },
    "title": {
      "type": "string",
      "description": "Task name of at most 120 characters, shown on the task card and in task lists."
    },
    "after_seconds": {
      "type": "number",
      "description": "Delay in whole seconds."
    },
    "every_seconds": {
      "type": "number",
      "description": "Fixed-rate interval in whole seconds, at least 60, aligned to the creation time; changing it with schedule_update re-aligns it to the save time."
    },
    "daily": {
      "type": "object",
      "description": "Every day at a local time.",
      "additionalProperties": false,
      "properties": {
        "time": {
          "type": "string",
          "description": "HH:mm:ss with optional 1-3 fractional digits, for example 23:00:00."
        },
        "time_zone": {
          "type": "string",
          "description": "UTC or IANA Area/Location, for example Asia/Shanghai."
        }
      },
      "required": [
        "time",
        "time_zone"
      ]
    },
    "weekly": {
      "type": "object",
      "description": "On the given weekdays at a local time.",
      "additionalProperties": false,
      "properties": {
        "time": {
          "type": "string",
          "description": "HH:mm:ss with optional 1-3 fractional digits, for example 09:00:00."
        },
        "time_zone": {
          "type": "string",
          "description": "UTC or IANA Area/Location, for example Asia/Shanghai."
        },
        "weekdays": {
          "type": "array",
          "description": "ISO weekdays, Monday 1 through Sunday 7, without repetitions.",
          "items": {
            "type": "integer"
          }
        }
      },
      "required": [
        "time",
        "time_zone",
        "weekdays"
      ]
    },
    "cron": {
      "type": "object",
      "description": "Five-field Vixie cron expression in a time zone.",
      "additionalProperties": false,
      "properties": {
        "expression": {
          "type": "string",
          "description": "minute hour day-of-month month day-of-week, for example \"*/15 9-17 * * 1-5\". When both day fields are restricted, a date matches if either one matches."
        },
        "time_zone": {
          "type": "string",
          "description": "UTC or IANA Area/Location, for example Asia/Shanghai."
        }
      },
      "required": [
        "expression",
        "time_zone"
      ]
    },
    "at": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "date": {
              "type": "string"
            },
            "time": {
              "type": "string"
            },
            "time_zone": {
              "type": "string"
            }
          },
          "required": [
            "date",
            "time",
            "time_zone"
          ]
        }
      ],
      "description": "Absolute target: an RFC 3339 date-time with offset, or a local date, time, and IANA time_zone."
    }
  },
  "required": [
    "prompt",
    "title"
  ]
}
```

Quelle: [`packages/schedule/tool-schedule/src/index.ts`](../packages/schedule/tool-schedule/src/index.ts)

### `schedule_delete`

Löscht eine Erinnerung in der aktuellen Session, aktiv oder inaktiv. Das Löschen nimmt eine bereits eingereihte Erinnerungsnachricht nicht zurück.

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Exact schedule id."
    }
  },
  "required": [
    "id"
  ]
}
```

Quelle: [`packages/schedule/tool-schedule/src/index.ts`](../packages/schedule/tool-schedule/src/index.ts)

### `schedule_list`

Listet die aktiven Erinnerungen in der aktuellen Session auf.

```json
{
  "type": "object",
  "properties": {}
}
```

Quelle: [`packages/schedule/tool-schedule/src/index.ts`](../packages/schedule/tool-schedule/src/index.ts)

### `schedule_update`

Ändert eine Erinnerung an Ort und Stelle und behält ihre id. Einen neuen Titel, Prompt oder höchstens einen Zeitparameter angeben; weggelassene Felder behalten ihre gespeicherten Werte. Um eine relative Verzögerung zu ändern, eine neue Erinnerung erstellen.

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Schedule id returned by schedule_list."
    },
    "title": {
      "type": "string",
      "description": "New task name of at most 120 characters."
    },
    "prompt": {
      "type": "string",
      "description": "New reminder content."
    },
    "every_seconds": {
      "type": "number",
      "description": "Fixed-rate interval in whole seconds, at least 60, aligned to the creation time; changing it with schedule_update re-aligns it to the save time."
    },
    "daily": {
      "type": "object",
      "description": "Every day at a local time.",
      "additionalProperties": false,
      "properties": {
        "time": {
          "type": "string",
          "description": "HH:mm:ss with optional 1-3 fractional digits, for example 23:00:00."
        },
        "time_zone": {
          "type": "string",
          "description": "UTC or IANA Area/Location, for example Asia/Shanghai."
        }
      },
      "required": [
        "time",
        "time_zone"
      ]
    },
    "weekly": {
      "type": "object",
      "description": "On the given weekdays at a local time.",
      "additionalProperties": false,
      "properties": {
        "time": {
          "type": "string",
          "description": "HH:mm:ss with optional 1-3 fractional digits, for example 09:00:00."
        },
        "time_zone": {
          "type": "string",
          "description": "UTC or IANA Area/Location, for example Asia/Shanghai."
        },
        "weekdays": {
          "type": "array",
          "description": "ISO weekdays, Monday 1 through Sunday 7, without repetitions.",
          "items": {
            "type": "integer"
          }
        }
      },
      "required": [
        "time",
        "time_zone",
        "weekdays"
      ]
    },
    "cron": {
      "type": "object",
      "description": "Five-field Vixie cron expression in a time zone.",
      "additionalProperties": false,
      "properties": {
        "expression": {
          "type": "string",
          "description": "minute hour day-of-month month day-of-week, for example \"*/15 9-17 * * 1-5\". When both day fields are restricted, a date matches if either one matches."
        },
        "time_zone": {
          "type": "string",
          "description": "UTC or IANA Area/Location, for example Asia/Shanghai."
        }
      },
      "required": [
        "expression",
        "time_zone"
      ]
    },
    "at": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "date": {
              "type": "string"
            },
            "time": {
              "type": "string"
            },
            "time_zone": {
              "type": "string"
            }
          },
          "required": [
            "date",
            "time",
            "time_zone"
          ]
        }
      ],
      "description": "Absolute target: an RFC 3339 date-time with offset, or a local date, time, and IANA time_zone."
    }
  },
  "required": [
    "id"
  ]
}
```

Quelle: [`packages/schedule/tool-schedule/src/index.ts`](../packages/schedule/tool-schedule/src/index.ts)

Ein Preset- oder Agent-Scope mountet dieses Paket; das Preset entscheidet, welche Agents die vier Verwaltungstools erhalten. Jeder Aufruf wirkt auf die Session des aufrufenden Agent. Akzeptiert after_seconds, explizites absolutes at, begrenztes festratiges every_seconds, tägliche und wöchentliche lokale Zeiten in einer expliziten IANA-Zone sowie cron als Ausdruck mit fünf Feldern. Die Verwaltung nutzt die Host-Speicherdomäne; fällige Nachrichten nehmen die ursprüngliche Session wieder auf.

<a id="deepseek-aidsh-tool-lsp"></a>

## `@deepseek-ai/dsh-tool-lsp`

### `lsp`

Fragt einen Language Server für präzise Code-Navigation ab. operation ist eines von goToDefinition, findReferences, goToImplementation, hover. line und character sind einsbasierte UTF-16-Cursor-Koordinaten. findReferences schließt die Deklaration ein.

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "description": "goToDefinition, findReferences, goToImplementation, or hover.",
      "enum": [
        "goToDefinition",
        "findReferences",
        "goToImplementation",
        "hover"
      ]
    },
    "file_path": {
      "type": "string",
      "description": "The source file to query, relative to the workspace or absolute."
    },
    "line": {
      "type": "number",
      "description": "One-based line of the cursor."
    },
    "character": {
      "type": "number",
      "description": "One-based UTF-16 column of the cursor."
    }
  },
  "required": [
    "operation",
    "file_path",
    "line",
    "character"
  ]
}
```

Quelle: [`packages/lsp/tool-lsp/src/index.ts`](../packages/lsp/tool-lsp/src/index.ts)

Das lsp-Tool hält Provider-Auswahl und Language-Server-Subprozesse hinter ctx.lsp, sodass sein modellsichtbares Schema über Provider hinweg stabil bleibt. Erfordert zur Laufzeit einen registrierten Provider (z. B. `@deepseek-ai/dsh-lsp-stdio`); ohne einen solchen liefert eine Abfrage den strukturierten Fehler `LSP_UNAVAILABLE`, statt das Schema zu ändern.

<a id="deepseek-aidsh-tool-ralph"></a>

## `@deepseek-ai/dsh-tool-ralph`

### `ralph`

Führt eine Vordergrund-Ralph-Schleife mit frischem Agent auf ein unveränderliches Ziel hin aus. Nur verwenden, wenn der direkte Mensch ausdrücklich Ralph oder Fresh-Agent-Iteration verlangt. Jede Runde öffnet ein neues Kind ohne Elternkonversation oder vorherige Kind-Session; der geteilte Workspace ist das Langzeitgedächtnis, und über Runden hinweg wandert nur ein begrenzter strukturierter Bericht. Der Aufruf kehrt zurück, wenn ein Worker Abschluss oder einen konkreten Blocker meldet, oder an der Rundengrenze. Gewöhnliche langlaufende Arbeit innerhalb derselben Session gehört zu den Goal-Tools.

```json
{
  "type": "object",
  "properties": {
    "objective": {
      "type": "string",
      "description": "The immutable completion objective for every fresh Ralph round."
    },
    "maxRounds": {
      "type": "number",
      "description": "Optional positive safe-integer round cap, bounded by the deployment ceiling."
    }
  },
  "required": [
    "objective"
  ]
}
```

Quelle: [`packages/experimental/tool-ralph/src/index.ts`](../packages/experimental/tool-ralph/src/index.ts)

Ein fester Vordergrund-Workflow startet pro Runde ein frisches strukturiertes Kind; das Modell wählt nur das unveränderliche Ziel und optional eine Rundengrenze.

<a id="deepseek-aidsh-tool-skill"></a>

## `@deepseek-ai/dsh-tool-skill`

### `skill`

Lädt die vollständigen Anweisungen für einen Skill. Vor der Bearbeitung einer Aufgabe aufrufen, die einen Skill im Session-Skill-Katalog nennt oder eindeutig dazu passt.

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "The exact skill name from the available skills list."
    }
  },
  "required": [
    "name"
  ]
}
```

Quelle: [`packages/skill/tool-skill/src/index.ts`](../packages/skill/tool-skill/src/index.ts)

<a id="deepseek-aidsh-tool-session-query"></a>

## `@deepseek-ai/dsh-tool-session-query`

### `session_event_read`

Liest ein vollständiges, ungekürztes Ereignis und optional Zusammenfassungen benachbarter Roh-Ereignisse aus einer autorisierten Session.

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "seq": {
      "type": "integer",
      "description": "Target event sequence number."
    },
    "before": {
      "type": "integer",
      "description": "Number of preceding raw events to summarize. Omit for none."
    },
    "after": {
      "type": "integer",
      "description": "Number of following raw events to summarize. Omit for none."
    }
  },
  "required": [
    "seq"
  ]
}
```

Quelle: [`packages/experimental/tool-session-query/src/index.ts`](../packages/experimental/tool-session-query/src/index.ts)

### `session_event_search`

Durchsucht frühere Ereignisse in einer autorisierten Session; die aktuelle Session schließt den Schritt aus, der diesen Aufruf ausführt.

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "query": {
      "type": "string",
      "description": "Literal full-text query over the target session."
    },
    "seq_from": {
      "type": "integer",
      "description": "Inclusive event sequence lower bound."
    },
    "seq_to": {
      "type": "integer",
      "description": "Inclusive event sequence upper bound."
    },
    "time_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time lower bound."
    },
    "time_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time upper bound."
    },
    "event_types": {
      "type": "array",
      "description": "Event types to include.",
      "items": {
        "type": "string"
      }
    },
    "surfaces": {
      "type": "array",
      "description": "Event surfaces to include.",
      "items": {
        "type": "string",
        "enum": [
          "current",
          "shadowed",
          "log-only"
        ]
      }
    }
  },
  "required": [
    "query"
  ]
}
```

Quelle: [`packages/experimental/tool-session-query/src/index.ts`](../packages/experimental/tool-session-query/src/index.ts)

### `session_event_trace`

Liest für ein Ereignis in einer autorisierten Session jeden direkten Ersatz und jede Beziehung zu einem zitierten Quellereignis.

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "seq": {
      "type": "integer",
      "description": "Target event sequence number."
    }
  },
  "required": [
    "seq"
  ]
}
```

Quelle: [`packages/experimental/tool-session-query/src/index.ts`](../packages/experimental/tool-session-query/src/index.ts)

### `session_search`

Durchsucht frühere Sessions im Workspace des Aufrufers und gibt das stärkste passende Ereignis aus jeder Session zurück.

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Literal full-text query over prior session history."
    },
    "session_ids": {
      "type": "array",
      "description": "Optional session ids to include.",
      "items": {
        "type": "string"
      }
    },
    "created_at_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 creation-time lower bound."
    },
    "created_at_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 creation-time upper bound."
    },
    "parent_session_ids": {
      "type": "array",
      "description": "Optional direct parent session ids.",
      "items": {
        "type": "string"
      }
    },
    "include_root_sessions": {
      "type": "boolean",
      "description": "Include sessions with no parent in the parent filter."
    },
    "availability": {
      "type": "array",
      "description": "Require at least one selected source availability.",
      "items": {
        "type": "string",
        "enum": [
          "live",
          "persisted"
        ]
      }
    },
    "event_seq_from": {
      "type": "integer",
      "description": "Inclusive event sequence lower bound."
    },
    "event_seq_to": {
      "type": "integer",
      "description": "Inclusive event sequence upper bound."
    },
    "event_time_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time lower bound."
    },
    "event_time_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time upper bound."
    },
    "event_types": {
      "type": "array",
      "description": "Event types to include.",
      "items": {
        "type": "string"
      }
    },
    "event_surfaces": {
      "type": "array",
      "description": "Event surfaces to include.",
      "items": {
        "type": "string",
        "enum": [
          "current",
          "shadowed",
          "log-only"
        ]
      }
    }
  },
  "required": [
    "query"
  ]
}
```

Quelle: [`packages/experimental/tool-session-query/src/index.ts`](../packages/experimental/tool-session-query/src/index.ts)

### `session_trace`

Liest die autorisierte Session-Abstammung rund um eine Session, einschließlich vollständiger sichtbarer Vorfahren- und Nachfahrenbeziehungen.

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    }
  }
}
```

Quelle: [`packages/experimental/tool-session-query/src/index.ts`](../packages/experimental/tool-session-query/src/index.ts)

Die fünf schreibgeschützten Tools verbergen Provider-Cursor und autorisieren jedes Ergebnis aus der unveränderlichen Session des aufrufenden Agent. Das Paket ist Opt-in; Kompositionen, die erzwungene Fristen oder begrenzte Inline-Ausgabe benötigen, mounten zusätzlich die generischen Timeout- oder Spill-Policies.

<a id="deepseek-aidsh-tool-subagent"></a>

## `@deepseek-ai/dsh-tool-subagent`

### `list_subagent_models`

Entdeckt LLM-Routen für Subagents, ohne den aktuellen Agent zu ändern. Ohne Argumente aufrufen, um registrierte Provider zu listen, mit `provider`, um dessen angekündigte Modelle zu listen, oder mit `provider` und `model`, um genau dieses Modell und seine Reasoning-Stufen zu prüfen. Die Katalogzugehörigkeit ist beratend: Ein Adapter kann eine nicht gelistete Modell-ID akzeptieren. Die zurückgegebenen IDs mit den Feldern `provider`, `model` und `reasoning_effort` eines Delegationstools verwenden.

```json
{
  "type": "object",
  "properties": {
    "provider": {
      "type": "string",
      "description": "Registered LLM provider id. Omit to list providers."
    },
    "model": {
      "type": "string",
      "description": "Exact model id to inspect. Requires provider; omit to list that provider's advertised models."
    }
  }
}
```

Quelle: [`packages/subagent/tool-subagent/src/list-models.ts`](../packages/subagent/tool-subagent/src/list-models.ts)

### `subagent`

Delegiert eine in sich geschlossene Aufgabe an einen Subagent (einen separaten Agent, der in seinem eigenen Kontext arbeitet), um fokussierte, unabhängige Arbeit auszulagern — Recherche, eine abgegrenzte Implementierung, eine Analyse —, damit sie nicht den Kontext dieser Konversation verbraucht. Der Subagent gibt sein Ergebnis zurück, nicht seine Zwischenschritte. Dieses Tool startet einen eigenständig verwalteten Subagent und gibt sofort dessen id zurück. Die Runtime benachrichtigt, sobald er fertig ist. Das Kind meldet Ergebnisse mit `send_message`; `send_message` verwenden, um es während des Laufs zu steuern oder seine Konversation nach dem Abschluss fortzusetzen.

```json
{
  "type": "object",
  "properties": {
    "cwd": {
      "type": "string",
      "description": "Initial child working directory. Relative paths use your current directory; omitted inherits it. Later directory changes in either agent are independent."
    },
    "description": {
      "type": "string",
      "description": "A short (3-5 word) description of the delegated task, for display."
    },
    "prompt": {
      "type": "string",
      "description": "The complete, self-contained task for the subagent. It does not share this conversation's context, so include everything it needs."
    }
  },
  "required": [
    "description",
    "prompt"
  ]
}
```

Quelle: [`packages/subagent/tool-subagent/src/index.ts`](../packages/subagent/tool-subagent/src/index.ts)

Der registrierte Delegationsname ist die Ladezeit-Konfiguration `toolName` (Standard `subagent`); das obige Standardschema hat die Modellauswahl aus, während das Discovery-Schema als fester Begleiter gezeigt wird, der in einer aktivierten Session verfügbar ist. Web-Presets entnehmen die Plugins-Präferenz für jede neue Top-Level-Session und behalten diese Entscheidung für ihre Child-Sessions bei; `subagent_fork` bleibt fest geroutet. Jede Instanz wählt ihr Backend über `provider` und liest die Einstellungen zur Modellauswahl über `modelSelectionSettings`. Jede Delegation liefert zeitnah eine Child-ID zurück; lokale Kinder akzeptieren Folgeaufträge, während externe Backends ihre einzelne Ausführung automatisch melden.

<a id="deepseek-aidsh-tool-subagent-control"></a>

## `@deepseek-ai/dsh-tool-subagent-control`

### `interrupt_agent`

Bittet einen Subagent, seine aktuelle Arbeit zu stoppen. Dieser Aufruf kehrt zurück, ohne auf das Stoppen zu warten. Die Konversation eines lokalen direkten Kindes kann später mit send_message fortgesetzt werden. Externe Ausführungen stoppen dauerhaft und können keine Folgeaufträge erhalten. Von ihm gestartete Subagents laufen weiter.

```json
{
  "type": "object",
  "properties": {
    "agent_id": {
      "type": "string",
      "description": "The id of an agent created under you: your direct child or a deeper descendant."
    }
  },
  "required": [
    "agent_id"
  ]
}
```

Quelle: [`packages/subagent/tool-subagent-control/src/index.ts`](../packages/subagent/tool-subagent-control/src/index.ts)

### `list_agents`

Listet die gestarteten Subagents mit ihren ids, Labels und ihrem Status auf. running bedeutet, dass er arbeitet; inactive bedeutet, dass er derzeit nicht arbeitet. Bei Abschluss eines Subagent erfolgt eine Benachrichtigung; sein Status muss nicht fortlaufend geprüft werden. Mit send_message die Konversation fortsetzen.

```json
{
  "type": "object",
  "properties": {
    "scope": {
      "type": "string",
      "description": "children (default) lists direct children, which accept send_message in any status. descendants lists the whole tree below you with each entry's parent session id and depth; entries deeper than 1 accept only interrupt_agent.",
      "enum": [
        "children",
        "descendants"
      ]
    }
  }
}
```

Quelle: [`packages/subagent/tool-subagent-control/src/list-agents.ts`](../packages/subagent/tool-subagent-control/src/list-agents.ts)

### `send_message`

Sendet eine Nachricht an einen Agent. Ein arbeitender Agent erhält sie an seinem nächsten Schritt; ein untätiger Agent startet damit einen neuen Turn. Gibt die Zustellbestätigung zurück, nicht die Antwort des Agent.

```json
{
  "type": "object",
  "properties": {
    "agent_id": {
      "type": "string",
      "description": "The agent id of your direct continuable child, or your direct parent when you are a resident continuable child."
    },
    "message": {
      "type": "string",
      "description": "The message to deliver to the agent."
    }
  },
  "required": [
    "agent_id",
    "message"
  ]
}
```

Quelle: [`packages/subagent/tool-subagent-control/src/index.ts`](../packages/subagent/tool-subagent-control/src/index.ts)

Die global benannten Tools für Discovery, Unterbrechung und lokale Nachrichten über verwaltete Subagents: providergebundene `tool-subagent`-Instanzen registrieren eigene Delegationstools, während dieses Paket `send_message` und `interrupt_agent` einmalig registriert, dazu `list_agents` aus seinem separat geladenen `/list-agents`-Plugin (dessen Katalogzeilen die sessionProjections- und die lebende Agent-Registry verwenden).

<a id="deepseek-aidsh-tool-jobs"></a>

## `@deepseek-ai/dsh-tool-jobs`

### `job_kill`

Fordert die Beendigung eines laufenden Hintergrund-Jobs an.

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "description": "Job id returned by the tool that started the background work."
    },
    "reason": {
      "type": "string",
      "description": "Optional short reason, recorded in the log and forwarded to the job."
    }
  },
  "required": [
    "job_id"
  ]
}
```

Quelle: [`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

### `job_list`

Listet die eigenen Hintergrund-Jobs (laufend und beendet) mit ihren ids, Arten und Status auf.

```json
{
  "type": "object",
  "properties": {}
}
```

Quelle: [`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

### `job_output`

Liest einen Hintergrund-Job: bei Stream-Jobs die Ausgabe seit dem vorherigen Lesen, bei einem beendeten Final-Output-Job dessen Ergebnis.

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "description": "Job id returned by the tool that started the background work."
    },
    "wait": {
      "type": "boolean",
      "description": "Block until the job finishes or the timeout expires; a timed-out wait leaves the job running. Defaults to false."
    },
    "timeout_ms": {
      "type": "number",
      "description": "Max wait in milliseconds with wait: true. Defaults to and is capped by configuration."
    }
  },
  "required": [
    "job_id"
  ]
}
```

Quelle: [`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

Der artunabhängige Hintergrund-Job-Controller: Hintergrund-bash-Befehle und PTY-Sends werden über dieselben drei Tools gelesen, gelistet und beendet. Das Laden des Plugin hängt den Controller an, der `ctx.jobs.start()` der Produzenten scharf schaltet.

<a id="deepseek-aidsh-experimental-tool-agent-team"></a>

## `@deepseek-ai/dsh-experimental-tool-agent-team`

### `interrupt_agent`

Unterbricht den aktuellen Turn eines Teammitglieds und bewahrt dabei dessen ausstehende Inbox. Nur Team Lead.

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "description": "Teammate target returned by spawn_teammate or list_agents."
    }
  },
  "required": [
    "target"
  ]
}
```

Quelle: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `list_agents`

Listet den Lead und jedes dauerhafte Teammitglied mit adressierbarem Ziel und aktueller Verfügbarkeit auf. inactive bedeutet, dass kein Turn ausgeführt wird, nicht ein Aufgabenergebnis. provisioning und failed beschreiben die Erstellung des Mitglieds.

```json
{
  "type": "object",
  "properties": {}
}
```

Quelle: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `send_message`

Sendet eine Nachricht an ein anderes Teammitglied. Ein laufendes Ziel erhält sie an der nächsten Schrittgrenze; ein inaktives Ziel startet oder nimmt einen Turn wieder auf.

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "description": "Member target returned by spawn_teammate or list_agents, including lead."
    },
    "message": {
      "type": "string",
      "description": "Self-contained message for the target."
    }
  },
  "required": [
    "target",
    "message"
  ]
}
```

Quelle: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `spawn_teammate`

Erstellt ein benanntes, dauerhaftes Teammitglied. Nur der Team Lead darf dieses Tool aufrufen.

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Unique lower-kebab-case teammate name."
    },
    "description": {
      "type": "string",
      "description": "Short description of the delegated responsibility."
    },
    "prompt": {
      "type": "string",
      "description": "Complete initial task for the teammate."
    },
    "context": {
      "type": "string",
      "description": "fresh starts without Lead history; fork inherits completed Lead turns. Defaults to fresh.",
      "enum": [
        "fresh",
        "fork"
      ]
    }
  },
  "required": [
    "name",
    "description",
    "prompt"
  ]
}
```

Quelle: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_create`

Erstellt eine herrenlose ausstehende Aufgabe auf dem geteilten Team-Task-Board.

```json
{
  "type": "object",
  "properties": {
    "subject": {
      "type": "string",
      "description": "Concise task title."
    },
    "description": {
      "type": "string",
      "description": "Complete task details and acceptance criteria."
    },
    "blocked_by": {
      "type": "array",
      "description": "Task ids that must complete first.",
      "items": {
        "type": "string"
      }
    },
    "write_scopes": {
      "type": "array",
      "description": "Advisory workspace-relative file or directory prefixes this task expects to modify.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "subject",
    "description"
  ]
}
```

Quelle: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_get`

Liest den vollständigen jüngsten Wert einer geteilten Aufgabe, bevor sie geändert oder ausgeführt wird.

```json
{
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "description": "Shared task id."
    }
  },
  "required": [
    "task_id"
  ]
}
```

Quelle: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_list`

Listet geteilte Aufgaben auf, einschließlich Bereitschaft, Owner, Revision, Blocker und Warnungen zu Schreibbereichen.

```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "description": "Optional exact status filter.",
      "enum": [
        "pending",
        "in_progress",
        "completed"
      ]
    },
    "owner": {
      "type": "string",
      "description": "Optional member target from spawn_teammate or list_agents, matching ownerName; use unowned for tasks without an owner."
    },
    "ready": {
      "type": "boolean",
      "description": "Optional readiness filter."
    },
    "cursor": {
      "type": "integer",
      "description": "Zero-based result offset. Defaults to 0."
    },
    "limit": {
      "type": "integer",
      "description": "Number of rows, 1 through 100. Defaults to 50."
    }
  }
}
```

Quelle: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_update`

Führt eine Compare-and-set-Aktion auf einer geteilten Aufgabe mit der jüngsten Revision aus team_task_get oder team_task_list aus.

```json
{
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "description": "Shared task id."
    },
    "expected_revision": {
      "type": "integer",
      "description": "Current task revision used as the CAS precondition."
    },
    "action": {
      "type": "string",
      "description": "Task transition to apply.",
      "enum": [
        "claim",
        "release",
        "edit",
        "set_dependencies",
        "complete",
        "reopen",
        "reassign",
        "delete"
      ]
    },
    "subject": {
      "type": "string",
      "description": "Replacement title for edit."
    },
    "description": {
      "type": "string",
      "description": "Replacement details for edit."
    },
    "blocked_by": {
      "type": "array",
      "description": "Complete blocker list for set_dependencies.",
      "items": {
        "type": "string"
      }
    },
    "write_scopes": {
      "type": "array",
      "description": "Replacement advisory write scopes for edit.",
      "items": {
        "type": "string"
      }
    },
    "owner": {
      "type": "string",
      "description": "Member target from spawn_teammate or list_agents for Lead-only reassign; omit to unassign."
    }
  },
  "required": [
    "task_id",
    "expected_revision",
    "action"
  ]
}
```

Quelle: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `wait_agent`

Wartet auf die nächste Status-, Nachrichten- oder geteilte-Aufgaben-Änderung eines Teammitglieds nach dem Start dieses Aufrufs. Dies weckt niemals inaktive Mitglieder und gibt sofort noProgress zurück, wenn kein anderes Mitglied läuft oder bereitgestellt wird. Nach dem Aufwachen oder Timeout erneut auflisten, statt zu pollen.

```json
{
  "type": "object",
  "properties": {
    "timeout_ms": {
      "type": "integer",
      "description": "Wait duration in milliseconds, from 10000 through 3600000. Defaults to 30000."
    }
  }
}
```

Quelle: [`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

Alle neun Tools sind auf implizite Team-Leads und dauerhafte Teammitglieder beschränkt. Das ausgelieferte dsh-base-Bundle hält das Paket deaktiviert; der dokumentierte Agent-Teams-Profil-Patch aktiviert es und deaktiviert zugleich die alten Steuernamen für fortsetzbare Kinder.

<a id="deepseek-aidsh-tool-todo"></a>

## `@deepseek-ai/dsh-tool-todo`

### `todo_write`

Erfasst und aktualisiert eine Aufgabenliste, um mehrschrittige Arbeit zu planen und Fortschritt zu zeigen; bei trivialen Einzelschritt-Aufgaben überspringen. Vor dem Start einen Todo pro konkretem Schritt hinzufügen. Solange Arbeit aussteht, die bearbeiteten Todos `in_progress` halten, mehrere nur, wenn Arbeit parallel läuft. Jeden Todo sofort nach Erledigung auf `completed` setzen.

```json
{
  "type": "object",
  "properties": {
    "todos": {
      "type": "array",
      "description": "The COMPLETE task list, replacing any previous list.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "content": {
            "type": "string",
            "description": "What the task is — a short imperative line."
          },
          "status": {
            "type": "string",
            "description": "pending (not started) | in_progress (now) | completed (done).",
            "enum": [
              "pending",
              "in_progress",
              "completed"
            ]
          }
        },
        "required": [
          "content",
          "status"
        ]
      }
    }
  },
  "required": [
    "todos"
  ]
}
```

Quelle: [`packages/todo/tool-todo/src/index.ts`](../packages/todo/tool-todo/src/index.ts)

todo_write ist session-eigener Zustand; UIs rendern das jüngste todo/write-Ereignis als Checkliste. `allowParallelInProgress` ist erforderlich ohne Default, daher nennt der Katalog seine Wahl: `true`, dessen Beschreibung mehrere `in_progress`-Einträge nahelegt. Ein Deployment, das `false` wählt, erhält dasselbe Tool mit einer Beschreibung, die genau eine aktive Aufgabe verlangt.

<a id="deepseek-aidsh-tool-working-directory"></a>

## `@deepseek-ai/dsh-tool-working-directory`

### `working_directory`

Liest das aktuelle Arbeitsverzeichnis oder ändert es mit cd. Relative Pfade beziehen sich auf das aktuelle Verzeichnis. Bestehende Shells und laufende Prozesse behalten ihre eigenen Verzeichnisse.

```json
{
  "type": "object",
  "properties": {
    "cd": {
      "type": "string",
      "description": "Existing directory to enter. Omit to read the current directory."
    }
  }
}
```

Quelle: [`packages/session/tool-working-directory/src/index.ts`](../packages/session/tool-working-directory/src/index.ts)

Liest oder ändert das Verzeichnis der aufrufenden Session. Bestehende Shells und Prozesse behalten ihre eigenen Verzeichnisse; Ursprungsmetadaten und Berechtigungs-Wurzeln bleiben fest.

<a id="deepseek-aidsh-experimental-tool-worktree"></a>

## `@deepseek-ai/dsh-experimental-tool-worktree`

### `create_worktree`

Erstellt einen neuen Git-Branch und Worktree aus einem lokalen Commit, Branch oder Tag und wechselt dann das Arbeitsverzeichnis dieser Session dorthin. Standard sind HEAD und ein generierter Name. Nicht committete Dateien bleiben im Quell-Checkout. Bestehende Namen schlagen fehl. Zum Verlassen working_directory mit cd verwenden; Checkout und Branch bleiben erhalten.

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "New branch name, also used as the checkout directory. Omit to generate a unique name."
    },
    "from": {
      "type": "string",
      "description": "Local commit, branch, or tag to start from. Defaults to HEAD; no fetch is performed."
    }
  }
}
```

Quelle: [`packages/experimental/tool-worktree/src/index.ts`](../packages/experimental/tool-worktree/src/index.ts)

Nur ausdrückliche experimentelle Komposition. Erzeugt einen neuen Branch und Checkout von einem fixierten lokalen Commit unter bestehenden Schreibberechtigungen und wechselt dann das Session-Verzeichnis. Beim Verlassen bleiben Branch und Checkout erhalten.

<a id="deepseek-aidsh-tool-workflow"></a>

## `@deepseek-ai/dsh-tool-workflow`

### `workflow`

Führt ein JavaScript-Workflow-Skript aus, das Subagents im großen Maßstab orchestriert. Für Arbeit verwenden, die über viele unabhängige Teile auffächert — ein Audit über viele Dateien, eine Migration, Recherche aus mehreren Blickwinkeln, gegnerische Verifikation von Befunden —, bei der die Orchestrierung als Skript geschrieben wird, statt Turn für Turn zu delegieren.

Skript-Rumpf-Hooks:
- `agent(prompt, opts?): Promise<any>` — führt einen Subagent bis zum Abschluss aus. Ohne `opts.schema` löst es zum finalen Text des Kindes auf; mit `opts.schema` (ein objektverwurzeltes JSON-Schema, das NUR type/properties/required/additionalProperties/items/enum/const/oneOf verwendet) löst es zum validierten Objekt auf. Löst zu `null` auf, wenn das Kind fehlschlägt (mit `.filter(Boolean)` filtern). Weitere opts: `label` (Anzeige), `phase` (Fortschrittsgruppe) und unabhängige LLM-Ziel-Overrides `provider`/`model`.
- `pipeline(items, ...stages): Promise<any[]>` — führt jedes Element unabhängig durch die Stages, OHNE Barriere zwischen den Stages (für mehrstufige Arbeit bevorzugen). Jede Stage erhält `(prev, item, index)`. Ein Throw in einer Stage lässt dieses ELEMENT auf `null` fallen und überspringt seine verbleibenden Stages.
- `parallel(thunks): Promise<any[]>` — führt argumentlose Funktionen nebenläufig aus und wartet auf ALLE (eine Barriere; nur verwenden, wenn eine Stage wirklich alle vorherigen Ergebnisse zusammen benötigt). Ein werfender Thunk löst zu `null` auf.
- `phase(title)` — startet eine Fortschrittsphase; `log(message)` — erzählt den Fortschritt; `args` — die `args`-Eingabe des Tool-Aufrufs, wörtlich.

Falsch verwendete Hooks (fehlerhafte Argumente, unbekannte Optionen, nicht unterstützte Schemas, ausgelöste Obergrenzen) beenden das gesamte Skript, statt `null` zu erzeugen. Das Skript hat keine Filesystem-, Netzwerk-, Timer- oder Node.js-APIs; die Agents erledigen die Arbeit.

```json
{
  "type": "object",
  "properties": {
    "script": {
      "type": "string",
      "description": "The plain JavaScript body, not TypeScript and without an `export const meta` statement; top-level await is allowed. End with `return <value>`; the JSON-serializable value is this tool's result."
    },
    "meta": {
      "type": "object",
      "description": "The workflow identity as plain JSON, not code.",
      "additionalProperties": true,
      "properties": {
        "name": {
          "type": "string",
          "description": "Short kebab-case workflow name."
        },
        "description": {
          "type": "string",
          "description": "One-line description of what the workflow does."
        },
        "whenToUse": {
          "type": "string",
          "description": "Optional guidance on when this workflow applies."
        },
        "phases": {
          "type": "array",
          "description": "Optional phase declarations matched by phase() calls.",
          "items": {
            "type": "object",
            "additionalProperties": true,
            "properties": {
              "title": {
                "type": "string",
                "description": "The phase title phase() calls match by exact string."
              },
              "detail": {
                "type": "string",
                "description": "Optional one-line description of the phase."
              },
              "provider": {
                "type": "string",
                "description": "Optional provider override this phase is expected to use."
              },
              "model": {
                "type": "string",
                "description": "Optional model override this phase is expected to use."
              }
            },
            "required": [
              "title"
            ]
          }
        }
      },
      "required": [
        "name",
        "description"
      ]
    },
    "args": {
      "type": "object",
      "description": "Optional JSON input exposed to the script as the `args` global (wrap a bare list as a field, e.g. {\"files\": [...]}).",
      "additionalProperties": true
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run as a background job: return a job id immediately instead of waiting; the return value arrives with the completion notice."
    }
  },
  "required": [
    "script",
    "meta"
  ]
}
```

Quelle: [`packages/workflow/tool-workflow/src/index.ts`](../packages/workflow/tool-workflow/src/index.ts)

<a id="deepseek-aidsh-tool-workspace-dependencies"></a>

## `@deepseek-ai/dsh-tool-workspace-dependencies`

### `load_workspace_dependencies`

Ruft absolute Pfade zu mitgelieferten Python- und Bibliotheksverzeichnissen ab, dazu die Versionen der mitgelieferten Python-Distribution. Node.js- und pnpm-Pfade sind enthalten, wenn die Nutzlast sie bereitstellt. Python umfasst numpy, pandas, python-docx, python-pptx, openpyxl, Pillow, lxml und XlsxWriter. Diese Bibliotheken für Office-Dateien verwenden, sofern der Nutzer oder Workspace-Anweisungen nicht eine andere Umgebung wählen. Werden Node.js- und pnpm-Pfade zurückgegeben, pnpm mit dieser Node-Executable und diesem pnpm-Skriptpfad ausführen. Dies ändert PATH oder Paketmanager-Einstellungen nicht.

```json
{
  "type": "object",
  "properties": {}
}
```

Quelle: [`packages/skill/tool-workspace-dependencies/src/index.ts`](../packages/skill/tool-workspace-dependencies/src/index.ts)

<a id="deepseek-aidsh-tool-web"></a>

## `@deepseek-ai/dsh-tool-web`

### `web_fetch`

Ruft den Inhalt einer bestimmten HTTP(S)-URL ab und gibt ihn als Text dekodiert zurück.

```json
{
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "description": "The HTTP(S) URL to fetch."
    }
  },
  "required": [
    "url"
  ]
}
```

Quelle: [`packages/web/tool-web/src/index.ts`](../packages/web/tool-web/src/index.ts)

### `web_search`

Durchsucht das Web nach aktuellen Informationen. Gibt optional eine zusammenfassende Antwort und eine Liste von Quell-URLs zurück.

```json
{
  "type": "object",
  "properties": {
    "queries": {
      "type": "array",
      "description": "1–4 search queries; their results are merged.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "queries"
  ]
}
```

Quelle: [`packages/web/tool-web/src/index.ts`](../packages/web/tool-web/src/index.ts)

web_search und web_fetch halten die Provider-Auswahl hinter ctx.web, sodass modellsichtbare Schemas über Backend-Wechsel hinweg stabil bleiben.
