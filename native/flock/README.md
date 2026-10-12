# `pmh-flock` — beratende Dateisperre als Prozess (Rust)

> **Ersetzt:** `native/system/packages/entry/src/flock.c` (Node-API-Addon) **und**
> `native/system/packages/entry/src/flock.ts` (JS-Hülle) der Vorlage.
> **Vertrag:** `C:\Users\Chang\harness\prometheus-harness\native\system\docs\flock-contract.md`
> — die Verhaltenstabelle ist die Abnahmeliste.
> **Mapping:** [`../../MAPPING.md`](../../MAPPING.md) §3.8.2

## Was es tut

Eine **einzige** beratende Sperre (`flock`) auf ein Ziel, nicht-blockierend, als
**Prozess**. Der Aufruf meldet Erfolg oder Konflikt in einer JSON-Zeile.

## Warum ein Prozess und nicht ein Node-Addon

Die Vorlage braucht das Addon, um den `flock(2)`-Syscall aus dem JavaScript-Thread
herauszuhalten. Die Bindungsregel dieses Ports sagt etwas anderes
([`../../docs/stack.md`](../../docs/stack.md)): *Der JS-Core bleibt der Kernel. Jede andere
Sprache ist ein Dienst, den er aufruft.* Ein natives Addon würde genau die Frage
wiederaufwerfen, die dieser Port beseitigt — ob native Addons unter Bun überhaupt laufen.
Als Prozess gibt es keine ABI-Frage und keinen Addon-Test.

## Aufruf

```text
pmh-flock --path <file> [--shared] [--wait-ms <n>] [--hold-ms <n>] [--daemon]
pmh-flock --fd <n>      [--shared] [--wait-ms <n>]
pmh-flock --inspect --path <file>
pmh-flock --inspect --fd <n>
pmh-flock --probe
```

| Argument | Bedeutung |
|---|---|
| `--path <file>` | dieses Programm öffnet die Datei und hält sie für seine Lebensdauer |
| `--fd <n>` | ein bereits offener, vererbter Deskriptor; **wird nie geöffnet, dupliziert, geschlossen oder entsperrt** |
| `--shared` | `LOCK_SH` statt `LOCK_EX` |
| `--wait-ms <n>` | begrenztes Warten statt eines einzigen Versuchs |
| `--hold-ms <n>` | hält die Sperre so lange (nur `--path`) |
| `--daemon` | hält bis stdin-EOF oder Signal (nur `--path`) |
| `--inspect` | sperrt **nicht**, meldet nur Gerät + Inode des Ziels |

## Exit-Codes

| Code | Bedeutung |
|---|---|
| `0` | Sperre erworben (bzw. `--inspect`/`--probe` erfolgreich) |
| `2` | **Konflikt** — jemand anders hält die Sperre. Erwartetes, routinemäßiges Ergebnis. |
| `125` | jeder andere Fehler: Nutzungsfehler, nicht unterstützte Plattform, unbrauchbarer Deskriptor, sonstiger Syscall-Fehler |

## Report (stdout, eine Zeile JSON)

```json
{"version":1,"locked":true,"kind":"exclusive","syscall":"flock"}
```

Mit `--inspect`:

```json
{"version":1,"syscall":"flock","identity":{"device":7,"inode":42,"regular":true}}
```

## Fehler (stderr, ein JSON-Objekt)

```json
{"code":"EAGAIN","syscall":"flock","message":"EAGAIN: flock failed","contention":true,"errno":11}
```

Die Felder entsprechen dem Fehlerobjekt der Vorlage: **symbolischer `code`**,
**positives `errno`**, `syscall: "flock"`. `contention` kommt hinzu, damit der Aufrufer
nicht selbst `errno` gegen `EAGAIN` prüfen muss.

## Sperr-Lebensdauer über eine Prozessgrenze

Das ist der einzige Punkt, den ein Prozess nicht wörtlich reproduzieren kann: „die Sperre
lebt im Speicher des Aufrufers". `flock`-Sperren gehören zu einer **Open File
Description** — wer den Deskriptor hält, hält die Sperre. Deshalb gibt es zwei
ausdrückliche Modi, und die Konsequenz steht hier statt in einer Fußnote:

