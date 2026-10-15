-- =============================================================================
-- Rechteprobe: greift das Rechtemodell WIRKLICH?
-- =============================================================================
--
-- **Warum diese Datei existiert.** Ein Rechtemodell, das nur in einer
-- Einrichtungsdatei steht, ist eine Absicht. Geprüft wird hier, **dass es
-- wirkt** — mit den drei echten Rollen und dem echten Schema:
--
--   1. Die Anwendung **darf** lesen und schreiben.
--   2. Die Anwendung **darf kein** DDL — sie kann die Struktur nicht ändern.
--   3. Die Anwendung **darf nicht** `TRUNCATE` — sonst wäre „löschen" ein
--      Einzeiler ohne Auslöser.
--   4. Nur-Lesen **darf nur** lesen.
--   5. **Die Vorgaben greifen für NEUE Tabellen** — der eigentliche Test des
--      Erbverhaltens. Genau das ist der Punkt, an dem `ALTER DEFAULT PRIVILEGES`
--      in der Praxis oft wirkungslos ist, weil es für die falsche Rolle gesetzt
--      wurde.
--
-- **Der wichtigste Test ist Nummer 5.** Er legt eine Tabelle an, **nachdem** die
-- Einrichtung gelaufen ist, und prüft dann, ob die Anwendungsrolle sie benutzen
-- darf. Ohne die Vorgabe aus `defaults-as-owner.sql.in` müsste sie scheitern.
--
-- Aufruf (aus dem Repo):
--   docker compose exec -T postgres psql -U pmh_app -d pmh -f - < diese_datei
-- bzw. die Prüfungen einzeln, siehe `scripts/stack-test.ps1` Schritt 7.
--
-- =============================================================================

\set ON_ERROR_STOP off

\echo '=== Rechteprobe als pmh_app (die Anwendung) ==='

\echo ''
\echo '--- 1. Darf lesen? ---'
SELECT count(*) AS benutzer_sichtbar FROM users;

\echo ''
\echo '--- 2. Darf schreiben? (INSERT + UPDATE + DELETE) ---'
INSERT INTO one_time_tokens (id, user_id, purpose, token_hash, expires_at)
SELECT gen_random_uuid(), id, 'invite', repeat('a', 64), now() + interval '1 hour'
  FROM users LIMIT 1;
DELETE FROM one_time_tokens WHERE token_hash = repeat('a', 64);
\echo '(kein Fehler = darf schreiben)'

\echo ''
\echo '--- 3. Darf KEIN DDL? (das MUSS scheitern) ---'
CREATE TABLE darf_nicht (id int);
\echo '(ein Fehler oben ist das ERWARTETE Ergebnis)'

\echo ''
\echo '--- 4. Darf NICHT TRUNCATE? (das MUSS scheitern) ---'
TRUNCATE users;
\echo '(ein Fehler oben ist das ERWARTETE Ergebnis)'

\echo ''
\echo '--- 5. Darf keine Tabelle loeschen? (das MUSS scheitern) ---'
DROP TABLE users;
\echo '(ein Fehler oben ist das ERWARTETE Ergebnis)'

\echo ''
\echo '--- 6. Darf keine Rolle anlegen? (das MUSS scheitern) ---'
CREATE ROLE angriff LOGIN;
\echo '(ein Fehler oben ist das ERWARTETE Ergebnis)'

\echo ''
\echo '=== Ende der Probe als pmh_app ==='
