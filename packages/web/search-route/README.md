# `search-route` — welcher Suchweg zuerst versucht wird

> **Zweck.** Eine Auskunft vor der Suche: *diese Reihenfolge, weil diese Wege jetzt so viel
> kosten und so viel liefern.* Kein Netzabruf, keine Latenzmessung, keine Entscheidung im
> Hintergrund.

## 1. Warum nicht „der billigste"

Die naive Frage hat eine langweilige Antwort: SearXNG kostet immer 0 und gewänne jeden Vergleich
— auch dort, wo es den Bedarf gar nicht deckt. Eine zusammengefasste Antwort und eine extrahierte
Seite kann es nicht liefern. Der Vergleich läuft deshalb je Bedarf.

| Bedarf | Bedeutung |
|---|---|
| `answer` | eine formulierte Antwort mit Quellen |
| `links` | Trefferliste mit Snippets |
| `extract` | eine Seite als Markdown |
| `render` | eine Seite, die ohne JavaScript nichts hergibt |

## 2. Die Wege und ihre Preise

| Weg | Preis je erfolgreicher Suche | Deckt |
|---|---|---|
| SearXNG (lokal) | 0 | `links` |
| Firecrawl (lokal) | 0 | `links`, `extract` |
| DeepSeek Server-Tool | 0 bis 2026-10-31 16:00 UTC, danach 0,00075 USD | `answer`, `links` |
| Browser-Use | kein Preis je Suche, jeder Schritt ein Modell-Turn | `render` |

**Firecrawl und SearXNG laufen lokal.** Deshalb kosten sie je Suche nichts, und deshalb gibt es
hier kein Monatskontingent: die Cloud-Preise von Firecrawl sind bewusst **nicht** modelliert. Eine
frühere Fassung führte ein Kontingent mit; der Verbrauch ist von außen nicht lesbar, also war die
Zahl geraten. Geraten ist schlechter als weggelassen.

Der einzige Preis, der sich von selbst ändert, ist der des DeepSeek-Werkzeugs am Stichtag.

## 3. Die Ordnung

1. **Gratis zuerst.** Ein Weg, der jetzt 0 kostet, steht vor jedem, der jetzt Geld kostet.
2. **Mehr Deckung gewinnt.** Unter gleich teuren Wegen steht der, der den Bedarf voll deckt, vor
   dem, der ihn nur teilweise deckt.
3. **Dann der Rang.** Unter gleich teuren und gleich deckenden Wegen: DeepSeek-Werkzeug vor
   SearXNG vor Firecrawl.
4. **Bezahlt nur mit Rückfrage.** Der erste Schritt, der jetzt Geld kostet, ist als `bezahltAb`
   markiert; dazu kommt ein `hinweis`, wenn gar nichts Gratis erreichbar ist.

Solange das DeepSeek-Werkzeug gratis ist, steht es deshalb vorn — auch bei `links`, wo SearXNG
schneller wäre. Nach dem Stichtag dreht sich die Reihenfolge ohne Codeänderung.

## 4. Aufruf

```powershell
bun test packages/web/search-route
bun run packages/web/search-route/src/cli.ts
bun run packages/web/search-route/src/cli.ts --jetzt=2026-11-05T12:00:00Z
bun run packages/web/search-route/src/cli.ts --ohne=searxng,firecrawl
```

## 5. Grenzen — benannt, nicht weggelassen

1. **Kein Netz.** Der Planer fragt keinen Anbieter und misst keine Latenz. Erreichbarkeit kommt
   als `Lage` herein; wer die Kette ausführt, prüft vorher.
2. **Tokenkosten fehlen.** Die DeepSeek-Suche kostet zusätzlich einen Modell-Turn; der steht in
   keiner Suchgebühr. Wer die echten Kosten will, nimmt `@prometheus-harness/usage`.
3. **Der Stichtag ist eine Annahme aus der Doku.** Verschiebt DeepSeek ihn, ist `STICHTAG` falsch,
   bis jemand die Konstante ändert.
4. **Nicht verdrahtet.** Das Paket ist ein Planer, kein Bestandteil des `ctx.web`-Seams. Der Seam
   kennt genau einen Anbieter je Fähigkeit; die Kette müsste **in** einem Provider stecken.
