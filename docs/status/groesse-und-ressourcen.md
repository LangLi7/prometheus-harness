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

## 6. Was **nicht** gemessen ist — und das ist die wichtigere Hälfte

**Zur Laufzeit** (RAM, CPU, Startzeit) steht hier **keine** Zahl. Das ist eine
**eigene** Messung, und sie ist die, die bei „ressourceneffizient" wirklich zählt:
Platte ist billig, Speicher und Startzeit kosten bei **jedem** Lauf.

Was es dazu **gibt** (`docs/review/last-und-suche.md`, gemessen):

| Befund | Zahl |
|---|---|
| Ein `UPDATE` je Nachricht auf die Chat-Zeile | **−88 %** Durchsatz (8 030 → 938 tps) |
| Der JSONL-Schreibpfad | **Faktor 64** langsamer, **ohne** Haltbarkeit |
| 40 Unteragenten an einem Elternteil | **16 463 tps** |

**Der nächste Meßschritt** wäre: Host starten, **Zeit bis `/api/ready` = 200** und
**Arbeitsspeicher nach dem Start** messen — beides mit Befehl und Zahl. Das braucht
einen laufenden Host und ist damit ein eigener Lauf.

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
