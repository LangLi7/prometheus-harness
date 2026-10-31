# Bild und Plugin — gemessen am 19.10.2026

> **Anlaß** (Betreiber, 19.10.2026): *„ist schon ein plugin implementiert für bild generierung? …
> TTS/STT? … ja implementieren als plugin"* und *„versuche ein Avatar zu erstellen und später als
> Vector SVG"*.
>
> **Ergebnis in einem Satz:** der Bild-Weg ist **gemessen** (Form und Antwortfeld), `bild` steht
> jetzt als fünfte Fähigkeit bei OpenRouter, und die Fähigkeiten sind als Host-Plugin
> angeschlossen — sechs Endpunkte und fünf Agent-Werkzeuge.

## 1. Die Messung — zwei Modelle, ein Fehlschlag, ein Erfolg

Die Sonde ist [`messsonden/bild-form.mjs`](messsonden/bild-form.mjs). Sie liest den Schlüssel aus
der Umgebung oder aus `~/.dsh/.credentials.yaml` und ersetzt ihn in jeder Meldung durch `***`.

| Versuch | Modell | Weg | Ergebnis |
|---|---|---|---|
| 1 | `google/gemini-nano-banana-2.1` | `/images/generations` (b64) | **429** — *„You exceeded your current quota"*, Google AI Studio |
| 2 | dasselbe | `/images/generations` (schlicht) | **429** |
| 3 | dasselbe | `/chat/completions` mit `modalities` | **429** — *„temporarily rate-limited upstream"* |
| 4 | `google/gemini-2.5-flash-image` | `/images/generations` (b64) | **200** — Bild, 720 028 Bytes |

**Was der 429 lehrt:** die Anfrage wurde **angenommen** und erst beim Anbieter abgewiesen. Über die
Feldnamen sagt ein 429 **nichts** — es ist derselbe Zustand wie `TOR 403` in der Anbieter-Tabelle:
kein Beweis für „der Weg wirkt", aber auch kein Gegenbeweis. Erst Versuch 4 hat die Form belegt.

## 2. Die Form, Feld für Feld

```json
POST /api/v1/images/generations
{ "model": "google/gemini-2.5-flash-image",
  "prompt": "…",
  "n": 1,
  "response_format": "b64_json" }
```

Antwort: `data[0].b64_json` (Base64). Der `url`-Weg ist **nicht** gemessen — der Anbieter kann ihn
liefern, wenn `response_format` fehlt; der Code holt ihn dann, statt das Bild zu verwerfen.

**Der Behälter war ein PNG** (`89 50 4E 47`). Die Sonde hatte die Datei trotzdem `….png` genannt —
**das war Glück, keine Messung**. Seitdem gilt: der Typ kommt aus den ersten Bytes
(`bildArt` in `packages/ai/openrouter/src/index.ts`), nicht aus dem Dateinamen und nicht aus dem
Wunsch. Die Sonde benennt ihre Ausgabe inzwischen nach dem erkannten Behälter.

**Was die Modellliste sagt:** `GET /models` nennt **12 von 471** Modellen mit Bildausgabe
(`architecture.output_modalities` enthält `image`). Alle zwölf stehen in
[`bild-modelle.mjs`](messsonden/bild-modelle.mjs) mit ihren Preisfeldern. Die Preise sind
**Token**preise, nicht Preise je Bild — ein Bild kostet viele Ausgabe-Token, und die Zahl aus der
Liste ist dafür keine Auskunft.

## 3. Das Plugin: `@prometheus-harness/ai-capabilities`

Ein Cordis-Plugin (`pmh-ai-capabilities`), das **eine** Kette aus Einstellungen, Schlüssel und
Anbieter baut und daraus **zwei** Flächen bedient:

| Fläche | Adresse / Name | Antwort |
|---|---|---|
| Auskunft | `GET /api/ai/capabilities` | je Fähigkeit: Anbieter, Modell, bereit, Grund |
| Urteil | `POST /api/ai/decide` | `{urteil: {wert, sicherheit?, herkunft?}}` |
| Text zu Sprache | `POST /api/ai/speak` | `audio/wav` (aus PCM gepackt) |
| Sprache zu Text | `POST /api/ai/transcribe` | `{text}` |
| Einbetten | `POST /api/ai/embed` | `{vektoren, dimensionen}` |
| Bild | `POST /api/ai/draw` | Bytes (`image/png`) oder `{base64, typ}` mit `json: true` |
| Werkzeug | `image_generate` | schreibt die Datei, nennt den Pfad |
| Werkzeug | `speech_speak` | schreibt eine WAV-Datei |
| Werkzeug | `speech_transcribe` | liest eine lokale Audiodatei |
| Werkzeug | `text_embed` | Vektoren |
| Werkzeug | `ai_decide` | geprüftes Urteil |

**Vier Entscheidungen, die man kennen muß:**

1. **Die Kette wird je Anfrage gebaut.** Eine geänderte Einstellungsdatei wirkt sofort — ein
   Neustart wäre genau der Moment, in dem jemand glaubt, seine Wahl sei verloren.
2. **Der Schlüssel kommt aus `ctx.credentials.resolve('OPENROUTER_API_KEY')`**, ersatzweise aus der
   Umgebung. Er erscheint in **keiner** Antwort; die Auskunft nennt nur „gesetzt".
3. **Die Sperre ist eine Sperre.** Ohne Anmeldung 401, ohne Verbindungsdienst 503 — nie
   ungeschützt 200. Die Endpunkte kosten Geld.
4. **Die Werkzeuge sind freiwillig.** Fehlt `ctx.tools`, bleiben die Endpunkte stehen; ein hartes
   `inject: ['tools']` würde das ganze Plugin nicht einhängen.

**Prüfungen:** 29 in `packages/api/ai-capabilities/tests` (Kette, Flächen, Einhängen), dazu 58 im
Anbieter (davon 8 neu für `bild` und den Hör-Weg) und 43 im Verzeichnis.

## 4. Der Avatar — und das SVG, das jetzt wirklich entsteht

Datei: [`assets/avatar/prometheus-avatar.png`](../../assets/avatar/prometheus-avatar.png) ·
1024 × 1024 · 704 873 Bytes · PNG. Zweite Fassung: `avatar-plugin.png` (698 716 Bytes).

Der Auftrag war bewußt **flach** gehalten — *„flat vector avatar icon, bold black outlines, solid
burnt orange and deep blue fills, centered and filling the frame, plain white background, minimal
geometric shapes, no gradients, no shadows, no text, sticker style, high contrast, suitable for
tracing to SVG"* —, damit ein Vektorisierer wenig zu tun hat: wenige Farben, harte Kanten, kein
Verlauf.

**Es gibt keinen Vektorisierer auf dieser Maschine** — `magick`, `potrace`, `vtracer`, `inkscape`
fehlen (geprüft am 19.10.2026). Deshalb steht der Tracer jetzt **im Projekt**:
[`packages/vision/vectorize`](../../packages/vision/vectorize/src/index.ts), 17 Prüfungen.

```
bun scripts/avatar-svg.mjs assets/avatar/avatar-plugin.png
```

| Größe | Wert |
|---|---|
| Farben | 6 (`#fefefe`, `#296294`, `#010101`, `#e78939`, `#222428`, `#786455`) |
| Schleifen | 3, 2, 7, 3, 4, 1 |
| Stützpunkte | 19 536 → 581 |
| **Abweichung** | **0,214 %** der Pixel (2 247 von 1 048 576), zurückgerechnet und verglichen |
| SVG | `assets/avatar/avatar-plugin.svg`, 6 239 Bytes |
| Dauer | 861 ms |

**Die Zahl, die zählt, ist die Abweichung.** Der Tracer rechnet seine eigenen Pfade mit demselben
even-odd zurück, das ein Browser benutzt, und vergleicht Pixel für Pixel. Ein SVG, das niemand
zurückgerechnet hat, wäre eine Behauptung über Flächen.

**Was er nicht kann:** keine Kurven (nur Polygonzüge), keine Hierarchie, keine Fotos. Für ein
flächiges Zeichen mit sechs Farben ist er gedacht — und dafür ist er gebaut.

## 5. Der STT-Fund — ein leerer Text, der nach „nichts verstanden" aussah

