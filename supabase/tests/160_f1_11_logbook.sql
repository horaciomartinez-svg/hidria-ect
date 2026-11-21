-- F1-11 task-172 — pgTAP Bitácora: estados, seed, firmas, 24h, guards y RPC.
begin;
select plan(23);

insert into public.organizations (id,name,org_type) values
  ('ad000000-0000-4000-8000-0000000000a1','Org LB A','srhds'),
  ('ad000000-0000-4000-8000-0000000000b1','Org LB B','empresa');
insert into auth.users (id,aud,role,email,created_at,updated_at) values
  ('cd000000-0000-4000-8000-000000000001','authenticated','authenticated','coord112@example.invalid',now(),now()),
  ('cd000000-0000-4000-8000-000000000002','authenticated','authenticated','equipo112@example.invalid',now(),now()),
  ('cd000000-0000-4000-8000-000000000003','authenticated','authenticated','obs112@example.invalid',now(),now());
insert into public.profiles (user_id,organization_id,full_name,email,global_role) values
  ('cd000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-0000000000a1','Coord 112','coord112@example.invalid','coordinador_srhds'),
  ('cd000000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-0000000000a1','Equipo 112','equipo112@example.invalid','equipo'),
  ('cd000000-0000-4000-8000-000000000003','ad000000-0000-4000-8000-0000000000a1','Obs 112','obs112@example.invalid','observador');
