# @prometheus-harness/obsidian

Obsidian als **eigenes DSH-Plugin**: ein Sidebar-Eintrag **Obsidian**, ein main-Panel mit Vault-Status, Suche, Notizliste und Vorschau, ein Tab im **rechten Dock** und ein Knopf, der das **Programm** öffnet. Die Host-Routen kommen aus `@prometheus-harness/world-obsidian-provider`.

## Im Programm öffnen

Zwei Stellen führen aus dem Harness in die Anwendung, zwei weitere halten den Vault daneben:

| Ort | Was passiert |
|---|---|
| Kopfzeile des Panels **In Obsidian öffnen** | `obsidian://open?path=<Vault>` |
| Werkzeugleiste der Notiz **In Obsidian** | `obsidian://open?path=<Notiz>` |
| Fuß der Seitenleiste (Symbol) | wie Kopfzeile, ohne das Panel zu suchen |
| rechtes Dock (Tab-Typ `obsidian`) | dasselbe Panel neben dem Chat |

Ohne gefundenes Programm gibt es **keinen** Knopf — nicht einen, der nichts tut. Die Erkennung liegt in `packages/world/obsidian/src/app.ts`, die Begründung in [`docs/decisions/obsidian-programm-oeffnen.md`](../../../docs/decisions/obsidian-programm-oeffnen.md).

## Was das Panel zeigt

- Vault-Pfad, Anzahl **Notizen**, **Verbindungen**, **offene Verweise**
- Suchfeld über Namen und Pfad
- Notizliste; ein Klick lädt den Inhalt über `GET /api/world/obsidian/note?path=…`
- **Markdown-Vorschau** (Überschriften, Listen, Zitate, Codezäune, fett/kursiv, `[[Wikilinks]]`, Links) und Umschalter **Quelltext**
- **Bearbeiten**: Textarea, **Speichern** (`Strg+S`) und **Schließen ohne Speichern**; die Vorschau aktualisiert sich nach dem Speichern. Ungespeicherte Änderungen lösen beim Schließen/Wechseln eine Rückfrage aus.
- Fehler-, Lade- und Leerzustand (kein Vault, keine Notiz)
- „Neu lesen" und „Schließen" (`ctx.layout.selectPanel(null)`)

## Anzeige einstellen

Wo das Plugin erscheint, steht **nicht mehr im Code**, sondern im Eintrag `pmh-obsidian` der Plugin-Einstellungen (Schema: `lib/index.js` → `Config`):

| Feld | Werte | Vorgabe |
|---|---|---|
| `surface` | `sidebar`, `plugins`, `both`, `none` | `sidebar` |
| `order` | 0–999, kleinere Zahl steht weiter oben | `11` |
| `label` | eigene Beschriftung; leer = Text aus dem Sprachpaket | `''` |

`plugins` meldet dieselbe Fläche als Karte in der Plugin-Liste an; die Kurzfassung ist eine Zeile, die eigene Seite zeigt das Panel. Eine **Guide-Kachel** meldet dieses Plugin nicht an, deshalb gibt es kein `guide`-Feld.

## Installieren

```powershell
bun run packages/plugin/obsidian/build.mjs
```

Dann im Plugin-Manager den Pfad `C:\Users\Chang\prometheus-harness\packages\plugin\obsidian` installieren. Das Paket ist **Bündel und Plugin zugleich**:

- `dsh.bundle.patch` → `cordis.patch.yml` fügt die Zeile `pmh-obsidian` ein
- `dsh.client` → `lib/client.js` registriert `main:obsidian` und – je nach Einstellung – `sidebar.panellist:obsidian` und/oder `plugins.item:obsidian`
- `lib/index.js` → re-exportiert `apply`/`inject` des Providers und trägt die `Config` der Anzeige

## Agent-Werkzeuge

Das Plugin registriert drei native Werkzeuge am Host (`ctx.tools`), damit der
Agent den Vault **autonom** lesen kann:

| Werkzeug | Zweck |
|---|---|
| `obsidian_search` | Notizen nach Name/Pfad durchsuchen |
| `obsidian_read` | eine Notiz lesen |
| `obsidian_write` | eine bestehende Notiz schreiben (nur auf Auftrag) |

Die Bündelzeile braucht dafür `inject: [webServer, tools]`.

## Routen

| Weg | Methode | Antwort |
|---|---|---|
| `/api/world/obsidian/status` | GET | Vault, Notizen, Kanten, offene Verweise |
| `/api/world/obsidian/graph` | GET | `WorldGraph` aus dem Vault |
| `/api/world/obsidian/note?path=…` | GET | `{ path, content }` einer `.md`-Datei |
| `/api/world/obsidian/note` | POST | `{ path, content }` speichern |
| `/api/world/obsidian/vault` | POST | Vault-Pfad setzen (`{ path }`) |
| `/api/world/obsidian/app` | GET | ist das Programm da, wo, und welcher Vault würde geöffnet |
| `/api/world/obsidian/app/open` | POST | `{}` öffnet den Vault, `{ note }` die Notiz; 409 ohne Programm |
| `/api/world/obsidian/sync` | POST | 501 — Einlesen läuft über `/api/pmh/notizen/einlesen` |

`note` prüft den Pfad: relativ, kein `..`, keine absoluten Pfade, nur `.md`, höchstens 200 000 Zeichen; Schreiben löst zusätzlich den **Realpath** auf und lehnt Symlinks nach draußen ab. Ein führendes `obsidian:` (die Knoten-ID des ersten Panels) wird abgeschnitten, damit alte Aufrufer kein 404 bekommen. Alle Routen sind **local-only** (Loopback-Socket).

## Gemessen

- Vault `D:\Windows\Dokumente\Obsidian Vault`: **2 Notizen, 1 Kante, 0 offene Verweise**
- Browser (Host 3099): Sidebar **Obsidian**, Panel sichtbar, Notiz „Willkommen" lädt Inhalt, **keine** Konsolenfehler.
- `tsgo --noEmit` exit 0.
