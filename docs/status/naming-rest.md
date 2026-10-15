# Regel 42 auf der Dateiebene — der gemessene Restbestand

Stand: 15.10.2026, Commit `9d73a78`. **Die acht Paket-Umbenennungen sind vollzogen** — und dieser
Bericht ist die **Richtigstellung** meiner eigenen Aussage, sie seien damit *durchgesetzt*.

## 0. Die Richtigstellung

In `naming-plan.md` §5 habe ich geschrieben:

> **Regel 42 ist damit auf der Ordner- und Dateiebene durchgesetzt.**

**Das ist falsch, und die Aussage bleibt stehen.** Richtig ist: *die acht **Pakete** sind
umbenannt*. Der Baum hat darüber hinaus **82** Namen, die Regel 42 verletzen. „Durchgesetzt" heißt
nicht „die bekannten acht sind weg", sondern **„der Baum ist sauber"** — und das ist er nicht.

**Warum mir das passiert ist.** Ich habe den Umfang an dem gemessen, was ich schon in der Hand
hatte: den acht Paketen aus dem eigenen Plan. **Ein Plan ist eine Liste von dem, was man schon
weiß.** Der Wächter hat den Umfang dort gemessen, wo niemand hinsieht: bei den Werkzeugen, den
Hilfsdateien, den Attrappen.

## 1. Die Messung

```
bun scripts/naming-guard.mjs        # exit 1
```

Beleg: `docs/status/naming-lauf.txt` — beim Lauf zu diesem Commit **119 Zeilen**, vollständig und
ungefiltert (Regel 13: `Select-Object -First N` tötet den Erzeuger, bevor er seinen Beleg schreibt).
**Die Datei wird bei jedem Aufruf überschrieben**; die datierten Zahlen stehen hier im Text, und
§6 nennt den nächsten Lauf (**115** Zeilen, **80** Verstöße).

| Zahl | Wert |
|---|---|
| geprüfte Namen | **1039** in **7** Wurzeln |
| **Verstöße** | **82** |
| ausgenommen **mit Grund** | **7** (alle in `migrations/`) |
| übersprungene Pfade | 5 (`node_modules`, `.git`, `docs`, `snapshots`, …) |
| Gegenprobe | schmutziger Baum **rot**, sauberer **grün**, Ausnahme **greift** |
| exit | **1** |

**Nach Wurzel:** `scripts` **43** · `packages` **34** · `apps` **4** · `docker` **1**.

**Die zehn größten Posten:**

| Anzahl | Ordner |
|---|---|
| 32 | `scripts/` |
| 11 | `scripts/tests/` |
| 6 | `packages/api/auth-http/src/` |
| 6 | `packages/auth/store-postgres/tests/` |
| 5 | `packages/api/auth-http/tests/` |
| 4 | `packages/auth/db-schema/tests/proben/` |
| 3 | `packages/auth/store-postgres/src/` |
| 2 | `apps/login_web/src/`, `apps/login_web/tests/`, `packages/auth/secrets/{src,tests}/`, `packages/auth/db-schema/tests/` |
| 1 | `docker/rechtprobe.sql`, `packages/util/sprachen/`, `packages/ai/local/tests/lokal.test.ts`, … |

## 2. Was der Wächter prüft — und was NICHT

**Zwei objektive Signale, kein Sprachmodell:**

1. **Nicht-ASCII** (`ü`, `ö`, `ä`, `ß`) im Namen — da ist kein Wörterbuch nötig, und es gibt keine
   Auslegung. Am 15.10.2026: **0** Funde in dieser Art, weil die Verstöße alle schon transliteriert
   sind (`pruefung`, `schluessel`).
2. **Ein Wortstamm aus einer Liste**, verglichen mit dem **ganzen Segment**. Geteilt wird an `-`,
   `_` und `.`.

**Die Grenze, ausgesprochen.** Die Liste ist **gemessen**, aber **nicht vollständig**: ein deutsches
Wort, das nicht in ihr steht, wird **nicht gemeldet**. Der erste Lauf hatte 19 Wörter und meldete
**34** Verstöße; dann wurden alle **254** eindeutigen Dateinamen und **420** Ordnernamen der
geprüften Wurzeln aufgezählt, und die Liste wuchs auf das, was dort **wirklich steht** — daraus
wurden **82**. **Eine Liste aus dem Gedächtnis zählt die Erinnerung, nicht den Baum.**

