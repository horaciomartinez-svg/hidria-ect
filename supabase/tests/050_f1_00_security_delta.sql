-- F1-00 — pgTAP delta de seguridad (SEC-PR4-02 / SEC-PR4-05/06)
-- Regresión: invitado/observador no pueden INSERTAR en las 7 tablas con
-- WITH CHECK corregido; un coordinador no puede elevar un perfil a admin;
-- el aislamiento multi-tenant A/B se mantiene.
begin;

select plan(11);

insert into public.organizations (id, name, org_type) values
  ('11111111-1111-4111-8111-111111111111','Org Sec A','srhds'),
  ('22222222-2222-4222-8222-222222222222','Org Sec B','empresa');
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','authenticated','authenticated','inv@example.invalid',now(),now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','authenticated','authenticated','obs@example.invalid',now(),now()),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','authenticated','authenticated','coord@example.invalid',now(),now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','authenticated','authenticated','new@example.invalid',now(),now());
insert into public.profiles (user_id, organization_id, full_name, email, global_role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Invitado','inv@example.invalid','invitado'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','Observador','obs@example.invalid','observador'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111','Coordinador','coord@example.invalid','coordinador_srhds');
insert into public.companies (id, organization_id, razon_social, nombre_planta, giro,
  calle, colonia_parque, cp, municipio, organismo_operador) values
  ('12121212-1212-4212-8212-121212121212','11111111-1111-4111-8111-111111111111','Empresa A','Planta A','manufacturera','Calle','Parque','87000','Victoria','COMAPA'),
  ('13131313-1313-4313-8313-131313131313','22222222-2222-4222-8222-222222222222','Empresa B','Planta B','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio,
  fecha_fin, index_version_id) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111','12121212-1212-4212-8212-121212121212','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff','22222222-2222-4222-8222-222222222222','13131313-1313-4313-8313-131313131313','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1');
insert into public.project_members (diagnostic_id, user_id, organization_id, role) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','observador'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111','coordinador');

set local role authenticated;

-- Invitado: no puede crear empresas/diagnósticos ni elevar su perfil.
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","tenant_id":"11111111-1111-4111-8111-111111111111","role":"authenticated","global_role":"invitado"}';
select throws_ok($sql$
  insert into public.companies (organization_id, razon_social, nombre_planta, giro,
    calle, colonia_parque, cp, municipio, organismo_operador)
  values ('11111111-1111-4111-8111-111111111111','Intruso','X','manufacturera',
    'C','P','87000','V','O')
$sql$, '42501', NULL, 'invitado no puede INSERTAR companies');
select throws_ok($sql$
  insert into public.diagnostics (organization_id, company_id, tipo, fecha_inicio,
    fecha_fin, index_version_id)
  values ('11111111-1111-4111-8111-111111111111','12121212-1212-4212-8212-121212121212',
    'inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1')
$sql$, '42501', NULL, 'invitado no puede INSERTAR diagnostics');
select throws_ok($sql$
  insert into public.profiles (user_id, organization_id, full_name, email, global_role)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',
    'Escalada','new@example.invalid','admin_institucional')
$sql$, '42501', NULL, 'invitado no puede INSERTAR profiles');

-- Observador: no puede INSERTAR documentos/activos/muestras/balances.
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","tenant_id":"11111111-1111-4111-8111-111111111111","role":"authenticated","global_role":"observador"}';
select throws_ok($sql$
  insert into public.documents (organization_id, diagnostic_id, doc_type, title,
    r2_key, sha256, mime, size_bytes, uploaded_by)
  values ('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'otro','Doc','org/sec02.pdf','abc','application/pdf',1,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
$sql$, '42501', NULL, 'observador no puede INSERTAR documents');
select throws_ok($sql$
  insert into public.iih_assets (organization_id, diagnostic_id, folio, stage_code,
    asset_type_id, tag, ubicacion, estado_fisico, opera, criticidad, intervencion, prioridad)
  values ('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'SEC02-CAP-01','CAP',(select id from public.iih_asset_types where stage_code='CAP' limit 1),
    'T','U','bueno','si','alta','ninguna','media')
$sql$, '42501', NULL, 'observador no puede INSERTAR iih_assets');
select throws_ok($sql$
  insert into public.samples (organization_id, diagnostic_id, codigo, punto,
    tipo_muestra, params_solicitados, acreditacion_ema, estado)
  values ('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'SEC02-M1','descarga_final','simple','[]'::jsonb,false,'planificada')
$sql$, '42501', NULL, 'observador no puede INSERTAR samples');
select throws_ok($sql$
  insert into public.water_balances (organization_id, diagnostic_id, periodo_anio, mes_inicio)
  values ('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',2026,1)
$sql$, '42501', NULL, 'observador no puede INSERTAR water_balances');

-- Coordinador: no puede elevar un perfil a admin; sí puede crear rol no-admin.
set local request.jwt.claims = '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","tenant_id":"11111111-1111-4111-8111-111111111111","role":"authenticated","global_role":"coordinador_srhds"}';
select throws_ok($sql$
  insert into public.profiles (user_id, organization_id, full_name, email, global_role)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',
    'Escalada coord','new@example.invalid','admin_institucional')
$sql$, '42501', NULL, 'coordinador no puede elevar un perfil a admin_institucional');
select lives_ok($sql$
  insert into public.profiles (user_id, organization_id, full_name, email, global_role)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',
    'Nuevo equipo','new@example.invalid','equipo')
$sql$, 'coordinador sí puede crear un perfil con rol no-admin');

-- Sin regresión de aislamiento A/B: observador del tenant A solo ve A.
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","tenant_id":"11111111-1111-4111-8111-111111111111","role":"authenticated","global_role":"observador"}';
select is((select count(*) from public.diagnostics), 1::bigint,
  'observador del tenant A solo ve 1 diagnóstico de A');
select is((select count(*) from public.companies), 1::bigint,
  'observador del tenant A solo ve 1 empresa de A');

reset role;
reset request.jwt.claims;
select * from finish();
rollback;
