-- ===========================================================================
-- 0004 — Mandantentrennung an den Fremdschluesseln
-- ===========================================================================
--
-- ANLASS: Befund B-S1 aus docs/review/sicherheits-befunde.md. Wortlaut des
-- Befunds: "Die Datenbank erzwingt KEINE Mandantentrennung an den
-- Fremdschluesseln." Nachgemessen am 13.10.2026 gegen den laufenden Stapel:
--
--   docker exec pmh-postgres psql -U pmh_admin -d pmh -tAc \
--     "select conrelid::regclass||' -> '||confrelid::regclass||' ('||
--      pg_get_constraintdef(oid)||')' from pg_constraint
--       where connamespace='pmh'::regnamespace and contype='f' order by 1;"
--
--   -> 12 Fremdschluessel, JEDER davon EINSPALTIG.
--
-- WAS DAS BEDEUTET — der Riss in einem Satz: `chats` traegt `user_id` UND
-- `workspace_id` als zwei UNABHAENGIGE Verweise. Beide werden geprueft, aber
-- niemals GEGENEINANDER. Ein Chat von A darf damit in der Werkstatt von B
-- stehen, und die Datenbank sagt dazu nichts. Dasselbe bei
-- `conversation_sessions`: dort sind es drei unabhaengige Verweise
-- (`user_id`, `workspace_id`, `parent_session`), also drei offene Tueren.
--
-- WARUM DAS JETZT DRINGEND IST UND NICHT SPAETER. Die naechste Ausbaustufe ist
-- die Vektorsuche (RAG). Sie findet ueber `messages`/Chunks statt — und ein
-- Aehnlichkeitstreffer ueberschreitet Mandantengrenzen, sobald die Zeilen keine
-- belegte Zugehoerigkeit haben. Wer den Mandantenfilter NACH der ersten
-- Vektorspalte nachruestet, hat die Suche vorher schon ausgeliefert. Der
-- Mandantenfilter gehoert VOR die erste Vektorspalte; diese Migration legt ihn
-- in die Struktur, wo er nicht vergessen werden kann.
--
-- WAS DIESE MIGRATION TUT:
--   1. `UNIQUE (id, user_id)` auf workspaces, chats, conversation_sessions
--      — das sind die Ziele der zusammengesetzten Verweise.
--   2. `messages.user_id` ergaenzen und aus dem Chat fuellen, dann NOT NULL.
--   3. Die einspaltigen Verweise um zusammengesetzte ERGAENZEN (nicht ersetzen).
--
-- WAS SIE BEWUSST NICHT TUT: Row Level Security einschalten. Das ist
-- Migration 0005, und die Trennung ist eine Entscheidung, kein Vergessen:
-- RLS wirkt, indem es Zeilen WEGFILTERT, sobald kein Mandant gesetzt ist. Es
-- gibt heute KEINEN Aufrufer, der `pmh.user_id` setzt (die Anwendungs-
-- verdrahtung fehlt noch, Paket B). RLS jetzt einzuschalten hiesse: jede
-- Abfrage liefert still null Zeilen, und der Fehler saehe aus wie "Tabelle
-- leer" statt wie "Zugriff verweigert". Die Struktur kann sofort kommen, weil
-- sie nichts wegfiltert — sie verbietet nur Widersprueche.
--
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Die Ziele der zusammengesetzten Verweise
-- ---------------------------------------------------------------------------
-- Ein zusammengesetzter Fremdschluessel braucht auf der ZIELseite einen
-- eindeutigen Schluessel ueber genau diese Spalten. `id` allein ist schon
-- eindeutig (Primaerschluessel) — die Kombination `(id, user_id)` ist es
-- damit erst recht. Der Index ist also nicht redundant im Sinne von
-- "doppelte Arbeit": er ist die Voraussetzung, dass die Datenbank die
-- Kombination ueberhaupt pruefen DARF.
--
-- **Warum `IF NOT EXISTS` hier nicht geht.** `ADD CONSTRAINT` kennt kein
-- `IF NOT EXISTS`. Beim ersten Lauf ist das gleichgueltig, denn der Laeufer
-- fuehrt eine angewandte Migration nie erneut aus (Pruefsumme, src/index.ts).
ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_id_user_key UNIQUE (id, user_id);

ALTER TABLE chats
  ADD CONSTRAINT chats_id_user_key UNIQUE (id, user_id);

ALTER TABLE conversation_sessions
  ADD CONSTRAINT conversation_sessions_id_user_key UNIQUE (id, user_id);

