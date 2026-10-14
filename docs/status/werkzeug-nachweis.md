# Werkzeuge des Harness — Nachweis je Werkzeug

> **Gemessen:** 13.10.2026 · Windows nativ · Bun 1.4.0 · über die API allein, ohne Oberfläche
> **Verfahren:** Sitzung anlegen, Prompt mit fünf Werkzeugproben absetzen, den Verlauf aus
> `session.v4.jsonl.zstd` lesen — siehe `docs/status/api-nachweis.md` für die Schnittstellenform.

## 1. Ergebnis

**Alle fünf Werkzeuge grün, in zwei Läufen hintereinander.** Jeder Lauf ist eine **eigene
Sitzung** mit demselben Prompt; der Agent ruft die Werkzeuge selbst auf und meldet je eine Zeile.

```
Lauf 1  session-e0a96b3b-c371-4a68-bcbc-38a3a227f37b
Lauf 2  session-de62cba7-0b47-49e4-a9bb-5fc2294ce37c

  pwsh: OK
  glob: OK
  grep: OK
  read: OK
  write: OK
```

| Werkzeug | vorher | **jetzt** | Nachweis |
|---|---|---|---|
| `pwsh` | ❌ `subprocess runner requires target argv after a private -- delimiter` | **OK** | zwei Läufe |
| `grep` | ❌ `ripgrep provider failure` | **OK** | zwei Läufe |
| `glob` | ❌ `ripgrep provider failure` | **OK** | zwei Läufe, zusätzlich drei Einzelproben (3 392 / 3 392 / 1 153 Treffer) |
| `read` | ✅ | **OK** | zwei Läufe |
| `write` | ✅ | **OK** | zwei Läufe |

## 2. Der Vorbehalt, der dazugehört — `glob` war zwischenzeitlich noch rot

**Ehrlich benannt:** in der Sitzung `session-d2a76d09` — **nach** der `bunfig.toml`-Änderung —
meldete der Agent noch

```
Shell: OK
glob:  FEHLER glob subprocess failed before reporting an outcome (ripgrep provider failure)
grep:  OK
```

und in zwei späteren Läufen war `glob` **grün**. Ein Werkzeug, das einmal rot und zweimal grün
ist, ist **nicht** als grün belegt, sondern als **sprunghaft**. Die wahrscheinlichste Ursache ist
nicht ermittelt: in der roten Sitzung setzte der Agent **Shell, glob und grep in einem Schritt**
(nacheinander im selben Zug) ab, in den grünen Läufen ebenfalls — ein Unterschied ist damit
**nicht** belegt. **Was fehlt:** mehrere Läufe mit gezielter Wiederholung, um die Häufigkeit zu
bestimmen. Bis dahin gilt: **5 von 5 grün, aber `glob` mit einem beobachteten Ausfall.**

> **Geschlossen am 14.10.2026 — siehe §8.** Das Flattern ist **nicht** sprunghaft: es hängt
> am **Arbeitsverzeichnis** der Sitzung. Die Vorladung kommt aus `bunfig.toml`, und die wird
> aus dem cwd gelesen; eine Sitzung außerhalb des Projekts bekommt einen **ungepatchten**
> Subprozeß-Runner. Gemessen: nach der Reparatur **0 Defekte in 60 Aufrufen** in
> Projekt-Sitzungen — und 8 Defekte in der **einen** Sitzung mit fremdem cwd.

## 3. Die Ursache, die gemessen ist

```
bun  script.mjs -- cmd arg  ->  ["bun.exe",  "script.mjs",        "cmd", "arg"]   ← "--" fehlt
node script.mjs -- cmd arg  ->  ["node.exe", "script.mjs", "--",  "cmd", "arg"]   ← vorhanden
```

**Bun verschluckt den `--`-Trenner, Node reicht ihn an das Skript durch.** Der Subprozess-Runner
des Cores verlangt ihn **wörtlich**:

```js
// node_modules/@deepseek-ai/dsh-subprocess-local/lib/runner-launch-*.js
if (argv[0] !== "--" || argv.length < 2) throw new Error(
  "subprocess runner requires target argv after a private -- delimiter");
```