**Warum ganze Segmente und kein Teilstring.** `standard` enthält `stand`. Ein `includes` machte aus
einem englischen Namen einen deutschen — und der Wächter wäre unglaubwürdig geworden. Dieser Fall
steht als eigene Prüfung in `scripts/tests/naming-guard.test.mjs`.

**Nicht geprüft, absichtlich:**

| Nicht geprüft | Grund |
|---|---|
| **Bezeichner im Code** (`Familie`, `sonde()`, `FAEHIGKEITEN`) | Regel 42 gilt für Ordner und Dateien; deutscher Bezeichner in deutschem Kommentarwerk ist Hausstil |
| **`docs/`** | Dokumentnamen sind Aufsatztitel, keine Moduladressen |
| **Eigennamen** (`obsidian`, `nix`, `whisper`, `sensevoice`) | Fremdnamen sind nicht „deutsch" |

## 3. Die Ausnahme, die eine Ausnahme bleiben muß

**7 Verstöße liegen in `packages/auth/db-schema/migrations/`** und sind **ausgenommen mit Grund**:
`0003_sitzungen_und_gespraeche.sql`, `0004_mandantentrennung.sql`, `0005_benutzerprofile.sql`,
`0006_wissensspeicher.sql`, `0008_sitzungsprotokoll.sql`, `0009_arbeitsbereich-ordner.sql`,
`0010_zusatzordner-zugriff.sql`.

**Der Dateiname IST die Schemaversion.** Diese Migrationen sind auf Datenbanken dieser Maschine
angewandt; ihre Namen stehen in `schema_migrations`. Eine Umbenennung schriebe die aufgezeichnete
Geschichte des Schemas um — **der Schaden wäre größer als der deutsche Name.**

Sie werden **gezählt und genannt**, nicht verschwiegen: eine Ausnahme ohne Zahl ist eine Lücke.
Wer sie schließen will, braucht zuerst eine **Regel für neue Migrationen** (englischer Name,
deutscher Kommentar) — nicht sieben Umbenennungen.

## 4. Warum das jetzt nicht in einem Zug umbenannt wird

**`scripts/` ist der riskanteste Ort im Baum, nicht der bequemste.** Ein Skriptname ist keine
Adresse in einem Import, sondern ein **Text** an vielen Stellen:

* `package.json` (`"check:readme": "bun run scripts/readme-paarung.mjs"`),
* `scripts/*.ps1`, `scripts/*.cmd`, `scripts/*.sh`,
* `.github/workflows/`,
* andere Skripte, die es per `spawn` aufrufen,
* `docs/` (viele Stellen, die es **nennen**),
* und die eigenen Prüfungen unter `scripts/tests/`.

**Werkzeug gegen Werkzeug:** bevor ein Skriptname fällt, braucht es einen **zweiten** Wächter, der
einen Namen nennt, den **kein** Aufrufer mehr kennt (ein toter Verweis) — sonst tauscht man 43
deutsche Namen gegen eine unbekannte Zahl stiller Ausfälle. Der Wächter dafür ist noch nicht
gebaut; **das ist der nächste Schritt**, nicht die 43 Umbenennungen.

**Reihenfolge nach Nutzen und Risiko:**

| Zug | Umfang | Risiko | Warum diese Stelle |
|---|---|---|---|
| ~~1~~ | `packages/util/sprachen` → `languages` | klein | **vollzogen** (§6) — der Prüfstein für den Umbenennungsweg abseits von `scripts/` |
| 2 | `packages/api/auth-http/src` (6) + `tests` (5) | mittel | Nur Importe im eigenen Haus, aber **97 Prüfungen** hängen daran |
| 3 | `packages/auth/store-postgres` (9) — **vollzogen** (§8) · `db-schema/tests` + `fixtures` (7) — **vollzogen** (§9) | mittel | „Attrappen“, „Wurzeln“, „Zerleger“ sind Hausvokabular — die Bedeutung muß mitwandern |
| 4 | `apps/login_web` (4) — **vollzogen** (§10) | klein | Zwei Dateien, je eine Prüfdatei — dazu der **Bau** als Nachweis |
| 5 | `scripts/` (43) | **groß** | Erst **nach** dem Werkzeug für tote Verweise |

