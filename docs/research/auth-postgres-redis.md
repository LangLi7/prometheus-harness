# Belegte Recherche: PostgreSQL-Speicher & Redis für ein selbstgebautes Agenten-Harness

**Kontext der Zielarchitektur:** TypeScript/Bun, PostgreSQL, Redis, Web-UI in React, Windows-Dev / Linux-Prod.
**Themen:** A) PostgreSQL-Speicher (Schema, Indizes, Paginierung, lange Chats, Volltextsuche, Anti-Patterns, Pooling/Isolation) — B) Redis (Einsatzzwecke, Persistenz, Eviction, Pub/Sub vs. Streams, Rate-Limiting, Cluster/HA).

## Methodik und Belegdisziplin

- **Jede** Aussage in diesem Bericht ist entweder (a) mit einer echten, gelesenen URL + wörtlichem Kurzzitat belegt, (b) als **Schlussfolgerung** aus belegten Doku-Mechanismen markiert, oder (c) ausdrücklich als **nicht belegt** gekennzeichnet.
- Es wurden keine Quellen, Zahlen, Zitate oder URLs erfunden. Wo ich eine Zahl nenne, stammt sie wörtlich aus der zitierten Seite.
- **Gelesen** bedeutet hier: die Seite wurde per Scraper vollständig abgerufen und ihr Text ausgewertet. Bei zwei Quellen (Redis-Glossar/Tutorial) ist unten ausdrücklich vermerkt, dass nur ein Suchmaschinen-Auszug mit Originaltext vorlag, kein vollständiger Abruf.
- **Dokumentstand (aus den Seiten-Metadaten selbst):** Die PostgreSQL-Doku unter `/docs/current/` ist zum Abrufzeitpunkt **PostgreSQL 18.6**; die Seiten tragen `article:published_time: 2026-08-13`. Auf denselben Seiten wurde ein News-Banner „September 24, 2026: PostgreSQL 19 Beta 4 Released!“ ausgeliefert. Die Redis-Doku-Seiten trugen `dateModified`-Werte zwischen **2026-09-11 und 2026-09-30** (Hugo-Generator). Damit ist „Stand 2025/2026“ erfüllt; die Versionsangaben sind aus den Seiten selbst, nicht geschätzt.
- **Versionsangaben in Redis-Doku** werden von der Doku selbst datiert: `XDELEX` „Starting with Redis 8.2“, LRM-Eviction „Starting with Redis 8.6“, die `BACKUP`-Familie „Since Redis 8.10.0“, Multi-Part-AOF „Since Redis 7.0.0“, Sharded Pub/Sub „Redis 7.0 and later“.

---

# TEIL A — PostgreSQL

## A.1 Schema-Modellierung: users, sessions, tenants, workspaces, chats, messages

### A.1.1 Empfehlung

- **Mandantentrennung zuerst modellieren.** Die Postgres-Doku benutzt genau dieses Muster (`tenants` → `users` → `posts`) als Beispiel für fortgeschrittene Fremdschlüssel. Empfehlung: `tenant_id` in **jeder** mandantenbezogenen Tabelle als Teil eines zusammengesetzten Primärschlüssels, damit Mandantenzugehörigkeit nicht nur eine Konvention, sondern eine Constraint ist.
- **`ON DELETE`-Semantik nach Abhängigkeit, nicht nach Bequemlichkeit wählen:**
  - Echte Komposition (Kind kann ohne Parent nicht existieren): `ON DELETE CASCADE`. Für das Harness: `messages` → `chats`, `chats` → `workspaces`, `workspaces` → `tenants`, `sessions` → `users`.
  - Unabhängige Objekte: `RESTRICT` (oder `NO ACTION`).
  - Optionale Beziehung: `SET NULL` **mit Spaltenliste**, sonst wird die Mandantenspalte mitgenullt und der PK bricht.
- **Fremdschlüsselspalten immer explizit indizieren** — Postgres tut das *nicht* automatisch, obwohl ein `DELETE` auf der referenzierten Seite sonst die referenzierende Tabelle sequenziell scannen muss.
- **`NOT NULL` als Default annehmen**, nicht als Ausnahme.
- **`timestamptz` für alles Zeitliche**, UTC intern.

### A.1.2 Belege

`https://www.postgresql.org/docs/current/ddl-constraints.html`

- Default-Verhalten: „The default `ON DELETE` action is `ON DELETE NO ACTION`; this does not need to be specified.“
- Unterschied `RESTRICT`/`NO ACTION`: „`RESTRICT` is a stricter setting than `NO ACTION`. It prevents deletion of a referenced row. `RESTRICT` does not allow the check to be deferred until later in the transaction.“
- `CASCADE`: „`CASCADE` specifies that when a referenced row is deleted, row(s) referencing it should be automatically deleted as well.“
- **Die zentrale Fallstrick-Warnung:** „Note that these do not excuse you from observing any constraints. For example, if an action specifies `SET DEFAULT` but the default value would not satisfy the foreign key constraint, the operation will fail.“
- **Auswahlempfehlung der Doku:** „The appropriate choice of `ON DELETE` action depends on what kinds of objects the related tables represent. When the referencing table represents something that is a component of what is represented by the referenced table and cannot exist independently, then `CASCADE` could be appropriate. If the two tables represent independent objects, then `RESTRICT` or `NO ACTION` is more appropriate.“
- **Genau der Mandanten-Fallstrick, wörtlich aus der Doku:** „Without the specification of the column, the foreign key would also set the column `tenant_id` to null, but that column is still required as part of the primary key.“ (Das Beispiel der Doku ist wortgleich `tenants`/`users`/`posts` mit `FOREIGN KEY (tenant_id, author_id) REFERENCES users ON DELETE SET NULL (author_id)`.)
- **Fehlender Index auf der Kindseite:** „Since a `DELETE` of a row from the referenced table or an `UPDATE` of a referenced column will require a scan of the referencing table for rows matching the old value, it is often a good idea to index the referencing columns too. Because this is not always needed, and there are many choices available on how to index, the declaration of a foreign key constraint does not automatically create an index on the referencing columns.“
- `NOT NULL`: „In most database designs the majority of columns should be marked not null.“ Und: „A not-null constraint is functionally equivalent to creating a check constraint `CHECK (column_name IS NOT NULL)`, but in PostgreSQL creating an explicit not-null constraint is more efficient.“
- Zeitstempel: „All timezone-aware dates and times are stored internally in UTC. They are converted to local time in the zone specified by the `TimeZone` configuration parameter before being displayed to the client.“ — `https://www.postgresql.org/docs/current/datatype-datetime.html`
- Gefährliche Typ-Konvertierung: „PostgreSQL never examines the content of a literal string before determining its type, and therefore will treat both of the above as `timestamp without time zone`.“ (Ein String mit `+02` wird also **nicht** automatisch zu `timestamptz`.) — ebd.

### A.1.3 Was dagegen spricht / Unsicherheiten

- **`ON DELETE CASCADE` über viele Ebenen** (tenants → workspaces → chats → messages) kann bei einem versehentlichen `DELETE FROM tenants WHERE id = …` eine sehr große, transaktionale Löschwelle auslösen. Die Doku dokumentiert das Verhalten, bewertet es aber nicht als Risiko — das ist meine Risikoeinschätzung, keine Doku-Aussage.
- **Selbstreferenzieller FK** (z. B. `messages.parent_message_id` für Threads/Branching) ist dokumentiert („this is called a *self-referential* foreign key“), aber die Doku gibt **keine** Empfehlung zu Löschtiefen oder `ON DELETE`-Wahl bei Selbstreferenz. → im Dokument nicht bewertet.
- **Partitionierung kollidiert mit FK/Unique:** Auf partitionierten Tabellen „the constraint's columns must include all of the partition key columns“ (siehe A.4). Wenn `messages` später nach Zeit partitioniert werden soll, muss der Primärschlüssel die Partitionsspalte enthalten — das ist eine **früh** zu treffende Designentscheidung.
- **RLS (Row Level Security)** wäre der zweite Weg zur Mandantentrennung; die Doku-Seite `ddl-constraints.html` behandelt das nicht. Ich habe die RLS-Doku **nicht gelesen** → hierzu **nicht belegt**.

---

## A.2 Indizes für `(tenant_id, created_at)`-artige Zugriffe

### A.2.1 Empfehlung

- **Ein zusammengesetzter B-Tree-Index `(tenant_id, created_at DESC, id DESC)`** ist das Arbeitstier für Chat-/Message-Listen. Spaltenreihenfolge: Mandant zuerst (Gleichheitsbedingung), dann Zeit, dann ein eindeutiger Tiebreaker.
- **Reihenfolge nach der „Leading-Column“-Regel** wählen, nicht nach Bauchgefühl.
- **Teilindizes (partial index) nur für echte Sonderfälle** — z. B. „nur ungelesene Nachrichten“ oder „nur aktive Sessions“. **Nicht** als Ersatz für Partitionierung.
- **Index-only scans** durch `INCLUDE` gezielt ermöglichen (z. B. `INCLUDE (role, content_preview)`), aber **konservativ** und nur auf langsam mutierenden Tabellen.
- **Nicht mehr als ~3 Spalten** indizieren.

### A.2.2 Belege

`https://www.postgresql.org/docs/current/indexes-multicolumn.html`

- **Die Kernregel:** „A multicolumn B-tree index can be used with query conditions that involve any subset of the index's columns, but the index is most efficient when there are constraints on the leading (leftmost) columns. The exact rule is that equality constraints on leading columns, plus any inequality constraints on the first column that does not have an equality constraint, will always be used to limit the portion of the index that is scanned.“
- **Obergrenze:** „Indexes can have up to 32 columns, including `INCLUDE` columns.“
- **Warnung gegen Index-Breite:** „Multicolumn indexes should be used sparingly. In most situations, an index on a single column is sufficient and saves space and time. Indexes with more than three columns are unlikely to be helpful unless the usage of the table is extremely stylized.“
- **„Skip scan“ (PG18)** relativiert die linke-Präfix-Regel in engen Fällen: „If a B-tree index scan can apply the skip scan optimization effectively, it will apply every column constraint when navigating through the index via repeated index searches.“ Die Doku schränkt aber selbst ein: „If there are many distinct `x` values, then the entire index will have to be scanned, so in most cases the planner will prefer a sequential table scan over using the index.“ → Für `tenant_id` mit vielen Mandanten ist Skip-Scan **kein** Ersatz für die richtige Spaltenreihenfolge.

`https://www.postgresql.org/docs/current/indexes-partial.html`

- Zweck: „A *partial index* is an index built over a subset of a table; the subset is defined by a conditional expression“. Nutzen: „One major reason for using a partial index is to avoid indexing common values.“
- **Prädikat muss im Query-Text erkennbar sein:** „a partial index can be used in a query only if the system can recognize that the `WHERE` condition of the query mathematically implies the predicate of the index.“ Und: „As a result, parameterized query clauses do not work with a partial index.“
- **Ausdrückliche Anti-Pattern-Warnung mit Beispielname:** „Example 11.4. Do Not Use Partial Indexes as a Substitute for Partitioning“ — „This is a bad idea! Almost certainly, you'll be better off with a single non-partial index, declared like `CREATE INDEX mytable_cat_data ON mytable (category, data);` (Put the category column first, for the reasons described in Section 11.3.)“

`https://www.postgresql.org/docs/current/indexes-index-only-scans.html`

- Voraussetzungen: „The index type must support index-only scans. B-tree indexes always do.“ Und: „The query must reference only columns stored in the index.“
- **Wann es *nichts* bringt:** „In short, while an index-only scan is possible given the two fundamental requirements, it will be a win only if a significant fraction of the table's heap pages have their all-visible map bits set.“
- **Warnung zu `INCLUDE`:** „It's wise to be conservative about adding non-key payload columns to an index, especially wide columns. If an index tuple exceeds the maximum size allowed for the index type, data insertion will fail.“ Und: „And remember that there is little point in including payload columns in an index unless the table changes slowly enough that an index-only scan is likely to not need to access the heap.“
- **GIN kann es nicht:** „As a counterexample, GIN indexes cannot support index-only scans because each index entry typically holds only part of the original data value.“

`https://www.postgresql.org/docs/current/routine-vacuuming.html` (Zusammenspiel mit VACUUM)

- „Second, it allows PostgreSQL to answer some queries using only the index, without reference to the underlying table. […] An *index-only scan*, on the other hand, checks the visibility map first. If it's known that all tuples on the page are visible, the heap fetch can be skipped.“

### A.2.3 Was dagegen spricht / Unsicherheiten

- **Indexanzahl ist ein Schreibkosten-Multiplikator.** Jeder zusätzliche Index muss bei jedem `INSERT`/`UPDATE` mitgepflegt werden und kann HOT-Updates verhindern (siehe A.4.4). Die Doku benennt den Trade-off („saves space and time“ vs. Nutzen), quantifiziert ihn aber nicht.
- **`created_at DESC` vs. `created_at`:** Die Doku erwähnt in `indexes-multicolumn.html` keine `DESC`-Spezifikation; die relevante Doku-Seite wäre `indexes-ordering.html` (in den Querverweisen verlinkt als „11.4. Indexes and `ORDER BY`“), die ich **nicht gelesen** habe → Aussage zur Richtungsspezifikation ist hier **nicht belegt**.
- **`tenant_id` als führende Spalte** funktioniert nur, wenn jede Query den Mandanten filtert. Bei mandantenübergreifenden Admin-Queries ist der Index nutzlos. Die Doku sagt dazu nichts; das ist eine Architektur-Entscheidung.
- **Konkrete Messwerte** (Indexgrößen, Laufzeiten, Cache-Hit-Ratios) für dein Datenvolumen lassen sich aus Doku nicht ableiten — die Doku liefert Mechanismen, keine Benchmarks. Alle Leistungsaussagen in diesem Abschnitt sind qualitativ.

---

## A.3 Paginierung: Keyset/Cursor vs. OFFSET

### A.3.1 Empfehlung

- **Keyset-/Seek-Pagination für Chat-Verläufe.** Konkret:
  ```sql
  SELECT id, role, content, created_at
    FROM messages
   WHERE tenant_id = $1 AND chat_id = $2
     AND (created_at, id) < ($3, $4)
   ORDER BY created_at DESC, id DESC
   FETCH FIRST 50 ROWS ONLY;
  ```
- **Cursor = das Wertepaar `(created_at, id)`**, base64-kodiert an den Client; **niemals** eine Zeilennummer.
- **Deterministische Sortierreihenfolge ist Pflicht** — ohne eindeutigen Tiebreaker ist Keyset-Pagination falsch.
- **OFFSET für UI-Zwecke nur dort, wo Springen Pflicht ist** (z. B. Admin-Tabellen mit Seitenzahlen und kleinen Datenmengen).

### A.3.2 Belege

`https://use-the-index-luke.com/no-offset`

