# Bild-Prompts — die Formel, und warum der Avatar so aussah

> **Anlaß** (Betreiber, 19.10.2026): *„wie sollte man dann bild generieren? sollte man ein / command
> nutzen? suche dir ein Skill für Bildgenerierungs prompt oder so nicht das es wie das hier
> aussieht lol"*.
>
> **Die kurze Antwort auf das „warum sieht das so aus":** weil im Auftrag *„flat vector icon,
> sticker style, no gradients, no shadows"* stand. Das Modell hat **genau das** geliefert. Ein
> flaches Zeichen ist kein Unfall — es war die Bestellung.

## 1. Wie man es benutzt

| Weg | Wann |
|---|---|
| **Im Gespräch fragen** — *„zeichne mir …"* | der Normalfall. Das Werkzeug `image_generate` ist geladen, ich rufe es auf und nenne dir den Pfad. |
| **`/bild`-Befehl** | nur, wenn du einen festen Einstieg willst (Stil-Flag, festes Verzeichnis), ohne daß das Modell entscheidet. Ein Befehl ist **kein** Plugin für die Fähigkeit — die ist schon da; er ist eine Abkürzung. |

Ein Befehl lohnt sich erst, wenn es **Parameter** gibt, die man tippt: `/bild --stil foto --format 16:9
ein Fuchs im Schnee`. Solange das Modell den Auftrag ohnehin versteht, ist der Befehl eine zweite
Tür zum selben Raum.

## 2. Die Formel

Ein Bildauftrag ist kein Satz, sondern **sechs Angaben**. Fehlt eine, füllt das Modell sie mit
Gewohnheit — und Gewohnheit sieht man.

| Angabe | Beispiel | Was ohne sie passiert |
|---|---|---|
| **Motiv** | „a red fox sitting in deep snow" | das Modell wählt ein Klischee |
| **Medium** | „photograph", „oil painting", „vector illustration", „3D render" | es wird immer „irgendwie digital" |
| **Licht** | „low winter sun, rim light, soft shadows" | flach und tot |
| **Kamera / Perspektive** | „85 mm, f/1.8, eye level, close-up" | alles wirkt wie ein Icon |
| **Stimmung / Palette** | „cold blue shadows, warm fur, muted background" | Bonbonfarben |
| **Ausschluß** | „no text, no watermark, no extra limbs" | Text und Gliedmaßen |

