# Scrapling `adaptive` für Prometheus Harness — Umsetzungsrecherche

**Stand:** 14. Oktober 2026
**Methode:** Primärquellen (Scrapling-Doku, GitHub-Repository, Releases) **plus eigene Messung auf diesem Host** (Portprüfung, Dateisichtung im eigenen Repo)
**Auftrag:** reine Recherche — **wie man es umsetzen könnte**. Die Codebasis wurde **nicht** verändert.
**Gegenstand:** `https://scrapling.readthedocs.io/en/latest/parsing/adaptive.html`

---

## 0. Vorbemerkung: die Prämisse des Auftrags ist zu prüfen

Der Auftrag vermutet, Scraplings `adaptive`-Feature werde „die neue Erweiterung für Firecrawl local + SearXNG Stack und Firecrawl MCP Cloud via api key". Diese Vermutung ist **prüfbar**, und sie hält in dieser Form nicht — aber aus einem Grund, der den Blick auf den eigentlichen Nutzen frei macht.

**Der Mechanismus (wörtlich aus der Doku):** Adaptive scraping arbeitet in zwei Phasen — *Save* und *Match*. Beim Speichern legt Scrapling „unique properties" eines Elements ab:

> „Element tag name, text, attributes (names and values), siblings (tag names only), and path (tag names only). Element's parent tag name, attributes (names and values), and text."

Beim Wiederfinden vergleicht es **alle** Elemente der Seite gegen diesen Fingerabdruck, berechnet einen Ähnlichkeitswert und gibt die ähnlichsten zurück — laut Doku **ohne KI**, also ohne Modellaufruf. Abgelegt wird der Fingerabdruck in einer Datenbank, standardmäßig **SQLite**, adressiert über `(Domain, Kennung)`.

**Was das löst:** Selektor-Verfall. `#p1` existiert nach einem Redesign nicht mehr; `adaptive=True` findet das Element trotzdem.

**Warum das in deiner Pipeline derzeit kein Problem ist:**

| Stufe | Was passiert | Gibt es dort einen Selektor? |
|---|---|---|
| SearXNG `:8081` | Metasuche, liefert Treffer strukturiert | **nein** |
| Firecrawl `:3002` | URL rein → Markdown/HTML raus | **nein** |
| Firecrawl MCP (Cloud) | `scrape`/`extract` mit Schema | **nein** (Schema, nicht Selektor) |

Zwischen „URL rein" und „Text raus" steht in dieser Kette **nirgends ein CSS-Selektor, der verrotten könnte**. Der Agent liest bei jedem Lauf neu aus dem Markdown und leitet die Felder neu ab.

> **Befund 1.** `adaptive` schützt gegen Selektor-Verfall. Selektor-Verfall entsteht erst, wenn man **dauerhafte Selektoren** hat. Die Komponente, die solche hätte — `services/pmh-research` — ist laut `docs/status/delta-non-web.md` **noch nicht gebaut**. Das Feature schützt heute gegen ein Problem, das es noch nicht gibt.

Damit ist die Frage präzise: **nicht** „ersetzt Scrapling Firecrawl?", sondern „was genau wäre hier zu implementieren — und wann lohnt es?"

---

## 1. Was Scrapling ist — belegte Eckdaten

| Merkmal | Wert | Quelle |
|---|---|---|
| Sprache | **Python 99,9 %**, benötigt Python ≥ 3.10 | GitHub-Sprachstatistik, README |
| Fassung | **v0.4.15** (23.08.2026); letzter Commit 11.10.2026 | Releases, Commit-Liste |
| Lizenz | **BSD-3-Clause** — unkritisch, kein Copyleft | `LICENSE` |
| Verbreitung | 87,3k Sterne · 9,0k Forks · 270 abhängige Projekte | GitHub |
| Betriebsformen | Bibliothek · **CLI** (`scrapling shell`, `scrapling extract`) · **MCP-Server** (`scrapling-mcp`) · **Docker** (`pyd4vinci/scrapling`, `ghcr.io/d4vinci/scrapling`) | README, Doku |
| MCP-Werkzeuge | **13**: `make_request`, `bulk_get`, `fetch`, `bulk_fetch`, `stealthy_fetch`, `bulk_stealthy_fetch`, `open_session`, `open_request_session`, `session_fetch`, `session_make_request`, `close_session`, `list_sessions`, `screenshot` | MCP-Doku |