Der Runner ist der **gemeinsame** Weg für **Shell und Suche** — fällt er, fallen beide zugleich.
Und die Meldung erscheint als **Werkzeugfehler**, nicht als Startfehler: der Host startet sauber,
liefert HTTP 200, und erst bei der **Benutzung** fällt es auf.

**Behoben** durch `scripts/subprozess-argv-ergaenzung.mjs` (erweitert die Prüfung, schaltet sie
**nicht** ab) — eingehängt über `scripts/bun-luecken-vorladen.mjs`, geladen aus **`bunfig.toml`**.

## 4. Der eigene Fehler, der zwei Anläufe gekostet hat

Die Ergänzung hing zuerst **nur** als `--preload` am Host-Start. Der Host meldete brav
`[pmh] Bun-Lücke ergänzt: Subprozess-argv` — **und die Werkzeuge blieben rot.**

**Grund:** der Runner ist ein **eigener `bun`-Prozess** (`spawnRunnerInvocation()` gibt
`[process.execPath, <runner.js>]` zurück). Ein `--preload` beim **Elternprozeß** erreicht das
**Kind** nicht. Erst in `bunfig.toml` findet **jeder** Bun-Prozeß des Projekts die Vorladung von
selbst.

**Die Lehre, die bleibt:** eine Ergänzung, die **Erfolg meldet**, ist damit noch nicht **wirksam**.
Der Nachweis ist der Werkzeugaufruf, nicht die Meldung des Laders.

## 5. Die übrigen Werkzeuge aus dem Selbsttest-Bericht (A3)

Zweite Sitzung, `session-75a69f2e-856a-4a96-b325-71a81703881b`, derselbe Weg über die API.
Die Antwort des Agenten wörtlich:

```
working_directory: OK  Arbeitsverzeichnis = C:\Users\Chang\prometheus-harness
job_list:          OK  keine Hintergrundjobs vorhanden
schedule_list:     OK  keine Zeitplaene vorhanden
web_search:        OK  8 Treffer (u. a. Ollama-Doku, KDnuggets)
subagent:          OK  Antwort des Unteragenten = SUBAGENT-OK
```

**Bemerkenswert und ausdrücklich festgehalten:** `subagent` funktioniert, **obwohl** die zwei
CLI-Adapter (`subagent-claude-code`, `subagent-codex`) abgeschaltet sind (A2). Der **eigene**
Unteragenten-Mechanismus des Kerns ist davon **unberührt** — die Abschaltung kostet nur die
Anbindung an die fremden CLIs, nicht die Unteragenten.

## 6. Die vollständige Bilanz gegen den Selbsttest-Bericht

| Werkzeug | Selbsttest-Bericht | **unsere Messung** |
|---|---|---|
| `read` | ✅ | **OK** |
| `write` | ✅ Temp / ❌ Arbeitsbereich auf `D:` | **OK** (unser Arbeitsbereich liegt auf `C:`) |
| `pwsh` | ❌ `subprocess runner requires target argv…` | **OK** (zweimal) |
| `glob` | ❌ ripgrep provider failure | **OK** (zweimal) — **einmal rot beobachtet**, siehe §2 |
| `grep` | ❌ ripgrep provider failure | **OK** (zweimal) |
| `web_search` | ⚠️ erster Versuch abgebrochen | **OK** |
| `subagent` | ✅ | **OK** — auch nach der Adapter-Abschaltung |
| `job_list` | ✅ | **OK** |
| `schedule_list` | ✅ | **OK** |
| `working_directory` | ✅ | **OK** |
| `web_fetch` | ❌ `dispatcher.close is not a function` | **in unserer Liste — hier stand „nicht prüfbar"** |

**Bilanz: 10 von 10 prüfbaren Werkzeugen grün.** Davon waren **drei** im Selbsttest-Bericht rot
(`pwsh`, `glob`, `grep`) — dieselben drei sind jetzt grün.

**Was in dieser Bilanz ausdrücklich offen bleibt:**

