-- F1 task-35 — pgTAP: alcance de `invitado` (Q-02/SEC-PR7-D2)
-- Matriz: diagnostics membresía/agregado SRHDS; profiles invitado solo suyo;
-- companies EXISTS; resto de tenant-wide invitado solo con membresía.
begin;

select plan(21);

-- Fixtures sintéticas (postgres; sin datos reales)
insert into public.organizations (id, name, org_type) values
  ('a1000000-0000-4000-8000-0000000000a1','Org Inv A','srhds'),
  ('a1000000-0000-4000-8000-0000000000b1','Org Inv B','empresa');
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('c3000000-0000-4000-8000-000000000001','authenticated','authenticated','inv0@example.invalid',now(),now()),
  ('c3000000-0000-4000-8000-000000000002','authenticated','authenticated','inv1@example.invalid',now(),now()),
  ('c3000000-0000-4000-8000-000000000003','authenticated','authenticated','obs35@example.invalid',now(),now()),
  ('c3000000-0000-4000-8000-000000000004','authenticated','authenticated','coord35@example.invalid',now(),now()),
  ('c3000000-0000-4000-8000-000000000005','authenticated','authenticated','admin35@example.invalid',now(),now()),
  ('c3000000-0000-4000-8000-000000000006','authenticated','authenticated','equip35@example.invalid',now(),now()),
  ('c3000000-0000-4000-8000-000000000007','authenticated','authenticated','emp35@example.invalid',now(),now());
insert into public.profiles (user_id, organization_id, full_name, email, global_role) values
  ('c3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-0000000000a1','Invitado 0','inv0@example.invalid','invitado'),
  ('c3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-0000000000a1','Invitado 1','inv1@example.invalid','invitado'),
  ('c3000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-0000000000a1','Observador','obs35@example.invalid','observador'),
  ('c3000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-0000000000a1','Coordinador','coord35@example.invalid','coordinador_srhds'),
  ('c3000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-0000000000a1','Admin','admin35@example.invalid','admin_institucional'),
  ('c3000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-0000000000a1','Equipo','equip35@example.invalid','equipo'),
  ('c3000000-0000-4000-8000-000000000007','a1000000-0000-4000-8000-0000000000a1','Empresa','emp35@example.invalid','empresa');
insert into public.companies (id, organization_id, razon_social, nombre_planta, giro,
  calle, colonia_parque, cp, municipio, organismo_operador) values
  ('b2000000-0000-4000-8000-0000000000a1','a1000000-0000-4000-8000-0000000000a1','Empresa Inv A1','Planta A1','manufacturera','Calle','Parque','87000','Victoria','COMAPA'),
  ('b2000000-0000-4000-8000-0000000000a2','a1000000-0000-4000-8000-0000000000a1','Empresa Inv A2','Planta A2','manufacturera','Calle','Parque','87000','Victoria','COMAPA'),
  ('b2000000-0000-4000-8000-0000000000b1','a1000000-0000-4000-8000-0000000000b1','Empresa Inv B1','Planta B1','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio, fecha_fin, index_version_id) values
  ('d2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-0000000000a1','b2000000-0000-4000-8000-0000000000a1','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1'),
  ('d2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-0000000000a1','b2000000-0000-4000-8000-0000000000a2','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1'),
  ('d2000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-0000000000b1','b2000000-0000-4000-8000-0000000000b1','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1');
insert into public.project_members (diagnostic_id, user_id, organization_id, role) values
  ('d2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-0000000000a1','observador'),
  ('d2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-0000000000a1','observador'),
  ('d2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-0000000000a1','coordinador'),
  ('d2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000007','a1000000-0000-4000-8000-0000000000a1','empresa');

set local role authenticated;

-- Invitado sin membresía: sin tenant-wide.
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000001","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"invitado"}';
select is((select count(*) from public.diagnostics), 0::bigint, 'invitado sin membresía: 0 diagnósticos');
select is((select count(*) from public.profiles), 1::bigint, 'invitado sin membresía: solo su perfil');
select is((select count(*) from public.companies), 0::bigint, 'invitado sin membresía: 0 empresas');
select is((select count(*) from public.v_diagnostic_completeness), 0::bigint, 'invitado sin membresía: vista completeness 0');
select is((select count(*) from public.v_bhe_monthly), 0::bigint, 'invitado sin membresía: vista BHE 0');

-- Invitado con membresía (role observador): solo su diagnóstico/empresa.
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000002","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"invitado"}';
select is((select count(*) from public.diagnostics), 1::bigint, 'invitado con membresía: 1 diagnóstico');
select is((select count(*) from public.companies), 1::bigint, 'invitado con membresía: 1 empresa');
select is((select count(*) from public.profiles), 1::bigint, 'invitado con membresía: solo su perfil');
select is((select count(*) from public.v_diagnostic_completeness), 1::bigint, 'invitado con membresía: completeness 1');

-- Observador con membresía: conserva visibilidad.
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000003","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"observador"}';
select is((select count(*) from public.diagnostics), 1::bigint, 'observador con membresía: 1 diagnóstico');

-- Agregado SRHDS: admin/coordinador ven el tenant.
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000004","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select is((select count(*) from public.diagnostics), 2::bigint, 'coordinador: 2 diagnósticos del tenant');
select is((select count(*) from public.companies), 2::bigint, 'coordinador: 2 empresas del tenant');
select is((select count(*) from public.diagnostics where id='d2000000-0000-4000-8000-000000000003'), 0::bigint, 'coordinador no ve diag de otro tenant');

set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000005","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"admin_institucional"}';
select is((select count(*) from public.diagnostics), 2::bigint, 'admin: 2 diagnósticos del tenant');

-- Equipo sin membresía: 0; empresa con membresía: 1.
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000006","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"equipo"}';
select is((select count(*) from public.diagnostics), 0::bigint, 'equipo sin membresía: 0 diagnósticos');
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000007","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"empresa"}';
select is((select count(*) from public.diagnostics), 1::bigint, 'empresa con membresía: 1 diagnóstico');

-- Crear -> leer: el creador equipo recibe membresía.
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000006","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"equipo"}';
select lives_ok($sql$
  insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio,
    fecha_fin, index_version_id)
  values ('d2000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-0000000000a1',
    'b2000000-0000-4000-8000-0000000000a1','inicial','2026-01-01','2026-02-12',
    '00000000-0000-4000-8000-0000000000a1')
$sql$, 'equipo puede crear diagnóstico (RES-1)');
select is((select count(*) from public.diagnostics where id='d2000000-0000-4000-8000-000000000004'), 1::bigint,
  'equipo creador ve su diagnóstico (crear -> leer)');
select is((select count(*) from public.project_members
  where diagnostic_id='d2000000-0000-4000-8000-000000000004'
    and user_id='c3000000-0000-4000-8000-000000000006'), 1::bigint,
  'creador equipo recibe membresía');

-- Invitado: una membresía y role=observador.
reset role;
reset request.jwt.claims;
select throws_ok($sql$
  insert into public.project_members (diagnostic_id, user_id, organization_id, role)
  values ('d2000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-0000000000a1','observador')
$sql$, '42501', NULL, 'invitado no puede tener una segunda membresía');
select throws_ok($sql$
  insert into public.project_members (diagnostic_id, user_id, organization_id, role)
  values ('d2000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-0000000000a1','equipo')
$sql$, '42501', NULL, 'invitado solo admite role=observador');

reset role;
reset request.jwt.claims;
select * from finish();
rollback;
