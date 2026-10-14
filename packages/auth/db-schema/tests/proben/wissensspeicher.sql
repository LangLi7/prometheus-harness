-- ===========================================================================
-- Probe: Mandantentrennung im Wissensspeicher (Migration 0006, D1)
-- ===========================================================================
--
-- Aufruf (aus dem Projektwurzelverzeichnis, Docker-Stapel laeuft):
--
--   Get-Content packages/auth/db-schema/tests/proben/wissensspeicher.sql -Raw |
--     docker exec -i pmh-postgres psql -U pmh_admin -d pmh_test -v ON_ERROR_STOP=1
--
-- WAS DIESE PROBE TUT. Sie stellt zwei Mandanten her (A und B), gibt jedem eine
-- Werkstatt, ein Dokument und ein Textstueck — und prueft dann, dass ein
-- **Uebergriff auf den fremden Mandanten abgelehnt** wird, waehrend der eigene
-- Fall durchgeht. Danach rollt sie alles zurueck: ein Beweis braucht keine Spur
-- in der Datenbank, die AUSGABE ist der Beweis.
--
-- ---------------------------------------------------------------------------
-- WARUM DIE KONTROLLFAELLE DAZUGEHOEREN
-- ---------------------------------------------------------------------------
-- Eine Probe, die nur Ablehnungen zeigt, beweist zu wenig: eine Regel, die
-- ALLES ablehnt, waere ebenso gruen. Deshalb steht neben jedem abgelehnten
-- Uebergriff ein **angenommener** eigener Fall. Erst beides zusammen sagt:
-- die Regel unterscheidet.
--
-- ---------------------------------------------------------------------------
-- WAS DIESE PROBE NICHT LEISTET — und das gehoert hierher
-- ---------------------------------------------------------------------------
-- Fremdschluessel verhindern **Schreiben** ueber die Mandantengrenze. Sie
-- verhindern NICHT, dass eine LESEABFRAGE ohne `WHERE user_id = ...` fremde
-- Zeilen liefert. Genau das steht im Kopf von Migration 0006 und in
-- `docs/decisions/vektorsuche-mandant-und-modell.md`. Eine Probe, die das
-- verschweigt, behauptete mehr, als sie messen kann.
--
-- ---------------------------------------------------------------------------
-- WARUM DAS URTEIL EINE AUSNAHME WIRFT
-- ---------------------------------------------------------------------------
-- psql scheitert nicht daran, dass ein SELECT eine unangenehme Zeile liefert.
-- Ohne `RAISE` endete die Probe auch dann mit Exit-Code 0, wenn alles schiefging
-- — als Regressionstest waere sie wertlos. Dieselbe Begruendung wie in
-- `mandantentrennung.sql`.
-- ===========================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;

CREATE TEMP TABLE probe (
  fall      text,
  erwartet  text,
  bekommen  text,
  bestanden boolean
) ON COMMIT DROP;

-- ---------------------------------------------------------------------------
-- Aufbau: zwei Mandanten
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE kennung (name text primary key, id uuid, ws uuid, ordner uuid, doc uuid, chunk uuid) ON COMMIT DROP;

INSERT INTO kennung (name, id)
SELECT 'A', gen_random_uuid() UNION ALL SELECT 'B', gen_random_uuid();

INSERT INTO pmh.users (id, email, password_hash, display_name, role)
SELECT id, 'wissensspeicher-' || lower(name) || '@probe.invalid', 'ersatz-hash', 'Probe ' || name, 'user'
FROM kennung;

UPDATE kennung k SET ws = gen_random_uuid();
INSERT INTO pmh.workspaces (id, user_id, name)
SELECT ws, id, 'Werkstatt ' || name FROM kennung;

-- **Der Quellordner liegt seit Migration 9 in `workspace_folders`** (mehrere je
-- Arbeitsbereich, genau einer primär). Die Probe legt je Mandant einen an.
UPDATE kennung k SET ordner = gen_random_uuid();
INSERT INTO pmh.workspace_folders (id, workspace_id, user_id, pfad, ist_primaer, sortierung)
SELECT ordner, ws, id, 'C:/probe/' || name, true, 0 FROM kennung;

-- Ein Dokument und ein Stueck JE Mandant — beide gehoeren ihrem eigenen.
UPDATE kennung k SET doc = gen_random_uuid();
INSERT INTO pmh.documents (id, user_id, workspace_id, kind, source_path, title, content_hash, bytes)
SELECT doc, id, ws, 'notiz', 'C:/probe/' || name || '/notiz.md', 'Notiz ' || name,
       encode(sha256(('inhalt-' || name)::bytea), 'hex'), 11
FROM kennung;

UPDATE kennung k SET chunk = gen_random_uuid();
INSERT INTO pmh.chunks (id, user_id, document_id, ordinal, content_cipher, tokens)
SELECT chunk, id, doc, 0, ('geheim-' || name)::bytea, 3 FROM kennung;