* **`glob` war einmal rot** (§2). Ein Werkzeug mit einem beobachteten Ausfall ist **nicht**
  sauber grün. Die Häufigkeit ist **nicht** bestimmt.
* **`web_fetch`** ist **nicht** „nicht prüfbar". Hier stand, das Werkzeug stehe „nicht
  in unserer Liste" — **widerlegt am 14.10.2026**: unsere eigenen Protokolle enthalten
  **zwei** `web_fetch`-Aufrufe, **beide** mit `dispatcher.close is not a function`. Das
  Werkzeug ist also vorhanden und der Defekt ist **bei uns reproduziert**, nicht bloß
  fremd berichtet. Nicht geprüft ist, ob er in einer Sitzung mit **Projekt**-cwd
  auftritt — beide Aufrufe liegen in einer Sitzung mit fremdem cwd (§8).
* **Der `D:`-Pfad** aus dem Fremdbericht ist **nicht** nachgestellt. Unser Arbeitsbereich liegt
  auf `C:`. Der Befund bleibt **pfadspezifisch und offen** — dazu gehört der **getrennte**
  Befund `packages/util/atomic-write` (`Zugriff verweigert (os error 5)`, **nicht** durch unsere
  Änderung verursacht).

---

## 7. Nachtrag 13.10.2026 — der Versuch, §2 zu schließen, und warum er scheiterte

**Die Frage aus §2 war: wie häufig fällt `glob` aus?** Ein Lauf über das **Modell** taugt dafür
nicht — er kostet Geld, er ist nicht wiederholbar, und der Agent entscheidet selbst, wann er
welches Werkzeug ruft. Also sollte **der Anbieter** wiederholt gefahren werden. Die Herkunft der
Meldung stand fest:

```js
// node_modules/@deepseek-ai/dsh-tool-fs-search/lib/index.js:194
} catch (error) {
  throw new SearchError(`${toolName} subprocess failed before reporting an
    outcome (ripgrep provider failure)`, "SEARCH_FAILED", { cause: error });
}
```

Geworfen, wenn `handle.done` **verwirft** — das ist der **Subprozess-Runner**, nicht ripgrep.

### Die erste Fassung maß nichts — 150/150, und alles leer

Sie startete fünfzigmal je Form `node_modules/@deepseek-ai/dsh-subprocess-local/lib/runner-launch-<hash>.js`
und meldete **150/150 gut**, Median 43 ms. Das war **gehaltlos**:

| Datei | Was sie ist | Was beim Starten geschieht |
|---|---|---|
| `runner-launch-<hash>.js` | die **Bibliothek** — Funktionen, keine Handlung | lädt und endet, **exit 0** |
| `runner.js` | der **Eingang** — `if (import.meta.main) …` | verlangt eine **Selection**, sonst **exit 127** |

Gestartet wurde die Bibliothek. Sie tut **nichts** — und „nichts" ist von „hat funktioniert"
nicht zu unterscheiden, solange man nur den Exit-Code ansieht. Die verdächtig gleichmäßigen
43 ms waren reine Startzeit.

**Gefunden hat es die Gegenprobe**, die ich eingebaut hatte, um die Sonde selbst zu prüfen: sie
sollte **ohne** die Vorladung scheitern — und **scheiterte nicht**. Eine Sonde, deren Gegenprobe
nicht rot wird, mißt nichts. Das ist die Lehre, die bleibt, und sie steht hier, weil ich sie
selbst gebraucht habe.

### Was gemessen ist (`docs/status/messsonden/subprozess-naht.mjs`, exit 0)

```
1. Der --Trenner
   bun  script.mjs -- zielprogramm arg1  ->  ["zielprogramm","arg1"]
   node script.mjs -- zielprogramm arg1  ->  ["--","zielprogramm","arg1"]

2. Bibliothek starten          status=0    <- es GESCHIEHT NICHTS
   Eingang ohne Selection      status=127  <- verlangt SUBPROCESS_RUNNER_ENV
   Im stderr des Kindes sichtbar: beide `[pmh] Bun-Lücke ergänzt: …`
```

