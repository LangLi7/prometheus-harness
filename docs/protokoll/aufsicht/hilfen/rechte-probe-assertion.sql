-- =============================================================================
-- rechte-probe-assertion.sql — bereitgelegt von der AUFSICHT, NICHT angewendet
-- =============================================================================
--
-- **Warum diese Datei existiert.** `docker/rechtprobe.sql` beschreibt die richtigen Fälle, prüft sie
-- aber **nicht selbst**: es läuft mit `\set ON_ERROR_STOP off`, und neben jedem „das MUSS scheitern"
-- steht nur ein `\echo`-Kommentar. Damit sind drei Ausgänge ununterscheidbar:
--
--   1. die Anweisung scheitert **aus dem richtigen Grund** (Rechte fehlen)  → gewollt
--   2. die Anweisung scheitert **aus einem anderen Grund** (Tippfehler, fehlende Tabelle,
--      falscher Suchpfad)                                                    → Fehlalarm, gilt als „bestanden"
--   3. die Anweisung **scheitert gar nicht**                                → das ist ein **Regress**,
--      und der `\echo`-Text „ein Fehler oben ist das ERWARTETE Ergebnis" steht **trotzdem** da
--
-- Fall 3 ist der gefährliche — und bei den beiden Anweisungen `TRUNCATE users` und
-- `DROP TABLE users` ist er **selbstzerstörend**: greift das Rechtemodell nicht, dann **löscht die
-- Probe die Daten, die sie schützen soll**.
--
-- **Der bessere Weg: fragen statt versuchen.** PostgreSQL kann Rechte **beantworten**, ohne sie
-- auszuüben: `has_table_privilege()`, `has_schema_privilege()`, `has_database_privilege()`. Eine
-- Abfrage kann nichts löschen. Und weil hier eine Ausnahme geworfen wird, ist das Ergebnis
-- **maschinell auswertbar**: Exit-Code 0 = bestanden, Exit-Code 3 = durchgefallen.
--
-- Aufruf (aus dem Repository, mit dem Superuser oder der Eigentümerin — die `has_*`-Funktionen
-- beantworten Fragen über **andere** Rollen, ändern aber nichts):
--
--   docker exec -i pmh-postgres psql -U pmh_admin -d pmh -v ON_ERROR_STOP=1 < rechte-probe-assertion.sql
--
-- Erwartet: NOTICE „Rechteprobe bestanden: 10 Prüfungen", Exit-Code 0.
-- Bei einem Verstoß: `ERROR: Rechteprobe FEHLGESCHLAGEN (n): …` und Exit-Code **1** (gemessen).
-- Beide Ausgänge sind am 13.10.2026, 12:10, ausgeführt worden — auch der Fehlerfall, absichtlich.
-- =============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
  fehler text[] := ARRAY[]::text[];
