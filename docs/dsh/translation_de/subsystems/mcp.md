# MCP

English | [中文](mcp.zh.md)

## Zusammenfassung

Das Model Context Protocol (MCP) verbindet das Modell mit Tools, die von externen Servern bereitgestellt werden. Jeder konfigurierte Server steuert gewöhnliche Harness-Tools bei — mit Abbruch, Berechtigungsprüfungen, aufgezeichneten Ergebnissen und unterstützter Bildausgabe. Gemeinsame Tools entdecken und lesen Ressourcen, wenn ein Server im Scope des Aufrufers konfiguriert ist, während Server-Anweisungen in den protokollierten System-Prompt eingehen. Das offizielle SDK handelt moderne oder unterstützte ältere Protokollrevisionen aus. Diese Referenz behandelt Verantwortlichkeiten, Scope und Kompositionsentscheidungen der MCP-Paketgruppe; das [Client-README](../../packages/mcp/mcp-client/README.md) besitzt die Serverkonfiguration.

## Inhaltsverzeichnis

- [Konfiguration](#configuration)
- [Verantwortlichkeiten und Scope](#responsibilities-and-scope)
- [Protokoll und Ergebnisse](#protocol-and-results)
- [Ressourcen und Anweisungen](#resources-and-instructions)
- [Typen von Ressourcen-Providern](#resource-provider-types)
- [Grenzen](#limits)
- [Weiterführende Literatur](#further-reading)

-----

<a id="configuration"></a>
## Konfiguration

MCP-Server sind opt-in. Pro Server einen `@deepseek-ai/dsh-mcp-client`-Eintrag im vorgesehenen Cordis-Scope konfigurieren. Jedes ausgelieferte Profil stellt die [Tool-Registry](tools.md) bereit und mountet den gemeinsamen Ressourcen-Dienst einmal; Nutzer konfigurieren nur Client-Einträge. Aufrufer ohne sichtbaren konfigurierten Server erhalten weder MCP-Prompt-Text noch Tools im nativen oder PTC-Modus.

| Wahl | Eigentümer der Konfiguration |
|---|---|
| Serveridentität, lokaler Prozess oder HTTP-Endpunkt, Credentials und Prozessumgebung | [Client-Konfiguration](../../packages/mcp/mcp-client/README.md#use-this-package) |
| Timeout für Tool- und Ressourcenanfragen, Richtlinie bei Startfehlern und Wiederverbindung | [Client-Konfiguration](../../packages/mcp/mcp-client/README.md#use-this-package) |
| Ressourcen-Entdeckung und -Lesen | Der [MCP-Ressourcen-Dienst](../../packages/mcp/mcp-resources/README.md#use-this-package) ist in ausgelieferten Profilen enthalten; er hat keine Konfigurationsfelder |
| Größengrenze für Server-Anweisungen | Client-`maxInstructionBytes`; die Komposition liefert die [System-Prompt-Zusammenstellung](system-prompt.md) |
| Berechtigungsentscheidungen und unterstützte Bildausgabe | [Tool-Ausführung](tools.md) und [Attachments](attachment.md) |

Die Protokollaushandlung folgt den unterstützten Revisionen des SDK; es gibt keine Produkteinstellung, die eine Protokollrevision erzwingt. Der [Konfigurationskatalog](../config-catalog.md#deepseek-aidsh-mcp-client) listet akzeptierte Client-Felder und Standardwerte.

-----

<a id="responsibilities-and-scope"></a>
## Verantwortlichkeiten und Scope

Der Client ist ein Verbindungs-Plugin pro Server und ein Consumer der Harness-Tool-Registry. Er veröffentlicht keinen gemeinsamen Dienst `ctx.mcp`. Der externe Server implementiert MCP-Operationen; das SDK besitzt den Protokollaustausch; der Client passt entdeckte Tools an die Harness-Ausführung an.

`mcp-resources` besitzt die gemeinsamen Ressourcen-Tools und wählt Provider im Scope des Aufrufers aus. Jeder MCP-Client liefert Ressourcenoperationen über seine eigene Verbindung. Der erste Provider in einem Scope aktiviert die lokalen gemeinsamen Tools, und das Entfernen des letzten entfernt sie; geerbte Provider bleiben sichtbar. Der Dienst besitzt diese Tool-Registrierungen unabhängig von einem einzelnen Client. Verbindungsfehler entfernen die gemeinsamen Ressourcen-Tools nicht, solange ein sichtbarer Client-Eintrag aktiv bleibt.

Ein konfigurierter `serverName` identifiziert einen Server in seinem Registrierungs-Scope. Zwei Einträge in diesem Scope können nicht denselben Namen reservieren; getrennte Agent-Scopes können ihn wiederverwenden. Öffentliche Tool-Namen enthalten den konfigurierten Servernamen, sodass gleich benannte Tools verschiedener Server unterscheidbar bleiben. Registrierungseffekte besitzen Namen und entdeckte Tools; die Entsorgung des Plugins schließt die Verbindung und entfernt seine Beiträge.

Der [native Cua-Driver-Provider](../../packages/experimental/computer-use-cua-driver-native/README.md) nutzt den exportierten Ergebnisadapter des Clients, ohne eine MCP-Verbindung zu öffnen. Die Auswahl des Desktop-Providers gehört zum [computer-use-Subsystem](computer-use.md).

-----

<a id="protocol-and-results"></a>
## Protokoll und Ergebnisse

Sowohl stdio als auch Streamable HTTP nutzen Aushandlung, Entdeckung, Protokollvalidierung und Abbruch des offiziellen SDK. Änderungen an der Tool-Liste lösen eine Entdeckung über Legacy-Benachrichtigungen oder eine moderne Subscription aus. Eine fehlgeschlagene Aktualisierung behält die vorherige Tool-Generation; die Wiederherstellung der Verbindung folgt dem [Client-Lifecycle](../../packages/mcp/mcp-client/README.md#use-this-package).

Der Ergebnisadapter behält kanonisches MCP-JSON für programmatische Aufrufer und bereitet gewöhnlichen Tool-Inhalt auf. Unterstützte Bilder nutzen das Attachment-System; nicht unterstützter Rich-Content erzeugt explizite Textdiagnosen. Die Tool-Registry bleibt für Richtlinienfehler und ersetzte Ergebnisse autoritativ. Die [Tool-Verträge](tools.md) besitzen Aufzeichnung und finale Darstellung; die [Client-Ergebnisreferenz](../../packages/mcp/mcp-client/README.md#use-this-package) besitzt die MCP-spezifischen Projektionsdetails.

-----

<a id="resources-and-instructions"></a>
## Ressourcen und Anweisungen

Ressourcenaufrufe erfordern einen explizit konfigurierten Servernamen. Wenn die System-Prompt-Zusammenstellung verfügbar ist, listet der Ressourcen-Dienst für den Aufrufer sichtbare Namen aus derselben Registry, die für den Dispatch verwendet wird — einschließlich Servern ohne Tools oder Anweisungen. Die gemeinsame Registry löst diesen Namen im Scope des aufrufenden Agent auf, bevor sie dispatcht; nicht verfügbare Server schlagen ohne Netzwerkanfrage fehl. Entdeckung und Lesevorgänge erfolgen bei Bedarf, auch für Server, die Ressourcen ohne Tools offenlegen. Das [Ressourcen-Paket](../../packages/mcp/mcp-resources/README.md) besitzt Paginierung und Inhaltsdarstellung; seine generierten Tool-Schemas liegen im [Tool-Katalog](../tool-catalog.md#deepseek-aidsh-mcp-resources).

Ressourcen-Provider bleiben verbindungsgebunden. Die Scope-Entsorgung entfernt Registrierungen; der MCP-Client steuert Abbruch und Wiederherstellung. Kanonische Ergebnisse behalten vollständiges JSON für programmatische Aufrufer, während die Textprojektion Binärblobs durch Beschreibungen ersetzt. Zurückgegebener Text geht in die gewöhnliche Tool-Historie ein; Inhalte werden nicht allein deshalb abgerufen, weil ein Server sich verbindet.

Wenn die System-Prompt-Zusammenstellung komponiert ist, veröffentlicht der Client nicht leere Server-Anweisungen als scoped, dem Server zugeordneten Abschnitt. Anweisungen bleiben wörtlicher Text und passieren die konfigurierte Größengrenze vor der Veröffentlichung. Eine Ersatzverbindung veröffentlicht Anweisungen erst, nachdem die Entdeckung erfolgreich war; fehlende Anweisungen fügen keinen Abschnitt hinzu. Das [system-prompt-Subsystem](system-prompt.md) besitzt Zusammenstellung und Aufzeichnung.

-----

<a id="resource-provider-types"></a>
## Typen von Ressourcen-Providern

Der Verbindungsprovider erhält eine Operation und die ursprüngliche Tool-Ausführung, einschließlich ihres Aufrufers und ihres Abbruchsignals.

```ts type-equiv
/** One supported resource operation, with server-owned cursors and URIs. */
type McpResourceRequest =
  | { method: 'resources/list' | 'resources/templates/list'; cursor?: string }
  | { method: 'resources/read'; uri: string }
```

```ts type-equiv
/** One configured server's resource access, owned by its MCP connection plugin. */
interface McpResourceProvider {
  /**
   * Run an operation against one live connection generation.
   * @param request - MCP resource method and parameters.
   * @param exec - caller identity and cancellation for this invocation.
   * @returns the protocol result as lossless JSON.
   */
  request(request: McpResourceRequest, exec: ToolExecution): Promise<JsonValue>
}
```

-----

<a id="limits"></a>
## Grenzen

MCP-Prompt-Templates, Elicitation für menschliche Eingaben, aufgabenbasierte Ausführung und Ressourcen-Subscriptions werden nicht unterstützt. Ressourcen-Tools erfordern einen für den Aufrufer sichtbaren konfigurierten Server; binäre Ressourcen bleiben programmatische Daten mit Textbeschreibungen für das Modell. Server ohne Tool-Capability verbinden sich mit einem leeren Tool-Set. Timeouts für Verbindung und Entdeckung folgen dem SDK; der Client hat dafür keine eigenen Einstellungen.

-----

<a id="further-reading"></a>
## Weiterführende Literatur

- [MCP-Paketgruppe](../../packages/mcp/README.md) — Einstiegspunkte der Pakete.
- [MCP-Ressourcen](../../packages/mcp/mcp-resources/README.md) — gemeinsame Tools und Semantik der Ressourcen-Provider.
- [Referenz zur Ressourcensichtbarkeit](../../packages/mcp/mcp-resources/README.md) — gemeinsames Profil-Mounting und Sichtbarkeit konfigurierter Server.
- [Drittanbieter-Memory-Server](../user/guide/mcp-memory.md) — Produktkonfigurationsanleitung.
- [Referenz zur Protokollaushandlung](../../packages/mcp/mcp-client/README.md) — SDK-Ownership und Kompatibilitätsentscheidungen.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generiert aus dem Quellcode durch `scripts/gen-cordis-catalog.ts` (per `pnpm run verify-cordis-catalog` in doc-sync auf Aktualität geprüft; Neugenerierung mit `pnpm run gen-cordis-catalog`) — die Sprachseiten unterscheiden sich nur in lokalspezifischen gepaarten Dokumentpfaden. Signaturblöcke verwenden einen `ts cordis-catalog`-Fence und behalten das ursprüngliche Quell-JSDoc; Dispatch-Modi sind im [primer](../cordis-primer.md#dispatch-modes) definiert, und die vom Framework geerbte `ctx`-API liegt in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmcpresources--mcpresourceruntime"></a>

### `ctx.mcpResources` — `McpResourceRuntime`

Scoped Ressourcenzugriff plus drei Tools, die von konfigurierten MCP-Servern gemeinsam genutzt werden.

```ts cordis-catalog
/**
 * Register one server and expose resource tools while that scope has providers.
 * @param server - configured server name, unique in this scope.
 * @param provider - connection-owned resource operations.
 * @returns the effect disposer for this exact registration.
 */
register(server: string, provider: McpResourceProvider): () => void
```

Quelle: [`packages/mcp/mcp-resources/src/index.ts`](../../packages/mcp/mcp-resources/src/index.ts)
<!-- END GENERATED cordis-surface -->
