# @prometheus-harness/zugaenge

**Zugänge** als eigenes DSH-Plugin: ein Schlüsselverwalter über der Credential-Naht, eine
einheitliche Anbieter-Schnittstelle für **alle** Fähigkeiten und eine aktive Sonde, die vor dem
Eintragen mißt statt rät.

Anlaß (Betreiber, 21.10.2026): *„ein Core Plugin für API key … passend zum Konzept des PMH database
mit API key manager … genauso eine eigene Schnittstelle für alle Anbieter, Verwaltung … inklusive
später auch localhost-Modelle, alle Arten wie TTS, STT, Embedding, ein TypeSafe-Modell oder
Bildgenerierung, genauso wie LLM oder auch LSTM Kronos."*

Genau das ist der Zuschnitt: **nicht** ein weiterer Anbieter, sondern der **Ort**, an dem Anbieter
eingetragen, geprüft und anderen Plugins zugänglich gemacht werden.

## Die zwei Schichten

| Schicht | Was darin liegt | Wo |
|---|---|---|
| **Einträge** | welcher Anbieter, welche Fähigkeiten, welches Modell je Fähigkeit, Basisadresse, Notiz | `$PMH_HOME/zugaenge.json` (`PMH_ZUGAENGE_DATEI` überstimmt) |
| **Schlüssel** | die Geheimnisse | Credential-Naht des Hosts als Record `pmh-zugaenge/<id>` |

**Warum getrennt.** Ein Eintrag ist eine Beschreibung, die man lesen, sichern und von Hand ändern
will. Ein Schlüssel ist ein Geheimnis. Er liegt in der Naht, die der Harness dafür hat: mit
`@prometheus-harness/dsh-credentials-postgres` in **Postgres** (`credential_records`, Migration
0011, Umschlagverschlüsselung mit dem Hauptschlüssel **außerhalb** der Datenbank); mit dem
mitgelieferten Provider in `$DSH_HOME/.credentials.yaml`. Welcher Provider läuft, entscheidet der
Host — dieses Plugin fragt nur die Naht.

**Was nie passiert:** ein Schlüssel in der JSON-Datei, in einer HTTP-Antwort, in einer Meldung oder
im Browser. Die Oberfläche zeigt **gesetzt** oder **fehlt**.

## Der Eintrag

```jsonc
{
  "fassung": 1,
  "zugaenge": [
    {
      "id": "openrouter-privat",
      "name": "OpenRouter privat",
      "familie": "openrouter",          // Tabelle aus @prometheus-harness/provider-directory
      "art": "fern",                    // "fern" | "lokal"
      "schluessel": "noetig",           // "noetig" | "kein"
      "modelle": {
        "gespraech": "openai/gpt-oss-20b",
        "entscheiden": "typesafe/jev-router",
        "bild": "google/gemini-2.5-flash-image"
      },
      "umgebung": "OPENROUTER_API_KEY", // optional: Ausweichweg für Container/CI
      "notiz": "privat, nicht für Kunden",
      "angelegt": "2026-10-21T12:00:00.000Z",
      "geaendert": "2026-10-21T12:00:00.000Z"
    }
  ]
}
```

Regeln, die der Vertrag durchsetzt (`src/vertrag.ts`):

- **Unbekannte Felder werden abgelehnt**, nicht geschluckt — dieselbe Regel wie in
  `@prometheus-harness/settings`.
- **Eine unbekannte Fähigkeit wird abgelehnt.** `"text-zu-bild"` statt `"bild"` läse sich sonst wie
  „nichts gewählt".
- **Leer heißt „kann er nicht"**, nicht „Modell 0": ein leeres Modell ist ein Fehler.
- **`openai-kompatibel` braucht eine Basisadresse**; bekannte Familien bringen ihre mit.
- Basisadressen müssen `http(s)` sein — kein `file:` über eine Netzadresse.
- Zwei Einträge mit derselben Kennung sind ein Fehler; beim Anlegen wird eine vergebene Kennung
  **durchnumeriert** (`openrouter-privat-2`), nicht überschrieben.
