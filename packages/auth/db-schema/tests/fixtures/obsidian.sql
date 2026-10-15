-- ===========================================================================
-- Probe: Obsidian-Schema (Migration 0007, D2)
-- ===========================================================================
--
-- Aufruf:
--   Get-Content packages/auth/db-schema/tests/proben/obsidian.sql -Raw |
--     docker exec -i pmh-postgres psql -U pmh_admin -d pmh_test -v ON_ERROR_STOP=1
--
-- WAS SIE TUT. Zwei Mandanten mit je einem Vault, je einer Notiz, Etiketten und
-- Verweisen. Geprueft wird die Mandantentrennung, die Wiederholbarkeit des
-- Einlesens, die Pfadregeln — und der **Fallstrick aus Migration 0004** an einer
-- ZWEITEN Tabelle: `ON DELETE SET NULL (spalte)` darf NUR die eine Spalte leeren.
--
-- Danach ROLLBACK: ein Beweis braucht keine Spur in der Datenbank.
--
-- WAS SIE NICHT LEISTET: Fremdschluessel verhindern SCHREIBEN ueber die
-- Mandantengrenze. Sie verhindern NICHT eine Leseabfrage ohne `WHERE user_id`.
-- ===========================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;

CREATE TEMP TABLE probe (fall text, erwartet text, bekommen text, bestanden boolean) ON COMMIT DROP;
CREATE TEMP TABLE kennung (name text primary key, id uuid, vault uuid, note uuid) ON COMMIT DROP;

INSERT INTO kennung (name, id)
SELECT 'A', gen_random_uuid() UNION ALL SELECT 'B', gen_random_uuid();

INSERT INTO pmh.users (id, email, password_hash, display_name, role)
SELECT id, 'obsidian-' || lower(name) || '@probe.invalid', 'ersatz-hash', 'Probe ' || name, 'user' FROM kennung;

-- ---------------------------------------------------------------------------
-- L4/L5 — die Pfadregeln (vor dem Aufbau, damit kein Vault im Weg ist)
-- ---------------------------------------------------------------------------
DO $$
DECLARE code text; nutzer uuid;
BEGIN
  SELECT id INTO nutzer FROM kennung WHERE name = 'A';
  BEGIN
    INSERT INTO pmh.vaults (id, user_id, pfad) VALUES (gen_random_uuid(), nutzer, 'C:/notizen/../geheim');
    INSERT INTO probe VALUES ('L4  Vault-Pfad mit Aufstieg (..)', '23514', 'angenommen', false);
  EXCEPTION WHEN others THEN
    code := SQLSTATE;
    INSERT INTO probe VALUES ('L4  Vault-Pfad mit Aufstieg (..)', '23514', code, code = '23514');
  END;
  BEGIN
    INSERT INTO pmh.vaults (id, user_id, pfad) VALUES (gen_random_uuid(), nutzer, 'notizen/relativ');
    INSERT INTO probe VALUES ('L5  relativer Vault-Pfad', '23514', 'angenommen', false);
  EXCEPTION WHEN others THEN
    code := SQLSTATE;
    INSERT INTO probe VALUES ('L5  relativer Vault-Pfad', '23514', code, code = '23514');
  END;
END $$;

-- ---------------------------------------------------------------------------
-- Aufbau
-- ---------------------------------------------------------------------------
UPDATE kennung SET vault = gen_random_uuid();
INSERT INTO pmh.vaults (id, user_id, pfad, name)
SELECT vault, id, 'C:/notizen/' || name, 'Vault ' || name FROM kennung;

DO $$
DECLARE code text; nutzer uuid; fremd uuid;
BEGIN
  SELECT id INTO nutzer FROM kennung WHERE name = 'A';
  SELECT vault INTO fremd FROM kennung WHERE name = 'B';
  BEGIN
    INSERT INTO pmh.notes (id, user_id, vault_id, pfad) VALUES (gen_random_uuid(), nutzer, fremd, 'uebergriff.md');
    INSERT INTO probe VALUES ('L2  Notiz von A im Vault von B', '23503', 'angenommen', false);
  EXCEPTION WHEN others THEN
    code := SQLSTATE;
    INSERT INTO probe VALUES ('L2  Notiz von A im Vault von B', '23503', code, code = '23503');
  END;
END $$;

UPDATE kennung SET note = gen_random_uuid();
INSERT INTO pmh.notes (id, user_id, vault_id, pfad, titel, content_hash, mtime, bytes)
SELECT note, id, vault, 'notiz-' || lower(name) || '.md', 'Notiz ' || name,
       encode(sha256(('inhalt-' || name)::bytea), 'hex'), now(), 11
FROM kennung;
INSERT INTO probe VALUES ('L1  Notiz von A im EIGENEN Vault', 'angenommen', 'angenommen', true);

