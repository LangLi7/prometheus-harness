-- ===========================================================================
-- 0001 — Identität: Benutzer, Sitzungen, API-Schlüssel
-- ===========================================================================
--
-- Diese Datei ist SQL und sonst nichts. Sie wird mit einer Prüfsumme
-- festgehalten: ist sie einmal angewandt, wird sie NIE geändert. Eine neue
-- Regel kommt als neue Datei hinten dazu.

-- ---------------------------------------------------------------------------
-- Benutzer
-- ---------------------------------------------------------------------------
-- Die Adresse wird in der Schreibweise gespeichert, die der Benutzer eingetragen
-- hat; die Eindeutigkeit gilt für die normalisierte Form (Index unten).
-- Ohne das entstehen zwei Konten für einen Menschen, und die Anmeldung schlägt
-- "manchmal" fehl.
CREATE TABLE IF NOT EXISTS users (
  -- UUID, von der Anwendung erzeugt. Kein serial: eine fortlaufende Zahl verrät
  -- die Zahl der Benutzer und lädt zum Durchprobieren ein.
  id              uuid PRIMARY KEY,
  email           text NOT NULL,
  -- Der Passwort-Hash im PHC-Format, also mit Verfahren und Parametern im Wert
  -- selbst (argon2id, Version, Speicher, Iterationen, Parallelitaet).
  -- NULL heisst: dieser Benutzer hat noch kein Passwort gesetzt. Ein NULL-Hash
  -- darf NIE zu einer erfolgreichen Passwortanmeldung fuehren - die Pruefung
  -- steht in der Anwendung, nicht hier.
  password_hash   text,
  display_name    text NOT NULL DEFAULT '',
  -- Rolle. Absichtlich Text mit Pruefregel statt ENUM: ein ENUM laesst sich nur
  -- mit Muehe erweitern, eine Pruefregel ist eine Zeile.
  role            text NOT NULL DEFAULT 'user',
  -- Sperre. NULL heisst aktiv.
  disabled_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_role_known CHECK (role IN ('user', 'admin')),
  CONSTRAINT users_email_not_blank CHECK (length(btrim(email)) > 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));

