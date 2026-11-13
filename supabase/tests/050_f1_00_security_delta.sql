-- F1-00 — pgTAP delta de seguridad (SEC-PR4-02 / SEC-PR4-05/06)
-- Regresión: invitado/observador no pueden INSERTAR en las 7 tablas con
-- WITH CHECK corregido; un coordinador no puede elevar un perfil a admin;
-- el aislamiento multi-tenant A/B se mantiene.
begin;

select plan(34);

insert into public.organizations (id, name, org_type) values
  ('11111111-1111-4111-8111-111111111111','Org Sec A','srhds'),
  ('22222222-2222-4222-8222-222222222222','Org Sec B','empresa');
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','authenticated','authenticated','inv@example.invalid',now(),now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','authenticated','authenticated','obs@example.invalid',now(),now()),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','authenticated','authenticated','coord@example.invalid',now(),now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','authenticated','authenticated','new@example.invalid',now(),now()),
  ('abababab-abab-4bab-8bab-abababababab','authenticated','authenticated','admin@example.invalid',now(),now()),
  ('efefefef-efef-4efe-8efe-efefefefefef','authenticated','authenticated','empresa@example.invalid',now(),now());
insert into public.profiles (user_id, organization_id, full_name, email, global_role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Invitado','inv@example.invalid','invitado'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','Observador','obs@example.invalid','observador'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111','Coordinador','coord@example.invalid','coordinador_srhds'),
  ('abababab-abab-4bab-8bab-abababababab','11111111-1111-4111-8111-111111111111','Admin','admin@example.invalid','admin_institucional'),
  ('efefefef-efef-4efe-8efe-efefefefefef','11111111-1111-4111-8111-111111111111','Empresa','empresa@example.invalid','empresa');
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
select lives_ok($sql$
  insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio,
    fecha_fin, index_version_id, fase_actual, folio)
  values ('acacacac-acac-4cac-8cac-acacacacacac','11111111-1111-4111-8111-111111111111',
    '12121212-1212-4212-8212-121212121212','inicial','2026-01-01','2026-02-12',
    '00000000-0000-4000-8000-0000000000a1',1,'MDOHI-FAKE-999')
$sql$, 'coordinador SÍ puede INSERTAR diagnostics fase 1 (RES-1)');
select ok(
  (select folio from public.diagnostics where id='acacacac-acac-4cac-8cac-acacacacacac')
    ~ '^MDOHI-[0-9]{4}-[0-9]{3}$'
  and (select folio from public.diagnostics where id='acacacac-acac-4cac-8cac-acacacacacac')
    <> 'MDOHI-FAKE-999',
  'folio server-side: el folio inyectado se sobrescribe');
select throws_ok($sql$
  insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio,
    fecha_fin, index_version_id, fase_actual, estado, avance_pct, cat_estado,
    bitacora_cerrada, ivoh_actual, brecha_pct, semaforo_atraso, reporte_document_id)
  values ('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0','11111111-1111-4111-8111-111111111111',
    '12121212-1212-4212-8212-121212121212','inicial','2026-01-01','2026-02-12',
    '00000000-0000-4000-8000-0000000000a1',6,'reportado',100,'validado_r2',
    true,9.9,99.0,'rojo','11111111-1111-4111-8111-111111111111')
$sql$, '42501', NULL, 'INSERT con estado inicial inyectado rechazado');
select throws_ok($sql$
  insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio,
    fecha_fin, index_version_id, fase_actual)
  values ('adadadad-adad-4dad-8dad-adadadadadad','11111111-1111-4111-8111-111111111111',
    '12121212-1212-4212-8212-121212121212','inicial','2026-01-01','2026-02-12',
    '00000000-0000-4000-8000-0000000000a1',2)
$sql$, '42501', NULL, 'INSERT diagnostics fase 2 rechazado (no saltar gates)');
select throws_ok($sql$
  insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio,
    fecha_fin, index_version_id, fase_actual)
  values ('aeaeaeae-aeae-4eae-8eae-aeaeaeaeaeae','11111111-1111-4111-8111-111111111111',
    '12121212-1212-4212-8212-121212121212','inicial','2026-01-01','2026-02-12',
    '00000000-0000-4000-8000-0000000000a1',6)
$sql$, '42501', NULL, 'INSERT diagnostics fase 6 rechazado (no saltar gates)');
select throws_ok($sql$
  insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio,
    fecha_fin, index_version_id, fase_actual)
  values ('afafafaf-afaf-4faf-8faf-afafafafafaf','11111111-1111-4111-8111-111111111111',
    '13131313-1313-4313-8313-131313131313','inicial','2026-01-01','2026-02-12',
    '00000000-0000-4000-8000-0000000000a1',1)
$sql$, '42501', NULL, 'INSERT diagnostics con company de otro tenant rechazado');
select throws_ok($sql$
  update public.diagnostics set fase_actual=6
   where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
$sql$, 'P0001', 'Gate F2: la lista de cotejo (layout) no está validada en R1.',
  'UPDATE a fase 6 desde fase 1: gate F2 bloquea');