## 5. Der Wächter selbst

| Datei | Was sie tut |
|---|---|
| `scripts/naming-guard.mjs` | Der Prüflauf. `exit 0` sauber · **1** Verstoß · **2** der Wächter ist selbst kaputt |
| `scripts/tests/naming-guard.test.mjs` | **13** Prüfungen, **0 rot**: rot wo rot, grün wo grün, und der Baum wird befragt statt der Wächter geglaubt |
| `docs/status/naming-lauf.txt` | Der ungefilterte Beleg — **der jeweils letzte Lauf**, von jedem Aufruf überschrieben. Die datierten Zahlen stehen im Text, nicht in der Datei |

**Die Prüfungen, die den Baum befragen** (und nicht den Wächter):

* die acht **neuen** Ordnernamen **sind** da (`packages/ai/capabilities` …),
* die sechs **alten** Ordnernamen **sind nicht** mehr da (`packages/ai/faehigkeiten` …),
* der Lauf zählt **mehr als 1000** Namen — eine leere Prüfung wäre kein Beweis,
* **jeder** Fund nennt einen Grund — ein Fund ohne Grund ist keine Auskunft.

**Und die eine Prüfung, die keine Erwartung „null" Behauptet:** `verstoesse.length > 0`. Sie hält
fest, daß der Wächter die 82 **findet**. Wenn der Baum sauber wird, muß **diese** Prüfung fallen —
und zwar durch eine Tat, nicht durch ein Nachlassen.

## 6. Zug 1, vollzogen: `packages/util/sprachen` → `packages/util/languages`

Am selben Tag, Commit `HEAD~1`: der kleinste Posten der Reihenfolge — **ein Ordner, vier Dateien,
sieben abhängige Stellen.**

| Schritt | Befehl | Ergebnis |
|---|---|---|
| Wer hängt daran? | `grep 'prometheus-harness/sprachen'` über den Baum | **8 Vorkommen** in 7 Dateien (4 Importe, 2 eigene Modulköpfe, 1 Prosa in `App.tsx`) |
| Umbenennen | `git mv` ×2 | Ordner + `sprachen.test.ts` → `languages.test.ts` |
| Ersetzen | 7 Dateien | `SUMME=8` — Vorkommen **und** Zeilen stimmen überein |
| Gegenprobe | `Select-String 'prometheus-harness/sprachen'` über `apps`, `packages` | **0 Zeilen** |
| Tote Verknüpfung | Junction → `packages\util\sprachen` | entfernt, dann `bun install` exit **0**, *„Removed: 1"*, neu → `packages\util\languages` |
| Tests | `bun test` je Paket | `languages` **14/0** · `auth-http` **97/0** · `login_web` **15/0**, alle exit 0 |
| **Der Wächter bestätigt es** | `bun scripts/naming-guard.mjs` | **82 → 80**, geprüfte Namen **1039 → 1040** — der Wächter folgt der Wirklichkeit, nicht meinem Bericht |

**Warum der letzte Punkt der wichtigste ist.** Daß ein Wächter 82 sagt, beweist nur, daß er **etwas**
sagt. Daß er nach **genau dieser** Umbenennung **80** sagt — und zwar zwei weniger, weil ein Ordner
und eine Prüfdatei ihren Namen gewechselt haben —, das ist der Beweis, daß er **diesen** Verstoß
sieht und nicht bloß eine Zahl ausgibt.

**Was hier NICHT mit umbenannt wurde:** `apps/login_web/src/sprache.ts`, `apps/login_web/tests/sprache.test.ts`,
`packages/api/auth-http/src/anmeldung.ts`, `packages/api/auth-http/tests/anmeldung.test.ts`. Sie
**importieren** jetzt aus `languages`, heißen aber weiter deutsch — sie gehören zu Zug 4 und Zug 2.
**Eine Umbenennung zieht ihre Importe, nicht ihren Nachbarn.**

## 7. Zug 2, vollzogen: `packages/api/auth-http` — 14 Dateien

Sieben Quelldateien und sieben Prüfdateien. **Und drei Namen, die in KEINER Liste standen.**

