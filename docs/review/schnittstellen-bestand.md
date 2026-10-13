# Befund: welche Schnittstellen die Harness hat — und welche fehlen

**Datum:** 13.10.2026 · **Anlaß:** Betreiber-Frage: *„Support unsere Harness nur
Rest-API? Sollte es nicht mehr nutzen als das? Hab das Gefühl es reicht nicht."*

**Das Gefühl ist berechtigt, und die Zahl ist schlimmer als das Gefühl.**

---

## 1. Was ich gebaut habe — gemessen

| Endpunkt | Methode | Was er tut |
|---|---|---|
| `/api/health` | GET | sagt, daß der Prozeß lebt |
| `/api/ready` | GET | prüft PostgreSQL und Redis |

**Das ist alles, was von uns kommt.** Zwei lesende Endpunkte. Kein Endpunkt
nimmt etwas an, keiner startet etwas, keiner liefert eine Nachricht, keiner
spricht mit einem Modell.

**Und das eigentliche Produkt hat gar keinen.** Die kleinste Kette — Adapter,
Agent-Loop, Session — ist gebaut und in **262 + 108 + 19 Tests** belegt. Sie ist
über **keine** Schnittstelle erreichbar. Ein Agent, den man nicht rufen kann, ist
kein Agent.

---

## 2. Was der Core **schon** hat — gemessen, nicht angenommen

### 2a. Der API-Weg des Cores ist **kein REST**

Der Gateway registriert **eine** Route und ruft sie als
`POST /api/<namespace>/<methode>` (belegt in
`packages/api/gateway/tests/gateway.host.spec.ts:1121`).

**Nachgemessen am 13.10.2026 mit Anmeldung:**

```json
POST /api/goals/create
{"type":"server-response","rpcId":"invalid-request",
 "result":{"ok":false,"error":{"code":"gateway/bad-request",
 "message":"invalid client-request message"}}}
```

Der JSON-RPC-Rahmen kommt zurück. **Der Gateway lebt.** Die frühere README-Zeile
„API ausgefallen" war nicht belegt (Befund **B16** der Aufsicht) und ist
korrigiert.

### 2b. Acht Controller hängen an einem **WebSocket**-Kanal

Alle acht werden vom Core geladen (im Cordis-Patch der Vorlage, ohne
Abschaltung):

| Controller | Was er anbietet |
|---|---|
| `dsh-api-session-controller` | Sitzungsbefehle, neuerbindungssichere Projektion |
| `dsh-api-job-controller` | den Beobachtungsstrom eines Hintergrundauftrags |
| `dsh-api-terminal-controller` | ein Terminal |
| `dsh-api-workspace-files` | Dateien: begrenztes Lesen, Verzeichnisliste, Änderungsstrom |
| `dsh-api-account-controller` | das Konto |
| `dsh-api-settings-controller` | Einstellungen |
| `dsh-api-workspace-controller` | Arbeitsbereiche |
| `dsh-api-remotes` | entfernte Werkzeuge |

**Der Kanal ist gemessen — vollständig, nicht nur der Handschlag:**

```
WS /api/remote.mux    mit Cookie   →  HTTP/1.1 101 Switching Protocols
{type:'open', streamId, endpoint:'session/getState', payload:{}}
  → {"type":"error","code":"gateway/internal",
     "message":"Remote payload must contain exactly one plain-object args field"}
{…, payload:{args:{}}}
  → {"type":"error","code":"gateway/invocation-unavailable",
     "message":"typert gateway: session/getState: no active Remote method exports this endpoint"}
```

**Was diese zwei Antworten beweisen.** Der Kanal öffnet, parst meine Nachricht,
**prüft die Nutzlast** und **sucht den Endpunkt in einer Registrierung**. Er
antwortet mit typisierten Fehlern **im Rahmen** — nicht mit einem Abbruch. Der
Stapel dahinter lebt; nur mein Methodenname war falsch.

### 2c. Das Protokoll — aus der Quelle, nicht geraten

**Es gibt zwei Wege, und sie tragen verschiedene Nachrichten.** Das ist gemessen,
nicht abgeleitet:

| Weg | Nachrichtenform | Antwort |
|---|---|---|
| `POST /api/<namespace>/<methode>` | `{type:'client-request', rpcId, method, payload}` | `{"type":"server-response", rpcId, result}` |
| `WS /api/remote.mux` | `{type:'open', streamId, endpoint, payload}` | `{"type":"item"\|"error"\|"end", streamId, …}` |

