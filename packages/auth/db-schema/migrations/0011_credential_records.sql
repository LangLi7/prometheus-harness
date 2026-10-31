-- ---------------------------------------------------------------------------
-- 0011 — Credential-Records (DSH-Credential-Provider gegen Postgres)
-- ---------------------------------------------------------------------------
--
-- ## Warum diese Tabelle neben `user_secrets` steht
--
-- `user_secrets` trägt **Referenzen** (`DEEPSEEK_API_KEY`) — ein Name, ein
-- Klartext, ein Umschlag. Die Credential-Seam des Harness kennt daneben
-- **Records** unter `<scope>/<id>`: ein Anbieter hält dort einen `api-key`-
-- oder `grant`-Datensatz, dessen Rumpf nur er versteht (ein Refresh-Token
-- etwa). Ein Record ist **kein** Umgebungsvariablen-Name; ihn in `ref` zu
-- pressen würde zwei Adressräume vermischen, die die Seam ausdrücklich
-- getrennt hält.
--
-- Deshalb: eigene Tabelle, dieselbe Verschlüsselung, derselbe Mandant.
--
-- ## Was hier NICHT steht
--
-- Kein Klartext, kein `key_hint` (der Rumpf ist für die Seam undurchsichtig),
-- keine RLS. `user_secrets` hat ebenfalls keine; der Provider filtert jede
-- Abfrage über `user_id`. RLS einzuschalten, ohne den Mandanten zu setzen,
-- würde die Zeilen **wegfiltern** — siehe die Begründung in Migration 0004.
--
-- ## Die Adresse
--
-- `key` ist `<scope>/<id>`: der Scope ist der registrierte Plugin-Name
-- (`llm-pi-ai`), die Id die Adresse des Besitzers (`openai`). Beide Segmente
-- sind klein geschrieben und mit Bindestrich erlaubt; die Bedingung hält
-- genau die Grammatik der Seam fest, damit ein Record nicht unter einer
-- Adresse landet, die niemand wiederfindet.

CREATE TABLE IF NOT EXISTS credential_records (
  id                 uuid PRIMARY KEY,
  user_id            uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- `<scope>/<id>` — nicht der Umgebungsvariablen-Name aus `user_secrets`.
  key                text NOT NULL,
  kind               text NOT NULL,
  payload_cipher     bytea NOT NULL,
  wrapped_key        bytea NOT NULL,
  master_key_version integer NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credential_records_key_format CHECK (key ~ '^[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$'),
  CONSTRAINT credential_records_kind_known CHECK (kind IN ('api-key', 'grant')),
  CONSTRAINT credential_records_master_version_positive CHECK (master_key_version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS credential_records_user_key_key ON credential_records (user_id, key);

-- Der Provider liest und schreibt immer je Mandant; der Index hält den Filter
-- billig und macht die Mandantengrenze zur ersten Spalte.
CREATE INDEX IF NOT EXISTS credential_records_user_idx ON credential_records (user_id);
