-- F1 task-35 — pgTAP: alcance de `invitado` (Q-02/SEC-PR7-D2)
-- Matriz: diagnostics membresía/agregado SRHDS; profiles invitado solo suyo;
-- companies EXISTS; resto de tenant-wide invitado solo con membresía.
begin;

select plan(68);

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
  ('c3000000-0000-4000-8000-000000000007','authenticated','authenticated','emp35@example.invalid',now(),now()),
  ('c3000000-0000-4000-8000-000000000008','authenticated','authenticated','coordnomem@example.invalid',now(),now()),
  ('c3000000-0000-4000-8000-000000000009','authenticated','authenticated','nuevoperfil@example.invalid',now(),now());
insert into public.profiles (user_id, organization_id, full_name, email, global_role) values
  ('c3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-0000000000a1','Invitado 0','inv0@example.invalid','invitado'),
  ('c3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-0000000000a1','Invitado 1','inv1@example.invalid','invitado'),
  ('c3000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-0000000000a1','Observador','obs35@example.invalid','observador'),
  ('c3000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-0000000000a1','Coordinador','coord35@example.invalid','coordinador_srhds'),
  ('c3000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-0000000000a1','Admin','admin35@example.invalid','admin_institucional'),
  ('c3000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-0000000000a1','Equipo','equip35@example.invalid','equipo'),
  ('c3000000-0000-4000-8000-000000000007','a1000000-0000-4000-8000-0000000000a1','Empresa','emp35@example.invalid','empresa'),
  ('c3000000-0000-4000-8000-000000000008','a1000000-0000-4000-8000-0000000000a1','Coord sin membresía','coordnomem@example.invalid','coordinador_srhds');
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

-- Fixtures de las 5 tablas auditadas (D1/D2 tenant A, D3 tenant B).
insert into public.documents (id, organization_id, diagnostic_id, doc_type, title,
  r2_key, sha256, mime, size_bytes, uploaded_by) values
  ('e4000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-0000000000a1','d2000000-0000-4000-8000-000000000001','otro','Doc D1','org/d1.pdf','abc','application/pdf',1,'c3000000-0000-4000-8000-000000000004'),
  ('e4000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-0000000000a1','d2000000-0000-4000-8000-000000000002','otro','Doc D2','org/d2.pdf','abc','application/pdf',1,'c3000000-0000-4000-8000-000000000004'),
  ('e4000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-0000000000b1','d2000000-0000-4000-8000-000000000003','otro','Doc D3','org/d3.pdf','abc','application/pdf',1,'c3000000-0000-4000-8000-000000000004');

insert into public.iih_assets (id, organization_id, diagnostic_id, folio, stage_code,
  asset_type_id, tag, ubicacion, estado_fisico, opera, criticidad, intervencion, prioridad)
values ('e4000000-0000-4000-8000-000000000011','a1000000-0000-4000-8000-0000000000a1',
  'd2000000-0000-4000-8000-000000000001','CAP-35-01','CAP',
  (select id from public.iih_asset_types where stage_code='CAP' limit 1),
  'T35','U','bueno','si','alta','ninguna','media');

insert into public.samples (id, organization_id, diagnostic_id, codigo, punto,
  tipo_muestra, params_solicitados, acreditacion_ema, estado)
values ('e4000000-0000-4000-8000-000000000021','a1000000-0000-4000-8000-0000000000a1',
  'd2000000-0000-4000-8000-000000000001','T35-M1','descarga_final','simple','[]'::jsonb,false,'planificada');

insert into public.signatures (id, organization_id, document_id, signer_name,
  signer_role, signer_org) values
  ('e4000000-0000-4000-8000-000000000031','a1000000-0000-4000-8000-0000000000a1','e4000000-0000-4000-8000-000000000001','Firma D1','coordinador','SRHDS'),
  ('e4000000-0000-4000-8000-000000000032','a1000000-0000-4000-8000-0000000000a1','e4000000-0000-4000-8000-000000000002','Firma D2','coordinador','SRHDS');

insert into public.water_balances (id, organization_id, diagnostic_id, periodo_anio, mes_inicio, estado)
values ('e4000000-0000-4000-8000-000000000041','a1000000-0000-4000-8000-0000000000a1','d2000000-0000-4000-8000-000000000001',2026,1,'borrador');

