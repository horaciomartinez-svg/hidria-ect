-- F1-04 — pgTAP: gates F2–F6, EF-01/EF-12 RPC, idempotencia y reprogramación.
begin;

select plan(44);

-- Fixtures sintéticas.
insert into public.organizations (id, name, org_type) values
  ('a5000000-0000-4000-8000-0000000000a1','Org F1-04 A','srhds'),
  ('a5000000-0000-4000-8000-0000000000b1','Org F1-04 B','empresa');
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('c5000000-0000-4000-8000-000000000001','authenticated','authenticated','coord104@example.invalid',now(),now()),
  ('c5000000-0000-4000-8000-000000000002','authenticated','authenticated','equipo104@example.invalid',now(),now()),
  ('c5000000-0000-4000-8000-000000000003','authenticated','authenticated','obs104@example.invalid',now(),now()),
  ('c5000000-0000-4000-8000-000000000004','authenticated','authenticated','admin104@example.invalid',now(),now()),
  ('c5000000-0000-4000-8000-000000000005','authenticated','authenticated','coord104b@example.invalid',now(),now());
insert into public.profiles (user_id, organization_id, full_name, email, global_role) values
  ('c5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-0000000000a1','Coord 104','coord104@example.invalid','coordinador_srhds'),
  ('c5000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-0000000000a1','Equipo 104','equipo104@example.invalid','equipo'),
  ('c5000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-0000000000a1','Obs 104','obs104@example.invalid','observador'),
  ('c5000000-0000-4000-8000-000000000004','a5000000-0000-4000-8000-0000000000a1','Admin 104','admin104@example.invalid','admin_institucional'),
  ('c5000000-0000-4000-8000-000000000005','a5000000-0000-4000-8000-0000000000b1','Coord 104 B','coord104b@example.invalid','coordinador_srhds');
