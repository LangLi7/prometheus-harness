# Größe und Ressourcen — was 2,43 GB ausmacht, und was davon weg kann

> **Stand:** 14.10.2026 · **Anlaß:** Frage des Betreibers — *„check mal den Speicher
> und die Pakete, ob es effizienter und ressourceneffizienter geht; Prometheus ist
> 2–3 GB mit Build, wie viel ohne?"*
>
> **Alle Zahlen gemessen** in `C:\Users\Chang\prometheus-harness`
> (`Get-ChildItem -Recurse | Measure-Object Length -Sum`).

---

## 1. Die Antwort in einem Satz

**Frisch, ohne Bau: ~88 MB.** Mit Bau: **2,43 GB**. Davon sind **~96 % regenerierbar** —
und **1,33 GB lassen sich sofort sparen**, ohne etwas zu verlieren, das man braucht.

## 2. Die Verteilung

| Größe | Was | Nötig? |
|---|---|---|
| **63,4 MB** | **verfolgte Dateien (1907)** — *das ist ein frischer Klon* | **ja** |
| **25,0 MB** | `.git` (der Verlauf) | ja |
| 792,0 MB | `node_modules` — 192 Top-Level-Pakete; `@deepseek-ai` = **257 Pakete, 382 MB** | ja, aber **installierbar** |
| 697,7 MB | `target` (Rust) — davon **`debug` 619,3** · release 28,6 · `x86_64-unknown-linux-gnu` 49,8 | **nein**: Baurest |
| 613,4 MB | `.pmh-build` — davon `harness-home` **613,1** · `security-audit` 0,3 | **nein** |
| 190,1 MB | `website` — davon **`.bun-cache` 98,1** + `node_modules` 89,0 | Cache |
| 110,3 MB | `apps` — **`apps/web/node_modules` 110,0** | nur zum Bauen |
| 58,0 MB | `docs` (inkl. der kopierten Core-Dokumentation) | ja |
| **1,5 MB** | **`packages` — unser eigener Code** | ja |
| 0,5 MB | `services` · **0,3 MB `native`** · 0,4 MB `scripts` | ja |
| **2,7 MB** | **Summe unseres eigenen Codes** (`packages` + `services` + `native` + `scripts`) | ja |

**Das ist die Zahl, die überrascht:** unser **eigener** Code ist **2,7 MB** von 2 491 MB.
Alles andere ist Abhängigkeit, Baurest oder Cache.

## 3. Der Fund, der heraussticht: **eine zweite Kopie von `node_modules`**

```
.pmh-build/harness-home/profiles/web/node_modules    612,4 MB
```

**612 MB** — im **Laufzeit-Home** des Harness, nicht im Quellbaum. Eine **zweite
vollständige Installation derselben Abhängigkeiten** für das Web-Profil. Zusammen mit
`target/debug` (619,3 MB) sind das **1,23 GB in zwei Ordnern** — beide vollständig
wiederherstellbar.

## 4. Was sich sofort sparen läßt — **ohne Verlust**

| Was | Ersparnis | Wie |
|---|---|---|
| `target/debug` | **619,3 MB** | `Remove-Item target\debug -Recurse -Force` |
| `.pmh-build/harness-home/profiles/web/node_modules` | **612,4 MB** | wegwerfen; das Profil baut es neu |
| `website/.bun-cache` | **98,1 MB** | Cache |
| **Summe** | **~1 330 MB** | danach **~1,1 GB** statt 2,43 GB |

**Alles davon ist bereits in `.gitignore`** (`git status --porcelain --ignored` zeigt
`.gitignore`-Treffer für `node_modules/`, `target/`, `.pmh-build/`, `website/.bun-cache`).
Ein frischer Klon ist und bleibt **88 MB**.

## 5. Warum **nichts** gelöscht wurde

1. **`target/` gehört möglicherweise dem anderen Agenten.** Er arbeitet in
   `native/flock/`; läuft dort gerade ein Rust-Bau, reißt `cargo clean` ihm die Arbeit
   weg. Das ist genau die Rücksicht, die bei **E4** begründet wurde.
2. **`.pmh-build/harness-home` ist der Laufzeit-Ort** — ein `profiles/web/node_modules`
   könnte einen laufenden Host bedienen.
3. **Die Hausregel:** nichts löschen, was nicht nachweislich unser ist. Ein Löschen
   ohne das Wort des Betreibers wäre hier ein Eingriff in einen **fremden Lauf**.

**Freigabe erteilt? Dann ein Befehl** (gezielt — `target/release` und die
Linux-Variante bleiben):

```powershell
Remove-Item target\debug -Recurse -Force
Remove-Item .pmh-build\harness-home\profiles\web\node_modules -Recurse -Force
Remove-Item website\.bun-cache -Recurse -Force
```

