-- F1-06c — pgTAP: TD-2, roles, documento↔ítem, ficha R1, RLS, inmutabilidad,
-- RPC EF-03 (ACL/idempotencia/tenant) y auditoría del checklist.
begin;
select plan(35);

insert into public.organizations (id, name, org_type) values
  ('a7000000-0000-4000-8000-0000000000a1','Org Checklist A','srhds'),
  ('a7000000-0000-4000-8000-0000000000b1','Org Checklist B','empresa');
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('c7000000-0000-4000-8000-000000000001','authenticated','authenticated','coord106@example.invalid',now(),now()),
  ('c7000000-0000-4000-8000-000000000002','authenticated','authenticated','equipo106@example.invalid',now(),now()),
  ('c7000000-0000-4000-8000-000000000003','authenticated','authenticated','empresa106@example.invalid',now(),now()),
  ('c7000000-0000-4000-8000-000000000004','authenticated','authenticated','obs106@example.invalid',now(),now()),
  ('c7000000-0000-4000-8000-000000000005','authenticated','authenticated','inv106@example.invalid',now(),now()),
  ('c7000000-0000-4000-8000-000000000006','authenticated','authenticated','admin106@example.invalid',now(),now());
insert into public.profiles (user_id, organization_id, full_name, email, global_role) values
  ('c7000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-0000000000a1','Coord 106','coord106@example.invalid','coordinador_srhds'),
  ('c7000000-0000-4000-8000-000000000002','a7000000-0000-4000-8000-0000000000a1','Equipo 106','equipo106@example.invalid','equipo'),
  ('c7000000-0000-4000-8000-000000000003','a7000000-0000-4000-8000-0000000000a1','Empresa 106','empresa106@example.invalid','empresa'),
  ('c7000000-0000-4000-8000-000000000004','a7000000-0000-4000-8000-0000000000a1','Obs 106','obs106@example.invalid','observador'),
  ('c7000000-0000-4000-8000-000000000005','a7000000-0000-4000-8000-0000000000a1','Inv 106','inv106@example.invalid','invitado'),
  ('c7000000-0000-4000-8000-000000000006','a7000000-0000-4000-8000-0000000000a1','Admin 106','admin106@example.invalid','admin_institucional');
insert into public.companies (id, organization_id, razon_social, nombre_planta, giro, calle, colonia_parque, cp, municipio, organismo_operador) values
  ('b7000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-0000000000a1','Empresa 106','Planta 106','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into public.diagnostics (id,organization_id,company_id,tipo,fecha_inicio,fecha_fin,index_version_id) values
  ('d7000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-0000000000a1','b7000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1'),
  ('d7000000-0000-4000-8000-000000000002','a7000000-0000-4000-8000-0000000000a1','b7000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1');
insert into public.project_members (diagnostic_id,user_id,organization_id,role) values
  ('d7000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-0000000000a1','coordinador'),
  ('d7000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000002','a7000000-0000-4000-8000-0000000000a1','equipo'),
  ('d7000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000003','a7000000-0000-4000-8000-0000000000a1','empresa'),
  ('d7000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000004','a7000000-0000-4000-8000-0000000000a1','observador');
insert into public.documents (id,organization_id,diagnostic_id,doc_type,title,r2_key,sha256,mime,size_bytes,uploaded_by) values
  ('e7000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-0000000000a1','d7000000-0000-4000-8000-000000000001','layout','layout','org/a/diag/d/e1.pdf',repeat('a',64),'application/pdf',10,'c7000000-0000-4000-8000-000000000001'),
  ('e7000000-0000-4000-8000-000000000002','a7000000-0000-4000-8000-0000000000a1','d7000000-0000-4000-8000-000000000002','layout','layout2','org/a/diag/d2/e2.pdf',repeat('b',64),'application/pdf',10,'c7000000-0000-4000-8000-000000000001');
insert into public.document_checklist_items (id,diagnostic_id,item_code,estado) values
  ('f7000000-0000-4000-8000-000000000001','d7000000-0000-4000-8000-000000000001','layout','no_recibido'),
  ('f7000000-0000-4000-8000-000000000002','d7000000-0000-4000-8000-000000000001','planos','no_recibido');

set local role authenticated;

-- 1-2. Creación: solo coordinador/equipo.
set local request.jwt.claims = '{"sub":"c7000000-0000-4000-8000-000000000001","organization_id":"a7000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select lives_ok($sql$
  insert into public.document_checklist_items (id,diagnostic_id,item_code,estado)
  values ('f7000000-0000-4000-8000-000000000003','d7000000-0000-4000-8000-000000000001','parametros_calidad','no_recibido')
$sql$, 'coordinador crea ítem');
select is((select count(*) from public.document_checklist_items where diagnostic_id='d7000000-0000-4000-8000-000000000001'), 3::bigint, 'ítem creado');