-- ---------------------------------------------------------------------------
-- L3 — Wiederholbarkeit des Einlesens
-- ---------------------------------------------------------------------------
DO $$
DECLARE code text; nutzer uuid; eigen uuid;
BEGIN
  SELECT id INTO nutzer FROM kennung WHERE name = 'A';
  SELECT vault INTO eigen FROM kennung WHERE name = 'A';
  BEGIN
    INSERT INTO pmh.notes (id, user_id, vault_id, pfad) VALUES (gen_random_uuid(), nutzer, eigen, 'notiz-a.md');
    INSERT INTO probe VALUES ('L3  derselbe Pfad zweimal im Vault', '23505', 'angenommen', false);
  EXCEPTION WHEN others THEN
    code := SQLSTATE;
    INSERT INTO probe VALUES ('L3  derselbe Pfad zweimal im Vault', '23505', code, code = '23505');
  END;
END $$;

-- ---------------------------------------------------------------------------
-- L6/L7 — Verweise: fremd abgelehnt, ungeschrieben angenommen
-- ---------------------------------------------------------------------------
DO $$
DECLARE code text; nutzer uuid; fremd uuid;
BEGIN
  SELECT id INTO nutzer FROM kennung WHERE name = 'A';
  SELECT note INTO fremd FROM kennung WHERE name = 'B';
  BEGIN
    INSERT INTO pmh.links (von_note_id, ziel_text, ziel_note_id, user_id)
    VALUES ((SELECT note FROM kennung WHERE name = 'A'), 'Fremd', fremd, nutzer);
    INSERT INTO probe VALUES ('L6  Verweis von A auf die Notiz von B', '23503', 'angenommen', false);
  EXCEPTION WHEN others THEN
    code := SQLSTATE;
    INSERT INTO probe VALUES ('L6  Verweis von A auf die Notiz von B', '23503', code, code = '23503');
  END;

  -- **Der Normalfall in Obsidian:** ein Verweis auf eine Notiz, die es noch nicht
  -- gibt. Er MUSS angenommen werden — sonst waere jeder zweite Verweis ein Fehler.
  BEGIN
    INSERT INTO pmh.links (von_note_id, ziel_text, ziel_note_id, user_id)
    VALUES ((SELECT note FROM kennung WHERE name = 'A'), 'NochNichtGeschrieben', NULL, nutzer);
    INSERT INTO probe VALUES ('L7  Verweis auf eine ungeschriebene Notiz', 'angenommen', 'angenommen', true);
  EXCEPTION WHEN others THEN
    code := SQLSTATE;
    INSERT INTO probe VALUES ('L7  Verweis auf eine ungeschriebene Notiz', 'angenommen', code, false);
  END;
END $$;

-- ---------------------------------------------------------------------------
-- L8 — Etiketten
-- ---------------------------------------------------------------------------
DO $$
DECLARE code text; nutzer uuid; notea uuid; tag uuid;
BEGIN
  SELECT id INTO nutzer FROM kennung WHERE name = 'A';
  SELECT note INTO notea FROM kennung WHERE name = 'A';
  INSERT INTO pmh.tags (id, user_id, name) VALUES (gen_random_uuid(), nutzer, 'projekt');
  BEGIN
    INSERT INTO pmh.tags (id, user_id, name) VALUES (gen_random_uuid(), nutzer, 'projekt');
    INSERT INTO probe VALUES ('L8  dasselbe Etikett zweimal', '23505', 'angenommen', false);
  EXCEPTION WHEN others THEN
    code := SQLSTATE;
    INSERT INTO probe VALUES ('L8  dasselbe Etikett zweimal', '23505', code, code = '23505');
  END;
  SELECT id INTO tag FROM pmh.tags WHERE user_id = nutzer AND name = 'projekt';
  INSERT INTO pmh.note_tags (note_id, tag_id, user_id) VALUES (notea, tag, nutzer);
  INSERT INTO probe VALUES ('L8b Etikett an die eigene Notiz', 'angenommen', 'angenommen', true);
END $$;

