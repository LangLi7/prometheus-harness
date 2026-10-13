-- =============================================================================
-- 01 — Erweiterungen
-- =============================================================================
--
-- Läuft **einmal** beim ersten Start eines leeren Datenverzeichnisses
-- (`/docker-entrypoint-initdb.d/` wird von Postgres alphabetisch ausgeführt).
--
-- **Warum die Erweiterungen hier und nicht in einer Anwendungs-Migration.**
-- Eine Erweiterung zu installieren braucht **Superuser-Rechte**. Die Anwendung
-- hat die nicht — und soll sie nicht haben. Deshalb geschieht es hier, in der
-- Einrichtung, mit dem Superuser; die Anwendung findet die Erweiterung später
-- einfach vor.
--
-- **`vector`** kommt aus dem Image `pgvector/pgvector:pg17`. Ohne diese
-- Erweiterung gibt es keine Vektorspalten — und damit kein RAG, keine
-- semantische Suche und kein Memory mit Ähnlichkeitssuche. Genau deshalb ist
-- das Image gewechselt worden.

CREATE EXTENSION IF NOT EXISTS vector;

-- `pg_trgm` findet Text auch bei Tippfehlern und Teilwörtern
-- (`Ähnlichkeit`, Trigramm-Index). Für die Suche über Chat-Titel und
-- Werkzeugnamen ist das die richtige Ergänzung zur Vektorsuche: Vektoren finden
-- **Bedeutung**, Trigramme finden **Schreibweisen**.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- `pgcrypto` liefert `gen_random_uuid()` und Digest-Funktionen für den Fall,
-- dass eine Migration oder ein Werkzeug sie braucht. Die Anwendung erzeugt ihre
-- Kennungen selbst — aber ein Fremdwerkzeug, das eine Zeile einfügt, soll das
-- auch können.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- `unaccent` entfernt Akzente bei der Suche (`café` findet `cafe`).
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------------------------------------------------------------------------
-- Was hier ausdrücklich NICHT passiert
-- ---------------------------------------------------------------------------
-- **Kein Schema.** Die Tabellen entstehen durch die **Migrationen der
-- Anwendung** (`packages/auth/db-schema`), nicht hier. Zwei Orte, die dasselbe
-- Schema anlegen, laufen irgendwann auseinander — und dann weiß niemand, welcher
-- gilt. Diese Datei richtet den **Boden** ein (Erweiterungen, Rechte); die
-- Anwendung baut darauf.
