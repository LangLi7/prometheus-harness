# Der Wissensspeicher — D1, erster Schritt: Tabellen, die den Mandanten **tragen**

> **Stand:** 13.10.2026 · **Migration:** `0006_wissensspeicher.sql` (Fassung 5 → **6**)
> · **Probe:** `tests/proben/wissensspeicher.sql` — **12 Fälle, alle wie erwartet, exit 0**
>
> **Der eine Satz, auf den es ankommt:** Der Mandant steht **von Anfang an** in der
> Struktur. Eine Vektorsuche über Tabellen ohne Mandantenspalte wäre das Leck — und
> es nachträglich einzubauen hieße, eine bestehende Datenbank umzubauen.

---

## 1. Was gebaut wurde

| Datei | Was |
|---|---|
| `packages/auth/db-schema/migrations/0006_wissensspeicher.sql` | `documents` und `chunks` samt zusammengesetzten Fremdschlüsseln, Prüfbedingungen und Vektorindex |
| `packages/auth/db-schema/src/index.ts` | Migration 6 in der Liste (die Liste ist **statisch** — ohne Eintrag passiert nichts, siehe §5) |
| `packages/auth/db-schema/tests/proben/wissensspeicher.sql` | die Probe, 12 Fälle |
| `packages/api/readiness/src/index.ts` | `ERWARTETE_SCHEMAFASSUNG` 5 → **6** |
| `packages/auth/db-schema/tests/{migrate,postgres}.test.ts` | drei festgenagelte Erwartungen nachgezogen |

### Die Struktur

```
documents   id, user_id NOT NULL, workspace_id, kind, source_path, title,
            content_hash, bytes, created_at, updated_at, deleted_at
            UNIQUE (id, user_id)
            FK (workspace_id, user_id) → workspaces (id, user_id)
                                        ON DELETE SET NULL (workspace_id)

chunks      id, user_id NOT NULL, document_id, ordinal, content_cipher,
            tokens, embedding vector(768), embedding_model, embedded_at, created_at
            UNIQUE (id, user_id) · UNIQUE (document_id, ordinal)
            FK (document_id, user_id) → documents (id, user_id) ON DELETE CASCADE
            CHECK (embedding IS NULL) = (embedding_model IS NULL)
            CHECK embedding IS NOT NULL OR embedded_at IS NULL
```

**Warum `UNIQUE (id, user_id)` auf einem `id`-Primärschlüssel?** Nicht aus Vorsicht,
sondern als **Ziel**: ein zusammengesetzter Fremdschlüssel kann nur auf ein
zusammengesetztes `UNIQUE` zeigen. Erst dadurch wird „ein Stück von Mandant B an
einem Dokument von Mandant A" **strukturell** unmöglich. Dasselbe Muster wie
Migration 0004.

**Warum ein Vektor `NULL` sein darf.** Eine Einbettung kann fehlschlagen — Modell
nicht erreichbar, Text zu lang, Vorgang abgebrochen. Wäre die Spalte `NOT NULL`,
wäre ein **Textstück ohne Vektor** nicht speicherbar, und der ganze Vorgang müßte
wiederholt werden, obwohl der Text schon da ist. `embedding IS NULL` heißt
ausdrücklich *noch nicht eingebettet*, und `chunks_offen_idx` findet die Nacharbeit.
Damit kein Vektor ohne sein Modell dasteht: **beides oder keines**.

**Warum HNSW und nicht IVFFlat.** IVFFlat muß **trainiert** werden: es braucht Daten
und eine Stichprobe, bevor es nützlich ist — auf einer leeren Tabelle ist der Index
wertlos, und die Trefferqualität hängt an einem Parameter, den man nach dem Befüllen
nachziehen müßte. HNSW baut sich beim Einfügen auf. **Kosinus**, weil
Textähnlichkeit über die Richtung gemessen wird, nicht über den Abstand.

---

## 2. Die Probe: 12 Fälle, und die Kontrollfälle gehören dazu

```
Gesendet:  Get-Content …/wissensspeicher.sql -Raw | docker exec -i pmh-postgres psql -U pmh_admin -d pmh_test -v ON_ERROR_STOP=1
Ergebnis:  NOTICE: PROBE BESTANDEN: alle 12 Faelle wie erwartet        exit 0
```

```
K0  Aufbau: zwei Mandanten mit je einem Dokument und Stueck | 2/2/2      | ok
L1  Dokument von A in der EIGENEN Werkstatt                 | angenommen | ok
L2  Dokument von A in der Werkstatt von B                   | 23503      | ok
L3  Stueck von A am EIGENEN Dokument                        | angenommen | ok
L4  Stueck von A am Dokument von B                          | 23503      | ok
L5  zweimal ordinal 0 im selben Dokument                    | 23505      | ok
L6  Vektor ohne Modellangabe                                | 23514      | ok
L7  Modellangabe ohne Vektor                                | 23514      | ok
L8  Einbettungszeitpunkt ohne Vektor                        | 23514      | ok
L9  Vektor MIT Modell und Zeitpunkt                         | angenommen | ok
L10 offene Stuecke sind auffindbar (embedding IS NULL)      | >=1        | ok
L11 Dokument loeschen nimmt seine Stuecke mit               | 3 -> 0     | ok
```

