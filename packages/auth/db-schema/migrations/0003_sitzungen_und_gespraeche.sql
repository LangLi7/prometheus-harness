-- ===========================================================================
-- 0003 — Anmeldesitzungen umbenannt, Gespraechssitzungen angelegt
-- ===========================================================================
--
-- ANLASS: Ein Namenskonflikt, der beim Abgleich mit dem Kern auffiel
-- (docs/review/datenbank-abgleich.md).
--
-- Der Kern des DeepSeek Harness nennt GESPRAECHE `sessions` (in seiner
-- abgeleiteten Suche: `persisted_sessions`; im JSONL: `SessionHeader`). Unsere
-- Tabelle `sessions` enthielt aber ANMELDUNGEN: token_hash, csrf_hash,
-- idle_expires_at, revoked_at. Zwei verschiedene Dinge unter einem Namen - und
-- fuer die Bedeutung des Kerns hatten wir GAR KEINE Tabelle.
--
-- Wer beide Dokumentationen liest, verwechselt sie. Und beim Anschliessen der
-- Kette (Adapter -> Agent-Loop -> Sitzung) braucht der Kern eine dauerhafte
-- Ablage, die es nicht gab.
--
-- WAS DIESE MIGRATION TUT:
--   1. `sessions`  ->  `auth_sessions`   (der Name gehoert dem Kern)
--   2. `conversation_sessions` anlegen, mit den Feldern des SessionHeader
--
-- WAS SIE NICHT TUT: den Suchindex des Kerns nach PostgreSQL uebersetzen.
-- Der Kern baut ihn aus dem JSONL-Ereignisstrom neu und setzt ihn bei einer
-- inkompatiblen Fassung zurueck (`dsh-session-query-sqlite`: "disposable session
-- full-text read model"). Ihn zu duplizieren schuefe zwei Wahrheiten, die
-- auseinandergehen. PostgreSQL hat eigene Mittel - `tsvector` und `pg_trgm`
-- liegen bereits im Stapel.
--
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Anmeldesitzungen umbenennen
-- ---------------------------------------------------------------------------
-- **Warum umbenennen und nicht neu anlegen.** Ein Neuanlegen hiesse: Daten
-- wegwerfen. Alle laufenden Anmeldungen waeren ungueltig, und niemand koennte
-- sagen, warum. `ALTER TABLE ... RENAME TO` behaelt die Daten, die Indizes und
-- die Fremdschluessel - nur der Name aendert sich.
--
-- **Warum die Bedingungen mit umbenannt werden.** PostgreSQL benennt
-- Bedingungen und Indizes beim Umbenennen der Tabelle NICHT mit. Sie hiessen
-- danach `sessions_token_hash_hex` auf einer Tabelle `auth_sessions` - genau die
-- Sorte halb umgestellter Name, die den naechsten Leser in die Irre fuehrt.
ALTER TABLE IF EXISTS sessions RENAME TO auth_sessions;

ALTER TABLE IF EXISTS auth_sessions RENAME CONSTRAINT sessions_token_hash_hex TO auth_sessions_token_hash_hex;
ALTER TABLE IF EXISTS auth_sessions RENAME CONSTRAINT sessions_csrf_hash_hex TO auth_sessions_csrf_hash_hex;
ALTER TABLE IF EXISTS auth_sessions RENAME CONSTRAINT sessions_absolute_after_idle TO auth_sessions_absolute_after_idle;

ALTER INDEX IF EXISTS sessions_token_hash_key RENAME TO auth_sessions_token_hash_key;
ALTER INDEX IF EXISTS sessions_user_active_idx RENAME TO auth_sessions_user_active_idx;

COMMENT ON TABLE auth_sessions IS
  'Anmeldesitzungen des Browsers: Token-Hash, CSRF-Paar, Fristen, Widerruf. NICHT zu verwechseln mit conversation_sessions - das sind Gespraeche des Agenten.';

-- ---------------------------------------------------------------------------
-- 2. Gespraechssitzungen — die Felder des Kerns, in PostgreSQL
-- ---------------------------------------------------------------------------
-- **Die Felder stammen aus `SessionHeader`** (@deepseek-ai/dsh-session) und aus
-- `persisted_sessions` der abgeleiteten Suche des Kerns. Sie sind hier
-- absichtlich mit denselben Begriffen benannt (in Kleinschreibung mit
-- Unterstrich, wie es in SQL ueblich ist), damit ein Leser beide Seiten
-- nebeneinander legen kann:
--
--   SessionHeader        | hier                  | Bedeutung
--   ---------------------|-----------------------|--------------------------------
--   id                   | id                    | Kennung des Kerns
--   version              | version               | SESSION_FORMAT_VERSION
--   createdAt            | created_at            | Unix-Epoch-MILLISEKUNDEN dort
--   cwd                  | cwd                   | absolutes Arbeitsverzeichnis
--   parentSession        | parent_session        | Saat-Linie (woraus hervorgegangen)
--   isSeeded             | is_seeded             | geerbter Ereignispraefix
--   origin               | origin                | 'subagent' oder NULL
--   delegationDepth      | delegation_depth      | Tiefe; DAUERHAFT (siehe unten)
--   agentPreset          | agent_preset          | Zusammensetzung des Agenten
--   (Suche) revision     | revision              | Aenderungsmarke
--
-- **Warum `id` als text und NICHT als uuid.** Das Kennungsformat gehoert dem
-- Kern. Es als UUID zu erzwingen waere eine Annahme ueber fremde Daten - und
-- eine, die beim ersten abweichenden Format bricht. Eine Kennung wird
-- gespeichert, wie sie kommt.
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id                text PRIMARY KEY,

  -- Die Formatfassung des Kerns. Gespeichert, damit eine spaetere Fassung
  -- erkennen kann, welche Ereignisse sie vor sich hat, ohne die Datei zu lesen.
  version           integer NOT NULL,

  -- **Warum timestamptz und nicht bigint wie beim Kern.** Der Kern fuehrt
  -- Epoch-MILLISEKUNDEN als Zahl. In PostgreSQL ist `timestamptz` der richtige
  -- Typ: er traegt die Zeitzone, rechnet richtig und laesst sich vergleichen.
  -- Die Umrechnung geschieht beim Schreiben, nicht bei jeder Abfrage.
  created_at        timestamptz NOT NULL,

  -- Absolutes Arbeitsverzeichnis. **Der Kern hat hier einen PFAD, keinen
  -- Verweis** - ein Arbeitsbereich ist bei ihm kein Datensatz. Wir fuehren
  -- zusaetzlich workspace_id (siehe unten), aber `cwd` bleibt, weil es die
  -- Angabe des Kerns ist und sich von unserem Verweis unterscheiden kann.
  cwd               text,

  -- Die Sitzung, aus der diese hervorging (Saat-Linie). Selbstbezug mit
  -- ON DELETE SET NULL: wird die Mutter geloescht, bleibt die Tochter lesbar -
  -- sie verliert nur den Verweis. Ein CASCADE wuerde eine ganze Kette von
  -- Sitzungen mitreissen, und das waere bei einem versehentlichen Loeschen
  -- nicht rueckgaengig zu machen.
  parent_session    text REFERENCES conversation_sessions (id) ON DELETE SET NULL,

  is_seeded         boolean NOT NULL DEFAULT false,

  -- Grobe Produktklassifikation. Der Kern kennt genau einen Wert: 'subagent'.
  -- Als CHECK und nicht als ENUM: ein ENUM liesse sich spaeter nur muehsam
  -- erweitern, und weitere Werte sind zu erwarten.
  origin            text,

  -- **Warum die Tiefe DAUERHAFT ist - der Kern begruendet es selbst.**
  -- Wortlaut: "Persisted so a recursion budget survives restart and resume - a
  -- runtime-only depth would reset a resumed child to top-level." Wer die Tiefe
  -- nur zur Laufzeit fuehrt, gibt einem fortgesetzten Kind nach einem Neustart
  -- das volle Rekursionsbudget zurueck.
  delegation_depth  integer,

  agent_preset      text,

  -- Aenderungsmarke des Kerns. Sie aendert sich bei jedem Schreiben und dient
  -- als billige Frage "hat sich etwas geaendert, ohne alles zu lesen".
  revision          text NOT NULL,

  -- ---------------------------------------------------------------------------
  -- Unsere Zusaetze — ausdruecklich getrennt, weil der Kern sie NICHT kennt
  -- ---------------------------------------------------------------------------
  -- **Warum sie hier stehen und trotzdem getrennt sind.** Der Kern fuehrt an
  -- einer Sitzung KEINEN Benutzer: Mandantentrennung ist bei ihm keine
  -- Datenbankfrage. Wir brauchen sie - aber sie als "Teil der Kernstruktur"
  -- auszugeben waere eine Behauptung, die nicht stimmt. Wer den Abgleich liest,
  -- soll sehen, wo die Grenze verlaeuft.
  user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  workspace_id      uuid REFERENCES workspaces (id) ON DELETE SET NULL,

  CONSTRAINT conversation_sessions_origin_known CHECK (origin IS NULL OR origin = 'subagent'),
  CONSTRAINT conversation_sessions_depth_nonneg CHECK (delegation_depth IS NULL OR delegation_depth >= 0)
);

