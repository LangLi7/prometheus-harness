# `pmh-research` — Recherche als Dienst, lokal und über MCP

Stand: 18.10.2026. **Alle Zahlen sind gemessen**, mit dem Befehl, der sie
gemessen hat.

## 0. Die Lücke

`MAPPING.md:225` führt den Dienst seit dem 13.10. als geplant:
*„`services/pmh-research` — Go — Firecrawl (Extraktion) + SearXNG (Metasuche) +
Quellenverwaltung"*. Gemessen war vorher: **kein** Ordner, **kein** `unit.json`,
**kein** Code. Die Recherche existierte in diesem Projekt nur als Absicht und als
Fremdwerkzeug (Firecrawl-MCP des Betreibers).

## 1. Was gebaut ist

| Datei | Inhalt |
|---|---|
| `internal/kette/kette.go` | Kette, Bericht je Anbieter, `ErrNichtsGeliefert` |
| `internal/kette/anbieter.go` | SearXNG (Metasuche), Firecrawl (Suche + Scrape), Browser (Rückfall) |
| `internal/kette/ziel.go` | Zielschutz gegen private und lokale Adressen |
| `internal/kette/aushtml.go` | HTML zu Text — Heuristik, ausdrücklich kein Parser |
| `internal/mcp/mcp.go` | JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`, `ping` |
| `internal/api/api.go` | HTTP-Wege unter `/api/pmh/research/…` und `/mcp` |
| `cmd/pmh-research/` | `detect` · `search` · `fetch` · `serve` · `mcp` |
| `tests/` | 18 Prüfungen gegen echte lokale HTTP-Server |

**Eine Fähigkeit, zwei Oberflächen.** Die HTTP-Wege und die MCP-Werkzeuge rufen
dieselbe `internal/kette` auf. Eine zweite Umsetzung wäre eine zweite Wahrheit —
die zweite würde irgendwann anders antworten, und niemand wüsste, welche gilt.

## 2. Die Kette

```
Suche:  searxng → firecrawl
Abruf:  firecrawl (scrape) → browser (fetch + Text)
```

Drei Eigenschaften, die den Bericht bestimmen und die geprüft sind:

| Eigenschaft | Beleg |
|---|---|
| **Jeder Versuch steht im Bericht** (Anbieter, Dauer, Treffer, Fehler) | `TestKetteFaelltAufDenNaechstenAnbieterZurueck` — 2 Versuche, der erste mit Fehler |
| **„leer" ≠ „kaputt"** — 200 mit null Treffern ist kein Fehler | `TestLeererAnbieterHaeltDieKetteNichtFuerEinErgebnis` |
| **Kein Mischen** — Treffer mehrerer Anbieter werden nicht zusammengeführt | Bauart: die Kette endet beim ersten Anbieter **mit** Treffern |
| Liefert keiner: `ErrNichtsGeliefert` **mit** Bericht | `TestKetteMeldetAlleAnbieterWennKeinerLiefert` |

Der Fall, der im Betrieb am häufigsten schiefgeht, hat einen eigenen Test: eine
SearXNG-Instanz ohne `search.formats: [json]` antwortet mit **200 und HTML**.
Der Dienst meldet `kein JSON` — und **nicht** „keine Treffer". Der Unterschied ist
eine Konfigurationsanweisung gegen eine leere Liste
(`TestSearXNGOhneJSONFormatIstEinFehlerUndKeinLeeresErgebnis`).

## 3. Der Zielschutz

Der Rückfall-Abruf lehnt ohne `PMH_RESEARCH_PRIVAT=1` ab: Loopback, RFC 1918,
`169.254/16` (Cloud-Metadaten), `100.64/10`, Multicast, reservierte Bereiche,
`::1`, `fc00::/7`, `fe80::/10`, fremde Schemata, Benutzerangaben in der URL und
`localhost`-Namen. `TestZielschutz` fährt **13 Fälle** durch — sieben davon
müssen abgelehnt, zwei angenommen werden, und jeder abgelehnte nennt seinen
Grund.

**Anbieter-Adressen sind Vertrauen des Betreibers, Abruf-Ziele sind Fremddaten.**
Deshalb wird nur das Ziel geprüft.

## 4. MCP — und die zwei Entscheidungen, die man an der Form sieht

| Entscheidung | Warum |
|---|---|
| Eine Meldung ohne `id` bekommt **keine** Antwort (HTTP: `202`) | wer antwortet, bricht die Zuordnung für jeden Klienten mit mehreren Nachrichten |
| Ein Fehlschlag ist `isError: true` **im Ergebnis**, kein JSON-RPC-Fehler | die Ausführung hat stattgefunden; ihr Ergebnis ist „nichts gefunden, und hier ist warum". Als Protokollfehler gelesen wäre es „das Werkzeug gibt es nicht" |

## 5. Der Lauf am Binary — gegen einen echten lokalen Anbieter

```
$ pmh-research detect
searxng   ja
firecrawl nein
browser   ja (Rueckfall)
privat    ja