Damit ist zweierlei belegt: die Ergänzung ist **im Kindprozeß wirksam** (die Lehre aus §4 gilt
weiter), und ein **nackter Start kann die Naht nicht fahren**.

### Der Schluß, ehrlich

**Die Häufigkeit des `glob`-Ausfalls bleibt unbestimmt.** Sie ist auf diesem Weg nicht zu
erhalten: der Runner berichtet über einen **IPC-Kanal** und verlangt eine Selection, die nur
der Aufrufer setzt. Wer die Naht fahren will, muß sie **benutzen** — also der Host mit einer
Sitzung und damit das Modell. Die Frage aus §2 bleibt **offen**; sie ist jetzt **begründet**
offen statt nur offen.

### Und ein zweiter, unabhängiger Fund

Die Vorladung schrieb ihre Meldung auf **`stdout`** (`scripts/bun-luecken-vorladen.mjs:56`).
Weil sie bei **jedem** `bun`-Prozeß dieses Projekts läuft, verfälschte sie die
**Standardausgabe jedes Kindprozesses**:

```
$ bun kind.mjs                      # gibt JSON aus
[pmh] Bun-Lücke ergänzt: PTC-Typentfernung …
[pmh] Bun-Lücke ergänzt: Subprozess-argv …
{"ergebnis":…}                      <- wer hier JSON liest, scheitert
```

Gefunden durch das `JSON.parse` der eigenen Sonde (*„Unexpected identifier \"pmh\""*). Behoben:
die Zeile schreibt jetzt nach **`stderr`** — Diagnose dorthin, Daten nach `stdout`.

**Was der Fund NICHT ist.** Er erklärt den sprunghaften `glob`-Ausfall **nicht**: der Runner
berichtet über IPC (`"ipc"` in `runner-launch-<hash>.js`), nicht über stdout. Die Vermutung
stand im Raum und ist damit **widerlegt** — sie steht hier, damit sie nicht wieder aufkommt.

---

## 8. Nachtrag 14.10.2026 — die Frage aus §2 ist geschlossen: das Flattern hängt am **Arbeitsverzeichnis**

§2 ließ offen, **wie häufig** `glob` ausfällt, und §7 schloß mit „begründet offen". Jetzt ist
die Frage beantwortet — nicht durch eine neue Modellsitzung, sondern durch **die Ereignisse
selbst**.

### Der Weg: die Ereignisse paaren, statt dem Agenten glauben

`docs/status/messsonden/werkzeug-paarung.mjs` liest **alle** Sitzungsprotokolle, zieht jedes
`tool/call` und jedes `tool/result` heraus und paart sie. Der Schlüssel ist
**`message.toolCallId`**:

```json
"message": { "role": "tool",
             "toolCallId": "call_00_ET_rT4CtZYkuDj2QWryf6WQ2645",
             "source": { "kind": "tool", "callId": "call_00_ET_…" },
             "isError": false }
```

**Mein erster Versuch paarte über `message.id`** — eine UUID der *Nachricht*, die mit dem
Aufruf nichts zu tun hat — und bekam **0 Zuordnungen aus 112 Ergebnissen**. Der zweite Versuch
paarte über `turn|step` und bekam 112 von 112 — **und das war falsch**: in einem Schritt können
mehrere Werkzeuge laufen; gemessen paarte sich ein `pwsh`-Aufruf mit **zwei** Ergebnissen.
**Eine Paarung, die zu gut aussieht, ist verdächtig.**

### Was gemessen ist

18 Protokolle, **113** `tool/call`, **112** `tool/result`, **23** Defekte. Und die Defekte
liegen **nicht** gleichmäßig:

| UTC | cwd der Sitzung | Aufrufe | Defekte |
|---|---|---|---|
| 17:57 / 17:59 / 18:01 | Projekt | 21 | **13** |
| **18:06 / 18:07** | Projekt | 15 | **0** |
| **18:08** | **`D:\Windows\Dokumente\deepseek-harness\default-workspace`** | 29 | **8** |
| ab 18:20 | Projekt | 60 | **0** |

