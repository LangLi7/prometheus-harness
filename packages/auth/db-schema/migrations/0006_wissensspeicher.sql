-- 0006_wissensspeicher.sql — D1: Dokumente und Textstücke für die Vektorsuche.
--
-- ===========================================================================
-- DIE ENTSCHEIDUNG, DIE DIESE MIGRATION PRÄGT: DER MANDANT STEHT DRIN
-- ===========================================================================
--
-- `docs/review/rag-und-obsidian-bereitschaft.md` sagt es unmißverständlich:
--
--   *„Vektorsuche ist eine Ähnlichkeits-Leseabfrage, die den Mandanten nicht
--    mitbringt. Bei Vektorsuche entsteht sie mit der ersten Abfrage … Wer RAG vor
--    B-S1 baut, baut das Leck mit."*
--
-- Deshalb tragen **beide** Tabellen `user_id` als NOT-NULL-Spalte, und **jeder**
-- Verweis ist ein **zusammengesetzter** Fremdschlüssel über `(…, user_id)` — das
-- Muster aus Migration 0004. Ein Stück von Mandant B kann damit **strukturell**
-- nicht auf ein Dokument von Mandant A zeigen: die Datenbank weist es ab, nicht
-- die Anwendung.
--
-- **Was das NICHT leistet — und das gehört hierher, nicht in eine Fußnote.**
-- Fremdschlüssel verhindern **Übergriffe beim Schreiben**. Sie verhindern nicht,
-- daß eine **Leseabfrage** ohne `WHERE user_id = …` fremde Zeilen liefert. Die
-- Struktur ist die halbe Mauer; die andere Hälfte ist der Filter in der Abfrage
-- (und, wenn er scharf geschaltet wird, Row Level Security). Der Stand steht in
-- `docs/decisions/vektorsuche-mandant-und-modell.md`.
--
-- ===========================================================================
-- WARUM EIN VEKTOR NULL SEIN DARF
-- ===========================================================================
--
-- Eine Einbettung kann fehlschlagen: das Modell ist nicht erreichbar, der Text
-- ist zu lang, der Vorgang wurde abgebrochen. Wäre die Spalte NOT NULL, wäre ein
-- **Textstück ohne Vektor** nicht speicherbar — und der ganze Vorgang müßte
-- wiederholt werden, obwohl der Text schon da ist. `embedding IS NULL` heißt
-- deshalb ausdrücklich: **noch nicht eingebettet**, und es gibt einen Index
-- dafür (`chunks_offen_idx`), damit die Nacharbeit sie findet.
--
-- Damit ein Vektor nicht ohne sein Modell dasteht (und umgekehrt), gilt:
-- **beides oder keines** (`chunks_vektor_und_modell`).

