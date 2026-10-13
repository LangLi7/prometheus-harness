-- ===========================================================================
-- 0005 — Benutzerprofile: die Isolation je Benutzer, dauerhaft
-- ===========================================================================
--
-- ANLASS: `packages/auth/permissions` kennt `Isolation` — fünf Felder, die
-- festlegen, was ein Benutzer darf. Bis heute wurde dieser Wert bei **jeder
-- Anfrage neu abgeleitet** (`vorgabeProfil(home)` bzw. `adminProfil([home])`)
-- und nirgends gespeichert. Es gab also **keine** Möglichkeit, einem Benutzer
-- ein eigenes Profil zu geben; jeder mit der Rolle `user` bekam dasselbe.
--
-- ---------------------------------------------------------------------------
-- DIE ABBILDUNG AUF `SandboxPolicy` — sie ist 1:1 und gemessen
-- ---------------------------------------------------------------------------
-- Der Rust-Dienst `services/pmh-sandbox` hat den Typ `SandboxPolicy`
-- (`src/lib.rs`, Zeile 99), und `Isolation` sagt über sich selbst: "Sie sind
-- genau die Felder von `SandboxPolicy`". Die Gegenüberstellung:
--
--   Isolation (TS)   | SandboxPolicy (Rust) | hier (SQL)       | Werte
--   -----------------|----------------------|------------------|------------------
--   dateizugriff     | file_access          | dateizugriff     | none|read-only|read-write
--   lesewurzeln      | read_roots           | lesewurzeln      | text[]
--   schreibwurzeln   | write_roots          | schreibwurzeln   | text[]
--   netz             | network              | netz             | boolean
--   prozesse         | spawn                | prozesse         | boolean
--
-- **Die drei Werte von `dateizugriff` sind WOERTLICH die, die der Dienst
-- annimmt.** `FileAccess::parse` (Zeile 72) akzeptiert `"none"`, `"read-only"`,
-- `"read-write"` — und zusätzlich die Kurzformen `"readonly"`, `"ro"`,
-- `"readwrite"`, `"rw"`. Gespeichert wird nur die **Langform**: eine Datenbank
-- soll einen Wert nicht in vier Schreibweisen führen, und die Kurzformen sind
-- für die Kommandozeile da, nicht für die Ablage.
--
-- **Warum das der Kern dieser Migration ist.** Ein Profil in der Datenbank, das
-- der Dienst später ablehnt, ist schlimmer als kein Profil: der Fehler zeigt
-- dann auf die Stelle, die das Profil **benutzt**, und nicht auf die, die es
-- geschrieben hat. Deshalb erzwingt diese Migration **dieselben drei Regeln**
-- wie `SandboxPolicy::validate()` (Zeile 131):
--
--   1. `none`  verträgt sich mit KEINER Wurzel
--   2. `read-only` verträgt sich mit KEINER Schreibwurzel
--   3. eine gewährte Wurzel darf nicht leer sein
--
-- Die Begründung des Dienstes dafür, wörtlich: *"read-only policy with write
-- roots: one of the two would have to be silently ignored, which is exactly the
-- dishonesty this service exists to avoid."* Ein stillschweigend übergangener
-- Wert ist die Sorte Fehler, die niemand bemerkt, bis es darauf ankommt.
--
-- ---------------------------------------------------------------------------
-- WAS DIESE MIGRATION AUSDRUECKLICH NICHT TUT
-- ---------------------------------------------------------------------------
-- **Keine Row Level Security.** RLS ist Migration 0006 — mit derselben
-- Begründung wie in 0004: RLS wirkt, indem es Zeilen *wegfiltert*, und ohne
-- einen Aufrufer, der den Mandanten setzt, filtert es still alles weg. Der
-- Aufrufer ist inzwischen da (`werBinIch` kennt den Benutzer je Anfrage), aber
-- die Entscheidung gehört in eine eigene Migration mit eigener Messung.
--
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Die Tabelle
-- ---------------------------------------------------------------------------
-- **Warum `user_id` der Primärschlüssel ist und es keine eigene `id` gibt.**
-- Alle bisherigen Tabellen führen eine künstliche `id` und daneben `user_id`.
-- Hier ist das anders, und zwar mit Absicht: ein Profil gehört **genau einem**
-- Benutzer. Eine eigene `id` erlaubte **zwei** Profile für denselben Benutzer —
-- und dann wäre die einzige interessante Frage ("welches gilt?") offen. Der
-- natürliche Schlüssel IST der Benutzer.
--
-- **Warum ein einfacher Fremdschlüssel hier genügt.** Migration 0004 hat für
-- `chats`, `conversation_sessions` und `messages` **zusammengesetzte**
-- Schlüssel eingeführt, weil diese Tabellen **mehrere** Mandantenangaben tragen
-- (`user_id` UND `workspace_id`), die auseinanderlaufen konnten. Diese Tabelle
-- trägt genau **eine** — `user_id`. Ein zusammengesetzter Schlüssel hätte hier
-- nichts zu prüfen; er wäre Schmuck. Wer die 0004-Regel kennt, soll nicht
-- rätseln, warum hier eine Ausnahme steht: es ist keine.
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id         uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,

  -- Der Grad des Dateizugriffs. Als Text und nicht als ENUM: der Dienst kennt
  -- die Zeichenketten, und ein ENUM ließe sich später nur mühsam erweitern.
  dateizugriff    text NOT NULL,

  -- **Leere Liste als Vorgabe, nicht NULL.** `Isolation` führt
  -- `readonly string[]` — niemals `undefined`. NULL wäre eine **zweite**
  -- Schreibweise für "keine Wurzeln", und zwei Schreibweisen für dasselbe sind
  -- zwei Gelegenheiten, sie zu verwechseln.
  lesewurzeln     text[] NOT NULL DEFAULT ARRAY[]::text[],
  schreibwurzeln  text[] NOT NULL DEFAULT ARRAY[]::text[],

  -- Vorgabe **false** für beide, wie in `vorgabeProfil`: ein neuer Benutzer
  -- startet ohne Netz und ohne Prozeßstart. Wer mehr braucht, bekommt es
  -- ausdrücklich — nicht umgekehrt.
  netz            boolean NOT NULL DEFAULT false,
  prozesse        boolean NOT NULL DEFAULT false,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Regel 1 des Dienstes: die drei Werte, die `FileAccess::parse` in der
  -- Langform annimmt.
  CONSTRAINT user_profiles_dateizugriff_known
    CHECK (dateizugriff IN ('none', 'read-only', 'read-write')),

  -- Regel 2: `none` verträgt sich mit keiner Wurzel.
  CONSTRAINT user_profiles_keine_wurzel_ohne_zugriff
    CHECK (NOT (dateizugriff = 'none'
                AND (cardinality(lesewurzeln) > 0 OR cardinality(schreibwurzeln) > 0))),

  -- Regel 3: `read-only` verträgt sich mit keiner Schreibwurzel.
  -- Hier steht sie als eigene Bedingung und nicht in der vorigen: sie gilt für
  -- einen **anderen** Wert, und eine zusammengefaßte Bedingung wäre beim ersten
  -- Fehlschlag nicht mehr zu lesen.
  CONSTRAINT user_profiles_keine_schreibwurzel_bei_nur_lesen
    CHECK (NOT (dateizugriff = 'read-only' AND cardinality(schreibwurzeln) > 0)),

  -- Regel 4: eine gewährte Wurzel darf nicht leer sein.
  CONSTRAINT user_profiles_wurzeln_nicht_leer
    CHECK (NOT ('' = ANY (lesewurzeln) OR '' = ANY (schreibwurzeln))),

  -- **Und keine NULL in der Liste.** PostgreSQL erlaubt `ARRAY['a', NULL]`.
  -- Ein NULL in einer Wurzelliste wäre ein vierter Zustand, den weder
  -- `Isolation` noch `SandboxPolicy` kennt: die Liste hätte drei Einträge, von
  -- denen einer nichts ist. Die Prüfung kostet nichts und schließt ihn aus.
  CONSTRAINT user_profiles_wurzeln_ohne_null
    CHECK (array_position(lesewurzeln, NULL) IS NULL AND array_position(schreibwurzeln, NULL) IS NULL)
);