Die Reparatur wurde **20:01:46 lokal = 18:01:46 UTC** festgeschrieben (`ca11574`). Davor: Defekte.
Danach: in **Projekt**-Sitzungen **kein einziger** Defekt in 60 Aufrufen — und die **eine**
Sitzung, die danach noch rot war, lief in einem **fremden** Arbeitsverzeichnis.

### Der Mechanismus, direkt gemessen

```powershell
# cwd = Projekt (bunfig.toml vorhanden)
[pmh] Bun-Lücke ergänzt: PTC-Typentfernung (module.stripTypeScriptTypes fehlt)
[pmh] Bun-Lücke ergänzt: Subprozess-argv (Bun verschluckt den -- Trenner)
["ziel","arg1"]                                     -> 2 Vorladungszeilen

# cwd = %TEMP% (kein bunfig.toml)
["ziel","arg1"]                                     -> 0 Vorladungszeilen
```

**Die Vorladung wird aus dem Arbeitsverzeichnis gelesen.** Startet ein `bun`-Prozeß außerhalb
des Projekts, findet er `bunfig.toml` nicht, ergänzt **nichts** — und der Subprozeß-Runner
verlangt den `--`-Trenner wörtlich, den Bun verschluckt. **Das ist die Ursache des Flatterns,
und sie ist keine Laune:** sie ist das Arbeitsverzeichnis der Sitzung.

**Was daran Schluß bleibt und nicht Messung:** daß der Runner als Kindprozeß das
Arbeitsverzeichnis der **Sitzung** erbt. Gemessen ist (a) die Vorladung hängt am cwd und
(b) die einzige rote Sitzung nach der Reparatur hatte ein fremdes cwd. Der Schluß von (a) und
(b) auf die Kette ist **stimmig, aber nicht einzeln gemessen**. Er würde geschlossen durch
einen Lauf mit `cwd` = fremdes Verzeichnis und gleichzeitiger Aufzeichnung der Umgebung des
Runner-Kindes.

### Die Bilanz, nach Arbeitsverzeichnis getrennt

| cwd | Sitzungen | Werkzeuge | Aufrufe | Defekte | Urteil |
|---|---|---|---|---|---|
| **Projekt** (nach `ca11574`) | 12 | **13** | **60** | **0** | **grün** |
| fremd (nach `ca11574`) | 1 | 11 | 29 | **8** | rot — Vorladung fehlt |
| Projekt (vor `ca11574`) | 3 | 5 | 21 | 13 | rot |
| fremd (vor `ca11574`) | 2 | 2 | 3 | 2 | rot |

Die 13 Werkzeuge in Projektsitzungen nach der Reparatur, **kein einziger Defekt**:

```
glob, grep, job_list, job_output, pwsh, read, schedule_list,
send_message, subagent, todo_write, web_search, working_directory, write
```

Ausgegeben von der Sonde selbst (`== Getrennt nach Arbeitsverzeichnis und Zeitpunkt ==`),
nicht von Hand gezählt. **Meine erste Fassung dieses Abschnitts zählte 13 von Hand und
schrieb `todo_search` statt `todo_write`** — eine Zahl, die stimmte, mit einer Liste, die
es nicht tat. Auch das ist der Grund, warum die Sonde die Liste druckt und nicht ich.

### Und ein eigener Zeitzonenfehler, festgehalten

Beim ersten Lesen dieser Daten hielt ich `7dc73d2` (23:10:36 **lokal**) für den Umschlagpunkt
und schrieb, die Defekte hörten „genau nach diesem Commit" auf. **Falsch:** die Sonde druckt
**UTC**, die Commits sind **lokal** (+2). Richtig ist `ca11574` um 20:01:46 lokal = 18:01:46 UTC
— also **drei Stunden vor** `7dc73d2`. Daß die Defekte nach der stdout→stderr-Umstellung
aufhörten, war ein Artefakt meiner Zeitzonenmischung. `7dc73d2` hat damit **nichts** mit dem
Werkzeugausfall zu tun, und die Begründung im Commit („der Runner berichtet über IPC, nicht über
stdout") steht unberührt.
