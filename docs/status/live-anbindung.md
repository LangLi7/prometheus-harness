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
  ist **eine** Sitzung mit **einem** Rahmen.
* **Nicht**, daß ein **Unteragenten**-Strom schon einmal gelaufen ist. Der Adresstyp ist
  gelesen, der Weg ist **nicht gefahren**.
* **Nicht**, daß es für **WebSocket** einen Ersatz gibt, falls ein Netz ihn blockiert:
  `dsh-client-connection` kennt einen zweiten Weg (`HostConnectionFetch`), **gemessen ist
  er nicht**.
