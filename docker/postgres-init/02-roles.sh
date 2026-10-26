#!/bin/sh
# =============================================================================
# 02 — Rollen, Schema und Rechte einrichten
# =============================================================================
#
# **Warum das ein Skript ist und keine reine SQL-Datei — mit dem Befund, der es
# erzwungen hat (gemessen, 13.10.2026).**
#
# Die erste Fassung war eine reine `.sql`-Datei mit `:PMH_APP_USER` darin. Der
# erste Start scheiterte:
#
#     psql:/docker-entrypoint-initdb.d/02-roles.sql:83: ERROR: syntax error at or near ":"
#     STATEMENT: SELECT format('CREATE ROLE %I ...', :'PMH_OWNER_USER', ...
#
# **Die Ursache:** das Postgres-Image führt `/docker-entrypoint-initdb.d/*.sql`
# mit `psql` aus und übergibt dabei **nur seine eigenen** Variablen
# (`POSTGRES_USER` usw.) über `--set`. Unsere Variablen stehen zwar **in der
# Umgebung des Containers** (gegengeprüft: `env | grep -c '^PMH_'` ergab 6), aber
# **nicht** als psql-Variablen. Ein `:'NAME'` ohne `-v` ist in psql ein
# **Zeichenketten-Literal** — und ein Literal an dieser Stelle ist ein
# Syntaxfehler.
#
# **Was daraus für den Leser folgt:** der Eintragungspunkt reicht Umgebung
# **nicht** an SQL durch. Wer hier eine `.sql`-Datei mit Variablen ablegt, baut
# etwas, das beim ersten Start scheitert — und genau dieser Pfad ist der, den ein
# Fremder geht, der das Projekt ausprobiert.
#
# Dieses Skript übergibt die Variablen deshalb **ausdrücklich** mit `-v`.
#
# =============================================================================

set -eu

echo ""
echo "=== 02: Rollen, Schema und Rechte ==="

: "${POSTGRES_USER:?POSTGRES_USER fehlt}"
: "${POSTGRES_DB:?POSTGRES_DB fehlt}"
: "${PMH_OWNER_USER:?PMH_OWNER_USER fehlt}"
: "${PMH_OWNER_PASSWORD:?PMH_OWNER_PASSWORD fehlt}"
: "${PMH_APP_USER:?PMH_APP_USER fehlt}"
: "${PMH_APP_PASSWORD:?PMH_APP_PASSWORD fehlt}"
: "${PMH_READONLY_USER:?PMH_READONLY_USER fehlt}"
: "${PMH_READONLY_PASSWORD:?PMH_READONLY_PASSWORD fehlt}"

# Die Namen müssen reine Bezeichner sein: sie werden in SQL eingesetzt, und
# `%I` schützt zwar gegen Einschleusung, aber ein Name mit Leerzeichen wäre
# trotzdem eine Fehlkonfiguration, die man früh sehen soll.
for name in "$PMH_OWNER_USER" "$PMH_APP_USER" "$PMH_READONLY_USER"; do
  case "$name" in
    *[!a-z0-9_]* | '' | [0-9]*)
      echo "  FEHLER: Rollenname '$name' ist kein reiner Kleinbuchstaben-Bezeichner."
      echo "  Erlaubt: a-z, 0-9, _ ; kein führendes Zeichen, das keine Ziffer sein darf."
      exit 1
      ;;
  esac
done

psql -v ON_ERROR_STOP=1 \
     -v owner_user="$PMH_OWNER_USER" -v owner_password="$PMH_OWNER_PASSWORD" \
     -v app_user="$PMH_APP_USER" -v app_password="$PMH_APP_PASSWORD" \
     -v ro_user="$PMH_READONLY_USER" -v ro_password="$PMH_READONLY_PASSWORD" \
     -v dbname="$POSTGRES_DB" \
     -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'