-- Die Liste der Sitzungen eines Benutzers, neueste zuerst. Das ist die Abfrage
-- hinter "meine Gespraeche" - und sie darf nicht die Ereignisse anfassen.
CREATE INDEX IF NOT EXISTS conversation_sessions_user_recent_idx
  ON conversation_sessions (user_id, created_at DESC);

-- Die Kinder einer Sitzung. Fuer die Frage "welche Unteragenten liefen hier".
CREATE INDEX IF NOT EXISTS conversation_sessions_parent_idx
  ON conversation_sessions (parent_session)
  WHERE parent_session IS NOT NULL;

-- Der Arbeitsbereich, sofern zugeordnet.
CREATE INDEX IF NOT EXISTS conversation_sessions_workspace_idx
  ON conversation_sessions (workspace_id)
  WHERE workspace_id IS NOT NULL;

COMMENT ON TABLE conversation_sessions IS
  'Gespraeche des Agenten. Die Felder spiegeln SessionHeader des Kerns; user_id und workspace_id sind unsere Zusaetze. Die Ereignisse selbst liegen im JSONL-Strom - hier steht nur der Kopf.';

COMMENT ON COLUMN conversation_sessions.revision IS
  'Aenderungsmarke des Kerns: aendert sich bei jedem Schreiben. Billiger als alle Ereignisse zu lesen.';

