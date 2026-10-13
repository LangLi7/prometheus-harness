# Der Harness-Stack — aufgeklärt

> **Gemessen:** 13.10.2026, aus `git ls-files`, `node_modules`, Docker und den
> Paketmanifesten. Keine Schätzung. Ergänzt [`rust-bestand.md`](rust-bestand.md)
> und [`api-flaeche.md`](api-flaeche.md).
>
> **Die Frage:** *„den Harness-Stack aufgeklärt — was ist dort, welche
> Code-Sprache, Database etc. wird genutzt?"*

## 1. In einem Satz

**Der Harness besteht aus drei Teilen, die nichts voneinander wissen:** ein
fremder Core (245 TypeScript-Pakete der Vorlage, **läuft**, aber seine API ist
ausgefallen), unser eigener TypeScript-Kern (14 Pakete, **getestet**, aber **nicht
verdrahtet**) und drei Sprachflächen daneben (Go, Rust, PowerShell), von denen Go
teilweise läuft und Rust **gar nicht**.

## 2. Die Schichten, mit Zahlen

```
┌────────────────────────────────────────────────────────────────────────────┐
│  SCHICHT 4 — DIENSTE            Go 14.625 Z. · Rust 6.569 Z. · 4 Ordner    │
│  pmh-attach (5.670) · pmh-nix (5.583) · pmh-supervisor (3.372)             │
│  pmh-sandbox (Rust) — Go-Zähler: 0 Dateien                                 │
│  gestartet von start.mjs: pmh-attach, pmh-nix        ← supervisor NICHT    │
├────────────────────────────────────────────────────────────────────────────┤
│  SCHICHT 3 — UNSER KERN         TypeScript  17.733 Zeilen, 14 Pakete       │
│  llm · llm-deepseek · llm-retry · token-meter · agent-tools · agent-loop   │
│  session-format · session-persistence-jsonl · auth · db-schema             │
│  unit-export · atomic-write · home-paths · scope                           │
│  Zustand: 262 + 108 Tests grün, 15 Typechecks exit 0 — ABER NICHT VERDRAHTET│
├────────────────────────────────────────────────────────────────────────────┤
│  SCHICHT 2 — DER HOST           TypeScript  apps/cli, 437 Zeilen           │
│  lädt das Profil, komponiert den Cordis-Baum, reicht die Oberfläche aus    │
│  Zustand: startet, HTTP 200, Auth greift — API ausgefallen (§ api-flaeche) │
├────────────────────────────────────────────────────────────────────────────┤
│  SCHICHT 1 — DER CORE (fremd)   245 × @deepseek-ai/* @ 0.2.1-alpha.2       │
│  TypeScript/JavaScript auf Bun. Cordis-Plugin-System. Nicht unser Code.    │
│  Zustand: läuft; 10 Typert-Beitragende registrieren sich nicht             │
└────────────────────────────────────────────────────────────────────────────┘
```

## 3. Sprachen — vollständig, mit Belegen

| Sprache | Zeilen | Dateien | Wo | Läuft? |
|---|---:|---:|---|---|
| **TypeScript** (unser Kern) | 17.733 | — | `packages/*` (eigener Scope) | **nein** — nicht verdrahtet |
| **TypeScript** (Host + Tests) | ~2.900 | 55 | `apps/cli`, `apps/web`, `tests/` | **ja** (Host) |
| **Go** | 14.625 | 51 | `services/pmh-attach`, `pmh-nix`, `pmh-supervisor` | **2 von 3** über `start.mjs` |
| **Rust** | 6.569 | 16 | `native/*` (6 Crates), `services/pmh-sandbox` | **nein** |
| **PowerShell** | 558 | 7 | `scripts/*.ps1` | ja, wenn aufgerufen |
| **Markdown** | 304.261 | 922 | `docs/` | — (Doku) |
| **SQL** | 290 | 2 | `packages/auth/db-schema/migrations` | **ja** (gegen PostgreSQL) |
| JavaScript | 33.577 | 9 | `website/.vitepress/cache` | **erzeugter Code**, gehört nicht ins Repo |

## 4. Datenbanken und Speicher — gemessen

| System | Version | Wo | Zustand | Wird benutzt von |
|---|---|---|---|---|
| **PostgreSQL** | **17.11** | Docker `pmh-postgres` | **läuft** | `packages/auth/db-schema` — 13 Tests gegen die echte Datenbank |
| **Redis** | **7.4.9** | Docker `pmh-redis` | **läuft** | **noch nichts** — geplant für Drosselung und Sitzungs-Cache |
| SQLite | — | in `@deepseek-ai/dsh-session-query-sqlite` | im Core | dem Core |
| JSONL | — | `.pmh-build/harness-home`, `~/.pmh` | läuft | Sitzungsprotokolle des Cores **und** unser `session-persistence-jsonl` |

**Wir haben also zwei getrennte Persistenzwege** — und das ist eine bewusste
Entscheidung, kein Versehen: der Core speichert seine Sitzungen, wie er will
(JSONL + SQLite); wir bauen unseren eigenen Weg (PostgreSQL + JSONL). Sie
berühren sich nicht.

