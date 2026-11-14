-- F1-07c â€” pgTAP: seed CAT A1-v1, RLS y validaciÃ³n de cat_responses.
begin;
select plan(32);

select is((select count(*) from public.cat_items where version='A1-v1'), 47::bigint, 'seed CAT A1-v1=47');
select is((select count(distinct seccion) from public.cat_items where version='A1-v1'), 8::bigint, '8 secciones A1-v1');
select is((select count(*) from public.cat_items where version='A1-v1' and orden between 1 and 47), 47::bigint, 'orden 1..47');

insert into public.organizations (id,name,org_type) values
  ('a8000000-0000-4000-8000-0000000000a1','Org CAT A','srhds'),
  ('a8000000-0000-4000-8000-0000000000b1','Org CAT B','empresa');
insert into auth.users (id,aud,role,email,created_at,updated_at) values
  ('c8000000-0000-4000-8000-000000000001','authenticated','authenticated','coord107@example.invalid',now(),now()),
  ('c8000000-0000-4000-8000-000000000002','authenticated','authenticated','equipo107@example.invalid',now(),now()),
  ('c8000000-0000-4000-8000-000000000003','authenticated','authenticated','empresa107@example.invalid',now(),now()),
  ('c8000000-0000-4000-8000-000000000004','authenticated','authenticated','obs107@example.invalid',now(),now()),
  ('c8000000-0000-4000-8000-000000000005','authenticated','authenticated','inv107@example.invalid',now(),now()),
  ('c8000000-0000-4000-8000-000000000006','authenticated','authenticated','admin107@example.invalid',now(),now());
insert into public.profiles (user_id,organization_id,full_name,email,global_role) values
  ('c8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-0000000000a1','Coord 107','coord107@example.invalid','coordinador_srhds'),
  ('c8000000-0000-4000-8000-000000000002','a8000000-0000-4000-8000-0000000000a1','Equipo 107','equipo107@example.invalid','equipo'),
  ('c8000000-0000-4000-8000-000000000003','a8000000-0000-4000-8000-0000000000a1','Empresa 107','empresa107@example.invalid','empresa'),
  ('c8000000-0000-4000-8000-000000000004','a8000000-0000-4000-8000-0000000000a1','Obs 107','obs107@example.invalid','observador'),
  ('c8000000-0000-4000-8000-000000000005','a8000000-0000-4000-8000-0000000000a1','Inv 107','inv107@example.invalid','invitado'),
  ('c8000000-0000-4000-8000-000000000006','a8000000-0000-4000-8000-0000000000a1','Admin 107','admin107@example.invalid','admin_institucional');
