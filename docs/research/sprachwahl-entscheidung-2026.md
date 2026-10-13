# Sprachwahl-Entscheidung für Prometheus Harness — belegter Bericht

**Stand:** 13. Oktober 2026 · **Methode:** Web-Primärquellen (Doku, Specs, GitHub-Issues mit Status/Datum, Registry) **plus eigene Messung auf diesem Host**
**Auftrag:** reine Recherche. Die Codebasis wurde **nicht** verändert.

---

## 0. Vorbemerkung: eine Prämisse des Auftrags ist inzwischen falsch

Der Auftrag sagt: „Der Nachweis, dass Bun die zwei nativen Addons tragen kann, ist laut eigener Risikoliste **ungeprüft**." Das war korrekt — `docs/risks.md` §1 nennt es „offen, höchste Priorität", mit der vorgeschriebenen Messung.

**Ich habe diese Messung durchgeführt** (Bun 1.4.0, Windows x64, gegen die in `node_modules` des Projekts installierten Addons). Ergebnis, wörtlich:

```
runtime: bun 1.4.0
platform: win32 x64
koffi.import: OK
koffi.MoveFileExW: OK (returned non-zero)
koffi.result: OK (moved, content={"probe":1})
node-pty.import: OK
node-pty.spawn: PARTIAL (no marker; captured 16 bytes)
bun.terminal: OK (child sees a real TTY)
bun.ffi.load: OK (kernel32!MoveFileExW bound)
```

Vier Befunde, die die gesamte Sprachfrage verschieben:

