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

## 3. Die sechs Befehle — einzeln gefahren

Sonde: [`messsonden/befehl-sonde.mjs`](messsonden/befehl-sonde.mjs). Sie fährt **einen**
Befehl, nennt die Antwort **und** die Ereignisse, die er hinterläßt.

| Befehl | Antwort | Eigene Spur | Exit |
|---|---|---|---|
| `/goal <Ziel>` | `Goal created · Status: active · Rounds: 0/256 · Activation: armed` | **`goal/change`** + `turn/start` `step/start` `request/header` | **0** |
| `/plan` | `Plan mode on. Use /plan off to leave.` | **`plan/mode`** | **0** |
| `/compact` | `Compacted 4 history items (~1154 tokens).` | **`compaction/start/summary/end`** | **0** |
| `/permission` (ohne Argument) | `current preset workspace-write (available: read-only, workspace-write, danger-full-access)` | **keine** | **1** |
| `/export`, `/feedback` | *nicht gefahren* | — | offen |

**`/goal` ist der aufschlußreichste Fall:** neben `goal/change` erscheinen `turn/start`,
`step/start`, `request/header` und `request/context`. Das Ziel **treibt also wirklich eine
Runde an** — `dsh-goal-round-driver` ist nicht bloß eingehängt, sondern tätig.

**`/permission` ohne Argument ändert nichts — und das ist richtig:** es ist eine
**Abfrage**. Die Sonde meldet trotzdem Exit 1, weil sie „Wirkung nicht belegt" sagt und
nicht „Befehl kaputt". Der Unterschied steht im Text der Sonde.

## 4. Was offen ist — und zwar **benannt**, nicht stillschweigend

### 4.1 Eine Zustimmung ohne Entscheidung

`approval/asked` **3**, `approval/decided` **2**. Eine angefragte Zustimmung hat **keine
Aufzeichnung einer Entscheidung**. Das kann harmlos sein (die Sitzung endete vor der
Antwort, und `turn/end` fehlt in genau einem Fall ebenfalls — siehe 4.2). **Geprüft ist es
nicht.** Ohne Prüfung ist es weder ein Defekt noch entlastet.

### 4.2 Ein Turn ohne Ende

`turn/start` **20**, `turn/end` **19**; `step/start` **69**, `step/end` **68**. Genau ein
Turn und ein Schritt enden nicht — dieselbe Sitzung, in der ein `tool/call` **ohne**
`tool/result` steht (Aufruf vom 14.10.2026, 01:37). Führende Erklärung, **nicht belegt**:
der Host wurde während der Runde beendet. Der Harness sagt das selbst ehrlich — im
Protokoll steht *„The tool call was interrupted after it was recorded, but no result was
durably recorded. Its outcome is unknown."*

### 4.3 Verdichtung **von selbst**

Belegt ist der Weg **auf Anforderung** (`/compact`). Ob sie bei **Kontextdruck von
selbst** auslöst, ist **ungemessen** — dafür wäre eine Sitzung bis an die Kontextgrenze
nötig. Das ist der teuerste offene Punkt des Agent-Kerns und ausdrücklich **nicht**
erledigt.

### 4.4 Zwei fehlende Unteragenten-Anschlüsse

`@deepseek-ai/dsh-subagent-claude-code` und `dsh-subagent-codex` sind vom Kern
**deklariert** und in **keinem** Baum installiert. Der **eigene** Unteragenten-Mechanismus
ist davon unberührt (er wirkt, §2). Es fehlt nur die Anbindung an die fremden CLIs.

## 5. Wie diese Karte nachprüfbar bleibt

```powershell
bun docs/status/messsonden/befehl-sonde.mjs 3089 "/goal Ein Ziel"   # Exit 0 = eigene Spur
bun docs/status/messsonden/werkzeug-paarung.mjs                     # die Ereigniszählung
bun docs/status/messsonden/plugin-inventur.mjs 3097                 # was komponiert ist
```

Die Ereigniszählung ist **kein** Ersatz für einen Test: sie zeigt, was **geschehen ist**,
nicht was **geschehen muß**. Sie hat hier genau eine Lücke gefunden („Ziele: kein Beleg") —
und die ist jetzt gefahren.
