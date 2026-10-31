# Ziel-Liste — Ist-Stand und Plan

> **Anlass.** Der Betreiber hat am 15.10.2026 die Technikliste erneut vorgelegt, diesmal mit zwei
> Fragen: *„was ist schon in Prometheus implementiert"* und *„kannst du eine Liste erstellen,
> unterteilt als Plan"*. Dieselbe Liste lag schon einmal vor und wurde in
> [arbeitspakete.md](arbeitspakete.md) Abschnitt **R** abgeglichen — mit den Klassen
> **A** (belegt) · **B** (geplant) · **C** (neu) · **D** (Konflikt, Entscheidung nötig).
>
> **Verhältnis zu §R: keine zweite Wahrheit.** Dieses Dokument **verweist** auf §R und zieht den
> Stand nach; es schreibt §R nicht ab. Wo beide auseinandergehen, steht das in §7 namentlich.
> Verbindlich für Arbeitspakete bleibt `arbeitspakete.md`.

**In einem Satz:** Von der Liste ist die **Basis** fertig (Bun + Go + TS 7, Rust statt Python,
PostgreSQL + pgvector, Auth, NixOS-Konzept, Unit-Export) und die **Oberfläche** weiter, als §R
annimmt (`apps/universe`: Docking, Tiefen-Zoom, 5D-Rotation, Zeichnung) — offen sind die
**Dienste** (10 von 13), der **Wissensspeicher** oberhalb des Schemas und die **Netz-/Umgebungsfragen**.

---

## 1. Was sich seit §R geändert hat (13.10. → 15.10.2026)

Drei Dinge, die §R noch als „außen vor" oder „offen" führt und die inzwischen **entschieden und
ausgeführt** sind:

| Datum | Vorgang | Beleg |
|---|---|---|
| 15.10.2026 | **Ein Port, eine Website** — die Welt wird nicht auf eigenem Port ausgeliefert, sondern über den Pfad `/universe/` derselben Herkunft | [decisions/ein-port-eine-website.md](../decisions/ein-port-eine-website.md), [welt-ein-port.md](welt-ein-port.md) |
| 15.10.2026 | **Umzug des Welt-Prototyps** `snapshots/web` → `apps/universe`, 143 Dateien mit SHA-256 verglichen, alter Ort gelöscht | [welt-ein-port.md](welt-ein-port.md) |
| 15.10.2026 | **Der Umschalter Chat ↔ Welt** an der Marke oben links, mit Ankunftswunsch im `localStorage` | [umschalter-marke.md](umschalter-marke.md) |

**Folge für §R:** Der Punkt *„Obsidian-Docking als UX/GUI/UI-Konzept — Klasse **D**, GUI bleibt
außen vor"* und der Konflikt **K4** beschreiben einen Stand, den es so nicht mehr gibt. Die
Oberfläche ist gebaut worden, und zwar im Repo (nicht in einem Nebenordner).

---

## 2. Liste A — was belegt und im Code ist

**Methode der Zahlen in §3:** `Get-ChildItem -Recurse` über den Arbeitsbaum ohne `node_modules`,
`dist`, `target`, `.git` am 15.10.2026. Alles andere ist aus dem genannten Dokument **zitiert**,
nicht neu gemessen; das ist in der Spalte „Beleg" kenntlich.

