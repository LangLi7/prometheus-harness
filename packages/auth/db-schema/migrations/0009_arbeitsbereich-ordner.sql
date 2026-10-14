-- ===========================================================================
-- 0009 — Ein Arbeitsbereich hat mehrere Quellordner
-- ===========================================================================
--
-- ANLASS: `workspaces.root_path` trägt **einen** Pfad je Arbeitsbereich. Die
-- Oberfläche kann mehr — der Betreiber hat eine Vorlage gezeigt, in der ein
-- Projekt einen **Primär**ordner und weitere Quellordner hat, und gesagt: „man
-- könnte mehrere Ordner benutzen statt einem, aus Ordnungsgründen".
--
-- WAS DIESE MIGRATION TUT:
--   1. `workspace_folders` entsteht: je Zeile ein Ordner, `ist_primaer` für den
--      Hauptordner.
--   2. Vorhandene Pfade aus `workspaces.root_path` werden **umgezogen**: jeder
--      wird der Primärordner seines Arbeitsbereichs.
--   3. `workspaces.root_path` wird **entfernt**. Zwei Orte für denselben Pfad
--      wären zwei Wahrheiten, und eine davon wird irgendwann falsch.
--
-- GEMESSEN VOR DEM LAUF (14.10.2026, Betriebsdatenbank `pmh` und `pmh_test`):
-- drei Arbeitsbereiche, **alle mit leerem** `root_path`. Der Umzug bewegt in
-- diesen Datenbanken also nichts; die Spalte war ungenutzt. Für einen frischen
-- Stapel mit gefüllten Pfaden ist der Umzug trotzdem da.
--
-- WARUM GENAU EIN PRIMÄRORDNER. Ein Teilindex (`WHERE ist_primaer`) erzwingt es:
-- zweimal „primär" im selben Arbeitsbereich ist ein Verstoß (23505) und keine
-- stille Frage, welcher denn gilt.
--
-- WARUM DER PFAD ABSOLUT SEIN MUSS UND KEIN `..` ENTHÄLT. Dieselben Bedingungen
-- wie bei `vaults` (Migration 7): ein relativer Pfad oder einer mit Aufstieg ist
-- keine Angabe über einen Ordner, sondern eine Frage.
--
-- WARUM DIE EINDEUTIGKEIT NUR JE ARBEITSBEREICH GILT. Derselbe Ordner zweimal
-- **in einem** Arbeitsbereich ist sinnlos und wird verboten. Über zwei
-- Arbeitsbereiche hinweg **nicht**: zwei Projekte können denselben Ordner
-- betrachten wollen, und was ich nicht begründen kann, verbiete ich nicht.
--
-- WARUM KEIN `GRANT` HIER STEHT. `docker/postgres-init/defaults-as-owner.sql.in`
-- setzt `ALTER DEFAULT PRIVILEGES IN SCHEMA pmh` — neue Tabellen bekommen die
-- Rechte der Anwendung damit **automatisch**.
--
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Die Ordner
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_folders (
  id            uuid        PRIMARY KEY,
  -- Der Arbeitsbereich. Der zusammengesetzte Verweis unten bindet zusätzlich den
  -- Mandanten — ein Ordner kann nicht am Arbeitsbereich eines anderen hängen.
  workspace_id  uuid        NOT NULL,
  -- Der Mandant, wie überall: er macht die Bedingung zu einer Spaltenprüfung.
  user_id       uuid        NOT NULL,
  -- Der Ordner, absolut.
  pfad          text        NOT NULL,
  -- **Der Hauptordner.** Genau einer je Arbeitsbereich (Teilindex unten).
  ist_primaer   boolean     NOT NULL DEFAULT false,
  -- Was der Mensch sieht. Fehlt sie, zeigt die Oberfläche den OrdnerNamen des Pfades.
  bezeichnung   text,
  -- Die Reihenfolge in der Anzeige. Klein fängt an.
  sortierung    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT workspace_folders_pfad_nicht_leer CHECK (length(btrim(pfad)) > 0),
  CONSTRAINT workspace_folders_pfad_ohne_aufstieg CHECK (position('..' in pfad) = 0),
  -- Windows-Laufwerk (`C:\`, `C:/`) oder ein führender Schrägstrich.
  CONSTRAINT workspace_folders_pfad_absolut CHECK (pfad ~ '^([A-Za-z]:[\\/]|/)'),
  CONSTRAINT workspace_folders_sortierung_nicht_negativ CHECK (sortierung >= 0),

  -- **Der zusammengesetzte Verweis.** `(id, user_id)` ist der eindeutige
  -- Schlüssel, den Migration 4 auf `workspaces` angelegt hat: so kann ein Ordner
  -- nicht am Arbeitsbereich eines fremden Mandanten hängen.
  CONSTRAINT workspace_folders_workspace_user_fkey
    FOREIGN KEY (workspace_id, user_id) REFERENCES workspaces (id, user_id) ON DELETE CASCADE,

  -- Derselbe Ordner nicht zweimal im selben Arbeitsbereich.
  CONSTRAINT workspace_folders_pfad_eindeutig UNIQUE (workspace_id, pfad)
);

-- **Genau ein Primärordner je Arbeitsbereich.** Ein Teilindex ist hier das
-- richtige Werkzeug: die Bedingung gilt nur für die Zeilen mit `ist_primaer`.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_folders_ein_primaer_idx
  ON workspace_folders (workspace_id) WHERE ist_primaer;

-- **Für das Anzeigen und das Filtern.** Die Bedingung filtert nach `user_id`;
-- die Reihenfolge `(user_id, workspace_id, sortierung)` deckt beides ab.
CREATE INDEX IF NOT EXISTS workspace_folders_mandant_idx
  ON workspace_folders (user_id, workspace_id, sortierung);

-- ---------------------------------------------------------------------------
-- 2. Umzug: der bisherige Pfad wird der Primärordner
-- ---------------------------------------------------------------------------
-- Idempotent (`ON CONFLICT DO NOTHING`): ein zweiter Lauf legt nichts doppelt an.
INSERT INTO workspace_folders (id, workspace_id, user_id, pfad, ist_primaer, sortierung)
SELECT gen_random_uuid(), w.id, w.user_id, btrim(w.root_path), true, 0
  FROM workspaces w
 WHERE length(btrim(w.root_path)) > 0
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Die alte Spalte verschwindet
-- ---------------------------------------------------------------------------
ALTER TABLE workspaces DROP COLUMN IF EXISTS root_path;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security — die laute Form
-- ---------------------------------------------------------------------------
ALTER TABLE workspace_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_folders_mandant ON workspace_folders;
CREATE POLICY workspace_folders_mandant ON workspace_folders
  USING (user_id = current_setting('pmh.user_id')::uuid)
  WITH CHECK (user_id = current_setting('pmh.user_id')::uuid);

-- **Kein `FORCE`.** Die Eigentümerin (`pmh_owner`) umgeht die Bedingung und muß
-- alles sehen dürfen; die Anwendung (`pmh_app`) wird gefiltert. Ohne
-- `missing_ok` ist eine Abfrage ohne Mandant **laut** (42704) und nicht still
-- leer — dieselbe Entscheidung wie in Migration 8.

-- WARUM HIER DOCH EIN `GRANT` STEHT, ANDERS ALS IN MIGRATION 8.
-- Migration 8 verließ sich darauf, daß die Installation
-- (`docker/postgres-init/04-defaults-as-owner.sh`) die Vorgaberechte setzt — auf der
-- Betriebsdatenbank stimmt das. **Auf einer von Hand angelegten Datenbank stimmt es
-- nicht**, und dort fehlt noch mehr. Gemessen am 14.10.2026 in `pmh_wegwerf`:
--
--   `insert` als `pmh_app`  ->  42501  (permission denied for table workspace_folders)
--   `has_schema_privilege('pmh_app','pmh','USAGE')`  ->  **f**
--   Rechte auf `session_events` (Migration 8)  ->  **keine** für `pmh_app`
--
-- Das sind **zwei** Dinge: die Rechte an der Tabelle (hier) und das `USAGE` am Schema.
-- Das Schema-`USAGE` vergibt `docker/postgres-init/02-roles.sh` — es gehört zur
-- Installation, nicht in eine Migration, und wird hier **nicht** nachgeholt: eine
-- Migration, die die Installation ersetzt, verdeckt genau die Lücke, die man sehen soll.
--
-- Die Rechte an der Tabelle setze ich trotzdem ausdrücklich: sie kosten nichts, wo die
-- Vorgaben schon gelten, und machen diese Migration von der Installation unabhängig.
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_folders TO pmh_app;

-- ---------------------------------------------------------------------------
-- 5. Selbstprüfung der Migration
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'workspace_folders' AND n.nspname = 'pmh' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'workspace_folders hat kein Row Level Security — die Trennung fehlt.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'pmh' AND tablename = 'workspace_folders' AND policyname = 'workspace_folders_mandant'
  ) THEN
    RAISE EXCEPTION 'Die Bedingung workspace_folders_mandant fehlt.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'pmh' AND tablename = 'workspace_folders' AND qual LIKE '%missing_ok%'
  ) THEN
    RAISE EXCEPTION 'Die Bedingung für workspace_folders ist nicht in der lauten Form geschrieben.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'pmh' AND indexname = 'workspace_folders_ein_primaer_idx'
  ) THEN
    RAISE EXCEPTION 'Der Teilindex für den einen Primärordner fehlt.';
  END IF;

  -- **Die alte Spalte muß weg sein.** Bliebe sie stehen, gäbe es zwei Orte für
  -- denselben Pfad — genau das, was diese Migration beendet.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pmh' AND table_name = 'workspaces' AND column_name = 'root_path'
  ) THEN
    RAISE EXCEPTION 'workspaces.root_path steht noch — der Umzug ist nicht abgeschlossen.';
  END IF;

  -- **Und die Daten.** Kein Arbeitsbereich darf zwei Primärordner haben.
  IF EXISTS (
    SELECT 1 FROM workspace_folders
    GROUP BY workspace_id HAVING count(*) FILTER (WHERE ist_primaer) > 1
  ) THEN
    RAISE EXCEPTION 'Ein Arbeitsbereich hat mehr als einen Primärordner.';
  END IF;
END $$;
