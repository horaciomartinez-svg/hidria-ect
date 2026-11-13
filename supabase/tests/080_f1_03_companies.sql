-- F1-03a — pgTAP: companies M1, ownership creador y contraparte (task-80)
-- B2 create→read, SEC-PR32-06 helper cross-tenant y SEC-PR35-01 contraparte.
begin;

select plan(24);

-- Fixtures sintéticas (postgres)
insert into public.organizations (id, name, org_type) values
  ('a4000000-0000-4000-8000-0000000000a1','Org Emp A','srhds'),
  ('a4000000-0000-4000-8000-0000000000b1','Org Emp B','empresa');
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('c4000000-0000-4000-8000-000000000001','authenticated','authenticated','coord80@example.invalid',now(),now()),
  ('c4000000-0000-4000-8000-000000000002','authenticated','authenticated','equipo80@example.invalid',now(),now()),
  ('c4000000-0000-4000-8000-000000000003','authenticated','authenticated','admin80@example.invalid',now(),now()),
  ('c4000000-0000-4000-8000-000000000004','authenticated','authenticated','empresa80a@example.invalid',now(),now()),
  ('c4000000-0000-4000-8000-000000000005','authenticated','authenticated','empresa80b@example.invalid',now(),now()),
  ('c4000000-0000-4000-8000-000000000006','authenticated','authenticated','obs80@example.invalid',now(),now()),
  ('c4000000-0000-4000-8000-000000000007','authenticated','authenticated','inv80@example.invalid',now(),now());
insert into public.profiles (user_id, organization_id, full_name, email, global_role) values
  ('c4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-0000000000a1','Coord','coord80@example.invalid','coordinador_srhds'),
  ('c4000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-0000000000a1','Equipo','equipo80@example.invalid','equipo'),
  ('c4000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-0000000000a1','Admin','admin80@example.invalid','admin_institucional'),
  ('c4000000-0000-4000-8000-000000000004','a4000000-0000-4000-8000-0000000000a1','Empresa A','empresa80a@example.invalid','empresa'),
  ('c4000000-0000-4000-8000-000000000005','a4000000-0000-4000-8000-0000000000b1','Empresa B','empresa80b@example.invalid','empresa'),
  ('c4000000-0000-4000-8000-000000000006','a4000000-0000-4000-8000-0000000000a1','Observador','obs80@example.invalid','observador'),
  ('c4000000-0000-4000-8000-000000000007','a4000000-0000-4000-8000-0000000000a1','Invitado','inv80@example.invalid','invitado');
insert into public.companies (id, organization_id, razon_social, nombre_planta, giro,
  calle, colonia_parque, cp, municipio, organismo_operador, contraparte_user_id) values
  ('b4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-0000000000a1','Empresa A1','Planta A1','manufacturera','Calle','Parque','87000','Victoria','COMAPA','c4000000-0000-4000-8000-000000000004'),
  ('b4000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-0000000000a1','Empresa A2','Planta A2','manufacturera','Calle','Parque','87000','Victoria','COMAPA',NULL),
  ('b4000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-0000000000b1','Empresa B1','Planta B1','manufacturera','Calle','Parque','87000','Victoria','COMAPA','c4000000-0000-4000-8000-000000000005');
insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio, fecha_fin, index_version_id)
values ('d4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-0000000000a1','b4000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1');
insert into public.project_members (diagnostic_id, user_id, organization_id, role) values
  ('d4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000006','a4000000-0000-4000-8000-0000000000a1','observador'),
  ('d4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-0000000000a1','coordinador');

set local role authenticated;

-- Agregado SRHDS y ownership.
set local request.jwt.claims = '{"sub":"c4000000-0000-4000-8000-000000000001","organization_id":"a4000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select is((select count(*) from public.companies), 2::bigint, 'coordinador: 2 empresas del tenant');
select is((select count(*) from public.companies where id='b4000000-0000-4000-8000-000000000003'), 0::bigint, 'coordinador no ve empresa de otro tenant');
select ok(public.company_in_tenant('b4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-0000000000a1'), 'company_in_tenant same tenant true');
select ok(not public.company_in_tenant('b4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-0000000000b1'), 'SEC-PR32-06 cross-tenant false');

set local request.jwt.claims = '{"sub":"c4000000-0000-4000-8000-000000000003","organization_id":"a4000000-0000-4000-8000-0000000000a1","global_role":"admin_institucional"}';
select is((select count(*) from public.companies), 2::bigint, 'admin: 2 empresas del tenant');

set local request.jwt.claims = '{"sub":"c4000000-0000-4000-8000-000000000004","organization_id":"a4000000-0000-4000-8000-0000000000a1","global_role":"empresa"}';
select is((select count(*) from public.companies), 1::bigint, 'empresa A: solo su empresa (contraparte)');
select is((select count(*) from public.companies where id='b4000000-0000-4000-8000-000000000003'), 0::bigint, 'empresa A no ve empresa de otro tenant');

set local request.jwt.claims = '{"sub":"c4000000-0000-4000-8000-000000000005","organization_id":"a4000000-0000-4000-8000-0000000000b1","global_role":"empresa"}';
select is((select count(*) from public.companies), 1::bigint, 'empresa B: solo su empresa');

set local request.jwt.claims = '{"sub":"c4000000-0000-4000-8000-000000000006","organization_id":"a4000000-0000-4000-8000-0000000000a1","global_role":"observador"}';
select is((select count(*) from public.companies), 1::bigint, 'observador con membresía: empresa de su diagnóstico');

