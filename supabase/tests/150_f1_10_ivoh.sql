-- F1-10 task-157 — pgTAP IVOH: catálogo, PK versionada, vistas, RPC y gate F6.
begin;
select plan(55);

insert into public.organizations (id,name,org_type) values
  ('ab000000-0000-4000-8000-0000000000a1','Org IVOH A','srhds'),
  ('ab000000-0000-4000-8000-0000000000b1','Org IVOH B','empresa');
insert into auth.users (id,aud,role,email,created_at,updated_at) values
  ('cb000000-0000-4000-8000-000000000001','authenticated','authenticated','coord110@example.invalid',now(),now()),
  ('cb000000-0000-4000-8000-000000000002','authenticated','authenticated','equipo110@example.invalid',now(),now()),
  ('cb000000-0000-4000-8000-000000000003','authenticated','authenticated','obs110@example.invalid',now(),now());
insert into public.profiles (user_id,organization_id,full_name,email,global_role) values
  ('cb000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-0000000000a1','Coord 110','coord110@example.invalid','coordinador_srhds'),
  ('cb000000-0000-4000-8000-000000000002','ab000000-0000-4000-8000-0000000000a1','Equipo 110','equipo110@example.invalid','equipo'),
  ('cb000000-0000-4000-8000-000000000003','ab000000-0000-4000-8000-0000000000a1','Obs 110','obs110@example.invalid','observador');
