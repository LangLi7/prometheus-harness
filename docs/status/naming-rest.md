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
| 3 | `packages/auth/store-postgres` (9), `db-schema/tests/proben` (4) | mittel | „Attrappen“, „Wurzeln“, „Zerleger“ sind Hausvokabular — die Bedeutung muß mitwandern |
| 4 | `apps/login_web` (4) | klein | Zwei Dateien, je eine Prüfdatei |
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
