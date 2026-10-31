# `pmh-attach` — Anhaengepunkt der Oberflaeche (Go)

> **Wozu.** Der Host liefert heute **eine** Oberflaeche aus. Das Docking- und
> Zoom-Zielbild aus [`../../docs/vision.md`](../../docs/vision.md) braucht einen
> **Anhaengepunkt**: mehrere Clients, mehrere Ansichten desselben Inhalts,
> Mensch und Agent im selben Raum. Genau das ist dieser Dienst.
>
> **Doku-Grundlage:** [`../../docs/decisions/hybrid-then-self-build.md`](../../docs/decisions/hybrid-then-self-build.md)
> §3.3 („Web-Attach-Dienst: ein Go-Dienst als HTTP/WebSocket-Gateway, hinter dem
> die Oberflaeche haengt"), [`../../docs/stack.md`](../../docs/stack.md) („das
> Gateway erst, wenn Lastmessungen zeigen, dass es der Engpass ist" — der
> TypeScript-Seam bleibt), [`../../docs/concept.md`](../../docs/concept.md) Regel
> 3 („Fehlgeschlagener Start ist ein **sichtbarer** Fehler") und Regel 4
> („Sprachgrenzen sind Dienstgrenzen").
>
> **Kein Ersatz fuer den Web-Server der Harness.** `pmh-attach` tritt **neben**
> den TS-Gateway-Seam. Der Host liefert die Oberflaeche weiter aus; dieser Dienst
> ist der Verteiler, an den sich mehrere Sichten anhaengen.

## Was er tut

Er nimmt Anhaengungen an (`attach`), verteilt einen Upstream-Strom auf **viele**
Clients und **mehrere Ansichten** desselben Inhalts (Fan-out 1 : N), nimmt
Trennungen an (`detach`), liefert nach einer Luecke den **vollen Zustand**
(`resync`) und macht einen fehlenden Upstream **sichtbar** statt still.

Die drei Begriffe, die den Dienst tragen:

| Begriff | Was er ist |
|---|---|
| **Anhaengung** (`Statement`) | die Deklaration eines Clients: **Ansicht** (`session`, `terminal`, `graph`, `files`) **plus Fenster/Panel-Kennung** (`windowId`) |
| **Strom** (`Stream`) | ein logischer Upstream-Strom, gewaehlt durch die **Ansicht**; traegt die monoton wachsende Sequenznummer |
| **Sicht** (`Session`) | ein angeschlossener Client mit **eigener gepufferter Warteschlange** |

Zwei Fenster derselben Ansicht teilen sich **einen** Upstream-Strom; zwei
Ansichten teilen sich **keinen**. Die Sequenznummer zaehlt, was der Hub
tatsaechlich weitergereicht hat — deshalb erkennt ein Client eine Luecke.

## Der Prozessvertrag

```text
pmh-attach [--host 127.0.0.1] [--port 8090] [--upstream <url>] [--json-logs]
pmh-attach --version
```

| Flag | Umgebung | Vorgabe | Bedeutung |
|---|---|---|---|
| `--host` | `PMH_ATTACH_HOST` | `127.0.0.1` | Bind-Adresse. **Wildcard nur mit `--allow-wildcard`** |
| `--port` | `PMH_ATTACH_PORT` | `8090` | Port; `0` laesst das Betriebssystem einen freien Port waehlen |
| `--upstream` | `PMH_ATTACH_UPSTREAM` | leer | Basis-Adresse des Harness. Leer = **Attrappe im eigenen Prozess** (`memory`) |
| `--json-logs` | `PMH_ATTACH_JSON_LOGS` | `false` | Protokoll als JSON statt als Text |
| `--allow-wildcard` | — | `false` | Bind an `0.0.0.0` bzw. `::` ausdruecklich erlauben |
| `--queue` | `PMH_ATTACH_QUEUE` | `64` | Warteschlange je Client in Rahmen |
| `--history` | `PMH_ATTACH_HISTORY` | `64` | vorgehaltene Rahmen je Strom fuer `resync` |
| `--ping-interval` | `PMH_ATTACH_PING_INTERVAL` | `2s` | Abstand der Herzschlag-Pings (`0` schaltet sie ab) |

**Exit-Codes:** `0` sauber beendet · `1` Aufruf- oder Adressfehler (auch der
Wildcard-Bind ohne `--allow-wildcard`) · `2` Konfigurationsfehler · `3` Port
belegt oder Server nicht startbar.

### Der Wildcard-Bind — dieselbe Haltung wie der Upstream-Host

Der Referenz-Harness lehnt einen Wildcard-Bind mit einer klaren Begruendung ab
(`packages/host/webserver/src/index.ts`: *„binding every interface would expose
remote code execution to the network"*). `pmh-attach` uebernimmt diese Haltung:
ohne `--allow-wildcard` ist `--host 0.0.0.0` ein Fehler und **kein** stiller
Start von aussen erreichbar.

## HTTP-Oberflaeche

| Route | Zweck |
|---|---|
| `GET /healthz` | `200` mit `{"status":"ok","service":"pmh-attach",…}` — **ohne Auth**, fuer die Lebendigkeit |
| `GET /version` | Version, Go-Version, Plattform, Endpunkt |
| `GET /status` | Clients, Stroeme, Grenzen |
| `GET /v1/attach` | **WebSocket-Upgrade** — der Anhaengepunkt |

`/healthz` antwortet **auch dann 200**, wenn der Upstream nicht erreichbar ist:
der Dienst selbst lebt. Der fehlende Upstream steht sichtbar im Feld `upstream`
und im Protokoll — und er scheitert sichtbar beim Anhaengen, nie still.

## Protokoll

Der Vertrag ist zweigeteilt: **woertlich** uebernommen ist alles, was im
Core-Gateway-Seam nachweisbar ist, **eigene Ergaenzungen** sind alles, was der
Core nicht kennt. Der TS-Seam darf nicht zwei Semantiken kennen
(`docs/decisions/hybrid-then-self-build.md` §5).

### Namen, woertlich aus der Quelle

Belegte Quelle (Vorlage, nur gelesen):
`packages/api/gateway/src/stream-protocol.ts`,
`packages/api/gateway/src/remote-error-codes.ts`,
`packages/api/gateway/src/stream-server.ts`,
`packages/typert/protocol/src/types.ts`.

| Name | Art | Beleg |
|---|---|---|
| `item` | Rahmen Clientsicht **und** Hostsicht | `RemoteStreamClientMessage`/`RemoteStreamServerMessage` |
| `open` | Rahmen Clientsicht | ebenda |
| `end` | Rahmen Clientsicht **und** Hostsicht | ebenda |
| `cancel` | Rahmen Clientsicht **und** Ereignissicht | ebenda, `RemoteEventCancellationFrame` |
| `error` | Rahmen Hostsicht | `RemoteStreamServerMessage` |
| `ready` | Rahmen Hostsicht | `RemoteEventReadyFrame` |
| `emit` | Rahmen Hostsicht | `RemoteEventEmitFrame` |
| `waterfall` | Rahmen Hostsicht | `RemoteEventInvocationFrame` |
| `streamId` | Feld | `RemoteStreamClientMessage` |
| `event`, `args` | Felder | `RemoteEventEmitFrame` |
| `code`, `message`, `details` | Felder | `RemoteStreamFailure` |
| `$events` | Endpunkt | `REMOTE_EVENT_STREAM_ENDPOINT` |
| `$events/result` | Endpunkt | `REMOTE_EVENT_RESULT_ENDPOINT` |
| `/api/remote.mux` | Pfad | `REMOTE_STREAM_MUX_PATH` |
| `gateway/bad-request` | Fehlercode | `RemoteErrorDetailsMap` (typert/protocol) |
| `gateway/cancelled` | Fehlercode | ebenda |
| `gateway/internal` | Fehlercode | ebenda |
| `gateway/protocol` | Fehlercode | `remote-error-codes.ts` |
| `gateway/input-invalid` | Fehlercode | ebenda |
| `gateway/uplink-overflow` | Fehlercode | ebenda |
| `gateway/service-unavailable` | Fehlercode | ebenda |
| `gateway/ambiguous-endpoint` … `gateway/uplink-overflow` (19 Codes) | Fehlercodes | `remote-error-codes.ts` — im Dienst nicht erreichbar, aber im Wortschatz gefuehrt |
| `1001`, `1003`, `1008`, `1011` | Close-Codes | `stream-server.ts` (`1003 'text messages required'`, `1008 'invalid Remote stream request'`, `1011`) und RFC 6455 §7.4.1 |
| `262144` / `2000 ms` | Grenzen | `DEFAULT_STREAM_INBOX_BYTES`, `DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS` in `packages/api/gateway/src/index.ts` |

**Woertliche Namen sind nur die Rahmennamen, Feldnamen, Endpunktnamen,
Pfadnamen, Fehlercodes und Close-Codes.** Kein Quelltext wurde uebernommen.

### Namen, die unsere Ergaenzungen sind

| Name | Art | Warum |
|---|---|---|
| `attach` | Rahmen Clientsicht | der Core kennt kein Anhaengen mit deklarierter Ansicht und Fenster |
| `detach` | Rahmen Clientsicht | Gegenstueck zu `attach`; der Core kennt nur `cancel` je logischem Strom |
| `resync` | Rahmen Clientsicht | „nach einer Luecke den vollen Zustand"; der Core deckt Luecken in der Fachschicht (`RemoteJournalStream`) |
| `snapshot` | Rahmen Hostsicht | Antwort auf `resync`; der Core kennt keinen vollen Zustand ueber den Draht |
| `event` | Rahmen Hostsicht | weitergeleitetes Ereignis; im Core ist `emit` die Ereignissicht und `item` die Stromsicht — hier trennt der Name die beiden |
| `view` | Feld | die Ansicht (Core kennt nur `endpoint`) |
| `windowId` | Feld | das Fenster/Panel (Core kennt nichts dergleichen) |
| `seq` | Feld | **monoton wachsende Sequenznummer je Strom** (Lueckenerkennung); der Core kennt keine Sequenznummer |
| `fromSeq`, `gap`, `messages` | Felder | Luecke und Nachlieferung im `snapshot` |
| `droppable` | Feld | markiert Rahmen, die bei Ueberlauf verworfen werden duerfen; der Core kennt nur eine Byte-Grenze auf dem Uplink |
| `/v1/attach` | Pfad | bewusst **verschieden** von `/api/remote.mux`, damit kein zweiter Dienst dieselbe Route beansprucht |
| `/healthz`, `/version`, `/status` | Pfade | eigene Betriebsflaeche (Muster aus `pmh-supervisor`) |
| `/v1/events` | Pfad | der Upstream-Strom als NDJSON |
| `attach/peer-lagged` | Fehlercode | langsamer Client getrennt — der Core trennt dafuer nicht, er verwirft nur |
| `attach/upstream-gone` | Fehlercode | Upstream-Strom endet sichtbar |
| `1000`, `1002`, `1007`, `1009`, `1012` | Close-Codes | erlaubte Standard-Codes nach RFC 6455 §7.4.1 |

### Rahmen der Clientsicht → Anhaengepunkt

| Rahmen | Inhalt | Entspricht im Core |
|---|---|---|
| `attach` | `endpoint` (Ansicht), `payload: {view, windowId}` | `open` |
| `item` | `value` (Eingabe) | `item` |
| `end` | Halbschluss | `end` |
| `detach` | — | `cancel` |
| `resync` | `fromSeq` | **eigene** |
| `cancel` | — | `cancel` |

Der **erste** Rahmen einer Verbindung muss `attach` sein. Ein zweites `attach`
auf derselben Verbindung ist der eine Protokollverstoss, der die Verbindung
beendet — genau wie im Core (`stream-server.ts`, duplizierte `streamId`).

### Rahmen des Anhaengepunkts → Clientsicht

| Rahmen | Inhalt |
|---|---|
| `ready` | `streamId`, `view`, `windowId`, `seq` — erster Rahmen jeder Generation |
| `event` | `streamId`, `seq`, `event`, `args`, `droppable` |
| `item` | `streamId`, `seq`, `value`, `droppable` |
| `snapshot` | `streamId`, `view`, `seq`, `fromSeq`, `gap`, `messages[]` |
| `end` | `streamId`, `seq` — Strom beendet |
| `error` | `streamId`, `seq`, `error: {code, message, details}` |

### Ereignisstrom des Upstreams (NDJSON)

Wenn `--upstream` gesetzt ist, liest der Dienst `GET <upstream>/v1/events` als
NDJSON, eine JSON-Zeile je Ereignis:

```json
{"event":"session/message","args":{"text":"hallo"},"droppable":true}
{"value":{"zeile":"…"},"droppable":true}
```

Kommentarzeilen (Beginn `#`) werden uebersprungen. Die Feldnamen `event` und
`args` sind woertlich; `value` und `droppable` sind unsere Ergaenzungen.

> **Ehrliche Grenze:** Diesen Upstream-Strom gibt es heute **nicht**. Der
> Harness liefert ihn nicht aus; `pmh-attach` definiert die Form und liest sie.
> Angeschlossen ist der Dienst damit an eine **vereinbarte** Form, nicht an
> einen laufenden Harness — der TS-Seam bleibt die Quelle der Wahrheit.

## Grenzen und Vorgaben

| Grenze | Vorgabe | Bedeutung |
|---|---|---|
| Warteschlange je Client | `64` Rahmen | voll → **drop-oldest** bei `droppable`, sonst **Trennung** |
| Verwurfgrenze | `64` | danach wird auch ein Client getrennt, der nur droppable Rahmen verliert — Verlust bleibt nie still |
| Ring je Strom | `64` Rahmen | Grundlage fuer `resync` |
| Lesefrist | `30s` | nach einem `attach` muss binnen dieser Frist ein Befehl kommen |
| Herzschlag | `2s` | nach **2** unbeantworteten Pings wird getrennt (Vorbild `MAX_MISSED_HEARTBEATS`) |
| Nachrichtengroesse | `1 MiB` | Obergrenze einer eingehenden Nachricht (`api.MaxFrameBytes`) |
| Ansicht | `32` Zeichen | `api.MaxViewLen` |
| Fensterkennung | `128` Zeichen | `api.MaxWindowIDLen` |

### Die Ueberlaufpolitik, genau

1. Ist Platz, geht der Rahmen in die Warteschlange.
2. Ist sie voll und der neue Rahmen ist **droppable**, faellt der **aelteste**
   droppable Rahmen (`drop-oldest`); der neue Rahmen wird **hinten** angehaengt,
   damit die Warteschlange in Sequenzreihenfolge bleibt.
3. Ist kein droppable Rahmen zu finden, wird der Client **getrennt**. Ein
   Rahmen ohne `droppable` — auch der `ready`-Rahmen — geht **nie** verloren.
4. Nach `MaxDrops` Verwuerfen wird auch ein Client getrennt, der nur droppable
   Rahmen verliert: dauerhafter Verlust bleibt nicht still.
5. Die Trennung ist **sichtbar**: der Client bekommt vorher einen `error`-Rahmen
   mit `attach/peer-lagged` und die Verbindung schliesst mit `1001`.

**Kein Client blockiert einen anderen.** Der Hub schreibt nie auf den Draht; er
legt nur in die Warteschlange. Der Traeger gibt sie in einer eigenen Schleife
aus.

## Der WebSocket-Rahmen — selbst gebaut

Handschlag und Rahmenformat sind **RFC 6455** und mit der Standardbibliothek
umgesetzt (`net/http` Hijack, `internal/wire`). **Kein** `golang.org/x/net/websocket`:
das Paket waere im Modul-Zwischenspeicher vorhanden, ist aber selbst als
veraltet markiert und deckt Fragmentierung und Close-Protokoll nicht
vollstaendig ab. Getestet sind:

| Eigenschaft | Test |
|---|---|
| Handschlag, Textrahmen in beide Richtungen | `TestWebSocketHandshakeAndTextFrameRoundTrip`, `TestAcceptKeyMatchesRFC` |
| Maskierung der Client-Rahmen | `TestClientFramesAreMasked` |
| erweiterte Nutzlaengen 126 / 127 | `TestPayloadLengthsUseTheRightEncoding`, `TestExtendedLengthIsBigEndian` |
| Fragmentierung (schreiben und zusammensetzen) | `TestLargeMessageIsFragmentedAndReassembled`, `TestFragmentationUsesFirstAndContinuationFrames` |
| Close-Austausch mit Code | `TestCloseHandshakeWithCode`, `TestServerCloseCarriesCodeAndIsIdempotent` |
| Ping beantwortet mit Pong | `TestPingIsAnsweredWithPong`, `TestPingBetweenFragmentsIsAnswered` |
| Protokollverstoesse (unmaskiert, Fortsetzung ohne Anfang, zu grosse Steuernachricht, nicht-minimale Laenge) | `TestUnmaskedClientFrameIsRejected`, `TestContinuationWithoutStartIsRejected`, `TestOversizedControlFrameIsRejected`, `TestNonMinimalLengthEncodingIsRejected` |
| parallele Schreiber verschraenken keine Rahmen | `TestConcurrentWritesDoNotInterleave` |

## Bauen und Testen

```powershell
cd C:\Users\Chang\prometheus-harness\services\pmh-attach
go vet -buildvcs=false ./...
go build -buildvcs=false ./...
go test -buildvcs=false ./...
```

`-buildvcs=false` ist Pflicht: das `.git` des Zielprojekts ist defekt.

> **Hinweis zur Umgebung.** Auf diesem Rechner blockiert eine
> Application-Control-Richtlinie frisch erzeugte Testprogramme unter `%TEMP%`
> („An Application Control policy has blocked this file"). `go test` kann davon
> betroffen sein. Der Nachweis laeuft dann ueber ein fest kompiliertes Programm:
>
> ```powershell
> go test -buildvcs=false -c -o .tmp-test/tests.test.exe ./tests/
> .\.tmp-test\tests.test.exe -test.timeout=300s
> ```
>
> Die Testdatei `tests/cli_test.go` baut den Dienst ausserdem in einen
> Unterordner des Moduls statt nach `%TEMP%` und raeumt ihn wieder weg.

## Teststand — ehrlich, mit offenen Punkten

| Kennzahl | Wert |
|---|---|
| `go vet` | exit 0, **0 Meldungen** |
| `go build` | exit 0 (mit `-buildvcs=false`) |
| `go test -buildvcs=false ./...` | exit 0, **alle Tests gruen** |
| Tests gesamt | **63** (17 `internal/attach`, 19 `internal/wire`, 27 `tests`) |

### Was **nicht** getestet ist

1. **Ein echter Harness als Upstream.** Der NDJSON-Strom ist eine vereinbarte
   Form, kein laufender Dienst; getestet ist nur, dass ein **fehlender**
   Upstream sichtbar scheitert.
2. **Kein Lasttest.** 100 Ereignisse auf 2 Clients sind kein Nachweis fuer
   Nebenlaeufigkeit unter Last. `docs/stack.md` verlangt fuer den Go-Gateway
   sowieso erst eine Messung, die den Engpass belegt.
3. **Kein TLS und keine Authentifizierung.** Der Dienst bindet lokal; wer ihn
   oeffentlich bindet, bindet ihn ohne Auth. Das ist bewusst nicht geloest
   (`--allow-wildcard` ist ausdruecklich zu setzen).
4. **Kein Uplink.** Eine Client-Eingabe (`item`) ist heute **nicht zustellbar**:
   der Core-Uplink gehoert auf den Mux des Harness, und der ist nicht
   angeschlossen. Der Dienst sagt das sichtbar (Close-Code `1009`) statt die
   Eingabe zu verschlucken.
5. **Ein `ready`-Rahmen des Core-Ereignisstroms und unser `ready`-Rahmen
   kollidieren im Namen.** Der Core traegt dort `clientId`/`host`, wir tragen
   `view`/`windowId`/`seq`. Beide sind je Richtung eindeutig (unsere Auswertung
   sieht nur Host-Rahmen, seine nur Client-Rahmen), aber **ein gemeinsamer
   Dokumentationsort fuer diese Kollision fehlt**.
6. **Der Upstream-Strom ist ein Strom je Ansicht, nicht je Fenster.** Zwei
   Fenster derselben Ansicht sehen dasselbe; zwei Ansichten sehen
   Verschiedenes. Ob das dem Zielbild (Zoom-Ebenen) genuegt, ist offen.

## Verhaeltnis zum Referenz-Harness

| | |
|---|---|
| **Woertlich uebernommen** | Rahmennamen, Feldnamen, Endpunktnamen, Fehlercodes, Close-Codes, Grenzen |
| **Nicht uebernommen** | kein Quelltext; der WebSocket-Rahmen ist eigenstaendig geschrieben |
| **Bewusst verschieden** | der Pfad (`/v1/attach` statt `/api/remote.mux`), damit kein zweiter Dienst dieselbe Route beansprucht |
| **Neben, nicht statt** | der TS-Gateway-Seam bleibt; dieser Dienst ist ein Anhaengepunkt |
