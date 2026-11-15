-- F1-10 task-157 — cierres QA: fronteras, versiones y atomicidad.
begin;
select plan(14);

insert into public.organizations (id,name,org_type) values ('ad000000-0000-4000-8000-0000000000a1','Org IVOH Cierres','srhds');
insert into auth.users (id,aud,role,email,created_at,updated_at) values ('cd000000-0000-4000-8000-000000000001','authenticated','authenticated','coord112@example.invalid',now(),now());
insert into public.profiles (user_id,organization_id,full_name,email,global_role) values ('cd000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-0000000000a1','Coord 112','coord112@example.invalid','coordinador_srhds');
insert into public.companies (id,organization_id,razon_social,nombre_planta,giro,calle,colonia_parque,cp,municipio,organismo_operador) values ('bd000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-0000000000a1','Empresa Cierres','Planta Cierres','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into public.diagnostics (id,organization_id,company_id,tipo,fecha_inicio,fecha_fin,fase_actual,cat_estado,index_version_id) values
  ('dd000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-0000000000a1','bd000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',5,'validado_r2','00000000-0000-4000-8000-0000000000a1'),
  ('dd000000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-0000000000a1','bd000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',5,'validado_r2','00000000-0000-4000-8000-0000000000a1'),
  ('dd000000-0000-4000-8000-000000000003','ad000000-0000-4000-8000-0000000000a1','bd000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',5,'validado_r2','00000000-0000-4000-8000-0000000000a1'),
  ('dd000000-0000-4000-8000-000000000004','ad000000-0000-4000-8000-0000000000a1','bd000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',5,'validado_r2','00000000-0000-4000-8000-0000000000a1'),
  ('dd000000-0000-4000-8000-000000000005','ad000000-0000-4000-8000-0000000000a1','bd000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',5,'validado_r2','00000000-0000-4000-8000-0000000000a1'),
  ('dd000000-0000-4000-8000-000000000006','ad000000-0000-4000-8000-0000000000a1','bd000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',5,'validado_r2','00000000-0000-4000-8000-0000000000a1');
insert into public.project_members (diagnostic_id,user_id,organization_id,role) values
  ('dd000000-0000-4000-8000-000000000004','cd000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-0000000000a1','coordinador'),
  ('dd000000-0000-4000-8000-000000000005','cd000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-0000000000a1','coordinador'),
  ('dd000000-0000-4000-8000-000000000006','cd000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-0000000000a1','coordinador');
insert into public.water_balances (id,organization_id,diagnostic_id,periodo_anio,mes_inicio,estado,version) values
  ('ed000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-0000000000a1','dd000000-0000-4000-8000-000000000001',2026,1,'validado_r3',1),
  ('ed000000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-0000000000a1','dd000000-0000-4000-8000-000000000002',2026,1,'validado_r3',1),
  ('ed000000-0000-4000-8000-000000000003','ad000000-0000-4000-8000-0000000000a1','dd000000-0000-4000-8000-000000000003',2026,1,'validado_r3',1),
  ('ed000000-0000-4000-8000-000000000004','ad000000-0000-4000-8000-0000000000a1','dd000000-0000-4000-8000-000000000004',2026,1,'validado_r3',1),
  ('ed000000-0000-4000-8000-000000000006','ad000000-0000-4000-8000-0000000000a1','dd000000-0000-4000-8000-000000000006',2026,1,'validado_r3',1);
insert into public.logbook_entries (id,organization_id,diagnostic_id,clave,folio,responsable_sesion,fecha,horario_inicio,estado,created_by) values
  ('fd000000-0000-4000-8000-000000000006','ad000000-0000-4000-8000-0000000000a1','dd000000-0000-4000-8000-000000000006','R4','BIT-R4-CIERRE','Coord','2026-01-27','09:00','cerrada','cd000000-0000-4000-8000-000000000001');

-- 4.9 rojo: 4.5/5/5/5/5/5 (4.925 → 4.9).
insert into public.ivoh_evaluations (diagnostic_id,version_id,factor_code,puntaje,justificacion,evidencia,estado)
select 'dd000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a1',f,
  case f when 'F1' then 4.5 else 5 end,'J','[{"tipo":"documento","ref":"d"}]'::jsonb,'validado_r4'
from unnest(array['F1','F2','F3','F4','F5','F6']) f;
-- 7.9 amarillo: 7.5 + 8×5.
insert into public.ivoh_evaluations (diagnostic_id,version_id,factor_code,puntaje,justificacion,evidencia,estado)
select 'dd000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-0000000000a1',f,
  case f when 'F1' then 7.5 else 8 end,'J','[{"tipo":"documento","ref":"d"}]'::jsonb,'validado_r4'
from unnest(array['F1','F2','F3','F4','F5','F6']) f;
-- 8.0 verde exacto.
insert into public.ivoh_evaluations (diagnostic_id,version_id,factor_code,puntaje,justificacion,evidencia,estado)
select 'dd000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-0000000000a1',f,8,'J','[{"tipo":"documento","ref":"d"}]'::jsonb,'validado_r4'
from unnest(array['F1','F2','F3','F4','F5','F6']) f;
-- Version vieja: evaluación en v1 y diagnóstico movido a v2.
insert into public.ivoh_index_versions (id,version,vigente) values ('00000000-0000-4000-8000-0000000000a2',2,false);
insert into public.ivoh_factors (version_id,factor_code,nombre,peso) select '00000000-0000-4000-8000-0000000000a2',factor_code,nombre,peso from public.ivoh_factors where version_id='00000000-0000-4000-8000-0000000000a1';
insert into public.ivoh_evaluations (diagnostic_id,version_id,factor_code,puntaje,justificacion,evidencia,estado)
select 'dd000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-0000000000a1',f,7,'J','[{"tipo":"documento","ref":"d"}]'::jsonb,'validado_r4'
from unnest(array['F1','F2','F3','F4','F5','F6']) f;
update public.diagnostics set index_version_id='00000000-0000-4000-8000-0000000000a2' where id='dd000000-0000-4000-8000-000000000004';
-- Atomicidad: 5/6 en borrador.
insert into public.ivoh_evaluations (diagnostic_id,version_id,factor_code,puntaje,justificacion,evidencia,estado)
select 'dd000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-0000000000a1',f,7,'J','[{"tipo":"documento","ref":"d"}]'::jsonb,'borrador'
from unnest(array['F1','F2','F3','F4','F5']) f;

select is((select ivoh from public.v_ivoh_score where diagnostic_id='dd000000-0000-4000-8000-000000000001'),4.9::numeric,'frontera 4.9');
select is((select semaforo from public.v_ivoh_score where diagnostic_id='dd000000-0000-4000-8000-000000000001'),'rojo','4.9 rojo');
select is((select ivoh from public.v_ivoh_score where diagnostic_id='dd000000-0000-4000-8000-000000000002'),7.9::numeric,'frontera 7.9');
select is((select semaforo from public.v_ivoh_score where diagnostic_id='dd000000-0000-4000-8000-000000000002'),'amarillo','7.9 amarillo');
select is((select ivoh from public.v_ivoh_score where diagnostic_id='dd000000-0000-4000-8000-000000000003'),8.0::numeric,'frontera 8.0');
select is((select semaforo from public.v_ivoh_score where diagnostic_id='dd000000-0000-4000-8000-000000000003'),'verde','8.0 verde');

set local role service_role;
set local request.jwt.claims='{}';
select is((public.fn_save_ivoh_score('cd000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000004',jsonb_build_array(jsonb_build_object('factor_code','F1','puntaje',7,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d'))))))->>'code','CONFLICT_IVOH_VERSION','save versión vieja CONFLICT');
select is((public.fn_validate_ivoh_r4('cd000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000004','fd000000-0000-4000-8000-000000000006'))->>'code','CONFLICT_IVOH_VERSION','validate versión vieja CONFLICT');
select is((public.fn_validate_ivoh_r4('cd000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000006','fd000000-0000-4000-8000-000000000006'))->>'code','VALIDATION_IVOH_INCOMPLETO','validate 5/6 rechazado');
select is((select count(*) from public.ivoh_evaluations where diagnostic_id='dd000000-0000-4000-8000-000000000006' and estado='validado_r4'),0::bigint,'rollback: sin validado_r4');
select is((select ivoh_actual from public.diagnostics where id='dd000000-0000-4000-8000-000000000006'),NULL::numeric,'rollback: ivoh_actual null');
select is((public.fn_save_ivoh_score('cd000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000005',jsonb_build_array(jsonb_build_object('factor_code','F1','puntaje',7,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d'))))))->>'code','GATE_BHE_R3','GATE_BHE_R3 por RPC save');
reset role;
select throws_ok($sql$ update public.diagnostics set fase_actual=6 where id='dd000000-0000-4000-8000-000000000004' $sql$,'P0001',NULL,'gate F6 versión vieja no cuenta');
select is((select count(*) from public.audit_log where entity='ivoh_evaluations' and action='approve' and entity_id='dd000000-0000-4000-8000-000000000006'),0::bigint,'rollback: sin audit approve');
reset role;
select * from finish();
rollback;