| Baustein der Zielliste | Stand | Beleg |
|---|---|---|
| **DeepSeek Harness als Basis** | erfüllt — Core als **Abhängigkeit**, nicht geforkt | `node_modules/@deepseek-ai/` mit **265** Einträgen; [decisions/core-supply.md](../decisions/core-supply.md) |
| **Bun + Go + TS 7** | erfüllt | `package.json` (Bun-Workspaces), `bunfig.toml`, `@typescript/native-preview` 7 (`tsgo`) |
| **Rust statt Python** | erfüllt — 7 Crates | `native/atomicfs`, `native/crypto`, `native/flock`, `native/index`, `native/landlock-run`, `native/pty`, `services/pmh-sandbox` |
| **Go-Dienste** | **3 von 13** | `services/pmh-supervisor`, `services/pmh-nix`, `services/pmh-attach` — je mit `unit.json` und Tests |
| **PostgreSQL 17 + pgvector** | erfüllt (Schema **und** Code) | `docker-compose.yml` (postgres, redis, pgadmin); Migrationen bis Fassung 7; `packages/auth/store-postgres` mit `documents`, `chunks`, `vector(768)`, HNSW |
| **Redis** | nur Sonde, kein Client | `packages/api/readiness` — `PING` über eigenen Socket; `pmh-cache` fehlt **bewusst** |
| **Obsidian** | **nur Schema** | `packages/auth/db-schema/migrations/0007_obsidian.sql`; [obsidian-schema.md](obsidian-schema.md) |
| **RAG** | halb: Zerleger + Vektorsuche ja, Einbettungen nein | `packages/auth/store-postgres/src/chunker.ts`, Vektorabfrage `<=>` in `index.ts` |
| **Docking (UX/GUI/UI)** | gebaut | `apps/universe/src/docking.ts` (Andockstellen links/rechts/unten/Insel), `dock-view.ts`, Persistenz je Raum |
| **Zeichnung / Zoom** | gebaut | `apps/universe/src/camera.ts` (logarithmischer Zoom, Bezugsebenen), `canvas-objects.ts` + `canvas-view.ts` (Zeichenfläche), `bodies.ts` (SVG-Zeichnung je Körper) |
| **4D/5D-Rotation** | gebaut | `apps/universe/src/rotation.ts` — SO(n), Givens-Rotation, Bivektor; 5D = **zehn** Drehflächen |
| **Welt im Harness** | gebaut, ein Port | `packages/web/world-static` (`/universe/`), `packages/client/world-switch`, `scripts/world-path.mjs` |
| **NixOS-Selbständerung** | Konzept + **inertes** Backend | `services/pmh-nix` (`Detect/Propose/Check/Apply/Generations/Rollback`, Attrappe ohne Systemwirkung, `nix`-Backend fail-closed); [design/nixos-self-change.md](../design/nixos-self-change.md) |
| **Plugin-/Unit-Export** | erfüllt | `packages/units/unit-export`; [plugin-export-nachweis.md](plugin-export-nachweis.md) (Digest-Rundlauf identisch) |
| **Auth / Geheimnisse** | erfüllt | `packages/auth/{claim,auth,apikey,reset,permissions,secrets}`; [erstlogin-und-rechte.md](erstlogin-und-rechte.md), [geheimnisse.md](geheimnisse.md) |
| **Eigene Endpunkte** | erfüllt, klein | `packages/api/health`, `packages/api/readiness`, `packages/api/auth-http`; [beleg-eigener-endpunkt.md](beleg-eigener-endpunkt.md) |
| **Echtes Modell antwortet** | belegt | [api-nachweis.md](api-nachweis.md) — über die **Kern-API**, nicht über unsere Oberfläche |
| **Verdichtung** | auf Anforderung belegt, Selbstauslösung **unbelegt** | [verdichtung-nachweis.md](verdichtung-nachweis.md), [plugin-inventur.md](plugin-inventur.md) |
| **Compaction, Skills, Workflow, MCP, Sandbox** | laufen aus dem **Kern**, nicht aus Eigenbau | `dsh-compaction-basic`, `dsh-skill`, `dsh-workflow`, `dsh-sandbox*`, `dsh-session-persistence` in `node_modules/@deepseek-ai/` |

### 2.1 Läuft auf der Maschine — aber **nicht** im Repository

Das ist der Teil, der in der Frage *„firecrawl SearXNG und Browserimplementierung fehlt"* steckt:
**angeschlossen ja, gebaut nein.**

| Baustein | Zustand | Beleg |
|---|---|---|
| **SearXNG** | Container läuft, `http://127.0.0.1:8081/` → **200** | [protokoll/aufsicht/hilfen/vorhandene-bausteine.md](../protokoll/aufsicht/hilfen/vorhandene-bausteine.md) |
| **Firecrawl** | Container läuft, `http://127.0.0.1:3002/` → **200**, samt playwright/rabbitmq/redis/foundationdb | ebd. |
| **Firecrawl als MCP-Werkzeug** | in der laufenden Sitzung **geladen** (Werkzeuge vorhanden) | eigene Sitzung, 15.10.2026 |
| **Browser** | als MCP-Werkzeug (chrome-devtools) **geladen**; **kein** eigenes Unit | eigene Sitzung, 15.10.2026; `packages/browser-use/browser-use` ist ein **leerer** Ordner |
| **WSL2** | läuft (Ubuntu), Docker-Integration für Ubuntu **nicht** aktiviert | [wsl2-linux-nachweis.md](wsl2-linux-nachweis.md) |
| **Cloudflared** | Dienst läuft auf dem Wirt, fünf Einträge | [tunnel-und-oeffentlichkeit.md](tunnel-und-oeffentlichkeit.md) |

