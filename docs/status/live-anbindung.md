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
| **Harness → Client**, genaue Wege mit **strömenden** Körpern | **Fetch-Wege** | Der Griff ist `ctx.connection.fetch.register(weg)` (`HostConnectionService.fetch`, `dsh-client-connection/lib/index.js:634`). **Kein Verbraucher** — siehe §8a. **Es gibt nichts zu messen: die Registratur ist leer** |
| **Harness → Client**, HMR | **SSE**, Weg `/plugins/events` | **gemessen und bedient** — §11. Angemeldet von **`dsh-client-hmr`** (`lib/index.js:141`), **nicht** von `dsh-hmr` |
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

* Der Strom unter **Dauerlast** über **Minuten** (gemessen ist ein Lauf über ~6 s, §12).
* ~~Die **HMR-SSE-Strecke** im Zustand `dsh-hmr = enabled=false`~~ — **gemessen**, §11.

## 12. Bündelung — **eine** Strecke trägt **acht** Sitzungen

Sonde: [`messsonden/strom-last-sonde.mjs`](messsonden/strom-last-sonde.mjs) · Exit **0**

§8 behauptet, Sitzungsströme seien **multiplex** — *„eine Strecke für alle Ströme"*. Das war
bis hierher eine **Behauptung aus dem Protokoll**. Jetzt gemessen: **eine** WebSocket-Strecke,
N Sitzungen, je ein `open` mit eigener `streamId`, danach in **allen** ein Auftrag.

### Vier Sitzungen

```
4 von 4 Strömen trugen einen Eröffnungsrahmen
4 Aufträge abgesetzt in 38 ms

strom-1  26 ungerufen, 26 Ereignisse   erster nach 12 ms   größte Lücke  610 ms
strom-2  26 ungerufen, 26 Ereignisse   erster nach 26 ms   größte Lücke  674 ms
strom-3  26 ungerufen, 26 Ereignisse   erster nach 31 ms   größte Lücke  810 ms
strom-4  26 ungerufen, 26 Ereignisse   erster nach 37 ms   größte Lücke  632 ms
                                              = 104 Rahmen auf EINER Strecke
```

**Jeder Strom bekam genau 26 Ereignisse** — dieselbe Zahl wie im Einzellauf (§7a). Keine
Verluste, keine Doppelungen, keine zweite Verbindung.

### Acht Sitzungen

```
strom-1  25 Ereignisse   erster nach 13 ms   größte Lücke 2245 ms   turn/end da
strom-2  26              28 ms               750 ms                turn/end da
strom-3  26              35 ms              1311 ms                turn/end da
strom-4  26              41 ms               746 ms                turn/end da
strom-5  26              51 ms               782 ms                turn/end da
strom-6  26              65 ms               913 ms                turn/end da
strom-7  26              93 ms               719 ms                turn/end da
strom-8  26             100 ms              1481 ms                turn/end da
                                              = 207 Rahmen auf EINER Strecke

Runden zu Ende: 8 von 8
```

### Der Fall, der eine zweite Prüfung erzwang

Im **ersten** Acht-Lauf hatte `strom-2` nur **18** Ereignisse, während alle anderen 25–26
hatten. **Zwei Deutungen sind möglich:** ein **Verlust** auf der Strecke — oder ein **kürzerer
Lauf**. Ohne Prüfung wäre jede Deutung eine Behauptung gewesen.

Also prüft die Sonde jetzt, ob je Strom ein **`turn/end`** ankam. Im zweiten Lauf: **8 von 8**
mit `turn/end` und 25–26 Ereignissen.

**Ehrlich benannt:** für den **ersten** Lauf ist das **nicht** nachgeprüft — die Prüfung gab es
damals noch nicht. Die 18 ist damit **wahrscheinlich** ein offener Lauf und **nicht** ein
Verlust, aber **belegt ist das nicht.** Wer Gewißheit will, fährt den Lauf mit der Prüfung
erneut — sie ist jetzt eingebaut.

### Was daraus folgt — und was nicht

