-- ===========================================================================
-- 0008 — Das Sitzungsprotokoll in der Datenbank
-- ===========================================================================
--
-- ANLASS: Der Kern speichert Sitzungen (Chatverlauf) über die Naht
-- `ctx.sessionPersistence`; belegt ist sie mit `dsh-session-persistence-jsonl`,
-- also mit **Dateien**: `<home>/sessions/<kennung>/session.v4.jsonl.zstd`.
-- Gemessen am 14.10.2026 im Bau-Home: **88 Sitzungsordner**. Die Datenbank sah
-- davon nichts — obwohl sie die Tabelle `conversation_sessions` seit Migration 3
-- führt und ihr Kopf seit Migration 4 genau die Felder des Kerns trägt.
--
-- WAS DIESE MIGRATION TUT: sie macht die Datenbank fähig, das Protokoll
-- aufzunehmen. Sie **schreibt noch nichts** — der Schreiber ist ein eigenes
-- Paket (`session-persistence-postgres`), das die Naht erfüllt.
--
--   1. `conversation_sessions` bekommt drei Spalten, die die Naht braucht:
--      den **Vererbungsschnitt** (`inherited_event_count`, für Gabelungen),
--      und die **Schreibherrschaft** (`owner_token`, `owner_since`).
--   2. `session_events` entsteht: das **anhängende** Protokoll, ein Ereignis je
--      Zeile, `(session_id, seq)` als Schlüssel.
--   3. **Row Level Security** wird auf BEIDEN Tabellen eingeschaltet — mit der
--      **lauten** Form der Bedingung. Das ist die Entscheidung aus
--      `docs/status/mandantentrennung.md` §13.
--
-- WARUM DIE LAUTE FORM UND NICHT `missing_ok = true`.
--   `current_setting('pmh.user_id', true)` liefert NULL, wenn kein Mandant
--   gesetzt ist — die Bedingung wird dann still falsch und die Abfrage gibt
--   **0 Zeilen** zurück. Das sieht aus wie „Tabelle leer" und ist in
--   Wirklichkeit „falsch gefragt". Ohne `missing_ok` wirft PostgreSQL den
--   Fehler **42704** (`unrecognized configuration parameter`) — laut, mit
--   Ursache. Gemessen in `postsgres`-Probe: `''` ergibt `22P02`, nie gesetzt
--   ergibt `42704`.
--
-- WARUM `session_events` EINEN MANDANTEN TRÄGT, OBWOHL ER ÜBER DIE SITZUNG
-- ERREICHBAR WÄRE. Genau wie in Migration 4: der zusammengesetzte Fremdschlüssel
-- `(session_id, user_id) -> conversation_sessions (id, user_id)` macht einen
-- **Widerspruch unmöglich** — ein Ereignis kann nicht an der Sitzung eines
-- anderen Mandanten hängen. Und die Bedingung wird eine einfache
-- Spaltenprüfung statt einer Unterabfrage je Zeile.
--
-- WARUM KEIN `GRANT` HIER STEHT. `docker/postgres-init/defaults-as-owner.sql.in`
-- setzt `ALTER DEFAULT PRIVILEGES IN SCHEMA pmh` — neue Tabellen bekommen die
-- Rechte der Anwendung damit **automatisch**. Nachgeprüft nach dem Lauf.
--
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Der Kopf bekommt, was die Naht braucht
-- ---------------------------------------------------------------------------

-- **Der Vererbungsschnitt.** Bei einer Gabelung (`is_seeded = true`) erbt die
-- neue Sitzung die ersten N Ereignisse ihrer Vorgängerin. N gehört **neben** das
-- Protokoll, nicht hinein: es ist Speicher-Metadatum, kein Ereignis, und darf
-- beim Abspielen nicht als Nachricht erscheinen.
ALTER TABLE conversation_sessions
  ADD COLUMN IF NOT EXISTS inherited_event_count integer NOT NULL DEFAULT 0;

-- **Die Schreibherrschaft.** Eine Sitzung hat **einen** Schreiber. Der Wert ist
-- eine zufällige Kennung des Handles, nicht die Prozeßnummer: nach einem
-- Neustart muß die alte Herrschaft als **verwaist** erkennbar sein, und eine
-- Prozeßnummer würde wiederverwendet.
ALTER TABLE conversation_sessions
  ADD COLUMN IF NOT EXISTS owner_token text;

ALTER TABLE conversation_sessions
  ADD COLUMN IF NOT EXISTS owner_since timestamptz;

-- **Die Prüfregel zum Schnitt.** Die Naht verlangt: `is_seeded` **genau dann**,
-- wenn ein Schnitt größer null gespeichert ist. Ein Schnitt ohne Gabelung wäre
-- ein Protokoll, das lügt; eine Gabelung ohne Schnitt wäre nicht abspielbar.
ALTER TABLE conversation_sessions
  DROP CONSTRAINT IF EXISTS conversation_sessions_seed_schnitt;
ALTER TABLE conversation_sessions
  ADD CONSTRAINT conversation_sessions_seed_schnitt CHECK (
    (is_seeded AND inherited_event_count > 0) OR (NOT is_seeded AND inherited_event_count = 0)
  );