-- ---------------------------------------------------------------------------
-- 3. Die Pruefung, die dazugehoert
-- ---------------------------------------------------------------------------
-- Eine Umbenennung, die niemand nachsieht, ist eine Absicht. Diese Abfragen
-- zeigen beim Lauf, was tatsaechlich dasteht - damit ein Fehler auffaellt, bevor
-- die Anwendung ihn als "Tabelle gibt es nicht" meldet.
--
-- **Warum `SELECT` und NICHT `\echo`.** Der erste Versuch benutzte `\echo` wie
-- die Init-Skripte unter `docker/postgres-init/`. Der Migrationslauf brach ab:
--
--     FEHLER bei den Migrationen: Migration 3 ... ist gescheitert:
--     syntax error at or near "\"
--
-- **Die Ursache:** `\echo` ist ein **psql**-Metabefehl, kein SQL. Die Init-Skripte
-- laufen unter `psql` und verstehen ihn; der Migrationslauf schickt seinen Text
-- ueber den `postgres`-Treiber an den **Server**, und der kennt kein `\`.
--
-- **Die Regel, die daraus folgt:** eine Migrationsdatei enthaelt **nur SQL**.
-- Keine `\`-Befehle, gleichgültig was die Init-Skripte tun. Eine `SELECT`-Abfrage
-- tut hier dasselbe und ist ueberall gueltig.
SELECT 'tabellen nach 0003' AS pruefung, tablename AS name
  FROM pg_tables
 WHERE schemaname = current_schema()
   AND tablename IN ('auth_sessions', 'conversation_sessions', 'sessions')
 ORDER BY tablename;

