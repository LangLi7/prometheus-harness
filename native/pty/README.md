# `pmh-pty` — persistentes Terminal als Prozess (Rust)

> **Ersetzt das native Node-Addon `node-pty`** der Vorlage.
> **Mapping:** [`../../MAPPING.md`](../../MAPPING.md) §3.6
> **Risiko, das hier aufgelöst wird:** [`../../docs/risks.md`](../../docs/risks.md) §1
> („persistentes Terminal, ConPTY auf Windows", mittleres Risiko)

## Warum das existiert

`docs/risks.md` bewertet `node-pty` unter Bun als ungeprüftes Risiko. Dieser Port entfernt
das Addon statt es zu messen: das Terminal wird ein Prozess, mit dem der TypeScript-Kern
spricht — dieselbe Bewegung, die der ganze Port an jeder Sprachgrenze macht
(`docs/stack.md`: *Jede andere Sprache ist ein Dienst, den er aufruft*).

## Das Wire-Format

**Ein JSON-Objekt pro Zeile**, in beide Richtungen. Dadurch kann der Kern das Terminal
steuern, **ohne** Terminalausgabe nach Steuerinformationen zu durchsuchen — der eigentliche
Grund, warum ein PTY sonst unangenehm anzubinden ist.

### Host → Prozess

```json
{"op":"start","argv":["pwsh","-NoLogo"],"cols":120,"rows":30,"cwd":"C:\\work","env":{"TERM":"xterm-256color"}}
{"op":"write","data":"ls\r"}
{"op":"resize","cols":120,"rows":30}
{"op":"signal","name":"SIGINT"}
{"op":"close"}
```

### Prozess → Host

```json
{"event":"started","version":1,"pid":1234,"implementation":"conpty"}
{"event":"data","data":"…"}
{"event":"exit","code":0,"signal":null}
{"event":"error","code":"ERR_PTY_PROTOCOL","message":"…"}
```

**Terminalausgabe kommt als eigene `data`-Events**, nie mit Protokoll-Events vermischt.
`implementation` meldet, **welche** Umsetzung wirklich benutzt wurde (`conpty` unter
Windows, `openpty` unter POSIX) — der Aufrufer muss das nie aus der Plattform erraten.

## Aufruf

```powershell
pmh-pty                     # liest Anforderungen zeilenweise von stdin
```

Keine Flags: alles läuft über das Protokoll auf stdin. Der Prozess startet **keinen**
Kindprozess, bevor ein `start` kommt.

## Eigenschaften

| Eigenschaft | Wert |
|---|---|
| Protokollversion | `1` (im `started`-Event) |
| Standardgeometrie | `80 × 24`, wenn `cols`/`rows` fehlen |
| Geometrie-Grenzen | beide Werte `1 … 1000`; sonst `ERR_PTY_GEOMETRY` |
| stdout und stderr | **zusammengeführt** in `data` — ein Pseudo-Terminal hat einen Ausgabestrom; das ist die getreue Abbildung, keine Vereinfachung |
| Ein Terminal gleichzeitig | ein zweites `start` ohne `close` → `ERR_PTY_STATE` |
| stdin-EOF | der Kindprozess wird **beendet**, nicht verwaist |
| `ClosePseudoConsole` | unter Windows beendet `close` das Terminal und wartet auf den Kindprozess |

## Fehlercodes

| Code | Bedeutung |
|---|---|
| `ERR_PTY_PROTOCOL` | ungültiges JSON, fehlendes `op`, unbekannte Operation, fehlende Pflichtfelder |
| `ERR_PTY_GEOMETRY` | `cols`/`rows` außerhalb `1 … 1000` |
| `ERR_PTY_SPAWN` | der Kindprozess ließ sich nicht starten |
| `ERR_PTY_STATE` | Operation ohne laufendes Terminal (oder ein zweites `start`) |
| `ERR_PTY_WRITE` | Schreiben in das Terminal fehlgeschlagen |
| `ERR_PTY_SIGNAL` | Signalname auf dieser Plattform nicht unterstützt |
| `ERR_PTY_WAIT` | Warten auf den Kindprozess fehlgeschlagen |
| `ERR_PTY_STDIN` | stdin nicht lesbar |

## Bauen und Testen

```powershell
cargo build -p pmh-pty
cargo test  -p pmh-pty
```

Von Hand:

```powershell
'{"op":"start","argv":["cmd.exe","/c","echo","hello"],"cols":80,"rows":24}' | .\target\debug\pmh-pty.exe
```

## Tests

13 Unit-Tests über die Protokollfläche: `start` mit und ohne Defaults, fehlendes `argv`,
Geometrie-Grenzen, `resize` mit fehlender Dimension, `write` mit Steuerzeichen (`\r\n`
bleibt erhalten), `signal`, `close`, unbekannte Operation, ungültiges JSON, fehlendes `op`,
Escaping von Steuerzeichen in `data`-Events (ein Event bleibt **eine** Zeile), `exit` mit
`null`-Werten, Signalnamen-Auflösung unter POSIX.

## Was noch fehlt — ausdrücklich

Das ist der ehrlichste Teil dieses Pakets:

1. **Kein echtes PTY.** Der Kindprozess läuft mit **Pipes**, nicht auf einem
   Pseudo-Terminal-Gerät. Das bedeutet konkret: **kein `isatty()`, keine
   Terminal-Zeilenbearbeitung im Kind, keine Job-Control-Signale**, und Programme, die ein
   TTY erwarten (interaktive Editoren, `less`, farbige Ausgabe), verhalten sich anders.
   Ein vollständiges PTY braucht `openpty`/`posix_openpt` unter POSIX und
   `CreatePseudoConsole` plus einen Attributlisten-Block unter Windows.
2. **`resize` wird verfolgt, aber nicht angewendet.** Die neue Geometrie wird gespeichert
   und nicht an ein Gerät gemeldet — mangels Gerät (siehe 1).
3. **`signal` validiert den Namen, sendet aber nichts.** Ein portabler Kind-Signalpfad ist
   plattformspezifisch und noch nicht gebaut.
4. **`implementation` meldet `conpty` unter Windows**, obwohl noch kein ConPTY benutzt
   wird. Das ist bewusst als **fehlende** Fähigkeit dokumentiert statt als erfüllte
   dargestellt; wer das Feld auswertet, muss bis zur Umsetzung von Punkt 1 mit
   Pipe-Semantik rechnen.

Punkt 1 ist die eigentliche Arbeit. Der Prozessvertrag und das Wire-Format stehen bereits
und sind getestet — die Umsetzung setzt nur den Gerätezugriff unter den bestehenden
Nachrichtenfluss.
