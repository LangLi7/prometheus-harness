-- =============================================================================
-- Probe: **wirkt RLS — und was geschieht, wenn kein Mandant gesetzt ist?**
-- =============================================================================
--
-- ## Warum diese Probe existiert
--
-- `docs/status/mandantentrennung.md` §8 hält fest, daß Row Level Security
-- **aus** bleibt, und nennt den Grund: es gibt keinen Aufrufer, der
-- `pmh.user_id` setzt. RLS jetzt einzuschalten hieße, daß jede Abfrage **still
-- null Zeilen** liefert — der Fehler sähe aus wie „Tabelle leer" statt wie
-- „Zugriff verweigert".
--
-- Diese Probe prüft **beides**: daß RLS filtert, wenn ein Mandant gesetzt ist —
-- und **wie** es sich ohne Mandant verhält. Denn die Sorge aus §8 hängt an einer
-- einzigen Entscheidung, die im Policy-Ausdruck steckt:
--
--   using (user_id = current_setting('pmh.user_id', true)::uuid)   -- still 0 Zeilen
--   using (user_id = current_setting('pmh.user_id')::uuid)         -- LAUT: 42704
--
-- `missing_ok = true` (das zweite Argument) macht aus dem fehlenden Mandanten
-- **null** statt eines Fehlers — und `null` in einem `using` filtert **alles weg**.
-- Genau das ist der stille Fall. Die andere Form wirft
-- `42704 unrecognized configuration parameter` und ist damit **laut**.
--
-- ## Die Rollen — und die Falle, die man kennen muß
--
-- Gemessen am 14.10.2026:
--
--   pmh_admin     super=true   bypassrls=true    Umgeht RLS IMMER
--   pmh_app       super=false  bypassrls=false   Die Anwendungsrolle -- RLS GREIFT
--   pmh_owner     super=false  bypassrls=false   EIGENTUEMER aller 12 Tabellen
--
-- **Der Eigentümer umgeht RLS ebenfalls**, solange nicht `FORCE ROW LEVEL
-- SECURITY` gesetzt ist. Wer die Probe als `pmh_owner` fährt, sieht **alle**
-- Zeilen und hält das für „RLS wirkt nicht". Das ist der Grund, warum die
-- Anwendungsrolle `pmh_app` **nicht** die Eigentümerin ist — eine bewußte,
-- richtige Entscheidung des Schema-Autors.
--
-- ## Was diese Probe NICHT tut
--
-- Sie schaltet RLS **nicht dauerhaft** ein. Alles geschieht in **einer**
-- Transaktion und wird **zurückgerollt**. Nach dem Lauf ist der Bestand
-- unverändert: `rls=false`, `0` Policies.
--
-- Aufruf:
--   Get-Content packages/auth/db-schema/tests/fixtures/rls-behavior.sql -Raw |
--     docker exec -i pmh-postgres psql -U pmh_admin -d pmh -v ON_ERROR_STOP=1
--
-- =============================================================================

\set ON_ERROR_STOP on
\pset tuples_only on

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Die zwei Mandanten aus dem Bestand holen — nicht erfinden.
-- -----------------------------------------------------------------------------
select user_id::text as mandant_a
  from pmh.chats group by user_id order by count(*) desc limit 1 \gset
select user_id::text as mandant_b
  from pmh.chats where user_id::text <> :'mandant_a' group by user_id limit 1 \gset

select count(*) as gesamt from pmh.chats \gset
select count(*) as nur_a from pmh.chats where user_id::text = :'mandant_a' \gset
select count(*) as nur_b from pmh.chats where user_id::text = :'mandant_b' \gset

\echo ''
\echo '== 0. Der Bestand, gegen den gemessen wird =='
select 'Chats gesamt: '||:gesamt||'  | Mandant A: '||:nur_a||'  | Mandant B: '||:nur_b||'  | A+B='||(:nur_a + :nur_b);

create temp table m (nr int, fall text, gemessen text);

-- -----------------------------------------------------------------------------
-- 1. RLS einschalten — in dieser Transaktion, mit Rücknahme.
-- -----------------------------------------------------------------------------
alter table pmh.chats enable row level security;
create policy chats_mandant on pmh.chats
  using (user_id = current_setting('pmh.user_id', true)::uuid);

\echo ''
\echo '== 1. Wer umgeht RLS? (die Falle) =='

-- Admin: Superuser, umgeht immer.
insert into m values (1, 'admin_ohne_mandant', (select count(*)::text from pmh.chats));

-- Eigentuemer ohne FORCE: Eigentuemer-Ausnahme.
set local role pmh_owner;
select count(*) as eigentuemer_ohne_force from pmh.chats \gset
reset role;
insert into m values (2, 'eigentuemer_ohne_force', :'eigentuemer_ohne_force');

-- Eigentuemer MIT FORCE: die Ausnahme faellt weg.
alter table pmh.chats force row level security;
set local role pmh_owner;
select count(*) as eigentuemer_mit_force from pmh.chats \gset
reset role;
insert into m values (3, 'eigentuemer_mit_force', :'eigentuemer_mit_force');

