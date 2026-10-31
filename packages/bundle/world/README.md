# @prometheus-harness/world

Das **Universe-Panel** im DSH-Shell. Ein Sidebar-Eintrag, ein Wechsel über `ctx.layout.selectPanel`, dieselbe Oberfläche und Logik wie `/universe/`.

**Obsidian und Graphify sind eigene Plugins** — nicht mehr Teil dieses Bündels:

| Plugin | Paket | Oberfläche |
|---|---|---|
| Welt | `@prometheus-harness/world` | Universe als main-Panel |
| Obsidian | `@prometheus-harness/obsidian` | Vault-Panel mit Suche, Notizliste, Vorschau |
| Graphify | `@prometheus-harness/graphify` | Graph-Panel mit Knoten, Hubs, Lauf |

## Installieren

Der Client muss **gebaut** sein (der Kern lädt kein TS im Browser):

```powershell
bun run packages/client/world/build.mjs
bun run packages/plugin/obsidian/build.mjs
bun run packages/plugin/graphify/build.mjs
```

Dann im Plugin-Manager **„Plugin von Drittanbietern installieren"** den lokalen Pfad eintragen:

```
C:\Users\Chang\prometheus-harness\packages\plugin\obsidian
C:\Users\Chang\prometheus-harness\packages\plugin\graphify
C:\Users\Chang\prometheus-harness\packages\bundle\world
```

Ohne HMR ist ein **Neustart** des Hosts nötig; die Sitzung bleibt erhalten.

## Das Welt-Panel

Das Panel bettet `/universe/` als vollflächiges `iframe` ein — **exakt dieselbe App** wie im Browser: 3D-Welt, Zoom-Ebenen, 5D-Rotation, Docking, Terminal, Notizen, Health, Geräte-Info, Token, KI-Rangliste, Suche, Lineal und Einstellungen. „Zum Chat" schließt das Panel; die eingebaute Chat-Navigation auf `/` ebenfalls.

- **Voraussetzung:** `/universe/` wird von `world-static` ausgeliefert. Erst eine native Portierung (`mountUniverse(root)`, gekapseltes `app.css`, DSH-Slots statt Docking) kann diese Zeile entfernen.
- **Der frühere native 3D-Ausschnitt ist entfernt.** Er zeigte nur einen Teil der Szene und war nicht das Original.

## Routen

Die Routen liegen bei den jeweiligen Plugins:

- `/api/world/obsidian/{status,graph,note,vault,sync}` — siehe [`@prometheus-harness/obsidian`](../../plugin/obsidian/README.md)
- `/api/world/graphify/{status,graph,run,config}` — siehe [`@prometheus-harness/graphify`](../../plugin/graphify/README.md)

Alle Routen antworten **nur auf Loopback** und prüfen `req.socket.remoteAddress`, nie `X-Forwarded-For`.

## Gemessen (18.10.2026)

- `bun test packages/world/graph packages/world/obsidian packages/world/graphify packages/client/world` — **48 pass, 0 fail** (nach dem Graphify-Testfix).
- Client: `tsgo --noEmit` **exit 0**; gebautes `lib/client.js` **7,5 KB**, registriert `main:world` und `sidebar.panellist:world`.
- Browser (isolierter Host 3099): Welt-Panel öffnet, `iframe src="/universe/"`, echte App erkannt (`PROMETHEUS`, `#hud`, `#dockhost`, `#isl`), „Zum Chat" schließt, **keine** Konsolenfehler.
