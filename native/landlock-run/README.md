# `pmh-landlock-run` — Sandbox-Launcher (Rust)

> **Ersetzt:** `native/system/packages/entry/src/main.c` (298 Zeilen C) der Vorlage.
> **Vertrag:** `C:\Users\Chang\harness\prometheus-harness\native\system\docs\cli-contract.md`
> — **wörtlich übernommen**. Das ist die Schnittstelle, nicht der C-Code.
> **Mapping:** [`../../MAPPING.md`](../../MAPPING.md) §3.8.1

## Was es tut

Der Launcher legt ein **Landlock-Ruleset auf sich selbst** und `exec`t dann den
eingehüllten Befehl. Das Ruleset wird über `execve` vererbt, also läuft der Befehl **und
jeder Prozess, den er startet**, eingeschränkt — während der aufrufende Prozess
uneingeschränkt bleibt.

Landlock ist eine **Allow-List**: alles, was nicht gewährt wurde, ist verboten.

## Aufruf (Vertrag, wörtlich)

```text
pmh-landlock-run [--ro <path>]... [--rw <path>]... -- <argv>...
pmh-landlock-run --probe
```

| Argument | Bedeutung |
|---|---|
| `--ro <path>` | gewährt Lesen + Ausführen **unterhalb** von `<path>` |
| `--rw <path>` | gewährt vollen Dateisystemzugriff unterhalb von `<path>` (jeder Zugriff, den die ausgehandelte Kernel-ABI regeln kann) |
| `--` | **Pflicht-Trenner**; alles danach ist das Kommando-argv, per `execvp` mit unveränderter Umgebung gestartet |
| `--probe` | schließt Grants und Kommando aus; baut ein maximales Ruleset im eigenen, kurzlebigen Prozess und meldet, ob der laufende Kernel es durchsetzt |

Es gibt **keine weiteren Flags** und **keine Umgebungsvariablen-Eingaben**.

**Nicht-Verzeichnis-Grant:** Bei einem Grant auf eine Nicht-Datei bleiben nur die
dateikompatiblen Zugriffsbits — so funktioniert `--rw /dev/null`.

## Exit-Codes (Vertrag)

| Code | Bedeutung |
|---|---|
| `125` | **jeder** Launcher-Fehler: Nutzungsfehler, Kernel ohne Landlock-Durchsetzung, nicht öffnbarer Grant-Root, fehlgeschlagenes `exec`. **Der eingehüllte Befehl wurde NICHT ausgeführt.** |
| sonst | Nach erfolgreichem `exec` wird jeder Kind-Status **unverändert** durchgereicht — auch 125. Der Konsument verlangt deshalb **beides**: Status 125 **und** eine `landlock-run: `-Fatalzeile. |
| `--probe` | `0`, wenn der Kernel durchsetzt (voll oder teilweise), sonst `125`. |

## Report-Zeilen (Vertrag, wörtlich)

| Situation | Kanal | Zeile |
|---|---|---|
| Probe, voll durchgesetzt | stdout | `landlock: fully enforced` |
| Probe, teilweise durchgesetzt | stdout | `landlock: partially enforced (older ABI)` |
| Lauf unter älterer ABI, teilweise | stderr | `landlock-run: partial enforcement (older Landlock ABI)` |
| jeder fatale Fehler | stderr | genau **eine** Zeile mit Präfix `landlock-run: ` |
| Nutzungsfehler | stderr | `landlock-run: usage error: <Meldung>` |

## Durchsetzungssemantik

1. **`no_new_privs` wird zuerst gesetzt.** Für eine unprivilegierte Restriktion
   vorgeschrieben — und es neutralisiert setuid/setgid-Eskalation innerhalb der Sandbox.
2. **ABI-Verhandlung bis ABI 5.** Der laufende Kernel bestimmt, welche Zugriffe regelbar
   sind. Zugriffe, die neuer als die laufende ABI sind, werden **nicht** geregelt — genau
   das ist der Unterschied zwischen `full` und `partial`.
3. **Fail-closed.** Kann das Ruleset nicht erstellt werden oder setzt der Kernel Landlock
   gar nicht durch (`ENOSYS`: ohne Landlock gebaut, `EOPNOTSUPP`: gebaut aber deaktiviert),
   beendet sich der Launcher nicht-null **ohne** `exec`. Es wird nie unconfined gestartet.
