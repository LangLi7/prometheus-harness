-- ===========================================================================
-- Probe: Benutzerprofile (Migration 0005)
-- ===========================================================================
--
-- Aufruf:
--   Get-Content packages/auth/db-schema/tests/proben/benutzerprofile.sql -Raw |
--     docker exec -i pmh-postgres psql -U pmh_admin -d pmh -v ON_ERROR_STOP=1
--
-- WAS DIESE PROBE PRUEFT. Daß die Bedingungen der Tabelle **wirken** — und zwar
-- **dieselben** Fälle, die `SandboxPolicy::validate()` in
-- `services/pmh-sandbox/src/lib.rs` (Zeile 131) ablehnt. Ein Profil, das die
-- Datenbank annimmt und der Dienst später verwirft, wäre schlimmer als kein
-- Profil: der Fehler zeigte dann auf die Stelle, die es **benutzt**, statt auf
-- die, die es geschrieben hat.
--
-- **Warum jeder Fall seinen eigenen Unterblock hat.** Der erste Entwurf war eine
-- einzige Transaktion mit neun Anweisungen. Der erste Fehler brach sie ab, und
-- die acht folgenden Fälle liefen **gar nicht** — sie meldeten
-- `current transaction is aborted`. Übrig blieb **eine** bewiesene Regel und ein
-- Protokoll, das nach neun aussah. Jeder Fall läuft deshalb in einem eigenen
-- `begin … exception`, das nur ihn zurückrollt.
--
-- ERWARTUNG: 10 Zeilen, alle `erwartet = ist`.
--
-- ===========================================================================

\set ON_ERROR_STOP on
\pset border 2

begin;

create temp table probe (nr int, was text, erwartet text, ist text, zusatz text) on commit drop;

insert into pmh.users (id, email, display_name)
values ('00000000-0000-4000-8000-0000000000c1', 'profil@probe.invalid', 'Profilprobe');

do $$
declare
  s text;