set local role authenticated;

-- Invitado sin membresía: sin tenant-wide.
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000001","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"invitado"}';
select is((select count(*) from public.diagnostics), 0::bigint, 'invitado sin membresía: 0 diagnósticos');
select is((select count(*) from public.profiles), 1::bigint, 'invitado sin membresía: solo su perfil');
select is((select count(*) from public.companies), 0::bigint, 'invitado sin membresía: 0 empresas');
select is((select count(*) from public.v_diagnostic_completeness), 0::bigint, 'invitado sin membresía: vista completeness 0');
select is((select count(*) from public.v_bhe_monthly), 0::bigint, 'invitado sin membresía: vista BHE 0');
select is((select count(*) from public.documents), 0::bigint, 'M2 invitado sin membresía: 0 documents');
select is((select count(*) from public.iih_assets), 0::bigint, 'M2 invitado sin membresía: 0 iih_assets');
select is((select count(*) from public.samples), 0::bigint, 'M2 invitado sin membresía: 0 samples');
select is((select count(*) from public.signatures), 0::bigint, 'M2 invitado sin membresía: 0 signatures');
select is((select count(*) from public.water_balances), 0::bigint, 'M2 invitado sin membresía: 0 water_balances');

-- Invitado con membresía (role observador): solo su diagnóstico/empresa.
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000002","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"invitado"}';
select is((select count(*) from public.diagnostics), 1::bigint, 'invitado con membresía: 1 diagnóstico');
select is((select count(*) from public.companies), 1::bigint, 'invitado con membresía: 1 empresa');
select is((select count(*) from public.profiles), 1::bigint, 'invitado con membresía: solo su perfil');
select is((select count(*) from public.v_diagnostic_completeness), 1::bigint, 'invitado con membresía: completeness 1');
select is((select count(*) from public.documents), 1::bigint, 'M2 invitado con membresía: 1 document');
select is((select count(*) from public.iih_assets), 1::bigint, 'M2 invitado con membresía: 1 iih_asset');
select is((select count(*) from public.samples), 1::bigint, 'M2 invitado con membresía: 1 sample');
select is((select count(*) from public.signatures), 1::bigint, 'M2 invitado con membresía: 1 signature');
select is((select count(*) from public.water_balances), 1::bigint, 'M2 invitado con membresía: 1 water_balance');
select is((select count(*) from public.signatures where id='e4000000-0000-4000-8000-000000000032'), 0::bigint,
  'M2 signatures de otro diagnóstico: 0');

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
select is((select count(*) from public.companies), 2::bigint, 'admin: 2 empresas del tenant (agregado)');
select is((select count(*) from public.documents), 0::bigint, 'M2 admin sin membresía: 0 documents');
select is((select count(*) from public.iih_assets), 0::bigint, 'M2 admin sin membresía: 0 iih_assets');
select is((select count(*) from public.samples), 0::bigint, 'M2 admin sin membresía: 0 samples');
select is((select count(*) from public.signatures), 0::bigint, 'M2 admin sin membresía: 0 signatures');
select is((select count(*) from public.water_balances), 0::bigint, 'M2 admin sin membresía: 0 water_balances');

-- Coordinador sin membresía: tampoco tiene agregado en las 5 tablas.
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000008","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select is((select count(*) from public.documents), 0::bigint, 'M2 coordinador sin membresía: 0 documents');
select is((select count(*) from public.iih_assets), 0::bigint, 'M2 coordinador sin membresía: 0 iih_assets');
select is((select count(*) from public.samples), 0::bigint, 'M2 coordinador sin membresía: 0 samples');
select is((select count(*) from public.signatures), 0::bigint, 'M2 coordinador sin membresía: 0 signatures');
select is((select count(*) from public.water_balances), 0::bigint, 'M2 coordinador sin membresía: 0 water_balances');

-- Equipo sin membresía: 0; empresa con membresía: 1.
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000006","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"equipo"}';
select is((select count(*) from public.diagnostics), 0::bigint, 'equipo sin membresía: 0 diagnósticos');
select is((select count(*) from public.companies), 0::bigint, 'equipo sin membresía: 0 companies (VETO-4)');
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000007","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"empresa"}';
select is((select count(*) from public.diagnostics), 1::bigint, 'empresa con membresía: 1 diagnóstico');
select is((select count(*) from public.companies), 1::bigint, 'empresa con membresía: 1 company');

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