insert into public.companies (id,organization_id,razon_social,nombre_planta,giro,calle,colonia_parque,cp,municipio,organismo_operador) values
  ('bb000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-0000000000a1','Empresa IVOH','Planta IVOH','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into public.diagnostics (id,organization_id,company_id,tipo,fecha_inicio,fecha_fin,fase_actual,cat_estado,index_version_id) values
  ('db000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-0000000000a1','bb000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',5,'validado_r2','00000000-0000-4000-8000-0000000000a1'),
  ('db000000-0000-4000-8000-000000000002','ab000000-0000-4000-8000-0000000000a1','bb000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',5,'validado_r2','00000000-0000-4000-8000-0000000000a1');
insert into public.project_members (diagnostic_id,user_id,organization_id,role) values
  ('db000000-0000-4000-8000-000000000001','cb000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-0000000000a1','coordinador'),
  ('db000000-0000-4000-8000-000000000001','cb000000-0000-4000-8000-000000000002','ab000000-0000-4000-8000-0000000000a1','equipo'),
  ('db000000-0000-4000-8000-000000000001','cb000000-0000-4000-8000-000000000003','ab000000-0000-4000-8000-0000000000a1','observador');
insert into public.document_checklist_items (diagnostic_id,item_code,estado) values
  ('db000000-0000-4000-8000-000000000001','layout','validado_r1'),
  ('db000000-0000-4000-8000-000000000002','layout','validado_r1');
insert into public.iih_assets (organization_id,diagnostic_id,stage_code,asset_type_id,tag,ubicacion,estado_fisico,opera,criticidad,intervencion,prioridad,verificado_v1)
select 'ab000000-0000-4000-8000-0000000000a1',d.id,'CAP',t.id,'T-'||right(d.id::text,2),'U','bueno','si','alta','ninguna','media',true
from public.diagnostics d, lateral (select id from public.iih_asset_types where stage_code='CAP' order by id limit 1) t
where d.id in ('db000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000002');
insert into public.water_balances (id,organization_id,diagnostic_id,periodo_anio,mes_inicio,estado,version) values
  ('eb000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-0000000000a1','db000000-0000-4000-8000-000000000001',2026,1,'validado_r3',1),
  ('eb000000-0000-4000-8000-000000000002','ab000000-0000-4000-8000-0000000000a1','db000000-0000-4000-8000-000000000002',2026,1,'validado_r3',1);
insert into public.logbook_entries (id,organization_id,diagnostic_id,clave,folio,responsable_sesion,fecha,horario_inicio,estado,created_by)
values ('fb000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-0000000000a1','db000000-0000-4000-8000-000000000001','R4','BIT-R4-110','Coord','2026-01-27','09:00','cerrada','cb000000-0000-4000-8000-000000000001');
insert into public.ivoh_evaluations (diagnostic_id,version_id,factor_code,puntaje,justificacion,evidencia,estado)
select 'db000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a1',f.factor_code,7.0,'Justificación '||f.factor_code,
  jsonb_build_array(jsonb_build_object('tipo','documento','ref','doc-'||f.factor_code)),'borrador'
from public.ivoh_factors f where f.version_id='00000000-0000-4000-8000-0000000000a1';

select is((select count(*) from public.ivoh_semaforo),3::bigint,'catálogo semáforo 3 niveles');
select is((select label from public.ivoh_semaforo where nivel='rojo'),'Crítico','label rojo');
select is((select label from public.ivoh_semaforo where nivel='amarillo'),'En desarrollo','label amarillo');
select is((select label from public.ivoh_semaforo where nivel='verde'),'Consolidado','label verde');
select is((select max_total from public.ivoh_semaforo where nivel='rojo'),4.9::numeric,'rojo max 4.9');
select ok((select count(*) from pg_constraint where conrelid='public.ivoh_evaluations'::regclass and contype='p' and pg_get_constraintdef(oid) like '%version_id%'),'PK incluye version_id');
select is((select count(*) from public.v_ivoh_capture where diagnostic_id='db000000-0000-4000-8000-000000000001' and completo),1::bigint,'captura completa');
select is((select total from public.v_ivoh_capture where diagnostic_id='db000000-0000-4000-8000-000000000001'),7.0::numeric,'captura total 7.0');
select is((select semaforo from public.v_ivoh_capture where diagnostic_id='db000000-0000-4000-8000-000000000001'),'amarillo','captura semáforo amarillo');
select is((select factores_guardados from public.v_ivoh_capture where diagnostic_id='db000000-0000-4000-8000-000000000001'),6,'factores guardados 6');
select is((select count(*) from public.v_ivoh_score where diagnostic_id='db000000-0000-4000-8000-000000000001'),0::bigint,'score vacío antes R4');
select is((select count(*) from public.ivoh_evaluations where diagnostic_id='db000000-0000-4000-8000-000000000001' and estado='borrador'),6::bigint,'6 borradores');

set local role service_role;
set local request.jwt.claims='{}';
select ok(has_function_privilege('service_role','public.fn_save_ivoh_score(uuid,uuid,jsonb,text,text)','EXECUTE'),'ACL service save');
select ok(has_function_privilege('service_role','public.fn_validate_ivoh_r4(uuid,uuid,uuid,text,text)','EXECUTE'),'ACL service validate');
select is((public.fn_save_ivoh_score('cb000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('factor_code','F1','puntaje',7.5,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d1')))))->'data'->>'factores_guardados','1','save parcial 1 factor'));
select is((public.fn_save_ivoh_score('cb000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('factor_code','F1','puntaje',7.0,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d1'))),jsonb_build_object('factor_code','F1','puntaje',7.0,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d1')))))->>'code','VALIDATION_IVOH_INCOMPLETO','save duplicado rechazado'));
select is((public.fn_save_ivoh_score('cb000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('factor_code','F1','puntaje',7.2,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d1')))))->>'code','VALIDATION_IVOH_INCOMPLETO','save paso 0.5'));
select is((public.fn_save_ivoh_score('cb000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('factor_code','F1','puntaje',7.0,'justificacion','J','evidencia','[]'::jsonb)))->>'code','VALIDATION_IVOH_INCOMPLETO','save evidencia vacía'));
select is((public.fn_save_ivoh_score('cb000000-0000-4000-8000-000000000003','db000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('factor_code','F1','puntaje',7.0,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d1')))))->>'code','FORBIDDEN_ROLE','save observador rechazado'));
select is((public.fn_save_ivoh_score('cb000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('factor_code','F1','puntaje',7.0,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d1'))),jsonb_build_object('factor_code','F2','puntaje',7.0,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d2'))),jsonb_build_object('factor_code','F3','puntaje',7.0,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d3'))),jsonb_build_object('factor_code','F4','puntaje',7.0,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d4'))),jsonb_build_object('factor_code','F5','puntaje',7.0,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d5'))),jsonb_build_object('factor_code','F6','puntaje',7.0,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d6')))),'s-1','h-1'))->>'ok','true','save 6 factores');
select is((public.fn_save_ivoh_score('cb000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('factor_code','F1','puntaje',7.0,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d1')))),'s-1','h-1'))->>'replayed','true','save replay');
select is((public.fn_save_ivoh_score('cb000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('factor_code','F1','puntaje',7.0,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d1')))),'s-1','h-2'))->>'code','CONFLICT_STATE','save conflicto hash');
select is((public.fn_validate_ivoh_r4('cb000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000000'))->>'code','GATE_R4_FICHA','validate sin ficha');
select is((public.fn_validate_ivoh_r4('cb000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','v-1','vh-1'))->>'ok','true','validate 6/6');
select is((select ivoh_actual from public.diagnostics where id='db000000-0000-4000-8000-000000000001'),7.0::numeric,'diagnostics.ivoh_actual 7.0');
select is((select count(*) from public.ivoh_evaluations where diagnostic_id='db000000-0000-4000-8000-000000000001' and estado='validado_r4'),6::bigint,'6 validado_r4');
select is((select semaforo_label from public.v_ivoh_score where diagnostic_id='db000000-0000-4000-8000-000000000001'),'En desarrollo','score label');
select is((public.fn_validate_ivoh_r4('cb000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','v-1','vh-1'))->>'replayed','true','validate replay');
select is((public.fn_validate_ivoh_r4('cb000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','v-1','vh-2'))->>'code','CONFLICT_STATE','validate conflicto');
select is((public.fn_validate_ivoh_r4('cb000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001'))->>'code','CONFLICT_STATE','doble validate');
select is((public.fn_save_ivoh_score('cb000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('factor_code','F1','puntaje',8.0,'justificacion','J','evidencia',jsonb_build_array(jsonb_build_object('tipo','documento','ref','d1')))))->>'code','CONFLICT_STATE','save post-R4 bloqueado'));
select is((select count(*) from public.audit_log where entity='ivoh_evaluations' and action='approve'),1::bigint,'audit approve IVOH');
select is((select count(*) from public.audit_log where entity='ivoh_evaluations' and action='update'),1::bigint,'audit update IVOH');
reset role;
reset request.jwt.claims;

select is((select count(*) from public.ivoh_semaforo where min_total <= max_total),3::bigint,'rangos coherentes');
select ok(not exists (select 1 from public.ivoh_semaforo a join public.ivoh_semaforo b on a.nivel<b.nivel and a.max_total>=b.min_total),'rangos sin solape');
select is((select orden from public.ivoh_semaforo where nivel='verde'),3::smallint,'orden verde');
select is((select min_total from public.ivoh_semaforo where nivel='amarillo'),5.0::numeric,'amarillo min 5');
select is((select max_total from public.ivoh_semaforo where nivel='verde'),10.0::numeric,'verde max 10');
select ok((select pg_get_viewdef('public.v_ivoh_score'::regclass,true) like '%index_version_id%'),'score filtra versión vigente');
select ok((select pg_get_viewdef('public.v_ivoh_capture'::regclass,true) like '%factores_guardados%'),'capture factores_guardados');
select ok(has_table_privilege('authenticated','public.ivoh_semaforo','SELECT'),'ACL semáforo SELECT');
select ok(exists(select 1 from pg_policies where tablename='ivoh_evaluations' and cmd='SELECT'),'RLS evaluaciones SELECT');
select ok(not exists(select 1 from pg_policies where tablename='ivoh_evaluations' and cmd='INSERT'),'RLS evaluaciones sin INSERT');
select ok(not exists(select 1 from pg_policies where tablename='ivoh_evaluations' and cmd='UPDATE'),'RLS evaluaciones sin UPDATE');
select ok(not has_function_privilege('authenticated','public.fn_save_ivoh_score(uuid,uuid,jsonb,text,text)','EXECUTE'),'ACL save negativa');
select ok(not has_function_privilege('anon','public.fn_validate_ivoh_r4(uuid,uuid,uuid,text,text)','EXECUTE'),'ACL validate anon negativa');
select ok((select proacl::text from pg_proc where proname='fn_validate_ivoh_r4') like '%service_role=X%','proacl validate');
select ok((select proacl::text from pg_proc where proname='fn_save_ivoh_score') like '%service_role=X%','proacl save');

set local role authenticated;
set local request.jwt.claims='{"sub":"cb000000-0000-4000-8000-000000000003","organization_id":"ab000000-0000-4000-8000-0000000000a1","global_role":"observador"}';
select is((select count(*) from public.ivoh_evaluations where diagnostic_id='db000000-0000-4000-8000-000000000001'),6::bigint,'observador lee evaluaciones');
with upd as (update public.ivoh_evaluations set puntaje=1 where diagnostic_id='db000000-0000-4000-8000-000000000001' returning 1)
select is((select count(*) from upd),0::bigint,'observador UPDATE 0 filas RLS');
with ins as (insert into public.ivoh_evaluations(diagnostic_id,version_id,factor_code,puntaje,justificacion,evidencia) values ('db000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a1','F1',1,'x','[]') returning 1)
select is((select count(*) from ins),0::bigint,'observador INSERT RLS');
reset role;
reset request.jwt.claims;

set local role service_role;
set local request.jwt.claims='{}';
select throws_ok($sql$ update public.ivoh_evaluations set puntaje=1 where diagnostic_id='db000000-0000-4000-8000-000000000001' $sql$,'42501',NULL,'post-R4 UPDATE service_role 42501');
select throws_ok($sql$ update public.ivoh_evaluations set version_id='00000000-0000-4000-8000-0000000000a2' where diagnostic_id='db000000-0000-4000-8000-000000000001' $sql$,'42501',NULL,'claves inmutables 42501');
select throws_ok($sql$ update public.diagnostics set fase_actual=6 where id='db000000-0000-4000-8000-000000000002' $sql$,'P0001',NULL,'gate F6 sin IVOH bloquea');
update public.diagnostics set fase_actual=6 where id='db000000-0000-4000-8000-000000000001';
select is((select fase_actual from public.diagnostics where id='db000000-0000-4000-8000-000000000001'),6::smallint,'gate F6 6/6 avanza');
reset role;

select * from finish();
rollback;
