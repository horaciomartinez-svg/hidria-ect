-- F1-09 task-142 â€” pgTAP: BHE views, guards, RPC EF-05/EF-09 y gate F5.
begin;
select plan(26);

insert into public.organizations (id,name,org_type) values
  ('aa000000-0000-4000-8000-0000000000a1','Org BHE A','srhds'),
  ('aa000000-0000-4000-8000-0000000000b1','Org BHE B','empresa');
insert into auth.users (id,aud,role,email,created_at,updated_at) values
  ('ca000000-0000-4000-8000-000000000001','authenticated','authenticated','coord109@example.invalid',now(),now()),
  ('ca000000-0000-4000-8000-000000000002','authenticated','authenticated','equipo109@example.invalid',now(),now()),
  ('ca000000-0000-4000-8000-000000000003','authenticated','authenticated','obs109@example.invalid',now(),now());
insert into public.profiles (user_id,organization_id,full_name,email,global_role) values
  ('ca000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-0000000000a1','Coord 109','coord109@example.invalid','coordinador_srhds'),
  ('ca000000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-0000000000a1','Equipo 109','equipo109@example.invalid','equipo'),
  ('ca000000-0000-4000-8000-000000000003','aa000000-0000-4000-8000-0000000000a1','Obs 109','obs109@example.invalid','observador');