## 6. Die Laufzeit — nachgemessen am 14.10.2026

**Nachtrag.** Hier stand: *„zur Laufzeit steht keine Zahl"*. Das ist **überholt** —
gemessen mit `docs/status/messsonden/startkosten.mjs` (**exit 0**, alle sechs Ziele
geladen). Das Kind mißt sich **selbst** (`process.hrtime.bigint()`,
`process.memoryUsage()`), nicht von außen abgetastet.

| Was geladen wird | Importzeit | RSS | Heap |
|---|---|---|---|
| **nichts** (nur der Laufzeitstart) | 0 ms | **25 MB** | 1 MB |
| `node:crypto` | 0,75 ms | 27 MB | 2 MB |
| `postgres` (SQL-Treiber) | 7,04 ms | 30 MB | 2 MB |
| **unser Speicherpaket** | **3,23 ms** | 29 MB | 2 MB |
| Kern: Modellschicht | 11,93 ms | 33 MB | 2 MB |
| **Kern: App-Boot** | **27–31 ms** (s. u.) | **37 MB** | 3 MB |

> **Der Start kostet 25 MB, bevor irgendetwas geladen ist. Der Kern legt 12 MB und
> rund 29 ms Importzeit drauf. Unser eigener Code: 3,2 ms.**

**Die Zeit ist eine Spanne, der Speicher ist ein Punkt.** Nachdem ich die Tabelle
geschrieben hatte, zeigte ein Kontrollauf für „App-Boot" **28,7 ms** statt der notierten
**26,82 ms**. Statt die Zahl zu glauben, habe ich **neun Läufe** derselben Sonde
gemessen (`startkosten.mjs`, je exit 0):

```
26,82 · 28,70 · 28,75 · 28,81 · 28,94 · 29,24 · 29,56 · 29,86 · 29,87 · 30,29 · 31,1   ms
```

Das sind **27–31 ms**, Mittel rund **29 ms** — die erste Zahl war der schnellste Lauf,
nicht der typische. Der **Speicher** dagegen war in **jedem** Lauf exakt **25 MB**
(nichts) und **37 MB** (App-Boot). Deshalb steht die Zeit ab hier als Spanne: eine
einzelne Importzeit ist keine Messung, sondern eine Stichprobe. Die Zahlen der übrigen
Zeilen sind ebenfalls Einzelläufe aus derselben Reihe und damit mit derselben Vorsicht
zu lesen; belastbar ist an ihnen die **Größenordnung** (0,75–12 ms) und der Speicher.

**Damit ist die Frage „ressourceneffizient?" beantwortet** — jedenfalls zur Hälfte:

* **Speicher ist kein Problem.** Die Größenordnung ist **25–37 MB**, nicht hunderte.
  Die 2,43 GB waren **Platte**, und davon sind **96 % regenerierbar** (§4).
* **Der Start wird von der Laufzeit bestimmt, nicht von unserem Code.** Unser Anteil
  ist in dieser Auflösung **nicht meßbar** — er ist eben 2,7 MB Quelltext.

**Und der Fehler, der zu diesen Zahlen gehört.** Der erste Versuch tastete den
Kindprozeß **von außen** ab (alle 15 ms `WorkingSet64`) und zeigte „unser
Speicherpaket" mit **14,8 MB** gegen „bun allein" mit **24,2 MB** — unplausibel. Der
Import gelingt (23 Exporte, stderr leer): es war **Rauschen der Methode**, und bei
70–120-ms-Prozessen ist eine 15-ms-Abtastung zu grob. Dazu schrieb die Sonde ihr
Kindskript nach `%TEMP%`, wo **vier von sechs** Zielen nicht auflösten — und meldete
**Exit 0**. Jetzt: Messung im Prozeß, Skript im Projekt, **Exit 2** bei einem nicht
geladenen Ziel.

### Was weiterhin **nicht** gemessen ist — die Zahl, die du bei „Startzeit" meinst

Der **volle Host** bis **`/api/ready` = 200**: Plugin-Aktivierung,
Datenbankverbindung, Redis-Prüfung, Sitzungsspeicher. Nichts davon ist oben dabei —
und genau das macht den Unterschied zwischen „37 MB Modullast" und „läuft".

**Dafür braucht es einen laufenden Host.** Der Vorschlag steht: `bun scripts/start.mjs
--port 3082 --no-go` als **verwalteter Hintergrundjob**, messen, **wieder beenden**
(mit Nachweis, daß er aus ist). **Ohne das Wort des Betreibers starte ich keinen
Server** — auch keinen eigenen.

Was es zur Laufzeit sonst gibt (`docs/review/last-und-suche.md`, gemessen):