**Reihenfolge zählt:** Motiv zuerst, Stil danach. Steht der Stil vorn („flat vector icon of …"),
bestimmt er alles andere.

## 3. Drei Vorlagen

**Foto / realistisch**
```
A red fox sitting in deep snow at dusk. Wildlife photograph, 85 mm, f/2.8, low winter sun from
the left, rim light on the fur, cold blue shadows, shallow depth of field, natural colors.
No text, no watermark.
```

**Illustration / gemalt**
```
A flame-headed wanderer standing at the edge of a dark forest. Painterly digital illustration in
the style of a modern mythic poster, warm ember light from below, deep teal shadows, visible
brush strokes, centered composition, 2:3. No text.
```

**Zeichen / Icon (das, was der Avatar war)**
```
A flame-headed figure, app icon. Flat vector, three solid colors (ember orange, slate blue, near
black), thick uniform outlines, centered in a circle, plain white background, no gradients,
no shadows, no text, readable at 32 px.
```
**Diese letzte Vorlage ist genau der Avatar-Auftrag** — sie ist richtig, wenn man ein Icon will.
Wer ein *Bild* will, darf sie nicht benutzen.

## 4. Logo: dasselbe, aber mit Zuschnitt

Ein Logo ist ein Sonderfall des Icon-Auftrags — mit **noch weniger** Farben und ohne Rand. Der
Auftrag, der am 21.10.2026 funktioniert hat:

```
Minimal logo mark for a project named Prometheus: one stylized geometric flame, symmetrical,
rising from a short horizontal base line, two solid colors only — ember orange (#E07A2F) fill with
a near-black (#111111) uniform outline — thick clean strokes, centered, filling about 70 percent
of a square canvas, generous white margin, plain white background, flat vector, no gradients,
no shadows, no text, no letters, no fine detail, readable at 32 pixels.
```

Und der Weg zum SVG:

```powershell
bun scripts/avatar-svg.mjs assets/logo/prometheus-logo.png --farben 3 --toleranz 0.8 --flaeche 48 --zuschneiden 1 --rand 24
```

`--zuschneiden` setzt den `viewBox` auf den **Inhalt** (der weiße Rand bestimmt ihn nicht mehr) und
wirft den Rahmen weg — die weißen Flächen **innerhalb** des Zeichens bleiben. Ergebnis:
`viewBox="360 308 304 408"`, 12 887 Bytes, **0,030 %** Abweichung.

## 5. Modell und Kosten

| Modell | Wann | Preishinweis |
|---|---|---|
| `google/gemini-2.5-flash-image` | Vorgabe, billig, schnell | gemessen: funktioniert |
| `google/gemini-3.1-flash-image` | etwas mehr Qualität | Tokenpreis, nicht je Bild |
| `google/gemini-nano-banana-2.1` | „das gute" — am 19.10.2026 aber **429** | Kontingent |
| `openai/gpt-5-image-mini` | Alternative, wenn Google drosselt | teurer |

Ein Bild kostet **Token**, nicht einen festen Preis. Die Zahl aus `GET /models` ist der Tokenpreis;
was ein Bild kostet, ist **nicht gemessen** und steht als offener Punkt in
[`bild-und-plugin.md`](bild-und-plugin.md).

**Vor jedem Lauf:** sagen, welches Modell und wie viele Bilder. Ein Lauf ist bezahlt, auch wenn das
Ergebnis nichts taugt.

## 6. Die Stellschrauben — gemessen am 21.10.2026

`GET /api/v1/images/models` nennt je Modell die Felder, die es wirklich annimmt. **Nicht jedes
Modell kann alles** — und genau daran scheitern geratene Aufträge:

| Modell | `resolution` | `aspect_ratio` | `quality` | `n` | Referenzen | Preis |
|---|---|---|---|---|---|---|
| `google/gemini-2.5-flash-image` | — | 10 Werte | — | 1 | 0…3 | 0,00003 $/Token |
| `google/gemini-3.1-flash-image` | 512 · 1K · 2K · 4K | 14 Werte | — | 1 | 0…14 | 0,00006 $/Token |
| `google/gemini-nano-banana-2.1` | 1K · 2K · 4K | 14 Werte | — | 1 | 0…14 | 0,00003 $/Token |
| `google/gemini-3-pro-image` | 1K · 2K · 4K | 10 Werte | — | 1 | 0…14 | 0,00012 $/Token |
| `openai/gpt-5-image-mini` | — | 1:1 · 3:2 · 2:3 · auto | auto…high | 1…10 | 0…16 | 0,000008 $/Token |
| `bytedance-seed/seedream-4.5` | 1K · 2K · 4K | 17 Werte | — | 1…10 | 0…14 | **0,04 $/Bild** |

**Gemessen, was ein Bild kostet:** `usage.cost` in der Antwort, für 1344 × 768 mit
`gemini-2.5-flash-image`: **0,0387 USD**. Das ist die Zahl, die vorher fehlte.

**Gemessen, daß `aspect_ratio` wirkt:** derselbe Auftrag mit `seitenverhaeltnis: '16:9'` ergab
**1344 × 768** (Verhältnis 1,750) — nicht 1024 × 1024. Die Sonde prüft das an der PNG-Kopfzeile,
nicht am Augenschein: `messsonden/bild-optionen.mjs`.

## 7. Was das Werkzeug heute NICHT kann

- **Kein Negativ-Feld.** „no text" steht im Prompt — ob das Modell es befolgt, ist seine Sache.
- **Kein Streaming** (Teilbilder während der Erzeugung). Die API kann es; wir nutzen es nicht.
- **Kein `seed`.** Für reproduzierbare Bilder wäre es da — ungemessen.

## 8. Prüfen, was herauskam

Ein Bild, das niemand angesehen hat, ist eine Behauptung. Nach jedem Lauf: Pfad nennen und das Bild
mit `read_image` **ansehen** — nicht beschreiben lassen.
