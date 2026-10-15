# Denkhilfe — zwei Probleme, die nicht dasselbe sind

Stand: 15.10.2026. Der Betreiber hat vorgeschlagen, das Denken auszulagern: ein **günstigeres
Modell** denkt, das teure urteilt. Das Plugin heißt **`denkhilfe`** (thinking help), ist
**abschaltbar**, und **standardmäßig aus**.

Der Vorschlag ist gut. Er enthält aber **zwei Probleme**, und sie haben **verschiedene Lösungen**.

## Problem 1: Das Denken frißt das Budget

**Gemessen am 15.10.2026.** Bei `max_tokens: 300` kam ein **leerer** Inhalt zurück: die
Zwischenschritte standen in `message.reasoning`, das Urteil nie in `content`. Kosten 0,0010905 $ —
bezahlt für nichts Brauchbares. Bei 1200 Token kam gültiges JSON, Kosten 0,00167175 $.

**Die Lösung ist ein Parameter, kein Plugin.** Kostenlos nachgesehen, welche Parameter die Modelle
annehmen:

| Modell | `reasoning` | `reasoning_effort` | `include_reasoning` | `max_tokens` |
|---|---|---|---|---|
| `google/gemini-3.8-flash` | ja | ja | ja | ja |
| `openai/gpt-oss-20b` | ja | ja | ja | ja |
| `typesafe/jev-router` | ja | ja | ja | ja |
| `ibm-granite/granite-4.0-h-micro` | nein | nein | nein | ja |

**332 von 462 Modellen nennen `reasoning`.** Ein zweites Modell ist für dieses Problem **nicht
nötig**: `reasoning_effort: 'low'` oder `reasoning: {max_tokens: N}` begrenzt das Denken direkt.
Der Anbieter `openrouter` sollte diesen Schalter deshalb **können** — und der Aufrufer setzt ihn.

**Noch nicht als Aufruf gemessen.** Daß das Modell den Parameter *nennt*, heißt noch nicht, daß er
wirkt. Das ist die nächste Messung.

## Problem 2: Das Denken kostet beim TEUREN Modell

**Das ist der Vorschlag des Betreibers — und hier greift er.** Ein Modell, das denkt, bezahlt seine
Zwischenschritte zum **Ausgabepreis**. Bei `gemini-3.8-flash` sind das 3,75 $ je Million — gegen
0,75 $ je Million Eingabe. Ein Fünffaches.

Wenn ein **billiges** Modell denkt (`granite-4.0-h-micro`: 0,02 $ / 0,11 $) und sein Ergebnis als
**Eingabe** an das teure geht, wird ein Teil der teuren **Ausgabe** zu billiger **Eingabe**. Das ist
ein echter Mechanismus, kein Sparen durch Weglassen.

## Der Haken, den kein Preiszettel zeigt

**Schlechtes Denken hinein, schlechtes Urteil heraus — zu einem niedrigeren Preis.** Ein Urteil, das
sich verschlechtert hat, sieht **genau aus** wie ein Urteil. Der Preis verrät es nicht.

Deshalb darf dieses Plugin **nicht nur ein Schalter** sein. Es braucht ein **Maß**: beide Wege auf
**dieselbe** Frage laufen lassen und nebeneinanderstellen — Kosten **und** Urteil. Wer den Schalter
umlegt, soll sehen, was er dafür bekommt. Ohne dieses Maß ist „billiger" eine Behauptung.

Genau deshalb ist **Standard aus** richtig, und genau deshalb ist der Vorschlag des Betreibers
sauber gebaut: er verlangt eine Entscheidung, statt sie still zu treffen.

## Der dritte Weg, der am billigsten ist

Ein Modell, das **gar nicht denkt**, für enge Urteile. `ibm-granite/granite-4.0-h-micro` kennt den
Parameter `reasoning` **nicht** — es denkt nicht, es antwortet. Für eine Entscheidung aus einer
festen Auswahl („eines von dreien") ist das genau die Form, für die Jev und die System-One-Modelle
gebaut sind.

0,02 $ / 0,11 $ je Million gegen 0,75 $ / 3,75 $: **das Dreißigfache.** Wer nur eine Auswahl
braucht, soll kein denkendes Modell bezahlen.

## Die drei Hebel, nach Einfachheit

| Hebel | Was er löst | Aufwand |
|---|---|---|
| `reasoning_effort` setzen | Problem 1 vollständig | **ein Parameter** |
| Ein nichtdenkendes Modell wählen | beide Probleme, bei engen Urteilen | eine Einstellung |
| `denkhilfe` (billig denkt, teuer urteilt) | Problem 2 bei **harten** Fällen | ein Plugin mit zwei Aufrufen |

**Die Reihenfolge ist Absicht.** Der erste Hebel ist ein Parameter — ihn zu überspringen und ein
Plugin zu bauen wäre Arbeit an einem Problem, das einen Schalter hat.

## Was der Vertrag noch nicht kann

`Urteil.herkunft` trägt **ein** Modell (`{anbieter, modell}`). Ein Denkhilfe-Urteil hat **zwei**:
das, welches gedacht hat, und das, welches geurteilt hat. Wer später prüft, warum ein Urteil so
ausfiel, muß beide sehen — sonst ist nicht nachvollziehbar, ob das Denken oder das Urteilen
danebengelegen hat. Das ist eine Lücke im Vertrag, keine im Plugin.
