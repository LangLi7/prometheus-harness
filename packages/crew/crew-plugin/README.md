# `crew-plugin` — die Units im Host

> **Zweck.** Das Cordis-Plugin, das die Einzelteile in den **laufenden** Host hängt: Crew-Adapter am
> Kern-Seam, die Werkzeuge in der Tool-Registry, die Buchung am `llm/stream`-Waterfall.

## 1. Was `apply` tut

| Schritt | Ruf an den Kern | Wirkung |
|---|---|---|
| 1 | `ctx.llm.registerAdapter(['crew'], new CrewAdapter(ctx.llm, crews))` | jede Crew erscheint als Modell und wird geroutet |
| 2 | `ctx.tools.register(alsKernWerkzeug(…))` je Werkzeug | `crew_plan`, `crew_todo`, `crew_todo_status`, `crew_workspace` (+ `modlens_read_image`, `tools_search`, `tools_fetch` wenn eingerichtet) |
| 3 | `ctx.on('llm/stream', …)` | jede `usage` wird **je Nutzer** gebucht; der Wasserfall wird durchgereicht |

```ts
import { apply, type Konfiguration } from '@prometheus-harness/crew-plugin'

const konfiguration: Konfiguration = {
  crews: [{ id: 'crew-1', rollen: { executor: { familie: 'deepseek-official', modell: 'deepseek-flash' } } }],
  crew: 'crew-1',
  nutzer: 'anna',
  projekt: 'C:/projekt',
  verzeichnis: '<home>/pmh/crew',
  // modlens: { cliPfad: '…/modlens/dist/main.js', ausfuehren: kindprozess },
  // suche:   { apiKey: '<schluessel>', hole: fetchWeg },
}
const abmelden = apply(ctx, konfiguration)
```

## 2. Warum die Werkzeugbrücke nötig ist

Der Kern verlangt mehr als Name und Funktion: `ToolDefinition` trägt **Ausgabeschema** und **reine
Darstellung**, und `execute` liefert den **kanonischen Wert**. Unser `AgentTool` liefert Text. Die
Brücke (`alsKernWerkzeug`) parst das JSON, lässt Nicht-JSON als Text durch und gibt `{type:'object'}`
als Schema — offen, weil die Berichte der Werkzeuge wechseln. Ein engeres Schema ist eine Angabe.

## 3. Prüfen

```powershell
& C:\Users\Chang\.bun\bin\bun.exe test            # im Paketordner: 19 pass, 0 fail, 59 expects
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/crew/crew-plugin/tsconfig.json   # exit 0
```

Geprüft gegen einen **nachgebauten** Kontext: die Route `crew` geht an den Kern, vier Werkzeuge
werden angemeldet (mit Schema und Darstellung), der Wasserfall reicht `usage` und `finish` durch und
bucht dabei, und `abmelden` nimmt Adapter, Werkzeuge und Zuhörer zurück. Dazu die drei Protokoll-
Formen (cordis-Dienst, schlichtes Objekt, fehlender Dienst) und die Home-Auflösung.

## 4. Die Konfiguration aus der Datei — der Loader-taugliche Weg

`applyAusDatei(ctx, wurzel)` liest `<wurzel>/crew/config.json` und unterscheidet **drei** Fälle:

| Fall | Verhalten |
|---|---|
| Datei **fehlt** | **nichts** einhängen, ein Satz ins Protokoll („keine Konfiguration unter …") — der Host startet weiter |
| Datei **kaputt** (kein JSON, keine Crews, kein `nutzer`) | **werfen** — ein vorhandener Fehler bleibt sichtbar |
| Datei **gültig** | einhängen; Ablage unter `<wurzel>/crew` (Pläne und Verbrauch neben der Datei) |

Das ist der Unterschied zwischen „noch nicht eingerichtet" und „kaputt": nur der zweite Fall darf ein
Protokoll rot machen, und nur der erste darf still bleiben. Deshalb ist `applyAusDatei` der Einstieg,
den ein Loader-Eintrag nimmt — `apply` mit fester Konfiguration bleibt für Einbettungen.

**Was ein Wurf im Loader wirklich tut**, steht in §6: der Eintrag wird nicht aktiv, der Stapel steht
im Protokoll, der Host läuft weiter. „Fail-closed" heißt hier also „nichts halb Eingehängtes", nicht
„Boot tot" — die Prüfung kommt vor der ersten Anmeldung am Kern.

```json
{
  "crews": [{ "id": "crew-1", "rollen": { "executor": { "familie": "deepseek-official", "modell": "deepseek-flash" } } }],
  "crew": "crew-1",
  "nutzer": "anna",
  "projekt": "C:/projekt"
}
```

## 5. Grenzen — gemessen, nicht weggelassen

1. **Der Nutzer kommt aus der Konfiguration.** `GenerateOptions` trägt keinen Nutzer; die Sitzung
   kennt ihn nicht (gemessen, §11 der Installationsliste). Ohne `nutzer` startet das Plugin nicht —
   fail-closed, weil ein Sammelkonto die Nutzertrennung zur Behauptung macht.
2. **Eine Crew, ein Projekt für die Werkzeuge.** `crew` und `projekt` stehen in der Konfiguration;
   eine Sitzung mit anderer Crew bekommt weiterhin den Plan dieses Bereichs. Ein Rateweg wäre
   schlechter als die benannte Grenze.
3. **Die Buchung ist im Hintergrund.** Sie blockiert keine Antwort; ein Fehler geht ins Protokoll.
   Ein verschluckter Fehler wäre schlimmer als ein lauter.
4. **Kein Bildteil in unserem Seam.** Das Werkzeug `modlens_read_image` ist der Weg; der Kern-Seam
   (Adapter) trägt Bilder, unser `LlmProvider.complete` nicht.
5. **Eine Funktion kommt nicht aus JSON.** `suche` und `modlens` verlangen einen Weg (`hole` bzw.
   `ausfuehren`). Für die Suche gilt `netzHole()` als Vorgabe, also ist sie aus `<home>/crew/config.json`
   einschaltbar. Für die Bildbrücke **nicht**: `child_process.spawn` mit `stdio: 'pipe'` scheitert in
   dieser Umgebung an der Sandbox (`EPERM`, gemessen mit einer eigenen Sonde), und ein Runner, der
   hier nie läuft, wäre kein Beleg. Sie braucht den programmatischen Weg
   `apply(ctx, konfiguration)`.

## 6. Im Host gemessen (Kern 0.2.1, Profil `web`)

Die Zeile steht seit dieser Änderung in `scripts/profile-patch.mjs` (`EIGENE_PAKETE`) und wird vom
Loader geladen. Drei Messungen mit `--home .pmh-build/harness-home`:

| Fall | Startprotokoll |
|---|---|
| Datei **gültig** | `[pmh] pmh-crew: eingehaengt — Crew "crew-1", Nutzer "operator", 4 Werkzeuge, Buchung am llm/stream` |
| Datei **fehlt** | `[pmh] pmh-crew: keine Konfiguration unter C:\…\.pmh-build\harness-home\crew\config.json — nichts eingehaengt (Crews, Nutzer und crew eintragen)` |
| Datei **kaputt** (`{"crews": []}`) | `pmh: warning: 2 entries did not activate` + `pmh-crew-plugin (…): Error: …crew\config.json: die Liste "crews" ist leer` — der Host läuft weiter |

Vier Lehren, die im Code stehen und hier ihre Belege haben:

1. **Ein werfendes `apply` hält den Host nicht an.** Der Eintrag zählt als „did not activate", der
   Stapel steht im Protokoll, der Kern startet trotzdem. Die Zusage bleibt „nichts halb
   Eingehängtes" (die Prüfung kommt vor der ersten Anmeldung) — nicht „Boot tot".
2. **`ctx.logger` ist aufrufbar** (`ctx.logger('name').warn(…)`). `ctx.logger?.warn?.(…)` schreibt
   ins Nichts; das war ein echter Fehler hier.
3. **Der Logger allein ist unsichtbar.** `dsh-app-boot` hängt den einzigen Exporter mit
   `levels: { default: 2 }` ein und sammelt nur `warn`/`error` für die Startdiagnose
   (`lib/index.js:4213`) — und auch die erscheinen nur im Bericht über **fehlgeschlagene** Einträge.
   Deshalb schreibt jede Zeile zusätzlich auf `stderr` (`[pmh] pmh-crew: …`, wie `pmh-auth-http`).
4. **`DSH_HOME` kommt wörtlich, also relativ.** Bei `--home .pmh-build/harness-home` war der Wert
   genau dieser Text; `homeAusUmgebung()` macht ihn absolut. `PMH_HOME` wird **nicht** gelesen — das
   ist das eigene Home dieses Projekts, und mit `PMH_HOME` auf das Harness-Home verweigerte
   `pmh-auth-http` den Start.