-- ---------------------------------------------------------------------------
-- 1. Die drei Rollen
-- ---------------------------------------------------------------------------
-- **Warum vier Rollen statt einer.** Der übliche Kurzschluss ist „eine Rolle für
-- alles". Damit hat der laufende Dienst das Recht, Tabellen zu **löschen** — und
-- eine einzige gelungene SQL-Einschleusung über die Anwendung kann die Struktur
-- zerstören. Mit getrennten Rollen gilt: selbst wenn die Anwendung fällt, fällt
-- die **Struktur** nicht.
--
-- | Rolle | Darf | Wozu |
-- |---|---|---|
-- | Superuser | alles | **nur die Einrichtung.** Die Anwendung benutzt ihn nie |
-- | Eigentümerin | DDL (Tabellen anlegen/ändern) | die Migrationen |
-- | Anwendung | SELECT/INSERT/UPDATE/DELETE | der laufende Dienst |
-- | Nur-Lesen | nur SELECT | Auswertungen, Fremdwerkzeuge, pgAdmin |
--
-- **`NOINHERIT` ist Absicht.** Ohne `INHERIT` erbt eine Rolle keine Rechte
-- anderer Rollen. Da hier bewusst **keine** Mitgliedschaften vergeben werden
-- (siehe unten), ist das die zweite Sicherung.
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', :'owner_user', :'owner_password')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'owner_user')
\gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', :'app_user', :'app_password')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', :'ro_user', :'ro_password')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'ro_user')
\gexec

-- Passwörter bei einem erneuten Lauf aktualisieren: wer `.env` ändert, erwartet,
-- dass es wirkt. Ohne diese Zeilen bliebe das alte Passwort stehen, und der
-- Fehler wäre ein „Passwort falsch", dem niemand ansieht, woher er kommt.
ALTER ROLE :"owner_user" WITH PASSWORD :'owner_password';
ALTER ROLE :"app_user" WITH PASSWORD :'app_password';
ALTER ROLE :"ro_user" WITH PASSWORD :'ro_password';

-- ---------------------------------------------------------------------------
-- 2b. Rollenweite Einstellungen — und warum sie HIER stehen
-- ---------------------------------------------------------------------------
-- **Der Befund, der das erzwungen hat (gemessen, 13.10.2026).** Diese drei
-- Zeilen standen zuerst in der Datei, die als **Eigentümerin** läuft — und der
-- Start scheiterte:
--
--     ERROR: permission denied to alter role
--
-- **Die Ursache:** eine Rolle darf ihre **eigenen** Einstellungen ändern, aber
-- nicht die einer **anderen** — auch nicht, wenn sie die Rechte dazu hätte,
-- Tabellen anzulegen. `ALTER ROLE <fremde Rolle> SET ...` ist eine
-- Superuser-Anweisung. Gemessen: die Eigentümerin durfte es nicht.
--
-- **Was daraus folgt, und das ist die allgemeine Regel:** rollenweite
-- Einstellungen gehören in die **Einrichtung** (Superuser), Vorgaben für
-- künftige Objekte gehören zur **Eigentümerin** (`ALTER DEFAULT PRIVILEGES`
-- gilt für die Rolle, die es setzt). Zwei Dinge, zwei Orte — und wer sie
-- vertauscht, bekommt einen Startfehler, der wie ein Rechteproblem aussieht und
-- keines ist.
--
-- **Der Suchpfad.** Damit `SELECT * FROM users` funktioniert, ohne dass jede
-- Abfrage `pmh.users` heißen muss. Ohne ihn findet jedes Fremdwerkzeug — und
-- jede Abfrage, die jemand von Hand tippt — die Tabellen nicht.
ALTER ROLE :"owner_user" SET search_path TO pmh, public;
ALTER ROLE :"app_user" SET search_path TO pmh, public;
ALTER ROLE :"ro_user" SET search_path TO pmh, public;

-- ---------------------------------------------------------------------------
-- 2. Zugang zur Datenbank
-- ---------------------------------------------------------------------------
-- **`REVOKE ALL ... FROM PUBLIC` zuerst.** Ohne diese Zeile hat jede Rolle, die
-- es je geben wird, das Recht, sich zu verbinden — PostgreSQL vergibt `CONNECT`
-- auf eine neue Datenbank an `PUBLIC`. Das ist eine Vorgabe, die für einen
-- Einzelplatz sinnvoll war und für einen Dienst falsch ist.
REVOKE ALL ON DATABASE :"dbname" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"dbname" TO :"owner_user";
GRANT CONNECT ON DATABASE :"dbname" TO :"app_user";
GRANT CONNECT ON DATABASE :"dbname" TO :"ro_user";