-- ---------------------------------------------------------------------------
-- 2. Das Protokoll
-- ---------------------------------------------------------------------------
-- **`(session_id, seq)` als Primärschlüssel ist die halbe Vertragsprüfung.**
-- Er macht drei Dinge unmöglich: dasselbe Ereignis zweimal, dasselbe `seq`
-- zweimal, und — weil wir niemals ändern oder löschen — jede Umschreibung der
-- Vergangenheit. Die Lückenlosigkeit **ab 0** kann die Datenbank nicht
-- ausdrücken; das prüft der Schreiber mit den Vertragshilfen der Naht
-- (`assertContiguous`, `materializeAppendBatch`, `validateStoredEvents`).
--
-- **Warum `jsonb` und nicht `text`.** Das Ereignis ist strukturiert; die
-- Suche nach einem Feld soll nicht an der Zeichenkette hängen. `jsonb` ist
-- geprüft, indizierbar und normalisiert.
CREATE TABLE IF NOT EXISTS session_events (
  -- Die Sitzung, zu der das Ereignis gehört.
  session_id  text        NOT NULL,
  -- Die Nummer im Protokoll, ab 0, lückenlos.
  seq         integer     NOT NULL,
  -- Der Mandant — dieselbe Zeile wie in `conversation_sessions`, erzwungen.
  user_id     uuid        NOT NULL,
  -- Das Ereignis selbst.
  value       jsonb       NOT NULL,
  -- Wann es **ankam**. Nicht zu verwechseln mit einer Zeit im Ereignis.
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT session_events_pkey PRIMARY KEY (session_id, seq),
  CONSTRAINT session_events_seq_nicht_negativ CHECK (seq >= 0),

  -- **Der zusammengesetzte Verweis.** Er macht es unmöglich, ein Ereignis an
  -- die Sitzung eines anderen Mandanten zu hängen: `(session_id, user_id)` muß
  -- in `conversation_sessions` **als Paar** existieren. Genau dafür hat
  -- Migration 4 den eindeutigen Schlüssel `(id, user_id)` angelegt.
  CONSTRAINT session_events_session_user_fkey
    FOREIGN KEY (session_id, user_id)
    REFERENCES conversation_sessions (id, user_id)
    ON DELETE CASCADE
);

-- **Warum dieser Index.** Die Bedingung filtert nach `user_id`; ohne Index
-- liest jede Abfrage die ganze Tabelle. Die Reihenfolge `(user_id, session_id,
-- seq)` deckt beides ab: das Filtern je Mandant und das Lesen eines
-- Protokolls in Reihenfolge.
CREATE INDEX IF NOT EXISTS session_events_mandant_idx
  ON session_events (user_id, session_id, seq);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security — die laute Form
-- ---------------------------------------------------------------------------
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_sessions_mandant ON conversation_sessions;
CREATE POLICY conversation_sessions_mandant ON conversation_sessions
  USING (user_id = current_setting('pmh.user_id')::uuid)
  WITH CHECK (user_id = current_setting('pmh.user_id')::uuid);

DROP POLICY IF EXISTS session_events_mandant ON session_events;
CREATE POLICY session_events_mandant ON session_events
  USING (user_id = current_setting('pmh.user_id')::uuid)
  WITH CHECK (user_id = current_setting('pmh.user_id')::uuid);

-- **Kein `FORCE`.** Die Eigentümerin (`pmh_owner`) umgeht die Bedingung — sie
-- legt die Migrationen und muß alles sehen dürfen. Die Anwendung (`pmh_app`)
-- ist **nicht** Eigentümerin und wird gefiltert. Das ist die Trennung, die
-- Migration 4 beschrieben hat, jetzt in Kraft.

-- ---------------------------------------------------------------------------
-- 4. Selbstprüfung der Migration
-- ---------------------------------------------------------------------------
-- Eine Migration, die etwas einzuschalten behauptet, soll es **nachsehen**.
-- Schlägt hier etwas fehl, bricht die Migration ab — lieber laut als eine
-- Datenbank, die aussieht, als sei sie geschützt.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'session_events' AND n.nspname = 'pmh' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'session_events hat kein Row Level Security — die Trennung fehlt.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'pmh' AND tablename = 'session_events' AND policyname = 'session_events_mandant'
  ) THEN
    RAISE EXCEPTION 'Die Bedingung session_events_mandant fehlt.';
  END IF;

  -- **Die Laute-Form-Prüfung.** Stünde `current_setting(''pmh.user_id'', true)`
  -- in der Bedingung, wäre die Trennung still. Der Text der Bedingung wird
  -- deshalb wörtlich geprüft — das ist die einzige Stelle, an der man den
  -- Unterschied sieht.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'pmh' AND tablename = 'session_events'
      AND qual LIKE '%missing_ok%'
  ) OR EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'pmh' AND tablename = 'session_events'
      AND qual NOT LIKE '%current_setting%'
  ) THEN
    RAISE EXCEPTION 'Die Bedingung für session_events ist nicht in der lauten Form geschrieben.';
  END IF;
END $$;
