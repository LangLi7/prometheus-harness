# Manifest — deutsche Fassung

Erzeugt am 12.10.2026. Quelle ist ausschließlich `../original/` (englische Originale).
Die Datei wird fortgeschrieben; `original/` bleibt unberührt.

## Stand

| Kennzahl | Wert |
|---|---|
| kanonische Dokumente in `original/` | 217 |
| davon übersetzt | 28 |
| noch offen | 189 |

## Prüfprotokoll der Übersetzungsläufe

Jeder Lauf wird hier festgehalten, damit nachvollziehbar bleibt, wer was geschrieben hat und
dass die Quelle unberührt blieb. Geprüft wurde gegen `../original/` (Vorhandensein,
Schreibzeitstempel) und gegen die Zieldatei (Bytes laut Arbeiterbericht, Struktur).

| Lauf | Arbeiter | Dateien mit Größe in Bytes | Prüfung |
|---|---|---|---|
| 1 | `9d3b6cc1-e935-463a-89af-276c8dd31fd7` — Hauptdokumente, Gruppe 2 | `defensive-patterns.md` 4.688 · `development.md` 23.672 · `event-producer-consumer.md` 26.893 · `experimental-persistence-catalog.md` 1.716 · `glossary.md` 8.098 · `graph-atlas.md` 1.505 · `module-graph.md` 130.538 · `persistence-catalog.md` 350.101 | **alle 8 Soll-Größen exakt bestätigt**; die 8 Originale liegen vor, Schreibzeit unverändert 12.10.2026 15:11 |

**Zusicherung zu allen Läufen:** In `../original/` wurde nichts geschrieben, geändert oder
gelöscht — die Originale wurden ausschließlich gelesen. Es wurden keine Shell-Befehle mit
Pfaden unter `C:\Users\Chang\harness` ausgeführt; die Core-Vorlage blieb unberührt.

## Übersetzungsregeln

- Übersetzt wird aus dem **englischen** Original, nicht aus der chinesischen Fassung.
- Markdown-Struktur bleibt gleich: Überschriftenebenen, Listenarten, Tabellenzeilen, Codeblöcke, Anker.
- Code, Befehle, Pfade, Bezeichner, CLI-Schalter, Konfigurationsschlüssel und URLs bleiben wörtlich.
- Angelsächsische Fachbegriffe bleiben stehen, wo sie genauer sind: Agent-Loop, Session, Plugin, Bundle, Unit, Skill, Sandbox, Tool, Stream, Provider, Core, Turn.
- Relative Links zeigen weiter auf die gleichnamige Datei; Ziele außerhalb dieses Ordners sind in der Übersetzung nicht auflösbar und daher erwartungsgemäß „tote" Pfade.

## Übersetzte Dateien

| Datei | Quelle |
|---|---|
| `agent-lifecycle.md` | `original/agent-lifecycle.md` |
| `AGENTS.md` | `original/AGENTS.md` |
| `api-gateway.md` | `original/api-gateway.md` |
| `architecture.md` | `original/architecture.md` |
| `capability-seams.md` | `original/capability-seams.md` |
| `cli-help.md` | `original/cli-help.md` |
| `config-catalog.md` | `original/config-catalog.md` |
| `cordis-primer.md` | `original/cordis-primer.md` |
| `deepseek-llm-api-wire-extensions.md` | `original/deepseek-llm-api-wire-extensions.md` |
| `defensive-patterns.md` | `original/defensive-patterns.md` |
| `development.md` | `original/development.md` |
| `event-producer-consumer.md` | `original/event-producer-consumer.md` |
| `experimental-persistence-catalog.md` | `original/experimental-persistence-catalog.md` |
| `glossary.md` | `original/glossary.md` |
| `graph-atlas.md` | `original/graph-atlas.md` |
| `module-graph.md` | `original/module-graph.md` |
| `persistence-catalog.md` | `original/persistence-catalog.md` |
| `rescope.md` | `original/rescope.md` |
| `session-format-status.md` | `original/session-format-status.md` |
| `testing.md` | `original/testing.md` |
| `tool-catalog.md` | `original/tool-catalog.md` |
| `ui-radius.md` | `original/ui-radius.md` |
| `user\develop\basic\index.md` | `original/user\develop\basic\index.md` |
| `user\develop\framework\index.md` | `original/user\develop\framework\index.md` |
| `user\develop\practice\index.md` | `original/user\develop\practice\index.md` |
| `user\guide\index.md` | `original/user\guide\index.md` |
| `user\index.md` | `original/user\index.md` |
| `web-styling.md` | `original/web-styling.md` |

## Noch offen

