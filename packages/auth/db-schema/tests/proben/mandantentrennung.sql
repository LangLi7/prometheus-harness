-- ===========================================================================
-- Probe: Mandantentrennung (Befund B-S1) — ANLEGEN und LOESCHEN
-- ===========================================================================
--
-- Aufruf (aus dem Projektwurzelverzeichnis, Docker-Stapel laeuft):
--
--   Get-Content packages/auth/db-schema/tests/proben/mandantentrennung.sql -Raw |
--     docker exec -i pmh-postgres psql -U pmh_admin -d pmh -v ON_ERROR_STOP=1
--
-- WAS DIESE PROBE TUT. Sie stellt zwei Mandanten her (A und B), baut bei B eine
-- Werkstatt, einen Chat und Sitzungen — und prueft dann ZWEI Dinge:
--
--   Teil 1 (L1-L4): ANLEGEN. Vier Uebergriffe, die A auf Daten von B zielen
--                   lassen. Jeder MUSS abgelehnt werden.
--   Teil 2 (L5-L6): LOESCHEN. Zwei Loeschvorgaenge, die GELINGEN muessen und
--                   dabei genau eine Spalte leeren — nicht zwei.
--
-- Danach rollt sie alles zurueck. Ein Beweis braucht keine Spur in der
-- Datenbank; die AUSGABE ist der Beweis.
--
-- ---------------------------------------------------------------------------
-- WARUM TEIL 2 EXISTIERT — und warum er zuerst fehlte
-- ---------------------------------------------------------------------------
-- In der ersten Fassung dieser Probe stand nur Teil 1. Migration 0004 lief durch,
-- die vier Uebergriffe wurden abgelehnt, alles war gruen.
--
-- **Was dabei ungeprueft blieb, ist genau der Fallstrick, den der Kopf der
-- Migration selbst beschreibt:** `ON DELETE SET NULL` auf einem ZUSAMMENGESETZTEN
-- Verweis leert ALLE Spalten des Verweises. Bei `conversation_sessions` haette das
-- `user_id` mitgeleert — und `user_id` ist `NOT NULL`.
--
-- **Das Anlegen beweist das NICHT.** Beim `ADD CONSTRAINT` wird nichts geloescht;
-- die Regel wird geprueft, aber ihr Loeschverhalten nie ausgeloest. Die Migration
-- waere glatt durchgelaufen und erst beim ERSTEN LOESCHEN gescheitert.
--
-- Die Aufsicht hatte denselben Punkt fuer die **einfache** Form von `SET NULL`
-- bereits gemessen (Befund **B-S1b**, `docs/review/BEFUNDE-ALLE.md` Zeile 30) und
-- `NO ACTION`/`CASCADE` empfohlen. Migration 0004 geht einen dritten Weg: die
-- **Spaltenliste** `ON DELETE SET NULL (spalte)` aus PostgreSQL 15. Fuer den gibt
-- es bis hierher **keine** Messung — also steht sie jetzt hier.
--
-- ---------------------------------------------------------------------------
-- WARUM DIE BEWERTUNG EINE AUSNAHME WIRFT — und nicht nur Zahlen druckt
-- ---------------------------------------------------------------------------
-- Der erste Lauf endete trotz "PROBE GESCHEITERT" mit **Exit-Code 0**: psql
-- scheitert nicht daran, dass ein `SELECT` eine unangenehme Zeile liefert. Als
-- Regressionstest in einer Kette war die Probe damit wertlos.
--
-- ---------------------------------------------------------------------------
-- WARUM NUR `23503` ALS ABLEHNUNG ZAEHLT
-- ---------------------------------------------------------------------------
-- Der erste Entwurf haette JEDEN Fehler als Ablehnung gewertet. Damit waere die
-- Probe VOR Migration 0004 gruen geworden: der Versuch L4 nennt die Spalte
-- `messages.user_id`, die es vorher nicht gibt, und PostgreSQL haette mit
-- `42703 undefined_column` geantwortet — einem Fehler, der wie eine Abweisung
-- AUSSIEHT und KEINE ist.
--
-- Jede Zeile traegt deshalb ihre ERWARTUNG als eigene Spalte, und die Bewertung
-- vergleicht `erwartet` mit `ist`. Eine Zahl ohne ihre Erwartung sagt nichts.
--
-- ERWARTUNG VOR 0004: L1-L3 ANGENOMMEN, L4 42703, L5/L6 kein zusammengesetzter
--                     Verweis vorhanden.
-- ERWARTUNG NACH 0004: sechs Zeilen, alle `erwartet = ist`.
--
-- ===========================================================================

\set ON_ERROR_STOP on
\pset border 2

begin;

create temp table probe (nr int, was text, erwartet text, ist text, zusatz text) on commit drop;