**Beide gemessen am 13.10.2026:**

```jsonc
// Weg 1 — POST auf einen registrierten Endpunkt, mit Anmeldung
POST /api/goals/create   {"type":"client-request","rpcId":"probe-1","method":"goals/create","payload":{"args":{}}}
  → {"type":"server-response","rpcId":"invalid-request",
     "result":{"ok":false,"error":{"code":"gateway/bad-request",
     "message":"invalid client-request message"}}}

// Weg 2 — WebSocket, logischer Stream
{type:'open', streamId:'probe-1', endpoint:'session/getState', payload:{args:{}}}
  → {"type":"error","streamId":"probe-1",
     "error":{"code":"gateway/invocation-unavailable",
     "message":"typert gateway: session/getState: no active Remote method exports this endpoint"}}
```

**Und der Gegenversuch, der die Trennung beweist:** eine
`client-request`-Nachricht auf den **Mux-Kanal** geschickt ergibt
`1008 — invalid Remote stream request`. Die beiden Wege nehmen **nicht** dieselbe
Nachricht an.

`@deepseek-ai/dsh-api-gateway/lib/types/stream-protocol.d.ts`:

```ts
export declare const REMOTE_STREAM_MUX_PATH = "/api/remote.mux";
export type RemoteStreamClientMessage =
  | { type: 'open'; streamId: string; endpoint: string; payload: unknown }
  | { type: 'item'; streamId: string; value?: unknown }
  | { type: 'end'; streamId: string }
  | { type: 'cancel'; streamId: string };
export type RemoteStreamServerMessage =
  | { type: 'item';   streamId: string; value?: unknown }
  | { type: 'error';  streamId: string; error: RemoteStreamFailure }
  | { type: 'end';    streamId: string };
```

**Ein logischer Stream je Aufruf, über eine einzige Verbindung** — deshalb „mux".
Beide Richtungen (`item`), Abbruch (`cancel`), Fristen (`end`, `error`). Das ist
eine **bidirektionale, typisierte** Schnittstelle mit Strömen — der Gegensatz von
REST.

### 2d. Die Werkzeuge — der dritte Weg

Fähigkeiten wie Dateien, Shell, Jobs, Anhänge, Websuche sind **LLM-Werkzeuge**:
sie werden dem Modell angeboten, nicht einem HTTP-Aufrufer. Gemessen vorhanden:
`tool-fs`, `tool-bash`, `tool-pwsh`, `tool-jobs`, `attachment`,
`web-search-deepseek`, `web-fetch-http`, `terminal-bash`, `skill-filesystem`.

### 2e. Was **fehlt**, gemessen

| Ding | Befund |
|---|---|
| **SDK-Pakete** (`dsh-sdk-*`) | **nicht im `node_modules`**, **nicht** im Web-Bundle deklariert |
| **MCP-Server** (unserer wird von außen gerufen) | **nicht im Web-Bundle** |
| `dsh-mcp-resources` | vorhanden (MCP-**Ressourcen**), aber nicht im Web-Bundle |
| ACP (`packages/acp`, `packages/bundle/acp-app`) | im Vorlagenbaum, **nicht** in unserem `node_modules` |

**MCP heißt hier also: Werkzeuge eines fremden Servers benutzen — nicht, unsere
Fähigkeiten einem fremden Client anbieten.** Das ist die Richtung, die fehlt.

---

## 3. Die Antwort in einem Satz

**Die Harness nutzt nicht „nur REST" — sie nutzt REST überhaupt erst seit zwei
Tagen, und der Core nutzt es gar nicht.** Der Core spricht **Typert Remote über
WebSocket** (acht Controller, Ströme, typisiert); die Werkzeuge gehen über
**LLM-Funktionsaufrufe**; die Dateien, das Terminal und die Einstellungen ebenso.

**Und trotzdem ist das Gefühl richtig — aus dem anderen Grund.** Unser eigener
Beitrag ist **zwei lesende Endpunkte**. Die drei Pakete, die den Agenten
ausmachen, sind **nirgends angeschlossen**. Von „es reicht nicht" bis „es ist
nicht angeschlossen" ist der Unterschied wichtig: es fehlt nicht die Menge, es
fehlt die **Anbindung**.

---

