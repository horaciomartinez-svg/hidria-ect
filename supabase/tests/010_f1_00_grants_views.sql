-- F1-00 — pgTAP: grants DML, banco de preguntas y security_invoker
-- Ejecutar con `supabase test db` (requiere pgTAP en el entorno de pruebas).
begin;

select plan(21);

select ok(has_table_privilege('authenticated','public.organizations','SELECT'),
  'authenticated puede intentar SELECT en organizations (RLS decide filas)');
select ok(not has_table_privilege('authenticated','public.quiz_questions','SELECT'),
  'authenticated NO tiene SELECT en quiz_questions cruda');
select ok(has_table_privilege('authenticated','public.v_quiz_questions','SELECT'),
  'authenticated SI tiene SELECT en v_quiz_questions');
select ok(not has_table_privilege('authenticated','public.v_quiz_questions','INSERT'),
  'SEC-PR4-01: authenticated NO tiene INSERT en v_quiz_questions');
select ok(not has_table_privilege('authenticated','public.v_quiz_questions','UPDATE'),
  'SEC-PR4-01: authenticated NO tiene UPDATE en v_quiz_questions');
select ok(not has_table_privilege('authenticated','public.v_quiz_questions','DELETE'),
  'SEC-PR4-01: authenticated NO tiene DELETE en v_quiz_questions');
select ok(not exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='v_quiz_questions' and column_name='correcta'
), 'v_quiz_questions no expone la columna correcta');
select ok(not has_table_privilege('anon','public.organizations','SELECT'),
  'anon no tiene acceso a tablas de negocio');
select ok(has_table_privilege('service_role','public.quiz_questions','SELECT'),
  'service_role puede administrar quiz_questions');
select ok(has_table_privilege('service_role','public.audit_log','INSERT'),
  'service_role puede insertar auditoria');
select ok(not has_table_privilege('service_role','public.audit_log','UPDATE'),
  'audit_log append-only: service_role no puede UPDATE');
select ok(not has_table_privilege('authenticated','public.api_idempotency','SELECT'),
  'api_idempotency solo para service_role');

select is((select reloptions from pg_class where oid='public.v_bhe_monthly'::regclass),
  ARRAY['security_invoker=true']::text[], 'v_bhe_monthly es security_invoker');
select is((select reloptions from pg_class where oid='public.v_bhe_summary'::regclass),
  ARRAY['security_invoker=true']::text[], 'v_bhe_summary es security_invoker');
select is((select reloptions from pg_class where oid='public.v_quiz_questions'::regclass),
  NULL::text[], 'v_quiz_questions sigue definer (sin security_invoker)');
select ok(has_function_privilege('authenticated','public.is_tenant_member(uuid)','EXECUTE'),
  'authenticated puede ejecutar el helper de RLS is_tenant_member');

-- SEC-PR4-01: la vista auto-actualizable ya no permite DML a authenticated.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","tenant_id":"11111111-1111-4111-8111-111111111111","role":"authenticated","global_role":"invitado"}';
select throws_ok($sql$
  update public.v_quiz_questions set pregunta = pregunta where false
$sql$, '42501', NULL, 'UPDATE v_quiz_questions como authenticated => 42501');
select throws_ok($sql$
  delete from public.v_quiz_questions where false
$sql$, '42501', NULL, 'DELETE v_quiz_questions como authenticated => 42501');
reset role;
reset request.jwt.claims;

-- SEC-PR4-01 (guarda CI): ninguna de las 5 vistas restantes permite DML inerte.
select ok(not exists (
  select 1 from pg_class c
  where c.oid = any (array[
    'public.v_bhe_monthly'::regclass, 'public.v_bhe_summary'::regclass,
    'public.v_balance_indicators'::regclass, 'public.v_ivoh_score'::regclass,
    'public.v_diagnostic_completeness'::regclass
  ])
  and (
    has_table_privilege('authenticated', c.oid, 'INSERT')
    or has_table_privilege('authenticated', c.oid, 'UPDATE')
    or has_table_privilege('authenticated', c.oid, 'DELETE')
  )
), 'SEC-PR4-01: las 5 vistas no tienen DML para authenticated');

select ok(not exists (
  select 1 from pg_class c
  where c.oid = any (array[
    'public.v_bhe_monthly'::regclass, 'public.v_bhe_summary'::regclass,
    'public.v_balance_indicators'::regclass, 'public.v_ivoh_score'::regclass,
    'public.v_diagnostic_completeness'::regclass
  ])
  and (
    has_table_privilege('service_role', c.oid, 'INSERT')
    or has_table_privilege('service_role', c.oid, 'UPDATE')
    or has_table_privilege('service_role', c.oid, 'DELETE')
  )
), 'SEC-PR4-01: las 5 vistas no tienen DML para service_role');

select ok(current_setting('server_version_num')::int >= 160000,
  'PG >= 16: requisito documentado para REVOKE MAINTAIN');

select * from finish();
rollback;