**Der Unterschied, auf den es ankommt:** ein geladenes MCP-Werkzeug ist **kein** Unit. Es ist
Konfiguration der laufenden Harness. Fällt die Sitzung, ist es weg — der Dienst ist dann nicht
gebaut, sondern nur benutzt.

---

## 3. Zahlen, selbst gezählt (15.10.2026)

| Größe | Zahl | Wie gezählt |
|---|---:|---|
| Paketordner unter `packages/` (`packages/*/*`) | **362** | `Get-ChildItem packages -Directory` → je Gruppe die Unterordner |
| davon **mit** Dateien | **40** | Dateien ohne `node_modules` je Paketordner |
| davon **leer** | **322** | Rest |
| Dateien unter `packages/` (ohne `node_modules`) | **245** | rekursiv, gefiltert |
| Ordner unter `packages/client/` | **66** | rekursiv eine Ebene |
| davon mit Dateien | **4** (`locale`, `select-contrast`, `source-folders`, `world-switch`) | — |
| Dateien unter `apps/web/src` | **8** | bestätigt die Zeile im README (geprüft, **kein** Widerspruch) |
| Dateien unter `apps/web` gesamt (ohne `node_modules`, `dist`) | **17** | die größere Zahl ist **nicht** die Zahl aus dem README |
| Dateien unter `apps/universe/src` | **30** | direkt in `src` |
| Testdateien unter `apps/universe/tests` | **24** | `*.test.ts` |
| Kernpakete `@deepseek-ai/*` | **265** | eine Ebene |

**Gedeutet, nicht gemessen:** dass 322 leere Paketordner **Absicht** sind (Steckplätze für geplante
Units), steht so in `MAPPING.md` und ist plausibel — **nachgeprüft habe ich es nicht**. Ein leerer
Ordner könnte ebenso gut ein vergessener sein.

---

## 4. Liste B — der Plan in acht Phasen

**Hausregel für jede Zeile:** der *kleinste belegbare Schritt* steht dabei. Ein Schritt ohne Befehl
und Ergebnis gilt als nicht getan (Regel A3 aus `arbeitspakete.md`).

### Phase 0 · Nachweise schließen — *vor* allem anderen

| # | Auftrag | Klasse | Kleinster belegbarer Schritt |
|---|---|---|---|
| 0.1 | `roadmap.md` sagt *„Noch kein eigener Code"* — das ist falsch | A | Datei auf den Stand bringen; Beleg: laufender Host, **1189 pass · 87 skip · 0 fail** ([ci-nachweis.md](ci-nachweis.md)) |
| 0.2 | §R/K4 *„GUI bleibt außen vor"* ist durch `apps/universe` überholt | A | §R nachziehen, K4 als erledigt kennzeichnen |
| 0.3 | Zehn Datenbankprüfungen scheitern an Migration 6 (`type "vector" does not exist`), Prüfungen laufen gegen die **Betriebs**datenbank | A | `PMH_TEST_DATABASE_URL` auf `pmh_test`, Lauf wiederholen ([grenzen-und-offenes.md](grenzen-und-offenes.md)) |
| 0.4 | Widerspruch bei `pmh-nix` selbst: P1 nennt **45** PASS, §R nennt **60** Prüfungen | A | einen der beiden Läufe wiederholen und die Zahl festhalten |
| 0.5 | Geheimnis-Haken prüft nichts, `gitleaks` fehlt | A | Werkzeug installieren **oder** den Haken als „nicht prüfend" sichtbar lassen ([leck-haken.md](leck-haken.md)) |

### Phase 1 · Welt: Chunks, Index, unbegrenzter Zoom

