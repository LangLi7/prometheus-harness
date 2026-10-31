-- ===========================================================================
-- 0013 — Die Crews gehören einem Konto
-- ===========================================================================
--
-- ANLASS: Die Crew war bis hierher eine **Datei** (`<home>/crew/config.json`).
-- Der Betreiber (21.10.2026): die Crew soll ein vollwertiges Plugin sein, und
-- die Ablage gehört „in die Datenbank, je Nutzer, Datei nur als Rückfall".
--
-- WAS DIESE MIGRATION TUT:
--   1. `crew_definitionen` entsteht: je Zeile eine Crew eines Kontos, die
--      Rollenbindungen als JSON.
--   2. `crew_einstellungen` entsteht: je Konto **eine** Zeile mit Standard-Crew,
--      Projekt und der Frage, ob der Host die Crews dieses Kontos bedient.
--
-- WARUM DIE CREW-KENNUNG GLOBAL EINDEUTIG IST. Die Kennung ist am Kern-Seam
-- zugleich die **Modellkennung** (der Adapter läuft unter der einen Route
-- `crew`, die Modell-ID ist die Crew-ID). Zwei Konten mit derselben Kennung
-- wären zwei Modelle mit demselben Namen — der Adapter könnte nicht
-- entscheiden, welches gemeint ist. Deshalb: `UNIQUE (crew_id)` über die ganze
-- Tabelle, und die Anwendung antwortet mit 409 statt zu überschreiben.
--
-- WARUM TROTZDEM ZUSÄTZLICH `(user_id, crew_id)` DER SCHLÜSSEL IST. Die
-- Eindeutigkeit über alle Konten ist eine **Regel des Adapters**, nicht die
-- Identität einer Zeile. Der Primärschlüssel bleibt das Paar — so kann eine
-- spätere Lockerung (etwa Crews teilen) ohne Umbau der Zeilenidentität kommen.
--
-- WARUM KEIN ROW LEVEL SECURITY. Bei `workspace_folders` (Migration 9) und den
-- Notizen (Migration 7) ist die Grenze die Datenbank. Hier ist sie es **nicht
-- vollständig**: der Host baut beim Start **einen** Adapter aus den Crews
-- **aller** aktiven Konten — das ist genau der Zweck der einen Route. Eine
-- Bedingung `user_id = current_setting(...)` würde diese Abfrage für die
-- Anwendungsrolle still leer laufen lassen und die Crew verschwände ohne
-- Fehlermeldung. Die Grenze ist deshalb die **Abfrage**: jede Zeile trägt
-- `user_id`, jede Abfrage außer der einen Komposition filtert danach, und die
-- Komposition ist als solche benannt (`alleAktiven`).
--
-- WARUM KEIN `GRANT` FEHLT. `docker/postgres-init/defaults-as-owner.sql.in`
-- setzt die Vorgaberechte; Migration 9 hat gemessen, daß sie auf einer von Hand
-- angelegten Datenbank fehlen. Die Rechte stehen deshalb ausdrücklich hier.
--
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Die Crews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crew_definitionen (
  -- Der Mandant. Der Fremdschlüssel räumt beim Löschen des Kontos mit auf.
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Die Kennung — zugleich der Modellname am Kern-Seam.
  crew_id     text        NOT NULL,
  -- Der Name für Menschen; fehlt er, zeigt die Oberfläche die Kennung.
  name        text,
  -- Die Rollenbindungen: `{ "planner": { "familie": "...", "modell": "..." } }`.
  rollen      jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, crew_id),

  -- Dieselbe Form wie ein Nutzername im Pfad (`crew-plan/scope.ts`):
  -- Buchstaben, Ziffern, `-`, `_`, `.` als Trenner, kein Leerzeichen, kein `..`.
  CONSTRAINT crew_definitionen_kennung_form
    CHECK (crew_id ~ '^[A-Za-z0-9]+([-_.][A-Za-z0-9]+)*$'),
  CONSTRAINT crew_definitionen_kennung_nicht_crew CHECK (crew_id <> 'crew'),
  -- Eine Crew ohne Rolle wäre ein Modell, das nichts tut.
  CONSTRAINT crew_definitionen_rollen_objekt
    CHECK (jsonb_typeof(rollen) = 'object' AND rollen <> '{}'::jsonb)
);

-- **Die eine Kennung, ein Modell.** Siehe Kopfkommentar.
CREATE UNIQUE INDEX IF NOT EXISTS crew_definitionen_kennung_key
  ON crew_definitionen (crew_id);

-- Für die Liste eines Kontos (die einzige Abfrage der Oberfläche).
CREATE INDEX IF NOT EXISTS crew_definitionen_mandant_idx
  ON crew_definitionen (user_id, created_at);

-- ---------------------------------------------------------------------------
-- 2. Die Einstellungen je Konto
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crew_einstellungen (
  user_id       uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  -- Welche Crew dieses Kontos die Vorgabe ist. Der Verweis ist zusammengesetzt:
  -- eine Standard-Crew eines **fremden** Kontos ist damit unmöglich.
  standard_crew text,
  -- Das Projekt der Werkzeuge (absoluter Pfad) — leer heißt „ohne Projekt".
  projekt       text,
  -- Ob der Host die Crews dieses Kontos bedient. `false` heißt: die Crews
  -- bleiben gespeichert, erscheinen aber nicht als Modelle.
  aktiv         boolean     NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT crew_einstellungen_projekt_absolut
    CHECK (projekt IS NULL OR projekt = '' OR projekt ~ '^([A-Za-z]:[\\/]|/)'),
  CONSTRAINT crew_einstellungen_projekt_ohne_aufstieg
    CHECK (projekt IS NULL OR position('..' in projekt) = 0),

  -- **`SET NULL (standard_crew)` und nicht `SET NULL`.** Ohne Spaltenliste
  -- würde PostgreSQL auch `user_id` leeren wollen — und das ist der
  -- Primärschlüssel. Die Spaltenform gibt es seit PostgreSQL 15.
  CONSTRAINT crew_einstellungen_standard_fkey
    FOREIGN KEY (user_id, standard_crew) REFERENCES crew_definitionen (user_id, crew_id)
    ON DELETE SET NULL (standard_crew)
);

-- ---------------------------------------------------------------------------
-- 3. Rechte
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON crew_definitionen TO pmh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON crew_einstellungen TO pmh_app;

-- ---------------------------------------------------------------------------
-- 4. Selbstprüfung der Migration
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'crew_definitionen' AND n.nspname = 'pmh'
  ) THEN
    RAISE EXCEPTION 'crew_definitionen fehlt.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'crew_einstellungen' AND n.nspname = 'pmh'
  ) THEN
    RAISE EXCEPTION 'crew_einstellungen fehlt.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'pmh' AND indexname = 'crew_definitionen_kennung_key'
  ) THEN
    RAISE EXCEPTION 'Die Eindeutigkeit der Crew-Kennung fehlt — zwei Konten könnten dasselbe Modell stellen.';
  END IF;

  -- Die zusammengesetzte Vorgabe muß stehen: sonst wäre eine Standard-Crew
  -- eines fremden Kontos eintragbar.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crew_einstellungen_standard_fkey'
  ) THEN
    RAISE EXCEPTION 'Der zusammengesetzte Verweis auf die Standard-Crew fehlt.';
  END IF;
END $$;