-- ---------------------------------------------------------------------------
-- Zwei Mandanten und die Sachen von B
-- ---------------------------------------------------------------------------
-- Feste UUIDs mit erkennbarem Muster, damit ein Rest im Datenbestand sofort als
-- Probendatum zu erkennen waere. `role` kennt laut Pruefregel `users_role_known`
-- genau zwei Werte: 'user' und 'admin'.
insert into pmh.users (id, email, display_name, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'a@probe.invalid', 'Mandant A', 'user'),
  ('00000000-0000-4000-8000-0000000000b1', 'b@probe.invalid', 'Mandant B', 'user');

insert into pmh.workspaces (id, user_id, name, root_path) values
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1', 'Werkstatt A', 'C:\probe\a'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b1', 'Werkstatt B', 'C:\probe\b');

insert into pmh.chats (id, workspace_id, user_id, title, message_count) values
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b1', 'Chat von B', 0);

-- `conversation_sessions.created_at` hat KEINE Vorgabe (gemessen ueber
-- information_schema.columns) und `revision` ist NOT NULL — beide muessen
-- mitgegeben werden, sonst scheitert schon der Aufbau und die Probe misst
-- gar nichts.
insert into pmh.conversation_sessions (id, version, created_at, revision, is_seeded, user_id) values
  ('probe-b-sitzung', 1, now(), 'r1', false, '00000000-0000-4000-8000-0000000000b1');

-- ===========================================================================
-- TEIL 1 — ANLEGEN: vier Uebergriffe, alle muessen abgelehnt werden
-- ===========================================================================
-- Jeder Versuch laeuft in einem eigenen Unterblock mit Ausnahmebehandlung:
-- scheitert er, wird NUR er zurueckgerollt und die Transaktion lebt weiter.
-- Ohne den Unterblock waere die erste Ablehnung das Ende der ganzen Probe — und
-- man wuesste nichts ueber die drei folgenden.
do $$
declare
  s text;
begin
  -- L1: Chat von A in der WERKSTATT von B
  begin
    insert into pmh.chats (id, workspace_id, user_id, title, message_count)
    values ('00000000-0000-4000-8000-0000000000a3',
            '00000000-0000-4000-8000-0000000000b2',
            '00000000-0000-4000-8000-0000000000a1',
            'A in B-Werkstatt', 0);
    insert into probe values (1, 'L1 Chat von A in Werkstatt von B', '23503', 'ANGENOMMEN', '-');
  exception when others then
    get stacked diagnostics s = returned_sqlstate;
    insert into probe values (1, 'L1 Chat von A in Werkstatt von B', '23503',
                              case when s = '23503' then '23503' else 'FALSCHER GRUND' end, s);
  end;

  -- L2: Sitzung von A im ARBEITSBEREICH von B
  begin
    insert into pmh.conversation_sessions (id, version, created_at, revision, is_seeded, user_id, workspace_id)
    values ('probe-a-sitzung-in-b',
            1, now(), 'r1', false,
            '00000000-0000-4000-8000-0000000000a1',
            '00000000-0000-4000-8000-0000000000b2');
    insert into probe values (2, 'L2 Sitzung von A in Arbeitsbereich von B', '23503', 'ANGENOMMEN', '-');
  exception when others then
    get stacked diagnostics s = returned_sqlstate;
    insert into probe values (2, 'L2 Sitzung von A in Arbeitsbereich von B', '23503',
                              case when s = '23503' then '23503' else 'FALSCHER GRUND' end, s);
  end;

  -- L3: Unteragent von A an den ELTERNTEIL von B gehaengt
  begin
    insert into pmh.conversation_sessions (id, version, created_at, revision, is_seeded, user_id, parent_session)
    values ('probe-a-kind-von-b',
            1, now(), 'r1', true,
            '00000000-0000-4000-8000-0000000000a1',
            'probe-b-sitzung');
    insert into probe values (3, 'L3 Unteragent von A unter Elternteil von B', '23503', 'ANGENOMMEN', '-');
  exception when others then
    get stacked diagnostics s = returned_sqlstate;
    insert into probe values (3, 'L3 Unteragent von A unter Elternteil von B', '23503',
                              case when s = '23503' then '23503' else 'FALSCHER GRUND' end, s);
  end;

  -- L4: Nachricht von A im CHAT von B
  begin
    insert into pmh.messages (chat_id, id, role, user_id)
    values ('00000000-0000-4000-8000-0000000000b3', 'probe-n1', 'user',
            '00000000-0000-4000-8000-0000000000a1');
    insert into probe values (4, 'L4 Nachricht von A in Chat von B', '23503', 'ANGENOMMEN', '-');
  exception when others then
    get stacked diagnostics s = returned_sqlstate;
    insert into probe values (4, 'L4 Nachricht von A in Chat von B', '23503',
                              case when s = '23503' then '23503' else 'FALSCHER GRUND' end, s);
  end;
end $$;

-- ===========================================================================
-- TEIL 2 — LOESCHEN: die Spaltenliste muss genau EINE Spalte leeren
-- ===========================================================================
do $$
declare
  s text;
  ist text;
