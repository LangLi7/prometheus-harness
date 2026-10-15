# Der Anbieter-Kern: was steht, was fehlt

Stand: 15.10.2026. Alles hier ist **gemessen** — durch Auflisten der Pakete im Host
(`C:\Users\Chang\deepseek-harness\packages`) und in unserem Baum. Kein Punkt ist vermutet.

## Die Antwort auf die Frage

**Nein — als ein Kern ist das nie gebaut worden, weder im Host noch bei uns.** Aber es stehen
Teile da, und einer davon ist **nicht einmal festgeschrieben**.

## 1. Was der Host hat

| Gruppe | Pakete | Was das ist |
|---|---|---|
| `llm` | `llm`, `llm-deepseek`, `llm-pi-ai`, `llm-retry`, `token-meter` | **Chat-Anbieter** — Naht, zwei Umsetzungen, Wiederholung, Verbrauchszählung |
| `client` | `ui-model-selection`, `ui-settings-models` | Die Oberfläche zur **Modellwahl** und die Modelleinstellungen |
| `settings` | `settings`, `settings-file` | Einstellungen, dateigestützt |
| `credentials` | `credentials`, `credentials-local`, `authorization` | Der Schlüsselspeicher |
| `extensions` | `tool-cordis` (mit `api-catalog.ts`) | Ein **erzeugter Katalog** aller Erweiterungspunkte des Hosts |

**Und die entscheidende Lücke.** Eine Suche über **alle** Paketordner des Hosts nach
`embed|speech|tts|stt|transcri|image|rerank|vision|audio` ergibt **null Treffer**.

> **Der Anbieter-Kern des Hosts kann nur Chat.** Für Einbetten, Sprache, Ton und Bild gibt es dort
> **nichts** — keine Naht, keinen Anbieter, keinen Einstellungsort.

## 2. Was bei uns steht

| Paket | Zustand | Was es kann |
|---|---|---|
| `packages/llm/llm` | festgeschrieben | Naht für **Chat**; ausdrücklich „heute einer, weitere später" |
| `packages/llm/llm-http` | festgeschrieben | HTTP-Anbieter an einer **konfigurierbaren Basisadresse** (OpenAI-kompatibel) |
| `packages/llm/llm-retry`, `token-meter` | festgeschrieben | Wiederholung **desselben** Anbieters; Zählung |
| `packages/ai/faehigkeiten` | **neu, festgeschrieben** | Der Vertrag für **sechs** Fähigkeiten + Registratur + Eskalation zum Menschen |
| `packages/ai/openrouter` | **neu, festgeschrieben** | **Ein** Anbieter, **vier** Fähigkeiten über **vier** Wege |
| `packages/ai/waechter` | **neu, festgeschrieben** | Die Kontrolle vor der Tat |

### Und das, was nicht festgeschrieben ist

Drei Pakete eines **parallelen Arbeitsstrangs** — `speech-local-base`, `speech-whisper-local`,
`speech-nemo-de-local` — sind **nicht committet** (`git status`: `??`) und haben **keine
`tsconfig.json`**. Damit werden sie von `scripts/typecheck.mjs` **übersprungen**: sie stehen in
`node_modules`, aber in keinem der 30 typprüften Pakete.

Sie melden sich laut ihrer eigenen Beschreibung „als Anbieter 'whisper-local' am Dienst
`ctx.speechToText`" — und **`speechToText` kommt im ganzen Host nicht vor**. Der Dienst ist also
ihrer. **Ich habe sie nicht angefaßt; hier steht nur, was ich gelesen habe.**

## 3. Was freellmapi hat, das wir nicht haben

Gelesen am 15.10.2026 (`github.com/tashfeenahmed/freellmapi`): 34 Anbieter und 635 Modelle hinter
**einem** `/v1`-Endpunkt, Schlüssel verschlüsselt, ein Router mit Ausfall-Weitergabe bei
Drosselung, Verbrauchszählung **je Schlüssel** gegen die Obergrenzen der Freistufen — und ein
**Katalog, der sich selbst aus einem signierten Feed erneuert**, ohne `git pull`. Ausdrücklich auch
für Einbettung, Bild und Ton.

Bei uns fehlt davon **jedes** Stück: kein Katalog, keine Ausfall-Weitergabe **über Anbieter
hinweg** (die Wiederholung bleibt beim selben), keine Zählung gegen Obergrenzen, kein Feed.

## 4. Der Befund, der den Entwurf bestimmt

freellmapi pflegt einen **Katalog von Hand** und erneuert ihn aus einem **signierten Feed** — nicht
durch Abfragen der Anbieter. Meine eigene Messung sagt, warum:

