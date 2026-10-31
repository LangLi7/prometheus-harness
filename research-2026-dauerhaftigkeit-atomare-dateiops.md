# Dauerhaftigkeit & atomare Datei-Operationen — Recherche-Stand bis 2026

**Kontext:** Append-only JSONL-Sitzungslog (Event-Sourcing / Write-Ahead-Log) für ein Agenten-Harness.
Bisher ruft das Projekt via `koffi` (FFI) direkt Windows `MoveFileExW` mit `MOVEFILE_WRITE_THROUGH` auf.

**Abrufdatum aller Quellen:** Oktober 2026 (die abgerufenen Seiten tragen Datumsangaben bis 2026-10-04).
**Regeln dieser Recherche:** Jede Behauptung trägt eine echte, abgerufene URL. Zahlen nur mit Quelle, sonst ausdrücklich „nicht belegt".

---

## 0. Kurzfassung (Kernaussagen)

1. **POSIX ist der belastbare Pfad.** Für ein Append-only-Log ist das kanonische Protokoll: `write()` → `fsync(datei)` → `fsync(verzeichnis)`. `fsync` auf das Verzeichnis wird gebraucht, weil der Verzeichniseintrag ein eigener Metadaten-Datensatz ist (SQLite begründet genau damit seine `EXTRA`-Sync-Stufe; Dan Luu leitet dieselbe Sequenz her).
2. **Windows hat kein dokumentiertes Äquivalent zum Verzeichnis-`fsync`.** Microsoft dokumentiert `FlushFileBuffers` nur für Datei- und Volume-Handles (Volume = Admin-Rechte). Ein Bytecode-Alliance-Issue (Autor: sunfishcode) hält ausdrücklich fest, es gebe „keine Möglichkeit, dies für Verzeichnisse zu tun".
3. **`MOVEFILE_WRITE_THROUGH` ist schwächer, als der Name suggeriert.** Microsofts eigene Formulierung bindet die Flush-Garantie an „a move performed as a **copy and delete** operation". Für einen Rename innerhalb desselben Volumes ist damit **nicht belegt**, dass das Flag überhaupt eine Flush-Garantie liefert. Der Microsoft-Text sagt nur: „The function does not return until the file is actually moved on the disk."
4. **Bun implementiert `fsync`, `fdatasync`, `rename` vollständig — aber über libuv.** Im Bun-`main`-Zweig (Okt 2026) rufen `fsync`/`fdatasync`/`rename` die libuv-Funktionen `uv_fs_fsync` / `uv_fs_fdatasync` / `uv_fs_rename` auf; auf Windows bedeutet das `FlushFileBuffers` bzw. `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)` — **ohne** `MOVEFILE_WRITE_THROUGH`.
5. **Node/Bun `fs.rename` sind auf Windows nicht stärker als libuv.** libuvs `fs__rename` ruft `MoveFileExW` mit ausschließlich `MOVEFILE_REPLACE_EXISTING`. Node dokumentiert für `fs.rename` lediglich Überschreiben, **keine** Atomizität und **keine** Dauerhaftigkeit.
6. **Der teure Teil ist der Flush, nicht der Rename.** Die einzige gefundene Windows-Messung mit Zahlen zeigt: Rename+Flush ≈ 45 ms, Flush ohne vorherigen Rename ≈ 0,26 ms, Rename ohne Flush ≈ 0,30 ms (5400-rpm-HDD, Einzelmessung eines Nutzers). Das ist ein Indiz dafür, dass der Flush den Preis treibt — nicht das Rename.
7. **Empfehlung:** Den `koffi`-FFI-Sonderweg nicht als Dauerhaftigkeits-Garantie behandeln. Dauerhaftigkeit gehört auf `FlushFileBuffers`/`fsync` **der Datei**; `MOVEFILE_WRITE_THROUGH` ist best-effort-Zusatz, kein bewiesener Ersatz für Verzeichnis-Sync. Zusätzlich: Checksummen pro JSONL-Zeile/Record (SQLite/Dan Luu-Empfehlung) und Gruppen-Commit, um die fsync-Kosten zu amortisieren.

---

## 1. Teilfrage 1 — Was garantiert Bun?

### 1.1 Dokumentierter Kompatibilitätsstand

Bun dokumentiert für den kompletten `node:fs`-Block:

> „🟢 Fully implemented. 98% of Node.js's test suite passes. `Stats` objects lack the `Temporal.Instant` getters (`atimeInstant` and friends)."
> — https://bun.com/docs/runtime/nodejs-apis (**offizielle Doku**, Bun „Node.js Compatibility", abgerufen Okt 2026; die Seite gibt an, den Stand von Node.js v26 abzubilden)

Und als Einordnung des Anspruchs:

> „**If a package works in Node.js but doesn't work in Bun, we consider it a bug in Bun.** Open an issue and we'll fix it."
> — https://bun.com/docs/runtime/nodejs-apis (**offizielle Doku**)

**Wichtig:** Bun nennt in seiner Dokumentation **keine einzelne Funktion** `fsync`, `fdatasync` oder `rename` namentlich. Eine explizite Bun-Doku-Aussage „`fs.fsync` ist vollständig unterstützt" ist **nicht belegt**. Belegt ist nur die Block-Aussage „node:fs fully implemented".

### 1.2 Was der Bun-Quellcode tatsächlich tut (stärkster Beleg)

Im Bun-`main`-Zweig gehen alle drei relevanten Operationen durch libuv — ich habe die Datei abgerufen und die Aufrufe gelesen:

```rust
pub fn fsync(fd: Fd) -> Result<()> {
    let uv_fd = fd.uv();
    let mut req = FsReq::new();
    // SAFETY: synchronous libuv fs call; req lives on the stack for the duration.
    let rc = unsafe { uv::uv_fs_fsync(uv::Loop::get(), &mut *req, uv_fd, None) };
```

```rust
    let rc = unsafe { uv::uv_fs_fdatasync(uv::Loop::get(), &mut *req, uv_fd, None) };
```

```rust
pub fn rename(from: &ZStr, to: &ZStr) -> Result<()> {
    ...
    let rc =
        unsafe { uv::uv_fs_rename(uv::Loop::get(), &mut *req, from.as_ptr(), to.as_ptr(), None) };
```

> — https://raw.githubusercontent.com/oven-sh/bun/main/src/sys/sys_uv.rs (**Quellcode**, `main`-Zweig, abgerufen Okt 2026; Zeilen 377–395, 478–504)

**Antwort auf die Teilfrage:** `fs.fsync`, `fs.fdatasync`, `fs.promises.fsync` (via `FileHandle`), `fs.rename`, `fs.renameSync` sind in Bun implementiert und laufen über libuv. Auf Windows heißt das: `fsync`/`fdatasync` → `FlushFileBuffers`, `rename` → `MoveFileExW(MOVEFILE_REPLACE_EXISTING)` (Belege in Abschnitt 2).

### 1.3 Anstehende Änderung: „Remove libuv on Windows"

Ein offener Bun-PR (Stand Okt 2026) entfernt libuv auf Windows vollständig:

> „Bun no longer links libuv. Windows gets its own event loop on an I/O completion port, and every `uv_*` code path calls Win32/NT itself. The dependency, its fork and its two patches are gone."
> — https://github.com/oven-sh/bun/pull/42819 (**Issue/PR**, dylan-conway, 15.09.2026, weiterhin offen; Review-Kommentare bis 07.10.2026)

