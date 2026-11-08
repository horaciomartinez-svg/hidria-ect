-- ============================================================================
-- F1-01a — Auth: helpers de claims, alias organization_id/tenant_id y seed
--          sintético de profiles/project_members (ADR-005, SEC-01…04)
-- Forward-only. No edita migraciones aplicadas ni docs/02.
--   * Claims canónicos: organization_id (precedencia), tenant_id (alias),
--     global_role. El hook F1-00 ya emite los tres.
--   * Helpers SQL para RLS/EF; is_tenant_member acepta ambos claims.
--   * Seed 100% sintético (emails .invalid), idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helpers de claims (ADR-005)
-- ---------------------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    case
      when pg_input_is_valid(auth.jwt() ->> 'organization_id', 'uuid')
        then (auth.jwt() ->> 'organization_id')::uuid
    end,
    case
      when pg_input_is_valid(auth.jwt() ->> 'tenant_id', 'uuid')
        then (auth.jwt() ->> 'tenant_id')::uuid
    end
  );
$$;

create or replace function public.current_global_role()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select nullif(auth.jwt() ->> 'global_role', '');
$$;

create or replace function public.has_global_role(p_role text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(public.current_global_role(), '') = coalesce(p_role, '');
$$;

create or replace function public.has_any_global_role(p_roles text[])
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(public.current_global_role(), '') = any(coalesce(p_roles, array[]::text[]));
$$;

-- Aislamiento por tenant: organization_id canónico, tenant_id como alias.
create or replace function public.is_tenant_member(p_organization_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select p_organization_id is not null
     and p_organization_id = public.current_org_id();
$$;

revoke all on function public.current_org_id() from public, anon;
revoke all on function public.current_global_role() from public, anon;
revoke all on function public.has_global_role(text) from public, anon;
revoke all on function public.has_any_global_role(text[]) from public, anon;
revoke all on function public.is_tenant_member(uuid) from public, anon;

grant execute on function public.current_org_id() to authenticated, service_role;
grant execute on function public.current_global_role() to authenticated, service_role;
grant execute on function public.has_global_role(text) to authenticated, service_role;
grant execute on function public.has_any_global_role(text[]) to authenticated, service_role;
grant execute on function public.is_tenant_member(uuid) to authenticated, service_role;

comment on function public.current_org_id() is
  'F1-01a/ADR-005: organization_id si existe; si no, tenant_id. Null sin claim.';
comment on function public.current_global_role() is
  'F1-01a/ADR-005: global_role del JWT. Null si no existe.';
comment on function public.has_global_role(text) is
  'F1-01a: true si el global_role del JWT es el indicado.';
comment on function public.has_any_global_role(text[]) is
  'F1-01a: true si el global_role del JWT está en la lista.';

-- ---------------------------------------------------------------------------
-- 2. Seed sintético (solo dev/staging; emails .invalid; idempotente)
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('a1000000-0000-4000-8000-000000000001','authenticated','authenticated','coordinador.sintetico@example.invalid',now(),now(),now()),
  ('a1000000-0000-4000-8000-000000000002','authenticated','authenticated','equipo.sintetico@example.invalid',now(),now(),now()),
  ('a1000000-0000-4000-8000-000000000003','authenticated','authenticated','empresa.sintetica@example.invalid',now(),now(),now()),
  ('a1000000-0000-4000-8000-000000000004','authenticated','authenticated','observador.sintetico@example.invalid',now(),now(),now()),
  ('a1000000-0000-4000-8000-000000000005','authenticated','authenticated','admin.sintetico@example.invalid',now(),now(),now())
on conflict (id) do nothing;

insert into public.profiles (user_id, organization_id, full_name, email, global_role)
values
  ('a1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Coordinador Sintético','coordinador.sintetico@example.invalid','coordinador_srhds'),
  ('a1000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Equipo Sintético','equipo.sintetico@example.invalid','equipo'),
  ('a1000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Empresa Sintética','empresa.sintetica@example.invalid','empresa'),
  ('a1000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Observador Sintético','observador.sintetico@example.invalid','observador'),
  ('a1000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','Admin Sintético','admin.sintetico@example.invalid','admin_institucional')
on conflict (user_id) do nothing;

insert into public.companies (id, organization_id, razon_social, nombre_planta, giro,
  calle, colonia_parque, cp, municipio, organismo_operador)
values ('b1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
  'Empresa Sintética A','Planta Sintética A','manufacturera','Calle Sintética 1',
  'Parque Sintético','87000','Victoria','COMAPA')
on conflict (id) do nothing;

insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio,
  fecha_fin, index_version_id)
values
  ('c1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12',
   (select id from public.ivoh_index_versions where vigente order by version desc limit 1)),
  ('c1000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000001','seguimiento','2026-03-01','2026-04-12',
   (select id from public.ivoh_index_versions where vigente order by version desc limit 1))
on conflict (id) do nothing;

insert into public.project_members (diagnostic_id, user_id, organization_id, role)
values
  ('c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','coordinador'),
  ('c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','equipo'),
  ('c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','empresa'),
  ('c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','observador'),
  ('c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','coordinador'),
  ('c1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','coordinador')
on conflict (diagnostic_id, user_id) do nothing;

comment on table public.profiles is
  'F1-01a: seed sintético de 5 perfiles (global_role de todos los roles) para staging; emails .invalid.';