-- 3. Observador no crea.
set local request.jwt.claims = '{"sub":"c7000000-0000-4000-8000-000000000004","organization_id":"a7000000-0000-4000-8000-0000000000a1","global_role":"observador"}';
select throws_ok($sql$
  insert into public.document_checklist_items (id,diagnostic_id,item_code,estado)
  values ('f7000000-0000-4000-8000-000000000004','d7000000-0000-4000-8000-000000000001','iih','no_recibido')
$sql$, '42501', NULL, 'observador no crea ítem');

-- 4-5. Empresa: no_recibido→recibido exige documento.
set local request.jwt.claims = '{"sub":"c7000000-0000-4000-8000-000000000003","organization_id":"a7000000-0000-4000-8000-0000000000a1","global_role":"empresa"}';
select throws_ok($sql$
  update public.document_checklist_items set estado='recibido' where id='f7000000-0000-4000-8000-000000000001'
$sql$, 'P0001', NULL, 'empresa sin documento no recibe');
select lives_ok($sql$
  update public.document_checklist_items set estado='recibido', document_id='e7000000-0000-4000-8000-000000000001'
   where id='f7000000-0000-4000-8000-000000000001'
$sql$, 'empresa recibe con documento');

-- 6-8. Coordinador revisa; empresa y equipo NO validan R1.
set local request.jwt.claims = '{"sub":"c7000000-0000-4000-8000-000000000001","organization_id":"a7000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select lives_ok($sql$
  update public.document_checklist_items set estado='revisado' where id='f7000000-0000-4000-8000-000000000001'
$sql$, 'coordinador revisa');
set local request.jwt.claims = '{"sub":"c7000000-0000-4000-8000-000000000003","organization_id":"a7000000-0000-4000-8000-0000000000a1","global_role":"empresa"}';
select throws_ok($sql$
  update public.document_checklist_items set estado='validado_r1' where id='f7000000-0000-4000-8000-000000000001'
$sql$, '42501', NULL, 'empresa no valida R1');
set local request.jwt.claims = '{"sub":"c7000000-0000-4000-8000-000000000002","organization_id":"a7000000-0000-4000-8000-0000000000a1","global_role":"equipo"}';
select throws_ok($sql$
  update public.document_checklist_items set estado='validado_r1', document_id='e7000000-0000-4000-8000-000000000001'
   where id='f7000000-0000-4000-8000-000000000001'
$sql$, '42501', NULL, 'equipo no valida R1');

-- 9-11. Coordinador: validado_r1 exige documento y ficha R1; sin ficha ⇒ P0001.
set local request.jwt.claims = '{"sub":"c7000000-0000-4000-8000-000000000001","organization_id":"a7000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select throws_ok($sql$
  update public.document_checklist_items set estado='validado_r1', document_id=null where id='f7000000-0000-4000-8000-000000000001'
$sql$, 'P0001', NULL, 'validado_r1 sin documento rechazado');
select throws_ok($sql$
  update public.document_checklist_items set estado='validado_r1' where id='f7000000-0000-4000-8000-000000000001'
$sql$, 'P0001', NULL, 'validado_r1 sin ficha R1 rechazado');