Konsequenz für das Projekt: Die heute gültige Aussage „Buns Windows-fsync ist `FlushFileBuffers` über libuv" ist an libuv gekoppelt. Nach diesem PR gilt sie nur noch, solange Bun Windows-seitig Win32/NT mit denselben Semantiken aufruft. Dieser PR enthält außerdem Windows-Benchmarks (z. B. `writeFileSync` 1 KiB: 7 980/s gegen 6 702/s auf main), aber **keine** fsync-Latenzmessungen.

### 1.4 Bekannte Bun-Fehlerberichte zu Flush/Dauerhaftigkeit

Ein Issue behauptete Datenverlust bei `fs.writeFile` mit `O_APPEND`; die Bun-Antwort ist für unser Thema die relevanteste dokumentierte Aussage:

> „Note that neither Node nor Bun calls `fsync`/`fdatasync` in `writeFile`/`appendFile` or on close; `fsync` only matters for surviving a kernel crash or power loss, not a process crash, and a process `SIGKILL` cannot drop pages already written to the page cache."
> — https://github.com/oven-sh/bun/issues/34914 (**Issue**, robobun/Kollaborateur, 21.07.2026, „closed as not planned")

Das ist die zentrale Semantik-Aussage für ein Log: **`writeFile`/`appendFile` sind in Bun keine Durability-Operation.** Wer Dauerhaftigkeit will, muss explizit `fsync`/`fdatasync` aufrufen.

Historisch relevant: `FileHandle` (die Klasse, die `filehandle.sync()` trägt) fehlte in Bun lange — „Yes, FileHandle is not implemented yet." und später „Fixed in #8141", geschlossen am 16.01.2024.
> — https://github.com/oven-sh/bun/issues/3167 (**Issue**, Jarred-Sumner, Juni 2023 – Januar 2024)

Buns eigene `Bun.write`/`FileSink`-Dokumentation macht **keine** Durability-Aussage; `.flush()` wird nur als „write buffer to disk … returns the number of flushed bytes" beschrieben.
> — https://bun.com/docs/api/file-io (**offizielle Doku**)

**Nicht belegt:** eine Bun-Doku-Aussage, dass `FileSink.flush()` oder `Bun.write` Daten dauerhaft auf das Medium schreibt.

---

## 2. Teilfrage 2 — POSIX `rename(2)` vs. Windows `MoveFileExW` / `ReplaceFileW`

### 2.1 POSIX: Atomizität ist spezifiziert

> „If _newpath_ already exists, it will be atomically replaced, so that there is no point at which another process attempting to access _newpath_ will find it missing. However, there will probably be a window in which both _oldpath_ and _newpath_ refer to the file being renamed."
> — https://man7.org/linux/man-pages/man2/rename.2.html (**Manpage/Spec**, Linux man-pages 6.19, Seitendatum 2026-02-08)

Einschränkung von Dan Luu (wichtig für Crash-Konsistenz):

> „rename isn't atomic on crash. POSIX says that rename is atomic, but this only applies to normal operation, not to crashes."
> — https://danluu.com/file-consistency/ (**Blog/Analyse**, „Files are hard", abgerufen Okt 2026)

### 2.2 Windows: `MoveFileExW` und seine Flags

> „**MOVEFILE_REPLACE_EXISTING** 1 (0x1) | If a file named _lpNewFileName_ exists, the function replaces its contents with the contents of the _lpExistingFileName_ file, provided that security requirements regarding access control lists (ACLs) are met."

> „**MOVEFILE_WRITE_THROUGH** 8 (0x8) | The function does not return until the file is actually moved on the disk. Setting this value guarantees that a move performed as a copy and delete operation is flushed to disk before the function returns. The flush occurs at the end of the copy operation. This value has no effect if **MOVEFILE_DELAY_UNTIL_REBOOT** is set."
> — https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw (**offizielle Doku**, Seite zuletzt aktualisiert 01.06.2023 / `ms.date` 2018-12-05)

