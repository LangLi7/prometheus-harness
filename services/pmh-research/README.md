# `pmh-research` — Suche und Abruf, lokal und über MCP

> **Zweck.** Der Dienst holt Recherche in die Harness: Metasuche über **SearXNG**,
> Extraktion über **Firecrawl**, Rückfall auf einen **nackten Abruf**. Er bietet
> dieselbe Fähigkeit **zweimal** an — als HTTP-Wege für den Host und als
> **MCP-Werkzeuge** für Agenten und fremde Klienten — und beide rufen *dieselbe*
> Umsetzung auf.
>
> **Was er ausdrücklich nicht tut:** er richtet keinen Anbieter ein, täuscht
> keinen vor, mischt keine Treffer mehrerer Anbieter und umgeht keine
> Bezahlschranke.

---

## 1. Aufruf

```sh
pmh-research detect [--json]                          # was ist eingerichtet
pmh-research search --query <text> [--limit n] [--json]
pmh-research fetch  --url <adresse> [--json]
pmh-research serve  [--addr 127.0.0.1] [--port 4114]  # HTTP + /mcp
pmh-research mcp                                      # JSON-RPC über stdin/stdout
```

Exit-Codes: `0` Erfolg · `1` nichts geliefert oder Anbieterfehler · `2`
Aufruffeher · `125` Startfehler.

## 2. Einrichtung

| Variable | Bedeutung |
|---|---|
| `PMH_SEARXNG_URL` | Basis einer SearXNG-Instanz, z. B. `http://127.0.0.1:8888` |
| `PMH_FIRECRAWL_URL` | Vorgabe `https://api.firecrawl.dev` |
| `PMH_FIRECRAWL_KEY` | der API-Schlüssel — **ohne ihn wird Firecrawl nicht versucht** |
| `PMH_BROWSER_RENDER_URL` | Adresse des lokalen Browser-Dienstes, z. B. `http://127.0.0.1:9335` — **ohne ihn wird nicht gerendert** |
| `PMH_RESEARCH_PRIVAT` | `1` erlaubt private Ziele beim Abruf (nötig für `localhost`-Seiten) |
| `PMH_RESEARCH_MAXBYTES` | Obergrenze des abgerufenen Textes (Vorgabe 2 MiB) |

**Der Renderer ist ein eigener Prozess**, kein Teil dieses Dienstes:
`node scripts/browser-render.mjs` im Wurzelverzeichnis. Er hält einen Chromium
auf CDP-Port 9334 und beantwortet `POST /render {url}` mit Titel und sichtbarem
Text. Ohne ihn bleibt die Kette bei statischem HTML — und das ist der Unterschied,
der bei einer React-Anwendung zählt: das HTML enthält dort nur `<div id="root">`.

**Die SearXNG-Instanz braucht `search.formats: [json]`.** Ohne das antwortet sie
mit 200 und **HTML**; der Dienst meldet das als Fehler (`kein JSON`) und nicht
als „keine Treffer" — der Unterschied ist eine Konfigurationsanweisung gegen eine
leere Liste.

## 3. Die Kette

```
Suche:  searxng → firecrawl
Abruf:  firecrawl (scrape) → renderer (echter Browser, JavaScript) → browser (fetch + Text)
```

**Warum der Renderer in der Mitte steht.** Firecrawl liefert Markdown und kostet
keinen Browserstart. Der Renderer ist der einzige, der JavaScript ausführt — für
eine SPA der einzige, der überhaupt Text sieht. Der nackte Abruf bleibt zuletzt,
weil er am wenigsten kann und am wenigsten kostet. Ist der Renderer nicht
gestartet, steht „nicht erreichbar" als Versuch im Bericht, und die Kette nimmt
den nächsten.

Gemessen am 21.10.2026 an einer Seite, deren Text nur per JavaScript entsteht:

| Lauf | Herkunft | Text |
|---|---|---|
| mit Renderer | `renderer` | `Gerendert per JavaScript` |
| ohne Renderer | `browser` | *(leer — nur der Titel)* |

Drei Regeln, die den Bericht bestimmen:

1. **Jeder Versuch steht im Bericht** — Anbieter, Dauer in ms, Trefferzahl,
   Fehlertext. Ein Nutzer, der die Quelle nicht kennt, kann das Ergebnis nicht
   einordnen.
2. **„Leer" und „kaputt" werden unterschieden.** Ein Anbieter mit `200` und null
   Treffern ist kein Fehler (Feld `fehler` bleibt leer, `treffer: 0` ); einer mit
   HTML statt JSON ist einer.
3. **Kein Mischen.** Die Treffer mehrerer Anbieter werden nicht zusammengeführt
   oder umsortiert — das wäre eine Rangfolge, die keiner der Anbieter behauptet
   hat.

Liefert keiner, ist der Fehler `ErrNichtsGeliefert` — **und der Bericht kommt
mit**. Eine Fehlermeldung ohne Anbieterliste sagt nicht, was zu tun ist.

## 4. Die zwei Oberflächen

