# Entscheiden, Unsicherheit, und wer am Ende fragt

Stand: 15.10.2026. Was hier steht, ist **entschieden** — nicht geplant. Die Belege stehen je
Abschnitt; die Zahlen sind gemessen, nicht geschätzt.

## 1. Der Vorfall, aus dem der Rest folgt

Beim Lesen des Schlüsselspeichers `~/.dsh/.credentials.yaml` habe ich **alle 14 Schlüssel im
Klartext in den Gesprächsverlauf geschrieben**. Meine Maskierung griff nur bei Zeilen mit
`secret:` — die Schlüssel stehen dort aber unter `refs:`.

**Was geprüft wurde, danach** (nicht behauptet, sondern gemessen):

| Frage | Werkzeug | Ergebnis |
|---|---|---|
| Steht ein Schlüssel in meinen Commits? | `git grep -F` über meine 15 Commits, 23 Werte | **kein Treffer** |
| Steht einer im Arbeitsbaum? | verfolgte **und** unverfolgte Dateien | **kein Treffer** |
| Was war der eine Treffer `REDIS_URL`? | Vergleich mit `.env.example` | **identisch** — veröffentlichter Standardwert, kein Geheimnis |

**Das Leck ist der Gesprächsverlauf, nicht das Repository.** Wer diesen Verlauf außerhalb des
Geräts liest, hat die Schlüssel; sie sind als kompromittiert zu behandeln. Die Regel, die daraus
folgt, steht in `arbeitsweise.md`: **Geheimwerte nie ausgeben — auch nicht „maskiert" —, sondern
nur Länge und Fingerabdruck.**

## 2. Was Jev ist — und wofür es hier gebraucht wird

Aus `docs.typesafe.ai` (gelesen 15.10.2026, `confidence.md`): Jev ist ein **System-One**-Modell.
Es liefert **typisierte Antworten und Wahrscheinlichkeiten**, keinen Text und keine Begründung.
Seine Formen sind `Choice` (eines aus einer Menge), `Noul` (Wahrscheinlichkeit für ja) und
`Score` (Stufe auf einer Skala).

Der Betreiber hat den Zweck festgelegt: **Jev für die wiederkehrende Kontrollfrage** — jedes Mal,
wenn der Harness eine Entscheidung braucht, und für Sicherheitsaspekte als **Kontrollrichtlinie**.
Wenn es hart wird, **Tev** (lokal).

## 3. Die drei Stufen, wörtlich aus der Anleitung

| Sicherheit | Verhalten (Zitat) |
|---|---|
| hoch | *„Act automatically."* |
| mittel | *„ask the user to confirm, flag for review"* |
| niedrig | *„Do not act. Route to a human … The model is telling you it does not have enough information."* |

Und zwei Sätze, die die Zuständigkeit festlegen: *„A confidence threshold is not one number"* und
*„Your code encodes the risk tolerance."* **Die Schwellen gehören dem Aufrufer, nicht dem Modell
und nicht mir.**

## 4. Was daraus im Vertrag steht (gebaut, geprüft)

`packages/ai/faehigkeiten`:

- **`Umgang` + `umgangFuer`** — `handeln` | `rueckfrage` | `mensch`. Zwei Regeln sind wichtiger als
  die Schwellen selbst:
  - **Ohne Sicherheitsangabe geht es zum Menschen.** Ein fehlendes Feld als „sicher genug" zu
    lesen, wäre der stille Fehler.
  - **Was ein Mensch entschieden hat, ist entschieden** — sonst entsteht eine Schleife: der Mensch
    antwortet ohne Sicherheit, die Regel schickt die Antwort wieder zum Menschen.
- **`menschAlsAnbieter`** — der Mensch ist ein Anbieter wie jeder andere, **immer bereit**, und
  wird **zuletzt** eingetragen. Damit braucht die Registratur keinen Sonderweg.
- **`bereit(faehigkeit)`** statt `bereit()` — der stille Fehler, der fast entstanden wäre: ein
  Anbieter mit drei von vier eingerichteten Fähigkeiten hätte „nicht bereit" gemeldet und wäre
  **auch für die eingerichtete** übersprungen worden. Die Antwort wäre gekommen — von der falschen
  Stelle.
- **`Herkunft`** am Urteil — weil `typesafe/jev-router` ein **Verteiler** ist: die Kennung, die man
  hineingibt, sagt nicht, wer geantwortet hat.

