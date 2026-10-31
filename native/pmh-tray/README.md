# `pmh-tray` — Prometheus Harness im Infobereich (Rust, Windows)

> **Was es ist:** ein Symbol unten rechts in der Taskleiste, das den Harness
> startet, stoppt und **mit gültigem Token** im Browser öffnet — plus eine
> Verknüpfung im Startup-Ordner für den Autostart.
> **Regel des Arbeitsbereichs:** [`../README.md`](../README.md) — der JS-Core bleibt
> der Kernel, jede andere Sprache ist ein Dienst, den er aufruft.

## Was es tut

| Aktion | Wirkung |
|---|---|
| **Starten** | `bun scripts/start.mjs --port <n>` als Kindprozess, ohne Konsolenfenster |
| **Stoppen** | beendet den **ganzen Baum** — Bun, Host und die Go-Dienste (Job Object) |
| **Im Browser öffnen** | die Adresse **mit Token**, sobald der Host sie gemeldet hat |
| **Autostart beim Anmelden** | legt/löscht eine Verknüpfung im Startup-Ordner |
| **Protokoll öffnen** | `.pmh-build/pmh-tray.log` |
| **Beenden** | sagt selbst, was es tut: *„Beenden (stoppt den Harness)"* |

Der Zustand steht im Tooltip und in der Farbe des Symbols: **grau** = gestoppt,
**gelb** = startet, **grün** = Port antwortet.

## Warum das ein Prozess ist und kein Addon

`native/README.md` sagt: *„Der JS-Core bleibt der Kernel. Jede andere Sprache ist ein
Dienst, den er aufruft."* Dieses Programm zeigt in die **andere** Richtung — ein natives
Frontend, das den Core aufruft — und hält dieselbe Grenze ein: es startet einen Prozess
und liest dessen Ausgabe. Kein Addon, keine ABI-Frage, und der Harness läuft genau so,
wie `bun run start` ihn startet.

## Zwei Binaries, und warum

Das Windows-Subsystem ist eine Eigenschaft des **ganzen** Binaries. Beides zugleich geht
nicht: keine Konsole (Autostart) und eine Konsole (ein Mensch fragt `--status`).

| Binary | Subsystem | Wofür |
|---|---|---|
| `pmh-tray.exe` | Konsole | `--status`, `--autostart`, `--probe-tray`, `--tray` (Tray mit Konsole, zum Suchen) |
| `pmh-tray-gui.exe` | Windows (ohne Konsole) | das Symbol selbst; **Ziel der Autostart-Verknüpfung** |

Ohne die Trennung erschiene bei jeder Anmeldung ein schwarzes Fenster, das nie wieder
zugeht.

## Aufruf

```text
pmh-tray                       diese Uebersicht
pmh-tray --status              Zustand, Port, Adresse, Autostart
pmh-tray --autostart on|off|query
pmh-tray --probe-tray          prueft, ob der Infobereich das Symbol annimmt
pmh-tray --tray                das Tray mit Konsole starten
pmh-tray --port <n>            Port (Vorgabe 3080); --port=<n> geht auch
pmh-tray --version | --help
```

Umgebung: `PMH_ROOT`, `PMH_BUN`, `PMH_PORT`. Reihenfolge überall: **Argument schlägt
Umgebungsvariable schlägt Vorgabe**.

`--status` gibt eine Zeile je Tatsache aus und **sagt, woher sie stammt**:

```text
Wurzel: C:\Users\Chang\prometheus-harness (aus dem Programmordner)
Bun: C:\Users\Chang\.bun\bin\bun.exe (aus dem Benutzerprofil)
Port: 3080 (aus der Vorgabe)
Zustand: laeuft — TCP-Probe auf 127.0.0.1:3080
Adresse: (noch nicht gemeldet — sie erscheint nach dem ersten Start)
Autostart: nicht eingetragen
Protokoll: C:\Users\Chang\prometheus-harness\.pmh-build\pmh-tray.log
```

(So gemessen am 15.10.2026, während der Harness auf 3080 lief.)

## Exit-Codes

| Code | Bedeutung |
|---|---|
| `0` | erledigt — bzw. bei `--status`: **läuft** |
| `2` | die Kommandozeile ergibt keinen Sinn (unbekannter Schalter, fehlender Wert) |
| `3` | es läuft bereits ein Tray (Einzelinstanz) |
| `4` | die Frage wurde beantwortet, und die Antwort ist **läuft nicht** |
| `125` | alles andere; die Meldung nennt den Grund |

