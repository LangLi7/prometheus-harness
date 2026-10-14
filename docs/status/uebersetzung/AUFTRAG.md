# Auftrag: Übersetzung des Sprachpakets Deutsch

Diese Datei ist die **verbindliche Anweisung** für jede Übersetzerin und jeden Übersetzer eines
Teils. Die Regeln sind nicht Geschmack — eine Prüfung erzwingt sie, und sie kann rot werden.

## Eingabe und Ausgabe

* **Eingabe:** `docs/status/uebersetzung/quelle-<N>.json` (absolute Pfade siehe dein Auftrag)
  ```
  { "<namensraum>": { "paket": "…", "englisch": { "<schlüssel>": "<englischer Text>" } } }
  ```
* **Ausgabe:** `docs/status/uebersetzung/teil-<N>.json`
  ```
  { "<namensraum>": { "<schlüssel>": "<deutscher Text>" } }
  ```
* **Jeder** Schlüssel der Eingabe steht in der Ausgabe, in **derselben Schreibweise** und in
  derselben Reihenfolge. Kein Schlüssel wird weggelassen, hinzugefügt oder umbenannt.

## Harte Regeln (die Prüfung erzwingt sie)

1. **Platzhalter** in geschweiften Klammern (`{n}`, `{total}`, `{value}`, `{action}`, …) bleiben
   erhalten — **gleiche Anzahl**, gleiche Schreibweise.
2. **Leerzeichen am Rand** nicht ändern: führt der englische Text mit einem Leerzeichen, tut es
   der deutsche auch.
