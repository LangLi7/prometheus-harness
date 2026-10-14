# Agent-Kern — was er ist, und was davon belegt ist

> **Stand:** 14.10.2026 · Alle Angaben aus **eigenen Messungen**; jede Zeile nennt die
> Quelle. Diese Datei ist die **Karte**: sie sagt je Baustein, ob „komponiert",
> „aktiv" oder **„wirkt"** gilt — und wo nur das erste zutrifft.

## 1. Warum diese Datei existiert

Der Agent-Kern war zwischenzeitlich **teilweise** als „noch zu bauen" notiert, obwohl er
zum größten Teil **komponiert und aktiv** war. Umgekehrt galt „aktiv" stillschweigend als
„funktioniert". Beides ist falsch, und der Unterschied ist meßbar:

| Stufe | Was gemessen wird | Wo |
|---|---|---|
| **installiert** | liegt im Baum | `node_modules/@deepseek-ai` (257 Pakete) |
| **komponiert** | steht im Loader oder in einer Preset-Zeile | [plugin-inventur.md](plugin-inventur.md) |
| **aktiv** | Lebensphase `active`, Fähigkeit eingehängt | dieselbe Quelle |
| **wirkt** | hat in einer echten Sitzung eine **Spur** hinterlassen | Ereigniszählung, diese Datei |

## 2. Die Karte — gemessen an 21 Sitzungsprotokollen

Die Ereigniszählung über alle Protokolle unter `.pmh-build/harness-home/sessions`.
**Nur was eine Spur hat, ist „wirkt".**

| Baustein | Spur | Belege | Urteil |
|---|---|---|---|
| **Agentenschleife** | **176** | `turn/start` `step/start` `step/end` `turn/end` | **wirkt** |
| **Modellantwort** | **69** | `assistant/message` | **wirkt** |
| **Werkzeuge** | **225** | `tool/call` 113 · `tool/result` 112 | **wirkt** ([werkzeug-nachweis.md](werkzeug-nachweis.md) §8) |
| **Sitzung** | **168** | `session`, `session/title`, `session/end-seed` | **wirkt** |
| **Verdichtung** | **9** | `compaction/start/summary/end` ×3 | **wirkt auf Anforderung** ([verdichtung-nachweis.md](verdichtung-nachweis.md)) |
| **Unteragenten** | **4 + 2 Sitzungen** | `subagent/descriptor`, `subagent/catalog`; **zwei Sitzungen mit `origin=subagent`, `delegationDepth=1` und Elternbezug** | **wirkt** |
| **Berechtigungen** | **45** | `approval/policy` 21, `permission/preset` 19, `approval/asked` 3, `approval/decided` 2 | **wirkt** — mit einer offenen Frage (§4) |
| **Sandkasten** | **21** | `sandbox/mode` | **wirkt** |
| **Aufgabenliste** | **1** | `todo/write` | **belegt, dünn** |
| **Arbeitsbereich** | **1** | `workspace/changes` | **belegt, dünn** |
| **Befehlleiste** | **6 + Befehle** | `command/run`, `command/done`; sechs Befehle einzeln geprüft (§3) | **wirkt** |
| **Ziele** | **0 → jetzt belegt** | siehe §3 — der Befehl `/goal` treibt eine **Runde** an | **wirkt** (vorher: kein Beleg) |
| **Kontextanfrage** | **36** | `request/header`, `request/context` | **wirkt** |

**Vor dieser Messung war „Ziele" der einzige Baustein ohne jede Spur** — obwohl
`dsh-goal` und `dsh-goal-round-driver` komponiert und `active` sind. Genau der Fall, den
die Karte sichtbar machen soll.

## 2.1 Die Korrektur — meine erste Karte war **aus dem Gedächtnis gebaut**

Die Tabelle in §2 hat **13 Zeilen, die ich mir selbst ausgedacht habe**. Das Standard-Preset
hat **26 aktive Zeilen**. Ich habe also meine *Erinnerung* an „Agent-Kern" kartiert, nicht
die **gemessene** Zusammensetzung — und damit genau das getan, was Regel 3 der
[Arbeitsweise](arbeitsweise.md) verbietet.

Die Kreuzung aus **gemessener Zusammensetzung** (`pluginInventur`) und **Ereigniszählung**
fördert sofort zutage, was meine Liste verschwieg. Die Zuordnung Zeile → Werkzeugname steht
**ausgeschrieben** in der Sonde, nicht geraten.

**Von 16 Werkzeug-Zeilen des Presets wurden 7 NIE aufgerufen:**

