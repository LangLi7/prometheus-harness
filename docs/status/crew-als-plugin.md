# Die Crew ist ein Plugin — 21.10.2026

> **Der Gegenstand in einem Satz.** Die Crew war bis hierher ein **Eintrag ohne Fläche**: Adapter,
> Werkzeuge und Buchung hingen im Host, die Einstellung lag in `<home>/crew/config.json`, und wer sie
> ändern wollte, öffnete einen Editor. Seit dem 21.10.2026 ist sie ein **Bündel** wie Konten,
> Obsidian, Graphify und Verbrauch: Sidebar-Eintrag, Panel, Wege — und die Ablage **je Konto** in
> PostgreSQL, mit der Datei als Rückfall.

## 1. Was gebaut ist

| Teil | Paket / Datei | Nachweis |
|---|---|---|
| Ablage je Konto | `packages/crew/crew-store` (neu, 21 Prüfungen) | `bun test packages/crew/crew-store` |
| Tabelle + Regeln | `packages/auth/db-schema/migrations/0013_crew.sql` | `bun run scripts/migrate.mjs` → „Fassung 13" |
| Plugin (Host + Wege) | `packages/plugin/crew/src/server.ts` | 16 Prüfungen im Paket, 1 im Bau |
| Panel | `packages/plugin/crew/src/index.tsx` → `lib/client.js` | `bun packages/plugin/crew/build.mjs` → „Form: ok" |
| Seitenleiste + Bündel | `cordis.patch.yml`, `dsh.client` | `GET /?token=…` nennt `prometheus-harness/crew` im Roster |
| Nur-Adapter | `crew-plugin`: `nurAdapter` | ohne Betriebskonto: Modelle ja, Werkzeuge nein |
| Sprache | `src/locales.ts`, `?sprache=`, `Sprache` in Adapter und Ablage | **Englisch zuerst, Deutsch danach**; Tests belegen beide Fassungen |

## 2. Die Entscheidungen, die den Ausschlag gaben

1. **Die Datei wird nicht geschrieben.** Sie hat keinen Eigentümer; ein Schreibweg darauf wäre die
   Nutzertrennung als Behauptung. Ohne `DATABASE_URL` antwortet `PUT` mit **409** und dem Pfad.
2. **Die Kennung ist global eindeutig.** Sie ist zugleich der Modellname; der zweite `PUT` bekommt
   **409** statt zu überschreiben.
3. **Ein Weg, nicht vier.** `PUT` ersetzt den ganzen Stand eines Kontos in **einer** Transaktion —
   „diese Liste ist der Stand" heißt: was fehlt, ist gelöscht.
4. **Werkzeuge und Buchung brauchen ein Konto.** Der Kern reicht einem Werkzeug keine Sitzung. Die
   Reihenfolge: `PMH_CREW_NUTZER` → einzige Kennung → **einziger aktiver Verwalter** → sonst
   `nurAdapter` (Modelle ohne Werkzeuge, Grund im Protokoll).
5. **Kein Row Level Security auf den zwei Tabellen.** Der Host baut **einen** Adapter aus den Crews
   **aller** aktiven Konten; eine Bedingung `user_id = current_setting(…)` würde diese Abfrage für
   die Anwendungsrolle **still leer** laufen lassen. Die Grenze ist die Abfrage — jede andere
   trägt das Konto —, und die eine Ausnahme ist als `alleAktiven` benannt.
6. **Englisch ist die erste Sprache, Deutsch die zweite.** Die englische Fassung ist der
   vollständige Katalog (`locales.ts`, die Meldungen des Hosts, die Prüfbefunde von Ablage und
   Adapter); Deutsch ist gegen ihre Schlüssel typisiert bzw. eine vollständige Übersetzung. Die
   Oberfläche schickt ihre aktive Sprache mit (`?sprache=`), der Host antwortet vorgabeweise
   **englisch**. Die Protokollzeilen des Hosts bleiben deutsch — sie gehören dem Betrieb, nicht dem
   Nutzer, und folgen der Konvention des Repos.

## 3. Gemessen im laufenden Host (21.10.2026)

Aufbau: Bundel im Profil (`dsh.profile.bundles`), Verknüpfung im Profil-`node_modules`, eigener
Start auf Port 3198 gegen `.pmh-build/harness-home`.

```
[pmh] pmh-crew: gestartet — Crews je Konto in PostgreSQL, Pläne unter …\harness-home\crew
[pmh] pmh-crew: eingehaengt — Crew "crew-1", Nutzer "77777777-7777-4777-8777-777777777777", 4 Werkzeuge, Buchung am llm/stream
dsh web: http://127.0.0.1:3198/?token=…
```

