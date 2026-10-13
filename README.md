# Prometheus Harness

Eine eigene Agent-Harness. Der DeepSeek Harness dient als **Vorlage und Core-Referenz**,
nicht als Codebasis, die wir kopieren.

> Dieses Verzeichnis enthält **Konzept und Planung**. Der lauffähige Referenz-Fork liegt
> unter `C:\Users\Chang\harness\prometheus-harness` (Branch `pmh`, Core
> `d743267388` = DeepSeek Harness 0.2.1-alpha.2) und bleibt als Vergleichsobjekt erhalten.

## In einem Satz

Ein Agent-Core in TypeScript auf Bun, dessen Fähigkeiten als **Units** (Plugins und Skills)
steckbar sind — alles andere (Sandbox, Werkzeuge, Dienste) liegt als eigener Prozess
dahinter, nicht im Core.

## Dokumente

| Datei | Inhalt | Art |
|---|---|---|
| [docs/project-profile.md](docs/project-profile.md) | **Überblick**: Was es ist, Sprachen, Infrastruktur, Vorbilder | Einstieg |
| [docs/vision.md](docs/vision.md) | Das Zielbild, als **Notizen** | Nordstern |
| [docs/design/realtime-collaboration.md](docs/design/realtime-collaboration.md) | Echtzeit-Bearbeitung, Multi-Agent + Multi-User | Notiz |
| [docs/reference/reference-templates.md](docs/reference/reference-templates.md) | Die Vorlagen-Verzeichnisse | Notiz |
| [docs/roadmap.md](docs/roadmap.md) | Der nächste Schritt | dünn gehalten |
| [docs/concept.md](docs/concept.md) | Das Unit-Modell und die Regeln | Konzept |
| [docs/stack.md](docs/stack.md) | Sprachaufteilung | Vorschlag |
| [docs/reference/reference-dsh.md](docs/reference/reference-dsh.md) | Messungen am DeepSeek Harness | Belege |
| [docs/risks.md](docs/risks.md) | Bekannte Risiken | Belege |
| [docs/decisions/open-questions.md](docs/decisions/open-questions.md) | Offene Entscheidungen | Liste |

## Stand

**Phase: der Core läuft — ein eigener Agent läuft noch nicht.**

Dieser Satz stand hier vorher als *„eigener Code läuft"* und war **falsch**. Am
13.10.2026 nachgemessen:

| Nachweis | Ergebnis |
|---|---|
| **Host startet** | `bun run start` → Oberfläche **HTTP 200** (35.664 B); Start bis zum Token **1,1 s** |
| **Port** | Standard **3080**; ist er belegt, wird der nächste freie genommen und **genannt** — [Methodik](docs/design/startup-port-methodik.md) |
| **Boot-Schleife** | `bun install` **0,1 s** · `tsgo --noEmit` über **17 Pakete: 2,1 s, 0 rot** · Start **1,1 s**. **Kein Build-Schritt** — Bun führt TypeScript direkt aus, `tsgo` prüft nur |
| **Anmeldung (Core)** | Token-Weiterleitung **303** + Cookie; `GET /` mit Cookie **200**, ohne Cookie **401** — greift |
| **API** | **ausgefallen.** `/api/*` → **404** (18 Pfade geprüft), WS `/api/remote.mux` → **1008 Policy Violation**. Ursache: der `typert`-Stapel registriert sich nicht, das Gateway hängt daran — [Beleg](docs/review/api-flaeche.md) |
| **Eigener Kern** | 17.733 Zeilen TypeScript in 14 Paketen, **262 + 108 Tests grün** — aber **nicht verdrahtet**: er läuft in Tests, nicht in der Anwendung |
| **Datenbank** | PostgreSQL 17.11 mit pgvector 0.8.7 und Redis 7.4.9 als Stack in **einer** Datei (`docker-compose.yml`); Rechtemodell belegt wirksam |
| **Go-Dienste** | `pmh-nix` 60 Tests · `pmh-attach` 63 Tests · `pmh-supervisor` **2 rot** (auch auf `HEAD` rot, nicht aus dieser Sitzung) |
| **Rust** | 6.569 Zeilen in 6 Crates — **nichts ruft sie auf**, kein Skript baut sie — [Beleg](docs/review/rust-bestand.md) |