| Gemessen | Nicht gemessen |
|---|---|
| Eine Strecke trägt **4 und 8** Ströme gleichzeitig | Dauerlast über **Minuten** |
| Jeder Strom liefert **ohne Abfrage** | Verhalten bei **Verbindungsabbruch** und Wiederaufsetzen |
| Die Zeit bis zum ersten Rahmen wächst mit N (12 → 100 ms) | Ob diese Zunahme **linear** bleibt |
| Die größte Lücke je Strom liegt bei **610–2245 ms** | Wieviel davon **Modellzeit** ist und wieviel Transport — das ist **nicht** getrennt gemessen |

**Der letzte Punkt gehört betont:** die „größte Lücke" ist **keine** Transportkennzahl. Sie
enthält die **Wartezeit auf das Modell**. Was die Strecke selbst kostet, sagen diese Zahlen
**nicht**.

## 11. Die SSE-Strecke — bedient, und **ohne Anmeldung**

Sonde: [`messsonden/sse-sonde.mjs`](messsonden/sse-sonde.mjs) · Exit **0**

### 11.1 Meine Vermutung war falsch

In §8 stand, `dsh-hmr` sei `enabled=false`, während `dsh-client-hmr` `active` ist — und ich
**vermutete**, die SSE-Strecke werde deshalb nicht bedient. **Falsch.** Gemessen:

```
Weg: /plugins/events          (EVENTS_ROUTE in dsh-client-hmr/lib/client.js)

ohne Anmeldung:  HTTP 200   content-type: text/event-stream
mit Anmeldung:   HTTP 200   content-type: text/event-stream
                 cache-control: no-cache        connection: keep-alive
gelesen:         28 517 Zeichen, erste Rahmen:
                 : connected
                 data: {"type":"graph","graph":{"rev":"2c88423fa94b","entries":[
                        {"id":"@deepseek-ai/dsh-client-ui-open-in-app","url":"plugins/??@de…
```

