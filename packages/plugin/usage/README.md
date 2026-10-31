# @prometheus-harness/usage

Usage als **eigenes DSH-Plugin** — und zwar **beweglich**: ein Sidebar-Eintrag **Verbrauch**, ein
Panel im Hauptfeld **und** derselbe Inhalt als **Tab in der rechten Leiste**, wo ihn das Docking-Kit
andocken, schweben, splitten und in der Breite ziehen läßt.

Anlaß (Betreiber, 21.10.2026): *„… namens Usage, dort zeigt es an wie viel budget nutzung ect leider
ist das beim alten gui, ui ux nicht beweglich. das würde ich zb hier auch nutzen das es als skill
oder bzw der harness eine kosten schätzung macht wie viel ein bild generierung kostet."*

## Wo es erscheint

| Ort | Anmeldung | Was der Nutzer sieht |
|---|---|---|
| Seitenleiste (Leiste) | `sidebar.panellist`, `order: 13` | Knopf **Verbrauch**, neben Obsidian und Graphify |
| Hauptfeld | `main`, `key: 'usage'` | das Panel, schließbar über **Schließen** |
| **Rechte Leiste** | Tab-Typ `pmh-usage` im `sidebarRightTabs`, Rumpf in `sidebar.right.pane.tab` | **Guide-Eintrag „Verbrauch"** (Reihenfolge 36) → ein Tab, den das Docking-Kit verwaltet |

Der Tab-Typ ist der Punkt: die rechte Spalte hat **Ziehgriffe**, Tabs, Splits und ein
Schwebe-Panel. Gemessen am 21.10.2026 im Schattenstart sitzt das Panel dort in
`_tabLayout_… › _tabCell_… › _tabHost_… › _paneBody_… › _tabBody_…` — also im Dockkit, mit dem
Chip **„Verbrauch"**, während die Unterhaltung im Mittelfeld stehen bleibt.

## Was das Panel zeigt

| Abschnitt | Inhalt | Quelle |
|---|---|---|
| Kacheln | Heute · 7 Tage · 30 Tage · Gesamt, je mit Anfragen und der Zahl der unbepreisten | `records[].cost` |
| Guthaben | je Schlüssel: Guthaben, Herkunft (eingezahlt − verbraucht), Limitbalken mit Zeitraum — mit Marke **live** oder **Datei** | Anbieter **live**, sonst `balances` |
| Verlauf | 30 Tagesbalken, lückenlos | `records`, nach Tag summiert |
| Teuerste Modelle | Top 8 nach Kosten, mit Familie | `records`, nach `provider/model` summiert |
| „Was kostet ein Bild?" | **10 Modelle** (4 mit Preis, 6 ohne) × Auflösung × Anzahl → USD **mit genannter Grundlage** | Katalog + `GET /api/pmh/usage/schaetzung` |

**Nichts davon rechnet der Browser.** Die Summen entstehen in `src/stand.ts` (ohne Host prüfbar),
die Salden in `src/salden.ts`, der Modellkatalog in `src/katalog.ts`, die Preise in
`@prometheus-harness/usage-ansicht` (eine Wahrheit), die Routen in `src/server.ts`.

## Drei Korrekturen, die der Betreiber angestoßen hat

