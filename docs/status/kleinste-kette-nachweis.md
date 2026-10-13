# Nachweis: die kleinste Kette

> **Gemessen:** 13.10.2026, Windows nativ (PowerShell) · Bun **1.4.0** ·
> TypeScript 7 (`tsgo 7.0.0-dev.20260707.2`) · Go 1.26.2 (nicht berührt)
>
> **Auftrag:** der Übergabepunkt aus dem vorigen Bericht — „`llm-retry` →
> danach der Agent-Loop" — **und alles, was zur ersten vollständigen Kette
> gehört**: Seam → Anbieter → Wiederholung → Loop → Werkzeuge → Sitzung →
> Persistenz → Wiederaufnahme.

## 1. Das Ergebnis in Zahlen

**Acht neue Pakete, alle mit Typecheck `exit 0` und allen Tests grün.**

**Die Zahlen sind je Testdatei gemessen, nicht je Ordner.** Das ist kein
Kleinlichkeitspunkt: `bun test packages/llm/llm` meldet in dieser Umgebung
**94** Tests statt 20, weil der Pfad als **Teilzeichenkette** geprüft wird und
damit `packages/llm/llm-deepseek` mitzählt. Ein Bericht, der die Ordnungszahl
übernimmt, meldete mehr Tests, als es gibt.

| Paket | `tsgo --noEmit` | Tests | `expect()` | Laufzeit |
|---|---|---|---|---|
| `packages/llm/llm` (Seam, erweitert) | **exit 0** | 20 pass · 0 fail | 48 | 36 ms |
| `packages/llm/llm-deepseek` (Adapter, erweitert) | **exit 0** | 33 pass · 0 fail | 63 | 36 ms |
| `packages/llm/llm-retry` (**neu**) | **exit 0** | 41 pass · 0 fail | 121 | 121 ms |
| `packages/llm/token-meter` (**neu**) | **exit 0** | 37 pass · 0 fail | 75 | 37 ms |
| `packages/core/agent-tools` (**neu**) | **exit 0** | 19 pass · 0 fail | 42 | (in `agent-loop.test.ts`, siehe unten) |
| `packages/core/agent-loop` (**neu**) | **exit 0** | 48 pass · 0 fail | 125 | 61 ms |
| `packages/agent/session-format` (**neu**) | **exit 0** | 41 pass · 0 fail | 99 | 39 ms |
| `packages/agent/session-persistence-jsonl` (**neu**) | **exit 0** | 36 pass · 0 fail | 79 | 137 ms |
| `tests/integration` (**neu**, die Kette) | **exit 0** | 6 pass · 0 fail | 61 | 98 ms |

**Zusammen: 262 Tests, 0 Fehler, 671 `expect()`-Aufrufe, unter 0,7 s.**

**Warum `agent-tools` keine eigene Testdatei hat.** Die 19 Tests der Registry
und der Werkzeugausführung stehen in `agent-loop.test.ts`, weil sie dort
**zusammen** mit dem Loop geprüft werden — eine eigene Datei hätte dieselben
Fälle ein zweites Mal. Für dieses Paket gibt es deshalb keine eigene Zahl,
sondern eine Zuordnung: die 48 Tests des Loops enthalten die 19 des Werkzeugs.
Sobald ein **echtes** Werkzeug dazukommt (Dateisystem, Shell), bekommt es eine
eigene Suite.

Gemessen mit:

```
bun test <testdatei>                              (je Datei, siehe Tabelle)
bunx tsgo --noEmit -p <paket>/tsconfig.json       (je Paket, exit 0)
```

**Warum je Paket und nicht `bun run typecheck`:** das Wurzel-Skript ruft
`bun run --filter '*' typecheck` — ein **verschachtelter** `bun`-Aufruf. In
dieser Umgebung scheitert er an `Failed to start process` (der Sandkasten
verbietet benannte Pipes für erfasste Kindprozesse; siehe §5). Der Ersatzweg ist
**nicht** schwächer: es sind dieselben `tsconfig.json`, nur einzeln aufgerufen —
13 Pakete, alle `exit 0`.

## 2. Zwei echte Fehler, die erst der durchgehende Test gefunden hat

