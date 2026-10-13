# Befund: der Rust-Bestand im Harness

> **Gemessen:** 13.10.2026 · Windows nativ · Bun 1.4.0 · Anlass: Betreiberfrage
> *„idk how and why unsere Harness so viel rust code besitzt … würde das nicht dem
> Harness schaden? nach docs ect sollte es doch anders sein?"*
>
> **Diese Datei beantwortet die Frage mit Zahlen.** Sie ändert **nichts** — sie
> stellt fest und spricht eine Empfehlung aus.

## 1. Das Ergebnis in vier Zeilen

| Frage | Antwort |
|---|---|
| **Warum gibt es den Rust-Code?** | Er ist **dokumentiert geplant**: `MAPPING.md` bildet jede C- und C++-Abhängigkeit der Vorlage auf Rust ab. Kein Wildwuchs, sondern Auftrag. |
| **Schadet er dem Harness?** | Nicht durch Leistung — **er läuft nie**. Aber als **toter Ballast**: 6.569 Zeilen, die kein Skript baut, kein Test startet und kein Programm aufruft. |
| **Sollte es „anders" sein?** | **Ja, in drei Punkten** — und die eigene Doku sagt das selbst: `stack.md` §„C — bleibt im Werkzeugkasten" empfiehlt für *„sehr kleine, abhängigkeitsfreie Systemaufrufe (Dateisperren, Handle-Vererbung)"* ausdrücklich **C** und sagt *„Kein Zwang, alles nach Rust zu ziehen"*. Genau das ist aber passiert. |
| **Ist die Sprachstatistik echt?** | Sie zählt Zeilen, nicht Wirkung. Und sie geht **nicht auf**: TypeScript 49,6 + Go 29,6 + Rust 18,2 + PowerShell 1,1 + JavaScript 1 + CSS 0,5 = **100,0 %** — aber **Markdown und SQL fehlen vollständig**, obwohl dieses Repo **922 Markdown-Dateien mit 304.261 Zeilen** trägt. Die Anzeige ist damit ein Artefakt der Zählweise, keine Aussage über den Code. |

## 2. Was tatsächlich da ist (gemessen, `git ls-files`)

**16 Rust-Dateien, 6.569 Zeilen** in fünf Crates und einem Dienst:

| Ort | Rust-Code | Kommentar | andere Dateien | Zweck (aus dem eigenen Kopfkommentar) |
|---|---:|---:|---:|---|
| `native/flock` | 1.101 | 372 | 194 | Dateisperre — **ersetzt `flock.c` (164 Zeilen C)** |
| `native/index` | 865 | 137 | 163 | Quelltext-Indizierung, Symbolsuche |
| `native/crypto` | 685 | 106 | 152 | „Kryptografische Primitive als Prozess" |
| `native/atomicfs` | 623 | 136 | 182 | dauerhafte Schreibvorgänge — **ersetzt `koffi`** |
| `native/landlock-run` | 577 | 219 | 172 | Landlock-Launcher — **ersetzt `main.c` (298 Zeilen C)** |
| `native/pty` | 556 | 84 | 173 | PTY — **ersetzt `node-pty`** |
| `services/pmh-sandbox` | ~600 | — | — | Sandbox-Dienst |

**Sprachanteile unseres eigenen Codes** (nur versionierte Dateien, ohne Doku/Daten):

```
TypeScript   55 Dateien   20.316 Zeilen
Go           49 Dateien   13.810 Zeilen
Rust         16 Dateien    6.569 Zeilen
PowerShell    7 Dateien      558 Zeilen
JavaScript    9 Dateien   33.577 Zeilen   (Kopien/Generat)
```

## 3. Die Zuordnung ist dokumentiert — kein Wildwuchs

`MAPPING.md` legt jede Abhängigkeit der Vorlage auf eine Zielsprache um:

| Vorlage | Wofür | Ziel bei uns | Klasse |
|---|---|---|---|
| `native/system/.../main.c` (298 Z. C) | Landlock-Launcher | **Rust `landlock-run`** | B — „1:1 übernehmen, Sprache wechseln" |
| `flock.c` (164 Z. C, Node-API) | Dateisperre | **Rust `flock`** | B |
| `koffi` (natives Addon) | Windows `MoveFileExW` Write-Through, atomare Renames | **Rust `atomicfs`** | **D** — „Ersetzen/auflösen, weil unter Bun ungeprüft" |
| `node-pty` (natives Addon) | persistentes Terminal, ConPTY | **Rust `pty`** | **D** — dito |

