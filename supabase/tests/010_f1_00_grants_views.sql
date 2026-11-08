-- F1-00 — pgTAP: grants DML, banco de preguntas y security_invoker
-- Ejecutar con `supabase test db` (requiere pgTAP en el entorno de pruebas).
begin;

select plan(12);

select ok(has_table_privilege('authenticated','public.organizations','SELECT'),
  'authenticated puede intentar SELECT en organizations (RLS decide filas)');
select ok(not has_table_privilege('authenticated','public.quiz_questions','SELECT'),
  'authenticated NO tiene SELECT en quiz_questions cruda');
select ok(has_table_privilege('authenticated','public.v_quiz_questions','SELECT'),
  'authenticated SI tiene SELECT en v_quiz_questions');
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

select * from finish();
rollback;