Beim ersten lebenden Durchlauf der vier Wege (`messsonden/wege-lebend.mjs`) kam aus der
Transkription **`""`** zurück — bei HTTP **200**. Der Ton war nachweislich da (4,7 s, RMS 4870).
Die Sonde `messsonden/stt-form.mjs` hat die Formvarianten durchprobiert:

| Auftrag | Antwort |
|---|---|
| `file: 'ton'`, `application/octet-stream` | **200**, `text: ""` |
| `file: 'ton'`, `octet-stream`, `language: de` | **200**, `text: ""` |
| `file: 'ton.wav'`, `audio/wav` | **200**, *„Guten Tag. Ich bin Prometheus, ein Assistent auf diesem Rechner."* |
| `file: 'ton.wav'`, `audio/wav`, `language: de` | **200**, derselbe Satz |

**Die Ursache war eine Endung.** Ohne sie nimmt der Dienst die Datei an und versteht nichts — ohne
Fehlercode, ohne Meldung. Der Anbieter rät den Behälter jetzt aus den **ersten Bytes**
(`tonArt` in `packages/ai/openrouter/src/index.ts`) und schickt `ton.wav`, `ton.mp3`, `ton.ogg` …
Dieselbe Regel wie beim Bild: der Typ kommt aus den Daten.

**Der Beweis nach der Korrektur** (frischer Prozeß, `wege-lebend.mjs`):

```
JA   TTS  230400 Bytes audio/pcm → WAV 230444 Bytes (4,8 s Ton, 2325 ms)
JA   STT  2172 ms, 100 % der Wörter wiedererkannt:
          „Guten Tag. Ich bin Prometheus, ein Assistent auf diesem Rechner."
JA   Entscheiden  8007 ms → {"antwort":"ja"} von openrouter/openai/gpt-oss-20b
JA   Einbetten    485 ms, 3072 Dimensionen, ähnlich 0,804 > fremd 0,466
```

**Was das für den laufenden Host heißt:** der Prozeß hat das alte Modul noch im Speicher. Die
Werkzeuge sind geladen (`speech_speak`, `speech_transcribe`, … erscheinen im Gespräch), aber
`speech_transcribe` liefert bis zum **Neustart** weiter `""`. Nach dem Neustart gilt der korrigierte
Weg.

## 6. Was offen ist

| Offen | Grund |
|---|---|
| **Der laufende Host hat den STT-Fix noch nicht** | Das Modul liegt im Speicher des Prozesses. Ein Neustart macht `speech_transcribe` wirksam; bis dahin liefert es `""` (gemessen). |
| **`url`-Weg (Bild) ist ungemessen** | Gemessen ist `b64_json`. Der Code holt `url`, aber ein lebender Nachweis fehlt. |
| **Kein besserer Vektorisierer** | `packages/vision/vectorize` ist ein eigener, bewußt einfacher Tracer (keine Kurven). `magick`/`potrace`/`vtracer`/`inkscape` fehlen weiterhin. |
| **Preis je Bild** | Die Liste nennt Tokenpreise; was ein Bild kostet, ist nicht gemessen. |
| **Keine Oberfläche für die Modellwahl** | Bis sie da ist: `bun scripts/ai-einstellen.mjs --faehigkeit bild --anbieter openrouter --modell …` |

## 7. Wie man es prüft

```powershell
bun test packages/api/ai-capabilities/tests        # 29 Prüfungen
bun test packages/ai/openrouter                     # 58 Prüfungen (8 für Bild und Hör-Weg)
bun test packages/vision/vectorize/tests            # 17 Prüfungen (PNG, Farben, Kanten, Rückrechnung)
bun test packages/ai/provider-directory             # 43 Prüfungen
& node_modules/.bin/tsgo --noEmit -p packages/api/ai-capabilities/tsconfig.json

bun docs/status/messsonden/wege-lebend.mjs          # TTS→STT→Urteil→Einbetten, kostet Bruchteile eines Cents
bun scripts/avatar-svg.mjs assets/avatar/avatar-plugin.png

# nach einem Neustart des Hosts:
curl.exe -i http://127.0.0.1:3080/api/ai/capabilities     # ohne Keks: 401 — die Route ist da
```