**Was daraus folgt.** Der nächste Schritt ist **nicht** die Oberfläche und
**nicht** mehr Sicherheit — beide hätten nichts, woran sie hängen könnten. Der
nächste Schritt ist, den eigenen Kern **zu verdrahten**: Adapter → Agent-Loop →
Session. Erst danach gibt es etwas abzusichern und zu skalieren.

### Frühere Nachweise, die weiterhin gelten

| Nachweis | Ergebnis |
|---|---|
| **Plugin-Export** | Rundlauf-Digest `sha256:ac37e0ec…` **identisch** nach Rückexport |
| **WSL2** | Standard-Umgebung; Go 1.27.2, Rust 1.99.0, Bun 1.4.3, Node v26.11.1 |

### Die drei kopierten Apps sind entfernt (Auflage A1)

`apps/cli`, `apps/desktop` und `apps/desktop-host` waren **1.043 byte-identische Dateien**
aus dem Upstream — unverändert, mit zusammen **158 unauflösbaren `workspace:*`-Verweisen**.
Sie haben jedes `bun install` blockiert und damit **jeden** Typecheck. Sie wurden am
13.10.2026 entfernt; an ihre Stelle tritt der eigene Einstieg unter **`apps/cli`** — genau
die Stelle, die `MAPPING.md` §3.5 als Host vorsieht.

**Was `apps/` jetzt enthält:** `host` (eigener Einstieg, 4 Dateien) · `web` (17 Dateien,
unverändert). **Was fehlt:** der Kern unter `packages/` — dort stehen 35 Dateien gegen
**18.376** in der Vorlage (`docs/status/delta-non-web.md`).

**Lizenz:** Mit der Nutzung als Codebasis greift die **MIT-Lizenz** der Vorlage. Der
Copyright-Vermerk liegt in [LICENSE](LICENSE) — die Bedingung der Lizenz verlangt ihn.

## Nächste Schritte

**Die Reihenfolge ist bindend** (Weisung des Betreibers, 13.10.2026 —
[docs/decisions/betreiber-weisung-2026-10-13.md](docs/decisions/betreiber-weisung-2026-10-13.md)):

1. **Kleinste Kette verdrahten** — Adapter → Agent-Loop → Session. Ohne laufenden
   Kern gibt es nichts abzusichern oder zu skalieren. Vorher die Entscheidung
   **übernehmen oder portieren** des Vorlagen-Adapters.
2. **Danach** Login, PostgreSQL und Redis ins Spiel bringen — gebaut und getestet
   ist beides (108 + 36 Tests), es hängt nur nichts daran.
3. **Mandantentrennung** als eigene Entscheidung davor: Postgres Row-Level
   Security, `workspace_members`, Redis-Namensräume, **pro Benutzer eine eigene
   Sandbox**. Nicht Ende-zu-Ende — der Agent braucht den Klartext.
4. **Offen:** Formatversion 4 der Sitzung, Compaction, Aufruf gegen den echten
   Anbieter, `pmh-supervisor` starten und seine zwei roten Tests klären.

**Was nicht mehr gilt:** der frühere Satz *„Es läuft noch kein eigener Code"* — er war beim
Schreiben korrekt und ist durch die Arbeit überholt. Ebenso die alte Formulierung „Vorlage,
nicht Codebasis": Der Betreiber hat am 13.10.2026 klargestellt, dass der DeepSeek Harness
**als Codebasis** dient und in **Go, Bun/TS 7 und Rust** angepasst wird.

**Und was ebenfalls nicht mehr gilt:** *„Phase: eigener Code läuft."* Der Core läuft, der
eigene Agent nicht — die Oberfläche wird ausgeliefert, aber ihre API ist ausgefallen und
kein Paket unseres Kerns ist angeschlossen. Diese Datei nennt den Unterschied jetzt
ausdrücklich, statt ihn zu verwischen.
