-- ===========================================================================
-- 0002 — Workspaces, Chats, Nachrichten
-- ===========================================================================
--
-- Der Teil, der bei Skalierung entscheidet. Zwei Sachen sind hier wichtig:
--
-- 1. GEBLAETTERT WIRD UEBER EINEN ZEIGER, NICHT UEBER OFFSET.
--    OFFSET 100000 liest hunderttausend Zeilen und wirft sie weg. Bei einem
--    langen Chat ist das der Unterschied zwischen Millisekunden und Sekunden.
--    Der Zeiger ist die Nachrichten-ID. Der Blaetterindex ist hier der
--    ZUSAMMENGESETZTE SCHLUESSEL (chat_id, id) - siehe die Begruendung bei der
--    Tabelle messages; sie beruht auf einer Messung mit EXPLAIN.
--
-- 2. DIE CHAT-LISTE FASST DIE NACHRICHTENTABELLE NICHT AN.
--    chats.last_message_id und last_message_at tragen Sortierung und Vorschau.
--    Bei hundert Chats mit je zehntausend Nachrichten ist das eine Abfrage
--    statt hundert.

-- ---------------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
  id           uuid PRIMARY KEY,
  -- Besitzer. Jeder Zugriff laeuft ueber user_id: es gibt keinen Weg zu einem
  -- Workspace ohne Benutzer.
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name         text NOT NULL,
  -- Nur ein Hinweis fuer den Benutzer. Die Rechtepruefung haengt NICHT daran.
  root_path    text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz,
  CONSTRAINT workspaces_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS workspaces_user_idx ON workspaces (user_id, updated_at DESC)
  WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- Chats
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chats (
  id               uuid PRIMARY KEY,
  -- ON DELETE CASCADE: ein geloeschter Workspace nimmt seine Chats mit. Sonst
  -- blieben Chats ohne Besitzer zurueck.
  workspace_id     uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  -- Zusaetzlich der Benutzer, damit "meine Chats" EINEN Index benutzt und nicht
  -- ueber den Workspace joinen muss.
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title            text NOT NULL DEFAULT '',
  -- Zeiger auf die letzte Nachricht: traegt Sortierung und Vorschau, ohne die
  -- Nachrichtentabelle anzufassen.
  last_message_id  text,
  last_message_at  timestamptz,
  message_count    integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CONSTRAINT chats_message_count_not_negative CHECK (message_count >= 0)
);

CREATE INDEX IF NOT EXISTS chats_user_recent_idx ON chats (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS chats_workspace_idx ON chats (workspace_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Nachrichten
-- ---------------------------------------------------------------------------
-- Die ID ist ein ULID als Text: zeitlich sortierbar UND zufaellig. Damit taugt
-- sie als Blaetterzeiger und verraet trotzdem keine laufende Nummer.
--
-- DER SCHLUESSEL IST ZUSAMMENGESETZT: (chat_id, id).
-- Das ist die Bauform, die das Blaettern traegt - und der Grund steht hier,
-- weil er gemessen wurde: mit einem Primaerschluessel auf id ALLEIN waehlt
-- PostgreSQL fuer
--     WHERE chat_id = $1 AND id < $2 ORDER BY id DESC LIMIT $3
-- den Primaerschluessel (Rueckwaerts-Scan) und nicht den zusaetzlichen Index -
-- bei 500 Nachrichten im Chat 39.25 statt 4.18 Kosteneinheiten, und mit
-- wachsendem Chat filtert er immer mehr Zeilen weg, die er nicht haben will.
-- Mit (chat_id, id) als Schluessel ist der Schluessel SELBST der Blaetterindex:
-- er kann nicht mehr umgangen werden, und ein zweiter Index waere doppelt.
--
-- VERSCHLUESSELUNG, UND WAS SIE NICHT DECKT:
-- content_cipher traegt version (1 Byte) || nonce (12 Byte) || ciphertext ||
-- tag (16 Byte) aus AES-256-GCM. role, created_at und tool_meta bleiben im
-- Klartext, weil ohne sie nicht sortiert oder gefiltert werden koennte.
-- Die METADATEN SIND ALSO NICHT GESCHUETZT. Das steht hier, damit es niemand
-- spaeter fuer eine Ende-zu-Ende-Verschluesselung haelt.
CREATE TABLE IF NOT EXISTS messages (
  chat_id        uuid NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
  id             text NOT NULL,
  role           text NOT NULL,
  content_cipher bytea,
  tool_meta      jsonb,
  input_tokens   integer,
  output_tokens  integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_pkey PRIMARY KEY (chat_id, id),
  CONSTRAINT messages_role_known CHECK (role IN ('system', 'user', 'assistant', 'tool'))
);

-- Zusaetzlich nach Zeit: fuer "alles seit gestern" und fuer den Export.
CREATE INDEX IF NOT EXISTS messages_chat_created_idx ON messages (chat_id, created_at DESC);