- **Das Performance-Argument, wörtlich:** „`Offset` instructs the DBMS skip the first N results of a query. However, the database must still fetch these rows from the disk and bring them in order before it can send the following ones.“
- **Es ist kein Implementierungsfehler, sondern Design:** „This is not an implementation problem, it's the way `offset` is designed“ — mit Verweis auf SQL:2023, Part 2, §4.17.3.
- **Korrektheitsproblem:** „When using `offset` to skip the previously fetched entries, you'll get duplicates in case there were new rows inserted between fetching two pages.“
- **Tool-Verantwortung:** „This is not even a database problem, it is the way frameworks implement pagination: they just say which page number to fetch or how many rows to skip.“
- **Das Rezept:** „just use a `where` clause that selects only data you haven't seen yet“ → „This approach—called *seek method* or *keyset pagination*—solves the problem of drifting results as illustrated above and is even faster than `offset`.“
- **Ursprung des Titels:** „The main reason to prefer `offset` over keyset pagination is the lack of tool support. Most tools offer pagination based on `offset`, but don't offer any convenient way to use keyset pagination.“
- **Grenze der Methode:** „On slide 43 you can also see that keyset pagination has some limitations: most notably that you cannot directly navigate to arbitrary pages.“

`https://use-the-index-luke.com/sql/partial-results/fetch-next-page`

- **Zwei konkrete OFFSET-Nachteile, wörtlich:** „This has two disadvantages: (1) the pages drift when inserting new sales because the numbering is always done from scratch; (2) the response time increases when browsing further back.“
- **Zwingende Voraussetzung:** „Paging requires a deterministic sort order.“ Und: „Even if the functional specifications only require sorting ‘by date, latest first’, we as the developers must make sure the `order by` clause yields a deterministic row sequence.“
- **Row-Values-Syntax als saubere Lösung:** „The `where` clause uses the little-known ‘row values’ syntax“. Und die Verfügbarkeit: „Db2 (only LUW, since 10.1) and PostgreSQL (since 8.4), however, have a proper support of row value predicates *and* uses them to access the index if there is a corresponding index available.“
- **Nachteile des Seek-Verfahrens:** „Of course the seek method has drawbacks as well, the difficulty in handling it being the most important one. You not only have to phrase the `where` clause very carefully—you also cannot fetch arbitrary pages. Moreover you need to reverse all comparison and sort operations to change the browsing direction.“
- **Skalierungskurve:** „Figure 7.4 compares the performance characteristics of the offset and the seek methods. The accuracy of measurement is insufficient to see the difference on the left hand side of the chart, however the difference is clearly visible from about page 20 onwards.“
- **Postgres-Syntax-Detail:** „PostgreSQL, however, only accepts `offset` without the `rows` keyword.“

### A.3.3 Was dagegen spricht / Unsicherheiten

- **Keine absoluten Zahlen belegt.** Winand nennt eine Kurve und „from about page 20 onwards“, aber keine absoluten Millisekunden-Werte; das Diagramm ist ein Bild und wurde hier nicht als Zahl ausgelesen. **Konkrete OFFSET-Millisekunden sind damit nicht belegt.**
- **Keyset blockiert „Springe zu Seite 17“ und „Springe zum Ende“.** Für ein Chat-UI mit Infinite Scroll ist das irrelevant; für ein Admin-Panel kann es ein Ausschlusskriterium sein.
- **`FETCH FIRST ... ROWS ONLY` vs. `LIMIT`:** Winand schreibt, Postgres akzeptiere bei `offset` das `rows`-Schlüsselwort nicht; die `LIMIT`-Form funktioniert. Das ist eine Aussage über die von ihm getestete Version — ich habe die `SELECT`-Referenzseite **nicht** gelesen, um das gegen die aktuelle Version zu prüfen → **Detailunsicherheit**.
- **Ein Cursor-Generator ist zusätzlicher Code.** Bei Bun/TypeScript muss der Cursor-Wert korrekt kodiert, signiert und gegen Manipulation geprüft werden. Das ist nicht Doku-Thema, sondern Anwendungsverantwortung.

---

## A.4 Sehr lange Chats / sehr viele Nachrichtenzeilen

### A.4.1 Partitionierung

**Empfehlung**

- **Nicht vorschnell partitionieren.** Die Doku liefert selbst die Faustregel.
- Wenn überhaupt: `messages` per **RANGE auf `created_at`** (monatlich) partitionieren, wenn Datenalterung/Retention das Ziel ist (`DROP TABLE` statt `DELETE`).
- Alternativ **HASH auf `tenant_id`** mit begrenzter Partitionszahl, wenn die Mandantenzahl klein und stabil ist.
- **Immer `enable_partition_pruning` aktiv lassen** und prüfen, dass der Partitionsschlüssel in den `WHERE`-Klauseln vorkommt.

**Belege** — `https://www.postgresql.org/docs/current/ddl-partitioning.html`

- Wann sinnvoll: „These benefits will normally be worthwhile only when a table would otherwise be very large. The exact point at which a table will benefit from partitioning depends on the application, although a rule of thumb is that the size of the table should exceed the physical memory of the database server.“
- Nutzen: „Dropping an individual partition using `DROP TABLE`, or doing `ALTER TABLE DETACH PARTITION`, is far faster than a bulk operation. These commands also entirely avoid the `VACUUM` overhead caused by a bulk `DELETE`.“
- **Grenzen (Limitations), wörtlich:**
  - „To create a unique or primary key constraint on a partitioned table, the partition keys must not include any expressions or function calls and the constraint's columns must include all of the partition key columns.“
  - „`BEFORE ROW` triggers on `INSERT` cannot change which partition is the final destination for a new row.“
  - „Mixing temporary and permanent relations in the same partition tree is not allowed.“
  - „It is not possible to turn a regular table into a partitioned table or vice versa.“
- **Kein `CONCURRENTLY` auf partitionierten Tabellen:** „However, one limitation when creating new indexes on partitioned tables is that it is not possible to use the `CONCURRENTLY` qualifier, which could lead to long lock times.“
- **Partitionierungsgrad:** „The query planner is generally able to handle partition hierarchies with up to a few thousand partitions fairly well, provided that typical queries allow the query planner to prune all but a small number of partitions.“
- **Designfehler-Warnung:** „Never just assume that more partitions are better than fewer partitions, nor vice-versa.“
- **Autovacuum/ANALYZE-Lücke:** „Partitioned tables do not directly store tuples and consequently are not processed by autovacuum. (Autovacuum does process table partitions just like other tables.) Unfortunately, this means that autovacuum does not run `ANALYZE` on partitioned tables, and this can cause suboptimal plans for queries that reference partitioned table statistics.“ (`routine-vacuuming.html`)

**Was dagegen spricht / Unsicherheit**

- Partitionierung ist **irreversibel** in der Aufwärtsrichtung: „It is not possible to turn a regular table into a partitioned table“ — man muss migrieren. **Früh entscheiden oder bewusst nicht partitionieren.**
- Die Doku nennt **keine** harte Partitionsobergrenze („a few thousand“ ist qualitativ). Eine konkrete Zahl für dein System ist **nicht belegt**.
- Partitionierung hilft **nicht** gegen Bloat innerhalb einer heißen Partition. Bei `messages` (insert-lastig, selten geändert) ist Bloat ein kleineres Problem als bei `sessions`.

### A.4.2 TOAST

**Empfehlung**

- TOAST ist **transparent** — es ist keine Designentscheidung, sondern eine Erklärung dafür, warum breite `text`-Spalten günstiger sind, als sie scheinen. Du musst nichts tun; du musst nur verstehen, dass ein `SELECT *` die out-of-line-Werte eines TOAST-Feldes **nicht** mitzieht.
- **`messages.content` als `text`** ist richtig. Kein manuelles Chunking nötig.
- Für große Anhänge/Blobs: **nicht** in die DB, sondern Objektspeicher + Referenz. (Das ist meine Empfehlung; die Doku bewertet es nicht → nicht belegt.)

**Belege** — `https://www.postgresql.org/docs/current/storage-toast.html`

- Warum es existiert: „PostgreSQL uses a fixed page size (commonly 8 kB), and does not allow tuples to span multiple pages. Therefore, it is not possible to store very large field values directly. To overcome this limitation, large field values are compressed and/or broken up into multiple physical rows.“
- **Welche Spaltentypen:** „Only certain data types support TOAST — there is no need to impose the overhead on data types that cannot produce large field values. To support TOAST, a data type must have a variable-length (*varlena*) representation“. Also alle `text`/`varchar`/`bytea`/`jsonb`-artigen Typen, **nicht** `int`/`uuid`/`timestamptz`.
- Größengrenze: „limiting the logical size of any value of a TOAST-able data type to 1 GB“.
- **Wann es greift, wörtlich:** „The TOAST management code is triggered only when a row value to be stored in a table is wider than `TOAST_TUPLE_THRESHOLD` bytes (normally 2 kB). The TOAST code will compress and/or move field values out-of-line until the row value is shorter than `TOAST_TUPLE_TARGET` bytes (also normally 2 kB, adjustable) or no more gains can be had.“
- **UPDATE-Kosten bei großen Feldern:** „During an `UPDATE` operation, values of unchanged fields are normally preserved as-is; so an `UPDATE` of a row with out-of-line values incurs no TOAST costs if none of the out-of-line values change.“ → Das ist das entscheidende Argument dafür, den Chat-Text in einer eigenen `messages`-Zeile und **nicht** in einem `chats.transcript`-Blob zu halten.
- Die vier Strategien: `PLAIN`, `EXTENDED` (Default), `EXTERNAL` („allows out-of-line storage but not compression. Use of `EXTERNAL` will make substring operations on wide `text` and `bytea` columns faster“), `MAIN`.
- Der Gewinn: „the main table is much smaller and more of its rows fit in the shared buffer cache than would be the case without any out-of-line storage. […] A little test showed that a table containing typical HTML pages and their URLs was stored in about half of the raw data size including the TOAST table, and that the main table contained only about 10% of the entire data“.

**Kompressionsverfahren — mit Korrektur einer verbreiteten Annahme**

- `https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-DEFAULT-TOAST-COMPRESSION`: „This variable sets the default TOAST compression method for values of compressible columns. […] The supported compression methods are `pglz` and (if PostgreSQL was compiled with `--with-lz4`) `lz4`. **The default is `pglz`.**“
- `https://www.postgresql.org/docs/release/14.0/` — PG14 führte LZ4 ein: „Add ability to use LZ4 compression on TOAST data (Dilip Kumar) […] The server must be compiled with `--with-lz4` to support [it].“
- **Wichtige Korrektur zu deiner Frage:** Die Annahme „Kompression ab PG14/16“ ist insofern präzisierbar: LZ4 wurde in **PG14 als Option** hinzugefügt. Eine Änderung des **Defaults** auf LZ4 in **PG16 habe ich in den gelesenen PG16-Release-Notes nicht gefunden** (dort steht nur „Add LZ4 and Zstandard compression to `pg_dump`“), und die aktuelle PG18-Doku sagt ausdrücklich „The default is `pglz`“. **Die Aussage „PG16 hat den TOAST-Default auf LZ4 geändert“ ist damit nicht belegt und nach der aktuellen Doku falsch.**

**Was dagegen spricht / Unsicherheit**

- Der Doku-Benchmark („about half of the raw data size“, „only about 10%“) stammt aus „A little test“ — **nicht** reproduzierbar und nicht auf dein Datenprofil übertragbar.
- `EXTERNAL` spart CPU, kostet Speicherplatz. Die Doku nennt das explizit („at the penalty of increased storage space“), aber kein Verhältnis.
- **Ich habe die `fillfactor`/`toast_tuple_target`-Storage-Parameter-Seite (`sql-createtable.html`) nicht gelesen** → ob und wann ein Nicht-Default-`toast_tuple_target` sinnvoll ist, ist hier **nicht belegt**.

### A.4.3 VACUUM / Autovacuum bei update-lastigen Tabellen

**Empfehlung**

- **Autovacuum niemals global abschalten.** Für `sessions` (update-lastig: `last_seen_at`, `expires_at`) pro Tabelle nachjustieren, nicht global.
- **`sessions` aggressiver einstellen** (niedrigere `autovacuum_vacuum_scale_factor`, niedrigerer `autovacuum_vacuum_threshold` als global) — die Doku erlaubt Overrides pro Tabelle.
- **`idle_in_transaction_session_timeout` setzen**, weil offene Transaktionen Vakuum blockieren.
- **`messages` nicht mit `DELETE` altern lassen**, sondern per Partition `DROP`/`DETACH` (siehe A.4.1).

**Belege** — `https://www.postgresql.org/docs/current/routine-vacuuming.html`

- Warum überhaupt: „In PostgreSQL, an `UPDATE` or `DELETE` of a row does not immediately remove the old version of the row. This approach is necessary to gain the benefits of multiversion concurrency control (MVCC) […] eventually, an outdated or deleted row version is no longer of interest to any transaction. The space it occupies must then be reclaimed for reuse by new rows, to avoid unbounded growth of disk space requirements.“
- **Bloat ist normal, nicht ein Fehler:** „The usual goal of routine vacuuming is to do standard `VACUUM`s often enough to avoid needing `VACUUM FULL`. The autovacuum daemon attempts to work this way, and in fact will never issue `VACUUM FULL`. In this approach, the idea is not to keep tables at their minimum size, but to maintain steady-state usage of disk space“.
- **Das Risiko fester Zeitpläne:** „The difficulty with doing vacuuming according to a fixed schedule is that if a table has an unexpected spike in update activity, it may get bloated to the point that `VACUUM FULL` is really necessary to reclaim space.“
- **Die Formel:** „vacuum threshold = Minimum(vacuum max threshold, vacuum base threshold + vacuum scale factor \* number of tuples)“; und „analyze threshold = analyze base threshold + analyze scale factor \* number of tuples“.
- **Per-Tabelle-Override:** „The default thresholds and scale factors are taken from `postgresql.conf`, but it is possible to override them (and many other autovacuum control parameters) on a per-table basis“.
- **Blockade durch Anfragen:** „Autovacuum workers generally don't block other commands. If a process attempts to acquire a lock that conflicts with the `SHARE UPDATE EXCLUSIVE` lock held by autovacuum, lock acquisition will interrupt the autovacuum.“ Und die **Warnung**: „Regularly running commands that acquire locks conflicting with a `SHARE UPDATE EXCLUSIVE` lock (e.g., ANALYZE) can effectively prevent autovacuums from ever completing.“
- **Verwaiste Transaktionen:** „Even when no significant locks are held, an open transaction prevents vacuuming away recently-dead tuples that may be visible only to this transaction; so remaining idle for a long time can contribute to table bloat.“ (`runtime-config-client.html`, GUC `idle_in_transaction_session_timeout`)
- **`VACUUM FULL` kostet einen exklusiven Lock:** „`VACUUM FULL` requires an `ACCESS EXCLUSIVE` lock on the table it is working on, and therefore cannot be done in parallel with other use of the table. Generally, therefore, administrators should strive to use standard `VACUUM` and avoid `VACUUM FULL`.“
- **XID-Wraparound ist real:** „it is necessary to vacuum every table in every database at least once every two billion transactions“ und die dokumentierte Fehlermeldung: „ERROR: database is not accepting commands that assign new transaction IDs to avoid wraparound data loss in database “mydb““.