## 5. Was der Betreiber entschieden hat

1. **Kein teures Modell ohne Erlaubnis, und kein stiller Vorgabewert.** Welches Modell läuft,
   entscheidet der **Endnutzer**. Der Anbieter hat deshalb **keine** Vorgabe: ohne Wahl ist er für
   die Fähigkeit *nicht bereit* — und die Kette läuft weiter bis zum Menschen.
2. **Jev/TypeSafe ist für die Kontrollfrage** (jedes Mal, wenn der Harness entscheidet, und für
   Sicherheitsaspekte). Nicht als Allzweckmodell.
3. **Wenn es nicht anders geht, interagiert zuerst der Mensch** — nicht raten.

Belegt durch **31 Prüfungen** in `packages/ai/faehigkeiten` (davon 19 in `eskalation.test.ts`),
Typecheck über **29 Pakete** grün.

## 6. Der Anbieter OpenRouter (gebaut, geprüft)

Vier Fähigkeiten über vier **verschiedene** Wege, weil das gemessen so ist:

| Fähigkeit | Weg | Besonderheit |
|---|---|---|
| `entscheiden` | `POST /chat/completions` | `response_format.json_schema`, streng geprüft |
| `text-zu-sprache` | `POST /audio/speech` | `response_format: 'pcm'` — Gemini kann nichts anderes |
| `sprache-zu-text` | `POST /audio/transcriptions` | Mehrtelldaten |
| `einbetten` | `POST /embeddings` | nach `index` geordnet, nicht nach Reihenfolge |

**`bild` wird NICHT genannt** — der Weg ist nicht gemessen. Ein Anbieter, der eine Fähigkeit nennt,
die er nicht belegen kann, steht in der Registratur als „kann es".

Belegt durch **47 Prüfungen** über einen echten Socket.

## 7. Die DeepSeek-API — gemessen, nicht vermutet

| Frage | Ergebnis |
|---|---|
| `GET /models` | `deepseek-flash`, `deepseek-v4-pro` |
| `GET /user/balance` | verfügbar, 64,01 USD |
| `POST /embeddings` | **404** |
| `POST /audio/speech` | **404** |
| `POST /audio/transcriptions` | **404** |

**Die DeepSeek-API kann nur Chat.** Sie kann nie TTS oder STT bedienen — wohl aber `entscheiden`.
Genau das ist der Grund, warum der Gedanke des Betreibers richtig ist: **dieselbe Fähigkeit hat je
API eine andere Form**, und die Form gehört beschrieben, nicht einprogrammiert.

## 8. Was noch offen ist — als nächste Schritte

**A. Der Wächter** (`packages/ai/guard`). Die Kontrollfrage vor der Tat: *darf dieser Text
hinaus?* Zwei Stufen, und die Reihenfolge ist Absicht:

1. **Regeln, ohne Modell** — bekannte Geheimwerte aus dem Speicher, Schlüsselmuster. Das ist
   exakt, kostenlos und deterministisch. Mein Vorfall wäre hier aufgefallen.
2. **Urteil, mit Modell** — nur für das, was Regeln nicht entscheiden können: „sieht das nach
   einem Geheimnis aus, das ich nicht kenne?" Ergebnis über `umgangFuer` → handeln / nachfragen /
   Mensch.

Der Wächter ist billig, sofort nützlich und prüfbar: **der Text meines Lecks wird zur Prüfvorlage.**

**B. Die Einstellungen.** Der Endnutzer wählt das Modell je Fähigkeit. Ohne diese Oberfläche
verweigert der Anbieter zwar ehrlich — aber es gibt keinen Ort, an dem man es einstellt.

**C. Der Schnittstellen-Verwalter.** Der Gedanke des Betreibers: **DeepSeek Flash** prüft fremde
APIs und paßt Formate an, wenn der Harness einen Aufbau nicht kennt — beim Start, zu festen
Zeitpunkten, oder wenn ein Schlüssel fehlt (Vorbild: `github.com/tashfeenahmed/freellmapi`).
Damit wird aus „ein Anbieter je API von Hand" ein **Verzeichnis**, das sich selbst nachführt.

**D. Später:** Tev lokal (`packages/ai/local`), der 1:1-Ordnerdialog, das Admin-Konto.