**Nicht** Teil des Auftrags, aber für die Einordnung wichtig: Scrapling kann mehr als den Selektor-Trick. `stealthy_fetch` umgeht laut Doku Cloudflare Turnstile/Interstitial, blockt ~3.500 Werbe-/Tracker-Domains und **bereinigt versteckte Inhalte** (CSS-versteckt, `aria-hidden`, `<template>`, HTML-Kommentare, Zero-Width-Zeichen) gegen Prompt-Injection. Das ist eine Fähigkeit, die selbstgehostetes Firecrawl **nicht** hat.

---

## 2. Die drei Einbaupunkte

### Variante A — Scrapling als Prozess (Container/CLI)

Kein Python-Code im Repo. Der Dienst läuft als Container oder wird als CLI aufgerufen. **Präzedenzfall im Projekt: K3 (Tesseract)** — dessen Auflösung lautet „nur über die Prozessgrenze". Dieselbe Form.

- **Aufwand:** gering (Compose-Eintrag + MCP-Zeile)
- **Gewinn:** Stealth/Anti-Bot **und** `adaptive` sofort
- **Kosten:** ein Python-Prozess im Stack; zweiter Browser-Stapel; eigene Zustandsdatei (siehe §4)

### Variante B — Konzept nachbauen (K1-konform)

Das Verfahren in Prometheus nachbauen: Fingerabdruck + Ähnlichkeitssuche, Zustand in **PostgreSQL**. Präzedenzfall: **K1 (LangChain/LangGraph)** — dessen Auflösung lautet „Konzepte nachbauen, nicht die Bibliothek".

- **Aufwand:** echte Entwicklungsarbeit (siehe §3)
- **Gewinn:** null Python, ein Speicher, ein Sprachstapel, **ausgewiesene Konfidenz** (das Original hat keine)
- **Kosten:** man baut selbst, was es fertig gibt

### Variante C — nur Stealth, `adaptive` weglassen

Scrapling ausschließlich als Antibot-Backend, wenn Firecrawl lokal nicht durchkommt. `adaptive` bleibt ungenutzt.

- **Aufwand:** am geringsten
- **Gewinn:** schließt die **einzige belegte Fähigkeitslücke**
- **Kosten:** keine — außer der Entscheidung, ein Feature liegen zu lassen

> **Befund 2.** Für Variante C spricht, dass sie eine **Fähigkeitslücke** schließt (Stealth). Für `adaptive` spricht nur, dass es **Redundanz** vermeidet (die es noch nicht gibt). Das ist ein starkes Argument für die Reihenfolge: **erst C, dann B, A als Abkürzung.**

---

## 3. Variante B im Detail — die eigentliche Umsetzungsskizze

### 3.1 Wo es sitzt