**Zu jedem abgelehnten Übergriff gehört ein angenommener eigener Fall.** Eine Regel,
die **alles** ablehnt, wäre sonst ebenso grün. Erst beides zusammen sagt: sie
unterscheidet.

**Und das Urteil wirft** — belegt durch den ersten Lauf: `ERROR: PROBE GESCHIEITERT:
1 von 12 Faellen falsch`, **exit 3**. Ohne `RAISE` endete die Probe auch dann mit
Exit-Code 0, wenn alles schiefging.

### Was die Probe **nicht** leistet — und das steht auch in ihrem Kopf

Fremdschlüssel verhindern **Schreiben** über die Mandantengrenze. Sie verhindern
**nicht**, daß eine **Leseabfrage** ohne `WHERE user_id = …` fremde Zeilen liefert.
Die Struktur ist die halbe Mauer; die andere Hälfte ist der Filter in der Abfrage —
und, wenn er scharf geschaltet wird, Row Level Security. Eine Probe, die das
verschweigt, behauptet mehr, als sie messen kann.

---

## 3. Vier eigene Fehler auf dem Weg

| Fehler | Wie er auffiel |
|---|---|
| **Die Prüfabfrage der Migration log.** Sie hieß `zusammengesetzte_schluessel_erwartet_3`, zählte aber `array_length(conkey,1) > 1` — und das erfaßt **auch CHECK- und UNIQUE-Bedingungen**. Gemessen: **7**. Jetzt `contype = 'f'` (nur Fremdschlüssel) → **2**, und der Name stimmt | beim Nachzählen in der Datenbank |
| **Der Prüfsummenwächter griff — gegen mich.** Nach der Korrektur verweigerte der Läufer die Migration: *„wurde nach dem Anwenden geändert: erwartete Prüfsumme 28cf8486…, in der Datenbank steht 91171a76…"*. Die Migration war **nie eingecheckt**, also war Umschreiben richtig und der Weg dafür ist: Eintrag und Tabellen in der **Wegwerf-Datenbank** zurücksetzen, neu anwenden. Für eine **veröffentlichte** Migration gilt der Satz aus der Meldung: *„Eine angewandte Migration wird nie umgeschrieben — eine neue kommt hinten dazu."* | der Läufer selbst |
| **Die Probe war in L4 mehrdeutig.** Sie erwartete `23503` (fremder Mandant) und bekam `23505` — mein Übergriff benutzte `ordinal = 0`, und Bs eigenes Dokument hat dort schon ein Stück: die Eindeutigkeit greift **vor** dem Fremdschlüssel. Hätte die Probe nur „wurde abgelehnt?" gefragt, wäre sie grün gewesen und hätte das Falsche gemeint. Jetzt `ordinal = 7` | die Probe selbst, exit 3 |
| **Backticks in einem Kommentar im Template-Literal** (`postgres.test.ts`) — sie **beenden** die Zeichenkette. `error: Expected ")" but found "users"`. Derselbe Fehler wie am Mittag in `seite.ts`: eine Fehlerart, die zweimal zuschlägt, gehört in die Hausregeln | der Testlauf |

---

## 4. Der Befund, der nicht geplant war: **eine zweite Datenbank hat keine Erweiterungen**

Die Migration prüft zu Beginn, ob `vector` vorhanden ist, und **bricht mit einem
Hinweis ab**, wenn nicht — kein `CREATE EXTENSION`, weil `vector` **keine**
vertrauenswürdige Erweiterung ist und Superuser verlangt.

Beim ersten Lauf gegen `pmh_test`:

```
FEHLER bei den Migrationen: Migration 6 … ist gescheitert: Die Erweiterung "vector"
fehlt in dieser Datenbank. … CREATE EXTENSION vector;
exit 1
```

**Die Ursache, belegt:** `docker/postgres-init/01-extensions.sql` legt vier
Erweiterungen an (`vector`, `pg_trgm`, `pgcrypto`, `unaccent`) — und läuft, wie der
Kopf der Datei selbst sagt, **einmal beim ersten Start eines leeren
Datenverzeichnisses**, gegen die Datenbank `POSTGRES_DB`. Eine später angelegte
Datenbank bekommt sie **nie**. Gemessen:

```
pmh      : vector 0.8.7, pg_trgm 1.6, pgcrypto 1.3, unaccent 1.1
pmh_test : (nach Anlegen) vector 0.8.7, pg_trgm 1.6, pgcrypto 1.3, unaccent 1.1
```

**Was daraus folgt — und offen ist.** Wer eine zweite Datenbank anlegt (Prüf-, Test-,
Schattendatenbank), muß die vier Erweiterungen **selbst** anlegen; der
Installationsweg tut es nicht, und `scripts/migrate.mjs` kann es nicht (fehlende
Rechte). Die Sicherung der Migration sagt jetzt wenigstens **was zu tun ist**, statt
mit `type "vector" does not exist` zu scheitern. Ein eigener Schritt im
Installationsweg fehlt — das ist ein Punkt für **E**.

