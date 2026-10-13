# Auth verdrahten — der Speicher hinter der Anmeldung

**Stand:** 13.10.2026 · **Neues Paket:** `packages/auth/store-postgres` · **Prüfungen:** 41 (30 + 11)

Dieses Blatt belegt eine einzige Aussage: **die Regeln der Anmeldung laufen gegen unsere
eigene Datenbank.** Jede Zahl nennt den Befehl, der sie gemessen hat.

---

## 1. Warum das der erste Schritt war

`@prometheus-harness/auth` ist der **Regelkern** der Anmeldung: Argon2id, Sitzungstoken,
CSRF-Paare, Adressnormalisierung, Ratenbegrenzung. 51 Prüfungen lagen dort — und **kein
Stück Code rief sie auf**.

Der Regelkern sagt über sich selbst, warum das so ist und was fehlt:

> *„Es kennt **keine** Datenbank, kein HTTP, kein Cookie und kein Redis. Der Speicher kommt
> als Schnittstelle herein (`UserStore`), das Protokoll entscheidet der Host."*

Dieselbe Bauweise hat `packages/auth/db-schema` (das Schema, 11 Tabellen) und
`packages/auth/claim` + `permissions`. Alle drei sind fertig und **unverdrahtet**. Ein
Regelkern ohne Aufrufer ist eine Behauptung.

**Was fehlte, war genau ein Stück: der Speicher.** `UserStore`, `SessionStore` und
`AuthEventSink` über PostgreSQL.

---

## 2. Die Kette, die jetzt bewiesen ist

Nicht „das Paket lädt", sondern die **ganze Strecke**, jedes Mal mit einem Blick in die
Datenbank:

```
register      → Zeile in `users`, Hash beginnt mit `$argon2id$`, kein Klartext
authenticate  → ok, Benutzerkennung stimmt
createSession → Zeile in `auth_sessions`, dort steht NUR der Token-Hash (64 Zeichen)
verifySession → Sitzung gilt; createdAt ist TEXT, endet auf `Z`
touchSession  → last_seen_at wandert, absolute_expires_at NICHT
rotateSession → altes Token gilt nicht mehr, neues gilt, Kennung bleibt
revokeSession → Token gilt nicht mehr
revokeAll…    → zählt genau die Offenen
```

**Warum das vorher nicht gezeigt werden konnte.** Die Attrappentests des Regelkerns
beweisen die **Regeln**; sie können nicht beweisen, daß die Spaltennamen stimmen, daß
`inet` annimmt was wir schicken, oder daß die Fremdschlüssel greifen. Drei solcher Fehler
hat der Integrationstest gefunden — siehe §4.

---

## 3. Prüfstand

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| Speicher ohne Datenbank | `bun test packages/auth/store-postgres/tests/attrappe.test.ts` | **30 pass / 0 fail**, Exit **0** |
| Speicher gegen echtes PostgreSQL | `bun test packages/auth/store-postgres/tests/postgres.test.ts` | **11 pass / 0 fail**, 70 Zusicherungen, Exit **0** |
| Typsystem, 21 Pakete | `bun scripts/typecheck.mjs` | **21 grün / 0 rot**, 2,3 s, Exit **0** |
| Gesamtsuite, 3 Läufe | `bun test` | **987 pass / 2 fail**, 989 Prüfungen in 36 Dateien |
| Regelkern allein, 6 Läufe | `bun test packages/auth/auth/tests/auth.test.ts` | **73 pass / 0 fail**, jedes Mal |

**Die 2 roten sind nicht unsere** und waren es vorher schon:

| Rot | Grund |
|---|---|
| `apps/cli/tests/flags.test.ts` | fremdes Werk: `typert-loader: 6 typert contributor(s) failed to register` |
| `packages/util/atomic-write` | `Zugriff verweigert (os error 5)` — scheitert identisch ohne unsere Änderung |

Die Gesamtzahl stieg von **946 auf 987** grün: **41** neue Prüfungen, keine bestehende
verloren.

Der Integrationstest läuft gegen die **Wegwerf-Datenbank** `pmh_test` (angelegt in
`docs/status/mandantentrennung.md` §10), weil der Integrationstest des Schemas mit
`DROP TABLE … CASCADE` beginnt (Befund **M-1**). Dieser Test hier räumt **nichts** ab: er
legt seine Benutzer unter der eigenen Adressendung `@storetest.invalid` an und löscht nur
diese wieder — ein Test, der `DROP TABLE` braucht, kann nicht neben einem zweiten laufen.

---

## 4. Die drei Fehler, die erst der echte Server gezeigt hat