> `GET https://openrouter.ai/api/v1/models` liefert **462** Einträge — und darin **fehlen**
> `google/gemini-3.8-flash-tts`, `google/gemini-3.5-transcribe` und `google/gemini-embedding-2`.
> Alle drei habe ich **lebend aufgerufen**: Ton mit 140 160 Bytes, Transkription mit Text und
> Kosten, Einbettung mit 3072 Dimensionen.
>
> Nur die Einzelabfrage `GET /api/v1/models/<kennung>/endpoints` nennt sie.

**Eine Liste ist kein Beweis für Abwesenheit.** Und: **aus einer Anbieterliste allein läßt sich die
Fähigkeit nicht ableiten.** Wer den Katalog nur aus `/models` baut, verliert genau die Fähigkeiten,
die nicht Chat sind.

## 5. Der Entwurf, der daraus folgt

Ein Paket **`packages/ai/verzeichnis`** — das Verzeichnis der Anbieter. Vier Teile:

1. **Familie** — je API-Familie (OpenAI-kompatibel, Google AI Studio, Anthropic, OpenRouter) die
   Basisadresse, die Form des Kopfes und **je Fähigkeit der Weg**: Pfad, Körper, Antwortfeld. Das
   ist der Teil, der die gemessenen Unterschiede trägt — `text-zu-sprache` geht **nicht** über
   `/chat/completions`.
2. **Eintrag** — ein Anbieter mit Familie, Schlüsselquelle und **je Fähigkeit die Modellkennung**,
   die der **Endnutzer** wählt. Dazu der Zustand: `gemessen` oder `unbestätigt`.
3. **Sonde** — prüft einen Eintrag gegen die **lebende** Schnittstelle: `/models` abfragen,
   `endpoints` je Kennung, eine Fähigkeit wirklich aufrufen. Ergebnis: ein Eintrag wird
   `gemessen` — oder die Sonde sagt, was nicht stimmt.
4. **Erneuern** — beim Start, zu festen Zeitpunkten, oder wenn ein Schlüssel fehlt. Die
   **Auslegung** fremder Antworten („ist dieses Modell ein Sprachmodell?") übernimmt **DeepSeek
   Flash** — billig, und austauschbar, weil es über `faehigkeiten.entscheiden` läuft.

**Reihenfolge bleibt:** `verzeichnis` baut auf `faehigkeiten` und `openrouter` auf, die stehen. Es
ist der Schritt vor den Einstellungen — denn was eingestellt werden kann, bestimmt der Katalog.

## 6. Gebaut und lebend gelaufen (15.10.2026)

`packages/ai/verzeichnis` steht: die Familien-Tabelle (OpenRouter, DeepSeek) mit **je Fähigkeit dem
Weg**, die Models-API-Abfrage, und die **Sonde**. 27 Prüfungen über einen echten Socket, Typecheck
über **31 Pakete** grün.

Die Sonde ist **absichtlich kostenlos**: sie schickt einen leeren Auftrag und liest nur den Status.
Ein abgewiesener Auftrag erzeugt keine Antwort und damit keine Rechnung. **Keine Fähigkeit wird
wirklich aufgerufen.**

Der lebende Lauf gegen beide Dienste:

| Weg | OpenRouter | DeepSeek |
|---|---|---|
| Models-API | 462 Modelle | 2 Modelle |
| `/chat/completions` | vorhanden | vorhanden (**422**, nicht 400) |
| `/audio/speech` | vorhanden | **fehlt** |
| `/audio/transcriptions` | vorhanden | **fehlt** |
| `/embeddings` | vorhanden | **fehlt** |
| `/images/generations` | **vorhanden** | **fehlt** |

**Die Gegenprobe gehört dazu.** Ein erfundener Pfad `/gibtsnicht-abc123xyz` gibt bei **beiden**
Diensten **404** — die Unterscheidung der Sonde ist also geprüft und nicht bloß behauptet.

**Zwei neue Messungen:** DeepSeek weist einen leeren Chat-Auftrag mit **422** ab (nicht 400) — die
Statusdeutung der Sonde fängt beides. Und `/images/generations` **existiert** bei OpenRouter.

**Und die Unterscheidung, die dabei zu treffen war:** „der Weg ist da" ist **nicht** „die Fähigkeit
wirkt". Die Sonde darf nur die Anwesenheit behaupten; `bild` steht deshalb weiterhin in **keiner**
Fähigkeitsliste — die Form des Auftrags ist ungemessen. Als Regel 37 festgehalten.

