# apps/web — Web-Oberfläche

Der Ort und der Aufbau dieses Ordners folgen **`apps/web` der Core-Vorlage**
(`C:\Users\Chang\harness\prometheus-harness\apps\web`, Upstream
<https://github.com/deepseek-ai/deepseek-harness>) — gleiche Namen, gleiche Rollen:

```
index.html          Einstiegsseite, lädt src/main.tsx
vite.config.ts      Vite-Konfiguration (React-Plugin, Port)
tsconfig.json       Typecheck-Konfiguration (TypeScript 7)
src/                Quelltext der Oberfläche
src/lib/            Bauteile (ein Bauteil je Datei)
public/             statische Dateien (noch leer)
stress-tests/       Platz aus dem Namensskelett (noch leer)
```

## Was hier gerade drin ist

Ein **Prototyp aus zwei Teilen**, beide aus der Web-UI-Vorlage
`H:\Projekt\Programmieren\Prometheus\webui` übernommen:

| Bauteil | Datei | Herkunft in der Vorlage |
|---|---|---|
| Dynamic Island (`◆ CHANNELS`) | `src/lib/ChannelsIsland.tsx` + `.css` | `src/App.svelte`, Markup Zeilen 319–336, Styles 530–548 |
| Hintergrund (Universe) | `src/lib/Universe.tsx` + `.css` | `src/lib/Universe.svelte`, Kern/Sterne/Kamera + Canvas-Verlauf Zeile 397 |
| Daten der Insel | `src/lib/island-data.ts` | Werte aus dem Markup der Vorlage |
| Design-Tokens | `src/app.css` | `src/app.css` der Vorlage |

Nichts anderes aus der Vorlage wurde übernommen — kein `.panel`, kein `.dock`,
kein `.term`, kein Kalender, keine API-Schicht.

## Stack

Bindend ist [docs/stack.md](../../docs/stack.md) und
[docs/project-profile.md](../../docs/project-profile.md):

| Baustein | Wahl | Warum |
|---|---|---|
| Laufzeit / Pakete | **Bun** | führt TypeScript direkt aus; keine Build-Skripte gegen die alte tsc-API |
| Sprache | **TypeScript** | Core-Sprache des Projekts |
| Typecheck | **TypeScript 7** (`tsgo`) | „Bun führt aus, TS 7 prüft" |
| Oberfläche | **React** | laut Stack-Doku gesetzt; die Svelte-Vorlage dient als Aussehens- und Strukturvorlage |
| Bündelung | **Vite** | wie `apps/web` der Core-Vorlage |
| Hintergrund | **three** | wie die Vorlage |

## Starten

```powershell
cd C:\Users\Chang\prometheus-harness\apps\web
bun install          # nur beim ersten Mal
bun run dev          # Dev-Server mit HMR
```

Aufruf: **<http://127.0.0.1:5175/>**

```powershell
bun run typecheck    # TypeScript 7 (tsgo), prüft ohne zu schreiben
bun run build        # Produktionsbuild nach dist/
```

Port **5175** ist fest eingestellt (`strictPort`), damit die Referenz-Vorlage auf 5174
unangetastet weiterläuft. Details, Abweichungen und Prüfnachweise:
[docs/reference/web-frontend.md](../../docs/reference/web-frontend.md).