| Zeile | zugeordnete Werkzeuge | Urteil |
|---|---|---|
| `dsh-tool-pwsh` | `pwsh` (33×) | belegt |
| `dsh-tool-fs` | `read` (27×), `write` (9×) | belegt |
| `dsh-tool-fs-search` | `glob` (14×), `grep` (9×) | belegt |
| `dsh-tool-jobs` | `job_list` (3×), `job_output` (4×) | belegt |
| `dsh-tool-schedule` | `schedule_list` (2×) | belegt |
| `dsh-tool-todo` | `todo_write` (1×) | belegt |
| `dsh-tool-web` | `web_search` (3×), `web_fetch` (2×) | belegt — **`web_fetch` 2× fehlerhaft** |
| `dsh-tool-subagent` (2 Zeilen) | `subagent` (2×), `send_message` (2×) | belegt |
| **`dsh-tool-skill`** | `skill` | **NIE AUFGERUFEN** |
| **`dsh-tool-goal`** | `goal_*` | **NIE AUFGERUFEN** — das Ziel kam über `/goal`, nicht über das Werkzeug |
| **`dsh-tool-ask-user`** | `ask_user_question` | **NIE AUFGERUFEN** |
| **`dsh-tool-present`** | `present` | **NIE AUFGERUFEN** |
| **`dsh-tool-subagent-control`** | `interrupt_agent`, `list_agents` | **NIE AUFGERUFEN** |
| **`dsh-tool-subagent-control/list-agents`** | `list_agents` | **NIE AUFGERUFEN** |
| **`dsh-tool-workflow`** | `workflow` | **NIE AUFGERUFEN** |

**Und drei aktive Zeilen ohne jede Spur — kein Ereignis, kein Werkzeugaufruf:**

* `@deepseek-ai/dsh-persona`
* `@deepseek-ai/dsh-skill-filesystem`
* `@deepseek-ai/dsh-workflow-ptc`

**Die Folge für das Urteil.** Der Agent-Kern ist **nicht** „abgeschlossen". Er ist
**belegt für 14 Werkzeuge und 6 Befehle** — und **offen für sieben Werkzeug-Zeilen, die nie
gerufen wurden**, plus drei Zeilen ohne Spur. Daß ein Werkzeug **nie gerufen** wurde, ist
**kein** Defekt: es heißt, daß niemand es gebraucht hat. Es heißt aber auch, daß **nichts**
über es bekannt ist — und „nie gerufen" ist von „kaputt" nicht zu unterscheiden, solange
niemand es ruft.

**Eine Gegenprobe, die etwas fand:** `working_directory` wurde **2×** gerufen, hat aber
**keine Zeile im Standard-Preset**. Das Werkzeug kommt also von **außerhalb** dieser
Zusammensetzung — der Host stellt es bereit. Auch das steht in keiner meiner erfundenen
13 Zeilen.

## 3. Die sechs Befehle — einzeln gefahren

Sonde: [`messsonden/befehl-sonde.mjs`](messsonden/befehl-sonde.mjs). Sie fährt **einen**
Befehl, nennt die Antwort **und** die Ereignisse, die er hinterläßt.

| Befehl | Antwort | Eigene Spur | Exit |
|---|---|---|---|
| `/goal <Ziel>` | `Goal created · Status: active · Rounds: 0/256 · Activation: armed` | **`goal/change`** + `turn/start` `step/start` `request/header` | **0** |
| `/plan` | `Plan mode on. Use /plan off to leave.` | **`plan/mode`** | **0** |
| `/compact` | `Compacted 4 history items (~1154 tokens).` | **`compaction/start/summary/end`** | **0** |
| `/feedback <Text>` | `Feedback recorded for session …` | **`feedback/record`** | **0** |
| `/feedback` (ohne Text) | **`error`**: `Feedback text is required. Usage: /feedback <text>` | keine | 1 (richtig) |
| `/permission` (ohne Argument) | `current preset workspace-write (available: read-only, workspace-write, danger-full-access)` | keine | 1 (Abfrage) |
| `/export` | `Session log download requested.` | keine | 1 |

**Drei Zeilen mit Exit 1, und sie bedeuten Verschiedenes:**

* **`/feedback` ohne Text ist ein `error` — und das ist richtig.** Der Befehl **weist einen
  fehlenden Parameter ab**, statt still etwas zu tun. Ein `error` ist hier die **erwünschte**
  Antwort; die Sonde meldet Exit 1, weil sie „hat nicht gewirkt" sagt, nicht „ist kaputt".
* **`/permission` ohne Argument ist eine Abfrage** — keine Zustandsänderung ist richtig.
* **`/export` wird angenommen** (`Session log download requested.`), aber der Kern
  hinterläßt **keine Spur**: der Download entsteht beim **Client**. Ob er funktioniert, ist
  auf diesem Weg **nicht meßbar** — das ist eine Grenze der Sonde, kein Befund.

**`/goal` ist der aufschlußreichste Fall:** neben `goal/change` erscheinen `turn/start`,
`step/start`, `request/header` und `request/context`. Das Ziel **treibt also wirklich eine
Runde an** — `dsh-goal-round-driver` ist nicht bloß eingehängt, sondern tätig.

## 4. Was offen ist — und zwar **benannt**, nicht stillschweigend

### 4.1 Eine Zustimmung ohne Entscheidung — **geklärt, kein Defekt**

`approval/asked` **3**, `approval/decided` **2**. Nachgesehen in `session-01b6fe52`:

```
[seq 125] approval/asked   id f567e9c3…    [seq 126] approval/decided  id f567e9c3…  allowed-once
[seq 143] approval/asked   id d8f3531e…    [seq 145] approval/decided  id d8f3531e…  allowed-once
[seq 174] approval/asked   id ee50cbd8…    ---- keine Entscheidung ----
```

