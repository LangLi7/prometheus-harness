# Live-Anbindung — was der Host kann, und was unsere Oberfläche davon nutzt

> **Gemessen:** 14.10.2026 · Sonde
> [`messsonden/strom-sonde.mjs`](messsonden/strom-sonde.mjs) · Exit **0**
> **Frage, die dieses Blatt beantwortet:** haben wir WebSocket und Live-Anbindung für
> Verlauf und laufende Antworten — und nutzen wir sie?

## 1. Die kurze Antwort

**Der Host kann es. Es ist gemessen. Unsere Oberfläche nutzt es nicht.**

| Ebene | Zustand |
|---|---|
| **WebSocket-Strecke** | **vorhanden und erreichbar** — Aufwertung nach **3 ms** |
| **Live-Strom einer Sitzung** | **liefert** — Eröffnungsrahmen nach **201 ms** |
| **Verlauf über HTTP** | **liefert** — 16 Einträge in **9 ms** |
| **Unsere Oberfläche** (`apps/web/src`) | Gerüst, 8 Dateien, **kein Chat** — nutzt **weder** Strom **noch** Verlauf |

Der letzte Punkt ist der eigentliche Befund: die Fähigkeit ist da, der **Gebrauch** fehlt.

## 2. Die Wege — im Vertrag nachgelesen, nicht geraten

```ts
// dsh-api-gateway/lib/types/stream-protocol.d.ts
export declare const REMOTE_STREAM_MUX_PATH = "/api/remote.mux";
//   "Exact WebSocket route carrying every Typert Remote stream."
```

**Eine** Strecke trägt **jeden** Strom. Daneben die HTTP-Fläche `POST /api/<voller/pfad>`
(siehe [api-nachweis.md](api-nachweis.md)).

### Das Rahmenprotokoll der Strecke — **nicht** der HTTP-Umschlag

```js
// dsh-api-gateway/lib/types/client/stream-client.js
this.send(socket, { type: 'open',   streamId, endpoint, payload })   // Strom öffnen
this.send(socket, { type: 'item',   streamId, value })               // liefern
this.send(socket, { type: 'cancel', streamId })                      // abbrechen
this.send(socket, { type: 'end',    streamId })                      // beenden
```

Antworten kommen als `{type:'item', streamId, value}` oder `{type:'error', streamId, error}`.

**Der Fehler, der hier fast zum falschen Schluß geführt hätte.** Mein erster Versuch schickte
den **HTTP-Umschlag** (`{type:'client-request', rpcId, method, payload}`) über die Strecke.
Der Host **nahm die Aufwertung an** und **antwortete nie** — 20 Sekunden lang kein Rahmen.
Das sieht aus wie ein tauber Host. Es war eine Nachricht, die für ihn keine war: **ein
Protokoll, das man nicht nachliest, sieht aus wie ein stiller Server.**

## 3. Der Verlauf — und warum der Strom sein Eingang ist

`session/follow` liefert als **Eröffnungsrahmen** einen Schnappschuß, der die jüngsten
Einträge **schon enthält**:

```json
{"type":"item","streamId":"sonde-1","value":{
  "type":"snapshot",
  "header":{"version":4,"id":"session-…","createdAt":…,"cwd":"…","agentPreset":"standard"},
  "cursor":21,
  "records":[{"type":"event","event":{"type":"permission/preset","seq":0,…}}, …]}}
```

Daraus stammt der **Schnitt**:

```ts
// dsh-api-session-controller/lib/types/types.d.ts
readonly throughSeq: number;   // "Inclusive log cut obtained from the corresponding
                               //  follow opening frame."
```

**Er wird nicht erfunden.** Mein erster Versuch setzte `throughSeq: 10 ** 9` — und der Host
antwortete `gateway/input-invalid`. Zu Recht: der Schnitt gehört dem Eröffnungsrahmen.

Mit dem echten Wert (hier **15**):

```
session/page { address, throughSeq: 15, maxMessages: 50 }
  -> 16 Einträge, hasMore=false, 46 892 B in 9 ms, Sequenzbereich 0 … 15
```

`beforeSeq` und `hasMore` bilden das **Blättern rückwärts** — genau der Weg, den ein Client
nach einem Neustart geht: **einmal öffnen, Schnitt bekommen, seitenweise zurückholen.**

## 4. Mehr-Agenten und Unteragenten — im Adresstyp vorgesehen

```ts
export type SessionAddress =
  { kind: 'session';  sessionId } |
  { kind: 'subagent'; parentSessionId; childSessionId; mode: 'one-shot' | 'continuable' | 'unknown' }
```

**Der Strom kann einem Unteragenten folgen**, nicht nur einer Wurzelsitzung. Und
`SessionAssistantStreamFrame` / `…Baseline` tragen den **laufenden** Assistentenstrom mit
`attemptId`, `startedAfterSeq` und `nextIndex` — also **Wiederaufsetzen mitten im Lauf**,
nicht nur am Rand einer Runde.