-- ---------------------------------------------------------------------------
-- 3. Ein eigenes Schema statt `public`
-- ---------------------------------------------------------------------------
-- **Warum.** In PostgreSQL 15+ ist `public` nicht mehr für alle beschreibbar —
-- aber es bleibt der Ort, an dem jedes Fremdwerkzeug ohne Schema-Angabe sucht.
-- Ein eigenes Schema trennt sauber: unsere Objekte in `pmh`, in `public` nichts.
-- Die Rollen bekommen den Suchpfad gesetzt (`03-defaults-as-owner.sh`), damit
-- `SELECT * FROM users` trotzdem funktioniert.
--
-- **Die Eigentümerin ist `AUTHORIZATION`.** Damit gehören ihr die Tabellen, die
-- die Migration anlegt — und nur ihr.
CREATE SCHEMA IF NOT EXISTS pmh AUTHORIZATION :"owner_user";

-- `USAGE` auf ein Schema ist die Erlaubnis, es überhaupt **zu betrachten**. Ohne
-- sie scheitert jede Abfrage, auch eine, die nur lesen will.
GRANT USAGE ON SCHEMA pmh TO :"app_user";
GRANT USAGE ON SCHEMA pmh TO :"ro_user";

-- Auf `public` hat niemand etwas zu suchen.
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 4. Rechte an dem, was JETZT existiert
-- ---------------------------------------------------------------------------
-- **Die vier Rechte der Anwendung, und was ausdrücklich fehlt:**
--
-- | Recht | Warum (nicht) |
-- |---|---|
-- | SELECT, INSERT, UPDATE, DELETE | das braucht ein Dienst |
-- | **TRUNCATE — fehlt** | es ist ein `DELETE FROM` ohne `WHERE` und **ohne Auslöser**. Ein versehentliches `TRUNCATE` löscht alles, ohne dass die Anwendung es merkt |
-- | **REFERENCES — fehlt** | braucht nur, wer Fremdschlüssel **anlegt** — also die Eigentümerin |
-- | **TRIGGER — fehlt** | wer Auslöser anlegen darf, kann die Rechteprüfung umbauen |
--
-- Diese Rechte sind der Unterschied zwischen „die Anwendung darf arbeiten" und
-- „die Anwendung darf sich selbst ermächtigen".
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pmh TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pmh TO :"app_user";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pmh TO :"app_user";
GRANT SELECT ON ALL TABLES IN SCHEMA pmh TO :"ro_user";
GRANT SELECT ON ALL SEQUENCES IN SCHEMA pmh TO :"ro_user";

-- ---------------------------------------------------------------------------
-- 5. Keine Mitgliedschaft — ausdrücklich nicht
-- ---------------------------------------------------------------------------
-- `GRANT owner_user TO app_user` wäre bequem: die Anwendung erbte alle Rechte
-- der Eigentümerin. **Das ist genau falsch.** Eine Mitgliedschaft gibt **alle**
-- Rechte — auch DDL. Die Trennung wäre damit aufgehoben, und zwar unsichtbar:
-- nirgends stünde „die Anwendung darf DROP TABLE", es ergäbe sich aus der
-- Mitgliedschaft. Deshalb: Rechte einzeln, keine Mitgliedschaft.

-- ---------------------------------------------------------------------------
-- 6. Die Prüfung, die dazugehört
-- ---------------------------------------------------------------------------
-- Eine Rechtevergabe, die niemand prüft, ist eine Absicht. Diese Ausgabe zeigt
-- beim ersten Start, was tatsächlich gesetzt wurde — damit ein Fehler auffällt,
-- **bevor** die Anwendung ihn als „permission denied" meldet.
\echo ''
\echo '=== Die vier Rollen und ihre Attribute ==='
SELECT rolname AS rolle,
       rolsuper AS superuser,
       rolcreatedb AS darf_db_anlegen,
       rolcreaterole AS darf_rollen_anlegen,
       rolcanlogin AS darf_anmelden,
       rolinherit AS erbt_rechte
  FROM pg_roles
 WHERE rolname IN (:'owner_user', :'app_user', :'ro_user', current_user)
 ORDER BY rolsuper DESC, rolname;
\echo ''
SQL

echo "  OK: Rollen, Schema und Rechte gesetzt."
echo "=== 02: fertig ==="
echo ""