| Weg | Form |
|---|---|
| `GET /api/pmh/research/health` | Auskunft über die Anbieter, **ohne** Geheimnisse |
| `POST /api/pmh/research/search` | `{query, limit}` → `Suchbericht` |
| `POST /api/pmh/research/fetch` | `{url}` → `Seitenbericht` |
| `POST /mcp` | JSON-RPC 2.0 (eine Nachricht) |
| `pmh-research mcp` | JSON-RPC 2.0 über stdin/stdout, eine Nachricht je Zeile |

**MCP-Werkzeuge:** `research_search` (`query`, `limit`) und `research_fetch`
(`url`). Fassung `2024-11-05`.

Zwei Entscheidungen, die man an der Form sieht:

- **Eine Meldung ohne `id` bekommt keine Antwort** (über HTTP: `202`). Wer darauf
  antwortet, bricht die Zuordnung für jeden Klienten, der mehrere Nachrichten
  schickt.
- **Ein Fehlschlag ist `isError: true` im Ergebnis, kein JSON-RPC-Fehler.** Die
  Werkzeugausführung hat stattgefunden; ihr Ergebnis ist „nichts gefunden, und
  hier ist warum". Als Protokollfehler gelesen wäre es „das Werkzeug gibt es
  nicht" — und das ist etwas anderes.

## 5. Sicherheit

**Der Rückfall-Abruf lehnt private und lokale Ziele ab**, solange
`PMH_RESEARCH_PRIVAT` nicht `1` ist: Loopback, RFC 1918, `169.254/16`
(einschließlich der Metadaten-Dienste der Cloud), Multicast, reservierte
Bereiche, `::1`, `fc00::/7`, `fe80::/10`. Abgelehnt werden außerdem fremde
Schemata, Benutzerangaben in der URL und `localhost`-Namen.

Der Grund ist nicht Formalie: ein Modell, das `http://169.254.169.254/latest/meta-data`
weiterreicht, liest damit Zugangsdaten, die ihm niemand geöffnet hat.

**Anbieter-Adressen sind Vertrauen des Betreibers**, Abruf-Ziele sind
Fremddaten. Deshalb wird nur das **Ziel** geprüft und nicht die Anbieter-Basis.

## 6. Grenzen

Ehrlich, in der Reihenfolge, in der es weh tut:

1. **DNS-Rebinding ist ungelöst.** Geprüft wird die *Adresse in der URL*, nicht
   das, was ein Name später auflöst. Ein Name, der auf `127.0.0.1` zeigt, kommt
   durch. Die Lösung wäre ein eigener Dialer, der die gewählte IP prüft — **nicht
   gebaut**.
2. **Die HTML-Zerlegung ist eine Heuristik, kein Parser.** Der Rückfall schneidet
   Skript-, Stil- und Markierungsblöcke weg und löst Entitäten auf. Er trennt
   **keinen Haupttext von Navigation** und führt **kein JavaScript** aus. Für
   eine React-Anwendung liefert er fast nichts — dafür ist Firecrawl in der Kette.
3. **Keine Quellenverwaltung.** `MAPPING.md:225` nennt sie; sie ist **nicht**
   gebaut. Es gibt keine Ablage, keine Wiederverwendung, keine Belegkette.
4. **Kein Caching.** Jede Anfrage geht an den Anbieter. Bei einer Metasuche über
   eine öffentliche Instanz ist das eine Last, die man begrenzen müsste.
5. **Keine Anbieter-Gesundheitsprüfung.** Ein toter Anbieter wird bei jeder
   Anfrage neu versucht; es gibt keinen Umlauf, der ihn vorübergehend auslässt.
6. **Nur zwei MCP-Werkzeuge und keine Ressourcen.** Kein `resources/*`, keine
   Prompts, keine Fortschrittsmeldungen.
7. **Keine Fremdabhängigkeit** in `go.mod` — bewusst, wie bei den Nachbardiensten.
   Das ist der Grund für die Heuristik in Punkt 2.

## 7. Gemessen

| Was | Zahl |
|---|---|
| Go-Prüfungen | **18 pass**, `go test -count=1 -v ./tests/` |
| `go build ./...` · `go vet ./...` | exit **0** · exit **0** |
| `search` gegen einen lokalen Anbieter | **2 Treffer**, `herkunft searxng`, exit **0** |
| `fetch` gegen eine lokale Seite | Titel + Text, Skript entfernt, `bytes 124`, exit **0** |
| MCP über stdio | 4 Nachrichten hinein, **3** Antworten heraus (die Meldung bleibt unbeantwortet), exit **0** |

Die 18 Prüfungen laufen gegen **echte lokale HTTP-Server**
(`net/http/httptest`) — nicht gegen Attrappen im Speicher. Damit ist die
Verdrahtung von HTTP, JSON, Rückfall, Zielschutz und MCP belegt; **nicht** belegt
ist das Verhalten gegen eine echte SearXNG-Instanz und gegen Firecrawl, weil hier
keine läuft und kein Schlüssel vorliegt.
