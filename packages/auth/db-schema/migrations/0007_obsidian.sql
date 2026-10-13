-- 0007_obsidian.sql — D2: der Vault, die Notizen, die Etiketten und die Verweise.
--
-- ===========================================================================
-- DIESE MIGRATION ENTSCHEIDET NICHT, WER „GEWINNT" — SIE MACHT ES ENTSCHEIDBAR
-- ===========================================================================
--
-- `docs/decisions/obsidian-gedaechtnis-oder-ansicht.md` stellt die Frage, die vor
-- dem Schema fällt: **ist der Vault das Gedächtnis (A) oder eine Ansicht (B)?**
--
-- Diese Migration ist so gebaut, daß sie **beide** Richtungen trägt:
--
--   * **`vaults`** braucht **jede** Richtung. Bei A ist sie die **einzige**
--     Tabelle (der Pfad ist die Speicherung), bei B die Registrierung, welcher
--     Pfad zu welchem Benutzer gehört.
--   * **`notes`** trägt `content_hash` und `mtime` — die zwei Angaben, die ein
--     **Abgleich** braucht, egal in welche Richtung er läuft. Wer „gewinnt",
--     entscheidet der Abgleich, nicht die Spalte.
--   * **`links`** speichert den **rohen** Verweistext (`[[Ziel]]`) **und** das
--     aufgelöste Ziel. Der rohe Text steht auch dann da, wenn das Ziel fehlt —
--     in Obsidian ist ein Verweis auf eine noch nicht geschriebene Notiz völlig
--     normal.
--
-- **Und ein eigener Fehler, der hier beinahe gestanden hätte.** In der ersten
-- Fassung begann eine Zeile dieses Blocks mit `;` statt mit `--`. Damit stand
-- dort **SQL-Code** statt eines Kommentars: `;` beendet eine Anweisung, und das
-- darauffolgende `*` ist ein Syntaxfehler. Die Migration wäre nicht durchgelaufen
-- — und die Ursache hätte wie ein Fehler in einer Anweisung ausgesehen, die
-- zwanzig Zeilen weiter unten steht.
--
-- **Was hier NICHT steht und bewußt fehlt:** die Regel, **welcher** Benutzer
-- **welchen** Pfad bekommt. Das ist keine technische Frage — sie ist dieselbe wie
-- bei `user_profiles`: ein Administrator legt sie fest, oder der Benutzer zeigt
-- auf sein eigenes Verzeichnis. Ohne diese Regel darf kein **Einleser** gebaut
-- werden; das Schema selbst kann sie offenlassen, weil `vaults.pfad` einfach
-- gefüllt wird — von wem auch immer.
--
-- ===========================================================================
-- DER MANDANT STEHT ÜBERALL, WIE IN 0006
-- ===========================================================================
--
-- Jede der fünf Tabellen trägt `user_id NOT NULL`, und **jeder** Verweis ist ein
-- **zusammengesetzter** Fremdschlüssel über `(…, user_id)`. Eine Notiz von
-- Mandant B kann strukturell nicht in einem Vault von Mandant A liegen.
--
-- **Und dieselbe Grenze wie dort, ausdrücklich:** Fremdschlüssel verhindern
-- Übergriffe beim **Schreiben**. Beim **Lesen** verhindert er nichts — dort zählt
-- die `WHERE`-Klausel.

-- ---------------------------------------------------------------------------
-- 1. vaults — wo die Notizen eines Benutzers liegen
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vaults (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Das Verzeichnis auf der Platte. **Der Pfad ist eine Angabe des Betreibers
  -- oder des Benutzers** — woher genau, entscheidet die offene Regel oben.
  pfad          text NOT NULL,
  name          text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Wann zuletzt nach Änderungen gesehen wurde — für den Abgleich.
  zuletzt_gesehen_am timestamptz,
  CONSTRAINT vaults_id_user_key UNIQUE (id, user_id),
  -- **Ein Pfad gehört einem Benutzer nur einmal.** Zweimal derselbe Vault wäre
  -- zweimal dieselben Notizen — und der Abgleich wüßte nicht, welche Zeile gilt.
  CONSTRAINT vaults_user_pfad_key UNIQUE (user_id, pfad),
  CONSTRAINT vaults_pfad_nicht_leer CHECK (pfad <> ''),
  -- **Kein Aufstieg aus dem Verzeichnis.** `..` in einem Vault-Pfad ist kein
  -- Pfad, sondern ein Ausbruchsversuch; er wird hier abgewiesen und nicht erst
  -- bei der Prüfung im Anwendungscode.
  CONSTRAINT vaults_pfad_ohne_aufstieg CHECK (position('..' in pfad) = 0),
  CONSTRAINT vaults_pfad_absolut CHECK (pfad ~ '^([A-Za-z]:[\\/]|/)')
);

CREATE INDEX IF NOT EXISTS vaults_user_idx ON vaults (user_id);