**Die Vorlage hat null Rust-Dateien und kein `services/`.** Jede dieser Zeilen ist
also eine **bewusste Umstellung**, und für die zwei Addons ist der Grund im
Risikodokument benannt: `koffi` ist unter Bun ungeprüft, `node-pty` ebenfalls.
Ein natives Addon, das die Laufzeit nicht laden kann, ist ein echter Grund für ein
eigenes Programm.

## 4. Der Befund, der wirklich zählt: **nichts ruft den Rust-Code auf**

Gemessen über alle versionierten Dateien:

| Prüfung | Ergebnis |
|---|---|
| Wird eines der sechs Rust-Programme aus TypeScript/JavaScript/Go aufgerufen? | **Nein.** Kein einziger Aufruf. Die einzigen Treffer auf `pmh-atomicfs` sind ein **Namens-Warnhinweis** im Unit-Export und dessen Test; `pmh-sandbox` erscheint nur in einem **Kommentar**, der erklärt, dass es *nicht* gestartet wird („ist ein Rust-Dienst und steht deshalb nicht in dieser Liste"). |
| Baut oder startet ein Skript die Crates? | **Nein.** Kein `cargo`-Aufruf in irgendeinem `.ps1`, `.mjs`, `.sh`, `.ts` oder `.go`. |
| Ist ein Rust-Programm Teil des Startpfads (`scripts/start.mjs`)? | **Nein.** Gestartet werden nur `pmh-attach` und `pmh-nix` — beide Go. |
| Gibt es CI, die sie baut? | **Nein** — `.github/` ist ausdrücklich nicht versioniert. |
| Haben sie `unit.json`? | **Ja, alle sechs.** Sie sind als Units deklariert, aber als Units nicht erreichbar. |

**Das ist die eigentliche Antwort auf „schadet das dem Harness":** Der Rust-Code
kostet heute keine Leistung — er ist ein ruhendes Artefakt. Er kostet
**Glaubwürdigkeit und Pflege**: 6.569 Zeilen, die in keiner Prüfung stehen, die
niemand ausführt, und die trotzdem gelesen, gehütet und bei jeder Sprachgrenze
mitgedacht werden müssen. Und er kostet **Zeit**: er wurde geschrieben, bevor die
Frage beantwortet war, ob er gebraucht wird.

## 5. Was die Laufzeit schon kann (gemessen auf diesem Rechner)

Das ist der Befund, der die Größe des Rust-Anteils entscheidet. Gemessen mit Bun
1.4.0, Windows nativ:

| Fähigkeit | Laufzeit vorhanden? | Betrifft |
|---|---|---|
| SHA-256, `timingSafeEqual`, `randomBytes` | **ja** (`Bun.CryptoHasher`, `node:crypto`) | `crypto` (685 Z.) |
| AES-256-GCM (`createCipheriv`) | **ja** | `crypto` |
| Argon2id (`Bun.password`) | **ja**, nativ | `crypto` |
| `fsync` auf Datei und Verzeichnis | **ja** (`fs.open` + `handle.sync()`) | `atomicfs` |
| atomarer Ersatz (`rename`) | **ja**, gemessen: funktioniert | `atomicfs` |
| Dateisperre (`flock`/`LockFileEx`) | **nein** (`node:fs.flock` = `undefined`) | `flock` — **echter Bedarf** |
| PTY (ConPTY/openpty) | **nicht in `Bun.spawn`**, einfache Pipes funktionieren | `pty` — **Bedarf nur für echte Terminals** |

**Was daraus folgt:** Für `crypto` gibt es **keinen** technischen Grund — alles
davon ist in der Laufzeit vorhanden und erprobt. Für `atomicfs` ist der Bedarf
**offen**: die Doku verlangt selbst *„messen"*, und gemessen ist bisher nur, dass
`fsync` und `rename` funktionieren — nicht, dass sie für den JSONL-Schreibpfad
**genügen**. Für `flock`, `pty` und `landlock-run` ist der Bedarf echt.

## 6. Die entscheidende Messung: der Verzeichnis-fsync scheitert auf Windows

Die Doku verlangt für `atomicfs` die Messung selbst („Vorschlag — messen"). Hier
ist sie — und sie **widerlegt meine eigene erste Einschätzung**, `atomicfs` sei
vermutlich überflüssig.

```
Bun 1.4.0, Windows nativ:

1. Verzeichnis öffnen ('r') + sync():   FEHLER -> EPERM: operation not permitted, fsync
2. O_RDONLY + sync():                   FEHLER -> EPERM
3. DATEI öffnen + sync():               OK
```

**Was das bedeutet.** Der POSIX-Weg für einen **dauerhaften** atomaren Ersatz ist
dreistufig:

```
1. in eine temporäre Datei schreiben
2. die DATEI fsyncen            ← geht auf Windows (Zeile 3)
3. umbenennen (rename)
4. das VERZEICHNIS fsyncen      ← geht auf Windows NICHT (Zeilen 1 und 2)
```

Schritt 4 macht den `rename` dauerhaft: ohne ihn kann nach einem Stromausfall die
Datei umbenannt **und der Verzeichniseintrag verloren** sein. Auf Windows lässt
sich ein Verzeichnis nicht als Datei-Handle öffnen — deshalb gibt es dort
`MoveFileExW` mit `MOVEFILE_WRITE_THROUGH`, das die Dauerhaftigkeit in den
**Rename selbst** legt. Und genau das deckte `koffi` ab.

**Damit ist die Frage „brauchen wir `atomicfs`?" beantwortet: ja — auf Windows.**
Nicht weil Rust schöner ist, sondern weil ein Syscall fehlt, den die Laufzeit nicht
anbietet. Der Rust-Anteil ist an dieser Stelle **kein Ballast, sondern die einzige
Möglichkeit**.

**Und die drei Folgerungen, die sofort gelten:**

| # | Folgerung |
|---|---|
| 1 | **Weg B (streichen) ist gestrichen.** `atomicfs` bleibt. Meine Empfehlung von oben war falsch und ist hier korrigiert — die Messung hat sie widerlegt, nicht die Meinung. |
| 2 | **Weg A (`crypto` streichen) bleibt richtig.** Für Krypto fehlt **kein** Syscall: SHA-256, Zufall, zeitkonstanter Vergleich und AES-GCM sind gemessen vorhanden. |
| 3 | **Der JSONL-Schreibpfad muss den Windows-Fall ausdrücklich behandeln.** Der Code, der heute `fsync` auf das Verzeichnis ruft, bekommt auf Windows ein `EPERM` — und ein stillschweigend verschluckter Fehler wäre **Datenverlust ohne Meldung**. Das gehört als eigener Punkt in die Kette (P8). |

**Was diese Messung NICHT belegt:** ob `MOVEFILE_WRITE_THROUGH` unter Bun
**aufrufbar** wäre. Das braucht ein natives Programm — und genau deshalb existiert
`atomicfs`. Der Test, der seine Notwendigkeit *und* seine Wirkung zeigt, bräuchte
einen echten Stromausfall, nicht einen Prozessabbruch; das bleibt ein offener
Punkt (Weg B in der ursprünglichen Fassung — jetzt als „Wirkungsnachweis", nicht
als „Bedarfsmessung").

## 7. Drei Abweichungen von der eigenen Doku

| # | Die Doku sagt | Der Bestand tut | Bewertung |
|---|---|---|---|
| 1 | `stack.md`: *„Für sehr kleine, abhängigkeitsfreie Systemaufrufe (Dateisperren, Handle-Vererbung) ist C weiterhin die einfachste Wahl. **Kein Zwang, alles nach Rust zu ziehen.**"* | `flock` wurde in **Rust** gebaut — **1.101 Zeilen Code** für ein C-Programm mit **164 Zeilen** | Der Faktor **~10** (mit Drumherum 1.624 gegenüber 164) ist nicht durch Sicherheit zu erklären: `flock` ist ein Syscall-Aufruf ohne Speicherverwaltung. Hier wurde eine 164-Zeilen-C-Datei durch ein 1.624-Zeilen-Rust-Paket ersetzt — **ohne Messung**. |
| 2 | `stack.md`: Rust für *„Sandbox und schwere Werkzeuge (Parsing, Indizierung, **Kryptografie**)"* | Kryptografie wurde in Rust gebaut (`crypto`, 685 Z.) | **Verschwendung.** Kryptografie gehört nach `stack.md` zwar zu Rust, aber *„Kryptografie"* meint hier offenbar **etwas Rechenintensives**. Hashing, Zufall und zeitkonstanter Vergleich sind in der Laufzeit vorhanden — und **selbst gebaute Krypto ist in `docs/security`-Sicht das gefährlichste überhaupt**. Ein eigener Krypto-Prozess vergrößert die Angriffsfläche statt sie zu verkleinern. |
| 3 | `stack.md` §„Die Regel, die alles zusammenhält": *„Der JS-Core bleibt der Kernel. Jede andere Sprache ist ein **Dienst**, den er aufruft."* | Sechs kleine Programme statt eines Dienstes | **Verletzt.** Nicht die Sprache ist das Problem, sondern die **Zahl der Prozessgrenzen**: sechs Programme bedeuten sechs Startvorgänge, sechs IPC-Protokolle, sechs Build-Ziele, sechs READMEs, sechs `unit.json`. Ein einziger Dienst, der alle sechs Fähigkeiten anbietet, hätte dasselbe geleistet. |

**Und die Kosten je Prozessgrenze sind bezifferbar:** je Programm **152–194
Zeilen** reines Drumherum (`Cargo.toml`, README, `unit.json`, CLI-Zerlegung,
JSON-Ausgabe, Tests) — zusammen **1.036 Zeilen**, die nichts tun außer die Tür zu
öffnen. Bei einem einzigen Dienst fielen fünf davon weg.

## 8. Empfehlung — vier Wege, nach Aufwand geordnet

**Keine dieser Änderungen ist ausgeführt.** Sie stehen hier zur Entscheidung.

| # | Weg | Was er bringt | Aufwand | Risiko |
|---|---|---|---|---|
| **A** | **`crypto` streichen** (685 + 152 Zeilen) | Der einfachste und sicherste Gewinn: die Laufzeit kann alles davon, und selbst gebaute Krypto ist in der Sicherheitsbetrachtung ein Minus, kein Plus | klein — Unit entfernen, in `docs` als „entfällt, Grund: Laufzeit kann es" führen | **keines** für die Funktion: es ruft heute nichts auf |
| **B** | ~~Messen, ob `atomicfs` nötig ist~~ **GEMESSEN UND GESTRICHEN** — siehe §6: der Verzeichnis-fsync scheitert auf Windows mit `EPERM`. `atomicfs` bleibt. Offen ist nur der **Wirkungsnachweis** (braucht einen echten Stromausfall) | Die Messung ist erbracht; sie hat meine Empfehlung widerlegt | — | — |
| **C** | **`landlock-run` + `flock` + `pty` zu EINEM Dienst zusammenfassen** | Aus drei Prozessgrenzen wird eine — spart rund **600 Zeilen Drumherum** und einen Startvorgang | gross — Umbau von drei Crates | mittel; die Fähigkeiten sind echt, nur ihre Verpackung ist zu groß |
| **D** | **Den ganzen Rust-Bestand einfrieren und aus dem Repo nehmen**, bis die Kette ihn braucht | Repo-Größe und Sprachstatistik sagen wieder die Wahrheit; die Sprachwahl wird neu entschieden, wenn es etwas zu entscheiden gibt | klein (Verschieben), aber **Verlust** der Vorarbeit | die Arbeit ist da, nur unbenutzt — Wegwerfen wäre schade |

**Meine Empfehlung: A und B jetzt, C nur wenn `pty` wirklich gebraucht wird, D
nicht.** Begründung: `crypto` ist nachweislich überflüssig (Punkt 5), `atomicfs`
ist unbewiesen und die Messung ist billig (Punkt 5) — beide Wege kosten wenig und
machen die Sprachstatistik ehrlicher. `flock`, `pty` und `landlock-run` haben
einen **echten** Bedarf; sie zu löschen, bevor die Kette sie braucht, wäre die
falsche Sparsamkeit. Was dagegen **jetzt** passieren sollte: dass der Bestand
nicht als „fertig" gilt, solange ihn nichts aufruft.

## 9. Nebenbefund: die Sprachstatistik zählt erzeugten Code mit

Beim Nachrechnen der Anteile fiel ein zweiter Fehler auf — und er erklärt, warum
die Statistik auf den ersten Blick „nicht aufgeht":

**Die neun versionierten `.js`-Dateien sind alle VitePress-Cache:**

```
  275 Zeilen  website/.vitepress/cache/deps/@theme_index.js
 9719 Zeilen  website/.vitepress/cache/deps/chunk-BP5OA6CQ.js
13339 Zeilen  website/.vitepress/cache/deps/chunk-YY2KLAJF.js
 4483 Zeilen  website/.vitepress/cache/deps/vitepress___@vue_devtools-api.js
  …           (zusammen 33.577 Zeilen)
```

Das ist **erzeugter Code**: ein gebündeltes Vue samt Devtools-API, von VitePress
in einen Cache geschrieben. Er gehört nicht ins Repository — die eigene
`.gitignore` sagt das sogar: *„Der Website-Cache allein waren 4.617 Dateien /
~98 MB"* und *„`.bun-cache` sind Zwischenstände, kein Quellcode"*. Für
`.vitepress/cache` fehlt die Regel.

**Und die Anteile unseres eigenen Codes stimmen erstaunlich genau mit der
Anzeige überein** — gemessen nur über handgeschriebenen Code:

| Sprache | gemessen | GitHub zeigt |
|---|---:|---:|
| TypeScript | **49,7 %** | 49,6 % |
| Go | **33,2 %** | 29,6 % |
| Rust | **15,8 %** | 18,2 % |
| PowerShell | **1,3 %** | 1,1 % |
| JavaScript | **0 %** handgeschrieben | 1 % (VitePress-Cache) |
| CSS | 3 Dateien, 286 Zeilen | 0,5 % |

**Zwei Folgerungen:**

1. **Die Statistik ist ehrlich — sie zählt nur, was da ist.** Der Rust-Anteil ist
   also **echt**, und die Frage des Betreibers trifft die Sache.
2. **Markdown und SQL fehlen in der Anzeige vollständig**, obwohl dieses Repo
   **922 Markdown-Dateien mit 304.261 Zeilen** trägt. Die Anzeige ist deshalb
   **keine** Aussage über den Umfang des Projekts, sondern nur über die sechs
   Sprachen, die GitHub zählt.

**Offener Punkt (nicht Teil dieses Befunds):** `website/.vitepress/cache/` gehört
in `.gitignore` — 33.577 Zeilen erzeugter Code und ein Cache-Verzeichnis, das bei
jedem VitePress-Lauf neu entsteht. Das ist ein eigener kleiner Auftrag.

## 10. Was dieser Befund NICHT ist

- **Keine Sprachkritik an Rust.** Rust ist für Betriebssystem-Arbeit eine gute
  Wahl — die Frage hier ist **wie viel davon, und für was**, nicht ob.
- **Keine Kritik an der Vorarbeit.** Jede Zeile folgt einer dokumentierten
  Zuordnung. Der Fehler war, den Rust-Bestand zu **bauen, bevor gemessen wurde,
  ob er gebraucht wird** — und ihn dann als erledigt zu zählen.
- **Kein Nachweis, dass es schadet.** Belegt ist: er **läuft nicht**. Ob das
  „schadet", hängt daran, ob er die Sprachwahl für die nächste Stufe
  vorwegnimmt — und genau deshalb steht diese Entscheidung hier.

## 11. Die offene Frage an den Betreiber

1. **Weg A sofort?** (`crypto` streichen — die Laufzeit kann es, und eigener
   Krypto-Code ist ein Sicherheitsminus.)
2. **Weg B beauftragen?** (Messung, ob `atomicfs` für den JSONL-Pfad unter Windows
   nötig ist — die eigene Doku verlangt sie.)
3. **Wo endet Rust für dich?** Ab welcher Zeilenzahl oder welcher Aufgabe sagst
   du „das gehört nicht in eine eigene Sprache"? Ohne diese Grenze wächst jede
   Sprachfläche weiter.