insert into public.companies (id,organization_id,razon_social,nombre_planta,giro,calle,colonia_parque,cp,municipio,organismo_operador) values
  ('b8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-0000000000a1','Empresa CAT','Planta CAT','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into public.diagnostics (id,organization_id,company_id,tipo,fecha_inicio,fecha_fin,cat_estado,index_version_id) values
  ('d8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-0000000000a1','b8000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12','en_captura','00000000-0000-4000-8000-0000000000a1'),
  ('d8000000-0000-4000-8000-000000000002','a8000000-0000-4000-8000-0000000000b1','b8000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12','en_captura','00000000-0000-4000-8000-0000000000a1');
insert into public.project_members (diagnostic_id,user_id,organization_id,role) values
  ('d8000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-0000000000a1','coordinador'),
  ('d8000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000002','a8000000-0000-4000-8000-0000000000a1','equipo'),
  ('d8000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000003','a8000000-0000-4000-8000-0000000000a1','empresa'),
  ('d8000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000004','a8000000-0000-4000-8000-0000000000a1','observador'),
  ('d8000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000005','a8000000-0000-4000-8000-0000000000a1','observador');
insert into public.documents (id,organization_id,diagnostic_id,doc_type,title,r2_key,sha256,mime,size_bytes,uploaded_by) values
  ('e8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-0000000000a1','d8000000-0000-4000-8000-000000000001','otro','cat evidencia','org/a/diag/d1/e1.pdf',repeat('a',64),'application/pdf',10,'c8000000-0000-4000-8000-000000000001'),
  ('e8000000-0000-4000-8000-000000000002','a8000000-0000-4000-8000-0000000000a1','d8000000-0000-4000-8000-000000000002','otro','cat evidencia 2','org/a/diag/d2/e2.pdf',repeat('b',64),'application/pdf',10,'c8000000-0000-4000-8000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"c8000000-0000-4000-8000-000000000003","organization_id":"a8000000-0000-4000-8000-0000000000a1","global_role":"empresa"}';
select is((select count(*) from public.cat_items where version='A1-v1'), 47::bigint, 'empresa lee cat_items');
select lives_ok($sql$
  insert into public.cat_responses (diagnostic_id,item_id,valor,created_by)
  select 'd8000000-0000-4000-8000-000000000001', id, '"manufacturera"'::jsonb, 'c8000000-0000-4000-8000-000000000003'
   from public.cat_items where version='A1-v1' and codigo='A3'
$sql$, 'empresa responde opciÃ³n vÃ¡lida');

set local request.jwt.claims = '{"sub":"c8000000-0000-4000-8000-000000000004","organization_id":"a8000000-0000-4000-8000-0000000000a1","global_role":"observador"}';
select throws_ok($sql$
  insert into public.cat_responses (diagnostic_id,item_id,valor,created_by)
  select 'd8000000-0000-4000-8000-000000000001', id, '["pozo"]'::jsonb, 'c8000000-0000-4000-8000-000000000004'
   from public.cat_items where version='A1-v1' and codigo='B1'
$sql$, '42501', NULL, 'observador no escribe CAT');

set local request.jwt.claims = '{"sub":"c8000000-0000-4000-8000-000000000005","organization_id":"a8000000-0000-4000-8000-0000000000a1","global_role":"invitado"}';
select throws_ok($sql$
  insert into public.cat_responses (diagnostic_id,item_id,valor,created_by)
  select 'd8000000-0000-4000-8000-000000000001', id, '["pozo"]'::jsonb, 'c8000000-0000-4000-8000-000000000005'
   from public.cat_items where version='A1-v1' and codigo='B1'
$sql$, '42501', NULL, 'invitado no escribe CAT');

set local request.jwt.claims = '{"sub":"c8000000-0000-4000-8000-000000000003","organization_id":"a8000000-0000-4000-8000-0000000000a1","global_role":"empresa"}';
select throws_ok($sql$
  insert into public.cat_responses (diagnostic_id,item_id,valor,created_by)
  select 'd8000000-0000-4000-8000-000000000001', id, '"opcion_invalida"'::jsonb, 'c8000000-0000-4000-8000-000000000003'
   from public.cat_items where version='A1-v1' and codigo='B4'
$sql$, '23514', NULL, 'opciÃ³n invÃ¡lida rechazada');
select throws_ok($sql$
  insert into public.cat_responses (diagnostic_id,item_id,valor,created_by)
  select 'd8000000-0000-4000-8000-000000000001', id, '["pozo","no_existe"]'::jsonb, 'c8000000-0000-4000-8000-000000000003'
   from public.cat_items where version='A1-v1' and codigo='B1'
$sql$, '23514', NULL, 'multiple invÃ¡lido rechazado');
select lives_ok($sql$
  insert into public.cat_responses (diagnostic_id,item_id,no_se,created_by)
  select 'd8000000-0000-4000-8000-000000000001', id, true, 'c8000000-0000-4000-8000-000000000003'
   from public.cat_items where version='A1-v1' and codigo='A1'
$sql$, 'no_se explÃ­cito permitido');
select throws_ok($sql$
  insert into public.cat_responses (diagnostic_id,item_id,valor,document_id,created_by)
  select 'd8000000-0000-4000-8000-000000000001', id, '["pozo"]'::jsonb, 'e8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000003'
   from public.cat_items where version='A1-v1' and codigo='B1'
$sql$, '42501', NULL, 'documento de otro diagnÃ³stico rechazado');

set local request.jwt.claims = '{"sub":"c8000000-0000-4000-8000-000000000004","organization_id":"a8000000-0000-4000-8000-0000000000a1","global_role":"observador"}';
select is((select count(*) from public.cat_responses where diagnostic_id='d8000000-0000-4000-8000-000000000001'), 2::bigint, 'observador miembro lee cat_responses');
set local request.jwt.claims = '{"sub":"c8000000-0000-4000-8000-000000000006","organization_id":"a8000000-0000-4000-8000-0000000000a1","global_role":"admin_institucional"}';
select is((select count(*) from public.cat_responses where diagnostic_id='d8000000-0000-4000-8000-000000000001'), 0::bigint, 'admin sin membresÃ­a no lee cat_responses');
set local request.jwt.claims = '{"sub":"c8000000-0000-4000-8000-000000000001","organization_id":"a8000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
with deleted as (delete from public.cat_responses where diagnostic_id='d8000000-0000-4000-8000-000000000001' returning 1)
select is((select count(*) from deleted), 0::bigint, 'DELETE de cat_responses no permitido');
select ok((select count(*) from public.audit_log where entity='cat_responses') > 0, 'auditorÃ­a DB de CAT presente');

-- SEC-PR58-01 / M1: inmutabilidad y validaciones de UPDATE.
set local request.jwt.claims = '{"sub":"c8000000-0000-4000-8000-000000000001","organization_id":"a8000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select throws_ok($sql$
  update public.cat_responses set diagnostic_id='d8000000-0000-4000-8000-000000000002'
   where diagnostic_id='d8000000-0000-4000-8000-000000000001' and item_id=(select id from public.cat_items where version='A1-v1' and codigo='A3')
$sql$, '42501', NULL, 'diagnostic_id inmutable en UPDATE');
select throws_ok($sql$
  update public.cat_responses set item_id=(select id from public.cat_items where version='A1-v1' and codigo='B4')
   where diagnostic_id='d8000000-0000-4000-8000-000000000001' and item_id=(select id from public.cat_items where version='A1-v1' and codigo='A3')
$sql$, '42501', NULL, 'item_id inmutable en UPDATE');
select throws_ok($sql$
  update public.cat_responses set created_by='c8000000-0000-4000-8000-000000000001'
   where diagnostic_id='d8000000-0000-4000-8000-000000000001' and item_id=(select id from public.cat_items where version='A1-v1' and codigo='A3')
$sql$, '42501', NULL, 'created_by inmutable en UPDATE');
set local request.jwt.claims = '{"sub":"c8000000-0000-4000-8000-000000000004","organization_id":"a8000000-0000-4000-8000-0000000000a1","global_role":"observador"}';
select throws_ok($sql$
  update public.cat_responses set valor='"manufacturera"'::jsonb
   where diagnostic_id='d8000000-0000-4000-8000-000000000001' and item_id=(select id from public.cat_items where version='A1-v1' and codigo='A3')
$sql$, '42501', NULL, 'observador no actualiza CAT');

set local request.jwt.claims = '{"sub":"c8000000-0000-4000-8000-000000000003","organization_id":"a8000000-0000-4000-8000-0000000000a1","global_role":"empresa"}';
select throws_ok($sql$
  insert into public.cat_responses (diagnostic_id,item_id,no_se,na,created_by)
  select 'd8000000-0000-4000-8000-000000000001', id, true, true, 'c8000000-0000-4000-8000-000000000003'
   from public.cat_items where version='A1-v1' and codigo='B2'
$sql$, '23514', NULL, 'no_se y na excluyentes');
select throws_ok($sql$
  insert into public.cat_responses (diagnostic_id,item_id,valor,created_by)
  select 'd8000000-0000-4000-8000-000000000001', id, '[]'::jsonb, 'c8000000-0000-4000-8000-000000000003'
   from public.cat_items where version='A1-v1' and codigo='B1'
$sql$, '23514', NULL, 'multiple vacío rechazado');
select throws_ok($sql$
  insert into public.cat_responses (diagnostic_id,item_id,valor,created_by)
  select 'd8000000-0000-4000-8000-000000000001', id, '["pozo","pozo"]'::jsonb, 'c8000000-0000-4000-8000-000000000003'
   from public.cat_items where version='A1-v1' and codigo='B1'
$sql$, '23514', NULL, 'multiple duplicado rechazado');

-- RPC EF-04: ACL.
reset role;
select ok(not has_function_privilege('authenticated','public.fn_submit_cat(uuid,uuid,text,text)','EXECUTE'), 'ACL authenticated sin EXECUTE submit');
select ok(has_function_privilege('service_role','public.fn_submit_cat(uuid,uuid,text,text)','EXECUTE'), 'ACL service_role con EXECUTE submit');
select ok(not has_function_privilege('authenticated','public.fn_validate_cat_r2(uuid,uuid,uuid,text,text)','EXECUTE'), 'ACL authenticated sin EXECUTE validate');
select ok(has_function_privilege('service_role','public.fn_validate_cat_r2(uuid,uuid,uuid,text,text)','EXECUTE'), 'ACL service_role con EXECUTE validate');

-- RPC submit incompleto.
set local request.jwt.claims = '{}';
set local role service_role;
select is((public.fn_submit_cat('c8000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001'))->>'code', 'VALIDATION_CAT_INCOMPLETO', 'submit incompleto lista faltantes');

-- Completar A1-v1 y submit atómico/idempotente.
reset role;
insert into public.cat_responses (diagnostic_id,item_id,valor,created_by)
select 'd8000000-0000-4000-8000-000000000001', ci.id,
  case ci.tipo
    when 'opcion_unica' then to_jsonb(ci.opciones->>0)
    when 'multiple' then jsonb_build_array(ci.opciones->>0)
    else to_jsonb('respuesta'::text)
  end,
  'c8000000-0000-4000-8000-000000000001'
from public.cat_items ci
where ci.version='A1-v1'
on conflict (diagnostic_id,item_id) do nothing;
set local request.jwt.claims = '{}';
set local role service_role;
select is((public.fn_submit_cat('c8000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001','cat-1','cat-h1'))->>'ok', 'true', 'submit completo');
select is((select cat_estado from public.diagnostics where id='d8000000-0000-4000-8000-000000000001'), 'en_revision', 'submit mueve a en_revision');
select is((public.fn_submit_cat('c8000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001','cat-1','cat-h1'))->>'replayed', 'true', 'submit replay');
select is((public.fn_submit_cat('c8000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001','cat-1','cat-h2'))->>'code', 'CONFLICT_STATE', 'submit hash distinto');
select is((public.fn_validate_cat_r2('c8000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000001'))->>'code', 'GATE_R2_FICHA', 'validate sin ficha R2');

reset role;
insert into public.logbook_entries (id,organization_id,diagnostic_id,clave,folio,responsable_sesion,fecha,horario_inicio,estado,created_by)
values ('f8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-0000000000a1','d8000000-0000-4000-8000-000000000001','R2','BIT-R2-CAT','Coord','2026-01-12','09:00','cerrada','c8000000-0000-4000-8000-000000000001');
insert into public.logbook_findings (entry_id,tema,texto,links) values ('f8000000-0000-4000-8000-000000000001','no_se','Plan de resolución de no sé','[]'::jsonb);
set local request.jwt.claims = '{}';
set local role service_role;
select is((public.fn_validate_cat_r2('c8000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000001','cat-v1','cat-vh1'))->>'ok', 'true', 'validate R2 completo');
select is((select cat_estado from public.diagnostics where id='d8000000-0000-4000-8000-000000000001'), 'validado_r2', 'validate mueve a validado_r2');

reset role;
reset request.jwt.claims;
select * from finish();
rollback;