- Der **Stand** wird gerechnet: `keine-faehigkeit` → `kein-schluessel` → `bereit`.

## Die Schnittstelle für andere Plugins

Nach dem Einhängen stellt das Plugin den Dienst `ctx.zugaenge` bereit:

```ts
import type { Zugangsdienst } from '@prometheus-harness/zugaenge'

const zugang = await ctx.zugaenge.zugang('openrouter-privat')
const familie = await ctx.zugaenge.familie('openrouter-privat') // Basis, Kopfzeile, Wege
const schluessel = await ctx.zugaenge.schluessel('openrouter-privat')
const anbieter = await ctx.zugaenge.anbieter('openrouter-privat') // fertig — oder undefined
```

**Der Schlüssel geht hier durch, aber nicht über HTTP.** Host-Code darf ihn sehen — er muß ihn in
eine Kopfzeile schreiben; der Browser nicht.

`anbieter()` gibt es heute für **`openrouter`** (die eine gemessene Umsetzung); für jede andere
Familie ist `undefined` die ehrliche Antwort. Der zurückgegebene Anbieter trägt die **Kennung des
Eintrags**, nicht die der Familie — zwei OpenRouter-Zugänge (privat und geschäftlich) sind zwei
Anbieter und werfen sich nicht gegenseitig aus der Registratur. **`gespraech` gehört nicht dazu:**
Chat läuft über `@prometheus-harness/llm`; dieser Anbieter bedient entscheiden, TTS, STT, Einbetten
und Bild.

Das ist der Anknüpfpunkt, von dem der Betreiber spricht: **eine Art Paket**, das man an einen
Eintrag hängt — nicht ein Sonderfall je Anbieter im Kern.

## Die Fähigkeiten

Der Vertrag ist `@prometheus-harness/capabilities`; dieses Plugin erfindet keine neue:

| Fähigkeit | Beispiel | Anmerkung |
|---|---|---|
| `gespraech` | OpenRouter, DeepSeek, Ollama | der Kern kann das schon (`@prometheus-harness/llm`) |
| `entscheiden` | `typesafe/jev-router` | TypeSafe/Jev ist **ein Modell** über OpenRouter, keine zweite Schnittstelle |
| `text-zu-sprache` | `google/gemini-3.8-flash-tts` | Weg je Familie gemessen (`/audio/speech`) |
| `sprache-zu-text` | `google/gemini-3.5-transcribe` | Mehrtelldaten (`/audio/transcriptions`) |
| `einbetten` | `google/gemini-embedding-2` | 3072 Dimensionen, gemessen |
| `bild` | `google/gemini-2.5-flash-image` | Pfad **und** Form gemessen (19.10.2026) |

