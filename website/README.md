# website — Dokumentationsseite

Dieser Ordner ist die **veröffentlichte Dokumentationsseite** des Projekts — nicht die
Anwendung. Die Rollenverteilung ist die der Core-Vorlage
(`C:\Users\Chang\harness\prometheus-harness`, Upstream
<https://github.com/deepseek-ai/deepseek-harness>):

| Ordner | Rolle in der Vorlage | Rolle bei uns |
|---|---|---|
| `apps/web` | Vite + React, die Oberfläche der Anwendung | [apps/web](../apps/web/README.md) — Prototyp: Insel + Hintergrund |
| `website/` | VitePress-Dokumentationsseite (`@deepseek-ai/website`) | **dieser Ordner** |
| `apps/cli` | Host, der `apps/web/dist` ausliefert (`dsh web`) | vorgesehen, noch leer |
| `packages/client/ui-*` | UI-Bausteine als Units | vorgesehen, noch leer |

## Wie die Seite an die Dokumente kommt

Die Markdown-Dokumente bleiben in `docs/` liegen — sie werden **nicht** kopiert und gepflegt.
Der Ordner projiziert sie nur:

```
docs/*.md  ──project.ts──▶  website/.generated/  ──vitepress──▶  website/.dist/
   (Quelle, bleibt)            (generiert)                        (Bauausgabe)
```

| Datei | Aufgabe |
|---|---|
| `docs.ts` | Das Manifest: welche Dokumente veröffentlicht werden, unter welcher Route, mit welcher Beschriftung und in welchem Abschnitt |
| `project.ts` | Kopiert die Dokumente aus `docs/` nach `.generated/` — unverändert, damit relative Verweise (`../INDEX.md`, `../design/…`) gültig bleiben |
| `.vitepress/config.ts` | Darstellung: Titel, Navigation, Seitenleiste aus dem Manifest, lokale Suche; `srcDir: '.generated'`, `outDir: '.dist'` |

**Nicht veröffentlicht:** `docs/dsh/` (der gespiegelte Doku-Bestand der Core-Vorlage, 692
Dateien je Sprachfassung), `docs/source/` (Rohmaterial), `docs/reference/verify/`
(Prüfprotokolle) und alle `*.zh.md`. Diese Bäume sind Arbeitsmaterial, nicht Projektinhalt.

Die Startseite ist der Katalog: `docs/INDEX.md` wird zur Route `/`. Die Datei behält ihren
Namen, weil die Dokumente reihenweise auf `../INDEX.md` verweisen; eine zusätzliche
`index.md` wäre unter Windows **dieselbe** Datei.

## Starten

```powershell
cd C:\Users\Chang\prometheus-harness\website
bun install            # nur beim ersten Mal
bun run dev            # projiziert und startet den Dev-Server
```

Aufruf: **<http://127.0.0.1:5176/>** (Vorschau des Baus: Port 4176)

| Befehl | Wirkung |
|---|---|
| `bun run project` | nur projizieren (`.generated/` neu schreiben) |
| `bun run dev` | projizieren + Dev-Server mit HMR, Port 5176 |
| `bun run build` | projizieren + Produktionsbau nach `.dist/` |
| `bun run preview` | gebaute Seite ansehen, Port 4176 |

Port **5176**, weil 5173 auf diesem Rechner belegt ist und 5174 die Referenz-Vorlage der
Web-UI bedient — beide bleiben unangetastet.

Nachweise, Grenzen und offene Punkte: [docs/reference/website.md](../docs/reference/website.md).