| heute | englisch |
|---|---|
| `src/anmeldung.ts` | `src/login.ts` |
| `src/claim-ablage.ts` | `src/claim-store.ts` |
| `src/ordner.ts` | `src/folders.ts` |
| `src/rechte.ts` | `src/rights.ts` |
| `src/seite.ts` | `src/page.ts` |
| `src/wege.ts` | `src/paths.ts` |
| `src/zugang.ts` | `src/access.ts` |
| `tests/{anmeldung,erstlogin,http-schicht,ordner,rechte,seite,zugang}.test.ts` | `tests/{login,first-login,http-layer,folders,rights,page,access}.test.ts` |

**Der Befund, der wichtiger ist als die Umbenennung.** `claim-ablage`, `erstlogin` und
`http-schicht` standen **nicht** in der Wortliste des Wächters — er hatte sie nie gesehen. Der
Umfang des Restbestands wächst also mit jedem Zug, weil **jeder Zug Namen sichtbar macht, die vorher
im Rauschen lagen.** Die drei Wörter sind nachgetragen; die Gegenprobe dazu steht als eigene Prüfung
in `naming-guard.test.mjs` (`pruefeName('claim-ablage.ts').segment === 'ablage'`).

| Schritt | Befehl | Ergebnis |
|---|---|---|
| Wer hängt daran? | `grep` über `*.{ts,tsx,js,mjs,json,md,ps1,cmd,sh,yml}` | **86 Zeilen** — davon die meisten **Prosa in datierten Berichten** (bleibt stehen) |
| Umbenennen | `git mv` ×14 | 14 `R`-Zeilen |
| Ersetzen A: im Paket | 19 Dateien | **58** Vorkommen — relative Importe **und** Verweise in Kommentaren |
| Ersetzen B: `scripts/claim.mjs` | 1 Import | **1** |
| Ersetzen C: Adressen außerhalb | 8 Dateien (`apps/login_web`, `packages/client/source-folders`, `packages/util/languages`, `docs/status/anmeldeseite-proxy-sonde.mjs`) | **8** |
| Gegenprobe | `grep` auf `anmeldung.ts\|claim-ablage.ts\|rechte.ts\|seite.ts\|wege.ts\|zugang.ts\|erstlogin.ts\|http-schicht.ts` in **Code** | **kein Treffer** |
| Tests | `PMH_TEST_DATABASE_URL=''` + `bun test packages/api/auth-http` | **97 pass, 0 fail**, 37 skip, exit **0** — **dieselbe Zahl wie vor der Umbenennung** |
| Baum | `bun run scripts/typecheck.mjs` | **37 Pakete grün, 0 rot**, exit 0 |
| Wächter | `bun scripts/naming-guard.mjs` | **80 → 69** |

### Der rote Lauf, den ich NICHT der Umbenennung zuschreibe

`bun test packages/api/auth-http` aus der **Wurzel** ergab zuerst **107 pass, 5 skip, 4 fail**
(exit 1). Alle vier Fehler waren **Haken** (`afterAll`), keine Zusicherung. Gemessen, nicht geraten:

```
PMH_TEST_DATABASE_URL=''  bun test packages/api/auth-http   ->  97 pass, 0 fail, exit 0
                           bun test .../postgres.test.ts    ->  11 Tests, 11 skip
(aus .env gesetzt)         bun test .../postgres.test.ts    ->   2 Tests, 2 fail
```

**Die Ursache:** `PMH_TEST_DATABASE_URL` steht in der Wurzel-`.env`, aber es läuft **kein**
PostgreSQL. `postgres.test.ts` wählt mit `adresseGesetzt(URL_FROM_ENV) ? describe : describe.skip`
nach der **Umgebung**; `folders.test.ts` und `login.test.ts` ebenso (`bereit`). Ist die Variable
gesetzt und die Datenbank tot, bricht das `beforeAll` ab — und der `afterAll` schließt dann einen
Server, den es nie gab: `TypeError: undefined is not an object (evaluating 'server.close')`.

**Warum die Gesamtzahl dabei schwankt** (116 gegen 134): mit gesetzter Variable registriert
`postgres.test.ts` nur **2** Haken statt **11** Tests. Nachgemessen an der Einzeldatei, nicht
geschätzt.

**Das ist nicht meine Umbenennung** (sie ändert Dateinamen, keine Objekte), es ist **alt** — und es
ist **dieselbe Sorte Fehler wie Regel 33**: *ein Riegel, der die Umgebung fragt, ist kein Riegel.*
Er wird als eigener Zug behoben, nicht in diesem.

