-- F1-05 — pgTAP: fn_register_document (EF-08 register), tenant/rol/idempotencia.
begin;
select plan(24);

insert into public.organizations (id, name, org_type) values
  ('a6000000-0000-4000-8000-0000000000a1','Org Register A','srhds'),
  ('a6000000-0000-4000-8000-0000000000b1','Org Register B','empresa');
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('c6000000-0000-4000-8000-000000000001','authenticated','authenticated','coord105@example.invalid',now(),now()),
  ('c6000000-0000-4000-8000-000000000002','authenticated','authenticated','equipo105@example.invalid',now(),now()),
  ('c6000000-0000-4000-8000-000000000003','authenticated','authenticated','empresa105@example.invalid',now(),now()),
  ('c6000000-0000-4000-8000-000000000004','authenticated','authenticated','obs105@example.invalid',now(),now()),
  ('c6000000-0000-4000-8000-000000000005','authenticated','authenticated','inv105@example.invalid',now(),now()),
  ('c6000000-0000-4000-8000-000000000006','authenticated','authenticated','admin105@example.invalid',now(),now());
insert into public.profiles (user_id, organization_id, full_name, email, global_role) values
  ('c6000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-0000000000a1','Coord 105','coord105@example.invalid','coordinador_srhds'),
  ('c6000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-0000000000a1','Equipo 105','equipo105@example.invalid','equipo'),
  ('c6000000-0000-4000-8000-000000000003','a6000000-0000-4000-8000-0000000000a1','Empresa 105','empresa105@example.invalid','empresa'),
  ('c6000000-0000-4000-8000-000000000004','a6000000-0000-4000-8000-0000000000a1','Obs 105','obs105@example.invalid','observador'),
  ('c6000000-0000-4000-8000-000000000005','a6000000-0000-4000-8000-0000000000a1','Inv 105','inv105@example.invalid','invitado'),
  ('c6000000-0000-4000-8000-000000000006','a6000000-0000-4000-8000-0000000000a1','Admin 105','admin105@example.invalid','admin_institucional');
