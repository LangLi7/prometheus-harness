# `@prometheus-harness/atomic-write` — dauerhafte atomare Schreibvorgänge

**Zweck.** Ein Schreibvorgang, der entweder ganz oder gar nicht sichtbar wird und dessen Bytes
das Medium erreicht haben, **bevor** Erfolg gemeldet wird. Kein natives Addon: die Garantie
kommt von einem Prozess.

**Was das ersetzt.** Die Vorlage hängt für ihre JSONL-Sitzungs-Dauerhaftigkeit am Addon
`koffi` (`MoveFileExW` mit `MOVEFILE_WRITE_THROUGH`). `docs/risks.md` §1 bewertet das als
höchstes Risiko des Projekts, weil das Addon aus dem Quellcode gebaut wird. Dieses Paket
startet stattdessen `pmh-atomicfs` (`native/atomicfs`, Rust) als Prozess. Danach gibt es keine
ABI-Frage und keinen Addon-Test.

## Der Prozessvertrag

```text
pmh-atomicfs write    <pfad> [--from <datei> | --stdin] [--json]
pmh-atomicfs read     <pfad>
pmh-atomicfs identity <pfad>
pmh-atomicfs cleanup  <pfad>
pmh-atomicfs probe
```

| Ereignis | Beobachtung |
|---|---|
| Erfolg | **eine** JSON-Zeile auf stdout, Exit 0 |
| Fehler | **ein** JSON-Objekt auf stderr, Exit **125** |

Erfolgszeile von `write`:

```json
{"version":1,"path":"…","bytes":42,"synced":42,"replaced":true,"identity":{"device":66306,"inode":1234567}}
```

Fehlerzeile:

```json
{"code":"ERR_ATOMIC_MOVE","message":"MoveFileExW(...) failed for …","errno":5}
```

Der Kern hält **keine** Datei offen und braucht **kein** natives Modul. `read` gibt die Bytes
unverändert auf stdout, damit die Ausgabe pipbar bleibt.

## Ausgeführte Oberfläche

| Export | Zweck |
|---|---|
| `writeFileAtomic(path, { source, json?, binary?, signal?, timeoutMs? })` | schreibt atomar und dauerhaft; liefert `AtomicWriteReport` |
| `readFileBytes(path, options?)` | liest die Bytes unverändert als `Uint8Array` |
| `identity(path, options?)` | Gerät + Inode, **ohne** zu schreiben |
| `cleanup(path, options?)` | entfernt eine liegengebliebene temporäre Datei |
| `probe(options?)` | Fähigkeiten des Builds (`writeThrough`, `directorySync`, `identity`) |
| `resolveAtomicfsBinary()` | Standardpfad `target/debug/pmh-atomicfs[.exe]` |
| `atomicfsBinaryNames()` | geprüfte Dateinamen je Plattform |
| `atomicfsAvailable()` / `atomicfsAvailableSync()` | ist ein Binary vorhanden? |
| `AtomicfsError` | Fehlerklasse mit `code`, `errno`, `exitCode`, `stderr` |
| Typen | `AtomicWriteReport`, `AtomicfsIdentity`, `AtomicfsIdentityReport`, `AtomicfsCleanupReport`, `AtomicfsCapabilities`, `AtomicWriteSource`, `AtomicWriteOptions`, `AtomicfsRunOptions`, `AtomicfsErrorDetail` |

**Programmpfad ohne Umgebungsvariablen.** Welches Programm schreibt, darf nicht von der
Umgebung abhängen. Der Pfad wird aus der Paketlage gebildet und über eine
Dateisystemprüfung bestätigt — nie über `PATH` oder eine Env-Variable (MAPPING.md §3.8,
Sicherheitsanforderung der Vorlage).

**`prefixArgs`.** Tests schieben damit ein Testdoppel vor das Binary, statt den Programmpfad zu
einem Befehl mit Leerzeichen zu machen. Im Normalbetrieb ist das Feld leer.

### Fehlercodes dieses Wrappers

| `code` | Bedeutung |
|---|---|
| `ERR_ATOMICFS_SPAWN` | Prozess ließ sich nicht starten (fehlendes Binary, fehlende Rechte) |
| `ERR_ATOMICFS_EXIT` | Exit ≠ 0 ohne verwertbaren JSON-Report auf stderr |
| `ERR_ATOMICFS_PROTOCOL` | Report fehlt, ist kein JSON oder hat nicht die vereinbarte Form |
| `ERR_ATOMICFS_TIMEOUT` | Notbremse (`timeoutMs`, Standard 30 000 ms) |
| `ABORTED` | das Abbruchsignal des Aufrufers hat gegriffen |
| Code aus dem Report | z. B. `ERR_ATOMIC_MOVE` — **unverändert** durchgereicht, samt `errno` |

## Die Eigenschaft, die man leicht übersieht

Nach einem erfolgreichen `write` ist die **Identität eine andere** als vorher — das ist
Garantie 1 (nie eine zerrissene Datei), nicht ein Fehler. Wer eine `flock`-Sperre auf der alten
Datei hält, hält sie auf einem verwaisten Inode. Deshalb liefert der Report `identity`, und
deshalb gibt es `identity()`. Die JSONL-Persistenz muss diese Prüfung selbst machen.

## Noch nicht implementiert

- **`--json` ohne Wirkung.** Das Flag wird durchgereicht, aber der Report ist bereits JSON; die
  Bedeutung des Flags ist im Binary-README nicht weiter ausgeführt.
- **Kein Nebenläufigkeitsschutz in diesem Paket.** Zwei gleichzeitige Aufrufe auf dasselbe Ziel
  sind Sache des Aufrufers; das Binary trennt sie über einen pid-tragenden Namen, geprüft ist
  das nicht.
- **Kein Absturztest.** Die Garantien „Bytes vor Erfolgsmeldung" und „dauerhaftes Umbenennen"
  sind durch die Syscall-Wahl des Binarys begründet, nicht durch einen Kill mitten im
  Schreiben belegt.
- **Keine Kürzung großer Inhalte.** `writeFileAtomic` hält den ganzen Inhalt im Speicher, weil
  er über stdin geht. Für sehr große Dateien ist `{ fromFile }` der richtige Weg.
- **Kein Fortschritt.** Ein großer Schreibvorgang meldet nichts, bis er fertig ist.

## Tests

```powershell
cd packages\util\atomic-write
bun test          # 19 Prüfungen
bun run typecheck # tsgo --noEmit
```

Geprüft wird auf zwei Ebenen: gegen ein **Testdoppel** (`tests/fixtures/pmh-atomicfs-fake.mjs`,
ein Node-Skript, das jedes Verhalten des Vertrags erzeugt — Erfolgszeile, Fehlerobjekt,
`errno`, Exit 125 ohne Report, kaputter Report, Zeitüberschreitung, Abbruch) und gegen das
**echte** Rust-Binary in `target/debug`, sobald es gebaut ist. Im echten Lauf wird wirklich
geschrieben, gelesen, die Identität vor und nach dem Ersetzen verglichen und aufgeräumt; zwei
Prüfungen melden sich als `skip`, wenn kein Binary vorliegt.
