# DeepSeek Harness Architecture

English | [中文](architecture.zh.md)

Vor Änderungen unter `packages/` lesen. Cordis-Kenntnisse werden vorausgesetzt; andernfalls mit dem [Primer](cordis-primer.md) oder dem [Tutorial](cordis-tutorial/index.md) beginnen.

## Cordis

[Cordis](cordis-primer.md) ist das Framework unterhalb von dsh: Plugins steuern Services, typisierte Events und umkehrbare Effects zu einem gemeinsamen Context bei. Jeder Teil des Produkts ist ein Plugin, einschließlich Model-Adapter, Tool-Registry, Session-Log und des Agent-Loop selbst, sodass jeder Teil über die Konfiguration austauschbar ist.

Es gibt keinen privilegierten Kern zum Patchen: dsh wird erweitert, indem ein Plugin neben die anderen gemountet wird, und Registrierungen sind Effects, die zurückrollen, wenn ihr Plugin entladen wird.

## Profiles und Bundles

Ein laufendes `dsh` ist ein Plugin-Baum, der beim Boot aus geordneten Schichten zusammengesetzt wird.

Ein **Profile** ist eine benannte Komposition, die im Harness-Home gespeichert ist. Es listet die Bundles, die es stapelt, hält alle Out-of-Tree-Plugins, die es installiert, und bewahrt die eigene `cordis.patch.yml` des Nutzers auf. `web`, `headless`, `sdk`, `sdk-minimal` und `acp` werden als Templates mitgeliefert.

Ein **Bundle** ist ein Distributionsformat für Cordis-Config-Rows und den Code, den sie mounten, sodass alles, was es einfügt, durch die darüberliegenden Schichten patchbar bleibt.

Jedes deklariert sich in seiner eigenen `package.json` unter einem Feld `dsh`: `dsh.profile` listet die Bundles eines Profile, und `dsh.bundle` verweist auf die Patch-Datei eines Bundle.

[`dsh-base`](../packages/bundle/base/README.md) ist die gemeinsame erste Schicht der Profile `web`, `headless`, `sdk` und `acp`: Model-Adapter, Tools, Persistenz, Sandbox- und Freigabe-Policy, Settings, Credentials, Telemetrie. [`dsh-web-app`](../packages/bundle/web-app/README.md) ergänzt die Browser-Anwendung, [`dsh-headless`](../packages/bundle/headless/README.md) ergänzt einen One-Shot-Runner ohne Server, [`dsh-sdk-app`](../packages/bundle/sdk-app/README.md) ergänzt den SDK-JSON-RPC-Server, und [`dsh-acp-app`](../packages/bundle/acp-app/README.md) ergänzt den reinen Automatisierungs-ACP-Server. [`dsh-sdk-minimal`](../packages/bundle/sdk-minimal/README.md) ist die bewusste Ausnahme: Ein Bundle besitzt seinen vollständigen expliziten SDK-Baum und wendet `dsh-base` nicht an.

Die Schichten werden auf eine leere Entry-Liste angewendet: die geordneten Bundles des Profile, seine `cordis.patch.yml`, der Home-Patch und dann die `--patch`-Overlays. Ein Patch adressiert eine Row über ihre Id und ersetzt deren gesamte Config oder fügt neue Rows ein. Ein `preset`-Patch wendet diese Operationen innerhalb von `config.plugins` dieser Deklaration an, mit derselben Schichtpräzedenz.

YAML steuert HMR: Base aktiviert das config-only `dsh-hmr`; headless, SDK und ACP deaktivieren es; `sdk-minimal` lässt es weg. Profile-Patches überschreiben diese Defaults. HMR koordiniert Watching und Reloads; der Launcher liefert Profile-Daten und Readiness.

Base enthält den [Plugin Manager](../packages/boot/plugin-manager/README.md) für Web und Agents.

Um den Baum zu sehen, den die eigene Maschine bootet:

```sh
dsh --profile web --dump-config
```

Jede Row, die ausgegeben wird, kann durch einen eigenen Patch ersetzt werden.