---

## 5. Was das **nicht** ist — und was offen bleibt

| Offen | Warum |
|---|---|
| **Kein Code liest oder schreibt die Tabellen.** `documents`/`chunks` haben **keinen Aufrufer** | dasselbe Muster wie bei `claim`, `permissions`, `user_profiles`, `user_secrets`, `one_time_tokens`. Der nächste Schritt ist der Aufrufer: Zerlegen, Einbetten, Ablegen — und die Suche mit **Mandantenfilter** |
| **Die Liste der Migrationen ist statisch.** `0006` wurde erst gefunden, nachdem sie in `MIGRATIONS` **eingetragen** war — vorher meldete der Läufer „Schema ist aktuell (Fassung 5), nichts zu tun" | eine Datei allein genügt nicht. Wer eine Migration hinzufügt, muß **zwei** Stellen ändern; der Test „die echten Migrationen … heißen 1 bis 6" fängt eine vergessene Nummer, aber keine vergessene Ein tragung mit anderen Nummern |
| **Row Level Security bleibt aus.** Gemessen: **0** Policies, RLS auf allen Tabellen `false` | `mandantentrennung.md` §10 nennt es eine **Entscheidung**, kein Vergessen: niemand setzt `pmh.user_id`, und RLS ohne das liefert „still null Zeilen". **Diese Entscheidung ist noch nicht gefallen** |
| **Die Dimension 768 ist gesetzt, das Modell nicht.** `embedding_model` steht **je Zeile** | damit ist ein Modellwechsel **erkennbar** statt still. Eine andere Dimension heißt: neue Spalte, neue Einbettung — kein `ALTER` |
| **Volltextsuche über Stücke ist offen.** `content_cipher` ist `bytea`, und darüber findet `tsvector`/`pg_trgm` **nichts** (Befund B-S3) | ein Klartext daneben wäre die zweite Kopie desselben Inhalts (Befund B-L5). Die Entscheidung steht aus — sie ist dieselbe wie bei `messages` |
| **Gefilterte Vektorsuche kann zu wenige Zeilen liefern** | PostgreSQL sucht zuerst die nächsten Nachbarn und wirft danach weg, was nicht zum Filter paßt. Bei einem **immer** greifenden Mandantenfilter ist das der Normalfall. pgvector 0.8 kennt `hnsw.iterative_scan` — **ungemessen** |

---

## 6. Zahlen

| Messung | Befehl | Wert |
|---|---|---|
| Schemafassung vorher/nachher | `SELECT max(version) FROM pmh.schema_migrations` | 5 → **6** |
| Migration angewendet | `bun scripts/migrate.mjs` (auf `pmh_test`) | *„Schema aktualisiert: 1 Migration(en) (6) — jetzt Fassung 6."* — exit **0** |
| Probe | `… wissensspeicher.sql \| docker exec -i … psql -v ON_ERROR_STOP=1` | **12/12**, exit **0**; bei einem falschen Fall exit **3** |
| Prüfabfrage der Migration | dieselbe Abfrage in `psql` | `tabellen=2  vektorspalte=1  zusammengesetzte_fremdschluessel=2` |
| Vektorindex | `SELECT indexdef FROM pg_indexes WHERE indexname LIKE '%hnsw%'` | `USING hnsw (embedding vector_cosine_ops)` |
| Typprüfung | `bun scripts/typecheck.mjs` | **25 Pakete grün, 0 rot** |
| Voller Lauf | `bun test` | **1182 pass, 2 fail** in 48 Dateien — die zwei roten sind die bekannten fremden (`atomic-write`, `apps/cli`) |
| `db-schema` allein | `bun test packages/auth/db-schema` | **38 pass, 0 fail** |

---

## 7. Nachfahren

```powershell
$map = @{}; foreach ($l in (Get-Content .env)) { if ($l -match '^\s*([A-Za-z_]\w*)\s*=') { $k,$v = $l -split '=',2; $map[$k.Trim()] = $v.Trim() } }
$env:MIGRATION_DATABASE_URL = $map['MIGRATION_DATABASE_URL'] -replace '/pmh(\?|$)','/pmh_test$1'

# 1. Die Erweiterungen der zweiten Datenbank — sie fehlen ohne diesen Schritt.
docker exec pmh-postgres psql -U pmh_admin -d pmh_test -tAc "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS unaccent;"

# 2. Die Migration
& 'C:\Users\Chang\.bun\bin\bun.exe' scripts/migrate.mjs

# 3. Die Probe — Exit-Code ist das Urteil
Get-Content packages/auth/db-schema/tests/proben/wissensspeicher.sql -Raw |
  docker exec -i pmh-postgres psql -U pmh_admin -d pmh_test -v ON_ERROR_STOP=1
```
