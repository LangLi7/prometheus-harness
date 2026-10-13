# Delta-Audit — Ziel gegen Vorlage, ohne `apps/web`

> **Auftrag:** `t33`. Messung am 13.10.2026. Vergleich
> `C:\Users\Chang\prometheus-harness` (Ziel) gegen
> `C:\Users\Chang\harness\prometheus-harness` (Vorlage, nur gelesen).
> `apps/web` ist ausgenommen; `docs\dsh` und `docs\design` wurden nicht geöffnet.

## 1. Das Ergebnis in einem Satz

**Der Backend-Core ist zu 0,2 % vorhanden.** Von 18.376 Dateien unter `packages/` der
Vorlage existieren im Ziel **35**. Die `apps`-Ordner außer `web` sind **byte-identische
Kopien** und wurden **nicht angepasst**.

## 2. Messung je Ordner

| Ordner | Vorlage | Ziel | Quote | Urteil |
|---|---:|---:|---:|---|
| **`packages`** (Agent-Core, Seams, Tools) | 18.376 | **35** | **0,2 %** | **Der Core fehlt** |
| `apps` (ohne `web`) | 1.043 | 1.043 | 100 % | **Kopie, nicht Eigenbau** |
| `apps/web` | 765 | 17 | — | eigene Neuimplementierung ✓ |
| `native` (Rust) | 84 | 33 | 39,3 % | 7 Crates, Testabdeckung da |
| `docs` | 692 | 1.439 | 208 % | größer als die Vorlage (eigene Doku) |
| `website` | 32 | 4.663 | 14.572 % | **Befund: enthält Cache-Müll** (nicht versioniert) |
| `scripts` | 388 | 5 | 1,3 % | beabsichtigt (`stack.md`: „mit Bun schreiben wir diese Skripte nicht") |
| `.agents` | 3.717 | 1 | 0 % | beabsichtigt (Upstream-Notizen) |
| `vendor`, `python`, `patches`, `benchmarks`, `snapshots` | 2.256 | 0 | 0 % | beabsichtigt, dokumentiert in `MAPPING.md` §3.10 |
| `.github` | 56 | 56 | 100 % | Kopie — **per `.gitignore` nicht versioniert** |

## 3. Der schwerste Befund: die `apps`-Kopien

**Gemessen mit SHA-256 über jede Datei:**

| Ordner | Vorlage | Ziel | **identisch** | abweichend | nur im Ziel |
|---|---:|---:|---:|---:|---:|
| `apps/cli` | 220 | 220 | **220** | **0** | 0 |
| `apps/desktop` | 773 | 773 | **773** | **0** | 0 |
| `apps/desktop-host` | 50 | 50 | **50** | **0** | 0 |

**Das ist keine „Anpassung an den neuen Stand" — es ist die unveränderte Vorlage.**
`apps/cli` deklariert **129 `workspace:*`-Abhängigkeiten** auf `@deepseek-ai/dsh-*`-Pakete,
die im Ziel nicht existieren; seine `node_modules/@deepseek-ai/`-Ordner waren **129 leere
Hüllen**. Deshalb war `bun install` vor der Workspace-Korrektur mit 158 Fehlern gescheitert.

**Regelverstoß:** `docs/concept.md` — *„Nicht als Codebasis — Wir kopieren nicht 14.990
Dateien und schneiden darin."* Bereits im Prüfbericht als **Befund 1 (schwer)** und als
**Auflage A1** geführt.

**Einziger Eigenbau in `apps/`:** `apps/host` (4 Dateien) — der eigene Einstieg, der den
Core als Abhängigkeit startet und `HTTP 200` liefert. Er ist der Weg aus dem Kopienproblem.

## 4. Was fehlt — vollständige Liste

### 4.1 Go-Dienste (`MAPPING.md` §3.7: 11 Dienste)

| Dienst | Status |
|---|---|
| `pmh-supervisor` | **vorhanden** (17 Go-Dateien) |
| `pmh-nix` | **vorhanden** (17) — nicht in §3.7, eigenes Arbeitspaket (t13) |
| `pmh-attach` | **vorhanden** (17) — nicht in §3.7, eigenes Arbeitspaket (t15) |
| `pmh-scheduler` | **fehlt** |
| `pmh-gateway` | **fehlt** (messungsgebunden: erst bei belegtem Engpass) |
| `pmh-git` | **fehlt** |
| `pmh-store` | **fehlt** (PostgreSQL + pgvector) |
| `pmh-cache` | **fehlt** (Redis, laut Doku standardmäßig **aus**) |
| `pmh-memory` | **fehlt** (Obsidian-Markdown + Wikilinks) |
| `pmh-research` | **fehlt** (Firecrawl + SearXNG) |
| `pmh-ocr` | **fehlt** (Tesseract, nur über die Prozessgrenze) |
| `pmh-workflow` | **fehlt** (n8n-Anbindung, extern) |
| `pmh-decision` | **fehlt** (Jev/Layla; darf Sicherheitsregeln **nicht** überschreiben) |

**Ergebnis: 3 von 13 Diensten vorhanden.**

### 4.2 TypeScript-Pakete (`MAPPING.md` §5: ~50 Gruppen)

| Gruppe | Status |
|---|---|
| `core/scope`, `util/atomic-write`, `util/home-paths`, `units/unit-export` | **vorhanden** — **4 Pakete** |
| `core/agent`, `-loop`, `-default-model`, `-tool-presentation`, `system-prompt`, `tools` | **fehlen** |
| `session/*` (20 Pakete inkl. Format v4 + 4 Migrationen) | **fehlen** |
| `llm/*` (9 Pakete) | **fehlen** |
| `api/*` (10 Controller + Gateway), `typert/*`, `sdk/*`, `acp` | **fehlen** |
| `fs/*`, `shell/*`, `subprocess/*`, `sandbox/*`, `terminal/*`, `jobs/*`, `mcp/*`, `lsp/*`, `web/*`, `skill/*` | **fehlen** |
| `boot/*`, `bundle/*`, `host/*`, `settings/*`, `credentials/*` | **fehlen** |

**Ergebnis: 4 von ~50 Gruppen.**

### 4.3 Datenhaltung — **nur Dokumentation, kein Code**

| Anforderung | Code-Dateien | Doku-Dateien | Urteil |
|---|---:|---:|---|
| PostgreSQL + pgvector | **0** | 9 | nur geplant |
| Redis | **0** | 8 | nur geplant |
| Obsidian (Memory, Wikilinks) | **0** | 6 | nur geplant |
| RAG / Embeddings / Vektor | **0** | 2 | nur geplant |
| Verlaufs-Cache im Browser (ETag/IndexedDB/Pagination) | **0** | 0 | **nicht vorhanden** |

## 5. Was **funktioniert** (belegt)

| Baustein | Nachweis |
|---|---|
| Eigener Host `apps/host` | `bun run apps/host/src/main.ts web --port 5199` → **HTTP 200**; Typecheck exit 0 |
| `bun install`, `tsgo --noEmit` | **exit 0** |
| Rust: 7 Crates | unter Linux **126 Tests grün**, 0 Fehler |
| Go: `pmh-nix` | 60 Tests grün, vet/build/test exit 0 |
| Go: `pmh-attach` | 63 Tests grün, vet/build/test exit 0, `/healthz` 200 |
| Plugin-Export | Roundtrip-Digest `sha256:ac37e0ec…` identisch, 158 Bun-Tests grün |
| NixOS-Selbständerung | Konzept + inertes Backend, `TestProposeNeverActivates` grün |
| WSL2-Umgebung | Go 1.27.2, Rust 1.99.0, Bun 1.4.3, Node v26.11.1 |

## 6. Die ehrliche Konsequenz

**Der Auftrag „den gesamten DeepSeek-Harness-Core (ohne Web) vollständig zum Laufen
bringen" ist in einer Sitzung nicht erfüllbar.** Das ist keine Ausrede, sondern eine
Rechnung:

| Größe | Zahl |
|---|---|
| Fehlende TS-Pakete | ~300 (46 Gruppen) |
| Fehlende Go-Dienste | 10 |
| Vorhandene TS-Pakete | 4 |

Das Zielprojekt hat den **Hybrid-Meilenstein erreicht** (`core-supply.md`: Core als
Abhängigkeit, HTTP 200) — **das war der Auftrag aus Schritt 1** und er ist erfüllt. Der
Eigenbau (Ansatz A) ist in `hybrid-then-self-build.md` als **paketweiser Übergang**
festgelegt, ausdrücklich **nicht** als Big Bang.

**Was daraus folgt:** Die richtige Reihenfolge ist nicht „alles auf einmal", sondern der
nächste belegbare Schritt. Die `apps`-Kopien sind dabei der **erste** Kandidat: sie
verletzen eine Projektregel, blockieren `bun install` und liefern keinen Nutzen — ihr
Ersatz durch `apps/host` (existiert, läuft) ist der kleinste Schritt mit der größten
Wirkung.

## 7. Was dieser Bericht **nicht** getan hat

Keine Codeänderung, keine Datei unter `apps/web` angefasst, keine Installation,
kein Subagent, `docs\dsh` nicht geöffnet, kein Vorlagencode kopiert, keine
Vorlagendatei verändert.