1. **`koffi` trägt unter Bun.** Import und `MoveFileExW(MOVEFILE_WRITE_THROUGH)` funktionieren; die Datei wurde tatsächlich verschoben. Das „Risiko mit der höchsten Priorität" ist damit **geschlossen** — und zwar durch Messung, nicht durch Ausweichen.
2. **`node-pty` lädt und startet unter Bun, liefert aber keine Daten** (16 Bytes, kein Marker). Das reproduziert exakt den offenen Bun-Bug [#25822](https://github.com/oven-sh/bun/issues/25822). Das Addon ist unter Bun **funktional kaputt**.
3. **Bun erzeugt selbst ein echtes PTY unter Windows** (ConPTY): das Kind sieht `isTTY=true`. Damit ist `node-pty` **überflüssig** — auch wenn es funktionierte.
4. **`bun:ffi` bindet `kernel32!MoveFileExW` direkt.** Damit ist auch `koffi` **überflüssig**.

**Konsequenz für die Sprachwahl:** Die beiden nativen Addons, die laut `docs/stack.md` den „offenen Punkt" bildeten, verschwinden **beide** — nicht durch Rust, sondern durch Bun-Bordmittel. Die 6.014 Zeilen Rust in `native/` wurden zu einem großen Teil gebaut, um eine Messung zu vermeiden, die jetzt positiv ausgefallen ist (dazu §9).

> **Hinweis zur Zeilenzahl:** eigene Zählung (`Measure-Object -Line` über `*.rs` je Crate, 13.10.2026): landlock-run 796 · flock 1.473 · atomicfs 759 · pty 640 · index 1.002 · crypto 791 · pmh-sandbox 553 = **6.014**. Der Auftrag nennt 6.569 für „6 Crates"; die Differenz ist nicht aufgeklärt — vermutlich Zählweise oder veränderter Stand. Ich verwende **meine** Zahl.

---

## Kurzfassung — 10 Entscheidungen

| # | Entscheidung | Empfehlung |
|---|---|---|
| 1 | **PTY** | `Bun.spawn({ terminal })` / `new Bun.Terminal()` — **kein** `node-pty`, **kein** Rust-PTY. Bun ≥ 1.3.14 (Windows-ConPTY), besser 1.4.x. |
| 2 | **`pmh-pty` (Rust, 640 Z.)** | **Löschen oder auf `Bun.Terminal` umbauen.** Es nutzt laut eigener `unit.json` gar kein PTY, sondern Pipes. |
| 3 | **Dauerhaftigkeit** | Bleibt in TypeScript: `fsync` Datei (+ POSIX-Verzeichnis). `MOVEFILE_WRITE_THROUGH` ist **kein bewiesener** Verzeichnis-fsync-Ersatz → als „nicht garantiert" dokumentieren. |
| 4 | **`pmh-atomicfs` (Rust, 759 Z.)** | **Zurückziehen** — löst ein Problem, das Bun selbst löst. Kein Code ruft es auf. |
| 5 | **`koffi`** | Durch **`bun:ffi`** ersetzen (Bordmittel, 0 Abhängigkeiten, 2–6× schneller als Node-API-FFI). |
| 6 | **Dateisperren** | Echte OS-Sperre: `flock(2)` / `LockFileEx` via `bun:ffi`, **Sidecar-Lockdatei**, nie löschen, `LOCK_NB` + Backoff. **Nicht** `proper-lockfile`. |
| 7 | **Sandbox Linux** | **Landlock-Launcher behalten** — als eigenes Winzig-Programm (C oder Rust, ~300 Z.). Grund: `execve`-Vererbung. |
| 8 | **Sandbox Windows** | Der koffi/FFI-Weg ist **belegbar gangbar** (die Vorlage fährt ihn produktiv). AppContainer hat dokumentierte Grenzen; Job Objects sind **keine** Sicherheitsgrenze. |
| 9 | **Go** | **Behalten für `pmh-supervisor`** (Prozess-Supervisierung = belegt guter Go-Fall). Gateway/Scheduler erst nach Lastmessung. |
| 10 | **Sprachgrenze** | **Zwei** Sprachen: TypeScript auf Bun + **eine** Systemsprache. Nicht drei. `pmh-crypto` und `pmh-index` sind die schwächsten Kandidaten (§9). |

---

## 1. PTY: Kann Bun einen echten PTY erzeugen?

### Empfehlung

**Ja — und das ist die Antwort auf die ganze Frage.** Verwende `Bun.spawn({ terminal })` bzw. `new Bun.Terminal()`. Kein `node-pty`, kein Rust-, kein Go-Programm. **Mindestens Bun 1.3.14** (Windows), produktiv 1.4.x.

### Begründung

Die offizielle Bun-Doku dokumentiert die Fähigkeit und — wichtiger — ihre Plattformunterschiede:

> „For interactive terminal applications, use the `terminal` option to spawn a subprocess with a pseudo-terminal (PTY) attached. The subprocess sees a real terminal, which enables colored output, cursor movement, and interactive prompts."
> — [bun.com/docs/runtime/child-process](https://bun.com/docs/runtime/child-process)

> „`Bun.Terminal` uses `openpty()` on Linux and macOS, and ConPTY (`CreatePseudoConsole`) on Windows."
> — ebd., Abschnitt „Platform differences"

Die Typreferenz derselben Seite:

> „`terminal?: TerminalOptions | Terminal; // Bun.spawn only (spawnSync throws); PTY (POSIX) / ConPTY (Windows) support`"

**Zeitachse** (alle Belege abgerufen):

| Datum | Ereignis | Quelle |
|---|---|---|
| 2025-12-17 | Bun v1.3.5: `Bun.Terminal`, **POSIX-only** — „Terminal support is only available on POSIX systems (Linux, macOS)." | [Blog](https://bun.com/blog/bun-v1.3.5) |
| 2026-04-21 | PR „windows: implement Bun.Terminal via ConPTY" gemerged | [PR #29522](https://github.com/oven-sh/bun/pull/29522) |
| 2026-08-19 | Bun 1.4.0 — „`Bun.Terminal` native PTY" | [Blog](https://bun.com/blog/bun-v1.4) |

**Eigene Messung (dieser Host, Bun 1.4.0, Windows):** `bun.terminal: OK (child sees a real TTY)`. Der externe Befund ist damit lokal bestätigt.

### Was `node:child_process` und `node-pty` unter Bun tun

- **`node:child_process`:** Bun führt es als **🟡 teilweise implementiert**; eine PTY-/`terminal`-Option ist dort **nicht dokumentiert** ([bun.com/docs/runtime/nodejs-apis](https://bun.com/docs/runtime/nodejs-apis)). Gepipte FDs ergeben kein TTY.
- **`node-pty`:** ursprünglich an NAN/V8-APIs gescheitert („Bun's runtime implements napi, but node-pty depends on many Nan/V8 C++ API & libuv symbols which Bun does not implement yet" — [microsoft/node-pty#632](https://github.com/microsoft/node-pty/issues/632)). Nach dem NAPI-Port **lädt** es zwar, ist aber **funktional tot**:

> „With Bun, the PTY spawns but **no data is ever received** via onData" … „calling `shell.resize()` after spawn fails with `EBADF`"
> — [oven-sh/bun#25822](https://github.com/oven-sh/bun/issues/25822), **offen** seit 2026-01-04

Ursache laut Bun selbst: Buns `tty.ReadStream` (auf `fs.ReadStream` gebaut) zerstört den Stream bei `EAGAIN`. **Meine Messung reproduziert das** (`captured 16 bytes`, kein Marker). Der Fix-PR [#41495](https://github.com/oven-sh/bun/pull/41495) ist **offen**. node-pty erklärt Bun offiziell für „out-of-scope" ([#632](https://github.com/microsoft/node-pty/issues/632)).

### Fallstricke (aus der offiziellen Doku, für den Betrieb wichtig)

- **Zeilenenden:** „Input `\r` is not translated to `\n` on Windows. POSIX `ICRNL` maps carriage return to newline on input; ConPTY passes `\r` through unchanged." → Auf Windows `\r` schreiben, nicht `\n`.
- **Fenstergröße:** `terminal.resize(cols, rows)`; POSIX `TIOCSWINSZ`, Windows `ResizePseudoConsole`. **Aber:** „`process.on('SIGWINCH')` in the child does not fire under ConPTY unless the child is reading stdin in raw mode."
- **Rohmodus:** „**No termios on Windows.** `inputFlags` … always read as `0` and setting them is a no-op. `setRawMode()` records the flag but has no effect on the child."
- **ConPTY re-enkodiert:** „The `data` callback therefore receives semantically equivalent, but not byte-identical, escape sequences." → **Wer ANSI-Sequenzen byte-genau parst oder vergleicht, bricht auf Windows.** Das ist der wichtigste Fallstrick für ein Terminal-Frontend.
- **`close()` blockiert vor Windows 11 24H2** (`ClosePseudoConsole` wartet auf conhost).
- **Maus-Tracking fehlt auf Windows 10 / Server 2019** ([#43450](https://github.com/oven-sh/bun/issues/43450), offen).
- **Kein Echo ohne Kindprozess** auf Windows (keine Line Discipline).
- **Deadlock-Warnung von Microsoft:** „Closing the session has several side effects which can result in a deadlock condition if the pseudoconsole is used in a single-threaded synchronous fashion." ([Microsoft Learn](https://learn.microsoft.com/en-us/windows/console/creating-a-pseudoconsole-session))
- **Querschnittsrisiko PTY + Sandbox:** „All processes launched from node-pty will launch at the same permission level of the parent process." ([node-pty README](https://github.com/microsoft/node-pty)) — gilt sinngemäß für jedes PTY.

### Gegenargument

ConPTY ist **kein Kernel-PTY, sondern ein Re-Encoder** über einen virtuellen Bildschirm. Wer byte-genaue Terminal-Semantik braucht (echtes Job-Control, exakte Escape-Sequenzen, Maus auf älteren Windows-Versionen), bekommt unter Windows **nie** POSIX-Gleichheit — auch nicht mit einem Rust-eigenen ConPTY-Wrapper, denn das Problem liegt in ConPTY selbst, nicht in der Sprache. Zweitens: Bun 1.4.0 ist jung (2026-08-19); `Bun.Terminal` ist keine zehn Monate alt. Wer maximale Reife braucht, bleibt bis zur Konsolidierung bei Node + `node-pty` — aber dann ist die ganze Bun-Entscheidung infrage gestellt.

---

## 2. Dauerhaftigkeit und atomare Datei-Operationen

### Empfehlung

**Keine neue Sprache.** `fsync` auf die Datei, auf POSIX zusätzlich `fsync` auf das Verzeichnis bei Verzeichnisänderungen (Neuanlage, `rename`, `unlink`) — **nicht** bei reinem Append an eine bestehende Datei. Auf Windows ist `MOVEFILE_WRITE_THROUGH` **kein bewiesener** Ersatz für einen Verzeichnis-Sync: im Code als „nicht garantiert" dokumentieren und die Segment-Rotation so bauen, dass ein verlorener Verzeichniseintrag genau **ein Segment** kostet.

### Begründung

**Bun:** `node:fs` ist „🟢 Fully implemented. 98% of Node.js's test suite passes." ([bun.com/docs/runtime/nodejs-apis](https://bun.com/docs/runtime/nodejs-apis)). `fsync`/`fdatasync`/`rename` laufen über libuv, sind also auf Windows `FlushFileBuffers` bzw. `MoveFileExW`. **Wichtig:** libuvs `fsync` und `fdatasync` sind auf Windows **identisch** — die API-Wahl ist dort kostenneutral.

**Der zentrale Befund zu `MOVEFILE_WRITE_THROUGH`** — Microsofts Garantietext ist enger als der Name:

> „**MOVEFILE_WRITE_THROUGH** 8 (0x8) | The function does not return until the file is actually moved on the disk. Setting this value guarantees that a move performed as a **copy and delete** operation is flushed to disk before the function returns. The flush occurs at the end of the copy operation."
> — [MoveFileExW, Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw)

Für einen **gleichvolumigen** Rename liefert die Doku nur „does not return until the file is actually moved on the disk". Eine Garantie, dass dort die **Verzeichnis-Metadaten** dauerhaft werden, ist **nicht belegt**. Ebenso garantiert Microsoft für `MOVEFILE_REPLACE_EXISTING` **keine Atomizität** — POSIX tut das für `rename` ausdrücklich („it will be atomically replaced").

**Der entscheidende Microsoft-Satz zum Metadaten-Problem:**

> „File system metadata is always cached. Therefore, to store any metadata changes to disk, the file must either be flushed or be opened with **FILE_FLAG_WRITE_THROUGH**."
> — [File Caching, Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/fileio/file-caching)

**SQLite stützt die POSIX-Sequenz und zeigt, dass `FULL` nicht reicht:** `FULL` (= `fsync` auf die Datei) ist im Rollback-Modus laut eigener Matrix **„Maybe not durable"**; erst `EXTRA` synct zusätzlich das Verzeichnis.

> „Without EXTRA … the last transaction might go missing, thus violating durability, if EXTRA is not set."
> — [sqlite.org/pragma.html#pragma_synchronous](https://sqlite.org/pragma.html#pragma_synchronous)

**Und SQLite misstraut dem Windows-Flush offen:**

> „We hear that FlushFileBuffers() can be completely disabled using registry settings on some Windows versions."
> — [sqlite.org/atomiccommit.html](https://sqlite.org/atomiccommit.html)

**Kosten (nur mit Quelle):** etcd nennt „typical fdatasync latency for a spinning disk is about 10ms. For SSDs, the latency is often lower than 1ms" und zeigt den Batching-Effekt **583 → 44.341 QPS** ([etcd Performance](https://etcd.io/docs/v3.6/op-guide/performance/)). LevelDB: „Asynchronous writes are often more than a thousand times as fast as synchronous writes." Der Hebel ist also **Gruppen-Commit**, nicht die Wahl des Flags.

**Etablierte Systeme lösen es genau so:** RocksDB `sync=true` → „the WAL file is fsync'ed before returning"; PostgreSQL kennt `wal_sync_method=fsync_writethrough`; Litestream: „This is safe as the WAL file is append only". Und: **fsync-Fehler sind fatal, kein Retry** (PostgreSQL fsyncgate 2018).

### Gegenargument

Für ein **Agenten-Sitzungslog** ist die Anforderung schwächer als für eine Datenbank: Verliert man beim Stromausfall die letzten Millisekunden eines Gesprächsprotokolls, ist das ärgerlich, nicht korrupt — **sofern** jede Zeile ein vollständiges JSON-Objekt ist und per Checksumme geprüft wird. Wer trotzdem `MOVEFILE_WRITE_THROUGH` als Gürtel-und-Hosenträger behält, schadet nicht; er darf nur nicht glauben, damit sei Dauerhaftigkeit **bewiesen**. Wer es **messend** klären will, muss einen echten Stromausfall-Test fahren — den gibt es in diesem Projekt nicht.

---

## 3. Dateisperren plattformübergreifend

### Empfehlung

**Echte OS-Sperre, nicht `mkdir`-Lockfile.** Konkret: `flock(2)` auf POSIX und `LockFileEx` auf Windows — über **`bun:ffi`** (Bordmittel) oder ein fertiges Paket (`@bearly/flock`). Immer mit:

1. **Sidecar-Lockdatei** (`<session>.jsonl.lock`), nie die JSONL selbst sperren;
2. Lockdatei **niemals löschen**;
3. **`LOCK_NB` + Backoff** statt blockierendem `flock`;
4. Retry auch auf Windows (Freigabe nach Prozessende ist nicht sofort garantiert).

**`proper-lockfile` ist für diesen Fall die falsche Klasse.** Ebenso `async-mutex` (nur In-Process).

### Begründung

**Es gibt keine eingebaute Sperre.** Node hat keine (`fs.html`: **0 Treffer** für `flock`, `LockFileEx`, `fcntl`, `advisory`); die relevanten Issues sind `not_planned` geschlossen ([#49256](https://github.com/nodejs/node/issues/49256), [#54446](https://github.com/nodejs/node/issues/54446)). Bun hat keine (`bun.d.ts`: **0 Treffer** für `flock`/`LockFileEx`/`FileLock`); der PR, der sie brächte, ist **geschlossen ohne Merge** ([#33992](https://github.com/oven-sh/bun/pull/33992), `merged=False`). **Deno hat es** (`Deno.FsFile.lock`) — es geht also, nur nicht in Bun/Node.

**Der entscheidende Vorteil der OS-Sperre ist die Crash-Freigabe.** `flock(2)`: die Sperre endet „when all such file descriptors have been closed" ([man7 flock(2)](https://man7.org/linux/man-pages/man2/flock.2.html)). Windows: „If a process terminates with a portion of a file locked … the locks are unlocked by the operating system. **However, the time it takes … depends upon available system resources.**" ([LockFileEx](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-lockfileex)).

**`proper-lockfile` gibt seine Grenze selbst zu:**

> „`proper-lockfile` automatically removes locks if the process exits, **except if the process is killed with SIGKILL** or it crashes due to a VM fatal error (e.g.: out of memory)."
> — [README](https://github.com/moxystudio/node-proper-lockfile)

**Und sein Default-Verhalten ist für einen Agenten-Harness aktiv gefährlich:** `onCompromised` „defaults to a function that simply throws the error which will probably cause the process to die" — und genau das ist in Produktion unter CPU-Last mit **mehreren gleichzeitigen Agenten** passiert und hat den Serverprozess beendet ([cline/kanban#128](https://github.com/cline/kanban/issues/128), 2026-03-29). Dazu ein offener Stale-Reclaim-Race ([#121](https://github.com/moxystudio/node-proper-lockfile/issues/121), 2025-09-20) und **seit 2021 kein Release**.

**Buns eigener Paketmanager macht es mit `flock`** — und dokumentiert die Kosten des Verzichts: „A killed `bun add` left package.json at 0 bytes in 31 of 240 runs" ([PR #39689](https://github.com/oven-sh/bun/pull/39689)).

**NFS/Netzwerkdateisysteme sind ein eigenes Minenfeld** (belegt, aber für dieses Projekt nur relevant, falls `$HOME` auf einem Netzlaufwerk liegt): `flock` kann dort still **node-lokal** sein. Ein gemessener Fall auf NFS `nolock,local_lock=all`: **2.653 von 2.829** Acquisitions ohne gegenseitigen Ausschluss ([claude-swap#372](https://github.com/realiti4/claude-swap/issues/372)). Auf GPFS: 160 Acquisitions während gehaltener Sperre, **0** Blockierungen ([versitygw#2351](https://github.com/versity/versitygw/issues/2351)). Die Schlussfolgerung dort: **„There is no primitive that is cluster-coherent everywhere."** Auf CIFS/SMB ab Linux 5.5 sind die Sperren dagegen **mandatorisch** — jedes IO über einen anderen fd schlägt mit `EACCES` fehl ([flock(2)](https://man7.org/linux/man-pages/man2/flock.2.html)).

**Der lokale Befund dazu:** `native/flock/unit.json` dokumentiert selbst: „Windows nutzt diese API NICHT: der Vertrag sagt, Windows behaelt seine Semaphore-Implementierung. Deshalb kein Windows-Binary." Der Crate ist also **nur Linux/macOS** — für ein Projekt, das auf Windows **entwickelt wird** (dieser Host ist win32), ist das ein blinder Fleck.

### Gegenargument

Die eigene `flock`-Bindung (1.473 Zeilen Rust in `native/flock`, ursprünglich 164 Zeilen C) ist gegenüber einem fertigen Paket **selbst gepflegter Code an einer sicherheitskritischen Stelle**. Und: `flock` ist **advisory** — „given suitable permissions on a file, a process is free to ignore the use of `flock()`". Wer die Sperre nicht selbst respektiert (ein Fremdwerkzeug, ein Editor, ein zweiter Codepfad im eigenen Haus), wird nicht aufgehalten. Die robusteste Klasse bleibt deshalb eine **Single-Writer-Architektur**: ein Prozess besitzt die Datei, alle anderen reden über IPC. Das ist der größte Umbau, aber der einzige, bei dem die Verletzung **strukturell unmöglich** ist.

---

## 4. Sandbox: Landlock und Windows-ACL/AppContainer

### Empfehlung

- **Linux: Landlock-Launcher behalten** — als eigenes Winzig-Programm (~300 Zeilen C **oder** Rust mit dem `landlock`-Crate). **Grund ist `execve`-Vererbung, nicht die Sprache.** Immer `LANDLOCK_RESTRICT_SELF_TSYNC` setzen (ABI v8+), sonst gilt die Policy nur für einen Thread.
- **Windows: der FFI-Weg ist gangbar** (die Vorlage fährt ihn produktiv mit koffi). AppContainer einplanen, aber seine Grenzen kennen.
- **Kein fertiges Cross-Platform-„Agenten-Sandbox"-Crate** — es existiert 2026 nicht (§4.4).

### Begründung

**Landlock ist reif und selbst-anwendbar:**

> „The goal of Landlock is to enable restriction of ambient rights (e.g. global filesystem or network access) for a set of processes. […] Landlock empowers any process, including unprivileged ones, to securely restrict themselves."
> — [docs.kernel.org/userspace-api/landlock.html](https://docs.kernel.org/userspace-api/landlock.html) (Kernel 7.3.0-rc7, August 2026)

**ABI-Stand 2026: ABI v11 ist dokumentiert.** Belegte Fähigkeitsgrenzen: **TCP ab ABI v4, UDP erst ab ABI v10**, `LANDLOCK_RESTRICT_SELF_TSYNC` ab v8. Noch offen: „files that do not come from a user-visible filesystem (e.g. pipe, socket), but can still be accessed through `/proc/<pid>/fd/*`, cannot currently be explicitly restricted", max. 16 Regelschichten, `chroot(2)` wird nicht verweigert, IOCTL ist grob. **Nicht belegt:** die oft zitierte Zuordnung „ABI 4 = Linux 6.7" — die aktuelle Kernel-Doku enthält keine ABI↔Kernelversion-Tabelle.

**Rust-Crate `landlock`: De-facto-Standard, aktiv gepflegt** — Version **0.4.7 (2026-07-27)**, 18,2 Mio. Downloads, Herausgeber ist **Mickaël Salaün**, also der Landlock-Autor selbst. Die Alternativen sind tot oder sterbend:

| Crate | Letztes Release | Urteil |
|---|---|---|
| `landlock` 0.4.7 | **2026-07-27** | aktiv, offiziell — **empfohlen** |
| `birdcage` 0.8.1 | 2024-04-19 | stagniert (~2,4 J.), GPL-3.0 |
| `extrasafe` 0.5.1 | 2024-04-16 | stagniert, seccomp-fokussiert |
| `gaol` 0.2.1 | **2019-10-16** | tot |

**Was reale Agenten nutzen — und es ist nicht Landlock:**

| Projekt | Linux | Windows |
|---|---|---|
| Claude Code | **bubblewrap** + socat | **ungesandboxt**: „On native Windows, Claude Code runs commands unsandboxed." |
| Anthropic `sandbox-runtime` | bubblewrap | dedizierter Lokalbenutzer + ACEs + WFP |
| Gemini CLI | Seatbelt / Docker / gVisor / LXC | `icacls`-**Integritätslevel** (persistent!) |
| **OpenAI Codex** | **Landlock** (`codex-linux-sandbox` als eigenes Binärziel) | **AppContainer** via Microsoft MXC (`appcontainer_common`) |

**Codex ist der einzige echte Landlock-Nutzer** — und zwar über den `landlock`-Crate, **als eigenes Binärziel**. Das ist der Präzedenzfall für Euer `pmh-landlock-run`.

**Der entscheidende technische Grund für ein eigenes Programm** steht in der Kernel-Doku: „this policy will be enforced on all its subsequently created children as well". Ein Launcher, der sich selbst einschränkt und dann `exec`t, gibt die Grenze an einen **fremden** Prozessbaum weiter, **ohne die eigene Runtime einzuschränken**. In-Process-Selbstbeschränkung würde genau das tun — und wäre ohne `TSYNC` in einer Multi-Thread-Runtime (Bun/Node haben Worker und GC-Threads) ohnehin löchrig.

**Windows:** AppContainer blockiert ACL-Objekte per Default — „changing `SeAccessCheck()` so that all legacy, unmodified access control list (ACL) objects block access requests from AppContainer processes by default, and re-ACL objects that should be available to AppContainers" ([Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer)). Für unverpackte Apps ist der Aufbau Handarbeit: „you have to do the same things by calling those Win32 APIs yourself; but it can be complicated." **Job Objects sind keine Sicherheitsgrenze**, sondern Lebenszyklus-/Ressourcensteuerung ([Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)) — nützlich als `KILL_ON_JOB_CLOSE`, nicht als Sandbox.

### Was die Vorlage macht (geprüft im DSH-Checkout)

- `packages/sandbox/sandbox-local/src/index.ts` wählt eine **Runner-Kette**: Linux `bwrap` → Landlock; macOS Seatbelt; Windows ACL-Runner. Sie **probt funktional** und **fails closed**: „Missing or unusable confinement fails closed rather than returning the original argv."
- `native/landlock-run/packages/entry/src/main.c` — **298 Zeilen C11** über die rohe Landlock-UAPI, statisch gegen musl gelinkt, Exit 125 auf Fehler.
- `packages/sandbox/sandbox-windows-acl/` — **reines TypeScript + koffi-FFI**, mit `LockFileEx` für die DACL-Serialisierung (`withPathLock`, `acl.ts`). **Kein C/Rust/Go im Paket.**

**Das ist der stärkste Beleg für die Kernaussage dieses Abschnitts:** Derselbe Harness fährt **beides parallel** — FFI auf Windows, externes Winzigprogramm auf Linux. Die Wahl folgt dem Betriebssystem, nicht einer Sprachideologie.

### Gegenargument

„Landlock ist self-sandboxing, also braucht es keinen externen Launcher" ist **technisch korrekt** (Kernel-Doku) — und trotzdem hat sich in der Praxis überall der Launcher durchgesetzt (Codex, Claude Code, `srt`). Wer den Launcher vermeidet, spart Build-Matrix, Cross-Compilation und Paketierung pro Plattform; das ist echter Aufwand, wie DSHs eigene Regel zeigt: „a platform package is added only together with a native runner that builds and proves it."

---

## 5. Sprachwahl allgemein: was ist 2026 für welche Aufgabe belegbar?

### Empfehlung

| Aufgabe | Sprache | Warum |
|---|---|---|
| (a) **Plugin-Core** | **TypeScript auf Bun** | **Zwang, nicht Wahl** — Cordis ist JavaScript. |
| (b) **Nebenläufigkeit/Netz** | **Go** für Supervisor; Gateway erst nach Messung | Go ist für Prozess-Supervisierung belegt gut; das Gateway bringt Semantik-Duplikation. |
| (c) **OS-nahe Kleinprogramme** | **C oder Rust** für Launcher; **`bun:ffi`** statt Addon | Nur wo `execve`-Vererbung oder ABI-Stabilität es erzwingt. |
| (d) **Rechenintensive Werkzeuge** | **Meist keine neue Sprache** — Bun/Bordmittel zuerst | Node/Bun bringt natives C für Krypto, Hashing, SQLite, zlib, Regex mit. |

### Begründung

**(a) TypeScript ist nicht verhandelbar** — `docs/stack.md` sagt es selbst: „Das Plugin-System (Cordis) ist JavaScript. Plugins sind JS-Module über `ctx.*`. Ein Core in einer anderen Sprache könnte sie nicht laden." Das ist die einzige wirklich harte Randbedingung im ganzen Dokument.

**(b) Go:** Der belegte Go-Fall ist **Prozess-Supervisierung** — Kindprozesse starten, überwachen, neu starten, sauber beenden. Genau das tut `pmh-supervisor`. **Gegenargument, aus dem Projekt selbst:** „Das Gateway des Referenz-Harness ist rund 1.600 Zeilen und sein Wert liegt darin, in das Session- und Event-Modell eingepasst zu sein … In Go heißt das: dieselbe Semantik nochmal bauen und gegen jede Core-Änderung nachziehen." Diese Einschätzung ist richtig und deckt sich mit dem allgemeinen Muster: eine Sprachgrenze durch ein **semantisch gekoppeltes** Modul ist teuer, eine durch ein **abgegrenztes** (Prozessbaum, Sperre, PTY) ist billig.

**(c) OS-nah:** Für `execve`-Vererbung und strukturelle Minimalität ist ein eigenes Programm richtig — **unabhängig von der Sprache**. Die Wahl C vs. Rust ist hier zweitrangig (siehe §9 und „Was ich nicht empfehle").

**(d) Rechenintensiv — hier ist die häufigste Fehleinschätzung:** Node und Bun bringen für das meiste dieser Klasse **längst natives C mit**. `node:crypto` ist BoringSSL (Doku: „Bun's crypto is backed by BoringSSL"), Hashing/SHA/HMAC sind C, SQLite ist C (`node:sqlite` 🟢 fully implemented), zlib ist C. **Eigenen SHA-256 in Rust nachzubauen, um TypeScript zu ersetzen, ersetzt C durch C** — und fügt eine Prozessgrenze hinzu. Das ist der klarste Fall von Etikettenschwindel in diesem Projekt (§9).

### Der belegte Sprachvergleich — mit Zahlen

| Frage | Belegte Aussage | Quelle |
|---|---|---|
| **TypeScript/Node — wann gut?** | „Node.js is fast when the work associated with each client at any given time is **\"small\"**"; „for **expensive computation it might not be the best option**"; Prozess-pro-Client „might become a **fork bomb**" | [Node.js: Don't Block the Event Loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop) |
| **Wie teuer ist Blockade konkret?** | 50 MB `JSON.stringify` = **0,7 s**, `JSON.parse` = **1,3 s** → **~2 s blockierter Event Loop** — Node.js' eigene Messung | ebd. |
| **Go — Compile-Zeit** | `make`: Go **5,11–6,20 s** vs. Rust **10,10–14,41 s** → **Go ~2× schneller** | [Benchmarks Game, rust vs. go](https://benchmarksgame-team.pages.debian.net/benchmarksgame/fastest/rust-go.html) |
| **Rust — Rechenlast** | binary-trees **1,07 s vs. 27,93 s**; spectral-norm **0,72 vs. 5,34** — **aber**: alle Rust-Sieger sind mit `*` markiert („possible hand-written vector instructions or \"unsafe\" or naked ffi"). Die Seite warnt selbst: „does the host language matter?" | ebd. |
| **Rust — Selbstdarstellung** | „with **no runtime or garbage collector**"; „zero-cost abstractions"; Sicherheit „**including concurrency bugs**" — **Ausnahme `unsafe`** | [rust-lang.org](https://www.rust-lang.org/), [Rust Book](https://doc.rust-lang.org/book/ch00-00-introduction.html) |
| **Go — einzige Firmenzahl** | PayPals „we have seen a **CPU reduction of approximately 10%**" — Eigenangabe ohne Methodik | [go.dev](https://go.dev/) |

### Die Discord-Zahl — und was sie wirklich sagt

Der meistzitierte Beleg für „Rust statt Go" ist Discord, 2020. **Ich habe den Artikel gelesen; er enthält keine harten Zahlen im Text.** Wörtlich:

> „Remarkably, we had only put very basic thought into optimization as the Rust version was written. **Even with just basic optimization, Rust was able to outperform the hyper hand-tuned Go version.**"
> „After a bit of profiling and performance optimizations, **we were able to beat Go on every single performance metric**. Latency, CPU, and memory were all better in the Rust version."
> „**Notice the average time is now measured in microseconds and max @mention is measured in milliseconds.**"
> — [discord.com/blog/why-discord-is-switching-from-go-to-rust](https://discord.com/blog/why-discord-is-switching-from-go-to-rust), 2020-02-04

Die Belege sind **Diagramme**, nicht Zahlen im Text. **Wer „Discord hat p99 von X auf Y gesenkt" zitiert, zitiert nicht diesen Artikel.** Die belegbaren Größen sind dagegen: „hundreds of thousands of cache updates per second", „tens of thousands of database writes per second", Spitzen „roughly every 2 minutes", und nach dem Umbau ein Cache von **8 Mio. Read States**.

Und Discord selbst schreibt in Fußnote 2:

> „To be clear, we don't think you should rewrite everything in rust just because."

**Der eigentliche Punkt des Artikels ist ein GC-Problem**, nicht ein Sprachenproblem: die Spitzen kamen von einem erzwungenen GC alle ≥ 2 Minuten („Go will force a garbage collection run every 2 minutes at minimum"), der den ganzen LRU-Cache scannen musste. Discord hat das Tuning **versucht und es half nicht**: „Unfortunately, no matter how we configured the GC percent nothing changed."

Die saubere Lehre: **Rust war die Lösung für einen Zustand, in dem die Sprache eine harte Grenze setzte** (kein GC, sofortige Freigabe) — nicht „Rust ist schneller". Der Nebensatz im Artikel ist die eigentliche Definition des Kriteriums: kleinere LRU → kleinere Spitzen, **aber** „the trade off … resulted in higher 99th latency times".

### Der stärkste Gegenbeleg aus der Praxis: Cloudflare

Cloudflare hat den vollständigsten Zahlenkatalog zur Sprachwahl veröffentlicht — und **entkräftet damit die Sprachthese selbst**:

> „serves over **1 trillion requests a day**" · „about **70% less CPU and 67% less memory**" · „**5ms reduction on median TTFB and 80ms reduction on the 95th percentile**" · Reuse „from **87.1% to 99.92%**, which reduced new connections to their origins by **160x**" · „**434 years of handshake time every day**"

> „**This is not because we run code faster. Even our old service could handle requests in the sub-millisecond range.**"
> „The savings come from our new architecture which can share connections across all threads."
> — [blog.cloudflare.com/how-we-built-pingora](https://blog.cloudflare.com/how-we-built-pingora-the-proxy-that-connects-cloudflare-to-the-internet/), 2022-09-14

Und zur Auswahlsicherheit, ehrlich: „We evaluated each of these options **every quarter for the past few years. There is no obvious formula to tell which choice is the best.**"

### „Rust für Sicherheit" — der bestbelegte Fall: Android

Das ist der einzige Fall, in dem die Sicherheitsbehauptung **mit Zahlen** belegt ist:

> „how the percentage of memory safety vulnerabilities in Android **dropped from 76% to 24% over 6 years**"
> „Memory safety issues, which accounted for **76% of Android vulnerabilities in 2019, and are currently 24% in 2024, well below the 70% industry norm**"
> — [Google Security Blog, 2024-09-25](https://security.googleblog.com/2024/09/eliminating-memory-safety-vulnerabilities-Android.html)

Dazu aus dem Vorgängerpost: absolute Zahl „**dropped from 223 down to 85**" (2019–2022), „**about 21% of all new native code (C/C++/Rust) is in Rust**", „approximately **1.5 million total lines of Rust code in AOSP**", „**To date, there have been zero memory safety vulnerabilities discovered in Android's Rust code.**", Rollback-Rate: „the **rollback rate of Rust changes is less than half that of C++**".

**Und Google selbst nennt die Grenze der Aussage:**

> „**While correlation doesn't necessarily mean causation**, it's interesting to note that the percent of vulnerabilities caused by memory safety issues seems to correlate rather closely with the development language"
> „**making the returns on investments like rewrites diminish over time** as code gets older" · „**Interoperability is the new rewrite** … we do not need to throw away or rewrite all our existing memory-unsafe code."
> — [Google Security Blog, 2022-12-01](https://security.googleblog.com/2022/12/memory-safe-languages-in-android-13.html)

### Ein starker, aktueller Datenpunkt aus dem Bun-Ökosystem selbst

> „And it rewrites Bun from Zig to Rust."
> — [Bun 1.4 Blog](https://bun.com/blog/bun-v1.4), 2026-08-19

Bun hat seine **eigene** Laufzeit von Zig nach Rust portiert. Das ist ein ernstzunehmender Beleg für Rust in systemnaher Arbeit — **aber** es ist kein Beleg für Rust in *diesem* Projekt: Bun ist eine Laufzeit mit eigener Speicherverwaltung, dieses Projekt ist ein Agenten-Harness.

### Gegenargument

Für (b) und (c) gibt es ein starkes Gegenargument, das **im Projekt selbst** steht: „Go, Rust und Bun parallel einzuführen macht jeden Fehler mehrdeutig: Bei einem Ausfall kann man nicht sagen, welche Sprache schuld ist. Und es verdreifacht die Werkzeugketten (Build, Test, Abhängigkeiten, CI)." (`docs/risks.md` §3). Dieser Satz ist richtiger als jede Sprachpräferenz — und wird durch §10 dieses Berichts gestützt.

---

## 6. Kosten einer Sprachgrenze

### Empfehlung

**Zwei Sprachen. Höchstens.** TypeScript auf Bun für alles, was im Prozess läuft; **eine** Systemsprache für die wenigen Dinge, die eine Prozessgrenze aus strukturellen Gründen brauchen. Jede weitere Sprache muss ihre Kosten **mit einer Messung** rechtfertigen — nicht mit einem Etikett.

### Begründung

Der Auftrag fragt nach „Untersuchungen mit Zahlen". **Ehrliche Antwort: es existiert keine belastbare Studie, die beziffert, was eine zusätzliche Programmiersprache in einem Unternehmen kostet (Buildzeit, CI-Minuten, Einarbeitungszeit, Tooling-Personal).** Die meistzitierte Quelle zum Thema — „Polyglot is Killing Your Enterprise" — enthält **keine einzige Zahl** und stammt vom CEO eines kommerziellen Sprach-Distributors. Das ist **nicht belegt**, und es ist wichtig, das offen zu sagen: die Entscheidung lässt sich nicht mit einer Studie begründen, nur mit **belegten Einzelfällen und eigener Rechnung**.

Was sich belegen lässt:

**1. Die Kosten sind real und wurden von Chromium explizit als offene Frage formuliert, bevor Rust zugelassen wurde.** Chromium hat den Interop-Aufwand gezählt — die einzige Quantifizierung der Grenzkosten, die ich gefunden habe:

> „Our \"base\" library exposes **1768 APIs**… **1052 of those functions** … That's **~60%** … Another **12%** … Another **~20%** … this leaves **just 8% of our functions which can't be supported**."
> „if that's all we can use Rust for, **that calls into question whether the costs of an extra language are justified in the first place**."
> — [Chromium: Rust and C++ interoperability](https://www.chromium.org/Home/chromium-security/memory-safety/rust-and-c-interoperability/)

Chromium nennt außerdem die zweite Kostenseite, die für einen Agenten-Harness direkt einschlägig ist:

> „the process is the smallest unit of isolation, but **processes are not cheap**" · „our insistence on the Rule Of 2 is **preventing Chrome developers from shipping features**, as it's already sometimes just too expensive to start a new process"
> — [Chromium: Memory safety](https://www.chromium.org/Home/chromium-security/memory-safety/)

**2. Prozessgrenzen sind billig für seltene, teuer für häufige Aufrufe — das ist die zentrale belegte Zahl.** GitLab hat den Fall dokumentiert, in dem **20 fork/exec pro Sekunde** ausreichten, um einen Dienst um **30×** zu verlangsamen:

> „the **99th percentile performance of the endpoint had dropped from 400ms down to 100ms**"
> „**In one dump, 1,400 goroutines were blocked waiting on `ForkLock`** – most for several minutes."
> „`fork/exec`'ing Git processes about **20 times per second**" bei „peaks at about **1,000 gRPC requests per second**"
> — [GitLab, 2018-01-23](https://about.gitlab.com/blog/2018/01/23/how-a-fix-in-go-19-sped-up-our-gitaly-service-by-30x/)

**3. Prozessstart: < 1 ms bis ~100 ms — abhängig vom Speicher des Elternprozesses.** Gemessen im rust-lang-Issue #87764 (~4 GiB allokieren, dann 100× `sleep 0`):

> „On my laptop with **GLIBC 2.33**, it takes **under `100 ms`** to run the benchmark, while on the **HPC cluster** this can sometimes take **up to `10 seconds`**!"
> „**it still has to do nontrivial things, like setting up page tables. This gets problematic if the process has a lot of memory allocated**"
> — [rust-lang/rust#87764](https://github.com/rust-lang/rust/issues/87764)

Das sind **< 1 ms/Prozess** (modern) bis **~100 ms/Prozess** (glibc 2.17) — Faktor **~100**, allein wegen des Eltern-Speichers. **Für dieses Projekt relevant:** ein Bun-Harness mit großem Heap macht jeden Prozessstart teuer.

**4. Fehlersuche über Prozessgrenzen — die Kosten sind im Projekt bereits eingetreten.** `docs/risks.md` §6 dokumentiert einen **gemessenen** Bun-Fehlschlag (`node-addon-require-builtin`: „Unsupported/no-context (required V8 current-context symbols were not found)"). Die Reaktion war richtig — „Eine Kernfähigkeit, die unter der gewählten Laufzeit nicht trägt, wird **nicht** durch einen Laufzeitwechsel geheilt, sondern durch eine Grenze." Aber sie zeigt auch: jede Grenze erzeugt eine **neue** Fehlerklasse, die man klassifizieren muss.

**5. Die Vorlage selbst liefert das härteste Argument gegen die eigene Sprachvielfalt** — durch ihren Aufbau: `native/landlock-run` brauchte eine **Drei-Paket-npm-Familie** (`entry`, `linux-x64`, `linux-arm64`), eine Support-Matrix, eine CI-Matrix, einen „builder of record" pro Plattform, Prebuild-Assemblierung, Release-Verifikation — für **298 Zeilen C**. Das sind die realen Grenzkosten: **nicht die Zeilen, sondern die Auslieferungskette pro Plattform.** DSH dokumentiert genau das: „the no-cross-toolchain rule means a platform package is added only together with a native runner that builds and proves it" — eine neue Plattform ist ein **Runner plus Paket**, nicht ein `GOOS`-Flag.

**6. Der belegte Kostentreiber Nummer eins ist nicht die Sprache, sondern der Rewrite.** Prime Video hat Microservices zu einem Monolithen zurückgebaut und dabei **über 90 % Infrastrukturkosten** gespart — vorher „we hit a hard scaling limit at around **5% of the expected load**", und: „The two most expensive operations in terms of cost were **the orchestration workflow and when data passed between distributed components**." Segment hat „over **140 services into a single service**" konsolidiert, mit **3 Vollzeit-Engineers**, die nur den Betrieb am Leben hielten, einer Testsuite von „**up to an hour**" → „**milliseconds**", und „three destinations per month" als Wachstumsrate.

**7. Ein eigenes Zahlenbeispiel aus diesem Projekt als Rechnung:** `packages/util/atomic-write/src/index.ts` implementiert einen JSON-Zeilenvertrag gegen `pmh-atomicfs` — inklusive Exit-Code-Behandlung, Timeout-Meldung und „lieferte keine JSON-Zeile auf stdout". Das sind ~350 Zeilen TypeScript **nur für die Grenze** — zu einem Rust-Programm, das wiederum niemand importiert. Zu diesem Preis kommt der Prozessstart: bei **einem Aufruf pro Append** sind das bei Bun **~888 µs Start** (Bun-Doku, Apple M1 Max) **plus** IPC-Round-Trip von **~4,6–8,3 µs** (Unix-Domain-Socket) gegen einen `fsync` von **< 1 ms (SSD) bis ~10 ms (HDD)**. Die Grenze kostet in derselben Größenordnung wie die Arbeit — und für eine Bulk-Operation wie `fsync` ist sie damit **nicht amortisierbar**.

### Gegenargument

Die Regel „jede andere Sprache ist ein Prozess" (`docs/stack.md`) macht die Grenze **verschiebbar** — ein Dienst kann später die Sprache wechseln, ohne den Core zu ändern. Das ist ein echter architektonischer Gewinn und der beste Teil des bestehenden Entwurfs. Wer die Zahl der Sprachen senkt, verliert diese Option nicht, solange er die **Grenze** behält und nur die **Sprache dahinter** vereinheitlicht. Und: Chromiums 8 % unlösbare APIs zeigen, dass eine Grenze nicht „sauber" sein muss, um zu funktionieren — sie muss nur **vollständig genug** sein. Googles Antwort darauf ist die eigentliche Strategie: „**Interoperability is the new rewrite**".

---

## 7. Wann lohnt sich ein natives Programm?

### Empfehlung — Daumenregel

Ein eigenes natives Programm ist gerechtfertigt, wenn **mindestens eine** Bedingung **strukturell** erfüllt ist:

| Kriterium | Rechtfertigt ein eigenes Programm | Rechtfertigt es **nicht** |
|---|---|---|
| **1. `execve`-Vererbung** | Die Beschränkung muss auf einen **fremden** Prozessbaum übergehen (Landlock-Launcher). | Die Fähigkeit wirkt im eigenen Prozess. |
| **2. ABI-/Laufzeitgrenze** | Die Runtime kann die Fähigkeit **nachweislich nicht** bereitstellen (gemessen!). | Die Runtime kann es, aber die API ist unbequem. |
| **3. Auslieferungsunabhängigkeit** | Das Programm muss ohne Runtime/Umgebung entscheidbar sein. | Die Entscheidung darf aus der Umgebung kommen. |
| **4. Kein Prozess-Overhead im Pfad** | **Nie** für heiße Pfade — Prozessgrenzen sind pro Aufruf teuer. | Alles, was pro Event/Tool-Aufruf läuft. |

**Und die Gegenprobe:** Wenn eine Fähigkeit **im Kernprozess** wirkt, von der Runtime **bereits** bereitgestellt wird und **pro Aufruf** läuft, ist ein eigenes Programm **immer** falsch.

### Begründung — mit Zahlen

**Prozessstart (belegt, offizielle Bun-Doku):** `Bun.spawnSync(["echo","hi"])` **888,14 µs/Iter**; Node `child_process` **1,47 ms/Iter** — auf Apple M1 Max. Bun nutzt `posix_spawn(3)` ([bun.com/docs/runtime/child-process](https://bun.com/docs/runtime/child-process)).

**Prozessstart (belegt, sprachunabhängig, gemessen):** ~4 GiB allokieren, dann 100× `sleep 0`:

| Umgebung | Kosten | pro Prozess |
|---|---|---|
| Laptop, glibc 2.33 | < 100 ms für 100 Spawns | **< 1 ms** |
| HPC-Cluster, glibc 2.17 | bis 10 s | **~100 ms** |

> „**it still has to do nontrivial things, like setting up page tables. This gets problematic if the process has a lot of memory allocated**"
> — [rust-lang/rust#87764](https://github.com/rust-lang/rust/issues/87764)

**Der Faktor zwischen diesen Zeilen ist ~100 — und er hängt allein am Speicher des Elternprozesses, nicht an der Sprache.**

**IPC (belegt, gemessen, 5.000 Round-Trips, core-pinned):**

| Nutzlast | Shared Memory | Unix-Domain-Socket (Stream) | UDS (Datagram) |
|---|---|---|---|
| 32 B | **270 ns** | 5.910 ns | 4.640 ns |
| 1 KB | 1.980 ns | 8.290 ns | 6.860 ns |
| 8 KB | 14.360 ns | 23.280 ns | 19.850 ns |

> „Shared memory achieves a median round-trip latency of **270 ns at 32 bytes, which is 17 to 22 times lower** than either UDS variant"
> — [victoranderssen.com/blog/linux-ipc-benchmark](https://victoranderssen.com/blog/linux-ipc-benchmark/) (privater Blog, nicht peer-reviewed, ein Rechner, nur Linux — **plausible Größenordnung, kein gesicherter Fakt**)

**Daumenregel aus diesen Zahlen:** eine Prozessgrenze über UDS kostet **~4,6–8,3 µs pro Round-Trip** zusätzlich gegenüber In-Process; der Durchsatz gleicht sich erst ab **~8 KB** Nutzlast an.

**Was das für `pmh-atomicfs` bedeutet — die entscheidende Rechnung dieses Berichts.** Ein `pmh-atomicfs`-Aufruf kostet: **~888 µs Prozessstart** (Bun) **+ ~4,6–8,3 µs IPC-Round-Trip** + JSON-Serialisierung, also **~0,9–1 ms**. Zum Vergleich: `fsync` auf einer SSD liegt laut etcd bei **< 1 ms**, auf einer HDD bei **~10 ms** ([etcd Performance](https://etcd.io/docs/v3.6/op-guide/performance/)). **Bei einem Aufruf pro Append kostet die Grenze so viel wie die Arbeit** — und der Nutzen (Dauerhaftigkeit) wird durch den Prozessstart nicht besser.

**Der belegte Präzedenzfall, wie schmal der Grat ist:** GitLab brauchte nur **20 fork/exec pro Sekunde**, um **1.400 Goroutinen** an einem `ForkLock` zu blockieren und p99 von **400 ms auf 100 ms** zu drücken — bei 1.000 gRPC-Requests/s. Also: **die Aufrufrate, ab der eine Prozessgrenze kippt, liegt viel niedriger, als man intuitiv annimmt.** Bei Events alle ~100 ms ist `pmh-atomicfs` bereits am Rand.

**Buns Startzeiten als Kontext:** „On Windows, Bun starts 2.5× faster" — **15,5 ms** für `hello.js` (Bun 1.4) vs. 40,1 ms (Node 26). Ein **eigenes** natives Programm startet zwar schneller als eine Runtime, aber die Größenordnung bleibt: Prozessstart ist **Mikrosekunden bis Millisekunden**, ein Funktionsaufruf ist **Nanosekunden**.

### Die daraus folgende Regel für dieses Projekt

> **Ein natives Programm ist gerechtfertigt, wenn es (a) `exec`t und die Beschränkung vererbt, oder (b) eine von der Runtime nachweislich nicht gebotene Fähigkeit bereitstellt — und wenn es nicht pro Event aufgerufen wird.**

Angewandt:

| Kandidat | exec? | Runtime kann es nicht? | pro Event? | Urteil |
|---|---|---|---|---|
| `landlock-run` | **ja** | ja (Landlock braucht Syscalls) | nein (einmal pro Kommando) | **gerechtfertigt** |
| `pmh-supervisor` (Go) | ja (startet/überwacht) | – | nein | **gerechtfertigt** |
| `pmh-pty` | nein | **nein** (Bun kann `Bun.Terminal`) | – | **hinfällig** |
| `pmh-atomicfs` | nein | **nein** (`fsync`/`rename` sind da) | **ja, potenziell pro Append** | **hinfällig** |
| `pmh-flock` | nein | **nein** (`bun:ffi`) | nein | **fragwürdig** |
| `pmh-crypto` | nein | **nein** (BoringSSL im Runtime) | ja (pro Hash) | **verschlechternd** |
| `pmh-index` | nein | **nein** (reines Parsing) | nein | **vertretbar, aber nicht nötig** |

### Gegenargument

Die 888 µs sind auf Apple M1 Max gemessen; auf diesem Windows-Host ist der Prozessstart teurer. Und „pro Event" ist eine Annahme: ein Harness kann Events **batchen** und `pmh-atomicfs` einmal pro Sekunde aufrufen. Dann kippt das Kostenargument. **Aber:** wer batchen muss, um eine Prozessgrenze zu amortisieren, hat die Grenze schon verloren — `fsync` einmal pro Sekunde tötet dieselbe Dauerhaftigkeitsgarantie, die der Dienst herstellen sollte.

---

## 8. Etikettenschwindel: wo „Rust für Sicherheit" ohne Beleg steht

### Empfehlung

Prüfliste. Eine Sprachwahl ist **Etikettenschwindel**, wenn **eines** zutrifft:

1. **Es gibt keine Messung** — kein Vorher/Nachher, kein Perzentil, keine Zahl.
2. **Das genannte Problem liegt woanders** (z. B. GC-Tuning, Konfiguration statt Sprache).
3. **Die Sprache löst ein Problem, das die Runtime schon gelöst hat** (SHA-256 in Rust gegen BoringSSL).
4. **Das Feld behauptet mehr, als der Code tut.**
5. **Der Nutzen wird aus einem anderen Projekt geborgt** (Discord-Zahlen auf einen CRUD-Dienst).
6. **Die „Sicherheit" hat kein Bedrohungsmodell.**

### Konkrete Beispiele — und ein lokaler Fund

**Der härteste Fall liegt in diesem Projekt selbst, und er ist dokumentiert.** `native/pty/unit.json` schreibt über den eigenen Rust-Dienst:

> „EINSCHRAENKUNG: benutzt noch KEIN echtes PTY, sondern Pipes. Kein isatty, keine Zeilenbearbeitung, keine Job-Control-Signale. resize wird verfolgt, aber nicht angewendet; signal validiert nur."
>
> „Das Feld implementation meldet derzeit noch **conpty bzw. openpty, obwohl Pipes benutzt werden**. Das ist als Mangel im Pruefbericht gefuehrt (Auflage A4)."
> — `native/pty/unit.json`, Feld `notes`

**Das ist exakt Kriterium 4:** ein Dienst mit dem Namen `pmh-pty`, der in seinem Feld `implementation` „conpty/openpty" meldet, während der Code Pipes benutzt. Die Zeilen 17–19 des Manifests behaupten außerdem, `node-pty` zu „ersetzen" — während `node-pty` unter Bun ohnehin nicht funktioniert und Bun ein **echtes** PTY hat. Der Etikettenschwindel ist hier nicht der Sprache, sondern der **Fähigkeit** — und er ist ehrlich vermerkt, was ihn zum Lehrstück statt zum Skandal macht.

**Der zweite lokale Fall — `native/atomicfs/unit.json`:**

> „Ersetzt den Bedarf am nativen Addon koffi (MoveFileExW mit MOVEFILE_WRITE_THROUGH)."
> „Loest damit das Risiko mit der hoechsten Prioritaet aus docs/risks.md Abschnitt 1 **strukturell auf, statt es zu messen**."

Das ist der Etikettenschwindel in Reinform — **und das Manifest gibt ihn selbst zu**: eine gemessene Frage wurde durch eine neue Sprachgrenze **umgangen**, nicht beantwortet. Meine Messung (§0) zeigt: die Messung hätte funktioniert. `koffi` trägt unter Bun.

**Der dritte lokale Fall — `native/crypto/unit.json`:**

> „Neubau: die Vorlage haelt ihre Hashing-Logik in TypeScript (packages/util/crypto)."

Das ist Kriterium 3. Die Vorlage mag ihre *Verdrahtung* in TypeScript halten — das **Hashing** selbst ist BoringSSL-C, sowohl in Node als auch in Bun („Bun's crypto is backed by BoringSSL"). Ein Rust-Prozess, der SHA-256 ersetzt, ersetzt C durch C und fügt eine Prozessgrenze pro Hash hinzu. **Das ist die einzige Änderung in diesem Projekt, die die Latenz garantiert verschlechtert.** Immerhin ist das Manifest hier ehrlich: „Bewusst KEIN AEAD und KEINE KDF".

**Externe Beispiele, belegt:**

- **Discord (2020)** — gilt als *der* Beleg für „Go → Rust", liefert aber **keine Zahlen im Text** (nur Diagramme) und schreibt selbst: „we don't think you should rewrite everything in rust just because." Wer konkrete Perzentile zitiert, zitiert nicht diese Quelle. **Kategorie 1 und 5.**
- **Cloudflare Pingora (2022)** — der vollständigste Zahlenkatalog zur Sprachwahl (−70 % CPU, −67 % Speicher, −5 ms Median-/−80 ms p95-TTFB, Reuse 87,1 % → 99,92 %) — und die Firma **sagt selbst, dass es nicht an der Sprache lag**: „**This is not because we run code faster. Even our old service could handle requests in the sub-millisecond range.**" **Kategorie 2.**
- **Google/Android** — der **einzige** Fall, in dem „Rust für Sicherheit" mit Zahlen belegt ist (76 % → 24 % über 6 Jahre, 223 → 85 absolut, 1,5 Mio. Zeilen Rust, null Memory-Safety-Bugs im Rust-Code). **Und Google nennt die Grenze selbst:** „**correlation doesn't necessarily mean causation**" sowie „**Interoperability is the new rewrite**". Das ist die Vorlage für eine ehrliche Sprachbegründung. **Kategorie 6 erfüllt, weil das Bedrohungsmodell genannt wird.**
- **JetBrains, August 2026** — die beste Zusammenstellung gescheiterter Rust-Rewrites, mit der Kernaussage:

> „RIIR can deliver real performance and safety gains, **but not automatically. Some projects are faster because of Rust, some just because they were rewritten from scratch.**"
> — [blog.jetbrains.com/rust/2026/08/10/rewriting-in-rust](https://blog.jetbrains.com/rust/2026/08/10/rewriting-in-rust/)

| Projekt | Was passierte |
|---|---|
| **Prisma** | Rust-Engine → **zurück zu TypeScript** („skill-set gaps, deployment complexity, and runtime issues"; „**opaque to our TypeScript-focused community**") |
| **Loglog Games** | Rust nach 3 Jahren aufgegeben („excellent for refactoring but poor for iteration speed") |
| **curl / hyper** | **„95% completion and was then abandoned due to the difficulty of the last 5%"** |
| **Microsoft** | wählte bewusst **Go** statt Rust („Go is much closer to TypeScript in its programming model") |
| **NTPsec** | wählte **Go** („better network primitives and a less fragmented ecosystem") |

Und die belegten Bugs in frischem Rust-Code: Cloudflare „introduced an `unwrap`"; uutils formatierte Daten falsch und „breaking unattended upgrades"; sudo-rs gab ein halb getipptes Passwort im Terminal aus; der **erste Rust-Kernel-CVE (CVE-2025-68260)** kam aus einer Race Condition in einem **`unsafe`**-Block. Das ist **Kategorie 6**: die „Sicherheit" hat eine Failure-Story — und die zeigt genau, wo sie endet.

- **Die Vorlage selbst (`docs/risks.md` §6)** — ein *negativer* Beleg, der richtig eingeordnet wurde: das Addon `node-addon-require-builtin` scheiterte **gemessen** an Bun. Hier wurde **nicht** etikettiert, sondern gemessen und die Konsequenz gezogen.
- **Bun 1.4** — „it rewrites Bun from Zig to Rust". Ein legitimer Rust-Beleg, aber für **Laufzeitbau**, nicht für Anwendungscode. Wer ihn für Anwendungscode zitiert, begeht **Kategorie 5** (Nutzen aus einem anderen Projekt borgen).

**Wie man Etikettenschwindel erkennt — die Gegenprobe aus diesem Projekt:** `native/index/unit.json` und `native/crypto/unit.json` machen es **richtig**. Sie schreiben die Grenze hin: „Der Extraktor ist LEXIKALISCH, kein Parser: er loest keine Importe auf und baut keinen Typgraphen"; „Das Feld digest ist FNV-1a 64 und nur zur Aenderungserkennung gedacht, NICHT kryptografisch"; „probe meldet aead=false, kdf=false". **Diese Manifests sind das beste Stück Dokumentation im `native/`-Baum** — sie nennen die Grenze der eigenen Fähigkeit. Genau das fehlt `pmh-pty`.

### Gegenargument

Ein „Verschwendung"-Urteil ist selbst ein Etikett, wenn es nicht gemessen ist. `pmh-crypto` könnte durchaus gerechtfertigt sein, wenn das Ziel **Prozessisolation für Geheimnisse** wäre (Schlüsselmaterial verlässt nie den Harness-Prozess). Das Manifest nennt dieses Ziel aber **nicht** — es nennt „die Vorlage haelt ihre Hashing-Logik in TypeScript" als Grund. Wäre die Isolation das Ziel, müsste sie im Manifest stehen und gemessen sein.

---

## 9. Die kleinste vernünftige Aufteilung für dieses Projekt

| Aufgabe | Sprache | Begründung | Was dagegen spricht |
|---|---|---|---|
| **Plugin-Core, Agent-Loop, Sessions, Tools** | **TypeScript auf Bun** | Cordis ist JS; nicht verhandelbar (`docs/stack.md`). | Bun 1.4.0 ist jung; ein gemessener Inkompatibilitätsfall existiert bereits (`docs/risks.md` §6). |
| **PTY / persistentes Terminal** | **TypeScript, `Bun.Terminal`** | Nativ, plattformübergreifend, getestet (eigene Messung: `OK`). Null Abhängigkeiten. | ConPTY re-enkodiert ANSI-Bytes; ältere Windows-Versionen ohne Maus. `Bun.Terminal` ist < 10 Monate alt. |
| **Atomares Schreiben / Dauerhaftigkeit** | **TypeScript (`node:fs`)** | `fsync`/`rename` sind „🟢 fully implemented"; die Vorlage macht es genau so (`storage-json/src/atomic.ts`). | Windows-Verzeichnis-Dauerhaftigkeit bleibt **unbewiesen** — muss als „nicht garantiert" dokumentiert werden. |
| **FFI zu Win32 (MoveFileExW, LockFileEx, ACL)** | **TypeScript + `bun:ffi`** | Bordmittel, 0 Abhängigkeiten, „2–6× faster than Node.js FFI through Node-API". `koffi` funktioniert (gemessen), ist aber ein Fremd-Addon. | `bun:ffi` ist Bun-only → die Node-Rückfalloption aus `docs/risks.md` §1(c) verliert ihren Charme. Koffi bleibt für Node. |
| **Dateisperren** | **TypeScript + `bun:ffi` (`flock`/`LockFileEx`)** | Crash-Freigabe durch den Kernel — der einzige Schutz, der einen `SIGKILL`-Prozess übersteht. | Advisory; gegen ignorierende Werkzeuge wirkungslos. `native/flock` deckt Windows **nicht** ab. |
| **Landlock-Sandbox (Linux)** | **Eigenes Winzigprogramm**, C **oder** Rust (`landlock`-Crate) | **`execve`-Vererbung** ist der Grund — nicht die Sprache. Codex macht es mit Rust, die Vorlage mit C; beide sind belegt. | Auslieferungskette pro Plattform (Drei-Paket-Familie, CI-Matrix). Nicht auf Windows verfügbar. |
| **Windows-Sandbox** | **TypeScript + FFI** | Die Vorlage fährt diesen Weg produktiv; kein `exec`-Erbmodell existiert, das ein externer Prozess besser bediente. | AppContainer kann keine beliebigen Pfade lesen; Job Objects sind keine Grenze. |
| **Prozess-Supervisor** | **Go** | Belegt guter Go-Fall (Prozessbaum, Lebenszyklus). Bereits gebaut und im Unit-Register. | Unter Windows kein freundliches Signal — Dienste werden hart beendet (`pmh-supervisor/unit.json`). |
| **Web-Attach / Gateway** | **Go — nur nach Lastmessung** | Nebenläufigkeits- und Streaming-Stärke. | Dupliziert die Semantik des Core-Gateway-Seams („~1.600 Zeilen") und muss gegen jede Core-Änderung nachgezogen werden. **Erst messen.** |
| **Rechenintensive Werkzeuge** | **TypeScript/Bun zuerst** | Krypto, Hashing, SQLite, zlib, Regex sind bereits natives C. | Wenn eine Messung CPU-Blockierung des Event-Loops zeigt (Bun hat `--cpu-prof-md`, `--heap-prof-md`), erst dann auslagern. |
| **`pmh-crypto`** | **zurückziehen** | Ersetzt BoringSSL-C durch Rust-C plus Prozessgrenze. | Nur gerechtfertigt, wenn **Prozessisolation für Geheimnisse** das echte Ziel ist — dann muss es im Manifest stehen. |
| **`pmh-index`** | **behalten, aber nicht ausbauen** | Lexikalischer Extraktor, ehrlich als solcher dokumentiert. | Die Vorlage hat kein Gegenstück; der Nutzen ist unbelegt. Ein Baumscan ist kein CPU-Engpass. |

**Summe: zwei Sprachen** (TypeScript/Bun + Go) **plus ein einzelnes Winzigprogramm** für Landlock. Rust ist **optional** — als Ersatz für die 298 C-Zeilen, nicht als vierte Schicht.

---

## 10. Was ich NICHT empfehle und warum

1. **`node-pty` unter Bun.** Gemessen tot: lädt, spawnt, liefert **keine Daten** (`captured 16 bytes`). Reproduziert [#25822](https://github.com/oven-sh/bun/issues/25822); der Fix-PR [#41495](https://github.com/oven-sh/bun/pull/41495) ist offen. node-pty erklärt Bun für „out-of-scope". **Und es ist überflüssig** — Bun hat ein echtes PTY.
2. **`pmh-pty` in seiner heutigen Form.** Es nutzt laut eigener `unit.json` **Pipes statt PTY** und meldet trotzdem `conpty`/`openpty`. Für diese Fähigkeit gibt es eine bessere, kürzere und *funktionierende* Lösung im Runtime.
3. **`pmh-atomicfs` als Dauerhaftigkeitsanker.** `fsync`/`rename` sind in Bun „fully implemented"; der Dienst löst ein Problem, das die Runtime löst, und kostet **~1 ms Prozessstart pro Aufruf** gegen `fsync`-Kosten von < 1 ms (SSD) bis ~10 ms (HDD). Kein Code ruft ihn auf.
4. **`pmh-crypto`.** Ersetzt BoringSSL-C durch Rust-C. Die einzige Änderung mit garantiert **schlechterer** Latenz.
5. **`proper-lockfile`.** `mkdir`+mtime statt OS-Sperre; **kein** Schutz gegen `SIGKILL`/OOM; Default-`onCompromised` **killt den Prozess** (belegt in Produktion unter CPU-Last mit mehreren Agenten); offener Stale-Reclaim-Race; seit 2021 kein Release; ~10 s Stale-Fenster.
6. **`async-mutex` für die Sitzungsdatei.** Nur In-Process — löst das Problem **nicht**.
7. **`fcntl`-Record-Locks (`F_SETLK`).** Klassische Fußangel: „if a process closes *any* file descriptor referring to a file, then all of the process's locks on that file are released" — in einer Runtime mit vielen versteckten `open`/`close` gefährlich. Falls doch: **OFD-Locks** (`F_OFD_SETLK`), aber Linux-spezifisch.
8. **Drei Sprachen gleichzeitig.** `docs/risks.md` §3 sagt es selbst: „macht jeden Fehler mehrdeutig … verdreifacht die Werkzeugketten". Der aktuelle Stand hat sie schon (TS + Go + Rust + C) und **6.014 Zeilen Rust, die niemand aufruft** — genau das Ergebnis, das die eigene Risikoliste vorhergesagt hat.
9. **Rust, um ein gemessenes Risiko zu umgehen.** `native/atomicfs/unit.json` sagt es wörtlich: „Loest damit das Risiko … strukturell auf, statt es zu messen." Die Messung hätte 20 Minuten gedauert und ist **positiv** ausgefallen.
10. **Eine neue Sprache für Dauerhaftigkeit, Sperren, Krypto oder Indizierung.** Alle vier sind in TypeScript + Bordmitteln lösbar; drei davon **besser**, weil ohne Prozessgrenze.
11. **`MOVEFILE_WRITE_THROUGH` als Beweis für Verzeichnis-Dauerhaftigkeit verkaufen.** Microsofts Garantietext deckt nur den Copy-and-Delete-Fall. Als Defense-in-Depth behalten — im Code als „nicht garantiert" kommentieren.
12. **Landlock durch In-Process-Selbstbeschränkung ersetzen.** Ohne `TSYNC` gilt sie nur für einen Thread (Bun/Node sind multi-threaded), und sie würde die **eigene** Harness-Runtime mit einschränken — das genaue Gegenteil des Ziels.

---

## 11. Was nicht belegt ist

Ausdrücklich, ohne Erfindung:

- **Eine quantitative Studie zu „Kosten einer zusätzlichen Sprache"** (CI-Minuten, Einarbeitungszeit, Tooling-Personal) — **existiert nicht.** Gesucht mit „polyglot programming cost", „language proliferation", „cost of adding a language". Die meistzitierte Quelle („Polyglot is Killing Your Enterprise", DevOps Digest) enthält **null Zahlen** und stammt vom CEO eines Sprach-Distributors. Belegt sind nur **Einzelfälle**: Chromiums Interop-Zählung (1768 APIs, ~60 % cxx-tauglich, **8 % unlösbar**), Segment (3 Vollzeit-Engineers, Testsuite 1 h → ms), Dropbox („onboarding … took years").
- **Eine belegte Schwelle „ab X Aufrufen/s oder Y ms lohnt sich ein natives Programm"** — **existiert in der Literatur nicht.** Was es gibt, sind firmenspezifische Auslöser: Cloudflare („Even our old service could handle requests in the sub-millisecond range"), Prime Video („5 % of the expected load"), Figma (einzelne Dokumente blockierten ganze Worker), **GitLab (20 fork/exec pro Sekunde genügten für Lock-Contention)**. Die gemeinsame Struktur ist nicht die Rate, sondern **ob eine nicht unterbrechbare Arbeit über eine geteilte Ressource läuft** (Event Loop, GC-Scan, Fork-Lock) **und wie groß der Elternprozess ist**.
- **Konkrete Discord-Zahlen** (p99, GC-Pausen in ms, Speicher) — **nicht im Artikel enthalten**, nur in vier Diagrammen. Alle im Umlauf befindlichen Zahlen konnte ich in der Primärquelle **nicht** verifizieren.
- **Dropbox-Performancezahlen** — der Post enthält **keine**; die einzige harte Zahl ist „onboarding new engineers to the system **took years**". Und: der Post ist von **2020, nicht 2016**.
- **Figma-WASM-Zahlen** — **nicht belegt**; der abgerufene Post behandelt Rust im Server. Belegt sind dort „serialization time is now **over 10x faster**" und — bemerkenswert — dass Figma den Rewrite **halbierte**: „we dropped our initial plan to rewrite our whole server in Rust".
- **Chromium: weggefallene Memory-Safety-Bugs seit der Rust-Einführung** — **nicht belegt**.
- **Wartungskosten von Rust im Linux-Kernel in Zahlen** — **nicht belegt** (kein Personalaufwand, keine Build-/CI-Kosten). „Rust im Kernel ist teuer" ist verbreitete Meinung, aber **nicht beziffert**.
- **TechEmpower-Benchmarks** — die Seite war nicht abrufbar (drei Versuche). **Keine Zahlen von dort zitiert.**
- **Windows-`CreateProcess`-Overhead** — **kein Messwert gefunden**. Die Prozessstart-Zahlen oben sind Linux (glibc).
- **JSON vs. MessagePack vs. Protobuf** — **kein belastbarer Benchmark abgerufen**. Nicht belegt.
- **Microsofts „70 % der CVEs"** — nur **sekundär** belegt (ZDNet über einen BlueHat-Vortrag von Matt Miller, 2019); die Primärfolien wurden nicht abgerufen. Die Kurzformel ist eine Vereinfachung: die Quelle sagt „70 % der **gepatchten** Vulnerabilities". Unabhängig gestützt von Chromium (**70 % der High/Critical-Bugs, 912 seit 2015**) und Googles Baseline („more than 65 %").
- **Landlock ABI 4 = Linux 6.7** — die aktuelle Kernel-Doku enthält keine ABI↔Kernelversion-Tabelle. **Nicht belegt.**
- **Kernelversionen für Landlock ABI 2–11** — **nicht belegt** (nur „ABI 1 = Linux 5.13").
- **Dass `MOVEFILE_WRITE_THROUGH` beim gleichvolumigen Rename die Verzeichnis-Metadaten dauerhaft macht** — **nicht belegt**. Microsoft sagt dazu nichts.
- **Dass `FlushFileBuffers` auf ein Datei-Handle die Verzeichnis-Metadaten durable macht** — Microsoft sagt dazu **nichts**. **Nicht belegt.**
- **Atomizität von `MoveFileExW`/`MOVEFILE_REPLACE_EXISTING`** — von Microsoft **nicht garantiert** (POSIX garantiert sie für `rename` ausdrücklich).
- **Verzeichnis-fsync auf Windows als API** — existiert nicht; nur ein volumenweiter Flush mit **Admin-Rechten**.
- **Eine belastbare Windows-Benchmark-Studie zu Write-Through** — **nicht belegt**. Die einzige gefundene Messung ist eine Einzelmessung auf einer 5400-rpm-HDD (45 ms Rename+Flush vs. 0,26 ms ohne Flush), vom Autor selbst als unsicher markiert.
- **Bun-Doku, die `fsync` namentlich nennt** — es gibt nur die Blockaussage „node:fs 🟢 fully implemented". **Nicht belegt** als Einzelfunktion.
- **`Bun.Terminal`-spezifische UTF-8-/Codepage-Dokumentation** — **nicht belegt**.
- **Eingebautes ANSI-Strip-API in Bun** — **nicht belegt**.
- **`winpty` als Lösung** — keine Quelle abgerufen; **keine Aussage**.
- **„proper-lockfile ist kein Ersatz für flock"** — dieses Zitat steht **nicht** im README (0 Treffer für `flock`/`replacement`). **Nicht belegt.**
- **Windows-Aussagen in `proper-lockfile`s README** — Windows wird dort **gar nicht erwähnt** (0 Treffer). Weder Zu- noch Absage belegt.
- **`proper-lockfile` im Einsatz bei npm/Yarn/Jest** — **nicht belegt**; keine der geprüften `package.json` listet es.
- **Cursor-Sandboxing** — keine offizielle Quelle abgerufen; **keine Aussage**.
- **`fs-native-extensions` nutzt `LockFileEx` auf Windows** — im README **nicht wörtlich** belegt.
- **napi-rs-Support für Bun** ist laut Anbieter selbst **„Best effort"**: „The source repository runs a latest-Bun job, but the test step is `continue-on-error`, so Bun failures do not block napi-rs releases." → **Eine generelle N-API-Garantie für Bun gibt es nicht.**
- **`koffi`s offizieller Bun-Support** — koffi.dev sagt „Koffi requires Node.js version 16 or later" und nennt Bun **nirgends**. Meine Messung zeigt, dass es **funktioniert** — aber das ist **meine Messung, kein dokumentierter Support**.
- **Ob dieser eine Messtest `koffi` für *alle* Operationen trägt** — **nicht belegt**. Getestet wurde genau **ein** Aufruf (`MoveFileExW`) mit genau **einer** Flag-Kombination. Die Vorlage nutzt koffi für deutlich mehr (ACL-Deskriptoren, Token, `STARTUPINFOW`, `PROCESS_INFORMATION`, `CommandLineToArgvW`) — **jedes davon ist eine eigene, ungeprüfte Annahme.**
- **Ob `bun:ffi` dieselbe Trickkiste trägt** — **nicht belegt**. Getestet wurde nur das **Binden** von `kernel32!MoveFileExW`, nicht der Aufruf mit `str16`-Argumenten, Strukturen und Pointern.

---

## 12. Quellen

**Bun — offizielle Doku und Blog**
- https://bun.com/docs/runtime/child-process · https://bun.com/docs/api/spawn · https://bun.com/docs/runtime/nodejs-apis · https://bun.com/docs/runtime/ffi · https://bun.com/docs/api/file-io
- https://bun.com/blog/bun-v1.3.5 (2025-12-17, `Bun.Terminal`, POSIX-only) · https://bun.com/blog/bun-v1.3.14 (2026-05-13, Windows ConPTY) · https://bun.com/blog/bun-v1.4 (2026-08-19)

**Bun — Issues und PRs**
- [#22468](https://github.com/oven-sh/bun/issues/22468) · [#32584](https://github.com/oven-sh/bun/issues/32584) · [#25565](https://github.com/oven-sh/bun/issues/25565) · [#7362](https://github.com/oven-sh/bun/issues/7362) · [#25822](https://github.com/oven-sh/bun/issues/25822) · [#29112](https://github.com/oven-sh/bun/issues/29112) · [#43450](https://github.com/oven-sh/bun/issues/43450) · [#26230](https://github.com/oven-sh/bun/issues/26230) · [#34914](https://github.com/oven-sh/bun/issues/34914)
- [PR #25415](https://github.com/oven-sh/bun/pull/25415) · [PR #29522](https://github.com/oven-sh/bun/pull/29522) · [PR #33992](https://github.com/oven-sh/bun/pull/33992) · [PR #39689](https://github.com/oven-sh/bun/pull/39689) · [PR #41495](https://github.com/oven-sh/bun/pull/41495) · [PR #42819](https://github.com/oven-sh/bun/pull/42819)

**Sprachwahl-Belege — Firmenberichte und offizielle Doku**
- [Discord: Go → Rust](https://discord.com/blog/why-discord-is-switching-from-go-to-rust) (2020-02-04) · [Cloudflare: Pingora](https://blog.cloudflare.com/how-we-built-pingora-the-proxy-that-connects-cloudflare-to-the-internet/) (2022-09-14) · [Dropbox: Nucleus](https://dropbox.tech/infrastructure/rewriting-the-heart-of-our-sync-engine) (2020-03-09) · [Figma: Rust in Production](https://www.figma.com/blog/rust-in-production-at-figma/) (2018-05-02) · [GitLab: 30× Gitaly](https://about.gitlab.com/blog/2018/01/23/how-a-fix-in-go-19-sped-up-our-gitaly-service-by-30x/) (2018-01-23)
- [Google: Android memory safety 2022](https://security.googleblog.com/2022/12/memory-safe-languages-in-android-13.html) · [Google: 76 % → 24 % (2024)](https://security.googleblog.com/2024/09/eliminating-memory-safety-vulnerabilities-Android.html) · [JetBrains: Rewriting in Rust](https://blog.jetbrains.com/rust/2026/08/10/rewriting-in-rust/) (2026-08-10)
- [Prime Video: Monolith statt Microservices](https://web.archive.org/web/20231230202019/https://www.primevideotech.com/video-streaming/scaling-up-the-prime-video-audio-video-monitoring-service-and-reducing-costs-by-90) · [Segment: Goodbye Microservices](https://web.archive.org/web/20231230151632/https://segment.com/blog/goodbye-microservices/) · [Joel Spolsky: Things You Should Never Do](https://web.archive.org/web/20250102205841/https://www.joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/) (2000-04-06)
- [Node.js: Don't Block the Event Loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop) · [Node.js: Worker threads](https://nodejs.org/api/worker_threads.html) · [go.dev](https://go.dev/) · [rust-lang.org](https://www.rust-lang.org/) · [The Rust Book](https://doc.rust-lang.org/book/ch00-00-introduction.html)
- [Chromium: Memory safety](https://www.chromium.org/Home/chromium-security/memory-safety/) · [Chromium: Rust and C++ interoperability](https://www.chromium.org/Home/chromium-security/memory-safety/rust-and-c-interoperability/)
- [Benchmarks Game: Rust vs. Go](https://benchmarksgame-team.pages.debian.net/benchmarksgame/fastest/rust-go.html) · [Linux-IPC-Benchmark](https://victoranderssen.com/blog/linux-ipc-benchmark/) · [rust-lang/rust#87764](https://github.com/rust-lang/rust/issues/87764) · [Prisma ORM Manifesto](https://www.prisma.io/blog/prisma-orm-manifesto)
- [heise: Rust im Kernel offiziell](https://www.heise.de/en/news/Linux-Kernel-Rust-Support-Officially-Approved-11109808.html) (2025-12-10) · [Phoronix: Hellwig tritt zurück](https://www.phoronix.com/news/Hellwig-DMA-Helpers-Removed) (2025-02-25) · [ZDNet: Microsoft 70 %](https://www.zdnet.com/article/microsoft-70-percent-of-all-security-bugs-are-memory-safety-issues/) (2019-02-11)

**Windows / Microsoft Learn**
- [MoveFileExW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw) · [LockFileEx](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-lockfileex) · [FlushFileBuffers](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers) · [ReplaceFileW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew) · [File Caching](https://learn.microsoft.com/en-us/windows/win32/fileio/file-caching) · [File Buffering](https://learn.microsoft.com/en-us/windows/win32/fileio/file-buffering) · [Byte-Range Locks](https://learn.microsoft.com/en-us/windows/win32/fileio/locking-and-unlocking-byte-ranges-in-files) · [Creating a Pseudoconsole Session](https://learn.microsoft.com/en-us/windows/console/creating-a-pseudoconsole-session) · [AppContainer Isolation](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation) · [Implementing an AppContainer](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer) · [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)

**Linux / Kernel / Manpages**
- [Landlock (Kernel-Doku, Aug 2026)](https://docs.kernel.org/userspace-api/landlock.html) · [flock(2)](https://man7.org/linux/man-pages/man2/flock.2.html) · [fcntl(2)](https://man7.org/linux/man-pages/man2/fcntl.2.html) · [fcntl_locking(2)](https://man7.org/linux/man-pages/man2/F_OFD_SETLK.2const.html) · [rename(2)](https://man7.org/linux/man-pages/man2/rename.2.html) · [landlock.io/integrations](https://landlock.io/integrations/)

**SQLite, PostgreSQL, RocksDB, LevelDB, etcd, Litestream**
- [sqlite.org/atomiccommit.html](https://sqlite.org/atomiccommit.html) · [sqlite.org/wal.html](https://sqlite.org/wal.html) · [PRAGMA synchronous](https://sqlite.org/pragma.html#pragma_synchronous) · [PostgreSQL WAL config](https://www.postgresql.org/docs/current/runtime-config-wal.html) · [RocksDB WAL Performance](https://github.com/facebook/rocksdb/wiki/WAL-Performance) · [LevelDB index.md](https://github.com/google/leveldb/blob/main/doc/index.md) · [etcd Performance](https://etcd.io/docs/v3.6/op-guide/performance/) · [Litestream Tips](https://litestream.io/tips/) · [LiteFS](https://fly.io/docs/litefs/) · [danluu.com/file-consistency](https://danluu.com/file-consistency/) · [danluu.com/fsyncgate](https://danluu.com/fsyncgate/)

**packages / Registry**
- [node-proper-lockfile](https://github.com/moxystudio/node-proper-lockfile) (+ [#121](https://github.com/moxystudio/node-proper-lockfile/issues/121), [#115](https://github.com/moxystudio/node-proper-lockfile/issues/115)) · [cline/kanban#128](https://github.com/cline/kanban/issues/128) · [claude-swap#372](https://github.com/realiti4/claude-swap/issues/372) · [versitygw#2351](https://github.com/versity/versitygw/issues/2351) · [koffi.dev](https://koffi.dev/) · [napi-rs Support & Compatibility](https://napi.rs/docs/more/support-compatibility) · [@bearly/flock](https://www.npmjs.com/package/@bearly/flock) · [fs-native-extensions](https://github.com/holepunchto/fs-native-extensions) · [crates.io/crates/landlock](https://crates.io/crates/landlock) · [crates.io/crates/portable-pty](https://crates.io/crates/portable-pty) · [creack/pty](https://github.com/creack/pty) · [Deno FsFile.lock](https://docs.deno.com/api/deno/~/Deno.FsFile.prototype.lock)

**Sonstige**
- [Discord: Why Discord is switching from Go to Rust](https://discord.com/blog/why-discord-is-switching-from-go-to-rust) (2020-02-04) · [microsoft/node-pty](https://github.com/microsoft/node-pty) · [microsoft/node-pty#632](https://github.com/microsoft/node-pty/issues/632) · [openai/codex](https://github.com/openai/codex) · [Claude Code Sandboxing](https://docs.claude.com/en/docs/claude-code/sandboxing) · [anthropics/sandbox-runtime](https://github.com/anthropics/sandbox-runtime) · [gemini-cli sandbox.md](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/sandbox.md) · [microsoft/mxc](https://github.com/microsoft/mxc) · [WASI#756](https://github.com/WebAssembly/WASI/issues/756)

**Eigene Messung (dieser Host)**
- Probe-Skript: `%TEMP%\pmh-probe\probe.mjs` · Bun **1.4.0**, Windows x64 · Ergebnis siehe §0 · **Keine Codebasis geändert.**

**Begleitende Detailberichte (im Zuge dieser Recherche entstanden)**
- `research-2026-dauerhaftigkeit-atomare-dateiops.md` — Dauerhaftigkeit/atomare Dateiops, 34 Quellen (Projektwurzel)
- `sprachwahl-grosse-systeme-recherche.md` — Sprachwahl-Zahlen großer Systeme, 32 Quellen (Projektwurzel)

---

### Grenzen dieses Berichts

Angenommen wurde ein **lokales** Dateisystem für die Sitzungsdateien. Liegt `~/.pmh` auf einem Netzlaufwerk (NFS/SMB), gelten andere Regeln (§3) — dann ist die Sperrstrategie **neu zu bewerten**, und `flock` kann still wirkungslos sein. Alle Aussagen zu Bun 1.4.0 wurden auf **Windows x64** gemessen; für Linux/macOS ist die Bun-PTY-Angabe **dokumentiert, aber von mir nicht gemessen**. Alle Web-Quellen wurden am **13.10.2026** abgerufen.
