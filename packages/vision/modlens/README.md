# `modlens` — die Bildbrücke als Prometheus-Unit

> **Zweck.** Ein Bild an ein Modell geben, das **belegt** statt beschreibt: die modlens-CLI liest das
> Bild und liefert strukturierte Evidenz — erkannter Text, Anordnung, Semantik, Unsicherheiten. Das
> Paket baut den Aufruf, liest die Antwort und stellt das Ganze als Werkzeug in den Loop.

## 1. Was es kann

| Baustein | Datei | Aufgabe |
|---|---|---|
| Ausstattung | `src/config.ts` | findet `~/.modlens/config.json` (oder `$MODLENS_CONFIG`); sagt, ob ein Anbieter bereit ist — **ohne** den Schlüssel |
| Engine | `src/engine.ts` | baut `node <cli> -i <bild> --timeout …` und liest `{ image, provider, result, meta }` |
| Werkzeug | `src/tool.ts` | `modlens_read_image` als `AgentTool` (Pfad/URL + optionaler Fokus) |

```ts
import { modlensWerkzeug } from '@prometheus-harness/modlens'

const werkzeug = modlensWerkzeug({
  cliPfad: '<pfad>/@liustack/modlens/dist/main.js',
  ausfuehren: meinKindprozess,        // im Host: spawn mit Zeitlimit
})
// → in die Tools-Registry des Loops hängen
```

## 2. Der Vertrag

| Wer | Was es braucht |
|---|---|
| `liesAusstattung` | einen Pfad; eine fehlende Datei ist `gefunden: false`, kein Fehler |
| `liesAntwort` | die Ausgabe der CLI; ohne `result` oder ohne `summary` **wirft** sie |
| `modlensWerkzeug` | `cliPfad` und `ausfuehren` — das Programm ist austauschbar, damit die Prüfung ohne CLI läuft |

**Ergebnis:** JSON mit `provider`, `model`, `warnungen` und `evidenz` (OCR-Text, Regionen, Semantik,
Unsicherheiten). Der **Schlüssel** erscheint nie — weder in der Ausstattung noch im Ergebnis; auch
Fehlermeldungen werden entschärft (`entschaerfe`).

## 3. Prüfen

```powershell
& C:\Users\Chang\.bun\bin\bun.exe test            # im Paketordner: 14 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/vision/modlens/tsconfig.json        # exit 0
```

**Was ohne Geld gemessen ist.** `modlens doctor --json` meldet auf dieser Maschine `openai` **bereit**
(Basis, Schlüssel, Modell aus der Datei; die Werte selbst erscheinen nicht im Bericht) und
`claude-cli` installiert, aber ohne geprüfte Anmeldung. Das ist der Zustand: die Brücke **kann**
lesen. Der Parser ist gegen eine Fixture nach der veröffentlichten Form geprüft — dafür braucht es
keinen Modellaufruf.

**Was zwei Aufrufe gekostet haben — und warum der zweite meiner war.** Ein Aufruf
(`design-blatt.png`, 15 262 Token, ≈ **0,0085 USD**) belegte, daß der **Weg** wirklich trägt:
`provider: openai`, `model: deepseek-flash`, 49,5 s. Der **zweite** Aufruf
(`zeichen-tafel.png`, 17 018 Token, **0,0096 USD**) prüfte den Parser gegen echte Ausgabe — und war
**unnötig**: dieselbe Aussage stand schon in der Fixture-Prüfung und im doctor-Bericht. Zwei Aufrufe
zusammen ≈ **0,0181 USD**. Der Fehler steht hier, damit er nicht als „notwendige Messung" in
Erinnerung bleibt.

**Ein Fallstrick dieser Umgebung:** ein Kindprozeß mit `stdio: 'pipe'` scheitert hier an `EPERM`.
Die Sonde schreibt die CLI-Ausgabe deshalb mit `-o <datei>` in eine Datei und liest sie; `stdio:
'ignore'` und `'inherit'` gehen. Für den Host gilt die Grenze nicht.

## 4. Grenzen — gemessen, nicht weggelassen

1. **Kein Cordis-Plugin.** Die Anmeldung im Host (eine Zeile in `EIGENE_PAKETE`, ein
   `ctx.tools.register`) ist ein eigener Zug; hier liegt der geprüfte Kern.
2. **Kein Bildteil im Seam.** Die Evidenz kommt als **Text**; Prometheus' `MessagePart` kennt keine
   Bilder. Genau deshalb ist die Brücke nötig.
3. **Die Kommandozeile ist eine Angabe.** Das Paket kennt keinen Standardpfad zur CLI — der Pfad
   hängt an der Installation und gehört in die Konfiguration, nicht in den Code.
4. **Ein Aufruf kostet Geld und Zeit.** Gemessen: 49–58 s und ein Modellaufruf je Bild. Ein
   Werkzeug, das im Hintergrund aufruft, wäre eine offene Rechnung — der Loop entscheidet.
5. **`meta.usage` wird nicht verbucht.** Die CLI meldet Token (`prompt_tokens`,
   `completion_tokens`); dieses Paket gibt sie **nicht** weiter. Wer sie in die Kostenrechnung
   nehmen will, braucht einen zweiten Haken — die Verbindung steht noch aus.
