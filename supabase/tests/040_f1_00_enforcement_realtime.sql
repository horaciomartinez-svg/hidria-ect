-- F1-00 — pgTAP: H-5 enforcement (F6 6/6, custodia firmada, vigente único),
--          auth hook y Realtime (políticas + publicación)
begin;

select plan(15);

insert into public.organizations (id, name, org_type)
values ('11111111-1111-4111-8111-111111111111','Org pgTAP H5','srhds');
insert into public.companies (id, organization_id, razon_social, nombre_planta, giro,
  calle, colonia_parque, cp, municipio, organismo_operador)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',
  'Empresa H5','Planta','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into auth.users (id, aud, role, email, created_at, updated_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','authenticated','authenticated',
  'h5@example.invalid', now(), now());
insert into public.profiles (user_id, organization_id, full_name, email, global_role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
  'Usuario H5','h5@example.invalid','equipo');
insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio,
  fecha_fin, fase_actual, cat_estado, index_version_id)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','inicial','2026-01-01','2026-02-12',5,
  'validado_r2','00000000-0000-4000-8000-0000000000a1');
insert into public.project_members (diagnostic_id, user_id, organization_id, role)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111','equipo');
insert into public.document_checklist_items (diagnostic_id, item_code, estado)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','layout','validado_r1');
insert into public.water_balances (id, organization_id, diagnostic_id, periodo_anio,
  mes_inicio, estado)
values ('12121212-1212-4212-8212-121212121212','11111111-1111-4111-8111-111111111111',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',2026,1,'validado_r3');
insert into public.ivoh_evaluations (diagnostic_id, factor_code, version_id, puntaje,
  justificacion, evidencia, estado)
select 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid, f,
  '00000000-0000-4000-8000-0000000000a1'::uuid, 7, 'sintetica', '[]'::jsonb, 'validado_r4'
from unnest(array['F1','F2','F3','F4','F5']) f;

select throws_ok($sql$
  update public.diagnostics set fase_actual=6 where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
$sql$, 'P0001', 'Gate F6.*', 'F6 bloquea con 5/6 factores IVOH');

insert into public.ivoh_evaluations (diagnostic_id, factor_code, version_id, puntaje,
  justificacion, evidencia, estado)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','F6',
  '00000000-0000-4000-8000-0000000000a1',7,'sintetica','[]'::jsonb,'validado_r4');
select lives_ok($sql$
  update public.diagnostics set fase_actual=6 where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
$sql$, 'F6 permite avanzar con 6/6 factores IVOH');

-- Custodia: 3 transferencias con firma vacía no habilitan dictamen
insert into public.samples (id, organization_id, diagnostic_id, codigo, punto,
  tipo_muestra, params_solicitados, acreditacion_ema, estado)
values ('23232323-2323-4232-8232-232323232323','11111111-1111-4111-8111-111111111111',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','MDOHI-T-M1','descarga_final','simple',
  '[]'::jsonb,false,'resultados_recibidos');
insert into public.custody_transfers (sample_id, secuencia, etapa, person_name,
  person_role, person_org, ts, firma)
values
 ('23232323-2323-4232-8232-232323232323',1,'muestreo','P1','muestreador','Org','2026-01-01T10:00:00Z',''),
 ('23232323-2323-4232-8232-232323232323',2,'entrega','P2','transportista','Org','2026-01-01T11:00:00Z',' '),
 ('23232323-2323-4232-8232-232323232323',3,'recepcion','P3','laboratorio','Lab','2026-01-01T12:00:00Z','');
select throws_ok($sql$
  insert into public.lab_results (sample_id, param_code, valor, unidad, dictamen)
  values ('23232323-2323-4232-8232-232323232323','DQO',12.5,'mg/L',true)
$sql$, 'P0001', 'Dictamen bloqueado.*', 'sin firmas no hay dictamen');
update public.custody_transfers set firma='firma-sintetica'
 where sample_id='23232323-2323-4232-8232-232323232323';
select lives_ok($sql$
  insert into public.lab_results (sample_id, param_code, valor, unidad, dictamen)
  values ('23232323-2323-4232-8232-232323232323','DQO',12.5,'mg/L',true)
$sql$, 'con 3 firmas el dictamen procede');

-- M-06: RPC de rol/membresía para service_role (equivalente a las de auth.uid())
select ok(not has_function_privilege('authenticated','public.fn_diag_role(uuid,uuid)','EXECUTE'),
  'authenticated no puede ejecutar fn_diag_role');
select ok(has_function_privilege('service_role','public.fn_diag_role(uuid,uuid)','EXECUTE'),
  'service_role puede ejecutar fn_diag_role');
select is(public.fn_diag_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), 'equipo',
  'fn_diag_role devuelve el rol del miembro');
select is(public.fn_diag_role('99999999-9999-4999-8999-999999999999',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), NULL::text,
  'fn_diag_role devuelve NULL si el usuario no es miembro');
select is(public.fn_is_diag_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), true,
  'fn_is_diag_member devuelve true para un miembro');
select is(public.fn_is_diag_member('99999999-9999-4999-8999-999999999999',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), false,
  'fn_is_diag_member devuelve false para un no miembro');

-- H-5: una sola versión vigente del índice IVOH
select throws_ok($sql$
  insert into public.ivoh_index_versions (version, vigente, fecha_aprobacion)
  values (2, true, now())
$sql$, '23505', NULL, 'una segunda versión vigente es rechazada');

-- Auth hook: claims organization_id + tenant_id + global_role
select is(
  (select public.custom_access_token_hook(jsonb_build_object(
    'user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'claims',jsonb_build_object('sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','role','authenticated'),
    'authentication_method','password')) -> 'claims' ->> 'global_role'),
  'equipo', 'el hook emite global_role desde profiles');
select is(
  (select public.custom_access_token_hook(jsonb_build_object(
    'user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'claims',jsonb_build_object('sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','role','authenticated'),
    'authentication_method','password')) -> 'claims' ->> 'organization_id'),
  (select public.custom_access_token_hook(jsonb_build_object(
    'user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'claims',jsonb_build_object('sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','role','authenticated'),
    'authentication_method','password')) -> 'claims' ->> 'tenant_id'),
  'el hook emite organization_id y tenant_id con el mismo UUID');

-- Realtime: políticas y publicación
select is((select count(*) from pg_policies
  where schemaname='realtime' and tablename='messages' and policyname like 'hidria_rt_%'),
  3::bigint, 'existen 3 políticas de canales privados');
select ok((select count(*) from pg_publication_tables where pubname='supabase_realtime') >= 5,
  'supabase_realtime publica las tablas de eventos');

select * from finish();
rollback;