**Zentrale Beobachtung für unser Projekt:** Die Doku formuliert für `MOVEFILE_WRITE_THROUGH` eine Garantie nur für „a move performed as a **copy and delete** operation" — also den volumenübergreifenden Fall (`MOVEFILE_COPY_ALLOWED`). Für einen gleichvolumigen Rename gibt der Text nur „does not return until the file is actually moved on the disk" her. **Eine ausdrückliche Microsoft-Aussage, dass `MOVEFILE_WRITE_THROUGH` bei einem Rename innerhalb eines Volumes die Verzeichnis-Metadaten durable macht, ist nicht belegt.** Ebenso ist **nicht belegt**, dass Microsoft für `MoveFileExW`/`MOVEFILE_REPLACE_EXISTING` Atomizität garantiert (anders als POSIX, Abschnitt 2.1, wo „atomically replaced" explizit steht).

### 2.3 `ReplaceFileW` als Alternative

> „**REPLACEFILE_WRITE_THROUGH** 0x00000001 | This value is not supported."
> — https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew (**offizielle Doku**, zuletzt aktualisiert 01.06.2023)

Und zur Motivation der Funktion:

> „The **ReplaceFile** function combines several steps within a single function. An application can call **ReplaceFile** instead of calling separate functions to save the data to a new file, rename the original file using a temporary name, rename the new file to have the same name as the original file, and delete the original file. Another advantage is that **ReplaceFile** not only copies the new file data, but also preserves the following attributes of the original file: Creation time, Short file name, Object identifier, DACLs, Security resource attributes, Encryption, Compression, Named streams not already in the replacement file"

Zusätzlich dokumentiert: „The backup file, replaced file, and replacement file must all reside on the same volume." sowie Fehlercodes `ERROR_UNABLE_TO_MOVE_REPLACEMENT` (1176), `ERROR_UNABLE_TO_MOVE_REPLACEMENT_2` (1177), `ERROR_UNABLE_TO_REMOVE_REPLACED` (1175), die belegen, dass `ReplaceFileW` intern ein mehrstufiger Vorgang ist, der scheitern kann.

**Fazit:** `ReplaceFileW` ist für „neue Datei über alte Datei legen" gedacht (Metadaten-/ACL-Erhalt), nicht als Durability-Primitiv. Sein Write-Through-Flag ist laut Microsoft nicht unterstützt.

### 2.4 Was Node's `fs.rename` auf Windows macht

**Node-Dokumentation** (keine Atomizitäts-, keine Durability-Aussage):

> „Asynchronously rename file at `oldPath` to the pathname provided as `newPath`. In the case that `newPath` already exists, it will be overwritten. If there is a directory at `newPath`, an error will be raised instead."
> — https://nodejs.org/api/fs.html (**offizielle Doku**, Node.js v26.11.1) — im abgerufenen Doku-Quelltext (https://raw.githubusercontent.com/nodejs/node/main/doc/api/fs.md, Zeilen 4818–4822)

**libuv-Quellcode** (der eigentliche Windows-Pfad):

```c
static void fs__rename(uv_fs_t* req) {
  if (!MoveFileExW(req->file.pathw, req->fs.info.new_pathw, MOVEFILE_REPLACE_EXISTING)) {
    SET_REQ_WIN32_ERROR(req, GetLastError());
    return;
  }

  SET_REQ_RESULT(req, 0);
}
```

> — https://raw.githubusercontent.com/libuv/libuv/v1.x/src/win/fs.c (**Quellcode**, `v1.x`-Zweig, abgerufen Okt 2026; Zeilen 2340–2347)

**Antwort:** Ja, Node's `fs.rename` nutzt auf Windows `MoveFileExW` — über libuv, mit **ausschließlich** `MOVEFILE_REPLACE_EXISTING`. **Kein** `MOVEFILE_WRITE_THROUGH`, **kein** anschließendes `FlushFileBuffers`.

**Ebenfalls belegt:** libuvs `fsync` und `fdatasync` sind auf Windows **identisch** (beide `FlushFileBuffers`):

```c
static void fs__sync_impl(uv_fs_t* req) {
  ...
  result = FlushFileBuffers(uv__get_osfhandle(fd)) ? 0 : -1;
  ...
}
static void fs__fsync(uv_fs_t* req) { fs__sync_impl(req); }
static void fs__fdatasync(uv_fs_t* req) { fs__sync_impl(req); }
```
> — https://raw.githubusercontent.com/libuv/libuv/v1.x/src/win/fs.c (**Quellcode**, Zeilen 2350–2372)

Daraus folgt: **Bun's `fs.fdatasync` bringt auf Windows keinen Vorteil gegenüber `fs.fsync`** (beide = `FlushFileBuffers`), und **`fs.renameSync`/`fs.rename` in Bun und Node sind auf Windows keine Durability-Operation.**

Zusatzbeleg aus Node für die Flag-Abbildung:

> „`O_SYNC` | Flag indicating that the file is opened for synchronized I/O with write operations waiting for file integrity. On Windows, this maps to `FILE_FLAG_WRITE_THROUGH`."
> — https://nodejs.org/api/fs.html (**offizielle Doku**, Abschnitt „File open constants")

Und im libuv-Quellcode:

```c
  switch (flags & (UV_FS_O_DSYNC | UV_FS_O_SYNC)) {
  ...
  case UV_FS_O_DSYNC:
  case UV_FS_O_SYNC:
    attributes |= FILE_FLAG_WRITE_THROUGH;
```
> — https://raw.githubusercontent.com/libuv/libuv/v1.x/src/win/fs.c (**Quellcode**, Zeilen ~597–604)

(Das ist der Weg, wie `fs.open(path, 'as')` bzw. numerisches `O_DSYNC` in Bun/Node auf Windows zu Write-Through wird — ohne FFI.)

### 2.5 Konkreter Bun-Bezug zu `MoveFileExW`-Problemen unter Windows

Aus dem Bun-Ökosystem, mit direktem Bezug auf `MOVEFILE_WRITE_THROUGH` als Flag:

> „Corporate endpoint-security and filesystem filter drivers can reject Windows `FileRenameInformationEx` / POSIX rename flags with `STATUS_INVALID_PARAMETER`, even for ordinary same-volume lockfile replacements."
> — https://github.com/oven-sh/bun/pull/32001 (**PR**, m3ridian-zero, 08.06.2026; vom Autor später durch Löschen des Branches geschlossen, Nachfolger: PR #33029)

Im Code dieses PRs wurde `MOVEFILE_WRITE_THROUGH` als bekannter, aber nicht abgebildeter Flag benannt; in Bun's Win32-Bindings (`main`) existiert die Konstante, wird in `src/sys/windows/mod.rs` aber **nicht** für Renames verwendet — dort steht `FileInformationClass::FileRenameInformationEx`.
> — https://raw.githubusercontent.com/oven-sh/bun/main/src/sys/windows/mod.rs (**Quellcode**, Zeilen 132–133 und 1858; abgerufen Okt 2026)

**Praktische Konsequenz:** Renames auf Windows können in Unternehmensumgebungen (EDR/AV-Filtertreiber) fehlschlagen. Ein Design, in dem Rename der Dauerhaftigkeits-Anker ist, hat dort eine zusätzliche Fehlerquelle.

---

## 3. Teilfrage 3 — Windows-Dauerhaftigkeit allgemein

### 3.1 `FlushFileBuffers`

> „Typically the **WriteFile** and **WriteFileEx** functions write data to an internal buffer that the operating system writes to a disk or communication pipe on a regular basis. The **FlushFileBuffers** function writes all the buffered information for a specified file to the device or pipe."
> — https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers (**offizielle Doku**, zuletzt aktualisiert 13.10.2021)

Zur Effizienz und zur empfohlenen Alternative:

> „Due to disk caching interactions within the system, the **FlushFileBuffers** function can be inefficient when used after every write to a disk drive device when many writes are being performed separately. If an application is performing multiple writes to disk and also needs to ensure critical data is written to persistent media, the application should use unbuffered I/O instead of frequently calling **FlushFileBuffers**."
> — ebd.

Der einzige dokumentierte Massen-Flush ist volumenweit und braucht Admin-Rechte:

> „To flush all open files on a volume, call **FlushFileBuffers** with a handle to the volume. The caller must have administrative privileges."
> — ebd.

### 3.2 Metadaten: die entscheidende Microsoft-Aussage

> „File system metadata is always cached. Therefore, to store any metadata changes to disk, the file must either be flushed or be opened with **FILE_FLAG_WRITE_THROUGH**."
> — https://learn.microsoft.com/en-us/windows/win32/fileio/file-caching (**offizielle Doku**, „File Caching", zuletzt aktualisiert 07.01.2021)

Damit ist für unser Problem dokumentiert: **Metadaten (und damit der Verzeichniseintrag / die Dateigröße) sind auf Windows immer gecacht und werden nur durch Flush oder Write-Through persistiert.** Ob ein `FlushFileBuffers` auf dem **Datei**-Handle ausreicht, um die Verzeichnis-Metadaten (Größe/Name im Verzeichniseintrag) durable zu machen, sagt Microsoft an dieser Stelle **nicht** — es sagt nur, dass Metadatenänderungen geflusht werden müssen. Eine ausdrückliche Aussage „FlushFileBuffers auf der Datei reicht für den Verzeichniseintrag" bzw. „reicht nicht" ist **nicht belegt**.

Weitere relevante Aussage derselben Seite:

> „With write-through caching enabled, data is still written into the cache, but the cache manager writes the data immediately to disk rather than incurring a delay by using the lazy writer. A process can also force a flush of a file it has opened by calling the **FlushFileBuffers** function."

Und zum `FILE_FLAG_NO_BUFFERING`-Pfad:

> „When caching is disabled, all read and write operations directly access the physical disk. However, the file metadata may still be cached. To flush the metadata to disk, use the **FlushFileBuffers** function."
> — https://learn.microsoft.com/en-us/windows/win32/fileio/file-caching (**offizielle Doku**)

### 3.3 `CreateFile`-Flags

> „**FILE_FLAG_WRITE_THROUGH** 0x80000000 | Write operations will not go through any intermediate cache, they will go directly to disk."

> „**FILE_FLAG_NO_BUFFERING** 0x20000000 | The file or device is being opened with no system caching for data reads and writes. This flag does not affect hard disk caching or memory mapped files. There are strict requirements for successfully working with files opened with **CreateFile** using the **FILE_FLAG_NO_BUFFERING** flag …"
> — https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew (**offizielle Doku**, zuletzt aktualisiert 09.02.2023)

Und im `FlushFileBuffers`-Doc als Kombinationsempfehlung:

> „To open a file for unbuffered I/O, call the **CreateFile** function with the **FILE_FLAG_NO_BUFFERING** and **FILE_FLAG_WRITE_THROUGH** flags. This prevents the file contents from being cached and flushes the metadata to disk with each write."
> — https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers (**offizielle Doku**)

**Das ist die stärkste Microsoft-Formulierung im gesamten Korpus:** „flushes the **metadata** to disk with each write" — also die Kombination `FILE_FLAG_NO_BUFFERING | FILE_FLAG_WRITE_THROUGH`.

Die Alignment-Preise dafür stehen in der File-Buffering-Doku:

> „File access sizes, including the optional file offset in the **OVERLAPPED** structure, if specified, must be for a number of bytes that is an integer multiple of the volume sector size. For example, if the sector size is 512 bytes, an application can request reads and writes of 512, 1,024, 1,536, or 2,048 bytes, but not of 335, 981, or 7,171 bytes."
> — https://learn.microsoft.com/en-us/windows/win32/fileio/file-buffering (**offizielle Doku**, zuletzt aktualisiert 31.05.2025)

Praxishinweis: Der Artikel weist darauf hin, dass „the file metadata may still be cached" und dass Diskussionen über Caching „any hardware caching on the physical disk itself" nicht abdecken.

### 3.4 Verzeichnis-fsync auf Windows

Aus einem offenen Issue der WASI-Spezifikation (Autor: Dan Gohman/sunfishcode, Bytecode Alliance):

> „In POSIX circles, which WASI generally tries to follow, there are some use cases for fsyncing a directory, to ensure that a file's directory entry has been written to storage. However, on Windows, there's `FlushFileBuffers` for syncing files to storage, but it only works on files. There doesn't appear to be a way to do this for directories."
> — https://github.com/WebAssembly/WASI/issues/756 (**Issue/Spec-Diskussion**, 11.01.2023 – 20.08.2026, offen)

Und der einzige bekannte Umweg:

> „For completeness, it's also possible to call `FlushFileBuffers` on a volume handle, however that requires administrator access."
> — ebd. (Kommentar sunfishcode, 01.02.2023)

**Ergebnis:** Ein Verzeichnis-`fsync`-Äquivalent existiert auf Windows nur als volumenweiter Flush mit Admin-Rechten. Für eine Anwendung ohne Admin-Rechte ist das keine Option.

**Gegenposition / Nuance:** `MOVEFILE_WRITE_THROUGH` wird in der Praxis oft genau als Ersatz dafür verwendet. Ein Stack-Overflow-Antwortender argumentiert genau so („in case of `MoveFileExA(src_path,dst_path,flags)`, I can provide the `MOVEFILE_WRITE_THROUGH` flag, which on the one hand achieves the durability of renaming, on the other is a proof that the problem, in general, applies to Windows as well") — das ist **eine Nutzer-Meinung, nicht Microsoft-Dokumentation**; der Autor sagt selbst „Now how that works in combination with a rename - I can only guess."
> — https://stackoverflow.com/questions/78040177/do-i-have-to-flush-a-directory-on-windows (**Forum/Q&A**, Frage 2024, Antwort abgerufen über die Stack-Exchange-API, Okt 2026)

### 3.5 Dan Luu, „Files are hard" — die kanonische Sequenz

> „That should prevent corruption on any Linux filesystem, but if we want to make sure that the file actually contains "bar", we need another fsync at the end."
> (im Kontext der Sequenz `creat` → `write` → `fsync(log)` → **`fsync(dir)`** → `pwrite(orig)` → `fsync(orig)` → `unlink(log)` → `fsync(dir)`)

> „That results in consistent behavior and guarantees that our operation actually modifies the file after it's completed, as long as we assume that `fsync` actually flushes to disk. OS X and some versions of ext3 have an fsync that doesn't really flush to disk."

> „The most common class of error was incorrectly assuming ordering between syscalls. The next most common class of error was assuming that syscalls were atomic."

> „Since that doesn't exist yet, when no existing library is sufficient, you need to checksum your data since you will get silent errors and corruption. The only questions are whether or not you detect the errors and whether or not your record format only destroys a single record when corruption happens, or if it destroys the entire database."
> — https://danluu.com/file-consistency/ (**Blog/Analyse**, „Files are hard", abgerufen Okt 2026; referenziert Pillai et al., OSDI '14)

### 3.6 apeiro / transactional.blog

Die von apeiro betriebene Seite `transactional.blog` enthält **keine Windows-fsync-Analyse**. Beleg: Der vollständige Blog-Index (abgerufen Okt 2026) listet zum Thema Dauerhaftigkeit nur „Darwin's Deceptive Durability" (2022-06-05) und „Torn Write Detection and Protection" (2025-04-12); ein Windows-Artikel fehlt.
> — https://transactional.blog/ (**Blog-Index**, abgerufen Okt 2026)

Der enthaltene, für uns relevante Punkt ist die macOS-Analogie (zeigt, dass Plattform-Doku und Realität auseinanderfallen können):

> „Note that while fsync() will flush all data from the host to the drive (i.e. the "permanent storage device"), the drive itself may not physically write the data to the platters for quite some time and it may be written in an out-of-order sequence."

> „However, darwin silently downgrades this to only `O_DIRECT`. There is no workaround. One must use O_FULLFSYNC instead."
> — https://transactional.blog/blog/2022-darwins-deceptive-durability (**Blog**, 05.06.2022)

**Nicht belegt:** eine apeiro/transactional.blog-Aussage speziell zu Windows `FlushFileBuffers` oder `MOVEFILE_WRITE_THROUGH`.

---

## 4. Teilfrage 4 — SQLite über Dauerhaftigkeit

### 4.1 `atomiccommit.html`

Zu Windows und zu fsync im Allgemeinen:

> „SQLite uses the fsync() system call on Unix and the FlushFileBuffers() system call on w32 in order to sync the file system buffers onto disk oxide as shown in step 3.7 and step 3.10. Unfortunately, we have received reports that neither of these interfaces works as advertised on many systems. We hear that FlushFileBuffers() can be completely disabled using registry settings on some Windows versions."

> „We are told that the flush and fsync primitives are broken on some versions of Windows and Linux. This is unfortunate. It opens SQLite up to the possibility of database corruption following a power loss in the middle of a commit. However, there is nothing that SQLite can do to test for or remedy the situation. SQLite assumes that the operating system that it is running on works as advertised. If that is not quite the case, well then hopefully you will not lose power too often."
> — https://sqlite.org/atomiccommit.html (**offizielle Doku**, Seite zuletzt aktualisiert 2026-04-21)

Zum Verzeichnis-Sync (direkt relevant für unsere Frage):

> „Sometimes a power failure will cause a filesystem to be corrupted such that recently changed filenames are forgotten and the file is moved into a "/lost+found" directory. When that happens, the hot journal will not be found and recovery will not occur. SQLite tries to prevent this by opening and syncing the directory containing the rollback journal at the same time it syncs the journal file itself."
> — ebd.

Und zur Annahme über Dateigröße vs. Inhalt (Append-Semantik — genau unser Fall):

> „SQLite assumes that when a file grows in length that the new file space originally contains garbage and then later is filled in with the data actually written. In other words, SQLite assumes that the file size is updated before the file content. This is a pessimistic assumption and SQLite has to do some extra work to make sure that it does not cause database corruption if power is lost between the time when the file size is increased and when the new content is written."
> — ebd.

Optimierung, die genau dann greift, wenn Append sicher ist (`SQLITE_IOCAP_SAFE_APPEND`) — und die laut SQLite **für Windows nicht** angenommen wird:

> „The current implementation, however, makes no such assumptions for the default VFSes for Windows and Unix."
> — ebd.

### 4.2 `wal.html`

> „WAL uses many fewer fsync() operations and is thus less vulnerable to problems on systems where the fsync() system call is broken."

> „Note that with [PRAGMA synchronous](…) set to NORMAL, the checkpoint is the only operation to issue an I/O barrier or sync operation (fsync() on unix or FlushFileBuffers() on windows)."

> „Write transactions are very fast since they only involve writing the content once (versus twice for rollback-journal transactions) and because the writes are all sequential. Further, syncing the content to the disk is not required, as long as the application is willing to sacrifice durability following a power loss or hard reboot."
> — https://sqlite.org/wal.html (**offizielle Doku**, Seite zuletzt aktualisiert 2026-08-25)

**Das ist das Vorbild für ein Append-only-JSONL-Log:** SQLite WAL schreibt nur sequenziell an das Ende und macht den Commit durch einen Commit-Record am Ende; synct wird bei `synchronous=FULL` pro Transaktion.

### 4.3 `PRAGMA synchronous` — die Stufen und was sie kosten

> „**EXTRA** (3) | EXTRA synchronous is like FULL with the addition that the directory containing a rollback journal is synced after that journal is unlinked to commit a transaction in DELETE mode. EXTRA provides additional durability if the commit is followed closely by a power loss. Without EXTRA, depending on the underlying filesystem, it is possible that a single transaction that commits right before a power loss might get rolled back upon reboot. The database will not go corrupt. But the last transaction might go missing, thus violating durability, if EXTRA is not set. EXTRA is no different from FULL in WAL mode."

> „**FULL** (2) | When synchronous is FULL (2), the SQLite database engine will use the xSync method of the VFS to ensure that all content is safely written to the disk surface prior to continuing. This ensures that an operating system crash or power failure will not corrupt the database."

> „FULL might also be durable using a rollback journal, depending on the underlying filesystem. FULL is not necessarily durable across a power loss in rollback mode, so if durability is desired, it is best to set the synchronous mode to EXTRA."

Und die Matrix:

| | Rollback Mode | WAL Mode |
| --- | --- | --- |
| EXTRA | ACID | ACID |
| FULL | Maybe not durable | ACID |
| NORMAL | Maybe not consistent | Maybe not durable |
| OFF | Not consistent | Not consistent |

> — https://sqlite.org/pragma.html#pragma_synchronous (**offizielle Doku**, Seite zuletzt aktualisiert 2026-10-04)

**Wichtig für unser Projekt:** SQLite hält fest, dass `fsync` auf die **Datei** (FULL) nicht zwingend Dauerhaftigkeit liefert, sondern erst der **Verzeichnis-Sync** (EXTRA) sie herstellt — und zwar genau dann, wenn das Journal per `unlink` entfernt wird (Metadatenänderung). Für ein Append-only-Log ohne unlink/rename ist dieser Verzeichnis-Sync nicht nötig; nötig wird er, sobald ein Rename oder eine Dateianlage im Spiel ist.

### 4.4 „Powersafe Overwrite"

> „We say that a system has the powersafe overwrite property if the following statement is true: **When an application writes a range of bytes in a file, no bytes outside of that range will change, even if the write occurs just before a crash or power failure.**"

> „SQLite never assumes that database page writes are atomic, regardless of the PSOW setting."
> — https://sqlite.org/psow.html (**offizielle Doku**, zuletzt aktualisiert 2025-05-31)

Für ein Append-only-JSONL-Log heißt das: PSOW ist die Eigenschaft, die das Risiko „ein Append zerstört benachbarte Records" adressiert; SQLite setzt sie für Windows-Standard-VFS standardmäßig **an** (ab 3.7.10), verlässt sich aber nicht darauf für Atomizität.

---

## 5. Teilfrage 5 — Wie etablierte Systeme es lösen

### 5.1 LevelDB (Google)

> „By default, each write to leveldb is asynchronous: it returns after pushing the write from the process into the operating system. The transfer from operating system memory to the underlying persistent storage happens asynchronously. The sync flag can be turned on for a particular write to make the write operation not return until the data being written has been pushed all the way to persistent storage. (On Posix systems, this is implemented by calling either `fsync(...)` or `fdatasync(...)` or `msync(..., MS_SYNC)` before the write operation returns.)"

> „Asynchronous writes are often more than a thousand times as fast as synchronous writes. The downside of asynchronous writes is that a crash of the machine may cause the last few updates to be lost. Note that a crash of just the writing process (i.e., not a reboot) will not cause any loss since even when sync is false, an update is pushed from the process memory into the operating system before it is considered done."
> — https://github.com/google/leveldb/blob/main/doc/index.md (**offizielle Doku/README**, abgerufen Okt 2026)

**Relevanz:** Die „mehr als tausendfach"-Aussage ist eine dokumentierte Größenordnung (ohne absolute ms). Und: „a crash of just the writing process … will not cause any loss" — dieselbe Aussage, die Bun für `writeFile` macht (Abschnitt 1.4).

Zur bekannt gewordenen Unzuverlässigkeit von LevelDB unter Crash-Bedingungen:

> „The authors find issues with most of the applications tested, including things you'd really hope would work, like LevelDB, HDFS, Zookeeper, and git."
> — https://danluu.com/file-consistency/ (**Blog/Analyse**, referenziert Pillai et al., OSDI '14)

### 5.2 RocksDB (Meta)

> „When `WriteOptions.sync = false` (the default), WAL writes are not synchronized to disk. … In this mode, the WAL write is not crash safe."

> „When `WriteOptions.sync = true`, the WAL file is fsync'ed before returning to the user."

Gruppen-Commit:

> „As most other systems relying on logs, RocksDB supports **group commit** to improve WAL writing throughput, as well as write amplification. RocksDB's group commit is implemented in a naive way: when different threads are writing to the same DB at the same time, all outstanding writes that qualify to be combined will be combined together and write to WAL once, with one fsync. In this way, more writes can be completed by the same number of I/Os."

Und die Kostenrechnung pro fsync (Append + Größenänderung → 2 I/Os):

> „If `Options.recycle_log_file_num = false` (the default). RocksDB always create new files for new WAL segments. Each WAL write will change both of data and size of the file, so every fsync will generate at least two I/Os, one for data and one for metadata. Note that RocksDB calls fallocate() to reserve enough space for the file, but it doesn't prevent the metadata I/O in fsync."

> „When writes are small, because complete block/page might need to be updated, we may end up with two 4KB writes (one for data and one for metadata) even if the write is very small. If write is only 40 bytes, 8KB is updated, the write amplification is 8 KB/40 bytes ~= 200."
> — https://github.com/facebook/rocksdb/wiki/WAL-Performance (**offizielle Wiki-Doku**, letzte Bearbeitung 15.10.2020)

**Direkt übertragbar:** Präallokation der Log-Datei (`fallocate` bzw. auf Windows `SetEndOfFile`/`FileValidData`) reduziert die Metadaten-I/O pro fsync, weil die Dateigröße konstant bleibt.

### 5.3 etcd (WAL + Raft)

> „Consensus performance, especially commit latency, is limited by two physical constraints: network IO latency and disk IO latency. The minimum time to finish an etcd request is the network Round Trip Time (RTT) between members, plus the time `fdatasync` requires to commit the data to permanent storage. The RTT within a datacenter may be as long as several hundred microseconds. … **The typical fdatasync latency for a spinning disk is about 10ms. For SSDs, the latency is often lower than 1ms.**"

> „To increase throughput, etcd batches multiple requests together and submits them to Raft. This batching policy lets etcd attain high throughput despite heavy load."

Referenzmessung (offizielle Doku, 3-Knoten-Cluster auf GCE-SSDs, etcd 3.2.0):

| Keys | Key/Value-Bytes | Conns/Clients | Ø Write-QPS | Ø Latenz/Request |
| --- | --- | --- | --- | --- |
| 10 000 | 8 / 256 | 1 / 1 | 583 | 1,6 ms |
| 100 000 | 8 / 256 | 100 / 1000 | 44 341 | 22 ms |
| 100 000 | 8 / 256 | 100 / 1000 (alle Member) | 50 104 | 20 ms |

> — https://etcd.io/docs/v3.6/op-guide/performance/ (**offizielle Doku**, zuletzt geändert 17.04.2023)

**Das ist die belastbarste Zahlenquelle dieser Recherche:** ~10 ms fdatasync auf HDD, < 1 ms auf SSD, und der Beleg, dass **Batching** (Gruppen-Commit) der Hebel ist: 583 QPS bei einem Client → 44 341 QPS bei 1000 Clients, weil sich viele Requests einen fdatasync teilen.

### 5.4 PostgreSQL

Konfigurationsdoku zu Dauerhaftigkeit und Gruppen-Flush:

> „If this parameter is on, the PostgreSQL server will try to make sure that updates are physically written to disk, by issuing `fsync()` system calls or various equivalent methods (see wal_sync_method). This ensures that the database cluster can recover to a consistent state after an operating system or hardware crash."

Synctechniken, inklusive Write-Through-Variante:

> „`wal_sync_method` (enum) | Method used for forcing WAL updates out to disk. … Possible values are: `open_datasync` (write WAL files with `open()` option `O_DSYNC`); `fdatasync` (call `fdatasync()` at each commit); `fsync` (call `fsync()` at each commit); `fsync_writethrough` (call `fsync()` at each commit, forcing write-through of any disk write cache); `open_sync` (write WAL files with `open()` option `O_SYNC`). Not all of these choices are available on all platforms."

> „`commit_delay` (integer) | Setting `commit_delay` adds a time delay before a WAL flush is initiated. This can improve group commit throughput by allowing a larger number of transactions to commit via a single WAL flush …"
> — https://www.postgresql.org/docs/current/runtime-config-wal.html (**offizielle Doku**, PostgreSQL 18, Seite publiziert 2026-08-13)

**„fsyncgate" (2018):** Der archivierte Mailinglisten-Thread (pgsql-hackers, 28.–29.03.2018, dokumentiert von Dan Luu):

> „TL;DR: Pg should PANIC on fsync() EIO return. Retrying fsync() is not OK at least on Linux. When fsync() returns success it means "all writes since the last fsync have hit disk" but we assume it means "all writes since the last SUCCESSFUL fsync have hit disk"." (Craig Ringer)
> „The retries are the source of the problem ; the first fsync() can return EIO, and also _clears the error_ causing a 2nd fsync (of the same data) to return success." (Justin Pryzby)
> — https://danluu.com/fsyncgate/ (**Archiv eines Mailinglisten-Threads**, Originaldaten 2018-03-28/29; abgerufen Okt 2026)

**Lehre für unser Log:** Ein `fsync`-Fehler darf **nicht** wegretryt werden. Wenn ein Flush fehlschlägt, ist der einzige sichere Weg: Zustand als beschädigt markieren und aus dem letzten bekannten guten Zustand neu aufbauen. Für ein JSONL-Log heißt das: Log als bis zum letzten validen Record gültig behandeln und den Fehler nach oben propagieren (fail loud), nicht schlucken.

### 5.5 Litestream

> „SQLite must call `fsync()` to flush data to disk to ensure transactions are durable. While in WAL journaling mode, fsync calls can be relaxed in exchange for durability without risking data corruption. To do this, you can change the `synchronous` mode to `NORMAL` (it typically defaults to `FULL`) … This mode will ensure that the `fsync()` calls are only called when the WAL becomes full and has to checkpoint to the main database file. This is safe as the WAL file is append only."

> „Litestream performs _asynchronous replication_ which means that changes are replicated out-of-band from the transaction that wrote the changes. … By default, Litestream will replicate new changes to an S3 replica every second. During this time where data has not yet been replicated, a catastrophic crash on your server will result in the loss of data in that time window. … Synchronous replication is on the Litestream roadmap but has not yet been implemented."
> — https://litestream.io/tips/ (**offizielle Doku**, abgerufen Okt 2026)

Beide Zitate sind für unser Projekt zentral: (a) „This is safe as the WAL file is append only" — die Append-only-Eigenschaft rechtfertigt reduzierte fsync-Frequenz **im Hinblick auf Korruption**, nicht im Hinblick auf Dauerhaftigkeit; (b) ein Sekundenfenster explizit als Datenverlust-Fenster zu benennen ist die ehrliche Alternative zu „wir syncen jeden Record".

### 5.6 LiteFS

> „LiteFS is a distributed file system that transparently replicates SQLite databases. You can run your application like it's running against a local on-disk SQLite database but behind the scenes the database is replicated to all the nodes in your cluster."

> „**Important:** We are not able to provide support or guidance for this product. Use with caution. … The Fly Proxy's autoscaler can shut down or restart Machines without any awareness of LiteFS lease ownership or data freshness, which can result in a stale machine winning the lease and LiteFS discarding newer changes and LTX file data—risking rollback and data loss."

> „LiteFS is stable and running in production environments. The project is still pre-1.0 so APIs may change and features could be removed. Please remember that all software has bugs so we recommend you set up regular off-site backups in case of malfunction or disk corruption."
> — https://fly.io/docs/litefs/ (**offizielle Doku**, abgerufen Okt 2026)

**Keine** Aussage von LiteFS über Windows-Dauerhaftigkeitssemantik gefunden — **nicht belegt**. LiteFS ist ein FUSE-Dateisystem auf Linux (aus der Doku-Charakterisierung ableitbar), kein Windows-Fall.

---

## 6. Teilfrage 6 — Kernfrage: Reicht `fsync`(Datei) + `fsync`(Verzeichnis)?

### 6.1 POSIX: ja, und der Verzeichnis-Sync ist der Punkt

- **Datei-Sync** persistiert den Inhalt (und bei `fsync` auch die Datei-Metadaten).
- **Verzeichnis-Sync** persistiert den *Namen* und den *Verzeichniseintrag*.
- Belege: man7 `rename(2)` (Atomizität des Ersetzens), Dan Luus Sequenz mit `fsync(/dir)`, SQLites `EXTRA` („the directory containing a rollback journal is synced after that journal is unlinked"), SQLites „opening and syncing the directory containing the rollback journal at the same time it syncs the journal file itself".
- Für ein reines **Append** an eine bereits existierende Datei ohne Namensänderung ist kein Verzeichnis-Sync nötig — der Verzeichniseintrag ändert sich nicht. Nötig wird er bei: Datei-Neuanlage, `rename`/atomarem Replace, `unlink`.

### 6.2 Windows: Der Verzeichnis-Sync fehlt als API — aber `MOVEFILE_WRITE_THROUGH` ist kein bewiesener Ersatz

Belegt ist:

| Frage | Status |
| --- | --- |
| `FlushFileBuffers` auf Datei = analog `fsync` | **belegt** (Microsoft-Doc; libuv nutzt es für `fsync`/`fdatasync`; SQLite nennt es „on w32") |
| `FlushFileBuffers` auf Datei ist „inefficient when used after every write" | **belegt** (Microsoft-Doc) |
| Write-Through (`FILE_FLAG_WRITE_THROUGH`) schreibt sofort, nicht lazy | **belegt** (Microsoft Doc „File Caching") |
| Metadaten sind immer gecacht und müssen geflusht werden | **belegt** („File system metadata is always cached. Therefore, to store any metadata changes to disk, the file must either be flushed or be opened with FILE_FLAG_WRITE_THROUGH.") |
| `FILE_FLAG_NO_BUFFERING \| FILE_FLAG_WRITE_THROUGH` „flushes the metadata to disk with each write" | **belegt** (FlushFileBuffers-Doc) — hat aber Sector-Alignment-Zwang |
| Verzeichnis-`fsync` möglich | **nur volumenweit/admin**, oder gar nicht — belegt durch WASI-Issue und Microsoft-Doku (kein Verzeichnis-Handle-Flush dokumentiert) |
| `MOVEFILE_WRITE_THROUGH` garantiert Flush beim *Rename im selben Volume* | **nicht belegt** — Microsofts Garantie-Formulierung gilt für den „copy and delete"-Fall |
| `MoveFileExW`/`MOVEFILE_REPLACE_EXISTING` ist atomar | **nicht belegt** — Microsoft verwendet das Wort nicht; POSIX tut es |
| `ReplaceFileW` hilft bei Dauerhaftigkeit | **widerlegt für Write-Through**: „REPLACEFILE_WRITE_THROUGH … This value is not supported." |

**Antwort:** Auf Windows ist `MOVEFILE_WRITE_THROUGH` **kein bewiesener Ersatz** für einen Verzeichnis-fsync. Es ist eine dokumentierte, aber auf den Copy-and-Delete-Fall zugeschnittene Zusatzgarantie. Der einzige dokumentierte Weg, auf Windows Metadaten pro Write zu persistieren, ist die Kombination `FILE_FLAG_NO_BUFFERING | FILE_FLAG_WRITE_THROUGH` (mit Sector-Alignment-Zwang) — ein Kosten-/Komplexitätskompromiss, den ein JSONL-Log mit variablen Record-Längen kaum sauber einhalten kann, oder `FlushFileBuffers` auf dem Datei-Handle nach jedem Batch.

### 6.3 Kostenunterschied mit Zahlen

**Belegte Zahlen:**

| Quelle | Aussage |
| --- | --- |
| etcd-Doku | „The typical fdatasync latency for a spinning disk is about 10ms. For SSDs, the latency is often lower than 1ms." |
| etcd-Doku (Benchmark) | 583 Ø-Write-QPS / 1,6 ms Latenz bei 1 Client → 44 341 QPS / 22 ms bei 1000 Clients (Batching) |
| LevelDB-Doku | „Asynchronous writes are often more than a thousand times as fast as synchronous writes." |
| RocksDB-Doku | Ein kleiner Sync-Write kann 2 × 4 KiB I/O erzeugen: „8 KB/40 bytes ~= 200" Write-Amplification |
| SQLite-Doku (`atomiccommit`) | Cache-Spill „causes extra disk flush or fsync operations to occur and these operations are slow, hence a cache spill can seriously reduce performance" |
| PostgreSQL-Doku | `fsync_writethrough` = „`fsync()` at each commit, forcing write-through of any disk write cache" (als eigene, teurere Option gelistet) |

**Windows-spezifische Messung (einzige gefundene mit Zahlen — Einzelmessung eines Nutzers, 5400-rpm-HDD, ~11 ms Random Access, zwei Renames pro Schleife):**

```
Benchmark                                         Time             CPU   Iterations
BM_winapi_metadata_rename_and_flush            45.0 ms        0.156 ms          100
BM_winapi_metadata_norename_and_flush         0.256 ms        0.055 ms        36492
BM_winapi_metadata_rename_without_flush       0.297 ms        0.188 ms         3733
```

Erläuterung des Autors: „A typical commit on my HDD always took like ~22ms, so that's exactly the ~45ms we see here. When there is no rename, the Windows file cache manager seems to notice that and ignore the flush, so the speed ends up similar to the case of renames without flushes. The flush method used is `FlushFileBuffers()` applied to a file handle opened (after rename) via `CreateFileA(GENERIC_WRITE, 0, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL)`. The WRITE access is important here. No files writes are done."
> — https://stackoverflow.com/questions/78040177/do-i-have-to-flush-a-directory-on-windows (**Forum/Q&A**, abgerufen über die Stack-Exchange-API, Okt 2026)

**Wie belastbar ist das?** Es zeigt: Auf diesem System kostet die Kombination „Rename + Flush" ~45 ms, während ein Flush ohne vorausgehenden Rename de facto kostenlos war (der Cache-Manager übersprang ihn). Der Autor selbst ist unsicher, ob die Interpretation trägt („I can only guess"). Als Bestätigung der Größenordnung (10–50 ms pro echtem Flush auf HDD) passt es zu etcds „about 10ms", ist aber keine belastbare Benchmark-Studie.

**Nicht belegt:**
- Keine offizielle Microsoft-Benchmark-Zahl zur `FlushFileBuffers`-Latenz gefunden.
- Keine Messung gefunden, die `MoveFileExW` **mit** vs. **ohne** `MOVEFILE_WRITE_THROUGH` auf derselben Maschine vergleicht.
- Keine Messung gefunden, die `FlushFileBuffers` (Datei) gegen `FlushFileBuffers` (Verzeichnis/Volume) vergleicht.
- Keine Bun-/Node-Benchmark-Zahl für `fs.fsync`-Latenz auf Windows gefunden (auch nicht im libuv-Entfernungs-PR #42819).

---

## 7. Was ausdrücklich **nicht belegt** ist

1. Keine Bun-Doku-Aussage, die `fsync`/`fdatasync`/`rename` namentlich als „fully implemented" ausweist (nur die `node:fs`-Blockaussage).
2. Keine Microsoft-Aussage, dass `FlushFileBuffers` auf ein **Verzeichnis**-Handle wirkt — es gibt nur den volumenweiten Flush (Admin-Rechte).
3. Keine Microsoft-Aussage, ob ein Datei-Flush die Verzeichnis-Metadaten (Größe/Name im Verzeichniseintrag) durable macht oder nicht.
4. Keine Microsoft-Aussage, dass `MOVEFILE_WRITE_THROUGH` bei gleichvolumigen Renames die Verzeichnis-Metadaten durable macht.
5. Keine Microsoft-Aussage über **Atomizität** von `MoveFileExW` / `MOVEFILE_REPLACE_EXISTING` (POSIX sagt das für `rename` ausdrücklich).
6. Keine Windows-spezifische fsync-Analyse von apeiro/transactional.blog (nur macOS).
7. Keine belastbare, reproduzierbare Windows-Benchmark-Studie zu `MOVEFILE_WRITE_THROUGH` (nur die Einzelmessung oben und die HDD-SO-Frage zur Write-I/O-Performance, die nicht abrufbar war).
8. Keine Aussage von LiteFS zu Windows-Semantik.
9. `koffi` selbst wurde in dieser Recherche nicht untersucht (nicht Teil des Auftrags).

---

## 8. Empfehlungen für das Append-only-JSONL-Log

1. **Durability-Anker = Datei-Flush, nicht Rename.** Auf beiden Plattformen: `write` → `fsync(fd)`. Auf Windows ist das `FlushFileBuffers` (durch Bun's libuv-`fsync`). Der `koffi`-`MoveFileExW(MOVEFILE_WRITE_THROUGH)`-Pfad sollte **nicht** die einzige Dauerhaftigkeitsmaßnahme sein.
2. **Verzeichnis-Sync plattformabhängig.** POSIX: nach Neuanlage/Rename eines Log-Segments `fsync` auf das Verzeichnis (Bun: `fs.open(dir)` + `fsync`, auf Linux möglich). Windows: kein Äquivalent ohne Admin — dort ist Rename+Write-Through die best-effort-Variante, und der Fall „Log-Segment wird rotiert" sollte so gestaltet werden, dass ein verlorener Verzeichniseintrag nur ein Segment betrifft, nicht das ganze Log.
3. **`MOVEFILE_WRITE_THROUGH` als Defense-in-Depth behalten, aber nicht als Garantie dokumentieren.** Begründung: Microsofts Garantietext deckt den Copy-and-Delete-Fall ab; für den Rename ist sie unbelegt. Ehrliche Kommentierung im Code: „best effort, keine dokumentierte Garantie".
4. **Gruppen-Commit / Batching statt fsync pro Record.** etcd (583 → 44 341 QPS) und RocksDB („group commit") zeigen den Hebel. Für ein Session-Log: fsync pro *Batch* oder pro Kurzintervall (vgl. Litestreams 1-Sekunden-Fenster und PG `commit_delay`).
5. **Präallokation** des Log-Segments (RocksDB: `fallocate` reduziert Metadaten-I/O pro fsync), damit die Dateigröße nicht pro Append geändert werden muss.
6. **Checksummen pro Record/Zeile** (SQLite/Dan Luu: „you need to checksum your data since you will get silent errors and corruption"). Bei einem Append-only-Log begrenzt das die Blast-Radius auf einen Record statt auf die ganze Datei.
7. **fsync-Fehler = fatal, kein Retry.** Direkt aus fsyncgate: nach einem Flush-Fehler ist der Zustand nicht vertrauenswürdig; Log abschneiden auf den letzten validen Record und den Fehler melden.
8. **`fs.fdatasync` auf Windows bringt nichts gegenüber `fs.fsync`** (beide sind `FlushFileBuffers` über libuv) — die API-Wahl ist dort irrelevant für die Kosten.
9. **Bun-Update im Auge behalten:** PR #42819 („Remove libuv on Windows") ändert den Windows-Pfad fundamental; danach muss die Annahme „Bun-Windows-fsync == FlushFileBuffers" neu geprüft werden.

---

## 9. Abgerufene Quellen (Typ · Datum · URL)

**Offizielle Doku**

1. Bun — Node.js Compatibility (`node:fs` „Fully implemented. 98% of Node.js's test suite passes") · abgerufen Okt 2026 · https://bun.com/docs/runtime/nodejs-apis
2. Bun — File I/O (`Bun.file`, `Bun.write`, `FileSink`) · abgerufen Okt 2026 · https://bun.com/docs/api/file-io
3. Microsoft Learn — `MoveFileExW` (Flags, Remark) · Seite aktualisiert 01.06.2023 · https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw
4. Microsoft Learn — `FlushFileBuffers` · aktualisiert 13.10.2021 · https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers
5. Microsoft Learn — `ReplaceFileW` (`REPLACEFILE_WRITE_THROUGH` „not supported") · aktualisiert 01.06.2023 · https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew
6. Microsoft Learn — `CreateFileW` (`FILE_FLAG_WRITE_THROUGH`, `FILE_FLAG_NO_BUFFERING`) · aktualisiert 09.02.2023 · https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew
7. Microsoft Learn — File Caching („File system metadata is always cached…") · aktualisiert 07.01.2021 · https://learn.microsoft.com/en-us/windows/win32/fileio/file-caching
8. Microsoft Learn — File Buffering (Alignment-Anforderungen) · aktualisiert 31.05.2025 · https://learn.microsoft.com/en-us/windows/win32/fileio/file-buffering
9. Node.js — `fs` API-Doku (v26.11.1) · abgerufen Okt 2026 · https://nodejs.org/api/fs.html
10. Node.js — `doc/api/fs.md` (Quelltext der Doku) · abgerufen Okt 2026 · https://raw.githubusercontent.com/nodejs/node/main/doc/api/fs.md
11. Linux man-pages — `rename(2)` (Atomizität) · man-pages 6.19, Seitendatum 2026-02-08 · https://man7.org/linux/man-pages/man2/rename.2.html
12. SQLite — Atomic Commit In SQLite · zuletzt aktualisiert 2026-04-21 · https://sqlite.org/atomiccommit.html
13. SQLite — Write-Ahead Logging · zuletzt aktualisiert 2026-08-25 · https://sqlite.org/wal.html
14. SQLite — PRAGMA synchronous (EXTRA/FULL/NORMAL/OFF) · zuletzt aktualisiert 2026-10-04 · https://sqlite.org/pragma.html#pragma_synchronous
15. SQLite — Powersafe Overwrite · zuletzt aktualisiert 2025-05-31 · https://sqlite.org/psow.html
16. PostgreSQL — 19.5 Write Ahead Log (`fsync`, `wal_sync_method`) · PostgreSQL 18, publiziert 2026-08-13 · https://www.postgresql.org/docs/current/runtime-config-wal.html
17. RocksDB Wiki — WAL Performance · letzte Bearbeitung 15.10.2020 · https://github.com/facebook/rocksdb/wiki/WAL-Performance
18. LevelDB — `doc/index.md` (Synchronous Writes) · abgerufen Okt 2026 · https://github.com/google/leveldb/blob/main/doc/index.md
19. etcd — Performance (fdatasync-Latenz, Benchmarks) · zuletzt geändert 17.04.2023 · https://etcd.io/docs/v3.6/op-guide/performance/
20. Litestream — Tips & Caveats · abgerufen Okt 2026 · https://litestream.io/tips/
21. Fly.io — LiteFS · abgerufen Okt 2026 · https://fly.io/docs/litefs/

**Spec / Quellcode**

22. libuv — `src/win/fs.c` (`fs__rename` = `MoveFileExW`+`MOVEFILE_REPLACE_EXISTING`; `fs__fsync`/`fs__fdatasync` = `FlushFileBuffers`) · `v1.x`, abgerufen Okt 2026 · https://raw.githubusercontent.com/libuv/libuv/v1.x/src/win/fs.c
23. Bun — `src/sys/sys_uv.rs` (`uv_fs_fsync`, `uv_fs_fdatasync`, `uv_fs_rename`) · `main`, abgerufen Okt 2026 · https://raw.githubusercontent.com/oven-sh/bun/main/src/sys/sys_uv.rs
24. Bun — `src/sys/windows/mod.rs` (`FileRenameInformationEx`; `MOVEFILE_WRITE_THROUGH` nur als Konstante) · `main`, abgerufen Okt 2026 · https://raw.githubusercontent.com/oven-sh/bun/main/src/sys/windows/mod.rs

**Issues / PRs**

25. Bun Issue #34914 — „fs.writeFile does not flush on close…" (robobun: „neither Node nor Bun calls fsync/fdatasync in writeFile/appendFile or on close") · 21.07.2026, closed as not planned · https://github.com/oven-sh/bun/issues/34914
26. Bun Issue #3167 — `fsPromises.open` should return instance of `FileHandle` („Fixed in #8141") · Juni 2023 – 16.01.2024 · https://github.com/oven-sh/bun/issues/3167
27. Bun PR #42819 — „Remove libuv on Windows" · 15.09.2026, offen (Kommentare bis 07.10.2026) · https://github.com/oven-sh/bun/pull/42819
28. Bun PR #32001 — „windows: retry renames without extended flags" · 08.06.2026, geschlossen (Branch gelöscht; Nachfolger #33029) · https://github.com/oven-sh/bun/pull/32001
29. WASI Issue #756 — „fsync on directories on Windows" (sunfishcode) · 11.01.2023 – 20.08.2026, offen · https://github.com/WebAssembly/WASI/issues/756

**Blog / Analyse / Forum**

30. Dan Luu — Files are hard · abgerufen Okt 2026 · https://danluu.com/file-consistency/
31. Dan Luu — Fsyncgate (Archiv des pgsql-hackers-Threads vom 28.–29.03.2018) · abgerufen Okt 2026 · https://danluu.com/fsyncgate/
32. transactional.blog (apeiro) — Darwin's Deceptive Durability · 05.06.2022 · https://transactional.blog/blog/2022-darwins-deceptive-durability
33. transactional.blog (apeiro) — Blog-Index (Beleg: kein Windows-fsync-Artikel) · abgerufen Okt 2026 · https://transactional.blog/
34. Stack Overflow — „Do I have to flush a directory on Windows?" (Benchmark-Tabelle Rename+Flush vs. ohne) · abgerufen über die Stack-Exchange-API, Okt 2026 · https://stackoverflow.com/questions/78040177/do-i-have-to-flush-a-directory-on-windows
