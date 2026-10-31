# `deepseek-search-tools` — Suche und Abruf über die **direkten** Endpunkte

> **Zweck.** DeepSeek bietet Web-Suche und Seitenabruf als **zwei rohe JSON-Endpunkte**. Der Kern
> nutzt sie **nicht** (er geht über `/anthropic/v1/messages` mit dem Server-Werkzeug
> `web_search_20250305`). Dieses Paket geht den direkten Weg — und macht sichtbar, was er kostet.

## 1. Was es kann

| Baustein | Datei | Aufgabe |
|---|---|---|
| Anfrage/Antwort | `src/client.ts` | `suche` (`/v1/tools/search`), `abruf` (`/v1/tools/fetch`), Abrechenbarkeit, `kostenFuer` |
| Werkzeuge | `src/tools.ts` | `tools_search` und `tools_fetch` als `AgentTool` — eigene Namen, eigener Preis |

```ts
import { suche, abruf, suchWerkzeuge } from '@prometheus-harness/deepseek-search-tools'

const gefunden = await suche(fetchWeg, { apiKey, query: 'DeepSeek Harness', count: 10 })
gefunden.treffer[0]?.summary      // 600–800 Zeichen, für ein Modell gedacht
gefunden.kosten.kostenUsd         // 0,00075 je ERFOLGREICHER Anfrage

const seite = await abruf(fetchWeg, { apiKey, url: 'https://…' })
seite.content                     // Markdown
```

## 2. Der Vertrag — und der Preis

| Größe | Wert |
|---|---|
| Suche | `POST https://api.deepseek.com/v1/tools/search`, Felder `query` (1–128), `count` (1–50, **preisneutral**), `need_content`, `ori_question`, `localization` |
| Abruf | `POST https://api.deepseek.com/v1/tools/fetch`, Feld `url` (≤ 8192, http(s), keine Zugangsdaten) |
| Preis | **0,75 USD je 1 000 erfolgreiche Anfragen** = 0,00075 USD je Anfrage |
| Abrechenbar | **nur** HTTP 200 **und** Ergebnis; leere Suche, Fehler, Timeout = **0** |
| QPS | **5/s je Konto** für Suche und Abruf getrennt; Abruf zusätzlich je Domain |
| Server-Weg frei bis | **2026-10-31 16:00 UTC** (2026-11-01 00:00 Beijing) — gilt **nicht** für den direkten Weg |

**Am 18.10.2026 mit dem DeepSeek-Schlüssel gemessen** (zwei Anfragen, **0,0015 USD**): Suche → 200,
3 Treffer (Autorität 4/3/3, Zusammenfassungen 1 989/1 167/5 348 Zeichen); Abruf der Such-Doku → 200,
Titel „Search & Fetch | DeepSeek API Docs", 10 279 Zeichen Markdown; 852 ms gesamt. Der Schlüssel
erscheint in keiner Ausgabe.

**Betriebsregel (Weisung des Betreibers, 18.10.2026):** Prüfungen laufen **nur** über den
DeepSeek-Schlüssel oder über OpenRouter mit dem **billigsten Tarif** — nach `packages/ai/tariffs` ist
das `inclusionai/ling-3.0-flash` (0,02 / 0,06 USD je 1 Mio Token). Kein teureres Modell für eine
Prüfung.

## 3. Prüfen

```powershell
& C:\Users\Chang\.bun\bin\bun.exe test            # im Paketordner: 19 pass, 0 fail, 55 expects
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/web/deepseek-search-tools/tsconfig.json   # exit 0
```

Zwei der 19 Prüfungen fahren den **echten** Netzweg (`netzHole`) gegen einen **lokalen**
`Bun.serve`-Server — Methode, `Bearer`, Rumpf, Status und die entschärfte Fehlermeldung. Kein Aufruf
nach außen, **0 USD**.

## 4. Grenzen — gemessen, nicht weggelassen

1. **Netz nur auf Wunsch.** `hole` wird gereicht; `netzHole()` ist die Vorgabe für Aufrufer, die
   keine eigene Funktion haben (etwa der Host, dessen Konfiguration aus JSON kommt). Die Tests ohne
   diese Vorgabe laufen ohne Verbindung.
2. **Keine Wiederholung.** Bei 429 wäre ein Wiederholer ohne Drosselung schlimmer als der Fehler —
   die Entscheidung gehört zum Aufrufer.
3. **Die Qualitätssignale werden mitgeliefert, aber nicht ausgewertet.** `rerank_score` (0–3) und
   `authority` (0–4) kommen an; zu filtern ist Sache des Aufrufers, weil „hochwertig" eine
   Anforderung ist und keine Eigenschaft der API.
4. **Der Wechsel ist kein Upgrade.** Der bestehende Server-Weg ist bis 2026-10-31 16:00 UTC gratis;
   dieser Weg kostet ab der ersten Anfrage. Ob umgestellt wird, entscheidet der Betreiber.
5. **`need_content` ist nicht als Preisfaktor belegt.** Die Doku nennt nur `count` ausdrücklich als
   preisneutral; für `need_content` wird hier dasselbe angenommen — **nicht belegt**.
