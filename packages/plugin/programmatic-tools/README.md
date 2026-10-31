# `@prometheus-harness/programmatic-tools` — native Werkzeuge und ein Programm, beides zugleich

> **Zweck.** Der Standardmodus zeigt jedes Werkzeug einzeln; der PTC-Modus zeigt nur `run_code`.
> Beides ist eine Festlegung für den ganzen Agenten. Dieses Bündel hebt die Festlegung auf: Die
> Werkzeuge bleiben sichtbar, und **zusätzlich** gibt es `run_program`, in dem sie als `tools.*`
> zur Verfügung stehen.

## 1. Was es tut

Ein Aufruf von `run_program` führt einen Programmtext im Sandkasten des Kerns aus
(`ctx.ptcRuntime`). Jedes sichtbare Werkzeug ist darin eine Methode:

```ts
const dateien = await tools.glob({ pattern: 'packages/**/*.ts' })
const treffer = await Promise.all(
  dateien.slice(0, 20).map(async (f) => ({ f, n: (await tools.grep({ pattern: 'defineTool', path: f })).length })),
)
return treffer.sort((a, b) => b.n - a.n).slice(0, 10)
```

Zurück kommt nur `value` (was das Programm `return`t) und `logs`. Zwischendaten bleiben im
Sandkasten und kosten keinen Kontext.

## 2. Warum die Aufrufe durch die Registry gehen

Ein Binding ruft `ctx.tools.execute(...)`, nicht die `execute`-Methode einer Definition. Nur
dieser Weg läuft durch Pre-Policy, Guards, Around-Dispatch und Post-Policy — dieselbe Kette
wie ein Aufruf des Modells. `parent: exec.token` markiert den Aufruf als Sub-Dispatch; unter
`mode: ptc` sind ausschließlich solche Aufrufe für native Namen erlaubt.

## 3. Was es bewusst nicht tut

| Nicht | Warum |
|---|---|
| Die Präsentation umschalten | Der Werkzeugkatalog bleibt stabil; ein Wechsel mitten im Gespräch invalidiert den Prompt-Cache. |
| Zustand zwischen Programmen halten | Jeder Lauf beginnt leer; was bleiben soll, wird zurückgegeben. |
| Streaming-Ausgabe | Das Ergebnis kommt ganz oder gar nicht. |
| Rückfragen oder Plan-Freigaben ausführen | `ask_user_question` und `exit_plan_mode` gehören nicht in ein Programm; sie lassen sich per `deniedTools` sperren. |

## 4. Konfiguration

| Feld | Vorgabe | Bedeutung |
|---|---|---|
| `timeoutMs` | Sandkasten-Vorgabe | Elapsed-Budget eines Programms; ein Aufruf kann es überschreiben. |
| `deniedTools` | `[]` | Werkzeugnamen, die im Programm nicht auftauchen. |

## 5. Aktivieren

Das Bündel liegt bereit, ist aber **nicht** im Ladepfad eingetragen. Wer es will, trägt es in
`scripts/profile-patch.mjs` (oder eine eigene Vorgabe) ein:

```yaml
- id: pmh-programmatic-tools
  name: '@prometheus-harness/programmatic-tools'
  inject: [tools, ptcRuntime]
```

Danach sieht der Agent seine Werkzeuge **und** `run_program`. Die Regel, wann welches der
beiden richtig ist, steht im Skill `.agents/skills/programmatic-tools/SKILL.md` — nicht hier.

## 6. Grenzen

- **Der Kontextgewinn bleibt aus.** Die Schemas sind weiter sichtbar; gespart werden Runden,
  nicht Tokens. Wer Tokens sparen will, nimmt das Preset `ptc`.
- **Die Sandkasten-Grenze ist die des Kerns.** Ein Programm ist kein Sicherheitsgewinn
  gegenüber einem Einzelaufruf: Es läuft unter derselben Datei-Policy und kann dieselben
  Werkzeuge rufen.
- **Ein Programm kann scheitern.** `ok: false` mit `kind` (`timeout`, `abort`, `exception`,
  `worker-exit`, `invalid-output`, `output-limit`, `protocol`, `sandbox-unavailable`) ist ein
  Ergebnis, keine Ausnahme.
