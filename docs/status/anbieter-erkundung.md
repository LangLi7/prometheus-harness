# Die bekannten Anbieter — erkundet, nicht geraten

Stand: 15.10.2026. **Alles hier ist gemessen** — mit `GET /models` und leeren `POST`s. Kostenlos:
beide Arten von Aufrufen erzeugen keine Antwort und damit keine Rechnung. **Keine Fähigkeit wurde
wirklich aufgerufen.** Kein Schlüssel steht in dieser Datei.

Die Liste der Anbieter stammt **nicht aus dem Gedächtnis**: es sind die Einträge im
Schlüsselspeicher `~/.dsh/.credentials.yaml`. Der Betreiber hat klargestellt: **es geht um die
bekannten Anbieter**, und **DeepSeek ist nur der billige Verwalter**, der den Katalog aktuell hält.

## 1. Wer eine Models-API hat

| Anbieter | Adresse | Models-API | Deutung |
|---|---|---|---|
| OpenRouter | `openrouter.ai/api/v1` | **200, 462 Modelle** | bestätigt |
| DeepSeek | `api.deepseek.com` | **200, 2 Modelle** | bestätigt |
| Anthropic | `api.anthropic.com/v1` | **200, 14 Modelle** | bestätigt — **anderer Kopf!** |
| Z.ai / BigModel | `api.z.ai/api/paas/v4` | **200, 11 Modelle** | bestätigt; `open.bigmodel.cn` ist dieselbe Sache |
| ZenMux | `zenmux.ai/api/v1` | **200, 207 Modelle** | bestätigt |
| Nous Research | `inference-api.nousresearch.com/v1` | **200, 423 Modelle** | bestätigt |
| OpenCode Zen | `opencode.ai/zen/v1` | **200, 86 Modelle** | bestätigt |
| OpenAI | `api.openai.com/v1` | **403** | **Schlüssel abgelehnt** — der Weg ist da |
| Groq | `api.groq.com/openai/v1` | **401** | **Schlüssel abgelehnt** — der Weg ist da |
| Ollama Cloud | — | 404 / HTML | **Weg nicht gefunden** |
| LM Studio | `127.0.0.1:1234/v1` | Netzfehler | läuft lokal nicht |
| Firecrawl | `api.firecrawl.dev/v2` | 404 | **kein Modellanbieter** |

**Sieben Anbieter mit gültiger Models-API.** Zwei Schlüssel werden abgelehnt (OpenAI 403, Groq 401)
— das ist ein Befund für den Betreiber, kein Fehler des Verzeichnisses. **Firecrawl ist kein
Modellanbieter**: es ist ein Sammlungsdienst, und `/models` gibt es dort nicht. Nicht jeder
Schlüssel im Speicher gehört in ein Modellverzeichnis.

## 2. Welche WEGE existieren — mit Gegenprobe

`JA` = der Weg ist da (400/422 heißt: angenommen, Auftrag falsch; 200 heißt: geantwortet).
`. ` = 404, den Weg gibt es nicht. `TOR` = 401/403, sagt **nichts** über den Weg. `?` = sonst.

| Weg | OpenRouter | DeepSeek | Anthropic | Z.ai | ZenMux | Nous | OpenCode |
|---|---|---|---|---|---|---|---|
| `/chat/completions` | JA 400 | JA 422 | JA 400 | **JA 200** | TOR 403 | JA 400 | ? **500** |
| `/messages` | JA 400 | . 404 | JA 400 | . 404 | TOR 403 | JA 400 | ? **500** |
| `/audio/speech` | JA 400 | . 404 | . 404 | **JA 200** | TOR 403 | . 404 | . 404 |
| `/audio/transcriptions` | JA 400 | . 404 | . 404 | **JA 200** | TOR 403 | . 404 | . 404 |
| `/embeddings` | JA 400 | . 404 | . 404 | **JA 200** | TOR 403 | . 404 | . 404 |
| `/images/generations` | JA 400 | . 404 | . 404 | **JA 200** | TOR 403 | . 404 | . 404 |
| **`/gibtsnicht-abc123xyz`** | **404** | **404** | **404** | **404** | **500** | **404** | **404** |

