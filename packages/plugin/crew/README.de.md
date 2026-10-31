# `@prometheus-harness/crew` — die Crew als Plugin

> **Zweck.** Die Crew war bis zum 21.10.2026 ein **Eintrag ohne Fläche**: `crew-plugin` hing
> Adapter, Werkzeuge und Buchung ein, die Einstellung lag in `<home>/crew/config.json`, und wer sie
> ändern wollte, öffnete einen Editor. Dieses Paket gibt ihr, was Konten, Obsidian, Graphify und
> Verbrauch schon haben: einen **Sidebar-Eintrag**, ein **Panel**, **Wege** — und eine Ablage
> **je Konto** in PostgreSQL, mit der Datei als Rückfall.

**Sprache:** Englisch ist die erste Sprache, Deutsch die zweite. Die englische README steht in
[README.md](README.md); dieses Blatt ist die Übersetzung.

## 1. Was das Paket mitbringt

| Fläche | Adresse / Ort | Was sie tut |
|---|---|---|
| Weg lesen | `GET /api/pmh/crew` | Crews, Einstellungen und Betriebsplan **des angemeldeten Kontos** |
| Weg schreiben | `PUT /api/pmh/crew` | den Stand dieses Kontos ersetzen (Sitzung **und** CSRF) |
| Panel | `src/index.tsx` → `lib/client.js` | Crews anlegen, Rollen binden, Standard setzen, Projekt, Plan |
| Host | `src/server.ts` | Adapter am Kern-Seam (`crew`), Werkzeuge, Buchung |
| Ablage | `crew_definitionen`, `crew_einstellungen` | Migration `0013_crew.sql` |
| Bündel | `cordis.patch.yml` | eine Zeile, im Plugin-Fenster abschaltbar |

## 2. Sprache — Englisch zuerst, Deutsch danach

Das Panel liest seine Texte über das **Sprachpaket** des Kerns (`ctx.locale`). Englisch ist der
vollständige Katalog; Deutsch ist gegen seine Schlüssel typisiert (`src/locales.ts`) — eine
fehlende Übersetzung ist ein Typfehler und kein stiller Rückfall. Das Panel schickt seine aktive
Sprache mit jeder Anfrage (`?sprache=de`); der Host antwortet **vorgabeweise englisch** — die
Wege, die Prüfbefunde und die Meldungen des Hosts haben eine englische Quellfassung.

| Wo | Woher die Sprache kommt |
|---|---|
| Beschriftungen des Panels | `ctx.locale`, englischer Katalog zuerst |
| Panel → Host | `?sprache=<aktive Sprache>` bei jeder Anfrage |
| Host → Panel | Befunde und Meldungen in der angefragten Sprache (Vorgabe Englisch) |
| Protokoll des Hosts (`stderr`) | deutsch — es gehört dem Betrieb, nicht dem Nutzer |
| Paketbeschreibung, diese README | englisch bzw. deutsch als Übersetzung |

## 3. Die Ablage — warum Datenbank, und was der Rückfall ist