## Autostart: eine Verknüpfung, kein Registry-Schlüssel

Der erste Entwurf schrieb `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. **Das ist
verworfen** — der Betreiber hat den einfacheren Weg genannt, und er ist auch der bessere:

| | Verknüpfung im Startup-Ordner | Registry-Wert |
|---|---|---|
| sichtbar | **ja**, eine Datei mit Namen | nein |
| löschen | Datei löschen | Werkzeug nötig |
| Rechte | keine | keine |

`pmh-tray --autostart on` legt sie an:

```text
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Prometheus Harness.lnk
```

Sie zeigt auf `pmh-tray-gui.exe` (ohne Konsole) und hat das Projektverzeichnis als
Arbeitsordner. Der Task-Manager listet sie unter **„Autostart von Apps"**.

**Zwei Ordner, die man nicht verwechseln darf:**

- `%APPDATA%\…\Startup` — dieser Benutzer, **ohne** Administratorrechte. Diesen benutzt
  das Programm.
- `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup` — **alle** Benutzer,
  Schreiben braucht **Administratorrechte**. Wer den meint, legt die Verknüpfung selbst
  mit erhöhten Rechten hinein; das Programm fasst ihn nicht an.

Man kann sie auch von Hand anlegen: Rechtsklick auf `pmh-tray-gui.exe` →
*Verknüpfung erstellen* → in den Startup-Ordner verschieben (`shell:startup` in
*Ausführen* öffnet ihn).

## Woher die Pfade kommen

| Wert | Reihenfolge |
|---|---|
| Wurzel | `PMH_ROOT` → Programmordner aufwärts bis `scripts/start.mjs` → Arbeitsverzeichnis aufwärts |
| Bun | `PMH_BUN` → `%USERPROFILE%\.bun\bin\bun.exe` → `bun.exe` in `PATH` |
| Port | `--port` → `PMH_PORT` → `3080` |

**Warum bei Bun die Reihenfolge zählt — gemessen:** auf dieser Maschine ist `bun` in
`PATH` die Hülle `…\npm\bun.ps1`, und die Ausführungsrichtlinie des Benutzers steht auf
`Restricted`. Ein Aufruf dieser Hülle endet mit *„das Ausführen von Skripten ist
deaktiviert"*. Ein Tray, der sie startet, zeigt als einziges Verhalten: **nichts
passiert**. Das Programm nimmt deshalb `bun.exe`, niemals `.ps1` oder `.cmd`.

Ein ausdrücklich gesetztes `PMH_ROOT`, das **kein** Projektordner ist, führt zu einem
Fehler — nicht zu einer stillen Suche woanders. Ein Start im falschen Ordner ist genau
die stille Abweichung, die dieses Programm vermeiden soll.

## Warum die Adresse den Token enthält

Die Oberfläche antwortet **401** ohne den Token. Ein Menüpunkt, der
`http://127.0.0.1:3080/` öffnet, wäre befolgbar und trotzdem falsch — er führt auf eine
Fehlerseite, während alles läuft.

Der Token steht in der Ausgabe des Hosts, und die kommt in **Stücken**: ein Stück kann
mitten im Token enden. Die Regel aus [`scripts/token-address.mjs`](../../scripts/token-address.mjs)
ist deshalb nachgebaut und getestet (`src/token.rs`):

| Der Host … | und die Adresse ist … | also |
|---|---|---|
| schreibt eine neue Zeile | zu Ende | vollständig |
| beendet die Ausgabe | zu Ende | vollständig |
| schreibt weiter | offen | warten |
| — | Token hat volle Länge (43) | vollständig, sofort melden |

Nur die letzte Zeile ist eine Annahme — sie macht die Meldung **später**, nie falsch.
Kennt das Tray keinen Token (weil der Harness aus einer Konsole läuft), bleibt
„Im Browser öffnen" **ausgegraut** statt auf eine 401-Seite zu führen.

## Was beim Stoppen wirklich endet

`scripts/start.mjs` startet den Host **und** die Go-Dienste. Nur den Bun-Prozess zu
beenden ließe sie stehen, mit belegten Ports. Deshalb kommt der Harness in ein **Job
Object** mit `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`: das Schließen des Handles beendet den
Baum — auch dann, wenn das Tray selbst abgeschossen wird.