**Beide saßen in der Lücke zwischen Loop und Persistenz** — genau der Stelle,
die kein Pakettest prüfen kann. Beide hätten sich in einer laufenden Sitzung
als „der Agent verhält sich seltsam" gezeigt, nicht als Absturz.

### Fehler 1: Die Assistenten-Nachricht verlor die Werkzeugaufrufe

Der Seam hatte **keinen Typ** für „das Modell hat ein Werkzeug verlangt". Der
Verlauf war damit nach der ersten Werkzeugrunde nicht mehr rekonstruierbar:

```
vorher:  { role: 'assistant', parts: [{ type: 'text', text: '' }] }   →  weggelassen
danach:  { role: 'tool', parts: [{ type: 'tool-result', callId: 'c1', … }] }
```

Die `tool_call_id` zeigte auf einen Aufruf, den die Nutzlast nicht kannte.
OpenAI-kompatible Anbieter — auch DeepSeek — beantworten das mit
`400 Bad Request`. **Der Fehler wäre erst bei der ersten echten Werkzeugrunde
aufgetreten**, also genau dort, wo er am teuersten ist.

Behoben durch `ToolCallPart` im Seam, `assistantMessage()` als **einzigen** Weg
eine Assistenten-Nachricht zu bauen, `checkHistory()` als Prüfung, und die
Übersetzung in `buildBody` (`tool_calls` mit `function.arguments` als String).
Der Adapter hat jetzt **drei** Tests für diesen Fall; einer davon prüft, dass
eine Assistenten-Nachricht mit Aufruf **nicht** mehr weggelassen wird.

Der Typ im Seam wuchs damit von 4 auf 5 `MessagePart`-Werte. Das ist ein Preis,
der benannt gehört: der Seam ist nicht mehr ganz so klein. Er beschreibt aber
**keine** Anbieter-Eigenheit — „das Modell hat ein Werkzeug verlangt" gilt für
jeden Anbieter; die Umsetzung ins Format bleibt im Adapter.

### Fehler 2: Die Sitzung verlor die Benutzereingabe und die Systemanweisung

Der Loop meldete den Text des Benutzers nur **im Feld** `userText` von
`turn-start` — als eigenes Ereignis gab es ihn nicht. Der durchgehende Test
faltete nach dem ersten Turn deshalb **eine** Nachricht aus der Datei statt
zwei:

```
Datei nach Turn 1:  session-start, turn-start, step-start, model-reply, turn-end
gefaltet:           ['assistant']            ← die Frage fehlte
```

Eine wieder aufgenommene Sitzung hätte mit einer Antwort auf eine Frage
begonnen, die niemand mehr sieht. Dasselbe für die Systemanweisung: sie stand im
Speicher, aber nicht in der Datei — der fortgesetzte Agent hätte unter
**anderen** Anweisungen gearbeitet als der erste.

Behoben durch zwei Ereignisse, `system-prompt` (einmal, vor dem ersten Turn) und
`user-input` (je Turn), samt Übersetzung im `foldSession`. Gemessen danach:

```
gefaltet:  ['system', 'user', 'assistant', 'tool', 'assistant', 'user', 'assistant']
```

## 3. Was die Kette belegt — der durchgehende Test

`tests/integration/kleinste-kette.test.ts` fährt die **echte** Kette: der
DeepSeek-Adapter baut die Nutzlast, setzt sie als JSON ab, liest die Antwort und
übersetzt Fehler. Nur das Gegenüber ist eine Attrappe — genau der Teil, den wir
nicht besitzen.

**Echt sind:** Seam, Wiederholung, Loop, Werkzeugausführung, Format, Persistenz
und das Dateisystem (ein temporärer Ordner).

**Nicht echt ist:** der Anbieter `api.deepseek.com`. Ein Test, der einen
Schlüssel und einen Netzaufruf braucht, wird nicht ausgeführt — und ein nicht
ausgeführter Test beweist nichts. **Es gibt deshalb keinen Nachweis gegen den
echten Dienst** (§6).

Die sechs geprüften Abläufe:

| # | Ablauf | Was er sichert |
|---|---|---|
| 1 | 429 → Wiederholung → Werkzeugaufruf → Text → **Sitzung schließen und neu öffnen** → zweiter Turn | die ganze Kette, und dass der zweite Aufruf **aus der Datei** kommt |
| 2 | Antwort ohne Werkzeuge | die Zählung wird als `reported` übernommen |
| 3 | Verlauf aus der Datei gegen Verlauf im Speicher | Rollen, Texte, Aufrufe und Ergebnisse sind **identisch** |
| 4 | `400 Bad Request` | wird **nicht** wiederholt, wird benannt (`rejected`, Code `400`) |
| 5 | Abbruch durch den Aufrufer mitten im Werkzeug | endet als `aborted`, Verlauf bleibt zuordenbar, kein zweiter HTTP-Aufruf |
| 6 | dauerhafte Überlastung | drei Versuche, Rückzug `[100, 200]` ms, dann `unavailable` mit `attempts: 3` |

**Der Beweis, der die Kette trägt** (Ablauf 1): der **vierte** HTTP-Aufruf
gehört zum zweiten Turn — er läuft nach dem Neuladen. Seine Nutzlast trägt:

```
messages: ['system', 'user', 'assistant', 'tool', 'assistant', 'user']
assistant.tool_calls[0].id               = 'call-1'
assistant.tool_calls[0].function.name    = 'read_file'
assistant.tool_calls[0].function.arguments = '{"path":"notizen.txt"}'
tool.tool_call_id                        = 'call-1'
tool.content                             = 'Inhalt von notizen.txt'
```

Ohne diese Zuordnung antwortete ein echter Anbieter mit `400`. Und weil der
Verlauf **aus der Datei** kommt, belegt das zugleich die Persistenz.

## 4. Die Entscheidungen, die dieses Paket treffen — je mit Preis

| Entscheidung | Warum | Der Preis, ausdrücklich |
|---|---|---|
| **Wiederholung als eigener Anbieter** (`llm-retry` umschließt einen Anbieter), nicht als Schleife im Loop | der Loop bleibt eine Zustandsmaschine; die Wiederholung ist ohne Netz und ohne Wartezeit prüfbar (Schlaf und Zufall sind austauschbar) | eine Schicht mehr im Aufrufweg; der Fehler des letzten Versuchs trägt die Zahl der Versuche als **angehängtes** Feld, nicht im Seam-Typ |
| **`maxSteps` je Turn ist hart** (Vorgabe 25) | ein Modell, das sich im Kreis dreht, darf keine offene Rechnung erzeugen. Der Test belegt: vier Runden, dann `max-steps` | ein legitim langer Turn wird bei 25 abgeschnitten. Wer mehr braucht, muss es setzen — bewusst |
| **Ein Werkzeugfehler beendet keinen Turn** | er wird zum Werkzeugergebnis, das Modell kann sich korrigieren. Nur ein Abbruch beendet | ein Modell kann viele Runden an einem kaputten Werkzeug verbrennen. Dagegen steht `maxSteps` |
| **Ein Abbruch wird nie wiederholt** — auch wenn ein fremder Adapter `retryable: true` dazu sagt | ein Abbruch ist ein Wunsch des Benutzers, keine Störung. Die Regel steht in `llm-retry`, nicht nur im Adapter | eine Wiederholung ist nicht mehr „einmal konfigurieren"; die harte Prüfung muss bekannt sein |
| **JSON-Zeilen statt einer JSON-Datei** | eine abgebrochene Zeile kostet **eine** Nachricht, keine Datei | die Datei ist kein gültiges JSON als Ganzes. Wer sie auswertet, liest Zeile für Zeile |
| **Ereignisse statt Zustände** | der Verlauf ist die Summe der Ereignisse; es gibt keine zweite Wahrheit, die widersprechen könnte | die Datei wächst linear mit der Arbeit |
| **Unbekannte Zeilen werden aufbewahrt und zurückgeschrieben** | eine spätere Fassung darf mehr wissen als diese; wer beim Lesen wegwirft, zerstört fremde Daten | diese Fassung trägt Ballast mit, den sie nicht versteht |
| **Der Schreiber erzwingt die Zeilennummer** und bricht bei einem Schreibfehler ab | eine doppelte Nummer macht den Verlauf mehrdeutig; ein Weiterschreiben nach einem Fehler erzeugt eine Lücke oder ein Duplikat | nach einem Schreibfehler muss die Sitzung **neu geöffnet** werden. Unbequem — und richtig: ein Schreibfehler ist kein Zustand zum Weiterarbeiten |
| **Die abgebrochene letzte Zeile wird beim Öffnen abgeschnitten** | sonst hängt das nächste Ereignis an ihrem Rest, und die **neue, gültige** Zeile wäre unlesbar. Gemessen: die Datei enthielt danach `…"type":"user-inp{"v":1,…` | der Rest ist verloren — genau der Teil, der nie gültig geschrieben wurde |
| **Der Zähler verbietet nichts** (`token-meter`) | eine Grenze, die stillschweigend das Verhalten ändert, sieht niemand greifen. Der Zähler meldet `overBudget`, der Loop entscheidet | der Loop muss die Grenze **auswerten** — tut er nicht, läuft er darüber |
| **Jede Summe nennt ihre Herkunft** (`reported` / `estimated` / `mixed`) | eine Zahl ohne Herkunft wird zur Messung, sobald niemand mehr weiß, woher sie kam | mehr Felder in jeder Anzeige und jeder Zeile |