-- ---------------------------------------------------------------------------
-- 2. notes — eine Notiz je Datei
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  vault_id      uuid NOT NULL,
  -- **Relativ zum Vault.** Ein absoluter Pfad je Notiz wäre die zweite Kopie
  -- derselben Angabe — und beim Verschieben des Vaults wäre jede Zeile falsch.
  pfad          text NOT NULL,
  titel         text NOT NULL DEFAULT '',
  -- Für den **Abgleich**: derselbe Inhalt soll nicht zweimal eingelesen werden,
  -- und eine Änderung soll auffallen. Beides ohne die Datei zu öffnen.
  content_hash  text,
  -- Die Änderungszeit der **Datei** (nicht unsere). Sie kommt aus dem
  -- Dateisystem und ist die einzige Angabe, die eine Änderung **außerhalb**
  -- unserer Zugriffe verrät.
  mtime         timestamptz,
  bytes         integer,
  -- Wann **wir** zuletzt eingelesen haben. `mtime > gelesen_am` heißt: seitdem
  -- geändert.
  gelesen_am    timestamptz,
  -- **Der Zeiger in den Wissensspeicher (0006).** Die Notiz **verweist** auf ein
  -- Dokument — nicht umgekehrt: der Text und seine Vektoren liegen an **einer**
  -- Stelle, und das ist `chunks`.
  document_id   uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notes_id_user_key UNIQUE (id, user_id),
  -- Dieselbe Datei zweimal im selben Vault ist ein Fehler des Einlesers, kein
  -- gültiger Zustand — und der Schlüssel macht das Einlesen **wiederholbar**.
  CONSTRAINT notes_vault_pfad_key UNIQUE (vault_id, pfad),
  CONSTRAINT notes_document_user_fkey FOREIGN KEY (document_id, user_id)
    REFERENCES documents (id, user_id) ON DELETE SET NULL (document_id),
  CONSTRAINT notes_vault_user_fkey FOREIGN KEY (vault_id, user_id)
    REFERENCES vaults (id, user_id) ON DELETE CASCADE,
  CONSTRAINT notes_pfad_nicht_leer CHECK (pfad <> ''),
  CONSTRAINT notes_hash_shape CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT notes_bytes_nicht_negativ CHECK (bytes IS NULL OR bytes >= 0)
);

CREATE INDEX IF NOT EXISTS notes_vault_idx ON notes (vault_id, pfad);
CREATE INDEX IF NOT EXISTS notes_user_idx ON notes (user_id);
-- **Die Abgleichabfrage.** „Welche Notizen haben sich seit dem letzten Einlesen
-- geändert?" ist die häufigste Frage an diese Tabelle.
CREATE INDEX IF NOT EXISTS notes_abgleich_idx ON notes (user_id, mtime DESC) WHERE mtime IS NOT NULL;
CREATE INDEX IF NOT EXISTS notes_ohne_dokument_idx ON notes (user_id) WHERE document_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3. tags und note_tags — Etiketten
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tags_id_user_key UNIQUE (id, user_id),
  -- Ein Etikett gehört einem Benutzer **einmal**. Zwei Zeilen `projekt` wären
  -- zwei Etiketten mit demselben Namen — und keine Abfrage wüßte, welche.
  CONSTRAINT tags_user_name_key UNIQUE (user_id, name),
  CONSTRAINT tags_name_nicht_leer CHECK (name <> '')
);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id uuid NOT NULL,
  tag_id  uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT note_tags_pkey PRIMARY KEY (note_id, tag_id),
  CONSTRAINT note_tags_note_user_fkey FOREIGN KEY (note_id, user_id)
    REFERENCES notes (id, user_id) ON DELETE CASCADE,
  CONSTRAINT note_tags_tag_user_fkey FOREIGN KEY (tag_id, user_id)
    REFERENCES tags (id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS note_tags_tag_idx ON note_tags (tag_id);

-- ---------------------------------------------------------------------------
-- 4. links — die Verweise, roh UND aufgelöst
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS links (
  von_note_id  uuid NOT NULL,
  -- **Der rohe Verweistext**, wie er in der Datei steht: `[[Ziel]]` → `Ziel`.
  -- Er bleibt erhalten, auch wenn das Ziel (noch) nicht existiert — in Obsidian
  -- ist ein Verweis auf eine ungeschriebene Notiz völlig normal.
  ziel_text    text NOT NULL,
  -- **Das aufgelöste Ziel**, wenn es die Notiz gibt. `NULL` heißt ausdrücklich
  -- „noch nicht geschrieben" und nicht „Verweis kaputt".
  ziel_note_id uuid,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT links_pkey PRIMARY KEY (von_note_id, ziel_text),
  CONSTRAINT links_von_note_user_fkey FOREIGN KEY (von_note_id, user_id)
    REFERENCES notes (id, user_id) ON DELETE CASCADE,
  -- **Die Spaltenliste ist Pflicht.** Ohne sie leerte PostgreSQL auch `user_id`,
  -- und die ist `NOT NULL` — der Fallstrick aus Migration 0004, dort gemessen.
  CONSTRAINT links_ziel_note_user_fkey FOREIGN KEY (ziel_note_id, user_id)
    REFERENCES notes (id, user_id) ON DELETE SET NULL (ziel_note_id),
  CONSTRAINT links_ziel_text_nicht_leer CHECK (ziel_text <> '')
);

CREATE INDEX IF NOT EXISTS links_ziel_idx ON links (ziel_note_id) WHERE ziel_note_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS links_user_idx ON links (user_id);

-- ---------------------------------------------------------------------------
-- 5. Prüfung am Ende der Migration
-- ---------------------------------------------------------------------------
-- Dieselbe Bauform wie in 0005 und 0006: die Migration sagt selbst, was sie
-- erwartet. **`contype = 'f'`** — sonst zählen CHECK- und UNIQUE-Bedingungen mit
-- mehrere Spalten mit, und der Name der Abfrage stimmt nicht mehr (der Fehler aus
-- 0006, dort behoben und begründet).
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'pmh'
      AND table_name IN ('vaults', 'notes', 'tags', 'note_tags', 'links')) AS tabellen_erwartet_5,
  (SELECT count(*) FROM pg_constraint
    WHERE connamespace = 'pmh'::regnamespace
      AND contype = 'f'
      AND array_length(conkey, 1) > 1
      AND conrelid IN ('pmh.vaults'::regclass, 'pmh.notes'::regclass, 'pmh.tags'::regclass,
                       'pmh.note_tags'::regclass, 'pmh.links'::regclass))
    AS zusammengesetzte_fremdschluessel_erwartet_6;
