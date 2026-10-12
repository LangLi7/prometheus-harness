# Rust-Arbeitsbereich — `native/` und die Rust-Dienste

> Vorlage und Verträge: `C:\Users\Chang\harness\prometheus-harness\native\system`
> (die beiden C-Programme, die hier in Rust neu entstehen) und
> `native/system/docs/cli-contract.md` bzw. `native/system/docs/flock-contract.md`.
> Das Mapping steht in [`../MAPPING.md`](../MAPPING.md) §3.8.

## Warum Rust hier steht

`docs/stack.md` des Zielprojekts nennt Rust für **Sandbox und schwere Werkzeuge** und
belegt das mit dem Muster, das die Vorlage selbst vorführt: „`native/system` im
Referenz-Harness ist ein kleines C-Programm, verpackt als eigenes Paket, vom JS
aufgerufen. Rust braucht kein neues Konzept — nur ein weiteres Paket nach diesem Muster."

Zusätzlich löst dieser Bereich das **Risiko mit der höchsten Priorität** aus
[`../docs/risks.md`](../docs/risks.md) §1 strukturell auf: die nativen Node-Addons
`koffi` (JSONL-Dauerhaftigkeit, `MoveFileExW` mit Write-Through) und `node-pty`
(persistentes Terminal, ConPTY). Statt zu messen, ob sie unter Bun laufen, werden beide
Fähigkeiten zu **Prozessen**, die der Core aufruft:

| Addon der Vorlage | Ersatz hier | Begründung |
|---|---|---|
| `koffi` | [`native/atomicfs`](atomicfs/) | Write-Through-Schreiben, atomarer Rename, Identitätsbericht — als Prozess |
| `node-pty` | [`native/pty`](pty/) | PTY/ConPTY als Prozess |
| `flock.c` | [`native/flock`](flock/) | Dateisperre als Prozess (statt Node-API-Addon) |
| `main.c` (`landlock-run`) | [`native/landlock-run`](landlock-run/) | Sandbox-Launcher, **CLI-Vertrag wörtlich erhalten** |

## Die Regel, die hier gilt

Aus `docs/stack.md`, verbindlich:

> **Der JS-Core bleibt der Kernel. Jede andere Sprache ist ein Dienst, den er aufruft.**

Praktisch heißt das für jedes Programm in diesem Arbeitsbereich:

1. **Prozessgrenze, kein Addon.** Der Core startet ein Binary und liest dessen Ausgabe.
   Damit gibt es keine ABI-Frage und keinen Bun-Addon-Test mehr.
2. **Verträge sind wörtlich.** Wo die Vorlage einen CLI-Vertrag festschreibt
   (`cli-contract.md`, `flock-contract.md`), werden Grammatik, Exit-Codes und
   Report-Zeilen **unverändert** übernommen. Der Vertrag ist die Schnittstelle, nicht
   der C-Code.
3. **Kein Code kopiert.** Kein C wird übersetzt; jede Komponente ist eine
   Neuimplementierung des beschriebenen Verhaltens — idiomatisch in Rust.
4. **Keine Umgebungsvariablen als Eingabe, wo Sicherheit davon abhängt.** Die Vorlage
   hält für `landlock-run` ausdrücklich fest: „which binary confines a process must
   never be decidable by the ambient environment". Das bleibt so.

## Bauen und Testen

```powershell
cd C:\Users\Chang\prometheus-harness
cargo build --workspace            # alle Binaries
cargo test  --workspace            # alle Tests
cargo build --release --workspace  # Release
```

Einzelne Komponente:

```powershell
cargo test -p pmh-landlock-run
cargo run  -p pmh-flock -- --probe
```

## Die Komponenten

| Pfad | Binary / Crate | Ersetzt | Vertrag |
|---|---|---|---|
| `native/landlock-run/` | `pmh-landlock-run` | `main.c` | `native/system/docs/cli-contract.md` — **wörtlich** |
| `native/flock/` | `pmh-flock` | `flock.c` + `flock.ts` | `native/system/docs/flock-contract.md` — Verhaltenstabelle |
| `native/atomicfs/` | `pmh-atomicfs` | `koffi` (Addon) | neu; Write-Through + atomarer Rename + Identitätsbericht |
| `native/pty/` | `pmh-pty` | `node-pty` (Addon) | neu; PTY/ConPTY |
| `native/index/` | `pmh-index` | — | neu; Parsing und Indizierung |
| `native/crypto/` | `pmh-crypto` | — | neu; Kryptografie |
| `services/pmh-sandbox/` | `pmh-sandbox` | `sandbox-windows-acl` | Policy kommt aus dem TS-Core |

## Plattformen

Wie die Vorlage: **ein Paket je Plattform-Triple**, Auswahl zur Installationszeit über
die `os`/`cpu`-Felder. Die Vorlage belegt `linux-x64`, `linux-arm64`, `darwin-x64`,
`darwin-arm64`. Windows ist bei `landlock-run` und `flock` **nicht** dabei — Landlock ist
Linux-only, und laut `flock-contract.md` „Windows does not use this API and retains its
existing semaphore implementation".

## Sprache in diesem Bereich

Code, Bezeichner und Vertragsstrings sind **englisch** (wie in der Vorlage); Kommentare
und Dokumentation auf Deutsch, wo sie erklären statt benennen.
