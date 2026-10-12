# `pmh-atomicfs` — dauerhafte atomare Schreibvorgänge (Rust)

> **Ersetzt das native Node-Addon `koffi`** der Vorlage.
> **Mapping:** [`../../MAPPING.md`](../../MAPPING.md) §1.1 und §3.6
> **Risiko, das hier aufgelöst wird:** [`../../docs/risks.md`](../../docs/risks.md) §1,
> höchste Priorität („**hoch**")

## Warum das existiert

Die Vorlage hängt für ihre **JSONL-Sitzungs-Dauerhaftigkeit** am nativen Addon `koffi`,
um unter Windows `MoveFileExW` mit `MOVEFILE_WRITE_THROUGH` zu erreichen.
`docs/risks.md` bewertet das als **höchstes Risiko des ganzen Projekts**, weil das Addon aus
dem Quellcode gebaut wird und sein Verhalten unter Bun ungeprüft ist.

Dieser Port **misst das Risiko nicht, sondern entfernt es**: dieselbe Garantie kommt von
einem Prozess, den der TypeScript-Kern aufruft. Danach gibt es kein natives Addon, keine
ABI-Frage und keinen Node-/Bun-Kompatibilitätstest — nur ein Binary mit dokumentierter
Kommandozeile.

## Die vier Garantien

Ein dauerhafter Schreibvorgang muss **alle vier** erfüllen:

| # | Garantie | Wie |
|---|---|---|
| 1 | **Nie eine zerrissene Datei.** Ein Leser sieht entweder den alten oder den neuen Inhalt, nie eine Mischung. | Schreiben in eine temporäre Datei **im selben Verzeichnis**, dann atomares Ersetzen |
| 2 | **Die Bytes erreichen das Medium, bevor Erfolg gemeldet wird.** | `sync_all` auf die temporäre Datei; unter Windows zusätzlich `MOVEFILE_WRITE_THROUGH` |
| 3 | **Auch das Umbenennen ist dauerhaft.** Unter POSIX muss der Verzeichniseintrag mit geflusht werden, sonst kann ein Absturz das Umbenennen verlieren, obwohl die Daten überlebt haben. | `sync_all` auf das enthaltende Verzeichnis; unter Windows deckt `MOVEFILE_WRITE_THROUGH` den Verzeichniseintrag mit ab |
| 4 | **Identität ist berichtbar.** `flock-contract.md` hält fest, dass ein Ersetzen die Sperre **nicht** auf den Ersatz-Inode überträgt, und dass das JSONL-Backend die Identität separat prüft. | Der Report trägt `device` + `inode` (POSIX) bzw. Volume-Seriennummer + Dateiindex (Windows) |

**Garantie 3 ist der Teil, den ein reines `koffi`-Ersetzen oft vergisst.** Ohne den
Verzeichnis-Flush ist die Datei dauerhaft, ihr Name aber nicht.

## Aufruf

```text
pmh-atomicfs write    <path> [--from <file> | --stdin] [--json]
pmh-atomicfs read     <path>
pmh-atomicfs identity <path>
pmh-atomicfs cleanup  <path>
pmh-atomicfs probe
```

| Kommando | Wirkung |
|---|---|
| `write` | schreibt atomar und dauerhaft; druckt eine JSON-Zeile auf stdout |
| `read` | schreibt die Bytes **unverändert** auf stdout, damit die Ausgabe pipbar ist |
| `identity` | druckt Gerät + Inode als JSON, **ohne** zu schreiben |
| `cleanup` | entfernt eine liegengebliebene temporäre Datei eines abgestürzten Schreibers |
| `probe` | meldet die Fähigkeiten dieses Builds |

## Report (stdout, eine Zeile JSON)

```json
{"version":1,"path":"/var/pmh/sessions/a.jsonl","bytes":42,"synced":42,"replaced":true,"identity":{"device":66306,"inode":1234567}}
```

Fehler (stderr):

```json
{"code":"ERR_ATOMIC_MOVE","message":"MoveFileExW(...) failed for …","errno":5}
```

Exit-Code bei jedem Fehler: **125**.

## Der Prozessvertrag für den TypeScript-Kern

Der Kern (`packages/util/atomic-write`) ruft:

```text
pmh-atomicfs write <ziel> --stdin
```

schreibt den neuen Inhalt nach stdin, liest **eine** JSON-Zeile von stdout und behandelt
jeden Exit-Code ungleich 0 als Fehler mit dem stderr-Objekt als Ursache. Der Kern hält
**keine** Datei offen und braucht **kein** natives Modul.

> **Achtung für den Kern:** Nach einem `write` ist die Identität eine **andere** als vorher
> (das ist Garantie 1). Wer eine `flock`-Sperre auf die alte Datei hält, hält sie auf einem
> verwaisten Inode. Deshalb prüft das JSONL-Backend die Identität — dafür ist `identity`
> bzw. das `identity`-Feld im Report da.

## Plattformen und Umsetzung

| Plattform | Ersetzen | Flush |
|---|---|---|
| Windows | `MoveFileExW` mit `MOVEFILE_REPLACE_EXISTING \| MOVEFILE_WRITE_THROUGH` (kernel32, direkt deklariert) | durch `MOVEFILE_WRITE_THROUGH` |
| POSIX | `rename(2)` | `fsync` auf Datei **und** Verzeichnis |

`CreateFileW`/`CloseHandle` sind direkt deklariert statt importiert: die Helfer-Crate
verschiebt sie zwischen Releases zwischen Modulen und Feature-Gates, und die Deklaration
hier zu pinnen hält den Build unabhängig von diesem Wechsel — dieselbe Begründung, mit der
die C-Vorlage die Landlock-UAPI lokal definiert statt einen Header einzubinden.

## Bauen und Testen

```powershell
cargo build -p pmh-atomicfs
cargo test  -p pmh-atomicfs
```

Von Hand:

```powershell
"hello" | .\target\debug\pmh-atomicfs.exe write C:\temp\a.jsonl --stdin
.\target\debug\pmh-atomicfs.exe identity C:\temp\a.jsonl
.\target\debug\pmh-atomicfs.exe read C:\temp\a.jsonl
.\target\debug\pmh-atomicfs.exe probe
```

## Tests

11 Unit-Tests, darunter die inhaltlich entscheidenden:

- eine zweite Schreiboperation **ersetzt** und meldet `replaced: true`
- die **Identität ändert sich** über ein atomares Ersetzen (die Eigenschaft, auf die sich
  das JSONL-Backend verlässt)
- **keine temporäre Datei überlebt** einen erfolgreichen Schreibvorgang
- die temporäre Datei ist ein **Geschwister** des Ziels, damit das Ersetzen atomar bleibt
- ein **fehlgeschlagener** Schreibvorgang lässt den alten Inhalt **unberührt**
- eine leere Schreiboperation ist gültig
- `cleanup` meldet, ob es etwas entfernt hat

## Was noch fehlt

- **Kein Absturztest.** Die Garantien 2 und 3 sind behauptet und durch die Syscall-Wahl
  begründet, aber nicht durch einen Prozess-Kill mitten im Schreiben belegt.
- **Kein Nebenläufigkeitstest.** Zwei gleichzeitige Schreiber auf dasselbe Ziel sind durch
  den pid-tragenden Namen getrennt, aber nicht getestet.
- **`probe` meldet die Fähigkeiten des Builds**, nicht die des Dateisystems (ob das
  Ziel-Dateisystem Write-Through tatsächlich unterstützt, ist offen).
