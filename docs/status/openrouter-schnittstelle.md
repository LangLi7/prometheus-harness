# OpenRouter — die gemessene Schnittstelle

Stand: 15.10.2026. **Alles hier ist lebend gemessen**, mit dem Schlüssel aus
`~/.dsh/.credentials.yaml` (5 $/Monat, verbraucht zusammen **unter 0,004 $**). Kein Wert ist
geraten; die Fehlermeldungen des Dienstes haben den Vertrag Stück für Stück verraten.

## Der Schlüssel

```
GET https://openrouter.ai/api/v1/key      (kostet nichts)
  limit 5 $ / monthly     verbleibend 4,9995 $     kostenlose Anfragen/Tag: 1000
```

**Aussagekräftig für den Vertrag:** der Schlüssel hängt am *Anbieter*, die Modellkennung ist
Einstellung — genau wie im Vertrag `@prometheus-harness/faehigkeiten` vorgesehen.

## Die fünf Wege — jeder anders

| Fähigkeit | Weg | Eingabe | Ausgabe |
|---|---|---|---|
| `entscheiden` | `POST /api/v1/chat/completions` | `response_format: {type:'json_schema',json_schema:{name,strict,schema}}` | JSON **im Textfeld** `content` |
| `text-zu-sprache` | `POST /api/v1/audio/speech` | `{model, input, voice, response_format:'pcm'}` | **rohe Bytes**, Kopfzeile nennt das Format |
| `sprache-zu-text` | `POST /api/v1/audio/transcriptions` | `multipart/form-data`: `file`, `model` | `{"text": …, "usage": {…}}` |
| `einbetten` | `POST /api/v1/embeddings` | `{model, input}` | `data[0].embedding` |
| `bild` | **noch nicht gemessen** | — | — |

Überall derselbe Kopf: `Authorization: Bearer <Schlüssel>`.

## Was die Fehlermeldungen verraten haben

Der Dienst nennt den richtigen Weg, wenn man den falschen geht — drei Messungen, drei Lehren:

1. **TTS gehört nicht in den Chat-Weg.**
   *„google/gemini-3.8-flash-tts is a text-to-speech model and cannot be used with the
   chat/completions endpoint. **Use the /api/v1/audio/speech endpoint instead**."*
2. **`wav` gibt es dort nicht.** *„Invalid option: expected one of \"mp3\"|\"pcm\""*
3. **Und Gemini kann nur `pcm`.** *„Gemini TTS only supports response_format=\"pcm\". Got \"mp3\"."*

## Was die Antworten tragen

**Text zu Sprache** (gemessen, `google/gemini-3.8-flash-tts`, Stimme `Kore`):

```
HTTP 200
Content-Type: audio/pcm;rate=24000;channels=1
X-Generation-Id: gen-tts-1792062960-…
140160 Bytes rohe PCM-Daten
```

**Die Abtastrate steht NUR in der Kopfzeile.** Rohe PCM-Daten tragen keinen Kopf; wer sie ohne
`rate=24000;channels=1` abspeichert, hat eine Datei, die niemand abspielen kann. 140160 Bytes bei
24 kHz/mono/16 Bit sind rund 2,9 Sekunden — die Länge des Satzes stimmt.

**Sprache zu Text** (gemessen, `google/gemini-3.5-transcribe`, 7,15 s englische Probe):

```json
{"text":"The tribal chieftain called for the boy and presented him with 50 pieces of gold.",
 "usage":{"total_tokens":198,"input_tokens":180,"output_tokens":18,"cost":0.000576}}
```

**Einbetten** (gemessen, `google/gemini-embedding-2`): Vektorlänge **3072**, Kosten 0,00000044 $.

**Entscheiden** (gemessen, `typesafe/jev-router`, Schema mit `antwort`/`sicherheit`/`begruendung`):

```json
{"sicherheit": 0.85, "antwort": "nein",
 "begruendung": "Der Import von 12.000 Dateien erzeugt eine hohe I/O- und Systemlast …"}
```

## Zwei Fallen, die den Anbieter prägen

**1. Das Denken frißt das Token-Budget.** Bei 300 Token kam **nichts** zurück: die Zwischenschritte
standen in `message.reasoning`, das Urteil nie in `content`. Ein Anbieter, der das durchreicht,
liefert eine leere Antwort, die wie eine aussieht. Deshalb: **`finish_reason ≠ 'stop'` oder leeres
`content` ist ein Fehler** — kein stiller Rückfall.

**2. Das Urteil steht in `content`, das Denken in `reasoning`.** Die Begründung für
`Urteil.begruendung` kommt aus dem **Schema-Feld**, nie aus `reasoning`. Sonst zeigte man dem
Aufrufer die Gedanken des Modells statt sein Urteil.

**Und die Weiterleitung ist sichtbar:** `jev-router` schickte die erste Anfrage an
`openai/gpt-6-luna`, die zweite an `google/gemini-3.8-flash`. Beide Antworten nennen `model` und
`provider` — das gehört ins Urteil, damit später nachvollziehbar ist, **wer** entschieden hat.

## Ein Irrtum, der hier festgehalten wird

Ich habe behauptet, OpenRouter habe **kein** TTS-, Transkriptions- oder Einbettungsmodell. Das war
**falsch**, und der Fehler ist lehrreich: ich habe aus der **Liste** `GET /api/v1/models`
geschlossen (462 Einträge, darin fehlten diese Modelle). Die **Einzelabfrage**
`GET /api/v1/models/<id>/endpoints` beweist für alle vier Kennungen das Gegenteil:

```
google/gemini-3.8-flash-tts      -> Google AI Studio, Google
google/gemini-3.5-transcribe     -> Google AI Studio
google/gemini-embedding-2        -> Google, Google AI Studio
google/gemini-nano-banana-2.1    -> Google AI Studio
```

**Die Lehre:** eine Liste ist kein Beweis für Abwesenheit. Wer wissen will, ob es etwas gibt, fragt
**danach** — nicht nach der Sammlung, in der er es vermutet. Der Betreiber hat mich korrigiert,
und er hatte recht.

## Kosten (gemessen, je Aufruf)

| Aufruf | Kosten |
|---|---|
| Entscheiden, simpel (51 Token) | 0,0000163 $ |
| Entscheiden, Schema (469 Token) | 0,00167175 $ |
| Sprache zu Text (7,15 s Audio) | 0,000576 $ |
| Einbetten | 0,00000044 $ |
| Text zu Sprache (2,9 s Audio) | (kein Kostenfeld im Binärweg — Kopfzeilen tragen keins) |

Zusammen **unter 0,004 $**. Der Zähler des Schlüssels stand währenddessen unverändert auf
0,00045874 $ — die Abrechnung hinkt offenbar nach. **Gemessen, nicht erklärt.**

## Was noch fehlt

- **Bild** (`google/gemini-nano-banana-2.1`): der Weg ist nicht gemessen. Vermutlich
  `/api/v1/images/generations` oder der Chat-Weg mit `modalities` — **nicht geraten, sondern als
  nächste Messung vorgesehen.**
- **Der lebende Nachweis im Betrieb**: die Aufrufe oben waren Messungen von Hand. Im Anbieter
  gehört ein Aufruf hinter den Schalter `PMH_OPENROUTER_LEBEND=1`, damit kein Testlauf ungefragt
  Geld ausgibt.
