# Subsysteme

English | [中文](README.zh.md)

Eine Seite pro Subsystem des DeepSeek Harness: was es ist, welche Datenstrukturen es bewegt und — wo ein `ctx`-Service oder ein Event-Scope es trägt — einen generierten Abschnitt **Cordis API** mit seiner Service- und Event-Referenz. Der Ordner ergänzt [architecture.md](../architecture.md), das *Verhalten* über Subsysteme hinweg beschreibt (die Service-Map, den Session/Turn/Step-Lebenszyklus, die Event-Taxonomie); jede Seite hier ist die Referenz für Vokabular und Verdrahtung eines Subsystems.

| Seite | Verantwortet |
|---|---|
| [boot.md](boot.md) | Plugin-Verwaltung des aktuellen Profils und Koordination des Launcher-Reloads |
| [core.md](core.md) | wie `packages/core` den Agent-Loop steuert: die paketweise Loop-Beschreibung, Agent-Erzeugung und Eigentum (`AgentHandle`), die Delivery-/Cancellation-/Interception-Verträge des `Agent`-Handles und die repoweiten Typmuster (`…Map → derived-union`, gebrandete Ids) |
| [llm-streaming.md](llm-streaming.md) | die Konversationstypen von `packages/llm` — `Message`/`ContentBlock`, die zusammengesetzte Modellanfrage, das `StreamChunk`-Wire-Protokoll und den Adapter-Vertrag, `BlockAssembler` und den `LlmAdapter`-Provider-Vertrag |
| [token-meter.md](token-meter.md) | unveränderliche skalare und positionale Replay-Messungen mit Revisionen des konsumierten Logs |
| [scope.md](scope.md) | gescopte Registrierungsidentität, Dispatch-Träger und den eigenen `Scope`-Kontext |
| [typert.md](typert.md) | Remote-Invocation-Deskriptoren, Lookup-/Context-Deklarationen, Typert-Registries und die Grenzen von Host Gateway/Client API |
| [goal.md](goal.md) | persistierte Goal-Identität, Lifecycle-Snapshots, Aktivierung, Änderungsrecords und Runden-Zuordnung |
| [schedule.md](schedule.md) | Host-eigene Reminder-Records, dauerhafte Übergänge, aktive und beendete Sichten und Zustellung in gewöhnlichen Konversationen |
| [todo.md](todo.md) | den Ganzlisten-Item-Typ des todo-Pakets, dauerhaftes Event-Eigentum und Projektion |
| [deliverables.md](deliverables.md) | was ein Turn dem Nutzer übergibt: `PresentedFile`-Lieferungen aus `present` und die Host-servierte `WorkspaceChangesSummary` geänderter Dateien aus Git-Snapshots |
| [commands.md](commands.md) | den Registry-Service für menschliche Befehle: Definitionen, Adapter-Discovery, direkte Invocation, Ergebnisse und Parsing-Sichten |
| [session.md](session.md) | den vollständigen Variantenkatalog von `SessionEventMap`, `TurnEndReason`, `deriveMessages()`, Execution Enclosure und Standalone-Events |
| [working-directory.md](working-directory.md) | Session-Ausführungsverzeichnisse, dauerhafte Änderungen, Wiederherstellung und Nutzerkontext |
| [worktrees.md](worktrees.md) | experimentelles Anlegen von Git-Branches und Checkouts unter bestehenden Berechtigungen |
| [persistence.md](persistence.md) | die Persistenz-Naht: `SessionPersistence`, der JSONL-Provider, `session/flush`, Crash-Recovery, `SessionHeader` |
| [settings.md](settings.md) | die Nutzereinstellungs-Naht: `SettingsNamespace`-Registrierung, geschichtete Auflösung (Defaults → Komposition `base` → Nutzerdokument), Owner-Scopes, Hot-Commits |
| [credentials.md](credentials.md) | die Credential-Naht: `CredentialRef`-Referenzen (niemals Werte) in der Konfiguration, Auflösung pro Operation, UI-sichere `CredentialInfo`, Provider-Quellenschichten |
| [session-query.md](session-query.md) | logische Records, begrenzte exakte Event-Reads, Beziehungsspuren, semantische Filter/Dokumente und Volltext-Ergebnisseiten |
| [feedback.md](feedback.md) | lebenszyklusgebundene Feedback-Records pro Nachricht, optimistische Versionen, Sidecar-Persistenz und den Host-Remote-Vertrag |
| [session-title.md](session-title.md) | dauerhafte Titel-Snapshots, zitierte Seq-Nummern der Quellnachrichten und den asynchronen Provider-Vertrag |
| [session-reference.md](session-reference.md) | strukturierte sitzungsübergreifende Referenzen: `SessionReferenceInput`/`Candidate`, vorbereitete Nachrichtenkontexte, die stabile Fehlertaxonomie |
| [system-prompt.md](system-prompt.md) | Kontext pro Assembly, Tool-Provider-Ergebnisse, Prompt-Abschnitte und kooperative Assembly |
| [tools.md](tools.md) | vollständige Felder von `ToolDefinition`, die Schema-DSL, `ToolExecution`/`ToolResult`, UI-Typen der Tool-Präsentation und die abgesicherte Ausführungspipeline |
| [mcp.md](mcp.md) | externe MCP-Verbindungen, gescopte Tools und Ressourcen, Server-Instruktionen, Protokollergebnisse und Konfigurationseigentum |
| [user-questions.md](user-questions.md) | die UI-gestützte Naht für menschliche Fragen/Antworten: `AskUserQuestionRequest`, Vokabular für Antworten/Optionen, Provider-API, Fehlertaxonomie |
| [approval.md](approval.md) | die Einmal-Naht für Nutzerfreigaben: `ApprovalRequest`, `ApprovalOutcome`, Policy pro Session, Audit-Events und Answerer-Verträge |
| [office-to-pdf.md](office-to-pdf.md) | autorisierte Office-zu-PDF-Konvertierung, native/WASM-Engines und begrenzte gemeinsame Wiederverwendung |
| [attachment.md](attachment.md) | dauerhafte Bildidentität und -metadaten, Validierungseingaben, verifizierte Reads und die `AttachmentStore`-Naht |
| [shell.md](shell.md) | die Shell-Executor-Naht: `ShellExecRequest`/`Spec`, `ShellRunResult`, Hintergrund-`ShellProcess`-Handles |
| [subprocess.md](subprocess.md) | die Subprozess-Naht: vollständig explizite `SubprocessSpawnSpec`, offsetbasierte Output-Reader, unklassifiziertes `SubprocessOutcome` und das verwaltete `DSH_*`-Umgebungsvokabular |
| [ssh.md](ssh.md) | die POSIX-SSH-Verbindung und das entfernte Dateisystem, Subprozess- und Sandbox-Provider |
| [terminal.md](terminal.md) | persistente Terminal-Ids, Backend-/Session-Verträge, Sendebereitschaft, begrenzte Reads und eigentümersichtbare Snapshots |
| [sandbox.md](sandbox.md) | Policy-Auflösung pro Session und die Prozess-Isolations-Naht: Dateieffekt-Modi, Ausführungs-/Provider-Policies, `ConfinedArgv`, Durchsetzung und fail-closed-Fehler |
| [ptc-runtime.md](ptc-runtime.md) | die PTC-Ausführungsnaht: `PtcRunRequest`/`Result`, Binding-Namespaces, erfasste Logs, die `PtcRunFailure`-Taxonomie |
| [computer-use.md](computer-use.md) | exklusive Registrierung benannter Computer-Use-Provider und Integrationsvarianten des Cua Driver |
| [browser-use.md](browser-use.md) | exklusive Registrierung benannter Browser-Use-Provider, Provider-Varianten und Browser-Eigentum pro Session |
| [extensions.md](extensions.md) | versionierte dynamische Cordis Plugins und Packages, Host-/Client-Aktivierung, Freigabe, Laufzeitinspektion und Lifecycle-Abbau |
| [filesystem.md](filesystem.md) | die Dateisystem-Naht: `FsTarget`, Read-/Write-/Edit-Ergebnisse, beobachteter Dateizustand, `FsErrorCode` |
| [lsp.md](lsp.md) | die LSP-Navigationsnaht: `LspQueryRequest`/`Result`, `LspProvider`/`Service`, vier Operationen, `LspError` |
| [skills.md](skills.md) | den Skill-Service: Discovery-Priorität, `SkillSummary`/`SkillDefinition`, Session-Präfix-Katalog, modellseitiges Laden von `skill` |
| [compaction.md](compaction.md) | die Compaction-Naht: die `compaction/*`-Session-Events, `CompactionResult`, das `CompactionEngine`-Interface |
| [subagent.md](subagent.md) | die Subagent-Naht: die Registry benannter Provider, `SubagentStartRequest`/`Result`/`Run`, die Aufteilung zwischen Startzeit- und Laufzeitfähigkeiten |
| [voice-input.md](voice-input.md) | experimentelle benannte Erkenner, transientes Audio und revisionsgesicherte Einfügung von Entwürfen |
| [translation.md](translation.md) | experimentelle anonyme Textübersetzung und explizite Provider-Anfragen |
| [agent-team.md](agent-team.md) | Agent Teams: implizite Lead-Identität, benannte fortsetzbare Teammitglieder, direkte Zustellung in Peer-Inboxen und gemeinsamer Task-DAG |
| [claude-code-mods.md](claude-code-mods.md) | Claude-Code-Mods über die experimentelle Brücke: jedes Event, jedes `$`-Member, die Kettenregel, das Zeichen-Feature und ein Beispiel-Mod, das von Claude Code abweicht |
| [web.md](web.md) | die Web-Zugriffsnaht: `WebSearchRequest`/`Result`, `WebFetchRequest`/`Result`, `WebFetchBody`, Provider-Verfügbarkeit, `WebError` |
| [spill.md](spill.md) | die Spill-Speichernnaht: `SaveTextSpill`, `SpillOwner`/`SpillSource`, `SpillRef`, der gebrandete `SpillLocator` |
| [workflow.md](workflow.md) | die Workflow-Naht: `WorkflowStartRequest`, `WorkflowMeta`, `WorkflowRun`/`Result`, die `workflow/*`-Event-Payloads, die Fatality von `WorkflowError` |
| [jobs.md](jobs.md) | die Hintergrundjob-Laufzeit: gebrandete `JobId`s, der Producer-Vertrag, Consumer-Sichten und das Verhalten des `ctx.jobs`-Service |
| [permission-presets.md](permission-presets.md) | die Schicht der Berechtigungs-Presets: `PresetSpec`/`PresetOption`, der abgeleitete `custom`-Zustand, das nur protokollierte `permission/preset`-Event |
| [plan.md](plan.md) | Plan-Modus: der nur protokollierte `plan/mode`-Zustand, das Flush ausstehender Auswahl, `PlanModeConfig`, der `exit_plan_mode`-Review-Bogen |
| [web-server.md](web-server.md) | den HTTP-Träger: `WebRouteKind`/`WebRoute`, Match-Reihenfolge, den beanspruchbaren Fallback-Platz, Index-Taps |
| [webhook.md](webhook.md) | authentifizierte Provider-Zustellungen, beliebige programmatische Regeln und Fire-and-Forget-Erzeugung von Workspace-Sessions |
| [storage.md](storage.md) | das Storage-Subsystem: den Backend-Vertrag (`StorageBackend`), `StorageForms`, `DomainSpec`/`Domain`, `domain/changed` |
| [workspace.md](workspace.md) | die Workspace-Registry: `Workspace`/`WorkspaceId`, Registrierung und Auflösung, die Beziehung zum Session-`cwd` |
| [web-client.md](web-client.md) | die Browser-Architektur: Boot, Remote-Kommunikation, gepaarte Client-Modelle, UI-Adapter, Conversation-Assembly, Slots und Reconnect-Semantik |
| [client-modules.md](client-modules.md) | die Web-Plugin-Tabelle: `dsh.client`-Deklarationen, Wire-Komposition von `WebBootGraph`, die Bundle-Route und der Index-Tap |
| [slots.md](slots.md) | typisierte Web-UI-Komposition: Eigentum an Deklarationen, Kardinalität und Scope, Framework- und Feature-Injektion, Props-Ableitung und die ausgelieferte Hierarchie |
| [client-resources.md](client-resources.md) | das Client-Ressourcenmodell: `dsh-resource://<type>/…`-Adressen, Protokoll-Provider und `ResourceProtocolMap`, der globale Hook `useResource` und seine Zustände, Pins und Freigabe |
| [sidebar-right.md](sidebar-right.md) | die rechte Sidebar: Ressourcen- und Navigationsadressen, Registrierung und Routing von Tab-Typen, der Navigationsservice `ctx.sidebarRight`, die Pane-Tab-Slots und Owner-Props, das Ressourcenmodell und der Workspace-Files-Service |
| [conversation.md](conversation.md) | zielneutrales Assembly von Session-Events: Context-Identität, Location-Daten, Replay-Pfade, View-Builder und zieleigene Render-Knoten |
| [session-projection.md](session-projection.md) | die Projektionsnaht: `SessionProjectionMap`, die reine `ProjectionDefinition`-Unit, der konsistente Schnitt von `ProjectionSnapshot`, der Änderungsfeed |
| [session-telemetry.md](session-telemetry.md) | die Naht für die ausgehende Session-Reporting-Fähigkeit: `SessionTelemetryRecord`/`SessionTelemetrySeverity`, der `SessionTelemetrySink`-Vertrag und der Redact-Waterfall von `session-telemetry/record` |
| [otel.md](otel.md) | gemeinsame OTLP-Kanäle für gewöhnliche Events und Session-Logs |
| [product-telemetry.md](product-telemetry.md) | explizite Übermittlung von Produktanalysen und OTLP/HTTP-Transport |

> Typdeklarationen und ihre JSDoc auf diesen Seiten sind quelltextäquivalent und werden von `pnpm run verify-type-equiv` auf Drift geprüft (siehe [development.md](../development.md#documenting-types-verbatim-ts-type-equiv)). Gewöhnliche Blöcke bewahren vollständige Deklarationen; `public-api`-Blöcke bewahren um den Rumpf gekürzte öffentliche Klassendeklarationen. Cordis-Services und -Events verwenden den generierten Abschnitt **Cordis API** der jeweiligen Seite.