4. **Teil-Durchsetzung wird berichtet, nicht verweigert.** Unter einer älteren ABI ist der
   Lauf für alles eingeschränkt, was der Kernel unterstützt.

**`--probe` ist eine Funktionsprüfung, keine Versionsabfrage.** Eine `--version`-artige
Prüfung würde einen Kernel übersehen, der die Syscalls hat, die Durchsetzung aber
verweigert. Sich tatsächlich einzuschränken ist das einzige ehrliche Signal.

## Warum das in Rust steht

`docs/stack.md` nennt Rust für Sandbox und schwere Werkzeuge und belegt es mit dem Muster
der Vorlage selbst: „`native/system` … ist ein kleines C-Programm, verpackt als eigenes
Paket, vom JS aufgerufen. Rust braucht kein neues Konzept — nur ein weiteres Paket nach
diesem Muster."

## Abweichungen von der Vorlage (bewusst)

| Punkt | Vorlage (C) | Hier (Rust) | Grund |
|---|---|---|---|
| Landlock-UAPI | lokal definiert statt `<linux/landlock.h>`, damit der Build unabhängig von der Header-Vintage ist | identische Begründung, gleiche lokale Definition | Der Kernel-ABI ist per Vertrag stabil; die Definition dient zugleich als Audit-Record |
| Syscall-Nummern | `__NR_landlock_*` = 444/445/446 mit Fallback für alte libc | `libc::SYS_landlock_*` | Die Nummern sind architekturunabhängig (einheitliche Tabelle seit 2011) |
| Linken | statisch gegen musl | dynamisch, Standard-`cargo` | Verpackung, nicht Verhalten |
| Fehlermeldungen | `strerror(errno)` | `std::io::Error::from_raw_os_error` | Verhalten identisch; Text kann je Plattform leicht abweichen |

## Plattformen

**Nur Linux.** Landlock ist eine Linux-Syscall-Familie. Auf jedem anderen Host ist der
Launcher unbrauchbar — und das ist derselbe Befund wie bei einem Kernel ohne Landlock,
absichtlich: die Antwort des Konsumenten lautet in beiden Fällen „traue diesem Launcher
nicht". Die Vorlage verpackt entsprechend nur `linux-{x64,arm64}` und `darwin-{x64,arm64}`;
`darwin` erhält hier kein Launcher-Binary.

## Bauen und Testen

```powershell
cargo build -p pmh-landlock-run
cargo test  -p pmh-landlock-run
```

Auf einem Linux-Host zusätzlich von Hand:

```bash
# Probe: setzt der Kernel Landlock durch?
./pmh-landlock-run --probe; echo "exit=$?"

# Eingeschränkter Lauf: /usr lesbar, /work beschreibbar, alles andere verboten
./pmh-landlock-run --ro /usr --rw /work -- bash -c 'echo confined'
echo "exit=$?"

# Fail-closed-Nachweis: ein nicht öffnbarer Grant-Root darf NICHT starten
./pmh-landlock-run --ro /does/not/exist -- echo should-not-run; echo "exit=$? (erwartet 125)"
```

## Tests

Die Unit-Tests prüfen die **Vertragsfläche** (Argumentgrammatik, Exit-Codes, Report-Zeilen)
und die **ABI-Maske** (welche Zugriffsbits welche ABI einführt, dass die Leseseite in jeder
ABI-Maske enthalten ist, dass ein Datei-Grant keine verzeichnis-only-Bits behält). Die
Syscall-Seite selbst lässt sich nur auf einem Linux-Host ausführen; die Tests, die das
bräuchten, sind entsprechend nicht Teil der Suite hier.

## Was noch fehlt

- **Kein Integrationslauf auf einem echten Linux-Kernel.** Die Syscall-Pfade
  (`landlock_create_ruleset`, `landlock_add_rule`, `landlock_restrict_self`, `prctl`)
  kompilieren nur unter Linux und sind hier nicht ausgeführt worden.
- **Keine Plattformpakete** (`packages/linux-x64/` usw.) und kein Release-Skript. Die
  Vorlage hat dafür `assemble-prebuilds.mjs`, `pack-release.mjs`, `verify-release.mjs`
  und `github-matrix.mjs`; ein Rust-Äquivalent ist noch nicht gebaut.