-- VETO-2: sin claim de global_role no hay lectura tenant-wide.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000001","organization_id":"a1000000-0000-4000-8000-0000000000a1"}';
select is((select count(*) from public.profiles), 0::bigint, 'VETO-2 sin claim: 0 profiles');
select is((select count(*) from public.documents), 0::bigint, 'VETO-2 sin claim: 0 documents');
select is((select count(*) from public.iih_assets), 0::bigint, 'VETO-2 sin claim: 0 iih_assets');
select is((select count(*) from public.samples), 0::bigint, 'VETO-2 sin claim: 0 samples');
select is((select count(*) from public.signatures), 0::bigint, 'VETO-2 sin claim: 0 signatures');
select is((select count(*) from public.water_balances), 0::bigint, 'VETO-2 sin claim: 0 water_balances');

-- VETO-1/B1: UPDATE de membresía de invitado bloqueado (role/diagnóstico).
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000004","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select throws_ok($sql$
  update public.project_members set role='coordinador'
   where diagnostic_id='d2000000-0000-4000-8000-000000000001'
     and user_id='c3000000-0000-4000-8000-000000000002'
$sql$, '42501', NULL, 'VETO-1: invitado no puede pasar a role coordinador');
select throws_ok($sql$
  update public.project_members set diagnostic_id='d2000000-0000-4000-8000-000000000002'
   where diagnostic_id='d2000000-0000-4000-8000-000000000001'
     and user_id='c3000000-0000-4000-8000-000000000002'
$sql$, '42501', NULL, 'VETO-1: invitado no puede moverse a otro diagnóstico');
select is((select count(*) from public.documents where id='e4000000-0000-4000-8000-000000000003'), 0::bigint,
  'M2 cross-tenant: documento de otro tenant no visible');

-- VETO-3: solo admin cambia global_role.
select throws_ok($sql$
  update public.profiles set global_role='coordinador_srhds'
   where user_id='c3000000-0000-4000-8000-000000000001'
$sql$, '42501', NULL, 'VETO-3: coordinador no puede promover invitado a staff');
select lives_ok($sql$
  update public.profiles set full_name='Invitado 0 OK'
   where user_id='c3000000-0000-4000-8000-000000000001'
$sql$, 'VETO-3: coordinador sí puede actualizar full_name');
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000005","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"admin_institucional"}';
select lives_ok($sql$
  update public.profiles set global_role='coordinador_srhds'
   where user_id='c3000000-0000-4000-8000-000000000001'
$sql$, 'VETO-3: admin sí puede cambiar global_role');
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000004","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select lives_ok($sql$
  insert into public.profiles (user_id, organization_id, full_name, email, global_role)
  values ('c3000000-0000-4000-8000-000000000009','a1000000-0000-4000-8000-0000000000a1',
    'Nuevo perfil','nuevoperfil@example.invalid','equipo')
$sql$, 'VETO-3: coordinador sí puede insertar perfil no-admin');

