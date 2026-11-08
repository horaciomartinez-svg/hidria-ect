-- F1-00 — pgTAP: M-01 idempotencia y M-02 auditoría encadenada
begin;

select plan(9);

insert into public.organizations (id, name, org_type)
values ('11111111-1111-4111-8111-111111111111','Org pgTAP','srhds');
insert into public.companies (id, organization_id, razon_social, nombre_planta, giro,
  calle, colonia_parque, cp, municipio, organismo_operador)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',
  'Empresa pgTAP','Planta','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into auth.users (id, aud, role, email, created_at, updated_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','authenticated','authenticated',
  'pg@example.invalid', now(), now());
insert into public.profiles (user_id, organization_id, full_name, email, global_role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
  'Usuario pgTAP','pg@example.invalid','equipo');
insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio,
  fecha_fin, index_version_id)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','inicial','2026-01-01','2026-02-12',
  '00000000-0000-4000-8000-0000000000a1');

-- M-01: unicidad (user_id, endpoint, key) bajo reintento
insert into public.api_idempotency (user_id, endpoint, key, request_hash)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','/x','11111111-1111-4111-8111-111111111111','h')
on conflict do nothing;
insert into public.api_idempotency (user_id, endpoint, key, request_hash)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','/x','11111111-1111-4111-8111-111111111111','h')
on conflict do nothing;
select is((select count(*) from public.api_idempotency), 1::bigint,
  'reintento con la misma Idempotency-Key deja una sola fila');

-- M-02: fn_audit_write devuelve hash y encadena
select ok(length(public.fn_audit_write('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'create','diagnostics','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','{"idempotency_key":"k"}'::jsonb)) = 64,
  'fn_audit_write devuelve un hash SHA-256 hexadecimal');
select is((select count(*) from public.audit_log), 1::bigint,
  'fn_audit_write inserta una fila de auditoría');
select is((select prev_hash from public.audit_log order by id limit 1), 'GENESIS',
  'la primera fila de auditoría arranca en GENESIS');
select lives_ok($sql$
  insert into public.audit_log (user_id, action, entity, entity_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','reject','x','y')
$sql$, 'action reject aceptada (rechazos auditados)');
select throws_ok($sql$
  insert into public.audit_log (action, entity, entity_id) values ('accion_invalida','x','y')
$sql$, '23514', NULL, 'action fuera del CHECK es rechazada');
select is((select count(distinct prev_hash) from public.audit_log), 2::bigint,
  'cada fila tiene prev_hash distinto (cadena lineal)');
select ok(not has_table_privilege('authenticated','public.api_idempotency','SELECT'),
  'authenticated no puede leer api_idempotency');
select ok(has_function_privilege('service_role','public.fn_audit_write(uuid,text,text,text,jsonb)','EXECUTE'),
  'service_role puede ejecutar fn_audit_write');

select * from finish();
rollback;
