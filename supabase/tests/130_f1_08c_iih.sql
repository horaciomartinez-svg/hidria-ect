-- F1-08c — pgTAP: IIH M5, RLS/guard y RPC import EF-09.
begin;
select plan(16);

select is((select count(*) from public.iih_stages), 6::bigint, '6 etapas IIH');
select ok((select count(*) from public.iih_asset_types) >= 6, 'catálogo de tipos IIH');

insert into public.organizations (id,name,org_type) values
  ('a9000000-0000-4000-8000-0000000000a1','Org IIH A','srhds'),
  ('a9000000-0000-4000-8000-0000000000b1','Org IIH B','empresa');
insert into auth.users (id,aud,role,email,created_at,updated_at) values
  ('c9000000-0000-4000-8000-000000000001','authenticated','authenticated','coord108@example.invalid',now(),now()),
  ('c9000000-0000-4000-8000-000000000002','authenticated','authenticated','equipo108@example.invalid',now(),now()),
  ('c9000000-0000-4000-8000-000000000003','authenticated','authenticated','empresa108@example.invalid',now(),now()),
  ('c9000000-0000-4000-8000-000000000004','authenticated','authenticated','obs108@example.invalid',now(),now());
insert into public.profiles (user_id,organization_id,full_name,email,global_role) values
  ('c9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-0000000000a1','Coord 108','coord108@example.invalid','coordinador_srhds'),
  ('c9000000-0000-4000-8000-000000000002','a9000000-0000-4000-8000-0000000000a1','Equipo 108','equipo108@example.invalid','equipo'),
  ('c9000000-0000-4000-8000-000000000003','a9000000-0000-4000-8000-0000000000a1','Empresa 108','empresa108@example.invalid','empresa'),
  ('c9000000-0000-4000-8000-000000000004','a9000000-0000-4000-8000-0000000000a1','Obs 108','obs108@example.invalid','observador');