-- Ficha R1 de la semana en curso (TD-2 #3), fixture como postgres.
reset role;
insert into public.logbook_entries
  (id,organization_id,diagnostic_id,clave,folio,responsable_sesion,fecha,horario_inicio,estado,created_by)
values
  ('aa700000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-0000000000a1','d7000000-0000-4000-8000-000000000001','R1','BIT-R1-106','Coord 106',current_date,'09:00','cerrada','c7000000-0000-4000-8000-000000000001');
set local role authenticated;

-- 12-13. Valida R1 con ficha; terminal explícito.
select lives_ok($sql$
  update public.document_checklist_items set estado='validado_r1' where id='f7000000-0000-4000-8000-000000000001'
$sql$, 'coordinador valida R1 con documento y ficha');
select throws_ok($sql$
  update public.document_checklist_items set estado='recibido' where id='f7000000-0000-4000-8000-000000000001'
$sql$, 'P0001', 'checklist: validado_r1 es terminal (CONFLICT_STATE).', 'validado_r1 es terminal');

-- 14-15. Coordinador: no_recibido→recibido exige solicitud_nota.
select throws_ok($sql$
  update public.document_checklist_items set estado='recibido' where id='f7000000-0000-4000-8000-000000000002'
$sql$, 'P0001', NULL, 'coordinador sin nota no recibe');
select lives_ok($sql$
  update public.document_checklist_items set estado='recibido', solicitud_nota='Falta plano firmado' where id='f7000000-0000-4000-8000-000000000002'
$sql$, 'coordinador recibe con nota');
select lives_ok($sql$
  update public.document_checklist_items set estado='revisado' where id='f7000000-0000-4000-8000-000000000002'
$sql$, 'coordinador revisa item de planos');

-- 16. Documento de otro diagnóstico (con solicitud_nota para llegar al check de documento).
insert into public.document_checklist_items (id,diagnostic_id,item_code,estado)
values ('f7000000-0000-4000-8000-000000000005','d7000000-0000-4000-8000-000000000001','otra','no_recibido');
select throws_ok($sql$
  update public.document_checklist_items set estado='recibido', solicitud_nota='Documento adjunto', document_id='e7000000-0000-4000-8000-000000000002'
   where id='f7000000-0000-4000-8000-000000000005'
$sql$, '42501', NULL, 'documento de otro diagnóstico rechazado');

-- 17-18. RLS lectura por membresía; admin sin membresía no lee.
set local request.jwt.claims = '{"sub":"c7000000-0000-4000-8000-000000000004","organization_id":"a7000000-0000-4000-8000-0000000000a1","global_role":"observador"}';
select is((select count(*) from public.document_checklist_items where diagnostic_id='d7000000-0000-4000-8000-000000000001'), 4::bigint, 'observador miembro lee checklist');
set local request.jwt.claims = '{"sub":"c7000000-0000-4000-8000-000000000006","organization_id":"a7000000-0000-4000-8000-0000000000a1","global_role":"admin_institucional"}';
select is((select count(*) from public.document_checklist_items where diagnostic_id='d7000000-0000-4000-8000-000000000001'), 0::bigint, 'admin sin membresía no lee checklist');

-- 19. DELETE no permitido.
set local request.jwt.claims = '{"sub":"c7000000-0000-4000-8000-000000000001","organization_id":"a7000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
with deleted as (delete from public.document_checklist_items where id='f7000000-0000-4000-8000-000000000005' returning 1)
select is((select count(*) from deleted), 0::bigint, 'DELETE no permitido por RLS');

-- 20-21. Auditoría DB y action='approve' al validar R1 (M2).
select ok((select count(*) from public.audit_log where entity='document_checklist_items') > 0, 'auditoría DB de checklist presente');
select ok((select count(*) from public.audit_log where entity='document_checklist_items' and action='approve') > 0, 'audit approve en validado_r1');

-- 22-25. SEC-PR54-02 / B4: ACL de funciones (solo service_role ejecuta la RPC).
select is(has_function_privilege('authenticated','public.fn_transition_checklist_item(uuid,uuid,text,uuid,text,text,text)','EXECUTE'), false, 'authenticated sin EXECUTE en fn_transition_checklist_item');
select is(has_function_privilege('service_role','public.fn_transition_checklist_item(uuid,uuid,text,uuid,text,text,text)','EXECUTE'), true, 'service_role con EXECUTE en fn_transition_checklist_item');
select is(has_function_privilege('authenticated','public.trg_checklist_transition()','EXECUTE'), false, 'authenticated sin EXECUTE en trg_checklist_transition');
select is(has_function_privilege('authenticated','public.trg_checklist_audit()','EXECUTE'), false, 'authenticated sin EXECUTE en trg_checklist_audit');

-- 26. Invocación autenticada directa a la RPC denegada (42501).
set local request.jwt.claims = '{"sub":"c7000000-0000-4000-8000-000000000001","organization_id":"a7000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select throws_ok($sql$
  select public.fn_transition_checklist_item(
    'c7000000-0000-4000-8000-000000000001'::uuid,
    'f7000000-0000-4000-8000-000000000002'::uuid,
    'recibido'::text)
$sql$, '42501', NULL, 'RPC no invocable por authenticated');

