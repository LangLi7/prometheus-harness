-- mandantentrennung-probe.sql — bereitgelegt von der AUFSICHT, NICHT angewendet
--
-- **Warum diese Datei existiert.** Der bauende Agent hat am 13.10. um 16:30 in
-- `docs/review/sicherheits-befunde.md` (B-S1) richtig gemessen, daß die Datenbank die
-- Mandantentrennung an den Verweisen **nicht** erzwingt, und als kleinste wirksame Behebung
-- den **zusammengesetzten Fremdschlüssel** vorgeschlagen. Zwei Dinge daran hat er ausdrücklich
-- offen gelassen: ob die Behebung wirklich abweist — und was `ON DELETE SET NULL` mit einer
-- `NOT NULL`-Spalte macht. **Beides ist meßbar, und beides ist gemessen.**
--
-- **Was hier passiert.** Nichts an SEINEN Tabellen. Der Katalog wird nur gelesen, und die
-- Wirkung wird an **eigenen Wegwerf-Tabellen** gezeigt, die in derselben Transaktion wieder
-- verschwinden (`ROLLBACK`). Kein `TRUNCATE`, kein `DROP`, kein `DELETE` an fremden Tabellen.
--
-- **Aufruf — `ON_ERROR_STOP` muß hier AUS sein**, weil die Fehler in D1 und D3 der **Beleg**
-- sind und nicht ein Abbruch:
--   Get-Content mandantentrennung-probe.sql -Raw | docker exec -i pmh-postgres `
--     psql -U pmh_admin -d pmh -v ON_ERROR_STOP=off
--   (Ausgabe lesen; `OFFEN:` heißt: die Datenbank erzwingt es noch nicht. Abschnitt E muß
--    `0 | 0` zeigen — dann ist nichts liegengeblieben.)
--
-- **Vorsicht, hier lag der Fehler der ersten Fassung.** D3 prüft nur dann etwas, wenn die
-- Verweiszeile aus D2 **stehenbleibt**. Meine erste Fassung rollte nach D2 auf den
-- Sicherungspunkt zurück und entfernte damit die geprüfte Zeile — die Ausgabe lautete dann
-- `DELETE 1` statt eines Fehlers, und das Werkzeug hätte das **Gegenteil** des Befunds
-- behauptet. Wer hier etwas ändert: D2 darf **nicht** zurückgerollt werden.
--
-- **Ergebnis vom 13.10.2026, 16:33** (erster Lauf, mit stehender Verweiszeile):
--   1. Der Katalogbefund ist **bestätigt**: `conversation_sessions_parent_session_fkey` →
--      `conversation_sessions(id)`, `conversation_sessions_workspace_id_fkey` → `workspaces(id)`,
--      `chats_workspace_id_fkey` → `workspaces(id)`, `messages_chat_id_fkey` → `chats(id)`.
--      Keiner führt den Eigentümer mit; alle Primärschlüssel sind einspaltig (Ausnahme:
--      `messages_pkey` = `(chat_id, id)`). Abschnitt A: **OFFEN**, Abschnitt C: **11 Tabellen
--      ohne RLS**.
--   2. Der zusammengesetzte Verweis **weist ab**: der Fremdverweis scheitert mit
--      `violates foreign key constraint "chat_raum_same_user_fkey"`, der eigene gelingt.
--   3. **`ON DELETE SET NULL` ist mit einer `NOT NULL`-Spalte nicht ausführbar:** das Löschen
--      der Mutterspalte läuft als
--      `UPDATE ONLY chat SET workspace_id = NULL, user_id = NULL` und scheitert an
--      `null value in column "workspace_id" violates not-null constraint`.
--      Das trifft **beide** vorgeschlagenen Verweise (`chats.workspace_id` **und**
--      `conversation_sessions.parent_session`), weil `user_id` in beiden Tabellen `NOT NULL` ist.
--
-- **Was daraus folgt.** Der Weg ist richtig, die Löschregel muß anders lauten: `NO ACTION`
-- (Löschen wird abgewiesen, solange ein Verweis besteht) oder `ON DELETE CASCADE`. Für dieses
-- Schema spricht `NO ACTION`, weil es **weiche** Löschungen kennt (`chats.deleted_at`,
-- `workspaces.archived_at`) — gemessen vorhanden. Wer hart löscht, muß vorher entkoppeln.
--
-- **Grenze dieser Probe.** Sie zeigt die **Semantik** an eigenen Tabellen, nicht die Wirkung
-- auf seine. Sie ersetzt **keine** Migration und keine Entscheidung; sie macht nur die
-- Entscheidung meßbar, die er als offen benannt hat.

\echo === A) Erzwingt die Datenbank die Mandantentrennung an den Verweisen? ===
select case when count(*) = 0 then 'OFFEN: kein zusammengesetzter Fremdschluessel vorhanden - die Datenbank fragt nicht, wem eine Zeile gehoert'
            else 'PASS: ' || count(*) || ' zusammengesetzte Verweise vorhanden' end as befund
from pg_constraint con
join pg_namespace n on n.oid = con.connamespace
where n.nspname = 'pmh' and con.contype = 'f' and array_length(con.conkey, 1) > 1;

\echo === B) Die vier genannten Verweise im Katalog ===
select con.conname, con.conrelid::regclass as tabelle, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_namespace n on n.oid = con.connamespace
where n.nspname = 'pmh' and con.contype = 'f'
  and con.conname in ('conversation_sessions_parent_session_fkey',
                      'conversation_sessions_workspace_id_fkey',
                      'chats_workspace_id_fkey',
                      'messages_chat_id_fkey')
order by 1;

\echo === C) Tabellen ohne Row-Level-Security im Schema pmh ===
select case when count(*) = 0 then 'PASS: alle Tabellen haben RLS an'
            else 'OFFEN: ' || count(*) || ' Tabellen ohne RLS (relrowsecurity = false)' end as befund
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'pmh' and c.relkind = 'r' and c.relrowsecurity = false;

\echo === D) Wirkung des zusammengesetzten Verweises, an eigenen Wegwerf-Tabellen ===
begin;
create schema aufsicht_probe;
create table aufsicht_probe.nutzer (id uuid primary key);
create table aufsicht_probe.raum (id uuid primary key, user_id uuid not null references aufsicht_probe.nutzer(id));
create unique index raum_id_user_key on aufsicht_probe.raum (id, user_id);
create table aufsicht_probe.chat (
  id uuid primary key,
  workspace_id uuid not null,
  user_id uuid not null references aufsicht_probe.nutzer(id),
  constraint chat_raum_same_user_fkey foreign key (workspace_id, user_id)
    references aufsicht_probe.raum (id, user_id) on delete set null);

insert into aufsicht_probe.nutzer values
  ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into aufsicht_probe.raum values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111');

\echo --- D1) fremder Verweis (B zeigt auf den Raum von A): muss abgewiesen werden ---
savepoint s1;
insert into aufsicht_probe.chat values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222');
rollback to savepoint s1;

\echo --- D2) eigener Verweis: muss gelingen (INSERT 0 1) - die Zeile bleibt STEHEN ---
insert into aufsicht_probe.chat values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111');

\echo --- D3) Raum loeschen, WAEHREND die Zeile aus D2 steht: hier entscheidet sich ON DELETE SET NULL ---
savepoint s3;
delete from aufsicht_probe.raum where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
rollback to savepoint s3;

rollback;

\echo === E) Rueckstand? (muss 0 / 0 sein) ===
select (select count(*) from pg_namespace where nspname = 'aufsicht_probe') as wegwerf_schemata,
       (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'aufsicht_probe') as wegwerf_tabellen;