**Die letzte Zeile ist die Gegenprobe.** Ohne sie wäre die Tabelle wertlos: ein Dienst, der alles
mit 400 beantwortet, sähe aus wie einer, der alles kann. Sechs von sieben geben auf einen
erfundenen Pfad **404** — die Unterscheidung ist also echt.

## 3. Was die Tabelle NICHT sagt — und warum das wichtig ist

**„Der Weg ist da" ist nicht „die Fähigkeit wirkt"** (Regel 37). Aus dieser Tabelle folgt
**nicht**, daß Z.ai Bilder erzeugt oder spricht. Es folgt: die Pfade antworten. Die **Form** des
Auftrags — welche Feldnamen, welche Modellkennung — ist bei allen neuen Anbietern **ungemessen**.

## 4. Fünf Befunde, die man nicht erwartet

**a) Der Kopf ist bei Anthropic ein anderer — gemessen.** Anthropic antwortet **200 mit 14
Modellen**, wenn der Schlüssel als `x-api-key` **und** mit `anthropic-version` geht. Mit
`Authorization: Bearer` allein wäre es ein Fehler gewesen. Das ist der Beweis, daß
`Familie.kopf` eine **Funktion** sein muß und keine Zeichenkette.

**b) Z.ai antwortet mit 200 auf einen LEEREN Auftrag — auf allen fünf Wegen.** Das ist
**mehrdeutig** und darf **nicht** als „funktioniert" gelesen werden. Ein leerer Auftrag, der mit
200 beantwortet wird, riecht nach einer Fehlerhülle mit falschem Status — ein verbreitetes Muster.
Ob der Weg *wirkt*, ist damit **nicht** gezeigt.

**c) ZenMux ist mit diesem Schlüssel NICHT prüfbar.** `GET /models` gibt 200 mit 207 Modellen —
aber **jeder** POST gibt 403, **auch der erfundene Pfad** (der gibt 500). Hier lernt man **nichts**
über Wege. Genau dafür steht die Regel „TOR → unbekannt" in der Sonde: wer 403 als „vorhanden"
liest, trägt einen Anbieter ein, der nichts kann.

**d) Nous und Anthropic antworten auf BEIDE Chat-Formen mit 400** — auf `/chat/completions` und
auf `/messages`. Das ist gemessen und **unerklärt**. Ich schreibe es hin, statt es wegzuerklären:
ein Befund, den ich nicht verstehe, ist ein Befund — keine Lücke.

**e) OpenCode antwortet auf den Chat-Weg mit 500.** Der Weg **ist** da (der erfundene Pfad gibt
404), aber der Dienst scheitert an einem leeren Auftrag. Die Sonde deutet 500 als **unbekannt** —
die vorsichtige Lesart.

## 5. Die Folge für den Verwalter

Der Betreiber will **DeepSeek Flash** als Verwalter, der den Katalog aktuell hält — wegen des
Preis-Leistungs-Verhältnisses. Dazu zwei gemessene Anmerkungen:

1. **DeepSeek kann genau das, was ein Verwalter braucht**: Chat, billig, 2 Modelle, und die
   Models-API antwortet. Es braucht **keine** der vier anderen Fähigkeiten — die 404-Messung ist
   für diese Rolle kein Mangel, sondern ausreichend.
2. **Der Verwalter liest fremde Antworten — also muß der Wächter davor.** Wenn DeepSeek eine
   fremde API-Antwort *auslegt*, geht diese Antwort über das Netz. Enthielte sie einen Schlüssel,
   hätte das Auslegen ihn verschickt. Der Weg gehört deshalb **durch `@prometheus-harness/guard`**
   — Stufe 1 (Regeln, ohne Modell) zuerst, und bei einem Fund **kein** Modellaufruf.