**Der Restwettlauf ist benannt, nicht versteckt:** das Kind kommt wenige Mikrosekunden
nach dem Start in das Job. Was es in diesem Fenster selbst startet, entkäme dem Job. In
der Praxis ist das Erste, was es startet, der Bau der Welt (`vite build`, gemessen
~220 ms) — drei Größenordnungen später. Ein Fenster, nicht null.

## Bekannte Grenzen (gemessen, nicht behauptet)

- **Das Symbol ist in dieser Umgebung nicht messbar.** `Shell_NotifyIconW(NIM_ADD)`
  antwortet **FALSE** — und zwar für den vollständigen Aufruf wie für ein Minimum, mit
  gezeichnetem wie mit Bestandsicon. Fensterstation `WinSta0`, Desktop `Default`,
  Sitzung 1, `explorer` läuft, die Taskleiste ist sichtbar und nimmt Fensternachrichten
  an; der Fehler bleibt trotzdem. **Zur Einordnung:** dieselbe Verweigerung ist mit der
  etablierten Bibliothek `tray-icon` gemessen worden — sie *verschluckt* sie allerdings
  und meldet Erfolg, während ihr `NIM_DELETE` danach fehlschlägt. Der Aufrufer ist damit
  nicht die Ursache; die Agent-Sandbox dieser Shell ist es. **Prüfbefehl für eine
  normale Sitzung:** `pmh-tray --probe-tray` (Doppelklick im Explorer).
- **Kein Dienst, kein Start vor der Anmeldung.** Autostart heißt hier: nach der
  Anmeldung. Vor der Anmeldung zu starten bräuchte Administratorrechte und wäre ein
  Hintergrunddienst — nicht ein Symbol im Infobereich.
- **Das Tray startet, was schon läuft, nicht doppelt.** Antwortet der Port bereits,
  sagt der Menüeintrag das und graut *Starten* aus.
- **PostgreSQL und Docker ersetzt es nicht.** Fehlt die Datenbank, meldet der Harness
  das selbst; das Tray kann es nur weiterreichen.
- **Eine Verknüpfung trägt keinen Token.** Nach einem Autostart-Start erbt das Tray
  keinen Token von einem früheren Lauf, sondern liest ihn aus der eigenen Ausgabe.

## Bauen und Testen

```powershell
cargo build -p pmh-tray            # beide Binaries
cargo test  -p pmh-tray            # 35 Tests (29 Unit + 6 Vertrag), gemessen 15.10.2026
cargo build --release -p pmh-tray
```

Die fertigen Release-Binaries liegen danach unter `target\release\`. Für den
täglichen Gebrauch liegen sie zusätzlich in [`bin/`](bin/) — dort steht auch die
kurze Bedienungsanleitung [`bin/README.md`](bin/README.md). Die Verknüpfung
`Prometheus Tray.lnk` im Projektordner zeigt auf `bin\pmh-tray-gui.exe` und öffnet
kein Konsolenfenster.

Nur die Bibliothek (läuft auch ohne Windows-GUI):

```powershell
cargo test -p pmh-tray --lib
```

## Tests

| Datei | Was sie prüft |
|---|---|
| `src/token.rs` | die Adressregel: Stückgrenze mitten im Token, zu kurzer Token, Schleifen-Adressen, Zeilenende durch `\n` und `\r`, Adresse ohne Umbruch, „genau einmal melden" |
| `src/config.rs` | Reihenfolge Argument/Variable/Vorgabe, unbrauchbare Ports, Wurzel- und Bun-Suche (mit exakten Pfaden — ein Teiltreffer würde einen kaputten Suchlauf verdecken), Zustandsdatei, Ableitung des GUI-Zwillings |
| `src/autostart.rs` | Startup-Ordner **dieses** Benutzers (nicht `ProgramData`), PowerShell-Maskierung, das erzeugte Skript, Ablehnung eines fehlenden Ziels |
| `src/health.rs` | belegter Port wird erkannt, freigegebener nicht |
| `tests/cli.rs` | `--help` nennt jeden Schalter, `--version`, Exit 2 bei Tippfehler, Exit 2 ohne `--autostart`-Wert, Exit 125 bei `--port 0`, Form der `--status`-Zeilen |

**Nicht abgedeckt:** der Infobereich selbst (siehe Grenzen — dafür gibt es
`--probe-tray`), das Anlegen der Verknüpfung auf einer echten Maschine (es schreibt in
`%APPDATA%`), und das Stoppen eines echten Prozessbaums im Test.
