# Manifest — englische Fassung

Erzeugt am 12.10.2026 aus `../original/`. Quelle: `C:\Users\Chang\harness\prometheus-harness\docs`

**Batching-Regel (verbindlich):** Ein Auftrag umfasst einen ganzen Ordner und **eine**
Sprache — nie eine einzelne Datei. Ein Arbeiter startet **keine** Subagenten. Obergrenze:
2–3 Arbeiter gleichzeitig. Grund und Vorfall: siehe „Batching-Regel für Übersetzungsläufe"
in [../INDEX.md](../INDEX.md).

## Abdeckungsregel

Zu **jeder** Datei in `../original/` gehört eine gleichnamige Datei hier — Dateiname samt
Endung bleibt erhalten, auch bei `.zh.md`, `.i18n.yaml`, `.schema.json` und Bildern.
`foo.zh.md` in diesem Ordner enthält die **englische** Übersetzung des chinesischen Dokuments.

| Herkunft in `../original/` | Ausgabe hier |
|---|---|
| `foo.md` (englisch) | unverändert kopiert |
| `foo.zh.md` (chinesisch) | ins Englische übersetzt |
| `foo.i18n.yaml` | unverändert kopiert |
| `foo.schema.json` | unverändert kopiert |
| `bild.png` | unverändert kopiert |

## Zusammenfassung

| Ausgabe | Anzahl | Regel |
|---|---|---|
| unverändert kopiert (`.md`, `.i18n.yaml`, `.json`, `.png`) | 480 | Datei 1:1 übernommen, bitgleich |
| aus dem Chinesischen übersetzt (`.zh.md`) | 212 | neuer englischer Text, Struktur der Quelle erhalten |

Die folgende Liste ist die Erstaufnahme vom 12.10.2026; die Spalte „Ausgabe" nennt damals
„bewusst ausgelassen" für chinesische Fassungen, i18n-Tabellen, Schemadateien und Bilder.
**Das ist überholt:** Diese Dateien sind inzwischen vorhanden — die chinesischen Dokumente
übersetzt, die übrigen bitgleich kopiert.

## Vollständige Liste

