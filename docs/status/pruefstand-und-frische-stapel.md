# Der Prüfstand nach Migration 0008 — und zwei Befunde, die nichts mit ihr zu tun haben

> **Stand:** 14.10.2026 · **Was hier belegt wird:** was meine Migration 0008 im
> Prüfbestand **zerbrochen** hat (vier Dateien), wie es repariert wurde, und **zwei
> Umgebungsbefunde**, die älter sind als diese Migration: ein **frischer Stapel** ist nicht
> lauffähig, und die Haus-Konvention `bun run test` ist auf dieser Maschine **kaputt**.
>
> **Der eine Satz, auf den es ankommt:** die Migration war richtig — die **abgeschriebenen
> Zahlen** in vier Prüfdateien waren es nicht, und sie haben ihre Arbeit getan: sie sind
> **laut** rot geworden, statt still zu lügen.
>
> | Messung | vorher | nachher |
> |---|---|---|
> | Gesamtlauf aus der Wurzel | **1545 pass · 17 fail · 1 error** | **1561 pass · 7 fail · 1 error** |
> | davon **meine** Fehler | **7** | **0** |

---

## 1. Was 0008 zerbrochen hat — vier Dateien, ein Grund

Migration 0008 (`sitzungsprotokoll-und-schreibherrschaft`) fügt **eine Tabelle**
(`session_events`) und **eine Fassung** (7 → 8) hinzu. Vier Prüfdateien trugen die alte
Zahl **abgeschrieben** in sich:

| Datei | abgeschriebene Zahl | gemessene Meldung |
|---|---|---|
| `packages/auth/db-schema/tests/migrate.test.ts` | `toEqual([1..7])`, `SCHEMA_VERSION === 7`, Tabellenliste ohne `session_events` | *Expected: 8 · Received: 7* |
| `packages/auth/db-schema/tests/postgres.test.ts` | `report.applied === [1..7]`, Name „achtzehn Tabellen" | *Expected length: 8 · Received length: 5* (siehe §4) |
| `scripts/schema-stand.test.mjs` | vier Attrappen mit festen `7` | *Expected: 0 · Received: 1* |
| `packages/api/readiness/src/index.ts` | `ERWARTETE_SCHEMAFASSUNG = 7` | *Expected: 8 · Received: 7* |