| Modus | Wer hält | Lebensdauer | Für wen |
|---|---|---|---|
| `--path <file>` | **dieses Programm** | solange der Prozess läuft: `--hold-ms` begrenzt, `--daemon` hält bis stdin-EOF/Signal | externe Synchronisation, Werkzeuge, Skripte |
| `--fd <n>` | **der Aufrufer** | exakt solange der Deskriptor offen ist — **unveränderte Vorlagensemantik** | der Kern, wenn er die Datei selbst offen hält |

**Für den JSONL-Sitzungs-Speicher des Kerns ist `--fd` der richtige Modus**, weil der Kern
die Datei ohnehin offen hält und die Sperre genau an diese Offenheit gebunden sein muss.

## Warum `--inspect` existiert

`flock-contract.md` hält fest: Eine Sperre gehört zur Open File Description, und
**das Entfernen oder Ersetzen eines Pfadnamens überträgt die Sperre nicht auf den
Ersatz-Inode**. Deshalb muss ein Aufrufer, dem das wichtig ist, die **Inode-Identität
selbst prüfen** — das JSONL-Backend der Vorlage tut genau das. `--inspect` liefert die
dafür nötigen Werte über die Prozessgrenze: `device` + `inode`.

## Verhalten, aus dem Vertrag übernommen

Die vollständige Tabelle aus `flock-contract.md` ist die Abnahmeliste für die Tests. Die
wichtigsten Eigenschaften:

- **Ein Versuch, nicht-blockierend** (`LOCK_EX | LOCK_NB`) — kein Warten außer mit
  `--wait-ms`; eine Zeitüberschreitung meldet den **Konflikt, der tatsächlich bremste**,
  nie einen erfundenen Timeout-Code.
- **Der Aufrufer besitzt den Deskriptor.** Im `--fd`-Modus öffnet, dupliziert, schließt und
  entsperrt das Programm nie. In Rust ist das eine **Compile-Zeit-Eigenschaft**
  (`BorrowedFd`), kein Kommentar.
- **Konflikt ist von jedem anderen Fehler unterscheidbar** (Exit 2 gegenüber 125).
- **Nicht unterstützte Plattform → `ERR_FLOCK_UNSUPPORTED_PLATFORM`.**
- **Sperren folgen der Semantik des Host-Dateisystems.** Netzwerk-Dateisysteme können
  andere oder gar keine Sperrsemantik haben.
- **Windows nutzt diese API nicht.** Der Vertrag sagt es ausdrücklich: „Windows does not use
  this API and retains its existing semaphore implementation." Windows behält also seine
  Semaphore im JS; dieses Binary wird dort nicht gebaut.

## Plattformen

| Plattform | Unterstützt |
|---|---|
| Linux (x64, arm64) | ja |
| macOS (x64, arm64) | ja |
| Windows | **nein** — bewusst, wie in der Vorlage |

## Bauen und Testen

```powershell
cargo build -p pmh-flock
cargo test  -p pmh-flock
```

Von Hand auf einem POSIX-Host:

```bash
touch /tmp/lockfile
./pmh-flock --path /tmp/lockfile --hold-ms 3000 &
sleep 0.2
./pmh-flock --path /tmp/lockfile; echo "exit=$? (erwartet 2 = Konflikt)"
wait
./pmh-flock --path /tmp/lockfile; echo "exit=$? (erwartet 0, Halter ist weg)"
./pmh-flock --inspect --path /tmp/lockfile
```

## Tests

Die Unit-Tests prüfen die Vertragsfläche: Exit-Codes, Fehlerklassifikation
(`EAGAIN` → Konflikt, alles andere → generisch), die Fehler-JSON-Felder, die
Report-Feldnamen und -reihenfolge, die Errcode-Tabelle und die Plattformaussage.

**Noch nicht abgedeckt:** die eigentlichen Syscall-Bedingungen der Vertragstabelle
(zwei konkurrierende Halter, Vererbung an ein Kind, kein Stale-Lock-Timeout nach dem Tod
des Halters). Sie brauchen einen POSIX-Host und sind die nächste Ergänzung — siehe
`docs/reference/inventory-native-contracts.md` für die vollständige Liste.
