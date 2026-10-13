# Sicherheitsbefunde der Datenbankschicht — 13.10.2026

**Modus.** Gezielte Prüfung („guidance"), nicht der vollständige sechsphasige Ablauf. Es
wurde **kein** Befundbericht-Verzeichnis angelegt und **keine** Datei außerhalb dieses
Projekts geschrieben. Geprüft wurde die Fläche, die am 13.10.2026 geändert wurde:
Migration `0003`, `auth_sessions`, `conversation_sessions` und die Bereitschaftssonde.

**Quellenstand.** `9e9e35a`, Arbeitsverzeichnis mit fremden unversionierten Änderungen
(`services/pmh-nix`, `native/flock`) — die sind **nicht** Gegenstand dieser Prüfung.

**Was ich nicht getan habe.** Keine Prüfung gegen einen laufenden Dienst, kein
Penetrationstest, keine fremde Infrastruktur. Alle Nachweise sind Lesen von Quelltext und
umschlossene lokale Abfragen gegen den **eigenen** Entwicklungsstapel des Projekts, jede in
einer Transaktion mit `ROLLBACK`. Nachgemessen: nach den beiden Nachweisen standen **0**
Testbenutzer und **0** Sitzungen in der Datenbank.

---

## B-S1 — Die Datenbank erzwingt keine Mandantentrennung an den Verweisen

**Schwere: mittel.** Bestätigt, mit Nachweis. Betrifft `conversation_sessions.parent_session`,
`conversation_sessions.workspace_id` und `chats.workspace_id`.

### Was die Anlage zusichert

Alle elf Tabellen tragen `user_id`. Der Auftrag des Betreibers ist ausdrücklich
**Mandantentrennung**. Die Frage lautet: erzwingt die **Datenbank** sie, oder nur der
Anwendungscode?

### Der Befund

Jeder Fremdschlüssel des Schemas zeigt auf den **Primärschlüssel** der Vaterspalte — nie auf
einen zusammengesetzten Schlüssel, der den Eigentümer mitführt. Gemessen
(`pg_constraint`, Schema `pmh`):

| Tabelle | Fremdschlüssel | Ziel |
|---|---|---|
| `conversation_sessions` | `conversation_sessions_parent_session_fkey` | `conversation_sessions(id)` — **ohne** `user_id` |
| `conversation_sessions` | `conversation_sessions_workspace_id_fkey` | `workspaces(id)` — **ohne** `user_id` |
| `chats` | `chats_workspace_id_fkey` | `workspaces(id)` — **ohne** `user_id` |
| `messages` | `messages_chat_id_fkey` | `chats(id)` — **ohne** `user_id` |

Zusätzlich ist **Row-Level-Security auf allen elf Tabellen aus** — gemessen:
`relrowsecurity = f` und `relforcerowsecurity = f` für jede Tabelle im Schema `pmh`. Es gibt
also **keine** Stelle, an der die Datenbank „gehört dieser Mandant?" fragt.

### Der Nachweis (umschlossen, mit `ROLLBACK`)

Zwei Benutzer, ein Arbeitsbereich von A, dann ein Verweis von B auf A:

```sql
BEGIN;
INSERT INTO users (id, email) VALUES
  ('11111111-…', 'a@example.invalid'), ('22222222-…', 'b@example.invalid');
INSERT INTO workspaces (id, user_id, name) VALUES ('aaaaaaaa-…', '11111111-…', 'A-Raum');

-- B's Sitzung zeigt auf A's Sitzung
INSERT INTO conversation_sessions (id, version, created_at, revision, user_id, parent_session)
VALUES ('sitzung-von-B', 4, now(), 'rev-1', '22222222-…', 'sitzung-von-A');

-- B's Sitzung und B's Chat zeigen auf A's Arbeitsbereich
INSERT INTO conversation_sessions (…, user_id, workspace_id)
VALUES ('B-sitzung', 4, now(), 'rev-1', '22222222-…', 'aaaaaaaa-…');
INSERT INTO chats (id, workspace_id, user_id)
VALUES ('bbbbbbbb-…', 'aaaaaaaa-…', '22222222-…');
ROLLBACK;
```

**Ergebnis: alle drei Einfügungen gelingen.**

```
 FREMDER_ELTERNTEIL AKZEPTIERT | sitzung-von-B | 22222222-… | sitzung-von-A
 FREMDER ARBEITSBEREICH AKZEPTIERT | conversation_sessions | B-sitzung | 22222222-… | aaaaaaaa-…
 FREMDER ARBEITSBEREICH AKZEPTIERT | chats | bbbbbbbb-… | 22222222-… | aaaaaaaa-…
```

Nach dem `ROLLBACK`: `meine_testbenutzer = 0`, `sitzungen = 0`. Kein Rückstand.

### Wer die Grenze überschreitet — und wer sie überschreiten **könnte**

**Ehrlich benannt:** der unmittelbare Schreiber ist die **Anwendung**, und die ist dieselbe
Vertrauensstufe wie die Datenbank. Ich habe **keinen** Angreiferpfad nachgewiesen, der ohne
Anwendungsfehler auskommt. Ein Befund „die Anwendung darf schreiben, was sie schreibt" wäre
kein Sicherheitsbefund.

**Was ihn trotzdem zu einem macht.** Die Anwendung bedient **mehrere Mandanten**. Der
niedriger vertrauenswürdige Beteiligte ist der **Mandant**, nicht die Anwendung. Sobald ein
Fehler in der Anwendung — oder eine SQL-Injektion an irgendeiner Schreibstelle — einen
fremden Verweis erzeugt, ist die Datenbank die **letzte** Stelle, die ihn hätte abweisen
können, und sie weist ihn nicht ab. Der Auftrag nennt Mandantentrennung als Ziel; die
Datenbank trägt dazu heute **nichts** bei, sie verlässt sich vollständig auf den Aufrufer.

**Was daraus folgt — und was nicht belegt ist.** Für `chats.workspace_id` ist die
naheliegende Abfrage eines Arbeitsbereichs „alle Chats dieses Arbeitsbereichs". Träfe sie
allein über `workspace_id` zu, läge B's Chat beim Eigentümer von A auf dem Tisch — ein
**mandantenübergreifendes Lesen**. Diese Abfrage **gibt es heute nicht**: `workspace_id`
kommt im Anwendungscode nur in Testdateien vor (gemessen: 3 Treffer, alle in
`tests/postgres.test.ts` und `tests/migrate.test.ts`). Der Pfad ist damit **nicht
nachgewiesen**, sondern eine Folge, die mit der ersten solchen Abfrage entsteht. Er gehört
als **offen** geführt, nicht als bestätigt.

### Die kleinste wirksame Behebung

Der zusammengesetzte Fremdschlüssel. Er läßt die Datenbank die Zusicherung selbst tragen:

```sql
-- Ein eindeutiger Schlüssel je (id, user_id) macht den Verweis auf den Eigentümer möglich.
CREATE UNIQUE INDEX IF NOT EXISTS conversation_sessions_id_user_key
  ON conversation_sessions (id, user_id);
ALTER TABLE conversation_sessions
  DROP CONSTRAINT conversation_sessions_parent_session_fkey,
  ADD CONSTRAINT conversation_sessions_parent_same_user_fkey
    FOREIGN KEY (parent_session, user_id) REFERENCES conversation_sessions (id, user_id)
    ON DELETE SET NULL;
```

Dasselbe Muster für `conversation_sessions.workspace_id` und `chats.workspace_id` gegen
`workspaces (id, user_id)`, und für `messages.chat_id` gegen `chats (id, user_id)`.

**Was der Test dazu prüfen müßte.** Genau der Ablauf oben, als Prüfung: ein Verweis auf einen
fremden Eigentümer muß **abgewiesen** werden. Heute gelingt er. Eine Prüfung, die nur
„`user_id` ist NOT NULL" feststellt, fängt das nicht.

**Die Grenze dieses Vorschlags — inzwischen nachgemessen, und der Vorschlag scheitert daran.**

Ich hatte hier geschrieben, `ON DELETE SET NULL` auf einem zusammengesetzten Fremdschlüssel
setze **beide** Spalten auf `NULL`, während `user_id` `NOT NULL` ist, und das sei eine offene
Spannung. **Die Aufsicht hat sie gemessen** (`docs/protokoll/aufsicht/hilfen/mandantentrennung-probe.sql`,
Lauf vom 13.10.2026, 16:33, an eigenen Wegwerf-Tabellen in einer Transaktion mit `ROLLBACK`):

| Was die Aufsicht gemessen hat | Ergebnis |
|---|---|
| Weist der zusammengesetzte Verweis den Fremdverweis ab? | **ja** — `violates foreign key constraint "chat_raum_same_user_fkey"`; der eigene Verweis gelingt |
| Was tut `ON DELETE SET NULL` bei `NOT NULL`? | **es ist nicht ausführbar.** PostgreSQL führt das Löschen als `UPDATE ONLY chat SET workspace_id = NULL, user_id = NULL` aus und scheitert an `null value in column "workspace_id" violates not-null constraint` |

**Das trifft beide** vorgeschlagenen Verweise — `chats.workspace_id` **und**
`conversation_sessions.parent_session` —, weil `user_id` in beiden Tabellen `NOT NULL` ist.
Der Weg ist richtig, die **Löschregel** war falsch.

**Die korrigierte Behebung.**

```sql
CREATE UNIQUE INDEX IF NOT EXISTS conversation_sessions_id_user_key
  ON conversation_sessions (id, user_id);
ALTER TABLE conversation_sessions
  DROP CONSTRAINT conversation_sessions_parent_session_fkey,
  ADD CONSTRAINT conversation_sessions_parent_same_user_fkey
    FOREIGN KEY (parent_session, user_id) REFERENCES conversation_sessions (id, user_id)
    ON DELETE NO ACTION;   -- NICHT SET NULL: user_id ist NOT NULL
```

Für dieses Schema spricht `NO ACTION`, weil es **weiche** Löschungen kennt —
`chats.deleted_at` und `workspaces.archived_at`, beide gemessen vorhanden. Wer hart löschen
will, muß vorher entkoppeln. `ON DELETE CASCADE` wäre die andere zulässige Wahl; sie reißt
aber beim Löschen eines Arbeitsbereichs dessen Chats mit, was die weiche Löschung gerade
vermeiden soll.

**Was daran der Lernpunkt ist, ehrlich benannt.** Ich hatte die Spannung **gesehen** und sie
als offene Entwurfsfrage abgelegt, statt sie in fünf Minuten zu messen. Ein Vorschlag, der
nicht ausführbar ist, ist keine Behebung — und „das gehört in die Entwurfsentscheidung" war
hier eine Verschiebung, keine Abwägung. Die Aufsicht hat ihn geprüft und dabei den Fehler
gefunden. Das ist der Zweck einer zweiten Instanz, und sie hat ihn erfüllt.

---

## B-S2 — Migration 0003 benennt eine Bedingung nicht mit um

**Schwere: niedrig.** Bestätigt, mit Nachweis. Reine Benennung; es wird keine Grenze
überschritten.

Migration `0003` begründet selbst, warum Bedingungen mit umbenannt werden müssen:

> „Sie hießen danach `sessions_token_hash_hex` auf einer Tabelle `auth_sessions` — genau die
> Sorte halb umgestellter Name, die den nächsten Leser in die Irre führt."

Drei Prüfregeln und zwei Indizes werden umbenannt. **Zwei Objekte nicht.** Gemessen:

```
 auth_sessions | sessions_user_id_fkey  | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
 auth_sessions | sessions_pkey          | CREATE UNIQUE INDEX sessions_pkey ON pmh.auth_sessions USING btree (id)
```

Die Tabelle heißt `auth_sessions`, ihre Prüfregeln heißen `auth_sessions_*`, zwei ihrer
Indizes heißen `auth_sessions_*` — und ein Fremdschlüssel heißt `sessions_user_id_fkey`,
ein weiterer Index `sessions_pkey`. Das ist genau der halb umgestellte Name, den die
Migration im selben Atemzug beschreibt.

**Der zweite Fund kam durch Nachzählen, nicht durch Hinsehen.** Beim ersten Durchgang hatte
ich nur den Fremdschlüssel bemerkt. Die Liste aller 29 Indizes im Schema zeigte dann
`sessions_pkey` auf `pmh.auth_sessions` — ein Objekt, das die Migration nicht aufzählt und
deshalb übersehen hat. Eine Prüfung, die aufzählt, findet nur, was jemand hingeschrieben hat.

**Kleinste wirksame Behebung.** In einer **neuen** Migration (0003 ist angewandt und
prüfsummengeschützt — sie wird **nicht** geändert):

```sql
ALTER TABLE IF EXISTS auth_sessions
  RENAME CONSTRAINT sessions_user_id_fkey TO auth_sessions_user_id_fkey;
ALTER INDEX IF EXISTS sessions_pkey RENAME TO auth_sessions_pkey;
```

Und eine Prüfung, die über **alle** Bedingungen und Indizes der Tabelle läuft und verlangt,
daß jedes den Präfix `auth_sessions_` trägt — abgeleitet aus `pg_constraint` und
`pg_indexes`, nicht aus einer Aufzählung im Test. Eine aufgezählte Liste hätte beide Funde
nicht gemacht: sie prüft, was jemand hingeschrieben hat.

---

## Was geprüft wurde und **sauber** ist

Damit „kein Befund" nicht wie „nicht geprüft" aussieht:

| Fläche | Befund |
|---|---|
| Migration enthält **nur SQL** (keine `\`-Metabefehle) | ok — die Regel aus dem Fehlschlag vom 13.10.2026 hält |
| `id text` statt uuid auf `conversation_sessions` | ok — keine Annahme über fremde Kennungsformate erzwungen |
| `CHECK` auf `origin` und `delegation_depth >= 0` | ok — beide vorhanden und wirksam |
| Kein Klartext-Geheimnis in `auth_sessions` | ok — nur `token_hash`, `csrf_hash`; 64-Hex-Prüfregeln |
| Teilindizes auf `parent_session`, `workspace_id` | ok — `WHERE … IS NOT NULL`, keine unnötigen Zeilen |
| Bereitschaftssonde `/api/ready` | ok — ohne Anmeldung **401**; die Sonde fragt `select 1`, `schema_migrations`, `pg_tables` mit **Wert**-Übergabe, kein zusammengesetztes SQL |
| Bereitschaftssonde verrät keine Zugangsdaten | ok — `zerlegeRedisAdresse` schneidet Zugangsdaten ab (eigene Prüfung) |
| `SELECT`-Prüfung am Ende von 0003 | harmlos — der Läufer verwirft die Zeilen; keine Ausgabe an einen Benutzer |

---

## Offene Punkte, die eine andere Vertrauensstufe brauchen

* **`needs_validation`** — Erreicht ein mandantenfremder `workspace_id`-Verweis einen
  **Lesepfad**? Belegt werden müßte: eine Abfrage, die allein über `workspace_id` auf
  `chats` oder `conversation_sessions` zugreift, ohne `user_id` im Filter. Existiert heute
  nicht. Prüfbar, sobald die Abfrageschicht steht.
* **`needs_validation`** — Ist der Datenbankbenutzer der Anwendung (`pmh_app`) von einem
  Benutzer mit Schreibzugriff auf `pmh` unterscheidbar, und kann ein Mandant dessen
  Zugangsdaten erlangen? Ohne diese Annahme ist B-S1 eine Integritätslücke, mit ihr eine
  Grenzverletzung. Der Stapel führt getrennte Rollen (`pmh_owner` für DDL, `pmh_app`,
  `pmh_readonly`) — geprüft wurde die **Existenz** der Rollen, nicht ihre Erreichbarkeit
  aus der Anwendung.

## Ein Hinweis auf einen veralteten Stand im Projekt

`docs/review/stack-aufklaerung.md` Zeile 82 sagt: „pgvector **nicht installiert**, Redis
ungenutzt". Nachgemessen am 13.10.2026:

```
 pg_available_extensions: vector 0.8.7 (installed_version 0.8.7)
 pg_extension:           vector 0.8.7   ← angelegt
```

Die Aussage ist **überholt**. Sie steht in einer Prüfung, die als Bestandsaufnahme gelesen
wird — wer ihr glaubt, hält den Vektorweg für versperrt, obwohl er offen ist. Sie gehört
korrigiert (neuer Eintrag, nicht überschreiben).