## 5. Der Befund am Rande: `bun run typecheck` scheitert hier

```
$ bun run typecheck
$ bun run --filter '*' typecheck
error: Failed to start process
error: script "typecheck" exited with code 1
```

**Das ist kein Fehler des Skripts und keiner des Codes.** Der Sandkasten dieser
Sitzung verbietet Programmen das Öffnen **benannter Pipes**; damit scheitert ein
erfasster Kindprozess (`stdio: 'pipe'`) mit `EPERM`. `bun run --filter` startet
genau solche Prozesse. Dieselbe Grenze traf in derselben Sitzung `bun install`
(`unable to write files to tempdir: EPERM`) — nach einer ausdrücklichen Freigabe
lief es mit `exit 0` und **`2 packages installed`**.

**Der PATH-Befund aus `windows-start-nachweis.md` §2 bleibt davon unberührt** —
er ist eine zweite, unabhängige Ursache für denselben Fehlschlag. Beide gilt es
zu prüfen, wenn `bun run typecheck` wieder erwartet wird.

## 6. Der t40-Blocker: neue Messungen — und eine **Korrektur** der bisherigen Erklärung

Der Host unter **Windows nativ** kommt nicht hoch. Der bisherige Bericht
(`windows-start-nachweis.md` §5) erklärte das mit einer **Laufzeit-Grenze von
Bun** („derselbe Grenzbefund wie `node-addon-require-builtin`"). **Diese
Erklärung ist nach den Messungen dieser Sitzung nicht mehr haltbar.**

### Was gemessen wurde

Beide Läufe benutzen **denselben** Arbeitsbaum, dasselbe `node_modules`,
dieselbe Quelldatei (`apps/cli/src/main.ts`, Aufruf `web --port <n>`):

| Messung | Windows nativ (Bun 1.4.0) | WSL2 (Bun 1.4.3) |
|---|---|---|
| Profil-Einträge deaktiviert („version-incompatible") | **27** | **0** |
| `entries did not activate` | 27 | 2 |
| `pmh: Core läuft (Profil "web", Loader aktiv)` | ja | ja |
| Token-Zeile `dsh web: http://127.0.0.1:<port>/?token=…` | **fehlt** | vorhanden |
| `GET /` ohne Token | nicht erreichbar | **401** |
| `GET /?token=…` | nicht erreichbar | **303** + `set-cookie` |
| `GET /` mit Cookie | nicht erreichbar | **200 · 32.184 B · `text/html`** |
| Titel der ausgelieferten Seite | nicht erreichbar | **`DeepSeek Harness`** |

**Die deaktivierten Einträge sind nicht Randnotizen, sondern der Kern:** `llm`,
`session`, `agent`, `agent-default-model`, `jobs`, `llm-retry`, `token-meter`,
`settings`, `credentials`, `webserver`, `web`, `web-startup`, `directory-picker`,
`session-persistence-jsonl`, `session-query-sqlite`, `storage`, `typert`,
`typert-loader`, `user-questions` …

**Und der Fehlertext ist in sich widersprüchlich** — daran hängt alles:

```
Plugin @deepseek-ai/dsh-llm@0.1.1-rc.2 is incompatible with dsh 0.2.1-alpha.2:
peerDependencies {"@deepseek-ai/dsh-brand":"^0.1.1-rc.2", …}
```

### Warum die alte Erklärung nicht mehr trägt

1. **Es ist keine Laufzeit-Grenze.** Unter WSL2 läuft **Bun** — dieselbe
   Laufzeit, andere Plattform. Wäre es eine Bun-Grenze, liefe es dort ebenso
   wenig. Das Ergebnis ist **plattform**abhängig, nicht laufzeitabhängig.
2. **Die Laufzeitversion stimmt.** `getDshRuntimeVersion()` liest
   `@deepseek-ai/dsh-app-boot/package.json`. Nachgemessen mit einer Sonde
   ([`runtime-version-probe.ts`](messsonden/runtime-version-probe.ts)), die dieselbe Spezifikation aus
   demselben Einstieg auflöst wie der Host:

   ```
   Bun.resolveSync('@deepseek-ai/dsh-app-boot/package.json', 'apps/cli/src')
     → …\node_modules\@deepseek-ai\dsh-app-boot\package.json
     → Version 0.2.1-alpha.2
   Node-Kette: dieselbe Datei.  Weitere Kopien im Baum: keine.
   ```
3. **Die Fassung `0.1.1-rc.2` gibt es auf diesem Rechner nicht.**
   `node_modules/@deepseek-ai/dsh-llm/package.json` deklariert
   `version = 0.2.1-alpha.2` und als Peer **nur** `@deepseek-ai/cordis` — die im
   Fehlertext genannten Peers (`dsh-brand`, `dsh-attachment`, …) stehen dort
   **überhaupt nicht**. `bun pm ls` findet genau **eine** Kopie
   (`@deepseek-ai/dsh-llm@0.2.1-alpha.2`); die Zeichenkette `0.1.1-rc.2` kommt in
   `bun.lock`, in `apps/cli/package.json` und in allen 245 `@deepseek-ai`-Paketen
   des Projekts **nicht** vor — nur in zwei Vorlage-Dokumenten
   (`docs/dsh/**/manifest.json`).

**Der Fehlertext beschreibt also ein Paket, das auf diesem Rechner nicht
existiert.** Damit ist die Meldung nicht „ein veraltetes Paket wurde gefunden",
sondern „die Auflösung liefert eine fremde Identität". Woher sie kommt, ist
**nicht geklärt** (§8). Fest steht: die Kompatibilitätsprüfung sieht unter
Windows eine andere Paketidentität als unter Linux.

**Und die Folge ist genau der gemeldete Blocker:** `webserver` und `web-startup`
werden deaktiviert → kein Token, kein HTTP, sauberes Prozessende (Exitcode 0).

### Was das für den bisherigen Bericht bedeutet

Der Befund `connection (required): cannot get property "webRuntime" without
inject` aus `windows-start-nachweis.md` §5 ist damit **erklärt**: `web-runtime`
kommt aus `dsh-web-app` (Zeile `web-startup`), und diese Zeile wird unter Windows
**deaktiviert**. Der Pflicht-Eintrag `connection` wartet deshalb auf einen Dienst,
den eine abgeschaltete Zeile bereitstellen sollte. Es ist **keine**
Reihenfolge-Frage und **keine** Bun-Grenze, sondern die Folge der Deaktivierung.

**Und der HMR-Befund (P9.2) ordnet sich ein:** `hmr` steht in der Liste der
deaktivierten Zeilen. Die Patch-Zeile `{ id: 'hmr', disabled: true }` (P7.6)
wirkt also — nur wird `hmr` **zusätzlich** von der Kompatibilitätsprüfung
deaktiviert und erscheint daher weiter als „nicht aktiviert".

**Was daraus folgt:** `WSL2 ist der Weg` bleibt richtig, aber aus einem anderen
Grund als bisher dokumentiert — nicht weil Bun unter Windows eine Grenze hat,
sondern weil die Profil-Auflösung dort 27 Kern-Einträge als inkompatibel
abschaltet.

### Die Ursache — gemessen, nicht geraten

**Der Träger ist `C:\Users\Chang\.dsh\profiles\node_modules`.** Dort liegt eine
**alte Installation des DeepSeek Harness**: 204 Pakete der Linie `0.1.1-rc.2`,
darunter:

```
C:\Users\Chang\.dsh\profiles\node_modules\@deepseek-ai\dsh-llm\package.json
  name = @deepseek-ai/dsh-llm    version = 0.1.1-rc.2
```

**Der Weg, auf dem sie gefunden wird.** Im Rumpf `@deepseek-ai/dsh-app-boot`
sucht die Vorabprüfung das Manifest jeder Zeile so:

```js
const bare = barePackageName(specifier);
if (bare !== void 0 && packages === void 0)
  for (const path of createRequire(parentURL).resolve.paths(bare)) {
    const filename = join(path, bare, "package.json");
    if (existsSync(filename)) return readManifest(filename);   // ← der erste Treffer gewinnt
  }
```

`parentURL` ist der **Auflösungsanker des Baums** — und der liegt **außerhalb**
des Projektbaums, Richtung Harness-Home. Node sucht von dort **aufwärts**, und
der erste Treffer ist `.dsh\profiles\node_modules\@deepseek-ai\dsh-llm\package.json`,
die **alte** Fassung. Der Projektbaum wird **gar nicht mehr gefragt**.

**Nachgemessen durch eine temporäre Instrumentierung des Rumpfes** (danach
zurückgenommen — `node_modules` ist nicht versioniert): von **120** aufgelösten
Paketpfaden zeigten **120** nach `…\.dsh\profiles\node_modules` und **0** in den
Projektbaum.

**Und deshalb funktioniert WSL2:** dort gibt es `~/.dsh/profiles/node_modules`
**nicht** (gemessen; `~/.dsh` enthält nur `profiles` und `storages`). Die
Node-Kette läuft dort bis in den Projektbaum durch, findet `0.2.1-alpha.2`, und
**kein einziger** Eintrag wird deaktiviert.

**Damit ist die Kette der Ursachen geschlossen:**

```
parentURL (Auflösungsanker) zeigt ins Harness-Home
  → Node sucht von dort aufwärts
    → erster Treffer: ~/.dsh/profiles/node_modules (alte 0.1.1-rc.2-Installation)
      → peerDependencies ^0.1.1-rc.2 ≠ Laufzeit 0.2.1-alpha.2
        → 27 Kern-Zeilen deaktiviert (llm, session, agent, webserver, web-startup …)
          → kein Webserver, kein Token, kein HTTP
            → connection (required) wartet auf webRuntime — Prozess endet mit Exitcode 0
```

**Was das nicht ist:** keine Bun-Grenze (die alte Erklärung), keine
Reihenfolge-Frage (die zweite alte Erklärung), kein Fehler im Projektbaum. Es ist
der **Überrest einer früheren Installation** außerhalb des Repositories, der über
die Auflösungskette des Loaders wirkt.

**Und was ich deshalb NICHT getan habe.** Die Behebung verlangt eine Änderung
**außerhalb dieses Repositories** (`C:\Users\Chang\.dsh` entfernen, umbenennen
oder den Anker umlenken) — und in `~/.dsh` liegt die Installation, mit der der
Betreiber arbeitet. Eine fremde Installation zu löschen ist keine Aufräumaktion,
sondern ein Eingriff. **Der Befund steht hier; die Entscheidung gehört dem
Betreiber** (drei Wege in §8).

## 7. Was NICHT belegt ist — namentlich

Diese Liste ist der wichtigste Abschnitt dieser Datei. Ein Bericht ohne
Fehlschläge ist entweder leer oder geschönt.

| Offen | Warum es offen ist | Was daran hängt |
|---|---|---|
| **Kein Aufruf gegen den echten Anbieter** | kein Schlüssel in dieser Umgebung; jeder Test läuft gegen eine Attrappe. „Es funktioniert mit DeepSeek" ist damit **unbewiesen** | der erste echte Aufruf kann Formfehler zeigen, die keine Attrappe nachbildet |
| **Formatversion 4 der Vorlage ist nicht erreicht** | dieses Paket beginnt bei `v1`. Die vier Migrationen (v0→v1→v2→v3→v4) aus `MAPPING.md` §3.3 fehlen: die Feldbedeutungen der Vorlage sind ohne Vorlage-Daten nicht rekonstruierbar, und eine erfundene Migration würde fremde Verläufe **stillschweigend verfälschen** | ein Verlauf aus der Vorlage lässt sich **nicht** einlesen. `migrateEvents` meldet das ehrlich als `skipped` mit Grund, statt zu raten |
| **Keine Verdichtung** (Compaction) | `token-meter` **zählt**, es kürzt nicht. Bei einem langen Verlauf wächst die Anfrage bis zum `length`-Fehler des Anbieters | ein langer Turn endet unvermittelt |
| **Die Kette läuft nicht in der Anwendung** | sie ist über einen Test belegt, nicht über einen Start. Der Host unter Windows nativ kommt weiterhin **nicht** hoch (§7) | „der Harness hat einen Agenten" ist damit noch **nicht** gezeigt |
| **Kein `unit.json` für die neuen Pakete** | `units/README.md` verlangt es für Units; die neuen Ordner liegen unter `packages/` wie die bereits vorhandenen (`llm`, `unit-export`). **Der Widerspruch ist nicht vom Executor zu entscheiden** | die Pakete sind nicht als Units deklariert und damit nicht exportierbar |
 (`read_file` als Attrappe) | die Werkzeug-Registry ist geprüft (19 Tests), aber kein **echtes** Werkzeug (Dateisystem, Shell) hängt daran | der Weg Werkzeug → Systemwirkung ist ungeprüft |
| **Streaming fehlt** | `LlmProvider.complete` liefert die ganze Antwort; das ist die dokumentierte Entscheidung im Seam | die Oberfläche kann nichts anzeigen, während das Modell arbeitet |
| **Die Herkunft der fremden Paketidentität `0.1.1-rc.2` ist geklärt — die Behebung ist es nicht** | gemessen: die alte Installation liegt in `C:\Users\Chang\.dsh\profiles\node_modules` (204 Pakete, §6). Die Behebung verlangt einen Eingriff **außerhalb** dieses Repositories — darüber entscheidet der Betreiber | ohne Entscheidung bleibt Windows nativ blockiert; der Weg über WSL2 trägt weiterhin |
| **Drei Wege zur Behebung — keiner ausgeführt** | (a) `C:\Users\Chang\.dsh\profiles\node_modules` entfernen oder umbenennen; (b) `DSH_HOME` für den pmh-Host fest auf `C:\Users\Chang\.pmh` setzen, damit der Anker nicht mehr dorthin zeigt; (c) den Auflösungsanker des Hosts ändern (Codeänderung in `apps/cli`) | alle drei ändern Verhalten **außerhalb** oder **an** der Grenze zwischen Host und Core. (c) ist zusätzlich riskant: `@deepseek-ai/cordis-plugin-include` gehört dem Core und wird **nicht** gepatcht |
| **`~/.dsh` wird von einer anderen Installation benutzt** | dort liegt die Installation, mit der der Betreiber arbeitet (und über die diese Sitzung läuft). Ein Eingriff könnte **sie** treffen | ein Aufräumversuch könnte die laufende Umgebung beschädigen — deshalb **nicht** ausgeführt |

## 8. Was auf diesem Rechner nicht angefasst wurde

Kein pnpm, kein npx, **keine Installation** außer `bun install` (das ist die
Paketverwaltung dieses Projekts und legt nur Verknüpfungen im eigenen
Arbeitsbereich an). `docs\dsh` und `docs\design` wurden nicht geöffnet; `apps/web`
ist unberührt. Kein Nix, kein Docker, kein Tesseract. **Ein** Go-Dienst wurde
**getestet** (`go vet`/`go test`), aber **nicht gestartet**; der Rust-Crate
`native/flock` wurde getestet, nicht installiert.
