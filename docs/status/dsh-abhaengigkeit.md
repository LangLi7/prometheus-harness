# Was noch am fremden Harness hängt

> **Anlaß.** Betreiber, 27.10.2026: *„das sollten wir unbedingt fixen, weil dsh nicht mehr
> wirklich benutzt wird, sondern eher als Notfall."*
>
> **Stand.** Der erste Umzug ist vollzogen (`ocr`, §2). Der Rest ist hier aufgeführt, damit
> er nicht im Kopf bleibt — gemessen am 27.10.2026, nicht erinnert.

---

## 1. Die Grenze, die schon entschieden ist

[`docs/decisions/naming-grenze.md`](../decisions/naming-grenze.md) sagt:

> `DSH_HOME`, `~/.dsh`, Cookie `dsh-auth-…` — **setzt der Kern bzw. die Umgebung.**
> Wir lesen sie; umbenennen können wir sie nicht.

Daraus folgen **zwei** Auflöser in [`packages/util/home-paths`](../../packages/util/home-paths/src/index.ts).
Der Unterschied ist der ganze Punkt:

| Auflöser | Kette | Wofür |
|---|---|---|
| `resolvePmhHome()` | `PMH_HOME → DSH_HOME → ~/.pmh` | **Kompatibilität**: eine bestehende Installation unter `~/.dsh` bleibt auffindbar |
| `resolveEigenesHome()` | `PMH_HOME → ~/.pmh`, **wirft** bei `~/.dsh` | **eigene Ablage**: Prometheus schreibt nie ins fremde Haus |

**Wer eigene Dateien ablegt, muß `resolveEigenesHome` nehmen.** `resolvePmhHome` ist
richtig für Lesen (Migration, Bestand) und falsch für Schreiben.

---

## 2. Umgezogen — `ocr`, der Anlaß

| Vorher | Nachher |
|---|---|
| `~/.dsh/tools/ocr/ocr.exe` (57 MB) | `~/.pmh/tools/ocr/ocr.exe` |
| PATH-Eintrag `…\.dsh\tools\ocr` | PATH-Eintrag `…\.pmh\tools\ocr` **zuerst**, der dsh-Eintrag bleibt dahinter als Notfall |

**Belegt, nicht behauptet:**

```
$env:PATH = "C:\Users\Chang\.pmh\tools\ocr;" + $env:PATH
(Get-Command ocr).Source   → C:\Users\Chang\.pmh\tools\ocr\ocr.exe
ocr --version              → open-code-review v1.12.12 (182898c) windows/amd64
```

Der alte Benutzer-PATH liegt gesichert unter `.tmp/user-path-vor-ocr-umzug.txt`.

**Was noch nicht wirkt:** der laufende Host-Prozess hat den PATH vom Start. Der neue
Eintrag greift beim nächsten Start — bis dahin findet `ocr` weiter die dsh-Fassung.
Das ist kein Mangel, sondern die Reihenfolge (Arbeitsweise §2: „aktiv" ist nicht „wirkt").

---

## 3. Was noch hängt — die Liste

**Kategorie B: eigene Ablage über `resolvePmhHome()`** — schreibt im Zweifel ins fremde Haus.

| Ort | Was dort liegt | Ziel |
|---|---|---|
| `packages/world/obsidian/src/config.ts` | `$DSH_HOME/world/obsidian.json` | `resolveEigenesHome()` |
| `packages/world/graphify/src/config.ts` | `$DSH_HOME/world/graphify.json` | `resolveEigenesHome()` |
| `packages/skill/skill-marketplace/src/{state,mcp,install}.ts` | 6 Stellen, `marketplaces/` | `resolveEigenesHome()` |
| `packages/plugin/plugin-hooks/src/{index,hooks}.ts` | 3 Stellen, `hooks-enabled.json` | `resolveEigenesHome()` |
| `packages/skill/skill-plugin/src/index.ts` | `<home>/skills` | `resolveEigenesHome()` |
| `packages/crew/crew-plugin/src/plugin.ts` | `crew/goals/…` | prüfen: der Host reicht `DSH_HOME` **wörtlich** weiter — hier ist DSH der Absender, nicht die Ablage |
| `packages/crew/plan/src/{scope,index}.ts` | `$DSH_HOME/crew/goals/…` | wie oben |
| `packages/api/speech-*` | `DSH_HOME` **hart**, ohne Rückfall | `PMH_HOME`, sonst `~/.pmh` |

**Kategorie C: bewußt fremd — bleibt.** Diese Stellen **lesen** Daten, die dem Kern
gehören. Sie umzustellen hieße, eine Migration zu erfinden, die es nicht gibt.

| Ort | Warum es bleibt |
|---|---|
| `packages/util/home-paths` | die Kette selbst; sie ist die Kompatibilitätsschicht |
| `packages/plugin/usage/src/stand.ts` | liest `$DSH_HOME/usage-budget/usage.json` — die Abrechnung schreibt der Kern |
| `packages/usage/usage-budget` | dieselbe Datei, andere Sicht |
| `packages/auth/credentials-postgres` | liest `$DSH_HOME/.credentials.yaml` zur Übernahme |
| `packages/plugin/ponytail/src/modus.ts` | liest `~/.dsh/ponytail.json` — schreibt aber nach `~/.pmh` |
| 335 Skills unter `~/.agents/skills` | nicht dsh, aber genauso außerhalb des Repos |

---

## 4. Die Reihenfolge

1. **`world/obsidian` und `world/graphify`** — zwei Dateien, gleiche Form, größter Effekt:
   dort liegen die Vault- und Graph-Einstellungen, die der Host bei jedem Start liest.
2. **`skill-marketplace` und `plugin-hooks`** — neun Stellen desselben Musters.
3. **`crew`** — vorher klären, ob `DSH_HOME` hier Ablage oder Absender ist (der Kommentar in
   `crew-plugin/src/plugin.ts` sagt: der Host reicht es wörtlich weiter).
4. **`speech-*`** — hart verdrahtet, braucht eine Entscheidung über den Vorgabeort.
5. **Migration, erst danach die Kette kürzen.** Solange `~/.dsh` Dateien hält, die
   Prometheus braucht (Einstellungen, Vault-Pfad, Graph-Pfad), darf der Rückfall nicht weg —
   sonst startet der Host mit leeren Einstellungen und niemand weiß, warum.

**Der Test für jeden Schritt:** ein Host-Start mit gesetztem `DSH_HOME` auf ein **leeres**
Verzeichnis (wie `crew-plugin/tests/plugin.test.ts` es schon macht). Schreibt Prometheus
dorthin, ist der Schritt nicht fertig.
