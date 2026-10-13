# Der Kern läuft — Nachweis über die Schnittstelle, ohne Oberfläche

> **Gemessen:** 13.10.2026, 19:40 · Windows nativ · Bun 1.4.0 · Ziel `C:\Users\Chang\prometheus-harness`
> **Zweck:** Der Harness ist über seine API bedienbar, ohne daß jemand klickt. Diese Datei hält
> die **Form der Schnittstelle** und den **Abnahmenachweis** fest, damit jeder weitere Test
> reproduzierbar ist.

## 1. Das Ergebnis

```
session/create -> {"ok":true,"value":{"sessionId":"session-f6948382-…","agentPreset":"standard"}}
session/prompt -> {"ok":true,"value":{"accepted":true}}
```

Und aus dem Sitzungsprotokoll (`session.v4.jsonl.zstd`, entpackt):

```json
{"type":"assistant/message","seq":19,"data":{"turn":1,"step":1,"message":{
  "role":"assistant",
  "content":[{"type":"reasoning","text":""},{"type":"text","text":"HALLOWELT"}],
  "source":{"kind":"model","provider":"deepseek-official","model":"deepseek-flash"}}}}
{"type":"turn/end","seq":21,"data":{"turn":1,"reason":{"kind":"completed"}}}
```

**Das Modell hat geantwortet.** Anbieter `deepseek-official`, Modell `deepseek-flash`, Turn
`completed`. Der Auftrag lautete *„Antworte mit genau einem Wort: HALLOWELT"* — die Antwort
lautet **HALLOWELT**. Damit ist die Kette **Adapter → Agent-Loop → Sitzung → Modell**
durchgehend belegt, und die Voreinstellung `standard` ist **gültig** (vor der PTC-Reparatur
scheiterte sie mit `agent-preset/invalid`).

## 2. Die Form der Schnittstelle — jede Fehlermeldung war die nächste Auskunft

Der Kern spricht **nicht REST**. Der Weg wurde schrittweise aus den Antworten selbst
erschlossen; jede Zeile unten ist eine gemessene Antwort:

| Versuch | Antwort des Servers |
|---|---|
| `GET /?token=…` | **303** + Cookie `dsh-auth-<zufall>` |
| `POST /api/session/prompt` `{rpcId, method:'prompt'}` | `invalid client-request message` → `type` fehlt |
| … mit `type:'client-request'` | `method "prompt" does not match endpoint "session/prompt"` |
| … `method:'session/prompt'` | `Remote payload must contain exactly one plain-object args field` |
| … `payload:{args:{}}` | `missing "request"` |
| … `args:{request:{}}` | `wire field "request" failed boundary validation` |

**Daraus die gültige Form:**

```
POST /api/<voller/pfad>
Content-Type: application/json
Cookie: <aus GET /?token=…>

{ "type": "client-request",
  "rpcId": "<beliebig>",
  "method": "<voller/pfad>",          ← identisch mit dem Pfad, sonst bad-request
  "payload": { "args": { "request": { … } } } }
```

**Drei Eigenschaften, die man kennen muß:**

1. **Der Server antwortet immer mit HTTP 200** — auch bei Fehlern. Die Ursache steht im
   **Objekt**: `{"ok":false,"error":{"code":…,"message":…,"details":{…}}}`. Wer den Statuscode
   ansieht, sieht nichts. Das erklärt die Meldung `Failed to fetch (gateway/internal)` in der
   Oberfläche: **das ist eine Client-/Netzwerkaussage, keine Serverantwort.**
2. **`method` ist der volle Pfad.** `prompt` allein wird abgewiesen.
3. **`payload.args.request`** ist die Nutzlast; die Felder stehen im Descriptor des Endpunkts.
   Nachschlagen statt raten:
   `node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/types.d.ts`

## 3. Die Nutzlasten, die funktionieren

```ts
// session/create
{ cwd?: string; workspaceId?: WorkspaceId; sessionId?: SessionId; agentPreset?: string }
  -> { sessionId: SessionId; agentPreset?: string }

// session/prompt            (Typ SessionPromptRequest)
{ requestId: string;          // selbst vergeben; wird an der Benutzernachricht festgehalten
  sessionId: SessionId;
  mode: 'queue' | 'steer';
  content: readonly PromptContentPart[];   // z.B. [{ type:'text', text:'…' }]
  clientTimeZone?: string }
  -> { accepted: true }

// session/page              (Typ SessionPageRequest)
{ address: SessionAddress; throughSeq: number; beforeSeq?: number; maxMessages?: number; … }
  -> { records: readonly SessionHistoryRecord[]; hasMore: boolean }
```

**`session/page` braucht `throughSeq`** — eine Zahl aus dem Eröffnungsrahmen eines
`session/follow`-Stroms (WebSocket). **Wer die Antwort einfacher lesen will, liest die Datei**
(Abschnitt 4): sie ist der vollständige Ereignisstrom und braucht keinen Strom.

## 4. Wo die Sitzung liegt — und warum die Suche zuerst nichts fand

```
<harness-home>/sessions/<cwd-slug>/<sessionId>/session.v4.jsonl.zstd
```

Beispiel:
`…\.pmh-build\harness-home\sessions\--C-Users-Chang-prometheus-harness--\session-f6948382-…/session.v4.jsonl.zstd`

**Zwei Fallen, die je eine Messung gekostet haben:**

1. **Die Datei ist `zstd`-komprimiert.** Eine Suche nach `*.jsonl` findet sie **nicht** — der
   Name endet auf `.jsonl.zstd`. Entpacken mit `Bun.zstdDecompressSync` oder
   `zlib.zstdDecompressSync` (Node ≥ 22.15).
2. **Der Verzeichnisname ist der Arbeitspfad als Slug** (`--C-Users-Chang-prometheus-harness--`).
   Wer nur nach der Sitzungskennung sucht, findet den Projektionszwischenspeicher
   (`storages/session_projcache/sessions/<id>.json`) — **das ist nicht der Verlauf**, sondern
   eine Ableitung.

## 5. Was noch nicht belegt ist

* **Ob die Werkzeuge des Harness funktionieren.** Ein Selbsttest-Bericht eines Agenten meldet
  `pwsh`, `glob`, `grep`, `web_fetch` und Schreiben in den Arbeitsbereich als **kaputt**. Das
  ist **nicht** nachgefahren — dieser Nachweis betrifft nur den **Prompt-Weg**.
* **Ob eine Antwort über den Verlauf lesbar ist**, ohne die Datei zu lesen (`session/page`
  braucht `throughSeq` aus einem `session/follow`-Strom).
* **Die zwei fehlenden Pakete** `@deepseek-ai/dsh-subagent-claude-code` und
  `dsh-subagent-codex`: von `@deepseek-ai/dsh-app-boot/lib/index.js` **deklariert**, in keinem
  Baum installiert.

## 6. Reproduktion

```powershell
cd C:\Users\Chang\prometheus-harness
C:\Users\Chang\.bun\bin\bun.exe scripts/start.mjs --no-go     # gibt die Token-Adresse aus
# Token aus der Ausgabe in das Skript einsetzen, dann:
#   GET  /?token=<token>            -> 303 + Cookie
#   POST /api/session/create         -> sessionId
#   POST /api/session/prompt         -> { accepted: true }
```

Der Modellzugang liegt im Harness-Home des Projekts
(`.pmh-build\harness-home\.credentials.yaml`, Verweis `DEEPSEEK_API_KEY`).
**Der Wert wird hier nicht wiedergegeben** — Hausregel H4.