| # | Auftrag | Klasse | Kleinster belegbarer Schritt |
|---|---|---|---|
| 1.1 | Positionen in `double` rechnen, der GPU nur **kameranahe** Werte geben, je Zoomstufe ein eigenes Bezugssystem | B | §2.3/§2.4 aus [design/3d-zoom-konzept.md](../design/3d-zoom-konzept.md) in `camera.ts` umsetzen; Gegenprobe: dieselbe Messreihe wie in [newdawn0-recherche.md](newdawn0-recherche.md) §4 |
| 1.2 | **Kachel-Kennung** aus der Koordinate (Ganzzahldivision → Hash) als O(1)-Schlüssel | C | ein reines Rechenmodul mit Prüfung: gleiche Koordinate → gleiche Kennung, Nachbarn → benachbarte Kennungen |
| 1.3 | Laden und Zeichnen je Kachel — **nicht** O(1) | C | eine Kachel messen: Zeit zum Aufbau, Zahl der Zeichenaufrufe |
| 1.4 | Rotation (5D ist gebaut) an die Kachelebenen koppeln | C | eine Prüfung, die für zwei Drehflächen dieselbe Kachelmenge erwartet |
| 1.5 | Bildrate bei tiefem Zoom | C | eine Zahl statt einer Erwartung — heute gibt es nur **Rechenwerte**, keine Bildrate |

### Phase 2 · Oberfläche: Docking als Unit, Shell, Editor

| # | Auftrag | Klasse | Kleinster belegbarer Schritt |
|---|---|---|---|
| 2.1 | Docking und Zeichenfläche aus `apps/universe/src` nach `packages/client/ui-dockkit` heben (**Ordner ist leer**) | C | ein Paket, das `docking.ts` unverändert lädt und dessen **vorhandene** Prüfungen mitfährt |
| 2.2 | Chat **und** Dateibaum in der eigenen Oberfläche | B | eine Ansicht, die eine Datei öffnet — der Dateibaum kommt heute aus dem Kern, nicht von uns |
| 2.3 | VSC-artige Projekt-/Stack-Ansicht | D | Entscheidung: eigenes Unit oder Editor-Integration (2.4) |
| 2.4 | code-server / OpenVSCode Server / Theia als **Dienst** starten (nicht einbauen) | C | ein `unit.json`, das den gewählten Dienst startet; Lizenz vorher prüfen |

### Phase 3 · Wissen und Gedächtnis

| # | Auftrag | Klasse | Kleinster belegbarer Schritt |
|---|---|---|---|
| 3.1 | Einbettungen + Dateiwächter + Indexer | B | **eine** Datei wird zerlegt, eingebettet, gefunden — Ende zu Ende |
| 3.2 | `pmh-memory` (Obsidian-Markdown + Wikilinks) | B/D | hängt an der offenen Frage, **wer** welchen Vault-Pfad bekommt ([obsidian-gedaechtnis-oder-ansicht.md](../decisions/obsidian-gedaechtnis-oder-ansicht.md)) |
| 3.3 | Graph View | C | eine Ansicht über `links` aus Migration 0007 |
| 3.4 | Verschlüsselung des Wissensspeichers **verdrahten** (Krypto ist fertig) | B | die Entscheidung aus [schluessel-je-stueck-oder-je-benutzer.md](../decisions/schluessel-je-stueck-oder-je-benutzer.md) ist **Betriebs**entscheidung |

### Phase 4 · Recherche-Stack

| # | Auftrag | Klasse | Kleinster belegbarer Schritt |
|---|---|---|---|
| 4.1 | `pmh-research` (Firecrawl + SearXNG) — beide **laufen schon** | B | eine Suchanfrage → Trefferliste → Extraktion, als ein Dienst |
| 4.2 | Browser als Unit: lokal **oder** MCP | C | eine Seite laden und auslesen über **einen** Weg, nicht zwei |
| 4.3 | `pmh-ocr` (Tesseract) — **nur** über die Prozessgrenze (K3) | B | ein Bild → Text, mit dem Hinweis, daß Layout nicht erkannt wird |
| 4.4 | **Mirage-Tesseract präzisieren** (K5) | D | es ist laut Recherche ein anderes Produkt (Creative Engine für Video/Motion/Audio), **nicht** OCR |

### Phase 5 · Orchestrierung und Entscheidungsmodell

| # | Auftrag | Klasse | Kleinster belegbarer Schritt |
|---|---|---|---|
| 5.1 | Graph-Workflow, Checkpoints, Wiederaufnahme, Human-in-the-loop — **Konzepte**, nicht die Bibliothek | B | siehe §6: die Seams sind im Kern **vorhanden** |
| 5.2 | `pmh-decision` (Jev / Layla) | B/D | harte Regel: darf Sicherheitsregeln **nicht** überschreiben — im Typensystem unmöglich machen, nicht nur dokumentieren |
| 5.3 | n8n nur als **externen** Dienst anbinden (K2) | D | Entscheidung zuerst |