**Fremde Dienste, die auf diesem Rechner laufen** (nicht von uns gestartet, aber
vorhanden): `firecrawl` (+ Playwright + eigenes Redis), `searxng`, `freellmapi`,
`ollama`. Das sind genau drei Punkte deiner Zielliste — sie sind **da**, aber
nicht angebunden.

## 5. Was von deiner Zielliste belegt vorhanden ist — und was nicht

| Ziel | Zustand | Beleg |
|---|---|---|
| **DeepSeek Harness als Basis** | **ja** | 245 Pakete @ `0.2.1-alpha.2`, Host startet, HTTP 200 |
| **Bun + Go + TS7** | **ja** | Bun 1.4.0 · Go 1.27 · `tsgo 7.0.0-dev` · 15 Typechecks exit 0 |
| **Rust statt Python** | **teilweise** | 6.569 Zeilen Rust — **nichts ruft sie auf** (`rust-bestand.md`) |
| **PostgreSQL (Vektor) + Redis** | **teilweise** | beide laufen; PostgreSQL mit Schema + Tests; **pgvector nicht installiert**, Redis ungenutzt |
| **Obsidian als Memory + Graph View** | nein | kein Paket, keine Datei |
| **Git / Forgejo / Gitea / GitLab CE** | nein | Plattformwahl offen (`docs/vision.md`) |
| **Firecrawl + SearXNG** | **Dienste laufen**, nicht angebunden | Docker-Liste oben |
| **Decision-Model Jev / Layla** | nein | nur als Konflikt im Register |
| **LangChain / LangGraph** | **nein — und bleibt es** | Konflikt K1: Python verboten; Konzepte nachbauen |
| **RAG** | nein | setzt pgvector voraus |
| **NixOS-Selbständerung** | **Konzept ja, Installation nein** | `services/pmh-nix` (5.583 Z.), 60 Tests grün; `nix` fehlt → fail-closed |
| **Netzwerk (WireGuard/Tailscale/Cloudflared)** | nein | Auswahl offen |
| **WSL2 / Docker / Podman** | **Docker ja, WSL2 ja** | beide vorhanden und belegt; Podman fehlt |
| **n8n** | nein — und **bewusst** | Konflikt K2: kein Kern-Orchestrator |
| **Tesseract OCR** | nein | Konflikt K3: nur über die Prozessgrenze |
| **Mirage-Tesseract** | **ungeprüft** | Konflikt K5: muss vom Betreiber präzisiert werden |
| **DeepSeek als Plugin/Skill exportieren** | möglich | `unit-export` (6.154 Z.) mit belegtem Roundtrip |
| **NewDawn-Zoom-Technik** | **recherchiert, nichts belegbar** | `docs/status/newdawn0-recherche.md`: 70 Repos, Profilsuche `zoom` = 0 Treffer |
| **Obsidian-Docking als UX-Konzept** | Konzept liegt | `docs/design/ui-keep-cut.md`; GUI bleibt laut Auftrag außen vor |

## 6. Die vier Dinge, die diesen Stack wirklich kennzeichnen

1. **Der Core ist fremd und bleibt fremd.** 245 Pakete, die wir nicht ändern
   dürfen (`docs/concept.md`, Regel 1). Unser Code steht daneben — und **genau
   deshalb** ist die API-Lücke aus `api-flaeche.md` kein Weltuntergang: sie
   betrifft **fremden** Code, nicht unseren.
2. **Zwei Sprachen laufen, zwei stehen.** Go über `start.mjs`, Rust nirgends. Der
   Supervisor (3.372 Z.) wird **nicht** gestartet, obwohl er der Dienst ist, der
   „Dienste starten mit der Harness" umsetzen sollte (`concept.md`, Regel 3).
3. **Die Datenbank ist da und belegt, aber erst ein Paket benutzt sie.** Das ist
   der **richtige** Zustand: Schema zuerst, dann die Umsetzung darauf.
4. **Die drei Ziellisten-Dienste Firecrawl, SearXNG und Ollama laufen bereits** —
   sie sind die billigste Anbindung, weil nichts installiert werden muss.

## 7. Die zwei Lücken, die alles andere blockieren

| Lücke | Wirkung | Behebung |
|---|---|---|
| **Keine API** (`typert`-Stapel registriert sich nicht) | die Oberfläche lädt, kann aber nichts tun; jede eigene Oberfläche hätte dasselbe Problem | **eigener Endpunktweg auf unseren Paketen** statt Reparatur fremder Codecs |
| **Unser Kern ist nicht verdrahtet** | 262 + 108 grüne Tests, die in der Anwendung **nichts** bewirken | den Kern an den Host hängen — genau der nächste Schritt |

**Und sie hängen zusammen:** wer einen eigenen Endpunktweg baut, verdrahtet dabei
den eigenen Kern. **Das ist der Re(fork)-Schritt** — nicht der Austausch der
Oberfläche.