COMMENT ON TABLE user_profiles IS
  'Isolationsprofil je Benutzer: die Felder von SandboxPolicy (services/pmh-sandbox), woertlich abgebildet. Die Pruefregeln spiegeln SandboxPolicy::validate() - ein hier gespeichertes Profil darf der Dienst nicht ablehnen.';

COMMENT ON COLUMN user_profiles.dateizugriff IS
  'none | read-only | read-write. Woertlich die Langformen, die FileAccess::parse annimmt - kein Uebersetzungsschritt zwischen Ablage und Dienst.';

COMMENT ON COLUMN user_profiles.lesewurzeln IS
  'Wurzeln, unterhalb derer gelesen werden darf. Leere Liste heisst: keine. Nicht NULL - Isolation fuehrt niemals undefined.';

-- ---------------------------------------------------------------------------
-- 2. Die Pruefung, die dazugehoert
-- ---------------------------------------------------------------------------
-- Eine Migration, die niemand nachsieht, ist eine Absicht. Diese Abfrage nennt
-- beim Lauf die Zahl der erzwungenen Regeln — sie muss **5** sein:
--
--   1. `user_profiles_dateizugriff_known`              — die drei erlaubten Werte
--   2. `user_profiles_keine_wurzel_ohne_zugriff`       — Regel 2 des Dienstes
--   3. `user_profiles_keine_schreibwurzel_bei_nur_lesen` — Regel 3 des Dienstes
--   4. `user_profiles_wurzeln_nicht_leer`              — Regel 4 des Dienstes
--   5. `user_profiles_wurzeln_ohne_null`               — der vierte Zustand
--
-- **Warum die Zahl hier steht und nicht nur die Abfrage.** Beim Bau von 0004
-- stand eine erwartete Zahl im Kommentar, die nicht zu ihrer Stelle paßte. Eine
-- Zählung trägt ihre Erwartung mit sich, sonst sagt sie nichts.
--
-- **Und warum die Liste daneben steht.** Im ersten Entwurf stand hier "die drei
-- Werte des Zugriffsgrades und die vier inhaltlichen Regeln ergeben fünf" — das
-- wäre sieben. Die Aufzählung ist der Beleg, die Zahl ist die Zusammenfassung;
-- eine Zahl ohne ihre Aufzählung ist nicht nachprüfbar.
SELECT 'Regeln auf user_profiles nach 0005' AS pruefung,
       count(*) AS anzahl,
       5 AS erwartet
  FROM pg_constraint
 WHERE conrelid = 'user_profiles'::regclass
   AND contype = 'c';