**Das ist genau die Klasse Fehler, die ich selbst als Regel aufgeschrieben habe** („keine
wachsende Zahl festschreiben, sondern aus der Quelle lesen") — und ich habe sie beim
Hinzufügen der Migration trotzdem gemacht. Der Trost ist gering, der Nutzen groß: die
Prüfungen waren **laut**, nicht still. Die Alternative wäre gewesen, daß `/api/ready` eine
gesunde Datenbank für **nicht bereit** erklärt und niemand es merkt.

## 2. Wie repariert wurde — ableiten statt abschreiben

| Datei | Änderung |
|---|---|
| `migrate.test.ts` | Liste auf `[1..8]`, Name auf „1 bis 8", `session_events` in beide Listen (Schleife **und** Mengenvergleich). Die ausgeschriebene Liste bleibt — sie fängt eine **fehlende** oder **doppelte** Migration, was ein Vergleich gegen `MIGRATIONS` selbst nicht kann |
| `postgres.test.ts` | `report.applied` auf `[1..8]`; der Testname trägt **keine Zahl mehr** (er log „achtzehn", als es zwanzig waren) — stattdessen ein **Mengenvergleich** `expect(tables).toEqual([...erwartet].sort())`: eine fehlende Tabelle fällt durch die Schleife, eine überzählige durch den Vergleich |
| `schema-stand.test.mjs` | `const CODEFASSUNG = zahlAus(process.cwd(), QUELLEN.readiness, /ERWARTETE_SCHEMAFASSUNG = (\d+)/u)` — die Attrappe liest jetzt **dieselbe Quelle** wie das geprüfte Skript. Dazu eine Gegenprobe, daß die Zahl überhaupt lesbar ist (`> 0`): sonst prüften alle vier Fälle gegen `undefined` und der Vergleich wäre leer |
| `readiness/src/index.ts` | `= 8`, und der Kommentar nennt jetzt die **Messung** (`select max(version) from schema_migrations` → **8**) samt der Vorgeschichte: 0006–0008 liefen zuerst nur gegen die Wegwerf-Datenbank, `pmh` blieb auf 5, `/api/ready` meldete das **korrekt** als „5 statt 7" |

**Nachgewiesen, einzeln:**

```
packages/auth/db-schema/tests/migrate.test.ts     →  23 pass · 0 fail · exit 0
scripts/schema-stand.test.mjs                     →  12 pass · 0 fail · exit 0
packages/auth/db-schema/tests/postgres.test.ts    →  16 pass · 0 fail · exit 0   (gegen vorbereitete Wegwerf-DB, §4)
```

## 3. Der frische Stapel ist nicht lauffähig — **gemessen**

Ich habe eine **eigene** Wegwerf-Datenbank angelegt (`pmh_wegwerf`, Eigentümerin
`pmh_owner`) und den zerstörenden Schematest darauf gerichtet. Ergebnis: **11 pass · 5 fail**,
und alle fünf haben **eine** Ursache:

```
MigrationError: Migration 6 (wissensspeicher-dokumente-und-textstuecke) ist gescheitert:
Die Erweiterung "vector" fehlt in dieser Datenbank.
```

**Warum.** Die Migrationen legen das Schema **`pmh` nicht an**, und der Test tut es auch
nicht. Auf einer frischen Datenbank fällt der Suchpfad der Rollen (`pmh, public`) deshalb
still auf `public` zurück — **gemessen: 12 Tabellen landeten in `public`**, und der Test
„`public` bleibt leer" war zu Recht rot. Das Schema und die Erweiterung entstehen
**außerhalb** der Migrationen (`docker/postgres-init/…`, `scripts/install.mjs`) — für den
**Betriebsstapel** ist das geschehen, für einen **frischen** Stapel nicht.

Nach dem Nachholen genau dieser zwei Schritte (nur `CREATE`, kein `DROP`):

```sql
CREATE SCHEMA IF NOT EXISTS pmh AUTHORIZATION pmh_owner;   -- als pmh_admin
CREATE EXTENSION IF NOT EXISTS vector SCHEMA pmh;          -- als pmh_admin
```

…ging derselbe Lauf von **5 fail** auf **1 fail** (die abgeschriebene Liste aus §1) und
danach auf **16 pass · 0 fail**. **Offen bleibt:** `docker/postgres-init/01-extensions.sql`
muß für frische Stapel das Schema **und** die Erweiterung anlegen, und Migration 0006 prüft
bisher nur, **ob** die Erweiterung existiert — nicht, ob sie im **Suchpfad** sichtbar ist.
Das war der Fehler, an dem Migration 0006 zuerst gescheitert ist.

## 4. Der Riegel in `.env`: 5 rote Prüfungen, die **kein** Fehler sind

Im Gesamtlauf aus der Wurzel bleiben 5 Prüfungen rot — sie **brechen ab**, und zwar
absichtlich:

```
ABBRUCH: dieser Test LÖSCHT ALLE TABELLEN und zeigt auf „pmh" — dieselbe Datenbank wie die
Anwendung (DATABASE_URL). Er ist für eine Wegwerf-Datenbank gedacht: setze
PMH_TEST_DATABASE_URL auf eine andere Datenbank.
```

Der Grund steht in `.env`: **`PMH_TEST_DATABASE_URL` zeigt auf `pmh`, die
Betriebsdatenbank** (gemessen: `benutzer=pmh_owner datenbank=pmh`). Die Prüfdatei
`packages/auth/db-schema/tests/postgres.test.ts` dokumentiert in ihrem eigenen Kopf, daß
genau dieser Aufruf am **13.10.2026** die Betriebsdatenbank abgeräumt hat (`auth_events
12 → 0`). Danach wurde der Riegel gebaut — **`.env` wurde nicht geändert.**

**Ich habe `.env` bewußt NICHT geändert.** Die dokumentierte Praxis ist eine
**Übersteuerung je Lauf** (`docs/status/anmeldeseite-und-erstlogin.md` §7, `erstlogin-und-rechte.md:32`).
Und die Änderung hätte einen Preis, den man leicht übersieht: zeigte `.env` auf `pmh_test`,
dann **räumt jeder Wurzel-Lauf `pmh_test` ab** — die Datenbank, auf die drei andere
Statusdokumente ihre Rezepte stützen. Ein Riegel, der laut abbricht, ist besser als eine
Vorgabe, die still aufräumt. **Der Preis ist bekannt:** der Gesamtlauf ist ohne
Übersteuerung **5-fach rot**, und das ist eine Umgebungsentscheidung, kein Defekt.

**Eine eigene Wegwerf-Datenbank statt der gemeinsamen:** `pmh_wegwerf`
(Eigentümerin `pmh_owner`, dazu Schema `pmh` und Erweiterung `vector`). Damit fahre ich
Datenbankprüfungen, ohne die Vorlagen anderer anzufassen.

**Die Falle, die dabei aufgefallen ist — und die man kennen muß.** *Dieselbe* Prüfdatei
verhält sich **je nach Arbeitsverzeichnis** anders, weil **Bun `.env` aus dem
Arbeitsverzeichnis lädt**:

| Aufruf | `PMH_TEST_DATABASE_URL` | Ergebnis |
|---|---|---|
| `bun test tests/postgres.test.ts` **im Paket** | nicht gesetzt (keine `.env` dort) | **0 pass · 16 skip · 0 fail** |
| `bun test packages/auth/db-schema/tests/postgres.test.ts` **aus der Wurzel** | gesetzt (Wurzel-`.env`) | läuft — und **bricht ab** (Riegel) |

Wer einzeln testet, sieht **grün**, was im Gesamtlauf **rot** ist. Beides ist „richtig" —
und genau deshalb ist es gefährlich.

## 5. Die Haus-Konvention `bun run test` ist auf dieser Maschine kaputt — **gemessen**

```
$ bun run test          (in packages/core/scope, einem bestehenden Paket)
Die Version von C:\Users\Chang\AppData\Roaming\npm\node_modules\bun\bin\bun.exe ist mit der
ausgeführten Windows-Version nicht kompatibel.
error: script "test" exited with code 1
```

**Ursache.** Im `PATH` steht `C:\Users\Chang\AppData\Roaming\npm` **vor**
`C:\Users\Chang\.bun\bin`. Ein Skript, das `bun` aufruft, trifft den npm-Shim, und der zeigt
auf eine Bun-Kopie, die auf diesem Windows **nicht startet**. Die lauffähige Fassung ist
**1.4.0** unter `C:\Users\Chang\.bun\bin\bun.exe`.

**Folge:** `"test": "bun test"` — die Haus-Konvention in `package.json` (Wurzel) und in
`packages/core/scope`, `packages/units/unit-export`, `packages/util/atomic-write`,
`packages/util/home-paths`, `snapshots/web` — **läuft hier nicht**. Betroffen ist **jedes**
Paket, nicht nur mein neues. Die Skripte sind nicht falsch, die **Maschine** ist es;
geändert habe ich sie nicht (der `PATH` gehört dem Betreiber).

**Was hilft:** die ausführbare Fassung direkt nennen — `& "$env:USERPROFILE\.bun\bin\bun.exe" test`.

## 6. Was rot bleibt, und wem es gehört

| Prüfung | Anzahl | Wem |
|---|---|---|
| Riegel-Abbrüche (`db-schema/postgres`, `store-postgres/postgres`, `store-postgres/einmaltoken`, `auth-http/postgres`) | **5** | Umgebungsentscheidung (§4) — mit Übersteuerung **alle grün**: 16 · 12 · 7 · 11 pass, je exit 0 |
| `packages/util/atomic-write` („gegen das echte Rust-Binary") | **1** | **fremder** Arbeitsstrang (`native/flock` ist unverfolgt/geändert) |
| `snapshots/web/tests/labels.test.ts` | **0 jetzt** | fremd (`?? snapshots/web/`, kein Git-Verlauf) — **war** 3 rot und ist zwischen zwei meiner Läufe **grün** geworden: der fremde Strang arbeitet daran |
| **meine** | **0** | — |

## 7. Nachfahren

```powershell
$BUN = "$env:USERPROFILE\.bun\bin\bun.exe"     # NICHT 'bun' — siehe §5

# die drei reparierten Prüfungen (ohne Datenbank)
& $BUN test packages/auth/db-schema/tests/migrate.test.ts
& $BUN test scripts/schema-stand.test.mjs
& $BUN test apps/login_web/tests/weiter.test.ts

# die Datenbankprüfungen gegen eine EIGENE Wegwerf-Datenbank
$map = @{}; foreach ($l in (Get-Content .env)) { if ($l -match '^\s*([A-Za-z_]\w*)\s*=') { $k,$v = $l -split '=',2; $map[$k.Trim()] = $v.Trim() } }
$env:PMH_TEST_DATABASE_URL = $map['MIGRATION_DATABASE_URL'] -replace '/pmh(\?|$)','/pmh_wegwerf$1'
& $BUN test packages/auth/db-schema/tests/postgres.test.ts      # 16 pass
& $BUN test packages/auth/store-postgres/tests/postgres.test.ts # 12 pass
& $BUN test packages/auth/store-postgres/tests/einmaltoken.test.ts # 7 pass
& $BUN test packages/api/auth-http/tests/postgres.test.ts       # 11 pass
```

`pmh_wegwerf` muß **einmal** vorbereitet werden (§3): `CREATE DATABASE pmh_wegwerf OWNER
pmh_owner;` dann in dieser Datenbank `CREATE SCHEMA pmh AUTHORIZATION pmh_owner;` und
`CREATE EXTENSION vector SCHEMA pmh;` — beides als `pmh_admin`.
