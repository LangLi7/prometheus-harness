# Die Einstiege der Installation — drei Hüllen, ein Kern

> **Warum das ein eigenes Dokument ist.** Im README steht der Aufruf. *Warum* es
> **drei** Dateien dafür gibt und warum die naheliegende Fassung auf einem
> Standard-Windows **nicht lädt**, steht hier — es ist Betriebswissen, kein
> Aushängeschild.

## Die drei Einstiege

| Datei | Für | Verlangt |
|---|---|---|
| `scripts/install.cmd` | Windows, immer — auch per Doppelklick | **nichts** |
| `scripts/install.ps1` | Windows, aus PowerShell | eine Ausführungsrichtlinie, die Skripte erlaubt |
| `scripts/install.sh` | Linux, macOS | `sh` |

## Warum `.ps1` auf einem Standard-Windows nicht lädt

Die Ausführungsrichtlinie ist dort **`Restricted`**. Eine `.ps1` wird deshalb gar
nicht geladen — gemessen, wörtlich:

```
& : Die Datei …\install.ps1 kann nicht geladen werden, weil das Ausführen
    von Skripten auf diesem System deaktiviert ist.
```

Eine **`.cmd`** unterliegt dieser Richtlinie **nicht**. Deshalb ist sie der
Einstieg, den die Anleitung nennt: sie ruft `install.ps1` mit
`-ExecutionPolicy Bypass` **für diesen einen Aufruf** auf und ändert **nichts** an
der Maschine — keine dauerhafte Einstellung, keine Richtlinienänderung.

> **Das ist der ganze Trick, und er ist Absicht:** wer die Richtlinie seines
> Rechners nicht anfassen will, soll sie auch nicht anfassen müssen, um dieses
> Projekt zu installieren.

## Warum die Logik in **einer** `.mjs` steht

`scripts/install.mjs` ist die einzige Fassung der Logik; die drei Hüllen sind
dünn. Eine Shell-Umsetzung hätte auf den Zielrechnern **keinen Interpreter**:

* `sh` fehlt auf Windows,
* `bash` kommt dort nur über WSL — und kann `C:\`-Pfade nicht lesen,
* `unzip` fehlt,
* in einem frischen Alpine-Container fehlt sogar `bash`.

Bun ist die einzige Laufzeit, die auf **allen** genannten Zielen vorhanden ist
oder sich installieren läßt — deshalb ist der Installer in Bun geschrieben und
nicht in der Shell.

## Was der Installer **nicht** installiert

**Docker.** Auf Windows ist der unterstützte Weg **Docker Desktop** — ein Programm
mit eigener Lizenz —, und auf Linux braucht das offizielle Skript **root**. Der
Installer **nennt** den Befehl für die jeweilige Plattform und **hält sichtbar
an**, statt eine Entscheidung über die Lizenz des Benutzers zu treffen.

## Der Ein-Zeilen-Weg ist vorbereitet (gemessen 14.10.2026)

Sobald dieses Repository **öffentlich** ist, ist `curl … | sh` der kürzeste Weg.
Vorbereitet ist er in `scripts/install.sh` — und dabei kam ein **stiller Fehler**
heraus, der bis dahin niemandem aufgefallen war:

```sh
cd -- "$(dirname -- "$0")/.."        # die alte Zeile
```

Bei einem **Rohr** gibt es **keine Skriptdatei**: `$0` ist dann `sh`, `dirname` ist
`.`, und der `cd` landet im **Elternverzeichnis des Aufruforts**. Das Skript hätte
dort „installiert", wo nichts zu installieren ist — **ohne Fehlermeldung**.

**Jetzt gilt:** erst **prüfen** (`istProjekt()` sieht nach `scripts/install.mjs`
**und** `package.json`), dann **holen**. Übersteuerbar mit `PMH_REPO` und
`PMH_VERZEICHNIS`, damit der Weg **ohne Netz** prüfbar ist.

### Die Gegenprobe — im echten Rohr, nicht mit Pfad

> **Eine erste Testfassung prüfte nichts und sah grün aus.** Sie rief
> `sh <pfad>/install.sh` auf. Dann *ist* `$0` dieser Pfad, der Wächter findet
> daneben das Projekt und wechselt — völlig richtig — hinein. Der Rohr-Fall wurde
> **gar nicht berührt**. Erst `sh -s -- < argumente` mit **umgeleitetem Eingang**
> stellt ihn her. Das steht hier, weil der Unterschied nicht sichtbar ist, wenn
> man nur auf Exit-Codes sieht.

| Fall (echtes Rohr: `sh -s -- --ohne-stapel < install.sh`) | Ergebnis |
|---|---|
| Zielordner existiert schon | **exit 1** · **0** Dateien im Ziel (nichts überschrieben) · Meldung „gibt es hier schon" |
| leeres Verzeichnis | **geklont: JA** · **vollständig: JA** (`unser/scripts/install.mjs`) · „Geholt nach … die Installation läuft dort weiter." |

**Ehrlich dazu:** im zweiten Fall kommt der Exit-Code **1** vom **inneren** Installer
im geklonten Baum — dort scheitert in WSL **Bun** an seinem eigenen postinstall
(*„Bun's postinstall script was not run"*). Bewiesen ist damit der **Weg** (prüfen →
holen → übergeben), **nicht** die Installation darin. Das ist eine eigene
Baustelle des Linux-Wegs und gehört in die Betriebsnachweise.

## Der Ablauf in sieben Schritten


Der Installer meldet `[n/7]` und endet mit dem Startbefehl. Ohne Datenbank läuft er
mit `--ohne-stapel`; die PostgreSQL-Prüfungen **überspringen sich dann und sagen
das**, statt ohne Datenbank zu „bestehen".

Zwei Fehler sind es wert, erkannt zu werden:

* **Kennwort-Konflikt** zwischen `.env` und einem **laufenden** PostgreSQL-Container
  — PostgreSQL legt Rollen und Kennwörter nur beim **ersten** Start eines leeren
  Datenverzeichnisses an. Der Installer nennt beide Wege heraus, samt Preis.
* **Docker fehlt oder ist nicht erreichbar** — der Installer nennt den
  plattformspezifischen Befehl, der das behebt.

## Wo die Werte herkommen und wie sie ankommen

Der Installer schreibt `.env` (Kennwörter, Datenbankadressen) und legt damit die
Grundlage für `bun run start`.

> **Nachtrag 14.10.2026 — eine Notiz im Installer war zu vorsichtig.** Dort stand,
> `.env` zu laden sei „Sache der Shell". **Gemessen:** Bun lädt `.env` **selbst**
> (im Projekt *und* in einem frischen Ordner mit eigener `.env`); die Werte stehen
> dem Prozeß zur Verfügung, ohne daß eine Shell sie exportiert. Die Notiz gilt für
> `docker exec`, nicht für `bun run start`.

**Ehrliche Grenze:** geladen wird aus dem **Arbeitsverzeichnis**. Wer den Host aus
einem anderen Ordner startet, verliert die Einstellung **lautlos**. Deshalb liest
`scripts/start.mjs` die Datei **relativ zu seinem eigenen Pfad** — das ist
deterministisch, das Arbeitsverzeichnis ist es nicht.