-- -----------------------------------------------------------------------------
-- 2. Die Anwendungsrolle — hier greift RLS.
-- -----------------------------------------------------------------------------
\echo ''
\echo '== 2. Die Anwendungsrolle pmh_app =='

set local role pmh_app;
select count(*) as app_ohne_mandant from pmh.chats \gset
select set_config('pmh.user_id', :'mandant_a', true) \gset
select count(*) as app_mit_a from pmh.chats \gset
select set_config('pmh.user_id', :'mandant_b', true) \gset
select count(*) as app_mit_b from pmh.chats \gset
reset role;

insert into m values (4, 'app_ohne_mandant', :'app_ohne_mandant');
insert into m values (5, 'app_mit_a', :'app_mit_a');
insert into m values (6, 'app_mit_b', :'app_mit_b');

select '  app ohne Mandant: '||:'app_ohne_mandant'||' Zeilen';
select '  app mit Mandant A: '||:'app_mit_a'||' Zeilen (erwartet '||:nur_a||')';
select '  app mit Mandant B: '||:'app_mit_b'||' Zeilen (erwartet '||:nur_b||')';

-- -----------------------------------------------------------------------------
-- 3. Die andere Policy-Form: der fehlende Mandant als LAUTER Fehler.
--    Rollenunabhaengig pruefbar, deshalb ohne Rollenwechsel.
-- -----------------------------------------------------------------------------
\echo ''
\echo '== 3. current_setting OHNE missing_ok — still oder laut? =='
do $probe$
declare
  zustand text;
  meldung text;
begin
  begin
    perform current_setting('pmh.user_id_gibt_es_nicht')::uuid;
    zustand := 'kein Fehler';
    meldung := '';
  exception when others then
    zustand := SQLSTATE;
    meldung := SQLERRM;
  end;
  raise notice '  ohne missing_ok -> % %', zustand, meldung;
end
$probe$;

-- -----------------------------------------------------------------------------
-- 4. Die Bewertung — sie WIRFT, damit der Exit-Code stimmt.
-- -----------------------------------------------------------------------------
\echo ''
\echo '== 4. Bewertung =='
do $probe$
declare
  fehler text := '';
  g bigint;
  n1 bigint;
  n2 bigint;
  n4 bigint;
  a bigint;
  b bigint;
begin
  select count(*) into g from pmh.chats;
  select gemessen::bigint into n1 from m where nr = 1;
  select gemessen::bigint into n2 from m where nr = 2;
  select gemessen::bigint into n4 from m where nr = 4;
  select gemessen::bigint into a  from m where nr = 5;
  select gemessen::bigint into b  from m where nr = 6;

  -- Der Superuser MUSS alles sehen (sonst stimmt das Modell nicht).
  if n1 <> g then
    fehler := fehler || E'\n  F1 admin (Superuser) sieht nur '||n1||' von '||g;
  end if;

  -- Der Eigentuemer ohne FORCE MUSS alles sehen (Eigentuemer-Ausnahme).
  if n2 <> g then
    fehler := fehler || E'\n  F2 Eigentuemer-Ausnahme fehlt: '||n2||' von '||g;
  end if;

  -- Ohne Mandant MUSS die Anwendungsrolle 0 Zeilen sehen (der stille Fall).
  if n4 <> 0 then
    fehler := fehler || E'\n  F3 ohne Mandant kamen '||n4||' Zeilen (erwartet 0)';
  end if;

  -- Mit Mandant darf nur der eigene Bestand kommen, und A+B muss das Ganze sein.
  if a + b <> g then
    fehler := fehler || E'\n  F4 A+B='||(a+b)||' ist nicht die Gesamtzahl '||g;
  end if;
  if a = 0 or b = 0 then
    fehler := fehler || E'\n  F5 ein Mandant sieht NICHTS (A='||a||', B='||b||')';
  end if;
  if a = g and b = g then
    fehler := fehler || E'\n  F6 beide Mandanten sehen ALLES - es wird nicht gefiltert';
  end if;

  if fehler <> '' then
    raise exception 'PROBE GESCHEITERT:%', fehler;
  end if;
end
$probe$;

-- -----------------------------------------------------------------------------
-- 5. Ausgabe und RUECKNAHME.
-- -----------------------------------------------------------------------------
\echo ''
select nr||'  '||rpad(fall, 24)||' '||gemessen from m order by nr;

ROLLBACK;

\echo ''
select 'Ruecknahme: rls='||relrowsecurity||', Policies='||
       (select count(*) from pg_policies where schemaname='pmh' and tablename='chats')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'pmh' and c.relname = 'chats';

\echo ''
\echo 'NOTICE:  PROBE BESTANDEN: RLS filtert je Mandant, ohne Mandant 0 Zeilen,'
\echo 'NOTICE:  und die Eigentuemer-Ausnahme ist gemessen.'
