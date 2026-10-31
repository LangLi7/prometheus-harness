# `pmh-status` — das erste Plugin-Unit, das wirklich läuft

> **Zweck.** Es hängt sich in die Laufzeit ein, legt zwei **lesende** Wege an und
> meldet sie beim Abstecken wieder ab. Damit ist es der Beleg dafür, daß die
> Kette **Generation → `prepare` → `mount` → Weg → `unmount`** trägt — nicht nur
> in einer Prüfung, sondern über echtes HTTP.
>
> **Warum genau dieses Unit als erstes.** Ein Plugin, das nur „Hallo" sagt,
> beweist das Laden, aber nicht das **Abstecken**. Ein Plugin, das einen
> Seiteneffekt anlegt und ihn in einer Absteck-Funktion wieder entfernt, beweist
> beides — und ist damit der einzige ehrliche Beleg für `reload: "hot"`
> (`docs/design/harness-generationen.md` §2.3).

---

## 1. Was es anbietet

| Weg | Antwort |
|---|---|
| `GET /api/pmh/gen/status` | `{ plugin: "pmh-status", generation: <was der Host reicht> }` |
| `GET /api/pmh/plugin/info` | `{ plugin, version, vertrag, wege }` |

Beide Wege sind **lesend**. Das Unit schreibt nichts, öffnet keine Datei, kennt
kein Netz.

## 2. Der Vertrag mit dem Host

Das Unit ist **selbsttragend**: es hat **keine** `import`-Anweisung auf ein
anderes Paket. `units/` steht nicht im Bun-Arbeitsbereich (`../README.md`), und
ein Plugin, das fremde Pakete braucht, wäre beim Empfänger nicht lauffähig.
Deshalb beschreibt es die Fläche, die es erwartet, strukturell:

```ts
apply(host: { contract: string, services: { routen, zustand? } }) => () => void
```

| Dienst | Pflicht | Bedeutung |
|---|---|---|
| `services.routen` | **ja** | `registriere(pfad, handler) → () => void` (die Abmelde-Funktion) |
| `services.zustand` | nein | `() => unknown`, liefert den Generationszustand |

**Fehlt `routen`, wirft `apply`.** Ein eingehängtes Plugin, das nichts anbietet,
ist schlimmer als ein abgewiesenes: es sieht aus wie ein Erfolg. Fehlt dagegen
`zustand`, antwortet der Weg mit einem **Hinweis im Körper** — nicht mit einem
Absturz und nicht mit einem erfundenen Zustand.

## 3. Starten

```sh
# im Projektwurzel-Verzeichnis
bun run units:host
```

Das Skript `scripts/units-host.mjs` startet einen Prüfrahmen auf `127.0.0.1` mit
freiem Port, hängt die Plugin-Units der aktiven Generation ein, ruft beide Wege
über echtes HTTP ab, steckt alles wieder ab und beendet sich. **Exit-Code 0**
heißt: jede Erwartung ist eingetroffen.

Es gibt **keine Flags** — das Skript ist ein Beweislauf und kein Dienst.

## 4. Grenzen

1. **Nicht im Core gemessen.** Der Beweis läuft über den Prüfrahmen
   `packages/units/unit-system/src/rahmen.ts`, nicht über `ctx.webServer` des
   Cores. Die Form des Vertrags ist dieselbe; die Verdrahtung in
   `scripts/profile-patch.mjs` fehlt noch.
2. **Kein `reload: hot` im Betrieb bewiesen.** Belegt ist: `apply` gibt eine
   Absteck-Funktion zurück, und nach dem Abstecken antwortet der Weg mit 404.
   Nicht belegt ist, ob ein **laufender** Host diesen Wechsel ohne sichtbare
   Unterbrechung übersteht — dafür fehlt der Anhängepunkt mit echtem Upstream.
3. **Der Zustand ist der, den der Host reicht.** Das Unit liest nicht selbst aus
   `.pmh/`; es fragt den Dienst. Damit gibt es keine zweite Wahrheit über den
   Zustand — aber auch keine Auskunft, wenn der Host den Dienst nicht reicht.