> **RICHTIGSTELLUNG, in derselben Runde.** Der Absatz darüber nennt als Ursache *„es läuft kein
> PostgreSQL"*. **Das ist falsch, und er bleibt stehen.** Die gemessene Ursache steht in der
> Fehlerzeile selbst, die ich zuerst nur als Rauschen gelesen hatte:
>
> ```
> error: ABBRUCH: dieser Test LÖSCHT ALLE BENUTZER und zeigt auf „pmh" — dieselbe Datenbank wie
> die Anwendung (DATABASE_URL in .env). Er ist für eine Wegwerf-Datenbank gedacht:
> setze PMH_TEST_DATABASE_URL auf eine andere Datenbank.
>   at packages/api/auth-http/tests/postgres.test.ts:154:15
> ```
>
> **`beforeAll` bricht ABSICHTLICH ab** — es ist das **Wegwerf-Netz** aus einer früheren Runde
> (`betriebsdatenbankNamenAusDatei` + `PMH_WEGWERF_BESTAETIGT=1`), und es hat recht: die
> `PMH_TEST_DATABASE_URL` der Wurzel-`.env` zeigt auf **`pmh`**, dieselbe Datenbank wie die
> Anwendung. Der Fehler war nicht der Abbruch, sondern daß ein **zweiter, irreführender** Fehler
> danebenstand: der `afterAll` schloß einen Server, den das abgebrochene `beforeAll` nie gebaut
> hatte. **Der eine echte Befund war unter einem unechten begraben.**

**Behoben und nachgemessen** — der Riegel fragt jetzt den **Gegenstand** statt die Umgebung
(`const s: Server | undefined = server`, `const db: postgres.Sql | undefined = sql`), in vier
Haken (`postgres.test.ts`, `folders.test.ts`, `login.test.ts`, `first-login.test.ts`):| Zustand | vorher | nachher |
|---|---|---|
| `PMH_TEST_DATABASE_URL` wie in `.env` (zeigt auf `pmh`) | **4 fail**, exit 1 | **2 fail**, exit 1 — und beide sind **das Netz**, nicht der Haken |
| `PMH_TEST_DATABASE_URL=''` | 0 fail, 97 pass, 37 skip | unverändert: **0 fail**, 97 pass, 37 skip, exit **0** |

**Die zwei verbleibenden Fehler werden NICHT wegrepariert.** Ein roter Lauf, der „du zeigst auf die
Betriebsdatenbank" sagt, ist die Absicht. Wer ihn grün haben will, setzt `PMH_TEST_DATABASE_URL`
auf eine Wegwerf-Datenbank und `PMH_WEGWERF_BESTAETIGT=1` — das ist der dokumentierte Weg, nicht
ein Nachlassen der Prüfung.

## 8. Zug 3a, vollzogen: `packages/auth/store-postgres` — 9 Dateien

Drei Quelldateien und sechs Prüfdateien. **Die Namen wurden GELESEN, nicht geraten** (Regel 11):
`ordner.ts` sagt in seiner Kopfzeile „Quellordner **ändern**" → `folders.ts`; `wurzeln.ts` heißt dort
„die **Zugriffspfade** eines Arbeitsbereichs" → `roots.ts`; `zerleger.ts` heißt „Text in Stücke, die
in `chunks` passen" → `chunker.ts`, weil der Name nennt, was **herauskommt**.

| heute | englisch | warum |
|---|---|---|
| `src/ordner.ts` | `src/folders.ts` | Quellordner ändern |
| `src/wurzeln.ts` | `src/roots.ts` | die schreibbaren Wurzeln |
| `src/zerleger.ts` | `src/chunker.ts` | es **macht** `chunks` |
| `tests/attrappe.test.ts` | `tests/fake.test.ts` | Gegenstück zu `tests/postgres.test.ts`: dort echt, hier Attrappe |
| `tests/einmaltoken.test.ts` | `tests/one-time-token.test.ts` | |
| `tests/mandant.test.ts` | `tests/tenant.test.ts` | |
| `tests/wissen.test.ts` | `tests/knowledge.test.ts` | |
| `tests/wurzeln.test.ts` | `tests/roots.test.ts` | |
| `tests/zerleger.test.ts` | `tests/chunker.test.ts` | |