-- M1: escrituras legítimas con membresía y denegadas sin membresía.
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000005","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"admin_institucional"}';
select throws_ok($sql$
  insert into public.documents (id, organization_id, diagnostic_id, doc_type, title, r2_key, sha256, mime, size_bytes, uploaded_by)
  values ('e4000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-0000000000a1','d2000000-0000-4000-8000-000000000001','otro','Doc write','org/w.pdf','abc','application/pdf',1,'c3000000-0000-4000-8000-000000000005')
$sql$, '42501', NULL, 'M1 admin sin membresía: INSERT documents denegado');
select throws_ok($sql$
  insert into public.iih_assets (id, organization_id, diagnostic_id, folio, stage_code, asset_type_id, tag, ubicacion, estado_fisico, opera, criticidad, intervencion, prioridad)
  values ('e4000000-0000-4000-8000-000000000012','a1000000-0000-4000-8000-0000000000a1','d2000000-0000-4000-8000-000000000001','CAP-35-02','CAP',(select id from public.iih_asset_types where stage_code='CAP' limit 1),'T35W','U','bueno','si','alta','ninguna','media')
$sql$, '42501', NULL, 'M1 admin sin membresía: INSERT iih_assets denegado');
select throws_ok($sql$
  insert into public.samples (id, organization_id, diagnostic_id, codigo, punto, tipo_muestra, params_solicitados, acreditacion_ema, estado)
  values ('e4000000-0000-4000-8000-000000000022','a1000000-0000-4000-8000-0000000000a1','d2000000-0000-4000-8000-000000000001','T35-W','descarga_final','simple','[]'::jsonb,false,'planificada')
$sql$, '42501', NULL, 'M1 admin sin membresía: INSERT samples denegado');
select throws_ok($sql$
  insert into public.water_balances (id, organization_id, diagnostic_id, periodo_anio, mes_inicio, estado)
  values ('e4000000-0000-4000-8000-000000000042','a1000000-0000-4000-8000-0000000000a1','d2000000-0000-4000-8000-000000000001',2026,2,'borrador')
$sql$, '42501', NULL, 'M1 admin sin membresía: INSERT water_balances denegado');
select throws_ok($sql$
  insert into public.signatures (id, organization_id, document_id, signer_name, signer_role, signer_org)
  values ('e4000000-0000-4000-8000-000000000033','a1000000-0000-4000-8000-0000000000a1','e4000000-0000-4000-8000-000000000001','Firma W','coordinador','SRHDS')
$sql$, '42501', NULL, 'M1 admin sin membresía: INSERT signatures denegado');

set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000004","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"coordinador_srhds"}';
select lives_ok($sql$
  insert into public.documents (id, organization_id, diagnostic_id, doc_type, title, r2_key, sha256, mime, size_bytes, uploaded_by)
  values ('e4000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-0000000000a1','d2000000-0000-4000-8000-000000000001','otro','Doc write OK','org/wok.pdf','abc','application/pdf',1,'c3000000-0000-4000-8000-000000000004')
$sql$, 'M1 coordinador con membresía: INSERT documents OK');
select lives_ok($sql$
  insert into public.iih_assets (id, organization_id, diagnostic_id, folio, stage_code, asset_type_id, tag, ubicacion, estado_fisico, opera, criticidad, intervencion, prioridad)
  values ('e4000000-0000-4000-8000-000000000013','a1000000-0000-4000-8000-0000000000a1','d2000000-0000-4000-8000-000000000001','CAP-35-03','CAP',(select id from public.iih_asset_types where stage_code='CAP' limit 1),'T35W2','U','bueno','si','alta','ninguna','media')
$sql$, 'M1 coordinador con membresía: INSERT iih_assets OK');
select lives_ok($sql$
  insert into public.samples (id, organization_id, diagnostic_id, codigo, punto, tipo_muestra, params_solicitados, acreditacion_ema, estado)
  values ('e4000000-0000-4000-8000-000000000023','a1000000-0000-4000-8000-0000000000a1','d2000000-0000-4000-8000-000000000001','T35-W2','descarga_final','simple','[]'::jsonb,false,'planificada')
$sql$, 'M1 coordinador con membresía: INSERT samples OK');
select lives_ok($sql$
  insert into public.water_balances (id, organization_id, diagnostic_id, periodo_anio, mes_inicio, estado)
  values ('e4000000-0000-4000-8000-000000000043','a1000000-0000-4000-8000-0000000000a1','d2000000-0000-4000-8000-000000000001',2027,2,'borrador')
$sql$, 'M1 coordinador con membresía: INSERT water_balances OK');
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-000000000001","organization_id":"a1000000-0000-4000-8000-0000000000a1","global_role":"invitado"}';
select throws_ok($sql$
  insert into public.companies (id, organization_id, razon_social, nombre_planta, giro, calle, colonia_parque, cp, municipio, organismo_operador)
  values ('b2000000-0000-4000-8000-0000000000a3','a1000000-0000-4000-8000-0000000000a1','Empresa W','Planta W','manufacturera','Calle','Parque','87000','Victoria','COMAPA')
$sql$, '42501', NULL, 'M1 invitado no puede INSERT companies');

reset role;
reset request.jwt.claims;
select * from finish();
rollback;