**`dsh-hmr` ist etwas anderes** als der Träger der Strecke: es ist die **Nachlade-Maschine**
(*„Reload plugin code and profile configuration through one coordinated queue"*). Angemeldet
wird der Weg von **`dsh-client-hmr`** über `ctx.webServer.register({ … "content-type":
"text/event-stream" … })` — und dieses Paket ist **aktiv**.

**Die Lehre:** aus zwei Zuständen (`X aus`, `Y an`) auf das Verhalten einer **dritten** Sache
zu schließen, war ein Schluß ohne Messung. Die Sonde hat ihn in einem Lauf widerlegt.

### 11.2 Und sie liefert **ohne Anmeldung**

**Dieselben 28 517 Zeichen kommen auch ohne Cookie.** Zum Vergleich, gemessen:

| Weg | ohne Token |
|---|---|
| `/` (die Oberfläche) | **401** |
| `/api/*` | **401** |
| **`/plugins/events`** | **200 mit dem Plugin-Bestand** |

**Das ist kein Zufall, sondern eine Grenze im Entwurf.** Der Zaun ist ausdrücklich auf `/api`
beschränkt — im Kern steht:

> *„Browser-safe, zero-dependency loopback classification **shared by the `/api` Host fence**"*

`/plugins/events` liegt **außerhalb** dieses Zauns; es ist ein `webServer`-Weg.

### 11.3 Und es ist **nicht** von außen lesbar — gemessen

Ein fremder Ursprung wird mitgeschickt, und **alle** Antwortköpfe werden angesehen:

```
cache-control: no-cache      connection: keep-alive
content-type: text/event-stream
transfer-encoding: chunked
CORS-Kopf access-control-allow-origin: FEHLT
```

**Ohne diesen Kopf darf eine fremde Webseite die Antwort nicht lesen** — ein
`EventSource` aus einer anderen Seite scheitert, und ein `fetch` liefert eine undurchsichtige
Antwort. Die Offenheit reicht damit so weit, wie jemand **direkt** fragen kann.

### 11.4 Was davon **offen** bleibt — und warum es zählt

Bei der Vorgabe bindet der Host auf **Loopback**; wer direkt fragen kann, sitzt auf derselben
Maschine. **Aber:** der Betreiber plant einen **Netzzugang** (WireGuard oder Tailscale — Punkt
D7 der Zielliste). Wird der Host dann auf eine **nicht-lokale** Adresse gebunden, liegt der
**Plugin-Bestand** (Paketnamen, Wege, Revision) **ohne Token** in diesem Netz.

**Ob das so bleiben soll, ist nicht entschieden** — es steht in keiner Aufzeichnung. Es ist
auch **kein Geheimnis**, das dabei fällt, sondern eine **Bestandsauskunft**. Was fehlt, ist die
Entscheidung, nicht der Code.

**Der Weg wäre klein:** derselbe Zaun, den `/api` schon hat, auf den Weg anzuwenden — oder den
Weg ausdrücklich als lokal zu kennzeichnen.

### 9a. Der „zweite Träger" existiert **nicht** — die Registratur ist leer

Ich hatte in §8 geschrieben, die Fetch-Wege seien „erklärt, nicht gemessen". **Das war zu
milde.** Gemessen ist mehr:

```
Suche nach registerFetchRoute im ganzen installierten Baum:
  dsh-client-connection/lib/index.js:636   return { register: (route) => this.registerFetchRoute(owner, route) }
  dsh-client-connection/lib/index.js:681   registerFetchRoute(owner, route) { … }
  dsh-client-connection/lib/types/rpc-host.d.ts:48   private registerFetchRoute

Suche nach FetchRoute|fetchRoute|registerFetch in UNSEREM Baum:
  KEIN Treffer
```

**Es gibt genau einen Aufrufer — den Dienst selbst.** Der Griff ist
`ctx.connection.fetch.register(weg)`, ein **scoped accessor** auf `HostConnectionService`:

```js
/** Exact Fetch-route registry scoped to the Context reading this service. */
get fetch() {
  const owner = this.ctx
  return { register: (route) => this.registerFetchRoute(owner, route) }
}
```

**Niemand meldet einen Weg an** — kein Kernpaket, und wir schon gar nicht. Damit ist:

* Der Fetch-Träger ein **angebotener, unbenutzter Erweiterungspunkt**. Die Beschreibung im
  Vertrag sagt es selbst: *„Host registry for exact Fetch routes **that cannot use** JSON
  Remote invocation"* — er ist für den Fall gebaut, in dem jemand einen braucht.
* **„Der Ersatz, falls ein Netz WebSocket blockiert" gibt es heute nicht.** Er wäre zu
  **bauen**: eine Funktion, die einen Weg anmeldet, mit `requestBody: 'buffered'` oder
  `'streaming'` und einem `fetch(request) → Promise<Response>`.
* Die Zeile in §8 ist damit **richtiggestellt**: nicht „erklärt, nicht gemessen", sondern
  **„die Registratur ist leer — es gibt nichts zu messen"**.

**Das ist keine Kleinigkeit für den Betrieb:** wenn ein Netz WebSocket blockiert, fällt der
einzige gemessene Live-Weg aus, und es gibt **keinen** zweiten. Wer das ändern will, muß ihn
**schreiben** — der Kern gibt den Ort dafür vor.

**Nebenbefund:** der Webserver nimmt SSE von der Kompression aus (§8) — er ist auf einen
**strömenden** Träger **vorbereitet**, aber es läuft keiner.

## 10. Zwei Fehltreffer meiner eigenen Suche — und die Regel daraus

In zwei aufeinanderfolgenden Runden hat mein Suchmuster **etwas gefunden, das es nicht war**:

| Muster | Traf auch | Wirklichkeit |
|---|---|---|
| `text/event-stream\|EventSource` | `SessionEventSource` | kein SSE — erst die Suche nach dem **wörtlichen** Medientyp fand die drei echten Stellen |
| `fetchRoutes\|registerFetch\|…` | `registerFetchProvider` | das ist der **Web-Abruf-Anbieter** für das Werkzeug `web_fetch`, **kein** Fetch-Weg |

**Die Regel:** über **minifizierte** Bündel wird nach **exakten Bezeichnern** gesucht, nicht
nach Teilzeichenketten. Ein Teiltreffer in einem 100-kB-Bündel ist kein Befund — er ist ein
Zufall mit Bedeutung. Beide Male hat der Fehltreffer **eine ganze Zeile meiner Tabelle**
falsch gemacht.