| Schritt | Befehl | Ergebnis |
|---|---|---|
| Wer hängt daran? | `grep` über `*.{ts,tsx,mjs,js,json,ps1,cmd,sh,yml}` | **9 Zeilen** — 8 im Paket, 1 in einem Meßwerkzeug |
| Umbenennen | `git mv` ×9 | 9 `R`-Zeilen |
| Ersetzen | Pfadliste **nach** dem `git mv` eingesammelt | **9** Vorkommen im Paket + **1** in `docs/status/messsonden/envelope-cost.mjs` |
| Gegenprobe | `grep` auf die sieben alten Dateinamen in Code | **1 Treffer** — die eingefrorene Sprachbasis, absichtlich |
| Tests | `bun test --cwd packages/auth/store-postgres` | **71 pass, 25 skip, 0 fail**, exit **0** |
| Baum | `bun run scripts/typecheck.mjs` | **37 Pakete grün, 0 rot**, exit 0 |
| Wächter | `bun scripts/naming-guard.mjs` | **69 → 60** — genau **neun** weniger, wie viele Dateien umbenannt wurden |

**Der Beleg, daß die Sprachbasis der Umbenennung FOLGT.** Der Wächter war zuerst rot mit genau
einem Eintrag (`+1 packages/auth/store-postgres/src/folders.ts (0 -> 1)`), und nach `--basis` sah der
Diff so aus:

```
+  "packages/auth/store-postgres/src/folders.ts": 1,
-  "packages/auth/store-postgres/src/ordner.ts": 1,
```

Eine Löschung, eine Einfügung — **die Basis wird vollständig neu geschrieben und verliert dabei den
alten Pfad.** Das war nicht bekannt; jetzt ist es gemessen. Eine Basis, die alte Pfade behielte,
würde bei jeder Umbenennung stillschweigend wachsen.

## 9. Zug 3b, vollzogen: `db-schema/tests` — 7 Namen

Zwei Prüfdateien und der Fixture-Ordner mit vier seiner fünf `.sql`-Dateien. `obsidian.sql` bleibt:
ein **Eigenname** ist nicht deutsch.

| heute | englisch |
|---|---|
| `tests/arbeitsbereich-ordner.test.ts` | `tests/workspace-folders.test.ts` |
| `tests/sitzungsprotokoll.test.ts` | `tests/session-log.test.ts` |
| `tests/proben/` | `tests/fixtures/` |
| `proben/benutzerprofile.sql` | `fixtures/user-profiles.sql` |
| `proben/mandantentrennung.sql` | `fixtures/tenant-isolation.sql` |
| `proben/wissensspeicher.sql` | `fixtures/knowledge-store.sql` |
| `proben/rls-verhalten.sql` | `fixtures/rls-behavior.sql` |