- `cookbook\adding-a-package.md`
- `cookbook\adding-a-remote-api.md`
- `cookbook\adding-a-session-format-version.md`
- `cookbook\adding-a-settings-card.md`
- `cookbook\adding-a-tool.md`
- `cookbook\adding-a-vendored-package.md`
- `cookbook\adding-an-llm-adapter.md`
- `cookbook\extension-cookbook.md`
- `cookbook\maintaining-dsh-code-review.md`
- `cookbook\responding-to-pr-review-on-a-stack.md`
- `cookbook\reviewing-persistence-type-changes.md`
- `cordis-api\context.md`
- `cordis-api\events.md`
- `cordis-api\fiber.md`
- `cordis-api\inherited.md`
- `cordis-api\registry.md`
- `cordis-api\service.md`
- `cordis-tutorial\01-first-plugin.md`
- `cordis-tutorial\02-lifecycle-and-effects.md`
- `cordis-tutorial\03-services.md`
- `cordis-tutorial\04-events.md`
- `cordis-tutorial\05-config.md`
- `cordis-tutorial\06-composition-and-hmr.md`
- `cordis-tutorial\07-into-the-harness.md`
- `cordis-tutorial\index.md`
- `i18n\README.md`
- `i18n\style-samples.md`
- `i18n\terminology.md`
- `i18n\translation-prompt.md`
- `i18n\translation-rules.md`
- `persistence-changes\2026-09-11-initial.md`
- `persistence-changes\2026-09-12-auto-review-error-metadata.md`
- `persistence-changes\2026-09-13-working-directory.md`
- `persistence-changes\2026-09-14-image-offload.md`
- `persistence-changes\2026-09-14-workspace-changes-event.md`
- `persistence-changes\2026-09-16-session-format-v4.md`
- `persistence-changes\2026-09-18-schedule-optional-title.md`
- `persistence-changes\2026-09-19-external-subagent-catalog.md`
- `persistence-changes\2026-09-20-unknown-child-catalog.md`
- `persistence-changes\2026-09-21-user-question-reply.md`
- `persistence-changes\2026-10-05-ptc-operation-metadata.md`
- `persistence-changes\2026-10-05-working-directory-attribution.md`
- `persistence-changes\2026-10-07-title-reasoning-effort.md`
- `persistence-changes\historical-formats\README.md`
- `persistence-changes\historical-formats\v0.md`
- `persistence-changes\historical-formats\v1.md`
- `persistence-changes\historical-formats\v2.md`
- `persistence-changes\historical-formats\v3.md`
- `persistence-changes\README.md`
- `persistence-changes\releases\dsh-v0.0.1-rc.1.md`
- `persistence-changes\releases\dsh-v0.0.1-rc.2.md`
- `persistence-changes\releases\dsh-v0.0.1-rc.3.md`
- `persistence-changes\releases\dsh-v0.0.1-rc.4.md`
- `persistence-changes\releases\dsh-v0.0.1-rc.5.md`
- `persistence-changes\releases\dsh-v0.1.0-rc.1.md`
- `persistence-changes\releases\dsh-v0.1.0-rc.2.md`
- `persistence-changes\releases\dsh-v0.1.0-rc.3.md`
- `persistence-changes\releases\dsh-v0.1.0-rc.5.md`
- `persistence-changes\releases\dsh-v0.1.0-rc.6.md`
- `persistence-changes\releases\dsh-v0.1.0-rc.7.md`
- `persistence-changes\releases\dsh-v0.1.0-rc.8.md`
- `persistence-changes\releases\dsh-v0.1.1-rc.1.md`
- `persistence-changes\releases\dsh-v0.1.1-rc.2.md`
- `persistence-changes\releases\dsh-v0.1.2-alpha.1.md`
- `persistence-changes\releases\dsh-v0.1.2-alpha.2.md`
- `persistence-changes\releases\dsh-v0.1.2-alpha.3.md`
- `persistence-changes\releases\dsh-v0.1.2-alpha.4.md`
- `persistence-changes\releases\dsh-v0.1.2-alpha.5.md`
- `persistence-changes\releases\dsh-v0.1.2-rc.1.md`
- `persistence-changes\releases\dsh-v0.1.3-alpha.1.md`
- `persistence-changes\releases\dsh-v0.1.3-alpha.2.md`
- `persistence-changes\releases\dsh-v0.1.5-alpha.1.md`
- `persistence-changes\releases\dsh-v0.1.5-alpha.2.md`
- `persistence-changes\releases\dsh-v0.1.5-rc.1.md`
- `persistence-changes\releases\dsh-v0.1.5-rc.2.md`
- `persistence-changes\releases\README.md`
- `postmortem\0001-acp-default-export-drops-inject.md`
- `postmortem\0002-js-expression-disabled-filesystem-tools.md`
- `postmortem\0003-web-agent-gui-feedback-loop.md`
- `postmortem\0004-landlock-partial-notice-misclassified-child-failures.md`
- `postmortem\README.md`
- `subsystems\agent-team.md`
- `subsystems\approval.md`
- `subsystems\attachment.md`
- `subsystems\boot.md`
- `subsystems\browser-use.md`
- `subsystems\claude-code-mods.md`
- `subsystems\client-modules.md`
- `subsystems\client-resources.md`
- `subsystems\commands.md`
- `subsystems\compaction.md`
- `subsystems\computer-use.md`
- `subsystems\conversation.md`
- `subsystems\core.md`
- `subsystems\credentials.md`
- `subsystems\deliverables.md`
- `subsystems\extensions.md`
- `subsystems\feedback.md`
- `subsystems\filesystem.md`
- `subsystems\goal.md`
- `subsystems\jobs.md`
- `subsystems\llm-streaming.md`
- `subsystems\lsp.md`
- `subsystems\mcp.md`
- `subsystems\office-to-pdf.md`
- `subsystems\otel.md`
- `subsystems\permission-presets.md`
- `subsystems\persistence.md`
- `subsystems\plan.md`
- `subsystems\product-telemetry.md`
- `subsystems\ptc-runtime.md`
- `subsystems\README.md`
- `subsystems\sandbox.md`
- `subsystems\schedule.md`
- `subsystems\scope.md`
- `subsystems\session-projection.md`
- `subsystems\session-query.md`
- `subsystems\session-reference.md`
- `subsystems\session-telemetry.md`
- `subsystems\session-title.md`
- `subsystems\session.md`
- `subsystems\settings.md`
- `subsystems\shell.md`
- `subsystems\sidebar-right.md`
- `subsystems\skills.md`
- `subsystems\slots.md`
- `subsystems\spill.md`
- `subsystems\ssh.md`
- `subsystems\storage.md`
- `subsystems\subagent.md`
- `subsystems\subprocess.md`
- `subsystems\system-prompt.md`
- `subsystems\terminal.md`
- `subsystems\todo.md`
- `subsystems\token-meter.md`
- `subsystems\tools.md`
- `subsystems\translation.md`
- `subsystems\typert.md`
- `subsystems\user-questions.md`
- `subsystems\voice-input.md`
- `subsystems\web-client.md`
- `subsystems\web-server.md`
- `subsystems\web.md`
- `subsystems\webhook.md`
- `subsystems\workflow.md`
- `subsystems\working-directory.md`
- `subsystems\workspace.md`
- `subsystems\worktrees.md`
- `tool-execution-pipeline.md`
- `upgrade-guide\v0.1.7-rc.2\schedule-optional-bundle\guide.md`
- `upgrade-guide\v0.1.7-rc.2\transcript-view-legacy-normal\guide.md`
- `upgrade-guide\v0.2.0-rc.2\account-sign-in-errors\guide.md`
- `upgrade-guide\v0.2.0-rc.2\bundled-python-tests\guide.md`
- `upgrade-guide\v0.2.0-rc.2\remove-runtime-invariants\guide.md`
- `upgrade-guide\v0.2.0-rc.2\schedule-bundle-retired\guide.md`
- `upgrade-guide\v0.2.0-rc.2\subpath-plugin-display-manifest\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\deepseek-model-discovery\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\desktop-test-auth-popup\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\experimental-package-composition\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\instruction-home-override\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\mock-messages-events\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\native-subagent-bundle-tools\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\new-session-generations\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\plugin-option-placement\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\python-optional-resources\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\python-ptc-sandbox\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\session-title-adapters\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\session-title-provider-strategy\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\ssh-helper-launch\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\subagent-activations\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\team-direct-inbox\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\terminal-command-labels\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\tool-presentation-mode\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\web-listener-trust-config\guide.md`
- `upgrade-guide\v0.2.1-alpha.1\working-directory\guide.md`
- `user\develop\basic\config.md`
- `user\develop\basic\publish.md`
- `user\develop\basic\tool.md`
- `user\develop\framework\events.md`
- `user\develop\framework\service.md`
- `user\develop\practice\dynamic-cordis.md`
- `user\develop\practice\llm-adapter.md`
- `user\guide\github-review.md`
- `user\guide\mcp-memory.md`
- `user\guide\network-proxy.md`
- `user\guide\providers.md`
- `user\guide\public-deployments.md`
- `user\guide\python-sdk.md`
- `user\guide\schedule.md`