**Was noch nicht geht, und warum es nicht hier erfunden wird.** Eine Zeitreihe („Kronos", LSTM),
Reranking oder Klassifikation sind **keine** dieser sechs Fähigkeiten. Sie brauchen zuerst einen
Eintrag in `Faehigkeit` — mit eigener Eingabe- und Ausgabeform. Dieses Plugin ist darauf
vorbereitet (die Modelltabelle ist nach Fähigkeit geschlüsselt), aber es behauptet die Fähigkeit
nicht, bevor der Vertrag sie kennt.

## Die aktive Prüfung („Sonde")

`POST /api/pmh/zugaenge/pruefen` schickt **leere** Aufträge und liest nur den Status:

| Status | Deutung |
|---|---|
| 200, 201 | vorhanden |
| 400, 405, 415, 422 | **vorhanden** — der Weg wurde angenommen und der Auftrag abgewiesen |
| 404 | **fehlt** |
| 401, 403 | **unbekannt** — ein Tor beantwortet alles so |
| sonst | unbekannt |

Das ist genau die Lücke, die der Betreiber an FreeLLMAPI beschreibt: *„kein Model active test für
free AI API key usage"*. Hier wird **vor** dem Eintragen gemessen, welcher Weg wirklich antwortet —
und die Antwort trennt „Pfad bestätigt" von „Form gemessen". Die Sonde ruft **keine** Fähigkeit
wirklich auf; sie kostet deshalb nichts.

## Routen

| Weg | Methode | Antwort |
|---|---|---|
| `/api/pmh/zugaenge` | GET | `{ datei, geltung, familien, zugaenge }` — ohne Werte |
| `/api/pmh/zugaenge/speichern` | POST | `{ zugang, wert? }` → der Eintrag mit Stand |
| `/api/pmh/zugaenge/entfernen` | POST | `{ id }` → `{ entfernt, warnung? }` |
| `/api/pmh/zugaenge/pruefen` | POST | `{ id }` → `{ befund }` |

**Die Sperre** kommt vom Verbindungsdienst des Hosts (`abweisung`): ohne Anmeldung **401**, ohne
Dienst **503**. Schreibende Wege verlangen zusätzlich den Kopf `x-pmh-csrf`; liegt der CSRF-Keks
vor, müssen beide gleich sein. Ein fremder Ursprung kann einen eigenen Kopf nicht ohne
CORS-Freigabe senden — und dieses Plugin gibt keine.

## Beispiele, die ohne Codeänderung gehen

| Ziel | Eintrag |
|---|---|
| **Ollama lokal** | `familie: "openai-kompatibel"`, `basis: "http://127.0.0.1:11434/v1"`, `schluessel: "kein"`, Modell z. B. `llama3.2` |
| **llama.cpp / vLLM** | wie oben, `basis` = eigener Port |
| **FreeLLMAPI** | `familie: "openai-kompatibel"`, `basis: "http://127.0.0.1:<port>/v1"`, Schlüssel nach dessen Konfiguration — **erst prüfen, dann eintragen** |
| **OpenRouter** | `familie: "openrouter"`, Schlüssel eintragen, Modelle je Fähigkeit wählen |
| **DeepSeek** | `familie: "deepseek"` — die Sonde zeigt, daß nur Chat existiert (die vier anderen Wege geben 404) |

## Bauen, prüfen, installieren

```powershell
# Bündel (Browser-Hälfte)
bun run packages/plugin/zugaenge/build.mjs

# Tests
bun test packages/plugin/zugaenge

# Typecheck (beide Hälften)
bun --cwd packages/plugin/zugaenge run typecheck
```

Installiert wird das Paket als **Bündel und Plugin zugleich**:

- `dsh.bundle.patch` → [cordis.patch.yml](cordis.patch.yml) fügt die Zeile `pmh-zugaenge` ein
- `dsh.client` → `lib/client.js` registriert `main:zugaenge` und `sidebar.panellist:zugaenge`
- `main`/`exports["."]` → `src/server.ts` (Host-Hälfte mit Routen und Dienst)

Im Plugin-Fenster den Ordner `packages/plugin/zugaenge` hinzufügen — oder im Profil eintragen:

```jsonc
// profiles/web/package.json
"dependencies": { "@prometheus-harness/zugaenge": "link:C:/Users/Chang/prometheus-harness/packages/plugin/zugaenge" },
"dsh": { "profile": { "bundles": [ /* … */ "@prometheus-harness/zugaenge" ] } }
```

**Entweder Bündel oder `scripts/profile-patch.mjs` — nie beides.** Der Kern wirft bei doppelter
Kennung, und der Host startet dann nicht.

## Geprüft

- **75 Tests** grün (`bun test packages/plugin/zugaenge`, 6 Dateien): Vertrag (Kennung, Prüfung,
  Stand, Datei-Roundtrip, unbekannte Felder, doppelte Kennung), Familien und Sonde (Deutung je
  Status, kein Schlüssel in der Antwort), beide Ablagen (Datei, Credential-Records, Umgebung als
  Ausweichweg), alle vier Routen (401/503/403/404/405, CSRF, Durchnumerierung, Schlüssel nie in der
  Antwort, Entfernen räumt den Schlüssel ab, Sonde gegen einen echten lokalen Dienst), der
  **Anbieteraufbau** (ein OpenRouter-Eintrag wird ein Anbieter mit eigener Kennung; ohne gemessene
  Umsetzung gibt es `undefined` statt eines geratenen Aufbaus) und die **echte Cordis-Naht**
  (laden → abhängen → **wieder** laden; zwei Instanzen nebeneinander) und die **Browser-Hälfte
  ausgeführt** (zwei Slots, Stil-Lebenszyklus, Panel rendert seinen Leerzustand).
- **Typecheck** beider Hälften (`tsconfig.json`, `tsconfig.client.json`) ohne Befund.
- **Bündel** 45.311 B; die Selbstprüfung meldet Kennung, `inject: ["slots","locale","layout"]` und
  `Panel: zugaenge`.

**Nicht geprüft:** ein vollständiger Hoststart mit diesem Plugin (kein laufender Host wurde
angefaßt), ein echter Anbieteraufruf über die Sonde hinaus, und die Ablage in einer echten
Postgres-Instanz (die Record-Methoden des Providers sind vorhanden und dort geprüft, nicht hier).

**Unter echtem Cordis geprüft** — und dabei gefunden: ein nacktes `ctx.provide` in `apply` wäre
dauerhaft, und das zweite Einschalten im Plugin-Fenster liefe in „already provided". Der Dienst
hängt jetzt an einem `effect`; der Test lädt, hängt ab und lädt **wieder**.

## Offen und benannt

1. **Die Einträge liegen in einer Datei, nicht in einer Tabelle.** Das ist Absicht (lesbar, sicherbar,
   von Hand änderbar) — aber wer sie je Nutzer trennen will, braucht eine Tabelle mit `user_id` und
   RLS. Die Schlüssel sind davon **nicht** betroffen: sie liegen bereits je Konto in der Naht.
2. **Kein Anbieter-Paket ist angeschlossen.** `anbieter()` baut heute nur `openrouter`; ein
   generischer OpenAI-kompatibler folgt erst nach einer Messung der Form — geraten wird sie nicht.
3. **Zwei Quellen für die Modellwahl — der eigentliche Blocker.** Ein Eintrag nennt `modelle` (was
   dieser Zugang anbietet), die Einstellungsdatei nennt `wahl` (was je Fähigkeit läuft). Beides zu
   mischen wäre genau der stille Fehler, den dieses Projekt vermeidet: ein Modell, das niemand
   gewählt hat. Vor dem Anschließen an `ai-capabilities` ist zu entscheiden: **Eintrag = Angebot,
   Einstellungen = Wahl** — oder der Eintrag ersetzt die Wahl für seinen Anbieter. Solange das offen
   ist, bleibt der Verwalter eine Insel, und das ist ehrlicher als eine geratene Verbindung.
4. **Keine Rotation, kein Verbrauch, keine Obergrenzen.** Ein Schlüssel läßt sich ersetzen und
   entfernen; ein Ablaufdatum und eine Zählung je Schlüssel fehlen.
5. **Der Geltungsbereich ist der Host**, nicht der angemeldete Nutzer — die Naht hat keinen
   Nutzer-Parameter. Das Panel sagt das im Fuß, statt „mein Schlüssel" zu behaupten.
6. **Neue Fähigkeiten** (Zeitreihe, Reranking) brauchen zuerst einen Vertrag in
   `@prometheus-harness/capabilities`; dieses Paket folgt ihm dann ohne Umbau.

Die vollständige Liste mit Aufwand, Reihenfolge und der einen blockierenden Entscheidung steht in
[docs/status/zugaenge.md](../../../docs/status/zugaenge.md).
