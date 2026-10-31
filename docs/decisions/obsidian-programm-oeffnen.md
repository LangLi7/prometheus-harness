# Entscheidung: Obsidian als Programm öffnen

> **Anlass.** Der Betreiber: *„es fehlt noch die möglichkeit obsidian zu öffnen
> oder so falls es installiert ist als programm und auch in seitlich."*
>
> Der Vault war längst im Harness lesbar — als Panel, als Graph, als drei
> Agent-Werkzeuge. **Das Programm selbst** ließ sich von hier aus nicht starten.

## 1. Der Befund, der die Erkennung bestimmt (gemessen am 21.10.2026)

| Prüfung | Ergebnis |
|---|---|
| `%LOCALAPPDATA%\Obsidian\Obsidian.exe` | **fehlt** |
| `%ProgramFiles%\Obsidian\Obsidian.exe` | **fehlt** |
| `%LOCALAPPDATA%\Programs\Obsidian\Obsidian.exe` | **vorhanden** |
| `HKCU\Software\Classes\obsidian\shell\open\command` | `"…\Programs\Obsidian\Obsidian.exe" "%1"` |
| Uninstall-Eintrag `Obsidian` | `DisplayIcon = …\Programs\Obsidian\Obsidian.exe,0` |
| Vault-Register `%APPDATA%\obsidian\obsidian.json` | ein Vault: `D:\Windows\Dokumente\Obsidian Vault` |

**Was daran überrascht.** Der verbreitete Windows-Ort ist
`%LOCALAPPDATA%\Obsidian`, und genau dort liegt das Programm **nicht**. Obsidians
per-Benutzer-Installer legt es unter `…\Local\Programs\Obsidian` ab. Eine
Erkennung nur am „bekannten" Ort hätte „nicht installiert" gemeldet, obwohl das
Programm da ist — deshalb steht der gemessene Ort **vor** dem angenommenen.

## 2. Die Entscheidung: das Protokoll, nicht der Pfad

`Obsidian.exe` nimmt **keinen Ordner** als Argument. Der registrierte Weg ist

```
obsidian://open?path=<absoluter Pfad>
```

und er gilt laut Obsidian-Dokumentation für einen **Vault** *und* für eine
**Datei darin**. Damit braucht der ganze Weg genau **eine** Adressform — kein
Sonderfall „Vault" neben „Notiz".

**Verworfen:** das Programm mit dem Ordner als Argument starten. Es tut nichts
Sichtbares; ein Knopf, der scheinbar nichts tut, ist schlechter als keiner.

## 3. Warum **nicht** im „Öffnen mit"-Menü des Kerns

Das Menü im Datei-Explorer ist `@deepseek-ai/dsh-host-open-in-app`. Drei
Messungen sprechen dagegen, es dafür zu verbiegen:

| Befund | Folge |
|---|---|
| Der Katalog ist eine **feste Tabelle im gebündelten Kern** (`lib/index.js`), die Konfiguration kennt nur Zeitlimits | ein Eintrag ist nur durch Eingriff in den Kern möglich |
| Der **Client filtert** Apps über `APP_LABEL_KEY[id] !== undefined` — unbekannte Kennungen verschwinden | eine zweite Kern-Stelle (Client-Bündel) müßte mitgeändert werden |
| Die Beschriftung ist ein Schlüssel des Sprachpakets; die 2 374 Texte sind gegen die Kern-Quelle **abgezählt** | ein neuer Schlüssel bräche die Zählung des Sprachbündels |

Dazu der sachliche Einwand: dieses Menü übergibt einen **Ordner**. Obsidian
öffnet einen **Vault**. Ein Eintrag dort würde also entweder den Arbeitsbereich
öffnen (den Obsidian nicht als Vault kennt) oder den Vault (dann wäre der
übergebene Pfad eine Lüge).

**Entscheidung:** eigener Weg im eigenen Plugin. Der Preis ist ein Knopf mehr in
unserer Oberfläche; der Gewinn ist, daß kein Kern-Bündel angefaßt wird.

## 4. Die vier Orte, und warum jeder einzelne

| Ort | Was er tut | Warum dort |
|---|---|---|
| Kopfzeile des Panels | öffnet den **Vault** | dort steht, welcher Vault gilt |
| Werkzeugleiste der Notiz | öffnet **diese Notiz** | der Bezug ist die Auswahl, nicht das Panel |
| Fuß der Seitenleiste | öffnet den **Vault** | aus dem Chat heraus, ohne das Panel zu suchen |
| rechtes Dock (Tab-Typ) | zeigt **dasselbe Panel** | der Vault neben dem Chat statt an seiner Stelle |

Der Seitenleisten-Knopf sitzt in `sidebar.footer.action` und **nicht** in
`sidebar.panellist`: letzteres adressiert ein Haupt-Panel und würde den Vault
öffnen — nicht das Programm.

## 5. Grenzen — ehrlich

* **Nur Windows geprüft.** macOS (`/Applications/Obsidian.app`) und Linux
  (`obsidian` im PATH) stehen im Katalog, sind auf diesem Rechner aber nicht
  gemessen.
* **„Gestartet" heißt nicht „sichtbar".** Der Start geht über die Shell
  (`cmd /c start`, `open`, `xdg-open`); ob ein Fenster erscheint und den Fokus
  bekommt, wird nicht geprüft.
* **Die Registry ist Rückfall, nicht Bedingung.** Fehlt `reg` oder der Eintrag,
  bleibt die Pfadliste — das Ergebnis ist dann „nicht gefunden", kein Fehler.
* **Ein Pfad außerhalb des Vaults wird abgewiesen** (dieselbe Prüfung wie beim
  Lesen). Das Öffnen ist kein zweiter Weg an der Prüfung vorbei.
