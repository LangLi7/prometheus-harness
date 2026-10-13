# Die eigene CI — elf rote Läufe, dann grün

> **Gemessen:** 13./14.10.2026 · Werkzeug `gh` (GitHub CLI, angemeldet als
> `LangLi7`) · Ablauf `.github/workflows/pmh-ci.yml` („PMH CI").
>
> **Der Anlaß war ein Vorwurf, der stimmte.** Der Betreiber zeigte die
> Ablauf-Liste: **elf Läufe, elf rote Kreuze.** Ich hatte den Workflow gebaut, den
> Commit gesehen, den Workflow in einem Dokument beschrieben — und **nie
> nachgesehen, ob er läuft.** „Ich habe eine CI" stand in den Berichten; „die CI
> hat gelaufen" stand nirgends.

## 1. Der Zustand, wie er gemessen wurde

| Lauf | Commit | Ergebnis | Dauer |
|---|---|---|---|
| 1–11 | `1791600` … `6195fb8` | **rot**, alle im **ersten** Schritt | 10–15 s |
| 12 | `ab5f586` | rot, erster Schritt | 11 s |
| 13 | `2077247` | **rot in der Suite** (6 Fehler) | 33 s |
| 14 | `10ccbc8` | **grün** | 34 s |
| 15 | `5a3b874` | **grün** | 30 s |

Alle Befehle dieses Dokuments liefen auf `ubuntu-latest` (GitHub) beziehungsweise
in einem **frischen Klon** des committeten Stands auf diesem Rechner. Der Klon ist
kein Beiwerk: er ist die Nachstellung des CI-Laufs, und er hat den Fehler
**byte-gleich** reproduziert (dieselben zwei Zeilen, `exit 1`).

## 2. Ursache eins: die Sperrdatei war stehengeblieben

Der Fehlertext des echten Laufs, wörtlich:

```
note: skipped 1 workspace listed in bun.lock but not on disk: "@prometheus-harness/llm-deepseek"
error: lockfile had changes, but lockfile is frozen
Error: Process completed with exit code 1.
```

Die Ursache war **mein** Commit `64f1882` („Namensgrenze: unsere Namen
umbenannt"): er **löschte** `packages/llm/llm-deepseek` — 4 Dateien, 908 Zeilen,
**ohne** Umbenennung — und zog `bun.lock` nicht nach. Der Eintrag blieb stehen.

**Es war aber nicht nur dieser eine Eintrag.** Ließe man `bun` selbst rechnen,
verlangt der committete Stand:

| Größe | Zahl |
|---|---|
| `workspace:`-Einträge in `bun.lock` **im HEAD** | **13** |
| Einträge, die `bun install` aus demselben Baum erzeugt | **23** |
| davon **nie eingetragen** (11 Pakete) | `auth`, `apikey`, `claim`, `permissions`, `reset`, `secrets`, `store-postgres`, `auth-http`, `health`, `readiness`, `llm-http` |
| Unterschied im Ergebnis | **64 Zeilen hinzu, 4 entfernt** |
| Zeilenenden der neuen Fassung | **1431 × LF, 0 × CRLF** (kein Umschlag) |

**Der Fix wurde nicht geraten, sondern von `bun` erzeugt** — in einem Klon des
committeten Stands, damit der Arbeitsbaum des anderen Agenten unberührt bleibt:

```
bun install --frozen-lockfile      # im Klon, VOR dem Fix:  exit 1 (wie GitHub)
bun install                        # im Klon: "Saved lockfile", exit 0
bun install --frozen-lockfile      # im Klon, NACH dem Fix: exit 0
bun install --frozen-lockfile --dry-run   # im echten Baum: exit 0
```

## 3. Ursache zwei: sechs leere Ordner, die git nicht übernehmen kann

Unabhängig davon wäre der Lauf auch danach rot geblieben.
`benchmarks/support/tests/lauf.test.mjs` zählt die Ordner unter `benchmarks/`
gegen die Zahl im Kopf von `benchmarks/lauf.mjs`:

```
* 10 Ordner liegen in `benchmarks/`, davon sind 9 Gates und 1 Werkzeugordner
  (`support`). Von den 9 Gates laufen 3, die übrigen 6 brauchen den laufenden …
```

Sechs dieser Ordner sind **vorgesehen, aber leer** — und **leere Verzeichnisse
kann git nicht übernehmen.** Auf diesem Rechner existieren sie, in einem Klon
nicht:

| | GATES-Ordner | auf der Platte (Klon) |
|---|---|---|
| 1 | session-open | ✓ |
| 2 | messtechnik | ✓ |
| 3 | db-last | ✓ |
| 4 | conversation-fold | **fehlt** |
| 5 | agent-continuation | **fehlt** |
| 6 | active-stream-reconnect | **fehlt** |
| 7 | long-session-browser | **fehlt** |
| 8 | session-corpus | **fehlt** |
| 9 | terminal-io | **fehlt** |

Sechs `.gitkeep` legen den **zugesagten** Aufbau an. Sie schwächen **keine**
Prüfung ab: `einstiegVon()` sucht `<ordner>/lauf.mjs`, und eine `.gitkeep` ist
keine. Beweis, daß git sie annimmt, ist ein **erfolgreiches `git add`** — nicht
`check-ignore` (das nennt die verneinende Regel und endet mit Exit 1; ich habe das
früher schon einmal falsch gelesen).

## 4. Ursache drei: mein eigener Prüfbefehl war falsch

Beim Nachstellen fiel auf, daß `scripts/verlauf-reset.test.mjs` prüfte:

```js
expect(lage.fern).toContain('github.com')
```

In einem Klon über `file://` ist das Fern `file:///C:/…` — die Prüfung war rot,
**obwohl das Skript recht hatte.** Auf GitHub Actions wäre sie grün gewesen, weil
`actions/checkout` ein `https://github.com/…` setzt.

> Eine Prüfung, die von der **Herkunft des Klons** abhängt, prüft den Klon und
> nicht das Skript.

Jetzt wird mit dem **tatsächlichen** Fern verglichen
(`gitLesen('remote', ['get-url', 'origin'], hier)`).

## 5. Was der erste Linux-Lauf dann fand: sechs Fehler, die es unter Windows nicht gibt

Nach dem Sperrdatei-Fix lief die Suite zum **ersten Mal** auf Linux:

```
1183 pass
 87 skip
  6 fail        Ran 1276 tests across 55 files
```

Alle sechs sind **meine Prüfungen**, kein Produktivcode — und alle sechs waren auf
Windows grün:

| # | Prüfung | Ursache |
|---|---|---|
| 1 | `krypto` · Die Reihenfolge der Quellen | `writeFileSync` **ohne `mode`** legt auf POSIX `0o644` an — weltlesbar. `pruefeDateirechte` weist das **zu Recht** ab. Auf NTFS meldet jede Datei `0o666`, dort greift die Prüfung gar nicht erst. |
| 2 | `krypto` · Die Dateirechte | Nach `writeFileSync(0o644)` folgte ein zweites `writeFileSync` mit `mode: 0o600` — und **`mode` wirkt nur beim Anlegen.** Die Datei blieb weltlesbar, die Prüfung warf weiter. Jetzt `chmodSync` + eine Behauptung über den Modus. |
| 3 | `krypto` · „der POSIX-Zweig ist NICHT ausführbar" | `expect(process.platform).toBe('win32')` behauptete etwas über die **Maschine** statt über den Code. Jetzt zweigt die Prüfung: NTFS → `0o666` nachgewiesen, POSIX → `0o600` kommt an und `0o644` wird abgelehnt. |
| 4–6 | `home-paths` · drei Prüfungen | Vorlage war `C:\Users\jemand\.dsh` für eine **plattformunabhängige** Regel. Die Sperre greift auf den Verzeichnisnamen `.dsh` — und auf POSIX ist der Backslash **kein Trenner**, `basename()` also die ganze Zeichenkette. Ebenso: `C:\x` ist auf POSIX **kein absoluter** Pfad. |

**Korrigiert wurde nur die Vorlage, nie die Behauptung** — die Regeln gelten auf
beiden Plattformen, und jetzt prüfen die Vorlagen sie auf beiden.

## 6. Der grüne Lauf

| Was | Ergebnis | Belegt durch |
|---|---|---|
| Abhängigkeiten aus der Sperrdatei | **exit 0** (535 installs, 630 Pakete, „no changes") | Lauf `38481436847` |
| Typprüfung | **25 Pakete grün, 0 rot** — 4,2 s | derselbe Lauf |
| Suite auf Linux | **1189 pass · 87 skip · 0 fail** — 9,41 s | derselbe Lauf |
| Ergebnis des Ablaufs | `conclusion: success`, 29–34 s | `gh run view --json conclusion` |

Zwei Läufe in Folge grün: **`38481436847`** (Commit `10ccbc8`) und
**`38481741410`** (Commit `5a3b874`).

## 7. Was diese CI NICHT prüft — und was daran offen bleibt

* **Keine Datenbank.** Ohne `PMH_TEST_DATABASE_URL` **überspringen sich** die
  Prüfungen des Speichers, der Migrationen und des Wissensspeichers selbst
  (**87 skips** im grünen Lauf). Ein grüner Lauf heißt: *alles geprüft, was ohne
  Datenbank prüfbar ist.* Das sagt der Ablauf am Ende selbst in den Lauf hinein.
* **Zwei grüne Läufe sind kein Muster.** Über die **Streuung** auf Linux ist damit
  nichts gesagt. Unter Windows zeigte derselbe Befehl `bun test` in **8 von 12**
  Läufen 2 rot (`docs/status/suite-flatterigkeit.md`). Ob die Flatterigkeit
  Windows-lokal ist, entscheidet sich erst mit mehreren Linux-Läufen.
* **Die zwei Windows-Roten bleiben.** Auf diesem Rechner sind
  `packages/util/atomic-write` (`os error 5` in `TEMP`) und `apps/cli`
  (typert-loader: *„2 required plugins did not activate"*) rot — **auf Linux
  nicht**: der grüne Lauf hatte **0 fail**, und der typert-loader-Fehler trat dort
  gar nicht auf. Beide sind damit als **Windows-Eigenheiten** eingegrenzt, nicht
  als Fehler des Codes. Behoben sind sie nicht.

## 8. Was ich daraus mitnehme

**Ein Werkzeug, das ich gebaut habe, ist erst dann ein Werkzeug, wenn ich ihm
beim Arbeiten zugesehen habe.** Elf rote Kreuze sind elf Gelegenheiten gewesen,
das zu bemerken — ich habe keine genutzt, weil ich auf den **Commit** gesehen habe
statt auf den **Lauf**. Und der Nutzen, den die CI dann hatte, war nicht der, den
ich erwartet hatte: sie hat nicht die Suite bestätigt, sondern **sechs Prüfungen
überführt, die auf einer Plattform grün waren und auf der anderen nicht** — und
damit sechs Stellen, an denen „geprüft" in meinen Berichten zu viel behauptet hat.