select throws_ok($sql$
  update public.diagnostics set folio='MDOHI-FAKE-999'
   where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
$sql$, '42501', NULL, 'UPDATE de folio rechazado (folio inmutable, task-59)');
select throws_ok($sql$
  update public.diagnostics set estado='reportado',
    reporte_document_id='11111111-1111-4111-8111-111111111111',
    bitacora_cerrada=true, avance_pct=100, cat_estado='validado_r2'
   where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
$sql$, '42501', NULL, 'UPDATE de estado/reporte/bitácora/avance/cat rechazado');
select lives_ok($sql$
  update public.diagnostics set fecha_fin='2026-03-01'
   where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
$sql$, 'UPDATE de campo no-gate sigue permitido');
select throws_ok($sql$
  update public.diagnostics set semaforo_atraso='rojo'
   where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
$sql$, '42501', NULL, 'UPDATE semaforo_atraso rechazado (campo de gate)');
select throws_ok($sql$
  update public.diagnostics set ivoh_actual=5.0
   where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
$sql$, '42501', NULL, 'UPDATE ivoh_actual rechazado (campo de gate)');
select throws_ok($sql$
  update public.diagnostics set brecha_pct=10.0
   where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
$sql$, '42501', NULL, 'UPDATE brecha_pct rechazado (campo de gate)');
select throws_ok($sql$
  update public.diagnostics set proximo_hito='2026-04-01'
   where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
$sql$, '42501', NULL, 'UPDATE proximo_hito rechazado (campo de gate)');
select throws_ok($sql$
  update public.diagnostics set reprogramacion_justificacion='cambio'
   where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
$sql$, '42501', NULL, 'UPDATE reprogramacion_justificacion rechazado (campo de gate)');
with upd as (
  update public.profiles set full_name='Admin cambiado'
   where user_id='abababab-abab-4bab-8bab-abababababab' returning 1
)
select is((select count(*) from upd), 0::bigint,
  'coordinador no puede UPDATE perfil admin_institucional');
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

-- Positivo con el otro rol autorizado: equipo.
set local request.jwt.claims = '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","tenant_id":"11111111-1111-4111-8111-111111111111","role":"authenticated","global_role":"equipo"}';
select lives_ok($sql$
  insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio,
    fecha_fin, index_version_id, fase_actual)
  values ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2','11111111-1111-4111-8111-111111111111',
    '12121212-1212-4212-8212-121212121212','inicial','2026-01-01','2026-02-12',
    '00000000-0000-4000-8000-0000000000a1',1)
$sql$, 'equipo SÍ puede INSERTAR diagnostics fase 1');

-- Empresa: sin ownership definido en M2, queda fuera del INSERT (docs/01 §5).
set local request.jwt.claims = '{"sub":"efefefef-efef-4efe-8efe-efefefefefef","tenant_id":"11111111-1111-4111-8111-111111111111","role":"authenticated","global_role":"empresa"}';
select throws_ok($sql$
  insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio,
    fecha_fin, index_version_id, fase_actual)
  values ('eaeaeaea-eaea-4eae-8eae-eaeaeaeaeaea','11111111-1111-4111-8111-111111111111',
    '12121212-1212-4212-8212-121212121212','inicial','2026-01-01','2026-02-12',
    '00000000-0000-4000-8000-0000000000a1',1)
$sql$, '42501', NULL, 'empresa no puede INSERTAR diagnostics hasta M2 (ownership)');

-- Admin del tenant sí puede actualizar su propio perfil admin.
set local request.jwt.claims = '{"sub":"abababab-abab-4bab-8bab-abababababab","tenant_id":"11111111-1111-4111-8111-111111111111","role":"authenticated","global_role":"admin_institucional"}';
select lives_ok($sql$
  update public.profiles set full_name='Admin OK'
   where user_id='abababab-abab-4bab-8bab-abababababab'
$sql$, 'admin_institucional sí puede actualizar perfil admin');
select throws_ok($sql$
  insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio,
    fecha_fin, index_version_id, fase_actual)
  values ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1','11111111-1111-4111-8111-111111111111',
    '12121212-1212-4212-8212-121212121212','inicial','2026-01-01','2026-02-12',
    '00000000-0000-4000-8000-0000000000a1',1)
$sql$, '42501', NULL, 'admin_institucional no puede INSERTAR diagnostics (docs/01 §5)');

-- Sin regresión de aislamiento A/B: observador del tenant A solo ve A.
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","tenant_id":"11111111-1111-4111-8111-111111111111","role":"authenticated","global_role":"observador"}';
select is((select count(*) from public.diagnostics), 1::bigint,
  'observador del tenant A solo ve 1 diagnóstico (su membresía)');
select is((select count(*) from public.companies), 1::bigint,
  'observador del tenant A solo ve 1 empresa (la de su diagnóstico)');

-- DELETE de diagnostics sigue sujeto a my_diagnostic_role(id).
set local request.jwt.claims = '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","tenant_id":"11111111-1111-4111-8111-111111111111","role":"authenticated","global_role":"coordinador_srhds"}';
with del as (
  delete from public.diagnostics where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' returning 1
)
select is((select count(*) from del), 1::bigint,
  'coordinador puede DELETEAR diagnóstico de su tenant');

-- service_role (EF-01/EF-07) sí puede cambiar estado tras sus gates.
reset role;
reset request.jwt.claims;
set local role service_role;
select lives_ok($sql$
  update public.diagnostics set estado='validado'
   where id='acacacac-acac-4cac-8cac-acacacacacac'
$sql$, 'service_role puede actualizar estado (ruta EF)');
select throws_ok($sql$
  update public.diagnostics set folio='MDOHI-FAKE-999'
   where id='acacacac-acac-4cac-8cac-acacacacacac'
$sql$, '42501', NULL, 'service_role tampoco puede cambiar folio (SEC-PR26-01)');

reset role;
reset request.jwt.claims;
select * from finish();
rollback;