begin
  -- -------------------------------------------------------------------------
  -- 1. Ein gueltiges Profil wird angenommen (die Admin-Form)
  -- -------------------------------------------------------------------------
  begin
    insert into pmh.user_profiles (user_id, dateizugriff, lesewurzeln, schreibwurzeln, netz, prozesse)
    values ('00000000-0000-4000-8000-0000000000c1', 'read-write', array['/w'], array['/w'], true, true);
    insert into probe values (1, 'gueltiges Profil (read-write)', 'angenommen', 'angenommen', '-');
  exception when others then
    get stacked diagnostics s = returned_sqlstate;
    insert into probe values (1, 'gueltiges Profil (read-write)', 'angenommen', 'ABGELEHNT', s);
  end;

  -- -------------------------------------------------------------------------
  -- 2. Regel des Dienstes: `none` vertraegt sich mit keiner Wurzel
  -- -------------------------------------------------------------------------
  begin
    insert into pmh.user_profiles (user_id, dateizugriff, lesewurzeln)
    values ('00000000-0000-4000-8000-0000000000c2', 'none', array['/w']);
    insert into probe values (2, 'none + Lesewurzel', '23514', 'ANGENOMMEN', '-');
  exception when others then
    get stacked diagnostics s = returned_sqlstate;
    insert into probe values (2, 'none + Lesewurzel', '23514', s, '-');
  end;

  -- -------------------------------------------------------------------------
  -- 3. Regel des Dienstes: `read-only` vertraegt sich mit keiner Schreibwurzel
  -- -------------------------------------------------------------------------
  begin
    insert into pmh.user_profiles (user_id, dateizugriff, schreibwurzeln)
    values ('00000000-0000-4000-8000-0000000000c3', 'read-only', array['/w']);
    insert into probe values (3, 'read-only + Schreibwurzel', '23514', 'ANGENOMMEN', '-');
  exception when others then
    get stacked diagnostics s = returned_sqlstate;
    insert into probe values (3, 'read-only + Schreibwurzel', '23514', s, '-');
  end;

  -- -------------------------------------------------------------------------
  -- 4. Regel des Dienstes: eine gewaehrte Wurzel darf nicht leer sein
  -- -------------------------------------------------------------------------
  begin
    insert into pmh.user_profiles (user_id, dateizugriff, lesewurzeln)
    values ('00000000-0000-4000-8000-0000000000c4', 'read-only', array['']);
    insert into probe values (4, 'leere Wurzel im Feld', '23514', 'ANGENOMMEN', '-');
  exception when others then
    get stacked diagnostics s = returned_sqlstate;
    insert into probe values (4, 'leere Wurzel im Feld', '23514', s, '-');
  end;

  -- -------------------------------------------------------------------------
  -- 5. Kein NULL in einer Wurzelliste (der vierte Zustand)
  -- -------------------------------------------------------------------------
  begin
    insert into pmh.user_profiles (user_id, dateizugriff, lesewurzeln)
    values ('00000000-0000-4000-8000-0000000000c5', 'read-only', array['/w', null]);
    insert into probe values (5, 'NULL in der Wurzelliste', '23514', 'ANGENOMMEN', '-');
  exception when others then
    get stacked diagnostics s = returned_sqlstate;
    insert into probe values (5, 'NULL in der Wurzelliste', '23514', s, '-');
  end;

  -- -------------------------------------------------------------------------
  -- 6. Nur die drei Langformen — `rw` ist die Kurzform der Kommandozeile
  -- -------------------------------------------------------------------------
  begin
    insert into pmh.user_profiles (user_id, dateizugriff)
    values ('00000000-0000-4000-8000-0000000000c6', 'rw');
    insert into probe values (6, 'Kurzform rw abgelehnt', '23514', 'ANGENOMMEN', '-');
  exception when others then
    get stacked diagnostics s = returned_sqlstate;
    insert into probe values (6, 'Kurzform rw abgelehnt', '23514', s, '-');
  end;

  -- -------------------------------------------------------------------------
  -- 7. Ein zweites Profil fuer denselben Benutzer
  -- -------------------------------------------------------------------------
  begin
    insert into pmh.user_profiles (user_id, dateizugriff)
    values ('00000000-0000-4000-8000-0000000000c1', 'none');
    insert into probe values (7, 'zweites Profil fuer denselben Benutzer', '23505', 'ANGENOMMEN', '-');
  exception when others then
    get stacked diagnostics s = returned_sqlstate;
    insert into probe values (7, 'zweites Profil fuer denselben Benutzer', '23505', s, '-');
  end;

  -- -------------------------------------------------------------------------
  -- 8. Ein Profil ohne Benutzer
  -- -------------------------------------------------------------------------
  begin
    insert into pmh.user_profiles (user_id, dateizugriff)
    values ('00000000-0000-4000-8000-0000000000ff', 'none');
    insert into probe values (8, 'Profil ohne Benutzer', '23503', 'ANGENOMMEN', '-');
  exception when others then
    get stacked diagnostics s = returned_sqlstate;
    insert into probe values (8, 'Profil ohne Benutzer', '23503', s, '-');
  end;

  -- -------------------------------------------------------------------------
  -- 9. Die Vorgabewerte: ein neuer Benutzer startet ohne Netz und ohne Prozesse
  -- -------------------------------------------------------------------------
  begin
    insert into pmh.users (id, email, display_name)
    values ('00000000-0000-4000-8000-0000000000c7', 'vorgabe@probe.invalid', 'Vorgabe');
    insert into pmh.user_profiles (user_id, dateizugriff)
    values ('00000000-0000-4000-8000-0000000000c7', 'none');
    insert into probe
    select 9, 'Vorgaben ohne Netz und ohne Prozesse', 'netz=f+prozesse=f+wurzeln=0',
           'netz=' || case when netz then 't' else 'f' end
           || '+prozesse=' || case when prozesse then 't' else 'f' end
           || '+wurzeln=' || (cardinality(lesewurzeln) + cardinality(schreibwurzeln))::text,
           '-'
      from pmh.user_profiles where user_id = '00000000-0000-4000-8000-0000000000c7';
  exception when others then
    get stacked diagnostics s = returned_sqlstate;
    insert into probe values (9, 'Vorgaben ohne Netz und ohne Prozesse', 'netz=f+prozesse=f+wurzeln=0', 'FEHLER', s);
  end;

  -- -------------------------------------------------------------------------
  -- 10. Den Benutzer loeschen nimmt das Profil mit (ON DELETE CASCADE)
  -- -------------------------------------------------------------------------
  begin
    delete from pmh.users where id = '00000000-0000-4000-8000-0000000000c1';
    insert into probe
    select 10, 'Benutzer loeschen nimmt das Profil mit', 'profil_weg=1',
           'profil_weg=' || case when count(*) = 0 then '1' else '0' end, '-'
      from pmh.user_profiles where user_id = '00000000-0000-4000-8000-0000000000c1';
  exception when others then
    get stacked diagnostics s = returned_sqlstate;
    insert into probe values (10, 'Benutzer loeschen nimmt das Profil mit', 'profil_weg=1', 'FEHLER', s);
  end;
end $$;

select nr, was, erwartet, ist,
       case when erwartet = ist then 'ok' else 'ABWEICHUNG' end as befund,
       zusatz as sqlstate
  from probe
 order by nr;

do $$
declare
  v_gesamt int;
  v_abweichungen int;
begin
  select count(*), count(*) filter (where erwartet <> ist) into v_gesamt, v_abweichungen from probe;
  if v_gesamt <> 10 then
    raise exception 'PROBE UNBRAUCHBAR: % Zeilen statt 10 — es wurde nicht alles geprueft', v_gesamt;
  end if;
  if v_abweichungen = 0 then
    raise notice 'PROBE BESTANDEN: 10 von 10 Faellen wie erwartet (4 Regeln des Dienstes, Primaerschluessel, Fremdschluessel, Vorgaben, CASCADE)';
  else
    raise exception 'PROBE GESCHEITERT: % von % Faellen weichen ab', v_abweichungen, v_gesamt;
  end if;
end $$;

rollback;