-- ---------------------------------------------------------------------------
-- 0. Die Erweiterung muß da sein — geprüft, nicht angelegt
-- ---------------------------------------------------------------------------
-- **Warum kein `CREATE EXTENSION IF NOT EXISTS`.** `vector` ist **keine**
-- vertrauenswürdige Erweiterung: das Anlegen verlangt Superuser-Rechte. Die
-- Migrationsrolle ist `pmh_owner` und hat sie **nicht**. Ein `CREATE EXTENSION`
-- hier würde also je nach Umgebung funktionieren oder scheitern — und im zweiten
-- Fall mit einer Meldung, die nicht sagt, was zu tun ist.
--
-- **Gemessen am 13.10.2026:** `vector 0.8.7` liegt in Schema `public`, und
-- `pmh_owner` hat `search_path = pmh, public`. Der Typ `vector` ist damit ohne
-- Qualifizierung erreichbar.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION
      'Die Erweiterung "vector" fehlt in dieser Datenbank. Sie ist Voraussetzung fuer '
      'Textstuecke mit Einbettung. Anlegen mit Superuser-Rechten: '
      'CREATE EXTENSION vector;  (im Container: docker exec pmh-postgres psql -U pmh_admin -d pmh '
      '-c "CREATE EXTENSION IF NOT EXISTS vector")';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. documents — das Quellstück
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id            uuid PRIMARY KEY,
  -- **Der Mandant.** NOT NULL und ohne Vorgabe: ein Dokument ohne Eigentümer
  -- wäre ein Dokument, das jeder sieht.
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Ein Dokument kann zu einem Arbeitsbereich gehören — muß aber nicht (eine
  -- hochgeladene Datei, eine Notiz). Deshalb `NULL` erlaubt.
  workspace_id  uuid,
  -- Woher das Stück kommt. Die Werte entsprechen den Quellen, die D1 nennt:
  -- Arbeitsbereich, Chat, Sitzung — dazu Datei, Notiz (D2/Obsidian) und Eingabe.
  kind          text NOT NULL,
  -- Der Herkunftsort: ein Pfad, eine Chat-Kennung, eine Sitzungskennung.
  source_path   text,
  title         text NOT NULL DEFAULT '',
  -- SHA-256 des Inhalts, 64 Hexzeichen. Dient dem Erkennen von **Wiederholungen**:
  -- dieselbe Datei zweimal einzulesen soll nicht zwei Dokumente erzeugen.
  content_hash  text,
  bytes         integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT documents_kind_known
    CHECK (kind IN ('datei', 'notiz', 'web', 'chat', 'sitzung', 'eingabe')),
  CONSTRAINT documents_hash_shape
    CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT documents_bytes_nicht_negativ
    CHECK (bytes IS NULL OR bytes >= 0),
  -- Das Ziel der zusammengesetzten Verweise — siehe `chunks` unten.
  CONSTRAINT documents_id_user_key UNIQUE (id, user_id),
  -- **Ein Arbeitsbereich eines FREMDEN Mandanten ist nicht annehmbar.** Der
  -- zusammengesetzte Schlüssel erzwingt, daß beide Spalten zusammenpassen.
  -- `ON DELETE SET NULL (workspace_id)` — die Spaltenliste ist nötig, sonst
  -- leerte PostgreSQL auch `user_id`, und die ist NOT NULL (der Fallstrick aus
  -- Migration 0004).
  CONSTRAINT documents_workspace_user_fkey FOREIGN KEY (workspace_id, user_id)
    REFERENCES workspaces (id, user_id) ON DELETE SET NULL (workspace_id)
);

CREATE INDEX IF NOT EXISTS documents_user_idx ON documents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS documents_workspace_idx ON documents (workspace_id);
CREATE INDEX IF NOT EXISTS documents_hash_idx ON documents (user_id, content_hash) WHERE content_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. chunks — das Textstück mit seiner Einbettung
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chunks (
  id               uuid PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  document_id      uuid NOT NULL,
  -- Die Reihenfolge im Dokument. Sie ist Teil der Aussage: ein Treffer ohne
  -- seine Lage ist schwer zu gebrauchen (und die Nachbarn fehlen).
  ordinal          integer NOT NULL,
  -- **Der Text liegt verschlüsselt — wie bei `messages`.** Ein Klartext daneben
  -- wäre eine zweite Kopie desselben Inhalts, und genau die ist der Befund
  -- B-L5. Was daraus für die Volltextsuche folgt, steht in der Entscheidung.
  content_cipher   bytea NOT NULL,
  tokens           integer,
  -- 768 Dimensionen: siehe die Entscheidung. Die Zahl steht **hier** und nur
  -- hier im Schema; sie zu ändern heißt: neue Spalte, neue Einbettung.
  embedding        vector(768),
  embedding_model  text,
  embedded_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chunks_id_user_key UNIQUE (id, user_id),
  -- **Der Verweis auf das Dokument gilt nur innerhalb desselben Mandanten.**
  -- Ein Stück kann nicht an ein fremdes Dokument gehängt werden.
  CONSTRAINT chunks_document_user_fkey FOREIGN KEY (document_id, user_id)
    REFERENCES documents (id, user_id) ON DELETE CASCADE,
  CONSTRAINT chunks_ordinal_nicht_negativ CHECK (ordinal >= 0),
  CONSTRAINT chunks_tokens_nicht_negativ CHECK (tokens IS NULL OR tokens >= 0),
  -- Zweimal dieselbe Stelle im selben Dokument ist ein Fehler beim Zerlegen,
  -- kein gültiger Zustand.
  CONSTRAINT chunks_ordinal_eindeutig UNIQUE (document_id, ordinal),
  -- **Beides oder keines.** Ein Vektor ohne Modellangabe wäre nicht deutbar; ein
  -- Modell ohne Vektor wäre eine Behauptung.
  CONSTRAINT chunks_vektor_und_modell
    CHECK ((embedding IS NULL) = (embedding_model IS NULL)),
  CONSTRAINT chunks_ohne_vektor_kein_zeitpunkt
    CHECK (embedding IS NOT NULL OR embedded_at IS NULL)
);