Die Datei war ehrlich („eine Ablage, ein Rechner") und für **ein** Konto richtig. Prometheus ist
mehrbenutzig (`conversation_sessions.user_id`, Migration 0004) — und eine Datei kennt keinen
Eigentümer. Deshalb:

| Fall | Verhalten |
|---|---|
| `DATABASE_URL` gesetzt | Crews und Einstellungen **je Konto**; das Panel schreibt; die Wege verlangen eine Sitzung |
| keine Datenbank | die Datei `<home>/crew/config.json` wird **gelesen**; das Panel zeigt sie, `PUT` antwortet **409** mit Grund und Pfad |

**Die Datei wird nicht geschrieben.** Ein Schreibweg, der eine Datei ohne Eigentümer ändert, wäre
die Nutzertrennung als Behauptung. Wer ohne Datenbank arbeitet, bearbeitet sie von Hand.

**Die Kennung ist global eindeutig.** Sie ist am Kern-Seam zugleich der **Modellname**; zwei Konten
mit derselben Kennung wären zwei Modelle mit demselben Namen. Der zweite `PUT` bekommt **409**
statt zu überschreiben.

## 4. Wer die Modelle bekommt — und wer die Rechnung

Der Kern kennt **eine** Route `crew` und **eine** Modellliste. Der Adapter wird deshalb aus den
Crews **aller aktiven Konten** gebaut. Werkzeuge und Buchung brauchen dagegen **ein** Konto — und
der Kern reicht einem Werkzeug keine Sitzung (`ToolRunContext.agent.id` zeigt heute auf kein
Konto). Die Reihenfolge ist die Entscheidung:

1. `PMH_CREW_NUTZER` (Kennung) — die ausdrückliche Angabe.
2. das **einzige** Konto;
3. der **einzige aktive Verwalter** (die Rolle, die eine Installation führt);
4. sonst: **nur Modelle** (`nurAdapter`) — Werkzeuge und Buchung entfallen, der Grund steht im
   Protokoll und in der Antwort der Route.

Gemessen am 21.10.2026 in diesem Home: **ein** Verwalter, vier weitere Konten → Regel 3 greift,
`[pmh] pmh-crew: eingehaengt — Crew "crew-1", Nutzer "7777…", 4 Werkzeuge, Buchung am llm/stream`.

## 5. Einbau

**Als Bündel (der vorgesehene Weg).** Im Plugin-Fenster „Plugin hinzufügen" → lokales Verzeichnis
`packages/plugin/crew`; danach steht es unter „Installiert" und ist einzeln abschaltbar.

**Von Hand** (dasselbe, was der Plugin-Manager tut):

```jsonc
// <home>/profiles/web/package.json
"dependencies": { "@prometheus-harness/crew": "link:C:/…/packages/plugin/crew" },
"dsh": { "profile": { "bundles": [ …, "@prometheus-harness/crew" ] } }
```

Dann die Verknüpfung (`mklink /J <home>\profiles\web\node_modules\@prometheus-harness\crew <repo>\packages\plugin\crew`)
und den Host neu starten.

**Nicht beides.** Das Paket darf **nicht** zusätzlich in `scripts/profile-patch.mjs` stehen: der
Kern wirft bei doppelter Kennung `(kind, path)`, und der Adapter wirft `DUPLICATE_ADAPTER`, wenn
die Route `crew` zweimal belegt wird. Die Zeile dort ist deshalb **entfernt** und durch die
Begründung ersetzt.

## 6. Prüfen

```powershell
& C:\Users\Chang\.bun\bin\bun.exe test packages/plugin/crew          # 16 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe test packages/crew/crew-store      # 21 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe test packages/crew/crew-plugin      # 19 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/plugin/crew/tsconfig.json                   # exit 0
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/plugin/crew/tsconfig.client.json            # exit 0
& C:\Users\Chang\.bun\bin\bun.exe packages/plugin/crew/build.mjs      # Bündel + Formprüfung
& C:\Users\Chang\.bun\bin\bun.exe run scripts/migrate.mjs             # Fassung 13
```

## 7. Grenzen — gemessen, nicht weggelassen

1. **Der Plan gehört dem Konto, die Werkzeuge dem Betriebskonto.** `crew_plan` schreibt unter
   `<home>/crew/<Betriebsnutzer>/<crew>/<projekt>.json`; das Panel liest den Plan **des
   angemeldeten Kontos**. Sind beide dasselbe (der Normalfall), ist es ein Plan. Bei mehreren
   Konten sieht ein Nicht-Betriebskonto seinen eigenen (leeren) Plan — der Betriebsplan steht im
   Panel unter „Betrieb".
2. **Buchung je Konto ist nicht gebaut.** Der `llm/stream`-Waterfall bucht auf das Betriebskonto;
   welches Konto eine Crew-Anfrage ausgelöst hat, weiß der Kern nicht. Eine Buchung „je Crew" wäre
   möglich (der Adapter kennt die angefragte Crew), sie ist aber **nicht** gebaut.
3. **Die Werkzeuge kennen keine Sitzung.** Sie adressieren **eine** Crew und **ein** Projekt
   (Stand des Betriebskontos). Eine Sitzung, die eine andere Crew wählt, bekommt weiterhin den
   Plan dieses Bereichs — bewusst, weil ein Rateweg schlechter wäre als die benannte Grenze.
4. **Kein Bildteil im eigenen Seam.** Die Rolle `vision` geht über den **Kern**-Adapter wirklich an
   ein Bildmodell; im eigenen Seam (`MessagePart`) gäbe es dafür keinen Platz.
5. **`helper` bleibt wählbar und unbenutzt** — im Harness wie hier.

## 8. Wo die Zahlen herkommen

| Zahl | Befehl |
|---|---|
| 16 Prüfungen des Plugins | `bun test packages/plugin/crew` |
| 21 Prüfungen der Ablage | `bun test packages/crew/crew-store` |
| Fassung 13 | `bun run scripts/migrate.mjs` → „Schema aktualisiert: 1 Migration(en) (13)" |
| Panel im Browser-Roster | `GET /?token=…` enthält `prometheus-harness/crew` (gemessen 21.10.2026) |
| Einhängen im Host | Startprotokoll: `[pmh] pmh-crew: eingehaengt — …` |