### Phase 6 · Dienste und Plattform

| # | Auftrag | Klasse | Kleinster belegbarer Schritt |
|---|---|---|---|
| 6.1 | `pmh-scheduler` | B | ein Zeitplan, der eine Sitzung fortsetzt |
| 6.2 | `pmh-store`, `pmh-cache` | B | `pmh-cache` bleibt **standardmäßig aus**, bis Last es zeigt |
| 6.3 | `pmh-gateway` | B | **messungsgebunden** — erst bei belegtem Engpass |
| 6.4 | `pmh-git` — **Plattform wählen:** Forgejo, Gitea oder GitLab CE | D | Entscheidung; danach ein Unit, das ein Repository anlegt und liest |

### Phase 7 · System, Netz, Umgebung

| # | Auftrag | Klasse | Kleinster belegbarer Schritt |
|---|---|---|---|
| 7.1 | `pmh-nix` ist fertig — aber **inert**; NixOS wird **nicht** installiert | A | nichts zu tun; die Grenze steht in [design/nixos-self-change.md](../design/nixos-self-change.md) |
| 7.2 | **Netz entscheiden:** Tailscale, WireGuard oder Cloudflared | D | Entscheidung; heute läuft ein Cloudflared-Tunnel auf dem Wirt |
| 7.3 | WSL2/Docker/Podman **prüfen und bei Bedarf installieren** (R, Klasse C) | C | ein Unit, das **nur prüft** und den Installationsbefehl **nennt** — Installieren ist ein eigener Schritt |
| 7.4 | Docker-WSL-Integration für Ubuntu aktivieren (offener Punkt L14) | C | `/var/run/docker.sock` im WSL ist vorhanden |

### Phase 8 · Skills und Modell-Automation

| # | Auftrag | Klasse | Kleinster belegbarer Schritt |
|---|---|---|---|
| 8.1 | Researcher-Skill | C | ein Skill ohne Host-Code (`concept.md`: die billigste Form eines Units) |
| 8.2 | Fine-Tune-Skill (isolierte Trainingsjobs, Auswertung, Rückweg) | C | im Repo existiert dazu **nichts** — zuerst ein Auftrag, dann Code |
| 8.3 | DeepSeek als **Plugin und Skill** exportierbar | C | baut auf dem belegten `unit-export` auf |
| 8.4 | Self-Improve-Schleife | C | Skill `self-improve` ist als Anleitung vorhanden |

---

## 5. Zoom, Chunk und Tensor — was die neue Nachricht hinzufügt

Die Nachricht bringt **nichts Neues**, was nicht schon geprüft wäre — sie formuliert es nur
konkreter. Die beiden Dokumente, die das entscheiden:

- [newdawn0-recherche.md](newdawn0-recherche.md) — acht Behauptungen einzeln eingestuft, plus die
  **gemessene** float32-Grenze.
- [design/3d-zoom-konzept.md](../design/3d-zoom-konzept.md) — die verbindliche
  Koordinatensystem-Konvention und §8 mit den Entscheidungen zum gebauten Prototyp.

**Der Stand in vier Sätzen:**

1. **„Koordinate → Chunk-Kennung ist O(1)"** — belegt als Rechnung; **Laden und Zeichnen** eines
   Chunks sind es **nicht**.
2. **„Tensor → numerischer Hash-Index"** — belegt als Verfahren (räumliches Hashing), nicht als
   Neuheit.
3. **„Ein Vektor ist ein 0;1-Tensor"** — Richtung richtig, Schreibweise falsch: ein Vektor ist
   **(1,0)**, eine Linearform (0,1).
4. **„Funktioniert im Browser sehr gut"** — **unbelegt**; darum gibt es die float32-Rechnung. In
   einer festen Einheit endet der Zoom bei rund **8,4 · 10⁶**; „unendlich" wird es erst, wenn jede
   Zoomstufe **ihr eigenes Bezugssystem** bekommt.

