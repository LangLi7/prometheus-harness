# Verdichtung — sie läuft, und hier ist die Spur

> **Gemessen:** 14.10.2026 · Windows nativ · Bun 1.4.0 · drei Läufe, drei verschiedene Ports,
> **dreimal Exit 0** mit identischer Struktur
> **Sonde:** [`messsonden/verdichtung-sonde.mjs`](messsonden/verdichtung-sonde.mjs)

## 1. Die Frage, die offen war

Die [Plugin-Inventur](plugin-inventur.md) hat belegt, daß die Verdichtung **komponiert** ist:
`dsh-compaction-basic`, `dsh-command-compact` und `dsh-compaction-tool-result-pruner` stehen im
Standard-Preset auf `enabled=true, phase=active`.

**Aktiv heißt eingehängt, nicht wirksam.** Das stand bis hierher ausdrücklich als Lücke im
README. Der naheliegende Weg — eine **lange** Sitzung bis zum Kontextdruck — ist teuer,
langsam und schlecht wiederholbar. Es gibt einen besseren: den **Befehl** `/compact`.

## 2. Der Weg: den Server fragen, nicht raten

`dsh-commands` bietet zwei Remotes. Der Vertrag:

```
'@deepseek-ai/dsh-commands#commands/list'
  scope:      { context: 'agent', wire: 'agentId' }
  parameters: [ { name: 'agent', wire: 'agentId', source: 'lookup', lookup: 'agent' } ]

'@deepseek-ai/dsh-commands#commands/execute'
  scope:      { context: 'agent', wire: 'agentId' }
  parameters: [ { name: 'agent',  wire: 'agentId', source: 'lookup' },
                { name: 'line',   wire: 'line',    source: 'json' },
                { name: 'submittedAttachments',    source: 'json' } ]
```

`source: 'lookup'` heißt: die Sitzung wird **aus dem Geltungsbereich** aufgelöst und steht
**nicht** im Pfad. **Geraten habe ich nicht** — vier Formen wurden durchprobiert, und der
Server hat jede **mit Begründung** abgelehnt:

| Versuch | Antwort des Servers |
|---|---|
| `args:{ agent: … }` | `gateway/arguments-invalid` — `missing "agentId"; unexpected "agent"` |
| `method:'agent:commands/list'` | `HTTP 404 "not found"` |
| `args:{ …, scope:{…} }` | `gateway/arguments-invalid` — `unexpected "scope"` |
| **`args:{ agentId: … }`** | **OK** |

Das ist dieselbe Methode wie in [api-nachweis.md](api-nachweis.md) §2: **jede Fehlermeldung war
die nächste Auskunft.** Drei Fehlversuche, kein Blindflug.

## 3. Was unser Host an Befehlen anbietet — gemessen

```
compact       Compact older conversation history        (@deepseek-ai/dsh-command-compact)
export        Download this Session log as a ZIP archive (@deepseek-ai/dsh-session-log-export)
feedback      Record feedback about this session        (@deepseek-ai/dsh-command-feedback)
goal          Set or view the goal for a long-running task (@deepseek-ai/dsh-command-goal)
permission    Switch the permission preset (sandbox mode + approval policy) (@deepseek-ai/dsh-permission-presets)
plan          Enter or leave plan mode                  (@deepseek-ai/dsh-plan-mode)
```

**Sechs Befehle.** `/compact` ist dabei.

## 4. Der Befund — dreimal dasselbe