insert into public.companies (id, organization_id, razon_social, nombre_planta, giro, calle, colonia_parque, cp, municipio, organismo_operador) values
  ('b5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-0000000000a1','Empresa 104','Planta 104','manufacturera','Calle','Parque','87000','Victoria','COMAPA'),
  ('b5000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-0000000000b1','Empresa 104 B','Planta 104 B','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio, fecha_fin, fase_actual, estado, index_version_id) values
  ('d5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-0000000000a1','b5000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',1,'activo','00000000-0000-4000-8000-0000000000a1'),
  ('d5000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-0000000000a1','b5000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',1,'activo','00000000-0000-4000-8000-0000000000a1'),
  ('d5000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-0000000000a1','b5000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',1,'suspendido','00000000-0000-4000-8000-0000000000a1'),
  ('d5000000-0000-4000-8000-000000000004','a5000000-0000-4000-8000-0000000000a1','b5000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',1,'activo','00000000-0000-4000-8000-0000000000a1');
insert into public.project_members (diagnostic_id, user_id, organization_id, role) values
  ('d5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-0000000000a1','coordinador'),
  ('d5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-0000000000a1','equipo'),
  ('d5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-0000000000a1','observador'),
  ('d5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000005','a5000000-0000-4000-8000-0000000000b1','coordinador'),
  ('d5000000-0000-4000-8000-000000000002','c5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-0000000000a1','coordinador'),
  ('d5000000-0000-4000-8000-000000000003','c5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-0000000000a1','coordinador'),
  ('d5000000-0000-4000-8000-000000000004','c5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-0000000000a1','coordinador');
insert into public.logbook_entries (id, organization_id, diagnostic_id, clave, folio, responsable_sesion, fecha, horario_inicio, estado, created_by) values
  ('f5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-0000000000a1','d5000000-0000-4000-8000-000000000001','R1','BIT-R1-104','Coord 104','2026-01-05','09:00','cerrada','c5000000-0000-4000-8000-000000000001'),
  ('f5000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-0000000000a1','d5000000-0000-4000-8000-000000000001','R2','BIT-R2-104','Coord 104','2026-01-12','09:00','cerrada','c5000000-0000-4000-8000-000000000001'),
  ('f5000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-0000000000a1','d5000000-0000-4000-8000-000000000001','V1','BIT-V1-104','Coord 104','2026-01-19','09:00','cerrada','c5000000-0000-4000-8000-000000000001'),
  ('f5000000-0000-4000-8000-000000000004','a5000000-0000-4000-8000-0000000000a1','d5000000-0000-4000-8000-000000000001','R3','BIT-R3-104','Coord 104','2026-01-26','09:00','cerrada','c5000000-0000-4000-8000-000000000001'),
  ('f5000000-0000-4000-8000-000000000005','a5000000-0000-4000-8000-0000000000a1','d5000000-0000-4000-8000-000000000001','R4','BIT-R4-104','Coord 104','2026-02-02','09:00','cerrada','c5000000-0000-4000-8000-000000000001'),
  ('f5000000-0000-4000-8000-000000000006','a5000000-0000-4000-8000-0000000000a1','d5000000-0000-4000-8000-000000000002','R1','BIT-R1-104B','Coord 104','2026-01-05','09:00','cerrada','c5000000-0000-4000-8000-000000000001'),
  ('f5000000-0000-4000-8000-000000000007','a5000000-0000-4000-8000-0000000000a1','d5000000-0000-4000-8000-000000000004','R1','BIT-R1-104D','Coord 104','2026-01-05','09:00','cerrada','c5000000-0000-4000-8000-000000000001');

-- ACL: ejecución solo service_role.
select ok(not has_function_privilege('authenticated','public.fn_advance_phase(uuid,uuid,smallint,jsonb,text,text)','EXECUTE'), 'ACL authenticated sin EXECUTE fn_advance_phase');
select ok(has_function_privilege('service_role','public.fn_advance_phase(uuid,uuid,smallint,jsonb,text,text)','EXECUTE'), 'ACL service_role con EXECUTE fn_advance_phase');
select ok(not has_function_privilege('authenticated','public.fn_reprogram_milestone(uuid,uuid,text,date,date,text,text,text,text)','EXECUTE'), 'ACL authenticated sin EXECUTE fn_reprogram_milestone');
select ok(has_function_privilege('service_role','public.fn_reprogram_milestone(uuid,uuid,text,date,date,text,text,text,text)','EXECUTE'), 'ACL service_role con EXECUTE fn_reprogram_milestone');

set local role authenticated;
set local request.jwt.claims = '{"sub":"c5000000-0000-4000-8000-000000000001","organization_id":"a5000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select throws_ok($sql$
  select public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',2::smallint,'{}'::jsonb)
$sql$, '42501', NULL, 'RPC no ejecutable por authenticated');
reset role;

set local role service_role;

-- EF-01: gates F2–F6 y transiciones +1.
select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',2::smallint,'{"entregable":"layout"}'::jsonb))->>'code',
  'GATE_CHECKLIST_R1', 'F2 sin checklist bloquea');
select is((select fase_actual from public.diagnostics where id='d5000000-0000-4000-8000-000000000001'), 1::smallint, 'F2 fallido no cambia fase');
reset role;
insert into public.document_checklist_items (diagnostic_id,item_code,estado) values ('d5000000-0000-4000-8000-000000000001','layout','validado_r1');
set local role service_role;
select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',2::smallint,'{"entregable":"layout"}'::jsonb))->>'ok',
  'true', 'F2 con checklist avanza');
select is((select fase_actual from public.diagnostics where id='d5000000-0000-4000-8000-000000000001'), 2::smallint, 'fase 2');
select is((select proximo_hito from public.diagnostics where id='d5000000-0000-4000-8000-000000000001'), 'R2', 'mapa 2→R2');
select is((select avance_pct from public.diagnostics where id='d5000000-0000-4000-8000-000000000001'), 33.3::numeric, 'avance 2=33.3');

select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',3::smallint,'{"entregable":"CAT"}'::jsonb))->>'code',
  'GATE_CAT_R2', 'F3 sin CAT bloquea');
reset role;
update public.diagnostics set cat_estado='validado_r2' where id='d5000000-0000-4000-8000-000000000001';
set local role service_role;
select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',3::smallint,'{"entregable":"CAT"}'::jsonb))->>'ok',
  'true', 'F3 con CAT avanza');