Alle drei sind **gemessen**, nicht vermutet. Keiner wäre in einem Attrappentest
aufgefallen, weil keiner etwas mit unseren Regeln zu tun hat — alle drei sitzen in der
Übersetzung.

### 4.1 `inet::text` gibt die Netzmaske mit

| Ausdruck | Ergebnis |
|---|---|
| `('203.0.113.7'::inet)::text` | `203.0.113.7**/32**` |
| `host('203.0.113.7'::inet)` | `203.0.113.7` |
| `('2001:db8::1'::inet)::text` | `2001:db8::1**/128**` |
| `host('2001:db8::1'::inet)` | `2001:db8::1` |

Mein erster Entwurf las die IP mit `::text` und **begründete das falsch**: im Kommentar
stand, so komme „ein schlichter Text" zurück. Die Prüfung wurde rot:

```
Expected: "203.0.113.7"
Received: "203.0.113.7/32"
```

Die Sitzung wurde mit `203.0.113.7` angelegt und kam als `203.0.113.7/32` zurück. Wer das
durchgehen läßt, hat in `SessionRecord.ipFirstSeen` einen Wert, der **nicht gleich** dem
ist, der hineinging — und jede spätere Gegenüberstellung („ist das dieselbe Adresse wie
beim Anlegen?") vergleicht still falsch. Behoben mit `host()`.

### 4.2 Der Parameter wurde nicht kleingeschrieben

Die Abfrage verglich `lower(email) = $1` und reichte die Adresse **wie hereingereicht**
durch. Damit fand `findByEmail('DORA@storetest.invalid')` **nichts**, obwohl die Zeile
`dora@…` in der Tabelle stand — links klein, rechts groß, kein Treffer.

**Bemerkenswert daran:** mein eigener Kommentar an derselben Stelle behauptete, die
Normalisierung gehöre „in den Regelkern, nicht hierher". Das stimmt für die Regel — aber
der Speicher ist eine **öffentliche Schnittstelle**, und eine Abfrage, die nur bei
richtiger Schreibweise des Aufrufers funktioniert, ist eine Falle für den ersten anderen
Aufrufer. Behoben mit `lower(email) = lower($1)` — der Ausdruck ist eine Konstante je
Abfrage, der Index auf `lower(email)` bleibt benutzbar.

### 4.3 Der Migrationsläufer braucht eine andere Schnittstelle

`migrate` verlangt ein `MigrationTarget` mit `exec` **und** `query`; mein Speicher braucht
nur `unsafe`. Der erste Lauf brach ab mit:

```
TypeError: target.exec is not a function.
```

Zwei Schnittstellen bleiben zwei — sie zusammenzulegen hieße, dem Speicher Fähigkeiten zu
geben, die er nicht hat.

---

## 5. Zwei Mängel in **fremden** Paketen, die der Typlauf gefunden hat

### 5.1 `db-schema` ist von außen nicht typisierbar

`packages/auth/db-schema/src/sql.d.ts` trug den Satz: *„Gilt für jeden `.sql`-Import im
Projekt."* **Das ist falsch.** Eine Ambient-Deklaration gilt nur für das Programm, das sie
einschließt; `.d.ts`-Dateien werden nicht importiert und wandern nicht mit. Gemessen:

```
../db-schema/src/index.ts(29,19): error TS2307:
  Cannot find module '../migrations/0001_identitaet.sql' or its corresponding type declarations.
  ← und drei weitere, für jede Migration
```

Der Fehler entsteht **nicht** in `db-schema` (dort ist alles grün), sondern beim Import
aus einem anderen Paket. **Genau deshalb vermeidet `packages/api/readiness` den Import von
`db-schema`** — dort steht als Grund „sechs `TS2307`", also dieselbe Ursache, nur nicht
benannt.

Behoben für dieses Paket (`src/sql.d.ts`), der falsche Satz richtiggestellt.
**Offener Punkt:** die Deklaration gehört an eine gemeinsame Stelle, statt in jedes
importierende Paket kopiert zu werden.

### 5.2 `NewUser` war nicht ausgeführt

```
error TS2305: Module '"@prometheus-harness/auth"' has no exported member 'NewUser'.
```

Die Schnittstelle kommt in der **öffentlichen** Signatur von `UserStore.create` vor. Wer
`UserStore` nachbauen will — und genau das ist dieses Paket —, muß den Parametertyp nennen
können; ohne Ausfuhr muß er ihn abschreiben. Ausgeführt.

---

## 6. Ein unzuverlässiger Test — gefunden, gemessen, behoben

In einem Suite-Lauf wurde eine Prüfung rot, die vorher nie rot war:

```
(fail) Zufall und konstante Zeit > constantTimeEquals ist bei gleicher Länge
       unabhängig von der Position des Fehlers
```

**Was gemessen wurde, um die Ursache zu trennen:**

| Messung | Ergebnis |
|---|---|
| 5 Läufe der Datei **allein** | 73 pass / 0 fail — jedes Mal |
| 3 Läufe der Gesamtsuite danach | 987 pass / 2 fail — nur `atomic-write` |
| 4 Läufe der Gesamtsuite insgesamt | **1** Vorkommen dieser Prüfung |

**Der Befund:** die Prüfung ist **nicht kaputt, sondern unzuverlässig**. Sie verglich
**einen** Zeitmesswert mit einem anderen; Rauschen (JIT, GC, Zeitplanung) **addiert** Zeit
und kann einen einzelnen Wert beliebig nach oben treiben. Sie maß mit einem einzelnen
Lauf, obwohl die Maschine gleichzeitig Docker, PostgreSQL und die Arbeit eines zweiten
Agenten fährt. Meine Änderung war ein `type`-Ausfuhr — zur Laufzeit nicht existent.

**Die Behebung.** Das **Minimum aus sieben Runden** statt eines einzelnen Laufs: gegen
additives Rauschen ist das robust, weil der Wert dadurch nur **größer** werden kann, nie
kleiner. Die Schwelle bleibt bei 3 — eine Umsetzung, die beim ersten Unterschied abbricht,
vergleicht 1 gegen 2000 Zeichen und läge bei einem Verhältnis um 1000. Die Prüfung bleibt
also scharf, sie ist nur nicht mehr zufällig.

| Prüfung | Ergebnis |
|---|---|
| 6 Einzelläufe nach der Behebung | **73 pass / 0 fail**, jedes Mal |
| 3 Gesamtläufe nach der Behebung | **987 pass / 2 fail**, nur `atomic-write` |

**Was das nicht ist: ein Beweis.** Neun saubere Läufe sind mit der Behebung **vereinbar** —
bei einer vorherigen Ausfallrate von etwa 1 zu 4 sagt das wenig. Was sich belastbar sagen
läßt: der **Mechanismus** ist benannt und beseitigt.

---

## 7. Was ich an der Umgebung angefaßt habe — und was nicht

| Sache | Was geschah | Warum |
|---|---|---|
| `node_modules/@prometheus-harness/store-postgres` | **Junction von Hand** angelegt | das neue Paket braucht eine Verknüpfung, damit sein Name auflöst. `bun install` hätte `bun.lock` umgeschrieben — und **an dieser Datei arbeitet ein anderer Agent** |
| `bun.lock` | **nicht angefaßt** | siehe oben. **Folge, die offen benannt gehört:** das Verzeichnis kennt das neue Paket nicht. Ein `bun install` erzeugt es neu; bis dahin ist `bun.lock` gegenüber dem Arbeitsbereich **unvollständig** |
| `packages/auth/db-schema/src/sql.d.ts` | Kommentar richtiggestellt | enthielt eine durch Messung widerlegte Aussage |
| `packages/auth/auth/src/index.ts` | `type NewUser` ausgeführt | fehlte in der öffentlichen Signatur |
| `packages/auth/auth/tests/auth.test.ts` | Zeittest robust gemacht | war unzuverlässig (Befund §6) |
| `native/flock`, `services/pmh-attach`, `services/pmh-nix`, Wurzeldateien | **nicht angefaßt** | fremdes Werk eines anderen Agenten |

---

## 8. Was noch offen ist

| Was | Warum es offen bleibt |
|---|---|
| **B1, zweite Hälfte: die HTTP-Endpunkte im Host** | Der Speicher ist da, die Endpunkte fehlen. Der Kern besitzt `/api` als **Präfix** — gemessen: `match()` sucht **zuerst exakt**, dann längstes Präfix, also **gewinnt** ein exakter POST unter `/api/…` gegen den Kern. Die Route muß ihren `req.method` selbst prüfen, und `register()` **wirft** bei doppeltem Pfad, statt still zu überschreiben |
| **B2** | `claim` (21 Prüfungen) und `permissions` (30 Prüfungen) haben weiterhin keinen Aufrufer |
| **B3** | Migration `0005` `user_profiles`. **Nicht mehr `0004`** — die Nummer ist durch die Mandantentrennung belegt, und eine angewendete Migration wird nie umgeschrieben |
| **Ein gemeinsames Prüfhilfspaket** | die Bedingung „ist eine brauchbare Testadresse gesetzt" steht jetzt in zwei Paketen (Befund M-2 und hier). Zwischen zwei Testordnern gibt es keinen Aufhängepunkt |
| **`bun.lock` regenerieren** | sobald das Werk des anderen Agenten landet |