| Befund | Zahl |
|---|---|
| Ein `UPDATE` je Nachricht auf die Chat-Zeile | **−88 %** Durchsatz (8 030 → 938 tps) |
| Der JSONL-Schreibpfad | **Faktor 64** langsamer, **ohne** Haltbarkeit |
| 40 Unteragenten an einem Elternteil | **16 463 tps** |

## 7. Nachfahren

```powershell
cd C:\Users\Chang\prometheus-harness

# Gesamt und die groessten Ordner
Get-ChildItem . -Force | ForEach-Object {
  $p = if ($_.PSIsContainer) { $_.FullName } else { $_.DirectoryName }
  [PSCustomObject]@{ N = $_.Name; MB = [math]::Round((Get-ChildItem $p -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum/1MB,1) }
} | Sort-Object MB -Descending | Select-Object -First 12

# Was ist verfolgt (frischer Klon) — und was ist ignoriert
(git ls-files | Measure-Object).Count
git status --porcelain --ignored | Where-Object { $_ -match '^!!' }
```

---

## 7. Vollzug: 612 MB gelöscht — und der Host startet trotzdem (14.10.2026)

Der Betreiber hat die Freigabe erteilt. **Gelöscht wurde nur ein Posten**, nicht
beide: `.pmh-build/harness-home/profiles/web/node_modules` — nicht `target/debug`
(619 MB), weil `target/` dem **anderen Agenten** gehören kann.

| | vorher | nachher |
|---|---|---|
| Ordner `.pmh-build/harness-home/profiles/web/node_modules` | **612 MB**, 5411 Dateien | **weg** |
| `.pmh-build` gesamt | **613 MB** | **15 MB** |
| Projekt gesamt (gleiche Methode wie §1) | **2 491 MB** | **1 892 MB** |
| Ersparnis | | **599 MB** |

`git check-ignore -v` belegt vor dem Löschen: `.gitignore:46:.pmh-build/` — der
Ordner war bereits ausgeschlossen, ein Klon bleibt unberührt.

### Und die Prüfung, die dazugehört: startet der Host noch?

**Erst messen, dann löschen — und danach noch einmal messen.** Sonst wäre „599 MB
gespart" auch dann eine Erfolgsmeldung, wenn ich dem Host seine Laufzeit genommen
hätte.

```
vor dem Löschen : /api/health = 200   (4 Läufe: 1107, 1110, 1129, 1232 ms)
nach dem Löschen: /api/health = 200   nach 1107 ms
```

Der Start gelingt **unverändert schnell**, und die Pakete kamen **nicht zurück**:
`profiles/web/node_modules` existiert danach **nicht**, `.pmh-build` bleibt bei
**15 MB**. Diese 612 MB waren damit nicht nur unbenutzt — sie waren **unnötig**.
Nach dem Lauf: **0** `bun`-Restprozesse, nichts lauscht auf 3099.

## 8. Die letzte offene Zahl ist jetzt gemessen: der volle Host

In §6 stand, der Start bis `/api/ready = 200` sei ungemessen. Gemessen ist er
jetzt — mit einer **Korrektur an der Frage selbst**:

| Was | Messung |
|---|---|
| `/api/health` = **200** (ohne Token) | **1107 · 1110 · 1129 · 1232 ms** (Mittel ~1157 ms) |
| `/api/ready` **ohne Token** | **401** — kein Meßfehler, sondern Absicht |

> **Die geplante Zahl „bis `/api/ready` = 200" war so nicht meßbar.** Der Pfad
> verlangt ein Token; ohne antwortet er **401**. Die token-freie Entsprechung ist
> `/api/health`. **Zum ersten Mal in dieser Messreihe war die Frage falsch, nicht
> die Antwort.**

**Und mein Meßfehler dabei.** Der erste Versuch fragte mit `Invoke-WebRequest` ab
und meldete **150 s lang „keine Antwort"**, während der Host längst lief und
lauschte. Ursache: PowerShell **wirft** bei jeder Nicht-2xx-Antwort, und mein
`catch` verschluckte genau die 401, die die Antwort gewesen wäre. Die ~300
`WARTEND`-Zeilen im `netstat` waren dann **meine eigene** Abfrageschleife
(TIME_WAIT), kein Host-Fehler. Jetzt wird mit `curl.exe -w "%{http_code}"`
gemessen: es wirft nicht, es **sagt die Zahl**.

**Einordnung.** 1,1 s für den vollen Host (Typprüfung der Kette, Loader,
Bereitschaftssonden für `postgres` und `redis`) gegen **26,8–29 ms** für den
bloßen Import des Kerns (§6) — dazwischen liegen ~1,1 s für alles, was der Host
beim Start **tut**. Das ist die Zahl, die vorher fehlte, und sie ist **nicht**
durch unseren Quelltext erklärbar: unser Code ist 2,7 MB (§1).