insert into public.companies (id,organization_id,razon_social,nombre_planta,giro,calle,colonia_parque,cp,municipio,organismo_operador) values
  ('bd000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-0000000000a1','Empresa LB','Planta LB','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into public.diagnostics (id,organization_id,company_id,tipo,fecha_inicio,fecha_fin,index_version_id) values
  ('dd000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-0000000000a1','bd000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1');
insert into public.project_members (diagnostic_id,user_id,organization_id,role) values
  ('dd000000-0000-4000-8000-000000000001','cd000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-0000000000a1','coordinador'),
  ('dd000000-0000-4000-8000-000000000001','cd000000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-0000000000a1','equipo'),
  ('dd000000-0000-4000-8000-000000000001','cd000000-0000-4000-8000-000000000003','ad000000-0000-4000-8000-0000000000a1','observador');
insert into public.logbook_entries (id,diagnostic_id,clave,fecha,horario_inicio,responsable_sesion,created_by) values
  ('ed000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000001','V1',current_date,'09:00','Coord','cd000000-0000-4000-8000-000000000001'),
  ('ed000000-0000-4000-8000-000000000002','dd000000-0000-4000-8000-000000000001','V2',current_date,'09:00','Coord','cd000000-0000-4000-8000-000000000001'),
  ('ed000000-0000-4000-8000-000000000003','dd000000-0000-4000-8000-000000000001','V3',current_date,'09:00','Coord','cd000000-0000-4000-8000-000000000001'),
  ('ed000000-0000-4000-8000-000000000004','dd000000-0000-4000-8000-000000000001','R1',current_date,'09:00','Coord','cd000000-0000-4000-8000-000000000001'),
  ('ed000000-0000-4000-8000-000000000005','dd000000-0000-4000-8000-000000000001','R2',current_date-2,'09:00','Coord','cd000000-0000-4000-8000-000000000001'),
  ('ed000000-0000-4000-8000-000000000006','dd000000-0000-4000-8000-000000000001','R3',current_date,'09:00','Coord','cd000000-0000-4000-8000-000000000001'),
  ('ed000000-0000-4000-8000-000000000007','dd000000-0000-4000-8000-000000000001','R4',current_date,'09:00','Coord','cd000000-0000-4000-8000-000000000001'),
  ('ed000000-0000-4000-8000-000000000008','dd000000-0000-4000-8000-000000000001','R5',current_date,'09:00','Coord','cd000000-0000-4000-8000-000000000001');
insert into public.documents (id,organization_id,diagnostic_id,doc_type,title,r2_key,sha256,mime,size_bytes,uploaded_by) values
  ('fd000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-0000000000a1','dd000000-0000-4000-8000-000000000001','otro','acta.pdf','lb/a.pdf',repeat('a',64),'application/pdf',10,'cd000000-0000-4000-8000-000000000001');
insert into public.logbook_participants (entry_id,nombre,cargo,institucion) values
  ('ed000000-0000-4000-8000-000000000004','Dirección','Dirección','Empresa'),
  ('ed000000-0000-4000-8000-000000000004','Responsable','Planta','Empresa'),
  ('ed000000-0000-4000-8000-000000000004','Técnico','Técnico','SRHDS'),
  ('ed000000-0000-4000-8000-000000000005','Contraparte','Técnica','Empresa'),
  ('ed000000-0000-4000-8000-000000000005','Técnico2','Técnico','SRHDS');
update public.logbook_evidence set document_id='fd000000-0000-4000-8000-000000000001'
 where entry_id in ('ed000000-0000-4000-8000-000000000004','ed000000-0000-4000-8000-000000000005');

select is((select count(*) from public.logbook_entries),8::bigint,'8 fichas creadas');
select is((select count(distinct clave) from public.logbook_entries),8::bigint,'8 claves');
select is((select organization_id from public.logbook_entries where id='ed000000-0000-4000-8000-000000000001'),'ad000000-0000-4000-8000-0000000000a1','org server-side');
select ok((select folio like 'BIT-%' from public.logbook_entries where id='ed000000-0000-4000-8000-000000000001'),'folio server-side');
select is((select count(*) from public.logbook_agenda where entry_id='ed000000-0000-4000-8000-000000000001'),5::bigint,'agenda seed 5');
select is((select count(*) from public.logbook_evidence where entry_id='ed000000-0000-4000-8000-000000000001'),3::bigint,'evidence seed 3');
select is((select estado from public.logbook_entries where id='ed000000-0000-4000-8000-000000000001'),'abierta','estado inicial abierta');

set local role service_role;
set local request.jwt.claims='{}';
select ok(has_function_privilege('service_role','public.fn_close_logbook(uuid,uuid,text,text,text)','EXECUTE'),'ACL service close');
select is((public.fn_close_logbook('cd000000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000002'))->>'code','CONFLICT_STATE','close desde abierta rechazado');
select is((public.fn_submit_logbook_review('cd000000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000004'))->'data'->>'estado','en_revision','submit review');
select is((public.fn_sign_logbook_participant('cd000000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000004','Dirección'))->>'ok','true','firma 1');
select is((public.fn_sign_logbook_participant('cd000000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000004','Responsable'))->>'ok','true','firma 2');
select is((public.fn_sign_logbook_participant('cd000000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000004','Técnico'))->>'ok','true','firma 3');
select is((public.fn_close_logbook('cd000000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000004'))->>'ok','true','close R1 OK');
select is((select estado from public.logbook_entries where id='ed000000-0000-4000-8000-000000000004'),'cerrada','R1 cerrada');

set local role authenticated;
set local request.jwt.claims='{"sub":"cd000000-0000-4000-8000-000000000001","organization_id":"ad000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select throws_ok($sql$ update public.logbook_entries set estado='abierta' where id='ed000000-0000-4000-8000-000000000004' $sql$,'42501',NULL,'post-cierre entrada 42501');
select throws_ok($sql$ insert into public.logbook_agenda(entry_id,no,actividad) values ('ed000000-0000-4000-8000-000000000004',99,'x') $sql$,'42501',NULL,'post-cierre hija 42501');
reset role;
reset request.jwt.claims;

set local role service_role;
set local request.jwt.claims='{}';
select is((public.fn_submit_logbook_review('cd000000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000005'))->'data'->>'estado','en_revision','submit R2');
select is((public.fn_sign_logbook_participant('cd000000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000005','Contraparte'))->>'ok','true','firma R2 1');
select is((public.fn_sign_logbook_participant('cd000000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000005','Técnico2'))->>'ok','true','firma R2 2');
select is((public.fn_close_logbook('cd000000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000005'))->>'code','VALIDATION_RAZON','cierre tardío sin razón');
select is((public.fn_close_logbook('cd000000-0000-4000-8000-000000000001','ed000000-0000-4000-8000-000000000005','Justificación suficientemente larga para el cierre tardío'))->>'ok','true','cierre tardío con razón');
select is((select cierre_tardio from public.logbook_entries where id='ed000000-0000-4000-8000-000000000005'),true,'cierre_tardio true');
reset role;
reset request.jwt.claims;

select * from finish();
rollback;