insert into public.companies (id, organization_id, razon_social, nombre_planta, giro, calle, colonia_parque, cp, municipio, organismo_operador) values
  ('b6000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-0000000000a1','Empresa 105','Planta 105','manufacturera','Calle','Parque','87000','Victoria','COMAPA'),
  ('b6000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-0000000000b1','Empresa 105B','Planta 105B','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into public.diagnostics (id,organization_id,company_id,tipo,fecha_inicio,fecha_fin,index_version_id) values
  ('d6000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-0000000000a1','b6000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1'),
  ('d6000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-0000000000b1','b6000000-0000-4000-8000-000000000002','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1');
insert into public.project_members (diagnostic_id,user_id,organization_id,role) values
  ('d6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-0000000000a1','coordinador'),
  ('d6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-0000000000a1','equipo'),
  ('d6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000003','a6000000-0000-4000-8000-0000000000a1','empresa'),
  ('d6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000004','a6000000-0000-4000-8000-0000000000a1','observador'),
  ('d6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000005','a6000000-0000-4000-8000-0000000000a1','observador');

select ok(not has_function_privilege('authenticated','public.fn_register_document(uuid,uuid,uuid,text,text,text,bigint,text,text,text,text)','EXECUTE'), 'ACL authenticated sin EXECUTE register');
select ok(has_function_privilege('service_role','public.fn_register_document(uuid,uuid,uuid,text,text,text,bigint,text,text,text,text)','EXECUTE'), 'ACL service_role con EXECUTE register');

set local role service_role;

select is((public.fn_register_document('c6000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001','layout','layout.pdf','application/pdf',1024,repeat('a',64)))->>'ok',
  'true', 'coordinador registra documento');
select is((select count(*) from public.documents where id='f6000000-0000-4000-8000-000000000001'), 1::bigint, 'documents insertado');
select is((select r2_key from public.documents where id='f6000000-0000-4000-8000-000000000001'), 'org/a6000000-0000-4000-8000-0000000000a1/diag/d6000000-0000-4000-8000-000000000001/f6000000-0000-4000-8000-000000000001.pdf', 'r2_key server-side');
select is((select uploaded_by from public.documents where id='f6000000-0000-4000-8000-000000000001'), 'c6000000-0000-4000-8000-000000000001'::uuid, 'uploaded_by del usuario');
select is((select company_id from public.documents where id='f6000000-0000-4000-8000-000000000001'), 'b6000000-0000-4000-8000-000000000001'::uuid, 'company_id del diagnóstico');
select ok((select count(*) from public.audit_log where entity='documents' and action='create' and entity_id='f6000000-0000-4000-8000-000000000001') > 0, 'audit create en tx');

select is((public.fn_register_document('c6000000-0000-4000-8000-000000000002','f6000000-0000-4000-8000-000000000002','d6000000-0000-4000-8000-000000000001','otro','equipo.png','image/png',2048,repeat('b',64)))->>'ok', 'true', 'equipo registra documento');
select is((select count(*) from public.documents), 2::bigint, 'dos documentos');
select is((public.fn_register_document('c6000000-0000-4000-8000-000000000003','f6000000-0000-4000-8000-000000000003','d6000000-0000-4000-8000-000000000001','otro','empresa.pdf','application/pdf',512,repeat('c',64)))->>'ok', 'true', 'empresa registra documento');
select is((public.fn_register_document('c6000000-0000-4000-8000-000000000004','f6000000-0000-4000-8000-000000000004','d6000000-0000-4000-8000-000000000001','otro','obs.pdf','application/pdf',512,repeat('d',64)))->>'code',
  'FORBIDDEN_ROLE', 'observador no registra');
select is((public.fn_register_document('c6000000-0000-4000-8000-000000000005','f6000000-0000-4000-8000-000000000005','d6000000-0000-4000-8000-000000000001','otro','inv.pdf','application/pdf',512,repeat('e',64)))->>'code',
  'FORBIDDEN_ROLE', 'invitado no registra');
select is((public.fn_register_document('c6000000-0000-4000-8000-000000000006','f6000000-0000-4000-8000-000000000006','d6000000-0000-4000-8000-000000000001','otro','admin.pdf','application/pdf',512,repeat('f',64)))->>'code',
  'FORBIDDEN_ROLE', 'admin sin membresía no registra');
select is((public.fn_register_document('c6000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000007','d6000000-0000-4000-8000-000000000002','otro','cross.pdf','application/pdf',512,repeat('1',64)))->>'code',
  'FORBIDDEN_ROLE', 'cross-tenant rechazado');

select is((public.fn_register_document('c6000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000008','d6000000-0000-4000-8000-000000000001','otro','x.pdf','application/pdf',0,repeat('a',64)))->>'code',
  'VALIDATION_FILE', 'size inválido');
select is((public.fn_register_document('c6000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000009','d6000000-0000-4000-8000-000000000001','otro','x.exe','application/x-msdownload',10,repeat('a',64)))->>'code',
  'VALIDATION_FILE', 'mime inválido');
select is((public.fn_register_document('c6000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-00000000000a','d6000000-0000-4000-8000-000000000001','otro','x.pdf','application/pdf',10,'xyz'))->>'code',
  'VALIDATION_FILE', 'sha256 inválido');

select is((public.fn_register_document('c6000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001','otro','dup.pdf','application/pdf',10,repeat('a',64)))->>'code',
  'CONFLICT_STATE', 'documento duplicado conflicto');
select is((select count(*) from public.documents), 3::bigint, 'duplicado no inserta');

select is((public.fn_register_document('c6000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-00000000000b','d6000000-0000-4000-8000-000000000001','otro','idem.pdf','application/pdf',10,repeat('2',64),'restringido_nda','reg-1','rh-1'))->>'ok', 'true', 'registro idempotente');
select is((public.fn_register_document('c6000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-00000000000b','d6000000-0000-4000-8000-000000000001','otro','idem.pdf','application/pdf',10,repeat('2',64),'restringido_nda','reg-1','rh-1'))->>'replayed', 'true', 'replay idempotente');
select is((public.fn_register_document('c6000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-00000000000b','d6000000-0000-4000-8000-000000000001','otro','idem.pdf','application/pdf',10,repeat('2',64),'restringido_nda','reg-1','rh-2'))->>'code', 'CONFLICT_STATE', 'idem key con otro hash');
select is((select count(*) from public.documents), 4::bigint, 'replay no duplica documents');

reset role;
reset request.jwt.claims;
select * from finish();
rollback;