-- ---------------------------------------------------------------------------
-- 2. Der Mandant jeder Nachricht
-- ---------------------------------------------------------------------------
-- `messages` hatte GAR KEINE Mandantenspalte: die Zugehoerigkeit war nur ueber
-- `chat_id` erreichbar, also nur durch einen Verbund. Zwei Gruende, warum das
-- nicht reicht:
--
--   a) Ein Fremdschluessel kann die Zugehoerigkeit dann nicht pruefen. Ohne
--      eigene Spalte gibt es nichts, was man gegen den Chat stellen koennte.
--   b) Jede spaetere Suche muesste den Verbund mitfuehren. Wer ihn einmal
--      vergisst — in einem Index, einer materialisierten Sicht, einer
--      Auswertung —, sucht ueber alle Mandanten.
--
-- **Ist das nicht Doppelhaltung, die auseinanderlaufen kann?** Nein, und das
-- ist der Kern dieser Migration: eine doppelt gehaltene Angabe ist genau dann
-- gefaehrlich, wenn sie abweichen KANN. Der zusammengesetzte Verweis aus
-- Schritt 3 macht eine Abweichung unmoeglich — die Datenbank lehnt sie ab.
-- Die Spalte ist damit keine zweite Wahrheit, sondern eine BEWIESENE.
ALTER TABLE messages ADD COLUMN user_id uuid;

-- Fuellen aus dem Chat. Zu diesem Zeitpunkt ist der einspaltige Verweis
-- `messages_chat_id_fkey` in Kraft, also hat jede Zeile genau einen Chat.
-- Gemessen vor der Migration: 10000 Nachrichten, 20 Chats, 0 Abweichungen
-- zwischen Chat-Mandant und Werkstatt-Mandant.
UPDATE messages m
   SET user_id = c.user_id
  FROM chats c
 WHERE c.id = m.chat_id;

-- Jetzt traegt jede Zeile einen Mandanten. Erst hier NOT NULL setzen: vorher
-- waere es eine Behauptung, die die Daten noch nicht stuetzen.
-- Scheitert diese Zeile, gibt es eine Nachricht ohne Chat — und dann ist die
-- Annahme oben falsch und soll laut scheitern, nicht still durchgehen.
ALTER TABLE messages ALTER COLUMN user_id SET NOT NULL;

-- Der Index dient dem Filter, den RLS in 0005 auf jede Abfrage setzt, und der
-- spaeteren mandantenbewussten Suche. Er ist ausdruecklich NICHT als
-- "Vektorindex" gedacht — die Vektorspalte kommt fruehestens mit RAG.
CREATE INDEX messages_user_created_idx ON messages (user_id, created_at DESC);

COMMENT ON COLUMN messages.user_id IS
  'Mandant der Nachricht. Aus chats.user_id gefuellt und durch den zusammengesetzten Fremdschluessel messages_chat_user_fkey gegen den Chat bewiesen — eine Abweichung ist unmoeglich, nicht nur unwahrscheinlich.';

-- ---------------------------------------------------------------------------
-- 3. Die zusammengesetzten Verweise
-- ---------------------------------------------------------------------------
-- **Warum ERGAENZEN und nicht ERSETZEN.** Die einspaltigen Verweise bleiben
-- stehen. Das ist Absicht und nicht Ordnungsliebe:
--
--   * Ein zusammengesetzter Verweis ist STRENGER als der einspaltige — er
--     verbietet alles, was jener verbietet, und zusaetzlich den Widerspruch.
--     Beide zusammen lassen also nichts durch, was der neue allein durchliesse.
--   * Der alte Verweis traegt das `ON DELETE`-Verhalten, auf das sich die
--     Anwendung verlaesst. Ihn zu entfernen und durch einen neuen mit gleicher
--     Wirkung zu ersetzen waere eine Aenderung ohne Gewinn, aber mit Risiko.
--   * Hausregel H6: richtigstellen durch HINZUFUEGEN, nicht durch Loeschen.
--
-- **Der Fallstrick, der diese Migration beinahe falsch gemacht haette.**
-- `ON DELETE SET NULL` auf einem ZUSAMMENGESETZTEN Verweis leert ALLESpalten
-- des Verweises, nicht nur die eine, die den geloeschten Datensatz nannte.
-- Bei `conversation_sessions` haette das `user_id` mitgeleert — und `user_id`
-- ist `NOT NULL`. Die Migration waere glatt durchgelaufen (beim Anlegen wird
-- nichts geloescht) und erst beim ERSTEN LOESCHEN gescheitert, mit einer
-- Fehlermeldung, die auf das Loeschen zeigt und nicht auf diese Zeile.
--
-- PostgreSQL 15 hat dafuer die Spaltenliste eingefuehrt: `ON DELETE SET NULL
-- (spalte)` leert genau die genannten Spalten. Der Stapel faehrt 17.11
-- (gemessen: `show server_version`), also steht sie zur Verfuegung.