CREATE INDEX IF NOT EXISTS chunks_document_idx ON chunks (document_id, ordinal);
-- **Die Nacharbeit finden.** Ohne diesen Index wäre „welche Stücke sind noch
-- nicht eingebettet?" ein Durchlauf über die ganze Tabelle.
CREATE INDEX IF NOT EXISTS chunks_offen_idx ON chunks (user_id) WHERE embedding IS NULL;
CREATE INDEX IF NOT EXISTS chunks_user_idx ON chunks (user_id);

-- ---------------------------------------------------------------------------
-- 3. Der Vektorindex
-- ---------------------------------------------------------------------------
-- **Warum HNSW und nicht IVFFlat.** IVFFlat muß **trainiert** werden: es braucht
-- Daten, bevor es nützlich ist, und die Listen werden aus einer Stichprobe
-- gebildet. Auf einer leeren Tabelle ist der Index deshalb wertlos, und die
-- Trefferqualität hängt an einem Parameter, den man nach dem Befüllen nachziehen
-- müßte. HNSW baut sich beim Einfügen auf und braucht keine Stichprobe.
--
-- **Kosinus und nicht euklidisch.** Textähnlichkeit wird über die Richtung
-- gemessen, nicht über den Abstand: zwei Einbettungen desselben Themas zeigen in
-- dieselbe Richtung, unabhängig von ihrer Länge.
--
-- **Die Grenze, die dazugehört.** Ein gefilterter Vektorindex kann **zu wenige**
-- Zeilen liefern: PostgreSQL sucht zuerst die nächsten Nachbarn und wirft danach
-- die weg, die nicht zum Filter passen. Bei einem Mandantenfilter (der immer
-- greift) ist das der Normalfall, nicht die Ausnahme. pgvector 0.8 kennt dafür
-- `hnsw.iterative_scan` — es steht in der Entscheidung, nicht hier.
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw
  ON chunks USING hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- 4. Prüfung am Ende der Migration
-- ---------------------------------------------------------------------------
-- Dasselbe Muster wie in 0005: die Migration sagt selbst, was sie erwartet.
-- Findet sie es nicht, scheitert sie hier und nicht später im Betrieb.
--
-- **`contype = 'f'` ist nicht Zierde.** Der erste Entwurf zählte nur
-- `array_length(conkey, 1) > 1` und behauptete „erwartet 3" — gemessen waren es
-- **7**, weil auch CHECK- und UNIQUE-Bedingungen mehrere Spalten führen
-- (`chunks_vektor_und_modell`, `chunks_ordinal_eindeutig`,
-- `documents_id_user_key`, …). Die Abfrage zählte also etwas anderes, als ihr
-- Name sagte. Jetzt zählt sie **Fremdschlüssel** — und davon gibt es genau
-- **zwei**: `documents_workspace_user_fkey` und `chunks_document_user_fkey`.
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'pmh' AND table_name IN ('documents', 'chunks')) AS tabellen_erwartet_2,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'pmh' AND table_name = 'chunks' AND column_name = 'embedding') AS vektorspalte_erwartet_1,
  (SELECT count(*) FROM pg_constraint
    WHERE connamespace = 'pmh'::regnamespace
      AND contype = 'f'
      AND array_length(conkey, 1) > 1
      AND conrelid IN ('pmh.documents'::regclass, 'pmh.chunks'::regclass)) AS zusammengesetzte_fremdschluessel_erwartet_2;
