# `crew-core-adapter` — die Crew am Seam des Kerns

> **Zweck.** Der Host lädt den Kern (`apps/cli` → `boot()`), und der Kern spricht
> `LlmAdapter.stream(GenerateOptions)` — nicht unseren eigenen Seam. Dieses Paket bringt die Crew
> **dorthin**: ein Adapter unter der Route `crew`, der je Anfrage die Rolle wählt und den Strom des
> Ziel-Anbieters mit umgeschriebener Route und umgeschriebenem Modell zurückgibt.

## 1. Was es kann

| Baustein | Datei | Aufgabe |
|---|---|---|
| Adapter | `src/adapter.ts` | `CrewAdapter extends LlmAdapter` (Kern 0.2.1): `providerInfo`, `listModels`, `resolveModel`, `stream` |
| Prüfung | `src/adapter.ts` | `pruefeCrew` — Kennung, halbe Bindung, **und die Rekursion** (Rolle → Route `crew`) |

```ts
import { CrewAdapter } from '@prometheus-harness/crew-core-adapter'

// In einem Host-Plugin:
const handle = ctx.llm.registerAdapter(['crew'], new CrewAdapter(ctx.llm, crews))
```

## 2. Der Vorteil, den nur dieser Seam bietet

Der Kern trägt **Bildblöcke** (`ContentBlockMap['image']`, `ModelModality = 'text' | 'image'`).
Damit geht eine Anfrage mit Bild **wirklich** an die Rolle `vision` — im eigenen Seam war das
unmöglich (`MessagePart` kennt dort nur Text, Werkzeugergebnis und Werkzeugaufruf). Der Katalog
meldet `inputModalities: ['text', 'image']` **nur**, wenn eine Bildrolle gebunden ist; sonst bleibt
es bei `['text']` — eine Zusage, die der Adapter einlöst.

## 3. Prüfen

```powershell
& C:\Users\Chang\.bun\bin\bun.exe test            # im Paketordner: 10 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/crew/crew-core-adapter/tsconfig.json   # exit 0
```

Geprüft ist die **Weiche**, nicht ein Modell: Text → `executor`, Bild → `vision`, fehlende Rolle →
benannter Fehler, unbekannte Crew → `LlmError` mit Liste, und die Nachrichten werden **nicht
angetastet** (der Strom wird durchgereicht, nicht kopiert).

## 4. Grenzen — gemessen, nicht weggelassen

1. **Nicht im laufenden Host registriert.** Der Adapter ist gebaut und geprüft; es fehlt das
   Cordis-Plugin, das ihn einhängt (eine Zeile in `EIGENE_PAKETE`, ein `registerAdapter`).
   **Nicht gemessen** ist damit, ob der Kern ihn beim Start annimmt.
2. **Die Rollenbindung ist Konfiguration.** Welche Crews gelten, kommt aus einer Einstellung; dieses
   Paket liest sie nicht selbst (kein Settings-Seam hier).
3. **Kein Plan, kein Lauf.** Dieser Adapter **routet** nur; das Planen und Prüfen liegt in
   `crew-provider`/`crew-plan` und ist am Kern-Seam nicht angemeldet.
4. **`prepareCall` bleibt beim Kern.** Der Adapter überschreibt es nicht; die Vorgabe bindet Modell
   und Versand. Wer pro Generation andere Fähigkeiten braucht, muß es überschreiben.
5. **Die Bildprüfung liest nur `content`-Blöcke.** Ein Bild, das in einem anderen Feld steckt,
   würde nicht erkannt — der Kern trägt Bilder ausschließlich als `image`-Block.