INSERT INTO probe
SELECT 'K0  Aufbau: zwei Mandanten mit je einem Dokument und Stueck',
       '2/2/2', (SELECT count(*)::text FROM pmh.documents WHERE user_id IN (SELECT id FROM kennung))
                || '/' || (SELECT count(*)::text FROM pmh.chunks WHERE user_id IN (SELECT id FROM kennung))
                || '/' || (SELECT count(*)::text FROM pmh.workspaces WHERE user_id IN (SELECT id FROM kennung)),
       (SELECT count(*) = 2 FROM pmh.documents WHERE user_id IN (SELECT id FROM kennung));

-- ---------------------------------------------------------------------------
-- L1/L2 — das Dokument und seine Werkstatt
-- ---------------------------------------------------------------------------
INSERT INTO pmh.documents (id, user_id, workspace_id, kind, title)
SELECT gen_random_uuid(), a.id, a.ws, 'notiz', 'eigene Werkstatt'
FROM kennung a WHERE a.name = 'A';
INSERT INTO probe VALUES ('L1  Dokument von A in der EIGENEN Werkstatt', 'angenommen', 'angenommen', true);

DO $$
DECLARE
  code text;
  nutzer uuid;
  fremd uuid;
BEGIN
  SELECT id INTO nutzer FROM kennung WHERE name = 'A';
  SELECT ws  INTO fremd  FROM kennung WHERE name = 'B';
  BEGIN
    INSERT INTO pmh.documents (id, user_id, workspace_id, kind, title)
    VALUES (gen_random_uuid(), nutzer, fremd, 'notiz', 'fremde Werkstatt');
    INSERT INTO probe VALUES ('L2  Dokument von A in der Werkstatt von B', '23503', 'angenommen', false);
  EXCEPTION WHEN others THEN
    code := SQLSTATE;
    INSERT INTO probe VALUES ('L2  Dokument von A in der Werkstatt von B', '23503', code, code = '23503');
  END;
END $$;

-- ---------------------------------------------------------------------------
-- L3/L4 — das Textstueck und sein Dokument  ← der Kern
-- ---------------------------------------------------------------------------
INSERT INTO pmh.chunks (id, user_id, document_id, ordinal, content_cipher)
SELECT gen_random_uuid(), a.id, a.doc, 1, 'zweites Stueck von A'::bytea
FROM kennung a WHERE a.name = 'A';
INSERT INTO probe VALUES ('L3  Stueck von A am EIGENEN Dokument', 'angenommen', 'angenommen', true);

DO $$
DECLARE
  code text;
  nutzer uuid;
  fremd uuid;
BEGIN
  SELECT id INTO nutzer FROM kennung WHERE name = 'A';
  SELECT doc INTO fremd FROM kennung WHERE name = 'B';
  BEGIN
    -- **`ordinal = 7` und nicht `0`.** Der erste Entwurf nahm `0` — und bekam
    -- `23505` statt `23503`: Bs eigenes Dokument hat schon ein Stueck an Stelle 0,
    -- und die Eindeutigkeit `(document_id, ordinal)` greift VOR dem
    -- Fremdschluessel. Damit war nicht mehr zu sehen, WELCHE Regel abgelehnt
    -- hatte — die Probe haette „abgelehnt" gemeldet und das Falsche gemeint.
    -- Eine freie Stelle macht die Aussage eindeutig.
    INSERT INTO pmh.chunks (id, user_id, document_id, ordinal, content_cipher)
    VALUES (gen_random_uuid(), nutzer, fremd, 7, 'uebergriff'::bytea);
    INSERT INTO probe VALUES ('L4  Stueck von A am Dokument von B', '23503', 'angenommen', false);
  EXCEPTION WHEN others THEN
    code := SQLSTATE;
    INSERT INTO probe VALUES ('L4  Stueck von A am Dokument von B', '23503', code, code = '23503');
  END;
END $$;

-- ---------------------------------------------------------------------------
-- L5 — zweimal dieselbe Stelle
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  code text;
  nutzer uuid;
  eigen uuid;
BEGIN
  SELECT id INTO nutzer FROM kennung WHERE name = 'A';
  SELECT doc INTO eigen FROM kennung WHERE name = 'A';
  BEGIN
    INSERT INTO pmh.chunks (id, user_id, document_id, ordinal, content_cipher)
    VALUES (gen_random_uuid(), nutzer, eigen, 0, 'doppelt'::bytea);
    INSERT INTO probe VALUES ('L5  zweimal ordinal 0 im selben Dokument', '23505', 'angenommen', false);
  EXCEPTION WHEN others THEN
    code := SQLSTATE;
    INSERT INTO probe VALUES ('L5  zweimal ordinal 0 im selben Dokument', '23505', code, code = '23505');
  END;
END $$;

-- ---------------------------------------------------------------------------
-- L6/L7/L8/L9 — Vektor, Modell und der Zustand „noch nicht eingebettet"
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  code text;
  nutzer uuid;
  eigen uuid;
  v vector(768) := array_fill(0.1::real, ARRAY[768])::vector;
