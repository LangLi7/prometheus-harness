# `crew-provider` — die Naht zwischen Planungskern und Seam

> **Zweck.** `crew-plan` plant und führt aus, kennt aber keinen Modellaufruf. Der Seam von
> Prometheus kennt Modellaufrufe, aber keine Rollen. Dieses Paket bringt beides zusammen — als
> **Anbieter**, nicht als Umbau des Kerns.

## 1. Was es kann

| Baustein | Datei | Aufgabe |
|---|---|---|
| Crew als Anbieter | `src/adapter.ts` | `crewAnbieter` — ein `LlmProvider` namens `crew:<id>`, der je Anfrage die Rolle wählt |
| Prüfung | `src/adapter.ts` | `pruefeCrew` — lehnt eine Rolle ab, die auf die Route `crew` zeigt (Rekursion) |
| Lauf | `src/run.ts` | `crewLauf` — Planer fragen oder Plan hereinreichen, Wellen abarbeiten, prüfen |
| Werkzeuge | `src/tools.ts` | `crewWerkzeuge` — die vier Zustandswerkzeuge als `AgentTool` für den Loop |

```ts
import { crewAnbieter, crewLauf } from '@prometheus-harness/crew-provider'

const crew = {
  id: 'crew-1',
  rollen: {
    planner:  { familie: 'deepseek-official', modell: 'deepseek-v4-pro' },
    executor: { familie: 'deepseek-official', modell: 'deepseek-flash' },
    reviewer: { familie: 'deepseek-official', modell: 'deepseek-v4-pro' },
  },
}

// Als Anbieter im Seam — der Kern sieht nichts Besonderes:
const anbieter = crewAnbieter(crew, { anbieter: (route) => anbieterFuer(route) })

// Oder als Lauf: Ziel → Plan → Wellen → Prüfung
const { lauf, plan } = await crewLauf({ crew, anbieter: (route) => anbieterFuer(route), ziel: 'Bericht' })
lauf.urteil      // 'pass' | 'fail' | 'exhausted'
lauf.tokens      // verbrauchte Token über alle Runden
```

## 2. Der Vertrag

| Wer | Was es braucht |
|---|---|
| `crewAnbieter` | eine Crew (Rollen → Route + Modell) und `anbieter(route)` |
| `crewLauf` | dasselbe, plus `ziel`; optional `planerAntwort`, `maxVersuche`, `maxTokens`, `bildBeschreibung`, `pruefer` |
| Seam | `LlmProvider.complete(request) → CompletionResult` — mehr nicht |

**Rollenwahl:** Text → `executor`, ersatzweise `planner`; keine der beiden → Fehler (`routen`).

## 3. Prüfen

Sieben der zweiunddreißig Prüfungen belegen die **Kette**, nicht den Baustein: vier mit dem messenden
Anbieter (Kosten je Crew-Lauf je Nutzer), zwei durch den **echten Agent-Loop** (das Modell verlangt
`crew_plan`, der Loop führt es aus; ein verbotenes Werkzeug beendet den Turn nicht) und eine
**Zusammensetzung aller Fähigkeiten in einem Loop** — planen (Crew), suchen (`tools_search`), Bild
lesen (`modlens_read_image`), und am Ende stehen vier Modellaufrufe à 100/50 Token mit **0,00018 USD**
auf dem Konto **eines** Nutzers.

Die Zusammensetzung hat dabei zwei Fehler in **meinem Testaufbau** gefunden, beide lehrreich:

1. **Ein Skript-Anbieter je Aufruf** beginnt jedes Mal bei Schritt 1 — derselbe Werkzeugaufruf
   erscheint zweimal im Verlauf, und der Loop weist ihn zu Recht als nicht zuordenbar ab
   (`duplicate-call-id`). Es braucht **eine** Instanz.
2. **Die Reihenfolge der Hüllen ist bindend.** Der messende Anbieter gehört **um den echten
   Anbieter der Rolle**, nicht um die Crew-Hülle; außen gebucht lautet die Route `crew:crew-1`, und
   dafür gibt es keinen Tarif — vier Aufrufe, alle unbepreist, Anzeige 0 USD.

```powershell
& C:\Users\Chang\.bun\bin\bun.exe test            # im Paketordner: 32 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/crew/crew-provider/tsconfig.json   # exit 0
```

## 4. Grenzen — gemessen, nicht weggelassen

1. **Der Seam trägt keine Bilder.** `MessagePart` ist `TextPart | ToolResultPart | ToolCallPart`
   (`packages/llm/llm/src/index.ts:80`) — es gibt keinen Bildteil. Die Rolle `vision` ist deshalb
   nur über eine **Beschreibung als Text** erreichbar (`bildBeschreibung`), die in jedem Auftrag
   steht. Wer Bilder will, erweitert **zuerst** den Seam; ein Anbieter kann das nicht nachholen.
2. **Eine Rekursion wird im Host abgewiesen** (`pruefeCrew`). Der Harness hatte dafür nur eine
   Sperre im Modellwähler (`ModelDropdown.tsx:86`); eine handgeschriebene Einstellung kam durch.
3. **Kein Neuplanen nach einer Beanstandung** — dieselbe Tabelle läuft mit den Mängeln erneut, wie
   im Harness (`tool.ts:597-645`). Ein Plan, der am Ziel vorbeigeht, scheitert nach `maxVersuche`.
4. **Fehlende Token sind eine Untergrenze.** Meldet ein Anbieter kein `usage`, zählt der Schritt mit
   0 — die Zahl ist dann keine Messung.
5. **Der Werkzeugkasten ist gebaut, aber im Betrieb nicht angemeldet.** `crewWerkzeuge` liefert die
   vier Werkzeuge als `AgentTool` für den Loop; ein Test fährt den **echten** `AgentLoop` damit. Was
   fehlt, ist die Anmeldung im **Host**: welcher Nutzer und welches Projekt gelten, entscheidet die
   Sitzung — und die kennt den Nutzer heute nicht (siehe `usage-recorder`, Grenze 1).