**`behavior`, nicht `behaviour` — nachgesehen, nicht entschieden.** Unsere eigene englische
Übersetzung schreibt es so (`docs/status/uebersetzung/quelle-1.json`: *„Send behavior while busy"*),
und der Upstream-Baum durchgehend ebenso. **Die erste Messung dafür war zu breit** — ein `grep` über
`behaviour|behavior` im ganzen Baum lieferte **250 Treffer und 40 kB Ausgabe**, fast alles
Upstream-Übersetzungen. Die Antwort stand in **einer** Datei unserer eigenen Ausgabe.

**Der Beleg, daß die Abgrenzung gehalten hat** — und das ist der wichtigste Teil dieses Zuges:

```
Gegenprobe: alte Fixture-Namen in Code  ->  3 Treffer, ALLE drei:
  packages/auth/db-schema/src/index.ts:32  import m0004 from '../migrations/0004_mandantentrennung.sql'
  packages/auth/db-schema/src/index.ts:33  import m0005 from '../migrations/0005_benutzerprofile.sql'
  packages/auth/db-schema/src/index.ts:34  import m0006 from '../migrations/0006_wissensspeicher.sql'
```

**Dieselben Wörter, zwei verschiedene Dinge.** `fixtures/user-profiles.sql` wurde ersetzt,
`migrations/0005_benutzerprofile.sql` **nicht** — der Suchbegriff war der **ganze Pfad**, nicht das
Wort. Wäre hier ein Wort ersetzt worden, hätte der Testlauf die **Schemageschichte** umgeschrieben.
**Breit suchen, eng ersetzen** — die Regel hat hier zum ersten Mal einen Schaden verhindert, statt
ihn zu melden.

| Schritt | Befehl | Ergebnis |
|---|---|---|
| Wer hängt daran? | `grep` **auf `packages,apps,scripts`** (nicht auf den ganzen Baum) | **12 Codestellen** in 6 Dateien |
| Umbenennen | `git mv` ×7 | 7 `R`-Zeilen |
| Ersetzen | 11 ganzpfadige Vorkommen + **1** nackter Name in einer Testüberschrift | `SUMME=11`, dann `+1` |
| Gegenprobe | `tests/proben/` in Code | **0** · alte Fixture-Namen: **3**, und zwar die drei Migrationen (Absicht) |
| Tests | `bun test --cwd packages/auth/db-schema` · `--cwd packages/auth/store-postgres` | **23/0** und **71/0**, beide exit **0** (38 bzw. 25 übersprungen: keine Datenbank) |
| Baum | `bun run scripts/typecheck.mjs` | **37 Pakete grün, 0 rot**, exit 0 |
| Wächter | `bun scripts/naming-guard.mjs` | **60 → 54** — sechs, weil `rls-verhalten` in **keiner** Liste stand |

**Zum dritten Mal dasselbe: ein Name, den keine Liste kannte.** `rls-verhalten.sql` fiel nicht dem
Wächter auf, sondern dem **Aufzählen** der Dateien im Fixture-Ordner. Das Wort `verhalten` ist
nachgetragen und hat eine eigene Gegenprobe. **Drei Züge, drei Fälle** — die Wortliste ist keine
Wahrheit über den Baum, sie ist der **Stand** der bisherigen Blicke.

## 10. Zug 4, vollzogen: `apps/login_web` — 4 Namen

| heute | englisch | warum |
|---|---|---|
| `src/sprache.ts` | `src/language.ts` | Die Kopfzeile sagt: *„welche Sprache die Seite zeigt"* |
| `src/weiter.ts` | `src/redirect.ts` | Die Kopfzeile sagt: *„**wohin nach der Anmeldung**"* — und die Datei weist fremde Ziele ab |
| `tests/sprache.test.ts` | `tests/language.test.ts` | |
| `tests/weiter.test.ts` | `tests/redirect.test.ts` | |

**Was NICHT umbenannt wurde, obwohl es deutsch ist — und das ist der Punkt.**

| Vertrag | Wert | Warum er bleibt |
|---|---|---|
| Der Keks | `pmh_sprache` | Ein Keks ist ein **Laufzeitvertrag**. Umbenannt wären alle Anmeldungen stillschweigend abgemeldet |
| Der Abfrageparameter | `ZIEL_PARAMETER = 'weiter'` | Eine **Adresse** in Links. Umbenannt wären verschickte Links kaputt |

**Ein Dateiname ist eine Adresse im Baum; ein Keks und ein Abfrageparameter sind Adressen in der
WIRKUNG.** Regel 42 greift für die erste Sorte. Die zweite Sorte umzubenennen wäre keine
Namensreinheit, sondern ein Ausfall — beide Werte sind nachgemessen und unverändert.

| Schritt | Befehl | Ergebnis |
|---|---|---|
| Wer hängt daran? | `grep` in `apps/login_web` | **8 Stellen** in 6 Dateien (+ 4 Moduladreßzeilen im Paket selbst) |
| Umbenennen | `git mv` ×4 | 4 `R`-Zeilen |
| Ersetzen | 12 Vorkommen, auch `@prometheus-harness/login-web/{sprache,weiter}` | **SUMME=12** |
| Gegenprobe | `sprache.ts\|weiter.ts\|login-web/sprache\|login-web/weiter` in Code | **0 Treffer** |
| Verträge | `Select-String 'pmh_sprache\|ZIEL_PARAMETER'` | **unverändert** |
| Tests | `bun test --cwd apps/login_web` | **15 pass, 0 fail**, exit **0** — dieselbe Zahl wie vorher |
| **Der Bau** | `bun run build` in `apps/login_web` | **exit 0**, *„20 modules transformed"*, *„✓ built in 354ms"*, `dist/assets/index-E3LkHWs_.js` **229,57 kB** (gzip 72,25 kB) |
| Baum | `bun run scripts/typecheck.mjs` | **37 Pakete grün, 0 rot**, exit 0 |
| Wächter | `bun scripts/naming-guard.mjs` | **54 → 50** |

**Warum der Bau hier mehr wert ist als der Typecheck.** Eine Typführung überlebt eine Umbenennung
fast immer: sie prüft **Namen**, nicht **Wege**. Der Bündler geht die **Wege** — `main.tsx` →
`App.tsx` → `redirect.ts`. Gemessen am 15.10.2026 hat der Bau die Umbenennung bestätigt, und zwar
mit einer Zahl (**20 Module**) statt mit einem Haken. Stufe **„komponiert"** aus Regel 2.

## 11. Zug 4b, vollzogen: die letzten sieben außerhalb von `scripts/`

**Damit ist der ganze Baum außer `scripts/` englisch benannt.** Sieben Dateien in vier Paketen und
`docker/`. Die Namen wurden **gelesen, nicht geraten** (Regel 11):

| heute | englisch | warum |
|---|---|---|
| `packages/auth/db-schema/src/betriebsdatenbank.ts` | `src/operational-database.ts` | Kopfzeile: *„**welche Datenbank die Anwendung benutzt**"* |
| `packages/auth/secrets/src/krypto.ts` | `src/crypto.ts` | *„die Kryptographie der Umschlagverschlüsselung"* |
| `packages/auth/secrets/src/schluesselgeber.ts` | `src/key-provider.ts` | *„**Woher** der Hauptschlüssel kommt"* — Datei → Secret → Vault |
| `packages/auth/secrets/tests/krypto.test.ts` | `tests/crypto.test.ts` | |
| `packages/auth/secrets/tests/schluesselkette.test.ts` | `tests/key-chain.test.ts` | |
| `packages/ai/local/tests/lokal.test.ts` | `tests/local.test.ts` | |
| `docker/rechtprobe.sql` | `docker/rights-probe.sql` | *„Rechteprobe: greift das Rechtemodell WIRKLICH?"* |

**Was deutsch bleibt, und warum das kein Zugeständnis ist.** Die **Bezeichner** im Code:
`betriebsdatenbankNamenAusDatei` ist ein **Funktionsname**, `KryptoFehler`, `erzeugeSchluessel`,
`Hauptschluessel` sind **Typen und Konstanten**. Der Auftrag lautet auf **Ordner und Dateien** —
und ein deutscher Bezeichner in deutschem Kommentarwerk ist Hausstil. Ebenso bleiben die
**Notizen** unter `docs/` deutsch benannt: ein Dokumentname ist ein **Aufsatztitel**, keine
Moduladresse.

| Schritt | Befehl | Ergebnis |
|---|---|---|
| Wer hängt daran? | `grep` über `*.{ts,tsx,mjs,js,json,yml,yaml,toml,sql,ps1,cmd,sh,md}` | **33 Zeilen**, davon 13 in Code und 20 in datierten Berichten |
| Umbenennen | `git mv` ×7 | 7 `R`-Zeilen |
| Ersetzen | 16 Dateien | **SUMME=21** — auch zwei **Meßwerkzeuge** und ein SQL-Helfer unter `docs/` |
| Tests | 5 Pakete | db-schema **23/0** · store-postgres **71/0** · auth-http **97/0** · secrets **37/0** · local **20/0** — alle exit **0** |
| Baum | `bun run scripts/typecheck.mjs` | **37 Pakete grün, 0 rot**, exit 0 |
| Namenswächter | `bun scripts/naming-guard.mjs` | **50 → 43** — und die 43 sind **alle** in `scripts/` |
| **Referenzwächter** | `bun scripts/reference-guard.mjs` | Code **48 → 48**, also **kein neuer toter Verweis** |

**Der letzte Punkt ist der Beweis, daß die Lehre aus §4 angekommen ist.** Nach den vier
Umbenennungszügen davor hatte ich jedes Mal *„kein Treffer"* gemeldet und **zehn** Stellen
übersehen. Diesmal lief die Gegenprobe gegen die **Liste der alten Namen** — und der zweite Wächter
bestätigt sie: **die Zahl der toten Verweise im Code ist nicht gestiegen.**