| Datei in `original/` | erkannte Sprache | Ausgabe |
|---|---|---|
| `agent-lifecycle.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `agent-lifecycle.md` | Englisch | übernommen |
| `agent-lifecycle.zh.md` | Chinesisch | bewusst ausgelassen |
| `AGENTS.md` | Englisch | übernommen |
| `api-gateway.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `api-gateway.md` | Englisch | übernommen |
| `api-gateway.zh.md` | Chinesisch | bewusst ausgelassen |
| `architecture.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `architecture.md` | Englisch | übernommen |
| `architecture.zh.md` | Chinesisch | bewusst ausgelassen |
| `capability-seams.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `capability-seams.md` | Englisch | übernommen |
| `capability-seams.zh.md` | Chinesisch | bewusst ausgelassen |
| `cli-help.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cli-help.md` | Englisch | übernommen |
| `cli-help.zh.md` | Chinesisch | bewusst ausgelassen |
| `config-catalog.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `config-catalog.md` | Englisch | übernommen |
| `config-catalog.zh.md` | Chinesisch | bewusst ausgelassen |
| `cookbook\adding-a-package.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cookbook\adding-a-package.md` | Englisch | übernommen |
| `cookbook\adding-a-package.zh.md` | Chinesisch | bewusst ausgelassen |
| `cookbook\adding-a-remote-api.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cookbook\adding-a-remote-api.md` | Englisch | übernommen |
| `cookbook\adding-a-remote-api.zh.md` | Chinesisch | bewusst ausgelassen |
| `cookbook\adding-a-session-format-version.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cookbook\adding-a-session-format-version.md` | Englisch | übernommen |
| `cookbook\adding-a-session-format-version.zh.md` | Chinesisch | bewusst ausgelassen |
| `cookbook\adding-a-settings-card.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cookbook\adding-a-settings-card.md` | Englisch | übernommen |
| `cookbook\adding-a-settings-card.zh.md` | Chinesisch | bewusst ausgelassen |
| `cookbook\adding-a-tool.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cookbook\adding-a-tool.md` | Englisch | übernommen |
| `cookbook\adding-a-tool.zh.md` | Chinesisch | bewusst ausgelassen |
| `cookbook\adding-a-vendored-package.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cookbook\adding-a-vendored-package.md` | Englisch | übernommen |
| `cookbook\adding-a-vendored-package.zh.md` | Chinesisch | bewusst ausgelassen |
| `cookbook\adding-an-llm-adapter.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cookbook\adding-an-llm-adapter.md` | Englisch | übernommen |
| `cookbook\adding-an-llm-adapter.zh.md` | Chinesisch | bewusst ausgelassen |
| `cookbook\extension-cookbook.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cookbook\extension-cookbook.md` | Englisch | übernommen |
| `cookbook\extension-cookbook.zh.md` | Chinesisch | bewusst ausgelassen |
| `cookbook\maintaining-dsh-code-review.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cookbook\maintaining-dsh-code-review.md` | Englisch | übernommen |
| `cookbook\maintaining-dsh-code-review.zh.md` | Chinesisch | bewusst ausgelassen |
| `cookbook\responding-to-pr-review-on-a-stack.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cookbook\responding-to-pr-review-on-a-stack.md` | Englisch | übernommen |
| `cookbook\responding-to-pr-review-on-a-stack.zh.md` | Chinesisch | bewusst ausgelassen |
| `cookbook\reviewing-persistence-type-changes.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cookbook\reviewing-persistence-type-changes.md` | Englisch | übernommen |
| `cookbook\reviewing-persistence-type-changes.zh.md` | Chinesisch | bewusst ausgelassen |
| `cordis-api\context.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cordis-api\context.md` | Englisch | übernommen |
| `cordis-api\context.zh.md` | Chinesisch | bewusst ausgelassen |
| `cordis-api\events.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cordis-api\events.md` | Englisch | übernommen |
| `cordis-api\events.zh.md` | Chinesisch | bewusst ausgelassen |
| `cordis-api\fiber.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cordis-api\fiber.md` | Englisch | übernommen |
| `cordis-api\fiber.zh.md` | Chinesisch | bewusst ausgelassen |
| `cordis-api\inherited.md` | Englisch | übernommen |
| `cordis-api\registry.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cordis-api\registry.md` | Englisch | übernommen |
| `cordis-api\registry.zh.md` | Chinesisch | bewusst ausgelassen |
| `cordis-api\service.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cordis-api\service.md` | Englisch | übernommen |
| `cordis-api\service.zh.md` | Chinesisch | bewusst ausgelassen |
| `cordis-primer.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cordis-primer.md` | Englisch | übernommen |
| `cordis-primer.zh.md` | Chinesisch | bewusst ausgelassen |
| `cordis-tutorial\01-first-plugin.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cordis-tutorial\01-first-plugin.md` | Englisch | übernommen |
| `cordis-tutorial\01-first-plugin.zh.md` | Chinesisch | bewusst ausgelassen |
| `cordis-tutorial\02-lifecycle-and-effects.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cordis-tutorial\02-lifecycle-and-effects.md` | Englisch | übernommen |
| `cordis-tutorial\02-lifecycle-and-effects.zh.md` | Chinesisch | bewusst ausgelassen |
| `cordis-tutorial\03-services.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cordis-tutorial\03-services.md` | Englisch | übernommen |
| `cordis-tutorial\03-services.zh.md` | Chinesisch | bewusst ausgelassen |
| `cordis-tutorial\04-events.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cordis-tutorial\04-events.md` | Englisch | übernommen |
| `cordis-tutorial\04-events.zh.md` | Chinesisch | bewusst ausgelassen |
| `cordis-tutorial\05-config.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cordis-tutorial\05-config.md` | Englisch | übernommen |
| `cordis-tutorial\05-config.zh.md` | Chinesisch | bewusst ausgelassen |
| `cordis-tutorial\06-composition-and-hmr.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cordis-tutorial\06-composition-and-hmr.md` | Englisch | übernommen |
| `cordis-tutorial\06-composition-and-hmr.zh.md` | Chinesisch | bewusst ausgelassen |
| `cordis-tutorial\07-into-the-harness.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cordis-tutorial\07-into-the-harness.md` | Englisch | übernommen |
| `cordis-tutorial\07-into-the-harness.zh.md` | Chinesisch | bewusst ausgelassen |
| `cordis-tutorial\index.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `cordis-tutorial\index.md` | Englisch | übernommen |
| `cordis-tutorial\index.zh.md` | Chinesisch | bewusst ausgelassen |
| `deepseek-llm-api-wire-extensions.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `deepseek-llm-api-wire-extensions.md` | Englisch | übernommen |
| `deepseek-llm-api-wire-extensions.zh.md` | Chinesisch | bewusst ausgelassen |
| `defensive-patterns.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `defensive-patterns.md` | Englisch | übernommen |
| `defensive-patterns.zh.md` | Chinesisch | bewusst ausgelassen |
| `dependency-catalog.json` | strukturiert (JSON) | bewusst ausgelassen |
| `development.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `development.md` | Englisch | übernommen |
| `development.zh.md` | Chinesisch | bewusst ausgelassen |
| `event-producer-consumer.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `event-producer-consumer.md` | Englisch | übernommen |
| `event-producer-consumer.zh.md` | Chinesisch | bewusst ausgelassen |
| `experimental-persistence-catalog.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `experimental-persistence-catalog.md` | Englisch | übernommen |
| `experimental-persistence-catalog.zh.md` | Chinesisch | bewusst ausgelassen |
| `glossary.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `glossary.md` | Englisch | übernommen |
| `glossary.zh.md` | Chinesisch | bewusst ausgelassen |
| `graph-atlas.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `graph-atlas.md` | Englisch | übernommen |
| `graph-atlas.zh.md` | Chinesisch | bewusst ausgelassen |
| `i18n\README.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `i18n\README.md` | Englisch | übernommen |
| `i18n\README.zh.md` | Chinesisch | bewusst ausgelassen |
| `i18n\style-samples.md` | Englisch | übernommen |
| `i18n\terminology.md` | Englisch | übernommen |
| `i18n\translation-prompt.md` | Englisch | übernommen |
| `i18n\translation-rules.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `i18n\translation-rules.md` | Englisch | übernommen |
| `i18n\translation-rules.zh.md` | Chinesisch | bewusst ausgelassen |
| `module-graph.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `module-graph.md` | Englisch | übernommen |
| `module-graph.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-catalog.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-catalog.md` | Englisch | übernommen |
| `persistence-catalog.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\2026-09-11-initial.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\2026-09-11-initial.md` | Englisch | übernommen |
| `persistence-changes\2026-09-11-initial.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\2026-09-11-initial.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\2026-09-12-auto-review-error-metadata.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\2026-09-12-auto-review-error-metadata.md` | Englisch | übernommen |
| `persistence-changes\2026-09-12-auto-review-error-metadata.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\2026-09-12-auto-review-error-metadata.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\2026-09-13-working-directory.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\2026-09-13-working-directory.md` | Englisch | übernommen |
| `persistence-changes\2026-09-13-working-directory.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\2026-09-13-working-directory.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\2026-09-14-image-offload.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\2026-09-14-image-offload.md` | Englisch | übernommen |
| `persistence-changes\2026-09-14-image-offload.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\2026-09-14-image-offload.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\2026-09-14-workspace-changes-event.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\2026-09-14-workspace-changes-event.md` | Englisch | übernommen |
| `persistence-changes\2026-09-14-workspace-changes-event.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\2026-09-14-workspace-changes-event.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\2026-09-16-session-format-v4.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\2026-09-16-session-format-v4.md` | Englisch | übernommen |
| `persistence-changes\2026-09-16-session-format-v4.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\2026-09-16-session-format-v4.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\2026-09-18-schedule-optional-title.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\2026-09-18-schedule-optional-title.md` | Englisch | übernommen |
| `persistence-changes\2026-09-18-schedule-optional-title.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\2026-09-18-schedule-optional-title.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\2026-09-19-external-subagent-catalog.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\2026-09-19-external-subagent-catalog.md` | Englisch | übernommen |
| `persistence-changes\2026-09-19-external-subagent-catalog.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\2026-09-19-external-subagent-catalog.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\2026-09-20-unknown-child-catalog.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\2026-09-20-unknown-child-catalog.md` | Englisch | übernommen |
| `persistence-changes\2026-09-20-unknown-child-catalog.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\2026-09-20-unknown-child-catalog.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\2026-09-21-user-question-reply.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\2026-09-21-user-question-reply.md` | Englisch | übernommen |
| `persistence-changes\2026-09-21-user-question-reply.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\2026-09-21-user-question-reply.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\2026-10-05-ptc-operation-metadata.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\2026-10-05-ptc-operation-metadata.md` | Englisch | übernommen |
| `persistence-changes\2026-10-05-ptc-operation-metadata.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\2026-10-05-ptc-operation-metadata.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\2026-10-05-working-directory-attribution.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\2026-10-05-working-directory-attribution.md` | Englisch | übernommen |
| `persistence-changes\2026-10-05-working-directory-attribution.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\2026-10-05-working-directory-attribution.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\2026-10-07-title-reasoning-effort.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\2026-10-07-title-reasoning-effort.md` | Englisch | übernommen |
| `persistence-changes\2026-10-07-title-reasoning-effort.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\2026-10-07-title-reasoning-effort.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\finalized\v4.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\historical-formats\README.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\historical-formats\README.md` | Englisch | übernommen |
| `persistence-changes\historical-formats\README.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\historical-formats\v0.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\historical-formats\v0.md` | Englisch | übernommen |
| `persistence-changes\historical-formats\v0.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\historical-formats\v0.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\historical-formats\v1.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\historical-formats\v1.md` | Englisch | übernommen |
| `persistence-changes\historical-formats\v1.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\historical-formats\v1.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\historical-formats\v2.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\historical-formats\v2.md` | Englisch | übernommen |
| `persistence-changes\historical-formats\v2.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\historical-formats\v2.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\historical-formats\v3.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\historical-formats\v3.md` | Englisch | übernommen |
| `persistence-changes\historical-formats\v3.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\historical-formats\v3.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\README.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\README.md` | Englisch | übernommen |
| `persistence-changes\README.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.0.1-rc.1.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.0.1-rc.1.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.0.1-rc.1.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.0.1-rc.1.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.0.1-rc.2.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.0.1-rc.2.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.0.1-rc.2.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.0.1-rc.2.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.0.1-rc.3.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.0.1-rc.3.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.0.1-rc.3.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.0.1-rc.3.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.0.1-rc.4.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.0.1-rc.4.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.0.1-rc.4.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.0.1-rc.4.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.0.1-rc.5.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.0.1-rc.5.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.0.1-rc.5.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.0.1-rc.5.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.1.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.1.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.0-rc.1.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.1.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.2.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.2.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.0-rc.2.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.2.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.3.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.3.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.0-rc.3.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.3.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.5.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.5.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.0-rc.5.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.5.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.6.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.6.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.0-rc.6.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.6.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.7.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.7.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.0-rc.7.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.7.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.8.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.8.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.0-rc.8.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.0-rc.8.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.1-rc.1.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.1-rc.1.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.1-rc.1.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.1-rc.1.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.1-rc.2.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.1-rc.2.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.1-rc.2.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.1-rc.2.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.1.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.1.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.1.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.1.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.2.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.2.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.2.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.2.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.3.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.3.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.3.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.3.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.4.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.4.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.4.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.4.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.5.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.5.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.5.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-alpha.5.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-rc.1.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-rc.1.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.2-rc.1.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.2-rc.1.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.3-alpha.1.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.3-alpha.1.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.3-alpha.1.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.3-alpha.1.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.3-alpha.2.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.3-alpha.2.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.3-alpha.2.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.3-alpha.2.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.5-alpha.1.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.5-alpha.1.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.5-alpha.1.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.5-alpha.1.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.5-alpha.2.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.5-alpha.2.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.5-alpha.2.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.5-alpha.2.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.5-rc.1.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.5-rc.1.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.5-rc.1.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.5-rc.1.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.5-rc.2.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.5-rc.2.md` | Englisch | übernommen |
| `persistence-changes\releases\dsh-v0.1.5-rc.2.schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\dsh-v0.1.5-rc.2.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-changes\releases\manifest.json` | strukturiert (JSON) | bewusst ausgelassen |
| `persistence-changes\releases\README.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `persistence-changes\releases\README.md` | Englisch | übernommen |
| `persistence-changes\releases\README.zh.md` | Chinesisch | bewusst ausgelassen |
| `persistence-schema.json` | strukturiert (JSON) | bewusst ausgelassen |
| `postmortem\0001-acp-default-export-drops-inject.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `postmortem\0001-acp-default-export-drops-inject.md` | Englisch | übernommen |
| `postmortem\0001-acp-default-export-drops-inject.zh.md` | Chinesisch | bewusst ausgelassen |
| `postmortem\0002-js-expression-disabled-filesystem-tools.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `postmortem\0002-js-expression-disabled-filesystem-tools.md` | Englisch | übernommen |
| `postmortem\0002-js-expression-disabled-filesystem-tools.zh.md` | Chinesisch | bewusst ausgelassen |
| `postmortem\0003-web-agent-gui-feedback-loop.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `postmortem\0003-web-agent-gui-feedback-loop.md` | Englisch | übernommen |
| `postmortem\0003-web-agent-gui-feedback-loop.zh.md` | Chinesisch | bewusst ausgelassen |
| `postmortem\0004-landlock-partial-notice-misclassified-child-failures.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `postmortem\0004-landlock-partial-notice-misclassified-child-failures.md` | Englisch | übernommen |
| `postmortem\0004-landlock-partial-notice-misclassified-child-failures.zh.md` | Chinesisch | bewusst ausgelassen |
| `postmortem\README.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `postmortem\README.md` | Englisch | übernommen |
| `postmortem\README.zh.md` | Chinesisch | bewusst ausgelassen |
| `rescope.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `rescope.md` | Englisch | übernommen |
| `rescope.zh.md` | Chinesisch | bewusst ausgelassen |
| `session-format-status.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `session-format-status.md` | Englisch | übernommen |
| `session-format-status.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\agent-team.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\agent-team.md` | Englisch | übernommen |
| `subsystems\agent-team.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\approval.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\approval.md` | Englisch | übernommen |
| `subsystems\approval.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\attachment.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\attachment.md` | Englisch | übernommen |
| `subsystems\attachment.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\boot.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\boot.md` | Englisch | übernommen |
| `subsystems\boot.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\browser-use.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\browser-use.md` | Englisch | übernommen |
| `subsystems\browser-use.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\claude-code-mods.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\claude-code-mods.md` | Englisch | übernommen |
| `subsystems\claude-code-mods.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\client-modules.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\client-modules.md` | Englisch | übernommen |
| `subsystems\client-modules.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\client-resources.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\client-resources.md` | Englisch | übernommen |
| `subsystems\client-resources.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\commands.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\commands.md` | Englisch | übernommen |
| `subsystems\commands.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\compaction.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\compaction.md` | Englisch | übernommen |
| `subsystems\compaction.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\computer-use.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\computer-use.md` | Englisch | übernommen |
| `subsystems\computer-use.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\conversation.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\conversation.md` | Englisch | übernommen |
| `subsystems\conversation.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\core.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\core.md` | Englisch | übernommen |
| `subsystems\core.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\credentials.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\credentials.md` | Englisch | übernommen |
| `subsystems\credentials.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\deliverables.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\deliverables.md` | Englisch | übernommen |
| `subsystems\deliverables.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\extensions.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\extensions.md` | Englisch | übernommen |
| `subsystems\extensions.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\feedback.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\feedback.md` | Englisch | übernommen |
| `subsystems\feedback.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\filesystem.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\filesystem.md` | Englisch | übernommen |
| `subsystems\filesystem.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\goal.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\goal.md` | Englisch | übernommen |
| `subsystems\goal.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\jobs.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\jobs.md` | Englisch | übernommen |
| `subsystems\jobs.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\llm-streaming.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\llm-streaming.md` | Englisch | übernommen |
| `subsystems\llm-streaming.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\lsp.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\lsp.md` | Englisch | übernommen |
| `subsystems\lsp.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\mcp.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\mcp.md` | Englisch | übernommen |
| `subsystems\mcp.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\office-to-pdf.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\office-to-pdf.md` | Englisch | übernommen |
| `subsystems\office-to-pdf.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\otel.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\otel.md` | Englisch | übernommen |
| `subsystems\otel.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\permission-presets.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\permission-presets.md` | Englisch | übernommen |
| `subsystems\permission-presets.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\persistence.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\persistence.md` | Englisch | übernommen |
| `subsystems\persistence.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\plan.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\plan.md` | Englisch | übernommen |
| `subsystems\plan.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\product-telemetry.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\product-telemetry.md` | Englisch | übernommen |
| `subsystems\product-telemetry.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\ptc-runtime.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\ptc-runtime.md` | Englisch | übernommen |
| `subsystems\ptc-runtime.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\README.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\README.md` | Englisch | übernommen |
| `subsystems\README.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\sandbox.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\sandbox.md` | Englisch | übernommen |
| `subsystems\sandbox.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\schedule.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\schedule.md` | Englisch | übernommen |
| `subsystems\schedule.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\scope.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\scope.md` | Englisch | übernommen |
| `subsystems\scope.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\session-projection.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\session-projection.md` | Englisch | übernommen |
| `subsystems\session-projection.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\session-query.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\session-query.md` | Englisch | übernommen |
| `subsystems\session-query.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\session-reference.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\session-reference.md` | Englisch | übernommen |
| `subsystems\session-reference.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\session-telemetry.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\session-telemetry.md` | Englisch | übernommen |
| `subsystems\session-telemetry.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\session-title.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\session-title.md` | Englisch | übernommen |
| `subsystems\session-title.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\session.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\session.md` | Englisch | übernommen |
| `subsystems\session.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\settings.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\settings.md` | Englisch | übernommen |
| `subsystems\settings.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\shell.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\shell.md` | Englisch | übernommen |
| `subsystems\shell.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\sidebar-right.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\sidebar-right.md` | Englisch | übernommen |
| `subsystems\sidebar-right.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\skills.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\skills.md` | Englisch | übernommen |
| `subsystems\skills.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\slots.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\slots.md` | Englisch | übernommen |
| `subsystems\slots.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\spill.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\spill.md` | Englisch | übernommen |
| `subsystems\spill.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\ssh.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\ssh.md` | Englisch | übernommen |
| `subsystems\ssh.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\storage.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\storage.md` | Englisch | übernommen |
| `subsystems\storage.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\subagent.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\subagent.md` | Englisch | übernommen |
| `subsystems\subagent.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\subprocess.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\subprocess.md` | Englisch | übernommen |
| `subsystems\subprocess.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\system-prompt.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\system-prompt.md` | Englisch | übernommen |
| `subsystems\system-prompt.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\terminal.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\terminal.md` | Englisch | übernommen |
| `subsystems\terminal.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\todo.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\todo.md` | Englisch | übernommen |
| `subsystems\todo.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\token-meter.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\token-meter.md` | Englisch | übernommen |
| `subsystems\token-meter.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\tools.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\tools.md` | Englisch | übernommen |
| `subsystems\tools.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\translation.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\translation.md` | Englisch | übernommen |
| `subsystems\translation.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\typert.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\typert.md` | Englisch | übernommen |
| `subsystems\typert.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\user-questions.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\user-questions.md` | Englisch | übernommen |
| `subsystems\user-questions.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\voice-input.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\voice-input.md` | Englisch | übernommen |
| `subsystems\voice-input.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\web-client.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\web-client.md` | Englisch | übernommen |
| `subsystems\web-client.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\web-server.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\web-server.md` | Englisch | übernommen |
| `subsystems\web-server.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\web.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\web.md` | Englisch | übernommen |
| `subsystems\web.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\webhook.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\webhook.md` | Englisch | übernommen |
| `subsystems\webhook.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\workflow.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\workflow.md` | Englisch | übernommen |
| `subsystems\workflow.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\working-directory.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\working-directory.md` | Englisch | übernommen |
| `subsystems\working-directory.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\workspace.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\workspace.md` | Englisch | übernommen |
| `subsystems\workspace.zh.md` | Chinesisch | bewusst ausgelassen |
| `subsystems\worktrees.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `subsystems\worktrees.md` | Englisch | übernommen |
| `subsystems\worktrees.zh.md` | Chinesisch | bewusst ausgelassen |
| `testing.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `testing.md` | Englisch | übernommen |
| `testing.zh.md` | Chinesisch | bewusst ausgelassen |
| `tool-catalog.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `tool-catalog.md` | Englisch | übernommen |
| `tool-catalog.zh.md` | Chinesisch | bewusst ausgelassen |
| `tool-execution-pipeline.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `tool-execution-pipeline.md` | Englisch | übernommen |
| `tool-execution-pipeline.zh.md` | Chinesisch | bewusst ausgelassen |
| `ui-radius.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `ui-radius.md` | Englisch | übernommen |
| `ui-radius.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.1.7-rc.2\schedule-optional-bundle\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.1.7-rc.2\schedule-optional-bundle\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.1.7-rc.2\schedule-optional-bundle\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.1.7-rc.2\transcript-view-legacy-normal\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.1.7-rc.2\transcript-view-legacy-normal\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.1.7-rc.2\transcript-view-legacy-normal\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.0-rc.2\account-sign-in-errors\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.0-rc.2\account-sign-in-errors\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.0-rc.2\account-sign-in-errors\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.0-rc.2\bundled-python-tests\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.0-rc.2\bundled-python-tests\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.0-rc.2\bundled-python-tests\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.0-rc.2\remove-runtime-invariants\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.0-rc.2\remove-runtime-invariants\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.0-rc.2\remove-runtime-invariants\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.0-rc.2\schedule-bundle-retired\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.0-rc.2\schedule-bundle-retired\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.0-rc.2\schedule-bundle-retired\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.0-rc.2\subpath-plugin-display-manifest\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.0-rc.2\subpath-plugin-display-manifest\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.0-rc.2\subpath-plugin-display-manifest\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\deepseek-model-discovery\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\deepseek-model-discovery\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\deepseek-model-discovery\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\desktop-test-auth-popup\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\desktop-test-auth-popup\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\desktop-test-auth-popup\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\experimental-package-composition\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\experimental-package-composition\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\experimental-package-composition\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\instruction-home-override\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\instruction-home-override\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\instruction-home-override\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\mock-messages-events\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\mock-messages-events\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\mock-messages-events\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\native-subagent-bundle-tools\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\native-subagent-bundle-tools\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\native-subagent-bundle-tools\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\new-session-generations\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\new-session-generations\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\new-session-generations\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\plugin-option-placement\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\plugin-option-placement\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\plugin-option-placement\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\python-optional-resources\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\python-optional-resources\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\python-optional-resources\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\python-ptc-sandbox\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\python-ptc-sandbox\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\python-ptc-sandbox\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\session-title-adapters\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\session-title-adapters\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\session-title-adapters\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\session-title-provider-strategy\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\session-title-provider-strategy\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\session-title-provider-strategy\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\ssh-helper-launch\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\ssh-helper-launch\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\ssh-helper-launch\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\subagent-activations\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\subagent-activations\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\subagent-activations\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\team-direct-inbox\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\team-direct-inbox\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\team-direct-inbox\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\terminal-command-labels\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\terminal-command-labels\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\terminal-command-labels\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\tool-presentation-mode\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\tool-presentation-mode\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\tool-presentation-mode\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\web-listener-trust-config\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\web-listener-trust-config\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\web-listener-trust-config\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\working-directory\guide.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `upgrade-guide\v0.2.1-alpha.1\working-directory\guide.md` | Englisch | übernommen |
| `upgrade-guide\v0.2.1-alpha.1\working-directory\guide.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\develop\basic\config.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\develop\basic\config.md` | Englisch | übernommen |
| `user\develop\basic\config.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\develop\basic\index.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\develop\basic\index.md` | Englisch | übernommen |
| `user\develop\basic\index.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\develop\basic\publish.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\develop\basic\publish.md` | Englisch | übernommen |
| `user\develop\basic\publish.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\develop\basic\tool.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\develop\basic\tool.md` | Englisch | übernommen |
| `user\develop\basic\tool.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\develop\framework\events.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\develop\framework\events.md` | Englisch | übernommen |
| `user\develop\framework\events.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\develop\framework\index.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\develop\framework\index.md` | Englisch | übernommen |
| `user\develop\framework\index.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\develop\framework\service.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\develop\framework\service.md` | Englisch | übernommen |
| `user\develop\framework\service.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\develop\practice\dynamic-cordis.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\develop\practice\dynamic-cordis.md` | Englisch | übernommen |
| `user\develop\practice\dynamic-cordis.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\develop\practice\index.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\develop\practice\index.md` | Englisch | übernommen |
| `user\develop\practice\index.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\develop\practice\llm-adapter.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\develop\practice\llm-adapter.md` | Englisch | übernommen |
| `user\develop\practice\llm-adapter.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\guide\github-review.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\guide\github-review.md` | Englisch | übernommen |
| `user\guide\github-review.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\guide\index.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\guide\index.md` | Englisch | übernommen |
| `user\guide\index.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\guide\mcp-memory.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\guide\mcp-memory.md` | Englisch | übernommen |
| `user\guide\mcp-memory.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\guide\network-proxy.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\guide\network-proxy.md` | Englisch | übernommen |
| `user\guide\network-proxy.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\guide\providers-custom-form.png` | Binär (Bild) | bewusst ausgelassen |
| `user\guide\providers-custom-form.zh.png` | Binär (Bild) | bewusst ausgelassen |
| `user\guide\providers-models-page.png` | Binär (Bild) | bewusst ausgelassen |
| `user\guide\providers-models-page.zh.png` | Binär (Bild) | bewusst ausgelassen |
| `user\guide\providers.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\guide\providers.md` | Englisch | übernommen |
| `user\guide\providers.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\guide\public-deployments.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\guide\public-deployments.md` | Englisch | übernommen |
| `user\guide\public-deployments.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\guide\python-sdk.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\guide\python-sdk.md` | Englisch | übernommen |
| `user\guide\python-sdk.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\guide\schedule.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\guide\schedule.md` | Englisch | übernommen |
| `user\guide\schedule.zh.md` | Chinesisch | bewusst ausgelassen |
| `user\index.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `user\index.md` | Englisch | übernommen |
| `user\index.zh.md` | Chinesisch | bewusst ausgelassen |
| `web-styling.i18n.yaml` | Englisch (i18n-Tabelle) | bewusst ausgelassen |
| `web-styling.md` | Englisch | übernommen |
| `web-styling.zh.md` | Chinesisch | bewusst ausgelassen |