**Mein Fehler dabei:** ich hatte `kind` weggelassen (`{ sessionId }` statt
`{ kind: 'session', sessionId }`) und bekam `wire field "request" failed boundary validation`.
Die Union ist unterscheidend; die Marke ist **Pflicht**.

### 4a. Der Unteragenten-Strom — **gemessen**, nicht mehr nur gelesen

Sonde: [`messsonden/strom-subagent-sonde.mjs`](messsonden/strom-subagent-sonde.mjs) · Exit **0**
· zwei Läufe mit gleichem Ergebnis.

Ablauf: eine Wurzelsitzung, ein Auftrag, der das Werkzeug `subagent` ruft — und dann wird dem
**Kind** über die Strecke gefolgt.

```
Wurzelsitzung: session-995d853b-…
Unteragent:    632eb66e-…   origin=subagent   Tiefe 1   Eltern=session-995d853b-…

session/follow { kind:'subagent', parentSessionId, childSessionId, mode:'continuable' }
  -> SCHNAPPSCHUSS, erster Versuch
     {"type":"item","value":{"type":"snapshot","header":{…,"parentSession":"session-995d853b-…",
      "origin":"subagent",…}}}
  -> throughSeq aus dem Rahmen: 14   (beide Läufe)
  -> session/page über die UNTERAGENTEN-Adresse: 15 Einträge, hasMore=false
```

**Der Unteragent hat seinen eigenen Strom und seinen eigenen Verlauf.** Ein Client kann ihn
also **live** mitlesen und nach einem Neustart **seinen** Verlauf nachladen — mit derselben
Mechanik wie bei einer Wurzelsitzung, nur mit `kind:'subagent'`.

**Die Gegenprobe, die den Wert bestimmt.** Meine Schleife bricht beim **ersten** Erfolg ab —
sie belegt damit nur, daß `continuable` geht, **nicht**, daß die anderen scheitern. Also
wurde ein für diesen Lauf **falscher** Wert probiert:

```
mode='continuable' -> SCHNAPPSCHUSS
mode='one-shot'    -> ABGEWIESEN: "subagent mode does not match the supplied address"
```

**Der Host prüft `mode` also.** Die Adresse ist eine **geprüfte Aussage**, kein schmückendes
Feld: wer den falschen Laufmodus angibt, bekommt eine Abweisung statt eines fremden Stroms.

## 5. Was auf **unserer** Seite fehlt

| Was | Zustand |
|---|---|
| Ein Client, der den Strom öffnet | **fehlt** — `apps/web/src` hat keinen Chat |
| Zwischenspeicher im Browser oder in der App | **fehlt** |
| Nachladen beim Scrollen (`beforeSeq`/`hasMore`) | **fehlt** |
| Anzeige eines Unteragenten-Stroms | **fehlt** |

**Der Entwurf, der dafür zu bauen ist, steht bereits fest** — er ist die Form, die der Kern
vorgibt:

1. Beim Start **einmal** `session/follow` öffnen → Schnappschuß **und** `throughSeq`.
2. Den Schnappschuß sofort zeichnen (**das ist der Verlauf nach dem Neustart**, ohne
   zweite Anfrage).
3. Ältere Seiten nur bei Bedarf über `session/page` mit `beforeSeq`, solange `hasMore`.
4. Den Strom offen lassen — neue Ereignisse kommen als `item`-Rahmen, **ohne** Abfragen.
5. Zwischenspeicher: die Seiten sind **unveränderlich** (ein Schnitt verändert sich nicht),
   also ist ein Zwischenspeicher je `(sessionId, throughSeq, beforeSeq)` sicher.

**Punkt 5 ist der Grund, warum dieses Protokoll für Zwischenspeichern gebaut ist:** ein
Verlauf wird **angehängt**, nie umgeschrieben. Eine geholte Seite kann deshalb nicht veralten.

## 6. Reproduktion

```powershell
bun docs/status/messsonden/strom-sonde.mjs 3077
```

Exit **0**: die Aufwertung wurde angenommen. Exit **2**: kein Host. Exit **1**: die
Aufwertung wurde abgelehnt.

## 7. Was dieses Blatt **nicht** sagt

* **Nicht**, daß unsere Oberfläche live ist — sie ist es nicht.
* **Nicht**, daß der Strom unter **Last** trägt (viele Sitzungen, viele Rahmen). Gemessen
  ist **eine** Sitzung mit **einem** Lauf.
* **Nicht**, daß es für **WebSocket** einen Ersatz gibt, falls ein Netz ihn blockiert —
  siehe §8, der Weg ist **erklärt, nicht gemessen**.
* ~~Nicht, daß der Strom **von selbst** neue Ereignisse schickt~~ — **gemessen**, §7a.
* ~~Nicht, daß ein Unteragenten-Strom gelaufen ist~~ — **gemessen**, §4a.