3. **Escape-Sequenzen** (`\n`, `\"`) bleiben, wie sie sind.
4. Gültiges JSON, UTF-8, **echte Umlaute** (`ä ö ü ß`) statt `\u`-Escapes.
5. Kein Platzhaltertext wie `TODO`, `XXX`, `tbd`.
6. **Ist der englische Wert leer (`""`) oder besteht er nur aus Leerzeichen, wird er
   UNVERÄNDERT übernommen.** Ein leerer Wert ist eine Anweisung („hier nichts anzeigen"), keine
   Lücke. Ihn zu füllen ändert das Verhalten der Oberfläche. Betroffen sind genau zwei Stellen:
   `chat · message.stepProcess.sharedPrefix` (`""`) und `pluginManager · sentenceSeparator`
   (`" "`). Alle anderen Werte sind **nicht** leer.

## Stil

* Sachliches Deutsch. **Keine Anrede** — außer das Englische spricht direkt an (`you`, `your`),
  dann informell **„du" / „dein"** (Entwicklerwerkzeug).
* **Aktionen im Imperativ:** `Save` → `Speichern`, `Retry` → `Erneut versuchen`, `Cancel` →
  `Abbrechen`.
* Kurze Labels bleiben kurz: `Inspect` → `Ansehen`, nicht „Untersuchen und anzeigen".
* **Auslassungspunkte** als **ein** Zeichen: `…` — nie `...`.
* Deutsche Anführungszeichen `„…"`, Gedankenstrich `–`, Komma vor Nebensätzen.
* Kein Punkt am Ende ergänzen, wo das Englische keinen hat. Frage- und Ausrufezeichen erhalten.
* Fehlermeldungen so knapp wie im Englischen, aber vollständig: `… failed` → `… fehlgeschlagen`.

## Was NICHT übersetzt wird (Bezeichner und etablierte Begriffe)

`JSON`, `URL`, `Token`, `Prompt`, `Agent`, `Subagent`, `Plugin`,
`Terminal`, `Skill`, `Job`, `Workflow`, `Commit`, `Branch`, `Diff`, `Log`, `Cache`, `Hook`,
`Turn`, `Ralph`, `Plan`, Dateiendungen, Protokollnamen — und **Werkzeugnamen**: `read`, `write`,
`bash`, `glob`, `grep`, `pwsh`, `web_fetch`, `web_search`, `workflow`, `subagent`, `ralph`,
`read_image`, `ask_user_question` …

## Zwei Wörter, die **doch** deutsch werden (Entscheidung, nachgemessen)

`Workspace` → **Arbeitsbereich**, `Session` → **Sitzung**. Beides steht **nicht** in der
Verbotsliste oben, obwohl eine frühere Fassung dieser Anweisung `Workspace` und `Session`
dort aufführte — und genau daraus entstand ein Schaden: **zwei Übersetzer haben die Frage
gegensätzlich entschieden**, Teil 1 ließ `Workspace` stehen, Teil 5 schrieb „Arbeitsbereich".
Eine Oberfläche mit zwei Wörtern für dieselbe Sache ist schlechter als jede der beiden
Entscheidungen.

Die Entscheidung fiel so:

* Das **ausgelieferte** Paket `packages/client/locale/de.json` sagt bereits
  `workspace.defaultName: "Standard-Arbeitsbereich"` — und Ausgeliefertes schlägt Absichten.
* Die eigenen deutschen Statusberichte dieses Projekts sagen **147 × „Sitzung"** gegen
  **37 × „Session"** (gemessen über `docs/status/**`).

**Zusammensetzungen:** mit Fugen-s, also `Sitzungs…` — „Sitzungsstatistik",
„Sitzungszeitstempel", „Sitzungshierarchie". Nicht „Sitzung-Statistik".

## Was übersetzt wird (Hausgebrauch dieses Projekts)

| Englisch | Deutsch |
| --- | --- |
| message | Nachricht |
| file / file(s) | Datei / Dateien |
| folder | Ordner |
| settings | Einstellungen |
| search | Suchen |
| tool (allgemein) | Werkzeug |
| failed | fehlgeschlagen |
| pending | ausstehend |
| running | läuft |
| stopped | angehalten |
| queued | in der Warteschlange |
| goal | Ziel |
| schedule | Zeitplan |
| queue | Warteschlange |
| hint / tooltip | Hinweis |
| session (Zählwort) | Sitzung |
| provider | Anbieter |
| permission | Berechtigung |
| approval | Freigabe |
| skill (allgemein) | Fähigkeit |
| context | Kontext |

Bei Werkzeugnamen gilt: **Name bleibt**, Beschreibung wird deutsch. `Run bash` → `bash starten`.
`Read file` → `Datei lesen`.

## Selbstprüfung — Pflicht, vor der Antwort

Im Arbeitsverzeichnis `C:\Users\Chang\prometheus-harness`:

```powershell
& "$env:USERPROFILE\.bun\bin\bun.exe" scripts/sprachpruefer.mjs --paket docs/status/uebersetzung/teil-<N>.json
```

* **`FEHLER: keine`** — so muß es aussehen. Steht dort ein Fehler, die Datei korrigieren und
  erneut prüfen.
* `VERDACHT: …` ist **kein** Fehler. Verdacht „unverändert englisch" ist richtig, wenn der Text
  im Deutschen gleich lautet (`JSON`, `OK`, `bash`).
* Exit-Code **2** heißt: Fehler — nachbessern, bis nur noch 0 oder 1 kommt.

## Verbote

* **Keine andere Datei ändern.** Insbesondere nicht `packages/client/locale/de.json`, nicht
  `docs/status/sprachquelle.json`, nicht `scripts/`, nicht `docs/status/uebersetzung/aufteilung.json`.
* Nicht die Testsuite laufen lassen, keine Server starten, keine Git-Befehle, die schreiben.
* Nichts löschen.

## Antwort (kurz halten)

1. Anzahl übersetzter Schlüssel je Namensraum.
2. Die Zeile mit `FEHLER:`/`VERDACHT:` aus der Selbstprüfung.
3. Drei Beispiele, bei denen du unsicher warst — mit Schlüssel und beiden Fassungen.