-- Ein Chat darf nur in der Werkstatt SEINES Mandanten stehen.
ALTER TABLE chats
  ADD CONSTRAINT chats_workspace_user_fkey
  FOREIGN KEY (workspace_id, user_id) REFERENCES workspaces (id, user_id)
  ON DELETE CASCADE;

-- Eine Sitzung darf nur auf eine Werkstatt ihres Mandanten zeigen.
-- Die Spaltenliste `(workspace_id)` ist der Kern der Sache: ohne sie wuerde
-- `user_id` mitgeleert und die NOT-NULL-Regel das Loeschen verhindern.
ALTER TABLE conversation_sessions
  ADD CONSTRAINT conversation_sessions_workspace_user_fkey
  FOREIGN KEY (workspace_id, user_id) REFERENCES workspaces (id, user_id)
  ON DELETE SET NULL (workspace_id);

-- Eine Sitzung darf nur von einer Sitzung DESSELBEN Mandanten abstammen.
-- Ohne das koennte ein Unteragent an einen Elternteil eines fremden Benutzers
-- gehaengt werden — und die Rekursionstiefe des Kerns ist dauerhaft, die
-- Verkettung also nicht harmlos.
ALTER TABLE conversation_sessions
  ADD CONSTRAINT conversation_sessions_parent_user_fkey
  FOREIGN KEY (parent_session, user_id) REFERENCES conversation_sessions (id, user_id)
  ON DELETE SET NULL (parent_session);

-- Eine Nachricht darf nur in einem Chat DESSELBEN Mandanten stehen.
ALTER TABLE messages
  ADD CONSTRAINT messages_chat_user_fkey
  FOREIGN KEY (chat_id, user_id) REFERENCES chats (id, user_id)
  ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Der Mandant der Nachricht muss ein BENUTZER sein
-- ---------------------------------------------------------------------------
-- Ohne diesen Verweis waere `messages.user_id` eine UUID, die auf nichts zeigt:
-- der zusammengesetzte Verweis aus Schritt 3 haelt sie nur mit dem CHAT
-- zusammen, nicht mit der Benutzertabelle. Beide zusammen ergeben erst den
-- Beweis: die Nachricht gehoert zu einem Chat, der Chat gehoert zu diesem
-- Benutzer, und der Benutzer existiert.
ALTER TABLE messages
  ADD CONSTRAINT messages_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users (id)
  ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. Die Pruefung, die dazugehoert
-- ---------------------------------------------------------------------------
-- Eine Migration, die niemand nachsieht, ist eine Absicht. Diese Abfrage nennt
-- beim Lauf die Zahl der zusammengesetzten Verweise — sie muss von 0 auf 4
-- steigen. Faellt sie aus, ist die Migration angewendet und die Trennung
-- trotzdem nicht da.
--
-- **Warum sie GANZ AM ENDE steht.** Im ersten Entwurf stand sie vor Schritt 4
-- und haette 4 gezaehlt, waehrend der Kommentar 5 behauptete. Eine Pruefung,
-- deren erwartete Zahl nicht zu ihrer Stelle passt, ist schlimmer als keine:
-- sie sieht aus wie ein Nachweis und ist eine Zahl ohne Bedeutung.
--
-- **Die vier GEZAEHLTEN:** chats->workspaces,
-- conversation_sessions->workspaces, conversation_sessions->conversation_sessions,
-- messages->chats.
--
-- **Die fuenfte, die NICHT gezaehlt wird: `messages_user_id_fkey`.** Sie steht
-- direkt darunter, ist fuer den Beweis unentbehrlich — und ist EINSPALTIG
-- (`user_id` -> `users.id`). Die Bedingung `array_length(conkey, 1) > 1` sieht
-- sie deshalb nicht, und die erwartete Zahl ist **4**, nicht 5.
--
-- **Das war ein echter Fehler in dieser Datei, und wie er aufgefiel.** Im ersten
-- Lauf stand hier `5 AS erwartet` neben einer Zaehlung, die 4 ergab — mit dem
-- Satz "die fuenf" darueber, der den einspaltigen Verweis mitzaehlte. Aufgefallen
-- ist es allein dadurch, dass `erwartet` als SPALTE neben `anzahl` steht: eine
-- blanke 4 haette niemandem etwas gesagt. Die Lehre steht hier, damit die
-- naechste Zahl nicht wieder behauptet wird: eine Zaehlung traegt ihre
-- Erwartung mit sich.
SELECT 'zusammengesetzte Fremdschluessel nach 0004' AS pruefung,
       count(*) AS anzahl,
       4 AS erwartet
  FROM pg_constraint
 WHERE connamespace = current_schema()::regnamespace
   AND contype = 'f'
   AND array_length(conkey, 1) > 1;
