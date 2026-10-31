-- ===========================================================================
-- 0012 — Einladungen: ein Link, der ein Konto erlaubt
-- ===========================================================================
--
-- ANLASS. Bis hierher gab es zwei Wege zu einem Konto:
--
--   1. den **Claim** der Erstinbetriebnahme (erster Admin, an diesen Rechner
--      gebunden, 15 Minuten gültig), und
--   2. den **angemeldeten Admin**, der Adresse und Passwort eines anderen
--      eintippt und das Passwort weitergeben muß.
--
-- Weg 2 ist der Grund für diese Migration. Wer ein Konto anlegt, kennt danach
-- das fremde Passwort — und kann es benutzen. Das ist kein Angriff, sondern die
-- Bauart: ein Passwort, das jemand anderes eingegeben hat, ist ein geteiltes
-- Geheimnis. Der Betreiber hat es so beschrieben:
--
--   *„das der user sich selbst anmelden kann sein eigenes harness"*
--
-- Die Einladung dreht das um: der Admin erzeugt **einen Link mit Ablauf**, und
-- der Eingeladene setzt sein Passwort selbst. Der Admin sieht es nie.
--
-- ---------------------------------------------------------------------------
-- WARUM EINE EIGENE TABELLE UND NICHT `one_time_tokens`
-- ---------------------------------------------------------------------------
-- `one_time_tokens` (Migration 0001) kennt bereits `purpose = 'invite'`. Sie
-- kann eine Einladung trotzdem **nicht** halten, aus zwei unabhängigen Gründen:
--
--   a) `user_id` ist `NOT NULL` mit Fremdschlüssel auf `users`. Eine Einladung
--      entsteht aber, **bevor** es den Benutzer gibt. Man müßte einen
--      Platzhalter-Benutzer anlegen — und damit genau die Zeile, die den
--      Zustand „Konto existiert, hat aber noch kein Passwort" tragen würde.
--      Ein Benutzer, den niemand angelegt hat, ist ein Sonderfall in `users`,
--      den jede spätere Abfrage mitdenken müßte (`count()`, `zaehleAdmins()`,
--      Adressvergabe).
--   b) Die Prüfregel `one_time_tokens_purpose_known` müßte um einen Wert
--      erweitert werden, der eine **andere Lebensdauer** und einen **anderen
--      Verbraucher** hat als die drei vorhandenen Zwecke.
--
-- Eine eigene Tabelle hält den Unterschied dort, wo er hingehört: eine
-- Einladung ist kein Datensatz **über** einen Benutzer, sondern ein Versprechen
-- **auf** einen. Dieselbe Überlegung wie in `claim-store.ts`, nur mit dem
-- Unterschied, daß eine Einladung nicht an diesen Rechner gebunden ist.
--
-- ---------------------------------------------------------------------------
-- WARUM DER KLARTEXT NIE IN DIESER TABELLE STEHT
-- ---------------------------------------------------------------------------
-- Gespeichert wird **nur** der SHA-256-Hash des Tokens — dieselbe Regel wie bei
-- Sitzungen (`sessions.token_hash`) und API-Schlüsseln (`api_keys.token_hash`).
-- 32 zufällige Bytes sind nicht zu erraten; ein langsames Verfahren (Argon2id)
-- brächte hier nichts, sondern nur Zeit. Wer die Datenbank liest, hat damit
-- **kein** Token und kann sich **nicht** einladen.
--
-- ---------------------------------------------------------------------------
-- WARUM KEIN ROW LEVEL SECURITY AUF DIESER TABELLE
-- ---------------------------------------------------------------------------
-- Die Mandantentrennung (Migrationen 0004/0005) filtert Zeilen über
-- `pmh.user_id`. Diese Tabelle wird aber **vor** jeder Identität gelesen: wer
-- die Einladung einlöst, ist noch niemand. Ein RLS-Filter würde hier also
-- **jede** Einladung wegfiltern — die Seite würde „unbekannt" melden, und die
-- Ursache sähe aus wie ein abgelaufener Link.
--
-- Was stattdessen gilt: `pmh_app` darf diese Tabelle lesen und schreiben
-- (unten ausdrücklich), und die **Anwendung** entscheidet, wer eine Einladung
-- anlegen darf (Admin, Sitzung, CSRF — siehe `auth-http/einladung.ts`). Die
-- Datenbank kann diese Entscheidung nicht treffen, weil sie den Aufrufer noch
-- nicht kennt; sie kann nur dafür sorgen, daß kein Token zweimal gilt.
--
-- ===========================================================================