### 7a. Der Strom **im Lauf** — er schiebt von selbst

Sonde: [`messsonden/strom-lauf-sonde.mjs`](messsonden/strom-lauf-sonde.mjs) · Exit **0**

Ablauf: Strecke aufwerten, `session/follow` senden (das ist die **Anforderung**), **danach**
einen Auftrag absetzen, und ab diesem Punkt sendet die Sonde **nichts** mehr. Alles, was
danach eintrifft, ist **ungerufen**.

```
Eröffnungsrahmen nach 0 ms
Auftrag abgesetzt — der Strom ist OFFEN

  [   515 ms]  13 ungerufene Rahmen
  [  1015 ms]  15
  [  2017 ms]  16
  [  2518 ms]  20
  [  3019 ms]  22
  [  4021 ms]  26

Rahmen gesamt nach dem Auftrag: 26      erster ungerufener nach 12 ms
   4x event:user/message        2x event:step/start        1x event:turn/start
   3x …delivery-accepted        2x event:assistant/message 1x event:tool/call
   2x event:agent/inbox/spliced 2x event:step/end          1x event:tool/result
   2x event:session/title       …                         1x event:turn/end
```

**26 Ereignisrahmen in 16 Arten, ohne eine einzige Abfrage.** Damit ist der Live-Weg belegt
— und der Nutzen „neue Ereignisse **ohne** Abfragen" ist **gemessen**, nicht behauptet.

## 8. Die anderen Live-Architekturen — was der Kern kennt und was wir nutzen

Die Frage ist nicht „WebSocket **oder** SSE", sondern **welche Schicht** welchen Träger hat.
Gemessen, jede Zeile mit ihrem Fundort:

| Schicht | Träger | Befund |
|---|---|---|
| **Anbieter → Harness** (Tokenstrom) | **SSE** | `dsh-llm-deepseek/lib/index.js:2204` — der Adapter schickt `"accept": "text/event-stream"` |
| **Harness → Client**, Sitzung live | **WebSocket** `/api/remote.mux` | **gemessen**: Aufwertung 3 ms, 26 ungerufene Rahmen (§7a) |
| **Harness → Client**, einzelne Aufrufe | **HTTP** `POST /api/<voller/pfad>` | gemessen ([api-nachweis.md](api-nachweis.md)) |
| **Harness → Client**, genaue Wege mit **strömenden** Körpern | **Fetch-Wege** | `dsh-client-connection/lib/types/rpc.d.ts`: `ConnectionFetchRoute` mit `requestBody: 'buffered' \| 'streaming'` und `fetch(request) → Promise<Response>`; `HostConnectionFetch` = *„Host registry for exact Fetch routes that cannot use JSON Remote invocation"*. **Erklärt, nicht gemessen** |
| **Harness → Client**, HMR | **SSE** (`new EventSource(EVENTS_ROUTE)`) | `dsh-client-hmr/lib/client.js:64`; der Kern **kann** SSE |
| **Kompression** | SSE bleibt **unkomprimiert** | `dsh-host-webserver/lib/index.js:187` nimmt `text/event-stream` vom gzip **aus** |

**Zwei Befunde, die daraus folgen:**

1. **SSE ist vorhanden, aber nicht für den Chat.** Sein einziger Verbraucher im Baum ist
   **HMR** (`dsh-client-hmr`). Und im gemessenen Zustand unseres Hosts steht
   **`@deepseek-ai/dsh-hmr` auf `enabled=false`**, während `@deepseek-ai/dsh-client-hmr`
   `active` ist. Ob die SSE-Strecke damit überhaupt bedient wird, ist **nicht gemessen**.
2. **Der Webserver ist auf SSE vorbereitet** — er nimmt den Medientyp ausdrücklich von der
   Kompression aus. Das ist die Voraussetzung dafür, SSE später zu benutzen, **ohne** daß
   eine Zwischenschicht die Rahmen puffert.

**Warum WebSocket für den Chat und nicht SSE.** Sitzungsströme sind **bidirektional**
(`open`/`cancel` gehen zum Host, `item`/`error` kommen zurück) und werden **multiplex**
gefahren — eine Strecke für alle Ströme. SSE ist **einseitig**; ein Abbruch müßte über einen
zweiten Weg laufen. **Das ist eine Schlußfolgerung aus dem gemessenen Protokoll, keine
Vorliebe.**

## 9. Was dieses Blatt weiterhin offen läßt

* Der Strom unter **Last** (viele Sitzungen gleichzeitig, viele Rahmen je Sekunde).
* Die **Fetch-Wege** als zweiter Träger — erklärt, **nicht gefahren**. Das ist der
  eigentliche Ersatz, falls ein Netz WebSocket blockiert.
* Die **HMR-SSE-Strecke** im Zustand `dsh-hmr = enabled=false`.