-- ---------------------------------------------------------------------------
-- Sitzungen
-- ---------------------------------------------------------------------------
-- Gespeichert wird NICHT das Sitzungstoken, sondern sein SHA-256-Hash. Wer die
-- Datenbank liest, kann sich damit nicht anmelden - dieselbe Regel wie bei
-- Passwoertern. Ein einfacher Hash genuegt hier: das Token sind 32 zufaellige
-- Bytes, es gibt nichts zu erraten.
--
-- Zwei Fristen: idle_expires_at wird bei Aktivitaet nach vorn geschoben,
-- absolute_expires_at NIE. Ohne die zweite Frist lebt eine gestohlene Sitzung
-- unbegrenzt, solange sie benutzt wird.
CREATE TABLE IF NOT EXISTS sessions (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash          text NOT NULL,
  -- Der CSRF-Wert gehoert zur Sitzung: ein Token ohne CSRF-Paar ist unbrauchbar.
  csrf_hash           text NOT NULL,
  -- Nur fuer die Anzeige "wo bin ich angemeldet". Kein Sicherheitsmerkmal.
  user_agent          text NOT NULL DEFAULT '',
  ip_first_seen       inet,
  idle_expires_at     timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  -- Widerruf: gesetzt heisst sofort ungueltig, unabhaengig von den Fristen.
  revoked_at          timestamptz,
  revoked_reason      text,
  CONSTRAINT sessions_token_hash_hex CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT sessions_csrf_hash_hex CHECK (csrf_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT sessions_absolute_after_idle CHECK (absolute_expires_at >= idle_expires_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_key ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_user_active_idx ON sessions (user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- API-Schluessel
-- ---------------------------------------------------------------------------
-- Der Schluessel wird NIE gespeichert, nur sein SHA-256-Hash. Ein Datenbankleck
-- ist damit kein Schluesselverlust. Was bleibt, ist die oeffentliche Kennung
-- (key_id) zum Nachschlagen und das Praefix fuer die Anzeige.
--
-- Ausgegebenes Format: pmh_<key_id>_<secret>
--   key_id 12 Zeichen base64url - der Suchschluessel
--   secret 32 zufaellige Bytes base64url - das Geheimnis
-- Der Hash wird ueber das GANZE Token gebildet, nicht nur ueber das Geheimnis:
-- so ist auch die Kennung faelschungssicher.
CREATE TABLE IF NOT EXISTS api_keys (
  id              uuid PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key_id          text NOT NULL,
  token_hash      text NOT NULL,
  -- Nur zur Anzeige: pmh_ab12cd34 - nie das Geheimnis.
  display_prefix  text NOT NULL,
  name            text NOT NULL DEFAULT '',
  scopes          text[] NOT NULL DEFAULT ARRAY['chat']::text[],
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Ablauf ist PFLICHT, nicht optional: ein Schluessel ohne Ende wird nie
  -- rotiert.
  expires_at      timestamptz NOT NULL,
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  revoked_reason  text,
  CONSTRAINT api_keys_token_hash_hex CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT api_keys_key_id_shape CHECK (key_id ~ '^[A-Za-z0-9_-]{12}$'),
  CONSTRAINT api_keys_expires_after_created CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_id_key ON api_keys (key_id);
CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_keys_live_idx ON api_keys (key_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Einmal-Token (E-Mail-Bestaetigung, Passwort-Reset, Einladung)
-- ---------------------------------------------------------------------------
-- Warum in der Datenbank und nicht in Redis: ein Reset-Token, das einen
-- Redis-Ausfall ueberlebt, weil es "sicherheitshalber" laenger gilt, ist ein
-- Sicherheitsproblem. Diese Token sind selten und klein - sie gehoeren dauerhaft
-- gespeichert, mit kurzer Frist und Einmal-Verbrauch.
CREATE TABLE IF NOT EXISTS one_time_tokens (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose      text NOT NULL,
  token_hash   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  CONSTRAINT one_time_tokens_purpose_known CHECK (purpose IN ('email-verify', 'password-reset', 'invite')),
  CONSTRAINT one_time_tokens_hash_hex CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS one_time_tokens_hash_key ON one_time_tokens (token_hash);
CREATE INDEX IF NOT EXISTS one_time_tokens_user_idx ON one_time_tokens (user_id, purpose, created_at DESC);

-- ---------------------------------------------------------------------------
-- Zugaenge Dritter (Anbieter-Schluessel des Benutzers, verschluesselt)
-- ---------------------------------------------------------------------------
-- Umschlagverschluesselung: der Nutzinhalt ist mit einem DATENSCHLUESSEL
-- verschluesselt, der Datenschluessel liegt verschluesselt mit dem
-- HAUPTSCHLUESSEL daneben. Zwei Stufen, damit der Hauptschluessel gewechselt
-- werden kann, ohne jede Zeile neu zu schreiben.
CREATE TABLE IF NOT EXISTS user_secrets (
  id                 uuid PRIMARY KEY,
  user_id            uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Name des Geheimnisses, z. B. DEEPSEEK_API_KEY - dieselbe Schreibweise wie
  -- die Umgebungsvariable, damit ein Umstieg ohne Umbenennung moeglich ist.
  ref                text NOT NULL,
  value_cipher       bytea NOT NULL,
  wrapped_key        bytea NOT NULL,
  -- Welche Hauptschluessel-Fassung diesen Umschlag geoeffnet hat. Ohne diese
  -- Angabe ist eine Rotation nicht durchfuehrbar: niemand weiss, welcher gilt.
  master_key_version integer NOT NULL,
  -- Nicht zum Entschluesseln noetig, aber die Rotation braucht den Klartext
  -- einmal - und ihn dann zu erzeugen ist besser, als ihn zu speichern.
  key_hint           text NOT NULL DEFAULT '',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_secrets_ref_not_blank CHECK (length(btrim(ref)) > 0),
  CONSTRAINT user_secrets_master_version_positive CHECK (master_key_version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_secrets_user_ref_key ON user_secrets (user_id, ref);

-- ---------------------------------------------------------------------------
-- Pruefspur fuer Sicherheitsereignisse
-- ---------------------------------------------------------------------------
-- Anmeldung, Fehlversuch, Schluessel erzeugt/widerrufen, Sitzung widerrufen.
-- OHNE Klartext-Geheimnisse und OHNE Nachrichteninhalte. Diese Tabelle
-- beantwortet "was ist passiert", nicht "was stand drin".
CREATE TABLE IF NOT EXISTS auth_events (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  kind        text NOT NULL,
  -- Die Adresse wird mitgeschrieben: bei einem Fehlversuch ist sie der
  -- wichtigste Hinweis. Sie liegt schon in users, ist also kein neues Geheimnis.
  email       text,
  ip          inet,
  user_agent  text NOT NULL DEFAULT '',
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_events_created_idx ON auth_events (created_at DESC);
CREATE INDEX IF NOT EXISTS auth_events_user_idx ON auth_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_events_kind_idx ON auth_events (kind, created_at DESC);