Zwei sind **über die `id` gepaart** und beide `allowed-once`. Die dritte ist die **letzte
Anfrage der Sitzung** — und die Sitzung endet so:

```
[seq 176] tool/result   id "interrupted-tool-result-call_01_…-176"
[seq 177] step/end
[seq 178] turn/end      reason: {"kind":"interrupted"}
[seq 179] session/end-seed
```

**Der Turn wurde unterbrochen, nicht entschieden** — und der Harness **sagt das**: `reason:
interrupted`, dazu ein ausdrücklich als unterbrochen gekennzeichnetes Werkzeugergebnis.
Er täuscht keine Entscheidung vor und läßt die Anfrage nicht still verschwinden.

**Alle drei Anfragen haben denselben Grund**, und er ist eine echte Wechselwirkung mit der
Sandbox:

> *„escalate sandbox to danger-full-access: Der Typecheck startet Unterprozesse mit
> Pipe-stdio, was die Sandbox mit EPERM blockiert"*

Die Sandbox blockiert **Pipe-stdio**; der Agent mußte deshalb **dreimal** auf
`danger-full-access` eskalieren. Das ist der in `dsh-sandbox-policy` angelegte Weg — und
es ist der Grund, warum die Suite auf diesem Rechner mit weiteren Rechten läuft.

### 4.2 Ein Turn ohne Ende — **zwei Ursachen, beide erklärt**

`turn/start` **20**, `turn/end` **19**. Drei Sitzungen enden ohne `turn/end`:

| Sitzung | Ursache |
|---|---|
| `session-7e4f079f` (15:25), `session-a7e628e2` (15:26) | **meine eigenen Sonden.** `/goal` treibt eine Runde an; die Sonde beendet den Host nach 20 s — **bevor** die Runde endet. Ein Artefakt der Messung, **kein Defekt** |
| `session-fe47b230` (01:37) | hier fehlt auch das `tool/result`: der Host wurde **härter** beendet, bevor der Harness die Schlußereignisse schreiben konnte |

Daß der Harness die Schlußereignisse **schreiben kann**, zeigt `01b6fe52` (§4.1): dort
stehen `interrupted-tool-result` und `turn/end reason=interrupted`. Bei `fe47b230` kam er
nicht mehr dazu.

**Die Lehre für meine Sonden:** wer den Host nach einer festen Zeit beendet, erzeugt selbst
unvollständige Sitzungen. Das gehört in den Bericht — nicht als Harness-Fehler.

### 4.3 Verdichtung **von selbst** — ungemessen, und **warum**

Belegt ist der Weg **auf Anforderung** (`/compact`). Ob sie bei **Kontextdruck von selbst**
auslöst, ist **ungemessen** — und der Grund ist jetzt bezifferbar. `request/context` nennt:

```json
{ "provider": "deepseek-official", "model": "deepseek-flash",
  "contextWindow": 1000000, "systemPromptUpdate": "in-history" }
```

**Das Kontextfenster ist eine Million Token.** Eine Sitzung, die es füllt, ist auf diesem
Weg nicht wirtschaftlich herstellbar. Daß in 21 Sitzungen **kein** automatisches
Verdichtungsereignis steht, ist damit **erwartet** und kein Hinweis auf einen Defekt — die
Sitzungen lagen Größenordnungen darunter.

**Das ist ausdrücklich NICHT erledigt.** Es ist der teuerste offene Punkt des Agent-Kerns.
Ein möglicher Weg wäre, das Kontextfenster über eine Profiländerung künstlich klein zu
setzen — das ist eine **Änderung an der Zusammensetzung**, keine Messung, und müßte
begründet und zurückgenommen werden.

### 4.4 Zwei fehlende Unteragenten-Anschlüsse

`@deepseek-ai/dsh-subagent-claude-code` und `dsh-subagent-codex` sind vom Kern
**deklariert** und in **keinem** Baum installiert. Der **eigene** Unteragenten-Mechanismus
ist davon unberührt (er wirkt, §2). Es fehlt nur die Anbindung an die fremden CLIs.

### 4.5 Zwei Befehle sind nicht gefahren

`/export` und `/feedback` stehen in der Liste, wurden aber **nicht** geprüft. Das steht so
in der Tabelle in §3 und ist damit sichtbar offen.

## 5. Wie diese Karte nachprüfbar bleibt

```powershell
bun docs/status/messsonden/befehl-sonde.mjs 3089 "/goal Ein Ziel"   # Exit 0 = eigene Spur
bun docs/status/messsonden/werkzeug-paarung.mjs                     # die Ereigniszählung
bun docs/status/messsonden/plugin-inventur.mjs 3097                 # was komponiert ist
```

Die Ereigniszählung ist **kein** Ersatz für einen Test: sie zeigt, was **geschehen ist**,
nicht was **geschehen muß**. Sie hat hier genau eine Lücke gefunden („Ziele: kein Beleg") —
und die ist jetzt gefahren.
