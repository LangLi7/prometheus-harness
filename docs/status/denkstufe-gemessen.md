# Die Denkstufe — gemessen statt geglaubt

Stand: 15.10.2026, ein Lauf. **Die Regel 1 gilt: eine Zahl ohne zweiten Lauf ist ein Verdacht.**
Was hier steht, ist **einmal** gemessen — die Tokenzahlen sind direkte Angaben des Dienstes, die
Richtung ist groß, aber ein zweiter Lauf steht aus.

## Der Lauf

Derselbe Auftrag (ein Urteil `ja`/`nein` nach Schema), dasselbe Modell (`openai/gpt-oss-20b`),
derselbe Weg — **nur** der Parameter `reasoning_effort` unterscheidet sich:

| Denkstufe | Dauer | Ausgabe-Token | davon Denken | Urteil |
|---|---|---|---|---|
| **ohne** (Vorgabe) | 2,0 s | 223 | 207 | `nein` |
| **`low`** | **0,7 s** | **47** | **36** | `nein` |
| `minimal` | 0,4 s | 194 | 176 | **`ja`** |

## Was das zeigt

**1. Der Hebel wirkt — deutlich.** `low` senkt die Ausgabe von **223 auf 47** Token (Faktor
**4,74**) und das Denken von **207 auf 36** (Faktor **5,75**); die Dauer fällt von 2,0 auf 0,7 s.
**Und das Urteil bleibt dasselbe.** Genau das war der Zweck: weniger bezahlen für dieselbe Antwort.

**2. Und mein Entwurf war an einer Stelle FALSCH.** Ich hatte `aus` auf den Dienstwert `minimal`
abgebildet — **ohne Messung**, und ausdrücklich als „nicht gemessen" gekennzeichnet. Die Messung
sagt jetzt: **`minimal` senkt kaum** (194 statt 223 Token) — und das **Urteil kippte** auf `ja`.

**Ein „Denken aus" ist so nicht zu haben.** Wer `aus` wählt, bekommt in Wahrheit „fast wie ohne,
mit ungewissem Ausgang auf das Urteil". Das ist schlimmer als keine Stufe: es sieht aus wie eine
Einstellung und ist keine.

## Was daraus folgt — die nächste Änderung

Die Stufe **`aus` wird entfernt**, aus beiden Paketen:

| Paket | Was wegfällt |
|---|---|
| `ai/openrouter` | `'aus'` aus der Union und aus `DENKSTUFEN` (die Zeile `aus: 'minimal'`) |
| `ai/settings` | `'aus'` aus `Denkstufe` und aus `DENKSTUFEN` |

Es bleiben **drei** Stufen — die drei, für die es einen gemessenen Dienstwert gibt: `niedrig`,
`mittel`, `hoch` → `low`, `medium`, `high`.

**Warum das nicht in dieser Runde geschehen ist.** Es sind sechs Änderungen in zwei Paketen und
zwei Prüfdateien. Eine halb gezogene Stufe — `einstellungen` bietet sie an, `openrouter` kennt sie
nicht — wäre **schlechter als die jetzige Lage**: sie schwiege über den Unterschied, statt ihn zu
benennen. Der Befund ist festgehalten, die Änderung ist mechanisch und gehört in eine Runde mit
Platz.

## Und der Nebenbefund, der bleibt

Das Urteil **kippte** zwischen den Stufen. Bei einem Modell, das denkt, hängt die Antwort also an
der Denkstufe — nicht nur der Preis. Wer die Stufe senkt, um zu sparen, ändert möglicherweise
**was** entschieden wird. Das ist kein Grund, es nicht zu tun — aber ein Grund, es zu **wissen**.
