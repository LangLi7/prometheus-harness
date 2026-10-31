# `usage-budget` — Kosten und Budget je Nutzer und je Schlüssel

> **Zweck.** Die Zahl, die bis hierher fehlte: **Token × Tarif**. Prometheus zählt Token
> (`packages/llm/token-meter`) und kennt Preise (`packages/ai/tariffs`) — die Multiplikation gab es
> nicht, und ein Geldbudget auch nicht.

## 1. Was es kann

| Baustein | Datei | Aufgabe |
|---|---|---|
| Formen | `src/types.ts` | Verbrauch, Kostenzeile, Budget, Saldo, Postenstand |
| Rechnen | `src/price.ts` | Token × Tarif, Kostenart, Summe mit unbepreisten Aufrufen |
| Grenzen | `src/budget.ts` | Warnschwellen, Zeitfenster, Zusammenfassung |
| Ablegen | `src/store.ts` | eine Datei je Nutzer, atomar, Grenze 20 000 |

```ts
import { Verbrauchsspeicher, budgetstand, preiseAlle, STANDARDBUDGET, zusammenfassung } from '@prometheus-harness/usage-budget'
import { SAAT } from '@prometheus-harness/tariffs'

const speicher = new Verbrauchsspeicher({ verzeichnis: '<home>/usage' })
await speicher.anhaengen('anna', [{ zeit: new Date().toISOString(), nutzer: 'anna', schluessel: 'DEEPSEEK_API_KEY',
  familie: 'openrouter', modell: 'google/gemini-3.8-flash', hinein: 1_000, heraus: 500, herkunft: 'gemessen' }])

const zeilen = preiseAlle(SAAT, await speicher.lesen('anna'))
zusammenfassung(zeilen).kostenUsd          // bekannte Kosten
budgetstand(zeilen, STANDARDBUDGET).gesamt // Posten „gesamt" mit Warnung
```

## 2. Der Vertrag

| Wer | Was es braucht |
|---|---|
| `preiseAlle` | die Tarife — dieses Paket holt **keine** Preise |
| `Verbrauchsspeicher` | ein Verzeichnis (oder keins: dann nur Arbeitsspeicher) |
| `budgetstand` | ein Budget; Grenzen sind **Angaben**, keine Sperren |

**Ablage:** `<verzeichnis>/<nutzer>/usage.json`, Fassung `1`, Grenze 20 000 Datensätze je Nutzer
(die ältesten fallen). Ein fremder Verbrauch ist durch den **Pfad** unerreichbar.

## 3. Prüfen

```powershell
& C:\Users\Chang\.bun\bin\bun.exe test            # im Paketordner: 38 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/usage/usage-budget/tsconfig.json  # exit 0
```

## 4. Grenzen — gemessen, nicht weggelassen

1. **Kein Blockieren.** `warnung: 'ueberschritten'` ist eine Meldung. Wer sperren will, baut die
   Sperre an der Naht — der Harness hatte den Schalter und **rief die Prüfung nie auf**
   (`index.js:729-749`); dieselbe Totstelle wird hier nicht nachgebaut.
2. **Zwischenspeicher-Token werden zum Hinein-Preis gerechnet.** Die Tarife kennen zwei Preise,
   der Harness vier. Der Betrag ist damit eine **Obergrenze**; wer es genauer will, trägt
   Cache-Preise in `tariffs` ein.
3. **Ein Preis ohne Datum wird nicht verwendet** — `tariffs` trägt `stand` und `quelle`, dieses
   Paket gibt beides weiter (`tarifStand`).
4. **Keine Währung außer USD.** Die Anbieter rechnen in USD; eine Umrechnung wäre eine zweite
   Wahrheit ohne Quelle.
5. **Der Speicher ist eine Datei, keine Tabelle.** Für Haltbarkeit über Prozesse hinweg bräuchte es
   `user_id` in der Datenbank (Migration 0004 hat die Form); nicht gebaut, weil der Kern ohne
   Datenbank prüfbar bleiben soll.
6. **Guthaben sind eine Angabe.** `Saldo` ist ein Datentyp ohne Abruf — die Abfrage
   (`/user/balance`, `/api/v1/credits`) gehört zur Naht und braucht einen Schlüssel.
