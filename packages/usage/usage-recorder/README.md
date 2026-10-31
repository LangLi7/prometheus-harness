# `usage-recorder` — vom Aufruf zum bezahlten Datensatz

> **Zweck.** `usage-budget` rechnet Token × Tarif, `token-meter` liefert die Token mit Herkunft.
> Es fehlte die **Zuordnung**: welcher Nutzer, welcher Schlüsselname, welcher Zweck — und die
> Ablage. Dieses Paket macht das in einem Aufruf.

## 1. Was es kann

| Baustein | Datei | Aufgabe |
|---|---|---|
| Schlüsselnamen | `src/keys.ts` | Route → Credential-Ref-Name (`deepseek-official` → `DEEPSEEK_API_KEY`) |
| Aufruf → Verbrauch | `src/record.ts` | Felder, Zählart (`reported`/`estimated`/`mixed`), Prüfung |
| Kasse und Konto | `src/recorder.ts` | `verbuchen` (bilden, preisen, ablegen) und `konto` (ablesen) |
| **Der Haken** | `src/provider.ts` | `messenderAnbieter` — eine Hülle um den Seam, die je `complete` bucht |

```ts
import { Aufzeichner, messenderAnbieter } from '@prometheus-harness/usage-recorder'
import { Verbrauchsspeicher } from '@prometheus-harness/usage-budget'
import { SAAT } from '@prometheus-harness/tariffs'

const aufzeichner = new Aufzeichner({ speicher: new Verbrauchsspeicher({ verzeichnis }), tarife: SAAT })

// Der Haken: derselbe Vertrag wie vorher, nur bucht er jetzt.
const anbieter = messenderAnbieter(dshAnbieter, { aufzeichner, nutzer: 'anna', melde: (fehler) => log.warn(fehler) })

// Oder von Hand buchen:
await aufzeichner.verbuchen({ nutzer: 'anna', familie: 'deepseek-official', modell: 'deepseek-flash',
  tokens: { inputTokens: 1_200, outputTokens: 300 }, zaehlung: 'reported' })

const konto = await aufzeichner.konto('anna', { tage: 30 })
konto.stand.gesamt.kostenUsd   // bekannte Kosten
konto.uebersicht              // Anfragen, Token, Anteil unbepreister Aufrufe
konto.zeilen                  // wie viele Datensätze im Zeitraum
```

## 2. Der Vertrag

| Wer | Was es braucht |
|---|---|
| `verbuchen` | Nutzer, Route, Modell, Token — **kein** Schlüsselwert, nur der Name |
| `konto` | Nutzer, optional Tage und Budget; rechnet **neu** aus den Token |
| `messenderAnbieter` | einen `LlmProvider` (Seam), einen `Aufzeichner`, den **Nutzer** — und `melde` |
| `Aufzeichner` | einen `Verbrauchsspeicher` und die Tarife |

**Ablage:** eine Datei je Nutzer (`usage-budget`). Der **Wert** eines Schlüssels wird nie gelesen;
nur der **Name** der Credential-Ref steht im Datensatz.

## 3. Prüfen

```powershell
& C:\Users\Chang\.bun\bin\bun.exe test            # im Paketordner: 26 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/usage/usage-recorder/tsconfig.json   # exit 0
```

Die acht Prüfungen des Hakens decken die drei Fälle ab, die zählen: **die Token kommen aus der
Antwort** (nicht aus einer Schätzung), **eine Antwort ohne Token wird nicht gebucht und nicht
verschwiegen**, und **ein Buchungsfehler verhindert die Antwort nicht** — er geht an `melde`.

## 4. Grenzen — gemessen, nicht weggelassen

1. **Der Nutzer kommt von außen.** `CompletionRequest` trägt keinen Nutzer; `messenderAnbieter`
   verlangt ihn. Wer die Hülle baut, muss ihn kennen — wie die Sitzung zu `conversation_sessions.
   user_id` kommt, ist **nicht gemessen**. Das ist die offene Frage dieser Fähigkeit.
2. **Ein unbekannter Schlüsselname wird nicht erfunden.** Ohne Treffer in der Tabelle ist die
   Route die Kennung. Eine erfundene Zuordnung verbuchte fremde Kosten auf einen Schlüssel, den es
   nicht gibt.
3. **Ein Tarif, der später dazukommt, wirkt rückwirkend** — `konto` preist die gespeicherten Token
   neu. Das ist Absicht (Kosten sind eine Aussage über Token, nicht über Buchungszeit), aber es
   heißt: zwei Ablesungen zu verschiedenen Zeitpunkten können verschiedene Beträge nennen.
4. **Der Schlüsselwert erscheint nirgends** — weder im Datensatz noch im Konto. Wer ihn braucht,
   holt ihn über den Geheimnisspeicher, nicht hier.
5. **Der Haken sitzt auf `complete`, nicht auf einem Strom.** Prometheus' Seam ist nicht streamend
   (`LlmProvider.complete`); eine Abbruch-/Teilantwort-Buchung gibt es damit nicht. Kommt später
   eine Strom-Methode dazu, braucht sie einen **zweiten** Haken — der bestehende deckt sie nicht.
6. **Keine Währung außer USD**, keine Umrechnung — wie `usage-budget`.