**Was dagegen spricht / Unsicherheit**

- **„Autovacuum ist zu langsam“ ist nicht durch Doku belegt, sondern Anwendungsbeobachtung.** Die Doku liefert nur die Stellschrauben. Ob dein System Nachjustierung braucht, muss gemessen werden (z. B. via `log_autovacuum_min_duration` → „`log_autovacuum_min_duration` can be set to monitor autovacuum workers' activity“).
- **Wraparound-Zahlen sind Schwellen, keine Zielwerte.** „Two billion transactions“ ist die harte Grenze, nicht ein Betriebsziel; die Doku empfiehlt die aggressive Vacuum-Praxis lange vorher.
- **Konkrete Empfehlungswerte** für `autovacuum_vacuum_scale_factor` auf `sessions` kann ich aus der Doku **nicht** ableiten → nicht belegt.

### A.4.4 HOT-Updates

**Empfehlung**

- **Den Primärschlüssel und alle indizierten Spalten von `sessions` unveränderlich halten** (UUID-PK bleibt, `last_seen_at` **nicht** indizieren, wenn es bei jedem Request aktualisiert wird). Das ermöglicht HOT-Updates und ist der größte Einzelhebel gegen Index-Bloat bei einer Hot-Tabelle.
- **`fillfactor` auf `sessions` senken** (z. B. 80–90), damit das Update auf derselben Seite Platz findet. *(Der Wert 80–90 ist meine Setzung; die Doku nennt nur „decreasing a table's fillfactor“ → als Zahl nicht belegt.)*
- **`pg_stat_all_tables` auf HOT-Ratio überwachen.**

**Belege** — `https://www.postgresql.org/docs/current/storage-hot.html`

- Zweck: „To allow for high concurrency, PostgreSQL uses multiversion concurrency control (MVCC) […] However, MVCC has some downsides for update queries. Specifically, updates require new versions of rows to be added to tables. This can also require new index entries for each updated row, and removal of old versions of rows and their index entries can be expensive. To help reduce the overhead of updates, PostgreSQL has an optimization called heap-only tuples (HOT).“
- **Die zwei Bedingungen:** „This optimization is possible when: The update does not modify any columns referenced by the table's indexes, not including summarizing indexes. […] There is sufficient free space on the page containing the old row for the updated row.“
- **Der doppelte Gewinn:** „New index entries are not needed to represent updated rows, however, summary indexes may still need to be updated.“ Und: „When a row is updated multiple times, row versions other than the oldest and the newest can be completely removed during normal operation, including `SELECT`s, instead of requiring periodic vacuum operations.“
- **Wie man die Wahrscheinlichkeit erhöht:** „You can increase the likelihood of sufficient page space for HOT updates by decreasing a table's `fillfactor`.“ Und die Überwachung: „The system view `pg_stat_all_tables` allows monitoring of the occurrence of HOT and non-HOT updates.“
- **PG16-Erweiterung:** „Allow HOT updates if only `BRIN`-indexed columns are updated (Matthias van de Meent, Josef Simanek, Tomas Vondra)“ — `https://www.postgresql.org/docs/release/16.0/`
- **Zusammenwirken mit Index-Hygiene (PG14):** „Allow btree index additions to remove expired index entries to prevent page splits (Peter Geoghegan) […] This is particularly helpful for reducing index bloat on tables whose indexed columns are frequently updated.“ — `https://www.postgresql.org/docs/release/14.0/`

**Was dagegen spricht / Unsicherheit**

- **Falsche Index-Definitionen zerstören HOT still.** Wenn `sessions` einen Index auf `last_seen_at` hat (weil man „nach inaktiven Sessions suchen“ will), ist **jedes** Session-Update ein Non-HOT-Update. Das ist die häufigste Ursache für Session-Tabellen-Bloat. Meine Schlussfolgerung aus der zitierten Bedingung — die Doku formuliert sie als Regel, nicht als Warnung.
- Die Doku nennt **keinen** empfohlenen `fillfactor`, kein HOT-Zielverhältnis und keinen Schwellenwert für „zu viel Bloat“ → **nicht belegt**.
- HOT hilft nicht, wenn TOAST-Felder geändert werden; gleichzeitig ist der TOAST-Anteil bei unveränderten Feldern kostenlos (A.4.2). Die Kombination beider Effekte ist in der Doku nicht gemeinsamen quantifiziert.

---

## A.5 Volltextsuche: tsvector/GIN, generated columns, pg_trgm

### A.5.1 Empfehlung

- **In-DB-Suche zuerst mit GIN + `tsvector`**, nicht mit `LIKE '%…%'`.
- **`pg_trgm` (GIN) für Teilstring-/Tippfehler-Toleranz und Autocomplete** — es ist die einzige dokumentierte Option, die `LIKE '%foo%'`, `ILIKE`, `~` und `~*` indexgestützt macht.
- **Reihenfolge der Werkzeuge:** `tsvector`+GIN für Wortsuche → `pg_trgm` zusätzlich für Fuzzy/Teilstring → erst wenn Latenz, Ranking-Qualität oder Mandantenisolation nachweislich nicht reichen, ein externer Index.
- **Externen Index an einer dokumentierten Naht ansetzen:** Die Postgres-Doku beschreibt selbst die Option, Dokumente über Server zu verteilen und Ergebnisse extern zu sammeln (siehe Beleg unten) — das ist die legitime Bruchstelle.

### A.5.2 Belege

`https://www.postgresql.org/docs/current/textsearch-indexes.html`

- Werkzeugwahl: „There are two kinds of indexes that can be used to speed up full text searches: GIN and GiST. Note that indexes are not mandatory for full text searching, but in cases where a column is searched on a regular basis, an index is usually desirable.“
- **Klare Empfehlung:** „GIN indexes are the preferred text search index type. As inverted indexes, they contain an index entry for each word (lexeme), with a compressed list of matching locations.“
- **GIN-Grenze:** „GIN indexes store only the words (lexemes) of `tsvector` values, and not their weight labels. Thus a table row recheck is needed when using a query that involves weights.“
- **GiST ist lossy:** „A GiST index is *lossy*, meaning that the index might produce false matches, and it is necessary to check the actual table row to eliminate such false matches.“ Und: „Lossiness causes performance degradation due to unnecessary fetches of table records that turn out to be false matches. Since random access to table records is slow, this limits the usefulness of GiST indexes.“
- **Tuning-Unterschied:** „Note that GIN index build time can often be improved by increasing `maintenance_work_mem`, while GiST index build time is not sensitive to that parameter.“
- **Der dokumentierte Skalierungspfad inkl. externer Suche:** „Partitioning of big collections and the proper use of GIN and GiST indexes allows the implementation of very fast searches with online update. Partitioning can be done at the database level using table inheritance, or by distributing documents over servers and collecting external search results, e.g., via Foreign Data access. The latter is possible because ranking functions use only local information.“

`https://www.postgresql.org/docs/current/pgtrgm.html`

- Was es kann: „The `pg_trgm` module provides functions and operators for determining the similarity of alphanumeric text based on trigram matching, as well as index operator classes that support fast searching for similar strings.“
- **Indexgestützte Muster:** „These index types support the above-described similarity operators, and additionally support trigram-based index searches for `LIKE`, `ILIKE`, `~`, `~*` and `=` queries.“ Und: „Unlike B-tree based searches, the search string need not be left-anchored.“
- **Wichtiger Degenerationsfall:** „For both `LIKE` and regular-expression searches, keep in mind that a pattern with no extractable trigrams will degenerate to a full-index scan.“
- **Nicht für Gleichheit:** „Note that those indexes may not be as efficient as regular B-tree indexes for equality operator.“
- **GiST vs. GIN für Ähnlichkeitssuche:** „This can be implemented quite efficiently by GiST indexes, but not by GIN indexes. It will usually beat the first formulation when only a small number of the closest matches is wanted.“
- **Zwei Ähnlichkeitsbegriffe:** `word_similarity` misst Ähnlichkeit zu einem *Abschnitt*, `strict_word_similarity` „forces extent boundaries to match word boundaries“; Belegwerte aus der Doku: `word_similarity('word', 'two words')` → `0.8`, `strict_word_similarity('word', 'two words')` → `0.571429`.
- **Schwellenwerte (Defaults, wörtlich):** `pg_trgm.similarity_threshold` „default is 0.3“, `pg_trgm.word_similarity_threshold` „default is 0.6“, `pg_trgm.strict_word_similarity_threshold` „default is 0.5“.

### A.5.3 Was dagegen spricht / Unsicherheiten

- **`generated columns` für `tsvector` habe ich NICHT belegt.** Die relevante Seite wäre `https://www.postgresql.org/docs/current/ddl-generated-columns.html` (verlinkt als „5.4. Generated Columns“), die ich nicht gelesen habe. Indirekt belegt ist nur, dass es das Feature gibt und dass es Einschränkungen hat: die PG16-Release-Notes nennen „Tighten `GENERATED` expression restrictions on inherited and partitioned tables […] Columns of parent/partitioned and child/partition tables must all have the same generation status“. **Ob `GENERATED ALWAYS AS (to_tsvector(...)) STORED` der aktuelle Standardweg ist, ist hier nicht belegt.**
- **Ein externer Index (Meilisearch/Typesense/OpenSearch) wird von der Postgres-Doku nirgends empfohlen.** Die einzige dokumentierte Erweiterungsrichtung ist Partitionierung + verteilte Suche + FDW (Zitat oben). **Alle Aussagen der Form „Postgres-FTS reicht ab X Millionen Zeilen nicht mehr“ sind nicht belegt** — die Doku nennt keine Schwelle.
- **Ranking-Qualität** (Relevanz, Sprachunterstützung, Tippfehlertoleranz jenseits von Trigrams) ist in der gelesenen Doku nicht bewertet → nicht belegt.
- **Mandantenisolation der Suche** ist ein Architekturthema; `textsearch-indexes.html` sagt dazu nichts.
- `maintenance_work_mem` beim GIN-Build ist der einzige quantifizierbare Tuning-Hinweis der Doku; ein konkreter Wert ist **nicht belegt**.

---

## A.6 Typische Fehler (Anti-Patterns)

### A.6.1 UUID v4 als Primary Key

**Empfehlung**

- **UUID v7 (zeitgeordnet) statt UUID v4** für neue Zeilen-IDs — sofern die eingesetzte Postgres-Version das kann.
- Wenn v4 bleiben muss: **Randomschlüssel nicht als Clustering-Kriterium verwenden** und akzeptieren, dass die Einfüge-Lokalität leidet.

**Belege** — `https://www.postgresql.org/docs/current/functions-uuid.html`

- Die Doku kennt beide Varianten nebeneinander:
  - `gen_random_uuid()` / `uuidv4()` → „Generates a version 4 (random) UUID“. Beispiel: `uuidv4()` → `b42410ee-132f-42ee-9e4f-09a6485c95b8`
  - `uuidv7([shift interval])` → „Generates a version 7 (time-ordered) UUID. The timestamp is computed using UNIX timestamp with millisecond precision + sub-millisecond timestamp + random.“ Beispiel: `uuidv7()` → `019535d9-3df7-79fb-b466-fa907fa17f9e`
- Nachweisbarkeit der Version zur Laufzeit: `uuid_extract_version(uuid)` → „Extracts the version from a UUID of one of the variants described by RFC 9562 […] For example, for a UUID generated by `gen_random_uuid()`, this function will return 4.“
- Zeitstempel-Extraktion: `uuid_extract_timestamp(uuid)` → „Extracts a `timestamp with time zone` from a UUID of version 1 or 7. For other versions, this function returns null.“

**Was dagegen spricht / Unsicherheit**

- **Die konkrete Behauptung „random UUID and index performance“ ist in der Postgres-Doku NICHT belegt.** Ich habe in den gelesenen Seiten **keine** Aussage gefunden, dass zufällige UUIDs den Index verschlechtern. Was belegt ist: Postgres hat eine **zeitgeordnete** Variante ergänzt und Funktionen, um Version und Zeitstempel auszulesen. Die Performance-Begründung dafür ist eine **Schlussfolgerung**, kein Doku-Zitat.
- **Versionsabhängigkeit:** `uuidv7()` erscheint in der PG18-Doku; die Doku-Seite listet „Unsupported versions: 13“ — d. h. die Funktion ist neuer als PG13. **Ab welcher Version genau `uuidv7()` verfügbar ist, habe ich nicht belegt** (die Seite nennt kein `since`-Datum).
- **UUID v4 bleibt sicherer gegen Vorhersagbarkeit.** Wenn Session-IDs o. Ä. nicht erratbar sein müssen, ist v7 (mit Millisekunden-Präfix) schwächer. Das ist eine Sicherheitsabwägung; die Doku behandelt sie **nicht** → nicht belegt.
- **ULID/Snowflake** sind in der gelesenen Doku nicht erwähnt → nicht belegt.

### A.6.2 Fehlende NOT NULL

**Empfehlung:** NOT NULL als Default; Abwesenheit begründen.

**Beleg** — `ddl-constraints.html`: „In most database designs the majority of columns should be marked not null.“ Und: „A not-null constraint is functionally equivalent to creating a check constraint `CHECK (column_name IS NOT NULL)`, but in PostgreSQL creating an explicit not-null constraint is more efficient.“

**Unsicherheit:** Es gibt **keinen** Doku-Beleg dafür, dass fehlendes NOT NULL „eine typische Fehlerquelle“ ist. Die Doku empfiehlt es, nennt aber keine Fehlerstatistik → die Kategorisierung als „Anti-Pattern“ ist meine Einordnung.

### A.6.3 Zu breite Indizes

**Empfehlung:** Maximal ~3 Spalten; `INCLUDE` nur mit Bedacht; jeder Index muss eine Query rechtfertigen.

**Belege**

- `indexes-multicolumn.html`: „Multicolumn indexes should be used sparingly. In most situations, an index on a single column is sufficient and saves space and time. Indexes with more than three columns are unlikely to be helpful unless the usage of the table is extremely stylized.“
- `indexes-index-only-scans.html`: „It's wise to be conservative about adding non-key payload columns to an index, especially wide columns. If an index tuple exceeds the maximum size allowed for the index type, data insertion will fail. In any case, non-key columns duplicate data from the index's table and bloat the size of the index, thus potentially slowing searches.“
- `indexes-partial.html`, Example 11.4: „This is a bad idea!“ (viele nicht-überlappende Teilindizes statt eines zusammengesetzten Index)

**Unsicherheit:** „Zahl der Indizes pro Tabelle“ wird in der Doku **nicht** begrenzt oder empfohlen → nicht belegt.

### A.6.4 JSONB als Allheilmittel

**Empfehlung (ohne Doku-Beleg):** JSONB für wirklich schemalose, heterogene Payloads (z. B. Tool-Call-Argumente, Provider-Metadaten). Für alles, was gefiltert, sortiert, gejoint oder referenziert wird: echte Spalten.

**Belegstatus:** **NICHT BELEGT.** Ich habe die JSON-Datentyp-Doku (`https://www.postgresql.org/docs/current/datatype-json.html`) **nicht gelesen**. Es gibt in den hier gelesenen Seiten keine Aussage über JSONB als Anti-Pattern. Indirekt relevant, aber nur ein Teilaspekt: Partitionierte Tabellen brauchen Partitionsschlüssel im Unique/PK — ein JSONB-Feld kann das nicht leisten (siehe A.4.1).

### A.6.5 Fehlende Zeitzonenbehandlung (timestamptz vs. timestamp)

**Empfehlung:** Ausschließlich `timestamptz`; intern UTC; Anzeige-Zeitzone nur im Client.

**Belege** — `https://www.postgresql.org/docs/current/datatype-datetime.html`

- „All timezone-aware dates and times are stored internally in UTC.“
- **Die Classic-Falle:** „PostgreSQL never examines the content of a literal string before determining its type, and therefore will treat both of the above as `timestamp without time zone`. To ensure that a literal is treated as `timestamp with time zone`, give it the correct explicit type“. Und: „In a value that has been determined to be `timestamp without time zone`, PostgreSQL will silently ignore any time zone indication.“
- **`time with time zone` meiden:** „The type `time with time zone` is defined by the SQL standard, but the definition exhibits properties which lead to questionable usefulness.“ Und: „We do *not* recommend using the type `time with time zone`“.
- **Zeitzonendaten sind politisch und ändern sich:** „Time zones, and time-zone conventions, are influenced by political decisions, not just earth geometry. […] PostgreSQL uses the widely-used IANA (Olson) time zone database for information about historical time zone rules.“
- **Abkürzungen sind riskant:** „To complicate matters, some jurisdictions have used the same timezone abbreviation to mean different UTC offsets at different times; for example, in Moscow `MSK` has meant UTC+3 in some years and UTC+4 in others.“

**Unsicherheit:** Konkrete Migrationsschritte (Umwandlung bestehender `timestamp`-Spalten nach `timestamptz`) sind in der gelesenen Doku **nicht** beschrieben → nicht belegt.

### A.6.6 Zusätzlich gefunden: Sequenzen sind nicht transaktional

Das ist ein Anti-Pattern, das nicht in deiner Liste stand, aber in dieselbe Kategorie fällt und **belegt** ist:

- `https://www.postgresql.org/docs/current/transaction-iso.html`: „Some PostgreSQL data types and functions have special rules regarding transactional behavior. In particular, changes made to a sequence (and therefore the counter of a column declared using `serial`) are immediately visible to all other transactions and are not rolled back if the transaction that made the changes aborts.“
- **Konsequenz für das Harness:** ID-Lücken sind normal und kein Fehler; aus Sequenzwerten darf keine lückenlose Fachlichkeit (z. B. Nachrichtennummerierung pro Chat) abgeleitet werden. (Schlussfolgerung aus dem Zitat.)

---

## A.7 Connection Pooling (PgBouncer) und Isolationsstufen

### A.7.1 Empfehlung

- **Pooling ist Pflicht**, weil Postgres eine Verbindung = ein Backend-Prozess ist *(letzteres ist in der gelesenen Doku nicht explizit zitiert → als Allgemeinwissen markiert, nicht belegt)*.
- **PgBouncer im `transaction`-Pooling-Modus**, aber nur mit einem Anwendungsvertrag: **keine** `SET`/`RESET`, **kein** `LISTEN`, **keine** `WITH HOLD`-Cursor, **keine** session-level Advisory Locks, **kein** `PREPARE`/`DEALLOCATE`, **keine** `PRESERVE ROWS`-Temp-Tabellen.
- Wenn du diese Features brauchst: `session`-Pooling (unterstützt laut Tabelle alle Features) — oder den Pooling-Modus als Architekturentscheidung ernst nehmen.
- **Für Bun/TypeScript:** Prepared Statements auf Protokollebene sind unter `transaction`-Pooling möglich, aber nur mit gesetztem `max_prepared_statements ≠ 0`.
- **Isolation `READ COMMITTED` (Default) für das Harness**, mit explizitem Retry-Wrapper für den Fall, dass du später auf `REPEATABLE READ`/`SERIALIZABLE` gehst.

### A.7.2 Belege

`https://www.pgbouncer.org/features.html`

- **Die drei Modi:** „Session pooling — Most polite method. When a client connects, a server connection will be assigned to it for the whole duration it stays connected. […] This mode supports all PostgreSQL features.“ / „Transaction pooling — A server connection is assigned to a client only during a transaction. […] **This mode breaks a few session-based features of PostgreSQL. You can use it only when the application cooperates by not using features that break.**“ / „Statement pooling — Most aggressive method.“
- **Feature-Matrix (Auszug, wörtlich aus der Tabelle für `transaction`-Pooling):** `SET/RESET` → „Never“; `LISTEN` → „Never“; `WITH HOLD CURSOR` → „Never“; `PREPARE / DEALLOCATE` → „Never“; `PRESERVE/DELETE ROWS temp tables` → „Never“; `Session-level advisory locks` → „Never“; `Protocol-level prepared plans` → „Yes“ mit Fußnote „You need to change `max_prepared_statements` to a non-zero value to enable this support.“; `ON COMMIT DROP temp tables` → „Yes“.
- **Der Design-Hinweis:** „Note that ‘transaction’ pooling breaks client expectations of the server *by design* and can be used only if the application cooperates by not using non-working features.“
- Effizienz: „Low memory requirements (2 kB per connection by default). This is because PgBouncer does not need to see full packets at once.“

`https://www.postgresql.org/docs/current/transaction-iso.html`

- **Tabelle 13.1 (Isolationsstufen und Phänomene)** — Auszug: `Read uncommitted` → Dirty Read: „Allowed, but not in PG“; `Read committed` → „Not possible / Possible / Possible / Possible“; `Repeatable read` → Phantom Read: „Allowed, but not in PG“; `Serializable` → „Not possible“ in allen vier Spalten.
- **Nur drei Stufen implementiert:** „In PostgreSQL, you can request any of the four standard transaction isolation levels, but internally only three distinct isolation levels are implemented, i.e., PostgreSQL's Read Uncommitted mode behaves like Read Committed.“
- **Default:** „*Read Committed* is the default isolation level in PostgreSQL.“ Und: „Because Read Committed mode starts each command with a new snapshot […] it is possible for an updating command to see an inconsistent snapshot“.
- **Retry-Pflicht ab Repeatable Read:** „Applications using this level must be prepared to retry transactions due to serialization failures.“ Und konkreter Fehlertext: „ERROR: could not serialize access due to concurrent update“ sowie bei Serializable: „ERROR: could not serialize access due to read/write dependencies among transactions“.
- **Fehlercode für Retry-Logik:** „because it will be very hard to predict exactly which transactions might contribute to the read/write dependencies and need to be rolled back to prevent serialization anomalies. […] It is important that an environment which uses this technique have a generalized way of handling serialization failures (which always return with an SQLSTATE value of '40001')“.
- **Performance-Hinweise für Serializable:** „Declare transactions as `READ ONLY` when possible.“ / „Control the number of active connections, using a connection pool if needed. This is always an important performance consideration, but it can be particularly important in a busy system using Serializable transactions.“ / „Don't leave connections dangling ‘idle in transaction’ longer than necessary.“
- **Historische Falle:** „Prior to PostgreSQL version 9.1, a request for the Serializable transaction isolation level provided exactly the same behavior described here [Repeatable Read]. To retain the legacy Serializable behavior, Repeatable Read should now be requested.“

`https://www.postgresql.org/docs/current/runtime-config-client.html`

- `default_transaction_isolation` (`enum`): „This parameter controls the default isolation level of each new transaction. The default is ‘read committed’.“

### A.7.3 Was dagegen spricht / Unsicherheiten

- **`transaction`-Pooling + Bun/Treiber ist ein konkreter Stolperstein.** Ob der von dir gewählte Bun-Postgres-Treiber Prepared Statements implizit nutzt, ist **nicht belegt** (PgBouncer dokumentiert die Server-Seite, nicht deinen Treiber). Vor Produktivbetrieb testen.
- **PgBouncer auf Windows** ist in der gelesenen Feature-Seite nicht adressiert → **nicht belegt**. Für Dev auf Windows also ggf. direkt verbinden oder ein anderes Pooling-Werkzeug wählen.
- **`statement`-Pooling** ist laut Doku „mostly targeted at PL/Proxy“ — für das Harness praktisch unbrauchbar (keine Multi-Statement-Transaktionen).
- **Isolationsstufe `SERIALIZABLE` für alles** wäre korrektheitstechnisch attraktiv, kostet aber Retry-Logik (belegt) und erhöht laut Doku die Rate an Serialisierungsfehlern bei Sequential Scans: „A sequential scan will always necessitate a relation-level predicate lock. This can result in an increased rate of serialization failures.“ → Abwägung, nicht Doku-Empfehlung.

---

# TEIL B — Redis

## B.1 Wofür 2025/2026 einsetzen — und wofür ausdrücklich nicht

### B.1.1 Empfehlung

**Dafür:**

- **Cache** (Read-Through für teure Berechnungen, Prompt-/Tool-Ergebnis-Cache).
- **Rate-Limiting** (Zähler und Token-Buckets; siehe B.5).
- **Session-Store** — aber nur als *beschleunigende Kopie* mit Postgres als Quelle der Wahrheit.
- **Live-Transport** — **Streams**, nicht Pub/Sub (siehe B.4).
- **Job-Queue** für Aufgaben, die genau einmal beansprucht werden („each task is claimed by exactly one worker“).

**Ausdrücklich nicht:**

- **Nicht als primäre Datenbank** für Users/Tenants/Workspaces/Chats/Messages.
- **Nicht als einziger Auth-Zustand** (kein „nur Redis weiß, ob jemand eingeloggt ist“).
- **Nicht als Queue ohne Persistenz-Garantie.** Pub/Sub ist ausdrücklich ungeeignet.
- **Nicht als harte Sperre / Single Source of Truth** für Sitzungs-Invalidierung (Logout muss in Postgres landen).

### B.1.2 Belege

`https://redis.io/docs/latest/develop/use-cases/streaming/`

- **Die Rolle von Redis im Stack, wörtlich:** „Sub-millisecond reads and writes from memory, so streaming runs on the same Redis instance already handling **cache, sessions, or rate limiting** at zero marginal cost.“ → Die Doku selbst nennt Cache, Sessions und Rate Limiting als Redis-Aufgaben.
- **Pub/Sub ist ungeeignet für Live-Chat-Persistenz:** „**Pub/sub** (Redis Pub/Sub, MQTT) is **fire-and-forget transport**: messages are delivered to whoever is connected and **discarded, with no persistence, replay, or consumer tracking**.“
- **Der Unterschied zum Stream, wörtlich:** „This pattern is distinct from pub/sub, which is **at-most-once transport with no history**: a subscriber that's offline when a message is published **misses it for good**.“
- **Job-Queue-Semantik:** „It is also distinct from a job queue, where each task is claimed by exactly one worker and discarded after it completes.“
- **Wann Streams statt Kafka:** „Replace a dedicated Kafka deployment for moderate-scale, short-retention streaming workloads using infrastructure you already run.“

`https://redis.io/docs/latest/develop/reference/eviction/`

- **Die Rolle als Cache, wörtlich:** „Redis is commonly used as a cache to speed up read accesses to a slower server or database. Since cache entries are copies of persistently-stored data, it is usually safe to evict them when the cache runs out of memory (they can be cached again in the future if necessary).“
- **Empfehlung zur Instanzentrennung:** „The `volatile-lru`, `volatile-lrm`, and `volatile-random` policies are mainly useful when you want to use a single Redis instance for both caching and for a set of persistent keys. **However, you should consider running two separate Redis instances in a case like this, if possible.**“

`https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/`

- **Der Maßstab für Datensicherheit, wörtlich:** „The general indication you should use both persistence methods is if you want a degree of data safety **comparable to what PostgreSQL can provide you**.“ → Die Doku selbst setzt Redis diesbezüglich *unter* Postgres.

`https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/`

- **Redis ist kein CP-System, wörtlich:** „In general Redis + Sentinel as a whole are an **eventually consistent system** where the merge function is **last failover wins**, and the data from old masters are discarded to replicate the data of the current master, so there is **always a window for losing acknowledged writes**.“
- **Der entscheidende Satz gegen „Redis als einziger Auth-Zustand“:** „There are only two ways to avoid losing acknowledged writes: 1. Use synchronous replication (and a proper consensus algorithm to run a replicated state machine). 2. Use an eventually consistent system where different versions of the same object can be merged. **Redis currently is not able to use any of the above systems, and is currently outside the development goals.**“
- **Das ist die stärkste einzelne Quelle für „nicht als primäre Datenbank“ im gesamten Bericht.**

### B.1.3 Was dagegen spricht / Unsicherheiten

- **„Nicht als primäre Datenbank“ ist eine Schlussfolgerung aus belegten Eigenschaften**, keine wörtliche Doku-Empfehlung. Die Doku sagt nicht „benutze Redis nicht als DB“; sie sagt, dass Redis Datensicherheit nur bis zu einem gewissen Grad und mit konfigurationsabhängigen Verlustfenstern bietet.
- **Redis als Session-Store ist von der Doku ausdrücklich mitgedacht** (Zitat „already handling cache, sessions, or rate limiting“). Ein „niemals Sessions in Redis“ wäre damit zu stark — die Aussage muss lauten: **Sessions in Redis sind ok, wenn Postgres die Wahrheit hält und ein Redis-Verlust nur „alle müssen sich neu anmelden“ bedeutet, nicht „Daten sind weg“.**
- **Es gibt keine gefundene Seite `https://redis.io/docs/latest/develop/use-cases/sessions/`** — der Abruf ergab „Page not found“ (404, „Sorry, we couldn't find the page you're looking for.“). Eine dedizierte offizielle „Sessions“-Use-Case-Seite ist damit **nicht belegt**.
- **Kein Doku-Beleg für „Redis darf keine Auth-Wahrheit sein“** im Sinne einer Warnung. Das ist meine Architekturempfehlung, gestützt auf die Sentinel-Zitate oben.

---

## B.2 Persistenz: RDB vs. AOF, fsync, Redundanz, Verlustfenster — und was das für Sessions heißt

### B.2.1 Empfehlung

- **Wenn Sessions in Redis liegen und ein Redis-Verlust „alle abgemeldet“ bedeuten darf:** RDB allein kann genügen („if you care a lot about your data, but still can live with a few minutes of data loss in case of disasters, you can simply use RDB alone“).
- **Wenn du das Verlustfenster klein halten willst:** **RDB + AOF**, `appendfsync everysec` (Default) → Verlustfenster ≈ 1 Sekunde.
- **`appendfsync always` nur für sehr kleine, kritische Datensätze** — die Doku nennt es „Very very slow“.
- **`appendfsync no` nicht verwenden**, wenn Sessions wichtig sind (Linux ≈ 30 s Puffer).
- **Replikation immer mit Persistenz auf allen Knoten kombinieren** und **Auto-Restart bei persistenzlosem Master deaktivieren**.
- **Sentinel mit ≥ 3 Instanzen** in unabhängigen Fehlerdomänen; **oder** Cluster.
- **Postgres bleibt die Wahrheit** für Login-Zustand: eine Session in Postgres mit `revoked_at`, Redis nur als schnelle Kopie. *(Architekturempfehlung; die Doku sagt das nicht explizit.)*

### B.2.2 Belege

`https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/`

- Die Optionen: „**RDB** (Redis Database): RDB persistence performs point-in-time snapshots of your dataset at specified intervals.“ / „**AOF** (Append Only File): AOF persistence logs every write operation received by the server.“ / „**No persistence**: You can disable persistence completely. This is sometimes used when caching.“ / „**RDB + AOF**: You can also combine both AOF and RDB in the same instance.“
- **RDB-Verlustfenster:** „RDB is NOT good if you need to minimize the chance of data loss in case Redis stops working (for example after a power outage). […] you'll usually create an RDB snapshot every five minutes or more, so in case of Redis stopping working without a correct shutdown for any reason **you should be prepared to lose the latest minutes of data**.“
- **`fork()`-Kosten von RDB:** „RDB needs to fork() often in order to persist on disk using a child process. fork() can be time consuming if the dataset is big, and may result in Redis **stopping serving clients for some milliseconds or even for one second** if the dataset is very big and the CPU performance is not great.“
- **fsync-Policies, wörtlich:**
  - „`appendfsync always`: `fsync` every time new commands are appended to the AOF. **Very very slow, very safe.**“
  - „`appendfsync everysec`: `fsync` every second. Fast enough (since version 2.4 likely to be as fast as snapshotting), and **you may lose 1 second of data if there is a disaster.**“
  - „`appendfsync no`: **Never `fsync`**, just put your data in the hands of the Operating System. The faster and less safe method. **Normally Linux will flush data every 30 seconds** with this configuration, but it's up to the kernel's exact tuning.“
- **Default:** „The suggested (and default) policy is to `fsync` every second.“
- **AOF allein wird abgeraten:** „There are many users using AOF alone, but **we discourage it** since to have an RDB snapshot from time to time is a great idea for doing database backups, for faster restarts, and in the event of bugs in the AOF engine.“
- **Absturz-Konsistenz:** „the AOF still contains consistent data representing a given point-in-time version of the dataset (that may be old up to one second with the default AOF fsync policy), but the last command in the AOF could be truncated.“
- **Multi-Part-AOF (ab 7.0):** „Since Redis 7.0.0, Redis uses a multi part AOF mechanism. That is, the original single AOF file is split into base file (at most one) and incremental files (there may be more than one).“
- **Neuere Backup-Familie:** „Since Redis 8.10.0, the `BACKUP` command family produces a self-contained, restorable backup without stopping writes or manually managing AOF rewrites.“
- **Backup-Warnung:** „Make Sure to Backup Your Database. Disks break, instances in the cloud disappear, and so forth: no backups means huge risk of data disappearing into /dev/null.“

`https://redis.io/docs/latest/operate/oss_and_stack/management/replication/`

- **Asynchron by default:** „Redis uses by default asynchronous replication“. Und: „So the master does not wait every time for a command to be processed by the replicas“.
- **Auch mit Replikation gibt es Verlust:** „However `WAIT` is only able to ensure there are the specified number of acknowledged copies in the other Redis instances, it does not turn a set of Redis instances into a CP system with strong consistency: **acknowledged writes can still be lost during a failover**, depending on the exact configuration of the Redis persistence. However, `WAIT` dramatically reduces the probability of losing a write after a failure event to specific hard-to-trigger failure modes.“
- **Der gefährlichste Betriebsfehler (wörtlich, mit Szenario A/B/C):** „We have a setup with node A acting as master, with persistence turned down, and nodes B and C replicating from node A. / Node A crashes, however it has some auto-restart system, that restarts the process. However since persistence is turned off, the node restarts with an empty data set. / **Nodes B and C will replicate from node A, which is empty, so they'll effectively destroy their copy of the data.**“ Und die Regel: „In setups where Redis replication is used, it is strongly advised to have persistence turned on in the master and in the replicas. […] instances should be configured to **avoid restarting automatically** after a reboot.“
- **Harte Aussage zum Verlustfenster:** „However, because Redis uses asynchronous replication **it is not possible to ensure the replica actually received a given write, so there is always a window for data loss.**“ (im Abschnitt `min-replicas-to-write`)
- **Die Gegenmaßnahme:** „You may think of it as a best effort data safety mechanism, where consistency is not ensured for a given write, but at least **the time window for data loss is restricted to a given number of seconds**. In general bound data loss is better than unbound one.“ Konfiguration: `min-replicas-to-write <number of replicas>`, `min-replicas-max-lag <number of seconds>` — Beispiel in der Doku: `min-replicas-to-write 1`, `min-replicas-max-lag 10`.
- **Voll-Resync blockiert:** „after the initial sync, the old dataset must be deleted and the new one must be loaded. **The replica will block incoming connections during this brief window (that can be as long as many seconds for very large datasets).**“
- **Maxmemory auf Replicas:** „By default, a replica will ignore `maxmemory` (unless it is promoted to master after a failover or manually). […] Note that since the replica by default does not evict, **it may end up using more memory than what is set via `maxmemory`**“.

`https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/`

- „Redis Sentinel provides high availability for Redis when not using Redis Cluster.“
- **Minimum an Instanzen:** „You need **at least three Sentinel instances** for a robust deployment.“ Und: „The three Sentinel instances should be placed into computers or virtual machines that are believed to fail in an independent way.“
- **Kein Failover in der Minderheit:** „In practical terms this means during failures **Sentinel never starts a failover if the majority of Sentinel processes are unable to talk** (aka no failover in the minority partition).“
- **Quorum ≠ Mehrheit:** „However **the quorum is only used to detect the failure**. In order to actually perform a failover, one of the Sentinels need to be elected leader for the failover and be authorized to proceed. This only happens with the vote of the **majority of the Sentinel processes**.“
- **Explizite Warnung:** „Example 1: just two Sentinels, DON'T DO THIS“. Und: „So please **deploy at least three Sentinels in three different boxes** always.“
- **Split-Brain-Szenario:** „In the above configuration we created two masters (assuming S2 could failover without authorization) in a perfectly symmetrical way. Clients may write indefinitely to both sides, and there is no way to understand when the partition heals what configuration is the right one, in order to prevent a *permanent split brain condition*.“
- **Docker/NAT bricht Sentinel:** „Docker performs port remapping, breaking Sentinel auto discovery of other Sentinel processes and the list of replicas for a master.“ Und: „there is currently no way to monitor with Sentinel a set of master and replica instances deployed with Docker, **unless you instruct Docker to map the port 1:1**.“ Workaround: `sentinel announce-ip` / `sentinel announce-port`.
- **Failover braucht Zeit:** Beispielkonfiguration in der Doku: `sentinel down-after-milliseconds mymaster 60000`, `sentinel failover-timeout mymaster 180000`. *(Das sind Werte aus dem Beispiel-`sentinel.conf`, nicht zwingend die Defaults.)*
- **Client-Unterstützung nötig:** „You need Sentinel support in your clients. Popular client libraries have Sentinel support, but not all.“
- **Betriebsregel:** „There is no HA setup which is safe if you don't test from time to time in development environments, or even better if you can, in production environments, if they work.“

`https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/`

- **Verlustfenster im Cluster:** „Acceptable degree of write safety: the system tries (in a best-effort way) to retain all the writes originating from clients connected with the majority of the master nodes. **Usually there are small windows where acknowledged writes can be lost.** Windows to lose acknowledged writes are larger when clients are in a minority partition.“
- **Konkretes Verlustszenario:** „A write may reach a master, but while the master may be able to reply to the client, the write may not be propagated to replicas via the asynchronous replication used between master and replica nodes. If the master dies without the write reaching the replicas, the write is lost forever […] However it is a real world failure mode.“
- **Failover-Dauer:** „the cluster becomes available again after `NODE_TIMEOUT` time plus a few more seconds required for a replica to get elected and failover its master (**failovers are usually executed in a matter of 1 or 2 seconds**)“.
- **Kein Schutz bei großen Netzsplits:** „This means that Redis Cluster is designed to survive failures of a few nodes in the cluster, but it is **not a suitable solution for applications that require availability in the event of large net splits**.“

### B.2.3 Was das konkret für Session-Daten bedeutet („Session weg = Benutzer abgemeldet“)

**Schlussfolgerung aus den belegten Mechanismen** (kein einzelnes Doku-Zitat):

| Ereignis | Belegter Mechanismus | Folge für Sessions |
|---|---|---|
| Prozess-Absturz ohne sauberes Herunterfahren mit **RDB allein** | „you should be prepared to lose the latest minutes of data“ | Bis zu mehrere Minuten an Logins/Session-Writes weg → betroffene Nutzer abgemeldet |
| Absturz mit **AOF + `everysec`** (Default) | „you may lose 1 second of data if there is a disaster“ | Verlustfenster ≈ 1 s → praktisch nur „die letzte Aktion“ betroffen |
| **`appendfsync no`** | „Normally Linux will flush data every 30 seconds“ | Verlustfenster bis ~30 s (kernabhängig) |
| **Eviction** durch `maxmemory` (Policy greift) | siehe B.3 | Session-Keys können **aktiv gelöscht** werden, unabhängig von Persistenz → Nutzer abgemeldet |
| **Failover** (Sentinel oder Cluster) | „acknowledged writes can still be lost during a failover“ / „Usually there are small windows where acknowledged writes can be lost.“ | Letzte Logins/Updates können verschwinden |
| **Persistenzloser Master mit Auto-Restart + Replica** | „they'll effectively destroy their copy of the data“ | **Totalverlust aller Sessions**, nicht nur eines Fensters |
| **Voll-Resync einer Replica** | „The replica will block incoming connections during this brief window“ | Logins schlagen für Sekunden fehl (Verfügbarkeit, nicht Verlust) |
| **Docker/NAT + Sentinel falsch konfiguriert** | „Sentinel will never be able to failover the master“ | Kein automatischer Failover → längere Ausfallzeit |

**Konsequenz für die Architektur:** Wenn „Nutzer abgemeldet“ akzeptabel ist, ist Redis als **Session-Cache** mit jeder Policy außer `noeviction` vertretbar. Wenn „Nutzer abgemeldet“ **nicht** akzeptabel ist, braucht es eine persistente Login-Wahrheit in Postgres plus ein Redis-Verlust-Toleranz-Design (z. B. Session-Neuaufbau aus einem Cookie-Token, das Redis nur beschleunigt).

### B.2.4 Was dagegen spricht / Unsicherheiten

- **Kein Doku-Beleg für „Session weg = Benutzer abgemeldet“ als Formulierung.** Die Doku beschreibt Verlustfenster und Eviction, nicht die Anwendungsfolge. Die Tabelle oben ist eine **begründete Schlussfolgerung**, klar als solche markiert.
- **`WAIT` löst das Problem nicht vollständig** — die Doku sagt es selbst: „it does not turn a set of Redis instances into a CP system with strong consistency“. Es ist eine Wahrscheinlichkeitsverbesserung.
- **Sentinel-Failover-Dauer habe ich für Sentinel nicht belegt** (nur für Cluster: „1 or 2 seconds“). Die 180 000 ms in der Beispielkonfiguration sind ein Beispielwert, **kein belegter Default**.
- **Keine belegte Zahl für „wie viele Writes pro Sekunde bei `appendfsync always`“** — die Doku sagt nur „Very very slow“. Belastbare Performance-Zahlen zu fsync-Policies sind hier **nicht belegt**.
- **Ob `WAIT` in deinem Bun-Redis-Client verfügbar ist**, ist nicht Doku-Thema → nicht belegt.

---

## B.3 TTL und Eviction: welche Policy für Session-Keys, welche zerstört Daten

### B.3.1 Empfehlung

- **`maxmemory` explizit setzen.** Der Default `0` heißt „kein Limit“ auf 64-Bit-Systemen — dann greift Eviction nie und Redis kann den Host per OOM killen. Bei Replikation/Persistenz Speicher für Puffer freihalten.
- **Für Session-Keys: `volatile-ttl` oder `volatile-lru`** — **und jede Session bekommt zwingend eine TTL.** Grund: `volatile-*` fasst nur Keys mit Ablauf an; Sessions ohne TTL sind damit vor Eviction geschützt.
- **`noeviction` nur, wenn Redis der Datenspeicher ist und Schreibfehler gewünscht sind** (dann ist aber Postgres die bessere Wahl, siehe B.1).
- **`allkeys-lru` NIEMALS in einer Instanz, die Session-Keys ohne TTL enthält.** Diese Policy kann jeden Key löschen, also auch Sessions, die nie ablaufen sollten → Nutzer wird mitten in der Arbeit abgemeldet.
- **Cache und Sessions trennen** — die Doku empfiehlt es selbst („you should consider running two separate Redis instances in a case like this, if possible“).
- **Zwei Redis-Instanzen / zwei logische DBs:** eine für Cache mit `allkeys-lru` (speichereffizient, kein TTL nötig), eine für Sessions mit `volatile-ttl` (TTL Pflicht).
- **Monitoring:** `keyspace_hits`/`keyspace_misses` und `evicted_keys` auswerten.

### B.3.2 Belege

`https://redis.io/docs/latest/develop/reference/eviction/`

- **Mechanik:** „Redis lets you specify an eviction policy to evict keys automatically when the size of the cache exceeds a set memory limit. Whenever a client runs a new command that adds more data to the cache, Redis checks the memory usage. If it is greater than the limit, Redis evicts keys according to the chosen eviction policy until the total memory used is back below the limit.“
- **Default-Risiko:** „Set `maxmemory` to zero to specify that you don't want to limit the memory for the dataset. **This is the default behavior for 64-bit systems**, while 32-bit systems use an implicit memory limit of 3GB.“
- **Die vollständige Policy-Liste, wörtlich:**
  - „`noeviction`: **Keys are not evicted but the server will return an error** when you try to execute commands that cache new data. If your database uses replication then this condition only applies to the primary database. Note that commands that only read existing data still work as normal.“
  - „`allkeys-lru`: Evict the least recently used (LRU) keys.“
  - „`allkeys-lrm`: Evict the least recently modified (LRM) keys.“ *(Redis 8.6)*
  - „`allkeys-lfu`: Evict the least frequently used (LFU) keys.“
  - „`allkeys-random`: Evict keys at random.“
  - „`volatile-lru`: Evict the least recently used keys **that have an associated expiration (TTL)**.“
  - „`volatile-lrm`, `volatile-lfu`, `volatile-random`: (jeweils nur Keys mit TTL)“
  - „`volatile-ttl`: Evict keys with an associated expiration (TTL) **that have the shortest remaining TTL value**.“
- **Die kritische Regel, wörtlich:** „The `volatile-xxx` policies behave like `noeviction` if no keys have an associated expiration.“ → Ohne TTL auf den Sessions schlägt eine `volatile-*`-Policy in Richtung Schreibfehler um.
- **Die Doku-Empfehlung als „rule of thumb“:** „Use `allkeys-lru` when you expect that a subset of elements will be accessed far more often than the rest. […] so **`allkeys-lru` is a good default option if you have no reason to prefer any others.**“
- **Wann `volatile-ttl`:** „Use `volatile-ttl` if your code can estimate which keys are good candidates for eviction and assign short TTLs to them. Note also that if you make good use of key expiration, then you are less likely to run into the cache memory limit because keys will often expire before they need to be evicted.“
- **Speicherkosten von TTL:** „Also note that setting an `expire` value for a key costs memory, so a policy like `allkeys-lru` is more memory efficient since it doesn't need an `expire` value to operate.“
- **Trennung von Cache und persistenten Keys:** „The `volatile-lru`, `volatile-lrm`, and `volatile-random` policies are mainly useful when you want to use a single Redis instance for both caching and for a set of persistent keys. **However, you should consider running two separate Redis instances in a case like this, if possible.**“
- **LRU ist approximiert, wörtlich:** „The Redis LRU algorithm uses an approximation of the least recently used keys rather than calculating them exactly. **It samples a small number of keys at random** and then evicts the ones with the longest time since last access.“ Und: „The reason Redis does not use a true LRU implementation is because it costs more memory.“ Tuning: `maxmemory-samples 5`.
- **LRM (neu):** „Starting with Redis 8.6, the Least Recently Modified (LRM) eviction policy is available. LRM is similar to LRU but only updates the timestamp on write operations, not read operations.“
- **LFU:** „Starting with Redis 4.0, the Least Frequently Used eviction mode is available.“ Defaults laut Doku: „Saturate the counter at, around, one million requests.“ / „Decay the counter every one minute.“ Tuning: `lfu-log-factor 10`, `lfu-decay-time 1`.
- **Monitoring:** „the `INFO stats` section includes two important entries, `keyspace_hits` […] and `keyspace_misses`“. Rechnung: `keyspace_hits / (keyspace_hits + keyspace_misses) * 100`. Und: „If the actual percentage is lower, check the value of `evicted_keys` (also returned by `INFO stats`). A high proportion of evictions would suggest that the wrong keys are being evicted too often by your chosen policy“.
- **Replikations-Interaktion:** `https://redis.io/docs/latest/operate/oss_and_stack/management/replication/`: „By default, a replica will ignore `maxmemory` […] It means that the eviction of keys will be handled by the master, sending the DEL commands to the replica as keys evict in the master side.“ Und: „Make sure you monitor your replicas, and make sure they have enough memory to never hit a real out-of-memory condition before the master hits the configured `maxmemory` setting.“

### B.3.3 Was dagegen spricht / Unsicherheiten

- **Welche Policy „richtig“ ist, ist eine Anwendungsentscheidung.** Die Doku liefert Mechanik und eine „rule of thumb“ für Cache-Workloads (`allkeys-lru`), aber **keine** Empfehlung speziell für Session-Keys. Meine Empfehlung `volatile-ttl` mit TTL-Pflicht ist eine **Schlussfolgerung**: `volatile-*` ist die einzige Policy-Familie, die Keys ohne TTL grundsätzlich unangetastet lässt.
- **Der Default von `maxmemory-policy` ist in dem von mir gelesenen Text NICHT genannt.** Ich habe die Eviction-Seite vollständig gelesen; sie nennt nur „Use the `maxmemory-policy` configuration directive to select the eviction policy“ und die Liste. **Welchen Wert `maxmemory-policy` ab Werk hat, ist damit nicht belegt** — vor dem Deployment explizit prüfen und setzen.
- **LRU-Approximation heißt: Session-Eviction ist probabilistisch, nicht deterministisch.** Es gibt keine Garantie, dass die älteste Session zuerst fliegt. Konkrete „Wie viele Sessions überleben bei X GB“-Rechnungen sind **nicht belegt**.
- **`maxmemory-samples 10` „closely approximates true LRU, at the cost of some additional CPU usage“** — die Doku nennt keinen Default für `maxmemory-samples` in dem gelesenen Text; sie zeigt nur `maxmemory-samples 5` als Konfigurationsbeispiel. **Default nicht belegt.**
- **LRM und die neueren Policies sind sehr frisch** (Redis 8.6). Die Doku zu LRM ist knapp; ein Reifegrad-Urteil ist **nicht belegt**.
- **OOM-Verhalten ohne `maxmemory`-Limit** („Host wird gekillt“) ist eine Schlussfolgerung, die Doku sagt nur, dass es kein Limit gibt.

---

## B.4 Pub/Sub vs. Streams für Live-Chat

### B.4.1 Empfehlung

- **Pub/Sub ausschließlich für flüchtige Signale** („neue Nachricht in Chat X — hol sie dir“) — und **niemals** als Transportweg der Nachricht selbst.
- **Für den Nachrichtenstrom: Redis Streams mit Consumer Groups.**
- **Konkret pro Chat ein Stream** (`chat:{chatId}:events`) oder pro Mandant, mit `XADD ... MAXLEN ~ N` als Speichergrenze.
- **Consumer Group + `XREADGROUP` + `XACK`**; nicht bestätigte Einträge per `XAUTOCLAIM` zurückholen; „deleted IDs“ aus `XAUTOCLAIM` in einen Dead-Letter-Pfad schicken.
- **Postgres bleibt die Quelle der Wahrheit.** Redis Streams ist der Transport-/Replay-Puffer, nicht das Archiv. *(Architekturempfehlung; die Doku sagt das nicht, aber sie beschreibt Streams als „moderate-scale, short-retention“.)*

### B.4.2 Belege

`https://redis.io/docs/latest/develop/use-cases/streaming/`

- **Pub/Sub-Verlust, wörtlich (die für dich wichtigste Zeile):** „**Pub/sub** (Redis Pub/Sub, MQTT) is **fire-and-forget transport**: messages are delivered to whoever is connected and **discarded, with no persistence, replay, or consumer tracking**.“
- **Noch deutlicher:** „This pattern is distinct from pub/sub, which is **at-most-once transport with no history**: a subscriber that's offline when a message is published **misses it for good**.“
- **Kontrast zu Streams:** „Streaming retains the ordered history, so many independent consumer groups can read the same events at their own pace and replay from any point.“
- **Was Streams liefern:** „You can: Deliver ordered events to multiple independent consumer groups, each processing the full stream at its own pace. / Scale consumers horizontally within a group to share work across workers, with **at-least-once delivery** and per-consumer tracking. / **Replay historical events** for debugging, bootstrapping a new projection, or rebuilding a downstream system from scratch. / **Bound memory by retaining events by length or by minimum ID**, without a separate cleanup job. / Recover unacknowledged entries from crashed consumers […] / Partition streams by tenant, region, or entity […]“
- **Der Mechanismus, wörtlich:** „producers append events to a stream with `XADD` and Redis assigns each entry an auto-generated, time-ordered ID. Consumers either read the stream directly with `XREAD`, or join a *consumer group* and read with `XREADGROUP`. Each consumer gets its own pending-entries list of in-flight messages, while the group as a whole tracks a single `last-delivered-id` cursor that advances as entries are handed out to any consumer. Once a consumer finishes processing an entry, it acknowledges it with `XACK`; entries left unacknowledged past a timeout can be reassigned to a healthy consumer with `XCLAIM` or `XAUTOCLAIM`.“
- **Retention-Kontrolle:** „Retention controls — `XADD ... MAXLEN ~ n` and `XTRIM MINID ~ id` — bound stream size by length or by oldest event, so memory stays bounded as the stream rolls forward.“
- **Der feine, wichtige Fallstrick:** „entries trimmed by `MAXLEN ~` before they are acked are surfaced in `XAUTOCLAIM`'s deleted-IDs list, so the caller can route them to a dead-letter store rather than retry against a missing payload“ → **`MAXLEN ~` kann Einträge verwerfen, bevor sie verarbeitet wurden.** Für ein Chat-Harness heißt das: Postgres muss die Nachricht bereits haben.

`https://redis.io/docs/latest/develop/data-types/streams/`

- **Streams bleiben bei 0 Einträgen bestehen** (Unterschied zu anderen Datentypen): „A difference between streams and other Redis data structures is that when the other data structures no longer have any elements […] the key itself will be removed. […] Streams, on the other hand, are allowed to stay at zero elements“. Grund: „The reason why such an asymmetry exists is because Streams may have associated consumer groups, and we do not want to lose the state that the consumer groups defined just because there are no longer any items in the stream.“
- **Durchsatz (Doku-Angabe):** „`XADD` is very fast and can easily insert **from half a million to one million items per second** in an average machine if pipelining is used.“
- **Latenzmessung der Doku (mit Vorbehalt der Doku selbst):** „Processed between 0 and 1 ms -> 74.11% / Processed between 1 and 2 ms -> 25.80% / Processed between 2 and 3 ms -> 0.06% / Processed between 3 and 4 ms -> 0.01% / Processed between 4 and 5 ms -> 0.02%“. Und die Einschränkung: „The system used for this benchmark is very slow compared to today's standards.“ Sowie: „Here we processed up to 10k messages per iteration […] This adds a lot of latency but is needed in order to allow the slow consumers to be able to keep with the message flow. So you can expect a real world latency that is a lot smaller.“
- **Push-Modell (relevant für Realtime-Feeling):** „This model is *push-based*, since adding data to the consumers buffers will be performed directly by the action of calling `XADD`, so the latency tends to be quite predictable.“
- **Neuere Löschsteuerung:** „Starting with Redis 8.2, the `XDELEX` command provides enhanced control over entry deletion, particularly when working with consumer groups. Like other enhanced commands, it supports `KEEPREF`, `DELREF`, and `ACKED` options“. Beispiel: „This allows you to delete entries only when they have been acknowledged by all consumer groups (`ACKED`)“.

`https://redis.io/glossary/pub-sub/` *(via Suchmaschinen-Auszug mit Originaltext, kein vollständiger Seitenabruf)*

- „These messages are **fire-and-forget**, in that if a message is published and no subscribers exists, **the message evaporates and cannot be recovered**.“

`https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/`

- **Sharded Pub/Sub:** „Redis 7.0 and later features sharded pub/sub, in which shard channels are assigned to slots by the same algorithm used to assign keys to slots. A shard message must be sent to a node that owns the slot the shard channel is hashed to.“
- **Klassisches Pub/Sub im Cluster:** „The clients can send SUBSCRIBE to any node and can also send PUBLISH to any node. It will simply broadcast each published message to all other nodes.“ → Bei klassischem Pub/Sub wird jede Nachricht an **alle** Cluster-Knoten gebroadcastet; Sharded Pub/Sub ist die skalierbare Variante.

### B.4.3 Was dagegen spricht / Unsicherheiten

- **Ich habe die Seiten `xadd`, `xreadgroup`, `xack`, `xclaim`, `xautoclaim`, `xpending`, `xtrim` NICHT einzeln gelesen.** Alle Aussagen zu deren Semantik stammen aus den verlinkenden Übersichtsseiten (`use-cases/streaming/` und `data-types/streams/`), die diese Befehle beschreiben. Für exakte Parameter- und Fehlersemantik müssen die Command-Seiten separat geprüft werden → **Detailunsicherheit**, keine Falschaussage.
- **Streams im Redis Cluster:** Der von mir gelesene Cluster-Spec-Text behandelt Streams **nicht** explizit (nur Pub/Sub und generische Multi-Key-Regeln). Wie Consumer Groups sich beim Resharding eines Stream-Keys verhalten, ist **nicht belegt**. Für HA mit Streams wäre Sentinel (mit Einschränkungen) oder Cluster mit sorgfältigem Key-Design nötig — konkrete Empfehlung nicht belegt.
- **`MAXLEN ~` ist approximativ** (die Tilde). Die Doku sagt, dass dadurch Speicher begrenzt wird, aber **nicht**, um wie viele Einträge genau getrimmt wird. Für „wir behalten die letzten 1000 Nachrichten“ ist `MAXLEN ~ 1000` also **keine** exakte Garantie. (Schlussfolgerung aus der Tilde-Notation; die Doku quantifiziert die Abweichung nicht.)
- **Die Stream-Latenzzahlen sind nicht auf dein System übertragbar** — die Doku weist selbst darauf hin („very slow compared to today's standards“).
- **At-least-once ≠ exactly-once.** Verarbeitung muss idempotent sein. Die Doku nennt „at-least-once delivery“, sagt aber nichts über Deduplizierung → **Idempotenz ist deine Aufgabe, nicht belegt wie.**

---

## B.5 Rate-Limiting in Redis: Algorithmen und offizielle Quellen

### B.5.1 Empfehlung

- **Fixes Fenster mit `INCR` + `EXPIRE`** genügt meist. Wichtig: die beiden Befehle **atomar** ausführen (Lua/`EVAL`), sonst Race Condition.
- **Für weiche Fenster: ZSET Sliding Window Log** (`ZREMRANGEBYSCORE` + `ZCARD` + `ZADD`) in Lua.
- **Für glatte Raten: Token Bucket** in einem `HASH` per Lua.
- **Im Bundle: Rate Limiting in Redis, nicht in Postgres.** Grund: die Doku ordnet es Redis zu („cache, sessions, or rate limiting“).

### B.5.2 Belege

`https://redis.io/docs/latest/commands/incr/` *(vollständig gelesen)*

- **Pattern 1 (fixes Fenster), wörtlich aus der Doku:**
  ```
  FUNCTION LIMIT_API_CALL(ip)
  ts = CURRENT_UNIX_TIME()
  keyname = ip+":"+ts
  MULTI
      INCR(keyname)
      EXPIRE(keyname,10)
  EXEC
  current = RESPONSE_OF_INCR_WITHIN_MULTI
  IF current > 10 THEN
      ERROR "too many requests per second"
  ELSE
      PERFORM_API_CALL()
  END
  ```
  Kommentar der Doku: „In this example, there is a counter for every IP, for every different second. […] Note the used of `MULTI` and `EXEC` in order to make sure that we'll both increment and set the expire at every API call.“ Und: „Both examples limit API calls to a maximum of **ten requests per second per IP address**.“
- **Pattern 2 inkl. der dokumentierten Race Condition, wörtlich:** „**In the above code there is a race condition.** If for some reason the client performs the `INCR` command but does not perform the `EXPIRE` the key will be leaked until we'll see the same IP address again.“
- **Der offizielle Lua-Fix, wörtlich aus der Doku:**
  ```lua
  local current
  current = redis.call("incr",KEYS[1])
  if current == 1 then
      redis.call("expire",KEYS[1],1)
  end
  ```
  Mit dem Hinweis: „This can be easily fixed by turning the `INCR` with optional `EXPIRE` into a Lua script that is then sent using the `EVAL` command“.
- **Listen-Variante als Alternative:** „There is a different way to fix this issue without using scripting, by using Redis lists instead of counters.“ (`LLEN` / `RPUSH` / `RPUSHX`). Und die tolerierte Race: „Note that we have a race here, but it is not a problem […] However this race will just miss an API call under rare conditions, so the rate limiting will still work correctly.“
- **Counter-Pattern generell:** „It is possible to use `INCR` and `EXPIRE` together at every page view to have a counter counting only the latest N page views separated by less than the specified amount of seconds.“
- ACL-Kategorie: `@write`, `@string`, `@fast`; Komplexität `O(1)`; „Available since: Redis Open Source 1.0.0“.

`https://redis.io/tutorials/howtos/ratelimiting/` *(via Suchmaschinen-Auszug mit Originaltext; Codeblöcke stammen wörtlich aus der Seite, kein vollständiger Abruf)*

- Die Seite ist betitelt „Build 5 Rate Limiters with Redis: Fixed Window, Sliding Window, Token Bucket, and Leaky Bucket“ und enthält fünf vollständige Lua-Implementierungen:
  1. **Fixed window counter** — „**STRING** — one key per window, using `INCR` to bump the count and `EXPIRE` to auto-clean the key.“ Lua: `redis.call('INCR', key)` / `if count == 1 then redis.call('EXPIRE', key, window_seconds) end` / `redis.call('PTTL', key)`.
  2. **Sliding window log** (ZSET) — Lua: `redis.call('ZREMRANGEBYSCORE', key, 0, window_start)`, `redis.call('ZCARD', key)`, `redis.call('ZADD', key, now, member)`, `redis.call('EXPIRE', key, window_seconds)`, plus `ZRANGE ... WITHSCORES` für `retry-after`.
  3. **Sliding window counter** — zwei Keys (`current_key`, `previous_key`) mit gewichteter Vorgängerzählung: `local weighted_prev = prev_count * (1 - elapsed)`.
  4. **Token bucket** — `HGETALL`/`HSET` auf einem Hash mit `tokens` + `last_refill`: `local new_tokens = elapsed * refill_rate`; `tokens = math.min(max_tokens, tokens + new_tokens)`.
  5. **Leaky bucket** — zwei Varianten (`LUA_POLICING` mit `level`/`last_leak`, `LUA_SHAPING` mit `next_free`).
- **Begründung Lua vs. MULTI, wörtlich:** „The entire increment-and-expire sequence runs inside a single `EVAL` call. Redis executes Lua scripts atomically, so no other command can interleave between the `INCR` and the `EXPIRE`. Without this, a crash between the two commands could leave a key with no expiry, permanently blocking that client. **A `MULTI`/`EXEC` transaction can't conditionally set `EXPIRE` only when `count == 1` since it can't branch on intermediate results**“.

`https://redis.io/glossary/rate-limiting/` *(via Suchmaschinen-Auszug mit Originaltext; kein vollständiger Abruf)*

- „Building a rate limiter with Redis is easy because of two commands `INCR` and `EXPIRE`. This service states that it is limited to **20 requests in any given minute**.“
- Das dokumentierte Muster: Schlüssel aus API-Key und Minutennummer, dann
  ```
  MULTI
    INCR [user-api-key]:[current minute number]
    EXPIRE [user-api-key]:[current minute number] 59
  EXEC
  ```
  mit der Begründung: „`EXPIRE` is inside a `MULTI` transaction along with the `INCR`, which means form a single atomic operation.“ Und die benannte Schwäche: „The worse-case failure situation is if, for some very strange and unlikely reason, the Redis server dies between the `INCR` and the `EXPIRE`. When restoring either from an AOF or in-memory replication, the `INCR` will not be restored since the transaction was not complete.“

### B.5.3 Was dagegen spricht / Unsicherheiten

- **Zwei der drei Rate-Limiting-Quellen wurden nicht vollständig abgerufen** (Suchauszug statt Seitenscrape): `redis.io/tutorials/howtos/ratelimiting/` und `redis.io/glossary/rate-limiting/`. Die zitierten Codeblöcke und Sätze stammen wörtlich aus den Auszügen; **Vollständigkeit und Aktualität der Seiten ist damit nicht abschließend geprüft.** Das ist eine bewusste, hier offengelegte Einschränkung.
- **Der `INCR`-Befehl ist auf 64-Bit signed integers begrenzt** („This operation is limited to 64 bit signed integers.“) — für Zähler irrelevant, aber belegt.
- **Die Doku nennt keine Algorithmus-Empfehlung** („welcher ist der beste“). Sie zeigt Implementierungen. Die Auswahl ist deine.
- **Redis 8 bringt möglicherweise eingebaute Rate-Limiting-Features mit** — ich habe dazu **nichts** gelesen und behaupte es nicht. **Nicht belegt.**
- **Genaue Algorithmus-Eigenschaften** (z. B. „Sliding Window Log ist speicherintensiver als Token Bucket bei hoher Rate“) sind in den Auszügen **nicht** quantifiziert → nicht belegt.

---

## B.6 Cluster/HA-Fallstricke für Sessions: Key-Slots, Multi-Key-Lua, Hash Tags

### B.6.1 Empfehlung

- **Wenn mehrere Keys zu einer Session gehören** (Session-Daten + Rate-Limit-Zähler + Presence), sie mit **Hash Tags** in denselben Slot zwingen: `{sess:<sessionId>}:data`, `{sess:<sessionId>}:ratelimit`.
- **Bei Lua-Skripten mit mehreren Keys: alle Keys im selben Slot.** Also entweder Hash Tags verwenden oder das Skript auf einen einzigen Key reduzieren.
- **Kein `SELECT`** — Cluster kennt nur Datenbank `0`.
- **Sentinel statt Cluster, wenn du nur ein kleines HA-Setup brauchst** und keine Sharding-Skalierung; Sentinel ist für genau diesen Fall gedacht und braucht kein clientseitiges Slot-Routing.
- **Sentinel: ≥ 3 Instanzen in unabhängigen Fehlerdomänen**, und **nicht hinter Port-Remapping/Docker-NAT ohne `1:1`-Portmapping**.
- **`min-replicas-to-write 1` / `min-replicas-max-lag 10`** als Bremse gegen Schreiben in eine Minderheitspartition.
- **Key-Namen mandantenfähig und slot-freundlich designen**, damit `SCAN MATCH` im Cluster nur einen Slot durchsucht.

### B.6.2 Belege

`https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/`

- **Slot-Modell, wörtlich:** „The cluster's key space is split into **16384 slots**, effectively setting an upper limit for the cluster size of 16384 master nodes (however, the suggested max size of nodes is on the order of ~ 1000 nodes).“
- **Die Formel:** `HASH_SLOT = CRC16(key) mod 16384`. Und: „14 out of 16 CRC16 output bits are used (this is why there is a modulo 16384 operation in the formula above).“
- **Die Multi-Key-Regel, wörtlich:** „Redis Cluster implements all the single key commands available in the non-distributed version of Redis. **Commands performing complex multi-key operations like set unions and intersections are implemented for cases where all the keys involved in the operation hash to the same slot.**“
- **Hash Tags, wörtlich:** „There is an exception for the computation of the hash slot that is used in order to implement **hash tags**. Hash tags are a way to ensure that multiple keys are allocated in the same hash slot. This is used in order to implement multi-key operations in Redis Cluster. […] If the key contains a “{...}” pattern only the substring between `{` and `}` is hashed in order to obtain the hash slot.“
- **Die Regeln im Detail, mit den Beispielen der Doku:**
  - „The two keys `{user1000}.following` and `{user1000}.followers` will hash to the same hash slot since only the substring `user1000` will be hashed in order to compute the hash slot.“
  - „For the key `foo{}{bar}` the whole key will be hashed as usual since the first occurrence of `{` is followed by `}` on the right without characters in the middle.“
  - „For the key `foo{{bar}}zap` the substring `{bar` will be hashed, because it is the substring between the first occurrence of `{` and the first occurrence of `}` on its right.“
  - „For the key `foo{bar}{zap}` the substring `bar` will be hashed, since the algorithm stops at the first valid or invalid (without bytes inside) match of `{` and `}`.“
  - „if the key starts with `{}`, it is guaranteed to be hashed as a whole. This is useful when using binary data as key names.“
- **Kein Multi-DB im Cluster:** „Redis Cluster does not support multiple databases like the standalone version of Redis. **We only support database `0`; the `SELECT` command is not allowed.**“
- **Resharding unterbricht Multi-Key-Operationen:** „However, during manual resharding, multi-key operations may become unavailable for some time while single-key operations are always available.“
- **Glob-Pattern-Optimierung (Redis 8.0):** „Commands accepting a glob-style pattern, including `KEYS`, `SCAN` and `SORT`, are optimized for patterns that imply a single slot. […] The pattern slot optimization is introduced in Redis 8.0.“ Bedingungen: „the pattern contains a hashtag, there are no wildcards or escape characters before the hashtag, and the hashtag within curly braces doesn't contain any wildcards or escape characters.“ Beispiel: „`SCAN 0 MATCH {abc}*` can successfully recognize the hashtag and scans only the slot corresponding to `abc`. However, the patterns `*{abc}`, `{a*c}`, or `{a\*bc}` cannot recognize the hashtag, so all slots need to be scanned.“
- **Client-Redirects:** „Since cluster nodes are not able to proxy requests, clients may be redirected to other nodes using redirection errors `-MOVED` and `-ASK`.“ Und: „However clients that are able to cache the map between keys and nodes can improve the performance in a sensible way.“
- **Write-Safety:** „Redis Cluster uses asynchronous replication between nodes, and **last failover wins** implicit merge function. […] **There is always a window of time when it is possible to lose writes during partitions.**“ Und: „Windows to lose acknowledged writes are larger when clients are in a minority partition.“
- **Minderheitsseite wird unavailable:** „the minority side of a Redis Cluster will start refusing writes as soon as `NODE_TIMEOUT` time has elapsed without contact with the majority, so there is a maximum window after which the minority becomes no longer available.“
- **Nicht für große Netzsplits:** „This means that Redis Cluster is designed to survive failures of a few nodes in the cluster, but it is not a suitable solution for applications that require availability in the event of large net splits.“
- **Beispielrechnung der Doku:** „in a cluster with 5 nodes and a single replica per node, there is a `1/(5*2-1) = 11.11%` probability that after two nodes are partitioned away from the majority, the cluster will no longer be available.“

`https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/`

- Geltungsbereich: „Redis Sentinel provides high availability for Redis when **not using Redis Cluster**.“
- **Failover in der Minderheit ist ausgeschlossen:** „In practical terms this means during failures **Sentinel never starts a failover if the majority of Sentinel processes are unable to talk** (aka no failover in the minority partition).“
- **Sentinel nutzt Pub/Sub zur Discovery:** „Sentinel uses the Redis instances Pub/Sub capabilities in order to discover the other Sentinels that are monitoring the same masters and replicas. This feature is implemented by sending *hello messages* into the channel named `__sentinel__:hello`.“ Und: „Every Sentinel publishes a message to every monitored master and replica Pub/Sub channel `__sentinel__:hello`, every two seconds, announcing its presence with ip, port, runid.“
- **Docker/NAT-Fallstrick im Detail:** „Sentinel auto-discovery of other Sentinels no longer works, since it is based on *hello* messages where each Sentinel announce at which port and IP address they are listening for connection. However Sentinels have no way to understand that an address or port is remapped“. Und: „**unless you instruct Docker to map the port 1:1**“. Workaround: `sentinel announce-ip <ip>` / `sentinel announce-port <port>`.
- **Replica-Auswahl bei Failover:** „1. The replicas are sorted by `replica-priority` as configured in the `redis.conf` file of the Redis instance. A lower priority will be preferred. 2. If the priority is the same, the replication offset processed by the replica is checked, and the replica that received more data from the master is selected. 3. If multiple replicas have the same priority and processed the same data from the master, a further check is performed, selecting the replica with the lexicographically smaller run ID.“
- **Ungültige Replica:** „A replica whose `INFO` output suggests it has been disconnected from the master for more than `(down-after-milliseconds * 10) + milliseconds_since_master_is_in_SDOWN_state` Is considered to be unreliable and is disregarded entirely.“
- **Never-master-Replica:** „A Redis instance can be configured with a special `replica-priority` of zero in order to be **never selected** by Sentinels as the new master.“
- **TILT-Modus als Betriebsüberraschung:** „When in TILT mode the Sentinel will continue to monitor everything, but: It stops acting at all. It starts to reply negatively to `SENTINEL is-master-down-by-addr` requests“. Ausgelöst durch Zeitsprünge: „if the time difference is negative or unexpectedly big (2 seconds or more) the TILT mode is entered“.
- **Version:** „The current version of Sentinel is called **Sentinel 2**. […] A stable release of Redis Sentinel is shipped since Redis 2.8. […] Redis Sentinel version 1, shipped with Redis 2.6, is deprecated and should not be used.“
- **Port:** „Sentinels by default run **listening for connections to TCP port 26379**“.

### B.6.3 Was dagegen spricht / Unsicherheiten

- **Der Cluster-Spec-Text sagt NICHT wörtlich „ein Lua-Skript mit Keys aus verschiedenen Slots schlägt fehl“.** Er sagt: Multi-Key-Operationen funktionieren, wenn alle Keys im selben Slot liegen. Die Fehlersemantik von `EVAL` bei Cross-Slot-Keys steht in der `EVAL`-Command-Doku, die ich **nicht gelesen** habe → **exakte Fehlermeldung und Verhalten nicht belegt.** Die Empfehlung „Hash Tags für Multi-Key-Lua“ ist die direkte Schlussfolgerung aus der zitierten Multi-Key-Regel.
- **Hash Tags haben einen Preis:** Alle Sessions in einem gemeinsamen Hash-Tag-Präfix würden in **einen** Slot und damit auf **einen** Master kollabieren. Die Doku nennt diesen Nachteil in dem gelesenen Text **nicht** explizit (sie warnt nur generell: „data is never moved between nodes except when resharding“). → Hot-Slot-Risiko ist meine Schlussfolgerung, **nicht belegt**.
- **Je Session ein Hash Tag** (z. B. `{sess:<uuid>}`) streut gut, ist aber pro Session nur ein Slot — bei serverseitigen Skripts über mehrere Sessions hinweg funktioniert es dann nicht mehr.
- **Streams + Cluster-Key-Design:** Der Cluster-Spec behandelt Streams **nicht**. Wenn ein Stream pro Chat in einen Slot fällt, ist der Chat an einen Master gebunden; ein sehr aktiver Chat wird damit zum Hot Spot. Konsequenzen für Cluster-Betrieb sind **nicht belegt**.
- **Sentinel und Cluster sind nicht kombinierbar** (Sentinel = „when not using Redis Cluster“), also musst du dich entscheiden.
- **Sentinel braucht Client-Unterstützung:** „You need Sentinel support in your clients. Popular client libraries have Sentinel support, but not all.“ Ob der von dir gewählte Bun-Redis-Client Sentinel unterstützt, ist **nicht belegt** und muss geprüft werden.
- **TILT-Modus kann in virtualisierten Umgebungen (Windows-Dev!) durch Zeitsprünge ausgelöst werden.** Die Doku beschreibt den Auslöser (Zeitdifferenz ≥ 2 s), nennt aber keine VM-Häufigkeiten → Auswirkung auf Windows-Dev-Umgebungen ist **nicht belegt**.

---

# Alle Quellen

Alle URLs wurden in dieser Sitzung tatsächlich abgerufen und ihr Inhalt ausgewertet. Wo „nur Auszug“ steht, lag ein Suchmaschinen-Auszug mit Originaltext vor, kein vollständiger Seitenabruf.

## PostgreSQL (postgresql.org)

1. https://www.postgresql.org/docs/current/ddl-constraints.html — Constraints, FK, `ON DELETE`, `NOT NULL` (A.1, A.6.2)
2. https://www.postgresql.org/docs/current/ddl-partitioning.html — Declarative Partitioning, Pruning, Limitations, Best Practices (A.1, A.4.1)
3. https://www.postgresql.org/docs/current/storage-toast.html — TOAST, Strategien, Schwellen (A.4.2)
4. https://www.postgresql.org/docs/current/runtime-config-client.html — `default_toast_compression`, `idle_in_transaction_session_timeout`, `default_transaction_isolation`, `statement_timeout`, `lock_timeout` (A.4.2, A.4.3, A.7)
5. https://www.postgresql.org/docs/current/indexes-multicolumn.html — Leading-Column-Regel, Skip Scan, Spaltenobergrenze (A.2)
6. https://www.postgresql.org/docs/current/indexes-partial.html — Partial Indexes, Prädikat-Implikation, Example 11.4 (A.2)
7. https://www.postgresql.org/docs/current/indexes-index-only-scans.html — Index-only Scans, Visibility Map, `INCLUDE` (A.2)
8. https://www.postgresql.org/docs/current/routine-vacuuming.html — VACUUM, Autovacuum, Schwellen, Visibility Map, XID-Wraparound, MULTIXACT (A.2, A.4.3)
9. https://www.postgresql.org/docs/current/storage-hot.html — Heap-Only Tuples, Bedingungen, `fillfactor` (A.4.4)
10. https://www.postgresql.org/docs/current/textsearch-indexes.html — GIN vs. GiST, Verteilung + FDW (A.5)
11. https://www.postgresql.org/docs/current/pgtrgm.html — Trigrams, Opclasses, Schwellenwerte (A.5)
12. https://www.postgresql.org/docs/current/functions-uuid.html — `uuidv4`, `uuidv7`, `uuid_extract_version`, `uuid_extract_timestamp` (A.6.1)
13. https://www.postgresql.org/docs/current/transaction-iso.html — Isolationsstufen, Tabelle 13.1, Sequenz-Nicht-Transaktionalität, SQLSTATE 40001 (A.6.6, A.7)
14. https://www.postgresql.org/docs/current/datatype-datetime.html — `timestamptz`, UTC-Speicherung, IANA-Zeitzonen, Literal-Typinferenz (A.1, A.6.5)
15. https://www.postgresql.org/docs/release/14.0/ — „Add ability to use LZ4 compression on TOAST data“ (A.4.2)
16. https://www.postgresql.org/docs/release/16.0/ — HOT + BRIN, „Tighten `GENERATED` expression restrictions“ (A.4.4, A.5.3)

**Von PostgreSQL-Seiten referenziert, aber von mir NICHT gelesen (nur als Weiterverweisung genannt):**

17. https://www.postgresql.org/docs/current/ddl-generated-columns.html — Generated Columns (A.5.3, offener Punkt)
18. https://www.postgresql.org/docs/current/datatype-json.html — JSON-Typen (A.6.4, offener Punkt)
19. https://www.postgresql.org/docs/current/indexes-ordering.html — Indexes and `ORDER BY` (A.2.3, offener Punkt)
20. https://www.postgresql.org/docs/current/sql-createtable.html — Storage Parameters (`fillfactor`, `toast_tuple_target`) (A.4.2, A.4.4, offener Punkt)
21. https://datatracker.ietf.org/doc/html/rfc9562 — UUID-Formate (von der UUID-Doku zitiert)

## Use The Index, Luke (use-the-index-luke.com)

22. https://use-the-index-luke.com/no-offset — „We need tool support for keyset pagination“ (A.3)
23. https://use-the-index-luke.com/sql/partial-results/fetch-next-page — „Paging Through Results“ / OFFSET vs. Seek (A.3)

## PgBouncer

24. https://www.pgbouncer.org/features.html — Pooling-Modi, Feature-Matrix, 2 kB/Verbindung (A.7)

## Redis (redis.io) — vollständig gelesen

25. https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/ — RDB, AOF, fsync-Policies, Backups (B.2)
26. https://redis.io/docs/latest/operate/oss_and_stack/management/replication/ — Replikation, `WAIT`, `min-replicas-to-write`, Persistenz-Warnung (B.2, B.3)
27. https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/ — Sentinel, Quorum, Mehrheit, Docker/NAT, TILT (B.1, B.2, B.6)
28. https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/ — 16384 Slots, Hash Tags, Multi-Key, Pub/Sub, Write-Safety (B.4, B.6)
29. https://redis.io/docs/latest/develop/reference/eviction/ — `maxmemory`, alle Eviction-Policies, LRU/LFU/LRM (B.3)
30. https://redis.io/docs/latest/develop/data-types/streams/ — Streams, Consumer Groups, `MAXLEN`, Latenz-Zahlen, XDELEX (B.4)
31. https://redis.io/docs/latest/develop/use-cases/streaming/ — Pub/Sub = fire-and-forget, at-most-once, Streams-Vorteile (B.1, B.4)
32. https://redis.io/docs/latest/commands/incr/ — Rate-Limiter-Patterns 1+2, Race Condition, Lua-Fix (B.5)

## Redis (redis.io) — nur Suchauszug mit Originaltext, kein vollständiger Seitenabruf

33. https://redis.io/tutorials/howtos/ratelimiting/ — „Build 5 Rate Limiters with Redis“ (B.5)
34. https://redis.io/glossary/rate-limiting/ — `INCR`/`EXPIRE`-Muster, `MULTI`/`EXEC` (B.5)
35. https://redis.io/glossary/pub-sub/ — „fire-and-forget … the message evaporates and cannot be recovered“ (B.4)

## Redis — von Doku-Seiten referenziert, aber von mir NICHT gelesen

36. https://redis.io/docs/latest/commands/xadd/ — `XADD` inkl. `MAXLEN`
37. https://redis.io/docs/latest/commands/xreadgroup/ — `XREADGROUP`
38. https://redis.io/docs/latest/commands/xack/ — `XACK`
39. https://redis.io/docs/latest/commands/xclaim/ — `XCLAIM`
40. https://redis.io/docs/latest/commands/xautoclaim/ — `XAUTOCLAIM`
41. https://redis.io/docs/latest/commands/xpending/ — `XPENDING`
42. https://redis.io/docs/latest/commands/xtrim/ — `XTRIM MINID`
43. https://redis.io/docs/latest/commands/xdelex/ — `XDELEX` (Redis 8.2+)
44. https://redis.io/docs/latest/commands/eval/ — Ausführungssemantik von Lua im Cluster
45. https://redis.io/docs/latest/commands/expire/ — `EXPIRE`
46. https://redis.io/docs/latest/commands/wait/ — `WAIT`
47. https://redis.io/docs/latest/develop/use-cases/pub-sub/ — Pub/Sub-Use-Case (von der Streams-Seite verlinkt)
48. https://redis.io/docs/latest/develop/use-cases/job-queue/ — Job-Queue-Use-Case (von der Streams-Seite verlinkt)

**Fehlversuch (404, dokumentiert):** `https://redis.io/docs/latest/develop/use-cases/sessions/` → „Page not found — Sorry, we couldn't find the page you're looking for.“

---

# Nicht belegt / offene Punkte

## Widersprüche und Korrekturen zu Annahmen in der Aufgabenstellung

1. **„TOAST-Kompression ab PG14/16“** — LZ4 wurde in **PG14 als Option** eingeführt (Release Notes PG14, belegt). Eine Umstellung des **Defaults** auf LZ4 in **PG16 ist nicht belegt**: Die PG16-Release-Notes enthalten dazu nichts, und die aktuelle PG18-Doku sagt ausdrücklich „**The default is `pglz`**“. **Die Annahme „PG16 = LZ4-Default“ ist nach der gelesenen Doku falsch.**
2. **„UUID v4 als Primary Key → Index-Lokalität/Schlechtere Performance“** — die Postgres-Doku enthält **keine** solche Aussage. Belegt ist nur, dass Postgres `uuidv4()` **und** `uuidv7()` („time-ordered“) bereitstellt und Funktionen zum Auslesen von Version und Zeitstempel hat. Die Performance-Begründung ist eine **Schlussfolgerung**, kein Zitat. Externe Blogposts zu diesem Thema habe ich bewusst **nicht** zitiert, weil sie keine Primärquellen sind.
3. **„`allkeys-lru` ist der Redis-Default“** — **nicht belegt.** Die Eviction-Seite nennt die Policies und empfiehlt `allkeys-lru` als „good default option“ **für Cache-Workloads**, sagt aber nicht, welcher Wert bei `maxmemory-policy` ab Werk gesetzt ist. Vor dem Deployment explizit prüfen.

## Explizit nicht belegte Punkte

4. **JSONB als Anti-Pattern** — `datatype-json.html` nicht gelesen; in den gelesenen Seiten keine Aussage. **Nicht belegt.**
5. **`tsvector` als `GENERATED ... STORED`-Spalte** — `ddl-generated-columns.html` und `textsearch-tables.html` nicht gelesen. **Nicht belegt**, ob das der aktuelle Standardweg ist.
6. **Empfehlung eines externen Suchindex (Meilisearch/Typesense/OpenSearch)** — von der Postgres-Doku **nirgends** ausgesprochen. Dokumentiert ist nur der Weg Partitionierung + verteilte Suche + FDW. **Alle Schwellenwerte („ab X Zeilen lohnt extern“) sind nicht belegt.**
7. **`maxmemory-policy`-Defaultwert** — nicht im gelesenen Text. **Nicht belegt.**
8. **`maxmemory-samples`-Defaultwert** — die Doku zeigt `maxmemory-samples 5` als Beispiel, nennt aber keinen Default. **Nicht belegt.**
9. **Lua/`EVAL` mit Keys aus verschiedenen Slots im Cluster** — die exakte Fehlersemantik steht in der `EVAL`-Command-Doku, die nicht gelesen wurde. Belegt ist nur die generische Multi-Key-Regel. **Fehlercode/-text nicht belegt.**
10. **Streams im Redis Cluster (Resharding, Consumer Groups, Hot Spots)** — der Cluster-Spec behandelt Streams nicht. **Nicht belegt.**
11. **PgBouncer auf Windows** — die Feature-Seite adressiert das nicht. **Nicht belegt.** Für Windows-Dev also ggf. anderes Pooling oder Direktverbindung.
12. **Bun-Postgres-Treiber + PgBouncer `transaction`-Pooling (Prepared Statements)** — PgBouncer dokumentiert die Server-Seite, nicht den Treiber. **Nicht belegt**, muss getestet werden.
13. **Bun-Redis-Client + Sentinel-Support** — Sentinel-Doku sagt nur „You need Sentinel support in your clients.“ **Treiber-Fähigkeit nicht belegt.**
14. **Konkrete Zahlenwerte, die nirgends belegt sind:**
    - OFFSET-Millisekunden (Winand zeigt nur eine Kurve, „clearly visible from about page 20 onwards“)
    - TOAST-Kompressionsraten für reale Chat-Nachrichten
    - GIN-Indexgröße/-Bauzeit für typische Datenmengen
    - Empfohlener `fillfactor`-Wert für `sessions`
    - Partitionsanzahl-Obergrenze (Doku: „up to a few thousand partitions fairly well“)
    - Redis-Durchsatz bei `appendfsync always`
    - Sentinel-Failover-Dauer (nur Cluster: „usually executed in a matter of 1 or 2 seconds“)
    - „Wie viele Sessions überleben bei X GB Redis“ (Eviction ist probabilistisch)
15. **Sicherheitsabwägung UUID v7 vs. v4 (Vorhersagbarkeit)** — von der Postgres-Doku nicht behandelt. **Nicht belegt.**
16. **Row Level Security als Alternative zur Mandantentrennung** — nicht gelesen, nicht bewertet.
17. **Redis 8 mit eingebautem Rate-Limiting** — nicht geprüft; ich behaupte es weder noch schließe ich es aus.
18. **Redis Streams Skript-Sprachen-Integrationen** (Spring Data, node-redis, ioredis, redis-py) — von der Streaming-Seite gelistet, aber die Bibliotheks-Dokus habe ich nicht gelesen. **Für TypeScript/Bun ist `ioredis`/`node-redis` gelistet** („Node.js: `node-redis` and `ioredis` for stream producers and consumers in event-driven APIs“) — ob diese unter Bun laufen, ist **nicht belegt**.

## Quellenqualität — offengelegte Einschränkungen

19. **Drei Redis-Seiten wurden nur über einen Suchmaschinen-Auszug mit Originaltext geprüft**, nicht vollständig abgerufen: `tutorials/howtos/ratelimiting/`, `glossary/rate-limiting/`, `glossary/pub-sub/`. Die zitierten Passagen sind wörtlich, aber Vollständigkeit/Aktualität der Seiten ist nicht verifiziert. Für eine Publikation sollten diese drei nachgezogen werden.
20. **`tools.pgbouncer.org/features.html`** ist die Projekt-Homepage, keine „offizielle Standarddoku“ — für PgBouncer ist sie aber die Primärquelle. Die `config.html`-Seite (Defaults für `max_prepared_statements`, `pool_mode` etc.) habe ich **nicht** gelesen → **Defaultwerte nicht belegt.**
21. **Alle Performance-Aussagen sind qualitativ.** Kein Abschnitt dieses Berichts enthält einen Benchmark, den ich selbst gemessen habe; die einzigen Zahlen stammen aus Doku-Texten (und sind dort als Beispiel/Benchmark gekennzeichnet).