BEGIN
  SELECT id INTO nutzer FROM kennung WHERE name = 'A';
  SELECT doc INTO eigen FROM kennung WHERE name = 'A';

  -- L6: Vektor OHNE Modell
  BEGIN
    INSERT INTO pmh.chunks (id, user_id, document_id, ordinal, content_cipher, embedding)
    VALUES (gen_random_uuid(), nutzer, eigen, 10, 'ohne Modell'::bytea, v);
    INSERT INTO probe VALUES ('L6  Vektor ohne Modellangabe', '23514', 'angenommen', false);
  EXCEPTION WHEN others THEN
    code := SQLSTATE;
    INSERT INTO probe VALUES ('L6  Vektor ohne Modellangabe', '23514', code, code = '23514');
  END;

  -- L7: Modell OHNE Vektor
  BEGIN
    INSERT INTO pmh.chunks (id, user_id, document_id, ordinal, content_cipher, embedding_model)
    VALUES (gen_random_uuid(), nutzer, eigen, 11, 'ohne Vektor'::bytea, 'irgendein-modell');
    INSERT INTO probe VALUES ('L7  Modellangabe ohne Vektor', '23514', 'angenommen', false);
  EXCEPTION WHEN others THEN
    code := SQLSTATE;
    INSERT INTO probe VALUES ('L7  Modellangabe ohne Vektor', '23514', code, code = '23514');
  END;

  -- L8: ohne Vektor, aber mit Zeitpunkt — behauptet eine Einbettung, die nicht da ist
  BEGIN
    INSERT INTO pmh.chunks (id, user_id, document_id, ordinal, content_cipher, embedded_at)
    VALUES (gen_random_uuid(), nutzer, eigen, 12, 'Zeitpunkt ohne Vektor'::bytea, now());
    INSERT INTO probe VALUES ('L8  Einbettungszeitpunkt ohne Vektor', '23514', 'angenommen', false);
  EXCEPTION WHEN others THEN
    code := SQLSTATE;
    INSERT INTO probe VALUES ('L8  Einbettungszeitpunkt ohne Vektor', '23514', code, code = '23514');
  END;

  -- L9: Vektor UND Modell — der gueltige Fall
  BEGIN
    INSERT INTO pmh.chunks (id, user_id, document_id, ordinal, content_cipher, embedding, embedding_model, embedded_at)
    VALUES (gen_random_uuid(), nutzer, eigen, 13, 'eingebettet'::bytea, v, 'probe-modell', now());
    INSERT INTO probe VALUES ('L9  Vektor MIT Modell und Zeitpunkt', 'angenommen', 'angenommen', true);
  EXCEPTION WHEN others THEN
    code := SQLSTATE;
    INSERT INTO probe VALUES ('L9  Vektor MIT Modell und Zeitpunkt', 'angenommen', code, false);
  END;
END $$;

-- ---------------------------------------------------------------------------
-- L10 — die Nacharbeit findet, was noch offen ist
-- ---------------------------------------------------------------------------
INSERT INTO probe
SELECT 'L10 offene Stuecke sind auffindbar (embedding IS NULL)',
       '>=1', (SELECT count(*)::text FROM pmh.chunks WHERE user_id IN (SELECT id FROM kennung) AND embedding IS NULL),
       (SELECT count(*) >= 1 FROM pmh.chunks WHERE user_id IN (SELECT id FROM kennung) AND embedding IS NULL);

-- ---------------------------------------------------------------------------
-- L11 — das Dokument nimmt seine Stuecke mit
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  vorher int;
  nachher int;
  eigen uuid;
BEGIN
  SELECT doc INTO eigen FROM kennung WHERE name = 'A';
  SELECT count(*) INTO vorher FROM pmh.chunks WHERE document_id = eigen;
  DELETE FROM pmh.documents WHERE id = eigen;
  SELECT count(*) INTO nachher FROM pmh.chunks WHERE document_id = eigen;
  INSERT INTO probe VALUES ('L11 Dokument loeschen nimmt seine Stuecke mit',
                            vorher::text || ' -> 0', vorher::text || ' -> ' || nachher::text,
                            vorher > 0 AND nachher = 0);
END $$;

-- ---------------------------------------------------------------------------
-- Das Urteil
-- ---------------------------------------------------------------------------
\echo ''
\echo '================ ERGEBNIS DER PROBE ================'
SELECT fall, erwartet, bekommen, CASE WHEN bestanden THEN 'ok' ELSE 'FEHLER' END AS urteil
FROM probe ORDER BY fall;
\echo '==================================================='

DO $$
DECLARE
  gesamt int;
  schlecht int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE NOT bestanden) INTO gesamt, schlecht FROM probe;
  IF schlecht > 0 THEN
    RAISE EXCEPTION 'PROBE GESCHEITERT: % von % Faellen falsch', schlecht, gesamt;
  END IF;
  RAISE NOTICE 'PROBE BESTANDEN: alle % Faelle wie erwartet', gesamt;
END $$;

ROLLBACK;