set local request.jwt.claims = '{"sub":"c4000000-0000-4000-8000-000000000007","organization_id":"a4000000-0000-4000-8000-0000000000a1","global_role":"invitado"}';
select is((select count(*) from public.companies), 0::bigint, 'invitado: 0 empresas');

-- B2: crear→leer empresa por equipo (sin membresía).
set local request.jwt.claims = '{"sub":"c4000000-0000-4000-8000-000000000002","organization_id":"a4000000-0000-4000-8000-0000000000a1","global_role":"equipo"}';
select is((select count(*) from public.companies), 0::bigint, 'equipo sin empresas: 0');
select lives_ok($sql$
  insert into public.companies (id, organization_id, razon_social, nombre_planta, giro,
    calle, colonia_parque, cp, municipio, organismo_operador)
  values ('b4000000-0000-4000-8000-000000000004','a4000000-0000-4000-8000-0000000000a1',
    'Empresa Creada','Planta C','manufacturera','Calle','Parque','87000','Victoria','COMAPA')
$sql$, 'equipo crea empresa (B2)');
select is((select count(*) from public.companies where id='b4000000-0000-4000-8000-000000000004'), 1::bigint,
  'equipo creador lee su empresa (create→read)');
select is((select created_by from public.companies where id='b4000000-0000-4000-8000-000000000004'),
  'c4000000-0000-4000-8000-000000000002'::uuid, 'created_by server-side = creador');

set local request.jwt.claims = '{"sub":"c4000000-0000-4000-8000-000000000001","organization_id":"a4000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select is((select count(*) from public.companies), 3::bigint, 'coordinador ve 3 tras el alta');

-- SEC-PR35-01: contraparte validada y solo admin/coord.
select lives_ok($sql$
  insert into public.companies (id, organization_id, razon_social, nombre_planta, giro,
    calle, colonia_parque, cp, municipio, organismo_operador, contraparte_user_id)
  values ('b4000000-0000-4000-8000-000000000005','a4000000-0000-4000-8000-0000000000a1',
    'Empresa Contraparte','Planta CC','manufacturera','Calle','Parque','87000','Victoria','COMAPA',
    'c4000000-0000-4000-8000-000000000004')
$sql$, 'coord inserta contraparte empresa válida');
select throws_ok($sql$
  insert into public.companies (id, organization_id, razon_social, nombre_planta, giro,
    calle, colonia_parque, cp, municipio, organismo_operador, contraparte_user_id)
  values ('b4000000-0000-4000-8000-000000000006','a4000000-0000-4000-8000-0000000000a1',
    'Empresa Mala','Planta M','manufacturera','Calle','Parque','87000','Victoria','COMAPA',
    'c4000000-0000-4000-8000-000000000002')
$sql$, '42501', NULL, 'contraparte no-empresa rechazada');
select throws_ok($sql$
  insert into public.companies (id, organization_id, razon_social, nombre_planta, giro,
    calle, colonia_parque, cp, municipio, organismo_operador, contraparte_user_id)
  values ('b4000000-0000-4000-8000-000000000007','a4000000-0000-4000-8000-0000000000a1',
    'Empresa Cross','Planta X','manufacturera','Calle','Parque','87000','Victoria','COMAPA',
    'c4000000-0000-4000-8000-000000000005')
$sql$, '42501', NULL, 'contraparte de otro tenant rechazada');
select throws_ok($sql$
  insert into public.companies (id, organization_id, razon_social, nombre_planta, giro,
    calle, colonia_parque, cp, municipio, organismo_operador)
  values ('b4000000-0000-4000-8000-000000000008','a4000000-0000-4000-8000-0000000000a1',
    'Empresa Inv','Planta I','manufacturera','Calle','Parque','87000','Victoria','COMAPA')
$sql$, '42501', NULL, 'invitado no puede crear empresa');

-- Empresa: actualiza su ficha, no la ajena ni la contraparte.
set local request.jwt.claims = '{"sub":"c4000000-0000-4000-8000-000000000004","organization_id":"a4000000-0000-4000-8000-0000000000a1","global_role":"empresa"}';
select lives_ok($sql$
  update public.companies set nombre_planta='Planta A1 OK'
   where id='b4000000-0000-4000-8000-000000000001'
$sql$, 'empresa actualiza su propia ficha');
with upd as (
  update public.companies set nombre_planta='No permitido'
   where id='b4000000-0000-4000-8000-000000000002' returning 1
) select is((select count(*) from upd), 0::bigint, 'empresa no actualiza empresa ajena');
select throws_ok($sql$
  update public.companies set contraparte_user_id='c4000000-0000-4000-8000-000000000005'
   where id='b4000000-0000-4000-8000-000000000001'
$sql$, '42501', NULL, 'empresa no puede cambiar contraparte');

-- Admin asigna contraparte y coordinador actualiza ciclo_vida.
set local request.jwt.claims = '{"sub":"c4000000-0000-4000-8000-000000000003","organization_id":"a4000000-0000-4000-8000-0000000000a1","global_role":"admin_institucional"}';
select lives_ok($sql$
  update public.companies set contraparte_user_id='c4000000-0000-4000-8000-000000000004'
   where id='b4000000-0000-4000-8000-000000000002'
$sql$, 'admin asigna contraparte válida');
set local request.jwt.claims = '{"sub":"c4000000-0000-4000-8000-000000000001","organization_id":"a4000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select lives_ok($sql$
  update public.companies set ciclo_vida='convenio_firmado'
   where id='b4000000-0000-4000-8000-000000000002'
$sql$, 'coordinador actualiza ciclo_vida (sin candado adicional)');

reset role;
reset request.jwt.claims;
select * from finish();
rollback;
