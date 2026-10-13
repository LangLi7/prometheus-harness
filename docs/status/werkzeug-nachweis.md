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
| `web_fetch` | ❌ `dispatcher.close is not a function` | **nicht prüfbar** — dieses Werkzeug steht **nicht** in unserer Liste |

**Bilanz: 10 von 10 prüfbaren Werkzeugen grün.** Davon waren **drei** im Selbsttest-Bericht rot
(`pwsh`, `glob`, `grep`) — dieselben drei sind jetzt grün.

**Was in dieser Bilanz ausdrücklich offen bleibt:**

* **`glob` war einmal rot** (§2). Ein Werkzeug mit einem beobachteten Ausfall ist **nicht**
  sauber grün. Die Häufigkeit ist **nicht** bestimmt.
* **`web_fetch`** ist für uns **nicht prüfbar**, weil es in unserer Werkzeugliste fehlt. Der
  Fremdbericht nennt `dispatcher.close is not a function` — eine Laufzeitaussage, die zu Bun
  paßt, aber **von uns nicht gemessen** ist.
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