select is((select proximo_hito from public.diagnostics where id='d5000000-0000-4000-8000-000000000001'), 'V1', 'mapa 3→V1');

reset role;
insert into public.iih_assets (id,organization_id,diagnostic_id,folio,stage_code,asset_type_id,tag,ubicacion,estado_fisico,opera,criticidad,intervencion,prioridad,verificado_v1)
values ('e5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-0000000000a1','d5000000-0000-4000-8000-000000000001','CAP-104-01','CAP',(select id from public.iih_asset_types where stage_code='CAP' limit 1),'T104','U','bueno','si','alta','ninguna','media',false);
set local role service_role;
select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',4::smallint,'{"entregable":"IIH"}'::jsonb))->>'code',
  'GATE_IIH_V1', 'F4 sin IIH verificado bloquea');
reset role;
update public.iih_assets set verificado_v1=true where id='e5000000-0000-4000-8000-000000000001';
set local role service_role;
select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',4::smallint,'{"entregable":"IIH"}'::jsonb))->>'ok',
  'true', 'F4 con IIH verificado avanza');
select is((select proximo_hito from public.diagnostics where id='d5000000-0000-4000-8000-000000000001'), 'R3', 'mapa 4→R3');

select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',5::smallint,'{"entregable":"BHE"}'::jsonb))->>'code',
  'GATE_BHE_R3', 'F5 sin BHE bloquea');
reset role;
insert into public.water_balances (id,organization_id,diagnostic_id,periodo_anio,mes_inicio,estado)
values ('a5000000-0000-4000-8000-0000000000a9','a5000000-0000-4000-8000-0000000000a1','d5000000-0000-4000-8000-000000000001',2026,1,'validado_r3');
set local role service_role;
select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',5::smallint,'{"entregable":"BHE"}'::jsonb))->>'ok',
  'true', 'F5 con BHE avanza');
select is((select proximo_hito from public.diagnostics where id='d5000000-0000-4000-8000-000000000001'), 'R4', 'mapa 5→R4');

reset role;
insert into public.ivoh_evaluations (diagnostic_id,factor_code,version_id,puntaje,estado)
select 'd5000000-0000-4000-8000-000000000001', f, '00000000-0000-4000-8000-0000000000a1', 5, 'validado_r4'
from unnest(array['F1','F2','F3','F4','F5']) f;
set local role service_role;
select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',6::smallint,'{"entregable":"IVOH"}'::jsonb))->>'code',
  'GATE_IVOH_R4', 'F6 con 5/6 bloquea');
reset role;
insert into public.ivoh_evaluations (diagnostic_id,factor_code,version_id,puntaje,estado)
values ('d5000000-0000-4000-8000-000000000001','F6','00000000-0000-4000-8000-0000000000a1',5,'validado_r4');
set local role service_role;
select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',6::smallint,'{"entregable":"IVOH"}'::jsonb))->>'ok',
  'true', 'F6 con 6/6 avanza');
select is((select proximo_hito from public.diagnostics where id='d5000000-0000-4000-8000-000000000001'), 'R5', 'mapa 6→R5');
select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',6::smallint,'{}'::jsonb))->>'code',
  'CONFLICT_PHASE', 'fase 6 no avanza de nuevo');

-- Rol, tenant, estado y salto.
select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000003','d5000000-0000-4000-8000-000000000001',2::smallint,'{}'::jsonb))->>'code',
  'FORBIDDEN_ROLE', 'observador no avanza fase');
select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000005','d5000000-0000-4000-8000-000000000001',2::smallint,'{}'::jsonb))->>'code',
  'FORBIDDEN_ROLE', 'coordinador de otro tenant no avanza');
select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000002',3::smallint,'{}'::jsonb))->>'code',
  'CONFLICT_PHASE', 'salto de fase rechazado');
select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000003',2::smallint,'{}'::jsonb))->>'code',
  'CONFLICT_STATE', 'diagnóstico suspendido no avanza');