insert into public.companies (id,organization_id,razon_social,nombre_planta,giro,calle,colonia_parque,cp,municipio,organismo_operador) values
  ('b9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-0000000000a1','Empresa IIH','Planta IIH','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into public.diagnostics (id,organization_id,company_id,tipo,fecha_inicio,fecha_fin,index_version_id) values
  ('d9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-0000000000a1','b9000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1'),
  ('d9000000-0000-4000-8000-000000000002','a9000000-0000-4000-8000-0000000000b1','b9000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1');
insert into public.project_members (diagnostic_id,user_id,organization_id,role) values
  ('d9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-0000000000a1','coordinador'),
  ('d9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000002','a9000000-0000-4000-8000-0000000000a1','equipo'),
  ('d9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000003','a9000000-0000-4000-8000-0000000000a1','empresa'),
  ('d9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000004','a9000000-0000-4000-8000-0000000000a1','observador');
insert into public.documents (id,organization_id,diagnostic_id,doc_type,title,r2_key,sha256,mime,size_bytes,uploaded_by) values
  ('e9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-0000000000a1','d9000000-0000-4000-8000-000000000001','otro','iih.xlsx','org/a/diag/d/iih.xlsx',repeat('a',64),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',10,'c9000000-0000-4000-8000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"c9000000-0000-4000-8000-000000000001","organization_id":"a9000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select lives_ok($sql$
  insert into public.iih_assets (organization_id,diagnostic_id,stage_code,asset_type_id,tag,ubicacion,estado_fisico,opera,criticidad,intervencion,prioridad)
  select 'a9000000-0000-4000-8000-0000000000a1','d9000000-0000-4000-8000-000000000001','CAP',id,'T108','U','bueno','si','alta','ninguna','media'
  from public.iih_asset_types where stage_code='CAP' order by id limit 1
$sql$, 'coordinador crea activo IIH');
select ok((select folio like 'CAP-%' from public.iih_assets where tag='T108'), 'folio server-side CAP-*');
select is((select verificado_v1 from public.iih_assets where tag='T108'), false, 'verificado_v1 inicia false');
select ok((select count(*) from public.audit_log where entity='iih_assets' and action='create') > 0, 'auditoría DB IIH');

select throws_ok($sql$
  insert into public.iih_assets (organization_id,diagnostic_id,stage_code,asset_type_id,tag,ubicacion,estado_fisico,opera,criticidad,intervencion,prioridad)
  select 'a9000000-0000-4000-8000-0000000000b1','d9000000-0000-4000-8000-000000000001','CAP',id,'T108B','U','bueno','si','alta','ninguna','media'
  from public.iih_asset_types where stage_code='CAP' order by id limit 1
$sql$, '42501', NULL, 'organization_id de otro tenant rechazado');
select throws_ok($sql$
  update public.iih_assets set organization_id='a9000000-0000-4000-8000-0000000000b1' where tag='T108'
$sql$, '42501', NULL, 'organization_id inmutable');

set local request.jwt.claims = '{"sub":"c9000000-0000-4000-8000-000000000003","organization_id":"a9000000-0000-4000-8000-0000000000a1","global_role":"empresa"}';
select throws_ok($sql$
  insert into public.iih_assets (organization_id,diagnostic_id,stage_code,asset_type_id,tag,ubicacion,estado_fisico,opera,criticidad,intervencion,prioridad)
  select 'a9000000-0000-4000-8000-0000000000a1','d9000000-0000-4000-8000-000000000001','CAP',id,'T108C','U','bueno','si','alta','ninguna','media'
  from public.iih_asset_types where stage_code='CAP' order by id limit 1
$sql$, '42501', NULL, 'empresa no escribe IIH');

set local role service_role;
select ok(has_function_privilege('service_role','public.fn_import_iih_assets(uuid,uuid,uuid,jsonb,text,text,text)','EXECUTE'), 'ACL service_role import');
select ok(not has_function_privilege('authenticated','public.fn_import_iih_assets(uuid,uuid,uuid,jsonb,text,text,text)','EXECUTE'), 'ACL authenticated sin import');
select is((public.fn_import_iih_assets('c9000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('stage_code','CAP','asset_type_id',(select id from public.iih_asset_types where stage_code='CAP' order by id limit 1),'tag','IMP1','ubicacion','U','estado_fisico','bueno','opera','si','criticidad','alta','intervencion','ninguna','prioridad','media'),
    jsonb_build_object('stage_code','CAP','asset_type_id',(select id from public.iih_asset_types where stage_code='CAP' order by id limit 1),'tag','IMP2','ubicacion','U','estado_fisico','malo','opera','si','criticidad','alta','intervencion','ninguna','prioridad','media')
  ), repeat('a',64)))->'data'->>'filas_ok', '1', 'import inserta válidas y rechaza inválidas');
select is((select count(*) from public.iih_assets where tag in ('IMP1','IMP2')), 1::bigint, 'solo fila válida insertada');
select is((public.fn_import_iih_assets('c9000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('stage_code','CAP','asset_type_id',(select id from public.iih_asset_types where stage_code='CAP' order by id limit 1),'tag','IMP3','ubicacion','U','estado_fisico','bueno','opera','si','criticidad','alta','intervencion','ninguna','prioridad','media')), repeat('a',64),'iih-1','iih-h1'))->>'ok', 'true', 'import idempotente');
select is((public.fn_import_iih_assets('c9000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('stage_code','CAP','asset_type_id',(select id from public.iih_asset_types where stage_code='CAP' order by id limit 1),'tag','IMP3','ubicacion','U','estado_fisico','bueno','opera','si','criticidad','alta','intervencion','ninguna','prioridad','media')), repeat('a',64),'iih-1','iih-h1'))->>'replayed', 'true', 'import replay');
select is((public.fn_import_iih_assets('c9000000-0000-4000-8000-000000000004','d9000000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000001','[]'::jsonb))->>'code', 'FORBIDDEN_ROLE', 'observador no importa');

reset role;
reset request.jwt.claims;
select * from finish();
rollback;