-- 27-30. RPC como service_role: happy, replay, conflicto y tenant.
reset role;
reset request.jwt.claims;
set local role service_role;
select ok((public.fn_transition_checklist_item(
  'c7000000-0000-4000-8000-000000000001'::uuid,
  'f7000000-0000-4000-8000-000000000003'::uuid,
  'recibido'::text, null, 'Solicitud RPC', 'k-rpc-1', 'hash-rpc-1')->>'ok')::boolean,
  'RPC service_role: transición válida');
select is((public.fn_transition_checklist_item(
  'c7000000-0000-4000-8000-000000000001'::uuid,
  'f7000000-0000-4000-8000-000000000003'::uuid,
  'recibido'::text, null, 'Solicitud RPC', 'k-rpc-1', 'hash-rpc-1')->>'replayed')::boolean,
  true, 'RPC replay idempotente');
select is((public.fn_transition_checklist_item(
  'c7000000-0000-4000-8000-000000000001'::uuid,
  'f7000000-0000-4000-8000-000000000003'::uuid,
  'recibido'::text, null, 'Otra solicitud', 'k-rpc-1', 'hash-rpc-2')->>'code'),
  'CONFLICT_STATE', 'RPC conflicto idempotencia');
select is((public.fn_transition_checklist_item(
  'c7000000-0000-4000-8000-000000000006'::uuid,
  'f7000000-0000-4000-8000-000000000002'::uuid,
  'revisado'::text)->>'code'),
  'FORBIDDEN_NOT_MEMBER', 'RPC tenant/membresía');

-- 31. SEC-PR54-01: diagnostic_id inmutable en UPDATE incluso con service_role (A→B).
select throws_ok($sql$
  update public.document_checklist_items set diagnostic_id='d7000000-0000-4000-8000-000000000002'
   where id='f7000000-0000-4000-8000-000000000005'
$sql$, '42501', NULL, 'diagnostic_id inmutable en UPDATE (service_role)');

-- 32. B4: equipo no puede validar R1 por RPC (403 FORBIDDEN_ROLE).
select is((public.fn_transition_checklist_item(
  'c7000000-0000-4000-8000-000000000002'::uuid,
  'f7000000-0000-4000-8000-000000000002'::uuid,
  'validado_r1'::text, 'e7000000-0000-4000-8000-000000000001'::uuid)->>'code'),
  'FORBIDDEN_ROLE', 'RPC equipo no valida R1');

-- 33. M1: validado_r1 terminal por RPC → CONFLICT_STATE.
select is((public.fn_transition_checklist_item(
  'c7000000-0000-4000-8000-000000000001'::uuid,
  'f7000000-0000-4000-8000-000000000001'::uuid,
  'recibido'::text)->>'code'),
  'CONFLICT_STATE', 'RPC validado_r1 terminal');

-- 34. B4: coordinador valida R1 por RPC (documento + ficha R1).
select is((public.fn_transition_checklist_item(
  'c7000000-0000-4000-8000-000000000001'::uuid,
  'f7000000-0000-4000-8000-000000000002'::uuid,
  'validado_r1'::text, 'e7000000-0000-4000-8000-000000000001'::uuid,
  null, 'k-rpc-2', 'hash-rpc-2')->>'ok')::boolean,
  true, 'RPC coordinador valida R1');

reset role;
reset request.jwt.claims;

-- 35. M2/B4: la RPC deja audit_log(action='approve') al validar R1.
select ok((select count(*) from public.audit_log
            where entity='document_checklist_items'
              and action='approve'
              and meta->>'item_code'='planos') > 0,
  'RPC audit approve en validado_r1');

select * from finish();
rollback;