| Prüfung | Ergebnis |
|---|---|
| `GET /api/pmh/crew` ohne Sitzung | **401** |
| `GET /api/pmh/crew` mit Sitzung (Betreiber-Weg) | **200** — `crew-1`, `standard: crew-1`, Betriebsnutzer `7777…`, `werkzeuge: true` |
| `PUT` mit gültigem Stand | **200**, danach steht im Protokoll ein **zweites** `eingehaengt` (Adapter ersetzt) |
| `PUT` mit unbekannter Rolle (`executer`) | **400** — englisch (Vorgabe): `Crew "x": unknown role "executer" (known: …)`; mit `?sprache=de`: `unbekannte Rolle …` |
| `PUT` ohne CSRF | **403** — `csrf-fehlt` |
| `PUT` mit einer Kennung eines anderen Kontos | **409** — `belegt`, `crewId: crew-9` |
| `GET` ohne Sitzung | **401** — `{"fehler":"http-401","text":"not signed in"}`, mit `?sprache=de` entsprechend deutsch |
| Panel im Browser-Roster | `prometheus-harness/crew` enthalten |
| Migration | „Schema aktualisiert: 1 Migration(en) (13) — jetzt Fassung 13" |
| Abbau | die alte Zeile `pmh-crew-plugin` aus dem Patch entfernt (sonst `DUPLICATE_ADAPTER`) |

**Der Fall, den erst der laufende Host zeigte — zweimal.** `PUT` antwortete zuerst **500** mit
`crew_definitionen_rollen_objekt`. Ursache war nicht die Prüfregel, sondern die **Bindung**: ein
JSON-**Text** (`JSON.stringify`) kommt in einer jsonb-Spalte als jsonb-**Skalar** an — ein zitierter
String ist gültiges JSON. Eine eigene Sonde gegen PostgreSQL (drei Varianten, `jsonb_typeof`
gelesen) belegte: Text ohne Cast → `string`, Text mit `::jsonb` → `string`, **Objekt** → `object`.
Die Ablage bindet seitdem das Objekt; der Test nagelt es fest.

**Vor diesem Lauf stand in der Datei eine Crew (`crew-1`, „Pruef-Crew", Rollen `executor` und
`vision`) mit dem Etikett `nutzer: "operator"`.** Ein Etikett ist keine Kennung; die Übernahme in
die Datenbank geschah deshalb **einmalig von Hand** (`.pmh-build/crew-uebernahme.mjs`) und nannte
das Konto ausdrücklich — nicht das Plugin, das sonst für den Betreiber wählen würde.

## 4. Grenzen — benannt, nicht weggelassen

1. **Buchung je Konto ist nicht gebaut.** Der Waterfall bucht auf das Betriebskonto; welches Konto
   eine Crew-Anfrage ausgelöst hat, weiß der Kern nicht (`ToolRunContext.agent.id` zeigt auf keine
   Kontokennung). Eine Buchung „je Crew" wäre möglich — der Adapter kennt die angefragte Crew —,
   sie ist aber **nicht** gebaut.
2. **Der Plan gehört dem Konto, die Werkzeuge dem Betriebskonto.** Bei mehreren Konten sieht ein
   Nicht-Betriebskonto seinen eigenen (leeren) Plan; der Betriebsplan steht im Panel unter „Betrieb".
3. **Ein Test des alten Plugins war umgebungsabhängig.** `apply(ctx)` ohne Konfiguration las
   `DSH_HOME`; auf einer Maschine mit eingerichteter Datei schlug er fehl, ohne daß sich am Code
   etwas geändert hatte. Er setzt jetzt ein **leeres** Home und stellt es wieder her.

## 5. Prüfbefehle

```powershell
& C:\Users\Chang\.bun\bin\bun.exe test packages/crew packages/plugin/crew   # 156 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/plugin/crew/tsconfig.json          # exit 0  (auch tsconfig.client.json)
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/crew/crew-store/tsconfig.json      # exit 0
& C:\Users\Chang\.bun\bin\bun.exe packages/plugin/crew/build.mjs        # „Form: ok"
```

Die Einzelheiten (warum kein RLS, warum `SET NULL (standard_crew)`, warum die Datei nicht
geschrieben wird) stehen im Kopf der Migration und in `packages/crew/crew-store/src/index.ts`.