-- Idempotencia EF-01.
reset role;
insert into public.document_checklist_items (diagnostic_id,item_code,estado) values ('d5000000-0000-4000-8000-000000000004','layout','validado_r1');
set local role service_role;
select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000004',2::smallint,'{"entregable":"layout"}'::jsonb,'idem-1','hash-1'))->>'replayed',
  'false', 'EF-01 primera ejecución no replay');
select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000004',2::smallint,'{"entregable":"layout"}'::jsonb,'idem-1','hash-1'))->>'replayed',
  'true', 'EF-01 replay idempotente');
select is((public.fn_advance_phase('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000004',2::smallint,'{"entregable":"layout"}'::jsonb,'idem-1','hash-2'))->>'code',
  'CONFLICT_STATE', 'EF-01 idem key con otro hash conflicto');
select is((select fase_actual from public.diagnostics where id='d5000000-0000-4000-8000-000000000004'), 2::smallint, 'EF-01 replay no duplica fase');

-- EF-12: reprogramación, historial y semáforo.
select is((public.fn_reprogram_milestone('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','R1','2026-01-10','2026-01-20','Reprogramación por causa de la empresa con justificación suficiente.','empresa'))->>'ok',
  'true', 'EF-12 reprograma hito');
select is((select count(*) from public.milestone_reprogramming where diagnostic_id='d5000000-0000-4000-8000-000000000001'), 1::bigint, 'historial 1 reprogramación');
select is((select semaforo_atraso from public.diagnostics where id='d5000000-0000-4000-8000-000000000001'), 'amarillo', '1 reprogramación empresa → amarillo');
select is((public.fn_reprogram_milestone('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','R1','2026-02-01','2026-02-10','Segunda reprogramación de la empresa con justificación suficiente.','empresa'))->>'ok',
  'true', 'EF-12 segunda reprogramación');
select is((select count(*) from public.milestone_reprogramming where diagnostic_id='d5000000-0000-4000-8000-000000000001'), 2::bigint, 'historial 2 reprogramaciones');
select is((select semaforo_atraso from public.diagnostics where id='d5000000-0000-4000-8000-000000000001'), 'rojo', '2+ reprogramaciones → rojo');
select is((public.fn_reprogram_milestone('c5000000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000001','R1','2026-01-10','2026-01-20','Reprogramación por causa de la empresa con justificación suficiente.','empresa'))->>'code',
  'FORBIDDEN_ROLE', 'equipo no reprograma');
select is((public.fn_reprogram_milestone('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','R1','2026-01-10','2026-03-01','Reprogramación por causa de la empresa con justificación suficiente.','empresa'))->>'code',
  'VALIDATION_REPROGRAMACION', 'fecha fuera de 6 semanas rechazada');
select is((public.fn_reprogram_milestone('c5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','V2','2026-01-10','2026-01-20','Reprogramación por causa de la empresa con justificación suficiente.','empresa'))->>'code',
  'VALIDATION_HITO_SIN_FICHA', 'hito sin ficha rechazado');

-- RLS del historial y DML directo denegado.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c5000000-0000-4000-8000-000000000001","organization_id":"a5000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select is((select count(*) from public.milestone_reprogramming where diagnostic_id='d5000000-0000-4000-8000-000000000001'), 2::bigint, 'RLS historial: coordinador miembro ve 2');
set local request.jwt.claims = '{"sub":"c5000000-0000-4000-8000-000000000004","organization_id":"a5000000-0000-4000-8000-0000000000a1","global_role":"admin_institucional"}';
select is((select count(*) from public.milestone_reprogramming), 0::bigint, 'RLS historial: admin sin membresía ve 0');
select throws_ok($sql$
  insert into public.milestone_reprogramming (diagnostic_id,organization_id,hito,fecha_original,fecha_nueva,causa,justificacion,reprogramado_por)
  values ('d5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-0000000000a1','R1','2026-01-10','2026-01-20','empresa','Justificación suficientemente larga para el test','c5000000-0000-4000-8000-000000000001')
$sql$, '42501', NULL, 'DML directo en historial denegado');

reset role;
reset request.jwt.claims;
select * from finish();
rollback;