`services/pmh-research` (`MAPPING.md` §3.7: „Firecrawl (Extraktion) + SearXNG (Metasuche) + Quellenverwaltung"). Die Wiederfindung wäre eine **Teilfähigkeit dieses Dienstes**, kein eigener Dienst — sie hat ohne Extraktion keinen Aufrufer.

### 3.2 Der Fingerabdruck als Tabelle

Weil der Fingerabdruck über `(Domain, Kennung)` adressiert wird, ist er strukturell ein Schlüssel-Wert-Paar. In Prometheus gehört er damit nach PostgreSQL — dorthin, wo der dauerhafte Speicher laut Projektdoktrin ohnehin steht:

```sql
CREATE TABLE research_fingerprint (
  domain            text        NOT NULL,   -- Website (ersetzt Scraplings Domain-Isolation)
  identifier        text        NOT NULL,   -- Kennung, z. B. 'shop:preis'
  tag               text        NOT NULL,   -- Element-Tagname
  text              text,                   -- Elementtext
  attributes        jsonb       NOT NULL,   -- Namen UND Werte
  siblings          text[]      NOT NULL,   -- nur Tagnamen (so im Original)
  path              text[]      NOT NULL,   -- nur Tagnamen (so im Original)
  parent_tag        text,
  parent_attributes jsonb,
  parent_text       text,
  saved_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (domain, identifier)
);
```

### 3.3 Die Verbesserung, die den ganzen Aufwand rechtfertigt

Scrapling hat **keinen Konfidenzschwellwert**. Die Doku führt ein eigenes Kapitel „Wrong Elements Matched" — falsche Treffer sind bekannt, aber man erfährt nicht, *wie sicher* ein Treffer war.

Für eine Forschungs-Pipeline ist das der entscheidende Mangel: eure Doku verlangt, dass jede Aussage **mit Quelle und Herkunft** gespeichert wird. Eine stille Fehlzuordnung vergiftet den Wissensspeicher, und niemand merkt es.

Ein Nachbau kann das beheben — durch eine zweite Tabelle, die das Original nicht hat:

```sql
CREATE TABLE research_relocation (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  domain        text        NOT NULL,
  identifier    text        NOT NULL,
  score         real        NOT NULL,        -- 0..1, AUSGEWIESEN
  stage         smallint    NOT NULL,        -- welche Kaskadenstufe traf (§3.4)
  accepted      boolean     NOT NULL,        -- Schwelle angewandt?
  selector_used text        NOT NULL,        -- der veraltete Selektor
  matched_html  text        NOT NULL,        -- Beweis: was tatsächlich gefunden wurde
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

**Das ist die Kernidee dieser Recherche:** den Fund *immer* protokollieren, mit Score und Beweis. Dann ist eine Fehlzuordnung **auffindbar statt still** — und `stage` wird nebenbei zu einem **Verschleißmaß**: wandert eine Seite dauerhaft von Stufe 1 auf Stufe 3, degradiert der eigene Extraktor, und man sieht es, bevor die Daten falsch werden.

### 3.4 Rückruf: warum hier **kein** pgvector gehört

Der Reflex wäre, Fingerabdrücke als Vektoren zu speichern und pgvector zu nehmen (er ist im Stack, `pgvector/pgvector:pg17` läuft). **Davon rate ich ab**, und zwar aus einem Grund, der im Fingerabdruck selbst liegt:

Die unterscheidende Kraft liegt in **exakten strukturellen Fakten** — Tagnamen, Attributnamen. Genau die verwischen Embeddings. Zudem ist der Fingerabdruck **heterogen** (Zeichenketten, Liste, Abbildung, Pfad); ein einzelner Vektor kann das nicht sauber tragen.

Stattdessen eine **Kaskade** aus harten Filtern, die ausnutzt, dass das Original `siblings` und `path` bewusst **nur als Tagnamen** speichert — das ist das robuste Skelett. Ein Redesign benennt Klassen und IDs um; `<div><article><h3><a>` überlebt meist:

| Stufe | Filter | Wirkung |
|---|---|---|
| 1 | `tag` **und** `path` gleich | höchste Genauigkeit, kleinste Kandidatenmenge |
| 2 | nur `tag` gleich | mittlere Genauigkeit |
| 3 | alle Elemente bewerten | Auffangnetz |

Erst danach die gewichtete Ähnlichkeitsbewertung der Komponenten. Vorteil gegenüber Embeddings: **erklärbar** („gefunden über Stufe 2"), **billig** (kein Modellaufruf, keine Vektorindizes) und **messbar** (§3.6).

pgvector bleibt sinnvoll — aber für **Quelleninhalte** im RAG, nicht für Element-Fingerabdrücke. Das ist eine Aufgabentrennung, keine Abwertung von pgvector.

### 3.5 Was noch fehlt: die genauen Gewichte

Die Doku sagt, „everything is taken into consideration", nennt aber **keine Gewichtungen**. Für einen **treuen** Nachbau müsste man `scrapling/core/` lesen (namentlich `storage.py` und die Vergleichslogik). Für einen **eigenen** Nachbau ist das nicht nötig — die Gewichte werden dann zu euren Stellschrauben, und genau das will man hier.

### 3.6 Abhängigkeiten: es gibt heute keinen HTML-Parser im Projekt

Geprüft: `native/index/Cargo.toml` (`pmh-index`, „source symbol extraction and workspace indexing") hat **genau eine** Abhängigkeit — `serde_json`. Das ist ein **Symbol-Extraktor für Quelltext, kein HTML-Parser**. Ein Nachbau braucht also eine **neue** Abhängigkeit, je nach Sprache:

| Sprache | Bibliothek | Anmerkung |
|---|---|---|
| Go | `goquery` (+ `cascadia`) | bringt CSS-Selektion mit — der Selektor-Teil ist damit geschenkt |
| Rust | `scraper` / `html5ever` | ausgereift, aber schwerer |
| TS/Bun | `linkedom` / `cheerio` | rein JS, keine nativen Addons nötig |

**Beobachtung:** In Go ist die halbe Arbeit schon erledigt, weil `goquery` CSS-Selektoren beherrscht. Zu bauen bleibt nur Fingerabdruck + Bewertung + Speicherung — nach meiner Schätzung **300–500 Zeilen plus Migration und Tests**. Das ist gut machbar.

### 3.7 Die Sprachfrage ist **nicht** entschieden — und das ist ein Befund

Hier stoßen zwei Dokumente aufeinander:

| Dokument | Aussage |
|---|---|
| `MAPPING.md` §3.7 | `services/pmh-research` = **Go** |
| `docs/research/sprachwahl-entscheidung-2026.md`, Entscheidung 10 | „**Zwei** Sprachen: TypeScript auf Bun + **eine** Systemsprache. Nicht drei." |

Wenn die Sprachwahl-Recherche (13.10.2026, also **einen Tag älter** als dieser Bericht und ausdrücklich als Entscheidungsgrundlage geschrieben) gilt, dann ist offen, ob `pmh-research` überhaupt Go wird — oder ob Go die *eine* Systemsprache ist und Rust Federn lässt (die Recherche nennt `pmh-index` und `pmh-crypto` als „schwächste Kandidaten").

> **Befund 3.** Die Umsetzungssprache für den Nachbau ist durch die vorhandenen Dokumente **nicht festgelegt**. Das ist vor der Implementierung zu klären — sonst baut man die Fingerabdruck-Logik zweimal.

---

## 4. Variante A im Detail — Container und MCP

### 4.1 Der Compose-Eintrag folgt euren vier Mustern

`docker-compose.yml` nennt die vier übernommenen Muster selbst: **Profile**, **`${VAR:-default}`**, **`healthcheck` + `depends_on: condition: service_healthy`**, **`init.sql` als Einhängepunkt**. Ein Scrapling-Dienst fügt sich in dasselbe Muster:

```yaml
  scrapling:
    image: pyd4vinci/scrapling:latest
    container_name: pmh-scrapling
    restart: unless-stopped
    profiles: [stealth]                       # startet nur, wenn genannt
    environment:
      SCRAPLING_MCP_AUTH_TOKEN: ${SCRAPLING_MCP_AUTH_TOKEN:-bitte-aendern-token}
    command: ["mcp", "--http", "--host", "0.0.0.0", "--port", "8000"]
    ports:
      - "127.0.0.1:${SCRAPLING_PORT:-8000}:8000"   # nur lokal binden
    volumes:
      - scrapling-data:/data                  # sonst ist der Fingerabdruck nach dem Neustart weg
    networks: [pmh-net]
```

### 4.2 Die Fallstricke der Fassung 0.4.15 — belegt

Genau hier stolpert man. Die MCP-Doku nennt für 0.4.15 ausdrücklich:

1. **`--http` startet ohne Token nicht.** Man braucht `--auth-token` **oder** `SCRAPLING_MCP_AUTH_TOKEN` — oder bewusst `--no-auth`.
2. **Die Vorgabe bindet auf `127.0.0.1`**, nicht `0.0.0.0`.
3. **In Docker muss man `--host 0.0.0.0` selbst setzen** — sonst erreicht der veröffentlichte Port den Dienst nicht, weil das `127.0.0.1` des Containers nur *im* Container sichtbar ist. Genau das verhindert die Kombination aus Punkt 2 und 3.
4. **`get` heißt jetzt `make_request`**; die Einmal-Werkzeuge nehmen **kein** `session_id` mehr — dafür gibt es `session_fetch`.
5. **Der Token ist ein gemeinsamer Schlüssel**, keine Kundenkennung; Wechsel = Neustart.
6. **Klartext-HTTP** überträgt den Token offen.

### 4.3 Der MCP-Anschluss ist im Repo schon vorgemacht

Für die Anbindung existiert eine **belegte Vorlage** im eigenen Baum — `node_modules/@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/templates/mcp/cordis.patch.yml`:

```yaml
- insert:
    - id: demo-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: demo
        transport: streamable-http
        url: http://127.0.0.1:3000/mcp
        failOnStartupError: true
```

Scraplings `--http`-Betrieb ist **Streamable HTTP** — die Transportart passt also wörtlich. Der Anschluss ist damit eine Zeile in der Profildatei (`.pmh-build/harness-home/profiles/pmh/cordis.patch.yml`), kein Bauvorhaben.

### 4.4 Das Netzproblem

`docker-compose.yml` begründet die Netztrennung ausdrücklich: „`pmh-net` ist nur für diesen Stack. Der firecrawl-Stack hat sein eigenes (`firecrawl_backend`); die beiden können sich damit nicht versehentlich erreichen."

Ein Scrapling-Container auf `pmh-net` erreicht Firecrawl deshalb **nicht** ohne Zutun. Drei Wege: (a) Scrapling in den Firecrawl-Stapel stellen, (b) `firecrawl_backend` als `external: true` zusätzlich anhängen, (c) bewusst getrennt lassen — der Go-Dienst spricht beide an, sie müssen sich nicht sehen. **(c) ist die sauberste** und der bestehenden Begründung treu.

### 4.5 Das Zustandsproblem — hier wird es unangenehm

Scrapling legt `adaptive`-Daten in einer **SQLite-Datei** ab. Die Doku bietet an, das zu ersetzen: man erbt von `StorageSystemMixin` und schreibt `save`/`retrieve` selbst (das Redis-Beispiel in der Doku stammt ausdrücklich „generated by AI").

**Aber:** eine eigene Speicherklasse zu schreiben **ist Python-Code in deinem Projekt** — genau das, was die Projektregel verbietet. Damit bleiben nur zwei ehrliche Wege:

| Weg | Zustand liegt | Bewertung |
|---|---|---|
| **(a)** Volume einhängen, SQLite lassen | in einer Datei im Volume | einfach; aber der dauerhafte Zustand liegt **außerhalb PostgreSQL** — gegen die Doktrin „PostgreSQL ist dauerhaft, Redis beschleunigt nur" |
| **(b)** eigener `StorageSystemMixin` | in PostgreSQL | verletzt die Sprachregel (K1) |

> **Befund 4.** Variante A zwingt zu einem Kompromiss bei der **Zustandshoheit**, den Variante B nicht hat. Das ist das stärkste technische Argument für den Nachbau — stärker als die Sprachfrage.

---

## 5. Was vor jeder Entscheidung gemessen werden muss

Die Scrapling-Doku führt als Prachtexemplar ein Archiv-Duell vor: Selektor auf dem StackOverflow-Stand von 2010 speichern, auf der heutigen Seite wiederfinden, dann `element1.text == element2.text` prüfen. Der Vergleich geht auf.

**Der Versuchsaufbau ist richtig, die Auswertung ist zu schmal.** Er prüft **ein** Element und meldet nur den Treffer — nicht, wie oft es *falsch* trifft. Genau die zweite Zahl entscheidet, ob das Verfahren in eine Pipeline darf, in der Quellentreue zählt.

**Messplan:**

1. **Zielgröße:** 20–30 Seiten aus dem eigenen Recherchebedarf — idealerweise solche, bei denen ein Wayback-Snapshot mit **alter** Struktur vorliegt (der Trick der Doku, aber auf Breite statt auf ein Beispiel).
2. **Aufbau:** Selektor auf dem alten Stand speichern → gegen den neuen Stand relocaten.
3. **Zwei Zahlen erheben:**
   - **Trefferquote** — wie oft wird das richtige Element gefunden?
   - **Stille Fehltreffer** — wie oft wird ein Element gefunden, **dessen Text nicht dem erwarteten entspricht**? Das ist die gefährliche Zahl.
4. **Zusatzmessung, die nur der Nachbau liefert:** Auf welcher **Kaskadenstufe** (§3.4) kam der Treffer? Treffer auf Stufe 3 sind Frühwarnungen.
5. **Gegenprobe:** dieselben Seiten durch Firecrawl `:3002` als Markdown, Feldableitung durch das Modell. Verglichen werden **Korrektheit pro Token** und **Korrektheit pro Laufzeit** — nur so zeigt sich, ob `adaptive` wirklich billiger ist.

---

## 6. Offene Konflikte, die der Betreiber entscheiden muss

| # | Konflikt | Lage | Entscheidung nötig |
|---|---|---|---|
| **K1** | Python verboten | Scrapling ist Python. Präzedenz: K3 („nur über die Prozessgrenze") deckt den Container-/CLI-Weg | **Darf Scrapling als Prozess rein — und ausdrücklich *nicht* als Bibliothek?** |
| **K-NEU** | Zustandshoheit | Variante A legt den Zustand in eine SQLite-Datei außerhalb PostgreSQL (§4.5) | **Darf Extraktionszustand außerhalb PostgreSQL liegen?** |
| **K-SPR** | Sprachwahl § `MAPPING.md` | Zwei Dokumente widersprechen sich bei Go (§3.7) | **Welche Sprache trägt den Nachbau?** |
| **K-TOOL** | Werkzeug-Überlappung | In einer Sitzung sind bereits >40 Firecrawl-Werkzeuge geladen; Scrapling legt 13 überlappende daneben. Die Scrapling-Doku gibt selbst zu, dass Modelle ohne Ansage das falsche Werkzeug wählen und dabei Token verbrennen | **Sollen beide MCP-Server gleichzeitig am Agenten hängen — oder nur einer je Aufgabe?** |

---

## 7. Empfehlung in einem Satz

**Erst C, dann B, A nur als Abkürzung** — die Fähigkeitslücke ist Stealth, nicht Selektor-Wiederfindung; und wenn `adaptive` wirklich gewollt ist, ist der Nachbau mit **ausgewiesenem Score** (den das Original nicht hat) der einzige Weg, der Zustandshoheit, Sprachregel und Quellentreue gleichzeitig hält.

---

## 8. Belege und Abgrenzung

**Selbst gemessen auf diesem Host (14.10.2026):**

| Prüfung | Ergebnis |
|---|---|
| SearXNG `:8081` | HTTP **200**, 6.330 Bytes |
| Firecrawl `:3002` | HTTP **200** — `{"message":"Firecrawl API","documentation_url":"https://docs.firecrawl.dev"}` |
| OpenAI-kompatibel `:3001` | HTTP **200** |
| Scrapling-MCP-Vorgabeport `8000` | **frei** — kein Konflikt |
| `native/index/Cargo.toml` | genau eine Abhängigkeit (`serde_json`) → **kein** HTML-Parser vorhanden |

**Aus Dokumenten gelesen, nicht selbst gemessen:**

- Container-Namen, Images und Netze des Firecrawl-Stapels (`firecrawl`, Playwright, RabbitMQ, Redis, FoundationDB; Netz `firecrawl_backend`) stammen aus `docs/review/stack-aufklaerung.md`, `docs/protokoll/aufsicht/hilfen/vorhandene-bausteine.md` und `docker-compose.yml`. **`docker ps` wurde von der Dateisandbox verweigert** (`permission denied … npipe:////./pipe/dockerDesktopLinuxEngine`); ich habe die Container deshalb **nicht** selbst gesehen, und die Firecrawl-**Version** ist damit **unbekannt**.
- Alle Aussagen zu Scrapling stammen aus der Doku und dem Repository; **den Quelltext habe ich nicht gelesen** — die genauen Gewichte der Ähnlichkeitsbewertung sind deshalb **unbekannt** (§3.5).

**Nicht geprüft, ausdrücklich offen:**

- Ob `stealthy_fetch` gegen die real anvisierten Seiten tatsächlich durchkommt.
- Wie sich Scraplings Stealth-Browser mit dem bereits laufenden Playwright des Firecrawl-Stapels verträgt (Ressourcen, Ports, Speicher).
- Ob die BSD-3-Clause-Abhängigkeiten von Scrapling für die geplante Nutzung unproblematisch sind — die Lizenz des Projekts selbst ist es, seine Abhängigkeiten wurden **nicht** geprüft.

**Diese Recherche hat keine Datei der Codebasis verändert.**