## 4. Wer gehört wohin — die Grenze, die ich vorschlage

Die Wahl zwischen „HTTP" und „RPC-Kanal" ist keine Geschmacksfrage. Sie folgt aus
der Form der Nachricht:

| Was | Wohin | Warum |
|---|---|---|
| Erreichbarkeit, Bereitschaft | **HTTP, GET, offen bzw. geschützt** | ein Wort, keine Sitzung, keine Reihenfolge. Genau das ist gebaut |
| **Sitzung anlegen, Nachricht senden** | **Typert Remote** | es entsteht etwas Bleibendes; die Antwort ist ein **Strom** aus Textstücken, Werkzeugaufrufen und Nutzungszahlen |
| Werkzeugausführung im Agenten | **LLM-Funktionsaufruf** | das Modell ruft, nicht ein HTTP-Client |
| Dateien, Terminal, Einstellungen | **schon da** (2b) | fremde Arbeit, nicht unsere |
| Fremde Werkzeuge benutzen | **MCP-Client** | fehlt im Bundle, wäre ein Zusatz |
| Unsere Fähigkeiten **anbieten** | **MCP-Server** | fehlt vollständig |

**Die Regel dahinter:** was **strömt** oder **bleibenden Zustand** hat, gehört auf
den RPC-Kanal; was **ein Wort** ist, gehört auf HTTP. Ein `/api/chat` als
REST-Endpunkt wäre die falsche Bauart — es müßte für einen Strom aus Textstücken
und Werkzeugaufrufen eine eigene Ersatzform erfinden, und die gäbe es dann
**zweimal**: einmal in unserer Erfindung, einmal im Protokoll des Cores.

---

## 5. Was daraus als nächstes folgt — nach dem, was **nie** gebaut wurde

**Nicht** „mehr Endpunkte". Die Reihenfolge ist:

1. **Die Kette muß überhaupt erreichbar sein.** Adapter, Agent-Loop und Session
   laufen in Tests und in keiner Anwendung. Das ist der älteste offene Punkt
   dieses Projekts (`P8.13`) und der einzige, der „es reicht nicht" wirklich
   beantwortet.
2. **Eine Sitzung auf dem RPC-Kanal anbieten** — als Typert-Remote-Registrierung,
   nicht als eigener HTTP-Endpunkt. Dort sind Ströme, Abbruch und Fristen schon
   gelöst.
3. **Erst dann** über MCP nachdenken — in **beide** Richtungen.
4. **Und `GET /api/ready` bleibt, was es ist:** ein lesender Endpunkt für
   Maschinen. Er ist kein Agent und soll keiner werden.

**Keines davon ist in diesem Schritt gebaut.** Dieser Beleg beantwortet eine
Frage — er behebt nichts. Was er belegt, ist der Umfang der Lücke, und der ist
größer als „nur REST".

---

## Was hier **nicht** belegt ist — ehrlich

1. **Die Methodennamen der acht Controller sind nicht ermittelt.** Gemessen ist,
   daß der Gateway eine Registrierung führt und `session/getState` **nicht**
   darin steht. **Welche** Namen darin stehen, ist **offen** — es wäre der
   nächste Schritt, und er ist mechanisch (die Registrierung führt die Endpunkte).
2. **Kein Aufruf eines echten Endpunkts ist gelungen — auf keinem der zwei Wege.**
   Belegt ist für **beide**: der Weg nimmt die Nachricht an, **prüft** sie und
   antwortet mit einem typisierten Fehler **im Rahmen**. Nicht belegt ist, daß ein
   Aufruf ein **Ergebnis** liefert. Die zwei Fehler sind ehrliche Fehler über
   meine Nachricht (`bad-request`, „payload must contain … args") bzw. über meinen
   Methodennamen (`invocation-unavailable`) — nicht über den Weg.
3. **Die Zahl der Typert-Endpunkte ist nicht gezählt.** Die Aufsicht nennt
   „93 Pakete definieren Endpunkt-ids" — das ist ihre Messung, nicht meine.
4. **Nur unter Bun 1.4.0 auf Windows gemessen.** Der `WebSocket`-Aufruf in der
   Sonde war der von Bun; im Browser kann er anders aussehen.
5. **Der MCP-Befund ist aus `node_modules` abgeleitet**, nicht aus einem Lauf.
   Ob `dsh-mcp-resources` in unserem Profil etwas tut, ist nicht gemessen.