begin
  -- -------------------------------------------------------------------------
  -- L5: Eine WERKSTATT loeschen, auf die eine Sitzung zeigt
  -- -------------------------------------------------------------------------
  -- Erwartet: das Loeschen GELINGT, `workspace_id` wird NULL — und `user_id`
  -- BLEIBT. Wuerde `SET NULL` beide Spalten leeren, scheiterte das Loeschen an
  -- `user_id NOT NULL`, und zwar erst hier.
  begin
    insert into pmh.conversation_sessions (id, version, created_at, revision, is_seeded, user_id, workspace_id)
    values ('probe-b-mit-raum', 1, now(), 'r1', false,
            '00000000-0000-4000-8000-0000000000b1',
            '00000000-0000-4000-8000-0000000000b2');

    delete from pmh.workspaces where id = '00000000-0000-4000-8000-0000000000b2';

    select case
             when x.workspace_id is null
              and x.user_id = '00000000-0000-4000-8000-0000000000b1'
               then 'geloescht+user_id erhalten'
             when x.workspace_id is null
               then 'geloescht aber user_id VERLOREN'
             else 'workspace_id noch gesetzt'
           end
      into ist
      from pmh.conversation_sessions x
     where x.id = 'probe-b-mit-raum';

    -- Die Sitzung selbst darf NICHT mitgeloescht worden sein.
    insert into probe values (5, 'L5 Werkstatt loeschen (Sitzung bleibt, user_id bleibt)',
                              'geloescht+user_id erhalten',
                              coalesce(ist, 'SITZUNG VERSCHWUNDEN'), '-');
  exception when others then
    get stacked diagnostics s = returned_sqlstate;
    insert into probe values (5, 'L5 Werkstatt loeschen (Sitzung bleibt, user_id bleibt)',
                              'geloescht+user_id erhalten', 'LOESCHEN GESCHEITERT', s);
  end;

  -- -------------------------------------------------------------------------
  -- L6: Eine ELTERNSITZUNG loeschen, an der ein Unteragent haengt
  -- -------------------------------------------------------------------------
  -- Erwartet: das Loeschen GELINGT, `parent_session` wird NULL — und `user_id`
  -- BLEIBT. Dieselbe Frage wie L5, aber am Selbtsbezug.
  begin
    insert into pmh.conversation_sessions (id, version, created_at, revision, is_seeded, user_id) values
      ('probe-b-ober', 1, now(), 'r1', false, '00000000-0000-4000-8000-0000000000b1');
    insert into pmh.conversation_sessions (id, version, created_at, revision, is_seeded, user_id, parent_session)
    values ('probe-b-unter', 1, now(), 'r1', true,
            '00000000-0000-4000-8000-0000000000b1', 'probe-b-ober');

    delete from pmh.conversation_sessions where id = 'probe-b-ober';

    select case
             when x.parent_session is null
              and x.user_id = '00000000-0000-4000-8000-0000000000b1'
               then 'geloescht+user_id erhalten'
             when x.parent_session is null
               then 'geloescht aber user_id VERLOREN'
             else 'parent_session noch gesetzt'
           end
      into ist
      from pmh.conversation_sessions x
     where x.id = 'probe-b-unter';

    insert into probe values (6, 'L6 Elternsitzung loeschen (Kind bleibt, user_id bleibt)',
                              'geloescht+user_id erhalten',
                              coalesce(ist, 'KIND VERSCHWUNDEN'), '-');
  exception when others then
    get stacked diagnostics s = returned_sqlstate;
    insert into probe values (6, 'L6 Elternsitzung loeschen (Kind bleibt, user_id bleibt)',
                              'geloescht+user_id erhalten', 'LOESCHEN GESCHEITERT', s);
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Ergebnis
-- ---------------------------------------------------------------------------
select nr, was, erwartet, ist,
       case when erwartet = ist then 'ok' else 'ABWEICHUNG' end as befund,
       zusatz as sqlstate
  from probe
 order by nr;

-- Sechs Zeilen, jede mit ihrer eigenen Erwartung. Die Bewertung vergleicht, statt
-- zu zaehlen: eine Zahl ohne ihre Erwartung sagt nichts.
do $$
declare
  v_gesamt int;
  v_abweichungen int;
begin
  select count(*), count(*) filter (where erwartet <> ist) into v_gesamt, v_abweichungen from probe;
  if v_gesamt <> 6 then
    raise exception 'PROBE UNBRAUCHBAR: % Zeilen statt 6 — es wurde nicht alles geprueft', v_gesamt;
  end if;
  if v_abweichungen = 0 then
    raise notice 'PROBE BESTANDEN: 6 von 6 Faellen wie erwartet (4 Uebergriffe abgelehnt, 2 Loeschvorgaenge mit erhaltener user_id)';
  else
    raise exception 'PROBE GESCHEITERT: % von % Faellen weichen ab', v_abweichungen, v_gesamt;
  end if;
end $$;

rollback;