Ablauf je Lauf: Host starten, anmelden, `session/create`, **eine** winzige Runde
(„Antworte mit genau einem Wort: HALLO"), auf `turn/end` **warten**, dann `/compact`.

```
commands/execute  { agentId, line: '/compact', submittedAttachments: [] }

  commandId: cmd-219b0161-1
  Art:       success
  Text:      Compacted 4 history items (~1154 tokens).
  Ereignis:  seq 25
```

Und das Protokoll **vorher 23, nachher 30 Ereignisse** — sieben neue:

| Ereignisart | Zuwachs |
|---|---|
| `command/run` | +1 |
| `compaction/start` | +1 |
| `compaction/summary` | +1 |
| `compaction/end` | +1 |
| `command/done` | +1 |
| `user/message` | +1 |
| `session-log-deepseek/delivery-accepted` | +1 |

**Die Nutzlast ist echter Inhalt, nicht nur ein Ereignis.** Auszug aus `compaction/summary`:

```json
{ "compactionId": "e644226b-b347-4a9d-acd5-2169d871c719",
  "sourceCommandId": "cmd-9de44806-1",
  "summary": [ { "type": "text", "text":
    "## Primary Request and Intent\n- User's sole request, verbatim: \"Antworte mit genau
     einem Wort: HALLO\" …\n## Next Step\n- Output exactly: HALLO\n## Critical Context …" } ] }
```

`compaction/start`, `compaction/summary` und `compaction/end` tragen **dieselbe**
`compactionId`, und `sourceCommandId` führt auf den auslösenden Befehl zurück. Der Ablauf ist
damit **in sich verknüpft** — nicht drei unabhängige Zeilen.

**Drei Läufe auf drei Ports, dreimal Exit 0, dieselbe Struktur.** Die Zusammenfassungstexte
unterscheiden sich im Wortlaut (das Modell formuliert), die **Struktur und die Zahlen** sind
gleich.

## 5. Was damit belegt ist — und was ausdrücklich NICHT

**Belegt:**

* `/compact` ist in unserem Host **registriert** und **aufrufbar**.
* Der Befehl läuft **durch** (`kind: 'success'`) und nennt eine Menge („4 history items,
  ~1154 tokens").
* Die Verdichtung erzeugt **drei verknüpfte Ereignisse** mit **echtem Zusammenfassungstext**.
* Das alles **ohne** eine lange Sitzung — der Weg ist billig und wiederholbar.

**NICHT belegt:**

* **Daß die Verdichtung bei Kontextdruck von SELBST auslöst.** Gemessen ist der Weg **auf
  Anforderung**. `dsh-compaction-basic` und `dsh-compaction-tool-result-pruner` sind
  komponiert, aber ihr **automatisches** Auslösen ist ein anderer Vorgang und weiterhin
  ungemessen. Wer diesen Nachweis für „Compaction läuft vollständig" hält, liest zu viel
  hinein.
* **Daß die verdichtete Sitzung danach besser weiterläuft.** Die Wirkung auf den weiteren
  Verlauf ist nicht geprüft.

## 6. Ein Nebenbefund, der die frühere Messung stützt

Die [Ereigniszählung](werkzeug-nachweis.md) über **18 Sitzungen mit 832 Ereignissen** fand
**keine einzige** Verdichtungs-Ereignisart. Das war **kein** Widerspruch zu „komponiert und
aktiv": diese Sitzungen waren **kurz** (längste: 38 Werkzeugaufrufe). Verdichtung greift bei
Kontextdruck, den keine von ihnen erreichte.

**Die Lehre:** *abwesend in einer Stichprobe* ist nicht *abwesend*. Der Satz, den ich zuerst
hätte schreiben können — „die Protokolle zeigen keine Verdichtung, also läuft sie nicht" —
wäre falsch gewesen, und die Stichprobe hätte ihn nicht gedeckt.

## 7. Reproduktion

```powershell
bun docs/status/messsonden/verdichtung-sonde.mjs 3092
```

Exit **0**: Befehl durchgelaufen **und** Verdichtungsereignis im Protokoll.
Exit **1**: Befehl lief, aber **kein** Ereignis — dann ist die Wirkung nicht belegt.
Exit **1**: Befehl meldete `error`.
Exit **2**: Vorbedingung verletzt (kein Host, keine Sitzung, kein Protokoll, kein `/compact`).
