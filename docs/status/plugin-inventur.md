# Plugin-Inventur — welche Kernpakete in unserem Host wirklich laufen

> **Warum dieses Dokument existiert.** Die Frage „welche der installierten
> Kernpakete sind bei uns **aktiv**?" ließ sich lange nicht beantworten, und ich
> habe zweimal **geraten** statt gemessen. Seit dem 14.10.2026 gibt es einen
> Meßweg: `pluginInventory/list` über die Kern-API. Dieses Dokument hält die
> Methode, die Zahlen und die **Widerrufe** fest.

## Der Meßweg

Sonde: [`messsonden/plugin-inventur.mjs`](messsonden/plugin-inventur.mjs) ·
Rohbeleg: [`plugin-inventur.json`](plugin-inventur.json)

```powershell
bun docs/status/messsonden/plugin-inventur.mjs 3097
```

Die Sonde startet einen Host auf eigenem Port (`--no-go`), holt sich über den
Token-Link ein Auth-Cookie und ruft **eine** lesende Remote-Methode auf. Sie
ändert nichts. Der Vertrag der Methode ist:

```
id:          '@deepseek-ai/dsh-host-plugin-inventory#pluginInventory/list'
invocation:  { kind: 'direct' }
parameters:  []                      <-- KEINE Parameter
result:      strict, PluginInventorySnapshot
```

Die Sonde **prüft diese Vorbedingung, bevor sie sendet**: findet sie die
Vertragsdatei nicht oder ist `parameters` nicht leer, bricht sie mit Exit 2 ab,
statt zu senden.

## Das Ergebnis (14.10.2026, Port 3097)

| Größe | Wert |
|---|---|
| Einträge im Loader | **191** |
| davon `enabled` | **163** |
| davon Lebensphase `active` | **163** |
| davon `failed` | **0** |
| Einträge mit `fiberPhase: null` | **28** |
| Agent-Presets | **4** |
| Persistente Profilverwaltung | verfügbar |

**`enabled` und `active` sind hier deckungsgleich (163 = 163).** Es gibt in diesem
Host **keinen** Eintrag, der aktiviert ist und **nicht** lebt, und keinen, der
lebt und **nicht** aktiviert ist.

Agent-Presets:

| Preset | Zeilen | davon `active` | Vorgabe |
|---|---|---|---|
| `standard` | 28 | 26 | **ja** |
| `ptc` | 29 | 25 | |
| `minimal` | 6 | 4 | |
| `cordis` | 29 | 28 | |

## Der Befund, der meinen Arbeitsplan umgeworfen hat: es gibt **zwei** Zusammensetzungen

Mein erster Auswertungsversuch verglich „installiert" gegen „aktiv" und stieß auf
einen **Widerspruch**: `@deepseek-ai/dsh-tool-pwsh` stand als `enabled=false,
phase=null` — obwohl eine **frühere Lebendmessung** einen `tool/call` mit dem
Werkzeugnamen **`pwsh`** gesehen hatte. Etwas Wirkliches kann nicht inaktiv sein.

Die Auflösung ist die Architektur, nicht ein Fehler:

1. **Der Host-Loader** (`entries`, 191) hält die Zusammensetzung des **Hosts**.
2. **Die Agent-Preset-Zeilen** (`agentPresets[].rows`) halten die Zusammensetzung
   **je Sitzung**.

Ein Werkzeug ist auf **Host**-Ebene absichtlich **aus** und in der Preset-Zeile
**an**:

| Modul | Host-Eintrag | Zeile im Standard-Preset |
|---|---|---|
| `dsh-tool-pwsh` | `enabled=false`, keine Faser | `enabled=true`, **active** |
| `dsh-tool-fs` | `enabled=false`, keine Faser | `enabled=true`, **active** |
| `dsh-tool-fs-search` | `enabled=false`, keine Faser | `enabled=true`, **active** |
| `dsh-tool-jobs` | `enabled=false`, keine Faser | `enabled=true`, **active** |
| `dsh-tool-schedule` | `enabled=false`, keine Faser | `enabled=true`, **active** |
| `dsh-tool-todo` | `enabled=false`, keine Faser | `enabled=true`, **active** |
| `dsh-tool-web` | `enabled=false`, keine Faser | `enabled=true`, **active** |
| `dsh-tool-skill` | `enabled=false`, keine Faser | `enabled=true`, **active** |
| `dsh-tool-subagent` | `enabled=false`, keine Faser | `enabled=true`, **active** (2 Zeilen) |
| `dsh-tool-bash` | `enabled=false`, keine Faser | `enabled=false`, keine Faser |
| `dsh-compaction-basic` | `enabled=false`, keine Faser | `enabled=true`, **active** |
| `dsh-command-compact` | `enabled=false`, keine Faser | `enabled=true`, **active** |
| `dsh-compaction-tool-result-pruner` | `enabled=false`, keine Faser | `enabled=true`, **active** |

`dsh-tool-bash` ist in **beiden** Zusammensetzungen aus — richtig, denn der Host
läuft auf Windows und hat kein `bash`. Das ist **plattformbedingt**, keine Lücke.

**Die Lehre:** „`enabled=false` im Loader" ist **kein** Lückenbefund. Wer nur die
191 Einträge liest und daraus „diese Werkzeuge fehlen" schließt, schreibt einen
**falschen Lückenbericht** — und genau dieser Fehler stand kurz vor mir.

## Was tatsächlich aktiv ist

Gemessen über die 163 aktiven Host-Einträge und die Preset-Zeilen:

| Familie | aktiv | Beispiele |
|---|---|---|
| **Sitzung** | **17** | `dsh-session`, `session-log-deepseek`, `session-persistence-jsonl`, `session-query-sqlite`, `session-projection`, `api-session-controller` |
| **Einstellungen** | **14** | `dsh-settings`, `api-settings-controller`, `client-ui-settings-*` (10) |
| **Sandbox** | **4** | `sandbox-local`, `sandbox-policy`, `pwsh-sandbox`, `fs-sandbox` |
| **Speicher** | **3** | `dsh-storage`, `storage-json`, `storage-domain` |
| **Typert (Pluginsystem)** | **2** | `typert-registry`, `typert-loader` |
| **Skill** | **2** | `dsh-skill`, `client-ui-skill` |
| **Verdichtung** | **3 + 1** | im Standard-Preset: `compaction-basic`, `command-compact`, `compaction-tool-result-pruner`; hostweit: `compaction-image-offload` |
| **Sprache** | **1** | `client-locale` |
| **Anmeldedaten** | **1** | `credentials-local` |

**Dazu läuft unser eigener Code im Host.** Drei Pakete aus *unserem* Baum sind
aktive Loader-Einträge — sie liegen nicht in `node_modules`, sondern werden aus
dem Arbeitsbereich geladen:

- `@prometheus-harness/auth-http`
- `@prometheus-harness/health`
- `@prometheus-harness/readiness`

## Echte Lücken — jetzt gemessen, nicht vermutet

| Familie | installiert | im Loader | in Preset-Zeilen |
|---|---|---|---|
| `lsp` | **0** | 0 | 0 |
| `identity` | **0** | 0 | 0 |
| `guard` | **0** | 0 | 0 |
| `acp` | **0** | 0 | 0 |

Diese vier sind **nirgends vorhanden** — nicht installiert, nicht konfiguriert,
in keiner Preset-Zeile. Sie sind damit die einzigen **echten Neubauten** in dieser
Liste. Alles andere war **Komposition**, und die ist **getan**.

## Widerrufe — Aussagen dieses Projekts, die diese Messung widerlegt

### 1. „Die Inventur-API ist einer von sechs kaputten Codecs" — **falsch, meine Schuld**

Ich hatte den Umschlag `{request:{…}}` von `session/create` — einer Methode **mit**
Request-Parameter — auf eine **parameterlose** Methode übertragen. Der Codec-Fehler
war **mein Aufruf**, nicht der Kern. Die Methode antwortet mit `parameters: []`
einwandfrei. Die Sonde prüft den Vertrag jetzt **vor** dem Senden, damit dieser
Fehler sich nicht als „Kern kaputt" wiederholt.

### 2. „Verdichtung fehlt" — **falsch** (README und `grenzen-und-offenes.md`)

Das Standard-Preset aktiviert drei Verdichtungs-Plugins, alle `phase=active`. Die
Aussage stand in `README.md`, `README.de.md` und `grenzen-und-offenes.md` und ist
dort am 14.10.2026 richtiggestellt.

**Was weiterhin gilt:** belegt ist die **Komposition**, nicht das **Verhalten**.
Keine Messung zeigt bisher, daß die Verdichtung in einer langen Sitzung
**wirklich auslöst**. Das ist die verbleibende, ehrliche Lücke — eine andere als
die behauptete.

### 3. „`apps/web/src` hat 5 Dateien" — **falsch**, es sind **8**

Gezählt am 14.10.2026. Die Aussage stand in beiden READMEs und in
`grenzen-und-offenes.md`.

### 4. „Vier Sätze aus dem README" — **falsch**, die eigene Tabelle hatte fünf Zeilen

Der Zähler widersprach dem Inhalt **im selben Dokument**.

**Das ist der unangenehmste Befund dieses Dokuments:** die drei zuletzt genannten
Fehler standen **im Dokument, dessen Aufgabe es ist, veraltete Aussagen
richtigzustellen**, und in der Sektion, die sich „Named, measured, and not talked
up" nennt. Eine Ehrlichkeits-Sektion schützt nicht vor veralteten Zahlen — nur
eine **wiederholte Messung** tut das.

## Fallstricke, die bei dieser Messung auftraten

**`$host` ist in PowerShell schreibgeschützt.** Meine Vergleichstabelle benutzte
`$host = …` für die Host-Spalte. PowerShell hat `$host` als **automatische,
schreibgeschützte** Variable belegt; die Zuweisung schlug fehl, und die Spalte
blieb **leer** — ein vakuöses Ergebnis, das wie „kein Wert" aussah. Umgangen durch
`$h`. Die Lehre ist allgemeiner: **eine leere Spalte ist ein Fehler, kein Wert.**

**Die Nutzlast der Antwort liegt unter `result.value`, nicht unter `value`.**
Der HTTP-Körper hat **zwei** Hüllen: außen `{type, rpcId, result}`, innen die
Nutzlast. Meine erste Sonde suchte sie eine Ebene zu hoch und sah eine leere,
aber vollständige Antwort.

## Wie dieses Dokument nachprüfbar bleibt

```powershell
bun docs/status/messsonden/plugin-inventur.mjs 3097   # Exit 0 = kein Eintrag gescheitert
```

Die Sonde endet mit **Exit 0**, wenn **kein** Eintrag `failed` ist und der Loader
nicht leer ist; mit **Exit 1**, wenn Einträge gescheitert sind; mit **Exit 2**,
wenn die Vorbedingung verletzt ist und **nichts** gesendet wurde. Ein Exit 0 mit
leerer Liste ist damit nicht möglich.