Die Mechanik der Komposition steht in [app-boot](../packages/boot/app-boot/README.md#profiles); die Config-Felder stehen im generierten [Config-Katalog](config-catalog.md).

## Start von Anwendungen

Unterstützte Node-Anwendungen starten über benannte `dsh`-Profiles. Die mitgelieferten Profile sind `web`, `headless`, `sdk`, `sdk-minimal` und `acp`, ausgewählt mit `dsh --profile <name>` oder `dsh <name>`. `plugin` benennt den Management-Befehl; ein Profile mit diesem Namen erfordert `--profile plugin`. Das TypeScript-SDK löst seine gleichversionierte Abhängigkeit `dsh` auf und wählt `sdk`; benutzerdefinierte Plugin-Komposition bleibt ein Profile plus geordnete Patch-Dateien, kein weiteres Executable und kein Inline-Anwendungsbaum. `sdk-minimal` ist ein repository-eigenes Standalone-Bundle hinter demselben Launcher, kein vom Aufrufer gelieferter Cordis-Baum.

Vendored CLIs, reine Build- und Test-Executables, direktes In-Process-Plugin-Mounting und die private Browser-WebWorker-Preview sind keine Harness-Anwendungs-Launcher. [`verify-application-entrypoints`](../scripts/verify-application-entrypoints.ts) hält jedes Paket-Bin, jede ausführbare Quelle, jede Root-Demo sowie die Root-Scripts `start:web` und `dev:web` in einer expliziten Klasse und weist einen Node-Anwendungspfad zurück, der `dsh` umgeht.

Das Python-SDK folgt derselben Anwendungsarchitektur. Sein Runtime-Wheel paketiert die normale `dsh`-CLI als `deepseek-harness-sdk-runtime-<platform>-<arch>`, und der Client startet `dsh --profile sdk` standardmäßig mit einem expliziten Harness-Home. Das minimale Beispiel wählt das mitgelieferte Profile `sdk-minimal`. Python exponiert Profile-Auswahl und geordnete Patch-Dateien statt eines vollständigen Cordis-Baum; persistente externe Plugins werden über `dsh plugin` installiert. Der entfernte private Direct-Config-Carrier hat kein Kompatibilitäts-Bin und keinen Fallback-Parser.

## Desktop-Anwendung

Die [Electron-Desktop-Anwendung](../apps/desktop/README.md) liefert ihre exakte dsh-Produktions-Runtime in signierten Ressourcen aus und besitzt das reservierte `$DSH_HOME/profiles/desktop`. Gemeinsame Helper initialisieren Profile-Dateien, gleichen Bundles ab und lösen Installations- und Bundle-Abhängigkeiten auf, ohne pnpm-eigene Pakete zu ersetzen. Desktop und npm-CLI teilen Produktdaten, halten aber Pakete, Aktivierung und Lockfiles getrennt. Die mitgelieferte CLI von Desktop verwaltet seine initialisierten Plugins.

Electron startet den privaten Desktop Host im Electron-Node-Modus. Der Host ruft den gemeinsamen CLI-Profile-Runner und die vollständige Web-Anwendung auf. Das Fenster lädt sofort die paketierten Web-Assets und wartet auf Boot-Injections, bevor es Client-Plugins im selben Dokument aktiviert. Web besitzt RPC und Streams; der Desktop-Carrier verbindet die lokale Seite mit dem authentifizierten Host. Node-IPC transportiert Boot-Injections, Readiness, fatale Fehler und Shutdown. Desktop lauscht standardmäßig auf einem vom OS zugewiesenen Port; die Profile-Konfiguration kann ihn überschreiben. Die Shell-eigene UI führt Plugin-Transaktionen über das mitgelieferte pnpm mit normaler Nutzer- und Profile-Konfiguration aus.

## Core-Pakete

| Paket | Besitzt | `ctx`-Key |
|---|---|---|
| [`core/session`](subsystems/session.md) | Das append-only-Log `SessionEvent` und den In-Memory-Store | `ctx.sessions` |
| [`core/system-prompt`](subsystems/system-prompt.md) | Assembly von Prompt-Abschnitten und Tool-Schemas | `ctx.systemPrompt` |
| [`core/tools`](subsystems/tools.md) | Die gescopte Tool-Registry und die abgesicherte Ausführungs-Pipeline | `ctx.tools` |
| [`core/agent`](subsystems/core.md) | Die Schnittstelle `Agent`, die Live-Registry und die Events `agent/*` | `ctx.agents` |
| [`core/agent-loop`](subsystems/core.md) | Den Default-Driver, der diese Schnittstelle implementiert | `ctx.agentLoop` |
| [`core/scope`](subsystems/scope.md) | Das Primitive für gescopte Registrierung pro Agent | Library, kein Key |
| [`llm/llm`](subsystems/llm-streaming.md) | Nachrichten- und Stream-Vokabular plus die Adapter-Seam | `ctx.llm` |

## Events

Events sind die Erweiterungspunkte, und die Wahl der richtigen Domäne ist die erste Entscheidung bei den meisten Änderungen.

- **Session-Events** sind dauerhafte Fakten, die an das Log angehängt und über `session/event` gebroadcastet werden. Eines verwenden, wenn der Fakt einen Reload überleben muss.
- **Agent-Events** (`agent/*`) tragen einen Live-`Agent`: Inbox, Step, Status, Request, Validierung, Continuation. Eines verwenden, um Arbeit im Flug zu beobachten oder abzufangen.
- **Capability-Events** hängen Policy und Adapter an eine Seam an (`fs/*`, `tools/*`, `telemetry/*`), ohne den Loop zu importieren.

AgentLoop wartet auf das serielle `agent/created` vor eingeordneter Arbeit und rollt eine fehlgeschlagene Initialisierung zurück. Das Unload behält Ressourcen bis zum Agent-Teardown; [agent-loop](../packages/core/agent-loop/README.md#understand-the-implementation) definiert die Reihenfolge.

Die [Event-Map](event-producer-consumer.md) listet die Produzenten und Konsumenten jedes Events.

## Turn-Ablauf

Ein **Step** ist ein Model-Request plus die Tools, die er aufruft. Ein **Turn** umfasst null oder mehr Steps: Er öffnet, bevor sein erster Input beansprucht wird, und schließt, sobald nichts mehr offen ist.

```text
turn/start
  claim next-step input plus one queued message
  assemble prompt sections + tool schemas
  -> agent/pre-step; project runtime context at fallback
                                     reject | enter(messages, startsRequestSeries?)
     reject, or a first enter rewritten empty -> close the turn with no step
     step/start
     agent/request -> prepareCall (cancellation commits neither system nor users)
     reconcile system/message using the prepared call capability
     append entered messages as user/message; reconcile retained runtime context
     log request/header and request/context as needed
     derive and freeze model history from the log
     stream the bound prepared call -> llm/stream -> agent/assistant-stream start
       agent/assistant-stream chunk*
       assistant/message | assistant/attempt -> agent/assistant-stream end
     tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
     step/end
     tools owe another request, or next-step input arrived -> claim -> next step
  -> agent/turn-stopping
turn/end
```

`turn/*`, `step/*`, `system/message`, `user/message`, `assistant/message`, `assistant/attempt` und `tool/*` sind dauerhafte Session-Events; der Rest sind Live-Erweiterungspunkte über drei Domänen. `agent/assistant-stream` veröffentlicht prozesslokale Start-, transiente Chunk- und End-Frames. Der Loop committet den vollständigen kompakten Stream als eine Nachricht oder als log-only-Versuch vor einem committeten End-Frame, und der Web-Session-Follow-Adapter ist der einzige Remote-Konsument des Live-Events. `agent/pre-step`, `agent/request`, `llm/stream` und die drei `tools/*`-Events sind Waterfalls, deren Listener `next()` aufrufen müssen, um zu delegieren; `agent/turn-stopping` ist serial und hat kein `next()`.

Eine Inbox speist den Driver; injizierter Context wartet auf eine weckende Nachricht. Die dauerhafte Projektion `inbox` von AgentLoop exponiert ausstehenden Input ohne Live-Agents.

`agent/pre-step` entscheidet über den akzeptierten Input. Listener dürfen beanspruchte Nachrichten umschreiben oder zurückweisen; eine zurückgewiesene oder leere erste Beanspruchung schließt einen dauerhaften Turn ohne Step. Eine Enter-Entscheidung darf `startsRequestSeries` setzen: Der Loop loggt einen frischen `request/header` (Grund `series`, oder `change` mit `startsSeries: true`, wenn sich auch der Envelope geändert hat). Umhüllende Listener bewahren diese Deklaration mit `{ ...decision, messages }`. Nach der Assembly und `step/start` lösen `agent/request` und `prepareCall()` die tatsächliche Route auf, bevor der System-Prompt und akzeptierte User committet werden; eine Cancellation während einer der beiden asynchronen Phasen committet keines von beiden. Prepared-Call-Capabilities bestimmen die Prompt-Admission, nicht das vorausgehende `request/context`. Jeder Versuch aktualisiert registrierte Runtime-Fakten, gleicht den gebundenen Prompt ab, lässt User einmal zu, stellt entfernten Runtime-Context wieder her, loggt Header/Context nach Bedarf und friert den Request ein, bevor der gebundene Aufruf gestreamt wird. Wiederholungen wiederholen weder Assembly noch `agent/pre-step`. Surface-Ersetzungen und Image-Offload-Entscheidungen nach dem Attachment starten eine neue Request-Series, auch während des ersten fortgesetzten Pre-Step; ein unverändertes Resume setzt die Series fort. Der erste zugelassene Step reserviert den System-Kopf vor den User-Nachrichten, selbst bei einem leeren Prompt (keine Wire-Nachricht). Der Prompt reist nur als Historie `system/message`: Ein leeres Rendering löscht alle aktiven System-Knoten und lässt keinen alten Prompt model-sichtbar zurück; fähige Routen hängen nicht-leere Aktualisierungen nach der gecachten Historie an, einschließlich unterstützter Tool-Aktualisierungen; unfähige Routen und neue Request-Series konsolidieren nicht-leeren Prompt-Text am ersten System-Knoten, mit geloggten leeren Ersetzungen für nicht-leere spätere System-Knoten ([Entscheidung](../.agents/notes/implemented/architecture/2026-09-02-system-prompt-as-surface-node.md); [Entscheidungsregel](../packages/core/agent-loop/README.md#understand-the-implementation)).

Der Loop sendet unveränderliche Requests mit Live-Cancellation und verwendet Freeze-Evidenz für eingefrorene Identitäten wieder; [agent-loop](../packages/core/agent-loop/README.md) besitzt Konstruktion und Cancellation-Ursachen.

Fehlgeschlagene Steps [zeichnen fehlende Tool-Results auf](../packages/core/agent-loop/README.md#understand-the-implementation).

Details: das [Sequenzdiagramm](agent-lifecycle.md), die [Tool-Pipeline](tool-execution-pipeline.md) und [Cancellation und Fehlerwiederherstellung](subsystems/core.md#the-agent-handle).

## Session-Log

Das Session-Log ist die Quelle des Context, den das Model sieht. `deriveMessages()` projiziert die Model-Historie daraus. Jede `assistant/message` bettet den exakten kompakten, mit Zeitstempeln versehenen Stream ein, der ihren zusammengesetzten Inhalt erzeugt hat; `assistant/attempt` behält abgeschlossene fehlgeschlagene, wiederholte, abgebrochene und mit Stream-Fehler behaftete Versuche, ohne Model-Historie hinzuzufügen. Fork, Resume, Transkripte, Telemetrie und Persistenz leiten sich alle aus diesen dauerhaften Settlements ab, während die Live-Inkrementalität der UI aus `agent/assistant-stream` kommt; ein harter Prozessverlust vor der Settlement hinterlässt keinen dauerhaften Attempt-Stream ([Entscheidung](../.agents/notes/implemented/architecture/2026-09-01-v2-embedded-assistant-streams.md)).

Session-Konsumenten kennen nur das aktuelle logische Format. Header-only-`stat` und -`list` scannen jedes Session-Verzeichnis neu, wählen dessen numerisch höchste kanonische Generation und übersetzen einen unterstützten historischen Header, ohne Events zu laden oder einen Nachfolger zu veröffentlichen. Ein `open` einer gespeicherten Session wählt dieselbe Generation, weist eine zukünftige Version zurück oder dekodiert und komponiert die statische angrenzende Migrationskette einmal, bevor validierte aktuelle logische Events zurückgegeben werden. Ein lesendes Open verwendet dieses In-Memory-Ergebnis, ohne einen Nachfolger zu veröffentlichen; ein schreibendes Open kodiert, verifiziert und veröffentlicht zuerst exklusiv den finalen version-benannten Nachfolger neben der unveränderten Quelle. Die gewöhnliche Reparatur eines nicht versiegelten unterbrochenen Tails bleibt Aufgabe eines Handle-Konsumenten; die Migration fügt ein fehlendes unterbrochenes `turn/end` nur für den begrenzten freigegebenen Neustart ein, der bereits durch ein späteres `turn/start` versiegelt wurde. JSONL v0 verwendet `session.jsonl[.zstd]`, v1 und später verwenden kleingeschriebenes `session.vN.jsonl[.zstd]`, und committete Generation-Pfade werden nie umbenannt, ersetzt oder gelöscht. Der JSONL-Provider besitzt physisches Framing, Kompression, Generation-Auswahl und exklusive Veröffentlichung, während jedes angrenzende Migrationspaket genau einen Schritt `vN -> vN+1` besitzt ([Entscheidung](../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.md)).

**Model-sichtbar bedeutet geloggt.** Jeder Model-Request muss aus dem Log rekonstruierbar sein. Neue model-sichtbare Inputs erfordern Session-Events. Plugins, die bestehenden Nachrichteninhalt ändern, registrieren [reine Message-Projektionen](subsystems/session.md#plugin-owned-message-projections); abgekoppelte Reader liefern dieselben Definitionen explizit. Tool-Änderungen sind capability-unabhängig; die [Session-Tool-Historie](../packages/core/session/README.md) liefert Provider-Deklarationen.

**Projection-Seam.** `dsh-session-projection` besitzt `ctx.sessionProjections`: registrierte Units falten committete Events inkrementell, Host-Konsumenten lesen einen typisierten State mit `stateOf()`, und Carrier batchen zugeschnittene Client-Views mit `snapshot()`. Ein Host-Reader benötigt diesen Service entweder während der Aktivierung oder schlägt explizit fehl, wenn die Registry oder ein erforderlicher Key fehlt. Beitragende dürfen die Registrierung `ctx.inject(['sessionProjections'], ...)` behalten, ohne still einen fehlenden Host-Wert zu defaulten. Der Agent-Loop registriert den gemeinsamen State `turnBoundary` für seine Reader ([Entscheidung](../.agents/notes/implemented/architecture/2026-08-19-session-projection-mandatory-seam.md)).

[Working Directories](subsystems/working-directory.md) liefern Nutzer-Context und Ausführungspfade, ohne die ursprüngliche Projektidentität, Sandbox-Write-Roots oder bestehende Prozessverzeichnisse zu ändern.

## Capability-Seams

Eine **Seam** ist eine austauschbare Capability mit drei Rollen: eine **Service Definition**, die die Schnittstelle deklariert, ein **Service Provider**, der sie implementiert, und ein **Consumer**, der sie nutzt, üblicherweise ein model-zugewandtes Tool. Ein Paket darf Rollen kombinieren, aber eine einzelne Rolle ist keine Seam; das Hinzufügen einer Capability bedeutet, alle drei zu entwerfen ([Capability-Graph](capability-seams.md)).

Seams sind der Grund, warum ein Provider-Austausch das ganze Produkt verändert. Filesystem- und Subprozess-Provider teilen eine Ausführungswelt, sodass ihre Ausrichtung auf eine Remote-Sandbox Bash, PTY und LSP mitnimmt, ohne Provider-Forks. [Subagent-Provider](subsystems/subagent.md) variieren ebenso breit hinter einer Schnittstelle, von einem frischen Child-Agent bis zu einem delegierten Turn in einem anderen Produkt.

[Experimentelle Agent Teams](subsystems/agent-team.md) exponieren optionale Koordination über `ctx.agentTeams` mit dauerhaftem Roster- und Task-State sowie direkter Inbox-Messaging über fortsetzbare Subagents.

## Wohin neues Verhalten gehört

Neues Verhalten hängt an einem dokumentierten Erweiterungspunkt. Eine Änderung des Loop selbst aktualisiert diese Map.

| Ziel | Mechanismus |
|---|---|
| Einen Model-Provider hinzufügen | seinen Adapter auf `ctx.llm` registrieren |
| Eine model-zugewandte Capability hinzufügen | auf `ctx.tools` registrieren; sein Schema geht in die Prompt-Assembly ein |
| Einer Session eine andere Capability-Menge geben | ein Agent-Preset komponieren; eine Service-Row darin benötigt ein `isolate`-Realm |
| Shell-Ausführung hinzufügen | ein Backend `ctx.shell` registrieren; das lokale spawnt über `ctx.subprocess` |
| Persistente Terminal-Ausführung hinzufügen | ein Backend `ctx.terminals` plus `dsh-tool-terminal` registrieren |
| Einen Human-Command hinzufügen | auf `ctx.commands` registrieren; er dispatcht ohne Model-Turn |
| Background-Jobs verwalten | auf `ctx.jobs` registrieren; die Tools `job_*` lesen oder stoppen Jobs |
| Eine Session aus einem externen Webhook starten | eine vertrauenswürdige Regel auf `ctx.webhookRuntime` registrieren und einen Provider-Adapter mounten |
| Filesystem-Zugriff oder -Policy hinzufügen | einen Provider `ctx.fs` registrieren oder auf Events `fs/*` hören |
| Gespawnte Prozesse einschränken | ein Backend `ctx.sandbox` verwenden; Konsumenten umhüllen argv vor dem Spawn |
| Einen Request, ein Tool oder einen Turn abfangen | dessen Event `agent/*` oder `tools/*` verwenden; `agent/turn-stopping` stoppt einen Turn |
| Model-zugewandten Context hinzufügen | `agent.inject()` aufrufen; er landet im nächsten zugelassenen Request |
| UI- oder Editor-Integration hinzufügen | `ctx.agents` treiben und aus `session/event` rendern |
| Einen Web-Client-Chat-Knoten hinzufügen | einen `ConversationNodeDefinition` + keyed Renderer registrieren |
| Dauerhaften Session-State hinzufügen | `SessionEventMap` erweitern; aus dem Log rendern und replayen |
| Session-Titel generieren | den einzigen Provider `ctx.sessionTitle` registrieren |
| Ein Ziel in derselben Session verwalten | `ctx.goals` verwenden; über `agent/*` fortsetzen |
| Eine Session an einer Turn-Grenze forken | `ctx.agents.create({ sessionId, seed, meta: { parentSession, seedLength } })` — nur von agent-loop veröffentlichte Sessions persistieren |
| Sessions in einem neuen Backend speichern | `SessionPersistence` (`create`/`open`/`stat`/`list`/`export`) über dem gemeinsamen Handle-Scaffolding implementieren |
| Eine Registrierung auf einen Agent scopen | `agent.ctx` dieses Agent verwenden |

Das [Extension-Cookbook](cookbook/extension-cookbook.md) mappt Features auf Capabilities und indexiert die Schritt-für-Schritt-Anleitungen für [Pakete](cookbook/adding-a-package.md), [Tools](cookbook/adding-a-tool.md), [LLM-Adapter](cookbook/adding-an-llm-adapter.md) und [Settings-Seiten](cookbook/adding-a-settings-card.md). Das [Conversation-Subsystem](subsystems/conversation.md) besitzt die Chat-Knoten-Assembly.
