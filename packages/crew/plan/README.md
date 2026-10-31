# `crew-plan` — der Planungskern einer Crew

> **Zweck.** Eine Crew ist erst dann mehr als ein Modellname, wenn sie **planen** und **ausführen**
> kann: der Planer zerlegt ein Ziel, die Rollen arbeiten die Schritte ab, ein Prüfer beanstandet,
> und der Stand überlebt Neustart und Verdichtung. Dieses Paket enthält genau diesen Kern — ohne
> Harness, ohne Netz, ohne Modell.

## 1. Was es kann

| Baustein | Datei | Aufgabe |
|---|---|---|
| Rollen und Dokumente | `src/types.ts` | sechs Rollen, Ziele, Aufgaben, Projektebene, Grenze 200 |
| Nutzer und Projekt | `src/scope.ts` | Pfadsegment je Nutzer, Projekt-Etikett aus Pfad + Abdruck |
| Ändern und Ablegen | `src/state.ts` | reine Änderungen, atomarer Speicher, Kette je Dokument |
| Zerlegen und Ausführen | `src/plan.ts` | Plan aus Modellantwort, Wellen, Prüfschleife, Token-Budget |
| Die vier Werkzeuge | `src/tools.ts` | `crew_plan`, `crew_todo`, `crew_todo_status`, `crew_workspace` |

Ausführen (Beispiel, ohne Harness):

```ts
import { fuehreAus, zerlegePlan } from '@prometheus-harness/crew-plan'

const plan = zerlegePlan(planerAntwort, 'Shop bauen')
const lauf = await fuehreAus({
  crew: 'crew-1',
  ziel: 'Shop bauen',
  plan,
  rufe: async (rolle, auftrag) => ({ text: await frageModell(rolle, auftrag), tokens: { hinein: 0, heraus: 0 } }),
})
// lauf.urteil === 'pass' | 'fail' | 'exhausted', lauf.ergebnisse, lauf.tokens
```

## 2. Der Vertrag

| Wer | Was es braucht |
|---|---|
| `fuehreAus` | eine Funktion `rufe(rolle, auftrag) → { text, tokens }` — wie sie das Modell erreicht, ist nicht Sache dieses Pakets |
| `CrewZustandSpeicher` | ein Verzeichnis (oder keins: dann bleibt alles im Arbeitsspeicher) |
| `crew_*`-Werkzeuge | `crew`, `bereich`, `aufrufer`, `speicher` — die Rolle ist **kein** Parameter des Modells, sondern Teil des Auftrags |

**Ablage:** `<verzeichnis>/<nutzer>/<crew>/<projekt>.json`. Ein fremder Plan ist durch den **Pfad**
unerreichbar, nicht durch eine Abfrage.

## 3. Prüfen

```powershell
& C:\Users\Chang\.bun\bin\bun.exe test            # im Paketordner: 58 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/crew/plan/tsconfig.json  # in der Projektwurzel: 0 Fehler
```

Der Stand vom 18.10.2026: **58 Prüfungen grün, 0 rot, 113 `expect`; Typprüfung exit 0.** Ein Lauf
hat dabei einen echten Fehler gefunden: `fuegeAufgabeHinzu` vergab die freie Kennung `t1` auch
dann, wenn es sie schon gab — drei Prüfungen wurden rot, die Ursache lag in einer Zeile.

## 4. Grenzen — gemessen, nicht weggelassen

1. **Kein Modell, kein Netz.** Wer `fuehreAus` ohne `rufe` aufruft, bekommt keinen Lauf. Die Naht
   (LLM-Adapter, Werkzeugregistrierung, Turn-Hooks) ist **nicht** gebaut; sie ist der nächste Zug
   und steht in `docs/status/plugin-installationsliste.md`.
2. **Der Speicher ist ein Dateisystem, keine Datenbank.** Zwei Prozesse auf demselben Verzeichnis
   verlieren einander (letzter Schreiber gewinnt) — die Kette serialisiert **innerhalb** eines
   Prozesses. Für Prometheus' Mehrbenutzigkeit reicht der Pfad; für Haltbarkeit über Prozesse
   bräuchte es eine Tabelle mit `user_id` (Migration 0004 liefert die Form).
3. **Es gibt keine Migration alter Dokumente.** Ein Dokument mit `fassung !== 1` wird abgewiesen,
   nicht umgedeutet. Der Harness adoptiert Altdateien einmalig (`state.ts:949-979`); dieser Zug
   fehlt hier bewusst, weil es in Prometheus keinen Altbestand gibt.
4. **`helper` ist wählbar, aber kein Ablauf schickt ihr etwas** — genau wie im Harness
   (`config.ts:40` gegen 0 Aufrufstellen). Die Rolle steht im Dokument, damit eine Crew sie binden
   darf; ein toter Aufruf wäre schlimmer als eine benannte Lücke.
5. **Lesen gibt das Dokument selbst zurück.** Wer es außerhalb einer Änderung verändert, verändert
   den Zwischenspeicher. Die Werkzeuge tun das nicht; ein künftiger Aufrufer muß es wissen.
6. **Die Prüfschleife plant nicht neu.** Sie wiederholt dieselbe Schritttabelle mit den Mängeln —
   so wie der Harness (`tool.ts:597-645`). Ein Plan, der am Ziel vorbeigeht, scheitert deshalb nach
   `maxVersuche` mit `fail` statt zu einem neuen Plan zu führen.