insert into public.companies (id,organization_id,razon_social,nombre_planta,giro,calle,colonia_parque,cp,municipio,organismo_operador) values
  ('ba000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-0000000000a1','Empresa BHE','Planta BHE','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into public.diagnostics (id,organization_id,company_id,tipo,fecha_inicio,fecha_fin,fase_actual,cat_estado,index_version_id) values
  ('da000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-0000000000a1','ba000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',4,'validado_r2','00000000-0000-4000-8000-0000000000a1');
insert into public.project_members (diagnostic_id,user_id,organization_id,role) values
  ('da000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-0000000000a1','coordinador'),
  ('da000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-0000000000a1','equipo'),
  ('da000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000003','aa000000-0000-4000-8000-0000000000a1','observador');
insert into public.document_checklist_items (diagnostic_id,item_code,estado) values ('da000000-0000-4000-8000-000000000001','layout','validado_r1');
insert into public.iih_assets (organization_id,diagnostic_id,stage_code,asset_type_id,tag,ubicacion,estado_fisico,opera,criticidad,intervencion,prioridad,verificado_v1)
select 'aa000000-0000-4000-8000-0000000000a1','da000000-0000-4000-8000-000000000001','CAP',id,'BHE-CAP','U','bueno','si','alta','ninguna','media',true
from public.iih_asset_types where stage_code='CAP' order by id limit 1;
insert into public.logbook_entries (id,organization_id,diagnostic_id,clave,folio,responsable_sesion,fecha,horario_inicio,estado,created_by)
values ('fa000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-0000000000a1','da000000-0000-4000-8000-000000000001','R3','BIT-R3-109','Coord','2026-01-26','09:00','cerrada','ca000000-0000-4000-8000-000000000001');
insert into public.water_balances (id,organization_id,diagnostic_id,periodo_anio,mes_inicio,estado,version) values
  ('ea000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-0000000000a1','da000000-0000-4000-8000-000000000001',2026,1,'en_captura',1),
  ('ea000000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-0000000000a1','da000000-0000-4000-8000-000000000001',2026,1,'en_captura',10),
  ('ea000000-0000-4000-8000-000000000003','aa000000-0000-4000-8000-0000000000a1','da000000-0000-4000-8000-000000000001',2026,1,'borrador',11),
  ('ea000000-0000-4000-8000-000000000004','aa000000-0000-4000-8000-0000000000a1','da000000-0000-4000-8000-000000000001',2026,1,'en_captura',12);
insert into public.documents (id,organization_id,diagnostic_id,doc_type,title,r2_key,sha256,mime,size_bytes,uploaded_by) values
  ('fa000000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-0000000000a1','da000000-0000-4000-8000-000000000001','otro','bhe.xlsx','org/a/diag/d/bhe.xlsx',repeat('a',64),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',10,'ca000000-0000-4000-8000-000000000001'),
  ('fa000000-0000-4000-8000-000000000003','aa000000-0000-4000-8000-0000000000b1','da000000-0000-4000-8000-000000000001','otro','ajeno.xlsx','org/b/diag/d/ajeno.xlsx',repeat('b',64),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',10,'ca000000-0000-4000-8000-000000000001'),
  ('fa000000-0000-4000-8000-000000000004','aa000000-0000-4000-8000-0000000000a1','da000000-0000-4000-8000-000000000001','otro','pdf.xlsx','org/a/diag/d/pdf.pdf',repeat('c',64),'application/pdf',10,'ca000000-0000-4000-8000-000000000001');

-- B1 balanced: 100 entrada, 40 proceso, 30 descarga, 20 pÃ©rdida, 10 circular => 0%.
insert into public.balance_flows (balance_id,catalog_code,mes,volumen_m3)
select 'ea000000-0000-4000-8000-000000000001', fc.code, m.mes,
  case fc.grupo when 'entrada' then 100 when 'consumo_proceso' then 40 when 'descarga' then 30
       when 'perdida' then 20 when 'circular' then 10 else 0 end
from generate_series(1,12) m(mes)
join (select distinct on (grupo) code, grupo from public.balance_flow_catalog
      where grupo in ('entrada','consumo_proceso','descarga','perdida','circular')
      order by grupo, code) fc on true;
-- B2 breach 50% (12 months capture but entries 100/destinos 50).
insert into public.balance_flows (balance_id,catalog_code,mes,volumen_m3)
select 'ea000000-0000-4000-8000-000000000002', fc.code, m.mes,
  case fc.grupo when 'entrada' then 100 when 'consumo_proceso' then 50 else 0 end
from generate_series(1,12) m(mes)
join (select distinct on (grupo) code, grupo from public.balance_flow_catalog
      where grupo in ('entrada','consumo_proceso') order by grupo, code) fc on true;

select is((select count(*) from public.v_bhe_monthly_capture where balance_id='ea000000-0000-4000-8000-000000000001'), 12::bigint, 'capture view 12 filas');
select is((select count(*) from public.v_bhe_monthly_capture where balance_id='ea000000-0000-4000-8000-000000000003' and tiene_captura=false), 12::bigint, 'B3 sin captura 12 filas');
select is((select brecha_anual_pct from public.v_bhe_capture_summary where balance_id='ea000000-0000-4000-8000-000000000001'), 0.00::numeric, 'brecha anual 0 con circular restado');
select is((select captura_completa from public.v_bhe_capture_summary where balance_id='ea000000-0000-4000-8000-000000000001'), true, 'captura completa B1');
select is((select brecha_max_mes_pct from public.v_bhe_capture_summary where balance_id='ea000000-0000-4000-8000-000000000002'), 50.00::numeric, 'brecha max B2 50%');

set local role service_role;
select ok(has_function_privilege('service_role','public.fn_validate_bhe_r3(uuid,uuid,uuid,text,text)','EXECUTE'), 'ACL service_role validate');
select ok(has_function_privilege('service_role','public.fn_import_bhe(uuid,uuid,uuid,smallint,jsonb,text,text,text)','EXECUTE'), 'ACL service_role import');
select is((public.fn_validate_bhe_r3('ca000000-0000-4000-8000-000000000002','ea000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000001'))->>'code', 'GATE_BHE_BRECHA', 'brecha >10 bloquea');
select is((select estado from public.water_balances where id='ea000000-0000-4000-8000-000000000002'), 'en_captura', 'brecha no cambia estado');
select is((public.fn_validate_bhe_r3('ca000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000004','fa000000-0000-4000-8000-000000000001'))->>'code', 'VALIDATION_BHE_INCOMPLETO', 'captura incompleta bloquea');
select is((public.fn_validate_bhe_r3('ca000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001'))->>'ok', 'true', 'validaciÃ³n B1 OK');
select is((select estado from public.water_balances where id='ea000000-0000-4000-8000-000000000001'), 'validado_r3', 'B1 validado_r3');
select is((select version from public.water_balances where id='ea000000-0000-4000-8000-000000000001'), 2, 'version incrementada');
select is((public.fn_validate_bhe_r3('ca000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001'))->>'code', 'CONFLICT_STATE', 'doble validaciÃ³n rechazada');

-- Gate F5 debe pasar (F2/F3/F4/BHE satisfechos).
update public.diagnostics set fase_actual=5 where id='da000000-0000-4000-8000-000000000001';
select is((select fase_actual from public.diagnostics where id='da000000-0000-4000-8000-000000000001'), 5::smallint, 'gate F5 avanza con B1 vÃ¡lido');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"ca000000-0000-4000-8000-000000000003","organization_id":"aa000000-0000-4000-8000-0000000000a1","global_role":"observador"}';
with updated as (
  update public.water_balances set estado='validado_r3' where id='ea000000-0000-4000-8000-000000000002' returning 1
)
select is((select count(*) from updated), 0::bigint, 'observador no escribe balance (0 filas RLS)');
select throws_ok($sql$ insert into public.balance_flows(balance_id,catalog_code,mes,volumen_m3) select 'ea000000-0000-4000-8000-000000000002',code,1,1 from public.balance_flow_catalog limit 1 $sql$, '42501', NULL, 'observador no escribe flows');
set local request.jwt.claims = '{"sub":"ca000000-0000-4000-8000-000000000001","organization_id":"aa000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select throws_ok($sql$ update public.water_balances set estado='validado_r3' where id='ea000000-0000-4000-8000-000000000002' $sql$, '42501', NULL, 'update directo gate fields denegado');
reset role;

insert into public.balance_flows (balance_id,catalog_code,mes,volumen_m3)
select 'ea000000-0000-4000-8000-000000000003', code, 1, 1 from public.balance_flow_catalog limit 1;
select is((select estado from public.water_balances where id='ea000000-0000-4000-8000-000000000003'), 'en_captura', 'primer flujo pasa a en_captura');

set local role service_role;
select is((public.fn_import_bhe('ca000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002',2026,
  jsonb_build_array(jsonb_build_object('fila',2,'catalog_code',(select code from public.balance_flow_catalog where grupo='entrada' limit 1),'mes',1,'volumen_m3',10)) ,repeat('a',64),'bhe-1','bhe-h1'))->'data'->>'filas_ok', '1', 'import BHE filas_ok');
select is((public.fn_import_bhe('ca000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002',2026,
  jsonb_build_array(jsonb_build_object('fila',2,'catalog_code',(select code from public.balance_flow_catalog where grupo='entrada' limit 1),'mes',1,'volumen_m3',10)) ,repeat('a',64),'bhe-1','bhe-h1'))->>'replayed', 'true', 'import BHE replay');
select is((public.fn_import_bhe('ca000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000003',2026,'[]'::jsonb,repeat('b',64)))->>'code', 'FORBIDDEN_NOT_MEMBER', 'import documento ajeno rechazado');
select is((public.fn_import_bhe('ca000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002',2026,'[]'::jsonb,repeat('b',64)))->>'code', 'VALIDATION_XLSX_CONTENIDO', 'import checksum distinto rechazado');
select is((public.fn_import_bhe('ca000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000004',2026,'[]'::jsonb,repeat('c',64)))->>'code', 'VALIDATION_XLSX_ESTRUCTURA', 'import MIME no XLSX rechazado');
select is((public.fn_import_bhe('ca000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002',2026,
  jsonb_build_array(jsonb_build_object('fila',3,'catalog_code','NOEXISTE','mes',1,'volumen_m3',1)) ,repeat('a',64)))->>'code', 'VALIDATION_BHE_INCOMPLETO', 'import 0 filas válidas no toca balance');
select is((select count(*) from public.balance_flows where balance_id='ea000000-0000-4000-8000-000000000003'), 1::bigint, 'import 0 válidas conserva flows');


reset role;
reset request.jwt.claims;
select * from finish();
rollback;

