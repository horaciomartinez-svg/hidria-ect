-- F1-10 task-157 — pgTAP QA IVOH: vectores, fronteras, versiones y atomicidad.
begin;
select plan(23);

insert into public.organizations (id,name,org_type) values
  ('ac000000-0000-4000-8000-0000000000a1','Org IVOH QA','srhds');
insert into auth.users (id,aud,role,email,created_at,updated_at) values
  ('cc000000-0000-4000-8000-000000000001','authenticated','authenticated','coord111@example.invalid',now(),now());
insert into public.profiles (user_id,organization_id,full_name,email,global_role) values
  ('cc000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-0000000000a1','Coord 111','coord111@example.invalid','coordinador_srhds');
insert into public.companies (id,organization_id,razon_social,nombre_planta,giro,calle,colonia_parque,cp,municipio,organismo_operador) values
  ('bc000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-0000000000a1','Empresa QA','Planta QA','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into public.diagnostics (id,organization_id,company_id,tipo,fecha_inicio,fecha_fin,fase_actual,cat_estado,index_version_id) values
  ('dc000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-0000000000a1','bc000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',5,'validado_r2','00000000-0000-4000-8000-0000000000a1'),
  ('dc000000-0000-4000-8000-000000000002','ac000000-0000-4000-8000-0000000000a1','bc000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',5,'validado_r2','00000000-0000-4000-8000-0000000000a1'),
  ('dc000000-0000-4000-8000-000000000003','ac000000-0000-4000-8000-0000000000a1','bc000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',5,'validado_r2','00000000-0000-4000-8000-0000000000a1'),
  ('dc000000-0000-4000-8000-000000000004','ac000000-0000-4000-8000-0000000000a1','bc000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',5,'validado_r2','00000000-0000-4000-8000-0000000000a1'),
  ('dc000000-0000-4000-8000-000000000006','ac000000-0000-4000-8000-0000000000a1','bc000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',5,'validado_r2','00000000-0000-4000-8000-0000000000a1'),
  ('dc000000-0000-4000-8000-000000000007','ac000000-0000-4000-8000-0000000000a1','bc000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',5,'validado_r2','00000000-0000-4000-8000-0000000000a1');
insert into public.project_members (diagnostic_id,user_id,organization_id,role) values
  ('dc000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-0000000000a1','coordinador'),
  ('dc000000-0000-4000-8000-000000000002','cc000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-0000000000a1','coordinador'),
  ('dc000000-0000-4000-8000-000000000006','cc000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-0000000000a1','coordinador');
insert into public.water_balances (id,organization_id,diagnostic_id,periodo_anio,mes_inicio,estado,version) values
  ('ec000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-0000000000a1','dc000000-0000-4000-8000-000000000001',2026,1,'validado_r3',1),
  ('ec000000-0000-4000-8000-000000000002','ac000000-0000-4000-8000-0000000000a1','dc000000-0000-4000-8000-000000000002',2026,1,'validado_r3',1),
  ('ec000000-0000-4000-8000-000000000003','ac000000-0000-4000-8000-0000000000a1','dc000000-0000-4000-8000-000000000003',2026,1,'validado_r3',1),
  ('ec000000-0000-4000-8000-000000000004','ac000000-0000-4000-8000-0000000000a1','dc000000-0000-4000-8000-000000000004',2026,1,'validado_r3',1),
  ('ec000000-0000-4000-8000-000000000007','ac000000-0000-4000-8000-0000000000a1','dc000000-0000-4000-8000-000000000007',2026,1,'validado_r3',1);
insert into public.logbook_entries (id,organization_id,diagnostic_id,clave,folio,responsable_sesion,fecha,horario_inicio,estado,created_by) values
  ('fc000000-0000-4000-8000-000000000002','ac000000-0000-4000-8000-0000000000a1','dc000000-0000-4000-8000-000000000002','R4','BIT-R4-ABIERTA','Coord','2026-01-27','09:00','abierta','cc000000-0000-4000-8000-000000000001'),
  ('fc000000-0000-4000-8000-000000000003','ac000000-0000-4000-8000-0000000000a1','dc000000-0000-4000-8000-000000000003','R4','BIT-R4-AJENA','Coord','2026-01-27','09:00','cerrada','cc000000-0000-4000-8000-000000000001');
-- IVOH-01: vector 6.5/7.0/8.0/6.0/7.5/9.0 = 7.2
insert into public.ivoh_evaluations (diagnostic_id,version_id,factor_code,puntaje,justificacion,evidencia,estado)
select 'dc000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a1',f,
  case f when 'F1' then 6.5 when 'F2' then 7.0 when 'F3' then 8.0 when 'F4' then 6.0 when 'F5' then 7.5 else 9.0 end,
  'J','[{"tipo":"documento","ref":"d1"}]'::jsonb,'validado_r4'
from unnest(array['F1','F2','F3','F4','F5','F6']) f;
-- IVOH-03: 8.5 verde. IVOH-04: 4.3 rojo. Frontera: 5.0 amarillo.
insert into public.ivoh_evaluations (diagnostic_id,version_id,factor_code,puntaje,justificacion,evidencia,estado)
select 'dc000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-0000000000a1',f,
  case f when 'F1' then 8 when 'F2' then 8 when 'F3' then 9 when 'F4' then 9 when 'F5' then 8 else 9 end,'J','[{"tipo":"documento","ref":"d"}]'::jsonb,'validado_r4'
from unnest(array['F1','F2','F3','F4','F5','F6']) f;
insert into public.ivoh_evaluations (diagnostic_id,version_id,factor_code,puntaje,justificacion,evidencia,estado)
select 'dc000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-0000000000a1',f,
  case f when 'F1' then 4 when 'F2' then 4 when 'F3' then 5 when 'F4' then 4 when 'F5' then 4 else 5 end,'J','[{"tipo":"documento","ref":"d"}]'::jsonb,'validado_r4'
from unnest(array['F1','F2','F3','F4','F5','F6']) f;
insert into public.ivoh_evaluations (diagnostic_id,version_id,factor_code,puntaje,justificacion,evidencia,estado)
select 'dc000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-0000000000a1',f,5,'J','[{"tipo":"documento","ref":"d"}]'::jsonb,'validado_r4'
from unnest(array['F1','F2','F3','F4','F5','F6']) f;

select is((select ivoh from public.v_ivoh_score where diagnostic_id='dc000000-0000-4000-8000-000000000001'),7.2::numeric,'IVOH-01 vector 7.2');
select is((select semaforo from public.v_ivoh_score where diagnostic_id='dc000000-0000-4000-8000-000000000001'),'amarillo','IVOH-01 amarillo');
select is((select ivoh from public.v_ivoh_score where diagnostic_id='dc000000-0000-4000-8000-000000000002'),8.5::numeric,'IVOH-03 8.5');
select is((select semaforo from public.v_ivoh_score where diagnostic_id='dc000000-0000-4000-8000-000000000002'),'verde','IVOH-03 verde');
select is((select ivoh from public.v_ivoh_score where diagnostic_id='dc000000-0000-4000-8000-000000000003'),4.3::numeric,'IVOH-04 4.3');
select is((select semaforo from public.v_ivoh_score where diagnostic_id='dc000000-0000-4000-8000-000000000003'),'rojo','IVOH-04 rojo');
select is((select ivoh from public.v_ivoh_score where diagnostic_id='dc000000-0000-4000-8000-000000000004'),5.0::numeric,'frontera 5.0');
select is((select semaforo from public.v_ivoh_score where diagnostic_id='dc000000-0000-4000-8000-000000000004'),'amarillo','frontera 5.0 amarillo');
select is((select ivoh from public.v_ivoh_score where diagnostic_id='dc000000-0000-4000-8000-000000000001'),7.2::numeric,'IVOH-01 ponderado');
select is((select count(*) from public.v_ivoh_score where diagnostic_id='dc000000-0000-4000-8000-000000000003'),1::bigint,'rojo en vista');
select is((select p8_ivoh from public.v_diagnostic_completeness where diagnostic_id='dc000000-0000-4000-8000-000000000002'),true,'p8_ivoh 6/6');
-- Fronteras del catálogo (rangos inclusivos; round(total,1) antes de comparar).
select is(round(4.9::numeric,1) < (select min_total from public.ivoh_semaforo where nivel='amarillo'),true,'frontera 4.9 < 5.0 rojo');
select is(round(7.9::numeric,1) < (select min_total from public.ivoh_semaforo where nivel='verde'),true,'frontera 7.9 < 8.0 amarillo');
select is(round(8.0::numeric,1) >= (select min_total from public.ivoh_semaforo where nivel='verde'),true,'frontera 8.0 >= 8.0 verde');

-- Sin BHE R3: RPC save bloquea.
set local role service_role;
set local request.jwt.claims='{}';
select is(public.fn_save_ivoh_score('cc000000-0000-4000-8000-000000000001','dc000000-0000-4000-8000-000000000006',jsonb_build_array(jsonb_build_object('factor_code','F1','puntaje',5,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d')))))->>'code','GATE_BHE_R3','save sin BHE R3 bloquea');
reset role;
reset request.jwt.claims;
-- Sin BHE R3: trigger directo bloquea.
select throws_ok($sql$ insert into public.ivoh_evaluations (diagnostic_id,version_id,factor_code,puntaje,justificacion,evidencia) values ('dc000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-0000000000a1','F1',5,'J','[]') $sql$, 'P0001', NULL, 'sin BHE R3 bloquea');

-- Pesos de versión vigente inmutables (IVOH-05).
select throws_ok($sql$ update public.ivoh_factors set peso=0.20 where version_id='00000000-0000-4000-8000-0000000000a1' and factor_code='F1' $sql$, '42501', NULL, 'peso vigente inmutable');

-- R4 abierta/ajena.
set local role service_role;
set local request.jwt.claims='{}';
select is((public.fn_validate_ivoh_r4('cc000000-0000-4000-8000-000000000001','dc000000-0000-4000-8000-000000000002','fc000000-0000-4000-8000-000000000002'))->>'code','GATE_R4_FICHA','R4 abierta rechazada');
select is((public.fn_validate_ivoh_r4('cc000000-0000-4000-8000-000000000001','dc000000-0000-4000-8000-000000000002','fc000000-0000-4000-8000-000000000003'))->>'code','GATE_R4_FICHA','R4 ajena rechazada');
reset role;

-- Captura incompleta: 3 borradores -> total NULL.
insert into public.ivoh_evaluations (diagnostic_id,version_id,factor_code,puntaje,justificacion,evidencia,estado)
select 'dc000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-0000000000a1',f,7,'J','[{"tipo":"documento","ref":"d"}]'::jsonb,'borrador'
from unnest(array['F1','F2','F3']) f;
select is((select total from public.v_ivoh_capture where diagnostic_id='dc000000-0000-4000-8000-000000000007'),NULL::numeric,'captura incompleta total NULL');
select is((select completo from public.v_ivoh_capture where diagnostic_id='dc000000-0000-4000-8000-000000000007'),false,'captura incompleta false');
select is((select count(*) from public.v_ivoh_capture where diagnostic_id='dc000000-0000-4000-8000-000000000007' and total is null),1::bigint,'captura NULL una fila');
select is((select count(*) from public.v_ivoh_capture where diagnostic_id='dc000000-0000-4000-8000-000000000002' and completo),1::bigint,'captura completa');
select * from finish();
rollback;