-- ---------------------------------------------------------------------------
-- L9 — der Fallstrick aus 0004: NUR das Ziel leeren, nicht den Mandanten
-- ---------------------------------------------------------------------------
DO $$
DECLARE nutzer uuid; zweite uuid; ziel uuid; vorher int; nachher int; mandant uuid;
BEGIN
  -- **Der erste Entwurf dieses Falls war FALSCH GEBAUT** und scheiterte an
  -- `links_ziel_note_user_fkey`: ich hatte einen Verweis von B's Notiz auf A's
  -- Notiz gelegt — also einen **mandantenübergreifenden** Verweis, den das Schema
  -- mit Absicht ablehnt. Der Fallstrick aus 0004 (`ON DELETE SET NULL (spalte)`)
  -- läßt sich nur **innerhalb** eines Mandanten messen: A's zweite Notiz verweist
  -- auf A's erste.
  SELECT id INTO nutzer FROM kennung WHERE name = 'A';
  SELECT note INTO ziel FROM kennung WHERE name = 'A';

  INSERT INTO pmh.notes (id, user_id, vault_id, pfad, titel)
  SELECT gen_random_uuid(), nutzer, vault, 'zweite-notiz.md', 'Zweite'
    FROM kennung WHERE name = 'A'
  RETURNING id INTO zweite;

  INSERT INTO pmh.links (von_note_id, ziel_text, ziel_note_id, user_id)
  VALUES (zweite, 'ZielBeiA', ziel, nutzer);
  SELECT count(*) INTO vorher FROM pmh.links WHERE ziel_note_id = ziel;

  DELETE FROM pmh.notes WHERE id = ziel;

  SELECT count(*) INTO nachher FROM pmh.links WHERE ziel_note_id = ziel;
  SELECT user_id INTO mandant FROM pmh.links WHERE ziel_text = 'ZielBeiA';
  INSERT INTO probe VALUES ('L9  Ziel geloescht: ziel_note_id leer, user_id NICHT',
                            '1 -> 0 und Mandant bleibt',
                            vorher::text || ' -> ' || nachher::text || ' und Mandant ' ||
                              CASE WHEN mandant IS NULL THEN 'WEG' ELSE 'bleibt' END,
                            vorher = 1 AND nachher = 0 AND mandant IS NOT NULL);
END $$;

-- ---------------------------------------------------------------------------
-- L10 — Loeschen nimmt Etiketten und eigene Verweise mit
-- ---------------------------------------------------------------------------
-- **Der erste Entwurf dieses Falls war LEER.** Er meldete „Verweise 0 -> 0" und
-- galt als bestanden: B's Notiz hatte gar keine ausgehenden Verweise, und ob es je
-- ein Etikett gab, wurde nicht gemessen. Ein Fall, der 0 gegen 0 prueft, ist keine
-- Pruefung. Jetzt werden die Zahlen **vorher** gemessen und **muessen mindestens 1
-- sein** — sonst ist der Fall wertlos und die Probe sagt das.
DO $$
DECLARE nutzer uuid; erste uuid; zweite uuid; vorher_links int; nachher_links int;
        vorher_tags int; nachher_tags int;
BEGIN
  SELECT id INTO nutzer FROM kennung WHERE name = 'B';
  SELECT note INTO erste FROM kennung WHERE name = 'B';

  INSERT INTO pmh.notes (id, user_id, vault_id, pfad, titel)
  SELECT gen_random_uuid(), nutzer, vault, 'zweite-b.md', 'Zweite B'
    FROM kennung WHERE name = 'B'
  RETURNING id INTO zweite;

  -- Ein AUSGEHENDER Verweis (von der Notiz, die geloescht wird) …
  INSERT INTO pmh.links (von_note_id, ziel_text, ziel_note_id, user_id)
  VALUES (erste, 'ZurZweiten', zweite, nutzer);
  -- … und ein Etikett an derselben Notiz.
  INSERT INTO pmh.tags (id, user_id, name)
  SELECT gen_random_uuid(), nutzer, 'weg'
   WHERE NOT EXISTS (SELECT 1 FROM pmh.tags WHERE user_id = nutzer AND name = 'weg');
  INSERT INTO pmh.note_tags (note_id, tag_id, user_id)
  SELECT erste, id, nutzer FROM pmh.tags WHERE user_id = nutzer AND name = 'weg';

  SELECT count(*) INTO vorher_links FROM pmh.links WHERE von_note_id = erste;
  SELECT count(*) INTO vorher_tags FROM pmh.note_tags WHERE note_id = erste;

  DELETE FROM pmh.notes WHERE id = erste;

  SELECT count(*) INTO nachher_links FROM pmh.links WHERE von_note_id = erste;
  SELECT count(*) INTO nachher_tags FROM pmh.note_tags WHERE note_id = erste;

  INSERT INTO probe VALUES
    ('L10 Notiz loeschen nimmt Verweise und Etiketten mit',
     'vorher >= 1, nachher 0',
     'Verweise ' || vorher_links::text || ' -> ' || nachher_links::text ||
       ', Etiketten ' || vorher_tags::text || ' -> ' || nachher_tags::text,
     -- **Die Vorbedingung gehoert in das Urteil.** Waere `vorher` 0, bewiese der
     -- Fall nichts — und duerfte nicht als bestanden gelten.
     vorher_links >= 1 AND vorher_tags >= 1 AND nachher_links = 0 AND nachher_tags = 0);
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
DECLARE gesamt int; schlecht int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE NOT bestanden) INTO gesamt, schlecht FROM probe;
  IF schlecht > 0 THEN
    RAISE EXCEPTION 'PROBE GESCHEITERT: % von % Faellen falsch', schlecht, gesamt;
  END IF;
  RAISE NOTICE 'PROBE BESTANDEN: alle % Faelle wie erwartet', gesamt;
END $$;

ROLLBACK;
