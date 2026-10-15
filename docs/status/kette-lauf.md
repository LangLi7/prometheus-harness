# Die Kette wirkt — lebend gemessen

Stand: 15.10.2026, 14:0x UTC. Der erste Lauf, in dem **alle Teile zusammen** gearbeitet haben:
Einstellungsdatei → Aufbau → Registratur → Anbieter → lebendes Modell → **geprüftes Urteil**.

Bis hierher war jedes Paket **aktiv** (geprüft, mit Attrappen). Keines hatte **gewirkt** — über die
ganze Kette, mit einem echten Dienst. Das ist Regel 2: *installiert / komponiert / aktiv / wirkt*
sind vier Stufen, jede braucht ihre eigene Messung.

## Was gelaufen ist

```
bun run C:\Users\Chang\.pmh\kette-lauf.mjs
```

Zwei Lagen, dieselbe Frage (`Ist ein Import von 12.000 Dateien für einen einzelnen Rechner zu viel
auf einmal?`) mit einem Schema aus zwei erlaubten Antworten.

### Lage 1: KEINE Einstellung — die Kette muß zum Menschen führen

```
eingetragen: mensch
Hinweis: Der Anbieter „openrouter" wurde NICHT eingetragen: für ihn ist keine Fähigkeit gewählt.
Hinweis: Es sind keine Schwellen eingestellt — es gilt die vorsichtige Vorgabe (0.9 / 0.5).
Hinweis: Es ist für KEINE Fähigkeit ein Modell gewählt. Jede Anfrage geht damit an den Menschen.
Urteil: {"antwort":"nein"}  von: mensch
Der Mensch wurde gefragt: 1 Mal
```

**Der Mensch wurde genau einmal gefragt.** OpenRouter stand **nicht** in der Registratur, weil für
ihn nichts gewählt war — genau die Regel, die verhindert, daß ein nie gewollter Anbieter in jeder
Meldung auftaucht. Und die drei Hinweise sind die drei Fälle, die sonst **lautlos** geblieben wären.

### Lage 2: MIT Einstellung — die Kette muß zum Modell führen

Die Einstellungen wurden **über die Datei** geschrieben und wieder gelesen, nicht über ein Objekt im
Speicher:

```json
{ "fassung": 1,
  "wahl": { "entscheiden": { "anbieter": "openrouter", "modell": "…" } },
  "stufen": { "automatisch": 0.9, "rueckfrage": 0.5 } }
```

| Modell | Dauer | Urteil | von | Mensch gefragt |
|---|---|---|---|---|
| `openai/gpt-oss-20b` | 7,5 s | `{"antwort":"ja"}` | `openrouter / openai/gpt-oss-20b` | **0 Mal** |
| `ibm-granite/granite-4.0-h-micro` | 1,2 s | `{"antwort":"ja"}` | `openrouter / ibm-granite/granite-4.0-h-micro` | **0 Mal** |

`eingetragen: openrouter, mensch` — und der Mensch **zuletzt**, also nicht gefragt.

**Das Urteil ist gegen das Schema geprüft:** `{"antwort":"ja"}` liegt in der Auswahl `['ja','nein']`.
Ein Wert außerhalb hätte nicht durchgekommen (geprüft in `packages/ai/openrouter`).

## Und ein Befund nebenbei

`ibm-granite/granite-4.0-h-micro` nennt in der Modellliste **kein** `structured_outputs` — und
lieferte trotzdem ein schema-konformes Urteil, in **1,2 s** statt 7,5 s.

**Die Liste der unterstützten Parameter ist also — wie die Modellliste selbst — kein abschließender
Beweis.** Genau dieselbe Lehre wie bei den vier Modellen, die in der Liste fehlten und trotzdem
lebend antworteten. Was gemessen ist, schlägt, was in einer Liste steht.

**Ehrlich dazugesagt:** daß der Aufruf **gelang** und die Antwort die Prüfung **bestand**, heißt
nicht, daß das Modell `json_schema` **nativ** beherrscht. Es kann auch OpenRouter sein, der die Form
erzwingt. Wer das wissen will, muß es messen — ich habe es nicht.

## Was das beweist — und was nicht

**Bewiesen:** Die Kette trägt. Die Einstellungsdatei wird gelesen, der Aufbau trägt den gewählten
Anbieter ein und den Menschen zuletzt, das Urteil kommt vom Modell, die Herkunft nennt es, und das
Ergebnis ist gegen das Schema geprüft. **Ohne** Einstellung greift die Eskalation und der Mensch
antwortet.

**Nicht bewiesen:** daß in der Betriebsablage eine Einstellungsdatei liegt. Der Lauf hat eine
**Wegwerf-Datei** in einem Zwischenverzeichnis benutzt — absichtlich, um den Zustand des Betreibers
nicht ohne Frage zu verändern. **Der eine Schritt, der noch fehlt, damit es für Sie lebendig ist:**
`einstellungen.json` im Harness-Home mit einer Wahl je Fähigkeit.
