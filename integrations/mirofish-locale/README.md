# MiroFish auf Deutsch

MiroFish ist ein chinesisches Projekt. Die Oberfläche, alle Backend-Meldungen und
die Sprache der generierten Reports hängen an einer Sprachwahl, die standardmäßig
auf `zh` steht. Deutsch fehlt, obwohl `languages.json` es bereits deklariert.

## Was schon da ist

Die i18n-Schicht existiert im Projekt — es fehlten nur zwei Dinge:

| Baustein | Ort | Rolle |
|---|---|---|
| `locales/languages.json` | Repository | Sprache, Anzeigename und `llmInstruction` |
| `locales/<code>.json` | Repository | Wörterbuch für UI und Backend-Meldungen |
| `backend/app/utils/locale.py` | Repository | `t()` für Server-Texte, `get_language_instruction()` für Prompts |
| `frontend/src/api/index.js` | Repository | setzt `Accept-Language` aus der aktiven Sprache |
| `frontend/src/i18n/index.js` | Repository | Startsprache und `fallbackLocale` |

Der Sprachwechsel wirkt deshalb nicht nur auf Beschriftungen, sondern über
`llmInstruction` auch auf die Sprache, in der Personas und Reports erzeugt werden.

## Was hier geändert wurde

1. **`locales/de.json`** — 635 Schlüssel, vollständig. Struktur und Platzhalter
   sind identisch zu `en.json`; `check-locale.mjs` prüft das.
2. **Startsprache** in `frontend/src/i18n/index.js` — vorher fest `'zh'`, jetzt
   die Browsersprache (`de-AT` → `de`), sonst Englisch. `fallbackLocale` ist
   `en` statt `zh`, damit ein fehlender Schlüssel nicht chinesisch erscheint.
3. **Image neu gebaut.** Das veröffentlichte `ghcr.io/666ghj/mirofish:latest`
   stammt von Revision `985f89f` (7. März 2026); der i18n-Code kam erst später.
   Im Image fehlt `backend/app/utils/locale.py` komplett — dort ist jede
   Server-Meldung fest chinesisch verdrahtet, unabhängig vom Header. Deshalb
   baut `docker-compose.yml` jetzt aus dem Checkout (`build: .`), statt das alte
   Image zu ziehen.

## Prüfen

```powershell
# Struktur gegen die Referenz
node integrations\mirofish-locale\check-locale.mjs .tmp\mirofish\locales en de

# Backend-Meldung auf Deutsch
Invoke-WebRequest "http://127.0.0.1:5002/api/report/x/progress" `
  -Headers @{ "Accept-Language" = "de" } -UseBasicParsing
```

## Grenzen

- **Nur die Oberfläche und Server-Meldungen sind übersetzt.** Inhalte, die das
  Modell erzeugt (Report-Prosa, Persona-Biografien), folgen `llmInstruction` —
  also der Sprachwahl, nicht dem Wörterbuch. Ein Lauf nach dem Sprachwechsel
  erzeugt deutsche Reports; alte Reports bleiben in ihrer Ausgangssprache.
- **Die Übersetzung ist von Hand gemacht, nicht maschinell geprüft.** Fachbegriffe
  bleiben englisch (Graph, Agent, Persona, Report, GraphRAG, Zep), weil sie im
  Projekt als Namen fungieren. Wo eine Formulierung im Original mehrdeutig war,
  steht die naheliegende Lesart, nicht die einzige.
- **`de.json` ist eine Datenkopie, kein Upstream-Patch.** Ein `git pull` im
  MiroFish-Checkout kann sie überschreiben. Nach jedem Update erneut prüfen:
  `node integrations\mirofish-locale\check-locale.mjs …`.
- **Weitere Sprachen fehlen weiterhin.** `languages.json` nennt `es`, `fr`, `pt`,
  `ru`; für sie gibt es keine Wörterbücher, sie erscheinen also nicht im Menü.