**1. Das Guthaben war ein drei Tage alter Zwischenspeicher.** *„beim budget stimmt es nicht mehr,
openrouter ist unter 20 dollar, so rund 19.77"* — gemessen: `total_credits 40,49 − total_usage
20,7167` = **19,7733**. Die Datei hatte 20,01. Jetzt wird bei **jedem Öffnen live** gefragt:

| Schlüssel | Weg | Antwort (21.10.2026) |
|---|---|---|
| `OPENROUTER_API_KEY` | `GET /api/v1/credits` + `/api/v1/key` | **19,77 USD** · Limit 5,00 · übrig 4,50 |
| `DEEPSEEK_API_KEY` | `GET /user/balance` | **48,37 USD** (42,38 gewährt + 5,98 aufgeladen) |

Die zweite Zeile ist die größere Korrektur: die Datei nannte **5,98** — nur den aufgeladenen Teil.
Wer damit arbeitet, hält 42 USD für nicht vorhanden. Alle anderen Schlüssel haben keine
Guthaben-API; sie tragen die Marke **Datei** und den Fehler des Anbieters.

**2. Die Auswahl zeigte nur die vier Anker.** *„hmm beim bilder ist es nur das, sollte es nicht mehr
geben?"* — der offene Katalog nennt 468 Modelle, davon **12 mit Bild-Ausgabe** (10 ohne die
`auto`-Weiterleitungen). Die Liste ist jetzt Anker + Katalog: **10 Modelle**, die vier mit Preis
(`gemessen`/`abgeleitet`), die sechs anderen mit **„Preis unbekannt"** — sie stehen drin, weil die
Frage „welche gibt es" eine andere ist als „wofür kenne ich den Preis".

`pricing.image` aus dem Katalog ist **kein** Preis je Bild (meist leer, sonst ein Token-Preis), also
wird daraus nichts gerechnet. `PMH_KATALOG_URL` übersteuert die Adresse (Tests, Rechner ohne Netz).

**3. Die Liste zeigte Namen, nicht Schlüssel.** *„sollte nur für benutzer spezifisch inklusive budget
ect die man zur verfügung hat"* — die Verbrauchsdatei nennt **jeden Namen, der je benutzt wurde**
(14 auf dieser Maschine), hinterlegt sind **zwei**. Elf Zeilen „kein Guthaben genannt" sind keine
Auskunft über die eigenen Schlüssel.

Jetzt entscheidet der **Credential-Speicher**, nicht die Datei: `describe(ref)` sagt, ob ein
Schlüssel hinterlegt ist — **ohne den Wert zu nennen**. Angezeigt wird, was da ist; der Rest wird
**gezählt** („12 × Schlüssel ohne hinterlegten Wert ausgeblendet"), nicht verschwiegen. Ein
unlesbarer Speicher blendet **nicht** aus: eine Zeile zu viel ist ein Ärgernis, eine zu wenig ist
ein verschwiegener Schlüssel. Gemessen im Schattenstart: **2 sichtbare Salden** (beide `live`),
**12 ausgeblendet**.

## Guthaben, Aufladung und Limit sind drei Dinge

*„also diese 50 gesammt summe könnte man doch anderwaltig zeigen … weil es verwiert ob man weiss
was eigentliche budet ist"* (28.10.2026)

Gemeint war die Zeile unter dem OpenRouter-Saldo: `50.49 Credits − 25.3889 verbraucht`. Sie stand
an derselben Stelle wie bei DeepSeek `20.16 gewährt + 5.98 aufgeladen` — aber die beiden Zeilen
sagten Verschiedenes. Bei DeepSeek **erklären** die Teile den Saldo darüber; bei OpenRouter stand
dort die **Lebenszeit-Einzahlung**, aus der der Saldo erst entsteht (50,49 − 25,39 = 25,10). Wer
beides untereinander liest, vergleicht 50,49 mit 20,16 und hält die 50 für ein Geschenk.

Seit dem 28.10.2026 stehen die drei Dinge getrennt:

| Zeile | Was sie sagt | Feld |
|---|---|---|
| **25.10 USD** (Kopf) | Guthaben — was übrig ist | `guthabenUsd` = `total_credits − total_usage` |
| `50.49 eingezahlt − 25.39 verbraucht` | Herkunft des Guthabens, kumuliert über alle Aufladungen | `eingezahltUsd`, `verbrauchtGesamtUsd` |
| `Schlüssellimit (monatlich) · 0.00 / 5.00 USD · 5.00 übrig` | Limit **des Schlüssels**, nicht des Kontos | `limitUsd`, `limitRestUsd`, `limitZeitraum` |

„Credits" heißt jetzt „eingezahlt": `total_credits` ist Geld des Kunden, kein gewährtes Budget.
Der Zeitraum kommt aus `limit_reset` (`daily`/`weekly`/`monthly`) des Schlüssel-Endpunkts — ohne
ihn sieht die Zahl neben dem Guthaben wie ein zweites, widersprüchliches Budget aus. Beide Zahlen
dürfen auseinanderliegen: eingezahlt wird auf das **Konto**, verbraucht wird über **Schlüssel**.
Beide Beträge tragen zwei Nachkommastellen; die vier Stellen von `total_usage` (25,3889) stehen nur
noch in der Antwort selbst.

## Fremde Buchungen, und warum „davon 111,01" falsch war

Zwei Korrekturen vom 21.10.2026, beide vom Betreiber angestoßen.

**1. Fremde Eigner-Kennungen gehören nicht hierher.** Die Datei enthielt eine Buchung
`DEEPSEEK_API_KEY:openalice` (0,23 USD). Sie stammt aus einem **anderen Werkzeug**
(openalice/finance), das dieselbe Datei benutzt — PMH/DSH unterstützt diese Kennung nicht. Solche
Buchungen werden **nicht mitgezählt** und **nicht verschwiegen**: sie erscheinen als eine gezählte
Zeile („2 × Buchungen mit fremder Eigner-Kennung ignoriert"). Gemessen: 111,01 → **110,78 USD**.

**2. „davon hier" war der falsche Zeitraum.** Das Panel zeigte neben dem Guthaben (Stand *jetzt*)
eine Summe **seit Beginn** — 111,01 USD. Das Anbieter-Dashboard zeigt für **30 Tage** 113,17 USD.
Die Zahl war nicht zu hoch, sondern falsch beschriftet: zwei Zeiträume nebeneinander. Jetzt steht
dort **„davon 30 Tage"**, und der Zeitraum wird auch so gerechnet:

| Zeitraum | Verbrauchsdatei | Anbieter-Dashboard | Abweichung |
|---|---|---|---|
| 30 Tage | **103,45 USD** · 41 162 Anfragen | **113,17 USD** · 46 342 Anfragen | −8,6 % · −11 % |
| seit Beginn | 110,98 USD · 42 871 Anfragen | 149,64 USD (Total cost) | −25,8 % |

**Die Datei zählt zu wenig, nicht zu viel.** Sie kennt nur, was der alte Harness gesehen hat;
Aufrufe aus anderen Werkzeugen, Web-Suche-Abrechnungen und die Zeit vor dem ersten Datensatz fehlen.
Deshalb steht im Panel: *„Zahlen aus der Verbrauchsdatei — die Abrechnung des Anbieters kann
abweichen."* Wer eine exakte Abrechnung braucht, liest sie beim Anbieter.

## Team-Schlüssel: geteiltes Guthaben, getrennter Verbrauch

Modell A macht die Trennung strukturell: **ein Host je Nutzer**, eigenes Home, eigener Schlüssel. Für
einen **gemeinsamen** Schlüssel bleibt die Frage, wer was verbraucht hat — und die beantwortet der
Ledger **dieses** Hosts:

| Frage | Antwort |
|---|---|
| Wieviel ist im Team-Topf? | **live beim Anbieter** (Guthaben des Schlüssels) |
| Was habe *ich* verbraucht? | der Ledger dieses Hosts, **letzte 30 Tage** |
| Was hat das Team verbraucht? | Summe der Ledger über die Hosts |

`PMH_GETEILT=OPENROUTER_API_KEY,FREELMAPI_API_KEY` markiert einen Schlüssel als geteilt; dann steht
die Marke **GETEILT** neben dem Guthaben und darunter der eigene 30-Tage-Anteil. Ohne die Markierung
sieht ein geteilter Schlüssel wie ein eigener aus — und das wäre gelogen.

## Geltungsbereich: Host oder Nutzer

Die Schlüssel-Naht des Harness ist **pro Prozess, nicht pro Anfrage** — `resolve(ref)` hat keinen
Nutzer-Parameter, und `credentials-postgres` sagt es selbst: *„Ein Benutzer, nicht viele. Der
Harness ist ein Host-Prozess; ein Modellaufruf trägt keine Prometheus-Sitzung. […] Die per-User-Ablage
gehört in die Prometheus-Oberfläche (`/token`)."*

Deshalb steht die Antwort **mit Geltungsbereich** da (`geltung: { art: 'host', nutzer }`), und das
Panel schreibt ihn in den Fuß: *„Geltungsbereich: dieser Rechner (Schlüssel des Hosts)"* — oder
`chang · dieser Rechner`, wenn `PMH_BENUTZER` gesetzt ist. Ein Panel, das „mein Guthaben" sagt und
das Guthaben des Rechners meint, wäre die unangenehmere Variante.

**Echte Trennung braucht eine Entscheidung:** *ein Host je Nutzer* (der Provider nimmt `benutzer`;
eigene Instanz, eigenes Home — dann ist fremder Verbrauch **strukturell** unerreichbar) **oder** eine
nutzerbewusste Route über die Prometheus-Sitzung (dann muß `auth-http` einen Dienst anbieten). Der
Ledger des alten Harness hat kein Nutzerfeld — rückwirkend ist er nicht teilbar.

## Warum eine fremde Datei gelesen wird

Die Verbrauchsdatei gehört dem alten Harness (`$DSH_HOME/usage-budget/usage.json`, auf dieser
Maschine `C:\Users\Chang\.dsh\usage-budget\usage.json`: 6,3 MB, **19 287** Datensätze, 14 Schlüssel).
Sie ist die einzige Quelle im Haus, die „wieviel ist noch übrig" **und** „was hat der Monat gekostet"
beantwortet, ohne einen Schlüssel zu benutzen — und genau das war das alte Usage.

Gelesen, **nie geschrieben**: zwei Schreiber auf einer Datei sind ein Wettlauf, den keiner gewinnt.

## Routen

| Weg | Methode | Antwort |
|---|---|---|
| `/api/pmh/usage/status` (`?frisch=1` übergeht den Katalog-Zwischenspeicher) | GET | Stand: `datei`, `salden` (mit `quelle`), `fenster`, `jeTag`, `jeModell`, `schaetzung.modelle/stufen`, `katalog` |
| `/api/pmh/usage/schaetzung?modell=…&aufloesung=…&anzahl=…` | GET | `{ modell, anzahl, aufloesung?, schaetzung: { usd?, grund } }` |

Beide sind gesperrt: ohne Anmeldung **401**, ohne Verbindungsdienst **503**. Eine Ausgabenanzeige,
die jeder im Netz lesen kann, wäre eine Einladung.

Der **Stand** geht dafür ins Netz (OpenRouter, DeepSeek, Katalog); er kommt mit Marken je Saldo
zurück, damit „live" und „aus der Datei" nicht verwechselt werden.

`anzahl` muß eine ganze Zahl von 1 bis 10 sein, `aufloesung` eine der Stufen `512`, `768`, `1K`,
`1.5K`, `2K`, `4K`. Ein unbekannter Wert ist **400** — kein stiller Rückfall auf die Ankerfläche.

## Suchpfad der Datei

1. `PMH_USAGE_DATEI`, wenn gesetzt — **dann ist das der einzige Kandidat** (kein stiller Rückfall)
2. `$DSH_HOME/usage-budget/usage.json`
3. `~/.dsh/usage-budget/usage.json`

Welche Datei benutzt wurde, steht im Panel („Quelle") und in der Antwort (`datei`).

## Installieren

```powershell
bun run packages/plugin/usage/build.mjs
```

Dann im Plugin-Manager den Pfad `C:\Users\Chang\prometheus-harness\packages\plugin\usage`
installieren — oder das Profil direkt eintragen:

```jsonc
// .pmh-build/harness-home/profiles/web/package.json
"dependencies": { "@prometheus-harness/usage": "link:C:/Users/Chang/prometheus-harness/packages/plugin/usage" },
"dsh": { "profile": { "bundles": [ /* … */ "@prometheus-harness/usage" ] } }
```

Das Paket ist **Bündel und Plugin zugleich**:

- `dsh.bundle.patch` → `cordis.patch.yml` fügt die Zeile `pmh-usage` ein
- `dsh.client` → `lib/client.js` registriert `main:usage`, `sidebar.panellist:usage` und den Tab-Typ
- `main`/`exports["."]` → `src/server.ts` (die Host-Hälfte)

**Entweder Bündel oder `scripts/profile-patch.mjs` — nie beides.** Der Core wirft bei doppeltem
`(kind, path)`, und der Host startet dann nicht.

## Fünf Fallen, die der Schattenstart aufgedeckt hat

1. **Ein relativer `.ts`-Import aus einer `.js`-Datei lädt nicht.** Mit `lib/index.js` →
   `'../src/server.ts'` meldete der Loader nur „failed to import" — ohne Fiber, ohne Ursache. Der
   Einstieg ist jetzt `src/server.ts`, wie bei `usage-ansicht` und `world-obsidian-provider`.
2. **Der Plugin-Name muß eindeutig sein.** `usage-ansicht` exportiert bereits `name = 'pmh-usage'`;
   zwei Pakete mit demselben Namen sind kein Duplikat, sondern ein toter Eintrag. Der Name ist
   deshalb **`pmh-usage-panel`**.
3. **Ein Dienst, den es beim `apply` noch nicht gibt, ist ein stiller Ausfall.** Mit
   `ctx.get('sidebarRightTabs')` kam `undefined` zurück (dieses Bundle lud vor `ui-sidebar-right`) —
   der Guide-Eintrag fehlte, ohne eine einzige Fehlermeldung. Der Dienst steht jetzt im `inject`;
   die Reihenfolge löst der Loader.
4. **Das alte `usage-ansicht` war im Host tot.** `tool "ai_usage" must declare output { schema,
   render }` — die Registrierung warf beim Einhängen und nahm die **ganze Datei** mit, also auch
   `/verbrauch` und `/api/ai/usage`. Behoben: das Werkzeug geht jetzt über die Brücke
   `alsKernWerkzeug` aus `ai-capabilities`.
5. **`schluesselquelle` kennt keinen Ref.** Die Funktion aus `ai-capabilities` löst immer denselben
   Umweltschlüssel auf; als `(ref) => …` ist sie typkompatibel und hätte **still den
   OpenRouter-Schlüssel an DeepSeek** geschickt. `schluesselAusContext` in `src/salden.ts` beachtet
   den Namen — und ein Test prüft die `authorization`-Kopfzeile je Anbieter.

## Zwei tsconfigs — und warum

| Datei | Hälfte | `lib` |
|---|---|---|
| `tsconfig.json` | Host (`stand.ts`, `server.ts`) und Tests | nur `ES2022` |
| `tsconfig.client.json` | Panel (`index.tsx`) | `ES2022` + `DOM` |

Das Panel braucht `DOM`, die Anbieterkette hinter `usage-ansicht` verträgt es nicht (sie stolpert
über `Blob`/`Uint8Array`). Zwei Hälften, zwei Projekte — statt einen Cast in fremden Code zu
schreiben, der beim nächsten Aufräumen verschwindet.

## Geprüft

- **57 Tests** grün (`bun test packages/plugin/usage`): Fenster, Tagesreihe, Modelle, Guthaben,
  Randfälle, Suchpfade, beide Routen inklusive 401/503/400, die **Browser-Hälfte ausgeführt** gegen
  einen Fake-Client (vier Slots, Tab-Typ mit Guide, Stil-Lebenszyklus), die **Saldo-Rechnung**
  (19,7733; 48,49 statt 5,98; die richtige `authorization` je Anbieter), der **Katalog** (Filter,
  Zwischenspeicher, Fehler), der **Geltungsbereich** und die **Ausblendung** nicht hinterlegter
  Schlüssel.
- `bun run typecheck` in diesem Paket: **beide** Projekte exit 0; im ganzen Baum 75 Pakete grün.
- `bun run packages/plugin/usage/build.mjs`: Bündel 38,2 KB, Selbstprüfung meldet Kennung,
  `inject: ["slots","locale","layout","sidebarRightTabs"]` und `Panel: usage`.
- **Schattenstart** (zweite Instanz, eigenes Home, Port 3131/3232/3333/3434/3535/3636, Profil nur
  verlinkt — der laufende Host auf 3080 blieb unberührt): Host startet ohne „startup failed";
  `/api/pmh/usage/status` antwortet **200**; das Panel zeigt **OPENROUTER live 19,77 USD**,
  **DEEPSEEK live 48,37 USD** (42,38 gewährt + 5,98 aufgeladen), alle übrigen mit Marke **Datei**;
  **7 Tage 13,07 USD · 30 Tage 103,68 USD · Gesamt 111,21 USD / 42 908 Anfragen**, 30 Tagesbalken,
  Top-Modelle (`deepseek-flash` 82,15 USD); die Auswahl listet **10 Bildmodelle** (4 mit Preis,
  6 „Preis unbekannt"); derselbe Inhalt als Tab in der rechten Leiste (Chip „Verbrauch").

**Nicht geprüft:** ein Bildschirmfoto. `Page.captureScreenshot` läuft in diesem Headless-Build in
einen Timeout (auch über rohes CDP) — die Belege oben sind deshalb DOM- und Textmessungen.