**Was im Code dazu schon existiert:** 5D-Rotation (`rotation.ts`), Zoom als Faktor je Rastschritt
(1,08 — `tools/zoom-rate.js`), Bezugsebenenwechsel per Klick, Docking mit echten Andockstellen,
gezeichnete Körper. **Was fehlt:** Chunk-Welt, Hash-Index, LOD-Streaming, unbegrenzter Zoom — die
Punkte 1.1 bis 1.5 in Phase 1.

**Und die Zuordnung zu NewDawn0 bleibt wie in §R:** dort gibt es dazu **nichts** (70 Repos geprüft,
Profilsuche `q=zoom` → 0 Treffer). Sein Beitrag bleibt der **NixOS-Ansatz**.

---

## 6. Nachtrag zu K1 — LangGraph: „eigentlich not so deep"

> **Der Betreiber, 15.10.2026:** *„K1 LangChain/LangGraph könnte man ja als Basis nutzen und es als
> Rust/Go implementieren — eigentlich also not so deep."*

**Hier ist der Betreiber im Kern richtig, und das ist nachprüfbar.** K1 steht in §R als *„Konflikt:
Python-verankert, nicht übernehmen"*. Das gilt für die **Bibliothek**. Für die **Verfahren** gilt
es nicht — und die Verfahren sind bereits **im Kern vorhanden**, als typisierte Seams:

| LangGraph-Verfahren | Was es leistet | Wo es im Kern schon sitzt (Zitat der Paketbeschreibung) |
|---|---|---|
| Checkpointer | Zustand je Schritt dauerhaft, Wiederaufnahme | `dsh-session-persistence` — *„Abstract durable session persistence seam (ctx.sessionPersistence)"* · `dsh-session-checkpoint-policy` — *„Semantic session durability checkpoints before model requests and tool side effects"* |
| Graph / Zustandsmaschine | Knoten, Kanten, Übergänge | `dsh-workflow` — *„Workflow capability seam: ctx.workflowEngine service, run vocabulary, and workflow/\* events"* |
| Interrupt / Human-in-the-loop | anhalten, fragen, fortsetzen | `dsh-user-approval` (*„one-shot permission decisions … fail-closed by default"*), `dsh-user-questions`, `dsh-tool-ask-user`, `dsh-permission-presets` |
| Hintergrundläufe, Zeitpläne | Jobs, Wiederholung, Zustellung | `dsh-jobs`, `dsh-schedule` (*„Host-wide durable reminders"*), `dsh-goal` (*„Event-sourced same-session goal state"*) |
| Ereignisstrom / Fortschritt | Teilereignisse nach außen | `workflow/*`-Ereignisse, Sitzungsereignisse (JSONL) |

**Was wirklich fehlt, ist kleiner als ein Konflikt:** die **deklarative Grammatik** (ein Graph als
*Daten*), die Superstep-Semantik (Fan-out/Fan-in) und der Zeitsprung über beliebige Schritte.
Das ist ein Modul, kein Framework.

**Wo Rust/Go hingehört — und wo nicht.** Die Hausregel lautet: *„Der JS-Core bleibt der Kernel.
Jede andere Sprache ist ein Dienst, den er aufruft"* ([project-profile.md](../project-profile.md) §2).
Der Grund ist technisch, nicht Geschmack: **Units sind Cordis-Plugins und damit JavaScript.** Ein
Orchestrator in Go kann nicht als Unit geladen werden — er wäre ein fremder Dienst **neben** dem
Agent-Loop, und genau das ist der zweite Loop, den K2 bei n8n verbietet. Dazu kommt der belegte
Preis der Prozessgrenze ([sprachwahl-entscheidung-2026.md](../research/sprachwahl-entscheidung-2026.md):
GitLab genügten **20 fork/exec pro Sekunde**, um einen Dienst um **30×** zu verlangsamen).

**Vorschlag zur Entscheidung — drei Wege, einer empfohlen:**

| Weg | Was er bedeutet | Urteil |
|---|---|---|
| **(a) Verfahren über die vorhandenen Seams, Engine bleibt TS** | Graph als Daten über `ctx.workflowEngine`, Zustand über die vorhandenen Checkpoints; Go/Rust nur als **Ausführer** (`pmh-scheduler`, Phase 6.1) | **empfohlen** — kein zweiter Loop, kein Sprachbruch, der Kern trägt es schon |
| **(b) Engine ganz in Go/Rust** | eigener Orchestrator als Dienst | **Regeländerung** nötig (JS-Core ist Kernel); Folge: zwei Loops, Unit-System nicht mehr anwendbar |
| **(c) Python-Ausnahme, Bibliothek direkt** | LangGraph unverändert nutzen | widerspricht der Sprachregel **und** der Prozessgrenzen-Regel zugleich |

**Was daraus für K1 folgt:** K1 kann von **D (Konflikt)** auf **entschieden** herabgestuft werden —
aber nur, wenn Weg (a) gewählt wird. Die Entscheidung ist nicht meine; sie ändert eine Grundregel
des Projekts, sobald (b) oder (c) gewählt wird. **Ich habe nichts umgestellt.**

---

## 7. Abweichungen: Doku gegen Code (namentlich)

| # | Stelle | Befund |
|---|---|---|
| 1 | `docs/roadmap.md` | *„Noch kein eigener Code"* — es gibt einen laufenden Host und eine grüne Suite. Die Datei ist überholt |
| 2 | `docs/status/arbeitspakete.md` §R, Zeile *„Obsidian-Docking … D"* und Konflikt **K4** | *„GUI/UI bleibt außen vor, `apps/web` unverändert"* — die Oberfläche wurde am 15.10. gebaut und ausgeliefert ([welt-ein-port.md](welt-ein-port.md)) |
| 3 | `docs/project-profile.md` §2, Zeile *„Laufzeit offen bis zur Bun-Messung"* | Bun ist gesetzt (`package.json`, `bunfig.toml`, README) |
| 4 | `docs/project-profile.md` §3 nennt *„Jev / **Laya**"* | Im Code und in den Anbieterlisten steht `typesafe/jev-router`; ein Entscheidungsdienst existiert **nicht**. Namensform zu klären |
| 5 | `docs/status/grenzen-und-offenes.md`, *„8 Dateien"* | **bestätigt** — `apps/web/src` hat genau 8 Dateien. Die 17 ist die Zahl für ganz `apps/web`; mein erster Verdacht auf einen Widerspruch war **falsch** |
| 6 | `docs/INDEX.md`, Kopf *„Stand 12.10.2026 · 17 Arbeitsdokumente"* | Die Zahl ist alt und die „Lücke im Register" (7 Dateien) ist darunter **selbst** dokumentiert. Beides bleibt stehen, bis jemand zählt — geraten wird nicht |

---

## 8. Was diese Datei **nicht** getan hat

- **Keine Codeänderung.** Kein Paket, kein Dienst, keine Migration, kein `apps/web` angefaßt.
- **Keine Installation.** Kein Nix, kein Docker, kein Podman, kein n8n, kein Tesseract, kein gitleaks.
- **Keine Messung, die nicht dasteht.** Neue Zahlen sind in §3 mit der Zählweise genannt; alles
  andere ist aus dem verlinkten Dokument **zitiert** und als Zitat erkennbar.
- **Keine Entscheidung.** Die Punkte mit Klasse **D** (Git-Plattform, Netz, Obsidian-Rolle,
  Mirage, K1-Weg, Projekt-Stack-Ansicht) sind **vorgelegt**, nicht getroffen.
- **Keine zweite Wahrheit.** Verbindlich bleibt `arbeitspakete.md` §R; diese Datei zieht den Stand
  nach und benennt die Abweichungen.

---

## 9. Quellen

- [arbeitspakete.md](arbeitspakete.md) — Abschnitt **R** (die Liste mit Klassen A/B/C/D), Phasen und Hausregeln
- [newdawn0-recherche.md](newdawn0-recherche.md) — Behauptungsprüfung, float32-Grenze
- [design/3d-zoom-konzept.md](../design/3d-zoom-konzept.md) — Koordinaten-Konvention, §8 Prototyp
- [welt-ein-port.md](welt-ein-port.md), [umschalter-marke.md](umschalter-marke.md), [decisions/ein-port-eine-website.md](../decisions/ein-port-eine-website.md)
- [grenzen-und-offenes.md](grenzen-und-offenes.md), [ci-nachweis.md](ci-nachweis.md), [delta-non-web.md](delta-non-web.md)
- [project-profile.md](../project-profile.md), [vision.md](../vision.md), [decisions/open-questions.md](../decisions/open-questions.md)
- [protokoll/aufsicht/hilfen/vorhandene-bausteine.md](../protokoll/aufsicht/hilfen/vorhandene-bausteine.md) — was auf der Maschine schon läuft