CREATE TABLE IF NOT EXISTS invitations (
  id           uuid PRIMARY KEY,
  -- SHA-256 des Klartext-Tokens, hexadezimal. Der Klartext existiert nur im
  -- Augenblick der Erzeugung — in der Antwort an den Admin und nirgends sonst.
  token_hash   text NOT NULL,
  -- Wer eingeladen hat. Bleibt nach dem Löschen des Admins nicht stehen: eine
  -- Einladung ohne Absender ist keine Einladung mehr, sondern ein Schlüssel.
  created_by   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Die Rolle, die das eingelöste Konto bekommt. Heute immer 'user'; die Spalte
  -- ist trotzdem benannt, damit die Entscheidung sichtbar ist und nicht im
  -- Anwendungscode versteckt.
  role         text NOT NULL DEFAULT 'user',
  -- Ein Merker für den Admin („für Anna", „Werkstatt Nord"). Kein Geheimnis,
  -- keine Adresse — die Einladung ist bewußt **nicht** an eine Adresse
  -- gebunden: sonst könnte man sie nicht weitergeben, und genau das ist ihr
  -- Zweck.
  note         text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Ablauf ist PFLICHT. Eine Einladung ohne Ende wäre ein dauerhafter
  -- Generalschlüssel in einem Chatverlauf.
  expires_at   timestamptz NOT NULL,
  -- Einlösung. Beides zusammen: `consumed_at` sagt „verbraucht", `consumed_by`
  -- sagt „von wem" — die zweite Angabe ist für die Spur, nicht für die Prüfung.
  consumed_at  timestamptz,
  consumed_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  -- Widerruf durch den Admin. Getrennt von `consumed_at`: „zurückgezogen" und
  -- „eingelöst" sind zwei verschiedene Geschichten, und eine gemeinsame Spalte
  -- könnte sie nicht auseinanderhalten.
  revoked_at   timestamptz,
  CONSTRAINT invitations_token_hash_hex CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT invitations_role_known CHECK (role IN ('user', 'admin')),
  CONSTRAINT invitations_expires_after_created CHECK (expires_at > created_at)
);

-- Der Suchschlüssel beim Einlösen: **eindeutig**, damit zwei gleiche Token nicht
-- zwei Konten ergeben. Der Hash ist der einzige Weg von einem vorgelegten Token
-- zu einer Zeile; ohne diesen Index wäre jede Einlösung ein Tabellendurchlauf.
CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_hash_key ON invitations (token_hash);

-- Die Liste, die ein Admin sieht: seine offenen Einladungen, die jüngste zuerst.
-- Der Teilindex läßt verbrauchte und zurückgezogene Zeilen draußen — sie werden
-- nur noch für die Spur gelesen, nicht für die Anzeige.
CREATE INDEX IF NOT EXISTS invitations_open_idx
  ON invitations (created_by, created_at DESC)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Die Rechte — ausdrücklich, nicht über eine Vorgabe
-- ---------------------------------------------------------------------------
-- `docker/postgres-init/defaults-as-owner.sql.in` setzt `ALTER DEFAULT
-- PRIVILEGES` für das Schema `pmh`. Migration 0009 hat aber gemessen, daß das
-- **nicht** überall greift:
--
--   insert als `pmh_app`               -> 42501 (permission denied)
--   has_schema_privilege('pmh_app',…)  -> f
--
-- Damals fehlten die Rechte auf `session_events` (Migration 8) ganz. Eine
-- Tabelle, die die Anwendung nicht schreiben darf, fällt erst beim ersten
-- Einlösen auf — also genau dann, wenn jemand vor der Tür steht. Deshalb steht
-- das Recht hier, wie in 0009.
GRANT SELECT, INSERT, UPDATE, DELETE ON invitations TO pmh_app;

-- ---------------------------------------------------------------------------
-- Die Prüfung, die dazugehört
-- ---------------------------------------------------------------------------
-- Eine Migration, die niemand nachsieht, ist eine Absicht. Diese Abfrage nennt
-- beim Lauf, was entstanden ist; sie muß `1` für die Tabelle und `1` für den
-- eindeutigen Index ergeben. Die erwarteten Zahlen stehen als **Spalte** neben
-- dem Gezählten — eine blanke Zahl hätte niemandem etwas gesagt (die Lehre aus
-- Migration 0004).
SELECT 'invitations nach 0012' AS pruefung,
       count(*) FILTER (WHERE relkind = 'r') AS tabellen,
       count(*) FILTER (WHERE relkind = 'i') AS indizes,
       1 AS erwartete_tabellen,
       2 AS erwartete_indizes
  FROM pg_class
 WHERE relnamespace = current_schema()::regnamespace
   AND relname IN ('invitations', 'invitations_token_hash_key', 'invitations_open_idx');