BEGIN
  -- --- Schema: die Anwendung darf hineinsehen, aber nichts darin umbauen -------------
  IF NOT has_schema_privilege('pmh_app', 'pmh', 'USAGE') THEN
    fehler := fehler || 'pmh_app hat kein USAGE auf Schema pmh — sie könnte gar nicht arbeiten';
  END IF;
  IF has_schema_privilege('pmh_app', 'pmh', 'CREATE') THEN
    fehler := fehler || 'pmh_app darf im Schema pmh DDL ausführen — die Struktur ist nicht geschützt';
  END IF;

  -- --- Die vier Rechte, die die Anwendung haben SOLL ---------------------------------
  IF NOT has_table_privilege('pmh_app', 'pmh.users', 'SELECT') THEN
    fehler := fehler || 'pmh_app darf nicht lesen';
  END IF;
  IF NOT has_table_privilege('pmh_app', 'pmh.users', 'INSERT') THEN
    fehler := fehler || 'pmh_app darf nicht einfügen';
  END IF;
  IF NOT has_table_privilege('pmh_app', 'pmh.users', 'UPDATE') THEN
    fehler := fehler || 'pmh_app darf nicht ändern';
  END IF;
  IF NOT has_table_privilege('pmh_app', 'pmh.users', 'DELETE') THEN
    fehler := fehler || 'pmh_app darf nicht löschen';
  END IF;

  -- --- Die vier Rechte, die sie ausdrücklich NICHT haben darf ------------------------
  IF has_table_privilege('pmh_app', 'pmh.users', 'TRUNCATE') THEN
    fehler := fehler || 'pmh_app darf TRUNCATE — ein DELETE ohne WHERE und ohne Auslöser';
  END IF;
  IF has_table_privilege('pmh_app', 'pmh.users', 'REFERENCES') THEN
    fehler := fehler || 'pmh_app darf Fremdschlüssel anlegen — das ist DDL';
  END IF;
  IF has_table_privilege('pmh_app', 'pmh.users', 'TRIGGER') THEN
    fehler := fehler || 'pmh_app darf Auslöser anlegen — damit könnte sie die Rechteprüfung umbauen';
  END IF;

  -- --- Nur-Lesen: lesen ja, schreiben nein ------------------------------------------
  IF NOT has_table_privilege('pmh_readonly', 'pmh.users', 'SELECT') THEN
    fehler := fehler || 'pmh_readonly darf nicht lesen';
  END IF;
  IF has_table_privilege('pmh_readonly', 'pmh.users', 'INSERT') THEN
    fehler := fehler || 'pmh_readonly darf schreiben';
  END IF;

  IF array_length(fehler, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Rechteprobe FEHLGESCHLAGEN (%): %', array_length(fehler, 1), array_to_string(fehler, ' | ');
  END IF;
  RAISE NOTICE 'Rechteprobe bestanden: 10 Prüfungen.';
END $$;

-- =============================================================================
-- Der Fall, den die bisherige Probe GAR NICHT ausführt: greifen die VORGABEN für NEUE Objekte?
-- =============================================================================
--
-- Das ist der subtilste Teil des Modells: `ALTER DEFAULT PRIVILEGES` gilt nur für Objekte, die
-- **die Rolle anlegt, die es gesetzt hat**. Steht es bei der falschen Rolle, ist es wirkungslos —
-- und niemand merkt es, bis eine neue Tabelle in Produktion „permission denied" liefert.
--
-- Deshalb wird hier eine Tabelle **nach** der Einrichtung angelegt, geprüft und **zurückgenommen**.
-- Die Prüfung ändert damit nichts, beweist aber den Mechanismus. Gemessen am 13.10.2026, 12:09:
-- app SELECT = t, app INSERT = t, readonly SELECT = t, readonly INSERT = f — wie beabsichtigt.
--
-- Als **Eigentümerin** ausführen (nur sie kann in ihrem Schema anlegen):
--
--   docker exec -e PGPASSWORD=bitte-aendern-owner pmh-postgres psql -U pmh_owner -h 127.0.0.1 -d pmh -v ON_ERROR_STOP=1 -c "
--     BEGIN;
--     CREATE TABLE pmh.vorgabe_probe (x int);
--     DO \$\$
--     BEGIN
--       IF NOT has_table_privilege('pmh_app', 'pmh.vorgabe_probe', 'SELECT') THEN
--         RAISE EXCEPTION 'Vorgabe greift NICHT: pmh_app darf eine neue Tabelle nicht lesen';
--       END IF;
--       IF has_table_privilege('pmh_readonly', 'pmh.vorgabe_probe', 'INSERT') THEN
--         RAISE EXCEPTION 'Vorgabe zu weit: pmh_readonly darf in eine neue Tabelle schreiben';
--       END IF;
--       RAISE NOTICE 'Vorgaben greifen für neue Objekte.';
--     END \$\$;
--     ROLLBACK;"
--
-- =============================================================================
