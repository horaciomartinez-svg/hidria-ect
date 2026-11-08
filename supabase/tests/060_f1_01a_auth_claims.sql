-- F1-01a — pgTAP: helpers de claims, seed sintético, roles y aislamiento
-- SEC-01/SEC-02 (RLS) y base de SEC-04 (sin claim: helpers null/false; el 401
-- es del middleware EF, task-21).
begin;

select plan(46);

-- Seed sintético (idempotente, emails .invalid)
select is((select count(*) from auth.users
  where id in ('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',
               'a1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000004',
               'a1000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000006')), 6::bigint,
  'seed: 6 usuarios auth sintéticos');
select is((select count(*) from public.profiles
  where user_id::text like 'a1000000-0000-4000-8000-00000000000%'), 6::bigint,
  'seed: 6 perfiles sintéticos');
select is((select count(distinct global_role) from public.profiles
  where user_id::text like 'a1000000-0000-4000-8000-00000000000%'), 6::bigint,
  'seed: los 6 global_role del CHECK');
select is((select count(*) from public.project_members
  where diagnostic_id in ('c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002')),
  6::bigint, 'seed: 6 membresías para los diagnósticos sintéticos');
select is((select count(*) from public.diagnostics
  where id in ('c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002')),
  2::bigint, 'seed: 2 diagnósticos sintéticos');

-- Claims canónicos: organization_id con precedencia; tenant_id alias.
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000002","organization_id":"00000000-0000-4000-8000-000000000001","global_role":"equipo"}';
select is(public.current_org_id(), '00000000-0000-4000-8000-000000000001'::uuid,
  'current_org_id usa organization_id');
select is(public.current_global_role(), 'equipo', 'current_global_role usa global_role');
select ok(public.has_global_role('equipo'), 'has_global_role true para equipo');
select ok(not public.has_global_role('admin_institucional'), 'has_global_role false para admin');
select ok(public.is_tenant_member('00000000-0000-4000-8000-000000000001'),
  'is_tenant_member true con organization_id');

set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000002","tenant_id":"00000000-0000-4000-8000-000000000001","global_role":"equipo"}';
select is(public.current_org_id(), '00000000-0000-4000-8000-000000000001'::uuid,
  'current_org_id acepta tenant_id como alias');
select ok(public.is_tenant_member('00000000-0000-4000-8000-000000000001'),
  'is_tenant_member true con tenant_id');

set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000002","organization_id":"00000000-0000-4000-8000-000000000001","tenant_id":"00000000-0000-4000-8000-0000000000ff","global_role":"equipo"}';
select is(public.current_org_id(), '00000000-0000-4000-8000-000000000001'::uuid,
  'organization_id tiene precedencia sobre tenant_id');
select ok(not public.is_tenant_member('00000000-0000-4000-8000-0000000000ff'),
  'el alias tenant_id distinto no habilita el tenant';

set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000002"}';
select is(public.current_org_id(), NULL::uuid, 'current_org_id null sin claim de tenant');
select is(public.is_tenant_member('00000000-0000-4000-8000-000000000001'), false,
  'is_tenant_member false sin claim de tenant');
select is(public.current_global_role(), NULL::text, 'current_global_role null sin claim');

-- B1: los helpers de rol fallan cerrado sin claim (NULL/''/array['']).
select is(public.has_global_role(NULL), false, 'has_global_role(NULL) false sin claim');
select is(public.has_global_role(''), false, 'has_global_role('''') false sin claim');
select is(public.has_any_global_role(array['']), false, 'has_any_global_role(array['''']) false sin claim');
select is(public.has_any_global_role(array[]::text[]), false, 'has_any_global_role(array[]) false sin claim');

set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000002","organization_id":"","global_role":""}';
select is(public.current_global_role(), NULL::text, 'current_global_role null con claim vacío');
select is(public.current_org_id(), NULL::uuid, 'current_org_id null con organization_id vacío');
select is(public.has_global_role(NULL), false, 'has_global_role(NULL) false con claim vacío');
select is(public.has_global_role(''), false, 'has_global_role('''') false con claim vacío');
select is(public.has_any_global_role(array['']), false, 'has_any_global_role(array['''']) false con claim vacío');

-- Con claim equipo: roles válidos true; NULL/''/array[''] false.
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000002","global_role":"equipo"}';
select ok(public.has_global_role('equipo'), 'has_global_role(''equipo'') true con equipo');
select ok(public.has_any_global_role(array['equipo']), 'has_any_global_role([''equipo'']) true con equipo');
select is(public.has_global_role(NULL), false, 'has_global_role(NULL) false con claim equipo');
select is(public.has_global_role(''), false, 'has_global_role('''') false con claim equipo');
select is(public.has_any_global_role(array['']), false, 'has_any_global_role(array['''']) false con claim equipo');

-- M2: sexto rol global, invitado.
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000006","organization_id":"00000000-0000-4000-8000-000000000001","global_role":"invitado"}';
select is(public.current_global_role(), 'invitado', 'current_global_role = invitado');
select ok(public.has_global_role('invitado'), 'has_global_role(''invitado'') true');
select ok(public.has_any_global_role(array['invitado']), 'has_any_global_role([''invitado'']) true');

set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000002","organization_id":"no-es-uuid"}';
select is(public.current_org_id(), NULL::uuid, 'claim de tenant inválido no rompe el helper');

-- RLS con claims canónicos (SEC-01/SEC-02)
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001","organization_id":"00000000-0000-4000-8000-000000000001","global_role":"coordinador_srhds"}';
select is((select count(*) from public.organizations), 1::bigint,
  'RLS: organizaciones del tenant = 1');
select is((select count(*) from public.profiles), 6::bigint,
  'RLS: perfiles del tenant = 6');
select is((select count(*) from public.diagnostics), 2::bigint,
  'RLS: diagnósticos del tenant = 2');
select is((select count(*) from public.companies), 1::bigint,
  'RLS: empresas del tenant = 1');
select is(public.my_diagnostic_role('c1000000-0000-4000-8000-000000000001'), 'coordinador',
  'rol de diagnóstico del usuario sembrado');
select ok(public.is_diagnostic_member('c1000000-0000-4000-8000-000000000001'),
  'membresía al diagnóstico sembrado');

set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001"}';
select is((select count(*) from public.diagnostics), 0::bigint,
  'RLS: sin claim de tenant no hay diagnósticos');
select is((select count(*) from public.organizations), 0::bigint,
  'RLS: sin claim de tenant no hay organizaciones');

set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001","tenant_id":"00000000-0000-4000-8000-000000000001","global_role":"coordinador_srhds"}';
select is((select count(*) from public.diagnostics), 2::bigint,
  'RLS: tenant_id alias también aísla correctamente');

set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001","organization_id":"00000000-0000-4000-8000-0000000000ff","global_role":"coordinador_srhds"}';
select is((select count(*) from public.diagnostics), 0::bigint,
  'RLS: tenant ajeno = 0 filas (SEC-02)');

set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000002","organization_id":"00000000-0000-4000-8000-000000000001","global_role":"equipo"}';
select ok(not public.has_any_global_role(array[]::text[]),
  'has_any_global_role false con lista vacía');

reset role;
reset request.jwt.claims;
select * from finish();
rollback;
