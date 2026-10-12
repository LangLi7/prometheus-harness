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

**Phase: Konzept.** Es läuft noch kein eigener Code. Belegt ist bisher:

- Der Referenz-Fork baut und bootet: `pnpm run build` → exit 0 (212,9 s), Web-Oberfläche
  wird ausgeliefert, HTTP 200, 13 Provider-Zugänge laufen über `~/.pmh`.
- Der Harness-Code kompiliert mit TypeScript 7.1 in **12,7 s statt 129,7 s** (rund 10×),
  ohne einen einzigen Fehler im Laufzeitcode.
- Der Plugin-Seam des Harness (Cordis) ist tragfähig: `AGENTS.local.md`-Ebene,
  Merge-Extensions, deklarative Kompositionen.

## Nächste Schritte

1. **Bun-Kompatibilität messen** — die native Addons (`node-pty`, `koffi`) sind das
   größte unbekannte Risiko der Sprachwahl. Siehe [docs/risks.md](docs/risks.md).
2. Danach den Agent-Core aufsetzen: TypeScript auf Bun, Typecheck mit TypeScript 7.
3. Sprachgrenzen (Go, Rust) erst nach Messungen festlegen, nicht vorab.
