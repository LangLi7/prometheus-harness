# Referenz: API- / GATEWAY- / HOST-Schicht und Host-Anwendung

## 0. Kopf

**Was diese Datei ist.** Eine vollständige, faktenbasierte Referenz der API-, Gateway- und Host-Schicht der
DeepSeek-Harness-Vorlage sowie der Host-Anwendung (`apps/cli`). Sie beschreibt das Wire-Protokoll, alle
Remote-/RPC-Methoden der Controller, das typert-Typprotokoll, die `host\*`-Pakete, die CLI-Oberfläche, das
Bundle-/Composition-Format und die ACP-/SDK-Oberflächen.

**Quelle (nur gelesen).** `C:\Users\Chang\harness\prometheus-harness` — TypeScript-Monorepo.
Maßgeblich sind die `src\`-Dateien; `lib\types\*.d.ts` und die generierten `lib\typert.*.js`/`.d.ts` wurden
nur zur Bestätigung exportierter Signaturen und generierter Metadaten herangezogen.

**Datum.** 2026-02-14 (Erstellungsdatum dieses Dokuments).

**Hinweis: read-only analysis.** Diese Datei ist reine Analyse. Am Quellbaum
`C:\Users\Chang\harness\prometheus-harness` wurde **nichts** geändert, erstellt oder gelöscht. Die einzige
Schreiboperation war das Anlegen dieser Datei. Die Ordner `docs\dsh` und `docs\design` wurden nicht geöffnet.

**Zählungen (Kurzfassung).**

| Größe | Anzahl |
| --- | --- |
| Abgedeckte Pakete | 25 (9 `api\*`, 9 `host\*`, 4 `typert\*`, 3 `sdk\*`) + `acp\acp` + `apps\cli` |
| Remote-/RPC-Methoden (7 Controller) | 70 |
| Launcher-CLI-Flags (`apps\cli`) | 8 |
| Remote-Fehlercodes (Wire) | 22 |

---

## 1. Das Wire-Protokoll

Quellen: `packages\api\gateway\src\stream-protocol.ts` (381 Zeilen),
`packages\api\gateway\src\remote-error-codes.ts` (37 Zeilen),
`packages\api\gateway\src\stream-server.ts` (444 Zeilen),
`packages\api\gateway\src\client\stream-client.ts` (480 Zeilen),
`packages\api\gateway\src\client\remote-events.ts` (341 Zeilen),
`packages\api\gateway\src\client\remote-stream.ts` (227 Zeilen),
`packages\api\gateway\src\client\journal-stream.ts` (580 Zeilen),
`packages\api\gateway\src\client\snapshot-stream.ts` (94 Zeilen),
`packages\api\gateway\src\types.ts` (180 Zeilen),
`packages\api\gateway\src\index.ts` (1575 Zeilen).

### 1.1 Transport und Route

| Konstante | Wert | Quelle |
| --- | --- | --- |
| `REMOTE_STREAM_MUX_PATH` | `/api/remote.mux` | `stream-protocol.ts:7` |
| `REMOTE_EVENT_STREAM_ENDPOINT` | `$events` | `stream-protocol.ts:10` |
| `REMOTE_EVENT_RESULT_ENDPOINT` | `$events/result` | `stream-protocol.ts:13` |
| `REMOTE_EVENT_STREAM_PAYLOAD` | `{ args: {} }` | `stream-protocol.ts:16` |
| `REMOTE_EVENT_STREAM_READY` | `{ type: 'ready' }` | `stream-protocol.ts:19` |

Es gibt **einen** physischen WebSocket für **alle** logischen Remote-Streams: den Mux unter
`/api/remote.mux`. Der Mux wird als HTTP-Upgrade-Route registriert
(`packages\api\gateway\src\index.ts:240-277`, `webCtx.webServer.registerUpgrade`). Nur
Text-Frames sind erlaubt; binäre Frames schließen den Socket mit Code `1003` und Reason
`text messages required` (`stream-server.ts:151-153`). Unary-/Request-Response-Aufrufe laufen **nicht**
über diesen Socket, sondern über den Connection-RPC-Kanal des `connection`-Dienstes auf dem Pfad `/api`
(`index.ts:233-239`, `connection.rpc.intercept('/api', …)`).

Die Browser-URL wird aus `REMOTE_STREAM_MUX_PATH.slice(1)` relativ zu
`globalThis.__DSH_TRANSPORT__?.streamBaseUrl` (Fallback: `document.baseURI`) gebildet; `http:` wird zu
`ws:`, `https:` zu `wss:` (`stream-client.ts:472-480`).

### 1.2 Client → Host: `RemoteStreamClientMessage`

Vier Frame-Typen, definiert in `stream-protocol.ts:234-244`, validiert von
`parseRemoteStreamClientMessage()` (`stream-protocol.ts:264-286`).

| `type` | Felder | Pflicht | Bedeutung |
| --- | --- | --- | --- |
| `open` | `streamId: string`, `endpoint: string`, `payload: unknown` | exakt diese 3 Keys; `streamId` nicht leer; `endpoint` nicht leer | Öffnet einen logischen Stream. `payload` ist das dekodierte Carrier-Payload (üblich: `{ args: {…} }`). |
| `item` | `streamId: string`, optional `value?: unknown` | `['type','streamId']` **oder** `['type','streamId','value']`; wenn `value` vorhanden, muss es `isRemoteJsonValue` erfüllen | Ein Uplink-Item. Ein top-level `undefined` reist als `item` **ohne** `value`-Feld. |
| `end` | `streamId: string` | exakt diese 2 Keys | Uplink-Half-Close des Clients; idempotent. |
| `cancel` | `streamId: string` | exakt diese 2 Keys | Bricht den logischen Stream ab. |

Validierungsregeln (`parseMessage`, `stream-protocol.ts:317-326`): die Nachricht muss gültiges JSON sein und
ein Objekt (kein Array, nicht `null`). Sonst: `api gateway: Remote stream message is not JSON` bzw.
`api gateway: Remote stream message must be an object`. Nicht passende Frames:
`api gateway: invalid Remote stream client message`.

### 1.3 Host → Client: `RemoteStreamServerMessage`

Drei Frame-Typen (`stream-protocol.ts:253-257`), validiert von `parseRemoteStreamServerMessage()`
(`stream-protocol.ts:293-315`).

| `type` | Felder | Validierung | Bedeutung |
| --- | --- | --- | --- |
| `item` | `streamId: string`, optional `value?: unknown` | exakt 2 oder 3 Keys, `streamId` nicht leer | Ein Downlink-Item. |
| `end` | `streamId: string` | exakt 2 Keys, `streamId` nicht leer | Normales Stream-Ende. |
| `error` | `streamId: string`, `error: RemoteStreamFailure` | `error` hat exakt `code`, `message`, `details`; `code`/`message` String, `details` Objekt | Terminaler Fehler. |

`RemoteStreamFailure` (`stream-protocol.ts:247-251`): `{ code: string; message: string; details: object }`.
Der Client baut daraus einen `RemoteError` mit genau diesen drei Feldern
(`stream-client.ts:131`).

### 1.4 Stream-Lebenszyklus: Öffnen, Uplink, Resume, Schließen

**Öffnen.** Der Client erzeugt eine `streamId` via `randomUUID()`, registriert den Stream lokal und sendet
`open` (`stream-client.ts:106-119`). Der Server legt vor dem Auflösen des Openers eine `UplinkInbox` an,
damit Items, die direkt nach `open` eintreffen, nicht verloren gehen (`stream-server.ts:205-219`).
Ein **doppelter `open`** für dieselbe `streamId` ist die einzige Protokollverletzung, die den Socket
schließt: `api gateway: duplicate Remote stream id …` (`stream-server.ts:202-204`).

**Uplink.** Jedes `item` des Clients wird über `inbox.push(value, Buffer.byteLength(text,'utf8'))` in die
beschränkte Queue gelegt (`stream-server.ts:181-184`). Der Host liest sie über
`invocation.uplink()` (`GatewayInvocation.uplink`, `index.ts:1327-1336`). Regeln:

- `end` ist idempotent und beendet die Iteration (`stream-server.ts:347-352`).
- Ein `item` **nach** `end` erzeugt `gateway/protocol` mit Meldung
  `api gateway: Remote stream uplink item after end` (`stream-server.ts:326-333`).
- Überschreitet `bytes + frameBytes > maxBytes`, entsteht `gateway/uplink-overflow` mit
  `api gateway: Remote stream uplink exceeded <maxBytes> buffered bytes` (`stream-server.ts:334-341`).
- `uplink()` ist **einmal pro Aufruf** verfügbar; ein zweiter Aufruf wirft
  `typert gateway: <endpoint>: invocation.uplink() is available once per call` (`index.ts:1327-1331`).
- Jedes Uplink-Item passiert den Deskriptor-Codec (bzw. bei `src-json` nur die JSON-Safety-Prüfung); ein
  abgelehntes Item lässt den **gesamten** logischen Stream fehlschlagen (`index.ts:1271-1281`).

**Resume / Reconnect.** Das Gateway selbst hat **kein** explizites Resume-Frame — es gibt kein `resume`-
Message. Stattdessen ist Resume ein Client-Muster aus mehreren Schichten:

| Schicht | Datei | Verhalten |
| --- | --- | --- |
| Physischer Mux-Client | `client\stream-client.ts` | `RemoteStreamMuxClient` hält genau einen WebSocket, `reconnect()` verwirft ihn, ruft `failAll(RemoteStreamCarrierError)` und schließt mit Code `4000`/Reason `reconnect requested`; ein Supervisor eröffnet die nächste Generation. |
| Generationen-Stream | `client\remote-stream.ts` | `RemoteStream<Item>` zählt `generation` hoch, klassifiziert `RemoteStreamCarrierError` als retrybar und wartet über `waitForRemoteStreamRetry()` auf eine neue Host-Generation. `restart()` erzwingt eine neue Generation. |
| Journal | `client\journal-stream.ts` | `RemoteJournalStream` hält Cursor (`emptyCursor`, `first`/`last`, `compare`, `follows`), publiziert `replace`/`prepend`/`append`/`notification` und repariert Lücken über `readPage` + `repairRequest`. |
| Snapshot | `client\snapshot-stream.ts` | `RemoteSnapshotStream<Snapshot, Delta>` akzeptiert pro Generation **genau einen** öffnenden Snapshot, danach nur Deltas. |

Terminale Frame-Semantik: trifft ein Nicht-`item`-Frame ein, stoppt der Client-Pump sofort
(`stream-client.ts:315`). Verlässt der Konsument die Iteration vorzeitig, sendet der Client `cancel`, sofern
noch kein terminaler Frame ankam (`stream-client.ts:139-141`). Der Server ruft bei Socket-Close
`stream.stop(new Error('Remote stream socket closed'))` für jeden aktiven Stream auf
(`stream-server.ts:163-165`).

**Schließen / Fehlerpfad.** Der Server sendet bei einem Abbruch mit `RemoteError` als `AbortSignal.reason`
den Fehler-Frame; jeder andere Abbruch ist eine stille Kündigung (`stream-server.ts:243-251`). Kann ein
terminaler Frame nicht geschrieben werden, schließt der Server den physischen Socket mit Code `1011` und
Reason `Remote stream failure could not be delivered` (`stream-server.ts:267-271`).

**Heartbeat.** Der Mux sendet WebSocket-Ping-Frames im konfigurierten Intervall
(`websocketHeartbeatIntervalMs`, Default `2000`). `MAX_MISSED_HEARTBEATS = 2`
(`stream-server.ts:40`); nach zwei verpassten Pongs wird der Socket `terminate()`t
(`stream-server.ts:107-123`). Der Timer ist `unref()`t.

**Upgrade-Ablehnung.** `rejectRemoteStreamUpgrade(socket, status)` schreibt eine reine HTTP-Antwort mit
`401 Unauthorized` bzw. `403 Forbidden`, `Connection: close`,
`Content-Type: text/plain; charset=utf-8` und `Content-Length` (`stream-server.ts:433-444`).

### 1.5 Gateway-interner Event-Stream (`$events`) und `$events/result`

Der Mux trägt zusätzlich einen Gateway-internen logischen Stream. Er wird mit dem Payload
`{ args: {} }` geöffnet; jedes andere Payload ist `gateway/arguments-invalid`
(`index.ts:482-494`). Ist keine Event-Quelle registriert: `gateway/service-unavailable` mit
`forwarded Remote event source is unavailable` (`index.ts:495-502`).

**Downlink-Frames** (`RemoteEventDownlinkFrame`, `stream-protocol.ts:66-71`):

| `type` | Felder | Richtung | Bedeutung |
| --- | --- | --- | --- |
| `ready` | `clientId: RemoteEventClientId`, `host: RemoteEventHostInfo` | host→client | Öffnendes Item; genau eines pro Generation. `host` hat exakt das Feld `home: string`. |
| `emit` | `event: string`, `args: readonly unknown[]` | host→client | Einseitige Cordis-Notification; `args` müssen `isRemoteJsonValue` erfüllen. |
| `waterfall` | `event: string`, `eventId: RemoteEventId`, `agentId: RemoteEventAgentId`, `request: Record<string, unknown>` | host→client | Scoped Waterfall; `request` darf **nicht** `agent` oder `signal` enthalten. |
| `cancel` | `eventId: RemoteEventId` | host→client | Kündigung eines zuvor gelieferten Waterfalls unter derselben `eventId`. |

`RemoteEventHostInfo` (`stream-protocol.ts:28-31`) trägt nur `home: string` — „Host account home used only to
abbreviate displayed filesystem paths".

**Uplink-Ergebnis.** Der Client antwortet **nicht** über den Mux, sondern per HTTP-RPC auf den Endpoint
`$events/result` mit Payload `{ args: RemoteEventResult }`
(`client\remote-events.ts:218-224`). `RemoteEventResult` (`stream-protocol.ts:88-95`):

| Feld | Typ | Pflicht |
| --- | --- | --- |
| `clientId` | `RemoteEventClientId` (nicht-leerer String) | ja |
| `eventId` | `RemoteEventId` (nicht-leerer String) | ja |
| `outcome` | Diskriminierte Union | ja |

`outcome`-Varianten (`parseRemoteEventResult`, `stream-protocol.ts:102-138`):

| `outcome.kind` | Zusatzfelder | Keys exakt |
| --- | --- | --- |
| `next` | — | `['kind']` |
| `result` | optional `value?: unknown` (`isRemoteJsonValue`) | `['kind']` oder `['kind','value']` |
| `rejected` | `error: RemoteEventRejection` | `['kind','error']` |

`RemoteEventRejection` (`stream-protocol.ts:80-85`): `name: string` (nicht leer), `message: string`,
optional `code?: string`, optional `details?: unknown` (nur wenn `isRemoteJsonValue`).

Fehlertexte dieses Pfads: `api gateway: invalid Remote event result`,
`api gateway: invalid Remote event rejection`,
`api gateway: Remote event request must carry its scoped Agent directly`,
`api gateway: Remote event request signal must be an AbortSignal`,
`api gateway: Remote event request has a non-JSON property`,
`api gateway: Remote event request is not lossless JSON data`.

### 1.6 Weitergeleitete Cordis-Events (Allowlist)

`packages\api\remotes\src\remote-events.ts:20-48` deklariert `API_REMOTE_FORWARDED_EVENTS` — die
vollständige Liste der weitergeleiteten Host-Events mit Modus (`emit` oder `waterfall`):

| Event | Modus |
| --- | --- |
| `agent-preset/selected` | `emit` |
| `approval/request` | `waterfall` |
| `api-session/activity` | `emit` |
| `api-session/added` | `emit` |
| `api-session/error` | `emit` |
| `api-session/removed` | `emit` |
| `api-session/status` | `emit` |
| `commands/change` | `emit` |
| `deepseek-account/session-expired` | `emit` |
| `deepseek-account/model-sign-in-required` | `emit` |
| `credentials/record-updated` | `emit` |
| `credentials/reference-updated` | `emit` |
| `goal/activation-changed` | `emit` |
| `cordis/request-run` | `emit` |
| `cordis/request-run-resolved` | `emit` |
| `cordis/dynamic-package` | `emit` |
| `cordis/dynamic-retract` | `emit` |
| `cordis/inspect-query` | `emit` |
| `cordis/inspect-query-resolved` | `emit` |
| `llm/adapters-updated` | `emit` |
| `permission-presets/catalog-changed` | `emit` |
| `plugin-manager/changed` | `emit` |
| `plugin-manager/install-log` | `emit` |
| `plugin-manager/install-state` | `emit` |
| `settings/document-updated` | `emit` |
| `schedule/changed` | `emit` |
| `user-questions/request` | `waterfall` |

**27 Events**, davon 2 Waterfalls. Der `apply`-Body registriert die Quelle über
`ctx.typertGateway.registerRemoteEvents(remoteEventSource(ctx), { home: homedir() })`
(`remotes\src\index.ts:40-45`). Eine zweite Registrierung wirft
`typert gateway: forwarded Remote event source is already registered` (`gateway\src\index.ts:301-303`).

### 1.7 Vollständige Fehlercode-Liste (Wire)

Die Remote-Fehlervokabel ist merge-extensible über `RemoteErrorDetailsMap`. Basis-Deklaration in
`packages\typert\protocol\src\types.ts:49-56`; Gateway-Infrastruktur in
`packages\api\gateway\src\remote-error-codes.ts:15-36`. **22 Codes** wörtlich:

| Code | Details-Felder | Bedeutung |
| --- | --- | --- |
| `gateway/bad-request` | `{ issues?: readonly object[] }` | Owner-seitige Business-Validierung hat die Anfrage abgelehnt; `issues` trägt Codec-Ausgabe. Quelle: `typert\protocol\src\types.ts:51`. |
| `gateway/cancelled` | `{}` | Der Aufruf wurde durch Carrier-Signal oder Backend abgebrochen. Quelle: `typert\protocol\src\types.ts:53`. |
| `gateway/internal` | `{}` | Carrier-, Dispatch- oder unklassifizierter Host-Fehler. Quelle: `typert\protocol\src\types.ts:55`. |
| `gateway/ambiguous-endpoint` | `{ endpoint, field? }` | Mehrere aktive Services exportieren denselben Endpoint (SRC-Modus). Quelle: `remote-error-codes.ts:17`, geworfen in `index.ts:787-793`. |
| `gateway/arguments-invalid` | `{ endpoint, field? }` | `args` ist kein Plain-Object oder verletzt die Feldform. Quelle: `remote-error-codes.ts:18`, `index.ts:1483-1485`. |
| `gateway/binding-invalid` | `{ endpoint, field? }` | Service hat keine sichtbare `typertRemote`-Bindung oder eine inkonsistente. Quelle: `remote-error-codes.ts:19`, `index.ts:1396-1425`. |
| `gateway/context-failed` | `{ endpoint, field? }` | Der Context-Provider hat bei `resolve()` geworfen. Quelle: `remote-error-codes.ts:20`, `index.ts:922-927`. |
| `gateway/context-not-found` | `{ endpoint, field? }` | Der Context-Provider hat die Identität nicht aufgelöst. Quelle: `remote-error-codes.ts:21`, `index.ts:929-936`. |
| `gateway/context-unavailable` | `{ endpoint, field? }` | Kein Host-Context-Adapter für den deklarierten Context-Key. Quelle: `remote-error-codes.ts:22`, `index.ts:855-861`, `index.ts:900-906`. |
| `gateway/definition-unavailable` | `{ endpoint, field? }` | Die strikte Definition wurde zurückgezogen; SRC-Fallback ist verboten. Quelle: `remote-error-codes.ts:23`, `index.ts:759-765`. |
| `gateway/input-invalid` | `{ endpoint, field? }` | Ein Boundary-Wert hat seinen Codec nicht passiert (auch `field: 'uplink'`). Quelle: `remote-error-codes.ts:24`, Uplink-Pfad `index.ts:1277-1281`. |
| `gateway/invocation-unavailable` | `{ endpoint, field? }` | Keine aktive Remote-Methode exportiert diesen Endpoint. Quelle: `remote-error-codes.ts:25`, `index.ts:784-786`. |
| `gateway/lookup-failed` | `{ endpoint, field? }` | Der Lookup-Provider hat bei `resolve()` geworfen. Quelle: `remote-error-codes.ts:26`, `index.ts:983-990`. |
| `gateway/lookup-not-found` | `{ endpoint, field? }` | Der Lookup-Provider hat die Identität nicht aufgelöst. Quelle: `remote-error-codes.ts:27`, `index.ts:992-999`. |
| `gateway/lookup-unavailable` | `{ endpoint, field? }` | Lookup-Key ohne Provider oder Parameter ohne Provider-Key. Quelle: `remote-error-codes.ts:28`, `index.ts:954-970`. |
| `gateway/method-unavailable` | `{ endpoint, field? }` | Aktiver Service hat keine aufrufbare Methode dieses Namens. Quelle: `remote-error-codes.ts:29`, `index.ts:739-745`, `index.ts:1447-1453`. |
| `gateway/protocol` | `{ endpoint, field? }` | Logische-Stream-Protokollverletzung, z. B. Uplink-Item nach `end`. Quelle: `remote-error-codes.ts:30`, `stream-server.ts:327-331`. |
| `gateway/provider-mismatch` | `{ endpoint, field? }` | Provider-Wire-Name oder `wireTypeSymbol` passt nicht zur strikten Definition. Quelle: `remote-error-codes.ts:31`, `index.ts:907-915`. |
| `gateway/result-invalid` | `{ endpoint, field? }` | Ein Stream-Methodenaufruf lieferte kein `Iterable`/`AsyncIterable`. Quelle: `remote-error-codes.ts:32`, `index.ts:412-420`. |
| `gateway/service-unavailable` | `{ endpoint, field? }` | Der aktive Service-Key ist nicht auflösbar oder die Event-Quelle fehlt. Quelle: `remote-error-codes.ts:33`, `index.ts:708-714`, `index.ts:497-502`. |
| `gateway/signature-invalid` | `{ endpoint, field? }` | Signatur-/Modus-Konflikt (Stream-Methode unary aufgerufen oder umgekehrt, `signal` nicht letzter Parameter, doppeltes Wire-Feld). Quelle: `remote-error-codes.ts:34`, `index.ts:363-368`, `index.ts:398-403`, `index.ts:805-812`. |
| `gateway/uplink-overflow` | `{ endpoint, field? }` | Gepufferte Uplink-Frame-Bytes eines logischen Streams haben das Limit überschritten. Quelle: `remote-error-codes.ts:35`, `stream-server.ts:335-339`. |

`TypertGatewayFaultDetails` (`remote-error-codes.ts:8-13`): `endpoint: string` (kanonisch
`<namespace>/<method>`) und optional `field?: string`.

Zusätzlich deklarieren die Domänen-Pakete eigene Codes im selben `RemoteErrorDetailsMap`.
Beispiel Session-Controller (`packages\api\session-controller\src\types.ts:204-239`):
`session/provider-credentials-unavailable`, `session/provider-models-unavailable`,
`session/model-unavailable`, `session/conflict`, `session/projections-unavailable`,
`session/writer-held`, `session/agent-busy`, `session/invalid-time-zone`,
`session/workspace-attach-failed`, `agent-preset/conflict`, `session/attachment-invalid`,
`session/queue-item-not-found`, `session/steer-unavailable`, `session/title-invalid`,
`session/fork-unavailable`, `session/migration-required`, `subagent/not-found`,
`subagent/catalog-diagnostic`.

Client-lokale Codes (nicht Host-erzeugt, `client\index.ts:819-838`): `gateway/internal` für
Carrier-Throws und `gateway/cancelled` für vom Aufrufer abgebrochene Aufrufe. Der `level`-Parameter des
Terminal-Stream-Fehlers ist immer `gateway/internal` (`client\remote-stream.ts:206-213`).

### 1.8 Fehler-Identifikation

`RemoteError<Code>` trägt das strukturelle Marker-Feld `isDSHRemoteError: true`
(`typert\protocol\src\remote-error.ts:12-31`). `remoteErrorOf(value)` prüft **strukturell** — nicht per
`instanceof` — auf `isDSHRemoteError === true` **und** `typeof code === 'string'`
(`remote-error.ts:40-49`). Grund: ein Error aus einer anderen Realm (iframe, VM) besteht `instanceof` nicht.
Diskriminierung erfolgt immer über `code`, nie über `instanceof`.

### 1.9 Server-/Client-Verträge im Detail

| Symbol | Datei | Vertrag |
| --- | --- | --- |
| `RemoteStreamOpener` | `stream-server.ts:21-27` | `(endpoint, payload, uplink, peer, control) => Promise<AsyncIterable<unknown>>`. `control` ist ein `AbortController`; ein Abbruch mit einer Remote-Failure als Reason liefert genau diese Failure an den Client. |
| `RemoteStreamFailureMapper` | `stream-server.ts:38` | `(error: unknown) => RemoteStreamFailure`. |
| `RemoteStreamMuxServer` | `stream-server.ts:43-125` | `new RemoteStreamMuxServer(open, failure, heartbeatIntervalMs, streamInboxBytes)`; `handleUpgrade(req, socket, head, peer)`; `close()`. |
| `UplinkInbox` | `stream-server.ts:309-403` | Beschränkte Single-Consumer-Queue; `push`, `end`, `fail`, `[Symbol.asyncIterator]`, `next`, `return`. Ein zweiter Konsument wirft `api gateway: Remote stream uplink inbox already has a consumer`. |
| `rejectRemoteStreamUpgrade` | `stream-server.ts:433-444` | `(socket, 401 | 403) => void`. |
| `RemoteStreamMuxClient` | `client\stream-client.ts:51-364` | `start()`, `reconnect()`, `open(endpoint, payload, signal, uplink?)`, `close()`. Sendet `open`/`item`/`end`/`cancel`. |
| `RemoteStreamCarrierError` | `client\stream-client.ts:14-23` | Physischer Carrier-Fehler; `name = 'RemoteStreamCarrierError'`; **retrybar**. |
| `ClientUplinkQueue` | `client\stream-client.ts:401-470` | `push(item)`, `end()`, `close()`, `next()`, `return()`. `push` nach `end()` wirft `client api: <endpoint> uplink was ended`; nach `close()` `client api: <endpoint> stream has terminated`. Genau ein ausstehender Read. |
| `StreamInbox` | `client\stream-client.ts:366-393` | Privater Downlink-Puffer des Mux-Clients. |
| `RemoteStream<Item>` | `client\remote-stream.ts:39-158` | `[Symbol.asyncIterator]`, `restart()`, `dispose()`, `signal`. Genau ein Konsument (`<name> already has a consumer`). |
| `RemoteStreamItem<Item>` | `client\remote-stream.ts:8-17` | `{ generation: number; value: Item; signal: AbortSignal; accept(): void }`. |
| `RemoteStreamOptions<Item>` | `client\remote-stream.ts:20-29` | `{ name; open(signal); ended(accepted): Error; carrierFailed?(error) }`. |
| `RemoteJournalStream` | `client\journal-stream.ts:90-580` | Abstrakt; `open(request)`, `prepend(request)`, `restart()`, `dispose()`, `signal`; abstrakt `follow`, `readPage`, `repairRequest`. |
| `RemoteJournalFrame<Entry,Cursor,Page,Notification>` | `client\journal-stream.ts:17-22` | `{type:'opened',cursor,page}` \| `{type:'entry',entry}` \| optional `{type:'notification',notification}`. |
| `RemoteJournalChange<Page,Entry,Notification>` | `client\journal-stream.ts:25-41` | `replace` \| `prepend` (je `page`,`entries`,`hasMore`) \| `append` (`entry`) \| optional `notification`. |
| `RemoteSnapshotStream<Snapshot,Delta>` | `client\snapshot-stream.ts:31-93` | `start()`, `restart()`, `dispose()`. Optional: `isSnapshot`, `replace`, `update`, `failed`. |
| `ClientRemoteEvents` | `client\remote-events.ts:63-262` | `subscribe(ctx, event, listener)`, `dispose()`; öffnet `$events` und antwortet auf `$events/result`. |

### 1.10 `remotes`-Paket: Registrierung und Adressierung

`packages\api\remotes` ist die **Anwendungs-Assembly** (Host-BFF + Loader-Shell), nicht der Transport.

| Datei | Export | Zweck |
| --- | --- | --- |
| `src\index.ts` | `inject = ['typertGateway']`, `apply(ctx)`, `API_REMOTE_FORWARDED_EVENTS` | Registriert die einzige weitergeleitete Event-Quelle beim Gateway. Quelle: `index.ts:37-45`. |
| `src\remote-events.ts` | `API_REMOTE_FORWARDED_EVENTS` | Die Allowlist (27 Einträge, siehe 1.6). |
| `src\types.ts` | `ApiRemoteForwardedEvent` | Typ-Projektion; `declare module … interface TypertRemoteEventSelection extends Record<ApiRemoteForwardedEvent, true> {}` — ohne dieses Typ-Merge ist `TypertRemoteEvent` gleich `never` und jeder `$on`-Aufruf schlägt fehl (`types.ts:17-19`, `client\index.ts:69-71`). |
| `src\client\index.ts` | `inject = ['remote']`, `apply(ctx)`, `ClientRemote` | Mountet die generierten Remote-Contributions in fester Reihenfolge (25 Pakete). Quelle: `client\index.ts:181-190`. |

Die Client-Assembly mountet in dieser Reihenfolge (`client\index.ts:181-189`):
`productAnalyticsRemote`, `agentPresetsRemote`, `commandsRemote`, `settingsControllerRemote`,
`accountRemote`, `goalsRemote`, `llmRemote`, `dynamicRemote`, `scheduleRemote`, `pluginInventoryRemote`,
`pluginManagerRemote`, `pluginRegistryProbeRemote`, `messageFeedbackRemote`, `sessionFeedbackRemote`,
`fileUploadsRemote`, `sessionReferencesRemote`, `permissionPresetsRemote`, `subagentsRemote`, `sessionRemote`,
`jobRemote`, `workspaceRemote`, `workspaceFilesRemote`, `terminalRemote`, `officeToPdfRemote`,
`userQuestionsRemote`. Abbau erfolgt in umgekehrter Mount-Reihenfolge
(`client\index.ts:194-199`).

**Adressierung.** Ein Remote-Service wird durch **zwei** Namen adressiert:

- **Cordis-Service-Key** — `descriptor.service`, z. B. `sessionController`.
- **Wire-Namespace** — `descriptor.namespace`, Default = Service-Key; Controller wählen abweichende
  Namespaces (`session`, `job`, `settings`, `credentials`, `terminal`, `workspace`,
  `directoryPicker`, `workspaceFiles`, `account`, `fileReferences`, `skills`).

Der kanonische **Endpoint** ist `<namespace>/<method>` (`typertEndpoint`, `registry\src\service.ts:68-70`;
`endpointOf`, `gateway\src\index.ts:1383-1385`). Erlaubte Segmentzeichen:
`/^[A-Za-z0-9_$.-]+$/`, wobei `.` und `..` verboten sind
(`typert\protocol\src\index.ts:16-25`, `registry\src\service.ts:733-737`).

**Scoped-Namespaces.** Für Context-Methoden lautet die Scoped-Adresse
`<ContextKey>:<Namespace>/<method>` (`TypertRemoteScopeMap`,
`typert\protocol\src\types.ts:231-249`). Im Client wird daraus der Cordis-Pfad
`remote.<namespace>` (`remoteServiceKey`, `client\index.ts:752-754`).

**Registrierung am Gateway.** Der `TypertGatewayService` bindet sich mit `static inject = ['typert']`
(`gateway\src\index.ts:200`) an den `connection`-Dienst:
`connection.rpc.intercept('/api', endpoint => this.claimsEndpoint(endpoint), dispatch)`.
`claimsEndpoint` beansprucht `$events/result` immer, sonst nur Endpoints mit genau zwei nicht-leeren
Segmenten, die entweder in `ctx.typert.local` liegen/je lagen **oder** per SRC-Marker beansprucht werden
(`gateway\src\index.ts:325-349`). Die Client-Seite mountet Namespaces über
`ctx.remote.$mount(contribution)` und registriert sie in `ctx.typert.remotes`
(`client\index.ts:246`, `registry\src\service.ts:197-214`).

---

## 2. Alle Remote-/RPC-Methoden der Controller

**Methodik.** Deklaration erfolgt über den Standard-Decorator `@Remote` (bzw. `@RemoteScope`) aus
`@deepseek-ai/dsh-typert-protocol`. Die *generierte* Client-Fassade steht in
`packages\api\<controller>\lib\typert.remote-client.d.ts` („Generated by @deepseek-ai/dsh-typert-generator
from the Host FaceModel — do not edit"). Beide Quellen wurden gegengelesen; die Tabellen unten folgen den
generierten Signaturen und nennen die deklarierende Quelldatei.

**Legende.** R/R = Request/Response (unary, Client erhält `RemoteResult<T>`). Stream = die Methode liefert
ein `RemoteStreamHandle<Out, never>`; der Client iteriert, kann `send()`/`end()`/`dispose()`. `signal?`
ist **kein** Wire-Argument, sondern Transport-Cancellation (`cancellation: { parameter: 'signal' }` im
Deskriptor).

### 2.1 `api\session-controller` — Namespaces `session`, `fileReferences`, `skills`

Service-Keys: `sessionController`, `sessionFileReferences`, `sessionSkillCatalog`.
Deklaration: `src\index.ts` (`@Remote`-Marker in Zeilen 259–558), `src\file-references.ts:32`,
`src\skill-catalog.ts:35`. Generiert: `lib\typert.remote-client.d.ts`.

| Endpoint | Parameter (Wire-Namen) | Rückgabe | Art |
| --- | --- | --- | --- |
| `session/list` | `_request: SessionListRequest`, `signal?` | `SessionListValue` | R/R |
| `session/search` | `request: SessionSearchRequest`, `signal?` | `SessionSearchValue` | R/R |
| `session/create` | `request: SessionCreateRequest` | `SessionCreateValue` | R/R |
| `session/selectModel` | `request: SessionSelectModelRequest` | `SessionSelectModelValue` | R/R |
| `session/initializeDefaultModel` | — | `void` | R/R |
| `session/modelCatalog` | — | `ModelCatalog` | R/R |
| `session/canOpenWorkspacePath` | — | `boolean` | R/R |
| `session/openWorkspacePath` | `request: SessionOpenWorkspacePathRequest`, `signal?` | `SessionOpenWorkspacePathValue` | R/R |
| `session/workspacePathApplications` | `request: { readonly path: string }`, `signal?` | `readonly SessionWorkspacePathApplication[]` | R/R |
| `session/rename` | `request: SessionRenameRequest` | `SessionRenameValue` | R/R |
| `session/fork` | `request: SessionForkRequest` | `SessionForkValue` | R/R |
| `session/prompt` | `request: SessionPromptRequest`, `signal?` | `SessionPromptValue` | R/R |
| `session/attachment` | `request: SessionAttachmentRequest` | `SessionAttachmentValue` | R/R |
| `session/updateQueue` | `request: SessionUpdateQueueRequest` | `SessionUpdateQueueValue` | R/R |
| `session/cancel` | `request: SessionCancelRequest` | `SessionCancelValue` | R/R |
| `session/page` | `request: SessionPageRequest`, `signal?` | `SessionPage` | R/R |
| `session/projections` | `request: SessionProjectionsRequest`, `signal?` | `SessionProjectionsValue` | R/R |
| `session/follow` | `request: SessionFollowRequest`, `signal?` | `SessionFollowFrame` | **Stream** |
| `session/control` | `signal?` | `SessionControlFrame` | **Stream** |
| `fileReferences/list` | `agentId: SessionId` (Scoped, Wire-Feld `agentId`), `query: string`, `signal?` | `FileReferenceCandidate[]` | R/R (gescoped) |
| `skills/list` | `request: SkillListRequest`, `signal?` | `SkillListValue` | R/R |

**Nicht per `@Remote` exportiert** (Host-intern, obwohl öffentliche Methoden):
`SessionController.resolveAgent(sessionId)` (`src\index.ts:227-229`) und
`SessionController.inspect(sessionId, signal?)` (`src\index.ts:237-251`). Diese haben **keinen**
`@Remote`-Marker und sind damit nicht über das Gateway erreichbar.

**Scoped-Projektion** (`TypertRemoteScopeMap`): `agent:fileReferences/list` — der Host-Aufruf ist
`(query, signal?)`, die Client-Projektion ersetzt den `agent`-Lookup-Parameter durch die Identität des
aufrufenden Agent-Contexts (`lib\typert.remote-client.d.ts`, `scope: { context: 'agent', wire: 'agentId' }`).

**Generierte Deskriptor-Metadaten** (Beispiel, `lib\typert.remote-client.js`):
`id: '@deepseek-ai/dsh-api-session-controller#session/follow'`,
`service: 'sessionController'`, `namespace: 'session'`, `method: 'follow'`, `mode: 'stream'`,
`cancellation: { parameter: 'signal' }`, `result.typeSymbol: '…/types#SessionFollowFrame'`,
`sourceLocation: { file: 'packages/api/session-controller/src/index.ts', line: 496, column: 3 }`.

**SessionController-`Config`** (`src\index.ts:80-123`): `nativeOpen?: boolean` (kein Default),
`listWorkSliceMs: z.natural().min(1).default(16)`.

**Fehler-/Domain-Konstanten** (`src\types.ts`):
`SESSION_SEARCH_RESULT_LIMIT = 20` (`types.ts:199`),
`SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS = 240` (`types.ts:202`).

### 2.2 `api\job-controller` — Namespace `job`

Service-Key: `jobController` (Namespace `job`). Generiert: `lib\typert.remote-client.d.ts`.

| Endpoint | Parameter | Rückgabe | Art |
| --- | --- | --- | --- |
| `job/follow` | `request: JobFollowRequest`, `signal?` | `JobFollowFrame` | **Stream** |
| `job/kill` | `request: JobKillRequest` | `JobKillValue` | R/R |
| `job/list` | `request: JobListRequest`, `signal?` | `JobListFrame` | **Stream** |

### 2.3 `api\settings-controller` — Namespaces `settings`, `credentials`

Service-Keys: `settingsController`, `credentialsController`. Generiert:
`lib\typert.remote-client.d.ts`. Deklaration: `src\index.ts`, `src\credentials.ts`.

| Endpoint | Parameter | Rückgabe | Art |
| --- | --- | --- | --- |
| `settings/describe` | — | `SettingsDescribeValue` | R/R |
| `settings/mutate` | `ns: string`, `ops: SettingsPathOpView[]`, `expectedRevision: number \| undefined` | `SettingsNamespaceView` | R/R |
| `settings/openSettingsDocument` | `signal?` | `SettingsDocumentOpenValue` | R/R |
| `settings/replace` | `ns: string`, `section: Record<string, JsonValue>`, `expectedRevision: number \| undefined` | `SettingsNamespaceView` | R/R |
| `settings/update` | `ns: string`, `patch: Record<string, JsonValue>`, `expectedRevision: number \| undefined` | `SettingsNamespaceView` | R/R |
| `credentials/describe` | `refs: string[]` | `Record<string, CredentialInfo>` | R/R |
| `credentials/set` | `ref: string`, `value: string` | `void` | R/R |
| `credentials/unset` | `ref: string` | `void` | R/R |

Hinweis: `expectedRevision` ist im Codec als optional/nullable geführt — der Client übergibt `undefined`
als fehlendes Wire-Feld. Secrets reisen **nie** über diese Namespaces
(`packages\api\remotes\src\client\index.ts:139-143`).

### 2.4 `api\terminal-controller` — Namespace `terminal`

Service-Key: `terminalController` (Namespace `terminal`). Generiert:
`lib\typert.remote-client.d.ts`. Alle Methoden haben `agentId: SessionId` als erstes Wire-Feld; die
Scoped-Projektion `agent:terminal/*` ersetzt es durch die Context-Identität.

| Endpoint | Parameter | Rückgabe | Art |
| --- | --- | --- | --- |
| `terminal/close` | `agentId: SessionId`, `id: WebTerminalId` | `void` | R/R |
| `terminal/create` | `agentId`, `request: TerminalCreateRequest`, `signal?` | `WebTerminalInfo` | R/R |
| `terminal/environment` | `agentId`, `signal?` | `TerminalEnvironment` | R/R |
| `terminal/follow` | `agentId`, `id: WebTerminalId`, `attachmentId: TerminalAttachmentId`, `signal?` | `TerminalFrame` | **Stream** |
| `terminal/list` | `sessionId: SessionId` | `WebTerminalInfo[]` | R/R |
| `terminal/rename` | `agentId`, `id`, `title: string` | `void` | R/R |
| `terminal/resize` | `agentId`, `id`, `attachmentId`, `cols: number`, `rows: number` | `void` | R/R |
| `terminal/retain` | `sessionId: SessionId`, `id: WebTerminalId`, `signal?` | `TerminalRetentionFrame` | **Stream** |
| `terminal/shells` | `agentId`, `signal?` | `TerminalShell[]` | R/R |
| `terminal/write` | `agentId`, `id`, `attachmentId`, `data: string` | `void` | R/R |

Scoped-Varianten (`TypertRemoteScopeMap`): `agent:terminal/close`, `agent:terminal/create`,
`agent:terminal/environment`, `agent:terminal/follow`, `agent:terminal/rename`, `agent:terminal/resize`,
`agent:terminal/shells`, `agent:terminal/write` — jeweils ohne das `agentId`-Argument.
`terminal/list` und `terminal/retain` sind **nicht** gescoped (sie adressieren `sessionId` direkt).

### 2.5 `api\workspace-controller` — Namespaces `workspace`, `directoryPicker`

Service-Keys: `workspaceController`, `directoryPicker`-Anbindung des Controllers. Generiert:
`lib\typert.remote-client.d.ts`.

| Endpoint | Parameter | Rückgabe | Art |
| --- | --- | --- | --- |
| `workspace/archiveSession` | `request: WorkspaceArchiveSessionRequest` | `WorkspaceArchiveValue` | R/R |
| `workspace/create` | `request: WorkspaceCreateRequest` | `WorkspaceCreateValue` | R/R |
| `workspace/delete` | `request: WorkspaceDeleteRequest` | `WorkspaceDeleteValue` | R/R |
| `workspace/follow` | `signal?` | `WorkspaceFollowFrame` | **Stream** |
| `workspace/initializeDefault` | `signal?` | `WorkspaceValue \| undefined` | R/R |
| `workspace/insertBefore` | `request: WorkspaceInsertBeforeRequest` | `WorkspaceOrderValue` | R/R |
| `workspace/insertSessionBefore` | `request: WorkspaceInsertSessionBeforeRequest` | `WorkspaceValue` | R/R |
| `workspace/pinSession` | `request: WorkspacePinSessionRequest` | `WorkspacePinValue` | R/R |
| `workspace/rename` | `request: WorkspaceRenameRequest` | `WorkspaceValue` | R/R |
| `workspace/unarchiveSession` | `request: WorkspaceUnarchiveSessionRequest` | `WorkspaceArchiveValue` | R/R |
| `workspace/unpinSession` | `request: WorkspaceUnpinSessionRequest` | `WorkspacePinValue` | R/R |
| `directoryPicker/createDirectory` | `path: string`, `name: string` | `string` | R/R |
| `directoryPicker/list` | `path: string \| undefined`, `signal?` | `DirectoryListing` | R/R |
| `directoryPicker/pick` | `signal?` | `string \| null` | R/R |

Der Namespace `directoryPicker` ist **nicht** der Service-Key `workspaceController`: `@Remote`-Marker mit
explizitem Namespace. `DirectoryListing` stammt aus `@deepseek-ai/dsh-host-directory-picker/types`.

### 2.6 `api\account-controller` — Namespace `account`

Service-Key: `accountController`. Generiert: `lib\typert.remote-client.d.ts`. Typen stammen aus
`@deepseek-ai/dsh-deepseek-account/types`.

| Endpoint | Parameter | Rückgabe | Art |
| --- | --- | --- | --- |
| `account/ackBonusNotified` | `accountId: AccountUserId`, `orderId: AccountBonusOrderId`, `client: AccountClientMetadata` | `boolean` | R/R |
| `account/cancelSignIn` | `attemptId: SignInAttemptId` | `AccountView` | R/R |
| `account/getBalance` | `client: AccountClientMetadata` | `AccountDetails['balance'] \| null` | R/R |
| `account/getProfile` | `client: AccountClientMetadata` | `AccountDetails['profile'] \| null` | R/R |
| `account/getState` | — | `AccountView` | R/R |
| `account/getUnnotifiedBonuses` | `client: AccountClientMetadata` | `AccountBonusBatch \| null` | R/R |
| `account/hasRunningAccountTasks` | — | `boolean` | R/R |
| `account/signOut` | `client: AccountClientMetadata` | `AccountView` | R/R |
| `account/startSignIn` | `client: AccountClientMetadata`, `callbackOrigin: string`, `loginSource: 'web' \| 'desktop'` | `AccountView` | R/R |
| `account/watch` | `signal?` | `AccountView` | **Stream** |
| `account/watchExpiry` | `signal?` | `'session-expired'` | **Stream** |

### 2.7 `api\workspace-files` — Namespace `workspaceFiles`

Service-Key: `workspaceFiles`. Der Deskriptor-Codec nutzt einen Typ-Helfer
`RemoteDecoded<Value>`, der `Uint8Array` auf `Uint8Array<ArrayBuffer>` abbildet
(`lib\typert.remote-client.d.ts`).

| Endpoint | Parameter | Rückgabe | Art |
| --- | --- | --- | --- |
| `workspaceFiles/changes` | `workspaceFileScopeId: SessionId`, `path: string`, `signal?` | `WorkspaceFileWatchFrame` | **Stream** |
| `workspaceFiles/list` | `workspaceFileScopeId: SessionId`, `path: string`, `signal?` | `WorkspaceDirectoryListing` | R/R |
| `workspaceFiles/read` | `workspaceFileScopeId`, `path: string`, `range: WorkspaceFileRange`, `signal?` | `WorkspaceFileText` | R/R |
| `workspaceFiles/readBytes` | `workspaceFileScopeId`, `path: string`, `options: WorkspaceByteReadOptions`, `signal?` | `RemoteDecoded<WorkspaceFileBytes>` | R/R |
| `workspaceFiles/stat` | `workspaceFileScopeId`, `path: string`, `signal?` | `WorkspaceFileStat` | R/R |

### 2.8 Zählung

| Controller | R/R | Stream | Gesamt |
| --- | --- | --- | --- |
| `session-controller` | 19 | 2 | 21 |
| `job-controller` | 1 | 2 | 3 |
| `settings-controller` | 8 | 0 | 8 |
| `terminal-controller` | 8 | 2 | 10 |
| `workspace-controller` | 12 | 1 | 13 |
| `account-controller` | 9 | 2 | 11 |
| `workspace-files` | 4 | 1 | 5 |
| **Summe** | **61** | **9** | **70** |

---

## 3. Das typert-Typprotokoll

Vier Pakete unter `packages\typert\`: `protocol`, `registry`, `loader`, `generator`.

### 3.1 `typert\protocol` — Deklaration und Laufzeit-Verträge

Quellen: `src\index.ts` (348 Zeilen), `src\types.ts` (702 Zeilen), `src\remote-error.ts`,
`src\json-value.ts`, `src\owned-value.ts`.

**Decorator `Remote`** (`src\index.ts:198-225`). Drei Aufrufformen:

| Form | Bedeutung |
| --- | --- |
| `@Remote` | Direkte unary-Methode; Export-Namen = Methodenname. |
| `@Remote('exportName')` | Direkte Methode unter abweichendem Wire-Namen. |
| `@Remote({ mode: 'stream' })` | Logischer Stream; die Methode liefert `RemoteStream<Out, In>`. Die Options müssen **genau** `mode: 'stream'` enthalten, sonst `TypeError: typert-protocol: Remote options must contain exactly mode: "stream"` (`src\index.ts:216-222`). |

**Decorator `RemoteScope(key, exportName?)`** (`src\index.ts:250-257`): markiert eine aus einem Remote-
Scope aufgelöste Methode; `key` ist ein `TypertContextMap`-Key.

**Marker-Speicherung** (`src\index.ts:308-336`): Marker liegen als `version: 1`-Deskriptor unter dem
Property-Key `'@deepseek-ai/dsh-typert-protocol/remote-methods'` auf dem Klassen-Prototyp. Der Deskriptor
ist tief gefroren (`Object.freeze`) und kumulativ. Regeln:
- nur **öffentliche Instanzmethoden** mit String-Namen; sonst
  `TypeError: typert-protocol: Remote decorators require a public instance method with a string name`
  (`src\index.ts:295-297`).
- widersprüchliche Marker für dieselbe Methode:
  `typert-protocol: Remote method "<method>" has conflicting invocation markers` (`src\index.ts:327`).
- unbekannte Deskriptor-Version:
  `TypeError: typert-protocol: unsupported Remote method descriptor version <n>` (`src\index.ts:280`).

**`remoteMethods(service)`** (`src\index.ts:265-269`) liest die Marker eines **lebenden** Service in
Klassendeklarationsreihenfolge und gibt eine nicht-mutierbare Kopie zurück.

**`TypertRemoteService`** (`src\index.ts:166-180`): Cordis-`Service`-Basis, die `typertRemote` als
gefrorenes, inspizierbares Binding setzt: `{ service, serviceKey, namespace }` (`bindTypertRemote`,
`src\index.ts:152-163`). Der Namespace ist `options.namespace ?? serviceKey`. Zusätzlich registriert der
erste Remote-Service im Baum einen `invocation`-Accessor auf dem Root, damit `ctx.invocation` außerhalb
eines Remote-Aufrufs `undefined` liest statt zu werfen (`src\index.ts:188-191`).

**`InvocationDescriptor`** (`src\types.ts:318-368`) — der zentrale Vertrag:

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `id` | `string` | Global stabile, generierte Identität. |
| `service` | `string` | Cordis-Service-Key des Owners. |
| `namespace` | `string` | Wire-Namespace; Default = `service`. |
| `method` | `string` | Öffentlicher Instanzmethodenname. |
| `implementation?` | `string` | Abweichender Service-Member, wenn `method` ein Alias ist. |
| `mode?` | `'stream'` | Fehlt für unary; `'stream'` liefert jedes Item einzeln. |
| `invocation` | `{kind:'direct'}` \| `{kind:'context', context, wire, codec}` | Empfänger-Auswahl. |
| `scope?` | `{context, wire}` | Optionale konsumierende-Context-Projektion genau eines Lookup-Parameters. |
| `parameters` | `readonly InvocationParameterDescriptor[]` | Geordnete Business-Parameter. |
| `uplink?` | `{codec}` | Client→Host-Items desselben logischen Streams (aus dem `In`-Typargument). |
| `cancellation?` | `{parameter:'signal'}` | Transport-Cancellation, **nicht** in den Wire-Args. |
| `result` | `TypertCodec` | Codec für das unary-Ergebnis oder jedes Stream-Item. |
| `sourceLocation?` | `{file,line,column}` | Nur Diagnose. |

`InvocationParameterDescriptor` (`src\types.ts:295-308`): `name`, `wire`, `source: 'json' | 'lookup'`,
`lookup?`, `codec`, `acceptsUndefined?: true`. Ein `lookup`-Parameter darf `acceptsUndefined` **nicht**
setzen (`registry\src\service.ts:678-682`).

**`TypertCodec`** (`src\types.ts:270-293`) — zwei Modi:

| Modus | Pflichtfelder | Bedeutung |
| --- | --- | --- |
| `'strict'` | `typeSymbol: string`, `create: () => TypertSchema`; optional `decode?`, `encode?` | Zod-basiert; `create()` materialisiert das Schema erst bei der ersten Boundary-Nutzung. |
| `'src-json'` | — | Schwacher Fallback ohne Schema (Weak-Parser). |

**`RemoteResult<T>`** (`src\types.ts:76-78`): `{ ok: true; value: T } | { ok: false; error: RemoteFailure }`.
Der Remote-Face faltet Carrier-Fehler in den Error-Zweig; nur Assembly-Fehler (Arity, nicht gemountete
Methode, fehlender Context-Adapter) rejecten weiterhin.

**`RemoteStream<Out, In = never>`** (`src\types.ts:93`): `AsyncIterable<Out> & { readonly [STREAM_UPLINK]?: In }`
— `In` ist reiner Typmarker; `never` bedeutet „liest keinen Uplink" und der Deskriptor trägt dann keinen
Uplink-Codec.

**`RemoteStreamHandle<Out, In>`** (`src\types.ts:106-124`): `send(item)`, `end()`, `dispose()` plus
`AsyncIterable<Out>`. Ein Handle steht für **eine Generation**: bei Carrier-Verlust schlägt die Iteration
mit dem Carrier-Fehler fehl und das Handle ist beendet.

**`RemoteInvocation`** (`src\types.ts:397-421`) — als `this.ctx.invocation` in der Methode lesbar:
`request: {namespace, method, args}`, `service`, `peer: PeerScope`, `signal: AbortSignal`,
`uplink<In = unknown>(): AsyncIterable<In>` (nur **einmal** verfügbar).

**`PeerScope`** (`src\types.ts:382-390`): `{ id: PeerId; ctx: Context; dispose(): Promise<void> }`.

**Lookup- und Context-Registries** (`src\types.ts:456-681`): `TypertLookupProvider` /
`TypertLookupDefinition` / `TypertLookupResolver`, `TypertHostContextAdapter`,
`TypertHostContextResolver`, `TypertClientContextAdapter`. `TypertRegistryContract`
(`src\types.ts:685-690`) bündelt `local`, `remotes`, `lookups`, `contexts`.

**Merge-Extension-Punkte** (`src\types.ts:36-42, 182, 252`): `TypertLookupMap`, `TypertContextMap`,
`TypertRemoteMap`, `TypertRemoteScopeMap`, `TypertRemoteEventSelection`, `TypertRemoteNamespaceMap`,
`RemoteErrorDetailsMap`.

**JSON-Sicherheit.** `isRemoteJsonValue` / `isRemoteUplinkItem` (`src\json-value.ts`) sind die
Boundary-Prüfungen; `isTypertRemoteSegment` (`src\index.ts:23-25`) prüft Namen gegen die
Connection-Endpoint-Grammatik.

### 3.2 `typert\registry` — Laufzeit-Registry

Quellen: `src\service.ts` (749 Zeilen), `src\index.ts`, `src\types.ts`, `src\client\index.ts`.

Service-Key: **`typert`** (`TypertRegistry`, `service.ts:447-456`).

| Schlüssel-Funktion | Ergebnis | Quelle |
| --- | --- | --- |
| `typertKey(packageName, name)` | `<package>#<name>` | `service.ts:49-51` |
| `typertPackageKey(packageName, face)` | `<package>#<face>` | `service.ts:59-61` |
| `typertEndpoint(descriptor)` | `<namespace>/<method>` | `service.ts:68-70` |

Vier Teil-Registries, alle als `ctx.typert.*` exponiert:

| Registry | Methoden | Quelle |
| --- | --- | --- |
| `local: TypertLocalRegistry` | `get(endpoint)`, `hasSeen(endpoint)`, `list()`, `subscribe(listener)` | `service.ts:467-476` |
| `remotes: TypertRemoteRegistry` | `register(contribution)`, `get(endpoint)`, `list()`, `subscribe(listener)` | `service.ts:478-481`, `197-214` |
| `lookups: TypertLookupRegistry` | `register(key, provider)`, `configure(key, resolver)`, `get(key)`, `definitions()`, `keys()`, `subscribe(listener)` | `service.ts:483-486` |
| `contexts: TypertContextRegistry` | `registerHost`, `configureHost`, `registerClient`, `getHost(key)`, `getClient(key)`, `subscribe` | `service.ts:488-491` |

Zusätzlich auf dem Service selbst (`service.ts:500-591`): `register(contribution)`, `get(key)`,
`resolve(key)`, `list(filter?)`, `getPackage(packageName, face = 'host')`, `listPackages(filter?)`,
`toJSONSchema(key, params?)`.

**`TypertContribution`** (`registry\src\types.ts`, verwendet in `service.ts:500-521`): `package`, `face`
(`'host' | 'client'`), `schemas`, `model`, `invocations`. Eine Registrierung ist **atomar**: doppelte
Package-Face-Identitäten, Schema-Keys, Invocation-IDs oder Endpoints lehnen den ganzen Batch ab
(`service.ts:121-136`, `593-631`).

**`TypertRegistryChange`** (`typert\protocol\src\types.ts:528-531`): `kind` ∈
`'local' | 'remote' | 'lookup' | 'host-context' | 'client-context'`, plus `key`. Listener sind
synchron und werden contained aufgerufen; ein werfender Listener erzeugt nur eine Warnung
(`service.ts:97-105`, `456-460`).

**`hasSeen(endpoint)`** ist die Sperre gegen stillen Fallback: ein Endpoint, dessen strikte Definition
jemals registriert war, fällt nach dem Zurückziehen **nicht** auf SRC zurück (Gateway wirft dann
`gateway/definition-unavailable`, `gateway\src\index.ts:759-765`).

**Validierungsregeln** (`validateInvocation`, `service.ts:661-723`): nicht-leere `id`; Service-Key und
Namespace/Method nach der Endpoint-Grammatik; keine doppelten Wire-Felder; Lookup-Parameter brauchen einen
Lookup-Key und dürfen `acceptsUndefined` nicht setzen; JSON-Parameter dürfen keinen Lookup-Key deklarieren;
`cancellation.parameter` muss `'signal'` sein; `mode` muss `'stream'` sein; `scope` muss genau einen
Lookup-Parameter auswählen und darf nur bei `invocation.kind === 'direct'` vorkommen; bei
`invocation.kind === 'context'` darf das Context-Wire-Feld kein Parameter-Wire-Feld wiederholen.

### 3.3 `typert\loader` — automatische Registrierung

Quelle: `src\index.ts` (469 Zeilen).

| Export | Wert | Quelle |
| --- | --- | --- |
| `TYPERT_HOST_EXPORT` | `'./typert'` | `src\index.ts:40` |
| `name` | `'typert-loader'` | `src\index.ts:43` |
| `inject` | `['typert', 'loader']` | `src\index.ts:45` |
| `Config` | `z.object({ packages: z.array(z.string().min(1)).default([]) })` | `src\index.ts:54-56` |

Ablauf (`apply`, `src\index.ts:292-464`):

1. `ctx.baseUrl` muss gesetzt sein (der Katalog des Config-Trees, in dem die `cordis.yml` liegt), sonst
   `typert-loader: ctx.baseUrl is unset — the loader needs the config-tree anchor to resolve plugin packages`.
2. Für jeden Loader-Entry (plus explizit konfigurierte `packages`) wird `package.json` aufgelöst und der
   `./typert`-Export gelesen. Der Wert darf ein String oder ein Objekt mit String-`default` sein, sonst
   `typert-loader: <pkg> exports["./typert"] must be a string or an object with a string default`
   (`src\index.ts:68-78`).
3. Das Modul wird importiert und `validateTypertManifest()` prüft **jedes** Feld: `package` muss dem
   Paketnamen entsprechen, `face` muss `'host'` sein, `schemas` muss ein Array mit `name`+`create()` sein,
   `model.services`/`model.events`/`model.objects` müssen Strings/Dokumentation/Members/Typen tragen und
   jeder Invocation-Eintrag muss `id`/`service`/`namespace`/`method` haben, `invocation` muss
   `direct`/`context` sein, Parameter müssen `source: 'json' | 'lookup'` haben und **strikte** Codecs
   (`mode: 'strict'`) tragen.
4. Erfolgreiche Manifeste werden über `ctx.typert.register(manifest)` registriert; der Disposer wird beim
   Unmount des Entries aufgerufen.
5. Scanning ist inkrementell pro Entry-Name: jedes `internal/plugin`-Emit markiert den Entry-Namen dirty,
   ein Mikrotask-Flush gleicht ab (`src\index.ts:438-449`). Verdicts und importierte Manifeste werden pro
   Paketname gecacht und **laufen nie ab** — Plugin-Set-Änderungen greifen erst beim Neustart
   (`src\index.ts:306-313`).
6. Ein defekter Contributor wird im Steady-State nur geloggt; der Aktivierungslauf aggregiert alle Fehler
   zu einem `AggregateError` mit der Meldung
   `typert-loader: <n> typert contributor(s) failed to register:` (`src\index.ts:456-463`).

**Manuelle Registrierung** bleibt verfügbar: `ctx.typert.register()` für handgeschriebene Wire-Schemas,
Tests und Nicht-Loader-Kompositionen (`src\index.ts:21-23`).

### 3.4 `typert\generator` — Analyse und Artefakt-Emission

Quellen: `src\index.ts`, `src\analyzer.ts`, `src\model.ts`, `src\emitter.ts`, `src\renderer.ts`,
`src\workspace.ts`, `src\cordis-catalog.ts`, `src\tsdown-plugin.ts`.

Öffentliche API (`src\index.ts`): `WorkspaceAnalyzer`, `WorkspaceCaches`, `TypertAnalysisError`,
`FaceModelEmitter`, `TypertEmitError`, `TypeGraphRenderer`, `TypeGraphRenderError`,
`WorkspaceTypertGenerator`, plus `export *` aus `model.ts` und `cordis-catalog.ts`.

**Modell** (`src\model.ts`): `TypertFace = 'host' | 'client'` (Zeile 8); `FaceModel` (182),
`WorkspaceModel` (189), `PackageModel` (160), `InvocationModel` (128), `InvocationParameterModel` (117),
`RemoteBoundaryModel` (105), `SchemaModel` (91), `ServiceModel` (65), `EventModel` (74), `ObjectModel` (84),
`TypeGraph` (435), `TypeNodeModel` (355), `MemberModel` (279).

**Build-Wiring** (`src\tsdown-plugin.ts`): `typertPlugin({ mode?: 'package' | 'workspace', faces? })`
liefert ein rolldown-kompatibles Plugin:

- `transform` senkt Standard-Decorators in TypeScript-Dateien über `ts.transpileModule`
  (Target `ES2024`, Module `ESNext`, `sourceMap: true`), bevor gebündelt wird.
- `writeBundle` emittiert die modellgetriebenen Face-Artefakte am Paket-Ausgabewurzel.
- `TSC_OWNED_DIAGNOSTICS = { checkDiagnostics: false }` — Diagnostik gehört dem vollen Build/Typecheck.
- Pakete ohne Typert-/Remote-Export werden übersprungen.

**Artefakt-/Export-Regeln** (`src\workspace.ts:96-145`):

| Face | Subpath | Dateien | Regel |
| --- | --- | --- | --- |
| `host` | `./typert` | `lib/typert.host.js`, `lib/typert.host.d.ts` | Muss exakt diesen Export haben und beide Dateien in `files` führen. |
| `client` | `./client/typert` | `lib/typert.client.js`, `lib/typert.client.d.ts` | analog. |
| `host` (Remote-Methoden) | `./remote` | `lib/typert.remote-client.js`, `lib/typert.remote-client.d.ts` | Nur wenn das Paket Remote-Methoden publiziert; sonst `TypertAnalysisError: typert(host): <pkg> publishes Remote artifacts but has no Remote methods`. |

### 3.5 Was ein Paket tun muss, um einen Service für den Web-Client zu exponieren

Die Schritte sind aus den Controller-Paketen und den Generierungsregeln ableitbar:

1. **Service implementieren.** Von `TypertRemoteService` erben (oder `bindTypertRemote` verwenden) und den
   Cordis-Service-Key sowie optional einen abweichenden Wire-Namespace festlegen
   (`api\session-controller\src\index.ts:143`, `super(ctx, 'sessionController', { namespace: 'session' })`).
2. **Methoden markieren.** Jede exportierte Methode mit `@Remote`, `@Remote('name')` oder
   `@Remote({ mode: 'stream' })` dekorieren; gescopte Methoden mit `@RemoteScope(key, name?)`.
3. **Signatur-Regeln einhalten.** Alle Business-Parameter in Deklarationsreihenfolge; ein optionaler
   letzter `signal: AbortSignal`-Parameter signalisiert Cancellation. Ein Lookup-Parameter (z. B.
   `agent: Agent`) wird über einen registrierten Lookup-Provider auf ein Wire-Feld abgebildet.
4. **Typen client-sicher machen.** Das Paket braucht einen `./types`-Subpath mit den Request-/Result-
   Typen (siehe `api\session-controller\package.json` `exports["./types"]`).
5. **Rückgabetyp formen.** Unary → `Promise<T>` (Client: `RemoteResult<T>`); Stream →
   `AsyncIterable<T>` mit `@Remote({ mode: 'stream' })` (Client: `RemoteStreamHandle<T, never>`).
6. **`package.json`-Felder setzen.** `exports["./typert"]`, `exports["./remote"]`, `exports["./client"]`,
   `files`-Einträge für `lib\typert.host.*` und `lib\typert.remote-client.*`; Dependencies auf
   `@deepseek-ai/dsh-typert-protocol` und `zod`.
7. **Bundeln.** `pnpm bundle` (tsdown) mit dem `typertPlugin`; der Generator emittiert die Artefakte.
8. **Komponieren.** Host-Seite: eine `cordis.yml`-Zeile mit dem Paketnamen. Client-Seite: das generierte
   `remote`-Artefakt in `packages\api\remotes\src\client\index.ts` importieren und in die
   `$mount`-Reihenfolge aufnehmen.
9. **Optional: Events weiterleiten.** Ein Event in `API_REMOTE_FORWARDED_EVENTS` aufnehmen
   (`packages\api\remotes\src\remote-events.ts`) und die Cordis-`Events`-Deklaration über einen
   `./types`-Import in die Compilation-Face ziehen.

Zur Laufzeit liefert der Loader das `./typert`-Manifest in `ctx.typert` (Schritt 3.3); der Gateway
`typertGateway` dispatcht `<namespace>/<method>` (Abschnitt 1.10); der Client mountet das `remote`-Artefakt
und installiert `ctx.remote.<namespace>` (Abschnitt 3.6).

### 3.6 Client-Projektion

`packages\api\gateway\src\client\index.ts` (882 Zeilen) installiert den Cordis-Service **`remote`**
(`inject = ['typert', 'connection']`, Zeile 134).

| Export | Bedeutung | Quelle |
| --- | --- | --- |
| `ClientRemote` | `TypertClientRemote` + `$stream<Item>(options)` + `$host: RemoteHostFacts` | `client\index.ts:103-116` |
| `$mount(contribution)` | Mountet ein generiertes Host-for-Client-Artefakt in der aufrufenden Fiber | `client\index.ts:202-210` |
| `$on(event, listener)` | Abonniert ein weitergeleitetes Host-Event | `client\index.ts:212-217` |
| `RemoteHostFacts` | `{ home: string \| undefined; isLoopback: boolean }` | `client\index.ts:119-124` |

Ein Namespace wird als eigener Cordis-Plugin-Fiber namens `remote.<namespace>` erzeugt, damit die ganze
Deskriptor-Gruppe synchron im `apply` installiert wird und ein abhängiger Plugin nie eine halb gefüllte
Namespace sieht (`client\index.ts:348-380`). Methoden werden als `enumerable`-Getter auf der
Namespace-Service-Instanz definiert und lösen bei Aufruf auf `direct`/`scoped` auf
(`client\index.ts:669-704`).

**Validierung beim Mount** (`validateContribution`, `client\index.ts:269-311`): keine doppelten
`direct`/`scoped`-Methoden pro Namespace, kein Konflikt mit dem `remote`-Service selbst, kein Konflikt mit
einem bestehenden Cordis-Property, und **jeder** Parameter-, Uplink- und Context-Codec muss
`mode: 'strict'` haben — sonst `client api: generated Remote <endpoint> field <field> has no strict codec`.

**Fehlerfaltung im Client** (`client\index.ts:807-838`): ein zurückgezogener Endpoint ergibt
`gateway/internal` mit `client api: Remote method <endpoint> is no longer mounted`; ein Carrier-Throw
ergibt `gateway/internal` mit `client api: <endpoint> failed: <message>`; ein vom Aufrufer abgebrochener
Aufruf ergibt `gateway/cancelled` mit `client api: Remote invocation "<endpoint>" was aborted`.

---

## 4. Die Host-Schicht

### 4.1 `host\webserver` — `@deepseek-ai/dsh-host-webserver`

Quelle: `src\index.ts` (557 Zeilen), `src\injections.ts`.
Zweck (Dateikopf, Zeilen 1–8): „`node:http` route registration — `node:https` when `tls` names a certificate
and key — with optional gzip, index injection, and one fallback seat. It knows no harness concepts and
serves no files; the composing application owns dist serving."

Service-Key: **`webServer`** (`declare module '@deepseek-ai/cordis'`, `src\index.ts:27-41`).

**`Config`** (`src\index.ts:76-104`) und `static Config` (`src\index.ts:262-280`):

| Feld | Typ | Default | Anmerkung |
| --- | --- | --- | --- |
| `host` | `string` | **kein Default** (`z.transform(z.string(), …).required()`) | Muss ein **konkretes** IPv4-/IPv6-Literal einer lokalen Schnittstelle sein. Wildcard-Adressen (`0.0.0.0`, `::`) werden beim Laden abgelehnt: `webserver: host "<v>" is an unspecified (wildcard) address, which is not supported: binding every interface would expose remote code execution to the network; bind one concrete IPv4 or IPv6 address of a local interface instead` (`src\index.ts:266-268`). Nicht-Literal: `webserver: host "<v>" is not a concrete IPv4 or IPv6 address literal` (`src\index.ts:156-158`). |
| `port` | `number` | **kein Default** (`z.natural().max(65535).required()`) | `0` fordert einen OS-vergebenen Port an. Der effektive Port ist über `webServer.port` lesbar (`src\index.ts:309-312`). |
| `tls?` | `TlsConfig` | `undefined` | `{ certFile: string, keyFile: string }`, beide Pflicht. Beide Dateien werden **einmal vor dem Bind** gelesen (PEM, ohne Passphrase); leer/unlesbar/ungültig/Mismatch lehnt die Initialisierung ab statt auf HTTP zurückzufallen (`src\index.ts:89-97`, `240-251`). |
| `compression?` | `'none' \| 'gzip'` | `'none'` (`DEFAULT_COMPRESSION`, `src\index.ts:106`) | Nur für socketgestützte HTTP-Requests. |
| `compressionLevel?` | `number` (0–9) | `1` (`DEFAULT_COMPRESSION_LEVEL`, `src\index.ts:107`) | Gzip-DEFLATE-Level. |
| `compressionThresholdBytes?` | `number` | `1024` (`DEFAULT_COMPRESSION_THRESHOLD_BYTES`, `src\index.ts:108`) | Mindestlänge für gzip; unbekannt lange Streams sind berechtigt. |

**Default-Port und Bind-Adresse kommen nicht aus dem Paket**, sondern aus der Komposition. Der Web-Bundle-
Patch setzt (`packages\bundle\web-app\cordis.patch.yml:179-188`):

```yaml
- id: webserver
  name: '@deepseek-ai/dsh-host-webserver'
  inject: [webStartup]
  config:
    host: !!js ctx.webStartup.host ?? '127.0.0.1'
    port: !!js ctx.webStartup.port ?? 3080
    tls: !!js ctx.webStartup.tls
    compression: gzip
    compressionLevel: 1
    compressionThresholdBytes: 1024
```

Also: **Default-Bind `127.0.0.1`, Default-Port `3080`**, gzip aktiviert.

**Routen-Registrierungs-API** (öffentliche Methoden von `WebServer`):

| Signatur | Quelle | Verhalten |
| --- | --- | --- |
| `register(route: WebRoute): () => void` | `src\index.ts:334-341` | `WebRoute = { kind: 'exact' \| 'prefix'; path: string; handler }`. Doppelte `(kind, path)` werfen `webserver: duplicate <kind> route "<path>"`. |
| `registerUpgrade(route: WebUpgradeRoute): () => void` | `src\index.ts:349-355` | Exakter Pfad; doppelt wirft `webserver: duplicate upgrade route "<path>"`. |
| `registerFallback(handler): () => void` | `src\index.ts:365-371` | **Ein** Owner; zweite Registrierung wirft `webserver: fallback already registered`. |
| `tapIndex(transform: (html)=>string): () => void` | `src\index.ts:380-386` | Roh-HTML-Transform, in Registrierungsreihenfolge nach den strukturierten Rows angewandt. |
| `applyIndexTaps(html): string` | `src\index.ts:528-532` | Wendet nur die Taps an. |
| `collectIndexInjections(): IndexInjection[]` | `src\index.ts:540-544` | Ein `webserver/index-inject`-Emit; Subscriber pushen ihre Zeilen. |
| `renderIndex(html): string` | `src\index.ts:552-554` | Erst strukturierte Injections, dann Taps. |

**Matching.** `match(pathname)` versucht zuerst die Exact-Tabelle, danach das **längste Präfix** — ein
Präfix `p` matcht `p` und `p/<anything>` (`src\index.ts:43-44`, `510-520`).

**Routen im ausgelieferten Web-Bundle.** `webserver` selbst registriert **keine** Route; die Routen kommen
von anderen Paketen:

| Route | Methode | Owner | Quelle |
| --- | --- | --- | --- |
| `/api/*` (RPC) | beliebig | `@deepseek-ai/dsh-client-connection` | `packages\bundle\web-app\cordis.patch.yml:229-236` |
| `/api/remote.mux` | Upgrade (WebSocket) | `@deepseek-ai/dsh-api-gateway` | `packages\api\gateway\src\index.ts:251-263` |
| `/open-in-app/apps` | GET | `@deepseek-ai/dsh-host-open-in-app` | `packages\host\open-in-app\src\shared.ts:11` |
| `/open-in-app/icon/*` | GET (prefix) | `@deepseek-ai/dsh-host-open-in-app` | `packages\host\open-in-app\src\shared.ts:17` |
| `/open-in-app/open` | POST | `@deepseek-ai/dsh-host-open-in-app` | `packages\host\open-in-app\src\shared.ts:23` |
| Fallback (SPA) | GET/HEAD | `@deepseek-ai/dsh-host-frontend-static` | `packages\host\frontend-static\src\index.ts:121` |

**Request-Behandlung** (`Service.init`, `src\index.ts:389-508`):

1. `rawPath = new URL(req.url ?? '/', 'http://x').pathname`; `match(rawPath)`.
2. Treffer → `await route.handler(req, res)`; der Handler besitzt den vollen Response-Lifecycle.
3. Kein Treffer und kein Fallback → `404` mit leerem Body (`src\index.ts:400-403`).
4. Lehnt `handle()` ab, loggt der Last-Resort-Guard über `ctx.logger.warn`; sind Header schon gesendet,
   wird `res.destroy()` aufgerufen, sonst `400` mit leerem Body. **Niemals** ein Prozess-Exit
   (`src\index.ts:407-422`).

**Upgrade-/WebSocket-Handling** (`src\index.ts:448-481`): Der Server hört auf `'upgrade'`, liest den
Pfadnamen und schlägt in der Upgrade-Tabelle nach. Kein Treffer → `socket.destroy()`. Ein Fehler beim
Lesen der URL → Warnung + `socket.destroy()`. Der Handler wird aufgerufen; eine Synchronsynchron-Exception
**oder** eine abgelehnte Promise führen zu Warnung + `socket.destroy()`. Alle upgegradeten Sockets landen
in `upgradedSockets`, damit sie beim Herunterfahren geschlossen werden.

**Header / CORS.** Das Paket setzt **keine** CORS-Header. Es setzt überhaupt keine globalen Header; jeder
Handler besitzt seine Response. Die einzigen Header, die das Paket selbst erzeugt, stammen aus dem
gzip-Pfad (`compression`-Middleware) und aus `renderIndexInjections`. Explizite Filter
(`createGzipMiddleware`, `src\index.ts:201-229`):

- kein gzip, wenn `content-range` gesetzt ist,
- kein gzip für `content-type: text/event-stream*`,
- gzip **erzwungen** für `multipart/form-data` (`/^multipart\/form-data(?:;|$)/i`),
- sonst die `compression`-Standardfilter.
- Ein Response ohne `.socket` (Web-Worker-Tunnel) überspringt die Middleware komplett.
- `Accept-Encoding` wird über `Negotiator(req).encoding(['gzip','identity'])` auf `gzip` oder `identity`
  normalisiert.

**Bind-Adress-Helfer** (exportiert): `isWildcardHost(host)` (`src\index.ts:171-174`),
`isLoopbackHost(host)` (`src\index.ts:181-184`), `normalizeBindAddress(host)` (`src\index.ts:195-199`).
`normalizeBindAddress` wirft `webserver: host "<v>" is not a concrete IPv4 or IPv6 address literal` für
Nicht-Literale. Loopback umfasst jede Adresse in `127/8`, `::1` und deren IPv4-gemappte Formen.

**Protokoll-Getter**: `webServer.protocol` ist `'https:'` bei gesetztem `tls`, sonst `'http:'` — der Wert
folgt der Konfiguration, nie einem Socket oder Request-Header (`src\index.ts:328-326`).

**Shutdown.** Der Effekt-Disposer schließt den Server (`server.close`), ruft `closeAllConnections()` und
zerstört zusätzlich explizit alle upgegradeten und alle TLS-Rohsockets, weil Node upgegradete Sockets nicht
in `closeAllConnections()` führt und eine TLS-Verbindung erst nach dem Handshake in diese Tabelle eintritt
(`src\index.ts:493-506`).

**Static-File-Serving.** `webserver` liefert **keine** Dateien. Das erledigt
`host\frontend-static` über den Fallback-Sitz (siehe 4.2). Wo das gebaute `dist/` erwartet wird:
`resolveDistIndex()` in `packages\bundle\web-app\src\index.ts:172-180` löst auf
`join(dirname(require.resolve('@deepseek-ai/dsh-web-frontend/package.json')), 'dist', 'index.html')` auf.
Im Workspace ist das `apps\web\dist\index.html` (Paket `@deepseek-ai/dsh-web-frontend`, `name` in
`apps\web\package.json`, `exports["./dist/*"]`). Ist das Paket nicht auflösbar:
`web-app: @deepseek-ai/dsh-web-frontend is not resolvable from this composition`.

### 4.2 `host\frontend-static` — `@deepseek-ai/dsh-host-frontend-static`

Quelle: `src\index.ts` (140 Zeilen). Plugin-Name: `frontend-static`; `inject = ['webServer', 'connection']`
(`src\index.ts:24-27`).

**`Config`** (`src\index.ts:30-37`): genau ein Feld `distIndex: string` — **absoluter** Pfad zu `index.html`
im dist-Wurzelverzeichnis, `z.string().required()`, kein Default. Der `distRoot` ist `dirname(distIndex)`.

**MIME-Tabelle** (`src\index.ts:41-53`): `.html` → `text/html; charset=utf-8`,
`.js` → `text/javascript; charset=utf-8`, `.css` → `text/css; charset=utf-8`, `.svg` → `image/svg+xml`,
`.json`/`.map` → `application/json`, `.webmanifest` → `application/manifest+json`,
`.gz` → `application/gzip` (als eigene Bytes, nie als `Content-Encoding`); alles andere →
`application/octet-stream`.

**HTTP-Verhalten** (`serveStatic`, `src\index.ts:71-106`):

| Situation | Antwort |
| --- | --- |
| Pfad außerhalb von `distRoot` (Traversal) | `403` mit leerem Body |
| `target === distRoot` oder `target === distIndex` | `authorizeIndex()` muss zustimmen (sonst übernimmt die Connection-Authentifizierung die Antwort); danach `renderIndex()` → `200` + `content-type: text/html; charset=utf-8` |
| Datei vorhanden | `200` + MIME nach Endung |
| `ENOENT` / `EISDIR` / `ENOTDIR` | `404` mit leerem Body |
| Anderer Filesystem-Fehler | wird weitergereicht → Webserver-Guard antwortet `400` |
| Methode weder `GET` noch `HEAD` | `405` mit leerem Body (Fallback-Semantik: benannte Routen besitzen ihr Methoden-Handling) |

Der Index-Body wird zusätzlich mit `<base href="./">` direkt nach dem `<head>`-Tag versehen
(`src\index.ts:117-120`). Der Fallback wird beim `ctx.effect`-Aufbau registriert
(`frontend-static: fallback seat`).

### 4.3 `host\plugin-inventory` — `@deepseek-ai/dsh-host-plugin-inventory`

Quelle: `src\index.ts` (114 Zeilen), `src\types.ts` (68 Zeilen). `static inject = ['loader']`
(`src\index.ts:52`).

Zweck: „Read-only projection of the current Cordis Loader plugin entries."
Service-Klasse `PluginInventoryGateway extends TypertRemoteService`, Service-Key **`pluginInventory`**
(`super(ctx, 'pluginInventory')`, `src\index.ts:55`).

| Endpoint | Parameter | Rückgabe | Art |
| --- | --- | --- | --- |
| `pluginInventory/list` | — | `PluginInventorySnapshot` | R/R |

`PluginInventorySnapshot` (`src\types.ts`): `entries: PluginInventoryEntry[]`, optional
`agentPresets: AgentPresetPluginGroup[]`, optional `managementAvailable: true`.
`PluginInventoryEntry`: `entryId`, `moduleName`, `enabled`, `fiberPhase`, optional `meta`.
`pluginEntryId(value: string)` brandet eine Loader-Entry-ID (`src\index.ts:26-28`).

Fiber-Phasen-Mapping (`src\index.ts:31-48`): `PENDING 0→'pending'`, `LOADING 1→'loading'`,
`ACTIVE 2→'active'`, `FAILED 3→'failed'`, `DISPOSED 4→null`, `UNLOADING 5→'unloading'`.

`readPluginInventory(ctx)` überspringt `entry.options.group`-Einträge, liest `pluginPackages.metaOf()`
und hängt bei vorhandenem `agentPresets`-Service (`ctx.get('agentPresets')`) dessen
`compositionInventory()` an. Das Plugin setzt `managementAvailable: true` nur, wenn `ctx.get('pluginManager')`
existiert (`src\index.ts:97-113`). Es gibt **keinen** Cache — jeder Aufruf liest den Loader direkt.

HTTP-Oberfläche: **keine**.

### 4.4 `host\open-in-app` — `@deepseek-ai/dsh-host-open-in-app`

Quelle: `src\index.ts` (294 Zeilen), `src\resolver.ts` (719), `src\catalog.ts` (377), `src\icons.ts` (154),
`src\shared.ts` (29), `src\internals.ts` (4).
Plugin-Name: `open-in-app`; `inject = ['webServer', 'connection', 'subprocess']` (`src\index.ts:45-47`).

**`Config`** (`src\index.ts:50-76`): drei Pflichtfelder, alle `z.number().step(1).min(1).max(600_000).required()`
(**kein** Default):

| Feld | Bedeutung |
| --- | --- |
| `probeTimeoutMs` | Deadline pro Host-Befehl zur Katalog-Auflösung (`xcode-select`, Windows-Registry-Reads). |
| `iconTimeoutMs` | Deadline pro Host-Befehl zur Icon-Extraktion (`plutil`/`sips` auf macOS, PowerShell auf Windows). |
| `launchWatchMs` | Früher-Fehler-Fenster pro Launch: ein noch laufender Launcher nach Fensterschluss zählt als gestartet. |

Die Web-Bundle-Komposition setzt `probeTimeoutMs: 10000`, `iconTimeoutMs: 10000`, `launchWatchMs: 1000`
(`packages\bundle\web-app\cordis.patch.yml:81-86`).

**HTTP-Oberfläche** — drei Routen, alle über `ctx.webServer.register()`:

| Pfad | `kind` | Methode | Antwort | Quelle |
| --- | --- | --- | --- | --- |
| `/open-in-app/apps` | `exact` | GET (sonst `405` + `allow: GET`) | `200` `application/json; charset=utf-8`, `cache-control: no-store`, Body `{ apps: string[] }` | `src\index.ts:193-204`, `src\shared.ts:11` |
| `/open-in-app/icon` | `prefix` | GET (sonst `405` + `allow: GET`) | PNG-Bundle-Icon pro App-ID; unbekannt/nicht verfügbar → `404` mit `{ code: 'not-found', message: 'no icon for <id>' }` | `src\index.ts:206-229`, `src\shared.ts:17` |
| `/open-in-app/open` | `exact` | POST (sonst `405` + `allow: POST`) | Launch einer Anwendung auf einem Verzeichnis | `src\index.ts`, `src\shared.ts:23` |

**Sicherheitsmodell.** Jede Route ruft zuerst `connectionOf(ctx).requestRejection(req)`; ein Rückgabewert
`401 | 403` beendet die Anfrage sofort (`src\index.ts:184-191`). Die Connection-Fence prüft Host/Origin
(Schutz gegen DNS-Rebinding und Cross-Site-Aufrufe) und die Browser-Authentifizierung
(Login-Token-Cookie). Zusätzlich validiert die Open-Route im Wire:

- `content-type: application/json`,
- Body-Obergrenze **64 KiB** (`MAX_BODY_BYTES = 64 * 1024`, `src\index.ts:89`; Überschreitung wird
  gedrained, damit die Ablehnung lesbar bleibt, `src\index.ts:107-120`),
- String-Felder `app` und `path`,
- eine im aufgelösten Katalog verfügbare ID,
- ein absoluter Pfad, der auf ein **existierendes** Verzeichnis zeigt.

**Katalog-Auflösung.** Lazy, einmal pro Plugin-Leben, beim ersten Request: `resolutions ??= resolveOpenInAppApps(...)`
(`src\index.ts:154-157`). Ein Launch mit `ENOENT` invalidiert genau diesen Eintrag und löst ihn **einmal**
neu auf (`refreshResolution`, `src\index.ts:168-183`).

### 4.5 `host\directory-picker` — `@deepseek-ai/dsh-host-directory-picker`

Quelle: `src\index.ts` (115 Zeilen), `src\types.ts` (37 Zeilen). Dieses Paket ist eine **Service-Definition**
(Seam), kein Backend.

Service-Key: **`directoryPicker`** (`declare module '@deepseek-ai/cordis'`, `src\index.ts:90-94`).
Abstrakte Basisklasse `DirectoryPicker extends Service` mit genau einer abstrakten Methode
`capability(): DirectoryPickerCapability` (`src\index.ts:103-113`).

Zwei Capability-Formen (`src\index.ts:20-59`):

| `kind` | Methoden | Bedeutung |
| --- | --- | --- |
| `'native'` | `pick(signal: AbortSignal): Promise<string \| null>` | Ein OS-Chooser auf dem Host-Display. `null` = Operator hat abgebrochen. |
| `'browse'` | `list(path?: string, signal?: AbortSignal): Promise<DirectoryListing>`, `createDirectory(path: string, name: string): Promise<string>` | Listing-/Erzeugungs-Primitive für einen In-App-Browser; funktioniert auch für entfernte Clients. |

`DirectoryPickerCapabilities` (`src\index.ts:66-69`) ist merge-erweiterbar; ein unbekanntes `kind` soll laut
Dokumentation die Auswahl-Affordanz **verstecken**, nicht fehlschlagen (`src\index.ts:6-10`).

**Fehlervokabular** (`src\index.ts:74-88`): `DirectoryPickerErrorCode =
'directory-unreadable' | 'directory-exists' | 'directory-create-failed'`; `DirectoryPickerError` trägt
`code` und `path`.

Ein zweiter Backend-Plugin-Load im selben Context wirft (Cordis-Standardverhalten bei doppeltem
Service-Key, `src\index.ts:96-102`). Das Capability-Objekt muss für die Service-Lebensdauer **stabil**
bleiben, weil Konsumenten es über Aufrufe hinweg cachen dürfen.

HTTP-Oberfläche: **keine**. Die Capability erreicht den Browser über den Remote-Namespace
`directoryPicker` des `workspace-controller` (Abschnitt 2.5).

### 4.6 `host\directory-picker-auto` — `@deepseek-ai/dsh-host-directory-picker-auto`

Quelle: `src\index.ts` (112 Zeilen), `src\resolve.ts` (61), `src\probe.ts` (40).
Plugin-Name: `directory-picker-auto`; `inject = ['webServer', 'connection', 'loader']`
(`src\index.ts:31-37`).

Zweck: ein adaptiver Chooser — er löst **einmal pro Boot** die Host-Situation auf und mountet das passende
Interaktions-Paar (Backend + Client-Surface) als echte Loader-Entries im In-Memory-Root-Tree.

| Konstante | Wert | Quelle |
| --- | --- | --- |
| `BACKEND_PACKAGES.native` | `@deepseek-ai/dsh-host-directory-picker-native` | `src\index.ts:45-48` |
| `BACKEND_PACKAGES.browse` | `@deepseek-ai/dsh-host-directory-picker-browse` | `src\index.ts:45-48` |
| `SURFACE_PACKAGES.native` | `@deepseek-ai/dsh-client-ui-directory-picker-native` | `src\index.ts:57-60` |
| `SURFACE_PACKAGES.browse` | `@deepseek-ai/dsh-client-ui-directory-picker-browse` | `src\index.ts:57-60` |

**Auflösungsregel** (`resolveDirectoryPickerBackend`, `src\resolve.ts:55-61`), reine Funktion der
Boot-Fakten `{ bindHost, allowsRemoteAuthorities, platform, ssh, env, linuxChooser }`:

1. `allowsRemoteAuthorities === true` **oder** `!isLoopbackHost(bindHost)` → `'browse'`.
2. `ssh === true` → `'browse'`.
3. `platform === 'darwin' | 'win32'` → `'native'`.
4. Sonst (linux): `'browse'`, außer `linuxChooser === true` **und** (`DISPLAY` oder `WAYLAND_DISPLAY`
   gesetzt und nicht leer) → `'native'`.

Leere Umgebungswerte zählen als „nicht gesetzt" (`present()`, `src\resolve.ts:39`).

Die Einträge werden mit `ctx.loader.create({ name })` angelegt — das In-Memory-Root-Tree schreibt nichts
zurück in eine Configdatei („write() is a no-op", `src\index.ts:79-81`). Reihenfolge: **Backend zuerst**,
dann Surface. Schlägt einer fehl, wird der ganze Aufbau abgebaut, um eine Kollision beim Retry zu vermeiden
(`src\index.ts:103-110`).

HTTP-Oberfläche: **keine** eigenen Routen. Config: **keine** (das Plugin nimmt keinen `Config`-Parameter,
`apply(ctx)`).

### 4.7 `host\directory-picker-browse` — `@deepseek-ai/dsh-host-directory-picker-browse`

Quelle: `src\index.ts` (324 Zeilen). Registriert **`ctx.directoryPicker`** mit der `browse`-Capability;
nutzt ausschließlich Node-stdlib (`mkdir`, `opendir`, `stat`, `homedir`, `path`), nichts rendert auf dem
Host-Display.

**`Config`** (`src\index.ts:180-196`): genau ein Feld
`maxEntries: z.natural().min(1).default(1000)` — die Obergrenze des **vollständigen** Listing-Ergebnisses
eines `list`-Aufrufs (versteckte Zeilen inklusive). Der Default folgt laut Kommentar der GitHub-Web-UI.

**Antwortform `DirectoryListing`**: `{ path, home, crumbs, entries, truncated }` (`src\index.ts:296`).
`crumbs` ist die Ahnenkette von der Filesystem-Wurzel bis `target` inklusive, jede Zeile ein Sprungziel
(`ancestryCrumbs`, `src\index.ts:28-38`); das Wurzel-Crumb wird mit seinem vollen Pfad beschriftet, weil
`basename` einer Wurzel `''` ist.

**Beschränkung des Speichers:** ein streamendes, namenssortiertes, beschränktes Fenster (`boundedInsert`,
`src\index.ts:76-96`) mit `keep = maxEntries + 1` hält den Speicher bei O(keep), unabhängig von der
Kinderzahl. Ein volles Fenster und ein Kandidat am oder hinter dem Ende kostet O(1) — bewusst gewählt,
damit 100 000 Kinder gegen ein 1 001-Fenster nicht ~10⁸ Vergleiche kosten. Wird evakuiert, wird
`truncated = true` gesetzt (`src\index.ts:283-291`).

**Pfad-Qualifikation** (`fullyQualified(path, platform)`, `src\index.ts:50-54`): auf POSIX `posix.isAbsolute`;
auf Windows nur laufwerksqualifiziert (`C:\…`) oder vollständiges UNC (`\\server\share…`). Grund: `\foo`,
`/foo` und unvollständige UNC-Präfixe bestehen `isAbsolute`, lösen aber gegen das aktuelle Laufwerk auf —
ein Wire-Wert darf nie gegen den Host-cwd auflösen.

**Abbruch-Semantik:** `raceAbort(operation, signal)` (`src\index.ts:108-110`) — Node-Filesystem-Reads sind
nicht widerrufbar, also läuft die Operation weiter und ihr spätes Settle wird verschluckt, damit ein
aufgegebener Read nicht als unbehandelte Rejection auftaucht.

HTTP-Oberfläche: **keine**.

### 4.8 `host\directory-picker-native` — `@deepseek-ai/dsh-host-directory-picker-native`

Quellen: `src\index.ts` (32 Zeilen), `src\native-picker.ts` (93), `src\win32-dialog.ts` (146),
`src\win32-dialog-bindings.ts` (193), `src\win32-dialog-logic.ts` (141), `src\win32-dialog-worker.ts` (48),
`src\win32-dialog-host.ts` (31).

Registriert **`ctx.directoryPicker`** mit der `native`-Capability; `pick(signal)` leitet direkt an
`pickNativeDirectory(signal)` weiter (`src\index.ts:22-35`). Das Capability-Objekt ist pro Service-Leben
stabil.

Mechanik je Plattform (Dateikopf, Zeilen 1–11): macOS `osascript`, Linux Zenity mit KDialog-Fallback,
Windows `IFileOpenDialog` in einem gespawnten Kindprozess (koffi-getriebene COM-Konversation auf dem
Main-Thread des Kindes, davor ein synthetisierter Alt-Tastendruck, damit der Dialog auch dann als
Vordergrund aktiviert wird, wenn ein Hintergrund-Host das Kind gestartet hat).

HTTP-Oberfläche: **keine**. Config: kein `Config`-Objekt im Paket-`index.ts`.

### 4.9 `host\product-telemetry-otel` — `@deepseek-ai/dsh-host-product-telemetry-otel`

Quelle: `src\index.ts` (121 Zeilen). `static inject = ['otel']` (`src\index.ts:62`).
Service-Key: **`productTelemetry`** (`declare module '@deepseek-ai/cordis'`, `src\index.ts:8-10`).

**`Config`** (`src\index.ts:18-58`):

| Feld | Typ | Default |
| --- | --- | --- |
| `endpoint` | `string` (HTTP(S)-Logs-URL) | `'https://dsh-otel-collector.deepseeksvc.com/v1/logs'` |
| `channel` | `string` (Collector-Routing-Header `x-channel`) | `'dsh_otel_report'` (`.min(1)`) |
| `serviceName` | `string` | **required** |
| `serviceVersion` | `string` | **required** |
| `compression?` | `'none' \| 'gzip'` | keiner (dann gelten `OTEL_EXPORTER_OTLP_LOGS_COMPRESSION` / `OTEL_EXPORTER_OTLP_COMPRESSION`) |
| `maxExportBatchSize` | positive Ganzzahl ≤ 2 147 483 647 | `512` |
| `maxQueueSize` | positive Ganzzahl | `2048` |
| `scheduledDelayMillis` | positive Ganzzahl | `30000` |
| `timeoutMillis` | positive Ganzzahl | `15000` |
| `exportTimeoutMillis` | positive Ganzzahl | `20000` |
| `shutdownTimeoutMillis` | positive Ganzzahl | `21000` |

Konstruktor-Validierung (`src\index.ts:66-83`):
`product-telemetry-otel: endpoint must be a valid HTTP(S) URL`;
`product-telemetry-otel: channel must be a valid HTTP header value`;
`product-telemetry-otel: endpoint must use HTTP or HTTPS`;
`product-telemetry-otel: maxExportBatchSize must not exceed maxQueueSize`.

API: genau eine öffentliche Methode `emit(record: ProductTelemetryRecord): void` — reiht ein Event ein,
ohne auf Netzwerkzustellung zu warten (`src\index.ts:118-120`). Beim Unload läuft ein Shutdown mit
`shutdownTimeoutMillis`; bei Überschreitung:
`Product telemetry shutdown deadline exceeded; pending events may be lost` (Warnung).

Das Web-Bundle überschreibt die Defaults für den Desktop-Profilschnitt auf
`scheduledDelayMillis: 30000`, `timeoutMillis: 15000`, `exportTimeoutMillis: 20000`,
`shutdownTimeoutMillis: 2000`, `serviceName: deepseek-harness-desktop`
(`packages\bundle\web-app\cordis.patch.yml:45-55`).

HTTP-Oberfläche: **keine**. (OTLP-Export geht ausgehend per HTTP POST an `endpoint`.)

### 4.10 Host-Pakete — Zusammenfassung

| Paket | npm-Name | Service-Key | `Config` | HTTP-Oberfläche |
| --- | --- | --- | --- | --- |
| `host\webserver` | `@deepseek-ai/dsh-host-webserver` | `webServer` | `host`*, `port`*, `tls?`, `compression='none'`, `compressionLevel=1`, `compressionThresholdBytes=1024` | Route-Registrierungs-API; keine eigene Route |
| `host\frontend-static` | `@deepseek-ai/dsh-host-frontend-static` | (Plugin, kein Service) | `distIndex`* | Fallback-Sitz: gesamte SPA, 403/404/405 |
| `host\plugin-inventory` | `@deepseek-ai/dsh-host-plugin-inventory` | `pluginInventory` | — | keine |
| `host\open-in-app` | `@deepseek-ai/dsh-host-open-in-app` | (Plugin, kein Service) | `probeTimeoutMs`*, `iconTimeoutMs`*, `launchWatchMs`* | GET `/open-in-app/apps`, GET `/open-in-app/icon/*`, POST `/open-in-app/open` |
| `host\directory-picker` | `@deepseek-ai/dsh-host-directory-picker` | `directoryPicker` (abstrakt) | — | keine |
| `host\directory-picker-auto` | `@deepseek-ai/dsh-host-directory-picker-auto` | (Plugin) | — | keine |
| `host\directory-picker-browse` | `@deepseek-ai/dsh-host-directory-picker-browse` | `directoryPicker` | `maxEntries=1000` | keine |
| `host\directory-picker-native` | `@deepseek-ai/dsh-host-directory-picker-native` | `directoryPicker` | — | keine |
| `host\product-telemetry-otel` | `@deepseek-ai/dsh-host-product-telemetry-otel` | `productTelemetry` | siehe 4.9 | keine |

`*` = Pflichtfeld ohne Default.

---