$ pmh-research search --query "prometheus harness" --limit 5
1. Erster Treffer
   https://example.invalid/a
   searxng
2. Zweiter Treffer
   https://example.invalid/b
   searxng
herkunft  searxng (1 Versuch(e))          exit 0

$ pmh-research fetch --url "http://127.0.0.1:18899/seite"
quelle    browser (http://127.0.0.1:18899/seite)
bytes     124

Seitentitel
Ueberschrift

Ein Absatz.                                exit 0
```

Der `fetch`-Lauf beweist zweierlei in einem: der Titel wird **vor** dem Entfernen
der Markierungen gelesen, und der `<script>`-Block fehlt im Text.

**MCP über stdio — 4 Nachrichten hinein, 3 Antworten heraus:**

```
{"jsonrpc":"2.0","id":1,"result":{"capabilities":{"tools":{"listChanged":false}},
 "protocolVersion":"2024-11-05","serverInfo":{"name":"pmh-research","version":"0.1.0"}}}
{"jsonrpc":"2.0","id":2,"result":{"tools":[ … research_search, research_fetch … ]}}
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{\"ergebnis\":{…
 \"herkunft\":\"searxng\"}}"}]}}
```

Die **vierte** Nachricht war `notifications/initialized` — sie bekommt keine
Antwort. Genau das ist die Regel und keine Auslassung.

## 6. Der eigene Fehler, den die Prüfung gefunden hat

Die erste Fassung von `TestSearXNGOhneJSONFormatIstEinFehler…` war **falsch
gebaut**: der Ersatz-Server lieferte nur dann HTML, wenn `format=json` **fehlt** —
aber der Klient setzt den Parameter **immer**. Der Test prüfte also einen Fall,
den der Code nie erzeugt, und war grün, ohne etwas zu belegen.

Behoben: der Ersatz-Server liefert **immer** HTML. Das ist der echte Fehlaufbau
(die Instanz ignoriert den Parameter, weil `search.formats` ihn nicht kennt) —
und der Test schlägt jetzt fehl, wenn der Dienst HTML als „keine Treffer" liest.

## 7. Nicht gebaut — mit Grund

| Lücke | Wirkung |
|---|---|
| **DNS-Rebinding** | geprüft wird die Adresse in der URL, nicht das aufgelöste Ziel; ein Name auf `127.0.0.1` kommt durch. Lösung wäre ein eigener Dialer, der die gewählte IP prüft |
| **Quellenverwaltung** | in `MAPPING.md:225` genannt, **nicht** gebaut: keine Ablage, keine Wiederverwendung, keine Belegkette |
| **Kein Caching** | jede Anfrage geht an den Anbieter; eine öffentliche SearXNG-Instanz trägt die Last mit |
| **Keine Anbieter-Gesundheit** | ein toter Anbieter wird bei jeder Anfrage neu versucht; kein Umlauf lässt ihn zeitweise aus |
| **Nur zwei MCP-Werkzeuge** | kein `resources/*`, keine Prompts, keine Fortschrittsmeldungen |
| **Heuristik statt Parser** | der Rückfall trennt keinen Haupttext von Navigation und führt kein JavaScript aus |
| **Nicht gegen echte Anbieter gemessen** | hier läuft keine SearXNG-Instanz und es liegt kein Firecrawl-Schlüssel vor; belegt ist die Verdrahtung, nicht das Verhalten der Fremdsysteme |

## 8. Zahlen

| Was | Ergebnis |
|---|---|
| `go test -count=1 -v ./tests/` | **18 pass**, exit 0 |
| `go build ./...` · `go vet ./...` | exit **0** · exit **0** |
| `pmh-gen check` mit dem Dienst in der Deklaration | **14 Units**, Takt `boot`, 6 Warnungen (Ordnernamen `native/`) |
| Generation danach | **#5**, `sha256:d1d5487555…` |
| Fremdabhängigkeiten in `go.mod` | **0** |
